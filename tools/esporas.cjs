// As Esporas do Carrasco: o jogo novo começa sem dash, a ponte ensina sem ele, as esporas ficam no
// ossuário do fundo das catacumbas e depois de achar o dash e o deslize funcionam. Um save de antes
// das esporas (sem as folhas do mapa) continua com o dash.
// Uso: node esporas.cjs <pasta das fotos> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp';
const URL = process.argv[3] || 'http://localhost:8767/index.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  let fails = 0;
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  const waitRoom = (id, timeout = 25000) => page.waitForFunction((id) => {
    const s = window.__scene;
    return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning;
  }, id, { timeout });
  const fresh = () => page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
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
    await waitRoom(room);
    await page.waitForTimeout(500);
  };
  const safe = () => page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
  const calm = () => page.evaluate(() => { for (const e of window.__scene.enemies) if (e.vanish) e.vanish(); });
  const tp = async (tx, ty) => {
    await page.evaluate(([x, y]) => { const p = window.__scene.player; p.teleport(x, y); p.body.setVelocity(0, 0); }, [tx * 16 + 8, (ty + 1) * 16]);
    await page.waitForTimeout(350);
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const hint = () => page.evaluate(() => document.getElementById('hint').classList.contains('on') ? document.getElementById('hint').textContent.trim() : '');
  // aperta o dash e confere, quadro a quadro, se ele saiu
  const tryDash = async (crouch = false) => {
    await page.evaluate(() => {
      const s = window.__scene;
      window.__dashed = false;
      window.__slid = false;
      const f = () => { if (s.player.dashing) window.__dashed = true; if (s.player.sliding) window.__slid = true; };
      s.events.on('postupdate', f);
      window.__undash = () => s.events.off('postupdate', f);
    });
    if (crouch) await page.keyboard.down('ControlLeft');
    await page.waitForTimeout(120);
    await hold('KeyF', 80);
    await page.waitForTimeout(400);
    if (crouch) await page.keyboard.up('ControlLeft');
    return page.evaluate(() => { window.__undash(); return { dash: window.__dashed, slide: window.__slid }; });
  };

  // 1. jogo novo: sem dash
  await fresh();
  await start('ponte', 'P');
  await safe();
  let ab = await page.evaluate(() => [...window.__progress.abilities]);
  check(!ab.includes('dash'), `começa sem o dash (${ab.join(',') || 'nenhuma'})`);
  let d = await tryDash();
  check(!d.dash, 'apertar o dash não faz nada antes das esporas');
  const btn = await page.evaluate(() => document.body.classList.contains('has-dash'));
  check(!btn, 'o botão de dash do toque fica escondido');
  await tp(82, 21);
  const h1 = await hint();
  check(!/dash/.test(h1), `a ponte não ensina mais o dash ("${h1}")`);
  await tp(147, 21);
  await calm();
  const h2 = await hint();
  check(/Pule por cima/.test(h2), `o guarda: pular por cima e bater pelas costas ("${h2}")`);

  // 2. as esporas no ossuário do fundo das catacumbas
  await start('catacumbas', '1');
  await safe();
  await calm();
  const relic = await page.evaluate(() => window.__scene.props.relics.filter((r) => r.kind === 'dash').map((r) => ({ x: Math.round(r.x / 16), y: Math.round(r.y / 16), lit: !!r.sprite })));
  check(relic.length === 1 && relic[0].lit, `as Esporas do Carrasco estão no ossuário (${JSON.stringify(relic)})`);
  await tp(20, 41);
  await page.waitForTimeout(500);
  await shot('1-ossuario');
  await tp(17, 41);
  await page.waitForFunction(() => window.__progress.abilities.has('dash'), null, { timeout: 8000 }).catch(() => {});
  ab = await page.evaluate(() => [...window.__progress.abilities]);
  check(ab.includes('dash'), `pegou as esporas (${ab.join(',')})`);
  await page.waitForTimeout(1600);
  await shot('2-esporas');
  const banner = await page.evaluate(() => document.getElementById('banner').textContent);
  check(/Esporas do Carrasco/.test(banner), `nome da relíquia na tela ("${banner.trim().slice(0, 60)}")`);
  await page.waitForFunction(() => !window.__scene.cinematic, null, { timeout: 12000 });
  await page.waitForTimeout(400);
  d = await tryDash();
  check(d.dash, 'com as esporas, o dash sai');
  await page.waitForTimeout(700);
  d = await tryDash(true);
  check(d.slide, 'agachado, o dash vira deslize');
  check(await page.evaluate(() => document.body.classList.contains('has-dash')), 'o botão de dash do toque aparece');
  // a dica do dash na saída do túnel baixo
  await tp(60, 43);
  await page.evaluate(() => window.__progress.seen.delete('used:dash'));
  await page.waitForTimeout(400);
  const h3 = await hint();
  check(/dash/.test(h3), `depois das esporas, as catacumbas ensinam o dash ("${h3}")`);

  // 3. o mapa marca as esporas (antes de pegar) com a folha comprada
  await fresh();
  await page.evaluate(() => {
    const p = window.__progress;
    p.maps.add('vespera');
    p.visited.set('catacumbas', new Set(Array.from({ length: 400 }, (_, i) => i)));
    p.save();
  });
  await start('catacumbas', '1');
  await page.evaluate(() => window.__scene.openMap(false));
  await page.waitForSelector('#screen-map.show');
  await page.waitForTimeout(500);
  await shot('3-mapa');
  await page.evaluate(() => window.__ui.closeAll());

  // 4. save de antes das esporas (sem folhas): continua com o dash
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
    delete raw.maps;
    raw.abilities = ['wall'];
    raw.visited = { ponte: [0, 1, 2], catacumbas: [0, 1] };
    localStorage.setItem('eclipse-progresso-v1', JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.click('#screen-menu [data-cmd="continue"]');
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.scene.isActive(), null, { timeout: 25000 });
  await page.waitForTimeout(600);
  const old = await page.evaluate(() => ({ ab: [...window.__progress.abilities], maps: [...window.__progress.maps], can: window.__scene.player.canDash }));
  check(old.ab.includes('dash') && old.can && old.maps.join() === 'vespera', `save antigo: fica com o dash e a folha de Vespera (${old.ab.join(',')}; ${old.maps.join(',')})`);

  console.log(errs.length ? errs.join('\n') : 'sem erros');
  console.log(fails ? `${fails} falha(s)` : 'tudo certo');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
