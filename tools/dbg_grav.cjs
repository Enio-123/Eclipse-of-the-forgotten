const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress; p.reset(); p.prologueDone = true; p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['boss:reflexo', 'boss:capataz', 'weapon:picareta']) p.seen.add(k); p.save();
    window.__ui.closeAll(); const g = window.__game; g.scene.getScene('title').scene.stop(); g.scene.start('game', { room: 'capataz', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const jump = async (mul) => {
    await page.evaluate((mul) => { const s = window.__scene; const p = s.player; p.gravMul = mul; p.teleport(24 * 16 + 8, 30 * 16); p.body.setVelocity(0, 0); window.__minY = 1e9; window.__g = []; const fn = () => { window.__minY = Math.min(window.__minY, p.body.bottom); window.__g.push(p.body.gravity.y); }; s.events.on('postupdate', fn); window.__un = () => s.events.off('postupdate', fn); }, mul);
    await page.waitForTimeout(600);
    await page.keyboard.down('Space'); await page.waitForTimeout(900); await page.keyboard.up('Space');
    await page.waitForTimeout(1500);
    return page.evaluate(() => { window.__un(); return { h: 30 * 16 - window.__minY, g: [...new Set(window.__g.map((x) => Math.round(x)))].slice(0, 8), mul: window.__scene.player.gravMul }; });
  };
  console.log('normal', JSON.stringify(await jump(1)));
  console.log('leve', JSON.stringify(await jump(0.6)));
  await browser.close();
})();
