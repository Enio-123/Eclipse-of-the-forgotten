// anda numa sala a partir de um ponto e mostra por onde o cavaleiro passou
// uso: node tools/walkdbg.cjs <url> <sala> <entrada> <tx> <ty> <tecla> <ms> [habilidades]
const { chromium } = require('playwright');
const [URL, ROOM, ENTRY, TX, TY, KEY, MS, AB] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto(URL + '?gfx=performance');
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(([room, entry, ab]) => {
    const p = window.__progress;
    p.reset(); p.prologueDone = true; p.kintsugi = 1;
    p.abilities = new Set((ab || '').split(',').filter(Boolean));
    for (const k of ['memory:vale', 'gate:catacumbas']) p.seen.add(k);
    p.save();
    window.__ui.closeAll();
    const g = window.__game; const t = g.scene.getScene('title'); if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry, from: 'continue' });
  }, [ROOM, ENTRY, AB]);
  await page.waitForFunction(() => window.__scene && window.__scene.player && !window.__scene.transitioning, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.evaluate(([tx, ty]) => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) { const sp = e.vanish(); if (sp) sp.destroy(); } s.player.hurt = () => false; s.player.teleport(+tx * 16 + 8, (+ty + 1) * 16); }, [TX, TY]);
  await page.waitForTimeout(300);
  await page.keyboard.down(KEY);
  for (let i = 0; i < Math.ceil(+MS / 250); i++) {
    await page.waitForTimeout(250);
    console.log(await page.evaluate(() => { const s = window.__scene; const p = s.player; return `${s.room.id} x=${(p.x / 16).toFixed(1)} y=${(p.body.bottom / 16).toFixed(1)} g=${p.onGround}`; }));
  }
  await page.keyboard.up(KEY);
  await browser.close();
})();
