// Portas da rodada 3 andando de verdade: catacumbas -> Galeria dos Nichos -> Galeria dos Sinos -> Cripta
// e de volta pelo mesmo caminho.
// uso: node doors3.cjs
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto(process.env.GAME ? process.env.GAME + '/index.html' : 'http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => console.log((c ? 'ok   ' : 'FALHA ') + msg);
  const start = (room, entry, abilities, seen) => page.evaluate(([room, entry, abilities, seen]) => {
    window.__ui.closeAll();
    const P = window.__progress;
    P.reset();
    P.abilities = new Set(['dash', ...abilities]);
    for (const k of seen) P.seen.add(k);
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    window.__scene = null;
    g.scene.start('game', { room, entry, from: 'door' });
  }, [room, entry, abilities, seen]);
  const inRoom = (id) => page.waitForFunction((id) => window.__scene && window.__scene.player && window.__scene.room.id === id && window.__scene.scene.isActive() && !window.__scene.transitioning, id, { timeout: 30000 }).then(() => true).catch(() => false);
  const walk = async (key, room) => {
    await page.keyboard.down(key);
    const r = await inRoom(room);
    await page.keyboard.up(key);
    await page.waitForTimeout(900);
    return r;
  };
  const where = () => page.evaluate(() => { const s = window.__scene; const p = s.player; return { room: s.room.id, x: +(p.x / 16).toFixed(1), feet: +(p.body.bottom / 16).toFixed(1), ground: p.onGround }; });
  const seen = ['memory:vale', 'gate:catacumbas', 'banner:nichos', 'banner:sinos', 'banner:cripta', 'banner:catacumbas'];
  const clear = () => page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); } s.player.invuln = 99; });
  const to = (entry, dx = 0) => page.evaluate(([entry, dx]) => { const s = window.__scene; const d = s.level.spawn(entry); s.player.teleport(d.x + dx, d.y); s.player.invuln = 99; }, [entry, dx]);
  // catacumbas -> Galeria dos Nichos pela grade aberta (saída da direita)
  await start('catacumbas', '2', ['wall', 'double'], seen);
  await inRoom('catacumbas');
  await page.waitForTimeout(800);
  await clear();
  await page.evaluate(() => window.__scene.player.teleport(104 * 16, 44 * 16));
  let r = await walk('KeyD', 'nichos');
  let w = await where();
  ok(r && w.ground && w.x < 6, `catacumbas -> Galeria dos Nichos (${w.room} x ${w.x} pé ${w.feet})`);
  // nichos -> sinos pelo corredor do fundo
  await clear();
  await to('2', -40);
  await page.waitForTimeout(400);
  r = await walk('KeyD', 'sinos');
  w = await where();
  ok(r && w.ground, `Galeria dos Nichos -> Galeria dos Sinos (${w.room} x ${w.x} pé ${w.feet})`);
  // sinos (laje de cima) -> cripta
  await to('2');
  await page.waitForTimeout(400);
  r = await walk('KeyD', 'cripta');
  w = await where();
  ok(r && w.ground, `Galeria dos Sinos -> Cripta (${w.room} x ${w.x} pé ${w.feet})`);
  // cripta -> sinos: chega em pé na laje alta
  await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; if (s.boss) s.boss.state = 'dead'; });
  r = await walk('KeyA', 'sinos');
  w = await where();
  ok(r && w.ground && w.feet <= 9.05 && w.x > 87, `Cripta -> Galeria dos Sinos, em pé na laje (${w.room} x ${w.x} pé ${w.feet})`);
  // sinos -> nichos pela esquerda, lá embaixo: chega no corredor do fundo
  await clear();
  await to('1');
  await page.waitForTimeout(400);
  r = await walk('KeyA', 'nichos');
  w = await where();
  ok(r && w.ground && w.x > 120 && Math.abs(w.feet - 37) < 0.1, `Galeria dos Sinos -> Galeria dos Nichos (${w.room} x ${w.x} pé ${w.feet})`);
  // nichos -> catacumbas pela esquerda, na galeria de cima
  await clear();
  await to('1', 16);
  await page.waitForTimeout(400);
  r = await walk('KeyA', 'catacumbas');
  w = await where();
  ok(r && w.ground, `Galeria dos Nichos -> catacumbas (${w.room} x ${w.x} pé ${w.feet})`);
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
