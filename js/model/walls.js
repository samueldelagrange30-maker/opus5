/* =====================================================================
 * Convoy3D — Murs d'entrepôt : calcul des ouvertures
 *
 * Repère local d'un mur : origine au début du mur, +X le long du mur
 * (longueur L), épaisseur centrée sur l'axe, Z depuis la base du mur.
 * Ouvertures :
 *   - automatiques autour de chaque convoyeur (ou objet) qui traverse le mur,
 *     avec un jeu latéral et une hauteur libre réglables ;
 *   - manuelles (portes) : une ligne « centre ; largeur ; hauteur [; bas] » (mm).
 * Le mur plein est ensuite découpé en panneaux autour des ouvertures.
 * ===================================================================== */
(function (C) {
  'use strict';

  const wallTf = w => ({ x: w.x, y: w.y, z: w.z, rot: w.rot });

  /** Portes saisies à la main. */
  function parseDoors(text) {
    const res = [];
    String(text || '').split(/\n/).forEach(line => {
      const v = line.split(/[;,\s]+/).map(Number).filter(n => isFinite(n));
      if (v.length >= 3 && v[1] > 0 && v[2] > 0) res.push({ c: v[0], w: v[1], h: v[2], b: v[3] || 0 });
    });
    return res;
  }

  /** Ouvertures d'un mur (coordonnées locales du mur, mm). */
  function wallOpenings(w, elements) {
    const p = w.params, L = p.length, H = p.height, t = p.thickness || 200;
    const clr = Math.max(0, +p.clearance || 0);
    const tf = wallTf(w);
    const list = [];
    for (const d of parseDoors(p.doors)) list.push({ x0: d.c - d.w / 2, x1: d.c + d.w / 2, z0: d.b, z1: d.b + d.h, kind: 'door', label: 'Porte' });
    if (p.autoOpenings !== false) {
      for (const e of elements) {
        if (e === w || e.type === 'wall') continue;
        const def = C.Types.get(e.type);
        if (!def) continue;
        if (def.conveyor) {
          const m = C.Types.model(e);
          const etf = { x: e.x, y: e.y, z: e.z, rot: e.rot };
          for (const id in m.tracks) {
            const path = new C.Path(m.tracks[id].segs, etf, false);
            const pts = path.sample(5, 100).map(o => C.worldToLocal(tf, o.p[0], o.p[1], o.p[2]));
            for (let i = 0; i < pts.length - 1; i++) {
              const a = pts[i], b = pts[i + 1];
              if ((a[1] > 0) === (b[1] > 0) || a[1] === b[1]) continue;
              const u = a[1] / (a[1] - b[1]);
              const xc = a[0] + (b[0] - a[0]) * u, zc = a[2] + (b[2] - a[2]) * u;
              if (xc < -500 || xc > L + 500) continue;
              const dx = b[0] - a[0], dy = b[1] - a[1], ln = Math.hypot(dx, dy) || 1;
              const sin = Math.max(0.3, Math.abs(dy) / ln), cos = Math.abs(dx) / ln;
              const half = ((e.params.width || 600) / 2 + clr) / sin + t / 2 * cos / sin;
              list.push({
                x0: xc - half, x1: xc + half, z0: Math.max(0, zc - (e.params.frameH || 160) - clr),
                z1: zc + Math.max(200, +p.passH || 900), kind: 'conv', label: e.name
              });
            }
          }
        } else {
          // objet statique qui traverse le mur (rack, table, mezzanine…)
          const sz = C.Types.staticSize(e);
          const cx = def.centered ? 0 : sz.L / 2;
          const corners = [[cx - sz.L / 2, -sz.W / 2], [cx + sz.L / 2, -sz.W / 2], [cx + sz.L / 2, sz.W / 2], [cx - sz.L / 2, sz.W / 2]]
            .map(q => C.localToWorld({ x: e.x, y: e.y, z: 0, rot: e.rot }, q[0], q[1], 0)).map(q => C.worldToLocal(tf, q[0], q[1], 0));
          const ys = corners.map(q => q[1]);
          if (Math.min(...ys) > -t / 2 || Math.max(...ys) < t / 2) continue; // ne traverse pas
          const xs = [];
          for (let i = 0; i < 4; i++) {
            const a = corners[i], b = corners[(i + 1) % 4];
            if ((a[1] > 0) !== (b[1] > 0)) xs.push(a[0] + (b[0] - a[0]) * a[1] / (a[1] - b[1]));
          }
          if (xs.length < 2) continue;
          list.push({ x0: Math.min(...xs) - clr, x1: Math.max(...xs) + clr, z0: Math.max(0, e.z - w.z), z1: e.z - w.z + sz.H + clr, kind: 'object', label: e.name });
        }
      }
    }
    return list
      .map(o => Object.assign(o, { x0: Math.max(0, o.x0), x1: Math.min(L, o.x1), z0: Math.max(0, o.z0), z1: Math.min(H, o.z1) }))
      .filter(o => o.x1 - o.x0 > 1 && o.z1 - o.z0 > 1);
  }

  /** Panneaux pleins du mur après découpe des ouvertures : [{x0,x1,z0,z1}] */
  function wallPieces(w, openings) {
    const L = w.params.length, H = w.params.height;
    const br = new Set([0, L]);
    for (const o of openings) { br.add(o.x0); br.add(o.x1); }
    const xs = Array.from(br).sort((a, b) => a - b);
    const pieces = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      if (b - a < 1) continue;
      const mid = (a + b) / 2;
      const zs = openings.filter(o => o.x0 < mid && o.x1 > mid).map(o => [o.z0, o.z1]).sort((u, v) => u[0] - v[0]);
      let z = 0;
      for (const [z0, z1] of zs) {
        if (z0 > z + 1) pieces.push({ x0: a, x1: b, z0: z, z1: z0 });
        z = Math.max(z, z1);
      }
      if (H > z + 1) pieces.push({ x0: a, x1: b, z0: z, z1: H });
    }
    return pieces;
  }

  /** Extrémités d'un mur (monde). */
  function wallEnds(w) {
    const c = Math.cos(w.rot * C.DEG), s = Math.sin(w.rot * C.DEG);
    return [[w.x, w.y], [w.x + w.params.length * c, w.y + w.params.length * s]];
  }

  C.Walls = { parseDoors, wallOpenings, wallPieces, wallEnds };
})(window.C3D);
