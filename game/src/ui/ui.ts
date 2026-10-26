import type Phaser from 'phaser';
import { MAGES, MAGE_IDS, POWERS, POWER_IDS, WEAPONS, WEAPON_IDS, type MageId, type PowerId, type WeaponId } from '../config';
import { raw } from '../systems/RawInput';
import { ACTIONS, ACTION_LABEL, PAD_ACTIONS, codeName, settings, type Action, type Quality } from '../systems/Settings';
import { audio } from '../systems/Audio';
import { BRAND_LABEL, BTN, buttonGlyph, buttonName, pad, stickGlyph, type PadBrand } from '../systems/Pad';
import { ABILITIES, LEVEL_MUL, MAX_LEVEL, SLOT_IDS, progress, type SlotFind, type Upgrade } from '../systems/Save';
import { BESTIARY, ELO, FORGE, MATERIALS, MEMORIES, MEMORY_TOTAL, OFFERS, PAGES, PAGE_IDS, RECORD_IDS, SLOT_FINDS, recordInfo, relicInfo } from '../world/lore';
import { MAP_POS, ROOMS, type RoomId } from '../world/rooms';
import { MapView, regionThumb, type MapHere } from './mapview';
import type { RegionDef, RegionId } from '../world/regions';
import { RES, applyRes, resFor } from '../gfx/view';
import { FORCED_PRESET, PRESETS, PRESET_LABEL, applyFpsLimit, presetOf, type FpsLimit, type GfxFlags, type Level3, type Preset } from '../systems/Graphics';

// teclas que arrastam o mapa (direção em que o desenho anda)
const MAP_PAN: Record<string, [number, number]> = {
  ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [1, 0], ArrowRight: [-1, 0], KeyW: [0, 1], KeyS: [0, -1], KeyA: [1, 0], KeyD: [-1, 0],
};
type ScreenId = 'loading' | 'intro' | 'menu' | 'erase' | 'path' | 'mages' | 'weapons' | 'settings' | 'pause' | 'end' | 'map' | 'shop' | 'surveyor' | 'inventory' | 'talk' | 'forge' | 'journal';

const COBRADOR_LINES = [
  'Voltou. Sempre voltam.',
  'Guardo tudo neste livro. Até o que você já não lembra.',
  'Uma memória por um fôlego. Barato, se pensar bem.',
  'Os sinos tocam para quem paga. Os outros só escutam.',
  'Moedas do dízimo. Todas acabam voltando para mim.',
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const slotText = (n: number) => `Ocupa ${plural(n, 'espaço', 'espaços')}`;

interface Entry {
  id: ScreenId;
  // o que Esc (ou B no controle) faz nesta tela
  back?: () => void;
}

interface SheetMeta {
  columns: number;
  anims: Record<string, { start: number; count: number; fps: number }>;
  // folha no traço liso: quadros recortados num atlas, `scale` pixels da folha por pixel do mundo
  frames?: Record<string, { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize: { x: number; y: number } }>;
  meta?: { size: { w: number; h: number } };
  scale?: number;
}

// prévia animada de uma folha do cavaleiro (nas cartas das armas, dos caminhos e dos magos)
interface Preview {
  sprite: HTMLElement;
  cel: HTMLElement;
  meta: SheetMeta;
  // quando ela foi escolhida: o golpe começa do primeiro quadro
  t0: number;
}

export type PathId = 'knight' | 'mage';
const PREVIEW_SCREENS: (ScreenId | null)[] = ['weapons', 'path', 'mages'];
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;

const WEAPON_ORDER: WeaponId[] = ['scythe', 'sword', 'daggers', 'bow', 'badalo', 'incensario', 'corrente', 'picareta', 'lanca', 'remo'];
const TAGS: Partial<Record<WeaponId, string>> = { scythe: 'Arma do carrasco · recomendada' };
const TOUCH_LABEL: Record<Action, string> = {
  left: 'Analógico', right: 'Analógico', up: 'Analógico para cima', down: 'Analógico para baixo',
  jump: 'Pular', attack: 'Atacar', dash: 'Dash', crouch: 'Analógico para baixo', hook: 'Gancho', memory: 'Memória', skill: 'Habilidade',
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// Interface em HTML por cima do jogo: telas de menu, faixas de título, pensamentos e dicas
class UI {
  private game: Phaser.Game | null = null;
  private stack: Entry[] = [];
  private timers: Record<string, number> = {};
  private padPrev: boolean[] = [];
  private padRepeat = 0;
  private padBrandShown: PadBrand | null = null;
  private cardLoop = 0;
  // andando pelas cartas com as setas ou o direcional (o clique só escolhe, não confirma)
  private picking = false;
  onStackChange: ((open: boolean) => void) | null = null;

  init(game: Phaser.Game) {
    this.game = game;
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.mapKeys.delete(e.code));
    window.addEventListener('blur', () => this.mapKeys.clear());
    const sync = () => this.syncLayer();
    window.addEventListener('resize', sync);
    game.scale.on('resize', sync);
    new ResizeObserver(sync).observe(document.getElementById('game')!);
    sync();
    const loop = () => {
      this.padNav();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && b.closest('.screen')) audio.sfx('ui-ok');
    });
    // controle conectado, desconectado ou trocado: atualiza a aba Controle se estiver aberta
    pad.onChange(() => {
      if (this.top !== 'settings') return;
      if (pad.brand !== this.padBrandShown) this.renderPad();
      else this.renderPadStatus();
    });
  }

  // a camada de textos acompanha o retângulo do canvas
  private syncLayer() {
    const canvas = document.querySelector('#game canvas');
    const layer = document.getElementById('layer');
    if (!canvas || !layer) return;
    const r = canvas.getBoundingClientRect();
    Object.assign(layer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.documentElement.style.setProperty('--u', `${(r.height / 360).toFixed(3)}px`);
  }

  get open() {
    return this.stack.length > 0;
  }

  get top() {
    return this.stack[this.stack.length - 1]?.id ?? null;
  }

  // ---------- pilha de telas ----------
  private refresh() {
    const top = this.top;
    document.querySelectorAll<HTMLElement>('.screen').forEach((s) => s.classList.toggle('show', s.id === `screen-${top}`));
    const open = this.stack.length > 0;
    raw.enabled = !open;
    document.body.classList.toggle('menu-open', open);
    if (!PREVIEW_SCREENS.includes(top)) cancelAnimationFrame(this.cardLoop);
    this.onStackChange?.(open);
  }

  private push(id: ScreenId, back?: () => void) {
    this.stack = this.stack.filter((e) => e.id !== id);
    this.stack.push({ id, back });
    this.refresh();
    this.focusFirst();
  }

  pop() {
    this.stack.pop();
    this.refresh();
    if (this.stack.length) this.focusFirst();
  }

  closeAll() {
    this.stack = [];
    this.refresh();
  }

  private focusFirst() {
    const s = document.getElementById(`screen-${this.top}`);
    if (!s) return;
    const target = s.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? s.querySelector<HTMLElement>('button:not([hidden])');
    window.setTimeout(() => target?.focus({ preventScroll: true }), 30);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.stack.length || raw.capture) return;
    const s = document.getElementById(`screen-${this.top}`);
    if (!s) return;
    if (e.code === 'Escape' || e.code === 'Backspace' || (this.top === 'map' && (e.code === 'KeyM' || e.code === 'Tab'))) {
      e.preventDefault();
      this.back();
      return;
    }
    if (this.top === 'intro') return;
    // no mapa: setas ou WASD arrastam (segurando, continua), Q e E (ou - e +) aproximam, C volta para ele
    if (this.top === 'map' && this.mapView) {
      if (MAP_PAN[e.code]) {
        e.preventDefault();
        this.mapKeys.add(e.code);
        return;
      }
      const v = this.mapView;
      const cv = $<HTMLCanvasElement>('#screen-map canvas');
      const zoom = { KeyQ: 1 / 1.35, Minus: 1 / 1.35, NumpadSubtract: 1 / 1.35, KeyE: 1.35, Equal: 1.35, NumpadAdd: 1.35 }[e.code];
      if (zoom) {
        e.preventDefault();
        v.zoom(zoom, cv.clientWidth, cv.clientHeight);
        return;
      }
      if (e.code === 'KeyC') {
        e.preventDefault();
        v.center();
        return;
      }
      if (e.code === 'KeyF') {
        e.preventDefault();
        v.fit(cv.clientWidth, cv.clientHeight);
        return;
      }
    }
    // na conversa, atacar, pular ou cima também passam a fala
    if (this.top === 'talk') {
      const next = ['attack', 'jump', 'up'].some((a) => settings.codesFor(a as Action).includes(e.code));
      if (next && !e.repeat) {
        e.preventDefault();
        $<HTMLButtonElement>('#screen-talk [data-cmd="next"]').click();
      }
      return;
    }
    if (this.top === 'journal' && (e.code === 'KeyQ' || e.code === 'KeyE')) {
      e.preventDefault();
      this.switchTab(e.code === 'KeyQ' ? -1 : 1);
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active?.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range') return;
    const dir = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, KeyW: -1, KeyS: 1, KeyA: -1, KeyD: 1 }[e.code];
    if (dir === undefined) return;
    e.preventDefault();
    const horizontal = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code);
    this.move(dir, horizontal);
  }

  private back() {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (top.back) top.back();
  }

  private move(dir: number, horizontal: boolean) {
    const s = document.getElementById(`screen-${this.top}`);
    if (!s) return;
    const active = document.activeElement as HTMLElement | null;
    // nas abas, esquerda e direita trocam a aba
    if (horizontal && active?.getAttribute('role') === 'tab') {
      this.switchTab(dir);
      return;
    }
    // no controle, esquerda e direita mexem nos volumes
    if (horizontal && active instanceof HTMLInputElement && active.type === 'range') {
      const v = Math.max(Number(active.min) || 0, Math.min(Number(active.max) || 100, Number(active.value) + dir * 5));
      active.value = String(v);
      active.dispatchEvent(new Event('input', { bubbles: true }));
      audio.sfx('ui');
      return;
    }
    const items = [...s.querySelectorAll<HTMLElement>('button:not([hidden]):not([disabled]), input')].filter((b) => b.offsetParent !== null);
    if (!items.length) return;
    let i = active ? items.indexOf(active) : -1;
    if (i < 0) i = 0;
    else i = (i + dir + items.length) % items.length;
    items[i].focus();
    if (items[i].getAttribute('role') === 'radio') {
      this.picking = true;
      items[i].click();
      this.picking = false;
    }
    audio.sfx('ui');
  }

  private switchTab(dir: number) {
    const s = document.getElementById(`screen-${this.top}`);
    const tabs = s ? [...s.querySelectorAll<HTMLElement>('[role="tab"]')] : [];
    if (!tabs.length) return;
    const i = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    next.click();
    next.focus();
    audio.sfx('ui');
  }

  // navegação de menus pelo controle: direcional ou analógico movem (segurar repete),
  // botão de baixo confirma, o da direita ou Start voltam, L1 e R1 trocam a aba
  private padNav() {
    const p = pad.pad;
    if (!p) {
      this.padPrev = [];
      return;
    }
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    const now = [
      b(BTN.up) || ay < -0.6, b(BTN.down) || ay > 0.6, b(BTN.left) || ax < -0.6, b(BTN.right) || ax > 0.6,
      b(BTN.south), b(BTN.east), b(BTN.start), b(BTN.l1), b(BTN.r1), b(BTN.west), b(BTN.north), b(BTN.select),
    ];
    // sem menu (ou trocando um botão) só acompanha o estado: o Start que abriu a pausa
    // não pode ser lido como um novo toque que já a fecha
    if (!this.stack.length || raw.capture || pad.capturing) {
      this.padPrev = now;
      return;
    }
    const edge = (i: number) => now[i] && !this.padPrev[i];
    const t = performance.now();
    let dir = -1;
    for (let i = 0; i < 4; i++) {
      if (edge(i)) {
        dir = i;
        this.padRepeat = t + 380;
      } else if (now[i] && this.padRepeat && t >= this.padRepeat) {
        dir = i;
        this.padRepeat = t + 110;
      }
    }
    if (!now.slice(0, 4).some(Boolean)) this.padRepeat = 0;
    if (this.top === 'intro') {
      if (now.slice(4).some((v, k) => v && !this.padPrev[k + 4])) this.back();
    } else if (this.top === 'map' && this.mapView) {
      // no mapa o direcional e o analógico arrastam (no laço do mapa), L1 e R1 aproximam, Y volta para
      // ele e X mostra tudo
      const cv = $<HTMLCanvasElement>('#screen-map canvas');
      if (edge(7)) this.mapView.zoom(1 / 1.35, cv.clientWidth, cv.clientHeight);
      if (edge(8)) this.mapView.zoom(1.35, cv.clientWidth, cv.clientHeight);
      if (edge(10)) this.mapView.center();
      if (edge(9)) this.mapView.fit(cv.clientWidth, cv.clientHeight);
      if (edge(5) || edge(6) || edge(11)) this.back();
    } else {
      if (dir === 0) this.move(-1, false);
      if (dir === 1) this.move(1, false);
      if (dir === 2) this.move(-1, true);
      if (dir === 3) this.move(1, true);
      if (edge(4)) (document.activeElement as HTMLElement | null)?.click();
      if (edge(5) || edge(6) || (edge(11) && this.top === 'map')) this.back();
      if (edge(7)) this.switchTab(-1);
      if (edge(8)) this.switchTab(1);
    }
    this.padPrev = now;
  }

  // ---------- carregamento ----------
  loading(p: number) {
    $('#screen-loading .bar i').style.width = `${Math.round(p * 100)}%`;
  }

  loaded() {
    $('#screen-loading').classList.remove('show');
  }

  // ---------- texto de abertura ----------
  // scene: as frases passam uma por vez embaixo, sobre a cena de abertura (sem fundo preto)
  story(lines: string[], done: () => void, opts: { scene?: boolean } = {}) {
    const box = $('#screen-intro .story');
    box.innerHTML = '';
    $('#screen-intro').classList.toggle('scene', !!opts.scene);
    const ps = lines.map((t) => box.appendChild(el('p', '', t)));
    let finished = false;
    const ids: number[] = [];
    const finish = () => {
      if (finished) return;
      finished = true;
      ids.forEach((i) => clearTimeout(i));
      window.removeEventListener('keydown', skipKey, true);
      screen.removeEventListener('pointerdown', finish);
      this.stack = this.stack.filter((e) => e.id !== 'intro');
      done();
      this.refresh();
    };
    const skipKey = (e: KeyboardEvent) => {
      if (this.top === 'intro' && !e.repeat) finish();
    };
    const screen = $('#screen-intro');
    this.push('intro', finish);
    if (opts.scene) {
      const step = 4300;
      ps.forEach((p, i) => {
        ids.push(window.setTimeout(() => p.classList.add('on'), 1600 + i * step));
        ids.push(window.setTimeout(() => p.classList.remove('on'), 1600 + i * step + 3200));
      });
      ids.push(window.setTimeout(finish, 1600 + lines.length * step + 300));
    } else {
      ps.forEach((p, i) => ids.push(window.setTimeout(() => p.classList.add('on'), 700 + i * 2300)));
      ids.push(window.setTimeout(() => ps.forEach((p) => p.classList.remove('on')), 700 + lines.length * 2300 + 1600));
      ids.push(window.setTimeout(finish, 700 + lines.length * 2300 + 3000));
    }
    window.setTimeout(() => {
      window.addEventListener('keydown', skipKey, true);
      screen.addEventListener('pointerdown', finish);
    }, 400);
  }

  // ---------- menu principal ----------
  // notice: aviso curto embaixo do menu (por exemplo, depois de apagar o progresso)
  menu(o: { hasSave: boolean; onContinue: () => void; onNew: () => void; onErase: () => void; notice?: string }) {
    const s = $('#screen-menu');
    const cont = $<HTMLButtonElement>('[data-cmd="continue"]', s);
    const erase = $<HTMLButtonElement>('[data-cmd="erase"]', s);
    const confirm = $('.confirm', s);
    cont.hidden = !o.hasSave;
    erase.hidden = !o.hasSave;
    confirm.hidden = !o.notice;
    confirm.textContent = o.notice ?? '';
    let armed = false;
    cont.onclick = () => o.onContinue();
    $<HTMLButtonElement>('[data-cmd="new"]', s).onclick = () => {
      if (o.hasSave && !armed) {
        armed = true;
        confirm.textContent = 'Começar de novo apaga o progresso salvo. Escolha Novo jogo outra vez para confirmar.';
        confirm.hidden = false;
        return;
      }
      o.onNew();
    };
    $<HTMLButtonElement>('[data-cmd="settings"]', s).onclick = () => this.openSettings();
    erase.onclick = () => this.confirmErase(o.onErase);
    this.stack = [];
    this.push('menu');
  }

  // pergunta antes de apagar tudo (o foco começa em Cancelar)
  private confirmErase(onYes: () => void) {
    const s = $('#screen-erase');
    $<HTMLButtonElement>('[data-cmd="cancel"]', s).onclick = () => this.pop();
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).onclick = () => {
      this.pop();
      onYes();
    };
    this.push('erase', () => this.pop());
  }

  // ---------- escolha da arma ----------
  // has: quais armas já dá para usar (as de chefe aparecem trancadas até vencer o chefe)
  // show: quais aparecem (as de começo que ficaram para trás não aparecem); sub: a frase de cima
  weapons(o: {
    current: WeaponId;
    has: (w: WeaponId) => boolean;
    show?: (w: WeaponId) => boolean;
    title?: string;
    sub: string;
    confirmLabel: string;
    onConfirm: (w: WeaponId) => void;
    onBack: () => void;
  }) {
    const s = $('#screen-weapons');
    const cards = $('.cards', s);
    cards.innerHTML = '';
    $('h2', s).textContent = o.title ?? 'Escolha a sua arma';
    $('.sub', s).textContent = o.sub;
    const list = WEAPON_ORDER.filter((w) => !o.show || o.show(w));
    let sel: WeaponId = o.has(o.current) && list.includes(o.current) ? o.current : (list.find((w) => o.has(w)) ?? 'scythe');
    const items: { id: WeaponId; card: HTMLButtonElement; pv: Preview }[] = [];
    for (const id of list) {
      const W = WEAPONS[id];
      const locked = !o.has(id);
      const card = el('button', locked ? 'card locked' : 'card') as HTMLButtonElement;
      card.setAttribute('role', 'radio');
      card.dataset.w = id;
      card.disabled = locked;
      const pv = this.preview(card.appendChild(el('div', 'view')), `knight-${id}`);
      card.appendChild(el('h3', '', W.name));
      const b = W.boss;
      card.appendChild(el('p', 'tag', b ? (locked ? `Vença ${b.art} ${b.name}` : `Arma d${b.art} ${b.name}`) : TAGS[id] ?? ''));
      card.appendChild(el('p', 'sum', W.summary));
      card.appendChild(this.statsList(id));
      card.onclick = (e) => {
        if (locked) return;
        if (this.confirmsPick(e, sel === id)) return o.onConfirm(sel);
        if (sel !== id) audio.sfx('ui');
        sel = id;
        sync();
      };
      card.ondblclick = () => !locked && o.onConfirm(sel);
      cards.appendChild(card);
      items.push({ id, card, pv });
    }
    const sync = () => {
      for (const it of items) {
        const on = it.id === sel;
        if (on && it.card.getAttribute('aria-checked') !== 'true') it.pv.t0 = performance.now() / 1000;
        it.card.setAttribute('aria-checked', String(on));
      }
    };
    sync();
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).textContent = o.confirmLabel;
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).onclick = () => o.onConfirm(sel);
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => o.onBack();
    this.push('weapons', o.onBack);
    // a arma escolhida ataca, as outras respiram
    this.animate(() => items.map((it) => ({ pv: it.pv, active: it.id === sel, anims: ['attack'] })));
  }

  // Enter ou o botão de baixo do controle na carta já escolhida confirmam (o clique do mouse só
  // escolhe: para confirmar com ele, clique duas vezes)
  private confirmsPick(e: MouseEvent, already: boolean) {
    return already && e.detail === 0 && !this.picking;
  }

  // as barras de dano, velocidade, alcance e corrida de uma arma (ou cajado)
  private statsList(id: WeaponId) {
    const W = WEAPONS[id];
    const dl = el('dl', 'stats');
    const rows = [['Dano', W.stats.dano], ['Velocidade', W.stats.velocidade], ['Alcance', W.stats.alcance], ['Corrida', W.stats.corrida]] as const;
    for (const [label, v] of rows) {
      dl.appendChild(el('dt', '', label));
      const dd = dl.appendChild(el('dd'));
      dd.setAttribute('aria-label', `${v} de 5`);
      for (let k = 0; k < 5; k++) dd.appendChild(el('i', k < v ? 'on' : ''));
    }
    return dl;
  }

  // ---------- prévias animadas ----------
  private preview(box: HTMLElement, sheet: string): Preview {
    const sprite = box.appendChild(el('div', 'sprite'));
    // o quadro do atlas fica num pedaço do tamanho dele, no lugar que ocupava no quadro inteiro
    const cel = sprite.appendChild(el('i'));
    const meta = this.game!.cache.json.get(`${sheet}-meta`) as SheetMeta;
    (meta.frames ? cel : sprite).style.backgroundImage = `url(assets/${sheet}.png)`;
    sprite.classList.toggle('hd', !!meta.frames);
    return { sprite, cel, meta, t0: performance.now() / 1000 };
  }

  // a escolhida faz os golpes da lista, cada um seguido de um respiro; as outras só respiram
  private animate(get: () => { pv: Preview; active: boolean; anims: string[] }[]) {
    cancelAnimationFrame(this.cardLoop);
    const tick = () => {
      const t = performance.now() / 1000;
      for (const { pv, active, anims } of get()) this.drawPreview(pv, this.previewFrame(pv, t, active, anims));
      this.cardLoop = requestAnimationFrame(tick);
    };
    this.cardLoop = requestAnimationFrame(tick);
  }

  private previewFrame(pv: Preview, t: number, active: boolean, anims: string[]) {
    const idle = pv.meta.anims.idle;
    const rest = (ph: number) => idle.start + (Math.floor(ph * idle.fps) % idle.count);
    const segs = active ? anims.map((a) => pv.meta.anims[a]).filter(Boolean) : [];
    if (!segs.length) return rest(t);
    const pause = 1.1;
    const len = segs.reduce((n, a) => n + a.count / a.fps + pause, 0);
    let ph = (t - pv.t0) % len;
    for (const a of segs) {
      const d = a.count / a.fps;
      if (ph < d) return a.start + Math.min(a.count - 1, Math.floor(ph * a.fps));
      ph -= d;
      if (ph < pause) return rest(ph);
      ph -= pause;
    }
    return rest(t);
  }

  private drawPreview(pv: Preview, f: number) {
    const fr = pv.meta.frames?.[String(f)];
    if (fr) {
      // a prévia mostra o mundo em dobro (288x240 para um quadro de 144x120)
      const k = 2 / (pv.meta.scale ?? 1);
      const st = pv.cel.style;
      st.left = `${fr.spriteSourceSize.x * k}px`;
      st.top = `${fr.spriteSourceSize.y * k}px`;
      st.width = `${fr.frame.w * k}px`;
      st.height = `${fr.frame.h * k}px`;
      st.backgroundSize = `${pv.meta.meta!.size.w * k}px auto`;
      st.backgroundPosition = `${-fr.frame.x * k}px ${-fr.frame.y * k}px`;
    } else {
      const cols = pv.meta.columns;
      pv.sprite.style.backgroundPosition = `${-(f % cols) * 288}px ${-Math.floor(f / cols) * 240}px`;
    }
  }

  // ---------- caminho: Cavaleiro ou Mago ----------
  // knight e mage: a arma e o cajado que aparecem nas prévias (os últimos escolhidos)
  path(o: { current: PathId; knight: WeaponId; mage: MageId; onConfirm: (p: PathId) => void; onBack: (p: PathId) => void }) {
    const s = $('#screen-path');
    const cards = $('.path-cards', s);
    cards.innerHTML = '';
    let sel = o.current;
    const defs: { id: PathId; name: string; tag: string; sum: string; points: string[]; sheet: string; anims: string[] }[] = [
      {
        id: 'knight', name: 'Cavaleiro', tag: 'Arma na mão',
        sum: 'O carrasco luta de perto com a arma que escolher. Força, alcance e ritmo mudam de uma arma para outra.',
        points: [
          'Quatro armas para começar: foice, espada, adagas ou arco.',
          'Cada chefe vencido deixa a arma dele para você usar.',
          'Troca de arma no menu de pausa.',
        ],
        sheet: `knight-${o.knight}`, anims: ['attack'],
      },
      {
        id: 'mage', name: 'Mago', tag: 'Cajado e magia',
        sum: 'O mesmo carrasco, agora com um cajado. Um golpe básico de mago e uma habilidade forte, que você mira antes de soltar.',
        points: [
          'Quatro escolas: Eclipse, Necromante, Véu Abissal e Espaço.',
          'A habilidade tem versões para escolher e um tempo de recarga.',
          'Os chefes não deixam arma: deixam Energia, que fortalece a magia.',
        ],
        sheet: `knight-${o.mage}`, anims: ['cast', 'attack'],
      },
    ];
    const items: { id: PathId; card: HTMLButtonElement; pv: Preview; anims: string[] }[] = [];
    for (const d of defs) {
      const card = el('button', `card path-card path-${d.id}`) as HTMLButtonElement;
      card.setAttribute('role', 'radio');
      const pv = this.preview(card.appendChild(el('div', 'view')), d.sheet);
      card.appendChild(el('h3', '', d.name));
      card.appendChild(el('p', 'tag', d.tag));
      card.appendChild(el('p', 'sum', d.sum));
      const ul = card.appendChild(el('ul', 'points'));
      for (const line of d.points) ul.appendChild(el('li', '', line));
      card.onclick = (e) => {
        if (this.confirmsPick(e, sel === d.id)) return o.onConfirm(sel);
        if (sel !== d.id) audio.sfx('ui');
        sel = d.id;
        sync();
      };
      card.ondblclick = () => o.onConfirm(sel);
      cards.appendChild(card);
      items.push({ id: d.id, card, pv, anims: d.anims });
    }
    const sync = () => {
      for (const it of items) {
        const on = it.id === sel;
        if (on && it.card.getAttribute('aria-checked') !== 'true') it.pv.t0 = performance.now() / 1000;
        it.card.setAttribute('aria-checked', String(on));
      }
    };
    sync();
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).onclick = () => o.onConfirm(sel);
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => o.onBack(sel);
    this.push('path', () => o.onBack(sel));
    this.animate(() => items.map((it) => ({ pv: it.pv, active: it.id === sel, anims: it.anims })));
  }

  // ---------- os quatro magos ----------
  // em cima, as quatro escolas; embaixo, a ilustração do cajado e tudo o que o mago faz
  mages(o: { current: MageId; onConfirm: (m: MageId) => void; onBack: (m: MageId) => void }) {
    const s = $('#screen-mages');
    const list = $('.mage-list', s);
    list.innerHTML = '';
    let sel: MageId = MAGE_IDS.includes(o.current) ? o.current : 'eclipse';
    const tabs: { id: MageId; b: HTMLButtonElement }[] = [];
    for (const id of MAGE_IDS) {
      const M = MAGES[id];
      const b = el('button', 'mage-tab') as HTMLButtonElement;
      b.setAttribute('role', 'radio');
      b.style.setProperty('--mc', hex(M.color));
      b.style.setProperty('--mc-soft', rgba(M.color, 0.13));
      const thumb = b.appendChild(el('span', 'thumb'));
      thumb.style.backgroundImage = `url(assets/staff-${id}.webp)`;
      const txt = b.appendChild(el('span', 'txt'));
      txt.append(el('b', '', M.name), el('small', '', M.skill));
      b.onclick = (e) => {
        if (this.confirmsPick(e, sel === id)) return o.onConfirm(sel);
        if (sel !== id) audio.sfx('ui');
        sel = id;
        render();
      };
      b.ondblclick = () => o.onConfirm(sel);
      list.append(b);
      tabs.push({ id, b });
    }
    const art = $('.mage-art', s);
    const img = $<HTMLImageElement>('img', art);
    const credit = $('figcaption', art);
    const view = $('.mage-view', s);
    const info = $('.mage-text', s);
    const stats = $('.mage-stats', s);
    let pv: Preview | null = null;
    const render = () => {
      for (const t of tabs) t.b.setAttribute('aria-checked', String(t.id === sel));
      const M = MAGES[sel];
      const W = WEAPONS[sel];
      s.style.setProperty('--mc', hex(M.color));
      s.style.setProperty('--mc-soft', rgba(M.color, 0.13));
      img.src = `assets/staff-${sel}.webp`;
      img.alt = W.name;
      credit.textContent = M.credit ?? '';
      credit.hidden = !M.credit;
      view.replaceChildren();
      pv = this.preview(view, `knight-${sel}`);
      info.replaceChildren();
      info.append(el('h3', '', M.name), el('p', 'tag', W.name), el('p', 'sum', M.summary));
      const facts = info.appendChild(el('dl', 'facts'));
      facts.append(el('dt', '', 'Golpe básico'), el('dd', '', M.basic));
      const sk = el('dd');
      sk.innerHTML = `<b>${M.skill}</b> · ${this.format('{skill} mira, {up} ou {down} trocam a versão, {attack} solta')}`;
      facts.append(el('dt', '', 'Habilidade'), sk);
      const vl = info.appendChild(el('ul', 'versions'));
      for (const v of M.versions) {
        const li = vl.appendChild(el('li'));
        const head = li.appendChild(el('p', 'v-head'));
        head.append(el('b', '', v.name), el('span', 'cd', `recarga ${v.cd} s`));
        li.appendChild(el('p', 'v-text', v.text));
      }
      stats.replaceChildren(this.statsList(sel));
    };
    render();
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).onclick = () => o.onConfirm(sel);
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => o.onBack(sel);
    this.push('mages', () => o.onBack(sel));
    this.animate(() => (pv ? [{ pv, active: true, anims: ['cast', 'attack'] }] : []));
  }

  // ---------- configurações ----------
  openSettings() {
    const s = $('#screen-settings');
    const tabs = [...s.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const show = (name: string) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      s.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
    };
    tabs.forEach((t) => (t.onclick = () => show(t.dataset.tab!)));
    show(pad.device === 'pad' ? 'pad' : 'controls');
    s.querySelectorAll<HTMLInputElement>('input[name="scheme"]').forEach((r) => {
      r.checked = r.value === settings.data.scheme;
      r.onchange = () => {
        settings.data.scheme = r.value === 'click' ? 'click' : 'keyboard';
        settings.save();
      };
    });
    s.querySelectorAll<HTMLInputElement>('input[data-vol]').forEach((inp) => {
      const k = inp.dataset.vol as 'volume' | 'music' | 'sfx';
      inp.value = String(Math.round(settings.data[k] * 100));
      inp.oninput = () => {
        settings.data[k] = Number(inp.value) / 100;
        settings.save();
      };
    });
    $<HTMLButtonElement>('[data-cmd="reset"]', s).onclick = () => {
      settings.resetBinds();
      s.querySelectorAll<HTMLInputElement>('input[name="scheme"]').forEach((r) => (r.checked = r.value === 'keyboard'));
      this.renderBinds();
    };
    $<HTMLButtonElement>('[data-cmd="reset-pad"]', s).onclick = () => {
      settings.resetPad();
      this.renderPad();
    };
    s.querySelectorAll<HTMLInputElement>('input[name="quality"]').forEach((r) => {
      r.checked = r.value === settings.data.quality;
      r.onchange = () => {
        settings.data.quality = r.value as Quality;
        settings.save();
        if (this.game) applyRes(this.game, resFor(settings.data.quality));
        this.renderQuality();
      };
    });
    this.renderQuality();
    this.bindGraphics(s);
    const vib = $<HTMLInputElement>('input[data-opt="vibration"]', s);
    vib.checked = settings.data.vibration;
    vib.onchange = () => {
      settings.data.vibration = vib.checked;
      settings.save();
      if (vib.checked) pad.rumble(0.45, 0.45, 160);
    };
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => this.pop();
    this.renderBinds();
    this.renderPad();
    this.push('settings', () => this.pop());
  }

  // predefinição gráfica e cada ajuste à parte (valem na hora, na sala atual)
  private bindGraphics(s: HTMLElement) {
    const radios = [...s.querySelectorAll<HTMLInputElement>('input[name="gfx"]')];
    const boxes = [...s.querySelectorAll<HTMLInputElement>('input[data-gfx]')];
    const picks = [...s.querySelectorAll<HTMLSelectElement>('select[data-gfx]')];
    const fps = $<HTMLSelectElement>('select[data-opt="fps"]', s);
    const render = () => {
      const f = settings.data.gfx;
      const p = presetOf(f);
      radios.forEach((r) => (r.checked = r.value === p));
      boxes.forEach((b) => (b.checked = !!f[b.dataset.gfx as keyof GfxFlags]));
      picks.forEach((sel) => (sel.value = String(f[sel.dataset.gfx as keyof GfxFlags])));
      fps.value = String(settings.data.fps);
      const forced = FORCED_PRESET ? ` O endereço fixou ${PRESET_LABEL[FORCED_PRESET]} nesta sessão.` : '';
      // sem WebGL o Phaser desenha no Canvas: luz, sombra, névoa, reflexo e brilho não existem lá
      const canvasOnly = this.game?.renderer.type === 1 /* Phaser.CANVAS */ ? ' Este navegador está sem WebGL: aqui só o visual do Performance funciona.' : '';
      $('#screen-settings .gfx-note').textContent = (p ? `Em uso: ${PRESET_LABEL[p]}.` : 'Em uso: ajustes personalizados.') + forced + canvasOnly;
    };
    radios.forEach((r) => {
      r.onchange = () => {
        settings.data.gfx = { ...PRESETS[r.value as Preset] };
        settings.save();
        render();
      };
    });
    boxes.forEach((b) => {
      b.onchange = () => {
        settings.data.gfx = { ...settings.data.gfx, [b.dataset.gfx as keyof GfxFlags]: b.checked };
        settings.save();
        render();
      };
    });
    picks.forEach((sel) => {
      sel.onchange = () => {
        settings.data.gfx = { ...settings.data.gfx, [sel.dataset.gfx as keyof GfxFlags]: Number(sel.value) as Level3 };
        settings.save();
        render();
      };
    });
    fps.onchange = () => {
      settings.data.fps = Number(fps.value) as FpsLimit;
      settings.save();
      if (this.game) applyFpsLimit(this.game.loop as unknown as Parameters<typeof applyFpsLimit>[0], settings.data.fps);
    };
    render();
  }

  // resolução em uso agora (a automática pode ter baixado sozinha)
  private renderQuality() {
    const note = $('#screen-settings .quality-note');
    note.textContent = RES === 1 ? 'Agora a tela está na resolução leve.' : `Agora a tela está nítida (${RES} pixels por pixel do jogo).`;
  }

  private renderBinds() {
    const body = $('#screen-settings .binds tbody');
    body.innerHTML = '';
    for (const a of ACTIONS) {
      const tr = body.appendChild(el('tr'));
      tr.appendChild(el('th', '', ACTION_LABEL[a]));
      for (let slot = 0; slot < 2; slot++) {
        const td = tr.appendChild(el('td'));
        const code = settings.data.binds[a][slot];
        const b = td.appendChild(el('button', code ? 'key' : 'key empty', code ? codeName(code) : '—')) as HTMLButtonElement;
        b.setAttribute('aria-label', `${ACTION_LABEL[a]}, tecla ${slot + 1}: ${code ? codeName(code) : 'nenhuma'}`);
        b.onclick = () => {
          if (raw.capture) return;
          b.classList.add('wait');
          b.textContent = 'Aperte uma tecla';
          raw.startCapture((c) => {
            if (c === 'Delete') settings.unbind(a, slot);
            else if (c) settings.bind(a, slot, c);
            this.renderBinds();
            const again = body.querySelectorAll<HTMLButtonElement>('.key')[ACTIONS.indexOf(a) * 2 + slot];
            again?.focus({ preventScroll: true });
          });
        };
      }
    }
  }

  private renderPadStatus() {
    const st = $('#screen-settings .pad-status');
    const on = pad.connected;
    st.classList.toggle('off', !on);
    st.textContent = on
      ? `Conectado: ${pad.name} (${BRAND_LABEL[pad.brand]})`
      : 'Nenhum controle encontrado. Conecte por cabo ou Bluetooth e aperte qualquer botão.';
    const g = (i: number) => buttonGlyph(i, pad.brand);
    $('#screen-settings .pad-note').innerHTML =
      `Nos menus: ${g(BTN.south)} confirma, ${g(BTN.east)} volta, ${g(BTN.l1)} e ${g(BTN.r1)} trocam a aba. ` +
      `Para trocar um botão, escolha a ação e aperte o novo; Start cancela.` +
      (on && !pad.standard ? ' Este controle não usa o mapeamento padrão do navegador: se algum botão vier trocado, ajuste acima.' : '');
  }

  // aba Controle: ações com dois botões cada, mais as que ficam fixas no analógico
  private renderPad() {
    const body = $('#screen-settings .pad-binds tbody');
    const brand = pad.brand;
    this.padBrandShown = brand;
    const focused = [...body.querySelectorAll('.key')].indexOf(document.activeElement as Element);
    body.innerHTML = '';
    const label = (i: number) => `${buttonGlyph(i, brand)}<span>${buttonName(i, brand)}</span>`;
    const fixed = (name: string, html: string) => {
      const tr = body.appendChild(el('tr'));
      tr.appendChild(el('th', '', name));
      const td = tr.appendChild(el('td'));
      td.colSpan = 2;
      const k = td.appendChild(el('span', 'key fixed'));
      k.innerHTML = html;
    };
    fixed('Andar', `${stickGlyph('x')}<span>Analógico</span>${buttonGlyph(BTN.left, brand)}<span>ou direcional</span>`);
    fixed('Olhar para cima e atacar para baixo', `${stickGlyph('y')}<span>Analógico</span>${buttonGlyph(BTN.up, brand)}<span>ou direcional</span>`);
    for (const a of PAD_ACTIONS) {
      const tr = body.appendChild(el('tr'));
      tr.appendChild(el('th', '', ACTION_LABEL[a]));
      for (let slot = 0; slot < 2; slot++) {
        const td = tr.appendChild(el('td'));
        const btn = settings.data.pad[a][slot];
        const b = td.appendChild(el('button', btn === undefined ? 'key empty' : 'key')) as HTMLButtonElement;
        if (btn === undefined) b.textContent = '—';
        else b.innerHTML = label(btn);
        b.setAttribute('aria-label', `${ACTION_LABEL[a]}, botão ${slot + 1}: ${btn === undefined ? 'nenhum' : buttonName(btn, brand)}`);
        b.onclick = () => {
          if (raw.capture || pad.capturing) return;
          b.classList.add('wait');
          b.textContent = 'Aperte um botão no controle';
          const refocus = () => {
            this.renderPad();
            body.querySelectorAll<HTMLButtonElement>('button.key')[PAD_ACTIONS.indexOf(a) * 2 + slot]?.focus({ preventScroll: true });
          };
          // no teclado: Esc cancela, Delete apaga o botão
          raw.startCapture((code) => {
            if (!pad.capturing) return;
            pad.capturing = null;
            if (code === 'Delete') settings.padUnbind(a, slot);
            refocus();
          });
          pad.capture((n) => {
            raw.capture = null;
            if (n !== null) settings.padBind(a, slot, n);
            refocus();
          });
        };
      }
    }
    fixed('Pausa', `${buttonGlyph(BTN.start, brand)}<span>${buttonName(BTN.start, brand)}</span>`);
    this.renderPadStatus();
    if (focused >= 0) body.querySelectorAll<HTMLElement>('.key')[focused]?.focus({ preventScroll: true });
  }

  // ---------- pausa e fim ----------
  pause(o: { onResume: () => void; onMap?: () => void; onInventory: () => void; onJournal?: () => void; onWeapon?: () => void; onTitle: () => void }) {
    const s = $('#screen-pause');
    const jBtn = $<HTMLButtonElement>('[data-cmd="journal"]', s);
    jBtn.hidden = !o.onJournal;
    jBtn.onclick = () => o.onJournal?.();
    $<HTMLButtonElement>('[data-cmd="resume"]', s).onclick = () => o.onResume();
    const mapBtn = $<HTMLButtonElement>('[data-cmd="map"]', s);
    mapBtn.hidden = !o.onMap;
    mapBtn.onclick = () => o.onMap?.();
    $<HTMLButtonElement>('[data-cmd="inventory"]', s).onclick = () => o.onInventory();
    $<HTMLButtonElement>('[data-cmd="settings"]', s).onclick = () => this.openSettings();
    // o mago não troca de cajado no caminho: a escolha da escola vale para o jogo inteiro
    const wBtn = $<HTMLButtonElement>('[data-cmd="weapon"]', s);
    wBtn.hidden = !o.onWeapon;
    wBtn.onclick = () => o.onWeapon?.();
    $<HTMLButtonElement>('[data-cmd="title"]', s).onclick = () => o.onTitle();
    this.push('pause', o.onResume);
  }

  end(o: { onExplore: () => void; onTitle: () => void; title?: string; text?: string }) {
    this.clearTexts();
    const s = $('#screen-end');
    $('.end-title', s).textContent = o.title ?? 'Fim do prólogo';
    $('.end-text', s).textContent =
      o.text ?? 'Uma rachadura da máscara foi selada com ouro. Ele ainda não lembra o próprio nome, mas lembra de alguém esperando no vale.';
    $<HTMLButtonElement>('[data-cmd="explore"]', s).onclick = () => o.onExplore();
    $<HTMLButtonElement>('[data-cmd="title"]', s).onclick = () => o.onTitle();
    this.push('end', o.onExplore);
  }

  // ---------- mapa e inventário ----------
  private mapLoop = 0;
  private mapView: MapView | null = null;
  private mapKeys = new Set<string>();
  private mapBound = false;
  // dedos (ou o mouse) apertados no mapa: um arrasta, dois aproximam
  private mapPins = new Map<number, { x: number; y: number }>();

  map(o: MapHere & { onClose: () => void }) {
    const s = $('#screen-map');
    $('.map-room', s).textContent = ROOMS[o.room].title;
    $<HTMLButtonElement>('[data-cmd="close"]', s).onclick = () => o.onClose();
    // relíquias, memórias e trocas
    const rel = $('.map-relics', s);
    rel.replaceChildren();
    for (const a of ABILITIES) {
      const li = el('li');
      if (progress.abilities.has(a)) {
        const info = relicInfo(a, progress.knowsHerName);
        li.append(el('b', '', info.name), el('span', 'how'));
        $('.how', li).innerHTML = this.format(info.how);
      } else li.append(el('span', 'unknown', 'Ainda não encontrada'));
      rel.append(li);
    }
    $('.map-mem-count', s).textContent = `${progress.memories.size} de ${MEMORY_TOTAL}`;
    const mem = $('.map-memories', s);
    mem.replaceChildren();
    for (const id of progress.memories) {
      const info = MEMORIES[id];
      if (!info) continue;
      const li = el('li', progress.traded.has(id) ? 'forgotten' : '');
      if (progress.traded.has(id)) li.append(el('b', '', info.title), el('span', 'how', 'Trocada com o Cobrador. Esquecida.'));
      else li.append(el('b', '', info.title), el('span', 'how', info.text));
      mem.append(li);
    }
    if (!progress.memories.size) mem.append(el('li', 'unknown', 'Nenhuma ainda'));
    const up = $('.map-upgrades', s);
    up.replaceChildren();
    for (const off of OFFERS) {
      if (!progress.upgrades.has(off.id)) continue;
      const on = progress.on(off.id);
      const li = el('li', on ? '' : 'stored');
      li.append(el('b', '', off.name), el('span', 'how', on ? `Equipado. ${off.text}` : 'Guardado no inventário.'));
      up.append(li);
    }
    const echo = progress.echo;
    $('.map-coins', s).textContent = plural(progress.coins, 'moeda', 'moedas') + (echo ? ` · ${echo.coins} com a sombra` : '');
    $<HTMLElement>('.lg-echo', s).hidden = !echo;
    if (!progress.upgrades.size) up.append(el('li', 'unknown', 'Nenhum'));
    const cv = $<HTMLCanvasElement>('canvas', s);
    const view = new MapView(o);
    this.mapView = view;
    this.mapKeys.clear();
    this.mapPins.clear();
    this.bindMap(cv);
    const size = () => [cv.clientWidth, cv.clientHeight] as const;
    const tool = (cmd: string, fn: () => void) => {
      const b = $<HTMLButtonElement>(`.map-tools [data-cmd="${cmd}"]`, s);
      b.disabled = view.empty;
      b.onclick = fn;
    };
    tool('zoom-out', () => view.zoom(1 / 1.35, ...size()));
    tool('zoom-in', () => view.zoom(1.35, ...size()));
    tool('center', () => view.center());
    tool('fit', () => view.fit(...size()));
    $<HTMLButtonElement>('.map-tools [data-cmd="center"]', s).disabled = !view.hereMapped;
    this.push('map', o.onClose);
    // a primeira tecla do mapa é o Fechar (as do mapa mexem nele, não no foco)
    window.setTimeout(() => $<HTMLButtonElement>('[data-cmd="close"]', s).focus({ preventScroll: true }), 40);
    // desenha a cada quadro (arrastar, aproximar e o anel pulsando); precisa do tamanho do canvas
    cancelAnimationFrame(this.mapLoop);
    let last = performance.now();
    const draw = (t: number) => {
      if (this.top !== 'map' || this.mapView !== view) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const dpr = window.devicePixelRatio || 1;
      const [w, h] = size();
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      // arrastar segurando as setas, o direcional ou o analógico
      let dx = 0;
      let dy = 0;
      for (const k of this.mapKeys) {
        const d = MAP_PAN[k];
        if (d) {
          dx += d[0];
          dy += d[1];
        }
      }
      const p = pad.pad;
      if (p) {
        const ax = p.axes[0] ?? 0;
        const ay = p.axes[1] ?? 0;
        if (Math.abs(ax) > 0.2) dx -= ax;
        if (Math.abs(ay) > 0.2) dy -= ay;
        if (p.buttons[BTN.left]?.pressed) dx += 1;
        if (p.buttons[BTN.right]?.pressed) dx -= 1;
        if (p.buttons[BTN.up]?.pressed) dy += 1;
        if (p.buttons[BTN.down]?.pressed) dy -= 1;
      }
      if (dx || dy) view.pan(dx * 520 * dt, dy * 520 * dt);
      const ctx = cv.getContext('2d')!;
      view.draw(ctx, w, h, dpr, t);
      this.mapLoop = requestAnimationFrame(draw);
    };
    this.mapLoop = requestAnimationFrame(draw);
  }

  // arrastar com o mouse ou o dedo, a roda aproxima no cursor e dois dedos aproximam
  private bindMap(cv: HTMLCanvasElement) {
    if (this.mapBound) return;
    this.mapBound = true;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener(
      'wheel',
      (e) => {
        const v = this.mapView;
        if (!v || this.top !== 'map') return;
        e.preventDefault();
        const p = local(e);
        v.zoom(Math.pow(1.0015, -e.deltaY), cv.clientWidth, cv.clientHeight, p.x, p.y);
      },
      { passive: false },
    );
    cv.addEventListener('pointerdown', (e) => {
      if (!this.mapView || this.top !== 'map') return;
      cv.setPointerCapture(e.pointerId);
      this.mapPins.set(e.pointerId, local(e));
    });
    cv.addEventListener('pointermove', (e) => {
      const v = this.mapView;
      const prev = this.mapPins.get(e.pointerId);
      if (!v || !prev || this.top !== 'map') return;
      const p = local(e);
      if (this.mapPins.size >= 2) {
        const other = [...this.mapPins.entries()].find(([id]) => id !== e.pointerId)![1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(p.x - other.x, p.y - other.y);
        if (d0 > 4) v.zoom(d1 / d0, cv.clientWidth, cv.clientHeight, (p.x + other.x) / 2, (p.y + other.y) / 2);
      } else v.pan(p.x - prev.x, p.y - prev.y);
      this.mapPins.set(e.pointerId, p);
    });
    const up = (e: PointerEvent) => this.mapPins.delete(e.pointerId);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  // ---------- inventário ----------
  // itens do Cobrador que se ligam e desligam (3 espaços), as armas e as relíquias
  inventory(o: { toggle: (id: Upgrade) => 'on' | 'off' | 'full' | 'missing'; choosePower: (id: PowerId) => boolean; onBack: () => void }) {
    const s = $('#screen-inventory');
    const grid = $('.inv-items', s);
    const msg = $('.inv-msg', s);
    msg.textContent = '';
    const render = (focusId?: Upgrade) => {
      const used = progress.slotsUsed;
      const pips = $('.inv-slots .pips', s);
      const slots = progress.slots;
      pips.replaceChildren(...Array.from({ length: slots }, (_, k) => el('i', k < used ? 'on' : '')));
      $('.inv-slots .count', s).textContent = `${used} de ${slots}`;
      $('.inv-slots', s).setAttribute('aria-label', `Espaços usados: ${used} de ${slots}`);
      grid.replaceChildren();
      for (const off of OFFERS) {
        const owned = progress.upgrades.has(off.id);
        // os achados de uma região só aparecem depois que ele pisa lá
        if (off.region && !owned && !progress.visited.has(off.region)) continue;
        const on = progress.on(off.id);
        const b = el('button', `inv-item${on ? ' on' : ''}${owned ? '' : ' missing'}`) as HTMLButtonElement;
        b.dataset.id = off.id;
        b.disabled = !owned;
        b.setAttribute('aria-pressed', String(on));
        const icon = el('img') as HTMLImageElement;
        icon.src = `assets/item-${off.id}.png`;
        icon.alt = '';
        const cost = el('span', 'inv-cost');
        cost.setAttribute('aria-label', slotText(off.slots));
        for (let k = 0; k < off.slots; k++) cost.append(el('i'));
        const text = el('span', 'inv-text');
        text.append(el('b', '', off.name), el('span', 'what', owned ? off.text : off.missing ?? 'Ainda não tem. O Cobrador vende.'));
        b.append(icon, text, cost, el('span', 'inv-state', !owned ? '' : on ? 'Equipado' : 'Guardado'));
        b.onclick = () => {
          const r = o.toggle(off.id);
          if (r === 'full') {
            const need = off.slots - (progress.slots - progress.slotsUsed);
            msg.textContent = `Não cabe: falta ${plural(need, 'espaço', 'espaços')}. Guarde outro item primeiro.`;
            const box = $('.inv-slots', s);
            box.classList.remove('shake');
            void box.offsetWidth;
            box.classList.add('shake');
            audio.sfx('thunk');
            return;
          }
          if (r === 'missing') return;
          msg.textContent = r === 'on' ? `${off.name}: equipado.` : `${off.name}: guardado.`;
          render(off.id);
        };
        grid.append(b);
      }
      if (focusId) grid.querySelector<HTMLButtonElement>(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
    };
    render();
    // poderes de memória: um escolhido por vez (o botão de memória usa o escolhido)
    const pw = $('.inv-powers-wrap', s);
    const pl = $('.inv-powers', s);
    const renderPowers = (focusId?: PowerId) => {
      pw.hidden = progress.powers.size === 0;
      $('.inv-powers-how', s).innerHTML = this.format('{memory} usa o escolhido · as contas de Âmbar enchem a cada golpe que entra');
      pl.replaceChildren();
      for (const id of POWER_IDS) {
        const P = POWERS[id];
        const known = progress.powers.has(id);
        const on = known && progress.power === id;
        const b = el('button', `inv-item inv-power${on ? ' on' : ''}${known ? '' : ' missing'}`) as HTMLButtonElement;
        b.dataset.id = id;
        b.disabled = !known;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(on));
        const icon = el('img') as HTMLImageElement;
        icon.src = `assets/power-${id}.png`;
        icon.alt = '';
        const cost = el('span', 'inv-cost');
        cost.setAttribute('aria-label', `${P.cost} ${P.cost === 1 ? 'conta' : 'contas'} de Âmbar`);
        for (let k = 0; k < P.cost; k++) cost.append(el('i'));
        const text = el('span', 'inv-text');
        text.append(el('b', '', P.name), el('span', 'what', known ? P.text : P.how));
        b.append(icon, text, cost, el('span', 'inv-state', !known ? '' : on ? 'Escolhido' : 'Lembrado'));
        b.onclick = () => {
          if (!o.choosePower(id)) return;
          msg.textContent = `${P.name}: escolhido.`;
          audio.sfx('equip');
          renderPowers(id);
        };
        pl.append(b);
      }
      if (focusId) pl.querySelector<HTMLButtonElement>(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
    };
    renderPowers();
    // armas: a que está em uso, as liberadas e as de chefe ainda trancadas
    const wl = $('.inv-weapons', s);
    wl.replaceChildren();
    const mage = progress.mage;
    $('.inv-weapons-head', s).innerHTML = mage
      ? 'Cajado e Energia <span>cada chefe vencido fortalece a magia</span>'
      : 'Armas <span>troque em Trocar arma</span>';
    if (mage) {
      const li = el('li');
      li.append(el('b', '', WEAPONS[mage].name), el('span', 'how', 'em uso'));
      wl.append(li);
    }
    for (const id of WEAPON_IDS) {
      if (mage) {
        // o mago não pega a arma do chefe: fica com a Energia dele
        const b = WEAPONS[id].boss;
        if (!b) continue;
        const got = progress.claimed(id);
        const li = el('li', got ? '' : 'unknown');
        if (got) li.append(el('b', '', `Energia d${b.art} ${b.name}`), el('span', 'how', id === 'picareta' ? 'a magia ficou mais forte e quebra o Âmbar' : 'a magia ficou mais forte'));
        else li.append(el('b', '', 'Energia trancada'), el('span', 'how', `vença ${b.art} ${b.name}`));
        wl.append(li);
        continue;
      }
      const W = WEAPONS[id];
      const has = progress.hasWeapon(id);
      // as armas de começo que ele não escolheu ficaram para trás: nem aparecem
      if (!has && !W.boss) continue;
      const li = el('li', has ? '' : 'unknown');
      const b = W.boss;
      if (has) li.append(el('b', '', W.name), el('span', 'how', id === settings.data.weapon ? 'em uso' : 'liberada'));
      else li.append(el('b', '', 'Arma trancada'), el('span', 'how', b ? `vença ${b.art} ${b.name}` : 'vença o chefe'));
      wl.append(li);
    }
    // os espaços a mais: o Elo da arena, o bornal e o cinto das Minas (os de uma região, depois de pisar lá)
    const extra = $('.inv-extra', s);
    extra.replaceChildren();
    const SLOT_INFO: Record<SlotFind, { name: string; text: string; region: RoomId }> = { elo: { ...ELO, region: 'arena' }, ...SLOT_FINDS };
    for (const id of SLOT_IDS) {
      const info = SLOT_INFO[id];
      const has = progress.seen.has(`item:${id}`);
      if (!has && !progress.visited.has(info.region)) continue;
      const li = el('li', has ? '' : 'unknown');
      if (has) li.append(el('b', '', info.name), el('span', 'how', 'mais um espaço'));
      else li.append(el('span', 'unknown', 'Ainda não encontrado'));
      extra.append(li);
    }
    $<HTMLElement>('.inv-extra-wrap', s).hidden = !extra.children.length;
    const rel = $('.inv-relics', s);
    rel.replaceChildren();
    for (const a of ABILITIES) {
      const li = el('li');
      if (progress.abilities.has(a)) {
        const info = relicInfo(a, progress.knowsHerName);
        li.append(el('b', '', info.name), el('span', 'how'));
        $('.how', li).innerHTML = this.format(info.how);
      } else li.append(el('span', 'unknown', 'Ainda não encontrada'));
      rel.append(li);
    }
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => o.onBack();
    this.push('inventory', o.onBack);
  }

  // ---------- o Cobrador ----------
  // buy: 'on' entrou equipado, 'stored' foi para o inventário (não cabia), false não deu para comprar
  shop(o: { first: boolean; buy: (id: Upgrade) => 'on' | 'stored' | false; onClose: () => void }) {
    const s = $('#screen-shop');
    const quote = $('.quote', s);
    const coinPrices = OFFERS.filter((f) => f.pay === 'coin' && !progress.upgrades.has(f.id)).map((f) => f.cost);
    const canPay = progress.held > 0 || (coinPrices.length > 0 && progress.coins >= Math.min(...coinPrices));
    quote.textContent = o.first
      ? 'Toda memória tem um preço. Eu compro as suas. Moedas também servem, para quem ainda quer lembrar.'
      : canPay
        ? COBRADOR_LINES[Math.floor(Math.random() * COBRADOR_LINES.length)]
        : 'Mãos vazias. Volte com alguma coisa que doa perder.';
    $<HTMLButtonElement>('[data-cmd="close"]', s).onclick = () => o.onClose();
    const list = $('.offers', s);
    const render = (focusId?: Upgrade) => {
      $('.shop-held', s).textContent = plural(progress.held, 'memória', 'memórias');
      $('.shop-coins', s).textContent = plural(progress.coins, 'moeda', 'moedas');
      list.replaceChildren();
      // duas colunas: o que se paga com memória (esquecida para sempre) e o que se paga com moeda
      for (const pay of ['memory', 'coin'] as const) {
        const col = el('div', 'offer-col');
        col.append(el('h3', 'offer-group', pay === 'memory' ? 'Por memórias' : 'Por moedas'));
        for (const off of OFFERS.filter((f) => f.pay === pay)) {
          const b = el('button', 'offer');
          const owned = progress.upgrades.has(off.id);
          const afford = pay === 'memory' ? progress.held >= off.cost : progress.coins >= off.cost;
          b.disabled = owned || !afford;
          b.dataset.id = off.id;
          const cost = el('span', pay === 'memory' ? 'cost' : 'cost coins');
          if (pay === 'memory') for (let i = 0; i < off.cost; i++) cost.append(el('i'));
          else cost.append(el('i'), el('span', '', String(off.cost)));
          const done = pay === 'memory' ? 'Já trocado' : 'Já comprado';
          const what = el('span', 'what', owned ? `${done}. Está no inventário.` : `${off.text} `);
          if (!owned) what.append(el('span', 'slots', `${slotText(off.slots)}.`));
          b.append(el('b', '', off.name), what, cost);
          b.onclick = () => {
            const r = o.buy(off.id);
            if (!r) return;
            if (r === 'stored') quote.textContent = 'Não cabe mais nada em você. Guardei no inventário: troque quando quiser.';
            else quote.textContent = pay === 'memory' ? 'Feito. Já nem lembra, não é?' : 'Moeda é moeda. Volte quando tiver mais.';
            render(off.id);
          };
          col.append(b);
        }
        list.append(col);
      }
      const next = [...list.querySelectorAll<HTMLButtonElement>('button:not([disabled])')][0];
      const target = focusId ? next ?? $<HTMLButtonElement>('[data-cmd="close"]', s) : null;
      target?.focus({ preventScroll: true });
    };
    render();
    this.push('shop', o.onClose);
  }

  // ---------- o Agrimensor: as folhas do mapa ----------
  // buy: true quando comprou (o jogo cobra e grava); sheets vem na ordem do caminho
  surveyor(o: { quote: string; sheets: RegionDef[]; current: RegionId; lines: { broke: string; bought: string; done: string }; buy: (id: RegionId) => boolean; onClose: () => void }) {
    const s = $('#screen-surveyor');
    const quote = $('.quote', s);
    quote.textContent = o.quote;
    $<HTMLButtonElement>('[data-cmd="close"]', s).onclick = () => o.onClose();
    const list = $('.sheets', s);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // a folha da região de agora primeiro, depois as de antes (da mais perto para a mais longe)
    const order = [...o.sheets].reverse();
    const render = (focusId?: RegionId) => {
      $('.survey-coins', s).textContent = plural(progress.coins, 'moeda', 'moedas');
      list.replaceChildren();
      for (const r of order) {
        const owned = progress.maps.has(r.id);
        const b = el('button', owned ? 'offer sheet owned' : 'offer sheet');
        b.dataset.id = r.id;
        b.disabled = owned || progress.coins < r.price;
        const thumb = regionThumb(r, 136, 64, dpr);
        const name = r.id === o.current ? `${r.name} · aqui` : r.name;
        const cost = el('span', owned ? 'cost' : 'cost coins');
        if (owned) cost.append(el('span', '', 'Já comprada'));
        else cost.append(el('i'), el('span', '', String(r.price)));
        b.append(thumb, el('b', '', name), el('span', 'what', r.blurb), cost);
        b.onclick = () => {
          if (!o.buy(r.id)) {
            quote.textContent = o.lines.broke;
            return;
          }
          quote.textContent = order.every((x) => progress.maps.has(x.id)) ? `${o.lines.bought} ${o.lines.done}` : o.lines.bought;
          render(r.id);
        };
        list.append(b);
      }
      const next = [...list.querySelectorAll<HTMLButtonElement>('button:not([disabled])')][0];
      const target = focusId ? next ?? $<HTMLButtonElement>('[data-cmd="close"]', s) : null;
      target?.focus({ preventScroll: true });
    };
    render();
    this.push('surveyor', o.onClose);
  }

  // ---------- conversa ----------
  // as falas aparecem letra por letra; o botão (ou atacar, pular, cima) completa a fala ou passa
  // para a próxima. Esc pula a conversa inteira.
  private typeTimer = 0;

  talk(o: { name: string; lines: string[]; onDone: () => void }) {
    const s = $('#screen-talk');
    const text = $('.talk-text', s);
    const step = $('.talk-step', s);
    const next = $<HTMLButtonElement>('[data-cmd="next"]', s);
    $('.talk-name', s).textContent = o.name;
    let i = 0;
    let shown = 0;
    let done = false;
    const line = () => o.lines[i] ?? '';
    const show = () => {
      shown = 0;
      text.textContent = '';
      step.textContent = o.lines.length > 1 ? `${i + 1} / ${o.lines.length}` : '';
      next.textContent = i < o.lines.length - 1 ? 'Continuar' : 'Fechar';
      clearInterval(this.typeTimer);
      this.typeTimer = window.setInterval(() => {
        shown = Math.min(line().length, shown + 2);
        text.textContent = line().slice(0, shown);
        if (shown >= line().length) clearInterval(this.typeTimer);
      }, 26);
    };
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(this.typeTimer);
      s.onpointerdown = null;
      this.stack = this.stack.filter((e) => e.id !== 'talk');
      this.refresh();
      o.onDone();
    };
    next.onclick = (e) => {
      e.stopPropagation();
      if (shown < line().length) {
        clearInterval(this.typeTimer);
        shown = line().length;
        text.textContent = line();
        return;
      }
      if (++i >= o.lines.length) {
        finish();
        return;
      }
      audio.sfx('ui');
      show();
    };
    // tocar na caixa também passa
    s.onpointerdown = (e) => {
      if ((e.target as HTMLElement).closest('.talk-box')) next.click();
    };
    this.push('talk', finish);
    show();
  }

  // ---------- ferreiro ----------
  // upgrade: true quando subiu de nível (o jogo cobra e grava)
  forge(o: { first: boolean; quote: string; upgrade: (w: WeaponId) => string | false; onClose: () => void }) {
    const s = $('#screen-forge');
    const quote = $('.quote', s);
    quote.textContent = o.quote;
    $<HTMLButtonElement>('[data-cmd="close"]', s).onclick = () => o.onClose();
    const list = $('.forge-list', s);
    const render = (focusId?: WeaponId) => {
      $('.forge-coins', s).textContent = plural(progress.coins, 'moeda', 'moedas');
      list.replaceChildren();
      for (const id of [...WEAPON_ORDER, ...MAGE_IDS]) {
        if (!progress.hasWeapon(id)) continue;
        const W = WEAPONS[id];
        const lv = progress.level(id);
        const b = el('button', 'offer forge-row') as HTMLButtonElement;
        b.dataset.id = id;
        const pips = el('span', 'pips');
        pips.setAttribute('aria-label', `Nível ${lv} de ${MAX_LEVEL}`);
        for (let k = 0; k < MAX_LEVEL; k++) pips.append(el('i', k < lv ? 'on' : ''));
        const what = el('span', 'what');
        let can = false;
        let cost: HTMLElement | null = null;
        if (lv >= MAX_LEVEL) what.textContent = `Nível máximo: dano +${Math.round((LEVEL_MUL[lv] - 1) * 100)}%.`;
        else {
          const c = FORGE[lv];
          const mat = c.material ? MATERIALS[c.material] : null;
          const hasMat = !mat || progress.seen.has(mat.has);
          can = hasMat && progress.coins >= c.coins;
          what.textContent = `Nível ${lv + 1}: dano +${Math.round((LEVEL_MUL[lv + 1] - 1) * 100)}%. `;
          if (mat) what.append(el('span', hasMat ? '' : 'need', hasMat ? `Usa o ${mat.name}.` : `Precisa do ${mat.name}: ${mat.how}.`));
          cost = el('span', 'cost coins');
          cost.append(el('i'), el('span', '', String(c.coins)));
        }
        b.disabled = !can;
        b.append(el('b', '', W.name), pips, what);
        if (cost) b.append(cost);
        b.onclick = () => {
          const r = o.upgrade(id);
          if (!r) return;
          quote.textContent = r;
          render(id);
        };
        list.append(b);
      }
      if (focusId) {
        const again = list.querySelector<HTMLButtonElement>(`[data-id="${focusId}"]:not([disabled])`);
        (again ?? list.querySelector<HTMLButtonElement>('button:not([disabled])') ?? $<HTMLButtonElement>('[data-cmd="close"]', s)).focus({ preventScroll: true });
      }
    };
    render();
    this.push('forge', o.onClose);
  }

  // ---------- diário ----------
  journal(o: { onBack: () => void }) {
    const s = $('#screen-journal');
    const tabs = [...s.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const show = (name: string) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
      s.querySelectorAll<HTMLElement>('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
    };
    tabs.forEach((t) => (t.onclick = () => show(t.dataset.tab!)));
    const entry = (title: string, text?: string, tip?: string, tag?: string, unknown = false) => {
      const b = el('button', unknown ? 'j-entry unknown' : 'j-entry') as HTMLButtonElement;
      b.type = 'button';
      if (tag) b.append(el('span', 'j-tag', tag));
      b.append(el('b', '', title));
      if (text) b.append(el('span', 'j-text', text));
      if (tip) b.append(el('span', 'j-tip', tip));
      return b;
    };
    const panel = (name: string) => s.querySelector<HTMLElement>(`.tab-panel[data-panel="${name}"]`)!;
    // história: as páginas na ordem do caminho
    const found = PAGE_IDS.filter((id) => progress.seen.has(`page:${id}`));
    $('.j-count', panel('story')).textContent = `Páginas: ${found.length} de ${PAGE_IDS.length}`;
    $('.j-list', panel('story')).replaceChildren(
      ...PAGE_IDS.map((id) => (progress.seen.has(`page:${id}`) ? entry(PAGES[id].title, PAGES[id].text) : entry('Página perdida', undefined, undefined, undefined, true))),
    );
    // bestiário: quem já foi derrotado (chefes contam pela vitória)
    const beasts = BESTIARY.map((b) => {
      const boss = b.kind.startsWith('boss:');
      const n = boss ? (progress.seen.has(b.kind) ? 1 : 0) : progress.kills.get(b.kind) ?? 0;
      return { b, n, boss };
    });
    $('.j-count', panel('beasts')).textContent = `Conhecidos: ${beasts.filter((x) => x.n > 0).length} de ${beasts.length}`;
    $('.j-list', panel('beasts')).replaceChildren(
      ...beasts.map(({ b, n, boss }) =>
        n > 0 ? entry(b.name, b.text, b.tip, boss ? 'Chefe vencido' : `Derrotados: ${n}`) : entry('Ainda não encontrado', undefined, undefined, undefined, true),
      ),
    );
    // lugares: as salas do mapa já visitadas
    const rooms = (Object.keys(MAP_POS) as RoomId[]).filter((id) => MAP_POS[id]);
    const visited = rooms.filter((id) => progress.visited.has(id));
    $('.j-count', panel('places')).textContent = `Lugares: ${visited.length} de ${rooms.length}`;
    $('.j-list', panel('places')).replaceChildren(
      ...rooms.map((id) => (progress.visited.has(id) ? entry(ROOMS[id].title, ROOMS[id].subtitle) : entry('Lugar ainda não visitado', undefined, undefined, undefined, true))),
    );
    // registros: o que os livros e as fichas das minas contam (cada um com a região onde estava)
    const recs = RECORD_IDS.filter((id) => progress.seen.has(`record:${id}`));
    $('.j-count', panel('records')).textContent = `Registros: ${recs.length} de ${RECORD_IDS.length}`;
    $('.j-list', panel('records')).replaceChildren(
      ...RECORD_IDS.map((id) => {
        if (!progress.seen.has(`record:${id}`)) return entry('Registro não encontrado', undefined, undefined, undefined, true);
        const r = recordInfo(id, progress.knowsHerName);
        return entry(r.title, r.lines.join(' '), undefined, r.region);
      }),
    );
    show('story');
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => o.onBack();
    this.push('journal', o.onBack);
  }

  // ---------- textos sobre o jogo ----------
  banner(title: string, sub: string, hold = 3200) {
    const b = $('#banner');
    $('h2', b).textContent = title;
    $('p', b).textContent = sub;
    clearTimeout(this.timers.banner);
    b.classList.add('on');
    this.timers.banner = window.setTimeout(() => b.classList.remove('on'), hold);
  }

  // alguém fala (o chefe vencido, uma vez): o nome em cima e a fala
  say(name: string, text: string, hold = 5200) {
    const t = $('#thought');
    t.replaceChildren(el('span', 'who', name), document.createTextNode(text));
    t.classList.add('speech');
    clearTimeout(this.timers.thought);
    t.classList.add('on');
    this.timers.thought = window.setTimeout(() => t.classList.remove('on'), hold);
  }

  thought(text: string, hold = 4200, html = false) {
    const t = $('#thought');
    t.classList.remove('speech');
    if (html) t.innerHTML = text;
    else t.textContent = text;
    clearTimeout(this.timers.thought);
    t.classList.add('on');
    this.timers.thought = window.setTimeout(() => t.classList.remove('on'), hold);
  }

  private hintText = '';
  hint(text: string | null) {
    const h = $('#hint');
    if (!text) {
      h.classList.remove('on');
      this.hintText = '';
      return;
    }
    const html = this.format(text);
    if (html !== this.hintText) {
      this.hintText = html;
      h.innerHTML = html;
    }
    h.classList.add('on');
  }

  // barra de vida do chefe (null esconde)
  bossBar(name: string | null, frac = 1) {
    const b = $('#bossbar');
    if (!name) {
      b.classList.remove('on');
      return;
    }
    $('p', b).textContent = name;
    $('b', b).style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    b.classList.add('on');
  }

  clearTexts() {
    for (const id of ['#banner', '#thought', '#hint', '#bossbar']) $(id).classList.remove('on');
    this.hintText = '';
  }

  // troca {ação} pelo nome da tecla atual, em <kbd>
  format(text: string) {
    const cls = pad.device === 'pad' ? ' class="pad"' : '';
    const out = text.replace(/\{(\w+)\}/g, (_m, a: string) => `<kbd${cls}>${this.keyLabel(a as Action)}</kbd>`);
    return out.replace(/(<kbd[^>]*>(?:(?!<\/kbd>).)*<\/kbd>) \1/g, '$1');
  }

  keyLabel(a: Action) {
    if (pad.device === 'pad') {
      if (a === 'left' || a === 'right') return stickGlyph('x');
      if (a === 'up') return stickGlyph('up');
      if (a === 'down' || a === 'crouch') return stickGlyph('down');
      const b = settings.data.pad[a][0];
      return b === undefined ? '—' : buttonGlyph(b, pad.brand);
    }
    if (document.body.classList.contains('touch')) {
      // no toque, pulo, ataque e dash aparecem com o mesmo desenho do botão da tela
      const icon = document.querySelector(`#buttons [data-action="${a}"] svg`);
      return icon ? icon.outerHTML : TOUCH_LABEL[a];
    }
    if (settings.data.scheme === 'click') {
      if (a === 'left' || a === 'right') return 'Clique no destino';
      if (a === 'attack') return 'Clique direito';
    }
    const code = settings.codesFor(a)[0];
    return code ? codeName(code) : '—';
  }
}

export const ui = new UI();
