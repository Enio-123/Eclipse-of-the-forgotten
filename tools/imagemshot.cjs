// Foto da aba Configurações > Imagem no computador e no celular deitado. uso: node imagemshot.cjs <pasta>
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['pc', { viewport: { width: 1280, height: 720 } }], ['cel', { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } }], ['cel-empe', { ...devices['iPhone 13'] }]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('ERR ' + e.message));
    await page.goto('http://localhost:8765/index.html');
    await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
    await page.click('#screen-menu [data-cmd="settings"]');
    await page.waitForTimeout(300);
    await page.click('#screen-settings [data-tab="video"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}-imagem.png` });
    const note = await page.evaluate(() => document.querySelector('.quality-note').textContent);
    const res = await page.evaluate(() => window.__res && window.__res());
    console.log(name, 'nota:', note, 'res:', res);
    await page.click('#screen-settings input[name="quality"][value="high"]', { force: true }).catch(() => page.evaluate(() => { const r = document.querySelector('input[name="quality"][value="high"]'); r.checked = true; r.dispatchEvent(new Event('change')); }));
    await page.waitForTimeout(300);
    console.log(name, 'nítida:', await page.evaluate(() => document.querySelector('.quality-note').textContent), 'res:', await page.evaluate(() => window.__res && window.__res()));
    await page.screenshot({ path: `${OUT}/${name}-imagem-nitida.png` });
    await ctx.close();
  }
  await browser.close();
})();
