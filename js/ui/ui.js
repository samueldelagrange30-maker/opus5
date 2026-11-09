/* =====================================================================
 * Convoy3D — Interface graphique
 *  Menus (haut), barre d'outils, bibliothèque / arborescence (gauche),
 *  propriétés / analyse / statistiques (droite), simulation (bas),
 *  boîtes de dialogue (formats, projets, réglages, nomenclature, plan…)
 * ===================================================================== */
(function (C) {
  'use strict';
  const h = C.h;
  const $ = id => document.getElementById(id);

  class UI {
    constructor(app) {
      this.app = app;
      this.showDims = false;
      this.showHeights = false;
      this.rightTab = 'props';
      this.leftTab = 'lib';
      this.openGroups = {};
      this._lastSim = 0;
    }

    build() {
      if (window.innerWidth <= 980) document.body.classList.add('hide-left', 'hide-right');
      this.buildMenus();
      this.buildToolbar();
      this.buildLeft();
      this.buildRight();
      this.buildSimbar();
      this.buildViewbar();
      document.addEventListener('pointerdown', e => {
        if (!e.target.closest('.menu-root') && !e.target.closest('.popup-menu') && !e.target.closest('.dropdown')) this.closeMenus();
      });
      $('fileInput').addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) this.app.importFile(f);
        e.target.value = '';
      });
    }

    /* ================================ MENUS ================================ */
    menuDefs() {
      const a = this.app, vp = () => a.viewport, sim = () => a.sim;
      const view = v => () => vp().setView(v);
      const tog = k => ({ check: () => vp().show[k], action: () => { vp().setShow(k, !vp().show[k]); this.refreshToolbar(); } });
      return [
        {
          label: 'Fichier', items: [
            { label: 'Nouveau projet', icon: 'new', action: () => a.newProject() },
            { label: 'Ouvrir / gérer les projets…', icon: 'open', key: 'Ctrl+O', action: () => this.projectsDialog() },
            { label: 'Enregistrer', icon: 'save', key: 'Ctrl+S', action: () => a.save() },
            { label: 'Enregistrer sous…', action: () => this.prompt('Nom du nouveau projet', a.project.name + ' (copie)', v => a.saveAs(v)) },
            { label: 'Renommer le projet…', action: () => this.prompt('Nom du projet', a.project.name, v => a.project.change('Renommer', () => { a.project.name = v; })) },
            null,
            { label: 'Importer un projet JSON…', icon: 'import', action: () => $('fileInput').click() },
            { label: 'Exporter le projet en JSON', icon: 'export', key: 'Ctrl+E', action: () => C.IO.exportJSON(a) },
            null,
            { label: 'Charger le projet d\'exemple', action: () => this.confirm('Remplacer le projet courant par le projet d\'exemple ?', () => a.loadDemo()) },
            { label: 'Réinitialiser l\'installation', icon: 'delete', action: () => a.resetInstallation() }
          ]
        },
        {
          label: 'Édition', items: [
            { label: 'Annuler', icon: 'undo', key: 'Ctrl+Z', action: () => a.undo(), disabled: () => !a.project.canUndo() },
            { label: 'Rétablir', icon: 'redo', key: 'Ctrl+Y', action: () => a.redo(), disabled: () => !a.project.canRedo() },
            null,
            { label: 'Copier', icon: 'copy', key: 'Ctrl+C', action: () => a.copy() },
            { label: 'Coller', icon: 'paste', key: 'Ctrl+V', action: () => a.paste(), disabled: () => !a.clipboard },
            { label: 'Dupliquer', icon: 'duplicate', key: 'Ctrl+D', action: () => a.duplicate() },
            { label: 'Supprimer', icon: 'delete', key: 'Suppr', action: () => a.deleteSelection() },
            null,
            { label: 'Tout sélectionner', key: 'Ctrl+A', action: () => a.selectAll() },
            { label: 'Désélectionner', key: 'Échap', action: () => a.select([]) },
            { label: 'Grouper', icon: 'group', key: 'Ctrl+G', action: () => a.group() },
            { label: 'Dégrouper', icon: 'ungroup', key: 'Ctrl+Maj+G', action: () => a.ungroup() },
            null,
            { label: 'Rotation +' + a.project.settings.angleStep + '°', icon: 'rotate', key: 'R', action: () => a.rotateSelection(a.project.settings.angleStep) },
            { label: 'Rotation −' + a.project.settings.angleStep + '°', key: 'Maj+R', action: () => a.rotateSelection(-a.project.settings.angleStep) },
            { label: 'Déplacer de… (cotes)', icon: 'move', action: () => this.moveDialog() },
            { label: 'Inverser le sens de circulation', icon: 'reverse', key: 'I', action: () => a.reverseSelection() },
            { label: 'Ajouter le même module à la suite', key: 'N', action: () => a.appendSame() },
            { label: 'Accrocher au port le plus proche', icon: 'magnet', action: () => a.snapSelectionNow() }
          ]
        },
        {
          label: 'Affichage', items: [
            { label: 'Vue de dessus', icon: 'top', key: '1', action: view('top') },
            { label: 'Vue de face', icon: 'front', key: '2', action: view('front') },
            { label: 'Vue de côté', icon: 'side', key: '3', action: view('side') },
            { label: 'Vue isométrique', icon: 'iso', key: '4', action: view('iso') },
            { label: 'Vue 3D perspective', icon: 'persp', key: '5', action: view('persp') },
            { label: 'Projection orthographique', key: 'P', check: () => vp().camera.isOrthographicCamera, action: () => vp().setProjection(vp().camera.isOrthographicCamera ? 'persp' : 'ortho') },
            { label: 'Cadrer tout', icon: 'fit', key: 'F', action: () => vp().fit() },
            null,
            Object.assign({ label: 'Grille au sol' }, tog('grid')),
            Object.assign({ label: 'Repère XYZ' }, tog('axes')),
            Object.assign({ label: 'Ports de connexion' }, tog('ports')),
            Object.assign({ label: 'Flèches de sens' }, tog('arrows')),
            Object.assign({ label: 'Rouleaux / bandes' }, tog('rollers')),
            Object.assign({ label: 'Guides latéraux' }, tog('guides')),
            Object.assign({ label: 'Structures (châssis, pieds)' }, tog('structure')),
            Object.assign({ label: 'Ombres' }, tog('shadows')),
            Object.assign({ label: 'Murs d\'entrepôt' }, tog('walls')),
            Object.assign({ label: 'Murs translucides' }, tog('wallsGhost')),
            Object.assign({ label: 'Fléchage au sol' }, tog('lanes')),
            Object.assign({ label: 'Étiquettes' }, tog('labels')),
            { label: 'Cotes de tous les éléments', check: () => this.showDims, action: () => { this.showDims = !this.showDims; vp().updateLabels(); } },
            { label: 'Hauteurs des raccordements', check: () => this.showHeights, action: () => { this.showHeights = !this.showHeights; vp().updateLabels(); } }
          ]
        },
        {
          label: 'Outils', items: [
            { label: 'Mesurer une distance', icon: 'measure', key: 'M', action: () => vp().setMode('measure') },
            { label: 'Effacer les mesures', action: () => a.clearMeasures() },
            { label: 'Poser des cartons', icon: 'carton', key: 'K', action: () => vp().setMode('carton') },
            null,
            { label: 'Formats de cartons…', icon: 'carton', action: () => this.formatsDialog() },
            { label: 'Zone de travail et accrochage…', icon: 'settings', action: () => this.settingsDialog() },
            { label: 'Magnétisme de grille', check: () => a.project.settings.snapGrid, action: () => this.toggleSetting('snapGrid') },
            { label: 'Accrochage magnétique des ports', check: () => a.project.settings.snapPorts, action: () => this.toggleSetting('snapPorts') },
            { label: 'Ajout chaîné à la sortie sélectionnée', check: () => a.project.settings.chainAdd, action: () => this.toggleSetting('chainAdd') },
            null,
            { label: 'Analyser l\'installation', icon: 'analysis', action: () => { this.setRightTab('analysis'); this.runAnalysis(); } }
          ]
        },
        {
          label: 'Simulation', items: [
            { label: 'Lecture', icon: 'play', key: 'Espace', action: () => sim().play() },
            { label: 'Pause', icon: 'pause', action: () => sim().pause() },
            { label: 'Arrêt', icon: 'stop', action: () => sim().stop() },
            { label: 'Retour au début', icon: 'rewind', action: () => sim().rewind() },
            null,
            ...[1, 2, 5, 10].map(x => ({ label: 'Vitesse ×' + x, check: () => sim().speed === x, action: () => sim().setSpeed(x) })),
            null,
            { label: 'Détection des collisions', check: () => a.project.settings.collisions, action: () => this.toggleSetting('collisions') },
            { label: 'Carte de saturation des convoyeurs', icon: 'heat', check: () => sim().heatMode, action: () => { sim().setHeat(!sim().heatMode); this.refreshSim(true); } },
            ...[['format', 'Couleur des cartons : format'], ['source', 'Couleur des cartons : entrée (flux)'], ['route', 'Couleur des cartons : sortie de tri'], ['wait', 'Couleur des cartons : temps d\'attente'], ['state', 'Couleur des cartons : état']]
              .map(([m, l]) => ({ label: l, check: () => sim().colorMode === m, action: () => { sim().colorMode = m; this.refreshSim(true); } })),
            null,
            { label: 'Statistiques détaillées', icon: 'chart', action: () => this.setRightTab('stats') },
            null,
            { label: 'Filmer le parcours d\'un carton…', icon: 'video', action: () => this.filmDialog() },
            { label: 'Arrêter le suivi de carton', disabled: () => !a.director.active, action: () => a.director.stop() }
          ]
        },
        {
          label: 'Exportation', items: [
            { label: 'Capture d\'écran de la vue 3D (PNG)', icon: 'camera', action: () => this.screenshot() },
            { label: 'Exporter la vue de dessus (PNG)', icon: 'image', action: () => this.exportTop() },
            { label: 'Imprimer le plan 2D…', icon: 'print', action: () => this.planDialog() },
            { label: 'Vidéo : filmer le parcours d\'un carton…', icon: 'video', action: () => this.filmDialog() },
            { label: 'Vidéo : enregistrer la vue 3D (démarrer / arrêter)', icon: 'video', check: () => a.screenRec.active, action: () => { a.screenRec.toggle(); } },
            { label: 'Nomenclature des convoyeurs…', icon: 'bom', action: () => this.bomDialog() },
            { label: 'Exporter la nomenclature (CSV)', icon: 'export', action: () => C.IO.exportBOMCSV(a) },
            { label: 'Exporter le projet (JSON)', icon: 'export', action: () => C.IO.exportJSON(a) }
          ]
        },
        {
          label: 'Aide', items: [
            { label: 'Prise en main et raccourcis', icon: 'help', action: () => this.helpDialog() },
            { label: 'À propos', action: () => this.aboutDialog() }
          ]
        }
      ];
    }

    buildMenus() {
      const bar = $('menubar');
      bar.innerHTML = '';
      this.menuOpen = null;
      for (const m of this.menuDefs()) {
        const root = h('div', { class: 'menu-root' });
        const btn = h('button', { class: 'menu-btn', text: m.label });
        root.appendChild(btn);
        btn.addEventListener('click', () => { if (this.menuOpen === root) this.closeMenus(); else this.openMenu(root, m); });
        btn.addEventListener('mouseenter', () => { if (this.menuOpen && this.menuOpen !== root) this.openMenu(root, m); });
        bar.appendChild(root);
      }
    }
    openMenu(root, m) {
      this.closeMenus();
      const dd = h('div', { class: 'dropdown' });
      for (const it of m.items) {
        if (!it) { dd.appendChild(h('div', { class: 'sep' })); continue; }
        const dis = it.disabled && it.disabled();
        const chk = it.check ? it.check() : null;
        const row = h('button', { class: 'dd-item' + (dis ? ' disabled' : ''), html: `<span class="dd-ico">${chk === null ? (it.icon ? C.icon(it.icon, 15) : '') : (chk ? '✔' : '')}</span><span class="dd-label">${C.escape(it.label)}</span><span class="dd-key">${it.key || ''}</span>` });
        row.addEventListener('click', () => { if (dis) return; this.closeMenus(); it.action(); });
        dd.appendChild(row);
      }
      // le menu est attaché au document (la barre de menus défile horizontalement
      // et masquerait un menu déroulant positionné à l'intérieur)
      dd.classList.add('menu-dd');
      document.body.appendChild(dd);
      const r = root.getBoundingClientRect();
      const w = dd.getBoundingClientRect().width;
      dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
      dd.style.top = r.bottom + 'px';
      root.classList.add('open');
      this.menuOpen = root;
    }
    closeMenus() {
      document.querySelectorAll('.menu-root.open').forEach(r => r.classList.remove('open'));
      document.querySelectorAll('.menu-dd').forEach(d => d.remove());
      this.menuOpen = null;
      document.querySelectorAll('.popup-menu, .tb-pop').forEach(p => p.remove());
    }
    popupMenu(x, y, items) {
      this.closeMenus();
      const pm = h('div', { class: 'popup-menu dropdown' });
      for (const it of items) {
        if (!it) { pm.appendChild(h('div', { class: 'sep' })); continue; }
        const b = h('button', { class: 'dd-item', html: `<span class="dd-label">${C.escape(it[0])}</span>` });
        b.addEventListener('click', () => { this.closeMenus(); it[1](); });
        pm.appendChild(b);
      }
      document.body.appendChild(pm);
      const r = pm.getBoundingClientRect();
      pm.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
      pm.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    }
    toggleSetting(k) {
      const st = this.app.project.settings;
      st[k] = !st[k];
      this.app.autosave();
      this.refreshToolbar();
      C.toast((st[k] ? 'Activé : ' : 'Désactivé : ') + ({ snapGrid: 'magnétisme de grille', snapPorts: 'accrochage des ports', chainAdd: 'ajout chaîné', collisions: 'détection des collisions' }[k] || k), 'info');
    }

    /* ============================== BARRE D'OUTILS ============================== */
    buildToolbar() {
      const a = this.app, tb = $('toolbar');
      tb.innerHTML = '';
      const btn = (icon, title, fn, id) => {
        const b = h('button', { class: 'tb-btn', title, html: C.icon(icon) + `<span>${title.split(' (')[0]}</span>`, id: id || null });
        b.addEventListener('click', e => fn(e, b));
        tb.appendChild(b);
        return b;
      };
      const sep = () => tb.appendChild(h('div', { class: 'tb-sep' }));
      btn('panel', 'Panneau gauche', () => document.body.classList.toggle('hide-left'), 'tbLeft').classList.add('mobile-only');
      btn('conveyor', 'Convoyeur', () => a.addFromLibrary('str-rollers'));
      btn('curve', 'Virage', () => a.addFromLibrary('cur-90'));
      btn('slope', 'Pente', () => a.addFromLibrary('inc-up'));
      btn('carton', 'Carton (K)', () => a.viewport.setMode(a.viewport.mode === 'carton' ? 'select' : 'carton'), 'tbCarton');
      const fsel = h('select', { class: 'tb-select', id: 'tbFormat', title: 'Format des cartons à poser' });
      fsel.addEventListener('change', () => { a.currentFormat = fsel.value; });
      tb.appendChild(fsel);
      btn('obstacle', 'Obstacle', () => a.addFromLibrary('misc-obstacle'));
      btn('equipment', 'Équipement', (e, b) => this.equipPopup(b));
      sep();
      btn('select', 'Sélection', () => a.viewport.setMode('select'), 'tbSelect');
      btn('move', 'Déplacer (cotes)', () => this.moveDialog());
      btn('rotate', 'Rotation (R)', e => a.rotateSelection(e.shiftKey ? -a.project.settings.angleStep : a.project.settings.angleStep));
      btn('duplicate', 'Dupliquer (Ctrl+D)', () => a.duplicate());
      btn('delete', 'Supprimer (Suppr)', () => a.deleteSelection());
      sep();
      btn('measure', 'Mesurer (M)', () => a.viewport.setMode(a.viewport.mode === 'measure' ? 'select' : 'measure'), 'tbMeasure');
      btn('group', 'Grouper (Ctrl+G)', () => a.group());
      btn('ungroup', 'Dégrouper', () => a.ungroup());
      sep();
      btn('undo', 'Annuler (Ctrl+Z)', () => a.undo(), 'tbUndo');
      btn('redo', 'Rétablir (Ctrl+Y)', () => a.redo(), 'tbRedo');
      sep();
      btn('grid', 'Magnétisme grille', () => this.toggleSetting('snapGrid'), 'tbSnapGrid');
      btn('magnet', 'Accrochage ports', () => this.toggleSetting('snapPorts'), 'tbSnapPorts');
      btn('link', 'Ajout chaîné', () => this.toggleSetting('chainAdd'), 'tbChain');
      sep();
      btn('save', 'Enregistrer (Ctrl+S)', () => a.save());
      btn('analysis', 'Analyser', () => { this.setRightTab('analysis'); this.runAnalysis(); });
      btn('panelR', 'Panneau droit', () => document.body.classList.toggle('hide-right'), 'tbRight').classList.add('mobile-only');
      this.refreshFormatsSelect();
    }
    equipPopup(anchor) {
      this.closeMenus();
      const cat = C.LIBRARY.find(c => c.cat === 'Équipements');
      const pop = h('div', { class: 'tb-pop dropdown' });
      for (const it of cat.items.concat(...['Stockage', 'Bâtiment', 'Entrées / sorties', 'Structures et divers'].map(k => C.LIBRARY.find(c => c.cat === k).items))) {
        const b = h('button', { class: 'dd-item', html: `<span class="dd-ico">${C.libIcon(it.icon)}</span><span class="dd-label">${C.escape(it.label)}</span>` });
        b.addEventListener('click', () => { this.closeMenus(); this.app.addFromLibrary(it.id); });
        pop.appendChild(b);
      }
      document.body.appendChild(pop);
      const r = anchor.getBoundingClientRect();
      pop.style.left = r.left + 'px'; pop.style.top = r.bottom + 2 + 'px';
    }
    refreshFormatsSelect() {
      const sel = $('tbFormat');
      if (!sel) return;
      const a = this.app;
      sel.innerHTML = a.project.formats.map(f => `<option value="${f.id}">${C.escape(f.name)} ${f.L}×${f.W}×${f.H}</option>`).join('');
      if (!a.project.formats.find(f => f.id === a.currentFormat)) a.currentFormat = a.project.formats[0].id;
      sel.value = a.currentFormat;
    }
    refreshToolbar() {
      const a = this.app, st = a.project.settings, mode = a.viewport.mode;
      const set = (id, on) => { const b = $(id); if (b) b.classList.toggle('active', !!on); };
      set('tbSelect', mode === 'select'); set('tbMeasure', mode === 'measure'); set('tbCarton', mode === 'carton');
      set('tbSnapGrid', st.snapGrid); set('tbSnapPorts', st.snapPorts); set('tbChain', st.chainAdd);
      const u = $('tbUndo'), r = $('tbRedo');
      if (u) u.disabled = !a.project.canUndo();
      if (r) r.disabled = !a.project.canRedo();
      const mi = $('modeInfo');
      if (mi) {
        const mc = a.missionCtx;
        const txt = {
          mission: mc && mc.step === 2 ? 'Mission cariste — 2/2 : cliquez où déposer la palette (sol, mezzanine ou emplacement de rack libre) · Échap annuler'
            : 'Mission cariste — 1/2 : cliquez la palette à prendre (au sol ou dans un rack) · Échap annuler',
          select: '', place: 'Placement : cliquez pour poser · R tourner · Maj multiple · Échap annuler', measure: 'Mesure : cliquez deux points (accroche aux ports) · Échap pour quitter', carton: 'Pose de cartons : cliquez sur un convoyeur · Échap pour quitter' }[mode];
        mi.textContent = txt || ''; mi.style.display = txt ? '' : 'none';
      }
      const wbtn = $('vbWalls');
      if (wbtn) { const s = a.viewport.show; wbtn.classList.toggle('active', !s.walls || s.wallsGhost); wbtn.querySelector('span').textContent = !s.walls ? 'Murs masqués' : s.wallsGhost ? 'Murs translucides' : 'Murs'; }
      const vb = document.querySelectorAll('.vb-btn[data-proj]');
      vb.forEach(b => b.classList.toggle('active', (b.dataset.proj === 'ortho') === a.viewport.camera.isOrthographicCamera));
    }

    buildViewbar() {
      const vb = $('viewbar'), vp = this.app.viewport;
      const views = [['top', 'Dessus'], ['front', 'Face'], ['side', 'Côté'], ['iso', 'Iso'], ['persp', '3D']];
      for (const [v, l] of views) {
        const b = h('button', { class: 'vb-btn', title: 'Vue ' + l, html: C.icon(v, 16) + `<span>${l}</span>` });
        b.addEventListener('click', () => { vp.setView(v); this.refreshToolbar(); });
        vb.appendChild(b);
      }
      vb.appendChild(h('div', { class: 'vb-sep' }));
      for (const [p, l] of [['persp', 'Persp.'], ['ortho', 'Ortho']]) {
        const b = h('button', { class: 'vb-btn', 'data-proj': p, text: l, title: 'Projection ' + (p === 'ortho' ? 'orthographique' : 'perspective') });
        b.addEventListener('click', () => { vp.setProjection(p); this.refreshToolbar(); });
        vb.appendChild(b);
      }
      const wb = h('button', { class: 'vb-btn', id: 'vbWalls', title: 'Murs : visibles → translucides → masqués', html: C.icon('wallv', 16) + '<span>Murs</span>' });
      wb.addEventListener('click', () => {
        const s = vp.show;
        if (s.walls && !s.wallsGhost) vp.setShow('wallsGhost', true);
        else if (s.walls) { vp.setShow('wallsGhost', false); vp.setShow('walls', false); }
        else vp.setShow('walls', true);
        this.refreshToolbar();
      });
      vb.appendChild(wb);
      const film = h('button', { class: 'vb-btn', title: 'Filmer le parcours d\'un carton (caméra de suivi + vidéo)', html: C.icon('video', 16) + '<span>Filmer</span>' });
      film.addEventListener('click', () => this.filmDialog());
      vb.appendChild(film);
      const fit = h('button', { class: 'vb-btn', title: 'Cadrer tout (F)', html: C.icon('fit', 16) });
      fit.addEventListener('click', () => vp.fit());
      vb.appendChild(fit);
      vp.on('projection', () => this.refreshToolbar());
      $('center').appendChild(h('div', { id: 'modeInfo', class: 'mode-info', style: { display: 'none' } }));
      const hint = h('div', { class: 'vp-hint', html: 'Clic gauche : sélectionner / déplacer / tourner la vue · Clic droit : déplacer la vue / menu · Molette : zoom · Maj+glisser : sélection rectangle · Double-clic : cadrer' });
      $('center').appendChild(hint);
      setTimeout(() => hint.classList.add('fade'), 9000);
    }

    /* ============================== PANNEAU GAUCHE ============================== */
    buildLeft() {
      const left = $('left');
      left.innerHTML = '';
      const tabs = h('div', { class: 'tabs' });
      const mk = (id, label) => {
        const b = h('button', { class: 'tab' + (this.leftTab === id ? ' active' : ''), text: label });
        b.addEventListener('click', () => { this.leftTab = id; this.buildLeft(); });
        tabs.appendChild(b);
      };
      mk('lib', 'Bibliothèque'); mk('tree', 'Objets');
      left.appendChild(tabs);
      const body = h('div', { class: 'panel-body', id: 'leftBody' });
      left.appendChild(body);
      if (this.leftTab === 'lib') this.buildLibrary(body); else this.refreshTree();
    }
    buildLibrary(body) {
      const search = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher un module…' });
      body.appendChild(search);
      const chain = h('label', { class: 'chk small', html: `<input type="checkbox" ${this.app.project.settings.chainAdd ? 'checked' : ''}> Ajouter à la suite de l'élément sélectionné` });
      chain.querySelector('input').addEventListener('change', () => this.toggleSetting('chainAdd'));
      body.appendChild(chain);
      const list = h('div', { class: 'lib' });
      body.appendChild(list);
      const render = () => {
        const q = search.value.trim().toLowerCase();
        list.innerHTML = '';
        for (const cat of C.LIBRARY) {
          const items = cat.items.filter(it => !q || it.label.toLowerCase().includes(q) || cat.cat.toLowerCase().includes(q));
          if (!items.length) continue;
          const open = q || this.openGroups[cat.cat] !== false;
          const head = h('div', { class: 'lib-cat' + (open ? ' open' : ''), html: `${C.icon('chevron', 14)}<span>${cat.cat}</span><em>${items.length}</em>` });
          head.addEventListener('click', () => { this.openGroups[cat.cat] = !open; render(); });
          list.appendChild(head);
          if (!open) continue;
          const grid = h('div', { class: 'lib-items' });
          for (const it of items) {
            const b = h('div', { class: 'lib-item', draggable: 'true', title: it.label + ' — cliquer pour ajouter, ou glisser dans la vue 3D', html: C.libIcon(it.icon) + `<span>${C.escape(it.label)}</span>` });
            b.addEventListener('click', () => this.app.addFromLibrary(it.id));
            b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'copy'; });
            grid.appendChild(b);
          }
          list.appendChild(grid);
        }
      };
      search.addEventListener('input', render);
      render();
    }
    refreshTree() {
      if (this.leftTab !== 'tree') return;
      const body = $('leftBody');
      if (!body) return;
      const a = this.app;
      body.innerHTML = '';
      const els = a.project.elements;
      body.appendChild(h('div', { class: 'tree-head', text: `${els.length} élément(s) · ${a.project.cartons.length} carton(s) posé(s)` }));
      const groups = new Map();
      for (const el of els) { const k = el.groupId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el); }
      const list = h('div', { class: 'tree' });
      const row = el => {
        const def = C.Types.get(el.type);
        const r = h('div', { class: 'tree-row' + (a.selection.has(el.id) ? ' sel' : ''), html: `<span class="dot" style="background:${el.params.color || '#888'}"></span><b>${C.escape(el.name)}</b><span class="muted">${C.escape(def.label)}</span>` });
        r.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey) a.toggleSelect(el.id); else a.select([el.id]); });
        r.addEventListener('dblclick', () => a.viewport.focus(el.id));
        return r;
      };
      let gi = 1;
      for (const [gid, arr] of groups) {
        if (gid) {
          const gh = h('div', { class: 'tree-group', html: `${C.icon('group', 14)} Groupe ${gi++} <span class="muted">(${arr.length})</span>` });
          gh.addEventListener('click', () => a.select(arr.map(e => e.id)));
          list.appendChild(gh);
          arr.forEach(el => { const r = row(el); r.classList.add('in-group'); list.appendChild(r); });
        } else arr.forEach(el => list.appendChild(row(el)));
      }
      if (a.project.cartons.length) {
        list.appendChild(h('div', { class: 'tree-group', text: 'Cartons posés' }));
        for (const c of a.project.cartons) {
          const sp = a.project.cartonSpec(c);
          const el = a.project.getElement(c.elementId);
          const r = h('div', { class: 'tree-row' + (a.cartonSelection.has(c.id) ? ' sel' : ''), html: `<span class="dot" style="background:${sp.color}"></span><b>${C.escape(sp.name)}</b><span class="muted">sur ${C.escape(el ? el.name : '?')}</span>` });
          r.addEventListener('click', () => a.selectCarton(c.id));
          list.appendChild(r);
        }
      }
      body.appendChild(list);
    }

    /* ============================== PANNEAU DROIT ============================== */
    buildRight() {
      const right = $('right');
      right.innerHTML = '';
      const tabs = h('div', { class: 'tabs' });
      for (const [id, label] of [['props', 'Propriétés'], ['analysis', 'Analyse'], ['stats', 'Statistiques']]) {
        const b = h('button', { class: 'tab' + (this.rightTab === id ? ' active' : ''), text: label, 'data-tab': id });
        b.addEventListener('click', () => this.setRightTab(id));
        tabs.appendChild(b);
      }
      right.appendChild(tabs);
      right.appendChild(h('div', { class: 'panel-body', id: 'rightBody' }));
      this.refreshRight();
    }
    setRightTab(id) {
      this.rightTab = id;
      document.querySelectorAll('#right .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
      document.body.classList.remove('hide-right');
      this.refreshRight();
    }
    refreshRight() {
      if (this.rightTab === 'props') this.refreshProps();
      else if (this.rightTab === 'analysis') this.renderAnalysis();
      else this.renderStats();
    }

    /* ------------------------------ propriétés ------------------------------ */
    refreshProps() {
      if (this.rightTab !== 'props') return;
      const body = $('rightBody');
      if (!body) return;
      const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
      const scroll = body.scrollTop;
      body.innerHTML = '';
      const a = this.app;
      const els = a.selectedElements();
      if (a.cartonSelection.size && !els.length) this.cartonProps(body, Array.from(a.cartonSelection)[0]);
      else if (!els.length) this.emptyProps(body);
      else if (els.length === 1) this.elementProps(body, els[0]);
      else this.multiProps(body, els);
      body.scrollTop = scroll;
      if (focused) { const f = body.querySelector(`[data-fid="${focused}"]`); if (f) f.focus(); }
    }
    emptyProps(body) {
      const a = this.app;
      const net = a.network;
      const totalLen = a.project.elements.filter(e => C.Types.get(e.type).conveyor).reduce((s, e) => s + C.Types.devLength(e), 0);
      body.appendChild(h('div', { class: 'empty', html: `
        <div class="empty-ico">${C.icon('select', 38)}</div>
        <p>Sélectionnez un élément dans la vue 3D ou dans l'onglet <b>Objets</b> pour afficher ses propriétés.</p>
        <div class="kv"><span>Projet</span><b>${C.escape(a.project.name)}</b></div>
        <div class="kv"><span>Éléments</span><b>${a.project.elements.length}</b></div>
        <div class="kv"><span>Connexions</span><b>${net.links.length}</b></div>
        <div class="kv"><span>Longueur de convoyage</span><b>${C.fmt(totalLen / 1000, 2)} m</b></div>
        <div class="kv"><span>Zone de travail</span><b>${C.fmt(a.project.settings.workW / 1000, 1)} × ${C.fmt(a.project.settings.workD / 1000, 1)} m</b></div>
        <p class="muted small">Astuce : sélectionnez un convoyeur puis cliquez sur un module de la bibliothèque pour l'ajouter directement à sa sortie.</p>` }));
    }
    fieldInput(f, value, onChange, disabled) {
      let inp;
      const fid = f.id;
      if (f.type === 'select') {
        inp = h('select', { 'data-fid': fid });
        for (const [v, l] of f.options) inp.appendChild(h('option', { value: v, text: l }));
        inp.value = value;
        inp.addEventListener('change', () => onChange(inp.value));
      } else if (f.type === 'bool') {
        inp = h('input', { type: 'checkbox', 'data-fid': fid });
        inp.checked = !!value;
        inp.addEventListener('change', () => onChange(inp.checked));
      } else if (f.type === 'color') {
        inp = h('input', { type: 'color', 'data-fid': fid, value: value || '#888888' });
        inp.addEventListener('change', () => onChange(inp.value));
      } else if (f.type === 'textarea') {
        inp = h('textarea', { 'data-fid': fid, rows: 3 });
        inp.value = value || '';
        inp.addEventListener('change', () => onChange(inp.value));
      } else if (f.type === 'formats') {
        inp = h('div', { class: 'fmt-list' });
        const cur = new Set(value || []);
        for (const fm of this.app.project.formats) {
          const l = h('label', { class: 'chk', html: `<input type="checkbox" ${cur.has(fm.id) ? 'checked' : ''}> <span class="dot" style="background:${fm.color}"></span>${C.escape(fm.name)} <span class="muted">${fm.L}×${fm.W}×${fm.H}</span>` });
          l.querySelector('input').addEventListener('change', e => {
            if (e.target.checked) cur.add(fm.id); else cur.delete(fm.id);
            if (!cur.size) { e.target.checked = true; cur.add(fm.id); return; }
            onChange(Array.from(cur));
          });
          inp.appendChild(l);
        }
        if (disabled) inp.querySelectorAll('input').forEach(i => { i.disabled = true; });
        return inp;
      } else {
        const isNum = f.type === 'number';
        inp = h('input', { type: isNum ? 'number' : 'text', 'data-fid': fid, step: f.step || 'any' });
        if (isNum && f.min !== undefined) inp.min = f.min;
        if (isNum && f.max !== undefined) inp.max = f.max;
        inp.value = isNum ? (isFinite(value) ? C.round(value, f.step && f.step < 1 ? 3 : 1) : '') : (value === undefined ? '' : value);
        inp.addEventListener('change', () => onChange(inp.value));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      }
      if (disabled) inp.disabled = true;
      return inp;
    }
    elementProps(body, el) {
      const a = this.app, def = C.Types.get(el.type);
      const simLock = a.sim.active;
      body.appendChild(h('div', { class: 'prop-title', html: `<span class="dot big" style="background:${el.params.color || '#888'}"></span><div><b>${C.escape(el.name)}</b><div class="muted small">${C.escape(def.label)}${el.groupId ? ' · groupé' : ''}</div></div>` }));
      const actions = h('div', { class: 'prop-actions' });
      const act = (icon, title, fn) => { const b = h('button', { class: 'icon-btn', title, html: C.icon(icon, 16) }); b.addEventListener('click', fn); actions.appendChild(b); };
      act('duplicate', 'Dupliquer', () => a.duplicate());
      act('rotate', 'Rotation +' + a.project.settings.angleStep + '°', () => a.rotateSelection(a.project.settings.angleStep));
      if (def.fields.includes('reverse')) act('reverse', 'Inverser le sens', () => a.reverseSelection());
      if (def.conveyor) act('plus', 'Ajouter le même module à la suite (N)', () => a.appendSame());
      if (def.conveyor) act('magnet', 'Accrocher au port libre le plus proche', () => a.snapSelectionNow());
      act('fit', 'Cadrer', () => a.viewport.focus(el.id));
      act('delete', 'Supprimer', () => a.deleteSelection());
      body.appendChild(actions);
      if (el.type === 'reachtruck') {
        const job = a.fleet.jobs.get(el.id);
        const box3 = h('div', { class: 'mission-box' });
        box3.appendChild(h('div', { class: 'small', html: `<b>${C.escape(el.params.driverName || 'Cariste')}</b> · CACES R489 catégorie 5 · ${job && job.cur ? `<span class="busy">● ${C.escape(job.status || 'En mission')}</span>` : '<span class="ok-msg">● Disponible</span>'}` }));
        const nb = h('button', { class: 'btn small primary block', html: '➕ Nouvelle mission : prendre une palette → la déposer' });
        nb.addEventListener('click', () => a.newMission(el.id));
        box3.appendChild(nb);
        const list = [];
        if (job && job.cur) list.push(['En cours', job.cur.mission]);
        if (job) job.queue.forEach((m2, i) => list.push([`En attente ${i + 1}`, m2]));
        if (list.length) {
          const links = h('div', { class: 'links' });
          for (const [lab, m2] of list) links.appendChild(h('div', { class: 'link-row ' + (lab === 'En cours' ? 'warn' : 'optional'), html: `<span class="pdot"></span><span>${lab}</span><b>${C.escape(a.fleet.describe(m2.from))} → ${C.escape(a.fleet.describe(m2.to))}</b>` }));
          box3.appendChild(links);
          if (job.queue.length) { const cb = h('button', { class: 'btn small block', text: 'Annuler les missions en attente' }); cb.addEventListener('click', () => a.fleet.cancel(el.id)); box3.appendChild(cb); }
        } else box3.appendChild(h('p', { class: 'muted small', text: 'Cliquez « Nouvelle mission », puis la palette à prendre (au sol ou dans un rack), puis l\'endroit où la déposer. Plusieurs missions s\'enchaînent dans l\'ordre.' }));
        body.appendChild(box3);
      }
      if (el.type === 'mezzanine') {
        const pl = a.plateau(el);
        const area = pl.reduce((s2, m) => s2 + m.params.length * m.params.width, 0) / 1e6;
        const box2 = h('div', { class: 'mezz-ext' });
        box2.appendChild(h('div', { class: 'small', html: `Plateau : <b>${pl.length}</b> module${pl.length > 1 ? 's' : ''} · <b>${C.fmt(area, 1)} m²</b>` }));
        const grid = h('div', { class: 'ext-grid' });
        const mk = (dir, label, title, cls) => {
          const b = h('button', { class: 'btn small ' + cls, text: label, title, disabled: simLock || null });
          b.addEventListener('click', () => a.extendMezzanine(el, dir));
          grid.appendChild(b);
        };
        grid.appendChild(h('span', { class: 'ext-title small muted', text: 'Étendre :' }));
        mk('yp', '↑ Arrière', 'Ajouter un module identique côté arrière (+Y local)', 'up');
        mk('xn', '← Gauche', 'Ajouter un module identique côté gauche (−X local)', 'left');
        mk('xp', 'Droite →', 'Ajouter un module identique côté droit (+X local)', 'right');
        mk('yn', '↓ Avant', 'Ajouter un module identique côté avant (−Y local)', 'down');
        box2.appendChild(grid);
        if (pl.length > 1) {
          const sb = h('button', { class: 'btn small block', text: `Sélectionner tout le plateau (${pl.length} modules)` });
          sb.addEventListener('click', () => a.select(pl.map(m => m.id)));
          box2.appendChild(sb);
        }
        body.appendChild(box2);
      }
      if (el.type === 'osr') {
        const n = Math.round(el.params.towers);
        const bar = h('div', { class: 'tower-bar' });
        const minus = h('button', { class: 'btn small', text: '− Tour', title: 'Retirer la dernière tour' });
        const plus = h('button', { class: 'btn small primary', text: '+ Tour', title: 'Ajouter une tour supplémentaire' });
        minus.disabled = n <= 1 || simLock; plus.disabled = n >= 30 || simLock;
        minus.addEventListener('click', () => a.setField([el.id], 'towers', n - 1));
        plus.addEventListener('click', () => a.setField([el.id], 'towers', n + 1));
        bar.append(h('span', { html: `<b>${n}</b> tour${n > 1 ? 's' : ''}` }), minus, plus);
        body.appendChild(bar);
      }
      if (simLock) body.appendChild(h('div', { class: 'notice', text: 'Simulation en cours : seuls les paramètres de fonctionnement (vitesse, marche, butée, aiguillage…) sont modifiables.' }));
      // champs groupés
      const groups = new Map();
      for (const fid of def.fields) {
        const f = C.FIELDS[fid];
        if (!f) continue;
        if (!groups.has(f.group)) groups.set(f.group, []);
        groups.get(f.group).push(f);
      }
      for (const [g, fields] of groups) {
        const sec = this.section(body, g);
        for (const f of fields) {
          let val = f.get ? f.get(el) : f.attr ? el[f.k] : el.params[f.k];
          const row = h('div', { class: 'prop-row' + (f.type === 'textarea' || f.type === 'formats' ? ' wide' : '') });
          row.appendChild(h('label', { text: f.label, title: f.help || f.label }));
          const wrap = h('div', { class: 'prop-in' });
          wrap.appendChild(this.fieldInput(f, val, v => a.setField([el.id], f.id, v), simLock && !f.live));
          if (f.unit) wrap.appendChild(h('span', { class: 'unit', text: f.unit }));
          row.appendChild(wrap);
          if (f.help) row.appendChild(h('div', { class: 'help', text: f.help }));
          sec.appendChild(row);
        }
      }
      // informations calculées
      this.infoSection(body, el);
    }
    section(body, title) {
      const open = this.openGroups['p:' + title] !== false;
      const sec = h('div', { class: 'section' + (open ? ' open' : '') });
      const head = h('div', { class: 'section-head', html: `${C.icon('chevron', 13)}<span>${C.escape(title)}</span>` });
      head.addEventListener('click', () => { this.openGroups['p:' + title] = !open; this.refreshProps(); });
      sec.appendChild(head);
      const content = h('div', { class: 'section-body' });
      sec.appendChild(content);
      body.appendChild(sec);
      return content;
    }
    infoSection(body, el) {
      const a = this.app, net = a.network, def = C.Types.get(el.type), p = el.params;
      const sec = this.section(body, 'Informations calculées');
      const kv = (k, v) => sec.appendChild(h('div', { class: 'kv', html: `<span>${k}</span><b>${v}</b>` }));
      const under = a.mezzanineUnder(el);
      if (under) {
        const top = under.z + under.params.deckH;
        const r = h('div', { class: 'link-row ok clickable', html: `<span class="pdot"></span><span>Posé sur</span><b>${C.escape(under.name)} (plancher ${C.fmt(top)} mm, +${C.fmt(el.z - top)} mm)</b>` });
        r.addEventListener('click', () => a.select([under.id]));
        sec.appendChild(r);
      }
      if (el.type === 'wall') {
        const ops = C.Walls.wallOpenings(el, a.project.elements);
        kv('Surface de mur', C.fmt(p.length * p.height / 1e6, 1) + ' m²');
        kv('Ouvertures', ops.length);
        if (ops.length) {
          const links = h('div', { class: 'links' });
          for (const o of ops) {
            const tgt = a.project.elements.find(e => e.name === o.label);
            const kind = o.kind === 'door' ? 'Porte' : o.kind === 'conv' ? 'Passage convoyeur' : 'Passage objet';
            const row = h('div', { class: 'link-row ok' + (tgt ? ' clickable' : ''), html: `<span class="pdot"></span><span>${kind}${tgt ? ' ' + C.escape(tgt.name) : ''}</span><b>${C.fmt(o.x1 - o.x0)} × ${C.fmt(o.z1 - o.z0)} mm à ${C.fmt((o.x0 + o.x1) / 2)}</b>` });
            if (tgt) row.addEventListener('click', () => a.select([tgt.id]));
            links.appendChild(row);
          }
          sec.appendChild(links);
        }
        if (p.autoOpenings === false) sec.appendChild(h('p', { class: 'muted small', text: 'Ouvertures automatiques désactivées : les convoyeurs qui traversent ce mur seront signalés comme obstrués.' }));
        return;
      }
      if (el.type === 'mezzanine') {
        const area = p.length * p.width / 1e6;
        const sp = Math.max(1000, p.columnSpacing || 4000);
        const nc = Math.max(2, Math.ceil(p.length / sp) + 1) * Math.max(2, Math.ceil(p.width / sp) + 1);
        kv('Surface du module', C.fmt(area, 2) + ' m²');
        const pl = a.plateau(el);
        if (pl.length > 1) kv('Surface du plateau', `${C.fmt(pl.reduce((s2, m) => s2 + m.params.length * m.params.width, 0) / 1e6, 2)} m² (${pl.length} modules)`);
        kv('Dessus du plancher', C.fmt(el.z + p.deckH) + ' mm');
        kv('Hauteur libre sous poutres', C.fmt(p.deckH - p.thickness - 220) + ' mm');
        kv('Charge admissible totale', C.fmt(area * (p.load || 0)) + ' kg');
        kv('Poteaux', nc);
        const riders = Array.from(a.ridersOf(el)).map(id => a.project.getElement(id)).filter(Boolean);
        kv('Objets posés dessus', riders.length);
        if (riders.length) {
          const links = h('div', { class: 'links' });
          for (const r of riders) {
            const row = h('div', { class: 'link-row ok clickable', html: `<span class="pdot"></span><span>${C.escape(C.Types.get(r.type).label)}</span><b>${C.escape(r.name)}</b>` });
            row.addEventListener('click', () => a.select([r.id]));
            links.appendChild(row);
          }
          sec.appendChild(links);
        }
        sec.appendChild(h('p', { class: 'muted small', text: 'Déplacer, tourner ou rehausser la mezzanine déplace aussi les objets posés dessus.' }));
        return;
      }
      if (!def.conveyor) {
        const sz = C.Types.staticSize(el);
        kv('Encombrement', `${C.fmt(sz.L)} × ${C.fmt(sz.W)} mm`);
        kv('Hauteur (haut)', `${C.fmt(el.z + sz.H)} mm`);
        if (el.type === 'mezzstair') {
          const d = C.Types.defs.mezzstair.dims(el), bl = 2 * d.r + (p.going || 250);
          kv('Marches', `${d.n} contremarches · hauteur ${C.fmt(d.r)} mm · giron ${C.fmt(p.going || 250)} mm`);
          kv('Hauteur franchie / longueur', `${C.fmt(d.rise)} / ${C.fmt(d.run)} mm`);
          kv('Formule de Blondel (2h + g)', `${C.fmt(bl)} mm ${bl >= 600 && bl <= 650 ? '✔ confortable' : '⚠ hors 600–650'}`);
          if (d.r > 200) sec.appendChild(h('p', { class: 'muted small', text: 'Hauteur de marche supérieure à 200 mm : augmentez le nombre de marches.' }));
        }
        if (el.type === 'pallet') kv('Type', p.palletType === 'perdue' ? 'Palette perdue (usage unique)' : 'Palette Europe (EPAL)');
        if (el.type === 'rack') {
          const rows = +p.rows === 2 ? 2 : 1, perBay = Math.max(1, Math.floor((p.bayLength - 80) / 900));
          const places = rows * p.bays * p.levels * perBay;
          kv('Emplacements', `${places} (${perBay} par travée et par niveau)`);
          kv('Niveaux de dépose', Array.from({ length: p.levels }, (_, k) => C.fmt((p.firstOnFloor ? k : k + 1) * p.levelH)).join(' / ') + ' mm');
          { const R2 = C.Types.defs.rack, G = R2.geom(p); let occ = 0;
            for (let r = 0; r < G.rows; r++) for (let j = 0; j < G.nb; j++) for (let k = 0; k < G.nl; k++) for (let q = 0; q < G.perBay; q++) if (R2.slotOccupied(el, R2.slotKey(r, j, k, q))) occ++;
            kv('Emplacements occupés', `${occ} / ${places}`); }
          const R = C.Types.defs.rack, rowsN = +p.rows === 2 ? 2 : 1;
          kv('Adresses', `${R.address(p, 0, 0, 0)} … ${R.address(p, rowsN - 1, p.bays - 1, p.levels - 1)}`);
        }
        return;
      }
      if (el.type === 'gtp') {
        const ipt = Math.max(1, +p.itemsPerTote || 1), ipo = Math.max(1, +p.itemsPerOrder || 1);
        kv('Bacs traités (théorique)', C.fmt((+p.pickRate || 0) / ipt) + ' bacs/h');
        kv('Cartons remplis (théorique)', C.fmt((+p.pickRate || 0) / ipo) + ' cartons/h');
        kv('Temps par bac', C.fmt(ipt * 3600 / Math.max(1, +p.pickRate || 1), 1) + ' s');
        const node = net.node(el.id);
        if (a.sim.active && node && node.rt) {
          const rt = node.rt, t = Math.max(1, a.sim.t);
          kv('Articles prélevés', `${rt.picks || 0} (${C.fmt((rt.picks || 0) / t * 3600)} /h)`);
          kv('Bacs / cartons terminés', `${rt.totes || 0} / ${rt.orders || 0}`);
          kv('État', rt.busy ? 'prélèvement en cours' : rt.waitTote && rt.waitCtn ? 'attente bac et carton' : rt.waitTote ? 'attente bac' : rt.waitCtn ? 'attente carton' : '—');
        }
      }
      if (el.type === 'closer') {
        const node = net.node(el.id);
        kv('Coiffes', 'ajustées automatiquement à chaque format de carton ouvert');
        if (a.sim.active && node && node.rt) kv('Cartons fermés', node.rt.closed || 0);
      }
      if (el.type === 'osr') {
        const n = Math.round(p.towers), rd = Math.min(700, (p.towerWidth - 600) / 2);
        const f = a.project.format((p.formats || ['bac'])[0]);
        const slots = Math.max(1, Math.floor((p.rackLength - 100) / (Math.min(f.L, f.W) + 60)));
        kv('Tours / niveaux', `${n} / ${p.levels}`);
        kv('Hauteur des tours', C.fmt(el.z * 0 + C.Types.osrHeight(p)) + ' mm');
        kv('Emprise', `${C.fmt(n * p.towerWidth)} × ${C.fmt(p.laneLength + p.frontZone + p.rackLength)} mm`);
        kv('Entrées / sorties', `${n} convoyeur${n > 1 ? 's' : ''} d'entrée (ports e1…e${n}) · ${n} de sortie (ports s1…s${n})`);
        kv('Emplacements de caisses', C.fmt(n * 2 * p.levels * slots) + ` (allée ${C.fmt(p.towerWidth - 2 * rd)} mm)`);
        kv('Débit de sortie total', C.fmt(n * p.towerRate) + ' caisses/h');
        const node = net.node(el.id);
        if (a.sim.active && node && node.rt) {
          kv('Caisses sorties / entrées en stock', `${node.rt.spawned} / ${node.rt.stored || 0}`);
          for (let i = 0; i < n; i++) kv(`Tour ${i + 1} : sorties / entrées`, `${(node.rt.towerOut || [])[i] || 0} / ${(node.rt.towerIn || [])[i] || 0}`);
        }
      }
      const node = net.node(el.id);
      const L = C.Types.devLength(el);
      kv('Longueur développée', C.fmt(L) + ' mm');
      if (node) {
        const pin = node.ports.find(q => q.role === 'in');
        const outs = node.ports.filter(q => q.role === 'out');
        if (pin) kv('Hauteur d\'entrée', C.fmt(pin.pos[2]) + ' mm');
        for (const q of outs) {
          if (q.optional && !q.link && outs.length > 1) continue;
          kv('Hauteur ' + (outs.length > 1 ? 'sortie ' + q.id : 'de sortie'), C.fmt(q.pos[2]) + ' mm');
        }
      }
      const rise = C.Types.geomRise(el);
      if (Math.abs(rise) > 0.5) kv('Dénivelé', C.fmt(rise * (p.reverse ? -1 : 1)) + ' mm (sens du flux)');
      const ms = C.Types.meanSlope(el), mx = C.Types.maxSlope(el);
      if (el.type !== 'elevator') kv('Pente moyenne / maxi', `${C.fmt(ms, 1)}° / ${C.fmt(mx, 1)}° (${C.fmt(Math.tan(mx * C.DEG) * 100, 1)} %)`);
      if (el.type === 'curve' || el.type === 'spiral') kv('Rayon intérieur / extérieur', `${C.fmt(p.radius - p.width / 2)} / ${C.fmt(p.radius + p.width / 2)} mm`);
      if (el.type === 'spiral') kv('Pas de l\'hélice', C.fmt(Math.abs(p.rise) / Math.max(0.01, p.turns)) + ' mm');
      if (p.surface === 'rollers' || p.surface === 'freerollers') kv('Rouleaux', `${C.Types.rollerCount(el)} × Ø${p.rollerDiam} mm, pas ${C.fmt(p.rollerPitch, 1)} mm`);
      const ref = C.Analysis.refCarton(a.project);
      kv('Capacité théorique', `${C.fmt(C.Analysis.capacity(el, ref))} cartons/h <span class="muted">(carton ${C.fmt(ref.L)} mm)</span>`);
      kv('Pente maxi admissible', (C.SURFACE_MAX_SLOPE[p.surface] || '—') + '°');
      if (node) {
        const links = h('div', { class: 'links' });
        for (const q of node.ports) {
          let txt = '', target = null, cls = q.status;
          if (q.role === 'in') {
            if (q.linkedFrom.length) { target = q.linkedFrom[0].el; txt = `← ${target.name}`; } else txt = el.type === 'source' ? 'générateur' : 'libre';
          } else {
            if (q.link) { target = q.link.track.el; txt = `→ ${target.name}${q.link.merge ? ' (jonction)' : ''}`; } else txt = q.optional ? 'non raccordée (option)' : el.type === 'sink' ? 'évacuation' : 'libre';
          }
          const portName = q.role === 'in' ? 'Entrée' : q.id === 'out' ? 'Sortie' : 'Sortie ' + q.id;
          const r = h('div', { class: 'link-row ' + (q.optional && !q.link ? 'optional' : cls), html: `<span class="pdot"></span><span>${portName}</span><b>${C.escape(txt)}</b>` });
          if (target) { r.classList.add('clickable'); r.addEventListener('click', () => a.select([target.id])); }
          links.appendChild(r);
        }
        // jonctions entrantes
        for (const k in node.tracks) for (const b of node.tracks[k].bridges) {
          const r = h('div', { class: 'link-row ok clickable', html: `<span class="pdot"></span><span>Jonction</span><b>← ${C.escape(b.fromPort.el.name)} à ${C.fmt(b.sJoin)} mm</b>` });
          r.addEventListener('click', () => a.select([b.fromPort.el.id]));
          links.appendChild(r);
        }
        sec.appendChild(h('div', { class: 'sub', text: 'Connexions' }));
        sec.appendChild(links);
      }
      // stats de simulation de l'élément
      if (a.sim.active && node && node.rt) {
        const rt = node.rt;
        sec.appendChild(h('div', { class: 'sub', text: 'Simulation' }));
        kv('Cartons entrés / sortis', `${rt.entered} / ${rt.passed}`);
        kv('Saturation moyenne', C.fmt(a.sim.t > 0 ? rt.occInt / a.sim.t * 100 : 0, 0) + ' %');
        kv('Temps avec blocage', C.fmtTime(rt.blockedTime));
      }
    }
    multiProps(body, els) {
      const a = this.app;
      body.appendChild(h('div', { class: 'prop-title', html: `<span class="dot big" style="background:#00e5ff"></span><div><b>${els.length} éléments sélectionnés</b><div class="muted small">Modification groupée</div></div>` }));
      const actions = h('div', { class: 'prop-actions' });
      const act = (icon, title, fn) => { const b = h('button', { class: 'icon-btn', title, html: C.icon(icon, 16) }); b.addEventListener('click', fn); actions.appendChild(b); };
      act('group', 'Grouper', () => a.group()); act('ungroup', 'Dégrouper', () => a.ungroup());
      act('duplicate', 'Dupliquer', () => a.duplicate()); act('rotate', 'Rotation', () => a.rotateSelection(a.project.settings.angleStep));
      act('move', 'Déplacer de…', () => this.moveDialog()); act('fit', 'Cadrer', () => a.viewport.fit(true, els.map(e => e.id))); act('delete', 'Supprimer', () => a.deleteSelection());
      body.appendChild(actions);
      const common = ['z', 'speed', 'running', 'gap', 'width', 'usefulWidth', 'guideH', 'rollerDiam', 'rollerPitch', 'surface', 'color'];
      const sec = this.section(body, 'Paramètres communs');
      for (const fid of common) {
        const f = C.FIELDS[fid];
        const has = els.filter(e => C.Types.get(e.type).fields.includes(fid));
        if (!has.length) continue;
        const vals = has.map(e => f.attr ? e[f.k] : e.params[f.k]);
        const same = vals.every(v => JSON.stringify(v) === JSON.stringify(vals[0]));
        const row = h('div', { class: 'prop-row' });
        row.appendChild(h('label', { text: `${f.label} (${has.length})` }));
        const wrap = h('div', { class: 'prop-in' });
        const inp = this.fieldInput(f, same ? vals[0] : (f.type === 'number' ? NaN : vals[0]), v => a.setField(has.map(e => e.id), fid, v), a.sim.active && !f.live);
        if (!same && inp.placeholder !== undefined) inp.placeholder = 'valeurs multiples';
        wrap.appendChild(inp);
        if (f.unit) wrap.appendChild(h('span', { class: 'unit', text: f.unit }));
        row.appendChild(wrap);
        sec.appendChild(row);
      }
      const len = els.filter(e => C.Types.get(e.type).conveyor).reduce((s, e) => s + C.Types.devLength(e), 0);
      const info = this.section(body, 'Informations');
      info.appendChild(h('div', { class: 'kv', html: `<span>Longueur cumulée</span><b>${C.fmt(len)} mm</b>` }));
    }
    cartonProps(body, id) {
      const a = this.app;
      const pc = a.project.getCarton(id);
      if (pc) {
        const sp = a.project.cartonSpec(pc);
        const el = a.project.getElement(pc.elementId);
        body.appendChild(h('div', { class: 'prop-title', html: `<span class="dot big" style="background:${sp.color}"></span><div><b>${C.escape(sp.name)}</b><div class="muted small">Carton posé sur ${C.escape(el ? el.name : '?')}</div></div>` }));
        const actions = h('div', { class: 'prop-actions' });
        const del = h('button', { class: 'icon-btn', title: 'Supprimer', html: C.icon('delete', 16) }); del.addEventListener('click', () => a.deleteSelection());
        actions.appendChild(del); body.appendChild(actions);
        const sec = this.section(body, 'Carton');
        const row = (label, input, unit) => {
          const r = h('div', { class: 'prop-row' }); r.appendChild(h('label', { text: label }));
          const w = h('div', { class: 'prop-in' }); w.appendChild(input); if (unit) w.appendChild(h('span', { class: 'unit', text: unit }));
          r.appendChild(w); sec.appendChild(r);
        };
        const fsel = h('select');
        a.project.formats.forEach(f => fsel.appendChild(h('option', { value: f.id, text: `${f.name} (${f.L}×${f.W}×${f.H})` })));
        fsel.value = pc.formatId; fsel.addEventListener('change', () => a.setCartonField(id, 'formatId', fsel.value));
        row('Format', fsel);
        const txt = (key, val, type, unit, label, ph) => {
          const i = h('input', { type: type || 'text', value: val === undefined ? '' : val, placeholder: ph || '' });
          i.addEventListener('change', () => a.setCartonField(id, key, i.value));
          row(label, i, unit);
        };
        txt('name', pc.name, 'text', '', 'Nom', sp.formatName);
        txt('ref', (pc.overrides || {}).ref, 'text', '', 'Référence', sp.ref);
        txt('L', (pc.overrides || {}).L, 'number', 'mm', 'Longueur', sp.L);
        txt('W', (pc.overrides || {}).W, 'number', 'mm', 'Largeur', sp.W);
        txt('H', (pc.overrides || {}).H, 'number', 'mm', 'Hauteur', sp.H);
        txt('weight', (pc.overrides || {}).weight, 'number', 'kg', 'Poids', sp.weight);
        const col = h('input', { type: 'color', value: sp.color }); col.addEventListener('change', () => a.setCartonField(id, 'color', col.value));
        row('Couleur', col);
        txt('speed', pc.speed || '', 'number', 'm/s', 'Vitesse maxi (0 = convoyeur)', '0');
        const ori = h('select'); [[0, '0° (longueur dans le sens de marche)'], [90, '90° (largeur dans le sens de marche)']].forEach(([v, l]) => ori.appendChild(h('option', { value: v, text: l })));
        ori.value = pc.orientation || 0; ori.addEventListener('change', () => a.setCartonField(id, 'orientation', ori.value));
        row('Orientation', ori);
        txt('s', C.round(pc.s, 0), 'number', 'mm', 'Position sur le convoyeur', '');
        return;
      }
      const c = a.sim.active && a.sim.cartonById(id);
      if (!c) { this.emptyProps(body); return; }
      const sp = c.spec;
      body.appendChild(h('div', { class: 'prop-title', html: `<span class="dot big" style="background:${sp.color}"></span><div><b>${C.escape(sp.name)} <span class="muted">#${c.id}</span></b><div class="muted small">Carton en simulation</div></div>` }));
      const fb = h('div', { class: 'prop-actions' });
      const b1 = h('button', { class: 'btn small primary', html: C.icon('video', 14) + ' Suivre ce carton' });
      b1.addEventListener('click', () => a.director.start({ cartonId: id, record: false, views: ['chase', 'side', 'top', 'orbit', 'front'] }));
      const b2 = h('button', { class: 'btn small', html: '● Filmer son parcours' });
      b2.addEventListener('click', () => this.filmDialog(id));
      fb.append(b1, b2); body.appendChild(fb);
      const sec = this.section(body, 'État en temps réel');
      sec.id = 'liveCarton';
      this.liveCartonId = id;
      this.renderLiveCarton();
    }
    renderLiveCarton() {
      const sec = $('liveCarton');
      if (!sec) return;
      const c = this.app.sim.cartonById(this.liveCartonId);
      if (!c) { sec.innerHTML = '<p class="muted">Ce carton a quitté l\'installation.</p>'; return; }
      const sp = c.spec;
      const st = { moving: 'en mouvement', blocked: 'bloqué', stopped: 'à l\'arrêt', process: 'en préparation', turn: 'rotation sur table' }[c.state] || c.state;
      const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
      sec.innerHTML = kv('Référence', C.escape(sp.ref || '—')) + kv('Format', `${C.escape(sp.formatName)} ${sp.L}×${sp.W}×${sp.H} mm`) + kv('Poids', C.fmt(sp.weight, 1) + ' kg') +
        kv('Entrée', C.escape(c.source)) + kv('Étiquette', c.label ? `<b>${C.escape(c.label)}</b> <span class="muted">(${C.escape(c.labeledBy)})</span>` : '<span class="muted">non étiqueté</span>') + kv('État', st + (c.reason ? ` <span class="muted">(${C.escape(c.reason)})</span>` : '')) +
        kv('Élément actuel', C.escape(c.track.isBridge ? 'jonction → ' + c.track.el.name : c.track.el.name)) + kv('Position', `${C.fmt(c.s)} / ${C.fmt(c.track.length)} mm`) +
        kv('Altitude', C.fmt(c._pose ? c._pose.p[2] : 0) + ' mm') + kv('Vitesse', C.fmt(c.state === 'moving' ? (c.v || c.track.el.params.speed) : 0, 2) + ' m/s') +
        kv('Temps de parcours', C.fmtTime(this.app.sim.t - c.born)) + kv('Temps d\'attente', C.fmtTime(c.wait)) +
        kv('Orientation', C.fmt(C.normAngle(c.yawOff) / C.DEG, 0) + '°') +
        `<div class="sub">Parcours</div><div class="small muted">${c.path.map(C.escape).join(' → ')}</div>`;
    }

    /* ------------------------------- analyse ------------------------------- */
    runAnalysis() { this.analysis = C.Analysis.run(this.app); this.renderAnalysis(); this.app.viewport.updatePorts(); }
    renderAnalysis() {
      if (this.rightTab !== 'analysis') return;
      const body = $('rightBody');
      body.innerHTML = '';
      const b = h('button', { class: 'btn primary block', html: C.icon('analysis', 16) + ' Lancer l\'analyse' });
      b.addEventListener('click', () => this.runAnalysis());
      body.appendChild(b);
      const r = this.analysis;
      if (!r) { body.appendChild(h('p', { class: 'muted small', text: 'Vérifie la continuité des lignes, les hauteurs de raccordement, les pentes, les largeurs, les virages, les interférences et calcule les longueurs, hauteurs et débits théoriques.' })); return; }
      const nE = r.issues.filter(i => i.level === 'error').length, nW = r.issues.filter(i => i.level === 'warn').length;
      body.appendChild(h('div', { class: 'an-head', html: `<span class="badge error">${nE} erreur(s)</span><span class="badge warn">${nW} avertissement(s)</span><span class="badge info">${r.issues.length - nE - nW} info</span>` }));
      const sec = this.section(body, 'Diagnostic');
      if (!r.issues.length) sec.appendChild(h('p', { class: 'ok-msg', text: '✔ Aucun problème détecté.' }));
      for (const is of r.issues) {
        const row = h('div', { class: 'issue ' + is.level, html: `<span class="lvl">${is.level === 'error' ? '✖' : is.level === 'warn' ? '⚠' : 'ℹ'}</span><span>${C.escape(is.msg)}</span>` });
        if (is.el) { row.classList.add('clickable'); row.addEventListener('click', () => { this.app.select([is.el.id]); this.app.viewport.focus(is.el.id); }); }
        sec.appendChild(row);
      }
      const s = r.summary;
      const sum = this.section(body, 'Synthèse');
      const kv = (k, v) => sum.appendChild(h('div', { class: 'kv', html: `<span>${k}</span><b>${v}</b>` }));
      kv('Éléments / convoyeurs', `${s.count} / ${s.conveyors}`);
      kv('Connexions', s.links);
      kv('Longueur totale de convoyage', `${C.fmt(s.totalLen)} mm (${C.fmt(s.totalLen / 1000, 2)} m)`);
      if (isFinite(s.zMin)) kv('Hauteurs de convoyage', `${C.fmt(s.zMin)} → ${C.fmt(s.zMax)} mm`);
      kv('Carton de référence', `${C.fmt(r.ref.L)} × ${C.fmt(r.ref.W)} × ${C.fmt(r.ref.H)} mm`);
      const t = h('table', { class: 'mini' });
      t.innerHTML = '<tr><th>Type</th><th>Qté</th><th>Longueur</th></tr>' + s.byType.map(([k, o]) => `<tr><td>${C.escape(k)}</td><td>${o.n}</td><td>${o.len ? C.fmt(o.len) + ' mm' : ''}</td></tr>`).join('');
      sum.appendChild(t);
      if (s.slopes.length) {
        const sl = this.section(body, 'Pentes et changements de hauteur');
        const t2 = h('table', { class: 'mini' });
        t2.innerHTML = '<tr><th>Élément</th><th>Pente moy.</th><th>Maxi</th><th>Dénivelé</th></tr>' + s.slopes.map(o => `<tr class="clickable" data-id="${o.el.id}"><td>${C.escape(o.el.name)}</td><td>${o.el.type === 'elevator' ? 'vertical' : C.fmt(o.slope, 1) + '°'}</td><td>${o.el.type === 'elevator' ? '—' : C.fmt(o.max, 1) + '°'}</td><td>${C.fmt(o.rise)} mm</td></tr>`).join('');
        t2.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => this.app.select([tr.dataset.id])));
        sl.appendChild(t2);
      }
      const ln = this.section(body, 'Débits théoriques par ligne');
      if (!r.lines.length) ln.appendChild(h('p', { class: 'muted small', text: 'Aucune entrée (générateur) dans l\'installation.' }));
      for (const l of r.lines) {
        ln.appendChild(h('div', { class: 'line-card', html: `<b>${C.escape(l.source.name)}</b> — cadence ${C.fmt(l.rate)} c/h<br>
          Sorties atteintes : ${l.sinks.length ? l.sinks.map(C.escape).join(', ') : '<span class="err">aucune</span>'}<br>
          Goulot : ${l.bottleneck ? `${C.escape(l.bottleneck.el.name)} ≈ <b>${C.fmt(l.bottleneck.cap)} c/h</b>` : '—'} · ${l.modules} modules` }));
      }
      const caps = this.section(body, 'Capacité théorique par module');
      const t3 = h('table', { class: 'mini' });
      t3.innerHTML = '<tr><th>Élément</th><th>Vitesse</th><th>Capacité</th></tr>' + s.caps.slice().sort((x, y) => x.cap - y.cap).map(o => `<tr class="clickable" data-id="${o.el.id}"><td>${C.escape(o.el.name)}</td><td>${C.fmt(o.el.params.speed, 2)} m/s</td><td>${C.fmt(o.cap)} c/h</td></tr>`).join('');
      t3.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => this.app.select([tr.dataset.id])));
      caps.appendChild(t3);
    }

    /* ----------------------------- statistiques ----------------------------- */
    renderStats() {
      if (this.rightTab !== 'stats') return;
      const body = $('rightBody');
      const sim = this.app.sim;
      body.innerHTML = '';
      if (!sim.active) { body.appendChild(h('div', { class: 'empty', html: `<div class="empty-ico">${C.icon('chart', 38)}</div><p>Lancez la simulation (▶) pour obtenir les statistiques détaillées par convoyeur : flux, saturation, temps de blocage et points de congestion.</p>` })); return; }
      const s = sim.summary();
      const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
      body.appendChild(h('div', { class: 'stats-sum', html: kv('Temps simulé', C.fmtTime(s.t)) + kv('Cartons créés / traités', `${s.created} / ${s.processed}`) + kv('Débit moyen / 5 min', `${C.fmt(s.rate)} / ${C.fmt(s.rateWin)} c/h`) + kv('Temps de parcours moyen', C.fmtTime(s.avgTravel)) + kv('Temps d\'attente moyen', C.fmtTime(s.avgWait)) + kv('Collisions évitées (conflits)', s.conflicts) + kv('Injections retardées (entrée saturée)', s.spawnBlocked) }));
      const cv = h('canvas', { class: 'chart big', width: 560, height: 160 });
      body.appendChild(cv);
      this.drawChart(cv, true);
      const nodes = Array.from(sim.net.nodes.values()).filter(n => n.rt).sort((a, b) => (b.rt.occInt - a.rt.occInt));
      const t = h('table', { class: 'mini stats' });
      t.innerHTML = '<tr><th>Élément</th><th>Entrés</th><th>Sortis</th><th>Saturation</th><th>Blocage</th><th>File</th></tr>' + nodes.map(n => {
        const sat = sim.t > 0 ? n.rt.occInt / sim.t : 0;
        const bl = sim.t > 0 ? n.rt.blockedTime / sim.t : 0;
        return `<tr class="clickable${bl > 0.4 ? ' hot' : ''}" data-id="${n.el.id}"><td>${C.escape(n.el.name)}</td><td>${n.rt.entered}</td><td>${n.rt.passed}</td><td><span class="bar"><i style="width:${(sat * 100).toFixed(0)}%;background:${C.heatColor(sat)}"></i></span>${C.fmt(sat * 100)}%</td><td>${C.fmt(bl * 100)}%</td><td>${n.rt.blockedNow}</td></tr>`;
      }).join('');
      t.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => this.app.select([tr.dataset.id])));
      body.appendChild(h('div', { class: 'sub', text: 'Par élément (trié par saturation)' }));
      body.appendChild(t);
    }

    /* ================================ SIMULATION ================================ */
    buildSimbar() {
      const sb = $('simbar'), sim = this.app.sim;
      sb.innerHTML = '';
      const ctr = h('div', { class: 'sim-ctrl' });
      const b = (icon, title, fn, id) => { const x = h('button', { class: 'sim-btn', title, html: C.icon(icon, 18), id }); x.addEventListener('click', fn); ctr.appendChild(x); return x; };
      b('play', 'Lecture (Espace)', () => sim.play(), 'simPlay');
      b('pause', 'Pause', () => sim.pause(), 'simPause');
      b('stop', 'Arrêt (retour au mode conception)', () => sim.stop(), 'simStop');
      b('rewind', 'Retour au début', () => sim.rewind(), 'simRewind');
      const sp = h('div', { class: 'speed-sel' });
      for (const x of [1, 2, 5, 10]) {
        const btn = h('button', { class: 'spd', text: '×' + x, 'data-x': x });
        btn.addEventListener('click', () => sim.setSpeed(x));
        sp.appendChild(btn);
      }
      ctr.appendChild(sp);
      ctr.appendChild(h('div', { class: 'sim-clock', id: 'simClock', text: '00:00' }));
      sb.appendChild(ctr);
      const tiles = h('div', { class: 'tiles' });
      const tile = (id, label, unit) => tiles.appendChild(h('div', { class: 'tile', html: `<span class="t-label">${label}</span><span class="t-val" id="${id}">—</span><span class="t-unit">${unit || ''}</span>` }));
      tile('stCirc', 'En circulation'); tile('stDone', 'Traités'); tile('stRate', 'Débit', 'c/h');
      tile('stSpeed', 'Vitesse moy. conv.', 'm/s'); tile('stTravel', 'Temps de parcours'); tile('stWait', 'Temps d\'attente');
      tile('stBlock', 'Points de blocage'); tile('stSat', 'Saturation maxi');
      sb.appendChild(tiles);
      const right = h('div', { class: 'sim-right' });
      const cv = h('canvas', { class: 'chart', id: 'simChart', width: 220, height: 56, title: 'Cartons en circulation (bleu) et débit (vert)' });
      right.appendChild(cv);
      const opts = h('div', { class: 'sim-opts' });
      const colSel = h('select', { id: 'simColor', title: 'Coloration des cartons' });
      [['format', 'Couleur : format'], ['source', 'Couleur : entrée'], ['route', 'Couleur : sortie de tri'], ['wait', 'Couleur : attente'], ['state', 'Couleur : état']].forEach(([v, l]) => colSel.appendChild(h('option', { value: v, text: l })));
      colSel.addEventListener('change', () => { sim.colorMode = colSel.value; });
      opts.appendChild(colSel);
      const heat = h('label', { class: 'chk small', html: '<input type="checkbox" id="simHeat"> Carte de saturation' });
      heat.querySelector('input').addEventListener('change', e => sim.setHeat(e.target.checked));
      opts.appendChild(heat);
      right.appendChild(opts);
      sb.appendChild(right);
      this.refreshSim(true);
    }
    refreshSim(full) {
      const sim = this.app.sim;
      const st = $('simPlay');
      if (!st) return;
      $('simPlay').classList.toggle('active', sim.running);
      $('simPause').classList.toggle('active', sim.active && !sim.running);
      document.querySelectorAll('.spd').forEach(b => b.classList.toggle('active', +b.dataset.x === sim.speed));
      document.body.classList.toggle('sim-on', sim.active);
      const sc = $('simColor'); if (sc) sc.value = sim.colorMode;
      const sh = $('simHeat'); if (sh) sh.checked = sim.heatMode;
      const s = sim.active ? sim.summary() : null;
      const set = (id, v) => { const e = $(id); if (e) e.innerHTML = v; };
      $('simClock').textContent = sim.active ? C.fmtTime(sim.t) : '00:00';
      if (!s) {
        ['stCirc', 'stDone', 'stRate', 'stTravel', 'stWait', 'stBlock', 'stSat'].forEach(id => set(id, '—'));
        const convs = this.app.project.elements.filter(e => e.params.speed !== undefined && C.Types.get(e.type).conveyor);
        set('stSpeed', convs.length ? C.fmt(convs.reduce((a, e) => a + (+e.params.speed || 0), 0) / convs.length, 2) : '—');
      } else {
        set('stCirc', `${s.inCirc}${s.blocked ? ` <small class="warn">(${s.blocked} arrêtés)</small>` : ''}`);
        set('stDone', s.processed);
        set('stRate', `${C.fmt(s.rate)}<small> / 5 min ${C.fmt(s.rateWin)}</small>`);
        set('stSpeed', C.fmt(s.avgSpeed, 2));
        set('stTravel', C.fmtTime(s.avgTravel));
        set('stWait', C.fmtTime(s.avgWait));
        set('stBlock', s.points.length ? `${s.points.length} <small title="${s.points.map(n => n.el.name).join(', ')}">${C.escape(s.points.slice(0, 2).map(n => n.el.name).join(', '))}</small>` : '0');
        set('stSat', `${C.fmt(s.satMax * 100)} %<small> ${s.satNode ? C.escape(s.satNode.el.name) : ''}</small>`);
      }
      this.drawChart($('simChart'));
      if (full) this.refreshToolbar();
    }
    drawChart(cv, big) {
      if (!cv) return;
      const g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#161a20'; g.fillRect(0, 0, W, H);
      const sim = this.app.sim;
      const hist = sim.active && sim.stats ? sim.stats.history : [];
      if (hist.length < 2) { g.fillStyle = '#5d6b7a'; g.font = '11px sans-serif'; g.fillText(sim.active ? 'Collecte…' : 'Historique de simulation', 8, H / 2 + 4); return; }
      const maxN = Math.max(1, ...hist.map(o => o.n)), maxR = Math.max(1, ...hist.map(o => o.rate));
      const plot = (key, max, color) => {
        g.strokeStyle = color; g.lineWidth = 1.5; g.beginPath();
        hist.forEach((o, i) => { const x = i / (hist.length - 1) * (W - 4) + 2, y = H - 4 - o[key] / max * (H - 10); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      };
      plot('n', maxN, '#3fa9f5'); plot('rate', maxR, '#2ecc71');
      g.font = (big ? 12 : 10) + 'px sans-serif';
      g.fillStyle = '#3fa9f5'; g.fillText('en circ. ' + hist[hist.length - 1].n, 4, 12);
      g.fillStyle = '#2ecc71'; g.fillText('débit ' + C.fmt(hist[hist.length - 1].rate) + ' c/h', big ? 120 : 80, 12);
    }

    /** Appelé à chaque image. */
    tick(now) {
      const sim = this.app.sim;
      if (sim.active && now - this._lastSim > 250) {
        this._lastSim = now;
        this.refreshSim(false);
        if (this.rightTab === 'props' && this.liveCartonId && this.app.cartonSelection.has(this.liveCartonId)) this.renderLiveCarton();
        if (this.app.cartonSelection.size) this.app.viewport.updateSelection();
      }
      if (sim.active && this.rightTab === 'stats' && now - (this._lastStats || 0) > 1000) { this._lastStats = now; this.renderStats(); }
    }

    /** Rafraîchissement global après modification. */
    refresh() {
      this.refreshTitle();
      this.refreshProps();
      this.refreshTree();
      this.refreshToolbar();
      this.refreshFormatsSelect();
      this.refreshSim(false);
      if (this.rightTab === 'analysis' && this.analysis) { this.analysis = C.Analysis.run(this.app); this.renderAnalysis(); }
    }
    refreshTitle() {
      const p = this.app.project;
      $('projectName').innerHTML = `${C.icon('save', 14)} ${C.escape(p.name)}${p.dirty ? ' <span class="dirty" title="Modifications non enregistrées">●</span>' : ''}`;
      document.title = `${p.name} — Convoy3D`;
    }

    /* ================================ DIALOGUES ================================ */
    modalOpen() { return !!document.querySelector('.modal-back'); }
    closeModal() { document.querySelectorAll('.modal-back').forEach(m => m.remove()); }
    modal(title, content, buttons, opts) {
      this.closeModal();
      opts = opts || {};
      const back = h('div', { class: 'modal-back' });
      const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') + (opts.xwide ? ' xwide' : '') });
      const head = h('div', { class: 'modal-head', html: `<b>${C.escape(title)}</b>` });
      const x = h('button', { class: 'icon-btn', html: C.icon('close', 16), title: 'Fermer' }); x.addEventListener('click', () => this.closeModal());
      head.appendChild(x);
      box.appendChild(head);
      const body = h('div', { class: 'modal-body' });
      if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
      box.appendChild(body);
      if (buttons && buttons.length) {
        const foot = h('div', { class: 'modal-foot' });
        for (const bt of buttons) {
          const b = h('button', { class: 'btn' + (bt.primary ? ' primary' : '') + (bt.danger ? ' danger' : ''), text: bt.label });
          b.addEventListener('click', () => { const keep = bt.action && bt.action(body) === false; if (!keep && !bt.keep) this.closeModal(); });
          foot.appendChild(b);
        }
        box.appendChild(foot);
      }
      back.appendChild(box);
      back.addEventListener('pointerdown', e => { if (e.target === back) this.closeModal(); });
      $('modal-root').appendChild(back);
      const f = body.querySelector('input, select, textarea');
      if (f && !opts.noFocus) setTimeout(() => f.focus(), 30);
      return body;
    }
    confirm(msg, ok) { this.modal('Confirmation', `<p>${C.escape(msg)}</p>`, [{ label: 'Annuler' }, { label: 'Confirmer', primary: true, action: ok }]); }
    prompt(label, def, ok) {
      const body = this.modal(label, `<input class="full" type="text" value="${C.escape(def)}">`, [{ label: 'Annuler' }, { label: 'Valider', primary: true, action: b => { const v = b.querySelector('input').value.trim(); if (v) ok(v); } }]);
      const inp = body.querySelector('input');
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value.trim(); if (v) ok(v); this.closeModal(); } });
      setTimeout(() => inp.select(), 40);
    }
    moveDialog() {
      const a = this.app;
      if (!a.selection.size) { C.toast('Sélectionnez d\'abord un ou plusieurs éléments', 'warn'); return; }
      this.modal('Déplacer la sélection', `<div class="form-grid"><label>ΔX (mm)</label><input type="number" id="mvx" value="0"><label>ΔY (mm)</label><input type="number" id="mvy" value="0"><label>ΔZ (mm)</label><input type="number" id="mvz" value="0"></div>`,
        [{ label: 'Annuler' }, { label: 'Déplacer', primary: true, action: b => a.moveBy(+b.querySelector('#mvx').value || 0, +b.querySelector('#mvy').value || 0, +b.querySelector('#mvz').value || 0) }]);
    }
    settingsDialog() {
      const a = this.app, st = a.project.settings;
      const f = (id, label, val, unit, step) => `<label>${label}</label><div class="prop-in"><input type="number" id="${id}" value="${val}" step="${step || 1}"><span class="unit">${unit}</span></div>`;
      const c = (id, label, val) => `<label class="chk span2"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}> ${label}</label>`;
      this.modal('Zone de travail et accrochage', `<div class="form-grid">
        <h4 class="span2">Zone de travail</h4>
        ${f('sW', 'Longueur (X)', st.workW, 'mm', 500)}${f('sD', 'Largeur (Y)', st.workD, 'mm', 500)}${f('sG', 'Pas de la grille', st.gridStep, 'mm', 100)}
        <h4 class="span2">Accrochage</h4>
        ${c('sSG', 'Magnétisme de grille', st.snapGrid)}${f('sSS', 'Pas du magnétisme', st.snapStep, 'mm', 10)}
        ${c('sSP', 'Accrochage magnétique des ports', st.snapPorts)}${f('sSR', 'Rayon d\'accrochage', st.snapRadius, 'mm', 10)}
        ${f('sA', 'Pas de rotation', st.angleStep, '°', 1)}${f('sZ', 'Hauteur de convoyage par défaut', st.defaultZ, 'mm', 10)}
        ${c('sCA', 'Ajout chaîné à la sortie de l\'élément sélectionné', st.chainAdd)}
        <h4 class="span2">Simulation</h4>
        ${c('sCo', 'Détection des collisions entre cartons', st.collisions)}
      </div>`, [{ label: 'Annuler' }, {
        label: 'Appliquer', primary: true, action: b => {
          const v = id => +b.querySelector('#' + id).value, ck = id => b.querySelector('#' + id).checked;
          a.project.change('Réglages', () => Object.assign(st, {
            workW: Math.max(2000, v('sW')), workD: Math.max(2000, v('sD')), gridStep: Math.max(100, v('sG')), snapGrid: ck('sSG'), snapStep: Math.max(1, v('sSS')),
            snapPorts: ck('sSP'), snapRadius: Math.max(10, v('sSR')), angleStep: C.clamp(v('sA'), 1, 180), defaultZ: Math.max(0, v('sZ')), chainAdd: ck('sCA'), collisions: ck('sCo')
          }));
          this.buildMenus();
        }
      }], { noFocus: true });
    }
    formatsDialog() {
      const a = this.app;
      const wrap = h('div');
      const render = () => {
        wrap.innerHTML = '';
        const t = h('table', { class: 'fmt-table' });
        t.innerHTML = '<tr><th>Nom</th><th>Type</th><th>Référence</th><th>L (mm)</th><th>l (mm)</th><th>H (mm)</th><th>Poids (kg)</th><th>Couleur</th><th></th></tr>';
        a.project.formats.forEach(f => {
          const tr = h('tr');
          const cell = (k, type) => {
            const td = h('td');
            const i = h('input', { type, value: f[k] });
            i.addEventListener('change', () => {
              a.project.change('Format de carton', () => { f[k] = type === 'number' ? Math.max(k === 'weight' ? 0 : 10, +i.value || 0) : i.value; });
            });
            td.appendChild(i); tr.appendChild(td);
          };
          cell('name', 'text');
          const tdk = h('td'), sk = h('select');
          C.FORMAT_KINDS.forEach(([v, l]) => sk.appendChild(h('option', { value: v, text: l })));
          sk.value = f.kind || 'box';
          sk.addEventListener('change', () => a.project.change('Format de carton', () => { f.kind = sk.value; }));
          tdk.appendChild(sk); tr.appendChild(tdk);
          cell('ref', 'text'); cell('L', 'number'); cell('W', 'number'); cell('H', 'number'); cell('weight', 'number'); cell('color', 'color');
          const td = h('td');
          if (!f.builtin) {
            const del = h('button', { class: 'icon-btn', html: C.icon('delete', 14), title: 'Supprimer ce format' });
            del.addEventListener('click', () => {
              if (a.project.cartons.some(c => c.formatId === f.id)) { C.toast('Format utilisé par des cartons posés', 'warn'); return; }
              a.project.change('Supprimer un format', () => {
                a.project.formats = a.project.formats.filter(x => x !== f);
                for (const e of a.project.elements) if (e.type === 'source') { e.params.formats = (e.params.formats || []).filter(x => x !== f.id); if (!e.params.formats.length) e.params.formats = ['moyen']; }
              });
              render();
            });
            td.appendChild(del);
          } else td.innerHTML = '<span class="muted small">intégré</span>';
          tr.appendChild(td);
          t.appendChild(tr);
        });
        wrap.appendChild(t);
        const add = h('button', { class: 'btn', html: C.icon('plus', 14) + ' Nouveau format' });
        add.addEventListener('click', () => {
          a.project.change('Nouveau format', () => a.project.formats.push(C.normalizeFormat({ name: 'Format ' + (a.project.formats.length + 1), ref: 'REF-' + (a.project.formats.length + 1), L: 450, W: 350, H: 300, weight: 7, color: C.palette[a.project.formats.length % C.palette.length] })));
          render();
        });
        wrap.appendChild(add);
        wrap.appendChild(h('p', { class: 'muted small', text: 'Les formats sont enregistrés avec le projet. Les entrées (générateurs) injectent les formats cochés dans leurs propriétés ; l\'outil « Carton » pose le format choisi dans la barre d\'outils.' }));
      };
      render();
      this.modal('Formats de cartons', wrap, [{ label: 'Fermer', primary: true }], { wide: true, noFocus: true });
    }
    projectsDialog() {
      const a = this.app;
      const wrap = h('div');
      const render = () => {
        wrap.innerHTML = '';
        const list = C.Storage.list();
        const top = h('div', { class: 'row-btns' });
        const nb = h('button', { class: 'btn primary', html: C.icon('new', 14) + ' Nouveau projet' }); nb.addEventListener('click', () => { this.closeModal(); a.newProject(); });
        const sb = h('button', { class: 'btn', html: C.icon('save', 14) + ' Enregistrer le projet courant' }); sb.addEventListener('click', () => { a.save(); render(); });
        const ib = h('button', { class: 'btn', html: C.icon('import', 14) + ' Importer JSON' }); ib.addEventListener('click', () => { this.closeModal(); $('fileInput').click(); });
        top.append(nb, sb, ib);
        wrap.appendChild(top);
        if (!list.length) { wrap.appendChild(h('p', { class: 'muted', text: 'Aucun projet enregistré dans ce navigateur.' })); return; }
        const t = h('table', { class: 'proj-table' });
        t.innerHTML = '<tr><th>Projet</th><th>Éléments</th><th>Modifié le</th><th></th></tr>';
        for (const it of list) {
          const tr = h('tr', { class: it.id === a.project.id ? 'cur' : '' });
          tr.innerHTML = `<td><b>${C.escape(it.name)}</b>${it.id === a.project.id ? ' <span class="badge info">ouvert</span>' : ''}</td><td>${it.count}</td><td>${new Date(it.updated).toLocaleString('fr-FR')}</td>`;
          const td = h('td', { class: 'acts' });
          const mk = (label, fn, cls) => { const b = h('button', { class: 'btn small ' + (cls || ''), text: label }); b.addEventListener('click', fn); td.appendChild(b); };
          mk('Ouvrir', () => { this.closeModal(); a.openProject(it.id); }, 'primary');
          mk('Renommer', () => { const n = window.prompt('Nouveau nom', it.name); if (n) { C.Storage.rename(it.id, n); if (it.id === a.project.id) { a.project.name = n; this.refreshTitle(); } render(); } });
          mk('Dupliquer', () => { C.Storage.duplicate(it.id); render(); });
          mk('Exporter', () => { const d = C.Storage.load(it.id); if (d) C.download(C.safeName(d.name) + '.convoy3d.json', JSON.stringify(d, null, 2), 'application/json'); });
          mk('Supprimer', () => { if (window.confirm(`Supprimer définitivement « ${it.name} » du navigateur ?`)) { C.Storage.remove(it.id); render(); } }, 'danger');
          tr.appendChild(td);
          t.appendChild(tr);
        }
        wrap.appendChild(t);
        wrap.appendChild(h('p', { class: 'muted small', text: 'Les projets sont conservés dans le stockage local de ce navigateur. Exportez-les en JSON pour les sauvegarder ou les partager.' }));
      };
      render();
      this.modal('Projets', wrap, [{ label: 'Fermer' }], { wide: true, noFocus: true });
    }
    bomDialog() {
      const a = this.app;
      this.modal('Nomenclature des convoyeurs', `<div class="bom-wrap">${C.IO.bomHTML(a)}</div>`, [
        { label: 'Fermer' },
        { label: 'Imprimer', action: () => C.IO.printHTML('Nomenclature', `<h1>${C.escape(a.project.name)} — Nomenclature</h1>${C.IO.bomHTML(a)}`), keep: true },
        { label: 'Exporter CSV', primary: true, action: () => C.IO.exportBOMCSV(a), keep: true }
      ], { xwide: true, noFocus: true });
    }
    planDialog() {
      const a = this.app;
      const svg = C.IO.planSVG(a);
      this.modal('Plan 2D — vue de dessus', `<div class="plan-wrap">${svg}</div>
        <label class="chk small"><input type="checkbox" id="planBom" checked> Inclure la nomenclature à l'impression</label>`, [
        { label: 'Fermer' },
        { label: 'Télécharger SVG', action: () => C.download(C.safeName(a.project.name) + '_plan.svg', svg, 'image/svg+xml'), keep: true },
        { label: 'Imprimer', primary: true, keep: true, action: b => C.IO.printHTML('Plan ' + a.project.name, `${C.IO.planSVG(a, { width: 1500 })}${b.querySelector('#planBom').checked ? '<div class="pb"></div><h1>Nomenclature</h1>' + C.IO.bomHTML(a) : ''}`) }
      ], { xwide: true, noFocus: true });
    }
    /** Caméra de suivi d'un carton + enregistrement vidéo. */
    filmDialog(cartonId) {
      const a = this.app;
      const srcs = a.project.elements.filter(e => e.type === 'source' || e.type === 'osr');
      const selC = cartonId || (a.sim.active && Array.from(a.cartonSelection).find(id => a.sim.cartonById(id)));
      if (!srcs.length && !selC) { C.toast('Ajoutez une entrée (générateur) ou sélectionnez un carton en simulation', 'warn'); return; }
      const opts = [];
      if (selC) opts.push([`c:${selC}`, `Carton sélectionné (#${selC})`]);
      for (const s of srcs) opts.push([`s:${s.name}`, `Prochain carton de ${s.name} (du début à la fin)`]);
      const recOk = C.Recorder.supported();
      const body = this.modal('Filmer le parcours d\'un carton', `<div class="form-grid">
        <label>Carton suivi</label><select id="fmWho">${opts.map(o => `<option value="${C.escape(o[0])}">${C.escape(o[1])}</option>`).join('')}</select>
        <label class="span2">Vues utilisées (alternées automatiquement)</label>
        <div class="span2 views-grid">${C.CAMERA_VIEWS.map(([v, l]) => `<label class="chk"><input type="checkbox" value="${v}" ${v !== 'onboard' && v !== 'front' ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <label>Changer de vue toutes les</label><div class="prop-in"><input type="number" id="fmInt" value="6" min="0" step="1"><span class="unit">s</span></div>
        <label class="chk span2"><input type="checkbox" id="fmElem" checked> Changer aussi de vue à chaque nouvel équipement traversé</label>
        <label>Vitesse de simulation</label><select id="fmSpeed"><option value="1">×1 (temps réel)</option><option value="2">×2</option><option value="5">×5</option><option value="10">×10</option></select>
        <label class="chk span2"><input type="checkbox" id="fmRec" ${recOk ? 'checked' : 'disabled'}> Enregistrer la vidéo (fichier ${recOk ? 'WebM' : 'non pris en charge par ce navigateur'})</label>
        <p class="span2 muted small">La caméra suit le carton depuis son entrée jusqu'à sa sortie ; la vidéo est téléchargée automatiquement à l'arrivée. Molette : distance de la caméra · ◀ ▶ : changer de vue · Échap : arrêter.</p>
      </div>`, [{ label: 'Annuler' }, {
        label: 'Démarrer', primary: true, action: b => {
          const who = b.querySelector('#fmWho').value;
          const views = Array.from(b.querySelectorAll('.views-grid input:checked')).map(i => i.value);
          const o = {
            views, interval: Math.max(0, +b.querySelector('#fmInt').value || 0), switchOnElement: b.querySelector('#fmElem').checked,
            record: b.querySelector('#fmRec').checked, simSpeed: +b.querySelector('#fmSpeed').value
          };
          if (who.startsWith('c:')) o.cartonId = who.slice(2); else o.sourceName = who.slice(2);
          a.director.start(o);
        }
      }], { noFocus: true });
      void body;
    }
    screenshot() {
      const url = this.app.viewport.screenshot();
      C.downloadDataURL(C.safeName(this.app.project.name) + '_vue3D.png', url);
      C.toast('Capture enregistrée', 'ok');
    }
    exportTop() {
      const vp = this.app.viewport;
      const wasLabels = vp.show.labels;
      const r = vp.topViewPNG(3200);
      // ajout d'un cartouche (titre + échelle) sur l'image
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h + 70;
        const g = cv.getContext('2d');
        g.fillStyle = '#1a1e24'; g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0);
        g.fillStyle = '#e8edf2'; g.font = 'bold 26px sans-serif';
        g.fillText(this.app.project.name + ' — vue de dessus', 20, r.h + 32);
        const mmPerPx = (r.box.x1 - r.box.x0) / r.w;
        const px5 = 5000 / mmPerPx;
        g.fillRect(20, r.h + 46, px5, 10);
        g.font = '16px sans-serif'; g.fillText('5 m', 30 + px5, r.h + 57);
        g.fillText(new Date().toLocaleString('fr-FR'), cv.width - 260, r.h + 32);
        C.downloadDataURL(C.safeName(this.app.project.name) + '_vue_dessus.png', cv.toDataURL('image/png'));
        C.toast('Vue de dessus exportée (' + r.w + '×' + r.h + ' px)', 'ok');
      };
      img.src = r.url;
      void wasLabels;
    }
    helpDialog() {
      this.modal('Prise en main', `
        <div class="help-grid">
          <div><h4>Concevoir</h4><ul>
            <li>Cliquez un module de la <b>bibliothèque</b> : s'il y a un convoyeur sélectionné avec une sortie libre, le module s'y <b>accroche automatiquement</b> ; sinon cliquez dans la vue pour le placer (ou glissez-déposez).</li>
            <li>Déplacez un élément en le faisant glisser : il s'<b>accroche magnétiquement</b> aux ports libres proches (alignement, cap et hauteur). Alt : désactiver le magnétisme.</li>
            <li>Ports : <span class="pill ok">vert</span> raccordé, <span class="pill err">rouge</span> libre ou défaut, <span class="pill warn">orange</span> écart de hauteur, <span class="pill opt">gris</span> sortie optionnelle.</li>
            <li>Une sortie qui débouche sur le côté d'un convoyeur crée une <b>jonction</b> (fusion de flux).</li>
            <li><b>Cariste CACES 5</b> : sélectionnez le chariot, « Nouvelle mission », cliquez la palette à prendre (sol ou rack) puis l'endroit où la déposer. Le chariot contourne les obstacles (barrières, poteaux, racks, convoyeurs…) et suit le fléchage au sol dans le sens des flèches.</li>
            <li><b>Fléchage au sol</b> : allées droites ou en virage qui s'accrochent bout à bout (sélectionnez une allée puis cliquez une autre allée de la bibliothèque pour la prolonger). Itinéraire prévu : pointillés verts (sur les allées) ou bleus (trajet libre).</li>
            <li><b>Murs d'entrepôt</b> : un convoyeur (ou un objet) qui traverse un mur y perce automatiquement une ouverture. Portes : champ « Portes / ouvertures manuelles ». Bouton « Murs » en haut à droite : visibles / translucides / masqués.</li>
            <li><b>Escalier de trémie</b> : posez-le sur le plancher d'une mezzanine, il découpe une trémie avec garde-corps et descend jusqu'au sol ; nombre de marches réglable (0 = automatique).</li>
            <li><b>Carton ouvert → poste GTP → fermeuse</b> : les cartons ouverts se remplissent d'articles au poste GTP (cadence en articles/h), puis la fermeuse pose une coiffe ajustée au format.</li>
            <li><b>Mezzanine modulaire</b> : accolez des modules bord à bord (accrochage magnétique ou boutons « Étendre ») pour obtenir la surface voulue ; les garde-corps disparaissent sur les jonctions.</li>
            <li><b>Mezzanine</b> : tout objet placé ou glissé au-dessus du plancher s'y pose automatiquement (Alt : garder la hauteur). Déplacer la mezzanine emporte les objets posés dessus.</li>
            <li>Modifiez toutes les cotes dans le panneau <b>Propriétés</b> (longueur, largeur, pente en ° ou %, hauteur de sortie, rayon, rouleaux…).</li>
          </ul></div>
          <div><h4>Simuler</h4><ul>
            <li>Les <b>Entrées</b> génèrent des cartons (cadence, formats), les <b>Sorties</b> les évacuent et les comptent.</li>
            <li>Outil <b>Carton (K)</b> : posez des cartons sur les convoyeurs, même pendant la simulation.</li>
            <li>Trieurs, transferts et tables tournantes : règles <i>cyclique</i>, <i>aléatoire</i> ou par <i>critères</i> (ex. <code>1 : format=Petit</code>, <code>2 : poids&gt;10</code>).</li>
            <li>Arrêtez un convoyeur (« En marche ») ou fermez une butée pendant la simulation pour observer l'accumulation.</li>
          </ul></div>
          <div><h4>Souris</h4><ul>
            <li>Clic gauche glissé sur le vide : rotation de la vue</li>
            <li>Clic droit / molette enfoncée glissé : déplacement de la vue</li>
            <li>Molette : zoom vers le curseur · Double-clic : cadrer</li>
            <li>Ctrl/Maj + clic : sélection multiple · Maj + glisser : rectangle</li>
            <li>Clic droit sur un élément : menu contextuel</li>
          </ul></div>
          <div><h4>Clavier</h4><table class="keys">
            <tr><td>Suppr</td><td>Supprimer</td></tr><tr><td>Ctrl+Z / Ctrl+Y</td><td>Annuler / Rétablir</td></tr>
            <tr><td>Ctrl+C / V / D</td><td>Copier / Coller / Dupliquer</td></tr><tr><td>Ctrl+G / Ctrl+Maj+G</td><td>Grouper / Dégrouper</td></tr>
            <tr><td>R / Maj+R</td><td>Rotation ± pas</td></tr><tr><td>Flèches, PgPréc/PgSuiv</td><td>Déplacer en X/Y, Z (Maj ×10)</td></tr>
            <tr><td>N</td><td>Même module à la suite</td></tr><tr><td>I</td><td>Inverser le sens</td></tr>
            <tr><td>1 2 3 4 5</td><td>Dessus, face, côté, iso, 3D</td></tr><tr><td>P</td><td>Perspective / ortho</td></tr>
            <tr><td>F</td><td>Cadrer</td></tr><tr><td>M / K</td><td>Mesurer / Poser des cartons</td></tr>
            <tr><td>Espace</td><td>Lecture / pause</td></tr><tr><td>Ctrl+S / Ctrl+O</td><td>Enregistrer / Projets</td></tr>
          </table></div>
        </div>`, [{ label: 'Fermer', primary: true }], { xwide: true, noFocus: true });
    }
    aboutDialog() {
      this.modal('À propos', `<p><b>Convoy3D ${C.VERSION}</b> — logiciel web de conception et de simulation de convoyage industriel en 3D.</p>
        <p>HTML5, CSS3, JavaScript pur et Three.js (r158, licence MIT). Fonctionne hors-ligne dans le navigateur, sans installation ni serveur. Les projets sont stockés localement et exportables en JSON.</p>
        <p class="muted small">Unités : millimètres, mètres par seconde, degrés. Repère : X, Y au sol, Z vertical.</p>`, [{ label: 'Fermer', primary: true }]);
    }
  }

  C.UI = UI;
})(window.C3D);
