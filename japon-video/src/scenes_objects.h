// Scènes d'objets : bambouseraie (Arashiyama) et grand torii dans la mer au couchant (Miyajima)
#pragma once
#include "core.h"

// =====================================================================================
// 3. Bambouseraie — marche sur le sentier, lumière filtrée (unités : m)
// =====================================================================================
struct Bamboo : Scene {
    static constexpr float CS = 0.9, YC = 11.0, PATH = 1.75;
    v3 sun, sunCol, amb, fogCol;

    void init() override {
        sun = normalize(v3(0.42, 0.80, -0.42));
        sunCol = v3(1.0, 0.95, 0.78) * 2.6;
        amb = v3(0.24, 0.38, 0.15) * 1.0;
        fogCol = v3(0.34, 0.54, 0.20) * 1.0;
        exposure = 1.0; bloom = 0.22;
    }
    void setup(float time, float u, float aspect, Cam &c) override {
        v3 ro(0.22 * sinf(time * 0.45), 1.62 + 0.018 * sinf(time * 2.3), 20 - 0.50 * time);
        v3 ta = ro + v3(0.05 * sinf(time * 0.3 + 1), 0.16 + 0.07 * u, -1);
        c.look(ro, ta, 64, aspect);
    }
    static inline bool culm(int cx, int cz, float &px, float &pz, float &rad, v3 &ax, float &id) {
        float wx = (cx + 0.5) * CS;
        if (fabsf(wx) < PATH + 0.65) return false;
        if (h2(cx * 7 + 3, cz * 13 + 1) < 0.20) return false;
        id = h2(cx, cz);
        px = wx + (h2(cx + 91, cz) - 0.5) * 0.40;
        pz = (cz + 0.5) * CS + (h2(cx, cz + 37) - 0.5) * 0.40;
        rad = 0.042 + 0.032 * h2(cx - 5, cz + 9);
        ax = normalize(v3((h2(cx + 3, cz - 8) - 0.5) * 0.024, 1, (h2(cx - 13, cz + 2) - 0.5) * 0.024));
        return true;
    }
    // lumière du soleil tachetée par le feuillage
    inline float dapple(v3 p) const {
        float qx = p.x - sun.x * p.y / sun.y, qz = p.z - sun.z * p.y / sun.y;
        float a = vn2(qx * 0.55, qz * 0.55), b = vn2(qx * 2.3 + 9, qz * 2.3);
        return sstep(0.50, 0.72, a * 0.72 + b * 0.28);
    }
    v3 canopy(v3 ro, v3 rd, float &tOut) const {
        v3 col = v3(1.25, 1.42, 1.15);
        const float ys[3] = {19.0, 14.5, YC};
        for (int i = 0; i < 3; i++) {
            float t = (ys[i] - ro.y) / rd.y;
            float qx = ro.x + rd.x * t, qz = ro.z + rd.z * t;
            float d = fbmv(qx * 0.30 + ys[i], qz * 0.30, 5) + 0.26 * (vn2(qx * 7, qz * 7) - 0.5) + 0.20 * (vn2(qx * 23, qz * 23) - 0.5) + 0.12 * (vn2(qx * 61, qz * 61) - 0.5);
            float cover = sstep(0.36, 0.47, d);
            float back = sstep(0.72, 0.42, d);
            v3 leaf = mix(v3(0.035, 0.10, 0.015), v3(0.42, 0.74, 0.15) * 1.15, back);
            col = mix(col, leaf, cover);
            if (i == 2) tOut = t;
        }
        return col;
    }
    v3 shade(const v3 &ro, const v3 &rd, float time) override {
        float tmax = 70;
        int kind = 0; // 0 brume, 1 sol, 2 clôture, 3 bambou, 4 canopée
        float best = tmax;
        v3 n(0, 1, 0);
        float cid = 0, crad = 0;
        if (rd.y > 1e-4) { float t = (YC - ro.y) / rd.y; if (t < best) { best = t; kind = 4; } }
        if (rd.y < -1e-4) { float t = -ro.y / rd.y; if (t < best) { best = t; kind = 1; n = v3(0, 1, 0); } }
        // clôtures de broussaille le long du sentier
        if (fabsf(rd.x) > 1e-5) {
            float sx = rd.x > 0 ? 1 : -1;
            float t = (sx * PATH - ro.x) / rd.x;
            if (t > 0 && t < best) { float y = ro.y + rd.y * t; if (y >= 0 && y < 0.95) { best = t; kind = 2; n = v3(-sx, 0, 0); } }
        }
        if (rd.y < -1e-4) {
            float t = (0.95 - ro.y) / rd.y;
            if (t > 0 && t < best) { float x = fabsf(ro.x + rd.x * t); if (x > PATH && x < PATH + 0.22) { best = t; kind = 2; n = v3(0, 1, 0); } }
        }
        // parcours de grille (DDA) pour les chaumes
        {
            int cx = (int)floorf(ro.x / CS), cz = (int)floorf(ro.z / CS);
            int sx = rd.x > 0 ? 1 : -1, sz = rd.z > 0 ? 1 : -1;
            float idx = fabsf(rd.x) > 1e-6 ? 1 / rd.x : 1e9 * sx, idz = fabsf(rd.z) > 1e-6 ? 1 / rd.z : 1e9 * sz;
            float tmx = ((cx + (sx > 0 ? 1 : 0)) * CS - ro.x) * idx, tmz = ((cz + (sz > 0 ? 1 : 0)) * CS - ro.z) * idz;
            float tdx = fabsf(CS * idx), tdz = fabsf(CS * idz);
            float tcell = 0;
            for (int s = 0; s < 150; s++) {
                if (tcell > best) break;
                float px, pz, rad, id;
                v3 ax;
                if (culm(cx, cz, px, pz, rad, ax, id)) {
                    v3 oc = ro - v3(px, 0, pz);
                    float da = dot(rd, ax), oa = dot(oc, ax);
                    v3 rdp = rd - ax * da, ocp = oc - ax * oa;
                    float A = dot(rdp, rdp), B = dot(rdp, ocp), Cc = dot(ocp, ocp) - rad * rad;
                    float disc = B * B - A * Cc;
                    if (disc > 0 && A > 1e-9) {
                        float t = (-B - sqrtf(disc)) / A;
                        if (t > 0.02 && t < best) {
                            v3 p = ro + rd * t;
                            if (p.y > 0 && p.y < YC + 0.5) {
                                best = t; kind = 3; cid = id; crad = rad;
                                v3 q = p - v3(px, 0, pz);
                                n = normalize(q - ax * dot(q, ax));
                            }
                        }
                    }
                }
                if (tmx < tmz) { tcell = tmx; tmx += tdx; cx += sx; } else { tcell = tmz; tmz += tdz; cz += sz; }
            }
        }
        v3 p = ro + rd * best;
        v3 col;
        float tfog = best;
        if (kind == 4) {
            col = canopy(ro, rd, tfog);
        } else if (kind == 0) {
            col = fogCol;
        } else {
            float dp = dapple(p);
            if (kind == 1) {
                float ax = fabsf(p.x);
                if (ax < PATH) {
                    v3 g = v3(0.40, 0.36, 0.30) * (0.75 + 0.5 * vn2(p.x * 26, p.z * 26)) * (0.85 + 0.3 * vn2(p.x * 2.1, p.z * 2.1));
                    // feuilles mortes éparses sur le sentier
                    g = mix(g, v3(0.36, 0.26, 0.10), 0.5 * sstep(0.62, 0.75, vn2(p.x * 13 + 4, p.z * 13)));
                    col = g * (amb * 1.0 + sunCol * (0.75 * dp * sun.y));
                    col *= 0.55 + 0.45 * sstep(PATH, PATH - 0.5, ax);
                } else {
                    v3 g = mix(v3(0.20, 0.14, 0.07), v3(0.10, 0.20, 0.05), sstep(0.4, 0.7, vn2(p.x * 1.6, p.z * 1.6)));
                    g *= 0.6 + 0.8 * vn2(p.x * 17, p.z * 17);
                    col = g * (amb * 0.7 + sunCol * (0.6 * dp * sun.y));
                }
            } else if (kind == 2) {
                float tw = vn2(p.z * 55, p.y * 3.5) * 0.6 + vn2(p.z * 140, p.y * 9) * 0.4;
                v3 g = v3(0.17, 0.125, 0.075) * (0.35 + 1.2 * tw);
                float rail = max(sstep(0.045, 0.02, fabsf(p.y - 0.30)), sstep(0.045, 0.02, fabsf(p.y - 0.78)));
                g = mix(g, v3(0.30, 0.27, 0.12), rail);
                float post = sstep(0.05, 0.03, fabsf(fract(p.z / 1.8) - 0.5) * 1.8);
                g = mix(g, v3(0.30, 0.30, 0.14), post * (n.y < 0.5 ? 1 : 0));
                float dif = n.y > 0.5 ? sun.y : max(dot(n, sun), 0.0f);
                col = g * (amb * (0.55 + 0.35 * sstep(0, 0.95, p.y)) + sunCol * (0.75 * dp * (0.25 + dif)));
            } else {
                float L = 0.30 + 0.14 * cid;
                float kk = p.y / L + cid * 7, fr = kk - floorf(kk);
                v3 base = mix(v3(0.07, 0.20, 0.035), v3(0.19, 0.36, 0.075), fract(cid * 7.3));
                if (cid > 0.86) base = mix(base, v3(0.42, 0.40, 0.14), 0.6);
                base *= 0.8 + 0.4 * vn2(p.y * 2.2 + cid * 31, cid * 91);
                float ring = sstep(0.10, 0.0, fr) * 0.55 + sstep(0.93, 1.0, fr) * 0.25;
                base = mix(base, v3(0.62, 0.70, 0.50), ring * 0.55);
                base *= 1 - 0.55 * sstep(0.02, 0.0, min(fr, 1 - fr));
                float ndv = max(dot(n, -rd), 0.0f);
                float dif = max(dot(n, sun), 0.0f);
                float hgt = 0.55 + 0.45 * sstep(0, 9, p.y);
                v3 lin = amb * (0.50 + 0.5 * ndv) * hgt + sunCol * (dp * (0.15 + 0.85 * dif) * 0.85);
                // lumière verte transmise, plus forte en hauteur
                lin += v3(0.35, 0.55, 0.18) * (0.35 * sstep(2, 10, p.y) * (0.4 + 0.6 * ndv));
                col = base * lin;
                v3 r = reflect(rd, n);
                col += sunCol * (0.10 * dp * powf(max(dot(r, sun), 0.0f), 18)) + v3(0.6, 0.8, 0.5) * (0.06 * powf(1 - ndv, 3) * hgt);
                // base sombre près du sol
                col *= 0.45 + 0.55 * sstep(0, 1.2, p.y);
            }
        }
        // brume lumineuse + rayons de soleil
        float e = 1 - expf(-tfog * 0.020);
        v3 fc = fogCol * mixf(0.38, 1.15, sstep(-0.25, 0.30, rd.y));
        col = mix(col, fc, sat(e));
        float shaft = 0;
        float tl = min(best, 34.0f);
        const int NS = 14;
        float jit = h2((int)(rd.x * 4000) + (int)(time * 24) * 131, (int)(rd.y * 4000));
        for (int i = 0; i < NS; i++) {
            float t = tl * (i + jit) / NS;
            v3 q = ro + rd * t;
            if (q.y > YC) break;
            float qx = q.x - sun.x * q.y / sun.y, qz = q.z - sun.z * q.y / sun.y;
            float a = vn2(qx * 0.55, qz * 0.55) * 0.72 + vn2(qx * 2.3 + 9, qz * 2.3) * 0.28;
            shaft += sstep(0.54, 0.74, a) * expf(-t * 0.03);
        }
        col += v3(1.0, 0.93, 0.66) * (shaft * tl / NS * 0.011);
        return col;
    }
};

// =====================================================================================
// 5. Grand torii dans la mer au coucher du soleil (unités : m)
// =====================================================================================
struct Torii : Scene {
    HMap M;
    Sky S; Fog F;
    v3 sun, sunCol, amb;

    static float terr(float x, float z) {
        float coast = z + 1700 * fbm2(x * 0.00022, 3.3, 3) + 500 * fbm2(x * 0.0009, z * 0.0009, 3);
        float land = sstep(-4200, -8200, coast);
        float m = powf(0.5 + 0.5 * fbm2(x * 0.00017 + 1.9, z * 0.00017 + 4.4, 7), 1.5) * (0.55 + 0.75 * powf(1 - fabsf(gn2(x * 0.00045, z * 0.00045)), 2));
        // île sur la gauche
        float ix = x + 9500, iz = z + 2500;
        float isl = sstep(4200, 1200, sqrtf(ix * ix * 0.6 + iz * iz) + 800 * fbm2(x * 0.0005, z * 0.0005, 3));
        return max(land * (60 + 1350 * m), isl * (40 + 800 * m)) - 3;
    }
    static float map(v3 p, int &mat) {
        float d;
        mat = 1;
        v3 q = p;
        q.x = fabsf(q.x);
        // piliers principaux, légèrement inclinés vers l'intérieur
        { v3 a = q; a.x -= 5.7 - 0.022 * p.y; d = sdCyl(a, 0.64 - 0.009 * p.y, 13.4); }
        // piliers d'appui et leurs chapeaux
        {
            v3 a = q; a.z = fabsf(a.z); a.x -= 5.7; a.z -= 3.5;
            float dd = sdCyl(a, 0.37, 7.3);
            if (dd < d) { d = dd; mat = 1; }
            dd = sdBox(a - v3(0, 7.46, 0), v3(0.78, 0.15, 0.78));
            if (dd < d) { d = dd; mat = 2; }
        }
        // entretoises entre piliers (selon z)
        {
            float dd = min(sdBox(q - v3(5.64, 4.3, 0), v3(0.17, 0.30, 3.8)), sdBox(q - v3(5.60, 6.3, 0), v3(0.17, 0.30, 3.8)));
            if (dd < d) { d = dd; mat = 1; }
        }
        // nuki (traverse basse)
        { float dd = sdBox(p - v3(0, 10.7, 0), v3(7.7, 0.46, 0.30)); if (dd < d) { d = dd; mat = 1; } }
        // gakuzuka (tablette centrale)
        { float dd = sdBox(p - v3(0, 12.2, 0), v3(0.78, 1.06, 0.2)); if (dd < d) { d = dd; mat = 3; } }
        // shimagi, kasagi et toit, avec la courbure caractéristique
        float cy = 0.0066 * p.x * p.x;
        { float dd = sdBox(p - v3(0, 13.76 + cy, 0), v3(10.7, 0.50, 0.50)) * 0.85; if (dd < d) { d = dd; mat = 1; } }
        { float dd = sdBox(p - v3(0, 14.76 + cy * 1.05, 0), v3(11.7, 0.50, 0.64)) * 0.85; if (dd < d) { d = dd; mat = 1; } }
        { float dd = sdBox(p - v3(0, 15.44 + cy * 1.1, 0), v3(12.1, 0.17, 1.02)) * 0.85; if (dd < d) { d = dd; mat = 2; } }
        return d;
    }
    void init() override {
        M.build(1024, 0, -6000, 52000, terr);
        float az = 24 * PI / 180, el = 6.2 * PI / 180;
        sun = normalize(v3(sinf(az) * cosf(el), sinf(el), -cosf(az) * cosf(el)));
        sunCol = v3(1.0, 0.50, 0.20) * 3.0;
        amb = v3(0.36, 0.30, 0.42) * 0.9;
        S.sun = sun; S.zen = v3(0.08, 0.11, 0.38); S.hor = v3(0.86, 0.34, 0.10); S.hazeExp = 0.55;
        S.sunCol = v3(1.0, 0.62, 0.28) * 1.7; S.glow = v3(1.0, 0.36, 0.06) * 0.6; S.glowPow = 6; S.glowFall = 8; S.discI = 60; S.haloI = 0.9;
        S.cAmt = 0.92; S.cH = 3200; S.cScale = 0.00016; S.cStretch = 2.0; S.cCover = 0.47; S.cSoft = 0.24;
        S.cLit = v3(1.0, 0.42, 0.20) * 1.3; S.cDark = v3(0.20, 0.15, 0.32); S.wind = v3(0.010, 0, 0.004);
        F.a = 0.00006; F.b = 0.0018; F.c = 0.000010; F.col = v3(0.80, 0.40, 0.22); F.sunCol = v3(1.0, 0.55, 0.20) * 1.4; F.sunPow = 5;
        exposure = 0.80; bloom = 0.5;
    }
    void setup(float time, float u, float aspect, Cam &c) override {
        v3 ro(-11 + 5 * u, 1.75 + 0.25 * u, 70 - 8 * u);
        c.look(ro, v3(2.2 - 0.6 * u, 7.4, 0), 40, aspect);
    }
    bool traceTorii(v3 ro, v3 rd, float tmaxIn, float &tOut, int &mat) const {
        v3 bmin(-12.8, -0.2, -4.6), bmax(12.8, 17.4, 4.6);
        float t0 = 0, t1 = tmaxIn;
        const float o[3] = {ro.x, ro.y, ro.z}, d[3] = {rd.x, rd.y, rd.z}, mn[3] = {bmin.x, bmin.y, bmin.z}, mx[3] = {bmax.x, bmax.y, bmax.z};
        for (int a = 0; a < 3; a++) {
            if (fabsf(d[a]) < 1e-7) { if (o[a] < mn[a] || o[a] > mx[a]) return false; continue; }
            float ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
            if (ta > tb) std::swap(ta, tb);
            t0 = max(t0, ta); t1 = min(t1, tb);
        }
        if (t0 >= t1) return false;
        float t = t0;
        for (int i = 0; i < 120 && t < t1; i++) {
            float dd = map(ro + rd * t, mat);
            if (dd < 0.003 + 0.0006 * t) { tOut = t; return true; }
            t += dd;
        }
        return false;
    }
    v3 toriiCol(v3 p, v3 rd, int mat) const {
        int mm;
        const float e = 0.01;
        v3 n = normalize(v3(map(p + v3(e, 0, 0), mm) - map(p - v3(e, 0, 0), mm), map(p + v3(0, e, 0), mm) - map(p - v3(0, e, 0), mm),
                            map(p + v3(0, 0, e), mm) - map(p - v3(0, 0, e), mm)));
        float ao = 1;
        for (int k = 1; k <= 4; k++) { float hh = 0.25 * k; ao -= (hh - map(p + n * hh, mm)) * 0.40 / k; }
        ao = sat(ao);
        // ombre douce vers le soleil
        float shd = 1, t = 0.08;
        for (int i = 0; i < 26 && t < 30; i++) {
            float dd = map(p + n * 0.02 + sun * t, mm);
            shd = min(shd, 10 * dd / t);
            if (shd < 0.01) break;
            t += clampf(dd, 0.05, 1.5);
        }
        shd = sat(shd);
        float wn = vn3(p.x * 2.1, p.y * 0.6, p.z * 2.1) * 0.6 + vn3(p.x * 9, p.y * 3, p.z * 9) * 0.4;
        v3 base;
        if (mat == 1) {
            base = mix(v3(0.60, 0.085, 0.030), v3(0.74, 0.15, 0.05), wn);
            // marques de marée au pied des piliers
            float tide = sstep(3.0 + 0.5 * wn, 2.0, p.y);
            base = mix(base, v3(0.16, 0.085, 0.055), tide * 0.85);
            base = mix(base, v3(0.42, 0.33, 0.27), 0.5 * sstep(0.45, 0.0, fabsf(p.y - 3.0 - 0.4 * wn)));
        } else if (mat == 2) base = v3(0.060, 0.050, 0.045) * (0.7 + 0.6 * wn);
        else base = mix(v3(0.05, 0.045, 0.04), v3(0.55, 0.40, 0.12), sstep(0.25, 0.2, max(fabsf(p.x) - 0.3f, fabsf(p.y - 12.2f) - 0.6f)));
        v3 lin = sunCol * (max(dot(n, sun), 0.0f) * shd) + amb * (0.45 + 0.55 * (0.5 + 0.5 * n.y)) * ao + v3(1.0, 0.50, 0.24) * (0.55 * max(-n.y, 0.0f) * ao) +
                 v3(1.0, 0.55, 0.30) * (0.35 * sat(0.4 - 0.6 * n.z) * ao);
        v3 col = base * lin;
        float rim = powf(1 - max(dot(n, -rd), 0.0f), 4);
        col += sunCol * (0.05 * rim * sat(0.3 + dot(n, sun)));
        return col;
    }
    v3 world(v3 ro, v3 rd, float tmax, float time, float &t, bool refl) const {
        int mat;
        float tt;
        if (traceTorii(ro, rd, tmax, tt, mat)) {
            t = tt;
            return F.apply(toriiCol(ro + rd * tt, rd, mat), ro, rd, tt, sun);
        }
        float tT;
        if (rd.y < 0.08 && traceH(M, ro, rd, 800, min(tmax, 45000.0f), tT, 0.0012, refl ? 90 : 200)) {
            t = tT;
            v3 p = ro + rd * tT;
            v3 n = M.nrm(p.x, p.z, 60);
            v3 g = mix(v3(0.030, 0.050, 0.030), v3(0.055, 0.075, 0.04), 0.5 + 0.5 * fbm2(p.x * 0.002, p.z * 0.002, 4));
            v3 col = g * (sunCol * max(dot(n, sun), 0.0f) + amb * (0.5 + 0.5 * n.y));
            return F.apply(col, ro, rd, tT, sun);
        }
        t = -1;
        return S.eval(ro, rd, time);
    }
    v3 shade(const v3 &ro, const v3 &rd, float time) override {
        float tw = rd.y < -1e-5 ? -ro.y / rd.y : 1e9;
        float t;
        v3 col = world(ro, rd, min(tw, 1e6f), time, t, false);
        if (t > 0 || tw > 1e8) return col;
        v3 p = ro + rd * tw;
        float amp = 0.20 / (1 + tw * 0.012) + 0.035;
        v3 n = waterN(p.x * 0.55, p.z * 0.55, time * 1.3, amp);
        v3 n2 = waterN(p.x * 0.11 + 7, p.z * 0.11, time * 0.6, 0.10 / (1 + tw * 0.004));
        n = normalize(v3(n.x + n2.x, 1, n.z + n2.z));
        v3 r = reflect(rd, n);
        if (r.y < 0.006) { r.y = 0.006; r = normalize(r); }
        float t2;
        v3 rc = world(p + v3(0, 0.01, 0), r, 1e6, time, t2, true);
        float fres = 0.03 + 0.97 * powf(1 - max(dot(-rd, n), 0.0f), 5);
        v3 body = v3(0.030, 0.050, 0.065) + v3(0.10, 0.05, 0.03) * powf(max(dot(rd, sun), 0.0f), 3);
        col = mix(body, rc, fres);
        // mouillage sombre au contact des piliers
        return F.apply(col, ro, rd, tw, sun);
    }
};
