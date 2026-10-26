// A memória do alto da torre da ponte: com as Garras de Ferro dá para subir a parede da torre
// e pegar a memória entre as ameias. uso: node tower.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => console.log((c ? 'ok   ' : 'FALHA ') + msg);
  const go = (abilities) => page.evaluate((abilities) => {
    window.__ui.closeAll();
    const P = window.__progress;
    P.reset();
    P.abilities = new Set(['dash', ...abilities]);
    for (const k of ['memory:vale', 'gate:catacumbas', 'intro']) P.seen.add(k);
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    const cur = g.scene.getScene('game');
    window.__scene = null;
    if (cur && cur.scene.isActive()) cur.scene.restart({ room: 'ponte', entry: '2', from: 'door' });
    else g.scene.start('game', { room: 'ponte', entry: '2', from: 'door' });
  }, abilities);
  const attempt = async (abilities) => {
    await go(abilities);
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'ponte' && window.__scene.scene.isActive(), null, { timeout: 20000 });
    await page.waitForTimeout(800);
    return page.evaluate(() => new Promise((res) => {
      const s = window.__scene;
      for (const e of s.enemies) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
      const c = s.controls;
      c.__orig = c.update.bind(c);
      const p = s.player;
      p.teleport(129 * 16, 22 * 16);
      p.invuln = 99;
      const st = { t0: s.clock, lastJ: -9, top: false, best: 999 };
      c.update = (cam) => {
        c.__orig(cam);
        for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
        const b = p.body;
        const t = s.clock - st.t0;
        c.held.jump = true;
        st.best = Math.min(st.best, b.bottom);
        if (b.bottom <= 161 && p.x > 134 * 16) st.top = true;
        if (st.top) {
          // em cima: vai até o vão da memória (entre as ameias 138 e 140), pulando as ameias do caminho.
          // Mira o meio do vão e corrige para os dois lados: um pulo que passa do vão volta andando
          const dx = 139 * 16 + 8 - p.x;
          if (dx > 3) c.held.right = true;
          else if (dx < -3) c.held.left = true;
          const blocked = dx > 0 ? b.blocked.right : b.blocked.left;
          if (p.onGround && blocked && Math.abs(dx) > 12 && t - st.lastJ > 0.2) { c.pressed.jump = true; st.lastJ = t; c.held.jump = true; }
          else c.held.jump = false;
        } else if (p.onGround) {
          c.held.right = true;
          if (t - st.lastJ > 0.3) { c.pressed.jump = true; st.lastJ = t; }
        } else if (p.onWall) {
          if (t - st.lastJ > 0.08) { c.pressed.jump = true; st.lastJ = t; }
        } else if (t - st.lastJ > 0.1) c.held.right = true;
        else c.held.left = true;
        const got = window.__progress.memories.has('ponte:0');
        if (got || t > 24) { c.update = c.__orig; res({ got, best: Math.round(st.best), x: +(p.x / 16).toFixed(1) }); }
      };
    }));
  };
  let r = await attempt([]);
  ok(!r.got, `sem as garras não sobe a torre (pé mais alto ${r.best}, torre em 160)`);
  r = await attempt(['wall']);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/torre-memoria.png` });
  ok(r.got, `com as garras sobe a torre e pega a memória (x ${r.x}, pé mais alto ${r.best})`);
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
