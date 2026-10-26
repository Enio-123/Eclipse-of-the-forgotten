// Fotos das salas lado a lado: Performance (visual original) e EXTREME.
// uso: node xshot.cjs <pasta-saida> [salas: sala:entrada,...] [predefinições: performance,extreme] [res]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const ROOMS = (process.argv[3] || 'ponte:P,catacumbas:1,celas:1').split(',').map((r) => r.split(':'));
const PRESETS = (process.argv[4] || 'performance,extreme').split(',');
const RES = process.argv[5] || '2';
const STEP = Number(process.env.XSHOT_STEP || 0);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const preset of PRESETS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('ERR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(`${process.env.GAME || 'http://localhost:8765'}/index.html?res=${RES}&gfx=${preset}`);
    await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
    await page.evaluate(() => {
      const p = window.__progress;
      p.reset();
      p.prologueDone = true;
      p.kintsugi = 1;
      p.abilities = new Set(['wall', 'double', 'hook', 'veil']);
      for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente']) p.seen.add(k);
      p.save();
    });
    for (const [room, entry, dx] of ROOMS) {
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
      await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, { timeout: 60000 });
      await page.evaluate((dx) => {
        const s = window.__scene;
        for (const e of s.enemies) if (e.vanish) e.vanish();
        s.player.invuln = 0;
        if (dx) s.player.zone.x += Number(dx);
      }, dx || 0);
      // espera a luz da sala e a pintura em 2x (o navegador de teste desenha devagar)
      await page.waitForFunction((preset) => {
        const s = window.__scene;
        if (!s || s.clock < 0.25) return false;
        if (s.lighting && !s.lighting.ready) return false;
        if (preset === 'extreme' && s.terrainImg && !s.hdImgs.length && !window.__hdWaited) return false;
        return true;
      }, preset, { timeout: 45000 }).catch(() => console.log('  (esperou demais)'));
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const s = window.__scene;
        const L = s.lighting;
        return (L ? `luz ${L.bakeMs.toFixed(1)} ms, ${L.feed.lightCount} luzes móveis, ${L.feed.waterCount} águas` : 'sem filtro') + `, hd ${s.hdImgs.length}`;
      });
      console.log(preset, room, info);
      await page.evaluate(() => window.__scene.sys.pause());
      await page.screenshot({ path: `${OUT}/${room}${dx ? '_' + dx : ''}-${preset}.png` });
      await page.evaluate(() => window.__scene.sys.resume());
    }
    console.log(preset, errs.slice(0, 10).join('\n') || 'sem erros');
    await page.close();
  }
  await browser.close();
})();
