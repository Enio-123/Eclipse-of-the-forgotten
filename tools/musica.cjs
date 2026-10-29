// Ouve as faixas sintetizadas sem o jogo: monta o Audio.ts num pacote de teste, toca cada faixa num
// OfflineAudioContext do Chromium e devolve o volume (RMS em dB a cada 5 s e o pico), quantas notas cada
// instrumento tocou e as notas fora da escala. Grava um .wav de cada faixa na pasta de saída.
// uso: [MUTE=metal,drum] [SR=44100] node musica.cjs <saida> <segundos> faixa1 faixa2 ...
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const [out, secsArg, ...ids] = process.argv.slice(2);
const secs = Number(secsArg) || 60;
const game = path.join(__dirname, '..', 'game');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'musica-'));
const src = fs.readFileSync(path.join(game, 'src/systems/Audio.ts'), 'utf8');
fs.writeFileSync(path.join(tmp, 'Audio.ts'), `${src}\nexport { TRACKS, AudioEngine };\n`);
fs.writeFileSync(path.join(tmp, 'Settings.ts'), 'export const settings = { data: { volume: 1, music: 1, sfx: 1 }, onChange(_f: () => void) {} };\n');
execFileSync(path.join(game, 'node_modules/.bin/esbuild'), [path.join(tmp, 'Audio.ts'), '--bundle', '--format=iife', '--global-name=A', `--outfile=${path.join(tmp, 'a.js')}`], { stdio: 'inherit' });
const bundle = fs.readFileSync(path.join(tmp, 'a.js'), 'utf8');
fs.mkdirSync(out, { recursive: true });

// as escalas de cada faixa (classes de nota) e as notas de fora que a harmonia pede de propósito
const SCALE = {
  torres: [7, 9, 10, 0, 2, 3, 5, 6],
  boss8: [2, 4, 5, 7, 9, 10, 0, 1, 3],
  boss9: [7, 9, 10, 0, 2, 3, 5, 1, 4],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle });
  for (const id of ids) {
    const r = await page.evaluate(async ({ id, secs, mute, sr }) => {
      window.AudioContext = function () {
        return new OfflineAudioContext(2, sr * secs, sr);
      };
      const eng = new A.AudioEngine();
      eng.init();
      const ctx = eng.ctx;
      const def = A.TRACKS[id];
      const bus = ctx.createGain();
      bus.connect(eng.musicBus);
      const send = ctx.createGain();
      send.gain.value = 0.55;
      bus.connect(send).connect(eng.reverb);
      const p = { id, bus, step: 0, next: 0.1, stop: [], alive: true };
      const count = {};
      const notes = [];
      for (const k of ['piano', 'pad', 'choir', 'bell', 'musicbox', 'metal', 'chain', 'flute', 'horn', 'drum']) {
        const f = eng[k].bind(eng);
        eng[k] = (...a) => {
          count[k] = (count[k] ?? 0) + 1;
          if (k !== 'drum' && k !== 'chain' && k !== 'metal') {
            const ms = Array.isArray(a[2]) ? a[2] : [a[2]];
            for (const m of ms) notes.push([k, p.step, m]);
          }
          if (mute.includes(k)) return undefined;
          return f(...a);
        };
      }
      def.start?.(eng, p);
      const dur = 60 / def.bpm / 2;
      while (p.next < secs - 1) {
        def.step(eng, p, p.step, p.next, dur);
        p.step++;
        p.next += dur;
      }
      const buf = await ctx.startRendering();
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      let peak = 0;
      const win = [];
      const w = sr * 5;
      for (let s = 0; s + w <= L.length; s += w) {
        let acc = 0;
        for (let i = s; i < s + w; i++) {
          const v = (L[i] + R[i]) / 2;
          acc += v * v;
          peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        }
        win.push(Math.round(10 * Math.log10(acc / w + 1e-12) * 10) / 10);
      }
      // wav de 16 bits
      const n = L.length;
      const data = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      data.setUint32(4, 36 + n * 4, true);
      str(8, 'WAVEfmt ');
      data.setUint32(16, 16, true);
      data.setUint16(20, 1, true);
      data.setUint16(22, 2, true);
      data.setUint32(24, sr, true);
      data.setUint32(28, sr * 4, true);
      data.setUint16(32, 4, true);
      data.setUint16(34, 16, true);
      str(36, 'data');
      data.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      let bin = '';
      const bytes = new Uint8Array(data.buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { win, peak: Math.round(peak * 1000) / 1000, count, notes, wav: btoa(bin), steps: p.step };
    }, { id, secs, mute: (process.env.MUTE ?? '').split(','), sr: Number(process.env.SR) || 22050 });
    fs.writeFileSync(path.join(out, `${id}.wav`), Buffer.from(r.wav, 'base64'));
    const fam = id.startsWith('torres') ? 'torres' : id;
    const sc = SCALE[fam];
    const off = sc ? r.notes.filter(([, , m]) => !sc.includes(((m % 12) + 12) % 12)) : [];
    const mean = r.win.length ? Math.round((r.win.reduce((a, b) => a + b, 0) / r.win.length) * 10) / 10 : 0;
    console.log(`${id}: média ${mean} dB, pico ${r.peak}, passos ${r.steps}`);
    console.log(`  a cada 5 s: ${r.win.join(' ')}`);
    console.log(`  notas: ${Object.entries(r.count).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (sc) console.log(`  fora da escala: ${off.length ? off.slice(0, 12).map(([k, s, m]) => `${k}@${s}:${m}`).join(' ') : 'nenhuma'}`);
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})();
