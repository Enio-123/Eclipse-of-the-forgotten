const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    const info = await page.evaluate(() => { const s = window.__scene; const e = s.enemies[0]; s.player.teleport(e.zone.x - 34, 448); s.player.invuln = 2; s.player.facing = 1; return { ex: e.zone.x, hp: e.hp, alive: e.alive }; });
    await page.waitForTimeout(100);
    await page.keyboard.press('x');
    const r = await page.evaluate(() => new Promise((res) => { const s = window.__scene; const out = []; let n = 0; const f = () => { const p = s.player; const b = p.attackBox(); const e = s.enemies[0]; out.push([p.attacking, Math.round(b.y), Math.round(b.bottom), Math.round(e.rect.y), Math.round(e.rect.bottom), Phaser.Geom.Intersects.RectangleToRectangle(b, e.rect), s.hitstopT].join(',')); if (++n < 8) requestAnimationFrame(f); else res(out); }; f(); }));
    console.log(JSON.stringify(info), r.join(' | '));
    await page.waitForTimeout(300);
  }
  await browser.close();
})();
