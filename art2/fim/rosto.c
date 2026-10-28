/* Final II, plano 4: o rosto dela, a última lembrança, nítida. De perto, de capuz vermelho; a luz quente do
 * núcleo vem do alto à esquerda, o roxo da noite contorna pela direita, por trás.
 *
 * A cabeça em metros, no espaço dela: x para a esquerda dela (a direita de quem olha), y para cima, z para a
 * frente. A origem fica no meio da cabeça, na altura dos olhos.
 *
 * gcc -O3 -march=native -ffast-math -fopenmp -shared -fPIC rosto.c -o rosto.so -lm */
#include "rm.h"
#include <omp.h>

enum { M_NONE = 0, M_SKIN, M_LIP, M_EYE, M_LID, M_HAIR, M_HOOD, M_HOODIN, M_KNOT, M_DRESS, M_BG, NMAT };
enum { G_BG = 0, G_SKIN, G_EYE, G_HAIR, G_HOOD, G_LIP, G_X1, G_X2, NG };
/* as camadas: 0-2 a cor (sem o difuso da pele), 3-5 a luz que chega na pele (o difuso dela sem a cor, para
 * espalhar por baixo da pele no Python), 6 a distância, 7-9 a normal, 10.. os grupos, depois a cor da pele */
#define NOUT (10 + NG + 3)
#define O_ALB (10 + NG)

typedef struct { float d; int m, g; } hit_t;
#define UPD(h, dist, mat, grp) do { float _d = (dist); if (_d < (h)->d) { (h)->d = _d; (h)->m = (mat); (h)->g = (grp); } } while (0)

static float P[32];
#define KEY_I P[0]
#define RIM_I P[1]
#define FILL_I P[2]
#define AMB_I P[3]
/* P[4..6]: a câmera (para o olhar); P[7..9]: o giro da cabeça */
#define CLAY P[10]
#define SMILE P[11]
#define DRESS P[12]
static v3 CAMP;
static v3 HP, HX, HY, HZ;
/* os olhos: o centro dos globos e o raio; para onde cada um olha (no espaço da cabeça) */
#define EX 0.0302f
#define EY 0.0f
#define EZ 0.0668f
#define ER 0.0131f
static v3 EYE_L, EYE_R, GAZE_L, GAZE_R;
static float GE;   /* para onde o olhar sobe (em ângulo): as pálpebras acompanham */

INL v3 to_head(v3 p) { v3 q = sub(p, HP); return V(dot(q, HX), dot(q, HY), dot(q, HZ)); }
INL v3 from_head_dir(v3 d) { return add(add(mul(HX, d.x), mul(HY, d.y)), mul(HZ, d.z)); }

/* ---------------------------------------------------------------- a pele: crânio, rosto, nariz, boca */
INL v3 mouth_space(v3 p) {
    /* a boca dá a volta no arco dos dentes; no sorriso os cantos sobem e vão um pouco para trás */
    float x2 = p.x * p.x;
    return V(p.x, p.y - SMILE * 9.0f * x2, p.z + (17.0f + SMILE * 2.5f) * x2);
}
/* o perfil do meio do rosto (sem o nariz e os lábios): a frente z na altura y */
static const float PY[] = {-0.112f, -0.104f, -0.096f, -0.086f, -0.076f, -0.066f, -0.056f, -0.046f, -0.036f, -0.025f, -0.010f, 0.006f, 0.018f, 0.030f, 0.050f, 0.070f, 0.090f, 0.105f, 0.118f};
static const float PZ[] = { 0.040f,  0.074f,  0.0880f, 0.0912f, 0.0862f, 0.0858f, 0.0872f, 0.0902f, 0.0902f, 0.0880f, 0.0850f, 0.0840f, 0.0880f, 0.0888f, 0.0880f, 0.0850f, 0.0765f, 0.0630f, 0.0420f};
#define NPF 19
static float PM[NPF];   /* as segundas derivadas da spline natural (calculadas no setup) */
static void prof_setup(void) {
    float u[NPF];
    PM[0] = u[0] = 0;
    for (int i = 1; i < NPF - 1; i++) {
        float sig = (PY[i] - PY[i - 1]) / (PY[i + 1] - PY[i - 1]);
        float pp = sig * PM[i - 1] + 2.0f;
        PM[i] = (sig - 1.0f) / pp;
        u[i] = (PZ[i + 1] - PZ[i]) / (PY[i + 1] - PY[i]) - (PZ[i] - PZ[i - 1]) / (PY[i] - PY[i - 1]);
        u[i] = (6.0f * u[i] / (PY[i + 1] - PY[i - 1]) - sig * u[i - 1]) / pp;
    }
    PM[NPF - 1] = 0;
    for (int k = NPF - 2; k >= 0; k--) PM[k] = PM[k] * PM[k + 1] + u[k];
}
INL float prof(float y) {
    if (y <= PY[0]) return PZ[0] + (y - PY[0]) * 4.0f;
    if (y >= PY[NPF - 1]) return PZ[NPF - 1] - (y - PY[NPF - 1]) * 6.0f;
    int i = 0;
    while (y > PY[i + 1]) i++;
    float h = PY[i + 1] - PY[i];
    float A = (PY[i + 1] - y) / h, B = 1 - A;
    return A * PZ[i] + B * PZ[i + 1] + ((A * A * A - A) * PM[i] + (B * B * B - B) * PM[i + 1]) * (h * h) / 6.0f;
}
/* passo suave de segunda ordem (sem quina na curvatura) */
INL float s5(float e0, float e1, float x) { float t = clampf((x - e0) / (e1 - e0), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
INL float gauss2(float x, float y, float cx, float cy, float sx, float sy) {
    float u = (x - cx) / sx, v = (y - cy) / sy;
    return expf(-(u * u + v * v));
}
/* os lábios como relevo sobre o rosto: o de cima desce da beira (com o arco do cupido e a crista da beira) até a
 * fenda, cheio perto da beira; o de baixo, mais cheio, desce da fenda até a beira de baixo, mais suave. y já com o
 * sorriso (os cantos sobem); *wl = o quanto é lábio (a cor) */
#define YS (-0.0574f)
INL float lip_border_up(float x) {
    float ax = fabsf(x);
    float w = clampf(1.0f - (x * x) / (0.0235f * 0.0235f), 0, 1);
    float pk = (ax - 0.0055f) / 0.0035f;
    return YS + 0.0068f * powf(w, 0.6f) + 0.0010f * expf(-pk * pk) * w - 0.0006f * expf(-(x * x) / (0.0025f * 0.0025f));
}
INL float lip_border_lo(float x) {
    float w = clampf(1.0f - (x * x) / (0.0210f * 0.0210f), 0, 1);
    return YS - 0.0096f * sqrtf(w);
}
INL float lips_h(float x, float y, float *wl) {
    float tw = sqrtf(clampf(1.0f - (x * x) / (0.0240f * 0.0240f), 0, 1));
    float h = 0, w = 0;
    if (tw <= 0) { *wl = 0; return 0; }
    if (y >= YS) {
        float yb = lip_border_up(x);
        float hu = maxf(yb - YS, 1e-4f);
        float u = (yb - y) / hu;
        if (u >= 0) { h = 0.0055f * (0.55f + 0.45f * sinf(3.14159f * minf(u, 1.0f))) * (1.0f - 0.25f * u * u); w = 1; }
        else { float e = (y - yb) / 0.0010f; h = 0.0055f * 0.55f * expf(-e * e); w = expf(-e * e * 6.0f); }
    } else {
        float ylb = lip_border_lo(x);
        float hl = maxf(YS - ylb, 1e-4f);
        float u = (YS - y) / hl;
        if (u <= 1) { h = 0.0060f * (0.5f + 0.5f * sinf(3.14159f * powf(u, 0.9f))) * (1.0f - 0.35f * u * u * u); w = 1; }
        else { float e = (ylb - y) / 0.0040f; h = 0.0060f * 0.325f * expf(-e * e); w = expf(-e * e * 5.0f); }
    }
    *wl = w * sstep(0.0f, 0.25f, tw);
    return h * tw;
}
/* a frente do rosto como relevo: o perfil, a curva para os lados e as formas suaves por cima */
INL float Fh(float x, float y) {
    float x2 = x * x, ax = fabsf(x);
    float K = 7.0f + 9.0f * s5(-0.010f, -0.075f, y) + 3.0f * s5(-0.065f, -0.100f, y) + 3.0f * s5(-0.035f, -0.085f, y) - 1.5f * s5(0.04f, 0.09f, y);
    float K4 = 2100.0f * s5(-0.085f, -0.010f, y);
    float z = prof(y) - K * x2 - K4 * x2 * x2;
    z -= 0.0070f * gauss2(ax, y, EX - 0.002f, 0.002f, 0.0125f, 0.0105f);  /* a órbita */
    z += 0.0025f * gauss2(ax, y, 0.047f, 0.000f, 0.0080f, 0.0100f);   /* a beira de fora da órbita */
    z -= 0.0075f * gauss2(ax, y, 0.0170f, 0.000f, 0.0055f, 0.0075f); /* a lateral do nariz, funda no canto do olho */
    z += 0.0018f * gauss2(ax, y, 0.026f, 0.021f, 0.0180f, 0.0080f);  /* o osso da sobrancelha */
    z += 0.003f * gauss2(ax, y, 0.046f, -0.014f, 0.0140f, 0.0100f);  /* a maçã do rosto */
    z += 0.0035f * gauss2(ax, y, 0.033f, -0.025f, 0.0130f, 0.0120f); /* a maçã do rosto, cheia */
    z += 0.002f * gauss2(x, y, 0.0f, -0.089f, 0.0120f, 0.0085f);     /* o queixo */
    float wl;
    z += lips_h(x, y - SMILE * 9.0f * x2, &wl);
    /* no sorriso a maçã do rosto sobe e o sulco do nariz até o canto da boca aparece */
    z += SMILE * 0.0040f * gauss2(ax, y, 0.034f, -0.024f, 0.012f, 0.011f);
    {
        float ux = 0.030f - 0.0165f, uy = -0.064f + 0.031f;
        float tt = clampf(((ax - 0.0165f) * ux + (y + 0.031f) * uy) / (ux * ux + uy * uy), 0, 1);
        float dx = ax - (0.0165f + ux * tt), dy = y - (-0.031f + uy * tt);
        float dl = sqrtf(dx * dx + dy * dy);
        z -= SMILE * 0.0014f * expf(-(dl * dl) / (0.0024f * 0.0024f)) * sstep(0.0f, 0.15f, tt) * sstep(1.0f, 0.75f, tt);
    }
    return z;
}
INL float ell2(float x, float y, float rx, float ry) {
    float k0 = sqrtf(x * x / (rx * rx) + y * y / (ry * ry));
    float k1 = sqrtf(x * x / (rx * rx * rx * rx) + y * y / (ry * ry * ry * ry));
    return k1 > 1e-9f ? k0 * (k0 - 1) / k1 : -minf(rx, ry);
}
/* encurta o rosto abaixo da boca: o y do relevo, do contorno e da mandíbula desce mais rápido que o de verdade */
INL float yfold(float y) {
    float d = -0.068f - y;
    return d > 0 ? y - 0.38f * d * d / (d + 0.008f) : y;
}
INL float face_d(v3 p) {
    v3 q = V(fabsf(p.x), p.y, p.z);
    /* o crânio */
    float d = sd_ell(p, V(0, 0.030f, -0.012f), V(0.0705f, 0.0895f, 0.0930f));
    /* a frente: o relevo, dentro do contorno do rosto (visto de frente), até a altura das orelhas */
    if (p.z > -0.06f) {
        const float e = 0.0004f;
        float yr = yfold(p.y);
        float z0 = Fh(p.x, yr);
        float gx = (Fh(p.x + e, yr) - Fh(p.x - e, yr)) / (2 * e);
        float gy = (Fh(p.x, yfold(p.y + e)) - Fh(p.x, yfold(p.y - e))) / (2 * e);
        float hf = (p.z - z0) / sqrtf(1 + gx * gx + gy * gy);
        float gv = 1.0f + 0.40f * s5(-0.060f, -0.110f, yr);
        float ol = smin(ell2(p.x * gv, yr + 0.0225f, 0.0535f, 0.090f) / gv, ell2(p.x, yr - 0.030f, 0.0705f, 0.0895f), 0.018f);
        float fp = smax(hf, ol, 0.014f);
        fp = smax(fp, -(p.z + 0.030f), 0.02f);
        /* a beira de baixo da mandíbula: do queixo sobe para trás, até o canto embaixo da orelha */
        float yj = -0.1125f + 0.40f * maxf(0.0f, 0.072f - p.z);
        fp = smax(fp, (yj - yr) * 0.80f, 0.010f);
        d = smin(d, fp, 0.015f);
    }
    /* o pescoço */
    d = smin(d, sd_cap(p, V(0, -0.088f, -0.032f), V(0, -0.27f, -0.040f), 0.0460f), 0.016f);
    /* o nariz: o dorso, a ponta, as asas */
    float nose = sd_rcone(p, V(0, 0.0080f, 0.0832f), V(0, -0.0190f, 0.1020f), 0.0034f, 0.0055f);
    nose = smin(nose, sd_ell(p, V(0, -0.0215f, 0.0925f), V(0.0090f, 0.0112f, 0.0085f)), 0.007f);
    nose = smin(nose, sd_ell(p, V(0, -0.0236f, 0.1022f), V(0.0060f, 0.0056f, 0.0058f)), 0.008f);
    nose = smin(nose, sd_ell(q, V(0.0094f, -0.0296f, 0.0935f), V(0.0036f, 0.0041f, 0.0054f)), 0.0075f);
    d = smin(d, nose, 0.007f);
    /* as narinas */
    d = smax(d, -sd_ell(q, V(0.0056f, -0.0350f, 0.0975f), V(0.0022f, 0.0011f, 0.0030f)), 0.0012f);
    /* a boca */
    v3 m = mouth_space(p);
    v3 mq = V(fabsf(m.x), m.y, m.z);
    /* o filtro */
    d = smax(d, -sd_ell(m, V(0, -0.0440f, 0.0918f), V(0.0028f, 0.0060f, 0.0022f)), 0.002f);
    /* a linha da boca */
    {
        /* a fenda entre os lábios, afinando até os cantos (sem a elipse achatada, que vaza para os lados) */
        float ex = clampf(1.0f - (m.x * m.x) / (0.0230f * 0.0230f), 0, 1);
        float slit = fabsf(m.y + 0.0574f) - 0.00055f * sqrtf(ex);
        slit = maxf(slit, maxf(fabsf(m.x) - 0.0230f, 0.0835f - m.z));
        d = smax(d, -slit, 0.0014f);
    }
    /* os cantos da boca, recolhidos */
    d = smax(d, -sd_sphere(V(fabsf(m.x), m.y, m.z), V(0.0234f, -0.0570f, 0.0838f), 0.0012f), 0.0025f);
    return d;
}
INL float lip_w(v3 p) {
    float w;
    lips_h(p.x, p.y - SMILE * 9.0f * p.x * p.x, &w);
    return w;
}

/* ---------------------------------------------------------------- os olhos e as pálpebras */
/* a abertura do olho em ângulos em volta do globo: fd < 0 dentro dela; uo = a distância (em ângulo) até a beira
 * de cima (> 0 acima dela), to = de 0 (canto de dentro) a 1 (canto de fora) */
INL float lid_open(v3 q, float side, float *uo, float *to) {
    float lx = q.x * side;
    float a = atan2f(lx, q.z);
    float b = atan2f(q.y, sqrtf(lx * lx + q.z * q.z));
    const float A0 = -1.38f, A1 = 1.30f, B0 = -0.11f, B1 = 0.07f;
    float t = clampf((a - A0) / (A1 - A0), 0, 1);
    float base = mixf(B0, B1, t);
    float sh = sinf(3.14159f * t);
    float hu = 0.41f * powf(sinf(3.14159f * powf(t, 0.85f)), 0.75f) + 0.75f * GE * sh;
    float hl = 0.45f * (1.0f - 0.34f * SMILE) * powf(sinf(3.14159f * powf(t, 1.15f)), 0.85f) - 0.35f * GE * sh;
    float u = b - (base + hu), l = (base - hl) - b;
    *uo = u; *to = t;
    return maxf(maxf(u, l), maxf(A0 - a, a - A1));
}
/* a pele em volta de um olho: a pele colada no globo (as pálpebras), a abertura cortada, a carúncula e o vinco
 * da pálpebra de cima */
INL float eye_skin(float f, v3 p, v3 c, float side) {
    v3 q = sub(p, c);
    float r = len(q);
    if (r > 0.045f) return f;
    f = smin(f, r - (ER + 0.0018f), 0.0040f);
    float u, t;
    float fd = lid_open(q, side, &u, &t);
    /* nos cantos o corte fica raso (a pele fecha o canto; sem ver por trás do globo) */
    float sh = sinf(3.14159f * t);
    f = smax(f, -maxf(fd * r * 0.8f, r - (ER + 0.0030f + 0.0032f * sh)), 0.0007f);
    v3 cc = V(-side * ER * 0.93f, -0.0016f, ER * 0.36f);
    f = smin(f, sd_ell(q, cc, V(0.0026f, 0.0021f, 0.0030f)), 0.0012f);
    /* o vinco: uma dobra larga e rasa, que some antes dos cantos */
    float wc = sstep(0.0f, 0.25f, t) * sstep(1.0f, 0.70f, t) * sstep(0.022f, 0.016f, r);
    f += 0.0006f * expf(-(u - 0.55f) * (u - 0.55f) / 0.015f) * wc;
    return f;
}
INL float eye_d(v3 p, v3 c, v3 g) {
    float d = sd_sphere(p, c, ER);
    return smin(d, sd_sphere(p, add(c, mul(g, 0.0058f)), 0.0078f), 0.0008f);
}

/* ---------------------------------------------------------------- o cabelo */
/* a janela do rosto (vista de frente): ali, na frente, não tem cabelo */
INL float face_window(v3 p) {
    float w = ell2(p.x, p.y + 0.006f, 0.0515f, 0.081f);
    /* da risca o cabelo cai para os lados e cobre os cantos da testa */
    w = smax(w, 0.652f * fabsf(p.x) + 0.758f * p.y - 0.0575f, 0.022f);
    return maxf(w, 0.004f - p.z);
}
/* a coordenada que atravessa os fios: risca no meio, os fios descem pelos lados, empilhados da frente para trás */
INL float hair_across(v3 p) {
    float top = p.z + 0.0015f * sinf(p.y * 140.0f + p.x * 60.0f);
    float cur = 0.030f * atan2f(p.z - 0.005f, fabsf(p.x) - 0.040f) + 0.0012f * sinf(p.y * 90.0f);
    return mixf(top, cur, sstep(0.05f, 0.0f, p.y));
}
INL float hair_d(v3 p) {
    v3 q = V(fabsf(p.x), p.y, p.z);
    /* a calota por cima do crânio */
    float d = sd_ell(p, V(0, 0.030f, -0.002f), V(0.0775f, 0.1000f, 0.1060f));
    /* as cortinas dos lados, caindo na frente das orelhas até o pescoço */
    d = smin(d, smax(sd_ell(q, V(0.056f, -0.020f, 0.002f), V(0.0150f, 0.075f, 0.034f)), -(p.y + 0.060f), 0.015f), 0.02f);
    /* o cabelo de trás, dentro do capuz */
    d = smin(d, sd_ell(p, V(0, -0.06f, -0.055f), V(0.070f, 0.12f, 0.050f)), 0.03f);
    /* a risca */
    d += 0.0012f * expf(-(p.x * p.x) / 0.000006f) * sstep(0.05f, 0.085f, p.y) * sstep(-0.04f, 0.02f, p.z);
    /* o rosto aparece; perto dele o cabelo afina até deitar na pele (sem parede na beira) */
    float fw = face_window(p);
    d += 0.0045f * clampf(1.0f - fw / 0.012f, 0, 1) * sstep(-0.01f, 0.01f, p.z);
    d = smax(d, -fw, 0.004f);
    /* as mechas (ondas ao longo dos fios) e os fios */
    float s = hair_across(p);
    float al = p.y + 0.6f * fabsf(p.x);
    float c0 = vnoise(V(s * 160.0f, al * 9.0f, 9.5f));
    float c1 = vnoise(V(s * 520.0f, al * 22.0f, 0.5f));
    float c2 = vnoise(V(s * 1900.0f, al * 70.0f, 3.5f));
    d += 0.0010f * sinf(s * 330.0f + 4.0f * c0) + 0.00060f * (c1 - 0.5f) + 0.00022f * (c2 - 0.5f);
    return d;
}

/* ---------------------------------------------------------------- o capuz, a capa e o nó */
INL float hood_outer(v3 p) {
    /* o capuz folgado: maior atrás e em cima; embaixo vira a capa, abrindo para os ombros */
    float o = sd_ell(p, V(0, 0.035f, -0.035f), V(0.118f, 0.126f, 0.134f));
    /* a capa: justa no pescoço (onde o nó prende), abrindo nos ombros; mais larga que funda */
    {
        float y = p.y;
        float r = 0.082f - 0.010f * s5(-0.06f, -0.12f, y) + 0.085f * s5(-0.125f, -0.215f, y) + 0.05f * s5(-0.20f, -0.32f, y);
        float dr = (0.082f - 0.010f * s5(-0.06f, -0.12f, y + 0.002f) + 0.085f * s5(-0.125f, -0.215f, y + 0.002f) + 0.05f * s5(-0.20f, -0.32f, y + 0.002f) - r) / 0.002f;
        float zc = -0.040f - 0.010f * s5(-0.10f, -0.25f, y);
        float cape = ell2(p.x, p.z - zc, r * 1.05f, r * 0.82f) / sqrtf(1.0f + dr * dr);
        cape = smax(cape, -(y + 0.36f), 0.02f);
        cape = smax(cape, y + 0.02f, 0.03f);
        o = smin(o, cape, 0.035f);
    }
    float ang = atan2f(p.x, -(p.z + 0.03f));
    /* as dobras da capa: começam nos ombros e crescem para baixo, quase verticais */
    float fa = 0.011f * s5(-0.15f, -0.34f, p.y);
    o += fa * sinf(ang * 9.0f + 0.8f * sinf(ang * 2.0f + 1.0f) + p.y * 6.0f);
    o += fa * 0.45f * sinf(ang * 15.0f + 2.1f - p.y * 9.0f);
    /* as do colo, descendo do nó */
    o += 0.0035f * sinf(p.x * 160.0f + 0.5f) * s5(-0.13f, -0.20f, p.y) * sstep(0.0f, 0.06f, p.z);
    /* as do capuz: largas, saindo do alto de trás */
    o += 0.0040f * sinf(ang * 5.0f - p.y * 18.0f + 0.8f) * s5(-0.10f, 0.04f, p.y) * sstep(0.05f, -0.06f, p.z);
    return o;
}
/* a abertura do rosto: o que fica na frente da beira (z > zo), acima da curva que desce dos lados do rosto até o
 * nó no pescoço; perto do pescoço a beira vem para trás e mostra o pescoço */
INL float hood_cut(v3 p) {
    float zo = 0.046f + 0.034f * s5(0.02f, 0.12f, p.y) + 0.003f * sinf(p.y * 60.0f + 0.5f) + 0.002f * sinf(p.x * 80.0f);
    zo = mixf(zo, 0.012f, s5(-0.05f, -0.11f, p.y));
    float ax = fabsf(p.x) / 0.082f;
    float above = p.y - (-0.140f + 0.12f * ax * ax * sqrtf(ax));
    return maxf(zo - p.z, -above);
}
INL float hood_d(v3 p, int *inner) {
    float o = hood_outer(p);
    float sh = maxf(o, -(o + 0.005f));
    float cut = hood_cut(p);
    /* embaixo do nó a capa abre um pouco e mostra o vestido */
    float gw = 0.003f + 0.10f * maxf(0.0f, -0.140f - p.y);
    float gap = maxf(fabsf(p.x) - gw, maxf(p.y + 0.138f, -p.z));
    cut = minf(cut, gap);
    float d = maxf(sh, -cut);
    /* a beira enrolada: um tubo seguindo a linha onde o pano termina */
    float tube = sqrtf((o + 0.0025f) * (o + 0.0025f) + cut * cut) - 0.0042f;
    d = smin(d, tube, 0.003f);
    *inner = o < -0.0025f && tube > 0.0005f;
    return d;
}
INL float knot_d(v3 p) {
    v3 k = V(0.0f, -0.134f, 0.036f);
    v3 kq = sub(p, k);
    float d = sd_ell(kq, V(0, 0, 0), V(0.011f, 0.010f, 0.009f));
    /* as duas alças do laço, para os lados */
    d = smin(d, sd_torus_z(V(fabsf(kq.x) - 0.016f, kq.y - 0.002f, kq.z * 1.3f), V(0, 0, 0), 0.0080f, 0.0032f), 0.003f);
    /* as pontas caindo */
    d = smin(d, sd_rcone(p, add(k, V(-0.004f, -0.006f, 0.002f)), add(k, V(-0.014f, -0.070f, 0.010f)), 0.0065f, 0.0045f), 0.004f);
    d = smin(d, sd_rcone(p, add(k, V(0.005f, -0.006f, 0.002f)), add(k, V(0.018f, -0.062f, 0.006f)), 0.0065f, 0.0045f), 0.004f);
    /* as faixas que saem da capa e entram no nó */
    d = smin(d, sd_rcone(p, V(-0.046f, -0.098f, 0.018f), add(k, V(-0.008f, 0.002f, 0)), 0.0070f, 0.0060f), 0.005f);
    d = smin(d, sd_rcone(p, V(0.046f, -0.098f, 0.018f), add(k, V(0.008f, 0.002f, 0)), 0.0070f, 0.0060f), 0.005f);
    return d;
}

/* ---------------------------------------------------------------- a cena */
INL hit_t map(v3 pw, int shadow) {
    hit_t h; h.d = 1e9f; h.m = M_NONE; h.g = G_BG;
    (void)shadow;
    if (CLAY < 0.5f) UPD(&h, -pw.z + 2.6f, M_BG, G_BG);
    v3 p = to_head(pw);
    float db = sd_box(p, V(0, -0.06f, 0), V(0.16f, 0.24f, 0.16f), 0.0f);
    if (db < h.d) {
        float f = face_d(p);
        float skin = p.x < 0 ? eye_skin(f, p, EYE_L, -1.0f) : eye_skin(f, p, EYE_R, 1.0f);
        UPD(&h, skin, M_SKIN, G_SKIN);
        if (h.m == M_SKIN && h.d < 0.002f && lip_w(p) > 0.5f) { h.m = M_LIP; h.g = G_LIP; }
        UPD(&h, eye_d(p, EYE_L, GAZE_L), M_EYE, G_EYE);
        UPD(&h, eye_d(p, EYE_R, GAZE_R), M_EYE, G_EYE);
    }
    if (DRESS > 0.5f) {
        float dh = sd_box(p, V(0, -0.03f, -0.01f), V(0.10f, 0.15f, 0.12f), 0.0f);
        if (dh < h.d) UPD(&h, hair_d(p), M_HAIR, G_HAIR);
        float dc = sd_box(p, V(0, -0.09f, -0.03f), V(0.25f, 0.24f, 0.24f), 0.0f);
        if (dc < h.d) {
            int inner;
            float hd = hood_d(p, &inner);
            UPD(&h, hd, inner ? M_HOODIN : M_HOOD, G_HOOD);
            UPD(&h, knot_d(p), M_KNOT, G_HOOD);
            /* o vestido escuro por baixo da capa */
            float dr = smin(sd_ell(p, V(0, -0.31f, -0.045f), V(0.150f, 0.19f, 0.092f)), sd_cap(p, V(0, -0.12f, -0.035f), V(0, -0.20f, -0.040f), 0.050f), 0.03f);
            UPD(&h, dr, M_DRESS, G_HOOD);
        }
    }
    return h;
}
INL float mapd(v3 p, int s) { return map(p, s).d; }

INL v3 normal_at(v3 p) {
    const float e = 0.00018f;
    v3 k1 = V(1, -1, -1), k2 = V(-1, -1, 1), k3 = V(-1, 1, -1), k4 = V(1, 1, 1);
    v3 n = add(add(mul(k1, mapd(add(p, mul(k1, e)), 0)), mul(k2, mapd(add(p, mul(k2, e)), 0))),
               add(mul(k3, mapd(add(p, mul(k3, e)), 0)), mul(k4, mapd(add(p, mul(k4, e)), 0))));
    return nrm(n);
}
INL float shadow(v3 ro, v3 rd, float maxt, float k, int steps) {
    float res = 1.0f, t = 0.0015f;
    for (int i = 0; i < steps && t < maxt; i++) {
        float hh = mapd(add(ro, mul(rd, t)), 1);
        if (hh < 0.00005f) return 0.0f;
        res = minf(res, k * hh / t);
        t += clampf(hh, 0.0006f, 0.04f);
    }
    return clampf(res, 0, 1);
}
INL float ao(v3 p, v3 n) {
    float occ = 0, sca = 1;
    for (int i = 0; i < 5; i++) {
        float hh = 0.0015f + 0.006f * i;
        float d = mapd(add(p, mul(n, hh)), 0);
        occ += (hh - d) * sca;
        sca *= 0.7f;
    }
    return clampf(1.0f - 12.0f * occ, 0, 1);
}

/* ---------------------------------------------------------------- as cores */
/* as sobrancelhas: escurecem a pele, em fios inclinados (no espaço da cabeça) */
INL float brows(v3 p) {
    float ax = fabsf(p.x);
    float t = clampf((ax - 0.011f) / (0.055f - 0.011f), 0, 1);
    /* o arco sobe até o pico a dois terços e desce para a ponta */
    float yc = 0.0205f + 0.0055f * sinf(clampf(t / 0.66f, 0, 1) * 1.5708f) - 0.0048f * s5(0.66f, 1.0f, t);
    float hw = mixf(0.0030f, 0.0011f, powf(t, 1.2f));
    float dy = p.y - yc;
    float b = expf(-(dy * dy) / (hw * hw)) * sstep(0.0f, 0.10f, t) * sstep(1.0f, 0.88f, t);
    /* os fios: no começo sobem, depois deitam para fora (ruído esticado ao longo deles) */
    float ang = mixf(1.1f, 0.30f, sstep(0.0f, 0.35f, t));
    float u = ax * cosf(ang) + dy * sinf(ang), v = -ax * sinf(ang) + dy * cosf(ang);
    b *= 0.55f + 0.75f * vnoise(V(u * 1500.0f, v * 9000.0f, 2.0f));
    return clampf(b * 0.75f, 0, 1) * sstep(0.06f, 0.075f, p.z) * (ax > 0.010f ? 1.0f : 0.0f);
}
INL v3 skin_albedo(v3 p, float *oily) {
    v3 base = V(0.74f, 0.51f, 0.41f);
    float ax = fabsf(p.x);
    float blush = gauss2(ax, p.y, 0.040f, -0.024f, 0.017f, 0.015f);
    float nose = gauss2(p.x, p.y, 0.0f, -0.026f, 0.010f, 0.012f);
    float chin = gauss2(p.x, p.y, 0.0f, -0.090f, 0.014f, 0.010f);
    float under = gauss2(ax, p.y, 0.029f, -0.013f, 0.012f, 0.0045f);
    float lid = gauss2(ax, p.y, EX, 0.006f, 0.012f, 0.005f);
    base = mixv(base, V(0.82f, 0.46f, 0.42f), clampf(blush * 0.55f + nose * 0.35f + chin * 0.2f, 0, 1));
    base = mixv(base, V(0.62f, 0.46f, 0.47f), under * 0.30f);
    base = mixv(base, V(0.74f, 0.50f, 0.48f), lid * 0.35f);
    float n = fbm(mul(p, 700.0f), 3);
    base = mul(base, 0.94f + 0.12f * n);
    /* sardas leves no nariz e nas bochechas */
    float fr = vnoise(mul(p, 1800.0f));
    float frz = gauss2(ax, p.y, 0.022f, -0.020f, 0.022f, 0.014f);
    base = mixv(base, V(0.62f, 0.38f, 0.28f), sstep(0.78f, 0.92f, fr) * frz * 0.5f);
    float br = brows(p);
    base = mixv(base, V(0.16f, 0.095f, 0.065f), br);
    *oily = clampf(0.35f + 0.65f * (gauss2(p.x, p.y, 0.0f, 0.045f, 0.03f, 0.025f) + nose + 0.6f * gauss2(ax, p.y, 0.043f, -0.012f, 0.012f, 0.010f) + 0.5f * chin), 0, 1.2f);
    return base;
}
/* o olho: a íris na direção do olhar, a pupila, o anel escuro da beira */
INL v3 eye_albedo(v3 q, v3 gaze, int *is_iris) {
    float c = dot(nrm(q), gaze);
    float ang = acosf(clampf(c, -1, 1));
    const float ir = 0.47f, pr = 0.15f;
    *is_iris = ang < ir;
    if (ang < pr) return V(0.010f, 0.008f, 0.008f);
    if (ang < ir) {
        float t = (ang - pr) / (ir - pr);
        v3 u = nrm(cross(gaze, V(0, 1, 0)));
        v3 w = cross(u, gaze);
        float th = atan2f(dot(q, w), dot(q, u));
        float fib = 0.80f + 0.20f * sinf(th * 37.0f + 2.0f * sinf(th * 7.0f)) * sinf(th * 13.0f + t * 4.0f);
        v3 inner = V(0.42f, 0.30f, 0.11f), mid = V(0.27f, 0.16f, 0.06f), outer = V(0.09f, 0.055f, 0.03f);
        v3 cc = t < 0.35f ? mixv(inner, mid, t / 0.35f) : mixv(mid, outer, (t - 0.35f) / 0.65f);
        cc = mul(cc, fib * (1.0f - 0.65f * sstep(0.80f, 1.0f, t)));
        return cc;
    }
    float edge = sstep(0.75f, 1.45f, ang);
    return mixv(V(0.60f, 0.55f, 0.51f), V(0.46f, 0.34f, 0.32f), edge);
}

/* uma luz. *dif recebe a luz difusa que chega (sem a cor do material: na pele ela ainda se espalha por baixo, no
 * Python); a volta é o resto: o brilho e, nos panos, o veludo */
typedef struct { v3 pos; v3 col; float I, k; int steps; } light_t;
static light_t LK, LR, LF;

INL v3 lit(v3 pw, v3 n, v3 v, const light_t *L, v3 alb, int kind, float spec, float shin, float oily, v3 tan, v3 *dif) {
    v3 ld = sub(L->pos, pw);
    float dist = len(ld);
    v3 l = mul(ld, 1.0f / dist);
    float nl = dot(n, l);
    float wrap = kind == 1 ? 0.18f : (kind == 3 ? 0.22f : (kind == 2 ? 0.25f : 0.05f));
    float df = (nl + wrap) / (1 + wrap);
    *dif = V(0, 0, 0);
    if (df <= 0) return V(0, 0, 0);
    float vis = L->steps ? shadow(add(pw, mul(n, 0.0006f)), l, dist - 0.05f, L->k, L->steps) : 1.0f;
    v3 vv = kind == 1 ? V(powf(vis, 0.70f), powf(vis, 0.95f), powf(vis, 1.05f)) : V(vis, vis, vis);
    *dif = vm(mul(L->col, L->I * df), vv);
    if (kind == 1) {
        /* a luz que entra na pele e volta vermelha na beira da sombra */
        float term = sstep(0.40f, 0.0f, fabsf(nl)) * 0.08f;
        *dif = add(*dif, mul(vm(L->col, V(0.60f, 0.16f, 0.08f)), L->I * term * sqrtf(vis)));
    }
    v3 H = nrm(add(l, v));
    float nh = maxf(dot(n, H), 0);
    float fres = 0.04f + 0.96f * powf(1 - clampf(dot(H, v), 0, 1), 5);
    v3 c = V(0, 0, 0);
    if (kind == 2) {
        /* o cabelo (Kajiya-Kay): um brilho claro puxado para a ponta e um da cor do fio puxado para a raiz */
        v3 t1 = nrm(add(tan, mul(n, 0.12f))), t2 = nrm(add(tan, mul(n, -0.10f)));
        float th1 = dot(t1, H), th2 = dot(t2, H);
        float s1 = powf(sqrtf(maxf(0, 1 - th1 * th1)), shin);
        float s2 = powf(sqrtf(maxf(0, 1 - th2 * th2)), shin * 0.5f);
        float sm = sstep(-0.1f, 0.3f, nl) * vis * L->I * spec;
        c = add(c, mul(L->col, s1 * 0.9f * sm));
        c = add(c, mul(vm(L->col, mul(alb, 6.0f)), s2 * 0.6f * sm));
        return c;
    }
    float s = 0;
    if (kind == 1) s = (powf(nh, 26.0f) * 0.10f + powf(nh, 180.0f) * 0.55f * oily) * fres * 5.0f;
    else if (kind == 4) s = powf(nh, shin) * spec * fres * 4.0f;
    if (kind == 3) {
        /* o veludo da lã: brilha na beira, de lado */
        float nv = clampf(dot(n, v), 0, 1);
        c = add(c, mul(vm(L->col, alb), L->I * 0.6f * powf(1 - nv, 2.5f) * clampf(nl + 0.4f, 0, 1) * vis));
    }
    return add(c, mul(L->col, L->I * s * vis * clampf(nl * 4.0f, 0, 1)));
}

static v3 shade(v3 pw, v3 n, v3 rd, int m, v3 *sirr, v3 *salb) {
    v3 vdir = mul(rd, -1);
    if (m == M_BG || m == M_NONE) return V(0, 0, 0);
    float occ = ao(pw, n);
    if (CLAY > 0.5f) {
        v3 alb = V(0.55f, 0.55f, 0.55f);
        if (m == M_EYE) {
            v3 ph = to_head(pw);
            int left = ph.x < 0;
            float c = dot(nrm(sub(ph, left ? EYE_L : EYE_R)), left ? GAZE_L : GAZE_R);
            alb = c > 0.866f ? (c > 0.985f ? V(0.02f, 0.02f, 0.02f) : V(0.18f, 0.12f, 0.08f)) : V(0.8f, 0.8f, 0.8f);
        }
        v3 L = P[13] > 0.5f ? nrm(sub(CAMP, pw)) : nrm(V(-0.45f, 0.55f, 0.70f));
        float vis = shadow(add(pw, mul(n, 0.0006f)), L, 1.0f, 24.0f, 96);
        float dif = maxf(dot(n, L), 0) * vis;
        v3 L2 = nrm(V(0.8f, 0.1f, 0.4f));
        float d2 = maxf(dot(n, L2), 0) * 0.25f;
        float sky = 0.18f * (0.6f + 0.4f * n.y) * occ;
        v3 H = nrm(add(L, vdir));
        float sp = powf(maxf(dot(n, H), 0), 60.0f) * 0.25f * vis;
        return add(mul(alb, dif * 0.9f + d2 + sky), V(sp, sp, sp));
    }
    v3 p = to_head(pw);
    v3 alb; int kind = 0; float spec = 0, shin = 20, oily = 0;
    v3 nn = n, tan = V(0, -1, 0);
    switch (m) {
    case M_SKIN: {
        alb = skin_albedo(p, &oily); kind = 1;
        {
            /* a cor do lábio se apagando na beira de baixo */
            float lw = lip_w(p);
            if (lw > 0.001f) { alb = mixv(alb, V(0.52f, 0.17f, 0.20f), 0.75f * lw); oily = mixf(oily, 1.2f, lw); }
        }
        /* a linha dos cílios na beira das pálpebras e a sombra do vinco */
        int left = p.x < 0;
        v3 c = sub(p, left ? EYE_L : EYE_R);
        float r = len(c);
        if (r < ER + 0.008f) {
            float u, t;
            float fd = lid_open(c, left ? -1.0f : 1.0f, &u, &t);
            float along = sstep(0.0f, 0.10f, t) * sstep(1.0f, 0.88f, t);
            float wing = sstep(0.6f, 1.0f, t) * 0.06f;
            float upl = sstep(0.17f + wing, 0.04f, u) * sstep(-0.05f, 0.0f, u) * sstep(0.0f, 0.06f, t) * sstep(1.0f, 0.93f, t);
            float lol = sstep(0.035f, 0.005f, fd) * (u < -0.3f ? 1.0f : 0.0f) * along * 0.30f;
            float cre = expf(-(u - 0.55f) * (u - 0.55f) / 0.010f) * along * 0.30f;
            alb = mixv(alb, V(0.06f, 0.035f, 0.03f), clampf(upl * 0.92f + lol, 0, 1));
            alb = mixv(alb, V(0.45f, 0.28f, 0.24f), cre);
            oily *= 1.0f - upl;
        }
        break;
    }
    case M_LIP: {
        float o2; v3 s = skin_albedo(p, &o2);
        alb = mixv(s, V(0.52f, 0.17f, 0.20f), 0.75f * lip_w(p));
        kind = 1; oily = 1.2f; break;
    }
    case M_EYE: {
        int iris;
        int left = p.x < 0;
        v3 c = sub(p, left ? EYE_L : EYE_R);
        alb = eye_albedo(c, left ? GAZE_L : GAZE_R, &iris);
        /* a sombra dos cílios na parte de cima do olho */
        float u, t;
        lid_open(c, left ? -1.0f : 1.0f, &u, &t);
        alb = mul(alb, 1.0f - 0.55f * sstep(-0.22f, -0.02f, u));
        kind = 4; spec = 1.6f; shin = 1600.0f; break;
    }
    case M_HAIR: {
        float s = hair_across(p);
        float al = p.y + 0.6f * fabsf(p.x);
        float cl = vnoise(V(s * 520.0f, al * 22.0f, 0.5f));
        float str = 0.78f + 0.50f * (cl - 0.5f) + 0.30f * (vnoise(V(s * 2600.0f, al * 90.0f, 7.0f)) - 0.5f);
        /* mais escuro na raiz, perto da risca */
        float root = expf(-(p.x * p.x) / 0.00012f) * sstep(0.04f, 0.09f, p.y);
        alb = mul(V(0.060f, 0.034f, 0.023f), str * (1.0f - 0.35f * root));
        /* a direção dos fios: na superfície, de través à coordenada que os atravessa, descendo */
        const float e = 0.0005f;
        v3 g = V(hair_across(add(p, V(e, 0, 0))) - hair_across(add(p, V(-e, 0, 0))),
                 hair_across(add(p, V(0, e, 0))) - hair_across(add(p, V(0, -e, 0))),
                 hair_across(add(p, V(0, 0, e))) - hair_across(add(p, V(0, 0, -e))));
        v3 nh_ = V(dot(n, HX), dot(n, HY), dot(n, HZ));
        v3 th = nrm(cross(nh_, g));
        if (th.y > 0) th = mul(th, -1.0f);
        tan = from_head_dir(th);
        kind = 2; spec = 0.16f; shin = 110.0f; break;
    }
    case M_HOOD: alb = mul(V(0.30f, 0.030f, 0.036f), 0.86f + 0.28f * fbm(mul(p, 140.0f), 3)); kind = 3; break;
    case M_HOODIN: alb = mul(V(0.20f, 0.022f, 0.028f), 0.9f + 0.2f * fbm(mul(p, 140.0f), 2)); kind = 3; break;
    case M_KNOT: alb = V(0.27f, 0.026f, 0.033f); kind = 3; break;
    case M_DRESS: alb = mul(V(0.11f, 0.050f, 0.045f), 0.9f + 0.2f * fbm(mul(p, 120.0f), 2)); kind = 3; break;
    default: return V(0, 0, 0);
    }
    v3 acc = V(0, 0, 0), d1, d2, d3;
    acc = add(acc, lit(pw, nn, vdir, &LK, alb, kind, spec, shin, oily, tan, &d1));
    acc = add(acc, lit(pw, nn, vdir, &LR, alb, kind, spec * 0.7f, shin, oily, tan, &d2));
    acc = add(acc, lit(pw, nn, vdir, &LF, alb, kind, spec * 0.3f, shin, oily * 0.5f, tan, &d3));
    v3 irr = add(add(d1, d2), d3);
    /* o escuro em volta: um pouco de roxo vindo de cima, um pouco de quente vindo de baixo */
    float up = 0.5f + 0.5f * nn.y;
    v3 amb = add(mul(V(0.050f, 0.040f, 0.095f), up), mul(V(0.055f, 0.030f, 0.018f), 1 - up));
    irr = add(irr, mul(amb, AMB_I * occ));
    float ok = 0.45f + 0.55f * occ;
    if (kind == 1) {
        *sirr = mul(irr, ok);
        *salb = alb;
        return mul(acc, ok);
    }
    return mul(add(acc, vm(alb, irr)), ok);
}

static void trace(v3 ro, v3 rd, float *acc) {
    float t = 0.02f;
    hit_t h; int hit = 0;
    for (int i = 0; i < 500 && t < 4.0f; i++) {
        v3 p = add(ro, mul(rd, t));
        h = map(p, 0);
        if (h.d < 0.00004f * (1 + t)) { hit = 1; break; }
        t += h.d * 0.6f;
    }
    if (!hit || h.m == M_BG) { acc[10 + G_BG] += 1; acc[6] += 4.0f; return; }
    v3 p = add(ro, mul(rd, t));
    v3 n = normal_at(p);
    v3 sirr = V(0, 0, 0), salb = V(0, 0, 0);
    v3 c = shade(p, n, rd, h.m, &sirr, &salb);
    acc[0] += c.x; acc[1] += c.y; acc[2] += c.z;
    acc[3] += sirr.x; acc[4] += sirr.y; acc[5] += sirr.z;
    acc[O_ALB] += salb.x; acc[O_ALB + 1] += salb.y; acc[O_ALB + 2] += salb.z;
    acc[6] += t;
    acc[7] += n.x; acc[8] += n.y; acc[9] += n.z;
    acc[10 + h.g] += 1.0f;
}

static v3 rot_y(v3 v, float a) { return V(v.x * cosf(a) + v.z * sinf(a), v.y, -v.x * sinf(a) + v.z * cosf(a)); }
static v3 rot_x(v3 v, float a) { return V(v.x, v.y * cosf(a) - v.z * sinf(a), v.y * sinf(a) + v.z * cosf(a)); }
static v3 rot_z(v3 v, float a) { return V(v.x * cosf(a) - v.y * sinf(a), v.x * sinf(a) + v.y * cosf(a), v.z); }

void setup(const float *prm) {
    for (int i = 0; i < 32; i++) P[i] = prm[i];
    prof_setup();
    CAMP = V(P[4], P[5], P[6]);
    float yaw = P[7], pitch = P[8], roll = P[9];
    HP = V(0, 0, 0);
    /* os eixos da cabeça no mundo; to_head projeta neles */
    HX = rot_z(rot_x(rot_y(V(1, 0, 0), yaw), pitch), roll);
    HY = rot_z(rot_x(rot_y(V(0, 1, 0), yaw), pitch), roll);
    HZ = rot_z(rot_x(rot_y(V(0, 0, 1), yaw), pitch), roll);
    EYE_L = V(-EX, EY, EZ);
    EYE_R = V(EX, EY, EZ);
    /* as luzes (no mundo): a quente do núcleo, larga, do alto à esquerda; o roxo por trás, à direita; o quente
     * fraco de baixo */
    LK.pos = V(P[14], P[15], P[16]); LK.col = V(1.0f, 0.80f, 0.58f); LK.I = KEY_I; LK.k = 5.0f; LK.steps = 80;
    LR.pos = V(P[17], P[18], P[19]); LR.col = V(0.58f, 0.44f, 1.0f); LR.I = RIM_I; LR.k = 16.0f; LR.steps = 64;
    LF.pos = V(-0.10f, -0.80f, 0.70f); LF.col = V(1.0f, 0.55f, 0.32f); LF.I = FILL_I; LF.k = 6.0f; LF.steps = 0;
    v3 cl = to_head(CAMP);
    GAZE_L = nrm(sub(cl, EYE_L));
    GAZE_R = nrm(sub(cl, EYE_R));
    GE = asinf(clampf(0.5f * (GAZE_L.y + GAZE_R.y), -0.5f, 0.5f));
}

void render(int W, int H, int ss, int x0, int x1, int y0, int y1, const float *cam, float *out) {
    v3 C = V(cam[0], cam[1], cam[2]);
    v3 T = V(cam[3], cam[4], cam[5]);
    float f = cam[6];
    v3 fw = nrm(sub(T, C));
    v3 rt = nrm(cross(fw, V(0, 1, 0)));
    v3 up = cross(rt, fw);
    #pragma omp parallel for schedule(dynamic, 1)
    for (int py = y0; py < y1; py++) {
        for (int px = x0; px < x1; px++) {
            float acc[NOUT];
            memset(acc, 0, sizeof(acc));
            for (int sy = 0; sy < ss; sy++)
                for (int sx = 0; sx < ss; sx++) {
                    float u = (px + (sx + 0.5f) / ss - W * 0.5f) / f;
                    float v = (py + (sy + 0.5f) / ss - H * 0.5f) / f;
                    v3 rd = nrm(add(fw, sub(mul(rt, u), mul(up, v))));
                    trace(C, rd, acc);
                }
            float k = 1.0f / (ss * ss);
            for (int i = 0; i < NOUT; i++) out[((size_t)(py - y0) * (x1 - x0) + (px - x0)) * NOUT + i] = acc[i] * k;
        }
    }
}
int nout(void) { return NOUT; }
