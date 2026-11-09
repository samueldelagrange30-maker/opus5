/* =====================================================================
 * Convoy3D — Contrôleur principal de l'application
 * Relie le projet (données), le réseau (connexions), la vue 3D,
 * la simulation et l'interface. Toutes les modifications du projet
 * passent par project.change() pour alimenter l'historique.
 * ===================================================================== */
(function (C) {
  'use strict';
  const D = C.DEG;

  class App {
    constructor() {
      this.project = new C.Project();
      this.selection = new Set();
      this.cartonSelection = new Set();
      this.clipboard = null;
      this.pasteCount = 0;
      this.network = new C.Network(this.project);
      this.currentFormat = 'moyen';
      C.supportAt = (x, y, maxZ, exclude) => this.supportAt(x, y, maxZ, exclude);
      C.mezzanineList = () => this.project.elements.filter(e => e.type === 'mezzanine');
    }

    /* ------------------------ mezzanines modulaires ------------------------ */
    /** Deux modules se touchent-ils (bord à bord, même hauteur de plancher) ? */
    mezzTouch(a, b) {
      if (Math.abs(a.z + a.params.deckH - b.z - b.params.deckH) > 10) return false;
      const L = a.params.length, W = a.params.width;
      for (const [x0, y0, x1, y1, ox, oy] of [[-L / 2, -W / 2, L / 2, -W / 2, 0, -1], [-L / 2, W / 2, L / 2, W / 2, 0, 1], [-L / 2, -W / 2, -L / 2, W / 2, -1, 0], [L / 2, -W / 2, L / 2, W / 2, 1, 0]]) {
        for (let i = 1; i < 10; i++) {
          const u = i / 10;
          const w = C.localToWorld({ x: a.x, y: a.y, z: 0, rot: a.rot }, x0 + (x1 - x0) * u + ox * 40, y0 + (y1 - y0) * u + oy * 40, 0);
          if (this.onMezzanine(b, w[0], w[1])) return true;
        }
      }
      return false;
    }
    /* ------------------------- cariste : missions ------------------------- */
    /** Emplacement de rack sous un point monde (m, Three.js). */
    rackSlotAt(rack, pt) {
      const l = C.worldToLocal({ x: rack.x, y: rack.y, z: rack.z, rot: rack.rot }, pt.x * 1000, pt.y * 1000, pt.z * 1000);
      return C.Types.defs.rack.slotAt(rack.params, l[0], l[1], l[2]);
    }
    /** Niveau le plus proche (même colonne) dont l'état d'occupation correspond à `want`. */
    nearestSlot(rack, s, want) {
      const R = C.Types.defs.rack, G = R.geom(rack.params);
      let best = null;
      for (let k = 0; k < G.nl; k++) {
        const key = R.slotKey(s.r, s.j, k, s.q);
        if (R.slotOccupied(rack, key) === want && (!best || Math.abs(k - s.k) < Math.abs(best.k - s.k))) best = { r: s.r, j: s.j, k, q: s.q, key };
      }
      return best;
    }
    /** Démarre la saisie d'une mission (clic origine puis clic destination). */
    newMission(truckId) {
      this.missionCtx = { truckId, step: 1 };
      this.viewport.setMode('mission');
      this.missionCtx = { truckId, step: 1 };
      this.ui.refreshToolbar();
    }
    endMissionPick() {
      if (this._missionMarker) { this.viewport.gOverlay.remove(this._missionMarker); this._missionMarker = null; }
      this.missionCtx = null;
    }
    missionClick(e, hit) {
      const ctx = this.missionCtx, vp = this.viewport, R = C.Types.defs.rack;
      if (!ctx) return;
      const el = hit && hit.element ? this.project.getElement(hit.element) : null;
      if (ctx.step === 1) {
        if (el && el.type === 'pallet') ctx.from = { kind: 'pallet', id: el.id };
        else if (el && el.type === 'rack') {
          let s = this.rackSlotAt(el, hit.point);
          if (!R.slotOccupied(el, s.key)) {
            const n = this.nearestSlot(el, s, true);
            if (!n) { C.toast(`Aucune palette dans la colonne ${R.address(el.params, s.r, s.j, s.k)}`, 'warn'); return; }
            s = n;
          }
          ctx.from = Object.assign({ kind: 'rack', rackId: el.id }, s);
        }
        if (!ctx.from) { C.toast('Cliquez sur une palette posée au sol ou sur une palette dans un rack', 'warn'); return; }
        ctx.step = 2;
        // repère visuel de la palette choisie
        const mk = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.06), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6, depthTest: false }));
        const t = this.fleet.target(ctx.from, { pose: Object.assign({}, this.project.getElement(ctx.truckId)) });
        if (t) { mk.position.set(t.x / 1000, t.y / 1000, t.z / 1000 + 0.03); mk.rotation.z = t.rot * C.DEG; mk.renderOrder = 9; vp.gOverlay.add(mk); this._missionMarker = mk; }
        C.toast(`Palette choisie : ${this.fleet.describe(ctx.from)} — cliquez maintenant où la déposer`, 'info');
        this.ui.refreshToolbar();
        return;
      }
      let to = null;
      if (el && el.type === 'rack') {
        let s = this.rackSlotAt(el, hit.point);
        if (R.slotOccupied(el, s.key) && !(ctx.from.kind === 'rack' && ctx.from.rackId === el.id && ctx.from.key === s.key)) {
          const n = this.nearestSlot(el, s, false);
          if (!n) { C.toast(`Colonne pleine : aucun emplacement libre en ${R.address(el.params, s.r, s.j, s.k)}`, 'warn'); return; }
          s = n;
        }
        to = Object.assign({ kind: 'rack', rackId: el.id }, s);
      }
      if (!to) {
        const deck = vp.deckUnderCursor(e, null);
        const z = deck === null ? 0 : deck;
        const p = vp.planePoint(e, z);
        if (!p) return;
        to = { kind: 'floor', x: C.round(p[0], 0), y: C.round(p[1], 0), z };
      }
      this.fleet.addMission(ctx.truckId, ctx.from, to);
      vp.setMode('select');
    }

    /* ------------------------- fléchage au sol ------------------------- */
    /** Ports (début / fin) des allées de circulation, pour l'accrochage. */
    lanePorts(exclude) {
      const res = [];
      for (const e of this.project.elements) {
        if (e.type !== 'lane' || (exclude && exclude.has(e.id))) continue;
        for (const q of this.elementPorts(e, e)) res.push(Object.assign(q, { el: e, link: null, linkedFrom: [] }));
      }
      return res;
    }
    /** Accrochage d'une allée bout à bout avec une autre (position et cap). */
    findLaneSnap(el, tf, moving) {
      const mv = moving || new Set([el.id]);
      const sn = this.findSnapFor(el, tf, mv, this.lanePorts(mv), Math.max(800, this.project.settings.snapRadius || 300));
      if (sn) sn.z = 0;
      return sn;
    }

    /* ------------------------------ murs ------------------------------ */
    /** Accrochage d'une extrémité de mur sur l'extrémité d'un autre mur (angles, prolongements). */
    findWallSnap(el, tf, moving) {
      const R = Math.max(500, this.project.settings.snapRadius || 300);
      const mine = C.Walls.wallEnds(Object.assign({}, el, { x: tf.x, y: tf.y, rot: tf.rot }));
      let best = null;
      for (const w of this.project.elements) {
        if (w.type !== 'wall' || w.id === el.id || (moving && moving.has(w.id))) continue;
        for (const q of C.Walls.wallEnds(w)) mine.forEach((p, i) => {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < R && (!best || d < best.d)) best = { d, x: C.round(tf.x + q[0] - p[0], 1), y: C.round(tf.y + q[1] - p[1], 1), label: `${i ? 'Fin' : 'Début'} du mur → extrémité de ${w.name}` };
        });
      }
      return best;
    }
    /** Entrepôt complet : 4 murs sur le contour de la zone de travail (groupés). */
    addBuilding() {
      if (!this.guardSim()) return;
      const st = this.project.settings, W = st.workW, Dp = st.workD;
      const gid = C.uid('g');
      const defs = [[0, 0, 0, W], [W, 0, 90, Dp], [W, Dp, 180, W], [0, Dp, 270, Dp]];
      const els = [];
      this.project.change('Entrepôt complet', () => defs.forEach(([x, y, rot, L], i) => {
        const e = this.project.createElement('wall', i === 0 ? { length: L, doors: `${Math.round(W / 2)};4000;4500` } : { length: L }, { x, y, z: 0, rot, groupId: gid });
        this.project.addElement(e); els.push(e);
      }));
      this.select(els.map(e => e.id));
      C.toast(`Entrepôt ${C.fmt(W / 1000, 1)} × ${C.fmt(Dp / 1000, 1)} m créé (4 murs groupés). Les convoyeurs qui traversent un mur y percent automatiquement une ouverture.`, 'ok');
    }

    /** Un rectangle (centre, cap, dimensions) chevauche-t-il un module existant de même niveau ? */
    mezzOverlap(x, y, rot, L, W, top, exclude) {
      const rect = (cx, cy, r, l, w) => {
        const c = Math.cos(r * D), s2 = Math.sin(r * D);
        return [[-l, -w], [l, -w], [l, w], [-l, w]].map(([a, b]) => [cx + a / 2 * c - b / 2 * s2, cy + a / 2 * s2 + b / 2 * c]);
      };
      const A = rect(x, y, rot, L - 60, W - 60);
      for (const m of this.project.elements) {
        if (m.type !== 'mezzanine' || (exclude && exclude.has(m.id)) || Math.abs(m.z + m.params.deckH - top) > 10) continue;
        const B = rect(m.x, m.y, m.rot, m.params.length - 60, m.params.width - 60);
        let sep = false;
        for (const P of [A, B]) for (let i = 0; i < 4 && !sep; i++) {
          const e = [P[(i + 1) % 4][0] - P[i][0], P[(i + 1) % 4][1] - P[i][1]], n = [-e[1], e[0]];
          const pa = A.map(q => q[0] * n[0] + q[1] * n[1]), pb = B.map(q => q[0] * n[0] + q[1] * n[1]);
          if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) sep = true;
        }
        if (!sep) return m;
      }
      return null;
    }
    /** Ensemble des modules accolés formant un même plateau. */
    plateau(m) {
      const all = this.project.elements.filter(e => e.type === 'mezzanine');
      const seen = new Set([m.id]), stack = [m];
      while (stack.length) {
        const a = stack.pop();
        for (const b of all) if (!seen.has(b.id) && this.mezzTouch(a, b)) { seen.add(b.id); stack.push(b); }
      }
      return all.filter(e => seen.has(e.id));
    }
    /**
     * Accrochage bord à bord d'un module de mezzanine contre un autre :
     * bords jointifs, coins alignés (ou centrés) et même hauteur de plancher.
     * translateOnly : ne pas changer l'orientation (déplacement avec objets posés).
     */
    findMezzSnap(el, tf, moving, translateOnly) {
      const R = Math.max(600, this.project.settings.snapRadius || 300);
      let best = null;
      for (const m of this.project.elements) {
        if (m.type !== 'mezzanine' || m.id === el.id || (moving && moving.has(m.id))) continue;
        const rel = C.normAngle((tf.rot - m.rot) * D);
        const k = Math.round(rel / (Math.PI / 2));
        if (Math.abs(rel - k * Math.PI / 2) > (translateOnly ? 0.5 : 10) * D) continue;
        const swap = Math.abs(k) % 2 === 1;
        const hl = (swap ? el.params.width : el.params.length) / 2, hw = (swap ? el.params.length : el.params.width) / 2;
        const ml = m.params.length / 2, mw = m.params.width / 2;
        const mtf = { x: m.x, y: m.y, z: 0, rot: m.rot };
        const c = C.worldToLocal(mtf, tf.x, tf.y, 0);
        const sides = [
          { name: 'droite', perp: 0, target: ml + hl, mh: mw, ch: hw }, { name: 'gauche', perp: 0, target: -ml - hl, mh: mw, ch: hw },
          { name: 'arrière', perp: 1, target: mw + hw, mh: ml, ch: hl }, { name: 'avant', perp: 1, target: -mw - hw, mh: ml, ch: hl }
        ];
        for (const sd of sides) {
          const cp = c[sd.perp], ca = c[1 - sd.perp];
          const d = Math.abs(cp - sd.target);
          if (d > R || Math.abs(ca) > sd.mh + sd.ch - 100) continue;
          // alignement le long du bord : coin bas, coin haut ou centré
          let na = ca, da = Infinity;
          for (const opt of [-sd.mh + sd.ch, sd.mh - sd.ch, 0]) if (Math.abs(opt - ca) < Math.min(R, Math.abs(da))) { da = opt - ca; na = opt; }
          const loc = sd.perp === 0 ? [sd.target, na] : [na, sd.target];
          const w = C.localToWorld(mtf, loc[0], loc[1], 0);
          const score = d + (isFinite(da) ? Math.abs(da) * 0.3 : 0);
          const nrot = translateOnly ? tf.rot : C.normAngle((m.rot + k * 90) * D) / D;
          const ex = new Set(moving || []); ex.add(el.id);
          if (this.mezzOverlap(w[0], w[1], nrot, el.params.length, el.params.width, m.z + m.params.deckH, ex)) continue;
          if (!best || score < best.score) best = {
            x: C.round(w[0], 1), y: C.round(w[1], 1), z: C.round(m.z + m.params.deckH - el.params.deckH, 1),
            rot: translateOnly ? tf.rot : C.round(C.normAngle((m.rot + k * 90) * D) / D, 3), score, label: `Accolé à ${m.name} (côté ${sd.name})`
          };
        }
      }
      return best;
    }
    /** Ajoute un module identique accolé (dir : 'xp' droite, 'xn' gauche, 'yp' arrière, 'yn' avant). */
    extendMezzanine(el, dir) {
      if (!this.guardSim()) return;
      const p = el.params;
      const off = { xp: [p.length, 0], xn: [-p.length, 0], yp: [0, p.width], yn: [0, -p.width] }[dir];
      const w = C.localToWorld({ x: el.x, y: el.y, z: 0, rot: el.rot }, off[0], off[1], 0);
      const top = el.z + p.deckH;
      if (this.project.elements.some(m => m.type === 'mezzanine' && m.id !== el.id && Math.abs(m.z + m.params.deckH - top) < 10 && this.onMezzanine(m, w[0], w[1]))) {
        C.toast('Un module de mezzanine occupe déjà cet emplacement', 'warn'); return;
      }
      const params = C.clone(p); params.stairs = 'none';
      const n = this.project.createElement('mezzanine', params, { x: C.round(w[0], 1), y: C.round(w[1], 1), z: el.z, rot: el.rot });
      this.commitNew(n);
      const pl = this.plateau(n);
      C.toast(`Module ajouté — plateau de ${pl.length} modules, ${C.fmt(pl.reduce((a, m) => a + m.params.length * m.params.width, 0) / 1e6, 1)} m²`, 'ok');
    }

    /* --------------------------- mezzanines / supports --------------------------- */
    /** Mezzanine dont l'emprise contient le point (x,y). */
    onMezzanine(m, x, y) {
      const l = C.worldToLocal({ x: m.x, y: m.y, z: m.z, rot: m.rot }, x, y, 0);
      return Math.abs(l[0]) <= m.params.length / 2 + 1 && Math.abs(l[1]) <= m.params.width / 2 + 1;
    }
    /**
     * Altitude du support (0 = sol, sinon dessus du plancher de mezzanine le plus
     * haut) sous le point (x,y), parmi les planchers situés sous maxZ.
     * exclude : identifiant ou ensemble d'identifiants à ignorer.
     */
    supportAt(x, y, maxZ, exclude) {
      let best = 0;
      const ex = exclude instanceof Set ? exclude : new Set(exclude ? [exclude] : []);
      for (const m of this.project.elements) {
        if (m.type !== 'mezzanine' || ex.has(m.id)) continue;
        const top = m.z + m.params.deckH;
        if (top > (maxZ === undefined ? Infinity : maxZ) + 1 || top <= best) continue;
        if (this.onMezzanine(m, x, y)) best = top;
      }
      return best;
    }
    mezzanineUnder(el) {
      let best = null;
      for (const m of this.project.elements) {
        if (m.type !== 'mezzanine' || m.id === el.id) continue;
        const top = m.z + m.params.deckH;
        if (top <= el.z + 1 && this.onMezzanine(m, el.x, el.y) && (!best || top > best.z + best.params.deckH)) best = m;
      }
      return best;
    }
    /** Éléments posés sur une mezzanine (récursif pour les mezzanines empilées). */
    ridersOf(mez, acc) {
      acc = acc || new Set();
      const top = mez.z + mez.params.deckH;
      for (const e of this.project.elements) {
        if (e === mez || acc.has(e.id)) continue;
        if (e.z >= top - 5 && this.onMezzanine(mez, e.x, e.y) && this.mezzanineUnder(e) === mez) {
          acc.add(e.id);
          if (e.type === 'mezzanine') this.ridersOf(e, acc);
        }
      }
      return acc;
    }
    /** Sélection + objets portés par les mezzanines sélectionnées. */
    withRiders(ids) {
      const out = new Set(ids);
      for (const id of ids) { const e = this.project.getElement(id); if (e && e.type === 'mezzanine') this.ridersOf(e).forEach(r => out.add(r)); }
      return Array.from(out);
    }
    /** Transporte les objets d'une mezzanine d'une ancienne pose vers la nouvelle. */
    carryRiders(riders, before, mez) {
      const tfB = { x: before.x, y: before.y, z: 0, rot: before.rot };
      const tfA = { x: mez.x, y: mez.y, z: 0, rot: mez.rot };
      const dTop = (mez.z + mez.params.deckH) - (before.z + before.deckH);
      for (const id of riders) {
        const r = this.project.getElement(id);
        if (!r) continue;
        const l = C.worldToLocal(tfB, r.x, r.y, 0);
        const w = C.localToWorld(tfA, l[0], l[1], 0);
        r.x = C.round(w[0], 1); r.y = C.round(w[1], 1); r.z = C.round(r.z + dTop, 1);
        r.rot = C.round(C.normAngle((r.rot + mez.rot - before.rot) * D) / D, 3);
      }
    }

    init() {
      this.viewport = new C.Viewport(document.getElementById('viewport'), this);
      this.sim = new C.Simulation(this);
      this.director = new C.Director(this);
      this.screenRec = new C.ScreenRecorder(this);
      this.fleet = new C.Fleet(this);
      this.ui = new C.UI(this);
      this.ui.build();
      this.project.on('changed', e => this.onChanged(e));
      this.sim.on('state', () => {
        this.ui.refreshSim(true);
        if (!this.sim.active && this.director.active) this.director.stop();
        // le panneau de propriétés se (dé)verrouille au démarrage / à l'arrêt de la simulation
        if (this._simWasActive !== this.sim.active) { this._simWasActive = this.sim.active; this.ui.refreshProps(); }
      });
      this.viewport.on('mode', m => { if (m !== 'mission') this.endMissionPick(); this.ui.refreshToolbar(); });
      this.loadInitial();
      this.bindKeys();
      let last = performance.now();
      const loop = now => {
        const dt = (now - last) / 1000; last = now;
        this.sim.frame(dt);
        this.director.update(Math.min(dt, 0.1));
        this.fleet.update(dt);
        this.viewport.render();
        this.director.afterRender();
        this.screenRec.afterRender();
        this.ui.tick(now);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      window.addEventListener('beforeunload', () => C.Storage.autosave(this.project, this.network));
    }

    loadInitial() {
      const auto = C.Storage.autosaved();
      try {
        if (auto && auto.elements) { this.loadData(auto, true); this.project.dirty = !!auto._dirty; return; }
      } catch (e) { console.warn('Reprise impossible', e); }
      this.loadDemo();
    }

    /* ---------------------- cycle de mise à jour ---------------------- */
    onChanged(e) {
      const st = this.project.settings;
      const wsSig = [st.workW, st.workD, st.gridStep].join();
      if (wsSig !== this._wsSig) { this._wsSig = wsSig; this.viewport.buildWorkspace(); }
      this.viewport.sync();
      if (this.sim.active) {
        for (const n of this.network.nodes.values()) if (n.def.routing) n.rules = C.parseRules(n.el.params.rules);
      } else {
        this.rebuildNetwork();
        this.viewport.rebuildDesignCartons();
      }
      this.pruneSelection();
      this.viewport.updateSelection();
      this.viewport.updateMeasures();
      this.ui.refresh();
      this.autosave();
      void e;
    }
    rebuildNetwork() {
      this.network = new C.Network(this.project);
      this.viewport.updatePorts();
    }
    autosave() {
      clearTimeout(this._autoT);
      this._autoT = setTimeout(() => {
        const d = this.project.toJSON(this.network);
        d._dirty = this.project.dirty;
        try { localStorage.setItem('convoy3d.autosave', JSON.stringify(d)); } catch (err) { /* plein */ }
      }, 700);
    }
    pruneSelection() {
      for (const id of Array.from(this.selection)) if (!this.project.getElement(id)) this.selection.delete(id);
      for (const id of Array.from(this.cartonSelection)) if (!this.project.getCarton(id) && !(this.sim.active && this.sim.cartonById(id))) this.cartonSelection.delete(id);
    }

    /** Remplace tout le projet (chargement, import, nouveau). */
    loadData(data, silent) {
      if (this.sim.active) this.sim.stop();
      this.project.load(data);
      this.afterLoad();
      if (data.camera) this.applyCamera(data.camera); else this.viewport.fit();
      if (!silent) C.toast(`Projet « ${this.project.name} » chargé`, 'ok');
    }
    afterLoad() {
      this.selection.clear(); this.cartonSelection.clear();
      const st = this.project.settings;
      this._wsSig = [st.workW, st.workD, st.gridStep].join();
      this.viewport.buildWorkspace();
      this.viewport.rebuildAll();
      this.rebuildNetwork();
      this.viewport.rebuildDesignCartons();
      this.viewport.updateSelection();
      this.viewport.updateMeasures();
      this.ui.refresh();
      this.autosave();
    }
    cameraState() {
      const o = this.viewport.orbit;
      return { target: [o.target.x, o.target.y, o.target.z], radius: o.radius, theta: o.theta, phi: o.phi, ortho: this.viewport.camera.isOrthographicCamera };
    }
    applyCamera(c) {
      const o = this.viewport.orbit;
      if (!c || !c.target) return;
      o.target.set(c.target[0], c.target[1], c.target[2]); o.radius = c.radius; o.theta = c.theta; o.phi = c.phi;
      this.viewport.setProjection(c.ortho ? 'ortho' : 'persp');
    }

    /* ---------------------------- projets ---------------------------- */
    newProject() {
      const go = () => { this.project.reset(); this.afterLoad(); this.viewport.setView('persp'); C.toast('Nouveau projet créé', 'ok'); };
      if (this.project.dirty && this.project.elements.length) this.ui.confirm('Le projet en cours contient des modifications non enregistrées. Continuer ?', go);
      else go();
    }
    save() {
      this.project.camera = this.cameraState();
      if (C.Storage.save(this.project, this.network)) { C.toast(`Projet « ${this.project.name} » enregistré dans le navigateur`, 'ok'); this.ui.refreshTitle(); }
    }
    saveAs(name) {
      this.project.id = C.uid('p');
      this.project.name = name || this.project.name;
      this.save();
    }
    openProject(id) {
      const d = C.Storage.load(id);
      if (!d) { C.toast('Projet introuvable', 'error'); return; }
      const go = () => this.loadData(d);
      if (this.project.dirty && this.project.elements.length) this.ui.confirm('Abandonner les modifications non enregistrées du projet en cours ?', go); else go();
    }
    importFile(file) {
      C.IO.importFile(file, (err, data) => {
        if (err) { C.toast('Lecture impossible : ' + err.message, 'error'); return; }
        try { this.loadData(data); this.project.dirty = true; } catch (e) { C.toast('Import impossible : ' + e.message, 'error'); }
      });
    }
    resetInstallation() {
      this.ui.confirm('Supprimer tous les éléments, cartons et mesures de l\'installation ?', () => {
        if (this.sim.active) this.sim.stop();
        this.project.change('Réinitialiser', () => { this.project.elements = []; this.project.cartons = []; this.project.measures = []; });
        this.selection.clear();
        C.toast('Installation réinitialisée (Ctrl+Z pour annuler)', 'ok');
      });
    }

    /* --------------------------- sélection --------------------------- */
    expandGroups(ids) {
      const out = new Set(ids);
      const groups = new Set();
      for (const id of ids) { const el = this.project.getElement(id); if (el && el.groupId) groups.add(el.groupId); }
      if (groups.size) for (const el of this.project.elements) if (groups.has(el.groupId)) out.add(el.id);
      return out;
    }
    select(ids, additive) {
      const set = this.expandGroups(ids || []);
      if (additive) for (const id of set) this.selection.add(id); else this.selection = set;
      if (!additive) this.cartonSelection.clear();
      this.viewport.updateSelection();
      this.ui.refreshProps(); this.ui.refreshTree();
    }
    toggleSelect(id) {
      const set = this.expandGroups([id]);
      const has = this.selection.has(id);
      for (const i of set) { if (has) this.selection.delete(i); else this.selection.add(i); }
      this.viewport.updateSelection();
      this.ui.refreshProps(); this.ui.refreshTree();
    }
    selectCarton(id) {
      this.selection.clear();
      this.cartonSelection = new Set([id]);
      this.viewport.updateSelection();
      this.ui.refreshProps(); this.ui.setRightTab('props');
    }
    selectAll() { this.select(this.project.elements.map(e => e.id)); }
    selectedElements() { return Array.from(this.selection).map(id => this.project.getElement(id)).filter(Boolean); }

    guardSim() {
      if (this.sim.active) { C.toast('Arrêtez la simulation (■ Arrêt) pour modifier l\'installation.', 'warn'); return false; }
      return true;
    }

    /* ------------------------ ports & accrochage ----------------------- */
    /** Ports d'un élément pour une transformation donnée (sans réseau). */
    elementPorts(el, tf) {
      const m = C.Types.model(el);
      const res = [];
      for (const mp of m.ports) {
        const tr = m.tracks[mp.track];
        if (!tr) continue;
        const path = new C.Path(tr.segs, tf, tr.reversed);
        const r = path.at(mp.at === 'start' ? 0 : path.length);
        res.push({ id: mp.id, role: mp.role, pos: r.p.slice(), h: Math.atan2(r.t[1], r.t[0]), optional: !!mp.optional });
      }
      return res;
    }
    /** Pose d'accrochage magnétique pour un élément à la transformation tf. */
    findSnapFor(el, tf, movingIds, portList, radius) {
      const st = this.project.settings, R = radius || st.snapRadius || 300;
      const moving = movingIds || new Set([el.id]);
      const mine = this.elementPorts(el, tf);
      const local = this.elementPorts(el, { x: 0, y: 0, z: 0, rot: 0 });
      let best = null;
      for (let i = 0; i < mine.length; i++) {
        const P = mine[i], Li = local[i];
        for (const Q of portList || this.network.ports) {
          if (moving.has(Q.el.id) || P.role === Q.role) continue;
          if (Q.role === 'in' && Q.linkedFrom.some(a => !moving.has(a.el.id))) continue;
          if (Q.role === 'out' && Q.link && !moving.has(Q.link.track.el.id)) continue;
          const d = Math.hypot(P.pos[0] - Q.pos[0], P.pos[1] - Q.pos[1]);
          if (d > R) continue;
          const rot = (Q.h - Li.h) / D;
          const c = Math.cos(rot * D), s = Math.sin(rot * D);
          const pose = {
            x: C.round(Q.pos[0] - (Li.pos[0] * c - Li.pos[1] * s), 1), y: C.round(Q.pos[1] - (Li.pos[0] * s + Li.pos[1] * c), 1),
            z: C.round(Q.pos[2] - Li.pos[2], 1), rot: C.round(C.normAngle(rot * D) / D, 3)
          };
          const score = d + Math.abs(C.normAngle((pose.rot - tf.rot) * D)) / D * 3;
          if (!best || score < best.score) best = Object.assign(pose, { score, label: `${P.role === 'in' ? 'Entrée' : 'Sortie'} → ${Q.el.name} (${Q.role === 'in' ? 'entrée' : 'sortie'})` });
        }
      }
      return best;
    }
    /** Accrochage pendant un déplacement (un ou plusieurs éléments). */
    findSnap(ids, dx, dy, orig, dz0, primId) {
      const moving = new Set(ids);
      const prim = primId && this.project.getElement(primId);
      if (prim && prim.type === 'lane' && ids.length === 1) {
        const o = orig.get(prim.id);
        const sn = this.findLaneSnap(prim, { x: o.x + dx, y: o.y + dy, z: 0, rot: o.rot }, moving);
        return sn ? { dx: sn.x - o.x, dy: sn.y - o.y, dz: 0, rot: Object.assign({}, sn), label: sn.label } : null;
      }
      if (prim && prim.type === 'wall') {
        const o = orig.get(prim.id);
        const sn = this.findWallSnap(prim, { x: o.x + dx, y: o.y + dy, z: o.z, rot: o.rot }, moving);
        return sn ? { dx: sn.x - o.x, dy: sn.y - o.y, dz: 0, rot: null, label: sn.label } : null;
      }
      if (prim && prim.type === 'mezzanine') {
        const o = orig.get(prim.id);
        const sn = this.findMezzSnap(prim, { x: o.x + dx, y: o.y + dy, z: o.z + (dz0 || 0), rot: o.rot }, moving, ids.length > 1);
        if (!sn) return null;
        if (ids.length === 1) return { dx: sn.x - o.x, dy: sn.y - o.y, dz: sn.z - o.z, rot: Object.assign({}, sn), label: sn.label };
        return { dx: sn.x - o.x, dy: sn.y - o.y, dz: sn.z - o.z, rot: null, label: sn.label };
      }
      if (ids.length === 1) {
        const el = this.project.getElement(ids[0]);
        if (!C.Types.get(el.type).conveyor) return null;
        const o = orig.get(el.id);
        const sn = this.findSnapFor(el, { x: o.x + dx, y: o.y + dy, z: o.z + (dz0 || 0), rot: o.rot }, moving);
        if (!sn) return null;
        return { dx: sn.x - o.x, dy: sn.y - o.y, dz: sn.z - o.z, rot: sn, label: sn.label };
      }
      const R = this.project.settings.snapRadius || 300;
      let best = null;
      for (const id of ids) {
        const el = this.project.getElement(id), o = orig.get(id);
        if (!C.Types.get(el.type).conveyor) continue;
        for (const P of this.elementPorts(el, { x: o.x + dx, y: o.y + dy, z: o.z + (dz0 || 0), rot: o.rot })) {
          for (const Q of this.network.ports) {
            if (moving.has(Q.el.id) || P.role === Q.role) continue;
            if (Math.abs(C.normAngle(P.h - Q.h)) > 3 * D) continue;
            const d = Math.hypot(P.pos[0] - Q.pos[0], P.pos[1] - Q.pos[1]);
            if (d <= R && (!best || d < best.d)) best = { d, dx: dx + Q.pos[0] - P.pos[0], dy: dy + Q.pos[1] - P.pos[1], dz: (dz0 || 0) + Q.pos[2] - P.pos[2], rot: null, label: `Groupe → ${Q.el.name}` };
          }
        }
      }
      return best;
    }
    beginMove() { return this.guardSim(); }
    commitMove(dr) {
      const { dx, dy, dz, rot } = dr.cur;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && Math.abs(dz) < 0.01 && !rot) { this.viewport.sync(new Set(dr.ids)); return; }
      this.project.change('Déplacer', () => {
        for (const id of dr.ids) {
          const el = this.project.getElement(id), o = dr.orig.get(id);
          if (rot && dr.ids.length === 1) { el.x = rot.x; el.y = rot.y; el.z = rot.z; el.rot = rot.rot; }
          else { el.x = C.round(o.x + dx, 1); el.y = C.round(o.y + dy, 1); el.z = C.round(o.z + dz, 1); }
        }
      });
    }

    /* --------------------------- ajout d'éléments --------------------------- */
    addFromLibrary(itemId, opts) {
      opts = opts || {};
      if (!this.guardSim()) return;
      const item = C.libraryItem(itemId);
      if (!item) return;
      if (item.action === 'building') { this.addBuilding(); return; }
      const def = C.Types.get(item.type);
      const st = this.project.settings;
      if (opts.at) {
        const g = st.snapStep || 50;
        const at = st.snapGrid ? opts.at.map(v => Math.round(v / g) * g) : opts.at;
        const el = this.project.createElement(item.type, item.params);
        el.x = at[0]; el.y = at[1];
        el.z = (el.type === 'mezzanine' ? 0 : this.supportAt(at[0], at[1])) + (def.conveyor ? st.defaultZ : 0);
        if (el.type === 'lane' && st.snapPorts) {
          const sn = this.findLaneSnap(el, el);
          if (sn) { el.x = sn.x; el.y = sn.y; el.rot = sn.rot; }
        }
        if (el.type === 'wall' && st.snapPorts) {
          const sn = this.findWallSnap(el, el);
          if (sn) { el.x = sn.x; el.y = sn.y; }
        }
        if (el.type === 'mezzanine' && st.snapPorts) {
          const sn = this.findMezzSnap(el, el);
          if (sn) { el.x = sn.x; el.y = sn.y; el.z = sn.z; el.rot = sn.rot; }
        }
        if (def.conveyor) {
          const sn = st.snapPorts ? this.findSnapFor(el, { x: el.x, y: el.y, z: el.z, rot: 0 }) : null;
          if (sn) { el.x = sn.x; el.y = sn.y; el.z = sn.z; el.rot = sn.rot; }
        }
        this.commitNew(el);
        return;
      }
      const sel = this.selectedElements();
      if (st.chainAdd && item.type === 'lane' && sel.length === 1 && sel[0].type === 'lane') {
        const out = this.elementPorts(sel[0], sel[0]).find(q => q.role === 'out');
        const taken = this.lanePorts(new Set([sel[0].id])).some(q => q.role === 'in' && Math.hypot(q.pos[0] - out.pos[0], q.pos[1] - out.pos[1]) < 50);
        if (out && !taken) { this.appendAt(out, item); return; }
      }
      if (st.chainAdd && def.conveyor && sel.length === 1 && C.Types.get(sel[0].type).conveyor) {
        const node = this.network.node(sel[0].id);
        const port = node && (node.ports.find(p => p.role === 'out' && !p.link && p.id === 'out') || node.ports.find(p => p.role === 'out' && !p.link && !p.optional));
        if (port) { this.appendAt(port, item); return; }
      }
      this.viewport.startPlace(item);
      C.toast('Cliquez dans la vue pour placer « ' + item.label + ' » (R : tourner, Échap : annuler, Maj : placer plusieurs)', 'info');
    }
    /** Ajoute un module accroché à un port de sortie. */
    appendAt(port, item, params) {
      const el = this.project.createElement(item.type, Object.assign({}, item.params, params || {}));
      Object.assign(el, this.poseAtPort(el, port));
      this.commitNew(el);
      return el;
    }
    poseAtPort(el, port) {
      const lin = this.elementPorts(el, { x: 0, y: 0, z: 0, rot: 0 }).find(p => p.role === 'in');
      const rot = (port.h - lin.h) / D;
      const c = Math.cos(rot * D), s = Math.sin(rot * D);
      return {
        x: C.round(port.pos[0] - (lin.pos[0] * c - lin.pos[1] * s), 1), y: C.round(port.pos[1] - (lin.pos[0] * s + lin.pos[1] * c), 1),
        z: C.round(port.pos[2] - lin.pos[2], 1), rot: C.round(C.normAngle(rot * D) / D, 3)
      };
    }
    placeElement(item, attrs) {
      if (!this.guardSim()) return;
      const el = this.project.createElement(item.type, item.params, attrs);
      this.commitNew(el);
    }
    commitNew(el) {
      this.project.change('Ajouter ' + el.name, () => this.project.addElement(el));
      this.select([el.id]);
      return el;
    }
    appendSame() {
      const sel = this.selectedElements();
      if (sel.length !== 1) return;
      const el = sel[0];
      const node = this.network.node(el.id);
      const port = node && node.ports.find(p => p.role === 'out' && !p.link && !p.optional);
      if (!port) { C.toast('Aucune sortie libre sur ' + el.name, 'warn'); return; }
      if (!this.guardSim()) return;
      const params = C.clone(el.params);
      this.appendAt(port, { type: el.type, params });
    }

    /* ------------------------- édition de la sélection ------------------------- */
    deleteSelection() {
      if (!this.guardSim()) return;
      const ids = Array.from(this.selection), cids = Array.from(this.cartonSelection);
      if (!ids.length && !cids.length) return;
      this.project.change('Supprimer', () => {
        this.project.removeElements(ids);
        this.project.cartons = this.project.cartons.filter(c => !cids.includes(c.id));
      });
      this.selection.clear(); this.cartonSelection.clear();
      this.viewport.updateSelection(); this.ui.refreshProps();
    }
    copy() {
      const els = this.selectedElements();
      if (!els.length) return;
      const ids = new Set(els.map(e => e.id));
      this.clipboard = { elements: C.clone(els), cartons: C.clone(this.project.cartons.filter(c => ids.has(c.elementId))) };
      this.pasteCount = 0;
      C.toast(`${els.length} élément(s) copié(s)`, 'info');
    }
    paste(offset) {
      if (!this.clipboard || !this.guardSim()) return;
      this.pasteCount++;
      const off = offset || [1000 * this.pasteCount, -1000 * this.pasteCount];
      const map = new Map(), gmap = new Map();
      const newEls = this.clipboard.elements.map(e => {
        const n = C.clone(e);
        n.id = C.uid('e'); map.set(e.id, n.id);
        n.x += off[0]; n.y += off[1];
        if (n.groupId) { if (!gmap.has(n.groupId)) gmap.set(n.groupId, C.uid('g')); n.groupId = gmap.get(n.groupId); }
        return n;
      });
      this.project.change('Coller', () => {
        for (const n of newEls) { n.name = this.project.nextName(n.type); this.project.addElement(n); }
        for (const c of this.clipboard.cartons) this.project.cartons.push(Object.assign(C.clone(c), { id: C.uid('k'), elementId: map.get(c.elementId) }));
      });
      this.select(newEls.map(e => e.id));
    }
    duplicate() {
      const els = this.selectedElements();
      if (!els.length) return;
      const keep = this.clipboard;
      this.copy();
      const W = Math.max(...els.map(e => e.params.width || 600));
      this.pasteCount = 0;
      this.paste([0, -(W + 300)]);
      this.clipboard = keep || this.clipboard;
    }
    rotateSelection(deg) {
      if (!this.guardSim()) return;
      const base = this.selectedElements();
      if (!base.length) return;
      const els = this.withRiders(base.map(e => e.id)).map(id => this.project.getElement(id));
      this.project.change('Rotation', () => {
        if (els.length === 1) { els[0].rot = C.round(C.normAngle((els[0].rot + deg) * D) / D, 3); return; }
        const piv = base.length === 1 ? base : els;
        const cx = piv.reduce((a, e) => a + e.x, 0) / piv.length, cy = piv.reduce((a, e) => a + e.y, 0) / piv.length;
        const c = Math.cos(deg * D), s = Math.sin(deg * D);
        for (const e of els) {
          const dx = e.x - cx, dy = e.y - cy;
          e.x = C.round(cx + dx * c - dy * s, 1); e.y = C.round(cy + dx * s + dy * c, 1);
          e.rot = C.round(C.normAngle((e.rot + deg) * D) / D, 3);
        }
      });
    }
    nudge(dx, dy, dz) {
      if (!this.guardSim()) return;
      const sel = this.selectedElements();
      if (!sel.length) return;
      const els = this.withRiders(sel.map(e => e.id)).map(id => this.project.getElement(id));
      this.project.change('Déplacer', () => { for (const e of els) { e.x += dx; e.y += dy; e.z = Math.max(0, e.z + dz); } }, 'nudge');
    }
    moveBy(dx, dy, dz) { this.nudge(dx, dy, dz); }
    reverseSelection() {
      if (!this.guardSim()) return;
      const els = this.selectedElements().filter(e => C.Types.get(e.type).fields.includes('reverse'));
      if (!els.length) { C.toast('Aucun élément réversible sélectionné', 'warn'); return; }
      this.project.change('Inverser le sens', () => els.forEach(e => { e.params.reverse = !e.params.reverse; }));
    }
    group() {
      const els = this.selectedElements();
      if (els.length < 2) { C.toast('Sélectionnez au moins 2 éléments (Ctrl+clic ou Maj+glisser)', 'warn'); return; }
      const gid = C.uid('g');
      this.project.change('Grouper', () => els.forEach(e => { e.groupId = gid; }));
      C.toast(`Groupe créé (${els.length} éléments)`, 'ok');
    }
    ungroup() {
      const els = this.selectedElements().filter(e => e.groupId);
      if (!els.length) return;
      this.project.change('Dégrouper', () => els.forEach(e => { e.groupId = null; }));
    }
    snapSelectionNow() {
      const els = this.selectedElements();
      if (els.length !== 1 || !this.guardSim()) return;
      const el = els[0];
      const old = this.project.settings.snapRadius;
      this.project.settings.snapRadius = 3000;
      const sn = this.findSnapFor(el, el);
      this.project.settings.snapRadius = old;
      if (!sn) { C.toast('Aucun port libre à proximité (3 m)', 'warn'); return; }
      this.project.change('Accrocher', () => { el.x = sn.x; el.y = sn.y; el.z = sn.z; el.rot = sn.rot; });
      C.toast('Accroché : ' + sn.label, 'ok');
    }
    undo() { if (this.guardSim() && this.project.undo()) this.viewport.setMode('select'); }
    redo() { if (this.guardSim()) this.project.redo(); }

    /** Modification d'un champ de propriétés sur un ou plusieurs éléments. */
    setField(ids, fid, value) {
      const f = C.FIELDS[fid];
      if (!f) return;
      if (this.sim.active && !f.live) { C.toast('Paramètre géométrique : arrêtez la simulation pour le modifier.', 'warn'); this.ui.refreshProps(); return; }
      let v = value;
      if (f.type === 'number') {
        v = parseFloat(String(value).replace(',', '.'));
        if (!isFinite(v)) { this.ui.refreshProps(); return; }
        if (f.min !== undefined) v = Math.max(f.min, v);
        if (f.max !== undefined) v = Math.min(f.max, v);
      }
      if (f.type === 'select' && f.options && typeof f.options[0][0] === 'number') v = +v;
      this.project.change('Modifier ' + f.label, () => {
        for (const id of ids) {
          const el = this.project.getElement(id);
          if (!el) continue;
          if (el.type === 'mezzanine' && ['x', 'y', 'z', 'rot', 'deckH'].includes(fid)) {
            const riders = Array.from(this.ridersOf(el)).filter(r => !ids.includes(r));
            const before = { x: el.x, y: el.y, z: el.z, rot: el.rot, deckH: el.params.deckH };
            if (f.attr) el[f.k] = v; else el.params[f.k] = v;
            this.carryRiders(riders, before, el);
            continue;
          }
          const def = C.Types.get(el.type);
          if (!def.fields.includes(fid) && !(fid === 'z' && (def.fields.includes('zBase') || def.fields.includes('convH')))) continue;
          if (el.type === 'osr' && fid === 'towers') { el.params.towers = Math.round(v); continue; }
          if (f.set) { f.set(el, v); continue; }
          if (f.attr) { el[f.k] = v; continue; }
          if (fid === 'width' && el.params.usefulWidth !== undefined) {
            const margin = el.params.width - el.params.usefulWidth;
            el.params.width = v; el.params.usefulWidth = Math.max(50, v - margin);
            continue;
          }
          if (fid === 'usefulWidth') v = Math.min(v, el.params.width - 20);
          el.params[f.k] = v;
        }
      }, 'field:' + fid + ':' + ids.join(','));
    }

    /* ------------------------------ cartons ------------------------------ */
    placeCartonAt(elId, point) {
      const tr = this.network.mainTrack(elId);
      if (!tr) { C.toast('Les cartons se posent sur un convoyeur', 'warn'); return; }
      const n = tr.path.nearest(point[0], point[1], point[2]);
      const f = this.project.format(this.currentFormat);
      const half = f.L / 2;
      const s = C.clamp(n.s, Math.min(half, tr.length / 2), Math.max(tr.length - half, tr.length / 2));
      if (this.sim.active) {
        const spec = { name: f.name, ref: f.ref, formatName: f.name, formatId: f.id, L: f.L, W: f.W, H: f.H, weight: f.weight, color: f.color, speed: 0, kind: f.kind || 'box' };
        this.sim.spawn(tr, s, spec, 0, 'Manuel');
        return;
      }
      const c = { id: C.uid('k'), elementId: elId, track: tr.id, s: C.round(s, 0), formatId: f.id, orientation: 0, name: '', speed: 0, overrides: {} };
      this.project.change('Ajouter un carton', () => this.project.cartons.push(c));
      this.cartonSelection = new Set([c.id]); this.selection.clear();
      this.viewport.updateSelection(); this.ui.refreshProps();
    }
    setCartonField(id, key, value) {
      const c = this.project.getCarton(id);
      if (!c) return;
      if (!this.guardSim()) return;
      this.project.change('Modifier le carton', () => {
        if (['L', 'W', 'H', 'weight', 'color', 'ref'].includes(key)) {
          c.overrides = c.overrides || {};
          if (value === '' || value === null) delete c.overrides[key];
          else c.overrides[key] = key === 'color' || key === 'ref' ? value : Math.max(0, parseFloat(value) || 0);
        } else if (key === 's' || key === 'speed' || key === 'orientation') c[key] = parseFloat(value) || 0;
        else c[key] = value;
      }, 'carton:' + key + id);
    }

    /* ------------------------------ mesures ------------------------------ */
    addMeasure(a, b) {
      this.project.change('Mesure', () => this.project.measures.push({ a, b }));
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      C.toast(`Distance : ${C.fmt(d)} mm (plan ${C.fmt(Math.hypot(b[0] - a[0], b[1] - a[1]))} mm, ΔZ ${C.fmt(b[2] - a[2])} mm)`, 'info');
    }
    clearMeasures() { if (this.project.measures.length) this.project.change('Effacer les mesures', () => { this.project.measures = []; }); }

    /* ---------------------------- menu contextuel ---------------------------- */
    contextMenu(e, hit) {
      const items = [];
      if (hit && hit.element) {
        if (!this.selection.has(hit.element)) this.select([hit.element]);
        items.push(['Ajouter à la suite (même module)', () => this.appendSame()]);
        items.push(['Dupliquer', () => this.duplicate()], ['Rotation +' + this.project.settings.angleStep + '°', () => this.rotateSelection(this.project.settings.angleStep)]);
        items.push(['Rotation +90°', () => this.rotateSelection(90)], ['Inverser le sens', () => this.reverseSelection()]);
        items.push(['Accrocher au port le plus proche', () => this.snapSelectionNow()], ['Cadrer la vue', () => this.viewport.focus(hit.element)]);
        items.push(['Copier', () => this.copy()], null, ['Supprimer', () => this.deleteSelection()]);
      } else if (hit && (hit.carton || hit.simCarton)) {
        this.selectCarton(hit.carton || hit.simCarton);
        if (hit.carton) items.push(['Supprimer le carton', () => this.deleteSelection()]);
        else items.push(['Retirer ce carton de la simulation', () => { const c = this.sim.cartonById(hit.simCarton); if (c) this.sim.removeCarton(c, false); }]);
      } else {
        items.push(['Coller', () => this.paste()], ['Tout sélectionner', () => this.selectAll()], ['Vue d\'ensemble', () => this.viewport.fit()]);
      }
      this.ui.popupMenu(e.clientX, e.clientY, items);
    }

    /* ------------------------------- clavier ------------------------------- */
    bindKeys() {
      window.addEventListener('keydown', e => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
          if (e.key === 'Escape') e.target.blur();
          return;
        }
        if (this.ui.modalOpen()) { if (e.key === 'Escape') this.ui.closeModal(); return; }
        const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        const st = this.project.settings;
        const step = (e.shiftKey ? 10 : 1) * (st.snapStep || 50);
        let handled = true;
        if (ctrl && k === 'z' && !e.shiftKey) this.undo();
        else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) this.redo();
        else if (ctrl && k === 'c') this.copy();
        else if (ctrl && k === 'v') this.paste();
        else if (ctrl && k === 'd') this.duplicate();
        else if (ctrl && k === 'a') this.selectAll();
        else if (ctrl && k === 'g' && e.shiftKey) this.ungroup();
        else if (ctrl && k === 'g') this.group();
        else if (ctrl && k === 's') this.save();
        else if (ctrl && k === 'o') this.ui.projectsDialog();
        else if (ctrl && k === 'e') C.IO.exportJSON(this);
        else if (ctrl) handled = false;
        else if (k === 'delete' || k === 'backspace') this.deleteSelection();
        else if (k === 'escape' && this.director.active) this.director.stop();
        else if (k === 'escape') { if (this.viewport.mode !== 'select') this.viewport.setMode('select'); else this.select([]); }
        else if (k === 'r') { if (this.viewport.mode === 'place') this.viewport.rotateGhost(e.shiftKey ? -st.angleStep : st.angleStep); else this.rotateSelection(e.shiftKey ? -st.angleStep : st.angleStep); }
        else if (k === 'f') { if (this.selection.size) this.viewport.fit(true, Array.from(this.selection)); else this.viewport.fit(); }
        else if (k === '1') this.viewport.setView('top');
        else if (k === '2') this.viewport.setView('front');
        else if (k === '3') this.viewport.setView('side');
        else if (k === '4') this.viewport.setView('iso');
        else if (k === '5' || k === '0') this.viewport.setView('persp');
        else if (k === 'p') this.viewport.setProjection(this.viewport.camera.isOrthographicCamera ? 'persp' : 'ortho');
        else if (k === 'm') this.viewport.setMode(this.viewport.mode === 'measure' ? 'select' : 'measure');
        else if (k === 'k') this.viewport.setMode(this.viewport.mode === 'carton' ? 'select' : 'carton');
        else if (k === 'i') this.reverseSelection();
        else if (k === 'n') this.appendSame();
        else if (k === ' ') this.sim.toggle();
        else if (k === 'arrowleft') this.nudge(-step, 0, 0);
        else if (k === 'arrowright') this.nudge(step, 0, 0);
        else if (k === 'arrowup') this.nudge(0, step, 0);
        else if (k === 'arrowdown') this.nudge(0, -step, 0);
        else if (k === 'pageup') this.nudge(0, 0, step);
        else if (k === 'pagedown') this.nudge(0, 0, -step);
        else handled = false;
        if (handled) { e.preventDefault(); this.ui.refreshToolbar(); }
      });
    }

    /* --------------------------- projet d'exemple --------------------------- */
    loadDemo() {
      const p = this.project;
      p.reset('Exemple — centre de tri');
      p.settings.workW = 36000; p.settings.workD = 24000;
      const add = (type, params, attrs) => { const el = p.createElement(type, params, attrs); p.addElement(el); return el; };
      const after = (prev, portId, type, params) => {
        const port = this.elementPorts(prev, prev).find(q => q.id === portId);
        const el = p.createElement(type, params);
        Object.assign(el, this.poseAtPort(el, port));
        p.addElement(el);
        return el;
      };
      // ---- Ligne principale : injection, montée, accumulation, tri
      const in1 = add('source', { rate: 1100, formats: ['petit', 'moyen', 'grand'], name: 'IN-01' }, { x: 2000, y: 4000, z: 800, rot: 0 });
      let e = after(in1, 'out', 'straight', { length: 3000 });
      e = after(e, 'out', 'curve', { angle: 90, side: 'left' });
      e = after(e, 'out', 'straight', { length: 2000 });
      e = after(e, 'out', 'straight', { surface: 'belt', slope: 10, length: 3000, color: '#2c3e50', guideH: 80, speed: 0.6 });
      e = after(e, 'out', 'straight', { length: 1200 });
      e = after(e, 'out', 'curve', { angle: 90, side: 'right' });
      e = after(e, 'out', 'accumulation', { length: 4200, zoneLength: 700 });
      e = after(e, 'out', 'separator', { interval: 2.4, length: 1000 });
      const sorter = after(e, 'out', 'sorter', { outputs: 3, sortSide: 'right', mode: 'rules', rules: '1 : format=Petit\n2 : format=Grand', length: 3600 });
      e = after(sorter, 'out', 'straight', { surface: 'belt', slope: -10, length: 3000, color: '#2c3e50', guideH: 80 });
      e = after(e, 'out', 'straight', { length: 1000 });
      after(e, 'out', 'sink', { name: 'OUT-MOYEN' });
      // sorties du trieur → descentes gravitaires
      for (const [k, name] of [[1, 'OUT-PETIT'], [2, 'OUT-GRAND']]) {
        let s = after(sorter, 'o' + k, 'straight', { length: 1200 });
        s = after(s, 'out', 'straight', { surface: 'freerollers', slope: -6, length: 3200, speed: 0.9, color: '#95a5a6', name: undefined });
        after(s, 'out', 'sink', { name, length: 1000 });
      }
      // ---- Ligne 2 : transfert, poste de préparation, butée, élévateur, spirale
      const in2 = add('source', { rate: 360, formats: ['europe', 'bac'], name: 'IN-02', orientation: 0 }, { x: 2000, y: 19000, z: 800, rot: 0 });
      e = after(in2, 'out', 'straight', { length: 2000 });
      const tr = after(e, 'out', 'transfer', { sides: 'right', mode: 'cyclic' });
      e = after(tr, 'out', 'straight', { length: 1500 });
      e = after(e, 'out', 'workstation', { processTime: 6 });
      e = after(e, 'out', 'stop', { stopMode: 'timed', holdTime: 1.5 });
      e = after(e, 'out', 'straight', { length: 1000 });
      e = after(e, 'out', 'elevator', { elevH: 1700, config: 'Z' });
      e = after(e, 'out', 'straight', { length: 2400 });
      e = after(e, 'out', 'spiral', { rise: -1700, turns: 1.25, side: 'right', radius: 1100 });
      e = after(e, 'out', 'straight', { length: 1500 });
      after(e, 'out', 'sink', { name: 'OUT-L2' });
      // dérivation latérale du transfert → table tournante → deux sorties
      e = after(tr, 'oR', 'straight', { length: 1800 });
      const tt = after(e, 'out', 'turntable', { outAngles: '90,-90', mode: 'cyclic' });
      let a = after(tt, 'o1', 'straight', { length: 1500 }); after(a, 'out', 'sink', { name: 'OUT-TT-A' });
      let b = after(tt, 'o2', 'straight', { length: 1500 }); after(b, 'out', 'sink', { name: 'OUT-TT-B' });
      // obstacle / table / guide pour illustration
      add('table', { name: 'TAB-01' }, { x: 33500, y: 2200, z: 0, rot: 0 });
      // stockage à navettes (2 tours) : chaque tour a son entrée et sa sortie de caisses ;
      // boucle de picking par tour : sortie → poste → demi-tour → retour dans l'entrée de la même tour
      const osr = add('osr', { name: 'OSR-01', towers: 2, towerWidth: 3000, rackLength: 5500, towerRate: 250 }, { x: 22000, y: 6000, z: 800, rot: 0 });
      for (let k = 1; k <= 2; k++) {
        const off = C.Types.defs.osr.lanesX(osr.params, 0);
        e = after(osr, 's' + k, 'straight', { length: 1000 });
        e = after(e, 'out', 'workstation', { processTime: 6, name: 'PICK-0' + k, opSide: 'left' });
        e = after(e, 'out', 'straight', { length: 600 });
        e = after(e, 'out', 'curve', { angle: 180, side: 'right', radius: off.xout - off.xc });
        after(e, 'out', 'straight', { length: 4000 });
      }
      // rayonnage double à 4 niveaux
      add('rack', { name: 'RK-01', rows: 2, levels: 4, bays: 3 }, { x: 33000, y: 8500, z: 0, rot: 90 });
      // cariste CACES 5 et palettes au sol
      add('reachtruck', { name: 'CAR-01', driverName: 'Cariste 1' }, { x: 28800, y: 8500, z: 0, rot: 0 });
      add('pallet', { name: 'PAL-01', palletType: 'euro', loaded: true }, { x: 28500, y: 5200, z: 0, rot: 90 });
      add('pallet', { name: 'PAL-02', palletType: 'perdue', loaded: true, loadColor: '#c49a62' }, { x: 30000, y: 5200, z: 0, rot: 90 });
      // fléchage au sol (allée à sens unique devant le rack) et protections
      add('lane', { name: 'ALL-01', length: 6500, width: 2400 }, { x: 30600, y: 11300, z: 0, rot: -90 });
      add('bollard', { name: 'POT-01' }, { x: 31600, y: 4250, z: 0 });
      add('bollard', { name: 'POT-02' }, { x: 31600, y: 12750, z: 0 });
      add('barrier', { name: 'BAR-01', length: 2400 }, { x: 31800, y: 4150, z: 0, rot: 0 });
      add('obstacle', { name: 'POTEAU-01', length: 300, width: 300, height: 4000 }, { x: 30000, y: 12000, z: 0 });
      // mezzanine avec un poste de travail à l'étage
      add('mezzanine', { name: 'MEZ-01', stairs: 'left' }, { x: 27500, y: 18500, z: 0, rot: 0 });
      add('table', { name: 'TAB-02' }, { x: 27500, y: 19000, z: 3000, rot: 0 });
      const in3 = add('source', { rate: 240, formats: ['colis'], name: 'IN-03' }, { x: 24500, y: 17200, z: 3800, rot: 0 });
      e = after(in3, 'out', 'straight', { length: 4000 });
      after(e, 'out', 'sink', { name: 'OUT-MEZ' });
      // cartons posés
      p.cartons.push({ id: C.uid('k'), elementId: in2.id, track: 'main', s: 400, formatId: 'europe', orientation: 0, name: 'Carton posé', speed: 0, overrides: {} });
      p.dirty = false;
      this.afterLoad();
      this.viewport.setView('persp');
      this.viewport.fit();
    }
  }

  C.App = App;
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.THREE) { document.body.innerHTML = '<p style="color:#fff;padding:20px">Erreur : Three.js introuvable (vendor/three.min.js).</p>'; return; }
    C.app = new App();
    C.app.init();
  });
})(window.C3D);
