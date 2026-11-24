/* Tidesong — the aquarium. Kept fish live here: they swim and explore their tank, meet one another,
   make friends and sometimes mates, and the rarer ones leave Moonpearls on the sand. Most of this is
   never explained in the game; players find it by watching and touching. js/tank-env.js draws the
   tanks; game.js hands this module an api object and all state lives in the shared save. */
'use strict';

const Tank = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pearlsHTML = n => `<span class="pearl" aria-hidden="true"></span>${fmt(n)}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HOUR = 3600e3;

  /* ================= Temperaments =================
     zone: where in the water a fish likes to be (t top, m middle, b bottom); spd: cruising pace;
     flags: S schools, Y shy, P playful, T territorial, F forages, C curious, G glows, A lurks and ambushes,
     H likes a hiding place, V swims upright, W walks the bottom, E long, eel-like body;
     react: what it does when touched. */
  const TR = {
    trout: ['m', 1.1, 'C', 'dart'], salmon: ['m', 1.2, '', 'leap'], pomfret: ['m', 1.0, 'S', 'flash'],
    catfish: ['b', 0.65, 'FH', 'gulp'], crucian: ['b', 0.8, 'FS', 'nuzzle'], tilapia: ['m', 0.9, 'FC', 'nuzzle'],
    carp: ['b', 0.75, 'FC', 'gulp'], bluegill: ['m', 1.0, 'SC', 'nuzzle'], perch: ['m', 1.0, 'S', 'dart'],
    roach: ['m', 1.1, 'S', 'flash'], tench: ['b', 0.7, 'F', 'nuzzle'], mudskipper: ['b', 0.8, 'PW', 'hop'],
    lanternfish: ['m', 1.1, 'SG', 'glow'], killifish: ['t', 1.3, 'S', 'dart'], glassfish: ['m', 0.9, 'SYG', 'flash'],
    clownfish: ['m', 0.9, 'P', 'wiggle'], snapper: ['m', 1.0, '', 'dart'], tang: ['m', 1.1, 'S', 'wiggle'],
    butterflyfish: ['m', 0.9, 'Y', 'glide'], cod: ['b', 0.8, 'F', 'gulp'], char: ['m', 1.0, '', 'dart'],
    herring: ['t', 1.3, 'S', 'flash'], sculpin: ['b', 0.45, 'YH', 'flare'], goldfish: ['m', 0.8, 'CP', 'nuzzle'],
    loach: ['b', 0.8, 'FHE', 'bury'], paradise: ['m', 1.0, 'T', 'flare'],
    puffer: ['m', 0.55, 'C', 'puff'], grouper: ['b', 0.55, 'H', 'gulp'], pike: ['m', 1.3, 'A', 'dart'],
    barracuda: ['m', 1.4, 'A', 'dart'], bass: ['m', 1.0, 'AC', 'gulp'], gar: ['t', 0.8, 'A', 'glide'],
    eel: ['b', 0.75, 'HE', 'curl'], archerfish: ['t', 1.0, 'C', 'squirt'], paddlefish: ['m', 0.75, 'F', 'glide'],
    lionfish: ['m', 0.5, '', 'flare'], parrotfish: ['m', 0.9, 'F', 'bubble'], triggerfish: ['b', 1.0, 'TF', 'flare'],
    sturgeon: ['b', 0.55, 'F', 'glide'], halibut: ['b', 0.5, 'H', 'bury'], wolffish: ['b', 0.55, 'H', 'gulp'],
    snakehead: ['m', 0.9, 'T', 'dart'], tigerfish: ['m', 1.4, 'P', 'dart'],
    koi: ['m', 0.75, 'C', 'nuzzle'], flyingfish: ['t', 1.4, '', 'leap'], angelfish: ['m', 0.65, '', 'glide'],
    axolotl: ['b', 0.45, 'CPW', 'blush'], betta: ['m', 0.65, 'T', 'flare'], anglerfish: ['b', 0.45, 'GH', 'glow'],
    seahorse: ['m', 0.3, 'YV', 'curl'], mandarin: ['b', 0.55, 'Y', 'spin'], oarfish: ['m', 0.4, 'E', 'glide'],
    icefish: ['m', 0.65, 'G', 'glide'], swordfish: ['m', 1.6, '', 'dart'], flowerhorn: ['m', 0.9, 'TC', 'flare'],
    penguin: ['m', 1.5, 'PC', 'penguin'], dolphin: ['m', 1.4, 'PC', 'loop'],
    dragonfish: ['m', 1.0, 'GP', 'ember'],
  };
  const GLOW = { lanternfish: '#8ff4ff', glassfish: '#cfeeff', anglerfish: '#b8ffe8', icefish: '#bfe4ff', dragonfish: '#ffb05a' };
  const AIR = new Set(['gar', 'snakehead', 'betta', 'paradise', 'mudskipper', 'axolotl']);
  const TALL = new Set(['angelfish', 'seahorse', 'penguin', 'lionfish', 'pomfret', 'butterflyfish', 'mandarin']);
  const traits = id => {
    const t = TR[id] || ['m', 1, '', 'dart'];
    const f = t[2];
    return { zone: t[0], spd: t[1], flags: f, react: t[3], S: f.includes('S'), Y: f.includes('Y'), P: f.includes('P'), T: f.includes('T'), F: f.includes('F'), C: f.includes('C'), G: f.includes('G'), A: f.includes('A'), H: f.includes('H'), V: f.includes('V'), W: f.includes('W'), E: f.includes('E') };
  };
  function temperament(id) {
    const t = traits(id), bits = [];
    if (t.P) bits.push('playful');
    if (t.C) bits.push('curious');
    if (t.Y) bits.push('shy');
    if (t.T) bits.push('territorial');
    if (t.S) bits.push('happiest in company');
    if (t.A) bits.push('a patient lurker');
    if (t.F && bits.length < 2) bits.push('always rummaging');
    if (t.G && bits.length < 2) bits.push('softly aglow');
    if (t.H && !t.Y && bits.length < 2) bits.push('fond of a hiding place');
    if (t.spd >= 1.3 && bits.length < 3) bits.push('quick');
    if (t.spd <= 0.5 && bits.length < 3) bits.push('unhurried');
    if (!bits.length) bits.push('easy-going');
    const s = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0];
    return s[0].toUpperCase() + s.slice(1);
  }

  /* ================= Bonds ================= */
  const HOMES = {};
  for (const L of LOCATIONS) for (const r in L.fish) for (const id in L.fish[r]) (HOMES[id] = HOMES[id] || new Set()).add(L.id);
  const shareHome = (a, b) => { const A = HOMES[a], B = HOMES[b]; if (!A || !B) return false; for (const x of A) if (B.has(x)) return true; return false; };
  const bkey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const hash01 = (a, b) => { let h = (Math.min(a, b) * 2654435761 + Math.max(a, b) * 40503) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
  /* How readily two fish warm to each other: kin and fish from the same waters get on best; two
     territorial fish least. Every pair also has a chemistry of its own. */
  function affinity(a, b) {
    const A = traits(a.id), B = traits(b.id);
    let k = 1;
    if (a.id === b.id) k *= 2.2; else if (shareHome(a.id, b.id)) k *= 1.4;
    if (A.T && B.T) k *= 0.4;
    if (A.Y || B.Y) k *= 0.8;
    if (A.P && B.P) k *= 1.3;
    if (A.S && a.id === b.id) k *= 1.2;
    return k * (0.75 + 0.5 * hash01(a.uid, b.uid));
  }
  const BOND = [[100, 'Mates'], [80, 'Best friends'], [50, 'Friends'], [20, 'Acquainted']];
  let S = null; // the save's tank state
  const bond = (a, b) => (S.bonds[bkey(a, b)] || 0);
  const mateOf = uid => S.mates[uid];
  const fishRec = uid => api.save.net.find(f => f.uid === uid);
  /* Raise a bond, and when two of a kind are closest of all and both free, they become mates. */
  function addBond(a, b, v, live) {
    const k = bkey(a.uid, b.uid), cur = S.bonds[k] || 0;
    const nv = clamp(cur + v, 0, 100);
    S.bonds[k] = Math.round(nv * 100) / 100;
    dirty = true;
    if (nv >= 100 && a.id === b.id && !S.mates[a.uid] && !S.mates[b.uid]) {
      S.mates[a.uid] = b.uid; S.mates[b.uid] = a.uid;
      if (live) celebrate(a, b);
      else S.news = (S.news || []).concat([[a.uid, b.uid]]).slice(-6);
    }
  }
  function forget(uid) {
    for (const k of Object.keys(S.bonds)) { const [a, b] = k.split('-').map(Number); if (a === uid || b === uid) delete S.bonds[k]; }
    const m = S.mates[uid];
    if (m !== undefined) { delete S.mates[m]; delete S.mates[uid]; }
    if (S.news) S.news = S.news.filter(([a, b]) => a !== uid && b !== uid);
  }
  function bondsOf(uid) {
    const out = [];
    for (const k in S.bonds) {
      const [a, b] = k.split('-').map(Number);
      if (a !== uid && b !== uid) continue;
      const other = a === uid ? b : a, v = S.bonds[k];
      if (v >= 20 || S.mates[uid] === other) out.push({ uid: other, v: S.mates[uid] === other ? 101 : v });
    }
    return out.sort((x, y) => y.v - x.v);
  }

  /* ================= Moonpearls =================
     Every kept fish slowly makes Moonpearls: YIELD pearls an hour by rarity. Tuned in a simulation of
     whole careers (fishing, keeping or selling, buying gear and tanks, checking in a few times a day):
     a tank of good fish speeds a player's gear ladder by about a fifth, and fishing always pays far
     better than waiting. Rarer fish earn more for their slot; commoner fish earn back their price
     sooner, so selling a trophy for an upgrade and keeping it for its pearls are both good choices.
     While you watch, a fish drops a pearl of about DROP pearls now and then; while you are away its
     pearls pile up and appear as a few big ones when you come back. The sand holds BED_HOURS of the
     tank's making; when it is full the fish stop until you gather what is there. */
  const YIELD = { common: 1, rare: 3, epic: 7, legendary: 24, extreme: 80 };
  const DROP = { common: 1, rare: 2, epic: 3.5, legendary: 8, extreme: 20 };
  const BED_HOURS = 8, MAX_LYING = 60, MATE_BOOST = 1.5, FED_BOOST = 1.25;
  const fedRecently = () => Date.now() - (S.fed || 0) < 15 * 60e3;
  const rarityOf = rec => (SPECIES[rec.id] || {}).rarity;
  const yieldOf = rec => (YIELD[rarityOf(rec)] || 0) * (S.mates[rec.uid] !== undefined ? MATE_BOOST : 1);
  const tankRate = () => api.save.net.reduce((a, r) => a + yieldOf(r), 0);
  const bedCap = () => tankRate() * BED_HOURS;
  // what lies on the sand, plus what the fish have made and not yet let go
  function bedValue() {
    let v = 0;
    for (const d of S.drops) v += d.v;
    for (const k in S.acc) v += S.acc[k];
    return v;
  }
  const bedFull = () => { const c = bedCap(); return c > 0 && bedValue() >= c - 0.01; };
  /* The fish make pearls for `hours`, up to what the sand can hold. */
  function accrue(hours, boost = 1) {
    const rate = tankRate() * boost;
    if (hours <= 0 || rate <= 0) return;
    const room = bedCap() - bedValue();
    if (room <= 0) return;
    const k = Math.min(1, room / (rate * hours));
    for (const rec of api.save.net) {
      const y = yieldOf(rec) * boost;
      if (y > 0) S.acc[rec.uid] = (S.acc[rec.uid] || 0) + y * hours * k;
    }
  }
  /* What the fish made while you were away appears on the sand: one pearl from each fish, or two when
     it made a lot, merged further if the sand gets crowded. */
  function materialize() {
    let made = 0;
    for (const rec of api.save.net) {
      const a = S.acc[rec.uid] || 0, v = Math.floor(a), r = rarityOf(rec);
      if (v < 1 || !r) continue;
      S.acc[rec.uid] = a - v;
      const parts2 = v >= DROP[r] * 3 ? [Math.round(v * 0.55), v - Math.round(v * 0.55)] : [v];
      for (const pv of parts2) { addDrop(rand(0.06, 0.94), pv, r, rec.uid, true); made++; }
    }
    while (S.drops.length > MAX_LYING) {
      // fold the smallest pearl into its nearest neighbour
      let i = 0;
      S.drops.forEach((d, j) => { if (d.v < S.drops[i].v) i = j; });
      const d = S.drops.splice(i, 1)[0];
      let n = 0, nd = Infinity;
      S.drops.forEach((q, j) => { const dd = Math.abs(q.x - d.x) + (q.row !== d.row ? 0.05 : 0); if (dd < nd) { nd = dd; n = j; } });
      S.drops[n].v += d.v;
      if (RARITIES[d.r] && RARITIES[S.drops[n].r] && RARITIES[d.r].tier > RARITIES[S.drops[n].r].tier) S.drops[n].r = d.r;
    }
    if (made) dirty = true;
    return made;
  }
  let dropKey = 1;
  function addDrop(x, v, r, from, born) {
    const d = { x: Math.round(x * 1000) / 1000, v, r, k: Date.now() % 1e7 + dropKey++, row: 0 };
    if (sc) place(d);
    if (born) d.born = 1;
    S.drops.push(d);
    if (from) { const rec = fishRec(from); if (rec) rec.pearls = (rec.pearls || 0) + v; }
    dirty = true;
    return d;
  }

  /* ================= Time away =================
     While the tank is closed its fish keep living: they make pearls (up to what the sand will hold), and
     fish that get on spend the hours together. What they made shows on the sand when you open the tank. */
  function settle(now = Date.now(), show = false) {
    const s = api.save;
    S = s.tank;
    S.acc = S.acc || {};
    const secs = S.last ? (now - S.last) / 1000 : 0;
    if (!S.last) S.last = now;
    if (secs >= 5) {
      S.last = now;
      const fish = s.net;
      accrue(secs / 3600);
      // bonds: each fish spends its time with the few it gets on with best
      const h = Math.min(secs / 3600, 24);
      if (fish.length > 1 && h > 0.002) {
        const done = new Set();
        for (const a of fish) {
          const best = fish.filter(b => b !== a).map(b => ({ b, k: affinity(a, b) })).sort((x, y) => y.k - x.k).slice(0, 3);
          for (const { b, k } of best) {
            const key = bkey(a.uid, b.uid);
            if (done.has(key)) continue;
            done.add(key);
            addBond(a, b, h * 2.2 * k * rand(0.6, 1.2), false);
          }
        }
      }
    }
    prune();
    if (show) materialize();
  }
  function prune() {
    const s = api.save, live = new Set(s.net.map(f => f.uid));
    for (const k of Object.keys(S.bonds)) { const [a, b] = k.split('-').map(Number); if (!live.has(a) || !live.has(b) || S.bonds[k] < 0.5) delete S.bonds[k]; }
    for (const k of Object.keys(S.mates)) if (!live.has(+k) || !live.has(S.mates[k])) delete S.mates[k];
    // a fish that leaves takes its unfinished pearl with it
    for (const k of Object.keys(S.acc || {})) if (!live.has(+k)) delete S.acc[k];
    if (S.news) S.news = S.news.filter(([a, b]) => live.has(a) && live.has(b));
  }

  /* ================= Sprites =================
     Each species is painted and lit once per size, in eight frames through a swimming stroke: its fins
     swing from their roots and its tail flicks (FishArt's swim pose). As a fish swims, the frame that
     matches the moment of its stroke is drawn, bent along its body (drawFish). */
  const NF = 8;
  const poseAt = i => Math.sin(2.4 * (-0.65 + 1.3 * i / (NF - 1)));
  const SPR = new Map();
  const queue = [];
  function sprite(id, px) {
    const q = clamp(Math.round(px / 12) * 12, 24, 360), key = id + '|' + q;
    let s = SPR.get(key);
    if (!s) {
      const box = FishArt.BOX[id], bw = box[1] - box[0], bh = box[3] - box[2];
      s = { id, w: q, h: Math.max(8, Math.round(q * bh / bw)), frames: new Array(NF), n: 0 };
      SPR.set(key, s); queue.push(s);
    }
    return s;
  }
  function bake(budget) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budget) {
      const s = queue.find(q => q.n === 0) || queue[0];
      const i = s.n, t = -0.65 + 1.3 * i / (NF - 1);
      let img;
      FishArt.pose = poseAt(i);
      try { img = FishGL.render(s.id, t, s.w, s.h, { still: true, fit: 1, fill: 0.92 }); } finally { FishArt.pose = null; }
      const c = document.createElement('canvas');
      c.width = s.w; c.height = s.h;
      c.getContext('2d').drawImage(img, 0, 0);
      s.frames[i] = c; s.n += 1;
      if (s.n >= NF) queue.splice(queue.indexOf(s), 1);
    }
  }
  /* The baked frame nearest a point in the stroke (pose -1..1). */
  function frameOf(s, pose) {
    const i = clamp(Math.round((Math.asin(clamp(pose, -0.999, 0.999)) / 2.4 + 0.65) / 1.3 * (NF - 1)), 0, NF - 1);
    if (s.frames[i]) return s.frames[i];
    for (let d = 1; d < NF; d++) { if (s.frames[i - d]) return s.frames[i - d]; if (s.frames[i + d]) return s.frames[i + d]; }
    return null;
  }

  /* ================= The open tank ================= */
  let api = null;
  let isOpen = false, sc = null, cv = null, ctx = null, layer = null, lctx = null, glc = null, glOn = false;
  const ptr = [0.5, 0.5], ptrTo = [0.5, 0.5];
  let W = 0, H = 0, DPR = 1, T = 0, U = 1;
  let fish = [], parts = [], lifts = [], ints = [];
  let sel = null, view = 'tank', dirty = false, saveT = 0, socialT = 0, ambT = 3, cardT = 0;
  let drag = null, down = null, holdT = 0, sellAllArmed = 0, releaseArmed = 0, sellArmed = 0;
  const falling = new Map(), lifted = new Map(), pops = new Map();
  const met = new Map();
  const affC = new Map();
  const TSCALE = { bowl: 1.15, reed: 1.05, lily: 1.0, reef: 0.95, wreck: 0.9, palace: 0.84 };
  /* How long a fish draws (in tank units) from its real length: in proportion for small fish (a 9 cm
     fish is about half the length of a 36 cm one), then gently compressed so a dolphin still fits. */
  const sizeU = cm => Math.max(3.4, 0.85 * (cm <= 40 ? 1.7 * Math.pow(cm, 0.55) : 12.93 + 3.4 * Math.log(cm / 40)));
  const TC = {};
  const trait = id => TC[id] || (TC[id] = traits(id));
  const byUid = uid => fish.find(f => f.uid === uid && !f.leaving);
  const aff = (a, b) => { const k = bkey(a.uid, b.uid); let v = affC.get(k); if (v === undefined) { v = affinity(a, b); affC.set(k, v); } return v; };
  const play = (name, ...a) => api.play(name, ...a);

  function makeFish(rec) {
    const sp = SPECIES[rec.id], tr = trait(rec.id);
    const cm = clamp(rec.cm || Math.sqrt(sp.cm[0] * sp.cm[1]), 2, 900);
    const box = FishArt.BOX[rec.id], bw = box[1] - box[0], bh = box[3] - box[2];
    const f = {
      rec, uid: rec.uid, id: rec.id, sp, tr, tier: RARITIES[sp.rarity].tier,
      lenU: sizeU(cm), aspect: bh / bw, wk: bw / Math.max(bw, bh * 0.9), effort: 0.3, arch: 0, chew: 0, pvx: 0, pvy: 0,
      x: 0, y: 0, z: rand(0.12, 0.88), tz: 0.5, vx: 0, vy: 0, face: Math.random() < 0.5 ? 1 : -1, flip: 1, tilt: 0,
      state: 'wander', st: 0, dur: 0, tx: 0, ty: 0, boost: 1, poi: null, int: null, react: null, taps: [],
      phase: Math.random() * 10, wave: Math.random() * TAU, puff: 0, glow: 0, flare: 0, gulp: 0, wobble: 0, blush: 0, flash: 0, cocoon: 0, trail: 0,
      social: rand(3, 9), pearlAt: 0, faceLock: 0, leaving: null, eatDelay: 0, bury: 0, free: false, above: false, alpha: 1,
    };
    f.flip = f.face; f.tz = f.z;
    if (DROP[sp.rarity]) f.pearlAt = DROP[sp.rarity] * rand(0.6, 1.3);
    return f;
  }
  function dims(f) {
    const len = f.lenU * U * (TSCALE[sc.id] || 1);
    f.len = len; f.dw = len / 0.92 * f.wk; f.dh = f.dw * f.aspect; f.hh = Math.min(f.dh * 0.36, len * 0.45);
  }
  const floorAt = x => sc.floor(clamp(x, sc.ix0 + 1, sc.ix1 - 1));
  function clampPos(f) {
    const s = sc.swim, mx = Math.min(f.len * 0.45, (s.x1 - s.x0) * 0.2);
    f.x = clamp(f.x, s.x0 + mx, s.x1 - mx);
    // fish keep a little below the surface, except when coming up to it (to feed, or to gulp air)
    const top = f.state === 'eat' || f.state === 'surface' ? sc.surf + f.hh * 0.95 : s.y0 + f.hh * 0.5, bot = floorAt(f.x) - f.hh * (f.bury > 0.5 ? -0.2 : 0.8);
    f.y = clamp(f.y, top, Math.max(top, bot));
    if (sc.ell) {
      const e = TankEnv.insideEll(sc, f.x, f.y);
      if (e > 1) { const k = 1 / Math.sqrt(e); f.x = sc.ell.cx + (f.x - sc.ell.cx) * k; f.y = sc.ell.cy + (f.y - sc.ell.cy) * k; }
    }
  }
  /* A place to swim to, in the band of water this fish prefers. */
  function spot(f, zone = f.tr.zone) {
    const s = sc.swim;
    for (let i = 0; i < 10; i++) {
      const x = rand(s.x0 + f.len * 0.6, s.x1 - f.len * 0.6), top = s.y0 + f.hh, bot = floorAt(x) - f.hh, span = Math.max(1, bot - top);
      const y = zone === 't' ? top + span * rand(0, 0.3) : zone === 'b' || f.tr.W ? bot - span * rand(0, 0.12) : top + span * rand(0.1, 0.85);
      if (!sc.ell || TankEnv.insideEll(sc, x, y) < 0.8) return [x, y];
    }
    return [sc.ell ? sc.ell.cx : (s.x0 + s.x1) / 2, sc.ell ? sc.ell.cy : (s.y0 + floorAt((s.x0 + s.x1) / 2)) / 2];
  }
  function go(f, state, dur, tx, ty, boost = 1) {
    f.state = state; f.st = 0; f.dur = dur; f.boost = boost; f.arrived = false;
    if (tx !== undefined) { f.tx = tx; f.ty = ty; }
  }
  const near = (f, r) => Math.hypot(f.tx - f.x, f.ty - f.y) < r;
  const isFree = f => !f.leaving && !f.react && !f.free && ['wander', 'idle', 'forage', 'poi', 'surface'].includes(f.state);

  /* ---------- choosing what to do next ---------- */
  function pickNext(f) {
    f.poi = null; f.boost = 1; f.with = null; f.wantLeap = false; f.hide = 0; f.path = null;
    if (f.bury > 0 && f.react && f.react.kind === 'bury') return;
    const tr = f.tr, opts = [];
    const add = (w, fn) => { if (w > 0) opts.push([w, fn]); };
    add(4, () => {
      const [x, y] = spot(f);
      go(f, 'wander', rand(6, 14), x, y);
      f.tz = clamp(f.tz + rand(-0.35, 0.35), 0.06, 0.94);
      // where a wall would hide them, fish mostly swim in front of it
      if (sc.occluders && sc.occluders.some(o => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1) && Math.random() < 0.8) f.tz = rand(0.06, 0.42);
    });
    add(tr.A ? 3 : tr.spd < 0.6 ? 2 : 1.1, () => go(f, 'idle', rand(2.5, 6), f.x, f.y));
    for (const p of sc.pois) {
      let w = 0;
      switch (p.kind) {
        case 'hide': w = tr.Y || tr.H ? 1.5 : 0.12; break;
        case 'perch': w = tr.V ? 4 : 0; break;
        case 'nibble': w = tr.F || ['parrotfish', 'butterflyfish', 'tang', 'triggerfish'].includes(f.id) ? 1.1 : 0.06; break;
        case 'ride': w = tr.P ? 1.3 : tr.C ? 0.45 : 0.15; break;
        case 'gather': w = (tr.C ? 0.5 : 0.08) + (p.strand ? (p.strand.glow || 0) * 2 + (tr.G ? 0.8 : 0) : 0) + (p.port ? p.port.glow * 3 : 0); break;
        case 'anemone': w = f.id === 'clownfish' ? 9 : 0; break;
        case 'shade': w = tr.Y ? 0.5 : tr.zone === 't' ? 0.45 : 0.08; break;
        case 'through': w = tr.P ? 0.8 : 0.3; break;
        case 'ring': w = tr.P ? 1.1 : 0.15; break;
      }
      if (tr.W && p.kind !== 'hide' && p.kind !== 'nibble') w = 0;
      if (tr.V && !['perch', 'hide', 'shade'].includes(p.kind)) w *= 0.2;
      add(w, () => visit(f, p));
    }
    if (sc.balls && !tr.V) add(tr.P ? 1.4 : tr.C ? 0.5 : 0.08, () => { const b = pick(sc.balls); f.poi = { kind: 'ball', ball: b }; go(f, 'poi', rand(6, 10), b.x, floorAt(b.x) - b.r); });
    if (tr.F || tr.W) add(tr.W ? 3 : 2, () => { const [x] = spot(f); go(f, 'forage', rand(6, 12), x, floorAt(x) - f.hh); });
    if (AIR.has(f.id) || (tr.zone === 't' && !tr.W)) add(0.6, () => go(f, 'surface', rand(3, 5), f.x + rand(-2, 2) * f.len, sc.surf + f.hh * 0.6));
    if (tr.react === 'leap') add(0.35, () => { go(f, 'surface', 5, f.x + f.face * f.len * 3, sc.surf + f.hh, 1.6); f.wantLeap = true; });
    if (sc.target && f.id === 'archerfish') add(7, () => go(f, 'aim', 7, sc.target.x - f.face * f.len * 0.5, sc.surf + f.hh * 1.4, 1.2));
    if (['penguin', 'dolphin', 'dragonfish', 'swordfish', 'flyingfish'].includes(f.id)) add(0.9, () => lap(f, 1.9));
    const friends = bondsOf(f.uid).filter(b => b.v >= 50 && byUid(b.uid));
    if (friends.length) add(mateOf(f.uid) !== undefined ? 2.6 : 1.2, () => {
      const g = byUid(friends[0].v > 100 || Math.random() < 0.6 ? friends[0].uid : pick(friends).uid);
      if (g && g !== f) { f.with = g; go(f, 'seek', 9, g.x, g.y, 1.25); } else go(f, 'idle', 2, f.x, f.y);
    });
    let sum = 0;
    for (const o of opts) sum += o[0];
    let r = Math.random() * sum;
    for (const o of opts) { r -= o[0]; if (r <= 0) { o[1](); return; } }
    opts[0][1]();
  }
  function visit(f, p) {
    f.poi = p;
    if (p.kind === 'through') {
      f.path = p.path.map(q => q.slice()); f.pi = 0; f.pz = [p.z0, p.z1];
      go(f, 'through', 16, f.path[0][0], f.path[0][1]);
      return;
    }
    const dur = { hide: rand(6, 14), perch: rand(10, 24), nibble: rand(4, 8), ride: rand(4, 7), gather: rand(4, 8), anemone: rand(10, 22), shade: rand(5, 10), ring: rand(6, 10) }[p.kind] || 6;
    let x = p.x, y = p.y;
    if (p.kind === 'gather' || p.kind === 'shade') { x += rand(-1, 1) * f.len; y += rand(-0.5, 0.5) * f.len * 0.6; }
    if (p.kind === 'nibble') x += rand(-1, 1) * f.len * 0.4;
    go(f, 'poi', dur, x, y);
    if (p.z !== undefined) f.tz = p.z;
  }
  /* A fast lap of the tank, for the swift and the playful. */
  function lap(f, boost) {
    const s = sc.swim, m = f.len * 1.1, P = [];
    if (sc.ell) { const e = sc.ell; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU * f.face; P.push([e.cx + Math.cos(a) * e.rx * 0.7, e.cy + Math.sin(a) * e.ry * 0.6]); } }
    else {
      const top = s.y0 + f.hh * 2, bot = x => floorAt(x) - f.hh * 2.5;
      P.push([s.x1 - m, lerp(top, bot(s.x1 - m), 0.25)], [s.x1 - m * 1.4, bot(s.x1 - m)], [s.x0 + m * 1.4, bot(s.x0 + m)], [s.x0 + m, lerp(top, bot(s.x0 + m), 0.25)]);
      if (f.face < 0) P.reverse();
      P.push(P[0].slice());
    }
    f.path = P; f.pi = 0;
    go(f, 'lap', 14, P[0][0], P[0][1], boost);
  }
  function hideAway(f) {
    const hides = sc.pois.filter(p => p.kind === 'hide');
    if (hides.length) { const p = hides.reduce((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) < Math.hypot(b.x - f.x, b.y - f.y) ? a : b)); visit(f, p); f.boost = 2.2; f.dur = rand(5, 9); }
    else flee(f, f.x - f.face * f.len, f.y, 1.2);
  }
  function flee(f, x, y, dur = 1, boost = 2.6) {
    const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1, L = Math.max(f.len * 3, U * 18);
    go(f, 'flee', dur, f.x + dx / d * L, f.y + dy / d * L * 0.6, boost);
    if (f.int) endInt(f.int);
  }

  /* ---------- each fish, each frame ---------- */
  function think(f, dt) {
    f.st += dt;
    if (f.faceLock > 0) f.faceLock -= dt;
    if (f.react) { f.react.t += dt; if (f.react.t > f.react.dur) endReact(f); }
    if (f.pearlAt && !f.leaving && (S.acc[f.uid] || 0) >= f.pearlAt) {
      const v = Math.floor(S.acc[f.uid]);
      S.acc[f.uid] -= v;
      f.pearlAt = DROP[f.sp.rarity] * rand(0.7, 1.3);
      dropPearl(f, v);
    }
    if (f.leaving) { f.leaving.t += dt; f.tx = f.x + f.face * f.len; f.ty = sc.surf - f.dh; f.boost = 1.6; return; }
    if (f.free) return;
    switch (f.state) {
      case 'enter': if (f.st > 1.6) pickNext(f); break;
      case 'wander': if (near(f, f.len * 0.6) || f.st > f.dur) pickNext(f); break;
      case 'idle': case 'look': case 'gather': if (f.st > f.dur) pickNext(f); break;
      case 'flee': if (f.st > f.dur) { f.boost = 1; pickNext(f); } break;
      case 'forage':
        if (near(f, f.len * 0.4)) {
          if (Math.random() < dt * 1.5) puffSand(f.x + f.face * f.len * 0.4, floorAt(f.x), 0.6);
          const nx = clamp(f.x + rand(-1, 1) * f.len * 2, sc.swim.x0 + f.len, sc.swim.x1 - f.len);
          f.tx = nx; f.ty = floorAt(nx) - f.hh;
        }
        if (f.st > f.dur) pickNext(f);
        break;
      case 'poi': poiTick(f, dt); break;
      case 'through': case 'lap':
        if (near(f, f.len * 0.7)) {
          if (f.state === 'through' && f.pi === 1) { f.z = f.tz = f.pz[1]; sparkle(f.x, f.y, sc.id === 'palace' ? '#ffe6a0' : '#e8fff0', 3); }
          if (f.state === 'through' && f.pi === 0) { f.z = f.tz = f.pz[0]; }
          f.pi += 1;
          if (f.pi >= f.path.length) { pickNext(f); break; }
          f.tx = f.path[f.pi][0]; f.ty = f.path[f.pi][1];
        }
        if (f.state === 'lap' && f.trail > 0 && Math.random() < dt * 14) TankEnv.bubble(sc, f.x - f.face * f.len * 0.5, f.y, U * rand(0.15, 0.35), { z: f.z });
        if (f.st > f.dur) pickNext(f);
        break;
      case 'seek': {
        const g = f.with;
        if (!g || g.leaving || f.st > f.dur) { pickNext(f); break; }
        f.tx = g.x - g.face * g.len * 0.6; f.ty = g.y; f.tz = g.z;
        if (Math.hypot(g.x - f.x, g.y - f.y) < (f.len + g.len) * 0.7 && isFree(g)) startInteraction(f, g, mateOf(f.uid) === g.uid && Math.random() < 0.5 ? pick(['kiss', 'dance']) : 'swimwith');
        break;
      }
      case 'surface':
        if (near(f, f.len * 0.5) || f.y < sc.surf + f.hh * 1.2) {
          if (f.wantLeap) { f.wantLeap = false; leap(f); break; }
          if (!f.gulpedAir) { f.gulpedAir = true; ripple(f.x + f.face * f.len * 0.4, sc.surf, 0.6); TankEnv.bubble(sc, f.x + f.face * f.len * 0.4, f.y, U * 0.4, { z: f.z }); }
        }
        if (f.st > f.dur) { f.gulpedAir = false; pickNext(f); }
        break;
      case 'aim': {
        const tg = sc.target;
        if (!tg) { pickNext(f); break; }
        f.tx = tg.x - f.face * f.len * 0.6; f.ty = sc.surf + f.hh * 1.6;
        if (near(f, f.len * 0.4) && f.st > 1) { squirt(f); pickNext(f); }
        if (f.st > f.dur) pickNext(f);
        break;
      }
      case 'eat': eatTick(f, dt); break;
      case 'chase': if (!drag) pickNext(f); else { f.tx = drag.x - f.face * f.len * 0.4; f.ty = drag.y; if (f.st > 8) pickNext(f); } break;
      case 'nuzzle':
        if (near(f, f.len * 0.35) && !f.nuzzled) { f.nuzzled = true; f.wobble = 1; TankEnv.bubble(sc, f.x + f.face * f.len * 0.45, f.y - f.hh * 0.2, U * 0.4, { z: 0 }); play('boop'); }
        if (f.st > f.dur) { f.nuzzled = false; pickNext(f); }
        break;
      case 'loop': {
        const k = Math.min(1, f.st / f.dur), a = Math.PI / 2 + f.face * k * TAU;
        f.tx = f.lc[0] + Math.cos(a) * f.lr * f.face; f.ty = f.lc[1] + Math.sin(a) * f.lr;
        if (f.st > f.dur) { blowRing(f); pickNext(f); }
        break;
      }
      case 'social': if (!f.int) pickNext(f); break;
      default: if (f.st > (f.dur || 4)) pickNext(f);
    }
  }
  function poiTick(f, dt) {
    const p = f.poi;
    if (!p) { pickNext(f); return; }
    if (!f.arrived && near(f, Math.max(f.len * 0.5, U * 2))) { f.arrived = true; f.st = Math.min(f.st, 1); }
    if (f.arrived) {
      switch (p.kind) {
        case 'hide': f.hide = 1; f.boost = 0.4; if (p.face) { f.face = p.face; f.faceLock = 0.5; } break;
        case 'perch': f.boost = 0.25; f.ty = p.y + Math.sin(T * 0.8 + f.uid) * U * 0.6; break;
        case 'nibble': f.tx = p.x + Math.sin(T * 5 + f.uid) * f.len * 0.12; f.boost = 0.6; if (Math.random() < dt * 1.2) sparkle(p.x, p.y, 'rgba(255,255,255,0.6)', 1, 0.5); break;
        case 'ride': f.ty = sc.surf + f.hh * 1.5; f.tx = p.x + Math.sin(T * 3 + f.uid) * U * 1.5; f.boost = 1.4; f.wobble = Math.max(f.wobble, 0.3); if (f.y < sc.surf + f.hh * 2.5) pickNext(f); break;
        case 'gather': f.face = Math.sign(p.x - f.x) || f.face; f.faceLock = 0.3; f.boost = 0.4; break;
        case 'anemone': f.tx = p.x + Math.sin(T * 1.7 + f.uid) * p.r * 0.6; f.ty = p.y + Math.cos(T * 1.3 + f.uid) * p.r * 0.3; f.boost = 0.7; f.wobble = Math.max(f.wobble, 0.25); break;
        case 'shade': f.boost = 0.3; break;
        case 'ring': {
          const R = (sc.rings || []).find(r => r.t < r.life * 0.8 && Math.abs(r.x - f.x) < U * 40);
          if (R) { f.tx = R.x + U * 3; f.ty = R.y; f.boost = 1.8; if (Math.hypot(R.x - f.x, R.y - f.y) < R.r && !R.hit) { R.hit = true; sparkle(R.x, R.y, '#dff6ff', 5); play('ringpass'); } }
          break;
        }
        case 'ball': {
          const b = p.ball, by = floorAt(b.x) - b.r, dir = f.pushDir || (f.pushDir = Math.random() < 0.5 ? 1 : -1);
          f.tx = b.x - dir * (b.r + f.len * 0.42); f.ty = by; f.face = dir; f.faceLock = 0.3; f.boost = 1.1;
          if (Math.hypot(f.x - f.tx, f.y - f.ty) < f.len * 0.3 && Math.random() < dt * 2) { b.vx += dir * U * rand(2, 5); f.pushDir = Math.random() < 0.15 ? -dir : dir; }
          break;
        }
      }
    }
    if (f.st > f.dur) { f.pushDir = 0; pickNext(f); }
  }
  /* ---------- moving ---------- */
  function move(f, dt) {
    const base = f.tr.spd * U * 4.4;
    if (f.free) {
      f.vy += U * (f.above ? 52 : 30) * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y < sc.surf) f.above = true;
      if (f.above && f.vy > 0 && f.y > sc.surf + f.hh * 0.3) { f.above = false; f.free = false; splash(f.x, f.len); if (f.state !== 'enter') pickNext(f); }
      else if (!f.above && f.vy > 0 && f.y >= (f.hopY ?? Infinity)) { f.free = false; f.hopY = undefined; puffSand(f.x, floorAt(f.x), 0.6); clampPos(f); }
      f.tilt = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 1) * 0.9, -1, 1);
      f.effort = 1; f.wave += dt * TAU * 1.8;
      return;
    }
    let sp = base * f.boost * (f.state === 'idle' || (f.state === 'poi' && f.arrived && f.poi && ['hide', 'perch', 'shade', 'gather'].includes(f.poi.kind)) ? 0.35 : 1);
    if (f.react && f.react.kind === 'bubble') sp *= 0.15;
    if (f.state === 'eat') sp *= 1.45;
    const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy) || 1;
    const arrive = clamp(d / (f.len * 1.1), 0, 1);
    let dvx = dx / d * sp * arrive, dvy = dy / d * sp * arrive;
    if (!f.tr.V && !f.tr.E && f.state !== 'loop' && f.state !== 'leap') dvy = clamp(dvy, -sp * 0.65, sp * 0.65);
    for (const o of fish) {
      if (o === f || o.leaving || (f.int && f.int === o.int)) continue;
      const ox = f.x - o.x, oy = f.y - o.y, r = (f.len + o.len) * 0.3;
      if (Math.abs(ox) > r || Math.abs(oy) > r || Math.abs(f.z - o.z) > 0.24) continue;
      const dd = Math.hypot(ox, oy) || 1, push = (r - dd) / r;
      if (push > 0) { dvx += ox / dd * push * base * 0.9; dvy += oy / dd * push * base * 0.5; }
    }
    if (f.tr.S && f.state === 'wander') {
      let n = 0, ax = 0, ay = 0, cx = 0, cy = 0;
      for (const o of fish) if (o !== f && o.id === f.id && !o.leaving && Math.abs(o.x - f.x) < f.len * 6 && Math.abs(o.y - f.y) < f.len * 4) { n++; ax += o.vx; ay += o.vy; cx += o.x; cy += o.y; }
      if (n) { dvx = lerp(dvx, ax / n, 0.4) + (cx / n - f.x) * 0.25; dvy = lerp(dvy, ay / n, 0.4) + (cy / n - f.y) * 0.2; f.tz += (0.5 - f.tz) * 0.01; }
    }
    const s = sc.swim, m = f.len * 0.8;
    if (f.x < s.x0 + m) dvx += base * (s.x0 + m - f.x) / m;
    if (f.x > s.x1 - m) dvx -= base * (f.x - (s.x1 - m)) / m;
    for (const L of lifts) if (Math.abs(f.x - L.x) < L.w && f.y > L.y0 && f.y < L.y1 + f.hh * 2 && (f.tr.P || f.tr.C || L.all)) { dvy -= U * 9 * Math.min(1, L.t); f.wobble = Math.max(f.wobble, 0.4); }
    if (f.bury > 0) { dvx *= 0.1; dvy = Math.max(dvy, 0); }
    const acc = Math.min(1, dt * (2 + f.tr.spd * 1.4) * (f.boost > 1.5 ? 1.8 : 1));
    f.vx += (dvx - f.vx) * acc; f.vy += (dvy - f.vy) * acc;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.state !== 'enter') clampPos(f);
    const v = Math.hypot(f.vx, f.vy);
    if (f.faceLock <= 0 && !(f.react && f.react.kind === 'spin')) { if (f.vx > base * 0.14) f.face = 1; else if (f.vx < -base * 0.14) f.face = -1; }
    f.flip += (f.face - f.flip) * Math.min(1, dt * 6.5);
    const tilt = f.tr.V || f.tr.W ? 0 : clamp(Math.atan2(f.vy, Math.abs(f.vx) + base * 0.3) * 0.85, -0.55, 0.55);
    // a fish pitching up or down arches its body into the climb
    f.arch += (clamp((tilt - f.tilt) * 1.6, -0.45, 0.45) - f.arch) * Math.min(1, dt * 6);
    f.tilt += (tilt - f.tilt) * Math.min(1, dt * 4);
    f.z += (f.tz - f.z) * Math.min(1, dt * 0.5);
    const sr = clamp(v / base, 0, 3);
    // the stroke: harder and quicker the faster it swims, speeds up or turns; small fish beat faster than big ones,
    // and even a fish holding still keeps sculling gently
    const accel = Math.hypot(f.vx - f.pvx, f.vy - f.pvy) / Math.max(dt, 1e-3) / (base * 5);
    f.pvx = f.vx; f.pvy = f.vy;
    const effort = clamp(0.2 + sr * 0.55 + accel * 0.6 + Math.abs(f.face - f.flip) * 0.3 + (f.boost > 1.6 ? 0.35 : 0), 0.18, 1.6);
    f.effort += (effort - f.effort) * Math.min(1, dt * 4);
    const kind = f.tr.V ? 3.4 : f.id === 'puffer' ? 2.6 : f.tr.E ? 0.75 : 1;
    f.wave += dt * TAU * kind * (0.5 + f.effort * 1.15) * clamp(Math.sqrt(9 / f.lenU), 0.6, 1.5);
    f.chew = Math.max(0, f.chew - dt * 1.3);
    f.sr = sr;
    // swimming through plants leans them gently aside, the way the fish is going
    if (sr > 0.35 && (f.brushT = (f.brushT || 0) - dt) <= 0) { f.brushT = 0.2; TankEnv.brush(sc, f.x, f.y, f.len * 0.4, 0.06 * Math.min(sr, 1.6), Math.sign(f.vx)); }
  }
  function leap(f) {
    f.free = true; f.vy = -U * rand(17, 22); f.vx = f.face * U * rand(7, 11); f.above = false;
    splash(f.x, f.len * 0.8);
  }

  /* ================= Meeting one another ================= */
  const GAIN = { greet: 1.5, circle: 1.2, swimwith: 3, kiss: 4, dance: 5, tag: 2.5, boop: 2, flare: 0.3, puff: 0.5, shy: 0.4, ring: 3, clean: 3, lure: 1, escort: 3 };
  const DUR = { greet: 2.4, circle: 3.8, swimwith: 7.5, kiss: 2.6, dance: 5.5, tag: 5.5, boop: 1.9, flare: 3, puff: 3.4, shy: 0.2, ring: 4.6, clean: 5.5, lure: 4.2, escort: 8 };
  function chooseKind(a, b) {
    const v = bond(a.uid, b.uid), mates = mateOf(a.uid) === b.uid, same = a.id === b.id, A = a.tr, B = b.tr, o = [];
    if (mates) o.push(['kiss', 3], ['dance', 2.5], ['swimwith', 3]);
    else if (v >= 80) o.push(['swimwith', 3], ['boop', 1.5], ['kiss', same ? 1 : 0.2], ['tag', A.P && B.P ? 2 : 0.5]);
    else if (v >= 50) o.push(['swimwith', 2.5], ['boop', 1.2], ['greet', 1]);
    if (A.T && (same || B.T) && v < 60) o.push(['flare', 4]);
    if (a.id === 'puffer' && b.len > a.len * 1.2 && v < 50) o.push(['puff', 4]);
    if (B.Y && v < 40) o.push(['shy', 3]);
    if (A.P && B.P) o.push(['tag', 3]); else if (A.P) o.push(['tag', 0.8]);
    if (a.id === 'dolphin') o.push(['ring', 3]);
    if (a.len < b.len * 0.55 && !A.T) o.push(['clean', b.len > a.len * 1.8 ? 2 : 0.5]);
    if (a.id === 'anglerfish' && b.len < a.len * 0.9) o.push(['lure', 4]);
    if (a.id === 'dragonfish' || b.id === 'dragonfish') o.push(['escort', 3]);
    if (same && A.S) o.push(['swimwith', 2]);
    if (a.id === 'penguin' || b.id === 'penguin') o.push(['tag', 2]);
    o.push(['greet', 2], ['circle', 1.1]);
    let sum = 0; for (const x of o) sum += x[1];
    let r = Math.random() * sum;
    for (const x of o) { r -= x[1]; if (r <= 0) return x[0]; }
    return 'greet';
  }
  const LEAD = f => (f.tr.P ? 2 : 0) + (f.tr.T ? 2 : 0) + (f.id === 'dolphin' || f.id === 'anglerfish' || f.id === 'puffer' ? 3 : 0) + (f.tr.C ? 1 : 0) + Math.random();
  function startInteraction(a, b, kind) {
    if (!kind && LEAD(b) > LEAD(a)) [a, b] = [b, a];
    kind = kind || chooseKind(a, b);
    if (kind === 'shy') { hideAway(b); met.set(bkey(a.uid, b.uid), T); addBond(a, b, GAIN.shy * aff(a, b), true); b.social = rand(8, 14); return; }
    const I = { kind, a, b, t: 0, dur: DUR[kind] * rand(0.9, 1.15), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], dir: Math.sign(b.x - a.x) || 1, hT: 0 };
    for (const f of [a, b]) { if (f.int) endInt(f.int); f.state = 'social'; f.st = 0; f.int = I; f.poi = null; f.hide = 0; f.social = rand(9, 18); f.boost = 1; f.path = null; }
    a.tz = b.tz = (a.z + b.z) / 2;
    met.set(bkey(a.uid, b.uid), T);
    addBond(a, b, GAIN[kind] * aff(a, b), true);
    ints.push(I);
    return I;
  }
  function interact(I, dt) {
    const { a, b } = I;
    I.t += dt;
    if (a.int !== I || b.int !== I || a.leaving || b.leaving) { endInt(I); return; }
    const k = I.t / I.dur, gapK = { kiss: 0.42, flare: 0.8, puff: 0.75 }[I.kind] || 0.6;
    switch (I.kind) {
      case 'greet': case 'kiss': case 'flare': case 'puff': {
        const gap = (a.len + b.len) * gapK / 2;
        a.tx = I.mid[0] - I.dir * gap; a.ty = I.mid[1]; b.tx = I.mid[0] + I.dir * gap; b.ty = I.mid[1];
        a.face = I.dir; b.face = -I.dir; a.faceLock = b.faceLock = 0.3; a.boost = b.boost = 0.7;
        if (I.kind === 'greet' && !I.fx && k > 0.45) { I.fx = 1; TankEnv.bubble(sc, a.x + a.face * a.len * 0.45, a.y, U * 0.35, { z: a.z }); }
        if (I.kind === 'kiss' && !I.fx && k > 0.5) { I.fx = 1; heart((a.x + b.x) / 2, (a.y + b.y) / 2 - U * 1.5, 1); play('kiss'); }
        if (I.kind === 'flare') { a.flare = b.flare = 1; if (!I.fx && k > 0.3) { I.fx = 1; play('flare'); } }
        if (I.kind === 'puff') { const p = a.id === 'puffer' ? a : b, q = p === a ? b : a; p.puff = Math.min(1, p.puff + dt * 2); if (k > 0.35) { q.face = Math.sign(q.x - p.x) || 1; } if (!I.fx && k > 0.3) { I.fx = 1; play('puff'); } }
        break;
      }
      case 'circle': case 'dance': {
        const R = (a.len + b.len) * (I.kind === 'dance' ? 0.42 : 0.55), w = I.kind === 'dance' ? 2.3 : 1.6;
        if (I.kind === 'dance') I.mid[1] = Math.max(sc.swim.y0 + R, I.mid[1] - U * 1.3 * dt);
        const th = I.t * w;
        a.tx = I.mid[0] + Math.cos(th) * R; a.ty = I.mid[1] + Math.sin(th) * R * 0.5;
        b.tx = I.mid[0] - Math.cos(th) * R; b.ty = I.mid[1] - Math.sin(th) * R * 0.5;
        a.boost = b.boost = 1.4;
        if (I.kind === 'dance' && (I.hT -= dt) <= 0) { I.hT = 0.6; heart(I.mid[0], I.mid[1] - U * 2, 0.8); }
        break;
      }
      case 'swimwith': case 'escort': {
        const lead = I.kind === 'escort' && b.id === 'dragonfish' ? b : a, fol = lead === a ? b : a;
        if (!I.goal || Math.hypot(lead.x - I.goal[0], lead.y - I.goal[1]) < lead.len) I.goal = spot(lead, lead.tr.zone === 'b' && !fol.tr.W ? 'm' : lead.tr.zone);
        lead.tx = I.goal[0]; lead.ty = I.goal[1]; lead.boost = 0.9;
        const side = I.side || (I.side = Math.random() < 0.5 ? 1 : -1);
        fol.tx = lead.x - lead.face * lead.len * 0.3; fol.ty = lead.y + side * (lead.dh + fol.dh) * 0.38; fol.boost = 1.4;
        fol.tz = lead.tz;
        if (mateOf(a.uid) === b.uid && (I.hT -= dt) <= 0) { I.hT = rand(1.4, 2.6); heart((a.x + b.x) / 2, Math.min(a.y, b.y) - U * 2, 0.6); }
        if (I.kind === 'escort' && Math.random() < dt * 6) ember(fol.x, fol.y, 1);
        break;
      }
      case 'tag': {
        if (!I.swap && k > 0.5) I.swap = 1;
        const ch = I.swap ? b : a, run = I.swap ? a : b;
        if (!I.goal || Math.hypot(run.x - I.goal[0], run.y - I.goal[1]) < run.len) I.goal = spot(run, 'm');
        run.tx = I.goal[0]; run.ty = I.goal[1]; run.boost = 1.9;
        ch.tx = run.x; ch.ty = run.y; ch.boost = 1.85;
        if (Math.random() < dt * 8) TankEnv.bubble(sc, run.x - run.face * run.len * 0.5, run.y, U * rand(0.12, 0.3), { z: run.z });
        if (Math.hypot(ch.x - run.x, ch.y - run.y) < (ch.len + run.len) * 0.3 && I.t - (I.tagT || -9) > 1) { I.tagT = I.t; sparkle(run.x, run.y, '#ffffff', 3); play('boop'); }
        break;
      }
      case 'boop': {
        a.tx = b.x - Math.sign(b.x - a.x || 1) * b.len * 0.3; a.ty = b.y; a.boost = 1.6;
        b.tx = b.x; b.ty = b.y; b.boost = 0.4;
        if (!I.fx && Math.hypot(a.x - a.tx, a.y - a.ty) < a.len * 0.4) { I.fx = 1; b.wobble = 1; TankEnv.bubble(sc, b.x, b.y - b.hh, U * 0.35, { z: b.z }); play('boop'); }
        break;
      }
      case 'ring': {
        if (!I.fx && k > 0.15) { I.fx = 1; a.face = Math.sign(b.x - a.x) || 1; a.faceLock = 0.5; blowRing(a, b); }
        a.tx = a.x; a.ty = a.y; a.boost = 0.4;
        const R = I.ring;
        if (R) { b.tx = R.x + R.vx * 0.3; b.ty = R.y; b.boost = 1.6; if (!R.hit && Math.hypot(R.x - b.x, R.y - b.y) < R.r * 0.9) { R.hit = 1; sparkle(R.x, R.y, '#dff6ff', 6); play('ringpass'); } }
        break;
      }
      case 'clean': {
        b.tx = b.x; b.ty = b.y; b.boost = 0.25;
        a.tx = b.x + Math.sin(I.t * 1.2) * b.len * 0.32; a.ty = b.y + Math.sin(I.t * 2.3) * b.dh * 0.22; a.boost = 1;
        a.tz = Math.max(0, b.z - 0.05);
        if (Math.random() < dt * 3) sparkle(a.x + a.face * a.len * 0.4, a.y, 'rgba(255,255,255,0.7)', 1, 0.4);
        break;
      }
      case 'lure': {
        a.glow = 1; a.tx = a.x; a.ty = a.y; a.boost = 0.3;
        const lx = a.x + a.face * a.dw * 0.5, ly = a.y - a.dh * 0.42;
        b.tx = lx + a.face * b.len * 0.6; b.ty = ly; b.boost = 0.6;
        if (k > 0.78 && !I.fx) { I.fx = 1; a.gulp = 1; play('gulp', a.tier); flee(b, a.x, a.y, 1.1, 3); endInt(I); return; }
        break;
      }
    }
    if (I.t >= I.dur) endInt(I);
  }
  function endInt(I) {
    const i = ints.indexOf(I);
    if (i >= 0) ints.splice(i, 1);
    for (const f of [I.a, I.b]) if (f.int === I) { f.int = null; f.boost = 1; if (f.state === 'social') pickNext(f); }
    if (I.kind === 'flare') { const lose = I.a.len < I.b.len ? I.a : I.b, win = lose === I.a ? I.b : I.a; if (!lose.leaving) flee(lose, win.x, win.y, 1.3, 2.2); }
    if (I.kind === 'puff') { const q = I.a.id === 'puffer' ? I.b : I.a; if (!q.leaving) flee(q, q.x - q.face, q.y, 0.9, 1.8); }
  }
  /* Two of a kind, closest of all, become mates. */
  function celebrate(a, b) {
    for (let i = 0; i < 9; i++) setTimeout(() => { if (isOpen) heart((a.x + b.x) / 2 + rand(-1, 1) * U * 5, (a.y + b.y) / 2 - U * 2, 1.2); }, i * 140);
    play('mates');
    if (a.int) endInt(a.int);
    startInteraction(a, b, 'dance');
  }
  function socialTick(dt) {
    const n = fish.length, fed = fedRecently() ? 1.25 : 1;
    for (let i = 0; i < n; i++) {
      const a = fish[i];
      if (a.leaving || a.state === 'enter') continue;
      a.social -= dt;
      for (let j = i + 1; j < n; j++) {
        const b = fish[j];
        if (b.leaving || b.state === 'enter') continue;
        const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), R = (a.len + b.len) * 0.7;
        if (dx > R * 2.2 || dy > R * 2.2) continue;
        const d = Math.hypot(dx, dy), dz = Math.abs(a.z - b.z);
        if (d < R * 2.2 && dz < 0.5) addBond(a, b, 0.03 * dt * aff(a, b) * fed, true);
        if (d < R && dz < 0.4 && a.social <= 0 && b.social <= 0 && isFree(a) && isFree(b) && T - (met.get(bkey(a.uid, b.uid)) ?? -99) > 25 && Math.random() < 0.45) startInteraction(a, b);
      }
    }
  }

  /* ================= Touch ================= */
  const RDUR = { dart: 1, leap: 3, flash: 0.9, gulp: 1, nuzzle: 4, hop: 1.1, glow: 2.6, wiggle: 1.3, glide: 2.8, flare: 2, bury: 5, curl: 2, spin: 1.3, puff: 4, squirt: 1.2, bubble: 4.5, blush: 2.4, penguin: 3, loop: 2.4, ember: 2.4 };
  function reactTo(f, x, y) {
    f.taps = f.taps.filter(t => T - t < 4);
    f.taps.push(T);
    if (f.int) endInt(f.int);
    if (f.free) return;
    if (f.taps.length >= 4 && !f.tr.P && f.tr.react !== 'puff') { f.taps = []; f.react = null; hideAway(f); play('shy'); return; }
    startReact(f, f.tr.react, x, y);
    play('fish', f.tr.react, f.tier);
    const m = mateOf(f.uid), mf = m !== undefined && byUid(m);
    if (mf && isFree(mf)) { mf.with = f; go(mf, 'seek', 7, f.x, f.y, 1.5); }
    if (f.tr.S && ['dart', 'flash'].includes(f.tr.react)) for (const o of fish) if (o !== f && o.id === f.id && Math.hypot(o.x - f.x, o.y - f.y) < f.len * 5 && isFree(o)) startReact(o, f.tr.react, x, y);
  }
  function startReact(f, kind, x, y) {
    f.react = { kind, t: 0, dur: RDUR[kind] || 1.4, x, y };
    switch (kind) {
      case 'dart': flee(f, x, y, 0.9, 2.8); f.react.dur = 1; break;
      case 'leap': go(f, 'surface', 3, f.x + f.face * f.len, sc.surf + f.hh, 1.9); f.wantLeap = true; break;
      case 'flash': f.flash = 1; f.face = -f.face; f.faceLock = 0.7; sparkle(f.x, f.y, '#ffffff', 3); break;
      case 'gulp': f.gulp = 1; setTimeout(() => { if (!f.leaving) TankEnv.bubble(sc, f.x + f.face * f.len * 0.5, f.y - f.hh * 0.3, U * 0.5, { z: f.z }); }, 300); break;
      case 'nuzzle': go(f, 'nuzzle', 3.6, clamp(x, sc.swim.x0, sc.swim.x1), clamp(y, sc.swim.y0, floorAt(x) - f.hh), 1.4); f.tz = 0.02; f.nuzzled = false; break;
      case 'hop': f.free = true; f.vy = -U * 13; f.vx = f.face * U * 4; f.above = f.y < sc.surf; f.hopY = f.y; puffSand(f.x, floorAt(f.x), 1); break;
      case 'glow': f.glow = 1; break;
      case 'wiggle': f.wobble = 1; TankEnv.bubble(sc, f.x, f.y - f.hh, U * 0.3, { z: f.z }); break;
      case 'glide': { f.lc = [f.x + f.face * f.len * 0.8, f.y - f.len * 0.2]; f.lr = f.len * 0.9; go(f, 'loop', 2.8, f.x, f.y, 0.9); f.glidePrev = true; break; }
      case 'flare': f.flare = 1; break;
      case 'bury': go(f, 'idle', 5, f.x, floorAt(f.x)); f.bury = 1; puffSand(f.x, floorAt(f.x), 1.6); break;
      case 'curl': f.wobble = 1; break;
      case 'spin': sparkle(f.x, f.y, '#ffe6ff', 4); break;
      case 'puff': f.puff = 1; f.react.dur = 3 + f.taps.length; break;
      case 'squirt': squirt(f); break;
      case 'bubble': f.cocoon = 1; go(f, 'idle', 4.5, f.x, f.y); break;
      case 'blush': f.blush = 1; heart(f.x, f.y - f.dh * 0.6, 0.7); setTimeout(() => isOpen && !f.leaving && heart(f.x, f.y - f.dh * 0.7, 0.6), 400); break;
      case 'penguin': f.trail = 3; lap(f, 2.7); break;
      case 'loop': f.lc = [f.x + f.face * f.len * 0.3, f.y - f.len * 1.05]; f.lr = f.len * 1.05; f.trail = 2.5; go(f, 'loop', 2.2, f.x, f.y, 2.2); break;
      case 'ember': f.glow = 1; ember(f.x, f.y, 18); for (const o of fish) if (o !== f && isFree(o) && Math.hypot(o.x - f.x, o.y - f.y) < U * 30 && Math.random() < 0.6) startInteraction(f, o, 'escort'); break;
    }
  }
  function endReact(f) {
    const k = f.react.kind;
    f.react = null;
    if (k === 'bury') f.bury = 0;
    if (k === 'bubble') f.cocoon = 0;
  }
  function squirt(f) {
    const mx = f.x + f.face * f.len * 0.5, my = f.y - f.hh * 0.3, tg = sc.target;
    const tx = tg ? tg.x : mx + f.face * U * 6, ty = tg ? tg.y : sc.surf - U * 4;
    parts.push({ kind: 'jet', x: mx, y: my, tx, ty, t: 0 });
    play('squirt');
    if (tg && Math.abs(tg.x - mx) < U * 14) setTimeout(() => { TankEnv.shoo(sc); ripple(tx, sc.surf, 0.8); play('flutter'); }, 350);
  }
  function blowRing(f, to) {
    const dir = f.face, R = { kind: 'ring', x: f.x + dir * f.len * 0.6, y: f.y - f.hh * 0.2, vx: dir * U * 9, vy: -U * 1.5, r: U * 1.2, t: 0, life: 4 };
    parts.push(R);
    if (f.int) f.int.ring = R;
    if (!sc.rings) sc.rings = [];
    play('ring');
    void to;
  }

  /* ================= Feeding ================= */
  const FEED_COOL = 30;
  let lastFeed = -99;
  // flake food in its usual mix of colours, each with a paler edge
  const FLAKE = [['#e2563a', '#f6a088'], ['#f0913a', '#ffc98a'], ['#f2c65a', '#fff0b0'], ['#86b34a', '#c8e890'], ['#b97a42', '#e8c090']];
  function feed() {
    if (!isOpen || view !== 'tank') return;
    if (T - lastFeed < FEED_COOL) { play('deny'); return; }
    lastFeed = T; S.fed = Date.now(); dirty = true;
    const n = Math.min(24, 7 + Math.ceil(fish.length / 2.4));
    const cx = sc.ell ? sc.ell.cx + rand(-0.3, 0.3) * sc.ell.rx : lerp(sc.swim.x0, sc.swim.x1, rand(0.3, 0.7));
    const spread = Math.min((sc.ell ? sc.ell.rx * 0.75 : sc.iw * 0.22), U * 16);
    // sprinkled from above: flakes settle on the surface and float a while before tumbling down;
    // a few pellets plunk straight in and sink for the bottom-dwellers
    for (let i = 0; i < n; i++) {
      const pellet = Math.random() < 0.22, c = pick(FLAKE);
      parts.push({
        kind: 'flake', pellet, air: true, x: cx + rand(-1, 1) * spread, y: sc.surf - U * rand(2, 7), vy: U * rand(2, 5),
        ph: rand(0, TAU), rot: rand(0, TAU), spin: rand(0, TAU), spinR: rand(1.6, 3.4) * (Math.random() < 0.5 ? -1 : 1),
        col: pellet ? '#a8642c' : c[0], edge: pellet ? '#e0a060' : c[1], s: pellet ? rand(0.45, 0.65) : rand(0.75, 1.3),
        shape: Array.from({ length: 7 }, () => rand(0.5, 1)), float: pellet ? 0 : rand(1.2, 4.5), bites: !pellet && Math.random() < 0.4 ? 2 : 1,
        t: 0, delay: i * 0.045,
      });
    }
    play('flakes');
    for (const f of fish) {
      if (f.leaving || f.free) continue;
      if (f.int) endInt(f.int);
      f.eatDelay = rand(0.2, 1.5) / (f.tr.F || f.tr.C ? 1.7 : 1);
      go(f, 'eat', 16, f.x, f.y);
    }
    renderBar();
  }
  /* Where a fish's mouth is, as drawn. */
  function mouthOf(f) {
    const zs = 1 - f.z * 0.2, r = f.dw * 0.46 * zs, sg = f.flip < 0 ? -1 : 1;
    return [f.x + Math.cos(f.tilt) * r * sg, f.y + Math.sin(f.tilt) * r + f.dh * 0.04 * zs];
  }
  /* Feeding: each fish picks a morsel (bottom-dwellers wait for food to sink to them), noses up to it, and
     snaps it up: the morsel is sucked into its mouth, crumbs drift away, and it chews. A big flake can take
     two bites. */
  function eatTick(f, dt) {
    if (f.eatDelay > 0) { f.eatDelay -= dt; f.tx = f.x; f.ty = f.y; return; }
    const low = f.tr.W || f.tr.zone === 'b', deep = lerp(sc.surf, floorAt(f.x), 0.45);
    let best = null, bd = Infinity, any = false;
    for (const p of parts) {
      if (p.kind !== 'flake' || p.gone || p.suck || p.air || p.t <= p.delay) continue;
      any = true;
      if (p.claim && p.claim !== f && !p.claim.leaving && p.claim.state === 'eat') continue;
      if (low && !p.rest && p.y < deep) continue;
      const d = Math.hypot(p.x - f.x, p.y - f.y) * (f.tr.zone === 't' && p.float > 0 ? 0.6 : 1);
      if (d < bd) { bd = d; best = p; }
    }
    if ((!any && !parts.some(p => p.kind === 'flake' && (p.air || p.suck))) || f.st > f.dur) { pickNext(f); return; }
    if (!best) { f.tx = f.x + Math.sin(T + f.uid) * f.len * 0.2; f.ty = f.y; f.boost = 0.5; return; }
    if (bd < f.len * 3) best.claim = f;
    const dir = Math.sign(best.x - f.x) || f.face;
    f.face = dir; f.faceLock = 0.2;
    f.tx = best.x - dir * f.dw * 0.42; f.ty = clamp(best.y, sc.surf + f.hh * 0.95, floorAt(f.x) - f.hh * 0.5); f.boost = 1.25;
    const [mx, my] = mouthOf(f);
    if (Math.abs(f.flip) > 0.7 && Math.hypot(best.x - mx, best.y - my) < Math.max(f.len * 0.32, f.hh * 1.15, U * 2)) {
      // the snap: a quick lunge, and the morsel is drawn in
      best.suck = { f, k: 0, x0: best.x, y0: best.y };
      f.gulp = 1; f.boost = 2; f.effort = Math.max(f.effort, 1.2);
      if (best.y < sc.surf + U * 1.2) ripple(best.x, sc.surf, 0.45);
    }
  }
  function swallowed(p) {
    const f = p.suck.f, [mx, my] = mouthOf(f);
    f.chew = 1;
    for (let i = 0; i < 5; i++) spawn({ kind: 'crumb', x: mx + rand(-1, 1) * U * 0.5, y: my + rand(-1, 1) * U * 0.4, vx: rand(-1, 1) * U * 1.6 - (f.flip < 0 ? -1 : 1) * U * 0.6, vy: rand(-0.6, 0.8) * U, col: i % 2 ? p.col : p.edge, t: 0, life: rand(0.8, 1.5), s: rand(0.28, 0.55) });
    if (Math.random() < 0.6) TankEnv.bubble(sc, mx, my - U * 0.3, U * rand(0.15, 0.3), { z: f.z });
    if (T - eatSnd > 0.1) { eatSnd = T; play('gulp', f.tier); }
    if (p.bites > 1) {
      // a big flake: one bite, and the rest is knocked a little away, smaller
      p.bites -= 1; p.s *= 0.62; p.suck = null; p.claim = f;
      p.x = p.suck0x + (f.flip < 0 ? -1 : 1) * U * 0.9; p.y = p.suck0y + U * 0.3; p.vy = 0;
      return false;
    }
    for (const o of fish) if (o !== f && o.state === 'eat' && Math.hypot(o.x - f.x, o.y - f.y) < (f.len + o.len)) addBond(f, o, 0.5 * aff(f, o), true);
    return true;
  }
  let eatSnd = 0;

  /* ================= Moonpearls in the tank =================
     Pearls come to rest on the strip of sand nearest the glass, in front of every rock, plant and wreck,
     so none is ever hidden: up to three loose rows, each pearl taking a clear spot near where it fell.
     Bigger pearls are worth more. */
  const pearlR = d => U * clamp(1.15 + Math.log10(d.v + 1) * 0.45, 1.2, 2.55);
  // the sand nearest the glass at x, as [back edge, front edge]
  function bedBand(x) {
    const back = floorAt(x);
    let front = sc.iy1 - U * 2;
    if (sc.bowl) { const B = sc.bowl, dx = x - B.cx; front = Math.min(B.base - U * 1.6, B.cy + Math.sqrt(Math.max(0, B.R * B.R - dx * dx)) * 0.97 - U * 1.6); }
    return [back, Math.max(back + U, front)];
  }
  // how far across the sand pearls may lie (in the bowl, only where its gravel is deep enough)
  function bedX() {
    if (sc._bedX) return sc._bedX;
    let x0 = sc.ix0 + U * 3, x1 = sc.ix1 - U * 3;
    if (sc.bowl) {
      const ok = x => { const [b0, b1] = bedBand(x); return b1 - b0 > U * 3.2; };
      while (x0 < sc.bowl.cx && !ok(x0)) x0 += U * 0.5;
      while (x1 > sc.bowl.cx && !ok(x1)) x1 -= U * 0.5;
    }
    return (sc._bedX = [x0, x1]);
  }
  function restY(x, row, r) {
    const [b0, b1] = bedBand(x);
    return Math.max(b0 + r * 0.45, b1 - r * 1.05 - row * U * 1.8);
  }
  function restPos(d) {
    const [X0, X1] = bedX(), x = clamp(sc.ix0 + d.x * sc.iw, X0, X1), r = pearlR(d);
    return { x, y: restY(x, d.row || 0, r), r };
  }
  /* Find a pearl a clear spot near where it fell, nearest first, front row first. */
  function place(d) {
    const [X0, X1] = bedX(), r = pearlR(d), x0 = clamp(sc.ix0 + d.x * sc.iw, X0, X1), step = Math.max(2, U * 0.5);
    const others = S.drops.filter(q => q !== d).map(restPos);
    for (let k = 0; k < 200; k++) {
      const x = x0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
      if (x < X0 || x > X1) continue;
      for (let row = 0; row < 3; row++) {
        const y = restY(x, row, r);
        if (others.every(o => Math.hypot(o.x - x, o.y - y) > (o.r + r) * 1.06)) { d.x = (x - sc.ix0) / sc.iw; d.row = row; return; }
      }
    }
    d.x = (x0 - sc.ix0) / sc.iw; d.row = Math.floor(rand(0, 3));
  }
  function dropPearl(f, v) {
    const y = f.y + f.hh * 0.3;
    const d = addDrop(clamp((f.x - sc.ix0) / sc.iw, 0.04, 0.96), v, f.sp.rarity, f.uid);
    falling.set(d.k, { x0: f.x, y0: y, y, vy: 0, bounce: 0 });
    f.gulp = 1;
    sparkle(f.x, y, RARITIES[f.sp.rarity].color, 4);
    play('pearlDrop', f.tier);
  }
  // where a pearl is now: falling, being drawn to a finger, popping into view, or at rest
  function pearlPos(d) {
    const R = restPos(d), F = falling.get(d.k), L = lifted.get(d.k);
    if (L) return { x: L.x, y: L.y, r: R.r, s: 1 };
    if (F) {
      const k = clamp((F.y - F.y0) / Math.max(1, R.y - F.y0), 0, 1);
      return { x: lerp(F.x0, R.x, Math.pow(k, 0.7)) + Math.sin(F.y * 0.08) * U * 0.5 * (1 - k), y: Math.min(F.y, R.y) - F.bounce, r: R.r, s: 1 };
    }
    const P = pops.get(d.k);
    if (P) { const k = clamp(P.t / 0.45, 0, 1); return { x: R.x, y: R.y, r: R.r, s: k <= 0 ? 0 : 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k * 0.5) - (1 - k) * 0.6 }; }
    return { x: R.x, y: R.y, r: R.r, s: 1 };
  }
  /* Gathering pearls: one by one, or many in a sweep or a held finger, where each one in a quick run
     rings a note higher and the run's total counts up beside your finger. */
  const run = { n: 0, t: -9, sum: 0, label: null };
  function collect(d, at) {
    const i = S.drops.indexOf(d);
    if (i < 0) return;
    S.drops.splice(i, 1);
    const p = pearlPos(d), s = api.save;
    falling.delete(d.k); lifted.delete(d.k); pops.delete(d.k);
    s.pearls += d.v;
    s.stats.found = (s.stats.found || 0) + d.v;
    if (T - run.t > 0.75) { run.n = 0; run.sum = 0; run.label = null; }
    run.n++; run.t = T; run.sum += d.v;
    const col = (RARITIES[d.r] || RARITIES.rare).color;
    spawn({ kind: 'collect', x: p.x, y: p.y, t: 0, col, s: p.r / U });
    const lx = at ? at[0] : p.x, ly = (at ? at[1] : p.y) - U * 3.2;
    if (!run.label || run.label.t > 1.1) { run.label = { kind: 'tally', x: lx, y: ly, t: 0, v: 0, n: 0, pop: 0 }; parts.push(run.label); }
    const Lb = run.label;
    Lb.v = run.sum; Lb.n = run.n; Lb.t = 0; Lb.pop = 1; Lb.x = lerp(Lb.x, lx, 0.35); Lb.y = Math.min(Lb.y, ly);
    sparkle(p.x, p.y, '#ffffff', 4);
    sparkle(p.x, p.y, col, 2);
    play('pearlGet', d.v, run.n - 1);
    dirty = true;
    api.refresh();
    renderHead();
    const w = $('#tank-pearls');
    w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash');
  }
  /* A sweep: every pearl the finger's path passes over (generously) is gathered. */
  function sweep(x0, y0, x1, y1) {
    const R = Math.max(U * 3.4, 26), vx = x1 - x0, vy = y1 - y0, l2 = vx * vx + vy * vy || 1;
    for (const d of S.drops.slice()) {
      if (falling.has(d.k) || lifted.has(d.k)) continue;
      const p = pearlPos(d), q = clamp(((p.x - x0) * vx + (p.y - y0) * vy) / l2, 0, 1);
      if (Math.hypot(p.x - x0 - vx * q, p.y - y0 - vy * q) < R + p.r) { collect(d, [x1, y1]); seenGather(); }
    }
  }
  /* A held finger: a moonlit eddy grows around it and draws pearls in, gathering each as it arrives. */
  let hold = null;
  function stepHold(dt) {
    for (const [k, L] of lifted) {
      const d = S.drops.find(q => q.k === k);
      if (!d) { lifted.delete(k); continue; }
      const tx = hold ? hold.x : L.x, ty = hold ? hold.y : L.y;
      L.v = Math.min(L.v + U * 60 * dt, U * 70);
      const dx = tx - L.x, dy = ty - L.y, dd = Math.hypot(dx, dy) || 1;
      // they spiral in a little, rather than flying straight
      L.x += (dx / dd * 0.9 - dy / dd * 0.45) * L.v * dt; L.y += (dy / dd * 0.9 + dx / dd * 0.45) * L.v * dt;
      if (!hold) { lifted.delete(k); continue; }
      if (dd < U * 1.6 + L.v * dt) collect(d, [hold.x, hold.y]);
    }
    if (!hold) return;
    hold.t += dt;
    hold.r = U * (4 + Math.min(1, hold.t / 1.1) * 20);
    for (const d of S.drops) {
      if (lifted.has(d.k) || falling.has(d.k)) continue;
      const p = pearlPos(d);
      if (Math.hypot(p.x - hold.x, p.y - hold.y) < hold.r) { lifted.set(d.k, { x: p.x, y: p.y, v: U * 4 }); sparkle(p.x, p.y, '#eaf2ff', 2, 0.6); }
    }
  }

  /* ================= Little effects ================= */
  const spawn = p => { if (parts.length < 420) parts.push(p); };
  function heart(x, y, s = 1) { spawn({ kind: 'heart', x, y, s, t: 0, ph: rand(0, TAU) }); }
  function sparkle(x, y, col, n = 3, s = 1) { for (let i = 0; i < n; i++) spawn({ kind: 'spark', x: x + rand(-1, 1) * U * 2 * s, y: y + rand(-1, 1) * U * 1.5 * s, col, s: s * rand(0.6, 1.1), t: 0, life: rand(0.5, 0.9) }); }
  function ember(x, y, n) { for (let i = 0; i < n; i++) spawn({ kind: 'ember', x: x + rand(-1, 1) * U, y: y + rand(-1, 1) * U, vx: rand(-1, 1) * U * 6, vy: rand(-1, 0.3) * U * 5, t: 0, life: rand(0.8, 1.6) }); }
  function puffSand(x, y, s) { const col = sc.id === 'reef' ? '232,214,170' : sc.id === 'palace' ? '170,180,240' : sc.id === 'bowl' ? '220,200,230' : '170,150,110'; for (let i = 0; i < 6 * s; i++) spawn({ kind: 'sand', x: x + rand(-1, 1) * U, y: y - U * 0.3, vx: rand(-1, 1) * U * 5, vy: -rand(1, 3.5) * U, t: 0, life: rand(0.8, 1.4), col }); }
  function ripple(x, y, s = 1) { spawn({ kind: 'ripple', x, y, s, t: 0 }); }
  function splash(x, size) {
    ripple(x, sc.surf, 1.2);
    for (let i = 0; i < 8; i++) spawn({ kind: 'drop', x: x + rand(-1, 1) * U, y: sc.surf, vx: rand(-1, 1) * U * 6, vy: -rand(5, 11) * U, t: 0 });
    for (let i = 0; i < 6; i++) TankEnv.bubble(sc, x + rand(-1, 1) * size * 0.3, sc.surf + rand(1, 3) * U, U * rand(0.15, 0.4), { z: 0.3 });
    play('splashIn', clamp(size / (U * 10), 0.4, 1.3));
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      let dead = false;
      switch (p.kind) {
        case 'flake':
          if (p.t < p.delay) break;
          if (p.suck) {
            // being sucked into a mouth
            const S2 = p.suck, f = S2.f;
            if (!f || f.leaving || f.state !== 'eat') { p.suck = null; break; }
            S2.k += dt / 0.15;
            const [mx, my] = mouthOf(f), e = S2.k * S2.k;
            p.x = lerp(S2.x0, mx, e); p.y = lerp(S2.y0, my, e); p.spin += dt * 9;
            if (S2.k >= 1) { p.suck0x = S2.x0; p.suck0y = S2.y0; if (swallowed(p)) dead = true; }
          } else if (p.air) {
            p.vy += U * 40 * dt; p.y += p.vy * dt; p.spin += dt * p.spinR;
            if (p.y >= sc.surf) { p.air = false; p.y = sc.surf + U * 0.12; p.vy = p.pellet ? U * 2.5 : 0; if (Math.random() < 0.4) ripple(p.x, sc.surf, 0.3); }
          } else if (p.float > 0) {
            // afloat on the surface, drifting and bobbing
            p.float -= dt; p.x += Math.sin(p.t * 0.9 + p.ph) * U * 0.35 * dt; p.y = sc.surf + U * 0.12 + Math.sin(p.t * 2.2 + p.ph) * U * 0.06; p.spin = Math.PI / 2 + Math.sin(p.t + p.ph) * 0.2;
          } else if (!p.rest) {
            // sinking: a flake tumbles and sways as it drifts down; a pellet drops straighter
            const vT = p.pellet ? U * 3.2 : U * (0.8 + 0.5 * Math.abs(Math.sin(p.spin)));
            p.vy += (vT - p.vy) * Math.min(1, dt * 2);
            p.y += p.vy * dt; p.x += Math.sin(p.t * 1.6 + p.ph) * U * (p.pellet ? 0.15 : 0.95) * dt;
            p.spin += dt * p.spinR; p.rot += dt * p.spinR * 0.25;
            const fl = floorAt(p.x) - U * 0.25;
            if (p.y >= fl) { p.rest = 1; p.y = fl; p.rt = 0; p.spin = Math.PI / 2; }
          } else if ((p.rt += dt) > 25) dead = true;
          if (p.gone) dead = true;
          break;
        case 'crumb': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 2); p.vy += U * 0.8 * dt; dead = p.t > p.life; break;
        case 'heart': p.y -= U * 2.4 * dt; p.x += Math.sin(p.t * 3 + p.ph) * U * 0.7 * dt; dead = p.t > 2; break;
        case 'spark': dead = p.t > p.life; break;
        case 'text': p.y -= U * 2.6 * dt; dead = p.t > 1.4; break;
        case 'collect': dead = p.t > 0.75; break;
        case 'tally': p.y -= U * 0.8 * dt; p.pop = Math.max(0, p.pop - dt * 5); dead = p.t > 1.5; break;
        case 'ring': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 0.35); p.r += U * 1.3 * dt; dead = p.t > p.life || p.y < sc.surf + p.r; break;
        case 'jet': dead = p.t > 0.6; break;
        case 'sand': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += U * 3 * dt; p.vx *= Math.exp(-dt * 2.5); dead = p.t > p.life; break;
        case 'ripple': dead = p.t > 1.1; break;
        case 'ember': p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= U * 2 * dt; dead = p.t > p.life; break;
        case 'drop': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += U * 55 * dt; dead = p.vy > 0 && p.y > sc.surf; break;
        case 'tap': dead = p.t > 0.8; break;
      }
      if (dead) parts.splice(i, 1);
    }
    // a falling pearl sinks, drifting over to its spot, lands with a little bounce and a puff of sand
    for (const [k, F] of falling) {
      const d = S.drops.find(q => q.k === k);
      if (!d) { falling.delete(k); continue; }
      const R = restPos(d);
      if (F.land !== undefined) {
        F.land += dt;
        F.bounce = Math.max(0, Math.sin(F.land * 11) * U * 0.9 * Math.exp(-F.land * 7));
        if (F.land > 0.55) falling.delete(k);
        continue;
      }
      F.vy = Math.min(F.vy + U * 22 * dt, U * 15); F.y += F.vy * dt;
      if (F.y >= R.y) { F.y = R.y; F.land = 0; play('pearlLand'); puffSand(R.x, R.y + R.r, 0.5); sparkle(R.x, R.y, '#ffffff', 2, 0.6); }
    }
    for (const [k, P] of pops) {
      const was = P.t;
      P.t += dt;
      if (was < 0 && P.t >= 0) { const d = S.drops.find(q => q.k === k); if (d) { const R = restPos(d); sparkle(R.x, R.y, (RARITIES[d.r] || RARITIES.rare).color, 3); if (P.ring) play('pearlLand'); } }
      if (P.t > 0.45) pops.delete(k);
    }
    for (let i = lifts.length - 1; i >= 0; i--) if ((lifts[i].t -= dt) <= 0) lifts.splice(i, 1);
  }

  /* ================= Drawing ================= */
  function heartPath(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.5, y - s * 1.1, x, y - s * 0.5);
    c.bezierCurveTo(x + s * 0.5, y - s * 1.1, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  }
  function drawFish(c, f) {
    if (!f.dw) return;
    const s = sprite(f.id, f.dw * DPR), img = frameOf(s, Math.sin(f.wave - 0.7));
    if (!img) return;
    const zs = 1 - f.z * 0.2;
    let w = f.dw * zs * (1 + f.puff * 0.28), h = f.dh * zs * (1 + f.puff * 0.55) * (1 + f.flare * 0.12 * (0.75 + 0.25 * Math.sin(T * 18)));
    const g = f.gulp > 0 ? 1 + Math.sin((1 - f.gulp) * Math.PI) * 0.1 : 1;
    w *= g; h *= g;
    let flip = f.flip;
    if (f.react && f.react.kind === 'spin') flip = Math.cos(f.react.t / f.react.dur * TAU * 2) * f.face;
    if (Math.abs(flip) < 0.1) flip = flip < 0 ? -0.1 : 0.1;
    let rot = f.tilt + Math.sin(T * 24) * 0.12 * f.wobble;
    if (f.react && f.react.kind === 'curl') rot += Math.sin(f.react.t * 7) * 0.5 * (1 - f.react.t / f.react.dur);
    if (f.tr.V) rot += Math.sin(T * 1.1 + f.uid) * 0.06 + Math.sin(f.wave * 0.5) * 0.03;
    if (f.id === 'penguin' || f.id === 'puffer') rot += Math.sin(f.wave) * 0.04 * f.effort;
    // after a mouthful: a quick little shake of the head as it chews
    if (f.chew > 0) { rot += Math.sin(T * 26) * 0.04 * f.chew; h *= 1 + Math.sin(T * 26) * 0.025 * f.chew; }
    c.save();
    c.globalAlpha = f.alpha;
    c.translate(f.x, f.y);
    c.scale(flip, 1);
    c.rotate(rot);
    const bends = !(f.tr.V || f.id === 'penguin' || f.id === 'puffer' || f.id === 'seahorse') && w >= 14;
    if (!bends) c.drawImage(img, -w / 2, -h / 2, w, h);
    else {
      // the body as a strip of slices along a wave that runs from head to tail: the head stays steady, the
      // tail sweeps widest; eels ripple along their whole length; a climbing fish arches into the climb
      const E = f.tr.E, thun = f.id === 'dolphin' || f.id === 'swordfish' || f.id === 'barracuda';
      const n = E ? 10 : 7, sw = img.width / n, ew = f.effort;
      const A = w * (E ? 0.045 + 0.05 * ew : thun ? 0.03 + 0.055 * ew : 0.024 + 0.05 * ew) * (f.tr.W ? 0.7 : 1);
      const kw = E ? TAU * 1.2 : thun ? TAU * 0.35 : TAU * 0.55, ex = E ? 0.5 : thun ? 2.4 : 1.7;
      const yAt = u => Math.sin(f.wave - u * kw) * A * (E ? 0.25 + 0.75 * Math.pow(1 - u, ex) : Math.pow(1 - u, ex)) + f.arch * w * 0.14 * ((u - 0.5) * (u - 0.5) - 0.083);
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n, y0 = yAt(u0), y1 = yAt(u1), dw = w / n;
        c.save();
        c.translate(-w / 2 + (u0 + u1) / 2 * w, (y0 + y1) / 2);
        c.rotate(Math.atan2(y1 - y0, dw));
        // the tail fin turns edge-on and back as it sweeps, narrowing at each end of the stroke
        const sx = i === 0 && !E ? 1 - 0.16 * Math.abs(Math.cos(f.wave)) * Math.min(1, ew) : 1;
        c.drawImage(img, i * sw, 0, sw, img.height, dw / 2 - dw * sx - 0.9, -h / 2, dw * sx + 1.8, h);
        c.restore();
      }
    }
    if (f.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = f.flash * 0.3; c.drawImage(img, -w / 2, -h / 2, w, h); c.globalCompositeOperation = 'source-over'; c.globalAlpha = f.alpha; }
    if (f.blush > 0) { c.fillStyle = `rgba(255,140,190,${f.blush * 0.45})`; c.beginPath(); c.arc(w * 0.28, -h * 0.05, h * 0.3, 0, TAU); c.fill(); }
    if (f.cocoon > 0) {
      c.beginPath(); c.ellipse(0, 0, w * 0.62, h * 0.8, 0, 0, TAU);
      c.fillStyle = `rgba(215,240,255,${0.12 * f.cocoon})`; c.fill();
      c.strokeStyle = `rgba(230,248,255,${0.55 * f.cocoon})`; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.ellipse(-w * 0.22, -h * 0.42, w * 0.12, h * 0.1, -0.5, 0, TAU); c.fillStyle = `rgba(255,255,255,${0.5 * f.cocoon})`; c.fill();
    }
    c.restore();
  }
  function fishLayer(list, tint) {
    if (!list.length) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lctx.save();
    lctx.clip(sc.clip);
    for (const f of list) {
      if (f.bury > 0) { lctx.save(); lctx.clip(sc.above); drawFish(lctx, f); lctx.restore(); } else drawFish(lctx, f);
    }
    lctx.restore();
    lctx.globalCompositeOperation = 'source-atop';
    lctx.fillStyle = tint; lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0, W, H);
  }
  function shadows() {
    ctx.save();
    ctx.clip(sc.sandPath);
    for (const f of fish) {
      const fy = floorAt(f.x), h = fy - f.y, reach = sc.ih * 0.4;
      if (h > reach || f.alpha < 0.3) continue;
      const a = 0.22 * (1 - h / reach) * f.alpha, rx = f.dw * 0.32 * (1 - f.z * 0.2) * (1 + h / reach * 0.4);
      ctx.beginPath(); ctx.ellipse(f.x, fy + U * 0.4, rx, Math.max(U * 0.5, rx * 0.16), 0, 0, TAU);
      ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fill();
    }
    ctx.restore();
  }
  function glows() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of fish) {
      const col = GLOW[f.id];
      const g = Math.min(1.4, (col ? 0.35 + (sc.dark || 0) * 0.6 : 0) + f.glow * 0.9);
      if (g <= 0.02) continue;
      const c = col || '#fff2c8', zs = 1 - f.z * 0.2;
      let x = f.x, y = f.y, r = f.len * 0.9 * zs;
      if (f.id === 'anglerfish') { x = f.x + f.flip * f.dw * 0.48 * zs; y = f.y - f.dh * 0.42 * zs; r = f.len * 0.45; }
      const pulse = 0.85 + 0.15 * Math.sin(T * 2.2 + f.uid);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r * (1 + f.glow * 0.6));
      gr.addColorStop(0, TankEnv.rgba(c, 0.34 * g * pulse * f.alpha)); gr.addColorStop(1, TankEnv.rgba(c, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, r * (1 + f.glow * 0.6), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  /* A pearl is painted once per rarity and size: nacre that is warm white at its heart and takes the
     rarity's colour toward its rim, a pink and green sheen, a crisp highlight and a fine dark edge so it
     reads on pale sand; and, separately, its glow. */
  const pearlSprites = new Map();
  function pearlSprite(rar, r) {
    const R = Math.max(3, Math.round(r * DPR * 2) / 2), key = rar + '|' + R;
    let sp = pearlSprites.get(key);
    if (sp) return sp;
    if (pearlSprites.size > 90) pearlSprites.clear();
    const RA = RARITIES[rar] || RARITIES.rare, col = RA.color, deep = RA.deep;
    const mk = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
    const n = Math.ceil(R * 2.4) + 2, m = n / 2, body = mk(n), x = body.getContext('2d');
    let g = x.createRadialGradient(m - R * 0.35, m - R * 0.4, R * 0.05, m, m, R * 1.02);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fbf8ff'); g.addColorStop(0.62, TankEnv.mix('#efe9f7', col, 0.28));
    g.addColorStop(0.86, TankEnv.mix('#cbc2dc', col, 0.55)); g.addColorStop(1, TankEnv.mix('#6e6684', deep, 0.5));
    x.fillStyle = g; x.beginPath(); x.arc(m, m, R, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(m, m, R, 0, TAU); x.clip();
    g = x.createLinearGradient(m - R, m - R * 0.2, m + R * 0.6, m + R);
    g.addColorStop(0, 'rgba(255,170,220,0)'); g.addColorStop(0.45, 'rgba(255,175,225,0.35)'); g.addColorStop(0.7, 'rgba(160,255,230,0.3)'); g.addColorStop(1, 'rgba(160,220,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    x.restore();
    x.strokeStyle = TankEnv.rgba(col, 0.75); x.lineWidth = Math.max(1, R * 0.13); x.lineCap = 'round';
    x.beginPath(); x.arc(m, m, R * 0.9, 0.05, 1.75); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.beginPath(); x.ellipse(m - R * 0.38, m - R * 0.42, R * 0.3, R * 0.19, -0.65, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.arc(m + R * 0.32, m + R * 0.4, R * 0.12, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(30,22,58,0.62)'; x.lineWidth = Math.max(1, R * 0.09); x.beginPath(); x.arc(m, m, R - x.lineWidth / 2, 0, TAU); x.stroke();
    const n2 = Math.ceil(R * 8), m2 = n2 / 2, halo = mk(n2), h = halo.getContext('2d');
    g = h.createRadialGradient(m2, m2, 0, m2, m2, m2);
    g.addColorStop(0, TankEnv.rgba(col, 0.55)); g.addColorStop(0.18, TankEnv.rgba(col, 0.36)); g.addColorStop(0.45, TankEnv.rgba(col, 0.1)); g.addColorStop(1, TankEnv.rgba(col, 0));
    h.fillStyle = g; h.fillRect(0, 0, n2, n2);
    // its moonbeam: soft at the sides, fading upward
    const beam = mk(32); beam.height = 128;
    const bx = beam.getContext('2d');
    g = bx.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, TankEnv.rgba(col, 1)); g.addColorStop(1, TankEnv.rgba(col, 0));
    bx.fillStyle = g; bx.fillRect(0, 0, 32, 128);
    bx.globalCompositeOperation = 'destination-in';
    g = bx.createLinearGradient(0, 0, 32, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    bx.fillStyle = g; bx.fillRect(0, 0, 32, 128);
    sp = { body, halo, beam, k: n / R / 2, k2: n2 / R / 2 };
    pearlSprites.set(key, sp);
    return sp;
  }
  /* Pearls on the sand float a little above it, bobbing gently over a shadow that breathes with them,
     so they never read as pebbles. Each glows (brighter when the sand is full), stands in a faint moonbeam
     (taller for bigger pearls), now and then sends out a soft ring, and a glint runs along the row. */
  const hash = k => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  let poolImg = null;
  function pool() {
    if (poolImg) return poolImg;
    poolImg = document.createElement('canvas'); poolImg.width = poolImg.height = 64;
    const x = poolImg.getContext('2d'), g = x.createRadialGradient(32, 32, 7, 32, 32, 32);
    g.addColorStop(0, 'rgba(8,12,34,0.42)'); g.addColorStop(1, 'rgba(8,12,34,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return poolImg;
  }
  function drawPearls() {
    if (!S.drops.length) return;
    const full = bedFull(), c = ctx;
    for (const d of S.drops) {
      const P = pearlPos(d);
      if (P.s <= 0) continue;
      const r = P.r * P.s, sp = pearlSprite(d.r, P.r), resting = !falling.has(d.k) && !lifted.has(d.k), col = (RARITIES[d.r] || RARITIES.rare).color;
      const h = hash(d.k), bob = resting ? (0.5 + 0.5 * Math.sin(T * 2.3 + h * TAU)) : 0, lift = resting ? r * (0.25 + bob * 0.35) : 0, y = P.y - lift;
      // a pool of shade around each pearl, so white nacre stands out on the palest sand
      if (resting || lifted.has(d.k)) c.drawImage(pool(), P.x - r * 2.7, y - r * 2.7, r * 5.4, r * 5.4);
      if (resting) {
        const sk = 1 - bob * 0.18;
        c.fillStyle = `rgba(0,0,0,${0.34 - bob * 0.08})`; c.beginPath(); c.ellipse(P.x, P.y + r * 0.82, r * 1.15 * sk, r * 0.34 * sk, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.14)'; c.beginPath(); c.ellipse(P.x + r * 0.2, P.y + r * 0.86, r * 1.9, r * 0.52, 0, 0, TAU); c.fill();
      }
      c.save();
      c.globalCompositeOperation = 'lighter';
      if (resting) {
        // a moonbeam
        const big = Math.min(1, Math.log10(d.v + 1) / 2.2), bh = r * (5 + big * 9), bw = r * (1.6 + big), a = (0.06 + big * 0.12 + (full ? 0.06 : 0)) * (0.8 + 0.2 * Math.sin(T * 1.3 + h * 9));
        c.globalAlpha = a;
        c.drawImage(sp.beam, P.x - bw, y - bh, bw * 2, bh);
        c.globalAlpha = 1;
        // a ring that ripples out every few seconds
        const ph = (T * 0.21 + h) % 1;
        if (ph < 0.22) {
          const k = ph / 0.22;
          c.strokeStyle = TankEnv.rgba(col, 0.5 * (1 - k)); c.lineWidth = Math.max(1, U * 0.18 * (1 - k * 0.5));
          c.beginPath(); c.ellipse(P.x, P.y + r * 0.6, r * (1.2 + k * 3), r * (0.45 + k * 1.1), 0, 0, TAU); c.stroke();
        }
      }
      c.globalAlpha = clamp((sc.gl ? 0.42 : 0.6) + 0.2 * Math.sin(T * 2.1 + d.k * 0.37) + (full ? 0.25 : 0), 0, 1);
      const hs = r * sp.k2;
      c.drawImage(sp.halo, P.x - hs, y - hs, hs * 2, hs * 2);
      c.restore();
      const bs = r * sp.k;
      c.drawImage(sp.body, P.x - bs, y - bs, bs * 2, bs * 2);
      // the glint travels along the row, from left to right, every few seconds
      const gl = Math.pow(Math.max(0, Math.sin(T * 1.25 - P.x / W * 4.5 + (d.row || 0) * 0.4)), 30);
      if (gl > 0.05) { c.save(); c.globalCompositeOperation = 'lighter'; star(c, P.x - r * 0.38, y - r * 0.42, r * (0.8 + gl * 1.4), `rgba(255,255,255,${0.9 * gl})`); c.restore(); }
    }
  }
  /* Over everything: the eddy around a held finger, gathered pearls flying up to your purse, and the
     run's total. */
  function drawGather() {
    const c = ctx;
    if (hold && hold.t > 0.12) {
      const k = Math.min(1, (hold.t - 0.12) / 0.3), R = hold.r;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(hold.x, hold.y, 0, hold.x, hold.y, R);
      g.addColorStop(0, `rgba(230,240,255,${0.16 * k})`); g.addColorStop(0.7, `rgba(190,210,255,${0.06 * k})`); g.addColorStop(1, 'rgba(190,210,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(hold.x, hold.y, R, 0, TAU); c.fill();
      c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = -T * 2.4 + i * TAU / 3, rr = R * (0.55 + 0.3 * ((T * 0.8 + i / 3) % 1));
        c.strokeStyle = `rgba(235,244,255,${0.45 * k})`; c.lineWidth = Math.max(1.5, U * 0.35);
        c.beginPath(); c.arc(hold.x, hold.y, rr, a, a + 1.1); c.stroke();
      }
      c.strokeStyle = `rgba(225,238,255,${0.3 * k})`; c.lineWidth = Math.max(1, U * 0.2);
      c.beginPath(); c.arc(hold.x, hold.y, R, 0, TAU); c.stroke();
      c.restore();
    }
    for (const p of parts) {
      if (p.kind === 'collect') {
        const k = p.t / 0.75, e = k * k, x = lerp(p.x, W - U * 3, e), y = lerp(p.y, -U, e) - Math.sin(k * Math.PI) * U * 6, s = (p.s || 1) * (1 - k * 0.5);
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k * 0.5;
        c.fillStyle = TankEnv.rgba(p.col, 0.85); c.beginPath(); c.arc(x, y, U * 0.8 * s, 0, TAU); c.fill();
        star(c, x, y, U * 1.5 * s, 'rgba(255,255,255,0.9)');
        c.restore();
      } else if (p.kind === 'tally') {
        const a = 1 - Math.max(0, p.t - 1) / 0.5, sz = U * (2 + Math.min(1.6, Math.log10(p.n + 1) * 1.2)) * (1 + p.pop * 0.18);
        c.save(); c.globalAlpha = clamp(a, 0, 1);
        c.font = `800 ${Math.round(sz)}px Nunito, system-ui, sans-serif`; c.textAlign = 'center';
        const txt = `+${fmt(p.v)}`;
        c.lineWidth = Math.max(3, sz * 0.16); c.strokeStyle = 'rgba(10,16,34,0.75)'; c.strokeText(txt, p.x, p.y);
        c.fillStyle = '#ffe9a8'; c.fillText(txt, p.x, p.y);
        if (p.n > 1) { c.font = `700 ${Math.round(sz * 0.42)}px Nunito, system-ui, sans-serif`; c.lineWidth = 3; c.strokeText(`${p.n} pearls`, p.x, p.y + sz * 0.55); c.fillStyle = '#dfe9ff'; c.fillText(`${p.n} pearls`, p.x, p.y + sz * 0.55); }
        c.restore();
      }
    }
  }
  function star(c, x, y, s, col) {
    c.fillStyle = col; c.beginPath();
    c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s);
    c.fill();
  }
  function drawParts() {
    const c = ctx;
    for (const p of parts) {
      switch (p.kind) {
        case 'flake': {
          if (p.t < p.delay) break;
          const r = U * 0.74 * p.s * (p.suck ? 1 - p.suck.k * 0.65 : 1), a = p.rest ? clamp((25 - p.rt) / 3, 0, 1) : 1;
          c.save(); c.translate(p.x, p.y); c.globalAlpha = a;
          if (p.pellet) {
            c.beginPath(); c.arc(0, 0, r * 0.8, 0, TAU);
            const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 0.85); g.addColorStop(0, p.edge); g.addColorStop(1, p.col); c.fillStyle = g; c.fill();
          } else {
            // a thin, ragged flake that tumbles: seen face-on it is broad, edge-on a sliver
            c.rotate(p.rot); c.scale(1, 0.28 + 0.72 * Math.abs(Math.sin(p.spin)));
            c.beginPath();
            for (let i = 0; i < 7; i++) { const ang = i / 7 * TAU, rr = r * p.shape[i]; if (i) c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else c.moveTo(rr, 0); }
            c.closePath();
            c.globalAlpha = a * 0.92; c.fillStyle = p.col; c.fill();
            c.strokeStyle = p.edge; c.lineWidth = Math.max(0.6, r * 0.16); c.stroke();
            c.fillStyle = 'rgba(70,25,8,0.3)'; c.beginPath(); c.arc(r * 0.18, -r * 0.12, r * 0.18, 0, TAU); c.arc(-r * 0.3, r * 0.2, r * 0.12, 0, TAU); c.fill();
          }
          c.restore();
          break;
        }
        case 'crumb': { const k = p.t / p.life; c.globalAlpha = 1 - k; c.fillStyle = p.col; c.fillRect(p.x - U * p.s * 0.5, p.y - U * p.s * 0.5, U * p.s, U * p.s); c.globalAlpha = 1; break; }
        case 'heart': { const a = Math.min(1, p.t * 4) * (1 - Math.max(0, p.t - 1.3) / 0.7), s = U * 1.1 * p.s * (0.7 + Math.min(0.3, p.t)); c.save(); c.globalAlpha = a; c.shadowColor = 'rgba(255,120,170,0.8)'; c.shadowBlur = U * 1.2; heartPath(c, p.x, p.y, s); c.fillStyle = '#ff8ab4'; c.fill(); c.restore(); break; }
        case 'spark': { const k = p.t / p.life; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.sin(k * Math.PI); star(c, p.x, p.y, U * 0.9 * p.s, p.col); c.restore(); break; }
        case 'ember': { const k = p.t / p.life; c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,${150 + Math.round(80 * (1 - k))},80,${1 - k})`; c.beginPath(); c.arc(p.x, p.y, U * 0.35 * (1 - k * 0.5), 0, TAU); c.fill(); c.restore(); break; }
        case 'text': { const a = 1 - Math.max(0, p.t - 0.8) / 0.6; c.save(); c.globalAlpha = a; c.font = `800 ${Math.round(U * 2.2)}px Nunito, system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(10,20,30,0.7)'; c.strokeText(`+${p.v}`, p.x, p.y); c.fillStyle = '#ffe9a8'; c.fillText(`+${p.v}`, p.x, p.y); c.restore(); break; }
        case 'ring': { const a = (1 - p.t / p.life) * 0.85; c.save(); c.translate(p.x, p.y); c.rotate(-0.15); c.beginPath(); c.ellipse(0, 0, p.r * 0.42, p.r, 0, 0, TAU); c.strokeStyle = `rgba(225,245,255,${a})`; c.lineWidth = Math.max(1.5, U * 0.5); c.stroke(); c.restore(); break; }
        case 'jet': { const k = p.t / 0.6; c.save(); c.strokeStyle = `rgba(220,245,255,${0.9 * (1 - k)})`; c.lineWidth = Math.max(1.2, U * 0.35); c.lineCap = 'round'; c.beginPath(); const e = Math.min(1, k * 2.2); c.moveTo(p.x, p.y); c.quadraticCurveTo(lerp(p.x, p.tx, 0.4), Math.min(p.y, p.ty) - U * 3, lerp(p.x, p.tx, e), lerp(p.y, p.ty, e)); c.stroke(); c.restore(); break; }
        case 'sand': { const k = p.t / p.life; c.fillStyle = `rgba(${p.col},${0.55 * (1 - k)})`; c.beginPath(); c.arc(p.x, p.y, U * (0.3 + k * 0.5), 0, TAU); c.fill(); break; }
        case 'ripple': { const k = p.t / 1.1; c.save(); c.strokeStyle = `rgba(235,248,255,${0.6 * (1 - k)})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(p.x, p.y, U * (1 + k * 6) * p.s, U * (0.25 + k * 0.8) * p.s, 0, 0, TAU); c.stroke(); c.restore(); break; }
        case 'drop': c.fillStyle = 'rgba(225,245,255,0.8)'; c.beginPath(); c.arc(p.x, p.y, U * 0.25, 0, TAU); c.fill(); break;
        case 'tap': { const k = p.t / 0.8; c.save(); c.strokeStyle = `rgba(235,248,255,${0.5 * (1 - k)})`; c.lineWidth = 1.5; for (const o of [0, 0.25]) { const kk = clamp(k - o, 0, 1); if (kk <= 0) continue; c.beginPath(); c.arc(p.x, p.y, U * (0.6 + kk * 4.5), 0, TAU); c.stroke(); } c.restore(); break; }
      }
    }
  }
  function drawSelection() {
    const f = sel;
    if (!f || f.leaving) return;
    const zs = 1 - f.z * 0.2, rx = Math.max(f.dw * 0.58 * zs, U * 3.6), ry = Math.max(f.dh * 0.62 * zs, U * 3), p = 0.5 + 0.5 * Math.sin(T * 3);
    ctx.save();
    ctx.strokeStyle = `rgba(232,196,108,${0.55 + p * 0.3})`; ctx.lineWidth = 1.6; ctx.shadowColor = 'rgba(232,196,108,0.8)'; ctx.shadowBlur = 8;
    ctx.setLineDash([U * 1.6, U * 1.1]); ctx.lineDashOffset = -T * U * 3;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8c46c';
    const ty = f.y - ry - U * 1.2 - p * U * 0.5;
    ctx.beginPath(); ctx.moveTo(f.x - U * 0.8, ty - U * 0.9); ctx.lineTo(f.x + U * 0.8, ty - U * 0.9); ctx.lineTo(f.x, ty); ctx.closePath(); ctx.fill();
    ctx.restore();
    const m = mateOf(f.uid), mf = m !== undefined && byUid(m);
    if (mf) { ctx.save(); ctx.globalAlpha = 0.85; heartPath(ctx, mf.x, mf.y - Math.max(mf.dh * 0.6, U * 3) - U, U * 1.1); ctx.fillStyle = '#ff8ab4'; ctx.fill(); ctx.restore(); }
  }
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(sc.bg, 0, 0, W, H);
    TankEnv.back(ctx, sc, T);
    shadows();
    const order = fish.slice().sort((a, b) => b.z - a.z);
    fishLayer(order.filter(f => f.z >= 0.5), sc.tint.far);
    TankEnv.mid(ctx, sc, T);
    fishLayer(order.filter(f => f.z < 0.5), sc.tint.near);
    glows();
    ctx.save(); ctx.clip(sc.clip); drawParts(); ctx.restore();
    TankEnv.front(ctx, sc, T, () => { ctx.save(); ctx.clip(sc.clip); drawPearls(); ctx.restore(); });
    drawSelection();
    drawGather();
  }

  /* ================= Each frame ================= */
  function update(dt) {
    T += dt;
    TankEnv.step(sc, dt, T, envApi);
    accrue(dt / 3600, fedRecently() ? FED_BOOST : 1);
    stepHold(dt);
    socialT -= dt;
    if (socialT <= 0) { socialT = 0.12; socialTick(0.12); }
    for (const f of fish) {
      think(f, dt);
      f.puff = f.react && f.react.kind === 'puff' ? Math.min(1, f.puff + dt * 3) : Math.max(0, f.puff - dt * (f.int && f.int.kind === 'puff' ? 0 : 0.5));
      f.flare = f.int && f.int.kind === 'flare' ? f.flare : f.react && f.react.kind === 'flare' ? 1 : Math.max(0, f.flare - dt * 1.5);
      f.glow = f.react && ['glow', 'ember'].includes(f.react.kind) ? 1 : Math.max(0, f.glow - dt * 0.6);
      f.wobble = Math.max(0, f.wobble - dt * 0.9); f.gulp = Math.max(0, f.gulp - dt * 2.2); f.flash = Math.max(0, f.flash - dt * 1.6);
      f.blush = Math.max(0, f.blush - dt * 0.35); f.trail = Math.max(0, f.trail - dt);
      if (f.cocoon > 0 && !(f.react && f.react.kind === 'bubble')) f.cocoon = Math.max(0, f.cocoon - dt * 2);
      if (f.react && f.react.kind === 'glide' && Math.random() < dt * 10) sparkle(f.x - f.face * f.len * 0.4, f.y, 'rgba(255,255,255,0.8)', 1, 0.5);
      if (f.trail > 0 && Math.random() < dt * 16) TankEnv.bubble(sc, f.x - f.flip * f.len * 0.5, f.y, U * rand(0.15, 0.35), { z: f.z });
      if (f.leaving) f.alpha = clamp(1 - (f.leaving.t - 0.5) / 1.1, 0, 1);
    }
    for (const I of ints.slice()) interact(I, dt);
    for (const f of fish) move(f, dt);
    fish = fish.filter(f => !(f.leaving && f.leaving.t > 1.7));
    stepParts(dt);
    if ((ambT -= dt) <= 0) { ambT = rand(3, 7); play('tankAmb', sc.id); }
  }

  /* ================= What decor can ask of the fish ================= */
  const envApi = {
    play: (n, ...a) => play(n, ...a),
    ripple: (x, y, s) => ripple(x, y, s),
    scare(x, y, r) { for (const f of fish) if (!f.leaving && !f.free && Math.hypot(f.x - x, f.y - y) < r * (f.tr.Y ? 1.6 : 1)) flee(f, x, y, rand(0.8, 1.3), 2.4); },
    attract(x, y, secs, who) {
      for (const f of fish) {
        if (!(isFree(f) || f.state === 'gather')) continue;
        const ok = who === 'all' || (who === 'glow' ? f.tr.G || f.tr.C || Math.random() < 0.2 : f.tr.C || f.tr.P || Math.random() < 0.25);
        if (!ok || Math.hypot(f.x - x, f.y - y) > Math.max(sc.iw, sc.ih) * 0.65) continue;
        go(f, 'gather', secs * rand(0.8, 1.2), clamp(x + rand(-1, 1) * f.len, sc.swim.x0, sc.swim.x1), clamp(y + rand(-0.6, 0.6) * f.len * 0.6, sc.swim.y0, floorAt(x) - f.hh), 1.2);
        f.face = Math.sign(x - f.x) || f.face; f.tz = clamp(f.tz, 0.2, 0.6);
      }
    },
    lift(x, y0, y1, w, secs) {
      lifts.push({ x, y0, y1, w, t: secs, all: secs > 3 });
      if (secs > 3) for (const f of fish) if (isFree(f) && (f.tr.P || f.tr.C) && Math.abs(f.x - x) < U * 28 && !f.tr.W) visit(f, { kind: 'ride', x, y: y1 - U * 2, z: 0.5 });
    },
    procession(kind, n) {
      const P = sc.pois.filter(p => p.kind === 'through');
      if (!P.length) return;
      const p = pick(P), s0 = p.path[0];
      const line = fish.filter(f => isFree(f) && !f.tr.W && !f.tr.V).sort((a, b) => Math.hypot(a.x - s0[0], a.y - s0[1]) - Math.hypot(b.x - s0[0], b.y - s0[1])).slice(0, n);
      line.forEach((f, i) => { visit(f, p); f.boost = 1.25 - i * 0.04; f.dur = 24; });
    },
    look(x, y, secs) { for (const f of fish) if (!f.leaving && !f.free && f.state !== 'social') { go(f, 'look', secs * rand(0.8, 1.3), f.x, f.y, 0.3); f.face = Math.sign(x - f.x) || f.face; f.faceLock = secs; } },
    pearl(x, y, v, r) {
      if (!isOpen) return;
      const d = addDrop(clamp((x - sc.ix0) / sc.iw, 0.04, 0.96), v, r);
      falling.set(d.k, { x0: x, y0: y, y, vy: -U * 6, bounce: 0 });
      sparkle(x, y, (RARITIES[r] || RARITIES.rare).color, 6);
      play('pearlDrop', 2);
    },
    party() { for (const f of fish) if (!f.leaving && !f.free) { if (f.int) endInt(f.int); startReact(f, 'spin', f.x, f.y); f.glow = 1; if (Math.random() < 0.5) heart(f.x, f.y - f.dh * 0.6, 0.7); } },
    event(kind) { if (kind === 'anemone') { const p = sc.pois.find(q => q.kind === 'anemone'); for (const f of fish) if (p && f.id === 'clownfish' && !f.leaving && !f.free) { if (f.int) endInt(f.int); visit(f, p); f.boost = 2.3; } } },
    ready: key => Date.now() >= ((S.decor || {})[key] || 0),
    use(key, ms) { S.decor = S.decor || {}; S.decor[key] = Date.now() + ms; dirty = true; },
  };

  /* ================= Pointer ================= */
  function local(e) {
    const b = cv.getBoundingClientRect();
    let x = (e.clientX - b.left) * W / b.width, y = (e.clientY - b.top) * H / b.height;
    // through the bowl's lens, a point on screen shows what is a little nearer its middle
    if (sc && sc.gl && sc.bowl) {
      const B = sc.bowl, dx = (x - B.cx) / B.R, dy = (y - B.cy) / B.R, r2 = dx * dx + dy * dy;
      if (r2 < 1) { const k = 0.9 + 0.1 * r2 * r2; x = B.cx + dx * k * B.R; y = B.cy + dy * k * B.R; }
    }
    return [x, y];
  }
  /* A press that stays put becomes a hold (an eddy that draws pearls in); one that moves becomes a sweep
     (gathering every pearl it passes over, while curious fish follow the finger); a quick press is a tap. */
  function onDown(e) {
    if (!sc) return;
    const [x, y] = local(e);
    down = { x, y, lx: x, ly: y, t: performance.now(), moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    clearTimeout(holdT);
    holdT = setTimeout(() => { if (down && !down.moved && view === 'tank') { hold = { x: down.lx, y: down.ly, t: 0, r: U * 4 }; down.held = true; } }, 230);
  }
  function onMove(e) {
    const [x, y] = local(e);
    ptrTo[0] = clamp(x / W, 0, 1); ptrTo[1] = clamp(y / H, 0, 1);
    if (!down) return;
    if (!down.moved && !hold && Math.hypot(x - down.x, y - down.y) > 10) {
      down.moved = true;
      clearTimeout(holdT);
      // a finger trailed through the water: the curious and the playful follow it
      for (const f of fish) if (isFree(f) && (f.tr.C || f.tr.P) && !f.tr.W) { go(f, 'chase', 8, x, y, 1.5); f.tz = 0.15; }
    }
    if (hold) { hold.x = x; hold.y = y; }
    else if (down.moved) {
      sweep(down.lx, down.ly, x, y);
      drag = { x: clamp(x, sc.swim.x0, sc.swim.x1), y: clamp(y, sc.swim.y0, floorAt(x)) };
      if (Math.random() < 0.3) TankEnv.bubble(sc, drag.x, drag.y, U * rand(0.1, 0.25), { z: 0.1 });
    }
    down.lx = x; down.ly = y;
  }
  function onUp(e) {
    clearTimeout(holdT);
    if (!down) return;
    const [x, y] = local(e), quick = performance.now() - down.t < 650;
    if (!down.moved && !down.held && quick) tapAt(x, y);
    if (hold && hold.t > 0.15) seenGather();
    down = null; drag = null; hold = null;
  }
  // after the first gather by sweep or hold, the pearl hint has done its job
  function seenGather() { if (!S.swept) { S.swept = true; dirty = true; } }
  function tapAt(x, y) {
    // a pearl on the sand (generously, for fingers)
    let best = null, bd = Infinity;
    for (const d of S.drops) { const p = pearlPos(d), dd = Math.hypot(p.x - x, p.y - y); if (dd < Math.max(U * 3, 22) + p.r && dd < bd) { bd = dd; best = d; } }
    if (best) { collect(best); return; }
    const hit = f => {
      if (f.leaving || f.alpha < 0.5) return false;
      const zs = 1 - f.z * 0.2, rx = Math.max(f.dw * 0.42 * zs, 12), ry = Math.max(f.dh * 0.4 * zs, 11);
      return ((x - f.x) / rx) ** 2 + ((y - f.y) / ry) ** 2 <= 1;
    };
    // fish in view come first, nearest first; then decor; then fish tucked away in a hiding place
    const order = fish.slice().sort((a, b) => a.z - b.z);
    let f = order.find(q => !q.hide && hit(q));
    if (f) { select(f, x, y); return; }
    if (TankEnv.tap(sc, x, y, envApi)) return;
    f = order.find(q => hit(q));
    if (f) { select(f, x, y); return; }
    tapWater(x, y);
  }
  function select(f, x, y) {
    const again = sel === f;
    sel = f;
    reactTo(f, x, y);
    if (!again) play('select');
    renderCard(true);
  }
  function tapWater(x, y) {
    if (!sc.inWater(x, y)) return;
    parts.push({ kind: 'tap', x, y, t: 0 });
    play('glass');
    if (sel) { sel = null; renderCard(); }
    for (const f of fish) {
      if (!(isFree(f) || f.state === 'gather')) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (f.tr.Y && d < U * 24) { flee(f, x, y, 1.2, 2.4); continue; }
      if ((f.tr.C || f.tr.P) && d < Math.max(sc.iw, sc.ih) * 0.55 && Math.random() < 0.85) {
        go(f, 'gather', rand(2.5, 4), clamp(x - Math.sign(x - f.x || 1) * f.len * 0.7, sc.swim.x0, sc.swim.x1), clamp(y, sc.swim.y0, floorAt(x) - f.hh), 1.3);
        f.tz = 0.1;
      }
    }
  }

  /* ================= Interface ================= */
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  const tankDef = () => TANKS[api.save.netTier];
  function since(at) {
    const m = (Date.now() - (at || Date.now())) / 60e3;
    if (m < 60) return 'Arrived a little while ago';
    if (m < 60 * 24) { const h = Math.round(m / 60); return `In your tank for ${h} hour${h === 1 ? '' : 's'}`; }
    const d = Math.round(m / 1440);
    return `In your tank for ${d} day${d === 1 ? '' : 's'}`;
  }
  function renderHead() {
    const T0 = tankDef();
    $('#tank-title').textContent = T0.name;
    $('#tank-sub').textContent = T0.blurb;
    $('#tank-pearls').innerHTML = pearlsHTML(api.save.pearls);
  }
  function renderBar() {
    const s = api.save, cap = TANKS[s.netTier].cap, n = s.net.length;
    $('#tank-count').innerHTML = `<b>${n}</b> of ${cap} fish`;
    $('#tank-capbar').style.width = Math.min(100, n / cap * 100) + '%';
    $('#tank-cap').classList.toggle('full', n >= cap);
    const loose = s.net.filter(f => !f.fav), total = loose.reduce((a, f) => a + f.value, 0), armed = Date.now() - sellAllArmed < 3200;
    const b = $('#tank-sellall');
    b.disabled = !loose.length;
    b.classList.toggle('armed', armed);
    b.innerHTML = armed ? `Tap again to sell ${loose.length} fish` : `<span>Sell <span class="wide-only">all </span>unstarred ·</span>${pearlsHTML(total)}`;
    const v = $('#tank-view');
    v.setAttribute('aria-pressed', view === 'list' ? 'true' : 'false');
    v.querySelector('span').textContent = view === 'list' ? 'Tank' : 'List';
    $('#tank-feed').hidden = view === 'list';
  }
  /* The first few times pearls are waiting, a hint says how to gather them. */
  let pearlHinted = false;
  function renderPearlHint() {
    let on = 0;
    for (const d of S.drops) if (!falling.has(d.k)) on++;
    if (!pearlHinted && !S.swept && on >= 2 && view === 'tank' && $('#tank-hint').hidden) { pearlHinted = true; $('#pearl-hint').hidden = false; }
    if (S.swept && !$('#pearl-hint').hidden) $('#pearl-hint').hidden = true;
  }
  let cardSig = '';
  function renderCard(force) {
    const el = $('#fish-card');
    if (!sel || sel.leaving || view !== 'tank' || !isOpen) { el.hidden = true; cardSig = ''; return; }
    const f = sel, rec = f.rec, sp = f.sp, R = RARITIES[sp.rarity], c = api.save.caught[f.id] || {};
    const tags = [];
    if (c.best && rec.kg >= c.best) tags.push('Heaviest');
    if (c.len && rec.cm >= c.len) tags.push('Longest');
    const bonds = bondsOf(f.uid).filter(b => fishRec(b.uid)).slice(0, 3);
    const armedS = Date.now() - sellArmed < 3200, armedR = Date.now() - releaseArmed < 3200;
    const bondHTML = bonds.map(b => {
      const o = fishRec(b.uid), name = SPECIES[o.id].name, label = b.v > 100 ? 'Mates' : BOND.slice(1).find(([v]) => b.v >= v)[1];
      return `<li><button type="button" class="fc-bond${b.v > 100 ? ' mates' : ''}" data-tk="goto" data-uid="${b.uid}">${b.v > 100 ? '<span aria-hidden="true">💕</span>' : '<i aria-hidden="true"></i>'}${label} with ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${esc(name)}</button></li>`;
    }).join('');
    const sig = [f.uid, rec.fav, armedS, armedR, bonds.map(b => b.uid + ':' + Math.floor(b.v / 10)).join(','), rec.pearls || 0].join('|');
    if (!force && sig === cardSig) return;
    cardSig = sig;
    el.style.setProperty('--rc', R.color);
    el.innerHTML = `
      <div class="fc-head">
        <div class="fc-title"><h3>${esc(sp.name)}</h3>${tags.map(t => `<em class="tag">${t}</em>`).join('')}</div>
        <button type="button" class="fc-close" data-tk="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <p class="fc-meta"><i class="dot"></i>${R.name} · ${rec.kg.toFixed(2)} kg · ${Math.round(rec.cm)} cm</p>
      <p class="fc-mood">${temperament(f.id)}</p>
      ${bondHTML ? `<ul class="fc-bonds">${bondHTML}</ul>` : ''}
      <p class="fc-since">${since(rec.at)}${rec.pearls ? ` · has left you ${pearlsHTML(rec.pearls)}` : ''}</p>
      <div class="fc-act">
        <button type="button" class="star-btn${rec.fav ? ' on' : ''}" data-tk="fav" aria-pressed="${rec.fav ? 'true' : 'false'}" aria-label="${rec.fav ? 'Unstar' : 'Star'} ${esc(sp.name)}">${STAR}</button>
        <button type="button" class="sell-btn${armedS ? ' armed' : ''}" data-tk="sell">${armedS ? 'Tap again to sell' : `Sell · ${pearlsHTML(rec.value)}`}</button>
        <button type="button" class="text-btn${armedR ? ' armed' : ''}" data-tk="release">${armedR ? 'Tap again to release' : 'Release'}</button>
      </div>`;
    el.hidden = false;
    if (force) placeCard();
  }
  /* The card sits at the bottom of the tank, or the top when the fish it describes swims beneath it. */
  function placeCard() {
    const el = $('#fish-card');
    if (el.hidden || !sel) return;
    const ch = el.offsetHeight, cw = el.offsetWidth, top = el.classList.contains('top');
    const under = sel.x < cw + 30;
    if (!top && under && sel.y > H - ch - 24) el.classList.add('top');
    else if (top && (!under || sel.y < ch + 24)) el.classList.remove('top');
  }
  function renderList() {
    const box = $('#tank-list');
    if (view !== 'list') { box.hidden = true; return; }
    const s = api.save, list = s.net.slice().sort((a, b) => b.value - a.value);
    let html = '';
    if (!list.length) html = '<p class="empty">Your tank is empty. Fish you keep come to live here.</p>';
    else {
      html = '<ul class="fishlist">';
      for (const f of list) {
        const sp = SPECIES[f.id], R = RARITIES[sp.rarity], rec = s.caught[f.id] || {}, tags = [];
        if (rec.best && f.kg >= rec.best) tags.push('Heaviest');
        if (rec.len && f.cm >= rec.len) tags.push('Longest');
        const mate = S.mates[f.uid] !== undefined;
        html += `
          <li class="fishrow" style="--rc:${R.color}">
            <canvas class="fr-art" data-fish="${f.id}" aria-hidden="true"></canvas>
            <div class="fr-main">
              <button type="button" class="fr-name fr-link" data-tk="show" data-uid="${f.uid}">${esc(sp.name)}${mate ? '<span class="fr-heart" aria-label="has a mate">💕</span>' : ''}${tags.map(t => `<em class="tag">${t}</em>`).join('')}</button>
              <span class="fr-meta"><i class="dot"></i>${R.name} · ${f.kg.toFixed(2)} kg · ${Math.round(f.cm)} cm</span>
            </div>
            <span class="fr-val">${pearlsHTML(f.value)}</span>
            <div class="fr-act">
              <button type="button" class="star-btn${f.fav ? ' on' : ''}" data-tk="fav" data-uid="${f.uid}" aria-pressed="${f.fav ? 'true' : 'false'}" aria-label="${f.fav ? 'Unstar' : 'Star'} ${esc(sp.name)}">${STAR}</button>
              <button type="button" class="sell-btn" data-tk="sell" data-uid="${f.uid}">Sell</button>
            </div>
          </li>`;
      }
      html += '</ul>';
    }
    box.innerHTML = html;
    box.hidden = false;
    requestAnimationFrame(paintList);
  }
  function paintList() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    document.querySelectorAll('#tank-list canvas[data-fish]').forEach(c => {
      if (c.dataset.done) return;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w) return;
      c.width = Math.round(w * d); c.height = Math.round(h * d);
      const x = c.getContext('2d');
      x.drawImage(FishGL.render(c.dataset.fish, 0.6, w * d, h * d, { still: true, fit: 0.98 }), 0, 0);
      c.dataset.done = '1';
    });
  }
  function renderUI() {
    renderHead(); renderBar(); renderList(); renderCard(true);
    $('#tank-stage').classList.toggle('listing', view === 'list');
  }
  function toggleView() {
    view = view === 'list' ? 'tank' : 'list';
    play('click');
    if (view === 'list') sel = null;
    UIFX.swap($('#m-tank .card'), $('#tank-stage'), renderUI, view === 'list' ? 1 : -1);
  }
  function sellFish(uids, how = 'sell') {
    const s = api.save;
    let total = 0, n = 0;
    for (const uid of uids) {
      const i = s.net.findIndex(f => f.uid === uid);
      if (i < 0) continue;
      const rec = s.net[i];
      s.net.splice(i, 1);
      forget(uid);
      if (how === 'sell') { total += rec.value; n += 1; if (s.caught[rec.id]) s.caught[rec.id].sold = (s.caught[rec.id].sold || 0) + 1; }
      else s.stats.released += 1;
      const f = fish.find(x => x.uid === uid);
      if (f) {
        if (f.int) endInt(f.int);
        f.react = null; f.leaving = { kind: how, t: 0 };
        if (how === 'sell') { sparkle(f.x, f.y, '#ffe9a8', 5); parts.push({ kind: 'text', x: f.x, y: f.y - f.dh * 0.6, t: 0, v: rec.value }); }
        else { sparkle(f.x, f.y, '#dff6ff', 6); for (let k = 0; k < 6; k++) TankEnv.bubble(sc, f.x + rand(-1, 1) * f.len * 0.4, f.y, U * rand(0.2, 0.5), { z: f.z }); }
        if (sel === f) sel = null;
      }
    }
    affC.clear();
    if (how === 'sell' && n) {
      s.pearls += total; s.stats.sold += n; s.stats.earned += total;
      play('coin', n);
      if (n > 1) api.toast(`Sold ${n} fish for ${fmt(total)} Moonpearls`, '#e8c46c', 2600);
      api.flashWallet();
    }
    if (how === 'release') play('release');
    sellArmed = releaseArmed = 0;
    api.persist(); api.refresh();
    renderUI();
  }
  function sellAll() {
    const s = api.save;
    if (Date.now() - sellAllArmed < 3200) { sellAllArmed = 0; sellFish(s.net.filter(f => !f.fav).map(f => f.uid)); return; }
    sellAllArmed = Date.now();
    play('click');
    renderBar();
    setTimeout(() => { if (sellAllArmed && Date.now() - sellAllArmed >= 3200) { sellAllArmed = 0; if (isOpen) renderBar(); } }, 3300);
  }
  function onCard(e) {
    const b = e.target.closest('[data-tk]');
    if (!b || !sel) return;
    const rec = sel.rec;
    switch (b.dataset.tk) {
      case 'close': sel = null; play('click'); renderCard(); break;
      case 'fav': rec.fav = !rec.fav; play('equip'); api.persist(); renderCard(true); renderBar(); break;
      case 'sell':
        if (rec.fav && Date.now() - sellArmed > 3200) { sellArmed = Date.now(); play('click'); renderCard(true); setTimeout(() => isOpen && renderCard(true), 3300); break; }
        sellFish([rec.uid]); break;
      case 'release':
        if (Date.now() - releaseArmed > 3200) { releaseArmed = Date.now(); play('click'); renderCard(true); setTimeout(() => isOpen && renderCard(true), 3300); break; }
        sellFish([rec.uid], 'release'); break;
      case 'goto': { const g = byUid(+b.dataset.uid); if (g) select(g, g.x, g.y); break; }
    }
  }
  function onList(e) {
    const b = e.target.closest('[data-tk]');
    if (!b) return;
    const uid = +b.dataset.uid, rec = fishRec(uid);
    if (!rec) return;
    if (b.dataset.tk === 'fav') { rec.fav = !rec.fav; play('equip'); api.persist(); UIFX.morph($('#m-tank .card'), renderUI); }
    else if (b.dataset.tk === 'sell') sellFish([uid]);
    else if (b.dataset.tk === 'show') {
      view = 'tank';
      UIFX.swap($('#m-tank .card'), $('#tank-stage'), () => { renderUI(); const f = byUid(uid); if (f) { sel = f; reactTo(f, f.x, f.y); renderCard(true); } }, -1);
    }
  }

  /* ================= Opening and closing ================= */
  let rT = 0, idleT = 0;
  /* If the tank keeps missing about 38 frames a second, it renders at a lower resolution (up to three times). */
  const perf = { acc: 0, n: 0, k: 1, cuts: 0 };
  function govern(dt) {
    perf.acc += dt; perf.n += 1;
    if (perf.acc < 2.5) return;
    const avg = perf.acc / perf.n;
    perf.acc = 0; perf.n = 0;
    if (avg > 1 / 38 && perf.cuts < 3 && DPR > 1.01) { perf.cuts += 1; perf.k *= 0.8; sc = null; layout(); }
  }
  function layout() {
    const stage = $('#tank-stage'), card = stage.closest('.card'), w = Math.max(200, stage.clientWidth);
    const narrow = window.innerWidth < 600;
    // the tank takes whatever height the window has left once the header and toolbar are placed
    const cs = getComputedStyle(card), ms = getComputedStyle(card.parentElement);
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(ms.paddingTop) + parseFloat(ms.paddingBottom)
      + card.querySelector('.sheet-head').offsetHeight + card.querySelector('.tank-bar').offsetHeight + 30;
    const avail = window.innerHeight - chrome;
    const h = Math.round(clamp(Math.min(avail, w * (narrow ? 1.5 : 0.62)), 250, 700));
    stage.style.height = h + 'px';
    const id = tankDef().id;
    if (sc && sc.id === id && Math.abs(sc.W - w) < 2 && Math.abs(sc.H - h) < 2) { syncFish(null); return; }
    const old = sc;
    W = w; H = h;
    DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.6e6 / (w * h))) * perf.k);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    layer.width = cv.width; layer.height = cv.height;
    const gl = glOn && TankGL.ok;
    sc = TankEnv.build(id, W, H, DPR, { gl });
    U = sc.U;
    $('#tank-stage').classList.toggle('gl', gl);
    if (gl) { TankGL.resize(cv.width, cv.height); TankGL.setScene(TankEnv.glScene(sc)); }
    sc.above = new Path2D();
    sc.above.moveTo(sc.ix0 - 10, -10); sc.above.lineTo(sc.ix1 + 10, -10);
    for (let x = sc.ix1 + 10; x >= sc.ix0 - 10; x -= 4) sc.above.lineTo(x, sc.floor(clamp(x, sc.ix0, sc.ix1)) + U * 0.3);
    sc.above.closePath();
    if (sc.bowlPath) sc.clip = sc.bowlPath;
    else { sc.clip = new Path2D(); sc.clip.rect(sc.ix0, sc.iy0, sc.iw, sc.ih); }
    if (SPR.size > 90) { SPR.clear(); queue.length = 0; }
    pearlSprites.clear();
    for (const d of S.drops) if (d.row === undefined || !old) place(d);
    syncFish(old);
  }
  function syncFish(old) {
    const keep = new Map(fish.filter(f => !f.leaving).map(f => [f.uid, f]));
    const next = [];
    let entering = 0;
    for (const rec of api.save.net) {
      let f = keep.get(rec.uid);
      if (f) {
        f.rec = rec;
        if (old && (old !== sc)) {
          f.x = sc.ix0 + (f.x - old.ix0) / old.iw * sc.iw;
          f.y = sc.surf + (f.y - old.surf) / (old.iy1 - old.surf) * (sc.iy1 - sc.surf);
          f.tx = f.x; f.ty = f.y; f.path = null; f.poi = null;
          if (f.int) endInt(f.int);
          dims(f); clampPos(f); pickNext(f);
        }
        dims(f);
      } else {
        f = makeFish(rec);
        dims(f);
        if (!rec.seen) {
          rec.seen = true; dirty = true;
          const cx = sc.ell ? sc.ell.cx : (sc.swim.x0 + sc.swim.x1) / 2, half = sc.ell ? sc.ell.rx * 0.45 : (sc.swim.x1 - sc.swim.x0) * 0.4;
          f.x = cx + rand(-1, 1) * half; f.y = sc.surf - f.dh - entering * U * 10; f.free = true; f.vy = U * 2; f.vx = 0; f.above = true;
          f.z = f.tz = 0.3; go(f, 'enter', 2, f.x, sc.surf + f.len * 1.5);
          entering += 1;
        } else {
          const [x, y] = spot(f);
          f.x = x; f.y = y;
          pickNext(f);
          f.st = rand(0, f.dur || 3);
        }
      }
      next.push(f);
    }
    fish = next.concat(fish.filter(f => f.leaving));
    for (const f of fish) sprite(f.id, f.dw * DPR);
    bake(160);
  }
  function open(o = {}) {
    if (!api || isOpen) return;
    if (o.check && !api.canUse()) return;
    settle(Date.now(), true);
    S.last = Date.now();
    isOpen = true;
    view = o.list ? 'list' : 'tank';
    sel = null; sellAllArmed = sellArmed = releaseArmed = 0; cardSig = ''; pearlHinted = false;
    $('#pearl-hint').hidden = true;
    api.openModal('#m-tank');
    play('tankOpen');
    layout();
    let i = 0;
    for (const d of S.drops) if (d.born) { delete d.born; pops.set(d.k, { t: -0.55 - i * 0.07, ring: i++ % 3 === 0 }); }
    renderUI();
    $('#tank-hint').hidden = !!S.hinted || view === 'list';
    if (!S.hinted) { S.hinted = true; dirty = true; }
    const news = (S.news || []).slice();
    S.news = [];
    news.forEach(([a, b], i) => setTimeout(() => { const A = byUid(a), B = byUid(b); if (isOpen && A && B) celebrate(A, B); }, 1400 + i * 1800));
    api.refresh();
  }
  function onClosed() {
    if (!isOpen) return;
    isOpen = false;
    sel = null; down = null; drag = null;
    S.last = Date.now();
    for (const I of ints.slice()) endInt(I);
    parts = []; falling.clear(); lifted.clear(); pops.clear(); lifts = []; hold = null;
    fish = fish.filter(f => !f.leaving);
    for (const f of fish) { f.react = null; f.free = false; f.leaving = null; f.taps = []; if (f.y < sc.surf) f.y = sc.surf + f.len; }
    $('#fish-card').hidden = true;
    api.persist();
    dirty = false;
    api.refresh();
  }
  function frame(dt) {
    if (!api) return;
    if (!isOpen) {
      if ((idleT += dt) > 30) {
        idleT = 0;
        const sig = P => `${P.pearls}|${P.full}|${P.hearts}`, before = sig(pending());
        settle();
        if (sig(pending()) !== before) { api.persist(); api.refresh(); }
      }
      return;
    }
    dt = Math.min(dt, 0.05);
    if (!document.hidden) govern(dt);
    bake(6);
    update(dt);
    if (view === 'tank') {
      render();
      if (sc.gl) {
        ptr[0] += (ptrTo[0] - ptr[0]) * Math.min(1, dt * 3); ptr[1] += (ptrTo[1] - ptr[1]) * Math.min(1, dt * 3);
        // if the GPU is lost, carry on with the painting alone
        if (!TankGL.render(cv, T, ptr)) { glOn = false; sc = null; layout(); }
      }
    }
    S.last = Date.now();
    if ((cardT -= dt) <= 0) {
      cardT = 0.5;
      renderCard();
      placeCard();
      renderPearlHint();
      const k = clamp((T - lastFeed) / FEED_COOL, 0, 1), fb = $('#tank-feed');
      fb.style.setProperty('--cool', k.toFixed(3));
      fb.classList.toggle('cooling', k < 1);
    }
    if (dirty && (saveT -= dt) <= 0) { saveT = 5; dirty = false; api.persist(); }
  }
  function onResize() { if (isOpen) { clearTimeout(rT); rT = setTimeout(() => { layout(); renderCard(true); }, 140); } }
  // what is waiting in the tank: pearls on the sand or ready to appear, whether the sand is full, new friends
  function pending() {
    if (!S) return { pearls: 0, value: 0, full: false, hearts: 0 };
    let n = S.drops.length, v = 0;
    for (const d of S.drops) v += d.v;
    for (const k in S.acc || {}) { const a = Math.floor(S.acc[k]); if (a >= 1) { n++; v += a; } }
    return { pearls: n, value: v, full: bedFull(), hearts: S.news ? S.news.length : 0 };
  }

  /* ================= Market previews ================= */
  const previews = new Map();
  let pvBuilt = -1;
  const quietApi = new Proxy({}, { get: (o, k) => (k === 'ready' ? () => false : () => {}) });
  function preview(c, id, t) {
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const d = Math.min(2, window.devicePixelRatio || 1), key = `${id}|${w}|${h}`;
    let p = previews.get(key);
    if (!p) {
      if (pvBuilt === t) return; // one new tank per frame, so the tab never stalls
      pvBuilt = t;
      p = { sc: TankEnv.build(id, w, h, d), last: t };
      previews.set(key, p);
      if (previews.size > 14) previews.delete(previews.keys().next().value);
    }
    if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
    const x = c.getContext('2d'), dt = clamp(t - p.last, 0, 0.05);
    p.last = t;
    TankEnv.step(p.sc, dt, t, quietApi);
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, w, h);
    x.drawImage(p.sc.bg, 0, 0, w, h);
    TankEnv.back(x, p.sc, t); TankEnv.mid(x, p.sc, t); TankEnv.front(x, p.sc, t);
  }

  function init(a) {
    api = a;
    S = api.save.tank;
    cv = $('#tank-canvas'); ctx = cv.getContext('2d');
    glc = $('#tank-gl');
    glOn = !/nogl/.test(location.hash) && TankGL.init(glc);
    cv.addEventListener('pointerleave', () => { ptrTo[0] = 0.5; ptrTo[1] = 0.5; });
    layer = document.createElement('canvas'); lctx = layer.getContext('2d');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', () => { down = null; drag = null; });
    $('#tank-feed').addEventListener('click', feed);
    $('#tank-view').addEventListener('click', toggleView);
    $('#tank-sellall').addEventListener('click', sellAll);
    $('#fish-card').addEventListener('click', onCard);
    $('#tank-list').addEventListener('click', onList);
    window.addEventListener('resize', onResize);
    settle();
  }

  return {
    init, open, onClosed, frame, settle, pending, preview,
    get isOpen() { return isOpen; },
    /* for tests and the console */
    _debug: { get fish() { return fish; }, get sc() { return sc; }, get parts() { return parts; }, reactTo, startInteraction, select, feed, tapAt, collect, settle, pearlPos, sweep, accrue, bedValue, bedCap, tankRate, pending, YIELD, pearlSprite, get falling() { return falling.size; }, get lifted() { return lifted.size; } },
  };
})();
