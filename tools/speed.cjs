// Mede quantos quadros por segundo o jogo faz em cada predefinição (no navegador de teste, sem placa)
const { chromium } = require('playwright');
const ROOM = process.argv[2] || 'ponte:P';
const PRESETS = (process.argv[3] || 'performance,high,extreme').split(',');
const RES = process.argv[4] || '1';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const p of PRESETS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.log('ERR ' + e.message));
    await page.goto(`${process.env.GAME || 'http://localhost:8765'}/index.html?res=${RES}&gfx=${p}`);
    await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
    const [room, entry] = ROOM.split(':');
    await page.evaluate(([room, entry]) => {
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.scene.start('game', { room, entry, from: 'door' });
    }, [room, entry]);
    await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 60000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const g = window.__game;
      const f = () => { n++; };
      g.events.on('step', f);
      setTimeout(() => { g.events.off('step', f); res((n * 1000) / (performance.now() - t0)); }, 4000);
    }));
    console.log(p, 'res', RES, 'fps', r.toFixed(1));
    await page.close();
  }
  await browser.close();
})();
