/* =====================================================================
 * Convoy3D — Planification des trajets des chariots
 *
 *  - Grille d'occupation (cases de 200 mm) : obstacles (barrières et poteaux
 *    de protection, obstacles, racks, tables, palettes au sol, convoyeurs,
 *    murs, poteaux de mezzanine, tours de stockage…) élargis de la
 *    demi-largeur du chariot.
 *  - A* 8-connexe pour contourner les obstacles, puis lissage par visibilité.
 *  - Graphe orienté du fléchage au sol : le chariot emprunte les allées dans
 *    le sens des flèches (ou dans les deux sens en double sens), avec des
 *    tronçons libres (A*) pour rejoindre et quitter le réseau d'allées.
 * ===================================================================== */
(function (C) {
  'use strict';
  const CELL = 200;           // taille des cases (mm)
  const INFLATE = 750;        // demi-largeur du chariot + marge (mm)
  const TRUCK_H = 2400;       // hauteur du chariot (mm) : les éléments plus hauts ne gênent pas
  const LANE_STEP = 500;      // pas d'échantillonnage des allées (mm)
  const LANE_LINK = 1000;     // distance de raccordement entre allées (mm)

  /** Grille d'occupation des obstacles au sol. */
  function buildGrid(project, exclude) {
    const ex = exclude || new Set();
    const st = project.settings;
    let x0 = 0, y0 = 0, x1 = st.workW, y1 = st.workD;
    for (const e of project.elements) { x0 = Math.min(x0, e.x - 6000); y0 = Math.min(y0, e.y - 6000); x1 = Math.max(x1, e.x + 6000); y1 = Math.max(y1, e.y + 6000); }
    const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL);
    const blocked = new Uint8Array(nx * ny);
    const G = { x0, y0, nx, ny, cell: CELL, blocked };
    const range = (a, b, o, n) => [C.clamp(Math.floor((a - o) / CELL), 0, n - 1), C.clamp(Math.ceil((b - o) / CELL), 0, n - 1)];
    /** Rectangle orienté (repère tf, centre local cx,cy, dimensions L×W) élargi de r. */
    const rect = (tf, cx, cy, L, W, r) => {
      const R = Math.hypot(L / 2 + r, W / 2 + r);
      const c = C.localToWorld(tf, cx, cy, 0);
      const [i0, i1] = range(c[0] - R, c[0] + R, x0, nx), [j0, j1] = range(c[1] - R, c[1] + R, y0, ny);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const l = C.worldToLocal(tf, x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL, 0);
        if (Math.abs(l[0] - cx) <= L / 2 + r && Math.abs(l[1] - cy) <= W / 2 + r) blocked[j * nx + i] = 1;
      }
    };
    /** Segment épais (rayon rad). */
    const seg = (ax, ay, bx, by, rad) => {
      const [i0, i1] = range(Math.min(ax, bx) - rad, Math.max(ax, bx) + rad, x0, nx), [j0, j1] = range(Math.min(ay, by) - rad, Math.max(ay, by) + rad, y0, ny);
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * CELL, py = y0 + (j + 0.5) * CELL;
        const u = C.clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
        if (Math.hypot(px - ax - u * dx, py - ay - u * dy) <= rad) blocked[j * nx + i] = 1;
      }
    };
    for (const e of project.elements) {
      if (ex.has(e.id)) continue;
      const def = C.Types.get(e.type), p = e.params;
      const tf = { x: e.x, y: e.y, z: e.z, rot: e.rot };
      if (e.type === 'lane' || e.type === 'reachtruck') continue;
      if (def.conveyor) {
        const m = C.Types.model(e);
        for (const id in m.tracks) {
          const pts = new C.Path(m.tracks[id].segs, tf, false).sample(6, 400);
          for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k].p, b = pts[k + 1].p;
            if (Math.min(a[2], b[2]) - (p.frameH || 160) > TRUCK_H) continue;   // convoyeur en hauteur : on passe dessous
            seg(a[0], a[1], b[0], b[1], (p.width || 600) / 2 + INFLATE);
          }
        }
        if (e.type === 'osr') {
          const n = C.clamp(Math.round(p.towers), 1, 30);
          rect(tf, n * p.towerWidth / 2, p.laneLength + (p.frontZone + p.rackLength) / 2, n * p.towerWidth, p.frontZone + p.rackLength, INFLATE);
        }
        continue;
      }
      switch (e.type) {
        case 'wall':
          for (const pc of C.Walls.wallPieces(e, C.Walls.wallOpenings(e, project.elements))) if (pc.z0 + e.z < TRUCK_H) rect(tf, (pc.x0 + pc.x1) / 2, 0, pc.x1 - pc.x0, p.thickness || 200, INFLATE);
          break;
        case 'mezzanine': {
          const sp = Math.max(1000, p.columnSpacing || 4000);
          const nx2 = Math.max(2, Math.ceil(p.length / sp) + 1), ny2 = Math.max(2, Math.ceil(p.width / sp) + 1);
          for (let i = 0; i < nx2; i++) for (let j = 0; j < ny2; j++) rect(tf, -p.length / 2 + 75 + (p.length - 150) * i / (nx2 - 1), -p.width / 2 + 75 + (p.width - 150) * j / (ny2 - 1), 150, 150, INFLATE);
          if (p.deckH - p.thickness - 220 < TRUCK_H) rect(tf, 0, 0, p.length, p.width, INFLATE);
          break;
        }
        case 'barrier': rect(tf, p.length / 2, 0, p.length, 220, INFLATE); break;
        case 'guide': if (e.z < TRUCK_H) rect(tf, p.length / 2, 0, p.length, p.thickness || 20, INFLATE); break;
        default: {
          const sz = C.Types.staticSize(e);
          if (e.z > TRUCK_H) break;
          rect(tf, def.centered ? 0 : sz.L / 2, 0, sz.L, sz.W, INFLATE);
        }
      }
    }
    return G;
  }

  const cellOf = (G, x, y) => [C.clamp(Math.floor((x - G.x0) / CELL), 0, G.nx - 1), C.clamp(Math.floor((y - G.y0) / CELL), 0, G.ny - 1)];
  const centerOf = (G, i, j) => [G.x0 + (i + 0.5) * CELL, G.y0 + (j + 0.5) * CELL];
  /** Libère les cases autour d'un point (accès aux racks / palettes). */
  function clearDisk(G, x, y, r) {
    const [ci, cj] = cellOf(G, x, y), n = Math.ceil(r / CELL);
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) continue;
      if (Math.hypot(i - ci, j - cj) * CELL <= r) G.blocked[j * G.nx + i] = 0;
    }
  }
  /** Trajet en ligne droite libre ? */
  function lineFree(G, a, b) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / (CELL / 2)));
    for (let k = 0; k <= n; k++) {
      const [i, j] = cellOf(G, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
      if (G.blocked[j * G.nx + i]) return false;
    }
    return true;
  }
  /** A* sur la grille, puis lissage. Renvoie une liste de points ou null. */
  function astar(G, a, b) {
    if (lineFree(G, a, b)) return [a, b];
    const { nx, ny, blocked } = G;
    const [si, sj] = cellOf(G, a[0], a[1]), [gi, gj] = cellOf(G, b[0], b[1]);
    const N = nx * ny, start = sj * nx + si, goal = gj * nx + gi;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = i => { const dx = Math.abs(i % nx - gi), dy = Math.abs((i / nx | 0) - gj); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    g[start] = 0; push(start, h(start));
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false, it = 0;
    while (heap.length && it++ < 400000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const ci = cur % nx, cj = cur / nx | 0;
      for (const [di, dj, w] of nb) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const n = nj * nx + ni;
        if (blocked[n] || closed[n]) continue;
        if (di && dj && (blocked[cj * nx + ni] || blocked[nj * nx + ci])) continue;   // pas de coupe d'angle
        const ng = g[cur] + w;
        if (ng < g[n]) { g[n] = ng; came[n] = cur; push(n, ng + h(n)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(centerOf(G, c % nx, c / nx | 0));
    cells.reverse();
    cells[0] = a; cells[cells.length - 1] = b;
    // lissage par visibilité
    const out = [cells[0]];
    let i = 0;
    while (i < cells.length - 1) {
      let j = cells.length - 1;
      while (j > i + 1 && !lineFree(G, cells[i], cells[j])) j--;
      out.push(cells[j]); i = j;
    }
    return out;
  }

  /** Graphe orienté des allées de circulation. */
  function laneGraph(project) {
    const nodes = [], adj = [], lanes = [];
    for (const e of project.elements) {
      if (e.type !== 'lane' || e.params.laneStyle === 'pieton') continue;
      const m = C.Types.model(e);
      const path = new C.Path(m.tracks.main.segs, { x: e.x, y: e.y, z: e.z, rot: e.rot }, false);
      const n = Math.max(1, Math.round(path.length / LANE_STEP));
      const ids = [];
      for (let k = 0; k <= n; k++) {
        const r = path.at(path.length * k / n);
        ids.push(nodes.length); nodes.push({ x: r.p[0], y: r.p[1], lane: e }); adj.push([]);
      }
      for (let k = 0; k < ids.length - 1; k++) {
        const a = nodes[ids[k]], b = nodes[ids[k + 1]], d = Math.hypot(b.x - a.x, b.y - a.y);
        adj[ids[k]].push([ids[k + 1], d]);
        if (e.params.twoWay) adj[ids[k + 1]].push([ids[k], d]);
      }
      lanes.push({ e, ids, twoWay: !!e.params.twoWay });
    }
    // raccordements : fin d'une allée → point d'une autre, point d'une allée → début d'une autre
    for (const A of lanes) for (const B of lanes) {
      if (A === B) continue;
      const aEnd = A.ids[A.ids.length - 1], aStart = A.ids[0];
      for (const bn of B.ids) {
        const nb = nodes[bn];
        const dE = Math.hypot(nodes[aEnd].x - nb.x, nodes[aEnd].y - nb.y), dS = Math.hypot(nodes[aStart].x - nb.x, nodes[aStart].y - nb.y);
        if (dE < LANE_LINK) { adj[aEnd].push([bn, dE + 1]); if (A.twoWay) adj[bn].push([aEnd, dE + 1]); }
        if (dS < LANE_LINK) { adj[bn].push([aStart, dS + 1]); if (A.twoWay) adj[aStart].push([bn, dS + 1]); }
      }
    }
    return { nodes, adj, count: lanes.length };
  }

  /** Dijkstra multi-sources (entrées) vers plusieurs sorties ; coûts d'accès inclus. */
  function laneRoute(L, starts, goals) {
    const N = L.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    for (const [i, c] of starts) if (c < dist[i]) dist[i] = c;
    const goalCost = new Map(goals);
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, w] of L.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    let bestG = -1, bestC = Infinity;
    for (const [gidx, c] of goalCost) if (dist[gidx] + c < bestC) { bestC = dist[gidx] + c; bestG = gidx; }
    if (bestG < 0) return null;
    const seq = [];
    for (let v = bestG; v !== -1; v = prev[v]) seq.push(v);
    return { seq: seq.reverse(), cost: bestC };
  }

  /**
   * Itinéraire d'un chariot de `from` [x,y] à `to` [x,y].
   * opts : { exclude:Set, followLanes:bool }  →  { pts, lanes:bool, ok:bool }
   */
  function route(project, from, to, opts) {
    opts = opts || {};
    const G = buildGrid(project, opts.exclude);
    clearDisk(G, from[0], from[1], 1200);
    clearDisk(G, to[0], to[1], 1200);
    const direct = astar(G, from, to);
    let lanesAvailable = false;
    if (opts.followLanes !== false) {
      const L = laneGraph(project);
      lanesAvailable = L.count > 0;
      if (L.count) {
        const near = (p, k) => L.nodes.map((n, i) => [i, Math.hypot(n.x - p[0], n.y - p[1])]).sort((a, b) => a[1] - b[1]).slice(0, k);
        const res = laneRoute(L, near(from, 8).map(([i, d]) => [i, d * 1.6]), near(to, 8).map(([i, d]) => [i, d * 1.6]));
        if (res) {
          const first = L.nodes[res.seq[0]], last = L.nodes[res.seq[res.seq.length - 1]];
          const leg1 = astar(G, from, [first.x, first.y]), leg2 = astar(G, [last.x, last.y], to);
          if (leg1 && leg2) {
            const pts = leg1.slice(0, -1).concat(res.seq.map(i => [L.nodes[i].x, L.nodes[i].y]), leg2.slice(1));
            return { pts, lanes: true, ok: true, lanesAvailable };
          }
        }
      }
    }
    if (direct) return { pts: direct, lanes: false, ok: true, lanesAvailable };
    return { pts: [from, to], lanes: false, ok: false, lanesAvailable };
  }

  C.Planner = { buildGrid, astar, laneGraph, route, CELL, INFLATE };
})(window.C3D);
