# QR Table-Ordering — Setup (Phase 1 MVP)

Adds: scan-to-order, a live staff order board, and printable table QR codes.
Payment is **at the counter** (no online payment in this phase).

Prereq: you've already done `admin/SETUP.md` (menu is live on Supabase).

---

## 1. Create the ordering tables
Supabase → **SQL Editor → New query** → paste all of
**`admin/supabase/orders.sql`** → **Run**.

This creates `hotels`, `tables`, `orders`, `order_items`, `staff`, attaches your
menu to the hotel, seeds 10 tables, sets security rules, and turns on realtime.

## 2. Create staff logins
For each staff member (receptionist / waiter), do **both** steps:

**a) Create the auth user** — Supabase → **Authentication → Users → Add user**:
- Receptionist → email `reception@jamminjunction.app` + a password · ✅ Auto Confirm
- Waiter → email `waiter@jamminjunction.app` + a password · ✅ Auto Confirm

**b) Give them a role** — Supabase → **SQL Editor**, run:
```sql
insert into public.staff (user_id, hotel_id, role, name)
select u.id, (select id from public.hotels where slug='jammin-junction'), 'receptionist', 'Reception'
from auth.users u where u.email = 'reception@jamminjunction.app'
on conflict (user_id) do update set role = excluded.role;

insert into public.staff (user_id, hotel_id, role, name)
select u.id, (select id from public.hotels where slug='jammin-junction'), 'waiter', 'Waiter'
from auth.users u where u.email = 'waiter@jamminjunction.app'
on conflict (user_id) do update set role = excluded.role;
```
Roles: `receptionist` (hears the "new order" chime), `waiter` (hears the "ready"
chime), `manager` (hears both, sees everything).

## 3. Print the table QR codes
Open **`https://your-site/qr.html`** → **Print all**. Each table gets its own QR
that opens the menu at `…/?t=<token>` (auto-tagged to that table).

---

## How it runs day-to-day
1. Guest scans the table QR → menu opens with a **"Ordering for Table N"** banner.
2. They tap **+** on dishes → **View cart** → **Place Order**.
3. Order pops onto the **staff board** (`/staff/`) in **New** with a chime.
4. Receptionist → **Start preparing** → **Mark ready** (waiter hears a chime) → **Mark served**.
5. Guest sees a live status tracker (Placed → Preparing → Ready → Served).

## URLs
- Customer (per table): `…/?t=<token>`  (from the QR)
- Staff order board: `…/staff/`
- Print QR codes: `…/qr.html`
- Menu admin (edit dishes/prices): `…/admin/`

## Notes
- **Multi-hotel ready:** every row has `hotel_id`. Adding more hotels later = new
  `hotels` row + its own tables/menu/staff; the same code serves all of them.
- **Security:** guests can only *place* and *track* orders; only logged-in staff can
  change order status (enforced by Row Level Security).
- Order tracking read is open for MVP simplicity — can be tightened to a per-order
  token later.
