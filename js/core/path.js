/* =====================================================================
 * Convoy3D — Géométrie des trajectoires (lignes médianes des convoyeurs)
 *
 * Une trajectoire est une suite de segments en coordonnées LOCALES (mm) :
 *   - line : {type:'line', a:[x,y,z], b:[x,y,z]}            (droite 3D)
 *   - arc  : {type:'arc', c:[cx,cy], r, a0, sweep, z0, z1}    (arc / hélice)
 * Le "Turtle" (tortue) construit ces segments à partir d'un cap et de
 * commandes simples (avancer, tourner, monter). Le chemin Path applique
 * ensuite la transformation de l'élément (position, rotation) et gère
 * l'inversion du sens de circulation.
 * Toute la logique de simulation travaille en abscisse curviligne s (mm).
 * ===================================================================== */
(function (C) {
  'use strict';

  /** Tortue de construction de trajectoire (cap h en radians, CCW depuis +X). */
  class Turtle {
    constructor(x = 0, y = 0, z = 0, h = 0) { this.x = x; this.y = y; this.z = z; this.h = h; this.segs = []; }
    /** Avance de `len` mm le long de la pente `slope` (rad). */
    line(len, slope = 0) {
      if (len <= 1e-6) return this;
      const hz = len * Math.cos(slope), dz = len * Math.sin(slope);
      const b = [this.x + hz * Math.cos(this.h), this.y + hz * Math.sin(this.h), this.z + dz];
      this.segs.push({ type: 'line', a: [this.x, this.y, this.z], b });
      [this.x, this.y, this.z] = b;
      return this;
    }
    /** Déplacement vertical pur (élévateur). */
    rise(dz) {
      if (Math.abs(dz) < 1e-6) return this;
      const b = [this.x, this.y, this.z + dz];
      this.segs.push({ type: 'line', a: [this.x, this.y, this.z], b, vertical: true });
      this.z += dz;
      return this;
    }
    /** Arc de rayon r, angle `ang` (rad, >0 = virage à gauche), dénivelé dz (hélice). */
    arc(r, ang, dz = 0) {
      if (Math.abs(ang) < 1e-9 || r <= 0) return this;
      const sgn = ang > 0 ? 1 : -1;
      const cx = this.x + r * Math.cos(this.h + sgn * Math.PI / 2);
      const cy = this.y + r * Math.sin(this.h + sgn * Math.PI / 2);
      const a0 = Math.atan2(this.y - cy, this.x - cx);
      this.segs.push({ type: 'arc', c: [cx, cy], r, a0, sweep: ang, z0: this.z, z1: this.z + dz });
      const a1 = a0 + ang;
      this.x = cx + r * Math.cos(a1); this.y = cy + r * Math.sin(a1); this.z += dz;
      this.h += ang;
      return this;
    }
    turn(ang) { this.h += ang; return this; }
    pose() { return { x: this.x, y: this.y, z: this.z, h: this.h }; }
  }

  function segLength(sg) {
    if (sg.type === 'line') {
      const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], dz = sg.b[2] - sg.a[2];
      return Math.hypot(dx, dy, dz);
    }
    return Math.hypot(sg.r * Math.abs(sg.sweep), sg.z1 - sg.z0);
  }

  /** Évaluation locale d'un segment à u∈[0,1] → {p, t} */
  function segEval(sg, u, out) {
    if (sg.type === 'line') {
      const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], dz = sg.b[2] - sg.a[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      out.p[0] = sg.a[0] + dx * u; out.p[1] = sg.a[1] + dy * u; out.p[2] = sg.a[2] + dz * u;
      out.t[0] = dx / L; out.t[1] = dy / L; out.t[2] = dz / L;
    } else {
      const phi = sg.a0 + sg.sweep * u;
      const c = Math.cos(phi), s = Math.sin(phi);
      out.p[0] = sg.c[0] + sg.r * c; out.p[1] = sg.c[1] + sg.r * s; out.p[2] = sg.z0 + (sg.z1 - sg.z0) * u;
      const tx = -sg.r * s * sg.sweep, ty = sg.r * c * sg.sweep, tz = sg.z1 - sg.z0;
      const L = Math.hypot(tx, ty, tz) || 1;
      out.t[0] = tx / L; out.t[1] = ty / L; out.t[2] = tz / L;
    }
    return out;
  }

  /**
   * Chemin : segments locaux + transformation monde {x,y,z,rot(deg)} + sens.
   */
  class Path {
    constructor(segs, tf, reversed) {
      this.segs = segs || [];
      this.tf = tf || { x: 0, y: 0, z: 0, rot: 0 };
      this.reversed = !!reversed;
      this._cos = Math.cos((this.tf.rot || 0) * C.DEG);
      this._sin = Math.sin((this.tf.rot || 0) * C.DEG);
      this.cum = [0];
      for (const sg of this.segs) this.cum.push(this.cum[this.cum.length - 1] + segLength(sg));
      this.length = this.cum[this.cum.length - 1];
    }
    /** Position et tangente MONDE à l'abscisse s (mm). Résultat réutilisable via `out`. */
    at(s, out) {
      out = out || { p: [0, 0, 0], t: [0, 0, 0], seg: 0 };
      if (!this.segs.length) { out.p[0] = this.tf.x; out.p[1] = this.tf.y; out.p[2] = this.tf.z; out.t[0] = 1; out.t[1] = 0; out.t[2] = 0; return out; }
      let ss = C.clamp(s, 0, this.length);
      if (this.reversed) ss = this.length - ss;
      // recherche du segment (dichotomie)
      let lo = 0, hi = this.segs.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.cum[mid] <= ss) lo = mid; else hi = mid - 1; }
      const sg = this.segs[lo];
      const sl = this.cum[lo + 1] - this.cum[lo];
      segEval(sg, sl > 0 ? (ss - this.cum[lo]) / sl : 0, out);
      out.seg = this.reversed ? this.segs.length - 1 - lo : lo;
      out.vertical = !!sg.vertical;
      if (this.reversed) { out.t[0] = -out.t[0]; out.t[1] = -out.t[1]; out.t[2] = -out.t[2]; }
      // transformation monde
      const x = out.p[0], y = out.p[1];
      out.p[0] = this.tf.x + x * this._cos - y * this._sin;
      out.p[1] = this.tf.y + x * this._sin + y * this._cos;
      out.p[2] = this.tf.z + out.p[2];
      const tx = out.t[0], ty = out.t[1];
      out.t[0] = tx * this._cos - ty * this._sin;
      out.t[1] = tx * this._sin + ty * this._cos;
      return out;
    }
    /** Cap (rad) dans le plan à l'abscisse s ; null si tangente verticale. */
    headingAt(s) {
      const r = this.at(s);
      if (Math.hypot(r.t[0], r.t[1]) < 1e-3) return null;
      return Math.atan2(r.t[1], r.t[0]);
    }
    /** Abscisses des extrémités de segments (en s dans le sens de circulation). */
    breaks() {
      const b = this.cum.slice();
      return this.reversed ? b.map(v => this.length - v).reverse() : b;
    }
    /**
     * Échantillonnage adaptatif : extrémités de segments, arcs subdivisés
     * (pas angulaire maxi), pas maximal en longueur optionnel.
     */
    sample(maxAngleDeg = 4, maxLen = 0) {
      const res = [];
      const n = this.segs.length;
      for (let i = 0; i < n; i++) {
        const sg = this.segs[this.reversed ? n - 1 - i : i];
        const L = segLength(sg);
        let k = 1;
        if (sg.type === 'arc') k = Math.max(2, Math.ceil(Math.abs(sg.sweep) * C.RAD / maxAngleDeg));
        if (maxLen > 0) k = Math.max(k, Math.ceil(L / maxLen));
        const s0 = res.length ? res[res.length - 1].s : 0;
        for (let j = (i === 0 ? 0 : 1); j <= k; j++) {
          const s = s0 + L * j / k;
          const r = this.at(Math.min(s, this.length));
          res.push({ s, p: r.p.slice(), t: r.t.slice(), vertical: r.vertical });
        }
        // tangente moyenne aux jonctions (évite les fentes dans les balayages)
        if (i < n - 1) {
          const last = res[res.length - 1];
          const nx = this.at(Math.min(last.s + 0.01, this.length));
          if (!last.vertical && !nx.vertical) {
            const t = [last.t[0] + nx.t[0], last.t[1] + nx.t[1], last.t[2] + nx.t[2]];
            const l = Math.hypot(t[0], t[1], t[2]) || 1;
            last.t = [t[0] / l, t[1] / l, t[2] / l];
          }
        }
      }
      return res;
    }
    /** Point le plus proche dans le plan (x,y) → {s, d, p, t}. */
    nearest(x, y, z) {
      if (!this.length) return { s: 0, d: Infinity, p: [this.tf.x, this.tf.y, this.tf.z], t: [1, 0, 0] };
      const step = Math.max(10, Math.min(50, this.length / 400));
      let best = { s: 0, d: Infinity };
      const r = { p: [0, 0, 0], t: [0, 0, 0] };
      const dist = (s) => {
        this.at(s, r);
        let d = Math.hypot(r.p[0] - x, r.p[1] - y);
        if (z !== undefined) d += Math.abs(r.p[2] - z) * 0.5;
        return d;
      };
      for (let s = 0; s <= this.length + 1e-6; s += step) {
        const d = dist(s); if (d < best.d) best = { s, d };
      }
      // affinage
      let lo = Math.max(0, best.s - step), hi = Math.min(this.length, best.s + step);
      for (let it = 0; it < 30; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (dist(m1) < dist(m2)) hi = m2; else lo = m1;
      }
      const s = (lo + hi) / 2;
      const out = this.at(s);
      return { s, d: Math.hypot(out.p[0] - x, out.p[1] - y), dz: z !== undefined ? out.p[2] - z : 0, p: out.p.slice(), t: out.t.slice() };
    }
  }

  /** Transforme un point local (mm) avec la transformation d'un élément. */
  C.localToWorld = function (tf, x, y, z) {
    const c = Math.cos((tf.rot || 0) * C.DEG), s = Math.sin((tf.rot || 0) * C.DEG);
    return [tf.x + x * c - y * s, tf.y + x * s + y * c, tf.z + z];
  };
  C.worldToLocal = function (tf, x, y, z) {
    const c = Math.cos(-(tf.rot || 0) * C.DEG), s = Math.sin(-(tf.rot || 0) * C.DEG);
    const dx = x - tf.x, dy = y - tf.y;
    return [dx * c - dy * s, dx * s + dy * c, (z || 0) - tf.z];
  };

  C.Turtle = Turtle;
  C.Path = Path;
  C.segLength = segLength;
})(window.C3D);
