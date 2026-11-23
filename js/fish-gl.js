/* Tidesong — WebGL lighting for painted sprites (fish and gear).
   LitGL.create() makes a lighting engine with its own WebGL canvas. Any painted canvas becomes a lit material:
   - its blurred silhouette is used as a height field, giving the body volume and curvature;
   - painted detail adds fine relief (scales, spots and fin rays catch the light);
   - a procedural scale texture adds micro-relief on the body;
   - lighting: wrap diffuse, Blinn-Phong specular (metallic for gold or silver fish), fresnel rim light,
     view-dependent iridescence, backlit translucent fins, soft occlusion at the silhouette,
     drifting water caustics and a periodic sheen sweep on rarer catches;
   - the tail half undulates in a swimming wave.
   The light (direction, key colour, ambient colour, rim colour) is given per call, so each lake lights its
   fish and gear in its own colours. FishGL wraps one engine for the fish; gear uses separate engines so
   their canvases do not resize back and forth every frame.
   Returns a canvas to drawImage from. Without WebGL it returns the flat painting instead. */
'use strict';

const LitGL = (() => {
  const VS = `attribute vec2 aPos; varying vec2 vUv; varying vec2 vFb;
void main() { vFb = aPos * 0.5 + 0.5; vUv = vec2(vFb.x, 1.0 - vFb.y); gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // blur of the alpha channel; uCanvas = 1 when sampling the uploaded canvas (y down)
  const FS_BLUR = `
varying vec2 vUv; varying vec2 vFb;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uCanvas;
float a(vec2 o) { vec2 c = (uCanvas > 0.5 ? vUv : vFb) + o; return uCanvas > 0.5 ? texture2D(uTex, c).a : texture2D(uTex, c).r; }
void main() {
  float s = a(vec2(0.0)) * 0.1585;
  s += (a(uDir) + a(-uDir)) * 0.1465;
  s += (a(uDir * 2.0) + a(-uDir * 2.0)) * 0.1155;
  s += (a(uDir * 3.0) + a(-uDir * 3.0)) * 0.0777;
  s += (a(uDir * 4.0) + a(-uDir * 4.0)) * 0.0446;
  s += (a(uDir * 5.0) + a(-uDir * 5.0)) * 0.0218;
  s += (a(uDir * 6.0) + a(-uDir * 6.0)) * 0.0091;
  gl_FragColor = vec4(vec3(s * 1.04), 1.0);
}`;

  const FS_LIGHT = `
varying vec2 vUv;
uniform sampler2D uSrc, uH;
uniform vec2 uPx;
uniform float uTime, uGloss, uShine, uIrid, uMetal, uScale, uBend, uBack, uCaust, uSweep, uNorm, uDetail, uDel, uScaleSize;
uniform vec3 uRim, uLightDir, uKey, uAmb;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
vec4 S(vec2 uv) { return texture2D(uSrc, uv); }
float Hh(vec2 uv) { return texture2D(uH, vec2(uv.x, 1.0 - uv.y)).r; }
void main() {
  vec2 uv = vUv;
  float tail = smoothstep(0.62, 0.08, uv.x);
  uv.y += sin(uv.x * 9.0 - uTime * 5.2) * uBend * tail;
  vec4 c = S(uv);
  if (c.a < 0.004) { gl_FragColor = vec4(0.0); return; }
  vec3 base = c.rgb;
  float h = Hh(uv);
  vec2 d = uPx * uDel;
  float hx = Hh(uv + vec2(d.x, 0.0)) - Hh(uv - vec2(d.x, 0.0));
  float hy = Hh(uv - vec2(0.0, d.y)) - Hh(uv + vec2(0.0, d.y));
  vec2 e = uPx * 1.5;
  float lx = lum(S(uv + vec2(e.x, 0.0)).rgb) - lum(S(uv - vec2(e.x, 0.0)).rgb);
  float ly = lum(S(uv - vec2(0.0, e.y)).rgb) - lum(S(uv + vec2(0.0, e.y)).rgb);
  // overlapping crescent scales: only the rim of each scale catches the light
  vec2 q = uv / (uPx * uScaleSize);
  q.x += mod(floor(q.y), 2.0) * 0.5;
  vec2 f = fract(q) - vec2(0.62, 0.5);
  float r = length(f * vec2(1.0, 1.15));
  float rim = exp(-pow((r - 0.5) / 0.08, 2.0)) * step(f.x, 0.05);
  vec2 sg = (f / max(r, 1e-3)) * rim;
  float body = smoothstep(0.3, 0.65, h) * step(0.9, c.a);
  vec2 slope = vec2(hx, hy) * uNorm + vec2(lx, ly) * uDetail - vec2(sg.x, -sg.y) * uScale * 0.22 * body;
  vec3 N = normalize(vec3(-slope, 1.0));
  vec3 L = normalize(uLightDir);
  vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndl = dot(N, L);
  vec3 diff = clamp(uAmb + uKey * ndl * 0.5, 0.0, 1.3);
  float spec = pow(max(dot(N, Hv), 0.0), uShine) * uGloss;
  float fres = pow(1.0 - clamp(N.z, 0.0, 1.0), 2.2);
  vec3 iri = hue(fract(N.x * 0.7 + N.y * 0.45 + uv.x * 0.6 + uTime * 0.04));
  vec3 specCol = mix(vec3(1.0), clamp(base * 1.6 + 0.1, 0.0, 1.4), uMetal);
  specCol = mix(specCol, iri * 1.2, uIrid);
  vec3 col = base * diff;
  col += specCol * uKey * spec;
  col += uRim * fres * 0.55 * smoothstep(0.02, 0.25, h);
  col += iri * fres * uIrid * 0.55;
  float thin = (1.0 - smoothstep(0.12, 0.55, h)) * (0.6 + 0.4 * (1.0 - c.a));
  col += base * thin * uBack * 0.42;
  col *= mix(0.74, 1.0, smoothstep(0.04, 0.42, h));
  vec2 cp = uv * vec2(7.0, 4.5);
  float ca = sin(cp.x * 3.1 + uTime * 1.3 + sin(cp.y * 2.3 + uTime)) * sin(cp.y * 2.7 - uTime * 1.1 + sin(cp.x * 1.7 - uTime * 0.7));
  col += vec3(0.85, 1.0, 1.0) * pow(max(ca, 0.0), 3.0) * uCaust * smoothstep(0.25, 0.6, h);
  float sw = fract(uTime * 0.16) * 2.6 - 0.8;
  col += mix(vec3(1.0, 0.98, 0.92), uKey, 0.5) * exp(-pow((uv.x + uv.y * 0.45 - sw) / 0.07, 2.0)) * uSweep * smoothstep(0.15, 0.5, h);
  gl_FragColor = vec4(col * c.a, c.a);
}`;

  function create() {
    let gl = null, canvas = null, ok = false, tried = false, precision = 'mediump';
    let P = null, texSrc = null, hA = null, hB = null;
    let cw = 0, ch = 0;

    function shader(type, s) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    }
    function program(fs) {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, `precision ${precision} float;\n${fs}`));
      gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
      const cache = {};
      return { p, u: n => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
    }
    function newTex() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function target(w, h) {
      const t = newTex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, f, w, h };
    }

    function init() {
      tried = true;
      if (/nogl/.test(location.hash)) return false;
      try {
        canvas = document.createElement('canvas');
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
        if (!gl) return false;
        const hf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        precision = hf && hf.precision > 0 ? 'highp' : 'mediump';
        P = { blur: program(FS_BLUR), light: program(FS_LIGHT) };
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        texSrc = newTex();
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; });
        ok = true;
      } catch (e) { ok = false; gl = null; }
      return ok;
    }

    function size(w, h) {
      if (!ok || (w === cw && h === ch)) return;
      canvas.width = w; canvas.height = h; cw = w; ch = h;
      for (const t of [hA, hB]) if (t) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.f); }
      const hw = Math.max(1, Math.ceil(w / 2)), hh = Math.max(1, Math.ceil(h / 2));
      hA = target(hw, hh); hB = target(hw, hh);
    }

    function pass(pr, out, fn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null);
      gl.viewport(0, 0, out ? out.w : cw, out ? out.h : ch);
      gl.useProgram(pr.p);
      fn(pr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function bind(pr, unit, t, name) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(pr.u(name), unit); }

    /* Light a painted canvas with material M under light {dir, key, amb, rim}.
       o.still freezes motion (bend, caustics, sweep); o.rad sets the height-field blur radius in pixels. */
    function light(srcCanvas, M, t, Lt, o = {}) {
      if (!tried) init();
      if (!ok || gl.isContextLost()) return srcCanvas;
      const w = srcCanvas.width, h = srcCanvas.height;
      size(w, h);
      Lt = Lt || STUDIO;
      gl.bindTexture(gl.TEXTURE_2D, texSrc);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      const rad = o.rad || Math.max(3, Math.min(w, h) * 0.05);
      const step = rad / 2 / 6;
      const d = Lt.dir, sway = Lt.sway === false ? 0 : Math.sin(t * 0.35) * 0.12;
      pass(P.blur, hA, pr => { bind(pr, 0, texSrc, 'uTex'); gl.uniform2f(pr.u('uDir'), step * 2 / w, 0); gl.uniform1f(pr.u('uCanvas'), 1); });
      pass(P.blur, hB, pr => { bind(pr, 0, hA.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 0, step / hA.h); gl.uniform1f(pr.u('uCanvas'), 0); });
      pass(P.light, null, pr => {
        bind(pr, 0, texSrc, 'uSrc'); bind(pr, 1, hB.t, 'uH');
        gl.uniform2f(pr.u('uPx'), 1 / w, 1 / h);
        gl.uniform1f(pr.u('uTime'), t % 1000);
        gl.uniform1f(pr.u('uGloss'), M.gloss); gl.uniform1f(pr.u('uShine'), M.shine); gl.uniform1f(pr.u('uIrid'), M.irid);
        gl.uniform1f(pr.u('uMetal'), M.metal); gl.uniform1f(pr.u('uScale'), M.scale || 0); gl.uniform1f(pr.u('uBend'), o.still ? 0 : M.bend || 0);
        gl.uniform1f(pr.u('uBack'), M.back); gl.uniform1f(pr.u('uCaust'), o.still ? 0 : M.caust || 0); gl.uniform1f(pr.u('uSweep'), o.still ? 0 : M.sweep || 0);
        gl.uniform1f(pr.u('uNorm'), M.norm); gl.uniform1f(pr.u('uDetail'), M.detail);
        gl.uniform1f(pr.u('uDel'), Math.max(1.5, rad * 0.45));
        gl.uniform1f(pr.u('uScaleSize'), Math.max(4, Math.min(w, h) * 0.05));
        gl.uniform3fv(pr.u('uRim'), Lt.rim || M.rim);
        gl.uniform3f(pr.u('uLightDir'), d[0] + sway, d[1], d[2]);
        gl.uniform3fv(pr.u('uKey'), Lt.key); gl.uniform3fv(pr.u('uAmb'), Lt.amb);
      });
      return canvas;
    }
    return { light, get ok() { if (!tried) init(); return ok; } };
  }

  /* Neutral light used for menus and the shop: soft white from the upper left. */
  const STUDIO = { dir: [-0.5, 0.62, 0.72], key: [1, 1, 1], amb: [0.64, 0.64, 0.64], rim: null };
  return { create, STUDIO };
})();

/* The fish: species materials on top of one lighting engine. */
const FishGL = (() => {
  const eng = LitGL.create();
  let src = null, sctx = null;
  const BASE = {
    common:    { gloss: 0.45, shine: 30, irid: 0.06, metal: 0.25, scale: 0.6, bend: 0.010, back: 0.5, caust: 0.10, sweep: 0.0, norm: 1.5, detail: 1.5, rim: [0.55, 0.68, 0.8] },
    rare:      { gloss: 0.55, shine: 36, irid: 0.10, metal: 0.30, scale: 0.6, bend: 0.010, back: 0.6, caust: 0.12, sweep: 0.16, norm: 1.6, detail: 1.6, rim: [0.55, 0.75, 1.0] },
    epic:      { gloss: 0.62, shine: 44, irid: 0.18, metal: 0.30, scale: 0.45, bend: 0.012, back: 1.0, caust: 0.14, sweep: 0.26, norm: 1.5, detail: 1.6, rim: [0.85, 0.7, 1.0] },
    legendary: { gloss: 0.50, shine: 24, irid: 0.16, metal: 0.10, scale: 0.0, bend: 0.0, back: 0.3, caust: 0.08, sweep: 0.34, norm: 1.3, detail: 1.6, rim: [1.0, 0.86, 0.5] },
    extreme:   { gloss: 0.95, shine: 52, irid: 0.22, metal: 0.80, scale: 0.0, bend: 0.008, back: 0.8, caust: 0.12, sweep: 0.42, norm: 1.6, detail: 2.4, rim: [1.0, 0.72, 0.38] },
  };
  const OVR = {
    salmon: { irid: 0.28, metal: 0.55 }, pomfret: { irid: 0.34, metal: 0.6, scale: 0.3 }, barracuda: { irid: 0.25, metal: 0.55 },
    catfish: { gloss: 0.72, shine: 20, scale: 0.0, detail: 1.0 }, crucian: { scale: 0.0, metal: 0.45, detail: 1.8 }, carp: { scale: 0.0, metal: 0.42, detail: 1.8 },
    tilapia: { scale: 0.2 }, puffer: { scale: 0.0, bend: 0.004, detail: 0.8 }, pike: { scale: 0.4 }, grouper: { scale: 0.0, detail: 1.1 },
    koi: { irid: 0.12, metal: 0.35, scale: 0.4 }, flyingfish: { bend: 0.0, scale: 0.0, irid: 0.34, gloss: 0.7, detail: 1.2 },
    bluegill: { scale: 0.3 }, perch: { scale: 0.35 }, mudskipper: { scale: 0.0, gloss: 0.62, shine: 24, detail: 1.2 },
    lanternfish: { metal: 0.5, irid: 0.22, scale: 0.2 }, clownfish: { scale: 0.0, gloss: 0.6, detail: 1.1 },
    snapper: { scale: 0.3, metal: 0.35, irid: 0.1 }, cod: { scale: 0.15, detail: 1.3 }, char: { scale: 0.2, irid: 0.12 },
    goldfish: { metal: 0.5, irid: 0.14, scale: 0.35, bend: 0.006 },
    bass: { scale: 0.35 }, eel: { scale: 0.0, gloss: 0.78, shine: 30, bend: 0.0, detail: 1.1 }, lionfish: { scale: 0.0, bend: 0.0, detail: 1.1 },
    sturgeon: { scale: 0.0, detail: 1.9, metal: 0.2 }, snakehead: { scale: 0.3 },
    angelfish: { scale: 0.0, bend: 0.0, irid: 0.3, metal: 0.45 }, betta: { irid: 0.34, metal: 0.3, scale: 0.2, bend: 0.0 },
    seahorse: { scale: 0.0, bend: 0.0, metal: 0.45, detail: 1.9 }, oarfish: { scale: 0.0, bend: 0.0, metal: 0.7, irid: 0.3 },
    swordfish: { scale: 0.0, metal: 0.55, irid: 0.22, bend: 0.006 },
    dolphin: { scale: 0.0, bend: 0.0, gloss: 0.85, shine: 42, metal: 0.05, irid: 0.04, back: 0.2, detail: 1.0, norm: 1.5 },
  };
  const mat = id => Object.assign({}, BASE[SPECIES[id].rarity], OVR[id] || {});

  /* Paint and light a species into a w×h (device pixel) canvas and return it.
     o.fit, o.fill: framing; o.still: no motion; o.light: scene light (studio light by default). */
  function render(id, t, w, h, o = {}) {
    if (!src) { src = document.createElement('canvas'); sctx = src.getContext('2d'); }
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (src.width !== w || src.height !== h) { src.width = w; src.height = h; }
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, w, h);
    FishArt.drawFitted(sctx, id, t, w / 2, h / 2, w * (o.fit ?? 0.9), h * (o.fit ?? 0.86), { fill: o.fill });
    return eng.light(src, mat(id), t, o.light, { still: o.still });
  }

  return { render, get ok() { return eng.ok; } };
})();
