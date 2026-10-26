// Fotos do filtro de pintura a óleo em algumas salas, com várias forças.
// uso: node paintshot.cjs <pasta-saida> [salas: sala:entrada,...] [forças: 0,0.15,...] [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const ROOMS = (process.argv[3] || 'celas:1,fosso:1,praca:1,abismo:1').split(',').map((r) => r.split(':'));
const STR = (process.argv[4] || '0,0.15,0.35,0.6,1').split(',').map(Number);
const URL = process.argv[5] || (process.env.GAME || 'http://localhost:8765') + '/index.html?res=2';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente']) p.seen.add(k);
    p.save();
  });
  for (const [room, entry] of ROOMS) {
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
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, { timeout: 30000 });
    await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); s.player.invuln = 99; });
    await page.waitForTimeout(1800);
    const base = await page.evaluate(() => window.__scene.oil ? window.__scene.oil.strength : 0);
    console.log(room, 'força da sala', base);
    for (const k of STR) {
      await page.evaluate((k) => window.__scene.setPaint(k), k);
      await page.waitForTimeout(150);
      await page.evaluate(() => window.__scene.sys.pause());
      await page.screenshot({ path: `${OUT}/${room}-${String(k).replace('.', '')}.png` });
      await page.evaluate(() => window.__scene.sys.resume());
    }
  }
  console.log(errs.slice(0, 10).join('\n') || 'sem erros');
  await browser.close();
})();
