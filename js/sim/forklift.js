/* =====================================================================
 * Convoy3D — Cariste CACES 5 (chariot à mât rétractable) : missions animées
 *
 * Une mission = prendre une palette (au sol ou dans un emplacement de rack)
 * puis la déposer (au sol, sur une mezzanine ou dans un emplacement libre).
 * Le chariot enchaîne les phases : approche, levée, avancée du mât, prise,
 * recul, descente, trajet, levée, avancée, dépose, recul, descente.
 * Les changements (palette retirée / déposée, emplacement vidé / rempli,
 * position finale du chariot) sont enregistrés dans l'historique.
 * ===================================================================== */
(function (C) {
  'use strict';
  const D = C.DEG, M = 0.001;
  const TRAVEL_Z = 150;          // hauteur des fourches en déplacement (mm)
  const REACH_STROKE = 750;      // course du mât (mm)
  const TURN_RATE = 75 * D;      // vitesse de rotation (rad/s)
  const REACH_SPEED = 0.3;       // vitesse d'avancée du mât (m/s)

  class Fleet {
    constructor(app) { this.app = app; this.jobs = new Map(); }

    job(id) {
      if (!this.jobs.has(id)) this.jobs.set(id, { queue: [], cur: null, pose: null, payload: null, log: [] });
      return this.jobs.get(id);
    }
    busy(id) { const j = this.jobs.get(id); return !!(j && (j.cur || j.queue.length)); }
    anyBusy() { for (const id of this.jobs.keys()) if (this.busy(id)) return true; return false; }

    /** Description lisible d'une origine / destination. */
    describe(loc) {
      const p = this.app.project;
      if (loc.kind === 'rack') {
        const r = p.getElement(loc.rackId);
        return r ? `${r.name} · ${C.Types.defs.rack.address(r.params, loc.r, loc.j, loc.k)}` : 'rack ?';
      }
      if (loc.kind === 'pallet') { const e = p.getElement(loc.id); return e ? `${e.name} (sol)` : 'palette ?'; }
      return `sol X ${C.fmt(loc.x)} · Y ${C.fmt(loc.y)}${loc.z > 1 ? ` · Z ${C.fmt(loc.z)}` : ''}`;
    }

    /** Ajoute une mission (validée) à la file du chariot. */
    addMission(truckId, from, to) {
      const j = this.job(truckId);
      j.queue.push({ from, to, id: C.uid('m') });
      C.toast(`Mission ajoutée : ${this.describe(from)} → ${this.describe(to)}`, 'ok');
      this.app.ui.refreshProps();
    }
    cancel(truckId) {
      const j = this.jobs.get(truckId);
      if (!j) return;
      j.queue = [];
      C.toast('Missions en attente annulées (la mission en cours se termine)', 'info');
      this.app.ui.refreshProps();
    }

    /* ----------------------------- géométrie ----------------------------- */
    /** Pose de prise / dépose : centre de la palette (monde), cap des fourches, altitude de base. */
    target(loc, truck) {
      const p = this.app.project;
      if (loc.kind === 'rack') {
        const r = p.getElement(loc.rackId);
        if (!r) return null;
        const s = C.Types.defs.rack.slotLocal(r.params, loc.r, loc.j, loc.k, loc.q);
        const w = C.localToWorld({ x: r.x, y: r.y, z: r.z, rot: r.rot }, s.x, s.y, s.z);
        // fourches dirigées vers l'intérieur du rack depuis la face d'accès
        return { x: w[0], y: w[1], z: r.z + s.z, rot: C.normAngle((r.rot + (s.face < 0 ? 90 : -90)) * D) / D };
      }
      let x, y, z, baseRot;
      if (loc.kind === 'pallet') { const e = p.getElement(loc.id); if (!e) return null; x = e.x; y = e.y; z = e.z; baseRot = e.rot; }
      else { x = loc.x; y = loc.y; z = loc.z || 0; baseRot = null; }
      const pose = truck.pose;
      if (baseRot === null) baseRot = Math.atan2(y - pose.y, x - pose.x) / D;   // dépose : dans l'axe d'arrivée
      // palette au sol : prise par le côté (de la longueur 1200) le plus proche du chariot
      const a = baseRot * D, b = a + Math.PI;
      const da = Math.hypot(x - Math.cos(a) * 1500 - pose.x, y - Math.sin(a) * 1500 - pose.y);
      const db = Math.hypot(x - Math.cos(b) * 1500 - pose.x, y - Math.sin(b) * 1500 - pose.y);
      return { x, y, z, rot: (da <= db ? a : b) / D };
    }

    /** Plan de mouvement d'une mission. */
    plan(truckEl, job, mission) {
      const p = truckEl.params;
      const tFrom = this.target(mission.from, job);
      if (!tFrom) return null;
      const reach = C.Types.defs.reachtruck.reachOut;
      const approach = t => ({ x: t.x - Math.cos(t.rot * D) * reach, y: t.y - Math.sin(t.rot * D) * reach, rot: t.rot });
      const steps = [];
      const pickZ = tFrom.z + 60;
      steps.push({ t: 'drive', to: approach(tFrom), label: 'Approche de la palette' });
      steps.push({ t: 'lift', z: pickZ, label: 'Levée des fourches' });
      steps.push({ t: 'reach', v: 1, label: 'Avancée du mât' });
      steps.push({ t: 'lift', z: pickZ + 120, label: 'Prise de la palette' });
      steps.push({ t: 'pick' });
      steps.push({ t: 'reach', v: 0, label: 'Recul du mât' });
      steps.push({ t: 'lift', z: TRAVEL_Z + Math.max(0, 0), label: 'Descente en position de transport' });
      steps.push({ t: 'dropTarget' });   // calculé après la prise (le chariot a bougé)
      if (pickZ > p.maxLift) return { error: `Hauteur de prise ${C.fmt(pickZ)} mm supérieure à la levée maxi (${C.fmt(p.maxLift)} mm).` };
      return { steps, tFrom };
    }

    /* ----------------------------- animation ----------------------------- */
    update(dtReal) {
      if (!this.jobs.size) return;
      const app = this.app;
      const k = app.sim.active && app.sim.running ? app.sim.speed : 1;
      const dt = Math.min(0.1, dtReal) * k;
      for (const [id, job] of this.jobs) {
        const el = app.project.getElement(id);
        if (!el) { this.jobs.delete(id); continue; }
        if (!job.cur && job.queue.length) this.startMission(el, job);
        if (job.cur) this.stepMission(el, job, dt);
        if (job.pose) this.applyPose(el, job);
      }
    }
    startMission(el, job) {
      const mission = job.queue.shift();
      job.pose = { x: el.x, y: el.y, rot: el.rot, reach: 0, forkZ: TRAVEL_Z };
      const pl = this.plan(el, job, mission);
      if (!pl || pl.error) { C.toast(`${el.name} : mission impossible — ${pl ? pl.error : 'origine introuvable'}`, 'error'); return; }
      // vérification de l'origine
      if (mission.from.kind === 'rack') {
        const r = this.app.project.getElement(mission.from.rackId);
        if (!r || !C.Types.defs.rack.slotOccupied(r, mission.from.key)) { C.toast(`${el.name} : l'emplacement ${this.describe(mission.from)} est vide`, 'warn'); return; }
      }
      job.cur = { mission, steps: pl.steps, i: 0, sub: 0 };
      job.status = pl.steps[0].label;
      this.app.ui.refreshProps();
    }
    finishMission(el, job) {
      const pose = job.pose;
      job.cur = null; job.status = '';
      this.app.project.change(`${el.name} : fin de mission`, () => {
        el.x = C.round(pose.x, 1); el.y = C.round(pose.y, 1); el.rot = C.round(C.normAngle(pose.rot * D) / D, 2);
      });
      job.pose = null;
      this.app.ui.refreshProps();
    }

    stepMission(el, job, dt) {
      const cur = job.cur, pose = job.pose, p = el.params;
      const st = cur.steps[cur.i];
      if (!st) { this.finishMission(el, job); return; }
      if (st.label && job.status !== st.label) {
        job.status = st.label;
        if (this.app.selection.has(el.id)) this.app.ui.refreshProps();
      }
      let done = false;
      switch (st.t) {
        case 'drive': done = this.drive(pose, st, dt, p.travelSpeed || 1.8, el, job); break;
        case 'lift': {
          const v = (p.forkSpeed || 0.35) * 1000 * dt, d = st.z - pose.forkZ;
          pose.forkZ += C.clamp(d, -v, v); done = Math.abs(st.z - pose.forkZ) < 0.5; break;
        }
        case 'reach': {
          const v = REACH_SPEED * 1000 / REACH_STROKE * dt, d = st.v - pose.reach;
          pose.reach += C.clamp(d, -v, v); done = Math.abs(st.v - pose.reach) < 1e-3; break;
        }
        case 'pick': this.doPick(el, job); done = true; break;
        case 'drop': this.doDrop(el, job); done = true; break;
        case 'dropTarget': {
          const to = cur.mission.to;
          const t = this.target(to, job);
          if (!t) { C.toast(`${el.name} : destination introuvable`, 'error'); cur.steps.splice(cur.i + 1); done = true; break; }
          if (to.kind === 'rack') {
            const r = this.app.project.getElement(to.rackId);
            if (r && C.Types.defs.rack.slotOccupied(r, to.key)) C.toast(`${el.name} : l'emplacement ${this.describe(to)} est déjà occupé, dépose quand même au plus près`, 'warn');
          }
          const dropZ = t.z + 60;
          if (dropZ > p.maxLift) C.toast(`${el.name} : dépose à ${C.fmt(dropZ)} mm au-delà de la levée maxi`, 'warn');
          const reach = C.Types.defs.reachtruck.reachOut;
          cur.dropT = t;
          cur.steps.splice(cur.i + 1, 0,
            { t: 'drive', to: { x: t.x - Math.cos(t.rot * D) * reach, y: t.y - Math.sin(t.rot * D) * reach, rot: t.rot }, label: 'Transport de la palette' },
            { t: 'lift', z: dropZ + 120, label: 'Levée à la hauteur de dépose' },
            { t: 'reach', v: 1, label: 'Avancée du mât' },
            { t: 'lift', z: dropZ - 30, label: 'Dépose de la palette' },
            { t: 'drop' },
            { t: 'reach', v: 0, label: 'Recul du mât' },
            { t: 'lift', z: TRAVEL_Z, label: 'Descente des fourches' });
          done = true; break;
        }
      }
      if (done) { cur.i++; cur.sub = 0; if (cur.i >= cur.steps.length) this.finishMission(el, job); }
    }

    /**
     * Déplacement le long d'un itinéraire planifié (contournement des obstacles,
     * respect du fléchage au sol), puis orientation finale. Renvoie true à l'arrivée.
     */
    drive(pose, st, dt, speed, el, job) {
      const to = st.to;
      if (!st.route) {
        const exclude = new Set([el.id]);
        const from = job.cur && job.cur.mission.from;
        if (from && from.kind === 'pallet') exclude.add(from.id);
        const r = C.Planner.route(this.app.project, [pose.x, pose.y], [to.x, to.y], { exclude, followLanes: el.params.followLanes !== false });
        st.route = r.pts.slice(1);
        st.wp = 0;
        if (!r.ok) C.toast(`${el.name} : aucun passage libre trouvé, trajet direct`, 'warn');
        else if (r.lanesAvailable && !r.lanes) C.toast(`${el.name} : aucun itinéraire ne respecte le fléchage jusqu'à la destination — trajet libre`, 'warn');
        job.route = [[pose.x, pose.y]].concat(r.pts.slice(1));
        job.routeLanes = r.lanes;
        this.showRoute(el, job);
      }
      const turnTo = (target, rate) => {
        const d = C.normAngle(target - pose.rot * D);
        const s = C.clamp(d, -rate * dt, rate * dt);
        pose.rot = (pose.rot * D + s) / D;
        return Math.abs(d - s) < 0.002;
      };
      if (st.wp < st.route.length) {
        const wp = st.route[st.wp];
        const dx = wp[0] - pose.x, dy = wp[1] - pose.y, dist = Math.hypot(dx, dy);
        if (dist < 5) { st.wp++; return false; }
        const head = Math.atan2(dy, dx);
        // fourches devant ou marche arrière : le plus proche du cap actuel
        const fwd = Math.abs(C.normAngle(head - pose.rot * D)) <= Math.PI / 2;
        const want = fwd ? head : head + Math.PI;
        const err = Math.abs(C.normAngle(want - pose.rot * D));
        if (err > 25 * D) { turnTo(want, TURN_RATE); return false; }          // virage sur place
        turnTo(want, TURN_RATE);
        const step = speed * 1000 * dt * (err > 10 * D ? 0.5 : 1);
        if (dist <= step) { pose.x = wp[0]; pose.y = wp[1]; st.wp++; }
        else { pose.x += dx / dist * step; pose.y += dy / dist * step; }
        return false;
      }
      const ok = turnTo(to.rot * D, TURN_RATE);
      if (ok) { job.route = null; this.showRoute(el, job); }
      return ok;
    }
    /** Trait pointillé de l'itinéraire prévu. */
    showRoute(el, job) {
      const vp = this.app.viewport;
      if (job.routeLine) { vp.gOverlay.remove(job.routeLine); job.routeLine.geometry.dispose(); job.routeLine = null; }
      if (!job.route || job.route.length < 2) return;
      const pts = job.route.map(q => new THREE.Vector3(q[0] * M, q[1] * M, 0.03));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: job.routeLanes ? 0x2ecc71 : 0x00e5ff, dashSize: 0.3, gapSize: 0.2, depthTest: false }));
      line.computeLineDistances(); line.renderOrder = 8;
      vp.gOverlay.add(line);
      job.routeLine = line;
    }

    doPick(el, job) {
      const app = this.app, from = job.cur.mission.from, proj = app.project;
      let desc;
      if (from.kind === 'pallet') {
        const e = proj.getElement(from.id);
        if (!e) return;
        desc = C.clone(e.params);
        proj.change(`${el.name} : prise de ${e.name}`, () => proj.removeElements([e.id]));
      } else {
        const r = proj.getElement(from.rackId);
        if (!r) return;
        const rp = r.params;
        desc = { palletType: 'euro', loaded: rp.loadType !== 'vide', loadH: Math.max(300, rp.loadH - 144), loadColor: rp.loadType === 'carton' ? '#b98b52' : '#cfd6dd' };
        proj.change(`${el.name} : sortie de ${this.describe(from)}`, () => { rp.slots = Object.assign({}, rp.slots, { [from.key]: 0 }); });
      }
      job.payload = desc;
      job.payloadMesh = null;
    }
    doDrop(el, job) {
      const app = this.app, to = job.cur.mission.to, proj = app.project, t = job.cur.dropT;
      const desc = job.payload;
      if (!desc) return;
      if (to.kind === 'rack') {
        const r = proj.getElement(to.rackId);
        if (r) proj.change(`${el.name} : mise en stock ${this.describe(to)}`, () => { r.params.slots = Object.assign({}, r.params.slots, { [to.key]: 1 }); });
      } else {
        const params = Object.assign({ palletType: 'euro', loaded: false, loadH: 1000, loadColor: '#b98b52', stack: 1, palletSize: '1200x800' }, desc);
        const n = proj.createElement('pallet', params, { x: C.round(t.x, 1), y: C.round(t.y, 1), z: C.round(t.z, 1), rot: C.round(t.rot, 2) });
        proj.change(`${el.name} : dépose de palette`, () => proj.addElement(n));
      }
      job.payload = null;
      if (job.payloadMesh && job.payloadMesh.parent) job.payloadMesh.parent.remove(job.payloadMesh);
      job.payloadMesh = null;
    }

    /** Applique la pose animée au maillage du chariot. */
    applyPose(el, job) {
      const g = this.app.viewport.meshes.get(el.id);
      if (!g || !g.userData.truck) return;
      const T = g.userData.truck, pose = job.pose;
      g.position.set(pose.x * M, pose.y * M, el.z * M);
      g.rotation.z = pose.rot * D;
      T.mast.position.x = (150 + pose.reach * REACH_STROKE) * M;
      T.car.position.z = (pose.forkZ - 22) * M;
      T.inner.position.z = Math.max(0, pose.forkZ - 1900) * M;          // 2e étage du mât
      T.beacon.visible = (performance.now() / 300 | 0) % 2 === 0;
      // palette sur les fourches
      if (job.payload && (!job.payloadMesh || job.payloadMesh.parent !== T.payload)) {
        job.payloadMesh = C.palletVisual(job.payload);
        job.payloadMesh.position.z = -38 * M;   // fourches engagées sous le plateau de la palette
        T.payload.add(job.payloadMesh);
      }
      if (!job.payload && T.payload.children.length) T.payload.clear();
    }
  }

  C.Fleet = Fleet;
})(window.C3D);
