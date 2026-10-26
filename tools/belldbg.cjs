// depuração: golpe para cima no sino do claustro, mostrando a caixa do golpe e a do sino
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset(); p.prologueDone = true; p.kintsugi = 1; p.weapon = 'scythe';
    p.abilities = new Set(['dash', 'wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo']) p.seen.add(k);
    p.save();
    window.__ui.closeAll();
    const g = window.__game; const t = g.scene.getScene('title'); if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'claustro', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'claustro' && !window.__scene.transitioning, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e.vanish) e.vanish();
    const b = s.fixtures.bells[0];
    s.player.teleport(79 * 16 + 8, 24 * 16);
    window.__boxes = [];
    const orig = s.fixtures.strike.bind(s.fixtures);
    s.fixtures.strike = (box, p) => { window.__boxes.push([Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)]); return orig(box, p); };
    return { bell: b && { x: b.x, top: b.top, h: b.sprite.displayHeight }, bells: s.fixtures.bells.length };
  });
  console.log('sino', JSON.stringify(info));
  await page.waitForTimeout(500);
  const pst = await page.evaluate(() => { const p = window.__scene.player; return { x: p.x, bottom: p.body.bottom, ground: p.onGround }; });
  console.log('cavaleiro', JSON.stringify(pst));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(60);
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(80);
  await page.keyboard.up('KeyJ');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => ({ boxes: window.__boxes.slice(0, 6), rung: window.__progress.seen.has('bell:claustro:0'), anim: window.__scene.player.sprite.anims.currentAnim && window.__scene.player.sprite.anims.currentAnim.key }));
  console.log(JSON.stringify(r));
  await browser.close();
})();
