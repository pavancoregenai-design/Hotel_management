(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const ready = window.SUPABASE_READY;
  let sb = null;
  const state = { menu: 'regular', cat: null, sub: null, sections: [], items: [] };

  const $ = (s, r = document) => r.querySelector(s);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const titleCase = (s) => (s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const isVeg = (t) => t === 'veg' || t === 'non-alcoholic';
  const TYPES = ['veg', 'non-veg', 'seafood', 'egg', 'alcoholic', 'non-alcoholic'];
  // seeded images are relative ('assets/..') to the site root, which is one level up from /admin/
  const resolveImg = (u) => !u ? '' : (/^https?:|^data:/.test(u) ? u : '../' + u);

  function toast(msg, err) {
    let t = $('#toast'); if (!t) { t = el('<div id="toast" class="toast"></div>'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.className = 'toast', 2200);
  }
  const saveState = (s) => { $('#saveState').textContent = s; };

  // qty <-> text ("LABEL : PRICE" per line)
  const qtyToText = (q) => Object.entries(q || {}).map(([k, v]) => `${k} : ${v}`).join('\n');
  const textToQty = (txt) => {
    const out = {};
    (txt || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const m = l.split(/[:=]/); if (m.length >= 2) out[m[0].trim()] = m.slice(1).join(':').trim();
    });
    return out;
  };

  // ---------------- AUTH ----------------
  if (!ready) { $('#cfgWarn').classList.remove('hidden'); }
  else { sb = window.supabase.createClient(cfg.url, cfg.anonKey); }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ready) { $('#loginMsg').textContent = 'Configure Supabase first (see SETUP.md).'; return; }
    const code = $('#codeInput').value.trim();
    if (!code) return;
    $('#loginBtn').disabled = true; $('#loginMsg').textContent = 'Checking…';
    const { error } = await sb.auth.signInWithPassword({ email: cfg.adminEmail, password: code });
    $('#loginBtn').disabled = false;
    if (error) { $('#loginMsg').textContent = 'Wrong code. Try again.'; return; }
    $('#loginMsg').textContent = ''; enterApp();
  });

  async function checkSession() {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (data.session) enterApp();
  }

  $('#logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

  // ---------------- APP ----------------
  async function enterApp() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#menuSel').addEventListener('change', (e) => { state.menu = e.target.value; state.cat = state.sub = null; loadSections().then(renderTree); $('#itemArea').innerHTML = '<p class="hint">Pick a sub-category.</p>'; $('#secBar').innerHTML = ''; });
    $('#addCatBtn').addEventListener('click', addCategory);
    await loadSections(); renderTree();
  }

  async function loadSections() {
    const { data, error } = await sb.from('sections').select('*').order('sort_order', { ascending: true });
    if (error) { toast('Load failed: ' + error.message, true); return; }
    state.sections = data || [];
  }

  function renderTree() {
    const cats = state.sections.filter((s) => s.menu_type === state.menu && !s.sub_category);
    const list = $('#catList'); list.innerHTML = '';
    cats.forEach((c) => {
      const subs = state.sections.filter((s) => s.menu_type === state.menu && s.category === c.category && s.sub_category);
      const group = el(`<div class="cat-group" data-cat="${esc(c.category)}">
        <div class="cat-row"><span><span class="chev">▸</span> ${esc(titleCase(c.display_name || c.category))}</span>
          <button class="mini addsub" title="Add sub-category">+ Sub</button></div>
        <div class="sub-list">
          ${subs.map((s) => `<div class="sub-row" data-sub="${esc(s.sub_category)}">
              <span>${esc(titleCase(s.sub_category))}</span><em></em></div>`).join('') || '<div class="sub-row" style="opacity:.5;cursor:default">no sub-categories</div>'}
        </div></div>`);
      group.querySelector('.cat-row').addEventListener('click', (e) => {
        if (e.target.classList.contains('addsub')) return;
        group.classList.toggle('open');
      });
      group.querySelector('.addsub').addEventListener('click', (e) => { e.stopPropagation(); addSub(c.category); });
      group.querySelectorAll('.sub-row[data-sub]').forEach((row) =>
        row.addEventListener('click', () => selectSub(c.category, row.dataset.sub)));
      list.appendChild(group);
    });
    // keep current open
    if (state.cat) { const g = list.querySelector(`.cat-group[data-cat="${CSS.escape(state.cat)}"]`); if (g) g.classList.add('open'); }
  }

  async function selectSub(cat, sub) {
    state.cat = cat; state.sub = sub;
    document.querySelectorAll('.sub-row').forEach((r) => r.classList.toggle('active', r.dataset.sub === sub && r.closest('.cat-group').dataset.cat === cat));
    const { data, error } = await sb.from('items').select('*')
      .eq('menu_type', state.menu).eq('category', cat).eq('sub_category', sub)
      .order('priority', { ascending: true });
    if (error) { toast(error.message, true); return; }
    state.items = data || [];
    renderItems();
  }

  function renderItems() {
    const secRow = state.sections.find((s) => s.menu_type === state.menu && s.category === state.cat && s.sub_category === state.sub);
    const img = resolveImg(secRow && secRow.image_url);
    $('#secBar').innerHTML = '';
    const bar = el(`<div class="sec-bar">
      <img id="secImg" src="${esc(img)}" alt="" onerror="this.style.visibility='hidden'"/>
      <div><h2>${esc(titleCase(state.sub))}</h2><div class="meta">${state.items.length} items · ${esc(titleCase(state.cat))}</div></div>
      <div class="sec-actions">
        <button class="btn line" id="secImgBtn">Change image</button>
        <button class="btn gold" id="addItemBtn">+ Add item</button>
      </div></div>`);
    $('#secBar').appendChild(bar);
    $('#secImgBtn').addEventListener('click', () => pickFile(async (file) => {
      saveState('Uploading…'); try { const url = await uploadImage(file);
        await sb.from('sections').update({ image_url: url }).eq('id', secRow.id);
        secRow.image_url = url; $('#secImg').src = url; $('#secImg').style.visibility = 'visible'; saveState('Saved'); toast('Image updated');
      } catch (e) { saveState(''); toast(e.message, true); }
    }));
    $('#addItemBtn').addEventListener('click', addItem);

    const area = $('#itemArea'); area.innerHTML = '';
    if (!state.items.length) area.appendChild(el('<p class="hint">No items yet — click “+ Add item”.</p>'));
    state.items.forEach((it) => area.appendChild(itemCard(it)));
  }

  function itemCard(it) {
    const card = el(`<div class="card" data-id="${it.id}">
      <div class="crow">
        <div class="thumb ${it.image_url ? '' : 'empty'}" title="Click to upload">${it.image_url ? `<img src="${esc(resolveImg(it.image_url))}" style="width:100%;height:100%;object-fit:cover;border-radius:11px"/>` : 'Add<br>image'}</div>
        <div class="fields">
          <div class="line">
            <input class="in name" value="${esc(it.name)}" placeholder="Item name"/>
          </div>
          <div class="line">
            <select class="in type">${TYPES.map((t) => `<option value="${t}" ${t === it.item_type ? 'selected' : ''}>${titleCase(t)}</option>`).join('')}</select>
            <input class="in price" type="number" step="1" value="${it.price ?? ''}" placeholder="Price ₹"/>
          </div>
          <div class="line"><label class="fl">Variants</label></div>
          <textarea class="in qty" placeholder="e.g.\n30 ML : 699\nBOTTLE : 13999">${esc(qtyToText(it.qty))}</textarea>
          <div class="qty-hint">One per line as <code>Label : Price</code>. Leave blank for a single price above.</div>
        </div>
      </div>
      <div class="card-actions">
        <label class="toggle"><input type="checkbox" class="active" ${it.is_active ? 'checked' : ''}/> Visible on menu</label>
        <button class="btn gold save">Save</button>
        <button class="btn danger del">Delete</button>
        <span class="saved-flash"></span>
      </div></div>`);

    card.querySelector('.thumb').addEventListener('click', () => pickFile(async (file) => {
      saveState('Uploading…'); try { const url = await uploadImage(file);
        await sb.from('items').update({ image_url: url }).eq('id', it.id); it.image_url = url;
        card.querySelector('.thumb').classList.remove('empty');
        card.querySelector('.thumb').innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:11px"/>`;
        saveState('Saved'); toast('Image uploaded');
      } catch (e) { saveState(''); toast(e.message, true); }
    }));

    card.querySelector('.save').addEventListener('click', async () => {
      const fields = {
        name: card.querySelector('.name').value.trim(),
        item_type: card.querySelector('.type').value,
        price: card.querySelector('.price').value === '' ? null : Number(card.querySelector('.price').value),
        qty: textToQty(card.querySelector('.qty').value),
        is_active: card.querySelector('.active').checked,
      };
      if (!fields.name) { toast('Name required', true); return; }
      saveState('Saving…');
      const { error } = await sb.from('items').update(fields).eq('id', it.id);
      if (error) { saveState(''); toast(error.message, true); return; }
      Object.assign(it, fields); saveState('Saved');
      const f = card.querySelector('.saved-flash'); f.textContent = '✓ saved'; setTimeout(() => f.textContent = '', 1500);
    });

    card.querySelector('.del').addEventListener('click', async () => {
      if (!confirm(`Delete “${it.name}”?`)) return;
      const { error } = await sb.from('items').delete().eq('id', it.id);
      if (error) { toast(error.message, true); return; }
      card.remove(); state.items = state.items.filter((x) => x.id !== it.id); toast('Deleted');
    });
    return card;
  }

  // ---------------- ADD / IMAGE ----------------
  async function addItem() {
    const maxP = state.items.reduce((m, x) => Math.max(m, x.priority || 0), 0);
    const row = { menu_type: state.menu, category: state.cat, sub_category: state.sub,
      name: 'New item', item_type: 'veg', price: null, qty: {}, image_url: '', priority: maxP + 1, is_active: true };
    const { data, error } = await sb.from('items').insert(row).select().single();
    if (error) { toast(error.message, true); return; }
    state.items.push(data);
    const area = $('#itemArea'); if (area.querySelector('.hint')) area.innerHTML = '';
    const card = itemCard(data); area.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.querySelector('.name').focus(); card.querySelector('.name').select();
    toast('Item added — edit and Save');
  }

  async function addSub(cat) {
    const name = prompt('New sub-category name (e.g. MOMOS):'); if (!name) return;
    const order = state.sections.filter((s) => s.menu_type === state.menu && s.category === cat && s.sub_category).length;
    const { error } = await sb.from('sections').insert({ menu_type: state.menu, category: cat, sub_category: name.toUpperCase(), display_name: name.toUpperCase(), sort_order: order });
    if (error) { toast(error.message, true); return; }
    await loadSections(); state.cat = cat; renderTree(); toast('Sub-category added');
  }

  async function addCategory() {
    const name = prompt('New category name (e.g. STARTERS):'); if (!name) return;
    const key = name.trim().toLowerCase();
    const order = state.sections.filter((s) => s.menu_type === state.menu && !s.sub_category).length;
    const { error } = await sb.from('sections').insert({ menu_type: state.menu, category: key, sub_category: null, display_name: name.trim(), sort_order: order });
    if (error) { toast(error.message, true); return; }
    await loadSections(); renderTree(); toast('Category added — add sub-categories inside it');
  }

  function pickFile(cb) {
    const inp = el('<input type="file" accept="image/*" style="display:none">');
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { if (inp.files[0]) cb(inp.files[0]); inp.remove(); });
    inp.click();
  }

  async function uploadImage(file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await sb.storage.from('menu-images').upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return sb.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
  }

  checkSession();
})();
