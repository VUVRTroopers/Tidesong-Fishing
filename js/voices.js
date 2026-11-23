/* Tidesong — gear voices. Most rods, bobbers and lines have a sound of their own, a surprise for whoever
   equips them: a line sings as it flies out on the cast, a bobber announces itself as it lands, and a rod's
   reel turns with its own ratchet (or purr, or music box). Nothing in the market mentions them.

   Built from the same voices as the rest of the game (js/audio.js): modal bells and struck clicks, plucked
   strings, filtered noise and formant-shaped voices, every envelope smooth. Gear left out here keeps the
   plain cast, plop and ratchet. */
'use strict';

Sound.defineVoices(K => {
  const { osc, noise, bubble, pluck, bell, wood, croak, filter, gainNode, panNode, route, env, endOf, midi, rand, pick, GLASS, TUBE } = K;
  const ac = () => K.ctx;
  const now = () => ac().currentTime;

  /* ================= Building blocks ================= */

  /* A voiced sound: a buzzy source through formant filters, with a pitch contour and a smooth envelope.
     o: t, dur, f or curve (Hz over dur), type, formants [[f, q, gain, fCurve?]], dry (low-passed source),
        dryLp, rasp [Hz, depth] (roughness), vib [Hz, cents], a, rel, gain, lp, pan, wet, dest */
  function voiced(o) {
    const c = ac(), t0 = c.currentTime + (o.t || 0), dur = o.dur, end = t0 + dur + 0.1;
    const s = c.createOscillator();
    if (o.type === 'reed') s.setPeriodicWave(K.reedWave); else if (o.type === 'warm') s.setPeriodicWave(K.warmWave); else s.type = o.type || 'sawtooth';
    if (o.curve) { s.frequency.value = o.curve[0]; s.frequency.setValueCurveAtTime(o.curve, t0, dur); } else s.frequency.value = o.f;
    if (o.vib) { const v = c.createOscillator(), vg = gainNode(o.vib[1]); v.frequency.value = o.vib[0]; v.connect(vg); vg.connect(s.detune); v.start(t0); v.stop(end); }
    const mix = gainNode(1);
    for (const [f, q, g, fc] of o.formants) {
      const bp = filter('bandpass', f, q), bg = gainNode(g);
      if (fc) { bp.frequency.value = fc[0]; bp.frequency.setValueCurveAtTime(fc, t0, dur); }
      s.connect(bp); bp.connect(bg); bg.connect(mix);
    }
    if (o.dry) { const lp = filter('lowpass', o.dryLp || 900, 0.7), dg = gainNode(o.dry); s.connect(lp); lp.connect(dg); dg.connect(mix); }
    let out = mix;
    if (o.rasp) {
      const am = c.createOscillator(), sh = c.createWaveShaper(), depth = gainNode(o.rasp[1]), rg = gainNode(1 - o.rasp[1]);
      am.frequency.value = o.rasp[0]; sh.curve = K.softPulse;
      am.connect(sh); sh.connect(depth); depth.connect(rg.gain); mix.connect(rg); out = rg;
      am.start(t0); am.stop(end);
    }
    const g = gainNode(0), a = o.a ?? 0.012, rel = Math.min(o.rel ?? 0.05, dur * 0.5), peak = o.gain ?? 0.1;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak * (o.sustain ?? 0.85), t0 + dur - rel); g.gain.linearRampToValueAtTime(0, t0 + dur);
    out.connect(g);
    route(g, { pan: o.pan, wet: o.wet ?? 0.2, lp: o.lp, dest: o.dest, _t0: t0 });
    s.start(t0); s.stop(end);
  }

  /* Noise gated by a fast pulse: snorts, wing beats, zips, rasping rope. rate (and rate1) in Hz. */
  function flutter(o) {
    const c = ac(), t0 = c.currentTime + (o.t || 0), a = o.a ?? 0.02, d = o.d ?? o.dur * 0.6, hold = o.hold ?? o.dur * 0.3, end = endOf(t0, a, d, hold);
    const src = c.createBufferSource(); src.buffer = o.kind === 'brown' ? K.brownBuf : K.pinkBuf; src.loop = true;
    const f = filter(o.type || 'bandpass', o.f, o.q ?? 1);
    if (o.f1) { f.frequency.setValueAtTime(o.f, t0); f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur); }
    const am = c.createOscillator(); am.frequency.setValueAtTime(o.rate, t0);
    if (o.rate1) am.frequency.linearRampToValueAtTime(o.rate1, t0 + o.dur);
    const sh = c.createWaveShaper(); sh.curve = o.hard ? K.pulseCurve : K.softPulse;
    const gate = gainNode(0); am.connect(sh); sh.connect(gate.gain);
    const g = env(t0, a, o.gain ?? 0.05, d, hold);
    src.connect(f); f.connect(gate); gate.connect(g);
    route(g, { pan: o.pan, wet: o.wet ?? 0.15, lp: o.lp, dest: o.dest, _t0: t0 });
    src.start(t0, rand(0, 4)); src.stop(end); am.start(t0); am.stop(end);
  }

  /* Short struck sounds, made once per context: a few slightly different variants of each, so a run of
     them never sounds looped. gen(i, sr) returns a function of time in seconds. */
  const baked = new Map();
  function bake(key, n, len, gen) {
    let v = baked.get(key);
    if (v) return v;
    const c = ac(), sr = c.sampleRate, N = Math.floor(sr * len);
    v = [];
    for (let i = 0; i < n; i++) {
      const b = c.createBuffer(1, N, sr), d = b.getChannelData(0), f = gen(i, sr);
      let peak = 1e-6;
      for (let j = 0; j < N; j++) { const x = f(j / sr); d[j] = x; if (Math.abs(x) > peak) peak = Math.abs(x); }
      const fade = Math.max(1, Math.floor(sr * 0.0002)), tail = Math.floor(sr * 0.003);
      for (let j = 0; j < N; j++) d[j] = (d[j] / peak) * Math.min(1, j / fade, (N - j) / tail);
      v.push(b);
    }
    baked.set(key, v);
    return v;
  }
  /* Modes [freq, decay, amp] rung by a brief noise strike. o.tune(i) scales a variant's pitch (exact). */
  const modal = (modes, o = {}) => i => {
    const k = o.tune ? o.tune(i) : 1, wob = o.tune ? () => 1 : () => rand(0.96, 1.04);
    const ms = modes.map(([f, tau, a]) => [f * k * wob(), tau, a * rand(0.85, 1.15)]);
    const strike = o.strike ?? 0.0006, nz = o.noise ?? 0.7;
    return t => {
      let x = 0;
      for (const [f, tau, a] of ms) x += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau);
      if (t < strike) x += (Math.random() * 2 - 1) * nz * (1 - t / strike);
      return x;
    };
  };
  /* A sine sweeping from f0 to f1 as it dies away: sci-fi blips, bubbles. */
  const chirp = (lo, hi, ratio, sweep, tau) => (i, sr) => {
    const f0 = rand(lo, hi), f1 = f0 * ratio;
    let ph = 0;
    return t => { ph += (2 * Math.PI * f0 * Math.pow(f1 / f0, Math.min(1, t / sweep))) / sr; return Math.sin(ph) * Math.exp(-t / tau); };
  };
  /* A cluster of tiny dry cracks, band-limited around f: bread crust, embers. */
  const crackle = (n, f) => (i, sr) => {
    const hits = Array.from({ length: n }, (_, k) => [k ? rand(0, 0.016) : 0, rand(0.4, 1), rand(0.0005, 0.0016)]);
    const kl = 1 - Math.exp((-2 * Math.PI * f * 1.6) / sr), kh = 1 - Math.exp((-2 * Math.PI * f * 0.45) / sr);
    let lp = 0, hp = 0;
    return t => {
      let x = 0;
      for (const [t0, a, tau] of hits) if (t >= t0) x += a * (Math.random() * 2 - 1) * Math.exp(-(t - t0) / tau);
      lp += (x - lp) * kl; hp += (lp - hp) * kh;
      return lp - hp;
    };
  };

  function play(buf, at, gain, dest, rate) {
    const src = ac().createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate ?? rand(0.96, 1.04);
    const g = gainNode(gain);
    src.connect(g); g.connect(dest);
    src.start(at);
  }

  /* A looping bed of noise for a reel, silent until update() brings it up. */
  function bed(r, t0, filters, kind) {
    const src = ac().createBufferSource();
    src.buffer = kind === 'brown' ? K.brownBuf : K.pinkBuf; src.loop = true;
    let n = src;
    for (const [type, f, q] of filters) { const fl = filter(type, f, q); n.connect(fl); n = fl; }
    const out = gainNode(0); n.connect(out); out.connect(r.vbus);
    src.start(t0, rand(0, 4)); r.vsrc.push(src);
    return out;
  }
  const follow = (p, v, tc = 0.12) => p.setTargetAtTime(v, now(), tc);
  const spin = r => Math.min(1, r.rate / 26);   // how fast the spool turns, 0 to 1
  const at0 = at => Math.max(0, at - now());     // a scheduled click time as an offset for the voices

  /* The click sounds the reels are built from. */
  const CL = {
    wood: () => bake('wood', 5, 0.04, modal([[1150, 0.01, 1], [1850, 0.006, 0.6], [2900, 0.003, 0.3], [700, 0.014, 0.5]], { strike: 0.0008, noise: 0.5 })),
    knock: () => bake('knock', 5, 0.06, modal([[640, 0.022, 1], [1240, 0.01, 0.5], [2150, 0.005, 0.25]], { strike: 0.001, noise: 0.4 })),
    tick: () => bake('tick', 4, 0.02, modal([[5000, 0.0025, 1], [7000, 0.0016, 0.4], [3500, 0.003, 0.5]], { noise: 0.4 })),
    tock: () => bake('tock', 4, 0.025, modal([[2900, 0.004, 1], [4300, 0.0025, 0.4], [1850, 0.005, 0.45]], { noise: 0.4 })),
    vintage: () => bake('vintage', 5, 0.05, modal([[1650, 0.012, 1], [2500, 0.007, 0.7], [620, 0.02, 0.6], [3900, 0.003, 0.3]], { strike: 0.0009, noise: 0.9 })),
    bone: () => bake('bone', 5, 0.022, modal([[1000, 0.004, 1], [1700, 0.003, 0.7], [2600, 0.002, 0.4]], { strike: 0.0012, noise: 1 })),
    glass: () => bake('glass', 5, 0.1, modal([[3100, 0.03, 1], [4700, 0.022, 0.6], [6900, 0.012, 0.25], [2100, 0.035, 0.4]], { noise: 0.3 })),
    pearl: () => bake('pearl', 5, 0.07, modal([[2400, 0.02, 1], [3870, 0.012, 0.4], [1600, 0.02, 0.3]], { noise: 0.25 })),
    candy: () => bake('candy', 5, 0.03, modal([[3800, 0.006, 1], [5600, 0.004, 0.55], [2500, 0.008, 0.5]], { noise: 0.5 })),
    porcelain: () => bake('porcelain', 5, 0.22, modal([[2950, 0.06, 1], [4300, 0.035, 0.5], [6100, 0.02, 0.2], [1700, 0.05, 0.25]], { noise: 0.2 })),
    feather: () => bake('feather', 4, 0.02, modal([[4200, 0.003, 1], [2800, 0.004, 0.5]], { noise: 0.25 })),
    metal: () => bake('metal', 5, 0.035, modal([[3300, 0.006, 1], [4700, 0.0035, 0.5], [2150, 0.009, 0.75], [1250, 0.012, 0.45]], { noise: 0.8 })),
    glint: () => bake('glint', 5, 0.18, modal([[1, 0.07, 1], [2.32, 0.04, 0.35], [4.25, 0.02, 0.15]], { tune: i => midi([86, 88, 91, 93, 96][i]), noise: 0.05 })),
    blip: () => bake('blip', 4, 0.06, chirp(1300, 1600, 0.5, 0.03, 0.02)),
    bubble: () => bake('bubble', 5, 0.05, chirp(420, 620, 2.2, 0.03, 0.015)),
    crust: () => bake('crust', 6, 0.026, crackle(4, 2600)),
  };

  /* A reel whose ratchet is one of the click sounds above.
     o: every (only every nth click), hp/lp (on the click bus), choose(bufs, n), rate(r, s) (playback rate),
        jitter (timing looseness), extra(r, at, level, n, s) (something more on each click), start, update. */
  function ratchet(make, gain, o = {}) {
    return {
      jitter: o.jitter,
      start(r, t0) {
        const head = gainNode(1);
        let n = head;
        if (o.hp) { const f = filter('highpass', o.hp, 0.7); n.connect(f); n = f; }
        if (o.lp) { const f = filter('lowpass', o.lp, 0.7); n.connect(f); n = f; }
        n.connect(r.vbus);
        r.v.tb = head; r.v.bufs = make();
        if (o.start) o.start(r, t0);
      },
      tick(r, at, level, n, s) {
        if (!o.every || n % o.every === 0) {
          const b = o.choose ? o.choose(r.v.bufs, n) : pick(r.v.bufs);
          play(b, at, gain * level * rand(0.85, 1), r.v.tb, o.rate ? o.rate(r, s) : undefined);
        }
        if (o.extra) o.extra(r, at, level, n, s);
      },
      update: o.update,
    };
  }

  /* ================= Rods: the reel ================= */
  const MUSICBOX = [84, 88, 91, 96, 91, 88, 89, 93, 96, 93, 89, 86, 88, 91, 95, 91, 88, 84];
  const WALTZ = { bass: [57, 52, 53, 52], chord: [[69, 72], [68, 71], [69, 72], [68, 71]], tune: [81, 76, 77, 76, 84, 83, 81, 80] };
  const KOTO = [74, 75, 79, 81, 82, 86, 82, 81, 79, 75];
  const COWBELL = [[1, 1, 1], [1.48, 0.75, 0.7], [2.02, 0.3, 0.4], [3.1, 0.12, 0.2]];
  const TINE = [[1, 1, 1], [3.9, 0.2, 0.3], [8.1, 0.05, 0.12]];
  const CELESTA = [[1, 1, 1], [2, 0.25, 0.5], [3, 0.08, 0.3]];

  const rods = {
    // Birchwood Classic: a warm wooden ratchet
    birch: ratchet(CL.wood, 0.05, { hp: 250 }),
    // Mariner's Brass: ticks like the pocket watch it was made beside, tick and tock
    mariner: ratchet(() => [CL.tick(), CL.tock()], 0.042, { hp: 600, jitter: 0.015, choose: (b, n) => pick(b[n % 2]) }),
    // Split Cane: the deep, ringing check of an old fly reel
    splitcane: ratchet(CL.vintage, 0.06, { hp: 300, jitter: 0.025 }),
    // Dragonbone: dry bone clacks over a low smoulder, sparks crackling off it
    dragonbone: ratchet(CL.bone, 0.045, {
      hp: 400,
      start(r, t0) { r.v.fire = bed(r, t0, [['lowpass', 320, 0.6]], 'brown'); },
      update(r, s, dt) {
        follow(r.v.fire.gain, 0.035 * spin(r));
        if (r.rate > 5 && Math.random() < dt * 8 * spin(r)) noise({ type: 'bandpass', f: rand(1800, 4200), q: 2, a: 0.0008, d: 0.007, gain: rand(0.012, 0.03), pan: rand(0.05, 0.5), wet: 0.1 });
      },
    }),
    // Fetch Stick: a dull wooden ratchet, and the tennis ball squeaks when you start to wind
    fetch: ratchet(CL.wood, 0.04, {
      hp: 250, lp: 2600,
      update(r, s) {
        const t = now();
        if (s.holding && !r.v.held && t - (r.v.sq || 0) > 1.4 && Math.random() < 0.75) {
          r.v.sq = t;
          osc(1350, { curve: Float32Array.from([1250, 1950, 1800, 1500]), curveTime: 0.15, a: 0.012, hold: 0.04, d: 0.09, type: 'triangle', gain: 0.024, lp: 3800, pan: 0.2, wet: 0.15 });
          noise({ type: 'bandpass', f: 1700, q: 4, a: 0.01, d: 0.1, gain: 0.008, pan: 0.2, wet: 0.1 });
        }
        r.v.held = s.holding;
      },
    }),
    // Tabby Tail: no ratchet at all. The reel purrs, louder as you wind, breathing in and out.
    tabby: {
      start(r, t0) {
        const c = ac();
        const src = c.createBufferSource(); src.buffer = K.pinkBuf; src.loop = true;
        const bp = filter('bandpass', 260, 0.7), lp = filter('lowpass', 900, 0.6);
        // the purr's pulse, and the breath that slows it on the in-breath and lifts it on the out-breath
        const am = c.createOscillator(); am.frequency.value = 25.5;
        const breath = c.createOscillator(); breath.frequency.value = 0.62;
        const bf = gainNode(1.6); breath.connect(bf); bf.connect(am.frequency);
        const sh = c.createWaveShaper(); sh.curve = K.pulseCurve;
        const gate = gainNode(0); am.connect(sh); sh.connect(gate.gain);
        // the throat buzzing at the purr rate gives it body
        const body = c.createOscillator(); body.setPeriodicWave(K.reedWave); body.frequency.value = 25.5; bf.connect(body.frequency);
        const bodyLP = filter('lowpass', 300, 0.7), bodyG = gainNode(0.5);
        body.connect(bodyLP); bodyLP.connect(bodyG); bodyG.connect(gate);
        const swell = gainNode(0.75), sw = gainNode(0.25); breath.connect(sw); sw.connect(swell.gain);
        const out = gainNode(0);
        src.connect(bp); bp.connect(lp); lp.connect(gate); gate.connect(swell); swell.connect(out); out.connect(r.vbus);
        src.start(t0, rand(0, 4)); for (const x of [am, breath, body]) x.start(t0);
        r.vsrc.push(src, am, breath, body);
        r.v.out = out;
      },
      update(r, s) { follow(r.v.out.gain, 0.2 * (0.22 + 0.78 * spin(r)), 0.18); },
    },
    // Kingfisher: feather-light ticks, and now and then the bird's own thin whistle
    kingfisher: ratchet(CL.feather, 0.03, {
      hp: 1200, lp: 7000,
      update(r, s) {
        const t = now();
        if (s.holding && t > (r.v.call || 0)) {
          if (r.v.call) for (const dt of [0, 0.11]) osc(4300, { t: dt, a: 0.008, d: 0.06, glide: 3700, glideTime: 0.06, gain: 0.007, lp: 6000, pan: 0.45, wet: 0.35 });
          r.v.call = t + rand(1.6, 3);
        }
      },
    }),
    // Driftwood: hollow knocks and the sea you hear in a shell
    driftwood: ratchet(CL.knock, 0.042, {
      hp: 250,
      start(r, t0) { r.v.sh1 = bed(r, t0, [['bandpass', 540, 7]]); r.v.sh2 = bed(r, t0, [['bandpass', 1300, 9]]); },
      update(r) { const w = spin(r) * (0.7 + 0.3 * Math.sin(now() * 1.1)); follow(r.v.sh1.gain, 0.16 * w, 0.3); follow(r.v.sh2.gain, 0.1 * w, 0.3); },
    }),
    // Coral Lacquer: small pearly clicks
    coral: ratchet(CL.pearl, 0.032, { hp: 800 }),
    // Sunset Surf: a palm-muted surf guitar picks away while you wind, moving to a new note each time
    surf: {
      start(r) { r.v.i = 0; r.v.note = 82.41; },
      tick(r, at, level, n) {
        if (n % 2) return;
        const c = ac(), src = c.createBufferSource();
        src.buffer = K.ksBuffer(r.v.note, 0.5, 0.6);
        const lp = filter('lowpass', 1500, 0.8), g = gainNode(0);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level * 0.065 * rand(0.85, 1), at + 0.002); g.gain.setTargetAtTime(0, at + 0.012, 0.028);
        src.connect(lp); lp.connect(g); g.connect(r.vbus); src.start(at); src.stop(at + 0.25);
      },
      update(r, s) {
        if (s.holding && !r.v.held) { r.v.i++; r.v.note = [82.41, 82.41, 98.0, 110.0, 116.54, 110.0, 98.0, 73.42][r.v.i % 8]; }
        r.v.held = s.holding;
      },
    },
    // Trident of the Tides: the ratchet bubbles, and the deep sea swells as you wind
    trident: ratchet(CL.bubble, 0.05, {
      start(r, t0) { r.v.sea = bed(r, t0, [['lowpass', 420, 0.6]], 'brown'); },
      update(r) { follow(r.v.sea.gain, 0.04 * spin(r) * (0.65 + 0.35 * Math.sin(now() * 1.3)), 0.25); },
    }),
    // Alpine Ash: a light wooden ratchet, and cowbells somewhere across the meadow
    alpine: ratchet(CL.wood, 0.038, {
      hp: 250,
      extra(r, at, level, n) {
        if (n % 22 || level < 0.9) return;
        r.v.c = (r.v.c || 0) + 1;
        bell([560, 620, 505][r.v.c % 3] * rand(0.99, 1.01), { t: at0(at), partials: COWBELL, a: 0.002, dur: 0.9, gain: 0.013, wet: 0.5, pan: rand(-0.6, -0.2), lp: 3000, beat: false, dest: K.sfx });
      },
    }),
    // Evergreen: hollow knocks, and a woodpecker drumming somewhere in the forest
    evergreen: ratchet(CL.knock, 0.036, {
      hp: 200,
      start(r) { r.v.next = now() + rand(1.5, 3); const far = filter('lowpass', 1800, 0.6), p = panNode(-0.6); far.connect(p); p.connect(r.vbus); r.v.far = far; },
      update(r) {
        const t = now();
        if (r.rate > 10 && t > r.v.next) {
          const bufs = r.v.bufs, n = 9 + Math.floor(Math.random() * 5);
          for (let k = 0; k < n; k++) play(pick(bufs), t + 0.05 + k * 0.048, 0.022 * (1 - k / (n + 3)), r.v.far, rand(1.25, 1.35));
          r.v.next = t + rand(3.5, 6);
        }
      },
    }),
    // Glacier Crystal: clicks that ring like ice
    glacier: ratchet(CL.glass, 0.018, { hp: 1200 }),
    // Sakura Branch: a soft wooden ratchet and a koto that climbs and falls as you wind
    sakura: ratchet(CL.wood, 0.016, {
      hp: 300,
      extra(r, at, level, n) {
        if (n % 6 || level < 0.9) return;
        const i = (r.v.k = (r.v.k ?? -1) + 1);
        pluck(midi(KOTO[i % KOTO.length]), { t: at0(at), bright: 0.55, dur: 0.9, gain: 0.04, lpf: 5000, pan: 0.2, wet: 0.25 });
      },
    }),
    // Wisteria: barely a click, and wind chimes stirring
    wisteria: ratchet(CL.pearl, 0.01, {
      hp: 800,
      extra(r, at, level, n) {
        if (n % 5 || level < 0.9 || Math.random() > 0.65) return;
        bell(midi(pick([84, 86, 88, 91, 93, 96])), { t: at0(at), partials: TUBE, gain: 0.011, dur: 2.4, pan: rand(-0.5, 0.5), wet: 0.45, beat: false });
      },
    }),
    // Ribbon & Lace: a music box. The comb plays a lullaby as you wind and pauses when you stop.
    ribbon: ratchet(CL.tick, 0.012, {
      hp: 1500,
      extra(r, at, level, n) {
        if (n % 4 || level < 0.9) return;
        const i = (r.v.m = (r.v.m ?? -1) + 1);
        bell(midi(MUSICBOX[i % MUSICBOX.length]), { t: at0(at), partials: TINE, a: 0.002, dur: 1.4, gain: 0.016, wet: 0.3, beat: false });
      },
    }),
    // Enchanted Rose: a celesta waltz in a minor key, turning with the reel
    rose: ratchet(CL.pearl, 0.008, {
      hp: 800,
      extra(r, at, level, n) {
        if (n % 8 || level < 0.9) return;
        const b = (r.v.b = (r.v.b ?? -1) + 1), bar = Math.floor(b / 3) % 8, pos = b % 3, t = at0(at), W = WALTZ;
        const cel = (m, g, d) => bell(midi(m), { t, partials: CELESTA, a: 0.003, dur: d, gain: g, wet: 0.32, beat: false });
        if (pos === 0) { cel(W.bass[bar % 4], 0.02, 1.4); cel(W.tune[bar], 0.022, 1.2); }
        else for (const m of W.chord[bar % 4]) cel(m, 0.011, 0.8);
      },
    }),
    // Twilight Reed: tiny glassy ticks, and a star chiming in now and then
    twilight: ratchet(CL.pearl, 0.016, {
      hp: 800,
      extra(r, at, level, n) {
        if (n % 18 || level < 0.9) return;
        bell(midi(pick([91, 96, 98, 103])), { t: at0(at), partials: GLASS, gain: 0.01, dur: 1.6, wet: 0.5, beat: false, pan: rand(-0.4, 0.4) });
      },
    }),
    // Aurora Glass: glassy clicks under a soft choir that swells with the spool
    aurora: ratchet(CL.glass, 0.012, {
      hp: 1200,
      start(r, t0) {
        const c = ac(), lp = filter('lowpass', 1500, 0.6), out = gainNode(0);
        lp.connect(out); out.connect(r.vbus);
        for (const [m, rate] of [[69, 0.13], [76, 0.17], [81, 0.11]]) {
          const o = c.createOscillator(); o.setPeriodicWave(K.warmWave); o.frequency.value = midi(m);
          const lfo = c.createOscillator(), lg = gainNode(9); lfo.frequency.value = rate; lfo.connect(lg); lg.connect(o.detune);
          o.connect(lp); o.start(t0); lfo.start(t0); r.vsrc.push(o, lfo);
        }
        r.v.out = out;
      },
      update(r) { follow(r.v.out.gain, 0.012 * spin(r), 0.4); },
    }),
    // Nebula Wand: the ratchet bleeps like a little starship, rising as the ring fills, over a drifting hiss
    nebula: ratchet(CL.blip, 0.03, {
      every: 2, rate: (r, s) => 0.8 + (s.progress || 0) * 0.55,
      start(r, t0) {
        const c = ac(), src = c.createBufferSource(); src.buffer = K.pinkBuf; src.loop = true;
        const bp = filter('bandpass', 1500, 5), lfo = c.createOscillator(), lg = gainNode(800), out = gainNode(0);
        lfo.frequency.value = 0.3; lfo.connect(lg); lg.connect(bp.frequency);
        src.connect(bp); bp.connect(out); out.connect(r.vbus);
        src.start(t0, rand(0, 4)); lfo.start(t0); r.vsrc.push(src, lfo);
        r.v.out = out;
      },
      update(r) { follow(r.v.out.gain, 0.05 * spin(r), 0.3); },
    }),
    // Starforged: every turn strikes a tiny tuned star
    starforged: ratchet(CL.glint, 0.022, { every: 2 }),
    // Event Horizon: the ratchet slowed and deepened, as if time stretched, over a gravitational hum
    horizon: ratchet(CL.metal, 0.05, {
      hp: 300, rate: () => rand(0.5, 0.56),
      start(r, t0) {
        const c = ac(), lp = filter('lowpass', 240, 0.7), out = gainNode(0), lfo = c.createOscillator(), lg = gainNode(25);
        lfo.frequency.value = 0.22; lfo.connect(lg);
        const a = c.createOscillator(); a.frequency.value = 55;
        const b = c.createOscillator(); b.setPeriodicWave(K.reedWave); b.frequency.value = 55;
        lg.connect(a.detune); lg.connect(b.detune);
        a.connect(out); b.connect(lp); lp.connect(out); out.connect(r.vbus);
        for (const x of [a, b, lfo]) x.start(t0);
        r.vsrc.push(a, b, lfo); r.v.out = out;
      },
      update(r) { follow(r.v.out.gain, 0.014 * spin(r), 0.35); },
    }),
    // Candy Cane: hard-candy clicks and a jingle of sleigh bells
    candycane: ratchet(CL.candy, 0.03, {
      hp: 900,
      extra(r, at, level, n) {
        if (n % 6 || level < 0.9) return;
        for (let k = 0; k < 3; k++) bell(rand(2700, 3500), { t: at0(at) + k * 0.013, partials: [[1, 1, 1], [1.6, 0.5, 0.4], [2.4, 0.3, 0.25]], dur: 0.22, gain: 0.006, beat: false, dest: K.sfx, wet: 0.2, lp: 6000 });
      },
    }),
    // Baguette: the crust crackles as it turns
    baguette: ratchet(CL.crust, 0.05, { jitter: 0.35, hp: 600 }),
    // Pâtisserie: a teaspoon tinkling against porcelain
    patisserie: ratchet(CL.porcelain, 0.02, { every: 3, hp: 900 }),
  };

  /* ================= Bobbers: landing ================= */
  const bobbers = {
    // Heron Quill: slips in with a fine, clean plip
    quill: { plop: 0.55, play() { bubble(rand(600, 680), { dur: 0.05, rise: 2.4, gain: 0.12, wet: 0.22 }); wood(midi(88), { gain: 0.012, dur: 0.05 }); } },
    // Paper Lantern: a rustle of paper and the little flame catching
    lantern: {
      plop: 0.75,
      play() {
        for (let i = 0; i < 5; i++) noise({ t: rand(0, 0.14), type: 'bandpass', f: rand(2600, 3600), q: 1.5, a: 0.001, d: 0.014, gain: 0.02, wet: 0.1 });
        noise({ t: 0.06, type: 'lowpass', f: 300, f1: 1100, fTime: 0.3, q: 0.7, a: 0.08, d: 0.35, gain: 0.06, wet: 0.2 });
        bell(midi(67), { t: 0.25, gain: 0.02, dur: 2, wet: 0.4 });
      },
    },
    // Gilded Float: a golden ding with a glint above it
    gilded: {
      plop: 0.85,
      play() {
        bell(midi(84), { t: 0.06, gain: 0.03, dur: 2, wet: 0.3 });
        bell(midi(91), { t: 0.14, gain: 0.02, dur: 2.2, wet: 0.32 });
        for (let i = 0; i < 3; i++) bell(midi([100, 103, 108][i]), { t: 0.3 + i * 0.07, partials: GLASS, gain: 0.006, dur: 0.9, beat: false, wet: 0.4 });
      },
    },
    // Puddle Duck: quack (now and then, quack quack)
    duck: {
      plop: 0.8,
      play() {
        const k = rand(0.94, 1.06);
        const quack = (t, k, len) => voiced({
          t, dur: len, type: 'sawtooth', curve: Float32Array.from([370, 405, 395, 365, 330, 305].map(v => v * k)),
          formants: [[1000, 3.2, 1, Float32Array.from([850, 1150, 1250, 1120, 960])], [2350, 5, 0.55], [3300, 7, 0.2]],
          dry: 0.25, dryLp: 700, rasp: [64, 0.35], a: 0.012, rel: 0.05, gain: 0.13, lp: 4200, pan: 0.1, wet: 0.22,
        });
        quack(0.1, k, rand(0.17, 0.2));
        if (Math.random() < 0.5) quack(0.34, k * 0.95, 0.15);
      },
    },
    // Sleepy Kitten: a drowsy little "mrrp?"
    kitten: {
      plop: 0.75,
      play() {
        const k = rand(0.95, 1.08), len = rand(0.3, 0.36);
        voiced({
          t: 0.14, dur: len, type: 'sawtooth', curve: Float32Array.from([470, 540, 650, 700, 660, 560].map(v => v * k)),
          formants: [[700, 3, 1, Float32Array.from([480, 760, 980, 900, 700])], [1900, 5, 0.55, Float32Array.from([1500, 2100, 2300, 1800])], [3200, 6, 0.15]],
          dry: 0.35, dryLp: 1000, rasp: [27, 0.3], a: 0.03, rel: 0.09, gain: 0.07, lp: 3500, pan: 0.1, wet: 0.24,
        });
      },
    },
    // French Bulldog: a gruff little "boof" and a snort
    frenchie: {
      plop: 0.8,
      play() {
        const k = rand(0.94, 1.06);
        voiced({
          t: 0.12, dur: 0.15, type: 'sawtooth', curve: Float32Array.from([200, 235, 205, 160].map(v => v * k)),
          formants: [[560, 2.5, 1, Float32Array.from([450, 720, 520])], [1250, 4, 0.45]], dry: 0.5, dryLp: 500, rasp: [45, 0.5],
          a: 0.008, rel: 0.05, gain: 0.12, lp: 3000, pan: 0.1, wet: 0.2,
        });
        noise({ t: 0.12, type: 'bandpass', f: 700, q: 1.2, a: 0.005, d: 0.12, gain: 0.03, wet: 0.15 });
        flutter({ t: 0.4, f: 420, f1: 620, q: 2, rate: 38, rate1: 30, dur: 0.24, a: 0.03, gain: 0.05, hard: true, pan: 0.1, wet: 0.12 });
      },
    },
    // Koi Charm: a soft temple bell and a few lazy bubbles
    koi: {
      plop: 0.9,
      play() {
        bell(midi(57) * rand(0.99, 1.01), { t: 0.08, gain: 0.034, dur: 3.2, wet: 0.45 });
        bubble(270, { t: 0.28, dur: 0.09, rise: 1.8, gain: 0.05 });
        bubble(340, { t: 0.45, dur: 0.08, rise: 1.8, gain: 0.035 });
      },
    },
    // Frog Prince: ribbit
    frog: { plop: 0.85, play() { croak({ t: 0.16, gain: 0.8, pan: 0.1 }); } },
    // Beach Ball: a hollow plastic "bwong", then a smaller one as it settles
    beachball: {
      plop: 0.55,
      play() {
        const bounce = (t, k) => {
          osc(250 * k, { t, a: 0.003, d: 0.16, glide: 180 * k, glideTime: 0.09, type: 'triangle', gain: 0.075 * k, lp: 1600, wet: 0.15, vib: [14, 30] });
          noise({ t, type: 'bandpass', f: 900, q: 5, a: 0.002, d: 0.05, gain: 0.05 * k, wet: 0.1 });
        };
        bounce(0, 1); bounce(0.22, 0.55);
      },
    },
    // Scallop Shell: the hush of the sea, the way it sounds inside a shell
    seashell: {
      play() {
        noise({ t: 0.05, type: 'bandpass', f: 560, q: 7, a: 0.45, hold: 0.2, d: 0.9, gain: 0.26, wet: 0.35 });
        noise({ t: 0.05, type: 'bandpass', f: 1320, q: 9, a: 0.5, hold: 0.15, d: 0.8, gain: 0.16, wet: 0.35 });
      },
    },
    // Life Ring: a heavier landing and a ship's bell across the water
    lifebuoy: {
      plop: 1.15,
      play() { for (const t of [0.3, 0.62]) bell(midi(81), { t, gain: 0.028, dur: 2.4, wet: 0.5, lp: 3500, pan: -0.3 }); },
    },
    // Pineapple: a strum on a ukulele
    pineapple: {
      plop: 0.85,
      play() {
        const chord = pick([[67, 60, 64, 69], [69, 60, 65, 69], [67, 62, 65, 71]]);
        chord.forEach((m, i) => pluck(midi(m), { t: 0.08 + i * 0.018, bright: 0.5, dur: 1, gain: 0.05, lpf: 4200, pan: 0.15, wet: 0.2 }));
      },
    },
    // Daisy: a puff of petals, then "he loves me" (rising) or "he loves me not" (falling)
    daisy: {
      plop: 0.6,
      play() {
        noise({ t: 0.02, type: 'lowpass', f: 900, a: 0.01, d: 0.18, gain: 0.04, wet: 0.2 });
        const not = Math.random() < 0.5;
        bell(midi(not ? 88 : 84), { t: 0.18, partials: GLASS, gain: 0.026, dur: 1.2, wet: 0.35 });
        bell(midi(not ? 84 : 88), { t: 0.38, partials: GLASS, gain: 0.026, dur: 1.4, wet: 0.35 });
      },
    },
    // Lily Bud: a singing bowl, slow and calm
    lily: {
      plop: 0.8,
      play() { bell(midi(67) * rand(0.99, 1.01), { t: 0.12, partials: [[1, 1, 1], [2.71, 0.45, 0.75], [5.15, 0.18, 0.5]], a: 0.03, gain: 0.03, dur: 4, wet: 0.45 }); },
    },
    // Heart Locket: the clasp clicks shut, and a heartbeat
    heart: {
      plop: 0.8,
      play() {
        for (const t of [0.04, 0.07]) bell(midi(100), { t, partials: [[1, 1, 1], [1.5, 0.6, 0.6]], dur: 0.08, gain: 0.018, beat: false, dest: K.sfx, wet: 0.1 });
        osc(66, { t: 0.24, type: 'warm', a: 0.01, d: 0.12, glide: 52, gain: 0.05, lp: 320, wet: 0.1 });
        osc(60, { t: 0.42, type: 'warm', a: 0.01, d: 0.16, glide: 48, gain: 0.04, lp: 320, wet: 0.1 });
      },
    },
    // Butterfly: wings fluttering, and a little harp lifting with them
    butterfly: {
      plop: 0.45,
      play() {
        flutter({ t: 0.04, f: 1600, q: 0.8, rate: 16, rate1: 10, dur: 0.6, a: 0.05, gain: 0.05, pan: 0.15, wet: 0.2 });
        [84, 88, 91, 96].forEach((m, i) => pluck(midi(m), { t: 0.25 + i * 0.07, bright: 0.35, dur: 1.2, gain: 0.03, wet: 0.3 }));
      },
    },
    // Diamond Tiara: a tiny royal fanfare and a shower of diamonds
    tiara: {
      plop: 0.75,
      play() {
        [67, 72, 76, 79].forEach((m, i) => osc(midi(m), { t: 0.1 + i * 0.09, type: 'reed', a: 0.012, hold: i === 3 ? 0.25 : 0.05, d: 0.25, gain: 0.024, lp: 2400, vib: [5.5, 8], dest: K.music, wet: 0.3 }));
        for (let i = 0; i < 8; i++) bell(midi(pick([91, 96, 98, 100, 103])), { t: 0.52 + i * 0.05, partials: GLASS, gain: 0.009, dur: 1, pan: rand(-0.6, 0.6), beat: false, wet: 0.4 });
      },
    },
    // Pinecone: a woody knock
    pinecone: { plop: 0.8, play() { const k = rand(0.97, 1.03); wood(midi(60) * k, { gain: 0.055, dur: 0.18 }); wood(midi(67) * k, { t: 0.07, gain: 0.035, dur: 0.12 }); } },
    // Snow Peak: an alphorn call, and the mountains calling it back
    peak: {
      play() {
        const horn = (t, g, lp, wet) => {
          osc(midi(55), { t, type: 'reed', a: 0.12, hold: 0.22, d: 0.3, gain: g, lp, curve: Float32Array.from([midi(55) * 0.96, midi(55), midi(55)]), curveTime: 0.15, vib: [4.5, 6], wet, dest: K.music });
          osc(midi(60), { t: t + 0.48, type: 'reed', a: 0.1, hold: 0.3, d: 0.55, gain: g, lp, curve: Float32Array.from([midi(60) * 0.97, midi(60), midi(60)]), curveTime: 0.15, vib: [4.5, 6], wet, dest: K.music });
        };
        horn(0.15, 0.03, 1100, 0.35);
        horn(1.45, 0.011, 750, 0.65);
      },
    },
    // Snow Globe: a glass clink and snow falling inside it
    globe: {
      plop: 0.8,
      play() {
        bell(midi(96), { t: 0.05, partials: GLASS, gain: 0.03, dur: 0.9, beat: false, wet: 0.3 });
        bell(midi(101), { t: 0.09, partials: GLASS, gain: 0.022, dur: 0.9, beat: false, wet: 0.3 });
        for (let i = 0; i < 7; i++) bell(midi(pick([96, 98, 100, 103, 105])), { t: 0.3 + i * rand(0.1, 0.18), partials: GLASS, gain: 0.009, dur: 1.2, pan: rand(-0.5, 0.5), beat: false, wet: 0.5 });
      },
    },
    // Moon Pearl: a pure, pearly tone
    pearl: {
      plop: 0.85,
      play() {
        bell(midi(84), { t: 0.08, partials: GLASS, gain: 0.026, dur: 1.8, wet: 0.35 });
        bell(midi(91), { t: 0.16, partials: GLASS, gain: 0.015, dur: 2, wet: 0.4 });
      },
    },
    // Ringed Planet: a soft whomp and the ring humming like a theremin
    planet: {
      plop: 0.8,
      play() {
        osc(95, { a: 0.005, d: 0.3, glide: 50, gain: 0.05, lp: 300, wet: 0.1 });
        osc(midi(76), { t: 0.1, a: 0.08, hold: 0.3, d: 0.5, curve: Float32Array.from([659, 784, 880, 831, 740]), curveTime: 0.8, vib: [6, 30], gain: 0.022, wet: 0.45 });
      },
    },
    // Little Saucer: the saucer warbles down to land, and its pilot beeps hello
    saucer: {
      plop: 0.7,
      play() {
        osc(1300, { a: 0.02, hold: 0.2, d: 0.35, glide: 520, glideTime: 0.55, vib: [11, 250], gain: 0.018, lp: 3000, wet: 0.3 });
        osc(midi(93), { t: 0.78, a: 0.005, d: 0.07, gain: 0.014, wet: 0.2 });
        osc(midi(88), { t: 0.9, a: 0.005, d: 0.09, gain: 0.014, wet: 0.2 });
      },
    },
    // Comet: ice hissing into the water and a fall of sparks
    comet: {
      plop: 0.85,
      play() {
        noise({ type: 'highpass', f: 3500, q: 0.6, a: 0.003, d: 0.45, gain: 0.04, wet: 0.2, lp2: 9000 });
        [100, 96, 93, 91, 88, 84].forEach((m, i) => bell(midi(m), { t: 0.05 + i * 0.045, partials: GLASS, gain: 0.016, dur: 1, pan: 0.4 - i * 0.12, beat: false, wet: 0.4 }));
      },
    },
    // Fallen Star: a twinkling run upwards and a warm glow beneath it
    star: {
      plop: 0.8,
      play() {
        [84, 86, 88, 91, 93, 96].forEach((m, i) => bell(midi(m), { t: 0.06 + i * 0.055, partials: GLASS, gain: 0.017, dur: 1.2, pan: -0.3 + i * 0.12, beat: false, wet: 0.4 }));
        osc(midi(72), { t: 0.05, type: 'warm', a: 0.1, d: 0.9, gain: 0.014, lp: 1500, dest: K.music, wet: 0.4 });
      },
    },
    // Galaxy Orb: a whole galaxy opening up: a wide, slow chord with stars turning through it
    galaxy: {
      plop: 0.8,
      play() {
        [48, 55, 62, 64, 71].forEach(m => osc(midi(m), { t: 0.05, type: 'warm', a: 0.5, hold: 0.3, d: 1.6, gain: 0.011, lp: 1800, detune: rand(-6, 6), pan: rand(-0.5, 0.5), dest: K.music, wet: 0.6 }));
        osc(midi(36), { t: 0.05, a: 0.3, d: 1.4, gain: 0.018, lp: 200, wet: 0.2 });
        for (let i = 0; i < 6; i++) bell(midi(pick([91, 95, 98, 102])), { t: 0.4 + i * 0.16, partials: GLASS, gain: 0.007, dur: 1.4, pan: Math.sin(i * 1.7) * 0.7, beat: false, wet: 0.55 });
      },
    },
    // Cupcake: a soft squish and sprinkles tinkling
    cupcake: {
      plop: 0.7,
      play() {
        noise({ type: 'lowpass', f: 900, f1: 260, q: 0.8, a: 0.006, d: 0.16, gain: 0.12, wet: 0.12 });
        osc(170, { a: 0.006, d: 0.1, glide: 120, gain: 0.035, lp: 500, wet: 0.1 });
        for (let i = 0; i < 6; i++) bell(midi(pick([98, 100, 103, 105, 108])), { t: rand(0.08, 0.35), partials: GLASS, gain: 0.01, dur: 0.18, beat: false, pan: rand(-0.3, 0.4), wet: 0.25 });
      },
    },
    // Glazed Donut: a doughy "bwomp"
    donut: { plop: 0.7, play() { osc(150, { t: 0.02, type: 'triangle', a: 0.006, d: 0.32, glide: 92, glideTime: 0.22, vib: [13, 45], gain: 0.05, lp: 900, wet: 0.15 }); } },
    // Macaron: the crisp shell cracking
    macaron: {
      plop: 0.7,
      play() {
        for (const t of [0, 0.012, 0.03, 0.05]) noise({ t, type: 'bandpass', f: rand(2200, 3600), q: 1.2, a: 0.001, d: 0.016, gain: 0.2, wet: 0.1 });
        noise({ t: 0.04, type: 'lowpass', f: 700, a: 0.01, d: 0.12, gain: 0.09, wet: 0.1 });
      },
    },
    // Grand Gâteau: a cork pops and the party starts
    gateau: {
      plop: 0.75,
      play() {
        osc(700, { a: 0.002, d: 0.06, glide: 300, glideTime: 0.05, gain: 0.06, lp: 2500, wet: 0.15 });
        noise({ type: 'bandpass', f: 1500, q: 1, a: 0.001, d: 0.03, gain: 0.04, wet: 0.15 });
        [72, 76, 79, 84, 88].forEach((m, i) => pluck(midi(m), { t: 0.15 + i * 0.06, bright: 0.35, dur: 1.4, gain: 0.045, pan: -0.3 + i * 0.15, wet: 0.25 }));
        bell(midi(96), { t: 0.5, partials: GLASS, gain: 0.02, dur: 1.8, wet: 0.35 });
      },
    },
  };

  /* ================= Lines: the cast ================= */
  /* Each plays as the line flies out (about 0.2 to 0.9 s after the swing). whir: how much of the plain
     spool whir stays underneath (default half). */
  const L = (play, whir) => ({ play, whir });
  const lines = {
    // Waxed Linen: a soft, breathy whoosh
    linen: L(() => noise({ t: 0.17, type: 'bandpass', f: 1100, f1: 700, q: 0.6, a: 0.1, d: 0.4, gain: 0.09, pan: 0.2, wet: 0.1 }), 0.3),
    // Golden Thread: a golden shimmer running up the scale
    gold: L(() => {
      const root = pick([84, 86, 88]);
      [0, 2, 4, 7, 9, 12, 14, 16].forEach((s, i) => bell(midi(root + s), { t: 0.2 + i * 0.055, partials: GLASS, gain: 0.014 * (1 - i / 12), dur: 1.1, pan: -0.1 + i * 0.07, beat: false, wet: 0.35 }));
      noise({ t: 0.18, type: 'bandpass', f: 5200, f1: 3200, q: 2.5, a: 0.15, d: 0.5, gain: 0.012, pan: 0.2, wet: 0.3 });
      osc(midi(root - 24), { t: 0.2, type: 'warm', a: 0.15, d: 0.6, gain: 0.008, lp: 1500, dest: K.music, wet: 0.3 });
    }),
    // Mariner's Chain: the links tinkling as they run out
    chain: L(() => {
      for (let i = 0; i < 12; i++) bell(rand(2600, 4200), { t: 0.18 + i * 0.035 + i * i * 0.002, partials: [[1, 1, 1], [1.48, 0.5, 0.5], [2.3, 0.25, 0.3]], gain: 0.018 * (1 - i / 16), dur: 0.12, pan: 0.2, beat: false, dest: K.sfx, wet: 0.12 });
    }, 0.3),
    // Ember Braid: a flare of flame and crackling sparks
    ember: L(() => {
      noise({ t: 0.16, type: 'bandpass', f: 350, f1: 1100, fTime: 0.3, q: 0.7, a: 0.08, d: 0.45, gain: 0.05, pan: 0.2, wet: 0.12 });
      noise({ t: 0.16, kind: 'brown', type: 'lowpass', f: 250, q: 0.6, a: 0.1, d: 0.5, gain: 0.05, wet: 0.1 });
      for (let i = 0; i < 9; i++) noise({ t: 0.2 + Math.random() * 0.6, type: 'bandpass', f: rand(1800, 4200), q: 2, a: 0.0008, d: 0.008, gain: rand(0.02, 0.04), pan: rand(0, 0.5), wet: 0.1 });
    }, 0.2),
    // Ball of Yarn: a soft woolly whoosh after two clicks of the needles
    yarn: L(() => {
      wood(midi(91), { t: 0.05, gain: 0.012, dur: 0.06 }); wood(midi(93), { t: 0.11, gain: 0.012, dur: 0.06 });
      noise({ t: 0.17, type: 'lowpass', f: 700, f1: 400, q: 0.5, a: 0.1, hold: 0.1, d: 0.35, gain: 0.07, pan: 0.2, wet: 0.1 });
    }, 0.2),
    // Dog Leash: the tag jingling and the nylon zipping out
    leash: L(() => {
      for (let i = 0; i < 3; i++) bell(rand(3000, 3600), { t: 0.2 + i * 0.04, partials: [[1, 1, 1], [2.4, 0.4, 0.5]], gain: 0.01, dur: 0.35, beat: false, dest: K.sfx, wet: 0.15 });
      flutter({ t: 0.18, f: 1800, q: 1.2, rate: 55, rate1: 30, dur: 0.3, gain: 0.04, pan: 0.2 });
    }, 0.3),
    // Koi Silk: a swish of silk and a koto running down the scale
    koisilk: L(() => {
      noise({ t: 0.17, type: 'bandpass', f: 2600, f1: 1400, q: 1.2, a: 0.08, d: 0.35, gain: 0.04, pan: 0.2, wet: 0.12 });
      [84, 80, 79, 77, 73, 72].forEach((m, i) => pluck(midi(m), { t: 0.22 + i * 0.06, bright: 0.45, dur: 0.8, gain: 0.02, lpf: 5000, pan: 0.3 - i * 0.08, wet: 0.25 }));
    }, 0.3),
    // Diamond Leash: diamonds sparkling and the clip jingling
    diamondleash: L(() => {
      [103, 100, 98, 96, 93, 91, 88, 86, 84].forEach((m, i) => bell(midi(m), { t: 0.18 + i * 0.045, partials: GLASS, gain: 0.008, dur: 0.7, pan: 0.4 - i * 0.08, beat: false, wet: 0.35 }));
      for (let i = 0; i < 2; i++) bell(rand(3000, 3500), { t: 0.2 + i * 0.05, partials: [[1, 1, 1], [2.4, 0.4, 0.5]], gain: 0.012, dur: 0.3, beat: false, dest: K.sfx, wet: 0.15 });
    }),
    // Sailor Rope: rough hemp rasping out with a creak
    rope: L(() => {
      flutter({ t: 0.17, f: 650, q: 0.9, rate: 34, rate1: 22, dur: 0.45, gain: 0.09, hard: true, pan: 0.2 });
      osc(140, { t: 0.2, type: 'reed', a: 0.03, d: 0.2, glide: 120, gain: 0.012, lp: 900, vib: [18, 40], wet: 0.1 });
    }, 0.3),
    // Sea Glass: beads clicking together with a trickle of water
    seaglass: L(() => {
      let t = 0.2;
      for (let i = 0; i < 6; i++) { bell(rand(1900, 2700), { t, partials: GLASS, gain: 0.012, dur: 0.25, beat: false, dest: K.sfx, wet: 0.2 }); t += rand(0.05, 0.09); }
      for (let i = 0; i < 3; i++) bubble(rand(900, 1500), { t: 0.3 + i * 0.12, dur: 0.035, gain: 0.015, wet: 0.25 });
    }),
    // Mermaid's Braid: a dreamy harp glissando and a few bubbles
    mermaid: L(() => {
      [72, 74, 76, 78, 79, 81, 83, 84, 86].forEach((m, i) => pluck(midi(m), { t: 0.18 + i * 0.04, bright: 0.4, dur: 1.2, gain: 0.016, pan: -0.2 + i * 0.05, wet: 0.3 }));
      for (let i = 0; i < 4; i++) bubble(rand(700, 1300), { t: 0.4 + i * 0.1, dur: 0.04, gain: 0.015, wet: 0.3 });
    }),
    // Paracord: nylon zipping out
    paracord: L(() => flutter({ t: 0.17, f: 2200, f1: 1400, q: 1.4, rate: 70, rate1: 40, dur: 0.35, gain: 0.12, pan: 0.2 }), 0.3),
    // Pine Garland: needles rustling and a chickadee somewhere up the trail
    pine: L(() => {
      flutter({ t: 0.17, f: 4200, q: 0.7, rate: 22, dur: 0.4, gain: 0.03, pan: 0.2 });
      osc(3950, { t: 0.45, a: 0.02, hold: 0.12, d: 0.08, gain: 0.008, lp: 5000, pan: 0.4, wet: 0.5 });
      osc(3350, { t: 0.7, a: 0.02, hold: 0.14, d: 0.1, gain: 0.008, lp: 5000, pan: 0.4, wet: 0.5 });
    }),
    // Hoarfrost: a cold breath of wind, ice tinkling and one small crack
    frost: L(() => {
      noise({ t: 0.17, type: 'bandpass', f: 3200, f1: 1800, q: 4, a: 0.12, d: 0.5, gain: 0.05, pan: 0.2, wet: 0.3 });
      for (let i = 0; i < 5; i++) bell(midi(pick([96, 100, 103, 105])), { t: 0.22 + i * rand(0.06, 0.12), partials: GLASS, gain: 0.011, dur: 0.8, beat: false, pan: rand(-0.2, 0.6), wet: 0.4 });
      noise({ t: 0.5, type: 'highpass', f: 2000, a: 0.001, d: 0.02, gain: 0.02, wet: 0.2 });
    }),
    // Summit Rope: the carabiner clinks and the rope whips out
    summit: L(() => {
      const part = [[1, 1, 1], [2.6, 0.5, 0.5], [4.1, 0.3, 0.35]];
      bell(2350, { t: 0.17, partials: part, gain: 0.016, dur: 0.25, beat: false, dest: K.sfx, wet: 0.15, lp: 7000 });
      bell(2500, { t: 0.21, partials: part, gain: 0.012, dur: 0.25, beat: false, dest: K.sfx, wet: 0.15, lp: 7000 });
      noise({ t: 0.18, type: 'bandpass', f: 700, f1: 1100, q: 1, a: 0.1, d: 0.35, gain: 0.04, pan: 0.2, wet: 0.1 });
    }, 0.3),
    // Rose Silk: a silky swish
    rose: L(() => {
      noise({ t: 0.17, type: 'bandpass', f: 1800, f1: 3000, fTime: 0.2, q: 1.5, a: 0.09, d: 0.2, gain: 0.13, pan: 0.2, wet: 0.12 });
      noise({ t: 0.38, type: 'bandpass', f: 3000, f1: 1500, fTime: 0.3, q: 1.5, a: 0.05, d: 0.3, gain: 0.1, pan: 0.3, wet: 0.12 });
    }, 0.3),
    // Daisy Chain: a breathy little flute call
    daisychain: L(() => {
      osc(880, { t: 0.2, a: 0.06, hold: 0.08, d: 0.25, curve: Float32Array.from([880, 988, 1047]), curveTime: 0.3, gain: 0.014, vib: [5, 12], wet: 0.35, dest: K.music });
      noise({ t: 0.2, type: 'bandpass', f: 1000, q: 6, a: 0.06, d: 0.3, gain: 0.012, wet: 0.3 });
    }),
    // Satin Ribbon: a ribbon fluttering in the wind
    satin: L(() => flutter({ t: 0.17, f: 1300, q: 0.8, rate: 17, rate1: 8, dur: 0.55, a: 0.05, gain: 0.11, pan: 0.2, wet: 0.15 }), 0.2),
    // Pearl Strand: pearls rattling smoothly through the guides
    pearls: L(() => { for (let i = 0; i < 10; i++) bell(rand(1700, 2300), { t: 0.18 + i * 0.03, partials: [[1, 1, 1], [2.4, 0.3, 0.4]], dur: 0.06, gain: 0.012, beat: false, dest: K.sfx, wet: 0.15 }); }, 0.3),
    // Moonbeam: an ethereal glow of sound
    moon: L(() => {
      [[81, 0.012], [88, 0.011], [93, 0.008]].forEach(([m, g], i) => osc(midi(m), { t: 0.17 + i * 0.03, a: 0.2, d: 0.7, gain: g, wet: 0.55, dest: K.music }));
      noise({ t: 0.17, type: 'bandpass', f: 6000, q: 3, a: 0.2, d: 0.5, gain: 0.006, wet: 0.5 });
    }),
    // Stardust Trail: fairy dust scattering
    stardust: L(() => { for (let i = 0; i < 10; i++) bell(midi(pick([91, 93, 96, 98, 100, 103])), { t: 0.18 + Math.random() * 0.55, partials: GLASS, gain: 0.007, dur: 0.7, pan: rand(-0.4, 0.7), beat: false, wet: 0.4 }); }),
    // Prism Cord: a rainbow, seven bright notes in a row
    prism: L(() => { [79, 81, 83, 84, 86, 88, 91].forEach((m, i) => bell(midi(m), { t: 0.18 + i * 0.05, partials: GLASS, gain: 0.011, dur: 1, pan: -0.4 + i * 0.13, beat: false, wet: 0.35 })); }),
    // Constellation Thread: stars lighting up one by one into a chord
    constellation: L(() => {
      [[84, 0.18], [91, 0.27], [98, 0.33], [100, 0.46], [105, 0.52]].forEach(([m, t]) => bell(midi(m), { t, partials: TUBE, gain: 0.01, dur: 1.6, pan: rand(-0.5, 0.5), beat: false, wet: 0.5 }));
      osc(midi(60), { t: 0.18, type: 'warm', a: 0.2, d: 0.8, gain: 0.01, lp: 1200, dest: K.music, wet: 0.5 });
    }),
    // Licorice Twist: a rubbery twang
    licorice: L(() => osc(320, { t: 0.2, type: 'triangle', a: 0.01, d: 0.35, glide: 260, glideTime: 0.3, vib: [9, 90], gain: 0.02, lp: 1400, wet: 0.12 })),
    // Spaghetti: a wet, wobbly noodle
    spaghetti: L(() => noise({ t: 0.17, type: 'bandpass', fCurve: Float32Array.from([600, 1400, 800, 1800, 900, 1500, 700]), fTime: 0.4, q: 4, a: 0.05, d: 0.35, gain: 0.22, pan: 0.2, wet: 0.12 }), 0.3),
    // Icing Swirl: the piping bag squeezed, and a few sugar sparkles
    icing: L(() => {
      flutter({ t: 0.17, type: 'lowpass', f: 1100, q: 0.7, rate: 9, dur: 0.35, gain: 0.045, pan: 0.2 });
      for (let i = 0; i < 3; i++) bell(midi(pick([96, 100, 103])), { t: 0.35 + i * 0.08, partials: GLASS, gain: 0.007, dur: 0.6, beat: false, wet: 0.3 });
    }, 0.3),
    // Spun Sugar: brittle crystal crackle over a warm caramel tone
    sugar: L(() => {
      for (let i = 0; i < 10; i++) bell(rand(2600, 4200), { t: 0.18 + Math.random() * 0.5, partials: GLASS, gain: 0.007, dur: 0.05, beat: false, dest: K.sfx, wet: 0.2 });
      osc(midi(76), { t: 0.18, type: 'warm', a: 0.1, d: 0.5, gain: 0.01, lp: 2000, dest: K.music, wet: 0.3 });
    }),
  };

  return { rods, bobbers, lines };
});
