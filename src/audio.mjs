// Bande-son 100 % synthétisée : moteur V12, crissements de pneus, retours de flamme
// et instrumental original (kick / 808 / clap / charleys / cowbell) à 128 BPM, calé sur le montage.
import fs from 'fs'; import path from 'path';
import { state, DURATION, BAR, BPM, T_START, T_STOP, POPS, BURN_T0 } from './path.js';

const SR = 48000, N = Math.ceil(DURATION * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const TAU = Math.PI * 2;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Biquad { // filtre RBJ (passe-bande / passe-bas / passe-haut)
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set('lp', 1000, 0.7); }
  set(type, f, q) {
    const w = TAU * clamp(f, 20, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

// ------------------------------------------------------------------ régime moteur
const CH = 64, NC = Math.ceil(N / CH) + 1; // pas de contrôle
const rpmC = new Float32Array(NC), thrC = new Float32Array(NC), slipC = new Float32Array(NC), spdC = new Float32Array(NC);
{
  const st = {}; let gear = 1, rpm = 950, shiftT = -9;
  const TOP = [0, 13.5, 21, 30, 41]; // vitesse (m/s) à 7400 tr/min par rapport
  for (let i = 0; i < NC; i++) {
    const t = (i * CH) / SR; state(t, st);
    const drift = clamp(Math.abs(st.beta) / 0.35, 0, 1) * sm(1, 5, st.v);
    let target;
    if (t < T_START) {
      // ralenti, deux coups de gaz, puis burnout au rupteur
      const blip = Math.exp(-Math.pow((t - 0.55) / 0.16, 2)) * 2600 + Math.exp(-Math.pow((t - 0.95) / 0.14, 2)) * 3400;
      target = 950 + blip + st.burn * (5600 + 500 * Math.sin(t * 46));
    } else if (t >= T_STOP) { target = 950 + 2200 * Math.exp(-(t - T_STOP) * 2.2) + 1500 * Math.exp(-Math.pow((t - T_STOP - 1.5) / 0.15, 2)); } else {
      const wheel = Math.max(st.v, st.burn * 18) + drift * 7.5;
      let r = (wheel / TOP[gear]) * 7400;
      if (r > 7250 && gear < 4 && t - shiftT > 0.5) { gear++; shiftT = t; }
      if (r < 3700 && gear > 1 && t - shiftT > 0.35) { gear--; shiftT = t; }
      r = (wheel / TOP[gear]) * 7400;
      // en dérive : régime haut qui ondule (dosage à l'accélérateur)
      target = clamp(r, 1500, 7500) + drift * 350 * Math.sin(t * 13 + 2 * Math.sin(t * 3.1));
      if (t - shiftT < 0.12) target -= 900;
    }
    rpm += (target - rpm) * (1 - Math.exp(-(CH / SR) / (target > rpm ? 0.07 : 0.11)));
    rpmC[i] = rpm; thrC[i] = st.thr; slipC[i] = st.smoke; spdC[i] = st.v;
  }
}
const ctl = (arr, i) => { const f = i / CH, k = Math.floor(f); return arr[k] + (arr[k + 1] - arr[k]) * (f - k); };

// ------------------------------------------------------------------ moteur
{
  // V12 : l'harmonique d'allumage est le 12e demi-ordre
  const H = 36, amp = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) amp[h] = (h % 12 === 0 ? 1.0 : h % 6 === 0 ? 0.6 : h % 3 === 0 ? 0.3 : 0.12 + 0.1 * rnd()) / Math.pow(1 + h / 10, 1.15);
  const f1 = new Biquad(), f2 = new Biquad(), f3 = new Biquad(), lp = new Biquad(), nz = new Biquad();
  let ph = 0, env = 0;
  for (let i = 0; i < N; i++) {
    const rpm = ctl(rpmC, i), thr = ctl(thrC, i);
    if (i % CH === 0) {
      f1.set('bp', 240 + rpm * 0.035, 1.6); f2.set('bp', 900 + rpm * 0.07, 2.2); f3.set('bp', 2300, 1.4);
      lp.set('lp', 1400 + 5200 * thr + rpm * 0.25, 0.7); nz.set('bp', 1800 + rpm * 0.3, 0.8);
    }
    ph += TAU * (rpm / 120) / SR; if (ph > TAU * 64) ph -= TAU * 64;
    let s = 0;
    for (let h = 1; h <= H; h++) s += amp[h] * Math.sin(h * ph + h * h * 0.37);
    const drive = 0.9 + 2.2 * thr;
    s = Math.tanh(s * drive * 0.55);
    let y = s * 0.5 + f1.run(s) * 0.9 + f2.run(s) * 0.75 + f3.run(s) * 0.3;
    y += nz.run(noise()) * (0.05 + 0.3 * thr) * (rpm / 7000);
    y = lp.run(y);
    env += ((0.3 + 0.7 * thr) * (0.45 + 0.55 * rpm / 7400) - env) * 0.002;
    const g = y * env * 0.42;
    L[i] += g; R[i] += g;
  }
}

// ------------------------------------------------------------------ pneus
{
  const b1 = new Biquad(), b2 = new Biquad(), b3 = new Biquad(), lo = new Biquad();
  let w1 = 0, w2 = 0, a = 0;
  for (let i = 0; i < N; i++) {
    const slip = ctl(slipC, i), v = ctl(spdC, i);
    if (i % CH === 0) {
      w1 += (noise() - w1 * 0.02) * 0.06; w2 += (noise() - w2 * 0.02) * 0.06;
      b1.set('bp', 980 + 260 * w1 + 9 * v, 8); b2.set('bp', 1650 + 380 * w2 + 14 * v, 10); b3.set('bp', 2900 + 300 * w1, 6); lo.set('lp', 420, 0.8);
    }
    const target = slip > 0.12 ? Math.pow(slip, 1.3) : 0;
    a += (target - a) * 0.0009;
    const n = noise();
    const y = (b1.run(n) * 1.0 + b2.run(n) * 0.8 + b3.run(n) * 0.5) * 2.2 + lo.run(n) * 0.5;
    const trem = 0.8 + 0.2 * Math.sin(i / SR * TAU * 23 + 3 * w1);
    const g = y * a * trem * 0.15;
    L[i] += g * (1 + 0.25 * w2); R[i] += g * (1 - 0.25 * w2);
  }
}

// ------------------------------------------------------------------ retours de flamme
for (const tp of POPS) {
  const i0 = Math.floor(tp * SR), f = new Biquad(); f.set('lp', 1700 + 900 * rnd(), 1.2);
  for (let k = 0; k < SR * 0.22 && i0 + k < N; k++) {
    const t = k / SR;
    const y = f.run(noise()) * Math.exp(-t * 34) * 1.5 + Math.sin(TAU * 78 * t) * Math.exp(-t * 26) * 0.7;
    L[i0 + k] += y * 0.5; R[i0 + k] += y * 0.5;
  }
}

// ------------------------------------------------------------------ musique
const mL = new Float32Array(N), mR = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
const duck = new Float32Array(N).fill(1);
const STEP = 60 / BPM / 4; // double croche
const add = (buf, i, v) => { if (i >= 0 && i < N) buf[i] += v; };

function kick(t, g = 1) {
  const i0 = Math.floor(t * SR); let ph = 0;
  for (let k = 0; k < SR * 0.42; k++) {
    const tt = k / SR, f = 46 + 130 * Math.exp(-tt * 34);
    ph += TAU * f / SR;
    const y = Math.tanh((Math.sin(ph) * Math.exp(-tt * 7.5) + noise() * 0.25 * Math.exp(-tt * 180)) * 2.4) * 0.62 * g;
    add(mL, i0 + k, y); add(mR, i0 + k, y);
    if (i0 + k < N) duck[i0 + k] = Math.min(duck[i0 + k], 1 - 0.62 * Math.exp(-tt * 9));
  }
}
function clap(t, g = 1) {
  const i0 = Math.floor(t * SR), f = new Biquad(); f.set('bp', 1500, 1.1); const h = new Biquad(); h.set('hp', 700, 0.7);
  for (let k = 0; k < SR * 0.3; k++) {
    const tt = k / SR;
    let e = 0; for (const d of [0, 0.011, 0.023]) if (tt >= d) e += Math.exp(-(tt - d) * 120);
    e = e * 0.55 + Math.exp(-tt * 16) * 0.5;
    const y = h.run(f.run(noise())) * e * 0.85 * g;
    add(mL, i0 + k, y); add(mR, i0 + k, y * 0.95); add(sendL, i0 + k, y * 0.35); add(sendR, i0 + k, y * 0.35);
  }
}
function hat(t, g = 1, open = false) {
  const i0 = Math.floor(t * SR), f = new Biquad(); f.set('hp', 7800, 0.9);
  const dec = open ? 11 : 70, pan = 0.5 + 0.25 * (rnd() - 0.5);
  for (let k = 0; k < SR * (open ? 0.3 : 0.07); k++) {
    const y = f.run(noise()) * Math.exp(-(k / SR) * dec) * 0.3 * g;
    add(mL, i0 + k, y * (1 - pan) * 2); add(mR, i0 + k, y * pan * 2);
  }
}
function bass808(t, note, dur, g = 1) {
  const i0 = Math.floor(t * SR), f0 = midi(note); let ph = 0;
  for (let k = 0; k < SR * dur; k++) {
    const tt = k / SR, f = f0 * (1 + 0.55 * Math.exp(-tt * 42));
    ph += TAU * f / SR;
    const e = Math.min(1, tt * 400) * Math.exp(-tt * 2.1) * (1 - sm(dur - 0.04, dur, tt));
    const y = Math.tanh(Math.sin(ph) * 2.8) * e * 0.5 * g;
    add(mL, i0 + k, y); add(mR, i0 + k, y);
  }
}
function cowbell(t, note, g = 1, bright = 1) {
  const i0 = Math.floor(t * SR), f0 = midi(note), f = new Biquad(); f.set('bp', f0 * 2.6, 1.3);
  const lp = new Biquad(); lp.set('lp', 1200 + 9000 * bright, 0.7);
  let p1 = 0, p2 = 0; const pan = 0.5 + 0.18 * Math.sin(note * 2.1);
  for (let k = 0; k < SR * 0.34; k++) {
    const tt = k / SR;
    p1 += f0 / SR; p2 += f0 * 1.4815 / SR;
    const sq = ((p1 % 1) < 0.5 ? 1 : -1) + ((p2 % 1) < 0.5 ? 1 : -1) * 0.8;
    const e = Math.exp(-tt * 60) * 0.55 + Math.exp(-tt * 11) * 0.45;
    const y = lp.run(Math.tanh((f.run(sq) * 1.6 + sq * 0.12) * 1.7)) * e * 0.3 * g;
    add(mL, i0 + k, y * (1 - pan) * 2); add(mR, i0 + k, y * pan * 2); add(sendL, i0 + k, y * 0.42); add(sendR, i0 + k, y * 0.42);
  }
}
function pad(t0, t1, notes, g, cut0, cut1) {
  const i0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR), f = new Biquad(), f2 = new Biquad();
  const ph = notes.flatMap((nt) => [[midi(nt) * 0.996, rnd()], [midi(nt) * 1.004, rnd()], [midi(nt) * 0.5, rnd()]]);
  for (let k = 0; k < n; k++) {
    const u = k / n;
    if (k % CH === 0) { const c = cut0 * Math.pow(cut1 / cut0, u); f.set('lp', c, 1.2); f2.set('lp', c * 1.1, 0.8); }
    let sL = 0, sR = 0;
    ph.forEach((p, j) => { p[1] = (p[1] + p[0] / SR) % 1; const s = p[1] * 2 - 1; if (j % 2) sL += s; else sR += s; sL += s * 0.3; sR += s * 0.3; });
    const e = Math.min(1, u * (t1 - t0) / 0.6) * Math.min(1, (1 - u) * (t1 - t0) / 0.5) * g * 0.05;
    add(mL, i0 + k, f.run(sL) * e); add(mR, i0 + k, f2.run(sR) * e);
  }
}
function riser(t0, t1, g = 1) {
  const i0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR), f = new Biquad();
  for (let k = 0; k < n; k++) {
    const u = k / n; if (k % CH === 0) f.set('bp', 300 * Math.pow(30, u), 2.5);
    const y = f.run(noise()) * u * u * 0.5 * g;
    add(mL, i0 + k, y * (1 + 0.3 * Math.sin(k / SR * 9))); add(mR, i0 + k, y * (1 - 0.3 * Math.sin(k / SR * 9)));
  }
}
function impact(t, g = 1) {
  const i0 = Math.floor(t * SR), f = new Biquad(); let ph = 0;
  for (let k = 0; k < SR * 2.2; k++) {
    const tt = k / SR; if (k % CH === 0) f.set('lp', 9000 * Math.exp(-tt * 1.6) + 500, 0.7);
    ph += TAU * (34 + 40 * Math.exp(-tt * 9)) / SR;
    const y = (Math.sin(ph) * Math.exp(-tt * 2.6) * 0.75 + f.run(noise()) * Math.exp(-tt * 2.4) * 0.3) * g;
    add(mL, i0 + k, y); add(mR, i0 + k, y); add(sendL, i0 + k, y * 0.2); add(sendR, i0 + k, y * 0.2);
  }
}

// Progression en fa mineur : i – VII – VI – V (Fm, Mib, Réb, Do)
const ROOTS = [41, 39, 37, 36];
const CHORDS = [[53, 56, 60], [51, 55, 58], [49, 53, 56], [48, 52, 55]];
const MEL = [ // croches, 0 = silence (notes MIDI)
  [77, 0, 80, 77, 84, 0, 82, 80],
  [79, 0, 82, 79, 85, 84, 82, 80],
  [77, 0, 80, 77, 84, 0, 87, 85],
  [84, 82, 80, 79, 77, 0, 77, 76],
];
const KICKS = [[0, 6, 10], [0, 6, 8, 14], [0, 6, 10], [0, 3, 6, 10, 13]];
const TOTAL_BARS = Math.round(DURATION / BAR);
for (let bar = 0; bar < TOTAL_BARS; bar++) {
  const t0 = bar * BAR, q = bar % 4;
  const intro = bar < 2, outro = bar >= 34, brk = bar >= 16 && bar < 18, pre = bar === 25; // montée avant les donuts
  const drums = !intro && !outro && !brk;
  const last = bar === 33; // la voiture s'arrête : fin sèche à mi-mesure
  if (drums) {
    for (const s of KICKS[q]) { if (last && s > 8) continue; kick(t0 + s * STEP); bass808(t0 + s * STEP, ROOTS[q], s === KICKS[q][KICKS[q].length - 1] ? 0.5 : 0.62, 1); }
    if (!last) { clap(t0 + 4 * STEP); clap(t0 + 12 * STEP); } else clap(t0 + 4 * STEP);
    for (let s = 0; s < (last ? 8 : 16); s += 2) hat(t0 + s * STEP, s % 4 === 2 ? 1 : 0.7);
    if (q === 1 || q === 3) for (const s of [13, 15]) if (!last) hat(t0 + s * STEP, 0.55);
    if (q === 3 && !last) { hat(t0 + 14.5 * STEP, 0.5); hat(t0 + 15.5 * STEP, 0.5); }
    if (q % 2 === 0) hat(t0 + 10 * STEP, 0.55, true);
    if (pre) for (let s = 8; s < 16; s++) clap(t0 + s * STEP, 0.25 + 0.05 * (s - 8));
  }
  // mélodie cowbell
  const melG = intro ? (bar === 0 ? 0 : 0.5) : outro ? (bar === 34 ? 0.55 : 0) : brk ? 0.7 : 1;
  const bright = intro ? 0.08 + 0.1 * bar : brk ? 0.25 + 0.3 * (bar - 16) : outro ? 0.15 : 1;
  if (melG > 0) MEL[q].forEach((n, k) => {
    if (!n || (last && k > 4)) return;
    cowbell(t0 + k * 2 * STEP, n, melG, bright);
    if (drums && (k === 3 || k === 6) && q !== 3) cowbell(t0 + (k * 2 + 1) * STEP, n, 0.45, bright); // ghost notes
    if (drums && bar >= 26 && bar < 30) cowbell(t0 + k * 2 * STEP, n - 12, 0.45, 1); // section donuts doublée à l'octave
  });
  if (brk) bass808(t0, ROOTS[q], 1.7, 0.8);
  pad(t0, t0 + BAR + 0.3, CHORDS[q], intro || outro ? 1.5 : brk ? 1.3 : 0.7, intro ? 400 + 300 * bar : brk ? 700 : 1500, intro ? 900 + 600 * bar : outro ? 500 : brk ? 2200 : 1700);
}
riser(0.6, 2 * BAR, 0.8); impact(2 * BAR, 1);
riser(17 * BAR, 18 * BAR, 0.8); impact(18 * BAR, 0.8);
riser(25 * BAR, 25.5 * BAR, 0.5); impact(26 * BAR, 0.55);
impact(T_STOP + 0.02, 0.9);

// réverbération (4 peignes + 2 passe-tout) sur les départs
function reverb(inp, seedOff) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + seedOff), i: 0, lp: 0 }));
  const aps = [225, 556].map((d) => ({ buf: new Float32Array(d + seedOff), i: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) { const y = c.buf[c.i]; c.lp = y * 0.72 + c.lp * 0.28; c.buf[c.i] = inp[n] + c.lp * 0.84; c.i = (c.i + 1) % c.buf.length; s += y; }
    s *= 0.25;
    for (const a of aps) { const y = a.buf[a.i]; const v = s + y * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; s = y - v * 0.5; }
    out[n] = s;
  }
  return out;
}
const rvL = reverb(sendL, 0), rvR = reverb(sendR, 23);

// ------------------------------------------------------------------ mixage
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  // moteur/pneus mis en avant pendant le break et l'intro
  const fxG = 0.5 + 0.3 * (sm(16 * BAR - 0.2, 16 * BAR, t) - sm(18 * BAR - 0.1, 18 * BAR, t)) + 0.3 * (1 - sm(2 * BAR - 0.05, 2 * BAR, t)) + 0.25 * sm(T_STOP, T_STOP + 0.3, t);
  const d = 0.55 + 0.45 * duck[i];
  let l = L[i] * fxG * d + (mL[i] + rvL[i] * 0.9) * 0.82;
  let r = R[i] * fxG * d + (mR[i] + rvR[i] * 0.9) * 0.82;
  const fade = sm(0, 0.5, t) * (1 - sm(DURATION - 1.6, DURATION - 0.1, t));
  l = Math.tanh(l * 1.12) * fade; r = Math.tanh(r * 1.12) * fade;
  L[i] = l; R[i] = r; peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const norm = 0.92 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round(clamp(L[i] * norm, -1, 1) * 32767), 44 + i * 4); pcm.writeInt16LE(Math.round(clamp(R[i] * norm, -1, 1) * 32767), 46 + i * 4); }
const out = path.resolve(process.argv[2] || 'build/audio.wav');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, pcm);
console.log(`Audio écrit : ${out} (${DURATION} s, crête ${peak.toFixed(2)})`);
void BURN_T0;
