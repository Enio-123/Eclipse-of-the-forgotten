const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('requestfailed', (r) => errs.push('FAIL ' + r.url()));
  await page.goto('http://localhost:8766/test.html');
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] + '-start.png' });
  await page.mouse.click(640, 360);
  await page.waitForTimeout(500);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.press('z'); await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2] + '-play.png' });
  await page.keyboard.up('ArrowRight');
  console.log(errs.join('\n') || 'sem erros', await page.evaluate(() => Math.round(window.__scene.player.x)));
  await browser.close();
})();
