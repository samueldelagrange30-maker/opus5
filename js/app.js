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
      this.ui = new C.UI(this);
      this.ui.build();
      this.project.on('changed', e => this.onChanged(e));
      this.sim.on('state', () => this.ui.refreshSim(true));
      this.viewport.on('mode', () => this.ui.refreshToolbar());
      this.loadInitial();
      this.bindKeys();
      let last = performance.now();
      const loop = now => {
        const dt = (now - last) / 1000; last = now;
        this.sim.frame(dt);
        this.viewport.render();
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
    findSnapFor(el, tf, movingIds) {
      const st = this.project.settings, R = st.snapRadius || 300;
      const moving = movingIds || new Set([el.id]);
      const mine = this.elementPorts(el, tf);
      const local = this.elementPorts(el, { x: 0, y: 0, z: 0, rot: 0 });
      let best = null;
      for (let i = 0; i < mine.length; i++) {
        const P = mine[i], Li = local[i];
        for (const Q of this.network.ports) {
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
    findSnap(ids, dx, dy, orig, dz0) {
      const moving = new Set(ids);
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
      const def = C.Types.get(item.type);
      const st = this.project.settings;
      if (opts.at) {
        const g = st.snapStep || 50;
        const at = st.snapGrid ? opts.at.map(v => Math.round(v / g) * g) : opts.at;
        const el = this.project.createElement(item.type, item.params);
        el.x = at[0]; el.y = at[1];
        el.z = this.supportAt(at[0], at[1]) + (def.conveyor ? st.defaultZ : 0);
        if (def.conveyor) {
          const sn = st.snapPorts ? this.findSnapFor(el, { x: el.x, y: el.y, z: el.z, rot: 0 }) : null;
          if (sn) { el.x = sn.x; el.y = sn.y; el.z = sn.z; el.rot = sn.rot; }
        }
        this.commitNew(el);
        return;
      }
      const sel = this.selectedElements();
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
          if (!def.fields.includes(fid) && !(fid === 'z' && def.fields.includes('zBase'))) continue;
          if (el.type === 'osr' && ['towers', 'towerWidth', 'endLength'].includes(fid)) {
            // les tours sont ajoutées / retirées côté début du collecteur : la sortie
            // (et la ligne de retour) restent en place et raccordées
            const outBefore = this.elementPorts(el, el).find(q => q.id === 'out').pos;
            el.params[f.k] = fid === 'towers' ? Math.round(v) : v;
            const outAfter = this.elementPorts(el, el).find(q => q.id === 'out').pos;
            el.x = C.round(el.x + outBefore[0] - outAfter[0], 1); el.y = C.round(el.y + outBefore[1] - outAfter[1], 1);
            continue;
          }
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
        const spec = { name: f.name, ref: f.ref, formatName: f.name, formatId: f.id, L: f.L, W: f.W, H: f.H, weight: f.weight, color: f.color, speed: 0 };
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
      // stockage à navettes (2 tours) → poste de picking → retour en stock
      const osr = add('osr', { name: 'OSR-01', towers: 2, rackLength: 6000, towerRate: 250 }, { x: 22000, y: 2500, z: 800, rot: 0 });
      e = after(osr, 'out', 'straight', { length: 1000 });
      e = after(e, 'out', 'workstation', { processTime: 5, name: 'PICK-01' });
      e = after(e, 'out', 'curve', { angle: 90, side: 'right' });
      e = after(e, 'out', 'curve', { angle: 90, side: 'right' });
      after(e, 'out', 'straight', { length: 3400 });
      // rayonnage double à 4 niveaux
      add('rack', { name: 'RK-01', rows: 2, levels: 4, bays: 3 }, { x: 33000, y: 8500, z: 0, rot: 90 });
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
