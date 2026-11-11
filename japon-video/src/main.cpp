// Paysages du Japon — rendu procédural image par image.
// Usage : render <scene> <largeur> <hauteur> <image_début> <image_fin> <nb_images_total> <ips>  > images.rgb
// Écrit des images RGB24 brutes sur la sortie standard (à passer à ffmpeg).
#include "core.h"
#include "scenes_terrain.h"
#include "scenes_objects.h"

static inline v3 aces(v3 x) {
    auto f = [](float v) { return sat((v * (2.51f * v + 0.03f)) / (v * (2.43f * v + 0.59f) + 0.14f)); };
    return v3(f(x.x), f(x.y), f(x.z));
}

static void boxBlur(std::vector<v3> &a, int w, int h, int r) {
    std::vector<v3> b(a.size());
    float inv = 1.0f / (2 * r + 1);
#pragma omp parallel for
    for (int y = 0; y < h; y++) {
        v3 s(0);
        for (int x = -r; x <= r; x++) s += a[(size_t)y * w + clampf(x, 0, w - 1)];
        for (int x = 0; x < w; x++) {
            b[(size_t)y * w + x] = s * inv;
            s += a[(size_t)y * w + min(x + r + 1, w - 1)] - a[(size_t)y * w + max(x - r, 0)];
        }
    }
#pragma omp parallel for
    for (int x = 0; x < w; x++) {
        v3 s(0);
        for (int y = -r; y <= r; y++) s += b[(size_t)clampf(y, 0, h - 1) * w + x];
        for (int y = 0; y < h; y++) {
            a[(size_t)y * w + x] = s * inv;
            s += b[(size_t)min(y + r + 1, h - 1) * w + x] - b[(size_t)max(y - r, 0) * w + x];
        }
    }
}

int main(int argc, char **argv) {
    if (argc < 8) { fprintf(stderr, "usage: render scene W H f0 f1 total fps\n"); return 1; }
    const char *name = argv[1];
    int W = atoi(argv[2]), H = atoi(argv[3]), f0 = atoi(argv[4]), f1 = atoi(argv[5]), total = atoi(argv[6]);
    float fps = atof(argv[7]);
    initNoise();
    Scene *sc = nullptr;
    if (!strcmp(name, "unkai")) sc = new Unkai();
    else if (!strcmp(name, "fuji")) sc = new FujiDawn();
    else if (!strcmp(name, "bamboo")) sc = new Bamboo();
    else if (!strcmp(name, "tanada")) sc = new Tanada();
    else if (!strcmp(name, "torii")) sc = new Torii();
    else if (!strcmp(name, "pagoda")) sc = new PagodaDusk();
    else { fprintf(stderr, "scène inconnue\n"); return 1; }
    double t0 = omp_get_wtime();
    sc->init();
    fprintf(stderr, "[%s] init %.1fs\n", name, omp_get_wtime() - t0);

    float aspect = (float)W / H;
    std::vector<v3> img((size_t)W * H), out((size_t)W * H);
    std::vector<unsigned char> bytes((size_t)W * H * 3);
    int bw = W / 4, bh = H / 4;
    std::vector<v3> bl((size_t)bw * bh);

    for (int f = f0; f <= f1; f++) {
        double tf = omp_get_wtime();
        float time = f / fps, u = total > 1 ? (float)f / (total - 1) : 0;
        // mouvement de caméra adouci au début et à la fin
        float ue = u * u * (3 - 2 * u) * 0.5 + u * 0.5;
        Cam cam;
        sc->setup(time, ue, aspect, cam);
        auto sample = [&](float px, float py) {
            float sx = (2 * px / W - 1) * aspect, sy = 1 - 2 * py / H;
            v3 c = sc->shade(cam.ro, cam.dir(sx, sy), time);
            if (!(c.x == c.x) || !(c.y == c.y) || !(c.z == c.z)) c = v3(0);
            return vmax(c, 0) * sc->exposure;
        };
#pragma omp parallel for schedule(dynamic, 2)
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++) img[(size_t)y * W + x] = sample(x + 0.5f, y + 0.5f);
        // anticrénelage adaptatif : suréchantillonnage des pixels à fort contraste
        auto tl = [](v3 c) { float l = lum(c); return l / (1 + l); };
#pragma omp parallel for schedule(dynamic, 2)
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++) {
                v3 c = img[(size_t)y * W + x];
                float l = tl(c), dmax = 0;
                if (x > 0) dmax = max(dmax, fabsf(l - tl(img[(size_t)y * W + x - 1])));
                if (x < W - 1) dmax = max(dmax, fabsf(l - tl(img[(size_t)y * W + x + 1])));
                if (y > 0) dmax = max(dmax, fabsf(l - tl(img[(size_t)(y - 1) * W + x])));
                if (y < H - 1) dmax = max(dmax, fabsf(l - tl(img[(size_t)(y + 1) * W + x])));
                if (dmax > 0.03) {
                    static const float ox[4] = {-0.375, 0.125, 0.375, -0.125}, oy[4] = {-0.125, -0.375, 0.125, 0.375};
                    v3 s(0);
                    for (int k = 0; k < 4; k++) {
                        v3 q = sample(x + 0.5f + ox[k], y + 0.5f + oy[k]);
                        // limite les lucioles (reflets du soleil) avant moyenne
                        float ql = lum(q);
                        if (ql > 12) q = q * (12 / ql);
                        s += q;
                    }
                    float cl = lum(c);
                    if (cl > 12) c = c * (12 / cl);
                    c = (s + c) * 0.2f;
                }
                out[(size_t)y * W + x] = c;
            }
        // halo lumineux (bloom)
        if (sc->bloom > 0) {
#pragma omp parallel for
            for (int y = 0; y < bh; y++)
                for (int x = 0; x < bw; x++) {
                    v3 s(0);
                    for (int j = 0; j < 4; j++)
                        for (int i = 0; i < 4; i++) {
                            v3 c = out[(size_t)min(y * 4 + j, H - 1) * W + min(x * 4 + i, W - 1)];
                            float l = lum(c);
                            float k = max(l - 0.9f, 0.0f) / max(l, 1e-4f);
                            s += c * min(k, 1.0f) * min(1.0f, 14.0f / max(l, 1e-4f));
                        }
                    bl[(size_t)y * bw + x] = s * (1 / 16.0f);
                }
            std::vector<v3> wide = bl;
            int r1 = max(1, bh / 90), r2 = max(2, bh / 22);
            for (int k = 0; k < 3; k++) boxBlur(bl, bw, bh, r1);
            for (int k = 0; k < 3; k++) boxBlur(wide, bw, bh, r2);
#pragma omp parallel for
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++) {
                    float fx = clampf((x + 0.5f) / 4 - 0.5f, 0, bw - 1.001f), fy = clampf((y + 0.5f) / 4 - 0.5f, 0, bh - 1.001f);
                    int ix = (int)fx, iy = (int)fy;
                    float ux = fx - ix, uy = fy - iy;
                    auto bil = [&](const std::vector<v3> &b) {
                        return mix(mix(b[(size_t)iy * bw + ix], b[(size_t)iy * bw + ix + 1], ux), mix(b[(size_t)(iy + 1) * bw + ix], b[(size_t)(iy + 1) * bw + ix + 1], ux), uy);
                    };
                    out[(size_t)y * W + x] += (bil(bl) * 0.55f + bil(wide) * 0.45f) * sc->bloom;
                }
        }
        // courbe filmique, gamma, vignettage
#pragma omp parallel for
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++) {
                v3 c = aces(out[(size_t)y * W + x]);
                c = v3(powf(c.x, 1 / 2.2f), powf(c.y, 1 / 2.2f), powf(c.z, 1 / 2.2f));
                float vx = (x + 0.5f) / W - 0.5f, vy = (y + 0.5f) / H - 0.5f;
                c *= 1 - 0.55f * (vx * vx + vy * vy);
                out[(size_t)y * W + x] = c;
            }
        sc->overlay(out, W, H, time);
        // grain léger + quantification
#pragma omp parallel for
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++) {
                v3 c = out[(size_t)y * W + x];
                float g = (h3(x, y, f) + h3(x + 17, y - 9, f + 3) - 1.0f) * (2.2f / 255);
                unsigned char *b = &bytes[((size_t)y * W + x) * 3];
                b[0] = (unsigned char)(sat(c.x + g) * 255 + 0.5f);
                b[1] = (unsigned char)(sat(c.y + g) * 255 + 0.5f);
                b[2] = (unsigned char)(sat(c.z + g) * 255 + 0.5f);
            }
        fwrite(bytes.data(), 1, bytes.size(), stdout);
        fflush(stdout);
        fprintf(stderr, "[%s] image %d/%d  %.2fs\n", name, f, f1, omp_get_wtime() - tf);
    }
    return 0;
}
