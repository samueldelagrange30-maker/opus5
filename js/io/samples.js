/* =====================================================================
 * Convoy3D — Projets types
 *
 *  Automatisation « OSR + 5 postes GTP » :
 *   - stockage à navettes (6 tours) ;
 *   - boucle des bacs devant l'OSR (niveau haut, 1 500 mm) : les bacs sortent
 *     des tours, tournent sur la boucle et se répartissent sur 5 postes GTP
 *     (équilibrage) ; une fois servis ils reviennent dans LEUR tour ;
 *   - réapprovisionnement : réception + poste de décartonnage → boucle → tour 1 ;
 *   - cartons (niveau bas, 850 mm) : 2 formeuses → ligne de distribution sous
 *     les postes → remplissage aux postes GTP → collecteur → 2 fermeuses en
 *     parallèle → étiqueteuse → trieur → 3 quais d'expédition.
 * ===================================================================== */
(function (C) {
  'use strict';

  C.Samples = C.Samples || {};

  C.Samples.osrGtp = function (app) {
    const p = app.project;
    p.reset('Automatisation OSR + 5 postes GTP');
    const Z = 1500;            // niveau des bacs
    const ZC = Z - 650;        // niveau des cartons (passage par le bas des postes GTP)
    const add = (type, params, attrs) => { const el = p.createElement(type, params, attrs); p.addElement(el); return el; };
    const port = (el, id) => app.elementPorts(el, el).find(q => q.id === id);
    const after = (prev, portId, type, params) => {
      const el = p.createElement(type, params);
      Object.assign(el, app.poseAtPort(el, port(prev, portId)));
      p.addElement(el);
      return el;
    };
    const R = v => Math.round(v);

    /* ------------------------------ OSR ------------------------------ */
    const osr = add('osr', {
      name: 'OSR-01', towers: 6, towerWidth: 3000, levels: 16, levelH: 380, rackLength: 30000,
      laneLength: 2500, frontZone: 1500, inSide: 'left', towerRate: 300, wipLimit: 90, formats: ['bac'], orientation: 90, fill: 80
    }, { x: 0, y: 0, z: Z, rot: 0 });
    const op = osr.params, TW = op.towerWidth, NT = op.towers;
    const lanes = [];
    for (let i = 0; i < NT; i++) lanes.push(C.Types.defs.osr.lanesX(op, i));

    /* ------------------- boucle des bacs (niveau haut) ------------------- */
    const yU = -3500, RL = 1500, yL = yU - 2 * RL;
    const xA = -6000, xB = NT * TW + 4000;
    const stations = [-500, 4000, 8500, 13000, 17500];         // axe du convoyeur bac de chaque poste
    const towerRule = k => `1 : traite>=1 & source=tour ${k}` + (k === 1 ? '\n1 : source=RÉCEPTION' : '');
    // branche haute (vers +X) : retour des bacs servis dans leur tour, injection des bacs sortis des tours
    let e = add('straight', { length: lanes[0].xin - 400 - xA, name: 'BOUCLE-01' }, { x: xA, y: yU, z: Z, rot: 0 });
    const loopStart = e;
    const towerIn = [];
    for (let i = 0; i < NT; i++) {
      const t = after(e, 'out', 'transfer', { sides: 'left', mode: 'free', rules: towerRule(i + 1), name: `AIG-T${i + 1}` });
      towerIn.push(t);
      const next = i < NT - 1 ? lanes[i + 1].xin - 400 : xB;
      e = after(t, 'out', 'straight', { length: next - (lanes[i].xin + 400) });
    }
    e = after(e, 'out', 'curve', { angle: 180, radius: RL, side: 'right' });
    // branche basse (vers −X) : desserte des postes GTP
    const stDiv = [];
    let xCur = xB;
    for (const xc of stations.slice().sort((a, b) => b - a)) {
      e = after(e, 'out', 'straight', { length: xCur - (xc + 400) });
      const t = after(e, 'out', 'transfer', { sides: 'left', mode: 'free', rules: '1 : traite=0', queueMax: 7 });
      stDiv.push({ xc, t });
      e = t; xCur = xc - 400;
    }
    e = after(e, 'out', 'straight', { length: xCur - xA });
    after(e, 'out', 'curve', { angle: 180, radius: RL, side: 'right' });      // referme la boucle sur BOUCLE-01
    void loopStart;

    // tours : sortie → injection sur la boucle ; entrée ← aiguillage de la branche haute
    for (let i = 0; i < NT; i++) {
      after(osr, 's' + (i + 1), 'straight', { length: -yU - 300 });
      after(towerIn[i], 'oL', 'straight', { length: -yU - 320 });
    }

    /* ----------------------------- postes GTP ----------------------------- */
    const gtps = [];
    stDiv.sort((a, b) => a.xc - b.xc).forEach(({ t }, k) => {
      const feed = after(t, 'oL', 'straight', { length: 2500 });
      const g = after(feed, 'out', 'gtp', { name: `GTP-0${k + 1}`, pickRate: 600, itemsPerTote: 2, itemsPerOrder: 2 });
      // retour du bac servi : demi-tour puis remontée sur la branche basse (jonction)
      const u = after(g, 'to', 'curve', { angle: 180, radius: 700, side: 'left' });
      const pu = port(u, 'out');
      after(u, 'out', 'straight', { length: R((yL - 300) - pu.pos[1]) });
      gtps.push(g);
    });

    /* ------------------- réapprovisionnement (décartonnage) ------------------- */
    {
      const ySp = yU + 1800, xM = xA + 3000;      // spine au-dessus de la branche haute, jonction à xM + 600
      let r = add('source', { name: 'RÉCEPTION', rate: 120, formats: ['bac'], orientation: 90, length: 1500 }, { x: xM - 9000, y: ySp + 13000, z: 900, rot: -90 });
      r = after(r, 'out', 'straight', { length: 2500 });
      r = after(r, 'out', 'workstation', { name: 'DÉCARTONNAGE', processTime: 10, length: 2400, opSide: 'right' });
      r = after(r, 'out', 'straight', { length: 1500 });
      r = after(r, 'out', 'straight', { length: R(600 / Math.sin(10 * Math.PI / 180)), slope: 10, surface: 'belt' });
      // jusqu'à l'altitude de la spine : virage vers +X
      let q = port(r, 'out');
      r = after(r, 'out', 'straight', { length: R(q.pos[1] - (ySp + 900)) });
      r = after(r, 'out', 'curve', { angle: 90, radius: 900, side: 'left' });
      q = port(r, 'out');
      r = after(r, 'out', 'straight', { length: R(xM - q.pos[0]) });
      r = after(r, 'out', 'curve', { angle: 90, radius: 600, side: 'right' });
      q = port(r, 'out');
      after(r, 'out', 'straight', { length: R(q.pos[1] - (yU + 300)) });
    }

    /* ------------------- cartons : formeuses → distribution ------------------- */
    const ci = gtps.map(g => port(g, 'ci')), co = gtps.map(g => port(g, 'co'));
    const yCd = ci[0].pos[1] + 1000;
    const xF = -30000;
    let c = add('source', { name: 'FORMEUSE-1', rate: 900, formats: ['ouvert'], length: 1500 }, { x: xF, y: yCd, z: ZC, rot: 0 });
    const xD0 = -14000;
    const main = after(c, 'out', 'straight', { length: xD0 - (xF + 1500) });
    // 2e formeuse : rejoint la ligne par le côté
    {
      let f = add('source', { name: 'FORMEUSE-2', rate: 900, formats: ['ouvert'], length: 1500 }, { x: xF + 6000, y: yCd - 5000, z: ZC, rot: 90 });
      const q = port(f, 'out');
      after(f, 'out', 'straight', { length: R((yCd - 300) - q.pos[1]) });
    }
    c = main;
    let xc0 = xD0;
    ci.forEach((q, k) => {
      const last = k === ci.length - 1;
      if (!last) {
        c = after(c, 'out', 'straight', { length: R(q.pos[0] - 400 - xc0) });
        c = after(c, 'out', 'transfer', { sides: 'right', mode: 'free', name: `AIG-C${k + 1}` });
        const qq = port(c, 'oR');
        after(c, 'oR', 'straight', { length: R(qq.pos[1] - q.pos[1]) });
        xc0 = q.pos[0] + 400;
      } else {
        c = after(c, 'out', 'straight', { length: R(q.pos[0] - 700 - xc0) });
        c = after(c, 'out', 'curve', { angle: 90, radius: 700, side: 'right' });
        const qq = port(c, 'out');
        after(c, 'out', 'straight', { length: R(qq.pos[1] - q.pos[1]) });
      }
    });

    /* ------------- cartons remplis : collecteur → fermeuses → expédition ------------- */
    const lastG = gtps[gtps.length - 1];
    let k1 = after(lastG, 'co', 'curve', { angle: 90, radius: 650, side: 'right' });
    const yCc = port(k1, 'out').pos[1];
    const xEnd = -8000;
    k1 = after(k1, 'out', 'straight', { length: R(port(k1, 'out').pos[0] - xEnd), name: 'COLLECTEUR' });
    co.slice(0, -1).forEach(q => {
      const s0 = p.createElement('straight', { length: R(q.pos[1] - (yCc + 300)) });
      Object.assign(s0, app.poseAtPort(s0, q)); p.addElement(s0);
    });
    // deux fermeuses en parallèle
    const split = after(k1, 'out', 'transfer', { sides: 'left', mode: 'free', name: 'AIG-FERM' });
    let m = after(split, 'out', 'straight', { length: 800 });
    m = after(m, 'out', 'closer', { name: 'FERMEUSE-B' });
    const mergeZone = after(m, 'out', 'straight', { length: 4000 });
    let b = after(split, 'oL', 'straight', { length: 900 });
    b = after(b, 'out', 'curve', { angle: 90, radius: 600, side: 'right' });
    b = after(b, 'out', 'straight', { length: 200 });
    b = after(b, 'out', 'closer', { name: 'FERMEUSE-A' });
    b = after(b, 'out', 'straight', { length: 1800 });
    b = after(b, 'out', 'curve', { angle: 90, radius: 600, side: 'right' });
    const qb = port(b, 'out');
    after(b, 'out', 'straight', { length: R((yCc - 300) - qb.pos[1]) });
    m = after(mergeZone, 'out', 'labeler', { name: 'ETQ-01', labelSide: 'left', labelPrefix: 'EXP-' });
    m = after(m, 'out', 'straight', { length: 1500 });
    m = after(m, 'out', 'curve', { angle: 90, radius: 900, side: 'left' });
    m = after(m, 'out', 'straight', { length: 3000 });
    const sorter = after(m, 'out', 'sorter', { name: 'TRI-EXP', outputs: 3, sortSide: 'right', mode: 'free', length: 4800 });
    for (let k = 1; k <= 3; k++) {
      let s1 = after(sorter, 'o' + k, 'straight', { length: 7000, surface: 'freerollers', slope: -2, speed: 0.6 });
      after(s1, 'out', 'sink', { name: `QUAI-${k}` });
    }
    m = after(sorter, 'out', 'straight', { length: 1500 });
    after(m, 'out', 'sink', { name: 'REJETS' });

    /* --------------------- recadrage dans la zone de travail --------------------- */
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of p.elements) { x0 = Math.min(x0, el.x); y0 = Math.min(y0, el.y); x1 = Math.max(x1, el.x); y1 = Math.max(y1, el.y); }
    y1 = Math.max(y1, op.laneLength + op.frontZone + op.rackLength);
    const dx = 4000 - x0, dy = 4000 - y0;
    for (const el of p.elements) { el.x = R(el.x + dx); el.y = R(el.y + dy); }
    p.settings.workW = Math.ceil((x1 - x0 + 10000) / 1000) * 1000;
    p.settings.workD = Math.ceil((y1 - y0 + 10000) / 1000) * 1000;
    p.settings.defaultZ = Z;
    p.dirty = false;
    app.afterLoad();
    app.viewport.fit();
    C.toast('Projet « Automatisation OSR + 5 postes GTP » chargé — Espace pour lancer la simulation', 'ok');
  };
})(window.C3D);
