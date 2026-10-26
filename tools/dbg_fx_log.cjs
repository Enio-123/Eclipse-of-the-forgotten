// capturas das magias sozinhas (sem inimigos), em vários instantes
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/magos/fx';
const LIST = (process.argv[3] || 'eclipse:leque').split(',');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  const URL = (process.env.GAME || 'http://localhost:8765') + '/index.html' + (process.env.Q || '');
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  const waitGame = async (sec) => { const c0 = await page.evaluate(() => window.__scene.clock); await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout: 60000, polling: 16 }); };
  const shot = async (name) => {

    console.log(name, await page.evaluate(() => { const s = window.__scene; return s.clock.toFixed(3) + " fx=" + s.magic.fx.map((f) => f.t.toFixed(2)).join(","); })); await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 240, y: 160, width: 800, height: 400 } });
  };
  let cur = null;
  for (const item of LIST) {
    const [mage, ver, kind] = item.split(':');
    if (mage !== cur) {
      await page.evaluate((mage) => {
        const p = window.__progress;
        p.reset(); p.prologueDone = true; p.kintsugi = 1; p.starter = mage;
        p.kills.set('crawler', 2); p.kills.set('guard', 1); p.kills.set('archer', 1); p.seen.add('boss:sineiro'); p.seen.add('boss:capataz');
        window.__settings.data.weapon = mage; window.__settings.save();
        p.save();
        window.__ui.closeAll();
        const g = window.__game;
        const t = g.scene.getScene('title'); if (t.scene.isActive()) t.scene.stop();
        const gs = g.scene.getScene('game');
        window.__old = window.__scene && window.__scene.player;
        if (gs.scene.isActive()) gs.scene.restart({ room: 'ponte', entry: 'P', from: 'continue' });
        else g.scene.start('game', { room: 'ponte', entry: 'P', from: 'continue' });
      }, mage);
      await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__old && window.__scene.clock > 0.5 && window.__scene.player.canAim, null, { timeout: 60000 });
      await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) { e.alive = false; e.sprite?.setVisible(false); } s.enemies = []; const p = s.player; p.teleport(300, p.body.bottom); p.facing = 1; p.invuln = 1e9; });
      cur = mage;
    }
    if (kind) await page.evaluate((kind) => { const s = window.__scene; const e = s.spawn(kind, s.player.x + 110, s.player.body.bottom); const orig = e.update.bind(e); e.update = (dt) => { orig(dt); const m = s.magic; if (e.alive && !m.shoves.some((sh) => sh.e === e) && !m.launches.some((l) => l.e === e)) e.body.setVelocityX(0); }; e.facing = -1; }, kind);
    await page.evaluate(() => { window.__scene.magic.cd = 0; });
    await page.keyboard.down('KeyI'); await waitGame(0.05); await page.keyboard.up('KeyI');
    await page.waitForFunction(() => window.__scene.magic.aiming, null, { timeout: 5000 });
    for (let k = 0; k < 6; k++) {
      const id = await page.evaluate(() => { const m = window.__scene.magic; return m.choices()[m.aim.i].id; });
      if (id === ver || id.endsWith(':' + ver)) break;
      await page.keyboard.down('KeyS'); await waitGame(0.05); await page.keyboard.up('KeyS');
    }
    await page.evaluate(() => { const s = window.__scene; s.magic.aim.x = s.player.x + 110; s.magic.aim.mouse = false; });
    await waitGame(0.08);
    await shot(`${mage}-${ver}-mira`);
    await page.keyboard.down('KeyJ'); await waitGame(0.05); await page.keyboard.up('KeyJ');
    // o laço do jogo para e a captura anda quadro a quadro (16,7 ms), até o instante pedido contado pela
    // própria magia (o primeiro efeito da lista, ou o relógio da cena quando a magia não deixa efeito)
    await page.evaluate(() => { window.__game.loop.sleep(); window.__c0 = window.__scene.clock; });
    for (const t of (process.env.TIMES || '0.15,0.3,0.6').split(',').map(Number)) {
      const n = await page.evaluate((t) => {
        const g = window.__game;
        const s = window.__scene;
        let now = performance.now();
        let n = 0;
        const due = () => (s.magic.fx.length ? s.magic.fx[0].t >= t : s.clock - window.__c0 >= t + 0.3);
        while (!due() && n < 400) { now += 1000 / 60; g.step(now, 1000 / 60); n++; }
        return n;
      }, t);
      console.log('steps', n);
      await shot(`${mage}-${ver}-${t}`);
    }
    await page.evaluate(() => window.__game.loop.wake());
    await waitGame(1.5);
  }
  await browser.close();
})();
