import Phaser from 'phaser';
import { RES } from './view';

// Pós-processamento do High e do EXTREME, na câmera do jogo (a interface fica fora). Três passos:
// 1. o que brilha (acima de um limiar suave) vai para uma imagem de meia resolução;
// 2. essa imagem é borrada duas vezes (brilho largo e macio);
// 3. a composição: reflexo na água, luz da sala (presa ao mundo, com sombras já calculadas), luzes que
//    se mexem com relevo (o brilho da imagem vira altura e as bordas da rocha viram chanfro), oclusão
//    perto das paredes, névoa que anda, fachos de luz saindo das luzes fortes, brilho, pinceladas e a
//    cor de cada área. Nada aqui muda a física nem o que o jogador precisa ver: as luzes fortes e as
//    partes claras da imagem passam por cima da luz da sala sem escurecer.

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 outTexCoord;
uniform sampler2D uMainSampler;
`;

const BRIGHT = `
#define SHADER_NAME EXTREME_BRIGHT_FS
${HEAD}
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(uMainSampler, outTexCoord + uTexel * vec2(-0.5, -0.5)).rgb
    + texture2D(uMainSampler, outTexCoord + uTexel * vec2(0.5, -0.5)).rgb
    + texture2D(uMainSampler, outTexCoord + uTexel * vec2(-0.5, 0.5)).rgb
    + texture2D(uMainSampler, outTexCoord + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float knee = 0.18;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 0.0001);
  float k = max(soft, br - uThreshold) / max(br, 0.0001);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

// sem a sala pronta: só passa a imagem adiante
const COPY = `
#define SHADER_NAME EXTREME_COPY_FS
${HEAD}
void main() {
  gl_FragColor = texture2D(uMainSampler, outTexCoord);
}
`;

const BLUR = `
#define SHADER_NAME EXTREME_BLUR_FS
${HEAD}
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uMainSampler, outTexCoord).rgb * 0.2270270270;
  c += texture2D(uMainSampler, outTexCoord + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(uMainSampler, outTexCoord - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(uMainSampler, outTexCoord + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(uMainSampler, outTexCoord - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const MAX_LIGHTS = 16;
export const MAX_WATER = 4;
// o mapa de luz guarda até esta quantidade de luz (255 = LIGHT_SCALE)
export const LIGHT_SCALE = 2;

const COMPOSITE = `
#define SHADER_NAME EXTREME_COMPOSITE_FS
${HEAD}
uniform sampler2D uBloom;
uniform sampler2D uLight;
uniform sampler2D uMask;
uniform sampler2D uStroke;
uniform vec2 uResolution;
uniform float uRes;
uniform vec2 uScroll;
uniform vec2 uRoom;
uniform float uTime;
uniform float uUseLight;
uniform float uUseFog;
uniform float uUseRefl;
uniform vec3 uAmbient;
uniform float uAO;
uniform float uLightGain;
uniform float uRelief;
uniform float uBloomK;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSat;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uOil;
uniform float uFlicker;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec3 uLightCol[${MAX_LIGHTS}];
uniform float uLightN;
uniform vec4 uRays[2];
uniform vec3 uReflTint;
uniform vec4 uWater[${MAX_WATER}];
uniform float uWaterK[${MAX_WATER}];
uniform float uWaterN;
uniform float uPost;
uniform vec4 uMem;
uniform float uMemMode;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 uv = outTexCoord;
  // pixel da tela de cima para baixo, ponto do mundo e ponto da sala (0 a 1)
  vec2 sp = vec2(uv.x, 1.0 - uv.y) * uResolution;
  vec2 world = sp / uRes + uScroll;
  vec2 muv = world / uRoom;
  vec4 mask = texture2D(uMask, muv);
  // onda de memória: a frente da onda entorta a imagem de leve ao passar
  float memD = 0.0;
  float memRing = 0.0;
  if (uMem.w > 0.001) {
    vec2 md = world - uMem.xy;
    memD = length(md);
    memRing = exp(-pow((memD - uMem.z) / 12.0, 2.0)) * uMem.w;
    vec2 push = md / max(memD, 1.0) * memRing * 1.6;
    uv -= vec2(push.x, -push.y) * uRes / uResolution;
  }
  vec3 col = texture2D(uMainSampler, uv).rgb;

  // reflexo na água: o que está em cima da superfície, espelhado e ondulando
  if (uUseRefl > 0.5) {
    for (int i = 0; i < ${MAX_WATER}; i++) {
      if (float(i) >= uWaterN) break;
      vec4 w = uWater[i];
      if (world.x >= w.x && world.x <= w.y && world.y >= w.z && world.y <= w.w) {
        float depth = clamp((world.y - w.z) / max(w.w - w.z, 1.0), 0.0, 1.0);
        float wave = sin(world.x * 0.35 + uTime * 2.2) * 1.1 + sin(world.x * 0.12 - uTime * 1.4) * 0.8;
        vec2 rw = vec2(world.x + sin(world.y * 0.9 + uTime * 3.1) * 0.7, 2.0 * w.z - world.y + wave);
        vec2 rs = (rw - uScroll) * uRes;
        vec3 refl = texture2D(uMainSampler, clamp(vec2(rs.x / uResolution.x, 1.0 - rs.y / uResolution.y), 0.002, 0.998)).rgb;
        col = mix(col, refl * uReflTint, (1.0 - depth) * uWaterK[i]);
      }
    }
  }

  vec3 base = col;
  float l0 = lum(col);
  vec3 dyn = vec3(0.0);
  vec3 stat = vec3(0.0);
  if (uUseLight > 0.5) {
    // relevo: o brilho da imagem vira altura; nas bordas da rocha, o chanfro da pedra
    vec3 n = vec3(0.0, 0.0, 1.0);
    if (uRelief > 0.001) {
      float dx = uRes / uResolution.x;
      float dy = uRes / uResolution.y;
      float hl = lum(texture2D(uMainSampler, uv - vec2(dx, 0.0)).rgb);
      float hr = lum(texture2D(uMainSampler, uv + vec2(dx, 0.0)).rgb);
      float hu = lum(texture2D(uMainSampler, uv + vec2(0.0, dy)).rgb);
      float hd = lum(texture2D(uMainSampler, uv - vec2(0.0, dy)).rgb);
      vec2 mt = 0.5 / uRoom * 16.0;
      float ml = texture2D(uMask, muv - vec2(mt.x, 0.0)).r;
      float mr = texture2D(uMask, muv + vec2(mt.x, 0.0)).r;
      float mu = texture2D(uMask, muv - vec2(0.0, mt.y)).r;
      float md = texture2D(uMask, muv + vec2(0.0, mt.y)).r;
      vec2 g = vec2(hr - hl, hd - hu) * uRelief * 6.0 + vec2(mr - ml, md - mu) * 1.6 * mask.r;
      n = normalize(vec3(-g, 1.0));
    }
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (float(i) >= uLightN) break;
      vec4 L = uLights[i];
      vec2 d = L.xy - world;
      float att = clamp(1.0 - length(d) / L.z, 0.0, 1.0);
      att *= att;
      vec3 ld = normalize(vec3(d / L.z, 0.45));
      dyn += uLightCol[i] * (L.w * att * (0.4 + 0.6 * max(dot(n, ld), 0.0)));
    }
    stat = texture2D(uLight, muv).rgb * uLightGain;
    if (uFlicker > 0.001) {
      // chama tremendo: só a luz quente (velas, tochas, brasas); vitral e céu ficam parados
      float warm = clamp((stat.r - stat.b) * 1.6, 0.0, 1.0);
      float fl = noise(world * 0.05 + vec2(uTime * 2.3, uTime * 1.7)) * 0.6 + noise(world * 0.11 - vec2(uTime * 3.7, 0.0)) * 0.4;
      stat *= 1.0 + uFlicker * warm * (fl - 0.5) * 2.0;
    }
    float top = 0.78 + 0.44 * max(dot(n, normalize(vec3(-0.25, -0.85, 0.55))), 0.0);
    float ao = mix(1.0, mask.g, uAO * (1.0 - mask.r));
    vec3 light = uAmbient * ao + stat * top + dyn;
    // o que já é luz (chama, janela acesa, brilho) não escurece
    float keep = smoothstep(0.62, 0.95, max(col.r, max(col.g, col.b)));
    col = mix(col * light, max(col, col * light), keep);
  }

  // a luz espalhando no ar em volta das lâmpadas (a névoa em si são camadas no cenário, Mist.ts)
  if (uUseFog > 0.5) col += (stat * 0.06 + dyn * 0.045) * (1.0 - mask.r);

  // memória passando pelo cenário: por dentro da onda a sala volta a ter a cor de antes, com veios de
  // ouro na pedra (como a máscara do cavaleiro); a memória corrompida drena a cor e acende veios roxos
  if (uMem.w > 0.001) {
    float inside = (1.0 - smoothstep(uMem.z - 30.0, uMem.z + 2.0, memD)) * uMem.w;
    // rachaduras finas: a curva de nível do ruído (entortado para não seguir a grade), com a largura
    // medida em pixels do mundo pela inclinação do ruído, cortada em trechos e com galhos menores
    vec2 q = world + vec2(noise(world * 0.021), noise(world * 0.021 + 7.3)) * 34.0;
    float f1 = 0.03;
    float n1 = noise(q * f1);
    vec2 g1 = vec2(noise((q + vec2(1.0, 0.0)) * f1), noise((q + vec2(0.0, 1.0)) * f1)) - n1;
    float d1 = abs(n1 - 0.5) / max(length(g1), 0.002);
    float f2 = 0.071;
    float n2 = noise(q * f2 + 19.0);
    vec2 g2 = vec2(noise((q + vec2(1.0, 0.0)) * f2 + 19.0), noise((q + vec2(0.0, 1.0)) * f2 + 19.0)) - n2;
    float d2 = abs(n2 - 0.5) / max(length(g2), 0.002);
    float seg = smoothstep(0.34, 0.6, noise(q * 0.045 + 3.1));
    float crack = (1.0 - smoothstep(0.25, 0.95, d1)) * seg;
    crack = max(crack, (1.0 - smoothstep(0.15, 0.65, d2)) * seg * smoothstep(0.55, 0.8, noise(q * 0.09 + 8.0)) * 0.7);
    float halo = (exp(-d1 * 0.45) * seg) * 0.22;
    float rim = mask.r * (1.0 - mask.r) * 4.0;
    float lines = (crack + halo) * mask.r + rim * 0.25;
    if (uMemMode < 0.5) {
      vec3 w = col * vec3(1.2, 1.07, 0.86) + vec3(0.045, 0.03, 0.0);
      float lw = lum(w);
      w = mix(vec3(lw), w, 1.3);
      col = mix(col, w, inside * 0.85);
      col += vec3(1.0, 0.78, 0.4) * (lines * inside * 0.55 + memRing * 0.2);
    } else {
      float lc = lum(col);
      vec3 dr = mix(vec3(lc), col, 0.12) * vec3(0.8, 0.78, 0.86);
      col = mix(col, dr, inside);
      col += vec3(0.56, 0.24, 0.9) * (lines * inside * 0.6 + memRing * 0.26);
    }
  }

  if (uPost < 0.5) {
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    return;
  }

  // brilho e fachos de luz saindo das fontes fortes
  vec3 bloom = texture2D(uBloom, uv).rgb;
  vec3 rays = vec3(0.0);
  for (int r = 0; r < 2; r++) {
    vec4 R = uRays[r];
    if (R.z <= 0.0) continue;
    vec2 step = (R.xy - uv) / 12.0;
    vec2 p = uv;
    float decay = 1.0;
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 12; k++) {
      p += step;
      acc += texture2D(uBloom, p).rgb * decay;
      decay *= 0.88;
    }
    rays += acc * (R.z / 12.0);
  }
  col += bloom * uBloomK + rays;

  // pinceladas presas ao mundo (a pintura a óleo que cresce a cada área)
  if (uOil > 0.001) {
    vec2 suv = world / 256.0;
    float e = 1.0 / 512.0;
    vec4 st = texture2D(uStroke, suv);
    float sx = texture2D(uStroke, suv + vec2(e, 0.0)).r - texture2D(uStroke, suv - vec2(e, 0.0)).r;
    float sy = texture2D(uStroke, suv + vec2(0.0, e)).r - texture2D(uStroke, suv - vec2(0.0, e)).r;
    vec3 sn = normalize(vec3(-sx * (1.5 + 5.0 * uOil), -sy * (1.5 + 5.0 * uOil), 1.0));
    vec3 SL = normalize(vec3(-0.55, -0.75, 1.1));
    float sh = dot(sn, SL) / SL.z;
    float ll = lum(col);
    col *= 1.0 + (sh - 1.0) * (0.18 + 0.6 * uOil) * smoothstep(0.02, 0.25, ll + 0.05);
    col *= 1.0 + (st.g - 0.5) * (0.06 + 0.22 * uOil);
    col += pow(max(reflect(-SL, sn).z, 0.0), 30.0) * (0.02 + 0.16 * uOil) * (0.25 + ll);
  }

  // cor da área: sombras e luzes tingidas, curva e saturação
  float l = lum(col);
  col *= mix(uShadowTint, uHighTint, smoothstep(0.04, 0.7, l));
  col = pow(max(col * uGain + uLift, 0.0), uGamma);
  l = lum(col);
  col = mix(vec3(l), col, uSat);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type RGB = [number, number, number];

// Clima de cada área (cores 0..1; looks.ts tem os valores)
export interface Look {
  // luz de fundo, longe das lâmpadas
  ambient: RGB;
  // luz do céu nas partes abertas para cima (zero nas salas fechadas) e em quantas células de 8 px ela
  // cai pela metade descendo por um poço ou fenda (0 = não cai)
  sky: RGB;
  skyDepth: number;
  // luz fraca em volta do cavaleiro (ajuda a ler o chão no escuro) e até onde ela chega (px do mundo)
  knight: number;
  knightR: number;
  // escurecimento perto das paredes e nos cantos
  ao: number;
  lightGain: number;
  // até onde as luzes chegam (1 = o tamanho do brilho); nas salas escuras a poça de luz é maior
  reach: number;
  // luz que bate na pedra e volta (fração da direta)
  bounce: number;
  relief: number;
  bloomThreshold: number;
  bloom: number;
  rays: number;
  // névoa em camadas (Mist.ts): cor, força atrás da pedra e do véu leve na frente
  mistColor: RGB;
  mist: number;
  mistFront: number;
  // reflexo da água e do chão molhado de chuva
  water: number;
  // a cor do reflexo: fria na água, roxa na tinta do Fosso
  reflTint: RGB;
  wet: number;
  lift: RGB;
  gamma: RGB;
  gain: RGB;
  sat: number;
  shadowTint: RGB;
  highTint: RGB;
  oil: number;
  // as chamas tremem (só a luz quente do mapa de luz)
  flicker: number;
}

// O que o filtro precisa da sala a cada quadro (GameScene + iluminação)
export interface ExtremeFeed {
  look: Look;
  room: { w: number; h: number };
  lightTex: Phaser.Textures.Texture | null;
  maskTex: Phaser.Textures.Texture | null;
  light: boolean;
  fog: boolean;
  reflections: boolean;
  // brilho, fachos de luz, pinceladas e cor da área
  post: boolean;
  // luzes que se mexem nesta tela: [x, y, raio, força] em pixels do mundo e a cor
  lights: Float32Array;
  lightColors: Float32Array;
  lightCount: number;
  // fontes dos fachos de luz no mundo [x, y, força, 0] x2 (o filtro passa para a tela na hora de desenhar)
  rays: Float32Array;
  // água e chão molhado: [x0, x1, superfície, fundo] no mundo e quanto reflete
  water: Float32Array;
  waterK: Float32Array;
  waterCount: number;
  // onda de memória: [x, y, raio, força] no mundo e o tipo (0 lembrança, 1 corrompida)
  mem: Float32Array;
  memMode: number;
}

export const EXTREME = 'ExtremeGraphics';

export class ExtremePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  feed: ExtremeFeed | null = null;
  private t0 = performance.now();
  private rayUv = new Float32Array(8);

  constructor(game: Phaser.Game) {
    super({
      game,
      name: EXTREME,
      shaders: [
        { name: 'bright', fragShader: BRIGHT },
        { name: 'blur', fragShader: BLUR },
        { name: 'composite', fragShader: COMPOSITE },
        { name: 'copy', fragShader: COPY },
      ],
    });
  }

  onDraw(source: Phaser.Renderer.WebGL.RenderTarget) {
    const f = this.feed;
    const [bright, blur, comp, copy] = this.shaders;
    if (!f) {
      this.bindAndDraw(source, undefined, true, true, copy);
      return;
    }
    const half1 = this.halfFrame1;
    const half2 = this.halfFrame2;
    const L = f.look;

    if (f.post) {
      // 1. o que brilha, em meia resolução
      this.set2f('uTexel', 1 / source.width, 1 / source.height, bright);
      this.set1f('uThreshold', L.bloomThreshold, bright);
      this.bindAndDraw(source, half1, true, true, bright);
      // 2. borra duas vezes, a segunda mais larga
      for (const k of [1, 2]) {
        this.set2f('uDir', k / half1.width, 0, blur);
        this.bindAndDraw(half1, half2, true, true, blur);
        this.set2f('uDir', 0, k / half1.height, blur);
        this.bindAndDraw(half2, half1, true, true, blur);
      }
    }

    // 3. composição
    const cam = this.gameObject as Phaser.Cameras.Scene2D.Camera | undefined;
    const t = (performance.now() - this.t0) / 1000;
    const sx = cam ? cam.worldView.x : 0;
    const sy = cam ? cam.worldView.y : 0;
    // fontes dos fachos: do mundo para a tela agora (a câmera já andou neste quadro)
    const W = this.renderer.width;
    const H = this.renderer.height;
    for (let r = 0; r < 2; r++) {
      const o = r * 4;
      this.rayUv[o] = ((f.rays[o] - sx) * RES) / W;
      this.rayUv[o + 1] = 1 - ((f.rays[o + 1] - sy) * RES) / H;
      this.rayUv[o + 2] = f.post ? f.rays[o + 2] : 0;
      this.rayUv[o + 3] = 0;
    }
    this.set1i('uBloom', 1, comp);
    this.set1i('uLight', 2, comp);
    this.set1i('uMask', 3, comp);
    this.set1i('uStroke', 4, comp);
    this.set2f('uResolution', this.renderer.width, this.renderer.height, comp);
    this.set1f('uRes', RES, comp);
    this.set2f('uScroll', sx, sy, comp);
    this.set2f('uRoom', f.room.w, f.room.h, comp);
    this.set1f('uTime', t, comp);
    this.set1f('uUseLight', f.light && f.lightTex && f.maskTex ? 1 : 0, comp);
    this.set1f('uUseFog', f.fog ? 1 : 0, comp);
    this.set1f('uUseRefl', f.reflections ? 1 : 0, comp);
    this.set3f('uAmbient', L.ambient[0], L.ambient[1], L.ambient[2], comp);
    this.set1f('uAO', L.ao, comp);
    this.set1f('uLightGain', L.lightGain * LIGHT_SCALE, comp);
    this.set1f('uRelief', L.relief, comp);
    this.set1f('uBloomK', L.bloom, comp);
    this.set3f('uLift', L.lift[0], L.lift[1], L.lift[2], comp);
    this.set3f('uGamma', L.gamma[0], L.gamma[1], L.gamma[2], comp);
    this.set3f('uGain', L.gain[0], L.gain[1], L.gain[2], comp);
    this.set1f('uSat', L.sat, comp);
    this.set3f('uShadowTint', L.shadowTint[0], L.shadowTint[1], L.shadowTint[2], comp);
    this.set3f('uHighTint', L.highTint[0], L.highTint[1], L.highTint[2], comp);
    this.set1f('uOil', L.oil, comp);
    this.set1f('uFlicker', L.flicker, comp);
    this.set1f('uPost', f.post ? 1 : 0, comp);
    this.set4fv('uLights', f.lights, comp);
    this.set3fv('uLightCol', f.lightColors, comp);
    this.set1f('uLightN', f.lightCount, comp);
    this.set4fv('uRays', this.rayUv, comp);
    this.set3f('uReflTint', L.reflTint[0], L.reflTint[1], L.reflTint[2], comp);
    this.set4fv('uWater', f.water, comp);
    this.set1fv('uWaterK', f.waterK, comp);
    this.set1f('uWaterN', f.waterCount, comp);
    this.set4f('uMem', f.mem[0], f.mem[1], f.mem[2], f.mem[3], comp);
    this.set1f('uMemMode', f.memMode, comp);

    if (f.post) this.bindTexture(half1.texture, 1);
    const glOf = (tex: Phaser.Textures.Texture | null) => (tex ? tex.source[0].glTexture : null);
    const light = glOf(f.lightTex) ?? (this.renderer.whiteTexture as unknown as Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper);
    const mask = glOf(f.maskTex) ?? (this.renderer.whiteTexture as unknown as Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper);
    if (light) this.bindTexture(light, 2);
    if (mask) this.bindTexture(mask, 3);
    const strokes = this.game.textures.exists('paint-strokes') ? this.game.textures.get('paint-strokes').source[0].glTexture : null;
    if (strokes) this.bindTexture(strokes, 4);
    this.bindAndDraw(source, undefined, true, true, comp);
  }
}

export function extremeCamera(cam: Phaser.Cameras.Scene2D.Camera, on: boolean): ExtremePipeline | null {
  const r = cam.scene.sys.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!r || !r.pipelines) return null;
  cam.removePostPipeline(EXTREME);
  if (!on) return null;
  if (!r.pipelines.postPipelineClasses.has(EXTREME)) r.pipelines.addPostPipeline(EXTREME, ExtremePipeline);
  cam.setPostPipeline(EXTREME);
  return (cam.postPipelines.find((q) => q instanceof ExtremePipeline) as ExtremePipeline | undefined) ?? null;
}
