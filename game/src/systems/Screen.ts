import type Phaser from 'phaser';
import { settings } from './Settings';

// A tela do celular: tela cheia de verdade e a imagem deitada.
//
// Com o celular em pé o jogo (16:9) virava uma faixa pequena. Quando a tela do aparelho não deita
// sozinha (rotação travada, ou o jogo aberto dentro de outro app que fica sempre em pé), ele ficava
// preso assim. Agora, num aparelho de toque em pé, a página inteira (jogo, botões e menus) é desenhada
// deitada, girada 90 graus: é só virar o celular e o jogo ocupa a tela toda. Quando a tela do aparelho
// deita de verdade, a página volta ao normal sozinha.
//
// A página girada continua com as medidas de uma tela deitada: o body é o "contêiner" das medidas do
// CSS (style.css usa @container e cqw/cqh, não @media e vw/vh), e quem lê posição de toque ou de
// elemento pela tela (o analógico, o mapa, a camada de textos, o Phaser) passa por layoutRect/toLocal.

export type Turn = 0 | 90 | -90;

let turn: Turn = 0;
// celular em pé com a opção "imagem pequena em cima" (o jogo numa faixa e os botões embaixo)
let small = false;
// a tela de verdade (px do CSS)
let vw = 0;
let vh = 0;
let game: Phaser.Game | null = null;
const listeners = new Set<() => void>();

// aparelho de toque (os controles na tela já ligaram, ou o ponteiro principal é o dedo)
export function touchDevice() {
  return document.body.classList.contains('touch') || !!window.matchMedia?.('(pointer: coarse)').matches;
}

export function smallPortrait() {
  return small;
}

// o tamanho da tela deitada (no celular em pé também: é como o jogo vai ficar), para escolher a resolução
export function landscapeSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return touchDevice() ? { w: Math.max(w, h), h: Math.min(w, h) } : { w, h };
}

// um ponto da tela de verdade (clientX, clientY) nas coordenadas da página (girada ou não)
export function toLocal(x: number, y: number) {
  if (turn === 90) return { x: y, y: vw - x };
  if (turn === -90) return { x: vh - y, y: x };
  return { x, y };
}

// um deslocamento da tela de verdade (o dedo andou dx, dy) nas coordenadas da página
export function toLocalVec(dx: number, dy: number) {
  if (turn === 90) return { x: dy, y: -dx };
  if (turn === -90) return { x: -dy, y: dx };
  return { x: dx, y: dy };
}

// o retângulo de um elemento nas coordenadas da página (getBoundingClientRect dá o da tela de verdade)
export function layoutRect(el: Element) {
  const r = el.getBoundingClientRect();
  if (turn === 90) return { left: r.top, top: vw - r.right, width: r.height, height: r.width };
  if (turn === -90) return { left: vh - r.bottom, top: r.left, width: r.height, height: r.width };
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function onScreenChange(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// confere se a página tem de girar (ou desgirar) e arruma tudo
export function updateScreen() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const portrait = H > W * 1.05;
  const touch = touchDevice();
  const wantSmall = touch && portrait && settings.data.portrait === 'small';
  const want: Turn = touch && portrait && !wantSmall ? (settings.data.flip ? -90 : 90) : 0;
  const root = document.documentElement;
  if (want === turn && wantSmall === small && W === vw && H === vh) return;
  turn = want;
  small = wantSmall;
  vw = W;
  vh = H;
  root.classList.toggle('small-portrait', small);
  const b = document.body.style;
  root.classList.toggle('turn-cw', want === 90);
  root.classList.toggle('turn-ccw', want === -90);
  if (want) {
    b.position = 'fixed';
    b.left = '0px';
    b.top = '0px';
    b.width = `${H}px`;
    b.height = `${W}px`;
    b.transformOrigin = '0 0';
    b.transform = want === 90 ? `translateX(${W}px) rotate(90deg)` : `translateY(${H}px) rotate(-90deg)`;
  } else {
    b.position = b.left = b.top = b.width = b.height = b.transformOrigin = b.transform = '';
  }
  if (game?.isBooted) {
    // o Phaser mede o lugar do jogo de novo (com a página girada, pelas medidas da página)
    game.scale.getParentBounds();
    game.scale.refresh();
  }
  listeners.forEach((l) => l());
}

// liga o acompanhamento da tela; o Phaser passa a medir o lugar do jogo pelas medidas da página
export function initScreen(g: Phaser.Game) {
  game = g;
  const sm = g.scale as unknown as {
    parent: HTMLElement;
    parentSize: { width: number; height: number; setSize: (w: number, h: number) => void };
    getParentBounds: () => boolean;
  };
  const original = sm.getParentBounds.bind(sm);
  sm.getParentBounds = () => {
    if (!turn) return original();
    const w = sm.parent.clientWidth;
    const h = sm.parent.clientHeight;
    if (sm.parentSize.width === w && sm.parentSize.height === h) return false;
    sm.parentSize.setSize(w, h);
    return true;
  };
  const check = () => updateScreen();
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => window.setTimeout(check, 120));
  window.visualViewport?.addEventListener('resize', check);
  settings.onChange(check);
  document.addEventListener('fullscreenchange', () => {
    check();
    fsListeners.forEach((l) => l());
  });
  document.addEventListener('webkitfullscreenchange', () => {
    check();
    fsListeners.forEach((l) => l());
  });
  updateScreen();
}

// ---------- tela cheia ----------
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsListeners = new Set<() => void>();

export function canFullscreen() {
  const d = document as FsDoc;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen() {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function onFullscreenChange(l: () => void) {
  fsListeners.add(l);
  return () => fsListeners.delete(l);
}

// entra na tela cheia e deita a tela (precisa vir de um toque ou clique: o navegador só deixa assim)
export function enterFullscreen() {
  if (!canFullscreen() || isFullscreen()) return;
  const el = document.documentElement as FsEl;
  const lock = () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    try {
      o?.lock?.('landscape')?.catch?.(() => undefined);
    } catch {
      /* o aparelho não deixa travar a tela deitada */
    }
  };
  try {
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => undefined);
    else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
      lock();
    }
  } catch {
    /* sem tela cheia aqui (dentro de outro site, por exemplo) */
  }
}

export function exitFullscreen() {
  const d = document as FsDoc;
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* nada para destravar */
  }
  try {
    if (d.exitFullscreen) d.exitFullscreen().catch(() => undefined);
    else d.webkitExitFullscreen?.();
  } catch {
    /* já saiu */
  }
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

// ao começar a jogar (Continuar, Novo jogo, voltar da pausa): no celular, entra na tela cheia sozinho
export function autoFullscreen() {
  if (settings.data.fullscreen && touchDevice()) enterFullscreen();
}
