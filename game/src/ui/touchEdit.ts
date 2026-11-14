import { settings, TOUCH_ALPHA_MIN, TOUCH_IDS, TOUCH_SCALE, type TouchId } from '../systems/Settings';
import { toLocal } from '../systems/Screen';
import { TOUCH_NAME, applyTouchLayout, centerOf, clampCenter, frame, spotAt, spotOf, touchEl, touchIdOf, watchTouchLayout } from '../systems/TouchLayout';

// O editor dos botões na tela (Configurações > Celular > Editar botões na tela).
//
// Todos os controles aparecem, também os que ainda não foram ganhos (o dash, o gancho, a memória e a
// habilidade do mago), para já deixar tudo no lugar. Arrastar um controle muda o lugar; tocar nele escolhe
// qual a barra muda: o tamanho dele (60% a 180%) e a opacidade de todos. "Padrão" volta tudo ao de antes
// (pede um segundo toque para confirmar). Cada mudança fica salva na hora.

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

interface Drag {
  id: TouchId;
  pointer: number;
  // onde o dedo começou e onde estava o centro do controle (px da página)
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  moved: boolean;
}

export class TouchEditor {
  private sel: TouchId = 'jump';
  private drag: Drag | null = null;
  private armed = 0;
  private bound = false;
  private onClose: (() => void) | null = null;

  open(onClose: () => void) {
    this.onClose = onClose;
    watchTouchLayout();
    this.bind();
    document.body.classList.add('touch-edit');
    applyTouchLayout();
    this.select(this.sel);
  }

  close() {
    if (!document.body.classList.contains('touch-edit')) return;
    document.body.classList.remove('touch-edit');
    this.drag = null;
    this.disarm();
    TOUCH_IDS.forEach((id) => touchEl(id)?.classList.remove('tsel'));
    this.onClose = null;
  }

  private get editing() {
    return document.body.classList.contains('touch-edit');
  }

  private bind() {
    if (this.bound) return;
    this.bound = true;
    const layer = document.getElementById('touch')!;
    const s = document.getElementById('screen-touchedit')!;
    // os toques vão para o editor, não para o jogo (a fase de captura chega antes dos controles)
    const stop = (e: Event) => {
      if (!this.editing) return false;
      e.stopPropagation();
      e.preventDefault();
      return true;
    };
    layer.addEventListener(
      'pointerdown',
      (e) => {
        if (!stop(e)) return;
        const t = (e.target as HTMLElement).closest('#stick, #buttons button, #pause-btn');
        const id = t ? touchIdOf(t) : null;
        if (!id) return;
        this.select(id);
        const f = frame();
        const c = centerOf(id, spotOf(id), f);
        const p = toLocal(e.clientX, e.clientY);
        this.drag = { id, pointer: e.pointerId, x0: p.x, y0: p.y, cx: c.cx, cy: c.cy, moved: false };
        try {
          layer.setPointerCapture(e.pointerId);
        } catch {
          /* segue sem captura */
        }
      },
      true,
    );
    layer.addEventListener(
      'pointermove',
      (e) => {
        if (!this.editing || !this.drag || e.pointerId !== this.drag.pointer) return;
        stop(e);
        const d = this.drag;
        const p = toLocal(e.clientX, e.clientY);
        const dx = p.x - d.x0;
        const dy = p.y - d.y0;
        if (!d.moved && Math.hypot(dx, dy) < 5) return;
        d.moved = true;
        this.place(d.id, d.cx + dx, d.cy + dy, false);
      },
      true,
    );
    const end = (e: PointerEvent) => {
      if (!this.editing || !this.drag || e.pointerId !== this.drag.pointer) return;
      stop(e);
      const moved = this.drag.moved;
      this.drag = null;
      if (moved) {
        settings.save();
        this.placeBar();
      }
    };
    layer.addEventListener('pointerup', end, true);
    layer.addEventListener('pointercancel', end, true);
    // o clique que vem depois do toque também não chega no botão de pausa
    layer.addEventListener('click', (e) => void stop(e), true);
    layer.addEventListener('contextmenu', (e) => void stop(e), true);

    const size = $<HTMLInputElement>('input[data-opt="touch-size"]', s);
    size.min = String(Math.round(TOUCH_SCALE.min * 100));
    size.max = String(Math.round(TOUCH_SCALE.max * 100));
    size.oninput = () => this.resize(Number(size.value) / 100);
    $<HTMLButtonElement>('[data-cmd="smaller"]', s).onclick = () => this.resize(spotOf(this.sel).k - 0.1);
    $<HTMLButtonElement>('[data-cmd="bigger"]', s).onclick = () => this.resize(spotOf(this.sel).k + 0.1);
    const alpha = $<HTMLInputElement>('input[data-opt="touch-alpha"]', s);
    alpha.min = String(Math.round(TOUCH_ALPHA_MIN * 100));
    alpha.oninput = () => {
      settings.data.touchAlpha = Math.max(TOUCH_ALPHA_MIN, Math.min(1, Number(alpha.value) / 100));
      settings.save();
      applyTouchLayout();
      this.render();
    };
    const reset = $<HTMLButtonElement>('[data-cmd="touch-reset"]', s);
    reset.onclick = () => {
      if (!this.armed) {
        reset.classList.add('armed');
        reset.textContent = 'Toque de novo para voltar ao padrão';
        this.armed = window.setTimeout(() => this.disarm(), 3500);
        return;
      }
      this.disarm();
      settings.resetTouch();
      applyTouchLayout();
      this.select(this.sel);
    };
    $<HTMLButtonElement>('[data-cmd="done"]', s).onclick = () => this.onClose?.();
  }

  private disarm() {
    window.clearTimeout(this.armed);
    this.armed = 0;
    const reset = document.querySelector('#screen-touchedit [data-cmd="touch-reset"]');
    if (reset) {
      reset.classList.remove('armed');
      reset.textContent = 'Padrão';
    }
  }

  // muda o lugar de um controle (o centro em px da página); save: já guarda (no fim do arrasto)
  private place(id: TouchId, cx: number, cy: number, save: boolean) {
    const f = frame();
    const k = spotOf(id).k;
    const c = clampCenter(id, cx, cy, k, f);
    settings.data.touchLayout = { ...settings.data.touchLayout, [id]: spotAt(c.cx, c.cy, k, f) };
    if (save) settings.save();
    applyTouchLayout();
  }

  // muda o tamanho do controle escolhido, com o mesmo centro
  private resize(k: number) {
    const id = this.sel;
    const nk = Math.max(TOUCH_SCALE.min, Math.min(TOUCH_SCALE.max, Math.round(k * 20) / 20));
    const f = frame();
    const c = centerOf(id, spotOf(id), f);
    const cc = clampCenter(id, c.cx, c.cy, nk, f);
    settings.data.touchLayout = { ...settings.data.touchLayout, [id]: spotAt(cc.cx, cc.cy, nk, f) };
    settings.save();
    applyTouchLayout();
    this.render();
    this.placeBar();
  }

  private select(id: TouchId) {
    this.sel = id;
    TOUCH_IDS.forEach((t) => touchEl(t)?.classList.toggle('tsel', t === id));
    this.render();
    this.placeBar();
  }

  private render() {
    const s = document.getElementById('screen-touchedit');
    if (!s) return;
    const k = spotOf(this.sel).k;
    $('.tb-name', s).textContent = TOUCH_NAME[this.sel];
    $<HTMLInputElement>('input[data-opt="touch-size"]', s).value = String(Math.round(k * 100));
    $('.tb-size', s).textContent = `${Math.round(k * 100)}%`;
    $<HTMLButtonElement>('[data-cmd="smaller"]', s).disabled = k <= TOUCH_SCALE.min + 1e-6;
    $<HTMLButtonElement>('[data-cmd="bigger"]', s).disabled = k >= TOUCH_SCALE.max - 1e-6;
    const a = Math.round(settings.data.touchAlpha * 100);
    $<HTMLInputElement>('input[data-opt="touch-alpha"]', s).value = String(a);
    $('.tb-alpha', s).textContent = `${a}%`;
  }

  // a barra vai para onde cobrir menos controles (o escolhido pesa mais): em cima, no meio ou embaixo, e
  // no centro, à esquerda ou à direita; no empate fica em cima, no centro
  private placeBar() {
    const s = document.getElementById('screen-touchedit');
    const bar = s?.querySelector<HTMLElement>('.touch-bar');
    if (!s || !bar) return;
    const f = frame();
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    const rects = TOUCH_IDS.map((id) => ({ id, ...centerOf(id, spotOf(id), f) }));
    const cost = (left: number, top: number) =>
      rects.reduce((sum, r) => {
        const w = Math.min(r.cx + r.rad, left + bw) - Math.max(r.cx - r.rad, left);
        const h = Math.min(r.cy + r.rad, top + bh) - Math.max(r.cy - r.rad, top);
        return w > 0 && h > 0 ? sum + w * h * (r.id === this.sel ? 20 : 1) : sum;
      }, 0);
    const xs: [string, number][] = [['', (f.w - bw) / 2], ['h-left', f.l + 16], ['h-right', f.w - f.r - 16 - bw]];
    const ys: [string, number][] = [['v-top', f.t + 8], ['v-bottom', f.h - f.b - 8 - bh], ['', (f.h - bh) / 2]];
    let best = ['v-top', ''];
    let bestCost = Infinity;
    for (const [vy, y] of ys) {
      for (const [hx, x] of xs) {
        const c = cost(x, y);
        if (c < bestCost - 1) {
          best = [vy, hx];
          bestCost = c;
        }
      }
    }
    for (const c of ['v-top', 'v-bottom', 'h-left', 'h-right']) s.classList.toggle(c, best.includes(c));
  }
}
