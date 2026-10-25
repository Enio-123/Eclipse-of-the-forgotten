const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => console.log('console:', m.text()));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => { window.__ui.closeAll(); const g = window.__game; const t = g.scene.getScene('title'); if (t && t.scene.isActive()) t.scene.stop(); g.scene.start('game', { room: 'ponte', entry: '2', from: 'continue' }); });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'ponte' && window.__scene.scene.isActive(), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const s = window.__scene;
    return s.enemies.map((e) => ({ x: Math.round(e.zone.x), y: Math.round(e.zone.y), st: e.state, keys: Object.keys(e).slice(0, 30).join(',') }));
  });
  console.log(JSON.stringify(info, null, 0));
  await page.evaluate(() => { const s = window.__scene; const p = s.player; const sp = s.level.spawns.find((q) => q.kind === 'v'); p.teleport(sp.x + 40, 22 * 16); p.invuln = 99; });
  for (let i = 0; i < 12; i++) {
    const c = await page.evaluate(() => { const s = window.__scene; const c = s.enemies.find((e) => e.aim !== undefined); const p = s.player; return { st: c.state, cd: +c.cd.toFixed(2), x: Math.round(c.zone.x), y: Math.round(c.zone.y), px: Math.round(p.x), py: Math.round(p.body.center.y), sees: c.sees(p.x, p.body.center.y), dead: p.dead }; });
    console.log(JSON.stringify(c));
    await page.waitForTimeout(250);
  }
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
