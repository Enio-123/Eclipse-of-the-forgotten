// Fotos do traço novo dentro do jogo: título, armas e algumas salas com personagens.
// uso: node tools/look.cjs <pasta> [sala[:entrada[:arma]] ...]  (o jogo servido em http://localhost:8765)
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const ROOMS = process.argv.slice(3);
// ?res=2: fotos na resolução nítida (sem placa de vídeo o jogo escolheria a leve)
const URL = 'http://localhost:8765/index.html?res=2';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/titulo.png` });
  await page.click('#screen-menu [data-cmd="new"]');
  await page.waitForSelector('#screen-weapons.show');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/armas.png` });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'weapon:badalo', 'weapon:incensario']) p.seen.add(k);
    p.save();
  });
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'continue' });
      else g.scene.start('game', { room, entry, from: 'continue' });
    }, [room, entry]);
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer, null, { timeout: 25000 });
    await page.waitForFunction((id) => { const s = window.__scene; return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning; }, room, { timeout: 25000 });
    await page.waitForTimeout(700);
  };
  const list = ROOMS.length ? ROOMS : ['catacumbas', 'praca', 'nave'];
  for (const spec of list) {
    const [room, entry = '1', w] = spec.split(':');
    await start(room, entry);
    if (w) await page.evaluate((w) => window.__scene.player.setWeapon(w), w);
    await page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
    // leva o cavaleiro até o personagem mais perto, para ele aparecer na foto
    const near = await page.evaluate(() => {
      const s = window.__scene;
      const p = s.player;
      const all = s.enemies.filter((e) => e.sprite && e.sprite.active);
      all.sort((a, b) => Math.abs(a.sprite.x - p.x) - Math.abs(b.sprite.x - p.x));
      const e = all[0];
      return e ? { x: Math.round(e.sprite.x), y: Math.round(e.sprite.y), n: all.length, key: e.sprite.texture.key } : null;
    });
    console.log(room, JSON.stringify(near));
    await page.screenshot({ path: `${OUT}/${room}-0.png` });
    if (near) {
      await page.evaluate(([x, y]) => { const p = window.__scene.player; p.teleport(x - 70, y); p.body.setVelocity(0, 0); p.facing = 1; }, [near.x, near.y]);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${room}-1.png` });
    }
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(110);
    await page.screenshot({ path: `${OUT}/${room}-golpe.png` });
    await page.keyboard.up('KeyJ');
    await page.waitForTimeout(400);
  }
  console.log(errs.slice(0, 30).join('\n') || 'sem erros');
  await browser.close();
})();
