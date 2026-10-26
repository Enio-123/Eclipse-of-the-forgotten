// Capturas da tela de título e da abertura na floresta: node intro.cjs <url> <saida>
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const OUT = process.argv[3] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/titulo.png` });
  await page.click('[data-cmd="new"]');
  await page.waitForSelector('#screen-path.show', { timeout: 5000 });
  await page.click('#screen-path [data-cmd="confirm"]');
  await page.waitForSelector('#screen-weapons.show', { timeout: 5000 });
  await page.click('#screen-weapons [data-cmd="confirm"], #screen-weapons button.primary').catch(async () => {
    const b = await page.$$('#screen-weapons button');
    for (const x of b) { if (/Começar/.test(await x.textContent())) { await x.click(); break; } }
  });
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${OUT}/abertura-1.png` });
  await page.waitForTimeout(4600);
  await page.screenshot({ path: `${OUT}/abertura-2.png` });
  await page.waitForTimeout(5200);
  await page.screenshot({ path: `${OUT}/abertura-3.png` });
  await page.waitForFunction(() => { const s = window.__scene; return s && s.player && s.scene.isActive(); }, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/abertura-ponte.png` });
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
