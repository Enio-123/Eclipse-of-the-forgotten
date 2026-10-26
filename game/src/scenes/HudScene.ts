import Phaser from 'phaser';
import { PAL, PLAYER } from '../config';
import { progress } from '../systems/Save';
import { fixedCamera } from '../gfx/view';

// Interface do jogo: a máscara (memórias seladas com ouro), os fragmentos de vida, as memórias
// guardadas (as trocadas com o Cobrador ficam apagadas), as contas de Âmbar dos poderes e as moedas
// (texto em HTML, nítido em qualquer tela)
export class HudScene extends Phaser.Scene {
  private shards: Phaser.GameObjects.Image[] = [];
  private mems: Phaser.GameObjects.Image[] = [];
  private mask!: Phaser.GameObjects.Image;
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super('hud');
  }

  create() {
    fixedCamera(this);
    this.shards = [];
    this.mems = [];
    this.root = this.add.container(0, 0);
    this.mask = this.add.image(24, 24, 'mask-icon-0').setOrigin(0.5);
    this.root.add(this.mask);
    const sparks = this.add.particles(0, 0, 'px', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 20, max: 70 },
      scale: { start: 0.8, end: 0 },
      tint: [PAL.gold, 0xffe6a6, 0xffffff],
      emitting: false,
    });
    const syncMax = () => {
      const n = (this.registry.get('maxhp') as number | undefined) ?? PLAYER.maxHp;
      while (this.shards.length < n) {
        const i = this.shards.length;
        const s = this.add.image(46 + i * 15, 24, 'shard-empty').setOrigin(0.5);
        this.shards.push(s);
        this.root.add(s);
        if (i >= PLAYER.maxHp) {
          sparks.explode(10, s.x, s.y);
          this.tweens.add({ targets: s, scale: { from: 1.8, to: 1 }, duration: 500, ease: 'Back.easeOut' });
        }
      }
      while (this.shards.length > n) this.shards.pop()!.destroy();
      syncHp();
    };
    const syncHp = () => {
      const hp = (this.registry.get('hp') as number | undefined) ?? 0;
      this.shards.forEach((s, i) => {
        const full = i < hp;
        const key = full ? 'shard' : 'shard-empty';
        if (s.texture.key !== key) {
          s.setTexture(key);
          if (!full) this.tweens.add({ targets: s, scale: { from: 1.6, to: 1 }, duration: 220 });
          else this.tweens.add({ targets: s, scale: { from: 0.5, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        }
      });
    };
    const syncMems = () => {
      const list = (this.registry.get('memories') as number[] | undefined) ?? [];
      list.forEach((held, i) => {
        let m = this.mems[i];
        if (!m) {
          m = this.add.image(47 + i * 11, 44, 'memory').setOrigin(0.5).setScale(0.75);
          this.mems.push(m);
          this.root.add(m);
          sparks.explode(12, m.x, m.y);
          this.tweens.add({ targets: m, scale: { from: 1.6, to: 0.75 }, duration: 500, ease: 'Back.easeOut' });
        }
        // trocada: vira só um contorno escuro
        if (held) m.clearTint().setAlpha(1);
        else m.setTintFill(0x3a3446).setAlpha(0.8);
      });
      while (this.mems.length > list.length) this.mems.pop()!.destroy();
      syncCoinVis();
    };
    // moedas: o número sobe com um "+N" ao lado enquanto o cavaleiro vai pegando
    const coinEl = document.getElementById('coins');
    const coinNum = coinEl?.querySelector('b');
    const coinGain = coinEl?.querySelector('.gain');
    let coinsShown = (this.registry.get('coins') as number | undefined) ?? 0;
    let gain = 0;
    let gainTimer = 0;
    const syncCoinVis = () => {
      if (!coinEl) return;
      const n = (this.registry.get('coins') as number | undefined) ?? 0;
      const known = n > 0 || progress.seen.has('coin:first');
      coinEl.classList.toggle('on', known && !this.registry.get('hud-hidden'));
      // sem memórias ainda, o contador sobe para a linha delas
      coinEl.classList.toggle('high', this.mems.length === 0);
    };
    const syncCoins = () => {
      if (!coinEl || !coinNum || !coinGain) return;
      const n = (this.registry.get('coins') as number | undefined) ?? 0;
      coinNum.textContent = String(n);
      // morte: o que foi para a sombra aparece em lilás
      const loss = n < coinsShown && this.registry.get('coins-loss');
      if (loss) {
        this.registry.set('coins-loss', false);
        gain = 0;
        coinGain.textContent = `-${coinsShown - n}`;
        coinGain.classList.add('on', 'loss');
        clearTimeout(gainTimer);
        gainTimer = window.setTimeout(() => coinGain.classList.remove('on'), 2600);
      } else if (n > coinsShown) {
        gain += n - coinsShown;
        coinGain.classList.remove('loss');
        coinGain.textContent = `+${gain}`;
        coinGain.classList.add('on');
        coinEl.classList.remove('bump');
        void coinEl.offsetWidth;
        coinEl.classList.add('bump');
        clearTimeout(gainTimer);
        gainTimer = window.setTimeout(() => {
          gain = 0;
          coinGain.classList.remove('on');
        }, 1300);
      }
      coinsShown = n;
      syncCoinVis();
    };
    let shown = -1;
    const syncMask = () => {
      const k = Math.max(0, Math.min(3, (this.registry.get('kintsugi') as number) ?? 0));
      if (k === shown) return;
      const grew = shown >= 0 && k > shown;
      shown = k;
      this.mask.setTexture(`mask-icon-${k}`);
      if (grew) {
        sparks.explode(18, this.mask.x, this.mask.y);
        this.tweens.add({ targets: this.mask, scale: { from: 1.5, to: 1 }, duration: 700, ease: 'Back.easeOut' });
      }
    };
    // contas de Âmbar dos poderes de memória: três, penduradas embaixo da máscara, só depois do
    // primeiro poder. Cada uma enche de baixo para cima; as que o poder escolhido gasta brilham
    // quando dá para usar
    const beads = [0, 1, 2].map((i) => {
      const x = 15 + i * 9;
      const y = i === 1 ? 47 : 45;
      const glow = this.add.image(x, y, 'glow').setTint(0xffa63c).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0);
      const bg = this.add.image(x, y, 'amber-bead-empty').setOrigin(0.5);
      const fill = this.add.image(x, y, 'amber-bead').setOrigin(0.5);
      this.root.add([glow, bg, fill]);
      return { x, y, glow, bg, fill };
    });
    let amberShown = -1;
    const syncAmber = () => {
      const known = progress.powers.size > 0;
      const a = (this.registry.get('amber') as number | undefined) ?? 0;
      const cost = progress.powerCost;
      beads.forEach((b, i) => {
        b.bg.setVisible(known);
        b.fill.setVisible(known);
        b.glow.setVisible(known);
        const k = Phaser.Math.Clamp(a - i, 0, 1);
        const h = b.fill.height;
        const top = Math.round(h * (1 - k));
        b.fill.setCrop(0, top, b.fill.width, h - top);
        if (known && amberShown >= 0 && a >= i + 1 && amberShown < i + 1) {
          sparks.explode(8, b.x, b.y);
          this.tweens.add({ targets: [b.fill, b.bg], scale: { from: 1.6, to: 1 }, duration: 380, ease: 'Back.easeOut' });
        }
        b.glow.setAlpha(k >= 1 ? (cost > 0 && i < cost && a >= cost - 1e-6 ? 0.6 : 0.22) : 0);
      });
      amberShown = a;
    };
    const denyAmber = () => {
      for (const b of beads) this.tweens.add({ targets: [b.bg, b.fill, b.glow], x: { from: b.x - 2.5, to: b.x }, duration: 260, ease: 'Bounce.easeOut' });
    };
    const syncVis = () => {
      this.root.setAlpha(this.registry.get('hud-hidden') ? 0 : 1);
      syncCoinVis();
    };
    const events: [string, () => void][] = [
      ['changedata-hp', syncHp], ['setdata-hp', syncHp],
      ['changedata-maxhp', syncMax], ['setdata-maxhp', syncMax],
      ['changedata-memories', syncMems], ['setdata-memories', syncMems],
      ['changedata-kintsugi', syncMask], ['setdata-kintsugi', syncMask],
      ['changedata-hud-hidden', syncVis], ['setdata-hud-hidden', syncVis],
      ['changedata-coins', syncCoins], ['setdata-coins', syncCoins],
      ['changedata-amber', syncAmber], ['setdata-amber', syncAmber],
      ['changedata-power', syncAmber], ['setdata-power', syncAmber],
      ['changedata-amber-deny', denyAmber], ['setdata-amber-deny', denyAmber],
    ];
    for (const [e, f] of events) this.registry.events.on(e, f);
    this.events.once('shutdown', () => {
      for (const [e, f] of events) this.registry.events.off(e, f);
      clearTimeout(gainTimer);
      coinEl?.classList.remove('on', 'bump');
      coinGain?.classList.remove('on');
    });
    // primeiras memórias e fragmentos: sem a animação de ganhar
    const first = (this.registry.get('memories') as number[] | undefined) ?? [];
    first.forEach((_h, i) => {
      const m = this.add.image(47 + i * 11, 44, 'memory').setOrigin(0.5).setScale(0.75);
      this.mems.push(m);
      this.root.add(m);
    });
    const n = (this.registry.get('maxhp') as number | undefined) ?? PLAYER.maxHp;
    for (let i = 0; i < n; i++) {
      const s = this.add.image(46 + i * 15, 24, 'shard').setOrigin(0.5);
      this.shards.push(s);
      this.root.add(s);
    }
    syncHp();
    syncMems();
    syncMask();
    syncAmber();
    syncVis();
    if (coinNum) coinNum.textContent = String(coinsShown);
  }
}
