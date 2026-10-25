// Abre a página empacotada do Artifact, começa um jogo e confere que não há erros.
// uso: node smoke.cjs [url]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8766/index.html';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('requestfailed', (r) => errs.push('falhou ' + r.url()));
  await page.goto(url);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const menu = await page.evaluate(() => [...document.querySelectorAll('#screen-menu button')].filter((b) => !b.hidden).map((b) => b.textContent.trim()));
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    g.scene.getScene('title').scene.stop();
    g.scene.start('game', { room: 'sinos', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'sinos', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const imgs = await page.evaluate(() => ['item-badalo', 'knight-badalo', 'item-mask'].map((k) => k + ':' + window.__game.textures.exists(k)));
  console.log('menu', menu.join(' | '));
  console.log('texturas', imgs.join(' '));
  console.log(errs.length ? 'ERROS ' + errs.join(' ; ') : 'sem erros');
  await browser.close();
})();
