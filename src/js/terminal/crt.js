/**
 * CRT post-processing in WebGL2.
 *
 * Pipeline, every frame:
 *   1. beam     — barrel distortion, Gaussian scanlines whose width follows
 *                 brightness, sharp horizontal reconstruction, phosphor
 *                 persistence (ping-pong with the previous frame)
 *   2. bloom    — quarter-resolution downsample + separable Gaussian blur
 *   3. composite— bloom, glass tint, vignette, tube mask, noise, flicker
 * Power on/off animations are driven by uniforms.
 *
 * Falls back to a crisp 2D upscale when WebGL2 is unavailable.
 */

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BEAM = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uPrev;
uniform vec2 uSourceSize;
uniform vec2 uOutputSize;
uniform vec2 uContent;
uniform float uCurvature;
uniform float uScanlines;
uniform float uSharpness;
uniform float uPersistence;
uniform vec2 uPowerScale;
uniform float uPowerBoost;
uniform float uPowerWhite;
uniform float uJitter;
uniform float uTime;
in vec2 vUv;
out vec4 outColor;

vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + uCurvature * dot(c, c);
  return c * 0.5 + 0.5;
}

vec3 fetch(float x, float row) {
  vec2 p = clamp(vec2(x, row), vec2(0.0), uSourceSize - 1.0);
  return texelFetch(uSource, ivec2(p), 0).rgb;
}

vec3 sampleRow(float row, float x) {
  float fx = x - 0.5;
  float x0 = floor(fx);
  float t = clamp((fx - x0 - 0.5) * uSharpness + 0.5, 0.0, 1.0);
  return mix(fetch(x0, row), fetch(x0 + 1.0, row), t);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = barrel(vUv);
  uv = (uv - 0.5) / uPowerScale + 0.5;
  vec2 p = (uv - 0.5) / uContent + 0.5;
  if (uJitter > 0.0) {
    float line = floor(p.y * uSourceSize.y);
    p.x += (fract(sin(line * 12.9898 + floor(uTime * 24.0) * 78.233) * 43758.5453) - 0.5) * uJitter;
  }
  vec3 color = vec3(0.0);
  if (p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {
    vec2 src = vec2(p.x * uSourceSize.x, (1.0 - p.y) * uSourceSize.y);
    float row = floor(src.y);
    float dy = src.y - row - 0.5;
    float nb = dy >= 0.0 ? 1.0 : -1.0;
    vec3 a = sampleRow(row, src.x);
    vec3 b = sampleRow(row + nb, src.x);
    float sa = mix(0.28, 0.48, luma(a));
    float sb = mix(0.28, 0.48, luma(b));
    float db = dy - nb;
    vec3 beam = a * exp(-(dy * dy) / (2.0 * sa * sa)) + b * exp(-(db * db) / (2.0 * sb * sb));
    float pxPerRow = uOutputSize.y * uContent.y * uPowerScale.y / uSourceSize.y;
    float visible = clamp((pxPerRow - 1.8) / 1.8, 0.0, 1.0) * uScanlines;
    vec3 smooth_ = mix(a, b, abs(dy) * 0.5);
    color = mix(smooth_, beam * 1.18, visible);
    color = mix(color, vec3(1.0), uPowerWhite);
  }
  color *= uPowerBoost;
  // Decay with a floor so 8-bit rounding cannot leave a permanent residue.
  vec3 prev = max(texture(uPrev, vUv).rgb * uPersistence - 2.0 / 255.0, 0.0);
  outColor = vec4(max(color, prev), 1.0);
}`;

const DOWNSAMPLE = `#version 300 es
precision highp float;
uniform sampler2D uInput;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(uInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uInput, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uInput, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uInput, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(c * 0.25, 1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uInput;
uniform vec2 uDirection;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 c = texture(uInput, vUv).rgb * 0.2270270270;
  c += texture(uInput, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
  c += texture(uInput, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
  c += texture(uInput, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
  c += texture(uInput, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uBeam;
uniform sampler2D uBloom;
uniform vec2 uOutputSize;
uniform float uCurvature;
uniform float uCorner;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uNoise;
uniform float uBrightness;
uniform float uRoll;
uniform float uTime;
uniform vec3 uGlass;
in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  vec2 cc = c * (1.0 + uCurvature * dot(c, c));
  float d = roundedBox(cc, vec2(1.0), uCorner);
  float aa = 2.5 / min(uOutputSize.x, uOutputSize.y);
  float tube = 1.0 - smoothstep(-aa, aa, d);

  vec3 color = texture(uBeam, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  color *= uBrightness;

  // Rolling refresh band, very faint.
  float roll = fract(vUv.y * 0.9 - uTime * 0.11);
  color *= 1.0 + uRoll * smoothstep(0.0, 0.08, roll) * smoothstep(0.35, 0.08, roll);

  // Glass: the phosphor coating catches room light, brighter near the centre.
  float centre = clamp(1.0 - dot(cc, cc) * 0.32, 0.0, 1.0);
  color += uGlass * (0.55 + 0.45 * centre);

  // Vignette and darker rim where the glass bends away.
  color *= mix(1.0, smoothstep(1.55, 0.35, length(cc)), uVignette);
  color *= mix(0.55, 1.0, smoothstep(0.0, -0.09, d));

  // Faint specular highlight, upper left.
  float glare = smoothstep(0.85, 0.0, length((cc - vec2(-0.5, 0.62)) * vec2(0.9, 1.6)));
  color += vec3(0.8, 0.86, 0.95) * glare * 0.035;

  color += (hash(gl_FragCoord.xy + fract(uTime * 7.13) * 511.0) - 0.5) * uNoise;
  outColor = vec4(max(color, 0.0) * tube, 1.0);
}`;

const DEFAULTS = {
  curvature: 0.045,
  corner: 0.1,
  content: [0.87, 0.875],
  scanlines: 0.85,
  sharpness: 2.2,
  persistence: 0.55,
  bloom: 0.55,
  vignette: 0.5,
  noise: 0.028,
  flicker: 0.012,
  roll: 0.02,
  glass: [0.036, 0.042, 0.046],
  maxPixelRatio: 2,
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`CRT shader: ${log}`);
  }
  return shader;
}

function program(gl, fragment) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`CRT program: ${gl.getProgramInfoLog(p)}`);
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(p, i);
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, uniforms };
}

const ease = {
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
};
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export class CRT {
  static supported() {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }

  /**
   * @param {HTMLCanvasElement} canvas output canvas
   * @param {object} [options] see DEFAULTS; `effects: false` disables the WebGL pipeline
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = { ...DEFAULTS, ...options };
    this.power = options.power ?? 1; // 1 = on, 0 = off
    this.animation = null;
    this.powerUniforms = { scale: [1, 1], boost: this.power ? 1 : 0, white: 0 };
    this.jitter = 0;
    this.gl = options.effects === false ? null : canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (this.gl) {
      try {
        this.init();
      } catch (error) {
        console.warn(error);
        this.gl = null;
      }
    }
    if (!this.gl) this.ctx = canvas.getContext('2d', { alpha: false });
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); });
  }

  get webgl() {
    return !!this.gl;
  }

  set(options) {
    Object.assign(this.options, options);
  }

  init() {
    const gl = this.gl;
    this.programs = {
      beam: program(gl, BEAM),
      downsample: program(gl, DOWNSAMPLE),
      blur: program(gl, BLUR),
      composite: program(gl, COMPOSITE),
    };
    this.vao = gl.createVertexArray();
    this.source = this.createTexture(1, 1, gl.NEAREST);
    this.targets = null;
    this.size = [0, 0];
    this.frame = 0;
  }

  createTexture(width, height, filter = this.gl.LINEAR) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  createTarget(width, height) {
    const gl = this.gl;
    const texture = this.createTexture(width, height);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  }

  deleteTargets() {
    if (!this.targets) return;
    const gl = this.gl;
    for (const t of Object.values(this.targets).flat()) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    this.targets = null;
  }

  /** Match the drawing buffer to the element size. Returns true on change. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio);
    const width = Math.max(2, Math.round(rect.width * ratio));
    const height = Math.max(2, Math.round(rect.height * ratio));
    if (width === this.canvas.width && height === this.canvas.height && (this.targets || !this.gl)) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.gl) {
      this.deleteTargets();
      const bw = Math.max(1, Math.round(width / 4));
      const bh = Math.max(1, Math.round(height / 4));
      this.targets = {
        beam: [this.createTarget(width, height), this.createTarget(width, height)],
        bloom: [this.createTarget(bw, bh), this.createTarget(bw, bh)],
      };
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Power animations                                                  */
  /* ---------------------------------------------------------------- */

  powerOn() {
    return this.animate('on', 900);
  }

  powerOff() {
    return this.animate('off', 700);
  }

  animate(kind, duration) {
    this.animation?.resolve();
    return new Promise((resolve) => {
      this.animation = { kind, start: performance.now(), duration, resolve };
    });
  }

  /** Update power uniforms; returns true while an animation runs. */
  updatePower(now) {
    const a = this.animation;
    const u = this.powerUniforms;
    if (!a) {
      u.scale = [1, 1];
      u.boost = this.power;
      u.white = 0;
      return false;
    }
    const t = (now - a.start) / a.duration;
    if (a.kind === 'on') {
      const s = t * a.duration / 1000;
      const open = ease.out(clamp01((s - 0.04) / 0.2));
      u.scale = [1, Math.max(0.004, open)];
      u.white = 1 - clamp01((s - 0.1) / 0.3);
      u.boost = s < 0.04 ? s / 0.04 : 1 + 1.6 * (1 - clamp01((s - 0.04) / 0.8));
    } else {
      const s = t * a.duration / 1000;
      const squash = ease.in(clamp01(s / 0.18));
      const narrow = ease.in(clamp01((s - 0.18) / 0.14));
      u.scale = [Math.max(0.004, 1 - narrow), Math.max(0.004, 1 - squash)];
      u.white = clamp01(s / 0.18);
      u.boost = s < 0.32 ? 1 + squash * 1.5 : 2.5 * (1 - clamp01((s - 0.32) / 0.3));
    }
    if (t >= 1) {
      this.power = a.kind === 'on' ? 1 : 0;
      this.animation = null;
      a.resolve();
      return this.updatePower(now) || true;
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Draw a frame. `source` is the native framebuffer canvas; pass
   * `sourceChanged` to re-upload it.
   */
  render(source, sourceChanged, now = performance.now()) {
    this.resize();
    this.updatePower(now);
    if (!this.gl) return this.render2d(source);
    if (this.lost) return undefined;
    const gl = this.gl;
    const o = this.options;
    const { beam, bloom } = this.targets;
    const width = this.canvas.width;
    const height = this.canvas.height;

    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    if (sourceChanged || this.sourceWidth !== source.width) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.sourceWidth = source.width;
      this.sourceHeight = source.height;
    }

    // 1. Beam, with persistence from the previous frame.
    const current = beam[this.frame % 2];
    const previous = beam[(this.frame + 1) % 2];
    this.frame++;
    let p = this.programs.beam;
    gl.useProgram(p.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, current.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.uniform1i(p.uniforms.uSource, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture);
    gl.uniform1i(p.uniforms.uPrev, 1);
    gl.uniform2f(p.uniforms.uSourceSize, this.sourceWidth, this.sourceHeight);
    gl.uniform2f(p.uniforms.uOutputSize, width, height);
    gl.uniform2f(p.uniforms.uContent, o.content[0], o.content[1]);
    gl.uniform1f(p.uniforms.uCurvature, o.curvature);
    gl.uniform1f(p.uniforms.uScanlines, o.scanlines);
    gl.uniform1f(p.uniforms.uSharpness, o.sharpness);
    gl.uniform1f(p.uniforms.uPersistence, o.persistence);
    gl.uniform2f(p.uniforms.uPowerScale, ...this.powerUniforms.scale);
    gl.uniform1f(p.uniforms.uPowerBoost, this.powerUniforms.boost);
    gl.uniform1f(p.uniforms.uPowerWhite, this.powerUniforms.white);
    gl.uniform1f(p.uniforms.uJitter, this.jitter);
    gl.uniform1f(p.uniforms.uTime, now / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Bloom.
    p = this.programs.downsample;
    gl.useProgram(p.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloom[0].framebuffer);
    gl.viewport(0, 0, bloom[0].width, bloom[0].height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, current.texture);
    gl.uniform1i(p.uniforms.uInput, 0);
    gl.uniform2f(p.uniforms.uTexel, 1 / width, 1 / height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    p = this.programs.blur;
    gl.useProgram(p.program);
    gl.uniform1i(p.uniforms.uInput, 0);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloom[1].framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, bloom[0].texture);
      gl.uniform2f(p.uniforms.uDirection, (1 + i) / bloom[0].width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloom[0].framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, bloom[1].texture);
      gl.uniform2f(p.uniforms.uDirection, 0, (1 + i) / bloom[0].height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 3. Composite to the canvas.
    p = this.programs.composite;
    gl.useProgram(p.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, current.texture);
    gl.uniform1i(p.uniforms.uBeam, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom[0].texture);
    gl.uniform1i(p.uniforms.uBloom, 1);
    gl.uniform2f(p.uniforms.uOutputSize, width, height);
    gl.uniform1f(p.uniforms.uCurvature, o.curvature);
    gl.uniform1f(p.uniforms.uCorner, o.corner);
    gl.uniform1f(p.uniforms.uBloomStrength, o.bloom);
    gl.uniform1f(p.uniforms.uVignette, o.vignette);
    gl.uniform1f(p.uniforms.uNoise, o.noise);
    gl.uniform1f(p.uniforms.uBrightness, 1 + (Math.random() - 0.5) * 2 * o.flicker);
    gl.uniform1f(p.uniforms.uRoll, o.roll);
    gl.uniform1f(p.uniforms.uTime, now / 1000);
    gl.uniform3f(p.uniforms.uGlass, ...o.glass);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return undefined;
  }

  /** Crisp fallback: nearest-neighbour upscale inside the glass. */
  render2d(source) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const o = this.options;
    const g = o.glass.map((c) => Math.round(c * 255));
    ctx.fillStyle = `rgb(${g[0]}, ${g[1]}, ${g[2]})`;
    ctx.fillRect(0, 0, width, height);
    const w = width * o.content[0] * this.powerUniforms.scale[0];
    const h = height * o.content[1] * this.powerUniforms.scale[1];
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.min(1, this.powerUniforms.boost);
    ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
    ctx.globalAlpha = 1;
  }

  destroy() {
    if (this.gl) {
      this.deleteTargets();
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}
