/* =====================================================================
 * Convoy3D — Réseau de convoyage
 *
 * Convertit les éléments du projet en trajectoires MONDE (Track), détecte
 * automatiquement les connexions entre ports (sortie → entrée), les
 * jonctions latérales (une sortie qui débouche sur le côté d'un autre
 * convoyeur → "pont" de fusion), et produit le diagnostic de l'installation.
 *
 * Track : {
 *   key, id, el, node, path (C.Path), length, width,
 *   yawMode ('tangent'|'keep'|'blend'), endMode ('flush'|'center'),
 *   endLink : {track, s0} | null,    diverts : [{s, to, out, turn}],
 *   lift : [s0, s1] | null (zone de levage),  bridges : [pont entrant]
 * }
 * ===================================================================== */
(function (C) {
  'use strict';

  const TOL_XY = 25;      // mm : tolérance de coïncidence de ports
  const TOL_ANG = 12;     // degrés : tolérance d'alignement
  const TOL_Z_LINK = 40;  // mm : écart de hauteur maxi pour raccorder
  const TOL_Z_OK = 5;     // mm : écart de hauteur toléré sans avertissement

  class Network {
    constructor(project) {
      this.project = project;
      this.build();
    }

    build() {
      const els = this.project.elements;
      this.nodes = new Map();
      this.tracks = [];
      this.ports = [];
      this.links = [];
      this.buildIssues = [];

      // --- 1. trajectoires et ports de chaque élément
      for (const el of els) {
        const def = C.Types.get(el.type);
        if (!def || !def.conveyor) continue;
        const model = C.Types.model(el);
        const tf = { x: el.x, y: el.y, z: el.z, rot: el.rot };
        const node = { el, def, model, tracks: {}, ports: [], diverts: [] };
        for (const id in model.tracks) {
          const mt = model.tracks[id];
          const path = new C.Path(mt.segs, tf, mt.reversed);
          const tr = {
            key: el.id + ':' + id, id, el, node, path, length: path.length,
            width: el.params.usefulWidth || el.params.width || 500,
            outerWidth: el.params.width || 600,
            yawMode: mt.yawMode || 'tangent', endMode: mt.endMode || 'flush', absorb: !!mt.absorb,
            bridgeYaw: mt.bridgeYaw || 'blend',
            endLink: null, diverts: [], lift: null, bridges: [], blocks: [], cartons: []
          };
          if (mt.liftSeg !== undefined) {
            const b = path.breaks();
            tr.lift = [b[mt.liftSeg], b[mt.liftSeg + 1]];
          }
          node.tracks[id] = tr;
          this.tracks.push(tr);
        }
        for (const mp of model.ports) {
          const tr = node.tracks[mp.track];
          if (!tr) continue;
          const s = mp.at === 'start' ? 0 : tr.length;
          const r = tr.path.at(s);
          const port = {
            key: el.id + ':' + mp.id, id: mp.id, node, el, role: mp.role, track: tr, s,
            pos: r.p.slice(), dir: r.t.slice(), h: Math.atan2(r.t[1], r.t[0]),
            optional: !!mp.optional, out: mp.out || 0, link: null, linkedFrom: [], status: 'free'
          };
          node.ports.push(port);
          this.ports.push(port);
        }
        for (const d of model.diverts) {
          const dv = { track: node.tracks[d.track], s: d.s, to: node.tracks[d.to], out: d.out, turn: d.turn || 0 };
          if (!dv.track || !dv.to) continue;
          node.diverts.push(dv);
          dv.track.diverts.push(dv);
        }
        this.nodes.set(el.id, node);
      }

      // --- 2. connexions directes sortie → entrée
      const outs = this.ports.filter(p => p.role === 'out');
      const ins = this.ports.filter(p => p.role === 'in');
      for (const A of outs) {
        let best = null, bestD = Infinity;
        for (const B of ins) {
          if (B.el === A.el) continue;
          const d = Math.hypot(B.pos[0] - A.pos[0], B.pos[1] - A.pos[1]);
          if (d > 160) continue;
          const da = Math.abs(C.normAngle(B.h - A.h)) * C.RAD;
          if (da > TOL_ANG) continue;
          if (d < bestD) { bestD = d; best = B; }
        }
        if (!best) continue;
        const dz = best.pos[2] - A.pos[2];
        if (bestD <= TOL_XY) {
          if (Math.abs(dz) <= TOL_Z_LINK) {
            A.link = { track: best.track, s0: best.s, port: best, dz };
            best.linkedFrom.push(A);
            A.status = best.status = Math.abs(dz) > TOL_Z_OK ? 'warn' : 'ok';
            this.links.push({ from: A, to: best, dz, kind: 'direct' });
            if (Math.abs(dz) > TOL_Z_OK) this.buildIssues.push({ level: 'warn', el: A.el, el2: best.el, msg: `Écart de hauteur de ${C.fmt(dz)} mm entre ${A.el.name} et ${best.el.name} (raccordé, à corriger).` });
          } else {
            A.status = best.status = 'error';
            A.nearMiss = best;
            this.buildIssues.push({ level: 'error', el: A.el, el2: best.el, msg: `Raccordement impossible entre ${A.el.name} et ${best.el.name} : écart de hauteur de ${C.fmt(dz)} mm.` });
          }
        } else {
          A.nearMiss = best;
          this.buildIssues.push({ level: 'warn', el: A.el, el2: best.el, msg: `${A.el.name} → ${best.el.name} : ports proches mais non raccordés (écart ${C.fmt(bestD)} mm en plan). Utilisez l'accrochage.` });
        }
      }

      // --- 3. jonctions latérales (fusion de flux sur un convoyeur)
      for (const A of outs) {
        if (A.link || A.status === 'error') continue;
        let best = null;
        for (const tr of this.tracks) {
          if (tr.el === A.el || (tr.id !== 'main' && tr.id !== 'in')) continue;
          const half = tr.outerWidth / 2 + 60;
          // filtre grossier par boîte englobante
          const n = tr.path.nearest(A.pos[0], A.pos[1], A.pos[2]);
          if (n.d > half) continue;
          if (Math.abs(n.p[2] - A.pos[2]) > TOL_Z_LINK) continue;
          if (n.s < 5 || n.s > tr.length - 5) continue;
          const dot = A.dir[0] * n.t[0] + A.dir[1] * n.t[1];
          if (dot < -0.5) continue;
          // la sortie doit pointer vers l'axe du convoyeur cible (ou être déjà dessus)
          const toAxis = [n.p[0] - A.pos[0], n.p[1] - A.pos[1]];
          const la = Math.hypot(toAxis[0], toAxis[1]);
          if (la > 30 && (toAxis[0] * A.dir[0] + toAxis[1] * A.dir[1]) / la < 0.2) continue;
          if (!best || n.d < best.n.d) best = { tr, n, dot };
        }
        if (!best) continue;
        const { tr, n, dot } = best;
        const sinA = Math.sqrt(Math.max(0.04, 1 - dot * dot));
        const sJoin = C.clamp(n.s + n.d * Math.max(0, dot) / sinA, 1, tr.length - 1);
        const target = tr.path.at(sJoin);
        const bpath = new C.Path([{ type: 'line', a: A.pos.slice(), b: target.p.slice() }], { x: 0, y: 0, z: 0, rot: 0 }, false);
        const bridge = {
          key: 'bridge:' + A.key, id: 'bridge', el: tr.el, node: tr.node, path: bpath, length: bpath.length,
          width: tr.width, outerWidth: tr.outerWidth, yawMode: tr.bridgeYaw, endMode: 'flush',
          endLink: { track: tr, s0: sJoin }, diverts: [], lift: null, bridges: [], blocks: [], cartons: [],
          isBridge: true, target: tr, sJoin, fromPort: A
        };
        tr.bridges.push(bridge);
        this.tracks.push(bridge);
        A.link = { track: bridge, s0: 0, merge: true, target: tr, sJoin };
        A.status = 'ok';
        this.links.push({ from: A, toTrack: tr, s: sJoin, kind: 'merge' });
      }

      // --- 4. liens de fin de trajectoire
      for (const p of this.ports) {
        if (p.role === 'out' && p.s > 0) p.track.endLink = p.link;
      }
      // ports d'entrée alimentés par une jonction ? (statut)
      for (const p of ins) if (p.linkedFrom.length && p.status === 'free') p.status = 'ok';
    }

    node(id) { return this.nodes.get(id); }
    track(key) { return this.tracks.find(t => t.key === key); }

    /** Liste sérialisable des connexions (pour l'export JSON). */
    connectionList() {
      return this.links.map(l => l.kind === 'direct'
        ? { type: 'direct', from: l.from.el.id, fromPort: l.from.id, to: l.to.el.id, toPort: l.to.id, dz: C.round(l.dz, 1) }
        : { type: 'jonction', from: l.from.el.id, fromPort: l.from.id, to: l.toTrack.el.id, atDistance: C.round(l.s, 1) });
    }

    /** Trajectoire principale d'un élément. */
    mainTrack(elId) {
      const n = this.nodes.get(elId);
      return n ? (n.tracks.main || n.tracks.in || Object.values(n.tracks)[0]) : null;
    }

    /** Entrée / sortie principale (hauteurs) */
    inOut(elId) {
      const n = this.nodes.get(elId);
      if (!n) return null;
      const pin = n.ports.find(p => p.role === 'in');
      const pout = n.ports.filter(p => p.role === 'out');
      return { in: pin, outs: pout };
    }

    /**
     * Zones bloquées par des obstacles sur chaque trajectoire.
     * maxH : hauteur maxi des cartons (mm).
     */
    computeBlocks(maxH) {
      const boxes = C.blockingBoxes(this.project);
      for (const tr of this.tracks) {
        tr.blocks = [];
        tr.blockBy = [];
        if (!boxes.length || tr.length <= 0) continue;
        let inside = false;
        const step = 20;
        const r = { p: [0, 0, 0], t: [0, 0, 0] };
        const rad = tr.width / 2;
        for (let s = 0; s <= tr.length; s += step) {
          tr.path.at(s, r);
          let hit = null;
          for (const b of boxes) {
            const L = C.worldToLocal(b.tf, r.p[0], r.p[1], r.p[2]);
            const lx = L[0] - b.cx, ly = L[1] - b.cy;
            if (Math.abs(lx) <= b.L / 2 + rad * 0.6 && Math.abs(ly) <= b.W / 2 + rad &&
              L[2] + maxH >= b.z0 && L[2] <= b.z1) { hit = b; break; }
          }
          if (hit && !inside) { tr.blocks.push(s); tr.blockBy.push(hit.label); }
          inside = !!hit;
        }
      }
    }
  }

  /**
   * Volumes qui arrêtent les cartons : obstacles, plancher et poteaux de mezzanine.
   * Boîte : { tf, cx, cy (centre local), L, W, z0, z1 (altitudes locales), label }
   */
  C.blockingBoxes = function (project) {
    const res = [];
    for (const e of project.elements) {
      const tf = { x: e.x, y: e.y, z: e.z, rot: e.rot }, p = e.params;
      if (e.type === 'obstacle') res.push({ tf, cx: 0, cy: 0, L: p.length, W: p.width, z0: 0, z1: p.height, label: e.name });
      if (e.type === 'rack') {
        const sz = C.Types.staticSize(e);
        res.push({ tf, cx: 0, cy: 0, L: sz.L, W: sz.W, z0: 0, z1: sz.H, label: e.name });
      }
      if (e.type === 'osr') {
        const n = C.clamp(Math.round(p.towers), 1, 30), y0 = p.width / 2 + p.frontZone;
        res.push({ tf, cx: n * p.towerWidth / 2, cy: y0 + p.rackLength / 2, L: n * p.towerWidth, W: p.rackLength, z0: -1e5, z1: 1e5, label: e.name + ' (tours)' });
      }
      if (e.type === 'mezzanine') {
        const t = Math.max(20, p.thickness || 120);
        res.push({ tf, cx: 0, cy: 0, L: p.length, W: p.width, z0: p.deckH - t - 220, z1: p.deckH, label: e.name + ' (plancher)' });
        const sp = Math.max(1000, p.columnSpacing || 4000);
        const nx = Math.max(2, Math.ceil(p.length / sp) + 1), ny = Math.max(2, Math.ceil(p.width / sp) + 1);
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          res.push({ tf, cx: -p.length / 2 + 75 + (p.length - 150) * i / (nx - 1), cy: -p.width / 2 + 75 + (p.width - 150) * j / (ny - 1), L: 120, W: 120, z0: -1e5, z1: p.deckH, label: e.name + ' (poteau)' });
        }
      }
    }
    return res;
  };

  C.Network = Network;
})(window.C3D);
