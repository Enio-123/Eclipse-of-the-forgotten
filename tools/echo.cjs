// Testa a morte com a sombra (o Eco): morrer deixa 70% das moedas com a sombra no último chão
// seguro, o contador mostra a perda, a sombra espera, acorda perto, ataca (dá para aparar), e
// derrotada devolve as moedas; morrer de novo antes perde as dela; sala de chefe põe a sombra na
// entrada; sem moedas não fica sombra; o mapa mostra onde ela está.
// uso: node echo.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
let fails = 0;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALHA ') + msg); if (!c) fails++; };
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [room, entry]);
    await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.room.id === room && window.__scene.scene.isActive() && window.__scene.loot, room, { timeout: 20000 });
    await page.waitForTimeout(600);
  };
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene.clock >= t, t0 + ms / 1000, { timeout: 90000, polling: 16 });
  };
  const act = (plan) => page.evaluate((plan) => new Promise((res) => {
    const s = window.__scene;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    let f = 0;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      const step = plan[f] || {};
      for (const a of step.held || []) c.held[a] = true;
      for (const a of step.pressed || []) { c.pressed[a] = true; c.held[a] = true; }
      f++;
      if (f > plan.length) { c.update = c.__orig; res(); }
    };
  }), plan);
  const idle = (n) => Array.from({ length: n }, () => ({}));
  // só a sombra e o cavaleiro na sala (os outros inimigos atrapalhariam as contas)
  const calm = () => page.evaluate(() => {
    for (const e of window.__scene.enemies) if (e.kind !== 'echo') { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
  });
  // morre na hora (um golpe com 1 de vida)
  const die = () => page.evaluate(() => {
    const s = window.__scene;
    const p = s.player;
    p.hp = 1;
    p.invuln = 0;
    if (p.hurt(p.x - 10)) s.onHurt();
  });
  const waitRespawn = async (room) => {
    await page.waitForFunction((room) => window.__scene.room.id === room && window.__scene.scene.isActive() && window.__scene.player && !window.__scene.player.dead && window.__scene.clock > 0, room, { timeout: 30000 });
    await page.waitForTimeout(300);
  };
  const state = () => page.evaluate(() => {
    const s = window.__scene;
    const e = s.echo;
    const el = document.getElementById('coins');
    return {
      coins: window.__progress.coins,
      reg: s.registry.get('coins'),
      echo: window.__progress.echo,
      live: e ? { alive: e.alive, state: e.state, x: e.zone.x, y: e.body.bottom, hp: e.hp } : null,
      text: el.querySelector('b').textContent,
      gain: el.querySelector('.gain').textContent,
      loss: el.querySelector('.gain').classList.contains('loss') && el.querySelector('.gain').classList.contains('on'),
      thought: document.getElementById('thought')?.textContent ?? '',
      hp: s.player.hp,
      saved: JSON.parse(localStorage.getItem('eclipse-progresso-v1') || '{}'),
    };
  });

  // ---------- 1. morrer com moedas ----------
  await page.evaluate(() => window.__progress.reset());
  await start('ponte', 'P');
  await calm();
  await page.evaluate(() => {
    const pr = window.__progress;
    pr.coins = 200;
    pr.seen.add('coin:first');
    pr.checkpoint('ponte', 'P', 'scythe');
    window.__scene.registry.set('coins', 200);
  });
  // anda até o meio da ponte (o último chão seguro fica lá)
  await page.evaluate(() => window.__scene.player.teleport(60 * 16 + 8, 22 * 16));
  await wait(500);
  const safe = await page.evaluate(() => ({ x: window.__scene.player.lastSafe.x, y: window.__scene.player.lastSafe.y }));
  await die();
  await page.waitForTimeout(250);
  let st = await state();
  ok(st.coins === 60 && st.echo && st.echo.coins === 140, `morreu com 200: ficou com ${st.coins}, a sombra guarda ${st.echo && st.echo.coins}`);
  ok(st.echo && st.echo.room === 'ponte' && Math.abs(st.echo.x - safe.x) < 2 && Math.abs(st.echo.y - safe.y) < 2, `a sombra fica no último chão seguro (${st.echo && st.echo.x},${st.echo && st.echo.y} / ${safe.x},${safe.y})`);
  ok(st.text === '60' && st.loss && st.gain === '-140', `contador mostra a perda (${st.text}, "${st.gain}", lilás ${st.loss})`);
  ok(st.saved.coins === 60 && st.saved.echo && st.saved.echo.coins === 140, `gravado: ${st.saved.coins} moedas, sombra com ${st.saved.echo && st.saved.echo.coins}`);
  await page.screenshot({ path: `${OUT}/1-morte.png` });
  await waitRespawn('ponte');
  await wait(1500);
  st = await state();
  ok(st.live && st.live.alive && st.live.state === 'wait', `de volta na vela, a sombra espera na ponte (${st.live && st.live.state})`);
  ok(/sombra/.test(st.thought), `pensamento explica a sombra ("${st.thought}")`);
  ok(st.hp === (await page.evaluate(() => window.__progress.maxHp)), `volta com a vida cheia (${st.hp})`);

  // ---------- 2. a sombra acorda e ataca ----------
  await calm();
  await page.evaluate(() => {
    const s = window.__scene;
    const e = s.echo;
    s.player.teleport(e.zone.x - 250, e.home.y + 8);
    s.player.facing = 1;
  });
  await wait(300);
  await page.evaluate(() => { const s = window.__scene; s.cameras.main.centerOn(s.echo.zone.x - 60, s.echo.zone.y); });
  await page.screenshot({ path: `${OUT}/2-sombra-esperando.png` });
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(s.echo.zone.x - 120, s.echo.home.y + 8); });
  await wait(400);
  st = await state();
  ok(st.live.state !== 'wait', `perto, a sombra acorda (${st.live.state})`);
  ok(/abismo|sombra/.test(st.thought), `pensamento na primeira vez ("${st.thought}")`);
  // fica parado: ela chega, prepara e avança
  await page.evaluate(() => { const e = window.__scene.echo; e.go('drift'); e.atkCd = 0.4; });
  const seen = await page.evaluate(() => new Promise((res) => {
    const s = window.__scene;
    const out = { states: new Set(), hpMin: s.player.hp, shot: false };
    const t0 = s.clock;
    const tick = () => {
      out.states.add(s.echo.state);
      out.hpMin = Math.min(out.hpMin, s.player.hp);
      if (s.clock - t0 > 7 || (out.hpMin < 5 && out.states.has('recover'))) {
        res({ states: [...out.states], hpMin: out.hpMin });
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  ok(seen.states.includes('wind') && seen.states.includes('strike'), `prepara e avança (${seen.states.join(', ')})`);
  ok(seen.hpMin < 5, `o corte machuca quem fica parado (vida mínima ${seen.hpMin})`);
  // fotos da preparação e do avanço
  await page.evaluate(() => { const s = window.__scene; s.player.hp = 5; s.player.invuln = 99; s.registry.set('hp', 5); });
  await page.waitForFunction(() => window.__scene.echo.state === 'wind' && window.__scene.echo.t > 0.3, null, { timeout: 30000, polling: 16 });
  await page.screenshot({ path: `${OUT}/3-preparando.png` });
  await page.waitForFunction(() => window.__scene.echo.state === 'strike' && window.__scene.echo.t > 0.08, null, { timeout: 30000, polling: 16 });
  await page.screenshot({ path: `${OUT}/4-avanco.png` });

  // ---------- 3. aparar ----------
  await page.waitForFunction(() => window.__scene.echo.state === 'drift', null, { timeout: 30000, polling: 16 });
  const parried = await page.evaluate(() => new Promise((res) => {
    const s = window.__scene;
    const e = s.echo;
    e.atkCd = 0;
    const p = s.player;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    let fired = false;
    const t0 = s.clock;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      p.facing = e.zone.x > p.x ? 1 : -1;
      if (!fired && e.state === 'wind' && e.t > 0.36) {
        fired = true;
        c.pressed.attack = true;
        c.held.attack = true;
      }
      if (e.state === 'stagger' || s.clock - t0 > 8) {
        c.update = c.__orig;
        res({ state: e.state, fired });
      }
    };
  }));
  ok(parried.state === 'stagger', `golpe no fim da preparação apara a sombra (${parried.state})`);
  await page.screenshot({ path: `${OUT}/5-aparada.png` });

  // ---------- 4. derrotar devolve as moedas ----------
  await page.evaluate(() => {
    const s = window.__scene;
    const e = s.echo;
    e.hp = 0.5;
    const p = s.player;
    p.teleport(e.zone.x - 26, e.body.bottom + 2);
    p.facing = 1;
  });
  await act([{ pressed: ['attack'] }, ...idle(10)]);
  await wait(200);
  st = await state();
  ok(st.live && !st.live.alive, 'a sombra cai com o golpe');
  ok(st.coins === 200 && st.echo === null, `as moedas voltam (${st.coins}), a sombra some do progresso`);
  await page.screenshot({ path: `${OUT}/6-moedas-voltando.png` });
  await wait(2600);
  st = await state();
  ok(st.reg === 200 && st.text === '200', `contador chega em 200 (${st.text})`);
  ok(st.saved.coins === 200 && !st.saved.echo, `gravado sem sombra (${st.saved.coins})`);
  ok(/voltaram/.test(st.thought), `pensamento da volta ("${st.thought}")`);

  // ---------- 5. morrer de novo antes perde as moedas da sombra ----------
  await page.evaluate(() => { const s = window.__scene; s.player.invuln = 0; s.player.teleport(40 * 16 + 8, 22 * 16); });
  await wait(400);
  await die();
  await waitRespawn('ponte');
  st = await state();
  ok(st.coins === 60 && st.echo.coins === 140, `morreu: ${st.coins} na bolsa, ${st.echo.coins} na sombra`);
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(20 * 16 + 8, 22 * 16); });
  await wait(400);
  await die();
  await page.waitForTimeout(250);
  st = await state();
  ok(st.coins === 18 && st.echo.coins === 42, `morreu de novo: a sombra antiga some, a nova leva 70% de 60 (${st.coins} / ${st.echo.coins})`);
  await waitRespawn('ponte');
  await wait(1300);
  st = await state();
  ok(/se desfez/.test(st.thought) && /140/.test(st.thought), `avisa o que se perdeu ("${st.thought}")`);
  ok(await page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'echo').length === 1), 'só uma sombra na sala');

  // ---------- 6. o mapa mostra a sombra ----------
  await page.evaluate(() => window.__scene.openMap(false));
  await page.waitForTimeout(600);
  const legend = await page.evaluate(() => !document.querySelector('#screen-map .lg-echo').hidden && document.querySelector('#screen-map .map-coins').textContent);
  ok(legend && /42 com a sombra/.test(legend), `mapa: legenda da sombra e "${legend}"`);
  await page.screenshot({ path: `${OUT}/7-mapa.png` });
  await page.evaluate(() => window.__ui.closeAll());
  await page.evaluate(() => window.__scene.scene.resume());

  // ---------- 7. sem moedas não fica sombra (e a antiga some) ----------
  await page.evaluate(() => { window.__progress.coins = 0; window.__scene.registry.set('coins', 0); });
  await die();
  await page.waitForTimeout(250);
  st = await state();
  ok(st.echo === null && st.coins === 0, 'morrer sem moedas não deixa sombra');
  await waitRespawn('ponte');

  // ---------- 8. sala de chefe: a sombra espera na entrada ----------
  await page.evaluate(() => { const pr = window.__progress; pr.coins = 50; pr.seen.delete('boss:sineiro'); });
  await start('cripta', '1');
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(30 * 16, 20 * 16); });
  await wait(300);
  await die();
  await page.waitForTimeout(250);
  st = await state();
  ok(st.echo && st.echo.room === 'cripta' && st.echo.x < 10 * 16, `na cripta com o Sineiro vivo, a sombra fica na entrada (x ${st.echo && st.echo.x})`);
  await page.waitForTimeout(2500);

  console.log(errs.length ? errs.join('\n') : 'sem erros no console');
  if (errs.length) fails++;
  console.log(fails ? `${fails} FALHAS` : 'TUDO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
