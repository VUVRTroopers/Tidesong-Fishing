/* Tidesong — synthesised sound. Everything is generated with the Web Audio API:
   no audio files. Audio starts on the first tap/click (browser autoplay rules). */
'use strict';

const Sound = (() => {
  let ctx = null;
  let master, sfx, amb, verbSend, noiseBuf, brownBuf;
  let enabled = true;
  let ambient = null;
  let ambientWanted = null;
  let reel = null;

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }

    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);

    const verb = ctx.createConvolver();
    verb.buffer = impulse(3.4, 2.4);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
    verb.connect(verbOut); verbOut.connect(master);
    verbSend = ctx.createGain(); verbSend.gain.value = 1; verbSend.connect(verb);

    sfx = ctx.createGain(); sfx.gain.value = 0.85; sfx.connect(master);
    const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.28; sfx.connect(sfxSend); sfxSend.connect(verbSend);

    amb = ctx.createGain(); amb.gain.value = 0.75; amb.connect(master);

    noiseBuf = makeNoise(2, false);
    brownBuf = makeNoise(4, true);

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ambientWanted) startAmbient(ambientWanted);
  }

  function impulse(dur, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function makeNoise(dur, brown) {
    const rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return buf;
  }

  function out(dest, pan) {
    if (!pan || !ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest);
    return p;
  }

  /* A single enveloped oscillator. */
  function tone(freq, o = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.t || 0);
    const dur = o.dur || 0.3, attack = o.attack || 0.006, gain = o.gain || 0.15;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t0 + (o.glideTime || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lowpass;
      g.connect(f); node = f;
    }
    osc.connect(g);
    node.connect(out(o.dest || sfx, o.pan));
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  /* Soft bell: a few inharmonic sine partials. */
  function bell(freq, o = {}) {
    const g = o.gain || 0.08, dur = o.dur || 2.2;
    const partials = [[1, 1], [2.01, 0.45], [2.76, 0.28], [5.4, 0.12]];
    for (const [m, a] of partials) tone(freq * m, { t: o.t, dur: dur / (m > 2 ? 1.8 : 1), gain: g * a, attack: 0.004, dest: o.dest, pan: o.pan });
  }

  /* Plucked note: triangle body + sine octave. */
  function pluck(freq, o = {}) {
    const g = o.gain || 0.1;
    tone(freq, { t: o.t, dur: o.dur || 0.7, gain: g, type: 'triangle', attack: 0.004, lowpass: 2600, dest: o.dest, pan: o.pan });
    tone(freq * 2, { t: o.t, dur: (o.dur || 0.7) * 0.6, gain: g * 0.35, attack: 0.004, dest: o.dest, pan: o.pan });
  }

  function noise(o = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.t || 0), dur = o.dur || 0.3;
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? brownBuf : noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + (o.fTime || dur));
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.1, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(out(o.dest || sfx, o.pan));
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
  }

  /* ---------------- Game sounds ---------------- */

  const S = {
    click() { tone(1400, { dur: 0.05, gain: 0.04, attack: 0.002 }); tone(2100, { dur: 0.04, gain: 0.02, t: 0.01 }); },

    open() { pluck(midi(79), { gain: 0.05, dur: 0.5 }); pluck(midi(84), { gain: 0.04, dur: 0.5, t: 0.06 }); },

    cast() {
      // rod swish
      noise({ f0: 500, f1: 2600, fTime: 0.22, dur: 0.42, q: 1.4, gain: 0.22, attack: 0.05 });
      // line spooling off the reel: a quick run of soft ticks that slows down
      let t = 0.18;
      for (let i = 0; i < 22; i++) {
        noise({ t, f0: 4200, q: 6, dur: 0.018, gain: 0.05, attack: 0.002 });
        t += 0.016 + i * 0.0022;
      }
    },

    plop(size = 1) {
      // water drop: quick rising sine "bloop" + soft wash
      tone(260 / size, { glide: 900 / size, glideTime: 0.07, dur: 0.16, gain: 0.22 * size, attack: 0.004 });
      noise({ filter: 'lowpass', f0: 1800, f1: 500, dur: 0.35, gain: 0.08 * size, attack: 0.005 });
    },

    nibble() {
      tone(520, { glide: 1100, glideTime: 0.05, dur: 0.1, gain: 0.07, attack: 0.003 });
      tone(700, { t: 0.09, glide: 1300, glideTime: 0.05, dur: 0.09, gain: 0.05, attack: 0.003 });
    },

    splash(size = 1) {
      noise({ filter: 'lowpass', f0: 4000, f1: 600, dur: 0.5 * size + 0.15, gain: 0.22 * Math.min(1.4, size), attack: 0.004 });
      noise({ f0: 1200, f1: 3200, q: 0.8, dur: 0.25, gain: 0.08 * size, attack: 0.002, t: 0.02 });
      for (let i = 0; i < 4 * size; i++) tone(rand(500, 900), { t: rand(0.03, 0.3), glide: rand(1100, 1800), glideTime: 0.05, dur: 0.09, gain: 0.035, attack: 0.003 });
    },

    /* The bite cue is the same for every fish: rarity is only revealed by how it fights. */
    bite() {
      S.splash(1);
      const base = 76;
      pluck(midi(base), { gain: 0.13, dur: 0.6, t: 0.02 });
      pluck(midi(base + 7), { gain: 0.12, dur: 0.9, t: 0.12 });
    },

    escape() {
      S.splash(0.7);
      tone(midi(67), { t: 0.08, dur: 0.5, gain: 0.08, type: 'triangle', lowpass: 1800 });
      tone(midi(62), { t: 0.3, dur: 0.9, gain: 0.08, type: 'triangle', lowpass: 1400 });
      tone(midi(55), { t: 0.55, dur: 1.2, gain: 0.06, type: 'sine' });
    },

    landed(rarity) {
      S.splash(1.3);
      const tier = RARITIES[rarity].tier;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      const root = 67;
      const n = 4 + tier * 2;
      for (let i = 0; i < n; i++) pluck(midi(root + scale[i % scale.length]), { t: 0.15 + i * 0.075, gain: 0.09, dur: 0.9, pan: (i / n - 0.5) * 0.6 });
      const chordAt = 0.15 + n * 0.075;
      // resolving chord
      [0, 4, 7, 12].forEach((s, i) => tone(midi(root - 12 + s), { t: chordAt, dur: 1.8 + tier * 0.5, gain: 0.05, attack: 0.03, type: 'triangle', lowpass: 2200, pan: (i - 1.5) * 0.2 }));
      if (tier >= 1) bell(midi(root + 24), { t: chordAt, gain: 0.05, dur: 2.5 });
      if (tier >= 3) {
        // fanfare: bright bell cascade and a warm low swell
        for (let i = 0; i < 12; i++) bell(midi(root + 12 + scale[(i * 3) % scale.length]), { t: chordAt + 0.1 + i * 0.09, gain: 0.035, dur: 2.2, pan: Math.sin(i) * 0.6 });
        tone(midi(root - 24), { t: chordAt, dur: 3.2, gain: 0.14, attack: 0.1 });
        tone(midi(root - 17), { t: chordAt, dur: 3.2, gain: 0.07, attack: 0.1, type: 'triangle', lowpass: 900 });
      }
      if (tier >= 4) {
        noise({ brown: true, filter: 'lowpass', f0: 300, f1: 60, t: chordAt, dur: 3, gain: 0.35, attack: 0.02 });
        bell(midi(root - 12), { t: chordAt, gain: 0.14, dur: 5 });
        for (let i = 0; i < 10; i++) bell(midi(root + 24 + scale[i % 6]), { t: chordAt + 0.8 + i * 0.12, gain: 0.025, dur: 2.5, pan: Math.cos(i) * 0.7 });
      }
    },

    levelUp() {
      const s = [0, 4, 7, 12, 16];
      s.forEach((n, i) => bell(midi(72 + n), { t: i * 0.08, gain: 0.05, dur: 1.8, pan: (i - 2) * 0.2 }));
    },

    unlock() {
      for (let i = 0; i < 9; i++) bell(midi(79 + [0, 2, 4, 7, 9, 12, 14, 16, 19][i]), { t: i * 0.055, gain: 0.035, dur: 2, pan: (i / 8 - 0.5) });
      tone(midi(55), { dur: 2.5, gain: 0.06, attack: 0.2 });
    },

    coin(n = 1) {
      const notes = [84, 88, 91, 96];
      const k = Math.min(4, 1 + Math.floor(Math.log2(n + 1)));
      for (let i = 0; i < k + 1; i++) bell(midi(notes[i % 4] + (i >= 4 ? 12 : 0)), { t: i * 0.07, gain: 0.05, dur: 1.2, pan: (i - k / 2) * 0.2 });
      noise({ f0: 6000, q: 2, dur: 0.12, gain: 0.03, attack: 0.002 });
    },

    buy() {
      [0, 4, 7, 12].forEach((n, i) => pluck(midi(72 + n), { t: i * 0.06, gain: 0.08, dur: 0.6 }));
      bell(midi(96), { t: 0.26, gain: 0.05, dur: 1.6 });
    },

    equip() {
      tone(520, { glide: 780, glideTime: 0.06, dur: 0.12, gain: 0.06, attack: 0.003 });
      pluck(midi(79), { t: 0.05, gain: 0.05, dur: 0.4 });
    },

    deny() {
      tone(midi(57), { dur: 0.18, gain: 0.07, type: 'triangle', lowpass: 1200 });
      tone(midi(53), { t: 0.12, dur: 0.25, gain: 0.07, type: 'triangle', lowpass: 1000 });
    },

    release() {
      S.plop(1.1);
      pluck(midi(74), { t: 0.12, gain: 0.06, dur: 0.6 });
      pluck(midi(79), { t: 0.22, gain: 0.05, dur: 0.8 });
    },

    croak() {
      for (let i = 0; i < 2; i++) tone(rand(150, 175), { t: i * 0.17, glide: 115, glideTime: 0.12, dur: 0.15, gain: 0.07, type: 'triangle', lowpass: 650, attack: 0.012 });
    },
    gull() {
      for (let i = 0; i < 3; i++) tone(rand(1250, 1500), { t: i * 0.22, glide: 900, glideTime: 0.18, dur: 0.2, gain: 0.035, type: 'triangle', lowpass: 2600, pan: 0.3 - i * 0.3 });
    },
    hoot() {
      tone(392, { dur: 0.5, gain: 0.05, attack: 0.08, glide: 370, glideTime: 0.4, lowpass: 900 });
      tone(370, { t: 0.62, dur: 0.32, gain: 0.04, attack: 0.05, lowpass: 900 });
      tone(370, { t: 0.98, dur: 0.6, gain: 0.045, attack: 0.06, glide: 340, glideTime: 0.5, lowpass: 900 });
    },
    shimmer() {
      for (let i = 0; i < 6; i++) bell(midi(96 - i * 2), { t: i * 0.05, gain: 0.012, dur: 1.2, pan: -0.6 + i * 0.25 });
    },
    wisp() {
      for (let i = 0; i < 3; i++) bell(midi([86, 91, 93][i]), { t: i * 0.18, gain: 0.014, dur: 2.2, pan: rand(-0.5, 0.5) });
    },
    spout() { noise({ f0: 700, f1: 1600, fTime: 0.4, dur: 0.9, q: 0.8, gain: 0.07, attack: 0.05 }); },
    whale() {
      tone(130, { dur: 2.6, gain: 0.05, attack: 0.5, glide: 210, glideTime: 1.4, type: 'sine' });
      tone(260, { t: 0.3, dur: 2.2, gain: 0.018, attack: 0.5, glide: 180, glideTime: 1.8, type: 'triangle', lowpass: 600 });
    },
    crane() {
      tone(760, { dur: 0.35, gain: 0.025, glide: 640, glideTime: 0.3, type: 'triangle', lowpass: 2000 });
      tone(720, { t: 0.45, dur: 0.4, gain: 0.02, glide: 600, glideTime: 0.35, type: 'triangle', lowpass: 2000 });
    },
    rumble() {
      noise({ brown: true, filter: 'lowpass', f0: 160, f1: 70, dur: 3.2, gain: 0.22, attack: 0.8 });
      tone(46, { dur: 3, gain: 0.08, attack: 0.9 });
    },

    travel() {
      noise({ f0: 300, f1: 1400, fTime: 0.8, dur: 1.2, q: 0.7, gain: 0.08, attack: 0.4 });
      bell(midi(74), { t: 0.5, gain: 0.04, dur: 2 });
      bell(midi(81), { t: 0.62, gain: 0.03, dur: 2 });
    },
  };

  /* ---------------- Reel fight sound ---------------- */
  const REEL_SCALE = [0, 2, 4, 7, 9];

  function startReel(rarity) {
    if (!ctx) return;
    stopReel();
    const t0 = ctx.currentTime;
    // line strain: narrow band of noise that swells while the fish is outside the band
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 9;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(sfx); src.start(t0);
    // a soft drone that brightens as the meter fills
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = midi(55);
    const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = midi(62);
    const dg = ctx.createGain(); dg.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    osc.connect(dg); osc2.connect(lp); lp.connect(dg); dg.connect(sfx); dg.connect(verbSend);
    osc.start(t0); osc2.start(t0);
    reel = { src, f, g, osc, osc2, dg, lp, step: -1, tickT: 0, beatT: 0, rarity };
  }

  function updateReel(dt, s) {
    // s: { inBand, progress, holding, danger, speed }
    if (!reel || !ctx) return;
    const now = ctx.currentTime;
    reel.g.gain.setTargetAtTime(s.inBand ? 0.0001 : 0.05 + s.danger * 0.05, now, 0.08);
    reel.f.frequency.setTargetAtTime(600 + s.speed * 900, now, 0.1);
    reel.dg.gain.setTargetAtTime(s.inBand ? 0.02 + s.progress * 0.025 : 0.008, now, 0.15);
    reel.lp.frequency.setTargetAtTime(400 + s.progress * 1600, now, 0.2);

    // ratchet ticks while reeling in (holding)
    reel.tickT -= dt;
    if (s.holding && reel.tickT <= 0) {
      noise({ f0: 3600, q: 5, dur: 0.014, gain: 0.03, attack: 0.001 });
      reel.tickT = 0.07;
    }
    // ascending pentatonic notes as the meter climbs
    const step = Math.floor(s.progress / 0.07);
    if (s.inBand && step > reel.step) {
      const n = Math.max(0, step);
      const note = 62 + REEL_SCALE[n % 5] + 12 * Math.floor(n / 5);
      pluck(midi(Math.min(note, 98)), { gain: 0.06, dur: 0.6, pan: (s.fishPos || 0.5) - 0.5 });
      reel.step = step;
    } else if (step < reel.step - 1) {
      reel.step = step + 1;
    }
    // soft heartbeat when the fish is about to escape
    reel.beatT -= dt;
    if (s.danger > 0.55 && !s.inBand && reel.beatT <= 0) {
      tone(58, { dur: 0.16, gain: 0.18, attack: 0.01 });
      tone(52, { t: 0.18, dur: 0.18, gain: 0.13, attack: 0.01 });
      reel.beatT = 0.85;
    }
  }

  function stopReel() {
    if (!reel || !ctx) { reel = null; return; }
    const now = ctx.currentTime;
    const r = reel; reel = null;
    r.g.gain.setTargetAtTime(0.0001, now, 0.05);
    r.dg.gain.setTargetAtTime(0.0001, now, 0.1);
    setTimeout(() => { try { r.src.stop(); r.osc.stop(); r.osc2.stop(); } catch (e) {} }, 600);
  }

  /* ---------------- Ambience ---------------- */
  const AMBIENCE = {
    mistwillow: { pad: [48, 55, 64, 71], water: 0.11, cut: 520, events: ['birds'] },
    lanternfen: { pad: [45, 52, 60, 67], water: 0.09, cut: 420, events: ['crickets', 'frog'] },
    coralspire: { pad: [53, 60, 64, 69], water: 0.15, cut: 900, events: ['waves', 'gull'] },
    frostveil:  { pad: [50, 57, 62, 64, 69], water: 0.08, cut: 380, events: ['wind', 'icechime'] },
    dragonmere: { pad: [43, 50, 55, 58, 65], water: 0.09, cut: 450, events: ['windchime', 'gong'] },
  };

  const EVENTS = {
    birds: { every: [2.5, 7], play(d) {
      const n = 2 + Math.floor(Math.random() * 4), base = rand(2400, 3600), pan = rand(-0.8, 0.8);
      for (let i = 0; i < n; i++) tone(base * rand(0.9, 1.15), { t: i * rand(0.09, 0.14), glide: base * rand(1.15, 1.5), glideTime: 0.06, dur: 0.09, gain: 0.025, attack: 0.008, dest: d, pan });
    } },
    crickets: { every: [1.2, 3.5], play(d) {
      const f = rand(4300, 5200), pan = rand(-0.9, 0.9);
      for (let i = 0; i < 6; i++) tone(f, { t: i * 0.045, dur: 0.03, gain: 0.012, attack: 0.004, dest: d, pan });
    } },
    frog: { every: [5, 12], play(d) {
      const pan = rand(-0.7, 0.7);
      for (let i = 0; i < 2; i++) tone(rand(150, 190), { t: i * 0.16, glide: 120, glideTime: 0.1, dur: 0.12, gain: 0.05, type: 'triangle', lowpass: 700, attack: 0.01, dest: d, pan });
    } },
    waves: { every: [4, 8], play(d) {
      noise({ f0: 500, f1: 1400, fTime: 1.4, dur: 3, q: 0.6, gain: 0.05, attack: 1.2, dest: d, pan: rand(-0.5, 0.5) });
    } },
    gull: { every: [10, 22], play(d) {
      const pan = rand(-0.8, 0.8);
      for (let i = 0; i < 3; i++) tone(rand(1250, 1450), { t: i * 0.28, glide: 950, glideTime: 0.22, dur: 0.24, gain: 0.012, type: 'triangle', lowpass: 2500, dest: d, pan });
    } },
    wind: { every: [5, 10], play(d) {
      noise({ f0: 300, f1: 950, fTime: 2.4, dur: 5, q: 2.2, gain: 0.045, attack: 2, dest: d, pan: rand(-0.6, 0.6) });
    } },
    icechime: { every: [3, 8], play(d) {
      const notes = [86, 89, 91, 93, 96, 98];
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bell(midi(pick(notes)), { t: i * rand(0.12, 0.3), gain: 0.014, dur: 2.4, dest: d, pan: rand(-0.8, 0.8) });
    } },
    windchime: { every: [3, 7], play(d) {
      const notes = [74, 77, 79, 81, 84, 86, 89];
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) bell(midi(pick(notes)), { t: i * rand(0.1, 0.25), gain: 0.018, dur: 2.6, dest: d, pan: rand(-0.7, 0.7) });
    } },
    gong: { every: [14, 26], play(d) {
      bell(midi(38), { gain: 0.08, dur: 6, dest: d });
    } },
  };

  function startAmbient(id) {
    ambientWanted = id;
    if (!ctx) return;
    stopAmbient();
    const cfg = AMBIENCE[id];
    if (!cfg) return;
    const t0 = ctx.currentTime;
    const h = { id, alive: true, nodes: [], timers: [] };
    h.gain = ctx.createGain();
    h.gain.gain.setValueAtTime(0.0001, t0);
    h.gain.gain.exponentialRampToValueAtTime(1, t0 + 3);
    h.gain.connect(amb);

    // lapping water bed
    const src = ctx.createBufferSource(); src.buffer = brownBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cfg.cut;
    const wg = ctx.createGain(); wg.gain.value = cfg.water;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain(); lfoG.gain.value = cfg.water * 0.45;
    lfo.connect(lfoG); lfoG.connect(wg.gain);
    src.connect(lp); lp.connect(wg); wg.connect(h.gain);
    src.start(t0); lfo.start(t0);
    h.nodes.push(src, lfo);

    // a quiet, breathing pad chord
    const padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 900;
    const padG = ctx.createGain(); padG.gain.value = 1;
    padLP.connect(padG); padG.connect(h.gain); padG.connect(verbSend);
    cfg.pad.forEach((n, i) => {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = midi(n); o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = i === 0 ? 0.016 : 0.0065;
        const l = ctx.createOscillator(); l.frequency.value = rand(0.05, 0.11);
        const lg = ctx.createGain(); lg.gain.value = g.gain.value * 0.7;
        l.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(padLP);
        o.start(t0); l.start(t0);
        h.nodes.push(o, l);
      }
    });

    for (const ev of cfg.events) scheduleEvent(h, EVENTS[ev], rand(0.5, 3));
    ambient = h;
  }

  function scheduleEvent(h, ev, delay) {
    const id = setTimeout(() => {
      if (!h.alive) return;
      if (ctx && ctx.state === 'running' && enabled) ev.play(h.gain);
      scheduleEvent(h, ev, rand(ev.every[0], ev.every[1]));
    }, delay * 1000);
    h.timers.push(id);
  }

  function stopAmbient() {
    if (!ambient || !ctx) { ambient = null; return; }
    const h = ambient; ambient = null;
    h.alive = false;
    h.timers.forEach(clearTimeout);
    const now = ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setValueAtTime(Math.max(0.0001, h.gain.gain.value), now);
    h.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    setTimeout(() => { h.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); h.gain.disconnect(); }, 1700);
  }

  function setEnabled(on) {
    enabled = on;
    if (ctx && master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.08);
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  const play = (name, ...args) => { if (ctx && enabled && S[name]) S[name](...args); };

  return {
    init, play, startAmbient, stopAmbient, startReel, updateReel, stopReel,
    setEnabled, suspend, resume,
    get enabled() { return enabled; },
    get ready() { return !!ctx; },
  };
})();
