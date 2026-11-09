/* =====================================================================
 * Convoy3D — Zone de conception 3D (Three.js)
 *
 *  - Caméras perspective / orthographique, contrôle orbital maison
 *    (clic gauche = rotation, clic droit / molette enfoncée = déplacement,
 *    molette = zoom vers le curseur)
 *  - Grille dimensionnée, repère XYZ, mini-repère d'orientation
 *  - Sélection (clic, Ctrl/Maj+clic, Maj+glisser = rectangle)
 *  - Déplacement à la souris avec magnétisme grille + accrochage des ports
 *  - Placement de nouveaux éléments (fantôme), mesures, pose de cartons
 *  - Repères de ports (connecté / libre / défaut), étiquettes de cotes
 * ===================================================================== */
(function (C) {
  'use strict';
  const M = 0.001;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------------------------- texte en sprite --------------------------- */
  function textSprite(text, opts) {
    opts = opts || {};
    const fs = opts.size || 48;
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    g.font = `${opts.bold ? 'bold ' : ''}${fs}px Segoe UI, Arial, sans-serif`;
    const w = Math.ceil(g.measureText(text).width) + 16;
    cv.width = w; cv.height = fs + 16;
    g.font = `${opts.bold ? 'bold ' : ''}${fs}px Segoe UI, Arial, sans-serif`;
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, cv.width, cv.height); }
    g.fillStyle = opts.color || '#9fb0c0';
    g.textBaseline = 'middle';
    g.fillText(text, 8, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false }));
    const h = opts.height || 0.35;
    sp.scale.set(h * cv.width / cv.height, h, 1);
    // ancrage en bas : le texte reste au-dessus du sol au lieu d'être coupé par le plancher
    if (opts.ground) { sp.center.set(0.5, 0); sp.renderOrder = 3; }
    return sp;
  }
  C.textSprite = textSprite;

  /* -------------------------- contrôle orbital --------------------------- */
  class Orbit {
    constructor(vp) {
      this.vp = vp;
      this.target = V3(15, 10, 0);
      this.radius = 28; this.theta = -Math.PI / 2 - 0.6; this.phi = 0.95;
    }
    update() {
      const vp = this.vp, cam = vp.camera;
      const sp = Math.sin(this.phi);
      const off = V3(this.radius * sp * Math.cos(this.theta), this.radius * sp * Math.sin(this.theta), this.radius * Math.cos(this.phi));
      cam.position.copy(this.target).add(off);
      cam.up.set(0, 0, 1);
      cam.lookAt(this.target);
      const aspect = vp.width / Math.max(1, vp.height);
      if (cam.isOrthographicCamera) {
        const hh = this.radius * Math.tan(22.5 * C.DEG);
        cam.left = -hh * aspect; cam.right = hh * aspect; cam.top = hh; cam.bottom = -hh;
        cam.near = -2000; cam.far = 4000;
      } else {
        cam.aspect = aspect;
        cam.near = Math.max(0.02, this.radius / 2000); cam.far = Math.max(500, this.radius * 60);
      }
      cam.updateProjectionMatrix();
    }
    rotate(dx, dy) {
      this.theta -= dx * 0.006;
      this.phi = C.clamp(this.phi - dy * 0.006, 0.0005, Math.PI * 0.97);
      this.update();
    }
    pan(dx, dy) {
      const cam = this.vp.camera;
      const k = 2 * this.radius * Math.tan(22.5 * C.DEG) / Math.max(1, this.vp.height);
      const right = V3().setFromMatrixColumn(cam.matrix, 0);
      const up = V3().setFromMatrixColumn(cam.matrix, 1);
      this.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      this.update();
    }
    zoom(factor, toward) {
      const r0 = this.radius;
      this.radius = C.clamp(this.radius * factor, 0.3, 3000);
      if (toward) this.target.lerp(toward, 1 - this.radius / r0);
      this.update();
    }
  }

  class Viewport extends C.Emitter {
    constructor(container, app) {
      super();
      this.app = app;
      this.container = container;
      this.width = container.clientWidth || 800;
      this.height = container.clientHeight || 600;
      this.mode = 'select';
      this.show = { grid: true, axes: true, ports: true, labels: true, rollers: true, guides: true, structure: true, arrows: true, shadows: true, walls: true, wallsGhost: false };
      this.meshes = new Map();
      this.cartonMeshes = new Map();

      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(this.width, this.height);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.autoClear = false;
      container.appendChild(r.domElement);
      r.domElement.tabIndex = 0;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x1a1e24);
      this.persp = new THREE.PerspectiveCamera(45, this.width / this.height, 0.05, 2000);
      this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -2000, 4000);
      this.camera = this.persp;
      this.orbit = new Orbit(this);

      // groupes
      this.gHelpers = new THREE.Group(); this.scene.add(this.gHelpers);
      this.gElements = new THREE.Group(); this.scene.add(this.gElements);
      this.gCartons = new THREE.Group(); this.scene.add(this.gCartons);
      this.gOverlay = new THREE.Group(); this.scene.add(this.gOverlay);
      this.gPorts = new THREE.Group(); this.gOverlay.add(this.gPorts);
      this.gSelection = new THREE.Group(); this.gOverlay.add(this.gSelection);
      this.gMeasures = new THREE.Group(); this.gOverlay.add(this.gMeasures);

      // lumières
      const hemi = new THREE.HemisphereLight(0xe6eeff, 0x3a3f46, 1.1);
      hemi.position.set(0, 0, 1); this.scene.add(hemi);
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
      const sun = this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0015;
      sun.shadow.normalBias = 0.04;
      this.scene.add(sun); this.scene.add(sun.target);

      // calque d'étiquettes HTML
      this.labelLayer = C.h('div', { class: 'label-layer' });
      container.appendChild(this.labelLayer);
      this.labels = [];
      this.rubber = C.h('div', { class: 'rubber' }); container.appendChild(this.rubber);
      this.snapInfo = C.h('div', { class: 'snap-info' }); container.appendChild(this.snapInfo);

      this.raycaster = new THREE.Raycaster();
      this.buildGizmo();
      this.buildWorkspace();
      this.bindEvents();
      this.orbit.update();
      window.addEventListener('resize', () => this.resize());
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(container);
    }

    /* ------------------------------- scène ------------------------------- */
    buildWorkspace() {
      const st = this.app.project.settings;
      this.gHelpers.clear();
      const W = st.workW * M, D = st.workD * M;
      // sol extérieur
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(W * 3 + 40, D * 3 + 40), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 1 }));
      outer.position.set(W / 2, D / 2, -0.004); outer.receiveShadow = true;
      this.gHelpers.add(outer);
      // zone de travail
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x252b33, roughness: 0.95 }));
      floor.position.set(W / 2, D / 2, -0.002); floor.receiveShadow = true;
      floor.userData.isFloor = true;
      this.gHelpers.add(floor);
      // grille
      const step = Math.max(100, st.gridStep) * M;
      const minor = [], major = [];
      const majorEvery = 5;
      let i = 0;
      for (let x = 0; x <= W + 1e-6; x += step, i++) (i % majorEvery ? minor : major).push(x, 0, 0, x, D, 0);
      i = 0;
      for (let y = 0; y <= D + 1e-6; y += step, i++) (i % majorEvery ? minor : major).push(0, y, 0, W, y, 0);
      const mkLines = (arr, color, op) => {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
        l.userData.layer = 'grid'; return l;
      };
      this.gHelpers.add(mkLines(minor, 0x3b4450, 0.8));
      this.gHelpers.add(mkLines(major, 0x56657a, 1));
      // contour
      const border = mkLines([0, 0, 0.001, W, 0, 0.001, W, 0, 0.001, W, D, 0.001, W, D, 0.001, 0, D, 0.001, 0, D, 0.001, 0, 0, 0.001], 0x7f93ad, 1);
      this.gHelpers.add(border);
      // cotes de la grille
      const labelEvery = step * majorEvery;
      const big = Math.max(W, D);
      const lh = C.clamp(big / 60, 0.25, 2.5);
      for (let x = 0; x <= W + 1e-6; x += labelEvery) {
        const s = textSprite(C.fmt(x, x % 1 ? 1 : 0) + ' m', { height: lh, color: '#7f93ad', ground: true });
        s.position.set(x, -lh * 0.9, 0.02); s.userData.layer = 'grid'; this.gHelpers.add(s);
      }
      for (let y = labelEvery; y <= D + 1e-6; y += labelEvery) {
        const s = textSprite(C.fmt(y, y % 1 ? 1 : 0) + ' m', { height: lh, color: '#7f93ad', ground: true });
        s.position.set(-lh * 1.6, y, 0.02); s.userData.layer = 'grid'; this.gHelpers.add(s);
      }
      const dimTxt = textSprite(`Zone de travail ${C.fmt(st.workW / 1000, 1)} × ${C.fmt(st.workD / 1000, 1)} m`, { height: lh * 1.1, color: '#9fb4cc', ground: true });
      dimTxt.position.set(W / 2, -lh * 3.6, 0.02); dimTxt.userData.layer = 'grid'; this.gHelpers.add(dimTxt);
      // repère XYZ à l'origine
      const axes = new THREE.Group(); axes.userData.layer = 'axes';
      const al = C.clamp(big / 20, 1, 5);
      const mkAxis = (dir, color, label) => {
        const a = new THREE.ArrowHelper(dir, V3(0, 0, 0), al, color, al * 0.15, al * 0.07);
        axes.add(a);
        const s = textSprite(label, { height: al * 0.18, color: '#' + color.toString(16).padStart(6, '0'), bold: true });
        s.position.copy(dir.clone().multiplyScalar(al * 1.12)); axes.add(s);
      };
      mkAxis(V3(1, 0, 0), 0xff5555, 'X'); mkAxis(V3(0, 1, 0), 0x55dd55, 'Y'); mkAxis(V3(0, 0, 1), 0x5599ff, 'Z');
      this.gHelpers.add(axes);
      // ombre
      const sun = this.sun, half = big * 0.75 + 5;
      sun.position.set(W / 2 - big * 0.4, D / 2 - big * 0.6, big * 0.9 + 10);
      sun.target.position.set(W / 2, D / 2, 0);
      const sc = sun.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 0.5; sc.far = big * 3 + 50;
      sc.updateProjectionMatrix();
      this.applyVisibility();
    }

    buildGizmo() {
      this.gScene = new THREE.Scene();
      this.gCam = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 20);
      const mk = (dir, color, label) => {
        this.gScene.add(new THREE.ArrowHelper(dir, V3(0, 0, 0), 1, color, 0.3, 0.15));
        const s = textSprite(label, { height: 0.42, color: '#' + color.toString(16).padStart(6, '0'), bold: true, depthTest: false });
        s.position.copy(dir.clone().multiplyScalar(1.35)); this.gScene.add(s);
      };
      mk(V3(1, 0, 0), 0xff5555, 'X'); mk(V3(0, 1, 0), 0x55dd55, 'Y'); mk(V3(0, 0, 1), 0x5599ff, 'Z');
    }

    resize() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (!w || !h || (w === this.width && h === this.height)) return;
      this.width = w; this.height = h;
      this.renderer.setSize(w, h);
      this.orbit.update();
    }

    /* ------------------------------ éléments ----------------------------- */
    rebuildAll() {
      for (const g of this.meshes.values()) this.disposeGroup(g);
      this.meshes.clear();
      this.gElements.clear();
      for (const el of this.app.project.elements) this.rebuildElement(el);
      this.rebuildDesignCartons();
    }
    rebuildElement(el) {
      const old = this.meshes.get(el.id);
      if (old) { this.gElements.remove(old); this.disposeGroup(old); }
      const g = C.buildElementMesh(el);
      this.meshes.set(el.id, g);
      this.gElements.add(g);
      this.applyVisibility(g);
      return g;
    }
    removeElementMesh(id) {
      const g = this.meshes.get(id);
      if (g) { this.gElements.remove(g); this.disposeGroup(g); this.meshes.delete(id); }
    }
    disposeGroup(g) {
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.userData && o.material.userData.owned) o.material.dispose();
      });
    }
    /** Synchronise les maillages avec la liste d'éléments (ajouts/suppressions/modifs). */
    sync(changedIds) {
      const els = this.app.project.elements;
      const ids = new Set(els.map(e => e.id));
      // les pieds / poteaux dépendent des planchers de mezzanine : signature commune
      const mz = JSON.stringify(els.filter(e => e.type === 'mezzanine').map(e => [e.x, e.y, e.z, e.rot, e.params.length, e.params.width, e.params.deckH]));
      // les ouvertures des murs dépendent de tous les autres objets
      const wallSig = els.some(e => e.type === 'wall') ? JSON.stringify(els.map(e => [e.id, e.type, e.x, e.y, e.z, e.rot, e.params])) : '';
      for (const id of Array.from(this.meshes.keys())) if (!ids.has(id)) this.removeElementMesh(id);
      for (const el of els) {
        const g = this.meshes.get(el.id);
        const sig = JSON.stringify([el.type, el.params, el.x, el.y, el.z, el.rot, el.name]) + mz + (el.type === 'wall' ? wallSig : '');
        if (!g || g.userData.sig !== sig || (changedIds && changedIds.has(el.id))) {
          const ng = this.rebuildElement(el);
          ng.userData.sig = sig;
        }
      }
    }
    applyVisibility(root) {
      const sh = this.show;
      (root || this.scene).traverse(o => {
        const l = o.userData.layer;
        if (!l) return;
        if (l in sh) o.visible = !!sh[l];
      });
      this.gPorts.visible = sh.ports;
      // murs translucides (pour travailler à l'intérieur du bâtiment)
      (root || this.scene).traverse(o => {
        if (!o.material || !o.material.userData || !o.material.userData.wallMat) return;
        o.material.transparent = sh.wallsGhost; o.material.opacity = sh.wallsGhost ? 0.25 : 1;
        o.material.depthWrite = !sh.wallsGhost; o.castShadow = !sh.wallsGhost;
        o.material.needsUpdate = true;
      });
      this.renderer.shadowMap.enabled = sh.shadows;
      this.sun.castShadow = sh.shadows;
      this.labelLayer.style.display = sh.labels ? '' : 'none';
    }
    setShow(key, val) {
      this.show[key] = val;
      this.applyVisibility();
      if (key === 'shadows') this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }

    /* --------------------------- cartons posés --------------------------- */
    rebuildDesignCartons() {
      for (const m of this.cartonMeshes.values()) this.gCartons.remove(m);
      this.cartonMeshes.clear();
      const app = this.app;
      if (app.sim && app.sim.active) return;
      for (const c of app.project.cartons) {
        const tr = app.network.track(c.elementId + ':' + (c.track || 'main')) || app.network.mainTrack(c.elementId);
        if (!tr) continue;
        const spec = app.project.cartonSpec(c);
        const mesh = C.makeCartonMesh(spec);
        mesh.userData.cartonId = c.id;
        C.poseCarton(mesh, tr, C.clamp(c.s, 0, tr.length), spec, (spec.orientation || 0) * C.DEG);
        this.gCartons.add(mesh);
        this.cartonMeshes.set(c.id, mesh);
      }
    }

    /* ------------------------- sélection & ports ------------------------- */
    updateSelection() {
      const app = this.app;
      this.gSelection.clear();
      for (const id of app.selection) {
        const g = this.meshes.get(id);
        if (!g) continue;
        const bh = new THREE.BoxHelper(g, 0x00e5ff);
        bh.material.depthTest = false; bh.material.transparent = true; bh.material.opacity = 0.9;
        bh.renderOrder = 5;
        this.gSelection.add(bh);
        // axe de convoyage
        const node = app.network.node(id);
        if (node) for (const k in node.tracks) {
          const tr = node.tracks[k];
          const pts = tr.path.sample(3).map(o => V3(o.p[0] * M, o.p[1] * M, o.p[2] * M + 0.012));
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false, transparent: true }));
          line.renderOrder = 6;
          this.gSelection.add(line);
        }
      }
      for (const cid of app.cartonSelection) {
        const m = this.cartonMeshes.get(cid) || (app.sim && app.sim.meshById(cid));
        if (m) { const bh = new THREE.BoxHelper(m, 0xffd400); bh.material.depthTest = false; bh.renderOrder = 6; this.gSelection.add(bh); }
      }
      this.updateLabels();
    }

    updatePorts() {
      const net = this.app.network;
      this.gPorts.clear();
      const colors = { ok: 0x2ecc71, warn: 0xf39c12, error: 0xe74c3c, free: 0xe74c3c, optional: 0x7f8c8d };
      const coneGeo = new THREE.ConeGeometry(0.05, 0.14, 16);
      const ringGeo = new THREE.TorusGeometry(0.07, 0.014, 8, 24);
      for (const p of net.ports) {
        let st = p.status;
        if (st === 'free' && p.optional) st = 'optional';
        if (p.role === 'in' && p.el.type === 'source' && st === 'free') st = 'optional';
        if (p.role === 'out' && p.el.type === 'sink' && st === 'free') st = 'optional';
        const matl = new THREE.MeshBasicMaterial({ color: colors[st] || 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
        let m;
        if (p.role === 'out') {
          m = new THREE.Mesh(coneGeo, matl);
          m.rotation.z = p.h - Math.PI / 2;
        } else {
          m = new THREE.Mesh(ringGeo, matl);
        }
        m.position.set(p.pos[0] * M, p.pos[1] * M, p.pos[2] * M + 0.05);
        m.renderOrder = 4;
        m.userData.port = p.key;
        this.gPorts.add(m);
      }
      // traits de jonction
      for (const l of net.links) {
        if (l.kind !== 'merge') continue;
        const a = l.from.pos, b = l.toTrack.path.at(l.s).p;
        const geo = new THREE.BufferGeometry().setFromPoints([V3(a[0] * M, a[1] * M, a[2] * M + 0.05), V3(b[0] * M, b[1] * M, b[2] * M + 0.05)]);
        const ln = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x2ecc71, dashSize: 0.05, gapSize: 0.03, depthTest: false }));
        ln.computeLineDistances(); ln.renderOrder = 4;
        this.gPorts.add(ln);
      }
    }

    /* ----------------------------- étiquettes ---------------------------- */
    updateLabels() {
      this.labelLayer.innerHTML = '';
      this.labels = [];
      const app = this.app, net = app.network;
      const add = (pos, html, cls) => {
        const d = C.h('div', { class: 'vlabel ' + (cls || ''), html });
        this.labelLayer.appendChild(d);
        this.labels.push({ d, v: V3(pos[0] * M, pos[1] * M, pos[2] * M) });
      };
      const showAll = this.show.labels && app.ui && app.ui.showDims;
      for (const el of app.project.elements) {
        const sel = app.selection.has(el.id);
        if (!sel && !showAll) continue;
        const node = net.node(el.id);
        if (node) {
          const tr = net.mainTrack(el.id);
          const mid = tr.path.at(tr.length / 2).p;
          const L = C.Types.devLength(el);
          add([mid[0], mid[1], mid[2] + 250], `<b>${C.escape(el.name)}</b> · ${C.fmt(L)} mm`, sel ? 'sel' : '');
          if (sel || app.ui.showHeights) {
            for (const p of node.ports) {
              if (p.optional && p.status === 'free') continue;
              add([p.pos[0], p.pos[1], p.pos[2] + 90], `Z ${C.fmt(p.pos[2])}`, 'h');
            }
          }
        } else {
          const sz = C.Types.staticSize(el), hh = el.type === 'mezzanine' ? el.params.deckH : sz.H;
          add([el.x, el.y, el.z + (hh || 100) + 150], `<b>${C.escape(el.name)}</b> · ${C.fmt(sz.L)}×${C.fmt(sz.W)}${el.type === 'mezzanine' ? ' · plancher Z ' + C.fmt(el.z + hh) : '×' + C.fmt(hh)}${el.type === 'rack' ? ' · ' + el.params.levels + ' niveaux' : ''}`, sel ? 'sel' : '');
        }
      }
      // mesures
      for (const ms of app.project.measures) {
        const a = ms.a, b = ms.b;
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + 60],
          `📏 ${C.fmt(d)} mm<br><small>ΔX ${C.fmt(b[0] - a[0])} · ΔY ${C.fmt(b[1] - a[1])} · ΔZ ${C.fmt(b[2] - a[2])}</small>`, 'measure');
      }
      if (this.measureA) add(this.measureA, 'Point A', 'measure');
    }
    projectLabels() {
      if (!this.labels.length || this.labelLayer.style.display === 'none') return;
      const v = new THREE.Vector3();
      for (const l of this.labels) {
        v.copy(l.v).project(this.camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { l.d.style.display = 'none'; continue; }
        l.d.style.display = '';
        l.d.style.transform = `translate(${((v.x + 1) / 2 * this.width).toFixed(1)}px, ${((1 - v.y) / 2 * this.height).toFixed(1)}px) translate(-50%, -100%)`;
      }
    }

    updateMeasures() {
      this.gMeasures.clear();
      for (const ms of this.app.project.measures) {
        const a = V3(ms.a[0] * M, ms.a[1] * M, ms.a[2] * M), b = V3(ms.b[0] * M, ms.b[1] * M, ms.b[2] * M);
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false }));
        ln.renderOrder = 7; this.gMeasures.add(ln);
        for (const p of [a, b]) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false }));
          s.position.copy(p); s.renderOrder = 7; this.gMeasures.add(s);
        }
      }
      if (this.measureA) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8800, depthTest: false }));
        s.position.set(this.measureA[0] * M, this.measureA[1] * M, this.measureA[2] * M); s.renderOrder = 7;
        this.gMeasures.add(s);
      }
      this.updateLabels();
    }

    /* ------------------------------- vues ------------------------------- */
    setProjection(kind) {
      this.camera = kind === 'ortho' ? this.ortho : this.persp;
      this.orbit.update();
      this.emit('projection', kind);
    }
    setView(name) {
      const o = this.orbit;
      const views = {
        top: [-Math.PI / 2, 0.0005, 'ortho'], front: [-Math.PI / 2, Math.PI / 2, 'ortho'],
        back: [Math.PI / 2, Math.PI / 2, 'ortho'], side: [0, Math.PI / 2, 'ortho'], left: [Math.PI, Math.PI / 2, 'ortho'],
        iso: [-Math.PI / 4, Math.acos(1 / Math.sqrt(3)), 'persp'], persp: [-Math.PI / 2 - 0.6, 0.95, 'persp']
      };
      const v = views[name] || views.persp;
      o.theta = v[0]; o.phi = v[1];
      this.setProjection(v[2]);
      this.fit(true);
    }
    /** Cadre la vue sur les éléments (ou la zone de travail). */
    fit(keepAngles, ids) {
      const box = new THREE.Box3();
      const list = ids ? ids.map(id => this.meshes.get(id)).filter(Boolean) : Array.from(this.meshes.values());
      list.forEach(g => box.expandByObject(g));
      if (box.isEmpty()) {
        const st = this.app.project.settings;
        box.set(V3(0, 0, 0), V3(st.workW * M, st.workD * M, 1));
      }
      const c = box.getCenter(V3()), sz = box.getSize(V3());
      const rad = Math.max(1, sz.length() / 2);
      this.orbit.target.copy(c);
      this.orbit.radius = rad / Math.tan(22.5 * C.DEG) * 1.1;
      this.orbit.update();
      void keepAngles;
    }
    focus(id) { this.fit(true, [id]); }

    /* ---------------------------- picking ----------------------------- */
    ndc(e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }
    pick(e, opts) {
      opts = opts || {};
      this.raycaster.setFromCamera(this.ndc(e), this.camera);
      const targets = [this.gElements];
      if (opts.cartons !== false) targets.push(this.gCartons);
      const hits = this.raycaster.intersectObjects(targets, true);
      for (const h of hits) {
        let o = h.object;
        if (!o.visible) continue;
        let hidden = false;
        for (let q = o; q; q = q.parent) if (!q.visible) { hidden = true; break; }
        if (hidden) continue;
        while (o && o.userData.elementId === undefined && o.userData.cartonId === undefined && o.userData.simCarton === undefined) o = o.parent;
        if (!o) continue;
        if (o.userData.cartonId !== undefined) return { carton: o.userData.cartonId, point: h.point };
        if (o.userData.simCarton !== undefined) return { simCarton: o.userData.simCarton, point: h.point };
        if (o.userData.ghost) continue;
        return { element: o.userData.elementId, point: h.point };
      }
      return null;
    }
    /** Intersection du rayon avec le plan horizontal Z = zmm. Retour en mm. */
    planePoint(e, zmm) {
      this.raycaster.setFromCamera(this.ndc(e), this.camera);
      const pl = new THREE.Plane(V3(0, 0, 1), -(zmm || 0) * M);
      const p = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(pl, p)) return null;
      return [p.x / M, p.y / M, p.z / M];
    }
    /** Point 3D sous le curseur (objets puis sol). mm. */
    surfacePoint(e) {
      const h = this.pick(e);
      if (h) return [h.point.x / M, h.point.y / M, h.point.z / M];
      return this.planePoint(e, 0);
    }

    /* ----------------------------- événements ---------------------------- */
    bindEvents() {
      const dom = this.renderer.domElement;
      dom.addEventListener('contextmenu', e => e.preventDefault());
      dom.addEventListener('pointerdown', e => this.onDown(e));
      window.addEventListener('pointermove', e => this.onMove(e));
      window.addEventListener('pointerup', e => this.onUp(e));
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        const f = Math.pow(1.0015, e.deltaY);
        if (this.app.director && this.app.director.active) { this.app.director.zoom = C.clamp(this.app.director.zoom * f, 0.2, 8); return; }
        const p = this.planePoint(e, 0);
        this.orbit.zoom(f, p ? V3(p[0] * M, p[1] * M, p[2] * M) : null);
      }, { passive: false });
      dom.addEventListener('dblclick', e => {
        const h = this.pick(e);
        if (h && h.element) this.focus(h.element);
      });
      // glisser-déposer depuis la bibliothèque
      dom.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      dom.addEventListener('drop', e => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        const p = this.planePoint(e, this.app.project.settings.defaultZ);
        if (id && p) this.app.addFromLibrary(id, { at: p });
      });
      // tactile : pincer pour zoomer
      this.touches = new Map();
    }

    onDown(e) {
      const app = this.app;
      this.renderer.domElement.focus();
      this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) { this.down.pinch = this.pinchDist(); this.down.kind = 'pinch'; return; }
      }
      if (e.button === 1 || e.button === 2) { this.down.kind = 'pan'; return; }
      if (e.button !== 0) return;
      if (this.mode === 'place') { this.down.kind = 'place'; return; }
      if (this.mode === 'measure') { this.down.kind = 'measure'; return; }
      if (this.mode === 'carton') { this.down.kind = 'carton'; return; }
      const hit = this.pick(e);
      if (!hit) { this.down.kind = e.shiftKey ? 'box' : 'orbit'; return; }
      if (hit.carton || hit.simCarton) { this.down.kind = 'cartonSel'; this.down.hit = hit; return; }
      const id = hit.element;
      if (this.down.ctrl || this.down.shift) { app.toggleSelect(id); this.down.kind = 'none'; return; }
      if (!app.selection.has(id)) app.select([id]);
      this.down.kind = 'maybeMove';
      this.down.hit = hit;
    }

    pinchDist() { const a = Array.from(this.touches.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }

    onMove(e) {
      const d = this.down;
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (d && d.kind === 'pinch' && this.touches.size === 2) {
          const nd = this.pinchDist();
          this.orbit.zoom(d.pinch / Math.max(1, nd)); d.pinch = nd; return;
        }
      }
      if (!d) { this.onHover(e); return; }
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
      const mx = e.movementX || 0, my = e.movementY || 0;
      switch (d.kind) {
        case 'orbit': if (d.moved) this.orbit.rotate(mx, my); break;
        case 'pan': if (d.moved) this.orbit.pan(mx, my); break;
        case 'box': if (d.moved) this.drawRubber(d, e); break;
        case 'maybeMove': if (d.moved) { if (this.app.beginMove()) { d.kind = 'move'; this.startMove(e); } else d.kind = 'orbit'; } break;
        case 'move': this.doMove(e); break;
      }
      if (this.mode === 'place') this.updateGhost(e);
    }

    onUp(e) {
      const d = this.down;
      if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
      if (!d) return;
      this.down = null;
      const app = this.app;
      switch (d.kind) {
        case 'orbit': if (!d.moved) app.select([]); break;
        case 'pan': if (!d.moved && d.button === 2) app.contextMenu(e, this.pick(e)); break;
        case 'box': this.rubber.style.display = 'none'; if (d.moved) this.finishRubber(d, e); else app.select([]); break;
        case 'maybeMove':
          // clic simple sur un élément d'un groupe → sélection du groupe déjà faite
          break;
        case 'move': this.endMove(e); break;
        case 'cartonSel': app.selectCarton(d.hit.carton || d.hit.simCarton); break;
        case 'place': if (!d.moved) this.confirmPlace(e); break;
        case 'measure': if (!d.moved) this.measureClick(e); break;
        case 'carton': if (!d.moved) this.cartonClick(e); break;
      }
      if (d.moved && (d.kind === 'orbit' || d.kind === 'pan')) this.emit('cameraMoved');
      // si l'utilisateur a fait tourner la vue en mode placement/mesure
      if (d.kind === 'place' && d.moved) { /* rien */ }
    }

    onHover(e) {
      if (this._hoverT && performance.now() - this._hoverT < 40) return;
      this._hoverT = performance.now();
      if (e.target !== this.renderer.domElement) return;
      const h = this.mode === 'select' || this.mode === 'carton' ? this.pick(e) : null;
      const id = h ? (h.element || h.carton || h.simCarton) : null;
      this.renderer.domElement.style.cursor = this.mode === 'place' || this.mode === 'measure' || this.mode === 'carton' ? 'crosshair' : (id ? 'pointer' : 'default');
      if (this.mode === 'place') this.updateGhost(e);
      if (id !== this.hoverId) {
        this.hoverId = id;
        if (this.hoverHelper) { this.gOverlay.remove(this.hoverHelper); this.hoverHelper = null; }
        const g = h && h.element ? this.meshes.get(h.element) : null;
        if (g && !this.app.selection.has(h.element)) {
          this.hoverHelper = new THREE.BoxHelper(g, 0x6c8fb3);
          this.hoverHelper.material.transparent = true; this.hoverHelper.material.opacity = 0.6;
          this.gOverlay.add(this.hoverHelper);
        }
        this.emit('hover', h);
      }
    }

    drawRubber(d, e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const x0 = Math.min(d.x, e.clientX) - r.left, y0 = Math.min(d.y, e.clientY) - r.top;
      Object.assign(this.rubber.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - d.x) + 'px', height: Math.abs(e.clientY - d.y) + 'px' });
    }
    finishRubber(d, e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const x0 = Math.min(d.x, e.clientX) - r.left, x1 = Math.max(d.x, e.clientX) - r.left;
      const y0 = Math.min(d.y, e.clientY) - r.top, y1 = Math.max(d.y, e.clientY) - r.top;
      const ids = [];
      const v = new THREE.Vector3(), box = new THREE.Box3();
      for (const [id, g] of this.meshes) {
        box.setFromObject(g); box.getCenter(v); v.project(this.camera);
        const sx = (v.x + 1) / 2 * this.width, sy = (1 - v.y) / 2 * this.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && v.z < 1) ids.push(id);
      }
      this.app.select(ids, d.ctrl);
    }

    /* ------------------------- déplacement (drag) ------------------------ */
    startMove(e) {
      const app = this.app;
      const prim = app.project.getElement(this.down.hit.element);
      const ids = app.withRiders(Array.from(app.selection));
      this.drag = {
        prim, ids, exclude: new Set(ids),
        origSupport: app.supportAt(prim.x, prim.y, prim.z, new Set(ids)),
        orig: new Map(ids.map(id => { const el = app.project.getElement(id); return [id, { x: el.x, y: el.y, z: el.z, rot: el.rot }]; })),
        start: this.planePoint(e, prim.z), cur: null
      };
      if (!this.drag.start) { this.drag = null; this.down.kind = 'orbit'; }
    }
    doMove(e) {
      const dr = this.drag;
      if (!dr) return;
      const app = this.app, st = app.project.settings;
      const o = dr.orig.get(dr.prim.id);
      let p = this.planePoint(e, o.z);
      if (!p) return;
      // changement de support (sol ↔ plancher de mezzanine) selon ce que vise la souris
      let zShift = 0;
      if (!e.altKey && dr.prim.type !== 'mezzanine' && dr.prim.type !== 'wall') {
        const rel = o.z - dr.origSupport;
        let sup = this.deckUnderCursor(e, dr.exclude);
        if (sup === null) sup = app.supportAt(o.x + p[0] - dr.start[0], o.y + p[1] - dr.start[1], o.z, dr.exclude);
        zShift = sup + rel - o.z;
        if (Math.abs(zShift) > 0.5) { const p2 = this.planePoint(e, o.z + zShift); if (p2) p = p2; }
      }
      let dx = p[0] - dr.start[0], dy = p[1] - dr.start[1];
      let nx = o.x + dx, ny = o.y + dy;
      if (st.snapGrid && !e.altKey) { const g = st.snapStep || 50; nx = Math.round(nx / g) * g; ny = Math.round(ny / g) * g; }
      dx = nx - o.x; dy = ny - o.y;
      let rotOverride = null, dz = zShift, snapped = null;
      if (st.snapPorts && !e.altKey) {
        const sn = app.findSnap(dr.ids, dx, dy, dr.orig, zShift, dr.prim.id);
        if (sn) { dx = sn.dx; dy = sn.dy; dz = sn.dz; rotOverride = sn.rot; snapped = sn; }
      }
      dr.cur = { dx, dy, dz, rot: rotOverride };
      for (const id of dr.ids) {
        const g = this.meshes.get(id), o2 = dr.orig.get(id);
        if (!g) continue;
        if (rotOverride !== null && dr.ids.length === 1) {
          g.position.set(rotOverride.x * M, rotOverride.y * M, rotOverride.z * M);
          g.rotation.z = rotOverride.rot * C.DEG;
        } else {
          g.position.set((o2.x + dx) * M, (o2.y + dy) * M, (o2.z + dz) * M);
          g.rotation.z = o2.rot * C.DEG;
        }
      }
      this.gSelection.children.forEach(c => { if (c.isBoxHelper || c.type === 'BoxHelper') c.update(); });
      this.showSnap(snapped, e);
    }
    /** Dessus du plancher de mezzanine visé par la souris (hors éléments déplacés), sinon null. */
    deckUnderCursor(e, exclude) {
      this.raycaster.setFromCamera(this.ndc(e), this.camera);
      const hits = this.raycaster.intersectObjects([this.gElements], true);
      for (const h of hits) {
        const id = h.object.userData.elementId;
        if (id === undefined || (exclude && exclude.has(id))) continue;
        if (h.object.userData.deck) {
          const m = this.app.project.getElement(id);
          return m ? m.z + m.params.deckH : null;
        }
      }
      return null;
    }
    showSnap(sn, e) {
      if (!sn) { this.snapInfo.style.display = 'none'; return; }
      const r = this.renderer.domElement.getBoundingClientRect();
      this.snapInfo.textContent = '🧲 ' + sn.label;
      Object.assign(this.snapInfo.style, { display: 'block', left: (e.clientX - r.left + 16) + 'px', top: (e.clientY - r.top + 16) + 'px' });
    }
    endMove() {
      const dr = this.drag;
      this.drag = null;
      this.snapInfo.style.display = 'none';
      if (!dr || !dr.cur) return;
      this.app.commitMove(dr);
    }

    /* ------------------------------ placement ----------------------------- */
    startPlace(item, params) {
      this.cancelPlace();
      this.mode = 'place';
      const app = this.app;
      const el = app.project.createElement(item.type, Object.assign({}, item.params, params || {}));
      el.name = '(nouveau)';
      this.ghost = { item, el, rot: 0 };
      const g = C.buildElementMesh(el);
      g.traverse(o => {
        if (o.material) {
          o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45; o.material.depthWrite = false;
          o.material.userData.owned = true;
        }
        o.userData.ghost = true;
        delete o.userData.elementId;
      });
      g.userData.ghost = true;
      this.ghostMesh = g;
      g.visible = false;
      this.gOverlay.add(g);
      this.emit('mode', this.mode);
    }
    cancelPlace() {
      if (this.ghostMesh) { this.gOverlay.remove(this.ghostMesh); this.disposeGroup(this.ghostMesh); this.ghostMesh = null; }
      this.ghost = null;
      this.snapInfo.style.display = 'none';
      if (this.mode === 'place') { this.mode = 'select'; this.emit('mode', this.mode); }
    }
    rotateGhost(deg) {
      if (!this.ghost) return;
      this.ghost.rot = (this.ghost.rot + deg) % 360;
      if (this._lastGhostEvt) this.updateGhost(this._lastGhostEvt);
    }
    updateGhost(e) {
      if (!this.ghost || !this.ghostMesh) return;
      this._lastGhostEvt = { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey };
      const app = this.app, st = app.project.settings, el = this.ghost.el;
      const centered = C.Types.get(el.type).centered;
      const zOff = centered || C.Types.get(el.type).floor ? 0 : st.defaultZ;
      let p = this.planePoint(e, zOff);
      if (!p) return;
      // pose sur le plancher de mezzanine visé (Alt : rester au sol)
      let base = 0;
      if (!e.altKey && el.type !== 'mezzanine' && el.type !== 'wall') {
        const deck = this.deckUnderCursor(e, null);
        if (deck !== null) { base = deck; const p2 = this.planePoint(e, base + zOff); if (p2) p = p2; }
      }
      const g = st.snapStep || 50;
      let x = p[0], y = p[1];
      if (st.snapGrid && !e.altKey) { x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
      el.x = x; el.y = y; el.z = base + zOff; el.rot = this.ghost.rot;
      let sn = null;
      if (st.snapPorts && !e.altKey && !centered) {
        sn = app.findSnapFor(el, el);
        if (sn) { el.x = sn.x; el.y = sn.y; el.z = sn.z; el.rot = sn.rot; }
      } else if (st.snapPorts && !e.altKey && el.type === 'mezzanine') {
        sn = app.findMezzSnap(el, el);
        if (sn) { el.x = sn.x; el.y = sn.y; el.z = sn.z; el.rot = sn.rot; }
      }
      if (st.snapPorts && !e.altKey && el.type === 'wall') {
        sn = app.findWallSnap(el, el);
        if (sn) { el.x = sn.x; el.y = sn.y; }
      }
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(el.x * M, el.y * M, el.z * M);
      this.ghostMesh.rotation.z = el.rot * C.DEG;
      this.showSnap(sn, e);
    }
    confirmPlace(e) {
      if (!this.ghost) return;
      this.updateGhost(e);
      const el = this.ghost.el;
      const item = this.ghost.item;
      this.app.placeElement(item, { x: el.x, y: el.y, z: el.z, rot: el.rot });
      if (!e.shiftKey) this.cancelPlace();
    }

    /* ------------------------------- mesures ------------------------------ */
    setMode(mode) {
      if (this.mode === 'place' && mode !== 'place') this.cancelPlace();
      this.mode = mode;
      this.measureA = null;
      this.updateMeasures();
      this.renderer.domElement.style.cursor = mode === 'select' ? 'default' : 'crosshair';
      this.emit('mode', mode);
    }
    measureClick(e) {
      let p = this.surfacePoint(e);
      if (!p) return;
      // accroche sur un port proche
      const net = this.app.network;
      let best = null, bd = 150;
      for (const pt of net.ports) {
        const d = Math.hypot(pt.pos[0] - p[0], pt.pos[1] - p[1], pt.pos[2] - p[2]);
        if (d < bd) { bd = d; best = pt; }
      }
      if (best) p = best.pos.slice();
      p = p.map(v => C.round(v, 0));
      if (!this.measureA) { this.measureA = p; this.updateMeasures(); return; }
      const a = this.measureA; this.measureA = null;
      this.app.addMeasure(a, p);
    }
    cartonClick(e) {
      const h = this.pick(e, { cartons: false });
      if (!h || !h.element) { C.toast('Cliquez sur un convoyeur pour y poser le carton', 'warn'); return; }
      this.app.placeCartonAt(h.element, [h.point.x / M, h.point.y / M, h.point.z / M]);
    }

    /* ------------------------------ rendu ------------------------------- */
    render() {
      const r = this.renderer;
      r.setViewport(0, 0, this.width, this.height);
      r.setScissorTest(false);
      r.clear();
      r.render(this.scene, this.camera);
      this.projectLabels();
      if (this.show.axes) {
        // mini-repère d'orientation (coin inférieur gauche)
        const s = 96;
        const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
        this.gCam.position.copy(dir.multiplyScalar(5));
        this.gCam.up.copy(this.camera.up);
        this.gCam.lookAt(0, 0, 0);
        r.clearDepth();
        r.setScissorTest(true);
        r.setScissor(8, 8, s, s); r.setViewport(8, 8, s, s);
        r.render(this.gScene, this.gCam);
        r.setScissorTest(false);
        r.setViewport(0, 0, this.width, this.height);
      }
    }

    /* ------------------------------ exports ------------------------------ */
    screenshot() {
      this.render();
      return this.renderer.domElement.toDataURL('image/png');
    }
    /** Vue de dessus haute résolution (PNG). */
    topViewPNG(maxPx) {
      maxPx = maxPx || 3000;
      const box = new THREE.Box3();
      for (const g of this.meshes.values()) box.expandByObject(g);
      const st = this.app.project.settings;
      if (box.isEmpty()) box.set(V3(0, 0, 0), V3(st.workW * M, st.workD * M, 1));
      box.expandByScalar(1);
      const sz = box.getSize(V3()), c = box.getCenter(V3());
      const aspect = sz.x / Math.max(0.1, sz.y);
      const w = aspect >= 1 ? maxPx : Math.round(maxPx * aspect), h = aspect >= 1 ? Math.round(maxPx / aspect) : maxPx;
      const cam = new THREE.OrthographicCamera(-sz.x / 2, sz.x / 2, sz.y / 2, -sz.y / 2, -1000, 1000);
      cam.position.set(c.x, c.y, 500); cam.up.set(0, 1, 0); cam.lookAt(c.x, c.y, 0);
      const r = this.renderer;
      const pr = r.getPixelRatio();
      const wasLabels = this.labelLayer.style.display;
      r.setPixelRatio(1);
      r.setSize(w, h, false);
      r.setViewport(0, 0, w, h);
      r.clear();
      r.render(this.scene, cam);
      const url = r.domElement.toDataURL('image/png');
      r.setPixelRatio(pr);
      r.setSize(this.width, this.height);
      this.labelLayer.style.display = wasLabels;
      return { url, w, h, box: { x0: box.min.x / M, y0: box.min.y / M, x1: box.max.x / M, y1: box.max.y / M } };
    }
  }

  C.Viewport = Viewport;
})(window.C3D);
