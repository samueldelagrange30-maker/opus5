/* =====================================================================
 * Convoy3D — Sauvegarde locale, import / export, plan 2D, nomenclature
 * ===================================================================== */
(function (C) {
  'use strict';

  /* ----------------------- stockage local (navigateur) ------------------- */
  const KEY_INDEX = 'convoy3d.index', KEY_P = 'convoy3d.p.', KEY_LAST = 'convoy3d.last', KEY_AUTO = 'convoy3d.autosave';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { C.toast('Stockage local indisponible ou plein : exportez en JSON.', 'error'); return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  C.Storage = {
    list() { try { return JSON.parse(ls.get(KEY_INDEX) || '[]'); } catch (e) { return []; } },
    writeIndex(idx) { ls.set(KEY_INDEX, JSON.stringify(idx)); },
    save(project, net) {
      const data = project.toJSON(net);
      if (!ls.set(KEY_P + project.id, JSON.stringify(data))) return false;
      const idx = this.list().filter(i => i.id !== project.id);
      idx.unshift({ id: project.id, name: project.name, updated: Date.now(), count: project.elements.length });
      this.writeIndex(idx);
      ls.set(KEY_LAST, project.id);
      project.dirty = false;
      return true;
    },
    load(id) { const s = ls.get(KEY_P + id); return s ? JSON.parse(s) : null; },
    remove(id) { ls.del(KEY_P + id); this.writeIndex(this.list().filter(i => i.id !== id)); },
    rename(id, name) {
      const d = this.load(id); if (!d) return;
      d.name = name; ls.set(KEY_P + id, JSON.stringify(d));
      this.writeIndex(this.list().map(i => i.id === id ? Object.assign(i, { name }) : i));
    },
    duplicate(id) {
      const d = this.load(id); if (!d) return null;
      d.id = C.uid('p'); d.name = d.name + ' (copie)';
      ls.set(KEY_P + d.id, JSON.stringify(d));
      const idx = this.list(); idx.unshift({ id: d.id, name: d.name, updated: Date.now(), count: d.elements.length });
      this.writeIndex(idx);
      return d.id;
    },
    last() { return ls.get(KEY_LAST); },
    autosave(project, net) { ls.set(KEY_AUTO, JSON.stringify(project.toJSON(net))); },
    autosaved() { try { return JSON.parse(ls.get(KEY_AUTO) || 'null'); } catch (e) { return null; } }
  };

  /* ------------------------------ JSON ---------------------------------- */
  C.IO = {
    exportJSON(app) {
      const data = app.project.toJSON(app.network);
      C.download(C.safeName(app.project.name) + '.convoy3d.json', JSON.stringify(data, null, 2), 'application/json');
    },
    importFile(file, cb) {
      const rd = new FileReader();
      rd.onload = () => {
        try { cb(null, JSON.parse(rd.result)); } catch (e) { cb(e); }
      };
      rd.onerror = () => cb(rd.error);
      rd.readAsText(file);
    },

    /* --------------------------- nomenclature --------------------------- */
    bomRows(app) {
      const net = app.network;
      const ref = C.Analysis.refCarton(app.project);
      return app.project.elements.map(el => {
        const def = C.Types.get(el.type), p = el.params;
        const node = net.node(el.id);
        const io = node ? net.inOut(el.id) : null;
        const zin = io && io.in ? io.in.pos[2] : el.z;
        const zout = io && io.outs.length ? io.outs[0].pos[2] : el.z;
        const row = {
          ref: el.name, type: def.label,
          tech: def.conveyor && p.surface ? C.SURFACE_LABEL[p.surface] : '',
          length: def.conveyor ? C.Types.devLength(el) : C.Types.staticSize(el).L,
          width: def.conveyor ? p.width : C.Types.staticSize(el).W, useful: p.usefulWidth || '',
          zin, zout, slope: def.conveyor ? C.Types.meanSlope(el) : 0,
          radius: el.type === 'curve' || el.type === 'spiral' ? p.radius : '',
          angle: el.type === 'curve' ? p.angle : el.type === 'spiral' ? p.turns * 360 : '',
          speed: p.speed !== undefined ? p.speed : '',
          rollers: def.conveyor && (p.surface === 'rollers' || p.surface === 'freerollers') ? C.Types.rollerCount(el) : '',
          rollerDiam: def.conveyor && (p.surface === 'rollers' || p.surface === 'freerollers') ? p.rollerDiam : '',
          motor: def.conveyor ? (p.surface === 'freerollers' ? 'Non' : 'Oui') : '',
          capacity: def.conveyor ? C.Analysis.capacity(el, ref) : '',
          x: el.x, y: el.y, z: el.z, rot: el.rot, note: p.note || ''
        };
        return row;
      });
    },
    bomSummary(rows) {
      const m = new Map();
      for (const r of rows) {
        const k = r.type + (r.tech ? ' — ' + r.tech : '');
        const o = m.get(k) || { label: k, n: 0, len: 0, rollers: 0 };
        o.n++; o.len += +r.length || 0; o.rollers += +r.rollers || 0;
        m.set(k, o);
      }
      return Array.from(m.values()).sort((a, b) => b.len - a.len);
    },
    BOM_COLS: [
      ['ref', 'Repère'], ['type', 'Désignation'], ['tech', 'Technologie'], ['length', 'Longueur dév. (mm)', 0], ['width', 'Largeur (mm)', 0],
      ['useful', 'Larg. utile (mm)', 0], ['zin', 'Z entrée (mm)', 0], ['zout', 'Z sortie (mm)', 0], ['slope', 'Pente (°)', 1],
      ['radius', 'Rayon (mm)', 0], ['angle', 'Angle (°)', 0], ['speed', 'Vitesse (m/s)', 2], ['rollers', 'Nb rouleaux', 0],
      ['rollerDiam', 'Ø rouleaux (mm)', 0], ['motor', 'Motorisé'], ['capacity', 'Capacité (c/h)', 0],
      ['x', 'X (mm)', 0], ['y', 'Y (mm)', 0], ['z', 'Z (mm)', 0], ['rot', 'Rotation (°)', 1], ['note', 'Commentaire']
    ],
    exportBOMCSV(app) {
      const rows = this.bomRows(app);
      const cols = this.BOM_COLS;
      const cell = (v, d) => {
        if (v === '' || v === undefined || v === null) return '';
        if (typeof v === 'number') return (d !== undefined ? v.toFixed(d) : String(v)).replace('.', ',');
        const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [cols.map(c => c[1]).join(';')];
      for (const r of rows) lines.push(cols.map(c => cell(r[c[0]], c[2])).join(';'));
      lines.push('');
      lines.push('Récapitulatif;Quantité;Longueur totale (mm);Rouleaux');
      for (const s of this.bomSummary(rows)) lines.push([cell(s.label), s.n, cell(s.len, 0), s.rollers].join(';'));
      C.download(C.safeName(app.project.name) + '_nomenclature.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    },
    bomHTML(app) {
      const rows = this.bomRows(app), cols = this.BOM_COLS.filter(c => !['x', 'y', 'z', 'rot', 'note'].includes(c[0]));
      const f = (v, d) => v === '' || v === undefined ? '' : typeof v === 'number' ? C.fmt(v, d || 0) : C.escape(v);
      let h = '<table class="bom"><thead><tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of rows) h += '<tr>' + cols.map(c => `<td>${f(r[c[0]], c[2])}</td>`).join('') + '</tr>';
      h += '</tbody></table>';
      h += '<h3>Récapitulatif</h3><table class="bom"><thead><tr><th>Désignation</th><th>Quantité</th><th>Longueur totale</th><th>Rouleaux</th></tr></thead><tbody>';
      let tot = 0;
      for (const s of this.bomSummary(rows)) { tot += s.len; h += `<tr><td>${C.escape(s.label)}</td><td>${s.n}</td><td>${C.fmt(s.len)} mm</td><td>${s.rollers || ''}</td></tr>`; }
      h += `<tr class="tot"><td>Total</td><td>${rows.length}</td><td>${C.fmt(tot)} mm (${C.fmt(tot / 1000, 2)} m)</td><td></td></tr></tbody></table>`;
      return h;
    },

    /* ----------------------------- plan 2D SVG ---------------------------- */
    planSVG(app, opts) {
      opts = opts || {};
      const net = app.network, project = app.project;
      const shapes = [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const ext = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
      // mezzanines dessinées en premier (sous les autres éléments)
      const ordered = project.elements.filter(e => e.type === 'mezzanine').concat(project.elements.filter(e => e.type !== 'mezzanine'));
      for (const el of ordered) {
        const def = C.Types.get(el.type), p = el.params;
        const tf = { x: el.x, y: el.y, z: el.z, rot: el.rot };
        if (def.conveyor) {
          const m = C.Types.model(el);
          const polys = [];
          if (el.type === 'turntable') {
            const c = C.localToWorld(tf, p.diameter / 2, 0, 0);
            shapes.push({ el, circle: { c, r: p.diameter / 2 } });
            ext(c[0] - p.diameter / 2, c[1] - p.diameter / 2); ext(c[0] + p.diameter / 2, c[1] + p.diameter / 2);
            continue;
          }
          for (const id in m.tracks) {
            if (id !== 'main' && id !== 'in') continue;
            const path = new C.Path(m.tracks[id].segs, tf, false);
            const sm = path.sample(5, 0).filter(o => !o.vertical || true);
            const L = [], R = [];
            let prevN = [0, 1];
            for (const o of sm) {
              let n = [-o.t[1], o.t[0]]; const ln = Math.hypot(n[0], n[1]);
              if (ln < 1e-3) n = prevN; else n = [n[0] / ln, n[1] / ln];
              prevN = n;
              const hw = (p.width || 600) / 2;
              L.push([o.p[0] + n[0] * hw, o.p[1] + n[1] * hw]); R.push([o.p[0] - n[0] * hw, o.p[1] - n[1] * hw]);
            }
            const poly = L.concat(R.reverse());
            poly.forEach(q => ext(q[0], q[1]));
            polys.push(poly);
          }
          const flow = net.mainTrack(el.id);
          if (el.type === 'osr') {
            // tours de stockage
            const n = C.clamp(Math.round(p.towers), 1, 30), y0 = C.Types.defs.osr.rackY0(p);
            for (let i = 0; i < n; i++) {
              const q = [[i * p.towerWidth, y0], [(i + 1) * p.towerWidth, y0], [(i + 1) * p.towerWidth, y0 + p.rackLength], [i * p.towerWidth, y0 + p.rackLength]].map(v => C.localToWorld(tf, v[0], v[1], 0));
              q.forEach(v => ext(v[0], v[1]));
              polys.push(q.map(v => [v[0], v[1]]));
            }
          }
          shapes.push({ el, polys, flow });
        } else {
          const sz = C.Types.staticSize(el);
          const hl = sz.L / 2, hw = (sz.W || 20) / 2;
          const cx = def.centered ? 0 : hl;
          const pts = [[cx - hl, -hw], [cx + hl, -hw], [cx + hl, hw], [cx - hl, hw]].map(q => C.localToWorld(tf, q[0], q[1], 0));
          pts.forEach(q => ext(q[0], q[1]));
          const sh = { el, polys: [pts.map(q => [q[0], q[1]])] };
          if (el.type === 'wall') {
            // ouvertures praticables au niveau du sol / des convoyeurs (vue en coupe à 1,5 m)
            sh.gaps = C.Walls.wallOpenings(el, project.elements).filter(o => o.z0 < 2500).map(o =>
              [[o.x0, -hw - 5], [o.x1, -hw - 5], [o.x1, hw + 5], [o.x0, hw + 5]].map(q => C.localToWorld(tf, q[0], q[1], 0)).map(q => [q[0], q[1]]));
          }
          shapes.push(sh);
        }
      }
      if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = project.settings.workW; y1 = project.settings.workD; }
      const pad = 1200;
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const W = opts.width || 1600;
      const sc = W / (x1 - x0);
      const H = Math.round((y1 - y0) * sc) + 140;
      const X = x => ((x - x0) * sc).toFixed(1), Y = y => ((y1 - y) * sc + 20).toFixed(1);
      let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="Segoe UI, Arial, sans-serif">`;
      s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;
      // grille 1 m
      const g0 = Math.ceil(x0 / 1000) * 1000;
      for (let x = g0; x <= x1; x += 1000) s += `<line x1="${X(x)}" y1="${Y(y0)}" x2="${X(x)}" y2="${Y(y1)}" stroke="${x % 5000 ? '#eef1f4' : '#d5dbe2'}" stroke-width="1"/>`;
      for (let y = Math.ceil(y0 / 1000) * 1000; y <= y1; y += 1000) s += `<line x1="${X(x0)}" y1="${Y(y)}" x2="${X(x1)}" y2="${Y(y)}" stroke="${y % 5000 ? '#eef1f4' : '#d5dbe2'}" stroke-width="1"/>`;
      for (let x = g0; x <= x1; x += 5000) s += `<text x="${X(x)}" y="${Y(y0) - 4}" font-size="11" fill="#8896a5" text-anchor="middle">${x / 1000} m</text>`;
      for (let y = Math.ceil(y0 / 5000) * 5000; y <= y1; y += 5000) s += `<text x="4" y="${Y(y)}" font-size="11" fill="#8896a5">${y / 1000} m</text>`;
      // éléments
      for (const sh of shapes) {
        const el = sh.el, col = el.params.color || '#888';
        if (sh.circle) {
          s += `<circle cx="${X(sh.circle.c[0])}" cy="${Y(sh.circle.c[1])}" r="${(sh.circle.r * sc).toFixed(1)}" fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="1.5"/>`;
        }
        for (const poly of sh.polys || []) {
          const mez = el.type === 'mezzanine';
          s += `<polygon points="${poly.map(q => X(q[0]) + ',' + Y(q[1])).join(' ')}" fill="${col}" fill-opacity="${el.type === 'obstacle' ? 0.6 : mez ? 0.08 : 0.22}" stroke="${col}" stroke-width="${mez ? 2 : 1.4}"${mez ? ' stroke-dasharray="10 5"' : ''}/>`;
        }
        for (const gp of sh.gaps || []) s += `<polygon points="${gp.map(q => X(q[0]) + ',' + Y(q[1])).join(' ')}" fill="#ffffff" stroke="#c0392b" stroke-width="0.8" stroke-dasharray="3 2"/>`;
        if (sh.flow) {
          const pts = sh.flow.path.sample(6, 0).map(o => X(o.p[0]) + ',' + Y(o.p[1])).join(' ');
          s += `<polyline points="${pts}" fill="none" stroke="#2c3e50" stroke-width="0.8" stroke-dasharray="6 4"/>`;
          const a = sh.flow.path.at(sh.flow.length * 0.6), h = Math.atan2(a.t[1], a.t[0]);
          const ax = +X(a.p[0]), ay = +Y(a.p[1]), al = 9;
          const pA = [ax + Math.cos(h) * al, ay - Math.sin(h) * al], pB = [ax + Math.cos(h + 2.5) * al, ay - Math.sin(h + 2.5) * al], pC = [ax + Math.cos(h - 2.5) * al, ay - Math.sin(h - 2.5) * al];
          s += `<polygon points="${pA.join(',')} ${pB.join(',')} ${pC.join(',')}" fill="#2c3e50"/>`;
        }
        // étiquette
        const node = net.node(el.id);
        let lp = [el.x, el.y];
        if (node) { const t = net.mainTrack(el.id); lp = t.path.at(t.length / 2).p; }
        const L = C.Types.get(el.type).conveyor ? C.Types.devLength(el) : C.Types.staticSize(el).L;
        if (el.type === 'mezzanine') { const q = C.localToWorld({ x: el.x, y: el.y, z: 0, rot: el.rot }, -el.params.length / 2 + 300, el.params.width / 2 - 300, 0); lp = [q[0], q[1]]; }
        s += `<text x="${X(lp[0])}" y="${+Y(lp[1]) - 4}" font-size="11" font-weight="600" fill="#1d2731" text-anchor="${el.type === 'mezzanine' ? 'start' : 'middle'}">${C.escape(el.name)}${el.type === 'mezzanine' ? ` — plancher Z${C.fmt(el.z + el.params.deckH)}` : ''}</text>`;
        s += `<text x="${X(lp[0])}" y="${+Y(lp[1]) + 9}" font-size="9" fill="#4b5a69" text-anchor="middle">${C.fmt(L)} mm</text>`;
        if (node && opts.heights !== false) for (const p of node.ports) {
          if (p.optional && p.status === 'free') continue;
          s += `<text x="${X(p.pos[0])}" y="${+Y(p.pos[1]) + 3}" font-size="8" fill="#c0392b" text-anchor="middle">Z${C.fmt(p.pos[2])}</text>`;
        }
      }
      // cote d'encombrement
      const ex0 = x0 + pad, ex1 = x1 - pad, ey0 = y0 + pad, ey1 = y1 - pad;
      const yy = +Y(ey0) + 30;
      s += `<line x1="${X(ex0)}" y1="${yy}" x2="${X(ex1)}" y2="${yy}" stroke="#1d2731" stroke-width="1" marker-start="url(#a)" marker-end="url(#a)"/>`;
      s += `<text x="${(+X(ex0) + +X(ex1)) / 2}" y="${yy - 4}" font-size="11" text-anchor="middle" fill="#1d2731">${C.fmt(ex1 - ex0)} mm</text>`;
      const xx = +X(ex1) + 30;
      s += `<line x1="${xx}" y1="${Y(ey0)}" x2="${xx}" y2="${Y(ey1)}" stroke="#1d2731" stroke-width="1"/>`;
      s += `<text x="${xx + 4}" y="${(+Y(ey0) + +Y(ey1)) / 2}" font-size="11" fill="#1d2731">${C.fmt(ey1 - ey0)} mm</text>`;
      // échelle + cartouche
      const sb = 5000 * sc;
      const by = H - 40;
      s += `<rect x="20" y="${by}" width="${sb.toFixed(1)}" height="6" fill="#1d2731"/><rect x="${(20 + sb / 2).toFixed(1)}" y="${by}" width="${(sb / 2).toFixed(1)}" height="6" fill="#fff" stroke="#1d2731"/>`;
      s += `<text x="20" y="${by - 4}" font-size="10" fill="#1d2731">0</text><text x="${(20 + sb).toFixed(1)}" y="${by - 4}" font-size="10" fill="#1d2731" text-anchor="middle">5 m</text>`;
      const tb = W - 380;
      s += `<rect x="${tb}" y="${H - 80}" width="370" height="72" fill="#fff" stroke="#1d2731"/>`;
      s += `<text x="${tb + 10}" y="${H - 60}" font-size="14" font-weight="700" fill="#1d2731">${C.escape(project.name)}</text>`;
      s += `<text x="${tb + 10}" y="${H - 42}" font-size="10" fill="#4b5a69">Plan d'implantation — vue de dessus — ${new Date().toLocaleDateString('fr-FR')}</text>`;
      const totalLen = project.elements.filter(e => C.Types.get(e.type).conveyor).reduce((a, e) => a + C.Types.devLength(e), 0);
      s += `<text x="${tb + 10}" y="${H - 26}" font-size="10" fill="#4b5a69">${project.elements.length} éléments · ${C.fmt(totalLen / 1000, 2)} m de convoyage · échelle 1:${C.fmt(1 / sc / 1, 0)} (écran)</text>`;
      s += `<text x="${tb + 10}" y="${H - 13}" font-size="9" fill="#8896a5">Convoy3D ${C.VERSION} — cotes en mm, Z = hauteur de convoyage</text>`;
      s += `<defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,4 L8,4 M4,0 L4,8" stroke="#1d2731"/></marker></defs>`;
      s += '</svg>';
      return s;
    },
    /** Imprime un document HTML via une iframe cachée. */
    printHTML(title, body) {
      const fr = C.h('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
      document.body.appendChild(fr);
      const d = fr.contentWindow.document;
      d.open();
      d.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${C.escape(title)}</title><style>
        @page { size: A3 landscape; margin: 10mm; }
        body { font-family: Segoe UI, Arial, sans-serif; color: #1d2731; margin: 0; }
        h1 { font-size: 18px; margin: 0 0 8px; } h3 { font-size: 13px; margin: 14px 0 6px; }
        table.bom { border-collapse: collapse; width: 100%; font-size: 10px; page-break-inside: auto; }
        table.bom th, table.bom td { border: 1px solid #b8c2cc; padding: 3px 5px; text-align: left; }
        table.bom th { background: #eef1f4; } tr.tot td { font-weight: 700; }
        svg { width: 100%; height: auto; max-height: 265mm; }
        .pb { page-break-before: always; }
      </style></head><body>${body}</body></html>`);
      d.close();
      setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 2000); }, 400);
    }
  };
})(window.C3D);
