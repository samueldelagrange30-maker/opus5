/* =====================================================================
 * Convoy3D — Moteur de simulation des cartons
 *
 * Principe : chaque carton est repéré par (trajectoire, abscisse s en mm).
 * À chaque pas de temps (1/60 s simulée) :
 *   1. les entrées génèrent des cartons selon leur cadence ;
 *   2. chaque carton calcule sa limite d'avance : carton précédent + espacement,
 *      fin de ligne, butées, séparateurs, zones d'accumulation (ZPA),
 *      postes de travail, obstacles, capacité (élévateur, table tournante),
 *      fenêtre de fusion sur les jonctions, collisions avec d'autres cartons ;
 *   3. il avance à la vitesse du convoyeur (ou selon la gravité pour les
 *      rouleaux libres) puis franchit éventuellement les liaisons ;
 *   4. les statistiques (débit, attente, saturation, blocages) sont mises à jour.
 * ===================================================================== */
(function (C) {
  'use strict';
  const M = 0.001;
  const G = 9.81;
  const DT = 1 / 60;

  /* ------------------------- maillage des cartons ------------------------- */
  let cartonTex = null, cartonGeo = null;
  const cartonMats = new Map();
  function cartonTexture() {
    if (cartonTex) return cartonTex;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 128, 4); g.fillRect(0, 124, 128, 4); g.fillRect(0, 0, 4, 128); g.fillRect(124, 0, 4, 128);
    g.fillStyle = 'rgba(255,240,200,0.55)'; g.fillRect(0, 54, 128, 20);   // ruban adhésif
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(14, 14, 30, 18);           // étiquette
    cartonTex = new THREE.CanvasTexture(cv);
    cartonTex.colorSpace = THREE.SRGBColorSpace;
    return cartonTex;
  }
  C.cartonMaterial = function (color) {
    if (cartonMats.has(color)) return cartonMats.get(color);
    const m = new THREE.MeshStandardMaterial({ color, map: cartonTexture(), roughness: 0.85, metalness: 0 });
    cartonMats.set(color, m);
    return m;
  };
  /* ----------------------- carton ouvert (rabats) ----------------------- */
  const flatGeo = new THREE.BoxGeometry(1, 1, 1);
  /** Carton ouvert : fond, 4 parois, 4 rabats relevés ; groupe centré (mètres). */
  C.makeOpenCarton = function (spec) {
    const L = spec.L, W = spec.W, H = spec.H, t = 5;
    const mat = C.cartonMaterial(spec.color || '#c8a26b');
    const inner = C.cartonMaterial('#8a6a40');
    const grp = new THREE.Group();
    const add = (lx, ly, lz, x, y, z, m) => {
      const b = new THREE.Mesh(flatGeo, m); b.scale.set(lx * M, ly * M, lz * M); b.position.set(x * M, y * M, z * M);
      b.castShadow = true; b.receiveShadow = true; b.userData.loadPart = true; grp.add(b); return b;
    };
    add(L, W, t, 0, 0, -H / 2 + t / 2, inner);
    add(L, t, H, 0, W / 2 - t / 2, 0, mat); add(L, t, H, 0, -W / 2 + t / 2, 0, mat);
    add(t, W, H, L / 2 - t / 2, 0, 0, mat); add(t, W, H, -L / 2 + t / 2, 0, 0, mat);
    // rabats relevés et légèrement ouverts vers l'extérieur
    const flaps = new THREE.Group(); flaps.name = 'flaps';
    const flap = (len, hgt, x, y, rotAxis, ang) => {
      const pv = new THREE.Group(); pv.position.set(x * M, y * M, H / 2 * M);
      const b = new THREE.Mesh(flatGeo, mat);
      if (rotAxis === 'x') b.scale.set(len * M, t * M, hgt * M); else b.scale.set(t * M, len * M, hgt * M);
      b.position.z = hgt / 2 * M; b.castShadow = true; b.userData.loadPart = true;
      pv.add(b); pv.rotation[rotAxis] = ang; flaps.add(pv);
    };
    flap(L, W / 2, 0, W / 2, 'x', -0.45); flap(L, W / 2, 0, -W / 2, 'x', 0.45);
    flap(W, W / 2 * 0.9, L / 2, 0, 'y', 0.5); flap(W, W / 2 * 0.9, -L / 2, 0, 'y', -0.5);
    grp.add(flaps);
    const items = new THREE.Group(); items.name = 'items'; grp.add(items);
    grp.userData.isOpenCarton = true;
    return grp;
  };
  /** Ajoute n articles visibles dans un carton ouvert (rangés en couches). */
  const ARTICLE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];
  C.addArticles = function (c, n, dims) {
    c.items = (c.items || 0) + n;
    const g = c.mesh, items = g && g.getObjectByName && g.getObjectByName('items');
    if (!items) return;
    const [al, aw, ah] = dims || [180, 120, 90];
    const sp = c.spec, nx = Math.max(1, Math.floor((sp.L - 20) / (al + 10))), ny = Math.max(1, Math.floor((sp.W - 20) / (aw + 10)));
    for (let k = items.children.length; k < c.items; k++) {
      const layer = Math.floor(k / (nx * ny)), idx = k % (nx * ny), i = idx % nx, j = Math.floor(idx / nx);
      const z = -sp.H / 2 + 8 + ah / 2 + layer * (ah + 4);
      if (z + ah / 2 > sp.H / 2 - 5) break;              // carton plein visuellement
      const b = new THREE.Mesh(flatGeo, C.cartonMaterial(ARTICLE_COLORS[(k * 7 + c.id.length) % ARTICLE_COLORS.length]));
      b.scale.set(al * M, aw * M, ah * M);
      b.position.set((-sp.L / 2 + 10 + (i + 0.5) * (sp.L - 20) / nx) * M, (-sp.W / 2 + 10 + (j + 0.5) * (sp.W - 20) / ny) * M, z * M);
      b.castShadow = true;
      items.add(b);
    }
  };
  /** Fermeture : coiffe en carton ajustée au format, ou rabats repliés + adhésif. */
  C.closeCarton = function (c, mode, skirt, color) {
    c.open = false; c.closedBy = mode;
    const g = c.mesh;
    if (!g || !g.isGroup) return;
    const fl = g.getObjectByName('flaps'); if (fl) fl.visible = false;
    const sp = c.spec;
    if (mode === 'tape') {
      const top = new THREE.Mesh(flatGeo, C.cartonMaterial(sp.color)); top.scale.set(sp.L * M, sp.W * M, 6 * M); top.position.z = (sp.H / 2 - 3) * M; g.add(top);
      const tape = new THREE.Mesh(flatGeo, C.cartonMaterial('#d9cfa8')); tape.scale.set((sp.L + 4) * M, 50 * M, 7 * M); tape.position.z = (sp.H / 2 - 2.5) * M; g.add(tape);
    } else {
      const sk = C.clamp(skirt || 80, 20, sp.H), e = 8;
      const lid = new THREE.Group(); lid.name = 'lid';
      const lm = C.cartonMaterial(color || '#c8a26b');
      const part = (lx, ly, lz, x, y, z) => { const b = new THREE.Mesh(flatGeo, lm); b.scale.set(lx * M, ly * M, lz * M); b.position.set(x * M, y * M, z * M); b.castShadow = true; lid.add(b); };
      part(sp.L + 2 * e, sp.W + 2 * e, 6, 0, 0, sp.H / 2 + 3);
      part(sp.L + 2 * e, 5, sk, 0, sp.W / 2 + e - 2.5, sp.H / 2 - sk / 2 + 6); part(sp.L + 2 * e, 5, sk, 0, -sp.W / 2 - e + 2.5, sp.H / 2 - sk / 2 + 6);
      part(5, sp.W + 2 * e, sk, sp.L / 2 + e - 2.5, 0, sp.H / 2 - sk / 2 + 6); part(5, sp.W + 2 * e, sk, -sp.L / 2 - e + 2.5, 0, sp.H / 2 - sk / 2 + 6);
      g.add(lid);
    }
  };

  C.makeCartonMesh = function (spec) {
    if (spec.kind === 'open') return C.makeOpenCarton(spec);
    if (spec.kind && spec.kind !== 'box' && C.buildPallet) {
      // palette (vide ou chargée) : groupe centré (origine au centre de l'unité de charge)
      const outer = new THREE.Group();
      const inner = C.buildPallet(spec.kind, spec.L, spec.W, spec.H, spec.color, true);
      inner.position.z = -spec.H / 2 * M;
      outer.add(inner);
      outer.userData.isPallet = true;
      return outer;
    }
    if (!cartonGeo) cartonGeo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Mesh(cartonGeo, C.cartonMaterial(spec.color || '#b98b52'));
    m.scale.set(spec.L * M, spec.W * M, spec.H * M);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  const AX = new THREE.Vector3(0, 0, 1), AY = new THREE.Vector3(0, 1, 0);
  /** Pose un maillage de carton : cap h, tangage pitch, lacet absolu yaw. */
  function poseMesh(mesh, p, h, pitch, yaw, H) {
    const up = [-Math.sin(pitch) * Math.cos(h), -Math.sin(pitch) * Math.sin(h), Math.cos(pitch)];
    mesh.position.set((p[0] + up[0] * (H / 2 + 1)) * M, (p[1] + up[1] * (H / 2 + 1)) * M, (p[2] + up[2] * (H / 2 + 1)) * M);
    _q1.setFromAxisAngle(AX, h); _q2.setFromAxisAngle(AY, -pitch); _q3.setFromAxisAngle(AX, yaw - h);
    mesh.quaternion.copy(_q1).multiply(_q2).multiply(_q3);
  }
  /** Pose statique (cartons posés en conception). */
  C.poseCarton = function (mesh, tr, s, spec, yawOff) {
    const r = tr.path.at(s);
    const hz = Math.hypot(r.t[0], r.t[1]);
    const h = hz > 1e-3 ? Math.atan2(r.t[1], r.t[0]) : 0;
    const pitch = hz > 0.3 ? Math.asin(C.clamp(r.t[2], -1, 1)) : 0;
    poseMesh(mesh, r.p, h, pitch, h + (yawOff || 0), spec.H);
  };

  const lenAlong = (spec, rel) => Math.abs(Math.cos(rel)) * spec.L + Math.abs(Math.sin(rel)) * spec.W;
  const lerpAngle = (a, b, t) => a + C.normAngle(b - a) * t;
  const snap90 = a => { const k = Math.round(a / (Math.PI / 2)); return Math.abs(a - k * Math.PI / 2) < 4 * C.DEG ? k * Math.PI / 2 : a; };

  /** Rectangles orientés en plan : recouvrement (théorème de l'axe séparateur). */
  function obbOverlap(a, b) {
    const axes = [[Math.cos(a.yaw), Math.sin(a.yaw)], [-Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), Math.sin(b.yaw)], [-Math.sin(b.yaw), Math.cos(b.yaw)]];
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const ax of axes) {
      const proj = o => Math.abs(o.hl * (Math.cos(o.yaw) * ax[0] + Math.sin(o.yaw) * ax[1])) + Math.abs(o.hw * (-Math.sin(o.yaw) * ax[0] + Math.cos(o.yaw) * ax[1]));
      if (Math.abs(dx * ax[0] + dy * ax[1]) > proj(a) + proj(b)) return false;
    }
    return true;
  }

  /** Abscisse d'arrêt (présentation à l'opérateur) sur une voie du poste GTP. */
  const gtpStop = (el, tr) => C.Types.defs.gtp.stops(el.params)[tr.id] || tr.length * 0.5;
  /** Le carton doit-il s'arrêter au poste de cet élément ? */
  const isStation = (el, c) => el.type === 'workstation' || (el.type === 'labeler' && el.params.labelMode !== 'fly') || (el.type === 'closer' && (!c || c.open));

  /** Autocollant d'étiquette (code-barres) sur une face du colis. */
  let stickerMat = null, stickerGeo = null;
  C.addLabelSticker = function (mesh, spec, side) {
    if (!stickerMat) {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96;
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 96);
      g.fillStyle = '#111'; for (let x = 6; x < 58; x += 2 + (x * 7) % 3) g.fillRect(x, 40, 1 + (x % 2), 34);
      g.fillRect(6, 10, 40, 5); g.fillRect(6, 20, 28, 4); g.fillRect(6, 80, 46, 4);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      stickerMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      stickerGeo = new THREE.BoxGeometry(1, 1, 1);
    }
    const lw = Math.min(100, spec.L * 0.6), lh = Math.min(150, spec.W * 0.6, spec.H * 0.8);
    const st = new THREE.Mesh(stickerGeo, stickerMat);
    const pallet = mesh.isGroup;
    // un cube unitaire est mis à l'échelle (L,W,H) pour les cartons ; pour une palette on travaille en mètres
    const sx = v => pallet ? v * M : v / spec.L, sy = v => pallet ? v * M : v / spec.W, sz = v => pallet ? v * M : v / spec.H;
    const ex = pallet ? spec.L / 2 * M : 0.5, ey = pallet ? spec.W / 2 * M : 0.5, ez = pallet ? spec.H / 2 * M : 0.5;
    if (side === 'left' || side === 'right') { st.scale.set(sx(lw), sy(2), sz(lh)); st.position.set(0, (side === 'left' ? 1 : -1) * (ey + sy(1)), 0); }
    else if (side === 'front') { st.scale.set(sx(2), sy(lw), sz(lh)); st.position.set(ex + sx(1), 0, 0); }
    else { st.scale.set(sx(lw), sy(lh), sz(2)); st.position.set(0, 0, ez + sz(1)); }
    st.userData.sticker = true;
    mesh.add(st);
  };

  /* ------------------------- règles d'aiguillage -------------------------- */
  function parseRules(text) {
    const rules = [];
    String(text || '').split(/\n|;/).forEach(line => {
      const m = line.match(/^\s*(\d+)\s*[:=>-]+\s*(.+)$/);
      if (!m) return;
      const out = +m[1];
      const conds = m[2].split(/&|\bet\b/i).map(s => s.trim()).filter(Boolean).map(s => {
        if (s === '*') return { any: true };
        const c = s.match(/^([a-zéèA-Z_]+)\s*(>=|<=|!=|=|>|<|:)\s*(.+)$/);
        if (!c) return { any: false, bad: true };
        return { key: c[1].toLowerCase(), op: c[2] === ':' ? '=' : c[2], val: c[3].trim() };
      });
      rules.push({ out, conds });
    });
    return rules;
  }
  function matchCond(cd, c) {
    if (cd.any) return true;
    if (cd.bad) return false;
    const sp = c.spec;
    const map = {
      ref: sp.ref, reference: sp.ref, format: sp.formatName, nom: sp.name, name: sp.name,
      poids: sp.weight, weight: sp.weight, masse: sp.weight, couleur: sp.color, color: sp.color,
      source: c.source, entree: c.source, etiquette: c.label || '', etiquete: c.label ? 1 : 0, label: c.label || '', articles: c.items || 0, ouvert: c.open ? 1 : 0, ferme: c.open ? 0 : 1, l: sp.L, longueur: sp.L, w: sp.W, largeur: sp.W, h: sp.H, hauteur: sp.H
    };
    const v = map[cd.key];
    if (v === undefined) return false;
    const num = parseFloat(cd.val);
    if (cd.op === '=' || cd.op === '!=') {
      const ok = typeof v === 'number' ? Math.abs(v - num) < 1e-6 : String(v).toLowerCase().includes(cd.val.toLowerCase().replace(/\*/g, ''));
      return cd.op === '=' ? ok : !ok;
    }
    const x = +v;
    if (!isFinite(x) || !isFinite(num)) return false;
    return cd.op === '>' ? x > num : cd.op === '<' ? x < num : cd.op === '>=' ? x >= num : x <= num;
  }

  /* ============================ Simulation ============================== */
  class Simulation extends C.Emitter {
    constructor(app) {
      super();
      this.app = app;
      this.active = false; this.running = false;
      this.speed = 1; this.t = 0; this.acc = 0;
      this.cartons = [];
      this.colorMode = 'format';
      this.heatMode = false;
    }

    get net() { return this.app.network; }

    /** Initialise l'état de simulation (t = 0). */
    init() {
      const app = this.app;
      app.rebuildNetwork();
      const net = this.net;
      this.clearMeshes();
      this.t = 0; this.acc = 0;
      this.cartons = [];
      this.nextId = 1;
      this.rng = new C.RNG(20240607);
      this.stats = { created: 0, processed: 0, travelSum: 0, waitSum: 0, conflicts: 0, collisions: 0, spawnBlocked: 0, doneTimes: [], history: [], lastHist: -1 };
      this.sources = [];
      this.sourceIndex = new Map();
      this.formats = app.project.formats;
      let maxH = 0;
      for (const f of this.formats) maxH = Math.max(maxH, f.H);
      for (const c of app.project.cartons) maxH = Math.max(maxH, app.project.cartonSpec(c).H);
      net.computeBlocks(maxH || 400);
      for (const tr of net.tracks) tr.cartons = [];
      for (const node of net.nodes.values()) {
        node.rt = { occ: 0, cooldownUntil: 0, lastRelease: -1e9, passId: null, holdId: null, holdStart: 0, rr: 0, passed: 0, entered: 0, occInt: 0, blockedTime: 0, maxQ: 0, blockedNow: 0, angle: 0, angleTarget: 0, carZ: 0, spawned: 0, nextSpawn: 0, occNow: 0 };
        if (node.el.type === 'source' || node.el.type === 'osr') {
          node.rt.nextSpawn = +node.el.params.startDelay || 0;
          this.sourceIndex.set(node.el.id, this.sources.length);
          this.sources.push(node);
        }
        if (node.el.type === 'osr') {
          const n = C.clamp(Math.round(node.el.params.towers), 1, 30), per = 3600 / Math.max(1, +node.el.params.towerRate || 300);
          node.rt.towerNext = Array.from({ length: n }, (_, i) => node.rt.nextSpawn + per * i / n);
          node.rt.stored = 0;
        }
        if (node.def.routing) node.rules = parseRules(node.el.params.rules);
      }
      // cartons posés manuellement
      for (const pc of app.project.cartons) {
        const tr = net.track(pc.elementId + ':' + (pc.track || 'main')) || net.mainTrack(pc.elementId);
        if (!tr) continue;
        const spec = app.project.cartonSpec(pc);
        this.spawn(tr, C.clamp(pc.s, 0, tr.length), spec, (spec.orientation || 0) * C.DEG, 'Posé', pc.id);
      }
      this.active = true;
      this.updateVisuals();
      this.emit('state');
    }

    /* ----------------------------- commandes ----------------------------- */
    play() { if (!this.active) this.init(); this.running = true; this.emit('state'); }
    pause() { this.running = false; this.emit('state'); }
    toggle() { if (this.running) this.pause(); else this.play(); }
    stop() {
      this.running = false; this.active = false;
      this.clearMeshes();
      if (this.net) for (const tr of this.net.tracks) tr.cartons = [];
      this.restoreHeat();
      this.app.viewport.rebuildDesignCartons();
      this.resetEquipVisuals();
      this.emit('state');
    }
    rewind() { const was = this.running; this.stop(); this.init(); this.running = was; this.emit('state'); }
    setSpeed(x) { this.speed = x; this.emit('state'); }

    clearMeshes() {
      for (const c of this.cartons) if (c.mesh) this.app.viewport.gCartons.remove(c.mesh);
      const vp = this.app.viewport;
      for (const m of vp.cartonMeshes.values()) vp.gCartons.remove(m);
      vp.cartonMeshes.clear();
    }
    meshById(id) { const c = this.cartons.find(x => x.id === id); return c ? c.mesh : null; }
    cartonById(id) { return this.cartons.find(x => x.id === id); }

    /* ------------------------------ cartons ------------------------------ */
    spawn(tr, s, spec, yawOff, source, designId) {
      const r = tr.path.at(s);
      const h = Math.atan2(r.t[1], r.t[0]);
      const c = {
        id: 'c' + (this.nextId++), spec, source: source || '', designId,
        track: null, node: null, s, v: 0, yaw: h + yawOff, yawOff, heading: h, pitch: 0,
        half: lenAlong(spec, yawOff) / 2, state: 'moving', reason: '', born: this.t, wait: 0, process: 0,
        vmax: spec.speed || 0, done: {}, route: null, entering: null, path: [], open: spec.kind === 'open', items: 0
      };
      c.mesh = C.makeCartonMesh(spec);
      c.mesh.userData.simCarton = c.id;
      this.app.viewport.gCartons.add(c.mesh);
      this.enterTrack(c, tr, s);
      this.enterNode(c, tr.node);
      this.cartons.push(c);
      this.stats.created++;
      this.emit('spawn', c);
      return c;
    }
    removeCarton(c, processed) {
      c.removed = true;
      if (c.track) c.track.cartons.splice(c.track.cartons.indexOf(c), 1);
      if (c.node) this.leaveNode(c, c.node);
      this.cartons.splice(this.cartons.indexOf(c), 1);
      if (c.mesh) this.app.viewport.gCartons.remove(c.mesh);
      if (processed) {
        const st = this.stats;
        st.processed++; st.travelSum += this.t - c.born; st.waitSum += c.wait;
        st.doneTimes.push(this.t);
        if (st.doneTimes.length > 5000) st.doneTimes.splice(0, 1000);
      }
      this.app.cartonSelection.delete(c.id);
    }

    enterTrack(c, tr, s) {
      if (c.track) { const i = c.track.cartons.indexOf(c); if (i >= 0) c.track.cartons.splice(i, 1); }
      c.track = tr; c.s = s;
      tr.cartons.push(c);
      c.turnDone = false;
      const r = tr.path.at(s);
      const hz = Math.hypot(r.t[0], r.t[1]);
      const h = hz > 1e-3 ? Math.atan2(r.t[1], r.t[0]) : c.heading;
      if (tr.yawMode === 'tangent') {
        c.yawOff = snap90(C.normAngle(c.yaw - h));
      } else if (tr.yawMode === 'blend') {
        c.blendFrom = c.yaw;
        const re = tr.path.at(tr.length);
        const he = Math.atan2(re.t[1], re.t[0]);
        const rel = snap90(C.normAngle(c.yaw - h));
        c.blendTo = he + rel; c.yawOff = rel;
      }
      const rel = C.normAngle(c.yaw - h);
      if (hz > 1e-3) c.half = lenAlong(c.spec, tr.yawMode === 'blend' ? c.yawOff : rel) / 2;
    }
    enterNode(c, node) {
      if (c.node === node) return;
      c.node = node; c.entering = null;
      const rt = node.rt;
      rt.entered++;
      c.route = null;
      if (node.def.routing) c.route = this.chooseRoute(c, node);
      c.path.push(node.el.name);
      if (c.path.length > 60) c.path.shift();
    }
    leaveNode(c, node) {
      const rt = node.rt, p = node.el.params;
      rt.passed++;
      if (node.el.type === 'elevator') rt.cooldownUntil = this.t + Math.abs(p.elevH) / 1000 / Math.max(0.05, p.liftSpeed);
      if (node.el.type === 'turntable') {
        rt.cooldownUntil = this.t + Math.abs(rt.angle) / C.DEG / Math.max(5, p.rotSpeed);
        rt.angleTarget = 0;
      }
      if (rt.passId === c.id) rt.passId = null;
      if (rt.holdId === c.id) rt.holdId = null;
      if (c.node === node) c.node = null;
    }

    /* --------------------------- aiguillages --------------------------- */
    chooseRoute(c, node) {
      const el = node.el, p = el.params, rt = node.rt;
      const main = node.tracks.main;
      const outs = [];
      if (main && main.endLink) outs.push({ k: 0, dv: null });
      for (const dv of node.diverts) {
        if (!dv.to.endLink) continue;
        if (dv.track === c.track && dv.s < c.s + 1) continue; // déjà dépassé
        outs.push({ k: dv.out, dv });
      }
      if (!outs.length) {
        // aucune sortie raccordée : table tournante → 1re sortie, sinon tout droit
        if (el.type === 'turntable' && node.diverts.length) return node.diverts[0];
        return null;
      }
      let pick = null;
      const mode = p.mode || 'cyclic';
      if (mode === 'cyclic') { pick = outs[rt.rr % outs.length]; rt.rr++; }
      else if (mode === 'random') pick = outs[Math.floor(this.rng.next() * outs.length)];
      else if (mode === 'rules') {
        for (const r of node.rules || []) {
          if (r.conds.every(cd => matchCond(cd, c))) { const o = outs.find(x => x.k === r.out); if (o) { pick = o; break; } }
        }
        if (!pick) pick = outs.find(o => o.k === 0) || outs[0];
      } else pick = outs.find(o => o.k === 0) || outs[0];
      return pick.dv;
    }

    /** Sortie de la trajectoire courante : abscisse et liaison suivante. */
    exitOf(c) {
      const tr = c.track;
      if (c.route && c.route.track === tr) return { exitS: c.route.s, next: { track: c.route.to, s0: 0, turn: c.route.turn } };
      return { exitS: tr.length, next: tr.endLink };
    }

    gapOf(tr) { return Math.max(0, +tr.el.params.gap || 0); }

    /** Premier carton présent sur une trajectoire à partir de s0 (le plus en amont). */
    firstFrom(tr, s0, except) {
      let best = null;
      for (const o of tr.cartons) {
        if (o === except) continue;
        if (o.s + o.half < s0) continue;
        if (!best || o.s < best.s) best = o;
      }
      return best;
    }

    /** Autorisation de sortie de l'élément courant (butées, séparateurs). */
    exitGate(c, tr) {
      const node = tr.node, el = node.el, p = el.params, rt = node.rt;
      if (tr.id !== 'main') return true;
      if (el.type === 'stop') {
        const mode = p.stopMode;
        if (mode === 'open') return true;
        if (mode === 'closed') return false;
        if (mode === 'cycle') { const per = (+p.openTime || 1) + (+p.closedTime || 1); return (this.t % per) < (+p.openTime || 1); }
        // temporisée
        if (rt.passId === c.id) return true;
        if (rt.holdId !== c.id) { rt.holdId = c.id; rt.holdStart = this.t; }
        if (this.t - rt.holdStart >= (+p.holdTime || 0)) { rt.passId = c.id; return true; }
        return false;
      }
      if (el.type === 'separator') {
        if (rt.passId === c.id) return true;
        if (this.t - rt.lastRelease >= (+p.interval || 0)) { rt.passId = c.id; rt.lastRelease = this.t; return true; }
        return false;
      }
      return true;
    }

    /** Autorisation d'entrée dans l'élément suivant (capacité, fusion). */
    entryGate(c, cur, next) {
      const nt = next.track, nn = nt.node;
      if (nn === cur.node && !nt.isBridge) return true;
      const rt = nn.rt;
      const cap = nn.def.capacity;
      if (cap) {
        if (c.entering === nn) return true;
        if (rt.occ >= cap || this.t < rt.cooldownUntil) return false;
      }
      if (nt.isBridge) {
        if (nt.cartons.some(o => o !== c)) return false;
        const target = nt.target, sj = nt.sJoin;
        const v = Math.max(0.05, +target.el.params.speed || 0.3) * 1000;
        const gap = this.gapOf(target);
        const lookBack = c.half * 2 + gap + v * ((nt.length + c.half * 2) / v);
        for (const o of target.cartons) {
          if (o.s + o.half > sj - c.half - lookBack * 0.6 - gap && o.s - o.half < sj + c.half + gap) return false;
        }
        for (const b of target.bridges) {
          if (b === nt) continue;
          if (Math.abs(b.sJoin - sj) < c.half * 2 + 200 && b.cartons.length) return false;
        }
      }
      if (cap) { c.entering = nn; rt.occ++; }
      return true;
    }

    /** Limite d'avance (abscisse maxi du centre) sur la trajectoire courante. */
    computeLimit(c, want) {
      const tr = c.track, el = tr.el, p = el.params, half = c.half;
      const gap = this.gapOf(tr);
      let lim = Infinity;
      c.reason = '';
      // carton précédent sur la même trajectoire
      let ahead = null;
      for (const o of tr.cartons) if (o !== c && o.s >= c.s && (!ahead || o.s < ahead.s)) ahead = o;
      if (ahead) { const l = ahead.s - ahead.half - half - gap; if (l < lim) { lim = l; c.reason = 'accumulation'; } }
      // cartons en cours de fusion (réservation du point de jonction)
      for (const b of tr.bridges) for (const o of b.cartons) {
        if (b.sJoin >= c.s - 1) { const l = b.sJoin - o.half - half - gap; if (l < lim) { lim = l; c.reason = 'priorité jonction'; } }
      }
      // obstacles
      for (const bs of tr.blocks) if (bs > c.s + half - 30) { const l = bs - half - 10; if (l < lim) { lim = l; c.reason = 'obstacle'; } break; }
      // poste de préparation / étiqueteuse / fermeuse avec arrêt
      if (isStation(el, c) && tr.id === 'main' && !c.done[el.id]) {
        const ss = tr.length * C.clamp(+p.stopPos || 0.5, 0.05, 0.95);
        if (c.s <= ss + 0.5 && ss < lim) { lim = ss; c.reason = el.type === 'labeler' ? 'étiquetage' : el.type === 'closer' ? 'fermeture' : 'poste'; }
      }
      // poste GTP : bac et carton s'arrêtent face à l'opérateur jusqu'à la fin du transfert
      if (el.type === 'gtp' && !c.done[el.id]) {
        const ss = gtpStop(el, tr);
        if (c.s <= ss + 0.5 && ss < lim) { lim = ss; c.reason = tr.id === 'tote' ? 'bac au poste GTP' : 'carton au poste GTP'; }
      }
      // zones d'accumulation sans pression
      if (el.type === 'accumulation' && tr.id === 'main') {
        const nz = Math.max(1, Math.floor(tr.length / Math.max(100, +p.zoneLength || 600)));
        const Z = tr.length / nz;
        const front = c.s + half;
        const j = Math.floor((front - 0.5) / Z);
        const b = (j + 1) * Z;
        if (b < tr.length - 1) {
          const occ = tr.cartons.some(o => o !== c && o.s > c.s && o.s - o.half < b + Z && o.s + o.half > b);
          if (occ && b - half < lim) { lim = b - half; c.reason = 'zone occupée'; }
        }
      }
      // sortie
      const { exitS, next } = this.exitOf(c);
      const stopAt = tr.endMode === 'center' ? exitS : exitS - half;
      if (!next) {
        if (stopAt < lim) { lim = stopAt; if (el.type !== 'sink') c.reason = 'fin de ligne'; }
        return lim;
      }
      if (next.turn && !c.turnDone) { if (exitS < lim) lim = exitS; return lim; }
      const committed = c.s > stopAt + 0.5;
      const near = c.s + want >= stopAt - 0.5;
      if (!near && !committed) { if (stopAt < lim) lim = stopAt; return lim; }
      if (!committed) {
        if (!this.exitGate(c, tr)) { if (stopAt < lim) { lim = stopAt; c.reason = el.type === 'stop' ? 'butée' : 'séparateur'; } return lim; }
        if (!this.entryGate(c, tr, next)) { if (stopAt < lim) { lim = stopAt; c.reason = next.track.isBridge ? 'attente jonction' : 'élément occupé'; } return lim; }
      }
      // anticipation sur la trajectoire suivante
      const nt = next.track;
      const f = this.firstFrom(nt, next.s0, c);
      if (f) {
        const l = exitS + (f.s - f.half - next.s0) - half - this.gapOf(nt);
        if (l < lim) { lim = l; c.reason = 'accumulation'; }
      }
      if (nt.blocks.length && nt.blocks[0] - next.s0 < half + 40) {
        const l = exitS + nt.blocks[0] - next.s0 - half - 10;
        if (l < lim) { lim = l; c.reason = 'obstacle'; }
      }
      return lim;
    }

    /** Vitesse du carton (m/s) selon la technologie du convoyeur. */
    speedOf(c, dt) {
      const tr = c.track, p = tr.el.params;
      if (p.running === false) return 0;
      let v;
      if (tr.lift && c.s >= tr.lift[0] - 1 && c.s <= tr.lift[1] + 1) v = +p.liftSpeed || 0.5;
      else if (p.surface === 'freerollers' && !tr.lift) {
        const r = tr.path.at(c.s);
        const sinDown = -r.t[2];
        const a = G * (sinDown - 0.015);
        c.v = C.clamp((c.v || 0) + a * dt, 0, Math.max(0.05, +p.speed || 1));
        if (sinDown > -0.005 && c.v < (+p.vmin || 0)) c.v = +p.vmin || 0;
        v = c.v;
      } else v = Math.max(0, +p.speed || 0);
      if (c.vmax > 0) v = Math.min(v, c.vmax);
      return v;
    }

    /** Pose monde d'un carton (pour collisions et affichage). */
    poseOf(c, s) {
      const r = c.track.path.at(s);
      const hz = Math.hypot(r.t[0], r.t[1]);
      const h = hz > 1e-3 ? Math.atan2(r.t[1], r.t[0]) : c.heading;
      let yaw = c.yaw;
      const mode = c.track.yawMode;
      if (c.state === 'turn') yaw = c.turnFrom + c.turnAmt * (1 - c.turnT / Math.max(1e-6, c.turnTotal));
      else if (mode === 'tangent' && hz > 1e-3) yaw = h + c.yawOff;
      else if (mode === 'blend') yaw = lerpAngle(c.blendFrom, c.blendTo, c.track.length > 0 ? C.clamp(s / c.track.length, 0, 1) : 1);
      return { p: r.p, h, yaw, tz: hz > 0.3 ? r.t[2] : 0 };
    }

    collides(c, s) {
      const ps = this.poseOf(c, s);
      const a = { x: ps.p[0], y: ps.p[1], yaw: ps.yaw, hl: c.spec.L / 2 * 0.88, hw: c.spec.W / 2 * 0.88 };
      const z0 = ps.p[2], z1 = ps.p[2] + c.spec.H;
      const ex = this.exitOf(c);
      const cx = Math.floor(a.x / 1000), cy = Math.floor(a.y / 1000);
      const near = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = this.grid.get((cx + i) + ',' + (cy + j)); if (l) near.push(...l); }
      for (const o of near) {
        if (o === c || o.track === c.track || o.removed) continue;
        if (ex.next && o.track === ex.next.track) continue;
        if (o.track.endLink && o.track.endLink.track === c.track) continue;
        const dx = o.wx - a.x, dy = o.wy - a.y;
        if (dx * dx + dy * dy > 1.5e6) continue; // > ~1,2 m
        if (o.wz + o.spec.H < z0 || o.wz > z1) continue;
        if (obbOverlap(a, { x: o.wx, y: o.wy, yaw: o.wyaw, hl: o.spec.L / 2 * 0.88, hw: o.spec.W / 2 * 0.88 })) return true;
      }
      return false;
    }

    /* ------------------------------ un pas ------------------------------ */
    step(dt) {
      this.t += dt;
      const net = this.net;
      // 1. génération
      for (const node of this.sources) { if (node.el.type === 'osr') this.runOSR(node); else this.runSource(node); }
      // 2. occupation des éléments à capacité limitée
      for (const node of net.nodes.values()) { node.rt.occ = 0; node.rt.blockedNow = 0; node.rt.occNow = 0; }
      for (const c of this.cartons) {
        if (c.node) c.node.rt.occ++;
        if (c.entering && c.entering !== c.node) c.entering.rt.occ++;
      }
      // positions monde courantes (collisions)
      this.grid = new Map();
      for (const c of this.cartons) {
        const ps = this.poseOf(c, c.s); c.wx = ps.p[0]; c.wy = ps.p[1]; c.wz = ps.p[2]; c.wyaw = ps.yaw;
        const k = Math.floor(c.wx / 1000) + ',' + Math.floor(c.wy / 1000);
        const l = this.grid.get(k); if (l) l.push(c); else this.grid.set(k, [c]);
      }
      // 3. déplacements (de l'aval vers l'amont sur chaque trajectoire)
      for (const tr of net.tracks) {
        if (!tr.cartons.length) continue;
        const list = tr.cartons.slice().sort((a, b) => b.s - a.s);
        for (const c of list) if (c.track === tr && !c.removed) this.moveCarton(c, dt);
      }
      // 4. postes GTP
      for (const node of net.nodes.values()) if (node.el.type === 'gtp') this.runGTP(node);
      // 5. statistiques
      this.accumulateStats(dt);
    }

    runSource(node) {
      const el = node.el, p = el.params, rt = node.rt;
      if (this.t < (+p.startDelay || 0)) return;
      if (+p.maxCount > 0 && rt.spawned >= +p.maxCount) return;
      if (this.t < rt.nextSpawn) return;
      const tr = node.tracks.main;
      const ids = (Array.isArray(p.formats) && p.formats.length ? p.formats : ['moyen']);
      const fid = ids[Math.floor(this.rng.next() * ids.length) % ids.length];
      const f = this.formats.find(x => x.id === fid) || this.formats[0];
      const spec = { name: f.name, ref: f.ref, formatName: f.name, formatId: f.id, L: f.L, W: f.W, H: f.H, weight: f.weight, color: f.color, speed: 0, kind: f.kind || 'box' };
      const ori = (+p.orientation || 0) * C.DEG;
      const half = lenAlong(spec, ori) / 2;
      const s = half + 5;
      const first = this.firstFrom(tr, 0);
      if (first && first.s - first.half < s + half + this.gapOf(tr)) { this.stats.spawnBlocked++; rt.waitingSpawn = true; return; }
      rt.waitingSpawn = false;
      const c = this.spawn(tr, s, spec, ori, el.name);
      c.v = +p.speed || 0;
      rt.spawned++;
      const base = 3600 / Math.max(1, +p.rate || 600);
      const j = C.clamp(+p.jitter || 0, 0, 100) / 100;
      rt.nextSpawn = this.t + base * (1 + j * (this.rng.next() * 2 - 1));
    }

    /** Stockage à navettes : chaque tour déstocke des caisses sur SON convoyeur de sortie. */
    runOSR(node) {
      const el = node.el, p = el.params, rt = node.rt;
      if (this.t < (+p.startDelay || 0)) return;
      const ids = Array.isArray(p.formats) && p.formats.length ? p.formats : ['bac'];
      rt.towerNext.forEach((next, i) => {
        if (this.t < next) return;
        if (+p.maxCount > 0 && rt.spawned >= +p.maxCount) return;
        if (p.running === false) return;
        const tr = node.tracks['out' + (i + 1)];
        if (!tr) return;
        const fid = ids[Math.floor(this.rng.next() * ids.length) % ids.length];
        const f = this.formats.find(x => x.id === fid) || this.formats[0];
        const spec = { name: f.name, ref: f.ref, formatName: f.name, formatId: f.id, L: f.L, W: f.W, H: f.H, weight: f.weight, color: f.color, speed: 0, kind: f.kind || 'box' };
        const ori = (+p.orientation || 0) * C.DEG;
        const half = lenAlong(spec, ori) / 2, s = half + 5;
        const first = this.firstFrom(tr, 0);
        if (first && first.s - first.half < s + half + this.gapOf(tr)) { this.stats.spawnBlocked++; return; }
        const c = this.spawn(tr, s, spec, ori, el.name + ' · tour ' + (i + 1));
        c.v = +p.speed || 0;
        rt.spawned++;
        rt.towerOut = rt.towerOut || []; rt.towerOut[i] = (rt.towerOut[i] || 0) + 1;
        const base = 3600 / Math.max(1, +p.towerRate || 300);
        const j = C.clamp(+p.jitter || 0, 0, 100) / 100;
        rt.towerNext[i] = this.t + base * (1 + j * (this.rng.next() * 2 - 1));
      });
    }

    /**
     * Poste GTP : quand un bac et un carton sont présentés, l'opérateur transfère
     * min(articles par bac, articles restants) à la cadence réglée (articles/h).
     */
    runGTP(node) {
      const el = node.el, p = el.params, rt = node.rt, id = el.id;
      const tt = node.tracks.tote, tc = node.tracks.ctn;
      if (!tt || !tc) return;
      const at = (tr, c) => !c.removed && !c.done[id] && c.track === tr && Math.abs(c.s - gtpStop(el, tr)) < 1;
      if (rt.busy) {
        const b = rt.busy;
        if (b.tote.removed || b.ctn.removed) { rt.busy = null; return; }
        if (this.t < b.until) return;
        C.addArticles(b.ctn, b.n, C.Types.defs.gtp.articleDims(p.articleSize));
        rt.picks = (rt.picks || 0) + b.n;
        b.tote.done[id] = true; rt.totes = (rt.totes || 0) + 1;
        if ((b.ctn.items || 0) >= Math.max(1, +p.itemsPerOrder || 1)) { b.ctn.done[id] = true; rt.orders = (rt.orders || 0) + 1; }
        rt.busy = null;
        return;
      }
      if (p.running === false) return;
      const tote = tt.cartons.find(c => at(tt, c)), ctn = tc.cartons.find(c => at(tc, c));
      if (!tote || !ctn) { rt.waitTote = !tote; rt.waitCtn = !ctn; return; }
      const remaining = Math.max(1, (+p.itemsPerOrder || 1) - (ctn.items || 0));
      const n = Math.min(Math.max(1, Math.round(+p.itemsPerTote || 1)), remaining);
      rt.busy = { tote, ctn, n, start: this.t, until: this.t + n * 3600 / Math.max(1, +p.pickRate || 600) };
    }

    /** Pose d'une étiquette numérotée sur le colis (numéro + autocollant visible). */
    applyLabel(c, node) {
      const p = node.el.params, rt = node.rt;
      rt.labels = (rt.labels || 0) + 1; rt.lastLabel = this.t;
      c.label = (p.labelPrefix || '') + String(rt.labels).padStart(6, '0');
      c.labeledBy = node.el.name;
      if (c.mesh) C.addLabelSticker(c.mesh, c.spec, p.labelSide || 'top');
    }

    moveCarton(c, dt) {
      const tr = c.track, el = tr.el, p = el.params;
      // rotation sur table tournante
      if (c.state === 'turn') {
        c.turnT -= dt;
        tr.node.rt.angle = c.turnAmt * (1 - Math.max(0, c.turnT) / Math.max(1e-6, c.turnTotal));
        if (c.turnT > 0) { this.updateYaw(c); return; }
        c.yaw = c.turnFrom + c.turnAmt; c.state = 'moving'; c.turnDone = true;
        tr.node.rt.angle = c.turnAmt;
      }
      // temps de préparation au poste
      if (c.dwellUntil) {
        if (this.t < c.dwellUntil) { c.state = 'process'; c.process += dt; return; }
        c.dwellUntil = 0; c.done[el.id] = true;
        if (el.type === 'labeler') this.applyLabel(c, tr.node);
        if (el.type === 'closer') { C.closeCarton(c, p.closeMode, p.lidSkirt, p.lidColor); tr.node.rt.closed = (tr.node.rt.closed || 0) + 1; tr.node.rt.lastLabel = this.t; }
      }
      const v = this.speedOf(c, dt);
      const want = v * 1000 * dt;
      const lim = this.computeLimit(c, want);
      let adv = C.clamp(lim - c.s, 0, want);
      if (adv > 0 && this.app.project.settings.collisions && this.collides(c, c.s + adv)) {
        if (!this.collides(c, c.s)) { adv = 0; c.reason = 'collision évitée'; this.stats.conflicts++; }
      }
      c.s += adv;
      if (want <= 1e-9) { c.state = 'stopped'; c.reason = c.reason || (p.running === false ? 'convoyeur à l\'arrêt' : 'vitesse nulle'); c.wait += dt; tr.node.rt.blockedNow++; }
      else if (adv < want * 0.5) { c.state = 'blocked'; c.wait += dt; tr.node.rt.blockedNow++; if (p.surface === 'freerollers') c.v = 0; }
      else { c.state = 'moving'; c.reason = ''; }
      // début de préparation / d'étiquetage
      if (el.type === 'gtp' && !c.done[el.id] && Math.abs(c.s - gtpStop(el, tr)) < 0.6) { c.state = 'process'; c.reason = tr.id === 'tote' ? 'prélèvement' : 'remplissage'; }
      if (isStation(el, c) && tr.id === 'main' && !c.done[el.id] && !c.dwellUntil) {
        const ss = tr.length * C.clamp(+p.stopPos || 0.5, 0.05, 0.95);
        if (Math.abs(c.s - ss) < 0.6) {
          c.dwellUntil = this.t + (+p.processTime || 0);
          if (!(+p.processTime > 0)) { c.dwellUntil = 0; c.done[el.id] = true; if (el.type === 'labeler') this.applyLabel(c, tr.node); }
        }
      }
      // étiquetage à la volée
      if (el.type === 'labeler' && p.labelMode === 'fly' && tr.id === 'main' && !c.done[el.id] && c.s >= tr.length * C.clamp(+p.stopPos || 0.5, 0.05, 0.95)) {
        c.done[el.id] = true; this.applyLabel(c, tr.node);
      }
      this.transitions(c);
      if (!c.removed) this.updateYaw(c);
    }

    transitions(c) {
      for (let it = 0; it < 4; it++) {
        const tr = c.track, el = tr.el;
        if (((el.type === 'sink' && tr.id === 'main') || tr.absorb) && c.s >= tr.length - c.half - 1) {
          if (tr.absorb) {
            const rt2 = tr.node.rt; rt2.stored = (rt2.stored || 0) + 1;
            const ti = +String(tr.id).replace(/\D/g, '') - 1;
            if (ti >= 0) { rt2.towerIn = rt2.towerIn || []; rt2.towerIn[ti] = (rt2.towerIn[ti] || 0) + 1; }
          }
          this.removeCarton(c, true); return;
        }
        const { exitS, next } = this.exitOf(c);
        if (!next || c.s < exitS - 1e-6) return;
        if (next.turn && !c.turnDone) {
          // démarrage de la rotation de la table
          const rs = Math.max(5, +el.params.rotSpeed || 90) * C.DEG;
          c.state = 'turn'; c.turnAmt = next.turn; c.turnFrom = c.yaw;
          c.turnTotal = c.turnT = Math.abs(next.turn) / rs; c.s = exitS;
          if (c.turnT <= 0) { c.state = 'moving'; c.turnDone = true; } else return;
        }
        const extra = Math.max(0, c.s - exitS);
        const fromNode = tr.node;
        this.enterTrack(c, next.track, next.s0 + extra);
        if (next.track.node !== fromNode) { this.leaveNode(c, fromNode); this.enterNode(c, next.track.node); }
      }
    }

    updateYaw(c) {
      const ps = this.poseOf(c, c.s);
      c.yaw = ps.yaw;
      c.heading = ps.h;
      const target = Math.asin(C.clamp(ps.tz, -1, 1));
      c.pitch += (target - c.pitch) * 0.25;
      c._pose = ps;
    }

    accumulateStats(dt) {
      const net = this.net, st = this.stats;
      for (const c of this.cartons) {
        if (c.node) c.node.rt.occNow += c.half * 2;
      }
      for (const node of net.nodes.values()) {
        const rt = node.rt;
        let L = 0;
        for (const k in node.tracks) L += node.tracks[k].length;
        if (node.el.type === 'turntable' || node.el.type === 'elevator') L = Math.max(L * 0.5, 1);
        rt.occFrac = C.clamp(rt.occNow / Math.max(1, L), 0, 1);
        rt.occInt += rt.occFrac * dt;
        if (rt.blockedNow > 0) rt.blockedTime += dt;
        rt.maxQ = Math.max(rt.maxQ, rt.blockedNow);
        // animation table tournante sans carton
        if (node.el.type === 'turntable' && !this.cartons.some(c => c.node === node)) {
          const rs = Math.max(5, +node.el.params.rotSpeed || 90) * C.DEG * dt;
          rt.angle = Math.abs(rt.angle) <= rs ? 0 : rt.angle - Math.sign(rt.angle) * rs;
        }
      }
      if (this.t - st.lastHist >= 1) {
        st.lastHist = this.t;
        st.history.push({ t: this.t, n: this.cartons.length, done: st.processed, rate: this.rate(300) });
        if (st.history.length > 3600) st.history.shift();
      }
    }

    /** Débit glissant (cartons/h) sur une fenêtre de `win` secondes. */
    rate(win) {
      const st = this.stats;
      if (!st || this.t <= 0) return 0;
      const w = Math.min(win, this.t);
      let n = 0;
      for (let i = st.doneTimes.length - 1; i >= 0 && st.doneTimes[i] >= this.t - w; i--) n++;
      return w > 0 ? n / w * 3600 : 0;
    }

    /** Synthèse des indicateurs pour l'affichage. */
    summary() {
      const st = this.stats;
      if (!st) return null;
      const net = this.net;
      const nodes = Array.from(net.nodes.values());
      const convs = nodes.filter(n => n.el.params.speed !== undefined);
      const avgSpeed = convs.length ? convs.reduce((a, n) => a + (n.el.params.running === false ? 0 : +n.el.params.speed || 0), 0) / convs.length : 0;
      const inCirc = this.cartons.length;
      const blocked = this.cartons.filter(c => c.state === 'blocked' || c.state === 'stopped').length;
      const wips = this.cartons.reduce((a, c) => a + c.wait, 0);
      const points = nodes.filter(n => n.rt && (n.rt.blockedNow >= 2 || (this.t > 20 && n.rt.blockedTime / this.t > 0.4)))
        .sort((a, b) => b.rt.blockedTime - a.rt.blockedTime);
      let satMax = 0, satNode = null;
      for (const n of nodes) { if (!n.rt) continue; const s = this.t > 0 ? n.rt.occInt / this.t : 0; if (s > satMax) { satMax = s; satNode = n; } }
      const curMax = nodes.reduce((a, n) => Math.max(a, n.rt ? n.rt.occFrac || 0 : 0), 0);
      return {
        t: this.t, inCirc, processed: st.processed, created: st.created, blocked,
        rate: this.t > 0 ? st.processed / this.t * 3600 : 0, rateWin: this.rate(300),
        avgSpeed, avgTravel: st.processed ? st.travelSum / st.processed : NaN,
        avgWait: (st.waitSum + wips) / Math.max(1, st.processed + inCirc),
        points, satMax, satNode, satNow: curMax, conflicts: st.conflicts, spawnBlocked: st.spawnBlocked
      };
    }

    /* ------------------------------ boucle ------------------------------ */
    frame(realDt) {
      if (!this.active) return;
      if (this.running) {
        this.acc += Math.min(realDt, 0.1) * this.speed;
        let n = 0;
        while (this.acc >= DT && n < 60) { this.step(DT); this.acc -= DT; n++; }
        if (n >= 60) this.acc = 0;
      }
      this.updateVisuals();
    }

    updateVisuals() {
      const mode = this.colorMode;
      const srcColor = new Map();
      this.sources.forEach((n, i) => srcColor.set(n.el.name, C.palette[i % C.palette.length]));
      for (const c of this.cartons) {
        const ps = c._pose || this.poseOf(c, c.s);
        poseMesh(c.mesh, ps.p, ps.h, c.pitch, ps.yaw, c.spec.H);
        let col = c.spec.color;
        if (mode === 'source') col = srcColor.get(c.source) || '#cccccc';
        else if (mode === 'wait') col = C.heatColor(c.wait / 60);
        else if (mode === 'state') col = c.state === 'moving' ? '#2ecc71' : c.state === 'process' ? '#3498db' : c.state === 'turn' ? '#9b59b6' : c.reason === 'collision évitée' ? '#e74c3c' : '#f39c12';
        else if (mode === 'route' && c.route) col = C.palette[(c.route.out || 0) % C.palette.length];
        const m = C.cartonMaterial(col);
        if (c.mesh.isGroup) {
          // palette : seule la charge (ou le bois si vide) prend la couleur d'affichage
          if (c._col !== col) { c._col = col; c.mesh.traverse(o => { if (!o.userData.loadPart) return; if (!o._baseMat) o._baseMat = o.material; o.material = mode === 'format' ? o._baseMat : m; }); }
        } else if (c.mesh.material !== m) c.mesh.material = m;
      }
      this.updateEquipVisuals();
      if (this.heatMode) this.applyHeat();
    }

    updateEquipVisuals() {
      const vp = this.app.viewport;
      for (const node of this.net.nodes.values()) {
        const g = vp.meshes.get(node.el.id);
        if (!g || !node.rt) continue;
        const rt = node.rt, p = node.el.params;
        if (g.userData.spin) g.userData.spin.rotation.z = rt.angle;
        if (g.userData.osr && C.animateOSR) C.animateOSR(g, this.t);
        if (g.userData.gtpArticle) {
          // article en cours de transfert : arc du bac vers le carton
          const art = g.userData.gtpArticle, b = rt.busy;
          art.visible = !!b && !b.tote.removed && !b.ctn.removed;
          if (art.visible) {
            const u = C.clamp((this.t - b.start) / Math.max(1e-6, b.until - b.start), 0, 1), f = (u * b.n) % 1;
            const pa = b.tote.mesh.position, pb = b.ctn.mesh.position;
            const v = new THREE.Vector3().lerpVectors(pa, pb, f);
            v.z += Math.sin(f * Math.PI) * 0.45 + 0.12;
            art.position.copy(g.worldToLocal(v));
          }
        }
        if (g.userData.applicator) {
          const ap = g.userData.applicator;
          const busy = this.cartons.some(c => c.node === node && c.state === 'process') || (rt.lastLabel !== undefined && this.t - rt.lastLabel < 0.35);
          const target = busy ? ap.active : ap.rest;
          ap.obj.position[ap.axis] += (target - ap.obj.position[ap.axis]) * 0.35;
        }
        if (g.userData.carriage) {
          const c = this.cartons.find(x => x.node === node && x.track.lift);
          let target = 0;
          if (c) target = c._pose ? c._pose.p[2] - node.el.z : 0;
          if (c && c.s < c.track.lift[0] - c.half) target = 0;
          const spd = Math.max(0.05, +p.liftSpeed || 0.5) * 1000 / 60 * this.speed * 1.2;
          if (c) rt.carZ = target; else rt.carZ += C.clamp(target - rt.carZ, -spd, spd);
          g.userData.carriage.position.z = rt.carZ * M;
        }
        if (g.userData.stopBlade && node.el.type === 'stop') {
          const open = p.stopMode === 'open' || (p.stopMode === 'cycle' && (this.t % ((+p.openTime || 1) + (+p.closedTime || 1))) < (+p.openTime || 1)) || (rt.passId !== null && p.stopMode === 'timed');
          g.userData.stopBlade.position.z = (open ? -70 : 30) * M;
        }
        if (g.userData.zoneMarkers) {
          const tr = node.tracks.main, nz = g.userData.zoneMarkers.length, Z = tr.length / nz;
          g.userData.zoneMarkers.forEach((mk, i) => {
            const occ = tr.cartons.some(o => o.s - o.half < (i + 1) * Z && o.s + o.half > i * Z);
            const blk = occ && tr.cartons.some(o => o.state !== 'moving' && o.s >= i * Z && o.s < (i + 1) * Z);
            mk.material.color.set(blk ? '#e74c3c' : occ ? '#f39c12' : '#2ecc71');
            mk.material.emissive.set(blk ? '#5a1010' : occ ? '#5a3a05' : '#145a32');
          });
        }
      }
    }
    resetEquipVisuals() {
      const vp = this.app.viewport;
      for (const g of vp.meshes.values()) {
        if (g.userData.spin) g.userData.spin.rotation.z = 0;
        if (g.userData.carriage) g.userData.carriage.position.z = 0;
        if (g.userData.stopBlade) g.userData.stopBlade.position.z = (g.userData.stopBlade.userData.z0 || 30) * M;
        if (g.userData.zoneMarkers) g.userData.zoneMarkers.forEach(mk => { mk.material.color.set('#2ecc71'); mk.material.emissive.set('#145a32'); });
      }
    }

    /** Carte de chaleur : coloration des structures selon la saturation. */
    applyHeat() {
      const vp = this.app.viewport;
      for (const node of this.net.nodes.values()) {
        const g = vp.meshes.get(node.el.id);
        if (!g || !node.rt) continue;
        const sat = this.t > 0 ? node.rt.occInt / this.t : 0;
        const val = Math.max(sat, node.rt.occFrac || 0);
        const bucket = Math.round(val * 10) / 10;
        const matl = C.MAT.glow(C.heatColor(bucket));
        g.traverse(o => {
          if (o.userData.isFrame) {
            if (!o.userData.origMat) o.userData.origMat = o.material;
            o.material = matl;
          }
        });
      }
    }
    restoreHeat() {
      const vp = this.app.viewport;
      for (const g of vp.meshes.values()) g.traverse(o => { if (o.userData.origMat) { o.material = o.userData.origMat; delete o.userData.origMat; } });
    }
    setHeat(on) { this.heatMode = on; if (!on) this.restoreHeat(); else if (this.active) this.applyHeat(); }
  }

  C.Simulation = Simulation;
  C.parseRules = parseRules;
})(window.C3D);
