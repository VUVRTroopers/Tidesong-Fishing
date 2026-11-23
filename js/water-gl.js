/* Tidesong — WebGL sky and water renderer.
   Draws behind the 2D canvas. Per frame:
   1. scene pass: analytic dithered sky + painted scenery + live sky layer, and perspective water with
      multi-frequency waves, mirrored reflections that distort more toward the foreground, ripple rings,
      a sun/moon glitter path, sky glints and horizon haze. Wind sways masked foliage.
   2. bloom: bright pass at 1/4 resolution, blurred at 1/4 and 1/8.
   3. god rays from the sun or moon (screen-space light scattering at 1/4 resolution).
   4. composite with vignette and dither.
   Falls back silently (ok = false) when WebGL is unavailable. */
'use strict';

const WaterGL = (() => {
  let gl = null, canvas = null, ok = false, precision = 'mediump';
  let P = null, buf = null;
  const tex = {};
  let fb = null;
  let W = 0, H = 0;
  let meta = null;
  let lastScene = null;
  const MAX_RIP = 10;
  const ripData = new Float32Array(MAX_RIP * 4);

  const VS = `attribute vec2 aPos; varying vec2 vUv; varying vec2 vFb;
void main() { vFb = aPos * 0.5 + 0.5; vUv = vec2(vFb.x, 1.0 - vFb.y); gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS_SCENE = `
varying vec2 vUv;
uniform sampler2D uBg, uDyn, uMask;
uniform vec2 uRes;
uniform float uAspect, uTime, uHor, uDynH;
uniform vec3 uSky0, uSky1, uSky2, uSky3, uSky4;
uniform vec4 uSkyOff;
uniform vec2 uLight;
uniform vec3 uLightCol;
uniform float uHaloA, uHaloR;
uniform vec3 uW0, uW1, uW2;
uniform float uRefl, uGlint, uSway, uHaze;
uniform vec3 uHazeCol;
uniform vec4 uRip[${MAX_RIP}];
uniform vec4 uBob;
uniform vec4 uFish;   // x, y (uv), length (in screen heights), heading (radians, on the water plane; depth axis squashed by 0.6)
uniform vec4 uFishB;  // opacity, tail phase, depth (0 shallow, 1 deep), tail swing

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 seg(vec3 c, vec3 to, float a, float b, float y) { return mix(c, to, clamp((y - a) / max(b - a, 1e-4), 0.0, 1.0)); }
vec3 skyGrad(float y) {
  vec3 c = seg(uSky0, uSky1, 0.0, uSkyOff.x, y);
  c = seg(c, uSky2, uSkyOff.x, uSkyOff.y, y);
  c = seg(c, uSky3, uSkyOff.y, uSkyOff.z, y);
  return seg(c, uSky4, uSkyOff.z, uSkyOff.w, y);
}

vec3 skyAt(vec2 uv) {
  float m = texture2D(uMask, uv).r;
  uv.x += m * uSway * (sin(uTime * 1.15 + uv.y * 34.0) * 0.6 + sin(uTime * 0.57 + uv.y * 13.0 + uv.x * 9.0) * 0.4) * 0.0042;
  vec3 c = skyGrad(uv.y / uHor);
  float d = length((uv - uLight) * vec2(uAspect, 1.0));
  c = mix(c, uLightCol, clamp(uHaloA * pow(max(0.0, 1.0 - d / uHaloR), 2.4), 0.0, 1.0));
  vec4 bg = texture2D(uBg, uv);
  c = c * (1.0 - bg.a) + bg.rgb;
  vec4 dy = texture2D(uDyn, vec2(uv.x, clamp(uv.y / uDynH, 0.0, 0.999)));
  return c * (1.0 - dy.a) + dy.rgb;
}

// A fish seen from above, in its own frame: head toward +x, length 1, centred on the origin.
float fishShape(vec2 q, float soft) {
  float bend = sin(uFishB.y) * uFishB.w * pow(max(0.0, 0.18 - q.x), 2.0) * 0.32;
  q.y -= bend;
  float body = length(vec2((q.x - 0.04) / 0.37, q.y / (0.115 + 0.035 * smoothstep(-0.3, 0.3, q.x))));
  float m = smoothstep(1.0 + soft, 1.0 - soft, body);
  float tk = clamp((-0.29 - q.x) / 0.21, 0.0, 1.0);
  float hw = 0.022 + tk * 0.12 - smoothstep(0.75, 1.0, tk) * 0.07 * smoothstep(0.03, 0.0, abs(q.y));
  float tail = smoothstep(hw + soft * 0.12, hw - soft * 0.12, abs(q.y)) * smoothstep(-0.25, -0.31, q.x) * smoothstep(-0.53, -0.47, q.x);
  vec2 f = vec2(q.x - 0.13, abs(q.y) - 0.12 - 0.02 * sin(uFishB.y * 1.3));
  float fin = smoothstep(1.0 + soft, 1.0 - soft, length(vec2(f.x / 0.075, f.y / 0.035) * mat2(0.8, 0.6, -0.6, 0.8)));
  return max(max(m, tail), fin * 0.8);
}

vec2 wave(vec2 p, vec2 dir, float f, float s, float a, float dz) {
  float aa = clamp(1.3 / (f * 6.0 * dz + 1e-4), 0.0, 1.0);
  return dir * cos(dot(p, dir) * f + uTime * s) * a * aa;
}

void main() {
  vec2 uv = vUv;
  vec3 col;
  float dith = (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0) - 0.5) / 255.0;
  if (uv.y < uHor) {
    col = skyAt(uv);
    col = mix(col, uHazeCol, exp(-(uHor - uv.y) / 0.028) * uHaze);
  } else {
    float d = (uv.y - uHor) / (1.0 - uHor);
    float z = 1.0 / (d + 0.035);
    float dz = z * z / (uRes.y * (1.0 - uHor));
    vec2 p = vec2((uv.x - 0.5) * uAspect * z, z) * 6.0;
    vec2 n = vec2(0.0);
    n += wave(p, vec2(0.10, 0.995), 2.2, 1.20, 0.42, dz);
    n += wave(p, vec2(0.62, 0.785), 3.6, -1.55, 0.30, dz);
    n += wave(p, vec2(-0.71, 0.704), 5.3, 1.90, 0.22, dz);
    n += wave(p, vec2(0.28, 0.960), 8.7, -2.60, 0.15, dz);
    n += wave(p, vec2(-0.30, 0.954), 13.1, 3.10, 0.10, dz);
    n += wave(p, vec2(0.85, 0.527), 19.7, -3.70, 0.06, dz);

    float ringLight = 0.0;
    for (int i = 0; i < ${MAX_RIP}; i++) {
      vec4 r = uRip[i];
      if (r.w <= 0.0) continue;
      vec2 dv = (uv - r.xy) * vec2(uAspect, 1.0 / 0.3);
      float dist = length(dv);
      float R = r.w * (1.0 - pow(1.0 - r.z, 3.0));
      float wdt = 0.008 + r.w * 0.3;
      float band = exp(-pow((dist - R) / wdt, 2.0));
      float fade = (1.0 - r.z) * (1.0 - r.z);
      float w = sin((dist - R) * 230.0) * band * fade;
      n += (dv / max(dist, 1e-4)) * w * 1.1;
      ringLight += max(w, 0.0) * fade;
    }
    if (uBob.z > 0.5) {
      vec2 bv = (uv - uBob.xy) * vec2(uAspect, 1.0 / 0.3);
      float bd = length(bv);
      n += (bv / max(bd, 1e-4)) * sin(bd * 420.0 - uTime * 7.0) * exp(-bd / (uBob.w * 2.2)) * 0.35;
      ringLight += 0.6 * exp(-pow((bd - uBob.w) / (uBob.w * 0.32), 2.0));
    }

    float fm = 0.0, spine = 0.0;
    if (uFishB.x > 0.002) {
      vec2 fq = uv + n * (0.0025 + 0.007 * d) - uFish.xy;
      fq = vec2(fq.x * uAspect, fq.y / 0.6) / uFish.z;
      if (dot(fq, fq) < 1.6) {
        float cs = cos(uFish.w), sn = sin(uFish.w);
        fq = vec2(fq.x * cs + fq.y * sn, -fq.x * sn + fq.y * cs);
        float soft = 0.18 + uFishB.z * 0.55;
        fm = fishShape(fq, soft) * uFishB.x;
        fm = max(fm, smoothstep(1.4, 0.0, length(fq * vec2(1.0, 2.6))) * uFishB.x * 0.28 * uFishB.z);
        // the fish's back catches a little light through the water
        spine = exp(-pow(fq.y / 0.035, 2.0)) * smoothstep(-0.3, -0.05, fq.x) * smoothstep(0.4, 0.15, fq.x) * uFishB.x * (1.0 - uFishB.z);
      }
    }

    vec2 ruv = vec2(uv.x + n.x * (0.0012 + 0.010 * d), 2.0 * uHor - uv.y + n.y * (0.0016 + 0.028 * d));
    ruv.y = clamp(ruv.y, 0.0005, uHor - 0.0015);
    vec3 refl = skyAt(ruv);

    vec3 water = mix(uW0, uW1, smoothstep(0.0, 0.3, d));
    water = mix(water, uW2, smoothstep(0.25, 1.0, d));
    float fres = clamp(uRefl * mix(1.75, 0.38, pow(d, 0.55)), 0.0, 0.95);
    float darkWater = 1.0 - smoothstep(0.04, 0.22, dot(water, vec3(0.299, 0.587, 0.114)));
    water = mix(water, water * vec3(0.30, 0.38, 0.42), fm * 0.9);
    col = mix(water, refl, fres * (1.0 - fm * 0.55));

    float streak = smoothstep(0.55, 1.0, sin(p.y * 0.33 + sin(p.x * 0.11 + uTime * 0.21) * 2.2 + uTime * 0.27));
    col += uLightCol * streak * 0.035 * (1.0 - d) * uGlint;

    float bandW = 0.012 + 0.24 * d;
    float pathMask = exp(-pow((uv.x - uLight.x) / bandW, 2.0));
    float facet = dot(n, vec2(0.33, 0.94));
    float sp = pow(clamp(facet * 0.5 + 0.55, 0.0, 1.0), 16.0);
    col += uLightCol * sp * pathMask * uGlint * (1.7 - d) * 0.9;
    float g2 = pow(clamp(dot(n, vec2(-0.55, 0.83)) * 0.5 + 0.5, 0.0, 1.0), 42.0);
    col += uLightCol * g2 * 0.32 * uGlint * (1.0 - d * 0.5);
    col += vec3(0.9, 0.97, 1.0) * ringLight * 0.16;
    col *= 1.0 - fm * 0.34;
    // on dark water the fish shows as a faint sheen on its back rather than a shadow
    col += mix(uLightCol, uW0, 0.5) * (spine * 0.1 + fm * 0.05 * darkWater) * (0.4 + 0.6 * darkWater);
    col *= 1.0 - d * 0.12;
    col = mix(col, uHazeCol, exp(-(uv.y - uHor) / 0.022) * uHaze * 0.85);
  }
  gl_FragColor = vec4(col + dith, 1.0);
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

  const FS_RAYS = `
varying vec2 vFb;
uniform sampler2D uTex;
uniform vec2 uLightFb;
uniform float uDensity;
void main() {
  vec2 delta = (vFb - uLightFb) * (uDensity / 28.0);
  vec2 tc = vFb;
  vec3 acc = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 28; i++) { tc -= delta; acc += texture2D(uTex, tc).rgb * w; w *= 0.95; }
  gl_FragColor = vec4(acc / 12.0, 1.0);
}`;

  const FS_FINAL = `
varying vec2 vUv;
varying vec2 vFb;
uniform sampler2D uScene, uB1, uB2, uRays;
uniform float uA1, uA2, uAR, uVig, uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(uScene, vFb).rgb;
  c += texture2D(uB1, vFb).rgb * uA1 + texture2D(uB2, vFb).rgb * uA2 + texture2D(uRays, vFb).rgb * uAR;
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVig * dot(q, q) * 1.25;
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
  function newTexture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  function setup() {
    const hf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    precision = hf && hf.precision > 0 ? 'highp' : 'mediump';
    P = {
      scene: program(FS_SCENE), bright: program(FS_BRIGHT), blur: program(FS_BLUR),
      copy: program(FS_COPY), rays: program(FS_RAYS), final: program(FS_FINAL),
    };
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    tex.bg = newTexture(); tex.dyn = newTexture(); tex.mask = newTexture();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    fb = null; W = H = 0;
  }

  function init(c) {
    canvas = c;
    try {
      gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' });
      if (!gl) return false;
      setup();
    } catch (e) {
      gl = null; ok = false;
      return false;
    }
    c.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; });
    c.addEventListener('webglcontextrestored', () => {
      try { setup(); ok = true; if (lastScene) setScene(...lastScene); } catch (e) { ok = false; }
    });
    ok = true;
    return true;
  }

  function resize(w, h) {
    if (!gl) return;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (w === W && h === H && fb) return;
    canvas.width = w; canvas.height = h; W = w; H = h;
    freeTargets();
    fb = {
      scene: target(W, H),
      bright: target(W / 4, H / 4), qa: target(W / 4, H / 4), qb: target(W / 4, H / 4),
      ea: target(W / 8, H / 8), eb: target(W / 8, H / 8), rays: target(W / 4, H / 4),
    };
  }

  /* bg: painted scenery with a transparent sky. mask: wind-sway amounts. m: per-scene uniforms. */
  function setScene(bg, mask, m) {
    lastScene = [bg, mask, m];
    if (!ok) return;
    upload(tex.bg, bg);
    upload(tex.mask, mask);
    meta = m;
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

  /* o: { t, dyn (canvas), ripples: [[x,y,age,maxR] uv units], bob: [x,y,visible,radius],
          fish: [x, y, length, heading], fishB: [opacity, tail phase, depth, tail swing] } */
  function render(o) {
    if (!ok || !meta || !fb) return;
    const m = meta, t = o.t % 1000;
    upload(tex.dyn, o.dyn);
    ripData.fill(0);
    const rips = o.ripples || [];
    for (let i = 0; i < Math.min(MAX_RIP, rips.length); i++) ripData.set(rips[i], i * 4);

    pass(P.scene, fb.scene, pr => {
      bind(pr, 0, tex.bg, 'uBg'); bind(pr, 1, tex.dyn, 'uDyn'); bind(pr, 2, tex.mask, 'uMask');
      gl.uniform2f(pr.u('uRes'), W, H);
      gl.uniform1f(pr.u('uAspect'), W / H);
      gl.uniform1f(pr.u('uTime'), t);
      gl.uniform1f(pr.u('uHor'), m.hor);
      gl.uniform1f(pr.u('uDynH'), m.hor);
      for (let i = 0; i < 5; i++) gl.uniform3fv(pr.u('uSky' + i), m.sky[i]);
      gl.uniform4fv(pr.u('uSkyOff'), m.skyOff);
      gl.uniform2fv(pr.u('uLight'), m.light);
      gl.uniform3fv(pr.u('uLightCol'), m.lightCol);
      gl.uniform1f(pr.u('uHaloA'), m.haloA);
      gl.uniform1f(pr.u('uHaloR'), m.haloR);
      gl.uniform3fv(pr.u('uW0'), m.water[0]); gl.uniform3fv(pr.u('uW1'), m.water[1]); gl.uniform3fv(pr.u('uW2'), m.water[2]);
      gl.uniform1f(pr.u('uRefl'), m.refl);
      gl.uniform1f(pr.u('uGlint'), m.glint);
      gl.uniform1f(pr.u('uSway'), m.sway);
      gl.uniform1f(pr.u('uHaze'), m.haze);
      gl.uniform3fv(pr.u('uHazeCol'), m.hazeCol);
      gl.uniform4fv(pr.u('uRip[0]'), ripData);
      gl.uniform4fv(pr.u('uBob'), o.bob || [0, 0, 0, 0]);
      gl.uniform4fv(pr.u('uFish'), o.fish || [0, 0, 0.1, 0]);
      gl.uniform4fv(pr.u('uFishB'), o.fishB || [0, 0, 0, 0]);
    });
    pass(P.bright, fb.bright, pr => {
      bind(pr, 0, fb.scene.t, 'uTex');
      gl.uniform2f(pr.u('uPx'), 1 / W, 1 / H);
      gl.uniform1f(pr.u('uThr'), m.bloomThr);
    });
    pass(P.blur, fb.qa, pr => { bind(pr, 0, fb.bright.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 1.4 / fb.qa.w, 0); });
    pass(P.blur, fb.qb, pr => { bind(pr, 0, fb.qa.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 0, 1.4 / fb.qb.h); });
    pass(P.copy, fb.ea, pr => bind(pr, 0, fb.qb.t, 'uTex'));
    pass(P.blur, fb.eb, pr => { bind(pr, 0, fb.ea.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 1.6 / fb.eb.w, 0); });
    pass(P.blur, fb.ea, pr => { bind(pr, 0, fb.eb.t, 'uTex'); gl.uniform2f(pr.u('uDir'), 0, 1.6 / fb.ea.h); });
    if (m.rays > 0) {
      pass(P.rays, fb.rays, pr => {
        bind(pr, 0, fb.bright.t, 'uTex');
        gl.uniform2f(pr.u('uLightFb'), m.light[0], 1 - m.light[1]);
        gl.uniform1f(pr.u('uDensity'), 0.85);
      });
    }
    pass(P.final, null, pr => {
      bind(pr, 0, fb.scene.t, 'uScene'); bind(pr, 1, fb.qb.t, 'uB1'); bind(pr, 2, fb.ea.t, 'uB2'); bind(pr, 3, fb.rays.t, 'uRays');
      gl.uniform1f(pr.u('uA1'), m.bloom1);
      gl.uniform1f(pr.u('uA2'), m.bloom2);
      gl.uniform1f(pr.u('uAR'), m.rays);
      gl.uniform1f(pr.u('uVig'), m.vignette);
      gl.uniform1f(pr.u('uTime'), t);
    });
  }

  return { init, resize, setScene, render, get ok() { return ok; } };
})();
