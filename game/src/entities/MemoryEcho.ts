import Phaser from 'phaser';
import { AMBER_BAR, PAL } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { AttackDir } from './Player';
import { DEPTH } from '../world/Decor';
import { hd } from '../gfx/flip';

type Box = [number, number, number, number];

// o que o Eco guardou do cavaleiro em cada quadro
interface Rec {
  t: number;
  x: number;
  y: number;
  tex: string;
  frame: string | number;
  flip: boolean;
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  // golpe valendo naquele quadro: área, qual golpe (conta do cavaleiro), direção e de onde veio
  atk: Box | null;
  n: number;
  dir: AttackDir;
  fromX: number;
  slash: { tex: string; frame: string | number; x: number; y: number; ang: number; fx: boolean; fy: boolean; ox: number; oy: number; sx: number; sy: number } | null;
}

interface Shot {
  t: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  dmg: number;
}

const INK = 0x1c1626;
const box = (r: Phaser.Geom.Rectangle): Box => [r.x, r.y, r.width, r.height];
export const rectOf = (b: Box) => new Phaser.Geom.Rectangle(b[0], b[1], b[2], b[3]);

// Eco: a imagem do espelho da Câmara de Âmbar, agora do lado dele. Uma cópia de tinta com a borda de
// ouro da máscara anda logo atrás do cavaleiro, pelo mesmo caminho e com um atraso curto, e repete
// cada golpe (e cada flecha) com a arma que ele usava, mais fraco. Não machuca nem leva dano; some
// sozinha quando o tempo acaba.
export class MemoryEcho {
  done = false;
  private now = 0;
  private left: number;
  private recs: Rec[] = [];
  private shots: Shot[] = [];
  // inimigos que cada golpe já acertou (o mesmo golpe não acerta duas vezes)
  private struck = new Map<number, Set<unknown>>();
  private played = -1;
  private lastSlash = false;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly slash: Phaser.GameObjects.Sprite;
  private readonly glow: Phaser.GameObjects.Image;

  // len: quanto tempo ela fica (o Relógio do turno estica)
  constructor(private scene: GameScene, len: number = AMBER_BAR.echoTime) {
    this.left = len;
    const p = scene.player;
    const s = p.sprite;
    this.sprite = hd(scene.add.sprite(s.x, s.y, s.texture.key, s.frame.name))
      .setOrigin(s.originX, s.originY)
      .setFlipX(s.flipX)
      .setDepth(DEPTH.player - 0.3)
      .setTintFill(INK)
      .setAlpha(0);
    this.sprite.preFX?.addGlow(PAL.gold, 2, 0, false, 0.1, 8);
    this.slash = scene.add.sprite(0, 0, 'slash', 0).setDepth(DEPTH.slash - 0.1).setVisible(false).setTint(PAL.gold, PAL.gold, 0x6a4a9a, 0x6a4a9a).setAlpha(0.8);
    this.glow = scene.add.image(s.x, s.y - 22, 'glow').setTint(PAL.gold).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.player - 0.4).setAlpha(0).setScale(1.1, 1.5);
    scene.tweens.add({ targets: this.sprite, alpha: 0.86, duration: 220 });
    scene.tweens.add({ targets: this.glow, alpha: 0.22, duration: 220 });
    scene.echoMotes(s.x, s.y - 20, true, 10);
  }

  get remaining() {
    return this.left;
  }

  // gastou outra conta com o Eco ainda aqui: o tempo volta ao começo
  renew(len: number = AMBER_BAR.echoTime) {
    this.left = len;
    this.sprite.setAlpha(0.86);
  }

  // o cavaleiro atirou: o Eco atira igual, do mesmo lugar, depois do atraso
  noteShot(x: number, y: number, dx: number, dy: number, dmg: number) {
    this.shots.push({ t: this.now, x, y, dx, dy, dmg });
  }

  private record() {
    const p = this.scene.player;
    const s = p.sprite;
    const sl = p.slash;
    this.recs.push({
      t: this.now,
      x: s.x,
      y: s.y,
      tex: s.texture.key,
      frame: s.frame.name,
      flip: s.flipX,
      ox: s.originX,
      oy: s.originY,
      sx: s.scaleX,
      sy: s.scaleY,
      atk: p.attacking && !p.dead ? box(p.attackBox()) : null,
      n: p.atkN,
      dir: p.atkDir,
      fromX: p.x,
      slash: sl.visible
        ? { tex: sl.texture.key, frame: sl.frame.name, x: sl.x, y: sl.y, ang: sl.angle, fx: sl.flipX, fy: sl.flipY, ox: sl.originX, oy: sl.originY, sx: sl.scaleX, sy: sl.scaleY }
        : null,
    });
    while (this.recs.length > 2 && this.recs[1].t < this.now - 1) this.recs.shift();
  }

  // o quadro guardado do instante t (o último antes dele)
  private at(t: number) {
    const r = this.recs;
    if (!r.length) return null;
    if (r[0].t > t) return r[0];
    let lo = 0;
    let hi = r.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (r[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return r[lo];
  }

  private show(r: Rec) {
    const s = this.sprite;
    if (s.texture.key !== r.tex) hd(s.setTexture(r.tex, r.frame));
    else s.setFrame(r.frame);
    s.setFlipX(r.flip).setOrigin(r.ox, r.oy).setScale(r.sx, r.sy).setPosition(r.x, r.y);
    this.glow.setPosition(r.x, r.y - 22);
    const sl = r.slash;
    if (sl) {
      if (this.slash.texture.key !== sl.tex) this.slash.setTexture(sl.tex, sl.frame);
      else this.slash.setFrame(sl.frame);
      this.slash.setVisible(true).setPosition(sl.x, sl.y).setAngle(sl.ang).setFlip(sl.fx, sl.fy).setOrigin(sl.ox, sl.oy).setScale(sl.sx, sl.sy);
      if (!this.lastSlash) this.scene.sfx('slash', 0.3, 1.35);
    } else this.slash.setVisible(false);
    this.lastSlash = !!sl;
  }

  update(dt: number) {
    if (this.done) return;
    this.now += dt;
    this.left -= dt;
    this.record();
    const t = this.now - AMBER_BAR.echoDelay;
    // todos os quadros que passaram desde o último (numa pausa de impacto nenhum golpe se perde)
    for (const r of this.recs) {
      if (r.t <= this.played || r.t > t || !r.atk) continue;
      let set = this.struck.get(r.n);
      if (!set) {
        set = new Set();
        this.struck.set(r.n, set);
        if (this.struck.size > 8) this.struck.delete(this.struck.keys().next().value!);
      }
      this.scene.echoStrike(rectOf(r.atk), r.fromX, r.dir, set);
    }
    this.played = t;
    while (this.shots.length && this.shots[0].t <= t) {
      const q = this.shots.shift()!;
      this.scene.echoArrow(q.x, q.y, q.dx, q.dy, q.dmg * this.scene.echoMul);
    }
    const r = this.at(t);
    if (r) this.show(r);
    if (Math.random() < dt * 9) this.scene.echoMotes(this.sprite.x + (Math.random() - 0.5) * 10, this.sprite.y - 6 - Math.random() * 30, true);
    // no fim ela pisca antes de sumir
    if (this.left < 1) this.sprite.setAlpha(0.86 * (0.55 + 0.45 * Math.abs(Math.sin(this.left * 14))));
    if (this.left <= 0) this.end();
  }

  end() {
    if (this.done) return;
    this.done = true;
    const s = this.scene;
    s.echoMotes(this.sprite.x, this.sprite.y - 20, true, 12);
    s.echoMotes(this.sprite.x, this.sprite.y - 20, false, 6);
    this.slash.setVisible(false);
    s.tweens.add({ targets: [this.sprite, this.glow], alpha: 0, duration: 320, onComplete: () => this.destroy() });
  }

  destroy() {
    this.done = true;
    this.sprite.destroy();
    this.slash.destroy();
    this.glow.destroy();
  }
}
