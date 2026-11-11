import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { state, FPS, DURATION, BAR, POPS } from './path.js';
import { buildCity, FOG_COLOR, FOG_DENSITY } from './city.js';
import { buildCar } from './car.js';
import { Smoke, buildTireMarks } from './fx.js';
import { applyCamera } from './cameras.js';
import { smooth, hash } from './util.js';

const params = new URLSearchParams(location.search);
const SCALE = parseFloat(params.get('scale') || '1');
const W = Math.round(1080 * SCALE), H = Math.round(1920 * SCALE);
const SUB = parseInt(params.get('sub') || '1', 10); // sous-images pour le flou de mouvement
const SHUTTER = 0.5;

const glCanvas = document.getElementById('gl'); glCanvas.width = W; glCanvas.height = H;
const out = document.getElementById('out'); out.width = W; out.height = H;
const ctx = out.getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.12, 3000);

scene.add(new THREE.HemisphereLight(0xb8b0ff, 0x4a3a58, 0.8));
const key = new THREE.DirectionalLight(0xfff0dc, 0.65); key.position.set(-0.4, 1, 0.25); scene.add(key);
const fill = new THREE.DirectionalLight(0xff4fc0, 0.7); fill.position.set(0.7, 0.3, -0.5); scene.add(fill);
const fill2 = new THREE.DirectionalLight(0x35c8ff, 0.6); fill2.position.set(-0.6, 0.25, 0.7); scene.add(fill2);

const city = buildCity(scene);
const car = await buildCar(); car.pops = POPS; window.carInfo = car.info; scene.add(car); scene.add(car.glows.mesh);
const smoke = new Smoke(); smoke.bb.setFog(FOG_COLOR, FOG_DENSITY); scene.add(smoke.mesh);
const tire = buildTireMarks(); scene.add(tire);

// Objets absents des reflets (sol mouillé, carrosserie) : calque 1, vu seulement par la caméra principale
camera.layers.enable(1);
for (const o of [...city.mainOnly, ...car.mainOnly, smoke.mesh, tire]) o.layers.set(1);

// Reflets sur la carrosserie : carte d'environnement cubique capturée autour de la voiture.
// Recalculée à chaque image pour les plans embarqués/latéraux (liveEnv), une fois par plan sinon.
const cubeRT = new THREE.WebGLCubeRenderTarget(params.has('cube') ? parseInt(params.get('cube'), 10) : 96, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCam = new THREE.CubeCamera(0.4, 900, cubeRT);
scene.add(cubeCam);
for (const m of car.materials) m.envMap = cubeRT.texture;
let envKey = null;
const stEnv = {};
function updateEnv(t, shot) {
  const key = shot.liveEnv ? `live${t}` : shot.name;
  if (key === envKey) return;
  envKey = key;
  state(shot.liveEnv ? t : (shot.t0 + shot.t1) / 2, stEnv);
  car.visible = false; car.glows.mesh.visible = false;
  city.ground.visible = false; city.groundSimple.visible = true;
  cubeCam.position.set(stEnv.x, 0.95, stEnv.z);
  cubeCam.update(renderer, scene);
  car.visible = true; car.glows.mesh.visible = true;
  city.ground.visible = true; city.groundSimple.visible = false;
}

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: parseInt(params.get('msaa') || '0', 10) });
const composer = new EffectComposer(renderer, rt);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.5, 0.9);
composer.addPass(bloom);
bloom.setSize(Math.round(W * 0.6), Math.round(H * 0.6));
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader); fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
if (!params.has('nofxaa')) composer.addPass(fxaa);

const st = {};
function render3D(t) {
  state(t, st);
  const shot = applyCamera(camera, t);
  car.update(st, t, camera);
  smoke.update(t);
  tire.material.uniforms.uTime.value = t;
  city.update(t, camera); city.glows.commit();
  // carte d'environnement de la voiture (sans la voiture ni le miroir du sol)
  updateEnv(t, shot);
  if (params.has('norefl')) { city.ground.visible = false; city.groundSimple.visible = true; }
  if (params.has('nosmoke')) smoke.mesh.visible = false;
  bloom.enabled = !params.has('nobloom');
  composer.render();
  return shot;
}

// ------------------------------------------------------------------ habillage 2D (titre, vignette, grain, fondus)
const grain = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const img = g.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) { const v = 128 + (hash(i * 0.731 + 0.17) - 0.5) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
})();
const vignette = (() => {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H * 0.52, H * 0.28, W / 2, H * 0.52, H * 0.72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
})();
const JP = '"IPAPGothic","IPAGothic",sans-serif';
function spaced(g, text, x, y, spacing) {
  const ws = [...text].map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = x - total / 2;
  g.textAlign = 'left';
  [...text].forEach((ch, i) => { g.fillText(ch, cx, y); cx += ws[i] + spacing; });
}
function overlay(t, frame) {
  const k = W / 1080;
  ctx.drawImage(vignette, 0, 0);
  ctx.save(); ctx.globalAlpha = 0.055; ctx.globalCompositeOperation = 'overlay';
  const ox = Math.floor(hash(frame * 1.31) * 512), oy = Math.floor(hash(frame * 2.77) * 512);
  for (let y = -oy; y < H; y += 512) for (let x = -ox; x < W; x += 512) ctx.drawImage(grain, x, y);
  ctx.restore();
  // titre d'ouverture
  const a = smooth(0.45, 1.1, t) * (1 - smooth(3.15, 3.7, t));
  if (a > 0.001) {
    ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'middle';
    const y0 = H * 0.2, e = 1 - smooth(0.45, 1.6, t);
    ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 38 * k; ctx.fillStyle = '#fff';
    ctx.font = `bold ${218 * k}px ${JP}`; spaced(ctx, '東京', W / 2, y0, (40 + 160 * e) * k);
    ctx.shadowColor = '#19e3ff'; ctx.shadowBlur = 22 * k;
    ctx.font = `bold ${50 * k}px ${JP}`; spaced(ctx, 'MIDNIGHT DRIFT', W / 2, y0 + 165 * k, (17 + 30 * e) * k);
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${30 * k}px ${JP}`; spaced(ctx, '真夜中 ・ 02:47', W / 2, y0 + 240 * k, 10 * k);
    ctx.restore();
  }
  // crédit du modèle 3D (licence CC BY-NC-SA : attribution obligatoire)
  const ca = smooth(63.9, 64.7, t) * (1 - smooth(DURATION - 1.6, DURATION - 0.9, t));
  if (ca > 0.001) {
    ctx.save(); ctx.globalAlpha = 0.78 * ca; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8 * k; ctx.fillStyle = '#fff';
    ctx.font = `${25 * k}px ${JP}`; ctx.fillText('Modèle 3D : « 1997 Lamborghini Diablo SV Coupe » — Ddiaz Design', W / 2, H * 0.772);
    ctx.font = `${21 * k}px ${JP}`; ctx.fillText('sketchfab.com/ddiaz-design · CC BY-NC-SA 4.0', W / 2, H * 0.772 + 36 * k);
    ctx.restore();
  }
  // flash sur le « drop »
  const fl = Math.max(0, 1 - (t - 2 * BAR) / 0.22) * (t >= 2 * BAR ? 1 : 0);
  if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${0.55 * fl * fl})`; ctx.fillRect(0, 0, W, H); }
  // fondus d'entrée et de sortie
  const fade = (1 - smooth(0, 0.9, t)) + smooth(DURATION - 1.5, DURATION - 0.15, t);
  if (fade > 0.001) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; ctx.fillRect(0, 0, W, H); }
}

// Flou de vitesse radial (plans de poursuite / embarqués) : copies zoomées, masquées au centre
const blurCv = document.createElement('canvas'); blurCv.width = W; blurCv.height = H; const bctx = blurCv.getContext('2d');
function speedBlur(amount) {
  const n = 6;
  bctx.globalCompositeOperation = 'source-over'; bctx.globalAlpha = 1; bctx.clearRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const z = 1 + amount * (i + 1) / n, w = W * z, h = H * z;
    bctx.globalAlpha = 1 / (i + 1);
    bctx.drawImage(glCanvas, (W - w) / 2, (H - h) * 0.46, w, h);
  }
  bctx.globalAlpha = 1; bctx.globalCompositeOperation = 'destination-in';
  const gr = bctx.createRadialGradient(W / 2, H * 0.46, H * 0.16, W / 2, H * 0.46, H * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  bctx.fillStyle = gr; bctx.fillRect(0, 0, W, H);
  ctx.drawImage(blurCv, 0, 0);
}

window.renderFrame = (frame) => {
  const t = frame / FPS;
  let shot = null;
  for (let s = 0; s < SUB; s++) {
    shot = render3D(t + (s / SUB) * (SHUTTER / FPS));
    ctx.globalAlpha = 1 / (s + 1);
    ctx.drawImage(glCanvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  if (shot.blur) { const a = shot.blur * Math.min(1, st.v / 22); if (a > 0.004) speedBlur(a); }
  overlay(t, frame);
};
window.renderTime = (t) => window.renderFrame(Math.round(t * FPS));
window.frameBlob = (frame, q = 0.95) => { window.renderFrame(frame); return new Promise((res) => out.toBlob(res, 'image/jpeg', q)); };
window.postFrame = async (frame, q) => { const b = await window.frameBlob(frame, q); await fetch(`/frame?i=${frame}`, { method: 'POST', body: b }); return b.size; };
window.bench = (t, n = 3) => { const gl = renderer.getContext(); const px = new Uint8Array(4); const t0 = performance.now(); for (let i = 0; i < n; i++) { render3D(t + i / 30); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; };
window.scene3 = scene; window.TOTAL_FRAMES = Math.round(DURATION * FPS);
window.ready = true;
