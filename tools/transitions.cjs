// Testa as passagens entre salas, o espelho, a volta da memória, a pausa e a morte
const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  const log = (...a) => console.log(...a);
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const state = () => page.evaluate(() => {
    const s = window.__scene;
    if (!s || !s.player) return null;
    return { room: s.room.id, x: Math.round(s.player.x), y: Math.round(s.player.body.bottom), hp: s.player.hp, tr: s.transitioning, cin: s.cinematic, active: s.scene.isActive() };
  });
  const waitRoom = (id) => page.waitForFunction((id) => {
    const s = window.__scene;
    return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning;
  }, id, { timeout: 25000 });
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.scene.start('game', { room, entry, from: 'continue' });
    }, [room, entry]);
    await waitRoom(room);
    await page.waitForTimeout(500);
  };
  const safe = () => page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
  const tp = async (tx, ty) => {
    await page.evaluate(([x, y]) => window.__scene.player.teleport(x, y), [tx * 16 + 8, ty * 16]);
    await page.waitForTimeout(400);
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const check = (ok, msg) => log((ok ? 'ok   ' : 'FALHA ') + msg);

  // 1. ponte -> catacumbas pela saída da direita
  await start('ponte', 'P');
  await safe();
  await tp(176, 22);
  await hold('KeyD', 1600);
  await waitRoom('catacumbas');
  let st = await state();
  check(st.room === 'catacumbas' && st.x < 80, `saída da ponte leva às catacumbas (x=${st.x}, y=${st.y})`);
  await page.waitForTimeout(1500);
  await shot('t1-catacumbas-chegada');

  // 2. catacumbas -> ponte pela esquerda
  await safe();
  await hold('KeyA', 1600);
  await waitRoom('ponte');
  st = await state();
  check(st.room === 'ponte' && st.x > 2600, `saída das catacumbas volta à ponte (x=${st.x}, y=${st.y})`);

  // 3. espelho -> memória
  await start('catacumbas', '2');
  await safe();
  await tp(100, 44);
  await page.waitForTimeout(600);
  const hint = await page.evaluate(() => document.getElementById('hint').textContent);
  check(/espelho/.test(hint), `dica do espelho aparece ("${hint.trim()}")`);
  await shot('t3-espelho-dica');
  await hold('KeyW', 120);
  await page.waitForTimeout(700);
  await shot('t3-espelho-rachando');
  await page.waitForTimeout(700);
  await shot('t3-espelho-cacos');
  await waitRoom('memoria');
  st = await state();
  check(st.room === 'memoria', 'tocar o espelho leva à lembrança');
  await page.waitForTimeout(1200);
  await shot('t3-memoria-chegada');
  const hudHidden = await page.evaluate(() => window.__game.registry.get('hud-hidden'));
  check(hudHidden === true, 'HUD escondido na lembrança');
  const attackOff = await page.evaluate(() => window.__scene.player.canAttack === false);
  check(attackOff, 'sem ataque na lembrança');

  // 4. a figura -> volta às catacumbas com a máscara curada e o cartão de fim
  await tp(118, 21);
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 4; i++) { await hold('Space', 260); await page.waitForTimeout(260); }
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(400);
  await shot('t4-figura');
  await waitRoom('catacumbas').catch(() => {});
  await page.waitForFunction(() => window.__scene && window.__scene.room.id === 'catacumbas', null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('t4-cura');
  await page.waitForTimeout(1500);
  await shot('t4-banner');
  const k = await page.evaluate(() => window.__game.registry.get('kintsugi'));
  check(k === 1, `uma rachadura selada (kintsugi=${k})`);
  await page.waitForSelector('#screen-end.show', { timeout: 12000 }).then(() => check(true, 'cartão de fim do prólogo aparece')).catch(() => check(false, 'cartão de fim do prólogo aparece'));
  await page.waitForTimeout(900);
  await shot('t4-fim');
  const save = await page.evaluate(() => localStorage.getItem('eclipse-progresso-v1'));
  check(save && JSON.parse(save).prologueDone === true, 'progresso salvo com o prólogo concluído');
  await page.click('#screen-end [data-cmd="explore"]').catch(async () => {
    const btn = await page.$$('#screen-end button');
    if (btn[0]) await btn[0].click();
  });
  await page.waitForTimeout(500);
  st = await state();
  check(st.active && !(await page.evaluate(() => window.__ui.open)), 'continuar explorando fecha o cartão e o jogo segue');

  // 5. pausa
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const paused = await page.evaluate(() => document.querySelector('#screen-pause').classList.contains('show') && !window.__scene.scene.isActive());
  check(paused, 'Esc abre a pausa e congela o jogo');
  await shot('t5-pausa');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const resumed = await page.evaluate(() => !document.querySelector('#screen-pause').classList.contains('show') && window.__scene.scene.isActive());
  check(resumed, 'Esc de novo volta ao jogo');

  // 6. espinhos e morte
  await start('ponte', 'P');
  await page.evaluate(() => { window.__scene.cinematic = false; window.__scene.player.frozen = false; });
  const hp0 = (await state()).hp;
  await page.evaluate(() => { const s = window.__scene; s.player.lastSafe.set(30 * 16 + 8, 22 * 16); });
  // cai num poço de espinhos
  await page.evaluate(() => {
    const s = window.__scene;
    const lv = s.level;
    for (let x = 0; x < lv.w; x++) for (let y = 0; y < lv.h; y++) if (lv.ch(x, y) === '^') { s.player.teleport(x * 16 + 8, y * 16 + 8); return; }
  });
  await page.waitForTimeout(1400);
  st = await state();
  check(st.hp === hp0 - 1 && Math.abs(st.x - (30 * 16 + 8)) < 40, `espinho tira 1 de vida e volta ao chão seguro (hp ${hp0}->${st.hp}, x=${st.x})`);
  await page.evaluate(() => { const s = window.__scene; s.player.hp = 1; s.player.invuln = 0; s.registry.set('hp', 1); });
  await page.evaluate(() => {
    const s = window.__scene;
    const lv = s.level;
    for (let x = 0; x < lv.w; x++) for (let y = 0; y < lv.h; y++) if (lv.ch(x, y) === '^') { s.player.teleport(x * 16 + 8, y * 16 + 8); return; }
  });
  await page.waitForTimeout(700);
  await shot('t6-morte');
  await page.waitForFunction(() => { const s = window.__scene; return s && s.player && s.player.hp === 5 && s.scene.isActive() && !s.transitioning; }, null, { timeout: 15000 })
    .then(() => check(true, 'morrer recomeça no ponto salvo com vida cheia'))
    .catch(async () => check(false, 'morrer recomeça no ponto salvo com vida cheia ' + JSON.stringify(await state())));

  log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
