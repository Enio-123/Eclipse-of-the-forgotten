// Fotos do golpe de cada arma no meio do movimento (confere os quadros novos no jogo)
// uso: node atkshot.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html?res=2');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    g.scene.getScene('title').scene.stop();
    g.scene.start('game', { room: 'praca', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'praca', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { for (const e of window.__scene.enemies) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); } });
  for (const w of ['sword', 'scythe', 'daggers', 'bow', 'badalo', 'incensario']) {
    await page.evaluate((w) => { window.__progress.seen.add('weapon:badalo'); window.__progress.seen.add('weapon:incensario'); window.__scene.player.setWeapon(w); }, w);
    for (const [i, frac] of [[0, 0.3], [1, 0.6]].entries()) {
      await page.evaluate(([frac]) => new Promise((res) => {
        const s = window.__scene;
        const p = s.player;
        const c = s.controls;
        const orig = c.update.bind(c);
        let f = 0;
        let t0 = -1;
        c.update = (cam) => {
          orig(cam);
          for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
          if (f === 0) { c.pressed.attack = true; c.held.attack = true; }
          f++;
          const a = p.sprite.anims.currentAnim;
          if (a && a.key.endsWith('-attack') && t0 < 0) t0 = s.clock;
          if (t0 >= 0 && s.clock - t0 >= frac * (a.frames.length / a.frameRate)) {
            s.scene.pause();
            c.update = orig;
            res();
          }
          if (f > 120) { c.update = orig; res(); }
        };
      }), [frac]);
      await page.screenshot({ path: `${OUT}/${w}-${i}.png`, clip: { x: 340, y: 160, width: 600, height: 400 } });
      await page.evaluate(() => window.__scene.scene.resume());
      await page.waitForTimeout(500);
    }
  }
  console.log(errs.length ? errs.join('\n') : 'sem erros');
  await browser.close();
})();
