import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { DEPTH } from './Decor';
import { mix } from '../gfx/raster';

// quanto tempo o lume fica apagado depois de dar a luz dele (s), o raio em que ele encosta no cavaleiro
// (px) e a cor da luz das nuvens
const RELIGHT = 3.5;
const REACH = 11;
const GOLD = 0xffc85a;
// apagado, sobra só uma brasa escura no lugar
const EMBER = 0x7a6450;

interface Lume {
  x: number;
  y: number;
  core: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  // quanto falta para acender de novo (s), o quanto está aceso (0 a 1, sobe devagar ao voltar) e a fase
  // do balanço (cada um no seu ritmo)
  off: number;
  k: number;
  ph: number;
}

// As Torres Rúnicas (capítulo final, lore/torres.md): o que é só delas. Os lumes ('0' no mapa) são a luz
// das nuvens parada no ar, perto delas. Com a Capa de Luz, encostar num lume enche as luzes da capa (e
// devolve o pulo duplo e o dash do ar); ele apaga e acende de novo pouco depois. Com tudo cheio, o
// cavaleiro passa por ele e o lume fica.
export class Torres {
  private lumes: Lume[] = [];
  private time = 0;
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private moteAcc = 0;

  constructor(private s: GameScene) {
    // poeira de luz subindo devagar dos lumes acesos
    this.motes = s.add.particles(0, 0, 'px', {
      lifespan: { min: 900, max: 1700 },
      speedY: { min: -34, max: -12 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [GOLD, 0xffe6a6, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(DEPTH.enemy - 0.4);
    let i = 0;
    for (const sp of s.level.spawns) {
      if (sp.kind !== '0') continue;
      const x = sp.x;
      const y = sp.y - TILE / 2;
      // o halo fica parado no lugar (ilumina a sala em volta) e só a bola balança
      const halo = s.add.image(x, y, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setScale(1.15).setAlpha(0.5).setDepth(DEPTH.enemy - 0.5);
      const core = s.add.image(x, y, 'lume').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.enemy - 0.3);
      this.lumes.push({ x, y, core, halo, off: 0, k: 1, ph: i++ * 1.7 });
    }
  }

  update(dt: number) {
    this.time += dt;
    const p = this.s.player;
    this.moteAcc += dt;
    const puff = this.moteAcc > 0.12;
    if (puff) this.moteAcc = 0;
    for (const l of this.lumes) {
      if (l.off > 0) {
        l.off -= dt;
        if (l.off <= 0) this.relight(l);
      } else l.k = Math.min(1, l.k + dt * 2.6);
      const bob = Math.sin(this.time * 1.6 + l.ph) * 2.5;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.1 + l.ph);
      const cy = l.y + bob;
      l.core.setPosition(l.x, cy).setScale((0.55 + 0.45 * l.k) * (0.92 + pulse * 0.16)).setAlpha(0.22 + 0.78 * l.k).setTint(mix(EMBER, 0xffffff, l.k));
      l.halo.setAlpha(l.k * (0.42 + pulse * 0.14));
      if (l.off > 0) continue;
      if (puff && Math.random() < 0.5) this.motes.emitParticle(1, l.x + (Math.random() - 0.5) * 10, cy + (Math.random() - 0.5) * 8);
      if (!p || p.dead || !p.canFly || !p.spent) continue;
      const b = p.body;
      if (l.x + REACH > b.left && l.x - REACH < b.right && cy + REACH > b.top && cy - REACH < b.bottom) this.take(l);
    }
  }

  // o cavaleiro bebe o lume: as luzes enchem, a bola estoura em ouro e apaga
  private take(l: Lume) {
    const s = this.s;
    s.player.refill();
    l.off = RELIGHT;
    l.k = 0;
    const flash = s.add.image(l.x, l.core.y, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front).setScale(0.6).setAlpha(0.9);
    s.tweens.add({ targets: flash, scale: 2.4, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
    s.gold.explode(14, l.x, l.core.y);
    s.sfx('chime', 0.3, 1.6);
  }

  // volta a acender (o som só perto da tela)
  private relight(l: Lume) {
    const s = this.s;
    s.gold.explode(6, l.x, l.y);
    const v = s.cameras.main.worldView;
    if (l.x > v.x - 40 && l.x < v.right + 40 && l.y > v.y - 40 && l.y < v.bottom + 40) s.sfx('chime', 0.12, 2.1);
  }
}
