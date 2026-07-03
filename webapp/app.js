(function () {
  const DATA = window.MENU_DATA;
  const carousel = document.getElementById('carousel');
  const dotsEl = document.getElementById('dots');
  const screen = document.getElementById('screen');
  const hoursNote = document.getElementById('hoursNote');

  const state = { menu: 'regular', cat: null, sub: null, level: null, diet: 'all' };

  const isVeg = (t) => t === 'veg' || t === 'non-alcoholic';
  const dietClass = (t) => (isVeg(t) ? 'veg' : 'nonveg');
  const countItems = (cat) => cat.subs.reduce((n, s) => n + s.items.length, 0);
  const currentMenu = () => DATA.menus[state.menu];
  const currentCat = () => currentMenu().categories.find((c) => c.key === state.cat);

  // ---------- HOME: carousel ----------
  function buildCarousel() {
    const m = currentMenu();
    hoursNote.textContent = state.menu === 'happy' ? `★ Happy Hours · ${m.hours}` : ' ';
    carousel.innerHTML = m.categories.map((cat, i) => `
      <div class="cat-card" data-cat="${cat.key}" data-i="${i}">
        <img src="${cat.img}" alt="${cat.name}" />
        <div class="veil"></div>
        <div class="open-pill">Open ›</div>
        <div class="cap">
          <h3>${titleCase(cat.name)}</h3>
          <p>${cat.subs.length} categories · ${countItems(cat)} items</p>
        </div>
      </div>`).join('');
    dotsEl.innerHTML = m.categories.map((_, i) => `<span class="dot ${i === 0 ? 'on' : ''}"></span>`).join('');

    carousel.querySelectorAll('.cat-card').forEach((el) => {
      el.addEventListener('click', () => {
        // only open if it's roughly centered (so a swipe doesn't fire navigation)
        if (el.classList.contains('center')) openCategory(el.dataset.cat);
        else centerCard(+el.dataset.i);
      });
    });
    requestAnimationFrame(updateCenter);
  }

  function cards() { return [...carousel.querySelectorAll('.cat-card')]; }

  function updateCenter() {
    const mid = carousel.scrollLeft + carousel.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    cards().forEach((c, i) => {
      const center = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    cards().forEach((c, i) => c.classList.toggle('center', i === best));
    dotsEl.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === best));
  }

  function centerCard(i) {
    const c = cards()[i];
    if (!c) return;
    carousel.scrollTo({ left: c.offsetLeft - (carousel.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
  }

  let scrollRAF;
  carousel.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRAF);
    scrollRAF = requestAnimationFrame(updateCenter);
  });
  document.querySelectorAll('.car-arrow').forEach((b) =>
    b.addEventListener('click', () => {
      const cur = cards().findIndex((c) => c.classList.contains('center'));
      centerCard(Math.max(0, Math.min(cards().length - 1, cur + (+b.dataset.dir))));
    }));

  // drag-to-scroll for desktop mouse
  let down = false, startX, startScroll, moved;
  carousel.addEventListener('mousedown', (e) => { down = true; moved = false; startX = e.pageX; startScroll = carousel.scrollLeft; });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 4) moved = true;
    carousel.scrollLeft = startScroll - dx;
  });
  window.addEventListener('mouseup', () => { down = false; });
  // swallow click after a drag
  carousel.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);

  // ---------- menu toggle ----------
  document.querySelectorAll('.toggle-pill').forEach((p) =>
    p.addEventListener('click', () => {
      document.querySelectorAll('.toggle-pill').forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
      state.menu = p.dataset.menu;
      buildCarousel();
      carousel.scrollTo({ left: 0 });
    }));

  // ---------- EXPLORE-CUISINE SCREEN (two-pane) ----------
  const railEl = document.getElementById('rail');
  const itemsEl = document.getElementById('items');
  const searchBox = document.getElementById('searchBox');
  const catTabs = document.getElementById('catTabs');

  function openCategory(key) {
    state.cat = key; state.sub = 0; state.diet = 'all'; state.search = '';
    searchBox.value = '';
    document.getElementById('searchRow').classList.add('hidden');
    document.getElementById('searchBtn').classList.remove('on');
    syncDietButtons();
    syncMenuSwitch();
    screen.classList.remove('hidden');
    renderTabs();
    renderRail();
    renderItems();
  }

  // ROW 1: menu-type DROPDOWN (Regular / Happy Hours)
  const ddBtn = document.getElementById('ddBtn');
  const ddMenu = document.getElementById('ddMenu');

  function syncMenuSwitch() {
    document.getElementById('ddLabel').textContent = currentMenu().label;
    document.querySelectorAll('#ddMenu .dd-opt').forEach((o) =>
      o.classList.toggle('active', o.dataset.menu === state.menu));
  }
  function closeDropdown() {
    ddMenu.classList.add('hidden'); ddBtn.classList.remove('open');
    ddBtn.setAttribute('aria-expanded', 'false');
  }
  ddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = ddMenu.classList.toggle('hidden') === false;
    ddBtn.classList.toggle('open', open);
    ddBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => { if (!ddMenu.classList.contains('hidden')) closeDropdown(); });
  ddMenu.addEventListener('click', (e) => e.stopPropagation());

  document.querySelectorAll('#ddMenu .dd-opt').forEach((o) =>
    o.addEventListener('click', () => {
      closeDropdown();
      if (state.menu === o.dataset.menu) return;
      state.menu = o.dataset.menu;
      state.cat = currentMenu().categories[0].key;
      state.sub = 0; state.search = ''; searchBox.value = '';
      document.getElementById('searchRow').classList.add('hidden');
      document.getElementById('searchBtn').classList.remove('on');
      state.diet = 'all'; syncDietButtons();
      syncMenuSwitch();
      // keep the home carousel in sync too
      document.querySelectorAll('.toggle-pill').forEach((x) => x.classList.toggle('active', x.dataset.menu === state.menu));
      buildCarousel();
      renderTabs(); renderRail(); renderItems();
    }));

  // ROW 2: main category switcher (Food / Drinks / Beverages / Desserts)
  function renderTabs() {
    catTabs.innerHTML = currentMenu().categories.map((c) =>
      `<button class="cat-tab ${c.key === state.cat ? 'active' : ''}" data-cat="${c.key}">${titleCase(c.name)}</button>`).join('');
    catTabs.querySelectorAll('.cat-tab').forEach((b) =>
      b.addEventListener('click', () => {
        if (state.cat === b.dataset.cat) return;
        state.cat = b.dataset.cat; state.sub = 0;
        renderTabs(); renderRail(); renderItems();
        const active = catTabs.querySelector('.cat-tab.active');
        active && active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }));
  }

  // left rail: the sub-category list ("Explore Cuisine")
  // left rail = sub-category index; click jumps the right list to that section
  function renderRail() {
    const cat = currentCat();
    railEl.innerHTML = cat.subs.map((s, i) => `
      <button class="rail-item ${i === state.sub ? 'active' : ''}" data-i="${i}">
        <img src="${s.img}" alt="" loading="lazy"/>
        <span>${titleCase(s.name)}</span>
        <em>${s.items.length}</em>
      </button>`).join('');
    railEl.querySelectorAll('.rail-item').forEach((el) =>
      el.addEventListener('click', () => scrollToSection(+el.dataset.i)));
  }

  // right pane = ALL sub-categories of the current category in one continuous scroll
  function renderItems() {
    const cat = currentCat();
    const term = (state.search || '').trim().toLowerCase();
    const dietOk = (it) => state.diet === 'all' ? true : state.diet === 'veg' ? isVeg(it.type) : !isVeg(it.type);

    let html = '';
    let anyVisible = false;
    cat.subs.forEach((sub, i) => {
      const items = sub.items.filter((it) => dietOk(it) && (!term || it.name.toLowerCase().includes(term)));
      // hide the rail entry when a filter empties a section
      const railItem = railEl.querySelector(`.rail-item[data-i="${i}"]`);
      if (railItem) railItem.classList.toggle('dim', items.length === 0);
      if (!items.length) return;
      anyVisible = true;
      html += `
        <section class="menu-sec" data-i="${i}" id="sec-${i}">
          <div class="sec-head">
            <img src="${sub.img}" alt=""/>
            <div><h3>${titleCase(sub.name)}</h3><div class="cnt">${items.length} item${items.length > 1 ? 's' : ''}</div></div>
          </div>
          <div class="sec-body">${items.map(itemRow).join('')}</div>
        </section>`;
    });
    itemsEl.innerHTML = anyVisible ? html : `<div class="empty">No items match your filters.</div>`;
    requestAnimationFrame(syncScrollSpy);
  }

  // jump the right list to a section + set rail highlight
  function scrollToSection(i) {
    const sec = itemsEl.querySelector(`#sec-${i}`);
    if (!sec) return;
    spyLock = true;
    setActiveRail(i);
    itemsEl.scrollTo({ top: sec.offsetTop - 4, behavior: 'smooth' });
    clearTimeout(spyTimer);
    spyTimer = setTimeout(() => { spyLock = false; syncScrollSpy(); }, 600);
  }

  // scrollspy: as the right list scrolls, light up the section in view on the left
  let spyLock = false, spyTimer = null, spyRAF = null;
  function syncScrollSpy() {
    if (spyLock) return;
    const secs = [...itemsEl.querySelectorAll('.menu-sec')];
    if (!secs.length) return;
    const top = itemsEl.scrollTop + 60;
    let active = +secs[0].dataset.i;
    for (const s of secs) { if (s.offsetTop <= top) active = +s.dataset.i; }
    setActiveRail(active);
  }
  itemsEl.addEventListener('scroll', () => {
    cancelAnimationFrame(spyRAF);
    spyRAF = requestAnimationFrame(syncScrollSpy);
  });

  function setActiveRail(i) {
    if (state.sub === i && railEl.querySelector('.rail-item.active')) {
      // still ensure visible
    }
    state.sub = i;
    railEl.querySelectorAll('.rail-item').forEach((el) => {
      const on = +el.dataset.i === i;
      el.classList.toggle('active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function itemRow(it) {
    const q = it.qty && Object.keys(it.qty).length;
    const ord = window.ORDERING;
    const escA = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const addBtn = (variant, price) => ord
      ? `<button class="add-btn" data-n="${escA(it.name)}" data-t="${it.type}" data-v="${escA(variant)}" data-p="${price}" aria-label="Add to cart">+</button>`
      : '';
    const priceHtml = q
      ? `<div class="price-variants">${Object.entries(it.qty)
          .map(([k, v]) => `<span class="item-price">₹${v} <small>${k}</small>${addBtn(k, v)}</span>`).join('')}</div>`
      : `<div class="item-price">₹${it.price}${addBtn('', it.price)}</div>`;
    return `
      <div class="item">
        <span class="sym ${dietClass(it.type)}"></span>
        <div class="item-main">
          <div class="item-name">${titleCase(it.name)}</div>
          <div class="item-tags"><span class="chip">${prettyType(it.type)}</span></div>
        </div>
        ${priceHtml}
      </div>`;
  }

  // diet filter (top-right)
  function syncDietButtons() {
    document.querySelectorAll('.diet-filter .df').forEach((b) =>
      b.classList.toggle('on', b.dataset.d === state.diet));
  }
  document.querySelectorAll('.diet-filter .df').forEach((b) =>
    b.addEventListener('click', () => { state.diet = b.dataset.d; syncDietButtons(); renderItems(); }));

  // search (top-right, collapsible)
  document.getElementById('searchBtn').addEventListener('click', () => {
    const row = document.getElementById('searchRow');
    const open = row.classList.toggle('hidden') === false;
    document.getElementById('searchBtn').classList.toggle('on', open);
    if (open) searchBox.focus();
    else { searchBox.value = ''; state.search = ''; renderItems(); }
  });
  searchBox.addEventListener('input', () => { state.search = searchBox.value; renderItems(); });

  // ---------- back ----------
  document.getElementById('backBtn').addEventListener('click', () => {
    screen.classList.add('hidden');
  });

  // ---------- helpers ----------
  function titleCase(s) {
    return s.toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\bAnd\b/g, 'and').replace(/Non-veg/gi, 'Non-Veg');
  }
  function prettyType(t) {
    return ({ veg: 'Veg', 'non-veg': 'Non-Veg', seafood: 'Seafood', egg: 'Egg',
              alcoholic: 'Alcoholic', 'non-alcoholic': 'Non-Alcoholic' })[t] || t;
  }

  buildCarousel();
  window.addEventListener('resize', updateCenter);

  // ---------- scroll-reveal on the home page ----------
  const revealEls = document.querySelectorAll('.welcome, .banner, .menu-section, .home-foot');
  revealEls.forEach((el) => el.classList.add('reveal'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }
})();
