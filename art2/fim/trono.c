/* Final II, plano 3: o salão do trono da Casa Vhalor, de frente, de noite. Ele sentado no trono com a coroa; a
 * única luz forte é a pedra de Âmbar no meio do círculo de runas do estrado, na frente e por baixo: a sombra dele
 * sobe no encosto, e na sombra está a foice (que só existe para a luz: os raios da câmera não a veem).
 *
 * gcc -O3 -march=native -ffast-math -fopenmp -shared -fPIC trono.c -o trono.so -lm */
#include "rm.h"
#include <omp.h>

enum { M_NONE = 0, M_WALL, M_FLOOR, M_DAIS, M_STEP, M_PILASTER, M_BAND, M_GLASS, M_SILL, M_WOOD, M_WOODF, M_VELVET,
       M_BRONZE, M_CABLE, M_GOLD, M_TRIM, M_CLOTH, M_HOODIN, M_MASK, M_GEM, M_ORB, M_BEAD, M_LENS, M_CHAIN, M_CANDLE,
       M_CEIL, M_ROBE, M_HEM, NMAT };
enum { G_ROOM = 0, G_THRONE, G_KING, G_MASK, G_CROWN, G_BEAD, G_EMIT, G_GLASS, NG };
#define NOUT (10 + NG + 1)

typedef struct { float d; int m, g; } hit_t;
#define UPD(h, dist, mat, grp) do { float _d = (dist); if (_d < (h)->d) { (h)->d = _d; (h)->m = (mat); (h)->g = (grp); } } while (0)

/* ---------------------------------------------------------------- medidas */
#define DAIS_Y 0.45f
#define DAIS_Z 3.2f
#define RING_X 0.0f
#define RING_Z 2.35f
#define RING_R 0.78f
/* o encosto: arco ogival de largura 2*TB_A, nascendo em TB_YS e subindo TB_H */
#define TB_A 0.92f
#define TB_YS 2.95f
#define TB_H 1.0f
#define TB_Z0 0.40f
#define TB_Z1 0.60f
#define TB_ZF 0.635f
#define HOOD_C V(0.0f, 1.875f, 0.855f)
#define CH_X (-1.95f)
#define CH_Y 2.55f
#define CH_Z 2.05f

static float TB_C, TB_R;
static float P[32];        /* luzes e ajustes vindos do Python */
#define KEY_I P[0]
#define RING_I P[1]
#define WIN_I P[2]
#define AMB_I P[3]
#define LENS_E P[4]
#define BAND_E P[5]
#define GLASS_E P[6]
#define SIDE_I P[7]
#define REFL_K P[8]
#define SCY P[9]          /* 1: a foice existe para a luz */
#define FILL_I P[10]       /* o salão atrás da câmera (as runas do chão, longe) */
static v3 KEY_P;

/* contas: as dos fios do capuz e as do rosário do peito (centros calculados no setup) */
#define NBEAD 96
static v3 BEAD[NBEAD];
static float BEAD_R[NBEAD];
static int NB = 0;
/* os cabos: pontos das curvas */
#define NCAB 10
static v3 CAB[2][NCAB];

/* ---------------------------------------------------------------- 2D: o arco ogival */
INL float sd_arch2(float x, float y, float a, float ys, float c, float R, float ybot) {
    float drect = maxf(fabsf(x) - a, maxf(ybot - y, y - ys));
    float d1 = sqrtf((x - c) * (x - c) + (y - ys) * (y - ys)) - R;
    float d2 = sqrtf((x + c) * (x + c) + (y - ys) * (y - ys)) - R;
    /* a lente inteira das duas circunferências (a metade de baixo cai dentro do retângulo: sem costura) */
    float darch = maxf(d1, d2);
    return minf(drect, darch);
}
/* as lancetas da parede do fundo */
INL float sd_lancet(float x, float y) {
    float a = 0.29f, ys = 3.60f, h = 0.56f;
    float c = (h * h - a * a) / (2 * a), R = c + a;
    return sd_arch2(x, y, a, ys, c, R, 1.35f);
}

/* ---------------------------------------------------------------- o salão */
INL void room(v3 p, hit_t *h) {
    UPD(h, p.y, M_FLOOR, G_ROOM);
    UPD(h, 6.8f - p.y, M_CEIL, G_ROOM);
    UPD(h, 4.6f - fabsf(p.x), M_WALL, G_ROOM);
    /* a parede do fundo com as janelas */
    float wx = fabsf(p.x) - 2.35f;
    float dl = sd_lancet(wx, p.y);
    float dw = p.z;
    dw = maxf(dw, -maxf(dl, -0.22f - p.z));
    UPD(h, dw, M_WALL, G_ROOM);
    if (sd_aabb(V(wx, p.y, p.z), -0.6f, 1.2f, -0.4f, 0.6f, 4.3f, 0.2f, 0.0f) < h->d) {
        UPD(h, maxf(dl, fabsf(p.z + 0.225f) - 0.006f), M_GLASS, G_GLASS);
        /* o mainel no meio, a travessa e o peitoril */
        float mull = maxf(maxf(fabsf(wx) - 0.022f, dl), fabsf(p.z + 0.17f) - 0.05f);
        float tran = maxf(maxf(fabsf(p.y - 2.75f) - 0.022f, dl), fabsf(p.z + 0.17f) - 0.05f);
        UPD(h, minf(mull, tran), M_SILL, G_ROOM);
        UPD(h, sd_aabb(V(wx, p.y, p.z), -0.44f, 1.27f, -0.05f, 0.44f, 1.35f, 0.09f, 0.008f), M_SILL, G_ROOM);
    }
    /* as pilastras com as cintas de bronze */
    float px = fabsf(p.x);
    if (sd_aabb(V(px, p.y, p.z), 3.0f, -0.2f, -0.2f, 3.6f, 7.1f, 0.4f, 0.0f) < h->d) {
        UPD(h, sd_aabb(V(px, p.y, p.z), 3.05f, -0.1f, -0.1f, 3.55f, 7.0f, 0.32f, 0.01f), M_PILASTER, G_ROOM);
        for (int i = 0; i < 3; i++) {
            float by = 1.0f + 1.6f * i;
            UPD(h, sd_aabb(V(px, p.y, p.z), 3.03f, by - 0.05f, -0.1f, 3.57f, by + 0.05f, 0.345f, 0.006f), M_BAND, G_ROOM);
        }
    }
    /* o friso de bronze no alto */
    UPD(h, sd_aabb(p, -4.6f, 4.55f, -0.1f, 4.6f, 4.72f, 0.07f, 0.008f), M_BAND, G_ROOM);
    /* o estrado e os dois degraus */
    if (sd_aabb(p, -3.3f, -0.2f, -0.2f, 3.3f, 0.5f, 4.0f, 0.0f) < h->d) {
        UPD(h, sd_aabb(p, -3.2f, -0.1f, -0.1f, 3.2f, DAIS_Y, DAIS_Z, 0.008f), M_DAIS, G_ROOM);
        UPD(h, sd_aabb(p, -3.2f, -0.1f, 3.1f, 3.2f, 0.30f, 3.55f, 0.008f), M_STEP, G_ROOM);
        UPD(h, sd_aabb(p, -3.2f, -0.1f, 3.45f, 3.2f, 0.15f, 3.9f, 0.008f), M_STEP, G_ROOM);
    }
    /* a pedra de Âmbar no meio do círculo (a luz) e o aro de bronze dela */
    if (sd_aabb(p, RING_X - 0.2f, DAIS_Y - 0.1f, RING_Z - 0.2f, RING_X + 0.2f, DAIS_Y + 0.08f, RING_Z + 0.2f, 0.0f) < h->d) {
        UPD(h, sd_ell(p, V(RING_X, DAIS_Y, RING_Z), V(0.10f, 0.04f, 0.10f)), M_LENS, G_EMIT);
        UPD(h, sd_torus_y(p, V(RING_X, DAIS_Y + 0.008f, RING_Z), 0.115f, 0.016f), M_BRONZE, G_ROOM);
    }
}

/* ---------------------------------------------------------------- o trono */
INL void throne(v3 p, hit_t *h) {
    float db = sd_aabb(p, -1.12f, 0.44f, 0.36f, 1.12f, 4.45f, 1.5f, 0.0f);
    if (db > h->d) return;
    /* o encosto: a moldura em volta e o painel liso por dentro (é nele que a sombra cai) */
    float o2 = sd_arch2(p.x, p.y, TB_A, TB_YS, TB_C, TB_R, 0.45f);
    float i2 = sd_arch2(p.x, p.y, TB_A - 0.10f, TB_YS, TB_C, TB_R - 0.10f, 1.0f);
    float panel = maxf(o2, maxf(p.z - TB_Z1, TB_Z0 - p.z));
    UPD(h, panel, M_WOOD, G_THRONE);
    float frame = maxf(maxf(o2, -i2), maxf(p.z - TB_ZF, TB_Z0 - p.z));
    UPD(h, frame - 0.004f, M_WOODF, G_THRONE);
    /* um filete de bronze na beira de dentro da moldura */
    float fil = maxf(fabsf(i2 + 0.004f) - 0.007f, maxf(p.z - TB_Z1 - 0.012f, TB_Z1 - 0.01f - p.z));
    UPD(h, fil, M_BRONZE, G_THRONE);
    /* a agulha em cima */
    float apex = TB_YS + TB_H;
    UPD(h, sd_rcone(p, V(0, apex - 0.05f, 0.52f), V(0, apex + 0.40f, 0.52f), 0.05f, 0.004f), M_BRONZE, G_THRONE);
    UPD(h, sd_sphere(p, V(0, apex + 0.02f, 0.52f), 0.068f), M_BRONZE, G_THRONE);
    /* os bocais dos cabos dos dois lados, perto do alto */
    float ax = fabsf(p.x);
    v3 q = V(ax, p.y, p.z);
    UPD(h, sd_cap(q, V(0.84f, 3.18f, 0.515f), V(1.02f, 3.18f, 0.515f), 0.062f), M_BRONZE, G_THRONE);
    UPD(h, sd_torus_x(q, V(1.02f, 3.18f, 0.515f), 0.066f, 0.02f), M_BRONZE, G_THRONE);
    UPD(h, sd_torus_x(q, V(0.93f, 3.18f, 0.515f), 0.07f, 0.014f), M_BRONZE, G_THRONE);
    /* a base, o assento, os braços com o tampo e a bola de bronze na ponta */
    UPD(h, sd_aabb(p, -0.56f, 0.44f, 0.6f, 0.56f, 0.93f, 1.36f, 0.01f), M_WOODF, G_THRONE);
    UPD(h, sd_aabb(p, -0.62f, 0.44f, 0.58f, 0.62f, 0.53f, 1.40f, 0.012f), M_WOODF, G_THRONE);
    UPD(h, sd_aabb(p, -0.53f, 0.92f, 0.62f, 0.53f, 1.0f, 1.42f, 0.03f), M_VELVET, G_THRONE);
    UPD(h, sd_aabb(q, 0.52f, 0.44f, 0.62f, 0.70f, 1.20f, 1.42f, 0.012f), M_WOODF, G_THRONE);
    UPD(h, sd_aabb(q, 0.505f, 1.19f, 0.60f, 0.725f, 1.25f, 1.50f, 0.018f), M_WOOD, G_THRONE);
    UPD(h, sd_cyl_y(q, V(0.615f, 1.27f, 1.455f), 0.035f, 0.03f), M_BRONZE, G_THRONE);
    UPD(h, sd_sphere(q, V(0.615f, 1.315f, 1.455f), 0.066f), M_BRONZE, G_THRONE);
    /* o olho de âmbar na frente da base */
    UPD(h, sd_ell(p, V(0, 0.72f, 1.36f), V(0.05f, 0.05f, 0.02f)), M_GEM, G_EMIT);
    UPD(h, sd_torus_z(p, V(0, 0.72f, 1.365f), 0.058f, 0.012f), M_BRONZE, G_THRONE);
}

/* os cabos saindo dos bocais e subindo para a calha do teto */
INL void cables(v3 p, hit_t *h) {
    float ax = fabsf(p.x);
    v3 q = V(ax, p.y, p.z);
    if (sd_aabb(q, 0.95f, 3.0f, 0.38f, 2.0f, 7.0f, 1.5f, 0.0f) > h->d) return;
    float d = 1e9f;
    for (int i = 0; i < NCAB - 1; i++) d = smin(d, sd_cap(q, CAB[1][i], CAB[1][i + 1], 0.05f), 0.02f);
    UPD(h, d, M_CABLE, G_THRONE);
}

/* o lustre apagado do lado do estrado, nas duas correntes */
INL void chandelier(v3 p, hit_t *h) {
    float db = sd_aabb(p, CH_X - 0.6f, CH_Y - 0.1f, CH_Z - 0.6f, CH_X + 0.6f, 7.0f, CH_Z + 0.6f, 0.0f);
    if (db > h->d) return;
    v3 c = V(CH_X, CH_Y, CH_Z);
    UPD(h, sd_torus_y(p, c, 0.48f, 0.03f), M_BRONZE, G_THRONE);
    UPD(h, sd_torus_y(p, add(c, V(0, -0.035f, 0)), 0.40f, 0.014f), M_BRONZE, G_THRONE);
    for (int i = 0; i < 8; i++) {
        float a = i * 0.7853982f + 0.39f;
        v3 cc = add(c, V(cosf(a) * 0.48f, 0.035f, sinf(a) * 0.48f));
        UPD(h, sd_cyl_y(p, cc, 0.034f, 0.018f), M_BRONZE, G_THRONE);
        float hh = 0.045f + 0.02f * (i % 3);
        UPD(h, sd_cyl_y(p, add(cc, V(0, 0.018f + hh, 0)), 0.017f, hh), M_CANDLE, G_THRONE);
    }
    for (int s = -1; s <= 1; s += 2) {
        v3 a = add(c, V(s * 0.48f, 0.02f, 0));
        v3 b = V(CH_X + s * 0.22f, 6.9f, CH_Z);
        UPD(h, sd_cap(p, a, b, 0.011f), M_CHAIN, G_THRONE);
    }
}

/* ---------------------------------------------------------------- ele */
INL float hood_d(v3 p) {
    float d = sd_sphere(p, HOOD_C, 0.158f);
    /* o capuz cai nos ombros: a gola larga em cone, com as dobras */
    float cw = sd_rcone(p, V(0, 1.80f, 0.845f), V(0, 1.60f, 0.80f), 0.152f, 0.29f);
    cw = maxf(cw, 1.555f - p.y);
    d = smin(d, cw, 0.05f);
    d += 0.006f * sinf(atan2f(p.x, p.z - 0.82f) * 11.0f) * sstep(1.78f, 1.62f, p.y);
    float op = sd_ell(p, V(0, 1.85f, 0.995f), V(0.096f, 0.128f, 0.13f));
    d = smax(d, -op, 0.012f);
    float inner = sd_sphere(p, HOOD_C, 0.138f);
    d = maxf(d, -inner);
    return d;
}
INL float cuirass_d(v3 p) {
    float d = sd_ell(p, V(0, 1.42f, 0.86f), V(0.25f, 0.20f, 0.152f));
    d = smin(d, sd_ell(p, V(0, 1.21f, 0.865f), V(0.205f, 0.15f, 0.132f)), 0.06f);
    d = smin(d, sd_ell(p, V(0, 1.10f, 0.875f), V(0.215f, 0.08f, 0.14f)), 0.04f);
    /* a quilha no meio */
    d -= 0.013f * expf(-(p.x * p.x) / 0.0014f) * sstep(0.84f, 0.97f, p.z);
    /* a borda de baixo do peitoral (um degrau em arco) e as lâminas da cintura */
    float yb = 1.255f + 0.55f * p.x * p.x;
    d -= 0.006f * sstep(yb - 0.004f, yb + 0.004f, p.y) * sstep(0.84f, 0.95f, p.z);
    d += 0.0035f * sinf(p.y * 72.0f) * sstep(1.25f, 1.21f, p.y) * sstep(1.04f, 1.08f, p.y);
    return d;
}
INL float mask_d(v3 p) {
    float x = p.x, y = p.y - 1.845f;
    float de = (sqrtf((x / 0.079f) * (x / 0.079f) + ((y - 0.005f) / 0.10f) * ((y - 0.005f) / 0.10f)) - 1.0f) * 0.079f;
    float dv = ((-0.108f + fabsf(x) * 1.35f) - y) / 1.68f;
    float d2 = maxf(de, dv);
    float d3 = sd_ell(p, V(0, 1.845f, 0.90f), V(0.092f, 0.122f, 0.082f));
    return maxf(maxf(d3, d2), 0.925f - p.z);
}

INL void king(v3 p, hit_t *h, int shadow) {
    float db = sd_aabb(p, -0.80f, 0.44f, 0.60f, 0.80f, 2.16f, 1.75f, 0.0f);
    float ax = fabsf(p.x);
    float sx = p.x < 0 ? -1.0f : 1.0f;
    v3 q = V(ax, p.y, p.z);   /* o lado de cá (espelhado) */
    if (db < h->d) {
        /* a couraça de ouro, o gorjal */
        UPD(h, cuirass_d(p), M_GOLD, G_KING);
        UPD(h, sd_rcone(p, V(0, 1.60f, 0.85f), V(0, 1.72f, 0.86f), 0.096f, 0.07f), M_TRIM, G_KING);
        /* as ombreiras em três lâminas */
        float pa = sd_ell(q, V(0.31f, 1.62f, 0.85f), V(0.158f, 0.12f, 0.152f));
        pa = maxf(pa, 1.52f - p.y + 0.15f * (ax - 0.31f));
        float pb = sd_ell(q, V(0.33f, 1.55f, 0.85f), V(0.16f, 0.085f, 0.155f));
        pb = maxf(pb, 1.46f - p.y + 0.15f * (ax - 0.33f));
        float pc = sd_ell(q, V(0.345f, 1.49f, 0.85f), V(0.15f, 0.075f, 0.145f));
        pc = maxf(pc, 1.41f - p.y + 0.15f * (ax - 0.345f));
        UPD(h, pa, M_GOLD, G_KING);
        UPD(h, pb, M_TRIM, G_KING);
        UPD(h, pc, M_GOLD, G_KING);
        /* os braços: o de cima, o cotovelo com a aba, o antebraço deitado no braço do trono, o punho largo */
        UPD(h, sd_rcone(q, V(0.31f, 1.53f, 0.85f), V(0.53f, 1.33f, 0.98f), 0.078f, 0.068f), M_GOLD, G_KING);
        UPD(h, sd_sphere(q, V(0.535f, 1.33f, 0.975f), 0.074f), M_TRIM, G_KING);
        UPD(h, sd_ell(q, V(0.59f, 1.335f, 0.96f), V(0.024f, 0.07f, 0.06f)), M_GOLD, G_KING);
        UPD(h, sd_rcone(q, V(0.537f, 1.32f, 0.99f), V(0.60f, 1.315f, 1.26f), 0.066f, 0.054f), M_GOLD, G_KING);
        UPD(h, sd_rcone(q, V(0.598f, 1.315f, 1.205f), V(0.606f, 1.32f, 1.30f), 0.06f, 0.074f), M_TRIM, G_KING);
        /* as mãos nas bolas do trono: a direita (a nossa esquerda) fechada em volta, a esquerda pousada */
        if (sx < 0) {
            UPD(h, sd_box(q, V(0.613f, 1.38f, 1.40f), V(0.055f, 0.05f, 0.07f), 0.034f), M_GOLD, G_KING);
            UPD(h, sd_cap(q, V(0.566f, 1.358f, 1.48f), V(0.66f, 1.358f, 1.48f), 0.027f), M_TRIM, G_KING);
            UPD(h, sd_cap(q, V(0.57f, 1.315f, 1.515f), V(0.655f, 1.315f, 1.515f), 0.024f), M_GOLD, G_KING);
            UPD(h, sd_cap(q, V(0.558f, 1.365f, 1.38f), V(0.562f, 1.338f, 1.475f), 0.021f), M_GOLD, G_KING);
        } else {
            UPD(h, sd_obox(q, V(0.615f, 1.395f, 1.405f), V(1, 0, 0), nrm(V(0, 1, 0.35f)), nrm(V(0, -0.35f, 1)), V(0.055f, 0.022f, 0.07f), 0.016f), M_GOLD, G_KING);
            for (int i = 0; i < 4; i++) {
                float fx = 0.578f + i * 0.024f;
                float L = (i == 1 || i == 2) ? 1.0f : 0.85f;
                v3 a = V(fx, 1.39f, 1.47f);
                v3 b = V(fx, 1.39f - 0.032f * L, 1.47f + 0.054f * L);
                v3 c = V(fx, 1.39f - 0.08f * L, 1.47f + 0.07f * L);
                UPD(h, minf(sd_cap(q, a, b, 0.019f), sd_cap(q, b, c, 0.0175f)), i == 1 ? M_TRIM : M_GOLD, G_KING);
            }
            UPD(h, sd_cap(q, V(0.558f, 1.385f, 1.39f), V(0.552f, 1.36f, 1.47f), 0.02f), M_GOLD, G_KING);
        }
        /* as pernas (quase todas por baixo da túnica): as grevas e os pés de ouro aparecem embaixo */
        float th = sd_rcone(q, V(0.13f, 1.12f, 0.92f), V(0.19f, 1.11f, 1.39f), 0.115f, 0.088f);
        float kn = sd_sphere(q, V(0.19f, 1.11f, 1.435f), 0.078f);
        UPD(h, th, M_GOLD, G_KING);
        UPD(h, kn, M_TRIM, G_KING);
        float gr = sd_rcone(q, V(0.19f, 1.06f, 1.435f), V(0.21f, 0.58f, 1.475f), 0.074f, 0.056f);
        UPD(h, gr, M_GOLD, G_KING);
        float sb = sd_rcone(q, V(0.21f, 0.52f, 1.45f), V(0.24f, 0.495f, 1.74f), 0.066f, 0.04f);
        sb = maxf(sb, DAIS_Y - p.y);
        sb += 0.003f * sinf(p.z * 110.0f) * sstep(1.55f, 1.6f, p.z);
        UPD(h, sb, M_GOLD, G_KING);
        /* a túnica carmesim por baixo da couraça: cobre as coxas (com a ponte entre elas), passa por cima dos
         * joelhos e cai na frente das canelas até o estrado, com as dobras abrindo para baixo */
        float thL = sd_rcone(p, V(-0.13f, 1.12f, 0.92f), V(-0.19f, 1.11f, 1.39f), 0.115f, 0.088f);
        float thR = sd_rcone(p, V(0.13f, 1.12f, 0.92f), V(0.19f, 1.11f, 1.39f), 0.115f, 0.088f);
        float knL = sd_sphere(p, V(-0.19f, 1.11f, 1.435f), 0.078f);
        float knR = sd_sphere(p, V(0.19f, 1.11f, 1.435f), 0.078f);
        float lap = smin(smin(thL, thR, 0.12f), smin(knL, knR, 0.10f), 0.05f) - 0.03f;
        lap = maxf(lap, 1.02f - p.y);
        float ur = clampf((1.10f - p.y) / 0.64f, 0, 1);
        float hwr = 0.285f + 0.06f * ur;
        float Ar = 0.008f + 0.038f * ur, kr = 26.0f;
        float phr = p.x * kr + 0.8f * sinf(p.y * 5.0f);
        float zsr = 1.55f + 0.07f * ur * ur - 0.035f * expf(-(p.x * p.x) / 0.012f) * (1.0f - ur) + Ar * sinf(phr);
        float gzr = Ar * kr + 0.25f;
        float fall = maxf((fabsf(p.z - zsr) - 0.016f) / sqrtf(1.0f + gzr * gzr), maxf(fabsf(p.x) - hwr, maxf(p.y - 1.13f, DAIS_Y + 0.012f - p.y)));
        /* a barra bordada de ouro rente ao chão */
        UPD(h, smin(lap, fall, 0.05f) * 0.9f, p.y < DAIS_Y + 0.05f ? M_HEM : M_ROBE, G_KING);
        /* o manto: a gola nas costas, os panos atrás dos braços, por cima do tampo e caindo do lado de fora do
         * trono até o estrado, onde se espalha */
        float col = sd_ell(p, V(0, 1.50f, 0.76f), V(0.50f, 0.22f, 0.20f));
        col = maxf(col, p.z - 0.86f);
        float back = sd_box(p, V(0, 1.18f, 0.70f), V(0.50f, 0.30f, 0.06f), 0.05f);
        back += 0.008f * sinf(p.x * 40.0f + 0.4f);
        float arm = sd_rcone(q, V(0.38f, 1.48f, 0.76f), V(0.64f, 1.27f, 0.80f), 0.10f, 0.065f);
        float top = sd_box(q, V(0.63f, 1.268f, 0.95f), V(0.115f, 0.026f, 0.30f), 0.02f);
        top += 0.006f * sinf(p.z * 48.0f + 0.5f);
        float u = clampf((1.22f - p.y) / 0.76f, 0, 1);
        float dy = maxf(p.y - 1.22f, DAIS_Y + 0.01f - p.y);
        /* a cascata na frente do braço do trono (embaixo da bola): uma folha com as dobras fundas embaixo */
        float xc = 0.72f + 0.05f * u, hw = 0.10f + 0.07f * u;
        float A = 0.012f + 0.042f * u, kf = 30.0f;
        float ph = (ax - xc) * kf + p.y * 1.5f + sx * 0.7f;
        float zs = 1.54f + 0.10f * u * u + A * sinf(ph);
        float gz = A * kf + 0.25f;
        float front = maxf((fabsf(p.z - zs) - 0.013f) / sqrtf(1.0f + gz * gz), maxf(fabsf(ax - xc) - hw, dy));
        /* o pano do lado de fora do braço */
        float cxs = 0.75f + 0.14f * u * u;
        float A2 = 0.012f + 0.04f * u;
        float ph2 = p.z * 24.0f + p.y * 2.0f + sx;
        float xs = cxs + A2 * sinf(ph2);
        float gx = A2 * 24.0f + 0.55f;
        float z1 = 1.20f + 0.30f * u * u;
        float curt = maxf((fabsf(ax - xs) - 0.014f) / sqrtf(1.0f + gx * gx), maxf(maxf(0.64f - p.z, p.z - z1), dy));
        /* e o que sobra se espalha no estrado, na frente e do lado */
        float pool = sd_ell(q, V(0.84f, 0.458f, 1.66f), V(0.34f, 0.045f, 0.34f));
        pool = maxf(pool, DAIS_Y - 0.005f - p.y);
        pool += 0.008f * sinf(atan2f(p.z - 1.66f, ax - 0.84f) * 7.0f) * sstep(0.0f, 0.2f, len(V(ax - 0.84f, 0, p.z - 1.66f)));
        float cloak = smin(col, back, 0.06f);
        cloak = smin(cloak, arm, 0.05f);
        cloak = smin(cloak, top, 0.04f);
        /* em cima (a gola e os panos atrás dos braços) o carmesim do capuz; embaixo (a cascata, o pano do lado e a
         * poça) o veludo escuro da túnica, que fica perto da luz */
        float lower = smin(smin(front, pool, 0.10f), smin(curt, pool, 0.10f), 0.04f);
        UPD(h, cloak, M_CLOTH, G_KING);
        UPD(h, lower, M_ROBE, G_KING);

    }
    /* o capuz com a máscara e as contas, a coroa */
    float dh = sd_aabb(p, -0.26f, 1.56f, 0.6f, 0.26f, 2.14f, 1.08f, 0.0f);
    if (dh < h->d) {
        float hd = hood_d(p);
        float dc = len(sub(p, HOOD_C));
        UPD(h, hd, dc < 0.149f ? M_HOODIN : M_CLOTH, G_KING);
        UPD(h, mask_d(p), M_MASK, G_MASK);
        /* a coroa: o aro abrindo para cima, os sete espinhos na frente e os de trás, as pedras */
        v3 c = sub(p, V(0, 0, 0.855f));
        float rr = sqrtf(c.x * c.x + c.z * c.z);
        float R = 0.143f + 0.25f * (p.y - 1.965f);
        float band = maxf(fabsf(rr - R) - 0.0058f, fabsf(p.y - 1.986f) - 0.023f);
        UPD(h, band, M_GOLD, G_CROWN);
        if (p.y > 1.96f) {
            float th = atan2f(c.x, c.z);
            for (int k = -3; k <= 3; k++) {
                float hk[4] = {0.105f, 0.085f, 0.062f, 0.038f};
                int a = k < 0 ? -k : k;
                for (int back = 0; back < 2; back++) {
                    float t0 = k * 0.42f + (back ? 3.14159f : 0.0f);
                    float dth = fabsf(remainderf(th - t0, 6.2831853f));
                    if (dth > 0.3f) continue;
                    v3 b = V(sinf(t0) * 0.152f, 2.0f, 0.855f + cosf(t0) * 0.152f);
                    float rt = 0.165f + 0.004f * a;
                    v3 tp = V(sinf(t0) * rt, 2.0f + hk[a], 0.855f + cosf(t0) * rt);
                    UPD(h, sd_rcone(p, b, tp, 0.0135f, 0.0022f), M_GOLD, G_CROWN);
                    if (!back && a <= 1) UPD(h, sd_sphere(p, add(tp, V(0, 0.004f, 0)), 0.0085f), M_GEM, G_CROWN);
                }
            }
        }
        UPD(h, sd_sphere(p, V(0, 1.986f, 0.855f + 0.153f), 0.0125f), M_GEM, G_CROWN);
        for (int s = -1; s <= 1; s += 2) UPD(h, sd_sphere(p, V(s * sinf(0.7f) * 0.152f, 1.986f, 0.855f + cosf(0.7f) * 0.152f), 0.0085f), M_GEM, G_CROWN);
        /* as contas */
        for (int i = 0; i < NB; i++) {
            if (fabsf(p.y - BEAD[i].y) > 0.05f) continue;
            UPD(h, sd_sphere(p, BEAD[i], BEAD_R[i]), M_BEAD, G_BEAD);
        }
        /* a pedra negra no aro de ouro, no meio do peito */
        if (p.y < 1.56f) {
            UPD(h, sd_sphere(p, V(0, 1.43f, 1.016f), 0.052f), M_ORB, G_BEAD);
            UPD(h, sd_torus_z(p, V(0, 1.43f, 1.01f), 0.066f, 0.0125f), M_GOLD, G_BEAD);
            for (int i = 0; i < 8; i++) {
                float a = i * 0.7853982f;
                v3 b = V(cosf(a) * 0.072f, 1.43f + sinf(a) * 0.072f, 1.0f);
                v3 e = V(cosf(a) * 0.108f, 1.43f + sinf(a) * 0.108f, 0.985f);
                UPD(h, sd_rcone(p, b, e, 0.009f, 0.002f), M_GOLD, G_BEAD);
            }
        }
    }
    /* a foice que só a luz vê: de pé atrás do ombro direito, a lâmina curvando por cima da coroa */
    if (shadow && SCY > 0.5f) {
        UPD(h, sd_cap(p, V(-0.50f, 1.0f, 0.665f), V(-0.50f, 2.98f, 0.665f), 0.032f), M_NONE, G_ROOM);
        /* a lâmina: um crescente no plano z = 0.665 */
        v3 b = sub(p, V(-0.06f, 2.50f, 0.665f));
        float out = sqrtf(b.x * b.x + b.y * b.y) - 0.56f;
        v3 b2 = sub(p, V(0.0f, 2.37f, 0.665f));
        float inn = sqrtf(b2.x * b2.x + b2.y * b2.y) - 0.53f;
        float cres = maxf(maxf(out, -inn), maxf(-(p.x + 0.52f), p.y - 3.2f));
        cres = maxf(cres, -(p.y - 2.62f + 0.35f * (p.x - 0.42f)));
        UPD(h, maxf(cres, fabsf(p.z - 0.665f) - 0.012f), M_NONE, G_ROOM);
        UPD(h, sd_box(p, V(-0.50f, 2.97f, 0.665f), V(0.05f, 0.03f, 0.02f), 0.01f), M_NONE, G_ROOM);
    }
}

/* ---------------------------------------------------------------- a cena */
INL hit_t map(v3 p, int shadow) {
    hit_t h; h.d = 1e9f; h.m = M_NONE; h.g = G_ROOM;
    room(p, &h);
    throne(p, &h);
    cables(p, &h);
    chandelier(p, &h);
    king(p, &h, shadow);
    return h;
}
INL float mapd(v3 p, int shadow) { return map(p, shadow).d; }

INL v3 normal_at(v3 p) {
    const float e = 0.0012f;
    v3 k1 = V(1, -1, -1), k2 = V(-1, -1, 1), k3 = V(-1, 1, -1), k4 = V(1, 1, 1);
    v3 n = add(add(mul(k1, mapd(add(p, mul(k1, e)), 0)), mul(k2, mapd(add(p, mul(k2, e)), 0))),
               add(mul(k3, mapd(add(p, mul(k3, e)), 0)), mul(k4, mapd(add(p, mul(k4, e)), 0))));
    return nrm(n);
}

INL float shadow(v3 ro, v3 rd, float maxt, float k, int steps) {
    float res = 1.0f, t = 0.012f;
    for (int i = 0; i < steps && t < maxt; i++) {
        float hh = mapd(add(ro, mul(rd, t)), 1);
        if (hh < 0.0004f) return 0.0f;
        res = minf(res, k * hh / t);
        t += clampf(hh, 0.005f, 0.2f);
    }
    return clampf(res, 0, 1);
}

INL float ao(v3 p, v3 n) {
    float occ = 0, sca = 1;
    for (int i = 0; i < 5; i++) {
        float hh = 0.012f + 0.06f * i;
        float d = mapd(add(p, mul(n, hh)), 0);
        occ += (hh - d) * sca;
        sca *= 0.75f;
    }
    return clampf(1.0f - 2.2f * occ, 0, 1);
}

/* o brilho do chão do estrado visto por um reflexo (o círculo, a pedra e a pedra acesa em volta) */
INL float dais_glow(float x, float z, float rough) {
    float r = sqrtf((x - RING_X) * (x - RING_X) + (z - RING_Z) * (z - RING_Z));
    float w = 0.03f + rough * 0.25f;
    float band = expf(-((r - RING_R) * (r - RING_R)) / (w * w)) * BAND_E * 0.6f + expf(-((r - 0.64f) * (r - 0.64f)) / (w * w)) * BAND_E * 0.3f;
    float lens = expf(-(r * r) / ((0.1f + rough * 0.3f) * (0.1f + rough * 0.3f))) * LENS_E * 0.5f;
    float lit = (KEY_I * 0.012f + RING_I * 0.02f) / (1.0f + (r / 0.9f) * (r / 0.9f));
    return band * (w < 0.06f ? 1.0f : 0.06f / w) + lens + lit;
}

/* o que o metal reflete (sem traçar): o estrado aceso embaixo, as janelas roxas, o escuro do salão */
INL v3 env(v3 p, v3 R, float rough) {
    v3 c = V(0.006f, 0.005f, 0.009f);
    if (R.y < -0.02f) {
        float t = (DAIS_Y - p.y) / R.y;
        if (t > 0) {
            v3 q = add(p, mul(R, t));
            if (q.z < DAIS_Z && fabsf(q.x) < 3.2f) {
                float g = dais_glow(q.x, q.z, rough);
                c = add(c, mul(V(1.0f, 0.62f, 0.30f), g));
            } else c = add(c, mul(V(1.0f, 0.6f, 0.3f), 0.01f));
        }
    }
    if (R.z < -0.05f && p.z > 0.64f) {
        float t = (0.62f - p.z) / R.z;
        v3 q = add(p, mul(R, t));
        if (sd_arch2(q.x, q.y, TB_A, TB_YS, TB_C, TB_R, 0.45f) < 0) {
            float dy = q.y - KEY_P.y, dz = KEY_P.z - 0.62f;
            float E = KEY_I * dz / powf(dy * dy + dz * dz + q.x * q.x, 1.5f);
            return add(c, mul(V(0.17f, 0.065f, 0.022f), E));
        }
    }
    if (R.z > 0.0f) c = add(c, mul(V(1.0f, 0.62f, 0.32f), FILL_I * 0.22f * expf(-(R.y + 0.02f) * (R.y + 0.02f) / 0.09f)));
    if (R.z < -0.05f) {
        float t = -p.z / R.z;
        v3 q = add(p, mul(R, t));
        float wl = sd_lancet(fabsf(q.x) - 2.35f, q.y);
        float g = sstep(0.04f + rough * 0.3f, -0.02f, wl);
        c = add(c, mul(V(0.42f, 0.34f, 0.85f), g * GLASS_E * 0.5f));
        /* a parede acesa perto do estrado */
        float wy = maxf(q.y - DAIS_Y, 0.0f);
        c = add(c, mul(V(0.9f, 0.55f, 0.3f), KEY_I * 0.004f / (1.0f + wy * wy) * (fabsf(q.x) < 4.5f)));
    }
    /* as janelas do lado, fora do quadro */
    for (int s = -1; s <= 1; s += 2) {
        v3 w = nrm(sub(V(s * 4.6f, 3.0f, 1.6f), p));
        float a = maxf(dot(R, w), 0);
        float lobe = powf(a, 8.0f / (0.05f + rough));
        c = add(c, mul(V(0.40f, 0.33f, 0.80f), lobe * SIDE_I * 0.25f));
    }
    return c;
}

typedef struct { v3 col, refl; float key; } shade_t;

INL v3 albedo(int m, v3 p, v3 n, float *spec, float *shin) {
    *spec = 0.02f; *shin = 20.0f;
    switch (m) {
    case M_WALL: {
        /* os blocos de pedra da parede (fiadas de 0.36 m, blocos de 0.7 m) */
        float row = floorf(p.y / 0.36f);
        float off = fmodf(row, 2.0f) * 0.35f;
        float bx = floorf((p.x + off) / 0.7f);
        float fy = p.y / 0.36f - row, fx = (p.x + off) / 0.7f - bx;
        float mort = sstep(0.0f, 0.035f, fy) * sstep(1.0f, 0.965f, fy) * sstep(0.0f, 0.02f, fx) * sstep(1.0f, 0.98f, fx);
        float v = 0.75f + 0.5f * hash3((int)bx, (int)row, 7) + 0.25f * (fbm(mul(p, 6.0f), 3) - 0.5f);
        v *= 0.45f + 0.55f * mort;
        return mul(V(0.085f, 0.072f, 0.082f), v);
    }
    case M_PILASTER: { float v = 0.8f + 0.4f * fbm(mul(p, 5.0f), 3); return mul(V(0.075f, 0.064f, 0.075f), v); }
    case M_SILL: return V(0.08f, 0.07f, 0.078f);
    case M_FLOOR: {
        float fx = p.x / 0.8f - floorf(p.x / 0.8f), fz = p.z / 0.8f - floorf(p.z / 0.8f);
        float mort = sstep(0.0f, 0.03f, fx) * sstep(1.0f, 0.97f, fx) * sstep(0.0f, 0.03f, fz) * sstep(1.0f, 0.97f, fz);
        float v = (0.8f + 0.4f * fbm(mul(p, 4.0f), 3)) * (0.5f + 0.5f * mort);
        *spec = 0.08f; *shin = 60.0f;
        return mul(V(0.05f, 0.044f, 0.05f), v);
    }
    case M_DAIS: case M_STEP: {
        float v = 0.8f + 0.4f * fbm(mul(p, 3.0f), 4);
        float fx = p.x / 1.1f - floorf(p.x / 1.1f);
        float seam = sstep(0.0f, 0.012f, fx) * sstep(1.0f, 0.988f, fx);
        *spec = 0.25f; *shin = 120.0f;
        return mul(V(0.055f, 0.046f, 0.054f), v * (0.6f + 0.4f * seam));
    }
    case M_WOOD: {
        /* a madeira escura do trono: o veio subindo */
        float g = fbm(V(p.x * 34.0f, p.y * 1.4f, p.z * 34.0f), 4);
        float g2 = fbm(V(p.x * 6.0f, p.y * 0.8f, p.z * 6.0f), 3);
        float v = 0.82f + 0.30f * (g - 0.5f) + 0.25f * (g2 - 0.5f);
        *spec = 0.06f; *shin = 40.0f;
        return mul(V(0.21f, 0.115f, 0.072f), v);
    }
    case M_WOODF: {
        float g = fbm(V(p.x * 10.0f, p.y * 2.0f, p.z * 10.0f), 3);
        *spec = 0.05f; *shin = 30.0f;
        return mul(V(0.075f, 0.042f, 0.029f), 0.8f + 0.4f * g);
    }
    case M_VELVET: return V(0.20f, 0.025f, 0.035f);
    case M_ROBE: { float g = fbm(mul(p, 18.0f), 3); return mul(V(0.085f, 0.008f, 0.014f), 0.88f + 0.24f * g); }
    case M_CLOTH: {
        float g = fbm(mul(p, 18.0f), 3);
        return mul(V(0.16f, 0.014f, 0.022f), 0.88f + 0.24f * g);
    }
    case M_HOODIN: return V(0.02f, 0.008f, 0.01f);
    case M_MASK: return V(0.03f, 0.025f, 0.03f);   /* no lugar dela entra a máscara pintada */
    case M_CANDLE: return V(0.35f, 0.30f, 0.24f);
    case M_CEIL: return V(0.02f, 0.02f, 0.025f);
    default: return V(0.1f, 0.1f, 0.1f);
    }
}

INL int is_metal(int m) { return m == M_GOLD || m == M_TRIM || m == M_BRONZE || m == M_BAND || m == M_CABLE || m == M_CHAIN || m == M_BEAD || m == M_HEM; }
INL v3 metal_f0(int m, float *rough) {
    switch (m) {
    case M_GOLD: *rough = 0.40f; return V(1.0f, 0.66f, 0.24f);
    case M_TRIM: *rough = 0.48f; return V(0.78f, 0.46f, 0.18f);
    case M_HEM: *rough = 0.6f; return V(0.80f, 0.55f, 0.24f);
    case M_BEAD: *rough = 0.06f; return V(1.0f, 0.62f, 0.22f);
    case M_BRONZE: *rough = 0.28f; return V(0.62f, 0.40f, 0.20f);
    case M_BAND: *rough = 0.32f; return V(0.55f, 0.36f, 0.18f);
    case M_CABLE: *rough = 0.35f; return V(0.40f, 0.27f, 0.15f);
    case M_CHAIN: *rough = 0.4f; return V(0.30f, 0.24f, 0.18f);
    default: *rough = 0.3f; return V(0.5f, 0.5f, 0.5f);
    }
}

/* uma luz pontual: a cor que ela deixa num ponto (difusa e brilho) */
INL void light_pt(v3 p, v3 n, v3 vdir, v3 lp, v3 lc, float I, float sh_k, int sh_steps, int metal, v3 f0, float rough, v3 alb,
                  float spec, float shin, int cloth, v3 *acc, float *vis_out) {
    v3 L = sub(lp, p);
    float d2 = dot(L, L);
    float d = sqrtf(d2);
    L = mul(L, 1.0f / d);
    float ndl = dot(n, L);
    float wrap = cloth ? 0.25f : 0.0f;
    float nl = (ndl + wrap) / (1 + wrap);
    if (nl <= 0) { if (vis_out) *vis_out = 0; return; }
    float vis = sh_steps > 0 ? shadow(add(p, mul(n, 0.006f)), L, d - 0.2f, sh_k, sh_steps) : 1.0f;
    if (vis_out) *vis_out = vis;
    if (vis <= 0) return;
    float E = I / (d2 + 0.05f) * vis;
    v3 H = nrm(add(L, vdir));
    float nh = maxf(dot(n, H), 0);
    if (metal) {
        float sh = 2.0f / (rough * rough + 0.002f);
        float s = powf(nh, sh) * (sh + 8) / 25.0f;
        float k = E * (s * 0.5f + 0.20f * nl);
        *acc = add(*acc, mul(vm(f0, lc), k));
    } else {
        v3 c = mul(vm(alb, lc), E * nl);
        if (cloth) {
            float nv = clampf(dot(n, vdir), 0, 1);
            float sheen = powf(1.0f - nv, 3.0f) * 0.55f;
            c = add(c, mul(vm(lc, V(0.75f, 0.10f, 0.11f)), E * sheen * 0.5f * clampf(ndl + 0.4f, 0, 1)));
        }
        float s = powf(nh, shin) * spec * (shin + 8) / 25.0f;
        c = add(c, mul(lc, E * s * clampf(ndl * 4, 0, 1)));
        *acc = add(*acc, c);
    }
}

INL v3 emission(int m, v3 p, v3 n) {
    switch (m) {
    case M_LENS: return mul(V(1.0f, 0.72f, 0.40f), LENS_E);
    case M_GEM: return mul(V(1.0f, 0.55f, 0.18f), 0.9f);
    case M_GLASS: {
        float wx = fabsf(p.x) - 2.35f;
        /* os vidros em losango com o chumbo escuro */
        float a = (wx + p.y) * 9.0f, b = (wx - p.y) * 9.0f;
        float fa = a - floorf(a), fb = b - floorf(b);
        float lead = sstep(0.0f, 0.07f, fa) * sstep(1.0f, 0.93f, fa) * sstep(0.0f, 0.07f, fb) * sstep(1.0f, 0.93f, fb);
        float hue = hash3((int)floorf(a), (int)floorf(b), 3);
        float glow = 0.7f + 0.6f * sstep(1.3f, 4.0f, p.y);
        v3 c = mixv(V(0.24f, 0.15f, 0.60f), V(0.52f, 0.36f, 0.88f), hue);
        return mul(c, GLASS_E * glow * (0.1f + 0.9f * lead));
    }
    case M_DAIS: {
        if (n.y < 0.9f) return V(0, 0, 0);
        float r = sqrtf((p.x - RING_X) * (p.x - RING_X) + (p.z - RING_Z) * (p.z - RING_Z));
        float band = sstep(0.026f, 0.014f, fabsf(r - RING_R)) + 0.7f * sstep(0.016f, 0.007f, fabsf(r - 0.64f));
        return mul(V(1.0f, 0.64f, 0.30f), band * BAND_E);
    }
    case M_CABLE: {
        /* o Âmbar dos cabos aparece nas emendas, fraco */
        float s = sinf((p.y + p.z) * 26.0f);
        return mul(V(1.0f, 0.5f, 0.15f), 0.10f * sstep(0.9f, 1.0f, s));
    }
    default: return V(0, 0, 0);
    }
}

/* a cor de um ponto da cena */
static v3 shade(v3 p, v3 n, v3 rd, int m, int full, float *key_vis) {
    v3 vdir = mul(rd, -1.0f);
    float spec, shin, rough = 0.3f;
    int metal = is_metal(m);
    v3 f0 = V(0, 0, 0), alb = V(0, 0, 0);
    if (metal) f0 = metal_f0(m, &rough);
    else alb = albedo(m, p, n, &spec, &shin);
    if (m == M_ORB) { metal = 1; f0 = V(0.05f, 0.05f, 0.06f); rough = 0.03f; }
    if (m == M_GEM) { metal = 1; f0 = V(0.9f, 0.5f, 0.15f); rough = 0.05f; }
    int cloth = (m == M_CLOTH || m == M_VELVET || m == M_ROBE);
    v3 acc = V(0, 0, 0);
    float occ = full ? ao(p, n) : 1.0f;
    float kv = 0;
    /* a pedra de Âmbar */
    light_pt(p, n, vdir, KEY_P, V(1.0f, 0.68f, 0.36f), KEY_I, 40.0f, full ? 72 : 0, metal, f0, rough, alb, spec, shin, cloth, &acc, &kv);
    if (key_vis) *key_vis = kv;
    /* o círculo de runas: dez pontos no anel */
    for (int i = 0; i < 10; i++) {
        float a = i * 0.6283185f + 0.3f;
        v3 lp = V(RING_X + cosf(a) * RING_R, DAIS_Y + 0.02f, RING_Z + sinf(a) * RING_R);
        light_pt(p, n, vdir, lp, V(1.0f, 0.60f, 0.28f), RING_I * 0.1f, 5.0f, full ? 24 : 0, metal, f0, rough, alb, spec, shin, cloth, &acc, 0);
    }
    /* as lancetas do fundo (roxo) e as janelas do lado, fora do quadro */
    for (int s = -1; s <= 1; s += 2) {
        for (int j = 0; j < 3; j++) {
            v3 lp = V(s * 2.35f, 1.9f + 0.75f * j, -0.12f);
            light_pt(p, n, vdir, lp, V(0.45f, 0.36f, 0.95f), WIN_I / 3.0f, 8.0f, full ? 32 : 0, metal, f0, rough, alb, spec, shin, cloth, &acc, 0);
            /* as do lado entram como fachos apontados para o trono */
            v3 lq = V(s * 4.5f, 2.4f + 0.6f * j, 1.3f + 0.3f * j);
            float sc = dot(nrm(sub(p, lq)), nrm(sub(V(0, 1.45f, 1.0f), lq)));
            float sf = sstep(0.955f, 0.985f, sc);
            if (sf > 0) light_pt(p, n, vdir, lq, V(0.42f, 0.36f, 0.92f), SIDE_I / 3.0f * sf, 8.0f, full ? 32 : 0, metal, f0, rough, alb, spec, shin, cloth, &acc, 0);
        }
    }
    /* o salão comprido atrás da câmera: as runas do chão acesas lá longe (uma luz larga e fraca) */
    for (int j = 0; j < 2; j++) {
        v3 lf = V(-1.2f + 2.4f * j, 1.2f, 11.0f);
        light_pt(p, n, vdir, lf, V(1.0f, 0.66f, 0.40f), P[11] * 0.5f * 25.0f, 3.0f, 0, metal, f0, rough, alb, spec, shin, cloth, &acc, 0);
    }
    /* o ambiente: o roxo de cima e o quente que o estrado devolve por baixo */
    float up = 0.5f + 0.5f * n.y;
    float r = sqrtf((p.x - RING_X) * (p.x - RING_X) + (p.z - RING_Z) * (p.z - RING_Z));
    float bounce = (KEY_I * 0.010f + RING_I * 0.015f) / (1.0f + (r / 1.3f) * (r / 1.3f)) / (1.0f + maxf(p.y - DAIS_Y, 0) * 1.5f);
    v3 amb = add(mul(V(0.030f, 0.026f, 0.055f), AMB_I * up), mul(V(1.0f, 0.55f, 0.28f), bounce * (1 - up)));
    if (metal) {
        v3 R = refl(rd, n);
        float fr = powf(1.0f - clampf(dot(n, vdir), 0, 1), 5.0f);
        v3 F = add(f0, mul(sub(V(1, 1, 1), f0), fr));
        acc = add(acc, mul(vm(F, env(p, R, rough)), occ));
        acc = add(acc, mul(vm(f0, amb), occ * 0.3f));
    } else {
        acc = add(acc, mul(vm(alb, amb), occ));
    }
    acc = add(acc, emission(m, p, n));
    return acc;
}

/* um raio da câmera: a cor, o reflexo do estrado e as máscaras */
static void trace(v3 ro, v3 rd, float *acc, unsigned int *seed) {
    float t = 0.05f;
    hit_t h; int hit = 0;
    for (int i = 0; i < 300 && t < 40.0f; i++) {
        v3 p = add(ro, mul(rd, t));
        h = map(p, 0);
        if (h.d < 0.00035f * t) { hit = 1; break; }
        t += h.d * 0.92f;
    }
    if (!hit) return;
    v3 p = add(ro, mul(rd, t));
    v3 n = normal_at(p);
    float kv = 0;
    v3 c = shade(p, n, rd, h.m, 1, &kv);
    acc[0] += c.x; acc[1] += c.y; acc[2] += c.z;
    /* o estrado polido reflete (um reflexo só, com a sombra simples) */
    if ((h.m == M_DAIS || h.m == M_STEP) && n.y > 0.9f && REFL_K > 0) {
        v3 R = refl(rd, n);
        *seed = *seed * 1664525u + 1013904223u;
        float j1 = ((*seed >> 8) & 0xffff) / 65535.0f - 0.5f;
        *seed = *seed * 1664525u + 1013904223u;
        float j2 = ((*seed >> 8) & 0xffff) / 65535.0f - 0.5f;
        R = nrm(add(R, V(j1 * 0.03f, 0, j2 * 0.03f)));
        float t2 = 0.01f;
        hit_t h2; int hit2 = 0;
        v3 ro2 = add(p, mul(n, 0.002f));
        for (int i = 0; i < 160 && t2 < 12.0f; i++) {
            h2 = map(add(ro2, mul(R, t2)), 0);
            if (h2.d < 0.0006f * (t2 + 1)) { hit2 = 1; break; }
            t2 += h2.d * 0.95f;
        }
        if (hit2) {
            v3 p2 = add(ro2, mul(R, t2));
            v3 n2 = normal_at(p2);
            v3 c2 = shade(p2, n2, R, h2.m, 0, 0);
            float fr = 0.04f + 0.96f * powf(1.0f - clampf(dot(n, mul(rd, -1)), 0, 1), 5.0f);
            float k = fr * REFL_K;
            acc[3] += c2.x * k; acc[4] += c2.y * k; acc[5] += c2.z * k;
        }
    }
    acc[6] += t;
    acc[7] += n.x; acc[8] += n.y; acc[9] += n.z;
    acc[10 + h.g] += 1.0f;
    acc[10 + NG] += kv;
}

/* ---------------------------------------------------------------- preparo */
static float hood_front_z(float x, float y) {
    float z = 1.2f;
    for (int i = 0; i < 200; i++) {
        float d = hood_d(V(x, y, z));
        if (d < 0.0005f) return z;
        z -= maxf(d, 0.001f);
        if (z < 0.6f) break;
    }
    return -1;
}
static float cuirass_front_z(float x, float y) {
    float z = 1.3f;
    for (int i = 0; i < 200; i++) {
        float d = cuirass_d(V(x, y, z));
        if (d < 0.0005f) return z;
        z -= maxf(d, 0.001f);
        if (z < 0.6f) break;
    }
    return -1;
}

void setup(const float *prm) {
    for (int i = 0; i < 32; i++) P[i] = prm[i];
    TB_C = (TB_H * TB_H - TB_A * TB_A) / (2 * TB_A);
    TB_R = TB_C + TB_A;
    KEY_P = V(RING_X, DAIS_Y + 0.08f, RING_Z);
    NB = 0;
    /* os fios de contas do capuz: três de cada lado da abertura */
    for (int s = -1; s <= 1; s += 2) {
        for (int k = 0; k < 3; k++) {
            float x0 = s * (0.104f + 0.017f * k), y0 = 1.955f - 0.012f * k;
            int nb = 8 - k;
            for (int j = 0; j < nb && NB < NBEAD; j++) {
                float y = y0 - j * 0.0215f;
                float x = x0 + s * 0.004f * j;
                float z = hood_front_z(x, y);
                if (z < 0) continue;
                BEAD[NB] = V(x, y, z + 0.006f);
                BEAD_R[NB] = 0.0085f;
                NB++;
            }
        }
    }
    /* o rosário: dos ombros até a pedra negra */
    for (int s = -1; s <= 1; s += 2) {
        for (int j = 0; j < 12 && NB < NBEAD; j++) {
            float t = (j + 0.5f) / 12.0f;
            float x = s * 0.135f * (1 - t) * (1.0f - 0.25f * t);
            float y = 1.615f - 0.14f * t - 0.04f * sinf(3.14159f * t);
            if (y < 1.497f) y = 1.497f + (1 - t) * 0.01f;
            float z = cuirass_front_z(x, y);
            if (z < 0) continue;
            BEAD[NB] = V(x, y, z + 0.009f);
            BEAD_R[NB] = 0.0115f;
            NB++;
        }
    }
    /* os cabos */
    for (int i = 0; i < NCAB; i++) {
        float t = i / (float)(NCAB - 1);
        CAB[1][i] = bez(V(1.04f, 3.18f, 0.515f), V(1.38f, 3.22f, 0.56f), V(1.62f, 4.3f, 0.85f), V(1.85f, 6.9f, 1.35f), t);
        CAB[0][i] = V(-CAB[1][i].x, CAB[1][i].y, CAB[1][i].z);
    }
}

/* cam: cx cy cz tx ty tz f; out: H*W*NOUT */
/* renderiza a janela [x0,x1) x [y0,y1) do quadro W x H; out tem (y1-y0) x (x1-x0) x NOUT */
void render(int W, int H, int ss, int x0, int x1, int y0, int y1, const float *cam, float *out) {
    v3 C = V(cam[0], cam[1], cam[2]);
    v3 T = V(cam[3], cam[4], cam[5]);
    float f = cam[6];
    v3 fw = nrm(sub(T, C));
    v3 rt = nrm(cross(fw, V(0, 1, 0)));
    v3 up = cross(rt, fw);
    #pragma omp parallel for schedule(dynamic, 1)
    for (int py = y0; py < y1; py++) {
        unsigned int seed = 1234567u + py * 7919u;
        for (int px = x0; px < x1; px++) {
            float acc[NOUT];
            memset(acc, 0, sizeof(acc));
            for (int sy = 0; sy < ss; sy++)
                for (int sx = 0; sx < ss; sx++) {
                    float u = (px + (sx + 0.5f) / ss - W * 0.5f) / f;
                    float v = (py + (sy + 0.5f) / ss - H * 0.5f) / f;
                    v3 rd = nrm(add(fw, sub(mul(rt, u), mul(up, v))));
                    trace(C, rd, acc, &seed);
                }
            float k = 1.0f / (ss * ss);
            for (int i = 0; i < NOUT; i++) out[((size_t)(py - y0) * (x1 - x0) + (px - x0)) * NOUT + i] = acc[i] * k;
        }
    }
}

int nout(void) { return NOUT; }
