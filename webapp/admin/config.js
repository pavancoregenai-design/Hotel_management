// ============================================================
//  Config loader — reads Supabase settings from config.yaml
//  (the single source of truth). Requires js-yaml to be loaded.
//  Exposes window.loadConfig() -> Promise<config>, and sets
//  window.SUPABASE_CONFIG + window.SUPABASE_READY.
// ============================================================
(function () {
  // config.yaml sits at the site root (next to the public index).
  // Pages under a sub-folder (/admin/, /staff/) reach it with "../".
  const inSub = /\/(admin|staff)(\/|$)/.test(location.pathname);
  const CONFIG_URL = (inSub ? '../' : './') + 'config.yaml';

  window.loadConfig = async function () {
    if (window.__cfgLoaded) return window.SUPABASE_CONFIG;
    let cfg = { url: '', anonKey: '', adminEmail: 'admin@jamminjunction.app' };
    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (res.ok && window.jsyaml) {
        const y = window.jsyaml.load(await res.text()) || {};
        const s = y.supabase || {};
        cfg = {
          url: (s.url || '').trim(),
          anonKey: (s.anonKey || '').trim(),
          adminEmail: (s.adminEmail || cfg.adminEmail).trim(),
        };
      }
    } catch (e) {
      console.warn('Could not load config.yaml', e);
    }
    window.SUPABASE_CONFIG = cfg;
    window.SUPABASE_READY = !!(cfg.url && cfg.anonKey && !/YOUR_/.test(cfg.url + cfg.anonKey));
    window.__cfgLoaded = true;
    return cfg;
  };
})();
