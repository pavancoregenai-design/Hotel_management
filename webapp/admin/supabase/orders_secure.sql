-- ============================================================
--  PRODUCTION HARDENING for QR ordering — run AFTER orders.sql
--  Makes order placement server-authoritative and locks down RLS.
--  Safe to re-run.
-- ============================================================

-- customer-facing tracking token (not guessable)
alter table public.orders add column if not exists track_token uuid not null default gen_random_uuid();

-- ------------------------------------------------------------
-- 1) Remove the permissive anon policies
-- ------------------------------------------------------------
drop policy if exists "anon place order" on public.orders;
drop policy if exists "anon add items"   on public.order_items;
drop policy if exists "read orders"      on public.orders;
drop policy if exists "read order items" on public.order_items;

-- staff may read their hotel's orders (drives the board + realtime)
drop policy if exists "staff read orders"      on public.orders;
drop policy if exists "staff read order items" on public.order_items;
create policy "staff read orders" on public.orders for select to authenticated
  using (hotel_id in (select hotel_id from public.staff where user_id = auth.uid()));
create policy "staff read order items" on public.order_items for select to authenticated
  using (order_id in (select id from public.orders o
                      where o.hotel_id in (select hotel_id from public.staff where user_id = auth.uid())));
-- NOTE: no INSERT/SELECT policy for anon on orders/order_items — they can ONLY
-- go through the security-definer functions below.

-- ------------------------------------------------------------
-- 2) place_order — the ONLY way a guest creates an order.
--    Validates the table, recomputes every price from the DB
--    (ignores anything the client claims), inserts atomically.
--    p_items = [{ "item_id": uuid, "variant": text|null, "qty": int }]
-- ------------------------------------------------------------
create or replace function public.place_order(
  p_table_token text,
  p_items       jsonb,
  p_name        text default null,
  p_note        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table   public.tables;
  v_order   public.orders;
  v_row     jsonb;
  v_it      public.items;
  v_variant text;
  v_qty     int;
  v_price   numeric;
  v_total   numeric := 0;
  v_lines   int := 0;
begin
  select * into v_table from public.tables where qr_token = p_table_token;
  if not found then raise exception 'invalid_table' using errcode = 'P0001'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;

  insert into public.orders (hotel_id, table_id, table_number, status, customer_name, note, total)
  values (v_table.hotel_id, v_table.id, v_table.table_number, 'placed',
          nullif(btrim(left(coalesce(p_name,''), 80)),  ''),
          nullif(btrim(left(coalesce(p_note,''), 300)), ''), 0)
  returning * into v_order;

  for v_row in select value from jsonb_array_elements(p_items) loop
    v_qty     := greatest(1, least(50, coalesce((v_row->>'qty')::int, 1)));
    v_variant := nullif(v_row->>'variant', '');
    select * into v_it from public.items
      where id = (v_row->>'item_id')::uuid
        and hotel_id = v_table.hotel_id and is_active = true;
    if not found then continue; end if;

    if v_variant is not null and (v_it.qty ? v_variant) then
      v_price := (v_it.qty->>v_variant)::numeric;
    else
      v_price := coalesce(v_it.price, 0);
      v_variant := null;
    end if;

    insert into public.order_items (order_id, name, variant, item_type, unit_price, qty, line_total)
    values (v_order.id, v_it.name, v_variant, v_it.item_type, v_price, v_qty, v_price * v_qty);
    v_total := v_total + v_price * v_qty;
    v_lines := v_lines + 1;
  end loop;

  if v_lines = 0 then
    delete from public.orders where id = v_order.id;
    raise exception 'no_valid_items' using errcode = 'P0001';
  end if;

  update public.orders set total = v_total where id = v_order.id;

  return jsonb_build_object(
    'order_id', v_order.id, 'track_token', v_order.track_token,
    'table_number', v_order.table_number, 'total', v_total, 'status', 'placed');
end $$;
grant execute on function public.place_order(text, jsonb, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3) get_order — guest reads ONLY their own order via track_token
-- ------------------------------------------------------------
create or replace function public.get_order(p_track_token uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.id, 'status', o.status, 'table_number', o.table_number,
    'total', o.total, 'created_at', o.created_at)
  from public.orders o where o.track_token = p_track_token;
$$;
grant execute on function public.get_order(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 4) resolve_table — guest gets the table number from the QR token
--    (so we don't have to expose the whole tables list)
-- ------------------------------------------------------------
create or replace function public.resolve_table(p_token text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('table_number', t.table_number, 'hotel_name', h.name)
  from public.tables t join public.hotels h on h.id = t.hotel_id
  where t.qr_token = p_token;
$$;
grant execute on function public.resolve_table(text) to anon, authenticated;

-- tighten tables: guests no longer need to read the table list directly
drop policy if exists "read tables" on public.tables;
create policy "staff read tables" on public.tables for select to authenticated
  using (hotel_id in (select hotel_id from public.staff where user_id = auth.uid()));
