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

  /* ---------- leaping out of the water ----------
     A fish or a dolphin breaking the surface: one ballistic arc that begins and ends below the water,
     the body always pointing along its flight, so it noses out and dives back in head first. Under the
     surface it is a dim shape (squashed a little, as water makes things look shallower) rising into
     view; in the air it is fully lit, with a faint reflection below it. It throws up a cone of spray as
     it leaves, sheds drops from its tail in the air, and lands in a crown of spray, a patch of foam, a
     splash and rings. s: x (where it leaves the water), wy (the waterline), dir, z (body length),
     D (distance between leaving and landing), H (height of the arc), T (time in the air), k0 (when). */
  function leapAt(s, k) {
    const x = s.x + s.dir * s.D * k, y = s.wy - 4 * s.H * k * (1 - k);
    return { x, y, ang: Math.atan2(-4 * s.H * (1 - 2 * k), s.D) };
  }
  const leapK = (s, age) => (age - s.k0) / s.T;
  function leapSpray(s, x, n, up, spread, bias) {
    const g = (8 * s.H) / (s.T * s.T);
    for (let i = 0; i < n; i++) {
      const v = Math.sqrt(2 * g * s.z * up * rand(0.3, 1));
      s.spray.push({ x: x + rand(-0.2, 0.2) * s.z * spread, y: s.wy - 1, vx: (rand(-1, 1) * spread + bias * s.dir) * v * 0.55, vy: -v, r: Math.max(0.8, s.z * rand(0.012, 0.03)) });
    }
  }
  function leapTick(s, body) {
    const dt = Math.max(0, s.age - (s.last ?? s.age)), g = (8 * s.H) / (s.T * s.T), k = leapK(s, s.age);
    s.last = s.age;
    if (k >= 0 && !s.out) { s.out = 1; leapSpray(s, s.x, 14, 0.7, 0.6, 0.35); api.splash({ x: s.x, y: s.wy }, 0.35 * s.kk); }
    if (k >= 1 && !s.in) {
      s.in = 1;
      const ex = s.x + s.dir * s.D;
      leapSpray(s, ex, 22, 1.1, 1, 0.1);
      s.foam.push({ x: ex, age: 0, w: s.z * 0.55 });
      api.splash({ x: ex, y: s.wy }, 0.6 * s.kk); api.play('plop', body === 'dolphin' ? 0.95 : 0.7);
    }
    // drops shed from the tail while it is in the air
    if (k > 0.05 && k < 0.95 && Math.random() < dt * 40) {
      const P = leapAt(s, k), tx = P.x - s.dir * Math.cos(P.ang) * s.z * 0.45, ty = P.y + Math.sin(P.ang) * s.z * 0.45;
      s.spray.push({ x: tx, y: ty, vx: s.dir * rand(-0.2, 0.3) * s.D / s.T, vy: rand(-0.2, 0.3) * s.H / s.T, r: Math.max(0.7, s.z * rand(0.01, 0.022)) });
    }
    for (const d of s.spray) { d.vy += g * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    s.spray = s.spray.filter(d => d.y < s.wy + 1 || d.vy < 0);
    for (const f of s.foam) f.age += dt;
    s.foam = s.foam.filter(f => f.age < 1.4);
  }
  function drawLeaper(ctx, s, body) {
    const k = leapK(s, s.age), wy = s.wy, z = s.z, P = leapAt(s, k);
    const place = () => { ctx.translate(P.x, P.y); ctx.scale(s.dir, 1); ctx.rotate(P.ang); };
    const flex = Math.sin(s.age * 18) * 0.12 * (k > 0 && k < 1 ? 1 : 0.4);
    // foam left where it went back in
    for (const f of s.foam) {
      const a = 0.6 * (1 - f.age / 1.4), r = f.w * (1 + f.age * 0.8);
      ctx.save(); ctx.translate(f.x, wy + 1); ctx.scale(1, 0.17);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(240,250,255,${(a * 0.5).toFixed(3)})`); g.addColorStop(0.75, `rgba(240,250,255,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(240,250,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const depth = Math.max(0, P.y - wy);
    // below the surface: a dim shape, squashed toward the surface
    if (depth < z * 1.6) {
      ctx.save();
      ctx.beginPath(); ctx.rect(P.x - z * 2, wy, z * 4, z * 2); ctx.clip();
      ctx.globalAlpha = 0.34 * Math.min(1, 1.4 - depth / (z * 1.2));
      ctx.translate(0, wy); ctx.scale(1, 0.72); ctx.translate(0, -wy);
      place(); BODY[body](ctx, z, 'under', flex);
      ctx.restore();
    }
    if (P.y - z < wy) {
      // its reflection, below the waterline: dark (the water mirrors its dark back), fading as it rises
      ctx.save();
      ctx.beginPath(); ctx.rect(P.x - z * 2, wy, z * 4, z * 3); ctx.clip();
      ctx.globalAlpha = 0.26 * Math.max(0, 1 - (wy - P.y) / (z * 2.5));
      ctx.translate(0, wy * 2); ctx.scale(1, -1);
      place(); BODY[body](ctx, z, 'under', flex);
      ctx.restore();
      // in the air
      ctx.save();
      ctx.beginPath(); ctx.rect(P.x - z * 2, P.y - z * 2, z * 4, wy - (P.y - z * 2)); ctx.clip();
      place(); BODY[body](ctx, z, 'air', flex);
      ctx.restore();
      // a bright line of water where the body cuts the surface
      if (Math.abs(P.y - wy) < z * 0.5) {
        const w = z * 0.3 * (1 - Math.abs(P.y - wy) / (z * 0.5));
        ctx.fillStyle = 'rgba(235,248,255,0.7)';
        ctx.beginPath(); ctx.ellipse(P.x, wy, w, Math.max(1, w * 0.18), 0, 0, TAU); ctx.fill();
      }
    }
    for (const d of s.spray) {
      ctx.fillStyle = 'rgba(236,248,255,0.85)';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
  }
  /* The whale at a moment: its spine as an arc of a circle rolling forward through the surface. The
     circle tightens and rides higher toward the end (the back arching before it dives). */
  const smooth = k => { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
  function whalePose(s, t) {
    const z = s.len, k = clamp((t - 1.0) / 6.0, 0, 1), late = smooth((k - 0.45) / 0.5);
    const R = z * lerp(0.62, 0.4, late), h = z * lerp(0.15, 0.27, late), span = z / R;
    const th = Math.acos(clamp(1 - h / R, -1, 1));
    // the roll: from the head just under the surface to the tail stock gone over the top and under
    const th0 = lerp(-th - 0.12, th + span + 0.2, 0.08 * k + 0.92 * smooth(k * 1.02));
    const cx = s.cx + s.dir * z * 0.5 * k, cy = s.wy + R - h;
    const at = u => { const a = th0 - u * span; return { x: cx + s.dir * R * Math.sin(a), y: cy - R * Math.cos(a), a }; };
    const pose = { R, h, span, th0, cx, cy, at };
    const bh = at(0.12);
    if (bh.y < s.wy - z * 0.02 && Math.abs(bh.a) < 0.35) pose.blow = { x: bh.x, y: bh.y - z * 0.02 };
    // the flukes: lifted from where the tail stock went under, then sinking straight down
    const ft = t - 6.1;
    if (ft > 0) {
      if (!s.fluke) { const e = at(1); s.fluke = { x: e.x + s.dir * z * 0.04 }; }
      const rise = smooth(ft / 0.9), sink = smooth((ft - 1.6) / 1.2);
      const up = rise - sink * 1.35, w = z * 0.5, hh = z * 0.17;
      pose.fluke = { x: s.fluke.x, y: s.wy - up * z * 0.3, w, h: hh, up, rising: ft < 1.6, sinkStart: ft > 1.6, under: up < -0.2 };
    }
    return pose;
  }
  function drawWhale(ctx, s) {
    const z = s.len, wy = s.wy, W = whalePose(s, s.age), t = s.age;
    // the swell: the water lifting, glassy and smooth, before it breaks the surface
    const sw = smooth(t / 1.2) * (1 - smooth((t - 3) / 2));
    if (sw > 0.01) {
      ctx.save(); ctx.translate(W.cx, wy + 1); ctx.scale(1, 0.14);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, z * 0.6);
      g.addColorStop(0, `rgba(200,225,245,${(0.16 * sw).toFixed(3)})`); g.addColorStop(1, 'rgba(200,225,245,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, z * 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the slick left where it dived
    if (W.fluke) {
      const ft = t - 7.7, a = ft > 0 ? 0.22 * (1 - smooth(ft / 3)) : 0;
      if (a > 0.005) {
        ctx.save(); ctx.translate(W.fluke.x, wy + 1); ctx.scale(1, 0.13);
        const g = ctx.createRadialGradient(0, 0, z * 0.05, 0, 0, z * (0.35 + ft * 0.08));
        g.addColorStop(0, `rgba(190,220,240,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(190,220,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, z * (0.35 + ft * 0.08), 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    // the body as a polygon around the spine, thickest a third of the way back
    const N = 28, outer = [], inner = [];
    const thick = u => z * (u < 0.3 ? lerp(0.11, 0.19, Math.sin((u / 0.3) * Math.PI / 2)) : lerp(0.19, 0.045, Math.pow((u - 0.3) / 0.7, 1.3)));
    for (let i = 0; i <= N; i++) {
      const u = i / N, P = W.at(u), nx = (P.x - W.cx) / W.R, ny = (P.y - W.cy) / W.R, th = thick(u);
      outer.push([P.x + nx * th * 0.62, P.y + ny * th * 0.62]); inner.push([P.x - nx * th * 0.38, P.y - ny * th * 0.38]);
    }
    const body = () => {
      ctx.beginPath(); ctx.moveTo(outer[0][0], outer[0][1]);
      for (const p of outer) ctx.lineTo(p[0], p[1]);
      for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
      ctx.closePath();
      // the small knobbly dorsal fin, two thirds of the way back
      const f = W.at(0.64), nx = (f.x - W.cx) / W.R, ny = (f.y - W.cy) / W.R, b = W.at(0.7), th = thick(0.64) * 0.62;
      ctx.moveTo(f.x + nx * th * 0.9, f.y + ny * th * 0.9);
      ctx.lineTo(f.x + nx * (th + z * 0.06) - s.dir * ny * 0 + (b.x - f.x) * 0.6, f.y + ny * (th + z * 0.06) + (b.y - f.y) * 0.6);
      ctx.lineTo(b.x + nx * th * 0.9, b.y + ny * th * 0.9);
      ctx.closePath();
    };
    // a rounded head, filled on its own (overlapping the body in one path would leave a ring)
    const head = () => {
      const hp = W.at(0.025), hn = [(hp.x - W.cx) / W.R, (hp.y - W.cy) / W.R], hr = thick(0.025) * 0.48, ho = hr * 0.12;
      ctx.beginPath(); ctx.arc(hp.x + hn[0] * ho, hp.y + hn[1] * ho, hr, 0, TAU);
    };
    const minX = Math.min(...outer.map(p => p[0]), ...inner.map(p => p[0])) - z * 0.1, maxX = Math.max(...outer.map(p => p[0]), ...inner.map(p => p[0])) + z * 0.1;
    // just below the surface: a dark shape, squashed toward the surface (only a shallow band shows;
    // deeper down the water hides it)
    ctx.save();
    ctx.beginPath(); ctx.rect(minX, wy, maxX - minX, z * 0.07); ctx.clip();
    ctx.translate(0, wy); ctx.scale(1, 0.6); ctx.translate(0, -wy);
    ctx.globalAlpha = 0.28 * smooth(t / 1.0) * (1 - smooth((t - 8.5) / 1.5));
    ctx.fillStyle = '#0c2232'; body(); ctx.fill(); head(); ctx.fill();
    ctx.restore();
    // above it
    ctx.save();
    ctx.beginPath(); ctx.rect(minX, wy - z, maxX - minX, z); ctx.clip();
    const top = W.cy - W.R - z * 0.12;
    const g = ctx.createLinearGradient(0, top, 0, wy);
    g.addColorStop(0, '#2c4458'); g.addColorStop(0.5, '#1a2c3b'); g.addColorStop(1, '#122230');
    ctx.fillStyle = g; body(); ctx.fill(); head(); ctx.fill();
    // moonlight along the wet top of the back
    ctx.strokeStyle = 'rgba(178,214,240,0.5)'; ctx.lineWidth = Math.max(1, z * 0.008); ctx.lineCap = 'round';
    ctx.beginPath();
    outer.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + z * 0.004) : ctx.moveTo(p[0], p[1] + z * 0.004)));
    ctx.stroke();
    // a few pale barnacles near the head
    ctx.fillStyle = 'rgba(200,215,225,0.45)';
    for (const [u, o, r] of [[0.06, 0.4, 0.008], [0.09, 0.55, 0.006], [0.14, 0.45, 0.007], [0.04, 0.3, 0.005]]) {
      const P = W.at(u), nx = (P.x - W.cx) / W.R, ny = (P.y - W.cy) / W.R, th = thick(u);
      ctx.beginPath(); ctx.arc(P.x + nx * th * o, P.y + ny * th * o, Math.max(0.6, z * r), 0, TAU); ctx.fill();
    }
    ctx.restore();
    // white water where the back cuts the surface, and a pale line of water sheeting off it
    const cuts = [];
    for (let i = 1; i < outer.length; i++) {
      const [x0, y0] = outer[i - 1], [x1, y1] = outer[i];
      if ((y0 - wy) * (y1 - wy) < 0) cuts.push(x0 + (x1 - x0) * (wy - y0) / (y1 - y0));
    }
    if (cuts.length) {
      const fz = z * 0.07;
      for (const x of cuts) {
        for (let j = 0; j < 4; j++) {
          const jx = x + Math.sin(t * 7 + j * 2.1 + x) * fz * 0.4, r = fz * (0.5 + 0.3 * Math.sin(t * 5 + j));
          ctx.fillStyle = 'rgba(236,246,255,0.55)';
          ctx.beginPath(); ctx.ellipse(jx, wy - r * 0.2, r, r * 0.35, 0, 0, TAU); ctx.fill();
        }
      }
      if (cuts.length >= 2) {
        ctx.strokeStyle = 'rgba(225,240,252,0.45)'; ctx.lineWidth = Math.max(1, z * 0.008);
        ctx.beginPath(); ctx.moveTo(Math.min(...cuts), wy); ctx.lineTo(Math.max(...cuts), wy); ctx.stroke();
      }
    }
    // the flukes, seen from behind, lifting and sinking straight down
    const F = W.fluke;
    if (F && F.up > -0.3) {
      const fx = F.x, base = F.y, w = F.w, hh = F.h;
      const shape = () => {
        ctx.beginPath();
        ctx.moveTo(fx - z * 0.075, wy + z * 0.05); ctx.quadraticCurveTo(fx - z * 0.05, base + hh * 0.9, fx - z * 0.032, base + hh * 0.35);
        ctx.bezierCurveTo(fx - w * 0.2, base + hh * 0.3, fx - w * 0.42, base - hh * 0.05, fx - w * 0.5, base - hh * 0.55);
        ctx.quadraticCurveTo(fx - w * 0.3, base - hh * 0.2, fx - w * 0.06, base - hh * 0.12);
        ctx.quadraticCurveTo(fx, base - hh * 0.02, fx + w * 0.06, base - hh * 0.12);
        ctx.quadraticCurveTo(fx + w * 0.3, base - hh * 0.2, fx + w * 0.5, base - hh * 0.55);
        ctx.bezierCurveTo(fx + w * 0.42, base - hh * 0.05, fx + w * 0.2, base + hh * 0.3, fx + z * 0.032, base + hh * 0.35);
        ctx.quadraticCurveTo(fx + z * 0.05, base + hh * 0.9, fx + z * 0.075, wy + z * 0.05); ctx.closePath();
      };
      ctx.save(); ctx.beginPath(); ctx.rect(fx - w, wy - z, w * 2, z); ctx.clip();
      const g2 = ctx.createLinearGradient(0, base - hh, 0, wy);
      g2.addColorStop(0, '#2b4357'); g2.addColorStop(1, '#14232f');
      ctx.fillStyle = g2; shape(); ctx.fill();
      // the pale, mottled underside of the flukes catching the light along their trailing edge
      ctx.strokeStyle = 'rgba(205,222,235,0.55)'; ctx.lineWidth = Math.max(1, z * 0.01);
      ctx.beginPath(); ctx.moveTo(fx - w * 0.5, base - hh * 0.55); ctx.quadraticCurveTo(fx - w * 0.3, base - hh * 0.2, fx - w * 0.06, base - hh * 0.12);
      ctx.quadraticCurveTo(fx, base - hh * 0.02, fx + w * 0.06, base - hh * 0.12); ctx.quadraticCurveTo(fx + w * 0.3, base - hh * 0.2, fx + w * 0.5, base - hh * 0.55); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(fx - w, wy, w * 2, z * 0.6); ctx.clip();
      ctx.globalAlpha = 0.25; ctx.translate(0, wy); ctx.scale(1, 0.6); ctx.translate(0, -wy);
      ctx.fillStyle = '#0c2232'; shape(); ctx.fill();
      ctx.restore();
      // a skirt of white water where the tail stock rises out of the sea
      if (F.up > 0) {
        ctx.fillStyle = `rgba(236,246,255,${(0.5 * Math.min(1, F.up * 2)).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(fx, wy, z * 0.13, z * 0.018, 0, 0, TAU); ctx.fill();
      }
    }
    for (const d of s.drops) { ctx.fillStyle = 'rgba(225,240,252,0.8)'; ctx.beginPath(); ctx.arc(d.x, d.y, Math.max(0.7, z * 0.005), 0, TAU); ctx.fill(); }
    // the blow: a plume of breath that rises, spreads and drifts away on the cold air
    for (const m of s.mist) {
      if (m.age <= 0) continue;
      const a = 0.26 * Math.min(1, m.age * 10) * Math.pow(1 - m.age / 3.2, 1.5);
      const g3 = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g3.addColorStop(0, `rgba(225,238,250,${a.toFixed(3)})`); g3.addColorStop(1, 'rgba(225,238,250,0)');
      ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
  }

  /* Bodies seen side on, facing +x, centred, length z. mode 'under' is a dim water-coloured shape. */
  const BODY = {
    dolphin(ctx, z, mode, flex) {
      const under = mode === 'under';
      const g = ctx.createLinearGradient(0, -z * 0.17, 0, z * 0.14);
      if (under) { g.addColorStop(0, '#163a4c'); g.addColorStop(1, '#2a5a6c'); }
      else { g.addColorStop(0, '#36566b'); g.addColorStop(0.45, '#557a90'); g.addColorStop(0.62, '#a9c2cf'); g.addColorStop(1, '#e6eef1'); }
      ctx.fillStyle = g;
      // flukes and the tail stock, flicking a little
      ctx.save(); ctx.translate(-z * 0.36, 0); ctx.rotate(flex);
      ctx.beginPath(); ctx.moveTo(z * 0.06, -z * 0.06);
      ctx.quadraticCurveTo(-z * 0.08, -z * 0.04, -z * 0.15, -z * 0.01);
      ctx.quadraticCurveTo(-z * 0.2, -z * 0.12, -z * 0.27, -z * 0.13);
      ctx.quadraticCurveTo(-z * 0.2, -z * 0.03, -z * 0.17, 0);
      ctx.quadraticCurveTo(-z * 0.21, z * 0.08, -z * 0.27, z * 0.11);
      ctx.quadraticCurveTo(-z * 0.18, z * 0.08, -z * 0.14, z * 0.02);
      ctx.quadraticCurveTo(-z * 0.06, z * 0.04, z * 0.06, z * 0.06);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // the body: beak, the round melon of the forehead, a long back, a pale belly
      ctx.beginPath();
      ctx.moveTo(z * 0.5, z * 0.035);
      ctx.quadraticCurveTo(z * 0.47, z * 0.0, z * 0.41, -z * 0.02);
      ctx.quadraticCurveTo(z * 0.38, -z * 0.11, z * 0.26, -z * 0.135);
      ctx.bezierCurveTo(z * 0.08, -z * 0.17, -z * 0.18, -z * 0.12, -z * 0.34, -z * 0.055);
      ctx.lineTo(-z * 0.36, z * 0.045);
      ctx.bezierCurveTo(-z * 0.16, z * 0.12, z * 0.12, z * 0.13, z * 0.3, z * 0.08);
      ctx.quadraticCurveTo(z * 0.42, z * 0.05, z * 0.5, z * 0.035);
      ctx.closePath(); ctx.fill();
      // the dorsal fin, swept back, and a flipper
      ctx.fillStyle = under ? '#163a4c' : '#33536a';
      ctx.beginPath(); ctx.moveTo(z * 0.04, -z * 0.15);
      ctx.quadraticCurveTo(-z * 0.02, -z * 0.26, -z * 0.1, -z * 0.29);
      ctx.quadraticCurveTo(-z * 0.08, -z * 0.2, -z * 0.12, -z * 0.135);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = under ? '#1c4456' : '#4a6c80';
      ctx.beginPath(); ctx.moveTo(z * 0.2, z * 0.07);
      ctx.quadraticCurveTo(z * 0.12, z * 0.17, z * 0.05, z * 0.2);
      ctx.quadraticCurveTo(z * 0.1, z * 0.11, z * 0.13, z * 0.075);
      ctx.closePath(); ctx.fill();
      if (under) return;
      // wet light along the back, the line of the mouth, an eye
      ctx.strokeStyle = 'rgba(235,248,255,0.55)'; ctx.lineWidth = Math.max(1, z * 0.012); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(z * 0.3, -z * 0.115); ctx.bezierCurveTo(z * 0.12, -z * 0.15, -z * 0.1, -z * 0.12, -z * 0.24, -z * 0.075); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,50,62,0.5)'; ctx.lineWidth = Math.max(0.7, z * 0.006);
      ctx.beginPath(); ctx.moveTo(z * 0.49, z * 0.03); ctx.quadraticCurveTo(z * 0.43, z * 0.03, z * 0.38, z * 0.02); ctx.stroke();
      ctx.fillStyle = '#1a2a34'; ctx.beginPath(); ctx.arc(z * 0.32, -z * 0.03, Math.max(0.8, z * 0.012), 0, TAU); ctx.fill();
    },
    fish(ctx, z, mode, flex) {
      const under = mode === 'under';
      const g = ctx.createLinearGradient(0, -z * 0.15, 0, z * 0.13);
      if (under) { g.addColorStop(0, '#173c4c'); g.addColorStop(1, '#2c5c6c'); }
      else { g.addColorStop(0, '#2f5568'); g.addColorStop(0.4, '#6f97a8'); g.addColorStop(0.6, '#d5e4ea'); g.addColorStop(1, '#f4f8f8'); }
      // the forked tail, flicking
      ctx.save(); ctx.translate(-z * 0.34, 0); ctx.rotate(flex * 2);
      ctx.fillStyle = under ? '#173c4c' : '#4a7185';
      ctx.beginPath(); ctx.moveTo(z * 0.04, 0); ctx.lineTo(-z * 0.16, -z * 0.15); ctx.quadraticCurveTo(-z * 0.1, 0, -z * 0.16, z * 0.15); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(z * 0.48, z * 0.01);
      ctx.bezierCurveTo(z * 0.42, -z * 0.13, z * 0.05, -z * 0.17, -z * 0.34, -z * 0.03);
      ctx.lineTo(-z * 0.34, z * 0.03);
      ctx.bezierCurveTo(z * 0.05, z * 0.15, z * 0.42, z * 0.12, z * 0.48, z * 0.01);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = under ? '#173c4c' : '#406678';
      ctx.beginPath(); ctx.moveTo(z * 0.1, -z * 0.12); ctx.quadraticCurveTo(-z * 0.02, -z * 0.22, -z * 0.12, -z * 0.1); ctx.closePath(); ctx.fill();
      if (under) return;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(0.8, z * 0.014); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(z * 0.34, -z * 0.07); ctx.quadraticCurveTo(z * 0.1, -z * 0.12, -z * 0.18, -z * 0.05); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,60,70,0.35)'; ctx.lineWidth = Math.max(0.6, z * 0.008);
      ctx.beginPath(); ctx.moveTo(z * 0.3, -z * 0.09); ctx.quadraticCurveTo(z * 0.34, 0, z * 0.3, z * 0.08); ctx.stroke();
      ctx.fillStyle = '#16222a'; ctx.beginPath(); ctx.arc(z * 0.38, -z * 0.02, Math.max(0.8, z * 0.022), 0, TAU); ctx.fill();
    },
  };

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
        const p = waterSpot(L, 0.08, 0.55), kk = persp(L, p.y), z = L.m * 0.075 * kk;
        const T = rand(0.55, 0.7);
        return { x: p.x, wy: p.y, dir: Math.random() < 0.5 ? -1 : 1, z, D: z * rand(1.6, 2.4), H: z * rand(1.1, 1.7), T, kk, k0: 0.35, dur: 0.35 + T * 1.3 + 1.4, spray: [], foam: [] };
      },
      tick(s) { leapTick(s, 'fish'); },
      draw(ctx, L, s) { drawLeaper(ctx, s, 'fish'); },
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
      // a pod of two or three, porpoising in a long low arc one after another
      start(L) {
        const p = waterSpot(L, 0.07, 0.28), kk = persp(L, p.y), z = L.m * 0.15 * kk, dir = Math.random() < 0.5 ? -1 : 1;
        const n = Math.random() < 0.35 ? 3 : 2, pod = [];
        for (let i = 0; i < n; i++) {
          const zz = z * (i ? rand(0.82, 0.95) : 1), T = rand(0.95, 1.1);
          pod.push({ x: p.x - dir * i * z * rand(0.5, 0.9), wy: p.y + i * z * 0.04, dir, z: zz, D: zz * rand(1.9, 2.3), H: zz * rand(0.55, 0.7), T, kk, k0: 0.3 + i * rand(0.35, 0.5), spray: [], foam: [] });
        }
        return { pod, dur: Math.max(...pod.map(d => d.k0 + d.T * 1.3)) + 1.5 };
      },
      tick(s) {
        if (!s.w) { s.w = 1; api.play('whistle'); }
        for (const d of s.pod) { d.age = s.age; leapTick(d, 'dolphin'); }
      },
      draw(ctx, L, s) {
        // the nearer (lower on screen) drawn last
        for (const d of s.pod.slice().sort((a, b) => a.wy - b.wy)) drawLeaper(ctx, d, 'dolphin');
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

    /* A humpback surfacing. Its back rolls up through the water like the rim of a turning wheel: a
       swell and a dark shape first, then the head, a long arch of back with its small fin, a misty blow
       that drifts on the cold air, the arch rounding higher before it sounds, and the flukes lifting,
       pouring water, and sliding straight down into a smooth slick and rings. Nothing appears or
       vanishes: everything passes through the waterline. */
    whale: {
      layer: 'water',
      start(L) {
        const p = waterSpot(L, 0.05, 0.16), kk = persp(L, p.y), len = L.m * 0.42 * kk;
        return { cx: p.x, wy: p.y, dir: Math.random() < 0.5 ? -1 : 1, len, kk, dur: 11, mist: [], drops: [], fluke: null, blew: false };
      },
      tick(s) {
        const dt = Math.max(0, s.age - (s.last ?? s.age));
        s.last = s.age;
        if (s.age > 0.5 && !s.a) { s.a = 1; api.ripple(s.cx, s.wy, 2, 1.1 * s.kk); }
        if (s.age > 1.3 && !s.c) { s.c = 1; api.play('whale'); }
        const W = whalePose(s, s.age);
        if (!s.blew && W.blow) { s.blew = s.age; api.play('spout'); }
        // the blow: breath bursting from the blowhole for half a second, rising fast and slowing, each
        // puff spreading as it climbs, so a bushy column grows from the whale and drifts off
        if (s.blew && s.age - s.blew < 0.55 && W.blow) {
          const n = Math.round(dt * 70) + (Math.random() < (dt * 70) % 1 ? 1 : 0);
          for (let i = 0; i < n; i++) s.mist.push({ x: W.blow.x + rand(-0.01, 0.01) * s.len, y: W.blow.y, vx: rand(-0.18, 0.18) * s.len, vy: -rand(1.3, 2.0) * s.len, r: s.len * rand(0.012, 0.022), age: 0 });
        }
        for (const m of s.mist) { m.age += dt; m.vy *= Math.exp(-dt * 2.6); m.vx = m.vx * Math.exp(-dt * 1.5) + s.dir * s.len * 0.04 * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.r += s.len * 0.07 * dt; }
        s.mist = s.mist.filter(m => m.age < 3.2);
        // water pouring off the flukes as they lift
        const F = W.fluke;
        if (F && F.up > 0.25 && F.rising && Math.random() < dt * 60) {
          const u = rand(-1, 1);
          s.drops.push({ x: F.x + u * F.w * 0.5, y: F.y + F.h * (0.1 + 0.25 * Math.abs(u)), vx: u * s.len * 0.05, vy: 0 });
        }
        const g = s.len * 3;
        for (const d of s.drops) { d.vy += g * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
        s.drops = s.drops.filter(d => d.y < s.wy);
        if (F && F.sinkStart && !s.d) { s.d = 1; api.play('plop', 1); }
        if (F && F.under && !s.e) { s.e = 1; api.ripple(F.x, s.wy, 3, 1.2 * s.kk); api.splash({ x: F.x, y: s.wy }, 0.5 * s.kk); }
      },
      draw(ctx, L, s) { drawWhale(ctx, s); },
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
