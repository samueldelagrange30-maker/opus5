/* =====================================================================
 * Convoy3D — Utilitaires communs
 * Espace de noms global : window.C3D
 * Toutes les longueurs du modèle sont en millimètres (mm), les vitesses
 * en m/s, les angles stockés en degrés dans les paramètres utilisateur.
 * Repère : X (droite), Y (profondeur), Z (hauteur) — Z vers le haut.
 * ===================================================================== */
window.C3D = window.C3D || {};
(function (C) {
  'use strict';

  C.VERSION = '1.0.0';
  C.DEG = Math.PI / 180;
  C.RAD = 180 / Math.PI;

  /** Identifiant unique court. */
  let uidCounter = 0;
  C.uid = function (prefix) {
    uidCounter = (uidCounter + 1) % 1e6;
    return (prefix || 'e') + Date.now().toString(36).slice(-5) +
      uidCounter.toString(36) + Math.random().toString(36).slice(2, 5);
  };

  C.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  C.lerp = (a, b, t) => a + (b - a) * t;
  C.round = (v, d = 0) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
  C.num = (v, def = 0) => { const n = parseFloat(v); return isFinite(n) ? n : def; };
  /** Normalise un angle en radians dans ]-PI, PI]. */
  C.normAngle = function (a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  };

  /** Format numérique français. */
  C.fmt = function (v, d = 0) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  C.fmtTime = function (sec) {
    if (!isFinite(sec)) return '—';
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    const pad = n => String(n).padStart(2, '0');
    return (h ? h + ':' : '') + pad(m) + ':' + pad(s);
  };

  C.clone = o => JSON.parse(JSON.stringify(o));
  C.escape = s => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Petit gestionnaire d'événements. */
  C.Emitter = class {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return () => this.off(ev, fn); }
    off(ev, fn) { const l = this._h[ev]; if (l) this._h[ev] = l.filter(f => f !== fn); }
    emit(ev, ...args) { (this._h[ev] || []).slice().forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } }); }
  };
  C.bus = new C.Emitter();

  /** Création d'élément DOM : C.h('div', {class:'x', onclick:fn}, [enfants]). */
  C.h = function (tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    if (children !== undefined && children !== null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c === null || c === undefined || c === false) return;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return el;
  };

  /** Téléchargement d'un contenu texte / blob. */
  C.download = function (filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = C.h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  C.downloadDataURL = function (filename, dataURL) {
    const a = C.h('a', { href: dataURL, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
  };
  C.safeName = s => String(s || 'projet').replace(/[^a-z0-9_\-àâäéèêëïîôöùûüç ]/gi, '_').trim().replace(/\s+/g, '_') || 'projet';

  /** Notifications temporaires. */
  C.toast = function (msg, type) {
    let box = document.getElementById('toasts');
    if (!box) { box = C.h('div', { id: 'toasts' }); document.body.appendChild(box); }
    const t = C.h('div', { class: 'toast ' + (type || 'info') }, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  };

  /** Couleur hex -> [r,g,b] 0..1 et inversement ; dégradé vert->rouge. */
  C.heatColor = function (t) {
    t = C.clamp(t, 0, 1);
    const r = t < 0.5 ? t * 2 : 1, g = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
    const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r * 0.95) + toHex(g * 0.8) + toHex(0.15);
  };
  C.palette = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6',
    '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000'];

  /** Debounce. */
  C.debounce = function (fn, ms) {
    let t = null;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };

  /** Générateur pseudo-aléatoire déterministe (simulation reproductible). */
  C.RNG = class {
    constructor(seed) { this.s = (seed >>> 0) || 123456789; }
    next() { // mulberry32
      let t = (this.s += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
})(window.C3D);
