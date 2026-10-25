import Phaser from 'phaser';
import { TouchControls } from './TouchControls';
import { raw } from './RawInput';
import { ACTIONS, settings, type Action } from './Settings';
import { BTN, pad } from './Pad';

export type { Action } from './Settings';

let touch: TouchControls | null = null;

// Junta teclado, mouse, controle e toque em um único estado por quadro.
export class Controls {
  held = {} as Record<Action, boolean>;
  pressed = {} as Record<Action, boolean>;
  // modo "mover com clique": destino do cavaleiro no mundo
  moveHeld = false;
  movePressed = false;
  pointerWorld = new Phaser.Math.Vector2();
  // códigos crus tocados neste quadro (Esc, P...)
  rawPressed = new Set<string>();
  // Esc, P ou Start no controle
  pausePressed = false;
  // M, Tab ou Select no controle
  mapPressed = false;
  private padStartPrev = false;
  private padSelectPrev = false;
  private prev = {} as Record<Action, boolean>;
  private padPrev = {} as Record<Action, boolean>;
  // botões que já estavam apertados ao fechar um menu: ignorados até soltar
  private padMask = new Set<number>();
  // apertos guardados durante a pausa curta de um impacto (valem no primeiro quadro depois dela)
  private stashed = new Set<Action>();

  constructor(private scene: Phaser.Scene) {
    touch ??= new TouchControls();
    for (const a of ACTIONS) this.held[a] = this.pressed[a] = this.prev[a] = this.padPrev[a] = false;
    this.refreshBound();
    const off = settings.onChange(() => this.refreshBound());
    scene.events.once('shutdown', off);
  }

  private refreshBound() {
    raw.bound = new Set([...ACTIONS.flatMap((a) => settings.codesFor(a)).filter((c) => !c.startsWith('Mouse')), 'Tab', 'KeyM']);
  }

  get scheme() {
    return settings.data.scheme;
  }

  update(cam?: Phaser.Cameras.Scene2D.Camera) {
    const latched = raw.takeLatched();
    this.rawPressed = latched;
    const snap = pad.capturing ? null : pad.read();
    if (snap) {
      for (const i of [...this.padMask]) {
        if (snap.buttons[i]) snap.buttons[i] = false;
        else this.padMask.delete(i);
      }
    }
    const start = !!snap && snap.buttons[BTN.start];
    const select = !!snap && snap.buttons[BTN.select];
    this.pausePressed = raw.enabled && (latched.has('Escape') || latched.has('KeyP') || (start && !this.padStartPrev));
    this.mapPressed = raw.enabled && (latched.has('KeyM') || latched.has('Tab') || (select && !this.padSelectPrev));
    this.padStartPrev = start;
    this.padSelectPrev = select;
    for (const a of ACTIONS) {
      const codes = settings.codesFor(a);
      let h = codes.some((c) => raw.held.has(c));
      let p = codes.some((c) => latched.has(c));
      if (snap) {
        let ph = settings.data.pad[a].some((i) => snap.buttons[i]);
        // analógico: para os lados sempre anda; cima e baixo só quando a inclinação é mais vertical,
        // para correr na diagonal sem agachar sem querer
        const { lx, ly } = snap;
        if (a === 'left') ph ||= lx < -0.35;
        if (a === 'right') ph ||= lx > 0.35;
        if (a === 'up') ph ||= ly < -0.55 && -ly > Math.abs(lx) * 0.8;
        if (a === 'down') ph ||= ly > 0.6 && ly > Math.abs(lx) * 1.15;
        if (ph && !this.padPrev[a]) p = true;
        this.padPrev[a] = ph;
        h ||= ph;
      }
      if (!raw.enabled) {
        h = false;
        p = false;
      }
      if (touch?.held[a]) h = true;
      if (touch?.latch[a]) {
        p = true;
        touch.latch[a] = false;
      }
      this.pressed[a] = p || (h && !this.prev[a]);
      this.held[a] = h;
      this.prev[a] = h;
    }
    const click = this.scheme === 'click' && raw.enabled;
    this.moveHeld = click && raw.held.has('Mouse0');
    this.movePressed = click && latched.has('Mouse0');
    if (cam) {
      const p = this.scene.input.activePointer;
      cam.getWorldPoint(p.x, p.y, this.pointerWorld);
    }
  }

  stash() {
    for (const a of ACTIONS) if (this.pressed[a]) this.stashed.add(a);
  }

  unstash() {
    for (const a of this.stashed) this.pressed[a] = true;
    this.stashed.clear();
  }

  // alguma ação foi apertada neste quadro?
  get anyPressed() {
    return ACTIONS.some((a) => this.pressed[a]) || this.movePressed;
  }

  get isTouch() {
    return touch?.enabled ?? false;
  }

  // zera o estado (ao sair de um menu, para não "vazar" teclas)
  reset() {
    raw.flush();
    const snap = pad.read();
    this.padMask = new Set(snap ? snap.buttons.flatMap((v, i) => (v ? [i] : [])) : []);
    for (const a of ACTIONS) this.held[a] = this.pressed[a] = this.prev[a] = false;
    this.stashed.clear();
    touch?.clear();
  }
}
