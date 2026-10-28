/* rm.h: a matemática do raymarcher (vetores, formas por distância, ruído). Metros; x para a direita, y para
 * cima, z para a câmera. */
#include <math.h>
#include <stdlib.h>
#include <string.h>

typedef struct { float x, y, z; } v3;
#define INL static inline
INL v3 V(float x, float y, float z) { v3 r; r.x = x; r.y = y; r.z = z; return r; }
INL v3 add(v3 a, v3 b) { return V(a.x + b.x, a.y + b.y, a.z + b.z); }
INL v3 sub(v3 a, v3 b) { return V(a.x - b.x, a.y - b.y, a.z - b.z); }
INL v3 mul(v3 a, float s) { return V(a.x * s, a.y * s, a.z * s); }
INL v3 vm(v3 a, v3 b) { return V(a.x * b.x, a.y * b.y, a.z * b.z); }
INL float dot(v3 a, v3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
INL v3 cross(v3 a, v3 b) { return V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
INL float len(v3 a) { return sqrtf(dot(a, a)); }
INL v3 nrm(v3 a) { float l = len(a); return l > 1e-12f ? mul(a, 1.0f / l) : a; }
INL float clampf(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
INL float mixf(float a, float b, float t) { return a + (b - a) * t; }
INL v3 mixv(v3 a, v3 b, float t) { return add(a, mul(sub(b, a), t)); }
INL float sstep(float e0, float e1, float x) { float t = clampf((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
INL float maxf(float a, float b) { return a > b ? a : b; }
INL float minf(float a, float b) { return a < b ? a : b; }
INL float smin(float a, float b, float k) { float h = clampf(0.5f + 0.5f * (b - a) / k, 0, 1); return mixf(b, a, h) - k * h * (1 - h); }
INL float smax(float a, float b, float k) { return -smin(-a, -b, k); }
INL v3 vabs(v3 a) { return V(fabsf(a.x), fabsf(a.y), fabsf(a.z)); }
INL v3 vmax0(v3 a) { return V(maxf(a.x, 0), maxf(a.y, 0), maxf(a.z, 0)); }
INL float signf(float x) { return x > 0 ? 1.0f : (x < 0 ? -1.0f : 0.0f); }
INL v3 refl(v3 d, v3 n) { return sub(d, mul(n, 2.0f * dot(d, n))); }

/* ---------------------------------------------------------------- formas */
INL float sd_sphere(v3 p, v3 c, float r) { return len(sub(p, c)) - r; }
INL float sd_ell(v3 p, v3 c, v3 r) {
    v3 q = sub(p, c);
    float k0 = len(V(q.x / r.x, q.y / r.y, q.z / r.z));
    float k1 = len(V(q.x / (r.x * r.x), q.y / (r.y * r.y), q.z / (r.z * r.z)));
    return k1 > 1e-9f ? k0 * (k0 - 1.0f) / k1 : -minf(r.x, minf(r.y, r.z));
}
INL float sd_box(v3 p, v3 c, v3 b, float r) {
    v3 q = sub(vabs(sub(p, c)), sub(b, V(r, r, r)));
    return len(vmax0(q)) + minf(maxf(q.x, maxf(q.y, q.z)), 0.0f) - r;
}
/* caixa entre dois cantos */
INL float sd_aabb(v3 p, float x0, float y0, float z0, float x1, float y1, float z1, float r) {
    return sd_box(p, V((x0 + x1) * 0.5f, (y0 + y1) * 0.5f, (z0 + z1) * 0.5f), V((x1 - x0) * 0.5f, (y1 - y0) * 0.5f, (z1 - z0) * 0.5f), r);
}
/* caixa com eixos próprios (u, v, w ortonormais) */
INL float sd_obox(v3 p, v3 c, v3 u, v3 v, v3 w, v3 b, float r) {
    v3 q = sub(p, c);
    return sd_box(V(dot(q, u), dot(q, v), dot(q, w)), V(0, 0, 0), b, r);
}
INL float sd_cap(v3 p, v3 a, v3 b, float r) {
    v3 pa = sub(p, a), ba = sub(b, a);
    float h = clampf(dot(pa, ba) / dot(ba, ba), 0, 1);
    return len(sub(pa, mul(ba, h))) - r;
}
/* cápsula afinando de r1 (em a) para r2 (em b) */
INL float sd_rcone(v3 p, v3 a, v3 b, float r1, float r2) {
    v3 ba = sub(b, a);
    float l2 = dot(ba, ba);
    float rr = r1 - r2;
    float a2 = l2 - rr * rr;
    float il2 = 1.0f / l2;
    v3 pa = sub(p, a);
    float y = dot(pa, ba);
    float z = y - l2;
    v3 w = sub(mul(pa, l2), mul(ba, y));
    float x2 = dot(w, w);
    float y2 = y * y * l2;
    float z2 = z * z * l2;
    float k = signf(rr) * rr * rr * x2;
    if (signf(z) * a2 * z2 > k) return sqrtf(x2 + z2) * il2 - r2;
    if (signf(y) * a2 * y2 < k) return sqrtf(x2 + y2) * il2 - r1;
    return (sqrtf(x2 * a2 * il2) + y * rr) * il2 - r1;
}
/* anéis: eixo y (deitado), eixo z (de frente para a câmera), eixo x (de lado) */
INL float sd_torus_y(v3 p, v3 c, float R, float r) { v3 q = sub(p, c); float a = sqrtf(q.x * q.x + q.z * q.z) - R; return sqrtf(a * a + q.y * q.y) - r; }
INL float sd_torus_z(v3 p, v3 c, float R, float r) { v3 q = sub(p, c); float a = sqrtf(q.x * q.x + q.y * q.y) - R; return sqrtf(a * a + q.z * q.z) - r; }
INL float sd_torus_x(v3 p, v3 c, float R, float r) { v3 q = sub(p, c); float a = sqrtf(q.y * q.y + q.z * q.z) - R; return sqrtf(a * a + q.x * q.x) - r; }
/* cilindro de pé (eixo y) */
INL float sd_cyl_y(v3 p, v3 c, float r, float h) {
    v3 q = sub(p, c);
    float dx = sqrtf(q.x * q.x + q.z * q.z) - r, dy = fabsf(q.y) - h;
    return minf(maxf(dx, dy), 0.0f) + sqrtf(maxf(dx, 0) * maxf(dx, 0) + maxf(dy, 0) * maxf(dy, 0));
}

/* ---------------------------------------------------------------- ruído */
INL float hash3(int x, int y, int z) {
    unsigned int h = (unsigned)x * 374761393u + (unsigned)y * 668265263u + (unsigned)z * 2246822519u;
    h = (h ^ (h >> 13)) * 1274126177u;
    h ^= h >> 16;
    return (float)(h & 0xffffff) / 16777215.0f;
}
INL float vnoise(v3 p) {
    float fx = floorf(p.x), fy = floorf(p.y), fz = floorf(p.z);
    int ix = (int)fx, iy = (int)fy, iz = (int)fz;
    float tx = p.x - fx, ty = p.y - fy, tz = p.z - fz;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty); tz = tz * tz * (3 - 2 * tz);
    float c000 = hash3(ix, iy, iz), c100 = hash3(ix + 1, iy, iz), c010 = hash3(ix, iy + 1, iz), c110 = hash3(ix + 1, iy + 1, iz);
    float c001 = hash3(ix, iy, iz + 1), c101 = hash3(ix + 1, iy, iz + 1), c011 = hash3(ix, iy + 1, iz + 1), c111 = hash3(ix + 1, iy + 1, iz + 1);
    float a = mixf(mixf(c000, c100, tx), mixf(c010, c110, tx), ty);
    float b = mixf(mixf(c001, c101, tx), mixf(c011, c111, tx), ty);
    return mixf(a, b, tz);
}
INL float fbm(v3 p, int oct) {
    float s = 0, a = 0.5f, n = 0;
    for (int i = 0; i < oct; i++) { s += a * vnoise(p); n += a; p = mul(p, 2.03f); a *= 0.5f; }
    return s / n;
}

/* ---------------------------------------------------------------- pontos de uma curva de Bézier */
INL v3 bez(v3 a, v3 b, v3 c, v3 d, float t) {
    float u = 1 - t;
    return add(add(mul(a, u * u * u), mul(b, 3 * u * u * t)), add(mul(c, 3 * u * t * t), mul(d, t * t * t)));
}
