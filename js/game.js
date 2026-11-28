/* Tidesong — game loop, fishing mechanics, progression, economy and interface. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const easeIn = k => k * k * k;
  const easeOutBack = k => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pearlsHTML = n => `<span class="pearl" aria-hidden="true"></span>${fmt(n)}`;

  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  /* The sky and water render on the GPU behind the 2D canvas when WebGL is available (#nogl forces 2D). */
  const waterCanvas = $('#water');
  const GLON = !/nogl/.test(location.hash) && WaterGL.init(waterCanvas);
  if (!GLON) waterCanvas.hidden = true;
  let glScale = 1, dynScale = 1, sceneGL = null;
  // ceilings the quality governor has set on the GPU scene's and the 2D canvas's resolution
  const qual = { gl: Infinity, dpr: Infinity };
  let frameNo = 0;
  let W = 0, H = 0, DPR = 1, L = null;

  /* ================= Save ================= */
  const SAVE_KEY = 'tidesong.save.v1';
  const fresh = () => ({
    v: 2, xp: 0, loc: 'mistwillow', caught: {}, total: 0, sound: true, intro: false,
    pearls: 0, net: [], netTier: 0, uid: 1, gifts: [],
    fullWarned: 0, // the aquarium room the "full" reminder was last shown at (0: not full since)
    ach: null, // badges and the scrapbook (js/badges.js fills this in)
    // the aquariums: when they were last looked after, the pearls on each tank's sand, bonds between fish,
    // mates, each fish's unfinished pearl, when each tank was fed, and which tank was last looked at
    tank: { last: 0, sands: {}, bonds: {}, mates: {}, acc: {}, fedAt: {}, at: 0, decos: [] },
    bait: { worm: 3, shrimp: 0, roe: 0 },
    owned: { rods: ['willow'], bobbers: ['classic'], lines: ['mono'] },
    equip: { rod: 'willow', bobber: 'classic', line: 'mono', bait: null },
    stats: { sold: 0, earned: 0, released: 0 },
    records: { heaviest: null, longest: null, priciest: null, rarest: null },
  });

  function load() {
    let d = null;
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) d = JSON.parse(raw); } catch (e) { /* storage unavailable */ }
    const base = fresh();
    if (!d || typeof d !== 'object') return base;
    const s = Object.assign(base, d);
    for (const k of ['bait', 'owned', 'equip', 'stats', 'records']) s[k] = Object.assign(fresh()[k], d[k] || {});
    if (!Array.isArray(s.net)) s.net = [];
    if (!Array.isArray(s.gifts)) s.gifts = [];
    if (!s.ach || typeof s.ach !== 'object') s.ach = null;
    s.tank = Object.assign(fresh().tank, d.tank || {});
    if (!s.tank.sands || typeof s.tank.sands !== 'object') s.tank.sands = {};
    if (!s.tank.fedAt || typeof s.tank.fedAt !== 'object') s.tank.fedAt = {};
    if (!s.tank.bonds || typeof s.tank.bonds !== 'object') s.tank.bonds = {};
    if (!s.tank.mates || typeof s.tank.mates !== 'object') s.tank.mates = {};
    if (!s.tank.acc || typeof s.tank.acc !== 'object') s.tank.acc = {};
    for (const k of ['rods', 'bobbers', 'lines']) if (!Array.isArray(s.owned[k])) s.owned[k] = fresh().owned[k];
    if (!d.v) {
      // A save from before the market opened: earlier catches are sold on the player's behalf.
      let gift = 0;
      for (const id in s.caught) {
        const sp = SPECIES[id];
        if (!sp) continue;
        gift += Math.round(VALUE[sp.rarity] * (sp.worth || 1) * 0.85) * (s.caught[id].n || 0);
        const tier = RARITIES[sp.rarity].tier;
        if (!s.records.rarest || tier > RARITIES[SPECIES[s.records.rarest.id].rarity].tier) s.records.rarest = { id };
        if (s.caught[id].best && (!s.records.heaviest || s.caught[id].best > s.records.heaviest.kg)) s.records.heaviest = { id, kg: s.caught[id].best };
      }
      s.pearls = gift;
      s.stats.earned = gift;
      s.marketGift = gift;
      s.v = 2;
    }
    if (!Gear.ROD[s.equip.rod] || !s.owned.rods.includes(s.equip.rod)) s.equip.rod = 'willow';
    if (!Gear.BOB[s.equip.bobber] || !s.owned.bobbers.includes(s.equip.bobber)) s.equip.bobber = 'classic';
    if (!Gear.LINE[s.equip.line] || !s.owned.lines.includes(s.equip.line)) s.equip.line = 'mono';
    if (s.equip.bait && !(s.bait[s.equip.bait] > 0)) s.equip.bait = null;
    s.netTier = clamp(s.netTier | 0, 0, TANKS.length - 1);
    s.fullWarned = Math.max(0, s.fullWarned | 0);
    // decorations: known pieces only, each in a tank that is owned (or the storeroom, -1), and never
    // more in a tank than it has room for (the extras go to the storeroom)
    {
      const seen = new Set(), room = {};
      s.tank.decos = (Array.isArray(s.tank.decos) ? s.tank.decos : []).filter(d => d && Deco.DEF[d.id] && Number.isFinite(d.uid) && !seen.has(d.uid) && seen.add(d.uid))
        .map(d => ({ uid: d.uid | 0, id: d.id, t: Number.isInteger(d.t) && d.t >= 0 && d.t <= s.netTier ? d.t : -1 }));
      for (const d of s.tank.decos) if (d.t >= 0) { room[d.t] = (room[d.t] || 0) + 1; if (room[d.t] > (Deco.CAP[TANKS[d.t].id] || 0)) d.t = -1; }
    }
    // From one tank to many: every tank bought is kept. Pearls on the old sand and the last feeding move
    // to the tank the fish were living in, and every fish is given a home tank.
    if (Array.isArray(s.tank.drops)) { if (s.tank.drops.length) s.tank.sands[s.netTier] = (s.tank.sands[s.netTier] || []).concat(s.tank.drops); delete s.tank.drops; }
    if (s.tank.fed) { s.tank.fedAt[s.netTier] = Math.max(s.tank.fedAt[s.netTier] || 0, s.tank.fed); delete s.tank.fed; }
    s.tank.at = clamp(d.tank && Number.isInteger(d.tank.at) ? d.tank.at : s.netTier, 0, s.netTier);
    homeFish(s);
    return s;
  }
  function persistRaw() {
    if (Sync.frozen) return; // a save from another device is being put in place
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    Sync.changed();
  }
  // every change to the save is a chance to have earned a badge
  function persist() { persistRaw(); Badges.poke(); }
  let save = load();

  const locById = id => LOCATIONS.find(l => l.id === id) || LOCATIONS[0];
  const lvl = () => levelFromXp(save.xp);
  const isUnlocked = loc => lvl().level >= loc.level;
  const xpToReach = level => { let s = 0; for (let i = 1; i < level; i++) s += xpForLevel(i); return s; };
  const netCap = () => tanksRoom(save.netTier);
  const activeBait = () => (save.equip.bait && save.bait[save.equip.bait] > 0 ? save.equip.bait : null);
  /* What the equipped gear does for the fight, from each piece's tier: the rod widens the band, the line
     slows the drain, the bobber speeds the fill. heir marks slots holding an Heirloom, which get a gilded reel. */
  function gearPerks() {
    const rod = Gear.ROD[save.equip.rod], line = Gear.LINE[save.equip.line], bob = Gear.BOB[save.equip.bobber];
    return {
      band: (rod && rod.perk && rod.perk.band) || 1,
      drain: (line && line.perk && line.perk.drain) || 1,
      fill: (bob && bob.perk && bob.perk.fill) || 1,
      heir: { rod: !!(rod && rod.heir), line: !!(line && line.heir), bobber: !!(bob && bob.heir) },
    };
  }
  if (!isUnlocked(locById(save.loc))) save.loc = 'mistwillow';

  /* ================= State ================= */
  const G = {
    phase: 'idle', pt: 0, t: 0, acc: 0,
    bob: { fx: 0.6, fy: 0.3, nib: 0 },
    cast: null, wait: null, hooked: null, reel: null, land: null, retrieve: null,
    entry: { x: 0, y: 0 }, facing: 1,
    ripples: [], drops: [],
    rodBend: 0.08, swing: 0, pull: 0, spin: 0,
    forced: null, rippleT: 0, baitRanOut: null,
    pend: { a: 0, v: 0 }, tipPrev: null, tipVel: { x: 0, y: 0 }, flex: 0, flexV: 0, bobDip: 0, prevFishV: 0,
  };
  const STEP = 1 / 120;
  const FSQ = 0.6; // how much the fish below is foreshortened, seen from the shore
  let FS = null; // the fish on the line (one of the shadows below; see SHOAL)
  let lit = Gear.STUDIO; // the lake's light for gear and the leaping fish

  /* ================= Interface refs ================= */
  const ui = {
    prompt: $('#prompt'), reelIn: $('#btn-reelin'), reel: $('#reel'), band: $('#band'), marker: $('#marker'),
    ringFill: $('#ring-fill'), ringNotch: $('#ring-notch'), ring: $('#reel .ring'), ringHead: $('#ring-head'), reelHint: $('#reel-hint'),
    track: $('#track'), mkTrail: $('#mk-trail'), mkAura: $('#mk-aura'),
    placeName: $('#place-name'), placeTime: $('#place-time'), lvl: $('#lvl-num'), xpFill: $('#xp-fill'), xpText: $('#xp-text'),
    sound: $('#btn-sound'), toasts: $('#toasts'), bondLive: $('#bond-live'), veil: $('#veil'), rvCanvas: $('#rv-canvas'),
    pearls: $('#pearl-count'), pearlBtn: $('#btn-pearls'), netBtn: $('#btn-net'), netCount: $('#net-count'), tankDot: $('#tank-dot'),
    baitBtn: $('#btn-bait'), baitLabel: $('#bait-label'), baitDot: $('#bait-dot'),
  };
  const RING_C = 2 * Math.PI * 50;
  ui.ringFill.style.strokeDasharray = RING_C.toFixed(2);
  ui.ringNotch.setAttribute('transform', `rotate(${REEL_ESCAPE * 360} 60 60)`);
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const CAST_TEXT = coarse ? 'Tap the water where you’d like to cast' : 'Click where you’d like to cast, or press Space';
  ui.reelHint.textContent = coarse
    ? 'Hold anywhere to push the green band right. Let go and it drifts left. Keep the gold line inside it.'
    : 'Hold the mouse button or Space to push the green band right. Let go and it drifts left. Keep the gold line inside it.';

  /* ================= Audio + wake lock ================= */
  let wakeLock = null, wakeTried = false;
  function unlockAudio() {
    if (!Sound.ready) {
      Sound.init();
      Sound.setEnabled(save.sound);
      Sound.startAmbient(save.loc);
    } else Sound.resume();
    if (!wakeTried && navigator.wakeLock) {
      wakeTried = true;
      navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
    }
  }
  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Sound.suspend(); pointers.clear(); keyHold = false; }
    else { if (Sound.ready) Sound.resume(); if (!wakeLock) wakeTried = false; }
  });
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not allowed here */ } }

  /* ================= Input ================= */
  const pointers = new Set();
  let keyHold = false;
  const holding = () => pointers.size > 0 || keyHold;
  const openModals = () => document.querySelectorAll('.modal:not([hidden]):not(.closing)');
  const modalOpen = () => openModals().length > 0;

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.add(e.pointerId);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    press({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  });
  // with a mouse, a faint ring on the water shows where a click would cast
  canvas.addEventListener('pointermove', e => { G.hover = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY, t: G.t } : null; });
  canvas.addEventListener('pointerleave', () => { G.hover = null; });
  const release = e => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { pointers.clear(); keyHold = false; });

  const HOLD_KEYS = new Set([' ', 'Spacebar', 'ArrowUp', 'ArrowRight', 'w', 'W', 'd', 'D']);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const top = modalStack[modalStack.length - 1];
      if (top && !catchPending(top)) closeModal(top, true);
      return;
    }
    if (modalOpen() || !HOLD_KEYS.has(e.key)) return;
    const onButton = e.target && e.target.closest && e.target.closest('button');
    if (onButton && G.phase === 'idle' && e.key === ' ') return; // let a focused button use Space
    e.preventDefault();
    unlockAudio();
    if (!e.repeat) press();
    keyHold = true;
  });
  window.addEventListener('keyup', e => { if (HOLD_KEYS.has(e.key)) keyHold = false; });

  function press(at) {
    if (modalOpen()) return;
    if (G.phase === 'idle') cast(at);
    // a tap while a catch is coming up hurries it into the card
    else if (G.phase === 'landing' && G.land && !G.land.shown) G.land.hurry = true;
  }

  /* ================= Geometry ================= */
  function rodTip() {
    const b = L.rodBase, t0 = L.rodTip;
    const dx = t0.x - b.x, dy = t0.y - b.y, len = Math.hypot(dx, dy);
    const ca = Math.cos(G.swing), sa = Math.sin(G.swing);
    return {
      x: b.x + dx * ca - dy * sa + G.pull * len * 0.07 + G.flex * 0.25,
      y: b.y + dx * sa + dy * ca + G.rodBend * len * 0.13 + G.flex,
    };
  }
  const bobR = () => Math.max(5, L.m * 0.012);
  function bobPos() { return { x: G.bob.fx * W, y: L.horizon + G.bob.fy * (H - L.horizon) }; }
  /* The idle bobber hangs from the rod tip on a damped pendulum (see physics()). */
  function dangle(tip) { const len = L.m * 0.075; return { x: tip.x + Math.sin(G.pend.a) * len, y: tip.y + Math.cos(G.pend.a) * len }; }

  /* Wave height at a point on the water, using the same waves the GPU water draws (roughly -1..1). */
  const WAVES = [[0.10, 0.995, 2.2, 1.20, 0.42], [0.62, 0.785, 3.6, -1.55, 0.30], [-0.71, 0.704, 5.3, 1.90, 0.22], [0.28, 0.960, 8.7, -2.60, 0.15]];
  function waveHeight(pt, t) {
    const d = clamp((pt.y - L.horizon) / (H - L.horizon), 0, 1), z = 1 / (d + 0.035);
    const px = (pt.x / W - 0.5) * (W / H) * z * 6, pz = z * 6, tt = t % 1000;
    let h = 0;
    for (const [dx, dz, f, sp, a] of WAVES) h += Math.sin((px * dx + pz * dz) * f + tt * sp) * a;
    return h;
  }

  /* Coupled rod, line and bobber motion. */
  function physics(dt) {
    if (dt <= 0) return;
    const tip = rodTip();
    if (G.tipPrev) {
      const vx = (tip.x - G.tipPrev.x) / dt;
      const ax = clamp((vx - G.tipVel.x) / dt, -30000, 30000);
      G.tipVel = { x: vx, y: (tip.y - G.tipPrev.y) / dt };
      const len = L.m * 0.075, p = G.pend;
      const acc = -(1400 / len) * Math.sin(p.a) - 2.4 * p.v - (ax * Math.cos(p.a) / len) * 0.6 + Math.sin(G.t * 0.9) * 0.35;
      p.v += acc * dt;
      p.a = clamp(p.a + p.v * dt, -1.1, 1.1);
    }
    G.tipPrev = tip;
    let drive = 0;
    if (G.phase === 'waiting' || G.phase === 'escaped') {
      const r = bobR();
      let target = waveHeight(bobPos(), G.t) * r * 0.42;
      if (G.phase === 'waiting' && G.bob.nib > 0) target += Math.sin(((0.36 - G.bob.nib) / 0.36) * Math.PI) * r * 0.75;
      drive = ((target - G.bobDip) / dt) * 9;
      G.bobDip = target;
    } else if (G.phase === 'reeling' && G.reel) {
      const fv = G.reel.fish.v;
      drive = ((fv - G.prevFishV) / dt) * 7;
      G.prevFishV = fv;
    }
    G.flexV += (-170 * G.flex - 12 * G.flexV + clamp(drive, -5000, 5000)) * dt;
    G.flex = clamp(G.flex + G.flexV * dt, -L.m * 0.03, L.m * 0.03);
  }
  function entryTarget() {
    const f = G.reel ? G.reel.fish.shown : 0.5, b = bobPos();
    const span = Math.min(W * 0.6, 620);
    const cx = clamp(b.x, span / 2 + 24, W - span / 2 - 24);
    return { x: cx - span / 2 + f * span, y: b.y + Math.sin(G.t * 3.1) * 2 };
  }
  /* Nearer water draws larger: the bobber's size at a height on screen, 1 where casts land on average. */
  function persp(y) {
    const wh = H - L.horizon, k0 = 0.55 + (L.bob.y - L.horizon) / wh;
    return clamp((0.55 + (y - L.horizon) / wh) / k0, 0.8, 1.22);
  }

  /* ================= Effects ================= */
  function ripple(x, y, n = 1, size = 1) {
    for (let i = 0; i < n; i++) G.ripples.push({ x, y, t: -i * 0.22, life: 1.6 + size * 0.4, max: L.m * 0.06 * size });
  }
  function splash(p, size = 1) {
    const n = Math.round(10 * size);
    for (let i = 0; i < n; i++) {
      G.drops.push({ x: p.x + rand(-6, 6) * size, y: p.y, vx: rand(-90, 90) * size, vy: -rand(120, 300) * Math.sqrt(size), t: 0, floor: p.y + 2, r: rand(1, 2.6) * Math.min(1.6, size) });
    }
    ripple(p.x, p.y, 2, size);
  }

  /* ================= Phases ================= */
  function setPhase(p) {
    G.phase = p; G.pt = 0;
    document.body.classList.toggle('is-busy', ['bite', 'reeling', 'landing', 'escaped'].includes(p));
    document.body.classList.toggle('is-reeling', p === 'reeling');
  }

  /* Where a cast aimed at a point on screen comes down: that spot, or the nearest water the line reaches
     (so a tap on the sky or the dock casts as far, or as near, as it can toward it). */
  const REACH = { x0: 0.1, x1: 0.96, y0: 0.06, y1: 0.72 };
  function aimPoint(x, y) {
    const wh = H - L.horizon;
    return { x: clamp(x, W * (L.portrait ? REACH.x0 : REACH.x0 + 0.02), W * REACH.x1), y: L.horizon + clamp((y - L.horizon) / wh, REACH.y0, REACH.y1) * wh };
  }

  function cast(at) {
    setPhase('casting');
    const wh = H - L.horizon, base = (L.bob.y - L.horizon) / wh;
    let tx, fy;
    if (G.aim) { tx = G.aim[0] * W; fy = G.aim[1]; G.aim = null; }
    else if (at) { const q = aimPoint(at.x, at.y); tx = q.x; fy = (q.y - L.horizon) / wh; }
    else {
      // each cast lands somewhere a little different: further out or nearer in, a little left or right
      const tri = () => Math.random() + Math.random() - 1;
      tx = clamp(L.bob.x + tri() * (L.portrait ? 0.24 : 0.2) * W, W * (L.portrait ? 0.34 : 0.28), W * 0.92);
      fy = clamp(base + tri() * 0.17, 0.17, 0.56);
    }
    const to = { x: tx, y: L.horizon + fy * wh };
    // a longer cast flies a little longer and higher
    const reach = clamp(Math.hypot(to.x - L.rodTip.x, to.y - L.rodTip.y) / (W * 0.45), 0.5, 1.6);
    // if it would come down on something floating or standing in the water, it strikes that first
    const obj = Scenes.obstacles(L, G.t + 0.3 + 0.5 * reach).find(o => ((to.x - o.x) / o.rx) ** 2 + ((to.y - o.y) / o.ry) ** 2 < 1);
    G.cast = { to, obj, launched: false, lt: 0, k: 0, from: null, dur: 0.46 + 0.17 * reach, arc: H * (0.11 + 0.05 * reach), hit: null, mark: { ...to } };
    if (obj) G.cast.to = { x: to.x, y: obj.post ? lerp(obj.top, obj.y, 0.35) : obj.top + (to.y - obj.y) * 0.3 };
    Sound.play('cast', save.equip.line);
    setPrompt('');
    ui.prompt.classList.remove('breathe');
    // The reminder that the tanks are full shows once, on the first cast after they fill. It comes back
    // only at a new ceiling: after a new tank is bought and filled, or the tanks are emptied to three
    // quarters and filled again. A player who keeps fishing at the ceiling, selling one to keep one,
    // knows already.
    const cap = netCap();
    if (save.net.length <= cap * 0.75) save.fullWarned = 0;
    else if (save.net.length >= cap && save.fullWarned !== cap) {
      save.fullWarned = cap; persist();
      toast(`Your ${save.netTier ? 'aquariums are' : 'aquarium is'} full. Sell a few fish, or buy another tank, to keep new catches.`, '#ff8c7c', 3800);
    }
  }

  function landBobber() {
    const to = G.cast.to, s = persp(to.y), soft = G.cast.hit ? 0.75 : 1;
    G.bob.fx = to.x / W;
    G.bob.fy = (to.y - L.horizon) / (H - L.horizon);
    G.bob.s = s;
    G.bob.nib = 0;
    Sound.play('plop', soft, save.equip.bobber);
    ripple(to.x, to.y, 3, 1.2 * s * soft);
    for (let i = 0; i < Math.round(6 * soft); i++) G.drops.push({ x: to.x, y: to.y, vx: rand(-60, 60) * s, vy: -rand(80, 170) * s * soft, t: 0, floor: to.y + 2, r: rand(1, 2) * s });
    setPhase('waiting');
    G.wait = { tick: 0, min: rand(1.0, 1.8), nibCool: rand(1, 2), taker: null, next: null, comeAt: 0, eager: false, spooked: 0 };
    stirShoal(to);
    setPrompt('Waiting for a bite…');
    ui.reelIn.hidden = false;
  }

  /* The bobber comes down on something in the water: a thud, the thing dips and rocks, and the bobber
     bounces, slides or drops off it into the water beside it. */
  const IMPACT = {
    ice: { hold: 0.05, dur: 0.42, arc: 0.04 }, leaf: { hold: 0.42, dur: 0.34, arc: 0.004 },
    paper: { hold: 0.12, dur: 0.36, arc: 0.025 }, wood: { hold: 0, dur: 0.34, arc: 0.012 },
  };
  function impact() {
    const C = G.cast, o = C.obj, I = IMPACT[o.kind] || IMPACT.ice, r = bobR() * persp(o.y);
    const side = Math.sign(C.to.x - o.x) || (Math.random() < 0.5 ? -1 : 1);
    const to = o.post
      ? { x: o.x + side * (o.rx + r * 1.4), y: o.y + o.ry * 0.8 }
      : { x: o.x + side * (o.rx * 1.02 + r * 1.6) + rand(-0.15, 0.15) * o.rx * 0.3, y: o.y + o.ry * rand(0.35, 0.9) };
    to.x = clamp(to.x, W * 0.06, W * 0.97);
    to.y = clamp(to.y, L.horizon + (H - L.horizon) * 0.08, H - L.m * 0.14);
    C.hit = { o, f: o.f, t: 0, hold: I.hold, dur: I.dur, arc: L.m * I.arc, at: { ...C.to }, ox: o.x, otop: o.top, from: null, to };
    Sound.play('thud', o.kind, (C.to.x / W - 0.5) * 0.8);
    Badges.note('bonk');
    Scenes.knock(o.f, G.t, o.kind === 'wood' ? 0.8 : 1);
    ripple(o.x, o.y, 2, Math.min(1.4, o.rx / (L.m * 0.05)) * 0.8);
    // what flies off it: chips of ice, beads of water off a leaf, a splinter or two of wood
    const bits = { ice: ['rgba(230,245,255,0.95)', 9, 1.2], leaf: ['rgba(225,245,255,0.85)', 6, 0.9], wood: ['rgba(150,110,70,0.9)', 4, 0.9], paper: ['rgba(255,220,170,0.7)', 3, 0.6] }[o.kind];
    if (bits) for (let i = 0; i < bits[1]; i++) G.drops.push({ x: C.to.x, y: C.to.y, vx: rand(-90, 90) * bits[2], vy: -rand(60, 170) * bits[2], t: 0, floor: o.y + o.ry, r: rand(0.8, 1.8), col: bits[0] });
  }

  /* A nibble: one of the fish circling noses in (usually the one that will bite, now and then a looker). */
  function nibble() {
    const around = SHOAL.filter(S => S.mode === 'circle' && !S.gone);
    if (!around.length) return false;
    const T = G.wait && G.wait.taker, others = around.filter(S => S !== T);
    const S = T && T.mode === 'circle' && (!others.length || Math.random() < 0.65) ? T : others[Math.floor(Math.random() * others.length)];
    S.nib = 0.36;
    G.bob.nib = 0.36;
    Sound.play('nibble');
    const p = bobPos(); ripple(p.x, p.y, 1, 0.7);
    return true;
  }

  function bite() {
    const bait = activeBait(), Wt = G.wait || {};
    // the fish rolled when the bobber landed, unless the bait was changed since (or a test asked for one)
    let next = Wt.next;
    if (!next || G.forced || next.bait !== bait) next = rollNext();
    if (bait) {
      save.bait[bait] -= 1;
      if (save.bait[bait] <= 0) { save.bait[bait] = 0; save.equip.bait = null; G.baitRanOut = bait; }
      persist();
      updateHUD();
    }
    G.hooked = { id: next.id, rarity: next.rarity, bait, fish: next.fish };
    // the fish that came to the bobber takes it; the rest scatter at the commotion
    let T = Wt.taker && SHOAL.includes(Wt.taker) && !Wt.taker.gone ? Wt.taker : null;
    if (!T) {
      const m = mouthAt();
      T = addShadow({ x: m.x, y: m.y, k: sizeK(next.fish.cm), depth: 0.6 });
      T.rad = shadowLen(T) * 0.5; T.orbit = rand(0, TAU);
    }
    FS = T;
    Object.assign(T, { mode: 'hooked', taker: false, gone: false, kT: sizeK(next.fish.cm) });
    const b = bobPos();
    for (const S of SHOAL) {
      if (S === T || S.gone) continue;
      if (LOOKING.has(S.mode) || S.mode === 'leave' || plane(S.x, S.y, b.x, b.y) < 0.3) { if (Math.random() < 0.6) flee(S, b); else leave(S); }
    }
    G.lastBite = { pt: G.pt, eager: !!Wt.eager, spooked: Wt.spooked || 0, rarity: next.rarity };
    G.biteFx = { t0: G.t, home: null, fly: null, trail: [] };
    G.staged = false;
    setPhase('bite');
    ui.reelIn.hidden = true;
    splash(bobPos(), 1);
    // The same cue for every fish: rarity shows only in how hard it fights.
    Sound.play('bite');
    buzz(40);
    G.flexV += L.m * 1.4;
    setPrompt('Fish on!');
    ui.prompt.classList.remove('alert'); void ui.prompt.offsetWidth; ui.prompt.classList.add('alert');
  }

  /* The meter flows in while the fish strikes, so it has settled by the time you take control: the ring
     spins up from its centre, the track opens out from the middle with light running along it, the band
     grows into place and the gold line drops in; the ring's fish arrives with the bite mark (.reel.enter
     in the page's styles). The ring fills up to its starting point as it comes. */
  function stageReel() {
    if (G.staged) return;
    G.staged = true;
    const D = REEL[G.hooked.rarity], P = gearPerks(), w = D.band * P.band;
    ui.reelHint.hidden = save.total >= 3;
    ui.reel.classList.toggle('perk-band', P.heir.rod);
    ui.reel.classList.toggle('perk-meter', P.heir.bobber || P.heir.line);
    clearTimeout(G.reelHideT);
    ui.reel.classList.remove('won', 'lost', 'danger', 'straining');
    ui.reel.style.setProperty('--strain', '0');
    ui.reel.classList.add('in');
    ui.ring.classList.remove('draining');
    ui.ring.style.transform = '';
    ui.ring.style.setProperty('--glow', '0.1');
    ui.ring.style.setProperty('--halo', '0');
    ui.band.style.left = `${((0.5 - w / 2) * 100).toFixed(3)}%`;
    ui.band.style.width = `${(w * 100).toFixed(3)}%`;
    ui.marker.style.left = '50%';
    resetMarker();
    setRingFill(0);
    ui.reel.hidden = false;
    G.enterAt = G.t;
    ui.reel.classList.remove('enter');
    if (!UIFX.reduced()) { void ui.reel.offsetWidth; ui.reel.classList.add('enter'); }
    Sound.play('meterIn');
  }
  // how far the ring's fill has risen toward the meter's real level as it arrives (0 to 1)
  const enterFill = () => (G.enterAt == null ? 1 : easeOut(clamp((G.t - G.enterAt - 0.1) / 0.5, 0, 1)));

  function startReel() {
    const D = REEL[G.hooked.rarity], P = gearPerks();
    stageReel();
    setPhase('reeling');
    G.reel = {
      mods: P,
      band: { x: 0.5, v: 0, w: D.band * P.band },
      fish: { p: 0.5, v: 0, target: 0.5, k: D.stiff[0], timer: 0.45, mode: 'move', ph1: rand(0, TAU), ph2: rand(0, TAU), shown: 0.5, tt: 0, anchor: 0.5 },
      progress: REEL_START, inBand: true, el: 0, splashT: 0, best: REEL_START, stall: 0, strain: 0, strainShown: 0, toldStrain: false,
    };
    G.acc = 0;
    G.entry = bobPos();
    setPrompt('');
    G.reel.fx = { s: 1, v: 0, step: -1, flash: 0, d: 0, beat: 0, t: 0 };
    updateReelUI(0);
    Sound.startReel(save.equip.rod);
  }

  function chooseMove(f, D) {
    const r = Math.random();
    if (r < D.hold) {
      f.mode = 'hold'; f.target = clamp(f.p + f.v * 0.08, 0.03, 0.97); f.k = D.stiff[1]; f.timer = rand(0.3, 0.75);
    } else if (r < D.hold + D.dart) {
      f.mode = 'dart'; f.target = f.p > 0.5 ? rand(0.03, 0.28) : rand(0.72, 0.97); f.k = D.stiff[1] * 1.4; f.timer = rand(0.4, 0.7);
    } else if (r < D.hold + D.dart + D.thrash) {
      f.mode = 'thrash'; f.anchor = f.p; f.target = f.p; f.tt = 0; f.k = D.stiff[1] * 1.6; f.timer = rand(0.5, 0.9);
    } else {
      f.mode = 'move';
      let d = rand(0.12, 0.5) * (Math.random() < 0.5 ? -1 : 1);
      if (f.p + d < 0.05 || f.p + d > 0.95) d = -d;
      f.target = clamp(f.p + d, 0.04, 0.96);
      f.k = rand(D.stiff[0], D.stiff[1]);
      f.timer = rand(D.interval[0], D.interval[1]);
    }
  }

  function stepReel(dt) {
    const R = G.reel, D = REEL[G.hooked.rarity];
    R.el += dt;
    // the player's green band: hold to accelerate right, release to drift left
    const b = R.band, half = b.w / 2;
    b.v += ((holding() ? BAND_PHYS.up : -BAND_PHYS.down) - b.v * BAND_PHYS.drag) * dt;
    b.x += b.v * dt;
    if (b.x < half) { b.x = half; b.v = b.v < -0.3 ? -b.v * BAND_PHYS.bounce : 0; }
    else if (b.x > 1 - half) { b.x = 1 - half; b.v = b.v > 0.3 ? -b.v * BAND_PHYS.bounce : 0; }
    // the fish: a damped spring chasing destinations it keeps changing
    const f = R.fish;
    f.timer -= dt;
    if (f.timer <= 0) chooseMove(f, D);
    if (f.mode === 'thrash') {
      f.tt -= dt;
      if (f.tt <= 0) { f.target = clamp(f.anchor + (f.target > f.anchor ? -1 : 1) * rand(0.05, 0.1), 0.03, 0.97); f.tt = rand(0.08, 0.14); }
    }
    const c = 2 * D.zeta * Math.sqrt(f.k);
    f.v += (f.k * (f.target - f.p) - c * f.v) * dt;
    f.p += f.v * dt;
    if (f.p < 0.02) { f.p = 0.02; f.v = Math.abs(f.v) * 0.4; }
    if (f.p > 0.98) { f.p = 0.98; f.v = -Math.abs(f.v) * 0.4; }
    f.shown = clamp(f.p + D.wiggle * (Math.sin(R.el * 7.3 + f.ph1) + Math.sin(R.el * 12.9 + f.ph2)) * 0.5, 0.01, 0.99);
    // meter
    R.inBand = Math.abs(f.shown - b.x) <= half;
    // the line tires in a stalled fight (REEL_STRAIN in data.js); a new high on the ring relaxes it
    if (R.progress > R.best + 0.01) { R.best = R.progress; R.stall = 0; } else R.stall += dt;
    R.strain = Math.max(0, Math.min(R.el - REEL_STRAIN.after, R.stall - REEL_STRAIN.stall)) / REEL_STRAIN.per;
    if (R.inBand) R.progress += D.fill * R.mods.fill * dt;
    else if (R.el > REEL_GRACE) { R.progress -= D.drain * R.mods.drain * (1 + R.strain) * dt; R.slip = true; }
    if (R.el > REEL_GRACE) R.low = Math.min(R.low ?? 1, R.progress);
  }

  function recordCatch(fish) {
    const r = save.records;
    if (!r.heaviest || fish.kg > r.heaviest.kg) r.heaviest = { id: fish.id, kg: fish.kg };
    if (!r.longest || fish.cm > r.longest.cm) r.longest = { id: fish.id, cm: fish.cm };
    if (!r.priciest || fish.value > r.priciest.value) r.priciest = { id: fish.id, value: fish.value };
    const tier = RARITIES[SPECIES[fish.id].rarity].tier;
    if (!r.rarest || tier > RARITIES[SPECIES[r.rarest.id].rarity].tier) r.rarest = { id: fish.id };
  }

  function landFish() {
    Sound.stopReel('land');
    const { id, rarity } = G.hooked;
    const R = RARITIES[rarity];
    const fish = G.hooked.fish || rollFish(id);
    const xp = Math.round(R.xp * (0.85 + 0.5 * fish.size));
    const prev = save.caught[id];
    const first = !prev;
    const bonus = first ? R.xp : 0;
    save.caught[id] = {
      n: (prev ? prev.n : 0) + 1,
      best: Math.max(fish.kg, prev ? prev.best || 0 : 0),
      len: Math.max(fish.cm, prev ? prev.len || 0 : 0),
      top: Math.max(fish.value, prev ? prev.top || 0 : 0),
      sold: prev ? prev.sold || 0 : 0,
    };
    recordCatch(fish);
    save.total += 1;
    Badges.note('land', { loc: save.loc, rarity, size: fish.size, bait: G.hooked.bait, slip: !!(G.reel && G.reel.slip), whisker: !!(G.reel && G.reel.low < REEL_ESCAPE + 0.035) });
    const before = lvl().level;
    save.xp += xp + bonus;
    const after = lvl().level;
    persist();
    const from = { ...G.entry };
    G.land = {
      ...fish, rarity, xp, bonus, first, from, shown: false, decided: null,
      heavier: !!prev && fish.kg > (prev.best || 0),
      longer: !!prev && fish.cm > (prev.len || 0),
      leveled: after > before ? after : 0,
      unlocks: LOCATIONS.filter(l => l.level > before && l.level <= after),
      ft: G.t, calm: UIFX.reduced(), // its own clock (it thrashes faster on the line); reduced motion
    };
    hideReel('won');
    setPhase('landing');
    // the heave (see "The catch" below): the rod hauls back and the line snaps taut
    Sound.play('heave', fish.size);
    G.flexV += L.m * 2.2;
    buzz(30);
  }

  function escapeFish() {
    Sound.stopReel('lost');
    Badges.note('escape');
    if (FS) FS.bolt = FS.a + rand(-0.5, 0.5);
    Sound.play('escape');
    const p = { ...G.entry };
    splash(p, 1);
    G.bob.fx = p.x / W;
    G.bob.fy = (p.y - L.horizon) / (H - L.horizon);
    hideReel('lost');
    setPhase('escaped');
    setPrompt('It got away…');
  }

  function startRetrieve() {
    if (G.phase === 'waiting') for (const S of SHOAL) if (LOOKING.has(S.mode) || S.taker) leave(S);
    G.retrieve = { from: bobPos() };
    setPhase('retrieving');
    ui.reelIn.hidden = true;
    setPrompt('');
  }

  function toIdle() {
    setPhase('idle');
    if (FS) { FS.mode = 'sink'; FS.gone = true; FS = null; }
    G.hooked = null; G.reel = null; G.land = null; G.cast = null; G.wait = null;
    G.biteFx = null; G.staged = false; G.enterAt = null;
    ui.prompt.classList.remove('alert');
    ui.reel.hidden = true;
    ui.reelIn.hidden = true;
    setPrompt(CAST_TEXT);
    ui.prompt.classList.add('breathe');
    if (G.baitRanOut) {
      toast(`That was your last ${BAITS[G.baitRanOut].name.replace(/s$/, '')}. More are at the market.`, BAITS[G.baitRanOut].color, 3600);
      G.baitRanOut = null;
    }
    updateHUD();
  }

  /* ================= The fish below =================
     Dark shapes under the surface. A few fish are always about: they rise into view, cruise and sink away
     again, and each is the size of a fish rolled with this water's usual odds (and your bait), so a big
     shadow is a big fish. When the bobber lands they notice. Dropped right on top of a fish, it scares that
     fish (and maybe a neighbour) away; dropped near fish, it draws them in to circle and look.
     Which fish will bite is still rolled with the usual odds the moment the bobber lands, so where you cast
     never changes what you catch. That fish is played by a looker of its size if one came, or by one rising
     from the deep to join them. A cast that draws lookers brings the bite a little sooner; one that scares
     fish off makes it a little later (the timings are tuned so a cast anywhere waits as long as it always
     did). Headings are on the water plane; seen from the shore its depth axis is squashed (FSQ). */
  const SHOAL = [];
  const sizeK = cm => clamp(Math.pow(cm / 45, 0.4), 0.6, 1.9); // a shadow's size: 1 for a fish of about 45 cm
  const wfrac = y => clamp((y - L.horizon) / (H - L.horizon), 0, 1);
  const depthScale = y => 0.55 + 0.6 * wfrac(y);
  const shadowLen = (S = FS) => L.m * 0.16 * depthScale(S.y) * S.k;
  // distance on the water plane, in fractions of the screen's short side as seen at that distance
  const plane = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) / FSQ) / (L.m * depthScale((ay + by) / 2));
  const MOUTH = () => L.m * 0.018; // the mouth sits a little under (so lower on screen than) where the line enters
  function shadowHead() { const len = shadowLen() * 0.45; return { x: FS.x + Math.cos(FS.a) * len, y: FS.y + Math.sin(FS.a) * len * FSQ }; }
  const SWIM = { x0: 0.04, x1: 0.98, y0: 0.08, y1: 0.74 }; // where fish swim: fractions of the width, and of the water from the horizon down
  const swimmable = (x, y) => x > W * SWIM.x0 && x < W * SWIM.x1 && wfrac(y) > SWIM.y0 && wfrac(y) < SWIM.y1;
  const randomSpot = () => ({ x: W * rand(SWIM.x0 + 0.04, SWIM.x1 - 0.04), y: L.horizon + (H - L.horizon) * rand(SWIM.y0 + 0.04, SWIM.y1 - 0.06) });
  const shoalSize = () => (L.portrait ? 3 : 4);
  const mouthAt = () => { const b = bobPos(); return { x: b.x, y: b.y + bobR() * 0.3 + MOUTH() }; };
  const CALM = new Set(['idle', 'casting', 'waiting', 'retrieving']);
  const LOOKING = new Set(['notice', 'approach', 'circle']);

  /* Some fish that might be down there: only its size is ever shown. */
  function phantomCm() {
    const loc = locById(save.loc), r = weightedPick(baitedWeights(loc, activeBait()));
    return rollFish(weightedPick(loc.fish[r])).cm;
  }
  /* The fish that will bite this cast, rolled exactly as a bite always has been. */
  function rollNext() {
    const loc = locById(save.loc), bait = activeBait();
    let id, rarity;
    if (G.forced) { id = G.forced; rarity = SPECIES[id].rarity; G.forced = null; }
    else { rarity = weightedPick(baitedWeights(loc, bait)); id = weightedPick(loc.fish[rarity]); }
    return { id, rarity, bait, fish: rollFish(id) };
  }

  function addShadow(o = {}) {
    const S = Object.assign({
      x: 0, y: 0, a: rand(0, TAU), alpha: 0, depth: 1, phase: rand(0, TAU), swing: 0.3, beat: 1.2,
      k: 1, kT: 1, mode: 'roam', t: 0, life: rand(14, 32), gx: 0, gy: 0, spd: rand(0.028, 0.05),
      look: rand(0.19, 0.26), orbit: 0, rad: 0, dir: 1, ring: 0.075, circ: 0.36, nib: 0, cool: 0, bore: 6, bolt: 0,
      taker: false, gone: false,
    }, o);
    if (o.k === undefined) S.k = S.kT = sizeK(phantomCm());
    SHOAL.push(S);
    return S;
  }
  /* Meander: somewhere not far from where the fish is now. */
  function roamGoal(S) {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU), d = rand(0.1, 0.35) * L.m * depthScale(S.y);
      const x = S.x + Math.cos(a) * d, y = S.y + Math.sin(a) * d * FSQ;
      if (swimmable(x, y)) { S.gx = x; S.gy = y; return; }
    }
    const p = randomSpot(); S.gx = p.x; S.gy = p.y;
  }
  /* A fish rises into view somewhere in open water (away from a bobber that's fishing). */
  function spawnRoamer(fadeIn = true) {
    let p = randomSpot();
    if (G.phase === 'waiting') { const b = bobPos(); for (let i = 0; i < 6 && plane(p.x, p.y, b.x, b.y) < 0.3; i++) p = randomSpot(); }
    const S = addShadow({ x: p.x, y: p.y });
    roamGoal(S);
    if (!fadeIn) { S.alpha = S.look * rand(0.4, 1); S.depth = 0.85; S.life = rand(4, 30); }
    return S;
  }
  function resetShoal() {
    SHOAL.length = 0; FS = null; G.spawnT = rand(0.5, 1.5);
    for (let i = 0; i < shoalSize(); i++) spawnRoamer(false);
  }
  /* Turn toward a point on the water and swim on (speed in fractions of the short side a second, on the
     water plane); returns how far is left to go. */
  function swim(S, gx, gy, spd, dt, turn) {
    const ds = depthScale(S.y), dx = gx - S.x, dy = (gy - S.y) / FSQ;
    const da = ((Math.atan2(dy, dx) - S.a) % TAU + TAU * 1.5) % TAU - Math.PI;
    S.a += clamp(da, -turn * dt, turn * dt);
    const v = spd * L.m * ds;
    S.x += Math.cos(S.a) * v * dt; S.y += Math.sin(S.a) * v * dt * FSQ;
    S.beat = clamp(1 + spd * 22, 1, 9);
    return Math.hypot(dx, dy) / (L.m * ds);
  }
  /* The fish turns to look at the bobber, then swims over to it. */
  function notice(S, delay, dur) {
    Object.assign(S, { mode: 'notice', t: 0, wait: delay, dur, dir: Math.random() < 0.5 ? 1 : -1, ring: rand(0.1, 0.135), circ: rand(0.2, 0.3), bore: rand(3, 8) });
  }
  function approach(S) {
    const m = mouthAt();
    S.mode = 'approach'; S.t = 0;
    S.spd = clamp(plane(S.x, S.y, m.x, m.y) / S.dur, 0.06, 0.45);
  }
  function makeTaker(S, next) {
    const Wt = G.wait;
    S.taker = true; S.kT = sizeK(next.fish.cm); S.ring = 0.075; S.circ = 0.36; S.look = 0.3;
    if (Wt) Wt.taker = S;
  }
  /* Off it goes: away from a point, fast, and down out of sight. */
  function flee(S, p) {
    const a = Math.atan2((S.y - p.y) / FSQ, S.x - p.x) + rand(-0.5, 0.5), d = L.m * 0.5;
    Object.assign(S, { mode: 'flee', t: 0, gone: true, taker: false, gx: S.x + Math.cos(a) * d, gy: S.y + Math.sin(a) * d * FSQ });
  }
  /* It loses interest and wanders off. */
  function leave(S) {
    const b = bobPos(), a = Math.atan2((S.y - b.y) / FSQ, S.x - b.x) + rand(-0.6, 0.6), d = L.m * depthScale(S.y) * rand(0.25, 0.4);
    Object.assign(S, { mode: 'leave', t: 0, taker: false, spd: rand(0.06, 0.09), gx: clamp(S.x + Math.cos(a) * d, W * SWIM.x0, W * SWIM.x1), gy: clamp(S.y + Math.sin(a) * d * FSQ, L.horizon + (H - L.horizon) * SWIM.y0, L.horizon + (H - L.horizon) * SWIM.y1) });
  }
  const lookers = () => SHOAL.filter(S => LOOKING.has(S.mode) && !S.taker).length;

  /* The bobber lands: fish right under it bolt, fish near it come to look, and the fish that will bite is
     rolled and cast (a looker its size, or one still to come up from the deep). */
  function stirShoal(p) {
    const Wt = G.wait;
    let spooked = 0;
    const curious = [];
    for (const S of SHOAL) {
      if (S === FS || S.gone) continue;
      const d = plane(S.x, S.y, p.x, p.y);
      if (d < 0.045 + 0.035 * S.k) { flee(S, p); spooked++; }
      else if (d < 0.34 && Math.random() < 0.8) curious.push([S, d]);
    }
    if (spooked) for (let i = curious.length - 1; i >= 0; i--) if (curious[i][1] < 0.16 && Math.random() < 0.5) { flee(curious[i][0], p); curious.splice(i, 1); }
    for (const [S, d] of curious) notice(S, rand(0.2, 0.6), 0.7 + 1.6 * d);
    const next = Wt.next = rollNext(), kN = sizeK(next.fish.cm);
    let best = null, bd = 9;
    for (const [S, d] of curious) if (Math.abs(Math.log(S.k / kN)) < 0.28 && d < bd) { best = S; bd = d; }
    Wt.eager = curious.length > 0 && !spooked;
    Wt.spooked = spooked;
    Wt.min = Wt.eager ? rand(0.8, 1.4) : rand(1.0, 1.8);
    if (best) makeTaker(best, next);
    else Wt.comeAt = (Wt.eager ? rand(0.2, 0.5) : rand(0.35, 0.7)) + (spooked ? rand(1.9, 2.3) : 0);
  }
  /* No looker was the right fish: it comes up from the deep a little way off and swims to the bobber. */
  function newcomer() {
    const Wt = G.wait, b = mouthAt();
    let x = b.x, y = b.y;
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), d = rand(0.15, 0.22) * L.m * depthScale(b.y);
      x = b.x + Math.cos(a) * d; y = b.y + Math.sin(a) * d * FSQ;
      if (swimmable(x, y)) break;
    }
    const k = sizeK(Wt.next.fish.cm);
    const S = addShadow({ x, y, k, kT: k, depth: 1, a: Math.atan2((b.y - y) / FSQ, b.x - x) });
    S.dur = Wt.eager ? rand(0.7, 1.1) : rand(0.85, 1.25);
    makeTaker(S, Wt.next);
    approach(S);
  }

  /* Each frame: keep a few fish about, and move each one. */
  function updateShoal(dt) {
    if (!L) return;
    if (CALM.has(G.phase)) {
      const about = SHOAL.filter(S => S !== FS && !S.gone).length;
      G.spawnT -= dt;
      if (about < shoalSize() && G.spawnT <= 0) { spawnRoamer(); G.spawnT = rand(1.5, 5); }
    }
    for (const S of SHOAL) stepShadow(S, dt);
    for (let i = SHOAL.length - 1; i >= 0; i--) {
      const S = SHOAL[i];
      if (S.gone && S.alpha < 0.008 && S !== FS) SHOAL.splice(i, 1);
    }
  }
  function stepShadow(S, dt) {
    S.t += dt;
    if (S.nib > 0) S.nib = Math.max(0, S.nib - dt);
    if (S.cool > 0) S.cool -= dt;
    S.k += (S.kT - S.k) * (1 - Math.exp(-dt * 1.2));
    let alphaT = S.look, depthT = 0.85, swingT = 0.3, fade = 0.9, chase = null;
    switch (S.mode) {
      case 'roam': {
        S.life -= dt;
        if (swim(S, S.gx, S.gy, S.spd, dt, 1.1) < 0.05 || S.t > 14) { S.t = 0; roamGoal(S); }
        if (S.life <= 0) { S.mode = 'sink'; S.gone = true; }
        // a fish passing near a bobber that has sat a while may come and look
        if (G.phase === 'waiting' && S.cool <= 0 && lookers() < 3 && Math.random() < dt * 0.07) {
          const m = mouthAt(), d = plane(S.x, S.y, m.x, m.y);
          if (d < 0.45) { notice(S, rand(0.3, 0.8), 1.2 + 2 * d); S.cool = 5; }
        }
        break;
      }
      case 'notice': {
        const m = mouthAt();
        swim(S, m.x, m.y, 0.012, dt, 3);
        alphaT = S.look * 1.12;
        if (S.t >= S.wait) approach(S);
        break;
      }
      case 'approach': {
        const m = mouthAt(), d = swim(S, m.x, m.y, S.spd, dt, 3.4);
        alphaT = S.taker ? 0.3 : S.look * 1.15; depthT = 0.72; fade = S.taker ? 1.8 : 1.2;
        if (d < S.ring * 1.6 / depthScale(m.y) || S.t > 4) {
          S.mode = 'circle'; S.t = 0;
          S.orbit = Math.atan2((S.y - m.y) / FSQ, S.x - m.x);
          S.rad = Math.hypot(S.x - m.x, (S.y - m.y) / FSQ);
        }
        break;
      }
      case 'circle': {
        chase = circling(S, dt, S.nib > 0);
        alphaT = S.nib > 0 ? 0.42 : S.taker ? 0.3 : S.look * 1.15;
        depthT = S.nib > 0 ? 0.45 : 0.8; swingT = S.nib > 0 ? 0.6 : 0.3; S.beat = S.nib > 0 ? 3 : 1.2;
        if (!S.taker && S.t > S.bore) leave(S);
        break;
      }
      case 'leave':
        if (swim(S, S.gx, S.gy, S.spd, dt, 2.2) < 0.04 || S.t > 4) { S.mode = 'roam'; S.t = 0; S.cool = rand(6, 12); S.spd = rand(0.028, 0.05); roamGoal(S); }
        break;
      case 'flee':
        swim(S, S.gx, S.gy, 0.55, dt, 7);
        alphaT = 0; depthT = 1; swingT = 0.9; fade = 1.8;
        break;
      case 'sink':
        swim(S, S.gx, S.gy, S.spd, dt, 1.1);
        alphaT = 0; depthT = 1; fade = 0.6;
        break;
      case 'hooked': {
        const H2 = hookedTarget(S, dt);
        chase = H2; alphaT = H2.alpha; depthT = H2.depth; swingT = H2.swing; S.beat = H2.beat; fade = H2.fade;
        break;
      }
    }
    if (chase) {
      const k = 1 - Math.exp(-dt * chase.follow);
      S.x += (chase.tx - S.x) * k; S.y += (chase.ty - S.y) * k;
      const da = ((chase.ta - S.a) % TAU + TAU * 1.5) % TAU - Math.PI;
      S.a += da * (1 - Math.exp(-dt * (chase.turn || 4)));
    }
    S.alpha += (alphaT - S.alpha) * (1 - Math.exp(-dt * fade));
    S.depth += (depthT - S.depth) * (1 - Math.exp(-dt * 3));
    S.swing += (swingT - S.swing) * (1 - Math.exp(-dt * 4));
    S.phase = (S.phase + dt * S.beat * TAU * 0.5) % (TAU * 100);
  }
  /* Circling the bobber: lookers keep a wider ring; the fish that bites circles close, and noses in on a
     nibble or the bite. */
  function circling(S, dt, close) {
    const m = mouthAt(), len = shadowLen(S);
    const radT = close ? len * 0.5 : S.ring * L.m * (1 + 0.2 * Math.sin(G.t * 0.4 + S.phase * 0.01));
    S.rad += (radT - S.rad) * (1 - Math.exp(-dt * (close ? 7 : 0.8)));
    S.orbit += dt * (close ? 0.08 : S.circ) * S.dir;
    return { tx: m.x + Math.cos(S.orbit) * S.rad, ty: m.y + Math.sin(S.orbit) * S.rad * FSQ, ta: S.orbit + (close ? Math.PI : (Math.PI / 2) * S.dir), follow: 4 };
  }
  /* The fish on the line: it strikes, swims with the fight, and bolts if it escapes. */
  function hookedTarget(S, dt) {
    const p = G.phase, len = shadowLen(S);
    if (p === 'bite') return Object.assign(circling(S, dt, true), { alpha: 0.62, depth: 0.22, swing: 0.9, beat: 6, fade: 2 });
    if (p === 'reeling' && G.reel) {
      const v = G.reel.fish.v;
      const ta = (G.facing > 0 ? 0 : Math.PI) + Math.sin(G.t * 1.3) * 0.25 + clamp(v, -1, 1) * 0.15 * G.facing;
      return { tx: G.entry.x - Math.cos(S.a) * len * 0.45, ty: G.entry.y + MOUTH() - Math.sin(S.a) * len * 0.45 * FSQ, ta, follow: 12, turn: 5,
        alpha: 0.68, depth: 0.3, swing: 0.35 + 0.5 * Math.min(1, Math.abs(v)), beat: 3 + 9 * Math.min(1, Math.abs(v)), fade: 2 };
    }
    if (p === 'escaped' && G.pt < 1.2) {
      const sp = L.m * 0.55 * dt;
      return { tx: S.x + Math.cos(S.a) * sp, ty: S.y + Math.sin(S.a) * sp * FSQ, ta: S.bolt, follow: 60, alpha: 0, depth: 1, swing: 0.9, beat: 7, fade: 1.8 };
    }
    return { tx: S.x, ty: S.y, ta: S.a, follow: 4, alpha: 0, depth: 0.85, swing: 0.3, beat: 1.2, fade: p === 'landing' ? 9 : 2 };
  }
  function fishUniforms() {
    const vis = SHOAL.filter(S => S.alpha > 0.005).sort((a, b) => (b === FS) - (a === FS) || b.alpha - a.alpha).slice(0, WaterGL.MAX_FISH || 6);
    return { fish: vis.map(S => [S.x / W, S.y / H, shadowLen(S) / H, S.a]), fishB: vis.map(S => [S.alpha, S.phase, S.depth, S.swing]) };
  }

  /* ================= Update ================= */
  function update(dt) {
    Scenes.update(dt, L, G.t);
    for (const r of G.ripples) r.t += dt;
    G.ripples = G.ripples.filter(r => r.t < r.life);
    for (const d of G.drops) { d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.t += dt; }
    G.drops = G.drops.filter(d => !(d.vy > 0 && d.y > d.floor) && d.t < 2.5);

    if (!modalOpen() || G.phase === 'landing') updatePhase(dt);
    nudges(dt);
    bondNews(dt);
    // the meter's entrance is over a second after it began
    if (G.enterAt != null && G.t - G.enterAt > 1.05 && ui.reel.classList.contains('enter')) ui.reel.classList.remove('enter');
    animateRod(dt);
    physics(dt);
    updateShoal(dt);
    Flourish.update(dt, L, G.t);
  }

  /* ================= Bond news =================
     When fish in your tanks become friends, best friends or mates while you are not watching them
     (while you fish, or while the game was closed), a little + with a heart (mates) or with two fish
     (friends; best friends with a twinkle) floats up beside the Aquarium button at the next calm moment
     (no fish on the line, no menu open), one after another, with a soft chime from that side. New mates
     also leave the button glowing pink until you visit them (see updateHUD). */
  let bondT = 0, bondBusy = 0;
  function bondNews(dt) {
    if ((bondT -= dt) > 0) return;
    bondT = 0.5;
    if (G.t < 1.8 || G.t < bondBusy || modalOpen() || Tank.isOpen || !NUDGE_CALM.includes(G.phase)) return;
    const n = Tank.takeNews();
    if (!n) return;
    const list = [['mates', n.mates], ['best', n.best], ['friends', n.friends]].filter(([, c]) => c > 0);
    // one after another, each in its own place along a short row, like bubbles rising side by side
    list.forEach(([kind, c], i) => setTimeout(() => bondFloat(kind, c, i), i * 900));
    bondBusy = G.t + list.length * 0.9 + 2;
  }
  const BOND_SAY = {
    mates: n => n > 1 ? `${n} pairs of your fish became mates` : 'Two of your fish became mates',
    best: n => n > 1 ? `${n} pairs of your fish became best friends` : 'Two of your fish became best friends',
    friends: n => n > 1 ? `${n} pairs of your fish became friends` : 'Two of your fish became friends',
  };
  function bondFloat(kind, n, slot = 0) {
    const btn = ui.netBtn, r = btn.getBoundingClientRect();
    if (!r.width || modalOpen()) return;
    const el = document.createElement('div');
    el.className = `bond-pop ${kind}`;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', BOND_SAY[kind](n));
    el.innerHTML = `<b>+${n > 1 ? n : ''}</b>${kind === 'mates' ? Tank.icons.heart : Tank.icons.friends}`;
    document.body.appendChild(el);
    el.style.left = `${Math.round(Math.min(window.innerWidth - el.offsetWidth - 8, r.right + 8 + slot * (el.offsetWidth + 10)))}px`;
    el.style.top = `${Math.round(r.top + r.height / 2 - el.offsetHeight / 2)}px`;
    setTimeout(() => el.remove(), 2800);
    ui.bondLive.textContent = BOND_SAY[kind](n) + '.';
    Sound.play('bond', kind);
    if (kind === 'mates') bump(btn);
  }

  /* ================= Nudges =================
     A notification left waiting (new badges in the scrapbook, new mates, a full sand or pearls in the
     aquarium, new waters on the map) glows softly behind its button, breathing slowly. Now and then it
     also nudges: the button hops and wiggles, its glow flares and a ring of its colour spreads out, with
     a soft sound from that corner, so the eye goes there. Only at calm moments (no fish on the line, no
     menu open): the first nudge comes about half a minute after the notification appears (a minute for
     a few pearls), never two within 75 seconds, and each notification then waits twice as long before
     its next (up to five minutes). Time counts only while playing; a notification that is answered and
     comes back starts again. */
  function glow(btn, kind) {
    if (!btn) return;
    btn.classList.toggle('notify', !!kind);
    if (kind) btn.dataset.glow = kind; else delete btn.dataset.glow;
  }
  const NUDGES = {
    place: { btn: '#btn-place', on: () => $('#btn-place').classList.contains('pulse'), sig: () => 'new', first: () => 20 },
    book: { btn: '#btn-book', on: () => !$('#book-dot').hidden, sig: () => 'new', first: () => 25 },
    tank: {
      btn: '#btn-net', on: () => !ui.tankDot.hidden,
      sig: () => ui.tankDot.classList.contains('heart') ? 'mates' : ui.tankDot.classList.contains('full') ? 'full' : 'pearls',
      // new mates and a full sand matter sooner than a few pearls lying about
      first: sig => sig === 'pearls' ? 60 : 25,
    },
  };
  const NUDGE_GAP = 75, NUDGE_MAX = 300, NUDGE_CALM = ['idle', 'waiting', 'retrieving', 'escaped'];
  let playT = 0, nudgeAt = -1e9, nudgeTick = 0;
  function nudges(dt) {
    if (modalOpen() || document.hidden) return;
    playT += dt;
    if ((nudgeTick -= dt) > 0) return;
    nudgeTick = 0.5;
    let due = null;
    for (const [kind, N] of Object.entries(NUDGES)) {
      const st = N.st || (N.st = { sig: null, since: 0, wait: 0 });
      const sig = N.on() ? N.sig() : null;
      // a new notification (or one that has grown more pressing: pearls to a full sand or mates) starts
      // its count; one that only changes its count keeps its place
      if (sig !== st.sig) { const fresh = !st.sig || N.first(sig) < N.first(st.sig); st.sig = sig; if (fresh || !sig) { st.since = playT; st.wait = sig ? N.first(sig) : 0; } }
      if (sig && playT - st.since >= st.wait && (!due || st.wait < due.st.wait)) due = { kind, N, st };
    }
    if (!due || !NUDGE_CALM.includes(G.phase) || playT - nudgeAt < NUDGE_GAP) return;
    nudgeAt = playT;
    due.st.since = playT;
    due.st.wait = Math.min(NUDGE_MAX, due.st.wait * 2);
    const b = $(due.N.btn);
    b.classList.remove('nudge');
    void b.offsetWidth;
    b.classList.add('nudge');
    clearTimeout(b._nudgeT);
    b._nudgeT = setTimeout(() => b.classList.remove('nudge'), 1400);
    Sound.play('nudge', due.kind);
  }

  function updatePhase(dt) {
    switch (G.phase) {
      case 'casting': {
        const C = G.cast;
        if (!C.launched && G.pt >= 0.3) { C.launched = true; C.from = rodTip(); }
        if (C.launched && !C.hit) {
          C.lt += dt;
          C.k = clamp(C.lt / C.dur, 0, 1);
          if (C.k >= 1) { if (C.obj) impact(); else landBobber(); }
        } else if (C.hit) {
          const B = C.hit;
          B.t += dt;
          if (B.t >= B.hold && !B.from) B.from = hitPos();
          if (B.t >= B.hold + B.dur) { C.to = B.to; landBobber(); }
        }
        G.spin += dt * 20;
        break;
      }
      case 'waiting': {
        const Wt = G.wait, loc = locById(save.loc), bait = activeBait();
        if (G.bob.nib > 0) G.bob.nib = Math.max(0, G.bob.nib - dt);
        G.rippleT -= dt;
        if (G.rippleT <= 0) { const p = bobPos(); ripple(p.x, p.y, 1, 0.55); G.rippleT = rand(1.4, 2.4); }
        // the fish that will bite comes up from the deep if none of the lookers was it
        if ((!Wt.taker || Wt.taker.gone || !SHOAL.includes(Wt.taker)) && G.pt >= Wt.comeAt && Wt.next) { Wt.taker = null; newcomer(); }
        Wt.tick += dt;
        while (Wt.tick >= 0.1 && G.phase === 'waiting') {
          Wt.tick -= 0.1;
          // rolling chance of a bite that grows the longer the line sits, once that fish is circling; bait
          // brings bites sooner, and so does a cast that drew fish over to look
          if (G.pt > Wt.min && Wt.taker && Wt.taker.mode === 'circle') {
            const chance = (0.008 + 0.006 * (G.pt - Wt.min)) * loc.bite * (bait ? BAITS[bait].bite : 1) * (Wt.eager ? 1.15 : 1);
            if (Math.random() < chance) { bite(); break; }
          }
          Wt.nibCool -= 0.1;
          if (G.pt > 0.8 && Wt.nibCool <= 0 && Math.random() < 0.035 && nibble()) Wt.nibCool = rand(1.2, 2.6);
        }
        break;
      }
      case 'bite':
        if (G.pt >= 0.3) stageReel();
        if (G.staged) setRingFill(REEL_START * enterFill());
        if (G.pt >= 0.7) startReel();
        break;
      case 'reeling': {
        const R = G.reel;
        G.acc += dt;
        while (G.acc >= STEP) { stepReel(STEP); G.acc -= STEP; }
        const tgt = entryTarget();
        const k = 1 - Math.exp(-dt * 9);
        G.entry.x += (tgt.x - G.entry.x) * k;
        G.entry.y += (tgt.y - G.entry.y) * k;
        if (Math.abs(R.fish.v) > 0.12) G.facing = R.fish.v > 0 ? 1 : -1;
        R.splashT -= dt;
        if (R.splashT <= 0 && Math.abs(R.fish.v) > 0.45) {
          for (let i = 0; i < 5; i++) G.drops.push({ x: G.entry.x, y: G.entry.y, vx: rand(-70, 70), vy: -rand(70, 170), t: 0, floor: G.entry.y + 2, r: rand(1, 2) });
          ripple(G.entry.x, G.entry.y, 1, 0.7);
          R.splashT = rand(0.25, 0.5);
        }
        if (holding()) G.spin += dt * 16;
        lineStrain(R, dt);
        Sound.updateReel(dt, {
          tire: R.strainShown,
          inBand: R.inBand, progress: R.progress, holding: holding(),
          danger: clamp(1 - (R.progress - REEL_ESCAPE) / 0.18, 0, 1),
          speed: clamp(Math.abs(R.fish.v), 0, 1), fishPos: R.fish.shown,
        });
        updateReelUI(dt);
        if (R.progress >= 1) landFish();
        else if (R.progress < REEL_ESCAPE && R.el > REEL_GRACE) escapeFish();
        break;
      }
      case 'landing': stepHoist(dt); break;
      case 'escaped':
        if (G.pt >= 1.3) startRetrieve();
        break;
      case 'retrieving':
        G.spin += dt * 22;
        if (G.pt >= 0.45) toIdle();
        break;
    }
  }

  /* Where the bobber is while it rests on, or tumbles off, whatever it struck. */
  function hitPos() {
    const B = G.cast.hit;
    if (!B.from) {
      const o = Scenes.obstacles(L, G.t).find(q => q.f === B.f) || B.o;
      return { x: B.at.x + (o.x - B.ox), y: B.at.y + (o.top - B.otop) };
    }
    const k = clamp((B.t - B.hold) / B.dur, 0, 1);
    return { x: lerp(B.from.x, B.to.x, easeOut(k)), y: lerp(B.from.y, B.to.y, k * k) - Math.sin(k * Math.PI) * B.arc };
  }

  function castSwing(t) {
    if (t < 0.22) return -0.34 * easeOut(t / 0.22);
    if (t < 0.36) return lerp(-0.34, 0.12, easeIn((t - 0.22) / 0.14));
    if (t < 0.8) return lerp(0.12, 0, easeOut((t - 0.36) / 0.44));
    return 0;
  }

  function animateRod(dt) {
    let bend = 0.07 + Math.sin(G.t * 0.9) * 0.01, swing = Math.sin(G.t * 0.7) * 0.012, pull = 0, rate = 7;
    switch (G.phase) {
      case 'casting': swing = castSwing(G.pt); bend = 0.12; rate = 30; break;
      case 'waiting': bend = 0.1 + (G.bob.nib > 0 ? 0.05 : 0); break;
      case 'bite': bend = 0.42 + Math.sin(G.pt * 40) * 0.05; rate = 20; break;
      case 'reeling': {
        const R = G.reel;
        bend = 0.3 + (R.inBand ? 0.04 : 0.16) + Math.abs(R.fish.v) * 0.12 + Math.sin(G.t * 31) * 0.01;
        pull = clamp((G.entry.x - L.rodTip.x) / (W * 0.6), -1, 1);
        swing = -0.02; rate = 12;
        break;
      }
      case 'landing': {
        // hauling back on the fish, holding its weight up, then springing back once it leaves the line
        const Ld = G.land, t = G.pt, wt = 0.85 + 0.3 * (Ld.size ?? 0.4) + 0.05 * RARITIES[Ld.rarity].tier, back = L.portrait ? -0.13 : -0.2;
        if (Ld.loose) rate = 9;
        else if (Ld.calm) { bend = 0.32; swing = back * 0.5; rate = 8; }
        else if (t < HOIST.burst || !Ld.sim) { bend = 0.62 * wt + Math.sin(G.t * 41) * 0.03; swing = back * 0.8; rate = 16; }
        else {
          // the rod bends as hard as the line pulls: most while it is reeled up and at the bottom of each swing
          // hauled back while it is swung in, then eased forward so it hangs out in front, clear of the rod
          const S = Ld.sim, reeling = S.tau < HC.reel;
          bend = clamp((0.14 + 0.24 * S.load) * wt, 0.2, 0.85); swing = back * (reeling ? 1.1 : 0.25); rate = reeling ? 14 : 5;
        }
        break;
      }
    }
    const k = 1 - Math.exp(-dt * rate);
    G.rodBend += (bend - G.rodBend) * k;
    G.swing += (swing - G.swing) * k;
    G.pull += (pull - G.pull) * k;
  }

  /* ================= Render ================= */
  function render() {
    lit = Scenes.lighting();
    const gpu = sceneMode();
    if (gpu) {
      frameNo++;
      const dyn = !Scenes.lite || frameNo % 2 === 0 ? Scenes.renderDyn(L, G.t, dynScale) : null;
      WaterGL.render({ t: G.t, dyn, ripples: rippleUniforms(), bob: bobUniform(), ...fishUniforms() });
      ctx.clearRect(0, 0, W, H);
      Scenes.drawSurface(ctx, L, G.t);
    } else {
      Scenes.drawBack(ctx, L, G.t);
      for (const S of SHOAL) drawShadow(S);
      drawRipples();
    }
    Flourish.draw(ctx, 'water', L, G.t);
    drawAim();
    const landing = G.phase === 'landing';
    if (landing) G.land.pose = hoistPose();
    drawLine(gpu);
    drawDrops();
    if (landing) drawHoistWater();
    Scenes.drawFront(ctx, L, G.t);
    // out of the water the fish is near, in front of the shore; the rod in the hands is nearer still
    if (landing) drawHoistAir();
    Gear.paintRod(ctx, save.equip.rod, L.rodBase, rodTip(), G.rodBend, G.t, L.m, G.spin, { light: lit, line: save.equip.line });
    Scenes.drawAir(ctx, L, G.t);
    Flourish.draw(ctx, 'front', L, G.t);
    if (G.biteFx) drawBiteMark();
  }

  /* Ripples and the bobber, in the GPU water's units. */
  function rippleUniforms() {
    const out = [];
    for (let i = G.ripples.length - 1; i >= 0 && out.length < 10; i--) {
      const r = G.ripples[i];
      if (r.t < 0) continue;
      out.push([r.x / W, r.y / H, Math.min(1, r.t / r.life), r.max / H]);
    }
    return out;
  }
  function bobUniform() {
    if (G.phase === 'waiting' || G.phase === 'escaped') { const p = bobPos(), r = bobR() * (G.bob.s || 1); return [p.x / W, (p.y + r * 0.3) / H, 1, (r * 1.5) / H]; }
    if (G.phase === 'reeling') return [G.entry.x / W, G.entry.y / H, 1, (bobR() * 1.2) / H];
    return [0, 0, 0, 0];
  }

  function drawRipples() {
    ctx.lineWidth = 1.3;
    for (const r of G.ripples) {
      if (r.t < 0) continue;
      const k = r.t / r.life;
      const rad = r.max * easeOut(k);
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * (1 - k)})`;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.3, 0, 0, TAU); ctx.stroke();
    }
  }

  function drawDrops() {
    ctx.fillStyle = 'rgba(235,248,255,0.85)';
    for (const d of G.drops) { if (d.col) ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); if (d.col) ctx.fillStyle = 'rgba(235,248,255,0.85)'; }
  }

  /* A fish below, in the 2D fallback (the GPU water draws them itself, under the surface). */
  function drawShadow(F) {
    if (F.alpha < 0.01) return;
    const len = shadowLen(F);
    ctx.save();
    ctx.translate(F.x, F.y); ctx.scale(1, FSQ); ctx.rotate(F.a);
    const wag = Math.sin(F.phase) * F.swing * len * 0.08;
    for (const [k, am] of [[1.2, 0.3], [1, 0.6]]) {
      ctx.fillStyle = `rgba(3,12,22,${F.alpha * am * 0.75})`;
      ctx.beginPath(); ctx.ellipse(len * 0.04, 0, len * 0.37 * k, len * 0.13 * k, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-len * 0.28, 0); ctx.lineTo(-len * 0.52, -len * 0.14 * k + wag); ctx.lineTo(-len * 0.46, wag * 0.5); ctx.lineTo(-len * 0.52, len * 0.14 * k + wag); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* Where a cast will land: with a mouse, a faint ring on the water under the pointer while you choose;
     once cast, a ring the bobber falls into. */
  function drawAim() {
    let p = null, k = 0, a = 0;
    if (G.phase === 'idle' && G.hover && !modalOpen()) { p = aimPoint(G.hover.x, G.hover.y); a = 0.62; }
    else if (G.phase === 'casting' && G.cast && G.cast.mark && !G.cast.hit) { p = G.cast.mark; k = G.cast.launched ? G.cast.k : 0; a = 0.7 * (1 - k * k); }
    if (!p || a < 0.02) return;
    const r = bobR() * persp(p.y) * (2.5 - 1.1 * k), ry = r * 0.32;
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.setLineDash([r * 0.5, r * 0.32]);
    ctx.lineDashOffset = -G.t * r * 0.5;
    ctx.strokeStyle = `rgba(4,18,28,${a * 0.4})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, r, ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, ry, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 1.6, 1.1, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const bobTop = () => ((Gear.BOB[save.equip.bobber] || {}).top || 2) * bobR();
  const drawBobber = (x, y, inWater, dip, s = 1) => Gear.bobberFX(ctx, save.equip.bobber, x, y, bobR() * s, G.t, { inWater, dip, light: lit, dpr: DPR, refl: (Scenes.palette(save.loc) || {}).refl ?? 0.5 });
  const line = (a, b, sag) => Gear.paintLine(ctx, save.equip.line, a, b, sag, L.m, G.t, { light: lit, sway: Math.sin(G.t * 0.7) * L.m * 0.006 * Math.min(1, Math.abs(sag) / (L.m * 0.02) + 0.3) });

  function drawBaitGlow(p) {
    const bait = activeBait();
    if (!bait) return;
    const col = BAITS[bait].color, r = bobR();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = G.t * 0.7 + i * (TAU / 6), d = r * (2.2 + Math.sin(G.t * 1.3 + i) * 0.5);
      const tw = 0.35 + 0.35 * Math.sin(G.t * 2.4 + i * 1.7);
      ctx.fillStyle = FishArt.hexA(col, tw);
      ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.32 + r * 0.6, 1.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawLine(gpu) {
    const tip = rodTip();
    switch (G.phase) {
      case 'landing': break; // drawn with the fish, in front of the shore (see drawHoistAir)
      case 'idle': {
        const d = dangle(tip); line(tip, { x: d.x, y: d.y - bobTop() }, 0); drawBobber(d.x, d.y, false, 0);
        break;
      }
      case 'casting': {
        const C = G.cast;
        if (!C.launched) { const d = dangle(tip); line(tip, { x: d.x, y: d.y - bobTop() }, 0); drawBobber(d.x, d.y, false, 0); break; }
        if (C.hit) {
          const p = hitPos(), s = persp(p.y);
          line(tip, { x: p.x, y: p.y - bobTop() * s }, L.m * 0.03);
          drawBobber(p.x, p.y, false, 0, s);
          break;
        }
        const k = C.k, from = C.from, to = C.to;
        const x = lerp(from.x, to.x, easeOut(k)), y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * C.arc, s = lerp(1, persp(C.obj ? C.obj.y : to.y), k);
        line(tip, { x, y: y - bobTop() * s }, L.m * 0.02 * k);
        drawBobber(x, y, false, 0, s);
        break;
      }
      case 'waiting': case 'escaped': {
        const p = bobPos(), s = G.bob.s || 1;
        const dip = G.bobDip * s;
        line(tip, { x: p.x, y: p.y - bobTop() * s + dip * 0.5 }, L.m * 0.05);
        if (G.phase === 'waiting') drawBaitGlow(p);
        drawBobber(p.x, p.y, true, dip, s);
        break;
      }
      case 'bite': {
        const p = bobPos(), s = G.bob.s || 1, r = bobR() * s;
        const dip = Math.min(1, G.pt / 0.12) * r * 2.6 + Math.sin(G.t * 30) * r * 0.2;
        line(tip, { x: p.x, y: p.y + dip * 0.4 }, 0);
        drawBobber(p.x, p.y, true, dip, s);
        break;
      }
      case 'reeling': {
        const e = G.entry, r = bobR();
        const quiver = Math.sin(G.t * 47) * 0.6;
        // under the surface the line runs on, faint and bent by the water, down to the fish
        const hd = FS ? shadowHead() : e;
        ctx.strokeStyle = 'rgba(220,236,240,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(e.x + quiver, e.y);
        ctx.quadraticCurveTo((e.x + hd.x) / 2 + Math.sin(G.t * 5) * 2, (e.y + hd.y) / 2, hd.x, hd.y); ctx.stroke();
        line(tip, { x: e.x + quiver, y: e.y }, -L.m * 0.01);
        if (!gpu) {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(e.x, e.y, r * 1.6 + Math.sin(G.t * 9) * 2, r * 0.45, 0, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'retrieving': {
        const k = clamp(G.pt / 0.45, 0, 1), from = G.retrieve.from, d = dangle(tip);
        const x = lerp(from.x, d.x, easeOut(k)), y = lerp(from.y, d.y, k) - Math.sin(k * Math.PI) * H * 0.06;
        line(tip, { x, y: y - bobTop() }, L.m * 0.02 * (1 - k));
        drawBobber(x, y, false, 0);
        break;
      }
    }
  }

  /* ================= The catch =================
     Landing a fish plays in four beats.
     Heave: the rod hauls back and bends hard, the line snaps bar-taut and the water boils where it goes in.
     Burst: the fish breaks the surface nose first, in a crown of spray with a column of white water
       chasing it up (a bigger fish shakes the view a little; rarer ones flash their colour, the rarest
       the whole sky).
     Hoist: a weight on the line (see "The hoist happens in a small 3D world" below): it leaps clear and
       is swung up into the air by its mouth, coming toward you, so it grows as it nears; drops and is
       caught by the line; and swings below the rod tip, its body hanging from the hook like a second
       weight. It fights all the way, curling and twisting and flinging spray, in its rarity's glow, and
       the rod bends as hard as the line pulls. A glint runs over it as it comes up to hang.
     Into the card: it leaves the line (the float springs back up to the rod tip) and flies into the
       catch card, levelling out as the card grows around it from where it hung, and the card's
       details settle in one after another.
     A tap during the hoist hurries it to the card. With reduced motion the fish simply appears where
     it hangs and the card opens without the flight. */
  const HOIST = { burst: 0.2, open: 1.3, perTier: 0.07, fly: 0.56 };
  const hoistOpenAt = Ld => Ld.calm ? 0.6 : HOIST.open + HOIST.perTier * RARITIES[Ld.rarity].tier;
  // how hard it fights on the line: nothing under water, wild as it breaks out, settling as it hangs,
  // and stilling just before it leaves the line for the card
  function hoistThrash(t) {
    const Ld = G.land;
    if (t < HOIST.burst || !Ld || Ld.calm) return 0;
    const calm = Ld.hurry ? 1 : clamp((hoistOpenAt(Ld) - t) / 0.2, 0, 1);
    return (0.22 + 0.78 * Math.exp(-2.2 * (t - HOIST.burst))) * (0.35 + 0.65 * calm);
  }
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  // a fish's drawing at scale s (pixels per unit of its drawing) fitted to a w×h frame
  const artScale = (id, w, h, fit) => { const b = FishArt.BOX[id]; return Math.min(w * fit / (b[1] - b[0]), h * fit / (b[3] - b[2])) * 0.92; };

  /* Paint a fish at drawing scale s (pixels per unit of its drawing), centred on its drawing, at the
     context's current transform. With bend = { curl, amp, wave } its body bends along its spine: the
     head (on the right) stays as it is, held by the hook, and the body curves away behind it more and
     more toward the tail, curl being how far the tail is turned (radians) and amp a ripple running down
     it (a tail beat). The bend is drawn in thin columns, each sheared to follow the spine, with every
     column edge on a whole pixel so the joins never show. */
  let bendCv = null, stageCv = null;
  function paintFish(c, id, t, s, light, bend) {
    const b = FishArt.BOX[id], w = (b[1] - b[0]) * s / 0.92 / 0.9, h = (b[3] - b[2]) * s / 0.92 / 0.9;
    if (w < 2 || h < 2) return;
    const img = FishGL.render(id, t, w * DPR, h * DPR, { fit: 0.9, light });
    if (!bend || (Math.abs(bend.curl) < 0.01 && bend.amp < 0.01)) { c.drawImage(img, -w / 2, -h / 2, w, h); return; }
    const iw = img.width, ih = img.height, pad = Math.ceil(Math.max(ih * 0.3, iw * 0.32));
    if (!bendCv) { bendCv = document.createElement('canvas'); stageCv = document.createElement('canvas'); }
    if (stageCv.width !== iw || stageCv.height !== ih) { stageCv.width = iw; stageCv.height = ih; }
    if (bendCv.width !== iw || bendCv.height !== ih + 2 * pad) { bendCv.width = iw; bendCv.height = ih + 2 * pad; }
    // (one copy of the lit fish, rather than drawing every column straight from the GPU's canvas)
    const sx = stageCv.getContext('2d');
    sx.clearRect(0, 0, iw, ih); sx.drawImage(img, 0, 0);
    const x = bendCv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, iw, ih + 2 * pad);
    const rigid = Math.round(iw * 0.32);
    x.drawImage(stageCv, iw - rigid, 0, rigid, ih, iw - rigid, pad, rigid, ih);
    const n = 36, sw = (iw - rigid) / n, K = 1 / 0.4;
    let X = iw - rigid, Y = 0, phi = 0;
    for (let i = 0; i < n; i++) {
      const u = (rigid + (i + 0.5) * sw) / iw, wgt = u < 0.3 ? 0 : u > 0.95 ? 1 : ((u - 0.3) / 0.65) ** 2 * (3 - 2 * (u - 0.3) / 0.65);
      const dphi = (bend.curl + bend.amp * Math.sin(bend.wave - 7 * u)) * K * wgt * (sw / iw), pm = phi + dphi / 2;
      const Xl = X - sw * Math.cos(pm), Yl = Y + sw * Math.sin(pm);
      const xr = Math.round(X), xl = Math.round(Xl), sx1 = iw - rigid - i * sw, sx0 = sx1 - sw;
      if (xr > xl) {
        const a = (xr - xl) / sw, slope = (Y - Yl) / (xr - xl);
        x.setTransform(a, a * slope, 0, 1, xl - sx0 * a, pad + Yl - sx0 * a * slope);
        x.drawImage(stageCv, sx0, 0, sw, ih, sx0, 0, sw, ih);
      }
      X = Xl; Y = Yl; phi += dphi;
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    const k = h / ih;
    c.drawImage(bendCv, 0, 0, iw, ih + 2 * pad, -w / 2, -h / 2 - pad * k, w, h + 2 * pad * k);
  }

  /* The hoist happens in a small 3D world seen through the scene's own camera (eye 1.2 m above the
     water, looking at the horizon), so a fish nearer the eye draws larger and lower. The rod tip stands
     1.6 m out from the eye. The fish is a weight on the line: the line holds it at the length the reel
     has wound in to (never slack, never stretched) while it swings freely under gravity. It leaves the
     water with a leap, so it is swung up into the air as it comes in, then drops and is caught by the
     line, the hand slowing it as the reel finishes. Then it hangs 30 cm below the tip and swings. */
  const HC = { eye: 1.2, tip: 1.6, hang: 0.3, reel: 0.6, up: 5 };
  const camF = () => 0.95 * Math.min(H, W * 1.25);
  const to3 = (s, Z) => { const f = camF(); return { x: (s.x - W / 2) * Z / f, y: HC.eye - (s.y - L.horizon) * Z / f, z: Z }; };
  const to2 = p => { const f = camF(); return { x: W / 2 + f * p.x / p.z, y: L.horizon + f * (HC.eye - p.y) / p.z, k: f / p.z }; };
  // how long it looks, in metres (a little larger than life for small fish, a little smaller for the giants)
  const showLen = Ld => clamp(0.18 + (Ld.cm || 40) / 100 * 0.4, 0.28, 0.5);

  function startSim(Ld) {
    const tipS = rodTip(), f = camF();
    const Ze = Math.min(25, f * HC.eye / Math.max(6, Ld.from.y - L.horizon));
    const E = to3(Ld.from, Ze); E.y = 0;
    const T = to3(tipS, HC.tip);
    const len0 = Math.max(HC.hang + 0.1, Math.hypot(E.x - T.x, E.y - T.y, E.z - T.z));
    // its body still runs down into the water, nose first along the line
    const lineA = Math.atan2(Ld.from.y - tipS.y, Ld.from.x - tipS.x), beta = lineA + wrapA(Math.PI / 2 - lineA) * 0.75;
    Ld.sim = { P: E, V: { x: 0, y: HC.up, z: 0 }, len0, prev: len0, tau: 0, load: 1, beta, bv: 0, ph: rand(0, TAU), face: Math.cos(beta + Math.PI) >= 0 ? 1 : -1, ms: null, mv: { x: 0, y: 0 }, ma: { x: 0, y: 0 } };
  }

  function stepSim(Ld, dt) {
    const S = Ld.sim, T = to3(rodTip(), HC.tip), n = Math.min(16, Math.max(1, Math.ceil(dt * 240))), h = dt / n;
    const thr = hoistThrash(G.pt), tall = FishArt.BOX[Ld.id], upright = (tall[3] - tall[2]) > (tall[1] - tall[0]) * 1.1;
    for (let i = 0; i < n; i++) {
      S.tau += h;
      const k = Math.min(1, S.tau / HC.reel), len = S.len0 + (HC.hang - S.len0) * (1 - Math.pow(1 - k, 2.2));
      const rdot = (len - S.prev) / h; S.prev = len;
      // air drag, and the hand steadying it on the reel: more and more as the reel finishes, and enough
      // to temper the spin-up a shortening line gives a swinging weight; once it hangs, the swing toward
      // and away from you dies much sooner than the sideways one
      const cd = Math.min(0.5, ((k < 1 ? 0.6 + 12 * k * k * k : 3.2) + 0.6 * Math.abs(rdot) / len) * h), cz = k < 1 ? 0 : 8 * h;
      const V = S.V;
      V.y -= 9.8 * h;
      V.x *= 1 - cd; V.y *= 1 - cd; V.z *= 1 - cd - cz;
      const fx = S.P.x + V.x * h, fy = S.P.y + V.y * h, fz = S.P.z + V.z * h;
      const dx = fx - T.x, dy = fy - T.y, dz = fz - T.z, Lf = Math.hypot(dx, dy, dz) || 1, sc = len / Lf;
      // (once it hangs, the rod held out keeps it from swinging in nearer than the tip)
      const N = { x: T.x + dx * sc, y: Math.max(0, T.y + dy * sc), z: Math.max(k < 1 ? 0.7 : T.z - 0.1, T.z + dz * sc) };
      // how hard the line pulls, in g: it bends the rod
      const pull = Math.hypot(N.x - fx, N.y - fy, N.z - fz) / (h * h) / 9.8;
      S.load += (Math.min(4, pull) - S.load) * Math.min(1, h * 12);
      S.V = { x: (N.x - S.P.x) / h, y: (N.y - S.P.y) / h, z: (N.z - S.P.z) / h };
      S.P = N;
      // the body hangs from the mouth like a second weight: gravity pulls it down, it trails behind
      // when the mouth is jerked about, and the fish's own fight flings it from side to side
      const m = to2(N);
      if (S.ms) {
        const vx = (m.x - S.ms.x) / h, vy = (m.y - S.ms.y) / h, a = Math.min(1, h * 30);
        const ax = clamp((vx - S.mv.x) / h, -3e5, 3e5), ay = clamp((vy - S.mv.y) / h, -3e5, 3e5);
        S.ma.x += (ax - S.ma.x) * a; S.ma.y += (ay - S.ma.y) * a;
        S.mv = { x: vx, y: vy };
      }
      S.ms = m;
      const g = 9.8 * m.k, lb = Math.max(6, showLen(Ld) * m.k * 0.42), lim = g * 3;
      const ax = clamp(S.ma.x, -lim, lim), ay = clamp(S.ma.y, -lim, lim), sb = Math.sin(S.beta), cb = Math.cos(S.beta);
      S.ph += h * TAU * (2.5 + 0.9 * Math.sin(S.tau * 3.3 + 1));
      const fight = thr * (upright ? 40 : 95) * Math.sin(S.ph);
      S.bv += ((g * cb + ax * sb - ay * cb) / lb + fight - 3.2 * S.bv) * h;
      S.beta += S.bv * h;
    }
  }

  /* Where the fish is this moment: its mouth on the line (m), its middle (c), how it is turned (ang,
     face: 1 facing right, -1 left, sy: a little twist on the line), its size (s, and len, its longest
     side on screen), how its body is bent, where the float is and where the water is beneath it. */
  function hoistPose() {
    const Ld = G.land, tip = rodTip(), b = FishArt.BOX[Ld.id];
    if (!Ld.sim) startSim(Ld);
    const S = Ld.sim;
    if (Ld.calm) { const T = to3(tip, HC.tip); S.P = { x: T.x, y: T.y - HC.hang, z: T.z }; S.beta = Math.PI / 2 + (Ld.from.x >= tip.x ? -0.45 : 0.45); }
    const mm = to2(S.P), m = { x: mm.x, y: mm.y }, len = showLen(Ld) * mm.k, s = len / Math.max(b[1] - b[0], b[3] - b[2]);
    const body = S.beta, head = body + Math.PI;
    // which way it faces only changes once it has clearly turned over, so it never flickers when it hangs straight down
    if (S.face * Math.cos(head) < -0.3) S.face = -S.face;
    const face = S.face, ang = wrapA(face > 0 ? head : body), half = (b[1] - b[0]) * s / 2;
    const c = { x: m.x + Math.cos(body) * half * 0.94, y: m.y + Math.sin(body) * half * 0.94 };
    const thr = hoistThrash(G.pt), upright = (b[3] - b[2]) > (b[1] - b[0]) * 1.1, bk = upright ? 0.25 : 1;
    // long, slender fish (an eel, an oarfish) writhe more
    const writhe = clamp(((b[1] - b[0]) / (b[3] - b[2]) - 2.2) / 2, 0, 1);
    // it curls one way then the other with each kick, its tail beating fast, and twists a little on the line
    const bend = Ld.calm ? null : { curl: thr * 1.1 * (1 + 0.6 * writhe) * Math.sin(S.ph + 0.9) * bk, amp: (0.1 + 0.22 * thr + 0.22 * writhe * thr) * bk, wave: Ld.ft * TAU * 1.6 };
    const sy = 1 - 0.2 * thr * (0.5 + 0.5 * Math.sin(S.ph * 0.5 + 0.6));
    // the float rides the line a little above the hook
    const dl = Math.max(1, Math.hypot(tip.x - m.x, tip.y - m.y)), fb = Math.min(L.m * 0.06, dl * 0.4);
    const bob = { x: m.x + (tip.x - m.x) / dl * fb, y: m.y + (tip.y - m.y) / dl * fb };
    const water = to2({ x: S.P.x, y: 0, z: S.P.z }).y;
    return { m, c, ang, face, head, len, half, s, sy, bend, bob, tip, water, clear: S.P.y };
  }

  function stepHoist(dt) {
    const Ld = G.land, t = G.pt, tier = RARITIES[Ld.rarity].tier;
    Ld.ft += dt * (Ld.shown ? 1 : 1 + 2.2 * hoistThrash(t));
    if (Ld.calm) {
      if (!Ld.burst) { Ld.burst = true; Ld.burstAt = G.t; ripple(Ld.from.x, Ld.from.y, 2, 1.4); Sound.play('landed', Ld.rarity); }
    } else if (t < HOIST.burst) {
      // the water boils where the line goes in
      if (Math.random() < dt * 45) G.drops.push({ x: Ld.from.x + rand(-1, 1) * L.m * 0.02, y: Ld.from.y, vx: rand(-60, 60), vy: -rand(60, 170), t: 0, floor: Ld.from.y + 2, r: rand(0.8, 1.8) });
    } else {
      if (!Ld.burst) burstOut(Ld, tier);
      if (!Ld.shown) { const was = Math.sin(Ld.sim.ph); stepSim(Ld, dt); shedDrops(Ld, dt, was); }
    }
    if (!Ld.shown && (t >= hoistOpenAt(Ld) || (Ld.hurry && t >= HOIST.burst + 0.3))) handOff(Ld);
  }

  // the fish breaks the surface
  function burstOut(Ld, tier) {
    Ld.burst = true; Ld.burstAt = G.t;
    startSim(Ld);
    if (FS) { FS.alpha = 0; FS.mode = 'sink'; FS.gone = true; FS = null; }
    const p = Ld.from, s = 1.3 + (Ld.size ?? 0.4) * 0.8 + tier * 0.12, sq = Math.sqrt(L.m / 700) * persp(p.y);
    // a crown of spray thrown up and out
    const n = Math.round(18 * s);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.15, 0.15), sp = rand(60, 160) * s * sq;
      G.drops.push({ x: p.x + Math.cos(a) * L.m * 0.012 * s, y: p.y + Math.sin(a) * L.m * 0.004 * s, vx: Math.cos(a) * sp, vy: -rand(220, 400) * Math.sqrt(s) * sq * (0.75 + 0.25 * Math.abs(Math.cos(a))), t: 0, floor: p.y + 2 + Math.sin(a) * L.m * 0.01, r: rand(1.1, 2.6) * Math.min(1.5, s * 0.75) });
    }
    // and a fountain up after the fish
    for (let i = 0; i < Math.round(9 * s); i++) G.drops.push({ x: p.x + rand(-5, 5), y: p.y, vx: rand(-50, 50) * sq, vy: -rand(380, 600) * Math.sqrt(s) * sq, t: 0, floor: p.y + 2, r: rand(1.3, 3) });
    ripple(p.x, p.y, 3, 2.2 + tier * 0.2);
    Sound.play('burst', Ld.size ?? 0.4, tier);
    // the music of a catch rises with the fish, its chord landing as it reaches the top
    Sound.play('landed', Ld.rarity, true);
    buzz(tier >= 3 ? [45, 40, 70] : 40);
    shake(Math.min(7, 1.2 + (Ld.size ?? 0.4) * 2.5 + tier * 0.9));
    G.flexV -= L.m * 1.4;
  }

  // water streaming off it as it rises, and flung from its tail with each kick
  function shedDrops(Ld, dt, was) {
    const P = hoistPose(), S = Ld.sim, thr = hoistThrash(G.pt);
    const ca = Math.cos(P.head), sa = Math.sin(P.head), rs = Math.sqrt(P.len / (L.m * 0.3));
    const drop = (u, w, vx, vy) => {
      const x = P.c.x + ca * u - sa * w, y = P.c.y + sa * u + ca * w;
      G.drops.push({ x, y, vx, vy, t: 0, floor: Math.max(P.water, y) + rand(L.m * 0.02, L.m * 0.08), r: rand(0.9, 2.1) * rs });
    };
    let n = (55 * thr + 6) * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      drop(rand(-0.55, 0.4) * P.half * 2, rand(-0.1, 0.1) * P.len, S.mv.x * 0.3 + rand(-45, 45), S.mv.y * 0.3 + rand(-70, 10));
    }
    // a kick flicks a spray off the tail
    if (thr > 0.3 && Math.sign(Math.sin(S.ph)) !== Math.sign(was)) {
      const side = Math.sign(Math.sin(S.ph)) || 1;
      for (let i = 0; i < Math.round(4 + 6 * thr); i++) drop(-P.half * rand(0.75, 1), rand(-0.05, 0.05) * P.len, -sa * side * rand(60, 200) * rs + S.mv.x * 0.2, ca * side * rand(60, 200) * rs - rand(40, 140));
    }
  }

  // the view shakes a little, as if the heave went through the jetty
  function shake(px) {
    if (px < 0.5 || UIFX.reduced()) return;
    const frames = [];
    for (let i = 0; i < 9; i++) {
      const a = px * Math.pow(1 - i / 9, 1.5);
      frames.push({ transform: `translate(${(rand(-1, 1) * a).toFixed(1)}px, ${(rand(-0.6, 1) * a).toFixed(1)}px) scale(${(1 + 0.012 * (1 - i / 9)).toFixed(4)})` });
    }
    frames.push({ transform: 'none' });
    for (const el of [canvas, $('#water')]) if (el && el.animate) el.animate(frames, { duration: 380, easing: 'linear' });
  }

  // the fish leaves the line for the card
  function handOff(Ld) {
    Ld.shown = true;
    const P = hoistPose(), o = onScreen(P.c);
    Ld.openAt = P.c;
    Ld.loose = { at: G.t, bob: P.bob };
    // the float springs back up to hang from the rod tip, swinging
    G.pend.a = clamp(Math.atan2(P.bob.x - P.tip.x, P.bob.y - P.tip.y), -1.1, 1.1); G.pend.v = 0;
    G.flexV -= L.m * 1.6;
    if (!Ld.calm) {
      Ld.fly = { t0: G.t, from: { x: o.x, y: o.y, ang: P.ang, face: P.face, s: P.s, sy: P.sy, bend: P.bend }, light: lit };
      Sound.play('swoop');
    }
    openReveal(Ld, 'catch');
  }

  // the water where it comes out: boiling, then the crown, the column and (for rarer fish) a flash
  function drawHoistWater() {
    const Ld = G.land, p = Ld.from, tier = RARITIES[Ld.rarity].tier;
    if (Ld.calm) return;
    const ps = persp(p.y) * Math.sqrt(L.m / 700), sz = 0.85 + 0.35 * (Ld.size ?? 0.4) + 0.06 * tier;
    ctx.save();
    if (!Ld.burst) {
      const k = clamp(G.pt / HOIST.burst, 0, 1), r = L.m * 0.03 * persp(p.y) * (0.55 + 0.65 * k);
      ctx.fillStyle = `rgba(240,250,255,${0.16 + 0.26 * k})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4 + G.t * 9, rr = r * (0.25 + 0.6 * ((i * 0.37 + G.t * 3.1) % 1));
        ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.3, 2.4 * ps, 1.2 * ps, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      return;
    }
    const tau = G.t - Ld.burstAt, col = RARITIES[Ld.rarity].color;
    // rarer fish flash their colour as they break out; the rarest light the whole sky for a moment
    if (tier >= 2 && tau < 0.55) {
      const a = (tier - 1) * 0.16 * Math.pow(1 - tau / 0.55, 2), R = L.m * (0.22 + 0.09 * tier);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y - R * 0.2, 0, p.x, p.y - R * 0.2, R);
      g.addColorStop(0, FishArt.hexA(col, a)); g.addColorStop(0.4, FishArt.hexA(col, a * 0.4)); g.addColorStop(1, FishArt.hexA(col, 0));
      ctx.fillStyle = g; ctx.fillRect(p.x - R, p.y - R * 1.2, R * 2, R * 2);
      if (tier >= 4 && tau < 0.2) { ctx.fillStyle = `rgba(255,236,220,${0.2 * (1 - tau / 0.2)})`; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over';
    }
    // foam spreading where it came out
    if (tau < 0.9) {
      const k = tau / 0.9, rx = L.m * 0.035 * ps * sz * (0.8 + 1.8 * easeOut(k));
      ctx.fillStyle = `rgba(240,250,255,${0.5 * (1 - k)})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, rx * 0.3, 0, 0, TAU); ctx.fill();
    }
    // the column of white water chasing it up, then falling back
    if (tau < 0.6) {
      const rise = tau < 0.12 ? easeOut(tau / 0.12) : 1 - Math.pow((tau - 0.12) / 0.48, 2);
      const hc = L.m * 0.2 * ps * sz * rise, wb = L.m * 0.022 * ps * sz * (1 + tau * 1.6), a = 0.8 * (1 - tau / 0.6);
      if (hc > 2) {
        const top = p.y - hc, wob = Math.sin(G.t * 31) * wb * 0.12;
        const g = ctx.createLinearGradient(0, p.y, 0, top);
        g.addColorStop(0, `rgba(250,253,255,${a})`); g.addColorStop(0.7, `rgba(235,248,255,${a * 0.55})`); g.addColorStop(1, 'rgba(235,248,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(p.x - wb, p.y);
        ctx.bezierCurveTo(p.x - wb * 0.7, p.y - hc * 0.4, p.x - wb * 0.5 + wob, p.y - hc * 0.8, p.x + wob, top);
        ctx.bezierCurveTo(p.x + wb * 0.5 + wob, p.y - hc * 0.8, p.x + wb * 0.7, p.y - hc * 0.4, p.x + wb, p.y);
        ctx.closePath(); ctx.fill();
      }
    }
    // the crown: a ring of spikes of water thrown up and out, falling back
    if (tau < 0.7) {
      const k = tau / 0.7, rr = L.m * 0.026 * ps * sz * (0.6 + 1.5 * easeOut(Math.min(1, tau / 0.45)));
      const up = Math.sin(Math.PI * Math.min(1, tau / 0.62)), a = 0.85 * (1 - k);
      ctx.fillStyle = `rgba(238,249,255,${a})`;
      for (let i = 0; i < 16; i++) {
        const an = (i / 16) * TAU, x = p.x + Math.cos(an) * rr, y = p.y + Math.sin(an) * rr * 0.3;
        const hs = L.m * 0.05 * ps * sz * up * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.7))), bw = rr * 0.16;
        ctx.beginPath();
        ctx.moveTo(x - bw, y);
        ctx.quadraticCurveTo(x + Math.cos(an) * hs * 0.15, y - hs * 0.6, x + Math.cos(an) * hs * 0.4, y - hs);
        ctx.quadraticCurveTo(x + Math.cos(an) * hs * 0.25, y - hs * 0.5, x + bw, y);
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * 0.3, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // the line, the float and the fish in the air
  function drawHoistAir() {
    const Ld = G.land, P = Ld.pose, tip = rodTip();
    if (Ld.loose) {
      // off the hook: the float springs back up the line to hang from the rod tip again
      const k = clamp((G.t - Ld.loose.at) / 0.32, 0, 1), d = dangle(tip), e = easeOut(k);
      const x = lerp(Ld.loose.bob.x, d.x, e), y = lerp(Ld.loose.bob.y, d.y, e) - Math.sin(k * Math.PI) * L.m * 0.03;
      line(tip, { x, y: y - bobTop() }, 0); drawBobber(x, y, false, 0);
      return;
    }
    if (!Ld.burst && !Ld.calm) {
      // the heave: the line drawn bar-taut into the boiling water, trembling
      line(tip, { x: Ld.from.x + Math.sin(G.t * 53) * 1.2, y: Ld.from.y }, 0);
      return;
    }
    const tier = RARITIES[Ld.rarity].tier, since = G.pt - HOIST.burst;
    ctx.save();
    if (Ld.calm) ctx.globalAlpha = clamp(G.pt / 0.3, 0, 1);
    line(tip, { x: P.bob.x, y: P.bob.y - bobTop() }, 0);
    drawBobber(P.bob.x, P.bob.y, false, 0);
    // the short leader from the float down to the hook in its mouth
    ctx.strokeStyle = 'rgba(230,240,245,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.bob.x, P.bob.y + bobR() * 0.8); ctx.lineTo(P.m.x, P.m.y); ctx.stroke();
    // its rarity's glow, gathering as it rises
    const ga = Ld.calm ? 1 : clamp((since - 0.1) / 0.4, 0, 1);
    if (tier >= 1 && ga > 0) {
      ctx.save(); ctx.translate(P.c.x, P.c.y); ctx.globalAlpha *= ga;
      FishArt.aura(ctx, Ld.rarity, G.t, P.len * (0.55 + 0.08 * tier));
      ctx.restore();
    }
    // still coming out nose first: what is under the surface beneath it is not seen yet, and the water
    // foams where its body cuts through
    const emerging = !Ld.calm && P.clear < showLen(Ld) * 1.1;
    if (emerging) {
      const bx = Math.cos(P.head + Math.PI), by = Math.sin(P.head + Math.PI);
      const cut = by > 0.15 ? Math.max(0, (P.water - P.m.y) / by) : -1;
      if (cut >= 0 && cut < P.half * 2.1) {
        const fx = P.m.x + bx * cut, r = P.len * 0.16;
        ctx.fillStyle = 'rgba(240,250,255,0.55)';
        ctx.beginPath(); ctx.ellipse(fx, P.water, r * (1.2 + Math.sin(G.t * 40) * 0.15), r * 0.32, 0, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.rect(0, 0, W, P.water + 1); ctx.clip();
    }
    ctx.translate(P.c.x, P.c.y); ctx.rotate(P.ang); ctx.scale(P.face, P.sy);
    paintFish(ctx, Ld.id, Ld.ft, P.s, lit, P.bend);
    ctx.restore();
    // a glint runs over it as it comes up to hang
    const gk = (Ld.sim ? Ld.sim.tau - HC.reel + 0.12 : -1) / 0.42;
    if (!Ld.calm && gk > 0 && gk < 1) {
      const ca = Math.cos(P.ang), sa = Math.sin(P.ang), lx = P.face * lerp(-0.2, 0.28, gk) * P.len, ly = -0.1 * P.len;
      const gx = P.c.x + ca * lx - sa * ly, gy = P.c.y + sa * lx + ca * ly, r = P.len * 0.09 * Math.sin(gk * Math.PI);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      FishArt.sparkle(ctx, gx, gy, r, '#ffffff', 0.95 * Math.sin(gk * Math.PI));
      FishArt.sparkle(ctx, gx, gy, r * 0.45, RARITIES[Ld.rarity].color, 0.8 * Math.sin(gk * Math.PI));
      ctx.restore();
    }
  }

  /* The flight into the card, on a layer over the menus: from where the fish hung to the card's own
     picture of it, following the card as it grows, turning level and taking on the card's light. */
  let flyCv = null;
  function drawFly() {
    const Ld = G.land, F = Ld && Ld.fly;
    if (!F) return;
    const k = clamp((G.t - F.t0) / HOIST.fly, 0, 1), rv = ui.rvCanvas, r = rv.getBoundingClientRect();
    if (k >= 1 || !r.width || !revealState || Tank.isOpen || $('#m-reveal').hidden || modalStack[modalStack.length - 1] !== $('#m-reveal')) { endFly(); return; }
    if (!flyCv) { flyCv = document.createElement('canvas'); flyCv.className = 'fly-layer'; flyCv.setAttribute('aria-hidden', 'true'); document.body.appendChild(flyCv); }
    const vw = window.innerWidth, vh = window.innerHeight, pw = Math.round(vw * DPR), ph = Math.round(vh * DPR);
    if (flyCv.width !== pw || flyCv.height !== ph) { flyCv.width = pw; flyCv.height = ph; }
    flyCv.hidden = false;
    const x = flyCv.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, vw, vh);
    // it sets off promptly with the card and settles gently into place
    const e = 0.5 * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) + 0.5 * easeOut(k);
    // the card's picture: its middle as the card grows (with the card's gentle bob), at the size it settles to
    const zoom = r.width / (rv.clientWidth || r.width);
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 + Math.sin(G.t * 1.4) * 3 * zoom, s: artScale(Ld.id, rv.clientWidth * 0.96, rv.clientHeight * 0.94, 0.92) };
    const A = F.from, lift = Math.sin(k * Math.PI) * Math.min(L.m * 0.1, Math.hypot(to.x - A.x, to.y - A.y) * 0.25);
    const px = lerp(A.x, to.x, e), py = lerp(A.y, to.y, e) - lift;
    const s = A.s * Math.pow(Math.max(0.01, to.s) / A.s, e);
    const ang = A.ang * (1 - e);
    const len = s * (FishArt.BOX[Ld.id][1] - FishArt.BOX[Ld.id][0]);
    // a soft trail of its colour
    const tier = RARITIES[Ld.rarity].tier;
    if (tier >= 1) {
      const g = x.createRadialGradient(px, py, 0, px, py, len * 0.7);
      g.addColorStop(0, FishArt.hexA(RARITIES[Ld.rarity].color, 0.3 * (1 - e))); g.addColorStop(1, FishArt.hexA(RARITIES[Ld.rarity].color, 0));
      x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(px - len, py - len, len * 2, len * 2); x.globalCompositeOperation = 'source-over';
    }
    // it straightens out and stops twisting as it goes
    const bend = A.bend && { curl: A.bend.curl * (1 - e), amp: A.bend.amp * (1 - e), wave: Ld.ft * TAU * 1.6 };
    x.translate(px, py); x.rotate(ang); x.scale(A.face, lerp(A.sy || 1, 1, e));
    paintFish(x, Ld.id, Ld.ft, s, flyLight(F.light, e), bend);
  }
  // from the lake's light into the card's soft studio light
  const STUDIO_FISH = { dir: [-0.5, 0.62, 0.72], key: [1, 1, 1], amb: [0.64, 0.64, 0.64] };
  function flyLight(a, e) {
    if (e >= 0.999 || !a) return undefined;
    const mix = (p, q) => p.map((v, i) => lerp(v, q[i], e));
    return { dir: mix(a.dir, STUDIO_FISH.dir), key: mix(a.key, STUDIO_FISH.key), amb: mix(a.amb, STUDIO_FISH.amb), rim: a.rim, rimTo: e };
  }
  function endFly() {
    const Ld = G.land;
    if (Ld && Ld.fly) Ld.fly = null;
    if (revealState && revealState.fly) { revealState.fly = false; revealState.flown = true; revealState.tOff = (Ld ? Ld.ft : G.t) - G.t; }
    if (flyCv && !flyCv.hidden) { const x = flyCv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, flyCv.width, flyCv.height); flyCv.hidden = true; }
  }

  /* The bite mark: a brass medallion with an engraved "!". It springs up over the float with a shock ring
     and a burst of light, swings and settles, catches the light once, then flies in an arc down into the
     meter's ring as the meter arrives, where the ring's fish takes its place. */
  const BITE = { pop: 0.2, fly0: 0.42, fly1: 0.74 };
  function ringCenter() {
    const r = ui.ring.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W / 2, y: H * 0.85 };
  }
  function drawBiteMark() {
    const B = G.biteFx, age = G.t - B.t0, reduced = UIFX.reduced();
    const r0 = Math.max(15, L.m * 0.027);
    if (G.phase === 'bite' || !B.home) { const b = bobPos(); B.home = { x: b.x, y: b.y - L.m * 0.1 }; }
    let x = B.home.x, y = B.home.y, s = 1, rot = 0, alpha = 1, fly = 0;
    if (reduced) {
      // no springing or flying: it simply shows, then fades as the meter takes over
      alpha = clamp(1 - (age - 0.55) / 0.2, 0, 1);
      if (alpha <= 0) { G.biteFx = null; return; }
    } else if (age < BITE.fly0) {
      const k = clamp(age / BITE.pop, 0, 1);
      s = easeOutBack(k);
      rot = -0.2 * Math.cos(age * 17) * Math.exp(-age * 7);
      y += (1 - easeOut(k)) * r0 * 0.5 + Math.sin(age * 7.5) * r0 * 0.04;
    } else {
      if (!B.fly) B.fly = { from: { x, y }, to: ringCenter() };
      const k = clamp((age - BITE.fly0) / (BITE.fly1 - BITE.fly0), 0, 1);
      if (k >= 1) { G.biteFx = null; ringWave(0.55); Sound.play('meterSet'); return; }
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const F = B.fly.from, T = B.fly.to, C = { x: lerp(F.x, T.x, 0.3), y: Math.min(F.y, T.y) - L.m * 0.1 };
      x = (1 - e) * (1 - e) * F.x + 2 * (1 - e) * e * C.x + e * e * T.x;
      y = (1 - e) * (1 - e) * F.y + 2 * (1 - e) * e * C.y + e * e * T.y;
      s = lerp(1, 0.4, e);
      rot = Math.sign(T.x - F.x || 1) * 0.5 * Math.sin(e * Math.PI);
      alpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 * 0.75 : 1;
      fly = 1;
      B.trail.push({ x, y, t: G.t });
    }
    // a wake of sparkles behind it in flight
    if (B.trail.length) {
      B.trail = B.trail.filter(p => G.t - p.t < 0.18);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of B.trail) {
        const a = 1 - (G.t - p.t) / 0.18;
        ctx.fillStyle = `rgba(255,226,150,${(a * 0.4).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r0 * 0.22 * a + 1, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    paintBiteMark(x, y, r0 * s, rot, alpha, reduced ? 1 : age, fly);
  }
  function paintBiteMark(x, y, r, rot, alpha, age, fly) {
    if (r < 0.5) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    // glow behind it, gently pulsing
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.8 + 0.2 * Math.sin(age * 10);
    const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2);
    halo.addColorStop(0, `rgba(255,218,140,${(0.2 * pulse * (1 - 0.6 * fly)).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255,218,140,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, TAU); ctx.fill();
    // the burst as it springs up: rays of light, and a shock ring
    if (age < 0.42 && !fly) {
      const ra = Math.pow(1 - age / 0.42, 1.6) * 0.42, len = 0.3 + 0.75 * easeOut(clamp(age / 0.3, 0, 1));
      ctx.fillStyle = `rgba(255,240,205,${ra.toFixed(3)})`;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2 + age * 0.6, l = len * (i % 2 ? 0.6 : 1), w = 0.04;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - w) * r * 1.12, Math.sin(a - w) * r * 1.12);
        ctx.lineTo(Math.cos(a) * r * (1.12 + l), Math.sin(a) * r * (1.12 + l));
        ctx.lineTo(Math.cos(a + w) * r * 1.12, Math.sin(a + w) * r * 1.12);
        ctx.fill();
      }
    }
    if (age < 0.42 && !fly) {
      const e = easeOut(age / 0.42);
      ctx.strokeStyle = `rgba(255,242,210,${(0.45 * (1 - e)).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.5, r * 0.1 * (1 - e));
      ctx.beginPath(); ctx.arc(0, 0, r * (1 + 1.6 * e), 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // the medallion: polished brass, a darker rim, a bevel catching the light
    ctx.save();
    ctx.shadowColor = 'rgba(12,8,0,0.28)'; ctx.shadowBlur = r * 0.5 * DPR; ctx.shadowOffsetY = r * 0.12 * DPR;
    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.05, 0, 0, r);
    body.addColorStop(0, '#fcf5e2'); body.addColorStop(0.24, '#f3e2b6'); body.addColorStop(0.6, '#e0c07c');
    body.addColorStop(0.87, '#c09852'); body.addColorStop(1, '#977238');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.lineWidth = r * 0.07; ctx.strokeStyle = 'rgba(120,84,32,0.5)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.955, 0, TAU); ctx.stroke();
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = 'rgba(255,250,228,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.strokeStyle = 'rgba(96,64,20,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
    // the "!": a tapered stroke and a dot, engraved (a light edge under the dark cut)
    const glyph = () => {
      ctx.beginPath();
      ctx.moveTo(-r * 0.14, -r * 0.55);
      ctx.quadraticCurveTo(0, -r * 0.67, r * 0.14, -r * 0.55);
      ctx.lineTo(r * 0.06, r * 0.14);
      ctx.quadraticCurveTo(0, r * 0.21, -r * 0.06, r * 0.14);
      ctx.closePath();
      ctx.moveTo(r * 0.11, r * 0.4);
      ctx.arc(0, r * 0.4, r * 0.11, 0, TAU);
    };
    ctx.save();
    ctx.translate(0, r * 0.04); glyph(); ctx.fillStyle = 'rgba(255,246,218,0.5)'; ctx.fill();
    ctx.restore();
    glyph(); ctx.fillStyle = '#4a3214'; ctx.fill();
    // light sweeping across it once, just after it lands in place
    if (age > 0.14 && age < 0.48 && !fly) {
      const k = (age - 0.14) / 0.34;
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, TAU); ctx.clip();
      ctx.rotate(0.55);
      const sx = lerp(-1.7, 1.7, easeOut(k)) * r;
      const sh = ctx.createLinearGradient(sx - r * 0.35, 0, sx + r * 0.35, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,245,0.42)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(sx - r * 0.35, -r * 1.5, r * 0.7, r * 3);
      ctx.restore();
    }
    // three small twinkles circling it
    if (!fly) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = 0.9 + i * 2.1 + age * 1.3, tw = Math.max(0, Math.sin(age * 13 + i * 2.2)), sz = r * 0.12 * tw * clamp(age / 0.2, 0, 1);
        if (sz < 0.3) continue;
        const px = Math.cos(a) * r * 1.6, py = Math.sin(a) * r * 1.6;
        ctx.fillStyle = `rgba(255,246,220,${(0.6 * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(px, py - sz); ctx.quadraticCurveTo(px, py, px + sz, py); ctx.quadraticCurveTo(px, py, px, py + sz);
        ctx.quadraticCurveTo(px, py, px - sz, py); ctx.quadraticCurveTo(px, py, px, py - sz);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /* ================= Interface ================= */
  function setPrompt(text) {
    ui.prompt.textContent = text;
    ui.prompt.classList.toggle('empty', !text);
  }

  function updateReelUI(dt = 0) {
    const R = G.reel;
    if (!R) return;
    ui.band.style.left = ((R.band.x - R.band.w / 2) * 100).toFixed(3) + '%';
    ui.band.style.width = (R.band.w * 100).toFixed(3) + '%';
    ui.marker.style.left = (R.fish.shown * 100).toFixed(3) + '%';
    markerFx(R, dt);
    const p = clamp(R.progress, 0, 1);
    setRingFill(p * enterFill());
    ui.reel.classList.toggle('in', R.inBand);
    ui.reel.classList.toggle('danger', !R.inBand && R.progress < REEL_ESCAPE + 0.09);
    if (R.fx) ringFx(R, p, dt);
  }
  /* A tiring line shows: an ember glow creeps into the meter as the strain builds (full at three times the
     usual drain) and eases away when the ring reaches a new high. The first time in a fight, a short note
     says what is happening and how to ease it. */
  function lineStrain(R, dt) {
    // shows clearly from the moment it starts (a third), then builds to full at three times the usual drain
    const target = R.strain > 0 ? 0.35 + 0.65 * clamp(R.strain / 2, 0, 1) : 0;
    R.strainShown += (target - R.strainShown) * (1 - Math.exp(-dt * (target > R.strainShown ? 3 : 6)));
    ui.reel.style.setProperty('--strain', R.strainShown.toFixed(3));
    ui.reel.classList.toggle('straining', R.strainShown > 0.02);
    if (R.strain > 0 && !R.toldStrain) {
      R.toldStrain = true;
      toast('Your line is tiring! Push the ring higher to ease it.', '#ff9a6a', 4200);
    }
  }
  function setRingFill(p) {
    ui.ringFill.style.strokeDashoffset = (RING_C * (1 - p)).toFixed(2);
    // the head of the fill: bright while it grows, an ember while it drains
    const a = (p * 360 - 90) * Math.PI / 180;
    ui.ringHead.setAttribute('cx', (60 + 50 * Math.cos(a)).toFixed(2));
    ui.ringHead.setAttribute('cy', (60 + 50 * Math.sin(a)).toFixed(2));
  }

  /* The gold line is the fish, and it should feel alive. It leaves a short wake when it darts, leans
     against its own acceleration and swings back past upright as it brakes, and a hard kick sends a ripple
     out from where it pushed off. When it holds still its beads breathe. Kept inside your band it warms:
     brighter, with a glow round it and sparks drifting off, building over half a second or so; once it
     slips out it cools back to plain gold within a third of a second. All of it comes from how the line
     actually moves, so a harder fish simply looks livelier and nothing gives its rarity away. */
  function markerFx(R, dt) {
    const M = R.mk || (R.mk = { prev: R.fish.shown, vs: 0, pv: 0, as: 0, sk: 0, skv: 0, heat: 0, armed: true, cool: 0, spark: 0, flash: 0, t: 0, live: 0, w: ui.track.clientWidth || 480 });
    if (dt <= 0) return;
    M.t += dt;
    const x = R.fish.shown, raw = (x - M.prev) / dt;
    M.prev = x;
    // speed and acceleration along the slider (slider widths per second), lightly smoothed
    M.vs += (raw - M.vs) * (1 - Math.exp(-dt / 0.045));
    const acc = (M.vs - M.pv) / dt;
    M.pv = M.vs;
    M.as += (acc - M.as) * (1 - Math.exp(-dt / 0.05));
    const reduced = UIFX.reduced(), sp = Math.abs(M.vs), left = (x * 100).toFixed(3) + '%';
    // warmth builds while it is in the band and drains quickly once it isn't
    M.heat = R.inBand ? Math.min(1, M.heat + dt * 1.6) : M.heat * Math.exp(-dt / 0.12);
    // a hard kick (common fish almost never; the rarest often): a flare, and a ripple where it pushed off
    const ka = Math.abs(M.as);
    M.cool -= dt;
    if (M.armed && ka > 2.8 && M.cool <= 0) {
      M.armed = false; M.cool = 0.3; M.flash = Math.min(1, 0.4 + ka / 8);
      if (!reduced) markerKick(left, Math.min(1, ka / 6));
    } else if (ka < 1.5) M.armed = true;
    M.flash *= Math.exp(-dt / 0.16);
    // the lean: a damped spring pushed by the acceleration, so it lags, then swings past upright and settles
    const n = Math.min(20, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { M.skv += (-M.sk * 260 - M.skv * 16 - M.as * 440) * h; M.sk += M.skv * h; }
    const sk = reduced ? 0 : clamp(M.sk, -12, 12);
    const breathe = reduced ? 1 : 1 + 0.07 * Math.sin(M.t * 5.2) * Math.max(0, 1 - sp / 0.35);
    const mk = ui.marker.style;
    mk.transform = Math.abs(sk) > 0.05 ? `skewX(${sk.toFixed(2)}deg)` : '';
    mk.setProperty('--heat', M.heat.toFixed(3));
    mk.setProperty('--flash', M.flash.toFixed(3));
    mk.setProperty('--bs', (breathe * (1 + 0.22 * M.heat + 0.25 * M.flash)).toFixed(3));
    // the wake: about the stretch of slider crossed in the last 70 ms, fading out behind it
    const tr = ui.mkTrail.style, len = reduced ? 0 : Math.min(72, sp * M.w * 0.07);
    tr.left = left;
    tr.width = `${len.toFixed(1)}px`;
    tr.opacity = reduced ? '0' : (clamp((sp - 0.1) / 0.8, 0, 1) * (0.7 + 0.3 * M.heat)).toFixed(3);
    tr.transform = `scaleX(${M.vs > 0 ? -1 : 1})`;
    const au = ui.mkAura.style;
    au.left = left;
    au.opacity = (M.heat * 0.85).toFixed(3);
    au.transform = `scale(${(0.82 + 0.18 * M.heat + (reduced ? 0 : 0.05 * Math.sin(M.t * 6))).toFixed(3)})`;
    if (!reduced && R.inBand) {
      M.spark += dt * 5 * Math.pow(M.heat, 1.5);
      while (M.spark >= 1) { M.spark -= 1; markerSpark(M, x); }
    }
  }
  function markerSpark(M, x) {
    if (M.live > 14) return;
    const el = document.createElement('i'), back = -Math.sign(M.vs) * Math.min(10, Math.abs(M.vs) * 9);
    el.className = 'mk-spark';
    el.style.left = `${(x * 100).toFixed(2)}%`;
    el.style.top = `${rand(26, 74).toFixed(1)}%`;
    el.style.setProperty('--dx', `${(rand(-6, 6) + back).toFixed(1)}px`);
    el.style.setProperty('--dy', `${(-rand(10, 24)).toFixed(1)}px`);
    el.style.setProperty('--d', `${rand(0.6, 1).toFixed(2)}s`);
    M.live++;
    const done = () => { if (el.parentNode) { el.remove(); M.live--; } };
    el.addEventListener('animationend', done);
    setTimeout(done, 1200);
    ui.track.appendChild(el);
  }
  /* each step the ring fills, a soft pulse of light from the line: the same beat as the ring's bloom and chime */
  function markerPulse(k) {
    if (UIFX.reduced() || !G.reel) return;
    const el = document.createElement('i');
    el.className = 'mk-pulse';
    el.style.left = `${(G.reel.fish.shown * 100).toFixed(2)}%`;
    el.style.setProperty('--o', (0.55 + 0.4 * k).toFixed(2));
    const done = () => el.remove();
    el.addEventListener('animationend', done);
    setTimeout(done, 900);
    ui.track.insertBefore(el, ui.marker);
  }
  function markerKick(left, o) {
    const el = document.createElement('i');
    el.className = 'mk-kick';
    el.style.left = left;
    el.style.setProperty('--o', (0.35 + 0.45 * o).toFixed(2));
    const done = () => el.remove();
    el.addEventListener('animationend', done);
    setTimeout(done, 800);
    ui.track.insertBefore(el, ui.marker);
  }
  function resetMarker() {
    ui.track.querySelectorAll('.mk-spark, .mk-kick, .mk-pulse').forEach(e => e.remove());
    ui.marker.style.transform = '';
    for (const k of ['--heat', '--flash', '--bs']) ui.marker.style.removeProperty(k);
    ui.mkTrail.style.opacity = '0';
    ui.mkAura.style.opacity = '0';
  }

  /* The ring is meant to be read from the corner of the eye. It blooms on every note of the harp (the same
     steps the sound climbs), from about 7% early on to about 17% near full, and sends a ripple out each
     time; it glows more as it fills; and as it drains toward the red mark it fidgets, then shakes, then
     thumps with the heartbeat. A damped spring carries the blooms so they bounce rather than snap. */
  function ringFx(R, p, dt) {
    const F = R.fx, reduced = UIFX.reduced();
    F.t += dt;
    const step = Math.floor(p / 0.07);
    if (R.inBand && step > F.step) {
      const k = 0.3 + 0.7 * Math.pow(p, 1.4);
      if (F.step >= 0) { F.v += 0.5 + 4.5 * Math.pow(k, 1.5); F.flash = Math.max(F.flash, 0.45 + 0.55 * k); ringWave(k); markerPulse(k); }
      F.step = step;
    } else if (step < F.step - 1) F.step = step + 1;
    // danger: how close the ring is to letting the fish go (the heartbeat starts at the same point as the sound's)
    const near = R.inBand ? 0 : clamp(1 - (R.progress - REEL_ESCAPE) / 0.24, 0, 1);
    F.d += (near - F.d) * (1 - Math.exp(-dt * (near > F.d ? 6 : 3)));
    const beatOn = !R.inBand && clamp(1 - (R.progress - REEL_ESCAPE) / 0.18, 0, 1) > 0.55;
    F.beat -= dt;
    if (beatOn && F.beat <= 0) { F.v -= 1.5; F.beat = 0.85; }
    else if (!beatOn) F.beat = Math.min(F.beat, 0.2);
    // the spring: rests a touch smaller while draining, breathes when nearly full
    const rest = 1 - (R.inBand ? 0 : 0.03) + (R.inBand && p > 0.75 ? 0.012 * Math.sin(F.t * 9) * (p - 0.75) * 4 : 0);
    // integrated in fixed small steps so the bloom is the same size at any frame rate
    const n = Math.min(40, Math.ceil(dt * 240)), h = n ? dt / n : 0;
    for (let i = 0; i < n; i++) { F.v += ((rest - F.s) * 180 - F.v * 14) * h; F.s += F.v * h; }
    F.flash *= Math.exp(-dt * 4.5);
    const fill = R.inBand ? p * p : p * p * 0.35;
    ui.ring.style.setProperty('--glow', Math.min(1.4, 0.1 + 0.55 * fill + F.flash).toFixed(3));
    ui.ring.style.setProperty('--halo', Math.min(1, 0.6 * Math.pow(p, 2.2) * (R.inBand ? 1 : 0.35) + 0.7 * F.flash).toFixed(3));
    ui.ring.classList.toggle('draining', !R.inBand);
    if (reduced) { ui.ring.style.transform = ''; return; }
    // fidget, then shake: two out-of-step wobbles so it never looks mechanical
    const sh = Math.pow(F.d, 1.4), t = F.t;
    const x = sh * 5.5 * (Math.sin(t * 41) * 0.6 + Math.sin(t * 67 + 1.3) * 0.4);
    const y = sh * 3.4 * (Math.sin(t * 53 + 0.7) * 0.6 + Math.sin(t * 79 + 2.1) * 0.4);
    const rot = sh * 8 * Math.sin(t * 29 + 0.4) + F.d * 1.5 * Math.sin(t * 11);
    ui.ring.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${F.s.toFixed(4)})`;
  }

  /* A ripple of light that leaves the ring on each note; k (0–1) is how far along the catch is. */
  function ringWave(k, big) {
    if (UIFX.reduced()) return;
    const w = document.createElement('i');
    w.className = 'ring-wave' + (big ? ' big' : '');
    w.style.setProperty('--k', k.toFixed(3));
    w.addEventListener('animationend', () => w.remove());
    ui.ring.appendChild(w);
  }

  /* Take the reel away with a flourish: a burst when the fish is landed, a slump when it escapes. */
  function hideReel(kind) {
    clearTimeout(G.reelHideT);
    if (UIFX.reduced()) { ui.reel.hidden = true; return; }
    ui.reel.classList.add(kind);
    if (kind === 'won') { ringWave(1, true); ringWave(1); }
    G.reelHideT = setTimeout(() => { ui.reel.hidden = true; ui.reel.classList.remove('won', 'lost'); ui.ring.style.transform = ''; }, 560);
  }

  function updateHUD() {
    const loc = locById(save.loc), L2 = lvl();
    ui.placeName.textContent = loc.name;
    ui.placeTime.textContent = loc.time;
    ui.lvl.textContent = L2.level;
    ui.xpFill.style.width = (L2.into / L2.need * 100).toFixed(1) + '%';
    ui.xpText.textContent = `${fmt(L2.into)} / ${fmt(L2.need)} XP`;
    ui.sound.setAttribute('aria-pressed', save.sound ? 'true' : 'false');
    ui.sound.setAttribute('aria-label', save.sound ? 'Mute sound' : 'Turn sound on');
    ui.sound.classList.toggle('muted', !save.sound);
    ui.pearls.textContent = fmt(save.pearls);
    ui.pearlBtn.setAttribute('aria-label', `${fmt(save.pearls)} Moonpearls. Open the market`);
    const cap = netCap(), used = save.net.length;
    ui.netCount.textContent = `${used}/${cap}`;
    ui.netBtn.classList.toggle('full', used >= cap);
    const pend = Tank.pending();
    ui.tankDot.hidden = !pend.pearls && !pend.hearts;
    ui.tankDot.classList.toggle('heart', !!pend.hearts);
    ui.tankDot.classList.toggle('full', !pend.hearts && pend.full);
    // a waiting notification glows softly behind its button: pink for new mates, gold for a full sand,
    // moonlight for pearls
    glow(ui.netBtn, pend.hearts ? 'mates' : pend.full ? 'full' : pend.pearls ? 'pearls' : null);
    ui.netBtn.setAttribute('aria-label', `Your ${save.netTier ? 'aquariums' : 'aquarium'}: ${used} of ${cap} fish${used >= cap ? ', full' : ''}${pend.full ? `. ${fmt(pend.value)} Moonpearls are waiting and the sand is full` : pend.pearls ? `. ${fmt(pend.value)} Moonpearls are waiting` : ''}`);
    const bait = activeBait();
    const stocked = BAIT_ORDER.reduce((a, id) => a + (save.bait[id] || 0), 0);
    ui.baitLabel.textContent = bait ? `${BAITS[bait].name} ×${save.bait[bait]}` : stocked ? 'Add bait' : 'No bait';
    ui.baitDot.style.background = bait ? BAITS[bait].color : 'transparent';
    ui.baitBtn.classList.toggle('baited', !!bait);
  }

  function flashWallet() {
    updateHUD();
    bump(ui.pearlBtn);
    ui.pearlBtn.classList.remove('flash');
    void ui.pearlBtn.offsetWidth;
    ui.pearlBtn.classList.add('flash');
  }

  function toast(text, color, ms = 3400) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (color) el.style.setProperty('--tc', color);
    el.textContent = text;
    ui.toasts.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 600); }, ms);
  }

  /* ---------- modals ---------- */
  let revealState = null;
  const catchPending = m => m && m.id === 'm-reveal' && revealState && revealState.mode === 'catch' && G.land && !G.land.decided;

  /* Menus stack: a menu opened over another sends the one beneath back a little, and closing the top
     one brings the one beneath forward again, with focus back where it was. Menus fade and settle both
     in and out.
     A menu opened by a press grows out of the spot that was pressed (the button, or the pearls in the
     wallet), and when it closes it gathers itself back into that button, so every menu feels like part
     of the same scene rather than something laid over it. A catch's card rises from where the fish
     left the water. */
  let lastPress = null;
  document.addEventListener('pointerdown', e => {
    lastPress = { x: e.clientX, y: e.clientY, at: Date.now(), el: e.target.closest && e.target.closest('button, [role="button"], a') };
  }, true);
  // the point a menu grows from: one given, or a lastPress in the last moment
  function originOf(from) {
    if (from && from.getBoundingClientRect) { const r = from.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: from }; }
    if (from && typeof from.x === 'number') return { x: from.x, y: from.y, el: null };
    if (lastPress && Date.now() - lastPress.at < 900) return { x: lastPress.x, y: lastPress.y, el: lastPress.el && lastPress.el.isConnected && !lastPress.el.closest('.modal') ? lastPress.el : null };
    return null;
  }
  const GROW = 'cubic-bezier(.18, .9, .22, 1.04)';
  function growFrom(m, o) {
    const card = m.querySelector('.card');
    if (!card || !o || UIFX.reduced() || !card.animate) return;
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dx = o.x - (r.left + r.width / 2), dy = o.y - (r.top + r.height / 2), s = clamp(56 / Math.max(r.width, r.height), 0.06, 0.4);
    card.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0, borderRadius: '40px' },
      { opacity: 1, offset: 0.35 },
      { transform: 'none', opacity: 1, borderRadius: getComputedStyle(card).borderRadius },
    ], { duration: 460, easing: GROW });
    const bd = m.animate ? m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' }) : null;
    void bd;
  }
  function shrinkTo(m, o) {
    const card = m.querySelector('.card');
    if (!card || !o || UIFX.reduced() || !card.animate) return false;
    // back into the button it came from, wherever that is now
    if (o.el && o.el.isConnected) { const b = o.el.getBoundingClientRect(); if (b.width) o = { x: b.left + b.width / 2, y: b.top + b.height / 2, el: o.el }; }
    const r = card.getBoundingClientRect();
    if (!r.width) return false;
    const dx = o.x - (r.left + r.width / 2), dy = o.y - (r.top + r.height / 2), s = clamp(56 / Math.max(r.width, r.height), 0.06, 0.4);
    card.animate([
      { transform: getComputedStyle(card).transform === 'none' ? 'none' : getComputedStyle(card).transform, opacity: 1 },
      { opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0, borderRadius: '40px' },
    ], { duration: 300, easing: 'cubic-bezier(.5, 0, .75, .4)', fill: 'forwards' });
    return true;
  }
  const modalStack = [];
  function openModal(sel, from) {
    const m = typeof sel === 'string' ? $(sel) : sel;
    clearTimeout(m._closeT);
    m.classList.remove('closing');
    m.getAnimations && m.querySelector('.card') && m.querySelector('.card').getAnimations().forEach(a => a.cancel());
    m._origin = originOf(from);
    const i = modalStack.indexOf(m);
    if (i >= 0) modalStack.splice(i, 1);
    const under = modalStack[modalStack.length - 1];
    m._returnFocus = under ? document.activeElement : null;
    if (under) under.classList.add('behind');
    modalStack.push(m);
    m.style.zIndex = String(20 + modalStack.length);
    m.hidden = false;
    m.classList.toggle('grown', !!m._origin && !UIFX.reduced());
    growFrom(m, m._origin);
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('open')));
    const focusEl = m.querySelector('[data-autofocus]') || m.querySelector('button');
    if (focusEl) setTimeout(() => focusEl.focus({ preventScroll: true }), 60);
  }
  function closeModal(sel, quiet) {
    const m = typeof sel === 'string' ? $(sel) : sel;
    if (m.hidden || m.classList.contains('closing')) return;
    Tank.hideTip();
    const i = modalStack.indexOf(m);
    if (i >= 0) modalStack.splice(i, 1);
    const top = modalStack[modalStack.length - 1];
    if (top) top.classList.remove('behind');
    m.classList.remove('open', 'behind');
    m.classList.add('closing');
    // back where it came from (or, for a catch, into where it went: the aquarium, the wallet, the water)
    const to = m._closeTo !== undefined ? m._closeTo : m._origin;
    m._closeTo = undefined;
    m.classList.toggle('shrunk', shrinkTo(m, to ? Object.assign({}, to) : null));
    const card = m.querySelector('.card');
    m._closeT = setTimeout(() => { m.hidden = true; m.classList.remove('closing', 'shrunk'); m.style.zIndex = ''; if (card) card.getAnimations().forEach(a => a.cancel()); }, UIFX.reduced() ? 0 : 300);
    const back = m._returnFocus;
    if (top && back && top.contains(back)) back.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (m.id === 'm-reveal') afterReveal();
    if (m.id === 'm-intro') { save.intro = true; persist(); unlockAudio(); }
    if (m.id === 'm-shop') { updateHUD(); if (revealOpen()) renderRevealActions(); }
    if (m.id === 'm-tank') { Tank.onClosed(); updateHUD(); if (revealOpen()) renderRevealActions(); }
    if (m.id === 'm-book') Badges.onClosed();
    if (!quiet) Sound.play('click');
  }
  const revealOpen = () => !$('#m-reveal').hidden && revealState && revealState.mode === 'catch';
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('pointerdown', e => { if (e.target === m && m.id !== 'm-intro' && !catchPending(m)) closeModal(m); });
    m.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(m)));
  });

  /* ---------- catch reveal ---------- */
  function openReveal(data, mode, from) {
    const sp = SPECIES[data.id], R = RARITIES[sp.rarity];
    const card = $('#m-reveal .reveal');
    card.style.setProperty('--rc', R.color);
    card.style.setProperty('--rc-soft', FishArt.hexA(R.color, 0.28));
    card.dataset.tier = R.tier;
    $('#rv-rarity').textContent = R.name;
    $('#rv-name').textContent = sp.name;
    const sub = $('#rv-sub');
    sub.textContent = sp.sub || '';
    sub.hidden = !sp.sub;
    const rec = save.caught[data.id] || { n: 0, best: 0, len: 0 };
    const measure = sp.measure || 'Length';
    const cell = (label, value, note) => `<div><dt>${label}</dt><dd>${value}</dd>${note ? `<span class="rv-note">${note}</span>` : ''}</div>`;
    const xpLine = $('#rv-xp');
    if (mode === 'catch') {
      $('#rv-new').hidden = !data.first;
      $('#rv-title').textContent = 'You caught';
      $('#rv-stats').innerHTML =
        cell('Weight', `${data.kg.toFixed(2)} kg`, data.heavier ? 'Heaviest yet' : '') +
        cell(measure, `${Math.round(data.cm)} cm`, data.longer ? 'Longest yet' : '') +
        cell('Worth', pearlsHTML(data.value));
      xpLine.textContent = `+${fmt(data.xp + data.bonus)} XP${data.bonus ? `, including a ${fmt(data.bonus)} XP discovery bonus` : ''}`;
      $('#rv-blurb').textContent = sp.blurb;
    } else {
      $('#rv-new').hidden = true;
      $('#rv-title').textContent = 'Fish journal';
      $('#rv-stats').innerHTML =
        cell('Caught', fmt(rec.n)) +
        cell('Heaviest', `${(rec.best || 0).toFixed(2)} kg`) +
        cell(`Best ${measure.toLowerCase()}`, rec.len ? `${Math.round(rec.len)} cm` : '—');
      xpLine.innerHTML = `${rec.sold ? `Sold ${fmt(rec.sold)}` : 'None sold yet'}${rec.top ? ` · most valuable ${pearlsHTML(rec.top)}` : ''}`;
      const where = whereFound(data.id).map(l => l.name).join(', ');
      $('#rv-blurb').textContent = `${sp.blurb} Found in ${where}.`;
    }
    // a catch flies in from the line (see drawFly), so the card's own fish waits for it, facing the same way
    const fly = mode === 'catch' && G.land && G.land.fly;
    revealState = { id: data.id, t0: G.t, mode, from, fly: !!fly, face: fly ? fly.from.face : 1 };
    renderRevealActions();
    // and its details settle in one after another
    card.classList.remove('arrive');
    if (mode === 'catch') { void card.offsetWidth; card.classList.add('arrive'); }
    // a catch's card grows from where the fish hung on the line
    openModal('#m-reveal', mode === 'catch' && G.land ? onScreen(G.land.openAt || G.land.from) : undefined);
  }

  function renderRevealActions() {
    const box = $('#rv-actions'), note = $('#rv-net');
    if (!revealState || revealState.mode !== 'catch') {
      note.hidden = true;
      const fromJournal = revealState && revealState.from === 'journal' && !$('#m-journal').hidden;
      box.innerHTML = fromJournal
        ? '<button type="button" class="primary-btn" data-rv="close" data-autofocus><svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>Back to journal</button>'
        : '<button type="button" class="primary-btn" data-rv="close" data-autofocus>Close</button>';
      return;
    }
    const Ld = G.land, cap = netCap(), used = save.net.length, full = used >= cap;
    note.hidden = false;
    note.classList.toggle('full', full);
    note.textContent = full
      ? `Your ${save.netTier ? 'aquariums are' : 'aquarium is'} full (${used} of ${cap}). Sell or release this fish, or make room.`
      : `${save.netTier ? 'Aquariums' : 'Aquarium'}: ${used} of ${cap} fish`;
    box.innerHTML = full
      ? `<button type="button" class="primary-btn" data-rv="sell" data-autofocus>Sell · ${pearlsHTML(Ld.value)}</button>
         <button type="button" class="secondary-btn" data-rv="room">Make room</button>
         <button type="button" class="text-btn" data-rv="release">Release</button>`
      : `<button type="button" class="primary-btn" data-rv="keep" data-autofocus>Keep it</button>
         <button type="button" class="secondary-btn" data-rv="sell">Sell · ${pearlsHTML(Ld.value)}</button>
         <button type="button" class="text-btn" data-rv="release">Release</button>`;
    const first = box.querySelector('[data-autofocus]');
    if (first && !$('#m-reveal').hidden && !Shop.isOpen() && !Tank.isOpen) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  $('#rv-actions').addEventListener('click', e => {
    const b = e.target.closest('[data-rv]');
    if (!b) return;
    const act = b.dataset.rv;
    if (act === 'close') { closeModal('#m-reveal'); return; }
    if (act === 'room') { Tank.open({ list: true, all: true }); return; }
    const Ld = G.land;
    if (!Ld || Ld.decided) return;
    endFly();
    if (act === 'keep') {
      if (save.net.length >= netCap()) { renderRevealActions(); return; }
      // Legendary and Extreme catches are starred on the way in, so "Sell all" never parts with them by accident.
      const prized = RARITIES[Ld.rarity].tier >= 3;
      const home = Tank.homeFor();
      save.net.push({ uid: save.uid++, id: Ld.id, kg: Ld.kg, cm: Ld.cm, value: Ld.value, at: Date.now(), fav: prized, seen: false, t: home });
      Badges.note('keep');
      Sound.play('equip');
      if (save.netTier > 0) setTimeout(() => toast(`Your ${SPECIES[Ld.id].name} swims off to the ${TANKS[home].name}.`, '#9fe3b0', 2600), prized ? 4100 : 300);
      if (prized) setTimeout(() => toast(`Your ${SPECIES[Ld.id].name} is starred, so “Sell all unstarred” will leave it alone.`, RARITIES[Ld.rarity].color, 3600), 400);
    } else if (act === 'sell') {
      save.pearls += Ld.value;
      save.stats.earned += Ld.value;
      save.stats.sold += 1;
      save.caught[Ld.id].sold = (save.caught[Ld.id].sold || 0) + 1;
      Badges.note('sale', { n: 1, top: Ld.value });
      Sound.play('coin', 1);
    } else if (act === 'release') {
      save.stats.released += 1;
      Sound.play('release');
    }
    Ld.decided = act;
    persist();
    // the card goes where the fish went: into the aquarium, into the wallet as pearls, or back to the water
    const rv = $('#m-reveal');
    rv._closeTo = act === 'keep' ? originOf(ui.netBtn) : act === 'sell' ? originOf(ui.pearlBtn) : onScreen(Ld.from);
    closeModal('#m-reveal', true);
    const arrive = UIFX.reduced() ? 0 : 290;
    if (act === 'sell') setTimeout(flashWallet, arrive);
    if (act === 'keep') setTimeout(() => { updateHUD(); bump(ui.netBtn); if (!save.aquaShown) { save.aquaShown = true; persist(); callout(ui.netBtn, 'Your fish live here', 'Tap to visit them', 4200); } }, arrive);
  });
  // a little note under a button, for a few seconds
  function callout(btn, text, sub, ms) {
    const r = btn.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'callout';
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    document.body.appendChild(el);
    const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left));
    el.style.left = `${x}px`; el.style.top = `${r.bottom + 10}px`;
    el.style.setProperty('--ax', `${Math.round(r.left + r.width / 2 - x)}px`);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    const gone = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); document.removeEventListener('pointerdown', gone, true); };
    setTimeout(gone, ms);
    document.addEventListener('pointerdown', gone, true);
  }
  // a point on the lake, as a point on the screen
  function onScreen(p) { if (!p) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y, el: null }; }
  // a button takes something in: a little swell and a flash of its glow
  function bump(b) {
    if (!b || UIFX.reduced()) return;
    b.classList.remove('takes'); void b.offsetWidth; b.classList.add('takes');
    clearTimeout(b._takeT); b._takeT = setTimeout(() => b.classList.remove('takes'), 700);
  }

  function drawReveal() {
    const c = ui.rvCanvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const pw = Math.round(w * DPR), ph = Math.round(h * DPR);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const x = c.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, w, h);
    const k = clamp((G.t - revealState.t0) / 0.7, 0, 1);
    // a fish that flew in arrives at full size; otherwise it springs up
    const e = revealState.flown ? 1 : easeOutBack(k);
    x.globalAlpha = Math.min(1, k * 2);
    const cy = h / 2 + Math.sin(G.t * 1.4) * 3;
    FishArt.drawShowcase(x, revealState.id, G.t, w / 2, cy, w * 0.9, h * 0.86, { scale: e, auraR: Math.max(w, h) * 0.62, maskW: w, maskH: h, noFish: true });
    if (!revealState.fly) {
      x.globalAlpha = revealState.flown ? 1 : Math.min(1, k * 2);
      const img = FishGL.render(revealState.id, G.t + (revealState.tOff || 0), w * 0.96 * DPR, h * 0.94 * DPR, { fit: 0.92 });
      const dw = w * 0.96 * e, dh = h * 0.94 * e;
      if (dw > 1 && dh > 1) { x.translate(w / 2, cy); x.scale(revealState.face || 1, 1); x.drawImage(img, -dw / 2, -dh / 2, dw, dh); x.setTransform(DPR, 0, 0, DPR, 0, 0); }
    }
    x.globalAlpha = 1;
  }

  function afterReveal() {
    endFly();
    const st = revealState;
    revealState = null;
    if (!st || st.mode !== 'catch' || !G.land) return;
    const Ld = G.land;
    if (!Ld.decided) {
      // closed without choosing (should not happen): keep it if there is room, otherwise sell it
      if (save.net.length < netCap()) { save.net.push({ uid: save.uid++, id: Ld.id, kg: Ld.kg, cm: Ld.cm, value: Ld.value, at: Date.now(), fav: false, seen: false, t: Tank.homeFor() }); Badges.note('keep'); }
      else { save.pearls += Ld.value; save.stats.earned += Ld.value; save.stats.sold += 1; Badges.note('sale', { n: 1, top: Ld.value }); }
      persist();
    }
    toIdle();
    let delay = 150;
    if (Ld.leveled) {
      setTimeout(() => { toast(`Level ${Ld.leveled} reached`, '#e8c46c'); Sound.play('levelUp'); }, delay);
      delay += 900;
    }
    for (const loc of Ld.unlocks) {
      setTimeout(() => {
        toast(`New waters discovered: ${loc.name}`, '#9fe3b0', 5200);
        Sound.play('unlock');
        $('#btn-place').classList.add('pulse'); glow($('#btn-place'), 'place');
      }, delay);
      delay += 1200;
    }
    // (the first fish kept shows where it went with a note pointing at the aquarium; see the catch card)
  }

  /* ---------- map ---------- */
  function oddsText(loc) {
    const odds = rarityOdds(loc, null);
    return RARITY_ORDER.filter(r => odds[r]).map(r => ({ r, pct: odds[r], label: odds[r] >= 1 ? Math.round(odds[r]) + '%' : odds[r].toFixed(1) + '%' }));
  }

  function buildMap() {
    const root = $('#places');
    root.innerHTML = '';
    const level = lvl().level;
    for (const loc of LOCATIONS) {
      const open = level >= loc.level, here = loc.id === save.loc;
      const card = document.createElement('article');
      card.className = 'place' + (open ? '' : ' locked') + (here ? ' here' : '');
      const odds = oddsText(loc);
      const species = [];
      for (const r of RARITY_ORDER) for (const id in (loc.fish[r] || {})) species.push(id);
      card.innerHTML = `
        <canvas class="place-art" data-loc="${loc.id}" aria-hidden="true"></canvas>
        <div class="place-body">
          <div class="place-head"><h3>${loc.name}</h3><span class="place-when">${loc.time}</span></div>
          <p class="place-blurb">${loc.blurb}</p>
          <div class="odds" role="img" aria-label="Bite odds: ${odds.map(o => `${RARITIES[o.r].name} ${o.label}`).join(', ')}">
            ${odds.map(o => `<i style="flex:${Math.max(o.pct, 1.5)};background:${RARITIES[o.r].color}"></i>`).join('')}
          </div>
          <div class="odds-legend">${odds.filter(o => o.r !== 'common').map(o => `<span><b style="color:${RARITIES[o.r].color}">${RARITIES[o.r].name}</b> ${o.label}</span>`).join('')}</div>
          <div class="chips">${species.map(id => {
            const known = !!save.caught[id];
            return `<span class="chip${known ? '' : ' unknown'}"><i style="background:${RARITIES[SPECIES[id].rarity].color}"></i>${known ? SPECIES[id].name : '???'}</span>`;
          }).join('')}</div>
          <div class="place-foot"></div>
        </div>`;
      const foot = card.querySelector('.place-foot');
      if (here) {
        foot.innerHTML = '<span class="here-pill">You are fishing here</span>';
      } else if (open) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'secondary-btn'; b.textContent = `Travel to ${loc.name}`;
        b.addEventListener('click', () => travel(loc.id));
        foot.appendChild(b);
      } else {
        foot.innerHTML = `<span class="lock-pill"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Opens at level ${loc.level} · ${fmt(Math.max(0, xpToReach(loc.level) - save.xp))} XP to go</span>`;
      }
      root.appendChild(card);
    }
  }

  function openMap() {
    if (!canUseMenus()) return;
    $('#btn-place').classList.remove('pulse'); glow($('#btn-place'), null);
    buildMap();
    openModal('#m-map');
    Sound.play('open');
    requestAnimationFrame(() => document.querySelectorAll('.place-art').forEach(c => Scenes.preview(c, c.dataset.loc, Math.min(2, window.devicePixelRatio || 1))));
  }

  function travel(id) {
    if (id === save.loc) return;
    closeModal('#m-map', true);
    ui.veil.classList.add('on');
    Sound.play('travel');
    setTimeout(() => {
      save.loc = id;
      persist();
      syncScene(true);
      resetShoal();
      Flourish.setLocation(id, G.t);
      if (Sound.ready) Sound.startAmbient(id);
      toIdle();
      ui.veil.classList.remove('on');
      toast(locById(id).blurb, null, 4200);
    }, 650);
  }

  /* ---------- journal ---------- */
  function buildRecords() {
    const r = save.records, s = save.stats;
    const name = id => SPECIES[id].name;
    const cell = (label, value, sub) => `<div><dt>${label}</dt><dd>${value}</dd>${sub ? `<span>${sub}</span>` : ''}</div>`;
    $('#records').innerHTML =
      cell('Fish caught', fmt(save.total)) +
      cell('Fish sold', fmt(s.sold), s.released ? `${fmt(s.released)} released` : '') +
      cell('Moonpearls earned', pearlsHTML(s.earned)) +
      cell('Rarest catch', r.rarest ? `<b style="color:${RARITIES[SPECIES[r.rarest.id].rarity].color}">${RARITIES[SPECIES[r.rarest.id].rarity].name}</b>` : '—', r.rarest ? name(r.rarest.id) : '') +
      cell('Heaviest', r.heaviest ? `${r.heaviest.kg.toFixed(2)} kg` : '—', r.heaviest ? name(r.heaviest.id) : '') +
      cell('Longest', r.longest ? `${Math.round(r.longest.cm)} cm` : '—', r.longest ? name(r.longest.id) : '') +
      cell('Most valuable', r.priciest ? pearlsHTML(r.priciest.value) : '—', r.priciest ? name(r.priciest.id) : '');
  }

  function buildJournal() {
    const root = $('#journal');
    root.innerHTML = '';
    const found = SPECIES_ORDER.filter(id => save.caught[id]).length;
    $('#journal-count').textContent = `${found} of ${SPECIES_ORDER.length} species discovered. Records stay here even after you sell a fish.`;
    buildRecords();
    for (const r of RARITY_ORDER) {
      const ids = SPECIES_ORDER.filter(id => SPECIES[id].rarity === r);
      const sec = document.createElement('section');
      sec.className = 'jgroup';
      sec.style.setProperty('--rc', RARITIES[r].color);
      sec.innerHTML = `<h3><i></i>${RARITIES[r].name}<span>${ids.filter(id => save.caught[id]).length} / ${ids.length}</span></h3><div class="jgrid"></div>`;
      const grid = sec.querySelector('.jgrid');
      for (const id of ids) {
        const rec = save.caught[id];
        const sp = SPECIES[id];
        const card = document.createElement(rec ? 'button' : 'div');
        card.className = 'jcard' + (rec ? '' : ' unknown');
        if (rec) { card.type = 'button'; card.addEventListener('click', () => { Sound.play('open'); openReveal({ id }, 'view', 'journal'); }); }
        card.innerHTML = `<canvas data-fish="${id}" data-known="${rec ? 1 : 0}" aria-hidden="true"></canvas>
          <span class="jname">${rec ? sp.name : '???'}</span>
          <span class="jmeta">${rec ? `×${fmt(rec.n)} · ${(rec.best || 0).toFixed(2)} kg${rec.len ? ` · ${Math.round(rec.len)} cm` : ''}` : `Best odds: ${bestWater(id).name}`}</span>`;
        grid.appendChild(card);
      }
      root.appendChild(sec);
    }
  }

  function drawThumbs() {
    document.querySelectorAll('#journal canvas[data-fish]').forEach(c => {
      const w = c.clientWidth, h = c.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * d); c.height = Math.round(h * d);
      const x = c.getContext('2d');
      x.setTransform(d, 0, 0, d, 0, 0);
      const known = c.dataset.known === '1';
      if (known) {
        FishArt.drawShowcase(x, c.dataset.fish, 0.6, w / 2, h / 2, w * 0.92, h * 0.9, { auraR: Math.max(w, h) * 0.5, maskW: w, maskH: h, noFish: true });
        x.drawImage(FishGL.render(c.dataset.fish, 0.6, w * d, h * d, { still: true, fit: 0.94 }), 0, 0, w, h);
      } else {
        FishArt.drawFitted(x, c.dataset.fish, 0.6, w / 2, h / 2, w * 0.92, h * 0.9);
      }
      if (!known) {
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = 'rgba(150,175,200,0.16)';
        x.fillRect(0, 0, w, h);
        x.globalCompositeOperation = 'source-over';
      }
    });
  }

  /* The water where a single cast is most likely to hook this species. */
  function bestWater(id) {
    const r = SPECIES[id].rarity;
    let best = null, bestP = -1;
    for (const loc of LOCATIONS) {
      const table = loc.fish[r];
      if (!table || !table[id] || !loc.rarity[r]) continue;
      const odds = rarityOdds(loc, null);
      const sTotal = Object.values(table).reduce((a, b) => a + b, 0);
      const pr = odds[r] * (table[id] / sTotal);
      if (pr > bestP) { bestP = pr; best = loc; }
    }
    return best || LOCATIONS[0];
  }

  function openJournal() {
    if (!canUseMenus()) return;
    buildJournal();
    openModal('#m-journal');
    Sound.play('open');
    requestAnimationFrame(drawThumbs);
  }

  const canUseMenus = () => !['bite', 'reeling', 'landing'].includes(G.phase);
  const openShop = tab => { if (canUseMenus()) Shop.open(tab); };

  $('#btn-place').addEventListener('click', openMap);
  $('#btn-journal').addEventListener('click', openJournal);
  $('#btn-shop').addEventListener('click', () => openShop());
  ui.pearlBtn.addEventListener('click', () => openShop());
  ui.netBtn.addEventListener('click', () => Tank.open({ check: true }));
  ui.baitBtn.addEventListener('click', () => openShop('bait'));
  $('#btn-sound').addEventListener('click', () => {
    save.sound = !save.sound;
    persist();
    unlockAudio();
    Sound.setEnabled(save.sound);
    updateHUD();
  });
  ui.reelIn.addEventListener('click', () => { if (G.phase === 'waiting') { Sound.play('click'); startRetrieve(); } });
  $('#intro-go').addEventListener('click', () => closeModal('#m-intro'));

  Flourish.init({
    ripple: (x, y, n, size) => ripple(x, y, n, size),
    splash: (p, size) => splash(p, size),
    play: (name, ...a) => Sound.play(name, ...a),
    pads: () => Scenes.pads(L),
    bob: () => (G.phase === 'reeling' ? G.entry : ['waiting', 'escaped', 'bite'].includes(G.phase) ? bobPos() : { x: L.bob.x, y: L.bob.y }),
    light: Lx => { const pl = Scenes.palette(save.loc).light; return { x: pl.x * Lx.w, y: Lx.horizon - pl.y * Lx.horizon, r: pl.r * Lx.m }; },
  });

  Badges.init({
    get save() { return save; },
    persist: persistRaw,
    level: () => lvl().level,
    play: (name, ...args) => Sound.play(name, ...args),
    openModal,
    canUse: canUseMenus,
    // badges wait while a fish is on the line, and until the welcome card is closed
    busy: () => ['bite', 'reeling'].includes(G.phase) || !$('#m-intro').hidden,
  });

  Sync.init({
    saveKey: SAVE_KEY,
    getSave: () => save,
    levelOf: xp => levelFromXp(xp).level,
    fmt, toast, openModal, closeModal,
    play: (name, ...a) => Sound.play(name, ...a),
    busy: () => ['bite', 'reeling'].includes(G.phase) || (revealState && !$('#m-reveal').hidden),
    // the thank-you for signing in, once
    grant: (n, id) => {
      save.pearls += n;
      if (!save.gifts.includes(id)) save.gifts.push(id);
      persist(); flashWallet(); Sound.play('buy');
      toast(`☁️ Your progress now follows you to every device. Here are ${fmt(n)} Moonpearls to say thank you!`, '#e8c46c', 6000);
    },
  });

  Tank.tipsOn($('#m-book')); Tank.tipsOn($('#m-intro'));

  Shop.init({
    get save() { return save; },
    note: (kind, v) => Badges.note(kind, v),
    persist,
    refresh() { updateHUD(); if (revealOpen()) renderRevealActions(); },
    toast,
    play: (name, ...args) => Sound.play(name, ...args),
    openModal,
    loc: () => locById(save.loc),
    netCap,
    openTank: t => Tank.open({ check: true, tank: t }),
    level: () => lvl().level,
    perks: gearPerks,
    time: () => G.t,
    flashWallet,
  });

  Tank.init({
    get save() { return save; },
    note: (kind, v) => Badges.note(kind, v),
    persist,
    refresh() { updateHUD(); if (revealOpen()) renderRevealActions(); },
    toast,
    play: (name, ...args) => Sound.play(name, ...args),
    openModal,
    flashWallet,
    canUse: canUseMenus,
    openShop: tab => { closeModal('#m-tank'); setTimeout(() => openShop(tab), 320); },
  });

  /* ================= Sizing + loop ================= */
  function resize() {
    const was = L && { W, H, hor: L.horizon };
    W = window.innerWidth; H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    DPR = Math.max(1, Math.min(dpr, 2, qual.dpr, Math.sqrt(4.2e6 / Math.max(1, W * H))));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    L = Scenes.layout(W, H);
    if (GLON) {
      const want = coarse ? Math.min(dpr, 1.5) : Math.min(dpr, 1.75);
      glScale = Math.min(qual.gl, Math.max(0.75, Math.min(want, Math.sqrt(3.0e6 / Math.max(1, W * H)))));
      dynScale = Math.min(1, glScale);
      WaterGL.resize(W * glScale, H * glScale);
    }
    syncScene(true);
    // the fish below keep their places on the water
    if (!was) resetShoal();
    else {
      const mapX = x => (x / was.W) * W, mapY = y => L.horizon + ((y - was.hor) / Math.max(1, was.H - was.hor)) * (H - L.horizon);
      for (const S of SHOAL) { S.x = mapX(S.x); S.y = mapY(S.y); S.gx = mapX(S.gx); S.gy = mapY(S.gy); }
    }
  }
  window.addEventListener('resize', resize);

  /* Keep the painted scenery in step with the renderer in use (GPU, or 2D after a lost context). */
  function syncScene(force) {
    const useGL = GLON && WaterGL.ok;
    const rebuilt = Scenes.ensure(save.loc, W, H, useGL ? glScale : DPR, useGL);
    if (useGL && (rebuilt || force || sceneGL !== true)) WaterGL.setScene(Scenes.bg, Scenes.mask, Scenes.glMeta(L));
    sceneGL = useGL;
  }
  function sceneMode() {
    const useGL = GLON && WaterGL.ok;
    if (useGL !== sceneGL) syncScene(true);
    waterCanvas.hidden = !useGL;
    return useGL;
  }

  /* Adaptive quality: if the game keeps missing ~42 fps, it renders the GPU scene at a lower resolution,
     then the 2D canvas (the only canvas without WebGL); from the second step down, the snow thins a
     little and the live sky layer is refreshed every other frame. Each step waits two seconds to see. */
  const perf = { acc: 0, n: 0, lowered: 0 };
  function governQuality(rawDt) {
    // (not while the aquarium is open: it covers the lake, and its own cost is not the lake's)
    if (document.hidden || Tank.isOpen || rawDt <= 0 || rawDt > 0.25) return;
    perf.acc += rawDt; perf.n += 1;
    if (perf.acc < 2) return;
    const avg = perf.acc / perf.n;
    perf.acc = 0; perf.n = 0;
    if (avg <= 1 / 42 || perf.lowered >= 7) return;
    if (GLON && WaterGL.ok && glScale > 0.72) qual.gl = Math.max(0.7, glScale * 0.82);
    else if (DPR > 1.05) qual.dpr = Math.max(1, DPR * 0.8);
    else return;
    perf.lowered += 1;
    Scenes.lite = perf.lowered >= 2;
    resize();
  }

  let last = performance.now();
  function frame(now) {
    // the next frame is queued first, so an error anywhere below can never stop the game
    requestAnimationFrame(frame);
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, raw);
    governQuality(raw);
    last = now;
    G.t += dt; G.pt += dt;
    update(dt);
    // the aquarium fills the screen while it is open, so the lake behind it can rest
    if (!Tank.isOpen) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      render();
    }
    // (the flight first: the frame it lands in, the card draws its own fish)
    if (G.land && G.land.fly) drawFly();
    if (revealState && !$('#m-reveal').hidden) drawReveal();
    if (Shop.isOpen()) Shop.paint(G.t);
    Tank.frame(dt);
  }

  /* ================= Dev helpers (console or #dev) ================= */
  window.Tidesong = {
    flourish(name) { return Flourish.trigger(name, L, G.t); },
    hook(id) { if (SPECIES[id]) { G.forced = id; return `Next bite: ${SPECIES[id].name}`; } return 'Unknown species'; },
    /* aim the next cast: at a point on the water (fx across, fy from the horizon down), or at the first thing floating on it */
    aim(fx, fy) {
      if (fx === undefined) { const o = Scenes.obstacles(L, G.t).find(q => q.x > W * 0.3 && q.x < W * 0.92); if (!o) return 'Nothing on this water to aim at'; fx = o.x / W; fy = (o.y - L.horizon) / (H - L.horizon); }
      G.aim = [fx, fy]; return `Next cast lands at ${fx.toFixed(2)}, ${fy.toFixed(2)}`;
    },
    // win the fight on the line now (to see a landing)
    land() { if (G.phase === 'reeling' && G.reel) { G.reel.progress = 2; return 'Landing'; } return 'No fish on the line'; },
    hookRarity(r) { const ids = SPECIES_ORDER.filter(id => SPECIES[id].rarity === r); if (ids.length) G.forced = ids[Math.floor(Math.random() * ids.length)]; return G.forced; },
    addXp(n) { save.xp += n; persist(); updateHUD(); },
    addPearls(n) { save.pearls += n; persist(); updateHUD(); },
    unlockAll() { save.xp = Math.max(save.xp, xpToReach(Gear.TOP_LEVEL)); persist(); updateHUD(); },
    reset() { save = fresh(); persist(); location.reload(); },
    badges(ids) { Badges.grant(ids); return `${Object.keys(save.ach.got).length} badges earned`; },
    nudgeNow(kind) { const N = NUDGES[kind]; if (N && N.st) { N.st.wait = 0; nudgeAt = -1e9; } },
    get state() { return { t: G.t, phase: G.phase, save: JSON.parse(JSON.stringify(save)), reel: G.reel && { progress: G.reel.progress, band: G.reel.band.x, width: G.reel.band.w, mods: G.reel.mods, fish: G.reel.fish.shown, inBand: G.reel.inBand, el: G.reel.el, best: G.reel.best, strain: G.reel.strain }, shadow: FS && { ...FS }, shoal: SHOAL.map(S => ({ x: S.x, y: S.y, k: +S.k.toFixed(3), mode: S.mode, alpha: +S.alpha.toFixed(3), taker: S.taker })), wait: G.wait && { eager: G.wait.eager, spooked: G.wait.spooked, taker: !!G.wait.taker, next: G.wait.next && { id: G.wait.next.id, cm: G.wait.next.fish.cm } }, lastBite: G.lastBite, bob: G.phase === 'reeling' ? { ...G.entry } : bobPos(), tip: rodTip(), cast: G.cast && { k: G.cast.k, struck: G.cast.obj ? G.cast.obj.kind : null, hit: G.cast.hit ? G.cast.hit.t : -1 } }; },
  };
  /* ================= Gifts =================
     A link to the game with ?gift=<id> grants that gift once per save: the claim is written into the
     save, so opening the link again does nothing. claim/index.html is a page with its own link preview
     that forwards here. Unknown gifts are ignored; `until` (a date) closes a gift. */
  const GIFTS = {
    playtest500: { pearls: 500, note: 'Thank you for playtesting Tidesong! 500 Moonpearls are in your purse.' },
    decor300: { pearls: 300, note: 'NEW: decorations for your tanks! 300 Moonpearls are in your purse: find the decorations in the market\'s Decor tab.' },
  };
  (function claimGift() {
    const q = new URLSearchParams(location.search), id = q.get('gift');
    if (!id) return;
    q.delete('gift');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
    const gift = GIFTS[id];
    if (!gift) return;
    if (!Array.isArray(save.gifts)) save.gifts = [];
    if (save.gifts.includes(id)) { setTimeout(() => toast(`You already have the ${fmt(gift.pearls)} Moonpearls from this link. Thank you again!`, '#9fe3b0', 4000), 900); return; }
    if (gift.until && Date.now() > Date.parse(gift.until)) { setTimeout(() => toast('This gift has ended. Thank you for playing!', '#9fe3b0', 4000), 900); return; }
    save.gifts.push(id);
    save.pearls += gift.pearls;
    persist();
    updateHUD();
    setTimeout(() => { toast(`🎁 ${gift.note}`, '#e8c46c', 6500); flashWallet(); }, 900);
  })();

  if (location.hash === '#dev') {
    window.Tidesong.unlockAll();
    const bar = $('#devbar');
    bar.hidden = false;
    bar.querySelectorAll('button[data-r]').forEach(b => b.addEventListener('click', () => { window.Tidesong.hookRarity(b.dataset.r); toast(`Next bite will be ${RARITIES[b.dataset.r].name}`, RARITIES[b.dataset.r].color, 1800); }));
    bar.querySelector('[data-pearls]').addEventListener('click', () => { window.Tidesong.addPearls(50000); flashWallet(); });
  }

  /* ================= Boot ================= */
  resize();
  Flourish.setLocation(save.loc, 0);
  updateHUD();
  toIdle();
  if (!save.intro) { openModal('#m-intro'); Sync.warm(); }
  if (save.marketGift) {
    const gift = save.marketGift;
    delete save.marketGift;
    persist();
    setTimeout(() => toast(`The Driftwood Market has opened. Your earlier catches sold for ${fmt(gift)} Moonpearls.`, '#e8c46c', 6000), 1200);
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
