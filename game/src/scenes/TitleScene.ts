import Phaser from 'phaser';
import type { FxScene } from './FxScene';
import { MAGE_IDS, VIEW_W, WEAPONS, type MageId, type WeaponId } from '../config';
import { settings } from '../systems/Settings';
import { audio } from '../systems/Audio';
import { loadSave, progress, type SaveData } from '../systems/Save';
import { Weather } from '../world/Weather';
import { FILMS, NUMERAL } from '../world/endings';
import { ENDING_IDS, type EndingId } from '../world/story';
import { ui } from '../ui/ui';
import { fixedCamera } from '../gfx/view';
import { hd } from '../gfx/flip';
import { unmasked } from '../gfx/unmask';
import { SKY_ECLIPSE, bigEclipse } from '../gfx/eclipse';
import { HeadCrown, KING_TINT } from '../gfx/crown';
import type { GameInit } from './GameScene';
import type { PathId } from '../ui/ui';

// o final gravado no save (null: ainda não terminou)
const endingOf = (save: SaveData | null): EndingId | null => (save ? (ENDING_IDS.find((k) => save.seen.includes(`ending:${k}`)) ?? null) : null);

// Tela de título: o castelo de Vespera sob o eclipse, na chuva, e o cavaleiro no penhasco. Depois do fim a
// tela muda com o final do save: a primeira manhã no I (ele sem a máscara) e no III (o penhasco vazio, as
// pétalas no vento), o eclipse maior e a chuva no II; a música é a do final
export class TitleScene extends Phaser.Scene {
  private weather!: Weather;
  private cloudsFar!: Phaser.GameObjects.TileSprite;
  private cloudsNear!: Phaser.GameObjects.TileSprite;
  private fog!: Phaser.GameObjects.TileSprite;
  private fogFront!: Phaser.GameObjects.TileSprite;
  private knight!: Phaser.GameObjects.Sprite;
  private leaving = false;
  private ended: EndingId | null = null;
  // o que ficou escolhido nas telas do jogo novo (voltar e ir de novo mantém)
  private pathSel: PathId | null = null;
  private mageSel: MageId | null = null;

  constructor() {
    super('title');
  }

  // o céu da manhã só vem quando o save terminou no I ou no III
  preload() {
    const e = endingOf(loadSave());
    if ((e === 'truth' || e === 'fragments') && !this.textures.exists('title-sky-aurora')) this.load.image('title-sky-aurora', 'assets/title-sky-aurora.png');
  }

  create(data?: { notice?: string }) {
    fixedCamera(this);
    this.leaving = false;
    this.pathSel = null;
    this.mageSel = null;
    const e = (this.ended = endingOf(loadSave()));
    const dawn = (e === 'truth' || e === 'fragments') && this.textures.exists('title-sky-aurora');
    (this.scene.get('fx') as FxScene | null)?.setGrain(0.09);
    const add = this.add;
    add.image(0, 0, dawn ? 'title-sky-aurora' : 'title-sky').setOrigin(0).setDepth(-20);
    // o novo Eclipse, maior que o de antes
    if (e === 'absorb') bigEclipse(this, SKY_ECLIPSE.title.x, SKY_ECLIPSE.title.y, SKY_ECLIPSE.title.r, -19.5);
    this.cloudsFar = add.tileSprite(0, 150, VIEW_W, 170, 'clouds-far').setOrigin(0).setDepth(-18);
    add.image(0, 0, 'title-land').setOrigin(0).setDepth(-17);
    const rim = add.image(0, 0, 'title-rim').setOrigin(0).setDepth(-16.9).setAlpha(0);
    this.cloudsNear = add.tileSprite(0, -70, VIEW_W, 150, 'clouds-near').setOrigin(0).setDepth(-16.5);
    this.fog = add.tileSprite(0, 246, VIEW_W, 140, 'fog').setOrigin(0).setDepth(-15).setAlpha(0.65);
    this.knight = add.sprite(128, 299, 'knight-scythe', 0).setDepth(10);
    this.showKnight(settings.data.weapon);
    // no final III ele não voltou: o penhasco fica vazio; no II ele está de coroa, com o ouro no corpo
    this.knight.setVisible(e !== 'fragments');
    if (e === 'absorb') {
      this.knight.setTint(KING_TINT);
      new HeadCrown(this, this.knight, 10.05);
    }
    this.weather = new Weather(this, null, {
      rain: !dawn,
      lightning: !dawn,
      drips: 0,
      petals: e === 'fragments',
      motes: false,
      rims: [rim],
      boltDepth: -19,
      floorAt: (x) => (x > 0 && x < 150 ? 299 : null),
    });
    this.fogFront = add.tileSprite(0, 262, VIEW_W, 140, 'fog').setOrigin(0).setDepth(30).setAlpha(0.3);
    if (dawn) {
      // a manhã: as nuvens e a névoa pegam a luz quente do sol
      this.cloudsFar.setTint(0xffe2c6).setAlpha(0.6);
      this.cloudsNear.setTint(0xf0d8c4).setAlpha(0.5);
      this.fog.setTint(0xffe6d2);
      this.fogFront.setTint(0xffe6d2);
    }
    add.image(0, 0, 'vignette').setOrigin(0).setDepth(29).setAlpha(dawn ? 0.42 : 0.55);
    this.cameras.main.fadeIn(1600, 0, 0, 0);
    audio.music(e ? FILMS[e].track : 'title');
    audio.ambience(dawn ? 'wind' : 'rain');
    audio.space = 0.12;
    this.showMenu(data?.notice);
  }

  // o cavaleiro no penhasco segura a arma escolhida (no final I, sem a máscara)
  private showKnight(w: WeaponId) {
    const key = this.ended === 'truth' ? unmasked(this, `knight-${w}`) : `knight-${w}`;
    const o = this.registry.get(`${key}-origin`) as { x: number; y: number };
    hd(this.knight.setTexture(key, 0).setOrigin(o.x, o.y)).play(`${key}-idle`);
  }

  private showMenu(notice?: string) {
    const save = loadSave();
    const e = endingOf(save);
    ui.menu({
      hasSave: !!save,
      notice,
      ended: e ? `${NUMERAL[e]} · ${FILMS[e].title}` : undefined,
      onFilm: e ? () => this.film(e) : undefined,
      // no final III ele não voltou: o jogo salvo não continua
      continueOk: e !== 'fragments',
      onContinue: () => {
        if (!save || this.leaving) return;
        progress.restore(save);
        // uma arma de chefe só vale se a vitória está no save; de começo, só a escolhida
        settings.data.weapon = progress.hasWeapon(save.weapon) ? save.weapon : progress.fallbackWeapon();
        settings.save();
        this.go({ room: save.room, entry: save.entry, from: 'continue' });
      },
      onNew: () => this.pickPath(),
      onErase: () => this.erase(),
    });
  }

  // rever o filme do final: o save entra antes (o nome dela nas frases e nos créditos segue o que ele lembra);
  // no fim do filme, ou com Esc, volta para cá
  private film(e: EndingId) {
    const save = loadSave();
    if (!save || this.leaving) return;
    this.leaving = true;
    progress.restore(save);
    ui.closeAll();
    const [r, g, b] = FILMS[e].fade;
    const cam = this.cameras.main;
    audio.music('none', 1.2);
    cam.fadeOut(1100, r, g, b);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('ending', { kind: e, replay: true }));
  }

  // apaga o save e o que estiver na memória; as configurações ficam (menos uma arma de chefe)
  private erase() {
    const notice = 'Progresso apagado. O jogo começa do zero; as configurações continuam iguais.';
    progress.reset();
    if (WEAPONS[settings.data.weapon].boss) {
      settings.data.weapon = 'scythe';
      settings.save();
      this.showKnight('scythe');
    }
    audio.sfx('erase');
    // depois de um final a tela volta a ser a de antes (a noite, a chuva e ele no penhasco)
    if (this.ended) {
      this.leaving = true;
      ui.closeAll();
      this.scene.restart({ notice });
      return;
    }
    this.cameras.main.flash(500, 20, 18, 26);
    this.showMenu(notice);
  }

  // primeiro o caminho (Cavaleiro ou Mago), depois a arma ou a escola
  private pickPath() {
    const w = settings.data.weapon;
    const mage = WEAPONS[w].mage;
    ui.path({
      current: this.pathSel ?? (mage ? 'mage' : 'knight'),
      knight: !mage && !WEAPONS[w].boss ? w : 'scythe',
      mage: this.mageSel ?? mage ?? 'eclipse',
      onConfirm: (p) => {
        this.pathSel = p;
        if (p === 'mage') this.pickMage();
        else this.pickWeapon();
      },
      onBack: (p) => {
        this.pathSel = p;
        this.showMenu();
      },
    });
  }

  private pickWeapon() {
    // num jogo novo, as armas de chefe ainda não foram ganhas
    ui.weapons({
      current: settings.data.weapon,
      has: (w) => !WEAPONS[w].boss,
      sub: 'A foice é a arma do carrasco. As outras são estilos diferentes de lutar. A escolhida vai com você até o fim: as outras três não voltam.',
      confirmLabel: 'Começar',
      onConfirm: (w) => this.start(w),
      onBack: () => this.pickPath(),
    });
  }

  private pickMage() {
    const w = settings.data.weapon;
    ui.mages({
      current: this.mageSel ?? (MAGE_IDS.includes(w as MageId) ? (w as MageId) : 'eclipse'),
      onConfirm: (m) => this.start(m),
      onBack: (m) => {
        this.mageSel = m;
        this.pickPath();
      },
    });
  }

  private start(w: WeaponId) {
    if (this.leaving) return;
    this.leaving = true;
    settings.data.weapon = w;
    settings.save();
    progress.reset();
    // a escolha vale para o jogo inteiro (entra no primeiro save)
    progress.starter = w;
    this.showKnight(w);
    ui.closeAll();
    const cam = this.cameras.main;
    cam.fadeOut(900, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('intro'));
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
