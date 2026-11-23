/* Tidesong — flourishes: rare, timed moments that make each water feel alive.
   Each water has its own set (a frog visiting a lily pad, a seagull swooping past, a whale surfacing...).
   Events are spaced out with a global cooldown so they never crowd the scene.
   Layers: 'sky' events are drawn into the sky layer (and so reflect in the water on the GPU path),
   'water' events sit on the water, 'front' events pass in front of everything. */
'use strict';

const Flourish = (() => {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => k * k * (3 - 2 * k);
  let api = null;
  let loc = null;
  let active = [];
  let next = {};
  let lastStart = -99;
  const GAP = 9;

  function rg(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function glowDot(ctx, x, y, r, rgb, a) {
    ctx.fillStyle = rg(ctx, x, y, 0, r, [[0, `rgba(${rgb},${a})`], [0.35, `rgba(${rgb},${a * 0.35})`], [1, `rgba(${rgb},0)`]]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const waterDepth = (L, y) => (y - L.horizon) / (L.h - L.horizon);
  const persp = (L, y) => 0.35 + waterDepth(L, y);
  /* Distance from a point to the rod (a straight line from its base to its tip is close enough). */
  function rodDist(L, x, y) {
    const a = L.rodBase, b = L.rodTip, dx = b.x - a.x, dy = b.y - a.y;
    const k = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(x - (a.x + dx * k), y - (a.y + dy * k));
  }
  /* A spot on open water, clear of the rod and the bobber, so the moment is actually seen. */
  function waterSpot(L, d0, d1) {
    const bob = api.bob();
    for (let tries = 0; tries < 24; tries++) {
      const d = rand(d0, d1), y = L.horizon + Math.pow(d, 1.2) * (L.h - L.horizon);
      const x = rand(Math.max(0.08, L.rodTip.x / L.w + 0.07), 0.93) * L.w;
      if (bob && Math.abs(x - bob.x) < L.w * 0.11) continue;
      if (rodDist(L, x, y) < L.m * 0.1) continue;
      return { x, y };
    }
    return { x: L.w * 0.85, y: L.horizon + Math.pow((d0 + d1) / 2, 1.2) * (L.h - L.horizon) };
  }

  /* ---------- shared drawings ---------- */
  function fishSilhouette(ctx, s, sheen) {
    ctx.fillStyle = '#26333d';
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.34, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.85, 0); ctx.lineTo(-s * 1.45, -s * 0.42); ctx.lineTo(-s * 1.32, 0); ctx.lineTo(-s * 1.45, s * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(200,225,240,${sheen})`;
    ctx.beginPath(); ctx.ellipse(s * 0.1, -s * 0.12, s * 0.65, s * 0.08, 0, 0, TAU); ctx.fill();
  }

  function frog(ctx, s, pose, puff, blink) {
    const g = ctx.createLinearGradient(0, -s, 0, 0);
    g.addColorStop(0, '#8fd06a'); g.addColorStop(1, '#3f7d34');
    if (pose === 'jump') {
      ctx.strokeStyle = '#3f7d34'; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.95, -s * 0.05); ctx.lineTo(-s * 1.2, -s * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.4); ctx.lineTo(s * 0.62, -s * 0.22); ctx.stroke();
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -s * 0.4, s * 0.55, s * 0.26, -0.15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.52, s * 0.22, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#356b2c';
      ctx.beginPath(); ctx.ellipse(-s * 0.32, -s * 0.16, s * 0.36, s * 0.2, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, -s * 0.36, s * 0.52, s * 0.36, -0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.36, -s * 0.62, s * 0.25, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8f2c0';
      ctx.beginPath(); ctx.ellipse(s * 0.2, -s * 0.2, s * 0.22, s * 0.12, -0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3f7d34'; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * 0.28, -s * 0.28); ctx.lineTo(s * 0.36, -s * 0.02); ctx.stroke();
      if (puff > 0.02) {
        ctx.fillStyle = `rgba(246,240,190,${0.9})`;
        ctx.beginPath(); ctx.arc(s * 0.48, -s * 0.4, s * 0.2 * puff, 0, TAU); ctx.fill();
      }
    }
    const ey = pose === 'jump' ? -s * 0.7 : -s * 0.84, ex = pose === 'jump' ? s * 0.45 : s * 0.4;
    ctx.fillStyle = '#7fc25a'; ctx.beginPath(); ctx.arc(ex, ey, s * 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f2d36a'; ctx.beginPath(); ctx.ellipse(ex + s * 0.02, ey, s * 0.09, s * 0.09 * blink, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(ex + s * 0.03, ey, s * 0.06, s * 0.035 * blink, 0, 0, TAU); ctx.fill();
  }

  /* ---------- event definitions ---------- */
  const DEF = {
    fishjump: {
      layer: 'water',
      start(L) {
        const p = waterSpot(L, 0.08, 0.55), k = persp(L, p.y);
        return { ...p, dir: Math.random() < 0.5 ? -1 : 1, size: L.m * 0.032 * k, hop: L.m * 0.08 * k, k, dur: 1.0 };
      },
      tick(s) {
        if (!s.a) { s.a = 1; api.splash({ x: s.x, y: s.y }, 0.45 * s.k); }
        if (s.age > 0.82 && !s.b) { s.b = 1; api.splash({ x: s.x + s.dir * s.size * 2.6, y: s.y }, 0.5 * s.k); api.play('plop', 0.7); }
      },
      draw(ctx, L, s) {
        const k = clamp(s.age / 0.85, 0, 1);
        if (k >= 1) return;
        const x = s.x + s.dir * s.size * 2.6 * k, y = s.y - Math.sin(k * Math.PI) * s.hop;
        ctx.save(); ctx.translate(x, y); ctx.scale(s.dir, 1); ctx.rotate(-Math.cos(k * Math.PI) * 0.9);
        fishSilhouette(ctx, s.size, 0.35);
        ctx.restore();
      },
    },

    frog: {
      layer: 'water',
      start(L) {
        const bob = api.bob();
        const pads = api.pads().filter(p => waterDepth(L, p.y) > 0.12 && p.x > L.w * 0.08 && p.x < L.w * 0.92 && (!bob || Math.abs(p.x - bob.x) > L.w * 0.12) && rodDist(L, p.x, p.y) > L.m * 0.12);
        if (!pads.length) return null;
        const pad = pads[Math.floor(Math.random() * pads.length)];
        const dir = pad.x < L.w * 0.5 ? 1 : -1, sit = rand(3.4, 5.4);
        return {
          pad, dir, sit, size: Math.max(13, pad.r * 1.3), dur: 0.75 + sit + 0.75,
          from: { x: pad.x - dir * pad.r * 2.6, y: pad.y + pad.r * 0.2 }, to: { x: pad.x + dir * pad.r * 2.8, y: pad.y + pad.r * 0.25 },
        };
      },
      tick(s) {
        if (!s.a) { s.a = 1; api.splash(s.from, 0.35); }
        if (s.age > 0.75 && !s.b) { s.b = 1; api.ripple(s.pad.x, s.pad.y, 1, 0.45); }
        if (s.age > 1.4 && !s.c) { s.c = 1; api.play('croak'); }
        if (s.age > 0.75 + s.sit * 0.7 && !s.d) { s.d = 1; api.play('croak'); }
        if (s.age > s.dur - 0.08 && !s.e) { s.e = 1; api.splash(s.to, 0.45); api.play('plop', 0.75); }
      },
      draw(ctx, L, s, t) {
        const h1 = 0.75, h2 = 0.75 + s.sit;
        let x, y, pose = 'sit', puff = 0, alpha = 1, tilt = 0;
        if (s.age < h1) {
          const k = ease(s.age / h1);
          x = lerp(s.from.x, s.pad.x, k); y = lerp(s.from.y, s.pad.y, k) - Math.sin(k * Math.PI) * s.size * 1.6;
          pose = 'jump'; alpha = Math.min(1, s.age / 0.15); tilt = (0.5 - k) * 0.8;
        } else if (s.age < h2) {
          x = s.pad.x; y = s.pad.y - s.size * 0.05;
          const c1 = s.age - 1.4, c2 = s.age - (0.75 + s.sit * 0.7);
          for (const c of [c1, c2]) if (c > 0 && c < 0.9) puff = Math.max(puff, Math.sin((c / 0.9) * Math.PI));
        } else {
          const k = ease(clamp((s.age - h2) / 0.75, 0, 1));
          x = lerp(s.pad.x, s.to.x, k); y = lerp(s.pad.y, s.to.y, k) - Math.sin(k * Math.PI) * s.size * 1.6;
          pose = 'jump'; alpha = k > 0.85 ? (1 - k) / 0.15 : 1; tilt = (0.5 - k) * 0.8;
        }
        const blink = (t % 3.1) < 0.12 ? 0.15 : 1;
        ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(s.dir, 1); ctx.rotate(-tilt);
        frog(ctx, s.size, pose, puff, blink);
        ctx.restore();
      },
    },

    dragonfly: {
      layer: 'front',
      start(L) {
        const fromLeft = Math.random() < 0.5, pts = [];
        const y0 = L.horizon + (L.h - L.horizon) * rand(0.12, 0.4);
        const n = 5;
        for (let i = 0; i <= n; i++) {
          const fx = i / n;
          pts.push({ x: (fromLeft ? fx : 1 - fx) * (L.w + 80) - 40, y: y0 + rand(-1, 1) * L.h * 0.06 });
        }
        return { pts, n, size: L.m * 0.028, dur: n * 0.95 };
      },
      tick(s) { if (!s.a) { s.a = 1; api.play('buzz', s.dur); } },
      draw(ctx, L, s, t) {
        const segT = s.age / 0.95, i = Math.min(s.n - 1, Math.floor(segT)), f = segT - i;
        const travel = clamp(f / 0.45, 0, 1), k = ease(travel);
        const a = s.pts[i], b = s.pts[i + 1];
        const x = lerp(a.x, b.x, k) + (travel >= 1 ? Math.sin(t * 9) * 1.5 : 0), y = lerp(a.y, b.y, k) + (travel >= 1 ? Math.cos(t * 7) * 1.5 : 0);
        const ang = Math.atan2(b.y - a.y, b.x - a.x), z = s.size;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.globalCompositeOperation = 'lighter';
        const flick = 0.35 + 0.25 * Math.sin(t * 60);
        for (const [ox, sy] of [[z * 0.15, -1], [z * 0.15, 1], [-z * 0.1, -1], [-z * 0.1, 1]]) {
          ctx.fillStyle = `rgba(210,240,255,${flick})`;
          ctx.beginPath(); ctx.ellipse(ox, sy * z * 0.45, z * 0.16, z * 0.48, sy * 0.25, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#2b8aa8'; ctx.lineWidth = Math.max(1.5, z * 0.09); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-z * 0.9, 0); ctx.lineTo(z * 0.25, 0); ctx.stroke();
        ctx.fillStyle = '#1f6f8a'; ctx.beginPath(); ctx.ellipse(z * 0.3, 0, z * 0.14, z * 0.1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#63d0ff'; ctx.beginPath(); ctx.arc(z * 0.42, 0, z * 0.08, 0, TAU); ctx.fill();
        ctx.restore();
      },
    },

    owl: {
      layer: 'sky',
      start(L) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        return { dir, y0: L.horizon * rand(0.28, 0.42), y1: L.horizon * rand(0.5, 0.62), size: L.m * 0.075, dur: 8 };
      },
      tick(s) { if (s.age > 2.2 && !s.a) { s.a = 1; api.play('hoot'); } },
      draw(ctx, L, s, t) {
        const k = s.age / s.dur;
        const x = s.dir > 0 ? lerp(-L.w * 0.1, L.w * 1.1, k) : lerp(L.w * 1.1, -L.w * 0.1, k);
        const y = lerp(s.y0, s.y1, ease(k)) + Math.sin(k * 9) * s.size * 0.08;
        const cyc = (s.age % 2.6) / 2.6, beat = cyc < 0.5 ? Math.sin((cyc / 0.5) * TAU * 2) : 0.2;
        const z = s.size;
        ctx.save(); ctx.translate(x, y); ctx.scale(s.dir, 1);
        ctx.fillStyle = '#1a1226';
        // far wing (below, foreshortened) then body then near wing
        const wing = (tipY, len, back) => {
          ctx.beginPath(); ctx.moveTo(z * 0.12, -z * 0.02);
          ctx.quadraticCurveTo(z * 0.05, tipY * 0.7, -z * 0.05 - back, tipY);
          ctx.quadraticCurveTo(-z * 0.22 - back, tipY * 0.95, -z * 0.3 - back * 0.6, tipY * 0.7);
          ctx.lineTo(-z * 0.26, tipY * 0.45);
          ctx.quadraticCurveTo(-z * 0.18, tipY * 0.15, -z * 0.12, z * 0.02);
          ctx.closePath(); ctx.fill();
        };
        wing(z * (0.18 - beat * 0.12), 0.6, z * 0.05);
        ctx.beginPath(); ctx.ellipse(0, 0, z * 0.24, z * 0.1, -0.05, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-z * 0.2, -z * 0.02); ctx.lineTo(-z * 0.36, -z * 0.04); ctx.lineTo(-z * 0.34, z * 0.05); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(z * 0.24, -z * 0.04, z * 0.095, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(z * 0.19, -z * 0.11); ctx.lineTo(z * 0.21, -z * 0.18); ctx.lineTo(z * 0.25, -z * 0.12); ctx.fill();
        wing(-z * (0.36 + beat * 0.2), 1, 0);
        ctx.fillStyle = 'rgba(255,200,90,0.95)'; ctx.beginPath(); ctx.arc(z * 0.29, -z * 0.05, z * 0.022, 0, TAU); ctx.fill();
        ctx.restore();
      },
    },

    wisp: {
      layer: 'water',
      start(L) {
        const p = waterSpot(L, 0.05, 0.3);
        return { bx: p.x, wy: p.y, lift: L.m * rand(0.05, 0.09), size: L.m * 0.03 * persp(L, p.y), drift: rand(-1, 1) * L.w * 0.08, dur: 9.5, ph: rand(0, TAU) };
      },
      tick(s) { if (!s.a) { s.a = 1; api.play('wisp'); } },
      draw(ctx, L, s, t) {
        const k = s.age / s.dur, a = Math.min(1, k * 5) * Math.min(1, (1 - k) * 4);
        const x = s.bx + s.drift * k + Math.sin(s.age * 0.9 + s.ph) * s.size * 4;
        const y = s.wy - s.lift - Math.sin(s.age * 1.7 + s.ph) * s.size * 1.2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.85 + 0.15 * Math.sin(t * 5);
        glowDot(ctx, x, y, s.size * 9, '120,255,215', 0.32 * a * pulse);
        glowDot(ctx, x, y, s.size * 3, '200,255,240', 0.75 * a);
        glowDot(ctx, x, y, s.size, '255,255,255', a);
        for (let i = 1; i <= 5; i++) {
          const tx = x - Math.sin(s.age * 0.9 + s.ph - i * 0.18) * s.size * 4 * 0.2 - s.drift / s.dur * i * 0.35, ty = y + Math.sin(s.age * 2 + i) * s.size * 0.6;
          glowDot(ctx, tx - i * s.size * 0.8, ty, s.size * 1.2, '150,255,220', 0.35 * a * (1 - i / 6));
        }
        const ry = s.wy + (s.wy - y) * 0.6;
        ctx.save(); ctx.translate(x, ry); ctx.scale(1, 0.35);
        glowDot(ctx, 0, 0, s.size * 7, '120,255,215', 0.22 * a);
        ctx.restore();
        ctx.restore();
      },
    },

    gull: {
      layer: 'front',
      start(L) {
        const fromRight = Math.random() < 0.65;
        return {
          dir: fromRight ? -1 : 1, dur: 2.0, span: L.m * 0.2,
          p0: { x: fromRight ? L.w * 1.15 : -L.w * 0.15, y: L.h * rand(0.12, 0.25) },
          p1: { x: L.w * rand(0.35, 0.65), y: L.horizon + (L.h - L.horizon) * rand(0.15, 0.3) },
          p2: { x: fromRight ? -L.w * 0.2 : L.w * 1.2, y: L.h * rand(0.05, 0.18) },
        };
      },
      tick(s) { if (s.age > 0.25 && !s.a) { s.a = 1; api.play('gull'); } },
      draw(ctx, L, s, t) {
        const k = s.age / s.dur, u = 1 - k;
        const x = u * u * s.p0.x + 2 * u * k * s.p1.x + k * k * s.p2.x, y = u * u * s.p0.y + 2 * u * k * s.p1.y + k * k * s.p2.y;
        const z = s.span * (0.75 + Math.sin(k * Math.PI) * 0.35);
        const flap = k < 0.35 || k > 0.75 ? Math.sin(s.age * 15) : 0.15 + Math.sin(s.age * 3) * 0.05;
        const tilt = (2 * u * (s.p1.y - s.p0.y) + 2 * k * (s.p2.y - s.p1.y)) / Math.max(1, Math.abs(2 * u * (s.p1.x - s.p0.x) + 2 * k * (s.p2.x - s.p1.x)));
        // a faint shadow on the water
        const wy = Math.max(L.horizon + 4, Math.min(L.h, y + (L.h - y) * 0.45 + z * 0.4));
        if (wy > L.horizon) {
          ctx.fillStyle = 'rgba(10,60,70,0.06)';
          ctx.beginPath(); ctx.ellipse(x + z * 0.1, wy, z * 0.3, z * 0.04, 0, 0, TAU); ctx.fill();
        }
        ctx.save(); ctx.translate(x, y); ctx.scale(s.dir, 1); ctx.rotate(clamp(tilt * s.dir, -0.5, 0.5) * 0.5);
        const lift = flap * 0.5;
        for (const side of [-1, 1]) {
          const far = side < 0 ? 0.82 : 1;
          const ex = -z * 0.04, ey = side * z * 0.2 * far - z * lift * 0.12;
          const tx = -z * 0.2, ty = side * z * 0.48 * far * (0.75 + 0.25 * Math.cos(s.age * 15)) - z * lift * 0.32;
          ctx.beginPath();
          ctx.moveTo(z * 0.07, 0);
          ctx.quadraticCurveTo(z * 0.05, ey * 0.6, ex, ey);
          ctx.quadraticCurveTo(-z * 0.06, ey + (ty - ey) * 0.5, tx, ty);
          ctx.quadraticCurveTo(-z * 0.12, ey * 0.9, -z * 0.1, ey * 0.55);
          ctx.quadraticCurveTo(-z * 0.08, ey * 0.2, -z * 0.06, 0);
          ctx.closePath();
          ctx.fillStyle = side < 0 ? '#c7d0d8' : '#dfe6ec'; ctx.fill();
          ctx.strokeStyle = 'rgba(80,95,110,0.35)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#2b2f36';
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + z * 0.05, ty - (ty - ey) * 0.22); ctx.lineTo(tx + z * 0.015, ty - (ty - ey) * 0.3); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#f7f9fb';
        ctx.beginPath(); ctx.ellipse(0, 0, z * 0.17, z * 0.05, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(z * 0.15, -z * 0.005, z * 0.045, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f2c24a'; ctx.beginPath(); ctx.moveTo(z * 0.19, -z * 0.01); ctx.lineTo(z * 0.25, 0); ctx.lineTo(z * 0.19, z * 0.012); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1d1f24'; ctx.beginPath(); ctx.arc(z * 0.165, -z * 0.018, z * 0.008, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b9c3cc'; ctx.beginPath(); ctx.moveTo(-z * 0.15, 0); ctx.lineTo(-z * 0.24, -z * 0.03); ctx.lineTo(-z * 0.24, z * 0.03); ctx.closePath(); ctx.fill();
        ctx.restore();
      },
    },

    dolphins: {
      layer: 'water',
      start(L) {
        const p = waterSpot(L, 0.05, 0.18), k = persp(L, p.y);
        return { ...p, dir: Math.random() < 0.5 ? -1 : 1, size: L.m * 0.095 * k, k, dur: 2.6, fl: {} };
      },
      tick(s) {
        if (!s.w) { s.w = 1; api.play('whistle'); }
        for (const [i, d] of [[0, 0], [1, 0.5]]) {
          const k = (s.age - d) / 1.25, bx = s.x + i * s.dir * s.size * 1.5;
          if (k >= 0 && !s.fl['a' + i]) { s.fl['a' + i] = 1; api.splash({ x: bx, y: s.y }, 0.5 * s.k); }
          if (k >= 1 && !s.fl['b' + i]) { s.fl['b' + i] = 1; api.splash({ x: bx + s.dir * s.size * 2.4, y: s.y }, 0.6 * s.k); api.play('plop', 0.8); }
        }
      },
      draw(ctx, L, s) {
        for (const [i, d] of [[0, 0], [1, 0.5]]) {
          const k = (s.age - d) / 1.25;
          if (k <= 0 || k >= 1) continue;
          const bx = s.x + i * s.dir * s.size * 1.5, z = s.size;
          const x = bx + s.dir * z * 2.4 * k, y = s.y - Math.sin(k * Math.PI) * z * 1.3;
          ctx.save(); ctx.translate(x, y); ctx.scale(s.dir, 1); ctx.rotate(-Math.cos(k * Math.PI) * 1.0);
          const g = ctx.createLinearGradient(0, -z * 0.3, 0, z * 0.3);
          g.addColorStop(0, '#47697f'); g.addColorStop(0.6, '#7d9db0'); g.addColorStop(1, '#d6e2e8');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(z * 0.72, z * 0.02); ctx.quadraticCurveTo(z * 0.4, -z * 0.3, -z * 0.3, -z * 0.18);
          ctx.quadraticCurveTo(-z * 0.65, -z * 0.08, -z * 0.78, 0); ctx.quadraticCurveTo(-z * 0.4, z * 0.2, z * 0.3, z * 0.15); ctx.quadraticCurveTo(z * 0.6, z * 0.12, z * 0.72, z * 0.02);
          ctx.fill();
          ctx.fillStyle = '#47697f';
          ctx.beginPath(); ctx.moveTo(-z * 0.05, -z * 0.2); ctx.quadraticCurveTo(-z * 0.12, -z * 0.42, -z * 0.25, -z * 0.4); ctx.lineTo(-z * 0.2, -z * 0.17); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-z * 0.75, 0); ctx.lineTo(-z * 0.95, -z * 0.18); ctx.lineTo(-z * 0.88, 0); ctx.lineTo(-z * 0.95, z * 0.16); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      },
    },

    shootingstar: {
      layer: 'sky',
      start(L) {
        const dir = Math.random() < 0.5 ? 1 : -1, ang = rand(0.3, 0.55);
        return { x: L.w * (dir > 0 ? rand(0.1, 0.5) : rand(0.5, 0.9)), y: L.horizon * rand(0.06, 0.3), dx: Math.cos(ang) * dir, dy: Math.sin(ang), len: L.m * rand(0.35, 0.55), dur: 1.15 };
      },
      tick(s) { if (!s.a) { s.a = 1; api.play('shimmer'); } },
      draw(ctx, L, s) {
        const k = s.age / s.dur, e = 1 - Math.pow(1 - k, 2);
        const hx = s.x + s.dx * s.len * e, hy = s.y + s.dy * s.len * e;
        const tail = s.len * 0.45 * (1 - k * 0.5), a = Math.min(1, (1 - k) * 2.5);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(hx, hy, hx - s.dx * tail, hy - s.dy * tail);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.3, `rgba(190,230,255,${a * 0.5})`); g.addColorStop(1, 'rgba(150,200,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - s.dx * tail, hy - s.dy * tail); ctx.stroke();
        glowDot(ctx, hx, hy, 14, '220,240,255', a * 0.8);
        ctx.restore();
      },
    },

    whale: {
      layer: 'water',
      start(L) {
        const p = waterSpot(L, 0.04, 0.12), k = persp(L, p.y);
        return { ...p, dir: Math.random() < 0.5 ? -1 : 1, size: L.m * 0.28 * k, k, dur: 6.2, spout: [] };
      },
      tick(s) {
        if (s.age > 0.2 && !s.a) { s.a = 1; api.ripple(s.x, s.y, 2, 0.9 * s.k); }
        if (s.age > 0.7 && !s.b) { s.b = 1; api.play('spout'); for (let i = 0; i < 26; i++) s.spout.push({ vx: rand(-1, 1), vy: rand(0.7, 1.3), r: rand(0.5, 1.2) }); }
        if (s.age > 1.6 && !s.c) { s.c = 1; api.play('whale'); }
        if (s.age > 4.9 && !s.d) { s.d = 1; api.splash({ x: s.x + s.dir * s.size * 0.4, y: s.y }, 0.9 * s.k); api.play('plop', 1); }
      },
      draw(ctx, L, s) {
        const z = s.size, wy = s.y;
        ctx.save();
        ctx.beginPath(); ctx.rect(s.x - z * 3, wy - z * 3, z * 6, z * 3 + 1); ctx.clip();
        if (s.age < 2.4) {
          const k = s.age / 2.4, rise = Math.sin(k * Math.PI);
          const cx = s.x - s.dir * z * 0.3 + s.dir * z * 0.6 * k;
          ctx.fillStyle = '#1c3044';
          ctx.beginPath(); ctx.ellipse(cx, wy + z * 0.18 - rise * z * 0.26, z * 0.7, z * 0.22, 0, Math.PI, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(160,200,230,0.35)';
          ctx.beginPath(); ctx.ellipse(cx, wy + z * 0.14 - rise * z * 0.26, z * 0.55, z * 0.05, 0, Math.PI, TAU); ctx.fill();
          ctx.fillStyle = '#16283a';
          ctx.beginPath(); ctx.moveTo(cx - s.dir * z * 0.35, wy - rise * z * 0.06); ctx.lineTo(cx - s.dir * z * 0.42, wy - rise * z * 0.14); ctx.lineTo(cx - s.dir * z * 0.5, wy - rise * z * 0.04); ctx.fill();
        }
        if (s.age > 2.6 && s.age < 5.2) {
          const k = (s.age - 2.6) / 2.6, rise = Math.sin(Math.min(1, k * 1.25) * Math.PI);
          const fx = s.x + s.dir * z * 0.4, base = wy + z * 0.05 - rise * z * 0.55;
          ctx.fillStyle = '#1a2e42';
          ctx.beginPath(); ctx.moveTo(fx - z * 0.06, wy + z * 0.1); ctx.lineTo(fx - z * 0.04, base); ctx.lineTo(fx + z * 0.04, base); ctx.lineTo(fx + z * 0.06, wy + z * 0.1); ctx.fill();
          ctx.beginPath(); ctx.moveTo(fx, base + z * 0.02);
          ctx.quadraticCurveTo(fx - z * 0.18, base - z * 0.02, fx - z * 0.34, base - z * 0.14);
          ctx.quadraticCurveTo(fx - z * 0.16, base - z * 0.1, fx, base - z * 0.05);
          ctx.quadraticCurveTo(fx + z * 0.16, base - z * 0.1, fx + z * 0.34, base - z * 0.14);
          ctx.quadraticCurveTo(fx + z * 0.18, base - z * 0.02, fx, base + z * 0.02);
          ctx.fill();
          ctx.fillStyle = 'rgba(220,240,255,0.8)';
          for (let i = 0; i < 6; i++) {
            const ph = ((s.age * 1.6 + i / 6) % 1);
            ctx.beginPath(); ctx.arc(fx + (i - 2.5) * z * 0.11, base - z * 0.1 + ph * (wy - base + z * 0.1), Math.max(0.8, z * 0.012), 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
        if (s.spout.length && s.age < 3) {
          const k = (s.age - 0.7) / 2.2;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (const p of s.spout) {
            const px = s.x - s.dir * z * 0.05 + p.vx * z * 0.18 * k, py = wy - z * 0.1 - p.vy * z * 0.7 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.6) + k * k * z * 0.2;
            glowDot(ctx, px, py, z * 0.06 * p.r * (1 + k), '210,235,255', 0.35 * (1 - k));
          }
          ctx.restore();
        }
      },
    },

    crane: {
      layer: 'sky',
      start(L) {
        const lt = api.light(L), dir = Math.random() < 0.5 ? 1 : -1;
        return { dir, y0: lt.y + lt.r * rand(-0.9, 0.2), y1: lt.y + lt.r * rand(-0.4, 0.7), size: L.m * 0.1, dur: 10 };
      },
      tick(s) { if (s.age > 3 && !s.a) { s.a = 1; api.play('crane'); } },
      draw(ctx, L, s) {
        const k = s.age / s.dur;
        const x = s.dir > 0 ? lerp(-L.w * 0.12, L.w * 1.12, k) : lerp(L.w * 1.12, -L.w * 0.12, k);
        const y = lerp(s.y0, s.y1, k) + Math.sin(s.age * 0.8) * s.size * 0.05;
        const flap = Math.sin(s.age * TAU / 1.5), z = s.size;
        ctx.save(); ctx.translate(x, y); ctx.scale(s.dir, 1);
        ctx.strokeStyle = '#120616'; ctx.fillStyle = '#120616'; ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.2, z * 0.03);
        ctx.beginPath(); ctx.moveTo(z * 0.12, 0); ctx.quadraticCurveTo(z * 0.3, -z * 0.03, z * 0.48, -z * 0.02); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(z * 0.5, -z * 0.02, z * 0.035, z * 0.025, 0, 0, TAU); ctx.fill();
        ctx.lineWidth = Math.max(1, z * 0.015);
        ctx.beginPath(); ctx.moveTo(z * 0.53, -z * 0.02); ctx.lineTo(z * 0.62, -z * 0.01); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-z * 0.12, z * 0.02); ctx.lineTo(-z * 0.5, z * 0.05); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, z * 0.16, z * 0.045, 0, 0, TAU); ctx.fill();
        for (const sy of [-1, 1]) {
          const tip = -flap * z * 0.32 * (sy < 0 ? 1 : 0.55);
          ctx.beginPath(); ctx.moveTo(z * 0.08, 0);
          ctx.quadraticCurveTo(-z * 0.02, tip * 0.6 - sy * z * 0.05, -z * 0.12, tip - sy * z * 0.02);
          ctx.lineTo(-z * 0.32, tip * 0.85);
          ctx.quadraticCurveTo(-z * 0.12, z * 0.0, -z * 0.08, z * 0.02);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      },
    },

    dragon: {
      layer: 'sky',
      start(L) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        return { dir, y: L.horizon * rand(0.22, 0.38), len: L.m * 0.55, amp: L.m * 0.035, dur: 12 };
      },
      tick(s) { if (s.age > 1 && !s.a) { s.a = 1; api.play('rumble'); } },
      draw(ctx, L, s, t) {
        const k = s.age / s.dur, a = Math.min(1, k * 6) * Math.min(1, (1 - k) * 6);
        const headX = s.dir > 0 ? lerp(-L.w * 0.1, L.w * 1.1 + s.len, k) : lerp(L.w * 1.1, -L.w * 0.1 - s.len, k);
        const N = 30, pts = [];
        for (let i = 0; i <= N; i++) {
          const x = headX - s.dir * (i / N) * s.len;
          pts.push([x, s.y + Math.sin(x * 0.012 - t * 1.6) * s.amp * (0.6 + 0.4 * (i / N)) + Math.sin(i * 0.4 + t) * s.amp * 0.15]);
        }
        ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, col] of [[3.2, 'rgba(255,90,60,0.18)'], [1, '#1c0820']]) {
          for (let i = 0; i < N; i++) {
            const th = L.m * 0.016 * (1 - i / N * 0.85);
            ctx.strokeStyle = col; ctx.lineWidth = th * w;
            ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
          }
        }
        ctx.fillStyle = '#1c0820';
        for (let i = 3; i < N - 3; i += 3) {
          const th = L.m * 0.016 * (1 - i / N * 0.85);
          ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1] - th * 0.4); ctx.lineTo(pts[i][0] - s.dir * th * 0.5, pts[i][1] - th * 1.3); ctx.lineTo(pts[i][0] - s.dir * th * 1.0, pts[i][1] - th * 0.3); ctx.fill();
        }
        const [hx, hy] = pts[0], hs = L.m * 0.02;
        ctx.save(); ctx.translate(hx, hy); ctx.scale(s.dir, 1);
        ctx.beginPath(); ctx.moveTo(hs * 1.6, 0); ctx.quadraticCurveTo(hs * 0.6, -hs * 0.9, -hs * 0.4, -hs * 0.5); ctx.quadraticCurveTo(-hs * 0.4, hs * 0.5, hs * 1.6, 0); ctx.fill();
        ctx.strokeStyle = '#1c0820'; ctx.lineWidth = Math.max(1, hs * 0.18);
        ctx.beginPath(); ctx.moveTo(-hs * 0.1, -hs * 0.5); ctx.quadraticCurveTo(-hs * 0.6, -hs * 1.4, -hs * 1.2, -hs * 1.3); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,140,90,0.55)'; ctx.lineWidth = Math.max(0.8, hs * 0.08);
        for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hs * 1.3, hs * 0.1 * sy); ctx.quadraticCurveTo(hs * 0.4, hs * (0.9 + Math.sin(t * 2) * 0.2) * sy, -hs * 1.4, hs * 1.2 * sy); ctx.stroke(); }
        ctx.fillStyle = '#ffb34a'; ctx.beginPath(); ctx.arc(hs * 0.55, -hs * 0.2, hs * 0.13, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.restore();
      },
    },
  };

  const SETS = {
    mistwillow: [['frog', 32, 65], ['dragonfly', 40, 80], ['fishjump', 45, 90]],
    lanternfen: [['owl', 40, 80], ['wisp', 35, 70], ['fishjump', 45, 90]],
    coralspire: [['gull', 30, 60], ['dolphins', 45, 85], ['fishjump', 50, 95]],
    frostveil: [['shootingstar', 25, 55], ['whale', 55, 100], ['fishjump', 55, 100]],
    dragonmere: [['crane', 45, 85], ['dragon', 150, 260], ['fishjump', 45, 90]],
  };

  function init(a) { api = a; }

  function setLocation(id, now) {
    loc = id;
    active = [];
    next = {};
    const set = SETS[id] || [];
    set.forEach(([ev, a, b]) => { next[ev] = now + rand(a, b) * 0.6; });
    // one of the water's own flourishes greets you shortly after arriving
    const unique = set.filter(e => e[0] !== 'fishjump' && e[0] !== 'dragon');
    if (unique.length) next[unique[Math.floor(Math.random() * unique.length)][0]] = now + rand(7, 16);
    lastStart = now - GAP;
  }

  function start(ev, L, now) {
    const st = DEF[ev].start(L);
    if (!st) return false;
    st.ev = ev; st.age = 0;
    active.push(st);
    lastStart = now;
    return true;
  }

  function update(dt, L, now) {
    if (!loc) return;
    for (const [ev, a, b] of SETS[loc] || []) {
      if (now < next[ev]) continue;
      if (now - lastStart < GAP || active.some(s => s.ev === ev)) { next[ev] = now + rand(2, 5); continue; }
      start(ev, L, now);
      next[ev] = now + rand(a, b);
    }
    for (const s of active) {
      s.age += dt;
      if (DEF[s.ev].tick) DEF[s.ev].tick(s, L, now);
    }
    active = active.filter(s => s.age < s.dur);
  }

  function draw(ctx, layer, L, t) {
    for (const s of active) if (DEF[s.ev].layer === layer) DEF[s.ev].draw(ctx, L, s, t);
  }

  return {
    init, setLocation, update, draw,
    trigger(ev, L, now) { return DEF[ev] ? start(ev, L, now) : false; },
    get names() { return loc ? (SETS[loc] || []).map(e => e[0]) : []; },
  };
})();
