// Fotos da onda de memória numa sala do EXTREME: no meio do caminho e aberta (com os ecos).
// uso: node tools/wave.cjs sala:entrada restore|corrupt [ela|povo|carrasco] [pasta]
const { chromium } = require('playwright');
const [room, entry] = (process.argv[2] || 'nave:1').split(':');
const MODE = process.argv[3] || 'restore';
const KIND = process.argv[4] || 'ela';
const OUT = process.argv[5] || 'shots/x';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto((process.env.GAME || 'http://localhost:8765') + '/index.html?res=1&gfx=extreme');
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(([room, entry]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente', `banner:${room}`]) p.seen.add(k);
    p.save();
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry, from: 'door' });
  }, [room, entry]);
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.clock > 0.1, null, { timeout: 60000 });
  await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e.vanish) e.vanish();
    s.player.frozen = true;
  });
  await page.waitForFunction(() => {
    const s = window.__scene;
    return s.clock > 1.2 && s.lighting && s.lighting.ready && (!s.terrainImg || s.hdImgs.length);
  }, null, { timeout: 60000 }).catch(() => console.log('  (esperou demais)'));
  await page.screenshot({ path: `${OUT}/wave-${room}-0.png` });
  await page.evaluate(([mode, kind]) => {
    const s = window.__scene;
    const p = s.player;
    s.memWave.start(p.x + 60, p.body.center.y - 10, mode);
    s.memWave.echoes(p.x + 60, p.body.center.y, kind, mode, p.sprite);
  }, [MODE, KIND]);
  for (const [name, r] of [['1', 200], ['2', 500]]) {
    await page.waitForFunction((r) => window.__scene.xp.feed.mem[2] >= r, r, { timeout: 60000 }).catch(() => console.log('  (onda lenta)'));
    await page.screenshot({ path: `${OUT}/wave-${room}-${name}.png` });
    console.log('foto', name, await page.evaluate(() => Array.from(window.__scene.xp.feed.mem).map((v) => v.toFixed(1)).join(' ')));
  }
  await browser.close();
})();
