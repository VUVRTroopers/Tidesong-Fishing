/* Tidesong — the aquarium's light and glass, on the GPU.
   tank.js paints each frame of a tank on a 2D canvas; this takes that painting and, as the fishing
   waters do, lights it:
   1. scene pass: a faint shimmer through the water (a bowl bends everything like a lens), and moving
      caustics that fall hardest on the sand and decor and dapple the fish as they swim through.
   2. bloom: bright pass at 1/4 resolution, blurred at 1/4 and 1/8.
   3. light shafts: screen-space scattering from the bright water just under the surface (or, for the
      bowl, from the moonlit window), so fish and plants near the top cast shadows down the beams.
   4. glass and composite: the thick glass edge doubles and greens the image, colour fringes toward the
      edges, a polished edge catches the light, and soft reflections and smudges drift with the pointer.
   Falls back silently (ok = false) when WebGL is unavailable, and the 2D painting is shown instead. */
'use strict';

const TankGL = (() => {
  let gl = null, canvas = null, ok = false, precision = 'mediump';
  let P = null, buf = null, fb = null, meta = null;
  const tex = {};
  let W = 0, H = 0;

  const VS = `attribute vec2 aPos; varying vec2 vUv; varying vec2 vFb;
void main() { vFb = aPos * 0.5 + 0.5; vUv = vec2(vFb.x, 1.0 - vFb.y); gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

  const FS_SCENE = `
varying vec2 vUv;
uniform sampler2D uSrc, uCaust, uRecv;
uniform vec2 uRes;
uniform vec4 uWater;   // the water: left, surface, right, bottom (uv, from the top left)
uniform vec4 uBowl;    // a bowl's centre and radius in pixels, and 1 if this tank is a bowl
uniform float uTime, uCaustA, uShimmer;
uniform vec3 uLightCol;
${NOISE}
void main() {
  vec2 uv = vUv, px = uv * uRes;
  if (uBowl.w > 0.5) {
    // a round bowl is a lens: the middle swells a little, the sides crowd toward the rim
    vec2 d = (px - uBowl.xy) / uBowl.z;
    float r2 = dot(d, d);
    if (r2 < 1.0) { px = uBowl.xy + d * (0.9 + 0.1 * r2 * r2) * uBowl.z; uv = px / uRes; }
  }
  vec4 mask = texture2D(uRecv, vUv);
  bool wet = mask.g > 0.5;
  float depth = clamp((uv.y - uWater.y) / max(1e-3, uWater.w - uWater.y), 0.0, 1.0);
  if (wet) {
    // light bending through moving water, strongest just under the surface
    vec2 q = px * 0.012;
    vec2 sh = vec2(noise(q + vec2(uTime * 0.35, 0.0)) - 0.5, noise(q * 1.3 + vec2(0.0, uTime * 0.28)) - 0.5);
    uv += sh * uShimmer * (1.0 + 2.5 * exp(-depth * 14.0)) / uRes;
  }
  vec3 c = texture2D(uSrc, uv).rgb;
  if (wet && uCaustA > 0.0) {
    vec2 w = px / uRes.y;
    vec2 warp = vec2(noise(w * 3.0 + uTime * 0.21), noise(w * 3.0 - uTime * 0.17)) * 0.06;
    float c1 = texture2D(uCaust, w * 1.45 + warp + vec2(uTime * 0.027, uTime * 0.015)).r;
    float c2 = texture2D(uCaust, w * 1.95 - warp * 1.3 + vec2(-uTime * 0.021, uTime * 0.026)).r;
    float ca = min(c1, c2);
    ca = ca * ca * 2.0;
    float recv = mask.r;
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    // strongest on the sand and decor; open water only shows a faint web, and fish catch dapples of it
    float k = uCaustA * mix(0.035 + 0.3 * lum, 1.0, recv) * (1.0 - depth * 0.4);
    c += uLightCol * ca * k * (0.25 + c);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

  const FS_BRIGHT = `
varying vec2 vFb;
uniform sampler2D uTex;
uniform vec2 uPx;
uniform float uThr;
void main() {
  vec3 c = (texture2D(uTex, vFb + vec2(-uPx.x, -uPx.y)).rgb + texture2D(uTex, vFb + vec2(uPx.x, -uPx.y)).rgb
          + texture2D(uTex, vFb + vec2(-uPx.x, uPx.y)).rgb + texture2D(uTex, vFb + uPx).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * (max(l - uThr, 0.0) / max(l, 1e-3)) * 2.2, 1.0);
}`;

  const FS_BLUR = `
varying vec2 vFb;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uTex, vFb).rgb * 0.227027;
  c += (texture2D(uTex, vFb + uDir * 1.384615).rgb + texture2D(uTex, vFb - uDir * 1.384615).rgb) * 0.316216;
  c += (texture2D(uTex, vFb + uDir * 3.230769).rgb + texture2D(uTex, vFb - uDir * 3.230769).rgb) * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

  const FS_COPY = `
varying vec2 vFb;
uniform sampler2D uTex;
void main() { gl_FragColor = vec4(texture2D(uTex, vFb).rgb, 1.0); }`;

  /* Light shafts: march from each pixel toward the light, gathering light from the bright band it comes
     through (the water just under the surface, or a window). Whatever is dark in that band, a fish
     near the top or a leaf, shades the beam below it. */
  const FS_RAYS = `
varying vec2 vFb;
uniform sampler2D uTex;
uniform vec2 uLight;   // where the light comes from (framebuffer uv)
uniform vec4 uBand;    // the band light enters through: bottom, top, left, right (framebuffer uv)
uniform float uThr, uTime, uFlicker, uDensity;
${NOISE}
void main() {
  vec2 delta = (vFb - uLight) * (uDensity / 26.0);
  vec2 tc = vFb;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 26; i++) {
    tc -= delta;
    float inBand = step(uBand.x, tc.y) * step(tc.y, uBand.y) * step(uBand.z, tc.x) * step(tc.x, uBand.w);
    if (inBand > 0.0) {
      vec3 s = texture2D(uTex, tc).rgb;
      float e = max(dot(s, vec3(0.33)) - uThr, 0.0);
      // the surface lets light through unevenly, so the beams come and go
      float f = mix(1.0, smoothstep(0.35, 0.8, noise(vec2(tc.x * 14.0 + uTime * 0.12, uTime * 0.09))) * 1.6, uFlicker);
      acc += s * e * f * w;
    }
    w *= 0.965;
  }
  gl_FragColor = vec4(acc / 9.0, 1.0);
}`;

  const FS_FINAL = `
varying vec2 vUv;
varying vec2 vFb;
uniform sampler2D uScene, uB1, uB2, uRays;
uniform float uA1, uA2, uAR, uVig, uTime, uEdge, uCA, uSheen, uGrade;
uniform vec3 uRayCol;
uniform vec4 uGlass;   // a tank's glass: left, top, right, bottom (uv, from the top left)
uniform vec4 uBowl;    // a bowl's centre and radius in pixels, and 1 if this tank is a bowl
uniform vec2 uRes, uPtr;
${NOISE}
float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.13) * 0.3 + noise(p * 4.7) * 0.15; }
void main() {
  vec2 px = vUv * uRes;
  // distance to the glass's edge (pixels) and the direction pointing in from it
  float e; vec2 n;
  if (uBowl.w > 0.5) {
    vec2 d = px - uBowl.xy; float r = length(d);
    e = uBowl.z - r; n = -d / max(r, 1.0);
  } else {
    vec2 a = px - uGlass.xy * uRes, b = uGlass.zw * uRes - px;
    e = min(min(a.x, b.x), min(a.y, b.y));
    n = e == a.x ? vec2(1.0, 0.0) : e == b.x ? vec2(-1.0, 0.0) : e == a.y ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
  }
  bool glass = e > 0.0;
  vec2 nf = vec2(n.x, -n.y) / uRes;   // that direction, in framebuffer space
  vec3 c;
  if (glass) {
    // colour fringing grows toward the edges of the glass
    vec2 fromC = vUv - 0.5;
    vec2 off = vec2(fromC.x, -fromC.y) * uCA * (0.4 + 2.2 * exp(-e / 26.0)) / uRes * 2.0;
    c = vec3(texture2D(uScene, vFb - off).r, texture2D(uScene, vFb).g, texture2D(uScene, vFb + off).b);
    // the thick glass edge: the picture doubles over and turns faintly green
    if (e < uEdge) {
      float k = 1.0 - e / uEdge;
      vec3 inner = texture2D(uScene, vFb + nf * (uEdge - e) * 1.35).rgb;
      c = mix(c, inner * vec3(0.7, 0.96, 0.88), k * k * 0.55);
      c += vec3(0.55, 0.9, 0.82) * exp(-pow((e - 1.6) / 1.1, 2.0)) * 0.22;
    }
  } else c = texture2D(uScene, vFb).rgb;
  c += texture2D(uB1, vFb).rgb * uA1 + texture2D(uB2, vFb).rgb * uA2 + texture2D(uRays, vFb).rgb * uAR * uRayCol;
  if (glass && uSheen > 0.0) {
    // reflections on the glass that drift a little as you move, with a few smudges in them
    vec2 p = vUv + (uPtr - 0.5) * vec2(0.05, 0.03);
    float diag = p.x * 0.92 + p.y * 0.5;
    float s = exp(-pow((diag - 0.34) / 0.075, 2.0)) * 0.34 + exp(-pow((diag - 0.47) / 0.018, 2.0)) * 0.3 + exp(-pow((p.x - 0.93) / 0.012, 2.0)) * 0.22;
    vec2 q = (p - vec2(0.17, 0.2)) / vec2(0.1, 0.13);
    float win = smoothstep(1.0, 0.9, max(abs(q.x), abs(q.y))) * smoothstep(0.03, 0.09, abs(q.x)) * smoothstep(0.03, 0.09, abs(q.y)) * 0.16;
    float sm = fbm(vUv * vec2(7.0, 5.0) + 3.1);
    float smudge = smoothstep(0.55, 0.8, sm) * 0.5;
    c += vec3(0.92, 0.97, 1.0) * (s + win) * uSheen * (0.6 + smudge) + vec3(1.0) * smudge * uSheen * 0.18;
  }
  // a gentle grade: a touch more contrast and colour
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 g = mix(vec3(l), c, 1.0 + 0.12 * uGrade);
  vec3 gc = clamp(g, 0.0, 1.0);
  c = mix(g, gc * gc * (3.0 - 2.0 * gc), 0.22 * uGrade);
  vec2 v = vUv - 0.5;
  c *= 1.0 - uVig * dot(v, v) * 1.2;
  c += (hash(gl_FragCoord.xy * 1.37 + fract(uTime * 3.0) * 17.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader failed');
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, `precision ${precision} float;\n${fs}`));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    const cache = {};
    return { p, u: n => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
  }
  function newTexture(repeat) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    return t;
  }
  function target(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    const t = newTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }
  function freeTargets() {
    if (!fb) return;
    for (const k in fb) { gl.deleteTexture(fb[k].t); gl.deleteFramebuffer(fb[k].f); }
    fb = null;
  }
  function upload(t, source) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  /* A tiling web of light (the edges of a wrapped Voronoi pattern), 256 square so it can repeat. */
  function causticData() {
    const N = 256, d = new Uint8Array(N * N * 4);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pts = Array.from({ length: 26 }, () => [rnd(), rnd()]);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      let f1 = 9, f2 = 9;
      for (const [px, py] of pts) {
        let dx = Math.abs(u - px), dy = Math.abs(v - py);
        dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
      }
      const k = Math.round(255 * Math.min(1, Math.exp(-(f2 - f1) * 30) * 1.1)), o = (j * N + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = k; d[o + 3] = 255;
    }
    return { N, d };
  }

  function setup() {
    const hf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    precision = hf && hf.precision > 0 ? 'highp' : 'mediump';
    P = { scene: program(FS_SCENE), bright: program(FS_BRIGHT), blur: program(FS_BLUR), copy: program(FS_COPY), rays: program(FS_RAYS), final: program(FS_FINAL) };
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    tex.src = newTexture(); tex.recv = newTexture(); tex.caust = newTexture(true);
    const C = causticData();
    gl.bindTexture(gl.TEXTURE_2D, tex.caust);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, C.N, C.N, 0, gl.RGBA, gl.UNSIGNED_BYTE, C.d);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    fb = null; W = H = 0;
  }

  function init(c) {
    canvas = c;
    try {
      gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
      if (!gl) return false;
      setup();
    } catch (e) {
      gl = null; ok = false;
      return false;
    }
    c.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; });
    c.addEventListener('webglcontextrestored', () => { try { setup(); ok = true; if (meta) setScene(meta); } catch (e) { ok = false; } });
    ok = true;
    return true;
  }

  function resize(w, h) {
    if (!gl) return;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (w === W && h === H && fb) return;
    canvas.width = w; canvas.height = h; W = w; H = h;
    freeTargets();
    fb = { scene: target(W, H), bright: target(W / 4, H / 4), qa: target(W / 4, H / 4), qb: target(W / 4, H / 4), ea: target(W / 8, H / 8), eb: target(W / 8, H / 8), rays: target(W / 4, H / 4) };
  }

  /* m: { recv (canvas: where caustics fall), water [x0, surf, x1, y1] uv, glass [x0, y0, x1, y1] uv,
          bowl [cx, cy, r] px or null, light [x, y] fb uv, band [y0, y1, x0, x1] fb uv, caustic, shimmer,
          lightCol, rays, rayCol, rayThr, flicker, density, bloomThr, bloom1, bloom2, edge, ca, sheen,
          vignette, grade } */
  function setScene(m) {
    meta = m;
    if (!ok) return;
    upload(tex.recv, m.recv);
  }
  function pass(pr, out, fn) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null);
    gl.viewport(0, 0, out ? out.w : W, out ? out.h : H);
    gl.useProgram(pr.p);
    fn(pr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function bind(pr, unit, t, name) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(pr.u(name), unit);
  }

  function render(src, time, ptr) {
    if (!ok || !meta || !fb) return false;
    const m = meta, t = time % 1000, bowl = m.bowl ? [m.bowl[0] * W, m.bowl[1] * H, m.bowl[2] * H, 1] : [0, 0, 0, 0];
    upload(tex.src, src);
    pass(P.scene, fb.scene, pr => {
      bind(pr, 0, tex.src, 'uSrc'); bind(pr, 1, tex.caust, 'uCaust'); bind(pr, 2, tex.recv, 'uRecv');
      gl.uniform2f(pr.u('uRes'), W, H);
      gl.uniform4fv(pr.u('uWater'), m.water);
      gl.uniform4fv(pr.u('uBowl'), bowl);
      gl.uniform1f(pr.u('uTime'), t);
      gl.uniform1f(pr.u('uCaustA'), m.caustic);
      gl.uniform1f(pr.u('uShimmer'), m.shimmer * (W / 1000));
      gl.uniform3fv(pr.u('uLightCol'), m.lightCol);
    });
    pass(P.bright, fb.bright, pr => { bind(pr, 0, fb.scene.t, 'uTex'); gl.uniform2f(pr.u('uPx'), 1 / W, 1 / H); gl.uniform1f(pr.u('uThr'), m.bloomThr); });
    pass(P.blur, fb.qa, pr => { bind(pr, 0, fb.bright.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 1.4 / fb.qa.w, 0); });
    pass(P.blur, fb.qb, pr => { bind(pr, 0, fb.qa.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 0, 1.4 / fb.qb.h); });
    pass(P.copy, fb.ea, pr => bind(pr, 0, fb.qb.t, 'uTex'));
    pass(P.blur, fb.eb, pr => { bind(pr, 0, fb.ea.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 1.6 / fb.eb.w, 0); });
    pass(P.blur, fb.ea, pr => { bind(pr, 0, fb.eb.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 0, 1.6 / fb.ea.h); });
    pass(P.rays, fb.rays, pr => {
      bind(pr, 0, fb.scene.t, 'uTex');
      gl.uniform2fv(pr.u('uLight'), m.light);
      gl.uniform4fv(pr.u('uBand'), m.band);
      gl.uniform1f(pr.u('uThr'), m.rayThr);
      gl.uniform1f(pr.u('uTime'), t);
      gl.uniform1f(pr.u('uFlicker'), m.flicker);
      gl.uniform1f(pr.u('uDensity'), m.density);
    });
    pass(P.final, null, pr => {
      bind(pr, 0, fb.scene.t, 'uScene'); bind(pr, 1, fb.qb.t, 'uB1'); bind(pr, 2, fb.ea.t, 'uB2'); bind(pr, 3, fb.rays.t, 'uRays');
      gl.uniform1f(pr.u('uA1'), m.bloom1); gl.uniform1f(pr.u('uA2'), m.bloom2); gl.uniform1f(pr.u('uAR'), m.rays);
      gl.uniform3fv(pr.u('uRayCol'), m.rayCol);
      gl.uniform1f(pr.u('uVig'), m.vignette); gl.uniform1f(pr.u('uTime'), t);
      gl.uniform1f(pr.u('uEdge'), m.edge * (H / 600)); gl.uniform1f(pr.u('uCA'), m.ca * (H / 600)); gl.uniform1f(pr.u('uSheen'), m.sheen); gl.uniform1f(pr.u('uGrade'), m.grade);
      gl.uniform4fv(pr.u('uGlass'), m.glass);
      gl.uniform4fv(pr.u('uBowl'), bowl);
      gl.uniform2f(pr.u('uRes'), W, H);
      gl.uniform2fv(pr.u('uPtr'), ptr || [0.5, 0.5]);
    });
    return true;
  }

  return { init, resize, setScene, render, get ok() { return ok; } };
})();
