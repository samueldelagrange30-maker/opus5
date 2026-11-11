import * as THREE from 'three';
import { state, sAt, posAtS, BAR, T_STOP } from './path.js';
import { clamp, lerp, smooth } from './util.js';

// Liste de plans calés sur les mesures (1 mesure = 1,875 s). Chaque plan est une fonction pure du temps.

const S = {}, S2 = {};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const carPos = (t, y = 0.6) => { state(t, S); return V(S.x, y, S.z); };
// position de la voiture lissée sur une petite fenêtre (évite les à-coups de visée)
function smoothPos(t, win = 0.3, y = 0.6) {
  const p = V(0, 0, 0); const n = 5;
  for (let i = 0; i < n; i++) { state(t - win * (i / (n - 1)), S2); p.x += S2.x; p.z += S2.z; }
  p.x /= n; p.z /= n; p.y = y; return p;
}
// point du tracé situé à une distance d derrière (d>0) ou devant (d<0) la voiture
function pathAt(t, d) {
  state(t, S);
  const s0 = sAt(t) - d, p = V(0, 0, 0);
  for (const o of [-2, -1, 0, 1, 2]) { const q = posAtS(s0 + o * 0.8); p.x += q.x / 5; p.z += q.z / 5; }
  return p;
}
function local(t, lx, ly, lz, yawWin = 0.12) {
  state(t, S); state(t - yawWin, S2);
  const yaw = (S.yaw + S2.yaw) / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  return V(S.x + c * lx - s * lz, ly, S.z + s * lx + c * lz);
}
const jit = (t, k) => Math.sin(t * 7.1 * k + k * 1.7) * 0.5 + Math.sin(t * 12.7 * k + k) * 0.3 + Math.sin(t * 23.3 * k + 2.1 * k) * 0.2;
function autoFov(cam, target, fill = 0.5, lo = 12, hi = 70) {
  const d = cam.distanceTo(target);
  const h = Math.atan((5.0 / fill) / 2 / d); // demi-angle horizontal
  return clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h) * 16 / 9)), lo, hi);
}

const B = BAR;
export const shots = [
  { name: 'intro', b0: 0, b1: 2, fn: (t, u) => {
    const c = carPos(t);
    const pos = V(-2.8 - 2.5 + 0.5 * u, 0.36 + 0.1 * u, -200 + 7.4 - 0.9 * u);
    return { pos, tgt: V(c.x + 0.2, 0.95 + 0.5 * (1 - u), c.z - 0.5), fov: 50 - 4 * u, shake: 0.006 + 0.012 * S.burn };
  } },
  { name: 'chase', blur: 0.05, b0: 2, b1: 4, fn: (t, u) => {
    const p = pathAt(t, 8.2 + 1.5 * u); p.y = 4.0 - 2.3 * smooth(0, 0.7, u); p.x = p.x * 0.45;
    const c = smoothPos(t, 0.2, 1.0); c.z += 5;
    return { pos: p, tgt: c, fov: 60, shake: 0.03, roll: -S.alat * 0.003 };
  } },
  { name: 'frontTrack', blur: 0.05, b0: 4, b1: 5.5, fn: (t, u) => {
    const p = pathAt(t, -(8.5 + 1.5 * u)); const c = smoothPos(t, 0.15, 0.7);
    p.x = p.x * 0.5 + 2.4 - 1.2 * u; p.y = 0.5 + 0.25 * u;
    return { pos: p, tgt: c, fov: 58, shake: 0.03 };
  } },
  { name: 'rearQuarter', liveEnv: true, b0: 5.5, b1: 6.5, fn: (t) => ({ pos: local(t, -4.6, 1.15, -1.75), tgt: local(t, 2.0, 0.55, 0.15), fov: 62, shake: 0.02 }) },
  { name: 'sideTrack', liveEnv: true, b0: 6.5, b1: 8, fn: (t, u) => {
    const c = smoothPos(t, 0.2, 0.62);
    return { pos: V(8.2, 0.55, c.z + 4.5 - 3 * u), tgt: c, fov: 50, shake: 0.03 };
  } },
  { name: 'cornerC1', b0: 8, b1: 10, fn: (t) => {
    const pos = V(38, 0.42, 7.6); const c = smoothPos(t, 0.12, 0.6);
    return { pos, tgt: c, fov: autoFov(pos, c, 0.62, 9, 66), shake: 0.012 };
  } },
  { name: 'heli', b0: 10, b1: 11, fn: (t, u) => {
    const c = smoothPos(t, 0.3, 0.5);
    return { pos: V(c.x - 15 + 4 * u, 24 - 4 * u, c.z - 8.5), tgt: V(c.x + 5, 0, c.z), fov: 40, shake: 0.02 };
  } },
  { name: 'chaseLowC2', blur: 0.06, b0: 11, b1: 12.5, fn: (t) => {
    const p = pathAt(t, 7.2); p.y = 1.7;
    const c = smoothPos(t, 0.15, 0.7);
    return { pos: p, tgt: c, fov: 66, shake: 0.035, roll: -S.alat * 0.004 };
  } },
  { name: 'craneFront', blur: 0.04, b0: 12.5, b1: 14, fn: (t, u) => {
    const p = pathAt(t, -(11 - 3 * u)); p.y = lerp(7.5, 0.55, smooth(0, 0.85, u)); p.x -= 2.2;
    return { pos: p, tgt: smoothPos(t, 0.15, 0.7), fov: 52, shake: 0.025 };
  } },
  { name: 'teleC3', b0: 14, b1: 16, fn: (t) => {
    const pos = V(24, 1.9, 104.2); const c = smoothPos(t, 0.15, 0.7);
    return { pos, tgt: c, fov: autoFov(pos, c, 0.66, 7, 40), shake: 0.006 };
  } },
  { name: 'hood', blur: 0.1, liveEnv: true, b0: 16, b1: 18, fn: (t) => ({ pos: local(t, 2.42, 0.46, 0, 0.05), tgt: local(t, 14, 1.9, 0, 0.05), fov: 86, shake: 0.012, near: 0.05 }) },
  { name: 'chaseLowC4', blur: 0.06, b0: 18, b1: 20, fn: (t) => {
    const p = pathAt(t, 7.6); p.y = 1.9;
    const c = smoothPos(t, 0.15, 0.7);
    return { pos: p, tgt: c, fov: 64, shake: 0.035, roll: -S.alat * 0.004 };
  } },
  { name: 'sideTrack2', liveEnv: true, b0: 20, b1: 21.5, fn: (t, u) => {
    const c = smoothPos(t, 0.2, 0.62);
    return { pos: V(-108.0, 0.5, c.z - 6 + 4.5 * u), tgt: c, fov: 48, shake: 0.03 };
  } },
  { name: 'cornerC5', b0: 21.5, b1: 24, fn: (t) => {
    const pos = V(-58, 0.4, -3.2); const c = smoothPos(t, 0.12, 0.6);
    return { pos, tgt: c, fov: autoFov(pos, c, 0.6, 9, 66), shake: 0.012 };
  } },
  { name: 'craneScramble', b0: 24, b1: 25.5, fn: (t, u) => {
    const pos = V(8.2 - 2 * u, 13.5 - 2.5 * u, -25 + 3 * u); const c = smoothPos(t, 0.2, 0.5);
    return { pos, tgt: c.lerp(V(0, 0.5, -3.5), 0.35), fov: 46, shake: 0.01 };
  } },
  { name: 'topDown', b0: 25.5, b1: 27.5, fn: (t, u) => {
    const a = 0.5 + 0.55 * u;
    return { pos: V(0, 48 - 8 * u, -3.5), tgt: V(0, 0, -3.5), up: V(Math.sin(a), 0, Math.cos(a)), fov: 60, shake: 0 };
  } },
  { name: 'centerPan', b0: 27.5, b1: 28.5, fn: (t) => ({ pos: V(0, 0.5, -3.5), tgt: smoothPos(t, 0.08, 0.72), fov: 82, shake: 0.008 }) },
  { name: 'wheelCam', b0: 28.5, b1: 29.5, fn: (t) => ({ pos: local(t, 2.6, 0.42, -3.5), tgt: local(t, -1.2, 0.55, -0.4), fov: 56, shake: 0.015 }) },
  { name: 'outsideLow', b0: 29.5, b1: 30.5, fn: (t, u) => {
    const c = smoothPos(t, 0.2, 0.8);
    return { pos: V(3.5 - u, 0.45, -40 + 2 * u), tgt: V(c.x * 0.5, 4.6, c.z * 0.5 - 1.7), fov: 33, shake: 0.008 };
  } },
  { name: 'chaseExit', blur: 0.06, b0: 30.5, b1: 32, fn: (t, u) => {
    const p = pathAt(t, 7.5 + 1.5 * u); p.y = 1.0 + 0.9 * u;
    const c = smoothPos(t, 0.2, 1.3); c.z += 8;
    return { pos: p, tgt: c, fov: 58, shake: 0.03 };
  } },
  { name: 'final', b0: 32, b1: 34, fn: (t, u) => {
    const c = smoothPos(t, 0.25, 0.6);
    const pos = V(-2.2 + 1.2 * u, 0.48, 28.5 + 2 * u);
    return { pos, tgt: V(c.x * 0.8, 3.6, c.z), fov: 50, shake: 0.008 };
  } },
  { name: 'hero', b0: 34, b1: 36, fn: (t, u) => {
    const c = carPos(T_STOP + 1);
    return { pos: V(c.x - 3.2 + 1.8 * u, 0.4 + 0.2 * u, c.z - 9.6 + 0.6 * u), tgt: V(c.x - 0.15, 0.8 + 0.55 * u, c.z), fov: 48, shake: 0.004 };
  } },
];
for (const s of shots) { s.t0 = s.b0 * B; s.t1 = s.b1 * B; }

export function shotAt(t) {
  for (const s of shots) if (t >= s.t0 && t < s.t1) return s;
  return shots[shots.length - 1];
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = V(0, 1, 0);
export function applyCamera(camera, t) {
  const s = shotAt(t);
  const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1);
  const r = s.fn(t, u);
  const k = r.shake || 0;
  r.pos.x += jit(t, 1.0) * k; r.pos.y += jit(t, 1.3) * k * 0.6; r.pos.z += jit(t, 0.8) * k;
  r.pos.y = Math.max(0.22, r.pos.y);
  camera.position.copy(r.pos);
  m4.lookAt(r.pos, r.tgt, r.up || UP);
  camera.quaternion.setFromRotationMatrix(m4);
  const roll = (r.roll || 0) + jit(t, 0.6) * k * 0.05;
  if (roll) { q.setFromAxisAngle(V(0, 0, 1), roll); camera.quaternion.multiply(q); }
  camera.fov = r.fov; camera.near = r.near || 0.12; camera.far = 3000;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return s;
}
