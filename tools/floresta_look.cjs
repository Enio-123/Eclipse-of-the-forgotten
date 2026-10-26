// Olha as seis salas da Floresta Nevada: fotos em pontos da sala, inimigos e erros
// uso: node floresta_look.cjs <pasta-saida> [url] (ROOMS=encosta,lago)
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8767/index.html';
const ROOMS = (process.env.ROOMS || 'encosta,pinhal,lago,cabana,serra,clareira').split(',');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', 'boss:reflexo', 'boss:capataz', 'weapon:picareta']) p.seen.add(k);
    p.save();
  });
  const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 16 });
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
    await page.waitForTimeout(600);
  };
  for (const room of ROOMS) {
    await start(room, '1');
    const info = await page.evaluate(() => {
      const s = window.__scene;
      s.player.invuln = 999;
      return { w: s.level.widthPx / 16, h: s.level.heightPx / 16, en: s.enemies.map((e) => `${e.kind}@${(e.zone.x / 16).toFixed(0)},${(e.zone.y / 16).toFixed(0)}:${e.state}`), boss: s.boss && s.boss.state };
    });
    console.log(room, JSON.stringify(info));
    // fotos: a cada ~36 colunas, em cima e embaixo
    const xs = [];
    for (let x = 20; x < info.w; x += 38) xs.push(x);
    if (!xs.length) xs.push(info.w / 2);
    let i = 0;
    for (const x of xs) for (const y of info.h > 26 ? [11, info.h - 11] : [info.h / 2]) {
      await page.evaluate(([x, y]) => { const s = window.__scene; const c = s.cameras.main; c.stopFollow(); c.centerOn(x * 16, y * 16); }, [x, y]);
      await page.waitForTimeout(350);
      await page.evaluate(() => window.__scene.sys.pause());
      await page.screenshot({ path: `${OUT}/${room}-${String(i++).padStart(2, '0')}.png` });
      await page.evaluate(() => window.__scene.sys.resume());
    }
    const after = await page.evaluate(() => window.__scene.enemies.map((e) => `${e.kind}@${(e.zone.x / 16).toFixed(0)},${(e.zone.y / 16).toFixed(0)}:${e.state}`));
    console.log('  depois:', after.join(' '));
  }
  console.log(errs.length ? errs.join('\n') : 'sem erros');
  await browser.close();
})();
