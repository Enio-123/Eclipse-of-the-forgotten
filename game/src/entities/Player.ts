import Phaser from 'phaser';
import { MAGES, PLAYER as C, WEAPONS, type WeaponDef, type WeaponId } from '../config';
import type { Controls } from '../systems/Controls';
import type { GameScene } from '../scenes/GameScene';
import { isGround, isSolid } from '../world/Level';
import { TILE_ONEWAY } from '../gfx/textures';
import { DEPTH } from '../world/Decor';
import { hd } from '../gfx/flip';
import { VeilFx } from '../gfx/veil';
import { drawChain, drawWhip, type LashPose } from '../gfx/lash';

export type AttackDir = 'side' | 'up' | 'down' | 'low';
// ações que o jogador já descobriu (as dicas somem quando ele usa)
export type PlayerAction = 'move' | 'attack' | 'jump' | 'dash' | 'slide' | 'pogo' | 'crouch' | 'trip' | 'walljump' | 'doublejump' | 'parry' | 'hook' | 'glide' | 'row' | 'flight';

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

export const SLASH_KEY: Record<WeaponId, string | null> = {
  sword: 'slash', scythe: 'slash-big', daggers: 'slash-small', bow: null, badalo: 'slash-heavy', incensario: 'slash-censer', corrente: null, picareta: 'slash-heavy',
  lanca: 'slash-thrust', remo: 'slash-oar',
  // os cajados: o do Grimório bate como bordão (o arco do corte na cor dele); os outros têm o desenho próprio
  eclipse: null, necro: 'slash', veu: null, espaco: null,
};
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
  // depois do toque de um Arquivado, o mesmo toque não tira outra conta de Âmbar por um instante
  sapT = 0;
  dropT = 0;
  atkDir: AttackDir = 'side';
  crouched = false;
  inWater = false;
  // pose fixa de cena (ajoelhado no começo, levantando)
  pose: 'kneel' | 'getup' | null = null;
  // habilidades achadas no mapa
  // Esporas do Carrasco: o dash (e o deslize agachado) só depois de achar
  canDash = false;
  canWall = false;
  canDouble = false;
  canHook = false;
  // Véu Abissal: o dash vira tinta viva e atravessa grades de cela e membranas abissais
  canVeil = false;
  // Capa de Arielle: segurando o pulo no ar (depois de um pulo feito no ar), o retalho abre e ele plana
  canGlide = false;
  gliding = false;
  private glideArmed = false;
  // Capa de Luz: depois do pulo duplo, cada novo toque no pulo no ar gasta uma das luzes (light) e voa mais
  // um trecho para cima; elas enchem no chão firme e nos lumes
  canFly = false;
  light = 0;
  // Floresta Nevada (o Forest marca a cada quadro): gelo embaixo dos pés, o vento da rajada (px/s para
  // o lado) e a corrente de ar subindo onde ele está (px/s para cima)
  ice = false;
  windX = 0;
  draft = 0;
  // água funda e morna (Vale e Minas; a cena liga por sala). swim: metade do corpo na água, a não ser de pé
  // no fundo com a cabeça para fora (aí ele só anda no raso); under: a cabeça embaixo; canSwim: a Concha
  // do Rio
  warm = false;
  canSwim = false;
  swim = false;
  under = false;
  // fôlego sem a Concha (1 = cheio): quando acaba, a cena devolve o cavaleiro ao chão firme
  breath = 1;
  // a correnteza (px/s para o lado) e a queda d'água que empurra para baixo (o Vale marca a cada quadro)
  current = 0;
  fall = 0;
  // a linha d'água acima dele (px), se em cima dela houver ar
  private surface: number | null = null;
  private strokeT = 0;
  // acabou de pular para fora da água: a física dela não segura o pulo
  private exitT = 0;
  private breathOut = false;
  // inclinação do corpo nadando (rad, segue o embalo)
  private tilt = 0;
  hook: HookState | null = null;
  // vagonete das Minas: sentado dentro, preso ao assento que a cena põe a cada quadro (pés em x, y)
  ride: { x: number; y: number; vx: number; vy: number } | null = null;
  // rebocado pela corda do Barqueiro: puxado até (x, y), que quem puxa põe a cada quadro. Não anda nem
  // pula, mas golpeia: cada golpe dado conta em cuts (quem puxa decide quando a corda arrebenta)
  tow: { x: number; y: number; speed: number; cuts: number } | null = null;
  // gravidade da sala (a fragmentação do Capataz deixa tudo leve por um tempo)
  gravMul = 1;
  // Fôlego (troca com o Cobrador): o dash recarrega mais rápido
  dashCdMul = 1;
  // conta os dashes (a cena marca quais inimigos já foram atravessados em cada um)
  dashCount = 0;
  // conta os golpes (o Eco repete cada um uma vez só)
  atkN = 0;

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
  // a estocada da lança: o tempo que o corpo ainda vai junto com a ponta
  private lungeT = 0;
  // a lanterna da lança (luz de Âmbar onde ela está pendurada, quadro a quadro)
  private lantern: Phaser.GameObjects.Image | null = null;
  private wasGround = false;
  private prevVy = 0;
  private ghostT = 0;
  private ghostLook = false;
  private stepT = 0;
  private landT = 0;
  private curAnim = '';
  // o corpo estica no impulso e amassa na aterrissagem (escala em volta dos pés, com mola)
  private sq = 0;
  private sqV = 0;
  private baseScale = 1;
  // saiu do chão por um impulso (pulo, parede, gancho...) e não caindo de uma beirada
  private airFromJump = false;
  // quanto tempo já cai perto do máximo (a capa passa a tremular)
  private fastFallT = 0;
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
  // a pose do chicote ou da corrente neste quadro e a conta dos pulsos do Cajado da Dobra (o espelho e o
  // Eco repetem os dois, que não usam o arco de corte)
  lashPose: LashPose | null = null;
  pulseN = 0;
  // mago: mirando a habilidade (parado, a cena mexe a mira), soltando (a animação de lançar) e o
  // Mergulho do Véu (some no chão e sai na mira)
  aiming = false;
  private castT = 0;
  private dive: { x0: number; x1: number; y1: number; t: number; dur: number; done: () => void } | null = null;
  // de onde sai a magia em cada quadro de cada animação (a ponta do cajado, a partir dos pés)
  private points: Record<string, [number, number][]> | null = null;

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
    this.baseScale = this.sprite.scaleX;
    const key = SLASH_KEY[id];
    if (key) {
      const meta = (this.scene.registry.get('slashes') as Record<string, SlashMeta>)[key];
      this.slash.setTexture(key, 0);
      this.slashOx = meta.ox;
      this.slashK = 1 / (meta.scale ?? 1);
    }
    // o arco do bordão do Necromante sai na cor da escola dele
    const mage = this.weapon.mage;
    if (mage) {
      const c = MAGES[mage].color;
      this.slash.setTint(0xeafff8, 0xeafff8, c, c);
    } else this.slash.clearTint();
    this.points = mage || this.weapon.lantern ? ((this.scene.cache.json.get(`knight-${id}-meta`) as { points?: Record<string, [number, number][]> } | undefined)?.points ?? null) : null;
    if (this.weapon.lantern && !this.lantern) {
      this.lantern = this.scene.add.image(0, 0, 'glow').setTint(0xffa64a).setScale(1.15).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.player + 0.3);
    } else if (!this.weapon.lantern && this.lantern) {
      this.lantern.destroy();
      this.lantern = null;
    }
    this.cancelAttack();
    this.aiming = false;
    this.castT = 0;
    this.curAnim = '';
  }

  // a ponta do cajado agora, no mundo (onde nasce a bolinha, de onde sai o chicote). Sem os pontos
  // da folha, um palmo na frente do peito
  staffTip(anim?: string, frame?: number) {
    const s = this.sprite;
    const name = anim ?? s.anims.currentAnim?.key.slice(`knight-${this.weapon.id}-`.length) ?? 'idle';
    const list = this.points?.[name];
    const i = frame ?? Math.max(0, (s.anims.currentFrame?.index ?? 1) - 1);
    const pt = list?.[Math.min(i, list.length - 1)];
    if (!pt) return { x: this.body.center.x + this.facing * 14, y: this.body.top + 12 };
    return { x: s.x + this.facing * pt[0], y: s.y + pt[1] };
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
  // no meio do Véu: intangível, não toma dano (o dash do Mago do Véu já sai assim desde o começo)
  get veiling() {
    return this.dashT > 0 && this.veilDash;
  }
  // o Véu de verdade (a relíquia): a tinta passa por grade de cela, membrana e espinho
  get veilPassing() {
    return this.veiling && this.canVeil;
  }
  // embaixo do chão, no Mergulho do Mago do Véu
  get diving() {
    return !!this.dive;
  }
  // soltando a habilidade (a animação de lançar segura o corpo um instante)
  get casting() {
    return this.castT > 0;
  }
  // dá para abrir a mira agora: de pé no chão, sem golpe, dash, gancho ou vagonete no meio
  get canAim() {
    return !this.dead && !this.frozen && !this.pose && this.hurtT <= 0 && this.dashT <= 0 && this.slideT <= 0 && !this.hook && !this.ride && !this.tow && !this.dive &&
      this.atkAnimT <= 0 && this.castT <= 0 && this.body.blocked.down;
  }
  // etapa do Véu na tela (dissolve, flow, form ou off), para os testes
  get veilStage() {
    return this.veilFx?.stage ?? 'off';
  }
  // dash fantasma: atravessa inimigos e golpes sem levar dano (espinhos ainda machucam)
  get ghost() {
    return this.dashT > 0 || this.graceT > 0 || !!this.dive;
  }
  get sliding() {
    return this.slideT > 0;
  }
  // já gastou alguma luz da Capa de Luz, o pulo duplo ou o dash do ar (um lume tem o que devolver)
  get spent() {
    return this.light < (this.canFly ? C.lightCharges : 0) || this.airJumps < (this.canDouble ? 1 : 0) || !this.airDash;
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
    this.sapT -= dt;
    this.dropT -= dt;
    this.hookCd -= dt;
    this.lastRingT -= dt;
    if (onGround) {
      this.coyote = C.coyote;
      this.airDash = true;
      this.airJumps = this.canDouble ? 1 : 0;
      this.light = this.canFly ? C.lightCharges : 0;
      this.wallDir = 0;
    } else this.coyote -= dt;
    this.wallCoyote -= dt;
    this.wallLock -= dt;
    this.buffer = input.pressed.jump ? C.jumpBuffer : this.buffer - dt;
    this.updateWater(dt, onGround);

    if (this.ride && !this.dead) {
      this.rideUpdate(dt, input);
    } else if (this.tow && !this.dead) {
      this.towUpdate(dt, input, onGround);
    } else if (this.dive && !this.dead) {
      this.diveUpdate(dt);
    } else if (this.frozen || this.dead) {
      if (this.hook) this.dropHook();
      b.velocity.x = approach(b.velocity.x, 0, C.groundDecel * dt);
      this.buffer = 0;
    } else if (this.hurtT > 0) {
      this.hurtT -= dt;
    } else if (this.aiming || this.castT > 0) {
      // mirando ou soltando: fica plantado (a cena lê as teclas da mira)
      this.castT -= dt;
      b.velocity.x = approach(b.velocity.x, 0, C.groundDecel * dt);
      this.buffer = 0;
      this.atkBuffer = 0;
    } else if (this.slideT > 0) {
      // no gelo o deslize dura mais
      this.slideT -= this.ice ? dt * 0.55 : dt;
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
      if (this.veilDash && this.canVeil && L.overlapsVeil(b.x, b.y, b.width, b.height)) {
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
    this.updateCrouchBody(onGround || !!this.ride);

    // gravidade: subida normal, um leve flutuar no topo do pulo e queda suave
    const vy = b.velocity.y;
    if (this.dashT > 0 || this.hook?.phase === 'pull') b.gravity.y = 0;
    // rebocado, quem decide a velocidade é a corda (a gravidade do mundo fica anulada)
    else if (this.tow) b.gravity.y = -C.gravity;
    else if (this.swim) {
      // a água segura: o nado (ou o afundar) decide a velocidade de subida e de descida; machucado ou
      // parado por outra coisa, ele afunda devagar
      b.gravity.y = -C.gravity;
      if (this.hurtT > 0 || this.frozen || this.dead || this.aiming || this.castT > 0) b.velocity.y = approach(b.velocity.y, C.sinkSpeed, 900 * dt);
    } else if (Math.abs(vy) < 70 && input.held.jump && !onGround && !this.frozen) b.gravity.y = -C.gravity * (1 - C.apexHang);
    else b.gravity.y = vy > 0 ? C.gravity * C.fallGravity : 0;
    if (this.gravMul !== 1 && !this.swim && !this.tow && !(this.dashT > 0 || this.hook?.phase === 'pull')) b.gravity.y -= C.gravity * (1 - this.gravMul);
    // na gravidade leve a queda também é mais lenta (o teto de velocidade vale para cima também, então
    // só a descida é limitada aqui)
    if (this.gravMul < 1 && b.velocity.y > C.maxFall * 0.7) b.velocity.y = C.maxFall * 0.7;
    // a queda d'água empurra para baixo com força: não se sobe por dentro dela (o dash atravessa de lado)
    if (this.fall > 0 && this.dashT <= 0 && !this.ride && !this.dive && !this.tow && this.hook?.phase !== 'pull') {
      b.velocity.y = approach(b.velocity.y, this.fall, 2400 * dt);
      this.jumping = false;
    }
    this.updateGlide(dt, input, onGround);

    this.trackSafeSpot(onGround);
    this.visuals(dt, onGround);
    this.wasGround = onGround;
    this.prevVy = b.velocity.y;
  }

  private control(dt: number, input: Controls, onGround: boolean) {
    const b = this.body;
    if (this.swim) {
      this.swimMove(dt, input, onGround);
      this.actions(dt, input, onGround, (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0));
      return;
    }
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
    } else if (this.lungeT > 0) {
      // a estocada: na preparação o peso vai um pouco para trás, no golpe o corpo vai junto com a ponta
      this.lungeT -= dt;
      b.velocity.x = this.windupT > 0 ? -this.facing * 30 : this.facing * (onGround ? 290 : 220);
    } else {
      const ice = this.ice && onGround;
      // virar na hora só fora do gelo (no gelo o embalo vai embora devagar)
      if (!ice && dir !== 0 && Math.sign(b.velocity.x) === -dir) b.velocity.x = 0;
      let speed = this.crouched && onGround ? C.crouchSpeed : this.runSpeed;
      if (this.atkAnimT > 0) speed *= this.weapon.moveMul;
      if (this.inWater) speed *= 0.72;
      const accel = onGround ? (dir ? (ice ? C.iceAccel : C.groundAccel) : ice ? C.iceDecel : C.groundDecel) : dir ? C.airAccel : C.airDecel;
      // a rajada empurra: no ar por inteiro (planando, a capa pega mais), no chão pela metade (no gelo, quase tudo)
      const wind = this.windX * (onGround ? (ice ? 0.8 : 0.45) : this.gliding ? 1.5 : 1);
      b.velocity.x = approach(b.velocity.x, dir * speed + wind, accel * dt);
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
    } else if (input.pressed.jump && !onGround && this.light > 0) {
      this.flight();
    }
    if (this.jumping && !input.held.jump && b.velocity.y < 0) {
      b.velocity.y *= C.jumpCut;
      this.jumping = false;
    }
    if (b.velocity.y >= 0 || b.blocked.up) this.jumping = false;
    this.actions(dt, input, onGround, dir);
  }

  // dash, golpe e gancho (em terra e na água)
  private actions(dt: number, input: Controls, onGround: boolean, dir: number) {
    // na água funda o dash só sai com a Concha (vira um impulso de nado)
    if (input.pressed.dash && this.dashCd <= 0 && this.canDash && (!this.swim || this.canSwim)) {
      if (onGround && this.crouched && !this.swim) this.startSlide(dir);
      else if (onGround || this.airDash || this.swim) this.startDash(dir, onGround || this.swim);
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
    drawChain(this.chain, from.x, from.y, h.x, h.y);
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
    this.lashPose = null;
    if (this.lashT < 0) return;
    this.lashT += dt;
    if (this.weapon.whip) {
      this.updateWhip(g);
      return;
    }
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
    this.lashPose = { ax: from.x, ay: from.y, bx: from.x + (tx - from.x) * k, by: from.y + (ty - from.y) * k, t, wave: 0, whip: false };
    drawChain(g, this.lashPose.ax, this.lashPose.ay, this.lashPose.bx, this.lashPose.by);
  }

  // o chicote de tinta do Mago do Véu: sai da forquilha do cajado, estala na ponta da área do golpe
  // (uma onda corre do cabo à ponta) e se recolhe
  private updateWhip(g: Phaser.GameObjects.Graphics) {
    const out = 0.06;
    const hold = this.weapon.active;
    const back = 0.14;
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
    const from = this.staffTip();
    let tx: number;
    let ty: number;
    if (this.atkDir === 'up') {
      tx = b.center.x + this.facing * 6;
      ty = box.y + 4;
    } else if (this.atkDir === 'down') {
      tx = b.center.x + this.facing * 3;
      ty = box.bottom - 4;
    } else {
      tx = this.facing > 0 ? box.right - 2 : box.x + 2;
      ty = this.atkDir === 'low' ? b.bottom - 8 : box.centerY;
    }
    const wave = Math.sin(t * 40) * 3 * (1 - Math.min(1, t / (out + hold)));
    this.lashPose = { ax: from.x, ay: from.y, bx: from.x + (tx - from.x) * k, by: from.y + (ty - from.y) * k, t, wave, whip: true };
    drawWhip(g, this.lashPose);
  }

  // cena trocando de sala, morte, cinemática: o gancho some
  dropHook() {
    if (this.hook?.phase === 'pull') this.body.setAllowGravity(true);
    this.hook = null;
    this.chain.clear();
  }

  // ---------- água funda e morna ----------
  // o estado da água no começo do quadro (dentro dela o controle e a gravidade mudam) e o fôlego
  private updateWater(dt: number, onGround: boolean) {
    const b = this.body;
    const L = this.scene.level;
    this.strokeT -= dt;
    this.exitT -= dt;
    const was = this.swim;
    const w = this.warm && !this.ride && !this.dive && this.exitT <= 0 ? L.waterAt(this.zone.x, b.center.y) : null;
    const head = !!w && L.inWater(this.zone.x, b.top + 5);
    this.swim = !!w && (!onGround || head);
    this.under = this.swim && head;
    this.surface = w?.air ? w.surface : null;
    if (this.swim && !was) {
      // caiu na água: ela segura a queda (e fecha a capa, solta a parede)
      if (b.velocity.y > 0) b.velocity.y *= this.canSwim ? 0.3 : 0.4;
      this.wallDir = 0;
      this.jumping = false;
    }
    if (this.swim) {
      this.airDash = true;
      this.airJumps = this.canDouble ? 1 : 0;
    }
    // o fôlego só conta sem a Concha, com a cabeça embaixo
    if (this.under && !this.canSwim && !this.frozen && !this.dead) {
      this.breath = Math.max(0, this.breath - dt / C.breath);
      if (this.breath <= 0 && !this.breathOut) {
        this.breathOut = true;
        this.scene.onBreathOut();
      }
    } else {
      this.breath = Math.min(1, this.breath + dt * 1.6);
      if (this.breath >= 1) this.breathOut = false;
    }
  }

  // na água funda. Sem a Concha: afunda devagar, anda no fundo devagar e o pulo do fundo é fraco. Com ela:
  // nada para todos os lados com embalo, parado boia até a cabeça sair, {jump} embaixo é uma braçada e na
  // linha d'água é o pulo inteiro para fora. A correnteza leva junto
  private swimMove(dt: number, input: Controls, onGround: boolean) {
    const b = this.body;
    this.crouched = false;
    this.moveTarget = null;
    this.wallDir = 0;
    const dx = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
    const dy = (input.held.down || input.held.crouch ? 1 : 0) - (input.held.up ? 1 : 0);
    if (dx !== 0) {
      this.scene.onPlayerAction('move');
      if (this.atkAnimT <= 0) this.facing = dx as 1 | -1;
    }
    if (!this.canSwim) {
      const sp = this.runSpeed * C.waterWalk * (this.atkAnimT > 0 ? this.weapon.moveMul : 1);
      b.velocity.x = approach(b.velocity.x, dx * sp + this.current * 0.7, (dx ? C.swimAccel : C.swimDecel) * dt);
      if (this.buffer > 0 && onGround) {
        this.buffer = 0;
        b.velocity.y = -C.waterJump;
        this.scene.sfx('jump', 0.45, 0.7);
        this.scene.bubbles(this.zone.x, b.bottom - 6, 5);
        this.scene.onPlayerAction('jump');
      }
      b.velocity.y = approach(b.velocity.y, C.sinkSpeed, (b.velocity.y > C.sinkSpeed ? 1500 : C.waterDrag) * dt);
      return;
    }
    const s = this.surface;
    // quanto falta subir para a cabeça sair na altura de boiar (px; negativo: já está acima)
    const e = s === null ? Infinity : b.top + C.floatHead - s;
    if (this.buffer > 0 && e < 12) {
      // na linha d'água: o pulo sai inteiro (e a água não segura ele por um instante)
      this.buffer = 0;
      this.swim = false;
      this.exitT = 0.22;
      b.velocity.y = -C.jumpVel;
      this.jumping = true;
      this.scene.sfx('jump');
      this.scene.splash(this.zone.x, s!);
      this.scene.onPlayerAction('jump');
      return;
    }
    const sp = C.swimSpeed * (this.atkAnimT > 0 ? 0.7 : 1);
    const len = Math.hypot(dx, dy) || 1;
    const tx = (dx / len) * sp + this.current;
    let ty = (dy / len) * sp;
    if (dy <= 0 && s !== null) {
      // subindo, ou parado com ar em cima: boia até a cabeça sair e fica balançando na linha d'água
      const rise = dy < 0 ? sp : C.floatRise;
      ty = Phaser.Math.Clamp(-e * 5, -rise, 60) + (e < 10 ? Math.sin(this.scene.time.now / 420) * 7 : 0);
    } else if (dy === 0) ty = -16;
    if (this.buffer > 0 && this.strokeT <= 0) {
      // a braçada: um impulso para onde ele aponta (sem direção, para cima)
      this.buffer = 0;
      this.strokeT = C.strokeCd;
      const ux = dx / len;
      const uy = dx || dy ? dy / len : -1;
      b.velocity.x = ux * C.strokeVel + this.current;
      b.velocity.y = uy * C.strokeVel;
      this.scene.sfx('swoosh', 0.35, 0.6);
      this.scene.bubbles(this.zone.x - ux * 8, b.center.y - uy * 8, 6);
      this.scene.onPlayerAction('jump');
    }
    const acc = (dx || dy ? C.swimAccel : C.swimDecel) * dt;
    b.velocity.x = approach(b.velocity.x, tx, acc);
    b.velocity.y = approach(b.velocity.y, ty, acc);
  }

  // a cena devolveu ao chão firme: fôlego cheio de novo
  refillBreath() {
    this.breath = 1;
    this.breathOut = false;
  }

  // Garras de Ferro: no ar, encostado na parede, escorrega devagar e pode pular para o outro lado
  private wallSlide(dt: number, dir: number, onGround: boolean) {
    const b = this.body;
    if (!this.canWall || onGround || this.atkAnimT > 0 || this.swim || this.fall > 0) {
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

  // Capa de Arielle: o pulo apertado no ar (o duplo, ou depois dele) e segurado abre o retalho quando ele
  // para de subir; aberto, cai devagar e, na corrente de ar, sobe. Dash, gancho, parede, golpe sofrido
  // ou mira fecham a capa
  private updateGlide(dt: number, input: Controls, onGround: boolean) {
    const b = this.body;
    const blocked = onGround || this.dead || this.frozen || !!this.pose || !!this.ride || !!this.dive || this.dashT > 0 || !!this.hook ||
      this.wallDir !== 0 || this.hurtT > 0 || this.aiming || this.castT > 0 || this.swim || this.fall > 0;
    if (!this.canGlide || blocked) {
      if (onGround || !input.held.jump) this.glideArmed = false;
      this.setGlide(false);
      return;
    }
    if (input.pressed.jump) this.glideArmed = true;
    if (!input.held.jump) this.glideArmed = false;
    this.setGlide(this.glideArmed && (b.velocity.y > -40 || this.draft > 0));
    if (!this.gliding) return;
    // a gravidade do mundo fica anulada: a capa decide a velocidade de queda (ou de subida)
    b.gravity.y = -C.gravity;
    if (this.draft > 0) b.velocity.y = approach(b.velocity.y, -this.draft, C.draftAccel * dt);
    else b.velocity.y = approach(b.velocity.y, C.glideFall, C.glideAccel * dt);
  }

  private setGlide(on: boolean) {
    if (on === this.gliding) return;
    this.gliding = on;
    if (on) {
      this.scene.sfx('flap', 0.6, 0.9);
      this.scene.onPlayerAction('glide');
    }
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

  // Capa de Luz: a luz da capa se gasta num clarão embaixo dos pés e leva ele mais um trecho para cima
  private flight() {
    const b = this.body;
    this.light--;
    b.velocity.y = -C.lightVel;
    this.buffer = 0;
    this.jumping = true;
    this.scene.lightBurst(this.zone.x, b.bottom, this.light);
    this.scene.spawnGhost(this.sprite, 0xffc85a);
    this.scene.sfx('swoosh', 0.45, 1.35);
    this.scene.onPlayerAction('flight');
  }

  // um lume da Capa de Luz: as luzes enchem, e o pulo duplo e o dash do ar voltam junto
  refill() {
    this.light = this.canFly ? C.lightCharges : 0;
    this.airJumps = this.canDouble ? 1 : 0;
    this.airDash = true;
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
    // o Mago do Véu já corre em tinta (grade e membrana, só depois da relíquia)
    this.veilDash = this.canVeil || this.weapon.mage === 'veu';
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
      if (this.canVeil) this.unstickVeil();
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
    // o remo: nadando, o golpe para o lado é uma remada; de pé num tronco, leva o tronco
    if (W.row && this.atkDir === 'side') this.row(onGround);
    this.windupT = W.windup;
    this.atkT = W.ranged ? 0 : W.active;
    this.lungeT = W.lunge && this.atkDir === 'side' ? W.windup + W.active * 0.9 : 0;
    this.shotPending = W.ranged;
    this.atkAnimT = Math.max(0.15, W.windup + Math.max(W.active, 0.08) + 0.06);
    this.curAnim = '';
    this.hitSet.clear();
    this.atkN++;
    if (W.windup <= 0) this.showSlash();
    if (W.quake) this.scene.sfx('heavy', 1, 0.7);
    else if (W.smoke) {
      this.scene.sfx('censer', 0.8, 1.15);
      this.scene.sfx('heavy', 0.6, 0.9);
    } else this.scene.sfx(W.id === 'scythe' ? 'heavy' : W.id === 'daggers' || W.lunge ? 'stab' : W.ranged ? 'bow' : 'slash', 1, W.lunge ? 0.8 : 1);
    this.scene.onPlayerAction('attack');
  }

  private row(onGround: boolean) {
    const b = this.body;
    const s = this.scene;
    if (this.swim && this.canSwim && !onGround) {
      b.velocity.x = this.facing * C.rowVel + this.current;
      s.bubbles(this.zone.x - this.facing * 10, b.center.y + 4, 6);
      if (this.surface !== null) s.splash(this.zone.x + this.facing * 26, this.surface);
      s.sfx('splash', 0.45, 1.25);
      s.onPlayerAction('row');
    } else if (onGround && s.vale?.row(this.facing)) {
      s.sfx('splash', 0.4, 1.15);
      s.onPlayerAction('row');
    }
  }

  private cancelAttack() {
    this.atkT = 0;
    this.lungeT = 0;
    this.windupT = 0;
    this.atkAnimT = 0;
    this.shotPending = false;
    this.slash.setVisible(false);
    this.lashT = -1;
    this.lashPose = null;
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
    if (this.weapon.orb) {
      // a bolinha do eclipse sai da esfera do cajado, no quadro em que ele estica
      const tip = this.staffTip(this.atkAnim, 2);
      const [dx, dy] = d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : [this.facing, 0];
      this.scene.spawnOrb(tip.x, tip.y, dx, dy, this.weapon.dmg);
      return;
    }
    if (d === 'up') this.scene.spawnArrow(b.center.x + this.facing * 3, b.top - 2, 0, -1, this.weapon.dmg);
    else if (d === 'down') this.scene.spawnArrow(b.center.x, b.bottom + 2, 0, 1, this.weapon.dmg);
    else {
      const y = d === 'low' ? b.bottom - 9 : b.top + 15;
      this.scene.spawnArrow(b.center.x + this.facing * 10, y, this.facing, 0, this.weapon.dmg);
    }
  }

  private showSlash() {
    if (this.weapon.id === 'corrente' || this.weapon.whip) {
      this.lashT = 0;
      return;
    }
    // o pulso do Cajado da Dobra: o espaço entorta na área do golpe (a cena desenha)
    if (this.weapon.pulse) {
      this.pulseN++;
      this.scene.spacePulse(this.attackBox(), this.facing, this.atkDir);
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
      // a ponta parou no que acertou: o corpo para junto
      this.lungeT = 0;
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
    if (this.dead || this.invuln > 0 || this.veiling || this.dive) return false;
    this.hp -= 1;
    this.aiming = false;
    this.castT = 0;
    this.invuln = C.invuln;
    this.hurtT = C.hurtLock;
    if (this.dashT > 0) this.endDash();
    this.dropHook();
    this.tow = null;
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

  // o toque dos Arquivados: leva uma conta de Âmbar em vez de abrir uma rachadura. Ele recua um passo,
  // sem piscar (nada se abriu nele)
  sap(fromX: number, grace: number) {
    if (this.dead || this.invuln > 0 || this.sapT > 0 || this.veiling || this.dive) return false;
    this.sapT = grace;
    this.hurtT = C.hurtLock * 0.7;
    this.aiming = false;
    this.castT = 0;
    if (this.dashT > 0) this.endDash();
    this.cancelAttack();
    const dir = Math.sign(this.zone.x - fromX) || -this.facing;
    this.body.setVelocity(dir * C.knockX * 0.75, -C.knockY * 0.4);
    this.jumping = false;
    return true;
  }

  // ---------- vagonete ----------
  // sobe no vagonete: o corpo para de cair e de bater no cenário (a cena move o assento)
  board(x: number, feetY: number) {
    if (this.dashT > 0) this.endDash();
    this.dropHook();
    this.slideT = 0;
    this.cancelAttack();
    this.moveTarget = null;
    this.ride = { x, y: feetY, vx: 0, vy: 0 };
    const b = this.body;
    b.setAllowGravity(false);
    b.checkCollision.up = b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = false;
    this.seat();
  }

  // põe o corpo no assento (o desenho lê a base do corpo já com o recorte de agachado)
  private seat() {
    const r = this.ride!;
    this.updateCrouchBody(true);
    this.body.reset(r.x, r.y - C.bodyH / 2);
    this.body.updateFromGameObject();
  }

  // sai do vagonete (pulando, derrubado pela viga ou jogado no batente) com esta velocidade
  leaveRide(vx: number, vy: number) {
    if (!this.ride) return;
    this.ride = null;
    const b = this.body;
    b.setAllowGravity(true);
    b.checkCollision.up = b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = true;
    b.setVelocity(vx, vy);
    this.airDash = true;
    this.airJumps = this.canDouble ? 1 : 0;
    this.coyote = 0;
  }

  // dentro do vagonete: baixo agacha (as vigas baixas passam por cima), o pulo salta para fora com o
  // embalo dele, o golpe continua valendo e dá para virar para trás
  private rideUpdate(dt: number, input: Controls) {
    const r = this.ride!;
    const b = this.body;
    if (this.frozen) {
      this.seat();
      return;
    }
    this.crouched = input.held.down || input.held.crouch;
    if (this.buffer > 0) {
      this.buffer = 0;
      this.crouched = false;
      this.updateCrouchBody(true);
      this.leaveRide(r.vx * 0.85, -C.jumpVel);
      this.jumping = true;
      this.scene.sfx('jump');
      this.scene.onPlayerAction('jump');
      return;
    }
    const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
    if (dir !== 0 && this.atkAnimT <= 0) this.facing = dir as 1 | -1;
    this.seat();
    void b;
    if (input.pressed.attack) this.atkBuffer = C.attackBuffer;
    else this.atkBuffer -= dt;
    if (this.atkBuffer > 0 && this.atkCd <= 0 && this.canAttack) {
      this.atkBuffer = 0;
      this.startAttack(input, true);
    }
  }

  // rebocado: vai na direção do ponto, de frente para quem puxa (de lado e para baixo; o chão segura como
  // sempre). Golpear continua valendo, e cada golpe conta
  private towUpdate(dt: number, input: Controls, onGround: boolean) {
    const t = this.tow!;
    const b = this.body;
    if (this.hook) this.dropHook();
    const dx = t.x - this.zone.x;
    const dy = t.y - b.center.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 12);
    b.velocity.x = (dx / d) * t.speed * k;
    b.velocity.y = (dy / d) * t.speed * k;
    if (this.atkAnimT <= 0 && Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    this.buffer = 0;
    if (input.pressed.attack) this.atkBuffer = C.attackBuffer;
    else this.atkBuffer -= dt;
    if (this.atkBuffer > 0 && this.atkCd <= 0 && this.canAttack) {
      this.atkBuffer = 0;
      t.cuts++;
      this.startAttack(input, onGround);
    }
  }

  // ---------- mago ----------
  startAim() {
    this.aiming = true;
    this.cancelAttack();
    this.moveTarget = null;
    if (this.crouched && this.canStand()) this.crouched = false;
    this.curAnim = '';
  }

  stopAim() {
    this.aiming = false;
    this.curAnim = '';
  }

  // solta a habilidade: o cajado desce apontando para a mira (segura o corpo pela animação)
  castAnim(len = 0.3) {
    this.aiming = false;
    this.castT = len;
    this.curAnim = '';
  }

  // Mergulho: a tinta afunda onde ele está, corre por baixo do chão e sobe na mira (done: a cena bate)
  startDive(x1: number, feetY: number, dur: number, done: () => void) {
    this.aiming = false;
    this.castT = 0;
    this.cancelAttack();
    this.dive = { x0: this.zone.x, x1, y1: feetY, t: 0, dur, done };
    const b = this.body;
    b.setVelocity(0, 0);
    b.setAllowGravity(false);
    b.checkCollision.none = true;
    this.sprite.setVisible(false);
  }

  private diveUpdate(dt: number) {
    const d = this.dive!;
    const b = this.body;
    d.t += dt;
    const k = Math.min(1, d.t / d.dur);
    const e = k * k * (3 - 2 * k);
    b.reset(d.x0 + (d.x1 - d.x0) * e, b.y + b.height / 2);
    if (k < 1) return;
    this.dive = null;
    b.checkCollision.none = false;
    b.setAllowGravity(true);
    b.reset(d.x1, d.y1 - C.bodyH / 2);
    b.setVelocity(0, -C.jumpVel * 0.55);
    this.sprite.setVisible(true);
    this.graceT = C.ghostGrace;
    this.curAnim = '';
    d.done();
  }

  teleport(x: number, feetY: number) {
    this.leaveRide(0, 0);
    if (this.dive) {
      this.dive = null;
      this.body.checkCollision.none = false;
      this.body.setAllowGravity(true);
      this.sprite.setVisible(true);
    }
    this.aiming = false;
    this.castT = 0;
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
    if (!onGround || this.hurtT > 0 || this.frozen || this.swim) return;
    const b = this.body;
    const l = this.scene.level;
    const y = b.bottom + 2;
    if (!isGround(l.tileAt(b.left - 4, y)) || !isGround(l.tileAt(b.right + 4, y))) return;
    if (l.touchesSpikes(b.left - 28, b.top, b.width + 56, b.height + 4)) return;
    // gelo fino não é chão firme: pode quebrar antes da volta
    if (l.thinNear(b.left - 4, b.right + 4, y)) return;
    this.lastSafe.set(this.zone.x, b.bottom);
  }

  private visuals(dt: number, onGround: boolean) {
    const b = this.body;
    const s = this.sprite;
    const vy = b.velocity.y;
    // um impulso para cima (pulo do chão, duplo, de parede, do gancho, quique): estica o corpo. O pulo do
    // chão sai no quadro em que ele ainda pisa (a física só tira os pés no próximo), então o chão zera
    // antes e o impulso vale mesmo com os pés no chão
    if (onGround) this.airFromJump = false;
    const kick = this.prevVy - vy;
    if (kick > 260 && vy < -150) {
      this.airFromJump = true;
      this.sq = 0.05 + 0.07 * Math.min(1, kick / C.jumpVel);
      this.sqV = 0;
    }
    if (onGround && !this.wasGround && this.prevVy > 150) {
      // aterrissagem: amassa conforme a força da queda; nas quedas fortes dobra os joelhos
      const k = Math.min(1, (this.prevVy - 150) / 320);
      this.sq = -(0.05 + 0.13 * k);
      this.sqV = 0;
      if (this.prevVy > 220) {
        this.landT = this.prevVy > 330 ? 0.2 : 0.13;
        this.scene.dustBurst(this.zone.x, b.bottom, 7);
        this.scene.sfx('land');
      }
    }
    this.landT -= dt;
    this.fastFallT = !onGround && vy > C.maxFall * 0.92 ? this.fastFallT + dt : 0;
    const vx = Math.abs(b.velocity.x);
    let anim: string;
    let air = -1;
    if (this.pose) anim = this.pose;
    else if (this.dead || this.hurtT > 0) anim = 'hurt';
    else if (this.castT > 0) anim = 'cast';
    else if (this.aiming) anim = 'cast_aim';
    else if (this.slideT > 0) anim = 'slide';
    else if (this.dashT > 0) anim = 'dash';
    else if (this.hook?.phase === 'pull') anim = 'dash';
    else if (this.atkAnimT > 0) anim = this.atkAnim;
    else if (this.tow) anim = 'hurt';
    else if (this.wallDir !== 0) anim = 'wall';
    else if (this.ride) anim = this.crouched ? 'crouch' : 'idle';
    else if (this.swim && this.canSwim && !onGround) {
      // nadando: a braçada (ou, numa folha sem ela, o quadro do topo do pulo)
      if (this.scene.anims.exists(`knight-${this.weapon.id}-swim`)) anim = 'swim';
      else {
        anim = 'air';
        air = Math.round(((this.scene.anims.get(`knight-${this.weapon.id}-air`)?.frames.length ?? 13) - 1) / 2);
      }
    } else if (!onGround) {
      // no ar o quadro vem da velocidade: impulso, subida, topo, queda; numa queda longa a capa tremula
      if (this.fastFallT > 0.25) anim = 'fall';
      else {
        anim = 'air';
        air = this.airFrame(vy);
      }
    } else if (this.crouched) anim = vx > 10 ? 'crouch_walk' : 'crouch';
    else if (this.landT > 0 && vx < 30) anim = 'land';
    else if (vx > 25) anim = 'run';
    else anim = 'idle';
    if (air >= 0) this.holdFrame(anim, air);
    else this.play(anim);
    // as pernas acompanham a velocidade da arma (a animação foi feita para 192 px/s); na água, a de verdade
    const pace = (this.swim || this.inWater ? Math.max(70, vx) : this.runSpeed) / RUN_ANIM_SPEED;
    const swimPace = 0.55 + 0.75 * Math.min(1, Math.hypot(b.velocity.x, b.velocity.y) / C.swimSpeed);
    this.sprite.anims.timeScale = anim === 'run' ? pace : anim === 'swim' ? swimPace : 1;
    if ((anim === 'run' || anim === 'crouch_walk') && onGround) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = anim === 'run' ? 0.3 / pace : 0.42;
        if (!this.swim && !this.inWater) this.scene.dustBurst(this.zone.x - this.facing * 4, b.bottom, 1);
        this.scene.footstep();
      }
    } else this.stepT = 0.06;
    s.setPosition(Math.round(this.zone.x), Math.round(b.bottom));
    // nadando, o corpo deita para o lado do embalo (gira em volta do meio do corpo, não dos pés)
    const tiltTo = this.swim && this.canSwim && !onGround && this.dashT <= 0 ? Phaser.Math.Clamp(b.velocity.x / C.swimSpeed, -1, 1) * 0.5 : 0;
    this.tilt += (tiltTo - this.tilt) * Math.min(1, dt * 7);
    if (Math.abs(this.tilt) < 0.002) this.tilt = 0;
    else {
      const r = b.height / 2;
      s.setPosition(Math.round(this.zone.x - Math.sin(this.tilt) * r), Math.round(b.center.y + Math.cos(this.tilt) * r));
    }
    s.setRotation(this.tilt);
    s.setFlipX(this.facing < 0);
    this.squash(dt, onGround, vy);
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
    // a lanterna da lança fica onde ela está pendurada no quadro e treme como chama
    const lan = this.lantern;
    if (lan) {
      const at = this.staffTip();
      const t = this.scene.time.now / 1000;
      const on = s.visible && !this.dead && !this.veilFx?.active;
      lan.setPosition(at.x, at.y).setAlpha(on ? (blink ? 0.18 : 0.4) + 0.05 * Math.sin(t * 13) + 0.03 * Math.sin(t * 31) : 0);
    }
  }

  // onde a lanterna da lança está agora (null sem ela)
  get lanternAt() {
    return this.lantern && this.lantern.alpha > 0 ? { x: this.lantern.x, y: this.lantern.y } : null;
  }

  play(name: string) {
    const key = `knight-${this.weapon.id}-${name}`;
    if (this.curAnim === key) return;
    this.curAnim = key;
    this.sprite.play(key);
  }

  // um quadro escolhido de uma animação, parado nele (o ar escolhe pela velocidade, não pelo relógio)
  private holdFrame(name: string, i: number) {
    const key = `knight-${this.weapon.id}-${name}`;
    const a = this.scene.anims.get(key);
    if (!a) {
      this.play(name === 'air' ? (this.body.velocity.y < 0 ? 'jump' : 'fall') : name);
      return;
    }
    const f = a.frames[Math.max(0, Math.min(a.frames.length - 1, i))];
    if (this.curAnim !== key) {
      this.curAnim = key;
      this.sprite.play(key);
    }
    const st = this.sprite.anims;
    if (st.isPlaying || st.currentFrame !== f) st.pause(f);
  }

  // o quadro do ar: 0 é o impulso logo depois de sair do chão, o do meio é o topo e o último a queda
  // rápida. Quem sai de uma beirada andando já começa com as pernas descendo
  private airFrame(vy: number) {
    const n = this.scene.anims.get(`knight-${this.weapon.id}-air`)?.frames.length ?? 13;
    const top = (n - 1) / 2;
    const t = (vy + C.jumpVel) / (C.jumpVel + C.maxFall);
    let i = Math.round(t * (n - 1));
    if (!this.airFromJump) i = Math.max(i, Math.ceil(top + 1));
    return Math.max(0, Math.min(n - 1, i));
  }

  // estica e amassa em volta dos pés: uma mola que volta sozinha. No ar estica um pouco com a
  // velocidade, no dash achata e alonga para a frente
  private squash(dt: number, onGround: boolean, vy: number) {
    const s = this.sprite;
    let target = 0;
    if (this.dashT > 0 || this.slideT > 0) target = -0.05;
    else if (!onGround && !this.wallDir && !this.ride) target = 0.04 * Math.min(1, Math.abs(vy) / C.jumpVel);
    const k = Math.min(dt, 1 / 30);
    this.sqV += (-420 * (this.sq - target) - 21 * this.sqV) * k;
    this.sq += this.sqV * k;
    if (this.veilFx?.active || this.diving) return;
    const q = Math.max(-0.25, Math.min(0.2, this.sq));
    s.setScale(this.baseScale * (1 - q * 0.75), this.baseScale * (1 + q));
  }
}
