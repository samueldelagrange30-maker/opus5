/* =====================================================================
 * Convoy3D — Construction des maillages 3D (Three.js)
 *
 * Scène en MÈTRES, axe Z vers le haut. Chaque élément produit un
 * THREE.Group en coordonnées locales (origine = point d'entrée de la
 * trajectoire, Z = 0 au niveau de la surface de convoyage).
 * Les composants sont étiquetés par calque (userData.layer) pour
 * pouvoir afficher / masquer : rollers, guides, structure, arrows.
 * ===================================================================== */
(function (C) {
  'use strict';
  const M = 0.001; // mm -> m

  /* ------------------------- matériaux partagés ------------------------- */
  const matCache = new Map();
  function mat(key, opts) {
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6, metalness: 0.2 }, opts));
    matCache.set(key, m);
    return m;
  }
  const texCache = new Map();
  /** Texture procédurale (canvas) : lignes transversales (tapis, chaîne, bande). */
  function stripeTex(kind) {
    if (texCache.has(kind)) return texCache.get(kind);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    if (kind === 'mat') {
      g.fillStyle = '#3c4650'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#2a3138'; g.fillRect(0, 0, 6, 64);
      g.fillStyle = '#56616c'; for (let i = 0; i < 4; i++) g.fillRect(14, 4 + i * 16, 40, 8);
    } else if (kind === 'chain') {
      g.fillStyle = '#5b6168'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#9aa2aa'; g.fillRect(4, 10, 56, 44);
      g.fillStyle = '#3d4248'; g.beginPath(); g.arc(16, 32, 7, 0, 7); g.arc(48, 32, 7, 0, 7); g.fill();
    } else if (kind === 'belt') {
      g.fillStyle = '#23292e'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? '#1b2024' : '#2b3237'; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    } else if (kind === 'grating') {
      g.fillStyle = '#8d98a4'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#3f4954';
      for (let i = 0; i < 64; i += 8) { g.fillRect(i + 2, 0, 4, 64); }
      for (let j = 0; j < 64; j += 32) g.fillRect(0, j, 64, 3);
    } else if (kind === 'cladding') {
      g.fillStyle = '#e9edf1'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#b8c0c9'; g.fillRect(0, 0, 6, 64); g.fillRect(32, 0, 6, 64);
      g.fillStyle = '#f7f9fb'; g.fillRect(8, 0, 3, 64); g.fillRect(40, 0, 3, 64);
    } else if (kind === 'concrete') {
      g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 160; i++) { g.fillStyle = Math.random() < 0.5 ? '#8f959b' : '#a7adb3'; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    } else if (kind === 'hazard') {
      g.fillStyle = '#f1c40f'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#222'; for (let i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 75, 64); g.lineTo(i + 64, 64); g.fill(); }
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(kind, t);
    return t;
  }
  const MAT = {
    frame: c => mat('frame' + c, { color: c, metalness: 0.35, roughness: 0.5 }),
    roller: () => mat('roller', { color: 0xc9ced6, metalness: 0.75, roughness: 0.3 }),
    freeRoller: () => mat('froller', { color: 0xe8ebef, metalness: 0.4, roughness: 0.35 }),
    belt: () => mat('belt', { map: stripeTex('belt'), color: 0xffffff, roughness: 0.95, metalness: 0 }),
    mat: () => mat('mat', { map: stripeTex('mat'), color: 0xffffff, roughness: 0.8, metalness: 0.05 }),
    chain: () => mat('chain', { map: stripeTex('chain'), color: 0xffffff, roughness: 0.4, metalness: 0.7 }),
    leg: () => mat('leg', { color: 0x76838f, metalness: 0.5, roughness: 0.5 }),
    guide: () => mat('guide', { color: 0xd5dbe1, metalness: 0.8, roughness: 0.25 }),
    motor: () => mat('motor', { color: 0x30455c, metalness: 0.4, roughness: 0.5 }),
    dark: () => mat('dark', { color: 0x2a2f35, metalness: 0.3, roughness: 0.7 }),
    plate: () => mat('plate', { color: 0x9aa4ae, metalness: 0.6, roughness: 0.4 }),
    hazard: () => mat('hazard', { map: stripeTex('hazard'), color: 0xffffff, roughness: 0.7 }),
    arrow: () => mat('arrow', { color: 0x00e5ff, emissive: 0x00a5c0, emissiveIntensity: 0.6, roughness: 0.5, transparent: true, opacity: 0.85 }),
    color: c => mat('col' + c, { color: c, roughness: 0.55, metalness: 0.15 }),
    glow: c => mat('glow' + c, { color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.4 }),
    wood: () => mat('wood', { color: 0xb08a5a, roughness: 0.85, metalness: 0 })
  };
  C.MAT = MAT;
  C.stripeTex = stripeTex;

  /* ----------------------- repères le long d'un chemin ------------------- */
  /** Échantillons avec repère local : p (m), t, n (normale gauche), u (haut). */
  function frames(path, maxAngle, maxLen) {
    const sm = path.sample(maxAngle || 4, maxLen || 0);
    let prevN = [0, 1, 0];
    return sm.map(o => {
      const t = o.t;
      let n = [-t[1], t[0], 0];
      const ln = Math.hypot(n[0], n[1]);
      if (ln < 1e-3) n = prevN; else n = [n[0] / ln, n[1] / ln, 0];
      prevN = n;
      const u = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
      return { s: o.s, p: [o.p[0] * M, o.p[1] * M, o.p[2] * M], t, n, u, vertical: o.vertical };
    });
  }

  /**
   * Balayage d'une section rectangulaire [y0,y1]×[z0,z1] (mm, repère n/u)
   * le long des échantillons → géométrie fermée.
   */
  function sweep(fr, y0, y1, z0, z1, uvScale) {
    const pos = [], uv = [];
    const corner = (f, y, z) => [f.p[0] + (f.n[0] * y + f.u[0] * z) * M, f.p[1] + (f.n[1] * y + f.u[1] * z) * M, f.p[2] + (f.n[2] * y + f.u[2] * z) * M];
    const cs = [[y0, z0], [y1, z0], [y1, z1], [y0, z1]];
    const us = uvScale || 1;
    for (let i = 0; i < fr.length - 1; i++) {
      const a = fr[i], b = fr[i + 1];
      for (let k = 0; k < 4; k++) {
        const P = cs[k], Q = cs[(k + 1) % 4];
        const Pi = corner(a, P[0], P[1]), Qi = corner(a, Q[0], Q[1]), Qj = corner(b, Q[0], Q[1]), Pj = corner(b, P[0], P[1]);
        pos.push(...Pi, ...Qi, ...Qj, ...Pi, ...Qj, ...Pj);
        const ua = a.s * M * us, ub = b.s * M * us;
        uv.push(ua, 0, ua, 1, ub, 1, ua, 0, ub, 1, ub, 0);
      }
    }
    // bouchons
    const cap = (f, end) => {
      const A = corner(f, y0, z0), B = corner(f, y1, z0), Cc = corner(f, y1, z1), Dd = corner(f, y0, z1);
      if (end) pos.push(...A, ...B, ...Cc, ...A, ...Cc, ...Dd); else pos.push(...A, ...Cc, ...B, ...A, ...Dd, ...Cc);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    };
    if (fr.length > 1) { cap(fr[0], false); cap(fr[fr.length - 1], true); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  function tag(obj, layer) { obj.userData.layer = layer; return obj; }
  function meshOf(geo, material, layer, shadow = true) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow; m.receiveShadow = true;
    return tag(m, layer);
  }
  /** Boîte centrée en (x,y,z) mm, dimensions mm. */
  function box(lx, ly, lz, x, y, z, material, layer) {
    const m = meshOf(new THREE.BoxGeometry(lx * M, ly * M, lz * M), material, layer);
    m.position.set(x * M, y * M, z * M);
    return m;
  }
  function cyl(r, h, material, layer, seg) {
    return meshOf(new THREE.CylinderGeometry(r * M, r * M, h * M, seg || 20), material, layer);
  }

  /** Point local d'un chemin à l'abscisse s → {p(mm), t, n, u} */
  function localFrame(path, s) {
    const r = path.at(s);
    let n = [-r.t[1], r.t[0], 0];
    const l = Math.hypot(n[0], n[1]) || 1; n = [n[0] / l, n[1] / l, 0];
    const t = r.t;
    const u = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    return { p: r.p, t, n, u };
  }
  const _m4 = new THREE.Matrix4(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3();
  /** Matrice d'instance alignée sur un repère (x=t, y=n, z=u) au point p(mm) + décalages. */
  function frameMatrix(f, dy, dz, scaleY) {
    _vx.set(f.t[0], f.t[1], f.t[2]); _vy.set(f.n[0], f.n[1], f.n[2]); _vz.set(f.u[0], f.u[1], f.u[2]);
    _m4.makeBasis(_vx, _vy, _vz);
    if (scaleY && scaleY !== 1) _m4.scale(new THREE.Vector3(1, scaleY, 1));
    _m4.setPosition((f.p[0] + f.n[0] * dy + f.u[0] * dz) * M, (f.p[1] + f.n[1] * dy + f.u[1] * dz) * M, (f.p[2] + f.n[2] * dy + f.u[2] * dz) * M);
    return _m4;
  }

  /* --------------------------- composants communs ------------------------ */
  /** Rouleaux le long d'un chemin (instanciés). Coniques en virage. */
  function addRollers(g, path, p, opts) {
    opts = opts || {};
    const L = path.length;
    const pitch = Math.max(15, p.rollerPitch || 100);
    const n = Math.max(1, Math.floor(L / pitch));
    const d = p.rollerDiam || 50;
    const Wu = opts.width || p.usefulWidth;
    let geo;
    const curve = opts.radius ? opts : null;
    if (curve) {
      const sgn = curve.left ? 1 : -1, R = curve.radius;
      const rTop = d / 2 * Math.max(0.3, (R - sgn * Wu / 2) / R), rBot = d / 2 * Math.max(0.3, (R + sgn * Wu / 2) / R);
      geo = new THREE.CylinderGeometry(rTop * M, rBot * M, Wu * M, 14);
    } else geo = new THREE.CylinderGeometry(d / 2 * M, d / 2 * M, Wu * M, 14);
    const im = new THREE.InstancedMesh(geo, opts.free ? MAT.freeRoller() : MAT.roller(), n);
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * L / n;
      const f = localFrame(path, s);
      im.setMatrixAt(i, frameMatrix(f, 0, -d / 2));
    }
    im.castShadow = true; im.receiveShadow = true;
    tag(im, 'rollers');
    g.add(im);
    // axes / arbres (pour les rouleaux libres : roulettes plus claires)
    return im;
  }

  /** Longerons latéraux. */
  function addFrames(g, fr, p, opts) {
    opts = opts || {};
    const W = opts.width || p.width, Wu = opts.useful || p.usefulWidth;
    const ft = Math.max(12, (W - Wu) / 2);
    const top = opts.top !== undefined ? opts.top : -4;
    const bot = -(p.frameH || 160);
    const material = MAT.frame(p.color || '#2f6fd0');
    const a = meshOf(sweep(fr, W / 2 - ft, W / 2, bot, top), material, 'structure');
    const b = meshOf(sweep(fr, -W / 2, -W / 2 + ft, bot, top), material, 'structure');
    a.userData.isFrame = b.userData.isFrame = true;
    g.add(a, b);
  }

  /** Guides latéraux sur poteaux. */
  function addGuides(g, fr, path, p, opts) {
    const gh = p.guideH || 0;
    if (gh <= 0) return;
    opts = opts || {};
    const W = opts.width || p.width, Wu = opts.useful || p.usefulWidth;
    const yg = Wu / 2 + Math.max(4, (W - Wu) / 4);
    const z1 = gh, z0 = Math.max(4, gh - 30);
    g.add(meshOf(sweep(fr, yg, yg + 8, z0, z1), MAT.guide(), 'guides'));
    g.add(meshOf(sweep(fr, -yg - 8, -yg, z0, z1), MAT.guide(), 'guides'));
    const L = path.length, np = Math.max(2, Math.ceil(L / 1000) + 1);
    const postH = gh + 4;
    const geo = new THREE.BoxGeometry(10 * M, 10 * M, postH * M);
    const im = new THREE.InstancedMesh(geo, MAT.guide(), np * 2);
    let k = 0;
    for (let i = 0; i < np; i++) {
      const s = C.clamp(L * i / (np - 1), 30, L - 30);
      const f = localFrame(path, s);
      for (const side of [1, -1]) im.setMatrixAt(k++, frameMatrix(f, side * (yg + 4), postH / 2 - 8));
    }
    tag(im, 'guides'); g.add(im);
  }

  /**
   * Altitude LOCALE du support (sol ou plancher de mezzanine) sous le point
   * local (lx, ly) d'un élément, en dessous de l'altitude locale `topLocal`.
   */
  function floorLocal(el, lx, ly, topLocal) {
    if (!el || !C.supportAt) return el ? -el.z : 0;
    const w = C.localToWorld({ x: el.x, y: el.y, z: el.z, rot: el.rot }, lx, ly, 0);
    return C.supportAt(w[0], w[1], el.z + (topLocal === undefined ? 0 : topLocal) - 1, el.id) - el.z;
  }

  /** Pieds de structure (du sol ou du plancher jusque sous le châssis). */
  function addLegs(g, path, p, el, opts) {
    opts = opts || {};
    const W = opts.width || p.width;
    const L = path.length;
    const fh = p.frameH || 160;
    const n = Math.max(2, Math.ceil(L / 1500) + 1);
    const items = [];
    for (let i = 0; i < n; i++) {
      const s = C.clamp(L * i / (n - 1), Math.min(120, L / 2), Math.max(L - 120, L / 2));
      const f = localFrame(path, s);
      const zTop = f.p[2] - fh;            // local
      const zFloor = floorLocal(el, f.p[0], f.p[1], zTop); // local (sol / plancher)
      const h = zTop - zFloor;
      if (h < 60) continue;
      items.push({ f, h, zTop });
    }
    if (!items.length) return;
    const geo = new THREE.BoxGeometry(40 * M, 40 * M, 1);
    const im = new THREE.InstancedMesh(geo, MAT.leg(), items.length * 2);
    const brace = new THREE.InstancedMesh(new THREE.BoxGeometry(30 * M, 1, 30 * M), MAT.leg(), items.length);
    let k = 0;
    const yl = W / 2 - 25;
    items.forEach((it, i) => {
      for (const side of [1, -1]) {
        const x = it.f.p[0] + it.f.n[0] * side * yl, y = it.f.p[1] + it.f.n[1] * side * yl;
        _m4.makeScale(1, 1, it.h * M);
        _m4.setPosition(x * M, y * M, (it.zTop - it.h / 2) * M);
        im.setMatrixAt(k++, _m4);
      }
      // traverse
      const ang = Math.atan2(it.f.t[1], it.f.t[0]);
      _m4.makeRotationZ(ang);
      _m4.scale(new THREE.Vector3(1, W * 0.92 * M, 1));
      _m4.setPosition(it.f.p[0] * M, it.f.p[1] * M, (it.zTop - Math.min(it.h * 0.6, 250)) * M);
      brace.setMatrixAt(i, _m4);
    });
    im.castShadow = true; brace.castShadow = true;
    tag(im, 'structure'); tag(brace, 'structure');
    g.add(im); g.add(brace);
  }

  /** Motoréducteur sous le châssis. */
  function addMotor(g, path, p, s) {
    const f = localFrame(path, s !== undefined ? s : Math.max(0, path.length - 250));
    const fh = p.frameH || 160;
    const side = -1;
    const grp = new THREE.Group();
    const bx = box(220, 160, 160, 0, 0, 0, MAT.motor(), 'structure');
    const cy = cyl(70, 200, MAT.motor(), 'structure'); cy.position.set(0, 160 * M * 0.9, 0);
    grp.add(bx, cy);
    grp.position.set((f.p[0] + f.n[0] * side * (p.width / 2 + 90)) * M, (f.p[1] + f.n[1] * side * (p.width / 2 + 90)) * M, (f.p[2] - fh - 40) * M);
    grp.rotation.z = Math.atan2(f.t[1], f.t[0]);
    tag(grp, 'structure');
    g.add(grp);
  }

  /** Flèches de sens de circulation (sur le chemin de flux, éventuellement inversé). */
  function addArrows(g, flowPath, p, zOff) {
    const L = flowPath.length;
    const n = Math.max(1, Math.round(L / 900));
    const w = Math.min(220, (p.usefulWidth || 400) * 0.4);
    const shape = new THREE.Shape();
    shape.moveTo(w * 0.6 * M, 0); shape.lineTo(-w * 0.4 * M, w * 0.5 * M); shape.lineTo(-w * 0.15 * M, 0); shape.lineTo(-w * 0.4 * M, -w * 0.5 * M); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    for (let i = 0; i < n; i++) {
      const s = L * (i + 0.5) / n;
      const f = localFrame(flowPath, s);
      const m = new THREE.Mesh(geo, MAT.arrow());
      _vx.set(f.t[0], f.t[1], f.t[2]); _vy.set(f.n[0], f.n[1], f.n[2]); _vz.set(f.u[0], f.u[1], f.u[2]);
      m.matrix.makeBasis(_vx, _vy, _vz);
      m.matrix.setPosition(f.p[0] * M + f.u[0] * (zOff || 6) * M, f.p[1] * M + f.u[1] * (zOff || 6) * M, f.p[2] * M + f.u[2] * (zOff || 6) * M);
      m.matrixAutoUpdate = false;
      m.renderOrder = 2;
      tag(m, 'arrows');
      g.add(m);
    }
  }

  /** Surface de convoyage selon la technologie. */
  function addSurface(g, path, fr, p, opts) {
    opts = opts || {};
    const Wu = opts.width || p.usefulWidth;
    const surf = p.surface;
    if (surf === 'rollers' || surf === 'freerollers') {
      addRollers(g, path, p, Object.assign({}, opts, { free: surf === 'freerollers' }));
      // longrine de support basse
    } else if (surf === 'belt' || surf === 'mat') {
      const thick = surf === 'mat' ? 18 : 6;
      g.add(meshOf(sweep(fr, -Wu / 2, Wu / 2, -thick, 0, surf === 'mat' ? 20 : 2), surf === 'mat' ? MAT.mat() : MAT.belt(), 'rollers'));
      // retour de bande
      g.add(meshOf(sweep(fr, -Wu / 2 + 10, Wu / 2 - 10, -(p.frameH || 160) + 25, -(p.frameH || 160) + 25 + thick), MAT.dark(), 'rollers', false));
      // tambours d'extrémité
      if (!opts.noDrums) {
        for (const s of [0, path.length]) {
          const f = localFrame(path, s);
          const dr = Math.min(60, (p.frameH || 160) / 3);
          const c = new THREE.Mesh(new THREE.CylinderGeometry(dr * M, dr * M, Wu * M, 18), MAT.roller());
          c.matrixAutoUpdate = false;
          c.matrix.copy(frameMatrix(f, 0, -dr - thick * 0.2));
          tag(c, 'rollers'); g.add(c);
        }
      }
    } else if (surf === 'chain') {
      const nStr = Wu > 700 ? 3 : 2;
      for (let i = 0; i < nStr; i++) {
        const y = -Wu / 2 + 60 + i * (Wu - 120) / (nStr - 1);
        g.add(meshOf(sweep(fr, y - 25, y + 25, -22, 0, 25), MAT.chain(), 'rollers'));
        g.add(meshOf(sweep(fr, y - 35, y + 35, -60, -22), MAT.plate(), 'structure'));
      }
    }
  }

  /** Convoyeur générique (droit, virage, pente, spirale, modules spéciaux). */
  function buildConveyor(el, model, g, opts) {
    const p = el.params;
    const tr = model.tracks.main;
    const path = new C.Path(tr.segs, null, false);
    const flow = new C.Path(tr.segs, null, !!tr.reversed);
    const fr = frames(path, 3);
    const curve = el.type === 'curve' || el.type === 'spiral';
    let copt = {};
    if (el.type === 'curve') copt = { radius: p.radius, left: p.side !== 'right' };
    if (curve && p.surface === 'rollers' || curve && p.surface === 'freerollers') {
      // en spirale : rouleaux coniques le long de l'hélice uniquement sur la partie courbe
      if (el.type === 'spiral') {
        addRollers(g, path, p, { radius: p.radius, left: p.side !== 'right', free: p.surface === 'freerollers' });
      } else addRollers(g, path, p, Object.assign(copt, { free: p.surface === 'freerollers' }));
    } else addSurface(g, path, fr, p, copt);
    addFrames(g, fr, p);
    addGuides(g, fr, path, p);
    if (el.type === 'spiral') {
      // colonne centrale + bras
      const seg = tr.segs.find(s => s.type === 'arc');
      if (seg) {
        const zMin = Math.min(seg.z0, seg.z1), zMax = Math.max(seg.z0, seg.z1);
        const zf = floorLocal(el, seg.c[0], seg.c[1], zMin - (p.frameH || 160));
        const h = zMax - zf + 300;
        const col = cyl(120, h, MAT.leg(), 'structure');
        col.rotation.x = Math.PI / 2;
        col.position.set(seg.c[0] * M, seg.c[1] * M, (zf + h / 2) * M);
        g.add(col);
        const nArms = Math.ceil(Math.abs(seg.sweep) / (Math.PI / 2)) + 1;
        for (let i = 0; i < nArms; i++) {
          const u = i / (nArms - 1);
          const phi = seg.a0 + seg.sweep * u, z = seg.z0 + (seg.z1 - seg.z0) * u - (p.frameH || 160);
          const arm = box(seg.r + p.width / 2, 40, 40, 0, 0, 0, MAT.leg(), 'structure');
          arm.position.set((seg.c[0] + Math.cos(phi) * (seg.r + p.width / 2) / 2) * M, (seg.c[1] + Math.sin(phi) * (seg.r + p.width / 2) / 2) * M, z * M);
          arm.rotation.z = phi;
          g.add(arm);
        }
        void zMin;
      }
      // pieds sous les parties droites
      const t0 = new C.Path(tr.segs.filter(s => s.type === 'line'), null, false);
      if (t0.length > 0) {
        for (const sg of tr.segs.filter(s => s.type === 'line')) addLegs(g, new C.Path([sg], null, false), p, el);
      }
    } else addLegs(g, path, p, el);
    if (p.surface !== 'freerollers') addMotor(g, path, p);
    addArrows(g, flow, p, p.surface === 'mat' ? 22 : 8);
    return path;
  }

  /* ----------------------------- équipements ---------------------------- */
  const builders = {};
  builders.straight = builders.curve = builders.heightchange = builders.spiral = (el, m, g) => { buildConveyor(el, m, g); };

  builders.transfer = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    // chaînes de transfert transversales (relevables)
    const nCh = Math.max(2, Math.round(p.length / 250));
    for (let i = 0; i < nCh; i++) {
      const x = p.length * (i + 0.5) / nCh;
      const c = box(30, p.usefulWidth + 30, 22, x, 0, 4, MAT.chain(), 'rollers');
      g.add(c);
    }
    // flèches latérales
    const sideArrow = (sgn) => {
      const a = box(60, 140, 4, p.length / 2, sgn * (p.usefulWidth / 2 - 90), 30, MAT.arrow(), 'arrows');
      g.add(a);
    };
    if (p.sides !== 'right') sideArrow(1);
    if (p.sides !== 'left') sideArrow(-1);
    // vérin de levage
    g.add(box(160, 160, 120, p.length / 2, 0, -(p.frameH || 160) - 60, MAT.motor(), 'structure'));
  };

  builders.sorter = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    // rangées de roulettes de déviation au droit de chaque sortie
    const geo = new THREE.CylinderGeometry(22 * M, 22 * M, 18 * M, 12);
    for (const dv of m.diverts) {
      const tr = m.tracks[dv.to];
      const seg = tr.segs[0];
      const ang = Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]);
      const sk = (seg.a[0] + seg.b[0]) / 2;
      const rows = 4, cols = Math.max(3, Math.floor(p.usefulWidth / 90));
      const im = new THREE.InstancedMesh(geo, MAT.glow(0xff6b4a), rows * cols);
      let k = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = sk - 120 + r * 80, y = -p.usefulWidth / 2 + (c + 0.5) * p.usefulWidth / cols;
        _m4.makeRotationZ(ang); _m4.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        _m4.setPosition(x * M, y * M, 4 * M);
        im.setMatrixAt(k++, _m4);
      }
      tag(im, 'rollers'); g.add(im);
      // flèche de sortie
      const path = new C.Path(tr.segs, null, false);
      addArrows(g, path, Object.assign({}, p, { usefulWidth: 260 }), 12);
    }
  };

  builders.turntable = (el, m, g) => {
    const p = el.params, R = p.diameter / 2, fh = p.frameH || 160;
    // socle fixe
    const base = cyl(R * 0.98, fh, MAT.frame(p.color), 'structure', 40);
    base.rotation.x = Math.PI / 2; base.position.set(R * M, 0, (-fh / 2 - 25) * M);
    g.add(base);
    // plateau rotatif
    const spin = new THREE.Group();
    spin.position.set(R * M, 0, 0);
    const disc = cyl(R * 0.96, 16, MAT.plate(), 'rollers', 40);
    disc.rotation.x = Math.PI / 2; disc.position.z = (-p.rollerDiam - 12) * M;
    spin.add(disc);
    const sp = new THREE.Group(); // rouleaux du plateau
    const len = Math.min(p.usefulWidth, R * 1.6);
    const n = Math.max(3, Math.floor(R * 1.6 / (p.rollerPitch || 100)));
    const geo = new THREE.CylinderGeometry(p.rollerDiam / 2 * M, p.rollerDiam / 2 * M, len * M, 14);
    const im = new THREE.InstancedMesh(geo, MAT.roller(), n);
    for (let i = 0; i < n; i++) {
      const x = -R * 0.8 + (i + 0.5) * R * 1.6 / n;
      _m4.makeTranslation(x * M, 0, -p.rollerDiam / 2 * M);
      im.setMatrixAt(i, _m4);
    }
    tag(im, 'rollers'); sp.add(im);
    // longerons du plateau
    sp.add(box(R * 1.7, 20, 50, 0, len / 2 + 15, -30, MAT.frame(p.color), 'structure'));
    sp.add(box(R * 1.7, 20, 50, 0, -len / 2 - 15, -30, MAT.frame(p.color), 'structure'));
    const arr = box(R * 0.5, 30, 4, R * 0.2, 0, 12, MAT.arrow(), 'arrows'); sp.add(arr);
    spin.add(sp);
    spin.userData.isSpin = true;
    g.add(spin);
    g.userData.spin = spin;
    // pieds
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const zFloor = floorLocal(el, R + Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, -fh - 30), h = -fh - 30 - zFloor;
      if (h <= 50) continue;
      const leg = box(50, 50, h, R + Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, zFloor + h / 2, MAT.leg(), 'structure');
      g.add(leg);
    }
    // flèches des sorties
    for (const id in m.tracks) if (id !== 'in') addArrows(g, new C.Path(m.tracks[id].segs, null, false), Object.assign({}, p, { usefulWidth: 200 }), 40);
  };

  builders.elevator = (el, m, g) => {
    const p = el.params, bed = p.bedLength, H = p.elevH, W = p.width;
    const zLow = Math.min(0, H), zHigh = Math.max(0, H);
    const zFloor = floorLocal(el, bed, 0, zLow - (p.frameH || 160));
    // plateau d'entrée (bas) et de sortie (haut)
    const rp = Object.assign({}, p);
    const mk = (x0, x1, z) => {
      const t = new C.Turtle(x0, 0, z, x1 > x0 ? 0 : Math.PI); t.line(Math.abs(x1 - x0));
      const path = new C.Path(t.segs, null, false), fr = frames(path);
      addRollers(g, path, rp); addFrames(g, fr, rp);
    };
    mk(0, bed / 2, 0);
    if (p.config === 'C') mk(bed / 2, 0, H); else mk(bed * 1.5, bed * 2, H);
    // tours
    const towerH = zHigh - zFloor + 400;
    for (const x of [bed / 2 - 40, bed * 1.5 + 40]) for (const y of [W / 2 + 50, -W / 2 - 50]) {
      g.add(box(80, 80, towerH, x, y, zFloor + towerH / 2, MAT.frame(p.color), 'structure'));
    }
    g.add(box(bed + 160, 60, 60, bed, W / 2 + 50, zFloor + towerH, MAT.frame(p.color), 'structure'));
    g.add(box(bed + 160, 60, 60, bed, -W / 2 - 50, zFloor + towerH, MAT.frame(p.color), 'structure'));
    g.add(box(300, 300, 250, bed * 1.5 + 40, W / 2 + 230, zFloor + towerH - 125, MAT.motor(), 'structure'));
    // nacelle mobile
    const car = new THREE.Group();
    const cp = Object.assign({}, p, { color: '#ffb000' });
    const t = new C.Turtle(bed / 2, 0, 0, 0); t.line(bed);
    const cpath = new C.Path(t.segs, null, false);
    addRollers(car, cpath, cp); addFrames(car, frames(cpath), Object.assign({}, cp, { frameH: 120 }));
    car.position.z = 0;
    g.add(car);
    g.userData.carriage = car;
    g.userData.carriageRange = [zLow, zHigh];
    // pieds des plateaux
    for (const [x, z] of [[bed / 4, 0], [p.config === 'C' ? bed / 4 : bed * 1.75, H]]) {
      const h = z - (p.frameH || 160) - zFloor;
      if (h > 50) for (const y of [W / 2 - 25, -W / 2 + 25]) g.add(box(40, 40, h, x, y, zFloor + h / 2, MAT.leg(), 'structure'));
    }
    addArrows(g, new C.Path(m.tracks.main.segs.slice(0, 1), null, false), Object.assign({}, p, { usefulWidth: 250 }), 10);
  };

  builders.stop = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const blade = box(30, p.usefulWidth * 0.9, 90, p.length - 20, 0, 30, MAT.glow(0xe74c3c), 'rollers');
    g.add(blade);
    blade.userData.z0 = 30;
    g.userData.stopBlade = blade;
    g.add(box(120, 120, 100, p.length - 20, 0, -(p.frameH || 160) - 50, MAT.motor(), 'structure'));
  };

  builders.separator = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    // cellule photoélectrique + faisceau
    for (const sgn of [1, -1]) g.add(box(40, 40, 120, p.length - 60, sgn * (p.width / 2 + 30), 80, MAT.color('#f1c40f'), 'structure'));
    const beam = box(6, p.width + 40, 6, p.length - 60, 0, 90, MAT.glow(0xff2020), 'arrows');
    g.add(beam);
  };

  builders.accumulation = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const nz = Math.max(1, Math.floor(p.length / Math.max(100, p.zoneLength)));
    const markers = [];
    for (let i = 0; i < nz; i++) {
      const x = (i + 0.5) * p.length / nz;
      const mk = box(p.length / nz - 30, 14, 14, x, p.width / 2 + 10, -20, new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x145a32, emissiveIntensity: 0.6 }), 'structure');
      g.add(mk); markers.push(mk);
      // capteur de zone
      g.add(box(30, 20, 40, (i + 1) * p.length / nz - 40, -p.width / 2 - 15, 10, MAT.color('#f1c40f'), 'structure'));
    }
    g.userData.zoneMarkers = markers;
  };

  builders.workstation = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const side = p.opSide === 'right' ? -1 : 1;
    const xs = p.length * p.stopPos;
    const zFloor = floorLocal(el, xs, side * (p.width / 2 + 400), -(p.frameH || 160));
    // table opérateur
    const tz = zFloor + 900;
    g.add(box(1200, 700, 40, xs, side * (p.width / 2 + 400), tz, MAT.wood(), 'structure'));
    for (const dx of [-550, 550]) for (const dy of [-300, 300]) g.add(box(40, 40, 880, xs + dx, side * (p.width / 2 + 400) + dy, zFloor + 440, MAT.leg(), 'structure'));
    // écran / scanner
    g.add(box(40, 300, 220, xs, side * (p.width / 2 + 700), tz + 250, MAT.dark(), 'structure'));
    // butée de poste
    const blade = box(20, p.usefulWidth * 0.8, 60, xs + 220, 0, 20, MAT.glow(0xf39c12), 'rollers');
    blade.userData.z0 = 20; g.add(blade); g.userData.stopBlade = blade;
    // silhouette d'opérateur (repère d'encombrement)
    const op = new THREE.Group();
    const body = cyl(180, 1100, MAT.color('#3b5998'), 'structure'); body.rotation.x = Math.PI / 2; body.position.z = (1100 / 2 + 600) * M;
    const head = new THREE.Mesh(new THREE.SphereGeometry(110 * M, 16, 12), MAT.color('#f0c8a0')); head.position.z = 1800 * M; tag(head, 'structure');
    const legsO = cyl(140, 600, MAT.color('#2c3e50'), 'structure'); legsO.rotation.x = Math.PI / 2; legsO.position.z = 300 * M;
    op.add(body, head, legsO);
    op.position.set(xs * M, side * (p.width / 2 + 1050) * M, zFloor * M);
    g.add(op);
  };

  builders.source = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const arch = (x) => {
      const h = 900;
      for (const sgn of [1, -1]) g.add(box(50, 50, h, x, sgn * (p.width / 2 + 40), h / 2 - (p.frameH || 160), MAT.glow(0x2ecc71), 'structure'));
      g.add(box(50, p.width + 130, 50, x, 0, h - (p.frameH || 160), MAT.glow(0x2ecc71), 'structure'));
    };
    arch(80);
  };

  builders.sink = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const h = 900;
    for (const sgn of [1, -1]) g.add(box(50, 50, h, p.length - 80, sgn * (p.width / 2 + 40), h / 2 - (p.frameH || 160), MAT.glow(0xe74c3c), 'structure'));
    g.add(box(50, p.width + 130, 50, p.length - 80, 0, h - (p.frameH || 160), MAT.glow(0xe74c3c), 'structure'));
    g.add(box(40, p.width, 120, p.length + 10, 0, 40, MAT.hazard(), 'structure'));
  };

  builders.obstacle = (el, m, g) => {
    const p = el.params;
    g.add(box(p.length, p.width, p.height, 0, 0, p.height / 2, MAT.hazard(), 'body'));
  };

  builders.table = (el, m, g) => {
    const p = el.params;
    g.add(box(p.length, p.width, 40, 0, 0, p.height - 20, MAT.wood(), 'body'));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.add(box(50, 50, p.height - 40, sx * (p.length / 2 - 60), sy * (p.width / 2 - 60), (p.height - 40) / 2, MAT.frame(p.color), 'body'));
    g.add(box(p.length - 120, 30, 30, 0, 0, 200, MAT.frame(p.color), 'body'));
  };

  builders.mezzanine = (el, m, g) => {
    const p = el.params, L = p.length, W = p.width, H = p.deckH, t = Math.max(20, p.thickness || 120);
    const beamH = 220;
    const frame = MAT.frame(p.color || '#3d6fa8');
    // plancher en caillebotis (matériau propre à l'élément pour la répétition de texture)
    const tex = stripeTex('grating').clone(); tex.needsUpdate = true;
    tex.repeat.set(L / 400, W / 400);
    const deckMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.5 });
    deckMat.userData.owned = true;
    // plancher découpé autour des trémies d'escalier
    const holes = C.Types.mezzHoles(el, (C.app && C.app.project) ? C.app.project.elements : []);
    const xb = Array.from(new Set([-L / 2, L / 2, ...holes.flatMap(h => [h.x0, h.x1])])).sort((a, b) => a - b);
    for (let i = 0; i < xb.length - 1; i++) {
      const a = xb[i], b = xb[i + 1];
      if (b - a < 1) continue;
      const mid = (a + b) / 2;
      const cut = holes.filter(h => h.x0 < mid && h.x1 > mid).map(h => [h.y0, h.y1]).sort((u, v) => u[0] - v[0]);
      let y = -W / 2;
      const piece = (y0, y1) => {
        if (y1 - y0 < 1) return;
        const tx = stripeTex('grating').clone(); tx.needsUpdate = true; tx.repeat.set((b - a) / 400, (y1 - y0) / 400);
        const mt = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6, metalness: 0.5 }); mt.userData.owned = true;
        const dk = box(b - a, y1 - y0, t, mid, (y0 + y1) / 2, H - t / 2, mt, 'body');
        dk.userData.deck = true; g.add(dk);
      };
      for (const [y0, y1] of cut) { piece(y, y0); y = Math.max(y, y1); }
      piece(y, W / 2);
    }
    // chevêtres autour des trémies
    for (const h of holes) {
      g.add(box(h.x1 - h.x0, 80, beamH, (h.x0 + h.x1) / 2, h.y0 - 40, H - t - beamH / 2, frame, 'body'));
      g.add(box(h.x1 - h.x0, 80, beamH, (h.x0 + h.x1) / 2, h.y1 + 40, H - t - beamH / 2, frame, 'body'));
      g.add(box(80, h.y1 - h.y0, beamH, h.x0 - 40, (h.y0 + h.y1) / 2, H - t - beamH / 2, frame, 'body'));
      g.add(box(80, h.y1 - h.y0, beamH, h.x1 + 40, (h.y0 + h.y1) / 2, H - t - beamH / 2, frame, 'body'));
    }
    void deckMat;
    // poutres de rive
    g.add(box(L, 80, beamH, 0, W / 2 - 40, H - t - beamH / 2, frame, 'body'));
    g.add(box(L, 80, beamH, 0, -W / 2 + 40, H - t - beamH / 2, frame, 'body'));
    g.add(box(80, W, beamH, L / 2 - 40, 0, H - t - beamH / 2, frame, 'body'));
    g.add(box(80, W, beamH, -L / 2 + 40, 0, H - t - beamH / 2, frame, 'body'));
    // modules voisins (accolés bord à bord, même hauteur de plancher)
    const tf = { x: el.x, y: el.y, z: el.z, rot: el.rot };
    const top = el.z + H;
    const others = (C.mezzanineList ? C.mezzanineList() : []).filter(o => o.id !== el.id && Math.abs(o.z + o.params.deckH - top) < 10);
    /** Module voisin couvrant le point local (x, y), sinon null. */
    const joinedAt = (x, y) => {
      const w = C.localToWorld(tf, x, y, 0);
      for (const o of others) {
        const l = C.worldToLocal({ x: o.x, y: o.y, z: 0, rot: o.rot }, w[0], w[1], 0);
        if (Math.abs(l[0]) <= o.params.length / 2 + 2 && Math.abs(l[1]) <= o.params.width / 2 + 2) return o;
      }
      return null;
    };
    // trame de poteaux + poutres principales
    const sp = Math.max(1000, p.columnSpacing || 4000);
    const nx = Math.max(2, Math.ceil(L / sp) + 1), ny = Math.max(2, Math.ceil(W / sp) + 1);
    const xs = [], ys = [];
    for (let i = 0; i < nx; i++) xs.push(-L / 2 + 75 + (L - 150) * i / (nx - 1));
    for (let j = 0; j < ny; j++) ys.push(-W / 2 + 75 + (W - 150) * j / (ny - 1));
    for (const y of ys) g.add(box(L, 100, beamH, 0, y, H - t - beamH / 2, frame, 'body'));
    for (const x of xs) for (const y of ys) {
      // poteau de rive sur une jonction : un seul des deux modules le porte ; pas de poteau dans une trémie
      let skip = holes.some(h => x > h.x0 - 60 && x < h.x1 + 60 && y > h.y0 - 60 && y < h.y1 + 60);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const onEdge = (dx && Math.abs(x - dx * L / 2) < 100) || (dy && Math.abs(y - dy * W / 2) < 100);
        if (!onEdge) continue;
        const o = joinedAt(x + dx * 160, y + dy * 160);
        if (o && o.id < el.id) skip = true;
      }
      if (skip) continue;
      const zf = floorLocal(el, x, y, H - t - beamH);
      const ch = H - t - beamH - zf;
      if (ch <= 10) continue;
      g.add(box(120, 120, ch, x, y, zf + ch / 2, frame, 'body'));
      g.add(box(260, 260, 15, x, y, zf + 7, MAT.leg(), 'structure'));
    }
    // escalier
    const sw = C.clamp(p.stairsWidth || 1000, 600, Math.min(L, W));
    let open = null; // ouverture du garde-corps : {edge, a0, a1}
    if (p.stairs && p.stairs !== 'none') {
      const along = p.stairs === 'front' || p.stairs === 'back' ? L : W;
      const a0 = along / 2 - sw / 2 - 300;
      const st = new THREE.Group();
      const cfg = { front: [a0, -W / 2, -Math.PI / 2], back: [-a0, W / 2, Math.PI / 2], left: [-L / 2, -a0, Math.PI], right: [L / 2, a0, 0] }[p.stairs];
      st.position.set(cfg[0] * M, cfg[1] * M, 0);
      st.rotation.z = cfg[2];
      const zf = floorLocal(el, cfg[0], cfg[1], H - 1);
      const rise = H - zf;
      const n = p.steps > 0 ? Math.round(p.steps) : Math.max(2, Math.ceil(rise / 180)), r = rise / n, going = p.going || 270;
      const run = (n - 1) * going;
      for (let i = 1; i < n; i++) st.add(box(going + 20, sw - 60, 40, (i - 0.5) * going, 0, H - i * r - 20, deckMat, 'body'));
      const ang = Math.atan2(rise, run), hyp = Math.hypot(rise, run);
      for (const sgn of [1, -1]) {
        const str = box(hyp + 200, 30, 220, run / 2, sgn * sw / 2, zf + rise / 2 - 60, frame, 'body');
        str.rotation.y = ang; st.add(str);
        const hr = box(hyp + 200, 40, 40, run / 2, sgn * sw / 2, zf + rise / 2 + 950, MAT.color('#f1c40f'), 'body');
        hr.rotation.y = ang; st.add(hr);
        for (const u of [0.1, 0.5, 0.9]) {
          const x = run * u, z = H - rise * u;
          st.add(box(30, 30, 950, x, sgn * sw / 2, z + 475 - 20, MAT.color('#f1c40f'), 'body'));
        }
      }
      tag(st, 'body'); g.add(st);
      open = { edge: p.stairs, a: p.stairs === 'front' ? a0 : p.stairs === 'back' ? -a0 : p.stairs === 'left' ? -a0 : a0 };
    }
    // garde-corps (lisse haute, sous-lisse, plinthe) avec ouverture d'escalier
    const rh = p.railH || 0;
    if (rh > 0) {
      const yellow = MAT.color('#f1c40f');
      const rail = (x0, y0, x1, y1) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len < 50) return;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = Math.atan2(y1 - y0, x1 - x0);
        for (const [z, hh, th] of [[H + rh - 20, 40, 40], [H + rh / 2, 30, 30], [H + 75, 150, 12]]) {
          const b = box(len, th, hh, 0, 0, 0, z === H + 75 ? frame : yellow, 'body');
          b.position.set(cx * M, cy * M, z * M); b.rotation.z = a; g.add(b);
        }
        const np = Math.max(2, Math.ceil(len / 1500) + 1);
        for (let i = 0; i < np; i++) {
          const u = i / (np - 1);
          g.add(box(40, 40, rh, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, H + rh / 2, yellow, 'body'));
        }
      };
      const ins = 30;
      const edges = {
        front: [[-L / 2 + ins, -W / 2 + ins], [L / 2 - ins, -W / 2 + ins], 'x'],
        back: [[-L / 2 + ins, W / 2 - ins], [L / 2 - ins, W / 2 - ins], 'x'],
        left: [[-L / 2 + ins, -W / 2 + ins], [-L / 2 + ins, W / 2 - ins], 'y'],
        right: [[L / 2 - ins, -W / 2 + ins], [L / 2 - ins, W / 2 - ins], 'y']
      };
      const outward = { front: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] };
      for (const k in edges) {
        const [a, b, ax] = edges[k];
        const o = outward[k];
        // portions libres du bord : ni jonction avec un module voisin, ni trémie d'escalier
        const len = ax === 'x' ? b[0] - a[0] : b[1] - a[1];
        const step = 50, free = [];
        for (let u = 0; u <= len + 1e-6; u += step) {
          const x = ax === 'x' ? a[0] + u : a[0], y = ax === 'y' ? a[1] + u : a[1];
          const along = ax === 'x' ? x : y;
          let isFree = !joinedAt(x + o[0] * 90, y + o[1] * 90);
          if (isFree && open && open.edge === k && along > open.a - sw / 2 - 1 && along < open.a + sw / 2 + 1) isFree = false;
          free.push(isFree);
        }
        let start = -1;
        for (let i = 0; i <= free.length; i++) {
          if (i < free.length && free[i]) { if (start < 0) start = i; continue; }
          if (start >= 0) {
            const u0 = start * step, u1 = Math.min(len, (i - 1) * step);
            if (ax === 'x') rail(a[0] + u0, a[1], a[0] + u1, a[1]); else rail(a[0], a[1] + u0, a[0], a[1] + u1);
            start = -1;
          }
        }
      }
    }
    if ((p.railH || 0) > 0 && holes.length) {
      const yel = MAT.color('#f1c40f'), rh = p.railH;
      const hrail = (x0, y0, x1, y1) => {
        const len = Math.hypot(x1 - x0, y1 - y0); if (len < 50) return;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = Math.atan2(y1 - y0, x1 - x0);
        for (const [z, hh, th, mt] of [[H + rh - 20, 40, 40, yel], [H + rh / 2, 30, 30, yel], [H + 75, 150, 12, frame]]) {
          const b = box(len, th, hh, 0, 0, 0, mt, 'body'); b.position.set(cx * M, cy * M, z * M); b.rotation.z = a; g.add(b);
        }
        const np = Math.max(2, Math.ceil(len / 1500) + 1);
        for (let i = 0; i < np; i++) { const u = i / (np - 1); g.add(box(40, 40, rh, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, H + rh / 2, yel, 'body')); }
      };
      for (const h of holes) {
        const e = 25;
        if (h.entry !== 'y0') hrail(h.x0 - e, h.y0 - e, h.x1 + e, h.y0 - e);
        if (h.entry !== 'y1') hrail(h.x0 - e, h.y1 + e, h.x1 + e, h.y1 + e);
        if (h.entry !== 'x0') hrail(h.x0 - e, h.y0 - e, h.x0 - e, h.y1 + e);
        if (h.entry !== 'x1') hrail(h.x1 + e, h.y0 - e, h.x1 + e, h.y1 + e);
      }
    }
  };

  /* ---------------- Escalier de trémie ---------------- */
  builders.mezzstair = (el, m, g) => {
    const p = el.params, w = p.stairWidth || 1000, going = p.going || 250;
    const d = C.Types.defs.mezzstair.dims(el);
    const frame = MAT.frame(p.color || '#3d6fa8'), yel = MAT.color('#f1c40f');
    const tx = stripeTex('grating').clone(); tx.needsUpdate = true; tx.repeat.set(going / 300, w / 400);
    const tread = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6, metalness: 0.5 }); tread.userData.owned = true;
    for (let i = 1; i < d.n; i++) g.add(box(going + 20, w - 60, 40, (i - 0.5) * going, 0, -i * d.r - 20, tread, 'body'));
    g.add(box(going * 1.2, w - 60, 20, d.run + going * 0.6, 0, -d.rise + 10, tread, 'body'));          // palier bas
    const ang = Math.atan2(d.rise, d.run), hyp = Math.hypot(d.rise, d.run);
    for (const sg of [1, -1]) {
      const str = box(hyp + 200, 30, 220, d.run / 2, sg * w / 2, -d.rise / 2 - 60, frame, 'body'); str.rotation.y = ang; g.add(str);
      const hr = box(hyp + 200, 40, 40, d.run / 2, sg * w / 2, -d.rise / 2 + 950, yel, 'body'); hr.rotation.y = ang; g.add(hr);
      for (const u of [0.05, 0.35, 0.65, 0.95]) g.add(box(30, 30, 950, d.run * u, sg * w / 2, -d.rise * u + 455, yel, 'body'));
    }
    // plaque d'information (nombre de marches)
    const lab = C.textSprite && C.textSprite(`${d.n} marches · ${C.fmt(d.r)} mm`, { height: 0.18, color: '#ffffff', bg: 'rgba(30,40,55,0.8)' });
    if (lab) { lab.center.set(0.5, 0); lab.position.set(d.run / 2 * M, 0, (-d.rise / 2 + 1250) * M); tag(lab, 'labels3d'); g.add(lab); }
  };

  /** Petit générateur déterministe (remplissage reproductible des stocks). */
  function seeded(str) {
    let hsh = 2166136261;
    for (let i = 0; i < str.length; i++) { hsh ^= str.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
    return new C.RNG(hsh >>> 0);
  }
  /** Instances de boîtes (positions mm, dimensions mm, couleurs optionnelles). */
  function boxInstances(g, items, material, layer) {
    if (!items.length) return null;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
    const col = new THREE.Color();
    items.forEach((it, i) => {
      _m4.makeScale(it.l * M, it.w * M, it.h * M);
      if (it.rz) _m4.premultiply(new THREE.Matrix4().makeRotationZ(it.rz));
      _m4.setPosition(it.x * M, it.y * M, it.z * M);
      im.setMatrixAt(i, _m4);
      if (it.c) im.setColorAt(i, col.set(it.c));
    });
    im.castShadow = true; im.receiveShadow = true;
    tag(im, layer || 'body');
    g.add(im);
    return im;
  }

  /** Plaque de signalétique (texte sur fond jaune ou bleu), face −Y, centrée. */
  const plateMats = new Map();
  function labelPlate(text, w, hh, style) {
    const key = style + '|' + text;
    let mt = plateMats.get(key);
    if (!mt) {
      const cv = document.createElement('canvas');
      cv.width = style === 'head' ? 256 : 192; cv.height = Math.round(cv.width * hh / w);
      const c2 = cv.getContext('2d');
      c2.fillStyle = style === 'head' ? '#1f3f73' : '#ffd400'; c2.fillRect(0, 0, cv.width, cv.height);
      c2.strokeStyle = style === 'head' ? '#ffffff' : '#111'; c2.lineWidth = 3; c2.strokeRect(2, 2, cv.width - 4, cv.height - 4);
      c2.fillStyle = style === 'head' ? '#ffffff' : '#111';
      let fs = cv.height * 0.62;
      c2.font = `bold ${fs}px Arial, sans-serif`;
      while (c2.measureText(text).width > cv.width * 0.9 && fs > 8) { fs -= 1; c2.font = `bold ${fs}px Arial, sans-serif`; }
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.fillText(text, cv.width / 2, cv.height / 2 + 1);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      mt = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
      plateMats.set(key, mt);
    }
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w * M, hh * M), mt);
    pl.rotation.x = Math.PI / 2;
    tag(pl, 'body');
    return pl;
  }

  /* ---------------- Rack à palettes ---------------- */
  builders.rack = (el, m, g) => {
    const p = el.params;
    const rows = +p.rows === 2 ? 2 : 1, nb = Math.max(1, Math.round(p.bays)), bl = p.bayLength, d = p.depth, flue = 200;
    const L = nb * bl, Wt = rows * d + (rows - 1) * flue;
    const H = C.Types.rackHeight(p);
    const nl = Math.max(1, Math.round(p.levels));
    const levelZ = k => (p.firstOnFloor ? k : k + 1) * p.levelH;   // niveau de dépose k
    const upr = MAT.color(p.color || '#1f5fa8'), beam = MAT.color(p.beamColor || '#e67e22');
    const posts = [], braces = [], beams = [], plates = [];
    for (let r = 0; r < rows; r++) {
      const y0 = -Wt / 2 + r * (d + flue);
      for (let j = 0; j <= nb; j++) {
        const x = -L / 2 + j * bl;
        for (const y of [y0 + 40, y0 + d - 40]) { posts.push({ x, y, z: H / 2, l: 80, w: 60, h: H }); plates.push({ x, y, z: 5, l: 150, w: 130, h: 10 }); }
        // contreventement en zigzag dans le plan du cadre
        const n = Math.max(2, Math.round(H / 900));
        const dz = (H - 200) / n, len = Math.hypot(dz, d - 80);
        for (let k = 0; k < n; k++) {
          const ang = Math.atan2(dz, d - 80) * (k % 2 ? -1 : 1);
          braces.push({ x, y: y0 + d / 2, z: 100 + dz * (k + 0.5), l: 30, w: len, h: 25, rx: ang });
        }
      }
      for (let k = 0; k < nl; k++) {
        const z = levelZ(k);
        if (z <= 1) continue;
        for (let j = 0; j < nb; j++) {
          const x = -L / 2 + (j + 0.5) * bl;
          for (const y of [y0 + 40, y0 + d - 40]) beams.push({ x, y, z: z - 60, l: bl - 80, w: 50, h: 120 });
        }
      }
    }
    boxInstances(g, posts, upr, 'body');
    boxInstances(g, plates, MAT.leg(), 'structure');
    boxInstances(g, beams, beam, 'body');
    // contreventements (rotation autour de X)
    if (braces.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), upr, braces.length);
      braces.forEach((b, i) => {
        _m4.makeRotationX(b.rx); _m4.scale(new THREE.Vector3(b.l * M, b.w * M, b.h * M));
        _m4.setPosition(b.x * M, b.y * M, b.z * M); im.setMatrixAt(i, _m4);
      });
      tag(im, 'structure'); g.add(im);
    }
    // numérotation : plaque d'en-tête, plaques de bout d'allée, adresses des emplacements
    if (p.showNumbers !== false) {
      const head = `${p.aisleName || ''}${p.rackNumber || ''}`;
      const facing = (sgn) => { const gp = new THREE.Group(); gp.rotation.z = sgn > 0 ? Math.PI : 0; return gp; };
      for (let r = 0; r < rows; r++) {
        const y0 = -Wt / 2 + r * (d + flue);
        const face = rows === 2 && r === 1 ? 1 : -1;            // face accessible : avant (−Y) ou arrière (+Y)
        const yf = face < 0 ? y0 + 12 : y0 + d - 12;
        const gp = facing(face);
        g.add(gp);
        const put = (text, x, z, w, hh, style) => {
          // dans le groupe tourné de 180° pour la face arrière, x et y sont inversés
          const pl = labelPlate(text, w, hh, style);
          pl.position.set((face < 0 ? x : -x) * M, (face < 0 ? yf : -yf) * M + (face < 0 ? -0.001 : -0.001), z * M);
          gp.add(pl);
        };
        if (head) put(head + (rows === 2 ? (r ? ' P' : ' I') : ''), 0, H + 260, Math.min(1400, L * 0.5), 360, 'head');
        for (let k = 0; k < nl; k++) for (let j = 0; j < nb; j++) {
          const z = levelZ(k);
          put(C.Types.defs.rack.address(p, r, j, k), -L / 2 + (j + 0.5) * bl, z > 1 ? z - 60 : 130, 380, 110, 'slot');
        }
      }
      // plaques de bout d'allée (sur les deux échelles d'extrémité)
      if (head) for (const sx of [-1, 1]) {
        const gp = new THREE.Group(); gp.rotation.z = sx > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(gp);
        const pl = labelPlate(head, Math.min(900, Wt * 0.6), 420, 'head');
        pl.position.set(0, -(L / 2 + 50) * M, H * 0.55 * M);
        gp.add(pl);
      }
    }
    // charges stockées
    {
      const R = C.Types.defs.rack;
      const pal = [], loads = [];
      const perBay = Math.max(1, Math.floor((bl - 80) / 900));
      const film = ['#d9dde3', '#c9b18a', '#b98b52', '#e3d3b4', '#9fb3c8', '#cfa77a'];
      for (let r = 0; r < rows; r++) {
        const y0 = -Wt / 2 + r * (d + flue);
        for (let k = 0; k < nl; k++) for (let j = 0; j < nb; j++) for (let q = 0; q < perBay; q++) {
          const key = R.slotKey(r, j, k, q);
          if (!R.slotOccupied(el, key)) continue;
          const rng = { next: (() => { let i = 0; return () => R.slotRand(el, key, 'v' + (i++)); })() };
          const x = -L / 2 + j * bl + 40 + (q + 0.5) * (bl - 80) / perBay, z = levelZ(k);
          const pw = Math.min(800, (bl - 80) / perBay - 60), pd = Math.min(d - 40, 1200);
          pal.push({ x, y: y0 + d / 2, z: z + 72, l: pw, w: pd, h: 144 });
          const lh = (p.loadH - 144) * (0.55 + 0.45 * rng.next());
          if (p.loadType === 'carton') {
            const nx = 2, ny = 2, nz = Math.max(1, Math.floor(lh / 250));
            for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) for (let c2 = 0; c2 < nz; c2++)
              loads.push({ x: x - pw / 4 + a * pw / 2, y: y0 + d / 2 - pd / 4 + b * pd / 2, z: z + 144 + 125 + c2 * 250, l: pw / 2 - 10, w: pd / 2 - 10, h: 240, c: film[(a + b + c2 + k) % 3 + 1] });
          } else loads.push({ x, y: y0 + d / 2, z: z + 144 + lh / 2, l: pw - 20, w: pd - 20, h: lh, c: film[Math.floor(rng.next() * film.length)] });
        }
      }
      boxInstances(g, pal, MAT.wood(), 'body');
      boxInstances(g, loads, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 }), 'body');
    }
  };

  /* ---------------- Stockage à navettes (type OSR) ---------------- */
  builders.osr = (el, m, g) => {
    const p = el.params;
    const n = C.clamp(Math.round(p.towers), 1, 30), tw = p.towerWidth, Ld = p.rackLength;
    const rd = Math.min(700, (tw - 600) / 2), aisle = tw - 2 * rd;
    const y0 = C.Types.defs.osr.rackY0(p), y1 = y0 + Ld;
    const zf = floorLocal(el, tw / 2, (y0 + y1) / 2, 0);
    const H = C.Types.osrHeight(p);
    const nl = Math.max(1, Math.round(p.levels));
    const liftY = p.laneLength + p.frontZone * 0.5;
    // convoyeurs de pré-zone : entrée (vers la tour) et sortie (vers l'avant), un couple par tour
    for (let i = 0; i < n; i++) {
      for (const id of ['in' + (i + 1), 'out' + (i + 1)]) {
        const tr = m.tracks[id];
        if (!tr) continue;
        const path = new C.Path(tr.segs, null, false), fr = frames(path, 3);
        const lp = Object.assign({}, p, { color: id.startsWith('in') ? '#2e86de' : '#e67e22' });
        addSurface(g, path, fr, lp); addFrames(g, fr, lp); addGuides(g, fr, path, lp); addLegs(g, path, lp, el);
        addArrows(g, path, lp, 8);
        addMotor(g, path, lp, id.startsWith('in') ? path.length - 300 : 300);
      }
      // panneaux ENTRÉE / SORTIE au-dessus des convoyeurs
      const X = C.Types.defs.osr.lanesX(p, i);
      for (const [x, txt, col] of [[X.xin, 'ENTRÉE ' + (i + 1), '#1f5fa8'], [X.xout, 'SORTIE ' + (i + 1), '#c0602a']]) {
        const lab = C.textSprite && C.textSprite(txt, { height: 0.22, color: '#ffffff', bg: col, bold: true });
        if (lab) { lab.center.set(0.5, 0); lab.position.set(x * M, (p.laneLength * 0.35) * M, 700 * M); tag(lab, 'body'); g.add(lab); }
      }
    }
    const frame = MAT.color('#c3cad3'), clad = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color || '#5b6d82'), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    clad.userData.owned = true;
    const posts = [], shelves = [], totes = [], lifts = [];
    const fmt = (C.app && C.app.project && C.app.project.format((p.formats || ['bac'])[0])) || { L: 600, W: 400, H: 220, color: '#3d7fd6' };
    const rng = seeded(el.id + ':' + n + ':' + nl);
    const nSlots = Math.max(1, Math.floor((Ld - 100) / (Math.min(fmt.L, fmt.W) + 60)));
    const shuttles = [];
    for (let i = 0; i < n; i++) {
      const xa = i * tw, xc = xa + tw / 2;
      for (const side of [-1, 1]) {
        const bx0 = side < 0 ? xa : xa + tw - rd;            // bloc de rayonnage
        for (const x of [bx0 + 25, bx0 + rd - 25]) for (let y = y0; y <= y1 + 1; y += Math.max(800, Ld / Math.ceil(Ld / 1300))) posts.push({ x, y, z: zf + H / 2, l: 50, w: 50, h: H });
        for (let k = 0; k < nl; k++) {
          const z = zf + 300 + k * p.levelH;
          shelves.push({ x: bx0 + rd / 2, y: (y0 + y1) / 2, z, l: rd, w: Ld, h: 12 });
          for (let q = 0; q < nSlots; q++) {
            if (rng.next() * 100 >= p.fill) continue;
            totes.push({ x: bx0 + rd / 2, y: y0 + 50 + (q + 0.5) * (Ld - 100) / nSlots, z: z + 6 + fmt.H / 2, l: Math.min(rd - 40, Math.max(fmt.L, fmt.W)), w: Math.min(fmt.L, fmt.W), h: Math.min(fmt.H, p.levelH - 60) });
          }
        }
      }
      for (let k = 0; k < nl; k++) {
        const z = zf + 300 + k * p.levelH;
        for (const sx of [xa + rd + 20, xa + tw - rd - 20]) shelves.push({ x: sx, y: (y0 + y1) / 2, z: z - 10, l: 30, w: Ld, h: 30 });
        shuttles.push({ i, k, x: xc, z: z + 40, l: aisle - 80, w: 650, h: 110 });
      }
      // deux élévateurs de pré-zone (entrée et sortie) dans l'axe des convoyeurs
      const X = C.Types.defs.osr.lanesX(p, i);
      for (const [lx, kind] of [[X.xin, 'in'], [X.xout, 'out']]) {
        for (const dx of [-p.width / 2 - 60, p.width / 2 + 60]) posts.push({ x: lx + dx, y: liftY + 350, z: zf + H / 2, l: 90, w: 90, h: H });
        lifts.push({ i: i * 2 + (kind === 'in' ? 0 : 1), x: lx, y: liftY, zMin: -40, zMax: zf + 300 + (nl - 1) * p.levelH, w: p.width - 40 });
      }
      const lab = C.textSprite && C.textSprite('Tour ' + (i + 1), { height: 0.32, color: '#ffffff', bg: 'rgba(30,40,55,0.85)' });
      if (lab) { lab.center.set(0.5, 0); lab.position.set(xc * M, (y0 - 60) * M, (zf + H + 80) * M); tag(lab, 'body'); g.add(lab); }
    }
    boxInstances(g, posts, frame, 'body');
    boxInstances(g, shelves, MAT.plate(), 'body');
    boxInstances(g, totes, C.cartonMaterial ? C.cartonMaterial(fmt.color) : MAT.color(fmt.color), 'body');
    const shIm = boxInstances(g, shuttles.map(s2 => Object.assign({}, s2, { y: (y0 + y1) / 2 })), MAT.glow(0xf39c12), 'body');
    const liftIm = boxInstances(g, lifts.map(l => ({ x: l.x, y: l.y, z: 0, l: l.w, w: 650, h: 80 })), MAT.glow(0x2ecc71), 'body');
    g.userData.osr = { shuttles, shIm, lifts, liftIm, y0, y1, aisle };
    // habillage : bardage latéral translucide, toiture, bandeau de façade
    const W = n * tw, yb = p.laneLength;
    for (const x of [0, W]) g.add(box(10, y1 - yb, H, x, (yb + y1) / 2, zf + H / 2, clad, 'structure'));
    g.add(box(W, 10, H, W / 2, y1, zf + H / 2, clad, 'structure'));
    g.add(box(W + 40, y1 - yb + 40, 30, W / 2, (yb + y1) / 2, zf + H + 15, MAT.color(p.color || '#5b6d82'), 'structure'));
    g.add(box(W + 40, 40, 500, W / 2, yb - 20, zf + H - 250, MAT.color(p.color || '#5b6d82'), 'structure'));
  };
  /** Animation des navettes et élévateurs (appelée pendant la simulation). */
  C.animateOSR = function (g, t) {
    const o = g.userData.osr;
    if (!o) return;
    const mid = (o.y0 + o.y1) / 2, amp = (o.y1 - o.y0) / 2 - 400;
    o.shuttles.forEach((s, idx) => {
      const y = mid + amp * Math.sin(t * (0.35 + 0.05 * (s.k % 5)) + s.k * 1.7 + s.i * 0.9);
      _m4.makeScale(s.l * M, s.w * M, s.h * M); _m4.setPosition(s.x * M, y * M, s.z * M);
      o.shIm.setMatrixAt(idx, _m4);
    });
    o.shIm.instanceMatrix.needsUpdate = true;
    o.lifts.forEach((l, idx) => {
      const u = 0.5 - 0.5 * Math.cos(t * 0.9 + l.i * 1.3);
      _m4.makeScale((l.w || o.aisle - 140) * M, 650 * M, 80 * M); _m4.setPosition(l.x * M, l.y * M, (l.zMin + (l.zMax - l.zMin) * u) * M);
      o.liftIm.setMatrixAt(idx, _m4);
    });
    o.liftIm.instanceMatrix.needsUpdate = true;
  };

  /* ---------------- Mur d'entrepôt ---------------- */
  builders.wall = (el, m, g) => {
    const p = el.params, L = p.length, H = p.height, t = p.thickness || 200;
    const all = C.app && C.app.project ? C.app.project.elements : [];
    const openings = C.Walls.wallOpenings(el, all);
    const pieces = C.Walls.wallPieces(el, openings);
    // angles : prolonger de t/2 l'extrémité raccordée à un autre mur non parallèle
    const ends = C.Walls.wallEnds(el);
    const ext = [0, 0];
    for (const o of all) {
      if (o === el || o.type !== 'wall') continue;
      if (Math.abs(Math.sin((o.rot - el.rot) * C.DEG)) < 0.2) continue;
      for (const q of C.Walls.wallEnds(o)) ends.forEach((e2, i) => { if (Math.hypot(e2[0] - q[0], e2[1] - q[1]) < 20) ext[i] = t / 2; });
    }
    const mkMat = (kind, color, repX, repY) => {
      const tex = stripeTex(kind).clone(); tex.needsUpdate = true; tex.repeat.set(repX, repY);
      const mt = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(color), roughness: 0.85, metalness: kind === 'cladding' ? 0.25 : 0 });
      mt.userData.owned = true; mt.userData.wallMat = true;
      return mt;
    };
    const clad = mkMat('cladding', p.color || '#c9ced6', L / 1000, 1);
    const conc = mkMat('concrete', '#ffffff', L / 2000, 1);
    const baseH = Math.max(0, Math.min(H, +p.baseH || 0));
    for (const pc of pieces) {
      const x0 = pc.x0 <= 0.5 ? -ext[0] : pc.x0, x1 = pc.x1 >= L - 0.5 ? L + ext[1] : pc.x1;
      for (const [z0, z1, mt] of [[pc.z0, Math.min(pc.z1, baseH), conc], [Math.max(pc.z0, baseH), pc.z1, clad]]) {
        if (z1 - z0 < 1) continue;
        const b = box(x1 - x0, t, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, mt, 'walls');
        b.userData.wallPiece = true;
        g.add(b);
      }
    }
    // encadrement des ouvertures (+ porte sectionnelle relevée)
    const fr = MAT.color('#3a4048');
    for (const o of openings) {
      const w = o.x1 - o.x0, cx = (o.x0 + o.x1) / 2;
      if (o.z1 < H - 1) g.add(box(w + 120, t + 40, 80, cx, 0, o.z1 + 40, fr, 'walls'));
      for (const x of [o.x0, o.x1]) if (x > 1 && x < L - 1) g.add(box(60, t + 40, o.z1 - o.z0, x, 0, (o.z0 + o.z1) / 2, fr, 'walls'));
      if (o.kind === 'door') {
        g.add(box(w, t * 0.6, 500, cx, -t, Math.min(H - 250, o.z1 + 300), MAT.color('#e67e22'), 'walls'));
        g.add(box(w, 10, 100, cx, -t / 2 - 30, 50, MAT.hazard(), 'walls'));
      } else if (o.kind === 'conv') {
        // rideau à lanières translucide au-dessus du passage
        const strip = new THREE.MeshStandardMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
        strip.userData.owned = true;
        const n = Math.max(2, Math.round(w / 200));
        for (let i = 0; i < n; i++) {
          const sl = box(w / n - 10, 4, (o.z1 - o.z0) * 0.45, o.x0 + (i + 0.5) * w / n, 0, o.z1 - (o.z1 - o.z0) * 0.225, strip, 'walls');
          sl.castShadow = false; g.add(sl);
        }
      }
    }
    g.userData.openings = openings;
  };

  /* ---------------- Étiqueteuse print & apply ---------------- */
  builders.labeler = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const side = p.labelSide === 'right' ? -1 : 1;           // côté de la machine
    const xs = p.length * C.clamp(+p.stopPos || 0.5, 0.05, 0.95);
    const yb = side * (p.width / 2 + 330);
    const zf = floorLocal(el, xs, yb, 0);
    const body = MAT.color('#e8ecef'), accent = MAT.color(p.color || '#16a085'), dark = MAT.dark();
    // colonne support et armoire d'impression
    g.add(box(120, 120, -zf + 100, xs, yb, (zf + 100) / 2, MAT.leg(), 'structure'));
    g.add(box(450, 420, 900, xs, yb, 550, body, 'structure'));
    g.add(box(455, 425, 120, xs, yb, 940, accent, 'structure'));
    g.add(box(10, 220, 150, xs + 228, yb, 720, dark, 'structure'));           // écran
    const roll = cyl(160, 120, MAT.color('#f5f5f5'), 'structure', 24); roll.position.set((xs - 120) * M, (yb + side * 270) * M, 560 * M); g.add(roll);
    const core = cyl(40, 130, dark, 'structure', 12); core.position.copy(roll.position); g.add(core);
    // bras et applicateur (tampon) animé
    const ap = new THREE.Group();
    let axis, rest, active;
    if (p.labelSide === 'top') {
      g.add(box(80, p.width / 2 + 330, 80, xs, side * (p.width / 2 + 330) / 2, 960, accent, 'structure'));
      const pad = box(160, 120, 60, 0, 0, 0, MAT.color('#222'), 'structure'); ap.add(pad);
      const rod = box(30, 30, 300, 0, 0, 180, MAT.guide(), 'structure'); ap.add(rod);
      ap.position.set(xs * M, 0, 700 * M);
      axis = 'z'; rest = 700 * M; active = 470 * M;
    } else if (p.labelSide === 'front') {
      const pad = box(60, 160, 120, 0, 0, 0, MAT.color('#222'), 'structure'); ap.add(pad);
      ap.position.set((xs + 400) * M, 0, 250 * M);
      g.add(box(80, p.width / 2 + 330, 80, xs + 400, side * (p.width / 2 + 330) / 2, 600, accent, 'structure'));
      axis = 'x'; rest = (xs + 400) * M; active = (xs + 230) * M;
    } else {
      const pad = box(160, 60, 120, 0, 0, 0, MAT.color('#222'), 'structure'); ap.add(pad);
      const rod = box(30, 260, 30, 0, side * 150, 0, MAT.guide(), 'structure'); ap.add(rod);
      ap.position.set(xs * M, side * (p.width / 2 + 60) * M, 200 * M);
      axis = 'y'; rest = side * (p.width / 2 + 60) * M; active = side * (p.usefulWidth / 2 - 120) * M;
    }
    tag(ap, 'structure');
    g.add(ap);
    g.userData.applicator = { obj: ap, axis, rest, active };
    // cellule de détection
    g.add(box(40, 40, 100, xs - 300, -side * (p.width / 2 + 25), 70, MAT.color('#f1c40f'), 'structure'));
  };

  /* ---------------- Chariot à mât rétractable + cariste ---------------- */
  builders.reachtruck = (el, m, g) => {
    const p = el.params;
    const body = MAT.color(p.color || '#f39c12'), dark = MAT.color('#2b2f35'), steel = MAT.color('#5d6670'), black = MAT.color('#15181c');
    // châssis / batterie (arrière) : x ∈ [−1300, 0]
    g.add(box(1300, 1260, 900, -650, 0, 520, body, 'body'));
    g.add(box(1240, 1200, 80, -650, 0, 30, dark, 'body'));
    g.add(box(500, 1250, 260, -1050, 0, 1100, body, 'body'));           // capot moteur arrière
    // poste de conduite (assis de côté) + protège-conducteur
    for (const [x, y] of [[-1250, 600], [-1250, -600], [-160, 600], [-160, -600]]) g.add(box(70, 70, 1400, x, y, 1600, dark, 'body'));
    g.add(box(1200, 1290, 60, -700, 0, 2300, dark, 'body'));
    for (let i = 0; i < 6; i++) g.add(box(1150, 30, 30, -700, -520 + i * 208, 2270, steel, 'body'));
    g.add(box(400, 420, 80, -620, 230, 1010, MAT.color('#1f2a36'), 'body'));    // siège
    g.add(box(80, 420, 500, -810, 230, 1290, MAT.color('#1f2a36'), 'body'));    // dossier
    g.add(box(200, 300, 250, -300, -300, 1110, dark, 'body'));                // pupitre / commandes
    const wheel = (x, y, r, w) => { const c = cyl(r, w, black, 'body', 18); c.position.set(x * M, y * M, r * M); g.add(c); };
    wheel(-1000, -450, 180, 160);                                             // roue motrice
    // longerons (bras de support) avec galets avant : x ∈ [0, 1250]
    for (const y of [-520, 520]) { g.add(box(1250, 140, 200, 625, y, 120, body, 'body')); wheel(1150, y, 110, 120); }
    // gyrophare + spot bleu de sécurité au sol
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(70 * M, 12, 8), MAT.glow(0xff8c00)); beacon.position.set(-1150 * M, 0, 2390 * M); tag(beacon, 'body'); g.add(beacon);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(220 * M, 20), new THREE.MeshBasicMaterial({ color: 0x2f7dff, transparent: true, opacity: 0.55, depthWrite: false }));
    spot.material.userData.owned = true; spot.position.set(2600 * M, 0, 3 * M); tag(spot, 'body'); g.add(spot);
    // cariste assis (gilet haute visibilité)
    const op = new THREE.Group();
    const torso = box(260, 380, 520, 0, 0, 260, MAT.color('#c8ff00'), 'body'); op.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(105 * M, 14, 10), MAT.color('#f0c8a0')); head.position.z = 640 * M; tag(head, 'body'); op.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(112 * M, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.color('#ffffff')); helmet.position.z = 665 * M; tag(helmet, 'body'); op.add(helmet);
    op.add(box(380, 300, 140, 160, 0, -40, MAT.color('#2c3e50'), 'body'));    // cuisses
    op.add(box(120, 300, 380, 330, 0, -230, MAT.color('#2c3e50'), 'body'));   // jambes
    op.add(box(320, 90, 90, 160, -170, 330, MAT.color('#c8ff00'), 'body'));   // bras vers les commandes
    op.position.set(-600 * M, 230 * M, 1080 * M);
    op.rotation.z = -Math.PI / 2 + 0.25;                                      // assis de côté
    g.add(op);
    // mât rétractable (groupe mobile en X) : deux étages télescopiques
    const mast = new THREE.Group(); mast.position.x = 150 * M; g.add(mast);
    for (const y of [-380, 380]) mast.add(box(90, 120, 2500, 0, y, 1300, steel, 'body'));
    mast.add(box(90, 860, 90, 0, 0, 2500, steel, 'body'));
    const inner = new THREE.Group(); mast.add(inner);
    for (const y of [-300, 300]) inner.add(box(80, 100, 2400, 60, y, 1300, MAT.color('#79838e'), 'body'));
    inner.add(box(80, 680, 80, 60, 0, 2480, MAT.color('#79838e'), 'body'));
    // tablier + fourches
    const car = new THREE.Group(); mast.add(car);
    car.add(box(60, 900, 500, 120, 0, 250, dark, 'body'));
    car.add(box(40, 900, 900, 120, 0, 700, MAT.color('#3a4048'), 'body'));    // dosseret
    for (const y of [-220, 220]) { car.add(box(1150, 120, 45, 150 + 575, y, 22, MAT.color('#3a4048'), 'body')); car.add(box(50, 120, 450, 150, y, 225, MAT.color('#3a4048'), 'body')); }
    const payload = new THREE.Group(); payload.name = 'payload'; payload.position.x = 600 * M; car.add(payload);
    g.userData.truck = { mast, inner, car, payload, beacon };
  };

  /** Visuel d'une palette transportée (centre au sol). */
  C.palletVisual = function (desc) {
    const euro = desc.palletType !== 'perdue', ph = euro ? 144 : 120;
    const W = !euro && desc.palletSize === '1200x1000' ? 1000 : 800;
    if (desc.loaded) return C.buildPallet(euro ? 'euro-load' : 'perdue-load', 1200, W, ph + Math.max(100, desc.loadH || 1000), desc.loadColor || '#b98b52');
    const grp = new THREE.Group();
    const n = C.clamp(Math.round(desc.stack || 1), 1, 30);
    for (let i = 0; i < n; i++) { const pg = C.buildPallet(euro ? 'euro' : 'perdue', 1200, W, ph, null); pg.position.z = i * ph * M; grp.add(pg); }
    return grp;
  };

  /* ---------------- Fléchage au sol ---------------- */
  const paintCache = new Map();
  function paint(color) {
    if (paintCache.has(color)) return paintCache.get(color);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    paintCache.set(color, m);
    return m;
  }
  /** Flèche de sol (pointe vers +X), longueur len, largeur wid (mm). */
  function floorArrow(len, wid) {
    const sh = new THREE.Shape(), l = len * M, w = wid * M, st = w * 0.36;
    sh.moveTo(l / 2, 0); sh.lineTo(l / 2 - l * 0.38, w / 2); sh.lineTo(l / 2 - l * 0.38, st / 2);
    sh.lineTo(-l / 2, st / 2); sh.lineTo(-l / 2, -st / 2); sh.lineTo(l / 2 - l * 0.38, -st / 2); sh.lineTo(l / 2 - l * 0.38, -w / 2); sh.closePath();
    return new THREE.ShapeGeometry(sh);
  }
  builders.lane = (el, m, g) => {
    const p = el.params;
    const path = new C.Path(m.tracks.main.segs, null, false);
    const fr = frames(path, 3, 500);
    const W = p.width, lw = p.lineWidth || 100;
    const mt = paint(p.color || '#f1c40f');
    const add = (geo, mat) => { const mm = new THREE.Mesh(geo, mat); mm.receiveShadow = true; mm.renderOrder = 1; tag(mm, 'lanes'); g.add(mm); return mm; };
    if (p.laneStyle === 'pieton') {
      // zébras perpendiculaires au sens de passage + bordures
      add(sweep(fr, W / 2 - lw, W / 2, 1, 3), mt); add(sweep(fr, -W / 2, -W / 2 + lw, 1, 3), mt);
      const n = Math.max(1, Math.floor(path.length / 500));
      for (let i = 0; i < n; i++) {
        const f = localFrame(path, (i + 0.5) * path.length / n);
        const b = new THREE.Mesh(new THREE.BoxGeometry(250 * M, (W - 2 * lw - 100) * M, 2 * M), paint('#2ecc71'));
        b.position.set(f.p[0] * M, f.p[1] * M, 2 * M); b.rotation.z = Math.atan2(f.t[1], f.t[0]);
        tag(b, 'lanes'); b.receiveShadow = true; g.add(b);
      }
      return;
    }
    // lignes de rive (+ axe en double sens)
    add(sweep(fr, W / 2 - lw, W / 2, 1, 3), mt);
    add(sweep(fr, -W / 2, -W / 2 + lw, 1, 3), mt);
    if (p.twoWay) {
      // ligne axiale discontinue
      const L = path.length, dash = 1000;
      for (let s0 = 0; s0 < L; s0 += dash * 2) {
        const sub = frames(path, 3, 250).filter(f => f.s >= s0 && f.s <= Math.min(L, s0 + dash));
        if (sub.length > 1) add(sweep(sub, -lw / 2, lw / 2, 1, 3), mt);
      }
    }
    // flèches de sens (circulation à droite en double sens)
    const n = Math.max(1, Math.round(path.length / Math.max(1000, p.arrowSpacing || 4000)));
    const aw = Math.min(p.twoWay ? W * 0.32 : W * 0.5, 1100), al = Math.min(1800, aw * 1.8);
    const geo = floorArrow(al, aw);
    for (let i = 0; i < n; i++) {
      const f = localFrame(path, (i + 0.5) * path.length / n);
      const h = Math.atan2(f.t[1], f.t[0]);
      const put = (off, dir) => {
        const a = add(geo, mt);
        a.position.set((f.p[0] + f.n[0] * off) * M, (f.p[1] + f.n[1] * off) * M, 2.5 * M);
        a.rotation.z = h + (dir < 0 ? Math.PI : 0);
      };
      if (p.twoWay) { put(-W / 4, 1); put(W / 4, -1); } else put(0, 1);
    }
  };

  /* ---------------- Barrière et poteau de protection (type Boplan) ---------------- */
  const blackBand = () => MAT.color('#1b1b1b');
  builders.barrier = (el, m, g) => {
    const p = el.params, L = p.length, H = p.height;
    const yel = MAT.color(p.color || '#f5c400');
    const n = Math.max(2, Math.ceil(L / Math.max(500, p.postSpacing || 1500)) + 1);
    for (let i = 0; i < n; i++) {
      const x = C.clamp(L * i / (n - 1), 70, L - 70);
      g.add(box(130, 130, H, x, 0, H / 2, yel, 'body'));
      g.add(box(134, 134, 70, x, 0, H - 110, blackBand(), 'body'));
      g.add(box(134, 134, 70, x, 0, H - 260, blackBand(), 'body'));
      g.add(box(260, 260, 18, x, 0, 9, MAT.color('#2b2b2b'), 'structure'));
    }
    const nr = C.clamp(Math.round(p.rails || 2), 1, 3);
    const zs = nr === 1 ? [H - 80] : nr === 2 ? [H - 80, H * 0.45] : [H - 80, H * 0.6, H * 0.3];
    for (const z of zs) {
      const r = cyl(55, L - 60, yel, 'body', 16);
      r.rotation.z = Math.PI / 2; r.position.set(L / 2 * M, 0, z * M);
      g.add(r);
    }
  };
  builders.bollard = (el, m, g) => {
    const p = el.params, H = p.height, R = (p.diameter || 190) / 2;
    const c = cyl(R, H, MAT.color(p.color || '#f5c400'), 'body', 24); c.rotation.x = Math.PI / 2; c.position.z = H / 2 * M; g.add(c);
    for (const z of [H - 120, H - 300]) { const b = cyl(R + 2, 80, blackBand(), 'body', 24); b.rotation.x = Math.PI / 2; b.position.z = z * M; g.add(b); }
    const top = new THREE.Mesh(new THREE.SphereGeometry(R * M, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.color(p.color || '#f5c400'));
    top.position.z = H * M; top.scale.z = 0.3; tag(top, 'body'); g.add(top);
    const base = cyl(R + 70, 18, MAT.color('#2b2b2b'), 'structure', 24); base.rotation.x = Math.PI / 2; base.position.z = 9 * M; g.add(base);
  };

  /* ---------------- Fermeuse à coiffe ---------------- */
  builders.closer = (el, m, g) => {
    const p = el.params;
    buildConveyor(el, m, g);
    const xs = p.length * C.clamp(+p.stopPos || 0.5, 0.05, 0.95), W = p.width;
    const body = MAT.color(p.color || '#8e44ad'), steel = MAT.color('#c3cad3'), glass = new THREE.MeshStandardMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.18, depthWrite: false });
    glass.userData.owned = true;
    // portique et carter de protection vitré
    for (const dx of [-450, 450]) for (const sy of [1, -1]) g.add(box(80, 80, 1500, xs + dx, sy * (W / 2 + 60), 600, body, 'structure'));
    g.add(box(1000, W + 200, 120, xs, 0, 1360, body, 'structure'));
    for (const sy of [1, -1]) { const gl = box(900, 8, 1150, xs, sy * (W / 2 + 60), 700, glass, 'structure'); gl.castShadow = false; g.add(gl); }
    // magasin de coiffes (pile de coiffes sur le côté)
    const lidC = MAT.color(p.lidColor || '#c8a26b');
    g.add(box(500, 400, 700, xs - 200, W / 2 + 420, 350 - (p.frameH || 160), steel, 'structure'));
    for (let i = 0; i < 10; i++) g.add(box(440, 340, 18, xs - 200, W / 2 + 420, 720 - (p.frameH || 160) + i * 22, lidC, 'structure'));
    // tête de pose (ventouses) animée
    const ap = new THREE.Group();
    ap.add(box(420, 320, 40, 0, 0, 0, MAT.color('#2b2f35'), 'structure'));
    for (const dx of [-120, 120]) for (const dy of [-90, 90]) { const v = cyl(25, 40, MAT.color('#111'), 'structure', 10); v.rotation.x = Math.PI / 2; v.position.set(dx * M, dy * M, -0.03); ap.add(v); }
    ap.add(box(40, 40, 600, 0, 0, 320, steel, 'structure'));
    ap.position.set(xs * M, 0, 1050 * M);
    tag(ap, 'structure'); g.add(ap);
    g.userData.applicator = { obj: ap, axis: 'z', rest: 1050 * M, active: 520 * M };
    g.add(box(40, 40, 100, xs - 600, -(W / 2 + 25), 70, MAT.color('#f1c40f'), 'structure'));      // cellule
  };

  /* ---------------- Poste GTP (goods-to-person) ---------------- */
  builders.gtp = (el, m, g) => {
    const p = el.params, L = p.length;
    for (const id of ['tote', 'ctn']) {
      const path = new C.Path(m.tracks[id].segs, null, false), fr = frames(path, 3);
      const lp = Object.assign({}, p, { color: id === 'tote' ? '#2e86de' : '#c49a62' });
      addSurface(g, path, fr, lp); addFrames(g, fr, lp); addGuides(g, fr, path, lp); addLegs(g, path, lp, el);
      addArrows(g, path, lp, 8); addMotor(g, path, lp);
      // arrêt + pick-to-light au point de présentation
      const f = localFrame(path, L * 0.5);
      const ptl = box(80, p.usefulWidth * 0.8, 60, f.p[0] + 300, f.p[1], 260, MAT.glow(id === 'tote' ? 0x2ecc71 : 0x3498db), 'structure');
      g.add(ptl);
    }
    const side = p.opSide === 'right' ? -1 : 1;
    const yOp = side * (p.lanePitch / 2 + p.width / 2 + 550);
    const zf = floorLocal(el, L / 2, yOp, -200);
    // plateforme / tapis anti-fatigue et opérateur debout face aux deux convoyeurs
    g.add(box(1200, 900, 30, L / 2, yOp, zf + 15, MAT.color('#2c3e50'), 'structure'));
    const op = new THREE.Group();
    const legs = cyl(140, 820, MAT.color('#2c3e50'), 'structure'); legs.rotation.x = Math.PI / 2; legs.position.z = 410 * M; op.add(legs);
    const torso = box(260, 420, 620, 0, 0, 1130, MAT.color('#c8ff00'), 'structure'); op.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(110 * M, 14, 10), MAT.color('#f0c8a0')); head.position.z = 1560 * M; tag(head, 'structure'); op.add(head);
    for (const dy of [-150, 150]) { const arm = box(520, 80, 80, 260, dy, 1240, MAT.color('#c8ff00'), 'structure'); arm.rotation.y = 0.35; op.add(arm); }
    op.position.set(L / 2 * M, yOp * M, zf * M);
    op.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(op);
    // écran de commande et support
    g.add(box(40, 40, 900, L / 2 + 700, side * (p.lanePitch / 2 + p.width / 2 + 150), zf + 450 - 0, MAT.leg(), 'structure'));
    g.add(box(30, 420, 300, L / 2 + 700, side * (p.lanePitch / 2 + p.width / 2 + 150), zf + 1050, MAT.dark(), 'structure'));
    // article en cours de transfert (animé par la simulation)
    const dims = C.Types.defs.gtp.articleDims(p.articleSize);
    const art = box(dims[0], dims[1], dims[2], L / 2, 0, 500, MAT.color('#e74c3c'), 'structure');
    art.visible = false; g.add(art);
    g.userData.gtpArticle = art;
  };

  /* ---------------- Palettes ---------------- */
  /**
   * Palette Europe (9 plots, 3 semelles) ou palette perdue (légère, sans semelles),
   * éventuellement chargée de cartons. Origine : centre au sol (z = 0 dessous).
   * L, W, H : dimensions hors-tout de l'unité de charge (mm).
   */
  const palletCache = new Map();
  C.buildPallet = function (kind, L, W, H, loadColor, forSim) {
    const key = [kind, L, W, H, loadColor].join('|');
    if (palletCache.has(key)) return palletCache.get(key).clone();
    const grp = new THREE.Group();
    const euro = kind.startsWith('euro');
    const loaded = kind.endsWith('-load');
    const ph = loaded ? (euro ? 144 : 120) : H;            // hauteur de la palette seule
    const k = ph / (euro ? 144 : 120);                     // mise à l'échelle verticale
    const wood = euro ? MAT.color('#c9a36b') : MAT.color('#dcc9a0');
    const dark = euro ? MAT.color('#9c7a4a') : MAT.color('#b9a57c');
    const add = (lx, ly, lz, x, y, z, mt) => { const b = box(lx, ly, lz, x, y, z, mt, 'body'); b.castShadow = true; grp.add(b); return b; };
    const xs = [-L / 2 + 0.075 * L, 0, L / 2 - 0.075 * L], ys = [-W / 2 + 0.06 * W, 0, W / 2 - 0.06 * W];
    let z = 0;
    if (euro) { const t = 22 * k; for (const y of ys) add(L, 0.12 * W, t, 0, y, z + t / 2, wood); z += t; }    // semelles
    const bh = (euro ? 78 : 84) * k;
    for (const x of xs) for (const y of ys) add(0.12 * L, 0.12 * W, bh, x, y, z + bh / 2, dark);            // plots
    z += bh;
    const st = (euro ? 22 : 16) * k;
    for (const x of xs) add(0.12 * L, W, st, x, 0, z + st / 2, wood);                                     // traverses
    z += st;
    const tt = ph - z, nb = euro ? 5 : 4;
    for (let i = 0; i < nb; i++) add(L, (euro ? 0.13 : 0.11) * W, tt, 0, -W / 2 + 0.065 * W + i * (W - 0.13 * W) / (nb - 1), z + tt / 2, wood); // planches
    if (loaded && H > ph + 20) {
      // cartons en couches (environ 400 × 300 × 250 mm)
      const nx = Math.max(1, Math.round(L / 400)), ny = Math.max(1, Math.round(W / 300)), lh = H - ph;
      const nz = Math.max(1, Math.round(lh / 250)), cl = L / nx, cw = W / ny, ch = lh / nz;
      const mt = C.cartonMaterial ? C.cartonMaterial(loadColor || '#b98b52') : MAT.color(loadColor || '#b98b52');
      for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) for (let c = 0; c < nz; c++) {
        const bx = add(cl - 8, cw - 8, ch - 6, -L / 2 + (a + 0.5) * cl, -W / 2 + (b + 0.5) * cw, ph + (c + 0.5) * ch, mt);
        bx.userData.loadPart = true;
      }
      // film étirable
      const film = new THREE.MeshStandardMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.18, roughness: 0.2, depthWrite: false });
      add(L + 6, W + 6, lh * 0.85, 0, 0, ph + lh * 0.45, film).castShadow = false;
    } else if (!loaded) grp.children.forEach(b => { b.userData.loadPart = true; });
    palletCache.set(key, grp);
    void forSim;
    return grp.clone();
  };

  builders.pallet = (el, m, g) => {
    const p = el.params;
    const euro = p.palletType !== 'perdue';
    const L = 1200, W = euro ? 800 : (p.palletSize === '1200x1000' ? 1000 : 800);
    if (p.loaded) {
      const ph = euro ? 144 : 120;
      g.add(C.buildPallet(euro ? 'euro-load' : 'perdue-load', L, W, ph + Math.max(100, p.loadH), p.loadColor));
    } else {
      const n = C.clamp(Math.round(p.stack || 1), 1, 30), ph = euro ? 144 : 120;
      for (let i = 0; i < n; i++) { const pg = C.buildPallet(euro ? 'euro' : 'perdue', L, W, ph, null); pg.position.z = i * ph * M; g.add(pg); }
    }
  };

  builders.guide = (el, m, g) => {
    const p = el.params;
    g.add(box(p.length, p.thickness, p.height, p.length / 2, 0, p.height / 2, MAT.guide(), 'body'));
    const n = Math.max(2, Math.ceil(p.length / 1000) + 1);
    for (let i = 0; i < n; i++) {
      const x = C.clamp(p.length * i / (n - 1), 20, p.length - 20);
      const h = -floorLocal(el, x, 0, 0);
      if (h > 20) g.add(box(30, 30, h, x, 0, -h / 2, MAT.leg(), 'structure'));
    }
  };

  /**
   * Construit le groupe 3D d'un élément. Le groupe est positionné et orienté
   * dans la scène (Z vers le haut, mètres).
   */
  C.buildElementMesh = function (el) {
    const def = C.Types.get(el.type);
    const g = new THREE.Group();
    g.name = el.name;
    const model = C.Types.model(el);
    try {
      (builders[el.type] || builders.straight)(el, model, g);
    } catch (e) { console.error('Construction 3D', el.type, e); }
    g.position.set(el.x * M, el.y * M, el.z * M);
    g.rotation.z = (el.rot || 0) * C.DEG;
    g.userData.elementId = el.id;
    g.userData.def = def;
    g.traverse(o => { if (o !== g) o.userData.elementId = el.id; });
    return g;
  };

  C.geo = { frames, sweep, localFrame, box, M };
})(window.C3D);
