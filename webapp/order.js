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
      addToCart({ name: b.dataset.n, type: b.dataset.t, variant: b.dataset.v, price: Number(b.dataset.p) });
      bump(b);
    });
    renderFab();
    resolveTable();
  }

  // ---------- table resolve ----------
  async function resolveTable() {
    try {
      if (window.loadConfig) await window.loadConfig();
      const sb = window.getSupabase && window.getSupabase();
      if (!sb) return;
      const { data } = await sb.from('tables').select('id,table_number,hotel_id').eq('qr_token', token).single();
      if (data) { table = data; document.getElementById('tblName').textContent = 'Table ' + data.table_number; }
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

  // ---------- place order ----------
  async function placeOrder() {
    if (!cart.length) return;
    const sb = window.getSupabase && window.getSupabase();
    if (!sb || !table) { toast('Connecting… please try again', true); resolveTable(); return; }
    const btn = document.getElementById('placeBtn'); btn.disabled = true;
    btn.querySelector('span').textContent = 'Placing…';
    try {
      const { data: order, error } = await sb.from('orders').insert({
        hotel_id: table.hotel_id, table_id: table.id, table_number: table.table_number,
        customer_name: document.getElementById('custName').value.trim() || null,
        note: document.getElementById('custNote').value.trim() || null,
        total: total(), status: 'placed',
      }).select().single();
      if (error) throw error;
      const rows = cart.map((l) => ({
        order_id: order.id, name: l.name, variant: l.variant || null, item_type: l.type,
        unit_price: l.price, qty: l.qty, line_total: l.price * l.qty,
      }));
      const { error: e2 } = await sb.from('order_items').insert(rows);
      if (e2) throw e2;
      cart = []; save(); renderFab(); closeSheet();
      trackOrder(order.id, order.table_number);
    } catch (e) {
      toast('Could not place order: ' + (e.message || e), true);
      btn.disabled = false; btn.querySelector('span').textContent = 'Place Order';
    }
  }

  // ---------- live status ----------
  const STEPS = [['placed', 'Placed'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served']];
  function trackOrder(id, tno) {
    const scr = document.getElementById('statusScrim');
    render('placed');
    scr.classList.add('show');
    const sb = window.getSupabase();
    const ch = sb.channel('order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (p) => render(p.new.status))
      .subscribe();

    function render(status) {
      const idx = STEPS.findIndex((s) => s[0] === status);
      const done = status === 'served';
      document.getElementById('statusCard').innerHTML = `
        <div class="tick">${done ? '🎉' : '✓'}</div>
        <h2>${done ? 'Enjoy your meal!' : 'Order placed!'}</h2>
        <div class="osub">Table ${tno} · we'll bring it over${done ? '' : ' shortly'}</div>
        <div class="steps">${STEPS.map((s, i) => `
          <div class="step ${i < idx ? 'done' : ''} ${i === idx ? 'active' : ''}">
            <div class="dot">${i <= idx ? '✓' : i + 1}</div><small>${s[1]}</small></div>`).join('')}</div>
        <button class="obtn" id="statusClose">${done ? 'Done' : 'Keep browsing'}</button>
        <div class="oid">ORDER #${id.slice(0, 8).toUpperCase()}</div>`;
      document.getElementById('statusClose').onclick = () => {
        scr.classList.remove('show'); if (done) sb.removeChannel(ch);
      };
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
