// Aparar e os inimigos da Cidade-Catedral: guarda e penitente do incensário ficam tontos quando
// aparados, a nuvem de incenso machuca, a flecha do arqueiro machuca e volta quando rebatida.
// Uso: node parry.cjs <pasta das fotos> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
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
  const state = () => page.evaluate(() => {
    const s = window.__scene;
    if (!s || !s.player) return null;
    return { room: s.room.id, x: Math.round(s.player.x), y: Math.round(s.player.body.bottom), tx: Math.floor(s.player.x / 16), ty: Math.floor(s.player.body.bottom / 16) - 1 };
  });
  const waitRoom = (id, timeout = 25000) => page.waitForFunction((id) => {
    const s = window.__scene;
    return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning;
  }, id, { timeout });
  // progresso de quem acabou de vencer o Sineiro (relíquias, prólogo, chefe)
  const setProgress = (extra = []) => page.evaluate((extra) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', ...extra]) p.seen.add(k);
    p.save();
  }, extra);
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
  const face = (dir) => page.evaluate((d) => { window.__scene.player.facing = d; }, dir);
  // espera pelo relógio do jogo (o navegador sem placa de vídeo roda mais devagar que o relógio da máquina)
  const waitGame = async (sec) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout: 30000 });
  };
  const attack = async (n, dir) => {
    for (let i = 0; i < n; i++) {
      if (dir) await face(dir);
      await tap('KeyJ');
      await waitGame(0.85);
    }
  };
  const seen = (k) => page.evaluate((k) => window.__progress.seen.has(k), k);
  const hint = () => page.evaluate(() => document.getElementById('hint').classList.contains('on') ? document.getElementById('hint').textContent.trim() : '');
  const thought = () => page.evaluate(() => document.getElementById('thought').textContent.trim());
  const solidAt = (tx, ty) => page.evaluate(([x, y]) => window.__scene.level.tileAt(x * 16 + 8, y * 16 + 8) >= 2, [tx, ty]);


  // só fica o inimigo do teste (os outros somem como no descanso)
  const keepOnly = (kind, i = 0) => page.evaluate(([kind, i]) => {
    const all = window.__scene.enemies.filter((e) => e.kind === kind);
    const keep = all[i];
    for (const e of window.__scene.enemies) if (e !== keep && e.vanish) e.vanish();
    window.__e = keep;
    return !!keep;
  }, [kind, i]);
  const enemy = () => page.evaluate(() => { const e = window.__e; return { state: e.state, t: e.t, hp: e.hp, alive: e.alive, x: Math.round(e.zone.x), facing: e.facing }; });
  const sword = () => page.evaluate(() => { window.__scene.player.setWeapon('sword'); });
  // espera o inimigo chegar no fim da preparação do golpe e golpeia
  const parryWhen = async (state, tmin, timeout = 20000) => {
    await page.waitForFunction(([s, t]) => { const e = window.__e; return e.state === s && e.t > t; }, [state, tmin], { timeout, polling: 'raf' });
    await tap('KeyJ');
  };

  await setProgress();

  // 1. guarda: corte alto aparado deixa ele tonto, e os golpes entram com bônus
  await start('rua', '1');
  await sword();
  await safe();
  check(await keepOnly('guard'), 'guarda da rua');
  let ok = false;
  for (let k = 0; k < 6 && !ok; k++) {
    await tp(55, 34);
    await face(1);
    await page.evaluate(() => { const e = window.__e; e.facing = -1; e.atkCd = 0; });
    try {
      await parryWhen('windup', 0.38, 6000);
      await waitGame(0.1);
      ok = (await enemy()).state === 'stagger';
    } catch (e) { /* golpe baixo de escudo: tenta de novo */ }
    if (!ok) await waitGame(1.2);
  }
  check(ok, 'golpear no fim da preparação apara o corte do guarda (fica tonto)');
  check(await seen('used:parry'), 'aparar fica registrado (a dica some)');
  let e0 = await enemy();
  await waitGame(0.1);
  // chega perto (o tranco do aparar afasta um pouco) e bate
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(window.__e.zone.x - 34, s.player.body.bottom); s.player.facing = 1; });
  await tap('KeyJ');
  await waitGame(0.2);
  let e1 = await enemy();
  check(e0.hp - e1.hp >= 1.4, `tonto, o golpe entra com bônus (${e0.hp} -> ${e1.hp})`);
  await shot('p1-guarda-tonto');
  await waitGame(1.6);
  check((await enemy()).state !== 'stagger', 'depois de um tempo ele volta a se defender');

  // 2. penitente do incensário: aparar no golpe, nuvem de incenso que machuca
  await start('rua', '1');
  await sword();
  await safe();
  check(await keepOnly('censer'), 'penitente do incensário da rua');
  await page.evaluate(() => { const e = window.__e; e.homeX = 28 * 16; });
  await tp(24, 34);
  await face(1);
  await page.evaluate(() => { const e = window.__e; e.zone.x; e.body.reset(27 * 16, 34 * 16 + 16 - 25); e.facing = -1; e.state = 'chase'; e.atkCd = 0; });
  ok = false;
  try {
    await parryWhen('windup', 0.46, 8000);
    await waitGame(0.1);
    ok = (await enemy()).state === 'stagger';
  } catch (e) { /* nada */ }
  check(ok, 'aparar o incensário deixa o penitente tonto');
  await shot('p2-incensario-tonto');
  // agora deixa ele bater: a nuvem fica no chão e machuca
  await waitGame(1.6);
  await tp(22, 34);
  await face(1);
  await page.evaluate(() => { const e = window.__e; e.body.reset(26 * 16, 34 * 16 + 16 - 25); e.facing = -1; e.state = 'chase'; e.atkCd = 0; });
  await page.waitForFunction(() => window.__e.clouds.length > 0, null, { timeout: 15000 });
  const cloud = await page.evaluate(() => { const c = window.__e.clouds[0]; return { x: Math.round(c.x), y: Math.round(c.y) }; });
  check(Math.abs(cloud.x - 26 * 16 + 42) < 20, `o incensário bate no chão na frente e deixa a nuvem (x ${cloud.x})`);
  await shot('p3-nuvem');
  // com o dano de verdade: entrar na nuvem machuca
  await page.evaluate(() => { const p = window.__scene.player; delete p.hurt; p.invuln = 0; });
  const hp0 = await page.evaluate(() => window.__scene.player.hp);
  await page.evaluate(([x, y]) => { const s = window.__scene; s.player.teleport(x, y); s.player.body.setVelocity(0, 0); window.__e.state = 'recover'; window.__e.t = -5; }, [cloud.x, cloud.y]);
  await waitGame(0.25);
  const hp1 = await page.evaluate(() => window.__scene.player.hp);
  check(hp1 < hp0, `a nuvem de incenso machuca (${hp0} -> ${hp1})`);
  await waitGame(2);
  check(await page.evaluate(() => window.__e.clouds.length === 0), 'a nuvem some sozinha');

  // 3. arqueiro da sacada: a flecha mirada machuca
  await start('rua', '1');
  await sword();
  check(await keepOnly('archer', 2), 'arqueiro do balcão baixo');
  const ar = await enemy();
  await tp(4, 34);
  await page.evaluate(() => { const p = window.__scene.player; p.invuln = 0; });
  const hpA = await page.evaluate(() => window.__scene.player.hp);
  await page.waitForFunction(() => window.__scene.arrows.some((a) => a.hostile && !a.dead), null, { timeout: 15000 });
  const arrow = await page.evaluate(() => { const a = window.__scene.arrows.find((a) => a.hostile); return { dx: a.dx, dy: a.dy }; });
  check(arrow.dx < 0 && arrow.dy > 0, `a flecha vem mirada no cavaleiro, de cima (${arrow.dx.toFixed(2)}, ${arrow.dy.toFixed(2)})`);
  await shot('p4-flecha');
  await page.waitForFunction(() => !window.__scene.arrows.some((a) => a.hostile && !a.dead && !a.stuck), null, { timeout: 15000 });
  const hpB = await page.evaluate(() => window.__scene.player.hp);
  check(hpB < hpA, `a flecha acerta e machuca (${hpA} -> ${hpB})`);

  // 4. rebater a flecha: volta e acerta o arqueiro
  await start('rua', '1');
  await sword();
  await safe();
  check(await keepOnly('archer', 2), 'arqueiro do balcão baixo (de novo)');
  await page.evaluate(() => { window.__e.hp = 2; });
  await tp(4, 34);
  await face(1);
  let back = false;
  for (let k = 0; k < 5 && !back; k++) {
    try {
      await page.waitForFunction(() => {
        const s = window.__scene;
        return s.arrows.some((a) => a.hostile && !a.dead && !a.stuck && Math.hypot(a.x - s.player.x, a.y - s.player.body.center.y) < 48);
      }, null, { timeout: 15000, polling: 'raf' });
    } catch (e) { continue; }
    await face(1);
    await tap('KeyJ');
    await waitGame(0.15);
    back = await page.evaluate(() => window.__scene.arrows.some((a) => !a.hostile && !a.dead && a.dx > 0));
    if (!back) await waitGame(1.5);
  }
  check(back, 'golpe na flecha rebate ela de volta');
  await waitGame(1.2);
  const arEnd = await enemy();
  check(!arEnd.alive || arEnd.hp < 2, `a flecha rebatida acerta o arqueiro (vida ${arEnd.hp})`);
  await shot('p5-rebatida');

  // 5. o bestiário conta os derrotados
  const kills = await page.evaluate(() => Object.fromEntries(window.__progress.kills));
  check((kills.archer ?? 0) >= 1 || arEnd.alive, `bestiário conta o arqueiro (${JSON.stringify(kills)})`);

  check(errs.length === 0, `sem erros no console (${errs.length})`);
  for (const e of errs.slice(0, 8)) console.log('  ' + e);
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
