/* Tidesong — painted, animated backdrops for the five fishing waters.
   Static scenery is rendered once per size into an offscreen canvas; water, sky motion
   and particles are drawn live each frame. */
'use strict';

const Scenes = (() => {
  const TAU = Math.PI * 2;

  function seeded(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  function lg(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function rg(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function rgbA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  /* Smooth 1-D value noise in [0,1]. */
  function noise1(seed, n) {
    const r = seeded(seed), pts = [];
    for (let i = 0; i <= n + 1; i++) pts.push(r());
    return x => {
      const f = Math.max(0, Math.min(0.9999, x)) * n, i = Math.floor(f), u = f - i;
      const s = (1 - Math.cos(u * Math.PI)) / 2;
      return pts[i] + (pts[i + 1] - pts[i]) * s;
    };
  }

  const PAL = {
    mistwillow: {
      sky: [[0, '#8fb4d6'], [0.5, '#d9d3d8'], [0.85, '#f6dccb'], [1, '#fbe8d2']],
      water: [[0, '#d8e4da'], [0.18, '#9cc2b8'], [0.55, '#5c948d'], [1, '#2b5b58']],
      light: { x: 0.72, y: 0.2, r: 0.05, rgb: '255,238,205', halo: 10, haloA: 0.6 }, glint: 0.55, refl: 0.5, glintRgb: '255,252,240', dock: 0,
      gl: { haze: 0.3, sway: 1.0, thr: 0.86, b1: 0.45, b2: 0.4, rays: 0.5, vig: 0.2 },
      lit: { dir: [0.55, 0.55, 0.62], key: [1, 0.94, 0.84], amb: [0.62, 0.68, 0.7], rim: [1, 0.96, 0.9], night: 0 },
    },
    lanternfen: {
      sky: [[0, '#1a1532'], [0.4, '#4a2e5e'], [0.75, '#a65a6c'], [1, '#f0a072']],
      water: [[0, '#b0727a'], [0.15, '#5a3a5e'], [0.5, '#2c2142'], [1, '#100c1f']],
      light: { x: 0.3, y: 0.02, r: 0.07, rgb: '255,176,120', halo: 12, haloA: 0.55 }, glint: 0.5, refl: 0.58, glintRgb: '255,200,160', dock: 0.35,
      gl: { haze: 0.2, sway: 0.55, thr: 0.62, b1: 0.6, b2: 0.55, rays: 0.4, vig: 0.3 },
      lit: { dir: [-0.75, 0.2, 0.62], key: [1, 0.68, 0.5], amb: [0.42, 0.36, 0.52], rim: [1, 0.62, 0.48], night: 0.5 },
    },
    coralspire: {
      sky: [[0, '#38a9d8'], [0.55, '#8fd8ea'], [0.9, '#e9f5e6'], [1, '#fff0d0']],
      water: [[0, '#b8efe6'], [0.15, '#55d0c8'], [0.5, '#1ea3b0'], [1, '#0a5f78']],
      light: { x: 0.8, y: 0.62, r: 0.045, rgb: '255,250,228', halo: 14, haloA: 0.55 }, glint: 0.85, refl: 0.3, glintRgb: '255,255,255', dock: 0,
      gl: { haze: 0.24, sway: 0.85, thr: 0.88, b1: 0.45, b2: 0.4, rays: 0.45, vig: 0.18 },
      lit: { dir: [0.6, 0.62, 0.5], key: [1, 0.98, 0.92], amb: [0.66, 0.78, 0.82], rim: [0.9, 1, 1], night: 0 },
    },
    frostveil: {
      sky: [[0, '#030918'], [0.55, '#0b2242'], [1, '#1d4668']],
      water: [[0, '#2d5d7e'], [0.15, '#123754'], [0.55, '#081f36'], [1, '#020a16']],
      light: { x: 0.2, y: 0.7, r: 0.028, rgb: '220,236,255', halo: 8, haloA: 0.35 }, glint: 0.45, refl: 0.62, glintRgb: '180,255,225', dock: 0.45,
      gl: { haze: 0.14, sway: 0, thr: 0.76, b1: 0.55, b2: 0.55, rays: 0.25, vig: 0.32 },
      lit: { dir: [-0.62, 0.55, 0.56], key: [0.62, 0.74, 0.92], amb: [0.3, 0.38, 0.5], rim: [0.55, 1, 0.82], night: 1 },
    },
    dragonmere: {
      sky: [[0, '#0c0720'], [0.45, '#2a0e34'], [0.82, '#66193a'], [1, '#a2363f']],
      water: [[0, '#8a3040'], [0.15, '#451437'], [0.55, '#1d0a26'], [1, '#08030f']],
      light: { x: 0.68, y: 0.48, r: 0.085, rgb: '255,224,175', halo: 7, haloA: 0.55 }, glint: 0.55, refl: 0.6, glintRgb: '255,205,150', dock: 0.5,
      gl: { haze: 0.18, sway: 0, thr: 0.7, b1: 0.5, b2: 0.5, rays: 0.55, vig: 0.32 },
      lit: { dir: [0.45, 0.52, 0.72], key: [0.98, 0.84, 0.66], amb: [0.42, 0.28, 0.4], rim: [1, 0.5, 0.5], night: 0.8 },
    },
  };

  function layout(w, h) {
    const portrait = h > w * 1.05;
    const horizon = Math.round(h * (portrait ? 0.42 : 0.47));
    const m = Math.min(w, h);
    return {
      w, h, m, portrait, horizon,
      bob: { x: w * (portrait ? 0.62 : 0.6), y: horizon + (h - horizon) * (portrait ? 0.3 : 0.33) },
      rodBase: { x: -m * 0.03, y: h + m * 0.04 },
      rodTip: { x: portrait ? w * 0.4 : Math.min(w * 0.33, 560), y: portrait ? h * 0.5 : h * 0.42 },
    };
  }

  /* ---------- glow sprite cache ---------- */
  const sprites = {};
  function glowSprite(rgb) {
    if (sprites[rgb]) return sprites[rgb];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = rg(x, 32, 32, 0, 32, [[0, `rgba(${rgb},1)`], [0.25, `rgba(${rgb},0.55)`], [1, `rgba(${rgb},0)`]]);
    x.fillRect(0, 0, 64, 64);
    sprites[rgb] = c;
    return c;
  }
  function glow(ctx, rgb, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- static background painters ---------- */
  function ridge(x, L, baseY, amp, seed, freq, fill, sharp) {
    const a = noise1(seed, freq), b = noise1(seed + 13, freq * 3);
    x.beginPath(); x.moveTo(0, L.horizon + 1);
    for (let px = 0; px <= L.w + 4; px += 4) {
      const u = px / L.w;
      let v = a(u) * 0.72 + b(u) * 0.28;
      if (sharp) v = Math.pow(1 - Math.abs(Math.sin(u * freq * 2.2 + seed)) * 0.5 - 0.5 + v, 1.2);
      x.lineTo(px, baseY - v * amp);
    }
    x.lineTo(L.w, L.horizon + 1); x.closePath();
    x.fillStyle = fill; x.fill();
  }

  function celestial(x, L, P, opts = {}) {
    const cx = P.light.x * L.w, cy = L.horizon - P.light.y * L.horizon, r = P.light.r * L.m;
    if (GLB) {
      x.beginPath(); x.arc(cx, cy, r, 0, TAU);
      x.fillStyle = opts.disc || `rgba(${P.light.rgb},0.96)`;
      x.fill();
      return { cx, cy, r };
    }
    x.fillStyle = rg(x, cx, cy, 0, r * (opts.halo || 9), [[0, `rgba(${P.light.rgb},${opts.haloA ?? 0.5})`], [0.3, `rgba(${P.light.rgb},${(opts.haloA ?? 0.5) * 0.3})`], [1, `rgba(${P.light.rgb},0)`]]);
    x.fillRect(0, 0, L.w, L.horizon);
    x.beginPath(); x.arc(cx, cy, r, 0, TAU);
    x.fillStyle = opts.disc || `rgba(${P.light.rgb},0.96)`;
    x.fill();
    return { cx, cy, r };
  }

  function stars(x, L, n, seed, maxY, a = 0.8) {
    const rnd = seeded(seed);
    for (let i = 0; i < n; i++) {
      const sx = rnd() * L.w, sy = rnd() * maxY, r = 0.4 + rnd() * 1.2;
      x.fillStyle = `rgba(255,250,240,${(0.25 + rnd() * 0.75) * a})`;
      x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
    }
  }

  function willow(x, cx, groundY, s, seed, mk) {
    const rnd = seeded(seed);
    x.save();
    x.fillStyle = '#3d4a3d';
    x.beginPath();
    x.moveTo(cx - s * 0.06, groundY);
    x.quadraticCurveTo(cx - s * 0.02, groundY - s * 0.4, cx + s * 0.02, groundY - s * 0.78);
    x.lineTo(cx + s * 0.06, groundY - s * 0.76);
    x.quadraticCurveTo(cx + s * 0.04, groundY - s * 0.4, cx + s * 0.07, groundY);
    x.closePath(); x.fill();
    for (let i = 0; i < 10; i++) {
      x.fillStyle = `rgba(${60 + rnd() * 30},${100 + rnd() * 30},${80 + rnd() * 20},${0.55 + rnd() * 0.3})`;
      x.beginPath(); x.arc(cx + (rnd() - 0.5) * s * 0.9, groundY - s * (0.72 + (rnd() - 0.5) * 0.2), s * (0.14 + rnd() * 0.12), 0, TAU); x.fill();
    }
    for (let i = 0; i < 90; i++) {
      const sx = cx + (rnd() - 0.5) * s * 1.15, sy = groundY - s * (0.6 + rnd() * 0.22);
      const ex = sx + (rnd() - 0.5) * s * 0.1 + s * 0.03, ey = groundY - rnd() * s * 0.16;
      x.strokeStyle = `rgba(${70 + rnd() * 40},${110 + rnd() * 40},${80 + rnd() * 25},${0.35 + rnd() * 0.45})`;
      x.lineWidth = 0.8 + rnd() * 2.2;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + s * 0.06, (sy + ey) / 2, ex, ey); x.stroke();
      if (mk) {
        mk.strokeStyle = lg(mk, sx, sy, ex, ey, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.95)']]);
        mk.lineWidth = 6 + rnd() * 4;
        mk.beginPath(); mk.moveTo(sx, sy); mk.quadraticCurveTo(sx + s * 0.06, (sy + ey) / 2, ex, ey); mk.stroke();
      }
    }
    if (mk) {
      mk.fillStyle = 'rgba(255,255,255,0.18)';
      mk.beginPath(); mk.ellipse(cx, groundY - s * 0.72, s * 0.6, s * 0.2, 0, 0, TAU); mk.fill();
    }
    x.restore();
  }

  function palm(x, bx, by, s, lean, col, mk) {
    x.strokeStyle = col; x.lineWidth = s * 0.06; x.lineCap = 'round';
    const tx = bx + lean * s, ty = by - s;
    x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + lean * s * 0.2, by - s * 0.6, tx, ty); x.stroke();
    x.fillStyle = col;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.5;
      const ex = tx + Math.cos(a) * s * 0.55, ey = ty + Math.sin(a) * s * 0.3 + s * 0.18;
      x.beginPath(); x.moveTo(tx, ty);
      x.quadraticCurveTo((tx + ex) / 2, ty - s * 0.18, ex, ey);
      x.quadraticCurveTo((tx + ex) / 2, ty - s * 0.06, tx, ty);
      x.fill();
    }
    if (mk) {
      mk.fillStyle = 'rgba(255,255,255,0.9)';
      mk.beginPath(); mk.ellipse(tx, ty + s * 0.08, s * 0.65, s * 0.32, 0, 0, TAU); mk.fill();
    }
  }

  function spire(x, cx, base, width, height, seed) {
    const rnd = seeded(seed);
    const pts = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const wob = (rnd() - 0.5) * width * 0.18;
      pts.push([k, width * (0.5 - k * 0.22) + wob]);
    }
    x.beginPath();
    x.moveTo(cx - pts[0][1], base);
    for (const [k, hw] of pts) x.lineTo(cx - hw, base - k * height);
    x.quadraticCurveTo(cx, base - height - width * 0.4, cx + pts[steps][1], base - height);
    for (let i = steps; i >= 0; i--) x.lineTo(cx + pts[i][1], base - pts[i][0] * height);
    x.closePath();
    x.fillStyle = lg(x, cx - width / 2, 0, cx + width / 2, 0, [[0, '#ffc1b4'], [0.45, '#f28d97'], [1, '#b44d72']]);
    x.fill();
    x.save(); x.clip();
    for (let i = 0; i < 22; i++) {
      x.fillStyle = `rgba(150,40,80,${0.15 + rnd() * 0.2})`;
      x.beginPath(); x.ellipse(cx + (rnd() - 0.5) * width, base - rnd() * height, 1 + rnd() * width * 0.05, 1 + rnd() * width * 0.04, 0, 0, TAU); x.fill();
    }
    for (let i = 0; i < 5; i++) {
      x.strokeStyle = 'rgba(255,220,210,0.25)'; x.lineWidth = 1.5;
      const yy = base - (0.15 + i * 0.17) * height;
      x.beginPath(); x.moveTo(cx - width, yy); x.quadraticCurveTo(cx, yy - 6, cx + width, yy + 2); x.stroke();
    }
    x.restore();
  }

  function pagoda(x, cx, by, s, col) {
    x.fillStyle = col;
    let y = by, w = s * 0.5;
    for (let i = 0; i < 5; i++) {
      const bodyH = s * 0.1, roofH = s * 0.05;
      x.fillRect(cx - w * 0.36, y - bodyH, w * 0.72, bodyH);
      x.fillStyle = 'rgba(255,190,110,0.85)';
      for (let k = -1; k <= 1; k++) x.fillRect(cx + k * w * 0.18 - s * 0.008, y - bodyH * 0.7, s * 0.016, bodyH * 0.4);
      x.fillStyle = col;
      y -= bodyH;
      x.beginPath();
      x.moveTo(cx - w * 0.62, y + roofH * 0.2);
      x.quadraticCurveTo(cx - w * 0.4, y - roofH * 0.2, cx - w * 0.3, y - roofH);
      x.lineTo(cx + w * 0.3, y - roofH);
      x.quadraticCurveTo(cx + w * 0.4, y - roofH * 0.2, cx + w * 0.62, y + roofH * 0.2);
      x.closePath(); x.fill();
      y -= roofH;
      w *= 0.8;
    }
    x.fillRect(cx - s * 0.006, y - s * 0.12, s * 0.012, s * 0.12);
  }

  const BG = {
    mistwillow(x, L, P, mk) {
      celestial(x, L, P, { halo: 10, haloA: 0.6 });
      ridge(x, L, L.horizon - L.h * 0.02, L.h * 0.12, 5, 5, 'rgba(150,178,186,0.75)');
      ridge(x, L, L.horizon, L.h * 0.07, 9, 8, 'rgba(116,152,140,0.9)');
      ridge(x, L, L.horizon + 1, L.h * 0.025, 21, 30, '#5e8470');
      const s = Math.max(150, Math.min(L.m * 0.55, 420));
      willow(x, -s * 0.1, L.horizon + 2, s, 3, mk);
      willow(x, L.w + s * 0.12, L.horizon + 2, s * 1.1, 7, mk);
      if (!L.portrait) willow(x, L.w * 0.2, L.horizon + 1, s * 0.45, 11, mk);
    },
    lanternfen(x, L, P, mk) {
      stars(x, L, 50, 4, L.horizon * 0.5, 0.7);
      const c = celestial(x, L, P, { halo: 12, haloA: 0.55 });
      x.fillStyle = 'rgba(255,140,110,0.35)'; x.fillRect(0, c.cy - 1, L.w, 2);
      ridge(x, L, L.horizon, L.h * 0.05, 3, 6, 'rgba(90,50,90,0.65)');
      const rnd = seeded(12);
      x.fillStyle = '#251a35';
      for (let px = -10; px < L.w + 10; px += 6 + rnd() * 10) {
        const th = L.h * (0.03 + rnd() * 0.1), tw = 4 + rnd() * 8;
        x.beginPath(); x.moveTo(px - tw, L.horizon + 1);
        x.quadraticCurveTo(px - tw * 0.3, L.horizon - th * 0.6, px, L.horizon - th);
        x.quadraticCurveTo(px + tw * 0.3, L.horizon - th * 0.6, px + tw, L.horizon + 1);
        x.fill();
        if (mk) {
          mk.fillStyle = lg(mk, 0, L.horizon - th, 0, L.horizon, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
          mk.beginPath(); mk.moveTo(px - tw, L.horizon); mk.lineTo(px, L.horizon - th - 2); mk.lineTo(px + tw, L.horizon); mk.closePath(); mk.fill();
        }
      }
      ridge(x, L, L.horizon + 1, L.h * 0.02, 33, 40, '#1a1227');
    },
    coralspire(x, L, P, mk) {
      celestial(x, L, P, { halo: 14, haloA: 0.55 });
      x.fillStyle = lg(x, 0, L.horizon - L.h * 0.05, 0, L.horizon, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.45)']]);
      x.fillRect(0, L.horizon - L.h * 0.05, L.w, L.h * 0.05);
      const ix = L.w * 0.45, iw = L.w * 0.16;
      x.fillStyle = '#4f9f8f';
      x.beginPath(); x.ellipse(ix, L.horizon + 1, iw, L.h * 0.02, 0, Math.PI, TAU); x.fill();
      const ps = Math.max(26, L.m * 0.08);
      palm(x, ix - iw * 0.3, L.horizon - L.h * 0.012, ps, -0.25, '#2f7268', mk);
      palm(x, ix + iw * 0.1, L.horizon - L.h * 0.016, ps * 1.2, 0.18, '#2f7268', mk);
      palm(x, ix + iw * 0.45, L.horizon - L.h * 0.008, ps * 0.8, 0.3, '#2f7268', mk);
      const sw = Math.max(26, L.m * 0.07);
      spire(x, L.w * 0.07, L.horizon + 2, sw * 1.2, L.h * 0.27, 2);
      spire(x, L.w * 0.17, L.horizon + 2, sw * 0.8, L.h * 0.16, 3);
      spire(x, L.w * 0.84, L.horizon + 2, sw, L.h * 0.22, 4);
      spire(x, L.w * 0.95, L.horizon + 2, sw * 1.3, L.h * 0.3, 5);
      spire(x, L.w * 0.29, L.horizon + 2, sw * 0.45, L.h * 0.06, 6);
      spire(x, L.w * 0.7, L.horizon + 2, sw * 0.5, L.h * 0.08, 8);
    },
    frostveil(x, L, P) {
      stars(x, L, 160, 8, L.horizon * 0.85, 1);
      celestial(x, L, P, { halo: 8, haloA: 0.35 });
      const a = noise1(4, 7);
      x.beginPath(); x.moveTo(0, L.horizon + 1);
      for (let px = 0; px <= L.w + 6; px += 6) {
        const u = px / L.w;
        const peaks = Math.abs(Math.sin(u * 9.5 + 1.2)) * 0.55 + a(u) * 0.45;
        x.lineTo(px, L.horizon - peaks * L.h * 0.14);
      }
      x.lineTo(L.w, L.horizon + 1); x.closePath();
      x.fillStyle = lg(x, 0, L.horizon - L.h * 0.14, 0, L.horizon, [[0, '#dfeaf6'], [0.35, '#8fb0cc'], [1, '#1e3e5e']]);
      x.fill();
      const cliff = (pts, light) => {
        x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) x.lineTo(p[0], p[1]);
        x.closePath();
        x.fillStyle = lg(x, 0, pts[0][1], 0, L.horizon, [[0, light], [0.5, '#9cc0de'], [1, '#365f86']]);
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 1;
        for (let i = 1; i < pts.length - 2; i++) { x.beginPath(); x.moveTo(pts[i][0], pts[i][1]); x.lineTo(pts[i][0] + (i % 2 ? 12 : -8), L.horizon); x.stroke(); }
      };
      const H = L.horizon, h = L.h;
      cliff([[0, H - h * 0.36], [L.w * 0.06, H - h * 0.33], [L.w * 0.1, H - h * 0.22], [L.w * 0.16, H - h * 0.18], [L.w * 0.2, H - h * 0.08], [L.w * 0.27, H - h * 0.02], [L.w * 0.3, H + 1], [0, H + 1]], '#f4fbff');
      cliff([[L.w, H - h * 0.3], [L.w * 0.95, H - h * 0.29], [L.w * 0.9, H - h * 0.17], [L.w * 0.85, H - h * 0.12], [L.w * 0.8, H - h * 0.04], [L.w * 0.76, H + 1], [L.w, H + 1]], '#eef7ff');
    },
    dragonmere(x, L, P) {
      stars(x, L, 70, 6, L.horizon * 0.6, 0.6);
      const c = celestial(x, L, P, { halo: 7, haloA: 0.55, disc: '#fff0d2' });
      x.save();
      x.beginPath(); x.arc(c.cx, c.cy, c.r, 0, TAU); x.clip();
      x.fillStyle = 'rgba(214,170,120,0.25)';
      const rnd = seeded(77);
      for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(c.cx + (rnd() - 0.5) * c.r * 1.4, c.cy + (rnd() - 0.5) * c.r * 1.4, c.r * (0.08 + rnd() * 0.16), 0, TAU); x.fill(); }
      x.restore();
      x.fillStyle = 'rgba(40,10,40,0.55)';
      x.beginPath(); x.ellipse(c.cx - c.r * 0.4, c.cy + c.r * 0.35, c.r * 1.8, c.r * 0.12, -0.05, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(c.cx + c.r * 0.9, c.cy - c.r * 0.2, c.r * 1.2, c.r * 0.08, 0.04, 0, TAU); x.fill();
      ridge(x, L, L.horizon - L.h * 0.04, L.h * 0.2, 14, 4, 'rgba(92,34,74,0.75)', true);
      ridge(x, L, L.horizon - L.h * 0.01, L.h * 0.1, 18, 7, 'rgba(58,20,52,0.92)');
      // temple cliff
      const cw = L.portrait ? L.w * 0.34 : L.w * 0.22, top = L.horizon - L.h * 0.12;
      x.fillStyle = '#1c0a20';
      x.beginPath(); x.moveTo(0, L.horizon + 1); x.lineTo(0, top);
      x.quadraticCurveTo(cw * 0.5, top - L.h * 0.012, cw * 0.78, top + L.h * 0.02);
      x.quadraticCurveTo(cw * 0.95, L.horizon - L.h * 0.04, cw * 1.1, L.horizon + 1); x.closePath(); x.fill();
      pagoda(x, cw * 0.42, top + 2, Math.max(70, L.h * 0.2), '#170819');
    },
  };

  let GLB = false;
  const MASK_SCALE = 0.25;
  function buildBg(id, w, h, scale, glMode) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(h * scale));
    const x = c.getContext('2d');
    x.scale(scale, scale);
    let mask = null, mk = null;
    if (glMode) {
      mask = document.createElement('canvas');
      mask.width = Math.max(1, Math.ceil(w * MASK_SCALE)); mask.height = Math.max(1, Math.ceil(h * MASK_SCALE));
      mk = mask.getContext('2d');
      mk.fillStyle = '#000'; mk.fillRect(0, 0, mask.width, mask.height);
      mk.scale(MASK_SCALE, MASK_SCALE);
      mk.lineCap = 'round';
    }
    const L = layout(w, h);
    GLB = !!glMode;
    if (!glMode) {
      x.fillStyle = lg(x, 0, 0, 0, L.horizon, PAL[id].sky);
      x.fillRect(0, 0, w, L.horizon + 2);
    }
    BG[id](x, L, PAL[id], mk);
    GLB = false;
    return { bg: c, mask };
  }

  /* ---------- live state ---------- */
  let cur = { id: null, w: 0, h: 0, scale: 1, gl: false, bg: null, mask: null, parts: null, version: 0 };

  function makeParticles(id, L) {
    const rnd = seeded(1000 + id.length * 31);
    const P = { glints: [], list: [], fixed: [] };
    for (let i = 0; i < 110; i++) P.glints.push({ fx: rnd(), fy: rnd(), ph: rnd() * TAU, sp: 0.4 + rnd() * 0.8 });
    const n = (a) => Math.round(a * Math.min(1.4, Math.max(0.6, (L.w * L.h) / (1200 * 800))));
    if (id === 'mistwillow') {
      for (let i = 0; i < n(30); i++) P.list.push({ k: 'mote', x: rnd() * L.w, y: rnd() * L.h * 0.8, r: 1 + rnd() * 1.8, vx: 4 + rnd() * 8, ph: rnd() * TAU });
      for (let i = 0; i < 5; i++) P.list.push({ k: 'leaf', x: rnd() * L.w, y: rnd() * L.h, r: 3 + rnd() * 3, vy: 14 + rnd() * 16, ph: rnd() * TAU });
      for (let i = 0; i < 8; i++) P.fixed.push({ k: 'pad', fx: rnd(), fy: 0.12 + rnd() * 0.75, s: 0.6 + rnd() * 0.7, ph: rnd() * TAU, flower: rnd() < 0.3 });
    } else if (id === 'lanternfen') {
      for (let i = 0; i < n(34); i++) P.list.push({ k: 'fly', x: rnd() * L.w, y: L.horizon - L.h * 0.15 + rnd() * L.h * 0.55, vx: 0, vy: 0, ph: rnd() * TAU, f: 0.6 + rnd() * 1.2 });
      P.fixed.push({ k: 'post', fx: 0.16, fy: 0.08, s: 1 }, { k: 'post', fx: 0.82, fy: 0.15, s: 1.25 }, { k: 'post', fx: 0.5, fy: 0.03, s: 0.7 });
    } else if (id === 'coralspire') {
      for (let i = 0; i < 6; i++) P.list.push({ k: 'cloud', x: rnd() * L.w * 1.3, y: L.horizon * (0.12 + rnd() * 0.5), s: 0.6 + rnd() * 0.9, vx: 4 + rnd() * 6, seed: Math.floor(rnd() * 1000) });
      for (let i = 0; i < 3; i++) P.list.push({ k: 'gull', x: rnd() * L.w, y: L.horizon * (0.25 + rnd() * 0.4), vx: 16 + rnd() * 14, ph: rnd() * TAU, s: 0.7 + rnd() * 0.6 });
    } else if (id === 'frostveil') {
      for (let i = 0; i < n(90); i++) P.list.push({ k: 'snow', x: rnd() * L.w, y: rnd() * L.h, r: 0.7 + rnd() * 2, vy: 14 + rnd() * 30, ph: rnd() * TAU });
      for (let i = 0; i < 5; i++) P.fixed.push({ k: 'floe', fx: rnd(), fy: 0.05 + rnd() * 0.45, s: 0.6 + rnd() * 0.9, vx: (rnd() - 0.5) * 0.004, ph: rnd() * TAU });
    } else if (id === 'dragonmere') {
      for (let i = 0; i < n(14); i++) P.list.push({ k: 'lantern', x: rnd() * L.w, y: rnd() * L.horizon, vy: 5 + rnd() * 9, s: 0.5 + rnd() * 0.8, ph: rnd() * TAU });
      for (let i = 0; i < n(18); i++) P.list.push({ k: 'petal', x: rnd() * L.w, y: rnd() * L.h, vy: 10 + rnd() * 14, r: 2 + rnd() * 2.5, ph: rnd() * TAU });
      for (let i = 0; i < 7; i++) P.fixed.push({ k: 'float', fx: rnd(), fy: 0.06 + rnd() * 0.6, s: 0.6 + rnd() * 0.7, ph: rnd() * TAU });
    }
    return P;
  }

  /* Returns true when the scenery was rebuilt (the GPU renderer then re-uploads it). */
  function ensure(id, w, h, scale, glMode = false) {
    if (cur.id === id && cur.w === w && cur.h === h && cur.scale === scale && cur.gl === glMode) return false;
    const L = layout(w, h);
    const sameLoc = cur.id === id;
    const b = buildBg(id, w, h, scale, glMode);
    cur = { id, w, h, scale, gl: glMode, bg: b.bg, mask: b.mask, parts: sameLoc && cur.parts ? cur.parts : makeParticles(id, L), version: cur.version + 1 };
    return true;
  }

  function update(dt, L, t) {
    const P = cur.parts;
    if (!P) return;
    for (const p of P.list) {
      switch (p.k) {
        case 'mote':
          p.x += p.vx * dt; p.y += Math.sin(t * 0.6 + p.ph) * 6 * dt;
          if (p.x > L.w + 10) { p.x = -10; p.y = Math.random() * L.h * 0.8; }
          break;
        case 'leaf':
          p.y += p.vy * dt; p.x += Math.sin(t * 1.2 + p.ph) * 22 * dt + 6 * dt;
          if (p.y > L.h + 10) { p.y = -10; p.x = Math.random() * L.w; }
          break;
        case 'fly':
          p.vx += (Math.random() - 0.5) * 60 * dt; p.vy += (Math.random() - 0.5) * 60 * dt;
          p.vx *= 0.97; p.vy *= 0.97;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -20) p.x = L.w + 20; if (p.x > L.w + 20) p.x = -20;
          p.y = Math.max(L.horizon - L.h * 0.2, Math.min(L.h, p.y));
          break;
        case 'cloud':
          p.x += p.vx * dt; if (p.x > L.w + 300) p.x = -300;
          break;
        case 'gull':
          p.x += p.vx * dt; p.y += Math.sin(t * 0.7 + p.ph) * 4 * dt;
          if (p.x > L.w + 40) { p.x = -40; p.y = L.horizon * (0.2 + Math.random() * 0.45); }
          break;
        case 'snow':
          p.y += p.vy * dt; p.x += Math.sin(t * 0.9 + p.ph) * 12 * dt;
          if (p.y > L.h + 5) { p.y = -5; p.x = Math.random() * L.w; }
          break;
        case 'lantern':
          p.y -= p.vy * dt; p.x += Math.sin(t * 0.5 + p.ph) * 4 * dt;
          if (p.y < -30) { p.y = L.horizon + 10; p.x = Math.random() * L.w; }
          break;
        case 'petal':
          p.y += p.vy * dt; p.x += (Math.sin(t * 1.1 + p.ph) * 20 + 10) * dt;
          if (p.y > L.h + 10) { p.y = -10; p.x = Math.random() * L.w; }
          break;
      }
    }
    for (const f of P.fixed) if (f.k === 'floe') { f.fx += f.vx * dt; if (f.fx < -0.15) f.fx = 1.15; if (f.fx > 1.15) f.fx = -0.15; }
  }

  /* ---------- live drawing ---------- */
  function cloud(ctx, x, y, s, seed) {
    const rnd = seeded(seed);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath(); ctx.arc(x + (i - 3) * 22 * s + rnd() * 8, y - Math.sin((i / 6) * Math.PI) * 14 * s - rnd() * 6, (16 + rnd() * 14) * s, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(200,230,240,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 6 * s, 80 * s, 8 * s, 0, 0, TAU); ctx.fill();
  }

  function aurora(ctx, L, t, alpha = 1, flip = false) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bands = [[0.55, '120,255,190', 0], [0.42, '90,200,255', 1.7], [0.3, '190,120,255', 3.1]];
    for (const [yy, rgb, ph] of bands) {
      const base = L.horizon * yy;
      const top = [], bot = [];
      for (let px = -20; px <= L.w + 20; px += 16) {
        const u = px * 0.004;
        const c = base + Math.sin(u * 1.3 + t * 0.12 + ph) * L.h * 0.05 + Math.sin(u * 3.1 - t * 0.09 + ph) * L.h * 0.02;
        const hgt = L.h * (0.07 + 0.05 * Math.sin(u * 2 + t * 0.2 + ph));
        top.push([px, c - hgt]); bot.push([px, c + hgt * 0.15]);
      }
      const g = lg(ctx, 0, base - L.h * 0.13, 0, base + L.h * 0.03, [[0, `rgba(${rgb},0)`], [0.6, `rgba(${rgb},${0.22 * alpha})`], [1, `rgba(${rgb},0)`]]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const p of top) ctx.lineTo(p[0], p[1]);
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
      if (flip) { ctx.save(); ctx.translate(0, L.horizon * 2); ctx.scale(1, -1); ctx.fill(); ctx.restore(); }
      else ctx.fill();
    }
    ctx.restore();
  }

  function drawSky(ctx, L, t) {
    const id = cur.id, P = cur.parts;
    if (id === 'coralspire') {
      for (const p of P.list) if (p.k === 'cloud') cloud(ctx, p.x - 150, p.y, p.s * (L.m / 700), p.seed);
      ctx.strokeStyle = 'rgba(40,70,80,0.7)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (const p of P.list) if (p.k === 'gull') {
        const f = Math.sin(t * 6 + p.ph) * 4 * p.s, s = 8 * p.s;
        ctx.beginPath(); ctx.moveTo(p.x - s, p.y - f); ctx.quadraticCurveTo(p.x - s * 0.4, p.y - s * 0.5 - f * 0.3, p.x, p.y);
        ctx.quadraticCurveTo(p.x + s * 0.4, p.y - s * 0.5 - f * 0.3, p.x + s, p.y - f); ctx.stroke();
      }
    } else if (id === 'frostveil') {
      aurora(ctx, L, t);
      const rnd = seeded(5);
      for (let i = 0; i < 14; i++) {
        const x = rnd() * L.w, y = rnd() * L.horizon * 0.7, tw = Math.max(0, Math.sin(t * (0.8 + rnd()) + i * 2));
        glow(ctx, '230,240,255', x, y, 6, tw * 0.8);
      }
    } else if (id === 'mistwillow') {
      // drifting morning mist
      for (let i = 0; i < 4; i++) {
        const x = ((t * (6 + i * 3) + i * L.w * 0.4) % (L.w * 1.6)) - L.w * 0.3;
        glow(ctx, '255,255,250', x, L.horizon - L.h * 0.01, L.w * 0.35, 0.18);
      }
    } else if (id === 'dragonmere') {
      for (const p of P.list) {
        if (p.k !== 'lantern' || p.y > L.horizon + 10) continue;
        const s = p.s * (L.m / 600);
        const fade = Math.min(1, Math.max(0, p.y / (L.horizon * 0.4)));
        const flick = 0.85 + 0.15 * Math.sin(t * 7 + p.ph * 3);
        glow(ctx, '255,160,80', p.x, p.y, 34 * s, 0.42 * fade * flick);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffd896';
        ctx.beginPath(); ctx.moveTo(p.x - 6 * s, p.y - 8 * s); ctx.lineTo(p.x + 6 * s, p.y - 8 * s); ctx.lineTo(p.x + 4.5 * s, p.y + 8 * s); ctx.lineTo(p.x - 4.5 * s, p.y + 8 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,220,0.85)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 2 * s, 2.6 * s, 4.5 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff8a4a'; ctx.fillRect(p.x - 4.5 * s, p.y + 5 * s, 9 * s, 3 * s);
        ctx.globalAlpha = 1;
      }
    }
    if (typeof Flourish !== 'undefined') Flourish.draw(ctx, 'sky', L, t);
  }

  /* The live sky layer for the GPU renderer, drawn into its own canvas (sky region only). */
  let dyn = null, dynCtx = null;
  function renderDyn(L, t, scale) {
    const w = Math.max(1, Math.ceil(L.w * scale)), h = Math.max(1, Math.ceil(L.horizon * scale));
    if (!dyn) { dyn = document.createElement('canvas'); dynCtx = dyn.getContext('2d'); }
    if (dyn.width !== w || dyn.height !== h) { dyn.width = w; dyn.height = h; }
    dynCtx.setTransform(1, 0, 0, 1, 0, 0);
    dynCtx.clearRect(0, 0, w, h);
    dynCtx.setTransform(scale, 0, 0, scale, 0, 0);
    drawSky(dynCtx, L, t);
    return dyn;
  }

  /* Uniforms that describe the current water to the GPU renderer. */
  function glMeta(L) {
    const P = PAL[cur.id];
    const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    const stops = P.sky.slice();
    while (stops.length < 5) stops.push(stops[stops.length - 1]);
    return {
      hor: L.horizon / L.h,
      sky: stops.slice(0, 5).map(st => hex(st[1])),
      skyOff: [stops[1][0], stops[2][0], stops[3][0], stops[4][0]],
      light: [P.light.x, (L.horizon - P.light.y * L.horizon) / L.h],
      lightCol: P.light.rgb.split(',').map(v => v / 255),
      haloA: P.light.haloA, haloR: (P.light.r * L.m * P.light.halo) / L.h,
      water: [hex(P.water[0][1]), hex(P.water[1][1]), hex(P.water[P.water.length - 1][1])],
      refl: P.refl, glint: P.glint, haze: P.gl.haze, hazeCol: hex(P.sky[P.sky.length - 1][1]), sway: P.gl.sway,
      bloomThr: P.gl.thr, bloom1: P.gl.b1, bloom2: P.gl.b2, rays: P.gl.rays, vignette: P.gl.vig,
    };
  }

  /* Scene light for lit sprites (gear, the leaping fish): direction (x right, y up, z towards the viewer),
     key and ambient colours, rim colour, how dark it is (0 day, 1 night) and the water's body colour. */
  function lighting() {
    const P = PAL[cur.id];
    const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    if (!P.lit.water) P.lit.water = hex(P.water[2][1]);
    return P.lit;
  }

  /* Lily pad positions (for the frog). */
  function pads(L) {
    const wh = L.h - L.horizon, out = [];
    for (const f of (cur.parts ? cur.parts.fixed : [])) {
      if (f.k !== 'pad') continue;
      const y = L.horizon + Math.pow(f.fy, 1.25) * wh, persp = 0.35 + (y - L.horizon) / wh;
      out.push({ x: f.fx * L.w, y, s: f.s * persp * (L.m / 600), r: 22 * f.s * persp * (L.m / 600) });
    }
    return out;
  }

  function drawWater(ctx, L, t) {
    const id = cur.id, Pal = PAL[id], { w, h, horizon } = L;
    const wh = h - horizon;
    ctx.fillStyle = lg(ctx, 0, horizon, 0, h, Pal.water);
    ctx.fillRect(0, horizon, w, wh);

    // mirrored, rippling reflection of the scenery
    const bg = cur.bg, dpr = cur.scale;
    const reflH = Math.min(wh, horizon);
    const step = 3;
    ctx.globalAlpha = Pal.refl;
    for (let y = 0; y < reflH; y += step) {
      const k = y / reflH;
      const off = Math.sin(y * 0.11 + t * 1.6) * (1 + k * 8) + Math.sin(y * 0.035 - t * 0.8) * k * 6;
      const sy = horizon - y - step;
      if (sy < 0) break;
      ctx.drawImage(bg, 0, sy * dpr, bg.width, step * dpr, off, horizon + y, w, step + 0.6);
    }
    ctx.globalAlpha = 1;
    if (id === 'frostveil') aurora(ctx, L, t, 0.45, true);

    // fade reflection into deep water
    ctx.fillStyle = lg(ctx, 0, horizon, 0, h, Pal.water.map(([o, c]) => [o, rgbA(c, Math.min(1, 0.12 + o * 1.1))]));
    ctx.fillRect(0, horizon, w, wh);

    // light path under the sun/moon
    const lx = Pal.light.x * w;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 50; i++) {
      const k = i / 50, y = horizon + 2 + Math.pow(k, 1.6) * wh * 0.92;
      const spread = (6 + k * 80) * (L.m / 700);
      const x = lx + Math.sin(i * 12.9898 + t * (0.9 + (i % 5) * 0.25)) * spread;
      const len = (8 + k * 60) * (L.m / 700) * (0.55 + 0.45 * Math.sin(t * 1.7 + i * 1.3));
      ctx.fillStyle = `rgba(${Pal.light.rgb},${0.32 * (1 - k * 0.75) * Pal.glint})`;
      ctx.fillRect(x - len / 2, y, len, 1 + k * 2.4);
    }
    // scattered glints
    for (const g of cur.parts.glints) {
      const y = horizon + 3 + Math.pow(g.fy, 1.7) * wh;
      const x = ((g.fx * (w + 60) + t * g.sp * (6 + g.fy * 22)) % (w + 60)) - 30;
      const a = Math.pow(Math.max(0, Math.sin(t * g.sp * 1.4 + g.ph)), 3) * Pal.glint * 0.55;
      if (a < 0.02) continue;
      const len = (3 + g.fy * 26) * (L.m / 700);
      ctx.fillStyle = `rgba(${Pal.glintRgb},${a})`;
      ctx.fillRect(x - len / 2, y, len, 1 + g.fy * 1.6);
    }
    ctx.restore();

    // a soft horizon line
    ctx.fillStyle = lg(ctx, 0, horizon - 2, 0, horizon + 6, [[0, 'rgba(255,255,255,0)'], [0.5, `rgba(${Pal.light.rgb},0.2)`], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(0, horizon - 2, w, 8);
  }

  /* Things floating on the water (drawn before the bobber/line). */
  function drawSurface(ctx, L, t) {
    const id = cur.id, P = cur.parts, wh = L.h - L.horizon;
    for (const f of P.fixed) {
      const y = L.horizon + Math.pow(f.fy, 1.25) * wh;
      const persp = 0.35 + (y - L.horizon) / wh;
      const x = f.fx * L.w;
      const s = f.s * persp * (L.m / 600);
      if (f.k === 'pad') {
        ctx.save(); ctx.translate(x, y + Math.sin(t * 0.8 + f.ph) * 1.2); ctx.scale(1, 0.38);
        ctx.fillStyle = 'rgba(30,60,45,0.35)'; ctx.beginPath(); ctx.arc(2, 3, 22 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4f8a5a';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 22 * s, 0.25 + f.ph, TAU - 0.25 + f.ph); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(160,210,150,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
        if (f.flower) {
          ctx.save(); ctx.translate(x - 3 * s, y - 4 * s);
          for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.rotate((i - 2.5) * 0.35);
            ctx.fillStyle = i % 2 ? '#ffd6e2' : '#f7b8cc';
            ctx.beginPath(); ctx.ellipse(0, -6 * s, 3 * s, 7 * s, 0, 0, TAU); ctx.fill();
            ctx.restore();
          }
          ctx.fillStyle = '#ffe07a'; ctx.beginPath(); ctx.arc(0, -2 * s, 2.4 * s, 0, TAU); ctx.fill();
          ctx.restore();
        }
      } else if (f.k === 'post') {
        const ph = L.m / 600 * f.s;
        const top = y - 90 * ph;
        ctx.fillStyle = '#2a1d2c'; ctx.fillRect(x - 3 * ph, top, 6 * ph, 90 * ph);
        ctx.fillRect(x - 3 * ph, top, 18 * ph, 3 * ph);
        const flick = 0.85 + Math.sin(t * 9 + x) * 0.05 + Math.sin(t * 13.3 + x) * 0.05;
        glow(ctx, '255,190,110', x + 15 * ph, top + 16 * ph, 60 * ph, 0.55 * flick);
        ctx.save();
        ctx.translate(x + 15 * ph, top + 2 * ph);
        ctx.rotate(Math.sin(t * 1.2 + x * 0.01) * 0.09);
        ctx.strokeStyle = '#3b2a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 3 * ph); ctx.stroke();
        ctx.fillStyle = '#3b2a2a'; ctx.fillRect(-5 * ph, 2 * ph, 10 * ph, 3 * ph);
        ctx.fillStyle = `rgba(255,214,140,${flick})`; ctx.fillRect(-4 * ph, 5 * ph, 8 * ph, 14 * ph);
        ctx.fillStyle = `rgba(255,250,225,${flick})`; ctx.fillRect(-1.6 * ph, 8 * ph, 3.2 * ph, 8 * ph);
        ctx.restore();
        glow(ctx, '255,180,100', x + 15 * ph, y + 20 * ph, 30 * ph, 0.25 * flick);
        ctx.fillStyle = 'rgba(255,190,120,0.25)';
        for (let i = 0; i < 5; i++) ctx.fillRect(x + 15 * ph - (10 - i) * ph, y + (4 + i * 7) * ph, (20 - i * 2) * ph, 1.4);
      } else if (f.k === 'floe') {
        ctx.save(); ctx.translate(x, y + Math.sin(t * 0.7 + f.ph) * 1.5);
        ctx.fillStyle = 'rgba(10,30,50,0.4)'; ctx.beginPath(); ctx.ellipse(3, 5 * s, 46 * s, 8 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d9ebf8';
        ctx.beginPath(); ctx.moveTo(-44 * s, 2 * s); ctx.lineTo(-30 * s, -7 * s); ctx.lineTo(10 * s, -9 * s); ctx.lineTo(40 * s, -4 * s); ctx.lineTo(46 * s, 3 * s); ctx.lineTo(-20 * s, 6 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9fc3df'; ctx.beginPath(); ctx.moveTo(-44 * s, 2 * s); ctx.lineTo(46 * s, 3 * s); ctx.lineTo(30 * s, 8 * s); ctx.lineTo(-30 * s, 7 * s); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (f.k === 'float') {
        const bob = Math.sin(t * 1.1 + f.ph) * 1.5;
        glow(ctx, '255,170,90', x, y + 6 * s, 50 * s, 0.35);
        ctx.fillStyle = 'rgba(255,170,100,0.22)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x - (12 - i * 2) * s, y + (6 + i * 6) * s, (24 - i * 4) * s, 1.3);
        ctx.fillStyle = '#5a1a1e'; ctx.fillRect(x - 9 * s, y - 2 * s + bob, 18 * s, 4 * s);
        ctx.fillStyle = '#ffcf8a'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 7 * s, y - 16 * s + bob, 14 * s, 14 * s, 3 * s) : ctx.rect(x - 7 * s, y - 16 * s + bob, 14 * s, 14 * s); ctx.fill();
        ctx.fillStyle = '#d2483f'; ctx.fillRect(x - 7 * s, y - 16 * s + bob, 14 * s, 3 * s);
        glow(ctx, '255,200,120', x, y - 9 * s + bob, 22 * s, 0.6);
      }
    }
  }

  /* Foreground: dock and reeds (drawn after the line, before the rod). */
  function drawFront(ctx, L, t) {
    const id = cur.id, Pal = PAL[id];
    const dockTop = L.h - L.m * 0.11, dockW = L.portrait ? L.w * 0.5 : Math.min(L.w * 0.34, 520);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-5, dockTop);
    ctx.lineTo(dockW, dockTop + L.m * 0.02);
    ctx.lineTo(dockW + L.m * 0.05, L.h + 5);
    ctx.lineTo(-5, L.h + 5);
    ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, dockTop, 0, L.h, [[0, '#8a6446'], [0.2, '#6b4a33'], [1, '#3a271b']]);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,25,15,0.55)'; ctx.lineWidth = 1.5;
    const planks = 9;
    for (let i = 1; i < planks; i++) {
      const x0 = (dockW / planks) * i;
      ctx.beginPath(); ctx.moveTo(x0, dockTop); ctx.lineTo(x0 + (x0 / dockW) * L.m * 0.05 - 6, L.h + 5); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,230,190,0.18)'; ctx.fillRect(-5, dockTop, dockW + 10, 2);
    if (Pal.dock) { ctx.fillStyle = `rgba(10,5,20,${Pal.dock})`; ctx.fillRect(-5, dockTop - 5, dockW + L.m * 0.1, L.h); }
    ctx.restore();
    // mooring post
    const px = dockW - L.m * 0.01, pt = dockTop - L.m * 0.06;
    ctx.fillStyle = lg(ctx, px - 8, 0, px + 8, 0, [[0, '#5b3e2a'], [0.5, '#7d5a3e'], [1, '#3e2a1d']]);
    ctx.fillRect(px - L.m * 0.012, pt, L.m * 0.024, L.h - pt);
    ctx.fillStyle = 'rgba(255,230,190,0.25)'; ctx.fillRect(px - L.m * 0.012, pt, L.m * 0.024, 2);
    if (Pal.dock) { ctx.fillStyle = `rgba(10,5,20,${Pal.dock})`; ctx.fillRect(px - L.m * 0.012, pt, L.m * 0.024, L.h - pt); }

    if (id === 'lanternfen' || id === 'mistwillow') {
      const col = id === 'lanternfen' ? '#1d1426' : '#3e6a4c';
      const rnd = seeded(id === 'lanternfen' ? 4 : 9);
      const clumps = id === 'lanternfen' ? [[L.w * 0.98, 1.1], [L.w * 0.9, 0.8]] : [[L.w * 0.99, 0.8]];
      for (const [cx, sc] of clumps) {
        for (let i = 0; i < 16; i++) {
          const bx = cx + (rnd() - 0.5) * L.m * 0.14, hgt = L.m * (0.16 + rnd() * 0.22) * sc;
          const sway = Math.sin(t * 0.9 + i * 0.7) * hgt * 0.06;
          ctx.strokeStyle = col; ctx.lineWidth = 2 + rnd() * 2.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(bx, L.h + 4); ctx.quadraticCurveTo(bx + sway * 0.3, L.h - hgt * 0.5, bx + sway, L.h - hgt); ctx.stroke();
          if (id === 'lanternfen' && i % 3 === 0) {
            ctx.fillStyle = '#3a2420';
            ctx.beginPath(); ctx.ellipse(bx + sway, L.h - hgt + 10, 3.4, 11, sway * 0.01, 0, TAU); ctx.fill();
          }
        }
      }
    }
  }

  /* Airborne particles over everything. */
  function drawAir(ctx, L, t) {
    const P = cur.parts;
    for (const p of P.list) {
      switch (p.k) {
        case 'mote': glow(ctx, '255,250,225', p.x, p.y, p.r * 4, 0.35 + 0.3 * Math.sin(t * 1.3 + p.ph)); break;
        case 'leaf':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 1.5 + p.ph);
          ctx.fillStyle = 'rgba(150,180,90,0.8)'; ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.6, 0, 0, TAU); ctx.fill();
          ctx.restore(); break;
        case 'fly': {
          const a = Math.pow(Math.max(0, Math.sin(t * p.f + p.ph)), 2);
          if (a > 0.03) {
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, '190,255,120', p.x, p.y, 22, a * 0.45);
            glow(ctx, '230,255,170', p.x, p.y, 8, a * 0.8);
            glow(ctx, '255,255,235', p.x, p.y, 2.6, a);
            ctx.globalCompositeOperation = 'source-over';
          }
          break;
        }
        case 'snow':
          ctx.fillStyle = `rgba(240,248,255,${0.55 + 0.35 * Math.sin(p.ph + t)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); break;
        case 'petal':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 2 + p.ph);
          ctx.fillStyle = 'rgba(255,170,190,0.8)'; ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.8, 0, 0, TAU); ctx.fill();
          ctx.restore(); break;
      }
    }
  }

  /* One still frame for the map previews. */
  function preview(canvas, id, dpr) {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const saved = cur;
    // previews are drawn as if the screen were wide so the scenery reads well in a short strip
    const vw = Math.max(w, h * 1.8), vh = vw / 1.8;
    cur = { id, w: vw, h: vh, scale: 1, gl: false, bg: buildBg(id, vw, vh, 1, false).bg, mask: null, parts: makeParticles(id, layout(vw, vh)), version: 0 };
    const L = layout(vw, vh);
    ctx.save();
    ctx.translate(-(vw - w) / 2, -(L.horizon - h * 0.55));
    ctx.drawImage(cur.bg, 0, 0, vw, vh);
    drawSky(ctx, L, 8);
    drawWater(ctx, L, 8);
    drawSurface(ctx, L, 8);
    drawAir(ctx, L, 8);
    ctx.restore();
    cur = saved;
  }

  return {
    layout, ensure, update, preview, renderDyn, glMeta, lighting, pads, drawSurface,
    drawBack(ctx, L, t) { ctx.drawImage(cur.bg, 0, 0, L.w, L.h); drawSky(ctx, L, t); drawWater(ctx, L, t); drawSurface(ctx, L, t); },
    drawFront, drawAir,
    palette: id => PAL[id],
    get bg() { return cur.bg; }, get mask() { return cur.mask; }, get id() { return cur.id; },
  };
})();
