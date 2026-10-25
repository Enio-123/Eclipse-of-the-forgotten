// Testa os inimigos novos na ponte: o guarda (bloqueia de frente, corte alto, golpe de escudo,
// rasteira derruba, golpe pelas costas) e o corvo (avisa, mergulha e fica preso no chão).
// uso: node enemies.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const T = 16;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'ponte', entry: '2', from: 'continue' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'ponte' && window.__scene.scene.isActive(), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const ok = (c, msg) => console.log((c ? 'ok   ' : 'FALHA ') + msg);
  // espera em tempo de jogo (no navegador sem placa de vídeo o jogo anda mais devagar que o relógio)
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene.clock >= t, t0 + ms / 1000, { timeout: 60000, polling: 16 });
  };
  // só o guarda e os corvos ficam na sala
  await page.evaluate(() => {
    for (const e of window.__scene.enemies) {
      if (e.legs === undefined && e.aim === undefined) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
    }
  });
  const guard = () => page.evaluate(() => {
    const g = window.__scene.enemies.find((e) => e.constructor.name === 'Guard' || e.legs !== undefined);
    return g ? { x: g.zone.x, hp: g.hp, state: g.state, facing: g.facing, alive: g.alive, bottom: g.body.bottom } : null;
  });
  const player = () => page.evaluate(() => { const p = window.__scene.player; return { x: p.x, hp: p.hp, bottom: p.body.bottom, crouched: p.crouched }; });
  const place = (x, facing, invuln = 0) => page.evaluate(([x, f, inv]) => {
    const s = window.__scene; const p = s.player; p.teleport(x, p.lastSafe.y); p.facing = f; p.invuln = inv; p.hp = 5; s.registry.set('hp', 5);
  }, [x, facing, invuln]);
  const setGuard = (patch) => page.evaluate((patch) => {
    const g = window.__scene.enemies.find((e) => e.legs !== undefined); Object.assign(g, patch);
  }, patch);

  let g0 = await guard();
  ok(!!g0, `guarda na ponte (x=${g0 && Math.round(g0.x)})`);

  // 1. de frente o golpe bate no escudo
  await setGuard({ atkCd: 99, state: 'guard', facing: 1, behindT: 0 });
  await place(g0.x + 40, -1, 9);
  await wait(150);
  const hpBefore = (await guard()).hp;
  await page.keyboard.down('KeyJ'); await wait(40); await page.keyboard.up('KeyJ');
  await wait(120);
  await page.screenshot({ path: `${OUT}/guarda-bloqueio.png` });
  await wait(300);
  let g1 = await guard();
  ok(g1.hp === hpBefore, `golpe de frente bloqueado (vida ${hpBefore} -> ${g1.hp}, estado ${g1.state})`);

  // 2. pelas costas o golpe entra (antes de ele se virar)
  await setGuard({ atkCd: 99, state: 'guard', facing: 1, behindT: 0 });
  await place(g1.x - 34, 1, 9);
  await wait(700);
  await setGuard({ state: 'guard', facing: 1, behindT: 0 });
  await page.keyboard.down('KeyJ'); await wait(40); await page.keyboard.up('KeyJ');
  await wait(250);
  g1 = await guard();
  ok(g1.hp < hpBefore, `golpe pelas costas acerta (vida ${hpBefore} -> ${g1.hp})`);
  await wait(900);
  g1 = await guard();
  ok(g1.facing === -1, `ele se vira depois de um tempo (virado para ${g1.facing})`);

  // 3. corte alto acerta quem fica em pé
  await setGuard({ atkCd: 0, state: 'guard', behindT: 0, facing: 1 });
  await page.evaluate(() => { const g = window.__scene.enemies.find((e) => e.legs !== undefined); g.go('windup', 'windup'); });
  await place(g1.x + 36, -1, 0);
  await wait(400);
  await page.screenshot({ path: `${OUT}/guarda-preparo.png` });
  await wait(330);
  await page.screenshot({ path: `${OUT}/guarda-corte.png` });
  let p1 = await player();
  ok(p1.hp < 5, `corte alto acerta em pé (vida 5 -> ${p1.hp})`);

  // 4. agachado o corte passa por cima
  await wait(1300);
  g1 = await guard();
  await setGuard({ atkCd: 99, behindT: 0, facing: 1 });
  await place(g1.x + 36, -1, 0);
  await page.keyboard.down('ControlLeft');
  await wait(150);
  await page.evaluate(() => { const g = window.__scene.enemies.find((e) => e.legs !== undefined); g.go('windup', 'windup'); });
  await wait(900);
  await page.screenshot({ path: `${OUT}/guarda-agachado.png` });
  p1 = await player();
  await page.keyboard.up('ControlLeft');
  ok(p1.hp === 5, `agachado o corte passa por cima (vida ${p1.hp})`);

  // 5. rasteira: deslizar nas pernas derruba
  await wait(800);
  g1 = await guard();
  await setGuard({ atkCd: 99, state: 'guard', behindT: 0, facing: 1, tripCd: 0 });
  await place(g1.x + 70, -1, 0);
  await wait(100);
  await page.keyboard.down('ControlLeft');
  await wait(80);
  await page.keyboard.down('KeyF'); await wait(40); await page.keyboard.up('KeyF');
  await wait(160);
  await page.keyboard.up('ControlLeft');
  await wait(250);
  g1 = await guard();
  p1 = await player();
  await page.screenshot({ path: `${OUT}/guarda-rasteira.png` });
  ok(g1.state === 'trip' || g1.state === 'down', `rasteira derruba (estado ${g1.state}, cavaleiro x ${Math.round(p1.x - g1.x)} do guarda)`);
  ok(p1.hp === 5, `deslizando não leva dano (vida ${p1.hp})`);
  await wait(250);
  // 6. caído leva dano de qualquer lado (recomeça o tempo no chão: a captura de tela demora)
  await page.evaluate(() => { const g = window.__scene.enemies.find((e) => e.legs !== undefined); g.go('down', 'down'); });
  const hpDown = (await guard()).hp;
  await page.evaluate(() => { const s = window.__scene; const g = s.enemies.find((e) => e.legs !== undefined); s.player.facing = g.zone.x > s.player.x ? 1 : -1; });
  await page.keyboard.down('KeyJ'); await wait(40); await page.keyboard.up('KeyJ');
  await wait(400);
  await page.screenshot({ path: `${OUT}/guarda-caido.png` });
  g1 = await guard();
  ok(g1.hp < hpDown, `caído leva dano (vida ${hpDown} -> ${g1.hp})`);

  // 7. corvo: avisa e mergulha
  await wait(1600);
  const crow0 = await page.evaluate(() => { const c = window.__scene.enemies.find((e) => e.aim !== undefined); return { x: c.zone.x, y: c.zone.y }; });
  await page.evaluate((x) => { const s = window.__scene; s.player.teleport(x + 30, s.player.lastSafe.y); }, crow0.x);
  await page.evaluate(() => { const s = window.__scene; const p = s.player; const sp = s.level.spawns.find((q) => q.kind === 'v'); p.teleport(sp.x + 40, 22 * 16); p.invuln = 0; p.hp = 5; });
  let states = new Set();
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => window.__scene.enemies.find((e) => e.aim !== undefined).state);
    states.add(st);
    if (st === 'dive' && !states.has('shot')) {
      states.add('shot');
      await page.screenshot({ path: `${OUT}/corvo-mergulho.png` });
    }
    await wait(100);
  }
  ok(states.has('windup') && states.has('dive'), `corvo avisa e mergulha (${[...states].join(', ')})`);

  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
