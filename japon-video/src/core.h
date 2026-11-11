// Moteur de rendu procédural — outils communs (maths, bruit, cartes de hauteur, ciel, brume)
#pragma once
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <vector>
#include <algorithm>
#include <omp.h>
using std::max;
using std::min;

static const float PI = 3.14159265f;

// ---------------------------------------------------------------- vecteurs
struct v3 {
    float x, y, z;
    v3() : x(0), y(0), z(0) {}
    explicit v3(float a) : x(a), y(a), z(a) {}
    v3(float a, float b, float c) : x(a), y(b), z(c) {}
};
static inline v3 operator+(v3 a, v3 b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
static inline v3 operator-(v3 a, v3 b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
static inline v3 operator-(v3 a) { return v3(-a.x, -a.y, -a.z); }
static inline v3 operator*(v3 a, v3 b) { return v3(a.x * b.x, a.y * b.y, a.z * b.z); }
static inline v3 operator*(v3 a, float s) { return v3(a.x * s, a.y * s, a.z * s); }
static inline v3 operator*(float s, v3 a) { return v3(a.x * s, a.y * s, a.z * s); }
static inline v3 operator/(v3 a, float s) { float i = 1 / s; return v3(a.x * i, a.y * i, a.z * i); }
static inline v3 &operator+=(v3 &a, v3 b) { a.x += b.x; a.y += b.y; a.z += b.z; return a; }
static inline v3 &operator*=(v3 &a, float s) { a.x *= s; a.y *= s; a.z *= s; return a; }
static inline v3 &operator*=(v3 &a, v3 b) { a.x *= b.x; a.y *= b.y; a.z *= b.z; return a; }
static inline float dot(v3 a, v3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static inline v3 cross(v3 a, v3 b) { return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
static inline float length(v3 a) { return sqrtf(dot(a, a)); }
static inline v3 normalize(v3 a) { float l = length(a); return l > 1e-12 ? a / l : v3(0, 1, 0); }
static inline v3 mix(v3 a, v3 b, float t) { return a + (b - a) * t; }
static inline v3 reflect(v3 i, v3 n) { return i - n * (2 * dot(i, n)); }
static inline float lum(v3 c) { return 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z; }
static inline v3 vabs(v3 a) { return v3(fabsf(a.x), fabsf(a.y), fabsf(a.z)); }
static inline v3 vmax(v3 a, float b) { return v3(max(a.x, b), max(a.y, b), max(a.z, b)); }

static inline float clampf(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
static inline float sat(float x) { return clampf(x, 0, 1); }
static inline float mixf(float a, float b, float t) { return a + (b - a) * t; }
static inline float sstep(float a, float b, float x) { float t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); }
static inline float fract(float x) { return x - floorf(x); }

// ---------------------------------------------------------------- bruit
static inline uint32_t hsh(uint32_t x) {
    x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16;
    return x;
}
static inline uint32_t hi2(int x, int y) { return hsh((uint32_t)x * 0x9E3779B1u ^ hsh((uint32_t)y + 0x7F4A7C15u)); }
static inline float h2(int x, int y) { return hi2(x, y) * (1.0 / 4294967296.0); }
static inline float h3(int x, int y, int z) {
    return hsh((uint32_t)x * 0x9E3779B1u ^ hsh((uint32_t)y * 0x85EBCA6Bu ^ hsh((uint32_t)z + 0x27D4EB2Fu))) * (1.0 / 4294967296.0);
}
static inline float fade(float t) { return t * t * t * (t * (t * 6 - 15) + 10); }

// bruit de valeur 2D, 0..1
static inline float vn2(float x, float y) {
    float fx0 = floorf(x), fy0 = floorf(y);
    int ix = (int)fx0, iy = (int)fy0;
    float u = fade(x - fx0), v = fade(y - fy0);
    float a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
    return mixf(mixf(a, b, u), mixf(c, d, u), v);
}
// bruit de valeur 3D, 0..1
static inline float vn3(float x, float y, float z) {
    float fx0 = floorf(x), fy0 = floorf(y), fz0 = floorf(z);
    int ix = (int)fx0, iy = (int)fy0, iz = (int)fz0;
    float u = fade(x - fx0), v = fade(y - fy0), w = fade(z - fz0);
    float a = mixf(mixf(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), mixf(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v);
    float b = mixf(mixf(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), mixf(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v);
    return mixf(a, b, w);
}
// bruit de gradient 2D, ~ -1..1
static float G2[64][2];
static void initNoise() {
    for (int i = 0; i < 64; i++) { G2[i][0] = cosf(i * 2 * PI / 64); G2[i][1] = sinf(i * 2 * PI / 64); }
}
static inline float gdot(int ix, int iy, float fx, float fy) {
    const float *g = G2[hi2(ix, iy) >> 26];
    return g[0] * fx + g[1] * fy;
}
static inline float gn2(float x, float y) {
    float fx0 = floorf(x), fy0 = floorf(y);
    int ix = (int)fx0, iy = (int)fy0;
    float fx = x - fx0, fy = y - fy0;
    float u = fade(fx), v = fade(fy);
    float a = gdot(ix, iy, fx, fy), b = gdot(ix + 1, iy, fx - 1, fy);
    float c = gdot(ix, iy + 1, fx, fy - 1), d = gdot(ix + 1, iy + 1, fx - 1, fy - 1);
    return mixf(mixf(a, b, u), mixf(c, d, u), v) * 1.41;
}
// fbm de gradient, ~ -1..1
static inline float fbm2(float x, float y, int oct) {
    float s = 0, a = 0.5;
    for (int i = 0; i < oct; i++) {
        s += a * gn2(x, y);
        float nx = 1.6 * x - 1.2 * y + 1.7, ny = 1.2 * x + 1.6 * y - 3.1;
        x = nx; y = ny; a *= 0.5;
    }
    return s;
}
// fbm de valeur, 0..1
static inline float fbmv(float x, float y, int oct) {
    float s = 0, a = 0.5, n = 0;
    for (int i = 0; i < oct; i++) {
        s += a * vn2(x, y); n += a;
        float nx = 1.6 * x - 1.2 * y + 5.3, ny = 1.2 * x + 1.6 * y + 1.9;
        x = nx; y = ny; a *= 0.5;
    }
    return s / n;
}
// Worley F1 (distance au point le plus proche), id de cellule optionnel
static inline float worley(float x, float y, float *id = nullptr) {
    float fx0 = floorf(x), fy0 = floorf(y);
    int ix = (int)fx0, iy = (int)fy0;
    float best = 9;
    for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++) {
            int cx = ix + dx, cy = iy + dy;
            float px = cx + h2(cx, cy), py = cy + h2(cx + 57, cy - 113);
            float d = (px - x) * (px - x) + (py - y) * (py - y);
            if (d < best) { best = d; if (id) *id = h2(cx * 3 + 11, cy * 7 - 5); }
        }
    return sqrtf(best);
}

// ---------------------------------------------------------------- carte de hauteur
struct HMap {
    int n = 0, sn = 0;
    float x0 = 0, z0 = 0, size = 1, inv = 1;
    float maxh = -1e9, minh = 1e9;
    bool wrap = false;
    std::vector<float> h, sh;

    template <class F> void build(int N, float cx, float cz, float S, F f) {
        n = N; size = S; x0 = cx - S / 2; z0 = cz - S / 2; inv = (N - 1) / S;
        h.resize((size_t)N * N);
#pragma omp parallel for schedule(dynamic, 16)
        for (int j = 0; j < N; j++)
            for (int i = 0; i < N; i++) h[(size_t)j * N + i] = f(x0 + i / inv, z0 + j / inv);
        for (float v : h) { maxh = max(maxh, v); minh = min(minh, v); }
    }
    inline void uv(float x, float z, float &u, float &v) const {
        u = (x - x0) * inv; v = (z - z0) * inv;
        float m = n - 1;
        if (wrap) {
            u = fabsf(fmodf(u, 2 * m)); if (u > m) u = 2 * m - u;
            v = fabsf(fmodf(v, 2 * m)); if (v > m) v = 2 * m - v;
        }
        u = clampf(u, 0, m - 0.001); v = clampf(v, 0, m - 0.001);
    }
    inline float get(float x, float z) const {
        float u, v; uv(x, z, u, v);
        int i = (int)u, j = (int)v;
        float fu = u - i, fv = v - j;
        const float *p = &h[(size_t)j * n + i];
        return (p[0] * (1 - fu) + p[1] * fu) * (1 - fv) + (p[n] * (1 - fu) + p[n + 1] * fu) * fv;
    }
    inline float shadow(float x, float z) const {
        if (sn == 0) return 1;
        float u, v; uv(x, z, u, v);
        u = clampf(u * 0.5, 0, sn - 1.001); v = clampf(v * 0.5, 0, sn - 1.001);
        int i = (int)u, j = (int)v;
        float fu = u - i, fv = v - j;
        const float *p = &sh[(size_t)j * sn + i];
        return (p[0] * (1 - fu) + p[1] * fu) * (1 - fv) + (p[sn] * (1 - fu) + p[sn + 1] * fu) * fv;
    }
    inline v3 nrm(float x, float z, float e) const {
        float hx = get(x + e, z) - get(x - e, z), hz = get(x, z + e) - get(x, z - e);
        return normalize(v3(-hx, 2 * e, -hz));
    }
    // ombres douces du soleil précalculées sur la carte
    void bake(v3 sun, float pen) {
        sn = n / 2; sh.assign((size_t)sn * sn, 1);
        float texel = 2 / inv;
#pragma omp parallel for schedule(dynamic, 8)
        for (int j = 0; j < sn; j++)
            for (int i = 0; i < sn; i++) {
                float x = x0 + i * texel, z = z0 + j * texel;
                float y = get(x, z) + texel * 0.25;
                float res = 1, t = texel * 1.2;
                for (int s = 0; s < 120; s++) {
                    float qx = x + sun.x * t, qy = y + sun.y * t, qz = z + sun.z * t;
                    if (qy > maxh) break;
                    float d = qy - get(qx, qz);
                    res = min(res, 0.5f + 0.5f * d / (pen * t));
                    if (res <= 0) { res = 0; break; }
                    t = t * 1.06 + texel * 0.6;
                }
                sh[(size_t)j * sn + i] = res * res * (3 - 2 * res);
            }
    }
};

// intersection rayon / champ de hauteur quelconque
template <class F>
static inline bool traceF(F hf, float maxh, v3 ro, v3 rd, float tmin, float tmax, float &tout, float prec, int maxSteps) {
    float t = tmin;
    if (ro.y > maxh) {
        if (rd.y >= 0) return false;
        t = max(t, (maxh - ro.y) / rd.y);
    }
    float pt = t, d = 1e9, pd = 1e9;
    for (int i = 0; i < maxSteps && t < tmax; i++) {
        v3 p = ro + rd * t;
        pd = d;
        d = p.y - hf(p.x, p.z);
        if (d < prec * t) {
            float a = pt, b = t;
            if (d > 0 && pd < 1e8) {
                // rayon encore au-dessus de la surface : méthode de la sécante jusqu'au croisement
                float ta = pt, da = pd, tb = t, db = d;
                for (int k = 0; k < 5 && db > 0; k++) {
                    float rate = (da - db) / (tb - ta);
                    if (rate <= 1e-9) break;
                    float tn = min(tb + db / rate, tb + (tb - ta) * 4);
                    v3 q = ro + rd * tn;
                    float dn = q.y - hf(q.x, q.z);
                    ta = tb; da = db; tb = tn; db = dn;
                }
                if (db > 0) { tout = tb; return true; }
                a = ta; b = tb;
            }
            for (int k = 0; k < 7; k++) {
                float m = (a + b) * 0.5;
                v3 q = ro + rd * m;
                if (q.y - hf(q.x, q.z) < 0) b = m; else a = m;
            }
            tout = (a + b) * 0.5;
            return true;
        }
        if (rd.y > 0 && p.y > maxh) return false;
        pt = t;
        t += max(d * 0.45f, prec * 2.5f * t);
    }
    // rayon rasant à court de pas : on considère le relief atteint
    if (t < tmax && d < 0.02f * t) { tout = t; return true; }
    return false;
}
static inline bool traceH(const HMap &M, v3 ro, v3 rd, float tmin, float tmax, float &tout, float prec = 0.0012, int maxSteps = 260) {
    return traceF([&](float x, float z) { return M.get(x, z); }, M.maxh, ro, rd, tmin, tmax, tout, prec, maxSteps);
}

// ---------------------------------------------------------------- caméra
struct Cam {
    v3 ro, f, r, u;
    float fl = 1;
    void look(v3 o, v3 ta, float hfovDeg, float aspect) {
        ro = o; f = normalize(ta - o);
        r = normalize(cross(f, v3(0, 1, 0))); u = cross(r, f);
        fl = aspect / tanf(hfovDeg * 0.5 * PI / 180);
    }
    v3 dir(float sx, float sy) const { return normalize(f * fl + r * sx + u * sy); }
};

// ---------------------------------------------------------------- ciel
struct Sky {
    v3 sun = v3(0, 1, 0), zen, hor, sunCol, glow;
    float hazeExp = 0.5, glowPow = 4, glowFall = 7, discI = 40, haloI = 1;
    // nuages
    float cAmt = 0, cH = 5, cScale = 0.1, cCover = 0.5, cSoft = 0.3, cStretch = 1;
    v3 cLit = v3(1), cDark = v3(0.5), wind = v3(0.02, 0, 0.01);

    v3 eval(v3 ro, v3 rd, float time) const {
        float y = max(rd.y, 0.0f);
        v3 col = mix(hor, zen, powf(y, hazeExp));
        float sd = max(dot(rd, sun), 0.0f);
        v3 rh = normalize(v3(rd.x, 0, rd.z)), sh = normalize(v3(sun.x, 0, sun.z));
        float az = max(dot(rh, sh), 0.0f);
        col += glow * (powf(az, glowPow) * expf(-y * glowFall));
        col += sunCol * (haloI * (0.06 * powf(sd, 12) + 0.25 * powf(sd, 90) + 0.6 * powf(sd, 900)));
        if (cAmt > 0 && rd.y > 0.012) {
            float t = (cH - ro.y) / rd.y;
            float px = (ro.x + rd.x * t) * cScale + wind.x * time, pz = (ro.z + rd.z * t) * cScale * cStretch + wind.z * time;
            float d = fbmv(px, pz, 6);
            float dens = sstep(cCover, cCover + cSoft, d);
            if (dens > 0) {
                float d2 = fbmv(px + sh.x * 0.22, pz + sh.z * 0.22 * cStretch, 4);
                float lit = sat(0.55 + (d - d2) * 4.0);
                v3 cc = mix(cDark, cLit, lit);
                cc += sunCol * (0.5 * powf(sd, 8) * (1 - dens));
                float fadeH = sstep(0.012, 0.16, rd.y);
                col = mix(col, cc, dens * cAmt * fadeH);
            }
        }
        col += sunCol * (discI * sstep(0.99988, 0.99996, sd));
        return col;
    }
};

// ---------------------------------------------------------------- brume (exponentielle en altitude)
struct Fog {
    float a = 0, b = 1, c = 0, sunPow = 8;
    v3 col, sunCol;
    v3 apply(v3 c0, v3 ro, v3 rd, float t, v3 sun) const {
        float ry = rd.y;
        if (fabsf(ry) < 1e-4) ry = 1e-4;
        float k = clampf(-t * ry * b, -30, 30);
        float fa = a * expf(clampf(-ro.y * b, -30, 30)) * (1 - expf(k)) / (ry * b);
        float e = 1 - expf(-(max(fa, 0.0f) + c * t));
        float s = powf(max(dot(rd, sun), 0.0f), sunPow);
        return mix(c0, mix(col, sunCol, s), sat(e));
    }
};

// ---------------------------------------------------------------- SDF de base
static inline float sdBox(v3 p, v3 b) {
    v3 q = vabs(p) - b;
    return length(vmax(q, 0)) + min(max(q.x, max(q.y, q.z)), 0.0f);
}
static inline float sdCyl(v3 p, float r, float h) { // cylindre vertical, base y=0, sommet y=h
    float dx = sqrtf(p.x * p.x + p.z * p.z) - r, dy = fabsf(p.y - h * 0.5) - h * 0.5;
    float ox = max(dx, 0.0f), oy = max(dy, 0.0f);
    return min(max(dx, dy), 0.0f) + sqrtf(ox * ox + oy * oy);
}

// normale de vaguelettes animées
static inline v3 waterN(float x, float z, float time, float amp) {
    auto H = [&](float x, float z) {
        return vn2(x + time * 0.35, z * 1.7 + time * 0.22) * 0.55 + vn2(x * 2.3 - time * 0.5, z * 3.1 + time * 0.41) * 0.28 +
               vn2(x * 5.3 + time * 0.8, z * 6.1 - time * 0.9) * 0.14;
    };
    const float e = 0.06;
    float h0 = H(x, z), hx = H(x + e, z), hz = H(x, z + e);
    return normalize(v3(-(hx - h0) / e * amp, 1, -(hz - h0) / e * amp));
}

// ---------------------------------------------------------------- interface de scène
struct Scene {
    float exposure = 1, bloom = 0.35;
    virtual void init() = 0;
    virtual void setup(float time, float u, float aspect, Cam &c) = 0;
    virtual v3 shade(const v3 &ro, const v3 &rd, float time) = 0;
    virtual void overlay(std::vector<v3> &, int, int, float) {}
    virtual ~Scene() {}
};

// pétales de cerisier portés par le vent (surimpression en espace écran)
static void petals(std::vector<v3> &img, int W, int H, float time, int N, v3 tint, float windx, int seed) {
    for (int i = 0; i < N; i++) {
        float a = h2(i, seed + 1), b = h2(i, seed + 2), c = h2(i, seed + 3), d = h2(i, seed + 4);
        float z = 0.2 + 0.8 * c;
        float sz = (2.5 + 22 * z * z * z) * H / 1080.0;
        float x = fract(a + time * (0.018 + 0.05 * z) * windx + 0.012 * sinf(time * (1 + b) + i) + 10) * 1.2 - 0.1;
        float y = fract(b + time * (0.03 + 0.06 * z)) * 1.2 - 0.1;
        float ang = time * (0.5 + 1.4 * d) + i;
        float squash = 0.35 + 0.65 * fabsf(sinf(time * (1.0 + d * 2) + i * 1.7));
        float blur = z > 0.75 ? 0.7 : 0.3, alpha = z > 0.75 ? 0.45 : 0.85;
        float cx = x * W, cy = y * H, ca = cosf(ang), sa = sinf(ang);
        int x0 = max(0, (int)(cx - sz - 1)), x1 = min(W - 1, (int)(cx + sz + 1));
        int y0 = max(0, (int)(cy - sz - 1)), y1 = min(H - 1, (int)(cy + sz + 1));
        v3 col = tint * (0.85 + 0.3 * d);
        for (int py = y0; py <= y1; py++)
            for (int px = x0; px <= x1; px++) {
                float dx = px + 0.5 - cx, dy = py + 0.5 - cy;
                float lx = (dx * ca + dy * sa) / sz, ly = (-dx * sa + dy * ca) / (sz * squash);
                float e = sqrtf(lx * lx + ly * ly);
                float cover = sstep(1, 1 - blur, e) * alpha;
                if (cover > 0) img[(size_t)py * W + px] = mix(img[(size_t)py * W + px], col, cover);
            }
    }
}
