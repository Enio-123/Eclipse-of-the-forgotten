// Mede as trajetórias de salto do cavaleiro num espaço aberto (cripta sem o chefe) e diz,
// para cada largura de abismo e altura da borda de lá, o que alcança: pulo, pulo + dash,
// pulo duplo, pulo duplo + dash. uso: node jumpenv.cjs
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
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro']) P.seen.add(k);
    P.memories.add('cripta:boss');
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'cripta', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'cripta', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const run = (o) => page.evaluate((o) => new Promise((res) => {
    const s = window.__scene;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    const p = s.player;
    p.teleport(4 * 16, 20 * 16);
    p.invuln = 99;
    const st = { phase: 0, warm: 0, t0: 0, doubled: false, dashed: false };
    const pts = [];
    let x0 = 0, y0 = 0;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      const b = p.body;
      if (st.warm < 10) { st.warm++; return; }
      c.held.right = true;
      c.held.jump = true;
      if (st.phase === 0) {
        if (b.left > 7 * 16) { c.pressed.jump = true; st.phase = 1; st.t0 = s.clock; x0 = b.left; y0 = b.bottom; }
        return;
      }
      const dt = s.clock - st.t0;
      if (o.dbl != null && !st.doubled && dt >= o.dbl) { c.pressed.jump = true; st.doubled = true; }
      if (o.dash != null && !st.dashed && dt >= o.dash) { c.pressed.dash = true; st.dashed = true; }
      pts.push([Math.round(b.right - x0), Math.round(y0 - b.bottom)]);
      if ((dt > 0.15 && b.bottom >= y0) || dt > 3) { c.update = c.__orig; res(pts); }
    };
  }), o);
  const strategies = [{ name: 'pulo', o: {} }];
  for (const dash of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) strategies.push({ name: `pulo+dash ${dash}`, kind: 'SD', o: { dash } });
  for (const dbl of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) strategies.push({ name: `duplo ${dbl}`, kind: 'D', o: { dbl } });
  for (const dbl of [0.3, 0.35, 0.4, 0.45]) for (const d2 of [0.15, 0.25, 0.35, 0.45]) strategies.push({ name: `duplo ${dbl} + dash ${(dbl + d2).toFixed(2)}`, kind: 'DD', o: { dbl, dash: dbl + d2 } });
  const res = [];
  for (const st of strategies) {
    const pts = await run(st.o);
    const top = Math.max(...pts.map((q) => q[1]));
    res.push({ ...st, pts, top });
  }
  require('fs').writeFileSync(process.argv[2] || 'jumpenv.json', JSON.stringify(res));
  for (const r of res) {
    // alcance (canto direito) em cada altura acima da borda de saída, descendo ou no alto
    const reach = (h) => Math.max(-1, ...r.pts.filter((q) => q[1] >= h).map((q) => q[0]));
    console.log(r.name.padEnd(26), 'altura', String(r.top).padStart(4), ' alcance h0', reach(0), 'h16', reach(16), 'h32', reach(32), 'h48', reach(48), 'h64', reach(64), 'h80', reach(80), 'h96', reach(96), 'h112', reach(112));
  }
  await browser.close();
})();
