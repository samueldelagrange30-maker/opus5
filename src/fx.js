import * as THREE from 'three';
import { state, carPoint, DURATION, T_START } from './path.js';
import { hash, radialTexture, smooth } from './util.js';

// ------------------------------------------------------------------ billboards instanciés
export class Billboards {
  constructor(max, texture, { additive = false, fog = true, depthTest = true } = {}) {
    this.max = max; this.count = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // xyz + taille
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // rgb + alpha
    this.rot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute('iPos', this.pos); g.setAttribute('iCol', this.col); g.setAttribute('iRot', this.rot);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, fogColor: { value: new THREE.Color() }, fogDensity: { value: fog ? 1 : 0 } },
      vertexShader: `
        attribute vec4 iPos; attribute vec4 iCol; attribute float iRot;
        varying vec2 vUv; varying vec4 vCol; varying float vDepth;
        void main(){
          vUv = position.xy + 0.5; vCol = iCol;
          float c = cos(iRot), s = sin(iRot);
          vec2 p = vec2(c*position.x - s*position.y, s*position.x + c*position.y) * iPos.w;
          vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
          mv.xy += p;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 fogColor; uniform float fogDensity;
        varying vec2 vUv; varying vec4 vCol; varying float vDepth;
        void main(){
          vec4 t = texture2D(map, vUv);
          float f = 1.0 - exp(-fogDensity*fogDensity*vDepth*vDepth);
          ${additive
    ? 'gl_FragColor = vec4(vCol.rgb * (t.a * vCol.a * (1.0 - f*0.85)), 1.0);'
    : 'gl_FragColor = vec4(mix(vCol.rgb, fogColor, f), t.a * vCol.a * smoothstep(0.7, 5.5, vDepth));'}
        }`,
      transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.geometry = g; this.material = mat;
  }
  setFog(color, density) { this.material.uniforms.fogColor.value.copy(color); if (this.material.uniforms.fogDensity.value) this.material.uniforms.fogDensity.value = density; }
  set(i, x, y, z, size, r, g, b, a, rot = 0) {
    const p = this.pos.array, c = this.col.array;
    p[i * 4] = x; p[i * 4 + 1] = y; p[i * 4 + 2] = z; p[i * 4 + 3] = size;
    c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
    this.rot.array[i] = rot;
  }
  add(x, y, z, size, r, g, b, a = 1, rot = 0) { const i = this.count++; this.set(i, x, y, z, size, r, g, b, a, rot); return i; }
  alpha(i, a) { this.col.array[i * 4 + 3] = a; }
  commit(count = this.count) {
    this.geometry.instanceCount = count;
    this.pos.needsUpdate = true; this.col.needsUpdate = true; this.rot.needsUpdate = true;
  }
}

export const glowTexture = () => radialTexture(128, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.55)'], [0.35, 'rgba(255,255,255,0.14)'], [0.7, 'rgba(255,255,255,0.03)'], [1, 'rgba(255,255,255,0)']]);

// ------------------------------------------------------------------ fumée (sans état : fonction pure du temps)
const WHEEL_REAR_X = -1.3, WHEEL_Z = 0.8;
export class Smoke {
  constructor() {
    this.rate = 150; this.life = 3.2;
    const tex = (() => {
      const size = 128;
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d');
      // bouffée irrégulière : plusieurs lobes
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, rr = i === 0 ? 0 : 18 + 8 * hash(i);
        const x = size / 2 + Math.cos(a) * rr, y = size / 2 + Math.sin(a) * rr, r = 30 + 12 * hash(i + 9);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, size, size);
      }
      const t = new THREE.CanvasTexture(c); return t;
    })();
    this.bb = new Billboards(Math.ceil(this.rate * this.life) + 8, tex, { additive: false });
    this.mesh = this.bb.mesh; this.mesh.renderOrder = 20;
    this.st = {};
  }
  update(t) {
    const { rate, life, bb, st } = this;
    const k1 = Math.floor(t * rate), k0 = Math.max(0, Math.floor((t - life) * rate));
    let n = 0;
    for (let k = k1; k >= k0; k--) {
      const te = k / rate, age = t - te;
      if (age < 0 || age > life) continue;
      state(te, st);
      if (st.smoke < 0.12) continue;
      const h1 = hash(k), h2 = hash(k + 0.37), h3 = hash(k + 0.71), h4 = hash(k * 1.7 + 3.1);
      const side = (k & 1) ? 1 : -1;
      const w = carPoint(st, WHEEL_REAR_X - 0.25, side * WHEEL_Z);
      // vitesse initiale : une fraction de la vitesse de la voiture + éjection vers l'arrière de la caisse
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.phi), sp = Math.sin(st.phi);
      const ej = 2.5 + 3.5 * st.burn + 2.0 * h1;
      let vx = cp * st.v * 0.22 - cy * ej + (h2 - 0.5) * 2.2;
      let vz = sp * st.v * 0.22 - sy * ej + (h3 - 0.5) * 2.2;
      const drag = 1.6;
      const d = (1 - Math.exp(-age * drag)) / drag;
      // léger vent constant
      const x = w.x + vx * d + 0.35 * age, z = w.z + vz * d + 0.2 * age;
      const y = 0.25 + (0.9 + 1.3 * h4) * (1 - Math.exp(-age * 0.9)) * 1.5 + 0.1 * age;
      const size = 1.0 + 3.3 * Math.pow(age, 0.75) * (0.75 + 0.5 * h2);
      const fade = Math.pow(1 - age / life, 1.6) * smooth(0, 0.07, age);
      const a = 0.3 * st.smoke * fade * (0.7 + 0.3 * h3);
      // teinte : gris bleuté, un peu de rouge (feux arrière) quand la bouffée est jeune
      const young = Math.exp(-age * 3.0);
      const lum = 0.24 + 0.1 * h1;
      bb.set(n++, x, y, z, size, lum * 1.02 + 0.16 * young, lum * 0.98 + 0.01 * young, lum * 1.12, a, h4 * 6.28 + age * (h1 - 0.5) * 0.8);
      if (n >= bb.max) break;
    }
    bb.commit(n);
  }
}

// ------------------------------------------------------------------ traces de pneus (ruban précalculé, révélé par le temps)
export function buildTireMarks() {
  const HZ = 90, n = Math.floor(DURATION * HZ);
  const pos = [], aT = [], aA = [], idx = [];
  const st = {};
  for (const [lx, lz, gain] of [[WHEEL_REAR_X, WHEEL_Z, 1], [WHEEL_REAR_X, -WHEEL_Z, 1], [1.35, WHEEL_Z, 0.45], [1.35, -WHEEL_Z, 0.45]]) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const t = i / HZ; state(t, st);
      const c = carPoint(st, lx, lz);
      // largeur perpendiculaire au déplacement du point de contact
      const nx = -Math.sin(st.yaw), nz = Math.cos(st.yaw);
      const w = 0.15;
      pos.push(c.x - nx * w, 0.02, c.z - nz * w, c.x + nx * w, 0.02, c.z + nz * w);
      const moving = t > T_START - 0.1 ? 1 : 0;
      const a = Math.min(1, st.smoke * 1.3) * gain * moving * (0.75 + 0.25 * hash(i * 0.13 + lx));
      aT.push(t, t); aA.push(a, a);
      if (i > 0) { const k = base + i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aT; attribute float aA; varying float vT; varying float vA;
      void main(){ vT = aT; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying float vT; varying float vA;
      void main(){ if (vT > uTime) discard; gl_FragColor = vec4(0.0,0.0,0.0, vA*0.72); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 5;
  return m;
}
