import Phaser from 'phaser';
import { PLAYER as C, WEAPONS, type WeaponDef, type WeaponId } from '../config';
import type { Controls } from '../systems/Controls';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { TILE_ONEWAY } from '../gfx/textures';
import { DEPTH } from '../world/Decor';
import { hd } from '../gfx/flip';
import { VeilFx } from '../gfx/veil';

export type AttackDir = 'side' | 'up' | 'down' | 'low';
// ações que o jogador já descobriu (as dicas somem quando ele usa)
export type PlayerAction = 'move' | 'attack' | 'jump' | 'dash' | 'slide' | 'pogo' | 'crouch' | 'trip' | 'walljump' | 'doublejump' | 'parry' | 'hook';

// a ponta do gancho: voando até a argola (ou até o fim do alcance), puxando o cavaleiro, voltando
export interface HookState {
  phase: 'throw' | 'pull' | 'back';
  x: number;
  y: number;
  tx: number;
  ty: number;
  ring: boolean;
  t: number;
}

const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export const SLASH_KEY: Record<WeaponId, string | null> = { sword: 'slash', scythe: 'slash-big', daggers: 'slash-small', bow: null, badalo: 'slash-heavy', incensario: 'slash-censer', corrente: null };
// velocidade em que a animação de corrida foi desenhada (acima disso as pernas aceleram junto)
const RUN_ANIM_SPEED = 192;

export interface SlashMeta {
  w: number;
  h: number;
  ox: number;
  frames: number;
  fps: number;
  scale?: number;
}

export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly slash: Phaser.GameObjects.Sprite;
  readonly hitSet = new Set<unknown>();
  readonly lastSafe = new Phaser.Math.Vector2();
  weapon!: WeaponDef;

  facing: 1 | -1 = 1;
  hp = C.maxHp;
  dead = false;
  frozen = false;
  canAttack = true;
  invuln = 0;
  dropT = 0;
  atkDir: AttackDir = 'side';
  crouched = false;
  inWater = false;
  // pose fixa de cena (ajoelhado no começo, levantando)
  pose: 'kneel' | 'getup' | null = null;
  // habilidades achadas no mapa
  canWall = false;
  canDouble = false;
  canHook = false;
  // Véu Abissal: o dash vira tinta viva e atravessa grades de cela e membranas abissais
  canVeil = false;
  hook: HookState | null = null;
  // Fôlego (troca com o Cobrador): o dash recarrega mais rápido
  dashCdMul = 1;
  // conta os dashes (a cena marca quais inimigos já foram atravessados em cada um)
  dashCount = 0;

  private coyote = 0;
  private buffer = 0;
  private jumping = false;
  private dashT = 0;
  // respiro fantasma logo depois do dash (não toma dano saindo de dentro de um inimigo)
  private graceT = 0;
  private dashCd = 0;
  private airDash = true;
  private dashDir: 1 | -1 = 1;
  private dashX0 = 0;
  // este dash é o do Véu (decidido quando começa) e quanto já passou do alcance dentro de uma grade
  private veilDash = false;
  private veilOver = 0;
  private veilFx: VeilFx | null = null;
  private slideT = 0;
  private atkCd = 0;
  private atkBuffer = 0;
  private windupT = 0;
  private atkT = 0;
  private atkAnimT = 0;
  private atkAnim = 'attack';
  private altHand = false;
  private shotPending = false;
  private hurtT = 0;
  private recoilT = 0;
  private wasGround = false;
  private prevVy = 0;
  private ghostT = 0;
  private ghostLook = false;
  private stepT = 0;
  private landT = 0;
  private curAnim = '';
  private moveTarget: number | null = null;
  private slashOx = 0.2;
  // corte no traço liso: a folha tem mais pixels que o mundo e é reduzida
  private slashK = 1;
  // lado da parede em que está escorregando (0 = nenhuma)
  private wallDir: -1 | 0 | 1 = 0;
  private wallCoyote = 0;
  private wallSide: -1 | 1 = 1;
  private wallLock = 0;
  private airJumps = 0;
  private wallDustT = 0;
  private hookCd = 0;
  private hookBuffer = 0;
  // a argola onde ele acabou de chegar (a mira pula ela por um instante)
  lastRing: { x: number; y: number } | null = null;
  lastRingT = 0;
  private chain: Phaser.GameObjects.Graphics;
  // golpe da corrente: ela estica até a ponta do golpe e volta (no lugar do arco de corte)
  private lashG: Phaser.GameObjects.Graphics;
  private lashT = -1;

  constructor(private scene: GameScene, x: number, feetY: number, weapon: WeaponId) {
    this.zone = scene.add.zone(x, feetY - C.bodyH / 2, C.bodyW, C.bodyH);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setMaxVelocity(1200, C.maxFall);
    this.body.setCollideWorldBounds(true);
    this.sprite = scene.add.sprite(x, feetY, `knight-${weapon}`, 0).setDepth(DEPTH.player);
    this.slash = scene.add.sprite(0, 0, 'slash', 0).setDepth(DEPTH.slash).setVisible(false);
    this.slash.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.slash.setVisible(false));
    this.chain = scene.add.graphics().setDepth(DEPTH.player - 0.2);
    this.lashG = scene.add.graphics().setDepth(DEPTH.player + 0.2);
    this.setWeapon(weapon);
    this.lastSafe.set(x, feetY);
  }

  setWeapon(id: WeaponId) {
    this.weapon = WEAPONS[id];
    const o = this.scene.registry.get(`knight-${id}-origin`) as { x: number; y: number };
    hd(this.sprite.setTexture(`knight-${id}`, 0).setOrigin(o.x, o.y));
    const key = SLASH_KEY[id];
    if (key) {
      const meta = (this.scene.registry.get('slashes') as Record<string, SlashMeta>)[key];
      this.slash.setTexture(key, 0);
      this.slashOx = meta.ox;
      this.slashK = 1 / (meta.scale ?? 1);
    }
    this.cancelAttack();
    this.curAnim = '';
  }

  get x() {
    return this.zone.x;
  }
  // corrida pelo peso da arma: pesada mais lenta, leve mais rápida
  get runSpeed() {
    return C.runSpeed * this.weapon.speed;
  }
  get dashing() {
    return this.dashT > 0;
  }
  // no meio do Véu: intangível, não toma dano nem esbarra em grade de cela ou membrana
  get veiling() {
    return this.dashT > 0 && this.veilDash;
  }
  // etapa do Véu na tela (dissolve, flow, form ou off), para os testes
  get veilStage() {
    return this.veilFx?.stage ?? 'off';
  }
  // dash fantasma: atravessa inimigos e golpes sem levar dano (espinhos ainda machucam)
  get ghost() {
    return this.dashT > 0 || this.graceT > 0;
  }
  get sliding() {
    return this.slideT > 0;
  }
  // deslizando, o cavaleiro passa por baixo e através dos inimigos
  get untouchable() {
    return this.slideT > 0;
  }
  get onGround() {
    return this.body.blocked.down;
  }
  get rect() {
    const b = this.body;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  // ---------- cena de abertura ----------
  kneel() {
    this.pose = 'kneel';
    this.frozen = true;
    this.curAnim = '';
  }

  getUp(done: () => void) {
    if (this.pose !== 'kneel') return;
    this.pose = 'getup';
    this.curAnim = '';
    this.play('getup');
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.pose = null;
      this.frozen = false;
      this.curAnim = '';
      done();
    });
  }

  update(dt: number, input: Controls) {
    const b = this.body;
    const onGround = b.blocked.down;
    this.dashCd -= dt;
    this.graceT -= dt;
    this.atkCd -= dt;
    this.invuln -= dt;
    this.dropT -= dt;
    this.hookCd -= dt;
    this.lastRingT -= dt;
    if (onGround) {
      this.coyote = C.coyote;
      this.airDash = true;
      this.airJumps = this.canDouble ? 1 : 0;
      this.wallDir = 0;
    } else this.coyote -= dt;
    this.wallCoyote -= dt;
    this.wallLock -= dt;
    this.buffer = input.pressed.jump ? C.jumpBuffer : this.buffer - dt;

    if (this.frozen || this.dead) {
      if (this.hook) this.dropHook();
      b.velocity.x = approach(b.velocity.x, 0, C.groundDecel * dt);
      this.buffer = 0;
    } else if (this.hurtT > 0) {
      this.hurtT -= dt;
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / C.slideTime);
      b.velocity.x = this.dashDir * (C.crouchSpeed + (C.slideSpeed - C.crouchSpeed) * k);
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.05;
        this.scene.dustBurst(this.zone.x - this.dashDir * 6, b.bottom, 2);
      }
      const hitWall = this.dashDir > 0 ? b.blocked.right : b.blocked.left;
      if (this.slideT <= 0 || hitWall || !onGround) this.slideT = 0;
    } else if (this.hook?.phase === 'pull') {
      this.pullHook(dt, input);
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      b.setVelocity(this.dashDir * C.dashSpeed, 0);
      if (!this.veilDash) {
        this.ghostT -= dt;
        if (this.ghostT <= 0) {
          this.ghostT = 0.028;
          this.scene.spawnGhost(this.sprite);
        }
      }
      const hitWall = this.dashDir > 0 ? b.blocked.right : b.blocked.left;
      // termina pelo tempo ou pela distância: com o jogo lento (quadros longos) o dash não passa do
      // alcance certo; volta pelo caminho que já fez, então nunca entra em parede
      const reach = C.dashSpeed * C.dashTime;
      const L = this.scene.level;
      if (this.veilDash && L.overlapsVeil(b.x, b.y, b.width, b.height)) {
        // o Véu não para no meio da grade: segue mais um pouco até sair do outro lado; se não
        // der (pedra logo atrás, ou grossa demais), volta pelo caminho até o lugar livre
        if (this.dashT <= 0 || Math.abs(b.x - this.dashX0) >= reach - 0.01) {
          this.veilOver += dt;
          this.dashT = Math.max(this.dashT, 1e-4);
        }
        if (hitWall || this.veilOver > C.veilOver || L.overlapsRock(b.x, b.y, b.width, b.height)) this.endDash();
      } else {
        if (Math.abs(b.x - this.dashX0) > reach && this.veilOver <= 0) b.x = this.dashX0 + this.dashDir * reach;
        if (this.veilDash && L.overlapsRock(b.x, b.y, b.width, b.height)) this.endDash();
        else if (this.dashT <= 0 || hitWall || Math.abs(b.x - this.dashX0) >= reach - 0.01) this.endDash();
      }
    } else {
      this.control(dt, input, onGround);
    }

    this.updateAttack(dt);
    this.updateHook(dt);
    this.updateLash(dt);
    this.updateCrouchBody(onGround);

    // gravidade: subida normal, um leve flutuar no topo do pulo e queda suave
    const vy = b.velocity.y;
    if (this.dashT > 0 || this.hook?.phase === 'pull') b.gravity.y = 0;
    else if (Math.abs(vy) < 70 && input.held.jump && !onGround && !this.frozen) b.gravity.y = -C.gravity * (1 - C.apexHang);
    else b.gravity.y = vy > 0 ? C.gravity * C.fallGravity : 0;

    this.trackSafeSpot(onGround);
    this.visuals(dt, onGround);
    this.wasGround = onGround;
    this.prevVy = b.velocity.y;
  }

  private control(dt: number, input: Controls, onGround: boolean) {
    const b = this.body;
    let dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);

    // modo "mover com clique": anda até o ponto clicado
    if (input.moveHeld || input.movePressed) this.moveTarget = input.pointerWorld.x;
    if (dir !== 0) this.moveTarget = null;
    if (this.moveTarget !== null) {
      const dx = this.moveTarget - this.zone.x;
      if (Math.abs(dx) < 5 || (dx > 0 ? b.blocked.right : b.blocked.left)) this.moveTarget = null;
      else dir = Math.sign(dx);
    }
    if (dir !== 0) this.scene.onPlayerAction('move');

    const wantCrouch = onGround && (input.held.crouch || input.held.down);
    if (wantCrouch && !this.crouched) this.scene.onPlayerAction('crouch');
    if (wantCrouch) this.crouched = true;
    else if (this.crouched && this.canStand()) this.crouched = false;

    this.wallSlide(dt, dir, onGround);

    if (this.wallDir !== 0) {
      // grudado na parede: continua escorregando sem precisar segurar a direção
      b.velocity.x = this.wallDir * 40;
    } else if (this.wallLock > 0) {
      // logo depois do pulo de parede o controle fica preso um instante (não volta para a parede)
    } else if (this.recoilT > 0) {
      this.recoilT -= dt;
      b.velocity.x = -this.facing * (this.recoilT > 0.09 ? Math.max(220, this.weapon.recoil) : this.weapon.recoil);
    } else {
      if (dir !== 0 && Math.sign(b.velocity.x) === -dir) b.velocity.x = 0;
      let speed = this.crouched && onGround ? C.crouchSpeed : this.runSpeed;
      if (this.atkAnimT > 0) speed *= this.weapon.moveMul;
      if (this.inWater) speed *= 0.72;
      const accel = onGround ? (dir ? C.groundAccel : C.groundDecel) : dir ? C.airAccel : C.airDecel;
      b.velocity.x = approach(b.velocity.x, dir * speed, accel * dt);
      if (dir !== 0 && this.atkAnimT <= 0) this.facing = dir as 1 | -1;
    }

    if (this.buffer > 0 && (input.held.down || input.held.crouch) && onGround && this.onOneWay()) {
      // descer da plataforma atravessável
      this.dropT = 0.22;
      this.buffer = 0;
      this.crouched = false;
    } else if (this.buffer > 0 && this.coyote > 0 && (!this.crouched || this.canStand())) {
      this.crouched = false;
      b.velocity.y = -C.jumpVel;
      this.buffer = 0;
      this.coyote = 0;
      this.jumping = true;
      this.scene.dustBurst(this.zone.x, b.bottom, 5);
      this.scene.sfx('jump');
      this.scene.onPlayerAction('jump');
    } else if (this.buffer > 0 && (this.wallDir !== 0 || this.wallCoyote > 0)) {
      this.wallJump();
    } else if (input.pressed.jump && !onGround && this.airJumps > 0) {
      this.doubleJump();
    }
    if (this.jumping && !input.held.jump && b.velocity.y < 0) {
      b.velocity.y *= C.jumpCut;
      this.jumping = false;
    }
    if (b.velocity.y >= 0 || b.blocked.up) this.jumping = false;

    if (input.pressed.dash && this.dashCd <= 0) {
      if (onGround && this.crouched) this.startSlide(dir);
      else if (onGround || this.airDash) this.startDash(dir, onGround);
    }
    // golpe apertado um instante antes do fim da recarga não se perde: sai assim que ela acaba
    if (input.pressed.attack) this.atkBuffer = C.attackBuffer;
    else this.atkBuffer -= dt;
    if (this.atkBuffer > 0 && this.atkCd <= 0 && this.canAttack) {
      this.atkBuffer = 0;
      this.startAttack(input, onGround);
    }
    // o gancho apertado logo depois de soltar uma argola (recarga ou corrente ainda voltando) fica
    // guardado um instante: dá para ir de argola em argola sem errar o tempo
    if (input.pressed.hook) this.hookBuffer = 0.18;
    else this.hookBuffer -= dt;
    if (this.hookBuffer > 0 && this.canHook && this.hookCd <= 0 && (!this.hook || this.hook.phase === 'back') && !this.crouched) {
      this.hookBuffer = 0;
      this.throwHook();
    }
  }

  // ---------- Gancho de Corrente ----------
  // lança na argola mais perto que estiver à vista; sem argola, a corrente vai e volta no vazio
  private throwHook() {
    const b = this.body;
    const from = this.hand;
    const ring = this.scene.hookTarget(this);
    this.cancelAttack();
    if (ring) {
      this.facing = ring.x >= this.zone.x ? 1 : -1;
      this.hook = { phase: 'throw', x: from.x, y: from.y, tx: ring.x, ty: ring.y, ring: true, t: 0 };
    } else {
      const k = C.hookRange * 0.75;
      this.hook = { phase: 'throw', x: from.x, y: from.y, tx: from.x + this.facing * k * 0.85, ty: from.y - k * 0.5, ring: false, t: 0 };
    }
    this.hookCd = C.hookCd;
    this.scene.sfx('swoosh', 0.7, 1.3);
    this.scene.sfx('censer', 0.5, 1.4);
    this.scene.onPlayerAction('hook');
    void b;
  }

  // de onde a corrente sai (a mão da frente)
  private get hand() {
    const b = this.body;
    return { x: b.center.x + this.facing * 6, y: b.top + 17 };
  }

  private updateHook(dt: number) {
    const h = this.hook;
    this.chain.clear();
    if (!h) return;
    h.t += dt;
    const from = this.hand;
    if (h.phase === 'throw') {
      const dx = h.tx - h.x;
      const dy = h.ty - h.y;
      const d = Math.hypot(dx, dy);
      const step = C.hookSpeed * dt;
      if (d <= step) {
        h.x = h.tx;
        h.y = h.ty;
        if (h.ring) {
          // mordeu a argola: começa a puxar
          h.phase = 'pull';
          h.t = 0;
          this.cancelAttack();
          this.slideT = 0;
          if (this.dashT > 0) this.endDash();
          this.crouched = false;
          this.wallDir = 0;
          this.body.setAllowGravity(false);
          this.scene.sfx('clang', 0.7, 1.5);
          this.scene.sfx('tink', 0.6, 0.8);
          this.scene.glowBurst(h.x, h.y, 0xbcd4ff, 1.2);
        } else h.phase = 'back';
      } else {
        h.x += (dx / d) * step;
        h.y += (dy / d) * step;
      }
    } else if (h.phase === 'back') {
      const dx = from.x - h.x;
      const dy = from.y - h.y;
      const d = Math.hypot(dx, dy);
      const step = C.hookSpeed * 1.2 * dt;
      if (d <= step + 2) {
        this.hook = null;
        return;
      }
      h.x += (dx / d) * step;
      h.y += (dy / d) * step;
    }
    this.drawChain(from.x, from.y, h.x, h.y);
  }

  // a ponta bateu em alguém no caminho: volta (a cena aplica o dano)
  hookBounce() {
    if (this.hook?.phase === 'throw') this.hook.phase = 'back';
  }

  private pullHook(dt: number, input: Controls) {
    const h = this.hook!;
    const b = this.body;
    h.t += dt;
    const dx = h.tx - b.center.x;
    const dy = h.ty - (b.top + 14);
    const d = Math.hypot(dx, dy);
    const ux = d > 0 ? dx / d : 0;
    const uy = d > 0 ? dy / d : 0;
    const blocked = (ux > 0.3 && b.blocked.right) || (ux < -0.3 && b.blocked.left) || (uy < -0.3 && b.blocked.up) || (uy > 0.3 && b.blocked.down);
    if (input.pressed.jump) {
      this.releaseHook(ux, uy, false);
      b.velocity.y = -C.jumpVel * 0.9;
      this.jumping = true;
      this.buffer = 0;
      this.scene.sfx('jump');
      return;
    }
    if (d < 16 || blocked || h.t > C.hookMaxPull) {
      this.releaseHook(ux, uy, d < 16 || h.t > C.hookMaxPull);
      return;
    }
    b.setVelocity(ux * C.hookPull, uy * C.hookPull);
    if (Math.abs(ux) > 0.2) this.facing = ux > 0 ? 1 : -1;
    this.ghostT -= dt;
    if (this.ghostT <= 0) {
      this.ghostT = 0.05;
      this.scene.spawnGhost(this.sprite);
    }
  }

  // solta da argola: guarda parte do embalo e, se a argola estava em cima, sobe por cima dela
  private releaseHook(ux: number, uy: number, arrived: boolean) {
    const b = this.body;
    const h = this.hook;
    this.hook = h ? { ...h, phase: 'back' } : null;
    b.setAllowGravity(true);
    b.velocity.x = ux * C.hookPull * 0.62;
    b.velocity.y = arrived && uy < 0.2 ? -C.hookPop : uy * C.hookPull * 0.4;
    if (h?.ring) {
      this.lastRing = { x: h.tx, y: h.ty };
      this.lastRingT = 0.7;
    }
    this.airDash = true;
    this.airJumps = this.canDouble ? 1 : 0;
    this.hookCd = C.hookCd * 0.6;
    this.wallLock = 0.1;
  }

  // a corrente do golpe: sai da mão, estica até a ponta da área do golpe e volta enrolando
  private updateLash(dt: number) {
    const g = this.lashG;
    g.clear();
    if (this.lashT < 0) return;
    this.lashT += dt;
    const out = 0.05;
    const hold = this.weapon.active;
    const back = 0.12;
    const t = this.lashT;
    let k: number;
    if (t < out) k = t / out;
    else if (t < out + hold) k = 1;
    else if (t < out + hold + back) k = 1 - (t - out - hold) / back;
    else {
      this.lashT = -1;
      return;
    }
    const b = this.body;
    const box = this.attackBox();
    const from = this.atkDir === 'side' || this.atkDir === 'low' ? this.hand : { x: b.center.x + this.facing * 3, y: b.top + 15 };
    let tx: number;
    let ty: number;
    if (this.atkDir === 'up') {
      tx = b.center.x + this.facing * 4;
      ty = box.y + 6;
    } else if (this.atkDir === 'down') {
      tx = b.center.x + this.facing * 2;
      ty = box.bottom - 6;
    } else {
      tx = this.facing > 0 ? box.right - 3 : box.x + 3;
      ty = this.atkDir === 'low' ? b.bottom - 9 : box.centerY;
    }
    this.drawChain(from.x, from.y, from.x + (tx - from.x) * k, from.y + (ty - from.y) * k, g);
  }

  private drawChain(ax: number, ay: number, bx: number, by: number, g = this.chain) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.floor(len / 5));
    const ux = (bx - ax) / (len || 1);
    const uy = (by - ay) / (len || 1);
    g.lineStyle(2, 0x272c3a, 1).lineBetween(ax, ay, bx, by);
    g.fillStyle(0x8a93a8, 1);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if (i % 2) g.fillRect(Math.round(x - ux), Math.round(y - uy), 2, 2);
      else g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // a ponta: um gancho de ferro virado para trás
    const px = -uy;
    const py = ux;
    g.fillStyle(0x3a3f4e, 1).fillTriangle(bx + ux * 4, by + uy * 4, bx - ux * 3 + px * 4, by - uy * 3 + py * 4, bx - ux * 3 - px * 4, by - uy * 3 - py * 4);
    g.fillStyle(0xbcc6da, 1).fillRect(Math.round(bx + ux * 2), Math.round(by + uy * 2), 1, 1);
  }

  // cena trocando de sala, morte, cinemática: o gancho some
  dropHook() {
    if (this.hook?.phase === 'pull') this.body.setAllowGravity(true);
    this.hook = null;
    this.chain.clear();
  }

  // Garras de Ferro: no ar, encostado na parede, escorrega devagar e pode pular para o outro lado
  private wallSlide(dt: number, dir: number, onGround: boolean) {
    const b = this.body;
    if (!this.canWall || onGround || this.atkAnimT > 0) {
      this.wallDir = 0;
      return;
    }
    let touching: -1 | 0 | 1 = b.blocked.left ? -1 : b.blocked.right ? 1 : 0;
    // ferro liso: as garras não seguram
    if (touching !== 0) {
      const L = this.scene.level;
      const tx = Math.floor((touching > 0 ? b.right + 2 : b.left - 2) / 16);
      if (L.slickCell(tx, Math.floor((b.top + 8) / 16)) || L.slickCell(tx, Math.floor((b.bottom - 6) / 16))) {
        if (dir === touching) this.scene.onSlick(this.zone.x + touching * 7, b.center.y);
        touching = 0;
      }
    }
    if (touching !== 0 && (dir === touching || this.wallDir === touching) && b.velocity.y > -60 && this.wallLock <= 0) {
      if (this.wallDir === 0) this.scene.dustBurst(this.zone.x + touching * 7, b.center.y, 4);
      this.wallDir = touching;
    } else if (touching === 0 || dir === -this.wallDir) {
      if (this.wallDir !== 0) {
        this.wallCoyote = 0.1;
        this.wallSide = this.wallDir as -1 | 1;
      }
      this.wallDir = 0;
    }
    if (this.wallDir === 0) return;
    this.wallSide = this.wallDir as -1 | 1;
    this.wallCoyote = 0.1;
    b.velocity.y = Math.min(b.velocity.y, C.wallSlide);
    b.velocity.x = this.wallDir * 40;
    this.facing = (-this.wallDir) as 1 | -1;
    this.airDash = true;
    this.airJumps = this.canDouble ? 1 : 0;
    this.jumping = false;
    this.wallDustT -= dt;
    if (this.wallDustT <= 0 && b.velocity.y > 20) {
      this.wallDustT = 0.09;
      this.scene.dustBurst(this.zone.x + this.wallDir * 7, b.top + 10, 1);
    }
  }

  private wallJump() {
    const b = this.body;
    const away = -this.wallSide as 1 | -1;
    b.velocity.set(away * C.wallJumpVx, -C.wallJumpVy);
    this.facing = away;
    this.wallDir = 0;
    this.wallCoyote = 0;
    this.wallLock = C.wallLock;
    this.buffer = 0;
    this.jumping = true;
    this.scene.dustBurst(this.zone.x - away * 7, b.center.y, 6);
    this.scene.sfx('jump', 1.1);
    this.scene.onPlayerAction('walljump');
  }

  // Pena do Eclipse: um segundo pulo no ar, com uma nuvem de cinzas embaixo
  private doubleJump() {
    const b = this.body;
    this.airJumps--;
    b.velocity.y = -C.doubleJumpVel;
    this.buffer = 0;
    this.jumping = true;
    this.scene.featherBurst(this.zone.x, b.bottom);
    this.scene.spawnGhost(this.sprite);
    this.scene.sfx('swoosh', 0.5);
    this.scene.onPlayerAction('doublejump');
  }

  get onWall() {
    return this.wallDir !== 0;
  }

  private canStand() {
    const b = this.body;
    const tiles = this.scene.level.layer.getTilesWithinWorldXY(b.x + 1, b.bottom - C.bodyH, b.width - 2, C.bodyH - C.crouchH);
    return !tiles.some((t) => isSolid(t.index));
  }

  private updateCrouchBody(onGround: boolean) {
    // fora do chão o cavaleiro levanta assim que houver espaço
    if (!onGround && this.crouched && this.slideT <= 0 && this.canStand()) this.crouched = false;
    const low = this.crouched || this.slideT > 0 || this.pose === 'kneel';
    const h = low ? C.crouchH : C.bodyH;
    if (this.body.height !== h) {
      this.body.setSize(C.bodyW, h, false);
      this.body.setOffset(0, C.bodyH - h);
    }
  }

  private onOneWay() {
    const b = this.body;
    const l = this.scene.level;
    const y = b.bottom + 2;
    const left = l.tileAt(b.left + 1, y);
    const right = l.tileAt(b.right - 1, y);
    const oneWay = (i: number) => i === TILE_ONEWAY || i < 0;
    return oneWay(left) && oneWay(right) && (left === TILE_ONEWAY || right === TILE_ONEWAY);
  }

  private startDash(dir: number, onGround: boolean) {
    this.dashDir = (dir || this.facing) as 1 | -1;
    this.facing = this.dashDir;
    this.dashT = C.dashTime;
    this.dashX0 = this.body.x;
    this.dashCount++;
    this.dashCd = C.dashCooldown * this.dashCdMul;
    if (!onGround) this.airDash = false;
    this.jumping = false;
    this.body.setAllowGravity(false);
    // já sai na velocidade do dash (sem um quadro parado no começo)
    this.body.setVelocity(this.dashDir * C.dashSpeed, 0);
    this.ghostT = 0;
    this.cancelAttack();
    this.veilDash = this.canVeil;
    this.veilOver = 0;
    if (this.veilDash) {
      // o corpo se desfaz em tinta na hora (a mesma direção e a mesma velocidade do dash)
      this.veilFx ??= new VeilFx(this.scene);
      this.veilFx.begin(this.sprite, this.body.center.x, this.body.bottom, this.dashDir);
      this.scene.sfx('veil');
    } else {
      this.scene.dustBurst(this.zone.x - this.dashDir * 6, this.body.bottom, 6);
      this.scene.sfx('dash');
    }
    this.scene.onPlayerAction('dash');
  }

  private endDash() {
    if (this.veilDash) {
      this.unstickVeil();
      this.veilFx?.finish(this.body.center.x, this.body.bottom);
      this.scene.sfx('veil-form');
      this.veilDash = false;
    }
    this.dashT = 0;
    this.graceT = C.ghostGrace;
    this.body.setAllowGravity(true);
    this.body.velocity.x = this.dashDir * this.runSpeed;
  }

  // o Véu nunca termina dentro de grade, membrana ou pedra: um empurrão para a frente, se já
  // estiver saindo, ou de volta pelo caminho que fez até o primeiro lugar livre
  private unstickVeil() {
    const b = this.body;
    const L = this.scene.level;
    const free = (x: number) => !L.overlapsVeil(x, b.y, b.width, b.height) && !L.overlapsRock(x, b.y, b.width, b.height);
    if (free(b.x)) return;
    for (let k = 1; k <= 12; k++) {
      const x = b.x + this.dashDir * k;
      if (free(x)) {
        b.x = x;
        return;
      }
    }
    const back = -this.dashDir;
    const n = Math.ceil(Math.abs(b.x - this.dashX0)) + 1;
    for (let k = 1; k <= n; k++) {
      const x = b.x + back * k;
      if (free(x)) {
        b.x = x;
        return;
      }
    }
    b.x = this.dashX0;
  }

  private startSlide(dir: number) {
    this.dashDir = (dir || this.facing) as 1 | -1;
    this.facing = this.dashDir;
    this.slideT = C.slideTime;
    this.dashCd = C.dashCooldown * this.dashCdMul;
    this.crouched = true;
    this.cancelAttack();
    this.scene.dustBurst(this.zone.x - this.dashDir * 6, this.body.bottom, 7);
    this.scene.sfx('dash');
    this.scene.onPlayerAction('slide');
  }

  // ---------- ataques ----------
  private startAttack(input: Controls, onGround: boolean) {
    const W = this.weapon;
    this.atkCd = W.cooldown;
    let up = input.held.up;
    let down = input.held.down && !onGround;
    if (input.scheme === 'click') {
      // no modo clique o golpe vai na direção do cursor
      const dx = input.pointerWorld.x - this.zone.x;
      const dy = input.pointerWorld.y - this.body.center.y;
      if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
      up = dy < -36 && Math.abs(dy) > Math.abs(dx) * 0.9;
      down = !onGround && dy > 36 && Math.abs(dy) > Math.abs(dx) * 0.9;
    }
    this.atkDir = up ? 'up' : down ? 'down' : this.crouched && onGround ? 'low' : 'side';
    this.atkAnim = { side: 'attack', up: 'attack_up', down: 'attack_down', low: 'crouch_attack' }[this.atkDir];
    // as adagas alternam as mãos no golpe para o lado
    if (W.id === 'daggers' && this.atkDir === 'side') {
      this.altHand = !this.altHand;
      if (this.altHand) this.atkAnim = 'attack2';
    }
    this.windupT = W.windup;
    this.atkT = W.ranged ? 0 : W.active;
    this.shotPending = W.ranged;
    this.atkAnimT = Math.max(0.15, W.windup + Math.max(W.active, 0.08) + 0.06);
    this.curAnim = '';
    this.hitSet.clear();
    if (W.windup <= 0) this.showSlash();
    if (W.quake) this.scene.sfx('heavy', 1, 0.7);
    else if (W.smoke) {
      this.scene.sfx('censer', 0.8, 1.15);
      this.scene.sfx('heavy', 0.6, 0.9);
    } else this.scene.sfx(W.id === 'scythe' ? 'heavy' : W.id === 'daggers' ? 'stab' : W.ranged ? 'bow' : 'slash');
    this.scene.onPlayerAction('attack');
  }

  private cancelAttack() {
    this.atkT = 0;
    this.windupT = 0;
    this.atkAnimT = 0;
    this.shotPending = false;
    this.slash.setVisible(false);
    this.lashT = -1;
    this.lashG.clear();
  }

  private updateAttack(dt: number) {
    this.atkAnimT -= dt;
    if (this.windupT > 0) {
      this.windupT -= dt;
      if (this.windupT <= 0) {
        if (this.shotPending) this.shoot();
        else {
          this.showSlash();
          // o badalo bate no chão na frente e solta a onda
          const b = this.body;
          if (this.weapon.quake && this.atkDir === 'side' && b.blocked.down) this.scene.quake(b.center.x + this.facing * 40, b.bottom, this.facing);
          // o incensário deixa a nuvem onde o golpe termina
          if (this.weapon.smoke) this.leaveIncense();
        }
      }
    } else if (this.atkT > 0) {
      this.atkT -= dt;
    }
    if (this.slash.visible) this.placeSlash();
  }

  private leaveIncense() {
    const b = this.body;
    const box = this.attackBox();
    const d = this.atkDir;
    if (d === 'side' || d === 'low') this.scene.incenseCloud(box.centerX + this.facing * 10, b.blocked.down ? b.bottom : box.bottom - 4);
    else if (d === 'up') this.scene.incenseCloud(box.centerX, box.y + 34);
    else this.scene.incenseCloud(box.centerX, box.bottom);
  }

  private shoot() {
    this.shotPending = false;
    const b = this.body;
    const d = this.atkDir;
    if (d === 'up') this.scene.spawnArrow(b.center.x + this.facing * 3, b.top - 2, 0, -1, this.weapon.dmg);
    else if (d === 'down') this.scene.spawnArrow(b.center.x, b.bottom + 2, 0, 1, this.weapon.dmg);
    else {
      const y = d === 'low' ? b.bottom - 9 : b.top + 15;
      this.scene.spawnArrow(b.center.x + this.facing * 10, y, this.facing, 0, this.weapon.dmg);
    }
  }

  private showSlash() {
    if (this.weapon.id === 'corrente') {
      this.lashT = 0;
      return;
    }
    const key = SLASH_KEY[this.weapon.id];
    if (!key) return;
    this.slash.setVisible(true);
    this.slash.play(key);
    this.placeSlash();
  }

  private placeSlash() {
    // o arco do corte nasce no centro do corpo e se abre na direção do ataque
    const b = this.body;
    const s = this.slash;
    const ox = this.slashOx;
    if (this.atkDir === 'side' || this.atkDir === 'low') {
      const y = this.atkDir === 'low' ? b.bottom - 10 : b.center.y - 4;
      s.setPosition(b.center.x + this.facing * 2, y).setAngle(0).setFlipY(this.weapon.id === 'daggers' && this.altHand);
      s.setFlipX(this.facing < 0).setOrigin(this.facing < 0 ? 1 - ox : ox, 0.5);
      s.setScale(this.slashK, this.slashK * (this.atkDir === 'low' ? 0.5 : 1));
    } else {
      const up = this.atkDir === 'up';
      s.setScale(this.slashK);
      s.setPosition(b.center.x, up ? b.top + 8 : b.bottom - 6).setFlipX(false).setOrigin(ox, 0.5);
      s.setAngle(up ? -90 : 90).setFlipY(up ? this.facing < 0 : this.facing > 0);
    }
  }

  attackBox() {
    const b = this.body;
    const W = this.weapon;
    const r = W.reach;
    if (this.atkDir === 'up') return new Phaser.Geom.Rectangle(b.center.x - Math.max(22, r * 0.45), b.top - r * 0.9, Math.max(44, r * 0.9), r * 0.9 + 6);
    if (this.atkDir === 'down') return new Phaser.Geom.Rectangle(b.center.x - Math.max(20, r * 0.42), b.bottom - 4, Math.max(40, r * 0.84), r * 0.88);
    if (this.atkDir === 'low') return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x + 2 : b.center.x - 2 - r, b.bottom - 26, r, 28);
    const top = b.center.y - 4 - W.height / 2;
    return new Phaser.Geom.Rectangle(this.facing > 0 ? b.center.x + 2 : b.center.x - 2 - r, top, r, W.height);
  }

  get attacking() {
    return !this.weapon.ranged && this.windupT <= 0 && this.atkT > 0;
  }

  onAttackHit() {
    if (this.atkDir === 'down') {
      this.body.velocity.y = -C.pogoVel;
      this.airDash = true;
      this.jumping = false;
      this.dashCd = 0;
      this.scene.onPlayerAction('pogo');
    } else if (this.atkDir === 'side' || this.atkDir === 'low') {
      this.recoilT = 0.08;
    }
  }

  // golpe batido no escudo: o cavaleiro é empurrado para trás
  onBlocked() {
    if (this.atkDir === 'down') {
      this.body.velocity.y = -C.pogoVel * 0.8;
      this.jumping = false;
      return;
    }
    this.recoilT = 0.16;
  }

  hurt(fromX: number) {
    // no meio do Véu nada machuca (só a janela do dash; o respiro depois é o mesmo do dash comum)
    if (this.dead || this.invuln > 0 || this.veiling) return false;
    this.hp -= 1;
    this.invuln = C.invuln;
    this.hurtT = C.hurtLock;
    if (this.dashT > 0) this.endDash();
    this.dropHook();
    this.graceT = 0;
    this.slideT = 0;
    this.cancelAttack();
    const dir = Math.sign(this.zone.x - fromX) || -this.facing;
    this.body.setVelocity(dir * C.knockX, -C.knockY);
    this.jumping = false;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return true;
  }

  teleport(x: number, feetY: number) {
    if (this.dashT > 0) this.endDash();
    this.dropHook();
    this.graceT = 0;
    this.slideT = 0;
    this.body.reset(x, feetY - C.bodyH / 2);
    this.hurtT = 0;
    this.recoilT = 0;
    this.moveTarget = null;
  }

  private trackSafeSpot(onGround: boolean) {
    if (!onGround || this.hurtT > 0 || this.frozen) return;
    const b = this.body;
    const l = this.scene.level;
    const y = b.bottom + 2;
    if (!isGround(l.tileAt(b.left - 4, y)) || !isGround(l.tileAt(b.right + 4, y))) return;
    if (l.touchesSpikes(b.left - 28, b.top, b.width + 56, b.height + 4)) return;
    this.lastSafe.set(this.zone.x, b.bottom);
  }

  private visuals(dt: number, onGround: boolean) {
    const b = this.body;
    const s = this.sprite;
    if (onGround && !this.wasGround && this.prevVy > 220) {
      this.landT = 0.12;
      this.scene.dustBurst(this.zone.x, b.bottom, 7);
      this.scene.sfx('land');
    }
    this.landT -= dt;
    const vx = Math.abs(b.velocity.x);
    let anim: string;
    if (this.pose) anim = this.pose;
    else if (this.dead || this.hurtT > 0) anim = 'hurt';
    else if (this.slideT > 0) anim = 'slide';
    else if (this.dashT > 0) anim = 'dash';
    else if (this.hook?.phase === 'pull') anim = 'dash';
    else if (this.atkAnimT > 0) anim = this.atkAnim;
    else if (this.wallDir !== 0) anim = 'fall';
    else if (!onGround) anim = b.velocity.y < 0 ? 'jump' : 'fall';
    else if (this.crouched) anim = vx > 10 ? 'crouch_walk' : 'crouch';
    else if (this.landT > 0 && vx < 30) anim = 'land';
    else if (vx > 25) anim = 'run';
    else anim = 'idle';
    this.play(anim);
    // as pernas acompanham a velocidade da arma (a animação foi feita para 192 px/s)
    const pace = this.runSpeed / RUN_ANIM_SPEED;
    this.sprite.anims.timeScale = anim === 'run' ? pace : 1;
    if ((anim === 'run' || anim === 'crouch_walk') && onGround) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = anim === 'run' ? 0.3 / pace : 0.42;
        this.scene.dustBurst(this.zone.x - this.facing * 4, b.bottom, 1);
        this.scene.footstep();
      }
    } else this.stepT = 0.06;
    s.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    s.setFlipX(this.facing < 0);
    // no dash o cavaleiro fica translúcido e frio, como um fantasma (no Véu, vira tinta)
    const ghost = this.dashT > 0 && !this.veilDash;
    if (ghost !== this.ghostLook) {
      this.ghostLook = ghost;
      if (ghost) s.setTint(0xb4c2e8);
      else s.clearTint();
    }
    const blink = this.invuln > 0 && !this.dead && Math.floor(this.invuln * 18) % 2 === 0;
    s.setAlpha(blink ? 0.3 : ghost ? 0.55 : 1);
    if (this.veilFx?.active) this.veilFx.update(dt, s, b.center.x, b.bottom);
  }

  play(name: string) {
    const key = `knight-${this.weapon.id}-${name}`;
    if (this.curAnim === key) return;
    this.curAnim = key;
    this.sprite.play(key);
  }
}
