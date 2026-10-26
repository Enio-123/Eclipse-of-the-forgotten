// Fotos das telas novas (inventário, trocar arma com arma trancada, apagar progresso) no computador
// e no celular deitado. uso: node uishots.cjs <pasta-saida>
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['pc', { viewport: { width: 1280, height: 720 } }], ['cel', { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } }]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('ERR ' + e.message));
    await page.goto('http://localhost:8765/index.html');
    await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
    await page.evaluate(() => {
      const P = window.__progress;
      P.reset();
      P.upgrades = new Set(['mask', 'blade', 'breath', 'purse']);
      P.equipped = new Set(['mask', 'blade']);
      P.abilities = new Set(['dash', 'wall']);
      P.save();
    });
    await page.evaluate(() => window.__ui.menu({ hasSave: true, onContinue() {}, onNew() {}, onErase() {} }));
    await page.click('#screen-menu [data-cmd="erase"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-apagar.png` });
    await page.evaluate(() => {
      window.__ui.closeAll();
      const g = window.__game;
      g.scene.getScene('title').scene.stop();
      g.scene.start('game', { room: 'sinos', entry: 'R1', from: 'door' });
    });
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.loot, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__scene.openPause());
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}-pausa.png` });
    await page.evaluate(() => document.querySelector('#screen-pause [data-cmd="inventory"]').click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}-inventario.png` });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#screen-pause [data-cmd="weapon"]').click());
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}-armas.png` });
    await ctx.close();
  }
  await browser.close();
})();
