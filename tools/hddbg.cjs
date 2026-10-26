const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  page.on('requestfailed', (r) => console.log('FAIL', r.url()));
  await page.goto((process.env.GAME || 'http://localhost:8765') + '/index.html?res=2&gfx=extreme');
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'ponte', entry: 'P', from: 'door' });
  });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const s = window.__scene;
      const keys = window.__game.textures.getTextureKeys().filter((k) => k.startsWith('hd:'));
      return `t=${s && s.clock.toFixed(1)} hdImgs=${s && s.hdImgs.length} hdTex=${keys.length} ${keys.slice(0, 3).join(',')}`;
    });
    console.log(r);
  }
  await browser.close();
})();
