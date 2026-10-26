// Foto de cada sala no Performance e no EXTREME, com o cavaleiro parado e sem inimigos, para comparar
// tudo de uma vez (python3 tools/xsheet.py junta as fotos).
// uso: node tools/xsheet.cjs [pasta] [salas sala:entrada,...] [res]
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/sheet';
const ALL = 'ponte:P,catacumbas:1,sinos:1,cripta:1,memoria:1,escadaria:1,praca:1,rua:1,telhados:1,nave:1,claustro:1,galeria:1,altar:1,poco:1,celas:1,correntes:1,guarita:1,fuga:1,arena:1,mascara:1,fosso:1,abismo:1';
const ROOMS = (process.argv[3] || ALL).split(',').map((r) => r.split(':'));
const RES = process.argv[4] || '1';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const preset of ['performance', 'extreme']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('ERR ' + e.message));
    await page.goto(`${process.env.GAME || 'http://localhost:8765'}/index.html?res=${RES}&gfx=${preset}`);
    await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
    await page.evaluate((rooms) => {
      const p = window.__progress;
      p.reset();
      p.prologueDone = true;
      p.kintsugi = 1;
      p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
      for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente']) p.seen.add(k);
      for (const r of rooms) p.seen.add(`banner:${r}`);
      p.save();
    }, ROOMS.map((r) => r[0]));
    for (const [room, entry] of ROOMS) {
      const t0 = Date.now();
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
      await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer, null, { timeout: 60000 });
      await page.evaluate(() => {
        const s = window.__scene;
        for (const e of s.enemies) if (e.vanish) e.vanish();
        s.player.frozen = true;
        s.player.invuln = 0;
      });
      await page.waitForFunction((preset) => {
        const s = window.__scene;
        if (!s || s.clock < 1.8 || s.transitioning) return false;
        if (s.lighting && !s.lighting.ready) return false;
        if (preset === 'extreme' && s.terrainImg && !s.hdImgs.length) return false;
        return true;
      }, preset, { timeout: 45000 }).catch(() => console.log('  (esperou demais)', room));
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__scene.sys.pause());
      await page.screenshot({ path: `${OUT}/${room}-${preset}.png` });
      await page.evaluate(() => window.__scene.sys.resume());
      console.log(preset, room, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    console.log(preset, errs.slice(0, 10).join('\n') || 'sem erros');
    await page.close();
  }
  await browser.close();
})();
