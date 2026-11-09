/* =====================================================================
 * Convoy3D — Projet (données de l'installation) + historique annuler/rétablir
 *
 * Élément : { id, type, name, x, y, z, rot, params:{...}, groupId }
 *   - convoyeurs : (x,y,z) = point d'entrée de la trajectoire (axe, surface
 *     de convoyage), rot = cap en degrés (sens trigonométrique, vue de dessus)
 *   - éléments statiques "centered" : (x,y) = centre, z = altitude de base
 * Carton posé : { id, elementId, track, s, formatId, orientation, name,
 *                  speed, overrides:{L,W,H,weight,color,ref} }
 * ===================================================================== */
(function (C) {
  'use strict';

  const PREFIX = {
    straight: 'CV', curve: 'VR', heightchange: 'CH', spiral: 'SP', transfer: 'TR', sorter: 'TRI',
    turntable: 'TT', elevator: 'EL', stop: 'BT', separator: 'SEP', accumulation: 'ACC',
    workstation: 'PP', source: 'IN', sink: 'OUT', obstacle: 'OBS', table: 'TAB', guide: 'GL', mezzanine: 'MEZ', rack: 'RK', osr: 'OSR'
  };

  C.defaultSettings = () => ({
    workW: 30000, workD: 20000,      // zone de travail (mm)
    gridStep: 1000,                  // pas de la grille affichée (mm)
    snapStep: 50, snapGrid: true,    // magnétisme de grille (mm)
    snapPorts: true, snapRadius: 300,// accrochage magnétique des ports
    angleStep: 15,                   // pas de rotation (°)
    chainAdd: true,                  // ajout chaîné à la sortie de la sélection
    collisions: true,                // détection de collisions entre cartons
    defaultZ: 800
  });

  class Project extends C.Emitter {
    constructor() { super(); this.undoStack = []; this.redoStack = []; this.reset(); }

    reset(name) {
      this.id = C.uid('p');
      this.name = name || 'Nouveau projet';
      this.created = Date.now();
      this.settings = C.defaultSettings();
      this.formats = C.DEFAULT_FORMATS.map(f => Object.assign({}, f));
      this.elements = [];
      this.cartons = [];
      this.measures = [];
      this.camera = null;
      this.undoStack = []; this.redoStack = [];
      this.dirty = false;
    }

    /* ----------------------------- éléments ----------------------------- */
    nextName(type) {
      const pre = PREFIX[type] || 'EL';
      let n = 1;
      const names = new Set(this.elements.map(e => e.name));
      while (names.has(pre + '-' + String(n).padStart(2, '0'))) n++;
      return pre + '-' + String(n).padStart(2, '0');
    }

    createElement(type, params, attrs) {
      const def = C.Types.get(type);
      if (!def) throw new Error('Type inconnu : ' + type);
      const p = Object.assign(C.clone(def.defaults), C.clone(params || {}));
      const el = Object.assign({
        id: C.uid('e'), type, name: p.name || this.nextName(type),
        x: 0, y: 0, z: def.conveyor ? this.settings.defaultZ : 0, rot: 0, groupId: null
      }, attrs || {});
      delete p.name;
      el.params = p;
      return el;
    }
    addElement(el) { this.elements.push(el); return el; }
    getElement(id) { return this.elements.find(e => e.id === id); }
    removeElements(ids) {
      const set = new Set(ids);
      this.elements = this.elements.filter(e => !set.has(e.id));
      this.cartons = this.cartons.filter(c => !set.has(c.elementId));
    }
    getCarton(id) { return this.cartons.find(c => c.id === id); }
    format(id) { return this.formats.find(f => f.id === id) || this.formats[0]; }

    /** Dimensions effectives d'un carton posé (format + surcharges). */
    cartonSpec(c) {
      const f = this.format(c.formatId) || C.DEFAULT_FORMATS[1];
      const o = c.overrides || {};
      return {
        name: c.name || f.name, ref: o.ref || f.ref, formatName: f.name, formatId: f.id,
        L: o.L || f.L, W: o.W || f.W, H: o.H || f.H, weight: o.weight !== undefined && o.weight !== '' ? +o.weight : f.weight,
        color: o.color || f.color, speed: +c.speed || 0, orientation: +c.orientation || 0
      };
    }

    /* ----------------------------- historique ---------------------------- */
    snapshot() {
      return JSON.stringify({
        elements: this.elements, cartons: this.cartons, measures: this.measures,
        formats: this.formats, settings: this.settings, name: this.name
      });
    }
    restore(snap) {
      const d = JSON.parse(snap);
      this.elements = d.elements; this.cartons = d.cartons; this.measures = d.measures;
      this.formats = d.formats; this.settings = d.settings; this.name = d.name;
    }
    /**
     * Applique une modification enregistrée dans l'historique.
     * key : clé de regroupement (saisies successives dans un même champ).
     */
    change(label, fn, key) {
      const now = Date.now();
      if (!(key && key === this._lastKey && now - this._lastTime < 1500)) {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
      }
      this._lastKey = key; this._lastTime = now;
      fn();
      this.dirty = true;
      this.emit('changed', { label });
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.snapshot());
      this.restore(this.undoStack.pop());
      this._lastKey = null; this.dirty = true;
      this.emit('changed', { label: 'Annuler', history: true });
      return true;
    }
    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.snapshot());
      this.restore(this.redoStack.pop());
      this._lastKey = null; this.dirty = true;
      this.emit('changed', { label: 'Rétablir', history: true });
      return true;
    }

    /* --------------------------- sérialisation --------------------------- */
    toJSON(network) {
      return {
        format: 'convoy3d-project', version: 2, app: 'Convoy3D ' + C.VERSION,
        id: this.id, name: this.name, created: this.created, saved: Date.now(),
        settings: this.settings, formats: this.formats, elements: this.elements,
        cartons: this.cartons, measures: this.measures, camera: this.camera,
        connections: network ? network.connectionList() : []
      };
    }
    /** Charge un projet depuis un objet JSON (validation + normalisation). */
    load(data) {
      if (!data || typeof data !== 'object') throw new Error('Fichier invalide');
      if (data.format && data.format !== 'convoy3d-project') throw new Error('Format de fichier non reconnu');
      if (!Array.isArray(data.elements)) throw new Error('Le fichier ne contient pas d\'éléments');
      this.reset(data.name || 'Projet importé');
      this.id = data.id || this.id;
      this.created = data.created || Date.now();
      this.settings = Object.assign(C.defaultSettings(), data.settings || {});
      if (Array.isArray(data.formats) && data.formats.length) this.formats = data.formats.map(C.normalizeFormat);
      // garantir la présence des formats intégrés
      for (const f of C.DEFAULT_FORMATS) if (!this.formats.find(x => x.id === f.id)) this.formats.push(Object.assign({}, f));
      for (const e of data.elements) {
        const def = C.Types.get(e.type);
        if (!def) { console.warn('Type ignoré', e.type); continue; }
        this.elements.push({
          id: e.id || C.uid('e'), type: e.type, name: e.name || this.nextName(e.type),
          x: C.num(e.x), y: C.num(e.y), z: C.num(e.z), rot: C.num(e.rot), groupId: e.groupId || null,
          params: Object.assign(C.clone(def.defaults), e.params || {})
        });
      }
      // v1 → v2 : le convoyeur de retour devant les tours OSR n'est plus actif par défaut
      if ((+data.version || 1) < 2) for (const e of this.elements) if (e.type === 'osr') e.params.returnLane = false;
      this.cartons = (data.cartons || []).filter(c => this.getElement(c.elementId));
      this.measures = data.measures || [];
      this.camera = data.camera || null;
      this.dirty = false;
    }
  }

  C.Project = Project;
})(window.C3D);
