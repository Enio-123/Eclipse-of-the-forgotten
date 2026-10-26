// Desliga uma parte do EXTREME por vez (acumulando) numa sala, com o cavaleiro parado e sem
// inimigos, e no fim tira a mesma foto no Performance. Saída: dbg-<sala>-<passo>.png e o brilho.
// uso: node tools/xdbg.cjs sala:entrada [pasta] [res]
const { chromium } = require('playwright');
const [room, entry] = (process.argv[2] || 'nave:1').split(':');
const OUT = process.argv[3] || 'shots/x';
const RES = process.argv[4] || '1';

async function open(browser, preset) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  await page.goto(`${process.env.GAME || 'http://localhost:8765'}/index.html?res=${RES}&gfx=${preset}`);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(([room, entry]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.abilities = new Set(['wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente', `banner:${room}`]) p.seen.add(k);
    p.save();
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry, from: 'door' });
  }, [room, entry]);
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.clock > 0.1, null, { timeout: 60000 });
  await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e.vanish) e.vanish();
    s.player.frozen = true;
    s.player.invuln = 0;
  });
  await page.waitForFunction((preset) => {
    const s = window.__scene;
    if (!s || s.clock < 1.2) return false;
    if (s.lighting && !s.lighting.ready) return false;
    if (preset === 'extreme' && s.terrainImg && !s.hdImgs.length) return false;
    return true;
  }, preset, { timeout: 60000 }).catch(() => console.log('  (esperou demais)'));
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await open(browser, 'extreme');
  const steps = [
    ['tudo', () => {}],
    ['sem-fg', () => { const b = window.__scene.backdrop; if (b.fg) b.fg.setVisible(false); }],
    ['sem-hd', () => { window.__scene.hdOff(); }],
    ['sem-nevoa', () => { window.__scene.mist && window.__scene.mist.destroy(); }],
    ['sem-post', () => { window.__scene.lighting.feed.post = false; }],
    ['sem-luz', () => { window.__scene.lighting.feed.light = false; }],
    ['sem-filtro', () => { window.__scene.xp.feed = null; }],
  ];
  for (const [name, fn] of steps) {
    await page.evaluate(`(${fn.toString()})()`);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/dbg-${room}-${name}.png` });
    const cam = await page.evaluate(() => { const c = window.__scene.cameras.main; return `${Math.round(c.scrollX)},${Math.round(c.scrollY)} ${window.__scene.room.id}`; });
    console.log('foto', name, cam);
  }
  const info = await page.evaluate(() => {
    const L = window.__scene.lighting;
    return `luz ${L.bakeMs.toFixed(1)} ms, luzes no mapa ${L.baked.length}, móveis ${L.feed.lightCount}`;
  });
  console.log(info);
  await page.close();
  const perf = await open(browser, 'performance');
  await perf.screenshot({ path: `${OUT}/dbg-${room}-performance.png` });
  const cam = await perf.evaluate(() => { const c = window.__scene.cameras.main; return `${Math.round(c.scrollX)},${Math.round(c.scrollY)} ${window.__scene.room.id}`; });
  console.log('foto performance', cam);
  await browser.close();
})();
