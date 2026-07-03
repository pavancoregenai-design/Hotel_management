// ============================================================
//  Customer QR table-ordering: cart + checkout + live status
//  Active only when the URL has a ?t=<qr_token> (scanned table).
// ============================================================
(function () {
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  window.ORDERING = !!token;            // read by app.js itemRow()
  if (!token) return;                    // plain browsing → no ordering UI

  const money = (n) => '₹' + (Math.round(Number(n) * 100) / 100).toLocaleString('en-IN');
  const titleCase = (s) => (s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const key = (l) => `${l.name}||${l.variant || ''}`;
  let table = null;                      // {id, table_number, hotel_id}
  const LS = `cart:${token}`;
  let cart = load();

  function load() { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } }
  function save() { localStorage.setItem(LS, JSON.stringify(cart)); }

  // ---------- inject UI ----------
  const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const banner = el(`<div class="table-banner">🍽 <span>Ordering for</span> <b id="tblName">your table</b></div>`);
  const fab = el(`<button class="cart-fab" id="cartFab">
      <span class="fab-l"><span class="fab-count" id="fabCount">0</span> View cart</span>
      <span id="fabTotal">₹0</span></button>`);
  const scrim = el(`<div class="sheet-scrim" id="scrim"></div>`);
  const sheet = el(`<div class="sheet" id="sheet">
      <div class="sheet-head"><h3>Your Order</h3><button class="close" id="sheetClose">×</button></div>
      <div class="sheet-body" id="sheetBody"></div>
      <div class="sheet-foot">
        <div class="frow"><input id="custName" placeholder="Your name (optional)"/></div>
        <div class="frow"><textarea id="custNote" rows="1" placeholder="Note for the kitchen (optional)"></textarea></div>
        <button class="place-btn" id="placeBtn"><span>Place Order</span><span id="placeTotal">₹0</span></button>
      </div></div>`);
  const statusScrim = el(`<div class="status-scrim" id="statusScrim"><div class="status-card" id="statusCard"></div></div>`);
  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();
  function mount() {
    if (document.getElementById('cartFab')) return;
    document.body.prepend(banner);
    document.body.append(fab, scrim, sheet, statusScrim);
    fab.addEventListener('click', openSheet);
    document.getElementById('sheetClose').addEventListener('click', closeSheet);
    scrim.addEventListener('click', closeSheet);
    document.getElementById('placeBtn').addEventListener('click', placeOrder);
    // add-to-cart (event delegation — items render later)
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('.add-btn'); if (!b) return;
      addToCart({ id: b.dataset.id, name: b.dataset.n, type: b.dataset.t, variant: b.dataset.v, price: Number(b.dataset.p) });
      bump(b);
    });
    renderFab();
    resolveTable();
  }

  // ---------- table resolve (via secure RPC — no direct table access) ----------
  async function resolveTable() {
    try {
      if (window.loadConfig) await window.loadConfig();
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const { data } = await sb.rpc('resolve_table', { p_token: token });
      if (data && data.table_number) {
        table = { table_number: data.table_number };
        document.getElementById('tblName').textContent = 'Table ' + data.table_number;
      }
    } catch (e) { console.warn('table resolve failed', e); }
  }

  // ---------- cart ----------
  function addToCart(line) {
    const k = key(line);
    const found = cart.find((l) => key(l) === k);
    if (found) found.qty += 1; else cart.push({ ...line, qty: 1 });
    save(); renderFab(); if (sheet.classList.contains('show')) renderSheet();
    toast(`Added ${titleCase(line.name)}`);
  }
  function setQty(k, d) {
    const l = cart.find((x) => key(x) === k); if (!l) return;
    l.qty += d; if (l.qty <= 0) cart = cart.filter((x) => key(x) !== k);
    save(); renderFab(); renderSheet();
  }
  const total = () => cart.reduce((s, l) => s + l.price * l.qty, 0);
  const count = () => cart.reduce((s, l) => s + l.qty, 0);

  function renderFab() {
    document.getElementById('fabCount').textContent = count();
    document.getElementById('fabTotal').textContent = money(total());
    fab.classList.toggle('show', count() > 0 && !sheet.classList.contains('show'));
  }
  function bump(b) { b.style.transform = 'scale(1.4)'; setTimeout(() => (b.style.transform = ''), 130); }

  function renderSheet() {
    const body = document.getElementById('sheetBody');
    if (!cart.length) { body.innerHTML = `<div class="cart-empty">Your cart is empty.<br>Tap + on any dish to add it.</div>`; }
    else body.innerHTML = cart.map((l) => `
      <div class="cart-line">
        <div class="cl-main">
          <div class="cl-name">${titleCase(l.name)}</div>
          <div class="cl-sub">${l.variant ? titleCase(l.variant) + ' · ' : ''}${money(l.price)} each</div>
        </div>
        <div class="stepper" data-k="${encodeURIComponent(key(l))}">
          <button class="dec">−</button><span>${l.qty}</span><button class="inc">+</button>
        </div>
        <div class="cl-price">${money(l.price * l.qty)}</div>
      </div>`).join('');
    body.querySelectorAll('.stepper').forEach((s) => {
      const k = decodeURIComponent(s.dataset.k);
      s.querySelector('.inc').onclick = () => setQty(k, +1);
      s.querySelector('.dec').onclick = () => setQty(k, -1);
    });
    document.getElementById('placeTotal').textContent = money(total());
    document.getElementById('placeBtn').disabled = !cart.length;
  }
  function openSheet() { renderSheet(); scrim.classList.add('show'); sheet.classList.add('show'); renderFab(); }
  function closeSheet() { scrim.classList.remove('show'); sheet.classList.remove('show'); renderFab(); }

  // ---------- place order (server-authoritative RPC: DB recomputes prices) ----------
  const ERRMAP = { invalid_table: 'This QR is not linked to a table.', empty_order: 'Your cart is empty.',
    no_valid_items: 'These items are no longer available.', too_many_items: 'Too many items in one order.' };
  async function placeOrder() {
    if (!cart.length) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb) { toast('Connecting… please try again', true); return; }
    const btn = document.getElementById('placeBtn'); btn.disabled = true;
    btn.querySelector('span').textContent = 'Placing…';
    try {
      const { data, error } = await sb.rpc('place_order', {
        p_table_token: token,
        p_items: cart.map((l) => ({ item_id: l.id, variant: l.variant || null, qty: l.qty })),
        p_name: document.getElementById('custName').value.trim() || null,
        p_note: document.getElementById('custNote').value.trim() || null,
      });
      if (error) throw error;
      cart = []; save(); renderFab(); closeSheet();
      trackOrder(data.track_token, data.table_number || (table && table.table_number) || '');
    } catch (e) {
      const msg = ERRMAP[(e.message || '').trim()] || ('Could not place order: ' + (e.message || e));
      toast(msg, true);
      btn.disabled = false; btn.querySelector('span').textContent = 'Place Order';
    }
  }

  // ---------- live status (secure polling via get_order RPC) ----------
  const STEPS = [['placed', 'Placed'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served']];
  function trackOrder(trackToken, tno) {
    const scr = document.getElementById('statusScrim');
    const sb = window.getSupabase();
    let status = 'placed', poll = null;
    scr.classList.add('show');
    render(status);
    const tick = async () => {
      try {
        const { data } = await sb.rpc('get_order', { p_track_token: trackToken });
        if (data && data.status && data.status !== status) {
          status = data.status; render(status);
          if (status === 'served' || status === 'cancelled') stop();
        }
      } catch (e) { /* keep trying */ }
    };
    poll = setInterval(tick, 5000);
    const stop = () => { if (poll) { clearInterval(poll); poll = null; } };

    function render(st) {
      const idx = STEPS.findIndex((s) => s[0] === st);
      const done = st === 'served', cancelled = st === 'cancelled';
      document.getElementById('statusCard').innerHTML = `
        <div class="tick">${cancelled ? '⚠' : done ? '🎉' : '✓'}</div>
        <h2>${cancelled ? 'Order cancelled' : done ? 'Enjoy your meal!' : 'Order placed!'}</h2>
        <div class="osub">Table ${tno} · ${cancelled ? 'please check with staff' : done ? 'served to your table' : "we'll bring it over shortly"}</div>
        ${cancelled ? '' : `<div class="steps">${STEPS.map((s, i) => `
          <div class="step ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}">
            <div class="dot">${i <= idx ? '✓' : i + 1}</div><small>${s[1]}</small></div>`).join('')}</div>`}
        <button class="obtn" id="statusClose">${done || cancelled ? 'Done' : 'Keep browsing'}</button>`;
      document.getElementById('statusClose').onclick = () => { scr.classList.remove('show'); if (done || cancelled) stop(); };
    }
  }

  // ---------- toast ----------
  let tEl;
  function toast(msg, err) {
    if (!tEl) { tEl = el('<div class="ord-toast"></div>'); document.body.appendChild(tEl); }
    tEl.textContent = msg; tEl.className = 'ord-toast show' + (err ? ' err' : '');
    clearTimeout(tEl._t); tEl._t = setTimeout(() => (tEl.className = 'ord-toast'), 1800);
  }
})();
