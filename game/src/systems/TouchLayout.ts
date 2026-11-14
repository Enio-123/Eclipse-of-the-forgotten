import { settings, TOUCH_IDS, type TouchId, type TouchSpot } from './Settings';
import { onScreenChange, smallPortrait } from './Screen';

// O lugar e o tamanho dos controles na tela do celular.
//
// Cada controle guarda onde fica o centro: a distância até a borda mais perto na horizontal (esquerda ou
// direita) e na vertical (em cima ou embaixo), contada da área sem entalhe, e o tamanho (k, 1 = o padrão).
// Assim o mesmo arranjo serve em qualquer tela: o que estava no canto continua no canto. O padrão é o
// lugar de sempre (o de antes do editor). Com a opção "imagem pequena em cima" os controles descem para
// baixo da faixa do jogo, como antes.

// o tamanho padrão de cada controle (px do CSS)
export const TOUCH_SIZE: Record<TouchId, number> = { stick: 136, jump: 78, attack: 66, dash: 66, hook: 54, memory: 50, skill: 60, pause: 46 };

export const TOUCH_DEFAULT: Record<TouchId, TouchSpot> = {
  stick: { h: 'l', v: 'b', x: 92, y: 94, k: 1 },
  jump: { h: 'r', v: 'b', x: 63, y: 61, k: 1 },
  attack: { h: 'r', v: 'b', x: 151, y: 61, k: 1 },
  dash: { h: 'r', v: 'b', x: 97, y: 143, k: 1 },
  hook: { h: 'r', v: 'b', x: 171, y: 131, k: 1 },
  memory: { h: 'r', v: 'b', x: 215, y: 59, k: 1 },
  skill: { h: 'r', v: 'b', x: 56, y: 216, k: 1 },
  pause: { h: 'r', v: 't', x: 37, y: 35, k: 1 },
};

export const TOUCH_NAME: Record<TouchId, string> = {
  stick: 'Analógico', jump: 'Pular', attack: 'Atacar', dash: 'Dash', hook: 'Gancho', memory: 'Memória', skill: 'Habilidade', pause: 'Pausa',
};

export function touchEl(id: TouchId): HTMLElement | null {
  if (id === 'stick') return document.getElementById('stick');
  if (id === 'pause') return document.getElementById('pause-btn');
  return document.querySelector<HTMLElement>(`#buttons [data-action="${id}"]`);
}

export function touchIdOf(el: Element): TouchId | null {
  if (el.id === 'stick') return 'stick';
  if (el.id === 'pause-btn') return 'pause';
  const a = (el as HTMLElement).dataset?.action as TouchId | undefined;
  return a && TOUCH_IDS.includes(a) ? a : null;
}

export function spotOf(id: TouchId): TouchSpot {
  return settings.data.touchLayout[id] ?? TOUCH_DEFAULT[id];
}

// a área dos controles: o tamanho da página (deitada, se a imagem estiver deitada), o entalhe de cada lado e,
// com a imagem pequena em cima, quanto os controles descem
export interface Frame {
  w: number;
  h: number;
  l: number;
  t: number;
  r: number;
  b: number;
  shiftT: number;
  shiftB: number;
}

let probe: HTMLElement | null = null;

export function frame(): Frame {
  const w = document.body.clientWidth;
  const h = document.body.clientHeight;
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-probe';
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const small = smallPortrait();
  return {
    w, h, l: px(cs.paddingLeft), t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom),
    // a faixa do jogo (16:9 na largura toda, 12 px abaixo do entalhe) e o espaço do aviso de girar
    shiftT: small ? (w * 9) / 16 + 42 : 0,
    shiftB: small ? 38 : 0,
  };
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

// o centro de um controle na página, sempre inteiro dentro da área sem entalhe
export function clampCenter(id: TouchId, cx: number, cy: number, k: number, f: Frame) {
  const rad = (TOUCH_SIZE[id] * k) / 2;
  return { cx: clamp(cx, f.l + rad, f.w - f.r - rad), cy: clamp(cy, f.t + rad, f.h - f.b - rad), rad };
}

export function centerOf(id: TouchId, s: TouchSpot, f: Frame) {
  const cx = s.h === 'l' ? f.l + s.x : f.w - f.r - s.x;
  const cy = s.v === 't' ? f.t + f.shiftT + s.y : f.h - f.b - f.shiftB - s.y;
  return clampCenter(id, cx, cy, s.k, f);
}

// o lugar guardado para um centro (cx, cy): presa à borda mais perto em cada eixo
export function spotAt(cx: number, cy: number, k: number, f: Frame): TouchSpot {
  const h = cx < f.w / 2 ? 'l' : 'r';
  const v = cy < (f.t + f.shiftT + f.h - f.b - f.shiftB) / 2 ? 't' : 'b';
  const x = h === 'l' ? cx - f.l : f.w - f.r - cx;
  const y = v === 't' ? cy - f.t - f.shiftT : f.h - f.b - f.shiftB - cy;
  return { h, v, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, k: Math.round(k * 100) / 100 };
}

// põe cada controle no lugar (e no tamanho) guardado, e a opacidade
export function applyTouchLayout() {
  const f = frame();
  if (!f.w || !f.h) return;
  for (const id of TOUCH_IDS) {
    const el = touchEl(id);
    if (!el) continue;
    const s = spotOf(id);
    const { cx, cy, rad } = centerOf(id, s, f);
    const st = el.style;
    st.left = `${(cx - rad).toFixed(1)}px`;
    st.top = `${(cy - rad).toFixed(1)}px`;
    st.right = st.bottom = 'auto';
    st.width = st.height = `${(rad * 2).toFixed(1)}px`;
    st.setProperty('--k', s.k.toFixed(3));
  }
  document.getElementById('touch')?.style.setProperty('--touch-a', String(settings.data.touchAlpha));
}

let watching = false;

// acompanha a tela (girar, entalhe, imagem deitada ou pequena) e os ajustes
export function watchTouchLayout() {
  if (watching) return;
  watching = true;
  let queued = 0;
  const later = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      applyTouchLayout();
    });
  };
  window.addEventListener('resize', later);
  window.visualViewport?.addEventListener('resize', later);
  onScreenChange(applyTouchLayout);
  settings.onChange(later);
  applyTouchLayout();
}
