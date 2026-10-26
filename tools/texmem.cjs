// Quanto de textura o jogo segura na placa de vídeo: soma largura x altura x 4 de cada textura
// carregada (no menu e dentro de uma sala), e mostra as maiores.
// uso: node tools/texmem.cjs [url] [sala]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8767/index.html';
const ROOM = process.argv[3] || 'catacumbas';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'gfx=extreme');
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  const sum = () => page.evaluate(() => {
    const tm = window.__game.textures;
    const out = [];
    for (const key of Object.keys(tm.list)) {
      if (key.startsWith('__')) continue;
      const t = tm.list[key];
      let b = 0;
      for (const s of t.source) b += (s.width || 0) * (s.height || 0) * 4;
      out.push([key, b]);
    }
    out.sort((a, b) => b[1] - a[1]);
    const total = out.reduce((a, [, b]) => a + b, 0);
    return { total, n: out.length, top: out.slice(0, 18).map(([k, b]) => `${k} ${(b / 1e6).toFixed(1)}`) };
  });
  const a = await sum();
  console.log(`menu: ${(a.total / 1e6).toFixed(0)} MB em ${a.n} texturas`);
  console.log('  ' + a.top.join('\n  '));
  await page.evaluate((room) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.save();
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry: '1', from: 'continue' });
  }, ROOM);
  await page.waitForFunction(() => window.__scene && window.__scene.player && !window.__scene.transitioning, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const b = await sum();
  console.log(`sala ${ROOM}: ${(b.total / 1e6).toFixed(0)} MB em ${b.n} texturas`);
  console.log('  ' + b.top.join('\n  '));
  await browser.close();
})();
