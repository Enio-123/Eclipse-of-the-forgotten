// Olhada rápida nas salas das Minas: carrega cada sala, tira fotos em pontos marcados e lista os
// erros do console. uso: node minas_look.cjs <pasta-saida> [url] [salas...]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8767/index.html';
const ONLY = process.argv.slice(4);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 16 });
  const waitGame = async (sec) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout: 60000, polling: 16 });
  };
  const shot = async (name) => {
    await page.evaluate(() => window.__scene.sys.pause());
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => window.__scene.sys.resume());
  };
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'boss:sombra', 'relic:veil']) p.seen.add(k);
    p.save();
  });
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [room, entry]);
    await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning);
    await page.waitForTimeout(300);
  };
  const ROOMS = {
    boca: { entry: '1', spots: [[6, 28], [30, 22], [52, 29], [80, 29], [95, 29]] },
    trilhos: { entry: '1', spots: [[10, 23], [40, 23], [62, 23], [100, 23], [140, 23]] },
    prensas: { entry: '1', spots: [[10, 23], [30, 39], [54, 39], [70, 39], [76, 43]] },
    veio: { entry: '1', spots: [[10, 15], [30, 17], [9, 47], [36, 47], [30, 77]] },
    espelhos: { entry: '1', spots: [[4, 25], [32, 25], [56, 25]] },
    capataz: { entry: '1', spots: [[4, 29], [30, 29], [46, 29], [62, 29]] },
  };
  for (const [room, d] of Object.entries(ROOMS)) {
    if (ONLY.length && !ONLY.includes(room)) continue;
    await start(room, d.entry);
    const info = await page.evaluate(() => {
      const s = window.__scene;
      const kinds = {};
      for (const e of s.enemies) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
      const keys = new Set();
      for (const o of s.children.list) if (o.texture) keys.add(o.texture.key);
      return { id: s.room.id, kinds, npcs: s.npcs.list.map((n) => n.kind), mine: !!s.mine, keys: [...keys].filter((k) => /mine|deco-|terrain|capataz|miner|ambat|knight/.test(k)) };
    });
    console.log(JSON.stringify(info));
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 999; });
    let i = 0;
    for (const [tx, ty] of d.spots) {
      await page.evaluate(([tx, ty]) => { const p = window.__scene.player; p.teleport(tx * 16 + 8, ty * 16); p.body.setVelocity(0, 0); }, [tx, ty]);
      await waitGame(0.8);
      await shot(`${room}-${i++}`);
    }
  }
  console.log(errs.length ? errs.slice(0, 20).join('\n') : 'sem erros');
  await browser.close();
})();
