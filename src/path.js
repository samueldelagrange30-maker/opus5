// Trajectoire et dynamique de la voiture — module pur (partagé navigateur / Node).
// Tout est déterministe et précalculé : state(t) donne l'état complet à l'instant t.

export const FPS = 30;
export const BPM = 128;
export const BAR = (60 / BPM) * 4; // 1.875 s
export const DURATION = 36 * BAR; // 67.5 s
export const T_START = 3.0; // départ
export const T_STOP = 63.0; // arrêt complet

export const P = 100; // pas de la grille de rues
export const ROAD_HALF = 10; // demi-largeur de chaussée
export const SIDEWALK = 4;

const DS = 0.25;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- tracé
const segs = [];
export const marks = {};
let total = 0;
const straight = (L) => { segs.push({ L, k: 0, s0: total }); total += L; };
const arc = (R, deg) => { const L = R * Math.abs(deg) * DEG; segs.push({ L, k: Math.sign(deg) / R, s0: total }); total += L; };
const mark = (name) => { marks[name] = total; };

const RC = 18; // rayon des virages aux carrefours
const RD = 6.5; // rayon du donut
const START = { x: -2.8, z: -200, phi: 90 * DEG };

mark('launch');
straight(38);
mark('weave');
arc(30, -25); arc(30, 50); arc(30, -50); arc(30, 50); arc(30, -50); arc(30, 25);
mark('weaveEnd');
straight(17.2);
mark('c1'); arc(RC, -90); // carrefour central -> +x
straight(61.2);
mark('c2'); arc(RC, 90); // -> +z
straight(64);
mark('c3'); arc(RC, 90); // -> -x
mark('fast');
straight(104);
arc(60, -10); arc(60, 20); arc(60, -10); // appel contre-appel (feint)
straight(18.33);
mark('c4'); arc(RC, 90); // -> -z
straight(61);
mark('c5'); arc(RC, 90); // -> +x
straight(82);
mark('donut'); arc(RD, -630);
mark('donutEnd');
straight(45);
mark('final'); arc(9, -125);
mark('end');

export const LENGTH = total;
const N = Math.ceil(total / DS) + 1;
const px = new Float32Array(N), pz = new Float32Array(N), pphi = new Float32Array(N), pk = new Float32Array(N);
{
  let x = START.x, z = START.z, phi = START.phi, si = 0;
  let seg = segs[0];
  for (let i = 0; i < N; i++) {
    const s = Math.min(i * DS, total - 1e-6);
    while (si < segs.length - 1 && s >= segs[si].s0 + segs[si].L) {
      // avance l'état de la tortue à la fin du segment
      seg = segs[si];
      const e = end(seg, x, z, phi, seg.L);
      x = e.x; z = e.z; phi = e.phi; si++;
    }
    seg = segs[si];
    const e = end(seg, x, z, phi, s - seg.s0);
    px[i] = e.x; pz[i] = e.z; pphi[i] = e.phi; pk[i] = seg.k;
  }
  function end(seg, x, z, phi, l) {
    if (seg.k === 0) return { x: x + Math.cos(phi) * l, z: z + Math.sin(phi) * l, phi };
    const R = 1 / seg.k, p2 = phi + l * seg.k;
    return { x: x + R * (Math.sin(p2) - Math.sin(phi)), z: z - R * (Math.cos(p2) - Math.cos(phi)), phi: p2 };
  }
}

function boxBlur(src, radius, passes = 2) {
  let a = Float32Array.from(src);
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    let acc = 0;
    const n = a.length;
    for (let i = -radius; i <= radius; i++) acc += a[Math.min(n - 1, Math.max(0, i))];
    for (let i = 0; i < n; i++) {
      b[i] = acc / (2 * radius + 1);
      acc += a[Math.min(n - 1, i + radius + 1)] - a[Math.max(0, i - radius)];
    }
    a = b;
  }
  return a;
}

const kSmooth = boxBlur(pk, Math.round(4 / DS)); // courbure adoucie (dérive)
const kSpeed = boxBlur(pk, Math.round(9 / DS)); // courbure pour le profil de vitesse

// ---------------------------------------------------------------- vitesse
const VMAX = 31, ALAT = 11.5, AACC = 6.0, ABRK = 9.5;
const v = new Float32Array(N);
for (let i = 0; i < N; i++) v[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(Math.abs(kSpeed[i]), 1e-4)));
v[0] = 0.6;
for (let i = 1; i < N; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * AACC * DS));
v[N - 1] = 0.5;
for (let i = N - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * ABRK * DS));
const tOfS = new Float32Array(N);
for (let i = 1; i < N; i++) tOfS[i] = tOfS[i - 1] + DS / (0.5 * (v[i] + v[i - 1]));
const scale = tOfS[N - 1] / (T_STOP - T_START);
for (let i = 0; i < N; i++) { tOfS[i] = T_START + tOfS[i] / scale; v[i] *= scale; }
export const SPEED_SCALE = scale;

export function timeAtS(s) {
  const f = Math.min(N - 1.001, Math.max(0, s / DS)); const i = Math.floor(f);
  return tOfS[i] + (tOfS[i + 1] - tOfS[i]) * (f - i);
}
function sAtTime(t) {
  if (t <= T_START) return 0;
  if (t >= T_STOP) return total - 1e-3;
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tOfS[m] <= t) lo = m; else hi = m; }
  return (lo + (t - tOfS[lo]) / Math.max(1e-6, tOfS[hi] - tOfS[lo])) * DS;
}
function sample(arr, s) {
  const f = Math.min(N - 1.001, Math.max(0, s / DS)); const i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

// ---------------------------------------------------------------- table temporelle
const HZ = 240;
const M = Math.ceil(DURATION * HZ) + 2;
const F = 12; // champs par échantillon
const tab = new Float32Array(M * F);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const BURN_T0 = 1.3; // début du burnout à l'arrêt
{
  const BMAX = 44 * DEG, KREF = 0.042, LEAD = 0.28, TAU = 0.2;
  let beta = 0, spin = 0, spinR = 0, vPrev = 0, thr = 0;
  for (let i = 0; i < M; i++) {
    const t = i / HZ;
    const s = sAtTime(t);
    const moving = t > T_START && t < T_STOP;
    const vel = moving ? sample(v, s) : 0;
    const sLead = sAtTime(t + LEAD);
    const g = sm(1.5, 7, vel);
    let target = BMAX * Math.tanh(sample(kSmooth, sLead) / KREF) * g;
    // fin : la voiture garde son angle en s'arrêtant en travers
    beta += (target - beta) * (1 - Math.exp(-1 / (HZ * TAU)));
    const kap = sample(kSmooth, s);
    const alat = vel * vel * kap;
    const acc = (vel - vPrev) * HZ; vPrev = vel;
    const burn = sm(BURN_T0, BURN_T0 + 0.5, t) * (1 - sm(T_START + 0.5, T_START + 1.3, t));
    const drift = Math.min(1, Math.abs(beta) / (20 * DEG)) * sm(1.0, 5, vel);
    const smoke = Math.min(1, Math.max(drift, burn * 0.62));
    // rotation des roues (rad)
    spin += (vel / 0.33) / HZ;
    spinR += (Math.max(vel, burn * 22 + drift * (vel + 9)) / 0.33) / HZ;
    const thrT = moving ? Math.min(1, Math.max(0.15, 0.55 + acc / 8 + drift * 0.5)) : burn;
    thr += (thrT - thr) * (1 - Math.exp(-1 / (HZ * 0.08)));
    const o = i * F;
    tab[o] = sample(px, s); tab[o + 1] = sample(pz, s); tab[o + 2] = sample(pphi, s);
    tab[o + 3] = vel; tab[o + 4] = beta; tab[o + 5] = alat; tab[o + 6] = acc;
    tab[o + 7] = smoke; tab[o + 8] = spin; tab[o + 9] = spinR; tab[o + 10] = thr; tab[o + 11] = burn;
  }
}

const out = {};
export function state(t, target = out) {
  const f = Math.min(M - 1.001, Math.max(0, t * HZ)); const i = Math.floor(f), a = f - i;
  const o = i * F, q = o + F;
  const L = (k) => tab[o + k] + (tab[q + k] - tab[o + k]) * a;
  target.x = L(0); target.z = L(1); target.phi = L(2); target.v = L(3); target.beta = L(4);
  target.alat = L(5); target.acc = L(6); target.smoke = L(7); target.spin = L(8); target.spinR = L(9);
  target.thr = L(10); target.burn = L(11);
  target.yaw = target.phi + target.beta; // cap de la caisse
  return target;
}

// abscisse curviligne à l'instant t, et position du tracé à l'abscisse s (extrapolée en ligne droite hors bornes)
export function sAt(t) { return sAtTime(t); }
export function posAtS(s) {
  if (s < 0) return { x: px[0] + Math.cos(pphi[0]) * s, z: pz[0] + Math.sin(pphi[0]) * s };
  if (s > total) { const d = s - total; return { x: px[N - 1] + Math.cos(pphi[N - 1]) * d, z: pz[N - 1] + Math.sin(pphi[N - 1]) * d }; }
  return { x: sample(px, s), z: sample(pz, s) };
}

// position monde d'un point exprimé dans le repère voiture (lx vers l'avant, lz vers la droite du cap)
export function carPoint(st, lx, lz) {
  const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
  return { x: st.x + c * lx - s * lz, z: st.z + s * lx + c * lz };
}

export function pathPolyline(step = 1) {
  const pts = [];
  for (let s = 0; s < total; s += step) pts.push([sample(px, s), sample(pz, s)]);
  return pts;
}

// Retours de flamme à l'échappement (lever de pied à l'entrée des virages) — image et son synchronisés
export const POPS = [];
for (const k of ['c1', 'c2', 'c3', 'c4', 'c5', 'donut', 'final']) { const t = timeAtS(marks[k]); POPS.push(t - 0.42, t - 0.27); }
POPS.push(T_START - 0.9, T_START - 0.55);
POPS.sort((a, b) => a - b);
