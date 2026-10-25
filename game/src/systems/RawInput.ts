// Leitura direta de teclado e mouse por código físico (permite trocar as teclas)
class RawInput {
  readonly held = new Set<string>();
  private latched = new Set<string>();
  bound = new Set<string>();
  // com um menu aberto o jogo não lê nem bloqueia teclas
  enabled = true;
  capture: ((code: string) => void) | null = null;
  private captureSince = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        e.stopPropagation();
        const cb = this.capture;
        this.capture = null;
        cb(e.code === 'Escape' ? '' : e.code);
        return;
      }
      if (!this.enabled) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (this.bound.has(e.code) || (e.ctrlKey && (this.bound.has('ControlLeft') || this.bound.has('ControlRight')))) e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.latched.add(e.code);
    }, true);
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });
    window.addEventListener('blur', () => this.held.clear());
    // captura de botão do mouse para trocar teclas (em qualquer lugar da tela)
    window.addEventListener('pointerdown', (e) => {
      if (!this.capture || e.pointerType !== 'mouse' || performance.now() - this.captureSince < 200) return;
      e.preventDefault();
      e.stopPropagation();
      const cb = this.capture;
      this.capture = null;
      cb(`Mouse${e.button}`);
    }, true);
    const game = document.getElementById('game');
    game?.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      const code = `Mouse${e.button}`;
      this.held.add(code);
      this.latched.add(code);
    });
    window.addEventListener('contextmenu', (e) => {
      if (this.capture || (e.target as HTMLElement | null)?.closest?.('#game')) e.preventDefault();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.held.delete(`Mouse${e.button}`);
    });
  }

  startCapture(cb: (code: string) => void) {
    this.capture = cb;
    this.captureSince = performance.now();
  }

  // Entrega os toques acumulados desde o último quadro
  takeLatched() {
    const out = this.latched;
    this.latched = new Set();
    return out;
  }

  flush() {
    this.held.clear();
    this.latched.clear();
  }
}

export const raw = new RawInput();
