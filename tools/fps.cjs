// mede os quadros por segundo no navegador sem placa de vídeo, sala por sala
// uso: node tools/fps.cjs [endereço] [salas...]  (?res=2 no endereço mede a resolução nítida)
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const ROOMS = process.argv.slice(3);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const info = await page.evaluate(() => { const g = window.__game; return { w: g.canvas.width, h: g.canvas.height, zoom: g.scene.getScenes(true).map((s) => s.sys.settings.key + ':' + (s.cameras && s.cameras.main.zoom)) }; });
  console.log('canvas', JSON.stringify(info));
  for (const room of ROOMS.length ? ROOMS : ['catacumbas', 'sinos', 'praca', 'nave']) {
    await page.evaluate((room) => {
      const g = window.__game;
      window.__ui.closeAll();
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const cur = g.scene.getScene('game');
      window.__scene = null;
      if (cur && cur.scene.isActive()) cur.scene.restart({ room, entry: '1', from: 'continue' });
      else g.scene.start('game', { room, entry: '1', from: 'continue' });
    }, room);
    await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.room.id === room && window.__scene.scene.isActive(), room, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => new Promise((res) => {
      const g = window.__game;
      let n = 0;
      const t0 = performance.now();
      const s = window.__scene;
      const c0 = s.clock;
      const on = () => { n++; };
      g.events.on('step', on);
      setTimeout(() => { g.events.off('step', on); res({ frames: n, secs: (performance.now() - t0) / 1000, game: s.clock - c0, fps: g.loop.actualFps }); }, 3000);
    }));
    console.log(room, (r.frames / r.secs).toFixed(1), 'fps', 'jogo', r.game.toFixed(2), 's em', r.secs.toFixed(2), 's');
  }
  await browser.close();
})();
