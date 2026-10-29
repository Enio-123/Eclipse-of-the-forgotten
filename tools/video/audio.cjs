// O som do vídeo "como zerar". Abre o jogo só para ter o motor de som dele (systems/Audio.ts), troca o
// contexto de áudio por um OfflineAudioContext do tamanho do trecho e repete, no tempo do vídeo, o que o
// jogo pediu na gravação (<trecho>.audio.json, de capture.cjs). O motor anda pelo relógio virtual
// (clock.js), parado a cada 512 amostras: os timers dele (a trilha agenda à frente a cada 50 ms, a
// ambiência sorteia os sons dela) vencem no tempo do áudio, não no do navegador.
// Depois junta os trechos na ordem do vídeo em trilha.wav: o fim de cada um continua por baixo do começo
// do próximo, e os trechos que apagam para o preto apagam o som junto.
// uso: node tools/video/audio.cjs <pasta> [trechos]   (FORCE=1 refaz os que já existem)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(process.argv[2] || 'video-out');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const GAME = process.env.GAME || 'http://localhost:8765';
const SR = 48000;
// quanto do fim de um trecho toca por baixo do começo do próximo
const TAIL = 0.6;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// a ordem do vídeo, lida do roteiro
const ORDER = (() => {
  const src = fs.readFileSync(path.join(__dirname, 'plan.js'), 'utf8');
  const m = src.match(/window\.__order = (\[[^\]]*\])/);
  return JSON.parse(m[1].replace(/'/g, '"'));
})();

// WAV de 32 bits em ponto flutuante ou de 16 bits
function writeWav(file, chans, bits) {
  const n = chans[0].length;
  const nc = chans.length;
  const bps = bits / 8;
  const data = Buffer.alloc(n * nc * bps);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const v = chans[c][i];
      const o = (i * nc + c) * bps;
      if (bits === 32) data.writeFloatLE(v, o);
      else data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), o);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(bits === 32 ? 3 : 1, 20);
  h.writeUInt16LE(nc, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * nc * bps, 28);
  h.writeUInt16LE(nc * bps, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

function readWav32(file) {
  const b = fs.readFileSync(file);
  const n = (b.length - 44) / 8;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = b.readFloatLE(44 + i * 8);
    R[i] = b.readFloatLE(48 + i * 8);
  }
  return [L, R];
}

// dentro da página: o trecho inteiro no OfflineAudioContext
async function renderInPage({ take, SR, TAIL }) {
  const V = window.__V;
  const A = window.__audio;
  const Q = 512 / SR;
  const len = Math.ceil(((take.dur + TAIL) * SR) / 512) * 512;
  const off = new OfflineAudioContext(2, len, SR);
  // o motor só toca com o contexto "rodando"; o offline fica "suspenso" a cada parada
  Object.defineProperty(off, 'state', { get: () => 'running', configurable: true });
  // o motor do zero para este trecho (os timers do trecho anterior vão embora junto)
  V.timers = [];
  A.ctx = null;
  A.playing = [];
  A.amb = null;
  A.wantTrack = 'none';
  A.wantAmb = 'none';
  window.AudioContext = function () {
    return off;
  };
  A.init();
  const base = V.now;
  const ev = take.log.slice().sort((a, b) => a.t - b.t);
  let i = 0;
  const errs = [];
  const fire = (T) => {
    while (i < ev.length && ev[i].t <= T + 1e-9) {
      const e = ev[i++];
      A.stepKind = e.k;
      A.space = e.s;
      try {
        A[e.m](...e.a);
      } catch (err) {
        errs.push(`${e.m} ${JSON.stringify(e.a)}: ${err.message}`);
      }
    }
  };
  const decoding = () => [...A.files.values()].some((f) => f.decoding);
  // uma faixa gravada decodificando: o áudio espera ela (o tempo do trecho não anda)
  const settle = async () => {
    for (let k = 0; k < 1500 && decoding(); k++) await V.wait(20);
    A.schedule();
  };
  fire(0);
  A.schedule();
  await settle();
  const tick = async (n) => {
    const T = n * Q;
    V.advance(base + T * 1000 - V.now);
    fire(T);
    if (decoding()) await settle();
    // a conta em amostras: em segundos a última parada pode cair no fim exato e o contexto recusa
    if ((n + 1) * 512 < len) off.suspend((n + 1) * Q).then(() => tick(n + 1));
    off.resume();
  };
  off.suspend(Q).then(() => tick(1));
  const buf = await off.startRendering();
  const b64 = (f32) => {
    const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return btoa(s);
  };
  let peak = 0;
  for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  return { L: b64(buf.getChannelData(0)), R: b64(buf.getChannelData(1)), errs, peak, fired: i, total: ev.length };
}

(async () => {
  const ids = (ONLY || ORDER).filter((id) => fs.existsSync(path.join(DIR, `${id}.audio.json`)));
  const todo = ids.filter((id) => process.env.FORCE || !fs.existsSync(path.join(DIR, `${id}.wav`)));
  if (todo.length) {
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const perrs = [];
    page.on('pageerror', (e) => perrs.push('ERR ' + e.message));
    await page.addInitScript({ path: path.join(__dirname, 'clock.js') });
    await page.goto(`${GAME}/index.html?res=1&gfx=performance`);
    await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
    // o jogo para: daqui em diante só o motor de som anda, no relógio virtual
    await page.evaluate(() => {
      window.__game.loop.sleep();
      window.__V.start();
    });
    for (const id of todo) {
      const take = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.audio.json`), 'utf8'));
      const t0 = Date.now();
      const r = await page.evaluate(renderInPage, { take, SR, TAIL });
      const L = new Float32Array(new Uint8Array(Buffer.from(r.L, 'base64')).buffer);
      const R = new Float32Array(new Uint8Array(Buffer.from(r.R, 'base64')).buffer);
      writeWav(path.join(DIR, `${id}.wav`), [L, R], 32);
      log(`${id}: ${(L.length / SR).toFixed(2)} s, ${r.fired} de ${r.total} sons, pico ${r.peak.toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(1)} s${r.errs.length ? `, erros: ${r.errs.slice(0, 4).join(' | ')}` : ''}`);
      if (perrs.length) log(`  erros da página: ${perrs.splice(0).slice(0, 6).join(' | ')}`);
    }
    await browser.close();
  }

  // ---------- a trilha do vídeo inteiro ----------
  const parts = ORDER.filter((id) => fs.existsSync(path.join(DIR, `${id}.wav`)) && fs.existsSync(path.join(DIR, `${id}.audio.json`)));
  const meta = parts.map((id) => JSON.parse(fs.readFileSync(path.join(DIR, `${id}.audio.json`), 'utf8')));
  // cada trecho dura no vídeo o número inteiro de quadros que ele gravou
  const durs = meta.map((m) => Math.round(m.dur * 30) / 30);
  const total = Math.round(durs.reduce((a, b) => a + b, 0) * SR);
  const out = [new Float32Array(total), new Float32Array(total)];
  let at = 0;
  parts.forEach((id, k) => {
    const [L, R] = readWav32(path.join(DIR, `${id}.wav`));
    const d = durs[k];
    const fi = Math.max(meta[k].fadeIn, 0.04);
    const fo = meta[k].fadeOut;
    const s0 = Math.round(at * SR);
    for (let i = 0; i < L.length; i++) {
      const t = i / SR;
      let g = Math.min(1, t / fi);
      // o trecho que apaga para o preto leva o som junto; os outros saem por baixo do próximo
      if (fo) g *= Math.max(0, Math.min(1, (d - t) / fo));
      else if (t > d) g *= Math.max(0, 1 - (t - d) / TAIL);
      if (g <= 0) continue;
      const o = s0 + i;
      if (o >= total) break;
      out[0][o] += L[i] * g;
      out[1][o] += R[i] * g;
    }
    at += d;
  });
  // em ponto flutuante: o volume final é acertado na montagem (montar.sh), sem cortar os picos aqui
  writeWav(path.join(DIR, 'trilha.wav'), out, 32);
  let peak = 0;
  for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
  log(`trilha.wav: ${parts.length} trechos, ${(total / SR).toFixed(2)} s, pico ${peak.toFixed(2)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
