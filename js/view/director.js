/* =====================================================================
 * Convoy3D — Caméra de suivi et enregistrement vidéo
 *
 *  - Director : la caméra suit un carton pendant la simulation, du début à
 *    la fin de son parcours, en alternant plusieurs vues (poursuite,
 *    travelling latéral, dessus, face, orbite, vue d'ensemble, embarquée).
 *  - Recorder : enregistre la vue 3D (avec un bandeau d'informations) dans
 *    un fichier vidéo WebM (ou MP4 selon le navigateur) via MediaRecorder.
 * ===================================================================== */
(function (C) {
  'use strict';
  const M = 0.001;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /** Bac / tote (caisse plastique) plutôt que carton ? */
  C.isTote = spec => !!spec && (spec.kind === 'tote' || spec.formatId === 'bac' || /\b(bac|tote|caisse)/i.test(spec.formatName || spec.name || ''));

  C.CAMERA_VIEWS = [
    ['chase', 'Poursuite'], ['side', 'Travelling latéral'], ['top', 'Vue de dessus'], ['front', 'Face (arrivée)'],
    ['orbit', 'Orbite'], ['wide', 'Vue d\'ensemble'], ['onboard', 'Caméra embarquée']
  ];
  /** Vues « à la place de l'opérateur » d'un poste GTP. */
  C.OPERATOR_VIEWS = [['eyes', 'Yeux de l\'opérateur'], ['shoulder', 'Par-dessus l\'épaule'], ['opTop', 'Plongée sur le poste']];
  const VIEW_LABEL = Object.fromEntries(C.CAMERA_VIEWS.concat(C.OPERATOR_VIEWS));

  /* ------------------------------ enregistreur ------------------------------ */
  class Recorder {
    constructor(app) { this.app = app; this.active = false; }
    static supported() { return typeof MediaRecorder !== 'undefined' && !!document.createElement('canvas').captureStream; }
    pickMime() {
      for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
        try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* ignore */ }
      }
      return '';
    }
    start(name, hud) {
      if (!Recorder.supported()) { C.toast('L\'enregistrement vidéo n\'est pas pris en charge par ce navigateur.', 'error'); return false; }
      const gl = this.app.viewport.renderer.domElement;
      this.cv = document.createElement('canvas');
      this.cv.width = gl.width - gl.width % 2; this.cv.height = gl.height - gl.height % 2;
      this.ctx = this.cv.getContext('2d');
      this.hud = hud;
      this.name = name;
      const mime = this.pickMime();
      this.ext = mime.includes('mp4') ? 'mp4' : 'webm';
      this.chunks = [];
      try {
        this.stream = this.cv.captureStream(30);
        this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
      } catch (e) { C.toast('Enregistrement impossible : ' + e.message, 'error'); return false; }
      this.mr.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: mime || 'video/webm' });
        if (blob.size) {
          C.download(C.safeName(this.name) + '.' + this.ext, blob);
          C.toast(`Vidéo enregistrée (${C.fmt(blob.size / 1048576, 1)} Mo, ${this.ext.toUpperCase()})`, 'ok');
        }
        this.stream.getTracks().forEach(t => t.stop());
      };
      this.t0 = performance.now();
      this.frame();
      this.mr.start(500);
      this.active = true;
      return true;
    }
    /** Copie l'image 3D courante (+ bandeau) dans le flux vidéo. */
    frame() {
      if (!this.cv) return;
      const gl = this.app.viewport.renderer.domElement;
      this.ctx.drawImage(gl, 0, 0, this.cv.width, this.cv.height);
      if (this.hud) this.hud(this.ctx, this.cv.width, this.cv.height);
    }
    elapsed() { return this.active ? (performance.now() - this.t0) / 1000 : 0; }
    stop() {
      if (!this.active) return;
      this.active = false;
      try { this.mr.stop(); } catch (e) { /* déjà arrêté */ }
    }
  }

  /* ------------------------------ réalisateur ------------------------------ */
  class Director {
    constructor(app) {
      this.app = app;
      this.active = false;
      this.recorder = new Recorder(app);
      this.zoom = 1;
      app.sim.on('spawn', c => this.onSpawn(c));
    }

    /**
     * Démarre un suivi.
     * opts : { cartonId | sourceName, views[], interval (s), switchOnElement, record, simSpeed }
     */
    start(opts) {
      const app = this.app;
      this.stop(true);
      this.opts = Object.assign({ views: ['chase', 'side', 'top', 'orbit'], interval: 6, switchOnElement: true, record: true }, opts);
      if (!this.opts.views.length) this.opts.views = ['chase'];
      this.viewIdx = 0; this.viewT = 0; this.zoom = 1;
      this.cartonId = null; this.waiting = false; this.endT = null; this.lastNode = null; this.finished = false;
      this.current = null; this.target = null; this.label = '';
      this.active = true;
      this.prevCamera = app.cameraState();
      if (this.opts.gtpId) {
        // vue de l'opérateur d'un poste GTP (caméra fixe sur le poste)
        const el = app.project.getElement(this.opts.gtpId);
        if (!el || el.type !== 'gtp') { this.active = false; C.toast('Poste GTP introuvable', 'warn'); return; }
        if (!opts.views || !opts.views.length) this.opts.views = ['eyes', 'shoulder', 'opTop'];
        if (!app.sim.active || !app.sim.running) app.sim.play();
        this.label = 'Opérateur ' + el.name;
        app.select([]);
        this.t0 = performance.now();
        app.viewport.camera = app.viewport.persp;
        this.camPos = null;
        if (this.opts.record) this.recorder.start(`${app.project.name}_operateur_${el.name}`, (ctx, w, h) => this.drawHud(ctx, w, h));
      } else if (this.opts.cartonId) {
        this.cartonId = this.opts.cartonId;
        this.begin();
      } else {
        this.waiting = true;
        if (!app.sim.running) app.sim.play();
        C.toast(`En attente du prochain ${this.waitLabel()}…`, 'info');
      }
      if (this.opts.simSpeed && app.sim.active) app.sim.setSpeed(this.opts.simSpeed);
      this.buildHud();
    }
    onSpawn(c) {
      if (!this.active || !this.waiting) return;
      if (this.opts.sourceName && !String(c.source).startsWith(this.opts.sourceName)) return;
      if (this.opts.kind === 'tote' && !C.isTote(c.spec)) return;
      if (this.opts.kind === 'carton' && C.isTote(c.spec)) return;
      this.waiting = false;
      this.cartonId = c.id;
      this.begin();
    }
    waitLabel() {
      const k = this.opts.kind === 'tote' ? 'bac' : this.opts.kind === 'carton' ? 'carton' : 'contenant';
      return k + (this.opts.sourceName ? ' de ' + this.opts.sourceName : '');
    }
    begin() {
      const app = this.app;
      const c = app.sim.cartonById(this.cartonId);
      if (!c) { C.toast('Carton introuvable dans la simulation', 'warn'); this.stop(); return; }
      if (!app.sim.running) app.sim.play();
      this.label = `${c.spec.name} #${c.id}`;
      app.viewport.camera = app.viewport.persp;
      this.camPos = null;
      app.selectCarton(c.id);
      if (this.opts.record) {
        const proj = app.project.name;
        this.recorder.start(`${proj}_parcours_${c.spec.name}_${c.id}`, (ctx, w, h) => this.drawHud(ctx, w, h));
      }
    }
    /** Arrête le suivi (et l'enregistrement). */
    stop(silent) {
      if (!this.active) return;
      this.active = false;
      this.recorder.stop();
      this.showOperator(true);
      if (this.baseFov !== undefined) { this.app.viewport.persp.fov = this.baseFov; this.app.viewport.persp.updateProjectionMatrix(); this.baseFov = undefined; }
      if (this.hudEl) { this.hudEl.remove(); this.hudEl = null; }
      const app = this.app, vp = app.viewport;
      // la vue orbitale reprend autour de la dernière position suivie
      if (this.camPos && this.lookPos) {
        const o = vp.orbit;
        o.target.copy(this.lookPos);
        const off = this.camPos.clone().sub(this.lookPos);
        o.radius = Math.max(1, off.length());
        o.phi = Math.acos(C.clamp(off.z / o.radius, -1, 1));
        o.theta = Math.atan2(off.y, off.x);
        vp.setProjection('persp');
      }
      if (!silent) C.toast(this.opts && this.opts.gtpId ? 'Vue opérateur terminée' : 'Suivi terminé', 'info');
    }
    nextView(dir) {
      const n = this.opts.views.length;
      this.viewIdx = (this.viewIdx + (dir || 1) + n) % n;
      this.viewT = 0;
      this.refreshHud();
    }
    get view() { return this.opts.views[this.viewIdx]; }

    /** Position souhaitée de la caméra pour la vue courante. */
    shot(c, now) {
      const ps = c._pose || this.app.sim.poseOf(c, c.s);
      const P = V3(ps.p[0] * M, ps.p[1] * M, (ps.p[2] + c.spec.H / 2) * M);
      const h = isFinite(c.heading) ? c.heading : 0;
      const dir = V3(Math.cos(h), Math.sin(h), 0), left = V3(-Math.sin(h), Math.cos(h), 0), up = V3(0, 0, 1);
      const k = this.zoom * Math.max(1, Math.max(c.spec.L, c.spec.W) / 500);
      let cam, look = P.clone();
      switch (this.view) {
        case 'side': cam = P.clone().addScaledVector(left, 3 * k).addScaledVector(up, 0.8 * k); break;
        case 'top': cam = P.clone().addScaledVector(up, 7 * k).addScaledVector(dir, -0.05); break;
        case 'front': cam = P.clone().addScaledVector(dir, 3 * k).addScaledVector(up, 1.1 * k); break;
        case 'orbit': { const a = now * 0.45; cam = P.clone().add(V3(Math.cos(a) * 3.6 * k, Math.sin(a) * 3.6 * k, 1.8 * k)); break; }
        case 'wide': cam = P.clone().addScaledVector(dir, -8 * k).addScaledVector(left, 6 * k).addScaledVector(up, 7 * k); break;
        case 'onboard': cam = P.clone().addScaledVector(up, c.spec.H / 2 * M + 0.25).addScaledVector(dir, -0.25); look = P.clone().addScaledVector(dir, 4).addScaledVector(up, c.spec.H / 2 * M); break;
        default: cam = P.clone().addScaledVector(dir, -2.6 * k).addScaledVector(up, 1.4 * k); look = P.clone().addScaledVector(dir, 1.0 * k);
      }
      return { cam, look };
    }

    /** Affiche / masque le mannequin de l'opérateur (masqué en vue « yeux »). */
    showOperator(on) {
      const id = this.opts && this.opts.gtpId;
      const g = id && this.app.viewport.meshes.get(id);
      if (g && g.userData.gtpOperator) g.userData.gtpOperator.visible = on;
    }
    /** Caméra à la place de l'opérateur du poste GTP. */
    operatorShot(el) {
      const app = this.app, p = el.params, Y = C.Types.defs.gtp.layout(p);
      const tf = { x: el.x, y: el.y, z: el.z, rot: el.rot };
      const w0 = C.localToWorld(tf, Y.total / 2, 0, 0);
      const zf = C.supportAt ? C.supportAt(w0[0], w0[1], el.z - 101, el.id) - el.z : -el.z;
      const cx = Y.xc0 + Y.cw / 2, opY = -Y.D / 2 - 420;
      const W = (x, y, z) => { const q = C.localToWorld(tf, x, y, z); return V3(q[0] * M, q[1] * M, q[2] * M); };
      const k = this.zoom;
      let cam, look;
      switch (this.view) {
        case 'shoulder': cam = W(cx - 650 * k, opY - 750 * k, zf + 1900 + 450 * k); look = W(cx + 250, 250, 100); break;
        case 'opTop': cam = W(cx, opY + 150, zf + 1800 + 1600 * k); look = W(cx, 250, 100); break;
        default: {
          // yeux : la tête suit l'article prélevé (bac → carton)
          cam = W(cx, opY + 160, zf + 1600);
          look = W(cx, 150, 100);
          const g = app.viewport.meshes.get(el.id), art = g && g.userData.gtpArticle;
          if (art && art.visible) { const v = new THREE.Vector3(); art.getWorldPosition(v); look.lerp(v, 0.5); }
        }
      }
      return { cam, look };
    }
    updateOperator(dt) {
      const app = this.app, el = app.project.getElement(this.opts.gtpId);
      if (!el || !app.sim.active) { this.stop(); return; }
      if (this.opts.duration > 0 && (performance.now() - this.t0) / 1000 > this.opts.duration) { this.stop(); return; }
      this.viewT += dt;
      if (this.opts.interval > 0 && this.viewT > this.opts.interval) this.nextView();
      this.showOperator(this.view !== 'eyes');
      this.target = this.operatorShot(el);
      this.applyCamera(dt);
      this.refreshHud();
    }

    /** Appelé à chaque image avant le rendu. */
    update(dt) {
      if (!this.active) return;
      const app = this.app, vp = app.viewport;
      if (this.opts.gtpId) { this.updateOperator(dt); return; }
      if (this.waiting || !this.cartonId) { this.refreshHud(); return; }
      const c = app.sim.cartonById(this.cartonId);
      if (!c || c.removed) {
        // fin du parcours : on garde la dernière image un court instant puis on arrête
        if (this.endT === null) { this.endT = performance.now(); this.finished = true; this.refreshHud(); }
        if (performance.now() - this.endT > 1500) this.stop();
        this.applyCamera(dt);
        return;
      }
      // changement de vue : minuterie et/ou nouvel équipement
      this.viewT += dt;
      const node = c.node && c.node.el.id;
      if (this.opts.switchOnElement && node && this.lastNode && node !== this.lastNode && this.viewT > 2.5) this.nextView();
      if (node) this.lastNode = node;
      if (this.opts.interval > 0 && this.viewT > this.opts.interval) this.nextView();
      const s = this.shot(c, performance.now() / 1000);
      this.target = s;
      this.current = c;
      this.applyCamera(dt);
      this.refreshHud();
    }
    applyCamera(dt) {
      const vp = this.app.viewport, cam = vp.persp;
      if (vp.camera !== cam) vp.camera = cam;
      if (!this.target) return;
      const a = 1 - Math.exp(-dt * (this.view === 'onboard' ? 12 : this.view === 'eyes' ? 3 : 4));
      if (!this.camPos) { this.camPos = this.target.cam.clone(); this.lookPos = this.target.look.clone(); }
      else { this.camPos.lerp(this.target.cam, a); this.lookPos.lerp(this.target.look, a); }
      cam.position.copy(this.camPos);
      cam.up.set(0, 0, 1);
      cam.lookAt(this.lookPos);
      cam.aspect = vp.width / Math.max(1, vp.height);
      cam.near = 0.03; cam.far = 1500;
      if (this.baseFov === undefined) this.baseFov = cam.fov;
      cam.fov = this.view === 'eyes' ? 72 : this.baseFov;
      cam.updateProjectionMatrix();
    }
    /** Après le rendu : image vidéo. */
    afterRender() { if (this.recorder.active) this.recorder.frame(); }

    /* ------------------------------ bandeaux ------------------------------ */
    info() {
      const app = this.app, c = this.current && !this.current.removed ? this.current : null;
      if (this.opts && this.opts.gtpId) {
        const node = app.sim.net && app.sim.net.node(this.opts.gtpId), rt = node && node.rt || {};
        const state = rt.busy ? 'prélèvement en cours' : rt.waitTote ? 'attente d\'un bac' : rt.waitCtn ? 'attente d\'un carton' : 'prêt';
        return {
          project: app.project.name, t: C.fmtTime(app.sim.t), view: VIEW_LABEL[this.view] || '', carton: this.label, label: '',
          where: `${rt.picks || 0} articles · ${rt.totes || 0} bacs · ${rt.orders || 0} cartons · ${state}`, z: null, state, operator: true
        };
      }
      return {
        project: app.project.name, t: C.fmtTime(app.sim.t), view: VIEW_LABEL[this.view] || '',
        carton: this.label || '', label: c && c.label ? c.label : (this.current && this.current.label) || '',
        where: c ? (c.track.isBridge ? 'jonction → ' + c.track.el.name : c.track.el.name) : (this.finished ? 'arrivé' : ''),
        z: c && c._pose ? c._pose.p[2] : null, state: c ? c.state : ''
      };
    }
    drawHud(ctx, w, h) {
      const i = this.info();
      const s = Math.max(1, h / 720);
      ctx.save();
      ctx.fillStyle = 'rgba(10,14,20,0.72)';
      ctx.fillRect(0, h - 54 * s, w, 54 * s);
      ctx.fillStyle = '#00b4d8'; ctx.font = `bold ${18 * s}px Arial, sans-serif`;
      ctx.fillText('Convoy3D', 16 * s, h - 30 * s);
      ctx.fillStyle = '#e8edf2'; ctx.font = `${15 * s}px Arial, sans-serif`;
      ctx.fillText(`${i.project}  ·  t = ${i.t}  ·  ${i.carton}${i.label ? '  ·  étiquette ' + i.label : ''}`, 120 * s, h - 32 * s);
      ctx.fillStyle = '#9fb4cc';
      ctx.fillText(`${i.operator ? '' : 'Élément : '}${i.where}${i.z !== null ? '  ·  Z ' + C.fmt(i.z) + ' mm' : ''}  ·  Vue : ${i.view}`, 120 * s, h - 12 * s);
      ctx.restore();
    }
    buildHud() {
      const center = document.getElementById('center');
      this.hudEl = C.h('div', { class: 'follow-hud' });
      center.appendChild(this.hudEl);
      this.refreshHud(true);
    }
    refreshHud(force) {
      if (!this.hudEl) return;
      const now = performance.now();
      if (!force && now - (this._hudT || 0) < 200) return;
      this._hudT = now;
      const i = this.info();
      const rec = this.recorder.active ? `<span class="rec">● REC ${C.fmtTime(this.recorder.elapsed())}</span>` : '';
      const status = this.waiting ? `En attente du prochain <b>${C.escape(this.waitLabel())}</b>…` : this.finished ? `<b>${C.escape(i.carton)}</b> est arrivé à destination` :
        `<b>${C.escape(i.carton)}</b> · ${C.escape(i.where)}${i.label ? ' · ' + C.escape(i.label) : ''}`;
      this.hudEl.innerHTML = `${rec}<span class="fh-txt">🎥 ${status} · <i>${C.escape(i.view)}</i></span>
        <button class="btn small" data-a="prev" title="Vue précédente">◀</button><button class="btn small" data-a="next" title="Vue suivante">▶</button>
        <button class="btn small danger" data-a="stop">■ Arrêter</button>`;
      this.hudEl.querySelector('[data-a=prev]').onclick = () => this.nextView(-1);
      this.hudEl.querySelector('[data-a=next]').onclick = () => this.nextView(1);
      this.hudEl.querySelector('[data-a=stop]').onclick = () => this.stop();
    }
  }

  /** Enregistrement simple de la vue courante (sans suivi). */
  class ScreenRecorder {
    constructor(app) { this.app = app; this.rec = new Recorder(app); }
    get active() { return this.rec.active; }
    toggle() {
      if (this.rec.active) { this.rec.stop(); return; }
      const app = this.app;
      this.rec.start(app.project.name + '_video', (ctx, w, h) => {
        const s = Math.max(1, h / 720);
        ctx.fillStyle = 'rgba(10,14,20,0.6)'; ctx.fillRect(0, h - 34 * s, w, 34 * s);
        ctx.fillStyle = '#e8edf2'; ctx.font = `${15 * s}px Arial, sans-serif`;
        const sm = app.sim.active ? app.sim.summary() : null;
        ctx.fillText(`Convoy3D · ${app.project.name}${sm ? `  ·  t = ${C.fmtTime(sm.t)}  ·  ${sm.inCirc} en circulation  ·  ${sm.processed} traités  ·  ${C.fmt(sm.rate)} c/h` : ''}`, 14 * s, h - 12 * s);
      });
      C.toast('Enregistrement vidéo démarré — même commande pour arrêter', 'info');
    }
    afterRender() { if (this.rec.active) this.rec.frame(); }
  }

  C.Director = Director;
  C.ScreenRecorder = ScreenRecorder;
  C.Recorder = Recorder;
})(window.C3D);
