# Menu Admin — Setup (one time, ~10 minutes)

The admin panel and the live menu are powered by **Supabase** (free tier). Follow these steps once.

---

## 1. Create a Supabase project
1. Go to <https://supabase.com> → sign in → **New project**.
2. Name it `jammin-junction`, set a database password, pick a region near you, **Create**.
3. Wait ~2 minutes for it to provision.

## 2. Create the database tables
1. In your project → left sidebar → **SQL Editor** → **New query**.
2. Open `admin/supabase/schema.sql` from this repo, copy everything, paste, click **Run**.
   - This creates the `items` + `sections` tables, security rules, and the image storage bucket.

## 3. Load the current menu (seed data)
1. Still in **SQL Editor** → **New query**.
2. Open `admin/supabase/seed.sql`, copy everything, paste, **Run**.
   - This loads all current categories, sub-categories and **330 items** with prices.

## 4. Create the admin login
1. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: **`admin@jamminjunction.app`**  (must match `adminEmail` in `admin/config.js`)
3. Password: **choose your admin code** (this is what you'll type to log in).
4. ✅ Tick **Auto Confirm User** → **Create user**.

> Want a different login email? Change `adminEmail` in `admin/config.js` to match.

## 5. Paste your keys into the app
1. Supabase → **Project Settings** (gear) → **API**.
2. Copy **Project URL** and the **`anon` `public`** key.
3. Open `admin/config.js` and replace:
   ```js
   url:     'https://YOUR_PROJECT_REF.supabase.co',   // ← Project URL
   anonKey: 'YOUR_ANON_PUBLIC_KEY',                   // ← anon public key
   ```
4. Save.

## 6. Deploy
```bash
git add -A && git commit -m "Add Supabase admin panel" && git push
```
Vercel redeploys automatically.

---

## Using it
- **Admin panel:** `https://your-site.vercel.app/admin/`  → enter your code.
- Pick a menu (Regular / Happy Hours) → a category → a sub-category.
- Edit **name, price, type, price-variants, image, visibility** → **Save**.
- **+ Add item**, **+ Sub** (sub-category), **+ Cat** (category) to add new things.
- Changes appear on the **public menu instantly** (it reads live from Supabase).

## Notes
- The `anon` key is safe to expose — security rules (RLS) allow the public to **read** the menu but only a **logged-in admin** can change it.
- Until you finish setup, the public site keeps working from the bundled `data.js`, and the admin shows a "configure Supabase" notice.
- Images you upload go to the Supabase `menu-images` bucket and are served from there.
