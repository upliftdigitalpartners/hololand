import * as THREE from 'three';
import { GLSL_ARCH } from './glsl.js';

const vertex = /* glsl */ `
  uniform float uR, uVel, uHover;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec3 p = position;
    // wrap the flat panel onto the ring's cylinder
    float a = p.x / uR;
    p.x = sin(a) * uR;
    p.z += (cos(a) - 1.0) * uR;
    // bend with rotation speed, bulge on hover
    p.z += sin(uv.y * 3.14159) * uVel * 0.32;
    p.z += uHover * 0.18 * sin(uv.x * 3.14159) * sin(uv.y * 3.14159);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    vFacing = dot(n, normalize(cameraPosition - wp.xyz));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform float uAspect, uPlaneAspect, uVel, uHover, uReady;
  varying vec2 vUv;
  varying float vFacing;
  ${GLSL_ARCH}
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uPlaneAspect, 1.0);
    float d = sdArch(p, vec2(uPlaneAspect * 0.5, 0.5) - 0.004);
    float aa = fwidth(d) * 1.2;
    float alpha = 1.0 - smoothstep(-aa, aa, d);
    if (alpha < 0.01) discard;

    vec2 s = uPlaneAspect > uAspect ? vec2(1.0, uAspect / uPlaneAspect) : vec2(uPlaneAspect / uAspect, 1.0);
    vec2 uv = (vUv - 0.5) * s * (1.0 - uHover * 0.07) + 0.5;
    float sh = uVel * 0.01;
    vec3 col = vec3(texture2D(uTex, uv + vec2(sh, 0.0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(sh, 0.0)).b);
    col = mix(vec3(0.13, 0.09, 0.08), col, uReady);

    float front = smoothstep(-0.1, 0.95, vFacing);
    col *= mix(0.06, 1.0, front);
    col += vec3(0.93, 0.45, 0.08) * smoothstep(aa * 3.0, 0.0, abs(d + 0.006)) * (0.25 + uHover * 0.75) * front;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Lookbook {
  constructor(canvas, items, { onFront, onOpen, onHover } = {}) {
    this.canvas = canvas;
    this.items = items;
    this.onFront = onFront;
    this.onOpen = onOpen;
    this.onHover = onHover;
    this.visible = false;

    const n = items.length;
    this.panelH = 1.5;
    this.panelW = 1.0;
    this.step = (Math.PI * 2) / n;
    this.R = (n * (this.panelW + 0.18)) / (Math.PI * 2);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.group = new THREE.Group();
    this.group.rotation.x = 0.05;
    this.scene.add(this.group);

    this.shared = { uVel: { value: 0 }, uR: { value: this.R } };
    const geo = new THREE.PlaneGeometry(this.panelW, this.panelH, 24, 24);
    const loader = new THREE.TextureLoader();
    this.meshes = items.map((item, i) => {
      const uniforms = {
        ...this.shared,
        uTex: { value: null }, uAspect: { value: 0.667 }, uPlaneAspect: { value: this.panelW / this.panelH },
        uHover: { value: 0 }, uReady: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: vertex, fragmentShader: fragment, uniforms,
        transparent: true, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const a = i * this.step;
      mesh.position.set(Math.sin(a) * this.R, 0, Math.cos(a) * this.R);
      mesh.rotation.y = a;
      mesh.userData = { item, hover: 0, index: i };
      this.group.add(mesh);
      loader.load(item.src, (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        uniforms.uTex.value = tex;
        uniforms.uAspect.value = tex.image.width / tex.image.height;
        uniforms.uReady.value = 1;
      });
      return mesh;
    });

    this.rot = 0;
    this.scrollRot = 0;
    this.dragRot = 0;
    this.vel = 0;
    this.front = -1;
    this.pointer = new THREE.Vector2(9, 9);
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.bindPointer();
    this.onResize();

    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(canvas);
    this.t0 = performance.now();
    this.last = this.t0;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  bindPointer() {
    const c = this.canvas;
    let down = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, rot: this.dragRot, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 4) down.moved = true;
      this.dragRot = down.rot - dx * 0.006;
    });
    const up = (e) => {
      if (down && !down.moved && e.type === 'pointerup' && this.hovered) this.onOpen?.(this.hovered.userData.item);
      down = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.pointer.set(9, 9); });
  }

  /** 0..1 progress through the pinned section. */
  setProgress(p) { this.scrollRot = p * Math.PI * 2 * 0.92; }

  onResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const narrow = w / h < 0.9;
    const dist = narrow ? 5.6 : 4.3;
    this.camera.position.set(0, 0.3, this.R + dist);
    this.camera.lookAt(0, -0.22, this.R - 1.2);
    this.camera.updateProjectionMatrix();
  }

  tick() {
    if (!this.visible) return;
    const t = (performance.now() - this.t0) / 1000;
    const target = this.scrollRot + this.dragRot;
    const prev = this.rot;
    this.rot += (target - this.rot) * 0.075;
    const v = this.rot - prev;
    this.vel += (THREE.MathUtils.clamp(v * 7, -0.8, 0.8) - this.vel) * 0.1;
    this.shared.uVel.value = this.vel;
    this.group.rotation.y = -this.rot;
    this.group.position.y = Math.sin(t * 0.6) * 0.03;

    const n = this.items.length;
    const front = ((Math.round(this.rot / this.step) % n) + n) % n;
    if (front !== this.front) { this.front = front; this.onFront?.(this.items[front], front); }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    const hovered = hit && hit.face && hit.face.normal ? hit.object : null;
    if (hovered !== this.hovered) { this.hovered = hovered; this.onHover?.(!!hovered); }
    for (const m of this.meshes) {
      m.userData.hover += ((m === this.hovered ? 1 : 0) - m.userData.hover) * 0.1;
      m.material.uniforms.uHover.value = m.userData.hover;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
