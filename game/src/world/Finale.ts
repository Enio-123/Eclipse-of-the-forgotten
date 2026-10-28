import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Coroado } from '../entities/Coroado';
import type { EndingInit } from '../scenes/EndingScene';
import { audio } from '../systems/Audio';
import { progress } from '../systems/Save';
import { settings } from '../systems/Settings';
import { ui } from '../ui/ui';
import { DEPTH } from './Decor';
import { FILMS, FINALE_LINES, NIGHT_MEMORY, fill } from './endings';
import { NIGHT } from './lore';
import type { EndingId } from './story';

const GOLD = 0xffd27a;
// do carrasco de joelhos até o cavaleiro, na frente dele (a coroa fica no meio)
const GAP = 46;
const VIOLET = 0xb48cff;
// as frases de um texto, uma por vez (quebra depois do ponto)
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);
// quanto tempo um pensamento fica, pelo tamanho
const holdFor = (text: string) => Phaser.Math.Clamp(1800 + text.length * 46, 3200, 6400);

// O fim no terraço do núcleo, depois da escolha (lore/torres.md, Os três finais). O Carrasco Coroado fala uma
// vez, ele pensa, a memória da noite volta (inteira ou torta) e o núcleo responde: abre e devolve as memórias
// (I), entra nele com a coroa (II) ou apaga com ele dentro (III). Depois a tela vai para a cor do final e o
// filme pintado começa (scenes/EndingScene.ts).
export class Finale {
  private t = 0;
  private named = progress.knowsHerName;
  private crownOn = false;

  constructor(
    private s: GameScene,
    private b: Coroado,
    private kind: EndingId,
  ) {}

  // marca o próximo passo `ms` depois do anterior
  private then(ms: number, fn: () => void) {
    this.t += ms;
    this.s.time.delayedCall(this.t, fn);
  }

  run() {
    const s = this.s;
    const p = s.player;
    const arena = s.torres?.core;
    s.cinematic = true;
    p.frozen = true;
    p.invuln = 0;
    p.body.setVelocity(0, 0);
    ui.hint(null);
    ui.bossBar(null);
    s.registry.set('hud-hidden', true);
    audio.music('none', 2);
    const { x: bx } = this.b.kneelAt;
    // a câmera abre para mostrar o terraço e o núcleo em cima
    if (arena) s.lockCamera(arena.c, arena.floorY - 150, 2400);
    // ele vai até a frente do carrasco de joelhos, do lado em que já está, com um passo de espaço entre os dois
    const side = p.x < bx ? -1 : 1;
    p.walkTo(bx + side * GAP, 58, (side < 0 ? 1 : -1) as 1 | -1);
    this.then(1300, () => ui.say('O Carrasco Coroado', FINALE_LINES[this.kind].say, 5600));
    this.t += 5900;
    if (this.kind === 'truth') this.truth();
    else if (this.kind === 'absorb') this.absorb();
    else this.fragments();
  }

  // ---------- a memória da noite ----------
  // a lembrança desce do núcleo até ele, a sala lembra junto e as frases vêm uma por vez. Devolve a duração
  private night(mode: 'restore' | 'corrupt') {
    const s = this.s;
    const p = s.player;
    const k = s.torres?.core?.core;
    const text = fill(mode === 'corrupt' ? NIGHT_MEMORY.absorb : NIGHT_MEMORY.truth, this.named);
    const tint = mode === 'corrupt' ? VIOLET : GOLD;
    s.time.delayedCall(this.t, () => {
      const orb = s.add.image(k?.x ?? p.x, k?.y ?? p.body.top - 200, 'glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.front - 0.5).setScale(0.3).setAlpha(0.95);
      s.tweens.add({
        targets: orb,
        x: p.x,
        y: p.body.center.y,
        scale: 0.12,
        duration: 2200,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          orb.destroy();
          progress.memories.add(NIGHT);
          progress.save();
          s.sfx('chime');
          s.glowBurst(p.x, p.body.center.y, tint, 3);
          s.memWave?.start(p.x, p.body.center.y, mode, { radius: 760, hold: 3 });
          s.memWave?.echoes(p.x, p.body.center.y, 'ela', mode, p.sprite);
          ui.banner(NIGHT_MEMORY.title, 'A memória que faltava', 3400);
        },
      });
      audio.music(FILMS[this.kind].track, 4);
    });
    let at = 2200 + 3600;
    for (const line of sentences(text)) {
      const hold = holdFor(line);
      s.time.delayedCall(this.t + at, () => {
        ui.thought(line, hold);
        // a versão torta: a verdade aparece em clarões antes de entortar
        if (mode === 'corrupt' && /lâmina/.test(line)) {
          const cam = s.cameras.main;
          [0, 420, 900].forEach((d, i) => s.time.delayedCall(d, () => {
            cam.flash(160, i === 1 ? 255 : 210, i === 1 ? 240 : 150, i === 1 ? 240 : 255);
            cam.shake(180, 0.004);
            s.sfx('glass', 0.4, 0.8 + i * 0.15);
          }));
        }
        if (mode === 'corrupt' && /entorta/.test(line)) s.memWave?.start(p.x, p.body.center.y, 'corrupt', { power: 0.7, radius: 300, hold: 1.2 });
      });
      at += hold + 400;
    }
    return at;
  }

  // ---------- I: aceitar a verdade ----------
  private truth() {
    const s = this.s;
    const L = FINALE_LINES.truth;
    for (const line of L.think) this.thinkAt(line);
    // ele se abaixa e deixa a coroa no chão, entre os dois; o carrasco vira pó
    const { x: bx, facing } = this.b.kneelAt;
    const p = s.player;
    this.then(200, () => {
      p.kneel();
      this.b.crownTo(bx + facing * (GAP / 2), this.b.floorY - 1, 1500, () => this.crownDown(0.5));
    });
    this.then(1900, () => {
      p.getUp(() => (p.frozen = true));
      this.b.dissolve(3400);
    });
    this.t += 3600;
    this.t += this.night('restore');
    this.thinkAt(L.mechanism);
    // o núcleo abre: as memórias saem e descem para a cidade
    this.then(200, () => {
      s.torres?.coreRelease(5200);
      s.cameras.main.shake(5200, 0.002);
      s.sfx('bell', 0.7, 0.6);
    });
    this.then(3400, () => s.glowBurst(s.player.x, s.player.body.center.y, GOLD, 4));
    this.then(2400, () => this.toFilm());
  }

  // ---------- II: absorver ----------
  private absorb() {
    const s = this.s;
    const p = s.player;
    const L = FINALE_LINES.absorb;
    // a coroa vai das mãos dele para a cabeça do cavaleiro; o carrasco vira pó e o pó entra nele
    this.then(0, () => {
      const head = this.headAt();
      this.b.crownImg.setDepth(DEPTH.player + 0.3);
      this.b.crownTo(head.x, head.y, 1700, () => {
        this.crownOn = true;
        s.sfx('chime', 0.6, 0.7);
        s.glowBurst(head.x, head.y, GOLD, 1.6);
      });
    });
    s.events.on('postupdate', this.followCrown, this);
    s.events.once('shutdown', () => s.events.off('postupdate', this.followCrown, this));
    this.then(1900, () => {
      this.b.dissolve(3200, () => ({ x: p.x, y: p.body.center.y }));
      this.gild(4200);
    });
    this.t += 3400;
    for (const line of L.think) this.thinkAt(line);
    this.t += this.night('corrupt');
    // as memórias de todos vêm para ele
    this.then(0, () => {
      s.torres?.coreGather(() => ({ x: p.x, y: p.body.center.y }), 5600, 0xffc070);
      s.cameras.main.shake(5600, 0.0016);
    });
    this.then(2600, () => ui.whisper('Tudo foi necessário.', 2600));
    this.then(3400, () => this.toFilm());
  }

  // a coroa acompanha a cabeça dele depois de posta (na frente do capuz, cercando a ponta)
  private followCrown() {
    if (!this.crownOn) return;
    const h = this.headAt();
    this.b.crownImg.setPosition(h.x, h.y).setDepth(DEPTH.player + 0.3);
  }

  // a base da coroa na cabeça: um pouco abaixo da ponta do capuz, que passa do alto do corpo
  private headAt() {
    const p = this.s.player;
    return { x: p.x + p.facing * 1, y: p.body.top - 3 };
  }

  // o ouro vai tomando o cavaleiro
  private gild(ms: number) {
    const p = this.s.player;
    const k = { v: 0 };
    this.s.tweens.add({
      targets: k,
      v: 1,
      duration: ms,
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(255, 255, 255), new Phaser.Display.Color(255, 214, 140), 1, k.v);
        p.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  // ---------- III: carregar os fragmentos ----------
  private fragments() {
    const s = this.s;
    const p = s.player;
    const L = FINALE_LINES.fragments;
    const [first, ...rest] = L.think;
    this.thinkAt(first);
    this.t += this.night('restore');
    for (const line of rest) this.thinkAt(line);
    // o carrasco deixa a coroa no chão, entre os dois, e vira pó
    const { x: bx, facing } = this.b.kneelAt;
    this.then(0, () => this.b.crownTo(bx + facing * (GAP / 2), this.b.floorY - 1, 1400, () => this.crownDown(0.45)));
    this.then(1500, () => this.b.dissolve(3000));
    // ele ajoelha onde está, e os fragmentos que ele carrega se juntam nele
    this.then(2000, () => {
      p.kneel();
      s.torres?.coreGather(() => ({ x: p.x, y: p.body.center.y }), 5200, GOLD);
      audio.music('none', 5);
    });
    // a luz o levanta devagar, puxando para baixo do núcleo; um clarão, e o núcleo apaga. Sem mais nada: o que
    // fica é o silêncio
    this.then(4200, () => {
      p.body.setAllowGravity(false);
      p.drift = { x: bx, top: this.b.floorY - 110, vy: -26 };
    });
    this.then(3600, () => {
      s.sfx('bell', 0.6, 0.5);
      s.cameras.main.flash(1400, 255, 246, 230);
      s.torres?.coreDark(3200);
      p.sprite.setAlpha(0);
    });
    this.then(3600, () => this.toFilm(3600));
  }

  // a coroa no chão: o som do metal na pedra e um brilho baixo, para ela não sumir contra o céu claro
  private crownDown(vol: number) {
    const s = this.s;
    const c = this.b.crownImg;
    s.sfx('clang', vol, 1.1);
    s.glowBurst(c.x, c.y - 3, GOLD, 0.6);
    const g = s.add.image(c.x, c.y - 3, 'glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(c.depth - 0.01).setScale(0.16).setAlpha(0);
    s.tweens.add({ targets: g, alpha: 0.5, duration: 700 });
    s.tweens.add({ targets: g, scale: 0.2, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private thinkAt(text: string) {
    const s = this.s;
    const t = fill(text, this.named);
    const hold = holdFor(t);
    s.time.delayedCall(this.t, () => ui.thought(t, hold));
    this.t += hold + 500;
  }

  // a tela vai para a cor do final, o save guarda o final e o filme começa
  private toFilm(ms = 2600) {
    const s = this.s;
    const kind = this.kind;
    const [r, g, b] = FILMS[kind].fade;
    progress.seen.add(`ending:${kind}`);
    progress.memories.add(NIGHT);
    // depois dos créditos: o I acorda na Ponte, o II no Trono; o III não volta (o Continuar some do título)
    if (kind === 'truth') progress.checkpoint('ponte', 'P', settings.data.weapon);
    else if (kind === 'absorb') progress.checkpoint('trono', 'X', settings.data.weapon);
    else progress.save();
    s.transitioning = true;
    const cam = s.cameras.main;
    cam.fadeOut(ms, r, g, b);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      ui.clearTexts();
      s.scene.stop('hud');
      s.scene.start('ending', { kind } satisfies EndingInit);
    });
  }
}
