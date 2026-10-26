// Fotos das salas do Vale em pontos escolhidos, numa predefinição gráfica (para ver os fundos e o terreno)
// uso: node vale_look.cjs <pasta-saida> [url-base] (SPOTS=prado:86:34,cais:50:33  GFX=high|extreme|performance)
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:8770';
const GFX = process.env.GFX || 'extreme';
const SPOTS = (process.env.SPOTS || 'descida:30:20,prado:86:34,riacho:64:48,cachoeiras:26:90,cachoeiras:26:30,gruta:50:22,prainha:40:31,rio:60:31,cais:50:33,cais:90:22')
  .split(',').map((s) => s.split(':'));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(`${BASE}/index.html?res=2&gfx=${GFX}`);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente', 'boss:cacador']) p.seen.add(k);
    p.save();
  });
  let last = null;
  let i = 0;
  for (const [room, x, y] of SPOTS) {
    if (room !== last) {
      await page.evaluate((room) => {
        window.__oldPlayer = window.__scene && window.__scene.player;
        window.__ui.closeAll();
        const g = window.__game;
        const t = g.scene.getScene('title');
        if (t && t.scene.isActive()) t.scene.stop();
        const gs = g.scene.getScene('game');
        if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry: '1', from: 'door' });
        else g.scene.start('game', { room, entry: '1', from: 'door' });
      }, room);
      await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, { timeout: 60000 });
      await page.waitForFunction((gfx) => {
        const s = window.__scene;
        if (!s || s.clock < 0.25) return false;
        if (s.cameras.main.fadeEffect.isRunning) return false;
        if (s.lighting && !s.lighting.ready) return false;
        if (gfx === 'extreme' && s.terrainImg && !s.hdImgs.length && !window.__hdWaited) return false;
        return true;
      }, GFX, { timeout: 45000 }).catch(() => console.log('  (esperou demais)'));
      last = room;
    }
    await page.evaluate(([x, y]) => {
      const s = window.__scene;
      for (const e of s.enemies) if (e.kind !== 'boss' && e.vanish) e.vanish();
      s.player.invuln = 999;
      s.player.teleport(x * 16 + 8, y * 16);
      s.player.body.setVelocity(0, 0);
      s.cameras.main.centerOn(x * 16, y * 16 - 40);
    }, [Number(x), Number(y)]);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__scene.sys.pause());
    await page.screenshot({ path: `${OUT}/${String(i++).padStart(2, '0')}-${room}-${GFX}.png`, timeout: 180000 });
    await page.evaluate(() => window.__scene.sys.resume());
    console.log('foto', room, x, y);
  }
  console.log(errs.slice(0, 12).join('\n') || 'sem erros');
  await browser.close();
})();
