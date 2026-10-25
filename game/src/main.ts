import { progress } from './systems/Save';
import Phaser from 'phaser';
import { PLAYER, VIEW_H, VIEW_W } from './config';
import { RES, watchSpeed } from './gfx/view';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { IntroScene } from './scenes/IntroScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { FxScene } from './scenes/FxScene';
import { ui } from './ui/ui';
import { pad } from './systems/Pad';
import { settings } from './systems/Settings';
import './systems/Audio';

pad.vibration = settings.data.vibration;
settings.onChange((d) => (pad.vibration = d.vibration));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W * RES,
  height: VIEW_H * RES,
  backgroundColor: '#07080d',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { gamepad: false, activePointers: 4 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: PLAYER.gravity }, fps: 120, tileBias: 20 },
  },
  scene: [BootScene, TitleScene, IntroScene, GameScene, HudScene, FxScene],
});

ui.init(game);
// resolução automática: desce um nível se o jogo ficar lento (só conta com o cavaleiro andando)
watchSpeed(game, () => {
  const g = game.scene.getScene('game') as GameScene | null;
  return !!g && g.scene.isActive() && g.live;
});
// acesso para os testes automatizados
Object.assign(window as object, { __game: game, __ui: ui, __progress: progress, __settings: settings, __res: () => RES });
