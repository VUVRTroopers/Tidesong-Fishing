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
  let W = 0, H = 0, DPR = 1, L = null;

  /* ================= Save ================= */
  const SAVE_KEY = 'tidesong.save.v1';
  const fresh = () => ({
    v: 2, xp: 0, loc: 'mistwillow', caught: {}, total: 0, sound: true, intro: false,
    pearls: 0, net: [], netTier: 0, uid: 1,
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
    s.netTier = clamp(s.netTier | 0, 0, NET_TIERS.length - 1);
    return s;
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  let save = load();

  const locById = id => LOCATIONS.find(l => l.id === id) || LOCATIONS[0];
  const lvl = () => levelFromXp(save.xp);
  const isUnlocked = loc => lvl().level >= loc.level;
  const xpToReach = level => { let s = 0; for (let i = 1; i < level; i++) s += xpForLevel(i); return s; };
  const netCap = () => NET_TIERS[save.netTier].cap;
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
    forced: null, rippleT: 0, baitRanOut: null, fullWarnAt: -99,
    pend: { a: 0, v: 0 }, tipPrev: null, tipVel: { x: 0, y: 0 }, flex: 0, flexV: 0, bobDip: 0, prevFishV: 0,
  };
  const STEP = 1 / 120;
  const FSQ = 0.6; // how much the fish below is foreshortened, seen from the shore
  const FS = { x: 0, y: 0, a: 0, alpha: 0, depth: 0.85, phase: 0, swing: 0.3, orbit: 0, rad: 0, ph: '', bolt: 0 }; // the fish below
  let lit = Gear.STUDIO; // the lake's light for gear and the leaping fish

  /* ================= Interface refs ================= */
  const ui = {
    prompt: $('#prompt'), reelIn: $('#btn-reelin'), reel: $('#reel'), band: $('#band'), marker: $('#marker'),
    ringFill: $('#ring-fill'), ringNotch: $('#ring-notch'), reelHint: $('#reel-hint'),
    placeName: $('#place-name'), placeTime: $('#place-time'), lvl: $('#lvl-num'), xpFill: $('#xp-fill'), xpText: $('#xp-text'),
    sound: $('#btn-sound'), toasts: $('#toasts'), veil: $('#veil'), rvCanvas: $('#rv-canvas'),
    pearls: $('#pearl-count'), pearlBtn: $('#btn-pearls'), netBtn: $('#btn-net'), netCount: $('#net-count'),
    baitBtn: $('#btn-bait'), baitLabel: $('#bait-label'), baitDot: $('#bait-dot'),
  };
  const RING_C = 2 * Math.PI * 50;
  ui.ringFill.style.strokeDasharray = RING_C.toFixed(2);
  ui.ringNotch.setAttribute('transform', `rotate(${REEL_ESCAPE * 360} 60 60)`);
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const CAST_TEXT = coarse ? 'Tap anywhere to cast' : 'Click anywhere or press Space to cast';
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
    press();
    e.preventDefault();
  });
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

  function press() {
    if (modalOpen()) return;
    if (G.phase === 'idle') cast();
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
    const f = G.reel ? G.reel.fish.shown : 0.5;
    const span = Math.min(W * 0.6, 620);
    const cx = clamp(L.bob.x, span / 2 + 24, W - span / 2 - 24);
    return { x: cx - span / 2 + f * span, y: L.bob.y + Math.sin(G.t * 3.1) * 2 };
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

  function cast() {
    setPhase('casting');
    const wh = H - L.horizon;
    G.cast = {
      to: { x: clamp(L.bob.x + rand(-0.07, 0.07) * W, W * 0.3, W * 0.9), y: L.bob.y + rand(-0.05, 0.06) * wh },
      launched: false, lt: 0, k: 0, from: null,
    };
    Sound.play('cast');
    setPrompt('');
    ui.prompt.classList.remove('breathe');
    if (save.net.length >= netCap() && G.t - G.fullWarnAt > 25) {
      G.fullWarnAt = G.t;
      toast('Your keepnet is full. Sell a few fish at the market to keep new catches.', '#ff8c7c', 3800);
    }
  }

  function landBobber() {
    const to = G.cast.to;
    G.bob.fx = to.x / W;
    G.bob.fy = (to.y - L.horizon) / (H - L.horizon);
    G.bob.nib = 0;
    Sound.play('plop');
    ripple(to.x, to.y, 3, 1.2);
    for (let i = 0; i < 6; i++) G.drops.push({ x: to.x, y: to.y, vx: rand(-60, 60), vy: -rand(80, 170), t: 0, floor: to.y + 2, r: rand(1, 2) });
    setPhase('waiting');
    G.wait = { tick: 0, min: rand(1.0, 1.8), nibCool: rand(1, 2) };
    setPrompt('Waiting for a bite…');
    ui.reelIn.hidden = false;
  }

  function nibble() {
    G.bob.nib = 0.36;
    Sound.play('nibble');
    const p = bobPos(); ripple(p.x, p.y, 1, 0.7);
  }

  function bite() {
    const loc = locById(save.loc);
    const bait = activeBait();
    if (bait) {
      save.bait[bait] -= 1;
      if (save.bait[bait] <= 0) { save.bait[bait] = 0; save.equip.bait = null; G.baitRanOut = bait; }
      persist();
      updateHUD();
    }
    let id, rarity;
    if (G.forced) {
      id = G.forced; rarity = SPECIES[id].rarity; G.forced = null;
    } else {
      rarity = weightedPick(baitedWeights(loc, bait));
      id = weightedPick(loc.fish[rarity]);
    }
    G.hooked = { id, rarity };
    setPhase('bite');
    ui.reelIn.hidden = true;
    splash(bobPos(), 1);
    // The same cue for every fish: rarity shows only in how hard it fights.
    Sound.play('bite');
    buzz(40);
    G.flexV += L.m * 1.4;
    setPrompt('Fish on!');
  }

  function startReel() {
    const D = REEL[G.hooked.rarity], P = gearPerks();
    setPhase('reeling');
    G.reel = {
      mods: P,
      band: { x: 0.5, v: 0, w: D.band * P.band },
      fish: { p: 0.5, v: 0, target: 0.5, k: D.stiff[0], timer: 0.45, mode: 'move', ph1: rand(0, TAU), ph2: rand(0, TAU), shown: 0.5, tt: 0, anchor: 0.5 },
      progress: REEL_START, inBand: true, el: 0, splashT: 0,
    };
    G.acc = 0;
    G.entry = bobPos();
    setPrompt('');
    ui.reelHint.hidden = save.total >= 3;
    ui.reel.classList.toggle('perk-band', P.heir.rod);
    ui.reel.classList.toggle('perk-meter', P.heir.bobber || P.heir.line);
    ui.reel.hidden = false;
    updateReelUI();
    Sound.startReel();
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
    if (R.inBand) R.progress += D.fill * R.mods.fill * dt;
    else if (R.el > REEL_GRACE) R.progress -= D.drain * R.mods.drain * dt;
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
    Sound.stopReel();
    const { id, rarity } = G.hooked;
    const R = RARITIES[rarity];
    const fish = rollFish(id);
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
      dir: from.x > W * 0.5 ? -1 : 1,
    };
    ui.reel.hidden = true;
    setPhase('landing');
    splash(from, 1.6);
    buzz(30);
  }

  function escapeFish() {
    Sound.stopReel();
    Sound.play('escape');
    const p = { ...G.entry };
    splash(p, 1);
    G.bob.fx = p.x / W;
    G.bob.fy = (p.y - L.horizon) / (H - L.horizon);
    ui.reel.hidden = true;
    setPhase('escaped');
    setPrompt('It got away…');
  }

  function startRetrieve() {
    G.retrieve = { from: bobPos() };
    setPhase('retrieving');
    ui.reelIn.hidden = true;
    setPrompt('');
  }

  function toIdle() {
    setPhase('idle');
    G.hooked = null; G.reel = null; G.land = null; G.cast = null;
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
     A dark shape under the surface, the same for every fish so it gives nothing away. It lurks and circles
     the float while you wait, noses in on a nibble, strikes on the bite, swims with the fight and bolts if it
     escapes. Headings are on the water plane; seen from the shore its depth axis is squashed (FSQ). */
  const shadowLen = () => L.m * 0.16 * (0.55 + 0.6 * clamp((FS.y - L.horizon) / (H - L.horizon), 0, 1));
  const MOUTH = () => L.m * 0.018; // the mouth sits a little under (so lower on screen than) where the line enters
  function shadowHead() { const len = shadowLen() * 0.45; return { x: FS.x + Math.cos(FS.a) * len, y: FS.y + Math.sin(FS.a) * len * FSQ }; }
  function updateFishShadow(dt) {
    const F = FS, p = G.phase, r = bobR();
    if (p !== F.ph) {
      if (p === 'escaped') F.bolt = F.a + rand(-0.5, 0.5);
      F.ph = p;
    }
    let tx = F.x, ty = F.y, ta = F.a, alphaT = 0, depthT = 0.85, swingT = 0.3, beat = 1.2, follow = 4, fade = 2;
    const len = shadowLen();
    if (p === 'waiting' || p === 'bite') {
      const c = bobPos(), nib = p === 'bite' ? 1 : G.bob.nib > 0 ? 1 : 0;
      if (p === 'bite' || G.pt > 1.4) alphaT = p === 'bite' ? 0.62 : nib ? 0.42 : 0.3;
      if (F.alpha < 0.01 && alphaT > 0) { F.orbit = rand(0, TAU); F.rad = L.m * 0.13; }
      const radT = nib ? len * 0.5 : L.m * (0.075 + 0.015 * Math.sin(G.t * 0.4));
      F.rad += (radT - F.rad) * (1 - Math.exp(-dt * (nib ? 7 : 0.6)));
      F.orbit += dt * (nib ? 0.08 : 0.36);
      tx = c.x + Math.cos(F.orbit) * F.rad; ty = c.y + r * 0.3 + MOUTH() + Math.sin(F.orbit) * F.rad * FSQ;
      ta = F.orbit + (nib ? Math.PI : Math.PI / 2);
      depthT = p === 'bite' ? 0.22 : nib ? 0.45 : 0.85;
      swingT = p === 'bite' ? 0.9 : nib ? 0.6 : 0.3; beat = p === 'bite' ? 6 : nib ? 3 : 1.2;
      if (F.alpha < 0.01) { F.x = tx; F.y = ty; F.a = ta; }
    } else if (p === 'reeling' && G.reel) {
      const v = G.reel.fish.v;
      ta = (G.facing > 0 ? 0 : Math.PI) + Math.sin(G.t * 1.3) * 0.25 + clamp(v, -1, 1) * 0.15 * G.facing;
      tx = G.entry.x - Math.cos(F.a) * len * 0.45; ty = G.entry.y + MOUTH() - Math.sin(F.a) * len * 0.45 * FSQ;
      alphaT = 0.68; depthT = 0.3; swingT = 0.35 + 0.5 * Math.min(1, Math.abs(v)); beat = 3 + 9 * Math.min(1, Math.abs(v)); follow = 12;
    } else if (p === 'escaped' && G.pt < 1.2) {
      ta = F.bolt;
      const sp = L.m * 0.55 * dt;
      tx = F.x + Math.cos(F.a) * sp; ty = F.y + Math.sin(F.a) * sp * FSQ; follow = 60;
      alphaT = 0; depthT = 1; swingT = 0.9; beat = 7; fade = 1.8;
    } else if (p === 'landing') fade = 9;
    const k = 1 - Math.exp(-dt * follow);
    F.x += (tx - F.x) * k; F.y += (ty - F.y) * k;
    const da = ((ta - F.a) % TAU + TAU * 1.5) % TAU - Math.PI;
    F.a += da * (1 - Math.exp(-dt * (p === 'reeling' ? 5 : 4)));
    F.alpha += (alphaT - F.alpha) * (1 - Math.exp(-dt * fade));
    F.depth += (depthT - F.depth) * (1 - Math.exp(-dt * 3));
    F.swing += (swingT - F.swing) * (1 - Math.exp(-dt * 4));
    F.phase = (F.phase + dt * beat * TAU * 0.5) % (TAU * 100);
  }
  function fishUniforms() {
    const F = FS;
    if (F.alpha < 0.005) return { fishB: [0, 0, 0, 0] };
    return { fish: [F.x / W, F.y / H, shadowLen() / H, F.a], fishB: [F.alpha, F.phase, F.depth, F.swing] };
  }

  /* ================= Update ================= */
  function update(dt) {
    Scenes.update(dt, L, G.t);
    for (const r of G.ripples) r.t += dt;
    G.ripples = G.ripples.filter(r => r.t < r.life);
    for (const d of G.drops) { d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.t += dt; }
    G.drops = G.drops.filter(d => !(d.vy > 0 && d.y > d.floor) && d.t < 2.5);

    if (!modalOpen() || G.phase === 'landing') updatePhase(dt);
    animateRod(dt);
    physics(dt);
    updateFishShadow(dt);
    Flourish.update(dt, L, G.t);
  }

  function updatePhase(dt) {
    switch (G.phase) {
      case 'casting': {
        const C = G.cast;
        if (!C.launched && G.pt >= 0.3) { C.launched = true; C.from = rodTip(); }
        if (C.launched) {
          C.lt += dt;
          C.k = clamp(C.lt / 0.62, 0, 1);
          if (C.k >= 1) landBobber();
        }
        G.spin += dt * 20;
        break;
      }
      case 'waiting': {
        const Wt = G.wait, loc = locById(save.loc), bait = activeBait();
        if (G.bob.nib > 0) G.bob.nib = Math.max(0, G.bob.nib - dt);
        G.rippleT -= dt;
        if (G.rippleT <= 0) { const p = bobPos(); ripple(p.x, p.y, 1, 0.55); G.rippleT = rand(1.4, 2.4); }
        Wt.tick += dt;
        while (Wt.tick >= 0.1 && G.phase === 'waiting') {
          Wt.tick -= 0.1;
          // rolling chance of a bite that grows the longer the line sits; bait brings bites sooner
          if (G.pt > Wt.min) {
            const chance = (0.008 + 0.006 * (G.pt - Wt.min)) * loc.bite * (bait ? BAITS[bait].bite : 1);
            if (Math.random() < chance) { bite(); break; }
          }
          Wt.nibCool -= 0.1;
          if (G.pt > 0.8 && Wt.nibCool <= 0 && Math.random() < 0.035) { nibble(); Wt.nibCool = rand(1.2, 2.6); }
        }
        break;
      }
      case 'bite':
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
        Sound.updateReel(dt, {
          inBand: R.inBand, progress: R.progress, holding: holding(),
          danger: clamp(1 - (R.progress - REEL_ESCAPE) / 0.18, 0, 1),
          speed: clamp(Math.abs(R.fish.v), 0, 1), fishPos: R.fish.shown,
        });
        updateReelUI();
        if (R.progress >= 1) landFish();
        else if (R.progress < REEL_ESCAPE && R.el > REEL_GRACE) escapeFish();
        break;
      }
      case 'landing':
        if (!G.land.shown && G.pt >= 0.72) {
          G.land.shown = true;
          Sound.play('landed', G.land.rarity);
          openReveal(G.land, 'catch');
        }
        break;
      case 'escaped':
        if (G.pt >= 1.3) startRetrieve();
        break;
      case 'retrieving':
        G.spin += dt * 22;
        if (G.pt >= 0.45) toIdle();
        break;
    }
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
      case 'landing': bend = 0.25 * Math.max(0, 1 - G.pt * 2); swing = -0.08 * Math.max(0, 1 - G.pt * 1.5); break;
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
      WaterGL.render({ t: G.t, dyn: Scenes.renderDyn(L, G.t, dynScale), ripples: rippleUniforms(), bob: bobUniform(), ...fishUniforms() });
      ctx.clearRect(0, 0, W, H);
      Scenes.drawSurface(ctx, L, G.t);
    } else {
      Scenes.drawBack(ctx, L, G.t);
      drawShadow();
      drawRipples();
    }
    Flourish.draw(ctx, 'water', L, G.t);
    drawLine(gpu);
    drawDrops();
    if (G.phase === 'landing') drawLeap();
    Scenes.drawFront(ctx, L, G.t);
    Gear.paintRod(ctx, save.equip.rod, L.rodBase, rodTip(), G.rodBend, G.t, L.m, G.spin, { light: lit, line: save.equip.line });
    Scenes.drawAir(ctx, L, G.t);
    Flourish.draw(ctx, 'front', L, G.t);
    if (G.phase === 'bite') drawBiteMark();
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
    if (G.phase === 'waiting' || G.phase === 'escaped') { const p = bobPos(); return [p.x / W, (p.y + bobR() * 0.3) / H, 1, (bobR() * 1.5) / H]; }
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
    for (const d of G.drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); }
  }

  /* The fish below, in the 2D fallback (the GPU water draws it itself, under the surface). */
  function drawShadow() {
    const F = FS;
    if (F.alpha < 0.01) return;
    const len = shadowLen();
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

  const bobTop = () => ((Gear.BOB[save.equip.bobber] || {}).top || 2) * bobR();
  const drawBobber = (x, y, inWater, dip) => Gear.bobberFX(ctx, save.equip.bobber, x, y, bobR(), G.t, { inWater, dip, light: lit, dpr: DPR, refl: (Scenes.palette(save.loc) || {}).refl ?? 0.5 });
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
      case 'idle': case 'landing': {
        if (G.phase === 'landing' && G.pt < 0.9) { line(tip, G.land.from, 0); break; }
        const d = dangle(tip); line(tip, { x: d.x, y: d.y - bobTop() }, 0); drawBobber(d.x, d.y, false, 0);
        break;
      }
      case 'casting': {
        const C = G.cast;
        if (!C.launched) { const d = dangle(tip); line(tip, { x: d.x, y: d.y - bobTop() }, 0); drawBobber(d.x, d.y, false, 0); break; }
        const k = C.k, from = C.from, to = C.to;
        const x = lerp(from.x, to.x, easeOut(k)), y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * H * 0.16;
        line(tip, { x, y: y - bobTop() }, L.m * 0.02 * k);
        drawBobber(x, y, false, 0);
        break;
      }
      case 'waiting': case 'escaped': {
        const p = bobPos(), r = bobR();
        const dip = G.bobDip;
        line(tip, { x: p.x, y: p.y - bobTop() + dip * 0.5 }, L.m * 0.05);
        if (G.phase === 'waiting') drawBaitGlow(p);
        drawBobber(p.x, p.y, true, dip);
        break;
      }
      case 'bite': {
        const p = bobPos(), r = bobR();
        const dip = Math.min(1, G.pt / 0.12) * r * 2.6 + Math.sin(G.t * 30) * r * 0.2;
        line(tip, { x: p.x, y: p.y + dip * 0.4 }, 0);
        drawBobber(p.x, p.y, true, dip);
        break;
      }
      case 'reeling': {
        const e = G.entry, r = bobR();
        const quiver = Math.sin(G.t * 47) * 0.6;
        // under the surface the line runs on, faint and bent by the water, down to the fish
        const hd = shadowHead();
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

  function drawLeap() {
    const Ld = G.land, k = clamp(G.pt / 0.95, 0, 1);
    if (k >= 1) return;
    const tier = RARITIES[Ld.rarity].tier;
    const x = Ld.from.x + Ld.dir * W * 0.08 * k;
    const y = Ld.from.y - Math.sin(k * Math.PI) * H * 0.2;
    const vy = -Math.cos(k * Math.PI);
    const size = L.m * (0.16 + tier * 0.025);
    ctx.save();
    ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    if (G.pt < 0.72 && FishGL.ok) {
      ctx.translate(x, y); ctx.rotate(Ld.dir * vy * 0.6);
      if (tier >= 2) FishArt.aura(ctx, Ld.rarity, G.t, size * 0.8);
      if (Ld.dir < 0) ctx.scale(-1, 1);
      const img = FishGL.render(Ld.id, G.t, size * DPR, size * 0.7 * DPR, { fit: 1, light: lit });
      ctx.drawImage(img, -size / 2, -size * 0.35, size, size * 0.7);
    } else {
      FishArt.drawFitted(ctx, Ld.id, G.t, x, y, size, size * 0.7, { rotate: Ld.dir * vy * 0.6, flip: Ld.dir < 0, aura: tier >= 2, auraR: size * 0.8 });
    }
    ctx.restore();
  }

  function drawBiteMark() {
    const p = bobPos();
    const k = clamp(G.pt / 0.25, 0, 1), s = easeOutBack(k);
    const r = Math.max(13, L.m * 0.028) * s;
    const y = p.y - L.m * 0.09;
    ctx.save();
    ctx.translate(p.x, y);
    ctx.fillStyle = 'rgba(232,196,108,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8c46c';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16202c';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-r * 0.13, -r * 0.62, r * 0.26, r * 0.78, r * 0.13); else ctx.rect(-r * 0.13, -r * 0.62, r * 0.26, r * 0.78); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r * 0.4, r * 0.15, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ================= Interface ================= */
  function setPrompt(text) {
    ui.prompt.textContent = text;
    ui.prompt.classList.toggle('empty', !text);
  }

  function updateReelUI() {
    const R = G.reel;
    if (!R) return;
    ui.band.style.left = ((R.band.x - R.band.w / 2) * 100).toFixed(3) + '%';
    ui.band.style.width = (R.band.w * 100).toFixed(3) + '%';
    ui.marker.style.left = (R.fish.shown * 100).toFixed(3) + '%';
    ui.ringFill.style.strokeDashoffset = (RING_C * (1 - clamp(R.progress, 0, 1))).toFixed(2);
    ui.reel.classList.toggle('in', R.inBand);
    ui.reel.classList.toggle('danger', !R.inBand && R.progress < REEL_ESCAPE + 0.09);
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
    ui.netBtn.setAttribute('aria-label', `Keepnet ${used} of ${cap}${used >= cap ? ', full' : ''}. Open the market to sell fish`);
    const bait = activeBait();
    const stocked = BAIT_ORDER.reduce((a, id) => a + (save.bait[id] || 0), 0);
    ui.baitLabel.textContent = bait ? `${BAITS[bait].name} ×${save.bait[bait]}` : stocked ? 'Add bait' : 'No bait';
    ui.baitDot.style.background = bait ? BAITS[bait].color : 'transparent';
    ui.baitBtn.classList.toggle('baited', !!bait);
  }

  function flashWallet() {
    updateHUD();
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
     in and out. */
  const modalStack = [];
  function openModal(sel) {
    const m = typeof sel === 'string' ? $(sel) : sel;
    clearTimeout(m._closeT);
    m.classList.remove('closing');
    const i = modalStack.indexOf(m);
    if (i >= 0) modalStack.splice(i, 1);
    const under = modalStack[modalStack.length - 1];
    m._returnFocus = under ? document.activeElement : null;
    if (under) under.classList.add('behind');
    modalStack.push(m);
    m.style.zIndex = String(20 + modalStack.length);
    m.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('open')));
    const focusEl = m.querySelector('[data-autofocus]') || m.querySelector('button');
    if (focusEl) setTimeout(() => focusEl.focus({ preventScroll: true }), 60);
  }
  function closeModal(sel, quiet) {
    const m = typeof sel === 'string' ? $(sel) : sel;
    if (m.hidden || m.classList.contains('closing')) return;
    const i = modalStack.indexOf(m);
    if (i >= 0) modalStack.splice(i, 1);
    const top = modalStack[modalStack.length - 1];
    if (top) top.classList.remove('behind');
    m.classList.remove('open', 'behind');
    m.classList.add('closing');
    m._closeT = setTimeout(() => { m.hidden = true; m.classList.remove('closing'); m.style.zIndex = ''; }, UIFX.reduced() ? 0 : 280);
    const back = m._returnFocus;
    if (top && back && top.contains(back)) back.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (m.id === 'm-reveal') afterReveal();
    if (m.id === 'm-intro') { save.intro = true; persist(); unlockAudio(); }
    if (m.id === 'm-shop') { updateHUD(); if (revealOpen()) renderRevealActions(); }
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
    revealState = { id: data.id, t0: G.t, mode, from };
    renderRevealActions();
    openModal('#m-reveal');
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
      ? `Your keepnet is full (${used} of ${cap}). Sell or release this fish, or make room in your net.`
      : `Keepnet: ${used} of ${cap} slots used`;
    box.innerHTML = full
      ? `<button type="button" class="primary-btn" data-rv="sell" data-autofocus>Sell · ${pearlsHTML(Ld.value)}</button>
         <button type="button" class="secondary-btn" data-rv="room">Make room</button>
         <button type="button" class="text-btn" data-rv="release">Release</button>`
      : `<button type="button" class="primary-btn" data-rv="keep" data-autofocus>Keep it</button>
         <button type="button" class="secondary-btn" data-rv="sell">Sell · ${pearlsHTML(Ld.value)}</button>
         <button type="button" class="text-btn" data-rv="release">Release</button>`;
    const first = box.querySelector('[data-autofocus]');
    if (first && !$('#m-reveal').hidden && (!Shop.isOpen())) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  $('#rv-actions').addEventListener('click', e => {
    const b = e.target.closest('[data-rv]');
    if (!b) return;
    const act = b.dataset.rv;
    if (act === 'close') { closeModal('#m-reveal'); return; }
    if (act === 'room') { Shop.open('sell'); return; }
    const Ld = G.land;
    if (!Ld || Ld.decided) return;
    if (act === 'keep') {
      if (save.net.length >= netCap()) { renderRevealActions(); return; }
      // Legendary and Extreme catches are starred on the way in, so "Sell all" never parts with them by accident.
      const prized = RARITIES[Ld.rarity].tier >= 3;
      save.net.push({ uid: save.uid++, id: Ld.id, kg: Ld.kg, cm: Ld.cm, value: Ld.value, at: Date.now(), fav: prized });
      Sound.play('equip');
      if (prized) setTimeout(() => toast(`Your ${SPECIES[Ld.id].name} is starred, so “Sell all” will leave it alone.`, RARITIES[Ld.rarity].color, 3600), 400);
    } else if (act === 'sell') {
      save.pearls += Ld.value;
      save.stats.earned += Ld.value;
      save.stats.sold += 1;
      save.caught[Ld.id].sold = (save.caught[Ld.id].sold || 0) + 1;
      Sound.play('coin', 1);
    } else if (act === 'release') {
      save.stats.released += 1;
      Sound.play('release');
    }
    Ld.decided = act;
    persist();
    closeModal('#m-reveal', true);
    if (act === 'sell') flashWallet();
  });

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
    const e = easeOutBack(k);
    x.globalAlpha = Math.min(1, k * 2);
    const cy = h / 2 + Math.sin(G.t * 1.4) * 3;
    FishArt.drawShowcase(x, revealState.id, G.t, w / 2, cy, w * 0.9, h * 0.86, { scale: e, auraR: Math.max(w, h) * 0.62, maskW: w, maskH: h, noFish: true });
    const img = FishGL.render(revealState.id, G.t, w * 0.96 * DPR, h * 0.94 * DPR, { fit: 0.92 });
    const dw = w * 0.96 * e, dh = h * 0.94 * e;
    if (dw > 1 && dh > 1) x.drawImage(img, w / 2 - dw / 2, cy - dh / 2, dw, dh);
    x.globalAlpha = 1;
  }

  function afterReveal() {
    const st = revealState;
    revealState = null;
    if (!st || st.mode !== 'catch' || !G.land) return;
    const Ld = G.land;
    if (!Ld.decided) {
      // closed without choosing (should not happen): keep it if there is room, otherwise sell it
      if (save.net.length < netCap()) save.net.push({ uid: save.uid++, id: Ld.id, kg: Ld.kg, cm: Ld.cm, value: Ld.value, at: Date.now(), fav: false });
      else { save.pearls += Ld.value; save.stats.earned += Ld.value; save.stats.sold += 1; }
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
        $('#btn-place').classList.add('pulse');
      }, delay);
      delay += 1200;
    }
    if (save.total === 1) setTimeout(() => toast('Fish you keep wait in your keepnet. Sell them at the market for Moonpearls.', '#e8c46c', 5000), delay);
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
    $('#btn-place').classList.remove('pulse');
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
  ui.netBtn.addEventListener('click', () => openShop('sell'));
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

  Shop.init({
    get save() { return save; },
    persist,
    refresh() { updateHUD(); if (revealOpen()) renderRevealActions(); },
    toast,
    play: (name, ...args) => Sound.play(name, ...args),
    openModal,
    loc: () => locById(save.loc),
    netCap,
    level: () => lvl().level,
    perks: gearPerks,
    time: () => G.t,
    flashWallet,
  });

  /* ================= Sizing + loop ================= */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    DPR = Math.max(1, Math.min(dpr, 2, Math.sqrt(4.2e6 / Math.max(1, W * H))));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    L = Scenes.layout(W, H);
    if (GLON) {
      const want = coarse ? Math.min(dpr, 1.5) : Math.min(dpr, 1.75);
      glScale = Math.max(0.75, Math.min(want, Math.sqrt(3.0e6 / Math.max(1, W * H))));
      dynScale = Math.min(1, glScale);
      WaterGL.resize(W * glScale, H * glScale);
    }
    syncScene(true);
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

  /* Adaptive quality: if the GPU scene keeps missing ~42 fps, render it at a lower resolution. */
  const perf = { acc: 0, n: 0, lowered: 0 };
  function governQuality(rawDt) {
    if (!GLON || !WaterGL.ok || document.hidden || rawDt <= 0 || rawDt > 0.25) return;
    perf.acc += rawDt; perf.n += 1;
    if (perf.acc < 2) return;
    const avg = perf.acc / perf.n;
    perf.acc = 0; perf.n = 0;
    if (avg > 1 / 42 && glScale > 0.72 && perf.lowered < 4) {
      perf.lowered += 1;
      glScale = Math.max(0.7, glScale * 0.82);
      dynScale = Math.min(1, glScale);
      WaterGL.resize(W * glScale, H * glScale);
      syncScene(true);
    }
  }

  let last = performance.now();
  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, raw);
    governQuality(raw);
    last = now;
    G.t += dt; G.pt += dt;
    update(dt);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    render();
    if (revealState && !$('#m-reveal').hidden) drawReveal();
    if (Shop.isOpen()) Shop.paint(G.t);
    requestAnimationFrame(frame);
  }

  /* ================= Dev helpers (console or #dev) ================= */
  window.Tidesong = {
    flourish(name) { return Flourish.trigger(name, L, G.t); },
    hook(id) { if (SPECIES[id]) { G.forced = id; return `Next bite: ${SPECIES[id].name}`; } return 'Unknown species'; },
    hookRarity(r) { const ids = SPECIES_ORDER.filter(id => SPECIES[id].rarity === r); if (ids.length) G.forced = ids[Math.floor(Math.random() * ids.length)]; return G.forced; },
    addXp(n) { save.xp += n; persist(); updateHUD(); },
    addPearls(n) { save.pearls += n; persist(); updateHUD(); },
    unlockAll() { save.xp = Math.max(save.xp, xpToReach(Gear.TOP_LEVEL)); persist(); updateHUD(); },
    reset() { save = fresh(); persist(); location.reload(); },
    get state() { return { t: G.t, phase: G.phase, save: JSON.parse(JSON.stringify(save)), reel: G.reel && { progress: G.reel.progress, band: G.reel.band.x, width: G.reel.band.w, mods: G.reel.mods, fish: G.reel.fish.shown, inBand: G.reel.inBand }, shadow: { ...FS }, bob: G.phase === 'reeling' ? { ...G.entry } : bobPos(), tip: rodTip() }; },
  };
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
  if (!save.intro) openModal('#m-intro');
  if (save.marketGift) {
    const gift = save.marketGift;
    delete save.marketGift;
    persist();
    setTimeout(() => toast(`The Driftwood Market has opened. Your earlier catches sold for ${fmt(gift)} Moonpearls.`, '#e8c46c', 6000), 1200);
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
