// Foto de perto das moedas e do caco de vida parados no chão (para conferir o desenho)
// uso: node lootshot.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => {
    window.__ui.closeAll(); window.__progress.reset();
    const g = window.__game; const t = g.scene.getScene('title'); if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'ponte', entry: '2', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'ponte', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const pos = await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
    const cr = s.enemies.filter((e) => e.kind === 'crawler')[0];
    const p = s.player;
    p.teleport(cr.zone.x - 150, cr.body.bottom);
    p.hp = 3; s.registry.set('hp', 3);
    s.loot.drop('guard', cr.zone.x, cr.zone.y);
    s.loot.spawn('life', 1, cr.zone.x + 30, cr.zone.y, false);
    return { x: cr.zone.x, y: cr.body.bottom };
  });
  // espera em tempo de jogo (no navegador sem placa de vídeo o jogo anda mais devagar que o relógio)
  const t0 = await page.evaluate(() => window.__scene.clock);
  await page.waitForFunction((t) => window.__scene.clock >= t, t0 + 2.5, { timeout: 60000, polling: 16 });
  const cam = await page.evaluate(() => { const c = window.__scene.cameras.main; return { sx: c.scrollX, sy: c.scrollY }; });
  // 1280x720 mostra 640x360 do jogo: 2 px de tela por px do jogo
  const cx = (pos.x - cam.sx) * 2, cy = (pos.y - cam.sy) * 2;
  await page.screenshot({ path: `${OUT}/moedas-chao.png`, clip: { x: Math.max(0, cx - 220), y: Math.max(0, cy - 120), width: 440, height: 160 } });
  await page.screenshot({ path: `${OUT}/moedas-cena.png` });
  await browser.close();
})();
