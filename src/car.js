import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { radialTexture, clamp, hash, smooth } from './util.js';
import { Billboards, glowTexture } from './fx.js';
import { T_START, T_STOP } from './path.js';

// Voiture : modèle glTF fourni (assets/diablo_sv.glb — « 1997 Lamborghini Diablo SV Coupe »
// par Ddiaz Design, CC BY-NC-SA 4.0). Le modèle est recalé dans le repère de la simulation
// (avant = +x, haut = +y, origine au milieu de l'empattement, pneus posés sur y = 0),
// puis animé : rotation et braquage des roues, roulis/tangage de la caisse, feux, halos.

export const CAR_LENGTH = 4.47; // m (longueur réelle du modèle 1997)
const PATH_WHEEL_R = 0.33; // rayon utilisé par path.js pour intégrer la rotation des roues

// barycentres et boîtes de groupes de sommets d'un maillage (repère monde = repère voiture à l'origine)
function clusters(mesh, filter) {
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const key = filter(v); if (key === null) continue;
    let g = groups.get(key); if (!g) { g = { c: new THREE.Vector3(), n: 0, box: new THREE.Box3() }; groups.set(key, g); }
    g.c.add(v); g.n++; g.box.expandByPoint(v);
  }
  for (const g of groups.values()) g.c.multiplyScalar(1 / g.n);
  return groups;
}

export async function buildCar() {
  const gltf = await new GLTFLoader().loadAsync('/assets/diablo_sv.glb');
  const model = gltf.scene;
  const car = new THREE.Group();
  const body = new THREE.Group(); car.add(body);
  const fit = new THREE.Group(); body.add(fit); fit.add(model);

  // ------------------------------------------------ recalage : l'avant du modèle est +z -> +x
  fit.rotation.y = Math.PI / 2;
  car.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model, true);
  fit.scale.setScalar(CAR_LENGTH / (box.max.x - box.min.x));
  car.updateMatrixWorld(true);

  const meshes = []; model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const isWheel = (o) => /Wheel/i.test(o.material.name), isCaliper = (o) => /Calliper/i.test(o.material.name);
  const wheelBox = new THREE.Box3();
  for (const o of meshes) if (isWheel(o)) wheelBox.union(new THREE.Box3().setFromObject(o, true));
  box = new THREE.Box3().setFromObject(model, true);
  fit.position.set(-(wheelBox.min.x + wheelBox.max.x) / 2, -wheelBox.min.y, -(box.min.z + box.max.z) / 2);
  car.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model, true);

  // ------------------------------------------------ matériaux
  const materials = new Set();
  let lightMat = null, lightBase = 1;
  for (const o of meshes) {
    const m = o.material; materials.add(m);
    o.frustumCulled = false;
    if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.depthWrite = false; }
    const n = m.name;
    if (/Window/i.test(n)) { m.color.setRGB(0.01, 0.012, 0.016); m.opacity = 0.62; m.roughness = 0.05; m.metalness = 0.6; m.envMapIntensity = 1.6; } else if (/red_glass|orange_glass/.test(n)) { m.opacity = 0.55; m.envMapIntensity = 1.0; } else if (/light_glass/.test(n)) { m.opacity = 0.35; m.envMapIntensity = 1.2; } else if (/Paint/i.test(n)) { m.envMapIntensity = 1.7; m.clearcoat = 1; m.clearcoatRoughness = 0.05; m.roughness = 0.3; } else if (/Interior/i.test(n)) { m.emissiveIntensity = Math.min(m.emissiveIntensity, 1.2); m.envMapIntensity = 0.5; } else m.envMapIntensity = 1.1;
    if (/LightA/i.test(n)) { lightMat = m; lightBase = m.emissiveIntensity; }
  }
  car.materials = [...materials];

  // ------------------------------------------------ roues (maillages séparés) et étriers
  const wheels = [];
  for (const o of meshes) {
    if (!isWheel(o) && !isCaliper(o)) continue;
    const b = new THREE.Box3().setFromObject(o, true), c = b.getCenter(new THREE.Vector3());
    o.matrixAutoUpdate = false;
    wheels.push({ mesh: o, rest: o.matrixWorld.clone(), c, front: c.x > 0, tire: isWheel(o), radius: (b.max.y - b.min.y) / 2 });
  }
  // les étriers pivotent (braquage) autour du centre de la roue correspondante
  for (const w of wheels) if (!w.tire) { const t = wheels.find((k) => k.tire && (k.c.x > 0) === (w.c.x > 0) && (k.c.z > 0) === (w.c.z > 0)); if (t) w.c = t.c; }
  car.wheels = wheels;
  const tires = wheels.filter((w) => w.tire);
  const rear = tires.filter((w) => !w.front), frontW = tires.filter((w) => w.front);
  car.rearX = rear.reduce((a, w) => a + w.c.x, 0) / rear.length;
  car.frontX = frontW.reduce((a, w) => a + w.c.x, 0) / frontW.length;
  car.trackZ = rear.reduce((a, w) => a + Math.abs(w.c.z), 0) / rear.length;

  // ------------------------------------------------ position des optiques (déduite de la géométrie)
  const lamps = [];
  const red = meshes.find((o) => /red_glass/.test(o.material.name));
  const lens = meshes.find((o) => /light_glass/.test(o.material.name));
  const r2 = (a) => a.map((x) => +x.toFixed(3));
  const info = { box: [r2(box.min.toArray()), r2(box.max.toArray())], wheels: tires.map((w) => [r2(w.c.toArray()), +w.radius.toFixed(3)]), rearX: car.rearX, frontX: car.frontX, trackZ: car.trackZ, tail: {}, head: {}, lens: {} };
  if (red) {
    for (const [k, t] of clusters(red, (v) => (v.x < 0 ? (v.z > 0 ? 'L' : 'R') : null))) {
      info.tail[k] = [r2(t.c.toArray()), r2(t.box.min.toArray()), r2(t.box.max.toArray())];
      lamps.push({ p: new THREE.Vector3(t.box.min.x - 0.04, t.c.y, t.c.z), n: new THREE.Vector3(-1, 0, 0), size: 1.0, col: [1.0, 0.07, 0.04], kind: 'tail' });
    }
  }
  // phares escamotables : partie haute et avant du maillage des optiques ; à défaut, feux de bouclier
  const lightMesh = meshes.find((o) => /LightA/i.test(o.material.name));
  let heads = lightMesh ? clusters(lightMesh, (v) => (v.x > 1.2 && v.y > 0.62 ? (v.z > 0 ? 'L' : 'R') : null)) : new Map();
  if (heads.size < 2 && lens) heads = clusters(lens, (v) => (v.x > 1.0 ? (v.z > 0 ? 'L' : 'R') : null));
  for (const [k, t] of heads) {
    info.head[k] = [r2(t.c.toArray()), r2(t.box.min.toArray()), r2(t.box.max.toArray())];
    lamps.push({ p: new THREE.Vector3(t.box.max.x + 0.04, t.c.y, t.c.z), n: new THREE.Vector3(1, 0, 0), size: 1.0, col: [1.0, 0.96, 0.86], kind: 'head' });
  }
  if (lightMesh) for (const [k, t] of clusters(lightMesh, (v) => `${v.x > 1.2 ? 'F' : v.x < -1.2 ? 'B' : 'M'}${v.y > 0.62 ? 'hi' : 'lo'}${v.z > 0 ? 'L' : 'R'}`)) info.lens[k] = [t.n, r2(t.box.min.toArray()), r2(t.box.max.toArray())];
  car.lamps = lamps; car.info = info;
  car.nose = box.max.x; car.tail = box.min.x; car.height = box.max.y;

  // ------------------------------------------------ sol : ombre, faisceau des phares, lueur des feux
  const len = box.max.x - box.min.x, wid = box.max.z - box.min.z, cx = (box.max.x + box.min.x) / 2;
  const shadowTex = radialTexture(128, [[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.24, wid * 1.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(cx, 0.022, 0); shadow.renderOrder = 6; car.add(shadow);
  const beamTex = radialTexture(128, [[0, 'rgba(255,244,220,0.55)'], [0.4, 'rgba(255,242,215,0.22)'], [1, 'rgba(255,240,215,0)']]);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(17, 8.5), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: new THREE.Color(0.5, 0.5, 0.5) }));
  beam.rotation.x = -Math.PI / 2; beam.position.set(box.max.x + 7.5, 0.03, 0); beam.renderOrder = 7; car.add(beam);
  const tailPool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.6), new THREE.MeshBasicMaterial({ map: radialTexture(64, [[0, 'rgba(255,30,20,0.5)'], [1, 'rgba(255,30,20,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  tailPool.rotation.x = -Math.PI / 2; tailPool.position.set(box.min.x - 1.1, 0.03, 0); tailPool.renderOrder = 7; car.add(tailPool);
  car.mainOnly = [shadow, beam, tailPool];

  // ------------------------------------------------ halos (phares, feux, flammes d'échappement)
  const glows = new Billboards(24, glowTexture(), { additive: true, fog: false });
  glows.mesh.renderOrder = 30;
  car.glows = glows;
  car.pops = []; // instants des retours de flamme, synchronisés avec le son
  const exhaust = new THREE.Vector3(box.min.x - 0.12, 0.34, 0);

  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), toCam = new THREE.Vector3();
  const mT = new THREE.Matrix4(), mR = new THREE.Matrix4(), mA = new THREE.Matrix4(), mInv = new THREE.Matrix4();
  car.update = (st, t, camera) => {
    car.position.set(st.x, 0, st.z);
    car.rotation.y = -st.yaw;
    const launch = smooth(T_START - 0.05, T_START + 0.5, t) * (1 - smooth(T_START + 0.9, T_START + 2.6, t));
    const stopDip = smooth(T_STOP - 0.5, T_STOP, t) * (1 - smooth(T_STOP, T_STOP + 0.5, t));
    const shake = st.burn * 0.004 * Math.sin(t * 95) + (st.v > 1 ? 0.0025 * Math.sin(t * 61) : 0.0012 * Math.sin(t * 52));
    body.rotation.x = clamp(-st.alat * 0.0042, -0.065, 0.065) + shake;
    body.rotation.z = clamp(st.acc * 0.003, -0.025, 0.03) + launch * 0.025 - stopDip * 0.025 + st.burn * 0.01;
    body.position.y = 0.004 * Math.sin(t * 7.3) * Math.min(1, st.v / 10);
    car.updateMatrixWorld(true);
    // roues : restent posées au sol quelle que soit l'attitude de la caisse
    const delta = clamp(-st.beta * 0.9, -0.6, 0.6);
    for (const w of wheels) {
      const spin = w.tire ? -(w.front ? st.spin : st.spinR) * PATH_WHEEL_R / w.radius : 0;
      mA.makeTranslation(w.c.x, w.c.y, w.c.z);
      mR.makeRotationY(w.front ? -delta : 0); mA.multiply(mR);
      mR.makeRotationZ(spin); mA.multiply(mR);
      mT.makeTranslation(-w.c.x, -w.c.y, -w.c.z); mA.multiply(mT).multiply(w.rest); // pose voulue, repère voiture
      mT.copy(car.matrixWorld).multiply(mA);
      mInv.copy(w.mesh.parent.matrixWorld).invert();
      w.mesh.matrix.multiplyMatrices(mInv, mT);
      w.mesh.matrixWorld.copy(mT);
    }
    // feux stop
    const brake = clamp(-st.acc / 5, 0, 1) * (st.v > 0.5 ? 1 : 0) + (t >= T_STOP ? 1 : 0) + (t < T_START ? 0.6 * (1 - st.burn) : 0);
    const tl = 0.55 + 0.45 * Math.min(1, brake);
    if (lightMat) lightMat.emissiveIntensity = lightBase * (0.7 + 0.9 * Math.min(1, brake));
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
      tmp.set(exhaust.x - a * 2.2, exhaust.y, exhaust.z).applyMatrix4(body.matrixWorld);
      glows.set(n++, tmp.x, tmp.y, tmp.z, 0.9 + 0.9 * hash(tp), 1.0, 0.55, 0.12, 1.2 * k);
      glows.set(n++, tmp.x, tmp.y, tmp.z, 0.35, 0.6, 0.7, 1.0, 1.5 * k);
    }
    glows.commit(n);
  };
  return car;
}
