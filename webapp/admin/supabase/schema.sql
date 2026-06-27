-- ============================================================
--  JAMMIN JUNCTION — Supabase schema for the menu admin panel
--  Run this ONCE in Supabase → SQL Editor (New query → paste → Run)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- sections: category cards (sub_category IS NULL) and the
-- sub-category rail entries (sub_category set). Holds images,
-- display labels and ordering even for empty categories.
-- ------------------------------------------------------------
create table if not exists public.sections (
  id           uuid primary key default gen_random_uuid(),
  menu_type    text not null,                 -- 'regular' | 'happy'
  category     text not null,                 -- e.g. 'food','drinks','happy hours food'
  sub_category text,                           -- NULL => category-level card
  display_name text,
  image_url    text,
  sort_order   int  default 0,
  created_at   timestamptz default now()
);
create unique index if not exists sections_uq
  on public.sections (menu_type, category, coalesce(sub_category, ''));

-- ------------------------------------------------------------
-- items: every dish / drink
-- ------------------------------------------------------------
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  menu_type    text not null,                 -- 'regular' | 'happy'
  category     text not null,
  sub_category text not null,
  name         text not null,
  item_type    text not null default 'veg',   -- veg | non-veg | seafood | egg | alcoholic | non-alcoholic
  price        numeric,
  qty          jsonb not null default '{}'::jsonb,  -- price variants e.g. {"30 ML":"699","BOTTLE":"13999"}
  image_url    text,
  priority     int  default 0,
  is_active    boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists items_idx on public.items (menu_type, category, sub_category);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: public can READ, only logged-in admin can WRITE
-- ------------------------------------------------------------
alter table public.sections enable row level security;
alter table public.items    enable row level security;

drop policy if exists "read sections" on public.sections;
drop policy if exists "read items"    on public.items;
create policy "read sections" on public.sections for select using (true);
create policy "read items"    on public.items    for select using (true);

drop policy if exists "write sections" on public.sections;
drop policy if exists "write items"    on public.items;
create policy "write sections" on public.sections for all
  to authenticated using (true) with check (true);
create policy "write items" on public.items for all
  to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Storage bucket for uploaded images (public read, admin write)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "img public read"   on storage.objects;
drop policy if exists "img admin insert"  on storage.objects;
drop policy if exists "img admin update"  on storage.objects;
drop policy if exists "img admin delete"  on storage.objects;
create policy "img public read"  on storage.objects for select using (bucket_id = 'menu-images');
create policy "img admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'menu-images');
create policy "img admin update" on storage.objects for update to authenticated using (bucket_id = 'menu-images');
create policy "img admin delete" on storage.objects for delete to authenticated using (bucket_id = 'menu-images');
