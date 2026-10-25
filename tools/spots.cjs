// Capturas de pontos específicos: node spots.cjs <saida> sala:entrada:tx:ty:nome ...
const { chromium } = require('playwright');
const OUT = process.argv[2];
const spots = process.argv.slice(3).map((s) => { const [room, entry, tx, ty, name] = s.split(':'); return { room, entry, tx: +tx, ty: +ty, name }; });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  let cur = null;
  for (const s of spots) {
    if (cur !== s.room) {
      await page.evaluate(([room, entry]) => {
        window.__ui.closeAll();
        const g = window.__game;
        const t = g.scene.getScene('title');
        if (t && t.scene.isActive()) t.scene.stop();
        g.scene.start('game', { room, entry, from: 'continue' });
      }, [s.room, s.entry]);
      await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.room.id === room && window.__scene.scene.isActive(), s.room, { timeout: 15000 });
      await page.waitForTimeout(500);
      cur = s.room;
    }
    await page.evaluate(([x, y]) => { const sc = window.__scene; sc.player.hurt = () => false; sc.player.teleport(x, y); }, [s.tx * 16 + 8, s.ty * 16]);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
  }
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
