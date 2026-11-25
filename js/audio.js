/* Tidesong — synthesised sound. Everything is generated with the Web Audio API: no audio files.
   Audio starts on the first tap or click (browser autoplay rules).

   How it is built:
   - Voices are soft by construction: plucked notes are a physically modelled string (Karplus–Strong),
     bells and chimes are modal (a handful of decaying partials), noise is pink or brown rather than
     white, and every envelope is smooth, so nothing clicks or bites.
   - Water is made the way water sounds: drops and splashes are clusters of tiny bubbles whose pitch
     rises as they ring, laps are swells of filtered noise, surf gathers, breaks and washes back.
   - Animals are shaped like voices: frogs and gulls are a pulsing source through formant filters,
     crickets are a tone gated into chirps of pulses, birds sing phrases of swept notes.
   - Each water has its own acoustic space (a generated reverb) and its own ambient layers; travelling
     dissolves one scene into the next: the old one muffles and drifts into its echo, the new one
     opens up, and the reverb itself crossfades.
   - The master chain softens the top end, glues everything with a gentle compressor and a limiter. */
'use strict';

const Sound = (() => {
  let ctx = null, enabled = true;
  let master, sfx, amb, music, verbIn, verbHP;
  let whiteBuf, pinkBuf, brownBuf, warmWave, reedWave, softWave, pulseCurve, softPulse, gateCurve;
  let ambient = null, ambientWanted = null, reel = null, ticker = null, offline = false;
  const space = { slots: [], active: 0, id: null };
  const MASTER = 0.92;

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ================= Setup ================= */
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }

    // master: remove rumble, soften the top end, glue, then catch peaks
    master = ctx.createGain(); master.gain.value = enabled ? MASTER : 0;
    const low = filter('highpass', 30, 0.6);
    const shelf = filter('highshelf', 6500); shelf.gain.value = -3;
    const top = filter('lowpass', 16000, 0.707);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 16; glue.ratio.value = 2.4; glue.attack.value = 0.02; glue.release.value = 0.3;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -5; limit.knee.value = 3; limit.ratio.value = 14; limit.attack.value = 0.003; limit.release.value = 0.12;
    master.connect(low); low.connect(shelf); shelf.connect(top); top.connect(glue); glue.connect(limit); limit.connect(ctx.destination);

    // the acoustic space: two convolver slots so one water's reverb can crossfade into the next
    verbIn = ctx.createGain();
    verbHP = filter('highpass', 130, 0.6);
    const vLP = filter('lowpass', 8500, 0.6);
    const vOut = ctx.createGain(); vOut.gain.value = 0.85;
    verbIn.connect(verbHP);
    for (let i = 0; i < 2; i++) {
      const g = ctx.createGain(); g.gain.value = i ? 0 : 1;
      g.connect(vLP);
      space.slots.push({ c: null, g });
    }
    vLP.connect(vOut); vOut.connect(master);

    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.9; amb.connect(master);
    // the music bus (harp, bells, fanfares): a little warmth underneath and presence on top,
    // so the notes sit close and full rather than thin and far away
    music = ctx.createGain(); music.gain.value = 0.72;
    const warmth = filter('lowshelf', 260); warmth.gain.value = 3;
    const presence = filter('peaking', 2800, 0.9); presence.gain.value = 1.5;
    music.connect(warmth); warmth.connect(presence); presence.connect(master);

    whiteBuf = makeNoise(2, 'white');
    pinkBuf = makeNoise(6, 'pink');
    brownBuf = makeNoise(6, 'brown');
    warmWave = periodic([1, 0.3, 0.11, 0.045, 0.02]);
    reedWave = periodic([1, 0.55, 0.38, 0.27, 0.2, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.025]);
    softWave = periodic([1, 0.12, 0.03]);
    pulseCurve = shapeCurve(x => Math.pow(0.5 + 0.5 * x, 3));
    softPulse = shapeCurve(x => Math.pow(0.5 + 0.5 * x, 1.6));
    gateCurve = shapeCurve(x => { const v = clamp((x - 0.35) / 0.3, 0, 1); return v * v * (3 - 2 * v); });

    setSpace('default', 0);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    ticker = setInterval(tick, 180);
    if (ambientWanted) startAmbient(ambientWanted);
  }

  function filter(type, freq, q) {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return f;
  }
  function gainNode(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function panNode(v) {
    if (!ctx.createStereoPanner) return ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = clamp(v || 0, -1, 1); return p;
  }
  function periodic(h) {
    const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
    h.forEach((a, i) => { im[i + 1] = a; });
    return ctx.createPeriodicWave(re, im);
  }
  function shapeCurve(fn) {
    const c = new Float32Array(512);
    for (let i = 0; i < 512; i++) c[i] = fn((i / 511) * 2 - 1);
    return c;
  }
  const expCurve = (a, b, n = 24) => Float32Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));

  function makeNoise(dur, kind) {
    const rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      let v;
      if (kind === 'pink') {
        // Paul Kellet's filter: equal energy per octave, the hush of real water and wind
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; v = last; }
      else v = w;
      d[i] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    // loop seamlessly: crossfade the end into the start
    const x = Math.floor(rate * 0.05);
    for (let i = 0; i < x; i++) { const k = i / x; d[len - x + i] = d[len - x + i] * (1 - k) + d[i] * k; }
    for (let i = 0; i < len; i++) d[i] /= peak;
    return buf;
  }

  /* ================= Acoustic spaces ================= */
  /* A generated impulse response: a short silence, optional early echoes, then a diffuse tail that
     darkens as it decays (high frequencies die first, as they do in air). */
  const SPACES = {
    default:    { dur: 2.4, damp: 5200, pre: 0.015, build: 0.02 },
    mistwillow: { dur: 2.8, damp: 4600, pre: 0.022, build: 0.03, early: [[0.05, 0.35], [0.09, 0.22]] },
    lanternfen: { dur: 3.4, damp: 2900, pre: 0.028, build: 0.05, early: [[0.06, 0.3]] },
    coralspire: { dur: 1.8, damp: 7000, pre: 0.012, build: 0.02 },
    frostveil:  { dur: 5.2, damp: 4200, pre: 0.03, build: 0.3, early: [[0.21, 1.0], [0.44, 0.7], [0.7, 0.45]] },
    dragonmere: { dur: 4.4, damp: 3300, pre: 0.04, build: 0.08, early: [[0.08, 0.5], [0.15, 0.3]] },
  };
  function makeIR(sp) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sp.dur), b = ctx.createBuffer(2, len, sr);
    const pre = Math.floor(sp.pre * sr), build = Math.max(1, sp.build * sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const k = (i - pre) / (len - pre);
        const fc = sp.damp * (1 - 0.78 * k) + 180, a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        lp += (Math.random() * 2 - 1 - lp) * a;
        d[i] = lp * Math.pow(1 - k, 1.4) * Math.exp(-3 * k) * Math.min(1, (i - pre) / build);
      }
      for (const [tt, g] of sp.early || []) {
        // an echo off a far bank or cliff: a short, soft, darkened burst
        const at = pre + Math.floor((tt + (ch ? 0.009 : 0)) * sr), n = Math.floor(sr * 0.04);
        let e = 0;
        for (let j = 0; j < n && at + j < len; j++) { e += (Math.random() * 2 - 1 - e) * 0.25; d[at + j] += e * g * Math.exp(-j / (n / 5)); }
      }
    }
    return b;
  }
  function setSpace(id, fade) {
    if (space.id === id) return;
    space.id = id;
    const now = ctx.currentTime, next = 1 - space.active, A = space.slots[space.active], B = space.slots[next];
    // a fresh convolver for the incoming space (buffers are not swapped under a live signal)
    if (B.c) { try { B.c.disconnect(); } catch (e) {} }
    B.c = ctx.createConvolver();
    B.c.buffer = makeIR(SPACES[id] || SPACES.default);
    verbHP.connect(B.c); B.c.connect(B.g);
    const ramp = (p, v) => { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(v, now + Math.max(0.02, fade)); };
    ramp(B.g.gain, 1); ramp(A.g.gain, 0);
    space.active = next;
  }

  /* ================= Takes =================
     Every effect played is a fresh take (see play()): the whole of it shifted a few cents, a touch louder
     or softer, and each note after the first a few milliseconds early or late. Outside an effect (the
     ambience, the reel, the gear's voices on their own) the take is neutral and nothing changes. */
  const NO_TAKE = { c: 0, g: 1, j: 0 };
  let TAKE = NO_TAKE;
  const when = o => { const t = o.t || 0; return o._fixed || t <= 0 || !TAKE.j ? t : Math.max(0, t + rand(-TAKE.j, TAKE.j)); };
  /* For sounds with several variants: a different one each time, never the same twice running. */
  const lastPick = {};
  function pickV(name, n) {
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === lastPick[name]) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    lastPick[name] = i;
    return i;
  }

  /* ================= Voice building blocks ================= */
  /* Connect a voice to the mix: optional "distance" low-pass, pan (or a pan sweep), and a reverb send. */
  function route(node, o) {
    let n = node;
    if (o.lp) { const f = filter('lowpass', o.lp, 0.5); n.connect(f); n = f; }
    if ((o.pan || o.panTo !== undefined) && ctx.createStereoPanner) {
      const p = panNode(o.pan);
      if (o.panTo !== undefined) { p.pan.setValueAtTime(clamp(o.pan || 0, -1, 1), o._t0); p.pan.linearRampToValueAtTime(clamp(o.panTo, -1, 1), o._t0 + (o.panTime || 1)); }
      n.connect(p); n = p;
    }
    n.connect(o.dest || sfx);
    const wet = o.wet ?? 0.18;
    if (wet > 0) { const s = gainNode(wet); n.connect(s); s.connect(o.verb || verbIn); }
    return n;
  }

  /* Gain envelope: rise to `peak` over `a` seconds, hold, then an exponential tail of about `d` seconds. */
  function env(t0, a, peak, d, hold = 0) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setTargetAtTime(0, t0 + a + hold, Math.max(0.004, d / 4.6));
    return g;
  }
  const endOf = (t0, a, d, hold = 0) => t0 + a + hold + d * 1.25 + 0.05;

  /* One oscillator. o: t, a, d, hold, gain, type (sine|triangle|warm|reed), glide/glideTime, curve/curveTime,
     vib [rate, cents], detune, lp, pan, panTo, wet, dest, verb, into (connect here instead of routing). */
  function osc(freq, o = {}) {
    if (!ctx) return null;
    const t0 = ctx.currentTime + when(o), a = o.a ?? 0.01, d = o.d ?? 0.4, hold = o.hold || 0;
    const s = ctx.createOscillator();
    if (o.type === 'warm') s.setPeriodicWave(warmWave); else if (o.type === 'reed') s.setPeriodicWave(reedWave); else s.type = o.type || 'sine';
    if (o.curve) { s.frequency.value = o.curve[0]; s.frequency.setValueCurveAtTime(o.curve, t0, o.curveTime || a + hold + d * 0.5); }
    else {
      s.frequency.setValueAtTime(freq, t0);
      if (o.glide) s.frequency.exponentialRampToValueAtTime(o.glide, t0 + (o.glideTime || a + hold + d * 0.5));
    }
    if (o.detune || TAKE.c) s.detune.value = (o.detune || 0) + TAKE.c;
    const end = endOf(t0, a, d, hold);
    if (o.vib) {
      const v = ctx.createOscillator(), vg = gainNode(o.vib[1]);
      v.frequency.value = o.vib[0]; v.connect(vg); vg.connect(s.detune); v.start(t0); v.stop(end);
    }
    const g = env(t0, a, (o.gain ?? 0.1) * (o.into ? 1 : TAKE.g), d, hold);
    s.connect(g);
    if (o.into) g.connect(o.into); else route(g, { ...o, _t0: t0 });
    s.start(t0); s.stop(end);
    return s;
  }

  /* Filtered noise. o: t, a, d, hold, gain, kind (pink|white|brown), type (filter), f, f1, fTime, fCurve,
     q, lp2, gainCurve (replaces the envelope), pan, panTo, wet, dest, verb, into. */
  function noise(o = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when(o), a = o.a ?? 0.01, d = o.d ?? 0.3, hold = o.hold || 0;
    const src = ctx.createBufferSource();
    src.buffer = o.kind === 'white' ? whiteBuf : o.kind === 'brown' ? brownBuf : pinkBuf;
    src.loop = true;
    const f = filter(o.type || 'bandpass', o.f || 1000, o.q ?? 0.8);
    if (TAKE.c) f.detune.value = TAKE.c;
    if (o.fCurve) { f.frequency.value = o.fCurve[0]; f.frequency.setValueCurveAtTime(o.fCurve, t0, o.fTime || a + hold + d); }
    else if (o.f1) { f.frequency.setValueAtTime(o.f || 1000, t0); f.frequency.exponentialRampToValueAtTime(o.f1, t0 + (o.fTime || a + hold + d)); }
    let g, end;
    if (o.gainCurve) {
      g = gainNode(0); g.gain.setValueCurveAtTime(o.gainCurve, t0, o.curveTime); end = t0 + o.curveTime + 0.05;
    } else { g = env(t0, a, (o.gain ?? 0.1) * (o.into ? 1 : TAKE.g), d, hold); end = endOf(t0, a, d, hold); }
    src.connect(f); f.connect(g);
    let last = g;
    if (o.lp2) { const f2 = filter('lowpass', o.lp2, 0.5); g.connect(f2); last = f2; }
    if (o.into) last.connect(o.into); else route(last, { ...o, _t0: t0 });
    src.start(t0, Math.random() * (src.buffer.duration - 1)); src.stop(end);
  }

  /* A water drop or bubble: a sine whose pitch rises as it rings, the way small bubbles sound. */
  function bubble(f0, o = {}) {
    const dur = o.dur || 0.06;
    // the onset lasts about a cycle, so low bubbles do not click
    osc(f0, { ...o, a: clamp(1.4 / f0, 0.0015, 0.007), d: dur, gain: o.gain ?? 0.04, glide: f0 * (o.rise || 2.1), glideTime: dur * 0.9, wet: o.wet ?? 0.24 });
  }

  /* Plucked string (Karplus–Strong): a burst of soft noise circulating through a damped delay line.
     It decays and darkens the way a real string does. Buffers are cached per note. */
  const ksCache = new Map();
  function ksBuffer(freq, bright, sustain) {
    const key = `${freq}|${bright}|${sustain}`;
    let b = ksCache.get(key);
    if (b) return b;
    const sr = ctx.sampleRate, N = Math.floor(sr * Math.min(4.5, sustain * 1.2 + 0.25));
    const period = sr / freq, L = Math.max(2, Math.floor(period - 0.5)), frac = period - 0.5 - L;
    const C = (1 - frac) / (1 + frac); // all-pass for exact tuning
    // the string starts as a finger would leave it: a triangle displaced at the plucking point,
    // which puts most of the energy in the fundamental, plus a little texture from the fingertip
    const ring = new Float32Array(L), pos = 0.27;
    let lp = 0, mean = 0;
    for (let i = 0; i < L; i++) {
      const x = i / L, tri = x < pos ? x / pos : (1 - x) / (1 - pos);
      lp += (Math.random() * 2 - 1 - lp) * bright;
      ring[i] = tri + lp * 0.45; mean += ring[i];
    }
    mean /= L;
    for (let i = 0; i < L; i++) ring[i] -= mean;
    const loss = Math.pow(0.001, 1 / (freq * sustain));
    b = ctx.createBuffer(1, N, sr);
    const d = b.getChannelData(0);
    let idx = 0, prev = 0, apx = 0, apy = 0, peak = 1e-6;
    for (let n = 0; n < N; n++) {
      const cur = ring[idx];
      d[n] = cur;
      if (Math.abs(cur) > peak) peak = Math.abs(cur);
      const avg = 0.5 * (cur + prev); prev = cur;
      const ap = C * avg + apx - C * apy; apx = avg; apy = ap;
      ring[idx] = ap * loss;
      if (++idx === L) idx = 0;
    }
    const k = 0.9 / peak, fade = Math.floor(sr * 0.0025);
    for (let n = 0; n < N; n++) d[n] *= k * (n < fade ? n / fade : 1);
    if (ksCache.size > 200) ksCache.delete(ksCache.keys().next().value);
    ksCache.set(key, b);
    return b;
  }
  function pluck(freq, o = {}) {
    if (!ctx) return;
    const tt = when(o), t0 = ctx.currentTime + tt;
    const src = ctx.createBufferSource();
    src.buffer = ksBuffer(Math.round(freq * 10) / 10, o.bright ?? 0.3, Math.round((o.dur || 1.4) * 10) / 10);
    if (TAKE.c) src.playbackRate.value = Math.pow(2, TAKE.c / 1200);
    // a gentle top that keeps the attack's presence, and a round sine body under the string
    const tone = filter('lowpass', o.lpf || Math.min(7500, freq * 9), 0.5);
    const g = gainNode((o.gain ?? 0.1) * TAKE.g);
    src.connect(tone); tone.connect(g);
    osc(freq, { t: tt, _fixed: true, a: 0.004, d: Math.min(1.4, (o.dur || 1.4) * 0.55), gain: 0.4, into: tone });
    route(g, { ...o, _t0: t0, dest: o.dest || music, wet: o.wet ?? 0.2 });
    src.start(t0);
  }

  /* Modal bells and chimes: a few partials, the higher ones dying sooner. */
  const BELL = [[1, 1, 1], [2.0, 0.4, 0.55], [2.76, 0.26, 0.42], [5.4, 0.09, 0.22], [8.93, 0.04, 0.12]];
  const GLASS = [[1, 1, 1], [2.32, 0.3, 0.6], [4.25, 0.14, 0.34], [6.63, 0.06, 0.2]];
  const TUBE = [[1, 1, 1], [2.76, 0.36, 0.55], [5.4, 0.16, 0.3], [8.93, 0.05, 0.15]];
  function bell(freq, o = {}) {
    if (!ctx) return;
    const g = (o.gain ?? 0.05) * TAKE.g, dur = o.dur ?? 2.2, bus = ctx.createGain(), tt = when(o);
    route(bus, { ...o, _t0: ctx.currentTime + tt, dest: o.dest || music, wet: o.wet ?? 0.25 });
    for (const [m, amp, dm] of o.partials || BELL) {
      const f = freq * m;
      if (f > 9500) continue;
      osc(f, { t: tt, _fixed: true, a: o.a ?? 0.0035, d: dur * dm, gain: g * amp, detune: rand(-3, 3), into: bus });
    }
    // a faint twin a fraction of a hertz away gives the slow shimmer of a real bell (a fixed ratio
    // made high notes warble several times a second)
    if (o.beat !== false) osc(freq + clamp(freq * 0.0012, 0.25, 1.1), { t: tt, _fixed: true, a: 0.02, d: dur * 0.85, gain: g * 0.22, into: bus });
  }

  /* A soft wooden tone (marimba-like) for taps and gentle refusals. */
  function wood(freq, o = {}) {
    if (!ctx) return;
    const g = (o.gain ?? 0.07) * TAKE.g, bus = ctx.createGain(), tt = when(o);
    route(bus, { ...o, _t0: ctx.currentTime + tt, wet: o.wet ?? 0.15 });
    osc(freq, { t: tt, _fixed: true, a: 0.002, d: o.dur ?? 0.45, gain: g, into: bus });
    osc(freq * 3.93, { t: tt, _fixed: true, a: 0.0015, d: 0.07, gain: g * 0.18, into: bus });
    noise({ t: tt, _fixed: true, a: 0.001, d: 0.012, f: Math.min(4000, freq * 2.4), q: 1.6, gain: g * 0.35, into: bus });
  }

  /* A soft, round sustained tone (a sine with a breath of overtone) that swells in and settles away on
     smooth curves: the body under the music's chords. One oscillator per note, so it never beats. */
  function glow(freq, o = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when(o), a = o.a ?? 0.45, hold = o.hold ?? 0.3, d = o.d ?? 2.6, peak = (o.gain ?? 0.02) * TAKE.g;
    const s = ctx.createOscillator(); s.setPeriodicWave(softWave); s.frequency.value = freq;
    const g = ctx.createGain(), n = 32, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = peak * (0.5 - 0.5 * Math.cos(Math.PI * i / (n - 1)));
    g.gain.setValueAtTime(0, t0); g.gain.setValueCurveAtTime(c, t0, a);
    g.gain.setTargetAtTime(0, t0 + a + hold + 0.001, Math.max(0.05, d / 4.6));
    s.connect(g);
    route(g, { ...o, _t0: t0, lp: o.lp ?? 1600, dest: o.dest || music, wet: o.wet ?? 0.3 });
    s.start(t0); s.stop(endOf(t0, a, d, hold));
  }

  /* The music follows the water. Each water's pad plays chords in one key, and the music written for
     the catch (bites, the reel's harp, the landing, chimes and rewards) is written in C and moved into
     that key, while the landing resolves on the very chord the pad is playing. */
  const PENT = [0, 2, 4, 7, 9];
  const keyOf = () => (ambient && !ambient.dead && ambient.L.key) || 0;
  const tr = n => n + keyOf();
  const fit = (n, lo) => lo + (((n - lo) % 12) + 12) % 12;
  function harmony() {
    const h = ambient && !ambient.dead ? ambient : null, k = h ? h.L.key || 0 : 0;
    const chord = h ? h.L.chords[h.chord] : [48, 55, 64, 67];
    const pcs = new Set(chord.map(n => n % 12)), inKey = n => PENT.includes((((n - k) % 12) + 12) % 12);
    return {
      chord, root: chord[0], tone: n => pcs.has(((n % 12) + 12) % 12),
      // the scale's notes from lo up to hi
      scale(lo, hi) { const out = []; for (let n = lo; n <= hi; n++) if (inKey(n)) out.push(n); return out; },
      // the chord from its root (placed at or just above lo), `count` notes upward, spaced at least a
      // minor third apart so the low notes never crowd into a muddy cluster
      voicing(lo, count) {
        const out = [fit(chord[0], lo)];
        for (let n = out[0] + 3; out.length < count && n < out[0] + 40; n++) if (pcs.has(n % 12) && n - out[out.length - 1] >= 3) out.push(n);
        return out;
      },
    };
  }
  /* The water's pad swells and opens for a few seconds (a catch blooming), then settles back. Its next
     change of chord waits until the bloom has faded. */
  function bloomPad(k = 0, hold = 1.2) {
    const h = ambient;
    if (!ctx || !h || h.dead || !h.pad) return;
    const now = ctx.currentTime, P = h.pad, g = P.out.gain, f = P.lp.frequency;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.setTargetAtTime(P.base * (1.45 + 0.12 * k), now, 0.45);
    g.setTargetAtTime(P.base, now + hold + 0.9, 2.4);
    f.cancelScheduledValues(now); f.setValueAtTime(f.value, now);
    f.setTargetAtTime(1500 + 260 * k, now, 0.6);
    f.setTargetAtTime(P.f, now + hold + 0.9, 2.8);
    h.chordAt = Math.max(h.chordAt, now + hold + 9);
  }

  /* A splash: a burst of water that darkens as it falls back, a soft thump, then droplets raining down. */
  function splashFx(size, o = {}) {
    const s = Math.min(1.6, size), pan = o.pan || 0, t = o.t || 0, dest = o.dest, verb = o.verb;
    noise({ t, type: 'lowpass', f: 3000, f1: 420, fTime: 0.4 * s + 0.12, q: 0.6, a: 0.004, d: 0.32 + 0.42 * s, gain: 0.15 * s, pan, wet: 0.22, dest, verb });
    noise({ t, type: 'bandpass', f: 1300, f1: 2300, q: 0.7, a: 0.002, d: 0.11, gain: 0.045 * s, pan: pan + 0.2, wet: 0.15, dest, verb });
    osc(125, { t, a: 0.004, d: 0.12, glide: 68, glideTime: 0.1, gain: 0.08 * s, lp: 480, wet: 0.06, dest, verb });
    const n = Math.round(4 + 8 * s);
    for (let i = 0; i < n; i++) {
      bubble(rand(850, 2500), {
        t: t + 0.05 + Math.pow(Math.random(), 1.6) * (0.25 + 0.38 * s), dur: rand(0.02, 0.05), rise: rand(1.6, 2.5),
        gain: rand(0.01, 0.026), pan: clamp(pan + rand(-0.55, 0.55), -1, 1), wet: 0.3, lp: 5200, dest, verb,
      });
    }
  }

  /* ================= Animal voices ================= */
  /* Frog: a reedy pulse train through two throat formants, in one or two syllables. */
  function croak(o = {}) {
    const t0 = ctx.currentTime + (o.t || 0), deep = o.deep;
    const f = deep ? rand(86, 104) : rand(150, 195);
    const syll = deep ? [[0, 0.42, 1, 0.9]] : [[0, 0.09, 1, 0.93], [0.13, 0.15, 0.97, 0.8]];
    const s = ctx.createOscillator(); s.setPeriodicWave(reedWave); s.frequency.value = f;
    const f1 = filter('bandpass', deep ? 330 : 800, 4), f2 = filter('bandpass', deep ? 660 : 1600, 6), mix = gainNode(1), f2g = gainNode(0.55);
    s.connect(f1); s.connect(f2); f1.connect(mix); f2.connect(f2g); f2g.connect(mix);
    const am = ctx.createOscillator(); am.frequency.value = deep ? 23 : 38;
    const amS = ctx.createWaveShaper(); amS.curve = softPulse; const amG = gainNode(0);
    am.connect(amS); amS.connect(amG.gain); mix.connect(amG);
    const g = gainNode(0), peak = (o.far ? 0.16 : 0.3) * (o.gain || 1);
    let end = t0;
    for (const [dt, len, k0, k1] of syll) {
      const a = t0 + dt;
      s.frequency.setValueAtTime(f * k0, a); s.frequency.linearRampToValueAtTime(f * k1, a + len);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(peak, a + 0.018);
      g.gain.setValueAtTime(peak * 0.85, a + len - 0.03); g.gain.linearRampToValueAtTime(0, a + len);
      end = a + len;
    }
    amG.connect(g);
    route(g, { pan: o.pan, wet: o.far ? 0.5 : 0.28, lp: o.far ? 1700 : 2800, dest: o.dest, verb: o.verb, _t0: t0 });
    s.start(t0); am.start(t0); s.stop(end + 0.1); am.stop(end + 0.1);
  }

  /* Gull: a raspy, nasal "kee-ow", the pitch leaping then falling, a little vibrato. */
  function gullCall(o = {}) {
    const t0 = ctx.currentTime + (o.t || 0), n = o.n || 2 + Math.floor(Math.random() * 3), f = rand(1150, 1380);
    const s = ctx.createOscillator(); s.setPeriodicWave(reedWave); s.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = rand(8, 10); const vg = gainNode(28); vib.connect(vg); vg.connect(s.detune);
    const f1 = filter('bandpass', 2200, 2.5), f2 = filter('bandpass', 3400, 4), mix = gainNode(1), f2g = gainNode(0.5);
    s.connect(f1); s.connect(f2); f1.connect(mix); f2.connect(f2g); f2g.connect(mix);
    const rasp = ctx.createOscillator(); rasp.frequency.value = 27; const rS = ctx.createWaveShaper(); rS.curve = softPulse;
    const rG = gainNode(0.55), rD = gainNode(0.45); rasp.connect(rS); rS.connect(rD); rD.connect(rG.gain); mix.connect(rG);
    const g = gainNode(0), peak = 0.22 * (o.gain || 1);
    let at = t0;
    for (let i = 0; i < n; i++) {
      const kee = rand(0.05, 0.07), ow = rand(0.14, 0.2), k = rand(0.95, 1.05);
      s.frequency.setValueAtTime(f * k, at); s.frequency.linearRampToValueAtTime(f * 1.28 * k, at + kee);
      s.frequency.linearRampToValueAtTime(f * 0.74 * k, at + kee + ow);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.02);
      g.gain.setValueAtTime(peak * 0.9, at + kee + ow * 0.6); g.gain.linearRampToValueAtTime(0, at + kee + ow);
      at += kee + ow + rand(0.1, 0.2);
    }
    rG.connect(g);
    route(g, { pan: o.pan, panTo: o.panTo, panTime: at - t0, wet: o.wet ?? 0.4, lp: o.lp || 4200, dest: o.dest, verb: o.verb, _t0: t0 });
    for (const x of [s, vib, rasp]) { x.start(t0); x.stop(at + 0.1); }
  }

  /* Birdsong: one voice sings a phrase of swept notes: rising chirps, falling slurs, or trills. */
  function birdPhrase(o = {}) {
    const t0 = ctx.currentTime + (o.t || 0), base = rand(2500, 3700), n = 3 + Math.floor(Math.random() * 6);
    const shape = pick(['up', 'down', 'trill', 'mixed', 'mixed']);
    const s = ctx.createOscillator(); s.frequency.value = base;
    const g = gainNode(0);
    let at = t0;
    for (let i = 0; i < n; i++) {
      const kind = shape === 'mixed' ? pick(['up', 'down', 'trill']) : shape;
      const len = kind === 'trill' ? rand(0.12, 0.22) : rand(0.05, 0.1), f = base * rand(0.88, 1.12);
      const pts = kind === 'trill' ? Math.ceil(len * 26 * 8) : 12, curve = new Float32Array(pts);
      for (let k = 0; k < pts; k++) {
        const x = k / (pts - 1);
        curve[k] = kind === 'up' ? f * (1 + 0.42 * x * x) : kind === 'down' ? f * (1.32 - 0.4 * x) : f * (1 + 0.1 * Math.sin(x * len * 2 * Math.PI * 26));
      }
      s.frequency.setValueCurveAtTime(curve, at, len);
      const peak = (o.far ? 0.03 : 0.05) * rand(0.7, 1);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.01);
      g.gain.setValueAtTime(peak * 0.8, at + len - 0.016); g.gain.linearRampToValueAtTime(0, at + len);
      at += len + rand(0.035, 0.09);
    }
    s.connect(g);
    route(g, { pan: o.pan, wet: o.far ? 0.5 : 0.28, lp: o.far ? 4200 : 6500, dest: o.dest, verb: o.verb, _t0: t0 });
    s.start(t0); s.stop(at + 0.1);
  }

  /* ================= Gear voices =================
     Rods, bobbers and lines can carry their own voice: the line's as it flies out, the bobber's as it lands,
     the rod's as its reel turns. js/voices.js builds them from the kit below. Anything without one keeps
     the plain cast, plop and ratchet. */
  const GV = { rods: {}, bobbers: {}, lines: {} };
  const KIT = {
    osc, noise, bubble, pluck, bell, wood, croak, splashFx, ksBuffer, filter, gainNode, panNode, route, env, endOf,
    midi, rand, pick, clamp, BELL, GLASS, TUBE,
    get ctx() { return ctx; }, get sfx() { return sfx; }, get music() { return music; }, get verbIn() { return verbIn; },
    get pinkBuf() { return pinkBuf; }, get brownBuf() { return brownBuf; }, get whiteBuf() { return whiteBuf; },
    get reedWave() { return reedWave; }, get warmWave() { return warmWave; }, get pulseCurve() { return pulseCurve; }, get softPulse() { return softPulse; },
  };
  function defineVoices(make) {
    const v = make(KIT);
    for (const k in GV) Object.assign(GV[k], v[k] || {});
  }

  /* ================= Game sounds ================= */
  const S = {
    click() {
      // a soft tock: a slightly different note each time, so tabbing along the market never ticks like a clock
      wood(midi([84, 86, 83, 88, 81][pickV('click', 5)]), { gain: rand(0.019, 0.024), dur: rand(0.1, 0.14), wet: 0.08 });
    },

    open() {
      const v = [[79, 86], [81, 88], [76, 83], [79, 84], [74, 81, 86]][pickV('open', 5)], gap = rand(0.06, 0.08);
      v.forEach((n, i) => pluck(midi(tr(n)), { t: i * gap, gain: i ? 0.04 : 0.052, dur: 1.1 + i * 0.1, wet: 0.22 }));
    },

    cast(line) {
      // the rod swishing through the air
      noise({ type: 'bandpass', f: 380, f1: 1700, fTime: 0.2, q: 1.1, a: 0.07, d: 0.3, gain: 0.2, pan: -0.15, panTo: 0.35, panTime: 0.35, wet: 0.12 });
      // line whirring off the spool, slowing as the float flies; a line with its own voice sings over it
      const v = GV.lines[line];
      noise({ t: 0.16, type: 'bandpass', f: 2400, f1: 1200, fTime: 0.6, q: 1.8, a: 0.04, hold: 0.15, d: 0.45, gain: 0.04 * (v ? v.whir ?? 0.5 : 1), pan: 0.2, wet: 0.08, lp2: 4500 });
      if (v) v.play();
      let t = 0.18;
      for (let i = 0; i < 16; i++) {
        noise({ t: t + rand(-0.003, 0.003), kind: 'white', type: 'bandpass', f: rand(2900, 3400), q: 5, a: 0.0008, d: 0.016, gain: 0.07 * (1 - i / 20), pan: 0.2, wet: 0.05, lp2: 6000 });
        t += 0.02 + i * 0.0035;
      }
    },

    plop(size = 1, bobber) {
      // a bobber with its own voice adds it to the splash (and may land softer or heavier)
      const v = GV.bobbers[bobber];
      if (v) { v.play(); size *= v.plop ?? 1; }
      if (size <= 0.01) return;
      const s = clamp(size, 0.3, 1.4);
      bubble(300 / s, { dur: 0.1, rise: 2.6, gain: 0.26 * s, wet: 0.25 });
      bubble(rand(900, 1300) / s, { t: 0.05, dur: 0.04, rise: 2, gain: 0.035 * s, pan: rand(-0.3, 0.3) });
      bubble(rand(1400, 1900) / s, { t: 0.1, dur: 0.03, rise: 1.8, gain: 0.02 * s, pan: rand(-0.3, 0.3) });
      noise({ type: 'lowpass', f: 1300, f1: 320, a: 0.003, d: 0.28, gain: 0.08 * s, wet: 0.2 });
    },

    /* The bobber striking something in the water before it falls in: ice knocks and tinkles, a lily pad
       slaps, a post thunks hollow, a paper lantern gives a soft papery tap. */
    thud(kind = 'ice', pan = 0) {
      if (kind === 'ice') {
        wood(midi(76), { gain: 0.05, dur: 0.1, pan, wet: 0.25 });
        noise({ type: 'bandpass', f: 3200, q: 1.2, a: 0.001, d: 0.05, gain: 0.05, pan, wet: 0.2 });
        bell(midi(91), { gain: 0.012, dur: 0.5, partials: GLASS, pan, wet: 0.35, beat: false });
        for (let i = 0; i < 4; i++) bell(midi(96 + Math.floor(Math.random() * 7)), { t: 0.06 + i * rand(0.03, 0.06), gain: 0.006, dur: 0.3, partials: GLASS, pan: pan + rand(-0.15, 0.15), wet: 0.3, beat: false });
      } else if (kind === 'leaf') {
        noise({ type: 'lowpass', f: 900, f1: 300, a: 0.002, d: 0.09, gain: 0.07, pan, wet: 0.15 });
        wood(midi(60), { gain: 0.028, dur: 0.12, pan, wet: 0.15 });
        bubble(rand(700, 900), { t: 0.05, dur: 0.04, gain: 0.014, pan });
      } else if (kind === 'wood') {
        wood(midi(52), { gain: 0.075, dur: 0.32, pan, wet: 0.3 });
        wood(midi(45), { t: 0.02, gain: 0.04, dur: 0.4, pan, wet: 0.3 });
        noise({ type: 'bandpass', f: 700, q: 1.5, a: 0.001, d: 0.05, gain: 0.03, pan });
      } else {
        noise({ type: 'bandpass', f: 1700, f1: 900, q: 0.8, a: 0.002, d: 0.07, gain: 0.035, pan, wet: 0.2 });
        wood(midi(67), { gain: 0.02, dur: 0.1, pan, wet: 0.2 });
      }
    },

    nibble() {
      bubble(rand(750, 950), { dur: 0.05, rise: 1.8, gain: 0.055, wet: 0.2 });
      noise({ type: 'bandpass', f: 1200, q: 1.2, a: 0.002, d: 0.05, gain: 0.025, wet: 0.15 });
      bubble(rand(1100, 1400), { t: 0.09, dur: 0.035, rise: 1.8, gain: 0.025, wet: 0.2 });
    },

    splash(size = 1) { splashFx(size); },

    /* The bite cue is the same for every fish: rarity is only revealed by how it fights. */
    bite() {
      splashFx(1);
      osc(110, { a: 0.004, d: 0.14, glide: 66, glideTime: 0.12, gain: 0.12, lp: 380, wet: 0.05 });
      const [a, b] = [[76, 81], [74, 79], [76, 79], [79, 84]][pickV('bite', 4)];
      pluck(midi(tr(a)), { t: 0.03, gain: 0.105, dur: 1.3, bright: 0.3, wet: 0.22 });
      pluck(midi(tr(b)), { t: 0.14, gain: 0.095, dur: 1.7, bright: 0.29, wet: 0.24 });
    },

    escape() {
      splashFx(0.7);
      // the line going slack
      noise({ t: 0.04, type: 'bandpass', f: 1800, f1: 500, fTime: 0.3, q: 1.4, a: 0.01, d: 0.3, gain: 0.035, pan: 0.2, wet: 0.1 });
      const [a, b, c] = [[67, 62, 55], [69, 64, 57], [67, 64, 55], [64, 62, 57]][pickV('escape', 4)];
      pluck(midi(tr(a)), { t: 0.12, gain: 0.078, dur: 1.5, bright: 0.23, wet: 0.26 });
      pluck(midi(tr(b)), { t: 0.38, gain: 0.072, dur: 1.9, bright: 0.21, wet: 0.29 });
      pluck(midi(tr(c)), { t: 0.66, gain: 0.068, dur: 2.5, bright: 0.19, wet: 0.32 });
      glow(midi(fit(harmony().root, 40)), { t: 0.5, a: 0.5, hold: 0.2, d: 2.2, gain: 0.032, lp: 700, wet: 0.32 });
    },

    /* A catch blooms out of the fight. The reel's drone and the water's own pad swell and open; a harp
       runs up the water's scale, quickening a little as it climbs, and lands on a note of the pad's
       chord; then that chord rings out, rolled on the harp over a soft glow. Rarer fish add a chime,
       then a cascade of chimes and a low root, and the rarest a deep bell and a rumble of water. */
    landed(rarity) {
      splashFx(1.3);
      const tier = RARITIES[rarity].tier, H = harmony(), n = 4 + tier * 2;
      bloomPad(tier, 1.2 + tier * 0.5);
      const sc = H.scale(48, 108), from = sc.findIndex(x => x >= tr(64));
      // straight up, up in turns (one back for every two forward), or skipping every third step
      const walk = [i => i, i => Math.floor(i / 2) + (i % 2) * 2, i => i + Math.floor(i / 3)][pickV('landed', 3)];
      const run = [];
      for (let i = 0; i < n; i++) run.push(sc[Math.min(sc.length - 1, from + walk(i))]);
      // the last note settles on the chord
      let last = run[n - 1], j = sc.indexOf(last);
      while (!H.tone(last) && j < sc.length - 1 && sc[j] - run[n - 1] < 7) last = sc[++j];
      if (H.tone(last)) run[n - 1] = last;
      let t = 0.14;
      run.forEach((note, i) => {
        const k = n > 1 ? i / (n - 1) : 1;
        pluck(midi(note), { t, gain: 0.058 + 0.026 * k, dur: 1.5 + k * 0.6, bright: 0.24 + 0.04 * k, pan: (k - 0.5) * 0.7, wet: 0.24 + 0.06 * k });
        t += 0.096 - 0.026 * k;
      });
      const at = t + 0.03, len = 2.6 + tier * 0.55;
      // the chord, rolled upward on the harp
      H.voicing(55, 5).forEach((note, i) => pluck(midi(note), { t: at + i * 0.028, gain: 0.044 - i * 0.003, dur: len, bright: 0.2, pan: (i / 4 - 0.5) * 0.5, wet: 0.3 }));
      // and glowing underneath, swelling in and settling away without a pulse
      H.voicing(50, 3).forEach((note, i) => glow(midi(note), { t: at - 0.12, a: 0.5, hold: 0.25 + tier * 0.2, d: len, gain: 0.013, lp: 1500, pan: (i - 1) * 0.3, wet: 0.34 }));
      if (tier >= 1) {
        const top = H.voicing(55, 9).filter(x => x >= tr(79));
        bell(midi(top[0] + (top[0] < 84 ? 12 : 0)), { t: at + 0.12, a: 0.006, gain: 0.026, dur: 2.8, partials: GLASS, wet: 0.36 });
      }
      if (tier >= 2) glow(midi(fit(H.root, 38)), { t: at - 0.1, a: 0.7, hold: 0.5, d: len + 0.6, gain: 0.019, lp: 500, wet: 0.26 });
      if (tier >= 3) {
        const hi = H.scale(tr(79), tr(100));
        for (let i = 0; i < 10; i++) bell(midi(hi[Math.min(hi.length - 1, (i * 2) % hi.length)]), { t: at + 0.25 + i * 0.1, a: 0.006, gain: 0.02 - i * 0.0008, dur: 2.4, partials: GLASS, pan: Math.sin(i * 1.7) * 0.6, wet: 0.4 });
      }
      if (tier >= 4) {
        noise({ kind: 'brown', type: 'lowpass', f: 240, f1: 60, t: at - 0.1, a: 0.3, d: 3.2, gain: 0.13, wet: 0.35 });
        bell(midi(fit(H.root, 40)), { t: at, a: 0.012, gain: 0.05, dur: 5.5, wet: 0.4 });
        const hi = H.scale(tr(84), tr(103));
        for (let i = 0; i < 8; i++) bell(midi(hi[(i * 3) % hi.length]), { t: at + 1.4 + i * 0.13, a: 0.006, gain: 0.016, dur: 2.6, partials: GLASS, pan: Math.cos(i) * 0.7, wet: 0.45 });
      }
    },

    levelUp() {
      [[0, 4, 7, 12, 16], [0, 7, 12, 16, 19], [-5, 0, 4, 7, 12], [0, 4, 9, 12, 16]][pickV('levelUp', 4)].forEach((n, i) => bell(midi(tr(72 + n)), { t: i * 0.09, a: 0.005, gain: 0.025, dur: 2.2, pan: (i - 2) * 0.2, wet: 0.32 }));
      pluck(midi(tr(60)), { gain: 0.046, dur: 2.2, bright: 0.24, wet: 0.24 });
      glow(midi(tr(48)), { a: 0.4, hold: 0.3, d: 2, gain: 0.02, lp: 900, wet: 0.3 });
    },

    unlock() {
      const s = [[0, 2, 4, 7, 9, 12, 14, 16, 19], [0, 4, 7, 9, 12, 16, 19, 21, 24], [-3, 0, 2, 4, 7, 9, 12, 14, 16]][pickV('unlock', 3)];
      s.forEach((n, i) => pluck(midi(tr(72 + n)), { t: i * 0.064, gain: 0.034 + i * 0.0015, dur: 1.9, bright: 0.26, pan: i / 8 - 0.5, wet: 0.3 }));
      bell(midi(tr(91)), { t: 0.6, a: 0.006, gain: 0.026, dur: 2.8, partials: GLASS, wet: 0.36 });
      glow(midi(tr(48)), { a: 0.5, hold: 0.5, d: 2.2, gain: 0.026, lp: 900, wet: 0.3 });
    },

    /* A badge pressed into the scrapbook: a soft paper thwip, then a glassy chime that climbs higher and
       lasts longer the grander the badge (1 bronze … 5 moon), with a warm swell under the two finest. */
    badge(grade = 1) {
      const g = clamp(grade | 0, 1, 5);
      noise({ type: 'bandpass', f: 2600, f1: 900, fTime: 0.12, q: 0.9, a: 0.004, d: 0.12, gain: 0.03, wet: 0.1 });
      const sets = [[0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 11, 14], [0, 5, 9, 12, 16, 19], [0, 4, 7, 12, 16, 19, 24]];
      const notes = sets[g - 1], root = tr([72, 79, 77][pickV('badge', 3)]);
      notes.forEach((n, i) => bell(midi(root + n), { t: 0.08 + i * 0.08, a: 0.005, gain: 0.027, dur: 1.7 + g * 0.3, partials: GLASS, pan: (i / (notes.length - 1) - 0.5) * 0.6, wet: 0.36 }));
      if (g >= 4) glow(midi(root - 24), { t: 0.05, a: 0.45, hold: 0.4, d: 2, gain: 0.022, lp: 1000, wet: 0.4 });
    },
    /* the fishing meter sweeping up into place at a bite, and the bite mark landing in its ring */
    meterIn() {
      noise({ type: 'bandpass', f: 520, f1: 2300, fTime: 0.28, q: 0.9, a: 0.05, d: 0.26, gain: 0.022, wet: 0.18 });
      noise({ t: 0.05, type: 'highpass', f: 3800, q: 0.6, a: 0.04, d: 0.18, gain: 0.006, wet: 0.2 });
    },
    meterSet() {
      const [a, b] = [[86, 93], [84, 91], [88, 93]][pickV('meterSet', 3)];
      bell(midi(tr(a)), { a: 0.005, gain: 0.018, dur: 1.2, partials: GLASS, wet: 0.32, beat: false });
      bell(midi(tr(b)), { t: 0.07, a: 0.005, gain: 0.013, dur: 1.4, partials: GLASS, wet: 0.36, beat: false });
      pluck(midi(tr(a - 24)), { t: 0.01, gain: 0.019, dur: 0.6, bright: 0.24, wet: 0.22 });
    },
    /* A waiting notification nudging its button: a quiet word from that corner of the screen, in the
       water's key. The aquarium bubbles and chimes, the scrapbook rustles and chimes, the map plucks two
       notes rising. */
    nudge(kind) {
      const pan = kind === 'place' ? -0.55 : 0.5;
      if (kind === 'tank') for (let i = 0; i < 3; i++) bubble(rand(600, 1100), { t: i * 0.07, dur: 0.05, gain: 0.014, pan, wet: 0.3 });
      if (kind === 'book') noise({ type: 'bandpass', f: 1800, f1: 3200, fTime: 0.15, q: 0.7, a: 0.02, d: 0.14, gain: 0.012, pan, wet: 0.15 });
      if (kind === 'place') {
        const [a, b] = [[74, 79], [72, 76], [76, 81]][pickV('nudgePlace', 3)];
        pluck(midi(tr(a)), { gain: 0.03, dur: 1.1, bright: 0.24, pan, wet: 0.28 });
        pluck(midi(tr(b)), { t: 0.13, gain: 0.026, dur: 1.4, bright: 0.24, pan, wet: 0.3 });
        return;
      }
      const [a, b] = [[88, 91], [86, 91], [84, 88]][pickV('nudge', 3)];
      bell(midi(tr(a)), { t: 0.06, a: 0.005, gain: 0.012, dur: 1.2, partials: GLASS, pan, wet: 0.34, beat: false });
      bell(midi(tr(b)), { t: 0.16, a: 0.005, gain: 0.009, dur: 1.4, partials: GLASS, pan, wet: 0.38, beat: false });
    },
    /* turning a page of the scrapbook */
    page() { noise({ type: 'bandpass', f: 1700, f1: 3400, fTime: 0.2, q: 0.7, a: 0.03, d: 0.17, gain: 0.02, wet: 0.12 }); },

    coin(n = 1) {
      const sets = [[84, 88, 91, 96], [84, 86, 91, 93], [81, 84, 88, 93], [86, 91, 93, 98], [79, 84, 88, 91]];
      const notes = sets[pickV('coin', sets.length)], k = Math.min(4, 1 + Math.floor(Math.log2(n + 1))), gap = rand(0.06, 0.08);
      for (let i = 0; i < k + 1; i++) bell(midi(tr(notes[i % 4] + (i >= 4 ? 12 : 0))), { t: i * gap, gain: 0.038, dur: 1.3, partials: GLASS, pan: (i - k / 2) * 0.2, wet: 0.22 });
    },

    buy() {
      // a bright strum and a chime, in one of several shapes of the same chord (now and then strummed down)
      const V = [[[0, 4, 7, 12], 96], [[0, 2, 7, 9], 93], [[4, 7, 12, 16], 91], [[-5, 0, 4, 7], 96], [[0, 7, 12, 14], 100], [[2, 7, 9, 14], 93]];
      const [notes, chime] = V[pickV('buy', V.length)], gap = rand(0.05, 0.068), down = Math.random() < 0.25;
      (down ? notes.slice().reverse() : notes).forEach((n, i) => pluck(midi(tr(72 + n)), { t: i * gap, gain: 0.075, dur: 1.2, bright: rand(0.28, 0.36), pan: (i - 1.5) * 0.08, wet: 0.2 }));
      bell(midi(tr(chime)), { t: gap * 4 + 0.02, gain: 0.028, dur: 1.8, partials: GLASS, wet: 0.28 });
    },

    equip() {
      const [a, b] = [[76, 83], [74, 81], [77, 84], [79, 86], [72, 79]][pickV('equip', 5)];
      wood(midi(tr(a)), { gain: 0.045, dur: rand(0.17, 0.23) });
      pluck(midi(tr(b)), { t: rand(0.04, 0.06), gain: 0.046, dur: 0.9, wet: 0.18 });
    },

    deny() {
      const [a, b] = [[57, 53], [55, 52], [57, 52], [59, 55]][pickV('deny', 4)];
      wood(midi(a), { gain: 0.042, dur: 0.3 });
      wood(midi(b), { t: rand(0.11, 0.14), gain: 0.038, dur: 0.4 });
    },

    release() {
      S.plop(1.1);
      const [a, b] = [[74, 79], [72, 79], [76, 81], [74, 81]][pickV('release', 4)];
      pluck(midi(tr(a)), { t: 0.12, gain: 0.058, dur: 1.3, bright: 0.26, wet: 0.24 });
      pluck(midi(tr(b)), { t: 0.22, gain: 0.05, dur: 1.7, bright: 0.25, wet: 0.27 });
    },

    /* ---- the aquarium ---- */
    tankOpen() {
      for (let i = 0; i < 5; i++) bubble(rand(500, 1100), { t: i * 0.06 + rand(0, 0.03), dur: rand(0.04, 0.08), gain: 0.028, pan: rand(-0.5, 0.5), wet: 0.35 });
      const [a, b] = [[74, 81], [72, 79], [76, 83], [74, 79]][pickV('tankOpen', 4)];
      pluck(midi(a), { t: 0.05, gain: 0.04, dur: 1.4, wet: 0.3 });
      pluck(midi(b), { t: 0.14, gain: 0.032, dur: 1.6, wet: 0.32 });
    },
    tankAmb(id) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bubble(rand(id === 'palace' ? 700 : 420, 1400), { t: i * rand(0.05, 0.16), dur: rand(0.03, 0.07), gain: rand(0.007, 0.014), pan: rand(-0.7, 0.7), wet: 0.4, lp: 3500 });
      if (id === 'palace' && Math.random() < 0.35) bell(midi([84, 86, 88, 91, 93][Math.floor(Math.random() * 5)]), { gain: 0.008, dur: 3, partials: GLASS, pan: rand(-0.6, 0.6), wet: 0.7, beat: false });
    },
    glass() {
      wood(midi(86), { gain: 0.03, dur: 0.07, wet: 0.1 });
      bell(1760 + rand(-80, 80), { gain: 0.01, dur: 0.3, partials: GLASS, wet: 0.15, beat: false });
    },
    select() { pluck(midi([79, 81, 76, 83, 84][pickV('select', 5)]), { gain: 0.035, dur: 0.9, wet: 0.25 }); bubble(rand(700, 900), { t: 0.03, dur: 0.05, gain: 0.02 }); },
    pebbles() { for (let i = 0; i < 7; i++) wood(midi(90 + Math.random() * 10), { t: i * rand(0.02, 0.05), gain: 0.018, dur: 0.05, pan: rand(-0.3, 0.3) }); },
    rustle() { noise({ type: 'bandpass', f: 1500, f1: 900, q: 0.8, a: 0.03, d: 0.25, gain: 0.025, wet: 0.2 }); bubble(rand(500, 700), { t: 0.1, dur: 0.05, gain: 0.015 }); },
    snail() { osc(700, { type: 'triangle', glide: 420, a: 0.01, d: 0.16, gain: 0.018, wet: 0.2 }); },
    bubbles(k = 1) { for (let i = 0; i < Math.round(12 * k); i++) bubble(rand(350, 1250), { t: rand(0, 0.55 * k), dur: rand(0.03, 0.08), gain: rand(0.01, 0.022), pan: rand(-0.4, 0.4), wet: 0.35 }); },
    burble(k = 1) { for (let i = 0; i < Math.round(7 * k); i++) bubble(rand(170, 420), { t: i * rand(0.04, 0.09), dur: rand(0.06, 0.12), gain: 0.02 * Math.min(1.2, k), pan: rand(-0.3, 0.3), wet: 0.4 }); },
    knock() { const [a, b] = [[55, 50], [53, 48], [57, 52], [55, 48]][pickV('knock', 4)]; wood(midi(a), { gain: 0.06, dur: 0.3 }); wood(midi(b), { t: 0.09, gain: 0.045, dur: 0.35 }); },
    plip() { bubble(rand(900, 1300), { dur: 0.05, gain: 0.028, wet: 0.3 }); },
    frog() { croak({ gain: 0.7, pan: rand(-0.2, 0.2) }); },
    flutter() { for (let i = 0; i < 9; i++) noise({ t: i * 0.024, type: 'bandpass', f: 1900, q: 1.4, a: 0.002, d: 0.014, gain: 0.014, wet: 0.1 }); },
    moss() { noise({ type: 'lowpass', f: 420, q: 0.6, a: 0.01, d: 0.14, gain: 0.05, wet: 0.15 }); bubble(rand(260, 340), { t: 0.04, dur: 0.08, gain: 0.018 }); },
    star() { bell(midi([96, 98, 93, 100][pickV('star', 4)]), { gain: 0.012, dur: 0.9, partials: GLASS, wet: 0.3, beat: false }); },
    clam() { wood(midi(62), { gain: 0.07, dur: 0.12 }); noise({ type: 'bandpass', f: 1200, q: 1, a: 0.002, d: 0.06, gain: 0.03 }); S.burble(0.6); },
    clamPearl() { [[88, 93, 100], [86, 91, 98], [88, 91, 96]][pickV('clamPearl', 3)].forEach((n, i) => bell(midi(n), { t: i * 0.09, gain: 0.03, dur: 1.6, partials: GLASS, wet: 0.35 })); },
    chest() {
      osc(190, { type: 'triangle', glide: 130, a: 0.05, hold: 0.3, d: 0.25, gain: 0.02, lp: 900, wet: 0.25 });
      noise({ type: 'bandpass', f: 900, f1: 420, fTime: 0.4, q: 3, a: 0.05, d: 0.35, gain: 0.02, wet: 0.2 });
      wood(midi(46), { t: 0.42, gain: 0.06, dur: 0.4 });
      S.bubbles(1.1);
    },
    anemone() { noise({ type: 'bandpass', f: 700, f1: 280, fTime: 0.3, q: 0.7, a: 0.02, d: 0.3, gain: 0.03, wet: 0.25 }); bubble(rand(400, 500), { t: 0.1, dur: 0.07, gain: 0.015 }); },
    lantern() { const n = [79, 81, 76, 84][pickV('lantern', 4)]; bell(midi(n), { gain: 0.022, dur: 2.6, partials: GLASS, wet: 0.45 }); osc(midi(n - 12), { a: 0.25, d: 1.6, gain: 0.014, type: 'warm', lp: 1400, dest: music, wet: 0.4 }); },
    shipbell() { const k = Math.random() < 0.35 ? 3 : 2, gap = rand(0.55, 0.7); for (let i = 0; i < k; i++) bell(midi(64), { t: i * gap, gain: 0.055 * (1 - i * 0.2), dur: 4.2, wet: 0.5 }); },
    clank() { bell(midi(70), { gain: 0.03, dur: 0.6, partials: TUBE, wet: 0.2 }); wood(midi(58), { t: 0.05, gain: 0.03, dur: 0.15 }); },
    ring() { noise({ type: 'bandpass', f: 320, f1: 900, fTime: 0.5, q: 1.2, a: 0.08, d: 0.4, gain: 0.03, wet: 0.35 }); for (let i = 0; i < 4; i++) bubble(300 + i * 140, { t: 0.15 + i * 0.07, dur: 0.07, gain: 0.014 }); },
    ringpass() { [[91, 95, 98], [93, 96, 100], [91, 93, 98]][pickV('ringpass', 3)].forEach((n, i) => bell(midi(n), { t: i * 0.05, gain: 0.014, dur: 1, partials: GLASS, wet: 0.4, beat: false })); },
    geode(note = 72) { bell(midi(note), { gain: 0.05, dur: 3.2, partials: GLASS, wet: 0.5 }); bell(midi(note + 12), { t: 0.01, gain: 0.012, dur: 2, partials: GLASS, wet: 0.5, beat: false }); },
    gate() { [72, 76, 79, 84, 88].forEach((n, i) => bell(midi(n), { t: i * 0.09, gain: 0.024, dur: 3, partials: GLASS, pan: (i - 2) * 0.2, wet: 0.55 })); noise({ type: 'bandpass', f: 4200, f1: 2200, q: 1.2, a: 0.3, d: 0.8, gain: 0.012, wet: 0.5 }); },
    sandglow() { const [a, b] = [[96, 100], [98, 103], [93, 98]][pickV('sandglow', 3)]; bell(midi(a), { gain: 0.01, dur: 1.2, partials: GLASS, wet: 0.5, beat: false }); bell(midi(b), { t: 0.08, gain: 0.008, dur: 1.2, partials: GLASS, wet: 0.5, beat: false }); },
    blessing() {
      [72, 74, 76, 79, 81, 84, 86, 88, 91, 93].forEach((n, i) => bell(midi(n), { t: i * 0.08, gain: 0.022, dur: 2.6, partials: GLASS, pan: (i / 9 - 0.5) * 1.2, wet: 0.6 }));
      [60, 67, 72, 76].forEach(n => osc(midi(n), { t: 0.6, a: 0.6, hold: 0.8, d: 2.4, gain: 0.012, type: 'warm', lp: 1800, dest: music, wet: 0.55 }));
    },
    kiss() { const [a, b] = [[84, 88], [83, 86], [86, 91], [81, 86]][pickV('kiss', 4)]; pluck(midi(a), { gain: 0.03, dur: 0.8, wet: 0.3 }); pluck(midi(b), { t: 0.08, gain: 0.026, dur: 0.9, wet: 0.3 }); bubble(rand(800, 1000), { t: 0.02, dur: 0.04, gain: 0.014 }); },
    flare() { noise({ type: 'bandpass', f: 1500, q: 4, a: 0.01, hold: 0.06, d: 0.18, gain: 0.022, wet: 0.15 }); },
    puff() { osc(260, { type: 'triangle', glide: 540, a: 0.02, hold: 0.18, d: 0.2, gain: 0.026, wet: 0.2 }); bubble(rand(300, 380), { t: 0.05, dur: 0.1, gain: 0.018 }); },
    boop() { bubble(rand(600, 820), { dur: 0.07, gain: 0.03 }); pluck(midi([86, 88, 84, 91][pickV('boop', 4)]), { gain: 0.012, dur: 0.6, wet: 0.3 }); },
    gulp(tier = 0) { bubble(rand(240, 380) * (1 - tier * 0.05), { dur: rand(0.05, 0.09), gain: 0.024, wet: 0.25 }); },
    mates() { const v = pickV('mates', 3); [[76, 81, 84, 88], [74, 79, 83, 86], [72, 76, 79, 84]][v].forEach((n, i) => pluck(midi(n), { t: i * 0.11, gain: 0.04, dur: 1.6, wet: 0.35 })); bell(midi([93, 91, 96][v]), { t: 0.5, gain: 0.02, dur: 2.4, partials: GLASS, wet: 0.5 }); },
    shy() { osc(900, { type: 'triangle', glide: 480, a: 0.005, d: 0.16, gain: 0.014, wet: 0.2 }); },
    squirt() { noise({ type: 'bandpass', f: 2600, f1: 1600, q: 1.5, a: 0.004, d: 0.12, gain: 0.03, wet: 0.15 }); bubble(1100, { t: 0.3, dur: 0.04, gain: 0.02 }); },
    flakes() { for (let i = 0; i < 10; i++) noise({ t: i * rand(0.03, 0.06), kind: 'white', type: 'highpass', f: 4200, q: 0.7, a: 0.002, d: 0.02, gain: 0.02, pan: rand(-0.3, 0.3), wet: 0.1 }); for (let i = 0; i < 3; i++) S.plip(); },
    pearlDrop(tier = 1) { bell(midi(91 + tier + [0, 2, -1, 4][pickV('pearlDrop', 4)]), { gain: 0.016, dur: 1.4, partials: GLASS, wet: 0.45, beat: false }); },
    pearlLand() { bell(midi([98, 96, 100, 93][pickV('pearlLand', 4)]), { gain: 0.01, dur: 0.5, partials: GLASS, wet: 0.3, beat: false }); },
    /* run: how many pearls into a quick run of gathering this one is; each climbs a step up a pentatonic
       ladder, and later ones in a long sweep ring shorter and softer so a sweep of fifty stays a shimmer */
    pearlGet(v = 1, run = 0) {
      const notes = [[84, 88, 91, 96, 100], [84, 86, 91, 93, 98], [81, 84, 88, 93, 96], [86, 91, 93, 98, 100]][pickV('pearlGet', 4)];
      const k = run ? Math.min(3, 1 + Math.floor(Math.log10(v + 1) * 1.5)) : Math.min(5, 2 + Math.floor(Math.log10(v + 1) * 2));
      const up = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.min(run, 10)] - (run > 10 ? (run % 3) * 2 : 0), g = 0.03 / (1 + Math.max(0, run - 4) * 0.12);
      for (let i = 0; i < k; i++) bell(midi(notes[i] + up - (run ? 7 : 0)), { t: i * 0.055, gain: g, dur: run ? 0.9 : 1.4, partials: GLASS, pan: (i - k / 2) * 0.15 + rand(-0.15, 0.15) * Math.min(1, run), wet: 0.3 });
    },
    splashIn(size = 1) { splashFx(size * 0.45, { pan: rand(-0.2, 0.2) }); },
    fish(kind, tier = 0) {
      const pan = rand(-0.3, 0.3);
      switch (kind) {
        case 'dart': noise({ type: 'bandpass', f: 1100, f1: 2600, fTime: 0.15, q: 1.2, a: 0.01, d: 0.14, gain: 0.03, pan, wet: 0.15 }); break;
        case 'flash': bell(midi(100), { gain: 0.012, dur: 0.8, partials: GLASS, pan, wet: 0.3, beat: false }); break;
        case 'gulp': S.gulp(tier); break;
        case 'nuzzle': bubble(rand(520, 640), { dur: 0.06, gain: 0.025, pan }); break;
        case 'hop': wood(midi(76), { gain: 0.03, dur: 0.12, pan }); bubble(520, { t: 0.05, dur: 0.05, gain: 0.014 }); break;
        case 'glow': bell(midi(91), { gain: 0.02, dur: 2.4, partials: GLASS, pan, wet: 0.55 }); bell(midi(98), { t: 0.12, gain: 0.01, dur: 2, partials: GLASS, pan, wet: 0.55, beat: false }); break;
        case 'wiggle': for (let i = 0; i < 3; i++) bubble(600 + i * 160, { t: i * 0.06, dur: 0.05, gain: 0.018, pan }); break;
        case 'glide': noise({ type: 'bandpass', f: 500, f1: 900, q: 0.8, a: 0.2, d: 0.6, gain: 0.014, pan, wet: 0.4 }); bell(midi(84), { t: 0.1, gain: 0.012, dur: 2, partials: GLASS, pan, wet: 0.5 }); break;
        case 'flare': S.flare(); break;
        case 'bury': noise({ type: 'lowpass', f: 700, q: 0.5, a: 0.03, d: 0.35, gain: 0.04, pan, wet: 0.1 }); break;
        case 'curl': pluck(midi(79), { gain: 0.022, dur: 0.9, pan, wet: 0.3 }); pluck(midi(83), { t: 0.1, gain: 0.018, dur: 0.9, pan, wet: 0.3 }); break;
        case 'spin': [88, 91, 95].forEach((n, i) => bell(midi(n), { t: i * 0.05, gain: 0.012, dur: 0.9, partials: GLASS, pan, wet: 0.35, beat: false })); break;
        case 'puff': S.puff(); break;
        case 'bubble': S.bubbles(0.5); break;
        case 'blush': [84, 88, 91].forEach((n, i) => pluck(midi(n), { t: i * 0.08, gain: 0.024, dur: 1, pan, wet: 0.3 })); break;
        case 'penguin': noise({ type: 'bandpass', f: 700, f1: 1800, fTime: 0.3, q: 1, a: 0.03, d: 0.3, gain: 0.03, pan, wet: 0.2 }); pluck(midi(86), { t: 0.1, gain: 0.03, dur: 0.6, wet: 0.25 }); pluck(midi(91), { t: 0.18, gain: 0.03, dur: 0.6, wet: 0.25 }); break;
        case 'loop': osc(1300, { curve: Float32Array.from([1300, 1900, 1500, 2100, 1700, 2300]), curveTime: 0.45, a: 0.02, hold: 0.35, d: 0.12, gain: 0.012, pan, wet: 0.4 }); break;
        case 'ember': for (let i = 0; i < 10; i++) noise({ t: i * rand(0.02, 0.06), kind: 'white', type: 'bandpass', f: rand(1800, 3800), q: 3, a: 0.001, d: 0.012, gain: 0.02, pan: rand(-0.4, 0.4), wet: 0.2 }); bell(midi(72), { gain: 0.02, dur: 2, wet: 0.5 }); break;
        default: S.boop();
      }
    },

    /* ---- the waters' rare moments ---- */
    croak() { croak({ pan: rand(-0.4, 0.4), gain: 0.9 }); },
    gull() { gullCall({ n: 3, pan: 0.45, panTo: -0.35, wet: 0.3, gain: 0.36 }); },
    hoot() {
      // an owl in the trees: soft, breathy, round
      for (const [t, len, k0, k1] of [[0, 0.55, 1, 0.95], [0.66, 0.3, 0.97, 0.95], [1.02, 0.7, 0.97, 0.88]]) {
        osc(390 * k0, { t, a: 0.09, hold: len * 0.3, d: len * 0.8, glide: 390 * k1, glideTime: len, gain: 0.034, vib: [5, 10], lp: 900, pan: -0.35, wet: 0.55 });
        noise({ t, type: 'bandpass', f: 400, q: 6, a: 0.08, hold: len * 0.25, d: len * 0.6, gain: 0.01, pan: -0.35, wet: 0.5 });
      }
    },
    shimmer() {
      // a shooting star: a soft glassy cascade and a breath of air sweeping across
      for (let i = 0; i < 7; i++) bell(midi(98 - i * 3), { t: i * 0.06, gain: 0.012, dur: 1.4, partials: GLASS, pan: -0.7 + i * 0.22, wet: 0.6, beat: false });
      noise({ type: 'bandpass', f: 5200, f1: 1800, fTime: 0.8, q: 1.4, a: 0.2, d: 0.6, gain: 0.025, pan: -0.7, panTo: 0.7, panTime: 0.9, wet: 0.5 });
    },
    wisp() {
      for (let i = 0; i < 3; i++) bell(midi([86, 91, 93][i]), { t: i * 0.2, gain: 0.014, dur: 2.6, partials: GLASS, pan: rand(-0.5, 0.5), wet: 0.7 });
      noise({ type: 'bandpass', f: 1600, f1: 2600, q: 8, a: 0.6, d: 1.4, gain: 0.02, wet: 0.7 });
    },
    spout() {
      // a whale's blow: a breathy rush of spray, then droplets pattering back
      noise({ type: 'bandpass', f: 700, f1: 1500, fTime: 0.4, q: 0.6, a: 0.06, hold: 0.25, d: 1, gain: 0.065, wet: 0.35 });
      noise({ type: 'highpass', f: 3000, q: 0.5, a: 0.08, d: 0.8, gain: 0.012, wet: 0.3, lp2: 7000 });
      for (let i = 0; i < 16; i++) bubble(rand(1200, 2600), { t: 0.6 + Math.random() * 1.1, dur: rand(0.02, 0.04), gain: rand(0.006, 0.014), pan: rand(-0.6, 0.6), wet: 0.35 });
    },
    whale() {
      // a long, low song that rises and falls, deep in the fjord's echo
      osc(135, { a: 0.7, hold: 1.2, d: 1.6, curve: Float32Array.from([135, 150, 175, 205, 222, 226, 218, 196, 182]), curveTime: 3, gain: 0.026, vib: [4.5, 14], wet: 0.8 });
      osc(135, { a: 0.8, hold: 1, d: 1.6, curve: Float32Array.from([135, 150, 175, 205, 222, 226, 218, 196, 182]), curveTime: 3, gain: 0.012, type: 'reed', lp: 420, vib: [4.5, 14], wet: 0.8 });
      osc(250, { t: 3.2, a: 0.5, hold: 0.4, d: 1.4, glide: 170, glideTime: 1.4, gain: 0.01, type: 'warm', lp: 500, wet: 0.85 });
    },
    crane() {
      // a crane's bugling "garoo", rolling and nasal
      const o = { type: 'reed', a: 0.03, d: 0.3, gain: 0.019, lp: 2600, vib: [28, 35], pan: 0.3, wet: 0.45 };
      osc(700, { ...o, hold: 0.15, glide: 820, glideTime: 0.12 });
      osc(820, { ...o, t: 0.3, hold: 0.2, glide: 640, glideTime: 0.35 });
    },
    rumble() {
      // the dragon: a deep swell from below and a slow growl
      noise({ kind: 'brown', type: 'lowpass', f: 150, f1: 70, a: 0.9, hold: 0.8, d: 1.8, gain: 0.12, wet: 0.35 });
      osc(46, { a: 0.9, hold: 0.8, d: 1.6, gain: 0.04, type: 'reed', lp: 180, vib: [9, 30], wet: 0.25 });
    },
    whistle() {
      // dolphins chattering past the reef: quick whistles and a ripple of clicks
      for (let i = 0; i < 3; i++) {
        const f = rand(2400, 3400), t = i * rand(0.25, 0.4);
        osc(f, { t, a: 0.02, d: 0.25, curve: Float32Array.from([f, f * 1.25, f * 1.4, f * 1.15, f * 0.95]), curveTime: 0.3, gain: 0.018, pan: 0.3 - i * 0.25, lp: 5000, wet: 0.4 });
      }
      for (let i = 0; i < 12; i++) noise({ t: 0.9 + i * 0.025, type: 'bandpass', f: 3000, q: 2, a: 0.001, d: 0.006, gain: 0.012, pan: -0.3, wet: 0.3 });
    },
    buzz(dur = 4) {
      // a dragonfly's wings: a soft papery hum that drifts across
      osc(150, { a: 0.4, hold: Math.max(0.2, dur - 1.4), d: 0.8, type: 'reed', gain: 0.012, lp: 900, vib: [32, 40], pan: -0.6, panTo: 0.6, panTime: dur, wet: 0.2 });
    },

    travel() {
      // setting off: a rising breath of air and a gentle upward glissando
      noise({ type: 'bandpass', f: 300, f1: 1500, fTime: 1, q: 0.7, a: 0.5, d: 0.9, gain: 0.07, pan: -0.5, panTo: 0.5, panTime: 1.4, wet: 0.5 });
      [[62, 64, 67, 69, 71, 74, 76, 79], [60, 62, 64, 67, 69, 72, 74, 76], [64, 67, 69, 71, 74, 76, 79, 81]][pickV('travel', 3)].forEach((n, i) => pluck(midi(n), { t: 0.15 + i * 0.07, gain: 0.04, dur: 1.6, bright: 0.25, pan: -0.5 + i * 0.14, wet: 0.5 }));
    },
  };

  /* ================= Reel fight ================= */
  const REEL_SCALE = [0, 2, 4, 7, 9];
  const CLICK = 0.05;
  let clickBufs = null;

  /* A few ratchet clicks, made once: a brief strike that rings the small metal modes of a pawl and
     gear and dies within a few milliseconds. Slightly different each, so the run never sounds looped. */
  function makeClicks() {
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.035), out = [];
    for (let v = 0; v < 5; v++) {
      const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      const modes = [[3300, 0.006, 1], [4700, 0.0035, 0.5], [2150, 0.009, 0.75], [1250, 0.012, 0.45]].map(([f, tau, a]) => [f * rand(0.94, 1.06), tau, a * rand(0.8, 1.2)]);
      const strike = sr * 0.0006, fade = sr * 0.0002;
      let peak = 1e-6;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let x = 0;
        for (const [f, tau, a] of modes) x += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau);
        if (i < strike) x += (Math.random() * 2 - 1) * 0.8 * (1 - i / strike);
        x *= Math.min(1, i / fade);
        d[i] = x;
        if (Math.abs(x) > peak) peak = Math.abs(x);
      }
      for (let i = 0; i < n; i++) d[i] /= peak;
      out.push(b);
    }
    return out;
  }
  function clickAt(r, at, level) {
    const src = ctx.createBufferSource();
    src.buffer = pick(clickBufs);
    src.playbackRate.value = rand(0.96, 1.04);
    const g = gainNode(level * CLICK * rand(0.85, 1));
    src.connect(g); g.connect(r.clickBus);
    src.start(at);
  }

  function startReel(rod) {
    if (!ctx) return;
    stopReel();
    const t0 = ctx.currentTime;
    const layer = (buf, type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = filter(type, f, q), g = gainNode(0);
      src.connect(fl); fl.connect(g); src.start(t0, Math.random() * 3);
      return { src, fl, g };
    };
    // water churned up by the fish, panned to where it pulls
    const churn = layer(pinkBuf, 'lowpass', 600, 0.5), churnP = panNode(0);
    churn.g.connect(churnP); churnP.connect(sfx);
    const cs = gainNode(0.15); churnP.connect(cs); cs.connect(verbIn);
    // the line humming under tension
    const strain = layer(pinkBuf, 'bandpass', 480, 3.5), sLP = filter('lowpass', 1900, 0.5);
    strain.g.connect(sLP); sLP.connect(sfx);
    // the spool whirring while you wind
    const whir = layer(pinkBuf, 'bandpass', 1400, 1.2), wLP = filter('lowpass', 3000, 0.5);
    whir.g.connect(wLP); wLP.connect(sfx);
    // the reel's ratchet: real clicks (a metal pawl striking the gear), scheduled just ahead on the
    // audio clock at the rate the spool turns, so they run evenly whatever the frame rate
    if (!clickBufs) clickBufs = makeClicks();
    const clickHP = filter('highpass', 700, 0.7), clickBus = gainNode(1), rP = panNode(0.22);
    clickBus.connect(clickHP); clickHP.connect(rP); rP.connect(sfx);
    const rs = gainNode(0.05); rP.connect(rs); rs.connect(verbIn);
    // a soft drone on the root and fifth of the water's chord that warms as the ring fills
    const droot = fit(harmony().root, 53);
    const o1 = ctx.createOscillator(); o1.frequency.value = midi(droot);
    const o2 = ctx.createOscillator(); o2.setPeriodicWave(warmWave); o2.frequency.value = midi(droot + 7);
    const lp = filter('lowpass', 320, 0.4), dg = gainNode(0);
    o1.connect(dg); o2.connect(lp); lp.connect(dg); dg.connect(sfx);
    const ds = gainNode(0.4); dg.connect(ds); ds.connect(verbIn);
    o1.start(t0); o2.start(t0);
    // the rod's own voice, if it has one, replaces the ratchet: its own bus, no high-pass, so low voices
    // (a purr, a muted guitar string) come through
    const vbus = gainNode(1), vP = panNode(0.22), vs = gainNode(0.1);
    vbus.connect(vP); vP.connect(sfx); vP.connect(vs); vs.connect(verbIn);
    reel = { churn, churnP, strain, whir, clickBus, o1, o2, lp, dg, step: -1, beatT: 0, rate: 0, nextClick: 0,
      voice: GV.rods[rod] || null, vbus, vsrc: [], v: {}, n: 0 };
    if (reel.voice && reel.voice.start) reel.voice.start(reel, t0);
  }

  function updateReel(dt, s) {
    // s: { inBand, progress, holding, danger, speed, fishPos, tire (0-1: how tired the line is) }
    if (!reel || !ctx) return;
    const now = ctx.currentTime, r = reel, T = (p, v, tc) => p.setTargetAtTime(v, now, tc), sp = Math.min(1, s.speed || 0), tire = Math.min(1, s.tire || 0);
    T(r.churn.g.gain, 0.012 + sp * 0.055, 0.12);
    T(r.churn.fl.frequency, 450 + sp * 900, 0.15);
    if (r.churnP.pan) T(r.churnP.pan, ((s.fishPos ?? 0.5) - 0.5) * 0.9, 0.1);
    T(r.strain.g.gain, s.inBand ? 0.0001 + tire * 0.008 : 0.03 + s.danger * 0.05 + tire * 0.03, 0.12);
    T(r.strain.fl.frequency, 420 + s.danger * 360 + sp * 180 + tire * 140, 0.15);
    // a tiring line creaks now and then, more often as it tires
    r.creakT = (r.creakT ?? 0) - dt;
    if (tire > 0.04 && r.creakT <= 0) {
      noise({ type: 'bandpass', f: 1100 + rand(-150, 150), f1: 640, fTime: 0.22, q: 9, a: 0.01, hold: 0.08, d: 0.18, gain: 0.012 + tire * 0.02, pan: ((s.fishPos ?? 0.5) - 0.5) * 0.6, wet: 0.15 });
      wood(midi(rand(46, 50)), { t: 0.02, gain: 0.012 + tire * 0.015, dur: 0.16 });
      r.creakT = rand(1.6, 2.8) / (0.6 + tire);
    }
    T(r.whir.g.gain, s.holding ? 0.016 : 0.0001, 0.06);
    // it leans in as the ring fills and eases back (never drops out) while the fish is out of the band
    T(r.dg.gain, s.inBand ? 0.012 + s.progress * 0.018 : 0.008, s.inBand ? 0.35 : 0.7);
    T(r.lp.frequency, 300 + s.progress * 1300, 0.25);

    // the ratchet: spins up quickly while you wind and coasts down when you let go; when the fish
    // runs hard against a slack reel, the drag clicks faster and softer
    const drag = !s.holding && !s.inBand && sp > 0.55;
    const target = s.holding ? 26 : drag ? 36 : 0;
    r.rate += (target - r.rate) * (1 - Math.exp(-dt / (target > r.rate ? 0.06 : 0.22)));
    const V = r.voice;
    if (r.rate > 3.5) {
      const level = s.holding ? 1 : drag ? 0.45 : Math.min(1, r.rate / 26) * 0.85, jit = V && V.jitter || 0.05;
      if (r.nextClick < now) r.nextClick = now + 0.004;
      while (r.nextClick < now + 0.09) {
        if (V) { if (V.tick) V.tick(r, r.nextClick, level, r.n++, s); } else clickAt(r, r.nextClick, level);
        r.nextClick += (1 / r.rate) * rand(1 - jit, 1 + jit);
      }
    } else r.nextClick = 0;
    if (V && V.update) V.update(r, s, dt, now);
    // a harp climbs the water's scale as the ring fills, a little fuller as it nears the top
    const step = Math.floor(s.progress / 0.07);
    if (s.inBand && step > r.step) {
      const n = Math.max(0, step) + 1, note = tr(60) + REEL_SCALE[n % 5] + 12 * Math.floor(n / 5);
      pluck(midi(Math.min(note, 98)), { gain: 0.056 + 0.016 * Math.min(1, s.progress), dur: 1.5, bright: 0.28, pan: ((s.fishPos ?? 0.5) - 0.5) * 0.8, wet: 0.22 });
      r.step = step;
    } else if (step < r.step - 1) r.step = step + 1;
    // droplets flicked up when the fish thrashes
    if (sp > 0.5 && Math.random() < dt * 4 * sp) bubble(rand(1000, 2300), { dur: rand(0.02, 0.04), gain: 0.014, pan: ((s.fishPos ?? 0.5) - 0.5) * 0.9, wet: 0.25 });
    // a soft heartbeat when the fish is about to slip away
    r.beatT -= dt;
    if (s.danger > 0.55 && !s.inBand && r.beatT <= 0) {
      osc(58, { a: 0.012, d: 0.2, gain: 0.13, lp: 220, wet: 0.05 });
      osc(52, { t: 0.2, a: 0.012, d: 0.22, gain: 0.1, lp: 220, wet: 0.05 });
      r.beatT = 0.85;
    }
  }

  /* how: 'land' lets the drone brighten and linger a moment, handing over to the catch's music; 'lost'
     lets it sigh down a step as the line goes slack. */
  function stopReel(how) {
    if (!reel || !ctx) { reel = null; return; }
    const now = ctx.currentTime, r = reel;
    reel = null;
    for (const g of [r.churn.g, r.strain.g, r.whir.g, r.clickBus, r.vbus]) g.gain.setTargetAtTime(0, now, 0.12);
    const dg = r.dg.gain;
    let tail = 0.9;
    dg.cancelScheduledValues(now); dg.setValueAtTime(dg.value, now);
    if (how === 'land') {
      dg.setTargetAtTime(0, now + 0.3, 0.6);
      r.lp.frequency.cancelScheduledValues(now); r.lp.frequency.setValueAtTime(r.lp.frequency.value, now);
      r.lp.frequency.setTargetAtTime(1300, now, 0.35);
      tail = 5;
    } else if (how === 'lost') {
      for (const o of [r.o1, r.o2]) o.frequency.setTargetAtTime(o.frequency.value * 0.891, now, 0.35);
      dg.setTargetAtTime(0, now + 0.1, 0.4);
      tail = 3;
    } else dg.setTargetAtTime(0, now, 0.12);
    if (ambient && !ambient.dead) ambient.chordAt = Math.max(ambient.chordAt, now + 6);
    setTimeout(() => { for (const x of [r.churn.src, r.strain.src, r.whir.src, r.o1, r.o2, ...r.vsrc]) { try { x.stop(); } catch (e) {} } }, tail * 1000);
  }

  /* ================= Ambience ================= */
  /* Each water: a slowly changing chord, a water bed with laps, wind, and its own creatures and moments.
     key: how far the water's music sits from C (its chords use the notes of that key's pentatonic scale).
     events: name → [min, max] seconds between occurrences. */
  const LAKES = {
    mistwillow: {
      key: 0,
      chords: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64]], pad: 0.012,
      water: { level: 0.05, cut: 520, laps: [0.5, 1.6], lap: 0.03 },
      wind: { level: 0.01, f: 700, q: 0.6 },
      events: { birds: [2.5, 6.5], dove: [12, 22], plink: [6, 14], rustle: [8, 16] },
    },
    lanternfen: {
      key: 0,
      chords: [[45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]], pad: 0.011,
      water: { level: 0.045, cut: 420, laps: [0.8, 2.2], lap: 0.022 },
      wind: { level: 0.005, f: 500, q: 0.7 },
      crickets: 3,
      events: { frog: [4, 10], bubbles: [6, 13], plink: [8, 16] },
    },
    coralspire: {
      key: 0,
      chords: [[53, 60, 64, 69], [50, 57, 62, 69], [48, 55, 64, 67]], pad: 0.0095,
      water: { level: 0.05, cut: 900, laps: [0.4, 1.2], lap: 0.032 },
      wind: { level: 0.014, f: 900, q: 0.5 },
      events: { surf: [5, 9], gull: [11, 22], rustle: [7, 13], plink: [9, 18] },
    },
    frostveil: {
      key: 2,
      chords: [[50, 57, 62, 64, 69], [47, 54, 62, 66, 69], [45, 52, 57, 64, 69]], pad: 0.011,
      water: { level: 0.03, cut: 380, laps: [1.2, 3], lap: 0.018 },
      wind: { level: 0.03, f: 520, q: 4, howl: true },
      events: { icechime: [3.5, 8], icecreak: [12, 24], icesing: [18, 34], aurora: [16, 30] },
    },
    dragonmere: {
      key: -2,
      chords: [[43, 50, 55, 58, 65], [39, 46, 55, 58, 63], [41, 48, 53, 60, 65]], pad: 0.012,
      water: { level: 0.04, cut: 450, laps: [0.9, 2.4], lap: 0.022 },
      wind: { level: 0.009, f: 600, q: 1.2 },
      events: { windchime: [3.5, 8], gong: [18, 32], crackle: [6, 12], plink: [10, 18] },
    },
  };

  /* Ambient events: (h, t) where t is seconds from now. */
  const EV = {
    birds(h, t) { birdPhrase({ t, far: Math.random() < 0.45, pan: rand(-0.85, 0.85), dest: h.in, verb: h.verb }); },
    dove(h, t) {
      // a dove cooing across the pond: "hoo-OO-hoo, hoo, hoo"
      const f = rand(430, 510), o = { dest: h.in, verb: h.verb, wet: 0.5, lp: 1300, pan: rand(-0.7, 0.7) };
      for (const [dt, len, k0, k1] of [[0, 0.32, 1, 1.06], [0.42, 0.5, 1.12, 0.98], [1.05, 0.4, 1, 0.96], [1.58, 0.42, 0.98, 0.95]]) {
        osc(f * k0, { ...o, t: t + dt, a: 0.09, hold: len * 0.35, d: len * 0.7, glide: f * k1, glideTime: len, gain: 0.04, vib: [5, 8] });
        noise({ ...o, t: t + dt, type: 'bandpass', f: f * 2, q: 3, a: 0.08, hold: len * 0.3, d: len * 0.6, gain: 0.008 });
      }
    },
    plink(h, t) {
      // a fish rising somewhere on the water
      const o = { dest: h.in, verb: h.verb, pan: rand(-0.8, 0.8), wet: 0.35, lp: 4000 };
      bubble(rand(600, 1000), { ...o, t, dur: rand(0.04, 0.07), gain: 0.03 });
      bubble(rand(1300, 2000), { ...o, t: t + rand(0.05, 0.12), dur: 0.03, gain: 0.012 });
      noise({ ...o, t, type: 'lowpass', f: 900, f1: 300, a: 0.005, d: 0.25, gain: 0.014 });
    },
    rustle(h, t) {
      // leaves stirring in a breath of wind
      const dur = rand(1.4, 2.6), n = 48, c = new Float32Array(n), lvl = rand(0.018, 0.03);
      for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = Math.pow(Math.sin(Math.PI * x), 1.5) * (0.5 + 0.5 * Math.random()) * lvl; }
      c[0] = 0; c[n - 1] = 0;
      noise({ t, type: 'highpass', f: 2200, q: 0.5, gainCurve: c, curveTime: dur, lp2: 7500, pan: rand(-0.8, 0.8), dest: h.in, verb: h.verb, wet: 0.25 });
    },
    frog(h, t) {
      const n = Math.random() < 0.4 ? 2 + Math.floor(Math.random() * 2) : 1;
      for (let i = 0; i < n; i++) croak({ t: t + i * rand(0.6, 1.4), pan: rand(-0.85, 0.85), far: Math.random() < 0.5, deep: Math.random() < 0.3, dest: h.in, verb: h.verb });
    },
    bubbles(h, t) {
      // marsh gas rising through the mud: "blub, blub"
      const pan = rand(-0.7, 0.7), n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bubble(rand(220, 420), { t: t + i * rand(0.09, 0.2), dur: rand(0.07, 0.14), rise: rand(1.4, 1.8), gain: rand(0.03, 0.045), pan: pan + rand(-0.1, 0.1), dest: h.in, verb: h.verb, wet: 0.3, lp: 2000 });
    },
    surf(h, t) {
      // a wave gathers, breaks on the reef and washes back
      const pan = rand(-0.4, 0.4), build = rand(1.4, 2.2), wash = rand(2.4, 3.6), lvl = rand(0.08, 0.11);
      noise({ t, type: 'lowpass', fCurve: expCurve(250, 1600), fTime: build, q: 0.4, a: build, d: wash * 0.6, gain: lvl, pan, dest: h.in, verb: h.verb, wet: 0.25 });
      noise({ t: t + build * 0.85, type: 'bandpass', f: 1400, f1: 550, fTime: wash, q: 0.5, a: 0.25, d: wash, gain: lvl * 0.75, pan: -pan, dest: h.in, verb: h.verb, wet: 0.3 });
      const n = 40, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = Math.min(1, x * 8) * Math.pow(1 - x, 1.4) * (0.4 + 0.6 * Math.random()) * lvl * 0.16; }
      c[n - 1] = 0;
      noise({ t: t + build * 0.95, kind: 'white', type: 'highpass', f: 3200, q: 0.4, gainCurve: c, curveTime: wash * 0.9, lp2: 7500, pan: pan * 0.5, dest: h.in, verb: h.verb, wet: 0.2 });
    },
    gull(h, t) { gullCall({ t, pan: rand(-0.8, 0.8), gain: 0.18, wet: 0.5, lp: 3200, dest: h.in, verb: h.verb }); },
    icechime(h, t) {
      const notes = [86, 89, 91, 93, 96, 98], n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bell(midi(pick(notes)), { t: t + i * rand(0.12, 0.3), gain: 0.014, dur: 2.6, partials: GLASS, pan: rand(-0.8, 0.8), dest: h.in, verb: h.verb, wet: 0.6 });
    },
    icecreak(h, t) {
      // the ice groaning far off
      const f = rand(55, 80), dur = rand(1.2, 2);
      const o = { dest: h.in, verb: h.verb, pan: rand(-0.7, 0.7), wet: 0.6, lp: 900 };
      osc(f, { ...o, t, type: 'reed', a: 0.3, d: dur, glide: f * rand(0.75, 0.9), glideTime: dur, gain: 0.03, vib: [13, 40] });
      noise({ ...o, t, type: 'bandpass', f: 220, f1: 520, fTime: dur, q: 5, a: 0.3, d: dur, gain: 0.02 });
    },
    icesing(h, t) {
      // the singing of frozen ice: a falling "pyeww", echoing off the cliffs
      const pan = rand(-0.6, 0.6);
      for (let i = 0; i < 2; i++) osc(rand(2200, 3000), { t: t + i * 0.55, a: 0.003, d: 0.45, glide: rand(160, 240), glideTime: 0.32, gain: 0.025 * (i ? 0.5 : 1), pan, dest: h.in, verb: h.verb, wet: 0.7, lp: 5000 });
    },
    aurora(h, t) {
      const notes = pick(h.L.chords).slice(-2).map(n => n + 24);
      notes.forEach((n, i) => osc(midi(n), { t: t + i * 0.8, a: 2.2, hold: 1.6, d: 3.5, gain: 0.007, vib: [4.5, 6], pan: i ? 0.5 : -0.5, dest: h.in, verb: h.verb, wet: 0.9 }));
    },
    windchime(h, t) {
      const notes = [74, 77, 79, 81, 84, 86, 89], n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) bell(midi(pick(notes)), { t: t + i * rand(0.1, 0.3), gain: 0.016, dur: 2.8, partials: TUBE, pan: rand(-0.7, 0.7), dest: h.in, verb: h.verb, wet: 0.5 });
    },
    gong(h, t) {
      // the temple bell, struck softly across the water
      bell(midi(38), { t, gain: 0.07, dur: 7, a: 0.012, beat: false, partials: [[1, 1, 1], [1.006, 0.7, 0.95], [2.02, 0.35, 0.55], [2.97, 0.22, 0.4], [4.1, 0.1, 0.25]], dest: h.in, verb: h.verb, wet: 0.6 });
      noise({ t, kind: 'brown', type: 'lowpass', f: 300, a: 0.005, d: 0.25, gain: 0.05, dest: h.in, verb: h.verb, wet: 0.4 });
    },
    crackle(h, t) {
      // the floating lanterns' flames crackling
      const pan = rand(-0.8, 0.8), n = 5 + Math.floor(Math.random() * 10);
      for (let i = 0; i < n; i++) noise({ t: t + rand(0, 1.6), kind: 'white', type: 'bandpass', f: rand(1800, 4200), q: 1.5, a: 0.0008, d: rand(0.004, 0.012), gain: rand(0.008, 0.024), pan, dest: h.in, verb: h.verb, wet: 0.35 });
    },
  };

  function lap(h, t) {
    // a little wave slapping the bank or the jetty
    const W = h.L.water, pan = rand(-0.7, 0.7), k = rand(0.5, 1);
    noise({ t, type: 'lowpass', f: rand(350, 700) * (W.cut / 520), f1: rand(180, 300), q: 0.7, a: rand(0.08, 0.2), d: rand(0.35, 0.8), gain: W.lap * k, pan, dest: h.in, verb: h.verb, wet: 0.15 });
    if (Math.random() < 0.35) bubble(rand(500, 1100), { t: t + rand(0.05, 0.2), dur: rand(0.03, 0.07), gain: W.lap * 0.4, pan, dest: h.in, verb: h.verb, wet: 0.2, lp: 3500 });
  }

  function loopSrc(buf, t0) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t0, Math.random() * (buf.duration - 0.1));
    return s;
  }

  function beds(h, t0) {
    const L = h.L, W = L.water;
    // the water: a dark, slowly breathing bed in stereo, with a faint brighter shimmer
    h.bed = [];
    for (const [buf, type, f, lvl, pan] of [[brownBuf, 'lowpass', W.cut, W.level, -0.4], [brownBuf, 'lowpass', W.cut * 1.12, W.level, 0.4], [pinkBuf, 'bandpass', 900, W.level * 0.1, 0]]) {
      const s = loopSrc(buf, t0), fl = filter(type, f, type === 'bandpass' ? 0.6 : 0.5), g = gainNode(lvl), p = panNode(pan);
      s.connect(fl); fl.connect(g); g.connect(p); p.connect(h.in);
      h.nodes.push(s); h.bed.push({ g, lvl });
    }
    // wind
    if (L.wind) {
      const s = loopSrc(pinkBuf, t0), bp = filter('bandpass', L.wind.f, L.wind.q), g = gainNode(L.wind.level), p = panNode(0);
      s.connect(bp); bp.connect(g); g.connect(p); p.connect(h.in);
      const ws = gainNode(0.3); g.connect(ws); ws.connect(h.verb);
      h.nodes.push(s); h.wind = { bp, g, p, lvl: L.wind.level, f: L.wind.f };
      if (L.wind.howl) {
        const s2 = loopSrc(pinkBuf, t0), bp2 = filter('bandpass', L.wind.f * 1.6, 9), g2 = gainNode(L.wind.level * 0.6), p2 = panNode(0.4);
        s2.connect(bp2); bp2.connect(g2); g2.connect(p2); p2.connect(h.in);
        const ws2 = gainNode(0.5); g2.connect(ws2); ws2.connect(h.verb);
        h.nodes.push(s2); h.howl = { bp: bp2, g: g2, lvl: L.wind.level * 0.6, f: L.wind.f * 1.6 };
      }
    }
    // the pad: a quiet chord that breathes, and every so often moves to the next chord one voice at a time
    const n = Math.max(...L.chords.map(c => c.length)), chord = L.chords[0];
    const lp = filter('lowpass', 820, 0.4);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.035; const lfoG = gainNode(240);
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start(t0); h.nodes.push(lfo);
    const out = gainNode(L.pad); lp.connect(out); out.connect(h.in);
    const ps = gainNode(0.9); out.connect(ps); ps.connect(h.verb);
    h.pad = { lp, out, base: L.pad, f: 820 };
    h.voices = [];
    for (let i = 0; i < n; i++) {
      const note = chord[i] ?? chord[0] + 12, base = i === 0 ? 1 : 0.5;
      const vg = gainNode(base), cg = gainNode(1), p = panNode(n > 1 ? (i / (n - 1) - 0.5) * 0.7 : 0);
      const trem = ctx.createOscillator(); trem.frequency.value = rand(0.04, 0.09); const tg = gainNode(base * 0.55);
      trem.connect(tg); tg.connect(vg.gain); trem.start(t0); h.nodes.push(trem);
      const oscs = [];
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        if (i === 0) o.type = 'sine'; else o.setPeriodicWave(warmWave);
        o.frequency.value = midi(note); o.detune.value = det + rand(-1.5, 1.5);
        o.connect(vg); o.start(t0); oscs.push(o); h.nodes.push(o);
      }
      vg.connect(cg); cg.connect(p); p.connect(lp);
      h.voices.push({ oscs, cg, note });
    }
    // crickets: a tone gated into pulses, gated again into chirps, each one breathing in and out
    h.crickets = [];
    for (let i = 0; i < (L.crickets || 0); i++) {
      const f = rand(4100, 5000);
      const car = ctx.createOscillator(); car.frequency.value = f;
      const pulse = ctx.createOscillator(); pulse.frequency.value = rand(26, 34);
      const chirp = ctx.createOscillator(); chirp.frequency.value = rand(1.6, 2.6);
      const ps1 = ctx.createWaveShaper(); ps1.curve = pulseCurve;
      const ps2 = ctx.createWaveShaper(); ps2.curve = gateCurve;
      const a1 = gainNode(0), a2 = gainNode(0), lvl = gainNode(0), bp = filter('bandpass', f, 3), p = panNode(rand(-0.85, 0.85));
      pulse.connect(ps1); ps1.connect(a1.gain); chirp.connect(ps2); ps2.connect(a2.gain);
      car.connect(a1); a1.connect(a2); a2.connect(bp); bp.connect(lvl); lvl.connect(p); p.connect(h.in);
      const cs = gainNode(0.1); lvl.connect(cs); cs.connect(h.verb);
      for (const o of [car, pulse, chirp]) { o.start(t0); h.nodes.push(o); }
      h.crickets.push({ lvl, base: rand(0.02, 0.035), next: t0 + rand(0.5, 4) });
    }
  }

  /* Smooth equal-power fades on an AudioParam, starting from wherever it is now. */
  function fadeParam(p, to, t0, dur) {
    const from = p.value, n = 32, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      c[i] = to > from ? from + (to - from) * Math.sin((x * Math.PI) / 2) : to + (from - to) * Math.cos((x * Math.PI) / 2);
    }
    p.cancelScheduledValues(t0 - 0.001);
    p.setValueCurveAtTime(c, t0, dur);
  }

  function startAmbient(id) {
    ambientWanted = id;
    if (!ctx) return;
    if (ambient && ambient.id === id && !ambient.dead) return;
    const L = LAKES[id];
    if (!L) return;
    const first = !ambient, now = ctx.currentTime;
    if (ambient) retire(ambient);
    setSpace(id, first ? 0.05 : 3.4);
    const start = now + (first ? 0.05 : 0.4), rise = first ? 4.5 : 4;
    const h = { id, L, nodes: [], next: {}, chord: 0, chordAt: start + rand(16, 24), lapAt: start + 0.4, modAt: start + 0.5 };
    h.in = ctx.createGain();
    h.lp = filter('lowpass', 300, 0.4);
    h.lp.frequency.setValueAtTime(300, start);
    h.lp.frequency.exponentialRampToValueAtTime(16000, start + rise);
    h.out = gainNode(0);
    h.in.connect(h.lp); h.lp.connect(h.out); h.out.connect(amb);
    h.verb = gainNode(0); h.verb.connect(verbIn);
    fadeParam(h.out.gain, 1, start, rise);
    fadeParam(h.verb.gain, 1, start, rise * 0.8);
    beds(h, start);
    for (const [name, every] of Object.entries(L.events)) h.next[name] = start + rand(1, every[0] + 1.5);
    ambient = h;
  }

  /* Let a scene go: it muffles, drifts into its own echo, and fades. */
  function retire(h) {
    const now = ctx.currentTime, fall = 3.4;
    h.dead = true;
    h.lp.frequency.cancelScheduledValues(now);
    h.lp.frequency.setValueAtTime(Math.max(300, h.lp.frequency.value), now);
    h.lp.frequency.exponentialRampToValueAtTime(240, now + fall * 0.85);
    fadeParam(h.out.gain, 0, now + 0.01, fall);
    const v = h.verb.gain;
    v.cancelScheduledValues(now); v.setValueAtTime(v.value, now);
    v.linearRampToValueAtTime(1.5, now + 0.8); v.linearRampToValueAtTime(0, now + fall + 1);
    setTimeout(() => {
      h.nodes.forEach(n => { try { n.stop(); } catch (e) {} });
      try { h.out.disconnect(); h.verb.disconnect(); } catch (e) {}
    }, (fall + 1.6) * 1000);
  }

  function stopAmbient() {
    if (!ambient || !ctx) { ambient = null; return; }
    retire(ambient);
    ambient = null;
  }

  /* The scheduler: lays out ambient events a little ahead of time on the audio clock, and keeps the
     beds, wind, crickets and chords moving. */
  function tick() {
    if (!ctx || (ctx.state !== 'running' && !offline)) return;
    const h = ambient;
    if (!h || h.dead) return;
    const now = ctx.currentTime, ahead = now + 0.3, L = h.L;
    for (const [name, every] of Object.entries(L.events)) {
      if (h.next[name] > ahead) continue;
      if (enabled) EV[name](h, Math.max(0, h.next[name] - now));
      h.next[name] = Math.max(h.next[name], now) + rand(every[0], every[1]);
    }
    if (h.lapAt <= ahead) {
      if (enabled) lap(h, Math.max(0, h.lapAt - now));
      h.lapAt = Math.max(h.lapAt, now) + rand(L.water.laps[0], L.water.laps[1]);
    }
    if (h.modAt <= now) {
      // the water breathes, the wind gusts and wanders
      for (const b of h.bed) b.g.gain.setTargetAtTime(b.lvl * rand(0.6, 1.3), now, 0.9);
      for (const w of [h.wind, h.howl]) {
        if (!w) continue;
        w.g.gain.setTargetAtTime(w.lvl * rand(0.35, 1.35), now, 1.3);
        w.bp.frequency.setTargetAtTime(w.f * rand(0.7, 1.45), now, 1.6);
        if (w.p && w.p.pan) w.p.pan.setTargetAtTime(rand(-0.5, 0.5), now, 2);
      }
      h.modAt = now + rand(1.2, 2.6);
    }
    for (const c of h.crickets) {
      if (c.next > now) continue;
      c.lvl.gain.setTargetAtTime(Math.random() < 0.72 ? c.base * rand(0.7, 1) : 0, now, 1.2);
      c.next = now + rand(3, 8);
    }
    // the chord holds while a fish is on the line, so the reel's drone and harp stay in harmony with it
    if (reel) h.chordAt = Math.max(h.chordAt, now + 3);
    if (h.chordAt <= now) {
      // move to the next chord one voice at a time, each dipping out and back in on its new note
      h.chord = (h.chord + 1) % L.chords.length;
      const chord = L.chords[h.chord];
      h.voices.forEach((v, i) => {
        const note = chord[i] ?? chord[0] + 12;
        if (note === v.note) return;
        const at = now + i * 1.3;
        v.cg.gain.setTargetAtTime(0, at, 0.6);
        for (const o of v.oscs) o.frequency.setValueAtTime(midi(note), at + 2.6);
        v.cg.gain.setTargetAtTime(1, at + 2.7, 0.9);
        v.note = note;
      });
      h.chordAt = now + rand(18, 28);
    }
  }

  /* ================= Controls ================= */
  function setEnabled(on) {
    enabled = on;
    if (ctx && master) master.gain.setTargetAtTime(on ? MASTER : 0, ctx.currentTime, 0.12);
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  /* How far (in cents) each effect's take may wander in pitch: most a little, small clicks and splashes
     more, and anything tuned to a melody (the singing geodes) not at all. */
  // the music that answers the water's pad (bites, the meter, landings, rewards) stays in tune with it
  const SPREAD = { geode: 0, blessing: 4, gate: 6, landed: 0, levelUp: 0, unlock: 0, badge: 0, meterSet: 0, nudge: 0, escape: 2, bite: 3, coin: 2, buy: 2, release: 3, open: 3, equip: 3,
    click: 30, glass: 20, plop: 20, splashIn: 25, thud: 22, gulp: 30, boop: 25, flakes: 25, pebbles: 25 };
  const play = (name, ...args) => {
    if (!ctx || !enabled || !S[name]) return;
    const sp = SPREAD[name] ?? 14;
    TAKE = { c: rand(-sp, sp), g: rand(0.88, 1.04), j: 0.007 };
    try { S[name](...args); } finally { TAKE = NO_TAKE; }
  };

  return {
    init, play, startAmbient, stopAmbient, startReel, updateReel, stopReel,
    setEnabled, suspend, resume, defineVoices,
    get enabled() { return enabled; },
    get ready() { return !!ctx; },
    /* for offline rendering in tests */
    _test: { S, EV, LAKES, GV, tick, lap, pluck, bell, glow, harmony, midi, reel: () => reel, offline(on) { offline = on; if (on && ticker) { clearInterval(ticker); ticker = null; } } },
  };
})();
