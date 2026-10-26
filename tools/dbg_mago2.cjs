const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  const URL = 'http://localhost:8765/index.html';
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset(); p.prologueDone = true; p.kintsugi = 1; p.starter = 'eclipse';
    window.__settings.data.weapon = 'eclipse'; window.__settings.save();
    p.save();
    window.__ui.closeAll();
    const g = window.__game;
    g.scene.getScene('title').scene.stop();
    g.scene.start('game', { room: 'ponte', entry: 'P', from: 'continue' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.clock > 0.3, null, { timeout: 60000 });
  const waitGame = async (sec) => { const c0 = await page.evaluate(() => window.__scene.clock); await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout: 60000, polling: 16 }); };
  await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(320, p.body.bottom); p.facing = 1; p.invuln = 1e9; window.__g = s.spawn('g', p.x + 120, p.body.bottom); window.__g.facing = -1; window.__g.update = () => {}; });
  for (let i = 0; i < 6; i++) { console.log('g', await page.evaluate(() => ({ clock: +window.__scene.clock.toFixed(2), x: window.__g.zone.x, vx: window.__g.body.velocity.x, bx: window.__g.body.x, own: Object.prototype.hasOwnProperty.call(window.__g, 'update') }))); await waitGame(0.1); }
  await waitGame(0.5);
  const st = () => page.evaluate(() => { const s = window.__scene; const m = s.magic; return { clock: +s.clock.toFixed(2), cd: +m.cd.toFixed(2), aiming: m.aiming, gx: Math.round(window.__g.zone.x), ghp: window.__g.hp, fx: m.fx.length, ax: m.aim ? Math.round(m.aim.x) : null, fl: m.aim ? m.aim.floor : null, ok: m.aim ? m.aim.ok : null }; });
  await page.keyboard.down('KeyI'); await waitGame(0.06); await page.keyboard.up('KeyI');
  await page.waitForFunction(() => window.__scene.magic.aiming, null, { timeout: 5000 });
  console.log('aim', JSON.stringify(await st()));
  await page.evaluate(() => { const a = window.__scene.magic.aim; a.x = window.__g.zone.x; a.mouse = false; });
  await waitGame(0.1);
  console.log('aimed', JSON.stringify(await st()));
  await page.keyboard.down('KeyJ'); await waitGame(0.06); await page.keyboard.up('KeyJ');
  for (let i = 0; i < 8; i++) { console.log('t', JSON.stringify(await st())); await waitGame(0.1); }
  await browser.close();
})();
