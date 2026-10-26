// Predefinições gráficas: PERFORMANCE (leve, fiel ao visual original), HIGH (o visual original com luz,
// névoa, brilho e vida no cenário) e EXTREME (o cenário reconstruído: terreno e fundos em alta
// resolução, sombras suaves, fachos de luz, camadas de profundidade e tudo o que se mexe).
// Cada ajuste pode ser trocado à parte em Configurações > Imagem; aí a predefinição vira "personalizado".

export type Preset = 'performance' | 'high' | 'extreme';
export const PRESET_IDS: Preset[] = ['performance', 'high', 'extreme'];
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
}

export const PRESETS: Record<Preset, GfxFlags> = {
  performance: { hd: false, light: false, shadows: false, fog: false, reflections: false, post: false, life: 0, particles: 0 },
  high: { hd: false, light: true, shadows: false, fog: true, reflections: true, post: true, life: 1, particles: 1 },
  extreme: { hd: true, light: true, shadows: true, fog: true, reflections: true, post: true, life: 2, particles: 2 },
};

export const PRESET_LABEL: Record<Preset, string> = { performance: 'Performance', high: 'High', extreme: 'EXTREME GRAPHICS' };

export const FLAG_KEYS: (keyof GfxFlags)[] = ['hd', 'light', 'shadows', 'fog', 'reflections', 'post', 'life', 'particles'];

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

// ?gfx=performance|high|extreme no endereço fixa a predefinição (testes e fotos)
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
