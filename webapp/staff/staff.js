(async function () {
  await window.loadConfig();
  const ready = window.SUPABASE_READY;
  const cfg = window.SUPABASE_CONFIG;
  let sb = null, me = null, orders = new Map(), channel = null;
  let soundOn = true;

  const $ = (s) => document.querySelector(s);
  const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const titleCase = (s) => (s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const NEXT = { placed: 'preparing', preparing: 'ready', ready: 'served' };
  const NEXT_LABEL = { placed: 'Start preparing', preparing: 'Mark ready', ready: 'Mark served' };
  const ago = (ts) => { const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000); return s < 60 ? s + 's ago' : Math.floor(s / 60) + 'm ago'; };

  if (!ready) { $('#cfgWarn').classList.remove('hidden'); }
  else sb = window.supabase.createClient(cfg.url, cfg.anonKey);

  // ---------- auth ----------
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ready) { $('#loginMsg').textContent = 'Backend not configured.'; return; }
    $('#loginBtn').disabled = true; $('#loginMsg').textContent = 'Signing in…';
    const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#code').value });
    $('#loginBtn').disabled = false;
    if (error) { $('#loginMsg').textContent = 'Wrong email or password.'; return; }
    start();
  });
  $('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  $('#soundBtn').addEventListener('click', () => {
    soundOn = !soundOn; $('#soundBtn').textContent = '🔔 Sound: ' + (soundOn ? 'On' : 'Off');
    if (soundOn) chime('ready');
  });
  if (sb) { const { data } = await sb.auth.getSession(); if (data.session) start(); }

  async function start() {
    // fetch my staff row (role + hotel)
    const { data: staff } = await sb.from('staff').select('*').eq('user_id', (await sb.auth.getUser()).data.user.id).single();
    if (!staff) { $('#loginMsg').textContent = 'This account is not registered as staff.'; return; }
    me = staff;
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    $('#roleBadge').textContent = staff.role;
    await loadOrders();
    subscribe();
  }

  // ---------- data ----------
  async function loadOrders() {
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString(); // last 12h
    const { data: os } = await sb.from('orders').select('*')
      .eq('hotel_id', me.hotel_id).gte('created_at', since).order('created_at', { ascending: true });
    const ids = (os || []).map((o) => o.id);
    let items = [];
    if (ids.length) { const { data } = await sb.from('order_items').select('*').in('order_id', ids); items = data || []; }
    orders.clear();
    (os || []).forEach((o) => orders.set(o.id, { ...o, items: items.filter((i) => i.order_id === o.id) }));
    renderAll();
  }

  async function fetchOne(id) {
    const { data: o } = await sb.from('orders').select('*').eq('id', id).single();
    if (!o) return;
    const { data: items } = await sb.from('order_items').select('*').eq('order_id', id);
    orders.set(id, { ...o, items: items || [] });
  }

  // ---------- realtime ----------
  function subscribe() {
    channel = sb.channel('orders-' + me.hotel_id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `hotel_id=eq.${me.hotel_id}` },
        async (p) => { await fetchOne(p.new.id); renderAll(); flash(p.new.id); if (p.new.status === 'placed') alertNew(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `hotel_id=eq.${me.hotel_id}` },
        async (p) => {
          const prev = orders.get(p.new.id);
          await fetchOne(p.new.id); renderAll();
          if (p.new.status === 'ready' && (!prev || prev.status !== 'ready')) alertReady();
        })
      .subscribe((s) => { $('#liveDot').style.opacity = s === 'SUBSCRIBED' ? 1 : .3; });
  }

  // ---------- render ----------
  const LANES = ['placed', 'preparing', 'ready', 'served'];
  function renderAll() {
    const groups = { placed: [], preparing: [], ready: [], served: [] };
    [...orders.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach((o) => { if (groups[o.status]) groups[o.status].push(o); });
    LANES.forEach((st) => {
      const body = $('#lane-' + st); const list = groups[st];
      $('#cnt-' + st).textContent = list.length;
      body.innerHTML = list.length ? '' : '<div class="lane-empty">—</div>';
      list.forEach((o) => body.appendChild(card(o)));
    });
  }

  function card(o) {
    const lines = (o.items || []).map((i) =>
      `<li><span><span class="q">${i.qty}×</span>${esc(titleCase(i.name))}${i.variant ? ` <span class="v">(${esc(titleCase(i.variant))})</span>` : ''}</span><span>${money(i.line_total)}</span></li>`).join('');
    const c = el(`<div class="ocard" data-id="${o.id}">
      <div class="oc-top"><div class="oc-table">Table <b>${esc(o.table_number || '?')}</b></div><div class="oc-time">${ago(o.created_at)}</div></div>
      ${o.customer_name ? `<div class="oc-name">👤 ${esc(o.customer_name)}</div>` : ''}
      <ul class="oc-lines">${lines}</ul>
      ${o.note ? `<div class="oc-note">📝 ${esc(o.note)}</div>` : ''}
      <div class="oc-foot"><span class="oc-total">${money(o.total)}</span></div>
    </div>`);
    const foot = c.querySelector('.oc-foot');
    if (NEXT[o.status]) {
      const b = el(`<button class="act go">${NEXT_LABEL[o.status]}</button>`);
      b.onclick = () => setStatus(o.id, NEXT[o.status]); foot.appendChild(b);
    }
    if (o.status === 'placed') {
      const x = el(`<button class="act danger">Cancel</button>`);
      x.onclick = () => { if (confirm('Cancel this order?')) setStatus(o.id, 'cancelled'); }; foot.appendChild(x);
    }
    return c;
  }

  async function setStatus(id, status) {
    const { error } = await sb.from('orders').update({ status }).eq('id', id);
    if (error) { alert(error.message); return; }
    const o = orders.get(id); if (o) { o.status = status; if (status === 'cancelled') orders.delete(id); renderAll(); }
  }

  function flash(id) { const c = document.querySelector(`.ocard[data-id="${id}"]`); if (c) { c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 2000); } }

  // ---------- sound (Web Audio, no assets) ----------
  let actx;
  function beep(freq, t0, dur, vol) {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime + t0;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.start(t); o.stop(t + dur);
  }
  function chime(kind) {
    try {
      if (kind === 'new') { beep(880, 0, .18, .3); beep(1175, .16, .22, .3); }
      else { beep(660, 0, .15, .25); beep(990, .13, .18, .25); }
    } catch (e) {}
  }
  const roleWantsNew = () => me && (me.role === 'receptionist' || me.role === 'manager');
  const roleWantsReady = () => me && (me.role === 'waiter' || me.role === 'manager');
  function alertNew() { if (soundOn && roleWantsNew()) chime('new'); }
  function alertReady() { if (soundOn && roleWantsReady()) chime('ready'); }

  // refresh relative times every 30s
  setInterval(() => { if (orders.size) renderAll(); }, 30000);
})();
