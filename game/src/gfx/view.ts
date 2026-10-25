import type Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config';
import { settings, type Quality } from '../systems/Settings';

// Pixels da tela por pixel do mundo: o mundo continua 640x360, mas a tela pode ter 2 ou 3 vezes mais
// pixels para o traço liso dos personagens sair nítido (o cenário em pixel só aumenta). Em aparelho
// fraco, ou sem placa de vídeo, a tela fica com 1 pixel por pixel do mundo e o jogo não fica lento.

// o que a tela do aparelho comporta: 3 em tela grande com muitos pixels, senão 2
function sharpRes() {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * dpr;
  return fit >= 2.6 ? 3 : 2;
}

// desenho por software (sem placa de vídeo): cada pixel a mais custa caro
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

// ?res=1, 2 ou 3 no endereço fixa a resolução (fotos de teste)
const forced = (() => {
  if (typeof window === 'undefined') return 0;
  const r = Number(new URLSearchParams(window.location.search).get('res'));
  return r === 1 || r === 2 || r === 3 ? r : 0;
})();

export function resFor(q: Quality) {
  if (forced) return forced;
  if (q === 'low') return 1;
  if (q === 'high') return sharpRes();
  return softwareGL() ? 1 : sharpRes();
}

export let RES = typeof window === 'undefined' ? 2 : resFor(settings.data.quality);

// troca a resolução com o jogo rodando: a tela muda de tamanho e as câmeras mudam o zoom junto
export function applyRes(game: Phaser.Game, r: number) {
  if (r === RES) return;
  RES = r;
  game.scale.resize(VIEW_W * r, VIEW_H * r);
  for (const s of game.scene.getScenes(true)) for (const cam of s.cameras.cameras) cam.setZoom(r);
}

// Modo automático: se o jogo ficar lento por uns segundos seguidos, a tela perde um nível de
// resolução (3 -> 2 -> 1). Só desce, e só olha o jogo rodando (telas de carregamento não contam).
export function watchSpeed(game: Phaser.Game, playing: () => boolean) {
  let sum = 0;
  let n = 0;
  let calm = 2;
  game.events.on('step', (_t: number, delta: number) => {
    if (forced || settings.data.quality !== 'auto' || RES <= 1) return;
    if (!playing() || delta > 250 || document.hidden) {
      sum = n = 0;
      calm = 1;
      return;
    }
    if (calm > 0) {
      calm -= delta / 1000;
      return;
    }
    sum += delta;
    n++;
    if (sum < 3000) return;
    const fps = (n * 1000) / sum;
    sum = n = 0;
    if (fps < 42) {
      applyRes(game, RES - 1);
      calm = 2;
    }
  });
}

// Câmeras com zoom: o mundo é 640x360 e a tela tem RES pixels por pixel do mundo.
// Telas paradas (título, abertura, interface, efeitos) crescem a partir do canto de cima.
export function fixedCamera(scene: Phaser.Scene) {
  return scene.cameras.main.setZoom(RES).setOrigin(0, 0);
}

// Canto de cima à esquerda da tela para o que fica preso nela (scrollFactor 0). Na câmera que
// segue o cavaleiro o zoom é em volta do meio, e esse canto não fica no 0.
export function screenOrigin(cam: Phaser.Cameras.Scene2D.Camera) {
  const k = 1 - 1 / cam.zoom;
  return { x: cam.width * cam.originX * k, y: cam.height * cam.originY * k };
}
