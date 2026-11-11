import * as THREE from 'three';
import { canvasTexture, radialTexture, clamp, hash, smooth } from './util.js';
import { Billboards, glowTexture } from './fx.js';
import { T_START, T_STOP } from './path.js';

// Coupé sport japonais générique des années 90 : carrosserie blanche nacrée, jantes bronze,
// aileron, quatre feux ronds. Modélisé par « lofting » de sections en super-ellipse.

const WHEEL_R = 0.33, WHEEL_Z = 0.8, FRONT_X = 1.35, REAR_X = -1.3;

function catmull(st, u) { // st : tableau de stations [x, ...params], u dans [0, n-1]
  const n = st.length, i = Math.min(n - 2, Math.floor(u)), t = u - i;
  const p0 = st[Math.max(0, i - 1)], p1 = st[i], p2 = st[i + 1], p3 = st[Math.min(n - 1, i + 2)];
  return p1.map((_, k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
}

// Génère un loft. section(params, theta) -> [y, z]; classify(x, thetaDeg) -> index de matériau
function loft(stations, rings, M, section, classify, uvFn) {
  const pos = [], uv = [], groups = {};
  const R = rings;
  for (let a = 0; a <= R; a++) {
    const s = catmull(stations, (a / R) * (stations.length - 1));
    for (let b = 0; b <= M; b++) {
      const th = (b / M) * Math.PI * 2;
      const [y, z] = section(s, th);
      pos.push(s[0], y, z);
      uv.push(...uvFn(s[0], y, z));
    }
  }
  const W = M + 1;
  for (let a = 0; a < R; a++) {
    const xm = (catmull(stations, ((a + 0.5) / R) * (stations.length - 1)))[0];
    for (let b = 0; b < M; b++) {
      const k = classify(xm, ((b + 0.5) / M) * 360);
      const i0 = a * W + b, i1 = i0 + 1, i2 = i0 + W, i3 = i2 + 1;
      (groups[k] ||= []).push(i0, i2, i1, i1, i2, i3);
    }
  }
  // bouchons avant / arrière
  for (const [a, flip] of [[0, false], [R, true]]) {
    const s = catmull(stations, a === 0 ? 0 : stations.length - 1);
    const [yc] = section(s, 0); const c = pos.length / 3;
    let ym = 0; for (let b = 0; b < M; b++) ym += pos[(a * W + b) * 3 + 1]; ym /= M;
    pos.push(s[0] + (a === 0 ? -0.02 : 0.02), ym, 0); uv.push(...uvFn(s[0], ym, 0));
    const k = classify(s[0], -1);
    for (let b = 0; b < M; b++) { const i0 = a * W + b, i1 = i0 + 1; (groups[k] ||= []).push(...(flip ? [c, i1, i0] : [c, i0, i1])); }
    void yc;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const idx = []; const keys = Object.keys(groups).map(Number).sort();
  for (const k of keys) { g.addGroup(idx.length, groups[k].length, k); idx.push(...groups[k]); }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

export function buildCar() {
  const car = new THREE.Group();
  const body = new THREE.Group(); car.add(body);

  // ------------------------------------------------ livrée (projection latérale : u = x, v = y)
  const X0 = -2.3, X1 = 2.3, Y0 = 0.1, Y1 = 1.0;
  const uvSide = (x, y) => [(x - X0) / (X1 - X0), (y - Y0) / (Y1 - Y0)];
  const livery = canvasTexture(2048, 512, (g, w, h) => {
    const px = (x) => ((x - X0) / (X1 - X0)) * w, py = (y) => (1 - (y - Y0) / (Y1 - Y0)) * h;
    g.fillStyle = '#f4f4f6'; g.fillRect(0, 0, w, h);
    // bandes obliques dégradées magenta -> cyan sur les flancs
    const gr = g.createLinearGradient(px(-1.9), 0, px(1.2), 0);
    gr.addColorStop(0, '#ff1f8e'); gr.addColorStop(0.55, '#8a3cff'); gr.addColorStop(1, '#12d8ff');
    g.fillStyle = gr;
    const band = (xa, xb, ya, yb, sk) => { g.beginPath(); g.moveTo(px(xa), py(ya)); g.lineTo(px(xb), py(ya)); g.lineTo(px(xb + sk), py(yb)); g.lineTo(px(xa + sk), py(yb)); g.closePath(); g.fill(); };
    band(-2.05, 0.75, 0.36, 0.5, 0.16);
    band(-1.75, -0.2, 0.54, 0.6, 0.07);
    for (let k = 0; k < 5; k++) band(0.95 + k * 0.17, 1.05 + k * 0.17 - k * 0.012, 0.36, 0.5, 0.16);
    // bas de caisse sombre
    g.fillStyle = '#0c0c0f'; g.fillRect(0, py(0.265), w, h);
    // passages de roue
    for (const wx of [FRONT_X, REAR_X]) { g.beginPath(); g.arc(px(wx), py(WHEEL_R - 0.01), (0.415 / (X1 - X0)) * w, 0, Math.PI * 2); g.fill(); }
    // lignes de portière, poignée, ouïe d'aile
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(px(0.62), py(0.86)); g.lineTo(px(0.56), py(0.3)); g.moveTo(px(-0.52), py(0.86)); g.lineTo(px(-0.6), py(0.3)); g.stroke();
    g.fillStyle = '#111'; g.fillRect(px(-0.45), py(0.74), 26, 9);
    g.fillRect(px(0.78), py(0.7), 34, 5); g.fillRect(px(0.78), py(0.66), 34, 5);
  });
  livery.anisotropy = 16;

  const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9e9ef, map: livery, metalness: 0.15, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 2.0 });
  const paintPlain = new THREE.MeshPhysicalMaterial({ color: 0xe9e9ef, metalness: 0.15, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 2.0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x04060a, metalness: 0.95, roughness: 0.06, envMapIntensity: 1.5 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, metalness: 0.4, roughness: 0.62, envMapIntensity: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x07070a, metalness: 0.2, roughness: 0.75 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.0, roughness: 0.92 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb07a34, metalness: 0.95, roughness: 0.32, envMapIntensity: 1.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 1, roughness: 0.4 });
  const caliper = new THREE.MeshStandardMaterial({ color: 0xd01420, metalness: 0.3, roughness: 0.5 });
  car.materials = [paint, paintPlain, glass, carbon, trim, rubber, bronze, steel, caliper];

  // ------------------------------------------------ caisse
  // stations : [x, demi-largeur, y bas, y haut]
  const hullSt = [
    [-2.24, 0.74, 0.36, 0.80], [-2.16, 0.84, 0.27, 0.875], [-1.75, 0.895, 0.20, 0.905], [-0.9, 0.905, 0.18, 0.90], [0.0, 0.905, 0.18, 0.885],
    [0.65, 0.90, 0.18, 0.865], [1.3, 0.895, 0.19, 0.80], [1.85, 0.86, 0.21, 0.715], [2.14, 0.79, 0.25, 0.625], [2.27, 0.68, 0.30, 0.53],
  ];
  const hullSection = (s, th) => {
    const [, hw, yb, yt] = s, ym = (yb + yt) / 2, hh = (yt - yb) / 2;
    const c = Math.cos(th), sn = Math.sin(th);
    let z = hw * sp(c, 0.42), y = ym + hh * sp(sn, sn > 0 ? 0.5 : 0.42);
    if (sn > 0) z *= 1 - 0.085 * sn * sn; // épaules rentrantes
    return [y, z];
  };
  const hull = new THREE.Mesh(loft(hullSt, 56, 40, hullSection, () => 0, uvSide), [paint]);
  body.add(hull);

  // ------------------------------------------------ habitacle : [x, demi-largeur, y haut]
  const CB = 0.80;
  const cabSt = [[-1.86, 0.69, 0.86], [-1.45, 0.72, 1.03], [-1.0, 0.72, 1.195], [-0.55, 0.72, 1.255], [-0.1, 0.72, 1.24], [0.3, 0.72, 1.10], [0.62, 0.72, 0.95], [0.86, 0.70, 0.86]];
  const cabSection = (s, th) => {
    const [, hw, yt] = s, hh = yt - CB;
    const c = Math.cos(th), sn = Math.sin(th);
    if (sn < 0) return [CB + hh * 0.15 * sn, hw * sp(c, 0.5)];
    const y = CB + hh * Math.pow(sn, 0.42);
    return [y, hw * sp(c, 0.36) * (1 - 0.2 * Math.pow(sn, 1.2))];
  };
  const cabClass = (x, deg) => {
    if (deg < 0) return 1; // bouchons
    const d = deg > 180 ? 360 - deg : deg; // symétrie haut/bas ignorée (le bas est caché)
    if (deg > 180) return 1;
    const side = d < 30 || d > 150, rail = !side && (d < 49 || d > 131);
    if (rail) return 0;
    if (side) return (x < -0.98 || (x > -0.50 && x < -0.42)) ? 0 : 1;
    return (x > -1.02 && x < 0.0) ? 2 : 1; // toit carbone, sinon vitrage
  };
  const cabin = new THREE.Mesh(loft(cabSt, 40, 48, cabSection, cabClass, () => [0.5, 0.97]), [paintPlain, glass, carbon]);
  body.add(cabin);

  const box = (w, h, d, x, y, z, mat, parent = body) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  // soubassement, lame avant, jupes, diffuseur
  box(4.1, 0.2, 1.5, 0, 0.27, 0, trim);
  box(0.5, 0.035, 1.72, 2.08, 0.185, 0, carbon);
  for (const s of [-1, 1]) box(1.75, 0.07, 0.07, 0.02, 0.2, s * 0.9, carbon);
  box(0.3, 0.12, 1.3, -2.12, 0.27, 0, carbon);
  // calandre et prises d'air
  box(0.08, 0.15, 1.05, 2.225, 0.355, 0, trim);
  for (const s of [-1, 1]) box(0.06, 0.1, 0.24, 2.19, 0.37, s * 0.62, trim);
  // rétroviseurs
  for (const s of [-1, 1]) { const m = box(0.14, 0.1, 0.2, 0.55, 0.93, s * 0.9, paintPlain); m.rotation.y = s * 0.2; }
  // aileron
  for (const s of [-1, 1]) box(0.26, 0.26, 0.04, -2.0, 1.0, s * 0.56, carbon);
  const wing = box(0.36, 0.035, 1.66, -2.04, 1.135, 0, carbon); wing.rotation.z = -0.12;
  for (const s of [-1, 1]) box(0.4, 0.17, 0.03, -2.04, 1.15, s * 0.83, carbon);
  // échappement
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.22, 14), steel); ex.rotation.z = Math.PI / 2; ex.position.set(-2.2, 0.3, -0.48); body.add(ex);
  // plaque
  box(0.02, 0.12, 0.34, -2.262, 0.455, 0, new THREE.MeshBasicMaterial({ color: 0x8a8a84 }));

  // ------------------------------------------------ optiques
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.5, 3.1) });
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.12, 0.08) });
  car.tailMat = tailMat;
  const lamps = [];
  for (const s of [-1, 1]) {
    const h = box(0.06, 0.04, 0.3, 2.178, 0.585, s * 0.52, headMat); h.rotation.y = -s * 0.42; h.rotation.z = -0.25;
    const housing = box(0.1, 0.085, 0.4, 2.135, 0.59, s * 0.52, trim); housing.rotation.copy(h.rotation);
    lamps.push({ p: new THREE.Vector3(2.22, 0.6, s * 0.53), n: new THREE.Vector3(1, 0, 0), size: 1.0, col: [1.0, 0.96, 0.86], kind: 'head' });
    for (const zz of [0.36, 0.6]) {
      const t = new THREE.Mesh(new THREE.CircleGeometry(0.082, 20), tailMat); t.rotation.y = -Math.PI / 2; t.position.set(-2.274, 0.64, s * zz); body.add(t);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.082, 0.1, 20), trim); ring.rotation.y = -Math.PI / 2; ring.position.set(-2.272, 0.64, s * zz); body.add(ring);
    }
    lamps.push({ p: new THREE.Vector3(-2.3, 0.64, s * 0.48), n: new THREE.Vector3(-1, 0, 0), size: 1.0, col: [1.0, 0.07, 0.04], kind: 'tail' });
  }
  box(0.03, 0.21, 1.4, -2.252, 0.64, 0, trim); // bandeau arrière sombre
  car.lamps = lamps;

  // ------------------------------------------------ roues
  const tireProfile = [[0.2, -0.125], [0.3, -0.125], [0.325, -0.1], [0.33, -0.06], [0.33, 0.06], [0.325, 0.1], [0.3, 0.125], [0.2, 0.125]].map(([r, z]) => new THREE.Vector2(r, z));
  const tireG = new THREE.LatheGeometry(tireProfile, 36); tireG.rotateX(Math.PI / 2);
  const rimParts = [];
  { // jante 6 branches
    const barrel = new THREE.CylinderGeometry(0.212, 0.212, 0.2, 28, 1, true); barrel.rotateX(Math.PI / 2); rimParts.push(barrel);
    const lip = new THREE.TorusGeometry(0.206, 0.014, 8, 36); lip.translate(0, 0, 0.115); rimParts.push(lip);
    const hub = new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12); hub.rotateX(Math.PI / 2); hub.translate(0, 0, 0.07); rimParts.push(hub);
    for (let k = 0; k < 6; k++) { const sp6 = new THREE.BoxGeometry(0.185, 0.04, 0.026); sp6.translate(0.115, 0, 0.085); sp6.rotateY(0.18); sp6.rotateZ((k / 6) * Math.PI * 2); rimParts.push(sp6); }
  }
  const discG = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24); discG.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [x, front] of [[FRONT_X, true], [REAR_X, false]]) for (const s of [-1, 1]) {
    const steer = new THREE.Group(); steer.position.set(x, WHEEL_R, s * WHEEL_Z); car.add(steer);
    const side = new THREE.Group(); steer.add(side);
    if (s < 0) side.rotation.y = Math.PI; // face extérieure vers -z
    side.rotation.x = -0.045; // carrossage négatif
    const spin = new THREE.Group(); side.add(spin);
    spin.add(new THREE.Mesh(tireG, rubber));
    for (const g of rimParts) spin.add(new THREE.Mesh(g, bronze));
    const disc = new THREE.Mesh(discG, steel); disc.position.z = 0.02; side.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), caliper); cal.position.set(s * (front ? -0.13 : 0.13), 0.03, 0.03); side.add(cal);
    wheels.push({ steer, spin, front, s });
    // élargisseur d'aile
    const flare = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.035, 8, 24, Math.PI), paintPlain);
    flare.position.set(x, WHEEL_R - 0.01, s * 0.885); flare.scale.z = 1.3; body.add(flare);
  }
  car.wheels = wheels;

  // ------------------------------------------------ sol : ombre et faisceau des phares
  const shadowTex = radialTexture(128, [[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.022; shadow.renderOrder = 6; car.add(shadow);
  const beamTex = radialTexture(128, [[0, 'rgba(255,244,220,0.55)'], [0.4, 'rgba(255,242,215,0.22)'], [1, 'rgba(255,240,215,0)']]);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(17, 8.5), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(0.5, 0.5, 0.5) }));
  beam.rotation.x = -Math.PI / 2; beam.position.set(2.2 + 7.5, 0.03, 0); beam.renderOrder = 7; car.add(beam);
  const tailPool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.6), new THREE.MeshBasicMaterial({ map: radialTexture(64, [[0, 'rgba(255,30,20,0.5)'], [1, 'rgba(255,30,20,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  tailPool.rotation.x = -Math.PI / 2; tailPool.position.set(-3.3, 0.03, 0); tailPool.renderOrder = 7; car.add(tailPool);
  car.tailPool = tailPool;
  car.mainOnly = [shadow, beam, tailPool];

  // ------------------------------------------------ halos (phares, feux, flammes d'échappement)
  const glows = new Billboards(16, glowTexture(), { additive: true, fog: false });
  glows.mesh.renderOrder = 30;
  car.glows = glows;
  // instants des retours de flamme (lever de pied avant les virages), synchronisés avec le son
  car.pops = [];

  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), toCam = new THREE.Vector3();
  car.update = (st, t, camera) => {
    car.position.set(st.x, 0, st.z);
    car.rotation.y = -st.yaw;
    const launch = smooth(T_START - 0.05, T_START + 0.5, t) * (1 - smooth(T_START + 0.9, T_START + 2.6, t));
    const stopDip = smooth(T_STOP - 0.5, T_STOP, t) * (1 - smooth(T_STOP, T_STOP + 0.5, t));
    const shake = st.burn * 0.004 * Math.sin(t * 95) + (st.v > 1 ? 0.0025 * Math.sin(t * 61) : 0.0012 * Math.sin(t * 52));
    body.rotation.x = clamp(-st.alat * 0.0052, -0.085, 0.085) + shake;
    body.rotation.z = clamp(st.acc * 0.0035, -0.03, 0.035) + launch * 0.03 - stopDip * 0.03 + st.burn * 0.012;
    body.position.y = -0.012 + 0.006 * Math.sin(t * 7.3) * Math.min(1, st.v / 10);
    const delta = clamp(-st.beta * 0.9, -0.62, 0.62);
    for (const w of wheels) {
      w.steer.rotation.y = w.front ? -delta : 0;
      const a = w.front ? st.spin : st.spinR;
      w.spin.rotation.z = (w.s < 0 ? 1 : -1) * a;
    }
    car.updateMatrixWorld(true);
    // feux stop
    const brake = clamp(-st.acc / 5, 0, 1) * (st.v > 0.5 ? 1 : 0) + (t >= T_STOP ? 1 : 0) + (t < T_START ? 0.6 * (1 - st.burn) : 0);
    const tl = 0.55 + 0.45 * Math.min(1, brake);
    tailMat.color.setRGB(1.5 * tl, 0.025 * tl, 0.015 * tl);
    tailPool.material.opacity = 0.1 + 0.22 * Math.min(1, brake);
    let n = 0;
    for (const l of lamps) {
      tmp.copy(l.p).applyMatrix4(body.matrixWorld);
      nrm.copy(l.n).transformDirection(body.matrixWorld);
      toCam.copy(camera.position).sub(tmp).normalize();
      const f = Math.max(0, nrm.dot(toCam));
      const k = l.kind === 'head' ? Math.pow(f, 1.5) : Math.pow(f, 0.8) * tl;
      glows.set(n++, tmp.x, tmp.y, tmp.z, l.kind === 'head' ? 0.75 : l.size * (0.55 + 0.75 * k), l.col[0], l.col[1], l.col[2], (l.kind === 'head' ? 1.3 : 0.36) * k);
      if (l.kind === 'head') glows.set(n++, tmp.x, tmp.y, tmp.z, 5.5 * k, l.col[0], l.col[1], l.col[2], 0.05 * k * k);
    }
    // flammes d'échappement
    for (const tp of car.pops) {
      const a = t - tp;
      if (a < 0 || a > 0.16) continue;
      const k = 1 - a / 0.16;
      tmp.set(-2.38 - a * 2.2, 0.3, -0.48).applyMatrix4(body.matrixWorld);
      glows.set(n++, tmp.x, tmp.y, tmp.z, 0.9 + 0.9 * hash(tp), 1.0, 0.55, 0.12, 1.2 * k);
      glows.set(n++, tmp.x, tmp.y, tmp.z, 0.35, 0.6, 0.7, 1.0, 1.5 * k);
    }
    glows.commit(n);
  };
  return car;
}
