/* GLB viewer for the "Outputs at the official export" section.
   three.js r160 from a pinned CDN (import map in index.html). Models ship as
   assets/models/<id>.glb.js, a script that registers the base64-encoded GLB, so the
   page also works when opened from file:// (browsers block fetch() of local files). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.__viewerModule = true;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader = new GLTFLoader();
window.__glb = window.__glb || {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('could not load ' + src)); };
    document.head.appendChild(s);
  });
}
async function glbBuffer(cfg) {
  if (!window.__glb[cfg.id]) await loadScript(cfg.glb);
  const b64 = window.__glb[cfg.id];
  if (!b64) throw new Error('model data missing for ' + cfg.id);
  const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
function parseGLB(buffer) {
  // Use <img>-based texture decoding (TextureLoader): it works for blob: URLs on file:// pages too.
  const cib = window.createImageBitmap;
  try { window.createImageBitmap = undefined; } catch (_) {}
  return new Promise((resolve, reject) => {
    try { loader.parse(buffer, '', resolve, reject); } catch (e) { reject(e); }
    finally { try { window.createImageBitmap = cib; } catch (_) {} }
  });
}
function disposeGroup(group) {
  group.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    const mats = new Set([o.userData.texMat, o.userData.clayMat].filter(Boolean));
    mats.forEach(m => { for (const k of ['map', 'metalnessMap', 'roughnessMap', 'normalMap']) if (m[k]) m[k].dispose(); m.dispose(); });
  });
  group.clear();
}

function buildTabs(el, configs, onSelect) {
  const holder = el.querySelector('.scene-tabs');
  for (const cfg of configs) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'scene-tab'; b.dataset.asset = cfg.id;
    b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Show ' + cfg.label);
    const img = document.createElement('img'); img.src = cfg.preview; img.loading = 'lazy'; img.width = 300; img.height = 200;
    img.alt = 'Render of the generated ' + cfg.label.toLowerCase();
    const t = document.createElement('span'); t.textContent = cfg.label;
    const s = document.createElement('small'); s.textContent = cfg.category;
    b.append(img, t, s);
    b.addEventListener('click', () => onSelect(cfg));
    holder.append(b);
  }
}
function showHeading(el, cfg) {
  el.querySelectorAll('.scene-tab').forEach(b => { const on = b.dataset.asset === cfg.id; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  el.querySelector('.asset-title').textContent = cfg.label;
  el.querySelector('.asset-cat').textContent = cfg.category;
  const ref = el.querySelector('.input-reference img'); ref.src = cfg.input; ref.alt = 'Input image of the ' + cfg.label.toLowerCase();
}

class AssetViewer {
  constructor(el) {
    this.el = el; this.canvas = el.querySelector('canvas'); this.loadId = 0; this.visible = true; this.mode = 'tex';
    this.configs = window.PAGE_CONFIG.scenes;
    this.overlay = el.querySelector('.ws-loader');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // keep base colours close to the texture
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    pmrem.dispose();
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, autoRotate: !reducedMotion, autoRotateSpeed: 0.7,
      minDistance: 0.4, maxDistance: 8, maxPolarAngle: Math.PI * 0.53 });
    this.controls.addEventListener('start', () => this.setRotate(false));
    this.scene.add(new THREE.HemisphereLight(0xfffaf0, 0xcbb894, 0.45));
    const key = new THREE.DirectionalLight(0xfff4df, 1.25); key.position.set(-2.2, 4, 3);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.1, far: 12 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01; key.shadow.radius = 4;
    this.scene.add(key);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ color: 0x51463b, opacity: 0.16 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.scene.add(this.floor);
    this.clay = new THREE.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.8, metalness: 0, envMapIntensity: 0.7 });
    this.buildTabs(); this.bind(); this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(el);
    this.renderer.setAnimationLoop(() => {
      if (!this.visible || document.hidden) return;
      this.controls.update(); this.renderer.render(this.scene, this.camera);
    });
    this.load(this.configs[0]);
  }
  buildTabs() {
    buildTabs(this.el, this.configs, cfg => { this.load(cfg); this.el.querySelector('.viewer-shell').scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' }); });
  }
  bind() {
    this.rotBtn = this.el.querySelector('.btn-rotate');
    this.rotBtn.addEventListener('click', () => this.setRotate(!this.controls.autoRotate));
    this.setRotate(this.controls.autoRotate);
    this.el.querySelector('.btn-reset').addEventListener('click', () => this.frame());
    this.el.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.message('The 3D view was interrupted. Reload the page to continue.', true); });
  }
  setRotate(on) {
    this.controls.autoRotate = on; this.rotBtn.classList.toggle('on', on); this.rotBtn.setAttribute('aria-pressed', String(on));
  }
  setMode(mode) {
    this.mode = mode;
    this.el.querySelectorAll('.seg button').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    this.root.traverse(o => { if (o.isMesh) o.material = mode === 'clay' ? o.userData.clayMat : o.userData.texMat; });
  }
  message(text, error) {
    this.overlay.classList.add('show'); this.overlay.classList.toggle('error', !!error);
    this.overlay.querySelector('.ws-loader-label').textContent = text;
  }
  async load(cfg) {
    const id = ++this.loadId; this.cfg = cfg; this.el.dataset.ready = 'false';
    showHeading(this.el, cfg);
    this.message('Loading ' + cfg.label + '…', false);
    try {
      const buf = await glbBuffer(cfg);
      if (id !== this.loadId) return;
      const gltf = await parseGLB(buf);
      if (id !== this.loadId) { disposeGroup(gltf.scene); return; }
      disposeGroup(this.root);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = false;
        const m = o.material; m.envMapIntensity = 0.75; if (m.map) m.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        o.userData.texMat = m; o.userData.clayMat = this.clay;
        if (this.mode === 'clay') o.material = this.clay;
      });
      this.root.add(gltf.scene); this.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.root);
      this.center = box.getCenter(new THREE.Vector3()); this.size = box.getSize(new THREE.Vector3());
      this.floor.position.y = box.min.y - 0.002;
      this.frame(); this.renderer.shadowMap.needsUpdate = true;
      this.overlay.classList.remove('show'); this.el.dataset.ready = 'true'; this.el.dataset.asset = cfg.id;
    } catch (err) {
      if (id !== this.loadId) return;
      console.error('Asset load failed:', cfg.id, err);
      this.message('Could not load this asset. Choose another one or reload the page.', true);
    }
  }
  frame() {
    if (!this.center) return;
    const r = this.size.length() / 2;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = r / Math.sin(Math.min(vfov, hfov) / 2) * 1.12;
    const yaw = THREE.MathUtils.degToRad(this.cfg.yaw ?? 25), el = THREE.MathUtils.degToRad(14);
    this.camera.position.copy(this.center).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(dist));
    this.camera.near = Math.max(0.005, dist / 100); this.camera.far = dist * 20; this.camera.updateProjectionMatrix();
    this.controls.target.copy(this.center); this.controls.update();
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.center) this.frame();
  }
}

for (const el of document.querySelectorAll('.ws-viewer')) {
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return; io.disconnect();
    try { el.viewer = new AssetViewer(el); }
    catch (e) {
      console.error(e);
      const cfgs = window.PAGE_CONFIG.scenes, ov = el.querySelector('.ws-loader');
      ov.classList.add('show', 'error');
      ov.querySelector('.ws-loader-label').textContent = 'The 3D viewer needs WebGL, which is not available here. The renders below show each asset.';
      if (!el.querySelector('.scene-tab')) { buildTabs(el, cfgs, cfg => showHeading(el, cfg)); showHeading(el, cfgs[0]); }
    }
  }, { rootMargin: '300px' });
  io.observe(el);
}
