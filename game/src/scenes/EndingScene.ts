import Phaser from 'phaser';
import type { FxScene } from './FxScene';
import type { GameInit } from './GameScene';
import { VIEW_H, VIEW_W } from '../config';
import { audio } from '../systems/Audio';
import { pad } from '../systems/Pad';
import { progress } from '../systems/Save';
import { ui } from '../ui/ui';
import { fixedCamera } from '../gfx/view';
import { FILMS, FILM_CELL, FILM_FRAMES, credits, fill, type FilmFx, type FilmLayer, type FilmShot } from '../world/endings';
import type { EndingId } from '../world/story';

export interface EndingInit {
  kind: EndingId;
  // revendo do menu do título: Esc (ou Start) volta, e no fim volta para o título
  replay?: boolean;
}

// o ritmo do filme, em segundos de filme (segurar uma tecla, a tela ou um botão acelera FAST vezes)
const LEAD = 1.7;
const GAP = 1.1;
const XF = 1.9;
const TAIL = 1.5;
const FADE = 2.6;
const LAST = 6.2;
const CARD = 5.8;
const HOLD = 3.6;
const FAST = 4;
// quanto tempo uma frase fica, pelo tamanho dela
const stepFor = (text: string) => Phaser.Math.Clamp(2.6 + text.length * 0.042, 4.4, 7.4);
const ease = (k: number) => k * k * (3 - 2 * k);
const NUMERAL: Record<EndingId, string> = { truth: 'Final I', absorb: 'Final II', fragments: 'Final III' };
// onde as vozes aparecem (em % da tela), longe da frase de baixo
const VOICE_AT: [number, number][] = [
  [26, 22], [74, 17], [20, 50], [79, 45], [50, 33], [62, 60],
];

interface Run {
  shot: FilmShot;
  i: number;
  t0: number;
  dur: number;
  lines: { text: string; a: number; b: number }[];
  voices: { a: number; b: number }[];
  imgs: { img: Phaser.GameObjects.Image; l: FilmLayer }[];
  objs: Phaser.GameObjects.GameObject[];
  rays: Phaser.GameObjects.Image[];
  dark: Phaser.GameObjects.Rectangle | null;
  crack: { g: Phaser.GameObjects.Graphics; paths: { x: number; y: number }[][]; done: boolean } | null;
  state: 'wait' | 'on' | 'gone';
}

// Os finais: os planos pintados de cada um (world/endings.ts), com a câmera andando devagar por cima, os
// efeitos de luz, as frases embaixo, as vozes, a última frase, o nome do final e os créditos. O texto fica na
// tela de HTML (#screen-film); a cena conduz o tempo e chama a interface a cada mudança.
export class EndingScene extends Phaser.Scene {
  private kind: EndingId = 'truth';
  private replay = false;
  private runs: Run[] = [];
  private t = 0;
  private speed = 1;
  private held = new Set<string>();
  private pointer = false;
  private fade!: Phaser.GameObjects.Rectangle;
  private shotsEnd = 0;
  private lastAt = 0;
  private cardAt = 0;
  private rollAt = 0;
  private roll = { d: 0, v: 1 };
  private line: string | null = null;
  private phase: 'shots' | 'fade' | 'last' | 'card' | 'roll' | 'out' = 'shots';
  private leaving = false;
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'Backspace') return;
    this.held.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private onBlur = () => this.held.clear();
  private onDown = () => (this.pointer = true);
  private onUp = () => (this.pointer = false);

  constructor() {
    super('ending');
  }

  init(data: EndingInit) {
    this.kind = data.kind;
    this.replay = !!data.replay;
  }

  preload() {
    const key = `finais-${this.kind}`;
    if (!this.textures.exists(key)) this.load.image(key, `assets/${key}.webp`);
  }

  create() {
    fixedCamera(this);
    this.leaving = false;
    this.runs = [];
    this.t = 0;
    this.speed = 1;
    this.line = null;
    this.phase = 'shots';
    this.held.clear();
    this.pointer = false;
    (this.scene.get('fx') as FxScene | null)?.setGrain(0.07);
    const film = FILMS[this.kind];
    const [r, g, b] = film.fade;
    const color = (r << 16) | (g << 8) | b;
    const cam = this.cameras.main;
    cam.setRoundPixels(false);
    cam.setBackgroundColor(color);
    this.frames();
    this.rayTexture();
    // a tela da cor do fim, por cima de tudo: começa cheia (o terraço acabou de apagar nessa cor) e volta no fim
    this.fade = this.add.rectangle(0, 0, VIEW_W, VIEW_H, color).setOrigin(0).setDepth(1000).setAlpha(0);
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(990).setAlpha(0.5);
    // os planos, um atrás do outro; cada frase fica um tempo pelo tamanho dela
    let t = 0.6;
    film.shots.forEach((shot, i) => {
      const lines: Run['lines'] = [];
      let at = t + LEAD;
      for (const raw of shot.lines) {
        const text = fill(raw, progress.knowsHerName);
        const step = stepFor(text);
        lines.push({ text, a: at, b: at + step - GAP });
        at += step;
      }
      const n = shot.voices?.length ?? 0;
      const dur = Math.max(at + TAIL - t, n * 1.8 + 4);
      const voices = (shot.voices ?? []).map((_v, k) => ({ a: t + 1.2 + (k * (dur - 3.4)) / Math.max(1, n), b: t + dur - 0.8 }));
      this.runs.push({ shot, i, t0: t, dur, lines, voices, imgs: [], objs: [], rays: [], dark: null, crack: null, state: 'wait' });
      t += dur;
    });
    this.shotsEnd = t;
    this.lastAt = t + FADE + 0.4;
    this.cardAt = this.lastAt + (film.last ? LAST : 0);
    this.rollAt = this.cardAt + CARD + 1.2;
    ui.film(true, this.replay ? () => this.finish() : undefined);
    ui.filmHint(true);
    audio.music(film.track, 2.5);
    audio.ambience('none');
    audio.space = 0.3;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    const screen = document.getElementById('screen-film');
    screen?.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      screen?.removeEventListener('pointerdown', this.onDown);
      window.removeEventListener('pointerup', this.onUp);
      ui.film(false);
    });
    (window as unknown as { __ending: EndingScene }).__ending = this;
  }

  // os quadros do atlas do final (duas colunas de 1280x720); sem o atlas, um fundo liso no lugar de cada um
  private frames() {
    const key = `finais-${this.kind}`;
    const names = FILM_FRAMES[this.kind];
    if (!this.textures.exists(key)) {
      const c = this.textures.createCanvas(key, FILM_CELL.w * FILM_CELL.cols, FILM_CELL.h * Math.ceil(names.length / FILM_CELL.cols));
      if (c) {
        const ctx = c.getContext();
        const [r, g, b] = FILMS[this.kind].fade;
        ctx.fillStyle = `rgb(${(r * 0.5) | 0}, ${(g * 0.5) | 0}, ${(b * 0.5) | 0})`;
        ctx.fillRect(0, 0, c.width, c.height);
        c.refresh();
      }
    }
    const tex = this.textures.get(key);
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    names.forEach((name, i) => {
      if (tex.has(name)) return;
      tex.add(name, 0, (i % FILM_CELL.cols) * FILM_CELL.w, Math.floor(i / FILM_CELL.cols) * FILM_CELL.h, FILM_CELL.w, FILM_CELL.h);
    });
  }

  // o facho de luz: uma cunha que abre para baixo, macia nas beiradas
  private rayTexture() {
    if (this.textures.exists('film-ray')) return;
    const w = 128;
    const h = 512;
    const c = this.textures.createCanvas('film-ray', w, h);
    if (!c) return;
    const ctx = c.getContext();
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(255,255,255,0.95)');
    v.addColorStop(0.55, 'rgba(255,255,255,0.32)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = v;
    ctx.beginPath();
    ctx.moveTo(w * 0.42, 0);
    ctx.lineTo(w * 0.58, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-in';
    const sides = ctx.createLinearGradient(0, 0, w, 0);
    sides.addColorStop(0, 'rgba(0,0,0,0)');
    sides.addColorStop(0.5, 'rgba(0,0,0,1)');
    sides.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sides;
    ctx.fillRect(0, 0, w, h);
    c.refresh();
  }

  // ---------- os planos ----------
  private begin(r: Run) {
    r.state = 'on';
    const key = `finais-${this.kind}`;
    const base = 10 * (r.i + 1);
    r.shot.layers.forEach((l, k) => {
      const img = this.add.image(VIEW_W / 2, VIEW_H / 2, key, l.frame).setDepth(base + k).setAlpha(0);
      if (l.add) img.setBlendMode(Phaser.BlendModes.ADD);
      r.imgs.push({ img, l });
    });
    for (const fx of r.shot.fx) this.addFx(r, fx, base + 5);
    if (r.shot.voices) {
      ui.filmVoices(r.shot.voices.map((text, k) => ({ text, x: VOICE_AT[k % VOICE_AT.length][0], y: VOICE_AT[k % VOICE_AT.length][1] })));
    }
  }

  private end(r: Run) {
    r.state = 'gone';
    for (const { img } of r.imgs) img.destroy();
    for (const o of r.objs) o.destroy();
    r.imgs = [];
    r.objs = [];
    r.rays = [];
    r.dark = null;
    r.crack = null;
  }

  private addFx(r: Run, fx: FilmFx, depth: number) {
    const tint = r.shot.tint ?? 0xffe0a6;
    const ADD = Phaser.BlendModes.ADD;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      r.objs.push(o);
      return o;
    };
    switch (fx) {
      case 'motes':
        keep(this.add.particles(0, 0, 'glow', {
          x: { min: 0, max: VIEW_W }, y: { min: 40, max: VIEW_H },
          lifespan: { min: 5000, max: 9000 }, speedY: { min: -12, max: -3 }, speedX: { min: -6, max: 6 },
          scale: { min: 0.035, max: 0.09 }, alpha: { values: [0, 0.85, 0.6, 0], interpolation: 'catmull' },
          tint, blendMode: ADD, frequency: 130, advance: 7000,
        }).setDepth(depth));
        break;
      case 'fall':
        keep(this.add.particles(0, -12, 'glow', {
          x: { min: -20, max: VIEW_W + 20 },
          lifespan: { min: 8000, max: 11000 }, speedY: { min: 16, max: 34 }, speedX: { min: -7, max: 7 },
          scale: { min: 0.045, max: 0.11 }, alpha: { values: [0, 0.95, 0.75, 0], interpolation: 'catmull' },
          tint, blendMode: ADD, frequency: 85, advance: 6000,
        }).setDepth(depth));
        break;
      case 'rise':
        keep(this.add.particles(0, VIEW_H + 10, 'glow', {
          x: { min: 0, max: VIEW_W },
          lifespan: { min: 7000, max: 10000 }, speedY: { min: -38, max: -18 }, speedX: { min: -5, max: 5 },
          scale: { min: 0.04, max: 0.1 }, alpha: { values: [0, 0.9, 0.7, 0], interpolation: 'catmull' },
          tint, blendMode: ADD, frequency: 75, advance: 6000,
        }).setDepth(depth));
        break;
      case 'stars':
        keep(this.add.particles(0, 0, 'glow', {
          x: { min: 0, max: VIEW_W }, y: { min: 0, max: VIEW_H * 0.72 },
          lifespan: { min: 2600, max: 5400 }, speed: 0,
          scale: { min: 0.02, max: 0.06 }, alpha: { values: [0, 1, 0.35, 0.9, 0], interpolation: 'catmull' },
          tint, blendMode: ADD, frequency: 45, advance: 5000,
        }).setDepth(depth));
        break;
      case 'rays': {
        // do sol do quadro (rayFrom): um leque para baixo, começando fora do disco; sem ele, do alto da tela
        const from = r.shot.rayFrom;
        for (let k = 0; k < (from ? 5 : 4); k++) {
          const ray = from
            ? keep(this.add.image(0, 0, 'film-ray')).setOrigin(0.5, 0).setAngle(-56 + k * 28 + (Math.random() - 0.5) * 12)
              .setScale(1.0 + Math.random() * 0.5, 1.05 + Math.random() * 0.3)
            : keep(this.add.image(VIEW_W * (0.18 + k * 0.22) + (Math.random() - 0.5) * 30, -20, 'film-ray')).setOrigin(0.5, 0)
              .setScale(0.8 + Math.random() * 0.7, 0.9 + Math.random() * 0.25).setAngle(-14 + k * 3);
          ray.setBlendMode(ADD).setTint(tint).setAlpha(0).setDepth(depth);
          ray.setData('ph', Math.random() * 6);
          if (from) ray.setData('from', from);
          r.rays.push(ray);
        }
        break;
      }
      case 'dust':
        keep(this.add.particles(0, 0, 'px', {
          x: { min: -10, max: VIEW_W }, y: { min: 0, max: VIEW_H },
          lifespan: { min: 6000, max: 10000 }, speedX: { min: 3, max: 13 }, speedY: { min: -4, max: 3 },
          scale: { min: 0.6, max: 1.3 }, alpha: { values: [0, 0.55, 0], interpolation: 'catmull' },
          tint: 0xfff0d4, blendMode: ADD, frequency: 60, advance: 8000,
        }).setDepth(depth));
        break;
      case 'petals':
        keep(this.add.particles(0, 0, 'px', {
          x: { min: -30, max: VIEW_W * 0.7 }, y: { min: -10, max: VIEW_H * 0.6 },
          lifespan: { min: 7000, max: 10000 }, speedX: { min: 18, max: 42 }, speedY: { min: 3, max: 14 },
          scaleX: { min: 1.6, max: 2.4 }, scaleY: { min: 0.9, max: 1.3 }, rotate: { min: 0, max: 360 },
          alpha: { values: [0, 0.95, 0.9, 0], interpolation: 'catmull' },
          tint: [0xffe8ef, 0xfff6f2, 0xf6d4e0, 0xfff0d8], frequency: 150, advance: 9000,
        }).setDepth(depth));
        break;
      case 'crack': {
        // a rachadura roxa sai do meio do rosto em três galhos tortos (vai abrindo no meio do plano)
        const g = keep(this.add.graphics().setDepth(depth));
        const paths: { x: number; y: number }[][] = [];
        const ox = VIEW_W * 0.5;
        const oy = VIEW_H * 0.42;
        for (const ang of [-2.2, -0.5, 1.3]) {
          const pts = [{ x: ox, y: oy }];
          let a = ang;
          let x = ox;
          let y = oy;
          for (let k = 0; k < 9; k++) {
            a += (Math.random() - 0.5) * 0.9;
            const len = 10 + Math.random() * 14;
            x += Math.cos(a) * len;
            y += Math.sin(a) * len;
            pts.push({ x, y });
          }
          paths.push(pts);
        }
        r.crack = { g, paths, done: false };
        break;
      }
      case 'dark':
        r.dark = keep(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05030a).setOrigin(0).setDepth(depth + 1).setAlpha(0));
        break;
    }
  }

  private drawCrack(r: Run, k: number) {
    const c = r.crack;
    if (!c) return;
    c.g.clear();
    for (const pts of c.paths) {
      const n = (pts.length - 1) * k;
      const draw = (w: number, color: number, alpha: number) => {
        c.g.lineStyle(w, color, alpha);
        c.g.beginPath();
        c.g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= Math.floor(n); i++) c.g.lineTo(pts[i].x, pts[i].y);
        const f = n - Math.floor(n);
        const i = Math.floor(n);
        if (f > 0 && i + 1 < pts.length) c.g.lineTo(pts[i].x + (pts[i + 1].x - pts[i].x) * f, pts[i].y + (pts[i + 1].y - pts[i].y) * f);
        c.g.strokePath();
      };
      draw(5, 0x9a5cff, 0.22);
      draw(2.2, 0xc89cff, 0.55);
      draw(0.9, 0x1a0c26, 0.9);
    }
    if (k >= 1 && !c.done) {
      c.done = true;
      this.cameras.main.shake(260, 0.004);
      audio.sfx('glass');
    }
  }

  private updateRun(r: Run, now: number) {
    const local = now - r.t0;
    // a pintura entra por cima da anterior; a anterior sai quando esta já cobriu
    const inA = r.i === 0 ? ease(Phaser.Math.Clamp(local / 2.4, 0, 1)) : ease(Phaser.Math.Clamp(local / XF, 0, 1));
    const k = ease(Phaser.Math.Clamp(local / (r.dur + XF), 0, 1));
    for (const { img, l } of r.imgs) {
      const ox = l.dx * k;
      const oy = l.dy * k;
      // a câmera nunca mostra a borda da pintura: a escala cresce o bastante para o deslocamento
      const s = Math.max(l.s0 + (l.s1 - l.s0) * k, 1 + Math.abs(ox) / (VIEW_W / 2) + 0.004, 1 + Math.abs(oy) / (VIEW_H / 2) + 0.004);
      img.setScale(s * (VIEW_W / FILM_CELL.w)).setPosition(VIEW_W / 2 + ox, VIEW_H / 2 + oy);
      img.setAlpha(l.add ? inA * (0.75 + 0.25 * Math.sin(now * 1.3 + l.dx)) : inA);
    }
    // os fachos que saem do sol do quadro andam com a pintura de baixo
    const under = r.imgs[0]?.img;
    for (const ray of r.rays) {
      const ph = ray.getData('ph') as number;
      const from = ray.getData('from') as [number, number] | undefined;
      if (from && under) {
        const off = 22 * under.scaleX * 2;
        ray.setPosition(
          under.x + (from[0] - FILM_CELL.w / 2) * under.scaleX - Math.sin(ray.rotation) * off,
          under.y + (from[1] - FILM_CELL.h / 2) * under.scaleY + Math.cos(ray.rotation) * off,
        );
      }
      ray.setAlpha(inA * (0.1 + 0.07 * Math.sin(now * 0.7 + ph)));
      ray.rotation += Math.sin(now * 0.3 + ph) * 0.00005;
    }
    if (r.dark) r.dark.setAlpha(0.72 * ease(Phaser.Math.Clamp((local - 1) / (r.dur - 1.5), 0, 1)));
    if (r.crack) this.drawCrack(r, ease(Phaser.Math.Clamp((local - r.dur * 0.35) / (r.dur * 0.3), 0, 1)));
    r.voices.forEach((v, i) => ui.filmVoice(i, now >= v.a && now < v.b));
  }

  // ---------- o tempo do filme ----------
  private get holding() {
    if (this.held.size || this.pointer) return true;
    const p = pad.pad;
    return !!p && p.buttons.some((b) => b.pressed);
  }

  update(_time: number, delta: number) {
    if (this.leaving) return;
    const want = this.holding ? FAST : 1;
    if (want !== this.speed) {
      this.speed = want;
      ui.filmSpeed(want);
    }
    const dt = Math.min(delta, 100) / 1000;
    this.t += dt * this.speed;
    const t = this.t;
    if (t > 7) ui.filmHint(false);
    // os planos: o que já começou anda; o que ficou coberto pelo seguinte sai
    for (const r of this.runs) {
      if (r.state === 'wait' && t >= r.t0) this.begin(r);
      if (r.state !== 'on') continue;
      const next = this.runs[r.i + 1];
      if (next && t >= next.t0 + XF + 0.2) {
        this.end(r);
        continue;
      }
      this.updateRun(r, t);
    }
    // a frase de baixo
    let line: string | null = null;
    for (const r of this.runs) for (const l of r.lines) if (t >= l.a && t < l.b) line = l.text;
    if (line !== this.line) {
      this.line = line;
      ui.filmLine(line);
    }
    const film = FILMS[this.kind];
    // depois do último plano: a tela vai para a cor do fim, a última frase, o nome do final, os créditos
    if (t >= this.shotsEnd) {
      const k = Phaser.Math.Clamp((t - this.shotsEnd) / FADE, 0, 1);
      this.fade.setAlpha(ease(k));
      if (this.phase === 'shots') this.phase = 'fade';
      if (k >= 1 && this.phase === 'fade') {
        for (const r of this.runs) if (r.state === 'on') this.end(r);
        if (this.kind === 'truth') ui.filmLight(true);
        this.phase = 'last';
      }
    }
    if (this.phase === 'last') ui.filmLast(film.last && t >= this.lastAt && t < this.cardAt - 2.2 ? film.last : null);
    if (this.phase === 'last' && t >= this.cardAt) this.phase = 'card';
    if (this.phase === 'card') {
      ui.filmCard(t < this.rollAt - 1.8 ? NUMERAL[this.kind] : null, film.title);
      if (t >= this.rollAt) {
        this.phase = 'roll';
        const { height, screen } = ui.filmCredits(credits(progress.knowsHerName));
        // sobe até o "Obrigado por jogar." parar no meio da tela; a velocidade acompanha o tamanho da tela
        this.roll = { d: screen / 2 + height - 18, v: Math.max(30, screen * 0.062) };
        this.rollAt = t;
      }
    }
    if (this.phase === 'roll') {
      const px = Math.min(this.roll.d, (t - this.rollAt) * this.roll.v);
      ui.filmRoll(px);
      if (px >= this.roll.d && t >= this.rollAt + this.roll.d / this.roll.v + HOLD) this.finish();
    }
  }

  // o fim do filme: revendo, volta ao título; senão, Vespera depois do fim (no final III, o título)
  finish() {
    if (this.leaving) return;
    this.leaving = true;
    ui.filmCreditsOff();
    ui.filmLine(null);
    ui.filmLast(null);
    ui.filmCard(null);
    const [r, g, b] = FILMS[this.kind].fade;
    const cam = this.cameras.main;
    this.fade.setAlpha(1);
    audio.music('none', 2.2);
    cam.fadeOut(1600, r, g, b);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      ui.film(false);
      if (this.replay || this.kind === 'fragments') {
        this.scene.start('title');
        return;
      }
      const data: GameInit = this.kind === 'truth' ? { room: 'ponte', entry: 'P', from: 'end' } : { room: 'trono', entry: 'X', from: 'end' };
      this.scene.start('game', data);
    });
  }
}
