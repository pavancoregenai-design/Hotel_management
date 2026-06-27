// Loads the live menu from Supabase (if configured), then starts the app.
// Falls back silently to the bundled data.js when Supabase isn't set up.
(async function () {
  try {
    if (window.SUPABASE_READY && typeof window.buildMenuFromSupabase === 'function') {
      const data = await window.buildMenuFromSupabase();
      if (data && data.menus) window.MENU_DATA = data;
    }
  } catch (e) {
    console.warn('Menu: could not load from Supabase, using bundled data.', e);
  }
  const s = document.createElement('script');
  s.src = 'app.js';
  document.body.appendChild(s);
})();
