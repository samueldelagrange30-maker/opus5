/* =====================================================================
 * Convoy3D — Catalogue des types d'éléments
 *
 * Chaque type déclare :
 *   - label, cat (catégorie), conveyor (transporte des cartons ?)
 *   - defaults : paramètres par défaut (mm, m/s, degrés)
 *   - fields   : liste des champs éditables dans le panneau de propriétés
 *   - build(p) : construit le MODÈLE LOCAL (trajectoires + ports + aiguillages)
 *
 * Modèle local retourné par build() :
 *   tracks  : { id: { segs, reversed, yawMode } }    trajectoires parcourues
 *   ports   : [{ id, role:'in'|'out', track, at:'start'|'end', optional, out }]
 *   diverts : [{ track, s, to, out, turn }]   aiguillages internes (sorties n°out)
 * Le réseau (network.js) convertit ce modèle en coordonnées monde.
 * ===================================================================== */
(function (C) {
  'use strict';
  const D = C.DEG;

  C.SURFACES = [
    ['rollers', 'Rouleaux motorisés'],
    ['belt', 'Bande'],
    ['mat', 'Tapis modulaire motorisé'],
    ['chain', 'Chaîne'],
    ['freerollers', 'Rouleaux libres (gravitaire)']
  ];
  C.SURFACE_LABEL = Object.fromEntries(C.SURFACES);
  /** Pente maximale admissible par technologie (degrés). */
  C.SURFACE_MAX_SLOPE = { rollers: 5, belt: 25, mat: 20, chain: 15, freerollers: 10 };

  /* ------------------------------------------------------------------
   * Bibliothèque de champs
   * ------------------------------------------------------------------ */
  const FL = {};
  function fld(id, label, type, opt) { FL[id] = Object.assign({ id, k: id, label, type }, opt || {}); }

  // --- Général / position
  fld('name', 'Nom / repère', 'text', { group: 'Général', attr: true });
  fld('x', 'Position X', 'number', { group: 'Position', attr: true, unit: 'mm', step: 10 });
  fld('y', 'Position Y', 'number', { group: 'Position', attr: true, unit: 'mm', step: 10 });
  fld('z', 'Hauteur de convoyage', 'number', { group: 'Position', attr: true, unit: 'mm', step: 10, min: 0 });
  FL.zBase = Object.assign({}, FL.z, { id: 'zBase', label: 'Altitude de base' });
  fld('rot', 'Rotation (cap)', 'number', { group: 'Position', attr: true, unit: '°', step: 5 });

  // --- Dimensions
  fld('length', 'Longueur', 'number', { group: 'Dimensions', unit: 'mm', min: 50, step: 10 });
  fld('width', 'Largeur hors-tout', 'number', { group: 'Dimensions', unit: 'mm', min: 100, step: 10 });
  fld('usefulWidth', 'Largeur utile', 'number', { group: 'Dimensions', unit: 'mm', min: 50, step: 10 });
  fld('height', 'Hauteur', 'number', { group: 'Dimensions', unit: 'mm', min: 10, step: 10 });
  fld('frameH', 'Hauteur de structure', 'number', { group: 'Dimensions', unit: 'mm', min: 40, step: 10 });
  fld('thickness', 'Épaisseur', 'number', { group: 'Dimensions', unit: 'mm', min: 5, step: 5 });

  // --- Pente
  fld('slope', 'Pente', 'number', { group: 'Pente & hauteurs', unit: '°', min: -60, max: 60, step: 0.5 });
  fld('slopePct', 'Pente (%)', 'number', {
    group: 'Pente & hauteurs', unit: '%', step: 1,
    get: el => Math.tan(el.params.slope * D) * 100,
    set: (el, v) => { el.params.slope = C.clamp(Math.atan(v / 100) / D, -60, 60); }
  });
  fld('zEnd', 'Hauteur à l\'extrémité', 'number', {
    group: 'Pente & hauteurs', unit: 'mm', step: 10,
    get: el => el.z + C.Types.geomRise(el),
    set: (el, v) => C.Types.setRise(el, v - el.z)
  });
  fld('rise', 'Dénivelé', 'number', { group: 'Pente & hauteurs', unit: 'mm', step: 10 });
  fld('dH', 'Changement de hauteur', 'number', { group: 'Pente & hauteurs', unit: 'mm', step: 10 });
  fld('length1', 'Longueur palier d\'entrée', 'number', { group: 'Dimensions', unit: 'mm', min: 0, step: 10 });
  fld('slopeLen', 'Longueur inclinée', 'number', { group: 'Dimensions', unit: 'mm', min: 100, step: 10 });
  fld('length2', 'Longueur palier de sortie', 'number', { group: 'Dimensions', unit: 'mm', min: 0, step: 10 });

  // --- Courbes
  fld('angle', 'Angle du virage', 'number', { group: 'Virage', unit: '°', min: 1, max: 359, step: 5 });
  fld('radius', 'Rayon de courbure (axe)', 'number', { group: 'Virage', unit: 'mm', min: 100, step: 10 });
  fld('side', 'Sens du virage', 'select', { group: 'Virage', options: [['left', 'Gauche'], ['right', 'Droite']] });
  fld('turns', 'Nombre de tours', 'number', { group: 'Spirale', min: 0.25, max: 20, step: 0.25 });
  fld('lengthIn', 'Longueur d\'entrée', 'number', { group: 'Spirale', unit: 'mm', min: 0, step: 10 });
  fld('lengthOut', 'Longueur de sortie', 'number', { group: 'Spirale', unit: 'mm', min: 0, step: 10 });

  // --- Surface
  fld('surface', 'Type de convoyeur', 'select', { group: 'Surface de convoyage', options: C.SURFACES });
  fld('rollerDiam', 'Diamètre des rouleaux', 'number', { group: 'Surface de convoyage', unit: 'mm', min: 10, max: 200, step: 1 });
  fld('rollerPitch', 'Espacement des rouleaux', 'number', { group: 'Surface de convoyage', unit: 'mm', min: 15, step: 5 });
  fld('rollerCount', 'Nombre de rouleaux', 'number', {
    group: 'Surface de convoyage', min: 1, step: 1,
    get: el => C.Types.rollerCount(el),
    set: (el, v) => { const L = C.Types.devLength(el); el.params.rollerPitch = C.clamp(L / Math.max(1, Math.round(v)), 15, 5000); }
  });
  fld('guideH', 'Hauteur des guides latéraux', 'number', { group: 'Surface de convoyage', unit: 'mm', min: 0, max: 1000, step: 5 });

  // --- Fonctionnement
  fld('speed', 'Vitesse', 'number', { group: 'Fonctionnement', unit: 'm/s', min: 0, max: 10, step: 0.05, live: true });
  fld('running', 'En marche', 'bool', { group: 'Fonctionnement', live: true });
  fld('reverse', 'Sens de circulation inversé', 'bool', { group: 'Fonctionnement' });
  fld('gap', 'Espacement mini entre cartons', 'number', { group: 'Fonctionnement', unit: 'mm', min: 0, step: 10, live: true });
  fld('vmin', 'Vitesse mini (poussée)', 'number', { group: 'Fonctionnement', unit: 'm/s', min: 0, max: 2, step: 0.05, live: true });

  // --- Équipements spécifiques
  fld('sides', 'Sorties latérales', 'select', { group: 'Transfert', options: [['both', 'Gauche et droite'], ['left', 'Gauche'], ['right', 'Droite']] });
  fld('outputs', 'Nombre de sorties', 'number', { group: 'Trieur', min: 1, max: 12, step: 1 });
  fld('sortSide', 'Côté des sorties', 'select', { group: 'Trieur', options: [['right', 'Droite'], ['left', 'Gauche'], ['alternate', 'Alterné']] });
  fld('divertAngle', 'Angle de déviation', 'select', { group: 'Trieur', options: [[90, '90°'], [60, '60°'], [45, '45°'], [30, '30°']] });
  fld('mode', 'Règle d\'aiguillage', 'select', {
    group: 'Aiguillage', live: true,
    options: [['cyclic', 'Cyclique (alternance)'], ['rules', 'Règles (critères)'], ['random', 'Aléatoire'], ['straight', 'Tout droit / 1re sortie']]
  });
  fld('rules', 'Règles (une par ligne)', 'textarea', {
    group: 'Aiguillage', live: true,
    help: 'Syntaxe « sortie : critère ». Sortie 0 = tout droit. Critères : ref=ABC, format=Moyen, poids>5, poids<2, couleur=#ff0000, source=Entrée 1, L>500, * (tous). Exemple :\n1 : format=Petit\n2 : poids>10'
  });
  fld('outAngles', 'Angles des sorties (°)', 'text', { group: 'Table tournante', help: 'Liste séparée par des virgules, 0 = tout droit, 90 = gauche, -90 = droite.' });
  fld('diameter', 'Diamètre du plateau', 'number', { group: 'Table tournante', unit: 'mm', min: 300, step: 10 });
  fld('rotSpeed', 'Vitesse de rotation', 'number', { group: 'Table tournante', unit: '°/s', min: 5, max: 720, step: 5, live: true });
  fld('elevH', 'Course verticale (+ montée / − descente)', 'number', { group: 'Élévateur', unit: 'mm', step: 10 });
  fld('bedLength', 'Longueur de plateau', 'number', { group: 'Élévateur', unit: 'mm', min: 200, step: 10 });
  fld('config', 'Configuration', 'select', { group: 'Élévateur', options: [['Z', 'En Z (sortie opposée)'], ['C', 'En C (sortie du même côté)']] });
  fld('liftSpeed', 'Vitesse de levage', 'number', { group: 'Élévateur', unit: 'm/s', min: 0.05, max: 5, step: 0.05, live: true });
  fld('stopMode', 'Fonctionnement de la butée', 'select', {
    group: 'Butée', live: true,
    options: [['closed', 'Fermée (bloque)'], ['open', 'Ouverte'], ['timed', 'Temporisée (libère après attente)'], ['cycle', 'Cyclique (ouverture/fermeture)']]
  });
  fld('holdTime', 'Temps d\'arrêt', 'number', { group: 'Butée', unit: 's', min: 0, step: 0.5, live: true });
  fld('openTime', 'Durée ouverte (cyclique)', 'number', { group: 'Butée', unit: 's', min: 0.1, step: 0.5, live: true });
  fld('closedTime', 'Durée fermée (cyclique)', 'number', { group: 'Butée', unit: 's', min: 0.1, step: 0.5, live: true });
  fld('interval', 'Intervalle de libération', 'number', { group: 'Séparateur', unit: 's', min: 0, step: 0.1, live: true });
  fld('zoneLength', 'Longueur de zone', 'number', { group: 'Accumulation', unit: 'mm', min: 100, step: 10 });
  fld('processTime', 'Temps de préparation', 'number', { group: 'Poste', unit: 's', min: 0, step: 0.5, live: true });
  fld('stopPos', 'Position d\'arrêt (0–1)', 'number', { group: 'Poste', min: 0.05, max: 0.95, step: 0.05 });
  fld('opSide', 'Côté opérateur', 'select', { group: 'Poste', options: [['left', 'Gauche'], ['right', 'Droite']] });
  fld('rate', 'Cadence d\'injection', 'number', { group: 'Générateur', unit: 'cartons/h', min: 1, step: 10, live: true });
  fld('jitter', 'Irrégularité de cadence', 'number', { group: 'Générateur', unit: '%', min: 0, max: 100, step: 5, live: true });
  fld('formats', 'Formats injectés', 'formats', { group: 'Générateur', live: true });
  fld('maxCount', 'Nombre maxi (0 = illimité)', 'number', { group: 'Générateur', min: 0, step: 1, live: true });
  fld('startDelay', 'Délai de démarrage', 'number', { group: 'Générateur', unit: 's', min: 0, step: 1 });
  fld('orientation', 'Orientation des cartons', 'select', { group: 'Générateur', live: true, options: [[0, 'Longueur dans le sens de marche (0°)'], [90, 'Largeur dans le sens de marche (90°)']] });
  fld('deckH', 'Hauteur du plancher (dessus)', 'number', { group: 'Mezzanine', unit: 'mm', min: 300, step: 10 });
  fld('columnSpacing', 'Entraxe des poteaux', 'number', { group: 'Mezzanine', unit: 'mm', min: 1000, step: 100 });
  fld('railH', 'Hauteur du garde-corps', 'number', { group: 'Mezzanine', unit: 'mm', min: 0, max: 2000, step: 10 });
  fld('stairs', 'Escalier', 'select', { group: 'Mezzanine', options: [['none', 'Aucun'], ['front', 'Côté avant (−Y)'], ['back', 'Côté arrière (+Y)'], ['left', 'Côté gauche (−X)'], ['right', 'Côté droit (+X)']] });
  fld('stairsWidth', 'Largeur de l\'escalier', 'number', { group: 'Mezzanine', unit: 'mm', min: 600, max: 3000, step: 50 });
  fld('load', 'Charge admissible', 'number', { group: 'Mezzanine', unit: 'kg/m²', min: 0, step: 50 });
  // --- Racks
  fld('levels', 'Nombre de niveaux', 'number', { group: 'Stockage', min: 1, max: 60, step: 1 });
  fld('bays', 'Nombre de travées', 'number', { group: 'Stockage', min: 1, max: 60, step: 1 });
  fld('bayLength', 'Longueur de travée', 'number', { group: 'Stockage', unit: 'mm', min: 800, step: 50 });
  fld('depth', 'Profondeur', 'number', { group: 'Stockage', unit: 'mm', min: 300, step: 50 });
  fld('rows', 'Implantation', 'select', { group: 'Stockage', options: [[1, 'Simple'], [2, 'Double (dos à dos)']] });
  fld('levelH', 'Hauteur entre niveaux', 'number', { group: 'Stockage', unit: 'mm', min: 150, step: 10 });
  fld('firstOnFloor', '1er niveau au sol', 'bool', { group: 'Stockage' });
  fld('loadType', 'Charges stockées', 'select', { group: 'Stockage', options: [['palette', 'Palettes filmées'], ['carton', 'Cartons sur palette'], ['vide', 'Aucune (vide)']] });
  fld('loadH', 'Hauteur de charge', 'number', { group: 'Stockage', unit: 'mm', min: 100, step: 50 });
  fld('fill', 'Taux de remplissage', 'number', { group: 'Stockage', unit: '%', min: 0, max: 100, step: 5 });
  fld('beamColor', 'Couleur des lisses', 'color', { group: 'Apparence' });
  fld('showNumbers', 'Afficher la numérotation', 'bool', { group: 'Numérotation' });
  fld('aisleName', 'Allée', 'text', { group: 'Numérotation', help: 'Lettre ou code de l\'allée (ex. A).' });
  fld('rackNumber', 'Numéro du rack', 'text', { group: 'Numérotation' });
  fld('firstBay', 'Numéro de la 1re travée', 'number', { group: 'Numérotation', min: 0, step: 1 });
  fld('bayStep', 'Pas de numérotation des travées', 'select', { group: 'Numérotation', options: [[1, '1, 2, 3…'], [2, '1, 3, 5… (impairs / pairs)']] });
  fld('levelStyle', 'Repérage des niveaux', 'select', { group: 'Numérotation', options: [['letters', 'Lettres (A, B, C…)'], ['num0', 'Chiffres (0, 1, 2…)'], ['num1', 'Chiffres (1, 2, 3…)']] });
  // --- Stockage à navettes (type OSR)
  fld('towers', 'Nombre de tours (allées)', 'number', { group: 'Stockage à navettes', min: 1, max: 30, step: 1 });
  fld('rackLength', 'Longueur des tours', 'number', { group: 'Stockage à navettes', unit: 'mm', min: 2000, step: 100 });
  fld('towerWidth', 'Largeur d\'une tour', 'number', { group: 'Stockage à navettes', unit: 'mm', min: 1400, step: 50 });
  fld('frontZone', 'Profondeur de la pré-zone (élévateurs)', 'number', { group: 'Stockage à navettes', unit: 'mm', min: 600, step: 50 });
  fld('towerRate', 'Débit de sortie par tour', 'number', { group: 'Stockage à navettes', unit: 'caisses/h', min: 1, step: 10, live: true });
  fld('returnLane', 'Ligne de retour en stock (convoyeur avant)', 'bool', { group: 'Stockage à navettes' });
  FL.convH = Object.assign({}, FL.z, { id: 'convH', label: 'Hauteur du convoyeur de sortie', group: 'Stockage à navettes', help: 'Hauteur (Z) du dessus des rouleaux du collecteur, mesurée depuis le sol. Les tours restent posées au sol.' });
  fld('returnOffset', 'Écart de la ligne de retour', 'number', { group: 'Stockage à navettes', unit: 'mm', min: 700, step: 50 });
  fld('endLength', 'Longueur du convoyeur de sortie', 'number', { group: 'Stockage à navettes', unit: 'mm', min: 300, step: 50 });
  // --- Murs
  fld('baseH', 'Hauteur du soubassement béton', 'number', { group: 'Mur', unit: 'mm', min: 0, step: 50 });
  fld('autoOpenings', 'Ouvertures automatiques (convoyeurs, objets)', 'bool', { group: 'Mur' });
  fld('clearance', 'Jeu autour des passages', 'number', { group: 'Mur', unit: 'mm', min: 0, max: 2000, step: 10 });
  fld('passH', 'Hauteur libre au-dessus des convoyeurs', 'number', { group: 'Mur', unit: 'mm', min: 200, step: 50 });
  fld('doors', 'Portes / ouvertures manuelles', 'textarea', { group: 'Mur', help: 'Une ligne par ouverture : centre ; largeur ; hauteur [; hauteur du bas] en mm, mesurés depuis le début du mur.\nExemple : 5000;4000;4500 (porte sectionnelle) ou 12000;1000;2100 (porte piétonne).' });
  // --- Palettes
  fld('palletType', 'Type de palette', 'select', { group: 'Palette', options: [['euro', 'Palette Europe (EPAL 1200 × 800)'], ['perdue', 'Palette perdue (légère)']] });
  fld('palletSize', 'Dimensions (palette perdue)', 'select', { group: 'Palette', options: [['1200x800', '1200 × 800'], ['1200x1000', '1200 × 1000']] });
  fld('loaded', 'Chargée de cartons', 'bool', { group: 'Palette' });
  fld('loadColor', 'Couleur des cartons', 'color', { group: 'Palette' });
  fld('stack', 'Palettes vides empilées', 'number', { group: 'Palette', min: 1, max: 30, step: 1 });
  // --- Étiqueteuse
  fld('labelMode', 'Mode d\'étiquetage', 'select', { group: 'Étiqueteuse', live: true, options: [['stop', 'Arrêt du colis pendant la pose'], ['fly', 'À la volée (sans arrêt)']] });
  FL.labelTime = Object.assign({}, FL.processTime, { id: 'labelTime', label: 'Temps d\'étiquetage (impression + pose)', group: 'Étiqueteuse' });
  FL.labelPos = Object.assign({}, FL.stopPos, { id: 'labelPos', label: 'Position de l\'applicateur (0–1)', group: 'Étiqueteuse' });
  fld('labelSide', 'Face étiquetée', 'select', { group: 'Étiqueteuse', options: [['top', 'Dessus'], ['left', 'Côté gauche'], ['right', 'Côté droit'], ['front', 'Face avant']] });
  fld('labelPrefix', 'Préfixe des numéros d\'étiquette', 'text', { group: 'Étiqueteuse', live: true });
  fld('color', 'Couleur', 'color', { group: 'Apparence', live: true });
  fld('note', 'Commentaire', 'textarea', { group: 'Apparence' });

  C.FIELDS = FL;

  /* ------------------------------------------------------------------
   * Valeurs par défaut communes aux convoyeurs
   * ------------------------------------------------------------------ */
  const CONV_DEF = {
    width: 640, usefulWidth: 560, frameH: 160, speed: 0.5, running: true, reverse: false,
    gap: 50, surface: 'rollers', rollerDiam: 50, rollerPitch: 100, guideH: 60, color: '#2f6fd0', vmin: 0.1, note: ''
  };
  const CONV_FIELDS_HEAD = ['name', 'x', 'y', 'z', 'rot'];
  const CONV_FIELDS_TAIL = ['width', 'usefulWidth', 'frameH', 'surface', 'rollerDiam', 'rollerPitch', 'rollerCount', 'guideH', 'speed', 'running', 'gap', 'vmin', 'color', 'note'];
  const stdPorts = () => [
    { id: 'in', role: 'in', track: 'main', at: 'start' },
    { id: 'out', role: 'out', track: 'main', at: 'end', out: 0 }
  ];
  const straightModel = (p, slope) => {
    const t = new C.Turtle(); t.line(p.length, (slope || 0) * D);
    return { tracks: { main: { segs: t.segs, reversed: !!p.reverse } }, ports: stdPorts(), diverts: [] };
  };

  const T = {};

  /* ---------------- Convoyeur droit (rouleaux, bande, chaîne…) ------- */
  T.straight = {
    label: 'Convoyeur droit', cat: 'Convoyeurs droits', conveyor: true,
    defaults: Object.assign({}, CONV_DEF, { length: 2000, slope: 0 }),
    fields: [...CONV_FIELDS_HEAD, 'length', 'slope', 'slopePct', 'zEnd', 'reverse', ...CONV_FIELDS_TAIL],
    build: p => straightModel(p, p.slope)
  };

  /* ---------------- Virage (rouleaux coniques ou bande) ---------------- */
  T.curve = {
    label: 'Virage', cat: 'Convoyeurs courbes', conveyor: true,
    defaults: Object.assign({}, CONV_DEF, { angle: 90, radius: 900, side: 'left', rise: 0 }),
    fields: [...CONV_FIELDS_HEAD, 'angle', 'radius', 'side', 'rise', 'zEnd', 'reverse', ...CONV_FIELDS_TAIL],
    build: p => {
      const t = new C.Turtle();
      t.arc(Math.max(50, p.radius), (p.side === 'right' ? -1 : 1) * C.clamp(p.angle, 0.5, 359.5) * D, p.rise || 0);
      return { tracks: { main: { segs: t.segs, reversed: !!p.reverse } }, ports: stdPorts(), diverts: [] };
    }
  };

  /* ---------------- Changement de hauteur (palier / pente / palier) ---- */
  T.heightchange = {
    label: 'Convoyeur à changement de hauteur', cat: 'Convoyeurs inclinés', conveyor: true,
    defaults: Object.assign({}, CONV_DEF, { surface: 'belt', length1: 600, slopeLen: 2000, length2: 600, dH: 400, guideH: 80 }),
    fields: [...CONV_FIELDS_HEAD, 'length1', 'slopeLen', 'length2', 'dH', 'zEnd', 'reverse', ...CONV_FIELDS_TAIL],
    build: p => {
      const sl = Math.asin(C.clamp(p.dH / Math.max(1, p.slopeLen), -0.95, 0.95));
      const t = new C.Turtle(); t.line(p.length1); t.line(p.slopeLen, sl); t.line(p.length2);
      return { tracks: { main: { segs: t.segs, reversed: !!p.reverse } }, ports: stdPorts(), diverts: [] };
    }
  };

  /* ---------------- Spirale (hélicoïdale) ------------------------------ */
  T.spiral = {
    label: 'Convoyeur spirale', cat: 'Convoyeurs inclinés', conveyor: true,
    defaults: Object.assign({}, CONV_DEF, { surface: 'mat', radius: 1000, turns: 1.5, rise: 2400, side: 'left', lengthIn: 600, lengthOut: 600, guideH: 100, color: '#7a4fd0' }),
    fields: [...CONV_FIELDS_HEAD, 'radius', 'turns', 'rise', 'side', 'lengthIn', 'lengthOut', 'zEnd', 'reverse', ...CONV_FIELDS_TAIL],
    build: p => {
      const t = new C.Turtle();
      t.line(p.lengthIn); t.arc(Math.max(300, p.radius), (p.side === 'right' ? -1 : 1) * p.turns * 2 * Math.PI, p.rise); t.line(p.lengthOut);
      return { tracks: { main: { segs: t.segs, reversed: !!p.reverse } }, ports: stdPorts(), diverts: [] };
    }
  };

  /* ---------------- Transfert à 90° ------------------------------------ */
  T.transfer = {
    label: 'Transfert à 90°', cat: 'Équipements', conveyor: true, routing: true,
    defaults: Object.assign({}, CONV_DEF, { length: 800, sides: 'both', mode: 'cyclic', rules: '', guideH: 0, color: '#d08a2f' }),
    fields: [...CONV_FIELDS_HEAD, 'length', 'sides', 'mode', 'rules', ...CONV_FIELDS_TAIL.filter(k => k !== 'guideH')],
    outLabels: ['Tout droit', 'Gauche', 'Droite'],
    build: p => {
      const m = straightModel(Object.assign({}, p, { reverse: false }), 0);
      m.tracks.main.bridgeYaw = 'keep';
      const half = p.width / 2;
      if (p.sides !== 'right') {
        const t = new C.Turtle(p.length / 2, 0, 0, Math.PI / 2); t.line(half);
        m.tracks.bL = { segs: t.segs, yawMode: 'keep' };
        m.ports.push({ id: 'oL', role: 'out', track: 'bL', at: 'end', optional: true, out: 1 });
        m.diverts.push({ track: 'main', s: p.length / 2, to: 'bL', out: 1 });
      }
      if (p.sides !== 'left') {
        const t = new C.Turtle(p.length / 2, 0, 0, -Math.PI / 2); t.line(half);
        m.tracks.bR = { segs: t.segs, yawMode: 'keep' };
        m.ports.push({ id: 'oR', role: 'out', track: 'bR', at: 'end', optional: true, out: 2 });
        m.diverts.push({ track: 'main', s: p.length / 2, to: 'bR', out: 2 });
      }
      return m;
    }
  };

  /* ---------------- Trieur (sorties latérales multiples) --------------- */
  T.sorter = {
    label: 'Trieur', cat: 'Équipements', conveyor: true, routing: true,
    defaults: Object.assign({}, CONV_DEF, { length: 3600, outputs: 3, sortSide: 'right', divertAngle: 90, mode: 'cyclic', rules: '', speed: 0.8, guideH: 0, color: '#c0392b' }),
    fields: [...CONV_FIELDS_HEAD, 'length', 'outputs', 'sortSide', 'divertAngle', 'mode', 'rules', ...CONV_FIELDS_TAIL.filter(k => k !== 'guideH')],
    build: p => {
      const m = straightModel(Object.assign({}, p, { reverse: false }), 0);
      const n = C.clamp(Math.round(p.outputs), 1, 12);
      const ang = C.clamp(+p.divertAngle || 90, 15, 90) * D;
      const half = p.width / 2;
      for (let k = 1; k <= n; k++) {
        const sk = p.length * (k - 0.5) / n;
        let side = p.sortSide === 'left' ? 1 : p.sortSide === 'right' ? -1 : (k % 2 ? -1 : 1);
        const d = half / Math.tan(ang);
        const t = new C.Turtle(sk - d, 0, 0, side * ang); t.line(half / Math.sin(ang));
        const id = 'b' + k;
        m.tracks[id] = { segs: t.segs, yawMode: 'blend' };
        m.ports.push({ id: 'o' + k, role: 'out', track: id, at: 'end', optional: true, out: k });
        m.diverts.push({ track: 'main', s: Math.max(1, sk - d), to: id, out: k });
      }
      return m;
    }
  };

  /* ---------------- Table tournante ------------------------------------ */
  T.turntable = {
    label: 'Table tournante', cat: 'Équipements', conveyor: true, routing: true, capacity: 1,
    defaults: Object.assign({}, CONV_DEF, { diameter: 1000, outAngles: '0,90,-90', rotSpeed: 90, speed: 0.4, mode: 'cyclic', rules: '', guideH: 0, color: '#16a085' }),
    fields: ['name', 'x', 'y', 'z', 'rot', 'diameter', 'width', 'usefulWidth', 'outAngles', 'rotSpeed', 'mode', 'rules', 'speed', 'running', 'rollerDiam', 'rollerPitch', 'color', 'note'],
    angles: p => String(p.outAngles || '0').split(/[;,\s]+/).map(Number).filter(v => isFinite(v)).slice(0, 8),
    build: p => {
      const R = p.diameter / 2;
      const t = new C.Turtle(); t.line(R);
      const m = { tracks: { in: { segs: t.segs, endMode: 'center' } }, ports: [{ id: 'in', role: 'in', track: 'in', at: 'start' }], diverts: [] };
      const angs = T.turntable.angles(p);
      angs.forEach((a, i) => {
        const k = i + 1, tt = new C.Turtle(R, 0, 0, a * D); tt.line(R);
        m.tracks['o' + k] = { segs: tt.segs, yawMode: 'keep' };
        m.ports.push({ id: 'o' + k, role: 'out', track: 'o' + k, at: 'end', optional: angs.length > 1, out: k });
        m.diverts.push({ track: 'in', s: R, to: 'o' + k, out: k, turn: a * D });
      });
      return m;
    }
  };

  /* ---------------- Élévateur ------------------------------------------ */
  T.elevator = {
    label: 'Élévateur', cat: 'Équipements', conveyor: true, capacity: 1,
    defaults: Object.assign({}, CONV_DEF, { elevH: 1500, bedLength: 800, config: 'Z', liftSpeed: 0.6, guideH: 0, color: '#8e44ad' }),
    fields: ['name', 'x', 'y', 'z', 'rot', 'elevH', 'bedLength', 'config', 'liftSpeed', 'zEnd', 'width', 'usefulWidth', 'speed', 'running', 'rollerDiam', 'rollerPitch', 'color', 'note'],
    build: p => {
      const t = new C.Turtle(); t.line(p.bedLength); t.rise(p.elevH);
      if (p.config === 'C') t.turn(Math.PI);
      t.line(p.bedLength);
      return { tracks: { main: { segs: t.segs, yawMode: 'keep', liftSeg: 1 } }, ports: stdPorts(), diverts: [] };
    }
  };

  /* ---------------- Modules droits spécialisés ------------------------- */
  const special = (label, defaults, fields, extra) => Object.assign({
    label, cat: 'Équipements', conveyor: true,
    defaults: Object.assign({}, CONV_DEF, defaults),
    fields: [...CONV_FIELDS_HEAD, 'length', ...fields, ...CONV_FIELDS_TAIL],
    build: p => straightModel(Object.assign({}, p, { reverse: false }), 0)
  }, extra || {});

  T.stop = special('Butée', { length: 600, stopMode: 'timed', holdTime: 3, openTime: 2, closedTime: 4, color: '#e67e22' }, ['stopMode', 'holdTime', 'openTime', 'closedTime']);
  T.separator = special('Séparateur de cartons', { length: 1000, interval: 2, surface: 'belt', speed: 0.8, color: '#27ae60' }, ['interval']);
  T.accumulation = special('Zone d\'accumulation', { length: 4000, zoneLength: 600, gap: 20, color: '#2980b9' }, ['zoneLength']);
  T.labeler = special('Étiqueteuse de colis', { length: 1500, processTime: 1.5, stopPos: 0.5, labelMode: 'stop', labelSide: 'top', labelPrefix: 'COLIS-', speed: 0.4, color: '#16a085' },
    ['labelMode', 'labelTime', 'labelPos', 'labelSide', 'labelPrefix']);
  T.workstation = special('Poste de préparation', { length: 2400, processTime: 8, stopPos: 0.5, opSide: 'left', color: '#f1c40f' }, ['processTime', 'stopPos', 'opSide']);
  T.source = special('Entrée (générateur de cartons)', { length: 1000, rate: 600, jitter: 0, formats: ['moyen'], maxCount: 0, startDelay: 0, orientation: 0, color: '#2ecc71' },
    ['rate', 'jitter', 'formats', 'maxCount', 'startDelay', 'orientation'], { cat: 'Entrées / sorties' });
  T.sink = special('Sortie (évacuation)', { length: 800, color: '#e74c3c' }, [], { cat: 'Entrées / sorties' });

  /* ---------------- Éléments statiques --------------------------------- */
  T.obstacle = {
    label: 'Obstacle', cat: 'Divers', conveyor: false, centered: true,
    defaults: { length: 400, width: 400, height: 1200, color: '#f39c12', note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'length', 'width', 'height', 'color', 'note'],
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };
  T.table = {
    label: 'Table de travail', cat: 'Équipements', conveyor: false, centered: true,
    defaults: { length: 1600, width: 800, height: 900, color: '#95a5a6', note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'length', 'width', 'height', 'color', 'note'],
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };
  T.mezzanine = {
    label: 'Mezzanine', cat: 'Structures', conveyor: false, centered: true,
    defaults: { length: 8000, width: 5000, deckH: 3000, thickness: 120, columnSpacing: 4000, railH: 1100, stairs: 'front', stairsWidth: 1000, load: 500, color: '#3d6fa8', note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'length', 'width', 'deckH', 'thickness', 'columnSpacing', 'railH', 'stairs', 'stairsWidth', 'load', 'color', 'note'],
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };
  /* ---------------- Rack à palettes ------------------------------------ */
  T.rack = {
    label: 'Rack à palettes', cat: 'Stockage', conveyor: false, centered: true,
    defaults: { levels: 4, bays: 3, bayLength: 2700, depth: 1100, rows: 1, levelH: 1500, firstOnFloor: true, loadType: 'palette', loadH: 1200, fill: 75, color: '#1f5fa8', beamColor: '#e67e22',
      showNumbers: true, aisleName: 'A', rackNumber: '01', firstBay: 1, bayStep: 1, levelStyle: 'letters', note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'levels', 'bays', 'bayLength', 'depth', 'rows', 'levelH', 'firstOnFloor', 'loadType', 'loadH', 'fill',
      'showNumbers', 'aisleName', 'rackNumber', 'firstBay', 'bayStep', 'levelStyle', 'color', 'beamColor', 'note'],
    /** Géométrie d'un rack (mm, repère local du rack). */
    geom(p) {
      const rows = +p.rows === 2 ? 2 : 1, nb = Math.max(1, Math.round(p.bays)), bl = p.bayLength, d = p.depth, flue = 200;
      const nl = Math.max(1, Math.round(p.levels));
      return {
        rows, nb, bl, d, flue, nl, L: nb * bl, Wt: rows * d + (rows - 1) * flue,
        perBay: Math.max(1, Math.floor((bl - 80) / 900)),
        levelZ: k => (p.firstOnFloor ? k : k + 1) * p.levelH
      };
    },
    slotKey: (r, j, k, q) => `${r}-${j}-${k}-${q}`,
    /** Valeur pseudo-aléatoire stable par emplacement (remplissage initial, aspect). */
    slotRand(el, key, salt) {
      let h = 2166136261;
      const str = el.id + '|' + key + '|' + (salt || '');
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    },
    /** Emplacement occupé ? (état saisi par le cariste, sinon taux de remplissage) */
    slotOccupied(el, key) {
      const s = el.params.slots;
      if (s && s[key] !== undefined) return !!s[key];
      if (el.params.loadType === 'vide') return false;
      return T.rack.slotRand(el, key, 'occ') * 100 < el.params.fill;
    },
    /** Centre local d'un emplacement : dessus de lisse (z), face d'accès (−1 avant / +1 arrière). */
    slotLocal(p, r, j, k, q) {
      const G = T.rack.geom(p);
      const y0 = -G.Wt / 2 + r * (G.d + G.flue);
      return { x: -G.L / 2 + j * G.bl + 40 + (q + 0.5) * (G.bl - 80) / G.perBay, y: y0 + G.d / 2, z: G.levelZ(k), face: G.rows === 2 && r === 1 ? 1 : -1, y0 };
    },
    /** Emplacement le plus proche d'un point local du rack. */
    slotAt(p, lx, ly, lz) {
      const G = T.rack.geom(p);
      const r = G.rows === 2 && ly > -G.Wt / 2 + G.d + G.flue / 2 ? 1 : 0;
      const j = C.clamp(Math.floor((lx + G.L / 2) / G.bl), 0, G.nb - 1);
      const q = C.clamp(Math.floor((lx - (-G.L / 2 + j * G.bl + 40)) / ((G.bl - 80) / G.perBay)), 0, G.perBay - 1);
      let k = 0;
      for (let i = 0; i < G.nl; i++) if (G.levelZ(i) <= lz + 50) k = i;
      return { r, j, k, q, key: T.rack.slotKey(r, j, k, q) };
    },
    /** Adresse d'un emplacement : allée+rack - travée - niveau (ex. A01-03-B). */
    address(p, row, bay, level) {
      const b = (+p.firstBay || 0) + bay * (+p.bayStep || 1);
      const lv = p.levelStyle === 'num0' ? String(level) : p.levelStyle === 'num1' ? String(level + 1) : String.fromCharCode(65 + level % 26);
      return `${p.aisleName || ''}${p.rackNumber || ''}${+p.rows === 2 ? (row ? 'P' : 'I') : ''}-${String(b).padStart(2, '0')}-${lv}`;
    },
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };

  /* ---------------- Stockage à navettes type OSR -------------------------
   * Tours de stockage (allée + navettes par niveau + élévateur) alignées
   * derrière un convoyeur collecteur qui évacue les caisses vers la sortie.
   * Ligne de retour optionnelle : les caisses qui y arrivent sont remises en stock.
   */
  T.osr = {
    label: 'Stockage à navettes (type OSR)', cat: 'Stockage', conveyor: true, osr: true,
    defaults: Object.assign({}, CONV_DEF, {
      towers: 1, levels: 16, levelH: 380, rackLength: 8000, towerWidth: 2200, frontZone: 1500, fill: 75,
      towerRate: 400, formats: ['bac'], orientation: 0, maxCount: 0, startDelay: 0, jitter: 20,
      returnLane: false, returnOffset: 1800, endLength: 1000, speed: 0.6, guideH: 60, color: '#5b6d82'
    }),
    fields: ['name', 'x', 'y', 'rot', 'towers', 'convH', 'levels', 'levelH', 'rackLength', 'towerWidth', 'frontZone', 'fill', 'towerRate', 'formats', 'orientation', 'maxCount', 'startDelay', 'jitter',
      'returnLane', 'returnOffset', 'endLength', 'width', 'usefulWidth', 'speed', 'running', 'gap', 'rollerDiam', 'rollerPitch', 'guideH', 'color', 'note'],
    collectorLength: p => C.clamp(Math.round(p.towers), 1, 30) * p.towerWidth + p.endLength,
    build: p => {
      const L = T.osr.collectorLength(p);
      const t = new C.Turtle(); t.line(L);
      const m = { tracks: { main: { segs: t.segs } }, ports: [{ id: 'out', role: 'out', track: 'main', at: 'end', out: 0 }], diverts: [] };
      if (p.returnLane) {
        const r = new C.Turtle(L, -p.returnOffset, 0, Math.PI); r.line(L);
        m.tracks.ret = { segs: r.segs, absorb: true };
        m.ports.push({ id: 'in', role: 'in', track: 'ret', at: 'start', optional: true });
      }
      return m;
    }
  };

  /* ---------------- Cariste CACES 5 : chariot à mât rétractable ---------------- */
  fld('maxLift', 'Hauteur de levée maxi', 'number', { group: 'Chariot', unit: 'mm', min: 1000, max: 14000, step: 100 });
  fld('travelSpeed', 'Vitesse de déplacement', 'number', { group: 'Chariot', unit: 'm/s', min: 0.2, max: 4, step: 0.1, live: true });
  fld('liftSpeed2', 'Vitesse de levée', 'number', { group: 'Chariot', unit: 'm/s', min: 0.05, max: 1, step: 0.05, live: true });
  FL.liftSpeed2.k = 'forkSpeed';
  fld('driverName', 'Nom du cariste', 'text', { group: 'Chariot' });
  T.reachtruck = {
    label: 'Cariste CACES 5 (chariot à mât rétractable)', cat: 'Stockage', conveyor: false, centered: true, floor: true,
    defaults: { maxLift: 10500, travelSpeed: 1.8, forkSpeed: 0.35, driverName: 'Cariste', color: '#f39c12', note: '' },
    fields: ['name', 'x', 'y', 'rot', 'driverName', 'maxLift', 'travelSpeed', 'liftSpeed2', 'color', 'note'],
    // cinématique : centre des fourches = mât (150 → 900 mm) + 600 mm
    reachIn: 750, reachOut: 1500,
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };

  /* ---------------- Palette (objet posé) ---------------- */
  T.pallet = {
    label: 'Palette', cat: 'Stockage', conveyor: false, centered: true,
    defaults: { palletType: 'euro', palletSize: '1200x800', loaded: false, loadH: 1000, loadColor: '#b98b52', stack: 1, note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'palletType', 'palletSize', 'loaded', 'loadH', 'loadColor', 'stack', 'note'],
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };

  /* ---------------- Mur d'entrepôt ---------------- */
  T.wall = {
    label: 'Mur d\'entrepôt', cat: 'Bâtiment', conveyor: false, floor: true,
    defaults: { length: 10000, height: 8000, thickness: 200, baseH: 1200, autoOpenings: true, clearance: 150, passH: 900, doors: '', color: '#c9ced6', note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'length', 'height', 'thickness', 'baseH', 'autoOpenings', 'clearance', 'passH', 'doors', 'color', 'note'],
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };

  T.guide = {
    label: 'Guide latéral', cat: 'Équipements', conveyor: false,
    defaults: { length: 2000, height: 100, thickness: 20, color: '#bdc3c7', note: '' },
    fields: ['name', 'x', 'y', 'zBase', 'rot', 'length', 'height', 'thickness', 'color', 'note'],
    build: () => ({ tracks: {}, ports: [], diverts: [] })
  };

  /* ------------------------------------------------------------------
   * Fonctions d'aide sur les types
   * ------------------------------------------------------------------ */
  const Types = {
    defs: T,
    get: type => T[type],
    /** Modèle local mis en cache par signature de paramètres. */
    model(el) {
      const def = T[el.type];
      const key = JSON.stringify(el.params);
      if (el._mkey !== key || !el._model) {
        Object.defineProperty(el, '_model', { value: def.build(el.params), writable: true, configurable: true, enumerable: false });
        Object.defineProperty(el, '_mkey', { value: key, writable: true, configurable: true, enumerable: false });
      }
      return el._model;
    },
    /** Longueur développée de la trajectoire principale. */
    devLength(el) {
      const m = Types.model(el);
      let L = 0;
      for (const id in m.tracks) {
        if (id === 'main' || id === 'in') L += m.tracks[id].segs.reduce((a, s) => a + C.segLength(s), 0);
      }
      if (el.type === 'turntable') L = el.params.diameter;
      return L;
    },
    /** Dénivelé géométrique (fin - origine) de la trajectoire principale. */
    geomRise(el) {
      const m = Types.model(el), tr = m.tracks.main || m.tracks.in;
      if (!tr || !tr.segs.length) return 0;
      const last = tr.segs[tr.segs.length - 1];
      return last.type === 'line' ? last.b[2] : last.z1;
    },
    /** Impose le dénivelé géométrique en adaptant le paramètre pertinent. */
    setRise(el, dz) {
      const p = el.params;
      switch (el.type) {
        case 'straight': p.slope = C.clamp(Math.asin(C.clamp(dz / Math.max(1, p.length), -0.866, 0.866)) / D, -60, 60); break;
        case 'curve': case 'spiral': p.rise = dz; break;
        case 'heightchange': p.dH = C.clamp(dz, -0.95 * p.slopeLen, 0.95 * p.slopeLen); break;
        case 'elevator': p.elevH = dz; break;
      }
    },
    /** Encombrement (mm) d'un élément statique : L (X local), W (Y local), H. */
    staticSize(el) {
      const p = el.params;
      if (el.type === 'rack') {
        const rows = +p.rows === 2 ? 2 : 1;
        return { L: p.bays * p.bayLength + 80, W: rows * p.depth + (rows - 1) * 200, H: Types.rackHeight(p) };
      }
      if (el.type === 'mezzanine') return { L: p.length, W: p.width, H: p.deckH + (p.railH || 0) };
      if (el.type === 'wall') return { L: p.length, W: p.thickness, H: p.height };
      if (el.type === 'reachtruck') return { L: 2600, W: 1300, H: 2300 };
      if (el.type === 'pallet') {
        const euro = p.palletType !== 'perdue', ph = euro ? 144 : 120;
        return { L: 1200, W: !euro && p.palletSize === '1200x1000' ? 1000 : 800, H: p.loaded ? ph + Math.max(100, p.loadH) : ph * C.clamp(Math.round(p.stack || 1), 1, 30) };
      }
      return { L: p.length, W: p.width || p.thickness || 0, H: p.height || 0 };
    },
    rackHeight(p) { return (p.firstOnFloor ? p.levels - 1 : p.levels) * p.levelH + p.loadH + 150; },
    /** Hauteur totale des tours d'un stockage à navettes (depuis le sol). */
    osrHeight(p) { return 300 + p.levels * p.levelH + 400; },
    rollerCount(el) {
      return Math.max(1, Math.floor(Types.devLength(el) / Math.max(15, el.params.rollerPitch || 100)));
    },
    /** Pente moyenne (degrés) de la trajectoire principale. */
    meanSlope(el) {
      const L = Types.devLength(el);
      return L > 0 ? Math.asin(C.clamp(Types.geomRise(el) / L, -1, 1)) / D : 0;
    },
    /** Pente maximale d'un segment de la trajectoire. */
    maxSlope(el) {
      const m = Types.model(el);
      let mx = 0;
      for (const id in m.tracks) for (const sg of m.tracks[id].segs) {
        if (sg.vertical) continue;
        const L = C.segLength(sg); if (L < 1) continue;
        const dz = sg.type === 'line' ? sg.b[2] - sg.a[2] : sg.z1 - sg.z0;
        mx = Math.max(mx, Math.abs(Math.asin(C.clamp(dz / L, -1, 1)) / D));
      }
      return mx;
    }
  };
  C.Types = Types;

  /* ------------------------------------------------------------------
   * Bibliothèque (préréglages affichés dans le panneau de gauche)
   * ------------------------------------------------------------------ */
  C.LIBRARY = [
    {
      cat: 'Convoyeurs droits', items: [
        { id: 'str-rollers', label: 'Convoyeur à rouleaux', icon: 'rollers', type: 'straight', params: { surface: 'rollers' } },
        { id: 'str-belt', label: 'Convoyeur à bande', icon: 'belt', type: 'straight', params: { surface: 'belt', color: '#2c3e50', guideH: 80 } },
        { id: 'str-mat', label: 'Tapis modulaire motorisé', icon: 'mat', type: 'straight', params: { surface: 'mat', color: '#34495e', guideH: 80 } },
        { id: 'str-chain', label: 'Convoyeur à chaîne', icon: 'chain', type: 'straight', params: { surface: 'chain', color: '#7f8c8d', guideH: 0, speed: 0.25, width: 1000, usefulWidth: 900 } },
        { id: 'str-free', label: 'Rouleaux libres', icon: 'free', type: 'straight', params: { surface: 'freerollers', color: '#95a5a6', speed: 0.6, slope: -2 } }
      ]
    },
    {
      cat: 'Convoyeurs courbes', items: [
        { id: 'cur-45', label: 'Virage 45°', icon: 'curve45', type: 'curve', params: { angle: 45 } },
        { id: 'cur-90', label: 'Virage 90°', icon: 'curve90', type: 'curve', params: { angle: 90 } },
        { id: 'cur-180', label: 'Virage 180°', icon: 'curve180', type: 'curve', params: { angle: 180, surface: 'belt', color: '#2c3e50', guideH: 80 } },
        { id: 'cur-custom', label: 'Virage personnalisable', icon: 'curvec', type: 'curve', params: { angle: 60, radius: 1200 } },
        { id: 'cur-rollers', label: 'Courbe à rouleaux', icon: 'curve90', type: 'curve', params: { angle: 90, surface: 'rollers' } },
        { id: 'cur-belt', label: 'Courbe à bande', icon: 'curveb', type: 'curve', params: { angle: 90, surface: 'belt', color: '#2c3e50', guideH: 80 } },
        { id: 'cur-right', label: 'Virage 90° à droite', icon: 'curver', type: 'curve', params: { angle: 90, side: 'right' } }
      ]
    },
    {
      cat: 'Convoyeurs inclinés', items: [
        { id: 'inc-up', label: 'Convoyeur montant', icon: 'up', type: 'straight', params: { surface: 'belt', slope: 12, length: 3000, color: '#2c3e50', guideH: 80 } },
        { id: 'inc-down', label: 'Convoyeur descendant', icon: 'down', type: 'straight', params: { surface: 'belt', slope: -12, length: 3000, color: '#2c3e50', guideH: 80 } },
        { id: 'inc-adj', label: 'Pente réglable', icon: 'slope', type: 'straight', params: { surface: 'belt', slope: 5, length: 2500, color: '#2c3e50', guideH: 80 } },
        { id: 'inc-dh', label: 'Changement de hauteur', icon: 'dh', type: 'heightchange', params: {} },
        { id: 'inc-spiral', label: 'Spirale', icon: 'spiral', type: 'spiral', params: {} }
      ]
    },
    {
      cat: 'Équipements', items: [
        { id: 'eq-transfer', label: 'Transfert à 90°', icon: 'transfer', type: 'transfer', params: {} },
        { id: 'eq-turntable', label: 'Table tournante', icon: 'turntable', type: 'turntable', params: {} },
        { id: 'eq-elevator', label: 'Élévateur', icon: 'elevator', type: 'elevator', params: {} },
        { id: 'eq-gravity', label: 'Descente gravitaire', icon: 'gravity', type: 'straight', params: { surface: 'freerollers', slope: -5, length: 3000, speed: 0.9, color: '#95a5a6', name: 'Descente gravitaire' } },
        { id: 'eq-stop', label: 'Butée', icon: 'stop', type: 'stop', params: {} },
        { id: 'eq-guide', label: 'Guide latéral', icon: 'guide', type: 'guide', params: {} },
        { id: 'eq-separator', label: 'Séparateur de cartons', icon: 'separator', type: 'separator', params: {} },
        { id: 'eq-accu', label: 'Zone d\'accumulation', icon: 'accu', type: 'accumulation', params: {} },
        { id: 'eq-station', label: 'Poste de préparation', icon: 'station', type: 'workstation', params: {} },
        { id: 'eq-labeler', label: 'Étiqueteuse de colis', icon: 'labeler', type: 'labeler', params: {} },
        { id: 'eq-table', label: 'Table de travail', icon: 'table', type: 'table', params: {} },
        { id: 'eq-sorter', label: 'Trieur', icon: 'sorter', type: 'sorter', params: {} }
      ]
    },
    {
      cat: 'Stockage', items: [
        { id: 'st-rack', label: 'Rack à palettes 4 niveaux', icon: 'rack', type: 'rack', params: {} },
        { id: 'st-rack2', label: 'Rack double 4 niveaux', icon: 'rack', type: 'rack', params: { rows: 2 } },
        { id: 'st-rack-ctn', label: 'Rack à cartons 4 niveaux', icon: 'rack', type: 'rack', params: { loadType: 'carton', depth: 800, bayLength: 1800, levelH: 1200, loadH: 800 } },
        { id: 'st-pal-eu', label: 'Palette Europe', icon: 'pallet', type: 'pallet', params: { palletType: 'euro' } },
        { id: 'st-pal-pp', label: 'Palette perdue', icon: 'pallet', type: 'pallet', params: { palletType: 'perdue' } },
        { id: 'st-pal-eu-c', label: 'Palette Europe avec cartons', icon: 'palletload', type: 'pallet', params: { palletType: 'euro', loaded: true } },
        { id: 'st-pal-pp-c', label: 'Palette perdue avec cartons', icon: 'palletload', type: 'pallet', params: { palletType: 'perdue', loaded: true, loadColor: '#c49a62' } },
        { id: 'st-reach', label: 'Cariste CACES 5 (mât rétractable)', icon: 'forklift', type: 'reachtruck', params: {} },
        { id: 'st-osr', label: 'Stockage à navettes OSR (1 tour)', icon: 'osr', type: 'osr', params: {} },
        { id: 'st-osr3', label: 'Stockage à navettes OSR (3 tours)', icon: 'osr', type: 'osr', params: { towers: 3 } }
      ]
    },
    {
      cat: 'Bâtiment', items: [
        { id: 'bd-wall', label: 'Mur d\'entrepôt', icon: 'wall', type: 'wall', params: {} },
        { id: 'bd-wall-door', label: 'Mur avec porte sectionnelle', icon: 'walldoor', type: 'wall', params: { doors: '5000;4000;4500' } },
        { id: 'bd-wall-low', label: 'Cloison basse (3 m)', icon: 'wall', type: 'wall', params: { height: 3000, thickness: 100, baseH: 0, color: '#dfe3e8' } },
        { id: 'bd-building', label: 'Entrepôt complet (4 murs)', icon: 'building', type: 'wall', params: {}, action: 'building' }
      ]
    },
    {
      cat: 'Entrées / sorties', items: [
        { id: 'io-source', label: 'Entrée (générateur)', icon: 'source', type: 'source', params: {} },
        { id: 'io-sink', label: 'Sortie (évacuation)', icon: 'sink', type: 'sink', params: {} }
      ]
    },
    {
      cat: 'Structures et divers', items: [
        { id: 'misc-mezz', label: 'Mezzanine', icon: 'mezz', type: 'mezzanine', params: {} },
        { id: 'misc-mezz-big', label: 'Mezzanine sans escalier', icon: 'mezz', type: 'mezzanine', params: { stairs: 'none', length: 12000, width: 6000 } },
        { id: 'misc-obstacle', label: 'Obstacle', icon: 'obstacle', type: 'obstacle', params: {} }
      ]
    }
  ];
  C.libraryItem = id => { for (const c of C.LIBRARY) for (const it of c.items) if (it.id === id) return it; return null; };
})(window.C3D);
