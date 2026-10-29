// Grava o vídeo "como zerar", trecho por trecho. O jogo anda pelo relógio virtual (clock.js), então cada
// quadro sai no lugar mesmo com o navegador de teste desenhando devagar; o som que o jogo pede fica num
// registro por trecho e vira áudio depois (audio.cjs), e montar.sh junta tudo.
// uso: node tools/video/capture.cjs <pasta-saída> [trechos,separados,por,vírgula]
//   GAME     endereço do jogo (padrão http://localhost:8765)
//   RES      pixels da tela por pixel do mundo: 2 dá 1280x720, 3 dá 1920x1080 (padrão 2)
//   GFX      predefinição gráfica (padrão extreme)
//   PREVIEW  n: não grava vídeo; desenha e salva um quadro a cada n (o resto anda sem desenhar) e
//            escreve como está o trecho a cada segundo, para acertar posições e o lutador
//   STATUS   na prévia, de quantos em quantos quadros escreve como está o trecho (padrão 30)
//   EXTRA    um roteiro a mais, carregado depois do plan.js (trechos de teste)
//   GL       mesa: desenha pelo Mesa num X virtual (precisa de DISPLAY, por exemplo Xvfb :99)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || 'video-out');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const GAME = process.env.GAME || 'http://localhost:8765';
const RES = Number(process.env.RES || 2);
const GFX = process.env.GFX || 'extreme';
const PREVIEW = Number(process.env.PREVIEW || 0);
// na prévia, de quantos em quantos quadros escreve como está o trecho (padrão: um por segundo)
const STATUS = Number(process.env.STATUS || 30);
// um roteiro a mais, carregado depois do plan.js (trechos de teste)
const EXTRA = process.env.EXTRA || '';
const FPS = 30;
// passos do jogo (60 por segundo) em cada quadro do vídeo
const SUB = 60 / FPS;
const W = 640 * RES;
const H = 360 * RES;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// as sombras sobem um pouco no vídeo (as salas fechadas do jogo são escuras de propósito; num vídeo comprimido o
// escuro some): uma curva que levanta o pé e quase não mexe no claro. grade: false no trecho deixa como está
const LIFT = "curves=all='0/0 0.05/0.09 0.2/0.29 0.5/0.6 1/1'";

// o codificador: os quadros entram em JPEG pela entrada padrão
function encoder(file, vf) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(vf ? ['-vf', vf] : []), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg saiu com ${c}`)))));
  return {
    write: (buf) => (ff.stdin.write(buf) ? Promise.resolve() : new Promise((r) => ff.stdin.once('drain', r))),
    end: () => {
      ff.stdin.end();
      return done;
    },
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // GL=mesa: o Chromium com janela num X virtual (DISPLAY, Xvfb) desenha pelo OpenGL do Mesa (llvmpipe), mais
  // rápido que o SwiftShader do modo sem janela. O llvmpipe está na lista de bloqueio do Chromium: sem liberar,
  // o WebGL não liga e o jogo cai no desenho por canvas (sem a luz do EXTREME)
  const mesa = process.env.GL === 'mesa';
  const gl = mesa ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', `--window-size=${W},${H}`] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ headless: !mesa, args: [...gl, '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('CONSOLE ' + m.text());
  });
  await page.addInitScript({ path: path.join(__dirname, 'clock.js') });
  await page.goto(`${GAME}/index.html?res=${RES}&gfx=${GFX}`);
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  // sem WebGL o jogo desenha por canvas, sem a luz nem os filtros: não serve para o vídeo
  const gpu = await page.evaluate(() => {
    const r = window.__game.renderer;
    const g = r.gl;
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    return { webgl: r.type === 2, name: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '' };
  });
  log(`desenho: ${gpu.webgl ? 'WebGL' : 'canvas'} ${gpu.name}`);
  if (!gpu.webgl) throw new Error('o jogo abriu sem WebGL');
  // a tela de título termina de entrar (no relógio de verdade, antes de o vídeo começar)
  await page.waitForTimeout(2500);
  await page.addScriptTag({ path: path.join(__dirname, 'vid.js') });
  await page.addScriptTag({ path: path.join(__dirname, 'plan.js') });
  if (EXTRA) await page.addScriptTag({ path: path.resolve(EXTRA) });
  // a foto de cada quadro direto pelo protocolo do Chromium (sem as esperas da foto do Playwright)
  const cdp = await page.context().newCDPSession(page);
  const grab = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true })).data, 'base64');
  const order = ONLY || (await page.evaluate(() => window.__order));
  const summary = [];
  for (const id of order) {
    const t0 = Date.now();
    await page.evaluate((id) => window.__vid.begin(id), id);
    // a sala carrega: o jogo anda sem gravar até ela assentar (o carregamento de verdade corre no meio)
    let ready = false;
    for (let i = 0; i < 2400 && !ready; i++) {
      ready = await page.evaluate(() => {
        window.__vid.preroll(2);
        return window.__vid.isReady();
      });
      if (!ready && i % 4 === 3) await page.waitForTimeout(40);
    }
    if (!ready) log(`${id}: a sala não assentou, gravando assim mesmo`);
    // mais meio segundo parado, para a luz e a pintura em HD chegarem
    await page.evaluate(() => window.__vid.preroll(30));
    await page.evaluate(() => window.__vid.go());
    const grade = await page.evaluate((id) => window.__plan[id].grade, id);
    const enc = PREVIEW ? null : encoder(path.join(OUT, `${id}.mp4`), grade === false ? null : grade || LIFT);
    if (PREVIEW) fs.mkdirSync(path.join(OUT, id), { recursive: true });
    let n = 0;
    const t1 = Date.now();
    for (;;) {
      const draw = !PREVIEW || n % PREVIEW === 0;
      const [done, st] = await page.evaluate(([draw, sub]) => [window.__vid.frame(sub, draw), window.__vid.status()], [draw, SUB]);
      if (draw) {
        const jpg = await grab();
        if (enc) await enc.write(jpg);
        else fs.writeFileSync(path.join(OUT, id, `${String(n).padStart(4, '0')}.jpg`), jpg);
      }
      if (PREVIEW && n % STATUS === 0) log(id, JSON.stringify(st));
      n++;
      if (done) break;
      if (n > FPS * 120) {
        log(`${id}: passou de 2 minutos, parando`);
        break;
      }
    }
    if (enc) await enc.end();
    const take = await page.evaluate(() => ({ ...window.__vid.take(), dur: window.__vid.dur(), fadeIn: window.__vid.seg.fadeIn || 0, fadeOut: window.__vid.seg.fadeOut || 0, boss: !!window.__vid.seg.boss }));
    fs.writeFileSync(path.join(OUT, `${id}.audio.json`), JSON.stringify(take));
    const line = `${id}: ${n} quadros (${(n / FPS).toFixed(2)} s), ${take.log.length} sons, ${((Date.now() - t0) / 1000).toFixed(0)} s de gravação (${((Date.now() - t1) / n).toFixed(0)} ms por quadro)${take.boss ? (take.down != null ? `, chefe caiu em ${take.down.toFixed(2)} s` : ', CHEFE NÃO CAIU') : ''}${take.err.length ? `, erros do roteiro: ${take.err.join(' | ')}` : ''}`;
    log(line);
    summary.push(line);
    if (errs.length) {
      log(`  erros da página: ${errs.splice(0).slice(0, 8).join(' | ')}`);
    }
  }
  fs.writeFileSync(path.join(OUT, `resumo-${Date.now()}.txt`), summary.join('\n') + '\n');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
