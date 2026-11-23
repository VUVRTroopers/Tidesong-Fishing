/* Tidesong — the Driftwood Market: bait, gear and aquariums. Fish are kept and sold in the aquarium
   itself (js/tank.js). game.js hands it an api object; all state lives in the shared save. */
'use strict';

const Shop = (() => {
  let api = null;
  let tab = 'bait';
  let theme = 'all';
  const FILTERS = [{ id: 'all', name: 'All' }, ...Gear.THEMES, { id: 'heirloom', name: 'Heirloom' }];
  const matches = (g, f) => f === 'all' || (f === 'heirloom' ? !!g.heir : g.theme === f);
  const themeName = id => (Gear.THEMES.find(x => x.id === id) || { name: '' }).name;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pearls = n => `<span class="pearl" aria-hidden="true"></span>${fmt(n)}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TABS = [
    { id: 'bait', label: 'Bait' },
    { id: 'rods', label: 'Rods' },
    { id: 'bobbers', label: 'Bobbers' },
    { id: 'lines', label: 'Lines' },
    { id: 'tanks', label: 'Aquariums' },
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
    if (which && TABS.some(t => t.id === which)) tab = which;
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
    panel.innerHTML = tab === 'bait' ? renderBait() : tab === 'tanks' ? renderTanks() : renderGear(tab);
    requestAnimationFrame(() => paint(api.time()));
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

  const pct = v => `${Math.round(v * 10) / 10}%`;

  /* The equipped piece for this slot, where it sits on the ladder, and what the whole kit adds to a fight. */
  function renderKit(kind) {
    const s = api.save, slot = Gear.SLOT[kind], cur = Gear.CATALOG[kind].find(g => g.id === s.equip[slot]) || Gear.CATALOG[kind][0];
    const T = Gear.TIERS, level = api.level(), P = api.perks();
    const owned = new Set(s.owned[kind].map(id => (Gear.CATALOG[kind].find(g => g.id === id) || {}).tier));
    const pips = T.map(t => {
      const state = t.n < cur.tier ? 'done' : t.n === cur.tier ? 'on' : 'ahead';
      const locked = t.level && level < t.level;
      const label = `${t.name}, ${t.pct ? `${pct(t.pct)} boost` : 'no boost'}${owned.has(t.n) ? ', owned' : ''}${locked ? `, opens at level ${t.level}` : ''}`;
      return `<li${t.n === 6 ? ' class="heir-start"' : ''}><button type="button" class="pip ${state}${t.heir ? ' heir' : ''}${owned.has(t.n) ? ' owned' : ''}${locked ? ' locked' : ''}" data-action="jump" data-tier="${t.n}" aria-label="${label}"${t.n === cur.tier ? ' aria-current="true"' : ''}>
        <i>${t.n ? t.mark : '•'}</i><span>${t.n ? `<em>${kind === 'lines' ? '−' : '+'}</em>${pct(t.pct)}` : '0%'}</span></button></li>`;
    }).join('');
    const nouns = { rods: 'rod', bobbers: 'bobber', lines: 'line' };
    return `
      <div class="kit">
        <p class="kit-now"><span class="kit-label">Your ${nouns[kind]}</span><b>${esc(cur.name)}</b>
          <span class="kit-perk${cur.heir ? ' heir' : ''}">${T[cur.tier].name}${cur.perk ? ` · ${Gear.perkText(cur.perk)}` : ' · no boost yet'}</span></p>
        <ol class="tier-track" style="--fill:${cur.tier / (T.length - 1)}">${pips}</ol>
        <p class="kit-all">Your whole kit in a fight: <b>band +${pct((P.band - 1) * 100)}</b> · <b>fill +${pct((P.fill - 1) * 100)}</b> · <b>drain −${pct((1 - P.drain) * 100)}</b></p>
      </div>`;
  }

  function gearCard(kind, g) {
    const s = api.save, slot = Gear.SLOT[kind], level = api.level();
    const owned = s.owned[kind].includes(g.id), on = s.equip[slot] === g.id;
    const locked = !owned && g.level && level < g.level;
    const afford = s.pearls >= g.price;
    let foot;
    if (on) foot = '<span class="on-pill">Equipped</span>';
    else if (owned) foot = `<button type="button" class="secondary-btn" data-action="equip" data-kind="${kind}" data-id="${g.id}">Equip</button>`;
    else if (locked) foot = `<span class="lock-pill">${LOCK}Opens at level ${g.level}</span>`;
    else foot = `<button type="button" class="buy-btn" data-action="buy-gear" data-kind="${kind}" data-id="${g.id}" ${afford ? '' : 'disabled'}>Buy · ${pearls(g.price)}</button>${afford ? '' : `<span class="need">Need ${pearls(g.price - s.pearls)} more</span>`}`;
    return `
        <article class="item gear${on ? ' on' : ''}${owned ? '' : ' unowned'}${g.heir ? ' heirloom' : ''}">
          <div class="art-wrap">
            <canvas class="item-art gear-art ${kind}" data-gear="${kind}" data-id="${g.id}" aria-hidden="true"></canvas>
            <span class="theme-tag">${themeName(g.theme)}</span>
            ${g.pct ? `<span class="boost-tag${g.heir ? ' heir' : ''}">${Gear.perkShort(kind, g.pct)}</span>` : ''}
          </div>
          <div class="item-body">
            <h4>${esc(g.name)}${g.heir ? '<span class="heir-tag">Heirloom</span>' : ''}</h4>
            <p>${esc(g.blurb)}</p>
          </div>
          <div class="item-foot">${foot}</div>
        </article>`;
  }

  function renderGear(kind) {
    const all = Gear.CATALOG[kind], level = api.level();
    const notes = {
      rods: 'Rods widen the green band. Every rod on a tier costs the same and gives the same boost, so choose whichever style you love.',
      bobbers: 'Bobbers make the meter fill faster while the fish is in your band. Every bobber on a tier costs the same and does the same.',
      lines: 'Lines slow the meter\u2019s drain when the fish slips out of your band. Every line on a tier costs the same and does the same.',
    };
    if (!all.some(g => matches(g, theme))) theme = 'all';
    let html = `<p class="tab-note">${notes[kind]}</p>${renderKit(kind)}`;
    html += `<div class="filters" role="group" aria-label="Filter by theme">${FILTERS.map(f => {
      const n = all.filter(g => matches(g, f.id)).length;
      if (!n) return '';
      return `<button type="button" class="filter${theme === f.id ? ' on' : ''}${f.id === 'heirloom' ? ' heir' : ''}" data-action="theme" data-id="${f.id}" aria-pressed="${theme === f.id}">${f.name}<span>${n}</span></button>`;
    }).join('')}</div>`;
    const order = Gear.THEMES.map(t => t.id);
    for (const T of Gear.TIERS) {
      const list = all.filter(g => g.tier === T.n && matches(g, theme)).sort((a, b) => order.indexOf(a.theme) - order.indexOf(b.theme));
      if (!list.length) continue;
      const locked = T.level && level < T.level;
      const cost = !T.n ? '<span class="tier-cost free">Where you began</span>'
        : `<span class="tier-cost">${locked ? `${LOCK}Level ${T.level} · ` : ''}${pearls(T.price)}</span>`;
      html += `
      <section class="tier-group${T.heir ? ' heir' : ''}${locked ? ' locked' : ''}" id="tier-${kind}-${T.n}" aria-label="${T.name}">
        <header class="tier-head">
          <span class="tier-mark">${T.n ? T.mark : '•'}</span>
          <div class="tier-title"><b>${T.name}</b><span>${T.n ? Gear.perkText(Gear.CATALOG[kind].find(g => g.tier === T.n).perk) : 'No boost'}</span></div>
          ${cost}
        </header>
        <div class="items gear-grid">${list.map(g => gearCard(kind, g)).join('')}</div>
      </section>`;
    }
    return html;
  }

  function renderTanks() {
    const s = api.save, cur = s.netTier, here = TANKS[cur];
    let html = `<p class="tab-note">Fish you keep live in your aquarium. Each tank holds more fish than the last, and each is more elaborate, with more for your fish to explore. Your fish move house with you. Tanks are bought in order.</p>
      <div class="tank-visit"><span>Your fish live in the <b>${esc(here.name)}</b>: ${s.net.length} of ${here.cap}.</span><button type="button" class="secondary-btn" data-action="visit">Visit your tank</button></div>
      <div class="items tank-grid">`;
    TANKS.forEach((T, i) => {
      const state = i < cur ? 'past' : i === cur ? 'current' : i === cur + 1 ? 'next' : 'later';
      const afford = s.pearls >= T.price;
      let foot;
      if (state === 'current') foot = '<span class="on-pill">Your tank</span>';
      else if (state === 'past') foot = '<span class="muted">Outgrown</span>';
      else if (state === 'next') foot = `<button type="button" class="buy-btn" data-action="buy-tank" ${afford ? '' : 'disabled'}>Move in · ${pearls(T.price)}</button>${afford ? '' : `<span class="need">Need ${pearls(T.price - s.pearls)} more</span>`}`;
      else foot = `<span class="muted">${pearls(T.price)} · after the ${esc(TANKS[i - 1].name)}</span>`;
      html += `
        <article class="item tank-item ${state}${state === 'current' ? ' on' : ''}">
          <canvas class="item-art tank-art" data-tank="${T.id}" aria-hidden="true"></canvas>
          <div class="item-body">
            <h4>${esc(T.name)} <span class="have">${T.cap} fish</span></h4>
            <p>${esc(T.blurb)}</p>
          </div>
          <div class="item-foot">${foot}</div>
        </article>`;
    });
    return html + '</div>';
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
      } else if (c.dataset.tank) {
        Tank.preview(c, c.dataset.tank, t);
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

  function onClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const s = api.save, id = b.dataset.id;
    switch (b.dataset.action) {
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
        api.play('buy');
        // a new piece goes straight on, unless it would be a step down the ladder from what is equipped
        const slot = Gear.SLOT[kind], cur = Gear.CATALOG[kind].find(x => x.id === s.equip[slot]);
        if (!cur || g.tier >= cur.tier) {
          s.equip[slot] = id;
          api.toast(`${g.name} is yours and equipped. ${Gear.perkText(g.perk)}.`, '#e8c46c', 3600);
        } else {
          api.toast(`${g.name} is yours. ${cur.name} stays equipped for its higher tier; swap whenever you like.`, '#e8c46c', 4200);
        }
        break;
      }
      case 'jump': {
        const n = +b.dataset.tier, card = $('#shop-panel').closest('.card');
        const go = () => {
          const sec = document.getElementById(`tier-${tab}-${n}`);
          if (!sec) return;
          // the section's scroll-margin keeps its label clear of the sticky tabs
          sec.scrollIntoView({ block: 'start', behavior: UIFX.reduced() ? 'auto' : 'smooth' });
          sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
        };
        api.play('click');
        if (!document.getElementById(`tier-${tab}-${n}`)) { theme = 'all'; UIFX.morph(card, render); requestAnimationFrame(go); } else go();
        return;
      }
      case 'equip':
        s.equip[Gear.SLOT[b.dataset.kind]] = id;
        api.play('equip');
        break;
      case 'buy-tank': {
        const next = TANKS[s.netTier + 1];
        if (!next || !spend(next.price)) return;
        s.netTier += 1;
        api.play('buy');
        api.toast(`Your fish have moved into the ${next.name}: room for ${next.cap}`, '#9fe3b0', 3200);
        break;
      }
      case 'visit':
        api.openTank();
        return;
    }
    api.persist();
    api.refresh();
    settle();
  }

  return { init, open, render, isOpen, paint, get tab() { return tab; } };
})();
