# Hotel Menu Management — JAMMIN JUNCTION BAR & KITCHEN

A mobile-first digital menu web app for **JAMMIN JUNCTION BAR & KITCHEN, Hyderabad**, modeled on the Zillout menu experience.

## ✨ Features

- **Cinematic home page** — rooftop video hero with a circular logo badge, welcome/about, banner, and a sideways-sliding (center-scale) category carousel.
- **Two menu types** — switch between **Regular Menu** and **Happy Hours** via a polished dropdown.
- **Explore-Cuisine screen** (Swiggy/Zomato style):
  - Main category switcher — Food / Drinks / Beverages / Desserts.
  - Left rail of sub-categories with a **scroll-spy** highlight that follows the list.
  - Right pane = one continuous scroll of all items, grouped under sticky headers.
  - Click a category to jump to its section.
- **Filters** — Veg / Non-Veg (FSSAI symbols) + live search.
- **Real data** — 262 regular items + 68 happy-hours items, with price variants (e.g. 30ML/Bottle, Glass/Pitcher/Tower).
- **Polish** — gold theme, scroll-reveal, shimmer/glow effects, hover lift, responsive down to 320px, `prefers-reduced-motion` aware.

## 🗂 Structure
https://api.vercel.com/v1/integrations/deploy/prj_4kKHmLHPzu1Oei8MCjxOLHzIcxrf/i7wxk0IxAL
```
webapp/
  index.html        # app shell (home + explore screen)
  styles.css        # dark + gold theme, effects, responsive
  app.js            # carousel, dropdown, tabs, scroll-spy, filters, search
  data.js           # full menu data (both menu types) + image maps
  assets/           # logo, rooftop video, category & item images
main page/          # original source images & assets
```

## ▶️ Run locally

```bash
cd webapp
python3 -m http.server 8765
```

Then open <http://localhost:8765/>.

No build step — it's vanilla HTML/CSS/JS.
