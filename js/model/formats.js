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
    { id: 'bac', name: 'Bac plastique', ref: 'BAC-64', L: 600, W: 400, H: 220, weight: 8, color: '#3d7fd6', builtin: true },
    { id: 'colis', name: 'Colis e-commerce', ref: 'ECOM', L: 350, W: 250, H: 120, weight: 1.5, color: '#d9c39a', builtin: true }
  ];

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
      builtin: !!f.builtin
    };
  };
})(window.C3D);
