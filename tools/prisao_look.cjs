// Fotos da Prisão Subterrânea na resolução nítida: cada sala em pontos-chave (em tiles).
// uso: node tools/prisao_look.cjs <pasta> [sala ...]  (o jogo servido em http://localhost:8765)
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const ONLY = process.argv.slice(3);
const URL = 'http://localhost:8765/index.html?res=2';
const SPOTS = {
  poco: [['1', [[8, 19], [30, 40], [44, 15], [56, 8]]]],
  celas: [['1', [[10, 40], [30, 40], [52, 40], [95, 40], [100, 17], [136, 27], [5, 27]]]],
  correntes: [['1', [[20, 40], [38, 30], [44, 18], [54, 7]]]],
  guarita: [['1', [[6, 7], [40, 15], [20, 23], [46, 40]]]],
  fuga: [['2', [[10, 21], [22, 21], [42, 21], [60, 21], [120, 21], [160, 21]]]],
  arena: [['O0', [[5, 22], [30, 22], [30, 12]]]],
  mascara: [['O0', [[10, 27], [40, 27], [55, 27]]]],
  fosso: [['1', [[35, 12], [40, 27], [20, 37], [12, 42], [30, 52], [46, 61], [40, 77]]]],
  abismo: [['1', [[5, 27], [30, 27], [50, 27], [64, 27]]]],
};
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook']) p.seen.add(k);
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
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer, null, { timeout: 25000 });
    await page.waitForFunction((id) => { const s = window.__scene; return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning; }, room, { timeout: 25000 });
    await page.waitForTimeout(700);
  };
  for (const [room, list] of Object.entries(SPOTS)) {
    if (ONLY.length && !ONLY.includes(room)) continue;
    for (const [entry, pts] of list) {
      await start(room, entry);
      await page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
      const tex = await page.evaluate(() => {
        const s = window.__scene;
        return { terrain: s.textures.exists(`terrain-${s.room.id}`), far: s.textures.exists('prison-far'), enemies: s.enemies.map((e) => e.kind).join(',') };
      });
      console.log(room, JSON.stringify(tex));
      let i = 0;
      for (const [tx, ty] of pts) {
        await page.evaluate(([x, y]) => {
          const s = window.__scene;
          const p = s.player;
          p.teleport(x * 16 + 8, (y + 1) * 16);
          p.body.setVelocity(0, 0);
          s.cameras.main.centerOn(p.x, p.zone.y);
        }, [tx, ty]);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/${room}-${i++}.png` });
      }
    }
  }
  console.log(errs.slice(0, 30).join('\n') || 'sem erros');
  await browser.close();
})();
