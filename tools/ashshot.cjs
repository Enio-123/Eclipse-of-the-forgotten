// Fotos de perto do descanso que desfaz em cinza um rastejante e um guarda vencidos ao lado da vela.
// uso: node ashshot.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => {
    window.__progress.reset();
    window.__ui.closeAll();
    const g = window.__game;
    g.scene.getScene('title').scene.stop();
    window.__scene = null;
    g.scene.start('game', { room: 'catacumbas', entry: 'R0', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.loot, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene.clock >= t, t0 + ms / 1000, { timeout: 60000, polling: 16 });
  };
  // um rastejante e o guarda levados para perto da vela e marcados como vencidos
  await page.evaluate(() => {
    const s = window.__scene;
    const sh = s.props.shrines[0];
    const cr = s.tracks.find((t) => t.e.kind === 'crawler');
    const gd = s.tracks.find((t) => t.e.kind === 'guard');
    cr.e.zone.setPosition(sh.x + 70, sh.y - 12); cr.e.body.reset(sh.x + 70, sh.y - 12);
    gd.e.zone.setPosition(sh.x + 120, sh.y - 20); gd.e.body.reset(sh.x + 120, sh.y - 20);
    for (const e of s.enemies) if (e !== cr.e && e !== gd.e) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
    for (const t of [cr, gd]) { t.f = 15; window.__progress.seen.add('pass:' + t.key); }
    s.player.teleport(sh.x - 10, sh.y);
    s.player.invuln = 99;
    cr.e.atkCd = 99; gd.e.atkCd = 99;
  });
  await wait(600);
  // em câmera lenta (o navegador de teste é lento e pula quadros), para ver o efeito de perto
  await page.evaluate(() => {
    const s = window.__scene;
    s.tweens.timeScale = 0.2;
    s.time.timeScale = 0.2;
    s.ash.timeScale = 0.2;
    s.rest(s.props.shrines[0]);
  });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(i === 0 ? 2600 : 700);
    await page.screenshot({ path: `${OUT}/cinza-${i}.png`, clip: { x: 280, y: 200, width: 720, height: 300 } });
  }
  await browser.close();
})();
