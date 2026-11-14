// Predefinições gráficas: PERFORMANCE (leve, fiel ao visual original), HIGH (o visual original com luz,
// névoa, brilho e vida no cenário), EXTREME (o cenário reconstruído: terreno e fundos em alta
// resolução, sombras suaves, fachos de luz, camadas de profundidade e tudo o que se mexe) e ECLIPSE
// (tudo do EXTREME e mais: o terreno de todas as salas repintado em 3x, com a pedra saindo da linha
// da grade, neve em montes, pingentes de gelo, estalactites e raízes; os fundos da Prisão, do Fosso,
// das Catacumbas, da Cidade, da Catedral e das Minas repintados em 3x, com a pedra em relevo; a sombra
// dos personagens no chão e nas paredes conforme as luzes da sala; e o eclipse vivo no céu, com a coroa
// se mexendo devagar).
// Cada ajuste pode ser trocado à parte em Configurações > Imagem; aí a predefinição vira "personalizado".

export type Preset = 'performance' | 'high' | 'extreme' | 'eclipse';
export const PRESET_IDS: Preset[] = ['performance', 'high', 'extreme', 'eclipse'];
export type Level3 = 0 | 1 | 2;

export interface GfxFlags {
  // terreno e fundos pintados em alta resolução, camadas extras de profundidade
  hd: boolean;
  // luzes do cenário e do cavaleiro iluminando o que está em volta (com relevo)
  light: boolean;
  // as luzes fixas param nas paredes e fazem sombra suave
  shadows: boolean;
  // névoa em camadas que anda devagar
  fog: boolean;
  // água e poças refletem o que está em cima
  reflections: boolean;
  // brilho das luzes, fachos de luz, cor de cada área e pintura a óleo
  post: boolean;
  // vida no cenário: musgo, raízes e plantas que reagem, bichos, gotas
  life: Level3;
  // quantidade de partículas
  particles: Level3;
  // ECLIPSE: o terreno e os fundos repintados em 3x (precisa de hd; sem ele, ou se a pintura não chegar, fica a de antes)
  hd3: boolean;
  // ECLIPSE: os personagens fazem sombra (no chão embaixo deles e para longe das luzes; precisa de light)
  cast: boolean;
  // ECLIPSE: o eclipse vivo (a coroa se mexe devagar em todo céu que mostra ele, e na tela de título)
  sky: boolean;
}

export const PRESETS: Record<Preset, GfxFlags> = {
  performance: { hd: false, light: false, shadows: false, fog: false, reflections: false, post: false, life: 0, particles: 0, hd3: false, cast: false, sky: false },
  high: { hd: false, light: true, shadows: false, fog: true, reflections: true, post: true, life: 1, particles: 1, hd3: false, cast: false, sky: false },
  extreme: { hd: true, light: true, shadows: true, fog: true, reflections: true, post: true, life: 2, particles: 2, hd3: false, cast: false, sky: false },
  eclipse: { hd: true, light: true, shadows: true, fog: true, reflections: true, post: true, life: 2, particles: 2, hd3: true, cast: true, sky: true },
};

export const PRESET_LABEL: Record<Preset, string> = { performance: 'Performance', high: 'High', extreme: 'EXTREME GRAPHICS', eclipse: 'ECLIPSE GRAPHICS' };

export const FLAG_KEYS: (keyof GfxFlags)[] = ['hd', 'light', 'shadows', 'fog', 'reflections', 'post', 'life', 'particles', 'hd3', 'cast', 'sky'];

export function sameFlags(a: GfxFlags, b: GfxFlags) {
  return FLAG_KEYS.every((k) => a[k] === b[k]);
}

// qual predefinição bate com os ajustes (null = personalizado)
export function presetOf(f: GfxFlags): Preset | null {
  return PRESET_IDS.find((p) => sameFlags(PRESETS[p], f)) ?? null;
}

// desenho por software (sem placa de vídeo) não aguenta os efeitos
function softwareGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software/i.test(name);
  } catch {
    return false;
  }
}

// primeira vez: computador com placa de vídeo começa no EXTREME, celular no High e sem placa no Performance
export function defaultPreset(): Preset {
  if (typeof window === 'undefined') return 'high';
  if (softwareGL()) return 'performance';
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  return touch ? 'high' : 'extreme';
}

// ?gfx=performance|high|extreme|eclipse no endereço fixa a predefinição (testes e fotos)
export const FORCED_PRESET: Preset | null = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('gfx');
  return PRESET_IDS.includes(v as Preset) ? (v as Preset) : null;
})();

export function cleanFlags(raw: unknown, fallback: GfxFlags): GfxFlags {
  const r = (raw ?? {}) as Partial<Record<keyof GfxFlags, unknown>>;
  const b = (k: keyof GfxFlags) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (fallback[k] as boolean));
  const l = (k: keyof GfxFlags) => (r[k] === 0 || r[k] === 1 || r[k] === 2 ? (r[k] as Level3) : (fallback[k] as Level3));
  return {
    hd: b('hd'),
    light: b('light'),
    shadows: b('shadows'),
    fog: b('fog'),
    reflections: b('reflections'),
    post: b('post'),
    life: l('life'),
    particles: l('particles'),
    hd3: b('hd3'),
    cast: b('cast'),
    // ajuste gravado antes do eclipse vivo existir: quem estava no ECLIPSE inteiro continua nele
    sky: typeof r.sky === 'boolean' ? r.sky : r.hd3 === true && r.cast === true,
  };
}

// limite de quadros por segundo (0 = acompanha a tela)
export const FPS_LIMITS = [0, 60, 30] as const;
export type FpsLimit = (typeof FPS_LIMITS)[number];

export function applyFpsLimit(loop: { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number; sleep: () => void; wake: (seamless?: boolean) => void }, fps: number) {
  if (loop.fpsLimit === fps) return;
  loop.fpsLimit = fps;
  loop.hasFpsLimit = fps > 0;
  loop._limitRate = fps > 0 ? 1000 / fps : 0;
  // o passo do laço é escolhido ao acordar
  loop.sleep();
  loop.wake(true);
}
