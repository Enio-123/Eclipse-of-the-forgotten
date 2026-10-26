// depura: a segunda sala aberta fica mais escura que a mesma sala aberta primeiro?
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8767/index.html';
const ROOMS = (process.argv[3] || 'catacumbas:1,escadaria:1').split(',').map((r) => r.split(':'));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE ' + m.text()); });
  await page.goto(URL + '?gfx=extreme&res=2');
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(() => { const p = window.__progress; p.reset(); p.prologueDone = true; p.kintsugi = 1; p.save(); });
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
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, { timeout: 60000 });
    await page.waitForTimeout(5000);
    const info = await page.evaluate(() => {
      const s = window.__scene;
      const L = s.lighting;
      const t = L && L.feed.lightTex;
      let avg = null;
      if (t) {
        const c = t.getContext();
        const d = c.getImageData(0, 0, t.width, t.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        avg = (sum / (d.length / 4) / 3).toFixed(1);
      }
      return { room: s.room.id, ready: L && L.ready, amb: L && L.feed.look.ambient, tex: t && [t.width, t.height, t.key], avg, terrain: s.textures.exists('terrain-' + s.room.id), cam: [s.cameras.main.alpha, s.cameras.main.fadeEffect && s.cameras.main.fadeEffect.isRunning, s.cameras.main.fadeEffect && s.cameras.main.fadeEffect.progress] };
    });
    console.log(JSON.stringify(info));
    await page.screenshot({ path: `shots/dark/seq-${room}.png` });
  }
  await browser.close();
})();
