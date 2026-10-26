// Confere a página do Artifact servida localmente: carrega, abre o menu, entra no jogo
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:8766/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.argv[2] + '/art-menu.png' });
  await page.click('#screen-menu [data-cmd="new"]');
  await page.waitForSelector('#screen-path.show');
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] + '/art-caminho.png' });
  await page.click('#screen-path [data-cmd="confirm"]');
  await page.waitForSelector('#screen-weapons.show');
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] + '/art-armas.png' });
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
