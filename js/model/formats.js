/* =====================================================================
 * Convoy3D — Formats de cartons prédéfinis
 * L = longueur (dans le sens de circulation à orientation 0°),
 * W = largeur, H = hauteur (mm), poids en kg.
 * ===================================================================== */
(function (C) {
  'use strict';
  C.DEFAULT_FORMATS = [
    { id: 'petit', name: 'Petit', ref: 'CRT-S', L: 300, W: 200, H: 150, weight: 2, color: '#c8a26b', builtin: true },
    { id: 'moyen', name: 'Moyen', ref: 'CRT-M', L: 400, W: 300, H: 250, weight: 6, color: '#b98b52', builtin: true },
    { id: 'grand', name: 'Grand', ref: 'CRT-L', L: 600, W: 400, H: 400, weight: 14, color: '#a8763f', builtin: true },
    { id: 'europe', name: 'Europe 600×400', ref: 'EU-64', L: 600, W: 400, H: 300, weight: 10, color: '#d6b37c', builtin: true },
    { id: 'plat', name: 'Plat', ref: 'CRT-F', L: 500, W: 350, H: 100, weight: 3, color: '#e0c08f', builtin: true },
    { id: 'bac', name: 'Bac plastique', ref: 'BAC-64', L: 600, W: 400, H: 320, weight: 8, color: '#9aa0a6', kind: 'tote', builtin: true },
    { id: 'colis', name: 'Colis e-commerce', ref: 'ECOM', L: 350, W: 250, H: 120, weight: 1.5, color: '#d9c39a', builtin: true },
    // cartons ouverts (rabats relevés) : à remplir (poste GTP) puis fermer (fermeuse à coiffe)
    { id: 'ouvert', name: 'Carton ouvert', ref: 'CRT-O', L: 400, W: 300, H: 250, weight: 0.4, color: '#c8a26b', kind: 'open', builtin: true },
    { id: 'ouvert-grand', name: 'Carton ouvert grand', ref: 'CRT-OL', L: 600, W: 400, H: 350, weight: 0.7, color: '#bf9a62', kind: 'open', builtin: true },
    // unités de charge palettisées (à convoyer sur convoyeur à chaîne / rouleaux larges)
    { id: 'pal-euro', name: 'Palette Europe', ref: 'PAL-EU', L: 1200, W: 800, H: 144, weight: 25, color: '#c9a36b', kind: 'euro', builtin: true },
    { id: 'pal-perdue', name: 'Palette perdue', ref: 'PAL-PP', L: 1200, W: 800, H: 120, weight: 12, color: '#d8c49a', kind: 'perdue', builtin: true },
    { id: 'pal-euro-ctn', name: 'Palette Europe + cartons', ref: 'PAL-EU-C', L: 1200, W: 800, H: 1200, weight: 280, color: '#b98b52', kind: 'euro-load', builtin: true },
    { id: 'pal-perdue-ctn', name: 'Palette perdue + cartons', ref: 'PAL-PP-C', L: 1200, W: 800, H: 1000, weight: 200, color: '#c49a62', kind: 'perdue-load', builtin: true }
  ];
  /** Types d'unités de charge. */
  C.FORMAT_KINDS = [['box', 'Carton fermé'], ['tote', 'Bac plastique ajouré (tote)'], ['open', 'Carton ouvert (rabats relevés)'], ['euro', 'Palette Europe'], ['perdue', 'Palette perdue'], ['euro-load', 'Palette Europe + cartons'], ['perdue-load', 'Palette perdue + cartons']];

  /** Normalise un format (valeurs numériques, bornes). */
  C.normalizeFormat = function (f) {
    return {
      id: f.id || C.uid('f'),
      name: String(f.name || 'Format'),
      ref: String(f.ref || ''),
      L: Math.max(20, C.num(f.L, 400)),
      W: Math.max(20, C.num(f.W, 300)),
      H: Math.max(10, C.num(f.H, 250)),
      weight: Math.max(0, C.num(f.weight, 5)),
      color: /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#b98b52',
      kind: C.FORMAT_KINDS && C.FORMAT_KINDS.some(k => k[0] === f.kind) ? f.kind : 'box',
      builtin: !!f.builtin
    };
  };
})(window.C3D);
