/* Tidesong — the Driftwood Market: sell fish from the keepnet, buy bait, gear and bigger nets.
   game.js hands it an api object; all state lives in the shared save. */
'use strict';

const Shop = (() => {
  let api = null;
  let tab = 'sell';
  let theme = 'all';
  let sellAllArmed = 0;
  const FILTERS = [{ id: 'all', name: 'All' }, ...Gear.THEMES, { id: 'heirloom', name: 'Heirloom' }];
  const matches = (g, f) => f === 'all' || (f === 'heirloom' ? !!g.perk : g.theme === f);
  const themeName = id => (Gear.THEMES.find(x => x.id === id) || { name: '' }).name;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pearls = n => `<span class="pearl" aria-hidden="true"></span>${fmt(n)}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TABS = [
    { id: 'sell', label: 'Sell fish' },
    { id: 'bait', label: 'Bait' },
    { id: 'rods', label: 'Rods' },
    { id: 'bobbers', label: 'Bobbers' },
    { id: 'lines', label: 'Lines' },
    { id: 'net', label: 'Keepnet' },
  ];

  function init(a) {
    api = a;
    const strip = $('#shop-tabs');
    strip.innerHTML = TABS.map(t => `<button type="button" role="tab" class="tab" data-tab="${t.id}" id="tab-${t.id}" aria-controls="shop-panel">${t.label}</button>`).join('');
    strip.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b || b.dataset.tab === tab) return;
      const order = TABS.map(t => t.id), dir = Math.sign(order.indexOf(b.dataset.tab) - order.indexOf(tab));
      tab = b.dataset.tab;
      api.play('click');
      markTabs();
      // if the panel is scrolled down, glide back up so the new section starts under the tabs
      const card = $('#shop-panel').closest('.card'), tabsEl = $('#shop-tabs');
      const top = Math.max(0, $('#shop-panel').offsetTop - tabsEl.offsetHeight - 16);
      if (card.scrollTop > top) card.scrollTo({ top, behavior: UIFX.reduced() ? 'auto' : 'smooth' });
      UIFX.swap(card, $('#shop-panel'), render, dir);
    });
    $('#shop-panel').addEventListener('click', onClick);
  }

  function open(which) {
    if (which) tab = which;
    sellAllArmed = 0;
    render();
    api.openModal('#m-shop');
    api.play('open');
  }

  const isOpen = () => !$('#m-shop').hidden;

  /* ---------- render ---------- */
  function markTabs() {
    document.querySelectorAll('#shop-tabs .tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
    const tabEl = document.querySelector(`#shop-tabs [data-tab="${tab}"]`);
    if (tabEl && tabEl.scrollIntoView) tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: UIFX.reduced() ? 'auto' : 'smooth' });
  }

  /* Re-render after a change inside the current section: the card glides to its new size. */
  const settle = () => UIFX.morph($('#shop-panel').closest('.card'), render);

  function render() {
    const s = api.save;
    $('#shop-pearls').innerHTML = pearls(s.pearls);
    markTabs();
    const panel = $('#shop-panel');
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
    panel.innerHTML = tab === 'sell' ? renderSell() : tab === 'bait' ? renderBait() : tab === 'net' ? renderNet() : renderGear(tab);
    requestAnimationFrame(() => paint(api.time()));
  }

  function renderSell() {
    const s = api.save, cap = api.netCap();
    const fish = s.net.slice().sort((a, b) => b.value - a.value);
    const loose = fish.filter(f => !f.fav);
    const total = loose.reduce((a, f) => a + f.value, 0);
    const armed = Date.now() - sellAllArmed < 3200;
    const pct = Math.min(100, (s.net.length / cap) * 100);
    let html = `
      <div class="net-summary${s.net.length >= cap ? ' full' : ''}">
        <div class="net-count">
          <span><b>${s.net.length}</b> of ${cap} keepnet slots used</span>
          <span class="netbar"><i style="width:${pct}%"></i></span>
        </div>
        <button type="button" class="secondary-btn${armed ? ' armed' : ''}" data-action="sellall" ${loose.length ? '' : 'disabled'}>
          ${armed ? `Tap again to sell ${loose.length} fish` : `Sell all unstarred · ${pearls(total)}`}
        </button>
      </div>`;
    if (!fish.length) {
      html += `<p class="empty">Your keepnet is empty. Fish you keep wait here until you sell them. Star a favourite and “Sell all” will leave it alone.</p>`;
      return html;
    }
    html += '<ul class="fishlist">';
    for (const f of fish) {
      const sp = SPECIES[f.id], R = RARITIES[sp.rarity];
      const rec = s.caught[f.id] || {};
      const tags = [];
      if (rec.best && f.kg >= rec.best) tags.push('Heaviest');
      if (rec.len && f.cm >= rec.len) tags.push('Longest');
      html += `
        <li class="fishrow" style="--rc:${R.color}">
          <canvas class="fr-art" data-fish="${f.id}" aria-hidden="true"></canvas>
          <div class="fr-main">
            <span class="fr-name">${esc(sp.name)}${tags.map(t => `<em class="tag">${t}</em>`).join('')}</span>
            <span class="fr-meta"><i class="dot"></i>${R.name} · ${f.kg.toFixed(2)} kg · ${Math.round(f.cm)} cm</span>
          </div>
          <span class="fr-val">${pearls(f.value)}</span>
          <div class="fr-act">
            <button type="button" class="star-btn${f.fav ? ' on' : ''}" data-action="fav" data-uid="${f.uid}" aria-pressed="${f.fav ? 'true' : 'false'}" aria-label="${f.fav ? 'Unstar' : 'Star'} ${esc(sp.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>
            </button>
            <button type="button" class="sell-btn" data-action="sell" data-uid="${f.uid}">Sell</button>
          </div>
        </li>`;
    }
    return html + '</ul>';
  }

  function oddsLine(loc, baitId) {
    const base = rarityOdds(loc, null), boosted = rarityOdds(loc, baitId);
    const f = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
    return ['rare', 'epic', 'legendary', 'extreme'].filter(r => base[r]).map(r =>
      `<span><b style="color:${RARITIES[r].color}">${RARITIES[r].name}</b> ${f(base[r])} → ${f(boosted[r])}</span>`).join('');
  }

  function renderBait() {
    const s = api.save, loc = api.loc(), using = s.equip.bait;
    let html = `<p class="tab-note">Bait is used up each time a fish bites, caught or not. It never guarantees a rare catch, but it tilts the odds toward rarer fish and brings bites a little sooner. The figures below are for <b>${esc(loc.name)}</b>.</p><div class="items">`;
    html += `
      <article class="item${!using ? ' on' : ''}">
        <canvas class="item-art bait-art" data-bait="" aria-hidden="true"></canvas>
        <div class="item-body"><h4>No bait</h4><p>Fish the old-fashioned way. Bites come at their usual pace.</p></div>
        <div class="item-foot">${!using ? '<span class="on-pill">In use</span>' : '<button type="button" class="secondary-btn" data-action="use-bait" data-id="">Fish without bait</button>'}</div>
      </article>`;
    for (const id of BAIT_ORDER) {
      const B = BAITS[id], have = s.bait[id] || 0, on = using === id;
      const afford = s.pearls >= B.price;
      html += `
        <article class="item${on ? ' on' : ''}">
          <canvas class="item-art bait-art" data-bait="${id}" aria-hidden="true"></canvas>
          <div class="item-body">
            <h4>${B.name} <span class="have">You have ${have}</span></h4>
            <p>${B.blurb}</p>
            <div class="odds-legend">${oddsLine(loc, id)}</div>
            <p class="small">Bites come about ${Math.round((B.bite - 1) * 100)}% sooner.</p>
          </div>
          <div class="item-foot">
            <button type="button" class="buy-btn" data-action="buy-bait" data-id="${id}" ${afford ? '' : 'disabled'}>Buy ${B.pack} · ${pearls(B.price)}</button>
            ${on ? '<span class="on-pill">In use</span>' : `<button type="button" class="secondary-btn" data-action="use-bait" data-id="${id}" ${have ? '' : 'disabled'}>Use</button>`}
            ${afford ? '' : `<span class="need">Need ${pearls(B.price - s.pearls)} more</span>`}
          </div>
        </article>`;
    }
    return html + '</div>';
  }

  function perkSummary() {
    const P = api.perks(), parts = [];
    if (P.band > 1) parts.push(`green band ${Math.round((P.band - 1) * 100)}% wider`);
    if (P.drain < 1) parts.push(`meter drains ${Math.round((1 - P.drain) * 100)}% slower`);
    if (P.fill > 1) parts.push(`meter fills ${Math.round((P.fill - 1) * 100)}% faster`);
    return parts.length
      ? `<p class="perk-summary on"><b>Heirloom perks in use:</b> ${parts.join(' · ')}.</p>`
      : `<p class="perk-summary">Heirloom gear opens from level ${Gear.TIER[1].level}. Each piece adds one small perk to the reel fight: rods widen the green band, lines slow the meter's drain, bobbers fill it faster.</p>`;
  }

  function renderGear(kind) {
    const s = api.save, slot = Gear.SLOT[kind], level = api.level(), all = Gear.CATALOG[kind];
    const notes = {
      rods: 'Rods come in every style. Heirloom rods also widen the green band a little.',
      bobbers: 'Your bobber floats on the water while you wait for a bite. Heirloom bobbers fill the meter a little faster.',
      lines: 'Line shows from the rod tip all the way to the water. Heirloom lines slow the meter\u2019s drain a little.',
    };
    if (!all.some(g => matches(g, theme))) theme = 'all';
    let html = `<p class="tab-note">${notes[kind]}</p>${perkSummary()}`;
    html += `<div class="filters" role="group" aria-label="Filter by theme">${FILTERS.map(f => {
      const n = all.filter(g => matches(g, f.id)).length;
      if (!n) return '';
      return `<button type="button" class="filter${theme === f.id ? ' on' : ''}${f.id === 'heirloom' ? ' heir' : ''}" data-action="theme" data-id="${f.id}" aria-pressed="${theme === f.id}">${f.name}<span>${n}</span></button>`;
    }).join('')}</div><div class="items gear-grid">`;
    const list = all.filter(g => matches(g, theme)).slice().sort((a, b) => a.price - b.price);
    for (const g of list) {
      const owned = s.owned[kind].includes(g.id), on = s.equip[slot] === g.id;
      const locked = !owned && g.level && level < g.level;
      const afford = s.pearls >= g.price;
      let foot;
      if (on) foot = '<span class="on-pill">Equipped</span>';
      else if (owned) foot = `<button type="button" class="secondary-btn" data-action="equip" data-kind="${kind}" data-id="${g.id}">Equip</button>`;
      else if (locked) foot = `<span class="lock-pill">${LOCK}Opens at level ${g.level}</span><span class="muted">${pearls(g.price)}</span>`;
      else foot = `<button type="button" class="buy-btn" data-action="buy-gear" data-kind="${kind}" data-id="${g.id}" ${afford ? '' : 'disabled'}>Buy · ${pearls(g.price)}</button>${afford ? '' : `<span class="need">Need ${pearls(g.price - s.pearls)} more</span>`}`;
      html += `
        <article class="item gear${on ? ' on' : ''}${owned ? '' : ' unowned'}${g.perk ? ' heirloom' : ''}">
          <div class="art-wrap">
            <canvas class="item-art gear-art ${kind}" data-gear="${kind}" data-id="${g.id}" aria-hidden="true"></canvas>
            <span class="theme-tag">${themeName(g.theme)}</span>
          </div>
          <div class="item-body">
            <h4>${esc(g.name)}${g.perk ? '<span class="heir-tag">Heirloom</span>' : ''}</h4>
            <p>${esc(g.blurb)}</p>
            ${g.perk ? `<p class="perk-line">${Gear.perkText(g.perk)}</p>` : ''}
          </div>
          <div class="item-foot">${foot}</div>
        </article>`;
    }
    return html + '</div>';
  }

  function renderNet() {
    const s = api.save, cur = s.netTier;
    let html = `<p class="tab-note">A bigger keepnet lets you hold more fish before you have to sell. Upgrades are bought in order.</p><ol class="ladder">`;
    NET_TIERS.forEach((tier, i) => {
      const state = i < cur ? 'past' : i === cur ? 'current' : i === cur + 1 ? 'next' : 'later';
      const afford = s.pearls >= tier.price;
      let right = '';
      if (state === 'current') right = '<span class="on-pill">Your net</span>';
      else if (state === 'past') right = '<span class="muted">Outgrown</span>';
      else if (state === 'next') right = `<button type="button" class="buy-btn" data-action="buy-net" ${afford ? '' : 'disabled'}>Upgrade · ${pearls(tier.price)}</button>${afford ? '' : `<span class="need">Need ${pearls(tier.price - s.pearls)} more</span>`}`;
      else right = `<span class="muted">${pearls(tier.price)}</span>`;
      html += `<li class="rung ${state}"><div><b>${tier.name}</b><span>${tier.cap} fish</span></div><div class="rung-act">${right}</div></li>`;
    });
    return html + '</ol>';
  }

  /* ---------- previews ---------- */
  function paint(t) {
    if (!isOpen()) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const view = $('#m-shop .card').getBoundingClientRect();
    document.querySelectorAll('#shop-panel canvas').forEach(c => {
      const b = c.getBoundingClientRect();
      if (b.bottom < view.top || b.top > view.bottom) return;
      if (c.dataset.fish) {
        if (c.dataset.done) return;
        const w = c.clientWidth, h = c.clientHeight;
        if (!w) return;
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        const x = c.getContext('2d');
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.drawImage(FishGL.render(c.dataset.fish, 0.6, w * dpr, h * dpr, { still: true, fit: 0.98 }), 0, 0, w, h);
        c.dataset.done = '1';
      } else if (c.dataset.bait !== undefined) {
        Gear.preview(c, 'bait', c.dataset.bait || null, t, dpr);
      } else if (c.dataset.gear) {
        Gear.preview(c, c.dataset.gear, c.dataset.id, t, dpr);
      }
    });
  }

  /* ---------- actions ---------- */
  function spend(price) {
    const s = api.save;
    if (s.pearls < price) { api.play('deny'); return false; }
    s.pearls -= price;
    return true;
  }

  function sellFish(uids) {
    const s = api.save;
    let total = 0, n = 0;
    for (const uid of uids) {
      const i = s.net.findIndex(f => f.uid === uid);
      if (i < 0) continue;
      const f = s.net[i];
      s.net.splice(i, 1);
      total += f.value; n += 1;
      if (s.caught[f.id]) s.caught[f.id].sold = (s.caught[f.id].sold || 0) + 1;
    }
    if (!n) return;
    s.pearls += total;
    s.stats.sold += n;
    s.stats.earned += total;
    api.play('coin', n);
    if (n > 1) api.toast(`Sold ${n} fish for ${fmt(total)} Moonpearls`, '#e8c46c', 2600);
    api.flashWallet();
  }

  function onClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const s = api.save, id = b.dataset.id;
    switch (b.dataset.action) {
      case 'sell':
        sellFish([+b.dataset.uid]);
        break;
      case 'fav': {
        const f = s.net.find(x => x.uid === +b.dataset.uid);
        if (f) { f.fav = !f.fav; api.play('equip'); }
        break;
      }
      case 'sellall': {
        if (Date.now() - sellAllArmed < 3200) {
          sellAllArmed = 0;
          sellFish(s.net.filter(f => !f.fav).map(f => f.uid));
        } else {
          sellAllArmed = Date.now();
          api.play('click');
          setTimeout(() => { if (isOpen() && tab === 'sell' && sellAllArmed) { sellAllArmed = 0; settle(); } }, 3300);
        }
        break;
      }
      case 'buy-bait': {
        const B = BAITS[id];
        if (!spend(B.price)) return;
        s.bait[id] = (s.bait[id] || 0) + B.pack;
        if (!s.equip.bait) s.equip.bait = id;
        api.play('buy');
        break;
      }
      case 'use-bait':
        s.equip.bait = id || null;
        api.play('equip');
        break;
      case 'theme':
        theme = id;
        api.play('click');
        UIFX.swap($('#shop-panel').closest('.card'), $('#shop-panel'), render, 0);
        return;
      case 'buy-gear': {
        const kind = b.dataset.kind, g = Gear.CATALOG[kind].find(x => x.id === id);
        if (!g || (g.level && api.level() < g.level)) { api.play('deny'); return; }
        if (!spend(g.price)) return;
        s.owned[kind].push(id);
        s.equip[Gear.SLOT[kind]] = id;
        api.play('buy');
        api.toast(g.perk ? `${g.name} is yours and equipped. ${Gear.perkText(g.perk)}.` : `${g.name} is yours and equipped`, '#e8c46c', g.perk ? 4200 : 2400);
        break;
      }
      case 'equip':
        s.equip[Gear.SLOT[b.dataset.kind]] = id;
        api.play('equip');
        break;
      case 'buy-net': {
        const next = NET_TIERS[s.netTier + 1];
        if (!next || !spend(next.price)) return;
        s.netTier += 1;
        api.play('buy');
        api.toast(`Upgraded to the ${next.name}: room for ${next.cap} fish`, '#9fe3b0', 2800);
        break;
      }
    }
    api.persist();
    api.refresh();
    settle();
  }

  return { init, open, render, isOpen, paint, get tab() { return tab; } };
})();
