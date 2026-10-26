import Phaser from 'phaser';
import { REFLEXO as C, PLAYER } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { overlap, type BossFoe, type HitDir, type HitResult } from './Enemy';
import { DEPTH } from '../world/Decor';
import { hd } from '../gfx/flip';
import { drawLash, type LashLook, type LashPose } from '../gfx/lash';

type State = 'sleep' | 'emerge' | 'fight' | 'dead';
type Box = [number, number, number, number];

// o que o espelho guardou do cavaleiro em cada quadro
interface Rec {
  t: number;
  x: number;
  y: number;
  tex: string;
  frame: string | number;
  flip: boolean;
  ox: number;
  oy: number;
  // o corpo esticado ou amassado do cavaleiro naquele quadro
  sx: number;
  sy: number;
  body: Box;
  atk: Box | null;
  slash: { tex: string; frame: string | number; x: number; y: number; ang: number; fx: boolean; fy: boolean; ox: number; oy: number; sx: number; sy: number } | null;
  // o chicote do Véu ou a corrente naquele quadro, e a conta dos pulsos do Cajado da Dobra
  lash: LashPose | null;
  pulse: number;
}

interface Shot {
  t: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  // a bolinha do Cajado do Eclipse (volta como bolinha, não como flecha)
  orb: boolean;
}

// o chicote e a corrente feitos de Âmbar aceso
const LASH_LOOK: LashLook = { body: 0xc8641c, edge: 0xffe6a6, tip: 0xfff4dc, hook: 0xb0581a };

const box = (r: Phaser.Geom.Rectangle): Box => [r.x, r.y, r.width, r.height];
const rectOf = (b: Box) => new Phaser.Geom.Rectangle(b[0], b[1], b[2], b[3]);

// O Reflexo: o espelho de Âmbar da Câmara guarda o cavaleiro e devolve com atraso. Antes da luta a
// imagem fica dentro da pedra polida; quando ela passa na frente do espelho, sai dele e passa a
// repetir, no mesmo lugar e com o mesmo atraso, tudo o que o cavaleiro fez: o caminho, os pulos e os
// golpes (com a arma que ele usava). Encostar nela ou ficar onde o próprio golpe vai cair machuca.
// Cada golpe nela trava a imagem por um instante; depois ela corre para alcançar.
export class Reflexo implements BossFoe {
  readonly kind = 'boss' as const;
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly maxHp = C.hp;
  hp = C.hp;
  alive = true;
  facing: 1 | -1 = 1;
  onDefeat: (() => void) | null = null;
  harmFrom: number | undefined;
  private state: State = 'sleep';
  private t = 0;
  private now = 0;
  private lag: number = C.delay;
  private target: number = C.delay;
  private freeze = 0;
  private phase2 = false;
  private flashT = 0;
  private recs: Rec[] = [];
  private shots: Shot[] = [];
  private cur: Rec | null = null;
  private lastSlash = false;
  private lastPulse = -1;
  private readonly slash: Phaser.GameObjects.Sprite;
  private readonly lashG: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly maskG: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.Display.Masks.GeometryMask;
  private readonly mx: number;
  private readonly floor: number;
  private emergeFrom = { x: 0, y: 0 };

  constructor(private scene: GameScene, x: number, feetY: number) {
    this.mx = x;
    this.floor = feetY;
    this.zone = scene.add.zone(x, feetY - PLAYER.bodyH / 2, PLAYER.bodyW, PLAYER.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.checkCollision.none = true;
    const tex = scene.player?.sprite.texture.key ?? 'knight-scythe';
    this.sprite = hd(scene.add.sprite(x, feetY, tex, 0).setDepth(DEPTH.prop + 0.2));
    this.slash = scene.add.sprite(0, 0, 'slash', 0).setDepth(DEPTH.slash).setVisible(false);
    this.lashG = scene.add.graphics().setDepth(DEPTH.slash);
    this.glow = scene.add.image(x, feetY - 24, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.2).setAlpha(0).setScale(1.4, 1.8);
    // dentro do espelho: só aparece o que cai na face polida
    const pane = scene.mine?.mirror?.pane ?? { cx: x, cy: feetY - 72, rx: 27, ry: 64 };
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff).fillEllipse(pane.cx, pane.cy, pane.rx * 2, pane.ry * 2);
    this.mask = this.maskG.createGeometryMask();
    this.sprite.setMask(this.mask);
    this.look(false);
    this.sprite.setVisible(false);
  }

  get rect() {
    return this.cur ? rectOf(this.cur.body) : new Phaser.Geom.Rectangle(this.zone.x - 7, this.zone.y - 21, 14, 42);
  }

  get sleeping() {
    return this.state === 'sleep';
  }

  private get present() {
    return this.state === 'fight';
  }

  // cor da imagem: dentro da pedra é escura e funda; fora, Âmbar aceso por dentro
  private look(out: boolean) {
    if (out) {
      this.sprite.setTint(0xffe0a0, 0xffc870, 0xd27a26, 0xb0581a).setAlpha(0.94);
      this.slash.setTint(0xffe6a6, 0xffe6a6, 0xffa63c, 0xffa63c);
    } else {
      this.sprite.setTint(0x9a5a28, 0x9a5a28, 0x5a2a08, 0x5a2a08).setAlpha(0.5);
    }
  }

  // o cavaleiro atirou com o arco (ou o mago soltou a bolinha): o reflexo atira igual, depois do atraso
  noteShot(x: number, y: number, dx: number, dy: number, orb = false) {
    this.shots.push({ t: this.now, x, y, dx, dy, orb });
  }

  wake() {
    if (this.state !== 'sleep') return;
    this.go('emerge');
    this.scene.sfx('glass', 0.5, 0.6);
  }

  private go(s: State) {
    this.state = s;
    this.t = 0;
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
      body: box(p.rect),
      atk: p.attacking && !p.dead ? box(p.attackBox()) : null,
      slash: sl.visible
        ? { tex: sl.texture.key, frame: sl.frame.name, x: sl.x, y: sl.y, ang: sl.angle, fx: sl.flipX, fy: sl.flipY, ox: sl.originX, oy: sl.originY, sx: sl.scaleX, sy: sl.scaleY }
        : null,
      lash: p.lashPose && !p.dead ? { ...p.lashPose } : null,
      pulse: p.pulseN,
    });
    while (this.recs.length > 2 && this.recs[1].t < this.now - 3) this.recs.shift();
  }

  // o quadro guardado do instante t (o último antes dele)
  private at(t: number) {
    const r = this.recs;
    if (!r.length) return null;
    let lo = 0;
    let hi = r.length - 1;
    if (r[0].t > t) return r[0];
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
    this.facing = r.flip ? -1 : 1;
    const b = r.body;
    this.body.reset(b[0] + b[2] / 2, b[1] + b[3] / 2);
    const sl = r.slash;
    if (sl && this.state !== 'sleep') {
      if (this.slash.texture.key !== sl.tex) this.slash.setTexture(sl.tex, sl.frame);
      else this.slash.setFrame(sl.frame);
      this.slash.setVisible(true).setPosition(sl.x, sl.y).setAngle(sl.ang).setFlip(sl.fx, sl.fy).setOrigin(sl.ox, sl.oy).setScale(sl.sx, sl.sy);
      if (!this.lastSlash) this.scene.sfx('slash', 0.45, 1.25);
    } else this.slash.setVisible(false);
    this.lastSlash = !!sl;
    // o chicote e a corrente não têm arco de corte: o espelho desenha os dois de Âmbar
    this.lashG.clear();
    if (r.lash && this.state !== 'sleep') drawLash(this.lashG, r.lash, LASH_LOOK);
    // o pulso do Cajado da Dobra acende uma vez, no quadro em que o mago bateu
    if (r.pulse !== this.lastPulse) {
      if (this.lastPulse >= 0 && r.atk && this.state !== 'sleep') {
        this.scene.magic?.pulseFx(rectOf(r.atk), this.facing, 0xffa63c, 0xfff4dc);
        this.scene.sfx('glass', 0.3, 1.6);
      }
      this.lastPulse = r.pulse;
    }
  }

  update(dt: number) {
    if (this.state === 'dead') return;
    this.now += dt;
    this.t += dt;
    this.record();
    // a imagem travada não anda: o atraso cresce; solta, ela corre até o atraso certo
    if (this.freeze > 0) {
      this.freeze -= dt;
      this.lag += dt;
    } else if (this.lag > this.target) this.lag = Math.max(this.target, this.lag - C.catchup * dt);
    else this.lag = this.target;
    const r = this.at(this.now - this.lag);
    if (!r) return;
    this.cur = r;
    const pane = this.scene.mine?.mirror?.pane;
    switch (this.state) {
      case 'sleep': {
        // dentro do espelho, só quando o cavaleiro passou na frente da pedra
        const inPane = !!pane && Math.abs(r.x - pane.cx) < pane.rx + 10;
        this.sprite.setVisible(inPane);
        if (inPane) this.show(r);
        break;
      }
      case 'emerge': {
        const inPane = !!pane && Math.abs(r.x - pane.cx) < pane.rx - 4;
        this.sprite.setVisible(true);
        this.show(r);
        if (inPane || this.t > C.emergeWait) {
          if (!inPane) this.emergeFrom = { x: pane?.cx ?? this.mx, y: this.floor };
          this.out(!inPane);
        }
        break;
      }
      case 'fight': {
        this.show(r);
        // saindo da pedra fora do lugar: escorrega do espelho até onde a imagem está
        if (this.t < 0.3 && this.emergeFrom.x) {
          const k = Phaser.Math.Easing.Quadratic.Out(this.t / 0.3);
          this.sprite.x = Phaser.Math.Linear(this.emergeFrom.x, r.x, k);
          this.sprite.y = Phaser.Math.Linear(this.emergeFrom.y, r.y, k);
        }
        this.fireShots();
        break;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.look(this.state === 'fight');
    }
    // o brilho em volta segue a imagem; o espelho acende enquanto ela está fora
    const lit = this.state === 'fight' ? 0.34 + (this.phase2 ? 0.12 : 0) + Math.sin(this.now * 5) * 0.05 : 0;
    this.glow.setAlpha(this.glow.alpha + (lit - this.glow.alpha) * Math.min(1, dt * 6));
    this.glow.setPosition(this.sprite.x, this.sprite.y - 22);
    this.scene.mine?.mirrorPulse(this.state === 'fight' ? 1 : this.state === 'emerge' ? 0.6 : 0.15, dt);
  }

  // sai do espelho: a pedra acende, a imagem ganha cor e passa a machucar
  private out(slide: boolean) {
    const s = this.scene;
    this.go('fight');
    if (!slide) this.emergeFrom = { x: 0, y: 0 };
    this.sprite.clearMask();
    this.sprite.setDepth(DEPTH.enemy);
    this.look(true);
    this.sprite.preFX?.addGlow(0xffa63c, 3, 0, false, 0.1, 10);
    const pane = s.mine?.mirror?.pane;
    s.mine?.amberBurst(pane?.cx ?? this.mx, pane?.cy ?? this.floor - 70, 14);
    s.glowBurst(this.sprite.x, this.sprite.y - 24, 0xffa63c, 5);
    s.sfx('glass', 0.9, 0.9);
    s.sfx('veil-form', 0.6, 1.3);
    s.cameras.main.shake(260, 0.004);
  }

  // as flechas do cavaleiro voltam do lugar de onde ele atirou, depois do atraso
  private fireShots() {
    const t = this.now - this.lag;
    while (this.shots.length && this.shots[0].t <= t) {
      const q = this.shots.shift()!;
      if (q.orb) this.scene.spawnEnemyOrb(q.x, q.y, q.dx, q.dy);
      else this.scene.spawnEnemyArrow(q.x, q.y, q.dx, q.dy);
    }
  }

  harms(pr: Phaser.Geom.Rectangle, sliding: boolean) {
    this.harmFrom = undefined;
    if (!this.alive || !this.present || !this.cur) return false;
    const r = this.cur;
    if (r.atk && overlap(pr, rectOf(r.atk))) {
      this.harmFrom = r.body[0] + r.body[2] / 2;
      return true;
    }
    if (sliding) return false;
    return overlap(pr, rectOf(r.body));
  }

  hit(_fromX: number, dmg: number, _dir: HitDir): HitResult {
    if (!this.alive || !this.present) return 'ignored';
    this.hp -= dmg;
    this.flashT = 0.08;
    this.sprite.setTintFill(0xfff4dc);
    // o golpe trava a imagem um instante
    this.freeze = C.stutter;
    const s = this.scene;
    s.mine?.amberBurst(this.sprite.x, this.sprite.y - 24, 5);
    s.sfx('glass', 0.35, 1.4 + Math.random() * 0.3);
    if (!this.phase2 && this.hp <= this.maxHp * C.phase2 && this.hp > 0) {
      this.phase2 = true;
      this.target = C.delay2;
      s.sfx('glass', 1, 0.7);
      s.sfx('veil', 0.7, 1.4);
      s.cameras.main.shake(400, 0.005);
      s.cameras.main.flash(180, 255, 200, 120);
      s.thinkOnce('reflexo:half', 'Ela está me alcançando. Cada vez mais perto do que eu acabei de fazer.');
    }
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  vanish() {
    return null;
  }

  private die() {
    const s = this.scene;
    this.alive = false;
    this.hp = 0;
    this.go('dead');
    this.body.enable = false;
    this.slash.setVisible(false);
    this.lashG.clear();
    // a imagem estoura em lascas e o espelho racha de cima a baixo
    const x = this.sprite.x;
    const y = this.sprite.y - 24;
    s.mine?.amberBurst(x, y, 30);
    s.glowBurst(x, y, 0xffa63c, 7);
    s.sfx('glass', 1.2, 0.6);
    s.sfx('break', 0.9, 0.8);
    s.hitstop(0.2);
    s.cameras.main.flash(260, 255, 210, 140);
    s.cameras.main.shake(500, 0.008);
    this.tweensOut();
    s.mine?.breakMirror();
    this.onDefeat?.();
  }

  private tweensOut() {
    const s = this.scene;
    this.sprite.setTintFill(0xffe6a6);
    s.tweens.add({ targets: this.sprite, alpha: 0, scaleX: this.sprite.scaleX * 1.3, scaleY: this.sprite.scaleY * 0.6, duration: 260, onComplete: () => this.sprite.setVisible(false) });
    s.tweens.add({ targets: this.glow, alpha: 0, duration: 600 });
  }

  destroy() {
    this.slash.destroy();
    this.lashG.destroy();
    this.glow.destroy();
    this.maskG.destroy();
  }
}
