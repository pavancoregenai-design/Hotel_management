-- ============================================================
--  JAMMIN JUNCTION — QR table-ordering schema (Phase 1 MVP)
--  Multi-hotel ready. Run ONCE in Supabase → SQL Editor,
--  AFTER schema.sql + seed.sql.
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- hotels (tenants) ----------
create table if not exists public.hotels (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  logo_url   text,
  theme      jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
insert into public.hotels (slug, name, logo_url)
values ('jammin-junction', 'JAMMIN JUNCTION BAR AND KITCHEN', 'assets/brand/logo.jpg')
on conflict (slug) do nothing;

-- ---------- attach the existing menu to the hotel ----------
alter table public.items    add column if not exists hotel_id uuid references public.hotels(id);
alter table public.sections add column if not exists hotel_id uuid references public.hotels(id);
update public.items    set hotel_id = (select id from public.hotels where slug='jammin-junction') where hotel_id is null;
update public.sections set hotel_id = (select id from public.hotels where slug='jammin-junction') where hotel_id is null;

-- ---------- tables (each gets a QR token) ----------
create table if not exists public.tables (
  id           uuid primary key default gen_random_uuid(),
  hotel_id     uuid not null references public.hotels(id) on delete cascade,
  table_number text not null,
  qr_token     text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_at   timestamptz default now()
);
-- seed a handful of tables for Jammin
insert into public.tables (hotel_id, table_number)
select (select id from public.hotels where slug='jammin-junction'), t
from unnest(array['1','2','3','4','5','6','7','8','VIP-1','VIP-2']) as t
where not exists (
  select 1 from public.tables tb
  where tb.hotel_id = (select id from public.hotels where slug='jammin-junction')
    and tb.table_number = t);

-- ---------- orders ----------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels(id) on delete cascade,
  table_id      uuid references public.tables(id),
  table_number  text,
  status        text not null default 'placed',  -- placed | preparing | ready | served | cancelled
  customer_name text,
  note          text,
  total         numeric default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists orders_board_idx on public.orders (hotel_id, status, created_at desc);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  name       text not null,
  variant    text,
  item_type  text,
  unit_price numeric not null default 0,
  qty        int not null default 1,
  line_total numeric not null default 0
);

-- ---------- staff (receptionist / waiter / manager) ----------
create table if not exists public.staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name     text,
  role     text not null default 'receptionist'  -- receptionist | waiter | manager
);

-- ---------- keep orders.updated_at fresh ----------
create or replace function public.touch_orders() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_orders();

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.hotels      enable row level security;
alter table public.tables      enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.staff       enable row level security;

-- public can read hotels + tables (menu bootstrapping / QR resolve)
drop policy if exists "read hotels" on public.hotels;
drop policy if exists "read tables" on public.tables;
create policy "read hotels" on public.hotels for select using (true);
create policy "read tables" on public.tables for select using (true);

-- customers (anon) can PLACE orders and read status
--   NOTE (MVP): read is open so a diner can track their order.
--   Harden later with a per-order token + RLS function.
drop policy if exists "anon place order"    on public.orders;
drop policy if exists "anon add items"      on public.order_items;
drop policy if exists "read orders"         on public.orders;
drop policy if exists "read order items"    on public.order_items;
create policy "anon place order" on public.orders      for insert with check (true);
create policy "anon add items"   on public.order_items for insert with check (true);
create policy "read orders"      on public.orders      for select using (true);
create policy "read order items" on public.order_items for select using (true);

-- staff can read their row + manage their hotel's orders/tables
drop policy if exists "staff read self"     on public.staff;
drop policy if exists "staff update orders" on public.orders;
drop policy if exists "staff manage tables" on public.tables;
create policy "staff read self" on public.staff for select to authenticated using (user_id = auth.uid());
create policy "staff update orders" on public.orders for update to authenticated
  using      (hotel_id in (select hotel_id from public.staff where user_id = auth.uid()))
  with check (hotel_id in (select hotel_id from public.staff where user_id = auth.uid()));
create policy "staff manage tables" on public.tables for all to authenticated
  using      (hotel_id in (select hotel_id from public.staff where user_id = auth.uid()))
  with check (hotel_id in (select hotel_id from public.staff where user_id = auth.uid()));

-- ============================================================
--  Realtime (push new/updated orders to the staff dashboard)
-- ============================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.orders';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.order_items';  exception when duplicate_object then null; end;
end $$;
