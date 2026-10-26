import Phaser from 'phaser';
import type { FxScene } from './FxScene';
import { VIEW_W, WEAPONS, type WeaponId } from '../config';
import { settings } from '../systems/Settings';
import { audio } from '../systems/Audio';
import { loadSave, progress } from '../systems/Save';
import { Weather } from '../world/Weather';
import { ui } from '../ui/ui';
import { fixedCamera } from '../gfx/view';
import { hd } from '../gfx/flip';
import type { GameInit } from './GameScene';

// Tela de título: o castelo de Vespera sob o eclipse, na chuva, e o cavaleiro no penhasco
export class TitleScene extends Phaser.Scene {
  private weather!: Weather;
  private cloudsFar!: Phaser.GameObjects.TileSprite;
  private cloudsNear!: Phaser.GameObjects.TileSprite;
  private fog!: Phaser.GameObjects.TileSprite;
  private fogFront!: Phaser.GameObjects.TileSprite;
  private knight!: Phaser.GameObjects.Sprite;
  private leaving = false;

  constructor() {
    super('title');
  }

  create() {
    fixedCamera(this);
    this.leaving = false;
    (this.scene.get('fx') as FxScene | null)?.setGrain(0.09);
    const add = this.add;
    add.image(0, 0, 'title-sky').setOrigin(0).setDepth(-20);
    this.cloudsFar = add.tileSprite(0, 150, VIEW_W, 170, 'clouds-far').setOrigin(0).setDepth(-18);
    add.image(0, 0, 'title-land').setOrigin(0).setDepth(-17);
    const rim = add.image(0, 0, 'title-rim').setOrigin(0).setDepth(-16.9).setAlpha(0);
    this.cloudsNear = add.tileSprite(0, -70, VIEW_W, 150, 'clouds-near').setOrigin(0).setDepth(-16.5);
    this.fog = add.tileSprite(0, 246, VIEW_W, 140, 'fog').setOrigin(0).setDepth(-15).setAlpha(0.65);
    this.knight = add.sprite(128, 299, 'knight-scythe', 0).setDepth(10);
    this.showKnight(settings.data.weapon);
    this.weather = new Weather(this, null, {
      rain: true,
      lightning: true,
      drips: 0,
      petals: false,
      motes: false,
      rims: [rim],
      boltDepth: -19,
      floorAt: (x) => (x > 0 && x < 150 ? 299 : null),
    });
    this.fogFront = add.tileSprite(0, 262, VIEW_W, 140, 'fog').setOrigin(0).setDepth(30).setAlpha(0.3);
    add.image(0, 0, 'vignette').setOrigin(0).setDepth(29).setAlpha(0.55);
    this.cameras.main.fadeIn(1600, 0, 0, 0);
    audio.music('title');
    audio.ambience('rain');
    audio.space = 0.12;
    this.showMenu();
  }

  // o cavaleiro no penhasco segura a arma escolhida
  private showKnight(w: WeaponId) {
    const o = this.registry.get(`knight-${w}-origin`) as { x: number; y: number };
    hd(this.knight.setTexture(`knight-${w}`, 0).setOrigin(o.x, o.y)).play(`knight-${w}-idle`);
  }

  private showMenu(notice?: string) {
    const save = loadSave();
    ui.menu({
      hasSave: !!save,
      notice,
      onContinue: () => {
        if (!save || this.leaving) return;
        progress.restore(save);
        // uma arma de chefe só vale se a vitória está no save; de começo, só a escolhida
        settings.data.weapon = progress.hasWeapon(save.weapon) ? save.weapon : (progress.starter ?? 'scythe');
        settings.save();
        this.go({ room: save.room, entry: save.entry, from: 'continue' });
      },
      onNew: () => this.pickWeapon(),
      onErase: () => this.erase(),
    });
  }

  // apaga o save e o que estiver na memória; as configurações ficam (menos uma arma de chefe)
  private erase() {
    progress.reset();
    if (WEAPONS[settings.data.weapon].boss) {
      settings.data.weapon = 'scythe';
      settings.save();
      this.showKnight('scythe');
    }
    audio.sfx('erase');
    this.cameras.main.flash(500, 20, 18, 26);
    this.showMenu('Progresso apagado. O jogo começa do zero; as configurações continuam iguais.');
  }

  private pickWeapon() {
    // num jogo novo, as armas de chefe ainda não foram ganhas
    ui.weapons({
      current: settings.data.weapon,
      has: (w) => !WEAPONS[w].boss,
      sub: 'A foice é a arma do carrasco. As outras são estilos diferentes de lutar. A escolhida vai com você até o fim: as outras três não voltam.',
      confirmLabel: 'Começar',
      onConfirm: (w) => {
        if (this.leaving) return;
        this.leaving = true;
        settings.data.weapon = w;
        settings.save();
        progress.reset();
        // a escolha vale para o jogo inteiro (entra no primeiro save)
        progress.starter = w;
        ui.closeAll();
        const cam = this.cameras.main;
        cam.fadeOut(900, 0, 0, 0);
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('intro'));
      },
      onBack: () => this.showMenu(),
    });
  }

  private go(data: GameInit) {
    this.leaving = true;
    ui.closeAll();
    const cam = this.cameras.main;
    cam.fadeOut(700, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('game', data));
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    this.cloudsFar.tilePositionX = time * 0.004;
    this.cloudsNear.tilePositionX = time * 0.009;
    this.fog.tilePositionX = time * 0.008;
    this.fogFront.tilePositionX = time * 0.016;
    this.weather.update(dt);
  }
}
