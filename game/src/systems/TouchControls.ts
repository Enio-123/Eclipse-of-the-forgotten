import type { Action } from './Controls';

// Captura o ponteiro quando possível (alguns navegadores recusam)
function capture(el: Element, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* segue sem captura */
  }
}

// Controles na tela (DOM) para celular: analógico à esquerda, botões à direita.
// Mantém o estado "segurado" e um "trava" para toques mais rápidos que um quadro.
export class TouchControls {
  readonly held: Partial<Record<Action, boolean>> = {};
  readonly latch: Partial<Record<Action, boolean>> = {};
  enabled = false;

  constructor() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const touchOnly = navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches;
    if (coarse || touchOnly) this.enable();
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
    this.bindStick();
    this.bindButtons();
  }

  // solta tudo (ao abrir ou fechar um menu)
  clear() {
    for (const k of Object.keys(this.held) as Action[]) this.held[k] = false;
    for (const k of Object.keys(this.latch) as Action[]) this.latch[k] = false;
    document.querySelectorAll('#buttons button.on').forEach((b) => b.classList.remove('on'));
    const knob = document.getElementById('stick-knob');
    if (knob) knob.style.transform = '';
  }

  private enable() {
    this.enabled = true;
    document.body.classList.add('touch');
  }

  private bindStick() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (!stick || !knob) return;
    let pointer: number | null = null;
    const dead = 16;
    const maxR = 42;

    const set = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy);
      const k = len > maxR ? maxR / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const prev = { ...this.held };
      if (len < dead) {
        this.held.left = this.held.right = this.held.up = this.held.down = false;
      } else {
        const nx = dx / len;
        const ny = dy / len;
        this.held.right = nx > 0.5;
        this.held.left = nx < -0.5;
        this.held.up = ny < -0.75;
        this.held.down = ny > 0.75;
      }
      for (const a of ['left', 'right', 'up', 'down'] as Action[]) {
        if (this.held[a] && !prev[a]) this.latch[a] = true;
      }
    };
    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    };
    stick.addEventListener('pointerdown', (e) => {
      pointer = e.pointerId;
      capture(stick, e.pointerId);
      move(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointer) move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      set(0, 0);
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  private bindButtons() {
    document.querySelectorAll<HTMLButtonElement>('#buttons button').forEach((btn) => {
      const action = btn.dataset.action as Action;
      const down = (e: PointerEvent) => {
        capture(btn, e.pointerId);
        this.held[action] = true;
        this.latch[action] = true;
        btn.classList.add('on');
        e.preventDefault();
      };
      const up = () => {
        this.held[action] = false;
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
}
