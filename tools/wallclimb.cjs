// Dá para subir uma parede só (sem outra parede em frente) com as Garras? uso: node wallclimb.cjs
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => {
    window.__ui.closeAll();
    const P = window.__progress;
    P.reset();
    P.abilities = new Set(['dash', 'wall']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro']) P.seen.add(k);
    P.memories.add('cripta:boss');
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'cripta', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'cripta', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  for (const back of [0.0, 0.05, 0.1, 0.15]) {
    const r = await page.evaluate((back) => new Promise((res) => {
      const s = window.__scene;
      const c = s.controls;
      if (!c.__orig) c.__orig = c.update.bind(c);
      const p = s.player;
      p.teleport(40 * 16, 20 * 16);
      p.invuln = 99;
      const st = { t0: s.clock, jumped: 0, lastJ: -9, best: 999, walls: [] };
      c.update = (cam) => {
        c.__orig(cam);
        for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
        const b = p.body;
        const t = s.clock - st.t0;
        c.held.jump = true;
        if (p.onGround) {
          c.held.right = true;
          if (t - st.lastJ > 0.3) { c.pressed.jump = true; st.lastJ = t; }
        } else if (p.onWall) {
          if (t - st.lastJ > 0.08) { c.pressed.jump = true; st.lastJ = t; st.jumped++; st.walls.push(Math.round(b.bottom)); }
        } else {
          // depois do pulo na parede, volta para a mesma parede assim que der
          if (t - st.lastJ > back) c.held.right = true;
          else c.held.left = true;
        }
        st.best = Math.min(st.best, b.bottom);
        if (t > 6) { c.update = c.__orig; res(st); }
      };
    }), back);
    console.log('volta depois de', back, 's: pulos na parede', r.jumped, 'pé mais alto', Math.round(r.best), '(chão 320)', 'pés ao agarrar', r.walls.slice(0, 10).join(','));
  }
  await browser.close();
})();
