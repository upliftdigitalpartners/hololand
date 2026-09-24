import * as THREE from 'three';
import { GLSL_NOISE, GLSL_ARCH } from './glsl.js';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform float uTime, uProgress, uScroll, uVel, uMobile;
  uniform vec2 uRes, uMouse, uCenter, uSize;
  uniform sampler2D uTex0, uTex1;
  uniform float uAspect0, uAspect1;
  varying vec2 vUv;
  ${GLSL_NOISE}
  ${GLSL_ARCH}

  vec2 coverUv(vec2 uv, float texAspect, float boxAspect) {
    vec2 s = boxAspect > texAspect ? vec2(1.0, texAspect / boxAspect) : vec2(boxAspect / texAspect, 1.0);
    return (uv - 0.5) * s + 0.5;
  }

  void main() {
    vec2 frag = vUv * uRes;
    vec2 p = (frag - 0.5 * uRes) / uRes.y;
    vec2 m = uMouse;
    float aspect = uRes.x / uRes.y;
    float s = smoothstep(0.0, 1.0, uScroll);

    // ---- silk background: domain-warped fbm in ink / maroon / ember
    vec2 q = p * 1.5;
    float t = uTime * 0.045;
    vec2 w = vec2(fbm(q + vec2(0.0, t) + m * 0.15), fbm(q + vec2(5.2, 1.3) - t));
    float f = fbm(q + 2.4 * w + vec2(t * 0.6, 0.0));
    vec3 ink = vec3(0.051, 0.039, 0.035);
    vec3 maroon = vec3(0.30, 0.075, 0.095);
    vec3 ember = vec3(0.93, 0.45, 0.08);
    vec3 bg = mix(ink, maroon, smoothstep(0.35, 0.9, f) * 0.8);
    float sheen = pow(smoothstep(0.5, 0.95, f + 0.18 * w.x), 3.0);
    bg += ember * sheen * 0.32;
    bg *= 1.0 - 0.9 * dot(p * vec2(0.55, 1.0), p * vec2(0.55, 1.0));

    // ---- arch window (grows to fill the screen on scroll)
    vec2 c = mix(uCenter - m * vec2(0.02, 0.012), vec2(0.0, 0.0), s);
    float A = aspect * 0.75 + 0.25;
    vec2 hs = mix(uSize, vec2(A, A + 0.65), s);
    vec2 ap = p - c;
    float d = sdArch(ap, hs);
    float aa = 1.5 / uRes.y;

    // nested ghost arches, like the studio set
    float ghosts = 0.0;
    for (int i = 1; i <= 3; i++) {
      float fi = float(i);
      vec2 gp = ap + m * 0.018 * fi;
      float gd = sdArch(gp, uSize + vec2(0.042 * fi));
      ghosts += smoothstep(aa * 1.5, 0.0, abs(gd)) * (0.28 / fi);
    }
    ghosts *= 1.0 - s;

    // image uv inside the arch bounding box
    vec2 uv = (ap + hs) / (hs * 2.0);
    vec2 mp = (m - c);
    vec2 toM = ap - mp;
    float md = length(toM);
    uv += normalize(toM + 1e-5) * sin(md * 38.0 - uTime * 5.0) * exp(-md * 7.0) * uVel * 0.02;
    uv = (uv - 0.5) * 0.94 + 0.5 + m * vec2(0.012, 0.008);
    float boxAspect = hs.x / hs.y;
    vec2 uv0 = coverUv(uv, uAspect0, boxAspect);
    vec2 uv1 = coverUv(uv, uAspect1, boxAspect);

    // noise dissolve sweeping upward between slides
    float n = fbm(uv * 3.2 + uTime * 0.08);
    float k = uProgress * 1.35 - 0.2;
    float v = n * 0.55 + (1.0 - uv.y) * 0.45;
    float mask = smoothstep(k - 0.06, k + 0.06, v);
    vec2 disp = vec2(0.0, (n - 0.5) * 0.12);
    float sh = 0.001 + abs(uVel) * 0.008;
    vec3 t0 = vec3(texture2D(uTex0, uv0 + disp * uProgress + vec2(sh, 0.0)).r,
                   texture2D(uTex0, uv0 + disp * uProgress).g,
                   texture2D(uTex0, uv0 + disp * uProgress - vec2(sh, 0.0)).b);
    vec3 t1 = vec3(texture2D(uTex1, uv1 - disp * (1.0 - uProgress) + vec2(sh, 0.0)).r,
                   texture2D(uTex1, uv1 - disp * (1.0 - uProgress)).g,
                   texture2D(uTex1, uv1 - disp * (1.0 - uProgress) - vec2(sh, 0.0)).b);
    vec3 img = mix(t1, t0, mask);
    float seam = 1.0 - abs(mask * 2.0 - 1.0);
    img += ember * seam * 0.9 * step(0.001, uProgress) * step(uProgress, 0.999);

    // mobile: text sits over the arch, so darken its lower half
    img *= mix(1.0, 0.25 + 0.75 * smoothstep(-0.2, 0.2, p.y), uMobile);
    img *= mix(1.0, 0.55, s);

    float inside = smoothstep(aa, -aa, d);
    float outline = smoothstep(aa * 1.6, 0.0, abs(d - 0.016)) * (1.0 - s);
    float glow = exp(-max(d, 0.0) * 14.0) * 0.22 * (1.0 - s);

    vec3 col = mix(bg, img, inside);
    col += vec3(0.94, 0.9, 0.86) * ghosts;
    col += ember * (outline * 0.85 + glow * (1.0 - inside));

    col += (hash(frag + fract(uTime * 7.0) * 100.0) - 0.5) * 0.04;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Hero {
  constructor(canvas, slides, { onSlide } = {}) {
    this.canvas = canvas;
    this.slides = slides;
    this.onSlide = onSlide;
    this.index = 0;
    this.mouse = new THREE.Vector2();
    this.mouseTarget = new THREE.Vector2();
    this.vel = 0;
    this.running = true;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.t0 = performance.now();
    this.last = this.t0;

    this.uniforms = {
      uTime: { value: 0 }, uProgress: { value: 0 }, uScroll: { value: 0 }, uVel: { value: 0 }, uMobile: { value: 0 },
      uRes: { value: new THREE.Vector2() }, uMouse: { value: this.mouse },
      uCenter: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() },
      uTex0: { value: null }, uTex1: { value: null }, uAspect0: { value: 0.667 }, uAspect1: { value: 0.667 },
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms, depthTest: false })
    );
    this.scene.add(this.mesh);

    this.onResize = this.onResize.bind(this);
    this.onMove = this.onMove.bind(this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    this.onResize();
  }

  /** Loads all slide textures, reporting 0..1 progress. */
  async load(onProgress = () => {}) {
    const loader = new THREE.TextureLoader();
    let done = 0;
    this.textures = await Promise.all(this.slides.map((s) => new Promise((resolve) => {
      loader.load(s.src, (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        this.renderer.initTexture(tex);
        onProgress(++done / this.slides.length);
        resolve(tex);
      }, undefined, () => { onProgress(++done / this.slides.length); resolve(null); });
    })));
    this.setPair(0, 0);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  setPair(a, b) {
    const ta = this.textures[a], tb = this.textures[b];
    this.uniforms.uTex0.value = ta;
    this.uniforms.uTex1.value = tb;
    this.uniforms.uAspect0.value = ta ? ta.image.width / ta.image.height : 0.667;
    this.uniforms.uAspect1.value = tb ? tb.image.width / tb.image.height : 0.667;
  }

  /** Starts auto-advancing slides with GSAP-driven dissolves. */
  autoplay(gsap, interval = 5.5) {
    const next = () => {
      const from = this.index;
      const to = (from + 1) % this.slides.length;
      this.setPair(from, to);
      this.uniforms.uProgress.value = 0;
      gsap.to(this.uniforms.uProgress, {
        value: 1, duration: 1.8, ease: 'power2.inOut',
        onComplete: () => { this.index = to; this.setPair(to, to); this.uniforms.uProgress.value = 0; },
      });
      this.onSlide?.(to, interval);
    };
    this.onSlide?.(0, interval);
    this.timer = gsap.delayedCall(interval, function loop() { next(); gsap.delayedCall(interval, loop); });
  }

  setScroll(v) { this.uniforms.uScroll.value = v; }
  setRunning(v) { this.running = v; }

  onMove(e) {
    const h = window.innerHeight;
    const nx = (e.clientX - window.innerWidth / 2) / h;
    const ny = -(e.clientY - h / 2) / h;
    this.vel += Math.hypot(nx - this.mouseTarget.x, ny - this.mouseTarget.y) * 6;
    this.mouseTarget.set(nx, ny);
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    this.uniforms.uRes.value.set(w * dpr, h * dpr);
    const aspect = w / h;
    const mobile = aspect < 0.9;
    this.uniforms.uMobile.value = mobile ? 1 : 0;
    if (mobile) {
      const hy = 0.25;
      const hx = Math.min(hy * 0.66, aspect * 0.5 * 0.72);
      this.uniforms.uSize.value.set(hx, hy);
      this.uniforms.uCenter.value.set(0, 0.17);
    } else {
      const hy = 0.37;
      const hx = hy * 0.64;
      this.uniforms.uSize.value.set(hx, hy);
      this.uniforms.uCenter.value.set(Math.max(aspect * 0.5 - hx - 0.22, 0.3), 0.03);
    }
  }

  tick() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.uniforms.uTime.value += dt;
    this.mouse.lerp(this.mouseTarget, 0.06);
    this.vel *= 0.92;
    this.uniforms.uVel.value += (Math.min(this.vel, 1) - this.uniforms.uVel.value) * 0.1;
    this.renderer.render(this.scene, this.camera);
  }
}
