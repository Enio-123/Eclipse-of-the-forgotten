// Mede quanto o cavaleiro alcança num salto (sem, com dash, com pulo duplo + dash),
// do canto da borda até onde ele ainda cai na mesma altura. uso: node gapmeasure.cjs
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
    P.abilities = new Set(['wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas']) P.seen.add(k);
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'sinos', entry: '2', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'sinos', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  // tira a borda do outro lado para medir o voo inteiro
  await page.evaluate(() => {
    const L = window.__scene.level;
    for (let x = 69; x < 100; x++) for (let y = 13; y < 30; y++) L.layer.removeTileAt(x, y);
  });
  const run = (o) => page.evaluate((o) => new Promise((res) => {
    const s = window.__scene;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    const p = s.player;
    p.teleport(60 * 16, 13 * 16);
    p.invuln = 99;
    const edge = 69 * 16;
    const ledge = 13 * 16;
    const st = { t: 0, phase: 0, t0: 0, takeoffLeft: 0, dashed: false, doubled: false, apex: false, frames: 0, warm: 0 };
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      st.t += 1 / 60;
      const b = p.body;
      if (st.warm < 20) { st.warm++; return; }
      c.held.right = true;
      c.held.jump = true;
      if (st.phase === 0 && b.right >= edge - o.early) { c.pressed.jump = true; st.phase = 1; st.t0 = st.t; st.takeoffLeft = b.left; }
      else if (st.phase === 1) {
        const dt = st.t - st.t0;
        if (o.dbl != null && !st.doubled && dt >= o.dbl) { c.pressed.jump = true; st.doubled = true; }
        if (o.dash != null && !st.dashed && dt >= o.dash) { c.pressed.dash = true; st.dashed = true; }
        if (b.velocity.y > 0) st.apex = true;
        st.hs ??= {};
        for (const h of [0, 16, 32, 48, 64]) if (st.apex && st.hs[h] == null && b.bottom > ledge - h) st.hs[h] = Math.round(b.right - edge);
        if (st.apex && b.bottom > ledge) {
          c.update = c.__orig;
          res({ reach: b.right - edge, air: +(st.t - st.t0).toFixed(2), takeoffLeft: st.takeoffLeft - edge, hs: st.hs });
        }
        if (dt > 4) { c.update = c.__orig; res({ reach: -1 }); }
      }
    };
  }), o);
  const out = [];
  const best = {};
  for (const early of [2]) {
    const r = await run({ early });
    console.log('  simples', JSON.stringify(r.hs));
    out.push(['simples', r.reach.toFixed(1), r.air]);
    best.simples = r.reach;
    let bd = -1, bdo = null;
    for (const dash of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65]) {
      const r2 = await run({ early, dash });
      console.log('  simples+dash', dash, JSON.stringify(r2.hs));
      if (r2.reach > bd) { bd = r2.reach; bdo = dash; }
    }
    out.push(['simples+dash', bd.toFixed(1), 'dash ' + bdo]);
    best.dash = bd;
    let bb = -1, bbo = null;
    for (const dbl of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      for (const dash of [null, 0.6, 0.8, 1.0]) {
        if (dash != null && dash <= dbl) continue;
        const r3 = await run({ early, dbl, dash });
        console.log('  duplo', dbl, dash, JSON.stringify(r3.hs));
        if (r3.reach > bb) { bb = r3.reach; bbo = [dbl, dash, r3.air]; }
      }
    }
    out.push(['duplo+dash', bb.toFixed(1), JSON.stringify(bbo)]);
    let b4 = -1, b4o = null;
    for (const dbl of [0.25, 0.35, 0.45, 0.55, 0.65, 0.75]) {
      const r4 = await run({ early, dbl });
      console.log('  duplo sem dash', dbl, JSON.stringify(r4.hs));
      if (r4.reach > b4) { b4 = r4.reach; b4o = [dbl, r4.air]; }
    }
    out.push(['duplo sem dash', b4.toFixed(1), JSON.stringify(b4o)]);
    // o bot do teste de progressão: duplo quando começa a cair, dash 0.25 s depois
    const r5 = await run({ early, dbl: 0.42, dash: 0.67 });
    out.push(['bot do teste', r5.reach.toFixed(1)]);
    best.duplo = bb;
  }
  for (const o of out) console.log(o.join('  '));
  console.log('em tiles: simples', (best.simples / 16).toFixed(2), 'dash', (best.dash / 16).toFixed(2), 'duplo', (best.duplo / 16).toFixed(2));
  await browser.close();
})();
