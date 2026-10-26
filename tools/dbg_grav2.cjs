const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress; p.reset(); p.prologueDone = true; p.abilities = new Set(['wall', 'double', 'hook', 'veil']);
    for (const k of ['boss:reflexo']) p.seen.add(k); p.save();
    window.__ui.closeAll(); const g = window.__game; g.scene.getScene('title').scene.stop(); g.scene.start('game', { room: 'capataz', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const p = window.__scene.player; p.invuln = 999; p.teleport(14 * 16, 30 * 16); });
  await page.waitForFunction(() => window.__scene.boss.state === 'idle', null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = window.__scene; const b = s.boss;
    b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; }; b.toIdle();
    b.hp = b.maxHp * 0.5 + 0.5; b.hit(0, 1, 'side');
    window.__log = [];
    const fn = () => { const p = s.player; window.__log.push([+s.clock.toFixed(2), p.gravMul, Math.round(p.body.gravity.y), Math.round(p.body.velocity.y), Math.round(p.body.bottom), b.state, +b.lowT.toFixed(2)]); };
    s.events.on('postupdate', fn);
  });
  await page.waitForTimeout(2500);
  const pop = await page.evaluate(() => { const w = window.__scene.enemies.find((e) => e.kind === 'wisp' && e.alive); return w ? [w.hit(0, 1, 'side'), w.alive] : null; });
  console.log('pop', JSON.stringify(pop));
  await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(24 * 16 + 8, 30 * 16); p.body.setVelocity(0, 0); p.hp = 5; p.invuln = 99; s.registry.set('hp', 5); });
  await page.waitForTimeout(500);
  await page.keyboard.down('Space'); await page.waitForTimeout(900); await page.keyboard.up('Space');
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => window.__log);
  const pick = log.filter((_, i) => i % 6 === 0);
  for (const l of pick) console.log(JSON.stringify(l));
  await browser.close();
})();
