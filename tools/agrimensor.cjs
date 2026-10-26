// O Agrimensor e as folhas do mapa: começa sem mapa, ele espera na região mais adiantada, vende a folha
// dela e as de antes, a folha comprada aparece no mapa e ele muda de lugar quando o cavaleiro avança.
// Uso: node agrimensor.cjs <pasta das fotos> [url]
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
  // um cavaleiro que acabou de sair da ponte: nenhum mapa, algumas moedas
  const setProgress = (coins, visited = []) => page.evaluate(([coins, visited]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.coins = coins;
    for (const id of visited) p.visited.set(id, new Set([0, 1, 2]));
    p.save();
  }, [coins, visited]);
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
  const tap = (key) => hold(key, 160);
  const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
  const hint = () => page.evaluate(() => document.getElementById('hint').classList.contains('on') ? document.getElementById('hint').textContent.trim() : '');
  const finishTalk = async () => {
    for (let i = 0; i < 20 && (await top()) === 'talk'; i++) {
      await tap('KeyJ');
      await page.waitForTimeout(120);
    }
  };
  const surveyorHere = () => page.evaluate(() => window.__scene.npcs.list.some((n) => n.kind === 'surveyor'));
  const sheets = () => page.evaluate(() => [...document.querySelectorAll('#screen-surveyor .sheet')].map((b) => b.dataset.id + ':' + (b.classList.contains('owned') ? 'owned' : b.disabled ? 'off' : 'on')));
  const prog = () => page.evaluate(() => ({ coins: window.__progress.coins, maps: [...window.__progress.maps] }));

  // 1. começo: sem mapa nenhum
  await setProgress(5);
  await start('catacumbas', '1');
  await safe();
  await calm();
  let pr = await prog();
  check(pr.maps.length === 0, `começa sem mapa (${pr.maps.join(',') || 'nenhum'})`);
  await page.evaluate(() => window.__scene.openMap(false));
  await page.waitForSelector('#screen-map.show');
  await page.waitForTimeout(500);
  await shot('1-sem-mapa');
  const emptyTools = await page.evaluate(() => ['zoom-in', 'fit', 'center'].map((c) => document.querySelector(`#screen-map [data-cmd="${c}"]`).disabled));
  check(emptyTools.every(Boolean), `sem mapa, os botões de arrastar e aproximar ficam desligados (${emptyTools})`);
  await page.evaluate(() => window.__ui.closeAll());
  await page.evaluate(() => window.__scene.resumeGame());
  await page.waitForTimeout(300);

  // 2. o Agrimensor espera nas catacumbas, embaixo, perto da vela
  check(await surveyorHere(), 'o Agrimensor está nas catacumbas');
  const groma = await page.evaluate(() => window.__scene.children.list.some((c) => c.texture && c.texture.key === 'deco-groma'));
  check(groma, 'a groma está fincada do lado dele');
  await tp(86, 43);
  await calm();
  await page.waitForTimeout(400);
  const h = await hint();
  check(/Agrimensor/.test(h), `dica para falar com ele ("${h}")`);
  await shot('2-agrimensor');
  await tap('KeyW');
  await page.waitForTimeout(500);
  check((await top()) === 'talk', 'a primeira conversa abre');
  await finishTalk();
  await page.waitForTimeout(500);
  check((await top()) === 'surveyor', 'depois da conversa, a banca das folhas abre');
  let list = await sheets();
  check(list.length === 1 && list[0] === 'vespera:off', `só a folha das catacumbas, e cara demais com 5 moedas (${list.join(' ')})`);
  await shot('3-banca-sem-moedas');
  await page.click('#screen-surveyor [data-cmd="close"]');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => window.__scene.scene.isActive()), 'fechar a banca volta ao jogo');

  // 3. com moedas: compra a folha
  await page.evaluate(() => { window.__progress.coins = 30; });
  await tap('KeyW');
  await page.waitForTimeout(600);
  check((await top()) === 'surveyor', 'na segunda vez a banca abre direto');
  list = await sheets();
  check(list[0] === 'vespera:on', `com 30 moedas dá para comprar (${list.join(' ')})`);
  await page.click('#screen-surveyor .sheet[data-id="vespera"]');
  await page.waitForTimeout(300);
  pr = await prog();
  check(pr.maps.includes('vespera') && pr.coins === 22, `comprou: folha de Vespera, 22 moedas (${pr.maps.join(',')}; ${pr.coins})`);
  list = await sheets();
  check(list[0] === 'vespera:owned', `a folha aparece como comprada (${list.join(' ')})`);
  await shot('4-comprou');
  await page.click('#screen-surveyor [data-cmd="close"]');
  await page.waitForTimeout(500);
  const banner = await page.evaluate(() => document.getElementById('banner') ? document.getElementById('banner').textContent : '');
  check(/Mapa/.test(banner), `aviso da folha nova ("${banner.trim()}")`);

  // 4. o mapa agora mostra a região
  await page.evaluate(() => window.__scene.openMap(false));
  await page.waitForSelector('#screen-map.show');
  await page.waitForTimeout(700);
  await shot('5-mapa-vespera');
  const tools = await page.evaluate(() => ['zoom-in', 'fit', 'center'].map((c) => document.querySelector(`#screen-map [data-cmd="${c}"]`).disabled));
  check(tools.every((d) => !d), `com a folha, o mapa arrasta, aproxima e acha você (${tools})`);
  await page.evaluate(() => window.__ui.closeAll());
  await page.evaluate(() => window.__scene.resumeGame());

  // 5. o cavaleiro chega na Cidade: o Agrimensor já está lá, e não mais nas catacumbas
  await setProgress(60, ['ponte', 'catacumbas', 'sinos', 'cripta']);
  await page.evaluate(() => { window.__progress.maps.add('vespera'); window.__progress.save(); });
  await start('escadaria', '1');
  await safe();
  await calm();
  check(await surveyorHere(), 'na escadaria, o Agrimensor já chegou');
  await tp(6, 35);
  await page.waitForTimeout(300);
  await tap('KeyW');
  await page.waitForTimeout(500);
  await finishTalk();
  await page.waitForTimeout(500);
  list = await sheets();
  check(list.join(' ') === 'cidade:on vespera:owned', `vende a folha da Cidade e mostra a de Vespera comprada (${list.join(' ')})`);
  await shot('6-banca-cidade');
  await page.click('#screen-surveyor [data-cmd="close"]');
  await page.waitForTimeout(400);
  await setProgress(60, ['ponte', 'catacumbas', 'sinos', 'cripta', 'escadaria']);
  await start('catacumbas', '1');
  check(!(await surveyorHere()), 'de volta às catacumbas, ele não está mais lá');

  // 6. pulou a folha de antes: ele vende as duas
  await setProgress(200, ['ponte', 'catacumbas', 'escadaria', 'praca', 'poco']);
  await start('poco', '1');
  await safe();
  await calm();
  check(await surveyorHere(), 'no poço, o Agrimensor espera na beirada');
  await tp(49, 15);
  await page.waitForTimeout(300);
  await tap('KeyW');
  await page.waitForTimeout(500);
  await finishTalk();
  await page.waitForTimeout(500);
  list = await sheets();
  check(list.join(' ') === 'prisao:on cidade:on vespera:on', `vende a da Prisão e as duas de antes (${list.join(' ')})`);
  for (const id of ['prisao', 'cidade', 'vespera']) {
    await page.click(`#screen-surveyor .sheet[data-id="${id}"]`);
    await page.waitForTimeout(200);
  }
  pr = await prog();
  check(pr.maps.length === 3 && pr.coins === 200 - 30 - 20 - 8, `comprou as três (${pr.maps.join(',')}; ${pr.coins} moedas)`);
  const quote = await page.evaluate(() => document.querySelector('#screen-surveyor .quote').textContent);
  check(/todas as folhas/.test(quote), `com tudo comprado, ele avisa ("${quote}")`);
  await shot('7-tres-folhas');
  await page.click('#screen-surveyor [data-cmd="close"]');
  await page.waitForTimeout(400);

  // 7. o save grava as folhas
  const old = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
    return raw && Array.isArray(raw.maps) && raw.maps.length === 3;
  });
  check(old, 'o save grava as folhas compradas');

  console.log(errs.length ? errs.join('\n') : 'sem erros');
  console.log(fails ? `${fails} falha(s)` : 'tudo certo');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
