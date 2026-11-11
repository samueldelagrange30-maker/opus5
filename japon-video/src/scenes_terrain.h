// Scènes de relief : mer de nuages, mont Fuji (matin), pagode à l'heure bleue, rizières en terrasses
#pragma once
#include "core.h"

// =====================================================================================
// 1. Mer de nuages sur les Alpes japonaises, lever du soleil, forêts d'automne (unités : km)
// =====================================================================================
struct Unkai : Scene {
    HMap M, C;
    Sky S; Fog F;
    v3 sun, sunCol, amb, cp;
    float cbase = 1, yaw = 0;

    static float terr(float x, float z) {
        float wx = fbm2(x * 0.07 + 5.2, z * 0.07 + 1.3, 3), wz = fbm2(x * 0.07 - 2.8, z * 0.07 + 7.1, 3);
        float px = x + wx * 3, pz = z + wz * 3;
        float s = 0, a = 1, f = 0.105, w = 1;
        for (int i = 0; i < 9; i++) {
            float n = 1 - fabsf(gn2(px * f, pz * f));
            n *= n;
            s += n * a * w;
            w = sat(n * 1.5);
            a *= 0.5; f *= 2.03;
            float nx = 0.8 * px - 0.6 * pz + 11.3, nz = 0.6 * px + 0.8 * pz - 4.7;
            px = nx; pz = nz;
        }
        return s * 1.2 + 0.25 * fbm2(x * 0.05, z * 0.05, 3);
    }
    static float cloudBase(float x, float z) {
        return 0.13 * fbm2(x * 0.14, z * 0.14, 5) + 0.11 * (1 - fabsf(gn2(x * 0.42, z * 0.42))) + 0.045 * (1 - fabsf(gn2(x * 1.3, z * 1.3))) + 0.015 * (1 - fabsf(gn2(x * 3.7, z * 3.7)));
    }
    inline float cloudH(float x, float z, float time) const {
        return cbase + C.get(x + 0.03 * time, z + 0.012 * time) + 0.01 * vn2(x * 7 + time * 0.06, z * 7);
    }
    void init() override {
        M.wrap = true; C.wrap = true;
        M.build(2048, 0, 0, 44, terr);
        C.build(1024, 0, 0, 44, cloudBase);
        // point de vue : le plus haut sommet proche du centre
        float best = -1e9;
        for (float z = -6; z <= 6; z += 0.05)
            for (float x = -6; x <= 6; x += 0.05) {
                float h = M.get(x, z);
                if (h > best) { best = h; cp = v3(x, h, z); }
            }
        cp.y += 0.035;
        cbase = cp.y - 0.88;
        yaw = 0.6;
        float sa = yaw + 0.23, el = 4.2 * PI / 180;
        sun = normalize(v3(cosf(sa) * cosf(el), sinf(el), sinf(sa) * cosf(el)));
        sunCol = v3(1.0, 0.56, 0.30) * 3.4;
        amb = v3(0.22, 0.27, 0.42) * 0.9;
        M.bake(sun, 0.03);
        S.sun = sun; S.zen = v3(0.07, 0.17, 0.50); S.hor = v3(0.95, 0.47, 0.22); S.hazeExp = 0.50;
        S.sunCol = v3(1.0, 0.72, 0.42) * 1.5; S.glow = v3(1.0, 0.45, 0.12) * 0.85; S.glowPow = 5; S.glowFall = 9; S.discI = 45;
        S.cAmt = 0.75; S.cH = 9; S.cScale = 0.035; S.cStretch = 2.6; S.cCover = 0.5; S.cSoft = 0.3;
        S.cLit = v3(1.0, 0.72, 0.55) * 1.1; S.cDark = v3(0.45, 0.40, 0.55);
        F.a = 0.05; F.b = 0.9; F.c = 0.004; F.col = v3(0.62, 0.44, 0.42); F.sunCol = v3(1.0, 0.60, 0.30) * 1.2; F.sunPow = 5;
        exposure = 0.85; bloom = 0.28;
    }
    void setup(float time, float u, float aspect, Cam &c) override {
        v3 fw(cosf(yaw), 0, sinf(yaw)), rt(-sinf(yaw), 0, cosf(yaw));
        v3 ro = cp + rt * (0.10 * (u - 0.5)) + v3(0, 0.012 * u, 0) - fw * (0.02 * (1 - u));
        c.look(ro, ro + fw * 10 + v3(0, -0.52, 0), 46, aspect);
    }
    v3 terrainCol(v3 p, v3 rd, float t) const {
        v3 n = M.nrm(p.x, p.z, max(0.03f, t * 0.004f));
        float lod = sat(1.25 - t / 3.0);
        float id = 0.5, w = 0.5;
        if (lod > 0) w = worley(p.x * 75, p.z * 75, &id);
        float big = 0.5 + 0.5 * fbm2(p.x * 1.3, p.z * 1.3, 3);
        // palette d'automne : érables rouges, orangés, mélèzes dorés, conifères
        float k = fract(id * 0.999 + big * 0.35);
        v3 leaf = k < 0.28 ? v3(0.27, 0.045, 0.022) : k < 0.52 ? v3(0.36, 0.13, 0.03) : k < 0.74 ? v3(0.38, 0.27, 0.055) : v3(0.035, 0.08, 0.03);
        v3 avg = mix(v3(0.27, 0.13, 0.04), v3(0.09, 0.10, 0.04), big * 0.7);
        leaf = mix(avg, leaf, lod);
        leaf *= mixf(1, 0.5 + 0.7 * sstep(0.75, 0.1, w), lod);
        float alt = p.y;
        v3 rock = mix(v3(0.20, 0.18, 0.17), v3(0.30, 0.27, 0.25), 0.5 + 0.5 * fbm2(p.x * 9, p.z * 9, 3));
        float tl = M.maxh * 0.80 + 0.06 * fbm2(p.x * 2.1, p.z * 2.1, 3);
        float steep = sstep(0.80, 0.62, n.y);
        v3 col = mix(leaf, rock, max(sstep(tl - 0.06, tl + 0.08, alt), steep * 0.85));
        float snow = sstep(M.maxh * 0.90, M.maxh * 0.97, alt + 0.05 * fbm2(p.x * 5, p.z * 5, 3)) * sstep(0.55, 0.8, n.y);
        col = mix(col, v3(0.85, 0.87, 0.92), snow);
        float sh = M.shadow(p.x, p.z);
        float dif = max(dot(n, sun), 0.0f) * sh;
        v3 lin = sunCol * dif + amb * (0.45 + 0.55 * n.y) + sunCol * (0.06 * sat(0.5 + 0.5 * dot(n, sun)));
        return col * lin;
    }
    v3 shade(const v3 &ro, const v3 &rd, float time) override {
        float tT = 1e9, tC = 1e9;
        bool hT = traceH(M, ro, rd, 0.004, 75, tT, 0.0012, 280);
        float cmax = cbase + 0.42;
        bool hC = traceF([&](float x, float z) { return cloudH(x, z, time); }, cmax, ro, rd, 0.01, hT ? tT : 90.0f, tC, 0.002, 160);
        if (!hT && !hC) return S.eval(ro, rd, time);
        v3 tcol(0), col;
        float t;
        if (hT) tcol = terrainCol(ro + rd * tT, rd, tT);
        if (hC) {
            v3 p = ro + rd * tC;
            const float e = 0.05;
            float hx = cloudH(p.x + e, p.z, time) - cloudH(p.x - e, p.z, time), hz = cloudH(p.x, p.z + e, time) - cloudH(p.x, p.z - e, time);
            v3 n = normalize(v3(-hx, 2 * e, -hz));
            float wrapL = sat(dot(n, sun) * 4.0 + 0.12);
            float ao = sstep(cbase - 0.02, cbase + 0.26, p.y);
            float fwd = powf(max(dot(rd, sun), 0.0f), 6);
            v3 ccol = mix(v3(0.22, 0.26, 0.44), v3(1.0, 0.70, 0.50) * 1.0, wrapL * (0.30 + 0.70 * ao)) + v3(1.0, 0.55, 0.25) * (0.45 * fwd * ao);
            float alpha = hT ? sat(1 - expf(-max(tT - tC, 0.0f) * 16)) : 1;
            col = mix(tcol, ccol, alpha);
            t = tC;
        } else {
            col = tcol; t = tT;
        }
        return F.apply(col, ro, rd, t, sun);
    }
};

// =====================================================================================
// 2 & 6. Mont Fuji : matin sur le lac / pagode et cerisiers à l'heure bleue (unités : km)
// =====================================================================================
struct FujiBase : Scene {
    static HMap M;
    Sky S; Fog F;
    v3 sun, sunCol, amb;

    static float gully(float x, float z) {
        float r = sqrtf(x * x + z * z) + 1e-4;
        float cx = x / r * 5.5, cz = z / r * 5.5;
        float s = 0, a = 0.5, f = 1;
        for (int i = 0; i < 5; i++) {
            s += a * vn3(cx * f, cz * f, r * 0.2 * f + i * 7.3);
            a *= 0.5; f *= 2.1;
        }
        return s / 0.97;
    }
    static float lakeMask(float x, float z) {
        float lx = x / 9.5, lz = (z - 18.7) / 2.0;
        float ld = sqrtf(lx * lx + lz * lz) + 0.16 * fbm2(x * 0.45, z * 0.45, 4);
        return 1 - sstep(0.78, 1.12, ld);
    }
    static float terr(float x, float z) {
        float r = sqrtf(x * x + z * z);
        float cone = 3.08 * expf(-r / 4.35);
        float top = 2.86 + 0.035 * fbm2(x * 3, z * 3, 3);
        // min lissé pour arrondir le bord du cratère
        float k = 0.12, hmix = sat(0.5 + 0.5 * (top - cone) / k);
        float f = mixf(top, cone, hmix) - k * hmix * (1 - hmix);
        f -= 0.07 * sstep(0.32, 0.0, r);
        float gu = gully(x, z);
        f += (gu - 0.5) * 0.30 * sstep(0.15, 1.6, r) * expf(-r / 5.5);
        f += 0.02 * fbm2(x * 1.7, z * 1.7, 5) * sstep(0.5, 3, r);
        float hills = 0.5 + 0.5 * fbm2(x * 0.17 + 3.1, z * 0.17 - 1.7, 8);
        hills = powf(hills, 1.4);
        float band = sstep(10.5, 13.0, z) * (1 - sstep(16.0, 17.2, z));
        float corridor = (1 - sstep(3.5, 7.5, fabsf(x))) * sstep(4, 8, z);
        float hh = hills * (0.10 + 0.16 * sstep(6, 12, z) + 0.95 * sstep(1.0, 4.2, fabsf(x)) * band + 0.9 * sstep(8, 15, r) * (1 - corridor));
        f += hh;
        float lake = lakeMask(x, z);
        return mixf(f, -0.06, lake);
    }
    static void initMap() {
        if (M.n) return;
        M.build(2048, 0, 4, 52, terr);
    }
    // couleur du relief ; dusk = heure bleue (pas de soleil direct, lumières de la vallée)
    v3 terrainCol(v3 p, v3 rd, float t, bool dusk, float time) const {
        v3 n = M.nrm(p.x, p.z, max(0.035f, t * 0.006f));
        float alt = p.y;
        float nz = fbm2(p.x * 6, p.z * 6, 4);
        v3 forest = mix(v3(0.014, 0.034, 0.018), v3(0.034, 0.062, 0.026), 0.5 + 0.5 * nz);
        float nearF = sat(1.5 - t / 4.0);
        if (nearF > 0) forest *= mixf(1, 0.62 + 0.75 * sstep(0.9, 0.15, worley(p.x * 70, p.z * 70)), nearF);
        // touches de printemps (feuillus clairs, cerisiers) près des rives
        float sp = sstep(0.25, 0.6, vn2(p.x * 14, p.z * 14)) * sstep(0.45, 0.0, alt) * sat(1.6 - t / 2.5);
        forest = mix(forest, v3(0.07, 0.11, 0.035), sp * 0.45);
        float pk = sstep(0.62, 0.80, vn2(p.x * 150 + 7, p.z * 150)) * sstep(0.07, 0.01, alt) * sat(1.6 - t / 2.5);
        forest = mix(forest, v3(0.50, 0.33, 0.37), pk * 0.75);
        v3 rock = mix(v3(0.13, 0.095, 0.09), v3(0.21, 0.16, 0.145), 0.5 + 0.5 * nz);
        float treeline = 1.42 + 0.14 * nz;
        v3 col = mix(forest, rock, sstep(treeline - 0.12, treeline + 0.18, alt));
        float gu = gully(p.x, p.z);
        float snowline = 1.92 + 1.5 * (gu - 0.5) + 0.07 * fbm2(p.x * 14, p.z * 14, 3);
        float snow = sstep(snowline - 0.06, snowline + 0.14, alt);
        col = mix(col, v3(0.90, 0.92, 0.96), snow);
        v3 lin;
        if (!dusk) {
            float sh = M.shadow(p.x, p.z);
            float dif = max(dot(n, sun), 0.0f) * sh;
            lin = sunCol * dif + amb * (0.5 + 0.5 * n.y) + sunCol * (0.05 * sat(0.5 + 0.5 * dot(n, sun)));
        } else {
            lin = amb * (0.45 + 0.55 * n.y) + sunCol * (0.10 * sat(0.15 + 0.85 * dot(n, sun)));
        }
        col = col * lin;
        if (dusk) {
            // lumières de la ville dans la vallée
            float r = sqrtf(p.x * p.x + p.z * p.z);
            float town = sstep(0.62, 0.30, alt) * sstep(4.8, 6.5, r) * sstep(0.42, 0.70, vn2(p.x * 0.8 + 3, p.z * 0.8)) * sat(1 - lakeMask(p.x, p.z) * 4);
            if (town > 0.01) {
                float gx = p.x * 95, gz = p.z * 95;
                int ix = (int)floorf(gx), iz = (int)floorf(gz);
                float hsh1 = h2(ix, iz);
                if (hsh1 < 0.16 * town) {
                    float fx = gx - ix - 0.5 - 0.5 * (h2(ix + 9, iz) - 0.5), fz = gz - iz - 0.5 - 0.5 * (h2(ix, iz + 9) - 0.5);
                    float d = sqrtf(fx * fx + fz * fz);
                    float tw = 0.75 + 0.25 * sinf(time * (2 + 5 * hsh1) + hsh1 * 40);
                    v3 lc = h2(ix + 3, iz + 5) < 0.75 ? v3(1.0, 0.62, 0.28) : v3(0.85, 0.9, 1.0);
                    col += lc * (5.0 * tw * sstep(0.26, 0.02, d));
                }
                col += v3(1.0, 0.6, 0.3) * (0.012 * town);
            }
        }
        return col;
    }
};
HMap FujiBase::M;

struct FujiDawn : FujiBase {
    void init() override {
        initMap();
        sun = normalize(v3(-0.72, 0.33, 0.46));
        sunCol = v3(1.0, 0.92, 0.80) * 3.0;
        amb = v3(0.24, 0.36, 0.60) * 0.75;
        M.bake(sun, 0.035);
        S.sun = sun; S.zen = v3(0.07, 0.22, 0.66); S.hor = v3(0.60, 0.75, 0.95); S.hazeExp = 0.50;
        S.sunCol = v3(1.0, 0.9, 0.8); S.glow = v3(1.0, 0.85, 0.7) * 0.18; S.glowPow = 3; S.glowFall = 6; S.discI = 0; S.haloI = 0.5;
        S.cAmt = 0.75; S.cH = 7; S.cScale = 0.045; S.cStretch = 2.2; S.cCover = 0.58; S.cSoft = 0.26;
        S.cLit = v3(1.0, 0.98, 0.96) * 1.15; S.cDark = v3(0.58, 0.64, 0.78); S.wind = v3(0.012, 0, 0.004);
        F.a = 0.020; F.b = 1.0; F.c = 0.0020; F.col = v3(0.60, 0.73, 0.93); F.sunCol = v3(0.90, 0.90, 0.92); F.sunPow = 4;
        exposure = 0.9; bloom = 0.15;
    }
    void setup(float time, float u, float aspect, Cam &c) override {
        v3 ro(-0.35 + 0.55 * u, 0.0032 + 0.0030 * u, 20.05 - 0.10 * u);
        c.look(ro, v3(0.05, 0.46 - 0.04 * u, 0), 40 - 2.0 * u, aspect);
    }
    v3 world(v3 ro, v3 rd, float tmax, float time, float &t, bool refl) const {
        float tT;
        if (traceH(M, ro, rd, 0.002, tmax, tT, 0.0014, refl ? 220 : 520)) {
            t = tT;
            return F.apply(terrainCol(ro + rd * tT, rd, tT, false, time), ro, rd, tT, sun);
        }
        t = -1;
        return S.eval(ro, rd, time);
    }
    v3 shade(const v3 &ro, const v3 &rd, float time) override {
        float tw = rd.y < -1e-5 ? -ro.y / rd.y : 1e9;
        float t;
        v3 col = world(ro, rd, min(tw, 80.0f), time, t, false);
        if (t > 0 || tw > 1e8) return col;
        // lac
        v3 p = ro + rd * tw;
        float streak = 0.35 + 1.3 * sstep(0.38, 0.72, vn2(p.x * 1.3 + time * 0.01, p.z * 7));
        float amp = 0.0050 * streak / (1 + tw * 1.2) + 0.0005;
        v3 n = waterN(p.x * 330, p.z * 330, time, amp);
        // lissage vertical du reflet avec la distance (micro-rugosité)
        v3 r = reflect(rd, n);
        if (r.y < 0.004) { r.y = 0.004; r = normalize(r); }
        float t2;
        v3 rc = world(p + v3(0, 1e-4, 0), r, 80, time, t2, true);
        float fres = 0.02 + 0.98 * powf(1 - max(dot(-rd, n), 0.0f), 5);
        v3 body = v3(0.010, 0.040, 0.055);
        col = mix(body, rc, fres);
        return F.apply(col, ro, rd, tw, sun);
    }
    void overlay(std::vector<v3> &img, int W, int H, float time) override {
        petals(img, W, H, time, 34, v3(0.98, 0.80, 0.84), 1.0, 11);
    }
};

struct PagodaDusk : FujiBase {
    v3 cam0, pbase, fw0, rt0, moon;
    float canopyY;

    // pagode à cinq étages (mètres, base y=0)
    static float pagoda(v3 p, int &mat) {
        float d = sdBox(p - v3(0, 0.5, 0), v3(4.3, 0.5, 4.3));
        mat = 4;
        float m = max(fabsf(p.x), fabsf(p.z)), mn = min(fabsf(p.x), fabsf(p.z));
        for (int i = 0; i < 5; i++) {
            float w = 2.9 - 0.30 * i, yb = 1.0 + i * 4.3;
            float dd = sdBox(p - v3(0, yb + 1.6, 0), v3(w, 1.6, w));
            if (dd < d) { d = dd; mat = 1; }
            // balustrade
            dd = sdBox(p - v3(0, yb + 0.45, 0), v3(w + 0.55, 0.38, w + 0.55));
            if (i > 0 && dd < d) { d = dd; mat = 3; }
            float W = w + 2.7 - 0.10 * i;
            float corner = sstep(0.55, 1.0, mn / max(m, 1e-3f)) * sstep(W - 2.2, W, m);
            float yc = yb + 3.2 + 0.36 * (W - m) + 0.55 * corner * corner;
            dd = max(m - W, fabsf(p.y - yc) - 0.14f) * 0.72;
            if (dd < d) { d = dd; mat = 2; }
        }
        // flèche (sōrin)
        v3 q = p - v3(0, 23.6, 0);
        float rr = 0.20;
        if (q.y > 1.2 && q.y < 5.8) rr += 0.42 * sstep(0.0, 0.25, fabsf(fract(q.y * 1.7) - 0.5) * 2 - 0.35) * (1 - 0.1 * (q.y - 1.2));
        float dd = sdCyl(q, rr, 7.2) * 0.6;
        if (dd < d) { d = dd; mat = 5; }
        return d;
    }
    float canopy(float x, float z, bool fine = true) const {
        // cimes de cerisiers en fleurs au premier plan (hauteur en km)
        float df = (x - cam0.x) * fw0.x + (z - cam0.z) * fw0.z, dr = (x - cam0.x) * rt0.x + (z - cam0.z) * rt0.z;
        float edge = sstep(0.012, 0.028, df) * (1 - sstep(0.19, 0.24, df + 0.02 * gn2(x * 60, z * 60)));
        float lx = x - cam0.x, lz = z - cam0.z; // coordonnées locales (précision flottante)
        float w = min(worley(lx * 115, lz * 115), 1.0f);
        float bump = sqrtf(1.02 - w * w) * 0.0034 + (fine ? 0.0011 * fbm2(lx * 900, lz * 900, 5) : 0.0f);
        float big = 0.0030 * fbm2(lx * 30, lz * 30, 2);
        float y = canopyY - 0.050 * df + big + bump;
        return y - (1 - edge) * 0.035;
    }
    void init() override {
        initMap();
        cam0 = v3(4.6, 0, 12.4);
        cam0.y = max(M.get(cam0.x, cam0.z) + 0.06f, 0.46f);
        v3 ta(0.35, 1.02, 0);
        fw0 = normalize(v3(ta.x - cam0.x, 0, ta.z - cam0.z));
        rt0 = v3(-fw0.z, 0, fw0.x);
        rt0 = normalize(cross(fw0, v3(0, 1, 0)));
        pbase = cam0 + fw0 * 0.058 + rt0 * 0.0125;
        pbase.y = cam0.y - 0.0142;
        canopyY = cam0.y - 0.0072;
        // lueur du couchant derrière le Fuji, légèrement à droite
        float ga = atan2f(fw0.z, fw0.x) + 0.42;
        sun = normalize(v3(cosf(ga), 0.03, sinf(ga)));
        sunCol = v3(1.0, 0.50, 0.26) * 0.55;
        amb = v3(0.10, 0.15, 0.30) * 1.15;
        float ma = atan2f(fw0.z, fw0.x) - 0.30;
        moon = normalize(v3(cosf(ma), 0.36, sinf(ma)));
        S.sun = sun; S.zen = v3(0.018, 0.045, 0.17); S.hor = v3(0.20, 0.13, 0.24); S.hazeExp = 0.36;
        S.sunCol = v3(1.0, 0.55, 0.25); S.glow = v3(1.25, 0.46, 0.13) * 1.0; S.glowPow = 3.2; S.glowFall = 8.5; S.discI = 0; S.haloI = 0.0;
        S.cAmt = 0.7; S.cH = 6; S.cScale = 0.05; S.cStretch = 2.4; S.cCover = 0.56; S.cSoft = 0.28;
        S.cLit = v3(0.75, 0.33, 0.22); S.cDark = v3(0.06, 0.07, 0.15); S.wind = v3(0.010, 0, 0.004);
        F.a = 0.07; F.b = 2.2; F.c = 0.003; F.col = v3(0.08, 0.10, 0.21); F.sunCol = v3(0.42, 0.20, 0.15); F.sunPow = 9;
        exposure = 1.45; bloom = 0.45;
    }
    void setup(float time, float u, float aspect, Cam &c) override {
        v3 ro = cam0 + rt0 * (0.006 * (u - 0.5)) + v3(0, 0.0015 * u, 0) + fw0 * (0.004 * u);
        c.look(ro, v3(0.35, 1.02, 0), 50, aspect);
    }
    v3 skyDusk(v3 ro, v3 rd, float time) const {
        v3 col = S.eval(ro, rd, time);
        // étoiles
        if (rd.y > 0.12) {
            float a = atan2f(rd.z, rd.x) * 170, b = asinf(rd.y) * 170;
            int ia = (int)floorf(a), ib = (int)floorf(b);
            float hh = h2(ia, ib);
            if (hh < 0.035) {
                float fx = a - ia - 0.5 - 0.6 * (h2(ia + 5, ib) - 0.5), fy = b - ib - 0.5 - 0.6 * (h2(ia, ib + 5) - 0.5);
                float tw = 0.7 + 0.3 * sinf(time * (2 + 60 * hh) + hh * 900);
                col += v3(0.8, 0.85, 1.0) * (sstep(0.16, 0.0, sqrtf(fx * fx + fy * fy)) * tw * (0.3 + 20 * hh) * sstep(0.12, 0.45, rd.y) * 0.5);
            }
        }
        // croissant de lune
        float md = dot(rd, moon);
        if (md > 0.9990) {
            v3 mr = normalize(cross(moon, v3(0, 1, 0))), mu = cross(mr, moon);
            float lx = dot(rd, mr) / 0.0125, ly = dot(rd, mu) / 0.0125;
            float disc = sstep(1.0, 0.93, sqrtf(lx * lx + ly * ly));
            float cut = sstep(1.0, 0.93, sqrtf((lx + 0.42) * (lx + 0.42) + (ly - 0.30) * (ly - 0.30)) / 1.02);
            col += v3(1.0, 0.95, 0.85) * (7.0 * disc * (1 - cut)) + v3(0.3, 0.35, 0.5) * (0.10 * disc * cut);
        }
        col += v3(0.8, 0.85, 1.0) * (0.25 * powf(max(md, 0.0f), 600));
        return col;
    }
    v3 shade(const v3 &ro, const v3 &rd, float time) override {
        float tBest = 1e9;
        v3 col;
        // pagode (boîte englobante puis sphere tracing)
        {
            v3 lo = (ro - pbase) * 1000.0;
            v3 bmin(-6.2, 0, -6.2), bmax(6.2, 31.5, 6.2);
            float t0 = 0, t1 = 1e9;
            bool ok = true;
            const float o[3] = {lo.x, lo.y, lo.z}, d[3] = {rd.x, rd.y, rd.z}, mn[3] = {bmin.x, bmin.y, bmin.z}, mx[3] = {bmax.x, bmax.y, bmax.z};
            for (int a = 0; a < 3; a++) {
                if (fabsf(d[a]) < 1e-7) { if (o[a] < mn[a] || o[a] > mx[a]) ok = false; continue; }
                float ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
                if (ta > tb) std::swap(ta, tb);
                t0 = max(t0, ta); t1 = min(t1, tb);
            }
            if (ok && t0 < t1) {
                float t = t0;
                int mat = 0;
                bool hit = false;
                for (int i = 0; i < 110 && t < t1; i++) {
                    float dd = pagoda(lo + rd * t, mat);
                    if (dd < 0.0025 * (1 + t * 0.01)) { hit = true; break; }
                    t += dd;
                }
                if (hit) {
                    v3 p = lo + rd * t;
                    int mm;
                    const float e = 0.012;
                    v3 n = normalize(v3(pagoda(p + v3(e, 0, 0), mm) - pagoda(p - v3(e, 0, 0), mm), pagoda(p + v3(0, e, 0), mm) - pagoda(p - v3(0, e, 0), mm),
                                        pagoda(p + v3(0, 0, e), mm) - pagoda(p - v3(0, 0, e), mm)));
                    float ao = 1;
                    for (int k = 1; k <= 4; k++) { float hh = 0.22 * k; ao -= (hh - pagoda(p + n * hh, mm)) * 0.42 / k; }
                    ao = sat(ao);
                    v3 base;
                    if (mat == 1) {
                        // murs : boiseries vermillon et panneaux de plâtre blanc
                        float uu = fabsf(n.x) > fabsf(n.z) ? p.z : p.x;
                        float fy = fract((p.y - 1.0) / 4.3) * 4.3;
                        float panel = sstep(0.10, 0.16, fabsf(fract(uu * 0.62 + 0.5) - 0.5)) * sstep(0.5, 0.65, fy) * sstep(2.75, 2.6, fy);
                        base = mix(v3(0.50, 0.060, 0.030), v3(0.72, 0.68, 0.60), panel * 0.9);
                    } else if (mat == 2) {
                        if (n.y < 0.1) {
                            float uu = fabsf(p.x) > fabsf(p.z) ? p.z : p.x;
                            base = mix(v3(0.40, 0.06, 0.03), v3(0.50, 0.30, 0.22), sstep(0.25, 0.35, fabsf(fract(uu * 2.2) - 0.5)));
                        } else
                            base = v3(0.035, 0.040, 0.045);
                    } else if (mat == 3) base = v3(0.48, 0.06, 0.03);
                    else if (mat == 4) base = v3(0.20, 0.19, 0.18);
                    else base = v3(0.07, 0.065, 0.05);
                    // ciel du soir + lueur du couchant + éclairage chaud par le bas (illuminations)
                    v3 up = normalize(v3(-fw0.x * 0.5, -0.75, -fw0.z * 0.5));
                    v3 lin = amb * (0.35 + 0.65 * (0.5 + 0.5 * n.y)) * ao + sunCol * (0.9 * sat(dot(n, sun)) * ao) +
                             v3(1.0, 0.62, 0.30) * (0.95 * sat(dot(n, -up)) * ao * sstep(30, 2, p.y));
                    col = base * lin;
                    tBest = t * 0.001;
                    col = F.apply(col, ro, rd, tBest, sun);
                }
            }
        }
        // cimes de cerisiers
        if (rd.y < 0.05) {
            float tC;
            float cmax = canopyY + 0.02;
            if (traceF([&](float x, float z) { return canopy(x, z, false) + 0.0004f; }, cmax, ro, rd, 0.008, min(tBest, 0.4f), tC, 0.0015, 140)) {
                v3 p = ro + rd * tC;
                const float e = 0.0006;
                float hx = canopy(p.x + e, p.z, false) - canopy(p.x - e, p.z, false), hz = canopy(p.x, p.z + e, false) - canopy(p.x, p.z - e, false);
                v3 n = normalize(v3(-hx, 2 * e, -hz));
                float id;
                float lx = p.x - cam0.x, lz = p.z - cam0.z;
                float w = worley(lx * 115, lz * 115, &id);
                float fine = 0.55 * fbmv(lx * 2600, lz * 2600, 5) + 0.45 * fbmv(lx * 640 + 3, lz * 640, 4);
                v3 blossom = mix(v3(0.92, 0.50, 0.62), v3(1.0, 0.74, 0.80), id) * (0.45 + 1.1 * fine);
                float depth = sstep(1.0, 0.35, w) * (0.35 + 0.65 * sstep(0.30, 0.62, fine));
                v3 lin = amb * (0.5 + 0.5 * n.y) * 1.5 + sunCol * (0.8 * sat(0.3 + 0.7 * dot(n, sun))) + v3(1.0, 0.6, 0.3) * 0.10;
                col = blossom * lin * (0.16 + 0.84 * depth) * (0.55 + 0.45 * sstep(0.55, 0.95, n.y));
                col = F.apply(col, ro, rd, tC, sun);
                tBest = tC;
            }
        }
        if (tBest < 1e8) return col;
        float tT;
        if (traceH(M, ro, rd, 0.05, 80, tT, 0.0012, 280)) {
            v3 p = ro + rd * tT;
            v3 c = terrainCol(p, rd, tT, true, time);
            if (p.y < 0.0005) c = mix(c, v3(0.10, 0.09, 0.14), 0.8); // lac au loin
            return F.apply(c, ro, rd, tT, sun);
        }
        return skyDusk(ro, rd, time);
    }
    void overlay(std::vector<v3> &img, int W, int H, float time) override {
        petals(img, W, H, time, 30, v3(0.86, 0.72, 0.80), -0.8, 23);
    }
};

// =====================================================================================
// 4. Rizières en terrasses (tanada) vues d'un drone, après-midi (unités : m)
// =====================================================================================
struct Tanada : Scene {
    HMap M;
    Sky S; Fog F;
    v3 sun, sunCol, amb;
    float camY = 0;
    static constexpr float ST = 1.9;

    static float base(float x, float z) {
        float h = 135 * tanhf(z / 750) + 38 * fbm2(x * 0.0011 + 1.3, z * 0.0011 - 0.7, 4) + 8 * fbm2(x * 0.0055, z * 0.0055, 3);
        float r = sqrtf(x * x + z * z);
        h += 380 * sstep(800, 1900, r) * (0.6 + 0.4 * fbm2(x * 0.0021, z * 0.0021, 5));
        return h;
    }
    static float tmask(float x, float z) {
        float r = sqrtf(x * x + z * z);
        return sstep(-0.16, -0.10, fbm2(x * 0.0019 + 9.1, z * 0.0019 - 4.2, 3)) * (1 - sstep(760, 940, r + 120 * fbm2(x * 0.004, z * 0.004, 3)));
    }
    static float terr(float x, float z) {
        float h = base(x, z), m = tmask(x, z);
        float u = h / ST, fl = floorf(u), fr = u - fl;
        float ht = ST * (fl + sstep(0.86, 0.98, fr));
        float w = worley(x * 0.11, z * 0.11);
        float hf = h + 5.0 * (1 - w) * (1 - w) + 1.5 * fbm2(x * 0.05, z * 0.05, 3) + 2.0;
        return mixf(hf, ht, m);
    }
    void init() override {
        M.build(4096, 0, 0, 4200, terr);
        float el = 27 * PI / 180, az = -1.15;
        sun = normalize(v3(cosf(az) * cosf(el), sinf(el), sinf(az) * cosf(el)));
        sunCol = v3(1.0, 0.90, 0.72) * 3.0;
        amb = v3(0.30, 0.42, 0.62) * 0.75;
        M.bake(sun, 0.05);
        S.sun = sun; S.zen = v3(0.07, 0.23, 0.68); S.hor = v3(0.52, 0.70, 0.95); S.hazeExp = 0.5;
        S.sunCol = v3(1.0, 0.92, 0.78) * 1.3; S.glow = v3(1.0, 0.85, 0.6) * 0.25; S.glowPow = 4; S.glowFall = 5; S.discI = 55;
        S.cAmt = 0.95; S.cH = 1500; S.cScale = 0.00042; S.cCover = 0.50; S.cSoft = 0.16;
        S.cLit = v3(1.0, 0.98, 0.94) * 1.25; S.cDark = v3(0.52, 0.58, 0.70); S.wind = v3(0.012, 0, 0.006);
        F.a = 0.00010; F.b = 0.004; F.c = 0.00004; F.col = v3(0.58, 0.72, 0.92); F.sunCol = v3(0.98, 0.92, 0.80); F.sunPow = 6;
        camY = 0;
        for (float z = 250; z <= 420; z += 10) camY = max(camY, M.get(0, z));
        camY += 24;
        exposure = 0.85; bloom = 0.22;
    }
    void setup(float time, float u, float aspect, Cam &c) override {
        v3 ro(-25 + 16 * u, camY - 5 * u, 400 - 50 * u);
        v3 d = normalize(v3(sun.x * 0.75 + 0.25, -0.17 + 0.02 * u, sun.z * 0.75 - 0.10));
        c.look(ro, ro + d * 100, 58, aspect);
    }
    v3 shade(const v3 &ro, const v3 &rd, float time) override {
        float t;
        if (!traceH(M, ro, rd, 2, 6500, t, 0.0010, 480)) return S.eval(ro, rd, time);
        v3 p = ro + rd * t;
        v3 n = M.nrm(p.x, p.z, 0.9);
        float sh = M.shadow(p.x, p.z);
        float m = tmask(p.x, p.z);
        float lod = sat(1 - t / 900);
        v3 col;
        if (m > 0.5) {
            float fr = fract(base(p.x, p.z) / ST);
            if (fr < 0.86 && n.y > 0.985) {
                // rizière inondée : miroir du ciel, jeunes pousses de riz
                v3 wn = normalize(v3(0.02 * (vn2(p.x * 1.3 + time * 0.7, p.z * 1.3) - 0.5), 1, 0.02 * (vn2(p.x * 1.3, p.z * 1.3 - time * 0.6) - 0.5)));
                v3 r = reflect(rd, wn);
                if (r.y < 0.03) { r.y = 0.03; r = normalize(r); }
                v3 sk = S.eval(p, r, time);
                float fres = 0.10 + 0.90 * powf(1 - max(dot(-rd, wn), 0.0f), 4);
                v3 lightD = amb + sunCol * (max(sun.y, 0.0f) * sh);
                v3 mud = v3(0.045, 0.040, 0.025) * lightD;
                col = mix(mud, sk, fres);
                float id = h2((int)floorf(base(p.x, p.z) / ST), (int)floorf(p.x * 0.01) + 31 * (int)floorf(p.z * 0.01));
                float grow = id < 0.40 ? 0.10 : id < 0.75 ? 0.42 : 0.80;
                float rows = mixf(1, sstep(0.25, 0.5, fabsf(fract(p.x * 2.2 + p.z * 0.4) - 0.5) * 2) * 1.6, sat(1 - t / 90));
                col = mix(col, v3(0.085, 0.20, 0.03) * lightD, sat(grow * rows));
                col *= 1 - 0.35 * sstep(0.78, 0.86, fr) - 0.25 * sstep(0.05, 0.0, fr);
            } else {
                // talus herbeux et sentier de crête
                v3 g = mix(v3(0.075, 0.17, 0.025), v3(0.17, 0.27, 0.05), vn2(p.x * 0.6, p.z * 0.6));
                g = mix(g, v3(0.30, 0.25, 0.15), 0.45 * sstep(0.93, 0.98, fr));
                g *= 0.8 + 0.4 * vn2(p.x * 9, p.z * 9) * lod;
                col = g * (sunCol * (max(dot(n, sun), 0.0f) * sh) + amb * (0.55 + 0.45 * n.y));
            }
        } else {
            // forêt de cèdres
            float id = 0.5, w = 0.5;
            if (lod > 0) w = worley(p.x * 0.11, p.z * 0.11, &id);
            v3 g = mix(v3(0.020, 0.060, 0.016), v3(0.055, 0.125, 0.030), id);
            g = mix(v3(0.036, 0.09, 0.023), g, lod);
            g *= mixf(1, 0.45 + 0.9 * sstep(0.85, 0.1, w), lod);
            float far = sstep(900, 1700, sqrtf(p.x * p.x + p.z * p.z));
            g = mix(g, v3(0.045, 0.10, 0.04), far);
            col = g * (sunCol * (max(dot(n, sun), 0.0f) * sh) + amb * (0.5 + 0.5 * n.y));
        }
        return F.apply(col, ro, rd, t, sun);
    }
};
