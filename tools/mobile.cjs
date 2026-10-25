// Confere o jogo num celular deitado e em pé: menu, controles de toque, pausa
const { chromium, devices } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  for (const [name, vp] of [['deitado', { width: 844, height: 390 }], ['empe', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(name + ' ERR ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(name + ' HTTP ' + r.status() + ' ' + r.url()); });
    await page.goto('http://localhost:8765/index.html');
    await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/m-${name}-menu.png` });
    await page.tap('#screen-menu [data-cmd="new"]');
    await page.waitForSelector('#screen-weapons.show', { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/m-${name}-armas.png` });
    await page.evaluate(() => {
      window.__ui.closeAll();
      const g = window.__game;
      g.scene.getScene('title').scene.stop();
      g.scene.start('game', { room: 'ponte', entry: 'P', from: 'continue' });
    });
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.scene.isActive(), null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const touch = await page.evaluate(() => ({ body: document.body.className, shown: getComputedStyle(document.getElementById('touch')).display }));
    console.log(name, 'toque:', JSON.stringify(touch));
    // anda para a direita segurando o direcional
    const stick = await page.$('#stick');
    const x0 = await page.evaluate(() => window.__scene.player.x);
    if (stick) {
      const b = await stick.boundingBox();
      const cdp = await ctx.newCDPSession(page);
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let i = 1; i <= 6; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 6, y: cy, id: 1 }] });
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/m-${name}-jogo.png` });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const x1 = await page.evaluate(() => window.__scene.player.x);
    console.log(name, 'andou com o direcional:', Math.round(x1 - x0), 'px');
    await page.tap('#pause-btn');
    await page.waitForTimeout(500);
    const paused = await page.evaluate(() => document.querySelector('#screen-pause').classList.contains('show'));
    console.log(name, 'pausa pelo botão:', paused);
    await page.screenshot({ path: `${OUT}/m-${name}-pausa.png` });
    await ctx.close();
  }
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
