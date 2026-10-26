// Fotos do mapa: tudo visto (ou só algumas salas), aberto numa sala
// uso: node mapshot.cjs <pasta> [url]  (ROOM=praca, SEEN=all|ponte,catacumbas, MAPS=all|vespera,cidade)
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8767/index.html';
const ROOM = process.env.ROOM || 'praca';
const SEEN = process.env.SEEN || 'all';
const MAPS = process.env.MAPS || 'all';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(([SEEN, MAPS]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    const rooms = window.__rooms;
    const ids = SEEN === 'all' ? Object.keys(rooms) : SEEN.split(',');
    for (const id of ids) {
      const m = rooms[id].map;
      const cw = Math.ceil(m[0].length / 4);
      const ch = Math.ceil(m.length / 4);
      const s = new Set();
      for (let k = 0; k < cw * ch; k++) s.add(k);
      p.visited.set(id, s);
    }
    if (p.maps) for (const a of MAPS === 'all' ? ['vespera', 'cidade', 'prisao', 'fosso', 'minas', 'floresta'] : MAPS === 'none' ? [] : MAPS.split(',')) p.maps.add(a);
    p.coins = 300;
    p.save();
  }, [SEEN, MAPS]);
  await page.evaluate((room) => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry: '1', from: 'door' });
  }, ROOM);
  await page.waitForFunction(() => window.__scene && window.__scene.player && !window.__scene.transitioning, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__scene.openMap(false));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/map-${ROOM}.png` });
  for (const z of ['fit']) {
    const has = await page.evaluate((z) => !!document.querySelector(`#screen-map [data-cmd="${z}"]`), z);
    if (!has) break;
    await page.click(`#screen-map [data-cmd="${z}"]`);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/map-${ROOM}-out.png` });
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
