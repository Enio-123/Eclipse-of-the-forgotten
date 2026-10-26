// Fotos de pontos certos de uma sala (portas, argolas...), com o cavaleiro parado ali e sem inimigos.
// uso: node tools/spotx.cjs <pasta> <performance|high|extreme> sala:entrada:tx:ty:nome ...
const { chromium } = require('playwright');
const OUT = process.argv[2];
const PRESET = process.argv[3] || 'performance';
const spots = process.argv.slice(4).map((s) => {
  const [room, entry, tx, ty, name] = s.split(':');
  return { room, entry, tx: +tx, ty: +ty, name };
});
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto(`${process.env.GAME || 'http://localhost:8765'}/index.html?res=1&gfx=${PRESET}`);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate((rooms) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto']) p.seen.add(k);
    for (const r of rooms) p.seen.add(`banner:${r}`);
    p.save();
  }, spots.map((s) => s.room));
  let cur = null;
  for (const s of spots) {
    if (cur !== s.room) {
      await page.evaluate(([room, entry]) => {
        window.__oldPlayer = window.__scene && window.__scene.player;
        window.__ui.closeAll();
        const g = window.__game;
        const t = g.scene.getScene('title');
        if (t && t.scene.isActive()) t.scene.stop();
        const gs = g.scene.getScene('game');
        if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
        else g.scene.start('game', { room, entry, from: 'door' });
      }, [s.room, s.entry]);
      await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer, null, { timeout: 60000 });
      cur = s.room;
    }
    await page.evaluate(([x, y]) => {
      const sc = window.__scene;
      for (const e of sc.enemies) if (e.vanish) e.vanish();
      sc.player.frozen = false;
      sc.player.teleport(x, y);
      sc.player.frozen = true;
      sc.player.invuln = 99;
    }, [s.tx * 16 + 8, (s.ty + 1) * 16]);
    await page.waitForFunction((preset) => {
      const sc = window.__scene;
      if (!sc || sc.clock < 1.5 || sc.transitioning) return false;
      if (sc.lighting && !sc.lighting.ready) return false;
      if (preset === 'extreme' && sc.terrainImg && !sc.hdImgs.length) return false;
      return true;
    }, PRESET, { timeout: 45000 }).catch(() => console.log('  (esperou demais)', s.name));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${s.name}-${PRESET}.png` });
    console.log('foto', s.name);
  }
  console.log(errs.slice(0, 10).join('\n') || 'sem erros');
  await browser.close();
})();
