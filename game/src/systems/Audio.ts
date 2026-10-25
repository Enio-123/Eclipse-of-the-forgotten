import { settings } from './Settings';

// Todo o som do jogo é sintetizado no navegador (Web Audio): efeitos, chuva,
// ambiências e uma trilha generativa com piano, pads, coro e sinos.
export type SfxName =
  | 'slash' | 'heavy' | 'stab' | 'bow' | 'thunk' | 'dash' | 'jump' | 'land' | 'step'
  | 'hit' | 'hurt' | 'kill' | 'thunder' | 'drip' | 'crack' | 'shard' | 'splash' | 'ui' | 'ui-ok'
  | 'clang' | 'caw' | 'swoosh' | 'thud' | 'chime' | 'bell' | 'rest' | 'coin' | 'roar' | 'tink' | 'mend' | 'ghost'
  | 'ash' | 'quake' | 'equip' | 'erase'
  | 'parry' | 'break' | 'glass' | 'page' | 'anvil' | 'smoke' | 'coinrain' | 'door' | 'locked' | 'censer' | 'draw' | 'gate'
  | 'echo' | 'echo-die';
export type TrackId = 'title' | 'bridge' | 'crypt' | 'memory' | 'boss' | 'city' | 'nave' | 'boss2' | 'none';
export type AmbienceId = 'rain' | 'crypt' | 'wind' | 'city' | 'nave' | 'none';
export type StepKind = 'wet' | 'stone' | 'grass';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Playing {
  id: TrackId;
  bus: GainNode;
  step: number;
  next: number;
  stop: (() => void)[];
  alive: boolean;
}

interface TrackDef {
  bpm: number;
  start?: (e: AudioEngine, p: Playing) => void;
  // chamado a cada colcheia (8 por compasso)
  step: (e: AudioEngine, p: Playing, step: number, t: number, dur: number) => void;
}

// Acordes em MIDI (oitava 3) usados pelas faixas
const DM = [50, 53, 57], BB = [46, 50, 53], GM = [43, 46, 50], AM = [45, 49, 52];
const DMAJ = [50, 54, 57], BMIN = [47, 50, 54], GMAJ = [43, 47, 50], AMAJ = [45, 49, 52];
// capítulo 2 (a cidade): mi menor, com o si maior da cadência
const EM = [52, 55, 59], CMAJ = [48, 52, 55], AMIN = [45, 48, 52], BMAJ = [47, 51, 54];

const chance = (p: number) => Math.random() < p;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const TRACKS: Record<Exclude<TrackId, 'none'>, TrackDef> = {
  // Título: ré menor, piano em arpejo sobre pads, com uma melodia que vai e volta
  title: {
    bpm: 66,
    step(e, p, s, t, d) {
      const prog = [DM, BB, GM, AM];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.045);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.13, d * 8);
      const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
      const pat = [0, 1, 2, 1, 3, 1, 2, 1];
      const prob = [1, 0.45, 0.85, 0.35, 0.9, 0.4, 0.75, 0.3];
      if (chance(prob[i])) e.piano(p.bus, t, arp[pat[i]], 0.06 + Math.random() * 0.04, d * 6);
      // melodia nos compassos ímpares do ciclo
      if (bar % 4 === 1 && (i === 0 || i === 3 || i === 6)) {
        const mel = [ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 12];
        e.piano(p.bus, t, mel[(i / 3 + (bar >> 2)) % 4 | 0], 0.11, d * 10);
      }
    },
  },
  // Ponte: mesma harmonia, mais lenta e rala, quase engolida pela chuva
  bridge: {
    bpm: 54,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.03));
    },
    step(e, p, s, t, d) {
      const prog = [DM, BB, GM, AM];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) {
        e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.04);
        e.choir(p.bus, t, ch[2] + 12, d * 14, 0.018);
      }
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.1, d * 8);
      if ((i === 2 || i === 5) && chance(0.4)) e.piano(p.bus, t, pick([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]), 0.07, d * 8);
    },
  },
  // Catacumbas: zumbido grave, sinos dissonantes raros e um coro distante
  crypt: {
    bpm: 50,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.045), e.drone(p.bus, 45, 0.025));
    },
    step(e, p, s, t, d) {
      if (chance(0.07)) e.bell(p.bus, t, pick([74, 75, 77, 80, 81, 86]), 0.035);
      if (s % 64 === 0) e.choir(p.bus, t, pick([62, 57]), d * 30, 0.02);
      if (s % 64 === 32) e.choir(p.bus, t, pick([63, 58]), d * 26, 0.016);
      if (chance(0.035)) e.piano(p.bus, t, pick([38, 41, 44]), 0.09, d * 12);
    },
  },
  // Sineiro: ostinato grave no piano, sino a cada compasso e coro por cima
  boss: {
    bpm: 96,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 38, 0.05), e.drone(p.bus, 45, 0.03));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const roots = [38, 38, 34, 37];
      const r = roots[Math.floor(bar / 2) % 4];
      const pat = [0, 0, 12, 0, 3, 0, 12, 6];
      e.piano(p.bus, t, r + pat[i], i % 2 === 0 ? 0.12 : 0.08, d * 2);
      if (i === 0) e.bell(p.bus, t, [62, 61, 58, 57][bar % 4], 0.05);
      if (i === 0 && bar % 2 === 0) e.choir(p.bus, t, [r + 24, r + 27][bar % 4 === 0 ? 0 : 1], d * 14, 0.025);
      if (i === 4 && chance(0.5)) e.piano(p.bus, t, r + 24 + pick([0, 3, 7]), 0.06, d * 4);
    },
  },
  // Cidade-Catedral: mi menor solene, sino da torre no começo de cada ciclo, coro de procissão
  // ao longe e um piano que pergunta e não termina a frase
  city: {
    bpm: 58,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 40, 0.03));
    },
    step(e, p, s, t, d) {
      const prog = [EM, CMAJ, AMIN, BMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.036, 700);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.1, d * 8);
      if (s % 64 === 0) e.bell(p.bus, t, 64, 0.05);
      if (s % 64 === 4) e.bell(p.bus, t, 59, 0.035);
      // a procissão: duas notas longas do coro, como um canto que passa
      if (bar % 8 === 4 && i === 0) e.choir(p.bus, t, ch[0] + 12, d * 10, 0.02);
      if (bar % 8 === 5 && i === 4) e.choir(p.bus, t, ch[2] + 12, d * 10, 0.018);
      if ((i === 3 || i === 6) && chance(0.35)) e.piano(p.bus, t, pick([ch[0] + 24, ch[1] + 24, ch[2] + 12, ch[1] + 12]), 0.06, d * 8);
      if (bar % 4 === 3 && i === 0) e.piano(p.bus, t, ch[2] + 24, 0.08, d * 12);
    },
  },
  // Nave: órgão (pad aberto e grave), coro de vozes longas e o eco da catedral
  nave: {
    bpm: 46,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 28, 0.035), e.drone(p.bus, 40, 0.02));
    },
    step(e, p, s, t, d) {
      const prog = [EM, AMIN, CMAJ, BMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) {
        e.pad(p.bus, t, [ch[0], ...ch.map((n) => n + 12)], d * 16, 0.03, 1500);
        e.choir(p.bus, t, ch[1] + 12, d * 15, 0.02);
      }
      if (i === 4 && bar % 2 === 1) e.choir(p.bus, t, ch[2] + 12, d * 10, 0.014);
      if (chance(0.05)) e.bell(p.bus, t, pick([76, 79, 83, 88]), 0.025);
      if (i === 0 && bar % 4 === 2) e.piano(p.bus, t, ch[0] + 24, 0.05, d * 14);
    },
  },
  // Arcebispo do Dízimo: órgão em ostinato, sino em cada tempo forte e o coro que cresce
  boss2: {
    bpm: 108,
    start(e, p) {
      p.stop.push(e.drone(p.bus, 40, 0.05), e.drone(p.bus, 47, 0.025));
    },
    step(e, p, s, t, d) {
      const bar = Math.floor(s / 8);
      const i = s % 8;
      const roots = [40, 40, 36, 35];
      const r = roots[Math.floor(bar / 2) % 4];
      const pat = [0, 12, 7, 12, 3, 12, 7, 15];
      e.piano(p.bus, t, r + pat[i], i % 2 === 0 ? 0.11 : 0.07, d * 2);
      if (i === 0) e.bell(p.bus, t, [64, 64, 60, 59][bar % 4], 0.05);
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, [r + 12, r + 19, r + 24], d * 16, 0.03, 1600);
      if (i === 0 && bar % 4 === 0) e.choir(p.bus, t, r + 24, d * 14, 0.024);
      if (i === 4 && bar % 4 === 2) e.choir(p.bus, t, r + 27, d * 12, 0.02);
    },
  },
  // Memória: ré maior, caixinha de música, pad quente e uma flauta
  memory: {
    bpm: 80,
    step(e, p, s, t, d) {
      const prog = [DMAJ, BMIN, GMAJ, AMAJ];
      const bar = Math.floor(s / 8);
      const ch = prog[Math.floor(bar / 2) % 4];
      const i = s % 8;
      if (i === 0 && bar % 2 === 0) e.pad(p.bus, t, ch.map((n) => n + 12), d * 16, 0.035, 1300);
      if (i === 0) e.piano(p.bus, t, ch[0] - 12, 0.08, d * 8);
      const arp = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36, ch[2] + 24, ch[1] + 24, ch[2] + 24];
      if (chance(i % 2 === 0 ? 0.95 : 0.55)) e.musicbox(p.bus, t, arp[i], 0.05);
      if (bar % 4 === 2 && (i === 0 || i === 4)) e.flute(p.bus, t, pick([74, 76, 78, 81, 83]), d * 4, 0.035);
    },
  },
};

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private playing: Playing[] = [];
  private wantTrack: TrackId = 'none';
  private amb: { id: AmbienceId; bus: GainNode; stop: () => void } | null = null;
  private wantAmb: AmbienceId = 'none';
  stepKind: StepKind = 'stone';
  // quanto de eco os efeitos recebem (catacumbas ecoam mais)
  space = 0.15;

  constructor() {
    const unlock = () => {
      this.init();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });
    settings.onChange(() => this.applyVolumes());
  }

  private init() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.3);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.9;
    this.reverb.connect(this.wet).connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = this.noise.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.applyVolumes();
    window.setInterval(() => this.schedule(), 50);
    const t = this.wantTrack;
    const a = this.wantAmb;
    this.wantTrack = 'none';
    this.wantAmb = 'none';
    this.music(t);
    this.ambience(a);
  }

  private impulse(sec: number, decay: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = settings.data;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.volume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(s.sfx * 0.85, t, 0.05);
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ---------- trilha ----------
  music(id: TrackId, fade = 2.5) {
    if (!this.ctx) {
      this.wantTrack = id;
      return;
    }
    const cur = this.playing.find((p) => p.alive);
    if (cur?.id === id) return;
    const t = this.ctx.currentTime;
    for (const p of this.playing) {
      if (!p.alive) continue;
      p.alive = false;
      p.bus.gain.cancelScheduledValues(t);
      p.bus.gain.setValueAtTime(p.bus.gain.value, t);
      p.bus.gain.linearRampToValueAtTime(0, t + fade);
      window.setTimeout(() => {
        p.stop.forEach((f) => f());
        p.bus.disconnect();
        this.playing = this.playing.filter((q) => q !== p);
      }, fade * 1000 + 6000);
    }
    if (id === 'none') return;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + fade);
    bus.connect(this.musicBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.55;
    bus.connect(send).connect(this.reverb);
    const p: Playing = { id, bus, step: 0, next: t + 0.1, stop: [], alive: true };
    TRACKS[id].start?.(this, p);
    this.playing.push(p);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.3;
    for (const p of this.playing) {
      if (!p.alive) continue;
      const def = TRACKS[p.id as Exclude<TrackId, 'none'>];
      const dur = 60 / def.bpm / 2;
      if (p.next < ctx.currentTime - 1) p.next = ctx.currentTime + 0.05;
      while (p.next < ahead) {
        def.step(this, p, p.step, p.next, dur);
        p.step++;
        p.next += dur;
      }
    }
  }

  // ---------- instrumentos ----------
  private osc(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }

  private env(t: number, a: number, peak: number, dest: AudioNode) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.connect(dest);
    return g;
  }

  piano(dest: AudioNode, t: number, m: number, vel: number, len: number) {
    const ctx = this.ctx!;
    const f = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(5200, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + Math.min(2.5, len * 0.6));
    lp.connect(dest);
    const g = this.env(t, 0.006, vel, lp);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0006, t + len);
    const end = t + len + 0.05;
    this.osc('triangle', f, t, end, g);
    const h = ctx.createGain();
    h.gain.value = 0.22;
    h.connect(g);
    this.osc('sine', f * 2, t, end, h, 3);
  }

  pad(dest: AudioNode, t: number, notes: number[], len: number, vol: number, cutoff = 800) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.6;
    lp.connect(dest);
    const g = this.env(t, 1.8, vol, lp);
    g.gain.setValueAtTime(vol, t + Math.max(1.9, len - 1.2));
    g.gain.linearRampToValueAtTime(0, t + len + 1.8);
    const end = t + len + 1.9;
    for (const n of notes) {
      this.osc('sawtooth', mtof(n), t, end, g, -7);
      this.osc('sawtooth', mtof(n), t, end, g, 7);
    }
  }

  choir(dest: AudioNode, t: number, m: number, len: number, vol: number) {
    const ctx = this.ctx!;
    const g = this.env(t, 1.4, vol, dest);
    g.gain.setValueAtTime(vol, t + Math.max(1.5, len - 1.5));
    g.gain.linearRampToValueAtTime(0, t + len + 1.5);
    const end = t + len + 1.6;
    for (const [fc, q, k] of [[700, 7, 1], [1150, 9, 0.6], [2600, 10, 0.25]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = q;
      const kg = ctx.createGain();
      kg.gain.value = k * 3;
      bp.connect(kg).connect(g);
      for (const det of [-9, 0, 9]) {
        const o = this.osc('sawtooth', mtof(m), t, end, bp, det);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4.6 + Math.random();
        const lg = ctx.createGain();
        lg.gain.value = 3;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t);
        lfo.stop(end);
      }
    }
  }

  bell(dest: AudioNode, t: number, m: number, vol: number) {
    const f = mtof(m);
    for (const [r, dec, k] of [[1, 3.2, 1], [2.76, 1.8, 0.45], [5.4, 0.9, 0.2]] as const) {
      const g = this.env(t, 0.003, vol * k, dest);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
      this.osc('sine', f * r, t, t + dec + 0.05, g);
    }
  }

  musicbox(dest: AudioNode, t: number, m: number, vol: number) {
    const f = mtof(m);
    const g = this.env(t, 0.002, vol, dest);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    this.osc('sine', f, t, t + 0.95, g);
    const h = this.env(t, 0.002, vol * 0.25, dest);
    h.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
    this.osc('triangle', f * 4, t, t + 0.35, h);
  }

  flute(dest: AudioNode, t: number, m: number, len: number, vol: number) {
    const ctx = this.ctx!;
    const g = this.env(t, 0.09, vol, dest);
    g.gain.setValueAtTime(vol, t + len * 0.7);
    g.gain.linearRampToValueAtTime(0, t + len);
    const o = this.osc('sine', mtof(m), t, t + len + 0.05, g);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = 4;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t + 0.2);
    lfo.stop(t + len + 0.05);
  }

  // nota contínua com filtro respirando; devolve a função que a desliga
  drone(dest: AudioNode, m: number, vol: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 110;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    const g = this.env(t, 3, vol, dest);
    lp.connect(g);
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = b.type = 'sawtooth';
    a.frequency.value = b.frequency.value = mtof(m);
    a.detune.value = -6;
    b.detune.value = 6;
    a.connect(lp);
    b.connect(lp);
    a.start(t);
    b.start(t);
    return () => {
      const now = ctx.currentTime;
      g.gain.setTargetAtTime(0, now, 0.6);
      for (const o of [a, b, lfo]) o.stop(now + 4);
    };
  }

  // ---------- ambiência ----------
  ambience(id: AmbienceId) {
    if (!this.ctx) {
      this.wantAmb = id;
      return;
    }
    if (this.amb?.id === id) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.amb) {
      const old = this.amb;
      old.bus.gain.setTargetAtTime(0, t, 0.8);
      window.setTimeout(() => {
        old.stop();
        old.bus.disconnect();
      }, 5000);
      this.amb = null;
    }
    if (id === 'none') return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 2);
    bus.connect(this.ambBus);
    const stops: (() => void)[] = [];
    const noise = (filter: BiquadFilterType, f: number, q: number, vol: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bf = ctx.createBiquadFilter();
      bf.type = filter;
      bf.frequency.value = f;
      bf.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(bf).connect(g).connect(bus);
      src.start(t, Math.random() * 1.5);
      stops.push(() => src.stop());
      return { bf, g };
    };
    const lfo = (param: AudioParam, rate: number, depth: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(param);
      o.start(t);
      stops.push(() => o.stop());
    };
    if (id === 'rain') {
      const body = noise('lowpass', 1500, 0.4, 0.3);
      lfo(body.g.gain, 0.09, 0.06);
      const patter = noise('bandpass', 4800, 0.7, 0.07);
      lfo(patter.g.gain, 0.23, 0.025);
      const low = noise('lowpass', 220, 0.5, 0.18);
      lfo(low.g.gain, 0.05, 0.06);
    } else if (id === 'crypt') {
      noise('lowpass', 140, 0.6, 0.2);
      const moan = noise('bandpass', 420, 7, 0.05);
      lfo(moan.bf.frequency, 0.045, 160);
      lfo(moan.g.gain, 0.08, 0.03);
    } else if (id === 'wind') {
      const w = noise('bandpass', 750, 0.8, 0.05);
      lfo(w.bf.frequency, 0.07, 260);
      lfo(w.g.gain, 0.11, 0.025);
      noise('bandpass', 2100, 1.2, 0.008);
      // passarinhos de vez em quando
      let alive = true;
      const chirp = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 4);
        const base = 2400 + Math.random() * 1400;
        for (let k = 0; k < n; k++) {
          const tt = now + k * (0.07 + Math.random() * 0.05);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(base, tt);
          o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), tt + 0.05);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.025, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.07);
          o.connect(g).connect(bus);
          o.start(tt);
          o.stop(tt + 0.08);
        }
        window.setTimeout(chirp, 2500 + Math.random() * 5000);
      };
      window.setTimeout(chirp, 1500);
      stops.push(() => (alive = false));
    }
    if (id === 'city') {
      // vento entre as casas, o murmúrio de uma cidade que reza baixo e um sino distante
      const w = noise('bandpass', 520, 0.7, 0.045);
      lfo(w.bf.frequency, 0.05, 180);
      lfo(w.g.gain, 0.09, 0.02);
      const crowd = noise('bandpass', 380, 3.5, 0.03);
      lfo(crowd.bf.frequency, 0.13, 70);
      lfo(crowd.g.gain, 0.21, 0.015);
      noise('lowpass', 160, 0.6, 0.08);
      let alive = true;
      const toll = () => {
        if (!alive) return;
        this.bell(bus, ctx.currentTime, pick([52, 55, 59]), 0.03);
        window.setTimeout(toll, 18000 + Math.random() * 22000);
      };
      window.setTimeout(toll, 6000 + Math.random() * 6000);
      stops.push(() => (alive = false));
    } else if (id === 'nave') {
      // o ar parado de uma nave enorme: grave fundo, um chiado de velas e vozes que voltam do eco
      noise('lowpass', 120, 0.6, 0.18);
      const air = noise('bandpass', 900, 0.5, 0.012);
      lfo(air.g.gain, 0.07, 0.006);
      let alive = true;
      const voice = () => {
        if (!alive) return;
        this.choir(bus, ctx.currentTime, pick([52, 55, 59, 64]), 4 + Math.random() * 3, 0.01);
        window.setTimeout(voice, 9000 + Math.random() * 12000);
      };
      const crackle = () => {
        if (!alive) return;
        const now = ctx.currentTime;
        for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) this.nz(bus, now + k * 0.03 + Math.random() * 0.02, 0.012, 'highpass', 5200, 4200, 0.03, 1);
        window.setTimeout(crackle, 700 + Math.random() * 2600);
      };
      window.setTimeout(voice, 3000);
      window.setTimeout(crackle, 900);
      stops.push(() => (alive = false));
    }
    this.amb = { id, bus, stop: () => stops.forEach((f) => f()) };
  }

  // ---------- efeitos ----------
  sfx(name: SfxName, opt: { vol?: number; rate?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const v = opt.vol ?? 1;
    const r = opt.rate ?? 1;
    const out = ctx.createGain();
    out.gain.value = v;
    out.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = this.space;
    out.connect(send).connect(this.reverb);
    window.setTimeout(() => out.disconnect(), 4500);
    switch (name) {
      case 'slash':
        this.nz(out, t, 0.09, 'bandpass', 2600 * r, 900 * r, 0.5, 2.5);
        break;
      case 'heavy':
        this.nz(out, t, 0.28, 'bandpass', 420 * r, 1700 * r, 0.55, 1.3);
        this.tone(out, t, 0.22, 'sine', 130, 55, 0.22);
        break;
      case 'stab':
        this.nz(out, t, 0.055, 'highpass', 3200 * r, 1500 * r, 0.38, 1);
        break;
      case 'bow':
        this.tone(out, t, 0.13, 'triangle', 230, 140, 0.22);
        this.nz(out, t, 0.06, 'bandpass', 1300, 700, 0.2, 2);
        break;
      case 'thunk':
        this.tone(out, t, 0.07, 'sine', 190, 80, 0.3);
        this.nz(out, t, 0.05, 'lowpass', 1000, 300, 0.28, 0.8);
        break;
      case 'dash':
        this.nz(out, t, 0.16, 'lowpass', 1800, 300, 0.45, 0.8);
        break;
      case 'jump':
        this.nz(out, t, 0.06, 'lowpass', 900, 400, 0.15, 0.7);
        break;
      case 'land':
        this.tone(out, t, 0.09, 'sine', 110, 50, 0.45);
        this.nz(out, t, 0.06, 'lowpass', 700, 200, 0.22, 0.7);
        if (this.stepKind === 'wet') this.nz(out, t, 0.12, 'bandpass', 2400, 900, 0.16, 1.2);
        break;
      case 'step':
        if (this.stepKind === 'grass') this.nz(out, t, 0.05, 'bandpass', 3000 * r, 1800, 0.07, 0.9);
        else this.nz(out, t, 0.035, 'lowpass', 520 * r, 180, 0.1, 0.8);
        if (this.stepKind === 'wet') this.nz(out, t + 0.01, 0.06, 'bandpass', 2600 * r, 1100, 0.07, 1.4);
        break;
      case 'hit':
        this.tone(out, t, 0.07, 'square', 240, 120, 0.12);
        this.nz(out, t, 0.08, 'highpass', 2500, 1200, 0.4, 1);
        break;
      case 'hurt':
        this.tone(out, t, 0.2, 'sawtooth', 140, 45, 0.25);
        this.nz(out, t, 0.22, 'highpass', 5000, 2500, 0.35, 4);
        this.tone(out, t + 0.02, 0.18, 'sine', 3100, 2900, 0.05);
        break;
      case 'kill':
        this.tone(out, t, 0.3, 'triangle', 420, 90, 0.25);
        this.nz(out, t, 0.25, 'bandpass', 1400, 300, 0.3, 1.5);
        break;
      case 'thunder': {
        // estalo seco e um ronco longo que rola
        this.nz(out, t, 0.16, 'highpass', 1800, 700, 0.18 * v, 0.7);
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(110, t + 3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.75, t + 0.08);
        g.gain.setTargetAtTime(0.35, t + 0.3, 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
        src.connect(lp).connect(g).connect(out);
        src.start(t, Math.random());
        src.stop(t + 3.7);
        break;
      }
      case 'drip':
        this.tone(out, t, 0.06, 'sine', 1500 * r, 700 * r, 0.16);
        this.tone(out, t + 0.035, 0.05, 'sine', 950 * r, 500 * r, 0.08);
        break;
      case 'crack':
        this.nz(out, t, 0.03, 'highpass', 4200, 3000, 0.4, 1);
        this.nz(out, t + 0.05, 0.025, 'highpass', 5200, 3500, 0.28, 1);
        this.nz(out, t + 0.11, 0.04, 'highpass', 3800, 2500, 0.34, 1);
        this.tone(out, t, 0.3, 'sine', 3100, 2800, 0.07);
        break;
      case 'shard':
        [1318.5, 1975.5, 2637].forEach((f, i) => {
          const tt = t + i * 0.12;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.12, tt + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 2.4);
          g.connect(out);
          this.osc('sine', f, tt, tt + 2.5, g);
        });
        break;
      case 'splash':
        this.nz(out, t, 0.2, 'bandpass', 1300, 380, 0.26, 1);
        break;
      case 'ui':
        this.tone(out, t, 0.035, 'sine', 900, 880, 0.07);
        break;
      case 'clang':
        // metal no metal: estalo agudo e duas notas que soam um pouco
        this.nz(out, t, 0.05, 'highpass', 5200, 3000, 0.4, 1.5);
        this.tone(out, t, 0.35, 'triangle', 1480 * r, 1420 * r, 0.12);
        this.tone(out, t, 0.25, 'square', 2210 * r, 2150 * r, 0.035);
        this.tone(out, t, 0.12, 'sine', 300, 160, 0.2);
        break;
      case 'caw': {
        // grasnado: ruído com formante que desce, repetido duas vezes
        for (let k = 0; k < 2; k++) {
          const tt = t + k * 0.16;
          this.nz(out, tt, 0.13, 'bandpass', 1500 * r, 700 * r, 0.32, 6);
          this.tone(out, tt, 0.12, 'sawtooth', 520 * r, 380 * r, 0.06);
        }
        break;
      }
      case 'swoosh':
        this.nz(out, t, 0.24, 'bandpass', 500 * r, 2600 * r, 0.4, 1.6);
        break;
      case 'thud':
        this.tone(out, t, 0.28, 'sine', 95, 38, 0.5);
        this.nz(out, t, 0.14, 'lowpass', 600, 120, 0.4, 0.8);
        this.nz(out, t + 0.03, 0.1, 'highpass', 3000, 1500, 0.08, 1);
        break;
      case 'chime':
        [784, 1175, 1568, 2349].forEach((f, i) => {
          const tt = t + i * 0.09;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime(0.1, tt + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 1.8);
          g.connect(out);
          this.osc('sine', f, tt, tt + 1.9, g);
        });
        break;
      case 'bell': {
        // sino grave: parciais inarmônicos que somem devagar
        [1, 2.4, 2.98, 4.2, 5.4].forEach((m, i) => {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime([0.22, 0.12, 0.08, 0.05, 0.03][i], t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2 - i * 0.4);
          g.connect(out);
          this.osc('sine', 98 * r * m, t, t + 3.3, g);
        });
        this.nz(out, t, 0.05, 'highpass', 2500, 1200, 0.25, 1);
        break;
      }
      case 'rest':
        this.nz(out, t, 0.5, 'bandpass', 900, 2400, 0.12, 0.8);
        [523, 659, 784].forEach((f, i) => this.tone(out, t + 0.12 * i, 0.9, 'sine', f, f * 0.995, 0.06));
        break;
      case 'coin':
        this.tone(out, t, 0.08, 'square', 1900, 1880, 0.05);
        this.tone(out, t + 0.07, 0.3, 'sine', 2600, 2580, 0.08);
        break;
      case 'tink':
        // moeda: um tilintar curto e brilhante (quicando no chão ou pega)
        this.tone(out, t, 0.04, 'square', 2400 * r, 2350 * r, 0.02);
        this.tone(out, t, 0.2, 'sine', 3150 * r, 3120 * r, 0.07);
        this.tone(out, t + 0.03, 0.15, 'sine', 4720 * r, 4700 * r, 0.03);
        break;
      case 'mend':
        // caco de porcelana voltando para a máscara: duas notas de vidro que sobem
        [1046.5, 1568, 2093].forEach((f, i) => {
          const tt = t + i * 0.07;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, tt);
          g.gain.linearRampToValueAtTime([0.1, 0.08, 0.04][i], tt + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, tt + 1.3);
          g.connect(out);
          this.osc('sine', f, tt, tt + 1.4, g);
        });
        this.nz(out, t, 0.08, 'highpass', 6500, 4200, 0.05, 1);
        break;
      case 'ghost':
        // atravessar um inimigo no dash: um sopro oco que passa
        this.nz(out, t, 0.3, 'bandpass', 360 * r, 1500 * r, 0.32, 3);
        this.tone(out, t, 0.26, 'sine', 240 * r, 120 * r, 0.05);
        break;
      case 'roar':
        this.nz(out, t, 0.9, 'bandpass', 240, 160, 0.5, 2.5);
        this.tone(out, t, 0.9, 'sawtooth', 70, 48, 0.2);
        break;
      case 'ui-ok':
        this.tone(out, t, 0.06, 'sine', 660, 650, 0.09);
        this.tone(out, t + 0.06, 0.12, 'sine', 990, 980, 0.08);
        break;
      case 'ash':
        // criaturas virando cinza: um chiado seco que esfarela e um sopro grave por baixo
        this.nz(out, t, 1.1, 'bandpass', 2400 * r, 500 * r, 0.22, 0.9);
        this.nz(out, t + 0.05, 0.8, 'highpass', 6000, 3200, 0.06, 0.7);
        this.tone(out, t, 0.9, 'sine', 160 * r, 70 * r, 0.08);
        break;
      case 'quake':
        // o badalo no chão: pancada funda, terra que rola e um estalo de pedra
        this.tone(out, t, 0.55, 'sine', 70 * r, 34 * r, 0.6);
        this.nz(out, t, 0.45, 'lowpass', 900, 120, 0.45, 0.7);
        this.nz(out, t, 0.03, 'highpass', 3600, 2200, 0.22, 1);
        break;
      case 'equip':
        // item no lugar: fivela de metal e uma nota curta
        this.nz(out, t, 0.04, 'highpass', 4200, 2600, 0.16, 1.2);
        this.tone(out, t + 0.02, 0.16, 'triangle', 740 * r, 720 * r, 0.07);
        this.tone(out, t + 0.07, 0.22, 'sine', 1110 * r, 1100 * r, 0.05);
        break;
      case 'erase':
        // progresso apagado: notas que descem e um sopro que leva tudo
        [784, 587, 440, 330].forEach((f, i) => this.tone(out, t + i * 0.11, 0.5, 'sine', f, f * 0.985, 0.06));
        this.nz(out, t, 1.2, 'bandpass', 1800, 300, 0.12, 0.8);
        break;
      case 'parry':
        // aparar: um tinido limpo e alto que ecoa, diferente do escudo (mais agudo e brilhante)
        this.nz(out, t, 0.04, 'highpass', 7000, 4500, 0.4, 1.2);
        this.tone(out, t, 0.7, 'triangle', 2637 * r, 2600 * r, 0.14);
        this.tone(out, t, 0.5, 'sine', 3951 * r, 3920 * r, 0.07);
        this.tone(out, t + 0.012, 0.9, 'sine', 1318 * r, 1310 * r, 0.08);
        this.tone(out, t, 0.12, 'sine', 220, 110, 0.25);
        break;
      case 'break':
        // parede falsa caindo: pedra que racha, desaba e rola
        this.nz(out, t, 0.04, 'highpass', 3600, 2400, 0.3, 1);
        this.nz(out, t + 0.03, 0.55, 'lowpass', 1400 * r, 160, 0.5, 0.7);
        this.tone(out, t + 0.02, 0.4, 'sine', 90, 40, 0.45);
        for (let k = 0; k < 6; k++) this.nz(out, t + 0.12 + k * 0.07 + Math.random() * 0.05, 0.05, 'bandpass', 900 + Math.random() * 900, 400, 0.12, 2);
        break;
      case 'glass':
        // vitral estilhaçando: estalo e uma chuva de cacos agudos que tilintam
        this.nz(out, t, 0.06, 'highpass', 6000, 3500, 0.45, 1);
        this.nz(out, t, 0.5, 'highpass', 4200, 2600, 0.12, 0.8);
        for (let k = 0; k < 14; k++) {
          const tt = t + 0.02 + Math.random() * 0.6;
          const f = 2800 + Math.random() * 4200;
          this.tone(out, tt, 0.18 + Math.random() * 0.2, 'sine', f * r, f * r * 0.99, 0.02 + Math.random() * 0.025);
        }
        break;
      case 'page':
        // página do diário: papel velho virando
        this.nz(out, t, 0.12, 'bandpass', 2600, 4200, 0.12, 0.9);
        this.nz(out, t + 0.1, 0.16, 'bandpass', 3400, 2100, 0.1, 0.9);
        this.tone(out, t + 0.05, 0.6, 'sine', 1568, 1560, 0.035);
        break;
      case 'anvil':
        // martelo na bigorna: pancada seca e o ferro cantando por um tempo
        this.nz(out, t, 0.03, 'highpass', 5000, 3000, 0.35, 1);
        this.tone(out, t, 1.2, 'triangle', 1190 * r, 1180 * r, 0.1);
        this.tone(out, t, 0.9, 'sine', 2950 * r, 2930 * r, 0.05);
        this.tone(out, t, 0.6, 'sine', 4410 * r, 4400 * r, 0.025);
        this.tone(out, t, 0.08, 'sine', 180, 90, 0.3);
        break;
      case 'smoke':
        // incenso soltando fumaça: um sopro abafado que cresce e some
        {
          const src = ctx.createBufferSource();
          src.buffer = this.noise;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(500 * r, t);
          lp.frequency.exponentialRampToValueAtTime(180, t + 0.8);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.3, t + 0.12);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
          src.connect(lp).connect(g).connect(out);
          src.start(t, Math.random());
          src.stop(t + 0.95);
        }
        break;
      case 'echo': {
        // a sombra: um sopro que cresce ao contrário e duas notas ocas que sobem juntas
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.32);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
        g.connect(out);
        this.nz(g, t, 0.62, 'bandpass', 220 * r, 1100 * r, 0.6, 5);
        [146.8, 220].forEach((f, i) => {
          const o = ctx.createGain();
          o.gain.setValueAtTime(0.0001, t);
          o.gain.exponentialRampToValueAtTime(i ? 0.035 : 0.06, t + 0.3);
          o.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
          o.connect(out);
          const osc = this.osc(i ? 'triangle' : 'sine', f * r, t, t + 0.72, o);
          osc.frequency.exponentialRampToValueAtTime(f * r * 1.5, t + 0.6);
        });
        break;
      }
      case 'echo-die':
        // a sombra se desfaz: um respiro que se solta, vidro escuro e um sino pequeno
        this.nz(out, t, 0.8, 'bandpass', 1400 * r, 260 * r, 0.32, 2);
        this.tone(out, t, 0.9, 'sine', 330 * r, 82 * r, 0.12);
        [988, 1480, 1976].forEach((f, i) => this.tone(out, t + 0.16 + i * 0.07, 1.1, 'sine', f * r, f * r * 0.995, 0.05));
        break;
      case 'coinrain':
        // chuva do dízimo: moedas batendo em toda parte
        for (let k = 0; k < 16; k++) {
          const tt = t + Math.random() * 0.9;
          const f = 2300 + Math.random() * 1600;
          this.tone(out, tt, 0.12, 'sine', f, f * 0.99, 0.03);
          this.tone(out, tt, 0.03, 'square', f * 0.75, f * 0.74, 0.008);
        }
        break;
      case 'door':
        // porta pesada de madeira: rangido grave e o baque ao fechar
        this.nz(out, t, 0.5, 'bandpass', 280 * r, 420 * r, 0.16, 6);
        this.tone(out, t, 0.45, 'sawtooth', 92 * r, 70 * r, 0.04);
        this.tone(out, t + 0.42, 0.25, 'sine', 90, 42, 0.4);
        this.nz(out, t + 0.42, 0.12, 'lowpass', 700, 150, 0.25, 0.8);
        break;
      case 'locked':
        // trinco que não cede: três batidas curtas de ferro
        for (let k = 0; k < 3; k++) {
          this.tone(out, t + k * 0.09, 0.06, 'square', 340, 300, 0.05);
          this.nz(out, t + k * 0.09, 0.04, 'bandpass', 1600, 900, 0.16, 3);
        }
        break;
      case 'censer':
        // incensário girando na corrente: elos que chiam e o metal que tilinta
        this.nz(out, t, 0.32, 'bandpass', 700 * r, 2400 * r, 0.22, 1.4);
        for (let k = 0; k < 5; k++) this.tone(out, t + k * 0.05, 0.05, 'square', (2900 + k * 140) * r, 2800 * r, 0.012);
        break;
      case 'draw':
        // corda do arco esticando
        this.tone(out, t, 0.45, 'triangle', 160 * r, 260 * r, 0.05);
        this.nz(out, t, 0.4, 'bandpass', 1800, 2600, 0.04, 4);
        break;
      case 'gate':
        // grade de ferro subindo: corrente que range e roda
        for (let k = 0; k < 10; k++) {
          this.tone(out, t + k * 0.16, 0.08, 'square', 210 + (k % 2) * 30, 180, 0.03);
          this.nz(out, t + k * 0.16, 0.07, 'bandpass', 1300, 700, 0.07, 3);
        }
        this.nz(out, t, 1.7, 'lowpass', 400, 200, 0.12, 0.7);
        break;
    }
  }

  private tone(dest: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private nz(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioEngine();
