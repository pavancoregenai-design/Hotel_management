// ============================================================
//  Builds window.MENU_DATA from Supabase, shaped exactly like
//  data.js so the existing public app.js works unchanged.
//  Falls back to the bundled data.js if Supabase isn't configured
//  or the request fails.
// ============================================================
(function () {
  const MENU_META = {
    regular: { label: 'Regular Menu', hours: 'All day' },
    happy:   { label: 'Happy Hours',  hours: '11 AM – 8 PM' },
  };

  // a Supabase client (created lazily; supabase-js must be loaded first)
  window.getSupabase = function () {
    if (!window.SUPABASE_READY || !window.supabase) return null;
    if (!window.__sb) {
      window.__sb = window.supabase.createClient(
        window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    }
    return window.__sb;
  };

  // fetch rows and assemble the nested MENU_DATA shape
  window.buildMenuFromSupabase = async function () {
    const sb = window.getSupabase();
    if (!sb) return null;

    const [{ data: sections, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      sb.from('sections').select('*').order('sort_order', { ascending: true }),
      sb.from('items').select('*').eq('is_active', true).order('priority', { ascending: true }),
    ]);
    if (e1 || e2) throw (e1 || e2);

    // venue info kept from the bundled data.js (static brand details)
    const venue = (window.MENU_DATA && window.MENU_DATA.venue) || {};
    const menus = {};

    for (const mk of Object.keys(MENU_META)) {
      const catSections = sections.filter((s) => s.menu_type === mk && !s.sub_category);
      const categories = catSections.map((catSec) => {
        const subSections = sections
          .filter((s) => s.menu_type === mk && s.category === catSec.category && s.sub_category);
        const subs = subSections.map((subSec) => ({
          name: subSec.sub_category,
          img: subSec.image_url || '',
          items: items
            .filter((it) => it.menu_type === mk && it.category === catSec.category && it.sub_category === subSec.sub_category)
            .map((it) => ({
              name: it.name,
              type: it.item_type,
              price: it.price == null ? '' : String(it.price),
              offerPrice: it.price == null ? '' : String(it.price),
              qty: it.qty || {},
              img: it.image_url || '',
            })),
        })).filter((s) => s.items.length > 0);
        return { key: catSec.category, name: catSec.display_name || catSec.category, img: catSec.image_url || '', subs };
      }).filter((c) => c.subs.length > 0);

      menus[mk] = { label: MENU_META[mk].label, hours: MENU_META[mk].hours, categories };
    }

    return { venue, menus };
  };
})();
