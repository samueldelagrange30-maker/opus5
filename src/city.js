import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { P, ROAD_HALF, SIDEWALK } from './path.js';
import { rng, canvasTexture, radialTexture, noiseTexture } from './util.js';
import { Billboards, glowTexture } from './fx.js';

export const FOG_COLOR = new THREE.Color(0.045, 0.028, 0.07);
export const FOG_DENSITY = 0.0026;
const IX = [-3, 3], JZ = [-4, 4]; // indices des rues
const X_END = 350, Z_END = 450;
const BLD = ROAD_HALF + SIDEWALK; // distance axe de rue -> façades
const JP = '"IPAPGothic","IPAGothic",sans-serif';

const NEON = ['#ff2d95', '#19e3ff', '#ffe14a', '#ff3b30', '#3dff7a', '#ff8a1e', '#f5f5ff', '#b04bff', '#2e6bff', '#ff5ad2'];
const WORDS_V = ['ラーメン', 'カラオケ', '居酒屋', '寿司', '焼肉', 'ホテル', 'ゲーム', 'カフェ', '麻雀', 'バー', '喫茶店', '薬局', '餃子', '天ぷら', 'うどん', 'そば', '焼鳥', '名物', '大盛', '楽器', 'カメラ', '時計', '酒場', '串カツ', 'たこ焼き', '中華料理', 'ビリヤード', '漫画喫茶', '古着', '電気', '本', '酒', '湯', '質', '歯科', '英会話', '不動産', '写真', '花', '美容室'];
const WORDS_H = ['東京', '新宿', '渋谷', '営業中', '24時間', '新装開店', '大特価', 'ドリフト', '真夜中', '夜市', '銀座', '秋葉原', 'カラオケ', '中古車', 'タイヤ', 'ネオン', '最速', '峠', '首都高'];

// ------------------------------------------------------------------ lots de quads
class QuadBatch {
  constructor() { this.p = []; this.uv = []; this.idx = []; this.col = []; }
  // c : centre, r : vecteur droite (unitaire), u : vecteur haut (unitaire)
  add(c, r, u, w, h, uv = [0, 0, 1, 1], color = null) {
    const b = this.p.length / 3, hw = w / 2, hh = h / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.p.push(c[0] + r[0] * hw * sx + u[0] * hh * sy, c[1] + r[1] * hw * sx + u[1] * hh * sy, c[2] + r[2] * hw * sx + u[2] * hh * sy);
      if (color) this.col.push(color[0], color[1], color[2]);
    }
    this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

// ------------------------------------------------------------------ textures
function facadeTextures(r) {
  const styles = [];
  const N = 16, C = 64; // 16x16 cellules de 64 px
  const lit = () => {
    const k = r();
    const c = k < 0.6 ? [255, 214 + r() * 25, 160 + r() * 40] : k < 0.92 ? [214, 232, 255] : k < 0.96 ? [150, 235, 225] : [240, 160, 215];
    const i = 0.36 + 0.55 * r() * r();
    return c.map((v) => v * i);
  };
  const defs = [
    { wall: [26, 27, 34], frac: 0.3, win: [8, 18, 48, 34] },
    { wall: [32, 31, 34], frac: 0.36, win: [0, 20, 64, 30], ribbon: true },
    { wall: [20, 21, 27], frac: 0.26, win: [18, 8, 28, 50] },
    { wall: [12, 17, 26], frac: 0.22, win: [3, 3, 58, 58], glass: true },
    { wall: [36, 32, 30], frac: 0.24, win: [10, 22, 44, 30], balcony: true },
    { wall: [16, 16, 20], frac: 0.12, win: [12, 14, 40, 40] },
  ];
  const rgb = (c, k = 1) => `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`;
  for (const d of defs) {
    styles.push(canvasTexture(N * C, N * C, (g) => {
      g.fillStyle = rgb(d.wall); g.fillRect(0, 0, N * C, N * C);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},255,0.03)`; g.fillRect(r() * N * C, r() * N * C, 2 + r() * 60, 2 + r() * 5); } // salissures
      for (let fy = 0; fy < N; fy++) {
        const floorLit = r() < 0.14; // étage entièrement éclairé (bureaux)
        const floorCol = lit();
        let run = 0, runCol = null;
        for (let bx = 0; bx < N; bx++) {
          if (run <= 0) { run = r.int(1, d.ribbon ? 6 : 3); runCol = r() < (floorLit ? 0.9 : d.frac) ? (floorLit ? floorCol : lit()) : null; }
          run--;
          const [wx, wy, ww, wh] = d.win;
          const X = bx * C + wx, Y = fy * C + wy;
          if (runCol) {
            const gr = g.createLinearGradient(0, Y, 0, Y + wh);
            gr.addColorStop(0, rgb(runCol, 1.0)); gr.addColorStop(1, rgb(runCol, 0.62));
            g.fillStyle = gr; g.fillRect(X, Y, ww, wh);
            if (r() < 0.45) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(X, Y, ww, wh * (0.15 + 0.6 * r())); } // store
            if (r() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(X + r() * ww * 0.6, Y + wh * 0.5, ww * 0.3, wh * 0.5); } // mobilier
          } else {
            const v = d.glass ? [16 + r() * 10, 24 + r() * 12, 40 + r() * 18] : [7 + r() * 8, 9 + r() * 8, 15 + r() * 10];
            g.fillStyle = rgb(v); g.fillRect(X, Y, ww, wh);
            g.fillStyle = 'rgba(120,150,255,0.05)'; g.fillRect(X, Y, ww, wh * 0.4); // reflet du ciel
          }
          g.fillStyle = rgb(d.wall, 0.7);
          if (!d.ribbon) g.fillRect(X + ww / 2 - 1, Y, 2, wh); // meneau
          if (d.balcony) { g.fillStyle = rgb(d.wall, 1.25); g.fillRect(bx * C + 2, fy * C + 52, 60, 8); }
          if (d.glass) { g.strokeStyle = '#05070b'; g.lineWidth = 2; g.strokeRect(X, Y, ww, wh); }
        }
        g.fillStyle = rgb(d.wall, 1.2); g.fillRect(0, fy * C, N * C, 3); // nez de dalle
      }
    }, { repeat: true, aniso: 4 }));
  }
  return styles;
}

function drawVerticalText(g, text, x, y0, y1, w, color, glow) {
  const n = text.length;
  const size = Math.min(w * 0.82, (y1 - y0) / n * 0.92);
  g.font = `bold ${size}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const step = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    g.save(); g.translate(x, y0 + step * (i + 0.5));
    if (ch === 'ー') g.rotate(Math.PI / 2);
    if (glow) { g.shadowColor = color; g.shadowBlur = size * 0.35; }
    g.fillStyle = color; g.fillText(ch, 0, 0);
    if (glow) { g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(ch, 0, 0); }
    g.restore();
  }
}

// Atlas des enseignes verticales : 16 hautes (128x768) + 16 courtes (128x384)
function bladeAtlas(r) {
  return canvasTexture(2048, 1152, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 1152);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 16; i++) {
      const x = i * 128, y = row === 0 ? 0 : 768, h = row === 0 ? 768 : 384;
      const col = r.pick(NEON), solid = r() < 0.5;
      const pool = WORDS_V.filter((w) => (row === 0 ? w.length >= 3 : w.length <= 3));
      const word = r.pick(pool);
      if (solid) {
        g.fillStyle = col; g.fillRect(x + 4, y + 4, 120, h - 8);
        const darkText = ['#ffe14a', '#f5f5ff', '#3dff7a', '#19e3ff'].includes(col);
        drawVerticalText(g, word, x + 64, y + 24, y + h - 24, 112, darkText ? '#16090c' : '#ffffff', false);
        g.strokeStyle = darkText ? '#c22' : '#fff'; g.lineWidth = 5; g.strokeRect(x + 11, y + 11, 106, h - 22);
      } else {
        g.fillStyle = '#07070c'; g.fillRect(x + 4, y + 4, 120, h - 8);
        g.shadowColor = col; g.shadowBlur = 14; g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(x + 12, y + 12, 104, h - 24); g.shadowBlur = 0;
        drawVerticalText(g, word, x + 64, y + 30, y + h - 30, 104, r() < 0.5 ? col : r.pick(NEON), true);
      }
    }
  });
}

// Atlas des panneaux horizontaux : 4x4 cellules de 512x256
function billboardAtlas(r) {
  return canvasTexture(2048, 1024, (g) => {
    for (let k = 0; k < 16; k++) {
      const x = (k % 4) * 512, y = (k >> 2) * 256;
      const c1 = r.pick(NEON), c2 = r.pick(NEON);
      const style = k % 4;
      g.save(); g.beginPath(); g.rect(x, y, 512, 256); g.clip();
      if (style === 0) { g.fillStyle = '#0a0a10'; g.fillRect(x, y, 512, 256); } else {
        const gr = g.createLinearGradient(x, y, x + 512, y + 256); gr.addColorStop(0, c1); gr.addColorStop(1, style === 1 ? c1 : c2);
        g.fillStyle = gr; g.fillRect(x, y, 512, 256);
      }
      if (style === 3) { // rayons « soleil levant » stylisés
        g.fillStyle = 'rgba(255,255,255,0.22)';
        for (let a = 0; a < 16; a += 2) { g.beginPath(); g.moveTo(x + 256, y + 300); g.arc(x + 256, y + 300, 700, Math.PI + a * Math.PI / 16, Math.PI + (a + 1) * Math.PI / 16); g.fill(); }
      }
      const word = r.pick(WORDS_H);
      const size = Math.min(170, 440 / word.length);
      g.font = `bold ${size}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (style === 0) { g.shadowColor = c1; g.shadowBlur = 26; g.fillStyle = c1; g.fillText(word, x + 256, y + 118); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(word, x + 256, y + 118); } else {
        g.lineWidth = 12; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(word, x + 256, y + 118);
        g.fillStyle = '#fff'; g.fillText(word, x + 256, y + 118);
      }
      g.font = `bold 34px ${JP}`; g.fillStyle = style === 0 ? c2 : 'rgba(255,255,255,0.9)';
      g.fillText(r.pick(['TOKYO', 'OPEN 24H', 'NIGHT', 'SINCE 1989', 'JAPAN', 'B1F → 7F', '★ ★ ★']), x + 256, y + 218);
      g.strokeStyle = style === 0 ? c1 : 'rgba(255,255,255,0.85)'; g.lineWidth = 8; g.strokeRect(x + 10, y + 10, 492, 236);
      g.restore();
    }
  });
}

// Atlas des devantures : 8 bandes de 1024x128
function shopAtlas(r) {
  return canvasTexture(1024, 1024, (g) => {
    for (let k = 0; k < 8; k++) {
      const y = k * 128;
      g.fillStyle = '#0d0d12'; g.fillRect(0, y, 1024, 128);
      let x = 0;
      while (x < 1024) {
        const w = Math.min(1024 - x, r.pick([128, 192, 256]));
        const col = r.pick(NEON);
        // bandeau enseigne
        g.fillStyle = r() < 0.6 ? col : '#111'; g.fillRect(x + 4, y + 6, w - 8, 34);
        g.font = `bold 26px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4;
        const word = r.pick(WORDS_V.concat(WORDS_H));
        g.strokeText(word, x + w / 2, y + 24); g.fillText(word, x + w / 2, y + 24);
        // vitrine
        const open = r() < 0.72;
        const gr = g.createLinearGradient(0, y + 44, 0, y + 128);
        if (open) { const warm = r() < 0.6; gr.addColorStop(0, warm ? '#ffe9b8' : '#d8f1ff'); gr.addColorStop(1, warm ? '#c98a3a' : '#6fa7c9'); } else { gr.addColorStop(0, '#15151b'); gr.addColorStop(1, '#0b0b0f'); }
        g.fillStyle = gr; g.fillRect(x + 8, y + 46, w - 16, 78);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        for (let m = x + 8; m < x + w - 8; m += 40) g.fillRect(m, y + 46, 4, 78); // montants
        if (open) for (let s = 0; s < 4; s++) { g.fillStyle = `rgba(0,0,0,${0.25 + 0.4 * r()})`; g.fillRect(x + 12 + r() * (w - 50), y + 80 + r() * 20, 14 + r() * 26, 44); } // silhouettes / rayonnages
        if (!open) { g.strokeStyle = '#22222a'; g.lineWidth = 1; for (let s = y + 50; s < y + 124; s += 6) { g.beginPath(); g.moveTo(x + 8, s); g.lineTo(x + w - 8, s); g.stroke(); } } // rideau de fer
        x += w;
      }
    }
  });
}

// ------------------------------------------------------------------ sol réfléchissant (asphalte mouillé)
function buildGround(noise) {
  const shader = {
    name: 'WetAsphalt',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      tNoise: { value: noise }, camPos: { value: new THREE.Vector3() },
      fogColor: { value: FOG_COLOR.clone() }, fogDensity: { value: FOG_DENSITY },
    },
    vertexShader: `
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; vUv = textureMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform sampler2D tNoise; uniform vec3 camPos; uniform vec3 fogColor; uniform float fogDensity;
      varying vec4 vUv; varying vec3 vWorld;
      void main(){
        vec2 wp = vWorld.xz;
        float dist = distance(camPos, vWorld);
        float n1 = texture2D(tNoise, wp*0.021).r*0.65 + texture2D(tNoise, wp*0.083 + 0.31).g*0.35;
        float grain = texture2D(tNoise, wp*1.3).b;
        float puddle = smoothstep(0.44, 0.60, n1);
        vec3 V = normalize(camPos - vWorld);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
        float refl = mix(0.05, 0.34, puddle) + fres * mix(0.30, 0.36, puddle);
        float rough = mix(1.0, 0.12, puddle) * smoothstep(250.0, 10.0, dist);
        vec2 d = (texture2D(tNoise, wp*0.11).rg - 0.5) * 0.03 * rough + (texture2D(tNoise, wp*0.9).gb - 0.5) * 0.008 * rough;
        vec3 r = vec3(0.0);
        // flou vertical : reflets étirés caractéristiques du bitume mouillé
        float st = mix(0.022, 0.006, puddle);
        r += texture2DProj(tDiffuse, vUv + vec4(d, 0.0, 0.0) * vUv.w).rgb * 0.34;
        r += texture2DProj(tDiffuse, vUv + vec4(d + vec2(0.0,  st), 0.0, 0.0) * vUv.w).rgb * 0.2;
        r += texture2DProj(tDiffuse, vUv + vec4(d + vec2(0.0, -st), 0.0, 0.0) * vUv.w).rgb * 0.2;
        r += texture2DProj(tDiffuse, vUv + vec4(d*1.7 + vec2(0.0,  st*2.4), 0.0, 0.0) * vUv.w).rgb * 0.13;
        r += texture2DProj(tDiffuse, vUv + vec4(d*1.7 + vec2(0.0, -st*2.4), 0.0, 0.0) * vUv.w).rgb * 0.13;
        vec3 base = vec3(0.016, 0.017, 0.022) * (0.55 + 0.9*grain) * mix(1.0, 0.45, puddle);
        vec3 col = base + r * min(refl, 0.7);
        float f = 1.0 - exp(-fogDensity*fogDensity*dist*dist);
        col = mix(col, fogColor, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
  const geo = new THREE.PlaneGeometry(2400, 2400);
  const ground = new Reflector(geo, { textureWidth: 405, textureHeight: 720, clipBias: 0.003, shader, multisample: 0 });
  ground.rotation.x = -Math.PI / 2;
  ground.material.uniforms.tNoise.value = noise;
  return ground;
}

// ------------------------------------------------------------------ ville
export function buildCity(scene) {
  const r = rng(20261111);
  const noise = noiseTexture(256, 5);
  const city = { blinkers: [], screens: [], mainOnly: [] };

  // --- ciel
  {
    const g = new THREE.SphereGeometry(1800, 32, 16);
    const col = [];
    const pos = g.attributes.position;
    const zen = new THREE.Color(0.004, 0.006, 0.02), hor = new THREE.Color(0.11, 0.045, 0.12), mid = new THREE.Color(0.03, 0.02, 0.07);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 1800);
      if (h < 0.18) c.copy(hor).lerp(mid, h / 0.18); else c.copy(mid).lerp(zen, Math.min(1, (h - 0.18) / 0.5));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    scene.add(sky);
  }

  // --- sol
  const ground = buildGround(noise);
  scene.add(ground);
  city.ground = ground;
  const groundSimple = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: 0x05060a }));
  groundSimple.rotation.x = -Math.PI / 2; groundSimple.visible = false; scene.add(groundSimple);
  city.groundSimple = groundSimple;

  // --- marquages au sol
  const marks = new QuadBatch();
  const X = [1, 0, 0], Z = [0, 0, 1];
  const Y_MARK = 0.012;
  const nodesX = []; for (let i = IX[0]; i <= IX[1]; i++) nodesX.push(i * P);
  const nodesZ = []; for (let j = JZ[0]; j <= JZ[1]; j++) nodesZ.push(j * P);
  const nearNode = (v, nodes, d) => nodes.some((n) => Math.abs(v - n) < d);
  const WHITE = [0.6, 0.6, 0.62], ORANGE = [0.5, 0.3, 0.05];
  // rues orientées selon z (x = cste) et selon x (z = cste) : un quad par tronçon entre deux carrefours
  const spans = (nodes, end) => { const out = []; let a = -end; for (const n of nodes) { out.push([a, n - 15]); a = n + 15; } out.push([a, end]); return out; };
  for (const x of nodesX) for (const [a, b] of spans(nodesZ, Z_END)) {
    const c = (a + b) / 2, L = b - a;
    for (const o of [-0.18, 0.18]) marks.add([x + o, Y_MARK, c], X, Z, 0.13, L, undefined, ORANGE);
    for (const o of [-9.4, 9.4]) marks.add([x + o, Y_MARK, c], X, Z, 0.15, L, undefined, WHITE);
    for (let z = a + 2; z + 5 < b; z += 10) for (const o of [-4.8, 4.8]) marks.add([x + o, Y_MARK, z + 2.5], X, Z, 0.14, 5, undefined, WHITE);
  }
  for (const z of nodesZ) for (const [a, b] of spans(nodesX, X_END)) {
    const c = (a + b) / 2, L = b - a;
    for (const o of [-0.18, 0.18]) marks.add([c, Y_MARK, z + o], X, Z, L, 0.13, undefined, ORANGE);
    for (const o of [-9.4, 9.4]) marks.add([c, Y_MARK, z + o], X, Z, L, 0.15, undefined, WHITE);
    for (let x = a + 2; x + 5 < b; x += 10) for (const o of [-4.8, 4.8]) marks.add([x + 2.5, Y_MARK, z + o], X, Z, 5, 0.14, undefined, WHITE);
  }
  // passages piétons + lignes d'arrêt
  const ZEBRA = [0.62, 0.62, 0.64];
  for (const x of nodesX) for (const z of nodesZ) {
    for (const s of [-1, 1]) {
      for (let k = -9; k < 9; k += 0.9) {
        marks.add([x + k + 0.45, Y_MARK, z + s * 12.4], X, Z, 0.45, 3.4, undefined, ZEBRA);
        marks.add([x + s * 12.4, Y_MARK, z + k + 0.45], X, Z, 3.4, 0.45, undefined, ZEBRA);
      }
      marks.add([x + s * 4.8 * 1, Y_MARK, z - s * 15.1], X, Z, 9.2, 0.4, undefined, WHITE);
      marks.add([x + s * 15.1, Y_MARK, z + s * 4.8], X, Z, 0.4, 9.2, undefined, WHITE);
    }
  }
  // « scramble » : passages en diagonale au carrefour central
  {
    const d1 = [Math.SQRT1_2, 0, Math.SQRT1_2], d2 = [-Math.SQRT1_2, 0, Math.SQRT1_2];
    for (let k = -11.5; k <= 11.5; k += 0.95) {
      marks.add([d1[0] * k, Y_MARK, d1[2] * k], d1, d2, 0.48, 3.6, undefined, ZEBRA);
      if (Math.abs(k) > 2.4) marks.add([d2[0] * k, Y_MARK, d2[2] * k], d2, d1, 0.48, 3.6, undefined, ZEBRA);
    }
  }
  {
    const m = new THREE.Mesh(marks.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.renderOrder = 2; scene.add(m); city.mainOnly.push(m);
  }

  // --- trottoirs
  {
    const tex = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#2a2b31'; g.fillRect(0, 0, 256, 256);
      const rr = rng(3);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 36 + rr() * 14; g.fillStyle = `rgb(${v | 0},${v | 0},${v + 5 | 0})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); }
    }, { repeat: true });
    const geos = [];
    for (let i = IX[0] - 1; i <= IX[1]; i++) for (let j = JZ[0] - 1; j <= JZ[1]; j++) {
      const x0 = i * P + ROAD_HALF, x1 = (i + 1) * P - ROAD_HALF, z0 = j * P + ROAD_HALF, z1 = (j + 1) * P - ROAD_HALF, rad = 3.5;
      const s = new THREE.Shape();
      s.moveTo(x0 + rad, z0); s.lineTo(x1 - rad, z0); s.quadraticCurveTo(x1, z0, x1, z0 + rad); s.lineTo(x1, z1 - rad); s.quadraticCurveTo(x1, z1, x1 - rad, z1);
      s.lineTo(x0 + rad, z1); s.quadraticCurveTo(x0, z1, x0, z1 - rad); s.lineTo(x0, z0 + rad); s.quadraticCurveTo(x0, z0, x0 + rad, z0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false, curveSegments: 4 });
      g.rotateX(Math.PI / 2); g.translate(0, 0.16, 0);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.25, uv.getY(k) * 0.25);
      geos.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: tex, color: 0x9a9aa8 }));
    scene.add(m); city.mainOnly.push(m);
  }

  // --- immeubles
  const styles = facadeTextures(r);
  const boxes = styles.map(() => []);
  const roofBoxes = [];
  const blades = new QuadBatch(), boards = new QuadBatch(), shops = new QuadBatch(), frames = [];
  const glows = new Billboards(3000, glowTexture(), { additive: true });
  city.glows = glows;
  const BAY = 1.8, FLOOR = 3.3, CELLS = 16;

  function addBuilding(x0, z0, x1, z1, h, fronts, big = false) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const style = r.int(0, styles.length - 1);
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, h / 2, cz);
    const uv = g.attributes.uv;
    const ou = r.int(0, CELLS - 1) / CELLS, ov = r.int(0, CELLS - 1) / CELLS;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.001, 0.9995); continue; }
      const width = f < 2 ? d : w;
      uv.setXY(i, ou + uv.getX(i) * Math.max(1, Math.round(width / BAY)) / CELLS, ov + uv.getY(i) * Math.max(1, Math.round(h / FLOOR)) / CELLS);
    }
    boxes[style].push(g);
    // toiture technique
    const nb = r.int(0, 2);
    for (let k = 0; k < nb; k++) {
      const bw = r.range(2, w * 0.4), bd = r.range(2, d * 0.4), bh = r.range(1.2, 3.5);
      const b = new THREE.BoxGeometry(bw, bh, bd); b.translate(cx + r.range(-0.25, 0.25) * w, h + bh / 2, cz + r.range(-0.25, 0.25) * d); roofBoxes.push(b);
    }
    if (h > 62) for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
      const id = glows.add(cx + sx * w * 0.46, h + 0.6, cz + sz * d * 0.46, 5, 1.0, 0.08, 0.05, 1);
      city.blinkers.push({ id, phase: r() * 6.28, rate: 1.6 + r() * 0.5 });
    }
    // habillage des façades sur rue
    for (const f of fronts) {
      // f : 0:-x 1:+x 2:-z 3:+z
      const alongX = f >= 2, sgn = (f % 2) ? 1 : -1;
      const len = alongX ? w : d;
      const nrm = alongX ? [0, 0, sgn] : [sgn, 0, 0];
      const tan = alongX ? [sgn, 0, 0] : [0, 0, -sgn]; // droite du quad vu depuis la rue
      const face = alongX ? [cx, 0, sgn > 0 ? z1 : z0] : [sgn > 0 ? x1 : x0, 0, cz];
      const at = (u, y, off) => [face[0] + tan[0] * u + nrm[0] * off, y, face[2] + tan[2] * u + nrm[2] * off];
      // devanture
      const k = r.int(0, 7), u0 = r() * 0.5, span = Math.min(0.5, len / 60);
      shops.add(at(0, 0.16 + 2.1, 0.06), tan, [0, 1, 0], len - 0.3, 4.2, [u0, 1 - (k + 1) / 8, u0 + span, 1 - k / 8]);
      // enseignes en drapeau
      const nBl = Math.min(3, Math.floor(len / 6.5 * r.range(0.4, 1.3)));
      for (let b = 0; b < nBl; b++) {
        const tall = r() < 0.6 && h > 22;
        const sw = r.range(1.25, 1.9), sh = sw * (tall ? 6 : 3);
        const yb = r.range(5.2, Math.max(5.3, Math.min(h - sh - 1, 13)));
        if (yb + sh > h + 3) continue;
        const u = (len * (b + 0.5)) / nBl - len / 2 + r.range(-1, 1);
        const idx = r.int(0, 15);
        const uvr = tall ? [idx / 16, 1 - 768 / 1152, (idx + 1) / 16, 1] : [idx / 16, 0, (idx + 1) / 16, 384 / 1152];
        const c = at(u, yb + sh / 2, 0.35 + sw / 2);
        blades.add(c, nrm, [0, 1, 0], sw, sh, uvr);
        blades.add(c, [-nrm[0], 0, -nrm[2]], [0, 1, 0], sw, sh, uvr);
        const fb = new THREE.BoxGeometry(alongX ? 0.14 : sw + 0.5, 0.1, alongX ? sw + 0.5 : 0.14);
        fb.translate(c[0], yb + sh * 0.85, c[2]); frames.push(fb);
      }
      // grand panneau en façade ou sur le toit
      if (r() < (big ? 1 : 0.42) && len > 11) {
        const bw = Math.min(len - 1.5, r.range(9, 15) * (big ? 1.35 : 1)), bh = bw / 2;
        const idx = r.int(0, 15), uvr = [(idx % 4) / 4, 1 - ((idx >> 2) + 1) / 4, (idx % 4 + 1) / 4, 1 - (idx >> 2) / 4];
        const roof = r() < 0.45 && h < 60 && !big;
        const y = roof ? h + bh / 2 + 1.2 : r.range(14, Math.max(15, Math.min(h - bh / 2 - 1, big ? 26 : 34)));
        if (y + bh / 2 < h + (roof ? 99 : 0.5)) boards.add(at(0, y, roof ? -0.6 : 0.25), tan, [0, 1, 0], bw, bh, uvr);
      }
    }
  }

  const heightOf = (big) => { const k = r(); return big ? r.range(55, 85) : k < 0.55 ? r.range(18, 42) : k < 0.88 ? r.range(42, 78) : r.range(85, 135); };
  for (let i = IX[0] - 1; i <= IX[1]; i++) for (let j = JZ[0] - 1; j <= JZ[1]; j++) {
    const bx = i * P + BLD, bz = j * P + BLD, S = (P - 2 * BLD) / 3;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      if (a === 1 && b === 1) { // cœur d'îlot : parfois une tour
        if (r() < 0.45) addBuilding(bx + S + 2, bz + S + 2, bx + 2 * S - 2, bz + 2 * S - 2, r.range(70, 150), []);
        continue;
      }
      const fronts = [];
      if (a === 0) fronts.push(0); if (a === 2) fronts.push(1); if (b === 0) fronts.push(2); if (b === 2) fronts.push(3);
      const x0 = bx + a * S, z0 = bz + b * S;
      // les quatre angles du carrefour central (0,0) : grands immeubles à écrans
      const cornerX = a === 0 ? i * P : a === 2 ? (i + 1) * P : null, cornerZ = b === 0 ? j * P : b === 2 ? (j + 1) * P : null;
      const big = cornerX === 0 && cornerZ === 0;
      const edge = (a === 1) !== (b === 1);
      if (edge && r() < 0.55) { // deux immeubles étroits (« pencil buildings »)
        const split = r.range(0.38, 0.62);
        if (a === 1) {
          addBuilding(x0 + 0.3, z0 + (b === 0 ? r.range(0, 1.5) : 3), x0 + S * split - 0.3, z0 + S - (b === 2 ? r.range(0, 1.5) : 3), heightOf(false), fronts);
          addBuilding(x0 + S * split + 0.3, z0 + (b === 0 ? r.range(0, 1.5) : 3), x0 + S - 0.3, z0 + S - (b === 2 ? r.range(0, 1.5) : 3), heightOf(false), fronts);
        } else {
          addBuilding(x0 + (a === 0 ? r.range(0, 1.5) : 3), z0 + 0.3, x0 + S - (a === 2 ? r.range(0, 1.5) : 3), z0 + S * split - 0.3, heightOf(false), fronts);
          addBuilding(x0 + (a === 0 ? r.range(0, 1.5) : 3), z0 + S * split + 0.3, x0 + S - (a === 2 ? r.range(0, 1.5) : 3), z0 + S - 0.3, heightOf(false), fronts);
        }
      } else {
        const g = 0.3;
        addBuilding(x0 + (a === 0 ? 0 : g), z0 + (b === 0 ? 0 : g), x0 + S - (a === 2 ? 0 : g), z0 + S - (b === 2 ? 0 : g), heightOf(big), fronts, big);
      }
    }
  }
  // bouchons en bout de rue (sauf vers la tour)
  for (const x of nodesX) for (const s of [-1, 1]) { if (x === 0 && s === 1) continue; addBuilding(x - 22, s * (Z_END + 40) - 15, x + 22, s * (Z_END + 40) + 15, r.range(60, 140), []); }
  for (const z of nodesZ) for (const s of [-1, 1]) addBuilding(s * (X_END + 40) - 15, z - 22, s * (X_END + 40) + 15, z + 22, r.range(60, 140), []);

  styles.forEach((tex, k) => {
    if (!boxes[k].length) return;
    scene.add(new THREE.Mesh(mergeGeometries(boxes[k]), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.9, 0.9, 0.95) })));
  });
  scene.add(new THREE.Mesh(mergeGeometries(roofBoxes.concat(frames)), new THREE.MeshBasicMaterial({ color: 0x0b0b10 })));
  const signMat = (map, gain) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(gain, gain, gain) });
  scene.add(new THREE.Mesh(blades.geometry(), signMat(bladeAtlas(r), 1.2)));
  scene.add(new THREE.Mesh(boards.geometry(), signMat(billboardAtlas(r), 1.0)));
  scene.add(new THREE.Mesh(shops.geometry(), signMat(shopAtlas(r), 0.9)));

  // --- écrans géants animés autour du carrefour central
  {
    const mk = (words, c1, c2) => canvasTexture(1024, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, c1); gr.addColorStop(0.5, c2); gr.addColorStop(1, c1);
      g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
      g.font = `bold 150px ${JP}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      words.forEach((w, i) => { g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(w, 256 + i * 512, 128); g.fillStyle = '#fff'; g.fillText(w, 256 + i * 512, 128); });
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 1024, 2);
    }, { repeat: true });
    const defs = [
      { pos: [BLD + 12, 30, BLD - 0.4], rotY: Math.PI, tex: mk(['東京', 'ドリフト'], '#ff2d95', '#7a2bff'), speed: 0.11 },
      { pos: [-BLD + 0.4, 28, BLD + 12], rotY: Math.PI / 2, tex: mk(['真夜中', 'ネオン'], '#00c2ff', '#1b3bff'), speed: -0.09 },
      { pos: [BLD - 0.4, 32, -BLD - 12], rotY: -Math.PI / 2, tex: mk(['最速', '首都高'], '#ff8a1e', '#ff2d2d'), speed: 0.13 },
      { pos: [-BLD - 12, 29, -BLD + 0.4], rotY: 0, tex: mk(['渋谷', '新宿'], '#19e3a0', '#0a7bff'), speed: -0.1 },
    ];
    for (const d of defs) {
      d.tex.repeat.set(0.5, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshBasicMaterial({ map: d.tex, color: new THREE.Color(1.0, 1.0, 1.0) }));
      m.position.set(...d.pos); m.rotation.y = d.rotY; scene.add(m);
      city.screens.push({ mesh: m, tex: d.tex, speed: d.speed });
    }
  }

  // --- lampadaires, feux, glissières
  {
    const lamps = [];
    for (const x of nodesX) for (let z = -Z_END + 12; z < Z_END; z += 25) { if (nearNode(z, nodesZ, 17)) continue; lamps.push([x - 10.9, z, 1, 0]); lamps.push([x + 10.9, z + 12.5, -1, 0]); }
    for (const z of nodesZ) for (let x = -X_END + 12; x < X_END; x += 25) { if (nearNode(x, nodesX, 17)) continue; lamps.push([x, z - 10.9, 0, 1]); lamps.push([x + 12.5, z + 10.9, 0, -1]); }
    const poleG = new THREE.CylinderGeometry(0.07, 0.11, 8.2, 6); poleG.translate(0, 4.1, 0);
    const armG = new THREE.BoxGeometry(2.4, 0.1, 0.12); armG.translate(1.1, 8.2, 0);
    const pole = new THREE.InstancedMesh(mergeGeometries([poleG, armG]), new THREE.MeshBasicMaterial({ color: 0x24252c }), lamps.length);
    const headG = new THREE.BoxGeometry(0.95, 0.1, 0.34); headG.translate(2.0, 8.12, 0);
    const head = new THREE.InstancedMesh(headG, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7) }), lamps.length);
    const pools = new QuadBatch();
    const m4 = new THREE.Matrix4();
    lamps.forEach(([x, z, dx, dz], k) => {
      m4.makeRotationY(Math.atan2(-dz, dx)); m4.setPosition(x, 0, z);
      pole.setMatrixAt(k, m4); head.setMatrixAt(k, m4);
      const hx = x + dx * 2.0, hz = z + dz * 2.0;
      glows.add(hx, 8.05, hz, 4.5, 1.0, 0.88, 0.7, 0.5);
      pools.add([hx + dx * 2.0, 0.03, hz + dz * 2.0], X, Z, 21, 21);
    });
    scene.add(pole, head); city.mainOnly.push(pole);
    const poolTex = radialTexture(128, [[0, 'rgba(255,236,205,0.30)'], [0.3, 'rgba(255,230,195,0.15)'], [0.7, 'rgba(255,225,190,0.04)'], [1, 'rgba(255,220,180,0)']]);
    const pm = new THREE.Mesh(pools.geometry(), new THREE.MeshBasicMaterial({ map: poolTex, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.3, 0.3, 0.3) }));
    pm.renderOrder = 3; scene.add(pm); city.mainOnly.push(pm);

    // feux tricolores (potence au-dessus de la chaussée, modèle horizontal japonais)
    const sig = [];
    for (const x of nodesX) for (const z of nodesZ) {
      if (Math.abs(x) > 250 || Math.abs(z) > 350) continue;
      sig.push([x + 11, z + 11, -1, 0, 0], [x - 11, z - 11, 1, 0, 0], [x - 11, z + 11, 0, -1, 1], [x + 11, z - 11, 0, 1, 1]);
    }
    const sPoleG = new THREE.CylinderGeometry(0.1, 0.13, 6.4, 6); sPoleG.translate(0, 3.2, 0);
    const sArmG = new THREE.BoxGeometry(6.4, 0.12, 0.12); sArmG.translate(3.2, 6.1, 0);
    const sBoxG = new THREE.BoxGeometry(1.5, 0.5, 0.3); sBoxG.translate(5.6, 5.75, 0);
    const sp = new THREE.InstancedMesh(mergeGeometries([sPoleG, sArmG, sBoxG]), new THREE.MeshBasicMaterial({ color: 0x1b1c22 }), sig.length);
    sig.forEach(([x, z, dx, dz, axis], k) => {
      m4.makeRotationY(Math.atan2(-dz, dx)); m4.setPosition(x, 0, z); sp.setMatrixAt(k, m4);
      const gx = x + dx * 5.6, gz = z + dz * 5.6;
      const green = axis === 0;
      const off = green ? -0.45 : 0.45;
      glows.add(gx + dx * off, 5.75, gz + dz * off, 2.2, green ? 0.1 : 1, green ? 1 : 0.1, green ? 0.75 : 0.08, 0.8);
    });
    scene.add(sp); city.mainOnly.push(sp);

    // glissières blanches le long des trottoirs
    const railTex = canvasTexture(128, 64, (g) => {
      g.clearRect(0, 0, 128, 64); g.fillStyle = '#d8dade';
      g.fillRect(0, 4, 128, 7); g.fillRect(0, 30, 128, 5); g.fillRect(58, 0, 12, 64);
      for (let x = 10; x < 128; x += 16) if (Math.abs(x - 64) > 10) g.fillRect(x, 8, 3, 24);
    }, { repeat: true });
    const rails = new QuadBatch();
    for (const x of nodesX) for (const z of nodesZ) for (const s of [-1, 1]) {
      if (z + P <= Z_END + 60 && z < nodesZ[nodesZ.length - 1]) rails.add([x + s * 10.35, 0.16 + 0.45, z + P / 2], Z, [0, 1, 0], P - 34, 0.9, [0, 0, (P - 34) / 2, 1]);
      if (x < nodesX[nodesX.length - 1]) rails.add([x + P / 2, 0.16 + 0.45, z + s * 10.35], X, [0, 1, 0], P - 34, 0.9, [0, 0, (P - 34) / 2, 1]);
    }
    const railMesh = new THREE.Mesh(rails.geometry(), new THREE.MeshBasicMaterial({ map: railTex, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x8a8c94 }));
    scene.add(railMesh); city.mainOnly.push(railMesh);
  }

  // --- tour treillis rouge et blanche à l'horizon
  {
    const tx = 0, tz = 545;
    const lat = canvasTexture(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256); g.strokeStyle = '#fff'; g.lineWidth = 13; g.lineCap = 'square';
      g.strokeRect(6, 6, 244, 244);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 256); g.moveTo(256, 0); g.lineTo(0, 256); g.stroke();
      g.lineWidth = 7; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    }, { repeat: true });
    const lev = [[0, 50], [28, 33], [58, 22], [92, 15.5], [126, 11.5], [140, 9.5], [172, 7], [206, 5], [240, 3.6], [250, 3.2]];
    const p = [], uv = [], col = [], idx = [];
    const orange = [1.5, 0.36, 0.06], white = [1.25, 1.1, 0.95];
    for (let k = 0; k < lev.length - 1; k++) {
      const [y0, w0] = lev[k], [y1, w1] = lev[k + 1];
      const rep = Math.max(1, Math.round((y1 - y0) / (w0 + w1)));
      const c = (k % 2 === 0) ? orange : white;
      for (let s = 0; s < 4; s++) {
        const a0 = s * Math.PI / 2 + Math.PI / 4, a1 = a0 + Math.PI / 2, R2 = Math.SQRT2;
        const b = p.length / 3;
        p.push(tx + Math.cos(a0) * w0 * R2, y0, tz + Math.sin(a0) * w0 * R2, tx + Math.cos(a1) * w0 * R2, y0, tz + Math.sin(a1) * w0 * R2,
          tx + Math.cos(a1) * w1 * R2, y1, tz + Math.sin(a1) * w1 * R2, tx + Math.cos(a0) * w1 * R2, y1, tz + Math.sin(a0) * w1 * R2);
        const ur = Math.max(1, Math.round(w0 / 12));
        uv.push(0, 0, ur, 0, ur, rep * ur, 0, rep * ur);
        for (let q = 0; q < 4; q++) col.push(...c);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const tower = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: lat, vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide, fog: false }));
    scene.add(tower);
    const deckMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.25, 0.95), fog: false });
    const d1 = new THREE.Mesh(new THREE.BoxGeometry(27, 11, 27), deckMat); d1.position.set(tx, 133, tz);
    const d2 = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 9), deckMat); d2.position.set(tx, 248, tz);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.6, 82, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.5, 0.15), fog: false })); ant.position.set(tx, 292, tz);
    scene.add(d1, d2, ant);
    const tg = new Billboards(16, glowTexture(), { additive: true, fog: false });
    tg.add(tx, 120, tz - 20, 420, 1.0, 0.42, 0.12, 0.1); tg.add(tx, 40, tz - 40, 260, 1.0, 0.45, 0.14, 0.09); tg.add(tx, 240, tz - 10, 180, 1.0, 0.5, 0.2, 0.08);
    city.towerTop = tg.add(tx, 334, tz, 26, 1, 0.1, 0.06, 1);
    tg.commit(); tg.mesh.renderOrder = 8; scene.add(tg.mesh);
    city.towerGlows = tg;
  }

  glows.setFog(FOG_COLOR, FOG_DENSITY);
  glows.mesh.renderOrder = 9;
  scene.add(glows.mesh);
  city.staticGlowCount = glows.count;

  city.update = (t, camera) => {
    ground.material.uniforms.camPos.value.copy(camera.position);
    for (const b of city.blinkers) glows.alpha(b.id, 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * b.rate + b.phase)), 6));
    city.towerGlows.alpha(city.towerTop, 0.2 + 0.8 * Math.pow(Math.max(0, Math.sin(t * 2.2)), 8)); city.towerGlows.commit();
    for (const s of city.screens) s.tex.offset.x = (t * s.speed) % 1;
  };
  return city;
}
