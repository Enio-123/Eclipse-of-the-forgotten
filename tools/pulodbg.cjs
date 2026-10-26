// Mede até onde o cavaleiro sobe de um ponto da sala (pulo simples e pulo duplo).
// uso: node tools/pulodbg.cjs <sala> <tx> <linha-do-pé> [url]
const { chromium } = require('playwright');
const [ROOM, TX, FR] = [process.argv[2], +process.argv[3], +process.argv[4]];
const URL = process.argv[5] || 'http://localhost:8768/index.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.abilities = new Set(['dash', 'wall', 'double']);
    p.save();
  });
  await page.evaluate((room) => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry: '1', from: 'door' });
  }, ROOM);
  await page.waitForFunction(() => window.__scene && window.__scene.player && !window.__scene.transitioning, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const run = async (dbl) => {
    await page.evaluate(([tx, fr]) => {
      const s = window.__scene;
      s.player.teleport(tx * 16 + 8, fr * 16);
      s.player.body.setVelocity(0, 0);
      s.player.invuln = 99;
      for (const e of s.enemies) { e.alive = false; e.body.enable = false; }
      window.__top = 99;
      if (window.__unj) window.__unj();
      const fn = () => { window.__top = Math.min(window.__top, s.player.body.bottom / 16); };
      s.events.on('postupdate', fn);
      window.__unj = () => s.events.off('postupdate', fn);
    }, [TX, FR]);
    await page.waitForTimeout(200);
    await page.keyboard.down('Space');
    await page.waitForTimeout(260);
    await page.keyboard.up('Space');
    if (dbl) {
      await page.waitForTimeout(170);
      await page.keyboard.down('Space');
      await page.waitForTimeout(260);
      await page.keyboard.up('Space');
    }
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ top: window.__top, feet: window.__scene.player.body.bottom / 16, ground: window.__scene.player.onGround }));
    console.log(dbl ? 'pulo duplo' : 'pulo simples', 'pé mais alto', r.top.toFixed(2), '| parou em', r.feet.toFixed(2), r.ground ? 'no chão' : 'no ar');
  };
  await run(false);
  await run(true);
  await browser.close();
})();
