const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(67*16+8, 448); s.player.invuln = 5;
    const lvl = s.level; window.__t = [lvl.tileAt(67*16+8, 24*16+2), lvl.layer.getTileAtWorldXY(67*16+8, 24*16+2)?.faceTop, lvl.layer.getTileAtWorldXY(67*16+8, 24*16+2)?.collideUp]; });
  console.log(await page.evaluate(() => window.__t));
  await page.waitForTimeout(400);
  await page.keyboard.down('z');
  const r = await page.evaluate(() => new Promise((res) => { const s = window.__scene; const out = []; let n = 0; const f = () => { const p = s.player; out.push(Math.round(p.body.bottom) + (p.body.blocked.down ? 'g' : '')); if (++n < 70) requestAnimationFrame(f); else res(out); }; f(); }));
  await page.keyboard.up('z');
  console.log(r.join(' '));
  console.log(await page.evaluate(() => { const p = window.__scene.player; return [p.x, p.body.x, p.body.width]; }));
  await browser.close();
})();
