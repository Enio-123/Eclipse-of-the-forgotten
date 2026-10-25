const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 15000 });
  await page.waitForTimeout(900);
  const tp = (x, y) => page.evaluate(([x, y]) => { const s = window.__scene; s.player.teleport(x, y); s.player.invuln = 0; }, [x, y]);
  // ataque lateral perto do rastejante
  const ex = await page.evaluate(() => window.__scene.enemies.find((e) => e.zone.y > 400 && e.zone.x < 900).zone.x);
  await tp(ex - 40, 448); await page.waitForTimeout(500);
  await page.keyboard.press('x'); await page.waitForTimeout(30);
  await page.screenshot({ path: out + '-atk.png' });
  // dash com rastro
  await page.waitForTimeout(600);
  await tp(140, 448); await page.waitForTimeout(400);
  await page.keyboard.press('c'); await page.waitForTimeout(110);
  await page.screenshot({ path: out + '-dash.png' });
  // ataque para cima no ar
  await page.waitForTimeout(500);
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('z'); await page.waitForTimeout(150); await page.keyboard.press('x'); await page.waitForTimeout(40);
  await page.screenshot({ path: out + '-up.png' });
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('z');
  // área alta
  await tp(85 * 16, 11 * 16); await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '-high.png' });
  await browser.close();
})();
