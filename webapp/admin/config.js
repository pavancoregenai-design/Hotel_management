// ============================================================
//  Supabase connection — used by BOTH the public menu and admin
//  Fill these in after creating your Supabase project.
//  (Settings → API → Project URL and "anon public" key)
//
//  These are safe to expose publicly (the anon key only allows
//  what Row-Level-Security permits: public read, admin-only write).
// ============================================================
window.SUPABASE_CONFIG = {
  url:        'https://hwysxtiaokqqvdzrssng.supabase.co',
  anonKey:    'YOUR_ANON_PUBLIC_KEY',
  // the admin logs in with just a code; behind the scenes we sign in
  // as this fixed account using the code as the password.
  adminEmail: 'admin@jamminjunction.app',
};

// true once real values are filled in
window.SUPABASE_READY = !/YOUR_/.test(window.SUPABASE_CONFIG.url + window.SUPABASE_CONFIG.anonKey);
