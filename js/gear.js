/* Tidesong — gear (rods, bobbers, lines) with the painters that draw them, plus bait icons.
   Every piece sits on a rung of one shared tier ladder. A rung sets the price and the boost, and every
   theme is offered on most rungs, so a player picks a look without giving anything up. Rods widen the
   green band, bobbers fill the meter faster, lines slow its drain. The top three rungs are Heirlooms,
   which also need a fishing level. */
'use strict';

const Gear = (() => {
  const TAU = Math.PI * 2;
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => {
    const A = rgb(a), B = rgb(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
  };
  const mixStops = (stops, k) => {
    const f = Math.max(0, Math.min(1, k)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f));
    return mix(stops[i], stops[i + 1], f - i);
  };
  function rg(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function lgr(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function halo(ctx, x, y, r, rgbStr, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg(ctx, x, y, 0, r, [[0, `rgba(${rgbStr},${a})`], [0.4, `rgba(${rgbStr},${a * 0.35})`], [1, `rgba(${rgbStr},0)`]]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  function starPath(ctx, x, y, r, points = 5, inner = 0.45, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 ? r * inner : r, a = rot + (i / (points * 2)) * TAU;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function twinkle(ctx, x, y, r, a, col = '#ffffff') {
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }
  function flower(ctx, x, y, s, petal, centre, rot = 0, n = 5) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = petal;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.5, s * 0.34, a, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = centre;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function crown(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - w / 2, y - h * 0.75); ctx.lineTo(x - w / 4, y - h * 0.35); ctx.lineTo(x, y - h);
    ctx.lineTo(x + w / 4, y - h * 0.35); ctx.lineTo(x + w / 2, y - h * 0.75); ctx.lineTo(x + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = lgr(ctx, 0, y - h, 0, y, [[0, '#fff3b0'], [0.5, '#f6c843'], [1, '#b07a12']]);
    ctx.fill();
  }

  /* ================= Lighting =================
     Gear is lit by the lake's light (Scenes.lighting()): a direction (x right, y up, z towards the viewer),
     key and ambient colours, a rim colour and how dark it is. The shop uses a neutral studio light. */
  const STUDIO = { dir: [-0.5, 0.62, 0.72], key: [1, 1, 1], amb: [0.64, 0.64, 0.64], rim: [0.9, 0.94, 1], night: 0, water: [0.16, 0.36, 0.44] };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lum3 = c => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const rgbOf = (c, k = 1) => `${Math.round(clamp01(c[0] * k) * 255)},${Math.round(clamp01(c[1] * k) * 255)},${Math.round(clamp01(c[2] * k) * 255)}`;
  /* 2D shading terms: the light's direction on screen, how much it lies in the picture plane,
     and a dim colour that pulls lit colours toward key × ambient (c·(1-dim) + T·dim ≈ c·f). */
  const shadeCache = new WeakMap();
  function shading(Lt) {
    let sh = shadeCache.get(Lt);
    if (sh) return sh;
    const d = Lt.dir, lx = d[0], ly = -d[1], lm = Math.hypot(lx, ly) || 1;
    const f = [0, 1, 2].map(i => Lt.amb[i] * 0.8 + Lt.key[i] * 0.42);
    const dim = Math.max(0, Math.min(0.6, 1 - lum3(f)));
    const T = f.map(v => (dim > 0.02 ? clamp01((0.5 * (v - (1 - dim))) / dim) : 0));
    sh = { lx: lx / lm, ly: ly / lm, plane: Math.min(1, lm / Math.hypot(d[0], d[1], d[2])), dim, T, key: Lt.key, rim: Lt.rim || STUDIO.rim, night: Lt.night || 0 };
    shadeCache.set(Lt, sh);
    return sh;
  }
  /* A colour as the lake's light shows it (hex only; anything else passes through). */
  function toner(sh) {
    if (sh.dim <= 0.02) return c => c;
    const T = sh.T.map(v => v * 255), k = 1 - sh.dim, cache = {};
    return c => {
      if (typeof c !== 'string' || c[0] !== '#' || c.length !== 7) return c;
      if (cache[c]) return cache[c];
      const n = parseInt(c.slice(1), 16), C = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return (cache[c] = `rgb(${C.map((v, i) => Math.round(v * k + T[i] * sh.dim)).join(',')})`);
    };
  }
  /* ================= Themes & perks ================= */
  const THEMES = [
    { id: 'classic', name: 'Classic' },
    { id: 'cosmic', name: 'Cosmic' },
    { id: 'blossom', name: 'Blossom' },
    { id: 'critters', name: 'Critters' },
    { id: 'beach', name: 'Beach' },
    { id: 'mountain', name: 'Mountain' },
    { id: 'bakery', name: 'Bakery' },
  ];
  /* The tier ladder, shared by rods, bobbers and lines. Equal 2.5% steps from the starter kit to 20%.
     Prices grow about 2.5x a rung, so the first upgrades come within minutes and Tier V takes a few
     hours. Heirlooms also need a fishing level. Tuned in simulation alongside the legendary and extreme
     fights in REEL (js/data.js): each rung lifts the odds on the hardest fish noticeably, a full Tier V
     kit still leaves the Dragon Fish a real contest, and only the full Heirloom kit makes it routine. */
  const TIERS = [
    { n: 0, name: 'Starter',      mark: '—',   pct: 0,    price: 0 },
    { n: 1, name: 'Tier I',       mark: 'I',   pct: 2.5,  price: 250 },
    { n: 2, name: 'Tier II',      mark: 'II',  pct: 5,    price: 750 },
    { n: 3, name: 'Tier III',     mark: 'III', pct: 7.5,  price: 2000 },
    { n: 4, name: 'Tier IV',      mark: 'IV',  pct: 10,   price: 5000 },
    { n: 5, name: 'Tier V',       mark: 'V',   pct: 12.5, price: 12000 },
    { n: 6, name: 'Heirloom I',   mark: 'I',   pct: 15,   price: 36000, level: 18, heir: true },
    { n: 7, name: 'Heirloom II',  mark: 'II',  pct: 17.5, price: 55000, level: 22, heir: true },
    { n: 8, name: 'Heirloom III', mark: 'III', pct: 20,   price: 80000, level: 26, heir: true },
  ];
  const TOP_LEVEL = TIERS[TIERS.length - 1].level;
  /* Which part of the fight each slot improves. */
  const PERK_KEY = { rods: 'band', bobbers: 'fill', lines: 'drain' };
  const perkFor = (kind, pct) => ({ [PERK_KEY[kind]]: PERK_KEY[kind] === 'drain' ? 1 - pct / 100 : 1 + pct / 100 });
  const pctText = v => `${Math.round(v * 10) / 10}%`;
  function perkText(p) {
    if (!p) return '';
    if (p.band) return `Green band ${pctText((p.band - 1) * 100)} wider`;
    if (p.drain) return `Meter drains ${pctText((1 - p.drain) * 100)} slower`;
    if (p.fill) return `Meter fills ${pctText((p.fill - 1) * 100)} faster`;
    return '';
  }
  /* The same boost as a short label for a slot at a tier, e.g. "Band +7.5%". */
  const PERK_SHORT = { rods: 'Band', bobbers: 'Fill', lines: 'Drain' };
  const perkShort = (kind, pct) => `${PERK_SHORT[kind]} ${kind === 'lines' ? '−' : '+'}${pctText(pct)}`;

  /* ================= Rods =================
     tier: the rung on the ladder above. Price, level and boost all come from it. */
  const RODS = [
    // classic
    { id: 'willow', theme: 'classic', name: 'Willow Switch', tier: 0, blurb: 'Your first rod. Graphite-dark and dependable.',
      blank: ['#2c2a33', '#38343f'], grip: '#a57c52', cork: true, seat: '#1b1a1f', guide: '#cfc6b4',
      reel: ['#d9d4cc', '#8d887f', '#4a4640'], knob: '#e8c46c', tip: '#e8c46c' },
    { id: 'birch', theme: 'classic', name: 'Birchwood Classic', tier: 1, blurb: 'Hand-planed birch with walnut wraps. Smells faintly of summer.',
      blank: ['#a77b4c', '#e0c79f'], grip: '#5b3a24', seat: '#3a2418', wrap: '#5a2f1d', guide: '#d8cdb8',
      reel: ['#d2a876', '#7a5434', '#3e2716'], knob: '#f1dcb4', tip: '#5a2f1d' },
    { id: 'mariner', theme: 'classic', name: "Mariner's Brass", tier: 2, blurb: 'Navy lacquer, polished brass fittings and a reel that clicks like a pocket watch.',
      blank: ['#172845', '#2a4573'], grip: '#2a1c14', seat: '#c9a24a', wrap: '#e0b45a', guide: '#f0cf7a',
      reel: ['#fff0b8', '#d9a84a', '#7a5518'], knob: '#20365c', tip: '#e0b45a', gloss: true },
    { id: 'splitcane', theme: 'classic', name: 'Split Cane', tier: 4, blurb: 'Six strips of golden bamboo, split by hand and bound in burgundy silk. Rods were made this way for a century.',
      blank: ['#c08a3a', '#e9c57c'], grip: '#c8a06a', cork: true, seat: '#c9ced6', wrap: '#7a1f2a', guide: '#e8e2d4',
      reel: ['#f4f2ec', '#aaa69c', '#4a4640'], knob: '#3a2418', tip: '#7a1f2a', decor: ['nodes'], gloss: true },
    { id: 'dragonbone', theme: 'classic', name: 'Dragonbone', tier: 5, blurb: 'Carved from a shed dragon spine. Ember runes smoulder along its length.',
      blank: ['#5e0d17', '#e2622a'], grip: '#2a0c10', seat: '#ffcf5a', wrap: '#ffcf5a', guide: '#ffd98a',
      reel: ['#ffe9a6', '#e0702a', '#6e1414'], knob: '#ffcf5a', tip: '#ffb347', decor: ['runes', 'embers'], glow: '255,110,60', tipStyle: 'spark' },
    // critters
    { id: 'fetch', theme: 'critters', name: 'Fetch Stick', tier: 1, blurb: 'A very good stick, chosen with great care by a very good dog. The reel is a tennis ball.',
      blank: ['#6b4a2c', '#94744c'], grip: '#5a3c22', seat: '#4a3220', guide: '#d8cdb8', thick: 1.15,
      decor: ['bark'], reelStyle: 'tennis', knob: '#ffffff', tip: '#94744c' },
    { id: 'tabby', theme: 'critters', name: 'Tabby Tail', tier: 3, blurb: 'Marmalade stripes all the way up, ending in a fluffy tail that never stops twitching.',
      blank: ['#e8913a', '#f6b673'], stripes: { color: '#a8521c', n: 16, slant: 0.5, width: 0.42 }, grip: '#f6e6d0', seat: '#3a2a22',
      wrap: '#f6e6d0', guide: '#f6e6d0', reel: ['#fff3e0', '#f0b27a', '#a8521c'], knob: '#ff9eb5', tip: '#f6b673', tipStyle: 'tail' },
    { id: 'kingfisher', theme: 'critters', name: 'Kingfisher', tier: 5, blurb: 'Iridescent kingfisher blue over a copper-orange grip, crowned with a plume. The finest fisher on any river.',
      stops: ['#0b3a6a', '#1680c8', '#28b8e0', '#8ae8f2'], grip: '#d8662a', seat: '#ffd08a', wrap: '#ff9a4a', guide: '#fff0d8',
      reel: ['#fff4e0', '#ff9a4a', '#8a3a10'], knob: '#1680c8', tip: '#ff9a4a', decor: ['feathers'], tipStyle: 'plume', glow: '90,200,255', gloss: true },
    // beach
    { id: 'driftwood', theme: 'beach', name: 'Driftwood', tier: 1, blurb: 'Sun-bleached driftwood with rope wraps and a seashell reel.',
      blank: ['#bcae96', '#e6dccb'], grip: '#a89880', seat: '#8a7a64', wrap: '#c8a46a', guide: '#e9e2d4',
      decor: ['bark'], reelStyle: 'shell', knob: '#f4c9c0', tip: '#c8a46a' },
    { id: 'coral', theme: 'beach', name: 'Coral Lacquer', tier: 3, blurb: 'Rose-pink lacquer over coral wood, gilded wraps and a pearl reel.',
      blank: ['#b8395f', '#ffadbf'], grip: '#f6efe6', seat: '#e8c46c', wrap: '#f2cf6e', guide: '#fff1c9',
      reel: ['#ffffff', '#f3dce6', '#b99aac'], knob: '#ff8aa5', tip: '#f2cf6e', gloss: true },
    { id: 'surf', theme: 'beach', name: 'Sunset Surf', tier: 5, blurb: 'Retro sunset stripes, like a longboard at golden hour.',
      stops: ['#ff5f6d', '#ff9a5a', '#ffd36b', '#7fd6c8'], stripes: { color: 'rgba(255,255,255,0.8)', n: 9, slant: 0, width: 0.16 },
      grip: '#2b3a55', seat: '#ffd36b', wrap: '#ffffff', guide: '#ffffff', reel: ['#ffffff', '#7fd6c8', '#2b7a8a'], knob: '#ff5f6d', tip: '#ffffff', gloss: true },
    { id: 'trident', theme: 'beach', name: 'Trident of the Tides', tier: 7,
      blurb: 'A sea king’s golden trident, reforged as a rod. The tide itself steadies your hand.',
      stops: ['#0f5b6b', '#1fa3a8', '#7fe6d8'], grip: '#d9a83a', seat: '#ffd86b', wrap: '#ffd86b', guide: '#ffe7a0',
      reel: ['#fff4c2', '#e8b94a', '#8a5a12'], knob: '#7fe6d8', tip: '#ffd86b', tipStyle: 'trident', glow: '120,230,220', decor: ['bubbles'], gloss: true },
    // mountain
    { id: 'alpine', theme: 'mountain', name: 'Alpine Ash', tier: 2, blurb: 'Pale ash wood, red-and-white checked wraps and a leather grip. Smells of pine.',
      blank: ['#cdb48c', '#e8d8bc'], grip: '#7a4a2a', seat: '#5a3620', wrap: '#c8323a', check: '#ffffff', guide: '#d8d0c4',
      reel: ['#e9e4dc', '#9a948a', '#4a4640'], knob: '#c8323a', tip: '#c8323a' },
    { id: 'evergreen', theme: 'mountain', name: 'Evergreen', tier: 4, blurb: 'Spruce-green lacquer with copper wraps and fresh pine sprigs tucked along the blank.',
      stops: ['#18301f', '#2c5234', '#4c7a46'], grip: '#5a3a22', seat: '#b8733a', wrap: '#c8803a', guide: '#f0d0a8',
      reel: ['#ffd8b0', '#c8803a', '#5a2e12'], knob: '#2c5234', tip: '#c8803a', decor: ['boughs'], tipStyle: 'cone', gloss: true },
    { id: 'glacier', theme: 'mountain', name: 'Glacier Crystal', tier: 5, blurb: 'Cut from blue glacier ice that never melts. Frost blooms along its length.',
      stops: ['#8fd0ff', '#e6f7ff', '#b0e2ff'], grip: '#3c5a78', seat: '#dff3ff', wrap: '#ffffff', guide: '#ffffff',
      reel: ['#ffffff', '#bfe6ff', '#5d8fb8'], knob: '#ffffff', tip: '#ffffff', glow: '170,225,255', decor: ['frost'], tipStyle: 'snowcap', gloss: true },
    // blossom
    { id: 'sakura', theme: 'blossom', name: 'Sakura Branch', tier: 2, blurb: 'A blossoming cherry branch, polished smooth. Petals drift from it while you fish.',
      blank: ['#5a3a32', '#7a524a'], grip: '#3e2822', seat: '#ffb7c9', wrap: '#ffd3df', guide: '#ffe3ea',
      reel: ['#fff0f4', '#ffbfd0', '#c46a86'], knob: '#ffffff', tip: '#ffc3d6', decor: ['blossoms', 'petals'], tipStyle: 'flower' },
    { id: 'wisteria', theme: 'blossom', name: 'Wisteria', tier: 4, blurb: 'Pearl-white lacquer hung with trailing wisteria that sways as you fish.',
      blank: ['#d6cde2', '#f4f0f8'], grip: '#5e4270', seat: '#c8a2e8', wrap: '#b48ae0', guide: '#f2eaff',
      reel: ['#ffffff', '#e2d2f6', '#8a6ab8'], knob: '#c8a2e8', tip: '#b48ae0', decor: ['wisteria'], tipStyle: 'flower', bloom: ['#c8a2f0', '#fff0a8'], gloss: true },
    { id: 'ribbon', theme: 'blossom', name: 'Ribbon & Lace', tier: 5, blurb: 'Lilac lacquer spiralled in satin ribbon, finished with a bow and a pearl.',
      blank: ['#c9b2ff', '#f3d6ff'], stripes: { color: '#ff9ec4', n: 15, slant: 1.1, width: 0.36 }, grip: '#ffffff', seat: '#ff9ec4',
      wrap: '#ffffff', guide: '#ffffff', reel: ['#ffffff', '#f2e6ff', '#b9a2d6'], knob: '#ff9ec4', tip: '#ffffff', decor: ['bow'], gloss: true },
    { id: 'rose', theme: 'blossom', name: 'Enchanted Rose', tier: 6,
      blurb: 'A rose stem kept under glass and charmed never to wilt. Neither does your grip.',
      blank: ['#1f5a32', '#3f8a4e'], grip: '#5a0f24', seat: '#e8c46c', wrap: '#e8c46c', guide: '#ffe7a3',
      reel: ['#fff1f4', '#ff7a9a', '#8a0f2e'], knob: '#e8c46c', tip: '#c8123a', tipStyle: 'rose', glow: '255,120,160', decor: ['leaves', 'petals'] },
    // cosmic
    { id: 'twilight', theme: 'cosmic', name: 'Twilight Reed', tier: 2, blurb: 'Dusk-blue lacquer fading to rose, with a crescent moon at the tip and the first stars coming out.',
      stops: ['#1b1f4a', '#36397a', '#7a5aa8', '#e89ab8'], grip: '#141634', seat: '#c8d0ff', wrap: '#dfe4ff', guide: '#e8ecff',
      reel: ['#ffffff', '#c9cff0', '#5a5f9a'], knob: '#ffd98a', tip: '#fff3c4', decor: ['specks'], tipStyle: 'moon', gloss: true },
    { id: 'aurora', theme: 'cosmic', name: 'Aurora Glass', tier: 3, blurb: 'Spun from northern-lights glass. It glows and shifts colour as it moves.',
      hue: true, grip: '#20314a', seat: '#c8d6ff', wrap: '#e8f4ff', guide: '#e8f4ff',
      reel: ['#ffffff', '#c9d6ea', '#6d7f9c'], knob: '#7ff6dc', tip: '#e8f4ff', glow: '120,240,220', gloss: true },
    { id: 'nebula', theme: 'cosmic', name: 'Nebula Wand', tier: 4, blurb: 'Starlight swirled into violet and teal clouds, crowned with a newborn star.',
      stops: ['#2a0f4a', '#7a2a9a', '#e05ab8', '#5ad6ff'], grip: '#1a0f2e', seat: '#c8a2ff', wrap: '#e8d6ff', guide: '#f2e6ff',
      reel: ['#ffffff', '#c8a2ff', '#4a2a7a'], knob: '#5ad6ff', tip: '#ffffff', decor: ['nebula', 'specks'], tipStyle: 'star', glow: '200,140,255' },
    { id: 'starforged', theme: 'cosmic', name: 'Starforged', tier: 5, blurb: 'A midnight blank flecked with living starlight and golden filigree.',
      blank: ['#0d1130', '#1f2758'], grip: '#151a3a', seat: '#e8c46c', wrap: '#f5d27a', guide: '#ffe7a3',
      reel: ['#fff6cf', '#e8c04f', '#8a6414'], knob: '#ffffff', tip: '#fff3c4', decor: ['specks'], glow: '255,220,140', tipStyle: 'spark' },
    { id: 'horizon', theme: 'cosmic', name: 'Event Horizon', tier: 8,
      blurb: 'Forged at the edge of a black hole. Light bends around it, and so do the fish.',
      blank: ['#050507', '#16161f'], grip: '#0a0a10', seat: '#ffb35a', wrap: '#ffcf8a', guide: '#ffe2b0',
      reel: ['#ffe9c4', '#ff8a3a', '#2a0a04'], knob: '#ffffff', tip: '#000000', tipStyle: 'blackhole', glow: '255,150,70', decor: ['specks'] },
    // bakery
    { id: 'candycane', theme: 'bakery', name: 'Candy Cane', tier: 1, blurb: 'Peppermint striped from grip to tip. Slightly sticky.',
      blank: ['#ffffff', '#fff4f4'], stripes: { color: '#e0283a', n: 18, slant: 1.2, width: 0.42 }, grip: '#e0283a', seat: '#ffffff',
      wrap: '#2f9a4a', guide: '#ffffff', reel: ['#ffffff', '#ffd6da', '#e0283a'], knob: '#2f9a4a', tip: '#e0283a', tipStyle: 'curl' },
    { id: 'baguette', theme: 'bakery', name: 'Baguette', tier: 3, blurb: 'A crusty baguette, fresh from the oven and ninety centimetres long. The reel is a wheel of brie.',
      blank: ['#c98a3a', '#e3ae5e'], grip: '#b8762e', seat: '#f1e2b8', guide: '#f1e6cc', thick: 1.7,
      decor: ['scoring', 'flour'], reelStyle: 'brie', knob: '#f6edd2', tip: '#a86a2a' },
    { id: 'patisserie', theme: 'bakery', name: 'Pâtisserie', tier: 5, blurb: 'Pistachio, rose and lavender lacquer, stacked like a box of macarons and finished in gold leaf.',
      stops: ['#b8e0b0', '#ffc3d6', '#d6c3ff'], stripes: { color: 'rgba(255,255,255,0.7)', n: 11, slant: 0, width: 0.12 },
      grip: '#fff4e6', seat: '#e8c46c', wrap: '#e8c46c', guide: '#fff1c9', decor: ['sprinkles'], reelStyle: 'macaron', knob: '#ffffff', tip: '#e8c46c', gloss: true },
  ];

  /* ================= Bobbers ================= */
  /* top: where the line attaches, in bobber radii above the waterline. */
  const BOBBERS = [
    { id: 'classic', theme: 'classic', name: 'Classic Float', tier: 0, top: 2.1, blurb: 'Red and white, bright and honest.' },
    { id: 'quill', theme: 'classic', name: 'Heron Quill', tier: 1, top: 3.0, blurb: 'A slender painted quill that stands tall and twitches at the faintest nibble.' },
    { id: 'lantern', theme: 'classic', name: 'Paper Lantern', tier: 3, top: 1.9, blurb: 'A little lantern float that glows on dark water.' },
    { id: 'gilded', theme: 'classic', name: 'Gilded Float', tier: 5, top: 2.5, blurb: 'The classic float, remade in crimson enamel and gold leaf beneath a crystal cap.' },
    { id: 'duck', theme: 'critters', name: 'Puddle Duck', tier: 1, top: 1.5, blurb: 'A tiny wooden duck that bobs with great dignity.' },
    { id: 'kitten', theme: 'critters', name: 'Sleepy Kitten', tier: 2, top: 1.2, blurb: 'Curled up, fast asleep and floating. Do not wake her.' },
    { id: 'frenchie', theme: 'critters', name: 'French Bulldog', tier: 3, top: 1.75, blurb: 'Bat ears, a squashed nose and a red collar. The goodest float on the water.' },
    { id: 'koi', theme: 'critters', name: 'Koi Charm', tier: 4, top: 1.05, blurb: 'A carved koi float, said to call good fortune to your line.' },
    { id: 'frog', theme: 'critters', name: 'Frog Prince', tier: 5, top: 1.75, blurb: 'Kiss it if you like. It will still be a frog, but a very regal one.' },
    { id: 'beachball', theme: 'beach', name: 'Beach Ball', tier: 1, top: 1.35, blurb: 'Red, yellow and blue, and it never stops wanting to roll.' },
    { id: 'seashell', theme: 'beach', name: 'Scallop Shell', tier: 2, top: 1.5, blurb: 'A blush-pink scallop, found at low tide.' },
    { id: 'lifebuoy', theme: 'beach', name: 'Life Ring', tier: 4, top: 1.55, blurb: 'A tiny red-and-white life ring, rope and all. Safety first, even for floats.' },
    { id: 'pineapple', theme: 'beach', name: 'Pineapple', tier: 5, top: 2.2, blurb: 'Golden, spiky and dressed for a holiday.' },
    { id: 'daisy', theme: 'blossom', name: 'Daisy', tier: 1, top: 0.5, blurb: 'A single white daisy drifting on the water. He loves me, he loves me not.' },
    { id: 'lily', theme: 'blossom', name: 'Lily Bud', tier: 2, top: 2.0, blurb: 'A closed lotus bud, blushing pink at the tip.' },
    { id: 'heart', theme: 'blossom', name: 'Heart Locket', tier: 4, top: 1.6, blurb: 'A rose-pink locket with a gold rim. Who is inside? Only you know.' },
    { id: 'butterfly', theme: 'blossom', name: 'Butterfly', tier: 5, top: 0.5, blurb: 'A lilac butterfly resting on a petal float, wings softly beating.' },
    { id: 'tiara', theme: 'blossom', name: 'Diamond Tiara', tier: 7, top: 0.6,
      blurb: 'A diamond tiara on a velvet cushion. Utterly impractical. The fish seem honoured to be caught.' },
    { id: 'pinecone', theme: 'mountain', name: 'Pinecone', tier: 1, top: 1.5, blurb: 'Fell from a mountain pine and decided to go fishing.' },
    { id: 'peak', theme: 'mountain', name: 'Snow Peak', tier: 3, top: 2.0, blurb: 'A tiny snow-capped mountain with its own pine forest.' },
    { id: 'globe', theme: 'mountain', name: 'Snow Globe', tier: 5, top: 1.75, blurb: 'A pine tree in a never-ending snowfall, sealed in glass.' },
    { id: 'pearl', theme: 'cosmic', name: 'Moon Pearl', tier: 2, top: 1.35, blurb: 'An iridescent pearl that catches every colour of the sky.' },
    { id: 'planet', theme: 'cosmic', name: 'Ringed Planet', tier: 3, top: 1.25, blurb: 'A small gas giant with a tilted ring. It insists it is not a beach ball.' },
    { id: 'saucer', theme: 'cosmic', name: 'Little Saucer', tier: 4, top: 1.3, blurb: 'A flying saucer with a very small, very curious pilot.' },
    { id: 'comet', theme: 'cosmic', name: 'Comet', tier: 4, top: 1.0, blurb: 'A ball of bright ice trailing a tail of stardust.' },
    { id: 'star', theme: 'cosmic', name: 'Fallen Star', tier: 5, top: 1.9, blurb: 'A shard of starlight that hums softly as it floats.' },
    { id: 'galaxy', theme: 'cosmic', name: 'Galaxy Orb', tier: 8, top: 1.5,
      blurb: 'An entire spiral galaxy, slowly turning inside a glass orb on a gold stand.' },
    { id: 'cupcake', theme: 'bakery', name: 'Cupcake', tier: 2, top: 1.85, blurb: 'Strawberry frosting, rainbow sprinkles and a cherry on top.' },
    { id: 'donut', theme: 'bakery', name: 'Glazed Donut', tier: 3, top: 0.8, blurb: 'Pink glaze and sprinkles. It floats remarkably well.' },
    { id: 'macaron', theme: 'bakery', name: 'Macaron', tier: 5, top: 0.95, blurb: 'Lavender shells with a vanilla cream filling.' },
    { id: 'gateau', theme: 'bakery', name: 'Grand Gâteau', tier: 6, top: 2.7,
      blurb: 'A three-tier celebration cake with gold leaf and sugar roses, floating serenely on the lake.' },
  ];

  /* ================= Lines ================= */
  const LINES = [
    { id: 'mono', theme: 'classic', name: 'Clear Mono', tier: 0, blurb: 'Plain, strong and nearly invisible.', color: 'rgba(246,244,236,0.72)' },
    { id: 'linen', theme: 'classic', name: 'Waxed Linen', tier: 1, blurb: 'Waxed linen thread the colour of old sailcloth. Quiet, strong and honest.',
      color: '#e6d9bc', width: 1.5, pattern: 'twist', twist: '#b49f72' },
    { id: 'gold', theme: 'classic', name: 'Golden Thread', tier: 3, blurb: 'Spun gold that glints in any light.', color: 'rgba(255,214,110,0.95)', width: 1.25, glow: 'rgba(255,200,90,0.16)' },
    { id: 'chain', theme: 'classic', name: "Mariner's Chain", tier: 4, blurb: 'A fine brass chain, link by tiny link. It chimes faintly in the wind.',
      color: 'rgba(214,170,84,0.55)', width: 0.9, pattern: 'chain', chain: ['#fff0b8', '#c8963a'], glow: 'rgba(255,210,120,0.1)' },
    { id: 'ember', theme: 'classic', name: 'Ember Braid', tier: 5, blurb: 'Black silk braided around a living coal. Sparks drift up from it after dark.',
      color: '#1c0a0a', width: 2, pattern: 'embers', glow: 'rgba(255,100,40,0.12)' },
    { id: 'yarn', theme: 'critters', name: 'Ball of Yarn', tier: 1, blurb: 'Chunky tangerine wool, borrowed from a kitten who would like it back.',
      color: '#ff9a5a', width: 2.6, pattern: 'twist', twist: '#e0703a' },
    { id: 'leash', theme: 'critters', name: 'Dog Leash', tier: 3, blurb: 'Bright red nylon with white stitching and a proper snap clip. Walkies!',
      color: '#d8343c', width: 2.4, pattern: 'stitch', stitch: 'rgba(255,255,255,0.85)', clip: '#c9ced6' },
    { id: 'koisilk', theme: 'critters', name: 'Koi Silk', tier: 5, blurb: 'Kohaku silk, patched red and white like a prize koi, with a glint of gold.',
      color: '#fff6ee', width: 2.3, pattern: 'camo', camo: ['#e8432a', '#ff7a3a'] },
    { id: 'diamondleash', theme: 'critters', name: 'Diamond Leash', tier: 7,
      blurb: 'Pink patent leather set with a row of diamonds. For the pampered fisher who wants a line that never lets go.',
      color: '#ff7fb0', width: 2.6, pattern: 'gems', clip: '#ffd86b', glow: 'rgba(255,140,190,0.22)' },
    { id: 'rope', theme: 'beach', name: 'Sailor Rope', tier: 1, blurb: 'Twisted hemp rope from an old harbour.', color: '#d9c39a', width: 2.1, pattern: 'twist', twist: '#9a7a4c' },
    { id: 'seaglass', theme: 'beach', name: 'Sea Glass', tier: 3, blurb: 'A fine line strung with frosted sea-glass beads.',
      color: 'rgba(220,240,240,0.6)', pattern: 'beads', beads: ['#8fe3d0', '#a6d8f5', '#c6f0b0', '#e3f7f4'], beadAlpha: 0.8 },
    { id: 'mermaid', theme: 'beach', name: "Mermaid's Braid", tier: 5, blurb: 'Sea-green to violet, shimmering like a tail flicked in the shallows.',
      color: '#6ad0e0', grad: ['#3ad6c0', '#4aa8ff', '#a87aff', '#ff8ad0'], width: 1.8, pattern: 'sparkle', spark: ['#b8fff0', '#ffffff'], glow: 'rgba(120,230,230,0.16)' },
    { id: 'paracord', theme: 'mountain', name: 'Paracord', tier: 2, blurb: 'Tough woven cord in trail colours.', color: '#6f7a3c', width: 2.1, pattern: 'camo', camo: ['#c9a86a', '#3e4422'] },
    { id: 'pine', theme: 'mountain', name: 'Pine Garland', tier: 4, blurb: 'A twist of evergreen and red winterberries, like the trail to a mountain cabin.',
      color: '#3f6a3a', width: 1.4, pattern: 'sprigs' },
    { id: 'frost', theme: 'mountain', name: 'Hoarfrost', tier: 5, blurb: 'Ice-blue line furred with frost. Snowflakes form on it, glint and melt away.',
      color: 'rgba(205,238,255,0.95)', width: 1.4, glow: 'rgba(150,210,255,0.22)', pattern: 'flakes' },
    { id: 'summit', theme: 'mountain', name: 'Summit Rope', tier: 6,
      blurb: 'The rope that roped the highest peak, with a steel carabiner. Built not to slip.',
      color: '#2f7be0', width: 2.5, pattern: 'twist', twist: '#ff8a2a', clip: '#dfe4ea', glow: 'rgba(120,180,255,0.16)' },
    { id: 'rose', theme: 'blossom', name: 'Rose Silk', tier: 1, blurb: 'Braided silk in a soft rose pink.', color: 'rgba(255,176,196,0.9)', width: 1.15 },
    { id: 'daisychain', theme: 'blossom', name: 'Daisy Chain', tier: 2, blurb: 'A green stem threaded with little daisies.', color: '#6fae5a', width: 1.2, pattern: 'flowers' },
    { id: 'satin', theme: 'blossom', name: 'Satin Ribbon', tier: 3, blurb: 'A wide pink satin ribbon with a soft sheen.', color: '#ffa9c8', width: 3, pattern: 'sheen' },
    { id: 'pearls', theme: 'blossom', name: 'Pearl Strand', tier: 5, blurb: 'A long string of creamy pearls, like your grandmother’s best necklace.',
      color: 'rgba(255,250,240,0.5)', pattern: 'beads', beads: ['#fffaf0', '#fff0f4', '#f6f2ff'], beadAlpha: 1 },
    { id: 'moon', theme: 'cosmic', name: 'Moonbeam', tier: 2, blurb: 'A strand of moonlight that glows on the water.', color: 'rgba(214,240,255,0.98)', width: 1.2, glow: 'rgba(150,210,255,0.3)' },
    { id: 'stardust', theme: 'cosmic', name: 'Stardust Trail', tier: 4, blurb: 'A violet thread that sheds twinkling stardust.', color: 'rgba(180,150,255,0.85)', glow: 'rgba(160,120,255,0.22)', pattern: 'sparkle' },
    { id: 'prism', theme: 'cosmic', name: 'Prism Cord', tier: 5, blurb: 'A rainbow cord that ripples through every colour.', prism: true, width: 1.4, glow: 'rgba(255,255,255,0.18)' },
    { id: 'constellation', theme: 'cosmic', name: 'Constellation Thread', tier: 8,
      blurb: 'Stars joined into a constellation that holds as fast as the night sky.',
      color: 'rgba(190,210,255,0.55)', glow: 'rgba(150,180,255,0.3)', pattern: 'stars' },
    { id: 'licorice', theme: 'bakery', name: 'Licorice Twist', tier: 1, blurb: 'Red licorice, twisted tight.', color: '#d61f3a', width: 2.4, pattern: 'twist', twist: '#8a0a1e' },
    { id: 'spaghetti', theme: 'bakery', name: 'Spaghetti', tier: 2, blurb: 'One very long noodle, cooked perfectly al dente.', color: '#f3d98a', width: 2, wavy: true, pattern: 'sheen' },
    { id: 'icing', theme: 'bakery', name: 'Icing Swirl', tier: 4, blurb: 'Piped buttercream in strawberry, pistachio and lemon.', color: '#fff6ee', width: 2.6, pattern: 'piped', piped: ['#ffb3cf', '#bfe8b0', '#fff0a0'] },
    { id: 'sugar', theme: 'bakery', name: 'Spun Sugar', tier: 5, blurb: 'Caramel pulled into a glassy golden thread that glitters like crème brûlée.',
      color: 'rgba(255,196,96,0.9)', width: 1.5, glow: 'rgba(255,190,90,0.22)', pattern: 'sparkle', spark: ['#ffd27a', '#fff6d8'] },
  ];

  /* Every piece takes its price, level and boost from its tier. */
  const CATALOG = { rods: RODS, bobbers: BOBBERS, lines: LINES };
  for (const kind in CATALOG) for (const g of CATALOG[kind]) {
    const T = TIERS[g.tier];
    g.price = T.price;
    g.pct = T.pct;
    g.perk = T.pct ? perkFor(kind, T.pct) : null;
    if (T.level) g.level = T.level;
    if (T.heir) g.heir = true;
  }
  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  const ROD = byId(RODS), BOB = byId(BOBBERS), LINE = byId(LINES);
  const SLOT = { rods: 'rod', bobbers: 'bobber', lines: 'line' };

  /* ================= Rod painter =================
     Rods are modelled, baked and lit in js/rods.js. o: { light, line (line id, shown wound on the reel and
     threaded through the guides) } */
  function paintRod(ctx, id, base, tip, bend, t, m, spin = 0, o = {}) {
    RodArt.paint(ctx, ROD[id] || ROD.willow, base, tip, bend, t, m, spin, o);
  }

  /* ================= Bobber painters =================
     Each draws around (x, y) at size r; the waterline sits about 0.55r below y. */
  const BOB_DRAW = {
    classic(ctx, x, y, r) {
      ctx.strokeStyle = '#8a6a50'; ctx.lineWidth = Math.max(1.2, r * 0.18);
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.9); ctx.lineTo(x, y - r * 2.1); ctx.stroke();
      ctx.fillStyle = '#ffd66b'; ctx.beginPath(); ctx.arc(x, y - r * 2.15, r * 0.24, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, Math.PI, TAU); ctx.fillStyle = '#e4534a'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.fillStyle = '#f6efe4'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.45, r * 0.28, r * 0.18, -0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,20,20,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    },
    gilded(ctx, x, y, r, t) {
      // a brass stem with a faceted crystal cap
      ctx.strokeStyle = lgr(ctx, x - r * 0.1, 0, x + r * 0.1, 0, [[0, '#fff0b8'], [1, '#9a6a14']]); ctx.lineWidth = Math.max(1.3, r * 0.17);
      ctx.beginPath(); ctx.moveTo(x, y - r * 0.9); ctx.lineTo(x, y - r * 2.05); ctx.stroke();
      const gy = y - r * 2.3, s = r * 0.36;
      ctx.beginPath(); ctx.moveTo(x, gy - s); ctx.lineTo(x + s * 0.72, gy - s * 0.1); ctx.lineTo(x, gy + s); ctx.lineTo(x - s * 0.72, gy - s * 0.1); ctx.closePath();
      ctx.fillStyle = lgr(ctx, x - s, gy - s, x + s, gy + s, [[0, '#ffffff'], [0.45, '#d8f2ff'], [1, '#6aa6d6']]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x - s * 0.72, gy - s * 0.1); ctx.lineTo(x + s * 0.72, gy - s * 0.1); ctx.moveTo(x, gy - s); ctx.lineTo(x - s * 0.25, gy - s * 0.1); ctx.lineTo(x, gy + s); ctx.stroke();
      // crimson enamel above, ivory below
      ctx.beginPath(); ctx.arc(x, y, r, Math.PI, TAU); ctx.fillStyle = rg(ctx, x - r * 0.4, y - r * 0.6, 0, r * 1.4, [[0, '#ff6b72'], [0.5, '#c81e32'], [1, '#6e0816']]); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.fillStyle = rg(ctx, x - r * 0.3, y + r * 0.05, 0, r * 1.3, [[0, '#fffdf6'], [0.6, '#f0e4cc'], [1, '#bfae8c']]); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
      // gold-leaf scrolls on the enamel and a gold band at the waist
      ctx.strokeStyle = '#ffd77a'; ctx.lineWidth = Math.max(0.8, r * 0.07); ctx.lineCap = 'round';
      for (const d of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(x, y - r * 0.2);
        ctx.bezierCurveTo(x + d * r * 0.25, y - r * 0.75, x + d * r * 0.75, y - r * 0.6, x + d * r * 0.62, y - r * 0.35);
        ctx.arc(x + d * r * 0.5, y - r * 0.36, r * 0.12, 0, Math.PI * 1.6 * d, d < 0); ctx.stroke();
      }
      ctx.fillStyle = lgr(ctx, 0, y - r * 0.13, 0, y + r * 0.13, [[0, '#fff4b8'], [0.5, '#e6b442'], [1, '#8a5c10']]);
      ctx.fillRect(x - r, y - r * 0.12, r * 2, r * 0.24);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.5, r * 0.26, r * 0.15, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
      // a gold collar where the stem meets the body
      ctx.fillStyle = lgr(ctx, x - r * 0.25, 0, x + r * 0.25, 0, [[0, '#fff4b8'], [1, '#a8741a']]);
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.95, r * 0.26, r * 0.12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(70,30,10,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      twinkle(ctx, x + s * 0.3, gy - s * 0.45, s * 1.1, 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 1.9)), 3));
    },
    lifebuoy(ctx, x, y, r, t) {
      const cx = x, cy = y - r * 0.15, R = r * 1.18, Ri = r * 0.56;
      const seg = (a0, a1, col) => { ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, Ri, a1, a0, true); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
      for (let i = 0; i < 8; i++) seg(-Math.PI / 2 - Math.PI / 8 + (i * Math.PI) / 4, -Math.PI / 2 + Math.PI / 8 + (i * Math.PI) / 4, i % 2 ? '#f8f4ec' : '#e2382f');
      // round the ring: dark at both edges, a soft crest of light along the middle
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.arc(cx, cy, Ri, 0, TAU, true); ctx.clip('evenodd');
      ctx.fillStyle = rg(ctx, cx, cy, Ri, R, [[0, 'rgba(40,10,10,0.38)'], [0.32, 'rgba(255,255,255,0.12)'], [0.5, 'rgba(255,255,255,0.22)'], [0.72, 'rgba(0,0,0,0)'], [1, 'rgba(40,10,10,0.42)']]);
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(cx - R * 0.5, cy - R * 0.55, R * 0.26, R * 0.1, -0.75, 0, TAU); ctx.fill();
      ctx.restore();
      // grab rope looped round the outside, lashed on at four points
      const ties = [-0.25, 0.25, 0.75, 1.25].map(f => f * Math.PI);
      ctx.strokeStyle = '#d9c39a'; ctx.lineWidth = Math.max(1.1, r * 0.11); ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a0 = ties[i], a1 = ties[(i + 1) % 4] + (i === 3 ? TAU : 0), am = (a0 + a1) / 2, sag = Math.sin(t * 1.6 + i) * 0.03;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0) * R * 1.02, cy + Math.sin(a0) * R * 1.02);
        ctx.quadraticCurveTo(cx + Math.cos(am + sag) * R * 1.24, cy + Math.sin(am + sag) * R * 1.24, cx + Math.cos(a1) * R * 1.02, cy + Math.sin(a1) * R * 1.02); ctx.stroke();
      }
      for (const a of ties) {
        ctx.save(); ctx.translate(cx + Math.cos(a) * (R + Ri) / 2, cy + Math.sin(a) * (R + Ri) / 2); ctx.rotate(a);
        ctx.fillStyle = '#c8ad7c'; ctx.fillRect(-(R - Ri) * 0.62, -r * 0.1, (R - Ri) * 1.24, r * 0.2);
        ctx.strokeStyle = 'rgba(110,80,40,0.6)'; ctx.lineWidth = 0.8;
        for (const o of [-0.3, 0, 0.3]) { ctx.beginPath(); ctx.moveTo(o * (R - Ri), -r * 0.1); ctx.lineTo(o * (R - Ri) + r * 0.05, r * 0.1); ctx.stroke(); }
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(60,20,20,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, Ri, 0, TAU); ctx.stroke();
    },
    duck(ctx, x, y, r, t) {
      const by = y - r * 0.1;
      ctx.fillStyle = rg(ctx, x - r * 0.3, by - r * 0.4, 1, r * 1.5, [[0, '#fff3a6'], [0.6, '#ffd23f'], [1, '#e0a51c']]);
      ctx.beginPath(); ctx.ellipse(x, by, r * 1.25, r * 0.72, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 1.05, by - r * 0.2); ctx.quadraticCurveTo(x - r * 1.6, by - r * 0.9, x - r * 1.0, by - r * 0.55); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.62, by - r * 0.95, r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.ellipse(x + r * 1.18, by - r * 0.86, r * 0.32, r * 0.14, 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.arc(x + r * 0.78, by - r * 1.05, r * 0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(190,130,20,0.7)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x - r * 0.15, by - r * 0.05, r * 0.6, r * 0.32, -0.25 + Math.sin(t * 2) * 0.05, 0.2, Math.PI); ctx.stroke();
    },
    lily(ctx, x, y, r) {
      ctx.fillStyle = '#4f9a5c';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + d * r * 0.55, y + r * 0.05, r * 0.7, r * 0.26, d * 0.35, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.bezierCurveTo(x + r * 1.0, y - r * 1.2, x + r * 0.95, y + r * 0.1, x, y + r * 0.15); ctx.bezierCurveTo(x - r * 0.95, y + r * 0.1, x - r * 1.0, y - r * 1.2, x, y - r * 2);
      ctx.fillStyle = lgr(ctx, 0, y - r * 2, 0, y, [[0, '#ff6f9e'], [0.5, '#ffb3cb'], [1, '#fff0f5']]); ctx.fill();
      ctx.strokeStyle = 'rgba(200,70,110,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.9); ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.8, x - r * 0.15, y + r * 0.1);
      ctx.moveTo(x, y - r * 1.9); ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.8, x + r * 0.15, y + r * 0.1); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.9, r * 0.12, r * 0.4, 0.2, 0, TAU); ctx.fill();
    },
    quill(ctx, x, y, r) {
      const top = y - r * 3, bot = y + r * 0.8, w = r * 0.34;
      const body = () => { ctx.beginPath(); ctx.moveTo(x, top); ctx.bezierCurveTo(x + w * 1.3, top + r, x + w * 1.4, bot - r, x, bot); ctx.bezierCurveTo(x - w * 1.4, bot - r, x - w * 1.3, top + r, x, top); };
      body(); ctx.fillStyle = '#2f7a55'; ctx.fill();
      ctx.save(); body(); ctx.clip();
      ctx.fillStyle = '#e4534a'; ctx.fillRect(x - w * 2, top - 2, w * 4, r * 0.95);
      ctx.fillStyle = '#f6efe4'; ctx.fillRect(x - w * 2, top + r * 0.95, w * 4, r * 0.35);
      ctx.fillStyle = '#1d1a16'; ctx.fillRect(x - w * 2, top + r * 1.3, w * 4, r * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - w * 0.55, top, w * 0.3, bot - top);
      ctx.restore();
    },
    lantern(ctx, x, y, r, t) {
      const flick = 0.85 + 0.15 * Math.sin(t * 9 + Math.sin(t * 3.7) * 2);
      const top = y - r * 1.6, h = r * 1.85, w = r * 1.5;
      ctx.fillStyle = rg(ctx, x, top + h * 0.5, 1, w, [[0, `rgba(255,246,200,${flick})`], [0.6, '#ffc066'], [1, '#e07a32']]);
      rrect(ctx, x - w / 2, top, w, h, r * 0.5); ctx.fill();
      ctx.strokeStyle = 'rgba(150,60,30,0.45)'; ctx.lineWidth = 1;
      for (const f of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.moveTo(x + f * w, top + 2); ctx.quadraticCurveTo(x + f * w * 1.3, top + h / 2, x + f * w, top + h - 2); ctx.stroke(); }
      ctx.fillStyle = '#5a2a22';
      ctx.fillRect(x - w * 0.38, top - r * 0.2, w * 0.76, r * 0.28);
      ctx.fillRect(x - w * 0.38, top + h - r * 0.08, w * 0.76, r * 0.28);
      ctx.strokeStyle = '#5a2a22'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, top - r * 0.25, r * 0.35, Math.PI, TAU); ctx.stroke();
    },
    pearl(ctx, x, y, r, t) {
      const cy = y - r * 0.25, R = r * 1.05;
      ctx.fillStyle = rg(ctx, x - R * 0.35, cy - R * 0.4, 1, R * 1.1, [[0, '#ffffff'], [0.35, '#f7eefa'], [0.75, '#d8d4ec'], [1, '#9c98bd']]);
      ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.clip();
      ctx.globalCompositeOperation = 'soft-light';
      const h = (t * 40) % 360;
      ctx.fillStyle = lgr(ctx, x - R, cy - R, x + R, cy + R, [[0, `hsla(${h},90%,70%,0.8)`], [0.5, `hsla(${(h + 120) % 360},90%,70%,0.8)`], [1, `hsla(${(h + 240) % 360},90%,70%,0.8)`]]);
      ctx.fillRect(x - R, cy - R, R * 2, R * 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(x - R * 0.38, cy - R * 0.42, R * 0.22, R * 0.14, -0.6, 0, TAU); ctx.fill();
    },
    koi(ctx, x, y, r, t) {
      const by = y - r * 0.15, sw = Math.sin(t * 3) * 0.2;
      ctx.save(); ctx.translate(x - r * 1.1, by); ctx.rotate(sw);
      ctx.fillStyle = 'rgba(255,225,205,0.9)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 0.6, -r * 0.9, -r * 1.0, -r * 0.7); ctx.quadraticCurveTo(-r * 0.6, 0, -r * 1.0, r * 0.7); ctx.quadraticCurveTo(-r * 0.6, r * 0.9, 0, 0); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.ellipse(x, by, r * 1.3, r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, by, r * 1.3, r * 0.62, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = '#ec4a24';
      ctx.beginPath(); ctx.ellipse(x + r * 0.7, by - r * 0.3, r * 0.55, r * 0.4, 0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - r * 0.35, by - r * 0.25, r * 0.45, r * 0.38, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a171c'; ctx.beginPath(); ctx.ellipse(x - r * 0.05, by - r * 0.4, r * 0.16, r * 0.1, 0.3, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(160,80,60,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, by, r * 1.3, r * 0.62, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#1a171c'; ctx.beginPath(); ctx.arc(x + r * 0.95, by - r * 0.12, r * 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,215,120,0.9)'; ctx.beginPath(); ctx.arc(x, by - r * 0.85, r * 0.16, 0, TAU); ctx.fill();
    },
    star(ctx, x, y, r, t) {
      const cy = y - r * 0.55, R = r * 1.3, rot = -Math.PI / 2 + Math.sin(t * 0.8) * 0.12;
      starPath(ctx, x, cy, R, 5, 0.48, rot);
      ctx.fillStyle = rg(ctx, x, cy, 0, R, [[0, '#ffffff'], [0.45, '#fff2b0'], [1, '#f2b83a']]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,230,0.9)'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = t * 0.9 + i * 2.1, d = R * 1.6;
        twinkle(ctx, x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, r * 0.45, 0.5 + 0.5 * Math.sin(t * 3 + i * 2), '#fffbe0');
      }
    },
    frenchie(ctx, x, y, r, t) {
      const hy = y - r * 0.5, fawn = '#d8ae80';
      for (const d of [-1, 1]) {
        ctx.save(); ctx.translate(x + d * r * 0.62, hy - r * 0.72); ctx.rotate(d * (0.3 + Math.sin(t * 2.2 + d) * 0.05));
        ctx.beginPath(); ctx.moveTo(-r * 0.36, r * 0.35); ctx.quadraticCurveTo(-r * 0.42, -r * 0.55, 0, -r * 0.72); ctx.quadraticCurveTo(r * 0.42, -r * 0.55, r * 0.36, r * 0.35); ctx.closePath();
        ctx.fillStyle = fawn; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.22); ctx.quadraticCurveTo(-r * 0.24, -r * 0.38, 0, -r * 0.52); ctx.quadraticCurveTo(r * 0.24, -r * 0.38, r * 0.2, r * 0.22); ctx.closePath();
        ctx.fillStyle = '#eaa4a2'; ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(x, hy, r * 1.15, r * 0.95, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.3, hy - r * 0.4, 1, r * 1.3, [[0, '#f3dcbd'], [0.6, fawn], [1, '#b8895c']]); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,50,0.45)'; ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.beginPath(); ctx.moveTo(x - r * 0.25, hy - r * 0.55); ctx.quadraticCurveTo(x, hy - r * 0.64, x + r * 0.25, hy - r * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 0.18, hy - r * 0.42); ctx.quadraticCurveTo(x, hy - r * 0.48, x + r * 0.18, hy - r * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, hy + r * 0.32, r * 0.62, r * 0.45, 0, 0, TAU); ctx.fillStyle = '#4a372c'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, hy + r * 0.1, r * 0.24, r * 0.15, 0, 0, TAU); ctx.fillStyle = '#16100d'; ctx.fill();
      ctx.strokeStyle = '#16100d'; ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.moveTo(x, hy + r * 0.22); ctx.lineTo(x, hy + r * 0.34);
      ctx.moveTo(x - r * 0.3, hy + r * 0.42); ctx.quadraticCurveTo(x, hy + r * 0.34, x + r * 0.3, hy + r * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + r * 0.06, hy + r * 0.56, r * 0.13, r * 0.17 + Math.sin(t * 4) * r * 0.02, 0, 0, TAU); ctx.fillStyle = '#ff8fa3'; ctx.fill();
      for (const d of [-1, 1]) {
        ctx.beginPath(); ctx.arc(x + d * r * 0.46, hy - r * 0.1, r * 0.2, 0, TAU); ctx.fillStyle = '#1a1210'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + d * r * 0.46 + r * 0.06, hy - r * 0.16, r * 0.07, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(x, hy + r * 0.95, r * 0.95, r * 0.2, 0, 0, TAU); ctx.fillStyle = '#d8343c'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, hy + r * 1.08, r * 0.14, 0, TAU); ctx.fillStyle = '#ffd36b'; ctx.fill();
    },
    kitten(ctx, x, y, r, t) {
      const by = y - r * 0.05, fur = '#a7a3ad', dark = '#6f6a78';
      ctx.beginPath(); ctx.ellipse(x - r * 0.15, by, r * 1.25, r * 0.72, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.4, by - r * 0.4, 1, r * 1.4, [[0, '#dedae4'], [0.6, fur], [1, dark]]); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.1); ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - r * 0.4 + i * r * 0.32, by - r * 0.2, r * 0.45, -2.2, -1.3); ctx.stroke(); }
      ctx.strokeStyle = fur; ctx.lineWidth = r * 0.3;
      ctx.beginPath(); ctx.moveTo(x - r * 1.2, by + r * 0.15); ctx.quadraticCurveTo(x - r * 0.4, by + r * 0.85, x + r * 0.55, by + r * 0.5); ctx.stroke();
      const hx = x + r * 0.72, hy = by - r * 0.32;
      ctx.fillStyle = fur;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + d * r * 0.42, hy - r * 0.15); ctx.lineTo(hx + d * r * 0.3, hy - r * 0.68); ctx.lineTo(hx + d * r * 0.05, hy - r * 0.32); ctx.closePath(); ctx.fill(); }
      ctx.beginPath(); ctx.arc(hx, hy, r * 0.5, 0, TAU);
      ctx.fillStyle = rg(ctx, hx - r * 0.15, hy - r * 0.2, 1, r * 0.6, [[0, '#e8e4ee'], [1, fur]]); ctx.fill();
      ctx.strokeStyle = '#3a3540'; ctx.lineWidth = Math.max(1, r * 0.07);
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + d * r * 0.2, hy - r * 0.02, r * 0.12, 0.2, Math.PI - 0.2); ctx.stroke(); }
      ctx.fillStyle = '#ff9eb5'; ctx.beginPath(); ctx.moveTo(hx - r * 0.06, hy + r * 0.14); ctx.lineTo(hx + r * 0.06, hy + r * 0.14); ctx.lineTo(hx, hy + r * 0.22); ctx.closePath(); ctx.fill();
      const zph = (t * 0.5) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - zph)})`;
      ctx.font = `700 ${Math.max(8, r * 0.7)}px sans-serif`;
      ctx.fillText('z', hx + r * 0.45 + zph * r * 0.5, hy - r * 0.6 - zph * r * 0.9);
    },
    frog(ctx, x, y, r, t) {
      const by = y - r * 0.05;
      ctx.beginPath(); ctx.ellipse(x, by, r * 1.25, r * 0.75, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.3, by - r * 0.4, 1, r * 1.4, [[0, '#c4f29a'], [0.6, '#79c454'], [1, '#3f8a34']]); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, by + r * 0.3, r * 0.75, r * 0.32, 0, 0, TAU); ctx.fillStyle = '#e4f8c4'; ctx.fill();
      const blink = (t % 4.3) < 0.14 ? 0.12 : 1;
      for (const d of [-1, 1]) {
        const ex = x + d * r * 0.55, ey = by - r * 0.6;
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.38, 0, TAU); ctx.fillStyle = '#79c454'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.26, r * 0.26 * blink, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.15, r * 0.09 * blink, 0, 0, TAU); ctx.fillStyle = '#16200f'; ctx.fill();
      }
      ctx.strokeStyle = '#2f6a26'; ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.arc(x, by - r * 0.1, r * 0.55, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.fillStyle = 'rgba(255,150,160,0.55)';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + d * r * 0.75, by + r * 0.02, r * 0.17, r * 0.1, 0, 0, TAU); ctx.fill(); }
      crown(ctx, x, by - r * 0.88, r * 0.7, r * 0.55);
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(x, by - r * 1.0, r * 0.08, 0, TAU); ctx.fill();
    },
    beachball(ctx, x, y, r, t) {
      const cy = y - r * 0.2, R = r * 1.1;
      ctx.save(); ctx.translate(x, cy); ctx.rotate(Math.sin(t * 0.8) * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = '#e8413a'; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.78, R, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.62, R, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.42, R, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a7be8'; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.26, R, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rg(ctx, -R * 0.35, -R * 0.4, 0, R * 1.3, [[0, 'rgba(255,255,255,0.45)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,40,0.3)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -R * 0.94, R * 0.2, R * 0.08, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
    seashell(ctx, x, y, r) {
      const hx = x, hy = y + r * 0.3, R = r * 1.55;
      const edge = [];
      for (let i = 0; i <= 18; i++) {
        const a = Math.PI * 1.1 + (i / 18) * Math.PI * 0.8;
        const bump = 1 + 0.05 * Math.cos(i * Math.PI);
        edge.push([hx + Math.cos(a) * R * bump, hy + Math.sin(a) * R * bump]);
      }
      ctx.beginPath(); ctx.moveTo(hx, hy); edge.forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath();
      ctx.fillStyle = rg(ctx, hx, hy - R * 0.6, 1, R * 1.2, [[0, '#fff6f0'], [0.55, '#ffd3cb'], [1, '#e89a98']]); ctx.fill();
      ctx.strokeStyle = 'rgba(190,100,100,0.55)'; ctx.lineWidth = 1;
      for (let i = 1; i < 18; i += 2) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(edge[i][0], edge[i][1]); ctx.stroke(); }
      ctx.fillStyle = '#f0b8b0';
      ctx.beginPath(); ctx.moveTo(hx - r * 0.55, hy + r * 0.05); ctx.lineTo(hx + r * 0.55, hy + r * 0.05); ctx.lineTo(hx + r * 0.3, hy - r * 0.35); ctx.lineTo(hx - r * 0.3, hy - r * 0.35); ctx.closePath(); ctx.fill();
    },
    pineapple(ctx, x, y, r, t) {
      const cy = y - r * 0.25;
      ctx.save(); ctx.translate(x, cy - r * 1.05);
      ctx.fillStyle = '#3f9a4a';
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.32 + Math.sin(t * 1.5 + i) * 0.04;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.1); ctx.quadraticCurveTo(0, -r * (0.9 - Math.abs(i) * 0.12), r * 0.12, r * 0.1); ctx.closePath();
        ctx.fillStyle = i % 2 ? '#3f9a4a' : '#5fbf5a'; ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(x, cy, r * 0.85, r * 1.05, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.3, cy - r * 0.4, 1, r * 1.2, [[0, '#ffe98a'], [0.6, '#f2b83a'], [1, '#c8801c']]); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, cy, r * 0.85, r * 1.05, 0, 0, TAU); ctx.clip();
      ctx.strokeStyle = 'rgba(140,80,20,0.6)'; ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * r * 0.35 - r, cy - r * 1.2); ctx.lineTo(x + i * r * 0.35 + r, cy + r * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + i * r * 0.35 + r, cy - r * 1.2); ctx.lineTo(x + i * r * 0.35 - r, cy + r * 1.2); ctx.stroke();
      }
      ctx.restore();
    },
    daisy(ctx, x, y, r, t) {
      ctx.save(); ctx.translate(x, y + r * 0.2); ctx.scale(1, 0.55); ctx.rotate(t * 0.15);
      ctx.fillStyle = 'rgba(40,90,60,0.3)'; ctx.beginPath(); ctx.arc(r * 0.1, r * 0.25, r * 1.55, 0, TAU); ctx.fill();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        ctx.fillStyle = i % 2 ? '#ffffff' : '#f4f2ff';
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.62, r * 0.22, a, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.05, r * 0.45, r * 0.32, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.1, y - r * 0.1, 1, r * 0.5, [[0, '#fff3a0'], [1, '#f0b41c']]); ctx.fill();
    },
    heart(ctx, x, y, r, t) {
      const cy = y - r * 0.45, s = r * 1.15 * (1 + Math.sin(t * 2.2) * 0.03);
      const path = () => { ctx.beginPath(); ctx.moveTo(x, cy + s * 0.75); ctx.bezierCurveTo(x - s * 1.25, cy - s * 0.05, x - s * 0.6, cy - s * 0.95, x, cy - s * 0.35); ctx.bezierCurveTo(x + s * 0.6, cy - s * 0.95, x + s * 1.25, cy - s * 0.05, x, cy + s * 0.75); };
      path(); ctx.fillStyle = rg(ctx, x - s * 0.35, cy - s * 0.3, 1, s * 1.2, [[0, '#ffd6e6'], [0.5, '#ff7fac'], [1, '#d42e6a']]); ctx.fill();
      ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = Math.max(1.2, r * 0.13); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, cy - s * 0.42, r * 0.17, 0, TAU); ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(x - s * 0.42, cy - s * 0.15, s * 0.14, s * 0.24, 0.5, 0, TAU); ctx.fill();
      twinkle(ctx, x + s * 0.12, cy + s * 0.1, r * 0.3, 0.7 + 0.3 * Math.sin(t * 3));
    },
    butterfly(ctx, x, y, r, t) {
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.1, r * 0.9, r * 0.34, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x, y, 1, r, [[0, '#fff6fa'], [1, '#ffc9dc']]); ctx.fill();
      const flap = 0.6 + 0.4 * Math.abs(Math.sin(t * 4.2));
      ctx.save(); ctx.translate(x, y - r * 0.55);
      for (const d of [-1, 1]) {
        ctx.save(); ctx.scale(d * flap, 1);
        ctx.strokeStyle = '#8a5ab8'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(r * 0.2, -r * 1.5, r * 1.8, -r * 1.4, r * 1.35, -r * 0.05); ctx.closePath();
        ctx.fillStyle = lgr(ctx, 0, -r, r * 1.4, 0, [[0, '#c9a6ff'], [1, '#ff9ec4']]); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(r * 0.25, r * 0.85, r * 1.15, r * 0.75, r * 0.9, r * 0.05); ctx.closePath();
        ctx.fillStyle = '#e7b8ff'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(r * 0.8, -r * 0.55, r * 0.12, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#3a2a40'; ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.08, r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2a40'; ctx.lineWidth = 1;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.quadraticCurveTo(d * r * 0.2, -r * 0.9, d * r * 0.35, -r * 0.95); ctx.stroke(); }
      ctx.restore();
    },
    tiara(ctx, x, y, r, t) {
      rrect(ctx, x - r * 1.2, y - r * 0.55, r * 2.4, r * 0.85, r * 0.35);
      ctx.fillStyle = lgr(ctx, 0, y - r * 0.55, 0, y + r * 0.3, [[0, '#ff8fb8'], [1, '#b8245e']]); ctx.fill();
      ctx.fillStyle = '#ffd86b';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * r * 1.15, y - r * 0.45, r * 0.13, 0, TAU); ctx.fill(); }
      const by = y - r * 0.55;
      ctx.beginPath();
      ctx.moveTo(x - r * 1.0, by);
      ctx.quadraticCurveTo(x - r * 0.9, by - r * 0.5, x - r * 0.6, by - r * 0.55);
      ctx.lineTo(x - r * 0.4, by - r * 0.95); ctx.lineTo(x - r * 0.22, by - r * 0.7);
      ctx.lineTo(x, by - r * 1.45);
      ctx.lineTo(x + r * 0.22, by - r * 0.7); ctx.lineTo(x + r * 0.4, by - r * 0.95);
      ctx.lineTo(x + r * 0.6, by - r * 0.55);
      ctx.quadraticCurveTo(x + r * 0.9, by - r * 0.5, x + r * 1.0, by);
      ctx.quadraticCurveTo(x, by - r * 0.3, x - r * 1.0, by);
      ctx.fillStyle = lgr(ctx, 0, by - r * 1.45, 0, by, [[0, '#ffffff'], [0.5, '#d8e0ee'], [1, '#8a94aa']]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, by - r * 1.05); ctx.lineTo(x + r * 0.16, by - r * 0.78); ctx.lineTo(x, by - r * 0.52); ctx.lineTo(x - r * 0.16, by - r * 0.78); ctx.closePath();
      ctx.fillStyle = '#ff5fa0'; ctx.fill();
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(x + d * r * 0.4, by - r * 0.6, r * 0.09, 0, TAU); ctx.fillStyle = '#7fd0ff'; ctx.fill(); }
      for (let i = 0; i < 5; i++) {
        const a = t * 0.8 + i * 1.3;
        twinkle(ctx, x + Math.cos(a) * r * 1.4, by - r * 0.8 + Math.sin(a * 1.3) * r * 0.6, r * 0.32, Math.max(0, Math.sin(t * 2.5 + i * 2)));
      }
      twinkle(ctx, x, by - r * 1.45, r * 0.45, 0.6 + 0.4 * Math.sin(t * 3));
    },
    pinecone(ctx, x, y, r) {
      const cy = y - r * 0.35;
      ctx.beginPath(); ctx.ellipse(x, cy, r * 0.78, r * 1.1, 0, 0, TAU); ctx.fillStyle = '#6a4224'; ctx.fill();
      for (let row = 0; row < 7; row++) {
        const yy = cy - r * 0.9 + row * r * 0.3, half = r * 0.78 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - cy) / (r * 1.1), 2)));
        const n = Math.max(2, Math.round(half / (r * 0.22)));
        for (let i = 0; i < n; i++) {
          const xx = x - half + ((i + (row % 2) * 0.5) / n) * half * 2;
          ctx.beginPath(); ctx.moveTo(xx - r * 0.16, yy); ctx.quadraticCurveTo(xx, yy + r * 0.3, xx + r * 0.16, yy); ctx.closePath();
          ctx.fillStyle = row % 2 ? '#b87a44' : '#a0683a'; ctx.fill();
        }
      }
      ctx.fillStyle = '#4a2e18'; ctx.fillRect(x - r * 0.08, cy - r * 1.3, r * 0.16, r * 0.25);
    },
    peak(ctx, x, y, r) {
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 1.35, r * 0.38, 0, 0, TAU); ctx.fillStyle = '#3f5a44'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 1.25, y + r * 0.1); ctx.lineTo(x - r * 0.55, y - r * 1.2); ctx.lineTo(x + r * 0.1, y + r * 0.1); ctx.closePath(); ctx.fillStyle = '#5d6f8a'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 0.1); ctx.lineTo(x + r * 0.05, y - r * 1.75); ctx.lineTo(x + r * 1.2, y + r * 0.1); ctx.closePath();
      ctx.fillStyle = lgr(ctx, x - r, 0, x + r, 0, [[0, '#8fa2bf'], [0.5, '#7085a6'], [0.51, '#55688a'], [1, '#43546f']]); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.33, y - r * 0.82); ctx.lineTo(x + r * 0.05, y - r * 1.75); ctx.lineTo(x + r * 0.5, y - r * 0.8);
      ctx.lineTo(x + r * 0.3, y - r * 0.92); ctx.lineTo(x + r * 0.12, y - r * 0.74); ctx.lineTo(x - r * 0.1, y - r * 0.95); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.fillStyle = '#2f6a3a';
      for (const [dx2, s] of [[-1.0, 0.35], [-0.75, 0.45], [0.75, 0.42], [1.0, 0.32]]) {
        ctx.beginPath(); ctx.moveTo(x + dx2 * r - s * r * 0.4, y + r * 0.15); ctx.lineTo(x + dx2 * r, y + r * 0.15 - s * r * 1.4); ctx.lineTo(x + dx2 * r + s * r * 0.4, y + r * 0.15); ctx.closePath(); ctx.fill();
      }
    },
    globe(ctx, x, y, r, t) {
      ctx.beginPath(); ctx.moveTo(x - r * 0.95, y + r * 0.45); ctx.lineTo(x - r * 0.75, y - r * 0.05); ctx.lineTo(x + r * 0.75, y - r * 0.05); ctx.lineTo(x + r * 0.95, y + r * 0.45); ctx.closePath();
      ctx.fillStyle = lgr(ctx, 0, y - r * 0.05, 0, y + r * 0.45, [[0, '#8a5a34'], [1, '#4e3020']]); ctx.fill();
      ctx.fillStyle = '#e8c46c'; ctx.fillRect(x - r * 0.8, y + r * 0.02, r * 1.6, r * 0.08);
      const gy = y - r * 0.8, R = r * 0.95;
      ctx.save(); ctx.beginPath(); ctx.arc(x, gy, R, 0, TAU); ctx.clip();
      ctx.fillStyle = lgr(ctx, 0, gy - R, 0, gy + R, [[0, '#b9dcf5'], [1, '#e8f5ff']]); ctx.fillRect(x - R, gy - R, R * 2, R * 2);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, gy + R * 0.8, R * 1.1, R * 0.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f7a46';
      for (let i = 0; i < 3; i++) { const s = 1 - i * 0.25; ctx.beginPath(); ctx.moveTo(x - R * 0.45 * s, gy + R * (0.55 - i * 0.32)); ctx.lineTo(x, gy + R * (0.1 - i * 0.32)); ctx.lineTo(x + R * 0.45 * s, gy + R * (0.55 - i * 0.32)); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 14; i++) {
        const ph = (t * 0.12 + i / 14) % 1;
        ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.3 + t * 0.7) * R * 0.75, gy - R + ph * R * 1.8, 0.6 + (i % 3) * 0.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, gy, R, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, gy, R * 0.8, -2.6, -1.8); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1.2, r * 0.1); ctx.stroke();
    },
    planet(ctx, x, y, r) {
      const cy = y - r * 0.4, R = r * 0.85, tilt = -0.35;
      const ring = (a0, a1) => {
        ctx.save(); ctx.translate(x, cy); ctx.rotate(tilt);
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.85, R * 0.5, 0, a0, a1);
        ctx.strokeStyle = 'rgba(240,215,160,0.95)'; ctx.lineWidth = R * 0.26; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, R * 1.85, R * 0.5, 0, a0, a1);
        ctx.strokeStyle = 'rgba(150,110,70,0.5)'; ctx.lineWidth = R * 0.06; ctx.stroke();
        ctx.restore();
      };
      ring(Math.PI, TAU);
      ctx.save(); ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.clip();
      ctx.translate(x, cy); ctx.rotate(tilt);
      const bands = ['#f2c890', '#d9894a', '#f6dcae', '#c8783a', '#eab47a', '#b8693a'];
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-R * 1.2, -R + i * (R * 2 / bands.length), R * 2.4, R * 2 / bands.length + 1); });
      ctx.rotate(-tilt);
      ctx.fillStyle = rg(ctx, -R * 0.4, -R * 0.4, 0, R * 1.5, [[0, 'rgba(255,255,255,0.35)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(20,10,40,0.55)']]);
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
      ring(0, Math.PI);
    },
    saucer(ctx, x, y, r, t) {
      const cy = y - r * 0.45 + Math.sin(t * 2) * r * 0.06;
      ctx.beginPath(); ctx.arc(x, cy - r * 0.15, r * 0.6, Math.PI, TAU);
      ctx.fillStyle = 'rgba(150,235,255,0.55)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, cy - r * 0.25, r * 0.22, r * 0.25, 0, 0, TAU); ctx.fillStyle = '#7ee08a'; ctx.fill();
      ctx.fillStyle = '#10180f';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + d * r * 0.09, cy - r * 0.28, r * 0.06, r * 0.09, d * 0.4, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(x, cy - r * 0.15, r * 0.6, Math.PI, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, cy, r * 1.35, r * 0.4, 0, 0, TAU);
      ctx.fillStyle = lgr(ctx, 0, cy - r * 0.4, 0, cy + r * 0.4, [[0, '#ffffff'], [0.5, '#c9d0dc'], [1, '#7a8396']]); ctx.fill();
      const cols = ['#ff6f86', '#ffd36b', '#7ee08a', '#6fd0ff', '#c8a2ff', '#ff9a5a'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI + 0.25, on = Math.floor(t * 4) % 6 === i;
        const lx = x + Math.cos(a) * r * 1.1, ly = cy + Math.sin(a) * r * 0.22;
        ctx.beginPath(); ctx.arc(lx, ly, r * (on ? 0.13 : 0.09), 0, TAU); ctx.fillStyle = on ? '#ffffff' : cols[i]; ctx.fill();
      }
    },
    comet(ctx, x, y, r, t) {
      const cy = y - r * 0.4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const spread = (i - 1.5) * r * 0.22, wob = Math.sin(t * 2 + i) * r * 0.15;
        ctx.beginPath(); ctx.moveTo(x, cy + spread * 0.4);
        ctx.quadraticCurveTo(x - r * 1.6, cy - r * 0.2 + spread + wob, x - r * 3.2, cy - r * 0.7 + spread * 1.6);
        ctx.strokeStyle = lgr(ctx, x, cy, x - r * 3.2, cy - r * 0.7, [[0, 'rgba(200,235,255,0.75)'], [1, 'rgba(160,140,255,0)']]);
        ctx.lineWidth = r * (0.5 - Math.abs(i - 1.5) * 0.12); ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, cy, r * 0.6, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.15, cy - r * 0.15, 0, r * 0.6, [[0, '#ffffff'], [0.6, '#cfeaff'], [1, '#7fb6ff']]); ctx.fill();
      twinkle(ctx, x + r * 0.2, cy - r * 0.2, r * 0.5, 0.7 + 0.3 * Math.sin(t * 4));
    },
    galaxy(ctx, x, y, r, t) {
      const cy = y - r * 0.55, R = r * 1.05;
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 0.75, r * 0.2, 0, 0, TAU); ctx.fillStyle = '#c99a2a'; ctx.fill();
      ctx.fillStyle = lgr(ctx, x - r * 0.4, 0, x + r * 0.4, 0, [[0, '#ffe7a3'], [0.5, '#e8b84a'], [1, '#9a6a14']]);
      ctx.fillRect(x - r * 0.4, cy + R * 0.85, r * 0.8, y + r * 0.35 - (cy + R * 0.85));
      ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU);
      ctx.fillStyle = rg(ctx, x, cy, 0, R, [[0, '#2a1450'], [1, '#05030f']]); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 46; i++) {
          const s = i / 46, ang = t * 0.5 + arm * Math.PI + s * 3.4, rad = s * R * 0.92;
          const px = x + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad * 0.55;
          const col = i % 3 === 0 ? '255,170,230' : i % 3 === 1 ? '150,190,255' : '255,255,255';
          ctx.fillStyle = `rgba(${col},${0.85 - s * 0.5})`;
          ctx.beginPath(); ctx.arc(px, py, 0.5 + (1 - s) * 1.3, 0, TAU); ctx.fill();
        }
      }
      ctx.fillStyle = rg(ctx, x, cy, 0, R * 0.45, [[0, 'rgba(255,245,210,0.95)'], [1, 'rgba(255,200,150,0)']]);
      ctx.fillRect(x - R, cy - R, R * 2, R * 2);
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, cy, R, 0, TAU); ctx.strokeStyle = 'rgba(220,210,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, cy, R * 0.82, -2.6, -1.9); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.stroke();
    },
    cupcake(ctx, x, y, r) {
      ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.45); ctx.lineTo(x + r * 0.8, y - r * 0.45); ctx.lineTo(x + r * 0.58, y + r * 0.5); ctx.lineTo(x - r * 0.58, y + r * 0.5); ctx.closePath();
      ctx.fillStyle = '#8fd0f0'; ctx.fill();
      ctx.strokeStyle = 'rgba(40,110,150,0.5)'; ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.22, y - r * 0.45); ctx.lineTo(x + i * r * 0.16, y + r * 0.5); ctx.stroke(); }
      const swirl = [[0, -0.6, 0.95, 0.38], [0, -0.92, 0.72, 0.3], [0, -1.2, 0.46, 0.24]];
      for (const [dx2, dy2, rx, ry] of swirl) {
        ctx.beginPath(); ctx.ellipse(x + dx2 * r, y + dy2 * r, rx * r, ry * r, 0, 0, TAU);
        ctx.fillStyle = rg(ctx, x - r * 0.2, y + (dy2 - 0.15) * r, 1, rx * r * 1.2, [[0, '#ffe3ee'], [1, '#ff8fb8']]); ctx.fill();
      }
      const cols = ['#ffe066', '#6fd0ff', '#9be27a', '#ffffff', '#c8a2ff'];
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, r * 0.08);
      for (let i = 0; i < 9; i++) {
        const sx = x + Math.cos(i * 2.4) * r * 0.55, sy = y - r * (0.75 + (i % 3) * 0.18), a = i * 1.3;
        ctx.strokeStyle = cols[i % 5]; ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * r * 0.08, sy - Math.sin(a) * r * 0.08); ctx.lineTo(sx + Math.cos(a) * r * 0.08, sy + Math.sin(a) * r * 0.08); ctx.stroke();
      }
      ctx.strokeStyle = '#3f8a34'; ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.5); ctx.quadraticCurveTo(x + r * 0.15, y - r * 1.8, x + r * 0.3, y - r * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - r * 1.45, r * 0.22, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.07, y - r * 1.52, 0, r * 0.22, [[0, '#ff8a8a'], [1, '#c8102e']]); ctx.fill();
    },
    donut(ctx, x, y, r) {
      const cy = y - r * 0.15;
      ctx.beginPath(); ctx.ellipse(x, cy, r * 1.3, r * 0.62, 0, 0, TAU);
      ctx.fillStyle = rg(ctx, x - r * 0.3, cy - r * 0.3, 1, r * 1.4, [[0, '#f0c07a'], [1, '#b87a3a']]); ctx.fill();
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * TAU, drip = 1 + 0.07 * Math.sin(i * 2.3) + (Math.sin(a) > 0.3 ? 0.04 * Math.sin(i * 5) : 0);
        const px = x + Math.cos(a) * r * 1.12 * drip, py = cy - r * 0.08 + Math.sin(a) * r * 0.5 * drip;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rg(ctx, x - r * 0.3, cy - r * 0.4, 1, r * 1.3, [[0, '#ffd0e2'], [1, '#ff6f9e']]); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, cy - r * 0.06, r * 0.36, r * 0.16, 0, 0, TAU); ctx.fillStyle = '#c88a48'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, cy - r * 0.03, r * 0.28, r * 0.1, 0, 0, TAU); ctx.fillStyle = 'rgba(20,40,60,0.85)'; ctx.fill();
      const cols = ['#ffe066', '#6fd0ff', '#9be27a', '#ffffff', '#c8a2ff', '#ff9a5a'];
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, r * 0.08);
      for (let i = 0; i < 16; i++) {
        const a = i * 0.39 + 0.2, d = 0.6 + (i % 3) * 0.15;
        const sx = x + Math.cos(a) * r * d, sy = cy - r * 0.08 + Math.sin(a) * r * d * 0.45, b = i * 1.9;
        ctx.strokeStyle = cols[i % 6]; ctx.beginPath(); ctx.moveTo(sx - Math.cos(b) * r * 0.07, sy - Math.sin(b) * r * 0.04); ctx.lineTo(sx + Math.cos(b) * r * 0.07, sy + Math.sin(b) * r * 0.04); ctx.stroke();
      }
    },
    macaron(ctx, x, y, r) {
      const cy = y - r * 0.3;
      ctx.beginPath(); ctx.ellipse(x, cy + r * 0.3, r * 1.1, r * 0.38, 0, 0, TAU); ctx.fillStyle = '#b8a0f0'; ctx.fill();
      ctx.fillStyle = '#d6c6ff';
      for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.arc(x + i * r * 0.19, cy + r * 0.12, r * 0.08, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(x, cy + r * 0.02, r * 0.98, r * 0.2, 0, 0, TAU); ctx.fillStyle = '#fff4e0'; ctx.fill();
      for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.arc(x + i * r * 0.19, cy - r * 0.1, r * 0.08, 0, TAU); ctx.fillStyle = '#d6c6ff'; ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(x, cy - r * 0.32, r * 1.1, r * 0.46, 0, Math.PI, TAU); ctx.lineTo(x + r * 1.1, cy - r * 0.12); ctx.lineTo(x - r * 1.1, cy - r * 0.12); ctx.closePath();
      ctx.fillStyle = rg(ctx, x - r * 0.35, cy - r * 0.6, 1, r * 1.2, [[0, '#f0e6ff'], [1, '#b8a0f0']]); ctx.fill();
    },
    gateau(ctx, x, y, r, t) {
      const tiers = [[2.2, 0.62], [1.62, 0.56], [1.06, 0.5]];
      let base = y + r * 0.4;
      tiers.forEach(([w, h], i) => {
        const top = base - h * r;
        ctx.fillStyle = lgr(ctx, x - w * r / 2, 0, x + w * r / 2, 0, [[0, '#f3e6dc'], [0.45, '#fffaf4'], [1, '#e6d2c4']]);
        ctx.fillRect(x - w * r / 2, top, w * r, h * r);
        ctx.fillStyle = '#ffc4d8';
        ctx.beginPath(); ctx.moveTo(x - w * r / 2, top);
        for (let j = 0; j <= 8; j++) { const px = x - w * r / 2 + (j / 8) * w * r; ctx.lineTo(px, top + (j % 2 ? r * 0.14 : r * 0.05)); }
        ctx.lineTo(x + w * r / 2, top); ctx.closePath(); ctx.fill();
        const shine = (Math.sin(t * 1.6 + i) + 1) / 2;
        ctx.fillStyle = lgr(ctx, x - w * r / 2, 0, x + w * r / 2, 0, [[0, '#c99a2a'], [Math.max(0.01, shine * 0.9), '#ffe7a3'], [1, '#c99a2a']]);
        ctx.fillRect(x - w * r / 2, base - r * 0.12, w * r, r * 0.12);
        ctx.fillStyle = '#ffffff';
        for (let j = 0; j < Math.round(w * 4); j++) { ctx.beginPath(); ctx.arc(x - w * r / 2 + (j + 0.5) * (w * r / Math.round(w * 4)), base - r * 0.2, r * 0.045, 0, TAU); ctx.fill(); }
        base = top;
      });
      for (const d of [-0.28, 0, 0.28]) flower(ctx, x + d * r, base - r * 0.05, r * 0.28, '#ff7fac', '#c8124e', d * 3, 6);
      twinkle(ctx, x, base - r * 0.45, r * 0.4, 0.6 + 0.4 * Math.sin(t * 2.5), '#ffe7a3');
      for (let i = 0; i < 3; i++) twinkle(ctx, x + Math.cos(t + i * 2) * r * 1.3, y - r * (0.6 + i * 0.5), r * 0.25, Math.max(0, Math.sin(t * 2 + i * 2)), '#fff6d0');
    },
  };
  const BOB_GLOW = {
    lantern: t => ['255,180,90', 3.6, 0.55 + 0.1 * Math.sin(t * 9)],
    pearl: () => ['220,225,255', 2.6, 0.32],
    star: t => ['255,225,140', 3.8, 0.5 + 0.15 * Math.sin(t * 2.5)],
    comet: () => ['170,220,255', 3, 0.45],
    saucer: t => ['140,240,255', 2.6, 0.25 + 0.08 * Math.sin(t * 3)],
    galaxy: t => ['190,140,255', 3.6, 0.45 + 0.1 * Math.sin(t * 1.5)],
    tiara: t => ['255,190,225', 3.4, 0.4 + 0.1 * Math.sin(t * 2)],
    gateau: () => ['255,225,150', 3.2, 0.3],
    globe: () => ['220,240,255', 2.4, 0.18],
    gilded: t => ['255,220,150', 2.4, 0.16 + 0.06 * Math.sin(t * 1.9)],
  };

  /* Bobber materials for the lighting engine. */
  const MATS = {
    plastic: { gloss: 0.55, shine: 34, irid: 0.03, metal: 0.08, back: 0.25, norm: 1.35, detail: 1.0 },
    wood:    { gloss: 0.28, shine: 18, irid: 0.0, metal: 0.05, back: 0.15, norm: 1.3, detail: 1.3 },
    matte:   { gloss: 0.12, shine: 10, irid: 0.0, metal: 0.0, back: 0.45, norm: 1.25, detail: 1.5 },
    paper:   { gloss: 0.08, shine: 8, irid: 0.0, metal: 0.0, back: 1.2, norm: 1.1, detail: 1.0 },
    metal:   { gloss: 0.85, shine: 46, irid: 0.05, metal: 0.75, back: 0.2, norm: 1.5, detail: 1.6 },
    pearl:   { gloss: 0.8, shine: 40, irid: 0.45, metal: 0.3, back: 0.3, norm: 1.4, detail: 1.0 },
    glass:   { gloss: 1.0, shine: 70, irid: 0.08, metal: 0.1, back: 0.6, norm: 1.4, detail: 0.8 },
    sugar:   { gloss: 0.42, shine: 22, irid: 0.0, metal: 0.05, back: 0.3, norm: 1.3, detail: 1.4 },
  };
  const BOB_KIND = {
    quill: 'wood', duck: 'wood', pinecone: 'wood', lantern: 'paper',
    kitten: 'matte', frenchie: 'matte', pineapple: 'matte', daisy: 'matte', lily: 'matte', butterfly: 'matte', peak: 'matte',
    heart: 'metal', tiara: 'metal', lifebuoy: 'matte', saucer: 'metal', star: 'metal',
    seashell: 'pearl', pearl: 'pearl', globe: 'glass', comet: 'glass', galaxy: 'glass',
    cupcake: 'sugar', donut: 'sugar', macaron: 'sugar', gateau: 'sugar',
  };
  const matCache = {};
  function bobMat(id) {
    if (matCache[id]) return matCache[id];
    const B = BOB[id] || {};
    return (matCache[id] = Object.assign({ scale: 0, bend: 0, caust: 0, sweep: B.heir ? 0.32 : 0, rim: [0.9, 0.95, 1] }, MATS[BOB_KIND[id] || 'plastic']));
  }

  /* Paint a bobber into its own canvas and light it. Returns the sprite and where the bobber's anchor sits.
     Engines are kept per use (the lake, the shop) so their canvases are not resized back and forth. */
  const sprites = {};
  function bobSprite(id, r, t, Lt, dpr, use) {
    let Sp = sprites[use];
    if (!Sp) {
      const mk = () => { const c = document.createElement('canvas'); return { c, x: c.getContext('2d') }; };
      Sp = sprites[use] = { paint: mk(), lit: mk(), tint: mk(), eng: typeof LitGL !== 'undefined' ? LitGL.create() : null };
    }
    const ax = r * 2.7, ay = r * 4.0, w = r * 5.4, h = r * 5.8;
    const pw = Math.max(4, Math.ceil(w * dpr)), ph = Math.max(4, Math.ceil(h * dpr));
    for (const k of ['paint', 'lit', 'tint']) if (Sp[k].c.width !== pw || Sp[k].c.height !== ph) { Sp[k].c.width = pw; Sp[k].c.height = ph; }
    const px = Sp.paint.x;
    px.setTransform(dpr, 0, 0, dpr, 0, 0);
    px.clearRect(0, 0, w, h);
    px.lineCap = 'butt';
    (BOB_DRAW[id] || BOB_DRAW.classic)(px, ax, ay, r, t);
    const out = Sp.eng ? Sp.eng.light(Sp.paint.c, bobMat(id), t, Lt, { rad: Math.max(2, r * dpr * 0.42) }) : Sp.paint.c;
    const lx = Sp.lit.x;
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.clearRect(0, 0, pw, ph);
    lx.drawImage(out, 0, 0);
    return { Sp, ax, ay, w, h, pw, ph };
  }

  /* A bobber in the scene. On the water it floats properly: the part above the waterline is drawn crisp,
     the part below is seen tinted and wobbling through the water, a broken reflection hangs beneath it,
     and a meniscus lip and contact shadow sit where it meets the surface.
     o: { inWater, dip, light, water (rgb 0–1), refl (reflection strength), dpr, use ('scene' | 'shop') } */
  function bobberFX(ctx, id, x, y, r, t, o = {}) {
    const inWater = !!o.inWater, dip = o.dip || 0, Lt = o.light || STUDIO, dpr = o.dpr || 1;
    const cy = y + (inWater ? dip - r * 0.25 : 0);
    const glow = BOB_GLOW[id];
    const G = bobSprite(id, r, t, Lt, dpr, o.use || 'scene');
    const img = G.Sp.lit.c, left = x - G.ax, top = cy - G.ay;
    if (!inWater) {
      if (glow) { const [c, sz, a] = glow(t); halo(ctx, x, cy - r * 0.6, r * sz, c, a); }
      ctx.drawImage(img, 0, 0, G.pw, G.ph, left, top, G.w, G.h);
      return;
    }
    const wl = y + r * 0.3;                         // the waterline
    const cut = Math.max(0, Math.min(G.h, wl - top)); // sprite rows above the water
    const k = G.pw / G.w;
    const water = Lt.water || STUDIO.water;
    const refl = o.refl ?? 0.5;
    ctx.save();
    // reflection: mirrored about the waterline, broken into wavering strips that fade with depth
    if (cut > 0) {
      const M0 = ctx.getTransform(), MR = M0.translate(0, 2 * wl).scale(1, -1);
      const rh = Math.min(cut, r * 3.4), n = 7;
      ctx.setTransform(MR);
      for (let i = 0; i < n; i++) {
        const y0 = (i / n) * rh, y1 = ((i + 1) / n) * rh;
        const sy = cut - y1;
        if (sy + (y1 - y0) <= 0) break;
        const s0 = Math.max(0, sy), sh = cut - y0 - s0;
        if (sh <= 0) continue;
        const off = Math.sin(t * 2.4 + i * 1.25 + x * 0.04) * r * 0.16 * ((i + 1) / n);
        ctx.globalAlpha = refl * 0.55 * (1 - i / n);
        ctx.drawImage(img, 0, s0 * k, G.pw, sh * k, left + off, top + s0, G.w, sh);
      }
      ctx.setTransform(M0);
      ctx.globalAlpha = 1;
      if (glow && dip < r * 1.6) { const [c, sz, a] = glow(t); halo(ctx, x, 2 * wl - (cy - r * 0.6), r * sz * 0.8, c, a * 0.45); }
    }
    // contact shadow just under the surface
    ctx.save();
    ctx.translate(x, wl + r * 0.1); ctx.scale(1, 0.26);
    ctx.fillStyle = rg(ctx, 0, 0, 0, r * 1.35, [[0, 'rgba(0,0,0,0.2)'], [0.6, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.fill();
    ctx.restore();
    // the submerged part, tinted by the water, squashed by refraction and wobbling
    if (cut < G.h) {
      const tx = G.Sp.tint.x;
      tx.setTransform(1, 0, 0, 1, 0, 0);
      tx.globalCompositeOperation = 'source-over';
      tx.clearRect(0, 0, G.pw, G.ph);
      tx.drawImage(img, 0, 0);
      tx.globalCompositeOperation = 'source-atop';
      tx.fillStyle = `rgba(${rgbOf(water)},0.55)`;
      tx.fillRect(0, 0, G.pw, G.ph);
      tx.globalCompositeOperation = 'source-over';
      const below = G.h - cut, n = 5;
      for (let i = 0; i < n; i++) {
        const s0 = cut + (i / n) * below, sh = below / n;
        const off = Math.sin(t * 3.1 + i * 1.7) * r * 0.07 * (i + 1) / n;
        ctx.globalAlpha = 0.62 * (1 - (i / n) * 0.6);
        ctx.drawImage(G.Sp.tint.c, 0, s0 * k, G.pw, sh * k, left + off, wl + (s0 - cut) * 0.8, G.w, sh * 0.8);
      }
      ctx.globalAlpha = 1;
    }
    // above the water
    if (glow && dip < r * 1.6) { const [c, sz, a] = glow(t); halo(ctx, x, cy - r * 0.6, r * sz, c, a); }
    if (cut > 0) ctx.drawImage(img, 0, 0, G.pw, cut * k, left, top, G.w, cut);
    // meniscus: a bright lip at the front and a faint one behind
    if (dip < r * 1.4) {
      ctx.lineWidth = Math.max(0.8, r * 0.09);
      ctx.strokeStyle = `rgba(${rgbOf(Lt.key || [1, 1, 1])},0.5)`;
      ctx.beginPath(); ctx.ellipse(x, wl, r * 1.0, r * 0.26, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.ellipse(x, wl, r * 1.0, r * 0.26, 0, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  /* Flat painter, kept for previews of the 2D path and anything that just wants the drawing. */
  function paintBobber(ctx, id, x, y, r, t, o = {}) {
    const draw = BOB_DRAW[id] || BOB_DRAW.classic;
    const inWater = !!o.inWater, dip = o.dip || 0;
    const cy = y + (inWater ? dip - r * 0.25 : 0);
    const gl = BOB_GLOW[id];
    if (gl && dip < r * 1.6) { const [c, sz, a] = gl(t); halo(ctx, x, cy - r * 0.6, r * sz, c, a); }
    ctx.save();
    if (inWater) { ctx.beginPath(); ctx.rect(x - r * 6, 0, r * 12, y + r * 0.3); ctx.clip(); }
    ctx.lineCap = 'butt';
    draw(ctx, x, cy, r, t);
    ctx.restore();
  }

  /* ================= Line painter ================= */
  function sampleLine(a, b, sag, n, sway = 0) {
    const cx = (a.x + b.x) / 2 + sway, cy = Math.max(a.y, b.y) + sag;
    const pts = [];
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      const k = i / n, u = 1 - k;
      const x = u * u * a.x + 2 * u * k * cx + k * k * b.x, y = u * u * a.y + 2 * u * k * cy + k * k * b.y;
      if (i) acc += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y);
      pts.push({ x, y, s: acc });
    }
    return pts;
  }
  /* Points spaced every `gap` pixels along the line. */
  function along(pts, gap, offset = 0) {
    const out = [], total = pts[pts.length - 1].s;
    let j = 1;
    for (let s = offset; s < total - gap * 0.3; s += gap) {
      while (j < pts.length - 1 && pts[j].s < s) j++;
      const p0 = pts[j - 1], p1 = pts[j], f = (s - p0.s) / Math.max(0.001, p1.s - p0.s);
      out.push({ x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, a: Math.atan2(p1.y - p0.y, p1.x - p0.x) });
    }
    return out;
  }

  /* o: { light, sway (sideways drift of the slack, px) } */
  function paintLine(ctx, id, a, b, sag, m, t, o = {}) {
    const S = LINE[id] || LINE.mono;
    const sh = shading(o.light || STUDIO);
    const base = Math.max(1, m * 0.0016), w = base * (S.width || 1);
    let pts = sampleLine(a, b, sag, 48, o.sway || 0);
    if (S.wavy) {
      pts = pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return p;
        const q = pts[i + 1], o = pts[i - 1], dx = q.x - o.x, dy = q.y - o.y, l = Math.hypot(dx, dy) || 1;
        const off = Math.sin(i * 1.1 + t * 2) * w * 1.8 * Math.sin((i / (pts.length - 1)) * Math.PI);
        return { x: p.x - (dy / l) * off, y: p.y + (dx / l) * off, s: p.s };
      });
    }
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (S.glow) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      path(); ctx.strokeStyle = S.glow; ctx.lineWidth = w * 4.5; ctx.stroke();
      ctx.restore();
    }
    // the line tapers away from the viewer: thicker at the rod, finer toward the float
    const chunks = 4, per = (pts.length - 1) / chunks;
    const sub = (i0, i1, dy = 0) => { ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y + dy); for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y + dy); };
    if (S.prism) {
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y), h = (t * 60) % 360;
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${(h + i * 60) % 360},95%,72%,0.95)`);
      ctx.strokeStyle = g;
    } else if (S.grad) {
      // colours that drift slowly down the line
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y), n = S.grad.length;
      for (let i = 0; i <= 8; i++) {
        const f = (((i / 8) * 1.5 - t * 0.09) % 1 + 1) % 1 * n, i0 = Math.floor(f) % n;
        g.addColorStop(i / 8, mix(S.grad[i0], S.grad[(i0 + 1) % n], f - Math.floor(f)));
      }
      ctx.strokeStyle = g;
    } else ctx.strokeStyle = S.color;
    for (let c = 0; c < chunks; c++) {
      sub(Math.round(c * per), Math.round((c + 1) * per));
      ctx.lineWidth = w * (1.2 - 0.4 * ((c + 0.5) / chunks));
      ctx.stroke();
    }
    // lit as a round cord: the lake's ambient light, a shaded underside and a sheen along the top
    const dimA = sh.dim * (S.glow ? 0.4 : 0.85);
    if (dimA > 0.02) { path(); ctx.strokeStyle = `rgba(${rgbOf(sh.T)},${dimA})`; ctx.lineWidth = w; ctx.stroke(); }
    if (w >= 1.8) { sub(0, pts.length - 1, w * 0.22); ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = w * 0.45; ctx.stroke(); }
    sub(0, pts.length - 1, -w * 0.22); ctx.strokeStyle = `rgba(${rgbOf(sh.key)},${w >= 1.8 ? 0.26 : 0.16})`; ctx.lineWidth = Math.max(0.5, w * 0.3); ctx.stroke();

    const gap = Math.max(10, m * 0.024);
    switch (S.pattern) {
      case 'stitch':
        path(); ctx.setLineDash([w * 0.9, w * 0.9]); ctx.strokeStyle = S.stitch; ctx.lineWidth = Math.max(0.7, w * 0.22); ctx.lineCap = 'butt'; ctx.stroke(); ctx.setLineDash([]);
        break;
      case 'twist':
        path(); ctx.setLineDash([w * 0.8, w * 1.1]); ctx.lineDashOffset = -t * 2; ctx.strokeStyle = S.twist; ctx.lineWidth = w * 0.85; ctx.lineCap = 'butt'; ctx.stroke(); ctx.setLineDash([]);
        break;
      case 'camo':
        S.camo.forEach((c, i) => { path(); ctx.setLineDash([w * 1.6, w * 3.2]); ctx.lineDashOffset = -i * w * 2.4; ctx.strokeStyle = c; ctx.lineWidth = w * 0.9; ctx.lineCap = 'butt'; ctx.stroke(); });
        ctx.setLineDash([]);
        break;
      case 'piped': {
        const n = S.piped.length;
        S.piped.forEach((c, i) => { path(); ctx.setLineDash([w * 1.6, w * 1.6 * (2 * n - 1)]); ctx.lineDashOffset = -i * w * 3.2; ctx.strokeStyle = c; ctx.lineWidth = w * 1.05; ctx.lineCap = 'round'; ctx.stroke(); });
        ctx.setLineDash([]);
        break;
      }
      case 'sheen':
        path(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(0.6, w * 0.28); ctx.stroke();
        break;
      case 'beads':
        along(pts, gap * 0.6, gap * 0.3).forEach((p, i) => {
          const R = Math.max(1.6, base * 1.8);
          ctx.globalAlpha = S.beadAlpha || 1;
          ctx.fillStyle = rg(ctx, p.x - R * 0.35, p.y - R * 0.35, 0, R * 1.1, [[0, '#ffffff'], [0.5, S.beads[i % S.beads.length]], [1, S.beads[(i + 1) % S.beads.length]]]);
          ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
        });
        break;
      case 'flowers':
        along(pts, gap, gap * 0.5).forEach((p, i) => flower(ctx, p.x, p.y, Math.max(2.4, base * 2.6), '#ffffff', '#ffd23f', i * 0.8));
        break;
      case 'sparkle': {
        const sc = S.spark || ['#d6c8ff', '#ffffff'];
        along(pts, gap * 0.55, (t * 8) % (gap * 0.55)).forEach((p, i) => twinkle(ctx, p.x + Math.sin(i * 3.1) * base * 2, p.y + Math.cos(i * 2.3) * base * 2, Math.max(1.6, base * 1.6), Math.max(0, Math.sin(t * 3 + i * 1.7)), sc[i % 2]));
        break;
      }
      case 'chain': {
        // links alternate between face-on rings and edge-on bars, with a glint now and then
        const s = Math.max(1.7, base * 1.5);
        along(pts, s * 1.7, 0).forEach((p, i) => {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          if (i % 2) {
            ctx.strokeStyle = S.chain[1]; ctx.lineWidth = Math.max(1.2, s * 0.62); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-s * 0.85, 0); ctx.lineTo(s * 0.85, 0); ctx.stroke();
            ctx.strokeStyle = S.chain[0]; ctx.lineWidth = Math.max(0.5, s * 0.2);
            ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.1); ctx.lineTo(s * 0.7, -s * 0.1); ctx.stroke();
          } else {
            ctx.strokeStyle = S.chain[1]; ctx.lineWidth = Math.max(0.9, s * 0.36);
            ctx.beginPath(); ctx.ellipse(0, 0, s * 1.05, s * 0.6, 0, 0, TAU); ctx.stroke();
            ctx.strokeStyle = S.chain[0]; ctx.lineWidth = Math.max(0.5, s * 0.16);
            ctx.beginPath(); ctx.ellipse(0, -s * 0.06, s * 1.0, s * 0.54, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
          }
          ctx.restore();
          if (i % 5 === 2) twinkle(ctx, p.x, p.y - s * 0.3, s * 1.5, Math.pow(Math.max(0, Math.sin(t * 1.8 + i * 0.9)), 6), '#fff6d0');
        });
        break;
      }
      case 'sprigs':
        along(pts, gap * 0.42, gap * 0.2).forEach((p, i) => {
          const L = Math.max(2.6, base * 2.4);
          ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.8, base * 0.55);
          for (let j = -1; j <= 1; j++) for (const d of [-1, 1]) {
            const a = p.a + d * (0.75 + j * 0.18) + (j - 1) * 0.12;
            ctx.strokeStyle = (i + j) % 2 ? '#4f8f4a' : '#2c5a2c';
            const ox = Math.cos(p.a) * j * L * 0.45, oy = Math.sin(p.a) * j * L * 0.45;
            ctx.beginPath(); ctx.moveTo(p.x + ox, p.y + oy); ctx.lineTo(p.x + ox + Math.cos(a) * L, p.y + oy + Math.sin(a) * L); ctx.stroke();
          }
          if (i % 3 === 1) for (const [ox, oy] of [[0, 0], [1.1, 0.7]]) {
            const R = Math.max(1.2, base * 1.05), bx = p.x + ox * R, by = p.y + oy * R;
            ctx.fillStyle = '#d02a3a'; ctx.beginPath(); ctx.arc(bx, by, R, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(bx - R * 0.35, by - R * 0.35, R * 0.38, 0, TAU); ctx.fill();
          }
        });
        break;
      case 'embers': {
        // a coal-red core breathing along the braid, and sparks lifting off it
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const heat = 0.75 + 0.25 * Math.sin(t * 2.3);
        ctx.setLineDash([w * 2.6, w * 1.5]); ctx.lineDashOffset = -t * 7; ctx.lineCap = 'round';
        path(); ctx.strokeStyle = `rgba(255,90,30,${0.32 * heat})`; ctx.lineWidth = w * 1.9; ctx.stroke();
        path(); ctx.strokeStyle = `rgba(255,${150 + 40 * heat},70,${0.95 * heat})`; ctx.lineWidth = w * 0.6; ctx.stroke();
        ctx.setLineDash([]);
        along(pts, gap * 0.6, gap * 0.3).forEach((p, i) => {
          const ph = (t * (0.45 + (i % 3) * 0.12) + i * 0.37) % 1, rr = Math.max(1.1, base * 1.25) * (1 - ph * 0.6);
          ctx.fillStyle = `rgba(255,${150 + (i % 3) * 35},70,${(1 - ph) * 0.9})`;
          ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 2 + i) * gap * 0.15 * ph, p.y - ph * gap * 1.3, rr, 0, TAU); ctx.fill();
        });
        ctx.restore();
        break;
      }
      case 'flakes':
        along(pts, gap * 0.75, gap * 0.35).forEach((p, i) => {
          const tw = Math.max(0, Math.sin(t * 1.3 + i * 1.9)), s = Math.max(2, base * 2.1) * (0.55 + 0.45 * tw);
          if (tw < 0.05) return;
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.7 * tw})`; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let j = 0; j < 3; j++) { const a = (j / 3) * Math.PI + i; ctx.moveTo(p.x - Math.cos(a) * s, p.y - Math.sin(a) * s); ctx.lineTo(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); }
          ctx.stroke();
          if (tw > 0.8) twinkle(ctx, p.x, p.y, s * 0.7, (tw - 0.8) * 5);
        });
        break;
      case 'stars':
        along(pts, gap * 1.4, gap * 0.4).forEach((p, i) => {
          const s = Math.max(2.4, base * (2.2 + (i % 3) * 0.6));
          halo(ctx, p.x, p.y, s * 3, '170,200,255', 0.35);
          twinkle(ctx, p.x, p.y, s * (0.85 + 0.25 * Math.sin(t * 2.4 + i)), 1, '#ffffff');
        });
        break;
      case 'gems':
        along(pts, gap * 0.7, gap * 0.35).forEach((p, i) => {
          const s = Math.max(1.6, base * 1.4);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
          twinkle(ctx, p.x, p.y, s * 1.8, Math.pow(Math.max(0, Math.sin(t * 2.2 + i * 1.3)), 4));
        });
        break;
    }
    // glints of light that run along the line as it sways
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const total = pts[pts.length - 1].s;
    for (const [sp, ph, amp] of [[0.21, 0, 0.6], [0.13, 0.55, 0.4]]) {
      const c0 = (((t * sp + ph) % 1.3) - 0.15) * total, gl = Math.max(14, total * 0.07);
      for (let i = 1; i < pts.length; i++) {
        const d = (pts[i].s - c0) / gl;
        if (Math.abs(d) > 2) continue;
        ctx.strokeStyle = `rgba(${rgbOf(sh.key)},${amp * Math.exp(-d * d)})`;
        ctx.lineWidth = Math.max(0.8, w * 0.7);
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y - w * 0.15); ctx.lineTo(pts[i].x, pts[i].y - w * 0.15); ctx.stroke();
      }
    }
    ctx.restore();

    if (S.clip) {
      const p = pts[pts.length - 1], q = pts[pts.length - 4];
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.y - q.y, p.x - q.x));
      const s = Math.max(3, base * 3);
      rrect(ctx, -s * 1.6, -s * 0.55, s * 2, s * 1.1, s * 0.5);
      ctx.fillStyle = S.clip; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ================= Bait icons ================= */
  function paintBait(ctx, id, x, y, s, t) {
    if (!id) {
      ctx.strokeStyle = 'rgba(244,239,227,0.7)'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + s * 0.05, y - s * 0.38); ctx.lineTo(x + s * 0.05, y + s * 0.12);
      ctx.arc(x - s * 0.1, y + s * 0.12, s * 0.15, 0, Math.PI * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + s * 0.05, y - s * 0.42, s * 0.06, 0, TAU); ctx.stroke();
      return;
    }
    if (id === 'worm') {
      halo(ctx, x, y, s * 0.6, '170,255,120', 0.35 + 0.1 * Math.sin(t * 2));
      const pts = [];
      for (let i = 0; i <= 20; i++) { const k = i / 20; pts.push([x - s * 0.36 + k * s * 0.72, y + Math.sin(k * Math.PI * 2.2 + t * 2) * s * 0.12]); }
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8fdc5a'; ctx.lineWidth = s * 0.16;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      ctx.strokeStyle = '#d9ffb0'; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1] - s * 0.03) : ctx.moveTo(p[0], p[1] - s * 0.03)); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,110,30,0.6)'; ctx.lineWidth = 1;
      for (let i = 3; i < 20; i += 3) { const p = pts[i]; ctx.beginPath(); ctx.moveTo(p[0], p[1] - s * 0.07); ctx.lineTo(p[0], p[1] + s * 0.07); ctx.stroke(); }
    } else if (id === 'shrimp') {
      halo(ctx, x, y, s * 0.6, '200,225,255', 0.4);
      ctx.save(); ctx.translate(x, y);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.95 - i * 0.32, R = s * 0.26;
        ctx.fillStyle = i % 2 ? '#e9f2ff' : '#c9dcf5';
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * R, Math.sin(a) * R * 0.85, s * (0.13 - i * 0.012), s * 0.1, a + Math.PI / 2, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffd2dc';
      ctx.beginPath(); ctx.moveTo(s * 0.22, s * 0.2); ctx.lineTo(s * 0.4, s * 0.12); ctx.lineTo(s * 0.36, s * 0.32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(230,240,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.05); ctx.quadraticCurveTo(-s * 0.45, -s * 0.4, -s * 0.1, -s * 0.42); ctx.stroke();
      ctx.fillStyle = '#1d2433'; ctx.beginPath(); ctx.arc(-s * 0.24, -s * 0.02, s * 0.03, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (id === 'roe') {
      halo(ctx, x, y, s * 0.65, '255,140,70', 0.45 + 0.12 * Math.sin(t * 3));
      const pos = [[0, 0], [-0.17, -0.1], [0.17, -0.1], [-0.17, 0.13], [0.17, 0.13], [0, -0.22], [0, 0.24]];
      for (const [dx, dy] of pos) {
        const px = x + dx * s, py = y + dy * s, R = s * 0.11;
        ctx.fillStyle = rg(ctx, px - R * 0.3, py - R * 0.3, 0, R, [[0, '#fff1c4'], [0.4, '#ffab4a'], [1, '#c8401c']]);
        ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fill();
      }
    }
  }

  /* ================= Market previews ================= */
  function preview(canvas, kind, id, t, dpr) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (kind === 'rods') {
      paintRod(ctx, id, { x: w * 0.05, y: h * 0.86 }, { x: w * 0.86, y: h * 0.3 }, 0.12, t, h * 4.2, t * 0.6);
    } else if (kind === 'bobbers') {
      const wl = h * 0.74;
      const g = ctx.createLinearGradient(0, wl, 0, h);
      g.addColorStop(0, 'rgba(70,130,150,0.55)'); g.addColorStop(1, 'rgba(16,44,70,0.8)');
      ctx.fillStyle = g; ctx.fillRect(0, wl, w, h - wl);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, wl, w, 1);
      const r = Math.min(w * 0.1, h * 0.17);
      bobberFX(ctx, id, w / 2, wl - r * 0.3, r, t, { inWater: true, dip: Math.sin(t * 2.2) * r * 0.12, dpr, use: 'shop', refl: 0.6 });
    } else if (kind === 'lines') {
      paintLine(ctx, id, { x: w * 0.06, y: h * 0.18 }, { x: w * 0.92, y: h * 0.52 }, h * 0.25, h * 3.4, t, { sway: Math.sin(t * 0.8) * h * 0.03 });
      bobberFX(ctx, 'classic', w * 0.92, h * 0.52 + h * 0.065 * 2.1, h * 0.065, t, { dpr, use: 'shop' });
    } else if (kind === 'bait') {
      paintBait(ctx, id, w / 2, h / 2, Math.min(w, h) * 0.9, t);
    }
  }

  return { THEMES, TIERS, TOP_LEVEL, PERK_KEY, perkText, perkShort, RODS, BOBBERS, LINES, ROD, BOB, LINE, CATALOG, SLOT, STUDIO, paintRod, paintBobber, bobberFX, paintLine, paintBait, preview,
    art: { rg, lgr, halo, starPath, twinkle, flower, mix, mixStops, shading, toner, rgbOf, STUDIO } };
})();
