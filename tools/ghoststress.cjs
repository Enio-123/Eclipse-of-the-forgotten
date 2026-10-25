// Dash fantasma repetido contra o rastejante e o guarda (vários afastamentos): conta quantas vezes tomou dano
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => {
    window.__ui.closeAll(); window.__progress.reset();
    const g = window.__game; const t = g.scene.getScene('title'); if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'ponte', entry: '2', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'ponte', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const run = (kind, dx, dir) => page.evaluate(([kind, dx, dir]) => new Promise((res) => {
    const s = window.__scene; const c = s.controls; const p = s.player;
    for (const e of s.enemies) if (e.kind !== kind && e.alive) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
    const e = s.enemies.find((q) => q.kind === kind);
    if (e.atkCd !== undefined) e.atkCd = 99;
    p.teleport(e.zone.x + dx, e.body.bottom); p.facing = dir; p.invuln = 0; p.hp = 5; s.registry.set('hp', 5);
    const orig = c.update.bind(c); const log = []; let f = 0;
    c.update = (cam) => {
      orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      if (f === 0) { c.pressed.dash = true; c.held.dash = true; }
      log.push([f, Math.round(p.x), Math.round(e.zone.x), p.dashing ? 'D' : '-', p.ghost ? 'G' : '-', p.hp]);
      f++;
      if (f > 30) { c.update = orig; res({ hp: p.hp, log, ex: e.zone.x, px: p.x }); }
    };
  }), [kind, dx, dir]);
  let bad = 0, n = 0;
  for (const kind of ['crawler', 'guard']) {
    for (const [dx, dir] of [[-34, 1], [-26, 1], [-20, 1], [34, -1], [26, -1], [20, -1]]) {
      for (let k = 0; k < 2; k++) {
        const r = await run(kind, dx, dir);
        n++;
        const through = dir > 0 ? r.px > r.ex : r.px < r.ex;
        if (r.hp !== 5 || !through) { bad++; console.log('FALHA', kind, dx, dir, 'vida', r.hp, 'passou', through, JSON.stringify(r.log)); }
        await page.waitForTimeout(500);
      }
    }
  }
  console.log(`${n - bad} de ${n} dashes atravessaram sem dano`);
  await browser.close();
})();
