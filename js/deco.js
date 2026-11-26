/* Tidesong — decorations for the aquariums, bought in the Driftwood Market and placed in any tank.
   Each is painted once into a small sprite (with separate sprites for the parts that move), stands in
   one of two rows on the sand, always drawn in front of the tank's own decor and never over its things
   to touch, and brings its own life: places fish like to go (somewhere to hide, nap, gather, ride bubbles or swim
   through), bubbles, lights, and something that happens when it is tapped. A tank's decorations please
   its fish (its "comfort"), so they make more pearls; a second of the same piece in one tank pleases
   them half as much.

   Units: a decoration is drawn in its own units (about one aquarium unit, U, each), origin at the middle
   of its base, y up being negative. */
'use strict';

const Deco = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
  function rg(c, x0, y0, r0, x1, y1, r1, stops) { const g = c.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.01, r1)); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
  const ellipse = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); };
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); };
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
  /* the soft shadow where a piece sits in the sand */
  function contact(c, w, a = 0.42) {
    ellipse(c, 0, 0.1, w * 0.55, w * 0.1);
    c.fillStyle = rg(c, 0, 0.1, 0, 0, 0.1, w * 0.55, [[0, `rgba(0,0,0,${a})`], [1, 'rgba(0,0,0,0)']]); c.fill();
  }
  /* moss and lichen growing over a shape (clip to it first) */
  function moss(c, x, y, w, h, seed, cols = ['#4f8a3a', '#6aa846', '#3b6e2c']) {
    const r = rng(seed);
    for (let i = 0; i < 28; i++) { circle(c, x + (r() - 0.5) * w, y + (r() - 0.5) * h, 0.12 + r() * 0.3); c.fillStyle = cols[i % cols.length]; c.globalAlpha = 0.55 + r() * 0.35; c.fill(); }
    c.globalAlpha = 1;
  }
  function speckle(c, x, y, w, h, seed, n, cols) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) { circle(c, x + (r() - 0.5) * w, y + (r() - 0.5) * h, 0.05 + r() * 0.12); c.fillStyle = cols[i % cols.length]; c.fill(); }
  }
  /* rough stone (castle walls, plinths, the giant) */
  function stoneFill(c, x0, y0, x1, y1, base, seed) {
    c.fillStyle = lg(c, x0, y0, x1, y1, [[0, mixc(base, '#ffffff', 0.25)], [0.5, base], [1, mixc(base, '#000000', 0.45)]]);
    c.fill();
  }
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function mixc(a, b, k) { const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`; }
  const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

  /* ======================================================================
     The catalogue. tier: 1 trinket, 2 centrepiece, 3 grand. joy: how much it pleases a tank's fish
     (added to their comfort: a trinket about +7%, a grand piece about +14%; a tank's pieces together
     count a little less than their sum, see tank.js). w, h: its size in units. Prices follow what each
     can earn: a trinket pays for itself in about three days in a beginner's bowl, a grand piece in a
     week or so in a grand tank full of fish.
     ====================================================================== */
  const DEF = {};
  const LIST = [];
  function def(o) { DEF[o.id] = o; LIST.push(o); }

  /* ---------------- Teacup ---------------- */
  def({
    id: 'teacup', name: 'Teacup Nook', tier: 1, joy: 0.07, price: 240, w: 11, h: 7.5,
    blurb: 'A porcelain teacup tipped on its saucer. Sleepy fish curl up inside it for a nap. Tap it and it rocks, puffing out a little tea-coloured fizz.',
    paint(c) {
      contact(c, 11);
      // the saucer
      ellipse(c, 0, -0.55, 5.3, 1.25);
      c.fillStyle = lg(c, 0, -1.8, 0, 0.7, [[0, '#ffffff'], [0.6, '#e4edf3'], [1, '#a9bccb']]); c.fill();
      ellipse(c, 0, -0.75, 3.7, 0.75); c.fillStyle = 'rgba(150,175,195,0.35)'; c.fill();
      ellipse(c, 0, -0.55, 5.3, 1.25); c.strokeStyle = '#d6a64a'; c.lineWidth = 0.18; c.stroke();
      ellipse(c, 0, -0.5, 4.6, 1.0); c.strokeStyle = 'rgba(70,110,170,0.5)'; c.lineWidth = 0.12; c.stroke();
    },
    parts: {
      cup: {
        w: 9, h: 7, ox: 4.5, oy: 3.5,
        paint(c) {
          // lying on its side, mouth turned toward you and up a little
          c.rotate(-0.32);
          // the body
          c.beginPath(); c.moveTo(2.2, -2.5); c.bezierCurveTo(0.6, -2.7, -2.0, -2.2, -2.8, -1.4); c.quadraticCurveTo(-3.3, 0, -2.8, 1.4); c.bezierCurveTo(-2.0, 2.2, 0.6, 2.7, 2.2, 2.5); c.closePath();
          c.fillStyle = lg(c, 0, -2.6, 0, 2.6, [[0, '#ffffff'], [0.45, '#f1f5f8'], [1, '#9fb3c4']]); c.fill();
          c.save(); c.clip();
          // blue sprigs of a painted pattern, and a gold band by the rim
          const r = rng(4);
          for (let i = 0; i < 7; i++) {
            const x = -2.3 + r() * 3.8, y = -1.8 + r() * 3.6;
            c.strokeStyle = 'rgba(60,100,170,0.75)'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 0.3, y - 0.4, x + 0.6, y - 0.2); c.stroke();
            for (let k = 0; k < 4; k++) { circle(c, x + 0.6 + Math.cos(k * 1.57) * 0.16, y - 0.2 + Math.sin(k * 1.57) * 0.16, 0.11); c.fillStyle = 'rgba(70,110,185,0.85)'; c.fill(); }
          }
          c.restore();
          c.beginPath(); c.ellipse(1.75, 0, 0.55, 2.45, 0, -Math.PI / 2, Math.PI / 2); c.strokeStyle = '#d6a64a'; c.lineWidth = 0.22; c.stroke();
          // the mouth: the dark inside, a last drop of tea, a lit rim
          ellipse(c, 2.25, 0, 1.0, 2.5);
          c.fillStyle = rg(c, 2.1, 0.3, 0, 2.2, 0, 2.5, [[0, '#2a1a10'], [0.6, '#5a3a22'], [0.85, '#c9d6df'], [1, '#ffffff']]); c.fill();
          ellipse(c, 2.25, 0, 1.0, 2.5); c.strokeStyle = '#ffffff'; c.lineWidth = 0.2; c.stroke();
          ellipse(c, 2.15, 1.5, 0.45, 0.7); c.fillStyle = 'rgba(150,80,30,0.55)'; c.fill();
          // the handle
          c.beginPath(); c.ellipse(-0.6, -2.55, 1.05, 0.85, 0, Math.PI * 0.95, Math.PI * 2.05); c.strokeStyle = '#8aa0b2'; c.lineWidth = 0.75; c.stroke();
          c.strokeStyle = '#f4f8fb'; c.lineWidth = 0.45; c.stroke();
          // light along the top of the cup
          c.beginPath(); c.moveTo(1.6, -2.2); c.bezierCurveTo(0.4, -2.35, -1.6, -1.95, -2.4, -1.2); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.22; c.stroke();
        },
      },
    },
    anim(c, d, t) {
      const s = d.st, rock = s.rock > 0 ? Math.sin(s.rock * 14) * 0.2 * s.rock : Math.sin(t * 0.7 + d.uid) * 0.012;
      d.part(c, 'cup', -0.4, -3.1, rock);
    },
    step(d, dt, api) {
      const s = d.st;
      s.rock = Math.max(0, (s.rock || 0) - dt * 0.7);
      if (Math.random() < dt * 0.12) api.bubble(1.6, -3.4, 0.18);
      if (s.rock > 0.6 && Math.random() < dt * 30) api.bubble(1.8 + rand(-0.4, 0.4), -3.3, rand(0.12, 0.3), '#e8b070');
    },
    pois: [{ kind: 'nap', x: 1.6, y: -3.2, z: 0.35 }],
    tap(d, api) { d.st.rock = 1; api.play('deco', 'teacup'); api.attract(0, -3, 2); },
  });

  /* ---------------- Snow Globe ---------------- */
  def({
    id: 'globe', name: 'Snow Globe', tier: 1, joy: 0.075, price: 280, w: 8, h: 10.5,
    blurb: 'A little winter in a glass: a snowy cottage and a fir tree under a dome. Curious fish gather to peer in. Tap it to shake up a flurry.',
    paint(c) {
      contact(c, 8);
      // the wooden base
      c.beginPath(); c.moveTo(-3.4, 0); c.lineTo(-2.9, -1.9); c.lineTo(2.9, -1.9); c.lineTo(3.4, 0); c.closePath();
      c.fillStyle = lg(c, -3.4, 0, 3.4, 0, [[0, '#4a2a16'], [0.35, '#8a5a32'], [0.7, '#6a4022'], [1, '#2e180a']]); c.fill();
      c.fillStyle = '#d6a64a'; c.fillRect(-3.0, -1.55, 6.0, 0.22);
      // the scene inside, then the glass over it
      c.save(); circle(c, 0, -5.6, 3.6); c.clip();
      c.fillStyle = rg(c, -1, -7, 0, 0, -5.6, 3.8, [[0, '#cfe8ff'], [1, '#6f9cc8']]); c.fillRect(-4, -9.5, 8, 8);
      ellipse(c, 0, -2.4, 4, 1.2); c.fillStyle = '#ffffff'; c.fill();
      // the cottage
      c.fillStyle = '#b86a3a'; c.fillRect(-1.5, -4.6, 2.2, 1.8);
      c.beginPath(); c.moveTo(-1.8, -4.5); c.lineTo(-0.4, -5.8); c.lineTo(1.0, -4.5); c.closePath(); c.fillStyle = '#f4f8ff'; c.fill();
      c.fillStyle = '#ffd88a'; c.fillRect(-1.1, -4.1, 0.6, 0.55); c.fillStyle = '#5a3418'; c.fillRect(0.0, -3.9, 0.45, 1.1);
      // a fir tree
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(1.6, -6.4 + i * 0.8); c.lineTo(0.9 - i * 0.25, -5.0 + i * 0.8); c.lineTo(2.3 + i * 0.25, -5.0 + i * 0.8); c.closePath(); c.fillStyle = i % 2 ? '#2f6a44' : '#3d7c52'; c.fill(); }
      c.fillStyle = '#ffffff'; for (const [x, y] of [[1.6, -6.3], [1.2, -5.5], [2.0, -4.7]]) { circle(c, x, y, 0.15); c.fill(); }
      c.restore();
      // glass: a faint body, a rim of light and a bright window reflection
      circle(c, 0, -5.6, 3.6); c.fillStyle = 'rgba(220,240,255,0.08)'; c.fill();
      c.strokeStyle = 'rgba(235,248,255,0.75)'; c.lineWidth = 0.18; c.stroke();
      c.beginPath(); c.arc(0, -5.6, 3.2, Math.PI * 1.1, Math.PI * 1.45); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.4; c.lineCap = 'round'; c.stroke();
      ellipse(c, 1.6, -7.4, 0.5, 0.25, -0.6); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
    },
    anim(c, d, t) {
      const s = d.st;
      if (!s.flakes) { const r = rng(d.uid * 7 + 3); s.flakes = Array.from({ length: 26 }, () => ({ a: r() * TAU, rr: Math.sqrt(r()) * 3.1, y: r(), v: 0.25 + r() * 0.3 })); }
      c.save(); circle(c, 0, -5.6, 3.5); c.clip();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of s.flakes) {
        const swirl = s.shake || 0, ang = f.a + swirl * t * 2.4;
        const x = Math.cos(ang) * f.rr * (0.5 + 0.5 * swirl) + Math.sin(t * 0.8 + f.a) * 0.25;
        const y = -5.6 - 3.2 + f.y * 5.8 - swirl * Math.sin(ang) * 1.5;
        circle(c, x, Math.min(y, -2.6), 0.11); c.fill();
      }
      c.restore();
    },
    step(d, dt) {
      const s = d.st;
      if (!s.flakes) return;
      s.shake = Math.max(0, (s.shake || 0) - dt * 0.28);
      for (const f of s.flakes) { f.y += dt * f.v * 0.08 * (1 - (s.shake || 0)); if (f.y > 1) f.y = s.shake > 0.1 ? Math.random() * 0.3 : 1; if (s.shake > 0.5) f.y = Math.random(); }
    },
    pois: [{ kind: 'gather', x: 0, y: -6, z: 0.3 }],
    tap(d, api) { d.st.shake = 1; api.play('deco', 'globe'); api.attract(0, -6, 4); },
  });

  /* ---------------- Mushroom Cottage ---------------- */
  def({
    id: 'mushroom', name: 'Mushroom Cottage', tier: 1, joy: 0.08, price: 320, w: 10, h: 11,
    blurb: 'A toadstool with a round front door and a lamp in the window. Shy fish slip inside to hide. Tap the door and it swings open, and anyone hiding darts out.',
    paint(c) {
      contact(c, 10);
      // the stem, a little fat, with bark lines
      c.beginPath(); c.moveTo(-3.1, 0); c.bezierCurveTo(-3.6, -2.5, -2.9, -5.0, -2.5, -6.0); c.lineTo(2.5, -6.0); c.bezierCurveTo(2.9, -5.0, 3.6, -2.5, 3.1, 0); c.closePath();
      c.fillStyle = lg(c, -3.4, 0, 3.4, 0, [[0, '#a89070'], [0.35, '#f2e4c8'], [0.7, '#e0ccaa'], [1, '#8a7456']]); c.fill();
      c.save(); c.clip();
      const r = rng(9);
      c.strokeStyle = 'rgba(120,96,64,0.35)'; c.lineWidth = 0.1;
      for (let i = 0; i < 9; i++) { const x = -2.8 + r() * 5.6; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + (r() - 0.5), -3, x + (r() - 0.5) * 0.6, -6); c.stroke(); }
      moss(c, 0, -0.2, 7, 1.0, 3);
      c.restore();
      // the window
      c.fillStyle = '#5a3a1e'; circle(c, 1.5, -4.2, 0.95); c.fill();
      circle(c, 1.5, -4.2, 0.75); c.fillStyle = '#ffd98c'; c.fill();
      c.strokeStyle = '#5a3a1e'; c.lineWidth = 0.14; c.beginPath(); c.moveTo(0.75, -4.2); c.lineTo(2.25, -4.2); c.moveTo(1.5, -4.95); c.lineTo(1.5, -3.45); c.stroke();
      // the door frame (the door itself swings, as a part)
      c.beginPath(); c.moveTo(-2.1, 0); c.lineTo(-2.1, -2.6); c.arc(-0.9, -2.6, 1.2, Math.PI, 0); c.lineTo(0.3, 0); c.closePath();
      c.fillStyle = '#1a1008'; c.fill(); c.strokeStyle = '#6a4626'; c.lineWidth = 0.3; c.stroke();
      // the cap: red, domed, with white spots and a pale rim underneath
      c.beginPath(); c.moveTo(-5, -5.6); c.bezierCurveTo(-5, -9.6, 5, -9.6, 5, -5.6); c.quadraticCurveTo(0, -4.6, -5, -5.6); c.closePath();
      c.fillStyle = rg(c, -1.4, -9.2, 0.3, 0, -6.5, 6, [[0, '#ff8a6a'], [0.45, '#d8402a'], [1, '#7a1a10']]); c.fill();
      c.save(); c.clip();
      for (const [x, y, s] of [[-2.8, -7.1, 0.65], [-0.6, -8.4, 0.8], [1.9, -7.6, 0.6], [3.6, -6.3, 0.45], [-4.1, -6.2, 0.4], [0.6, -6.6, 0.45]]) { ellipse(c, x, y, s, s * 0.78); c.fillStyle = '#fff6e8'; c.fill(); }
      c.restore();
      c.beginPath(); c.moveTo(-5, -5.6); c.quadraticCurveTo(0, -4.6, 5, -5.6); c.quadraticCurveTo(0, -5.1, -5, -5.6); c.fillStyle = '#e8d0b0'; c.fill();
      // a little chimney
      c.fillStyle = '#7a5a40'; c.fillRect(2.2, -10.0, 0.9, 1.6); c.fillStyle = '#5a4030'; c.fillRect(2.05, -10.25, 1.2, 0.35);
    },
    parts: {
      door: {
        w: 2.6, h: 4, ox: 0.1, oy: 3.9,
        paint(c) {
          c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -2.6); c.arc(1.2, -2.6, 1.2, Math.PI, 0); c.lineTo(2.4, 0); c.closePath();
          c.fillStyle = lg(c, 0, 0, 2.4, 0, [[0, '#6a3e1e'], [0.5, '#9a6030'], [1, '#5a3418']]); c.fill();
          c.strokeStyle = 'rgba(40,20,8,0.6)'; c.lineWidth = 0.1;
          for (const x of [0.6, 1.2, 1.8]) { c.beginPath(); c.moveTo(x, -0.1); c.lineTo(x, -3.4); c.stroke(); }
          circle(c, 1.9, -1.5, 0.18); c.fillStyle = '#e8c050'; c.fill();
        },
      },
    },
    anim(c, d, t) {
      const s = d.st, open = s.open || 0;
      // the lamp in the window flickers; when the door opens light spills out of it
      const fl = 0.75 + 0.25 * Math.sin(t * 5.3 + d.uid) * Math.sin(t * 2.1);
      c.save(); c.globalCompositeOperation = 'lighter';
      circle(c, 1.5, -4.2, 1.8); c.fillStyle = rg(c, 1.5, -4.2, 0, 1.5, -4.2, 1.8, [[0, `rgba(255,210,120,${0.35 * fl})`], [1, 'rgba(255,210,120,0)']]); c.fill();
      if (open > 0.05) { ellipse(c, -0.9, -1.4, 1.6 * open + 0.4, 2.2); c.fillStyle = rg(c, -0.9, -1.4, 0, -0.9, -1.4, 2.4, [[0, `rgba(255,200,110,${0.55 * open})`], [1, 'rgba(255,200,110,0)']]); c.fill(); }
      c.restore();
      // the door swings open on its left hinge (it narrows as it turns toward you)
      d.part(c, 'door', -2.1, 0, 0, Math.max(0.12, 1 - open * 0.9), 1);
    },
    step(d, dt, api) {
      const s = d.st;
      if (s.openT > 0) { s.openT -= dt; s.open = Math.min(1, (s.open || 0) + dt * 3); } else s.open = Math.max(0, (s.open || 0) - dt * 1.2);
      if (Math.random() < dt * 0.35) api.bubble(2.65, -10.4, 0.15);
    },
    pois: [{ kind: 'hide', x: -0.9, y: -1.6, z: 0.92 }],
    tap(d, api) { d.st.openT = 3.5; api.play('deco', 'mushroom'); api.scare(-0.9, -1.6, 7); },
  });

  /* ---------------- Jelly Lantern ---------------- */
  def({
    id: 'jelly', name: 'Jelly Lantern', tier: 1, joy: 0.085, price: 360, w: 7, h: 14,
    blurb: 'A paper lantern shaped like a jellyfish, glowing on a tether from a stone. Fish that glow come to keep it company. Tap it and it pulses bright and bobs up on its string.',
    paint(c) {
      contact(c, 5);
      // the anchor stone
      c.beginPath(); c.moveTo(-1.8, 0); c.quadraticCurveTo(-2.0, -1.4, -0.4, -1.6); c.quadraticCurveTo(1.6, -1.8, 1.9, -0.6); c.quadraticCurveTo(2.0, 0, 1.6, 0.1); c.closePath();
      c.fillStyle = rg(c, -0.6, -1.3, 0.1, 0, -0.6, 2.4, [[0, '#9a958c'], [0.6, '#5c5850'], [1, '#2e2c28']]); c.fill();
      moss(c, 0, -1.3, 2.6, 0.5, 6);
      circle(c, 0.1, -1.55, 0.25); c.fillStyle = '#6a5a3a'; c.fill();
    },
    anim(c, d, t) {
      const s = d.st, g = 0.55 + 0.15 * Math.sin(t * 1.6 + d.uid) + (s.glow || 0) * 0.6;
      const by = -10.5 - Math.sin(t * 0.9 + d.uid) * 0.4 - (s.bob || 0) * 2.2, bx = Math.sin(t * 0.6 + d.uid) * 0.5;
      // the tether
      c.beginPath(); c.moveTo(0.1, -1.6); c.quadraticCurveTo(bx * 0.4 + 0.6, (by - 1.6) / 2, bx, by + 1.6); c.strokeStyle = 'rgba(220,210,180,0.6)'; c.lineWidth = 0.1; c.stroke();
      // tentacle ribbons trailing below the bell
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x0 = bx - 1.3 + i * 0.65;
        c.beginPath(); c.moveTo(x0, by + 0.6);
        for (let k = 1; k <= 6; k++) c.lineTo(x0 + Math.sin(t * 2 + i + k * 0.9) * 0.35, by + 0.6 + k * 0.75);
        c.strokeStyle = `rgba(255,${180 + i * 12},${210 - i * 8},${0.45 + g * 0.3})`; c.lineWidth = 0.22; c.stroke();
      }
      // the bell: paper over a light, with ribs
      c.save(); c.globalCompositeOperation = 'lighter';
      circle(c, bx, by - 0.6, 4.6); c.fillStyle = rg(c, bx, by - 0.6, 0, bx, by - 0.6, 4.6, [[0, `rgba(255,170,220,${0.28 * g})`], [1, 'rgba(255,170,220,0)']]); c.fill();
      c.restore();
      c.beginPath(); c.moveTo(bx - 2.3, by + 0.6); c.bezierCurveTo(bx - 2.5, by - 3.2, bx + 2.5, by - 3.2, bx + 2.3, by + 0.6);
      c.quadraticCurveTo(bx + 1.7, by + 0.2, bx + 1.1, by + 0.7); c.quadraticCurveTo(bx + 0.55, by + 0.2, bx, by + 0.7); c.quadraticCurveTo(bx - 0.55, by + 0.2, bx - 1.1, by + 0.7); c.quadraticCurveTo(bx - 1.7, by + 0.2, bx - 2.3, by + 0.6);
      c.fillStyle = rg(c, bx - 0.5, by - 1.6, 0, bx, by - 0.6, 3.2, [[0, `rgba(255,250,240,${0.85 + g * 0.15})`], [0.5, `rgba(255,${190 + g * 40},${215},${0.8})`], [1, 'rgba(200,110,170,0.75)']]); c.fill();
      c.strokeStyle = 'rgba(170,80,140,0.35)'; c.lineWidth = 0.08;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(bx + i * 0.5, by - 2.3 + Math.abs(i) * 0.15); c.quadraticCurveTo(bx + i * 1.05, by - 1.0, bx + i * 1.0, by + 0.5); c.stroke(); }
      ellipse(c, bx - 0.9, by - 1.8, 0.6, 0.3, -0.5); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill();
    },
    step(d, dt) { const s = d.st; s.glow = Math.max(0, (s.glow || 0) - dt * 0.5); s.bob = Math.max(0, (s.bob || 0) - dt * 0.35); },
    pois: [{ kind: 'glow', x: 0, y: -10, z: 0.35 }],
    tap(d, api) { d.st.glow = 1; d.st.bob = 1; api.play('deco', 'jelly'); api.attract(0, -10, 4, 'glow'); api.sparkle(0, -11, '#ffc0e0', 6); },
  });

  const STEEL = [[0, '#f2f6fa'], [0.35, '#b8c4ce'], [0.7, '#6e7a86'], [1, '#2e363e']];
  /* ---------------- Medieval Knight ---------------- */
  def({
    id: 'knight', name: 'Medieval Knight', tier: 2, joy: 0.1, price: 980, w: 10, h: 18,
    blurb: 'A suit of armour standing guard on a mossy plinth, sword at rest and a fish on its shield. Shy fish shelter behind the shield. Tap it and it lifts its visor in a gust of bubbles and raises its sword in salute.',
    paint(c) {
      contact(c, 9);
      // the plinth
      c.beginPath(); c.moveTo(-3.6, 0); c.lineTo(-3.3, -2.2); c.lineTo(3.3, -2.2); c.lineTo(3.6, 0); c.closePath();
      c.fillStyle = lg(c, -3.6, -2.2, 3.6, 0, [[0, '#9a968c'], [0.5, '#6e6a62'], [1, '#3a3834']]); c.fill();
      c.fillStyle = '#a8a498'; c.fillRect(-3.5, -2.45, 7.0, 0.35);
      c.save(); c.beginPath(); c.rect(-3.6, -2.3, 7.2, 2.4); c.clip(); moss(c, 0, -0.3, 7, 1.2, 11); c.restore();
      // legs: greaves and sabatons
      for (const x of [-1.1, 1.1]) {
        c.beginPath(); c.moveTo(x - 0.75, -2.3); c.lineTo(x - 0.6, -7.2); c.lineTo(x + 0.6, -7.2); c.lineTo(x + 0.75, -2.3); c.closePath();
        c.fillStyle = lg(c, x - 0.8, 0, x + 0.8, 0, STEEL); c.fill();
        ellipse(c, x, -4.9, 0.72, 0.45); c.fillStyle = lg(c, x - 0.7, -5.3, x + 0.7, -4.5, STEEL); c.fill();
        ellipse(c, x + 0.15, -2.4, 1.0, 0.35); c.fillStyle = '#5a646e'; c.fill();
      }
      // the skirt of plates, the breastplate with its ridge, the shoulders
      c.beginPath(); c.moveTo(-2.3, -7.6); c.lineTo(-2.0, -6.4); c.lineTo(2.0, -6.4); c.lineTo(2.3, -7.6); c.closePath(); c.fillStyle = lg(c, -2.3, 0, 2.3, 0, STEEL); c.fill();
      c.beginPath(); c.moveTo(-2.4, -7.6); c.bezierCurveTo(-2.8, -9.8, -2.4, -11.6, 0, -11.9); c.bezierCurveTo(2.4, -11.6, 2.8, -9.8, 2.4, -7.6); c.closePath();
      c.fillStyle = rg(c, -0.6, -10.4, 0.2, 0, -9.6, 3.4, [[0, '#ffffff'], [0.35, '#c6d0d8'], [0.8, '#6a7682'], [1, '#2e363e']]); c.fill();
      c.beginPath(); c.moveTo(0, -11.7); c.lineTo(0, -7.8); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.14; c.stroke();
      c.beginPath(); c.moveTo(-2.3, -7.9); c.quadraticCurveTo(0, -7.3, 2.3, -7.9); c.strokeStyle = '#d6a64a'; c.lineWidth = 0.22; c.stroke();
      for (const sx of [-1, 1]) { ellipse(c, sx * 2.5, -11.1, 1.35, 0.85, sx * 0.3); c.fillStyle = lg(c, sx * 1.4, -12, sx * 3.6, -10.4, STEEL); c.fill(); }
      // the left arm, down behind the shield
      c.beginPath(); c.moveTo(-3.2, -11); c.lineTo(-3.6, -7.8); c.lineTo(-2.6, -7.6); c.lineTo(-2.4, -10.8); c.closePath(); c.fillStyle = lg(c, -3.6, 0, -2.4, 0, STEEL); c.fill();
      // the helmet: a rounded great helm on a gorget (the visor is a part)
      c.beginPath(); c.moveTo(-1.5, -11.6); c.lineTo(-1.6, -12.4); c.lineTo(1.6, -12.4); c.lineTo(1.5, -11.6); c.closePath(); c.fillStyle = '#6e7a86'; c.fill();
      c.beginPath(); c.moveTo(-1.75, -12.3); c.bezierCurveTo(-1.95, -15.6, 1.95, -15.6, 1.75, -12.3); c.closePath();
      c.fillStyle = rg(c, -0.5, -14.6, 0.1, 0, -13.4, 2.4, STEEL.map(([o, col]) => [o, col])); c.fill();
      c.fillStyle = '#d6a64a'; c.fillRect(-0.12, -15.3, 0.24, 1.2);
      // the shield, leaning in front: blue, a gold rim, a silver fish
      c.save(); c.translate(-2.4, -6.3); c.rotate(-0.1);
      c.beginPath(); c.moveTo(-1.9, -2.9); c.lineTo(1.9, -2.9); c.lineTo(1.9, -0.6); c.quadraticCurveTo(1.8, 1.9, 0, 3.0); c.quadraticCurveTo(-1.8, 1.9, -1.9, -0.6); c.closePath();
      c.fillStyle = lg(c, -1.9, -2.9, 1.9, 3, [[0, '#4a7cc8'], [0.6, '#2c5aa0'], [1, '#183868']]); c.fill();
      c.strokeStyle = '#d6a64a'; c.lineWidth = 0.32; c.stroke();
      c.beginPath(); c.ellipse(0, -0.2, 1.05, 0.5, 0, 0, TAU); c.fillStyle = '#e8eef4'; c.fill();
      c.beginPath(); c.moveTo(-0.9, -0.2); c.lineTo(-1.55, -0.7); c.lineTo(-1.55, 0.3); c.closePath(); c.fill();
      circle(c, 0.55, -0.3, 0.12); c.fillStyle = '#183868'; c.fill();
      for (const [x, y] of [[1.2, 1.6], [-1.3, 1.2], [1.5, -2.2]]) { circle(c, x, y, 0.22); c.fillStyle = 'rgba(230,226,210,0.8)'; c.fill(); }
      c.restore();
    },
    parts: {
      sword: {
        w: 4, h: 10, ox: 2, oy: 1.4,
        paint(c) {
          // held at the hilt (the origin), blade pointing down
          c.fillStyle = lg(c, -0.3, 0, 0.3, 0, [[0, '#ffffff'], [0.5, '#a8b4c0'], [1, '#5a6672']]);
          c.beginPath(); c.moveTo(-0.28, 0.9); c.lineTo(-0.24, 7.4); c.lineTo(0, 8.2); c.lineTo(0.24, 7.4); c.lineTo(0.28, 0.9); c.closePath(); c.fill();
          c.fillStyle = '#d6a64a'; c.fillRect(-1.2, 0.55, 2.4, 0.4);
          c.fillStyle = '#5a3a1e'; c.fillRect(-0.2, -1.0, 0.4, 1.6);
          circle(c, 0, -1.15, 0.32); c.fillStyle = '#d6a64a'; c.fill();
          // the gauntlet round the grip
          ellipse(c, 0, -0.15, 0.7, 0.6); c.fillStyle = lg(c, -0.7, 0, 0.7, 0, STEEL); c.fill();
        },
      },
      visor: {
        w: 4, h: 3, ox: 2, oy: 1.5,
        paint(c) {
          c.beginPath(); c.moveTo(-1.78, -0.6); c.quadraticCurveTo(0, -1.45, 1.78, -0.6); c.lineTo(1.6, 1.1); c.quadraticCurveTo(0, 1.4, -1.6, 1.1); c.closePath();
          c.fillStyle = lg(c, -1.8, 0, 1.8, 0, STEEL); c.fill();
          c.fillStyle = '#121820';
          c.fillRect(-1.3, -0.35, 1.0, 0.22); c.fillRect(0.3, -0.35, 1.0, 0.22);
          for (let i = 0; i < 4; i++) { circle(c, -0.6 + i * 0.4, 0.55, 0.08); c.fill(); }
          c.beginPath(); c.moveTo(0, -1.3); c.lineTo(0, 1.25); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.1; c.stroke();
        },
      },
    },
    anim(c, d, t) {
      const s = d.st, lift = s.visor || 0, sal = s.salute || 0;
      // the plume, red and swaying from the top of the helm
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const sw = Math.sin(t * 1.3 + i * 0.6 + d.uid) * 0.5;
        c.beginPath(); c.moveTo(0, -15.2);
        c.bezierCurveTo(0.4 + i * 0.2, -16.6, 1.6 + sw, -17.2 + i * 0.25, 2.6 + sw * 1.4 + i * 0.25, -15.6 + i * 0.35);
        c.strokeStyle = i % 2 ? '#e05a3a' : '#b8301e'; c.lineWidth = 0.55 - i * 0.05; c.stroke();
      }
      // the right arm and its sword: at rest, blade down; in salute, hilt to the visor and blade up
      const ang = -sal * 2.95, hx = 2.6, hy = -8.2 - sal * 2.4;
      c.beginPath(); c.moveTo(2.8, -11.0); c.lineTo(hx + 0.4, hy + 0.2); c.lineTo(hx - 0.4, hy); c.lineTo(2.3, -10.6); c.closePath();
      c.fillStyle = lg(c, 2.2, 0, 3.3, 0, STEEL); c.fill();
      d.part(c, 'sword', hx, hy, ang);
      d.part(c, 'visor', 0, -13.25 - lift * 1.35, 0, 1, 1 - lift * 0.55);
      if (lift < 0.5) { c.fillStyle = '#121820'; }
    },
    step(d, dt, api) {
      const s = d.st;
      if (s.tapT > 0) {
        s.tapT -= dt;
        const k = 4.5 - s.tapT;
        s.visor = clamp(k / 0.4, 0, 1) * clamp(s.tapT / 0.6, 0, 1);
        s.salute = clamp((k - 0.5) / 0.6, 0, 1) * clamp((s.tapT - 0.3) / 0.8, 0, 1);
        if (k < 1.6 && Math.random() < dt * 24) api.bubble(rand(-1, 1), -13.4, rand(0.15, 0.35));
      } else { s.visor = 0; s.salute = 0; }
      if (Math.random() < dt * 0.15) api.bubble(rand(-0.8, 0.8), -13.4, 0.15);
    },
    pois: [{ kind: 'hide', x: -2.6, y: -6, z: 0.92 }, { kind: 'perch', x: 3.6, y: -16, z: 0.4 }],
    tap(d, api) { d.st.tapT = 4.5; api.play('deco', 'knight'); },
  });

  /* ---------------- Bubble Volcano ---------------- */
  def({
    id: 'volcano', name: 'Bubble Volcano', tier: 2, joy: 0.105, price: 1080, w: 13, h: 10,
    blurb: 'A little volcano of dark stone, glowing in its cracks, that breathes a stream of bubbles. Playful fish ride its bubbles to the surface. Tap it and it erupts, lifting every fish nearby.',
    paint(c) {
      contact(c, 13, 0.5);
      c.beginPath(); c.moveTo(-6.4, 0); c.bezierCurveTo(-4.6, -2.5, -2.6, -6.6, -1.5, -8.5); c.quadraticCurveTo(0, -8.9, 1.5, -8.5); c.bezierCurveTo(2.6, -6.6, 4.6, -2.5, 6.4, 0); c.closePath();
      c.fillStyle = lg(c, -6.4, -8, 6.4, 0, [[0, '#7a6a66'], [0.45, '#4a3e3e'], [1, '#1c1616']]); c.fill();
      c.save(); c.clip();
      const r = rng(21);
      // ridges of old lava running down
      for (let i = 0; i < 10; i++) { const x = -1.3 + r() * 2.6; c.beginPath(); c.moveTo(x, -8.4); c.quadraticCurveTo(x * 2 + (r() - 0.5) * 2, -4, x * 4.2 + (r() - 0.5) * 2, 0); c.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)'; c.lineWidth = 0.3 + r() * 0.4; c.stroke(); }
      speckle(c, 0, -3, 12, 7, 5, 60, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.35)']);
      moss(c, -3.6, -0.6, 4.5, 1.0, 22, ['#5a7a3a', '#7a9a48']); moss(c, 4.0, -0.5, 3.5, 0.9, 23, ['#5a7a3a', '#7a9a48']);
      c.restore();
      // the crater
      ellipse(c, 0, -8.55, 1.5, 0.42); c.fillStyle = '#120a08'; c.fill();
    },
    anim(c, d, t) {
      const s = d.st, g = 0.45 + 0.2 * Math.sin(t * 2.2 + d.uid) + (s.glow || 0);
      c.save(); c.globalCompositeOperation = 'lighter';
      // the glowing cracks
      c.strokeStyle = `rgba(255,${110 + g * 60},40,${0.35 + g * 0.4})`; c.lineWidth = 0.22; c.lineCap = 'round';
      for (const P of [[[0.3, -8.3], [0.9, -6.6], [0.5, -5.2], [1.6, -3.6]], [[-0.4, -8.2], [-1.2, -6.4], [-0.8, -5.0]], [[-1.4, -4.2], [-2.6, -2.4], [-2.2, -1.0]]]) {
        c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (const q of P) c.lineTo(q[0], q[1]); c.stroke();
      }
      ellipse(c, 0, -8.6, 1.4, 0.38); c.fillStyle = `rgba(255,${130 + g * 60},50,${0.5 + g * 0.4})`; c.fill();
      circle(c, 0, -8.8, 3.2 + g * 1.5); c.fillStyle = rg(c, 0, -8.8, 0, 0, -8.8, 3.2 + g * 1.5, [[0, `rgba(255,150,60,${0.25 * g})`], [1, 'rgba(255,150,60,0)']]); c.fill();
      c.restore();
    },
    bubbler: { x: 0, y: -8.8, rate: 5, spread: 0.9, rmin: 0.12, rmax: 0.38 },
    step(d, dt, api) {
      const s = d.st;
      s.glow = Math.max(0, (s.glow || 0) - dt * 0.6);
      s.next = (s.next ?? rand(6, 14)) - dt;
      if (s.next <= 0) { s.next = rand(14, 24); s.glow = 0.5; for (let i = 0; i < 12; i++) api.bubble(rand(-0.8, 0.8), -8.8 - rand(0, 2), rand(0.2, 0.5)); api.play('bubbles', 0.6); }
    },
    pois: [{ kind: 'ride', x: 0, y: -12, z: 0.45 }],
    tap(d, api) {
      d.st.glow = 1.4;
      for (let i = 0; i < 46; i++) api.bubble(rand(-1, 1), -8.8 - rand(0, 4), rand(0.2, 0.7));
      api.play('deco', 'volcano'); api.lift(0, -9, 7, 3.5);
    },
  });

  /* ---------------- Tin Rocket ---------------- */
  def({
    id: 'rocket', name: 'Tin Rocket', tier: 2, joy: 0.11, price: 1160, w: 8, h: 17,
    blurb: 'A clockwork tin rocket on its launch stand, portholes lit. Curious fish peek in at the windows. Tap it for a countdown and a roaring blast of bubbles (it never quite leaves the ground).',
    paint(c) {
      contact(c, 8);
      // the launch stand
      ellipse(c, 0, -0.45, 3.6, 0.62); c.fillStyle = lg(c, -3.6, 0, 3.6, 0, [[0, '#4a525a'], [0.4, '#9aa4ae'], [1, '#2e343a']]); c.fill();
      c.strokeStyle = '#3a4248'; c.lineWidth = 0.28;
      for (const x of [-2.6, 2.6]) { c.beginPath(); c.moveTo(x, -0.6); c.lineTo(x * 0.62, -3.0); c.stroke(); }
    },
    parts: {
      body: {
        w: 9, h: 17, ox: 4.5, oy: 16.2,
        paint(c) {
          // fins, behind and to the sides
          for (const sx of [-1, 1]) {
            c.beginPath(); c.moveTo(sx * 1.7, -6.0); c.quadraticCurveTo(sx * 3.9, -3.8, sx * 3.7, -1.0); c.lineTo(sx * 1.6, -2.8); c.closePath();
            c.fillStyle = lg(c, 0, -6, 0, -1, [[0, '#e8604a'], [1, '#8a2818']]); c.fill();
          }
          // the body: cream tin, round-shouldered, with a red nose cone
          c.beginPath(); c.moveTo(-1.8, -2.6); c.bezierCurveTo(-2.3, -6.5, -2.2, -11.0, -1.3, -13.0); c.quadraticCurveTo(0, -16.0, 1.3, -13.0); c.bezierCurveTo(2.2, -11.0, 2.3, -6.5, 1.8, -2.6); c.closePath();
          c.fillStyle = lg(c, -2.2, 0, 2.2, 0, [[0, '#a89a80'], [0.3, '#fff6e2'], [0.62, '#ecdcbc'], [1, '#7a6a50']]); c.fill();
          c.save(); c.clip();
          c.fillStyle = lg(c, -2.2, 0, 2.2, 0, [[0, '#8a2818'], [0.35, '#f0705a'], [1, '#6a1c10']]);
          c.fillRect(-3, -16.5, 6, 3.7);
          c.fillRect(-3, -5.0, 6, 0.9);
          // riveted seams
          c.fillStyle = 'rgba(80,60,40,0.55)';
          for (const y of [-12.6, -8.6, -4.2]) { c.fillRect(-3, y, 6, 0.08); for (let x = -1.8; x <= 1.8; x += 0.6) { circle(c, x, y - 0.18, 0.07); c.fill(); } }
          c.restore();
          // the centre fin, toward you
          c.beginPath(); c.moveTo(-0.22, -6.2); c.lineTo(-0.2, -1.2); c.lineTo(0.2, -1.2); c.lineTo(0.22, -6.2); c.closePath(); c.fillStyle = lg(c, -0.22, 0, 0.22, 0, [[0, '#f0705a'], [1, '#7a2414']]); c.fill();
          // the nozzle
          c.beginPath(); c.moveTo(-1.1, -2.7); c.lineTo(-1.35, -1.6); c.lineTo(1.35, -1.6); c.lineTo(1.1, -2.7); c.closePath(); c.fillStyle = lg(c, -1.35, 0, 1.35, 0, [[0, '#3a3e44'], [0.5, '#8a929c'], [1, '#2a2e34']]); c.fill();
          // portholes: brass rims and dark glass
          for (const y of [-10.4, -7.4]) {
            circle(c, 0, y, 0.95); c.fillStyle = lg(c, -1, y - 1, 1, y + 1, [[0, '#f6d888'], [1, '#8a6420']]); c.fill();
            circle(c, 0, y, 0.68); c.fillStyle = rg(c, -0.2, y - 0.25, 0, 0, y, 0.7, [[0, '#4a6a8a'], [1, '#0e1a28']]); c.fill();
          }
          // a little antenna on the nose
          c.strokeStyle = '#9aa4ae'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(0, -15.0); c.lineTo(0, -16.0); c.stroke();
          c.beginPath(); c.moveTo(-1.3, -12.6); c.bezierCurveTo(-1.9, -9, -1.9, -6, -1.5, -3.2); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.22; c.stroke();
        },
      },
    },
    anim(c, d, t) {
      const s = d.st, up = s.up || 0, sh = s.shake || 0;
      const jx = sh ? Math.sin(t * 61) * 0.12 * sh : 0, jy = -up * 1.6 + (sh ? Math.cos(t * 47) * 0.08 * sh : 0);
      // the jet: a cone of light and churning water under the nozzle
      if (s.thrust > 0) {
        c.save(); c.globalCompositeOperation = 'lighter';
        const L = 3 + s.thrust * 3;
        c.beginPath(); c.moveTo(-1.0 + jx, -1.7 + jy); c.lineTo(1.0 + jx, -1.7 + jy); c.lineTo(jx, -1.7 + jy + L); c.closePath();
        c.fillStyle = lg(c, 0, -1.7 + jy, 0, -1.7 + jy + L, [[0, `rgba(255,220,140,${0.8 * s.thrust})`], [1, 'rgba(255,140,60,0)']]); c.fill();
        c.restore();
      }
      d.part(c, 'body', jx, -0.8 + jy);
      // porthole lights: a warm glow, blinking through the countdown
      const blink = s.count > 0 ? (Math.sin(s.count * Math.PI * 4) > 0 ? 1 : 0.2) : 0.55 + 0.2 * Math.sin(t * 1.3 + d.uid);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const y of [-10.4, -7.4]) { circle(c, jx, y - 0.8 + jy, 1.6); c.fillStyle = rg(c, jx, y - 0.8 + jy, 0, jx, y - 0.8 + jy, 1.6, [[0, `rgba(255,220,130,${0.45 * blink})`], [1, 'rgba(255,220,130,0)']]); c.fill(); }
      circle(c, jx, -16.9 + jy, 0.7); c.fillStyle = `rgba(255,90,80,${0.5 + 0.5 * Math.sin(t * 4)})`; c.fill();
      c.restore();
    },
    step(d, dt, api) {
      const s = d.st;
      if (s.count > 0) { s.count -= dt; if (s.count <= 0) { s.thrust = 1; api.play('deco', 'rocketGo'); api.scare(0, -6, 12); } }
      if (s.thrust > 0) {
        s.thrust = Math.max(0, s.thrust - dt * 0.42); s.shake = s.thrust;
        s.up = Math.min(1, (s.up || 0) + dt * 2.2 * (s.thrust > 0.3 ? 1 : 0));
        if (Math.random() < dt * 60 * s.thrust) api.bubble(rand(-0.6, 0.6), -1.2, rand(0.2, 0.5));
        if (s.thrust < 0.05) setTimeout(() => api.attract(0, -9, 4), 400);
      } else s.up = Math.max(0, (s.up || 0) - dt * 0.8);
    },
    pois: [{ kind: 'gather', x: 1.6, y: -10, z: 0.3 }, { kind: 'hide', x: -2.4, y: -3, z: 0.92 }],
    tap(d, api) { if (d.st.count > 0 || d.st.thrust > 0) return; d.st.count = 1.6; api.play('deco', 'rocket'); },
  });

  /* ---------------- Windmill ---------------- */
  def({
    id: 'windmill', name: 'Windmill', tier: 2, joy: 0.115, price: 1240, w: 12, h: 18,
    blurb: 'A cosy windmill on a grassy knoll, its sails turned by a stream of bubbles. Playful fish ride the bubbles up through its sails. Tap it and the sails whirl.',
    paint(c) {
      contact(c, 12);
      // the knoll
      c.beginPath(); c.moveTo(-5.8, 0); c.quadraticCurveTo(-3.5, -2.4, 0, -2.3); c.quadraticCurveTo(3.5, -2.4, 5.8, 0); c.closePath();
      c.fillStyle = lg(c, 0, -2.4, 0, 0, [[0, '#6aa04a'], [1, '#3a6030']]); c.fill();
      speckle(c, 0, -1.2, 10, 1.8, 14, 40, ['#8ac860', '#4a7a36', '#e8e0a0']);
      // the tower: cream plaster, dark timbers, tapering up
      c.beginPath(); c.moveTo(-2.6, -1.8); c.lineTo(-1.7, -10.6); c.lineTo(1.7, -10.6); c.lineTo(2.6, -1.8); c.closePath();
      c.fillStyle = lg(c, -2.6, 0, 2.6, 0, [[0, '#a89880'], [0.35, '#f4ead2'], [0.7, '#e2d4b4'], [1, '#8a7a60']]); c.fill();
      c.save(); c.clip();
      c.strokeStyle = '#5a3e26'; c.lineWidth = 0.28;
      for (const y of [-4.6, -7.8]) { c.beginPath(); c.moveTo(-3, y); c.lineTo(3, y); c.stroke(); }
      c.beginPath(); c.moveTo(-2.1, -1.8); c.lineTo(-1.2, -4.6); c.moveTo(2.1, -1.8); c.lineTo(1.2, -4.6); c.moveTo(-1.9, -4.6); c.lineTo(-1.0, -7.8); c.moveTo(1.9, -4.6); c.lineTo(1.0, -7.8); c.stroke();
      c.restore();
      // a door and a window
      c.beginPath(); c.moveTo(-0.6, -1.8); c.lineTo(-0.6, -3.2); c.arc(0, -3.2, 0.6, Math.PI, 0); c.lineTo(0.6, -1.8); c.closePath(); c.fillStyle = '#4a2c16'; c.fill();
      c.fillStyle = '#ffd88a'; c.fillRect(-0.4, -6.6, 0.8, 0.8); c.strokeStyle = '#5a3e26'; c.lineWidth = 0.12; c.strokeRect(-0.4, -6.6, 0.8, 0.8);
      // the cap: a rounded thatch
      c.beginPath(); c.moveTo(-2.3, -10.4); c.quadraticCurveTo(-2.1, -13.4, 0, -13.6); c.quadraticCurveTo(2.1, -13.4, 2.3, -10.4); c.closePath();
      c.fillStyle = lg(c, -2.3, -13, 2.3, -10.4, [[0, '#d8b060'], [0.5, '#a87a38'], [1, '#5a3e18']]); c.fill();
      c.strokeStyle = 'rgba(80,50,20,0.4)'; c.lineWidth = 0.1;
      for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 0.5, -13.4); c.lineTo(i * 0.55, -10.5); c.stroke(); }
      // the bubble stone that drives the sails
      ellipse(c, 3.6, -0.45, 0.9, 0.42); c.fillStyle = rg(c, 3.4, -0.6, 0, 3.6, -0.45, 1, [[0, '#d8d4cc'], [1, '#6a665e']]); c.fill();
    },
    parts: {
      sails: {
        w: 12, h: 12, ox: 6, oy: 6,
        paint(c) {
          for (let i = 0; i < 4; i++) {
            c.save(); c.rotate(i * Math.PI / 2);
            c.fillStyle = '#5a3e26'; c.fillRect(-0.15, -5.6, 0.3, 5.6);
            // the lattice and a cloth
            c.fillStyle = 'rgba(244,232,206,0.88)'; c.fillRect(0.15, -5.5, 1.35, 4.4);
            c.strokeStyle = '#6a4a2e'; c.lineWidth = 0.08;
            for (let k = 0; k <= 5; k++) { c.beginPath(); c.moveTo(0.15, -1.1 - k * 0.88); c.lineTo(1.5, -1.1 - k * 0.88); c.stroke(); }
            c.strokeRect(0.15, -5.5, 1.35, 4.4);
            c.restore();
          }
          circle(c, 0, 0, 0.55); c.fillStyle = '#4a2c16'; c.fill(); circle(c, 0, 0, 0.22); c.fillStyle = '#d6a64a'; c.fill();
        },
      },
    },
    anim(c, d, t) { d.part(c, 'sails', 0, -11.4, d.st.ang || 0); },
    bubbler: { x: 3.6, y: -0.8, rate: 4, spread: 0.5, rmin: 0.1, rmax: 0.3 },
    step(d, dt) { const s = d.st; s.spin = Math.max(0, (s.spin || 0) - dt * 0.25); s.ang = (s.ang || d.uid) + dt * (0.35 + s.spin * 5); },
    pois: [{ kind: 'ride', x: 3.6, y: -8, z: 0.45 }, { kind: 'perch', x: -3.4, y: -6, z: 0.5 }],
    tap(d, api) { d.st.spin = 1; for (let i = 0; i < 24; i++) api.bubble(3.6 + rand(-0.5, 0.5), -1 - rand(0, 3), rand(0.12, 0.35)); api.play('deco', 'windmill'); },
  });

  /* stone courses for walls and towers (clip to the shape first) */
  function courses(c, x0, y0, x1, y1, rows, seed) {
    const r = rng(seed), h = (y1 - y0) / rows;
    c.strokeStyle = 'rgba(30,34,40,0.45)'; c.lineWidth = 0.1;
    for (let i = 0; i < rows; i++) {
      const y = y0 + i * h;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      for (let x = x0 + (i % 2) * 0.7; x < x1; x += 1.3 + r() * 0.5) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.stroke(); }
      for (let k = 0; k < 4; k++) { const bx = x0 + r() * (x1 - x0); c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)'; c.fillRect(bx, y + 0.05, 1.1, h - 0.1); }
    }
  }
  /* ---------------- Castle Keep ---------------- */
  def({
    id: 'castle', name: 'Castle Keep', tier: 3, joy: 0.14, price: 3400, w: 18, h: 17,
    blurb: 'A sunken castle with two round towers, slate roofs and pennants. Fish swim in through its gate and out the other side, and shy ones hide in a tower window. Tap it: the portcullis rises, the pennants fly, and a little parade swims through.',
    paint(c) {
      contact(c, 18, 0.5);
      // the mound it stands on
      c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(0, -2.2, 9, 0); c.closePath(); c.fillStyle = lg(c, 0, -2, 0, 0, [[0, '#7a7060'], [1, '#3a3428']]); c.fill();
      // the keep wall, with the gate cut through it
      c.save();
      c.beginPath(); c.rect(-5.4, -9.0, 10.8, 8.4);
      c.moveTo(-1.8, -0.6); c.lineTo(-1.8, -4.4); c.arc(0, -4.4, 1.8, Math.PI, 0, false); c.lineTo(1.8, -0.6); c.closePath();
      c.fillStyle = lg(c, -5.4, -9, 5.4, -0.6, [[0, '#b0aa9c'], [0.5, '#8a8476'], [1, '#4e4a42']]); c.fill('evenodd'); c.clip('evenodd');
      courses(c, -5.4, -9.0, 5.4, -0.6, 9, 31);
      moss(c, -3, -1.4, 4.5, 1.6, 32); moss(c, 3.5, -1.2, 3.5, 1.4, 33); moss(c, 1.5, -8.6, 3, 0.8, 34);
      c.restore();
      // battlements
      for (let x = -5.4; x < 5.3; x += 1.35) { c.fillStyle = lg(c, x, -10.2, x + 0.85, -9.0, [[0, '#b8b2a4'], [1, '#6a665c']]); c.fillRect(x, -10.1, 0.85, 1.15); }
      // the gate's dark passage
      c.beginPath(); c.moveTo(-1.8, -0.6); c.lineTo(-1.8, -4.4); c.arc(0, -4.4, 1.8, Math.PI, 0, false); c.lineTo(1.8, -0.6); c.closePath();
      c.fillStyle = rg(c, 0, -2.5, 0.2, 0, -2.5, 3.6, [[0, '#2a3a3a'], [1, '#080c10']]); c.fill();
      c.strokeStyle = '#6e6a5e'; c.lineWidth = 0.35; c.stroke();
      // the two towers
      for (const sx of [-1, 1]) {
        const cx = sx * 6.9;
        c.save();
        c.beginPath(); c.rect(cx - 1.9, -12.2, 3.8, 11.8); c.fillStyle = lg(c, cx - 1.9, 0, cx + 1.9, 0, [[0, '#5e5a50'], [0.35, '#bcb6a8'], [0.7, '#948e80'], [1, '#46423a']]); c.fill(); c.clip();
        courses(c, cx - 1.9, -12.2, cx + 1.9, -0.4, 12, 40 + sx);
        moss(c, cx, -0.9, 3.4, 1.2, 50 + sx);
        c.restore();
        // a rim of battlement and a slate cone of a roof
        c.fillStyle = '#9a9486'; c.fillRect(cx - 2.15, -12.6, 4.3, 0.55);
        c.beginPath(); c.moveTo(cx - 2.3, -12.5); c.lineTo(cx, -16.6); c.lineTo(cx + 2.3, -12.5); c.closePath();
        c.fillStyle = lg(c, cx - 2.3, 0, cx + 2.3, 0, [[0, '#2a3c60'], [0.4, '#5a7ab0'], [1, '#1c2a44']]); c.fill();
        c.strokeStyle = 'rgba(20,30,50,0.4)'; c.lineWidth = 0.08;
        for (let k = 1; k < 5; k++) { const y = -12.5 - k * 0.8, w = 2.3 * (1 - k * 0.8 / 4.1); c.beginPath(); c.moveTo(cx - w, y); c.lineTo(cx + w, y); c.stroke(); }
        c.strokeStyle = '#5a5248'; c.lineWidth = 0.14; c.beginPath(); c.moveTo(cx, -16.6); c.lineTo(cx, -17.4); c.stroke();
        // arrow slits, and an arched window
        c.fillStyle = '#10161c'; c.fillRect(cx - 0.12, -5.6, 0.24, 1.3); c.fillRect(cx - 0.12, -10.4, 0.24, 1.1);
      }
      c.beginPath(); c.moveTo(-7.5, -6.8); c.lineTo(-7.5, -7.9); c.arc(-6.9, -7.9, 0.6, Math.PI, 0); c.lineTo(-6.3, -6.8); c.closePath(); c.fillStyle = '#10161c'; c.fill();
      c.beginPath(); c.moveTo(6.3, -6.8); c.lineTo(6.3, -7.9); c.arc(6.9, -7.9, 0.6, Math.PI, 0); c.lineTo(7.5, -6.8); c.closePath(); c.fillStyle = '#ffd88a'; c.fill();
      // a ribbon of weed up one tower
      c.strokeStyle = 'rgba(80,140,70,0.8)'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(-8.4, -0.4); c.bezierCurveTo(-9, -3, -7.6, -5, -8.6, -7.6); c.stroke();
    },
    parts: {
      gate: {
        w: 4, h: 6, ox: 2, oy: 5.8,
        paint(c) {
          c.strokeStyle = '#3a3026'; c.lineWidth = 0.22;
          for (let x = -1.5; x <= 1.5; x += 0.5) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, -5.6); c.stroke(); }
          for (let y = -0.6; y > -5.6; y -= 0.7) { c.beginPath(); c.moveTo(-1.7, y); c.lineTo(1.7, y); c.stroke(); }
          c.fillStyle = '#3a3026'; for (let x = -1.5; x <= 1.5; x += 0.5) { c.beginPath(); c.moveTo(x - 0.12, 0); c.lineTo(x, 0.35); c.lineTo(x + 0.12, 0); c.fill(); }
        },
      },
    },
    anim(c, d, t) {
      const s = d.st, up = s.gate || 0, fly = 1 + (s.flag || 0) * 2.5;
      // the portcullis, clipped to the gateway, rising into the wall
      c.save(); c.beginPath(); c.moveTo(-1.8, -0.6); c.lineTo(-1.8, -4.4); c.arc(0, -4.4, 1.8, Math.PI, 0, false); c.lineTo(1.8, -0.6); c.closePath(); c.clip();
      d.part(c, 'gate', 0, -0.6 - up * 5.4);
      c.restore();
      // pennants streaming from each roof
      for (const sx of [-1, 1]) {
        const x0 = sx * 6.9, y0 = -17.3;
        c.beginPath(); c.moveTo(x0, y0);
        for (let k = 1; k <= 6; k++) c.lineTo(x0 + k * 0.42, y0 + 0.25 * k * 0.15 + Math.sin(t * 3 * fly + k * 0.9 + sx) * 0.12 * k * 0.5);
        for (let k = 6; k >= 0; k--) c.lineTo(x0 + k * 0.42 * 0.9, y0 + 0.7 - k * 0.07 + Math.sin(t * 3 * fly + k * 0.9 + sx) * 0.12 * k * 0.5);
        c.closePath(); c.fillStyle = sx < 0 ? '#d8402a' : '#e8b83a'; c.fill();
      }
      // the lit window glows
      c.save(); c.globalCompositeOperation = 'lighter';
      circle(c, 6.9, -7.4, 1.8); c.fillStyle = rg(c, 6.9, -7.4, 0, 6.9, -7.4, 1.8, [[0, 'rgba(255,210,120,0.3)'], [1, 'rgba(255,210,120,0)']]); c.fill();
      c.restore();
    },
    step(d, dt, api) {
      const s = d.st;
      s.flag = Math.max(0, (s.flag || 0) - dt * 0.2);
      if (s.openT > 0) { s.openT -= dt; s.gate = Math.min(1, (s.gate || 0) + dt * 0.8); } else s.gate = Math.max(0, (s.gate || 0) - dt * 0.5);
    },
    pois: [
      { kind: 'through', path: [[-13, -2.6], [0, -2.4], [13, -2.2]], z0: 0.8, z1: 0.25 },
      { kind: 'hide', x: -6.9, y: -7.3, z: 0.92 },
      { kind: 'perch', x: 0, y: -12, z: 0.5 },
    ],
    tap(d, api) { const s = d.st; s.openT = 7; s.flag = 1; api.play('deco', 'castle'); setTimeout(() => api.procession(api.poi('through'), 3), 900); },
  });

  /* ---------------- Lighthouse ---------------- */
  def({
    id: 'lighthouse', name: 'Lighthouse', tier: 3, joy: 0.145, price: 3800, w: 9, h: 22,
    blurb: 'A striped lighthouse on its rocks, its beam sweeping slowly through the water. Fish that glow gather in its light. Tap it: the lamp flares, the foghorn sounds, and every fish turns to look.',
    paint(c) {
      contact(c, 9, 0.5);
      // rocks at its foot
      for (const [x, y, rx, ry, col] of [[-2.6, -0.9, 2.1, 1.3, '#5e5a52'], [2.4, -0.8, 2.2, 1.2, '#6a665c'], [0, -1.4, 2.6, 1.4, '#7a766a']]) {
        ellipse(c, x, y, rx, ry); c.fillStyle = rg(c, x - rx * 0.4, y - ry * 0.5, 0, x, y, rx * 1.2, [[0, mixc(col, '#ffffff', 0.3)], [0.6, col], [1, mixc(col, '#000000', 0.5)]]); c.fill();
      }
      moss(c, 0, -1.6, 6, 1.0, 61);
      // the tower: white with red bands, tapering
      c.save();
      c.beginPath(); c.moveTo(-2.2, -2.2); c.lineTo(-1.45, -15.4); c.lineTo(1.45, -15.4); c.lineTo(2.2, -2.2); c.closePath();
      c.fillStyle = '#f4f0e6'; c.fill(); c.clip();
      for (const y of [-5.6, -9.6, -13.4]) { c.fillStyle = '#c8402e'; c.fillRect(-3, y, 6, 1.9); }
      c.fillStyle = lg(c, -2.2, 0, 2.2, 0, [[0, 'rgba(0,0,0,0.4)'], [0.3, 'rgba(255,255,255,0.15)'], [0.65, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]); c.fillRect(-3, -16, 6, 14);
      c.restore();
      // a door and two little windows
      c.beginPath(); c.moveTo(-0.55, -2.2); c.lineTo(-0.55, -3.5); c.arc(0, -3.5, 0.55, Math.PI, 0); c.lineTo(0.55, -2.2); c.closePath(); c.fillStyle = '#3a2a1e'; c.fill();
      c.fillStyle = '#ffd88a'; c.fillRect(-0.25, -8.4, 0.5, 0.7); c.fillRect(-0.22, -12.2, 0.44, 0.6);
      // the gallery and its railing
      ellipse(c, 0, -15.5, 2.3, 0.45); c.fillStyle = '#2e3238'; c.fill();
      c.strokeStyle = '#2e3238'; c.lineWidth = 0.1;
      for (let x = -2.1; x <= 2.1; x += 0.6) { c.beginPath(); c.moveTo(x, -15.5); c.lineTo(x, -16.4); c.stroke(); }
      c.beginPath(); c.moveTo(-2.15, -16.4); c.lineTo(2.15, -16.4); c.stroke();
      // the lantern room's frame and the red dome
      c.strokeStyle = '#2e3238'; c.lineWidth = 0.18; c.strokeRect(-1.2, -18.6, 2.4, 2.8);
      c.beginPath(); c.moveTo(0, -18.6); c.lineTo(0, -15.8); c.stroke();
      c.beginPath(); c.moveTo(-1.55, -18.5); c.quadraticCurveTo(0, -21.0, 1.55, -18.5); c.closePath(); c.fillStyle = lg(c, -1.5, 0, 1.5, 0, [[0, '#7a1c10'], [0.4, '#e0503a'], [1, '#5a140a']]); c.fill();
      c.strokeStyle = '#2e3238'; c.lineWidth = 0.12; c.beginPath(); c.moveTo(0, -20.2); c.lineTo(0, -21.4); c.stroke();
      circle(c, 0, -21.5, 0.2); c.fillStyle = '#d6a64a'; c.fill();
    },
    anim(c, d, t) {
      const s = d.st, g = 0.7 + 0.1 * Math.sin(t * 2 + d.uid) + (s.flash || 0) * 0.8;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,240,190,${0.5 + 0.3 * g})`; c.fillRect(-1.1, -18.5, 2.2, 2.6);
      circle(c, 0, -17.2, 3.2 + g * 1.4); c.fillStyle = rg(c, 0, -17.2, 0, 0, -17.2, 3.2 + g * 1.4, [[0, `rgba(255,236,170,${0.5 * g})`], [1, 'rgba(255,236,170,0)']]); c.fill();
      c.restore();
    },
    // the beam, drawn over the fish: two soft cones turning slowly, foreshortened as they swing toward you
    fx(c, d, t, sc) {
      const s = d.st, a = (t * 0.45 + d.uid) % TAU, g = 0.08 + (s.flash || 0) * 0.16;
      const len = sc && sc.preview ? 10 : 70;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const side of [0, Math.PI]) {
        const ang = a + side, k = Math.cos(ang), dir = Math.sign(k) || 1, L = len * Math.abs(k) + 2;
        const spread = 0.16 + 0.12 * (1 - Math.abs(k));
        c.beginPath(); c.moveTo(0, -17.2);
        c.lineTo(dir * L, -17.2 - L * spread); c.lineTo(dir * L, -17.2 + L * spread); c.closePath();
        c.fillStyle = lg(c, 0, -17.2, dir * L, -17.2, [[0, `rgba(255,244,200,${g * (0.4 + 0.6 * Math.abs(k))})`], [1, 'rgba(255,244,200,0)']]); c.fill();
      }
      c.restore();
    },
    step(d, dt) { d.st.flash = Math.max(0, (d.st.flash || 0) - dt * 0.7); },
    pois: [{ kind: 'glow', x: 3.5, y: -17, z: 0.4 }, { kind: 'hide', x: 2.6, y: -1.5, z: 0.92 }],
    tap(d, api) { d.st.flash = 1; api.play('deco', 'lighthouse'); api.look(0, -17, 2.6); },
  });

  /* ---------------- Carousel ---------------- */
  const HORSES = [['#f08a6a', '#b8402a'], ['#6ad0c8', '#2a8a86'], ['#f2c65a', '#b8862a']];
  function seahorse(col, dark) {
    return {
      w: 3, h: 4, ox: 1.5, oy: 2.2,
      paint(c) {
        // a carousel seahorse: arched neck, snout, curled tail
        c.beginPath(); c.moveTo(0.4, -1.8); c.quadraticCurveTo(1.3, -1.9, 1.35, -1.4); c.lineTo(0.75, -1.25); c.quadraticCurveTo(0.9, -0.6, 0.4, 0.1);
        c.quadraticCurveTo(0.6, 0.9, 0.0, 1.3); c.quadraticCurveTo(-0.7, 1.5, -0.6, 0.9); c.quadraticCurveTo(-0.5, 0.6, -0.15, 0.75);
        c.quadraticCurveTo(-0.6, 0.1, -0.4, -0.8); c.quadraticCurveTo(-0.3, -1.6, 0.4, -1.8); c.closePath();
        c.fillStyle = lg(c, -0.6, -1.8, 0.9, 1.3, [[0, col], [1, dark]]); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.08; c.stroke();
        // a mane of fins and a saddle
        c.fillStyle = dark; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-0.38 - i * 0.02, -1.0 + i * 0.35); c.lineTo(-0.8, -0.9 + i * 0.35); c.lineTo(-0.35, -0.8 + i * 0.35); c.fill(); }
        c.fillStyle = '#d6a64a'; c.fillRect(-0.35, -0.45, 0.8, 0.22);
        circle(c, 0.75, -1.55, 0.09); c.fillStyle = '#1a1a1a'; c.fill();
      },
    };
  }
  def({
    id: 'carousel', name: 'Carousel', tier: 3, joy: 0.15, price: 4200, w: 14, h: 15,
    blurb: 'A little carousel of painted seahorses under a striped canopy, turning slowly with lights along its edge. Fish circle it, and real seahorses love it. Tap it: it spins up to a music-box tune and the fish around it twirl.',
    paint(c) {
      contact(c, 14, 0.45);
      // the platform and its striped skirt
      c.beginPath(); c.ellipse(0, -1.5, 6.3, 1.25, 0, 0, Math.PI); c.lineTo(-6.3, -0.2); c.ellipse(0, -0.2, 6.3, 1.25, 0, Math.PI, 0, true); c.closePath();
      c.save(); c.clip();
      for (let i = 0; i < 16; i++) { const x = -6.3 + i * 0.8; c.fillStyle = i % 2 ? '#f4ead6' : '#c8402e'; c.fillRect(x, -3, 0.8, 4); }
      c.fillStyle = lg(c, -6.3, 0, 6.3, 0, [[0, 'rgba(0,0,0,0.45)'], [0.35, 'rgba(255,255,255,0.1)'], [1, 'rgba(0,0,0,0.5)']]); c.fillRect(-6.4, -3, 12.8, 4);
      c.restore();
      ellipse(c, 0, -1.5, 6.3, 1.25); c.fillStyle = lg(c, 0, -2.7, 0, -0.3, [[0, '#d8c8a8'], [1, '#8a7a5a']]); c.fill();
      ellipse(c, 0, -1.5, 6.3, 1.25); c.strokeStyle = '#d6a64a'; c.lineWidth = 0.2; c.stroke();
      // the canopy: striped wedges to a finial, with a scalloped valance
      const N = 12;
      for (let i = 0; i < N; i++) {
        const x0 = -6.6 + (i / N) * 13.2, x1 = -6.6 + ((i + 1) / N) * 13.2;
        c.beginPath(); c.moveTo(0, -13.6); c.lineTo(x0, -10.0); c.lineTo(x1, -10.0); c.closePath();
        c.fillStyle = i % 2 ? '#f6eedc' : '#c8402e'; c.fill();
      }
      c.beginPath(); c.moveTo(0, -13.6); c.lineTo(-6.6, -10.0); c.lineTo(6.6, -10.0); c.closePath();
      c.fillStyle = lg(c, -6.6, 0, 6.6, 0, [[0, 'rgba(0,0,0,0.35)'], [0.4, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.4)']]); c.fill();
      for (let i = 0; i < N; i++) {
        const x = -6.6 + (i + 0.5) / N * 13.2;
        c.beginPath(); c.arc(x, -10.0, 0.55, 0, Math.PI); c.fillStyle = i % 2 ? '#c8402e' : '#f6eedc'; c.fill();
      }
      c.fillStyle = '#d6a64a'; c.fillRect(-6.7, -10.25, 13.4, 0.3);
      c.strokeStyle = '#d6a64a'; c.lineWidth = 0.14; c.beginPath(); c.moveTo(0, -13.6); c.lineTo(0, -14.6); c.stroke();
      c.beginPath(); c.moveTo(0, -14.6); c.lineTo(1.2, -14.25); c.lineTo(0, -13.9); c.closePath(); c.fillStyle = '#e8b83a'; c.fill();
    },
    parts: { h0: seahorse(...HORSES[0]), h1: seahorse(...HORSES[1]), h2: seahorse(...HORSES[2]) },
    anim(c, d, t) {
      const s = d.st, a0 = s.ang || 0;
      // the figures go round: those behind the pole first, smaller and dimmer
      const figs = [0, 1, 2].map(i => { const a = a0 + i * TAU / 3; return { i, a, x: Math.sin(a) * 4.6, z: Math.cos(a) }; }).sort((p, q) => p.z - q.z);
      const drawFig = f => {
        const sc = 0.85 + 0.15 * f.z, y = -5.4 + Math.sin(f.a * 2 + t * 0.5) * 0.45, dir = Math.cos(f.a) >= 0 ? 1 : -1;
        c.strokeStyle = '#d6a64a'; c.lineWidth = 0.16 * sc; c.beginPath(); c.moveTo(f.x, -9.9); c.lineTo(f.x, -1.6 - f.z * 0.6); c.stroke();
        c.save(); if (f.z < 0) c.globalAlpha = 0.75;
        d.part(c, 'h' + f.i, f.x, y, 0, dir * sc * 1.1, sc * 1.1);
        c.restore();
      };
      for (const f of figs) if (f.z < 0) drawFig(f);
      // the centre pole, gold
      c.fillStyle = lg(c, -0.35, 0, 0.35, 0, [[0, '#8a6420'], [0.4, '#ffe8a0'], [1, '#7a5418']]); c.fillRect(-0.35, -10.0, 0.7, 8.6);
      for (const f of figs) if (f.z >= 0) drawFig(f);
      // lights twinkling along the valance
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const x = -6.1 + i * 1.11, on = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7 + (s.spin || 0) * t * 4);
        circle(c, x, -9.55, 0.42); c.fillStyle = `rgba(255,230,150,${0.25 + on * 0.5})`; c.fill();
      }
      c.restore();
    },
    step(d, dt) { const s = d.st; s.spin = Math.max(0, (s.spin || 0) - dt * 0.12); s.ang = (s.ang || d.uid) + dt * (0.3 + s.spin * 2.6); },
    pois: [{ kind: 'gather', x: 0, y: -6, z: 0.35 }, { kind: 'perch', x: 6.2, y: -7, z: 0.4 }, { kind: 'perch', x: -6.2, y: -6, z: 0.6 }],
    tap(d, api) { d.st.spin = 1; api.play('deco', 'carousel'); api.twirl(0, -6, 18); api.attract(0, -6, 5); },
  });

  /* ---------------- Sleeping Stone Giant ---------------- */
  def({
    id: 'giant', name: 'Sleeping Stone Giant', tier: 3, joy: 0.155, price: 4600, w: 18, h: 11,
    blurb: 'The great mossy head of a stone giant, half sunk in the sand and fast asleep, breathing slow bubbles. Shy fish hide behind it and foragers graze its moss. Tap it: it opens its eyes, yawns, and blows a ring for the playful to chase.',
    paint(c) {
      contact(c, 18, 0.55);
      // the head: a broad dome of weathered stone
      c.beginPath(); c.moveTo(-8.8, 0); c.bezierCurveTo(-9.2, -6.2, -6.0, -10.8, 0, -10.9); c.bezierCurveTo(6.0, -10.8, 9.2, -6.2, 8.8, 0); c.closePath();
      c.fillStyle = rg(c, -2.6, -8.4, 0.5, 0, -4, 10, [[0, '#b4b2a4'], [0.45, '#8a887a'], [0.85, '#545246'], [1, '#2e2c26']]); c.fill();
      c.save(); c.clip();
      const r = rng(77);
      // cracks and pits
      c.strokeStyle = 'rgba(30,30,24,0.45)'; c.lineWidth = 0.12;
      for (let i = 0; i < 6; i++) { let x = -7 + r() * 14, y = -9 + r() * 6; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 2; y += r() * 1.5; c.lineTo(x, y); } c.stroke(); }
      speckle(c, 0, -5, 17, 10, 78, 70, ['rgba(255,255,255,0.1)', 'rgba(0,0,0,0.25)', 'rgba(220,220,190,0.25)']);
      // moss over the crown and down the cheeks
      moss(c, -2, -10, 10, 2.2, 79); moss(c, -6.8, -3, 3, 4, 80); moss(c, 6.6, -2.5, 3, 4, 81);
      // the eyes sunk in soft hollows under the brow
      for (const sx of [-1, 1]) { ellipse(c, sx * 3.2, -5.9, 2.4, 1.4); c.fillStyle = rg(c, sx * 3.2, -5.9, 0, sx * 3.2, -5.9, 2.4, [[0, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]); c.fill(); }
      c.restore();
      // the nose: a broad wedge, lit on one side
      c.beginPath(); c.moveTo(-0.6, -6.0); c.lineTo(-1.6, -3.0); c.quadraticCurveTo(0, -2.4, 1.6, -3.0); c.lineTo(0.6, -6.0); c.closePath();
      c.fillStyle = lg(c, -1.6, 0, 1.6, 0, [[0, '#c4c2b4'], [0.5, '#8a887a'], [1, '#3e3c34']]); c.fill();
      for (const sx of [-1, 1]) { ellipse(c, sx * 0.75, -3.0, 0.35, 0.18); c.fillStyle = '#1c1c18'; c.fill(); }
      // a starfish on the brow and a sprig of coral on the crown
      c.save(); c.translate(-4.4, -8.4); c.rotate(0.3);
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.32 : 0.85; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath();
      c.fillStyle = '#f0884a'; c.fill(); c.restore();
      c.strokeStyle = '#e86a8a'; c.lineWidth = 0.28; c.lineCap = 'round';
      c.beginPath(); c.moveTo(3.2, -10.5); c.lineTo(3.0, -12.0); c.moveTo(3.1, -11.2); c.lineTo(3.8, -11.9); c.moveTo(3.0, -11.6); c.lineTo(2.4, -12.3); c.stroke();
    },
    anim(c, d, t) {
      const s = d.st, eye = s.eye || 0, yawn = s.yawn || 0;
      // eyes: closed lids with a line of lashes, or open and glowing softly
      for (const sx of [-1, 1]) {
        const ex = sx * 3.2, ey = -6.0;
        if (eye > 0.05) {
          ellipse(c, ex, ey, 1.2, 0.55 * eye); c.fillStyle = '#1a2422'; c.fill();
          c.save(); c.globalCompositeOperation = 'lighter';
          ellipse(c, ex, ey, 0.55, 0.42 * eye); c.fillStyle = `rgba(140,255,220,${0.8 * eye})`; c.fill();
          circle(c, ex, ey, 2.2); c.fillStyle = rg(c, ex, ey, 0, ex, ey, 2.2, [[0, `rgba(140,255,220,${0.3 * eye})`], [1, 'rgba(140,255,220,0)']]); c.fill();
          c.restore();
        }
        c.beginPath(); c.moveTo(ex - 1.3, ey); c.quadraticCurveTo(ex, ey + 0.75 - eye * 1.4, ex + 1.3, ey);
        c.strokeStyle = 'rgba(30,30,24,0.75)'; c.lineWidth = 0.22; c.stroke();
      }
      // the mouth: a closed seam, opening into a yawn
      c.beginPath(); c.moveTo(-2.2, -1.5); c.quadraticCurveTo(0, -1.0 + yawn * 0.4, 2.2, -1.5);
      if (yawn > 0.02) { c.quadraticCurveTo(0, -1.4 + yawn * 1.8, -2.2, -1.5); c.fillStyle = '#100e0c'; c.fill(); }
      c.strokeStyle = 'rgba(30,30,24,0.8)'; c.lineWidth = 0.24; c.stroke();
    },
    step(d, dt, api) {
      const s = d.st;
      if (s.wake > 0) {
        s.wake -= dt;
        const k = 5 - s.wake;
        s.eye = clamp(k / 0.5, 0, 1) * clamp(s.wake / 0.8, 0, 1);
        s.yawn = clamp((k - 0.8) / 0.7, 0, 1) * clamp((2.8 - k) / 0.6, 0, 1);
        if (k > 1.6 && !s.blew) { s.blew = true; api.ring(0, -1.4, Math.random() < 0.5 ? -1 : 1); for (let i = 0; i < 10; i++) api.bubble(rand(-1.5, 1.5), -1.6, rand(0.15, 0.4)); }
      } else { s.eye = 0; s.yawn = 0; }
      // it breathes in its sleep: every few seconds a few bubbles from the nose
      s.br = (s.br ?? rand(2, 7)) - dt;
      if (s.br <= 0) { s.br = rand(6, 10); for (let i = 0; i < 3; i++) api.bubble(rand(-0.9, 0.9), -3.1, rand(0.12, 0.25)); }
    },
    pois: [{ kind: 'hide', x: 6.5, y: -4, z: 0.93 }, { kind: 'nibble', x: -4, y: -10.4, z: 0.4 }, { kind: 'ring', x: 0, y: -4, z: 0.4 }],
    tap(d, api) { const s = d.st; if (s.wake > 0) return; s.wake = 5; s.blew = false; api.play('deco', 'giant'); },
  });

  /* ======================================================================
     Placing decorations in a tank: slots on the sand, in two rows, as starting places
     ====================================================================== */
  // per tank, in order of preference: [u across the inside, row ('b' back, 'f' front), room (fraction of the width)]
  // the grander tanks are bigger aquariums: their pieces stand a little smaller in them
  const SCALE = { reef: 1, wreck: 0.9, palace: 0.85 };
  const SLOTS = {
    bowl: [[0.34, 'f', 0.2], [0.6, 'b', 0.16]],
    reed: [[0.64, 'f', 0.12], [0.3, 'b', 0.14], [0.75, 'b', 0.1]],
    lily: [[0.13, 'f', 0.11], [0.88, 'f', 0.11], [0.49, 'b', 0.14], [0.22, 'b', 0.1]],
    reef: [[0.51, 'f', 0.1], [0.2, 'f', 0.1], [0.34, 'b', 0.1], [0.69, 'b', 0.1], [0.95, 'b', 0.08], [0.56, 'b', 0.08]],
    wreck: [[0.24, 'f', 0.09], [0.45, 'f', 0.1], [0.68, 'f', 0.1], [0.84, 'f', 0.1], [0.37, 'b', 0.08], [0.1, 'b', 0.1], [0.95, 'f', 0.08], [0.56, 'b', 0.08]],
    // starting places: each piece then slides to clear sand (see install)
    palace: [[0.5, 'f', 0.1], [0.16, 'f', 0.1], [0.75, 'f', 0.1], [0.27, 'b', 0.08], [0.71, 'b', 0.07], [0.82, 'b', 0.07], [0.93, 'b', 0.07], [0.33, 'f', 0.05], [0.97, 'f', 0.045], [0.215, 'b', 0.05]],
  };
  const CAP = Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, v.length]));

  /* How much a tank's decorations please its fish: each piece's joy, the second and later copies of the
     same piece at half. */
  function joyOf(ids) {
    const seen = {};
    let j = 0;
    for (const id of ids) { const D = DEF[id]; if (!D) continue; j += D.joy * (seen[id] ? 0.5 : 1); seen[id] = 1; }
    return j;
  }

  /* ---------------- sprites ---------------- */
  const cache = new Map();
  function sprite(key, w, h, ox, oy, k, paint, tint) {
    let s = cache.get(key);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
    const x = c.getContext('2d');
    x.setTransform(k, 0, 0, k, ox * k, oy * k);
    x.lineJoin = 'round';
    paint(x);
    if (tint) { x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height); }
    s = { c, w, h, ox, oy };
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    cache.set(key, s);
    return s;
  }
  const PAD = 3;
  function baseSprite(D, kpx, tint) {
    return sprite(`${D.id}|b|${Math.round(kpx * 10)}|${tint || ''}`, D.w + PAD * 2, D.h + PAD * 2, D.w / 2 + PAD, D.h + PAD, kpx, c => D.paint(c), tint);
  }
  function partSprite(D, name, kpx, tint) {
    const P = D.parts[name];
    return sprite(`${D.id}|${name}|${Math.round(kpx * 10)}|${tint || ''}`, P.w, P.h, P.ox, P.oy, kpx, c => P.paint(c), tint);
  }

  /* An installed decoration: where it stands, how big, and what it is doing. */
  function make(rec, D, x, y, k, row, dpr, tint) {
    const d = { uid: rec.uid, id: D.id, D, x, y, k, row, st: {}, dpr, tint };
    // draw one of its parts, in its units: at (px, py), turned by rot, scaled by sx, sy
    d.part = (c, name, px, py, rot = 0, sx = 1, sy = 1) => {
      const S = partSprite(D, name, k * dpr, tint);
      c.save(); c.translate(px, py); if (rot) c.rotate(rot); if (sx !== 1 || sy !== 1) c.scale(sx, sy);
      c.drawImage(S.c, -S.ox, -S.oy, S.w, S.h);
      c.restore();
    };
    return d;
  }

  /* A piece's outline, two cells to a unit: what of it is solid, sails and canopy included, so that
     placing pieces can look at their real shapes rather than their boxes. */
  const SIL = new Map();
  function silhouette(D) {
    let m = SIL.get(D.id);
    if (m) return m;
    const R = 2, W = Math.ceil((D.w + PAD * 2) * R), H = Math.ceil((D.h + PAD * 2) * R);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.scale(R, R); x.translate(D.w / 2 + PAD, D.h + PAD);
    D.paint(x);
    if (D.anim) { try { D.anim(x, make({ uid: 0 }, D, 0, 0, 1, 'f', R, null), 0); } catch (e) { /* the base alone will do */ } }
    const a = x.getImageData(0, 0, W, H).data, bits = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bits[i] = a[i * 4 + 3] > 90 ? 1 : 0;
    m = { R, W, H, ox: (D.w / 2 + PAD) * R, oy: (D.h + PAD) * R, bits };
    SIL.set(D.id, m);
    return m;
  }

  /* Where a decoration may stand. Two coarse grids over the scene, one cell every 4 pixels: 'hard' for
     what a piece must never cover (the things in the tank you can tap, the swim-throughs, the plants
     standing in front), 'soft' for the rest of the tank's own decor, read from its pixels, which a
     piece would rather not stand in front of but may. */
  function keepOut(sc) {
    const C = 4, gw = Math.ceil(sc.W / C), gh = Math.ceil(sc.H / C), soft = new Uint8Array(gw * gh), hard = new Uint8Array(gw * gh);
    if (sc.mid) {
      const c = document.createElement('canvas'); c.width = gw; c.height = gh;
      const x = c.getContext('2d'); x.drawImage(sc.mid, 0, 0, gw, gh);
      const d = x.getImageData(0, 0, gw, gh).data;
      for (let i = 0; i < gw * gh; i++) if (d[i * 4 + 3] > 50) soft[i] = 1;
    }
    const U = sc.U, rect = (x0, y0, x1, y1) => {
      for (let gy = Math.max(0, Math.floor(y0 / C)); gy <= Math.min(gh - 1, Math.floor(y1 / C)); gy++)
        for (let gx = Math.max(0, Math.floor(x0 / C)); gx <= Math.min(gw - 1, Math.floor(x1 / C)); gx++) hard[gy * gw + gx] = 1;
    };
    const box = (o, hw, up, down = U) => o && rect(o.x - hw, o.y - up, o.x + hw, o.y + down);
    if (sc.log) rect(sc.log.x0, sc.log.y - sc.log.r, sc.log.x1, sc.log.y + sc.log.r);
    if (sc.stone) box(sc.stone, U * 4, U * 3);
    if (sc.anem) box(sc.anem, sc.anem.R * 0.9, sc.anem.R * 1.1);
    if (sc.clam) box(sc.clam, sc.clam.w * 0.6, sc.clam.w * 0.7);
    if (sc.chest) box(sc.chest, sc.chest.w * 0.6, sc.chest.w * 0.8);
    if (sc.helmet) box(sc.helmet, sc.helmet.r * 1.2, sc.helmet.r * 1.3, sc.helmet.r);
    if (sc.anchor) box(sc.anchor, U * 4, U * 9);
    if (sc.bell) box(sc.bell, U * 2, 0, U * 5.5);
    if (sc.stoneLamp) box(sc.stoneLamp, U * 2.5, U * 3, U * 6);
    // the dragon itself, not its plinth: a short piece may stand before that
    if (sc.dragon) box({ x: sc.dragon.x + sc.dragon.k * 0.2, y: sc.dragon.base - sc.dragon.k * 0.9 }, sc.dragon.k * 1.5, sc.dragon.k * 3, 0);
    for (const g of sc.geodes || []) box(g, g.s * 1.45, g.s * 2.5, g.s * 0.6);
    for (const st of sc.stars || []) if (st.r) box(st, st.r * 1.4, st.r * 1.4, st.r * 1.4);
    for (const b of sc.balls || []) box({ x: b.x, y: sc.floor(b.x) }, b.r * 1.15, b.r * 2.1, U * 0.5);
    // swim-throughs stay open: the palace gate's ring, the upper part of the lily arch's passage (a small
    // piece may sit beneath)
    if (sc.gate) rect(sc.gate.cx - sc.gate.Ri * 0.75, sc.gate.cy - sc.gate.Ri * 0.3, sc.gate.cx + sc.gate.Ri * 0.75, sc.gate.cy + sc.gate.Ri * 0.4);
    if (sc.arch) { const fl = sc.floor((sc.arch.x0 + sc.arch.x1) / 2); rect(sc.arch.x0 + U * 2, sc.arch.top, sc.arch.x1 - U * 2, sc.arch.top + (fl - sc.arch.top) * 0.55); }
    // plants: those in front of the decorations along their whole length; those among them only at the
    // top (the bowl's stems) or their lantern (the palace's), so a piece may stand before a stem
    for (const s of sc.strands || []) {
      if (s.layer === 'front') rect(s.x - s.w * 2.5, s.y - s.len, s.x + s.w * 2.5, s.y + U);
      else if (s.kind === 'lantern') rect(s.x - U * 3.5, s.y - s.len - U * 3.5, s.x + U * 3.5, s.y - s.len + U * 3.5);
      else if (s.layer === 'mid') rect(s.x - s.w * 2.5 - U, s.y - s.len - U * 2, s.x + s.w * 2.5 + U, s.y - s.len * 0.6);
    }
    const frac = (g, x0, y0, x1, y1) => {
      let n = 0, hit = 0;
      for (let gy = Math.max(0, Math.floor(y0 / C)); gy <= Math.min(gh - 1, Math.floor(y1 / C)); gy++)
        for (let gx = Math.max(0, Math.floor(x0 / C)); gx <= Math.min(gw - 1, Math.floor(x1 / C)); gx++) { n++; hit += g[gy * gw + gx]; }
      return n ? hit / n : 0;
    };
    const occ = (x0, y0, x1, y1) => ({ hard: frac(hard, x0, y0, x1, y1), soft: frac(soft, x0, y0, x1, y1) });
    occ.grid = { hard, soft, gw, gh, C };
    return occ;
  }

  /* Lay out this tank's decorations. Tall pieces take the back row, short ones the front; the biggest
     go first, each from the roomiest slot left in its row, sliding along the sand (by its real outline)
     to the nearest spot where it covers none of the tank's things to touch, little of the rest of its
     scenery, and hides no other piece, nor is hidden. Every decoration is drawn in front of the tank's
     own decor; the back row is a little smaller and set further back on the sand. Adds their places
     for fish and their bubble streams to the scene. */
  function install(sc, recs) {
    uninstall(sc);
    const slots = (SLOTS[sc.id] || []).map((s, i) => ({ u: s[0], row: s[1], room: s[2], i }));
    const list = recs.filter(r => DEF[r.id]).slice(0, slots.length);
    // the tallest pieces stand at the back, the shortest in front of them, so that both are seen
    const used = slots.slice(0, list.length), nb = used.filter(s => s.row === 'b').length;
    const rowOf = new Map(list.slice().sort((a, b) => DEF[b.id].h - DEF[a.id].h || a.uid - b.uid).map((r, i) => [r.uid, i < nb ? 'b' : 'f']));
    const pool = { b: [], f: [] };
    for (const s of used.slice().sort((a, b) => b.room - a.room || a.i - b.i)) pool[s.row].push(s);
    // the biggest are placed first, each starting from the roomiest slot left in its row
    const bySize = list.slice().sort((a, b) => DEF[b.id].w * DEF[b.id].h - DEF[a.id].w * DEF[a.id].h || a.uid - b.uid);
    // a unit for decorations: the aquarium's, a little less in a narrow (phone) tank
    const unit = (sc.id === 'bowl' ? Math.min(sc.U, sc.iw / 56) : Math.min(sc.U * 1.3, sc.iw / 84)) * (SCALE[sc.id] || 1);
    const occ = keepOut(sc), G = occ.grid, C = G.C;
    // which piece is seen at each cell of the scene so far (-1: none), and how many cells of each are seen
    const top = new Int16Array(G.gw * G.gh).fill(-1), seen = [], total = [], ys = [];
    // the stretch of sand a piece may stand on
    const lo = sc.id === 'bowl' ? sc.ix0 + sc.iw * 0.18 : sc.ix0 + sc.U, hi = sc.id === 'bowl' ? sc.ix1 - sc.iw * 0.18 : sc.ix1 - sc.U;
    // every cell a piece would fill, standing at (x, y) at size k
    const cells = (M, x, y, k, fn) => {
      const gx0 = Math.max(0, Math.floor((x - M.ox / M.R * k) / C)), gx1 = Math.min(G.gw - 1, Math.floor((x + (M.W - M.ox) / M.R * k) / C));
      const gy0 = Math.max(0, Math.floor((y - M.oy / M.R * k) / C)), gy1 = Math.min(G.gh - 1, Math.floor((y + (M.H - M.oy) / M.R * k) / C));
      for (let gy = gy0; gy <= gy1; gy++) {
        const my = Math.floor(((gy + 0.5) * C - y) / k * M.R + M.oy);
        if (my < 0 || my >= M.H) continue;
        for (let gx = gx0; gx <= gx1; gx++) {
          const mx = Math.floor(((gx + 0.5) * C - x) / k * M.R + M.ox);
          if (mx >= 0 && mx < M.W && M.bits[my * M.W + mx]) fn(gy * G.gw + gx);
        }
      }
    };
    sc.decos = [];
    bySize.forEach(rec => {
      const D = DEF[rec.id], M = silhouette(D), want = rowOf.get(rec.uid), s = pool[want].shift();
      let best = null;
      // try its own row first, then the other (a little less gladly)
      for (const row of [want, want === 'b' ? 'f' : 'b']) {
        const back = row === 'b';
        // pieces only shrink (never below about three quarters) where a slot is really tight
        const fit = (s.room * sc.iw * 1.7) / (D.w * unit);
        const k = unit * (back ? 0.8 : 1) * clamp(fit, 0.74, 1), hw = D.w * k * 0.5;
        const at = x => { const fl = sc.floor(x), band = Math.max(sc.U * 2, sc.iy1 - fl); return back ? fl + band * 0.12 : fl + band * 0.62; };
        // what standing at x would cover of the tank's own things, and how much of it, or of the pieces
        // already placed, would be lost from view (a short piece may stand before a tall one, but neither
        // may be lost behind the other)
        const cost = x => {
          const y = at(x), lost = new Map();
          let n = 0, hard = 0, soft = 0, hid = 0;
          cells(M, x, y, k, j => {
            n++; hard += G.hard[j]; soft += G.soft[j];
            const q = top[j];
            if (q < 0) return;
            if (y >= ys[q]) lost.set(q, (lost.get(q) || 0) + 1); else hid++;
          });
          let other = n ? hid / n : 0;
          for (const [q, l] of lost) other = Math.max(other, 1 - (seen[q] - l) / total[q]);
          return { hard: n ? hard / n : 0, soft: n ? soft / n : 0, other, y };
        };
        // the slot's own place first, then further and further out along the sand on both sides
        const x0 = clamp(sc.ix0 + sc.iw * s.u, lo + hw, hi - hw), step = sc.iw * 0.01;
        let done = false;
        for (let n = 0; n <= 200; n++) {
          const x = x0 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * step;
          if (n && (x - hw < lo || x + hw > hi)) continue;
          const c = cost(x);
          const score = c.hard * 12 + c.soft * 1.5 + Math.max(0, c.other - 0.15) * 6 + Math.abs(x - x0) / sc.iw * 0.6 + (row === want ? 0 : 0.35);
          if (!best || score < best.score) best = { x, y: c.y, k, row, c, score };
          if (c.hard < 0.01 && c.soft < 0.2 && c.other < 0.15) { done = true; break; }
        }
        if (done && best.row === want) break;
      }
      const { x, y, k, row } = best;
      // claim its cells
      const me = sc.decos.length;
      let n = 0;
      ys.push(y); seen.push(0);
      cells(M, x, y, k, j => {
        n++;
        const q = top[j];
        if (q < 0 || y >= ys[q]) { if (q >= 0) seen[q]--; top[j] = me; seen[me]++; }
      });
      total.push(Math.max(1, n));
      const tint = row === 'b' && sc.depthCol ? rgba(sc.depthCol, 0.22) : row === 'b' ? 'rgba(20,50,70,0.18)' : null;
      const d = make(rec, D, x, y, k, row, sc.dpr, tint);
      d.place = best.c; // what it covers where it stands, for checking the layout
      sc.decos.push(d);
    });
    // nearer pieces (lower on the sand) are drawn over farther ones
    sc.decos.sort((a, b) => a.y - b.y);
    for (const d of sc.decos) {
      for (const p of d.D.pois || []) {
        const q = Object.assign({}, p, { deco: d, x: d.x + (p.x || 0) * d.k, y: d.y + (p.y || 0) * d.k });
        if (p.path) q.path = p.path.map(([px, py]) => [d.x + px * d.k, d.y + py * d.k]);
        if (q.kind === 'ride' || q.kind === 'gather' || q.kind === 'glow' || q.kind === 'nap') q.y = Math.max(q.y, sc.swim.y0);
        sc.pois.push(q);
      }
      const B = d.D.bubbler;
      if (B) sc.bubblers.push({ deco: d, x: d.x + B.x * d.k, y: d.y + B.y * d.k, rate: B.rate, spread: B.spread * d.k, rmin: B.rmin * d.k / sc.U, rmax: B.rmax * d.k / sc.U, acc: 0, z: d.row === 'b' ? 0.7 : 0.45 });
    }
  }
  function uninstall(sc) {
    if (!sc.decos) return;
    sc.pois = sc.pois.filter(p => !p.deco);
    sc.bubblers = sc.bubblers.filter(b => !b.deco);
    sc.decos = [];
  }

  /* Each frame: what decorations do on their own, with a small api in their own units. */
  function step(sc, dt, t, envApi) {
    if (!sc.decos) return;
    for (const d of sc.decos) if (d.D.step) d.D.step(d, dt, localApi(sc, d, envApi), t);
    if (sc.decoRings) for (let i = sc.decoRings.length - 1; i >= 0; i--) {
      const R = sc.decoRings[i];
      R.t += dt; R.x += R.vx * dt; R.y += R.vy * dt; R.vy -= sc.U * 0.5 * dt; R.r += sc.U * 0.8 * dt;
      if (R.t > R.life || R.y < sc.surf + R.r) sc.decoRings.splice(i, 1);
    }
  }
  function localApi(sc, d, A) {
    const X = lx => d.x + lx * d.k, Y = ly => d.y + ly * d.k;
    return {
      sc, d, X, Y,
      play: (...a) => A.play(...a),
      bubble: (lx, ly, r, col) => TankEnv.bubble(sc, X(lx), Y(ly), r * d.k, { z: d.row === 'b' ? 0.7 : 0.45, vy: col ? sc.U * 3 : undefined }),
      attract: (lx, ly, secs, who) => A.attract(X(lx), Y(ly), secs, who || 'curious'),
      scare: (lx, ly, r) => A.scare(X(lx), Y(ly), r * d.k),
      lift: (lx, ly, w, secs) => A.lift(X(lx), sc.surf, Y(ly), w * d.k, secs),
      look: (lx, ly, secs) => A.look(X(lx), Y(ly), secs),
      sparkle: (lx, ly, col, n) => A.sparkle && A.sparkle(X(lx), Y(ly), col, n),
      twirl: (lx, ly, r) => A.twirl && A.twirl(X(lx), Y(ly), r * d.k),
      procession: (poi, n) => A.procession && A.procession('deco', n, poi),
      ring: (lx, ly, dir) => { (sc.decoRings || (sc.decoRings = [])).push({ x: X(lx), y: Y(ly), r: sc.U * 1.6, vx: dir * sc.U * 6, vy: -sc.U * 1.4, t: 0, life: 6, rot: -0.15 * dir }); },
      poi: kind => sc.pois.find(p => p.deco === d && p.kind === kind),
    };
  }

  /* Drawing: every decoration in front of the tank's own decor (nearer ones over farther ones), and fx
     (beams, glows) over the fish. */
  function draw(c, sc, t) {
    if (!sc.decos) return;
    for (const d of sc.decos) {
      const B = baseSprite(d.D, d.k * d.dpr, d.tint);
      c.save(); c.translate(d.x, d.y); c.scale(d.k, d.k);
      c.drawImage(B.c, -B.ox, -B.oy, B.w, B.h);
      if (d.D.anim) d.D.anim(c, d, t);
      c.restore();
    }
    if (sc.decoRings) drawRings(c, sc);
  }
  function drawFx(c, sc, t) {
    if (!sc.decos) return;
    for (const d of sc.decos) {
      if (!d.D.fx) continue;
      c.save(); c.translate(d.x, d.y); c.scale(d.k, d.k);
      d.D.fx(c, d, t, sc);
      c.restore();
    }
  }
  function drawRings(c, sc) {
    for (const R of sc.decoRings) {
      const k = R.t / R.life, a = (1 - k) * 0.8;
      c.save(); c.translate(R.x, R.y); c.rotate(R.rot);
      ellipse(c, 0, 0, R.r * 0.42, R.r); c.strokeStyle = `rgba(220,240,255,${a})`; c.lineWidth = Math.max(1.5, sc.U * 0.55 * (1 - k * 0.4)); c.stroke();
      ellipse(c, -R.r * 0.06, -R.r * 0.1, R.r * 0.3, R.r * 0.8); c.strokeStyle = `rgba(255,255,255,${a * 0.5})`; c.lineWidth = Math.max(1, sc.U * 0.18); c.stroke();
      c.restore();
    }
  }

  /* A tap on a decoration: the nearest one whose shape it lands on, front row first. */
  /* The piece under a tap: the nearest first, by its outline, with a little grace for fingers (so a tap
     beside a slim lighthouse reaches what stands behind it). */
  function hit(sc, x, y) {
    if (!sc.decos) return null;
    for (let i = sc.decos.length - 1; i >= 0; i--) {
      const d = sc.decos[i], M = silhouette(d.D), g = 7 / d.k;
      for (const [ox, oy] of [[0, 0], [g, 0], [-g, 0], [0, g], [0, -g]]) {
        const mx = Math.floor(((x - d.x) / d.k + ox) * M.R + M.ox), my = Math.floor(((y - d.y) / d.k + oy) * M.R + M.oy);
        if (mx >= 0 && my >= 0 && mx < M.W && my < M.H && M.bits[my * M.W + mx]) return d;
      }
    }
    return null;
  }
  function tap(sc, x, y, envApi) {
    const d = hit(sc, x, y);
    if (!d) return false;
    if (d.D.tap) d.D.tap(d, localApi(sc, d, envApi));
    return true;
  }

  /* Where the GPU's caustics should fall: the decorations' shapes, for the light mask. */
  function maskOnto(x, sc, k) {
    if (!sc.decos) return;
    for (const d of sc.decos) {
      const B = baseSprite(d.D, d.k * d.dpr, d.tint);
      x.save(); x.setTransform(k * d.k, 0, 0, k * d.k, k * d.x, k * d.y);
      x.drawImage(B.c, -B.ox, -B.oy, B.w, B.h);
      x.restore();
    }
  }

  /* A preview for the market: the piece on a patch of lit sand under water. */
  function preview(canvas, id, t) {
    const D = DEF[id];
    if (!D) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth || 160, h = canvas.clientHeight || 120;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = lg(c, 0, 0, 0, h, [[0, '#2f7f9a'], [0.7, '#164a5e'], [1, '#0d2e3c']]); c.fillRect(0, 0, w, h);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(w * (0.2 + i * 0.3), 0); c.lineTo(w * (0.1 + i * 0.3), h); c.lineTo(w * (0.18 + i * 0.3), h); c.lineTo(w * (0.27 + i * 0.3), 0); c.fillStyle = 'rgba(200,240,255,0.05)'; c.fill(); }
    c.restore();
    const sand = h * 0.82;
    c.fillStyle = lg(c, 0, sand - 4, 0, h, [[0, '#c9b48a'], [1, '#7a6646']]);
    c.beginPath(); c.moveTo(0, sand); c.quadraticCurveTo(w * 0.5, sand - 6, w, sand); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
    const k = Math.min((h * 0.78) / (D.h + 1.5), (w * 0.8) / D.w);
    const d = make({ uid: 1 }, D, w / 2, sand + 2, k, 'f', dpr, null);
    if (D.step) d.D.step(d, 0, { bubble() {}, play() {}, sparkle() {} }, t);
    const B = baseSprite(D, k * dpr, null);
    c.save(); c.translate(d.x, d.y); c.scale(k, k);
    c.drawImage(B.c, -B.ox, -B.oy, B.w, B.h);
    if (D.anim) D.anim(c, d, t);
    if (D.fx) D.fx(c, d, t, { preview: true });
    c.restore();
  }

  /* ---------- little pictures of what fish do with a piece ---------- */
  const svg = (body, cls = '') => `<svg class="dg${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const DOES = {
    through: ['Fish swim right through it', svg('<path d="M5 20v-8a7 7 0 0 1 14 0v8" fill="none" stroke="#c9a77a" stroke-width="3" stroke-linecap="round"/><path d="M2.5 15.5h17" fill="none" stroke="#9fe0ff" stroke-width="2" stroke-linecap="round"/><path d="M17 12.5l3.5 3-3.5 3z" fill="#9fe0ff"/>')],
    hide: ['Shy fish hide in it', svg('<path d="M5 20.5V11a7 7 0 0 1 14 0v9.5z" fill="#c79a62"/><path d="M8.6 20.5V13a3.4 3.4 0 0 1 6.8 0v7.5z" fill="#2b1d12"/><circle cx="11" cy="15.6" r=".9" fill="#ffe7a8"/><circle cx="13.2" cy="15.6" r=".9" fill="#ffe7a8"/>')],
    nap: ['Sleepy fish nap in it', svg('<path d="M14 3.5a8.5 8.5 0 1 0 6.6 13.8A7 7 0 0 1 14 3.5z" fill="#c9d6ff"/><path d="M15.5 4.5h4l-4 4.4h4" fill="none" stroke="#eef2ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>')],
    gather: ['Curious fish gather round', svg('<path d="M2 12s3.8-6.2 10-6.2S22 12 22 12s-3.8 6.2-10 6.2S2 12 2 12z" fill="#cfe9ff"/><circle cx="12" cy="12" r="3.9" fill="#3f86c4"/><circle cx="12" cy="12" r="1.9" fill="#0f2233"/><circle cx="13.3" cy="10.7" r=".9" fill="#fff"/>')],
    glow: ['Glowing fish keep it company', svg('<path d="M12 1.8l2.3 7.9 7.9 2.3-7.9 2.3L12 22.2l-2.3-7.9L1.8 12l7.9-2.3z" fill="#ffe08a"/><circle cx="12" cy="12" r="2.4" fill="#fffbe6"/>')],
    ride: ['Playful fish ride its bubbles', svg('<circle cx="8" cy="17.5" r="3.6" fill="none" stroke="#9fe0ff" stroke-width="1.8"/><circle cx="15.2" cy="10.6" r="2.8" fill="none" stroke="#9fe0ff" stroke-width="1.8"/><circle cx="9.8" cy="4.6" r="1.9" fill="none" stroke="#9fe0ff" stroke-width="1.6"/><circle cx="6.9" cy="16.3" r=".9" fill="#e8fbff"/>')],
    perch: ['Fish rest on top of it', svg('<path d="M3 19.5h18" stroke="#c9a77a" stroke-width="2.6" stroke-linecap="round"/><path d="M6.5 13.5q5-5.2 10 0q-5 5.2-10 0z" fill="#ffb36b"/><path d="M16 13.5l4-3v6z" fill="#ffb36b"/><circle cx="9" cy="12.8" r=".9" fill="#1b2a36"/>')],
    nibble: ['Foragers graze its moss', svg('<path d="M4.5 19.5C4.5 11 10.5 4.5 19.5 4.5c0 9-6.5 15-15 15z" fill="#8fd48a"/><path d="M5 19L15 9" stroke="#3f8a45" stroke-width="1.6" stroke-linecap="round"/>')],
    ring: ['Fish swim through its bubble rings', svg('<ellipse cx="12" cy="12" rx="5.2" ry="8.6" fill="none" stroke="#dff4ff" stroke-width="2.4"/><ellipse cx="11" cy="10.5" rx="2.6" ry="5" fill="none" stroke="#9fe0ff" stroke-width="1" opacity=".7"/>')],
  };
  const ORDER = ['through', 'hide', 'nap', 'gather', 'glow', 'ride', 'perch', 'nibble', 'ring'];
  const TAP = svg('<circle cx="12" cy="12" r="2.8" fill="#ffd6a8"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#ffd6a8" stroke-width="1.6" opacity=".65"/><circle cx="12" cy="12" r="9.8" fill="none" stroke="#ffd6a8" stroke-width="1.4" opacity=".3"/>');
  const sentences = D => (D.blurb || '').match(/[^.!?]+[.!?)]+/g) || [];
  const attr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  /* A piece in one line (its first sentence), what it does when tapped, and a row of icons for what fish
     do with it, each with its words in a tip. */
  const about = D => (sentences(D)[0] || D.name).trim();
  function chips(D) {
    const kinds = new Set((D.pois || []).map(p => p.kind));
    let h = '';
    for (const k of ORDER) if (kinds.has(k)) h += `<i class="dchip" data-tip="${attr(DOES[k][0])}" aria-label="${attr(DOES[k][0])}">${DOES[k][1]}</i>`;
    const tap = sentences(D).filter(x => /^\s*Tap\b/.test(x)).join(' ').trim();
    if (tap) h += `<i class="dchip tap" data-tip="${attr(tap)}" aria-label="${attr(tap)}">${TAP}</i>`;
    return h;
  }

  return { LIST, DEF, CAP, SLOTS, about, chips, joyOf, install, uninstall, step, draw, drawFx, tap, hit, maskOnto, preview };
})();
