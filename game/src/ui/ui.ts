import type Phaser from 'phaser';
import { WEAPONS, WEAPON_IDS, type WeaponId } from '../config';
import { raw } from '../systems/RawInput';
import { ACTIONS, ACTION_LABEL, PAD_ACTIONS, codeName, settings, type Action, type Quality } from '../systems/Settings';
import { audio } from '../systems/Audio';
import { BRAND_LABEL, BTN, buttonGlyph, buttonName, pad, stickGlyph, type PadBrand } from '../systems/Pad';
import { LEVEL_MUL, MAX_LEVEL, progress, type Upgrade } from '../systems/Save';
import { BESTIARY, FORGE, MATERIALS, MEMORIES, MEMORY_TOTAL, OFFERS, PAGES, PAGE_IDS, RELICS } from '../world/lore';
import { MAP_POS, ROOMS, type Ability, type RoomId } from '../world/rooms';
import { drawMarker, renderMap, type MapHere } from './mapview';
import { RES, applyRes, resFor } from '../gfx/view';
import { FORCED_PRESET, PRESETS, PRESET_LABEL, applyFpsLimit, presetOf, type FpsLimit, type GfxFlags, type Level3, type Preset } from '../systems/Graphics';

type ScreenId = 'loading' | 'intro' | 'menu' | 'erase' | 'weapons' | 'settings' | 'pause' | 'end' | 'map' | 'shop' | 'inventory' | 'talk' | 'forge' | 'journal';

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

const WEAPON_ORDER: WeaponId[] = ['scythe', 'sword', 'daggers', 'bow', 'badalo', 'incensario', 'corrente'];
const TAGS: Partial<Record<WeaponId, string>> = { scythe: 'Arma do carrasco · recomendada' };
const TOUCH_LABEL: Record<Action, string> = {
  left: 'Analógico', right: 'Analógico', up: 'Analógico para cima', down: 'Analógico para baixo',
  jump: 'Pular', attack: 'Atacar', dash: 'Dash', crouch: 'Analógico para baixo', hook: 'Gancho',
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
  onStackChange: ((open: boolean) => void) | null = null;

  init(game: Phaser.Game) {
    this.game = game;
    window.addEventListener('keydown', (e) => this.onKey(e));
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
    if (top !== 'weapons') cancelAnimationFrame(this.cardLoop);
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
    const target = s.querySelector<HTMLElement>('.card[aria-checked="true"]') ?? s.querySelector<HTMLElement>('button:not([hidden])');
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
    if (items[i].classList.contains('card')) items[i].click();
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
    const items: { id: WeaponId; card: HTMLButtonElement; sprite: HTMLElement; cel: HTMLElement; meta: SheetMeta; t0: number }[] = [];
    for (const id of list) {
      const W = WEAPONS[id];
      const locked = !o.has(id);
      const card = el('button', locked ? 'card locked' : 'card') as HTMLButtonElement;
      card.setAttribute('role', 'radio');
      card.dataset.w = id;
      card.disabled = locked;
      const view = card.appendChild(el('div', 'view'));
      const sprite = view.appendChild(el('div', 'sprite'));
      // o quadro do atlas fica num pedaço do tamanho dele, no lugar que ocupava no quadro inteiro
      const cel = sprite.appendChild(el('i'));
      card.appendChild(el('h3', '', W.name));
      const b = W.boss;
      card.appendChild(el('p', 'tag', b ? (locked ? `Vença ${b.art} ${b.name}` : `Arma d${b.art} ${b.name}`) : TAGS[id] ?? ''));
      card.appendChild(el('p', 'sum', W.summary));
      const dl = card.appendChild(el('dl', 'stats'));
      const rows = [['Dano', W.stats.dano], ['Velocidade', W.stats.velocidade], ['Alcance', W.stats.alcance], ['Corrida', W.stats.corrida]] as const;
      for (const [label, v] of rows) {
        dl.appendChild(el('dt', '', label));
        const dd = dl.appendChild(el('dd'));
        dd.setAttribute('aria-label', `${v} de 5`);
        for (let k = 0; k < 5; k++) dd.appendChild(el('i', k < v ? 'on' : ''));
      }
      card.onclick = () => {
        if (locked) return;
        if (sel !== id) audio.sfx('ui');
        sel = id;
        sync();
      };
      card.ondblclick = () => !locked && o.onConfirm(sel);
      cards.appendChild(card);
      const meta = this.game!.cache.json.get(`knight-${id}-meta`) as SheetMeta;
      (meta.frames ? cel : sprite).style.backgroundImage = `url(assets/knight-${id}.png)`;
      sprite.classList.toggle('hd', !!meta.frames);
      items.push({ id, card, sprite, cel, meta, t0: 0 });
    }
    const sync = () => {
      for (const it of items) {
        const on = it.id === sel;
        if (on && it.card.getAttribute('aria-checked') !== 'true') it.t0 = performance.now() / 1000;
        it.card.setAttribute('aria-checked', String(on));
      }
    };
    sync();
    // anima as prévias: a arma escolhida ataca, as outras respiram
    const tick = () => {
      const t = performance.now() / 1000;
      for (const it of items) {
        const idle = it.meta.anims.idle;
        const atk = it.meta.anims.attack;
        let f: number;
        if (it.id === sel) {
          const atkDur = atk.count / atk.fps;
          const ph = (t - it.t0) % (atkDur + 1.1);
          f = ph < atkDur ? atk.start + Math.floor(ph * atk.fps) : idle.start + (Math.floor((ph - atkDur) * idle.fps) % idle.count);
        } else f = idle.start + (Math.floor(t * idle.fps) % idle.count);
        const fr = it.meta.frames?.[String(f)];
        if (fr) {
          // a prévia mostra o mundo em dobro (288x240 para um quadro de 144x120)
          const k = 2 / (it.meta.scale ?? 1);
          const st = it.cel.style;
          st.left = `${fr.spriteSourceSize.x * k}px`;
          st.top = `${fr.spriteSourceSize.y * k}px`;
          st.width = `${fr.frame.w * k}px`;
          st.height = `${fr.frame.h * k}px`;
          st.backgroundSize = `${it.meta.meta!.size.w * k}px auto`;
          st.backgroundPosition = `${-fr.frame.x * k}px ${-fr.frame.y * k}px`;
        } else {
          const cols = it.meta.columns;
          it.sprite.style.backgroundPosition = `${-(f % cols) * 288}px ${-Math.floor(f / cols) * 240}px`;
        }
      }
      this.cardLoop = requestAnimationFrame(tick);
    };
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).textContent = o.confirmLabel;
    $<HTMLButtonElement>('[data-cmd="confirm"]', s).onclick = () => o.onConfirm(sel);
    $<HTMLButtonElement>('[data-cmd="back"]', s).onclick = () => o.onBack();
    this.push('weapons', o.onBack);
    cancelAnimationFrame(this.cardLoop);
    this.cardLoop = requestAnimationFrame(tick);
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
  pause(o: { onResume: () => void; onMap?: () => void; onInventory: () => void; onJournal?: () => void; onWeapon: () => void; onTitle: () => void }) {
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
    $<HTMLButtonElement>('[data-cmd="weapon"]', s).onclick = () => o.onWeapon();
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

  map(o: MapHere & { onClose: () => void }) {
    const s = $('#screen-map');
    $('.map-room', s).textContent = ROOMS[o.room].title;
    $<HTMLButtonElement>('[data-cmd="close"]', s).onclick = () => o.onClose();
    // relíquias, memórias e trocas
    const rel = $('.map-relics', s);
    rel.replaceChildren();
    for (const a of ['wall', 'double', 'hook', 'veil'] as Ability[]) {
      const li = el('li');
      if (progress.abilities.has(a)) {
        li.append(el('b', '', RELICS[a].name), el('span', 'how'));
        $('.how', li).innerHTML = this.format(RELICS[a].how);
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
    this.push('map', o.onClose);
    // desenha depois que a tela aparece (precisa do tamanho do canvas)
    cancelAnimationFrame(this.mapLoop);
    const cv = $<HTMLCanvasElement>('canvas', s);
    let base: ReturnType<typeof renderMap> | null = null;
    let w = 0;
    let h = 0;
    const draw = (t: number) => {
      if (this.top !== 'map') return;
      const dpr = window.devicePixelRatio || 1;
      if (!base || cv.clientWidth !== w || cv.clientHeight !== h) {
        w = cv.clientWidth;
        h = cv.clientHeight;
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        base = renderMap(w, h, dpr, o);
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(base.canvas, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // o cavaleiro: anel dourado pulsando
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.006);
      ctx.strokeStyle = `rgba(214, 162, 74, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(base.player.x, base.player.y, base.size * (1.1 + pulse * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      drawMarker(ctx, 'you', base.player.x, base.player.y, base.size * 1.2);
      this.mapLoop = requestAnimationFrame(draw);
    };
    this.mapLoop = requestAnimationFrame(draw);
  }

  // ---------- inventário ----------
  // itens do Cobrador que se ligam e desligam (3 espaços), as armas e as relíquias
  inventory(o: { toggle: (id: Upgrade) => 'on' | 'off' | 'full' | 'missing'; onBack: () => void }) {
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
    // armas: a que está em uso, as liberadas e as de chefe ainda trancadas
    const wl = $('.inv-weapons', s);
    wl.replaceChildren();
    for (const id of WEAPON_IDS) {
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
    const rel = $('.inv-relics', s);
    rel.replaceChildren();
    for (const a of ['wall', 'double', 'hook', 'veil'] as Ability[]) {
      const li = el('li');
      if (progress.abilities.has(a)) {
        li.append(el('b', '', RELICS[a].name), el('span', 'how'));
        $('.how', li).innerHTML = this.format(RELICS[a].how);
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
      for (const id of WEAPON_ORDER) {
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

  thought(text: string, hold = 4200, html = false) {
    const t = $('#thought');
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
