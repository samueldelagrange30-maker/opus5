/* =====================================================================
 * Convoy3D — Analyse de l'installation
 *  - continuité des lignes, ports libres, hauteurs de raccordement
 *  - incompatibilités (pentes / technologie, largeurs, virages, spirales)
 *  - interférences entre convoyeurs non raccordés au même niveau
 *  - longueurs totales, hauteurs, pentes, capacités et débits théoriques
 * ===================================================================== */
(function (C) {
  'use strict';

  /** Carton de référence : moyenne des formats injectés (ou format « Moyen »). */
  function refCarton(project) {
    const ids = new Set();
    for (const e of project.elements) if (e.type === 'source') (e.params.formats || []).forEach(f => ids.add(f));
    for (const c of project.cartons) ids.add(c.formatId);
    const list = Array.from(ids).map(id => project.format(id)).filter(Boolean);
    if (!list.length) list.push(project.format('moyen') || C.DEFAULT_FORMATS[1]);
    const avg = k => list.reduce((a, f) => a + f[k], 0) / list.length;
    return { L: avg('L'), W: avg('W'), H: avg('H'), list, maxH: Math.max(...list.map(f => f.H)), maxW: Math.max(...list.map(f => f.W)), maxL: Math.max(...list.map(f => f.L)) };
  }

  /** Capacité théorique d'un élément (cartons/heure) pour un carton de référence. */
  function capacity(el, ref) {
    const p = el.params;
    const v = Math.max(0, +p.speed || 0) * 1000; // mm/s
    const pitch = ref.L + Math.max(0, +p.gap || 0);
    let cap = v > 0 ? v / pitch * 3600 : 0;
    switch (el.type) {
      case 'separator': cap = Math.min(cap, p.interval > 0 ? 3600 / p.interval : cap); break;
      case 'stop':
        if (p.stopMode === 'closed') cap = 0;
        else if (p.stopMode === 'timed') cap = Math.min(cap, 3600 / ((+p.holdTime || 0) + pitch / Math.max(1, v)));
        else if (p.stopMode === 'cycle') cap = cap * (+p.openTime || 1) / ((+p.openTime || 1) + (+p.closedTime || 1));
        break;
      case 'workstation': cap = Math.min(cap, 3600 / ((+p.processTime || 0) + pitch / Math.max(1, v))); break;
      case 'elevator': {
        const cycle = 2 * p.bedLength / Math.max(1, v) + 2 * Math.abs(p.elevH) / Math.max(1, p.liftSpeed * 1000);
        cap = 3600 / cycle; break;
      }
      case 'turntable': {
        const angs = C.Types.defs.turntable.angles(p).map(Math.abs);
        const a = angs.length ? Math.max(...angs) : 90;
        const cycle = p.diameter / Math.max(1, v) + 2 * a / Math.max(5, p.rotSpeed);
        cap = 3600 / cycle; break;
      }
      case 'source': cap = Math.min(cap, +p.rate || 0); break;
    }
    if (p.running === false) cap = 0;
    return cap;
  }

  function run(app) {
    const project = app.project, net = app.network;
    const issues = net.buildIssues.slice();
    const ref = refCarton(project);
    const add = (level, el, msg) => issues.push({ level, el, msg });

    // --- ports libres / continuité
    for (const node of net.nodes.values()) {
      const el = node.el;
      for (const p of node.ports) {
        if (p.role === 'in' && !p.linkedFrom.length && el.type !== 'source' && p.status !== 'error') {
          add('warn', el, `${el.name} : entrée non alimentée (aucun convoyeur raccordé en amont).`);
        }
        if (p.role === 'out' && !p.link && !p.optional && el.type !== 'sink' && p.status !== 'error') {
          add('warn', el, `${el.name} : sortie non raccordée — les cartons s'arrêteront en bout de ligne.`);
        }
      }
      // aiguillages sans sortie raccordée
      if (node.def.routing) {
        const connected = node.diverts.filter(d => d.to.endLink).length;
        if (!connected && el.type !== 'turntable') add('info', el, `${el.name} : aucune sortie latérale raccordée (fonctionne en tout droit).`);
        if (el.params.mode === 'rules') {
          const rules = C.parseRules(el.params.rules);
          if (!rules.length) add('warn', el, `${el.name} : mode « Règles » sans règle valide.`);
          for (const r of rules) {
            if (r.out === 0) continue;
            const dv = node.diverts.find(d => d.out === r.out);
            if (!dv) add('error', el, `${el.name} : la règle vise la sortie ${r.out} qui n'existe pas.`);
            else if (!dv.to.endLink) add('warn', el, `${el.name} : la sortie ${r.out} visée par une règle n'est pas raccordée.`);
          }
        }
      }
    }
    // --- liaisons : largeurs
    for (const l of net.links) {
      if (l.kind !== 'direct') continue;
      const a = l.from.el, b = l.to.el;
      const wa = a.params.usefulWidth, wb = b.params.usefulWidth;
      if (Math.abs(wa - wb) > 100) add('warn', a, `Largeurs utiles différentes entre ${a.name} (${C.fmt(wa)} mm) et ${b.name} (${C.fmt(wb)} mm).`);
    }
    // --- éléments
    for (const el of project.elements) {
      const def = C.Types.get(el.type);
      const p = el.params;
      if (!def.conveyor) continue;
      const maxS = C.Types.maxSlope(el);
      const lim = C.SURFACE_MAX_SLOPE[p.surface] || 25;
      if (el.type !== 'elevator' && maxS > lim + 0.01) add(maxS > lim * 1.5 ? 'error' : 'warn', el, `${el.name} : pente de ${C.fmt(maxS, 1)}° trop forte pour « ${C.SURFACE_LABEL[p.surface]} » (maxi conseillé ${lim}°).`);
      const flowRise = C.Types.geomRise(el) * (p.reverse ? -1 : 1);
      if (p.surface === 'freerollers' && flowRise > 1 && el.type !== 'elevator') add('error', el, `${el.name} : des rouleaux libres ne peuvent pas faire monter les cartons.`);
      if (p.surface === 'freerollers' && Math.abs(flowRise) < 1 && el.type === 'straight') add('info', el, `${el.name} : rouleaux libres à plat — avance par poussée uniquement (vitesse mini ${C.fmt(p.vmin, 2)} m/s).`);
      if (!(+p.speed > 0) && el.type !== 'source') add('warn', el, `${el.name} : vitesse nulle.`);
      if (p.running === false) add('info', el, `${el.name} : convoyeur à l'arrêt.`);
      if (p.usefulWidth > p.width - 10) add('error', el, `${el.name} : largeur utile (${C.fmt(p.usefulWidth)}) supérieure à la largeur hors-tout (${C.fmt(p.width)}).`);
      // cartons trop larges
      if (el.type !== 'turntable' && ref.maxW > p.usefulWidth) add('warn', el, `${el.name} : largeur utile ${C.fmt(p.usefulWidth)} mm inférieure à la largeur de carton maxi (${C.fmt(ref.maxW)} mm).`);
      // virages
      if (el.type === 'curve' || el.type === 'spiral') {
        const R = p.radius, rin = R - p.usefulWidth / 2, rout = R + p.usefulWidth / 2;
        if (R - p.width / 2 <= 0) add('error', el, `${el.name} : rayon (${C.fmt(R)} mm) trop petit pour la largeur — rayon intérieur négatif.`);
        else {
          for (const f of ref.list) {
            const need = Math.hypot(rin + f.W, f.L / 2);
            if (need > rout + 1) { add('warn', el, `${el.name} : le format « ${f.name} » (${f.L}×${f.W}) frotte dans le virage (rayon extérieur nécessaire ${C.fmt(need)} mm > ${C.fmt(rout)} mm).`); break; }
          }
        }
      }
      if (el.type === 'spiral') {
        const pitch = Math.abs(p.rise) / Math.max(0.01, p.turns);
        const need = ref.maxH + (p.frameH || 160) + 100;
        if (p.turns > 1 && pitch < need) add('error', el, `${el.name} : pas de spirale ${C.fmt(pitch)} mm insuffisant (mini ${C.fmt(need)} mm pour des cartons de ${C.fmt(ref.maxH)} mm).`);
      }
      // hauteur
      const node = net.node(el.id);
      if (node) {
        let zmin = Infinity, clear = Infinity;
        for (const k in node.tracks) for (const sm of node.tracks[k].path.sample(10, 300)) {
          zmin = Math.min(zmin, sm.p[2]);
          clear = Math.min(clear, sm.p[2] - (C.supportAt ? C.supportAt(sm.p[0], sm.p[1], sm.p[2], el.id) : 0));
        }
        if (zmin < 0) add('error', el, `${el.name} : passe sous le niveau du sol (Z mini ${C.fmt(zmin)} mm).`);
        else if (clear < (p.frameH || 160) + 20 && el.type !== 'elevator') add('warn', el, `${el.name} : hauteur insuffisante pour la structure au-dessus du support (${C.fmt(clear)} mm).`);
      }
    }
    // --- trajets obstrués (obstacles, poteaux et planchers de mezzanine)
    net.computeBlocks(ref.maxH);
    for (const tr of net.tracks) {
      if (tr.isBridge || !tr.blocks.length) continue;
      add('error', tr.el, `${tr.el.name} : trajet des cartons obstrué par ${tr.blockBy[0]} à ${C.fmt(tr.blocks[0])} mm du début (hauteur de carton ${C.fmt(ref.maxH)} mm).`);
    }
    // --- mezzanines
    for (const m of project.elements.filter(e => e.type === 'mezzanine')) {
      const area = m.params.length * m.params.width / 1e6;
      const riders = app.ridersOf ? app.ridersOf(m).size : 0;
      add('info', m, `${m.name} : plancher à ${C.fmt(m.z + m.params.deckH)} mm, ${C.fmt(area, 1)} m², charge admissible ${C.fmt(area * (m.params.load || 0))} kg, ${riders} objet(s) posé(s).`);
    }
    // --- interférences entre convoyeurs non raccordés (même niveau)
    const items = [];
    for (const node of net.nodes.values()) {
      const tr = node.tracks.main || node.tracks.in;
      if (!tr) continue;
      const pts = tr.path.sample(6, 200).map(o => o.p);
      const bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const q of pts) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.min(bb[1], q[1]); bb[2] = Math.max(bb[2], q[0]); bb[3] = Math.max(bb[3], q[1]); }
      items.push({ node, pts, bb, w: node.el.params.width || 600 });
    }
    const linked = (a, b) => net.links.some(l => (l.from.el === a && ((l.to && l.to.el === b) || (l.toTrack && l.toTrack.el === b))) || (l.from.el === b && ((l.to && l.to.el === a) || (l.toTrack && l.toTrack.el === a))));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      const m = (A.w + B.w) / 2;
      if (A.bb[0] > B.bb[2] + m || B.bb[0] > A.bb[2] + m || A.bb[1] > B.bb[3] + m || B.bb[1] > A.bb[3] + m) continue;
      if (linked(A.node.el, B.node.el)) continue;
      let hit = null;
      outer: for (const pa of A.pts) for (const pb of B.pts) {
        if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < m * 0.8 && Math.abs(pa[2] - pb[2]) < 450) { hit = pa; break outer; }
      }
      if (hit) add('warn', A.node.el, `Interférence : ${A.node.el.name} et ${B.node.el.name} se croisent au même niveau sans être raccordés (près de X ${C.fmt(hit[0])}, Y ${C.fmt(hit[1])}).`);
    }

    // --- synthèse
    const byType = new Map();
    let totalLen = 0, zMin = Infinity, zMax = -Infinity;
    const slopes = [], caps = [];
    for (const el of project.elements) {
      const def = C.Types.get(el.type);
      const key = def.conveyor && el.params.surface ? `${def.label} — ${C.SURFACE_LABEL[el.params.surface]}` : def.label;
      const o = byType.get(key) || { n: 0, len: 0 };
      o.n++;
      if (def.conveyor) {
        const L = C.Types.devLength(el); o.len += L; totalLen += L;
        const node = net.node(el.id);
        if (node) for (const p of node.ports) { zMin = Math.min(zMin, p.pos[2]); zMax = Math.max(zMax, p.pos[2]); }
        const ms = C.Types.meanSlope(el);
        if (Math.abs(ms) > 0.05 || el.type === 'elevator') slopes.push({ el, slope: ms, max: C.Types.maxSlope(el), rise: C.Types.geomRise(el) });
        caps.push({ el, cap: capacity(el, ref) });
      }
      byType.set(key, o);
    }
    // --- lignes : de chaque entrée vers les sorties (goulot d'étranglement)
    const lines = [];
    const nextNodes = node => {
      const res = new Set();
      for (const p of node.ports) if (p.role === 'out' && p.link) res.add(p.link.track.node);
      return Array.from(res);
    };
    for (const node of net.nodes.values()) {
      if (node.el.type !== 'source') continue;
      const sinks = new Set();
      let bottleneck = null;
      const seen = new Set();
      const stack = [node];
      let reach = 0;
      while (stack.length && reach < 2000) {
        const n = stack.pop(); reach++;
        if (seen.has(n)) continue;
        seen.add(n);
        const cap = capacity(n.el, ref);
        if (n !== node && (!bottleneck || cap < bottleneck.cap)) bottleneck = { el: n.el, cap };
        if (n.el.type === 'sink') sinks.add(n.el.name);
        for (const m of nextNodes(n)) stack.push(m);
      }
      const rate = +node.el.params.rate || 0;
      lines.push({ source: node.el, rate, sinks: Array.from(sinks), bottleneck, modules: seen.size });
      if (!sinks.size) add('warn', node.el, `Les cartons de ${node.el.name} n'atteignent aucune sortie (évacuation).`);
      if (bottleneck && bottleneck.cap < rate * 0.98) add('warn', bottleneck.el, `Goulot : ${bottleneck.el.name} (capacité ≈ ${C.fmt(bottleneck.cap)} c/h) < cadence de ${node.el.name} (${C.fmt(rate)} c/h).`);
    }
    const order = { error: 0, warn: 1, info: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    // dédoublonnage
    const seenMsg = new Set();
    const uniq = issues.filter(i => !seenMsg.has(i.msg) && seenMsg.add(i.msg));
    return {
      issues: uniq, ref,
      summary: { count: project.elements.length, conveyors: net.nodes.size, totalLen, zMin, zMax, byType: Array.from(byType.entries()), slopes, links: net.links.length, caps },
      lines
    };
  }

  C.Analysis = { run, capacity, refCarton };
})(window.C3D);
