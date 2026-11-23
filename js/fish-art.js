/* Tidesong — procedural fish illustrations.
   Every species is drawn facing right, centred near (0,0), about 200 units nose to tail.
   Detail grows with rarity: commons are clean and simple, rares gain fin rays and patterning,
   epics gain flowing animated fins, and the legendary/extreme catches get the full treatment. */
'use strict';

const FishArt = (() => {
  const TAU = Math.PI * 2;

  /* ---------- helpers ---------- */
  function seeded(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  function lg(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function rg(ctx, x0, y0, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }

  /* Standard fish body: nose at (n, ny), tail base at x = t with half-height th. */
  function bodyPath(ctx, b) {
    const len = b.n - b.t, ny = b.ny || 0, k = b.k || 0.85, fb = b.fb ?? 0.1, rr = b.rr ?? 0.36;
    ctx.beginPath();
    ctx.moveTo(b.n, ny);
    ctx.bezierCurveTo(b.n - len * fb, ny - b.top * k, b.t + len * rr, -b.top, b.t, -b.th);
    ctx.lineTo(b.t, b.th);
    ctx.bezierCurveTo(b.t + len * rr, b.bot, b.n - len * fb, ny + b.bot * k, b.n, ny);
    ctx.closePath();
  }

  function clipTo(ctx, path, draw) { ctx.save(); path(); ctx.clip(); draw(); ctx.restore(); }

  /* Fill a body and add a soft top-light sheen, belly shade and outline. */
  function shadeBody(ctx, path, box, stops, outline, o = {}) {
    const [x0, y0, x1, y1] = box;
    path();
    ctx.fillStyle = lg(ctx, 0, y0, 0, y1, stops);
    ctx.fill();
    if (o.pattern) clipTo(ctx, path, o.pattern);
    clipTo(ctx, path, () => {
      const cx = x0 + (x1 - x0) * 0.62, cy = y0 + (y1 - y0) * 0.3;
      ctx.fillStyle = rg(ctx, cx, cy, 2, cx, cy, (x1 - x0) * 0.5, [[0, `rgba(255,255,255,${o.sheen ?? 0.2})`], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
      ctx.fillStyle = lg(ctx, 0, y0 + (y1 - y0) * 0.55, 0, y1, [[0, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${o.belly ?? 0.16})`]]);
      ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
      if (o.after) o.after();
    });
    path();
    ctx.lineWidth = o.lw || 1.5;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }

  function bodyShade(ctx, b, stops, outline, o) {
    shadeBody(ctx, () => bodyPath(ctx, b), [b.t, -b.top * 0.78, b.n, b.bot * 0.78], stops, outline, o);
  }

  function tailPath(ctx, shape, L, s) {
    ctx.beginPath();
    switch (shape) {
      case 'fork':
        ctx.moveTo(8, -s * 0.24);
        ctx.bezierCurveTo(-L * 0.3, -s * 0.42, -L * 0.72, -s * 0.78, -L, -s);
        ctx.bezierCurveTo(-L * 0.8, -s * 0.5, -L * 0.6, -s * 0.16, -L * 0.52, 0);
        ctx.bezierCurveTo(-L * 0.6, s * 0.16, -L * 0.8, s * 0.5, -L, s);
        ctx.bezierCurveTo(-L * 0.72, s * 0.78, -L * 0.3, s * 0.42, 8, s * 0.24);
        break;
      case 'notch':
        ctx.moveTo(8, -s * 0.26);
        ctx.bezierCurveTo(-L * 0.35, -s * 0.5, -L * 0.8, -s * 0.85, -L, -s);
        ctx.quadraticCurveTo(-L * 0.86, -s * 0.3, -L * 0.8, 0);
        ctx.quadraticCurveTo(-L * 0.86, s * 0.3, -L, s);
        ctx.bezierCurveTo(-L * 0.8, s * 0.85, -L * 0.35, s * 0.5, 8, s * 0.26);
        break;
      case 'square':
        ctx.moveTo(8, -s * 0.28);
        ctx.bezierCurveTo(-L * 0.4, -s * 0.55, -L * 0.85, -s * 0.9, -L, -s);
        ctx.quadraticCurveTo(-L * 0.92, 0, -L, s);
        ctx.bezierCurveTo(-L * 0.85, s * 0.9, -L * 0.4, s * 0.55, 8, s * 0.28);
        break;
      default: // round
        ctx.moveTo(8, -s * 0.3);
        ctx.bezierCurveTo(-L * 0.35, -s * 1.05, -L * 1.08, -s * 0.85, -L, 0);
        ctx.bezierCurveTo(-L * 1.08, s * 0.85, -L * 0.35, s * 1.05, 8, s * 0.3);
    }
    ctx.closePath();
  }

  function tail(ctx, x, shape, L, s, sway, fill, o = {}) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(sway);
    tailPath(ctx, shape, L, s);
    ctx.fillStyle = fill;
    ctx.fill();
    if (o.rays || o.deco) {
      ctx.save();
      tailPath(ctx, shape, L, s);
      ctx.clip();
      if (o.rays) {
        ctx.strokeStyle = o.rays; ctx.lineWidth = 0.9;
        for (let i = -7; i <= 7; i++) {
          const f = i / 7;
          ctx.beginPath(); ctx.moveTo(4, f * s * 0.2); ctx.lineTo(-L * 1.15, f * s * 1.2); ctx.stroke();
        }
      }
      if (o.deco) o.deco(L, s);
      ctx.restore();
    }
    if (o.edge) { tailPath(ctx, shape, L, s); ctx.strokeStyle = o.edge; ctx.lineWidth = o.ew || 1.2; ctx.stroke(); }
    ctx.restore();
  }

  /* Fin from a path builder. fan: [fx, fy, colour, count] draws radiating rays clipped to the fin. */
  function fin(ctx, build, fill, o = {}) {
    build();
    ctx.fillStyle = fill;
    ctx.fill();
    if (o.fan) {
      const [fx, fy, col, n = 36] = o.fan;
      ctx.save(); build(); ctx.clip();
      ctx.strokeStyle = col; ctx.lineWidth = o.rw || 0.9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * 300, fy + Math.sin(a) * 300); ctx.stroke();
      }
      ctx.restore();
    }
    if (o.edge) { build(); ctx.strokeStyle = o.edge; ctx.lineWidth = o.ew || 1; ctx.stroke(); }
  }

  function eye(ctx, x, y, r, iris = '#e3cf96', o = {}) {
    circle(ctx, x, y, r * 1.15); ctx.fillStyle = o.ring || 'rgba(20,20,20,0.35)'; ctx.fill();
    circle(ctx, x, y, r); ctx.fillStyle = rg(ctx, x - r * 0.3, y - r * 0.3, 0, x, y, r, [[0, '#fffbe8'], [0.45, iris], [1, o.irisEdge || iris]]); ctx.fill();
    circle(ctx, x + r * 0.08, y + r * 0.04, r * (o.pupil || 0.58)); ctx.fillStyle = '#0a0c10'; ctx.fill();
    circle(ctx, x + r * 0.32, y - r * 0.3, r * 0.24); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    circle(ctx, x - r * 0.2, y + r * 0.32, r * 0.1); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  }

  function gill(ctx, x, top, bot, col, bow = 10, lw = 1.8) {
    ctx.beginPath(); ctx.moveTo(x, -top); ctx.quadraticCurveTo(x - bow, 0, x, bot);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }

  function line(ctx, pts, col, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    if (pts.length === 6) ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
    else ctx.lineTo(pts[2], pts[3]);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }

  function spots(ctx, seed, n, x0, x1, y0, y1, r0, r1, col) {
    const rnd = seeded(seed);
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), r = r0 + rnd() * (r1 - r0);
      circle(ctx, x, y, r); ctx.fill();
    }
  }

  function scales(ctx, x0, x1, y0, y1, s, col, lw = 0.8, hi) {
    let row = 0;
    for (let y = y0; y <= y1; y += s * 0.5, row++) {
      for (let x = x1 - (row % 2) * s * 0.5; x >= x0; x -= s) {
        ctx.beginPath(); ctx.arc(x, y, s * 0.52, Math.PI * 0.5, Math.PI * 1.5);
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
        if (hi) { ctx.beginPath(); ctx.arc(x + 1.2, y, s * 0.4, Math.PI * 0.7, Math.PI * 1.3); ctx.strokeStyle = hi; ctx.lineWidth = lw; ctx.stroke(); }
      }
    }
  }

  /* Smooth path through points (quadratic midpoints). */
  function through(ctx, pts, move) {
    if (move) ctx.moveTo(pts[0][0], pts[0][1]); else ctx.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  /* A flowing ribbon fin: a spine from (x,y) at angle ang, rippling with time. */
  function ribbon(ctx, x, y, ang, len, wfn, t, o = {}) {
    const segs = o.segs || 18, freq = o.freq ?? 2.4, k = o.k ?? 3, amp = o.amp ?? 8, ph = o.phase || 0;
    const ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, py = ca;
    const L = [], R = [], C = [];
    for (let i = 0; i <= segs; i++) {
      const s = i / segs;
      const off = Math.sin(t * freq - s * k + ph) * amp * s * s;
      const cx = x + ca * len * s + px * off, cy = y + sa * len * s + py * off;
      const w = wfn(s);
      L.push([cx + px * w, cy + py * w]); R.push([cx - px * w, cy - py * w]); C.push([cx, cy]);
    }
    const build = () => {
      ctx.beginPath();
      through(ctx, L, true);
      const tip = C[segs], w1 = wfn(1);
      ctx.quadraticCurveTo(tip[0] + ca * w1 * 0.9, tip[1] + sa * w1 * 0.9, R[segs][0], R[segs][1]);
      through(ctx, R.slice().reverse(), false);
      ctx.closePath();
    };
    build();
    return { L, R, C, build };
  }

  function ribbonRays(ctx, res, n, col, lw = 0.8) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (let j = 1; j < n; j++) {
      const f = j / n;
      ctx.beginPath();
      for (let i = 0; i < res.C.length; i++) {
        const x = res.R[i][0] + (res.L[i][0] - res.R[i][0]) * f, y = res.R[i][1] + (res.L[i][1] - res.R[i][1]) * f;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function sparkle(ctx, x, y, r, col, a) {
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ================= COMMON ================= */

  function trout(ctx, t) {
    const sw = Math.sin(t * 2.8) * 0.08;
    const b = { n: 100, t: -76, th: 10, top: 40, bot: 37, fb: 0.1, rr: 0.38, ny: 2 };
    const finCol = '#9c9468';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(16, -27); ctx.quadraticCurveTo(10, -48, -12, -47); ctx.quadraticCurveTo(-14, -36, -20, -26); ctx.closePath(); }, finCol, { fan: [0, -18, 'rgba(70,60,40,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-50, -18); ctx.quadraticCurveTo(-56, -30, -65, -15); ctx.closePath(); }, finCol);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-32, 24); ctx.quadraticCurveTo(-40, 42, -58, 38); ctx.quadraticCurveTo(-56, 28, -56, 17); ctx.closePath(); }, finCol, { fan: [-40, 16, 'rgba(70,60,40,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(8, 29); ctx.quadraticCurveTo(2, 45, -14, 43); ctx.quadraticCurveTo(-10, 34, -10, 26); ctx.closePath(); }, '#c6a98a');
    tail(ctx, -74, 'notch', 44, 34, sw, lg(ctx, 0, -34, 0, 34, [[0, '#6f7d4c'], [0.5, '#a89c6c'], [1, '#7a7450']]), {
      rays: 'rgba(60,50,30,0.22)',
      deco: (L, s) => spots(ctx, 31, 16, -L, 0, -s, s, 1.1, 2.1, 'rgba(25,25,20,0.75)'),
    });
    bodyShade(ctx, b, [[0, '#4d6a3b'], [0.3, '#8a9a5c'], [0.5, '#c8ae8e'], [0.58, '#e3aaa5'], [0.72, '#efe1d2'], [1, '#f7f1e6']], 'rgba(40,50,30,0.5)', {
      pattern: () => {
        ctx.fillStyle = lg(ctx, -76, 0, 100, 0, [[0, 'rgba(222,110,130,0)'], [0.15, 'rgba(222,110,130,0.5)'], [0.8, 'rgba(232,120,130,0.5)'], [1, 'rgba(232,120,130,0)']]);
        ctx.beginPath(); ctx.ellipse(10, 4, 92, 7, 0, 0, TAU); ctx.fill();
        spots(ctx, 7, 48, -76, 90, -42, 4, 1.1, 2.4, 'rgba(32,34,24,0.8)');
      },
    });
    gill(ctx, 60, 22, 24, 'rgba(80,60,50,0.45)');
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(50, 12); ctx.quadraticCurveTo(40, 28, 25, 31); ctx.quadraticCurveTo(33, 19, 47, 8); ctx.closePath(); }, 'rgba(226,190,160,0.95)');
    eye(ctx, 80, -5, 6, '#e3c98a');
    line(ctx, [99, 4, 92, 7, 86, 6], 'rgba(60,40,30,0.6)', 1.4);
  }

  function salmon(ctx, t) {
    const sw = Math.sin(t * 2.6) * 0.08;
    const b = { n: 104, t: -80, th: 9, top: 38, bot: 34, fb: 0.15, rr: 0.4, ny: 3 };
    const finCol = '#8aa0b4';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(10, -26); ctx.quadraticCurveTo(4, -46, -16, -44); ctx.quadraticCurveTo(-18, -34, -24, -25); ctx.closePath(); }, finCol, { fan: [-4, -18, 'rgba(40,60,80,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-54, -17); ctx.quadraticCurveTo(-60, -27, -68, -13); ctx.closePath(); }, finCol);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-36, 22); ctx.quadraticCurveTo(-44, 40, -62, 34); ctx.quadraticCurveTo(-60, 24, -60, 14); ctx.closePath(); }, finCol);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(4, 27); ctx.quadraticCurveTo(-2, 42, -16, 40); ctx.quadraticCurveTo(-12, 32, -12, 24); ctx.closePath(); }, '#c9cfd6');
    tail(ctx, -78, 'fork', 50, 36, sw, lg(ctx, 0, -36, 0, 36, [[0, '#3f5a76'], [0.5, '#8ea4b8'], [1, '#4f6884']]), {
      rays: 'rgba(30,40,60,0.25)',
      deco: (L, s) => spots(ctx, 12, 10, -L * 0.8, 0, -s * 0.8, s * 0.5, 0.8, 1.6, 'rgba(20,24,30,0.7)'),
    });
    bodyShade(ctx, b, [[0, '#2c4b69'], [0.3, '#5c82a2'], [0.5, '#c9d6df'], [0.62, '#ecccc5'], [0.8, '#f2eeee'], [1, '#f6f8f9']], 'rgba(30,45,60,0.5)', {
      sheen: 0.26,
      pattern: () => {
        ctx.fillStyle = 'rgba(244,150,140,0.22)';
        ctx.beginPath(); ctx.ellipse(0, 12, 80, 10, 0, 0, TAU); ctx.fill();
        const rnd = seeded(77);
        ctx.strokeStyle = 'rgba(20,28,36,0.7)'; ctx.lineWidth = 1.1;
        for (let i = 0; i < 40; i++) {
          const x = -76 + rnd() * 150, y = -36 + rnd() * 30, r = 1 + rnd() * 1.2;
          ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
        }
        line(ctx, [-78, 0, 10, 4, 92, -2], 'rgba(60,80,100,0.25)', 1);
      },
    });
    gill(ctx, 66, 22, 22, 'rgba(50,60,80,0.45)');
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(56, 10); ctx.quadraticCurveTo(46, 25, 32, 28); ctx.quadraticCurveTo(40, 17, 53, 6); ctx.closePath(); }, 'rgba(200,210,220,0.95)');
    eye(ctx, 86, -6, 5.8, '#d8dfe5');
    line(ctx, [103, 3, 94, 9, 86, 9], 'rgba(40,40,50,0.6)', 1.5);
  }

  function pomfretPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(74, 4);
    ctx.bezierCurveTo(72, -38, 30, -66, -8, -62);
    ctx.bezierCurveTo(-36, -58, -54, -24, -60, -8);
    ctx.lineTo(-60, 8);
    ctx.bezierCurveTo(-54, 24, -36, 58, -8, 62);
    ctx.bezierCurveTo(30, 66, 72, 40, 74, 4);
    ctx.closePath();
  }

  function pomfret(ctx, t) {
    const sw = Math.sin(t * 2.4) * 0.07;
    const finFill = lg(ctx, 0, -90, 0, 90, [[0, '#9aa8b6'], [0.5, '#d8dee4'], [1, '#9aa8b6']]);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(10, -58); ctx.bezierCurveTo(-10, -86, -40, -96, -62, -92); ctx.bezierCurveTo(-46, -78, -40, -56, -44, -38); ctx.closePath(); }, finFill, { fan: [-30, -40, 'rgba(60,70,90,0.22)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(10, 58); ctx.bezierCurveTo(-10, 86, -40, 96, -62, 92); ctx.bezierCurveTo(-46, 78, -40, 56, -44, 38); ctx.closePath(); }, finFill, { fan: [-30, 40, 'rgba(60,70,90,0.22)'] });
    tail(ctx, -57, 'fork', 46, 44, sw, lg(ctx, 0, -44, 0, 44, [[0, '#7d8b9a'], [0.5, '#c4ccd4'], [1, '#7d8b9a']]), { rays: 'rgba(50,60,80,0.2)' });
    shadeBody(ctx, () => pomfretPath(ctx), [-60, -62, 74, 62], [[0, '#7f8e9e'], [0.35, '#c9d2da'], [0.6, '#eef1f4'], [1, '#c2cad3']], 'rgba(60,70,90,0.45)', {
      sheen: 0.4,
      pattern: () => {
        ctx.fillStyle = lg(ctx, -60, -60, 70, 60, [[0, 'rgba(150,170,255,0.18)'], [0.5, 'rgba(255,200,230,0.12)'], [1, 'rgba(150,240,230,0.16)']]);
        ctx.fillRect(-70, -70, 150, 140);
        spots(ctx, 5, 70, -55, 60, -55, 55, 0.6, 1.1, 'rgba(90,100,120,0.25)');
      },
    });
    gill(ctx, 46, 30, 32, 'rgba(70,80,100,0.35)', 8);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(36, 4); ctx.quadraticCurveTo(22, 18, 4, 22); ctx.quadraticCurveTo(18, 6, 34, -2); ctx.closePath(); }, 'rgba(205,213,222,0.9)');
    eye(ctx, 56, -12, 6.4, '#dfe4ea');
    line(ctx, [73, 6, 70, 10, 65, 9], 'rgba(50,50,60,0.55)', 1.4);
  }

  function catfish(ctx, t) {
    const sw = Math.sin(t * 2.2) * 0.07;
    const wv = Math.sin(t * 1.6);
    const b = { n: 100, t: -88, th: 9, top: 32, bot: 28, fb: 0.03, rr: 0.42, ny: 4, k: 0.95 };
    const finCol = '#5d5a4a';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-2, 20); ctx.quadraticCurveTo(-30, 36, -86, 19); ctx.lineTo(-86, 8); ctx.quadraticCurveTo(-40, 18, -2, 14); ctx.closePath(); }, finCol, { fan: [-40, 8, 'rgba(30,30,20,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(32, -22); ctx.quadraticCurveTo(26, -44, 10, -42); ctx.quadraticCurveTo(10, -30, 6, -21); ctx.closePath(); }, finCol);
    tail(ctx, -86, 'round', 34, 22, sw, lg(ctx, 0, -22, 0, 22, [[0, '#4a473b'], [1, '#6d6855']]), { rays: 'rgba(20,20,15,0.25)' });
    bodyShade(ctx, b, [[0, '#33322b'], [0.45, '#6b6754'], [0.7, '#b2aa90'], [1, '#e2dcc8']], 'rgba(30,28,20,0.55)', {
      pattern: () => {
        const rnd = seeded(41);
        for (let i = 0; i < 26; i++) {
          ctx.fillStyle = `rgba(30,28,20,${0.15 + rnd() * 0.15})`;
          ctx.beginPath(); ctx.ellipse(-80 + rnd() * 160, -24 + rnd() * 26, 4 + rnd() * 7, 2 + rnd() * 4, rnd(), 0, TAU); ctx.fill();
        }
      },
    });
    gill(ctx, 66, 22, 20, 'rgba(30,28,20,0.4)', 8);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(60, 14); ctx.quadraticCurveTo(48, 32, 32, 36); ctx.quadraticCurveTo(40, 22, 56, 10); ctx.closePath(); }, '#77715c', { edge: 'rgba(30,28,20,0.5)' });
    // barbels
    const bc = '#8a7d62';
    line(ctx, [96, 4, 126, 8 + wv * 3, 112 + wv * 4, 48], bc, 2.8);
    line(ctx, [97, 0, 130, -14 + wv * 2, 124 - wv * 3, -36], bc, 2.4);
    line(ctx, [90, 13, 96, 22, 94, 30 + wv], bc, 1.8);
    line(ctx, [85, 14, 88, 24, 84, 31 - wv], bc, 1.8);
    eye(ctx, 82, -9, 3.6, '#c9b77a');
    line(ctx, [99, 6, 92, 11, 82, 10], 'rgba(30,24,20,0.7)', 1.8);
  }

  function crucian(ctx, t) {
    const sw = Math.sin(t * 2.5) * 0.07;
    const b = { n: 82, t: -66, th: 12, top: 64, bot: 56, fb: 0.12, rr: 0.4, ny: 4 };
    const finCol = '#b1693a';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(28, -44); ctx.quadraticCurveTo(20, -68, 4, -66); ctx.quadraticCurveTo(-24, -58, -48, -30); ctx.lineTo(-40, -26); ctx.closePath(); }, finCol, { fan: [-6, -40, 'rgba(80,40,20,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-26, 38); ctx.quadraticCurveTo(-34, 56, -50, 52); ctx.quadraticCurveTo(-48, 40, -48, 30); ctx.closePath(); }, finCol);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(14, 44); ctx.quadraticCurveTo(8, 60, -8, 58); ctx.quadraticCurveTo(-4, 48, -4, 40); ctx.closePath(); }, finCol);
    tail(ctx, -64, 'notch', 40, 36, sw, lg(ctx, 0, -36, 0, 36, [[0, '#a45c33'], [0.5, '#cf8a4b'], [1, '#a45c33']]), { rays: 'rgba(80,40,20,0.28)' });
    bodyShade(ctx, b, [[0, '#6b4f20'], [0.35, '#b48a3c'], [0.65, '#e2c27a'], [1, '#f3e3b4']], 'rgba(80,55,20,0.55)', {
      sheen: 0.3,
      pattern: () => scales(ctx, -66, 66, -50, 46, 11, 'rgba(95,62,20,0.38)', 0.9, 'rgba(255,240,190,0.25)'),
    });
    gill(ctx, 50, 34, 34, 'rgba(90,60,20,0.45)', 10);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(42, 22); ctx.quadraticCurveTo(30, 38, 14, 40); ctx.quadraticCurveTo(24, 26, 38, 16); ctx.closePath(); }, 'rgba(210,130,70,0.95)');
    eye(ctx, 62, -10, 6.4, '#e9c46a');
    line(ctx, [81, 6, 77, 10, 72, 9], 'rgba(70,40,20,0.6)', 1.4);
  }

  function tilapia(ctx, t) {
    const sw = Math.sin(t * 2.5) * 0.07;
    const b = { n: 86, t: -70, th: 12, top: 56, bot: 50, fb: 0.1, rr: 0.4, ny: 4 };
    const finCol = '#6f7b80';
    const dorsal = () => {
      ctx.beginPath(); ctx.moveTo(44, -36);
      const pts = [[38, -50], [30, -42], [22, -55], [14, -45], [6, -57], [-2, -47], [-10, -58], [-18, -47], [-26, -56], [-34, -46]];
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.quadraticCurveTo(-56, -58, -66, -26);
      ctx.lineTo(-58, -20); ctx.closePath();
    };
    fin(ctx, dorsal, finCol, { fan: [-10, -26, 'rgba(30,40,45,0.3)'], edge: 'rgba(220,90,80,0.65)', ew: 1.4 });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-30, 36); ctx.quadraticCurveTo(-44, 58, -62, 46); ctx.quadraticCurveTo(-60, 32, -58, 22); ctx.closePath(); }, finCol, { edge: 'rgba(220,90,80,0.6)' });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(14, 40); ctx.quadraticCurveTo(6, 58, -10, 56); ctx.quadraticCurveTo(-6, 46, -6, 36); ctx.closePath(); }, '#7c878b');
    tail(ctx, -68, 'square', 40, 34, sw, lg(ctx, 0, -34, 0, 34, [[0, '#5f6b70'], [0.5, '#899499'], [1, '#5f6b70']]), {
      rays: 'rgba(30,40,45,0.25)', edge: 'rgba(220,90,80,0.7)', ew: 1.6,
      deco: (L, s) => spots(ctx, 21, 18, -L, -2, -s, s, 1, 1.8, 'rgba(240,240,235,0.45)'),
    });
    bodyShade(ctx, b, [[0, '#46535b'], [0.4, '#85949e'], [0.7, '#c9cfcc'], [1, '#eceee6']], 'rgba(40,50,55,0.5)', {
      pattern: () => {
        for (let i = 0; i < 8; i++) {
          const x = 52 - i * 16;
          ctx.fillStyle = 'rgba(40,50,55,0.18)';
          ctx.beginPath(); ctx.ellipse(x, -6, 5, 44, 0.08, 0, TAU); ctx.fill();
        }
        scales(ctx, -70, 70, -44, 40, 10, 'rgba(50,60,65,0.22)', 0.8);
      },
    });
    gill(ctx, 54, 30, 30, 'rgba(40,50,55,0.4)', 10);
    circle(ctx, 54, -6, 3); ctx.fillStyle = 'rgba(30,30,30,0.35)'; ctx.fill();
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(46, 16); ctx.quadraticCurveTo(34, 32, 18, 34); ctx.quadraticCurveTo(28, 20, 42, 10); ctx.closePath(); }, 'rgba(160,170,175,0.95)');
    eye(ctx, 68, -12, 6, '#e0763c');
    ctx.beginPath(); ctx.ellipse(84, 6, 4, 3, 0, 0, TAU); ctx.fillStyle = '#9a8f88'; ctx.fill();
  }

  function carp(ctx, t) {
    const sw = Math.sin(t * 2.3) * 0.07;
    const b = { n: 96, t: -78, th: 13, top: 50, bot: 44, fb: 0.1, rr: 0.38, ny: 4 };
    const finCol = '#9b6d33';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(32, -36); ctx.quadraticCurveTo(26, -58, 8, -56); ctx.lineTo(-46, -40); ctx.quadraticCurveTo(-50, -32, -54, -24); ctx.closePath(); }, finCol, { fan: [-10, -30, 'rgba(70,40,15,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-34, 30); ctx.quadraticCurveTo(-42, 50, -60, 44); ctx.quadraticCurveTo(-58, 32, -58, 22); ctx.closePath(); }, '#c46e3c');
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(10, 36); ctx.quadraticCurveTo(4, 54, -12, 52); ctx.quadraticCurveTo(-8, 42, -8, 32); ctx.closePath(); }, '#c46e3c');
    tail(ctx, -76, 'fork', 48, 38, sw, lg(ctx, 0, -38, 0, 38, [[0, '#8a6430'], [0.5, '#b07a3a'], [1, '#cc5f34']]), { rays: 'rgba(70,40,15,0.28)' });
    bodyShade(ctx, b, [[0, '#5a411f'], [0.35, '#9b7438'], [0.62, '#d6ad62'], [1, '#f1dfb0']], 'rgba(70,45,15,0.55)', {
      sheen: 0.26,
      pattern: () => {
        scales(ctx, -80, 80, -44, 40, 15, 'rgba(70,45,15,0.45)', 1.1, 'rgba(255,240,200,0.28)');
        line(ctx, [-76, 2, 10, 6, 76, -2], 'rgba(70,45,15,0.3)', 1);
      },
    });
    gill(ctx, 62, 30, 28, 'rgba(70,45,15,0.45)', 10);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(54, 18); ctx.quadraticCurveTo(42, 34, 26, 36); ctx.quadraticCurveTo(36, 22, 50, 12); ctx.closePath(); }, 'rgba(205,120,65,0.95)');
    line(ctx, [92, 10, 98, 18, 94, 24], 'rgba(90,60,30,0.85)', 1.5);
    line(ctx, [88, 11, 90, 18, 86, 22], 'rgba(90,60,30,0.85)', 1.3);
    eye(ctx, 78, -10, 5.8, '#e8c36a');
    line(ctx, [95, 6, 90, 11, 84, 10], 'rgba(70,40,20,0.6)', 1.5);
  }

  /* ================= RARE ================= */

  function puffer(ctx, t) {
    const pulse = 1 + Math.sin(t * 2.4) * 0.035;
    const flutter = Math.sin(t * 9);
    ctx.save();
    ctx.scale(pulse, pulse);
    tail(ctx, -60, 'round', 26, 20, Math.sin(t * 4) * 0.15, '#d8ad55', { rays: 'rgba(110,70,20,0.35)', edge: 'rgba(110,70,20,0.4)' });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-24, -50); ctx.quadraticCurveTo(-34, -70 - flutter * 3, -46, -64); ctx.quadraticCurveTo(-42, -54, -38, -46); ctx.closePath(); }, '#d8ad55', { fan: [-30, -48, 'rgba(110,70,20,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-24, 50); ctx.quadraticCurveTo(-34, 70 + flutter * 3, -46, 64); ctx.quadraticCurveTo(-42, 54, -38, 46); ctx.closePath(); }, '#d8ad55', { fan: [-30, 48, 'rgba(110,70,20,0.35)'] });
    // spikes
    const n = 38;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.04;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue; // keep the face clear
      const r0 = 54, r1 = 68 + Math.sin(i * 1.7 + t * 2) * 1.5;
      const ca = Math.cos(a), sa = Math.sin(a), w = 0.06;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - w) * r0 * 1.1, Math.sin(a - w) * r0 * 0.98);
      ctx.lineTo(ca * r1 * 1.08, sa * r1 * 0.96);
      ctx.lineTo(Math.cos(a + w) * r0 * 1.1, Math.sin(a + w) * r0 * 0.98);
      ctx.closePath();
      ctx.fillStyle = sa < 0.2 ? '#9c7233' : '#d9c79a';
      ctx.fill();
    }
    const bodyP = () => { ctx.beginPath(); ctx.ellipse(0, 0, 64, 56, 0, 0, TAU); };
    shadeBody(ctx, bodyP, [-64, -56, 64, 56], [[0, '#c99a45'], [0.35, '#efd27e'], [0.6, '#f8ecc6'], [1, '#fbf6e6']], 'rgba(110,75,25,0.55)', {
      sheen: 0.38,
      pattern: () => {
        ctx.fillStyle = 'rgba(255,252,240,0.9)';
        ctx.beginPath(); ctx.ellipse(4, 30, 62, 30, 0, 0, TAU); ctx.fill();
        const rnd = seeded(9);
        for (let i = 0; i < 30; i++) {
          const a = rnd() * TAU, r = rnd() * 55, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.9 - 12;
          if (y > 8 || (x > 18 && y > -30 && y < -4 && x < 44)) continue;
          ctx.fillStyle = 'rgba(110,70,30,0.55)';
          circle(ctx, x, y, 2.4 + rnd() * 3.2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(140,100,40,0.25)';
        for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; circle(ctx, Math.cos(a) * 46, Math.sin(a) * 40, 1.2); ctx.fill(); }
      },
    });
    ctx.save(); ctx.translate(18, 8); ctx.rotate(0.6 + flutter * 0.25);
    fin(ctx, () => { ctx.beginPath(); ctx.ellipse(-8, 0, 12, 6, 0, 0, TAU); }, 'rgba(232,196,110,0.9)', { fan: [2, 0, 'rgba(120,80,30,0.35)', 20] });
    ctx.restore();
    eye(ctx, 30, -16, 11, '#b7d46a', { irisEdge: '#6f8a2a' });
    ctx.beginPath(); ctx.ellipse(63, 8, 5.5, 4.5, 0, 0, TAU); ctx.fillStyle = '#e6a06c'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(64, 8, 2.6, 2, 0, 0, TAU); ctx.fillStyle = '#5a2a20'; ctx.fill();
    ctx.restore();
  }

  function grouper(ctx, t) {
    const sw = Math.sin(t * 2) * 0.06;
    const b = { n: 100, t: -80, th: 14, top: 52, bot: 50, fb: 0.04, rr: 0.42, ny: 8, k: 0.95 };
    const finFill = '#6d5a43';
    const dorsal = () => {
      ctx.beginPath(); ctx.moveTo(38, -38);
      const pts = [[34, -50], [26, -44], [20, -55], [12, -46], [4, -56], [-4, -46], [-12, -54], [-20, -45], [-26, -50]];
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.quadraticCurveTo(-58, -60, -70, -24); ctx.lineTo(-60, -20); ctx.closePath();
    };
    const spotFin = () => spots(ctx, 61, 30, -80, 40, -70, 70, 1.2, 2.4, 'rgba(240,230,200,0.35)');
    fin(ctx, dorsal, finFill, { fan: [-12, -26, 'rgba(40,30,20,0.35)'] });
    clipTo(ctx, dorsal, spotFin);
    const anal = () => { ctx.beginPath(); ctx.moveTo(-28, 40); ctx.quadraticCurveTo(-40, 64, -64, 50); ctx.quadraticCurveTo(-64, 36, -60, 26); ctx.closePath(); };
    fin(ctx, anal, finFill, { fan: [-46, 30, 'rgba(40,30,20,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(22, 48); ctx.quadraticCurveTo(14, 70, -6, 64); ctx.quadraticCurveTo(0, 52, 2, 42); ctx.closePath(); }, '#5e4c38', { fan: [8, 44, 'rgba(30,20,10,0.35)'] });
    tail(ctx, -78, 'round', 42, 38, sw, lg(ctx, 0, -38, 0, 38, [[0, '#5c4a36'], [0.5, '#7b6548'], [1, '#5c4a36']]), {
      rays: 'rgba(40,30,20,0.3)', edge: 'rgba(240,220,170,0.35)', ew: 1.6,
      deco: (L, s) => spots(ctx, 62, 18, -L, 0, -s, s, 1.4, 2.4, 'rgba(240,230,200,0.35)'),
    });
    bodyShade(ctx, b, [[0, '#45372a'], [0.4, '#7c6649'], [0.75, '#b9a27c'], [1, '#d9c8a5']], 'rgba(40,30,20,0.6)', {
      pattern: () => {
        const rnd = seeded(23);
        for (let gx = -84; gx < 100; gx += 15) {
          for (let gy = -52; gy < 56; gy += 14) {
            const x = gx + ((gy / 14) % 2 ? 7 : 0) + (rnd() - 0.5) * 4, y = gy + (rnd() - 0.5) * 4;
            ctx.fillStyle = `rgba(50,35,22,${0.25 + rnd() * 0.25})`;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.5; const r = 5.5 + rnd() * 1.5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
            ctx.closePath(); ctx.fill();
          }
        }
        spots(ctx, 88, 40, -80, 96, -50, 50, 0.8, 1.6, 'rgba(250,240,215,0.55)');
      },
    });
    // operculum with spines
    ctx.beginPath(); ctx.moveTo(58, -32); ctx.quadraticCurveTo(44, 0, 58, 36); ctx.lineTo(50, 10); ctx.lineTo(46, 18); ctx.lineTo(48, 0);
    ctx.strokeStyle = 'rgba(40,30,20,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(48, 14); ctx.bezierCurveTo(34, 18, 20, 30, 18, 42); ctx.bezierCurveTo(30, 40, 42, 30, 50, 22); ctx.closePath(); }, 'rgba(140,110,75,0.95)', { fan: [50, 18, 'rgba(40,30,20,0.35)'], edge: 'rgba(40,30,20,0.4)' });
    // big lips and protruding lower jaw
    ctx.beginPath(); ctx.moveTo(100, 6); ctx.quadraticCurveTo(106, 16, 98, 22); ctx.quadraticCurveTo(84, 22, 74, 16); ctx.quadraticCurveTo(88, 14, 100, 6); ctx.fillStyle = '#a98c66'; ctx.fill();
    line(ctx, [101, 7, 88, 13, 72, 12], 'rgba(40,25,15,0.85)', 2);
    eye(ctx, 78, -14, 6.4, '#e7c75a', { irisEdge: '#a6801c' });
  }

  function pike(ctx, t) {
    const sw = Math.sin(t * 2.4) * 0.07;
    const b = { n: 122, t: -100, th: 9, top: 30, bot: 29, fb: 0.26, rr: 0.42, ny: 4 };
    const finFill = '#8f8a4c';
    const spotted = (build, seed) => clipTo(ctx, build, () => spots(ctx, seed, 20, -130, 0, -60, 60, 1.2, 2.2, 'rgba(50,40,20,0.5)'));
    const dorsal = () => { ctx.beginPath(); ctx.moveTo(-50, -20); ctx.quadraticCurveTo(-62, -44, -84, -40); ctx.quadraticCurveTo(-86, -26, -88, -13); ctx.closePath(); };
    fin(ctx, dorsal, finFill, { fan: [-70, -14, 'rgba(50,40,20,0.3)'] }); spotted(dorsal, 3);
    const anal = () => { ctx.beginPath(); ctx.moveTo(-54, 20); ctx.quadraticCurveTo(-64, 42, -86, 38); ctx.quadraticCurveTo(-86, 26, -88, 13); ctx.closePath(); };
    fin(ctx, anal, finFill, { fan: [-72, 14, 'rgba(50,40,20,0.3)'] }); spotted(anal, 4);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-6, 26); ctx.quadraticCurveTo(-14, 42, -30, 40); ctx.quadraticCurveTo(-26, 32, -24, 24); ctx.closePath(); }, '#b5a25a');
    tail(ctx, -98, 'fork', 48, 32, sw, lg(ctx, 0, -32, 0, 32, [[0, '#6c7638'], [0.5, '#a39e56'], [1, '#6c7638']]), {
      rays: 'rgba(50,40,20,0.25)',
      deco: (L, s) => spots(ctx, 14, 22, -L, 0, -s, s, 1.2, 2.2, 'rgba(50,40,20,0.5)'),
    });
    bodyShade(ctx, b, [[0, '#2c4622'], [0.35, '#5b7838'], [0.62, '#a8b76a'], [0.8, '#e2e0b0'], [1, '#f2efd6']], 'rgba(30,45,20,0.55)', {
      pattern: () => {
        const rnd = seeded(55);
        for (let r = 0; r < 5; r++) {
          for (let i = 0; i < 16; i++) {
            const x = -96 + i * 12 + (r % 2) * 6 + (rnd() - 0.5) * 4, y = -24 + r * 9 + (rnd() - 0.5) * 3;
            if (x > 86) continue;
            ctx.fillStyle = `rgba(236,232,160,${0.5 + rnd() * 0.3})`;
            ctx.beginPath(); ctx.ellipse(x, y, 4.2 + rnd() * 1.6, 1.8 + rnd() * 0.8, -0.2 + rnd() * 0.4, 0, TAU); ctx.fill();
          }
        }
      },
    });
    gill(ctx, 72, 22, 24, 'rgba(30,45,20,0.45)', 10);
    // duck-bill jaw with tiny teeth
    line(ctx, [121, 4, 104, 9, 82, 9], 'rgba(30,30,20,0.75)', 1.6);
    ctx.fillStyle = 'rgba(255,255,240,0.8)';
    for (let x = 88; x < 118; x += 5) { ctx.beginPath(); ctx.moveTo(x, 6.5 + (x - 88) * -0.06); ctx.lineTo(x + 1.6, 9.5); ctx.lineTo(x - 1.6, 9.5); ctx.closePath(); ctx.fill(); }
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(66, 12); ctx.quadraticCurveTo(56, 26, 42, 28); ctx.quadraticCurveTo(50, 18, 62, 8); ctx.closePath(); }, 'rgba(190,175,100,0.95)');
    eye(ctx, 90, -7, 5.6, '#e6cf5c', { irisEdge: '#9a7e1a' });
  }

  function barracuda(ctx, t) {
    const sw = Math.sin(t * 2.6) * 0.07;
    const b = { n: 118, t: -106, th: 7, top: 28, bot: 26, fb: 0.3, rr: 0.45, ny: 2 };
    const finFill = '#46586a';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(28, -20); ctx.lineTo(22, -38); ctx.lineTo(14, -36); ctx.lineTo(8, -34); ctx.lineTo(4, -19); ctx.closePath(); }, finFill, { fan: [16, -18, 'rgba(20,30,40,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-56, -15); ctx.quadraticCurveTo(-62, -36, -76, -34); ctx.quadraticCurveTo(-76, -22, -78, -11); ctx.closePath(); }, finFill, { fan: [-66, -12, 'rgba(20,30,40,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-56, 15); ctx.quadraticCurveTo(-62, 34, -76, 32); ctx.quadraticCurveTo(-76, 22, -78, 11); ctx.closePath(); }, finFill);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-6, 24); ctx.quadraticCurveTo(-12, 38, -26, 36); ctx.quadraticCurveTo(-22, 28, -20, 22); ctx.closePath(); }, '#9aa9b6');
    tail(ctx, -104, 'fork', 54, 38, sw, lg(ctx, 0, -38, 0, 38, [[0, '#e9eef2'], [0.12, '#3b4b5a'], [0.5, '#526678'], [0.88, '#3b4b5a'], [1, '#e9eef2']]), { rays: 'rgba(15,20,30,0.25)' });
    // protruding lower jaw
    ctx.beginPath(); ctx.moveTo(98, 5); ctx.lineTo(130, 2); ctx.quadraticCurveTo(120, 10, 98, 12); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, 0, 0, 12, [[0, '#b9c6d1'], [1, '#e8eef3']]); ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,50,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    bodyShade(ctx, b, [[0, '#26333f'], [0.3, '#53667a'], [0.55, '#b9c6d1'], [1, '#f1f4f7']], 'rgba(25,35,45,0.55)', {
      sheen: 0.32,
      pattern: () => {
        for (let i = 0; i < 17; i++) {
          const x = 84 - i * 11;
          ctx.strokeStyle = 'rgba(25,35,48,0.32)'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x - 7, -8); ctx.stroke();
        }
        spots(ctx, 17, 9, -100, -30, 4, 18, 2.2, 3.6, 'rgba(15,20,28,0.7)');
        line(ctx, [-104, 0, 0, 2, 100, -2], 'rgba(30,40,50,0.3)', 1);
      },
    });
    // teeth on upper jaw
    ctx.fillStyle = '#ffffff';
    for (let x = 96; x < 118; x += 4.5) { ctx.beginPath(); ctx.moveTo(x - 1.5, 4); ctx.lineTo(x + 1.5, 4); ctx.lineTo(x, 8.5); ctx.closePath(); ctx.fill(); }
    for (let x = 102; x < 126; x += 5) { ctx.beginPath(); ctx.moveTo(x - 1.4, 6); ctx.lineTo(x + 1.4, 6); ctx.lineTo(x, 2); ctx.closePath(); ctx.fill(); }
    gill(ctx, 80, 20, 20, 'rgba(25,35,45,0.45)', 9);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(70, 10); ctx.quadraticCurveTo(60, 22, 46, 24); ctx.quadraticCurveTo(54, 14, 66, 6); ctx.closePath(); }, 'rgba(190,200,210,0.95)');
    eye(ctx, 92, -7, 6.2, '#e8edf2', { irisEdge: '#8798a8' });
  }

  /* ================= EPIC ================= */

  function koi(ctx, t) {
    const b = { n: 96, t: -72, th: 11, top: 46, bot: 40, fb: 0.08, rr: 0.38, ny: 3 };
    const silk = (a) => lg(ctx, -70, 0, -175, 0, [[0, `rgba(255,214,190,${0.9 * a})`], [0.5, `rgba(255,186,150,${0.6 * a})`], [1, `rgba(255,250,245,${0.3 * a})`]]);
    // butterfly tail: two silk lobes
    for (const d of [-1, 1]) {
      const res = ribbon(ctx, -70, d * 4, Math.PI - d * 0.4, 100, s => 5 + 24 * Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.62), t, { freq: 2.2, k: 3.4, amp: 13, phase: d * 0.8 });
      ctx.fillStyle = silk(1); ctx.fill();
      ribbonRays(ctx, res, 8, 'rgba(255,255,255,0.4)');
      res.build(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // long dorsal fin with a rippling edge
    const dPts = [];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14, x = 30 - s * 86, base = -36 + s * 18;
      dPts.push([x - 6, base - (12 + 10 * Math.sin(s * Math.PI)) - Math.sin(t * 3 - s * 6) * 3]);
    }
    const dorsal = () => { ctx.beginPath(); ctx.moveTo(34, -34); through(ctx, dPts, false); ctx.lineTo(-58, -14); ctx.closePath(); };
    fin(ctx, dorsal, 'rgba(255,235,220,0.7)', { fan: [-10, -10, 'rgba(255,255,255,0.45)', 48], edge: 'rgba(255,255,255,0.5)' });
    // pelvic + anal
    const pel = ribbon(ctx, 6, 34, 2.1, 34, s => 3 + 9 * Math.sin(s * Math.PI * 0.8), t, { freq: 3, k: 3, amp: 6, phase: 1 });
    ctx.fillStyle = 'rgba(255,225,205,0.7)'; ctx.fill(); ribbonRays(ctx, pel, 4, 'rgba(255,255,255,0.4)');
    const anal = ribbon(ctx, -40, 22, 2.3, 30, s => 3 + 8 * Math.sin(s * Math.PI * 0.8), t, { freq: 3, k: 3, amp: 5, phase: 2 });
    ctx.fillStyle = 'rgba(255,225,205,0.7)'; ctx.fill(); ribbonRays(ctx, anal, 4, 'rgba(255,255,255,0.4)');
    // body
    bodyShade(ctx, b, [[0, '#fff9f1'], [0.5, '#fbf0e3'], [1, '#efdcc8']], 'rgba(150,90,60,0.35)', {
      sheen: 0.35,
      pattern: () => {
        const red = lg(ctx, -60, -40, 90, 30, [[0, '#d92a17'], [0.5, '#f04f22'], [1, '#ff7a3a']]);
        ctx.fillStyle = red;
        ctx.beginPath(); ctx.moveTo(98, -6); ctx.bezierCurveTo(90, -40, 50, -48, 40, -30); ctx.bezierCurveTo(48, -14, 70, 0, 98, -6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(30, -50); ctx.bezierCurveTo(20, -20, -4, 6, -18, -6); ctx.bezierCurveTo(-28, -18, -30, -46, -10, -52); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-36, -44); ctx.bezierCurveTo(-30, -20, -48, 4, -66, -4); ctx.bezierCurveTo(-74, -14, -66, -40, -36, -44); ctx.fill();
        ctx.beginPath(); ctx.ellipse(8, 18, 12, 6, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(18,16,20,0.88)';
        ctx.beginPath(); ctx.ellipse(-30, -26, 7, 4.5, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(6, -34, 5, 3, -0.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-58, 2, 4, 2.6, 0.2, 0, TAU); ctx.fill();
        scales(ctx, -74, 70, -46, 40, 9, 'rgba(255,255,255,0.32)', 0.8);
        // metallic sweep
        const sx = ((t * 70) % 360) - 180;
        ctx.fillStyle = lg(ctx, sx - 30, -40, sx + 30, 40, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,250,235,0.45)'], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(-90, -60, 200, 120);
      },
    });
    gill(ctx, 70, 26, 26, 'rgba(160,80,60,0.35)', 9);
    // long silken pectoral fin
    const pec = ribbon(ctx, 52, 18, 2.2, 62, s => 4 + 15 * Math.sin(s * Math.PI * 0.75), t, { freq: 2.6, k: 3, amp: 9, phase: 0.4 });
    ctx.fillStyle = 'rgba(255,238,225,0.72)'; ctx.fill();
    ribbonRays(ctx, pec, 7, 'rgba(255,255,255,0.5)');
    pec.build(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    line(ctx, [92, 8, 100, 14, 97, 22 + Math.sin(t * 2) * 2], 'rgba(180,110,80,0.9)', 1.6);
    line(ctx, [88, 9, 92, 16, 88, 21], 'rgba(180,110,80,0.9)', 1.3);
    eye(ctx, 78, -8, 5.4, '#2b2a33', { pupil: 0.7, ring: 'rgba(120,60,40,0.4)' });
    line(ctx, [96, 4, 92, 8, 86, 8], 'rgba(150,70,50,0.6)', 1.4);
  }

  function flyingfish(ctx, t) {
    const flap = Math.sin(t * 2.2);
    const span = 96 + flap * 9;
    const tipX = -34 - flap * 7;
    // whip tail
    const tailRes = ribbon(ctx, -40, 0, Math.PI, 124, s => 4.2 * (1 - s) + 0.7, t, { freq: 3.2, k: 5, amp: 14, segs: 22 });
    ctx.fillStyle = lg(ctx, -42, 0, -170, 0, [[0, '#1b5a86'], [1, '#7fd6ff']]); ctx.fill();
    // stinger
    const sp = tailRes.C[6];
    ctx.beginPath(); ctx.moveTo(sp[0], sp[1] - 2); ctx.lineTo(sp[0] - 22, sp[1] - 7); ctx.lineTo(sp[0] - 4, sp[1] + 1); ctx.closePath();
    ctx.fillStyle = '#e8f6ff'; ctx.fill();
    // wings
    // swept-back manta-style wings: convex leading edge, concave trailing edge
    const wing = () => {
      ctx.beginPath();
      ctx.moveTo(72, 0);
      ctx.bezierCurveTo(70, -30, 34 + flap * 4, -span * 0.9, tipX, -span);
      ctx.bezierCurveTo(tipX + 18, -span * 0.72, -6, -span * 0.3, -44, -12);
      ctx.lineTo(-44, 12);
      ctx.bezierCurveTo(-6, span * 0.3, tipX + 18, span * 0.72, tipX, span);
      ctx.bezierCurveTo(34 + flap * 4, span * 0.9, 70, 30, 72, 0);
      ctx.closePath();
    };
    ctx.save();
    ctx.shadowColor = 'rgba(120,230,255,0.75)'; ctx.shadowBlur = 18;
    wing(); ctx.fillStyle = rg(ctx, 14, 0, 6, 0, 0, 110, [[0, '#4aa8d6'], [0.45, '#1f6a9c'], [0.85, '#123f66'], [1, '#0d2f4f']]); ctx.fill();
    ctx.restore();
    clipTo(ctx, wing, () => {
      // wing ripple bands
      ctx.strokeStyle = 'rgba(160,230,255,0.16)'; ctx.lineWidth = 1.2;
      for (let i = 1; i < 7; i++) {
        const r = i * 15 + Math.sin(t * 2 - i) * 2;
        ctx.beginPath(); ctx.ellipse(16, 0, r * 0.9, r * 1.1, 0, 0, TAU); ctx.stroke();
      }
      // luminous spots, mirrored
      const rnd = seeded(303);
      for (let i = 0; i < 22; i++) {
        const x = -30 + rnd() * 90, y = 10 + rnd() * 70, r = 1.4 + rnd() * 2.6;
        const glow = 0.55 + 0.45 * Math.sin(t * 2.5 + i);
        for (const d of [-1, 1]) {
          ctx.fillStyle = `rgba(140,240,255,${0.18 * glow})`; circle(ctx, x, d * y, r * 3); ctx.fill();
          ctx.fillStyle = `rgba(210,252,255,${0.9 * glow})`; circle(ctx, x, d * y, r); ctx.fill();
        }
      }
      // body ridge
      ctx.fillStyle = rg(ctx, 20, -6, 2, 14, 0, 46, [[0, 'rgba(130,210,245,0.55)'], [1, 'rgba(60,140,190,0)']]);
      ctx.beginPath(); ctx.ellipse(12, 0, 52, 22, 0, 0, TAU); ctx.fill();
      // top light
      ctx.fillStyle = lg(ctx, 0, -span, 0, span, [[0, 'rgba(255,255,255,0.18)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.18)']]);
      ctx.fillRect(-60, -120, 140, 240);
    });
    wing(); ctx.strokeStyle = 'rgba(150,235,255,0.85)'; ctx.lineWidth = 1.6; ctx.stroke();
    // eyes and spiracles
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(42, d * 12, 5.5, 4.5, 0, 0, TAU); ctx.fillStyle = '#0e3a5a'; ctx.fill();
      eye(ctx, 43, d * 12, 3.6, '#9ff3ff', { ring: 'rgba(0,30,50,0.6)' });
      ctx.beginPath(); ctx.ellipse(30, d * 14, 3, 1.8, 0, 0, TAU); ctx.fillStyle = 'rgba(8,30,50,0.7)'; ctx.fill();
    }
  }

  /* ================= LEGENDARY ================= */

  function penguin(ctx, t) {
    const bob = Math.sin(t * 1.6) * 2.4;
    ctx.save();
    ctx.translate(0, bob);
    const wv = k => Math.sin(t * 1.8 + k) * 5;

    // royal cape
    const cape = () => {
      ctx.beginPath();
      ctx.moveTo(4, -66);
      ctx.bezierCurveTo(-52, -60, -88 + wv(0), -10, -106 + wv(1), 74);
      ctx.quadraticCurveTo(-92 + wv(2), 92, -70 + wv(2.6), 100 + wv(3) * 0.4);
      ctx.quadraticCurveTo(-36, 114 + wv(3.4) * 0.6, -6, 104);
      ctx.lineTo(10, 60);
      ctx.lineTo(24, -40);
      ctx.closePath();
    };
    cape();
    ctx.fillStyle = lg(ctx, -110, 0, 10, 0, [[0, '#4d0b2a'], [0.45, '#8e1739'], [0.8, '#b62a50'], [1, '#7a1232']]);
    ctx.fill();
    clipTo(ctx, cape, () => {
      ctx.strokeStyle = 'rgba(255,180,200,0.14)'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-14 - i * 12, -54); ctx.quadraticCurveTo(-36 - i * 12 + wv(i), 20, -48 - i * 10 + wv(i + 1), 112); ctx.stroke(); }
    });
    cape(); ctx.strokeStyle = '#f2c45a'; ctx.lineWidth = 3.2; ctx.stroke();
    cape(); ctx.strokeStyle = 'rgba(120,70,10,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();

    // body
    const bodyP = () => {
      ctx.beginPath();
      ctx.moveTo(30, -112);
      ctx.bezierCurveTo(56, -112, 66, -88, 60, -66);
      ctx.bezierCurveTo(72, -40, 72, 10, 62, 50);
      ctx.bezierCurveTo(54, 88, 28, 108, -4, 108);
      ctx.bezierCurveTo(-40, 108, -58, 80, -58, 40);
      ctx.bezierCurveTo(-58, -10, -36, -56, -8, -78);
      ctx.bezierCurveTo(-2, -100, 10, -112, 30, -112);
      ctx.closePath();
    };
    bodyP();
    ctx.fillStyle = lg(ctx, -58, 0, 62, 0, [[0, '#0b101d'], [0.5, '#1a2340'], [1, '#26314f']]);
    ctx.fill();
    clipTo(ctx, bodyP, () => {
      // iridescent sheen sweeping over the dark feathers
      const sx = Math.sin(t * 0.8) * 30;
      ctx.fillStyle = rg(ctx, -24 + sx, -40, 4, -20 + sx, -30, 90, [[0, 'rgba(120,150,255,0.32)'], [0.5, 'rgba(160,110,255,0.12)'], [1, 'rgba(0,0,0,0)']]);
      ctx.fillRect(-70, -120, 150, 240);
      ctx.strokeStyle = 'rgba(160,180,255,0.07)'; ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(-20, -20 + i * 10, 30, 2.2, 3.6); ctx.stroke(); }
    });
    // white belly
    const belly = () => {
      ctx.beginPath();
      ctx.moveTo(44, -60);
      ctx.bezierCurveTo(66, -36, 68, 12, 58, 52);
      ctx.bezierCurveTo(50, 86, 26, 104, -2, 104);
      ctx.bezierCurveTo(-26, 104, -30, 80, -22, 40);
      ctx.bezierCurveTo(-14, 0, 4, -40, 26, -58);
      ctx.closePath();
    };
    belly();
    ctx.fillStyle = lg(ctx, 0, -60, 0, 104, [[0, '#ffd977'], [0.2, '#fff0c4'], [0.5, '#ffffff'], [1, '#dde3ef']]);
    ctx.fill();
    clipTo(ctx, belly, () => {
      ctx.fillStyle = lg(ctx, -24, 0, 64, 0, [[0, 'rgba(150,165,200,0.35)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(190,200,230,0.25)']]);
      ctx.fillRect(-40, -70, 120, 180);
      ctx.strokeStyle = 'rgba(200,190,170,0.25)'; ctx.lineWidth = 0.8;
      for (let y = -40; y < 100; y += 8) { ctx.beginPath(); ctx.arc(20, y, 7, 0.4, 2.7); ctx.stroke(); }
    });
    bodyP(); ctx.strokeStyle = 'rgba(255,215,120,0.55)'; ctx.lineWidth = 1.4; ctx.stroke();

    // ermine collar
    const rnd = seeded(8);
    for (let i = 0; i < 9; i++) {
      const s = i / 8, x = -18 + s * 40, y = -64 + Math.sin(s * Math.PI) * -8 + s * 2;
      ctx.fillStyle = '#fbfaf6'; circle(ctx, x, y, 7.5); ctx.fill();
      ctx.fillStyle = 'rgba(200,200,210,0.6)'; circle(ctx, x + 1, y + 2, 5); ctx.fill();
      if (i % 2 === 0) { ctx.fillStyle = '#16161c'; ctx.beginPath(); ctx.ellipse(x + (rnd() - 0.5) * 3, y + 1, 1.3, 2.6, 0, 0, TAU); ctx.fill(); }
    }
    // gold ear patch
    ctx.beginPath(); ctx.moveTo(30, -76); ctx.bezierCurveTo(46, -72, 50, -54, 42, -40); ctx.bezierCurveTo(32, -50, 25, -62, 30, -76);
    ctx.fillStyle = rg(ctx, 38, -62, 2, 38, -58, 22, [[0, '#ffe07a'], [0.6, '#ffb52e'], [1, '#f08a1a']]); ctx.fill();

    // flipper
    ctx.save();
    ctx.translate(-34, -16);
    ctx.rotate(0.16 + Math.sin(t * 2.2) * 0.09);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-22, 20, -30, 62, -20, 88); ctx.bezierCurveTo(-8, 72, 4, 36, 12, 6); ctx.closePath();
    ctx.fillStyle = lg(ctx, -26, 0, 12, 0, [[0, '#0b0f1a'], [1, '#26304d']]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,120,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();

    // beak
    ctx.beginPath(); ctx.moveTo(56, -86); ctx.bezierCurveTo(74, -86, 92, -79, 102, -70); ctx.bezierCurveTo(90, -70, 72, -68, 56, -71); ctx.closePath();
    ctx.fillStyle = lg(ctx, 56, -86, 56, -70, [[0, '#2a3044'], [1, '#0e121c']]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(62, -72.5); ctx.bezierCurveTo(76, -72, 88, -71.5, 99, -70.5);
    ctx.strokeStyle = '#ff9c48'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    eye(ctx, 47, -88, 3.6, '#3a2a1a', { ring: 'rgba(0,0,0,0.5)', pupil: 0.75 });

    // feet
    for (const [x, y] of [[-10, 108], [22, 106]]) {
      ctx.beginPath(); ctx.ellipse(x, y, 13, 5, 0, 0, TAU); ctx.fillStyle = '#3c3a44'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 2, y - 1, 9, 3, 0, 0, TAU); ctx.fillStyle = '#56535f'; ctx.fill();
    }

    // crown
    ctx.save();
    ctx.translate(26, -112);
    ctx.rotate(-0.14);
    const crown = () => {
      ctx.beginPath();
      ctx.moveTo(-22, 4);
      ctx.lineTo(-24, -18); ctx.lineTo(-13, -8); ctx.lineTo(-6, -26); ctx.lineTo(0, -9);
      ctx.lineTo(7, -26); ctx.lineTo(13, -8); ctx.lineTo(24, -18); ctx.lineTo(22, 4);
      ctx.closePath();
    };
    crown();
    ctx.fillStyle = lg(ctx, 0, -26, 0, 4, [[0, '#fff3b0'], [0.4, '#f6c843'], [1, '#a8700f']]);
    ctx.fill();
    ctx.strokeStyle = '#7a4d06'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = lg(ctx, 0, -4, 0, 6, [[0, '#ffe58a'], [1, '#b37a12']]);
    ctx.fillRect(-22.5, -3, 45, 7);
    for (const [x, y] of [[-24, -18], [-6, -26], [7, -26], [24, -18]]) { ctx.fillStyle = '#fdfbf2'; circle(ctx, x, y, 2.6); ctx.fill(); }
    const gem = (x, r, c1, c2) => { circle(ctx, x, 0.5, r); ctx.fillStyle = rg(ctx, x - r * 0.3, -r * 0.3, 0, x, 0.5, r, [[0, '#ffffff'], [0.3, c1], [1, c2]]); ctx.fill(); };
    gem(0, 3.4, '#ff4d6d', '#8a0a24');
    gem(-13, 2.6, '#5aa8ff', '#0d3a8a');
    gem(13, 2.6, '#5aa8ff', '#0d3a8a');
    const glint = Math.max(0, Math.sin(t * 1.7)) ** 6;
    sparkle(ctx, -6, -26, 9, '#ffffff', glint);
    ctx.restore();
    ctx.restore();
  }

  /* ================= EXTREME ================= */

  function dragonfish(ctx, t) {
    const b = { n: 128, t: -92, th: 14, top: 46, bot: 42, fb: 0.05, rr: 0.5, ny: -4, k: 0.9 };
    const finFill = (x0, x1) => lg(ctx, x0, 0, x1, 0, [[0, '#a3102b'], [0.5, '#e2402c'], [0.85, '#ff9f3d'], [1, 'rgba(255,220,140,0.85)']]);

    // great tail fan
    const fanPts = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const s = i / N, a = Math.PI - 1.05 + s * 2.1;
      const r = 74 + 10 * Math.sin(s * Math.PI) + 5 * Math.sin(s * Math.PI * 7 + t * 3.4) * Math.sin(s * Math.PI);
      const sway = Math.sin(t * 2.2 - s * 2) * 6;
      fanPts.push([-88 + Math.cos(a) * r, Math.sin(a) * r + sway]);
    }
    const fan = () => { ctx.beginPath(); ctx.moveTo(-86, -14); through(ctx, fanPts, false); ctx.lineTo(-86, 14); ctx.closePath(); };
    fan(); ctx.fillStyle = finFill(-90, -180); ctx.fill();
    clipTo(ctx, fan, () => {
      ctx.strokeStyle = 'rgba(255,215,130,0.55)'; ctx.lineWidth = 1.1;
      for (const p of fanPts) { ctx.beginPath(); ctx.moveTo(-84, 0); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
    });
    fan(); ctx.strokeStyle = 'rgba(255,225,150,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();

    // long dorsal & anal fins swept back into the tail
    const sweptFin = (dir) => {
      const base = [], outer = [];
      for (let i = 0; i <= 16; i++) {
        const s = i / 16;
        const bx = -24 - s * 66, by = dir * (36 - s * 22);
        const h = 6 + 36 * Math.pow(Math.sin(Math.min(1, s * 1.05) * Math.PI * 0.62), 1.2);
        const wvv = Math.sin(t * 3 - s * 6 + (dir > 0 ? 1 : 0)) * 4 * s;
        base.push([bx, by]);
        outer.push([bx - h * 0.45 + wvv * 0.4, by + dir * (h + wvv)]);
      }
      const build = () => { ctx.beginPath(); through(ctx, base, true); through(ctx, outer.slice().reverse(), false); ctx.closePath(); };
      build(); ctx.fillStyle = finFill(-20, -110); ctx.fill();
      clipTo(ctx, build, () => {
        ctx.strokeStyle = 'rgba(255,215,130,0.5)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 16; i += 1) { ctx.beginPath(); ctx.moveTo(base[i][0], base[i][1]); ctx.lineTo(outer[i][0], outer[i][1]); ctx.stroke(); }
      });
      build(); ctx.strokeStyle = 'rgba(255,225,150,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
    };
    sweptFin(-1);
    sweptFin(1);
    // pelvic ribbon
    const pel = ribbon(ctx, 10, 34, 2.0, 48, s => 3 + 10 * Math.sin(s * Math.PI * 0.8), t, { freq: 2.6, k: 3, amp: 8, phase: 1.2 });
    ctx.fillStyle = finFill(10, -30); ctx.fill(); ribbonRays(ctx, pel, 5, 'rgba(255,215,130,0.5)');

    // body + scales
    const bodyP = () => bodyPath(ctx, b);
    bodyP();
    ctx.fillStyle = lg(ctx, 0, -46, 0, 42, [[0, '#6b0d1f'], [0.4, '#b3261f'], [0.75, '#e0782c'], [1, '#f6c35e']]);
    ctx.fill();
    clipTo(ctx, bodyP, () => {
      const sx = ((t * 90) % 420) - 200;
      for (let c = 0; c <= 16; c++) {
        const x = -98 + c * 12.5;
        for (let r = -4; r <= 4; r++) {
          const y = r * 11.5 + (c % 2 ? 5.75 : 0) - 2;
          const shine = Math.exp(-((x - sx) * (x - sx)) / 900);
          const R = 9.6;
          ctx.beginPath(); ctx.arc(x, y, R, 0, TAU);
          ctx.fillStyle = rg(ctx, x - 3, y - 3, 0.5, x, y, R, [
            [0, shine > 0.3 ? '#fffbe6' : '#fff1b8'],
            [0.35, '#f7c94f'],
            [0.72, '#e0662a'],
            [1, '#8f1322'],
          ]);
          ctx.fill();
          ctx.strokeStyle = 'rgba(100,8,20,0.65)'; ctx.lineWidth = 0.9; ctx.stroke();
          if (shine > 0.05) { ctx.fillStyle = `rgba(255,250,225,${shine * 0.55})`; ctx.fill(); }
          ctx.beginPath(); ctx.arc(x - 1.5, y - 1, R * 0.62, Math.PI * 0.75, Math.PI * 1.35);
          ctx.strokeStyle = 'rgba(255,250,220,0.55)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      // head plate
      ctx.beginPath(); ctx.moveTo(84, -60); ctx.quadraticCurveTo(66, -4, 84, 50); ctx.lineTo(140, 50); ctx.lineTo(140, -60); ctx.closePath();
      ctx.fillStyle = lg(ctx, 80, -40, 120, 30, [[0, '#ffe9a6'], [0.4, '#eab14a'], [0.8, '#c4621c'], [1, '#8f2214']]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,245,200,0.4)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(96 + i * 2, -2, 14 + i * 7, 1.9, 4.3); ctx.stroke(); }
      // top light & belly shade
      ctx.fillStyle = lg(ctx, 0, -46, 0, 42, [[0, 'rgba(255,255,255,0.18)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(60,0,10,0.25)']]);
      ctx.fillRect(-100, -60, 240, 120);
    });
    bodyP(); ctx.strokeStyle = 'rgba(255,215,130,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
    // gill cover edge
    ctx.beginPath(); ctx.moveTo(86, -38); ctx.quadraticCurveTo(68, -2, 86, 36);
    ctx.strokeStyle = 'rgba(120,20,10,0.7)'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,190,0.7)'; ctx.lineWidth = 0.9; ctx.stroke();

    // long flowing pectoral fin
    const pec = ribbon(ctx, 70, 20, 2.15, 80, s => 3 + 14 * Math.sin(s * Math.PI * 0.72), t, { freq: 2.4, k: 3.2, amp: 11, phase: 0.3 });
    ctx.fillStyle = finFill(70, -10); ctx.fill();
    ribbonRays(ctx, pec, 7, 'rgba(255,220,140,0.6)');
    pec.build(); ctx.strokeStyle = 'rgba(255,225,150,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();

    // upturned mouth
    ctx.beginPath(); ctx.moveTo(128, -5); ctx.quadraticCurveTo(116, 4, 98, 12);
    ctx.strokeStyle = 'rgba(80,10,10,0.9)'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(129, -3); ctx.quadraticCurveTo(118, 8, 100, 15);
    ctx.strokeStyle = 'rgba(255,230,170,0.6)'; ctx.lineWidth = 1; ctx.stroke();

    // dragon barbels
    for (const [ang, len, ph] of [[-0.42, 62, 0], [-0.18, 54, 1.4]]) {
      const bar = ribbon(ctx, 124, -1, ang, len, s => 1.8 * (1 - s) + 0.35, t, { freq: 2.2, k: 4, amp: 9, phase: ph, segs: 16 });
      ctx.fillStyle = lg(ctx, 124, 0, 124 + len, -20, [[0, '#ffd772'], [1, '#ff9a3c']]); ctx.fill();
    }

    eye(ctx, 108, -16, 8.4, '#ffcc4d', { irisEdge: '#c0231c', ring: 'rgba(120,10,10,0.6)' });
  }

  /* ---------- the newer commons, one or two per water ---------- */

  /* A point on the top (or bottom) edge of a standard body, u = 0 at the nose to 1 at the tail base. */
  function bodyEdge(b, u, bottom) {
    const len = b.n - b.t, ny = b.ny || 0, k = b.k || 0.85, fb = b.fb ?? 0.1, rr = b.rr ?? 0.36;
    const h = bottom ? b.bot : b.top, sg = bottom ? 1 : -1;
    const P = [[b.n, ny], [b.n - len * fb, ny + sg * h * k], [b.t + len * rr, sg * h], [b.t, sg * b.th]];
    const v = 1 - u, w = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
    return [w[0] * P[0][0] + w[1] * P[1][0] + w[2] * P[2][0] + w[3] * P[3][0], w[0] * P[0][1] + w[1] * P[1][1] + w[2] * P[2][1] + w[3] * P[3][1]];
  }

  function spiny(ctx, from, pts, to) {
    ctx.beginPath(); ctx.moveTo(from[0], from[1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    if (to) ctx.lineTo(to[0], to[1]);
  }

  function bluegill(ctx, t) {
    const sw = Math.sin(t * 2.7) * 0.07;
    const b = { n: 80, t: -62, th: 11, top: 58, bot: 52, fb: 0.12, rr: 0.42, ny: 4 };
    const fc = '#56665a';
    const dorsal = () => {
      spiny(ctx, [36, -40], [[32, -54], [26, -47], [20, -58], [14, -50], [8, -61], [2, -52], [-4, -62], [-10, -53]]);
      ctx.quadraticCurveTo(-34, -66, -50, -30); ctx.lineTo(-42, -26); ctx.closePath();
    };
    fin(ctx, dorsal, fc, { fan: [-6, -34, 'rgba(25,35,30,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-18, 38); ctx.quadraticCurveTo(-32, 62, -52, 46); ctx.quadraticCurveTo(-50, 34, -48, 26); ctx.closePath(); }, fc, { fan: [-36, 30, 'rgba(25,35,30,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(16, 44); ctx.quadraticCurveTo(8, 62, -8, 58); ctx.quadraticCurveTo(-4, 48, -4, 40); ctx.closePath(); }, '#9a8a52');
    tail(ctx, -60, 'notch', 38, 34, sw, lg(ctx, 0, -34, 0, 34, [[0, '#46584c'], [0.5, '#748670'], [1, '#46584c']]), { rays: 'rgba(25,35,30,0.25)' });
    bodyShade(ctx, b, [[0, '#2b4548'], [0.32, '#587a66'], [0.56, '#9ea46a'], [0.76, '#e9a447'], [1, '#f6cd78']], 'rgba(30,45,35,0.5)', {
      pattern: () => {
        for (let i = 0; i < 7; i++) { ctx.fillStyle = 'rgba(28,48,50,0.2)'; ctx.beginPath(); ctx.ellipse(48 - i * 15, -10, 5.5, 46, 0.06, 0, TAU); ctx.fill(); }
        scales(ctx, -62, 64, -50, 44, 9, 'rgba(30,50,40,0.2)', 0.8);
        ctx.strokeStyle = 'rgba(100,170,230,0.6)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(78, 6); ctx.quadraticCurveTo(66, 10, 54, 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(76, 13); ctx.quadraticCurveTo(64, 18, 52, 17); ctx.stroke();
      },
    });
    gill(ctx, 48, 34, 34, 'rgba(30,45,35,0.45)', 9);
    ctx.beginPath(); ctx.ellipse(45, -7, 6.5, 9, 0.25, 0, TAU); ctx.fillStyle = '#121820'; ctx.fill();
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(40, 16); ctx.quadraticCurveTo(28, 32, 12, 34); ctx.quadraticCurveTo(22, 20, 36, 10); ctx.closePath(); }, 'rgba(200,180,110,0.9)');
    eye(ctx, 62, -13, 5.6, '#c9a24a');
    line(ctx, [79, 4, 75, 8, 70, 7], 'rgba(40,40,30,0.6)', 1.4);
  }

  function perch(ctx, t) {
    const sw = Math.sin(t * 2.6) * 0.07;
    const b = { n: 96, t: -76, th: 10, top: 42, bot: 38, fb: 0.12, rr: 0.4, ny: 5 };
    const sp = () => { spiny(ctx, [32, -32], [[28, -52], [22, -42], [16, -55], [10, -43], [4, -54], [-2, -42], [-8, -50], [-14, -40]], [-16, -30]); ctx.closePath(); };
    fin(ctx, sp, '#77773e', { fan: [6, -26, 'rgba(40,40,20,0.35)'] });
    clipTo(ctx, sp, () => { circle(ctx, -8, -40, 5); ctx.fillStyle = 'rgba(15,15,10,0.65)'; ctx.fill(); });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-22, -30); ctx.quadraticCurveTo(-32, -52, -52, -44); ctx.quadraticCurveTo(-56, -32, -60, -22); ctx.closePath(); }, '#8a8648', { fan: [-40, -24, 'rgba(40,40,20,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-34, 28); ctx.quadraticCurveTo(-44, 48, -62, 40); ctx.quadraticCurveTo(-60, 28, -60, 20); ctx.closePath(); }, '#e06a2c', { fan: [-48, 22, 'rgba(120,40,10,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(14, 36); ctx.quadraticCurveTo(8, 54, -8, 50); ctx.quadraticCurveTo(-4, 42, -4, 32); ctx.closePath(); }, '#ec7430');
    tail(ctx, -74, 'notch', 42, 32, sw, lg(ctx, 0, -32, 0, 32, [[0, '#6e7440'], [0.6, '#a49248'], [1, '#d06a30']]), { rays: 'rgba(50,45,20,0.28)' });
    bodyShade(ctx, b, [[0, '#3a4a1e'], [0.35, '#7a8836'], [0.6, '#c9b656'], [0.8, '#efe2a2'], [1, '#f7f0d4']], 'rgba(40,50,20,0.5)', {
      pattern: () => {
        for (let i = 0; i < 6; i++) {
          const x = 54 - i * 21;
          ctx.fillStyle = 'rgba(35,45,15,0.4)';
          ctx.beginPath(); ctx.moveTo(x + 6, -44); ctx.quadraticCurveTo(x + 2, -10, x - 4, 14); ctx.quadraticCurveTo(x - 8, -10, x - 6, -44); ctx.closePath(); ctx.fill();
        }
        scales(ctx, -76, 80, -38, 34, 9, 'rgba(50,55,20,0.22)', 0.8, 'rgba(255,245,200,0.18)');
      },
    });
    gill(ctx, 64, 24, 26, 'rgba(40,50,20,0.45)', 10);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(56, 12); ctx.quadraticCurveTo(44, 28, 28, 30); ctx.quadraticCurveTo(38, 18, 52, 8); ctx.closePath(); }, 'rgba(220,170,90,0.92)');
    eye(ctx, 80, -8, 6, '#e6b43a', { irisEdge: '#a77818' });
    line(ctx, [96, 6, 89, 10, 82, 9], 'rgba(50,40,20,0.6)', 1.5);
  }

  function mudskipper(ctx, t) {
    const sw = Math.sin(t * 2.2) * 0.06;
    const sail = 1 + Math.sin(t * 1.4) * 0.08;
    const b = { n: 92, t: -88, th: 8, top: 26, bot: 24, fb: 0.03, rr: 0.42, ny: 2, k: 0.98 };
    const brown = '#6c5a42';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-8, -20); ctx.quadraticCurveTo(-50, -36, -86, -13); ctx.lineTo(-84, -7); ctx.quadraticCurveTo(-46, -24, -8, -14); ctx.closePath(); }, brown, { fan: [-46, -4, 'rgba(30,25,15,0.3)'], edge: 'rgba(120,200,255,0.5)' });
    const sailP = () => { ctx.beginPath(); ctx.moveTo(30, -22); ctx.bezierCurveTo(30, -22 - 40 * sail, 6, -22 - 48 * sail, -4, -40 * sail); ctx.quadraticCurveTo(-6, -28, -6, -18); ctx.closePath(); };
    fin(ctx, sailP, 'rgba(120,96,66,0.92)', { fan: [10, -14, 'rgba(30,25,15,0.35)', 28], edge: 'rgba(110,200,255,0.7)', ew: 1.6 });
    clipTo(ctx, sailP, () => spots(ctx, 44, 14, -6, 30, -70, -24, 1, 1.8, 'rgba(120,210,255,0.8)'));
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-14, 18); ctx.quadraticCurveTo(-50, 32, -84, 12); ctx.lineTo(-84, 6); ctx.quadraticCurveTo(-48, 20, -14, 12); ctx.closePath(); }, brown, { fan: [-48, 6, 'rgba(30,25,15,0.3)'] });
    tail(ctx, -86, 'round', 28, 20, sw, lg(ctx, 0, -20, 0, 20, [[0, '#5a4a36'], [1, '#7a6a50']]), {
      rays: 'rgba(30,25,15,0.3)', deco: (L, s) => spots(ctx, 45, 10, -L, 0, -s, s, 0.8, 1.4, 'rgba(120,210,255,0.7)'),
    });
    bodyShade(ctx, b, [[0, '#4e3f2e'], [0.45, '#86704f'], [0.75, '#bcab8a'], [1, '#e6dcc4']], 'rgba(40,32,20,0.55)', {
      sheen: 0.34,
      pattern: () => {
        const rnd = seeded(66);
        for (let i = 0; i < 22; i++) {
          ctx.fillStyle = `rgba(40,30,18,${0.15 + rnd() * 0.2})`;
          ctx.beginPath(); ctx.ellipse(-84 + rnd() * 160, -20 + rnd() * 24, 3 + rnd() * 6, 2 + rnd() * 3, rnd(), 0, TAU); ctx.fill();
        }
        spots(ctx, 67, 46, -84, 84, -22, 8, 0.7, 1.5, 'rgba(120,210,255,0.85)');
      },
    });
    // the "arm": a muscular pectoral fin it walks on
    ctx.beginPath(); ctx.ellipse(44, 14, 14, 9, 0.5, 0, TAU); ctx.fillStyle = '#7d684c'; ctx.fill();
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(50, 16); ctx.quadraticCurveTo(46, 38, 28, 42); ctx.quadraticCurveTo(24, 32, 36, 16); ctx.closePath(); }, '#8f7a5a', { fan: [40, 18, 'rgba(30,25,15,0.35)', 24], edge: 'rgba(40,32,20,0.5)' });
    gill(ctx, 60, 20, 20, 'rgba(40,32,20,0.4)', 8);
    // eyes perched on top of the head
    ctx.beginPath(); ctx.ellipse(66, -22, 13, 10, 0, 0, TAU); ctx.fillStyle = '#8a7556'; ctx.fill();
    eye(ctx, 58, -30, 5.2, '#cdb27a');
    eye(ctx, 71, -30, 6.4, '#d8c088');
    line(ctx, [92, 6, 84, 11, 74, 10], 'rgba(40,30,20,0.7)', 1.6);
  }

  function lanternfish(ctx, t) {
    const sw = Math.sin(t * 3) * 0.08;
    const b = { n: 90, t: -78, th: 8, top: 30, bot: 30, fb: 0.1, rr: 0.42, ny: 4 };
    const fc = 'rgba(60,80,120,0.85)';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(8, -26); ctx.quadraticCurveTo(2, -46, -18, -43); ctx.quadraticCurveTo(-20, -33, -24, -24); ctx.closePath(); }, fc, { fan: [-6, -20, 'rgba(150,190,255,0.25)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-52, -16); ctx.quadraticCurveTo(-58, -27, -66, -12); ctx.closePath(); }, fc);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-24, 24); ctx.quadraticCurveTo(-36, 42, -56, 34); ctx.quadraticCurveTo(-54, 24, -54, 16); ctx.closePath(); }, fc, { fan: [-40, 18, 'rgba(150,190,255,0.25)'] });
    tail(ctx, -76, 'fork', 44, 32, sw, lg(ctx, 0, -32, 0, 32, [[0, '#1d2a44'], [0.5, '#4b6488'], [1, '#1d2a44']]), { rays: 'rgba(150,190,255,0.2)' });
    bodyShade(ctx, b, [[0, '#0f1628'], [0.38, '#24365a'], [0.6, '#647b9c'], [0.8, '#b8c4d4'], [1, '#d8e0ea']], 'rgba(10,16,30,0.6)', {
      sheen: 0.3,
      pattern: () => scales(ctx, -78, 80, -30, 28, 9, 'rgba(160,190,230,0.18)', 0.8),
    });
    gill(ctx, 64, 22, 24, 'rgba(10,16,30,0.5)', 9);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(56, 8); ctx.quadraticCurveTo(44, 22, 28, 22); ctx.quadraticCurveTo(38, 12, 52, 4); ctx.closePath(); }, 'rgba(110,140,190,0.85)');
    // rows of little lights along the belly and flank
    const lights = [];
    for (let i = 0; i < 13; i++) lights.push([62 - i * 11, 20 - i * 0.6 - Math.sin((i / 12) * Math.PI) * 2]);
    for (let i = 0; i < 10; i++) lights.push([48 - i * 12, 9 - i * 0.5]);
    for (let i = 0; i < 5; i++) lights.push([30 - i * 18, -8 - i]);
    lights.push([88, -2]);
    lights.forEach(([x, y], i) => {
      const f = 0.55 + 0.45 * Math.sin(t * 2.6 + i * 0.9);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rg(ctx, x, y, 0, x, y, 6, [[0, `rgba(150,255,220,${0.45 * f})`], [1, 'rgba(150,255,220,0)']]);
      circle(ctx, x, y, 6); ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(215,255,240,${0.6 + 0.4 * f})`;
      circle(ctx, x, y, i === lights.length - 1 ? 2.4 : 1.6); ctx.fill();
    });
    eye(ctx, 74, -6, 9, '#9fb6d8', { pupil: 0.72, ring: 'rgba(5,10,20,0.6)' });
    line(ctx, [90, 6, 82, 12, 70, 12], 'rgba(10,16,30,0.7)', 1.5);
  }

  function clownfish(ctx, t) {
    const sw = Math.sin(t * 3.2) * 0.09;
    const flick = Math.sin(t * 7) * 3;
    const b = { n: 78, t: -60, th: 13, top: 48, bot: 42, fb: 0.16, rr: 0.42, ny: 5 };
    const org = '#ff7a1a', edge = 'rgba(18,10,6,0.9)', fo = { edge, ew: 2.6 };
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(32, -38); ctx.bezierCurveTo(24, -62, -2, -60, -12, -46); ctx.bezierCurveTo(-24, -62, -50, -54, -54, -26); ctx.lineTo(-46, -22); ctx.closePath(); }, org, fo);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-22, 36); ctx.quadraticCurveTo(-34, 58, -52, 44); ctx.quadraticCurveTo(-50, 32, -48, 24); ctx.closePath(); }, org, fo);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(14, 40); ctx.quadraticCurveTo(10, 60, -6, 56); ctx.quadraticCurveTo(-4, 46, -2, 38); ctx.closePath(); }, org, fo);
    tail(ctx, -58, 'round', 34, 30, sw, lg(ctx, 0, -30, 0, 30, [[0, '#ff8a2a'], [0.5, '#ffa040'], [1, '#ff8a2a']]), { edge, ew: 3 });
    bodyShade(ctx, b, [[0, '#e0520c'], [0.45, '#ff7d1f'], [0.8, '#ff9a40'], [1, '#ffb066']], 'rgba(60,20,5,0.6)', {
      sheen: 0.32,
      pattern: () => {
        const band = build => { build(); ctx.fillStyle = '#fbfbf6'; ctx.fill(); build(); ctx.strokeStyle = edge; ctx.lineWidth = 2.8; ctx.stroke(); };
        band(() => { ctx.beginPath(); ctx.moveTo(54, -60); ctx.bezierCurveTo(42, -20, 42, 20, 54, 60); ctx.lineTo(38, 60); ctx.bezierCurveTo(28, 20, 28, -20, 38, -60); ctx.closePath(); });
        band(() => { ctx.beginPath(); ctx.moveTo(8, -64); ctx.bezierCurveTo(-4, -30, -2, 20, 8, 64); ctx.lineTo(-10, 64); ctx.bezierCurveTo(-20, 20, -22, -30, -12, -64); ctx.closePath(); });
        band(() => { ctx.beginPath(); ctx.moveTo(-42, -44); ctx.quadraticCurveTo(-50, 0, -42, 44); ctx.lineTo(-56, 40); ctx.quadraticCurveTo(-62, 0, -56, -40); ctx.closePath(); });
      },
    });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(30, 12); ctx.quadraticCurveTo(20, 30 + flick, 6, 32 + flick); ctx.quadraticCurveTo(14, 18, 26, 6); ctx.closePath(); }, 'rgba(255,140,50,0.95)', fo);
    eye(ctx, 62, -10, 6.6, '#ff8c2a', { irisEdge: '#b8480a' });
    line(ctx, [78, 6, 74, 10, 68, 9], 'rgba(90,30,10,0.7)', 1.6);
  }

  function snapper(ctx, t) {
    const sw = Math.sin(t * 2.6) * 0.07;
    const b = { n: 98, t: -78, th: 10, top: 46, bot: 40, fb: 0.2, rr: 0.4, ny: 9 };
    const dorsal = () => {
      spiny(ctx, [40, -38], [[34, -54], [26, -46], [20, -58], [12, -48], [4, -59], [-4, -49], [-12, -57], [-20, -47], [-28, -52]]);
      ctx.quadraticCurveTo(-52, -56, -66, -22); ctx.lineTo(-58, -18); ctx.closePath();
    };
    fin(ctx, dorsal, '#d9505a', { fan: [-8, -30, 'rgba(110,20,30,0.3)'], edge: 'rgba(255,210,200,0.4)' });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-30, 32); ctx.quadraticCurveTo(-42, 54, -62, 42); ctx.quadraticCurveTo(-60, 30, -58, 20); ctx.closePath(); }, '#e0606a', { fan: [-44, 26, 'rgba(110,20,30,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(14, 38); ctx.quadraticCurveTo(8, 56, -8, 52); ctx.quadraticCurveTo(-4, 44, -4, 34); ctx.closePath(); }, '#ea7a80');
    tail(ctx, -76, 'fork', 46, 38, sw, lg(ctx, 0, -38, 0, 38, [[0, '#b83040'], [0.5, '#e8707a'], [1, '#b83040']]), { rays: 'rgba(110,20,30,0.28)' });
    bodyShade(ctx, b, [[0, '#a82838'], [0.35, '#e0606a'], [0.62, '#f4a2a0'], [0.82, '#f9dad4'], [1, '#fcf0ec']], 'rgba(100,25,35,0.5)', {
      sheen: 0.3,
      pattern: () => {
        scales(ctx, -78, 84, -44, 38, 10, 'rgba(120,30,40,0.25)', 0.8, 'rgba(255,230,220,0.22)');
        for (const y of [-6, 4, 14]) line(ctx, [-70, y + 4, 0, y - 2, 70, y + 2], 'rgba(255,214,120,0.28)', 1.4);
      },
    });
    gill(ctx, 62, 30, 30, 'rgba(100,25,35,0.45)', 10);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(54, 14); ctx.quadraticCurveTo(40, 32, 22, 34); ctx.quadraticCurveTo(34, 20, 50, 8); ctx.closePath(); }, 'rgba(245,150,150,0.92)');
    eye(ctx, 76, -12, 6.2, '#e8503a', { irisEdge: '#a01e14' });
    line(ctx, [98, 9, 90, 14, 80, 13], 'rgba(100,25,35,0.65)', 1.6);
  }

  function cod(ctx, t) {
    const sw = Math.sin(t * 2.3) * 0.06;
    const b = { n: 102, t: -84, th: 9, top: 36, bot: 34, fb: 0.1, rr: 0.42, ny: 6 };
    const fins = [
      () => { ctx.beginPath(); ctx.moveTo(36, -30); ctx.quadraticCurveTo(30, -52, 14, -50); ctx.quadraticCurveTo(10, -40, 6, -29); ctx.closePath(); },
      () => { ctx.beginPath(); ctx.moveTo(-2, -29); ctx.quadraticCurveTo(-12, -48, -32, -44); ctx.quadraticCurveTo(-34, -33, -36, -25); ctx.closePath(); },
      () => { ctx.beginPath(); ctx.moveTo(-42, -23); ctx.quadraticCurveTo(-52, -40, -68, -33); ctx.quadraticCurveTo(-68, -23, -70, -15); ctx.closePath(); },
      () => { ctx.beginPath(); ctx.moveTo(-6, 30); ctx.quadraticCurveTo(-16, 46, -34, 42); ctx.quadraticCurveTo(-34, 33, -36, 25); ctx.closePath(); },
      () => { ctx.beginPath(); ctx.moveTo(-42, 23); ctx.quadraticCurveTo(-52, 38, -68, 31); ctx.quadraticCurveTo(-68, 22, -70, 14); ctx.closePath(); },
    ];
    fins.forEach((f, i) => {
      fin(ctx, f, '#7b7856');
      clipTo(ctx, f, () => spots(ctx, 90 + i, 16, -100, 60, -60, 60, 0.9, 1.8, 'rgba(60,50,30,0.45)'));
    });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(38, 30); ctx.quadraticCurveTo(32, 46, 20, 44); ctx.quadraticCurveTo(22, 37, 24, 29); ctx.closePath(); }, '#c8c09a');
    tail(ctx, -82, 'square', 36, 30, sw, lg(ctx, 0, -30, 0, 30, [[0, '#605c40'], [0.5, '#8a8660'], [1, '#605c40']]), {
      rays: 'rgba(40,35,20,0.25)', deco: (L, s) => spots(ctx, 95, 14, -L, 0, -s, s, 0.9, 1.6, 'rgba(60,50,30,0.5)'),
    });
    bodyShade(ctx, b, [[0, '#4c5638'], [0.4, '#8a8860'], [0.65, '#c8c29a'], [0.85, '#ece6cc'], [1, '#f6f2e6']], 'rgba(45,45,25,0.5)', {
      pattern: () => {
        spots(ctx, 71, 110, -84, 96, -36, 14, 1, 2.6, 'rgba(70,62,34,0.42)');
        ctx.strokeStyle = 'rgba(250,246,226,0.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-82, 1); ctx.bezierCurveTo(-30, 2, 10, -16, 50, -12); ctx.quadraticCurveTo(76, -10, 90, -6); ctx.stroke();
      },
    });
    gill(ctx, 70, 24, 26, 'rgba(45,45,25,0.45)', 10);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(62, 10); ctx.quadraticCurveTo(50, 26, 34, 28); ctx.quadraticCurveTo(44, 16, 58, 6); ctx.closePath(); }, 'rgba(160,150,110,0.92)');
    line(ctx, [92, 16, 96, 24, 92, 31 + Math.sin(t * 1.5)], '#c8bf96', 1.8);
    eye(ctx, 84, -10, 5.8, '#d8c890');
    line(ctx, [102, 8, 94, 14, 82, 13], 'rgba(45,40,25,0.65)', 1.7);
  }

  function arcticChar(ctx, t) {
    const sw = Math.sin(t * 2.7) * 0.08;
    const b = { n: 100, t: -78, th: 10, top: 38, bot: 38, fb: 0.12, rr: 0.38, ny: 3 };
    const fc = '#3c5858';
    const white = pts => line(ctx, pts, 'rgba(255,255,255,0.95)', 2.4);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(14, -30); ctx.quadraticCurveTo(8, -50, -14, -48); ctx.quadraticCurveTo(-16, -38, -22, -28); ctx.closePath(); }, fc, { fan: [-2, -22, 'rgba(20,35,35,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-50, -19); ctx.quadraticCurveTo(-56, -30, -65, -16); ctx.closePath(); }, fc);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-32, 28); ctx.quadraticCurveTo(-40, 46, -58, 42); ctx.quadraticCurveTo(-56, 32, -56, 21); ctx.closePath(); }, '#d84a38', { fan: [-44, 24, 'rgba(100,20,10,0.3)'] });
    white([-32, 29, -36, 38, -44, 44]);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(8, 33); ctx.quadraticCurveTo(2, 50, -14, 48); ctx.quadraticCurveTo(-10, 38, -10, 30); ctx.closePath(); }, '#e2503a');
    white([8, 34, 4, 44, -4, 48]);
    tail(ctx, -76, 'notch', 44, 34, sw, lg(ctx, 0, -34, 0, 34, [[0, '#2f4a4c'], [0.5, '#4d6a6a'], [1, '#8a4a3a']]), { rays: 'rgba(20,35,35,0.25)' });
    bodyShade(ctx, b, [[0, '#1d363c'], [0.3, '#3c6062'], [0.5, '#8a9a8a'], [0.6, '#eb8a6c'], [0.8, '#de4a36'], [1, '#ee8456']], 'rgba(25,40,40,0.5)', {
      sheen: 0.26,
      pattern: () => {
        spots(ctx, 19, 46, -76, 90, -36, 6, 1.6, 3.2, 'rgba(255,228,222,0.72)');
        spots(ctx, 20, 14, -70, 80, -20, 10, 1.4, 2.4, 'rgba(255,140,140,0.7)');
      },
    });
    gill(ctx, 64, 24, 26, 'rgba(25,40,40,0.45)');
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(54, 12); ctx.quadraticCurveTo(44, 28, 28, 31); ctx.quadraticCurveTo(36, 19, 50, 8); ctx.closePath(); }, 'rgba(232,96,64,0.95)');
    white([54, 12, 44, 26, 30, 31]);
    eye(ctx, 82, -6, 5.8, '#d9cfa0');
    line(ctx, [100, 4, 92, 8, 86, 7], 'rgba(30,40,40,0.6)', 1.4);
  }

  function goldfish(ctx, t) {
    const b = { n: 72, t: -46, th: 12, top: 58, bot: 46, fb: 0.22, rr: 0.48, ny: 10 };
    // the double tail: two silk lobes
    for (const d of [-1, 1]) {
      const res = ribbon(ctx, -44, d * 4, Math.PI - d * 0.38, 82, s => 4 + 22 * Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.6), t, { freq: 2, k: 3, amp: 9, phase: d });
      ctx.fillStyle = lg(ctx, -46, 0, -140, 0, [[0, 'rgba(255,140,40,0.92)'], [0.6, 'rgba(255,170,70,0.7)'], [1, 'rgba(255,235,190,0.45)']]); ctx.fill();
      ribbonRays(ctx, res, 7, 'rgba(255,240,210,0.4)');
    }
    const dorsal = () => { ctx.beginPath(); ctx.moveTo(22, -50); ctx.quadraticCurveTo(10, -88 - Math.sin(t * 2) * 3, -18, -84); ctx.quadraticCurveTo(-30, -66, -38, -38); ctx.closePath(); };
    fin(ctx, dorsal, 'rgba(255,140,40,0.85)', { fan: [-6, -40, 'rgba(255,230,190,0.35)'] });
    ribbon(ctx, -26, 34, 2.5, 34, s => 3 + 9 * Math.sin(s * Math.PI * 0.8), t, { freq: 2.6, k: 3, amp: 5, phase: 1.4 });
    ctx.fillStyle = 'rgba(255,150,60,0.8)'; ctx.fill();
    ribbon(ctx, 16, 42, 2.0, 30, s => 3 + 7 * Math.sin(s * Math.PI * 0.8), t, { freq: 3, k: 3, amp: 5, phase: 0.6 });
    ctx.fillStyle = 'rgba(255,160,70,0.8)'; ctx.fill();
    bodyShade(ctx, b, [[0, '#d24a18'], [0.4, '#f57c22'], [0.72, '#ffb048'], [1, '#ffdc96']], 'rgba(130,50,10,0.45)', {
      sheen: 0.42,
      pattern: () => scales(ctx, -48, 64, -54, 44, 10, 'rgba(160,60,10,0.3)', 0.9, 'rgba(255,240,170,0.4)'),
    });
    gill(ctx, 48, 32, 30, 'rgba(150,60,10,0.4)', 9);
    ribbon(ctx, 40, 16, 2.2, 30, s => 3 + 8 * Math.sin(s * Math.PI * 0.75), t, { freq: 3.4, k: 3, amp: 6 });
    ctx.fillStyle = 'rgba(255,190,110,0.85)'; ctx.fill();
    eye(ctx, 56, -4, 7.2, '#26222a', { pupil: 0.75, ring: 'rgba(130,50,10,0.45)' });
    line(ctx, [72, 10, 70, 14, 65, 13], 'rgba(130,50,10,0.6)', 1.4);
  }

  /* ---------- the newer rares ---------- */

  function bass(ctx, t) {
    const sw = Math.sin(t * 2.4) * 0.07;
    const b = { n: 104, t: -80, th: 11, top: 44, bot: 40, fb: 0.12, rr: 0.4, ny: 8 };
    const sp = () => { spiny(ctx, [34, -36], [[30, -54], [24, -46], [18, -58], [12, -48], [6, -56], [0, -46], [-6, -48]], [-10, -34]); ctx.closePath(); };
    fin(ctx, sp, '#5a6c3a', { fan: [12, -30, 'rgba(30,40,20,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-14, -34); ctx.quadraticCurveTo(-24, -58, -50, -50); ctx.quadraticCurveTo(-58, -38, -62, -24); ctx.closePath(); }, '#61743e', { fan: [-36, -28, 'rgba(30,40,20,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-34, 30); ctx.quadraticCurveTo(-46, 52, -64, 42); ctx.quadraticCurveTo(-62, 30, -60, 22); ctx.closePath(); }, '#6e7a48', { fan: [-48, 24, 'rgba(30,40,20,0.35)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(16, 38); ctx.quadraticCurveTo(10, 56, -6, 52); ctx.quadraticCurveTo(-2, 44, -2, 34); ctx.closePath(); }, '#8a8a5a', { fan: [8, 36, 'rgba(30,40,20,0.3)'] });
    tail(ctx, -78, 'notch', 46, 38, sw, lg(ctx, 0, -38, 0, 38, [[0, '#4a5a30'], [0.5, '#76884a'], [1, '#4a5a30']]), { rays: 'rgba(30,40,20,0.3)', edge: 'rgba(230,230,180,0.3)' });
    bodyShade(ctx, b, [[0, '#283e1e'], [0.33, '#5a7834'], [0.56, '#a4b46a'], [0.78, '#e0e2b4'], [1, '#f4f2de']], 'rgba(30,45,20,0.55)', {
      sheen: 0.28,
      pattern: () => {
        // the dark, broken stripe along the flank
        const rnd = seeded(808);
        for (let x = -76; x < 84; x += 9) {
          ctx.fillStyle = `rgba(28,42,18,${0.4 + rnd() * 0.25})`;
          ctx.beginPath(); ctx.ellipse(x + rnd() * 4, -2 + (rnd() - 0.5) * 6 - (x > 40 ? (x - 40) * 0.12 : 0), 6 + rnd() * 4, 4 + rnd() * 4, rnd(), 0, TAU); ctx.fill();
        }
        scales(ctx, -80, 90, -40, 36, 10, 'rgba(30,45,20,0.25)', 0.8, 'rgba(255,255,220,0.2)');
      },
    });
    // the big mouth: its jaw reaches back past the eye
    ctx.beginPath(); ctx.moveTo(106, 8); ctx.quadraticCurveTo(96, 26, 62, 20); ctx.quadraticCurveTo(84, 16, 106, 8); ctx.fillStyle = '#e8e4c2'; ctx.fill();
    line(ctx, [107, 7, 88, 16, 62, 17], 'rgba(30,30,15,0.85)', 2.4);
    gill(ctx, 58, 30, 30, 'rgba(30,45,20,0.5)', 11);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(52, 10); ctx.quadraticCurveTo(40, 28, 22, 30); ctx.quadraticCurveTo(32, 16, 48, 4); ctx.closePath(); }, 'rgba(180,180,120,0.92)', { fan: [50, 6, 'rgba(30,40,20,0.3)', 24] });
    eye(ctx, 80, -12, 6.4, '#d6a030', { irisEdge: '#8a5a10' });
  }

  function eel(ctx, t) {
    const prof = s => (s < 0.12 ? 12 + s * 10 : 13.2 * Math.pow(1 - (s - 0.12) / 0.88, 0.55) + 1.2);
    const opts = { freq: 2.6, k: 5.2, amp: 11, segs: 30 };
    // one continuous fin along the back and belly, running into the tail
    const finW = s => prof(s) + (s > 0.32 ? Math.min(8, (s - 0.32) * 26) * (s > 0.94 ? (1 - s) / 0.06 : 1) : 0);
    const finR = ribbon(ctx, 100, 0, Math.PI, 222, finW, t, opts);
    ctx.fillStyle = 'rgba(88,104,64,0.8)'; ctx.fill();
    ribbonRays(ctx, finR, 3, 'rgba(30,40,20,0.25)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    finR.build(); ctx.strokeStyle = `rgba(150,255,190,${0.25 + 0.15 * Math.sin(t * 2)})`; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
    const res = ribbon(ctx, 100, 0, Math.PI, 222, prof, t, opts);
    ctx.fillStyle = lg(ctx, 0, -16, 0, 16, [[0, '#262f1c'], [0.45, '#55643a'], [0.75, '#b0a35e'], [1, '#d8cb90']]); ctx.fill();
    ctx.save(); res.build(); ctx.clip();
    spots(ctx, 512, 50, -130, 100, -14, 6, 1.2, 3, 'rgba(25,32,18,0.4)');
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); through(ctx, res.C.map(([x, y]) => [x, y - 6]), true); through(ctx, res.C.slice().reverse().map(([x, y]) => [x, y - 2]), false); ctx.closePath(); ctx.fill();
    ctx.restore();
    res.build(); ctx.strokeStyle = 'rgba(20,26,14,0.55)'; ctx.lineWidth = 1.3; ctx.stroke();
    // head
    ctx.beginPath(); ctx.ellipse(94, 1, 20, 12.5, 0, 0, TAU);
    ctx.fillStyle = lg(ctx, 0, -12, 0, 13, [[0, '#2a331e'], [0.5, '#5a693c'], [1, '#d0c088']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(94, 1, 20, 12.5, 0, -Math.PI * 0.5, Math.PI * 0.5); ctx.strokeStyle = 'rgba(20,26,14,0.55)'; ctx.lineWidth = 1.3; ctx.stroke();
    gill(ctx, 80, 9, 10, 'rgba(20,26,14,0.4)', 4, 1.2);
    fin(ctx, () => { ctx.beginPath(); ctx.ellipse(72, 6, 8, 5, 0.6 + Math.sin(t * 5) * 0.2, 0, TAU); }, 'rgba(120,130,80,0.9)', { edge: 'rgba(30,40,20,0.5)' });
    eye(ctx, 102, -3, 3.6, '#d8d070');
    line(ctx, [114, 3, 106, 7, 96, 6], 'rgba(20,26,14,0.7)', 1.5);
  }

  function lionfish(ctx, t) {
    const sw = Math.sin(t * 2) * 0.06;
    const spread = Math.sin(t * 1.3) * 0.06;
    const b = { n: 74, t: -56, th: 10, top: 40, bot: 36, fb: 0.12, rr: 0.42, ny: 6 };
    const maroon = '#7e1818';
    const spine = (x0, y0, x1, y1, w) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#fff2ea'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = maroon; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    };
    // the great fan fins, far side first
    const fan = (ox, oy, a0, a1, n, len, alpha, dark) => {
      const tips = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n) + spread * (i / n);
        const l = len * (0.8 + 0.2 * Math.sin((i / n) * Math.PI));
        tips.push([ox + Math.cos(a) * l, oy + Math.sin(a) * l]);
      }
      const build = () => {
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tips[0][0], tips[0][1]);
        for (let i = 1; i <= n; i++) {
          const p = tips[i], q = tips[i - 1];
          ctx.quadraticCurveTo(ox + ((p[0] + q[0]) / 2 - ox) * 0.78, oy + ((p[1] + q[1]) / 2 - oy) * 0.78, p[0], p[1]);
        }
        ctx.closePath();
      };
      build(); ctx.fillStyle = `rgba(244,218,204,${alpha})`; ctx.fill();
      ctx.save(); build(); ctx.clip();
      ctx.lineWidth = 5;
      for (let r = 22; r < len; r += 19) { ctx.strokeStyle = dark ? 'rgba(110,20,20,0.26)' : 'rgba(140,26,26,0.34)'; ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.stroke(); }
      ctx.restore();
      for (const p of tips) spine(ox, oy, p[0], p[1], dark ? 1.4 : 1.8);
    };
    fan(32, 6, 2.0, 3.5, 9, 86, 0.3, true);
    // dorsal spines with their membranes
    const dors = [];
    for (let i = 0; i < 12; i++) {
      const bx = 36 - i * 6.6, by = -34 - Math.max(0, 4 - Math.abs(i - 4)) * 1.2, h = 74 - Math.abs(i - 3) * 4.5 + Math.sin(t * 1.6 + i) * 2;
      const lean = -0.22 - i * 0.035;
      dors.push([bx, by, bx + Math.sin(lean) * h, by - Math.cos(lean) * h]);
    }
    ctx.beginPath(); ctx.moveTo(dors[0][0], dors[0][1]);
    for (const d of dors) ctx.lineTo(d[0] + (d[2] - d[0]) * 0.45, d[1] + (d[3] - d[1]) * 0.45);
    ctx.lineTo(dors[11][0], dors[11][1]); ctx.closePath();
    ctx.fillStyle = 'rgba(255,228,218,0.45)'; ctx.fill();
    for (const d of dors) spine(d[0], d[1], d[2], d[3], 2);
    // soft rear fins and tail, clear with spots
    const clear = 'rgba(244,224,214,0.5)';
    const sd = () => { ctx.beginPath(); ctx.moveTo(-30, -34); ctx.quadraticCurveTo(-42, -58, -56, -30); ctx.closePath(); };
    fin(ctx, sd, clear, { fan: [-42, -30, 'rgba(120,30,30,0.3)', 20] }); clipTo(ctx, sd, () => spots(ctx, 7, 8, -60, -28, -60, -30, 1.2, 2, 'rgba(110,20,20,0.6)'));
    const an = () => { ctx.beginPath(); ctx.moveTo(-26, 32); ctx.quadraticCurveTo(-40, 58, -56, 32); ctx.closePath(); };
    fin(ctx, an, clear, { fan: [-40, 30, 'rgba(120,30,30,0.3)', 20] }); clipTo(ctx, an, () => spots(ctx, 8, 8, -60, -24, 30, 56, 1.2, 2, 'rgba(110,20,20,0.6)'));
    tail(ctx, -54, 'round', 34, 30, sw, clear, { rays: 'rgba(120,30,30,0.3)', deco: (L, s) => spots(ctx, 9, 22, -L, 0, -s, s, 1.2, 2.2, 'rgba(110,20,20,0.6)') });
    bodyShade(ctx, b, [[0, '#7a1c1c'], [0.45, '#b8442e'], [0.8, '#eac2ac'], [1, '#f6e2d2']], 'rgba(70,14,14,0.55)', {
      sheen: 0.3,
      pattern: () => {
        for (let i = 0; i < 15; i++) {
          const x = 66 - i * 9;
          ctx.fillStyle = i % 2 ? 'rgba(255,238,228,0.75)' : 'rgba(110,18,18,0.7)';
          ctx.beginPath(); ctx.ellipse(x, -2, 2.8, 48, 0.16 - i * 0.01, 0, TAU); ctx.fill();
        }
      },
    });
    gill(ctx, 46, 28, 28, 'rgba(70,14,14,0.4)', 8);
    // the near fan, over the body
    fan(26, 14, 1.7, 3.65, 12, 104, 0.4, false);
    fan(12, 30, 1.55, 2.25, 4, 40, 0.5, false);
    // little tentacles above the eye
    for (const [x, h, a] of [[58, 12, -0.3], [64, 9, 0.2]]) {
      ctx.save(); ctx.translate(x, -24); ctx.rotate(a + Math.sin(t * 2 + x) * 0.1);
      ctx.beginPath(); ctx.ellipse(0, -h / 2, 2.6, h / 2, 0, 0, TAU); ctx.fillStyle = '#fff0e6'; ctx.fill();
      ctx.strokeStyle = maroon; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    eye(ctx, 60, -12, 5.6, '#c82a1a', { irisEdge: '#6a0e08' });
    line(ctx, [74, 8, 70, 11, 64, 10], 'rgba(70,14,14,0.6)', 1.4);
  }

  function sturgeon(ctx, t) {
    const sw = Math.sin(t * 1.8) * 0.06;
    const b = { n: 122, t: -94, th: 7, top: 30, bot: 26, fb: 0.34, rr: 0.42, ny: 6 };
    // heterocercal tail: the spine runs into a long upper lobe
    ctx.save(); ctx.translate(-92, 0); ctx.rotate(sw);
    const tl = () => { ctx.beginPath(); ctx.moveTo(4, -7); ctx.bezierCurveTo(-18, -14, -48, -40, -72, -58); ctx.bezierCurveTo(-52, -32, -38, -8, -30, 4); ctx.bezierCurveTo(-34, 14, -40, 24, -46, 32); ctx.bezierCurveTo(-28, 24, -12, 14, 4, 8); ctx.closePath(); };
    fin(ctx, tl, lg(ctx, 0, -58, 0, 32, [[0, '#3e3c38'], [0.6, '#6e6a5e'], [1, '#8a8474']]), { fan: [0, 0, 'rgba(30,28,24,0.25)', 40], edge: 'rgba(30,28,24,0.5)' });
    ctx.restore();
    const fc = '#5e5a50';
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-58, -21); ctx.quadraticCurveTo(-68, -42, -84, -34); ctx.quadraticCurveTo(-84, -24, -86, -14); ctx.closePath(); }, fc, { fan: [-72, -16, 'rgba(30,28,24,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-60, 19); ctx.quadraticCurveTo(-70, 36, -84, 30); ctx.quadraticCurveTo(-84, 22, -86, 13); ctx.closePath(); }, fc, { fan: [-72, 14, 'rgba(30,28,24,0.3)'] });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-22, 24); ctx.quadraticCurveTo(-30, 38, -44, 34); ctx.quadraticCurveTo(-42, 28, -42, 20); ctx.closePath(); }, fc);
    bodyShade(ctx, b, [[0, '#33332f'], [0.4, '#6a675d'], [0.7, '#b0a892'], [1, '#e4dac2']], 'rgba(30,28,24,0.6)', {
      pattern: () => spots(ctx, 31, 60, -90, 110, -26, 10, 0.6, 1.4, 'rgba(30,28,24,0.3)'),
    });
    // rows of bony scutes
    const scute = (x, y, w, h) => {
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.closePath();
      ctx.fillStyle = lg(ctx, x, y - h, x, y + h, [[0, '#f2ead6'], [1, '#a59c84']]); ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,28,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    };
    for (let u = 0.2; u < 0.97; u += 0.062) { const [x, y] = bodyEdge(b, u, false); scute(x, y + 3, 5, 4.2); }
    for (let u = 0.24; u < 0.97; u += 0.058) { const p = bodyEdge(b, u, false), q = bodyEdge(b, u, true); scute(p[0], p[1] + (q[1] - p[1]) * 0.44, 3.8, 3.2); }
    for (let u = 0.3; u < 0.9; u += 0.07) { const [x, y] = bodyEdge(b, u, true); scute(x, y - 3.5, 3.4, 2.8); }
    gill(ctx, 80, 18, 18, 'rgba(30,28,24,0.45)', 8);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(72, 10); ctx.quadraticCurveTo(58, 30, 38, 34); ctx.quadraticCurveTo(50, 20, 66, 6); ctx.closePath(); }, 'rgba(120,114,100,0.95)', { fan: [70, 8, 'rgba(30,28,24,0.3)', 24] });
    // barbels and the mouth underneath the snout
    for (const [x, ph] of [[98, 0], [103, 1], [108, 2], [112, 3]]) line(ctx, [x, 11, x - 1, 16, x - 2 + Math.sin(t * 2 + ph), 21], '#cbbf9c', 1.4);
    ctx.beginPath(); ctx.ellipse(94, 14, 5, 2.4, 0, 0, TAU); ctx.fillStyle = 'rgba(60,40,30,0.7)'; ctx.fill();
    eye(ctx, 98, -4, 3.4, '#d0c8a0');
  }

  function snakehead(ctx, t) {
    const sw = Math.sin(t * 2.2) * 0.07;
    const b = { n: 104, t: -86, th: 12, top: 32, bot: 30, fb: 0.07, rr: 0.44, ny: 4, k: 0.96 };
    const fc = '#36422f';
    const dors = () => { ctx.beginPath(); ctx.moveTo(52, -27); ctx.quadraticCurveTo(-4, -50, -86, -30); ctx.lineTo(-86, -14); ctx.quadraticCurveTo(-20, -30, 46, -22); ctx.closePath(); };
    fin(ctx, dors, fc, { fan: [-20, 0, 'rgba(15,20,12,0.3)', 60] });
    clipTo(ctx, dors, () => spots(ctx, 77, 30, -90, 50, -50, -14, 1.2, 2.6, 'rgba(230,200,120,0.4)'));
    const anal = () => { ctx.beginPath(); ctx.moveTo(16, 26); ctx.quadraticCurveTo(-30, 44, -86, 28); ctx.lineTo(-86, 14); ctx.quadraticCurveTo(-30, 26, 14, 20); ctx.closePath(); };
    fin(ctx, anal, fc, { fan: [-30, 0, 'rgba(15,20,12,0.3)', 60] });
    tail(ctx, -84, 'round', 34, 26, sw, lg(ctx, 0, -26, 0, 26, [[0, '#2e3828'], [0.5, '#4c5a3c'], [1, '#2e3828']]), {
      rays: 'rgba(15,20,12,0.3)', deco: (L, s) => spots(ctx, 78, 12, -L, 0, -s, s, 1, 2, 'rgba(230,200,120,0.35)'),
    });
    bodyShade(ctx, b, [[0, '#1e2a1a'], [0.4, '#4a5a36'], [0.7, '#94945e'], [1, '#d2cca6']], 'rgba(15,20,12,0.6)', {
      pattern: () => {
        for (let i = 0; i < 9; i++) {
          const x = 76 - i * 19;
          ctx.fillStyle = 'rgba(12,16,10,0.5)';
          ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x - 10, -8); ctx.lineTo(x, 14); ctx.lineTo(x - 7, 14); ctx.lineTo(x - 17, -8); ctx.lineTo(x - 7, -30); ctx.closePath(); ctx.fill();
        }
        scales(ctx, -86, 90, -30, 28, 10, 'rgba(15,20,12,0.25)', 0.8, 'rgba(230,230,180,0.18)');
      },
    });
    // an eyespot at the tail
    circle(ctx, -74, -4, 7); ctx.fillStyle = '#0e120c'; ctx.fill(); ctx.strokeStyle = '#f08a2a'; ctx.lineWidth = 2.4; ctx.stroke();
    // plated, snake-like head
    ctx.strokeStyle = 'rgba(15,20,12,0.4)'; ctx.lineWidth = 1;
    for (const [x0, y0, x1, y1] of [[96, -10, 84, -20], [86, -6, 72, -22], [74, -4, 62, -24]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 4, (y0 + y1) / 2, x1, y1); ctx.stroke(); }
    gill(ctx, 62, 26, 26, 'rgba(15,20,12,0.5)', 10);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(56, 8); ctx.quadraticCurveTo(44, 28, 28, 30); ctx.quadraticCurveTo(34, 16, 52, 4); ctx.closePath(); }, 'rgba(110,110,70,0.92)', { fan: [54, 6, 'rgba(15,20,12,0.3)', 24] });
    eye(ctx, 86, -10, 5.2, '#e0a030', { irisEdge: '#9a5a10' });
    line(ctx, [104, 6, 90, 13, 72, 11], 'rgba(15,20,12,0.8)', 2);
  }

  /* ---------- the newer epics ---------- */

  function angelfish(ctx, t) {
    const sw = Math.sin(t * 1.6);
    const disc = () => { ctx.beginPath(); ctx.moveTo(60, 2); ctx.bezierCurveTo(56, -22, 30, -42, 2, -44); ctx.bezierCurveTo(-26, -42, -44, -18, -48, -6); ctx.lineTo(-48, 6); ctx.bezierCurveTo(-44, 18, -26, 42, 2, 44); ctx.bezierCurveTo(30, 42, 56, 22, 60, 2); ctx.closePath(); };
    const bands = () => {
      ctx.fillStyle = 'rgba(16,18,24,0.88)';
      for (const [x, w] of [[38, 7], [2, 9], [-34, 7]]) {
        ctx.beginPath(); ctx.moveTo(x + w, -170); ctx.bezierCurveTo(x + w - 6, -40, x + w + 4, 40, x + w - 4, 170);
        ctx.lineTo(x - w - 4, 170); ctx.bezierCurveTo(x - w + 4, 40, x - w - 6, -40, x - w, -170); ctx.closePath(); ctx.fill();
      }
    };
    const silver = (y0, y1) => lg(ctx, 0, y0, 0, y1, [[0, 'rgba(214,222,230,0.82)'], [0.5, 'rgba(240,244,248,0.6)'], [1, 'rgba(214,222,230,0.82)']]);
    // tall sweeping dorsal and anal fins, trailing filaments from their tips
    const dTip = [-64 + sw * 9, -142], aTip = [-60 - sw * 9, 134];
    const dorsal = () => { ctx.beginPath(); ctx.moveTo(30, -36); ctx.bezierCurveTo(18, -84, -22 + sw * 4, -120, dTip[0], dTip[1]); ctx.bezierCurveTo(-84 + sw * 6, -116, -92, -60, -48, -12); ctx.closePath(); };
    const anal = () => { ctx.beginPath(); ctx.moveTo(30, 36); ctx.bezierCurveTo(18, 80, -20 - sw * 4, 112, aTip[0], aTip[1]); ctx.bezierCurveTo(-82 - sw * 6, 108, -90, 56, -48, 12); ctx.closePath(); };
    for (const [tip, ang] of [[dTip, -2.55], [aTip, 2.55]]) {
      ribbon(ctx, tip[0], tip[1], ang, 34, s => 1.4 * (1 - s) + 0.3, t, { freq: 2, k: 3, amp: 7, phase: ang });
      ctx.fillStyle = 'rgba(226,232,240,0.8)'; ctx.fill();
    }
    for (const f of [dorsal, anal]) {
      fin(ctx, f, silver(-140, 140), { fan: [-10, 0, 'rgba(255,255,255,0.3)', 60] });
      clipTo(ctx, f, bands);
      f(); ctx.strokeStyle = 'rgba(20,22,28,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // fan tail with streamers
    for (const d of [-1, 1]) {
      ribbon(ctx, -84, d * 28, Math.PI + d * 0.32, 48, s => 1.4 * (1 - s) + 0.3, t, { freq: 2.4, k: 3, amp: 6, phase: d });
      ctx.fillStyle = 'rgba(226,232,240,0.75)'; ctx.fill();
    }
    tail(ctx, -46, 'square', 42, 30, Math.sin(t * 2.4) * 0.06, silver(-30, 30), { rays: 'rgba(255,255,255,0.35)', edge: 'rgba(20,22,28,0.45)' });
    shadeBody(ctx, disc, [-48, -44, 60, 44], [[0, '#b8c2cc'], [0.45, '#f2f5f8'], [1, '#c4ccd6']], 'rgba(30,34,44,0.5)', {
      sheen: 0.45,
      pattern: () => {
        bands();
        const sx = Math.sin(t * 0.7) * 40;
        ctx.fillStyle = lg(ctx, -50 + sx, -40, 60 + sx, 40, [[0, 'rgba(160,200,255,0)'], [0.4, 'rgba(170,210,255,0.3)'], [0.6, 'rgba(255,190,230,0.26)'], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(-60, -50, 130, 100);
        scales(ctx, -48, 56, -40, 40, 8, 'rgba(120,130,150,0.2)', 0.7);
      },
    });
    // long pelvic filaments
    for (const [ph, len] of [[0, 118], [0.7, 104]]) {
      ribbon(ctx, 18, 38, 1.78, len, s => 2.4 * (1 - s) + 0.4, t, { freq: 1.8, k: 3, amp: 10, phase: ph, segs: 20 });
      ctx.fillStyle = lg(ctx, 18, 38, 18, 38 + len, [[0, 'rgba(240,244,250,0.92)'], [1, 'rgba(255,180,200,0.6)']]); ctx.fill();
    }
    gill(ctx, 30, 22, 22, 'rgba(30,34,44,0.35)', 7);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(26, 8); ctx.quadraticCurveTo(14, 20 + Math.sin(t * 5) * 2, 0, 20); ctx.quadraticCurveTo(10, 10, 22, 2); ctx.closePath(); }, 'rgba(235,240,246,0.7)', { fan: [24, 4, 'rgba(255,255,255,0.4)', 20] });
    eye(ctx, 44, -10, 5.4, '#c83a2a', { irisEdge: '#7a1a10' });
    line(ctx, [60, 2, 56, 6, 52, 5], 'rgba(30,34,44,0.6)', 1.3);
  }

  function betta(ctx, t) {
    const b = { n: 70, t: -38, th: 13, top: 24, bot: 22, fb: 0.16, rr: 0.4, ny: 2 };
    // halfmoon tail: a rippling fan of silk
    const cx = -36, n = 40, edge = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - 1.35 + (i / n) * 2.7;
      const r = 96 + Math.sin(a * 7 + t * 3.2) * 6 + Math.sin(a * 13 - t * 2.1) * 3;
      edge.push([cx + Math.cos(a) * r, Math.sin(a) * r * 0.95 + Math.sin(t * 2 - (i / n) * 2) * 5]);
    }
    const caudal = () => { ctx.beginPath(); ctx.moveTo(cx + 4, -12); through(ctx, edge, false); ctx.lineTo(cx + 4, 12); ctx.closePath(); };
    caudal();
    ctx.fillStyle = rg(ctx, cx, 0, 4, cx, 0, 104, [[0, 'rgba(40,70,210,0.95)'], [0.55, 'rgba(110,50,200,0.86)'], [0.85, 'rgba(220,40,90,0.8)'], [1, 'rgba(255,90,130,0.6)']]);
    ctx.fill();
    ctx.save(); caudal(); ctx.clip();
    ctx.strokeStyle = 'rgba(200,220,255,0.28)'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i += 2) { ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(edge[i][0], edge[i][1]); ctx.stroke(); }
    ctx.restore();
    // dorsal and anal veils
    const veil = (x0, y0, x1, y1, len, lift, amp, ph) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const s = i / 14;
        pts.push([x0 - s * len, y0 + Math.sign(lift) * (Math.abs(lift) * (0.3 + 0.7 * s)) + Math.sin(t * 3 - s * 5 + ph) * amp * s]);
      }
      const build = () => { ctx.beginPath(); ctx.moveTo(x0, y0); through(ctx, pts, false); ctx.lineTo(x1, y1); ctx.closePath(); };
      build();
      ctx.fillStyle = lg(ctx, 0, y0, 0, y0 + lift, [[0, 'rgba(40,70,210,0.92)'], [0.6, 'rgba(120,50,200,0.82)'], [1, 'rgba(230,40,90,0.72)']]);
      ctx.fill();
      ctx.save(); build(); ctx.clip();
      ctx.strokeStyle = 'rgba(200,220,255,0.3)'; ctx.lineWidth = 0.9;
      for (let i = 0; i <= 14; i += 2) { const s = i / 14; ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
      ctx.restore();
    };
    veil(28, -20, -40, -10, 74, -66, 4, 0);
    veil(24, 18, -40, 10, 72, 84, 5, 1.2);
    for (const ph of [0, 0.8]) {
      ribbon(ctx, 28, 20, 1.95, 54, s => 3 * (1 - s) + 0.6, t, { freq: 2.6, k: 3, amp: 6, phase: ph });
      ctx.fillStyle = 'rgba(230,40,80,0.85)'; ctx.fill();
    }
    bodyShade(ctx, b, [[0, '#16247a'], [0.45, '#3048c8'], [0.8, '#5a3aa8'], [1, '#8a2a8a']], 'rgba(10,14,50,0.55)', {
      sheen: 0.45,
      pattern: () => {
        scales(ctx, -40, 64, -24, 22, 7, 'rgba(140,210,255,0.45)', 0.8, 'rgba(200,240,255,0.35)');
        const sx = ((t * 50) % 200) - 100;
        ctx.fillStyle = lg(ctx, sx - 20, -20, sx + 20, 20, [[0, 'rgba(160,230,255,0)'], [0.5, 'rgba(170,235,255,0.4)'], [1, 'rgba(160,230,255,0)']]);
        ctx.fillRect(-60, -40, 140, 80);
      },
    });
    gill(ctx, 46, 16, 16, 'rgba(10,14,50,0.45)', 6);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(40, 4); ctx.quadraticCurveTo(30, 14 + Math.sin(t * 8) * 3, 20, 14); ctx.quadraticCurveTo(28, 6, 38, 0); ctx.closePath(); }, 'rgba(200,220,255,0.55)');
    eye(ctx, 56, -6, 5.2, '#16161c', { pupil: 0.72, ring: 'rgba(200,170,60,0.5)' });
    line(ctx, [70, 1, 66, -2, 62, 0], 'rgba(10,14,50,0.6)', 1.3);
  }

  function seahorse(ctx, t) {
    const sway = Math.sin(t * 1.2), curl = 1 + Math.sin(t * 0.9) * 0.08;
    // centre line of the body: [x, y, half width]
    const P = [[14, -90, 11], [6, -76, 10], [-2, -60, 10], [0, -44, 14], [8, -26, 19], [12, -8, 21], [10, 10, 19], [2, 26, 15], [-8, 40, 11], [-13, 54, 8.5], [-13, 68, 7], [-8, 79, 5.5]];
    for (let i = 1; i <= 9; i++) { const a = Math.PI - i * 0.62 * curl, r = 14 - i * 1.25; P.push([6 + Math.cos(a) * r, 82 + Math.sin(a) * r, Math.max(1.4, 5.2 - i * 0.42)]); }
    for (const p of P) p[0] += sway * 3 * ((p[1] + 96) / 190);
    const Lp = [], Rp = [];
    P.forEach((p, i) => {
      const q = P[Math.min(P.length - 1, i + 1)], o = P[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      Lp.push([p[0] + nx * p[2], p[1] + ny * p[2]]); Rp.push([p[0] - nx * p[2], p[1] - ny * p[2]]);
    });
    const body = () => { ctx.beginPath(); through(ctx, Lp, true); through(ctx, Rp.slice().reverse(), false); ctx.closePath(); };
    // snout
    const hx = P[0][0], hy = P[0][1];
    ctx.beginPath(); ctx.moveTo(hx + 6, hy - 6); ctx.quadraticCurveTo(hx + 28, hy - 2, hx + 44, hy + 2); ctx.lineTo(hx + 48, hy - 1); ctx.lineTo(hx + 48, hy + 9); ctx.lineTo(hx + 43, hy + 7); ctx.quadraticCurveTo(hx + 26, hy + 9, hx + 6, hy + 8); ctx.closePath();
    ctx.fillStyle = lg(ctx, 0, hy - 6, 0, hy + 9, [[0, '#f4a02c'], [1, '#ffd890']]); ctx.fill();
    ctx.strokeStyle = 'rgba(120,60,10,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    shadeBody(ctx, body, [-30, -96, 40, 96], [[0, '#c8601a'], [0.5, '#f39a2a'], [1, '#c8601a']], 'rgba(110,50,10,0.55)', {
      sheen: 0.35,
      pattern: () => {
        ctx.fillStyle = lg(ctx, -24, 0, 36, 0, [[0, 'rgba(120,40,0,0.35)'], [0.6, 'rgba(255,220,140,0)'], [1, 'rgba(255,236,170,0.55)']]);
        ctx.fillRect(-60, -110, 130, 220);
        spots(ctx, 404, 40, -26, 34, -90, 80, 0.8, 1.8, 'rgba(255,250,230,0.75)');
      },
    });
    // a translucent dorsal fin on the back, fluttering fast
    const base = [], outer = [];
    for (let i = 4; i <= 8; i++) {
      const [x, y] = Lp[i], dx = x - P[i][0], dy = y - P[i][1], l = Math.hypot(dx, dy) || 1;
      const f = (i === 4 || i === 8 ? 5 : 15) + Math.sin(t * 14 + i * 1.3) * 2.5;
      base.push([x, y]); outer.push([x + (dx / l) * f, y + (dy / l) * f]);
    }
    const dfin = () => { ctx.beginPath(); ctx.moveTo(base[0][0], base[0][1]); through(ctx, outer, false); ctx.lineTo(base[4][0], base[4][1]); ctx.closePath(); };
    dfin(); ctx.fillStyle = 'rgba(255,214,140,0.6)'; ctx.fill();
    ctx.strokeStyle = 'rgba(200,110,30,0.45)'; ctx.lineWidth = 0.9;
    for (let j = 0; j <= 12; j++) {
      const k = (j / 12) * 4, i0 = Math.min(3, Math.floor(k)), f = k - i0, lerp2 = (A, B) => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
      const a = lerp2(base[i0], base[i0 + 1]), o = lerp2(outer[i0], outer[i0 + 1]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(o[0], o[1]); ctx.stroke();
    }
    dfin(); ctx.strokeStyle = 'rgba(255,240,200,0.65)'; ctx.lineWidth = 1; ctx.stroke();
    // the head, its crown and the bony rings down the body
    ctx.beginPath(); ctx.ellipse(hx + 2, hy, 14, 12, -0.35, 0, TAU);
    ctx.fillStyle = rg(ctx, hx - 2, hy - 4, 1, hx, hy, 15, [[0, '#ffd27a'], [1, '#e8862a']]); ctx.fill();
    ctx.strokeStyle = 'rgba(110,50,10,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#f7b44a';
    for (const [dx, h] of [[-8, 9], [-3, 12], [2, 10], [6, 7]]) { ctx.beginPath(); ctx.moveTo(hx + dx - 2.6, hy - 9); ctx.lineTo(hx + dx, hy - 9 - h); ctx.lineTo(hx + dx + 2.6, hy - 9); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(120,56,10,0.38)'; ctx.lineWidth = 1.3;
    for (let i = 2; i < P.length - 4; i++) { ctx.beginPath(); ctx.moveTo(Lp[i][0], Lp[i][1]); ctx.quadraticCurveTo(P[i][0] + 2, P[i][1] + 2, Rp[i][0], Rp[i][1]); ctx.stroke(); }
    ctx.fillStyle = '#ffcf78';
    for (let i = 2; i < P.length - 5; i++) { const [x, y] = Lp[i], [px, py] = P[i]; const dx = x - px, dy = y - py, l = Math.hypot(dx, dy) || 1; circle(ctx, x + (dx / l) * 1.4, y + (dy / l) * 1.4, 1.5); ctx.fill(); }
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(hx - 10, hy + 16); ctx.quadraticCurveTo(hx - 20, hy + 22 + Math.sin(t * 16) * 2, hx - 18, hy + 30); ctx.quadraticCurveTo(hx - 10, hy + 26, hx - 6, hy + 18); ctx.closePath(); }, 'rgba(255,230,180,0.65)');
    eye(ctx, hx + 6, hy - 2, 4.6, '#e8b040', { irisEdge: '#8a5010' });
  }

  function oarfish(ctx, t) {
    const prof = s => (s < 0.06 ? 9 + s * 30 : 10.8 * Math.pow(1 - (s - 0.06) / 0.94, 0.7) + 1);
    const opts = { freq: 1.6, k: 6, amp: 12, segs: 40 };
    // crimson crest plumes streaming back from the head
    for (const [a, len, ph] of [[-2.25, 76, 0], [-2.45, 66, 0.8], [-2.65, 58, 1.6], [-2.05, 52, 2.4]]) {
      ribbon(ctx, 104, -8, a, len, s => 2.4 * (1 - s) + 0.5, t, { freq: 2.4, k: 3.5, amp: 9, phase: ph, segs: 16 });
      ctx.fillStyle = 'rgba(232,44,64,0.9)'; ctx.fill();
    }
    const res = ribbon(ctx, 112, 0, Math.PI, 290, prof, t, opts);
    // the dorsal fin runs the full length, rippling
    const N = res.L.length - 1, top = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, h = s < 0.03 ? 0 : (9 + Math.sin(t * 4 - i * 0.7) * 2.4) * (1 - s * 0.55);
      top.push([res.L[i][0], res.L[i][1] - h]);
    }
    ctx.beginPath(); through(ctx, res.L, true); through(ctx, top.slice().reverse(), false); ctx.closePath();
    ctx.fillStyle = 'rgba(226,40,62,0.86)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,170,0.45)'; ctx.lineWidth = 0.8;
    for (let i = 2; i <= N; i += 1) { ctx.beginPath(); ctx.moveTo(res.L[i][0], res.L[i][1]); ctx.lineTo(top[i][0], top[i][1]); ctx.stroke(); }
    res.build();
    ctx.fillStyle = lg(ctx, 0, -12, 0, 12, [[0, '#7a8494'], [0.35, '#d2d8e0'], [0.65, '#f6f8fa'], [1, '#bcc4ce']]); ctx.fill();
    ctx.save(); res.build(); ctx.clip();
    const rnd = seeded(707);
    ctx.strokeStyle = 'rgba(40,48,62,0.45)'; ctx.lineWidth = 1.2;
    for (let i = 3; i < N - 2; i += 2) {
      const [x, y] = res.C[i], o = (rnd() - 0.5) * 8;
      ctx.beginPath(); ctx.moveTo(x + 3, y + o - 3); ctx.quadraticCurveTo(x, y + o, x - 4, y + o + 2); ctx.stroke();
    }
    spots(ctx, 708, 70, -180, 110, -10, 10, 0.6, 1.3, 'rgba(40,48,62,0.5)');
    const sx = ((t * 80) % 420) - 210;
    ctx.fillStyle = lg(ctx, sx - 40, 0, sx + 40, 0, [[0, 'rgba(200,230,255,0)'], [0.5, 'rgba(210,240,255,0.5)'], [1, 'rgba(200,230,255,0)']]);
    ctx.fillRect(-190, -20, 320, 40);
    ctx.restore();
    res.build(); ctx.strokeStyle = 'rgba(50,58,72,0.5)'; ctx.lineWidth = 1.1; ctx.stroke();
    // head
    ctx.beginPath(); ctx.ellipse(110, 0, 15, 11, 0, 0, TAU);
    ctx.fillStyle = lg(ctx, 0, -11, 0, 11, [[0, '#8a94a4'], [0.5, '#e6eaf0'], [1, '#c0c8d2']]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(110, 0, 15, 11, 0, -Math.PI * 0.5, Math.PI * 0.5); ctx.strokeStyle = 'rgba(50,58,72,0.5)'; ctx.stroke();
    // long pelvic oars
    for (const [a, ph] of [[2.35, 0], [2.55, 1.1]]) {
      ribbon(ctx, 98, 9, a, 80, s => 1.1 + (s > 0.72 ? 4.2 * Math.sin(((s - 0.72) / 0.28) * Math.PI) : 0), t, { freq: 2, k: 3, amp: 7, phase: ph, segs: 18 });
      ctx.fillStyle = 'rgba(232,50,70,0.9)'; ctx.fill();
    }
    gill(ctx, 100, 9, 9, 'rgba(50,58,72,0.45)', 4, 1.2);
    eye(ctx, 114, -2, 5, '#c8d0e0', { irisEdge: '#7a8498' });
    line(ctx, [125, 3, 120, 6, 114, 6], 'rgba(50,58,72,0.6)', 1.3);
  }

  function swordfish(ctx, t) {
    const sw = Math.sin(t * 2.2) * 0.06;
    const b = { n: 70, t: -92, th: 6, top: 34, bot: 30, fb: 0.22, rr: 0.46, ny: 2 };
    // the sword
    ctx.beginPath(); ctx.moveTo(58, -9); ctx.quadraticCurveTo(120, -6, 176, -1); ctx.quadraticCurveTo(120, 3, 58, 5); ctx.closePath();
    ctx.fillStyle = lg(ctx, 58, 0, 176, 0, [[0, '#2a2c4a'], [0.5, '#5a5e80'], [1, '#a0a6be']]); ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,40,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    line(ctx, [62, -6, 120, -4, 170, -1], 'rgba(255,255,255,0.4)', 1);
    // tall sickle dorsal
    const dors = () => { ctx.beginPath(); ctx.moveTo(40, -30); ctx.bezierCurveTo(36, -70, 24 + sw * 20, -94, 8 + sw * 30, -102); ctx.bezierCurveTo(12, -74, 6, -48, -10, -28); ctx.closePath(); };
    fin(ctx, dors, lg(ctx, 0, -100, 0, -28, [[0, '#2a2a68'], [1, '#1a1a40']]), { fan: [20, -24, 'rgba(120,140,220,0.25)', 40], edge: 'rgba(160,180,255,0.4)' });
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-74, -10); ctx.quadraticCurveTo(-78, -22, -86, -20); ctx.quadraticCurveTo(-84, -13, -86, -7); ctx.closePath(); }, '#22224a');
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(-40, 22); ctx.quadraticCurveTo(-46, 40, -58, 38); ctx.quadraticCurveTo(-54, 28, -56, 18); ctx.closePath(); }, '#2a2a5a');
    // lunate tail
    ctx.save(); ctx.translate(-90, 0); ctx.rotate(sw);
    const tl = () => { ctx.beginPath(); ctx.moveTo(4, -4); ctx.bezierCurveTo(-12, -30, -28, -62, -40, -88); ctx.bezierCurveTo(-28, -52, -22, -20, -18, 0); ctx.bezierCurveTo(-22, 20, -28, 52, -40, 88); ctx.bezierCurveTo(-28, 62, -12, 30, 4, 4); ctx.closePath(); };
    fin(ctx, tl, lg(ctx, 0, -88, 0, 88, [[0, '#2a2a6a'], [0.5, '#4a4c8a'], [1, '#2a2a6a']]), { fan: [0, 0, 'rgba(140,160,230,0.22)', 50], edge: 'rgba(160,180,255,0.45)' });
    ctx.restore();
    bodyShade(ctx, b, [[0, '#18183e'], [0.33, '#34367c'], [0.55, '#8a90bc'], [0.75, '#d8dde8'], [1, '#f2f4f8']], 'rgba(20,20,50,0.55)', {
      sheen: 0.4,
      pattern: () => {
        for (let i = 0; i < 10; i++) { ctx.fillStyle = 'rgba(70,90,180,0.18)'; ctx.beginPath(); ctx.ellipse(50 - i * 14, -4, 4, 26, 0.1, 0, TAU); ctx.fill(); }
        const sx = ((t * 60) % 320) - 160;
        ctx.fillStyle = lg(ctx, sx - 30, -30, sx + 30, 30, [[0, 'rgba(180,200,255,0)'], [0.5, 'rgba(200,220,255,0.42)'], [1, 'rgba(180,200,255,0)']]);
        ctx.fillRect(-100, -40, 180, 80);
      },
    });
    // keel at the tail base
    ctx.beginPath(); ctx.ellipse(-84, 0, 8, 2.6, 0, 0, TAU); ctx.fillStyle = 'rgba(20,20,50,0.6)'; ctx.fill();
    gill(ctx, 44, 24, 22, 'rgba(20,20,50,0.5)', 9);
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(40, 14); ctx.bezierCurveTo(24, 30, 0, 46, -16, 56); ctx.bezierCurveTo(4, 38, 20, 24, 34, 10); ctx.closePath(); }, lg(ctx, 0, 10, 0, 56, [[0, '#2e305e'], [1, '#4a4e8a']]), { edge: 'rgba(160,180,255,0.4)' });
    eye(ctx, 54, -8, 7, '#9fb0d8', { irisEdge: '#3a4a8a', ring: 'rgba(10,10,30,0.5)' });
    line(ctx, [60, 4, 54, 7, 46, 6], 'rgba(20,20,50,0.6)', 1.4);
  }

  /* ---------- the second legendary ---------- */

  function dolphin(ctx, t) {
    const beat = Math.sin(t * 2.2) * 9;
    const bend = x => (x < -10 ? beat * Math.pow((-x - 10) / 104, 2) : 0);
    const topP = [[118, -1], [110, -3], [99, -6], [93, -13], [84, -22], [68, -30], [42, -36], [12, -38], [-18, -34], [-48, -25], [-78, -15], [-102, -8], [-114, -6]];
    const botP = [[-114, 6], [-102, 8], [-78, 14], [-48, 22], [-18, 31], [12, 35], [42, 32], [66, 24], [84, 15], [96, 9], [108, 5], [118, 1]];
    const T = topP.map(([x, y]) => [x, y + bend(x)]), B = botP.map(([x, y]) => [x, y + bend(x)]);
    const topAt = x => { for (let i = 1; i < T.length; i++) if (x >= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i]; return y0 + (y1 - y0) * ((x - x0) / (x1 - x0)); } return T[T.length - 1][1]; };
    const body = () => { ctx.beginPath(); through(ctx, T.concat(B), true); ctx.closePath(); };
    // far flipper
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(58, 14); ctx.bezierCurveTo(56, 26, 50, 36, 40, 40); ctx.bezierCurveTo(46, 30, 48, 22, 46, 14); ctx.closePath(); }, '#3a4858');
    // flukes: horizontal, seen from a little above, beating up and down with the tail
    ctx.save(); ctx.translate(-112, bend(-112)); ctx.rotate(Math.cos(t * 2.2) * 0.22);
    const far = () => { ctx.beginPath(); ctx.moveTo(2, -3); ctx.bezierCurveTo(-10, -8, -26, -14, -44, -15); ctx.bezierCurveTo(-36, -9, -30, -4, -27, 0); ctx.lineTo(0, 2); ctx.closePath(); };
    const near = () => { ctx.beginPath(); ctx.moveTo(2, 2); ctx.bezierCurveTo(-12, 8, -30, 18, -50, 22); ctx.bezierCurveTo(-42, 12, -32, 4, -27, 0); ctx.lineTo(0, -3); ctx.closePath(); };
    fin(ctx, far, lg(ctx, 0, -15, 0, 2, [[0, '#2e3c4c'], [1, '#4a5c70']]), { edge: 'rgba(20,30,40,0.45)', ew: 1.1 });
    fin(ctx, near, lg(ctx, 0, -2, 0, 22, [[0, '#56687c'], [1, '#8494a6']]), { edge: 'rgba(20,30,40,0.5)', ew: 1.2 });
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-26, 12, -44, 19); ctx.stroke();
    ctx.restore();
    // dorsal fin
    const dors = () => { ctx.beginPath(); ctx.moveTo(12, -36); ctx.bezierCurveTo(4, -54, -12, -66, -40, -70 + bend(-40)); ctx.bezierCurveTo(-30, -60, -26, -44, -36, -31 + bend(-36)); ctx.closePath(); };
    fin(ctx, dors, lg(ctx, 0, -78, 0, -30, [[0, '#2c3a4a'], [1, '#4a5c70']]), { edge: 'rgba(20,30,40,0.45)', ew: 1.3 });
    shadeBody(ctx, body, [-114, -38, 118, 35], [[0, '#3c4d60'], [0.3, '#62778c'], [0.52, '#9aaebe'], [0.66, '#dfe6ec'], [1, '#f4eef0']], 'rgba(25,35,48,0.55)', {
      sheen: 0.4, belly: 0.1,
      pattern: () => {
        // darker cape along the back
        ctx.fillStyle = 'rgba(30,42,58,0.35)';
        ctx.beginPath(); through(ctx, [[96, -8], [80, -22], [50, -34], [10, -40], [-30, -36 + bend(-30)], [-70, -22 + bend(-70)], [-112, -10 + bend(-112)], [-112, -2 + bend(-112)], [-60, -8 + bend(-60)], [-20, -16 + bend(-20)], [20, -20], [60, -18], [88, -6]], true); ctx.closePath(); ctx.fill();
        // pale belly, blushing at the throat
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); through(ctx, [[110, 4], [84, 12], [50, 22], [10, 30], [-30, 26 + bend(-30)], [-70, 16 + bend(-70)], [-100, 9 + bend(-100)], [-60, 30 + bend(-60)], [10, 44], [70, 30], [110, 6]], true); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rg(ctx, 80, 14, 0, 80, 14, 26, [[0, 'rgba(255,190,200,0.35)'], [1, 'rgba(255,190,200,0)']]); ctx.fillRect(50, -10, 60, 50);
        // wet sheen along the back, and a slow travelling glint
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
        ctx.beginPath(); through(ctx, [[86, -18], [60, -28], [24, -33], [-14, -30 + bend(-14)], [-50, -21 + bend(-50)]], true); ctx.stroke();
        const sx = ((t * 55) % 360) - 180;
        ctx.fillStyle = lg(ctx, sx - 34, -40, sx + 34, 40, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,248,230,0.35)'], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(-130, -60, 260, 120);
      },
    });
    // near flipper
    fin(ctx, () => { ctx.beginPath(); ctx.moveTo(60, 16); ctx.bezierCurveTo(54, 30, 40, 44, 22, 50); ctx.bezierCurveTo(30, 38, 38, 28, 44, 16); ctx.closePath(); }, lg(ctx, 0, 14, 0, 50, [[0, '#56687c'], [1, '#7a8ca0']]), { edge: 'rgba(25,35,48,0.5)', ew: 1.2 });
    // beak crease, smile, blowhole, eye and brow
    line(ctx, [99, -6, 95, -10, 92, -14], 'rgba(30,40,52,0.35)', 1.4);
    ctx.strokeStyle = 'rgba(30,40,52,0.6)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(117, 1); ctx.quadraticCurveTo(100, 7, 84, 4); ctx.quadraticCurveTo(80, 2, 78, -1); ctx.stroke();
    ctx.beginPath(); ctx.arc(56, -33, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    eye(ctx, 74, -12, 4.2, '#3a2a1c', { pupil: 0.7, ring: 'rgba(30,40,52,0.5)' });
    line(ctx, [79, -17, 74, -18.5, 69, -16], 'rgba(30,40,52,0.5)', 1.2);
    // droplets running off its back
    for (let i = 0; i < 7; i++) {
      const p = (t * 0.35 + i / 7) % 1;
      let x = 64 - p * 196, y;
      if (x >= -114) y = topAt(x) - 1.6; else { y = topAt(-114) - 1.6 + (-114 - x) * 0.9; }
      const a = p < 0.1 ? p / 0.1 : p > 0.88 ? (1 - p) / 0.12 : 1, r = 1.5 + (i % 3) * 0.5;
      ctx.fillStyle = `rgba(225,246,255,${0.85 * a})`; circle(ctx, x, y, r); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a})`; circle(ctx, x + r * 0.3, y - r * 0.35, r * 0.35); ctx.fill();
    }
    for (const [x, y, ph] of [[30, -36, 0], [86, -18, 2.1], [-40, -26, 4.2]]) sparkle(ctx, x, y + bend(x), 6, '#ffffff', Math.max(0, Math.sin(t * 1.7 + ph)) * 0.9);
  }

  const ART = {
    trout, salmon, pomfret, catfish, crucian, tilapia, carp, puffer, grouper, pike, barracuda, koi, flyingfish, penguin, dragonfish,
    bluegill, perch, mudskipper, lanternfish, clownfish, snapper, cod, char: arcticChar, goldfish,
    bass, eel, lionfish, sturgeon, snakehead, angelfish, betta, seahorse, oarfish, swordfish, dolphin,
  };

  /* Bounding boxes [x0, x1, y0, y1] used to fit each drawing into a frame. */
  const BOX = {
    trout: [-122, 106, -52, 48], salmon: [-130, 108, -50, 46], pomfret: [-106, 80, -98, 98],
    catfish: [-122, 134, -46, 52], crucian: [-106, 88, -70, 62], tilapia: [-110, 92, -60, 58],
    carp: [-126, 100, -60, 54], puffer: [-92, 80, -76, 76], grouper: [-122, 108, -62, 66],
    pike: [-148, 124, -44, 44], barracuda: [-160, 132, -40, 38], koi: [-172, 104, -64, 76],
    flyingfish: [-168, 76, -108, 108], penguin: [-112, 104, -142, 118], dragonfish: [-178, 186, -84, 84],
    bluegill: [-104, 83, -65, 61], perch: [-121, 99, -58, 53], mudskipper: [-118, 96, -66, 45],
    lanternfish: [-126, 96, -46, 39], clownfish: [-97, 82, -61, 60], snapper: [-128, 102, -62, 55],
    cod: [-123, 106, -54, 47], char: [-126, 103, -52, 52], goldfish: [-139, 75, -88, 78],
    bass: [-130, 111, -61, 55], eel: [-126, 118, -28, 28], lionfish: [-92, 77, -114, 102],
    sturgeon: [-171, 125, -66, 38], snakehead: [-122, 108, -42, 38], angelfish: [-135, 63, -170, 162],
    betta: [-144, 73, -105, 109], seahorse: [-34, 65, -114, 104], oarfish: [-182, 128, -76, 74],
    swordfish: [-139, 179, -106, 93], dolphin: [-170, 122, -76, 53],
  };

  /* ---------- aura behind rare+ catches ---------- */
  function rays(ctx, rot, n, R, col) {
    ctx.save();
    ctx.rotate(rot);
    const g = rg(ctx, 0, 0, 0, 0, 0, R, [[0, col], [1, 'rgba(0,0,0,0)']]);
    ctx.fillStyle = g;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, w = (TAU / n) * 0.26;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a - w, a + w); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function aura(ctx, rarity, t, R) {
    const tier = RARITIES[rarity].tier;
    if (tier === 0) return;
    const col = RARITIES[rarity].color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg(ctx, 0, 0, 0, 0, 0, R, [[0, hexA(col, 0.22 + tier * 0.05)], [0.5, hexA(col, 0.08 + tier * 0.02)], [1, hexA(col, 0)]]);
    ctx.fillRect(-R, -R, R * 2, R * 2);
    if (tier >= 2) rays(ctx, t * 0.12, 10, R * 0.95, hexA(col, 0.1));
    if (tier >= 3) rays(ctx, t * 0.22, 16, R * 1.2, hexA(col, 0.2));
    if (tier >= 4) {
      rays(ctx, -t * 0.16, 11, R * 1.3, 'rgba(255,80,90,0.2)');
      // flame tongues licking outward
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + Math.sin(t * 0.5 + i) * 0.1;
        const len = R * (0.62 + 0.12 * Math.sin(t * 4 + i * 2.1));
        const ca = Math.cos(a), sa = Math.sin(a);
        const x0 = ca * R * 0.32, y0 = sa * R * 0.26;
        const x1 = ca * len, y1 = sa * len * 0.8;
        ctx.fillStyle = rg(ctx, x0, y0, 0, x0, y0, len * 0.8, [[0, 'rgba(255,120,60,0.35)'], [0.6, 'rgba(255,60,60,0.12)'], [1, 'rgba(255,40,40,0)']]);
        ctx.beginPath();
        ctx.moveTo(x0 - sa * 22, y0 + ca * 22);
        ctx.quadraticCurveTo(x1 * 0.8 - sa * 10 + Math.sin(t * 5 + i) * 8, y1 * 0.8 + ca * 10, x1, y1);
        ctx.quadraticCurveTo(x1 * 0.8 + sa * 10, y1 * 0.8 - ca * 10 + Math.cos(t * 5 + i) * 8, x0 + sa * 22, y0 - ca * 22);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    const n = [0, 5, 10, 18, 30][tier];
    const rnd = seeded(97 + tier);
    for (let i = 0; i < n; i++) {
      const a0 = rnd() * TAU, rr = R * (0.32 + rnd() * 0.66), spd = (rnd() - 0.5) * 0.5;
      const a = a0 + t * spd;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.4 + rnd() * 2.2) + rnd() * TAU);
      const size = 2.5 + rnd() * (2 + tier * 1.6);
      sparkle(ctx, Math.cos(a) * rr, Math.sin(a) * rr * 0.72, size, i % 3 === 0 ? col : '#ffffff', tw * (0.5 + tier * 0.12));
    }
    if (tier >= 4) {
      // rising embers
      for (let i = 0; i < 18; i++) {
        const ph = (t * (0.18 + (i % 5) * 0.03) + i / 18) % 1;
        const x = Math.sin(i * 7.3) * R * 0.8 + Math.sin(t + i) * 6;
        const y = R * 0.6 - ph * R * 1.3;
        ctx.fillStyle = `rgba(255,${150 + (i % 3) * 40},80,${(1 - ph) * 0.8})`;
        circle(ctx, x, y, 1.4 + (i % 3) * 0.6); ctx.fill();
      }
    }
  }

  /* Draw a species fitted into a w×h frame centred on (x, y). */
  function drawFitted(ctx, id, t, x, y, w, h, o = {}) {
    const box = BOX[id];
    const bw = box[1] - box[0], bh = box[3] - box[2];
    const s = Math.min(w / bw, h / bh) * (o.fill ?? 0.92);
    ctx.save();
    ctx.translate(x, y);
    if (o.rotate) ctx.rotate(o.rotate);
    if (o.aura) aura(ctx, SPECIES[id].rarity, t, o.auraR || Math.max(w, h) * 0.55);
    ctx.scale(s * (o.flip ? -1 : 1), s);
    ctx.translate(-(box[0] + box[1]) / 2, -(box[2] + box[3]) / 2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ART[id](ctx, t);
    ctx.restore();
  }

  /* Aura + fish for a dedicated canvas: the aura is feathered out with an elliptical mask
     so it never meets the canvas edge, then the fish is drawn crisp on top. */
  function drawShowcase(ctx, id, t, x, y, w, h, o = {}) {
    const tier = RARITIES[SPECIES[id].rarity].tier;
    if (tier > 0 && o.aura !== false) {
      ctx.save();
      ctx.translate(x, y);
      aura(ctx, SPECIES[id].rarity, t, o.auraR || Math.max(w, h) * 0.6);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.translate(x, y);
      ctx.scale((o.maskW || w) / 2, (o.maskH || h) / 2);
      ctx.fillStyle = rg(ctx, 0, 0, 0, 0, 0, 1, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,0)']]);
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    if (!o.noFish) drawFitted(ctx, id, t, x, y, w * (o.scale ?? 1), h * (o.scale ?? 1), { fill: o.fill });
  }

  /* Draw a species at the current transform, unfitted (used to measure drawings). */
  function drawRaw(ctx, id, t) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ART[id](ctx, t); ctx.restore(); }

  return { drawFitted, drawShowcase, drawRaw, aura, sparkle, BOX, hexA };
})();
