/* Tidesong — the aquarium's six tanks: glass, water, sand and decor, drawn on a 2D canvas.
   build() lays a tank out for a canvas size and paints its still layers once; back(), mid() and front()
   draw the moving parts each frame around the fish (js/tank.js runs the fish). Decor a player can touch
   lives in scene.props; the places fish like to go (hiding holes, perches, bubble streams, gates) are
   scene.pois. */
'use strict';

const TankEnv = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
  function rg(c, x0, y0, r0, x1, y1, r1, stops) { const g = c.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.01, r1)); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };
  function mix(h1, h2, k) { const a = hex(h1), b = hex(h2); return `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`; }
  const ellipse = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); };
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); };
  /* A smooth path through points, drawn through their midpoints. */
  function smooth(c, P, move = true) {
    if (move) c.moveTo(P[0][0], P[0][1]); else c.lineTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length - 1; i++) c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    c.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  }
  /* An irregular rounded blob: rocks, moss, coral heads. */
  function blobPath(c, x, y, rx, ry, seed, jag = 0.16, n = 10) {
    const r = rng(seed), P = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = 1 - jag + r() * jag * 2; P.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
    c.beginPath();
    const m = (i) => [(P[i % n][0] + P[(i + 1) % n][0]) / 2, (P[i % n][1] + P[(i + 1) % n][1]) / 2];
    const s = m(n - 1); c.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const e = m(i); c.quadraticCurveTo(P[i][0], P[i][1], e[0], e[1]); }
    c.closePath();
  }
  function rock(c, x, y, rx, ry, col, seed, o = {}) {
    c.save();
    // contact shadow on the sand
    ellipse(c, x, y + ry * 0.55, rx * 1.15, ry * 0.32);
    c.fillStyle = rg(c, x, y + ry * 0.55, 0, x, y + ry * 0.55, rx * 1.15, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
    c.fill();
    blobPath(c, x, y, rx, ry, seed, o.jag ?? 0.14, 11);
    c.fillStyle = rg(c, x - rx * 0.35, y - ry * 0.55, rx * 0.1, x, y, Math.max(rx, ry) * 1.25, [[0, mix(col, '#ffffff', 0.32)], [0.45, col], [1, mix(col, '#000000', 0.55)]]);
    c.fill();
    c.clip();
    const r = rng(seed + 9);
    for (let i = 0; i < 14; i++) { circle(c, x + (r() - 0.5) * rx * 1.8, y + (r() - 0.5) * ry * 1.8, (0.04 + r() * 0.08) * rx); c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; c.fill(); }
    if (o.moss) { blobPath(c, x - rx * 0.1, y - ry * 0.85, rx * 0.85, ry * 0.42, seed + 3, 0.3, 9); c.fillStyle = rgba(o.moss, 0.75); c.fill(); }
    c.restore();
  }

  /* ---------- caustics: a tiling web of light, panned in two layers ---------- */
  let causticTex = null;
  function caustics() {
    if (causticTex) return causticTex;
    const N = 160, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), r = rng(7);
    const pts = Array.from({ length: 20 }, () => [r(), r()]);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      let f1 = 9, f2 = 9;
      for (const [px, py] of pts) {
        let dx = Math.abs(u - px), dy = Math.abs(v - py);
        dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const k = Math.exp(-(f2 - f1) * 34);
      const o = (j * N + i) * 4;
      img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * Math.min(1, k * 1.15));
    }
    x.putImageData(img, 0, 0);
    return (causticTex = c);
  }
  function drawCaustics(c, sc, t, path, alpha, scale = 1, squash = 0.45) {
    if (!sc._pat) sc._pat = c.createPattern(caustics(), 'repeat');
    const pat = sc._pat, s = sc.U * 0.95 * scale;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = pat;
    for (let L = 0; L < 2; L++) {
      const ox = (L ? -t * 9 : t * 13) * sc.U * 0.1, oy = (L ? t * 5 : -t * 3) * sc.U * 0.1;
      try { pat.setTransform(new DOMMatrix().translateSelf(ox + L * 37, oy + L * 51).scaleSelf(s * (L ? 1.27 : 1), s * squash * (L ? 1.27 : 1))); } catch (e) { /* old browsers: unpanned */ }
      c.globalAlpha = alpha * (L ? 0.7 : 1);
      c.fill(path);
    }
    c.restore();
  }

  /* ---------- light shafts from the surface ---------- */
  function shafts(c, sc, t, o) {
    const r = rng(o.seed || 5), top = sc.surf, bot = o.to ?? sc.iy1;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.beginPath(); c.rect(sc.ix0, sc.surf, sc.iw, sc.iy1 - sc.surf); c.clip();
    for (let i = 0; i < o.n; i++) {
      const u = (o.u0 ?? 0.08) + ((o.u1 ?? 0.92) - (o.u0 ?? 0.08)) * (o.n === 1 ? 0.5 : i / (o.n - 1)) + (r() - 0.5) * 0.08;
      const x = sc.ix0 + sc.iw * u + Math.sin(t * 0.13 + i * 1.7) * sc.U * 1.2;
      const w0 = sc.U * (o.w || 3) * (0.6 + r() * 0.8), w1 = w0 * (o.spread || 2.4), slant = (o.slant || 0.18) * (bot - top);
      const a = o.alpha * (0.55 + 0.45 * Math.sin(t * (0.25 + r() * 0.3) + r() * TAU));
      c.beginPath();
      c.moveTo(x - w0 / 2, top); c.lineTo(x + w0 / 2, top);
      c.lineTo(x + slant + w1 / 2, bot); c.lineTo(x + slant - w1 / 2, bot); c.closePath();
      c.fillStyle = lg(c, 0, top, 0, bot, [[0, rgba(o.col, a)], [0.55, rgba(o.col, a * 0.35)], [1, rgba(o.col, 0)]]);
      c.fill();
    }
    c.restore();
  }

  /* ---------- plants: strands that sway, and bend when fish brush past ---------- */
  function strand(o) {
    return Object.assign({ n: 8, w: 6, sway: 0.22, spd: 0.8, ph: Math.random() * TAU, lean: 0, kick: 0, kind: 'reed', col: '#4f9a5a', col2: '#2b6338', layer: 'back' }, o);
  }
  function strandPts(s, t) {
    const n = s.n, seg = s.len / n, P = new Array(n + 1), rest = -Math.PI / 2 + s.lean;
    let a = rest, x = s.x, y = s.y;
    P[0] = [x, y, a];
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      a += (Math.sin(t * s.spd + s.ph - k * 2.4) * s.sway + Math.sin(t * 5.5 + s.ph + k * 3) * s.kick * 0.7) * (0.5 + k) * 1.6 / n;
      a += (rest - a) * 0.07;
      x += Math.cos(a) * seg; y += Math.sin(a) * seg;
      P[i] = [x, y, a];
    }
    return P;
  }
  function ribbon(c, P, w0, w1) {
    const L = [], R = [], n = P.length - 1;
    for (let i = 0; i <= n; i++) {
      const [x, y, a] = P[i], w = lerp(w0, w1, i / n) / 2, nx = -Math.sin(a), ny = Math.cos(a);
      L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
    }
    c.beginPath(); smooth(c, L); smooth(c, R.reverse(), false); c.closePath();
  }
  function drawStrand(c, s, t) {
    const P = strandPts(s, t), n = P.length - 1;
    if (s.kind === 'reed') {
      ribbon(c, P, s.w, s.w * 0.25);
      c.fillStyle = lg(c, s.x - s.w, 0, s.x + s.w, 0, [[0, s.col2], [0.5, s.col], [1, s.col2]]);
      c.fill();
      c.beginPath(); smooth(c, P.slice(0, n)); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = Math.max(0.6, s.w * 0.12); c.stroke();
    } else if (s.kind === 'kelp') {
      c.beginPath(); smooth(c, P); c.strokeStyle = s.col2; c.lineWidth = s.w * 0.22; c.stroke();
      for (let i = 1; i <= n; i++) {
        const [x, y, a] = P[i], side = i % 2 ? 1 : -1, L = s.w * (2.6 - (i / n) * 1.1);
        const ang = a + side * 0.55 + Math.sin(t * 1.3 + s.ph + i) * 0.12;
        c.save(); c.translate(x, y); c.rotate(ang);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.5, -s.w * 0.75 * side, L, side * s.w * 0.05); c.quadraticCurveTo(L * 0.5, s.w * 0.55 * side, 0, 0);
        c.fillStyle = lg(c, 0, 0, L, 0, [[0, s.col2], [0.4, s.col], [1, mix(s.col, '#e8d27a', 0.25)]]); c.fill();
        c.restore();
        if (i % 3 === 1) { circle(c, x, y, s.w * 0.3); c.fillStyle = mix(s.col, '#d8c060', 0.35); c.fill(); }
      }
    } else if (s.kind === 'stem' || s.kind === 'red') {
      c.beginPath(); smooth(c, P); c.strokeStyle = s.col2; c.lineWidth = Math.max(1, s.w * 0.16); c.stroke();
      for (let i = 1; i <= n; i++) {
        const [x, y, a] = P[i], L = s.w * (1.15 - 0.5 * (i / n));
        for (const side of [-1, 1]) {
          c.save(); c.translate(x, y); c.rotate(a + side * (s.kind === 'red' ? 1.0 : 0.9) + Math.sin(t * 1.6 + i + s.ph) * 0.08);
          ellipse(c, L * 0.55, 0, L * 0.55, L * (s.kind === 'red' ? 0.24 : 0.16));
          c.fillStyle = s.kind === 'red' ? mix(s.col, '#ff9a6a', (i / n) * 0.6) : mix(s.col, '#c8f0a0', (i / n) * 0.35);
          c.fill(); c.restore();
        }
      }
    } else if (s.kind === 'fan') {
      c.beginPath(); smooth(c, P); c.strokeStyle = s.col2; c.lineWidth = Math.max(1, s.w * 0.12); c.stroke();
      c.strokeStyle = s.col; c.lineWidth = Math.max(0.7, s.w * 0.07);
      for (let i = 1; i <= n; i++) {
        const [x, y, a] = P[i], L = s.w * (0.95 - 0.35 * (i / n));
        c.beginPath();
        for (let k = -3; k <= 3; k++) { const b = a + Math.PI / 2 + k * 0.42; c.moveTo(x, y); c.lineTo(x + Math.cos(b) * L, y + Math.sin(b) * L); c.moveTo(x, y); c.lineTo(x - Math.cos(b) * L, y - Math.sin(b) * L); }
        c.stroke();
      }
    } else if (s.kind === 'lantern') {
      c.beginPath(); smooth(c, P); c.strokeStyle = s.col2; c.lineWidth = Math.max(1, s.w * 0.2); c.stroke();
      for (let i = 2; i < n; i += 2) {
        const [x, y, a] = P[i], side = i % 4 ? 1 : -1;
        c.save(); c.translate(x, y); c.rotate(a + side * 1.0); ellipse(c, s.w * 0.7, 0, s.w * 0.7, s.w * 0.22); c.fillStyle = s.col2; c.fill(); c.restore();
      }
      const [x, y] = P[n], g = s.glow || 0, R = s.w * 1.1;
      c.save(); c.globalCompositeOperation = 'lighter';
      circle(c, x, y, R * (3.2 + g * 4)); c.fillStyle = rg(c, x, y, 0, x, y, R * (3.2 + g * 4), [[0, rgba(s.lit, 0.22 + g * 0.45)], [1, rgba(s.lit, 0)]]); c.fill();
      c.restore();
      ellipse(c, x, y, R, R * 1.2); c.fillStyle = rg(c, x - R * 0.3, y - R * 0.4, 0, x, y, R * 1.3, [[0, '#ffffff'], [0.35, mix(s.lit, '#ffffff', 0.4 + g * 0.3)], [1, s.lit]]); c.fill();
    }
  }
  /* A fish swimming through plants nudges them. */
  function brush(sc, x, y, r, amt) {
    for (const s of sc.strands) {
      if (Math.abs(x - s.x) > r + s.len * 0.3 || y > s.y + r || y < s.y - s.len - r) continue;
      s.kick = Math.min(1.2, s.kick + amt);
      if (s.kind === 'lantern') s.glow = Math.min(1, (s.glow || 0) + amt * 0.6);
    }
    if (sc.onBrush) sc.onBrush(x, y, r, amt);
  }

  /* ---------- bubbles ---------- */
  function bubble(sc, x, y, r, o = {}) {
    if (sc.bubbles.length > 220) return;
    sc.bubbles.push({ x, y, r, vy: o.vy ?? sc.U * (2 + r / sc.U * 2.4), wob: o.wob ?? sc.U * 0.8, f: 2 + Math.random() * 3, ph: Math.random() * TAU, z: o.z ?? 0.5, ring: o.ring || 0 });
  }
  function stepBubbles(sc, dt) {
    const B = sc.bubbles;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      b.vy = Math.min(b.vy + sc.U * 6 * dt, sc.U * (5 + b.r / sc.U * 5));
      b.y -= b.vy * dt;
      b.ph += dt * b.f;
      b.x += Math.cos(b.ph) * b.wob * dt;
      if (b.y - b.r < sc.surf || (sc.ell && insideEll(sc, b.x, b.y) > 1)) {
        if (sc.pops.length < 40) sc.pops.push({ x: b.x, y: sc.surf, r: b.r, t: 0 });
        B.splice(i, 1);
      }
    }
    for (let i = sc.pops.length - 1; i >= 0; i--) { sc.pops[i].t += dt; if (sc.pops[i].t > 0.5) sc.pops.splice(i, 1); }
  }
  function drawBubbles(c, sc, filter) {
    c.save();
    c.lineWidth = Math.max(0.6, sc.U * 0.12);
    for (const b of sc.bubbles) {
      if (filter && !filter(b)) continue;
      circle(c, b.x, b.y, b.r);
      c.fillStyle = 'rgba(215,240,255,0.10)'; c.fill();
      c.strokeStyle = 'rgba(225,245,255,0.55)'; c.stroke();
      if (b.r > sc.U * 0.3) { circle(c, b.x - b.r * 0.35, b.y - b.r * 0.38, b.r * 0.28); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill(); }
    }
    for (const p of sc.pops) {
      const k = p.t / 0.5;
      ellipse(c, p.x, p.y + 1, p.r * (1 + k * 3), p.r * (0.3 + k * 0.6));
      c.strokeStyle = `rgba(230,248,255,${0.5 * (1 - k)})`; c.stroke();
    }
    c.restore();
  }
  const insideEll = (sc, x, y) => { const e = sc.ell; return ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2; };

  /* ---------- water: the surface seen from just below, wobbling ---------- */
  function surface(c, sc, t, x0, x1, col = '#e8f6ff') {
    const y = sc.surf, U = sc.U;
    c.save();
    // the underside of the surface mirrors the water below: a silvery band that fades down
    c.fillStyle = lg(c, 0, y, 0, y + U * 4.5, [[0, rgba(col, 0.2)], [1, rgba(col, 0)]]);
    c.fillRect(x0, y, x1 - x0, U * 4.5);
    c.beginPath();
    for (let x = x0; x <= x1 + 2; x += 6) {
      const yy = y + Math.sin(x * 0.045 + t * 1.6) * U * 0.16 + Math.sin(x * 0.11 - t * 2.3) * U * 0.09;
      if (x === x0) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.strokeStyle = rgba(col, 0.55); c.lineWidth = Math.max(1, U * 0.22); c.stroke();
    c.strokeStyle = rgba('#ffffff', 0.25); c.lineWidth = Math.max(0.6, U * 0.08); c.stroke();
    c.restore();
  }

  /* ---------- common layout ---------- */
  function interior(sc, f) {
    const U = sc.U;
    sc.ix0 = Math.round(f.l * U); sc.iy0 = Math.round(f.t * U); sc.ix1 = Math.round(sc.W - f.r * U); sc.iy1 = Math.round(sc.H - f.b * U);
    sc.iw = sc.ix1 - sc.ix0; sc.ih = sc.iy1 - sc.iy0;
    sc.surf = sc.iy0 + sc.ih * (f.air ?? 0.075);
  }
  const X = (sc, u) => sc.ix0 + sc.iw * u;
  const Y = (sc, v) => sc.iy0 + sc.ih * v;
  function floorFn(sc, base, amp, seed, mounds = []) {
    const r = rng(seed), p1 = r() * TAU, p2 = r() * TAU, k1 = TAU * (1.1 + r()), k2 = TAU * (3 + r() * 2);
    const yb = Y(sc, base), A = amp * sc.ih;
    sc.floor = x => {
      const u = (x - sc.ix0) / sc.iw;
      let y = yb + A * (0.6 * Math.sin(u * k1 + p1) + 0.4 * Math.sin(u * k2 + p2));
      for (const m of mounds) y -= m.h * sc.ih * Math.exp(-(((u - m.u) / m.w) ** 2));
      return Math.min(sc.iy1 - 2, y);
    };
    const path = new Path2D();
    path.moveTo(sc.ix0, sc.iy1 + 1);
    for (let x = sc.ix0; x <= sc.ix1 + 4; x += 4) path.lineTo(Math.min(x, sc.ix1), sc.floor(Math.min(x, sc.ix1)));
    path.lineTo(sc.ix1, sc.iy1 + 1); path.closePath();
    sc.sandPath = path;
  }
  function swimBox(sc) { sc.swim = { x0: sc.ix0 + sc.U * 2.5, x1: sc.ix1 - sc.U * 2.5, y0: sc.surf + sc.U * 2.6, y1: sc.iy1 }; }
  function waterFill(c, sc, stops, airCol) {
    c.fillStyle = lg(c, 0, sc.surf, 0, sc.iy1, stops);
    c.fillRect(sc.ix0, sc.surf, sc.iw, sc.iy1 - sc.surf);
    // above the waterline: the back of the tank seen through air, a touch lighter and clearer
    c.fillStyle = lg(c, 0, sc.iy0, 0, sc.surf, [[0, mix(airCol, '#000000', 0.25)], [1, airCol]]);
    c.fillRect(sc.ix0, sc.iy0, sc.iw, sc.surf - sc.iy0 + 1);
  }
  function paintSand(c, sc, o) {
    const r = rng(o.seed || 3), U = sc.U;
    let minY = sc.iy1;
    for (let x = sc.ix0; x <= sc.ix1; x += 8) minY = Math.min(minY, sc.floor(x));
    c.save();
    c.fillStyle = lg(c, 0, minY, 0, sc.iy1, [[0, o.top], [0.5, o.mid || o.top], [1, o.bot]]);
    c.fill(sc.sandPath);
    c.clip(sc.sandPath);
    // grains and pebbles
    const N = Math.round(sc.iw * (sc.iy1 - minY) / (U * U) * (o.density ?? 0.9));
    for (let i = 0; i < N; i++) {
      const x = sc.ix0 + r() * sc.iw, y0 = sc.floor(x), y = y0 + Math.pow(r(), 0.8) * (sc.iy1 - y0);
      circle(c, x, y, U * (0.06 + r() * 0.14));
      c.fillStyle = o.specks[Math.floor(r() * o.specks.length)]; c.fill();
    }
    if (o.pebbles) for (let i = 0; i < o.pebbles; i++) {
      const x = sc.ix0 + r() * sc.iw, y0 = sc.floor(x), y = y0 + U * 0.4 + r() * (sc.iy1 - y0) * 0.9;
      const rx = U * (0.35 + r() * 0.6), ry = rx * (0.55 + r() * 0.25), col = o.pebCols[Math.floor(r() * o.pebCols.length)];
      ellipse(c, x, y, rx, ry, (r() - 0.5) * 0.6);
      c.fillStyle = rg(c, x - rx * 0.3, y - ry * 0.4, 0, x, y, rx * 1.2, [[0, mix(col, '#ffffff', 0.35)], [0.6, col], [1, mix(col, '#000000', 0.45)]]);
      c.fill();
    }
    // the crest of the sand catches the light
    c.beginPath();
    for (let x = sc.ix0; x <= sc.ix1; x += 4) { const y = sc.floor(x) + U * 0.25; if (x === sc.ix0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.strokeStyle = o.crest; c.lineWidth = U * 0.5; c.stroke();
    // through the front glass: the substrate in cross-section, darker and layered toward the bottom
    c.fillStyle = lg(c, 0, sc.iy1 - sc.ih * 0.07, 0, sc.iy1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.38)']]);
    c.fillRect(sc.ix0, sc.iy1 - sc.ih * 0.07, sc.iw, sc.ih * 0.07);
    c.restore();
  }
  /* The glass of a rectangular tank: soft shadow inside its edges, and two long reflections. */
  function glass(c, sc, o = {}) {
    const U = sc.U, { ix0, iy0, ix1, iy1, iw, ih } = sc;
    c.save();
    const e = U * 2.2;
    c.fillStyle = lg(c, ix0, 0, ix0 + e, 0, [[0, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(ix0, iy0, e, ih);
    c.fillStyle = lg(c, ix1, 0, ix1 - e, 0, [[0, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(ix1 - e, iy0, e, ih);
    c.fillStyle = lg(c, 0, iy1, 0, iy1 - e, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(ix0, iy1 - e, iw, e);
    c.globalCompositeOperation = 'lighter';
    c.beginPath(); c.moveTo(ix0 + iw * 0.06, iy0); c.lineTo(ix0 + iw * 0.2, iy0); c.lineTo(ix0 + iw * 0.05, iy1); c.lineTo(ix0, iy1); c.lineTo(ix0, iy0 + ih * 0.25); c.closePath();
    c.fillStyle = lg(c, ix0, iy0, ix0 + iw * 0.2, iy0 + ih * 0.6, [[0, `rgba(255,255,255,${o.sheen ?? 0.06})`], [1, 'rgba(255,255,255,0)']]); c.fill();
    c.fillStyle = lg(c, ix1 - iw * 0.06, 0, ix1 - iw * 0.02, 0, [[0, 'rgba(255,255,255,0)'], [0.5, `rgba(255,255,255,${(o.sheen ?? 0.06) * 0.7})`], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(ix1 - iw * 0.06, iy0, iw * 0.04, ih);
    c.restore();
  }
  /* A frame around a rectangular tank, as a ring between the canvas edge and the glass. */
  function frameRing(c, sc) {
    const p = new Path2D();
    p.rect(0, 0, sc.W, sc.H);
    p.rect(sc.ix0, sc.iy0, sc.iw, sc.ih);
    return p;
  }
  function frameBevel(c, sc, light, dark) {
    c.save();
    c.lineWidth = Math.max(1, sc.U * 0.18);
    c.strokeStyle = dark; c.strokeRect(sc.ix0 - c.lineWidth / 2, sc.iy0 - c.lineWidth / 2, sc.iw + c.lineWidth, sc.ih + c.lineWidth);
    c.strokeStyle = light; c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, sc.W - c.lineWidth, sc.H - c.lineWidth);
    c.restore();
  }
  function grain(c, sc, path, cols, seed, horiz = true) {
    const r = rng(seed);
    c.save(); c.clip(path, 'evenodd');
    c.lineWidth = Math.max(0.6, sc.U * 0.09);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = cols[i % cols.length];
      c.beginPath();
      if (horiz) {
        const y = r() * sc.H; c.moveTo(0, y);
        for (let x = 0; x <= sc.W; x += 30) c.lineTo(x, y + Math.sin(x * 0.02 + i) * sc.U * 0.25);
      } else {
        const x = r() * sc.W; c.moveTo(x, 0);
        for (let y = 0; y <= sc.H; y += 30) c.lineTo(x + Math.sin(y * 0.02 + i) * sc.U * 0.25, y);
      }
      c.stroke();
    }
    c.restore();
  }
  function rivets(c, sc, col, every) {
    const U = sc.U, r = U * 0.32;
    const put = (x, y) => {
      circle(c, x, y, r); c.fillStyle = rg(c, x - r * 0.3, y - r * 0.35, 0, x, y, r, [[0, '#fff6d0'], [0.4, col], [1, mix(col, '#000000', 0.5)]]); c.fill();
    };
    const t = sc.iy0 / 2, b = sc.iy1 + (sc.H - sc.iy1) / 2, l = sc.ix0 / 2, rr = sc.ix1 + (sc.W - sc.ix1) / 2;
    for (let x = U * 3; x < sc.W - U * 2; x += every) { put(x, t); put(x, b); }
    for (let y = sc.iy0 + every * 0.6; y < sc.iy1 - every * 0.3; y += every) { put(l, y); put(rr, y); }
  }

  /* ======================================================================
     The tanks
     ====================================================================== */
  const ENVS = {};
  const strandsIn = (sc, layer) => sc.strands.filter(s => s.layer === layer);
  function drawLayer(c, sc, t, layer) { for (const s of (sc._layers[layer] || [])) drawStrand(c, s, t); }
  /* A touch within reach of a plant's swaying stem sets it waving. */
  function hitStrand(sc, x, y, pad) {
    let hit = false;
    for (const s of sc.strands) {
      if (s.kind === 'lantern' || y > s.y + pad || y < s.y - s.len * 1.1 - pad || Math.abs(x - s.x) > s.len * 0.6 + pad) continue;
      const reach = pad + s.w * (s.kind === 'kelp' ? 1.6 : 0.9);
      if (strandPts(s, sc.t).some(([px, py]) => Math.hypot(px - x, py - y) < reach)) { s.kick = Math.min(1.4, s.kick + 0.9); hit = true; }
    }
    return hit;
  }

  /* ---------------- Glass Bowl: a round bowl on a windowsill at night ---------------- */
  ENVS.bowl = {
    layout(sc) {
      const { W, H, U } = sc, R = Math.min(W * 0.36, H * 0.43);
      const cx = W > H * 1.3 ? W * 0.57 : W * 0.5, cy = H * 0.5;
      sc.bowl = { cx, cy, R, top: cy - R * 0.8, base: cy + R * 0.86 };
      sc.ix0 = cx - R; sc.ix1 = cx + R; sc.iy0 = sc.bowl.top; sc.iy1 = sc.bowl.base; sc.iw = 2 * R; sc.ih = sc.iy1 - sc.iy0;
      sc.surf = cy - R * 0.6;
      const pt = cy + R * 0.5;
      sc.floor = x => {
        const dx = x - cx, lim = cy + Math.sqrt(Math.max(0, R * R * 0.93 - dx * dx));
        return Math.min(pt + Math.sin(dx * 0.06) * U * 0.25 + (dx / R) ** 2 * R * 0.06, lim - U * 0.5);
      };
      const shape = (top, k = 1) => { const P = new Path2D(); for (let i = 0; i <= 72; i++) { const a = (i / 72) * TAU, x = cx + Math.cos(a) * R * k, y = clamp(cy + Math.sin(a) * R * k, top, sc.bowl.base); if (i) P.lineTo(x, y); else P.moveTo(x, y); } P.closePath(); return P; };
      sc.bowlPath = shape(sc.bowl.top);
      sc.waterPath = shape(sc.surf, 0.985);
      const sand = new Path2D();
      sand.moveTo(cx - R, sc.floor(cx - R));
      for (let x = cx - R; x <= cx + R; x += 3) sand.lineTo(x, sc.floor(x));
      for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI; sand.lineTo(cx + Math.cos(a) * R, Math.min(sc.bowl.base, cy + Math.sin(a) * R)); }
      sand.closePath();
      sc.sandPath = sand;
      sc.ell = { cx, cy: cy - R * 0.04, rx: R * 0.8, ry: R * 0.56 };
      sc.swim = { x0: cx - R * 0.8, x1: cx + R * 0.8, y0: sc.surf + U * 2.2, y1: pt };
      sc.inWater = (x, y) => y > sc.surf && y < sc.bowl.base && (x - cx) ** 2 + (y - cy) ** 2 < R * R;
      const r = rng(17);
      sc.strands.push(
        strand({ kind: 'stem', x: cx + R * 0.4, y: sc.floor(cx + R * 0.4) + U * 0.5, len: R * 0.92, w: U * 1.5, n: 10, col: '#5fae4a', col2: '#2f6b2a', layer: 'mid', sway: 0.16, spd: 0.7 }),
        strand({ kind: 'stem', x: cx + R * 0.5, y: sc.floor(cx + R * 0.5) + U * 0.5, len: R * 0.62, w: U * 1.3, n: 8, col: '#6abb52', col2: '#2f6b2a', layer: 'mid', sway: 0.2, spd: 0.8, lean: 0.12 }),
        strand({ kind: 'stem', x: cx - R * 0.52, y: sc.floor(cx - R * 0.52) + U * 0.5, len: R * 0.5, w: U * 1.2, n: 7, col: '#58a646', col2: '#2b6227', layer: 'mid', sway: 0.2, spd: 0.75, lean: -0.15 }),
      );
      sc.loose = Array.from({ length: 8 }, (_, i) => {
        const x = cx + (r() - 0.5) * R * 1.3;
        return { x, y: sc.floor(x) - U * 0.2, rx: U * (0.6 + r() * 0.4), col: ['#f2a7b8', '#7fd6d0', '#f4d77a', '#f1efe6', '#b8a6e8', '#f49c7a'][i % 6], oy: 0, vy: 0, rot: r() };
      });
      sc.pois.push({ kind: 'perch', x: cx + R * 0.42, y: cy, z: 0.55 }, { kind: 'hide', x: cx + R * 0.45, y: pt - U * 2.2, z: 0.85 });
      sc.tint = { far: 'rgba(40,110,130,0.32)', near: 'rgba(60,130,150,0.06)' };
    },
    paintBg(c, sc) {
      const { W, H, U } = sc, { cx, cy, R, base } = sc.bowl, r = rng(4);
      c.fillStyle = lg(c, 0, 0, 0, H, [[0, '#1e2b42'], [1, '#10182a']]); c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,0.022)';
      for (let x = 0; x < W; x += U * 3.2) c.fillRect(x, 0, U * 1.2, base);
      c.fillStyle = rg(c, W * 0.95, H * 0.08, 0, W * 0.95, H * 0.08, W * 0.55, [[0, 'rgba(255,196,120,0.2)'], [1, 'rgba(255,196,120,0)']]); c.fillRect(0, 0, W, H);
      // the window, with the lake under the moon outside
      const wx0 = W * 0.05, wx1 = Math.max(W * 0.3, Math.min(cx - R * 0.2, W * 0.46)), wy0 = H * 0.08, wy1 = base - H * 0.1;
      const ww = wx1 - wx0, wh = wy1 - wy0;
      c.save(); c.beginPath(); c.rect(wx0, wy0, ww, wh); c.clip();
      c.fillStyle = lg(c, 0, wy0, 0, wy1, [[0, '#0b1634'], [0.62, '#2a4778'], [0.63, '#16284a'], [1, '#0d1a33']]); c.fillRect(wx0, wy0, ww, wh);
      for (let i = 0; i < 40; i++) { circle(c, wx0 + r() * ww, wy0 + r() * wh * 0.55, r() * U * 0.14 + 0.3); c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`; c.fill(); }
      const mx = wx0 + ww * 0.62, my = wy0 + wh * 0.24;
      circle(c, mx, my, U * 9); c.fillStyle = rg(c, mx, my, 0, mx, my, U * 9, [[0, 'rgba(255,246,220,0.35)'], [1, 'rgba(255,246,220,0)']]); c.fill();
      circle(c, mx, my, U * 2.4); c.fillStyle = rg(c, mx - U * 0.6, my - U * 0.6, 0, mx, my, U * 2.4, [[0, '#fffbe8'], [1, '#e8dcb4']]); c.fill();
      c.beginPath(); c.moveTo(wx0, wy0 + wh * 0.63);
      for (let x = wx0; x <= wx1; x += 6) c.lineTo(x, wy0 + wh * (0.58 - 0.06 * Math.sin((x - wx0) / ww * 5.5 + 1) - 0.04 * Math.sin((x - wx0) / ww * 13)));
      c.lineTo(wx1, wy0 + wh * 0.63); c.closePath(); c.fillStyle = '#0a1226'; c.fill();
      for (let i = 0; i < 12; i++) { const y = wy0 + wh * (0.66 + i * 0.028); c.fillStyle = `rgba(255,240,200,${0.3 - i * 0.022})`; c.fillRect(mx - U * (1.5 + i * 0.5) + Math.sin(i * 3) * U, y, U * (3 + i), Math.max(1, U * 0.18)); }
      c.restore();
      c.fillStyle = lg(c, wx0, 0, wx0 + ww * 0.25, 0, [[0, 'rgba(235,225,255,0.13)'], [1, 'rgba(235,225,255,0)']]); c.fillRect(wx0, wy0, ww * 0.25, wh);
      const fw = U * 1.1;
      c.strokeStyle = '#5b3d26'; c.lineWidth = fw; c.strokeRect(wx0, wy0, ww, wh);
      c.lineWidth = fw * 0.6; c.beginPath(); c.moveTo(wx0 + ww / 2, wy0); c.lineTo(wx0 + ww / 2, wy1); c.moveTo(wx0, wy0 + wh * 0.5); c.lineTo(wx1, wy0 + wh * 0.5); c.stroke();
      c.strokeStyle = 'rgba(255,220,170,0.18)'; c.lineWidth = 1; c.strokeRect(wx0 - fw / 2, wy0 - fw / 2, ww + fw, wh + fw);
      // the sill and table
      const ty = base - U * 0.2;
      c.fillStyle = lg(c, 0, ty, 0, ty + U * 2.6, [[0, '#8a5e3a'], [1, '#5f3d24']]); c.fillRect(0, ty, W, U * 2.6);
      c.fillStyle = lg(c, 0, ty + U * 2.6, 0, H, [[0, '#4a2e1a'], [1, '#26170c']]); c.fillRect(0, ty + U * 2.6, W, H);
      c.strokeStyle = 'rgba(255,225,180,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, ty + 0.5); c.lineTo(W, ty + 0.5); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 14; i++) { const y = ty + U * 3 + r() * (H - ty - U * 3); c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 40) c.lineTo(x, y + Math.sin(x * 0.01 + i) * U * 0.3); c.stroke(); }
      // a little potted fern, if there is room beside the bowl
      const px = W * 0.9;
      if (px - (cx + R) > U * 5) {
        const pw = U * 4.2, ph = U * 4.4, py = ty;
        ellipse(c, px, py + U * 0.3, pw * 0.8, U * 0.6); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i - 4) * 0.28, L = U * (6 + r() * 3);
          c.save(); c.translate(px, py - ph * 0.9); c.rotate(a + Math.PI / 2);
          c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(U * 1.4, -L * 0.5, 0, -L); c.quadraticCurveTo(-U * 1.4, -L * 0.5, 0, 0);
          c.fillStyle = i % 2 ? '#3f7a3a' : '#2f6430'; c.fill(); c.restore();
        }
        c.beginPath(); c.moveTo(px - pw / 2, py - ph); c.lineTo(px + pw / 2, py - ph); c.lineTo(px + pw * 0.38, py); c.lineTo(px - pw * 0.38, py); c.closePath();
        c.fillStyle = lg(c, px - pw / 2, 0, px + pw / 2, 0, [[0, '#a85a36'], [0.4, '#c77548'], [1, '#7a3c22']]); c.fill();
        c.fillStyle = '#b8683e'; c.fillRect(px - pw * 0.54, py - ph - U * 0.3, pw * 1.08, U * 0.9);
      }
      // the bowl's shadow and a spot of light it throws on the sill
      ellipse(c, cx, base + U * 0.5, R * 0.75, U * 1.5); c.fillStyle = rg(c, cx, base + U * 0.5, 0, cx, base + U * 0.5, R * 0.75, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      ellipse(c, cx + R * 0.62, base + U * 1.1, R * 0.32, U * 0.9); c.fillStyle = rg(c, cx + R * 0.62, base + U * 1.1, 0, cx + R * 0.62, base + U * 1.1, R * 0.32, [[0, 'rgba(160,230,240,0.35)'], [1, 'rgba(160,230,240,0)']]); c.fill();
      c.restore();
      // glass and water
      c.fillStyle = 'rgba(190,225,245,0.06)'; c.fill(sc.bowlPath);
      c.fillStyle = lg(c, 0, sc.surf, 0, base, [[0, '#7cc6d2'], [0.5, '#3f8fa6'], [1, '#235a73']]); c.fill(sc.waterPath);
      c.save(); c.clip(sc.waterPath);
      c.fillStyle = rg(c, cx - R * 0.4, sc.surf, 0, cx - R * 0.4, sc.surf, R * 1.2, [[0, 'rgba(255,250,230,0.16)'], [1, 'rgba(255,250,230,0)']]); c.fillRect(cx - R, sc.surf, 2 * R, base - sc.surf);
      c.restore();
      // the pebble bed: a heap of coloured glass pebbles
      c.save(); c.clip(sc.sandPath);
      c.fillStyle = '#3a4a5a'; c.fill(sc.sandPath);
      const cols = ['#f2a7b8', '#7fd6d0', '#f4d77a', '#f1efe6', '#b8a6e8', '#f49c7a', '#8fc8f0'];
      for (let y = base + U; y > sc.floor(cx) - U * 2; y -= U * 0.75) {
        for (let x = cx - R; x < cx + R; x += U * (1.1 + r() * 0.5)) {
          if (y < sc.floor(x) - U * 0.2) continue;
          const rx = U * (0.55 + r() * 0.45), ry = rx * (0.62 + r() * 0.2), col = cols[Math.floor(r() * cols.length)], xx = x + (r() - 0.5) * U * 0.6;
          ellipse(c, xx, y, rx, ry, (r() - 0.5) * 0.8);
          c.fillStyle = rg(c, xx - rx * 0.3, y - ry * 0.45, 0, xx, y, rx * 1.15, [[0, mix(col, '#ffffff', 0.55)], [0.5, col], [1, mix(col, '#1a2030', 0.55)]]);
          c.fill();
        }
      }
      c.restore();
      ellipse(c, cx, sc.bowl.top, R * 0.6, U * 1.1); c.strokeStyle = 'rgba(210,235,250,0.22)'; c.lineWidth = Math.max(1, U * 0.25); c.stroke();
    },
    paintFg(c, sc) {
      const { U } = sc, { cx, cy, R, top, base } = sc.bowl;
      c.save();
      c.clip(sc.bowlPath);
      c.strokeStyle = 'rgba(180,220,240,0.16)'; c.lineWidth = U * 2.4; circle(c, cx, cy, R); c.stroke();
      c.restore();
      c.save();
      c.strokeStyle = 'rgba(225,242,255,0.5)'; c.lineWidth = Math.max(1, U * 0.28); c.stroke(sc.bowlPath);
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.beginPath(); c.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.36); c.strokeStyle = 'rgba(255,255,255,0.26)'; c.lineWidth = U * 1.4; c.stroke();
      c.beginPath(); c.arc(cx, cy, R * 0.86, Math.PI * 1.4, Math.PI * 1.44); c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = U * 1.1; c.stroke();
      c.beginPath(); c.arc(cx, cy, R * 0.9, Math.PI * 0.08, Math.PI * 0.2); c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = U * 0.8; c.stroke();
      // the window, reflected small in the glass
      c.save(); c.translate(cx - R * 0.5, cy - R * 0.28); c.rotate(-0.25);
      c.fillStyle = 'rgba(200,220,255,0.08)'; c.fillRect(-U * 2.4, -U * 2, U * 2.2, U * 1.9); c.fillRect(U * 0.2, -U * 2, U * 2.2, U * 1.9); c.fillRect(-U * 2.4, U * 0.2, U * 2.2, U * 1.9); c.fillRect(U * 0.2, U * 0.2, U * 2.2, U * 1.9);
      c.restore();
      c.globalCompositeOperation = 'source-over';
      // the thick lip at the opening, and the foot
      const hw = R * 0.6;
      ellipse(c, cx, top, hw, U * 1.1); c.strokeStyle = 'rgba(230,246,255,0.45)'; c.lineWidth = Math.max(1, U * 0.5); c.stroke();
      c.beginPath(); c.ellipse(cx, top, hw, U * 1.1, 0, 0, Math.PI); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(1, U * 0.25); c.stroke();
      const fw = R * Math.sqrt(1 - 0.86 * 0.86);
      ellipse(c, cx, base, fw, U * 0.7); c.strokeStyle = 'rgba(210,235,250,0.35)'; c.lineWidth = Math.max(1, U * 0.35); c.stroke();
      c.restore();
    },
    back(c, sc, t) {
      c.save(); c.clip(sc.waterPath);
      drawCaustics(c, sc, t, sc.sandPath, 0.16, 0.7);
      const { cx, R } = sc.bowl;
      c.globalCompositeOperation = 'lighter';
      c.beginPath(); c.moveTo(cx - R * 0.9, sc.surf); c.lineTo(cx - R * 0.45, sc.surf); c.lineTo(cx + R * 0.2, sc.bowl.base); c.lineTo(cx - R * 0.5, sc.bowl.base); c.closePath();
      c.fillStyle = lg(c, 0, sc.surf, 0, sc.bowl.base, [[0, 'rgba(220,235,255,0.1)'], [1, 'rgba(220,235,255,0)']]); c.fill();
      c.restore();
    },
    mid(c, sc, t) {
      c.save(); c.clip(sc.waterPath);
      drawLayer(c, sc, t, 'mid');
      for (const p of sc.loose) {
        const y = p.y + p.oy;
        ellipse(c, p.x, y, p.rx, p.rx * 0.7, p.rot);
        c.fillStyle = rg(c, p.x - p.rx * 0.3, y - p.rx * 0.35, 0, p.x, y, p.rx * 1.1, [[0, mix(p.col, '#ffffff', 0.55)], [0.5, p.col], [1, mix(p.col, '#1a2030', 0.5)]]);
        c.fill();
      }
      drawBubbles(c, sc);
      c.restore();
    },
    front(c, sc, t) {
      const { cx, R } = sc.bowl, hw = R * 0.8;
      c.save(); c.clip(sc.bowlPath);
      ellipse(c, cx, sc.surf, hw, sc.U * 1.0); c.fillStyle = 'rgba(200,240,255,0.08)'; c.fill();
      c.restore();
      surface(c, sc, t, cx - hw * 0.995, cx + hw * 0.995);
    },
    step(sc, dt) {
      for (const p of sc.loose) { p.vy += sc.U * 60 * dt; p.oy = Math.min(0, p.oy + p.vy * dt); if (p.oy === 0) p.vy = 0; }
    },
    tap(sc, x, y, api) {
      const { cx, cy, R } = sc.bowl, d = Math.hypot(x - cx, y - cy);
      if (d > R + sc.U * 1.5 || y < sc.bowl.top - sc.U * 2) return false;
      if (sc.inWater(x, y) && y > sc.floor(x) - sc.U * 1.4) {
        for (const p of sc.loose) if (Math.abs(p.x - x) < R * 0.4) { p.vy = -sc.U * (8 + Math.random() * 8); p.rot += (Math.random() - 0.5) * 0.8; }
        api.play('pebbles'); api.scare(x, y, sc.U * 9);
        for (let i = 0; i < 4; i++) bubble(sc, x + (Math.random() - 0.5) * sc.U * 3, y - sc.U, sc.U * (0.15 + Math.random() * 0.2));
        return true;
      }
      if (sc.inWater(x, y) && hitStrand(sc, x, y, sc.U * 2)) { api.play('rustle'); return true; }
      if (!sc.inWater(x, y) || d > R * 0.94) { api.play('glass'); api.attract(x, clamp(y, sc.surf + sc.U * 3, sc.floor(x) - sc.U * 3), 3, 'curious'); return true; }
      return false;
    },
  };

  /* ---------------- Reed Tank: reeds, a mossy log, an air stone, a snail on the glass ---------------- */
  ENVS.reed = {
    layout(sc) {
      interior(sc, { l: 1.5, r: 1.5, t: 1.6, b: 2.6 });
      floorFn(sc, 0.83, 0.012, 11, [{ u: 0.87, w: 0.07, h: 0.022 }]);
      swimBox(sc);
      const U = sc.U, r = rng(12);
      const lx = X(sc, 0.31);
      sc.log = { x0: X(sc, 0.1), x1: X(sc, 0.5), y: sc.floor(lx) - sc.ih * 0.052, r: sc.ih * 0.066 };
      const sx = X(sc, 0.86);
      sc.stone = { x: sx, y: sc.floor(sx) - U * 0.3, r: U * 1.8 };
      sc.bubblers.push({ x: sx, y: sc.stone.y - U * 0.6, rate: 20, spread: U * 0.9, rmin: 0.12, rmax: 0.42, acc: 0, z: 0.5 });
      const greens = [['#5aa862', '#2d6a3c'], ['#6cb86a', '#336f40'], ['#4c9658', '#255a34'], ['#7cc070', '#3a7a44']];
      const reedAt = (u0, u1, n, h0, h1, layer) => { for (let i = 0; i < n; i++) { const x = X(sc, u0 + r() * (u1 - u0)), g = greens[Math.floor(r() * greens.length)]; sc.strands.push(strand({ kind: 'reed', x, y: sc.floor(x) + U * 0.6, len: sc.ih * (h0 + r() * (h1 - h0)), w: U * (0.9 + r() * 0.6), n: 9, col: g[0], col2: g[1], layer, sway: 0.2 + r() * 0.12, spd: 0.6 + r() * 0.4, lean: (r() - 0.5) * 0.2 })); } };
      reedAt(0.01, 0.3, 16, 0.5, 0.85, 'back');
      reedAt(0.56, 0.8, 11, 0.45, 0.8, 'back');
      reedAt(0.0, 0.05, 3, 0.7, 0.92, 'front');
      reedAt(0.95, 1.0, 2, 0.6, 0.85, 'front');
      for (const s of sc.strands) if (s.layer === 'front') { s.col = mix(s.col, '#0a2018', 0.35); s.col2 = mix(s.col2, '#0a2018', 0.35); s.w *= 1.4; }
      sc.snail = { x: X(sc, 0.66), y: Y(sc, 0.3), dir: 1, hide: 0, ph: 0 };
      const L = sc.log;
      sc.pois.push(
        { kind: 'hide', x: L.x1 + L.r * 0.05, y: L.y + L.r * 0.1, z: 0.95, face: 1 },
        { kind: 'hide', x: X(sc, 0.15), y: Y(sc, 0.62), z: 0.88 },
        { kind: 'ride', x: sx, y: sc.stone.y - U * 2, z: 0.5 },
        { kind: 'nibble', x: X(sc, 0.3), y: L.y - L.r * 1.05, z: 0.5 },
        { kind: 'nibble', x: X(sc, 0.2), y: L.y - L.r * 0.95, z: 0.5 },
        { kind: 'perch', x: X(sc, 0.62), y: Y(sc, 0.5), z: 0.75 },
        { kind: 'perch', x: X(sc, 0.2), y: Y(sc, 0.45), z: 0.75 },
      );
      sc.tint = { far: 'rgba(18,64,60,0.4)', near: 'rgba(24,70,66,0.08)' };
    },
    paintBg(c, sc) {
      const U = sc.U, r = rng(5);
      waterFill(c, sc, [[0, '#4a948a'], [0.45, '#22625c'], [1, '#0c2c2e']], '#3a5c5a');
      c.save(); c.beginPath(); c.rect(sc.ix0, sc.surf, sc.iw, sc.ih); c.clip();
      c.strokeStyle = 'rgba(8,36,32,0.26)'; c.lineCap = 'round';
      for (let i = 0; i < 24; i++) {
        const x = sc.ix0 + r() * sc.iw, y = sc.floor(x), L = sc.ih * (0.3 + r() * 0.5), bend = (r() - 0.5) * U * 8;
        c.lineWidth = U * (0.4 + r() * 0.5); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + bend * 0.3, y - L * 0.5, x + bend, y - L); c.stroke();
      }
      for (let i = 0; i < 6; i++) { const x = sc.ix0 + r() * sc.iw; rock(c, x, sc.floor(x) - U, U * (4 + r() * 5), U * (2.5 + r() * 2), '#24423c', 40 + i); }
      c.restore();
      paintSand(c, sc, { seed: 8, top: '#8e7a56', mid: '#6b5a3d', bot: '#30271a', crest: 'rgba(255,236,190,0.2)', specks: ['rgba(255,240,210,0.35)', 'rgba(0,0,0,0.25)', 'rgba(150,120,80,0.5)'], pebbles: 46, pebCols: ['#8a8278', '#6e665c', '#a39a8a', '#5a5048', '#9a8a70'] });
      const s = sc.stone;
      rock(c, s.x - U * 3.4, s.y + U * 0.2, U * 2.6, U * 1.6, '#6f6a62', 3);
      rock(c, s.x + U * 3.2, s.y + U * 0.4, U * 2.2, U * 1.3, '#7a746a', 4);
      rock(c, X(sc, 0.62), sc.floor(X(sc, 0.62)) - U * 0.4, U * 3, U * 1.7, '#5e5a52', 6, { moss: '#4a7a36' });
    },
    paintMid(c, sc) {
      const U = sc.U, L = sc.log, { x0, x1, y, r } = L, rr = rng(9);
      ellipse(c, (x0 + x1) / 2, y + r * 0.95, (x1 - x0) * 0.56, r * 0.32); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      const body = new Path2D();
      body.moveTo(x0, y - r); body.lineTo(x1, y - r * 0.94);
      body.ellipse(x1, y, r * 0.34, r * 0.94, 0, -Math.PI / 2, Math.PI / 2);
      body.lineTo(x0, y + r); body.ellipse(x0, y, r * 0.38, r, 0, Math.PI / 2, Math.PI * 1.5); body.closePath();
      c.fillStyle = lg(c, 0, y - r, 0, y + r, [[0, '#86663f'], [0.35, '#6a4d2f'], [1, '#2a1c10']]); c.fill(body);
      c.save(); c.clip(body);
      c.strokeStyle = 'rgba(30,18,8,0.5)'; c.lineWidth = Math.max(1, U * 0.18);
      for (let i = 0; i < 11; i++) { const yy = y - r + (i + 0.5) * (2 * r / 11); c.beginPath(); c.moveTo(x0 - r, yy); for (let x = x0; x <= x1; x += U * 2) c.lineTo(x, yy + Math.sin(x * 0.08 + i * 2) * U * 0.3); c.stroke(); }
      for (let i = 0; i < 3; i++) { const kx = lerp(x0, x1, 0.2 + i * 0.28), ky = y - r * 0.2 + rr() * r * 0.5; ellipse(c, kx, ky, U * 1, U * 0.6); c.fillStyle = '#3a2716'; c.fill(); ellipse(c, kx, ky, U * 0.5, U * 0.3); c.fillStyle = '#1a0f06'; c.fill(); }
      for (let i = 0; i < 7; i++) { const mx = lerp(x0, x1, rr()), my = y - r * 0.95; blobPath(c, mx, my, U * (1.6 + rr() * 2.2), U * (0.7 + rr() * 0.6), 200 + i, 0.35, 9); c.fillStyle = rgba(['#5f9a3a', '#4f8a32', '#6aa842'][i % 3], 0.85); c.fill(); }
      c.restore();
      // the open, hollow end
      ellipse(c, x1, y, r * 0.34, r * 0.94); c.fillStyle = '#a88660'; c.fill();
      ellipse(c, x1 + r * 0.02, y, r * 0.25, r * 0.74); c.fillStyle = '#5a3f26'; c.fill();
      ellipse(c, x1 + r * 0.04, y + r * 0.04, r * 0.19, r * 0.6); c.fillStyle = '#120a04'; c.fill();
      // two tiny toadstools on top
      for (const [k, h] of [[0.18, 1.6], [0.24, 1.1]]) {
        const mx = lerp(x0, x1, k), my = y - r * 0.92;
        c.fillStyle = '#efe2c6'; c.fillRect(mx - U * 0.2, my - U * h, U * 0.4, U * h);
        c.beginPath(); c.ellipse(mx, my - U * h, U * (0.6 + h * 0.25), U * 0.55, 0, Math.PI, TAU); c.fillStyle = '#d0703e'; c.fill();
        circle(c, mx - U * 0.2, my - U * (h + 0.25), U * 0.12); c.fillStyle = '#fff3dc'; c.fill();
      }
      // the air stone
      const s = sc.stone;
      ellipse(c, s.x, s.y, s.r, s.r * 0.55); c.fillStyle = rg(c, s.x - s.r * 0.3, s.y - s.r * 0.3, 0, s.x, s.y, s.r * 1.1, [[0, '#d8d4cc'], [0.6, '#9a958c'], [1, '#5a564e']]); c.fill();
      for (let i = 0; i < 9; i++) { circle(c, s.x + (rr() - 0.5) * s.r * 1.3, s.y + (rr() - 0.5) * s.r * 0.6, U * 0.1); c.fillStyle = 'rgba(40,40,40,0.5)'; c.fill(); }
      c.strokeStyle = 'rgba(30,40,40,0.7)'; c.lineWidth = Math.max(1, U * 0.22);
      c.beginPath(); c.moveTo(s.x + s.r * 0.9, s.y); c.quadraticCurveTo(sc.ix1 - U * 0.6, s.y, sc.ix1 - U * 0.5, sc.iy0); c.stroke();
    },
    paintFg(c, sc) {
      glass(c, sc);
      const ring = frameRing(c, sc);
      c.fillStyle = lg(c, 0, 0, 0, sc.H, [[0, '#2c3236'], [0.5, '#15191c'], [1, '#08090a']]); c.fill(ring, 'evenodd');
      frameBevel(c, sc, 'rgba(255,255,255,0.14)', 'rgba(0,0,0,0.6)');
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, sc.iy1 + (sc.H - sc.iy1) * 0.45, sc.W, Math.max(1, sc.U * 0.12));
    },
    back(c, sc, t) {
      shafts(c, sc, t, { n: 3, col: '#d8fff0', alpha: 0.06, w: 4, seed: 3 });
      drawCaustics(c, sc, t, sc.sandPath, 0.13);
      drawLayer(c, sc, t, 'back');
    },
    mid(c, sc, t) { drawBubbles(c, sc); },
    front(c, sc, t) {
      drawLayer(c, sc, t, 'front');
      const s = sc.snail, U = sc.U;
      c.save(); c.translate(s.x, s.y); c.scale(s.dir, 1);
      if (s.hide <= 0) {
        const st = Math.sin(s.ph * 3) * U * 0.15;
        ellipse(c, U * 0.6 + st, U * 0.5, U * 2.1, U * 0.55); c.fillStyle = 'rgba(150,140,120,0.75)'; c.fill();
        c.strokeStyle = 'rgba(150,140,120,0.85)'; c.lineWidth = Math.max(1, U * 0.18); c.lineCap = 'round';
        c.beginPath(); c.moveTo(U * 2.2 + st, U * 0.2); c.lineTo(U * 2.9 + st, -U * 0.8); c.moveTo(U * 2.4 + st, U * 0.3); c.lineTo(U * 3.3 + st, -U * 0.4); c.stroke();
        circle(c, U * 2.9 + st, -U * 0.8, U * 0.2); circle(c, U * 3.3 + st, -U * 0.4, U * 0.18); c.fillStyle = '#2a2620'; c.fill();
      }
      const wob = s.hide > 0 ? Math.sin(s.hide * 20) * 0.08 * Math.min(1, s.hide) : 0;
      c.rotate(wob);
      circle(c, 0, -U * 0.3, U * 1.45); c.fillStyle = rg(c, -U * 0.5, -U * 0.9, 0, 0, -U * 0.3, U * 1.6, [[0, '#f0c070'], [0.55, '#b0702c'], [1, '#5a3010']]); c.fill();
      c.beginPath(); for (let a = 0; a < TAU * 2.3; a += 0.2) { const rr = U * 1.3 * (1 - a / (TAU * 2.6)); c.lineTo(Math.cos(a) * rr, -U * 0.3 + Math.sin(a) * rr); } c.strokeStyle = 'rgba(60,30,10,0.55)'; c.lineWidth = Math.max(1, U * 0.16); c.stroke();
      c.restore();
      surface(c, sc, t, sc.ix0, sc.ix1);
    },
    step(sc, dt) {
      const s = sc.snail, U = sc.U;
      if (s.hide > 0) { s.hide -= dt; return; }
      s.ph += dt;
      s.x += s.dir * U * 0.22 * dt;
      s.y = Y(sc, 0.3) + Math.sin(s.x * 0.02) * U * 2;
      if (s.x > X(sc, 0.8)) s.dir = -1; else if (s.x < X(sc, 0.6)) s.dir = 1;
    },
    tap(sc, x, y, api) {
      const U = sc.U, s = sc.snail, L = sc.log, st = sc.stone;
      if (Math.hypot(x - s.x, y - s.y) < U * 3) { if (s.hide <= 0) { s.hide = 6; api.play('snail'); } return true; }
      if (Math.hypot(x - st.x, (y - st.y) * 1.5) < U * 3.5) {
        for (let i = 0; i < 34; i++) bubble(sc, st.x + (Math.random() - 0.5) * U * 2.5, st.y - U * (0.5 + Math.random() * 3), U * (0.2 + Math.random() * 0.6), { vy: U * (6 + Math.random() * 6) });
        api.play('bubbles', 1.4); api.lift(st.x, sc.surf, st.y, U * 6, 3.5);
        return true;
      }
      if (x > L.x0 - L.r * 0.4 && x < L.x1 + L.r * 0.4 && Math.abs(y - L.y) < L.r * 1.05) {
        api.play('knock'); api.scare(L.x1, L.y, L.r * 3.5);
        return true;
      }
      if (hitStrand(sc, x, y, U * 1.5)) { api.play('rustle'); return true; }
      return false;
    },
  };

  /* ---------------- Lily Garden: lily pads overhead, a driftwood arch, moss balls ---------------- */
  ENVS.lily = {
    layout(sc) {
      interior(sc, { l: 2, r: 2, t: 2, b: 3, air: 0.12 });
      floorFn(sc, 0.84, 0.016, 21, [{ u: 0.2, w: 0.1, h: 0.02 }, { u: 0.82, w: 0.12, h: 0.028 }]);
      swimBox(sc);
      sc.swim.y0 = sc.surf + sc.U * 3.4;
      const U = sc.U, r = rng(22);
      sc.pads = [[0.09, 0.07, 0], [0.27, 0.085, 1], [0.49, 0.065, 0], [0.69, 0.095, 0], [0.9, 0.075, 1]].map(([u, k, fl], i) => ({ x: X(sc, u), r: clamp(k * sc.iw, U * 4, U * 11), flower: !!fl, bob: 0, ph: i * 1.3, sx: X(sc, u) + (r() - 0.5) * U * 6 }));
      sc.arch = { x0: X(sc, 0.31), x1: X(sc, 0.67), top: Y(sc, 0.46) };
      sc.balls = [[0.22, 2.4], [0.7, 2.0], [0.77, 2.7]].map(([u, k]) => ({ x: X(sc, u), r: U * k, vx: 0, ang: r() * TAU }));
      sc.frog = { pad: 3, hop: null, croak: 0, blink: 3 };
      sc.fly = { state: 'away', t: 12 + r() * 10, x: 0, y: 0, pad: 1, from: null, k: 0, wing: 0 };
      const add = (kind, u0, u1, n, h0, h1, w, col, col2, layer) => { for (let i = 0; i < n; i++) { const x = X(sc, u0 + r() * (u1 - u0)); sc.strands.push(strand({ kind, x, y: sc.floor(x) + U * 0.6, len: sc.ih * (h0 + r() * (h1 - h0)), w: U * w, n: 9, col, col2, layer, sway: 0.14 + r() * 0.1, spd: 0.5 + r() * 0.3, lean: (r() - 0.5) * 0.25 })); } };
      add('red', 0.84, 0.97, 7, 0.38, 0.62, 1.5, '#c8583a', '#6a2a18', 'back');
      add('fan', 0.01, 0.12, 6, 0.4, 0.66, 1.6, '#6cbf58', '#2f6b2a', 'back');
      add('stem', 0.13, 0.3, 4, 0.5, 0.72, 1.4, '#66b456', '#2f6b2a', 'back');
      add('fan', 0.94, 1.0, 2, 0.5, 0.7, 2.1, '#3c7a36', '#1f4a1e', 'front');
      add('stem', 0.0, 0.04, 2, 0.55, 0.75, 1.9, '#3a7a34', '#1a441a', 'front');
      const A = sc.arch, cy = A.top + (sc.floor((A.x0 + A.x1) / 2) - A.top) * 0.62;
      sc.pois.push(
        { kind: 'through', path: [[A.x0 - U * 10, cy + U * 2], [(A.x0 + A.x1) / 2, cy], [A.x1 + U * 10, cy - U]], z0: 0.8, z1: 0.25 },
        { kind: 'hide', x: (A.x0 + A.x1) / 2, y: sc.floor((A.x0 + A.x1) / 2) - U * 2.5, z: 0.88 },
        ...sc.pads.map(p => ({ kind: 'shade', x: p.x, y: sc.surf + U * 5, z: 0.5 })),
        ...sc.pads.map(p => ({ kind: 'perch', x: (p.x + p.sx) / 2, y: lerp(sc.surf, sc.floor(p.sx), 0.55), z: 0.7 })),
        { kind: 'nibble', x: X(sc, 0.45), y: A.top + U, z: 0.5 },
      );
      sc.tint = { far: 'rgba(40,70,40,0.38)', near: 'rgba(50,80,40,0.08)' };
    },
    paintBg(c, sc) {
      const U = sc.U, r = rng(31);
      waterFill(c, sc, [[0, '#78995a'], [0.3, '#466f48'], [1, '#132a1c']], '#55673f');
      c.save(); c.beginPath(); c.rect(sc.ix0, sc.surf, sc.iw, sc.ih); c.clip();
      for (let i = 0; i < 26; i++) { const x = sc.ix0 + r() * sc.iw, y = sc.floor(x) - r() * sc.ih * 0.35; blobPath(c, x, y, U * (3 + r() * 6), U * (4 + r() * 8), 300 + i, 0.3, 9); c.fillStyle = `rgba(16,44,22,${0.22 + r() * 0.2})`; c.fill(); }
      c.restore();
      paintSand(c, sc, { seed: 18, top: '#a08a62', mid: '#7a6646', bot: '#33281a', crest: 'rgba(255,240,190,0.24)', specks: ['rgba(255,240,200,0.4)', 'rgba(0,0,0,0.22)', 'rgba(120,90,50,0.5)'], pebbles: 52, pebCols: ['#b09a74', '#7d6a4c', '#c8b48c', '#6a5a40', '#9a8a6a'] });
      for (const [u, k] of [[0.34, 1.6], [0.66, 1.9], [0.08, 2.2]]) { const x = X(sc, u); rock(c, x, sc.floor(x) - U * 0.5, U * 2.4 * k, U * 1.3 * k, '#5d5a4a', 70 + k * 10, { moss: '#5a8a3a' }); }
    },
    paintMid(c, sc) {
      const U = sc.U, A = sc.arch, r = rng(41);
      const fL = sc.floor(A.x0), fR = sc.floor(A.x1), mx = (A.x0 + A.x1) / 2;
      const P = [];
      for (let i = 0; i <= 24; i++) {
        const k = i / 24, x = lerp(A.x0, A.x1, k) + Math.sin(k * 9) * U * 0.6;
        const y = lerp(fL, fR, k) - Math.pow(Math.sin(k * Math.PI), 0.55) * (lerp(fL, fR, k) - A.top) - Math.sin(k * 17) * U * 0.4;
        P.push([x, y]);
      }
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const [w, col] of [[3.4, '#2e2418'], [2.8, '#6e5a44'], [1.6, '#8e7a62'], [0.6, '#b8a68a']]) {
        c.beginPath(); smooth(c, P.map(([x, y]) => [x, y - (3.4 - w) * U * 0.18])); c.strokeStyle = col; c.lineWidth = U * w; c.stroke();
      }
      // roots splaying into the sand, and a broken twig
      for (const [x0, y0, s] of [[A.x0, fL, -1], [A.x1, fR, 1]]) for (let i = 0; i < 3; i++) {
        c.beginPath(); c.moveTo(x0, y0 - U); c.quadraticCurveTo(x0 + s * U * (2 + i * 2), y0 - U * 0.5, x0 + s * U * (3 + i * 3), y0 + U * 0.6);
        c.strokeStyle = '#4e3e2c'; c.lineWidth = U * (1.2 - i * 0.3); c.stroke();
      }
      c.beginPath(); c.moveTo(P[7][0], P[7][1]); c.quadraticCurveTo(P[7][0] - U * 3, P[7][1] - U * 5, P[7][0] - U * 2, P[7][1] - U * 8); c.strokeStyle = '#6e5a44'; c.lineWidth = U * 0.8; c.stroke();
      // java fern on the wood
      for (let i = 0; i < 14; i++) {
        const p = P[2 + Math.floor(r() * 20)], a = -Math.PI / 2 + (r() - 0.5) * 1.8, L = U * (2.5 + r() * 3);
        c.save(); c.translate(p[0], p[1] - U); c.rotate(a + Math.PI / 2);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.28, -L * 0.5, 0, -L); c.quadraticCurveTo(-L * 0.28, -L * 0.5, 0, 0);
        c.fillStyle = r() < 0.5 ? '#3f8a3a' : '#2f7030'; c.fill();
        c.strokeStyle = 'rgba(160,220,120,0.35)'; c.lineWidth = Math.max(0.6, U * 0.08); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -L * 0.9); c.stroke();
        c.restore();
      }
      void mx;
    },
    paintFg(c, sc) {
      glass(c, sc, { sheen: 0.05 });
      const ring = frameRing(c, sc);
      c.fillStyle = lg(c, 0, 0, sc.W, sc.H, [[0, '#a8743f'], [0.5, '#875a30'], [1, '#5e3c1e']]); c.fill(ring, 'evenodd');
      grain(c, sc, ring, ['rgba(60,32,12,0.25)', 'rgba(255,220,170,0.12)', 'rgba(90,50,20,0.2)'], 7);
      c.strokeStyle = 'rgba(40,20,8,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(sc.ix0, sc.iy0); c.moveTo(sc.W, 0); c.lineTo(sc.ix1, sc.iy0); c.moveTo(0, sc.H); c.lineTo(sc.ix0, sc.iy1); c.moveTo(sc.W, sc.H); c.lineTo(sc.ix1, sc.iy1); c.stroke();
      frameBevel(c, sc, 'rgba(255,230,190,0.28)', 'rgba(30,14,4,0.6)');
    },
    back(c, sc, t) {
      const U = sc.U;
      shafts(c, sc, t, { n: 4, col: '#fff2b8', alpha: 0.07, w: 3.6, seed: 9, u0: 0.18, u1: 0.8 });
      drawCaustics(c, sc, t, sc.sandPath, 0.15);
      c.save();
      for (const p of sc.pads) {
        const fx = p.sx + U * 2;
        ellipse(c, fx, sc.floor(fx) + U * 0.3, p.r * 0.9, U * 1.1); c.fillStyle = 'rgba(10,30,10,0.22)'; c.fill();
        c.beginPath(); c.moveTo(p.x, sc.surf + U * 0.5);
        c.bezierCurveTo(p.x + Math.sin(t * 0.6 + p.ph) * U * 2, lerp(sc.surf, sc.floor(p.sx), 0.35), p.sx - Math.sin(t * 0.5 + p.ph) * U * 2, lerp(sc.surf, sc.floor(p.sx), 0.7), p.sx, sc.floor(p.sx) + U * 0.4);
        c.strokeStyle = '#3e6a30'; c.lineWidth = Math.max(1, U * 0.32); c.stroke();
      }
      c.restore();
      drawLayer(c, sc, t, 'back');
    },
    mid(c, sc, t) {
      for (const b of sc.balls) {
        const y = sc.floor(b.x) - b.r * 0.85;
        ellipse(c, b.x, y + b.r * 0.85, b.r * 0.95, b.r * 0.25); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
        circle(c, b.x, y, b.r); c.fillStyle = rg(c, b.x - b.r * 0.35, y - b.r * 0.4, 0, b.x, y, b.r * 1.05, [[0, '#9ad66a'], [0.55, '#4e9a3a'], [1, '#1f4a1a']]); c.fill();
        c.save(); c.translate(b.x, y); c.rotate(b.ang);
        for (let i = 0; i < 26; i++) { const a = i * 2.4, rr = b.r * (0.97 + (i % 3) * 0.04); circle(c, Math.cos(a) * rr, Math.sin(a) * rr, b.r * 0.12); c.fillStyle = i % 2 ? 'rgba(120,200,90,0.6)' : 'rgba(30,80,25,0.55)'; c.fill(); }
        for (let i = 0; i < 8; i++) { const a = i * 0.8, rr = b.r * 0.55; circle(c, Math.cos(a) * rr, Math.sin(a) * rr, b.r * 0.08); c.fillStyle = 'rgba(170,230,120,0.4)'; c.fill(); }
        c.restore();
      }
      drawBubbles(c, sc);
    },
    front(c, sc, t) {
      const U = sc.U;
      drawLayer(c, sc, t, 'front');
      surface(c, sc, t, sc.ix0, sc.ix1, '#f0ffd8');
      for (const [i, p] of sc.pads.entries()) {
        const y = sc.surf + Math.sin(t * 7 + p.ph) * p.bob * U * 0.5 + Math.sin(t * 0.8 + p.ph) * U * 0.12;
        // the pad, seen almost edge-on: its veined underside and the rim of its top
        ellipse(c, p.x, y + U * 0.2, p.r, U * 0.9); c.fillStyle = '#2c5426'; c.fill();
        c.save(); ellipse(c, p.x, y + U * 0.2, p.r, U * 0.9); c.clip();
        c.strokeStyle = 'rgba(140,200,110,0.35)'; c.lineWidth = Math.max(0.6, U * 0.08);
        for (let k = -5; k <= 5; k++) { c.beginPath(); c.moveTo(p.x, y + U * 0.4); c.lineTo(p.x + k * p.r * 0.2, y + U * 1.1); c.stroke(); }
        c.restore();
        c.beginPath(); c.ellipse(p.x, y - U * 0.15, p.r, U * 0.7, 0, Math.PI * 1.04, Math.PI * 1.96); c.strokeStyle = '#7cbc5a'; c.lineWidth = U * 0.5; c.stroke();
        if (p.flower) this.lotus(c, p.x - p.r * 0.25, y - U * 0.4, U, t + i);
        if (sc.frog.pad === i && !sc.frog.hop) this.frog(c, sc, p.x + p.r * 0.2, y - U * 0.4, t);
      }
      const F = sc.frog;
      if (F.hop) {
        const a = sc.pads[F.hop.from], b = sc.pads[F.hop.to], k = F.hop.k;
        const x = lerp(a.x + a.r * 0.2, b.x + b.r * 0.2, k), y = sc.surf - U * 0.4 - Math.sin(k * Math.PI) * U * 7;
        this.frog(c, sc, x, y, t, true);
      }
      const D = sc.fly;
      if (D.state !== 'away') {
        c.save(); c.translate(D.x, D.y); c.rotate(D.state === 'perched' ? 0 : Math.sin(t * 3) * 0.15);
        c.fillStyle = 'rgba(220,240,255,0.35)';
        const fl = D.state === 'perched' ? Math.sin(t * 30) * 0.2 * (Math.sin(t * 2) > 0.7 ? 1 : 0) : Math.sin(t * 60) * 0.6;
        for (const s of [-1, 1]) for (const o of [0, 1]) { c.save(); c.translate(o * U * 0.6, 0); c.rotate(s * (0.25 + fl) - Math.PI / 2); ellipse(c, 0, -U * 1.6, U * 0.45, U * 1.6); c.fill(); c.restore(); }
        c.strokeStyle = '#2f7fd0'; c.lineWidth = U * 0.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-U * 2.6, 0); c.lineTo(U * 1.2, 0); c.stroke();
        circle(c, U * 1.4, 0, U * 0.45); c.fillStyle = '#1e5aa0'; c.fill();
        c.restore();
      }
    },
    lotus(c, x, y, U, t) {
      const pet = (a, L, w, col) => { c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(w, -L * 0.6, 0, -L); c.quadraticCurveTo(-w, -L * 0.6, 0, 0); c.fillStyle = col; c.fill(); c.restore(); };
      for (const a of [-1.1, 1.1, -0.75, 0.75]) pet(a, U * 3, U * 1.1, '#e88aa8');
      for (const a of [-0.4, 0.4, 0]) pet(a + Math.sin(t * 0.7) * 0.03, U * 3.4, U * 1.1, '#f6b8cc');
      circle(c, x, y - U * 0.8, U * 0.6); c.fillStyle = '#f2d060'; c.fill();
    },
    frog(c, sc, x, y, t, air) {
      const U = sc.U, F = sc.frog, croak = F.croak > 0 ? Math.sin(Math.min(1, F.croak) * Math.PI) : 0;
      c.save(); c.translate(x, y);
      if (air) c.rotate(-0.3);
      circle(c, U * 0.9, -U * 0.4, U * (0.6 + croak * 0.7)); c.fillStyle = 'rgba(230,220,160,0.9)'; c.fill();
      ellipse(c, 0, -U * 0.9, U * 1.7, U * 1.1); c.fillStyle = rg(c, -U * 0.4, -U * 1.6, 0, 0, -U * 0.9, U * 2, [[0, '#9ad060'], [1, '#3a7a2a']]); c.fill();
      ellipse(c, -U * 1.2, -U * 0.2, U * 0.9, U * 0.35, 0.3); c.fillStyle = '#3f7f2e'; c.fill();
      const bl = F.blink < 0.12 ? 0.2 : 1;
      for (const ex of [U * 0.3, U * 1.1]) { circle(c, ex, -U * 1.9, U * 0.5); c.fillStyle = '#7ab84e'; c.fill(); ellipse(c, ex + U * 0.1, -U * 1.95, U * 0.28, U * 0.3 * bl); c.fillStyle = '#1a1a10'; c.fill(); }
      c.restore();
    },
    step(sc, dt, t, api) {
      const U = sc.U;
      for (const p of sc.pads) p.bob = Math.max(0, p.bob - dt * 0.8);
      for (const b of sc.balls) {
        b.vx *= Math.exp(-dt * 1.1);
        b.x += b.vx * dt; b.ang += b.vx * dt / b.r;
        if (b.x < sc.ix0 + b.r) { b.x = sc.ix0 + b.r; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x > sc.ix1 - b.r) { b.x = sc.ix1 - b.r; b.vx = -Math.abs(b.vx) * 0.5; }
        for (const o of sc.balls) if (o !== b) { const d = o.x - b.x, m = o.r + b.r; if (Math.abs(d) < m) { const push = (m - Math.abs(d)) * Math.sign(d || 1) * 0.5; o.x += push; b.x -= push; const v = (b.vx - o.vx) * 0.5; o.vx += v; b.vx -= v; } }
      }
      const F = sc.frog;
      F.blink -= dt; if (F.blink < 0) F.blink = 2 + Math.random() * 4;
      if (F.croak > 0) F.croak -= dt * 1.4;
      if (F.hop) {
        F.hop.k += dt / 0.7;
        if (F.hop.k >= 1) { F.pad = F.hop.to; sc.pads[F.pad].bob = 1; api.ripple(sc.pads[F.pad].x, sc.surf, 1.2); api.play('plip'); F.hop = null; }
      }
      const D = sc.fly;
      D.t -= dt;
      if (D.state === 'away' && D.t <= 0) {
        D.pad = Math.floor(Math.random() * sc.pads.length);
        if (D.pad === F.pad) D.pad = (D.pad + 2) % sc.pads.length;
        D.from = [Math.random() < 0.5 ? sc.ix0 - U * 5 : sc.ix1 + U * 5, sc.iy0 + U]; D.state = 'arrive'; D.k = 0;
      } else if (D.state === 'arrive') {
        D.k = Math.min(1, D.k + dt / 2.6);
        const p = sc.pads[D.pad], tx = p.x - p.r * 0.5, ty = sc.surf - U * 1.4, e = 1 - (1 - D.k) ** 2;
        D.x = lerp(D.from[0], tx, e) + Math.sin(D.k * 9) * U * 2 * (1 - D.k); D.y = lerp(D.from[1], ty, e) + Math.sin(D.k * 13) * U * 1.5 * (1 - D.k);
        if (D.k >= 1) { D.state = 'perched'; D.t = 9 + Math.random() * 14; }
      } else if (D.state === 'perched') {
        sc.target = { x: D.x, y: D.y };
        if (D.t <= 0) this.shoo(sc);
      } else if (D.state === 'leave') {
        D.k += dt / 1.8; D.x += D.vx * dt; D.y -= U * 9 * dt + Math.sin(D.k * 10) * U * 0.2; D.vx *= 1 + dt;
        if (D.k >= 1) { D.state = 'away'; D.t = 18 + Math.random() * 30; }
      }
      if (D.state !== 'perched') sc.target = null;
    },
    shoo(sc) {
      const D = sc.fly;
      if (D.state !== 'perched' && D.state !== 'arrive') return;
      D.state = 'leave'; D.k = 0; D.vx = (Math.random() < 0.5 ? -1 : 1) * sc.U * 8; sc.target = null;
    },
    tap(sc, x, y, api) {
      const U = sc.U, D = sc.fly, F = sc.frog;
      if (D.state === 'perched' && Math.hypot(x - D.x, y - D.y) < U * 4) { this.shoo(sc); api.play('flutter'); return true; }
      for (const [i, p] of sc.pads.entries()) {
        if (Math.abs(x - p.x) < p.r && Math.abs(y - sc.surf) < U * (F.pad === i ? 4.5 : 2.6)) {
          p.bob = 1; api.ripple(p.x, sc.surf, 1);
          if (F.pad === i && !F.hop) {
            F.croak = 1; api.play('frog');
            setTimeout(() => { if (!F.hop) { let to = (i + 1 + Math.floor(Math.random() * (sc.pads.length - 1))) % sc.pads.length; if (to === i) to = (i + 1) % sc.pads.length; F.hop = { from: F.pad, to, k: 0 }; } }, 650);
          } else api.play('plip');
          api.scare(p.x, sc.surf + U * 4, U * 8);
          return true;
        }
      }
      for (const b of sc.balls) {
        const by = sc.floor(b.x) - b.r * 0.85;
        if (Math.hypot(x - b.x, y - by) < b.r * 1.5) { b.vx += (x < b.x ? 1 : -1) * U * (9 + Math.random() * 5); api.play('moss'); return true; }
      }
      const A = sc.arch;
      if (x > A.x0 && x < A.x1 && y > A.top - U * 2 && y < A.top + U * 4) { api.play('knock'); api.procession('arch', 3); return true; }
      if (hitStrand(sc, x, y, U * 1.5)) { api.play('rustle'); return true; }
      return false;
    },
  };

  /* ---------------- Coral Reef: corals, an anemone, a giant clam, a chest ---------------- */
  function branchCoral(c, x, y, len, ang, w, col, tip, r, depth = 0) {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + x1) / 2 + (r() - 0.5) * len * 0.3, (y + y1) / 2, x1, y1);
    c.strokeStyle = col; c.lineWidth = w; c.stroke();
    if (depth > 3 || len < w * 2) { circle(c, x1, y1, w * 0.62); c.fillStyle = tip; c.fill(); return; }
    const n = r() < 0.7 ? 2 : 3;
    for (let i = 0; i < n; i++) branchCoral(c, x1, y1, len * (0.62 + r() * 0.2), ang + (i - (n - 1) / 2) * (0.5 + r() * 0.3), w * 0.78, col, tip, r, depth + 1);
  }
  function seaFan(c, x, y, R, col, r) {
    c.save(); c.globalAlpha = 0.85;
    const grow = (x0, y0, a, L, d) => {
      const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = Math.max(0.5, 2.2 - d * 0.35); c.strokeStyle = col; c.stroke();
      if (d < 6) { grow(x1, y1, a - 0.22 - r() * 0.16, L * 0.8, d + 1); grow(x1, y1, a + 0.22 + r() * 0.16, L * 0.8, d + 1); }
    };
    for (const a of [-0.5, -0.17, 0.17, 0.5]) grow(x, y, -Math.PI / 2 + a, R * 0.24, 1);
    c.restore();
  }
  ENVS.reef = {
    layout(sc) {
      interior(sc, { l: 1.8, r: 1.8, t: 1.9, b: 3, air: 0.07 });
      floorFn(sc, 0.85, 0.016, 31, [{ u: 0.1, w: 0.11, h: 0.045 }, { u: 0.62, w: 0.08, h: 0.045 }, { u: 0.88, w: 0.1, h: 0.025 }]);
      swimBox(sc);
      const U = sc.U, ax = X(sc, 0.62);
      sc.anem = { x: ax, y: sc.floor(ax) - sc.ih * 0.045, R: clamp(sc.ih * 0.13, U * 6, U * 14), shut: 0, n: 30 };
      const kx = X(sc, 0.4);
      sc.clam = { x: kx, y: sc.floor(kx) + U * 0.3, w: clamp(sc.iw * 0.12, U * 7, U * 15), open: 0.7, target: 0.7, snapT: 0, breath: 0 };
      const cx = X(sc, 0.8);
      sc.chest = { x: cx, y: sc.floor(cx) + U * 0.5, w: clamp(sc.iw * 0.1, U * 6.5, U * 12), lid: 0, open: 0 };
      sc.stars = [{ x: X(sc, 0.07), y: Y(sc, 0.34), r: U * 1.8, rot: 0.3, spin: 0 }, { x: X(sc, 0.94), y: Y(sc, 0.56), r: U * 1.5, rot: 1.2, spin: 0 }];
      const A = sc.anem;
      sc.pois.push(
        { kind: 'anemone', x: A.x, y: A.y - A.R * 0.45, z: 0.5, r: A.R * 0.5 },
        { kind: 'nibble', x: X(sc, 0.1), y: sc.floor(X(sc, 0.1)) - sc.ih * 0.18, z: 0.55 },
        { kind: 'nibble', x: X(sc, 0.27), y: sc.floor(X(sc, 0.27)) - U * 4, z: 0.5 },
        { kind: 'nibble', x: X(sc, 0.92), y: sc.floor(X(sc, 0.92)) - U * 7, z: 0.6 },
        { kind: 'hide', x: X(sc, 0.12), y: sc.floor(X(sc, 0.12)) - U * 3, z: 0.9 },
        { kind: 'hide', x: X(sc, 0.74), y: sc.floor(X(sc, 0.74)) - sc.ih * 0.14, z: 0.92 },
        { kind: 'gather', x: kx, y: sc.clam.y - U * 5, z: 0.45 },
        { kind: 'perch', x: X(sc, 0.5), y: Y(sc, 0.58), z: 0.8 },
      );
      sc.tint = { far: 'rgba(20,80,140,0.36)', near: 'rgba(30,100,160,0.06)' };
    },
    paintBg(c, sc) {
      const U = sc.U, r = rng(51);
      waterFill(c, sc, [[0, '#4cb8db'], [0.4, '#2180b5'], [1, '#0b3666']], '#467f9c');
      c.save(); c.beginPath(); c.rect(sc.ix0, sc.surf, sc.iw, sc.ih); c.clip();
      for (const [col, k, n] of [['rgba(25,90,150,0.55)', 0.42, 9], ['rgba(20,70,130,0.6)', 0.28, 11]]) {
        for (let i = 0; i < n; i++) {
          const x = sc.ix0 + (i + r()) / n * sc.iw, y = sc.floor(x), h = sc.ih * k * (0.4 + r() * 0.6);
          blobPath(c, x, y - h * 0.3, U * (4 + r() * 6), h * 0.55, 400 + i * 7, 0.35, 9); c.fillStyle = col; c.fill();
          c.strokeStyle = col; c.lineWidth = U * 0.8; c.lineCap = 'round';
          for (let b = 0; b < 3; b++) { c.beginPath(); c.moveTo(x, y - h * 0.5); c.lineTo(x + (r() - 0.5) * U * 9, y - h * (0.8 + r() * 0.4)); c.stroke(); }
        }
      }
      seaFan(c, X(sc, 0.5), sc.floor(X(sc, 0.5)) - U, sc.ih * 0.36, 'rgba(186,96,196,0.8)', r);
      // a table coral at the back
      const tx = X(sc, 0.74), ty = sc.floor(tx) - sc.ih * 0.2;
      c.fillStyle = '#7a6aa0'; c.fillRect(tx - U * 0.8, ty, U * 1.6, sc.floor(tx) - ty);
      ellipse(c, tx, ty, sc.iw * 0.08, U * 1.4); c.fillStyle = lg(c, 0, ty - U * 1.4, 0, ty + U * 1.4, [[0, '#d0b4f0'], [1, '#6a5a90']]); c.fill();
      c.restore();
      paintSand(c, sc, { seed: 28, top: '#e4d2a8', mid: '#c4ae82', bot: '#6e5c40', crest: 'rgba(255,250,225,0.4)', specks: ['rgba(255,255,255,0.55)', 'rgba(150,120,80,0.3)', 'rgba(240,170,160,0.45)', 'rgba(120,160,200,0.3)'], pebbles: 26, pebCols: ['#f4e8d8', '#e8c8b0', '#d8b8a8', '#c8d8e0', '#f0d0c0'] });
      for (let i = 0; i < 6; i++) {
        const x = sc.ix0 + r() * sc.iw, y = sc.floor(x) + U * (0.6 + r() * 2), s = U * (0.8 + r() * 0.6);
        c.save(); c.translate(x, y); c.rotate((r() - 0.5) * 0.8);
        c.beginPath(); c.moveTo(0, s * 0.6); for (let k = 0; k <= 8; k++) { const a = Math.PI + k / 8 * Math.PI; c.lineTo(Math.cos(a) * s * 1.3, s * 0.6 + Math.sin(a) * s * 1.4); } c.closePath();
        c.fillStyle = ['#f6d6c2', '#f2c0b0', '#fbe6d0'][i % 3]; c.fill();
        c.strokeStyle = 'rgba(160,100,80,0.45)'; c.lineWidth = Math.max(0.6, U * 0.08);
        for (let k = 1; k < 8; k++) { const a = Math.PI + k / 8 * Math.PI; c.beginPath(); c.moveTo(0, s * 0.6); c.lineTo(Math.cos(a) * s * 1.2, s * 0.6 + Math.sin(a) * s * 1.3); c.stroke(); }
        c.restore();
      }
    },
    paintMid(c, sc) {
      const U = sc.U, r = rng(61);
      c.lineCap = 'round';
      const bx = X(sc, 0.1), by = sc.floor(bx);
      rock(c, bx, by - U, U * 7, U * 3.4, '#7a6a72', 5);
      for (const [dx, col, tip, L] of [[-4, '#e8785a', '#ffd0a0', 0.15], [0, '#f08aa8', '#ffe0ec', 0.2], [4, '#ef9a4a', '#ffe2a8', 0.14], [-1.5, '#c86ac8', '#f6c8ff', 0.11]]) branchCoral(c, bx + dx * U, by - U * 2.6, sc.ih * L, -Math.PI / 2 + dx * 0.05, U * 1.15, col, tip, r);
      const gx = X(sc, 0.27), gy = sc.floor(gx) - U * 0.6, gr = clamp(sc.iw * 0.05, U * 3.5, U * 7);
      c.beginPath(); c.ellipse(gx, gy, gr, gr * 0.78, 0, Math.PI, TAU); c.closePath();
      c.fillStyle = rg(c, gx - gr * 0.3, gy - gr * 0.6, 0, gx, gy, gr * 1.1, [[0, '#e8d890'], [0.6, '#b8a058'], [1, '#6a5a30']]); c.fill();
      c.save(); c.clip();
      c.strokeStyle = 'rgba(90,70,30,0.55)'; c.lineWidth = Math.max(0.8, U * 0.16);
      for (let i = 0; i < 7; i++) { c.beginPath(); for (let x = gx - gr; x <= gx + gr; x += U * 0.5) c.lineTo(x, gy - gr * 0.12 * (i + 0.5) * 1.2 + Math.sin(x * 0.5 + i * 2) * U * 0.35); c.stroke(); }
      c.restore();
      const A = sc.anem;
      rock(c, A.x, A.y + U * 1.5, A.R * 0.75, U * 2.4, '#6d5e74', 8, { moss: '#8a5a7a' });
      const tx = X(sc, 0.92), tyy = sc.floor(tx);
      for (let i = 0; i < 5; i++) {
        const x = tx + (i - 2) * U * 1.5, h = U * (4 + r() * 6), w = U * 1.1;
        c.fillStyle = lg(c, x - w, 0, x + w, 0, [[0, '#6a3a8a'], [0.5, '#b070d0'], [1, '#5a2a7a']]); c.fillRect(x - w / 2, tyy - h, w, h);
        ellipse(c, x, tyy - h, w * 0.5, w * 0.22); c.fillStyle = '#2a1040'; c.fill();
      }
    },
    paintFg(c, sc) {
      glass(c, sc, { sheen: 0.07 });
      const ring = frameRing(c, sc);
      c.fillStyle = lg(c, 0, 0, 0, sc.H, [[0, '#fae6a8'], [0.12, '#e2b864'], [0.5, '#b88a3c'], [0.88, '#d6a448'], [1, '#8a6024']]); c.fill(ring, 'evenodd');
      c.save(); c.clip(ring, 'evenodd');
      c.fillStyle = lg(c, 0, 0, sc.W, 0, [[0, 'rgba(255,250,220,0.18)'], [0.5, 'rgba(255,250,220,0)'], [1, 'rgba(255,250,220,0.12)']]); c.fillRect(0, 0, sc.W, sc.H);
      c.restore();
      const inset = sc.U * 0.65;
      c.strokeStyle = 'rgba(110,70,20,0.55)'; c.lineWidth = 1; c.strokeRect(inset, inset, sc.W - inset * 2, sc.H - inset * 2);
      c.strokeStyle = 'rgba(255,245,210,0.4)'; c.strokeRect(inset + 1, inset + 1, sc.W - inset * 2, sc.H - inset * 2);
      rivets(c, sc, '#c8943a', sc.U * 7);
      frameBevel(c, sc, 'rgba(255,250,225,0.5)', 'rgba(70,44,10,0.7)');
    },
    back(c, sc, t) {
      shafts(c, sc, t, { n: 6, col: '#e6fbff', alpha: 0.085, w: 3.4, seed: 4 });
      drawCaustics(c, sc, t, sc.sandPath, 0.17);
      if (!sc._wall) { sc._wall = new Path2D(); sc._wall.rect(sc.ix0, sc.surf, sc.iw, sc.iy1 - sc.surf); }
      drawCaustics(c, sc, t * 0.8, sc._wall, 0.04, 1.6, 0.8);
    },
    mid(c, sc, t) {
      const U = sc.U, A = sc.anem;
      // the anemone: a crown of tentacles that sway, and pull in when touched
      const open = 1 - A.shut;
      for (let i = 0; i < A.n; i++) {
        const k = i / (A.n - 1), base = -Math.PI * (0.92 - k * 0.84), L = A.R * (0.55 + 0.45 * Math.sin(k * Math.PI)) * (0.35 + 0.65 * open);
        const P = [[A.x + Math.cos(base) * A.R * 0.25, A.y + Math.sin(base) * A.R * 0.12]];
        let a = base;
        for (let s = 1; s <= 5; s++) { a += Math.sin(t * 1.4 + i * 0.7 - s * 0.6) * 0.16; const p = P[s - 1]; P.push([p[0] + Math.cos(a) * L / 5, p[1] + Math.sin(a) * L / 5]); }
        c.beginPath(); smooth(c, P); c.strokeStyle = lg(c, P[0][0], P[0][1], P[5][0], P[5][1], [[0, '#8a4a9a'], [0.7, '#d070b8'], [1, '#ffc8f0']]);
        c.lineWidth = U * 0.75; c.lineCap = 'round'; c.stroke();
        circle(c, P[5][0], P[5][1], U * 0.42); c.fillStyle = '#ffd6f4'; c.fill();
      }
      ellipse(c, A.x, A.y, A.R * 0.32, U * 1.2); c.fillStyle = '#7a3a8a'; c.fill();
      // the giant clam
      const C = sc.clam, w = C.w, open2 = C.open + Math.sin(t * 0.7) * 0.04 * (C.snapT <= 0 ? 1 : 0);
      const scallop = (dir, lift) => {
        c.beginPath(); c.moveTo(C.x - w / 2, C.y);
        for (let i = 0; i <= 10; i++) { const k = i / 10, x = C.x - w / 2 + k * w, y = C.y + dir * (Math.sin(k * Math.PI) * w * 0.32 + lift) + ((i % 2) ? dir * w * 0.04 : 0); c.lineTo(x, y); }
        c.lineTo(C.x + w / 2, C.y); c.closePath();
      };
      ellipse(c, C.x, C.y + U * 0.6, w * 0.6, U * 1.2); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
      scallop(1, 0); c.fillStyle = lg(c, 0, C.y, 0, C.y + w * 0.36, [[0, '#d8d0c0'], [1, '#8a8070']]); c.fill();
      c.save(); c.clip(); c.strokeStyle = 'rgba(90,80,60,0.4)'; c.lineWidth = Math.max(0.8, U * 0.14);
      for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(C.x, C.y + w * 0.36); c.lineTo(C.x - w / 2 + i * w / 6, C.y); c.stroke(); }
      c.restore();
      if (open2 > 0.08) {
        const gap = open2 * w * 0.22;
        ellipse(c, C.x, C.y - gap * 0.4, w * 0.44, gap * 0.75); c.fillStyle = lg(c, C.x - w / 2, 0, C.x + w / 2, 0, [[0, '#1aa0a8'], [0.3, '#3ad0d0'], [0.5, '#4a6ae0'], [0.75, '#2ab0c0'], [1, '#147888']]); c.fill();
        for (let i = 0; i < 9; i++) { circle(c, C.x - w * 0.38 + i * w * 0.095, C.y - gap * 0.4 + Math.sin(i * 2) * gap * 0.3, U * 0.22); c.fillStyle = 'rgba(200,255,250,0.55)'; c.fill(); }
        if (C.pearl) { const px = C.x, py = C.y - gap * 0.35; circle(c, px, py, U * 3); c.fillStyle = rg(c, px, py, 0, px, py, U * 3, [[0, 'rgba(255,250,235,0.5)'], [1, 'rgba(255,250,235,0)']]); c.fill(); circle(c, px, py, U * 0.9); c.fillStyle = rg(c, px - U * 0.3, py - U * 0.3, 0, px, py, U, [[0, '#ffffff'], [0.6, '#f4ece0'], [1, '#c8bca8']]); c.fill(); }
        c.save(); c.translate(0, -gap); scallop(-1, 0); c.restore();
      } else { c.save(); c.translate(0, -U * 0.2); scallop(-1, 0); c.restore(); }
      c.fillStyle = lg(c, 0, C.y - w * 0.4 - open2 * w * 0.22, 0, C.y, [[0, '#ece6da'], [1, '#a89e8a']]); c.fill();
      c.strokeStyle = 'rgba(110,100,80,0.5)'; c.lineWidth = Math.max(0.8, U * 0.12); c.stroke();
      { const top = C.y - (open2 > 0.08 ? open2 * w * 0.22 : U * 0.2); c.save(); c.clip(); c.strokeStyle = 'rgba(110,100,80,0.35)';
        for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(C.x, top - w * 0.36); c.lineTo(C.x - w / 2 + i * w / 6, top); c.stroke(); } c.restore(); }
      this.chest(c, sc, sc.chest, t, ['#7a4a26', '#4a2a12', '#d8a848']);
      drawBubbles(c, sc);
    },
    chest(c, sc, K, t, [wood, dark, band]) {
      const U = sc.U, w = K.w, h = w * 0.5, x = K.x - w / 2, y = K.y - h;
      ellipse(c, K.x, K.y, w * 0.62, U * 1.2); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
      c.fillStyle = lg(c, 0, y, 0, K.y, [[0, wood], [1, dark]]); c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x, y + h * i / 4); c.lineTo(x + w, y + h * i / 4); c.stroke(); }
      c.fillStyle = band; c.fillRect(x + w * 0.12, y, w * 0.07, h); c.fillRect(x + w * 0.81, y, w * 0.07, h);
      if (K.lid > 0.05) {
        c.save(); c.globalCompositeOperation = 'lighter';
        ellipse(c, K.x, y, w * 0.45, h * 0.5 * K.lid); c.fillStyle = rg(c, K.x, y, 0, K.x, y, w * 0.5, [[0, `rgba(255,220,120,${0.55 * K.lid})`], [1, 'rgba(255,200,80,0)']]); c.fill();
        c.restore();
        for (let i = 0; i < 6; i++) { circle(c, x + w * (0.25 + i * 0.1), y - U * 0.3 + Math.sin(i * 2.3) * U * 0.3, U * 0.6); c.fillStyle = i % 2 ? '#f6d468' : '#e8b840'; c.fill(); }
      }
      c.save(); c.translate(x, y); c.rotate(-K.lid * 1.1);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -h * 0.25); c.bezierCurveTo(0, -h * 0.75, w, -h * 0.75, w, -h * 0.25); c.lineTo(w, 0); c.closePath();
      c.fillStyle = lg(c, 0, -h * 0.65, 0, 0, [[0, mix(wood, '#ffffff', 0.12)], [1, dark]]); c.fill();
      c.fillStyle = band; c.fillRect(w * 0.12, -h * 0.6, w * 0.07, h * 0.6); c.fillRect(w * 0.81, -h * 0.6, w * 0.07, h * 0.6);
      c.restore();
      c.fillStyle = band; c.fillRect(K.x - w * 0.06, y - h * 0.06, w * 0.12, h * 0.22);
      circle(c, K.x, y + h * 0.06, U * 0.22); c.fillStyle = '#2a1a08'; c.fill();
    },
    front(c, sc, t) {
      const U = sc.U;
      for (const s of sc.stars) {
        c.save(); c.translate(s.x, s.y); c.rotate(s.rot + Math.sin(s.spin * 12) * 0.25 * Math.min(1, s.spin));
        c.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s.r * 0.42 : s.r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fillStyle = rg(c, 0, 0, 0, 0, 0, s.r, [[0, '#ffb070'], [1, '#e0582e']]); c.fill();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; for (let k = 1; k <= 2; k++) { circle(c, Math.cos(a) * s.r * 0.3 * k, Math.sin(a) * s.r * 0.3 * k, U * 0.13); c.fillStyle = '#ffe0b0'; c.fill(); } }
        c.restore();
      }
      surface(c, sc, t, sc.ix0, sc.ix1);
      void U;
    },
    step(sc, dt, t, api) {
      const A = sc.anem, C = sc.clam, K = sc.chest;
      A.shut = Math.max(0, A.shut - dt * 0.35);
      if (C.snapT > 0) { C.snapT -= dt; C.open = Math.max(0, C.open - dt * 6); if (C.snapT <= 0) C.target = 0.7; }
      else C.open += (C.target - C.open) * Math.min(1, dt * 0.8);
      C.pearl = api.ready('clam');
      if (K.open > 0) { K.open -= dt; K.lid = Math.min(1, K.lid + dt * 2.2); } else K.lid = Math.max(0, K.lid - dt * 0.9);
      for (const s of sc.stars) s.spin = Math.max(0, s.spin - dt);
    },
    tap(sc, x, y, api) {
      const U = sc.U, A = sc.anem, C = sc.clam, K = sc.chest;
      for (const s of sc.stars) if (Math.hypot(x - s.x, y - s.y) < s.r * 1.3) { s.spin = 1; s.rot += 0.4; api.play('star'); return true; }
      if (Math.abs(x - C.x) < C.w * 0.55 && y > C.y - C.w * 0.45 && y < C.y + U * 1.5) {
        if (C.pearl && C.open > 0.4) {
          api.use('clam', 3 * 3600e3); C.pearl = false;
          api.pearl(C.x, C.y - C.w * 0.12, 10 + Math.floor(Math.random() * 9), 'epic');
          api.play('clamPearl');
        } else { C.snapT = 3.5; api.play('clam'); api.scare(C.x, C.y, C.w * 1.4); }
        return true;
      }
      if (Math.abs(x - K.x) < K.w * 0.6 && y > K.y - K.w * 0.65 && y < K.y + U) {
        if (K.open <= 0) {
          K.open = 4.5; api.play('chest');
          for (let i = 0; i < 26; i++) bubble(sc, K.x + (Math.random() - 0.5) * K.w * 0.8, K.y - K.w * 0.5, U * (0.2 + Math.random() * 0.5), { vy: U * (5 + Math.random() * 7) });
          if (api.ready('chest')) { api.use('chest', 6 * 3600e3); for (let i = 0; i < 3; i++) setTimeout(() => api.pearl(K.x + (i - 1) * U * 2, K.y - K.w * 0.45, 4 + Math.floor(Math.random() * 6), 'rare'), 300 + i * 260); }
          api.attract(K.x, K.y - U * 6, 4, 'curious');
        }
        return true;
      }
      if (Math.hypot(x - A.x, y - (A.y - A.R * 0.4)) < A.R * 0.9) { A.shut = 1; api.play('anemone'); api.event('anemone', A.x, A.y - A.R * 0.3); return true; }
      return false;
    },
  };

  /* ---------------- Shipwreck Cove: a sunken ship in a kelp forest ---------------- */
  ENVS.wreck = {
    layout(sc) {
      interior(sc, { l: 2, r: 2, t: 2, b: 3.2, air: 0.06 });
      floorFn(sc, 0.86, 0.02, 41, [{ u: 0.74, w: 0.22, h: 0.035 }, { u: 0.08, w: 0.07, h: 0.02 }]);
      swimBox(sc);
      const U = sc.U, r = rng(42);
      const L = sc.iw * 0.74, h = clamp(sc.ih * 0.3, U * 10, U * 26), ang = -0.3;
      const sx = X(sc, 0.43), sy = sc.floor(sx) + h * 0.12;
      const to = (u, v) => [sx + Math.cos(ang) * u * L - Math.sin(ang) * v * h, sy + Math.sin(ang) * u * L + Math.cos(ang) * v * h];
      sc.ship = { sx, sy, L, h, ang, to };
      sc.ports = [[0.42, -0.58], [0.56, -0.6], [0.7, -0.6]].map(([u, v]) => { const [x, y] = to(u, v); return { x, y, r: h * 0.09, glow: 0 }; });
      const [mx, my] = to(0.3, -1.0);
      const ma = -Math.PI / 2 - 0.38, ml = sc.ih * 0.5;
      sc.mast = { x: mx, y: my, a: ma, len: ml };
      const yk = 0.62, yx = mx + Math.cos(ma) * ml * yk, yy = my + Math.sin(ma) * ml * yk;
      sc.bell = { x: yx - U * 7, y: yy + U * 1.5, swing: 0, v: 0 };
      sc.yard = { x0: yx - U * 9, y0: yy - U * 1.6, x1: yx + U * 7, y1: yy + U * 1.4 };
      const hx = X(sc, 0.3);
      sc.helmet = { x: hx, y: sc.floor(hx) - U * 2.4, r: clamp(sc.ih * 0.075, U * 4, U * 8), burp: 4 };
      const cx = X(sc, 0.17);
      sc.chest = { x: cx, y: sc.floor(cx) + U * 1.2, w: clamp(sc.iw * 0.09, U * 6, U * 11), lid: 0, open: 0 };
      sc.anchor = { x: X(sc, 0.06), y: sc.floor(X(sc, 0.06)) };
      const kelp = (u0, u1, n, h0, h1, layer, dark) => { for (let i = 0; i < n; i++) { const x = X(sc, u0 + r() * (u1 - u0)); sc.strands.push(strand({ kind: 'kelp', x, y: sc.floor(x) + U * 0.5, len: sc.ih * (h0 + r() * (h1 - h0)), w: U * (1.5 + r() * 0.6), n: 10, col: mix('#8a8a3a', '#0a2018', dark), col2: mix('#5a5a22', '#0a2018', dark), layer, sway: 0.18 + r() * 0.1, spd: 0.4 + r() * 0.25, lean: (r() - 0.5) * 0.15 })); } };
      kelp(0.0, 0.38, 7, 0.62, 0.9, 'back', 0.25);
      kelp(0.55, 0.98, 6, 0.75, 0.92, 'back', 0.35);
      kelp(0.0, 0.03, 2, 0.8, 0.95, 'front', 0.5);
      kelp(0.97, 1.0, 1, 0.7, 0.9, 'front', 0.5);
      const [bx, by] = to(0.25, -0.35);
      sc.breach = { x: bx, y: by, r: h * 0.2 };
      const H = sc.helmet;
      sc.pois.push(
        { kind: 'hide', x: bx, y: by, z: 0.95, face: -1 },
        { kind: 'hide', x: X(sc, 0.08), y: Y(sc, 0.55), z: 0.88 },
        { kind: 'ride', x: H.x + H.r * 0.2, y: H.y - H.r * 1.2, z: 0.5 },
        ...sc.ports.map(p => ({ kind: 'gather', x: p.x - U * 2, y: p.y + U * 0.5, z: 0.35, port: p })),
        { kind: 'perch', x: sc.yard.x0 + U * 2, y: sc.yard.y0 + U * 3, z: 0.6 },
        { kind: 'perch', x: X(sc, 0.2), y: Y(sc, 0.5), z: 0.8 },
        { kind: 'nibble', x: to(0.5, -1.02)[0], y: to(0.5, -1.02)[1] - U, z: 0.5 },
      );
      sc.tint = { far: 'rgba(6,40,66,0.46)', near: 'rgba(10,50,80,0.1)' };
      sc.snow = Array.from({ length: 70 }, () => ({ x: sc.ix0 + Math.random() * sc.iw, y: sc.surf + Math.random() * sc.ih, s: 0.3 + Math.random() * 0.8, ph: Math.random() * TAU }));
    },
    paintBg(c, sc) {
      const U = sc.U, r = rng(71);
      waterFill(c, sc, [[0, '#3592ad'], [0.32, '#155878'], [1, '#04172a']], '#2c5c74');
      c.save(); c.beginPath(); c.rect(sc.ix0, sc.surf, sc.iw, sc.ih); c.clip();
      for (let i = 0; i < 7; i++) { const x = sc.ix0 + r() * sc.iw, y = sc.floor(x); blobPath(c, x, y - sc.ih * 0.1, U * (5 + r() * 8), sc.ih * (0.12 + r() * 0.22), 500 + i, 0.3, 8); c.fillStyle = 'rgba(8,40,62,0.6)'; c.fill(); }
      c.restore();
      // the anchor, half sunk, and its chain
      const A = sc.anchor, s = clamp(sc.ih * 0.012, U * 0.55, U * 1.1);
      c.save(); c.translate(A.x, A.y + s * 3); c.rotate(0.3);
      c.strokeStyle = '#5c6264'; c.lineCap = 'round';
      c.lineWidth = s * 2.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 16); c.stroke();
      c.lineWidth = s * 1.6; c.beginPath(); c.moveTo(-s * 5, -s * 13); c.lineTo(s * 5, -s * 13); c.stroke();
      c.beginPath(); c.arc(0, -s * 4, s * 7, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      c.lineWidth = s * 1.2; circle(c, 0, -s * 18, s * 2); c.stroke();
      c.strokeStyle = 'rgba(160,140,110,0.35)'; c.lineWidth = s * 0.5; c.beginPath(); c.moveTo(-s * 0.5, -s * 2); c.lineTo(-s * 0.5, -s * 15); c.stroke();
      c.restore();
      c.strokeStyle = '#4a5052'; c.lineWidth = Math.max(1, s * 0.7);
      const ax = A.x - Math.sin(0.3) * s * 18 + s * 3, ay = A.y + s * 3 - Math.cos(0.3) * s * 18;
      for (let i = 0; i < 16; i++) { const k = i / 16, x = lerp(ax, sc.ix0 - U, k), y = lerp(ay, sc.iy0 + sc.ih * 0.25, k) + Math.sin(k * Math.PI) * sc.ih * 0.1; ellipse(c, x, y, s * 1.2, s * 0.7, i % 2 ? 0.9 : -0.4); c.stroke(); }
      this.sand(c, sc);
      for (let i = 0; i < 5; i++) { const x = sc.ix0 + r() * sc.iw * 0.4; rock(c, x, sc.floor(x) - U * 0.5, U * (2 + r() * 2.5), U * (1.2 + r()), '#3e3c38', 80 + i); }
    },
    paintMid(c, sc) {
      const U = sc.U, S = sc.ship, { to, h } = S;
      // the broken mast, the yard and a rag of sail
      const M = sc.mast;
      const mt = [M.x + Math.cos(M.a) * M.len, M.y + Math.sin(M.a) * M.len];
      c.lineCap = 'butt';
      c.strokeStyle = lg(c, M.x - U, 0, M.x + U, 0, [[0, '#3a2a1a'], [0.5, '#6a5038'], [1, '#2a1c10']]); c.lineWidth = U * 1.8;
      c.beginPath(); c.moveTo(M.x, M.y); c.lineTo(mt[0], mt[1]); c.stroke();
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.moveTo(mt[0] - U, mt[1] + U * 0.5); c.lineTo(mt[0] + U * 0.3, mt[1] - U * 2); c.lineTo(mt[0] + U * 1.1, mt[1] + U * 0.6); c.closePath(); c.fill();
      const Y2 = sc.yard;
      c.strokeStyle = '#4a3624'; c.lineWidth = U * 0.9; c.beginPath(); c.moveTo(Y2.x0, Y2.y0); c.lineTo(Y2.x1, Y2.y1); c.stroke();
      c.beginPath(); c.moveTo(Y2.x0 + U * 3, Y2.y0 + U * 0.6); c.quadraticCurveTo(Y2.x0 + U * 6, Y2.y0 + U * 9, Y2.x0 + U * 2, Y2.y0 + U * 14); c.lineTo(Y2.x0 + U * 9, Y2.y0 + U * 10); c.lineTo(Y2.x0 + U * 11, Y2.y0 + U * 1.6); c.closePath();
      c.fillStyle = 'rgba(200,190,160,0.22)'; c.fill();
      c.strokeStyle = 'rgba(40,30,20,0.6)'; c.lineWidth = Math.max(0.7, U * 0.12);
      c.beginPath(); c.moveTo(mt[0], mt[1] + U * 2); c.quadraticCurveTo(lerp(mt[0], to(0.9, -1)[0], 0.5), lerp(mt[1], to(0.9, -1)[1], 0.5) + U * 6, to(0.9, -1)[0], to(0.9, -1)[1]); c.stroke();
      // the hull
      const hull = new Path2D(), P = [];
      for (let i = 0; i <= 16; i++) { const k = i / 16; P.push(to(k, -1 + 0.04 * Math.sin(k * Math.PI))); }
      P.push(to(1.08, -0.85));
      for (let i = 16; i >= 0; i--) { const k = i / 16; P.push(to(k * (1.02 - 0.06 * (1 - k)), -0.12 + 0.35 * Math.sin(k * Math.PI) * (1 - k * 0.3) + (k > 0.85 ? (k - 0.85) * -4 : 0))); }
      hull.moveTo(P[0][0], P[0][1]); for (const p of P) hull.lineTo(p[0], p[1]); hull.closePath();
      c.fillStyle = lg(c, 0, S.sy - h * 1.4, 0, S.sy + h * 0.4, [[0, '#6a4a30'], [0.4, '#4a3220'], [1, '#1e140a']]); c.fill(hull);
      c.save(); c.clip(hull);
      c.strokeStyle = 'rgba(20,10,4,0.55)'; c.lineWidth = Math.max(1, U * 0.2);
      for (let i = 1; i < 9; i++) { c.beginPath(); for (let k = 0; k <= 1.05; k += 0.05) { const p = to(k, -1 + i * 0.13 + Math.sin(k * Math.PI) * 0.1 * (i / 9)); if (k === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); } c.stroke(); }
      c.strokeStyle = 'rgba(255,220,170,0.08)';
      for (let i = 1; i < 9; i++) { c.beginPath(); for (let k = 0; k <= 1.05; k += 0.05) { const p = to(k, -1 + i * 0.13 + 0.012 + Math.sin(k * Math.PI) * 0.1 * (i / 9)); if (k === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); } c.stroke(); }
      const rr = rng(77);
      for (let i = 0; i < 40; i++) { const p = to(rr(), -0.2 - rr() * 0.6); circle(c, p[0], p[1], U * (0.15 + rr() * 0.25)); c.fillStyle = rr() < 0.5 ? 'rgba(200,190,160,0.4)' : 'rgba(90,120,80,0.45)'; c.fill(); }
      c.restore();
      c.strokeStyle = 'rgba(255,220,160,0.2)'; c.lineWidth = Math.max(1, U * 0.3); c.beginPath(); for (let i = 0; i <= 16; i++) { const p = P[i]; if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); } c.stroke();
      // the hole in its side
      const B = sc.breach;
      c.beginPath(); for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, k = 0.7 + (i % 2) * 0.35; c.lineTo(B.x + Math.cos(a) * B.r * k * 1.3, B.y + Math.sin(a) * B.r * k); } c.closePath();
      c.fillStyle = '#05080a'; c.fill(); c.strokeStyle = '#2a1a0e'; c.lineWidth = U * 0.4; c.stroke();
      for (const p of sc.ports) {
        circle(c, p.x, p.y, p.r * 1.35); c.fillStyle = lg(c, 0, p.y - p.r, 0, p.y + p.r, [[0, '#d8a85a'], [1, '#6a4a1a']]); c.fill();
        circle(c, p.x, p.y, p.r); c.fillStyle = '#0a1418'; c.fill();
      }
      // the rail along the deck, and the stern with its cabin windows
      c.strokeStyle = '#3a2614'; c.lineWidth = Math.max(1, U * 0.35);
      c.beginPath(); for (let i = 0; i <= 20; i++) { const p = to(i / 20 * 0.98, -1.16); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); } c.stroke();
      c.lineWidth = Math.max(1, U * 0.25);
      for (let i = 0; i <= 14; i++) { const a = to(i / 14 * 0.98, -1.0), b = to(i / 14 * 0.98, -1.16); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
      const st = [to(0, -1), to(0.07, -1), to(0.06, -0.1), to(0, -0.12)];
      c.beginPath(); c.moveTo(st[0][0], st[0][1]); for (const p of st) c.lineTo(p[0], p[1]); c.closePath(); c.fillStyle = 'rgba(30,18,8,0.55)'; c.fill();
      for (const v of [-0.82, -0.6]) { const p = to(0.035, v); c.fillStyle = '#0c1214'; c.fillRect(p[0] - U * 0.7, p[1] - U * 0.6, U * 1.4, U * 1.2); c.strokeStyle = '#b08a4a'; c.lineWidth = Math.max(1, U * 0.15); c.strokeRect(p[0] - U * 0.7, p[1] - U * 0.6, U * 1.4, U * 1.2); }
      // the sand it has sunk into, painted again over its keel
      c.save(); c.clip(hull);
      ENVS.wreck.sand(c, sc);
      c.restore();
      c.save(); c.clip(hull); c.beginPath(); for (let x = S.sx - h * 0.4; x <= sc.ix1; x += 6) c.lineTo(x, sc.floor(x) - U * 0.4); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = U * 1.2; c.stroke(); c.restore();
      // the diver's helmet
      const H = sc.helmet, R = H.r;
      ellipse(c, H.x, H.y + R * 0.95, R * 1.3, R * 0.3); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      c.fillStyle = lg(c, 0, H.y + R * 0.5, 0, H.y + R, [[0, '#b0883a'], [1, '#5a4218']]); c.fillRect(H.x - R * 1.1, H.y + R * 0.55, R * 2.2, R * 0.45);
      circle(c, H.x, H.y, R); c.fillStyle = rg(c, H.x - R * 0.4, H.y - R * 0.45, 0, H.x, H.y, R * 1.05, [[0, '#ffe6a0'], [0.4, '#c8983e'], [1, '#5a4016']]); c.fill();
      c.save(); circle(c, H.x, H.y, R); c.clip();
      for (let i = 0; i < 8; i++) { circle(c, H.x + (rr() - 0.5) * R * 1.6, H.y + (rr() - 0.2) * R, R * (0.1 + rr() * 0.15)); c.fillStyle = 'rgba(80,160,130,0.45)'; c.fill(); }
      c.restore();
      circle(c, H.x + R * 0.15, H.y + R * 0.05, R * 0.55); c.fillStyle = '#8a6a2a'; c.fill();
      circle(c, H.x + R * 0.15, H.y + R * 0.05, R * 0.44); c.fillStyle = rg(c, H.x, H.y - R * 0.2, 0, H.x + R * 0.15, H.y, R * 0.5, [[0, '#2a4a58'], [1, '#081418']]); c.fill();
      c.strokeStyle = '#8a6a2a'; c.lineWidth = Math.max(1, R * 0.06); c.beginPath(); c.moveTo(H.x - R * 0.29, H.y + R * 0.05); c.lineTo(H.x + R * 0.59, H.y + R * 0.05); c.moveTo(H.x + R * 0.15, H.y - R * 0.39); c.lineTo(H.x + R * 0.15, H.y + R * 0.49); c.stroke();
      c.beginPath(); c.ellipse(H.x + R * 0.05, H.y - R * 0.1, R * 0.25, R * 0.1, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fill();
      for (let i = 0; i < 6; i++) { circle(c, H.x - R * 0.9 + i * R * 0.36, H.y + R * 0.75, R * 0.07); c.fillStyle = '#f0d890'; c.fill(); }
      c.fillStyle = '#9a7a32'; c.fillRect(H.x - R * 0.12, H.y - R * 1.2, R * 0.24, R * 0.3);
    },
    sand(c, sc) { paintSand(c, sc, { seed: 38, top: '#8c7b5a', mid: '#5e5038', bot: '#1f1910', crest: 'rgba(255,240,200,0.16)', specks: ['rgba(255,240,210,0.25)', 'rgba(0,0,0,0.3)', 'rgba(110,90,60,0.5)'], pebbles: 30, pebCols: ['#5a5448', '#46403a', '#6a6250', '#3a3630'] }); },
    paintFg(c, sc) {
      glass(c, sc, { sheen: 0.05 });
      const ring = frameRing(c, sc);
      c.fillStyle = lg(c, 0, 0, 0, sc.H, [[0, '#7a4830'], [0.5, '#5a321e'], [1, '#2e180c']]); c.fill(ring, 'evenodd');
      c.save(); c.clip(ring, 'evenodd');
      c.strokeStyle = 'rgba(20,8,2,0.5)'; c.lineWidth = 1;
      for (let y = sc.U * 1.2; y < sc.H; y += sc.U * 1.4) { c.beginPath(); c.moveTo(0, y); c.lineTo(sc.W, y); c.stroke(); }
      c.restore();
      grain(c, sc, ring, ['rgba(30,12,4,0.25)', 'rgba(255,210,160,0.08)'], 9);
      const U = sc.U, P = U * 4.5;
      for (const [x, y] of [[0, 0], [sc.W - P, 0], [0, sc.H - P], [sc.W - P, sc.H - P]]) {
        c.fillStyle = lg(c, x, y, x + P, y + P, [[0, '#4a4440'], [1, '#1e1a18']]); c.fillRect(x, y, P, P);
        for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { circle(c, x + P * dx, y + P * dy, U * 0.3); c.fillStyle = '#7a726a'; c.fill(); }
      }
      frameBevel(c, sc, 'rgba(255,210,160,0.2)', 'rgba(10,4,0,0.7)');
    },
    back(c, sc, t) {
      shafts(c, sc, t, { n: 5, col: '#c8f2ff', alpha: 0.11, w: 4, spread: 3, slant: 0.32, seed: 6, u0: 0.05, u1: 0.7 });
      drawCaustics(c, sc, t, sc.sandPath, 0.1);
      drawLayer(c, sc, t, 'back');
      c.fillStyle = 'rgba(220,235,240,0.5)';
      for (const m of sc.snow) { circle(c, m.x + Math.sin(t * 0.4 + m.ph) * sc.U * 0.8, m.y, sc.U * 0.09 * (1 + m.s)); c.fill(); }
    },
    mid(c, sc, t) {
      const U = sc.U;
      for (const p of sc.ports) if (p.glow > 0.01) {
        const g = p.glow * (0.85 + 0.15 * Math.sin(t * 13 + p.x));
        c.save(); c.globalCompositeOperation = 'lighter';
        circle(c, p.x, p.y, p.r * 5); c.fillStyle = rg(c, p.x, p.y, 0, p.x, p.y, p.r * 5, [[0, `rgba(255,190,90,${0.4 * g})`], [1, 'rgba(255,190,90,0)']]); c.fill();
        circle(c, p.x, p.y, p.r * 0.95); c.fillStyle = `rgba(255,200,110,${0.85 * g})`; c.fill();
        c.restore();
      }
      const B = sc.bell, Y2 = sc.yard;
      c.save(); c.translate(B.x, Y2.y0 + (B.x - Y2.x0) / (Y2.x1 - Y2.x0) * (Y2.y1 - Y2.y0)); c.rotate(B.swing);
      c.strokeStyle = '#2a2018'; c.lineWidth = Math.max(1, U * 0.2); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, U * 2); c.stroke();
      c.beginPath(); c.moveTo(-U * 0.9, U * 2.2); c.quadraticCurveTo(-U * 1, U * 4, -U * 1.7, U * 4.6); c.lineTo(U * 1.7, U * 4.6); c.quadraticCurveTo(U * 1, U * 4, U * 0.9, U * 2.2); c.closePath();
      c.fillStyle = lg(c, -U * 1.7, 0, U * 1.7, 0, [[0, '#6a4a1a'], [0.35, '#e8c070'], [1, '#5a3a10']]); c.fill();
      circle(c, 0, U * 4.8, U * 0.35); c.fillStyle = '#4a3410'; c.fill();
      c.restore();
      this.chest(c, sc, sc.chest, t, ['#5a3a22', '#2a1a0c', '#9a8a6a']);
      drawBubbles(c, sc);
    },
    chest(...a) { return ENVS.reef.chest.apply(this, a); },
    front(c, sc, t) { drawLayer(c, sc, t, 'front'); surface(c, sc, t, sc.ix0, sc.ix1, '#d8f4ff'); },
    step(sc, dt, t, api) {
      const U = sc.U, H = sc.helmet, K = sc.chest, B = sc.bell;
      H.burp -= dt;
      if (H.burp <= 0) {
        H.burp = 4 + Math.random() * 5;
        for (let i = 0; i < 10; i++) bubble(sc, H.x + (Math.random() - 0.5) * U, H.y - H.r * 1.2 - i * U * 0.4, U * (0.25 + Math.random() * 0.5), { vy: U * 4 });
        api.lift(H.x, sc.surf, H.y - H.r, U * 4, 1.6);
        api.play('burble', 0.5);
      }
      for (const p of sc.ports) p.glow = Math.max(0, p.glow - dt * 0.12);
      B.v += (-B.swing * 18 - B.v * 1.2) * dt; B.swing += B.v * dt;
      if (K.open > 0) { K.open -= dt; K.lid = Math.min(1, K.lid + dt * 2.2); } else K.lid = Math.max(0, K.lid - dt * 0.9);
      for (const m of sc.snow) { m.y += U * 0.35 * m.s * dt; if (m.y > sc.floor(m.x)) { m.y = sc.surf; m.x = sc.ix0 + Math.random() * sc.iw; } }
    },
    tap(sc, x, y, api) {
      const U = sc.U, H = sc.helmet, K = sc.chest, B = sc.bell, Y2 = sc.yard;
      for (const p of sc.ports) if (Math.hypot(x - p.x, y - p.y) < p.r * 1.8) { p.glow = 1; api.play('lantern'); api.attract(p.x - U * 3, p.y, 7, 'curious'); return true; }
      const by = Y2.y0 + (B.x - Y2.x0) / (Y2.x1 - Y2.x0) * (Y2.y1 - Y2.y0);
      if (Math.abs(x - B.x) < U * 3 && y > by && y < by + U * 6) { B.v += 2.4; api.play('shipbell'); api.look(B.x, by + U * 4, 2.2); return true; }
      if (Math.hypot(x - H.x, y - H.y) < H.r * 1.25) {
        for (let i = 0; i < 26; i++) bubble(sc, H.x + (Math.random() - 0.5) * U * 1.5, H.y - H.r * 1.2 - i * U * 0.3, U * (0.3 + Math.random() * 0.7), { vy: U * 6 });
        H.burp = 6; api.play('burble', 1.3); api.lift(H.x, sc.surf, H.y - H.r, U * 6, 3.2);
        return true;
      }
      if (Math.abs(x - K.x) < K.w * 0.6 && y > K.y - K.w * 0.65 && y < K.y + U) {
        if (K.open <= 0) {
          K.open = 4.5; api.play('chest');
          for (let i = 0; i < 22; i++) bubble(sc, K.x + (Math.random() - 0.5) * K.w * 0.8, K.y - K.w * 0.5, U * (0.2 + Math.random() * 0.5), { vy: U * (5 + Math.random() * 7) });
          if (api.ready('wreckchest')) { api.use('wreckchest', 5 * 3600e3); for (let i = 0; i < 3; i++) setTimeout(() => api.pearl(K.x + (i - 1) * U * 2, K.y - K.w * 0.45, 6 + Math.floor(Math.random() * 7), 'rare'), 300 + i * 260); }
          api.attract(K.x, K.y - U * 6, 4, 'curious');
        }
        return true;
      }
      if (Math.abs(x - sc.anchor.x) < U * 5 && y > sc.anchor.y - U * 16 && y < sc.anchor.y + U) { api.play('clank'); api.scare(sc.anchor.x, sc.anchor.y - U * 6, U * 12); return true; }
      if (hitStrand(sc, x, y, U * 2)) { api.play('rustle'); return true; }
      return false;
    },
  };

  /* ---------------- Moon Palace: a moon gate, a stone dragon, lantern plants, singing geodes ---------------- */
  const GEODES = [['#b48cff', 72], ['#6fe0e8', 74], ['#ffd36a', 76], ['#ff9ac0', 79], ['#cfe0ff', 81]];
  function pagoda(c, x, base, w, tiers, h, U, wins) {
    let y = base, tw = w;
    for (let i = 0; i < tiers; i++) {
      const bh = h * (i === 0 ? 0.26 : 0.16), rw = tw * 1.36;
      c.fillStyle = '#111a40'; c.fillRect(x - tw / 2, y - bh, tw, bh);
      const n = Math.max(2, Math.round(tw / (U * 3.6)));
      for (let k = 0; k < n; k++) wins.push({ x: x - tw / 2 + (k + 0.5) * tw / n, y: y - bh * 0.5, w: Math.min(U * 1.1, tw / n * 0.45), h: bh * 0.42, ph: Math.random() * TAU });
      y -= bh;
      c.beginPath(); c.moveTo(x - rw / 2, y + U * 0.4); c.quadraticCurveTo(x - rw * 0.32, y - bh * 0.06, x - tw * 0.32, y - bh * 0.42); c.lineTo(x + tw * 0.32, y - bh * 0.42); c.quadraticCurveTo(x + rw * 0.32, y - bh * 0.06, x + rw / 2, y + U * 0.4); c.closePath();
      c.fillStyle = '#0b1230'; c.fill();
      c.strokeStyle = 'rgba(150,170,255,0.32)'; c.lineWidth = Math.max(1, U * 0.18); c.beginPath(); c.moveTo(x - rw / 2, y + U * 0.4); c.quadraticCurveTo(x - rw * 0.32, y - bh * 0.06, x - tw * 0.32, y - bh * 0.42); c.lineTo(x + tw * 0.32, y - bh * 0.42); c.stroke();
      y -= bh * 0.42; tw *= 0.76;
    }
    c.strokeStyle = '#0b1230'; c.lineWidth = U * 0.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h * 0.12); c.stroke();
    circle(c, x, y - h * 0.12, U * 0.6); c.fillStyle = '#c8a860'; c.fill();
  }
  ENVS.palace = {
    layout(sc) {
      interior(sc, { l: 2.4, r: 2.4, t: 2.6, b: 3.6, air: 0.085 });
      floorFn(sc, 0.86, 0.012, 51, [{ u: 0.5, w: 0.15, h: 0.022 }]);
      swimBox(sc);
      const U = sc.U, r = rng(52);
      const Ro = Math.min(sc.ih * 0.24, sc.iw * 0.15);
      sc.gate = { cx: X(sc, 0.5), cy: Y(sc, 0.5), Ro, Ri: Ro * 0.78, glow: 0 };
      const dx = X(sc, 0.13), k = Math.min(sc.ih * 0.1, sc.iw * 0.07);
      sc.dragon = { x: dx, base: sc.floor(dx), k, mouth: [dx + k * 1.55, sc.floor(dx) - k * 3.35], next: 6, rings: [] };
      sc.geodes = GEODES.map(([col, note], i) => { const x = X(sc, [0.05, 0.27, 0.4, 0.61, 0.9][i]); return { x, y: sc.floor(x) + U * 0.8, col, note, glow: 0, s: U * (2.4 + r() * 0.8), seed: 600 + i }; });
      sc.played = [];
      for (const [u, h] of [[0.29, 0.34], [0.7, 0.42], [0.8, 0.28], [0.95, 0.36]]) {
        const x = X(sc, u);
        sc.strands.push(strand({ kind: 'lantern', x, y: sc.floor(x) + U * 0.5, len: sc.ih * h, w: U * 1.3, n: 9, col: '#2c6a5a', col2: '#1c4a40', lit: ['#8ff0e0', '#ffd88a', '#c8a8ff', '#9fe8ff'][Math.floor(r() * 4)], layer: 'mid', sway: 0.14, spd: 0.45, glow: 0 }));
      }
      sc.floats = [0.17, 0.57, 0.84].map((u, i) => ({ x: X(sc, u), ph: i * 2, bob: 0, col: ['#ff9a6a', '#ffc86a', '#ff8a9a'][i] }));
      sc.petals = [];
      sc.glows = [];
      sc.motes = Array.from({ length: 50 }, () => ({ x: sc.ix0 + Math.random() * sc.iw, y: sc.surf + Math.random() * sc.ih, s: Math.random(), ph: Math.random() * TAU }));
      sc.wins = [];
      const G = sc.gate, D = sc.dragon;
      sc.pois.push(
        { kind: 'through', path: [[G.cx - G.Ro * 1.9, G.cy + U * 2], [G.cx, G.cy], [G.cx + G.Ro * 1.9, G.cy - U]], z0: 0.85, z1: 0.2 },
        { kind: 'through', path: [[G.cx + G.Ro * 1.9, G.cy - U * 3], [G.cx, G.cy + U], [G.cx - G.Ro * 1.9, G.cy]], z0: 0.85, z1: 0.2 },
        { kind: 'ring', x: D.mouth[0] + k * 2, y: D.mouth[1] - k * 0.5, z: 0.45 },
        ...sc.strands.filter(s => s.kind === 'lantern').map(s => ({ kind: 'gather', x: s.x, y: s.y - s.len, z: 0.4, strand: s })),
        { kind: 'hide', x: X(sc, 0.06), y: sc.floor(X(sc, 0.06)) - U * 3, z: 0.92 },
        { kind: 'hide', x: G.cx + G.Ro * 0.9, y: G.cy + G.Ro * 1.0, z: 0.92 },
        ...sc.strands.filter(s => s.kind === 'lantern').map(s => ({ kind: 'perch', x: s.x, y: s.y - s.len * 0.5, z: 0.6 })),
        { kind: 'ride', x: X(sc, 0.36), y: sc.floor(X(sc, 0.36)) - U * 3, z: 0.75 },
        { kind: 'ride', x: X(sc, 0.64), y: sc.floor(X(sc, 0.64)) - U * 3, z: 0.75 },
      );
      for (let u = 0.2; u <= 0.8; u += 0.035) if (Math.abs(u - 0.5) > 0.12) sc.bubblers.push({ x: X(sc, u), y: sc.floor(X(sc, u)) - U * 0.4, rate: 1.6, spread: U * 0.3, rmin: 0.1, rmax: 0.22, acc: Math.random(), z: 0.95 });
      sc.occluders = [{ x0: G.cx - G.Ro * 1.2, x1: G.cx + G.Ro * 1.2, y0: G.cy - G.Ro * 1.12, y1: sc.floor(G.cx) }];
      sc.dark = 0.6;
      sc.tint = { far: 'rgba(14,20,70,0.5)', near: 'rgba(30,36,100,0.16)' };
      sc.onBrush = (x, y, rr, amt) => { if (y > sc.floor(x) - rr * 1.5 && sc.glows.length < 26 && Math.random() < amt * 2) sc.glows.push({ x, y: sc.floor(x) + U * 0.4, t: 0, s: 0.6 + Math.random() * 0.5 }); };
    },
    paintBg(c, sc) {
      const U = sc.U, r = rng(91), G = sc.gate;
      waterFill(c, sc, [[0, '#30478c'], [0.35, '#182660'], [1, '#060a22']], '#1c2a5c');
      c.save(); c.beginPath(); c.rect(sc.ix0, sc.surf, sc.iw, sc.ih); c.clip();
      c.fillStyle = rg(c, G.cx, sc.surf, 0, G.cx, sc.surf, sc.ih * 0.9, [[0, 'rgba(200,215,255,0.28)'], [1, 'rgba(200,215,255,0)']]); c.fillRect(sc.ix0, sc.surf, sc.iw, sc.ih);
      // the palace behind: walls, towers and a great pagoda, lit from within
      const fy = Y(sc, 0.84);
      c.fillStyle = '#0f1638';
      c.fillRect(sc.ix0, fy - sc.ih * 0.16, sc.iw, sc.ih * 0.2);
      for (let x = sc.ix0; x < sc.ix1; x += U * 2.4) c.fillRect(x, fy - sc.ih * 0.16 - U * 1.2, U * 1.4, U * 1.2);
      pagoda(c, X(sc, 0.8), fy - sc.ih * 0.1, sc.iw * 0.2, 4, sc.ih * 0.62, U, sc.wins);
      pagoda(c, X(sc, 0.24), fy - sc.ih * 0.12, sc.iw * 0.11, 3, sc.ih * 0.4, U, sc.wins);
      pagoda(c, X(sc, 0.97), fy - sc.ih * 0.14, sc.iw * 0.07, 2, sc.ih * 0.22, U, sc.wins);
      for (const w of sc.wins) {
        c.fillStyle = rg(c, w.x, w.y, 0, w.x, w.y, w.h * 1.5, [[0, 'rgba(255,200,120,0.26)'], [1, 'rgba(255,200,120,0)']]); c.fillRect(w.x - w.h * 1.5, w.y - w.h * 1.5, w.h * 3, w.h * 3);
        c.fillStyle = Math.random() < 0.3 ? '#8a6a3a' : '#e8b866'; c.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
      }
      for (let i = 0; i < 70; i++) { circle(c, sc.ix0 + r() * sc.iw, sc.surf + r() * sc.ih * 0.7, r() * U * 0.1 + 0.3); c.fillStyle = `rgba(200,220,255,${0.15 + r() * 0.3})`; c.fill(); }
      c.restore();
      paintSand(c, sc, { seed: 48, top: '#8486b8', mid: '#4c4e82', bot: '#181a40', crest: 'rgba(210,220,255,0.32)', specks: ['rgba(210,225,255,0.65)', 'rgba(150,160,230,0.45)', 'rgba(255,255,255,0.8)', 'rgba(20,20,50,0.4)'], pebbles: 20, pebCols: ['#cfd8ff', '#a8b0e8', '#e8e0ff', '#8890c8'] });
    },
    paintMid(c, sc) {
      const U = sc.U, G = sc.gate, { cx, cy, Ro, Ri } = G;
      // the moon gate: a round doorway in a wall of pale stone under a tiled roof
      const wl = cx - Ro * 1.2, wr = cx + Ro * 1.2, wt = cy - Ro * 1.12, wb = sc.floor(cx) - U * 2.2;
      c.fillStyle = lg(c, wl, wb, wr, wb + U * 3, [[0, '#56527a'], [0.5, '#8a86ac'], [1, '#4a466c']]);
      c.beginPath(); c.moveTo(wl - U * 2.5, wb + U * 2.6); c.lineTo(wr + U * 2.5, wb + U * 2.6); c.lineTo(wr + U * 1.5, wb); c.lineTo(wl - U * 1.5, wb); c.closePath(); c.fill();
      const wall = new Path2D(); wall.rect(wl, wt, wr - wl, wb - wt); wall.arc(cx, cy, Ri, 0, TAU);
      c.fillStyle = lg(c, wl, wt, wr, wb, [[0, '#a6a2c4'], [0.5, '#77739a'], [1, '#45416a']]); c.fill(wall, 'evenodd');
      c.save(); c.clip(wall, 'evenodd');
      c.strokeStyle = 'rgba(30,26,60,0.35)'; c.lineWidth = 1;
      for (let y = wt + U * 1.6, row = 0; y < wb; y += U * 1.6, row++) { c.beginPath(); c.moveTo(wl, y); c.lineTo(wr, y); c.stroke(); for (let x = wl + (row % 2) * U * 1.8; x < wr; x += U * 3.6) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + U * 1.6); c.stroke(); } }
      c.fillStyle = rg(c, cx, cy, Ri, cx, cy, Ro * 1.25, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(wl, wt, wr - wl, wb - wt);
      c.restore();
      circle(c, cx, cy, Ri); c.strokeStyle = '#d9b25e'; c.lineWidth = U * 0.7; c.stroke();
      circle(c, cx, cy, Ri + U * 0.9); c.strokeStyle = '#5fbf9f'; c.lineWidth = U * 0.45; c.stroke();
      circle(c, cx, cy, Ri + U * 1.6); c.strokeStyle = 'rgba(217,178,94,0.6)'; c.lineWidth = Math.max(1, U * 0.18); c.stroke();
      // the roof
      const rw = (wr - wl) * 1.3, ry = wt;
      c.beginPath(); c.moveTo(cx - rw / 2, ry + U * 0.6); c.quadraticCurveTo(cx - rw * 0.35, ry - U * 0.6, cx - rw * 0.3, ry - U * 3); c.lineTo(cx + rw * 0.3, ry - U * 3); c.quadraticCurveTo(cx + rw * 0.35, ry - U * 0.6, cx + rw / 2, ry + U * 0.6); c.closePath();
      c.fillStyle = lg(c, 0, ry - U * 3, 0, ry + U, [[0, '#1d5a4a'], [1, '#0c2a24']]); c.fill();
      c.strokeStyle = 'rgba(217,178,94,0.8)'; c.lineWidth = Math.max(1, U * 0.25); c.stroke();
      c.fillStyle = '#0c2a24'; c.fillRect(cx - rw * 0.31, ry - U * 3.8, rw * 0.62, U * 0.9);
      for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * rw * 0.31, ry - U * 3.4, U * 0.9, 0, TAU); c.fillStyle = '#d9b25e'; c.fill(); }
      circle(c, cx, cy - Ri - U * 2.6, U * 1.5); c.fillStyle = '#d9b25e'; c.fill();
      circle(c, cx + U * 0.5, cy - Ri - U * 2.8, U * 1.2); c.fillStyle = '#56527a'; c.fill();
      // the stone dragon on its plinth
      const D = sc.dragon, k = D.k, bx = D.x, by = D.base;
      c.fillStyle = lg(c, bx - k * 1.4, 0, bx + k * 1.4, 0, [[0, '#2c3a40'], [0.5, '#5a6a70'], [1, '#222e34']]);
      c.fillRect(bx - k * 1.2, by - k * 1.1, k * 2.4, k * 1.1);
      c.fillRect(bx - k * 1.45, by - k * 1.3, k * 2.9, k * 0.3);
      c.strokeStyle = 'rgba(160,220,200,0.35)'; c.lineWidth = 1; c.strokeRect(bx - k * 0.9, by - k * 0.9, k * 1.8, k * 0.6);
      const P = [[0.9, -1.35], [0.3, -1.45], [-0.55, -1.7], [-0.85, -2.3], [-0.5, -2.95], [0.2, -3.05], [0.55, -2.6], [0.4, -2.1], [0.75, -2.05], [1.05, -2.55], [1.2, -3.15]].map(([u, v]) => [bx + u * k, by + v * k]);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const [w, col] of [[0.62, '#1a3a34'], [0.5, '#3a7a6a'], [0.28, '#6ab8a0'], [0.1, '#b8f0dc']]) { c.beginPath(); smooth(c, P.map(([x, y]) => [x, y - (0.62 - w) * k * 0.3])); c.strokeStyle = col; c.lineWidth = k * w; c.stroke(); }
      for (let i = 1; i < P.length - 1; i++) {
        const [x, y] = P[i], a = Math.atan2(P[i + 1][1] - P[i - 1][1], P[i + 1][0] - P[i - 1][0]) - Math.PI / 2;
        c.beginPath(); c.moveTo(x + Math.cos(a) * k * 0.25 - Math.sin(a) * k * 0.08, y + Math.sin(a) * k * 0.25 + Math.cos(a) * k * 0.08); c.lineTo(x + Math.cos(a) * k * 0.5, y + Math.sin(a) * k * 0.5); c.lineTo(x + Math.cos(a) * k * 0.25 + Math.sin(a) * k * 0.08, y + Math.sin(a) * k * 0.25 - Math.cos(a) * k * 0.08);
        c.fillStyle = '#d9b25e'; c.fill();
      }
      const [hx, hy] = P[P.length - 1];
      c.save(); c.translate(hx, hy); c.rotate(-0.2);
      c.beginPath(); c.moveTo(-k * 0.3, -k * 0.25); c.quadraticCurveTo(k * 0.3, -k * 0.5, k * 0.7, -k * 0.18); c.lineTo(k * 0.45, -k * 0.02); c.lineTo(k * 0.7, k * 0.12); c.quadraticCurveTo(k * 0.3, k * 0.38, -k * 0.3, k * 0.25); c.closePath();
      c.fillStyle = lg(c, 0, -k * 0.5, 0, k * 0.4, [[0, '#7ac8b0'], [1, '#2a5a4e']]); c.fill();
      circle(c, k * 0.12, -k * 0.2, k * 0.08); c.fillStyle = '#c8ffe8'; c.fill();
      c.strokeStyle = '#d9b25e'; c.lineWidth = Math.max(1, k * 0.06);
      c.beginPath(); c.moveTo(-k * 0.1, -k * 0.3); c.quadraticCurveTo(-k * 0.4, -k * 0.75, -k * 0.75, -k * 0.7); c.moveTo(-k * 0.2, -k * 0.24); c.quadraticCurveTo(-k * 0.55, -k * 0.5, -k * 0.85, -k * 0.38); c.stroke();
      c.strokeStyle = 'rgba(200,240,220,0.5)'; c.lineWidth = Math.max(0.7, k * 0.03);
      c.beginPath(); c.moveTo(k * 0.55, -k * 0.1); c.bezierCurveTo(k * 0.8, -k * 0.6, k * 1.1, k * 0.1, k * 1.25, -k * 0.35); c.moveTo(k * 0.5, k * 0.15); c.bezierCurveTo(k * 0.8, k * 0.6, k * 1.0, k * 0.1, k * 1.2, k * 0.5); c.stroke();
      c.restore();
      D.mouth = [hx + k * 0.65, hy + k * 0.05];
      // a small stone lantern by the gate
      const lx = X(sc, 0.66), ly = sc.floor(lx);
      c.fillStyle = '#5a5878'; c.fillRect(lx - U * 0.6, ly - U * 4, U * 1.2, U * 4); c.fillRect(lx - U * 1.6, ly - U * 4.4, U * 3.2, U * 0.6);
      c.fillStyle = '#3a3858'; c.fillRect(lx - U * 1.2, ly - U * 6.4, U * 2.4, U * 2);
      c.fillStyle = '#ffd88a'; c.fillRect(lx - U * 0.6, ly - U * 6, U * 1.2, U * 1.2);
      c.beginPath(); c.moveTo(lx - U * 2.2, ly - U * 6.4); c.lineTo(lx, ly - U * 8); c.lineTo(lx + U * 2.2, ly - U * 6.4); c.closePath(); c.fillStyle = '#4a4868'; c.fill();
      sc.stoneLamp = { x: lx, y: ly - U * 5.4 };
    },
    paintFg(c, sc) {
      const U = sc.U, ring = frameRing(c, sc);
      c.fillStyle = lg(c, 0, 0, sc.W, sc.H, [[0, '#1f6a56'], [0.5, '#0f3e32'], [1, '#08261e']]); c.fill(ring, 'evenodd');
      c.save(); c.clip(ring, 'evenodd');
      c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(0, 0, sc.W, sc.H * 0.4);
      c.restore();
      const gold = '#d9b25e';
      c.strokeStyle = gold; c.lineWidth = Math.max(1, U * 0.3);
      const i1 = U * 0.7, i2 = U * 0.32;
      c.strokeRect(i1, i1, sc.W - i1 * 2, sc.H - i1 * 2);
      c.lineWidth = Math.max(1, U * 0.16); c.strokeRect(sc.ix0 - i2, sc.iy0 - i2, sc.iw + i2 * 2, sc.ih + i2 * 2);
      // cloud scrolls in the corners
      const scroll = (x, y, sx, sy) => {
        c.save(); c.translate(x, y); c.scale(sx, sy); c.strokeStyle = gold; c.lineWidth = Math.max(1, U * 0.22);
        c.beginPath(); c.arc(U * 2.4, U * 2.4, U * 1.3, Math.PI, Math.PI * 2.6); c.stroke();
        c.beginPath(); c.arc(U * 4.4, U * 1.8, U * 0.8, Math.PI * 0.9, Math.PI * 2.4); c.stroke();
        c.beginPath(); c.arc(U * 1.8, U * 4.4, U * 0.8, Math.PI * 0.4, Math.PI * 1.9); c.stroke();
        c.restore();
      };
      scroll(0, 0, 1, 1); scroll(sc.W, 0, -1, 1); scroll(0, sc.H, 1, -1); scroll(sc.W, sc.H, -1, -1);
      const mx = sc.W / 2, my = sc.iy0 / 2;
      circle(c, mx, my, U * 1.25); c.fillStyle = lg(c, 0, my - U, 0, my + U, [[0, '#fff0c0'], [1, '#b8903c']]); c.fill();
      circle(c, mx + U * 0.45, my - U * 0.25, U * 0.95); c.fillStyle = '#0f3e32'; c.fill();
      c.strokeStyle = gold; c.lineWidth = Math.max(1, U * 0.16); c.beginPath(); c.moveTo(mx - U * 8, my); c.lineTo(mx - U * 2, my); c.moveTo(mx + U * 2, my); c.lineTo(mx + U * 8, my); c.stroke();
      const by = sc.iy1 + (sc.H - sc.iy1) / 2;
      c.beginPath(); for (let x = U * 6; x < sc.W - U * 6; x += U * 3) { c.moveTo(x, by); c.lineTo(x + U * 1.5, by - U * 0.7); c.lineTo(x + U * 3, by); } c.stroke();
      glass(c, sc, { sheen: 0.05 });
      frameBevel(c, sc, 'rgba(255,240,200,0.3)', 'rgba(0,10,8,0.7)');
    },
    back(c, sc, t) {
      const U = sc.U, G = sc.gate;
      shafts(c, sc, t, { n: 3, col: '#d8e4ff', alpha: 0.07, w: 5, spread: 1.6, slant: 0, seed: 2, u0: 0.4, u1: 0.6, to: G.cy + G.Ro });
      drawCaustics(c, sc, t * 0.6, sc.sandPath, 0.08);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const w of sc.wins) { const a = 0.05 + 0.06 * Math.sin(t * 0.9 + w.ph) + (Math.sin(t * 0.37 + w.ph * 3) > 0.97 ? 0.25 : 0); if (a > 0.01) { c.fillStyle = `rgba(255,200,110,${a})`; c.fillRect(w.x - w.w * 0.7, w.y - w.h * 0.7, w.w * 1.4, w.h * 1.4); } }
      for (const g of sc.glows) {
        const k = g.t / 2.2;
        ellipse(c, g.x, g.y, U * (1 + k * 7) * g.s, U * (0.4 + k * 2) * g.s);
        c.strokeStyle = `rgba(120,230,255,${0.5 * (1 - k)})`; c.lineWidth = Math.max(1, U * 0.3); c.stroke();
        ellipse(c, g.x, g.y, U * 2.4 * g.s, U * 0.7 * g.s); c.fillStyle = `rgba(140,240,255,${0.3 * (1 - k)})`; c.fill();
      }
      for (const m of sc.motes) { const a = 0.25 + 0.25 * Math.sin(t * 1.5 + m.ph); circle(c, m.x + Math.sin(t * 0.3 + m.ph) * U, m.y, U * (0.08 + m.s * 0.1)); c.fillStyle = `rgba(170,230,255,${a})`; c.fill(); }
      c.restore();
      drawBubbles(c, sc, b => b.z > 0.8);
    },
    mid(c, sc, t) {
      const U = sc.U, G = sc.gate;
      const g = G.glow;
      c.save(); c.globalCompositeOperation = 'lighter';
      circle(c, G.cx, G.cy, G.Ri); c.fillStyle = rg(c, G.cx, G.cy, G.Ri * 0.5, G.cx, G.cy, G.Ri * 1.02, [[0, 'rgba(200,220,255,0)'], [1, `rgba(200,225,255,${0.07 + 0.04 * Math.sin(t * 0.8) + g * 0.4})`]]); c.fill();
      if (g > 0.02) { circle(c, G.cx, G.cy, G.Ri + U); c.strokeStyle = `rgba(255,230,160,${g * 0.8})`; c.lineWidth = U * 0.8; c.stroke(); }
      circle(c, sc.stoneLamp.x, sc.stoneLamp.y, U * 4); c.fillStyle = rg(c, sc.stoneLamp.x, sc.stoneLamp.y, 0, sc.stoneLamp.x, sc.stoneLamp.y, U * 4, [[0, 'rgba(255,210,130,0.35)'], [1, 'rgba(255,210,130,0)']]); c.fill();
      const D = sc.dragon;
      circle(c, D.mouth[0] - D.k * 0.5, D.mouth[1] - D.k * 0.2, D.k * 0.35); c.fillStyle = rg(c, D.mouth[0] - D.k * 0.5, D.mouth[1] - D.k * 0.2, 0, D.mouth[0] - D.k * 0.5, D.mouth[1] - D.k * 0.2, D.k * 0.35, [[0, 'rgba(150,255,220,0.5)'], [1, 'rgba(150,255,220,0)']]); c.fill();
      c.restore();
      for (const R of sc.dragon.rings) {
        const k = R.t / R.life, a = (1 - k) * 0.8;
        c.save(); c.translate(R.x, R.y); c.rotate(R.rot);
        ellipse(c, 0, 0, R.r * 0.42, R.r); c.strokeStyle = `rgba(220,240,255,${a})`; c.lineWidth = Math.max(1.5, U * 0.55 * (1 - k * 0.4)); c.stroke();
        ellipse(c, -R.r * 0.06, -R.r * 0.1, R.r * 0.3, R.r * 0.8); c.strokeStyle = `rgba(255,255,255,${a * 0.5})`; c.lineWidth = Math.max(1, U * 0.18); c.stroke();
        c.restore();
      }
      drawLayer(c, sc, t, 'mid');
      drawBubbles(c, sc, b => b.z <= 0.8);
    },
    front(c, sc, t) {
      const U = sc.U;
      for (const p of sc.petals) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); ellipse(c, 0, 0, U * 0.7, U * 0.4); c.fillStyle = `rgba(255,190,215,${p.a})`; c.fill(); c.restore();
      }
      for (const G of sc.geodes) {
        const r = rng(G.seed), s = G.s, g = G.glow;
        c.save(); c.globalCompositeOperation = 'lighter';
        circle(c, G.x, G.y - s, s * (2.6 + g * 2)); c.fillStyle = rg(c, G.x, G.y - s, 0, G.x, G.y - s, s * (2.6 + g * 2), [[0, rgba(G.col, 0.18 + g * 0.5)], [1, rgba(G.col, 0)]]); c.fill();
        c.restore();
        blobPath(c, G.x, G.y, s * 1.3, s * 0.6, G.seed, 0.3, 8); c.fillStyle = '#2a2a44'; c.fill();
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (r() - 0.5) * 1.5, L = s * (1 + r() * 1.3), w = s * (0.22 + r() * 0.16), bx = G.x + (r() - 0.5) * s * 1.2, by = G.y - s * 0.2;
          c.save(); c.translate(bx, by); c.rotate(a + Math.PI / 2);
          c.beginPath(); c.moveTo(-w, 0); c.lineTo(-w, -L * 0.8); c.lineTo(0, -L); c.lineTo(w, -L * 0.8); c.lineTo(w, 0); c.closePath();
          c.fillStyle = lg(c, -w, 0, w, 0, [[0, mix(G.col, '#101030', 0.35)], [0.45, mix(G.col, '#ffffff', 0.25 + g * 0.5)], [1, mix(G.col, '#101030', 0.2)]]); c.fill();
          c.restore();
        }
      }
      surface(c, sc, t, sc.ix0, sc.ix1, '#dce6ff');
      for (const L of sc.floats) {
        const y = sc.surf - U * 1.4 + Math.sin(t * 1.1 + L.ph) * U * 0.3 + Math.sin(t * 8 + L.ph) * L.bob * U * 0.6;
        c.save(); c.globalCompositeOperation = 'lighter';
        circle(c, L.x, y, U * 5); c.fillStyle = rg(c, L.x, y, 0, L.x, y, U * 5, [[0, rgba(L.col, 0.32)], [1, rgba(L.col, 0)]]); c.fill();
        ellipse(c, L.x, sc.surf + U * 1.4, U * 2, U * 0.6); c.fillStyle = rgba(L.col, 0.2); c.fill();
        c.restore();
        ellipse(c, L.x, y, U * 1.5, U * 1.2); c.fillStyle = rg(c, L.x - U * 0.4, y - U * 0.4, 0, L.x, y, U * 1.6, [[0, '#fff4d8'], [0.5, L.col], [1, mix(L.col, '#000000', 0.4)]]); c.fill();
        c.fillStyle = '#3a2010'; c.fillRect(L.x - U * 0.7, y - U * 1.4, U * 1.4, U * 0.35); c.fillRect(L.x - U * 0.7, y + U * 1.05, U * 1.4, U * 0.35);
      }
    },
    step(sc, dt, t, api) {
      const U = sc.U, D = sc.dragon, G = sc.gate;
      G.glow = Math.max(0, G.glow - dt * 0.35);
      for (const s of sc.strands) if (s.kind === 'lantern') s.glow = Math.max(0, (s.glow || 0) - dt * 0.12);
      for (const g of sc.geodes) g.glow = Math.max(0, g.glow - dt * 0.6);
      for (const L of sc.floats) L.bob = Math.max(0, L.bob - dt * 0.7);
      for (let i = sc.glows.length - 1; i >= 0; i--) { sc.glows[i].t += dt; if (sc.glows[i].t > 2.2) sc.glows.splice(i, 1); }
      D.next -= dt;
      if (D.next <= 0) { D.next = 9 + Math.random() * 8; this.blow(sc, api); }
      for (let i = D.rings.length - 1; i >= 0; i--) {
        const R = D.rings[i];
        R.t += dt; R.x += R.vx * dt; R.y += R.vy * dt; R.vy -= U * 0.6 * dt; R.r += U * 0.9 * dt;
        if (R.t > R.life || R.y < sc.surf + R.r) D.rings.splice(i, 1);
      }
      sc.rings = D.rings;
      if (Math.random() < dt * 0.25 && sc.petals.length < 10) sc.petals.push({ x: sc.ix0 + Math.random() * sc.iw, y: sc.surf + U, vy: U * (0.6 + Math.random() * 0.6), rot: Math.random() * TAU, ph: Math.random() * TAU, a: 0.85, rest: 0 });
      for (let i = sc.petals.length - 1; i >= 0; i--) {
        const p = sc.petals[i], fl = sc.floor(p.x);
        if (p.y < fl) { p.y += p.vy * dt; p.x += Math.sin(t * 1.3 + p.ph) * U * 0.8 * dt; p.rot += dt * 0.8; }
        else { p.rest += dt; p.a = Math.max(0, 0.85 - p.rest * 0.08); if (p.a <= 0) sc.petals.splice(i, 1); }
      }
      if (sc.played.length && Date.now() - sc.played[sc.played.length - 1].at > 6000) sc.played = [];
    },
    blow(sc, api) {
      const D = sc.dragon, U = sc.U;
      D.rings.push({ x: D.mouth[0], y: D.mouth[1], r: U * 1.4, vx: U * 6.5, vy: -U * 1.2, t: 0, life: 6, rot: -0.15 });
      for (let i = 0; i < 6; i++) bubble(sc, D.mouth[0] + U, D.mouth[1], U * (0.15 + Math.random() * 0.2), { z: 0.5 });
      api.play('ring');
    },
    tap(sc, x, y, api) {
      const U = sc.U, G = sc.gate, D = sc.dragon;
      for (const [i, g] of sc.geodes.entries()) {
        if (Math.abs(x - g.x) < g.s * 1.6 && y > g.y - g.s * 2.6 && y < g.y + g.s * 0.8) {
          g.glow = 1; api.play('geode', g.note);
          sc.played.push({ i, at: Date.now() });
          const seq = sc.played.slice(-5).map(p => p.i).join('');
          if (seq === '01234') { sc.played = []; this.bless(sc, api); }
          return true;
        }
      }
      for (const L of sc.floats) if (Math.abs(x - L.x) < U * 2.5 && Math.abs(y - (sc.surf - U * 1.4)) < U * 2.6) { L.bob = 1; api.ripple(L.x, sc.surf, 1); api.play('plip'); return true; }
      for (const s of sc.strands) {
        if (s.kind !== 'lantern') continue;
        const P = strandPts(s, sc.t), [tx, ty] = P[P.length - 1];
        if (Math.hypot(x - tx, y - ty) < U * 3.4) { s.glow = 1; s.kick = 1; api.play('lantern'); api.attract(tx, ty, 8, 'glow'); return true; }
      }
      if (Math.hypot(x - D.x, y - (D.base - D.k * 2.2)) < D.k * 1.6) { D.next = 10; this.blow(sc, api); return true; }
      const dG = Math.hypot(x - G.cx, y - G.cy);
      if (dG > G.Ri * 0.9 && dG < G.Ro * 1.25 && y < G.cy + G.Ro) { G.glow = 1; api.play('gate'); api.procession('gate', 6); return true; }
      if (y > sc.floor(x) - U) { for (let i = 0; i < 3; i++) sc.glows.push({ x: x + (Math.random() - 0.5) * U * 4, y: sc.floor(x) + U * 0.4, t: -i * 0.25, s: 1 }); api.play('sandglow'); api.scare(x, y, U * 6); return true; }
      return false;
    },
    bless(sc, api) {
      sc.gate.glow = 1.6;
      for (const s of sc.strands) if (s.kind === 'lantern') s.glow = 1;
      for (const g of sc.geodes) g.glow = 1.2;
      for (let i = 0; i < 24; i++) sc.glows.push({ x: sc.ix0 + Math.random() * sc.iw, y: 0, t: -Math.random() * 1.5, s: 1.3 });
      for (const g of sc.glows) if (!g.y) g.y = sc.floor(g.x) + sc.U * 0.4;
      api.play('blessing');
      api.party();
      if (api.ready('moon')) { api.use('moon', 12 * 3600e3); setTimeout(() => api.pearl(sc.gate.cx, sc.gate.cy, 30 + Math.floor(Math.random() * 21), 'legendary'), 900); }
    },
  };

  /* ======================================================================
     Building and drawing a scene
     ====================================================================== */
  function build(id, W, H, dpr) {
    const E = ENVS[id] || ENVS.bowl;
    const sc = { id, W, H, dpr, U: Math.sqrt(W * H) / 100, t: 0, props: [], pois: [], strands: [], bubbles: [], pops: [], bubblers: [], rings: [], dark: 0, target: null };
    sc.inWater = (x, y) => x > sc.ix0 && x < sc.ix1 && y > sc.surf && y < sc.iy1;
    E.layout(sc);
    sc._layers = { back: strandsIn(sc, 'back'), mid: strandsIn(sc, 'mid'), front: strandsIn(sc, 'front') };
    const paint = fn => { const cv = mkCanvas(W * dpr, H * dpr), x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineJoin = 'round'; fn(x); return cv; };
    sc.bg = paint(x => E.paintBg(x, sc));
    if (E.paintMid) sc.mid = paint(x => E.paintMid(x, sc));
    sc.fg = paint(x => E.paintFg(x, sc));
    return sc;
  }
  function step(sc, dt, t, api) {
    sc.t = t;
    const E = ENVS[sc.id];
    for (const b of sc.bubblers) {
      b.acc += dt * b.rate;
      while (b.acc >= 1) { b.acc -= 1; bubble(sc, b.x + (Math.random() - 0.5) * b.spread, b.y, sc.U * (b.rmin + Math.random() * (b.rmax - b.rmin)), { z: b.z }); }
    }
    stepBubbles(sc, dt);
    for (const s of sc.strands) s.kick *= Math.exp(-dt * 1.4);
    if (E.step) E.step(sc, dt, t, api);
  }
  const back = (c, sc, t) => ENVS[sc.id].back(c, sc, t);
  const mid = (c, sc, t) => { if (sc.mid) c.drawImage(sc.mid, 0, 0, sc.W, sc.H); ENVS[sc.id].mid(c, sc, t); };
  const front = (c, sc, t) => { ENVS[sc.id].front(c, sc, t); c.drawImage(sc.fg, 0, 0, sc.W, sc.H); };
  const tap = (sc, x, y, api) => ENVS[sc.id].tap(sc, x, y, api);
  const shoo = sc => { if (ENVS[sc.id].shoo) ENVS[sc.id].shoo(sc); };

  return { build, step, back, mid, front, tap, brush, bubble, shoo, insideEll, strandPts, rgba };
})();
