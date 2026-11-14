// Confere a versão para celular: a imagem deitada com o celular em pé (e para o outro lado), a imagem pequena
// em cima, o celular deitado, o PC (canvas no centro), a tela cheia ao começar, o analógico na página deitada,
// o editor dos botões (lugar, tamanho, opacidade, padrão, fica salvo) e o brilho.
// uso: node tools/celular.cjs <pasta das fotos> [endereço do jogo]
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || '/tmp';
const GAME = process.argv[3] || process.env.GAME || 'http://localhost:8765';
const URL = GAME.replace(/\/index\.html$/, '') + '/index.html';

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + msg);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const PHONE = devices['Pixel 7'];
const KEY = 'eclipse-ajustes-v1';

// um ponto da página (deitada ou não) na tela de verdade
function toViewport(turn, W, H, x, y) {
  if (turn === 90) return { x: W - y, y: x };
  if (turn === -90) return { x: y, y: H - x };
  return { x, y };
}

async function state(page) {
  return page.evaluate(() => {
    const html = document.documentElement.classList;
    const turn = html.contains('turn-cw') ? 90 : html.contains('turn-ccw') ? -90 : 0;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // o retângulo de um elemento nas medidas da página
    const local = (el) => {
      const r = el.getBoundingClientRect();
      if (turn === 90) return { left: r.top, top: W - r.right, width: r.height, height: r.width };
      if (turn === -90) return { left: H - r.bottom, top: r.left, width: r.height, height: r.width };
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const center = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = local(el);
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
    };
    const ls = document.getElementById('layer').style;
    return {
      turn, W, H, small: html.contains('small-portrait'),
      bw: document.body.clientWidth, bh: document.body.clientHeight,
      canvas: local(document.querySelector('#game canvas')),
      layer: { left: parseFloat(ls.left), top: parseFloat(ls.top), width: parseFloat(ls.width), height: parseFloat(ls.height) },
      game: local(document.getElementById('game')),
      stick: center('#stick'), jump: center('#buttons [data-action="jump"]'), attack: center('#buttons [data-action="attack"]'), pause: center('#pause-btn'),
    };
  });
}

async function newPage(browser, ctxOpts, saved) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    console.log('ERRO na página: ' + e.message);
    fails++;
  });
  if (saved) {
    await page.addInitScript(
      ([k, x]) => {
        if (sessionStorage.getItem('__seeded')) return;
        sessionStorage.setItem('__seeded', '1');
        const cur = JSON.parse(localStorage.getItem(k) || '{}');
        localStorage.setItem(k, JSON.stringify({ ...cur, ...x }));
      },
      [KEY, saved],
    );
  }
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

async function startRoom(page, room = 'ponte') {
  await page.evaluate((room) => {
    window.__ui.closeAll();
    const g = window.__game;
    g.scene.getScene('title').scene.stop();
    g.scene.start('game', { room, entry: 'P', from: 'continue' });
  }, room);
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.scene.isActive(), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
}

// arrasta o dedo de (x, y) por (dx, dy), tudo nas medidas da página
async function drag(ctx, page, st, x, y, dx, dy, id = 1, hold = 700) {
  const cdp = await ctx.newCDPSession(page);
  const p0 = toViewport(st.turn, st.W, st.H, x, y);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id }] });
  for (let i = 1; i <= 8; i++) {
    const p = toViewport(st.turn, st.W, st.H, x + (dx * i) / 8, y + (dy * i) / 8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id }] });
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(150);
}

// anda com o analógico para a direita e para a esquerda da página
async function walk(ctx, page, label) {
  const st = await state(page);
  const x0 = await page.evaluate(() => window.__scene.player.x);
  await drag(ctx, page, st, st.stick.x, st.stick.y, 50, 0, 1, 800);
  const x1 = await page.evaluate(() => window.__scene.player.x);
  await drag(ctx, page, st, st.stick.x, st.stick.y, -50, 0, 1, 800);
  const x2 = await page.evaluate(() => window.__scene.player.x);
  ok(x1 - x0 > 30, `${label}: o analógico para a direita da página anda para a direita (${Math.round(x1 - x0)} px)`);
  ok(x2 - x1 < -30, `${label}: e para a esquerda anda para a esquerda (${Math.round(x2 - x1)} px)`);
}

// brilho médio do canvas (na foto da tela)
async function canvasMean(page) {
  const buf = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const r = document.querySelector('#game canvas').getBoundingClientRect();
    const k = img.width / window.innerWidth;
    const d = g.getImageData(Math.round(r.left * k), Math.round(r.top * k), Math.round(r.width * k), Math.round(r.height * k)).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }, buf.toString('base64'));
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // ---------- PC: o canvas no centro (antes ficava deslocado), sem a aba Celular ----------
  {
    const { ctx, page } = await newPage(browser, { viewport: { width: 1600, height: 1000 } });
    const st = await state(page);
    ok(st.turn === 0 && !st.small, 'PC: a página não gira');
    ok(near(st.canvas.left, (1600 - st.canvas.width) / 2, 1) && near(st.canvas.top, (1000 - st.canvas.height) / 2, 1),
      `PC: o canvas fica no centro (${Math.round(st.canvas.left)}, ${Math.round(st.canvas.top)} de ${Math.round(st.canvas.width)}x${Math.round(st.canvas.height)})`);
    ok(near(st.layer.left, st.canvas.left, 1) && near(st.layer.width, st.canvas.width, 1), 'PC: a camada de textos acompanha o canvas');
    await page.click('#screen-menu [data-cmd="settings"]');
    await page.waitForTimeout(300);
    const tab = await page.evaluate(() => ({ hidden: document.querySelector('[data-tab="mobile"]').hidden, sel: document.querySelector('#screen-settings [aria-selected="true"]').dataset.tab }));
    ok(tab.hidden && tab.sel === 'controls', 'PC: a aba Celular fica escondida e abre em Teclado e mouse');
    await page.screenshot({ path: `${OUT}/pc.png` });
    await ctx.close();
  }

  // ---------- celular em pé: a imagem deitada ----------
  {
    const { ctx, page } = await newPage(browser, { ...PHONE, viewport: { width: 412, height: 839 } });
    let st = await state(page);
    ok(st.turn === 90, 'em pé: a página deita (gira para a direita)');
    ok(st.bw === 839 && st.bh === 412, `em pé: a página tem as medidas da tela deitada (${st.bw}x${st.bh})`);
    ok(near(st.canvas.height, 412, 1) && near(st.canvas.left, (839 - st.canvas.width) / 2, 1), `em pé: o jogo ocupa a altura toda e fica no centro (${Math.round(st.canvas.width)}x${Math.round(st.canvas.height)})`);
    ok(near(st.layer.left, st.canvas.left, 1) && near(st.layer.top, st.canvas.top, 1) && near(st.layer.height, st.canvas.height, 1), 'em pé: a camada de textos acompanha o canvas deitado');
    await page.screenshot({ path: `${OUT}/empe-menu.png` });
    // configurações: abre na aba Celular
    await page.tap('#screen-menu [data-cmd="settings"]');
    await page.waitForTimeout(300);
    const tab = await page.evaluate(() => document.querySelector('#screen-settings [aria-selected="true"]').dataset.tab);
    ok(tab === 'mobile', 'em pé: as configurações abrem na aba Celular');
    await page.screenshot({ path: `${OUT}/empe-config.png` });
    // o brilho pela aba Imagem
    await page.tap('#screen-settings [data-tab="video"]');
    await page.waitForTimeout(200);
    const br = await page.evaluate(() => {
      const inp = document.querySelector('input[data-opt="brightness"]');
      inp.value = '80';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return { v: window.__settings.data.brightness, txt: document.querySelector('.bright-val').textContent };
    });
    ok(near(br.v, 0.8, 1e-6) && br.txt === '+30', `Imagem > Brilho muda o ajuste (${br.v}, "${br.txt}")`);
    await page.tap('#screen-settings [data-cmd="bright-reset"]');
    ok((await page.evaluate(() => window.__settings.data.brightness)) === 0.5, 'Voltar ao normal põe o brilho em 0.5');
    await page.tap('#screen-settings [data-cmd="back"]');
    await page.waitForTimeout(300);
    // Novo jogo entra na tela cheia (o navegador deixa porque veio de um toque)
    const canFs = await page.evaluate(() => document.fullscreenEnabled);
    await page.tap('#screen-menu [data-cmd="new"]');
    await page.waitForTimeout(500);
    const fs = await page.evaluate(() => !!document.fullscreenElement);
    if (canFs) ok(fs, 'Novo jogo entra na tela cheia');
    else console.log('aviso: este navegador não tem tela cheia (não deu para conferir)');
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await page.waitForTimeout(300);
    await startRoom(page);
    st = await state(page);
    ok(st.turn === 90, 'em pé: o jogo continua deitado');
    ok(near(st.jump.x, 839 - 63, 2) && near(st.jump.y, 412 - 61, 2), `em pé: o pulo no lugar de sempre (${Math.round(st.jump.x)}, ${Math.round(st.jump.y)})`);
    ok(near(st.stick.x, 92, 2) && near(st.stick.y, 412 - 94, 2), `em pé: o analógico no lugar de sempre (${Math.round(st.stick.x)}, ${Math.round(st.stick.y)})`);
    ok(near(st.pause.x, 839 - 37, 2) && near(st.pause.y, 35, 2), `em pé: a pausa no lugar de sempre (${Math.round(st.pause.x)}, ${Math.round(st.pause.y)})`);
    await page.screenshot({ path: `${OUT}/empe-jogo.png` });
    await walk(ctx, page, 'em pé');

    // brilho: mais claro e mais escuro que o normal
    const base = await canvasMean(page);
    await page.evaluate(() => { window.__settings.data.brightness = 1; window.__settings.save(); });
    await page.waitForTimeout(400);
    const bright = await canvasMean(page);
    await page.screenshot({ path: `${OUT}/empe-brilho-max.png` });
    await page.evaluate(() => { window.__settings.data.brightness = 0; window.__settings.save(); });
    await page.waitForTimeout(400);
    const dark = await canvasMean(page);
    await page.screenshot({ path: `${OUT}/empe-brilho-min.png` });
    await page.evaluate(() => { window.__settings.data.brightness = 0.5; window.__settings.save(); });
    await page.waitForTimeout(300);
    ok(bright > base * 1.25, `brilho no máximo clareia (${base.toFixed(1)} -> ${bright.toFixed(1)})`);
    ok(dark < base * 0.85, `brilho no mínimo escurece (${base.toFixed(1)} -> ${dark.toFixed(1)})`);

    // ---------- o editor dos botões ----------
    await page.tap('#pause-btn');
    await page.waitForSelector('#screen-pause.show');
    await page.tap('#screen-pause [data-cmd="settings"]');
    await page.waitForTimeout(300);
    await page.tap('#screen-settings [data-tab="mobile"]');
    await page.tap('#screen-settings [data-cmd="touch-edit"]');
    await page.waitForTimeout(400);
    const ed = await page.evaluate(() => ({
      top: window.__ui.top, cls: document.body.classList.contains('touch-edit'),
      all: [...document.querySelectorAll('#buttons button')].every((b) => getComputedStyle(b).display !== 'none'),
      shown: getComputedStyle(document.getElementById('touch')).display,
    }));
    ok(ed.top === 'touchedit' && ed.cls && ed.shown === 'block', 'o editor abre por cima do jogo');
    ok(ed.all, 'no editor aparecem todos os botões (também os que ainda não foram ganhos)');
    await page.screenshot({ path: `${OUT}/editor.png` });
    st = await state(page);
    const y0 = await page.evaluate(() => window.__scene.player.body.y);
    // arrasta o pulo 120 px para a esquerda e 40 para cima
    await drag(ctx, page, st, st.jump.x, st.jump.y, -120, -40, 2, 100);
    const after = await state(page);
    const lay = await page.evaluate(() => window.__settings.data.touchLayout);
    ok(near(after.jump.x, st.jump.x - 120, 3) && near(after.jump.y, st.jump.y - 40, 3), `arrastar muda o lugar do pulo (${Math.round(after.jump.x)}, ${Math.round(after.jump.y)})`);
    ok(lay.jump && lay.jump.h === 'r' && lay.jump.v === 'b', 'o lugar fica guardado preso ao canto de baixo à direita');
    // (um toque que chegasse no botão deixaria ele aceso: o editor segura o toque antes)
    const lit = await page.evaluate(() => document.querySelectorAll('#buttons button.on').length);
    ok(near(await page.evaluate(() => window.__scene.player.body.y), y0, 0.5) && lit === 0, `mexer no editor não aperta o botão do jogo (${lit} aceso)`);
    const name = await page.evaluate(() => document.querySelector('.tb-name').textContent);
    ok(name === 'Pular', `a barra mostra o botão escolhido (${name})`);
    // tamanho: + duas vezes
    await page.tap('#screen-touchedit [data-cmd="bigger"]');
    await page.tap('#screen-touchedit [data-cmd="bigger"]');
    await page.waitForTimeout(150);
    const big = await state(page);
    const k = await page.evaluate(() => window.__settings.data.touchLayout.jump.k);
    ok(near(k, 1.2, 1e-6) && near(big.jump.w, 78 * 1.2, 0.6), `+ aumenta o botão (${k}, ${big.jump.w.toFixed(1)} px)`);
    ok(near(big.jump.x, after.jump.x, 1) && near(big.jump.y, after.jump.y, 1), 'aumentar mantém o centro no lugar');
    // escolhe o ataque tocando nele e diminui
    await drag(ctx, page, big, big.attack.x, big.attack.y, 0, 0, 3, 50);
    await page.tap('#screen-touchedit [data-cmd="smaller"]');
    await page.waitForTimeout(150);
    const small = await page.evaluate(() => ({ name: document.querySelector('.tb-name').textContent, k: window.__settings.data.touchLayout.attack?.k }));
    ok(small.name === 'Atacar' && near(small.k, 0.9, 1e-6), `tocar escolhe outro botão e − diminui (${small.name} ${small.k})`);
    // opacidade
    const op = await page.evaluate(() => {
      const inp = document.querySelector('input[data-opt="touch-alpha"]');
      inp.value = '50';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return { a: window.__settings.data.touchAlpha, css: getComputedStyle(document.querySelector('#buttons [data-action="jump"] svg')).stroke };
    });
    ok(near(op.a, 0.5, 1e-6) && /,\s*0\.5\)$/.test(op.css), `a opacidade vale para os botões (${op.a}, ${op.css})`);
    await page.screenshot({ path: `${OUT}/editor-mudado.png` });
    // tocar na pausa dentro do editor não pausa nem fecha nada
    await page.tap('#pause-btn');
    await page.waitForTimeout(200);
    ok((await page.evaluate(() => window.__ui.top)) === 'touchedit', 'tocar na pausa dentro do editor só escolhe ela');
    // Esc fecha e volta às configurações
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() => ({ top: window.__ui.top, cls: document.body.classList.contains('touch-edit') }));
    ok(closed.top === 'settings' && !closed.cls, 'Esc fecha o editor e volta às configurações');
    // fica salvo depois de recarregar
    await page.reload();
    await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
    const kept = await page.evaluate(() => ({ lay: window.__settings.data.touchLayout, a: window.__settings.data.touchAlpha }));
    ok(near(kept.lay.jump?.k ?? 0, 1.2, 1e-6) && near(kept.a, 0.5, 1e-6), 'o arranjo continua depois de recarregar a página');
    // Padrão (dois toques) volta tudo
    await page.tap('#screen-menu [data-cmd="settings"]');
    await page.waitForTimeout(300);
    await page.tap('#screen-settings [data-cmd="touch-edit"]');
    await page.waitForTimeout(300);
    await page.tap('#screen-touchedit [data-cmd="touch-reset"]');
    const armed = await page.evaluate(() => Object.keys(window.__settings.data.touchLayout).length);
    await page.tap('#screen-touchedit [data-cmd="touch-reset"]');
    await page.waitForTimeout(150);
    const reset = await page.evaluate(() => ({ n: Object.keys(window.__settings.data.touchLayout).length, a: window.__settings.data.touchAlpha }));
    ok(armed > 0 && reset.n === 0 && reset.a === 1, 'Padrão pede o segundo toque e volta tudo ao lugar de antes');
    await page.tap('#screen-touchedit [data-cmd="done"]');
    await page.waitForTimeout(200);
    ok((await page.evaluate(() => window.__ui.top)) === 'settings', 'Pronto fecha o editor');
    await ctx.close();
  }

  // ---------- em pé, deitando para o outro lado ----------
  {
    const { ctx, page } = await newPage(browser, { ...PHONE, viewport: { width: 412, height: 839 } }, { flip: true });
    await startRoom(page);
    const st = await state(page);
    ok(st.turn === -90, 'com "para o outro lado" a página gira para a esquerda');
    ok(near(st.jump.x, 839 - 63, 2) && near(st.jump.y, 412 - 61, 2), 'para o outro lado: os botões no mesmo lugar da página');
    await page.screenshot({ path: `${OUT}/outrolado.png` });
    await walk(ctx, page, 'para o outro lado');
    await ctx.close();
  }

  // ---------- em pé com a imagem pequena em cima (o jeito de antes) ----------
  {
    const { ctx, page } = await newPage(browser, { ...PHONE, viewport: { width: 412, height: 839 } }, { portrait: 'small' });
    await startRoom(page);
    const st = await state(page);
    ok(st.turn === 0 && st.small, 'imagem pequena: a página não gira');
    ok(near(st.game.height, (412 * 9) / 16, 1) && near(st.game.top, 12, 1), `imagem pequena: o jogo numa faixa em cima (${st.game.height.toFixed(1)} de altura)`);
    ok(near(st.stick.y, 839 - 94 - 38, 2) && near(st.jump.y, 839 - 61 - 38, 2), 'imagem pequena: os botões embaixo, como antes');
    ok(near(st.pause.y, (412 * 9) / 16 + 77, 2), `imagem pequena: a pausa logo abaixo da faixa (${Math.round(st.pause.y)})`);
    await page.screenshot({ path: `${OUT}/pequena.png` });
    await walk(ctx, page, 'imagem pequena');
    await ctx.close();
  }

  // ---------- celular deitado ----------
  {
    const { ctx, page } = await newPage(browser, { ...PHONE, viewport: { width: 839, height: 412 } });
    await startRoom(page);
    const st = await state(page);
    ok(st.turn === 0 && !st.small, 'deitado: a página fica como está');
    ok(near(st.canvas.left, (839 - st.canvas.width) / 2, 1) && near(st.canvas.height, 412, 1), 'deitado: o jogo ocupa a altura toda, no centro');
    ok(near(st.jump.x, 839 - 63, 2) && near(st.jump.y, 412 - 61, 2), 'deitado: o pulo no lugar de sempre');
    await page.screenshot({ path: `${OUT}/deitado.png` });
    await walk(ctx, page, 'deitado');
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
