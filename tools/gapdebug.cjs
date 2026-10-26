// Depura o salto do abismo com o mesmo robô do teste de progressão
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
    P.abilities = new Set(['dash', 'wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas']) P.seen.add(k);
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'sinos', entry: '2', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'sinos', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const log = await page.evaluate(() => new Promise((res) => {
    const s = window.__scene;
    for (const e of s.enemies) { e.alive = false; e.sprite.setVisible(false); }
    const c = s.controls;
    c.__orig = c.update.bind(c);
    const p = s.player;
    p.teleport(68 * 16, 13 * 16);
    p.hp = 5;
    const st = { t: 0, phase: 0, dashed: false, wait: 0 };
    const out = [];
    const edge = 69 * 16 - 2;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      if (st.wait++ < 18) return;
      st.t += 1 / 60;
      const b = p.body;
      c.held.right = true;
      c.held.jump = true;
      let ev = '';
      if (st.phase === 0 && b.right > edge) { c.pressed.jump = true; st.phase = 1; st.t1 = st.t; ev = 'JUMP'; }
      else if (st.phase === 1 && st.t - st.t1 > 0.05 && b.velocity.y > 30) { c.pressed.jump = true; st.phase = 2; st.t2 = st.t; ev = 'DOUBLE'; }
      else if (st.phase === 2 && st.t - st.t2 > 0.25 && !st.dashed) { c.pressed.dash = true; st.dashed = true; ev = 'DASH'; }
      out.push([s.clock.toFixed(3), (b.left).toFixed(1), (b.right).toFixed(1), b.bottom.toFixed(1), b.velocity.x.toFixed(0), b.velocity.y.toFixed(0), p.onGround ? 'G' : '-', p.hp, ev].join(' '));
      if (st.t > 2.2) { c.update = c.__orig; res(out); }
    };
  }));
  console.log(log.join('\n'));
  await browser.close();
})();
