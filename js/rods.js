/* Tidesong — rod art.
   A rod is modelled as a tapered tube laid along a bending spline: a thick grip, a metal reel seat, then a
   blank that tapers to a whippy tip. Everything on its surface (cork, cord, wood grain, thread wraps, helical
   stripes, frost, runes...) is baked once per rod into a texture in (u along the rod, v across it). Patterns
   are projected onto the round surface before baking, so stripes wrap round and curve near the edges, and
   their pitch follows the taper. Each frame the texture is drawn as slices along the bent spine and lit as a
   cylinder with a small per-material lighting atlas baked for the lake's light: diffuse with a dark core and
   a warm bounce on the shadow edge, a specular ridge toward the light, and a Fresnel rim for ice and glass.
   Guides, reel, tip ornaments, auras and particles go on top. Gear.paintRod calls RodArt.paint. */
'use strict';

const RodArt = (() => {
  const { rg, lgr, halo, starPath, twinkle, shading, toner, rgbOf, STUDIO } = Gear.art;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fract = x => x - Math.floor(x);
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  /* ================= Noise ================= */
  function hash2(i, j) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const hash1 = i => hash2(i, 9187);
  function vnoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 3) {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { s += vnoise(x, y) * a; n += a; a *= 0.5; x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; }
    return s / n;
  }
  const ridge = (x, y) => 1 - Math.abs(2 * vnoise(x, y) - 1);

  /* ================= Colour ================= */
  function col4(c) {
    if (!c) return [1, 1, 1, 1];
    if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; }
    const v = c.match(/[\d.]+/g).map(Number);
    return [v[0] / 255, v[1] / 255, v[2] / 255, v[3] ?? 1];
  }
  function stopsAt(cols, k) {
    const f = clamp(k, 0, 1) * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(f)), q = f - i, a = cols[i], b = cols[i + 1];
    return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q, 1];
  }
  const put = (o, c, k = 1) => { o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; };
  const blend = (o, c, k) => { if (k <= 0) return; o[0] += (c[0] - o[0]) * k; o[1] += (c[1] - o[1]) * k; o[2] += (c[2] - o[2]) * k; };
  const mul = (o, k) => { o[0] *= k; o[1] *= k; o[2] *= k; };
  const css = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(clamp(c[2], 0, 1) * 255)},${a})`;
  const shadeHex = (h, k) => { const c = col4(h); return css([c[0] * k, c[1] * k, c[2] * k]); };
  const liftHex = (h, k) => { const c = col4(h); return css([c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k]); };
  function hsl(h, s, l) {
    const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
  }

  /* ================= Looks =================
     What each rod is made of and what it carries, by id. Colours come from its catalogue entry in gear.js.
       mat    the blank's material          grip / seat   the grip's and reel seat's materials
       skin   patterns baked into the blank  profile       'rod' (default), 'stick' or 'loaf'
       aura   a drifting mist in an rgb colour ('hue' follows the aurora), drift -1 rises, 1 sinks
       motes  a pool of small particles      tipR          tip width as a share of the butt's */
  const LOOK = {
    willow: { mat: 'graphite', grip: 'cork', skin: ['weave'], wrap: '#2a2830' },
    birch: { mat: 'wood', grip: 'wood', seat: 'wood' },
    mariner: { mat: 'lacquer', grip: 'cord', skin: ['flake'] },
    splitcane: { mat: 'bamboo', grip: 'cork', seat: 'metal' },
    dragonbone: { mat: 'bone', grip: 'strap', skin: ['runes'], aura: { rgb: '255,110,60', drift: -1 }, motes: { kind: 'ember', n: 12 } },
    fetch: { mat: 'bark', grip: 'bark', seat: 'twine', profile: 'stick', wobble: 0.08, wrap: '#d8c9a3' },
    tabby: { mat: 'fur', grip: 'fur', seat: 'metal' },
    kingfisher: { mat: 'lacquer', grip: 'cord', skin: ['feathers'], aura: { rgb: '90,200,255', k: 0.7 }, motes: { kind: 'drop', n: 5 } },
    driftwood: { mat: 'drift', grip: 'rope', seat: 'wood', profile: 'stick', wobble: 0.05 },
    coral: { mat: 'lacquer', grip: 'pearl', skin: ['grain'] },
    surf: { mat: 'lacquer', grip: 'foam' },
    trident: { mat: 'pearl', grip: 'goldcord', skin: ['waves'], aura: { rgb: '120,230,220' }, motes: { kind: 'bubble', n: 10 } },
    alpine: { mat: 'wood', grip: 'strap', seat: 'wood' },
    evergreen: { mat: 'lacquer', grip: 'wood', skin: ['grain'] },
    glacier: { mat: 'ice', grip: 'foam', skin: ['frost'], aura: { rgb: '190,232,255', drift: 1 }, motes: { kind: 'ice', n: 12 } },
    sakura: { mat: 'bark', grip: 'bark', seat: 'wood', skin: ['lenticels'], motes: { kind: 'petal', n: 8 } },
    wisteria: { mat: 'pearl', grip: 'foam', motes: { kind: 'petal', n: 5, rgb: '206,176,245' } },
    ribbon: { mat: 'lacquer', grip: 'foam' },
    rose: { mat: 'stem', grip: 'velvet', aura: { rgb: '255,120,160', k: 0.8 }, motes: { kind: 'petal', n: 7, rgb: '235,60,95' } },
    twilight: { mat: 'lacquer', grip: 'cord', skin: ['flake'], motes: { kind: 'dust', n: 6, rgb: '255,236,200' } },
    aurora: { mat: 'glass', grip: 'foam', skin: ['curtains'], aura: { rgb: 'hue', k: 1.5 }, motes: { kind: 'dust', n: 8, rgb: '170,255,230' } },
    nebula: { mat: 'lacquer', grip: 'cord', skin: ['nebula', 'flake'], aura: { rgb: '200,140,255' }, motes: { kind: 'dust', n: 10, rgb: '230,200,255' } },
    starforged: { mat: 'lacquer', grip: 'cord', skin: ['filigree', 'flake'], aura: { rgb: '255,220,140', k: 0.8 }, motes: { kind: 'dust', n: 10, rgb: '255,236,180' } },
    horizon: { mat: 'obsidian', grip: 'cord', aura: { rgb: '255,150,70', k: 0.8 }, motes: { kind: 'infall', n: 12 } },
    candycane: { mat: 'candy', grip: 'candy', seat: 'candy', tipR: 0.42, motes: { kind: 'sugar', n: 10 } },
    baguette: { mat: 'crust', grip: 'crust', seat: 'paper', profile: 'loaf', skin: ['scoring', 'flour'], wrap: '#f2e8cf', motes: { kind: 'flour', n: 6 } },
    patisserie: { mat: 'macaron', grip: 'foam', skin: ['gold'], motes: { kind: 'sugar', n: 8, rgb: '255,226,150' } },
  };
  /* How each material takes the light. w: wrap of the diffuse; ks/p: specular strength and sharpness;
     kc/pc: a broad clear-coat sheen; fres: a Fresnel rim (fc its colour); env: a mirrored sky and ground;
     sheen: a soft grazing sheen (fur, velvet); irid: a pearly colour shift toward the edges. */
  const LIT = {
    lacquer: { w: 0.2, ks: 0.95, p: 64, kc: 0.18, pc: 8 },
    varnish: { w: 0.3, ks: 0.5, p: 42, kc: 0.08, pc: 7 },
    graphite: { w: 0.3, ks: 0.38, p: 28, kc: 0.07, pc: 5 },
    wood: { w: 0.3, ks: 0.18, p: 14 },
    satin: { w: 0.32, ks: 0.28, p: 12 },
    matte: { w: 0.32, ks: 0.06, p: 5 },
    fur: { w: 0.38, ks: 0.05, p: 4, sheen: 0.16 },
    metal: { w: 0.2, env: 1, ks: 1.05, p: 60 },
    candy: { w: 0.3, ks: 1.2, p: 170, kc: 0.3, pc: 14 },
    ice: { w: 0.6, ks: 0.95, p: 120, kc: 0.16, pc: 10, fres: 0.9, fc: [0.72, 0.9, 1] },
    glass: { w: 0.5, ks: 0.85, p: 95, kc: 0.12, pc: 8, fres: 0.6, fc: [0.85, 0.95, 1] },
    pearl: { w: 0.3, ks: 0.62, p: 55, kc: 0.14, pc: 7, irid: 0.3 },
    obsidian: { w: 0.15, ks: 1.15, p: 120, kc: 0.24, pc: 6 },
    bread: { w: 0.45, ks: 0.14, p: 9 },
    stem: { w: 0.4, ks: 0.34, p: 30 },
    bone: { w: 0.35, ks: 0.34, p: 22 },
  };
  const LIT_OF = {
    graphite: 'graphite', lacquer: 'lacquer', wood: 'varnish', bamboo: 'varnish', bone: 'bone', bark: 'matte', drift: 'matte', fur: 'fur',
    pearl: 'pearl', ice: 'ice', glass: 'glass', stem: 'stem', obsidian: 'obsidian', candy: 'candy', crust: 'bread', macaron: 'satin',
    cork: 'matte', foam: 'matte', strap: 'satin', cord: 'satin', goldcord: 'metal', rope: 'matte', velvet: 'fur', metal: 'metal',
    twine: 'matte', paper: 'matte',
  };

  /* ================= Model =================
     u runs from the butt (0) to the tip (1); a candy cane's crook carries on past 1. Parts along u: */
  const P_CAP = 0.022, P_GRIP = 0.19, P_CHECK = 0.2, P_HOODA = 0.212, P_SEAT = 0.26, P_HOODB = 0.272, P_FORE = 0.284;
  const BOUNDS = [P_CAP, P_GRIP, P_CHECK, P_HOODA, P_SEAT, P_HOODB, P_FORE];
  const GK = [0.42, 0.56, 0.68, 0.79, 0.88, 0.95];
  const U0 = 1536, V0 = 48, SPAN = 1.1, ASPECT = 48;
  // 0 cap, 1 grip, 2 winding check, 3 seat hood, 4 seat, 5 fore ring, 6 blank, 7 crook
  const regionOf = u => (u < P_CAP ? 0 : u < P_GRIP ? 1 : u < P_CHECK ? 2 : u < P_HOODA ? 3 : u < P_SEAT ? 4 : u < P_HOODB ? 3 : u < P_FORE ? 5 : u <= 1.0001 ? 6 : 7);
  const blankK = u => clamp((u - P_FORE) / (1 - P_FORE), 0, 1);

  /* The rod's width as a share of the butt's. */
  function shapeAt(u, R, tipR) {
    let r;
    if (R.profile === 'loaf') r = 1 - (1 - tipR) * Math.pow(Math.max(0, u - 0.38) / 0.62, 1.7);
    else if (R.profile === 'stick') r = 0.98 - (0.98 - tipR) * Math.pow(Math.max(0, u - 0.12) / 0.88, 1.1);
    else if (u < P_CAP) r = 0.93;
    else if (u < P_GRIP) r = 0.95 + 0.07 * Math.pow(Math.sin((Math.PI * (u - P_CAP)) / (P_GRIP - P_CAP)), 0.8);
    else if (u < P_CHECK) r = 0.88;
    else if (u < P_HOODA || (u >= P_SEAT && u < P_HOODB)) r = 0.84;
    else if (u < P_SEAT) r = 0.78;
    else if (u < P_FORE) r = 0.76 - ((u - P_HOODB) / (P_FORE - P_HOODB)) * 0.08;
    else r = tipR + (0.68 - tipR) * Math.pow(1 - Math.min(1, blankK(u)), 1.05);
    if (R.wob && u > 0.02 && u < 1) r *= 1 + R.wob * (vnoise(u * 26, 3.3) - 0.5) * 2;
    return r;
  }
  /* Thread wraps on the blank: a decorative butt wrap, one at each guide foot and one under the tip-top. */
  function wrapsOf() {
    const W = [[0.29, 0.312, 'butt']];
    GK.forEach((k, i) => { const f = 0.016 - i * 0.0018; W.push([k - f, k + f * 0.55, 'guide']); });
    W.push([0.984, 1.0, 'tip']);
    return W;
  }
  const WRAPS = wrapsOf();

  function derive(S) {
    const L = LOOK[S.id] || {};
    const decor = S.decor || [];
    const R = {
      id: S.id, mat: L.mat || 'lacquer', grip: L.grip || (S.cork ? 'cork' : 'foam'), seat: L.seat || 'metal', profile: L.profile || 'rod',
      wob: L.wobble || 0, tipR: L.tipR || null, tipR0: L.tipR || 0.16, uMax: S.tipStyle === 'curl' ? 1.2 : 1,
      skin: L.skin || [], aura: L.aura || null, motes: L.motes || null,
      wrapCol: L.wrap || S.wrap || S.seat, ringCol: L.ring || ((L.seat || 'metal') === 'metal' ? S.seat : '#c9ced6'),
    };
    R.rings = R.profile === 'rod';
    R.capLit = R.grip === 'candy' ? 'candy' : R.profile === 'loaf' ? 'bread' : R.profile === 'stick' ? 'matte' : 'metal';
    R.emits = R.skin.some(s => ['runes', 'curtains', 'nebula', 'filigree', 'frost'].includes(s)) || R.mat === 'ice';
    R.cols = {
      grip: col4(S.grip), seat: col4(S.seat), ring: col4(R.ringCol), wrap: col4(R.wrapCol), trim: col4(S.check || R.ringCol),
      blank: S.hue ? [[0.86, 0.9, 0.93, 1], [0.94, 0.96, 1, 1]] : (S.stops || S.blank).map(col4),
    };
    if (S.stripes) R.st = { col: col4(S.stripes.color), n: S.stripes.n, h: S.stripes.slant || 0, w: S.stripes.width || 0.3 };
    if (R.mat === 'macaron' && !R.st) R.st = { col: [1, 1, 1, 1], n: 11, h: 0, w: 0.12 };
    // decor painted onto the blank (bark, nodes, feathers, runes, frost...) lives in its look and texture;
    // what stands off it or gives off light stays live
    R.standoff = decor.filter(d => ['blossoms', 'leaves', 'boughs', 'wisteria', 'bow'].includes(d));
    if (S.id === 'rose') R.standoff.push('thorns');
    if (S.id === 'glacier') R.standoff.push('icicles');
    R.specks = decor.includes('specks');
    R.light = { blank: LIT_OF[R.mat] || 'lacquer', grip: LIT_OF[R.grip] || 'matte', seat: LIT_OF[R.seat] || 'metal' };
    if (S.gloss && R.light.blank === 'wood') R.light.blank = 'varnish';
    return R;
  }

  /* ---------- the surface, texel by texel ---------- */
  // c: u, s (across, -1..1), z (how much the surface faces us), th (angle round the tube), x and y (position
  // on the surface in butt widths, along and around), r (width share), k (share of the blank), ph (stripe phase)
  const SURF = {
    graphite(c, o) { put(o, c.col, 0.9 + fbm(c.x * 0.8, c.y * 9, 2) * 0.2); },
    lacquer(c, o) { put(o, c.col, 0.97 + vnoise(c.x * 3, c.y * 3) * 0.06); },
    wood(c, o) {
      const w = c.y * 5 + fbm(c.x * 0.12, c.y * 1.2, 3) * 4, late = sstep(0.6, 0.95, fract(w));
      put(o, c.col, 1.06 - late * 0.22 - vnoise(c.x * 0.6, c.y * 40) * 0.08);
    },
    drift(c, o) {
      const w = c.y * 7 + fbm(c.x * 0.1, c.y, 3) * 5, crack = 1 - sstep(0, 0.06, Math.abs(fract(w) - 0.5));
      put(o, c.col, 0.96 + (fbm(c.x * 0.5, c.y * 4, 3) - 0.5) * 0.25 - crack * 0.38);
      blend(o, [0.78, 0.78, 0.76], 0.18);
    },
    bark(c, o) {
      const f = fbm(c.x * 0.28, c.y * 6, 4), fis = sstep(0.42, 0.28, f);
      put(o, c.col, 0.95 + (f - 0.5) * 0.45 - fis * 0.32);
      // rubbed bare in places, showing paler wood
      const bare = sstep(0.64, 0.72, fbm(c.x * 0.09 + 5, c.y * 0.8, 3));
      blend(o, [Math.min(1, c.col[0] * 1.7), Math.min(1, c.col[1] * 1.6), Math.min(1, c.col[2] * 1.4)], bare * 0.75);
      // knots
      for (const kx of [14, 23, 31, 39]) {
        const d = Math.hypot((c.x - kx) * 0.8, (c.y - 0.12) * 2.4);
        if (d < 0.5) { mul(o, 0.55 + d * 0.9); if (Math.abs(d - 0.34) < 0.05) mul(o, 1.25); }
      }
    },
    bamboo(c, o) {
      put(o, c.col, 0.94 + vnoise(c.x * 0.3, c.y * 30) * 0.1);
      // six strips glued edge to edge: their seams, a slight facet to each, and staggered nodes
      const face = Math.floor((c.th + Math.PI / 2) / (Math.PI / 3));
      mul(o, [0.95, 1.03, 0.98, 1.02, 0.96, 1][clamp(face, 0, 5)]);
      for (const a of [-Math.PI / 6, Math.PI / 6]) mul(o, 1 - 0.28 * Math.exp(-(((c.th - a) / 0.035) ** 2)));
      const dn = Math.abs(fract((c.x - face * 1.1) / 6.4) - 0.5) * 6.4;
      if (dn < 0.16) mul(o, dn < 0.07 ? 0.72 : 1.16);
    },
    bone(c, o) {
      put(o, c.col, 0.92 + (fbm(c.x * 1.2, c.y * 5, 3) - 0.5) * 0.3);
      const v = fract(c.x / 1.4);
      mul(o, v < 0.07 ? 0.6 : v < 0.16 ? 1.14 : 1);
      if (ridge(c.x * 0.3, c.y * 3) > 0.94) mul(o, 0.7);
    },
    fur(c, o) { put(o, c.col, 0.9 + fbm(c.x * 0.4, c.y * 14, 2) * 0.22); },
    pearl(c, o) {
      put(o, c.col, 0.96 + fbm(c.x * 0.5, c.y * 2, 2) * 0.08);
      const n = vnoise(c.x * 0.4, c.y * 2.5);
      o[0] += (n - 0.5) * 0.05; o[2] += (0.5 - n) * 0.05;
    },
    ice(c, o, e) {
      put(o, c.col, 1);
      o[0] *= 1 - c.z * 0.42; o[1] *= 1 - c.z * 0.14;                                  // thicker ice through the middle is bluer
      const crack = sstep(0.9, 0.97, ridge(c.x * 0.22, c.y * 1.6 + 2) * 0.7 + ridge(c.x * 0.5, c.y * 3) * 0.3);
      blend(o, [1, 1, 1], crack * 0.75);
      const bx = Math.floor(c.x / 0.3), by = Math.floor(c.y / 0.3 + 10), h = hash2(bx, by);
      if (h > 0.86) {
        const d = Math.hypot(fract(c.x / 0.3) - 0.5, fract(c.y / 0.3 + 10) - 0.5), rr = 0.08 + (h - 0.86) * 1.2;
        if (d < rr) blend(o, [1, 1, 1], d > rr * 0.6 ? 0.8 : 0.25);
      }
      blend(o, [0.92, 0.97, 1], Math.pow(1 - c.z, 2) * 0.55);                             // whiter toward the edges
      e[0] += 0.05 * c.z; e[1] += 0.13 * c.z; e[2] += 0.2 * c.z;
    },
    glass(c, o) {
      put(o, c.col, 0.82 + Math.pow(vnoise(c.x * 1.4, 0.5), 2) * 0.12 + (1 - c.z) * 0.12);
    },
    stem(c, o) {
      put(o, c.col, 0.9 + vnoise(c.x * 0.5, c.y * 18) * 0.14);
      if (Math.abs(Math.sin(c.th * 5 + vnoise(c.x * 0.2, 1) * 2)) < 0.12) mul(o, 1.14);   // fine veins along the stem
      const node = Math.abs(fract(c.x / 4.8 + 0.3) - 0.5) * 4.8;
      if (node < 0.12) mul(o, 0.9 + node * 0.8);
    },
    obsidian(c, o) {
      put(o, c.col, 0.9 + fbm(c.x * 0.3, c.y * 2, 3) * 0.25);
      const n = fbm(c.x * 0.15 + 3, c.y * 1.5, 2);
      o[0] += n * 0.05; o[2] += n * 0.09;
    },
    candy(c, o) { put(o, c.col, 0.97 + vnoise(c.x * 1.2, c.y * 3) * 0.04); },
    crust(c, o) {
      const f = fbm(c.x * 0.35, c.y * 2.5, 4);
      put(o, c.col, 0.86 + f * 0.3);
      const h = hash2(Math.floor(c.x / 0.22), Math.floor(c.y / 0.22 + 20));
      if (h > 0.8) { const d = Math.hypot(fract(c.x / 0.22) - 0.5, fract(c.y / 0.22 + 20) - 0.5); if (d < 0.3) mul(o, d < 0.18 ? 1.12 : 0.82); }
      if (vnoise(c.x * 6, c.y * 6) > 0.82) mul(o, 0.85);
    },
    macaron(c, o, e, R) {
      const b = Math.floor(c.ph), f = fract(c.ph), cols = R.cols.blank;
      put(o, cols[((b % cols.length) + cols.length) % cols.length], 1);
      const n = vnoise(c.x * 4, c.y * 4);
      if ((f > 0.4 && f < 0.45) || (f > 0.55 && f < 0.6)) mul(o, 1.08 + vnoise(c.x * 30, c.y * 12) * 0.12);  // the ruffled feet
      else if (f >= 0.45 && f <= 0.55) put(o, [[1, 0.97, 0.92], [0.98, 0.9, 0.95], [0.97, 0.98, 0.9]][((b % 3) + 3) % 3], 0.98 + n * 0.04);
      else mul(o, 0.97 + n * 0.06);
      if (f < 0.025 || f > 0.975) mul(o, 0.72);
    },
  };
  const SKIN = {
    weave(c, o) { const k = (Math.floor(c.x / 0.12 + c.th * 0.6) + Math.floor(c.x / 0.12 - c.th * 0.6)) & 1; mul(o, k ? 0.95 : 1.04); },
    flake(c, o) { if (hash2(Math.floor(c.x * 30), Math.floor(c.th * 22)) > 0.985) mul(o, 1.7); },
    grain(c, o) { const w = c.y * 4 + fbm(c.x * 0.1, c.y, 3) * 3; mul(o, 0.95 + 0.07 * fract(w)); },
    lenticels(c, o) {
      const cell = Math.floor(c.x / 0.42), h = hash1(cell), xc = (cell + 0.25 + h * 0.5) * 0.42;
      if (Math.abs(c.x - xc) < 0.035 && fract(c.th * 0.9 + h * 3) < 0.55) blend(o, [0.78, 0.55, 0.45], 0.7);
    },
    feathers(c, o) {
      const row = Math.floor(c.x / 0.42), cw = Math.PI / 5, off = (row & 1) * 0.5;
      const fx = fract(c.x / 0.42), fy = fract(c.th / cw + off) - 0.5, d = Math.hypot(fy, fx * 0.8);
      mul(o, 0.86 + 0.26 * sstep(0.15, 0.5, d));
      if (Math.abs(d - 0.5) < 0.06) blend(o, [0.62, 0.95, 1], 0.45);
    },
    waves(c, o) {
      const dx = fract(c.x / 2.2 + 0.18 * Math.sin(c.th * 3));
      if (dx < 0.035 || Math.abs(dx - 0.12) < 0.012) blend(o, [1, 0.85, 0.45], 0.9);
    },
    frost(c, o, e) {
      const zone = sstep(0.42, 0.66, fbm(c.x * 0.12, c.y * 0.5 + 3, 2));
      const fr = sstep(0.8, 0.95, ridge(c.x * 1.6, c.y * 5) * 0.6 + ridge(c.x * 3.4 + 7, c.y * 10) * 0.4) * zone;
      blend(o, [0.97, 0.99, 1], fr);
      if (fr > 0.5 && hash2(Math.floor(c.x * 12), Math.floor(c.y * 30)) > 0.93) { e[0] += 0.7; e[1] += 0.8; e[2] += 0.9; }
    },
    runes(c, o, e) {
      for (let i = 0; i < 9; i++) {
        const xc = (0.33 + i * 0.07) * ASPECT;
        if (Math.abs(c.x - xc) > 0.5) continue;
        const gx = (c.x - xc) / 0.42, gy = c.th / 0.75;
        if (Math.abs(gy) > 1.25) continue;
        let d = 9;
        for (let j = 0; j < 4; j++) {
          const p = (n) => [((hash2(i * 7 + j, n) * 3) | 0) - 1, ((hash2(i * 7 + j, n + 5) * 3) | 0) - 1];
          const [ax, ay] = p(1), [bx, by] = p(2);
          if (ax === bx && ay === by) continue;
          const vx = bx - ax, vy = by - ay, q = clamp(((gx - ax) * vx + (gy - ay) * vy) / (vx * vx + vy * vy), 0, 1);
          d = Math.min(d, Math.hypot(gx - ax - vx * q, gy - ay - vy * q));
        }
        if (d < 0.2) { mul(o, 0.55); const g = 1 - d / 0.2; e[0] += g; e[1] += g * 0.55; e[2] += g * 0.15; }
      }
    },
    curtains(c, o, e) {
      const ray = Math.pow(vnoise(c.x * 1.3, 0.5 + c.th * 0.3), 2.2) * (0.4 + 0.6 * c.z);
      const hc = hsl((150 + vnoise(c.x * 0.08, 2) * 160) % 360, 0.9, 0.62);
      const core = 0.35 * c.z;   // the glass glows through its whole thickness, brightest in its rays
      e[0] += hc[0] * (ray * 0.9 + core); e[1] += hc[1] * (ray * 0.9 + core); e[2] += hc[2] * (ray * 0.9 + core);
    },
    nebula(c, o, e, R) {
      const n = fbm(c.x * 0.22 + fbm(c.x * 0.08, c.y * 1.2, 2) * 2.5, c.y * 1.6, 3);
      blend(o, stopsAt(R.cols.blank, n * 1.2 - 0.1), 0.6);
      const g = sstep(0.58, 0.8, n), t2 = sstep(0.6, 0.82, fbm(c.x * 0.3 + 9, c.y * 2, 3));
      e[0] += g * 0.55 + t2 * 0.1; e[1] += g * 0.18 + t2 * 0.45; e[2] += g * 0.5 + t2 * 0.6;
    },
    filigree(c, o, e) {
      const a = 0.85 * Math.sin(c.x * 1.9), d = Math.min(Math.abs(c.th - a), Math.abs(c.th + a));
      const dot = Math.abs(fract(c.x * 1.9 / Math.PI) - 0.5) < 0.04 && Math.abs(c.th) < 0.12;
      if (d < 0.06 || dot) { blend(o, [1, 0.82, 0.42], 0.95); e[0] += 0.12; e[1] += 0.09; e[2] += 0.03; }
    },
    scoring(c, o) {
      for (let i = 0; i < 7; i++) {
        const xc = (0.33 + i * 0.09) * ASPECT, dx = c.x - xc;
        if (Math.abs(dx) > 1.6) continue;
        const a = dx * 0.88 - c.y * 0.47, b = dx * 0.47 + c.y * 0.88, q = (a / 1.15) ** 2 + (b / 0.17) ** 2;
        if (q < 1) put(o, [0.97, 0.86, 0.6], 0.92 + vnoise(c.x * 8, c.y * 8) * 0.1);
        else if (q < 1.9 && b > 0) mul(o, 0.72 + (q - 1) * 0.3);
      }
    },
    flour(c, o) {
      const dust = sstep(0.55, 0.78, fbm(c.x * 0.5, c.y * 3 + 9, 3)) * sstep(-0.3, 0.6, c.s);
      blend(o, [0.99, 0.97, 0.92], dust * 0.85);
      if (hash2(Math.floor(c.x * 14), Math.floor(c.y * 30)) > 0.97) blend(o, [1, 1, 0.97], 0.8);
    },
    gold(c, o) {
      const cx = Math.floor(c.x / 0.6), cy = Math.floor(c.th / 0.7 + 5), h = hash2(cx, cy);
      if (h < 0.8) return;
      const d = Math.hypot(fract(c.x / 0.6) - 0.5, (fract(c.th / 0.7 + 5) - 0.5) * 0.9) + (vnoise(c.x * 9, c.y * 9) - 0.5) * 0.18;
      if (d < 0.22) put(o, [1, 0.84, 0.45], 0.9 + vnoise(c.x * 20, c.y * 20) * 0.25);
    },
  };
  const GRIP = {
    cork(c, o) {
      const ring = Math.floor(c.x / 0.55);
      put(o, c.col, 0.9 + hash1(ring) * 0.16 + (fbm(c.x * 2, c.y * 2, 2) - 0.5) * 0.1);
      if (fract(c.x / 0.55) < 0.035) mul(o, 0.78);
      const p = vnoise(c.x * 9, c.y * 9);
      if (p > 0.8) mul(o, 0.62); else if (vnoise(c.x * 4 + 9, c.y * 4) > 0.82) mul(o, 1.08);
    },
    foam(c, o) { put(o, c.col, 0.97 + (vnoise(c.x * 4, c.y * 4) - 0.5) * 0.08); if (vnoise(c.x * 14, c.y * 14) > 0.86) mul(o, 0.86); },
    wood(c, o) { SURF.wood(c, o); },
    bark(c, o) { SURF.bark(c, o); },
    fur(c, o) { SURF.fur(c, o); },
    crust(c, o) { SURF.crust(c, o); },
    pearl(c, o) { SURF.pearl(c, o); },
    strap(c, o) {
      const f = fract(c.x / 0.55 + c.th / TAU);
      put(o, c.col, (f < 0.08 ? 0.62 + (f / 0.08) * 0.38 : f < 0.3 ? 1.06 : 1) * (0.94 + vnoise(c.x * 7, c.y * 7) * 0.12));
    },
    cord(c, o) {
      const f = fract(c.x / 0.13 + (c.th / TAU) * 1.5);
      put(o, c.col, 0.7 + 0.34 * Math.pow(Math.sin(Math.PI * f), 0.7) + (vnoise(c.x * 20, c.y * 20) - 0.5) * 0.06);
    },
    goldcord(c, o) { GRIP.cord(c, o); },
    velvet(c, o) {
      const f = fract(c.x / 0.42 + c.th / TAU);
      put(o, c.col, (f < 0.07 ? 0.6 : 0.95 + Math.sin(Math.PI * f) * 0.08) * (0.95 + vnoise(c.x * 12, c.y * 12) * 0.1));
    },
    rope(c, o) {
      const f = fract(c.x / 0.34 + (c.th / TAU) * 2);
      put(o, c.col, 0.66 + 0.4 * Math.pow(Math.sin(Math.PI * f), 0.6));
      if (fract(c.x / 0.06 - c.th * 0.9) < 0.3) mul(o, 0.9);
    },
    candy(c, o) { put(o, c.col, 0.98); if (fract(c.x / 1.2 - (c.th / TAU) * 1.2) < 0.1) put(o, [1, 0.97, 0.97], 1); },
  };
  const SEAT = {
    metal(c, o) {
      put(o, c.col, 0.96 + vnoise(c.x * 0.3, c.y * 25) * 0.08);
    },
    wood(c, o) { SURF.wood(c, o); },
    twine(c, o) { put(o, [0.84, 0.77, 0.6], 0.72 + 0.32 * Math.sin(Math.PI * fract(c.x / 0.1 + c.th / TAU))); },
    paper(c, o) {
      put(o, c.col, 0.97 + vnoise(c.x * 5, c.y * 5) * 0.05);
      const d = Math.min(Math.abs(c.u - P_CHECK), Math.abs(c.u - P_HOODB));
      if (d > 0.004 && d < 0.008) put(o, [0.72, 0.18, 0.16], 1);
    },
    candy(c, o) { put(o, c.col, 0.98); if (fract(c.x / 0.5) < 0.16) put(o, [0.88, 0.16, 0.23], 1); },
  };
  function RING(c, o, e, R) {
    put(o, R.cols.ring, 0.95 + 0.08 * Math.sin((c.x / 0.07) * TAU));
    if (c.u >= P_CHECK && c.u < P_HOODA) { if (c.u > P_HOODA - 0.0018) mul(o, 0.6); }
    else if (c.u >= P_SEAT && c.u < P_HOODB) { if (c.u < P_SEAT + 0.0018) mul(o, 0.6); }
  }
  function CAP(c, o, e, R) {
    if (R.capLit === 'metal') { put(o, R.cols.ring, 0.9); if (c.u > P_CAP - 0.003) mul(o, 0.65); }
    else if (R.grip === 'candy') put(o, R.cols.grip, 0.95);
    else GRIP[R.grip] ? GRIP[R.grip](c, o) : put(o, R.cols.grip, 1);
  }
  /* Helical stripes: their phase runs along the rod and turns with the angle round it. */
  function STRIPE(c, o, R) {
    const st = R.st;
    let f = c.ph - (st.h * c.th) / TAU;
    const tab = R.id === 'tabby';
    if (tab) f += (fbm(c.x * 0.35, c.y * 2.2, 3) - 0.5) * 0.55 + (vnoise(c.x * 2, c.y * 16) - 0.5) * 0.08;
    const band = Math.floor(f);
    f -= band;
    const w = tab ? st.w * (0.7 + hash1(band) * 0.55) : st.w;
    const sd = f < w ? -Math.min(f, w - f) : Math.min(f - w, 1 - f), aa = R.stAA;
    const cov = 1 - sstep(-aa, aa, sd);
    if (R.id === 'ribbon' && cov > 0) {
      const g = clamp(f / w, 0, 1), sheen = 0.84 + 0.22 * Math.sin(Math.PI * g) + (g > 0.12 && g < 0.2 ? 0.1 : 0);
      blend(o, [st.col[0] * sheen, st.col[1] * sheen, st.col[2] * sheen], cov);
      return;
    }
    blend(o, st.col, cov * st.col[3]);
    if (R.grip === 'candy') {    // the thin second stripe beside each wide one
      const a = w + 0.07, b2 = w + 0.13, sd2 = f >= a && f < b2 ? -Math.min(f - a, b2 - f) : Math.min(Math.abs(f - a), Math.abs(f - b2));
      blend(o, [0.95, 0.42, 0.46], (1 - sstep(-aa, aa, sd2)) * 0.9);
    }
  }
  function WRAP(c, o, R) {
    const [a, b, kind] = c.wrap, inset = Math.min(c.u - a, b - c.u);
    put(o, R.cols.wrap, 0.9 + 0.12 * Math.sin((c.x / 0.11) * TAU));
    if (R.id === 'alpine' && kind !== 'tip') { if ((Math.floor(c.x / 0.16) + Math.floor(c.th / (Math.PI / 8))) & 1) put(o, R.cols.trim, 0.97); }
    else if (inset < 0.0024 && kind !== 'tip') put(o, R.cols.trim, 1);
    if (kind === 'butt' && Math.abs(c.u - (a + b) / 2) < 0.0016) put(o, R.cols.trim, 1);
    if (inset < 0.0008) mul(o, 0.7);
    o[3] = 1;
  }

  /* Bake the rod's albedo (and glow, if it has any) at three levels of detail. */
  function bake(S, R) {
    const U = Math.round(U0 * R.uMax), V = V0;
    const alb = new ImageData(U, V), A = alb.data;
    const em = R.emits ? new ImageData(U, V) : null, E = em && em.data;
    const SV = new Float32Array(V), ZV = new Float32Array(V), TH = new Float32Array(V);
    for (let ri = 0; ri < V; ri++) {
      const s = clamp(((ri + 0.5) / V * 2 - 1) * SPAN, -1, 1);
      SV[ri] = s; ZV[ri] = Math.sqrt(1 - s * s); TH[ri] = Math.asin(s);
    }
    // stripe phase: the pitch follows the taper (closer stripes where the blank is thin)
    let PH = null;
    if (R.st) {
      PH = new Float32Array(U);
      let acc = 0, at0 = 0, at1 = 0;
      for (let ci = 0; ci < U; ci++) {
        const u = ((ci + 0.5) / U) * R.uMax;
        if (u >= P_FORE) acc += 1 / Math.pow(shapeAt(Math.min(u, 1), R, R.tipR0), 0.5);
        PH[ci] = acc;
        if (u < 0.985) at1 = acc;
        if (u < P_FORE) at0 = acc;
      }
      const k = R.st.n / Math.max(1e-6, at1 - at0);
      for (let ci = 0; ci < U; ci++) PH[ci] *= k;
      R.stAA = Math.max(0.025, (R.st.n / (U * 0.7)) * 1.4);
    }
    const o = [0, 0, 0, 1], e = [0, 0, 0];
    const c = { u: 0, s: 0, z: 1, th: 0, x: 0, y: 0, r: 1, k: 0, ph: 0, col: null, wrap: null };
    const surf = SURF[R.mat] || SURF.lacquer, skins = R.skin.map(s => SKIN[s]).filter(Boolean);
    const blankFn = (c, o, e) => {
      surf(c, o, e, R);
      for (const f of skins) f(c, o, e, R);
      if (R.st && R.mat !== 'macaron') STRIPE(c, o, R);
      if (c.wrap) WRAP(c, o, R);
    };
    for (let ci = 0; ci < U; ci++) {
      const u = ((ci + 0.5) / U) * R.uMax, r = shapeAt(Math.min(u, 1), R, R.tipR0), reg = regionOf(u);
      c.u = u; c.r = r; c.k = blankK(u); c.ph = PH ? PH[ci] : 0;
      c.wrap = null;
      if (reg === 6 && R.profile !== 'loaf') for (const w of WRAPS) if (u >= w[0] && u <= w[1]) { c.wrap = w; break; }
      let fn, col;
      if (reg >= 6) { fn = blankFn; col = stopsAt(R.cols.blank, c.k); }
      else if (reg === 0) { fn = CAP; col = R.cols.grip; }
      else if (reg === 1) { fn = GRIP[R.grip] || GRIP.foam; col = R.cols.grip; }
      else if (reg === 4) { fn = SEAT[R.seat] || SEAT.metal; col = R.cols.seat; }
      else if (R.rings) { fn = RING; col = R.cols.ring; }
      else { fn = GRIP[R.grip] || GRIP.foam; col = R.cols.grip; }   // a stick or a loaf has no metal rings
      c.col = col;
      for (let ri = 0; ri < V; ri++) {
        c.s = SV[ri]; c.z = ZV[ri]; c.th = TH[ri]; c.x = u * ASPECT; c.y = TH[ri] * r * 0.5;
        o[3] = 1; e[0] = e[1] = e[2] = 0;
        fn(c, o, e, R);
        const i = (ri * U + ci) * 4;
        A[i] = o[0] * 255; A[i + 1] = o[1] * 255; A[i + 2] = o[2] * 255; A[i + 3] = o[3] * 255;
        if (E) { E[i] = e[0] * 255; E[i + 1] = e[1] * 255; E[i + 2] = e[2] * 255; E[i + 3] = 255; }
      }
    }
    const levels = img => {
      const c0 = document.createElement('canvas'); c0.width = img.width; c0.height = img.height;
      c0.getContext('2d').putImageData(img, 0, 0);
      const out = [c0];
      for (let j = 1; j < 3; j++) {
        const p = out[j - 1], c1 = document.createElement('canvas');
        c1.width = Math.ceil(p.width / 2); c1.height = Math.max(6, Math.ceil(p.height / 2));
        const x = c1.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(p, 0, 0, c1.width, c1.height);
        out.push(c1);
      }
      return out;
    };
    return { alb: levels(alb), emit: em ? levels(em) : null, U, V };
  }

  const models = {};
  function model(S) {
    let R = models[S.id];
    if (!R) { R = derive(S); R.tex = bake(S, R); models[S.id] = R; }
    return R;
  }

  /* ================= Lighting atlas =================
     Rods are lit in their own frame: the key comes from above the rod (along its upper normal), leaning
     toward the side the lake's light comes from, so every rod shows its round form with a specular ridge
     along the top, a dark core underneath and a warm bounce on the lower edge, whatever the scene.
     For a material under a light the atlas holds one column per direction a stretch of the rod can turn to
     (its normal's angle from the rod's overall upper normal) and one row per position across the tube.
     The top half multiplies the albedo (ambient + key × diffuse + bounce); the bottom half adds specular,
     clear coat, Fresnel and rim light. */
  const rodLights = new WeakMap();
  function rodLight(Lt) {
    let r = rodLights.get(Lt);
    if (!r) {
      const d = Lt.dir, h = Math.hypot(d[0], d[1]) || 1, lean = clamp(d[0] / h, -1, 1);
      let Ln = 0.8, Lu = lean * 0.45, Lz = 0.62;
      const lm = Math.hypot(Ln, Lu, Lz); Ln /= lm; Lu /= lm; Lz /= lm;
      r = { key: Lt.key, amb: Lt.amb, rim: Lt.rim || STUDIO.rim, night: Lt.night || 0, Ln, Lu, Lz };
      rodLights.set(Lt, r);
    }
    return r;
  }
  const atlasCache = new WeakMap();
  const AJ = 96;
  function atlas(name, RL) {
    let per = atlasCache.get(RL);
    if (!per) atlasCache.set(RL, (per = {}));
    if (per[name]) return per[name];
    const P = LIT[name] || LIT.lacquer, V = V0;
    const cv = document.createElement('canvas'); cv.width = AJ; cv.height = V * 2;
    const x = cv.getContext('2d'), img = x.createImageData(AJ, V * 2), d = img.data;
    const { Ln, Lu, Lz, amb, key, rim, night } = RL;
    let hn = Ln, hu = Lu, hz = Lz + 1;
    const hm = Math.hypot(hn, hu, hz); hn /= hm; hu /= hm; hz /= hm;
    const bounce = [key[0] * 0.95, key[1] * 0.72, key[2] * 0.5];
    for (let ci = 0; ci < AJ; ci++) {
      // the stretch's normal, as (along the rod's upper normal, along its length)
      const a = ((ci + 0.5) / AJ) * TAU - Math.PI, cn = Math.cos(a), cu = Math.sin(a), nl = cn * Ln + cu * Lu, nh = cn * hn + cu * hu;
      for (let ri = 0; ri < V; ri++) {
        const s = clamp(((ri + 0.5) / V * 2 - 1) * SPAN, -1, 1), z = Math.sqrt(1 - s * s), edge = 1 - z;
        const NL = s * nl + z * Lz, NH = Math.max(0, s * nh + z * hz);
        const back = Math.max(0, -s * nl) * Math.pow(edge, 1.2);
        const M = [0, 0, 0], A = [0, 0, 0];
        if (P.env) {
          // a mirror of the sky above the rod and the dark water below, with a bright horizon line between
          const up = 2 * z * s * cn;
          const env = up > 0 ? 0.62 + 0.4 * Math.min(1, up * 1.6) : 0.3 + 0.12 * Math.min(1, -up);
          const band = Math.exp(-(((up - 0.04) / 0.07) ** 2));
          for (let k = 0; k < 3; k++) {
            M[k] = env * (0.08 + amb[k] * 0.55 + key[k] * 0.55) + bounce[k] * back * 0.5;
            A[k] = key[k] * (P.ks * Math.pow(NH, P.p) + band * 0.3);
          }
        } else {
          const dif = Math.max(0, (NL + P.w) / (1 + P.w));
          for (let k = 0; k < 3; k++) {
            M[k] = (0.07 + amb[k] * 0.5 + key[k] * 0.66 * dif) * (1 - 0.3 * edge * edge * edge) + bounce[k] * back * 0.8;
            A[k] = key[k] * (P.ks * Math.pow(NH, P.p) + (P.kc || 0) * Math.pow(NH, P.pc || 8));
            if (P.sheen) A[k] += key[k] * P.sheen * edge * edge * (0.4 + dif);
          }
          if (P.fres) { const F = Math.pow(edge, 3) * P.fres; for (let k = 0; k < 3; k++) A[k] += P.fc[k] * F * (0.45 + 0.55 * key[k]); }
          if (P.irid) {
            const ph = edge * 3.2 + s * 0.6;
            A[0] += P.irid * edge * (0.5 + 0.5 * Math.sin(ph)) * 0.6; A[1] += P.irid * edge * (0.5 + 0.5 * Math.sin(ph + 2.1)) * 0.5; A[2] += P.irid * edge * (0.5 + 0.5 * Math.sin(ph + 4.2)) * 0.7;
          }
        }
        const rimK = (0.05 + 0.32 * night) * Math.pow(edge, 2.5) * Math.max(0, -s * nl) * 2;
        for (let k = 0; k < 3; k++) A[k] += rim[k] * rimK;
        const i = (ri * AJ + ci) * 4, j = ((ri + V) * AJ + ci) * 4;
        d[i] = Math.min(1, M[0]) * 255; d[i + 1] = Math.min(1, M[1]) * 255; d[i + 2] = Math.min(1, M[2]) * 255; d[i + 3] = 255;
        d[j] = A[0] * 255; d[j + 1] = A[1] * 255; d[j + 2] = A[2] * 255; d[j + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return (per[name] = cv);
  }

  /* ================= Geometry =================
     A cubic spine from butt to tip that bends mostly near the tip, resampled by arc length. Each station
     carries its position, tangent, normal (the rod's left side), u and width. */
  function mesh(base, tip, bend, t, w0, tipR, R, scale) {
    const dx = tip.x - base.x, dy = tip.y - base.y, len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len, b = bend * len;
    const c1x = base.x + dx * 0.34 + nx * b * 0.13, c1y = base.y + dy * 0.34 + ny * b * 0.13;
    const c2x = base.x + dx * 0.78 + nx * b * 0.26, c2y = base.y + dy * 0.78 + ny * b * 0.26;
    const F = 48, fx = new Float32Array(F + 1), fy = new Float32Array(F + 1), fl = new Float32Array(F + 1);
    for (let i = 0; i <= F; i++) {
      const q = i / F, v = 1 - q, a = v * v * v, bb = 3 * v * v * q, cc = 3 * v * q * q, d = q * q * q;
      fx[i] = a * base.x + bb * c1x + cc * c2x + d * tip.x;
      fy[i] = a * base.y + bb * c1y + cc * c2y + d * tip.y;
      if (i) fl[i] = fl[i - 1] + Math.hypot(fx[i] - fx[i - 1], fy[i] - fy[i - 1]);
    }
    const L = fl[F];
    const n = clamp(Math.round(L / 12), 14, 56);
    const us = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      if (!BOUNDS.some(bd => Math.abs(bd - u) < 0.006)) us.push(u);
    }
    us.push(...BOUNDS); us.sort((p, q) => p - q);
    const P = [];
    let j = 0;
    // under load the tip quivers: a small wave running down the rod
    const qv = clamp((bend - 0.24) * 3, 0, 1) * w0 * 0.22;
    for (const u of us) {
      const s = u * L;
      while (j < F - 1 && fl[j + 1] < s) j++;
      const seg = fl[j + 1] - fl[j] || 1, q = clamp((s - fl[j]) / seg, 0, 1);
      let x = fx[j] + (fx[j + 1] - fx[j]) * q, y = fy[j] + (fy[j + 1] - fy[j]) * q;
      if (qv) { const off = qv * Math.sin(u * 15 - t * 24) * u * u; x += nx * off; y += ny * off; }
      P.push({ x, y, u, w: w0 * shapeAt(u, R, tipR), tx: 0, ty: 0, nx: 0, ny: 0 });
    }
    const frame = () => {
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
        let tx = c.x - a.x, ty = c.y - a.y;
        const l = Math.hypot(tx, ty) || 1;
        tx /= l; ty /= l;
        P[i].tx = tx; P[i].ty = ty; P[i].nx = ty; P[i].ny = -tx;
      }
    };
    frame();
    // the candy cane's crook: carry the tube on round a tight curl
    if (R.uMax > 1) {
      const e = P[P.length - 1], Rh = w0 * 1.25, cx = e.x - e.nx * Rh, cy = e.y - e.ny * Rh, a0 = Math.atan2(e.y - cy, e.x - cx);
      const K = 12, sweep = Math.PI * 1.1;
      for (let i = 1; i <= K; i++) {
        const ph = (i / K) * sweep;
        P.push({ x: cx + Math.cos(a0 + ph) * Rh, y: cy + Math.sin(a0 + ph) * Rh, u: 1 + (Rh * ph) / L, w: e.w * (1 - (i / K) * 0.06), tx: 0, ty: 0, nx: 0, ny: 0 });
      }
      frame();
    }
    let iTip = P.findIndex(p => p.u >= 1);
    if (iTip < 0) iTip = P.length - 1;
    return { P, L, nx, ny, iTip, small: L * scale < 420 };
  }
  // a point on the rod at u, s across (-1..1, + on the rod's left)
  function sampleAt(M, u) {
    const P = M.P;
    let lo = 0, hi = P.length - 1;
    if (u <= P[0].u) return P[0];
    if (u >= P[hi].u) return P[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].u <= u) lo = mid; else hi = mid; }
    const a = P[lo], b = P[hi], q = (u - a.u) / (b.u - a.u || 1);
    const tx = a.tx + (b.tx - a.tx) * q, ty = a.ty + (b.ty - a.ty) * q, l = Math.hypot(tx, ty) || 1;
    return { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q, u, w: a.w + (b.w - a.w) * q, tx: tx / l, ty: ty / l, nx: ty / l, ny: -tx / l };
  }

  /* The rod's silhouette: along the left edge, round the tip, back along the right edge, round the butt. */
  function outline(ctx, M) {
    const P = M.P, n = P.length - 1;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const p = P[i], h = p.w / 2; ctx.lineTo(p.x + p.nx * h, p.y + p.ny * h); }
    const e = P[n];
    ctx.ellipse(e.x, e.y, Math.max(0.6, e.w * 0.5), e.w / 2, Math.atan2(e.ty, e.tx), -Math.PI / 2, Math.PI / 2);
    for (let i = n; i >= 0; i--) { const p = P[i], h = p.w / 2; ctx.lineTo(p.x - p.nx * h, p.y - p.ny * h); }
    const b = P[0];
    ctx.ellipse(b.x, b.y, b.w * 0.24, b.w / 2, Math.atan2(b.ty, b.tx), Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  }

  /* Map a slice of the lit strip over each stretch of the rod. A stretch spans two stations (the chord
     strays from the curve by well under a pixel); slices overlap by a pixel, which is harmless since the
     strip is opaque and already lit. */
  function slices(ctx, B, M, pick) {
    const P = M.P, n = P.length - 1;
    for (let i = 0; i < n;) {
      const j = Math.min(n, i + 2), a = P[i], b = P[j], src = pick(a, b), first = i === 0, last = j === n;
      i = j;
      const ax = b.x - a.x, ay = b.y - a.y, l = Math.hypot(ax, ay) || 1e-3;
      let nx = a.nx + b.nx, ny = a.ny + b.ny;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const w = Math.max(a.w, b.w) * SPAN * 1.02;
      // the first and last slices also run under the end caps
      const pre = first ? (a.w * 0.3) / l : 0, post = 1 + (last ? (b.w * 0.6 + 1) / l : 1.2 / l);
      const ox = a.x - nx * w * 0.5 - ax * pre, oy = a.y - ny * w * 0.5 - ay * pre, tx = nx * w, ty = ny * w;
      ctx.setTransform(B.a * ax + B.c * ay, B.b * ax + B.d * ay, B.a * tx + B.c * ty, B.b * tx + B.d * ty, B.a * ox + B.c * oy + B.e, B.b * ox + B.d * oy + B.f);
      ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, 0, 0, post + pre, 1);
    }
  }
  // a stretch's normal as an atlas column, measured from the rod's overall upper normal (fractional, so
  // neighbouring columns blend)
  const colOf = (nx, ny, M) => {
    const a = Math.atan2(-nx * M.ny + ny * M.nx, nx * M.nx + ny * M.ny);
    return clamp(((a + Math.PI) / TAU) * AJ, 0.5, AJ - 0.5);
  };
  const litName = (R, u) => {
    const g = regionOf(u);
    if (g >= 6) return R.light.blank;
    if (g === 0) return R.capLit;
    if (g === 1) return R.light.grip;
    if (g === 4) return R.light.seat;
    return R.rings ? 'metal' : R.profile === 'loaf' ? 'bread' : R.light.grip;
  };

  /* ================= The blank: textured, tinted, lit =================
     Each frame the rod's surface is lit unrolled, in a small strip (u across, v down) where every stretch's
     light is a plain rectangle with exact edges, then the lit strip is mapped onto the bent rod. */
  let strip = null;
  function stripCanvas(w, h) {
    if (!strip) { strip = document.createElement('canvas'); strip.width = 512; strip.height = 24; }
    if (strip.width < w || strip.height < h) { strip.width = Math.max(strip.width, w); strip.height = Math.max(strip.height, h); }
    return strip;
  }
  function drawBlank(ctx, B, S, R, M, RL, t, scale, w0) {
    const T = R.tex, P = M.P, n = P.length - 1;
    const Ws = clamp(Math.round(M.L * scale * R.uMax), 32, 2048), Vs = clamp(Math.ceil(w0 * scale * SPAN), 10, 48);
    const lv = clamp(Math.floor(Math.log2(T.U / Ws / 1.2)), 0, 2), alb = T.alb[lv];
    const cv = stripCanvas(Ws, Vs), x = cv.getContext('2d');
    const X = u => Math.round((Math.min(u, R.uMax) / R.uMax) * Ws);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'copy';
    x.drawImage(alb, 0, 0, alb.width, alb.height, 0, 0, Ws, Vs);
    // the aurora's colour, flowing along the glass
    if (S.hue) {
      x.globalCompositeOperation = 'multiply';
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[i + 1], x0 = X(a.u), x1 = X(b.u);
        if (a.u < P_FORE || x1 <= x0) continue;
        const kk = blankK(a.u);
        x.fillStyle = `hsl(${(165 + kk * 120 + Math.sin(t * 0.9 + kk * 3) * 35 + 360) % 360},85%,${70 - kk * 8}%)`;
        x.fillRect(x0, 0, x1 - x0, Vs);
      }
    }
    // light: diffuse multiplied in, then specular and rim added, one stretch at a time
    const lit = {}, cols = new Float32Array(n), names = new Array(n);
    for (let i = 0; i < n; i++) { const a = P[i], b = P[i + 1]; cols[i] = colOf(a.nx + b.nx, a.ny + b.ny, M); names[i] = litName(R, (a.u + b.u) / 2); }
    for (const half of [0, 1]) {
      x.globalCompositeOperation = half ? 'lighter' : 'multiply';
      for (let i = 0; i < n; i++) {
        const x0 = X(P[i].u), x1 = X(P[i + 1].u);
        if (x1 <= x0) continue;
        const A = lit[names[i]] || (lit[names[i]] = atlas(names[i], RL));
        x.drawImage(A, cols[i] - 0.25, half * V0, 0.5, V0, x0, 0, x1 - x0, Vs);
      }
    }
    // a glint that travels up a glossy blank now and then
    if (S.gloss) {
      const kc = ((t * 0.11) % 1.6) - 0.2;
      if (kc > 0.25 && kc < 1.05) for (let i = 0; i < n; i++) {
        const um = (P[i].u + P[i + 1].u) / 2, d = Math.abs(um - kc), x0 = X(P[i].u), x1 = X(P[i + 1].u);
        if (d > 0.07 || x1 <= x0) continue;
        x.globalAlpha = 0.7 * (1 - d / 0.07);
        x.drawImage(lit[names[i]], cols[i] - 0.25, V0, 0.5, V0, x0, 0, x1 - x0, Vs);
      }
      x.globalAlpha = 1;
    }
    // things that glow from within
    if (T.emit) {
      const E = T.emit[lv], k = E.width / Ws;
      for (let i = 0; i < n; i++) {
        const x0 = X(P[i].u), x1 = X(P[i + 1].u);
        if (x1 <= x0) continue;
        const um = (P[i].u + P[i + 1].u) / 2;
        const pulse = R.mat === 'ice' ? 0.55 + 0.45 * Math.sin(t * 1.6 - um * 9) : R.skin.includes('runes') ? 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 3 - um * 22), 2) : 0.6 + 0.4 * Math.sin(t * 1.2 - um * 7);
        x.globalAlpha = clamp(pulse, 0, 1);
        x.drawImage(E, x0 * k, 0, (x1 - x0) * k, E.height, x0, 0, x1 - x0, Vs);
      }
      x.globalAlpha = 1;
    }
    x.globalCompositeOperation = 'source-over';
    // map the lit strip onto the rod, inside its silhouette
    ctx.save();
    outline(ctx, M);
    ctx.clip();
    slices(ctx, B, M, (a, b) => {
      const sx = Math.min((Math.min(a.u, R.uMax) / R.uMax) * Ws, Ws - 0.5);
      return { img: cv, sx, sy: 0, sw: clamp(((Math.min(b.u, R.uMax) - Math.min(a.u, R.uMax)) / R.uMax) * Ws, 0.5, Ws - sx), sh: Vs };
    });
    ctx.setTransform(B);
    ctx.restore();
  }

  /* ================= Effects ================= */
  const blobs = {};
  function blob(rgb) {
    if (blobs[rgb]) return blobs[rgb];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = rg(x, 32, 32, 0, 32, [[0, `rgba(${rgb},0.9)`], [0.35, `rgba(${rgb},0.42)`], [0.7, `rgba(${rgb},0.1)`], [1, `rgba(${rgb},0)`]]);
    x.fillRect(0, 0, 64, 64);
    return (blobs[rgb] = c);
  }
  const hueRGB = t => { const c = hsl((165 + Math.round(((Math.sin(t * 0.9) * 35 + 60) % 360) / 15) * 15) % 360, 0.85, 0.62); return c.map(v => Math.round(v * 255)).join(','); };
  /* A mist of soft wisps that drift along the rod and dissolve in and out with noise, rather than a halo. */
  function aura(D, A) {
    const { ctx, t, M, w0 } = D, n = M.small ? 9 : 16, img = blob(A.rgb === 'hue' ? hueRGB(t) : A.rgb), k = A.k || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const h = hash1(i * 13 + 1), h2 = hash1(i * 7 + 3), sp = 0.018 + h2 * 0.014, f = fract(h + t * sp);
      const u = 0.3 + f * 0.72, p = sampleAt(M, Math.min(1, u)), s = (h2 - 0.5) * 1.8;
      const life = Math.sin(Math.PI * f), dens = sstep(0.3, 0.72, vnoise(u * 5 - t * 0.45, i * 1.7));
      const a = 0.34 * life * dens * k;
      if (a < 0.012) continue;
      const r = w0 * (1.0 + h * 1.5) * (1 - Math.min(1, u) * 0.4), dr = (A.drift || 0) * f * w0 * 1.6;
      ctx.globalAlpha = a;
      ctx.drawImage(img, p.x + p.nx * p.w * s - r, p.y + p.ny * p.w * s - r + dr, r * 2, r * 2);
    }
    ctx.restore();
  }

  /* Pooled particles: each slot loops through its life on its own phase, so the pool never grows. */
  const MOTES = {
    ice(D, p, f, h, i) {
      const { ctx, w0, t } = D, x = p.x + Math.sin(t * 1.3 + i) * w0 * 0.6 + f * w0 * 0.8, y = p.y + f * w0 * 4;
      const a = Math.sin(Math.PI * f), s = w0 * (0.16 + h * 0.14), rot = t * (0.6 + h) + i;
      ctx.strokeStyle = `rgba(235,248,255,${a * 0.85})`; ctx.lineWidth = Math.max(0.6, s * 0.22);
      ctx.beginPath();
      for (let j = 0; j < 3; j++) { const q = rot + (j * Math.PI) / 3, cx = Math.cos(q) * s, cy = Math.sin(q) * s; ctx.moveTo(x - cx, y - cy); ctx.lineTo(x + cx, y + cy); }
      ctx.stroke();
      if (fract(h * 7 + t * 0.7) < 0.12) twinkle(ctx, x, y, s * 1.4, a);
    },
    sugar(D, p, f, h, i, rgb) {
      const a = Math.pow(Math.sin(Math.PI * f), 3);
      if (a < 0.05) return;
      twinkle(D.ctx, p.x, p.y, D.w0 * (0.18 + h * 0.2) * (0.6 + a * 0.6), a, rgb ? `rgb(${rgb})` : '#ffffff');
    },
    ember(D, p, f, h, i) {
      const { ctx, w0, t } = D, x = p.x + Math.sin(t * 2 + i) * w0 * 0.5 + f * w0, y = p.y - f * w0 * 5;
      const a = (1 - f) * (0.6 + 0.4 * Math.sin(t * 13 + i * 3));
      ctx.fillStyle = `rgba(255,${150 + Math.round(h * 80)},70,${a})`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, w0 * (0.07 + h * 0.06)), 0, TAU); ctx.fill();
      halo(ctx, x, y, w0 * 0.5, '255,140,60', a * 0.25);
    },
    bubble(D, p, f, h, i) {
      const { ctx, w0, t } = D, x = p.x + Math.sin(t * 2.2 + i) * w0 * 0.35, y = p.y - f * w0 * 4.5, r = Math.max(1, w0 * (0.09 + h * 0.08));
      const a = Math.sin(Math.PI * f) * 0.8;
      ctx.strokeStyle = `rgba(210,255,250,${a})`; ctx.lineWidth = Math.max(0.6, r * 0.25);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU); ctx.fill();
    },
    petal(D, p, f, h, i, rgb) {
      const { ctx, w0, t } = D, x = p.x + f * w0 * 3 + Math.sin(t * 1.5 + i) * w0 * 0.5, y = p.y + f * w0 * 6;
      const a = Math.sin(Math.PI * Math.min(1, f * 1.2)) * 0.9, s = w0 * (0.2 + h * 0.12);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + i); ctx.scale(1, 0.45 + 0.4 * Math.sin(t * 3 + i));
      ctx.fillStyle = `rgba(${rgb || '255,180,205'},${a})`;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.9, s, -s * 0.15); ctx.lineTo(s * 0.7, 0); ctx.lineTo(s, s * 0.15); ctx.quadraticCurveTo(0, s * 0.9, -s, 0); ctx.fill();
      ctx.restore();
    },
    dust(D, p, f, h, i, rgb) {
      const { ctx, w0, t } = D, ang = h * TAU, x = p.x + Math.cos(ang) * f * w0 * 2, y = p.y + Math.sin(ang) * f * w0 * 2 - f * w0;
      const a = Math.sin(Math.PI * f) * (0.5 + 0.5 * Math.sin(t * 5 + i * 2));
      if (a < 0.05) return;
      ctx.fillStyle = `rgba(${rgb || '255,255,255'},${a})`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, w0 * 0.06), 0, TAU); ctx.fill();
      if (h > 0.6) twinkle(ctx, x, y, w0 * 0.22, a * 0.8, `rgb(${rgb || '255,255,255'})`);
    },
    infall(D, p, f, h, i) {
      const { ctx, w0 } = D, e = D.end, r0 = w0 * (2.2 + h * 2), r = r0 * Math.pow(1 - f, 1.4), a0 = h * TAU + f * 5.5;
      const x = e.x + Math.cos(a0) * r, y = e.y + Math.sin(a0) * r * 0.55;
      const x2 = e.x + Math.cos(a0 - 0.35) * r * 1.08, y2 = e.y + Math.sin(a0 - 0.35) * r * 1.08 * 0.55;
      ctx.strokeStyle = `rgba(255,${170 + Math.round(h * 70)},110,${Math.sin(Math.PI * f) * 0.85})`; ctx.lineWidth = Math.max(0.7, w0 * 0.07);
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
    },
    drop(D, p, f, h, i) {
      const { ctx, w0 } = D, e = D.end, x = e.x + (h - 0.5) * w0, y = e.y + f * f * w0 * 7, r = Math.max(0.9, w0 * 0.09);
      const a = f < 0.85 ? 0.85 : (1 - f) / 0.15 * 0.85;
      ctx.fillStyle = `rgba(200,240,255,${a})`;
      ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r); ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 2.2); ctx.fill();
    },
    flour(D, p, f, h, i) {
      const { ctx, w0, t } = D, x = p.x + f * w0 * 1.5 + Math.sin(t + i) * w0 * 0.3, y = p.y + f * w0 * 3, r = w0 * (0.25 + f * 0.4);
      halo(ctx, x, y, r, '255,250,236', Math.sin(Math.PI * f) * 0.18);
    },
  };
  function motes(D, Mo) {
    const n = D.M.small ? Math.ceil(Mo.n * 0.6) : Mo.n, fn = MOTES[Mo.kind];
    if (!fn) return;
    const { ctx, t, M } = D;
    ctx.save();
    if (Mo.kind === 'ember' || Mo.kind === 'infall' || Mo.kind === 'dust') ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const h = hash1(i * 31 + 7), rate = 0.12 + hash1(i * 5 + 2) * 0.16, f = fract(t * rate + h);
      const u = Mo.kind === 'sugar' ? 0.3 + hash1(i * 3 + Math.floor(t * rate + h)) * 0.68 : 0.34 + hash1(i * 17 + 1) * 0.64;
      const s = Mo.kind === 'sugar' ? (hash1(i * 9 + Math.floor(t * rate + h)) - 0.5) * 1.2 : (h - 0.5) * 1.4;
      const c = sampleAt(M, Math.min(u, 1));
      fn(D, { x: c.x + c.nx * c.w * 0.5 * s, y: c.y + c.ny * c.w * 0.5 * s }, f, h, i, Mo.rgb);
    }
    ctx.restore();
  }

  /* ================= Guides, line and tip-top ================= */
  function guideGeo(D) {
    const { M, w0 } = D;
    return GK.map((k, i) => {
      const p = sampleAt(M, k), R = Math.max(1.5, w0 * (0.36 - 0.04 * i)), off = p.w / 2 + R * 0.75 + R;
      return { k, p, R, x: p.x - p.nx * off, y: p.y - p.ny * off, two: i < 4 };
    });
  }
  function guideLegs(D, G, tone, S) {
    const { ctx, M } = D;
    ctx.lineCap = 'round';
    for (const g of G) {
      const top = { x: g.x + g.p.nx * g.R * 0.85, y: g.y + g.p.ny * g.R * 0.85 };
      const feet = g.two ? [-1, 1] : [-1];
      for (const d of feet) {
        const f = sampleAt(M, g.k + d * 0.009), fx = f.x - f.nx * f.w * 0.3, fy = f.y - f.ny * f.w * 0.3;
        const ex = top.x + g.p.tx * g.R * 0.32 * d, ey = top.y + g.p.ty * g.R * 0.32 * d;
        ctx.strokeStyle = 'rgba(12,12,14,0.6)'; ctx.lineWidth = Math.max(1.2, g.R * 0.34);
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = tone(S.guide); ctx.lineWidth = Math.max(0.6, g.R * 0.18);
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
  }
  /* A guide ring is a torus seen nearly edge-on: an ellipse long across the rod, drawn in two halves so the
     line can pass through it. Metal shaded toward the light, a dark ceramic insert, a catchlight. */
  function guideRings(D, G, half, tone, S) {
    const { ctx, sh } = D, gcol = col4(S.guide);
    for (const g of G) {
      const ang = Math.atan2(g.p.ty, g.p.tx), rx = g.R * 0.42, ry = g.R, tr = Math.max(0.8, g.R * 0.3);
      const a0 = half ? -Math.PI / 2 : Math.PI / 2, a1 = a0 + Math.PI;
      const lx = sh.lx, ly = sh.ly;
      ctx.strokeStyle = 'rgba(8,8,10,0.55)'; ctx.lineWidth = tr + 1.1;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, rx, ry, ang, a0, a1); ctx.stroke();
      ctx.strokeStyle = lgr(ctx, g.x + lx * g.R, g.y + ly * g.R, g.x - lx * g.R, g.y - ly * g.R, [[0, tone(css([gcol[0] + (1 - gcol[0]) * 0.6, gcol[1] + (1 - gcol[1]) * 0.6, gcol[2] + (1 - gcol[2]) * 0.6]))], [0.45, tone(S.guide)], [1, tone(css(gcol.map(v => v * 0.38)))]]);
      ctx.lineWidth = tr;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, rx, ry, ang, a0, a1); ctx.stroke();
      ctx.strokeStyle = 'rgba(28,24,22,0.85)'; ctx.lineWidth = Math.max(0.5, tr * 0.45);
      ctx.beginPath(); ctx.ellipse(g.x, g.y, rx * 0.66, ry * 0.7, ang, a0, a1); ctx.stroke();
      if (half) {
        // catchlight where the ring faces the light
        const lt = lx * g.p.tx + ly * g.p.ty, ln = lx * -g.p.nx + ly * -g.p.ny, q = Math.atan2(ln / ry, lt / rx);
        const cx = g.x + g.p.tx * rx * Math.cos(q) - g.p.nx * ry * Math.sin(q), cy = g.y + g.p.ty * rx * Math.cos(q) - g.p.ny * ry * Math.sin(q);
        ctx.fillStyle = `rgba(${rgbOf(sh.key, 1.3)},0.85)`;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, tr * 0.42), 0, TAU); ctx.fill();
      }
    }
  }
  function threadLine(D, G, from, lineCol) {
    const { ctx, w0, end } = D;
    ctx.strokeStyle = lineCol; ctx.lineWidth = Math.max(0.6, w0 * 0.055);
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    for (const g of G) ctx.lineTo(g.x, g.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  function tipTop(D, tone, S) {
    const { ctx, end, w0, t, sh } = D, r = Math.max(1.3, Math.min(end.w * 0.62, w0 * 0.15)), x = end.x + end.tx * r * 0.3, y = end.y + end.ty * r * 0.3;
    ctx.strokeStyle = 'rgba(8,8,10,0.5)'; ctx.lineWidth = Math.max(0.9, r * 0.5) + 0.8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = tone(S.guide); ctx.lineWidth = Math.max(0.9, r * 0.5);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    // the glint where the line ties off
    const g = 0.12 + 0.88 * Math.pow(Math.max(0, Math.sin(t * 1.9 + 1.3)), 6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    twinkle(ctx, x + sh.lx * r, y + sh.ly * r, w0 * 0.34 * (0.6 + g * 0.6), g * 0.9);
    ctx.restore();
  }

  /* ================= Reels =================
     Baked per rod, size and light into three layers: what sits under the turning face (shadow, side wall,
     bevelled rim, the recess and the wound line), the face that turns with the crank, and the light over it. */
  const reelCache = new WeakMap();
  function layer(D, rr, sc, draw) {
    const n = Math.ceil(rr * 3.6 * sc), c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d');
    x.translate(n / 2, n / 2); x.scale(sc, sc);
    draw(x);
    return c;
  }
  function noiseDisc(rr, sc, f) {
    const n = Math.ceil(rr * 2 * sc), c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'), img = x.createImageData(n, n), d = img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const px = (i + 0.5) / n * 2 - 1, py = (j + 0.5) / n * 2 - 1;
      if (px * px + py * py > 1.02) continue;
      const v = f(px, py), k = (j * n + i) * 4;
      d[k] = v[0] * 255; d[k + 1] = v[1] * 255; d[k + 2] = v[2] * 255; d[k + 3] = (v[3] ?? 1) * 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function reelLayers(S, rr, sc, sh, tone, lineCol, Lt) {
    let per = reelCache.get(Lt);
    if (!per) reelCache.set(Lt, (per = {}));
    const key = `${S.id}|${Math.round(rr * sc)}|${lineCol}`;
    if (per[key]) return per[key];
    const lx = sh.lx, ly = sh.ly, la = Math.atan2(ly, lx);
    const shadow = x => {
      x.fillStyle = rg(x, -lx * rr * 0.28, -ly * rr * 0.28 + rr * 0.1, rr * 0.4, rr * 1.32, [[0, 'rgba(0,0,0,0.34)'], [1, 'rgba(0,0,0,0)']]);
      x.beginPath(); x.arc(-lx * rr * 0.28, -ly * rr * 0.28 + rr * 0.1, rr * 1.32, 0, TAU); x.fill();
    };
    const lightOver = (x, r, a1 = 0.3, a2 = 0.34) => {
      x.fillStyle = lgr(x, lx * r, ly * r, -lx * r, -ly * r, [[0, `rgba(255,255,255,${a1})`], [0.5, 'rgba(255,255,255,0)'], [0.55, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${a2})`]]);
      x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
    };
    let L;
    switch (S.reelStyle) {
      case 'tennis': {
        const felt = noiseDisc(rr, sc, (px, py) => { const n = vnoise(px * 18 + 3, py * 18) * 0.6 + vnoise(px * 40, py * 40) * 0.4; return [0.78 + n * 0.2, 0.9 + n * 0.08, 0.2 + n * 0.12]; });
        L = {
          under: layer(null, rr, sc, shadow),
          face: layer(null, rr, sc, x => {
            x.save(); x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.clip();
            x.drawImage(felt, -rr, -rr, rr * 2, rr * 2);
            for (const d of [-1, 1]) {
              x.strokeStyle = 'rgba(80,90,20,0.35)'; x.lineWidth = rr * 0.2;
              x.beginPath(); x.arc(d * rr * 1.25, 0, rr * 0.95, d > 0 ? Math.PI - 0.8 : -0.8, d > 0 ? Math.PI + 0.8 : 0.8); x.stroke();
              x.strokeStyle = tone('#f6f6ea'); x.lineWidth = rr * 0.12;
              x.beginPath(); x.arc(d * rr * 1.25, 0, rr * 0.95, d > 0 ? Math.PI - 0.8 : -0.8, d > 0 ? Math.PI + 0.8 : 0.8); x.stroke();
            }
            x.restore();
          }),
          over: layer(null, rr, sc, x => {
            x.fillStyle = rg(x, lx * rr * 0.35, ly * rr * 0.35, rr * 0.05, rr * 1.2, [[0, 'rgba(255,255,230,0.3)'], [0.5, 'rgba(0,0,0,0)'], [0.85, 'rgba(30,40,0,0.3)'], [1, 'rgba(20,30,0,0.5)']]);
            x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.fill();
            x.strokeStyle = 'rgba(240,255,170,0.35)'; x.lineWidth = rr * 0.06;
            x.beginPath(); x.arc(0, 0, rr * 0.98, la - 0.9, la + 0.9); x.stroke();
          }),
          arm: 0.55,
        };
        break;
      }
      case 'shell': {
        L = {
          under: layer(null, rr, sc, shadow), face: null, arm: 0.35,
          over: layer(null, rr, sc, x => {
            x.translate(0, rr * 0.35);
            const R = rr * 1.2, ribs = 9;
            for (let i = 0; i < ribs; i++) {
              const a0 = Math.PI + (i / ribs) * Math.PI, a1 = Math.PI + ((i + 1) / ribs) * Math.PI, am = (a0 + a1) / 2;
              const facing = Math.cos(am - la);
              x.fillStyle = lgr(x, Math.cos(a0) * R * 0.5, Math.sin(a0) * R * 0.5, Math.cos(a1) * R * 0.5, Math.sin(a1) * R * 0.5, [[0, tone('#e8a8a0')], [0.5, tone(facing > 0 ? '#fff4ef' : '#f8d0c6')], [1, tone('#d88a86')]]);
              x.beginPath(); x.moveTo(0, 0);
              x.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
              x.quadraticCurveTo(Math.cos(am) * R * 1.1, Math.sin(am) * R * 1.1, Math.cos(a1) * R, Math.sin(a1) * R);
              x.closePath(); x.fill();
            }
            x.strokeStyle = 'rgba(150,70,70,0.35)'; x.lineWidth = 0.8;
            for (let j = 1; j < 4; j++) { x.beginPath(); x.arc(0, 0, R * j * 0.25, Math.PI, TAU); x.stroke(); }
            x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.ellipse(lx * R * 0.4, -R * 0.55, R * 0.22, R * 0.08, -0.4, 0, TAU); x.fill();
            x.fillStyle = tone('#e8b0a6');
            x.beginPath(); x.moveTo(-R * 0.3, 0); x.lineTo(R * 0.3, 0); x.lineTo(R * 0.2, R * 0.22); x.lineTo(-R * 0.2, R * 0.22); x.closePath(); x.fill();
          }),
        };
        break;
      }
      case 'brie': {
        const rind = noiseDisc(rr, sc, (px, py) => { const n = fbm(px * 6 + 2, py * 6, 3); return [0.96 + n * 0.04, 0.94 + n * 0.04, 0.86 + n * 0.06]; });
        L = {
          under: layer(null, rr, sc, x => {
            shadow(x);
            x.fillStyle = tone('#e2d3b0'); x.beginPath(); x.arc(-lx * rr * 0.14, -ly * rr * 0.14, rr, 0, TAU); x.fill();
          }),
          face: layer(null, rr, sc, x => {
            x.save(); x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.clip();
            x.drawImage(rind, -rr, -rr, rr * 2, rr * 2);
            x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, rr * 1.01, -0.5, 0.25); x.closePath();
            x.fillStyle = lgr(x, 0, 0, rr, 0, [[0, tone('#fbefc0')], [1, tone('#f2d98a')]]); x.fill();
            x.strokeStyle = 'rgba(150,120,60,0.35)'; x.lineWidth = rr * 0.05; x.stroke();
            x.fillStyle = 'rgba(200,170,90,0.35)';
            for (const [a, d] of [[-0.25, 0.5], [0.05, 0.72], [-0.38, 0.8]]) { x.beginPath(); x.arc(Math.cos(a) * rr * d, Math.sin(a) * rr * d, rr * 0.05, 0, TAU); x.fill(); }
            x.restore();
          }),
          over: layer(null, rr, sc, x => {
            lightOver(x, rr, 0.22, 0.2);
            x.strokeStyle = 'rgba(190,170,130,0.6)'; x.lineWidth = rr * 0.1; x.beginPath(); x.arc(0, 0, rr * 0.95, 0, TAU); x.stroke();
          }),
          arm: 0.5,
        };
        break;
      }
      case 'macaron': {
        L = {
          under: layer(null, rr, sc, shadow), face: null, arm: 0.35,
          over: layer(null, rr, sc, x => {
            const shell = (y, flip) => {
              x.beginPath(); x.ellipse(0, y, rr, rr * 0.46, 0, flip ? 0 : Math.PI, flip ? Math.PI : TAU); x.closePath();
              x.fillStyle = lgr(x, 0, y - rr * 0.46, 0, y + rr * 0.46, [[0, tone('#ffd2e2')], [0.5, tone('#ffaccb')], [1, tone('#e886aa')]]); x.fill();
              // the ruffled foot
              x.fillStyle = tone('#ffc6da');
              for (let i = -6; i <= 6; i++) { x.beginPath(); x.arc((i / 6.4) * rr, y + (flip ? 1 : -1) * rr * 0.02, rr * 0.1, 0, TAU); x.fill(); }
            };
            shell(rr * 0.36, true);
            x.fillStyle = lgr(x, 0, -rr * 0.1, 0, rr * 0.3, [[0, tone('#fffaf0')], [1, tone('#f0e2cc')]]);
            x.beginPath(); x.ellipse(0, rr * 0.1, rr * 0.9, rr * 0.2, 0, 0, TAU); x.fill();
            shell(-rr * 0.12, false);
            x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.ellipse(-rr * 0.35, -rr * 0.38, rr * 0.3, rr * 0.08, -0.15, 0, TAU); x.fill();
          }),
        };
        break;
      }
      default: {
        const [c0, c1, c2] = S.reel, line = lineCol || 'rgba(240,236,226,0.85)';
        L = {
          under: layer(null, rr, sc, x => {
            shadow(x);
            // the drum's side wall, toward the shadow
            x.fillStyle = lgr(x, lx * rr, ly * rr, -lx * rr, -ly * rr, [[0, tone(c1)], [1, tone(c2)]]);
            x.beginPath(); x.arc(-lx * rr * 0.16, -ly * rr * 0.16, rr, 0, TAU); x.fill();
            // bevelled rim
            x.fillStyle = rg(x, 0, 0, rr * 0.8, rr, [[0, tone(c2)], [0.2, tone(c0)], [0.55, tone(c1)], [1, tone(c2)]]);
            x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.fill();
            // the recess and the line wound on the spool
            x.fillStyle = '#121010'; x.beginPath(); x.arc(0, 0, rr * 0.84, 0, TAU); x.fill();
            x.fillStyle = line; x.beginPath(); x.arc(0, 0, rr * 0.81, 0, TAU); x.fill();
            x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 0.6;
            for (let r = 0.73; r < 0.81; r += 0.025) { x.beginPath(); x.arc(0, 0, rr * r, 0, TAU); x.stroke(); }
            // the rim shades the recess on the side the light comes from
            x.fillStyle = lgr(x, lx * rr * 0.84, ly * rr * 0.84, -lx * rr * 0.84, -ly * rr * 0.84, [[0, 'rgba(0,0,0,0.55)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(255,255,255,0.12)']]);
            x.beginPath(); x.arc(0, 0, rr * 0.84, 0, TAU); x.arc(0, 0, rr * 0.7, 0, TAU, true); x.fill();
          }),
          face: layer(null, rr, sc, x => {
            x.fillStyle = tone(c1); x.beginPath(); x.arc(0, 0, rr * 0.71, 0, TAU); x.fill();
            for (let r = 0.2; r < 0.7; r += 0.05) { x.strokeStyle = r * 100 % 10 < 5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'; x.lineWidth = rr * 0.025; x.beginPath(); x.arc(0, 0, rr * r, 0, TAU); x.stroke(); }
            // ports through the spool face: long slots, dark inside, with the wound line showing at their outer ends
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * TAU;
              x.save(); x.rotate(a);
              x.beginPath(); x.ellipse(rr * 0.42, 0, rr * 0.16, rr * 0.075, 0, 0, TAU);
              x.fillStyle = '#100e0c'; x.fill();
              x.save(); x.clip();
              x.fillStyle = line; x.beginPath(); x.ellipse(rr * 0.5, 0, rr * 0.1, rr * 0.07, 0, 0, TAU); x.fill();
              x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(rr * 0.26, -rr * 0.08, rr * 0.12, rr * 0.16);
              x.restore();
              x.strokeStyle = tone(c0); x.lineWidth = rr * 0.022;
              x.beginPath(); x.ellipse(rr * 0.42, 0, rr * 0.16, rr * 0.075, 0, 0, TAU); x.stroke();
              x.restore();
            }
            x.strokeStyle = tone(c2); x.lineWidth = rr * 0.03; x.beginPath(); x.arc(0, 0, rr * 0.63, 0, TAU); x.stroke();
            x.fillStyle = rg(x, 0, 0, 0, rr * 0.22, [[0, tone(c0)], [1, tone(c2)]]); x.beginPath(); x.arc(0, 0, rr * 0.2, 0, TAU); x.fill();
            x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = rr * 0.04; x.beginPath(); x.moveTo(-rr * 0.12, 0); x.lineTo(rr * 0.12, 0); x.stroke();
          }),
          over: layer(null, rr, sc, x => {
            lightOver(x, rr * 0.71);
            // the face's own shadow from the rim on the lit side
            x.fillStyle = lgr(x, lx * rr * 0.71, ly * rr * 0.71, 0, 0, [[0, 'rgba(0,0,0,0.3)'], [0.25, 'rgba(0,0,0,0)']]);
            x.beginPath(); x.arc(0, 0, rr * 0.71, 0, TAU); x.fill();
            lightOver(x, rr, 0.12, 0.18);
            x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = Math.max(0.8, rr * 0.05);
            x.beginPath(); x.arc(0, 0, rr * 0.95, la - 0.65, la + 0.65); x.stroke();
            x.fillStyle = 'rgba(255,255,255,0.5)';
            x.beginPath(); x.ellipse(lx * rr * 0.42, ly * rr * 0.42, rr * 0.2, rr * 0.08, la + Math.PI / 2, 0, TAU); x.fill();
            x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.stroke();
          }),
          arm: 0.6,
        };
      }
    }
    return (per[key] = L);
  }
  function drawReel(D, S, rx, ry, rr, spin, lineCol, tone) {
    const { ctx, sh, sc, Lt } = D, L = reelLayers(S, rr, sc, sh, tone, lineCol, Lt), n = L.under.width / sc;
    ctx.drawImage(L.under, rx - n / 2, ry - n / 2, n, n);
    if (L.face) { ctx.save(); ctx.translate(rx, ry); ctx.rotate(spin); ctx.drawImage(L.face, -n / 2, -n / 2, n, n); ctx.restore(); }
    ctx.drawImage(L.over, rx - n / 2, ry - n / 2, n, n);
    // crank arm, counterweight and a knob that stands out toward us
    const ca = Math.cos(spin), sa = Math.sin(spin), hx = rx + ca * rr * L.arm, hy = ry + sa * rr * L.arm;
    ctx.lineCap = 'round';
    ctx.fillStyle = tone('#2a2826'); ctx.beginPath(); ctx.arc(rx - ca * rr * 0.28, ry - sa * rr * 0.28, rr * 0.13, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(2.2, rr * 0.17);
    ctx.beginPath(); ctx.moveTo(rx - ca * rr * 0.28, ry - sa * rr * 0.28); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = lgr(ctx, rx + sh.lx * rr * 0.1, ry + sh.ly * rr * 0.1, rx - sh.lx * rr * 0.1, ry - sh.ly * rr * 0.1, [[0, tone(S.reel ? S.reel[0] : '#d8d4cc')], [1, tone(S.reel ? S.reel[2] : '#4a4640')]]);
    ctx.lineWidth = Math.max(1.5, rr * 0.11);
    ctx.beginPath(); ctx.moveTo(rx - ca * rr * 0.28, ry - sa * rr * 0.28); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.7, rr * 0.05);
    ctx.beginPath(); ctx.moveTo(rx + sh.lx * rr * 0.05, ry + sh.ly * rr * 0.05); ctx.lineTo(hx + sh.lx * rr * 0.05, hy + sh.ly * rr * 0.05); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(hx - sh.lx * rr * 0.1, hy - sh.ly * rr * 0.1 + rr * 0.05, rr * 0.27, 0, TAU); ctx.fill();
    ctx.fillStyle = rg(ctx, hx + sh.lx * rr * 0.1, hy + sh.ly * rr * 0.1, 0, rr * 0.3, [[0, tone('#ffffff')], [0.3, tone(S.knob)], [1, tone(shadeHex(S.knob, 0.55))]]);
    ctx.beginPath(); ctx.arc(hx, hy, rr * 0.23, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  /* ================= Decor that stands off the blank ================= */
  function leafShape(ctx, x, y, a, L, W) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.45, -W, L, 0); ctx.quadraticCurveTo(L * 0.5, W * 0.9, 0, 0);
  }
  function blossom(ctx, x, y, s, rot, tone, petal = '#ffd0de', centre = '#ffd56a') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate((i / 5) * TAU);
      ctx.fillStyle = rg(ctx, 0, 0, s * 0.1, s, [[0, tone('#ff9ab8')], [0.45, tone(petal)], [1, tone(liftHex(petal, 0.5))]]);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-s * 0.5, -s * 0.3, -s * 0.42, -s * 0.95, -s * 0.1, -s * 0.98);
      ctx.lineTo(0, -s * 0.86); ctx.lineTo(s * 0.1, -s * 0.98);
      ctx.bezierCurveTo(s * 0.42, -s * 0.95, s * 0.5, -s * 0.3, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = tone(centre);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24, Math.max(0.5, s * 0.07), 0, TAU); ctx.fill(); }
    ctx.fillStyle = tone('#e06a8a'); ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const DECOR = {
    blossoms(D) {
      const { ctx, M, w0, tone, t } = D;
      for (let i = 0; i < 9; i++) {
        const p = sampleAt(M, 0.33 + i * 0.072), side = i % 2 ? 1 : -1;
        blossom(ctx, p.x + p.nx * p.w * 0.45 * side, p.y + p.ny * p.w * 0.45 * side, Math.max(2.6, w0 * (0.42 - i * 0.015)), i * 0.7 + Math.sin(t * 0.8 + i) * 0.05, tone, i % 3 ? '#ffc9d9' : '#ffe3ec');
      }
    },
    leaves(D) {
      const { ctx, M, w0, tone, sh } = D;
      for (let i = 0; i < 6; i++) {
        const k = 0.36 + i * 0.1, p = sampleAt(M, k), side = i % 2 ? 1 : -1;
        const a = Math.atan2(p.ty + p.ny * side * 1.1, p.tx + p.nx * side * 1.1), L = Math.max(5, w0 * 1.35) * (1 - i * 0.06), W = L * 0.36;
        const bx = p.x + p.nx * p.w * 0.45 * side, by = p.y + p.ny * p.w * 0.45 * side;
        leafShape(ctx, bx, by, a, L, W);
        const lit = Math.cos(a - Math.PI / 2 - Math.atan2(sh.ly, sh.lx)) > 0;
        ctx.fillStyle = lgr(ctx, 0, -W, 0, W, [[0, tone(lit ? '#7cc47e' : '#4f9a58')], [1, tone('#24502c')]]); ctx.fill();
        ctx.strokeStyle = tone('#9fd8a0'); ctx.lineWidth = Math.max(0.5, w0 * 0.05);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -W * 0.08, L * 0.92, 0); ctx.stroke();
        ctx.restore();
      }
    },
    thorns(D) {
      const { ctx, M, tone } = D;
      for (let i = 0; i < 12; i++) {
        const k = 0.31 + i * 0.054 + hash1(i) * 0.02, side = i % 2 ? 1 : -1, p = sampleAt(M, k), q = sampleAt(M, k + 0.012), h = p.w * (0.42 + hash1(i + 9) * 0.2);
        const ax = p.x + p.nx * p.w * 0.45 * side, ay = p.y + p.ny * p.w * 0.45 * side, bx = q.x + q.nx * q.w * 0.45 * side, by = q.y + q.ny * q.w * 0.45 * side;
        const tx = (ax + bx) / 2 + p.nx * h * side + p.tx * h * 0.7, ty = (ay + by) / 2 + p.ny * h * side + p.ty * h * 0.7;
        ctx.fillStyle = tone(side > 0 ? '#8a5a3a' : '#5a3020');
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + tx) / 2 + p.tx * h * 0.1, (ay + ty) / 2 + p.ty * h * 0.1, tx, ty); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
      }
    },
    boughs(D) {
      const { ctx, M, w0, tone } = D;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const p = sampleAt(M, 0.33 + i * 0.105), side = i % 2 ? 1 : -1, len = Math.max(8, w0 * 1.7) * (1 - i * 0.07);
        const dx = p.tx * 0.75 + p.nx * side * 0.66, dy = p.ty * 0.75 + p.ny * side * 0.66, dl = Math.hypot(dx, dy);
        const ux = dx / dl, uy = dy / dl, sx = p.x + p.nx * side * p.w * 0.3, sy = p.y + p.ny * side * p.w * 0.3;
        ctx.strokeStyle = tone('#5a3a22'); ctx.lineWidth = Math.max(0.8, p.w * 0.14);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ux * len, sy + uy * len); ctx.stroke();
        ctx.lineWidth = Math.max(0.9, p.w * 0.16);
        for (let j = 1; j <= 7; j++) {
          const u = j / 7.4, bx = sx + ux * len * u, by = sy + uy * len * u, nl = len * 0.36 * (1 - u * 0.45);
          for (const d of [-1, 1]) {
            const ax = ux * 0.55 - uy * d * 0.84, ay = uy * 0.55 + ux * d * 0.84;
            ctx.strokeStyle = tone(d * side > 0 ? (j % 2 ? '#3f7f46' : '#5a9a52') : (j % 2 ? '#24502c' : '#2f6a3a'));
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + ax * nl, by + ay * nl); ctx.stroke();
          }
        }
        if (i % 2 === 0) for (const [ox, oy] of [[0, 0], [0.9, 0.5], [0.2, 1]]) {
          const bx = sx + ux * len * 0.2 + ox * p.w * 0.32, by = sy + uy * len * 0.2 + oy * p.w * 0.32, r = Math.max(1.2, p.w * 0.2);
          ctx.fillStyle = rg(ctx, bx - r * 0.3, by - r * 0.3, 0, r * 1.2, [[0, tone('#ff6070')], [1, tone('#8a1424')]]); ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(bx - r * 0.35, by - r * 0.35, r * 0.3, 0, TAU); ctx.fill();
        }
      }
    },
    wisteria(D) {
      const { ctx, M, w0, tone, t } = D;
      for (let i = 0; i < 5; i++) {
        const p = sampleAt(M, 0.36 + i * 0.125), L = Math.max(12, w0 * 2.5) * (1 - i * 0.1), sway = Math.sin(t * 1.1 + i * 1.3) * 0.16;
        const x0 = p.x + p.w * 0.15, y0 = p.y + p.w * 0.35;
        ctx.fillStyle = tone('#5f9a52');
        for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x0 + d * p.w * 0.55, y0 - p.w * 0.05, Math.max(2, p.w * 0.5), Math.max(1, p.w * 0.22), d * 0.5, 0, TAU); ctx.fill(); }
        for (let j = 0; j < 11; j++) {
          const u = j / 10, a = sway * u, fx = x0 + Math.sin(a) * L * u + Math.sin(j * 2.4) * p.w * 0.2 * (1 - u), fy = y0 + Math.cos(a) * L * u;
          const r = Math.max(1.1, w0 * 0.2) * (1 - u * 0.55);
          ctx.fillStyle = rg(ctx, fx - r * 0.35, fy - r * 0.35, 0, r * 1.3, [[0, tone(mixHex('#c8a6f0', '#ffffff', 0.4 + u * 0.4))], [1, tone(mixHex('#7a4ac0', '#d8c6f6', u * 0.7))]]);
          ctx.beginPath(); ctx.arc(fx, fy, r, 0, TAU); ctx.fill();
        }
      }
    },
    bow(D) {
      const { ctx, M, w0, tone, sh } = D, p = sampleAt(M, 0.3), c = ctx;
      c.save(); c.translate(p.x + p.nx * p.w * 0.2, p.y + p.ny * p.w * 0.2); c.rotate(Math.atan2(p.ny, p.nx) + Math.PI / 2);
      for (const d of [-1, 1]) {
        c.fillStyle = lgr(c, d * w0 * 0.2, -w0 * 0.6, d * w0 * 1.6, w0 * 0.3, [[0, tone('#ff7fb0')], [0.45, tone('#ffc2dc')], [1, tone('#e8609a')]]);
        c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(d * w0 * 0.6, -w0 * 1.0, d * w0 * 1.8, -w0 * 0.5, d * w0 * 1.5, w0 * 0.15); c.bezierCurveTo(d * w0 * 1.2, w0 * 0.45, d * w0 * 0.4, w0 * 0.3, 0, 0); c.fill();
        c.strokeStyle = tone('#d04a86'); c.lineWidth = Math.max(0.6, w0 * 0.06);
        c.beginPath(); c.moveTo(d * w0 * 0.25, -w0 * 0.1); c.quadraticCurveTo(d * w0 * 0.8, -w0 * 0.35, d * w0 * 1.2, -w0 * 0.1); c.stroke();
        c.fillStyle = lgr(c, 0, 0, d * w0 * 0.6, w0 * 1.4, [[0, tone('#ff9ec4')], [1, tone('#e05a92')]]);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(d * w0 * 0.62, w0 * 1.35); c.lineTo(d * w0 * 0.36, w0 * 1.18); c.lineTo(d * w0 * 0.22, w0 * 1.36); c.lineTo(d * w0 * 0.12, w0 * 0.2); c.closePath(); c.fill();
      }
      c.fillStyle = rg(c, -w0 * 0.08, -w0 * 0.08, 0, w0 * 0.35, [[0, tone('#ffd0e4')], [1, tone('#e0609a')]]); c.beginPath(); c.ellipse(0, 0, w0 * 0.28, w0 * 0.32, 0, 0, TAU); c.fill();
      c.fillStyle = rg(c, w0 * 0.05, w0 * 0.42, 0, w0 * 0.22, [[0, '#ffffff'], [0.6, tone('#f6eef8')], [1, tone('#c8b8d6')]]); c.beginPath(); c.arc(0, w0 * 0.48, w0 * 0.2, 0, TAU); c.fill();
      c.restore();
    },
    icicles(D) {
      const { ctx, M, w0, t } = D;
      for (let i = 0; i < 6; i++) {
        const k = 0.34 + i * 0.105 + hash1(i * 3) * 0.03, p = sampleAt(M, k), side = p.ny < 0 ? -1 : 1;
        const ax = p.x + p.nx * p.w * 0.46 * side, ay = p.y + p.ny * p.w * 0.46 * side, L = w0 * (0.7 + hash1(i * 5) * 0.9) * (1 - i * 0.08), W = Math.max(1, p.w * 0.36);
        const g = ctx.createLinearGradient(ax - W, ay, ax + W, ay);
        g.addColorStop(0, 'rgba(160,210,245,0.8)'); g.addColorStop(0.45, 'rgba(240,252,255,0.92)'); g.addColorStop(1, 'rgba(120,180,225,0.75)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ax - W, ay - 0.5); ctx.quadraticCurveTo(ax - W * 0.4, ay + L * 0.5, ax + W * 0.1, ay + L); ctx.quadraticCurveTo(ax + W * 0.4, ay + L * 0.4, ax + W, ay - 0.5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.5, W * 0.18);
        ctx.beginPath(); ctx.moveTo(ax - W * 0.35, ay + 1); ctx.lineTo(ax, ay + L * 0.75); ctx.stroke();
        const g2 = Math.pow(Math.max(0, Math.sin(t * 1.4 + i * 2.3)), 12);
        if (g2 > 0.05) twinkle(ctx, ax + W * 0.1, ay + L, w0 * 0.3, g2);
      }
    },
  };
  function mixHex(a, b, k) { const A = col4(a), B = col4(b); return css([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]); }
  function specks(D) {
    const { ctx, M, t } = D;
    for (let i = 0; i < 28; i++) {
      const k = 0.3 + ((i * 0.618) % 1) * 0.68, p = sampleAt(M, k);
      const tw = Math.pow(Math.max(0, Math.sin(t * (1.4 + (i % 5) * 0.4) + i * 2.1)), 3);
      if (tw < 0.05) continue;
      const off = p.w * 0.18 * ((i % 3) - 1), x = p.x + p.nx * off, y = p.y + p.ny * off;
      ctx.fillStyle = `rgba(255,250,220,${tw})`;
      ctx.beginPath(); ctx.arc(x, y, 0.5 + tw * 1.1, 0, TAU); ctx.fill();
      if (tw > 0.7 && i % 3 === 0) twinkle(ctx, x, y, D.w0 * 0.3, tw);
    }
  }

  /* ================= Tip ornaments ================= */
  function roseBloom(ctx, x, y, s, rot, tone) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = tone('#2f6a3a');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.35, -s * 0.2, s * 1.05, 0); ctx.quadraticCurveTo(s * 0.35, s * 0.2, 0, 0); ctx.fill(); ctx.restore();
    }
    const ring = (n, d, rx, ry, c0, c1, ph) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ph;
        ctx.save(); ctx.rotate(a); ctx.translate(d, 0);
        ctx.fillStyle = rg(ctx, -rx * 0.5, 0, 0, rx * 1.2, [[0, tone(c0)], [1, tone(c1)]]);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,190,0.5)'; ctx.lineWidth = Math.max(0.5, s * 0.05);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, -1.2, 1.2); ctx.stroke();
        ctx.restore();
      }
    };
    ring(5, s * 0.46, s * 0.5, s * 0.46, '#e8304e', '#7a0a26', 0);
    ring(5, s * 0.26, s * 0.38, s * 0.34, '#ff5a78', '#a8102e', 0.6);
    ring(3, s * 0.1, s * 0.28, s * 0.24, '#ff8aa0', '#c8143a', 1.3);
    ctx.strokeStyle = tone('#8a0a26'); ctx.lineWidth = Math.max(0.6, s * 0.07);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i * 0.45, r = s * 0.02 + i * s * 0.008; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.stroke();
    ctx.restore();
  }
  const TIPS = {
    moon(D) {
      const { ctx, end, w0 } = D, R = w0 * 0.95, cx = end.x + w0 * 0.2, cy = end.y - w0 * 0.55;
      halo(ctx, cx, cy, w0 * 2.6, '255,232,170', 0.34 + 0.08 * Math.sin(D.t * 1.7));
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.45);
      ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, true); ctx.ellipse(0, 0, R * 0.42, R, 0, Math.PI / 2, Math.PI * 1.5, false); ctx.closePath();
      ctx.fillStyle = rg(ctx, -R * 0.6, 0, 0, R * 1.1, [[0, '#fffbe6'], [0.6, '#ffe6a4'], [1, '#e8b860']]); ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(200,150,70,0.25)';
      for (const [a, b, r] of [[-0.6, -0.4, 0.14], [-0.75, 0.3, 0.1], [-0.45, 0.62, 0.08]]) { ctx.beginPath(); ctx.arc(a * R, b * R, r * R, 0, TAU); ctx.fill(); }
      ctx.restore();
      twinkle(ctx, cx + w0 * 1.25, cy - w0 * 0.7, w0 * 0.5, 0.45 + 0.55 * Math.max(0, Math.sin(D.t * 2.3)));
    },
    plume(D) {
      const { ctx, end, w0, tone } = D, base = Math.atan2(end.ty, end.tx);
      const cols = [['#1680c8', '#8ae8f2'], ['#ff9a4a', '#ffd6a8'], ['#28b8e0', '#c8f6ff']];
      for (let j = -1; j <= 1; j++) {
        const a = base + j * 0.5 + Math.sin(D.t * 2.1 + j) * 0.09, L = w0 * (j ? 1.9 : 2.3), W = w0 * 0.38;
        ctx.save(); ctx.translate(end.x, end.y); ctx.rotate(a);
        ctx.fillStyle = lgr(ctx, 0, 0, L, 0, [[0, tone(cols[j + 1][0])], [1, tone(cols[j + 1][1])]]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(L * 0.3, -W * 1.2, L * 0.85, -W * 0.7, L, 0); ctx.bezierCurveTo(L * 0.8, W * 0.9, L * 0.3, W * 0.8, 0, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(0.5, w0 * 0.04);
        for (let b = 1; b < 7; b++) { const u = b / 7; ctx.beginPath(); ctx.moveTo(L * u, 0); ctx.lineTo(L * (u + 0.08), -W * 0.8 * (1 - u * 0.5)); ctx.moveTo(L * u, 0); ctx.lineTo(L * (u + 0.08), W * 0.7 * (1 - u * 0.5)); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.6, w0 * 0.07);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -W * 0.08, L * 0.96, 0); ctx.stroke();
        ctx.restore();
      }
    },
    cone(D) {
      const { ctx, end, w0, tone } = D, a = Math.atan2(end.ty, end.tx);
      ctx.save(); ctx.translate(end.x + end.tx * w0 * 0.5, end.y + end.ty * w0 * 0.5); ctx.rotate(a);
      ctx.fillStyle = tone('#4a2a14'); ctx.beginPath(); ctx.ellipse(0, 0, w0 * 0.62, w0 * 0.4, 0, 0, TAU); ctx.fill();
      for (let r = 0; r < 4; r++) for (let i = -1; i <= 1; i++) {
        const x = -w0 * 0.42 + r * w0 * 0.28, y = i * w0 * 0.22 + (r % 2 ? w0 * 0.11 : 0), s = w0 * (0.2 - r * 0.02);
        if (Math.abs(y) > w0 * 0.36) continue;
        ctx.fillStyle = lgr(ctx, x - s, y, x + s, y, [[0, tone('#6a3a1c')], [1, tone('#c08a4a')]]);
        ctx.beginPath(); ctx.moveTo(x - s * 0.6, y - s * 0.7); ctx.quadraticCurveTo(x + s * 1.3, y, x - s * 0.6, y + s * 0.7); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    spark(D) {
      halo(D.ctx, D.end.x, D.end.y, D.w0 * 2.6, D.S.glow || '255,230,160', 0.5 + 0.2 * Math.sin(D.t * 3));
      twinkle(D.ctx, D.end.x, D.end.y, D.w0 * (0.9 + 0.3 * Math.sin(D.t * 2.4)), 0.85);
    },
    star(D) {
      const { ctx, end, w0 } = D;
      halo(ctx, end.x, end.y, w0 * 3, '230,190,255', 0.55);
      starPath(ctx, end.x, end.y, w0 * 0.95, 5, 0.45, -Math.PI / 2 + D.t * 0.6);
      ctx.fillStyle = rg(ctx, end.x, end.y, 0, w0, [[0, '#ffffff'], [0.6, '#fff3c8'], [1, '#e8c0ff']]); ctx.fill();
    },
    flower(D) { const b = D.S.bloom || ['#ffc3d6', '#ffd56a']; blossom(D.ctx, D.end.x, D.end.y, D.w0 * 0.85, D.t * 0.3, D.tone, b[0], b[1]); },
    rose(D) {
      const { ctx, end, w0, tone, t } = D, s = w0 * 1.15;
      halo(ctx, end.x, end.y, s * 3, '255,110,150', 0.4 + 0.1 * Math.sin(t * 2));
      roseBloom(ctx, end.x, end.y, s, t * 0.1, tone);
      twinkle(ctx, end.x + s, end.y - s, s * 0.6, 0.6 + 0.4 * Math.sin(t * 2.6));
    },
    trident(D) {
      const { ctx, end, w0, sh } = D, tx = end.tx, ty = end.ty, nx = end.nx, ny = end.ny;
      halo(ctx, end.x + tx * w0 * 1.5, end.y + ty * w0 * 1.5, w0 * 4, '255,220,120', 0.4);
      const gold = (x0, y0, x1, y1) => lgr(ctx, x0 + sh.lx * w0 * 0.3, y0 + sh.ly * w0 * 0.3, x1 - sh.lx * w0 * 0.3, y1 - sh.ly * w0 * 0.3, [[0, '#fff3c0'], [0.5, '#ffd24a'], [1, '#a8720e']]);
      ctx.lineCap = 'round';
      const bar = w0 * 1.15, lw = Math.max(1.4, w0 * 0.24);
      const stroke = (f) => { ctx.strokeStyle = 'rgba(90,55,5,0.6)'; ctx.lineWidth = lw + 1; f(); ctx.stroke(); ctx.strokeStyle = gold(end.x - nx * bar, end.y - ny * bar, end.x + nx * bar, end.y + ny * bar); ctx.lineWidth = lw; f(); ctx.stroke(); };
      stroke(() => { ctx.beginPath(); ctx.moveTo(end.x - nx * bar, end.y - ny * bar); ctx.quadraticCurveTo(end.x - tx * w0 * 0.3, end.y - ty * w0 * 0.3, end.x + nx * bar, end.y + ny * bar); });
      for (const d of [-1, 0, 1]) {
        const sx = end.x + nx * bar * d, sy = end.y + ny * bar * d, L = d ? w0 * 2.4 : w0 * 3.2;
        const ex = sx + tx * L + nx * d * w0 * 0.35, ey = sy + ty * L + ny * d * w0 * 0.35;
        stroke(() => { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + tx * L * 0.6, sy + ty * L * 0.6, ex, ey); });
        ctx.fillStyle = gold(ex, ey, ex + tx * w0, ey + ty * w0);
        ctx.beginPath(); ctx.moveTo(ex + tx * w0 * 0.6, ey + ty * w0 * 0.6); ctx.lineTo(ex - nx * w0 * 0.34 - tx * w0 * 0.1, ey - ny * w0 * 0.34 - ty * w0 * 0.1); ctx.lineTo(ex, ey); ctx.lineTo(ex + nx * w0 * 0.34 - tx * w0 * 0.1, ey + ny * w0 * 0.34 - ty * w0 * 0.1); ctx.closePath(); ctx.fill();
      }
      twinkle(ctx, end.x + tx * w0 * 3.6, end.y + ty * w0 * 3.6, w0 * 0.7, 0.5 + 0.5 * Math.sin(D.t * 2.2));
    },
    blackhole(D) {
      const { ctx, end, w0, t } = D, R = w0 * 1.05, ang = Math.atan2(end.ny, end.nx) + Math.PI / 2;
      halo(ctx, end.x, end.y, R * 5, '255,150,70', 0.4 + 0.08 * Math.sin(t * 2));
      const ring = (from, to) => {
        ctx.save(); ctx.translate(end.x, end.y); ctx.rotate(ang + 0.35);
        const g = ctx.createLinearGradient(-R * 2.6, 0, R * 2.6, 0), h = (Math.sin(t * 1.5) + 1) / 2;
        g.addColorStop(0, '#ff7a2a'); g.addColorStop(0.3 + h * 0.2, '#fff3d6'); g.addColorStop(0.7, '#ffb35a'); g.addColorStop(1, '#ff6a1a');
        ctx.strokeStyle = g; ctx.lineWidth = R * 0.45;
        ctx.beginPath(); ctx.ellipse(0, 0, R * 2.4, R * 0.7, 0, from, to); ctx.stroke();
        ctx.restore();
      };
      ring(Math.PI, TAU);
      ctx.beginPath(); ctx.arc(end.x, end.y, R, 0, TAU); ctx.fillStyle = '#000'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,226,180,0.9)'; ctx.lineWidth = Math.max(1, R * 0.12); ctx.stroke();
      ring(0, Math.PI);
    },
    /* A fluffy marmalade tail: a thick furry tube that rises from the tip and curls over like a question
       mark, wagging and twitching. Ringed with darker stripes, tipped in cream, lit from above, with a soft
       fringe of fur along its edges. */
    tail(D) {
      const { ctx, end, w0, t, tone, sh } = D;
      const wag = Math.sin(t * 2.6) * 0.5 + Math.sin(t * 6.1) * 0.08, L = w0 * 3.5;
      const tx = end.tx, ty = end.ty, nx = end.nx, ny = end.ny;
      const at = (a, b) => ({ x: end.x + tx * L * a + nx * L * b, y: end.y + ty * L * a + ny * L * b });
      const P0 = at(0, 0), P1 = at(0.5, 0.06), P2 = at(1.0 + wag * 0.08, 0.42 + wag * 0.1), P3 = at(0.62 + wag * 0.22, 0.86 - wag * 0.05);
      const K = 24, S = [];
      for (let i = 0; i <= K; i++) {
        const v = i / K, a = (1 - v) ** 3, b = 3 * (1 - v) ** 2 * v, c = 3 * (1 - v) * v * v, d = v ** 3;
        let x = a * P0.x + b * P1.x + c * P2.x + d * P3.x, y = a * P0.y + b * P1.y + c * P2.y + d * P3.y;
        let dx = 3 * (1 - v) ** 2 * (P1.x - P0.x) + 6 * (1 - v) * v * (P2.x - P1.x) + 3 * v * v * (P3.x - P2.x);
        let dy = 3 * (1 - v) ** 2 * (P1.y - P0.y) + 6 * (1 - v) * v * (P2.y - P1.y) + 3 * v * v * (P3.y - P2.y);
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const twitch = Math.sin(t * 8 + v * 4) * w0 * 0.07 * v * v;
        x += dy * twitch; y -= dx * twitch;
        const rad = end.w * 0.5 + (w0 * 0.42 - end.w * 0.5) * sstep(0, 0.3, v) * (1 - 0.35 * sstep(0.7, 1, v));
        S.push({ x, y, dx, dy, nx: dy, ny: -dx, rad });
      }
      const edge = (i, k) => ({ x: S[i].x + S[i].nx * S[i].rad * k, y: S[i].y + S[i].ny * S[i].rad * k });
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i <= K; i++) { const p = edge(i, 1); ctx.lineTo(p.x, p.y); }
        const e = S[K];
        ctx.ellipse(e.x, e.y, e.rad * 1.1, e.rad, Math.atan2(e.dy, e.dx), -Math.PI / 2, Math.PI / 2);
        for (let i = K; i >= 0; i--) { const p = edge(i, -1); ctx.lineTo(p.x, p.y); }
        ctx.closePath();
      };
      const STRIPES = [0.18, 0.31, 0.44, 0.57, 0.7];
      const colAt = v => (v > 0.84 ? '#fff4e4' : STRIPES.some(b => Math.abs(v - b) < 0.035) ? '#b0581e' : '#f0a050');
      // the fringe: short hairs lying back along the tail, a little outward, behind the body
      ctx.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const h = hash1(i * 3 + 1), h2 = hash1(i * 5 + 2), v = 0.08 + h * 0.94, j = Math.min(K, Math.round(v * K)), p = S[j], side = h2 > 0.5 ? 1 : -1;
        const b = edge(j, side * 0.75), len = p.rad * (0.3 + h2 * 0.45) * (v > 0.9 ? 1.5 : 1), out = 0.3 + hash1(i * 7) * 0.5;
        ctx.strokeStyle = tone(colAt(v)); ctx.lineWidth = Math.max(0.5, w0 * (0.035 + h * 0.035));
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.quadraticCurveTo(b.x + p.nx * side * len * out, b.y + p.ny * side * len * out, b.x + (p.dx * 0.8 + p.nx * side * out) * len, b.y + (p.dy * 0.8 + p.ny * side * out) * len);
        ctx.stroke();
      }
      ctx.save();
      path();
      ctx.fillStyle = tone('#f0a050'); ctx.fill();
      ctx.clip();
      for (const b of STRIPES) {
        const i0 = Math.round((b - 0.035) * K), i1 = Math.max(i0 + 1, Math.round((b + 0.035) * K));
        const A0 = edge(i0, 1.4), A1 = edge(i0, -1.4), B1 = edge(i1, -1.4), B0 = edge(i1, 1.4), pa = S[i0], pb = S[i1];
        ctx.beginPath(); ctx.moveTo(A0.x, A0.y);
        ctx.quadraticCurveTo(pa.x + pa.dx * pa.rad * 0.5, pa.y + pa.dy * pa.rad * 0.5, A1.x, A1.y);
        ctx.lineTo(B1.x, B1.y);
        ctx.quadraticCurveTo(pb.x + pb.dx * pb.rad * 0.5, pb.y + pb.dy * pb.rad * 0.5, B0.x, B0.y);
        ctx.closePath();
        ctx.fillStyle = tone('#b0581e'); ctx.fill();
      }
      ctx.beginPath();
      const i84 = Math.round(K * 0.84);
      for (let i = i84; i <= K; i++) { const p = edge(i, 1.5); ctx.lineTo(p.x, p.y); }
      const e = S[K]; ctx.lineTo(e.x + e.dx * e.rad * 2, e.y + e.dy * e.rad * 2);
      for (let i = K; i >= i84; i--) { const p = edge(i, -1.5); ctx.lineTo(p.x, p.y); }
      ctx.closePath(); ctx.fillStyle = tone('#fff4e4'); ctx.fill();
      // fur texture: fine hairs along the tail
      ctx.strokeStyle = 'rgba(255,236,205,0.3)'; ctx.lineWidth = Math.max(0.5, w0 * 0.045);
      for (let i = 0; i < 26; i++) {
        const v = 0.08 + (i / 26) * 0.86, j = Math.min(K - 1, Math.round(v * K)), o = (hash1(i * 7) - 0.5) * 1.5, a = edge(j, o);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + S[j].dx * S[j].rad * 0.8, a.y + S[j].dy * S[j].rad * 0.8); ctx.stroke();
      }
      // round shading: bands that run the length of the tail, lighter on the side toward the light
      const m = S[Math.round(K * 0.5)], up = m.nx * sh.lx + m.ny * sh.ly >= 0 ? 1 : -1;
      const band = (k0, k1, style) => {
        ctx.beginPath();
        for (let i = 0; i <= K; i++) { const p = edge(i, k0 * up); ctx.lineTo(p.x, p.y); }
        for (let i = K; i >= 0; i--) { const p = edge(i, k1 * up); ctx.lineTo(p.x, p.y); }
        ctx.closePath(); ctx.fillStyle = style; ctx.fill();
      };
      for (const [k0, k1, a] of [[-1.6, -0.15, 0.12], [-1.6, -0.45, 0.14], [-1.6, -0.72, 0.16]]) band(k0, k1, `rgba(80,30,0,${a})`);
      for (const [k0, k1, a] of [[0.2, 0.8, 0.1], [0.32, 0.66, 0.12]]) band(k0, k1, `rgba(255,248,230,${a})`);
      band(-1.6, -0.86, 'rgba(255,190,120,0.16)');
      ctx.restore();
    },
    /* Glacier: a cluster of hexagonal ice crystals with lit and shaded facets, a cap of snow, a cold glow. */
    snowcap(D) {
      const { ctx, end, w0, t, sh } = D, base = Math.atan2(end.ty, end.tx);
      halo(ctx, end.x + end.tx * w0, end.y + end.ty * w0, w0 * 3.2, '170,225,255', 0.32 + 0.08 * Math.sin(t * 1.6));
      for (const [da, L, W] of [[-0.85, 1.3, 0.3], [0.6, 1.15, 0.28], [-0.4, 1.6, 0.34], [0.05, 2.1, 0.42]]) {
        const a = base + da, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, l = w0 * L, w = w0 * W;
        const lit = vx * sh.lx + vy * sh.ly > 0;
        const pt = (p, q) => [end.x + ux * p + vx * q, end.y + uy * p + vy * q];
        const face = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
        face([pt(0, -w), pt(l * 0.72, -w), pt(l, 0), pt(0, 0)], lit ? 'rgba(226,246,255,0.92)' : 'rgba(96,166,226,0.86)');
        face([pt(0, 0), pt(l, 0), pt(l * 0.72, w), pt(0, w)], lit ? 'rgba(96,166,226,0.86)' : 'rgba(226,246,255,0.92)');
        face([pt(l * 0.2, -w * 0.5), pt(l * 0.6, -w * 0.5), pt(l * 0.68, -w * 0.2), pt(l * 0.25, -w * 0.2)], 'rgba(255,255,255,0.35)');
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(0.6, w0 * 0.06);
        ctx.beginPath(); ctx.moveTo(...pt(w * 0.3, 0)); ctx.lineTo(...pt(l * 0.98, 0)); ctx.stroke();
        ctx.strokeStyle = 'rgba(90,150,200,0.6)'; ctx.lineWidth = Math.max(0.5, w0 * 0.04);
        ctx.beginPath(); ctx.moveTo(...pt(0, -w)); ctx.lineTo(...pt(l * 0.72, -w)); ctx.lineTo(...pt(l, 0)); ctx.lineTo(...pt(l * 0.72, w)); ctx.lineTo(...pt(0, w)); ctx.stroke();
      }
      ctx.fillStyle = rg(ctx, end.x - w0 * 0.1, end.y - w0 * 0.3, 0, w0 * 0.7, [[0, '#ffffff'], [1, '#d8ecfa']]);
      ctx.beginPath(); ctx.ellipse(end.x - end.tx * w0 * 0.1, end.y - end.ty * w0 * 0.1, w0 * 0.3, w0 * 0.2, base, 0, TAU); ctx.fill();
      twinkle(ctx, end.x + Math.cos(base - 0.05) * w0 * 1.9, end.y + Math.sin(base - 0.05) * w0 * 1.9, w0 * 0.6, 0.5 + 0.5 * Math.sin(t * 2));
    },
    // the candy cane's crook is part of the tube; it only needs a sugar glint
    curl(D) {
      const { ctx, M, w0, t } = D, e = M.P[M.P.length - 4] || D.end, g = Math.pow(Math.max(0, Math.sin(t * 1.3)), 8);
      if (g > 0.05) twinkle(ctx, e.x + e.nx * e.w * 0.3, e.y + e.ny * e.w * 0.3, w0 * 0.5, g);
    },
  };
  const GLOW_TIPS = new Set(['spark', 'star', 'rose', 'trident', 'blackhole', 'moon', 'snowcap']);

  /* ================= The rod ================= */
  function paint(ctx, S, base, tip, bend, t, m, spin = 0, o = {}) {
    const Ls = o.light || STUDIO, RL = rodLight(Ls), tone = toner(shading(Ls));
    const R = model(S), th = S.thick || 1;
    const w0 = Math.max(6, m * 0.02) * th, w1 = Math.max(1.3, m * 0.0032) * (th > 1 ? th * 2 : 1);
    const tipR = R.tipR || clamp(w1 / w0, 0.08, 0.6);
    const B = ctx.getTransform(), sc = Math.hypot(B.a, B.b) || 1;
    const M = mesh(base, tip, bend, t, w0, tipR, R, sc);
    const end = M.P[M.iTip];
    // the rod's key light on screen, for the guides, reel and ornaments
    const tcx = -M.ny, tcy = M.nx, wlx = RL.Ln * M.nx + RL.Lu * tcx, wly = RL.Ln * M.ny + RL.Lu * tcy, wl = Math.hypot(wlx, wly) || 1;
    const sh = { ...shading(Ls), lx: wlx / wl, ly: wly / wl, key: RL.key, rim: RL.rim };
    const D = { ctx, S, R, M, t, m, w0, w1, sh, tone, sc, Lt: RL, end };
    const L = Gear.LINE[o.line];
    const lineCol = L ? (L.color || 'rgba(255,255,255,0.8)') : null;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (R.aura) aura(D, R.aura);

    // the reel hangs under the seat on its foot; the foot and the guide legs go under the blank
    const rp = sampleAt(M, 0.236), rr = Math.max(9, m * 0.028), off = rp.w / 2 + rr * (th > 1 ? 1.25 : 1.05);
    const rx = rp.x - rp.nx * off, ry = rp.y - rp.ny * off;
    const G = guideGeo(D);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(3.6, rr * 0.4);
    ctx.beginPath(); ctx.moveTo(rp.x, rp.y); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.strokeStyle = lgr(ctx, rp.x - rp.tx * rr * 0.2, rp.y - rp.ty * rr * 0.2, rp.x + rp.tx * rr * 0.2, rp.y + rp.ty * rr * 0.2, [[0, tone('#3a3836')], [0.4, tone('#8a8680')], [1, tone('#1a1918')]]);
    ctx.lineWidth = Math.max(3, rr * 0.32);
    ctx.beginPath(); ctx.moveTo(rp.x, rp.y); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.lineCap = 'round';
    guideLegs(D, G, tone, S);

    drawBlank(ctx, B, S, R, M, RL, t, sc, w0);
    ctx.lineCap = 'round';

    for (const d of R.standoff) DECOR[d](D);
    if (S.tipStyle && TIPS[S.tipStyle] && !GLOW_TIPS.has(S.tipStyle)) TIPS[S.tipStyle](D);

    guideRings(D, G, false, tone, S);
    drawReel(D, S, rx, ry, rr, spin, lineCol, tone);
    const g0 = G[0], da = Math.atan2(g0.y - ry, g0.x - rx);
    threadLine(D, G, { x: rx + Math.cos(da) * rr * 0.78, y: ry + Math.sin(da) * rr * 0.78 }, lineCol || 'rgba(246,244,236,0.6)');
    guideRings(D, G, true, tone, S);
    tipTop(D, tone, S);

    if (R.specks) specks(D);
    if (S.tipStyle && TIPS[S.tipStyle] && GLOW_TIPS.has(S.tipStyle)) TIPS[S.tipStyle](D);
    if (R.motes) motes(D, R.motes);
    ctx.restore();
  }

  return { paint, LOOK, model };
})();
