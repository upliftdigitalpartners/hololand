import * as THREE from 'three';

const vertex = /* glsl */ `
  uniform float uTime, uSize, uPixelRatio, uIntro;
  uniform vec2 uMouse;
  attribute float aRand;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.z += sin(uTime * 0.8 + aRand * 6.2831) * 0.04;
    p.xy += vec2(sin(uTime * 0.6 + aRand * 20.0), cos(uTime * 0.5 + aRand * 14.0)) * 0.012;

    vec3 scatter = vec3((aRand - 0.5) * 9.0, (fract(aRand * 7.31) - 0.5) * 7.0, (fract(aRand * 3.17) - 0.5) * 5.0);
    float intro = smoothstep(0.0, 1.0, clamp(uIntro * 1.6 - aRand * 0.6, 0.0, 1.0));
    p = mix(scatter, p, intro);

    vec2 dir = p.xy - uMouse;
    float dist = length(dir);
    float force = smoothstep(0.75, 0.0, dist);
    p.xy += normalize(dir + 1e-4) * force * 0.45;
    p.z += force * 0.6;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * uPixelRatio * (1.0 + force * 1.2) / -mv.z;
    gl_Position = projectionMatrix * mv;
    vColor = mix(aColor, vec3(1.0, 0.72, 0.45), force * 0.6);
    vAlpha = (0.45 + 0.55 * fract(aRand * 13.7)) * intro;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/** Samples the Hololand mark into particles. */
function sampleMark(stepPx = 4) {
  const W = 345, H = 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  poly([[0, 0], [105, 0], [105, 140], [0, 212]], '#efe7dc');
  poly([[0, 245], [215, 98], [215, 300], [110, 300], [110, 400], [0, 400]], '#ed7315');
  g.fillStyle = '#efe7dc'; g.fillRect(238, 0, 107, 400);
  const data = g.getImageData(0, 0, W, H).data;
  const pos = [], col = [], rnd = [];
  const scale = 3.2 / H;
  for (let y = 0; y < H; y += stepPx) {
    for (let x = 0; x < W; x += stepPx) {
      const jx = x + (Math.random() - 0.5) * stepPx, jy = y + (Math.random() - 0.5) * stepPx;
      const i = (Math.floor(Math.min(H - 1, Math.max(0, jy))) * W + Math.floor(Math.min(W - 1, Math.max(0, jx)))) * 4;
      if (data[i + 3] < 128) continue;
      pos.push((jx - W / 2) * scale, -(jy - H / 2) * scale, (Math.random() - 0.5) * 0.12);
      col.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      rnd.push(Math.random());
    }
  }
  return { pos, col, rnd };
}

export class LogoParticles {
  constructor(canvas) {
    this.canvas = canvas;
    this.visible = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.z = 6.5;

    const fine = window.innerWidth > 800 ? 3 : 4;
    const { pos, col, rnd } = sampleMark(fine);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rnd, 1));
    this.uniforms = {
      uTime: { value: 0 }, uSize: { value: 26 }, uPixelRatio: { value: this.renderer.getPixelRatio() },
      uIntro: { value: 0 }, uMouse: { value: new THREE.Vector2(9, 9) },
    };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.points);

    this.mouseTarget = new THREE.Vector2(9, 9);
    this.tilt = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.tilt.set(ndc.x, ndc.y);
      this.ray.setFromCamera(ndc, this.camera);
      if (this.ray.ray.intersectPlane(this.plane, hit)) this.mouseTarget.set(hit.x, hit.y);
    }, { passive: true });

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(canvas);
    this.t0 = performance.now();
    this.last = this.t0;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  onResize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    if (!this.visible) return;
    this.uniforms.uTime.value = (performance.now() - this.t0) / 1000;
    this.uniforms.uMouse.value.lerp(this.mouseTarget, 0.08);
    this.points.rotation.y += (THREE.MathUtils.clamp(this.tilt.x, -1, 1) * 0.35 - this.points.rotation.y) * 0.05;
    this.points.rotation.x += (-THREE.MathUtils.clamp(this.tilt.y, -1, 1) * 0.2 - this.points.rotation.x) * 0.05;
    this.renderer.render(this.scene, this.camera);
  }
}
