// Testa a Parte 2 da Área 2: a Sombra do Carrasco no Leito do Abismo e o Véu Abissal.
// A poça dorme, acorda quando o cavaleiro passa e a grade fecha; machadada (acerta na frente, aparar
// deixa tonta), mergulho (some no chão, não dá para acertar, o gêiser sai embaixo do cavaleiro e ela
// fica aberta ao se refazer), investida líquida (acerta quem fica no chão, pulando passa), tentáculos
// (bolhas antes, sobem onde o cavaleiro está, fugir do aviso escapa), gotas em arco (acertam quem
// fica parado, aparar estoura), segunda fase (tudo em dobro), derrota (a tinta volta para o
// cavaleiro e vira o Véu, a memória do machado e o fim do terceiro capítulo), o Véu (três etapas,
// mesma distância do dash, atravessa a membrana do nicho, a membrana do fosso e a grade da cela,
// nunca termina dentro da pedra, nada machuca na janela do Véu) e a volta à sala vencida.
// uso: node sombra.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
const FLOOR = 27; // linha do chão do Leito do Abismo (os pés ficam em 28 * 16)
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
  const shot = async (name) => {
    const paused = await page.evaluate(() => {
      const s = window.__scene;
      if (!s || !s.scene.isActive()) return false;
      s.sys.pause();
      return true;
    });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (paused) await page.evaluate(() => window.__scene.sys.resume());
  };
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  const waitGame = async (sec, timeout = 60000) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout, polling: 16 });
  };
  const until = async (fn, arg, timeout = 30000) => {
    try {
      return await page.waitForFunction(fn, arg, { timeout, polling: 16 });
    } catch (e) {
      const st = await page.evaluate(() => { const s = window.__scene; const b = s && s.boss; return { room: s && s.room.id, active: s && s.scene.isActive(), boss: b && { state: b.state, t: b.t, anim: b.anim, hp: b.hp, alive: b.alive }, p: s && { x: s.player.x, hp: s.player.hp, dead: s.player.dead } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 120) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const tap = (key) => hold(key, 120);
  const setProgress = (extra = [], abilities = ['wall', 'double', 'hook']) => page.evaluate(([extra, ab]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', ...ab]);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', ...extra]) p.seen.add(k);
    p.save();
  }, [extra, abilities]);
  const start = async (room, entry, from = 'door') => {
    await page.evaluate(([room, entry, from]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from });
      else g.scene.start('game', { room, entry, from });
    }, [room, entry, from]);
    await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning);
    await page.waitForTimeout(400);
  };
  const B = () => page.evaluate(() => {
    const b = window.__scene.boss;
    return { state: b.state, t: b.t, hp: b.hp, x: b.zone.x / 16, facing: b.facing, alive: b.alive, phase2: b.phase2, anim: b.anim, tent: b.tentacles.length, globs: b.globs.length, visible: b.sprite.visible };
  });
  const P = () => page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, hp: p.hp, bottom: p.body.bottom, dead: p.dead, room: window.__scene.room.id }; });
  const setP = (tx, opt = {}) => page.evaluate(([tx, o, F]) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(tx * 16 + 8, (F + 1) * 16);
    p.body.setVelocity(0, 0);
    p.hp = 5;
    p.invuln = o.inv ?? 0;
    if (o.face) p.facing = o.face;
    s.registry.set('hp', 5);
  }, [tx, opt, FLOOR]);
  // segura a Sombra parada (sem pensar) numa coluna
  const still = (tx) => page.evaluate(([tx, F]) => {
    const b = window.__scene.boss;
    b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
    b.toIdle();
    b.clearHazards();
    b.sprite.setVisible(true);
    b.body.enable = true;
    if (tx !== undefined) b.body.reset(tx * 16 + 8, (F + 1) * 16 - 52);
    b.body.setVelocity(0, 0);
  }, [tx, FLOOR]);
  // grava os estados e os golpes que o cavaleiro levou, quadro a quadro. Com o navegador lento,
  // um estado curto pode passar entre duas perguntas do teste, então as sondas rodam dentro do
  // jogo: `probes` na entrada de cada estado, `ticks` a cada quadro até devolverem verdadeiro
  const record = (probes = {}, ticks = []) => page.evaluate(([probes, ticks]) => {
    const s = window.__scene;
    const fns = {};
    for (const k of Object.keys(probes)) fns[k] = new Function('s', 'b', 'p', probes[k]);
    const tfs = ticks.map((t) => new Function('s', 'b', 'p', t));
    window.__rec = { states: [], hurt: [], probe: {}, ticks: tfs.map(() => false) };
    const p = s.player;
    if (!p.__wrapped) {
      const orig = p.hurt.bind(p);
      p.hurt = (fx) => { const r = orig(fx); if (r && window.__rec) window.__rec.hurt.push({ t: +s.clock.toFixed(2), state: s.boss && s.boss.state, x: p.x / 16 }); return r; };
      p.__wrapped = true;
    }
    if (window.__unrec) window.__unrec();
    const fn = () => {
      const b = s.boss;
      if (!b) return;
      const R = window.__rec;
      const st = R.states;
      if (st[st.length - 1] !== b.state) {
        st.push(b.state);
        if (fns[b.state] && !(b.state in R.probe)) R.probe[b.state] = fns[b.state](s, b, s.player);
      }
      tfs.forEach((f, i) => { if (!R.ticks[i] && f(s, b, s.player)) R.ticks[i] = true; });
    };
    s.events.on('postupdate', fn);
    window.__unrec = () => s.events.off('postupdate', fn);
  }, [probes, ticks]);
  const rec = () => page.evaluate(() => window.__rec);
  const force = async (a, probes, ticks) => {
    await record(probes, ticks);
    await page.evaluate((a) => { const b = window.__scene.boss; b.thinkT = 99; b.startAttack(a); }, a);
  };
  const reached = (st, timeout = 20000) => until((st) => window.__rec && window.__rec.states.includes(st), st, timeout);
  const idle = () => until(() => window.__scene.boss.state === 'idle', null, 20000);
  // foto no quadro exato: o tick congela a cena (SNAP) e o teste fotografa e solta
  const SNAP = 's.sys.pause(); return true;';
  const snap = async (name, i) => {
    await until((i) => window.__rec.ticks[i], i, 20000);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => window.__scene.sys.resume());
  };
  const press = (code, ms) => `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' })), ${ms});`;

  await setProgress();
  await start('abismo', '1');
  await page.evaluate(() => window.__scene.player.setWeapon('sword'));

  // ---------- 1. a poça dorme ----------
  let b = await B();
  check(b.state === 'sleep' && b.anim === 'pool', `a Sombra dorme como uma poça (${b.state}, ${b.anim})`);
  const membrane = await page.evaluate(() => window.__scene.level.membranes.length);
  check(membrane === 4, `a membrana abissal tapa o nicho no fundo da arena (${membrane} células)`);
  await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.setScroll(44 * 16 - 320, 448 - 260); });
  await waitGame(0.8);
  await shot('s01-poca');
  await page.evaluate(() => { const s = window.__scene; s.cameras.main.startFollow(s.player.zone, true, 0.11, 0.13); });
  await waitGame(0.3);

  // ---------- 2. acorda quando o cavaleiro entra ----------
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.player.x > 13 * 16);
  await page.keyboard.up('KeyD');
  await waitGame(0.3);
  b = await B();
  check(b.state === 'rise' || b.state === 'roar', `a poça se ergue quando o cavaleiro entra (${b.state})`);
  const gate = await page.evaluate(() => window.__scene.level.tileAt(7 * 16 + 8, 26 * 16 + 8));
  check(gate >= 2, `a grade da entrada fecha (tile ${gate})`);
  await waitGame(0.5);
  await shot('s02-ergue');
  await waitGame(2.2);
  b = await B();
  check(b.facing === -1, `virou para o cavaleiro (${b.facing})`);
  const bar = await page.evaluate(() => document.querySelector('#bossbar').classList.contains('on') && document.querySelector('#bossbar p').textContent);
  check(bar === 'A Sombra do Carrasco', `barra de vida do chefe (${bar})`);
  await shot('s03-rugido');

  // ---------- 3. machadada ----------
  await still(40);
  await setP(36, { face: 1 });
  await waitGame(0.3);
  await force('cleave', {}, [`if (b.state === 'cleave' && b.t > 0.08) { ${SNAP} }`]);
  await snap('s04-machadada', 0);
  await reached('cleaverec');
  let p = await P();
  check(p.hp < 5, `a machadada acerta quem fica na frente (vida ${p.hp})`);
  await idle();
  // longe do machado não acerta
  await still(40);
  await setP(31, { face: 1 });
  await waitGame(0.3);
  await force('cleave');
  await reached('cleaverec');
  await waitGame(0.2);
  p = await P();
  check(p.hp === 5, `fora do alcance do machado não acerta (vida ${p.hp})`);
  await idle();

  // ---------- 4. aparar a machadada ----------
  // aperta o golpe no fim da preparação; tonta, chega perto e bate de novo
  await still(40);
  await setP(37, { face: 1, inv: 4 });
  await waitGame(0.3);
  await page.evaluate(() => { window.__k = 0; });
  await force('cleave', {}, [`const k = window.__k;
    if (k === 0 && b.state === 'cleavewind' && b.t > 0.5) { ${press('KeyJ', 110)} window.__k = 1; }
    else if (k === 1 && b.state === 'stagger') { window.__hp0 = b.hp; p.teleport(b.zone.x - 36, 28 * 16); p.facing = 1; window.__k = 2; }
    else if (k === 2 && b.state === 'stagger' && b.t > 0.45) { ${press('KeyJ', 110)} window.__k = 3; return true; }
    else if (k === 1 && (b.state === 'cleaverec' || b.state === 'idle')) return true;
    return false;`]);
  await until(() => window.__rec.ticks[0], null, 20000);
  let r = await rec();
  check(r.states.includes('stagger'), `golpear no fim da preparação apara a machadada (${r.states.join(' > ')})`);
  await waitGame(0.3);
  await shot('s05-aparou');
  const bonus = await page.evaluate(() => ({ hp0: window.__hp0, hp: window.__scene.boss.hp }));
  check(bonus.hp0 - bonus.hp >= 1.4, `tonta, o golpe entra com bônus (${(bonus.hp0 ?? 0).toFixed(2)} -> ${bonus.hp.toFixed(2)})`);
  await idle();

  // ---------- 5. mergulho e gêiser ----------
  await still(46);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('dive', {
    dive: "return { r: b.hit(0, 1, 'side'), vis: b.sprite.visible };",
    well: 'return { b: b.zone.x / 16, p: p.x / 16 };',
    emerge: "return b.hit(0, 1, 'side');",
  }, [
    `if (b.state === 'dive' && b.t > 0.25) { ${SNAP} }`,
    `if (b.state === 'well' && b.t > 0.25) { ${SNAP} }`,
    `if (b.state === 'geyser' && b.t > 0.06) { ${SNAP} }`,
  ]);
  await snap('s06-mergulho', 0);
  await snap('s07-borbulha', 1);
  await snap('s08-geiser', 2);
  await reached('emerge');
  r = await rec();
  check(r.probe.dive && r.probe.dive.r === 'ignored' && !r.probe.dive.vis, `afundada, não dá para acertar (${JSON.stringify(r.probe.dive)})`);
  check(r.probe.well && Math.abs(r.probe.well.b - r.probe.well.p) < 1.2, `a poça para embaixo do cavaleiro (${JSON.stringify(r.probe.well)})`);
  check(r.hurt.some((h) => h.state === 'geyser'), `quem fica em cima leva o gêiser (${r.hurt.map((h) => h.state).join(',')})`);
  check(['sink', 'dive', 'well', 'geyser', 'emerge'].every((s) => r.states.includes(s)), `afunda, persegue, borbulha, explode e se refaz (${r.states.join(' > ')})`);
  check(r.probe.emerge === 'hit', `ao se refazer fica aberta para golpes (${r.probe.emerge})`);
  await idle();
  // saindo de cima das bolhas escapa
  await still(46);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('dive', { well: 'p.teleport((b.zone.x < 30 * 16 ? 40 : 20) * 16, 28 * 16); return true;' });
  await reached('emerge');
  r = await rec();
  check(!r.hurt.length, `saindo de cima das bolhas o gêiser não acerta (${r.hurt.length} golpes)`);
  await idle();

  // ---------- 6. investida líquida ----------
  await still(46);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('rush', { rushrec: "return { x: b.zone.x / 16, h: b.hit(0, 1, 'side') };" }, [
    `if (b.state === 'rushwind' && b.t > 0.3) { ${SNAP} }`,
    `if (b.state === 'rush' && b.t > 0.12) { ${SNAP} }`,
  ]);
  await snap('s09-aviso-investida', 0);
  await snap('s10-investida', 1);
  await reached('rushrec');
  r = await rec();
  check(r.hurt.some((h) => h.state === 'rush'), `a investida acerta quem fica no chão (${r.hurt.map((h) => h.state).join(',')})`);
  check(r.probe.rushrec && r.probe.rushrec.x < 12, `atravessa a arena até a parede (${r.probe.rushrec && r.probe.rushrec.x.toFixed(1)})`);
  check(r.probe.rushrec && r.probe.rushrec.h === 'hit', `parada na parede, se refaz aberta (${r.probe.rushrec && r.probe.rushrec.h})`);
  await idle();
  // pulando passa por cima
  await still(46);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('rush', {}, [`if (b.state === 'rush' && Math.abs(b.zone.x - p.x) < 150) { ${press('Space', 300)} return true; }`]);
  await reached('rushrec');
  r = await rec();
  check(r.ticks[0] && !r.hurt.length, `pulando, a investida passa por baixo (${r.hurt.length} golpes)`);
  await idle();

  // ---------- 7. tentáculos ----------
  await still(46);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('tentacles', {}, [
    "if (b.tentacles.length) { window.__tx = b.tentacles.map((k) => k.x / 16); return true; }",
    `if (b.tentacles.length && b.tentacles[0].t > 0.3) { ${SNAP} }`,
    `if (b.tentacles.some((k) => k.rose)) { s.time.delayedCall(90, () => s.sys.pause()); return true; }`,
  ]);
  await snap('s11-bolhas', 1);
  await until(() => window.__rec.ticks[2] && !window.__scene.sys.settings.active, null, 20000);
  await page.screenshot({ path: `${OUT}/s12-tentaculos.png` });
  await page.evaluate(() => window.__scene.sys.resume());
  const tents = await page.evaluate(() => window.__tx);
  check(tents.length === 3 && tents.some((x) => Math.abs(x - 30.5) < 0.3), `três tentáculos, um bem embaixo do cavaleiro (${tents.map((x) => x.toFixed(1)).join(', ')})`);
  await until(() => window.__scene.boss.tentacles.length === 0, null, 20000);
  r = await rec();
  check(r.hurt.length > 0, `parado em cima das bolhas, o tentáculo acerta (${r.hurt.length})`);
  await idle();
  // saindo do aviso escapa
  await still(46);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('tentacles', {}, ['if (b.tentacles.length) { p.teleport(17 * 16 + 8, 28 * 16); return true; }']);
  await until(() => window.__rec.ticks[0], null, 20000);
  await until(() => window.__scene.boss.tentacles.length === 0, null, 20000);
  r = await rec();
  check(!r.hurt.length, `quem sai de cima das bolhas não leva (${r.hurt.length})`);
  await idle();

  // ---------- 8. gotas em arco ----------
  await still(46);
  await setP(28, { face: 1 });
  await waitGame(0.3);
  await force('throw', {}, [
    'if (b.globs.length) { window.__ng = b.globs.length; return true; }',
    `if (b.globs.length && b.globs[0].t > 0.3) { ${SNAP} }`,
  ]);
  await snap('s13-gotas', 1);
  const ng = await page.evaluate(() => window.__ng);
  check(ng === 3, `arremessa três gotas (${ng})`);
  await until(() => window.__scene.boss.globs.length === 0, null, 20000);
  r = await rec();
  check(r.hurt.length > 0, `parado, uma gota acerta (${r.hurt.length})`);
  await idle();
  // aparar estoura a gota (no primeiro quadro em que ela existe)
  await still(46);
  await setP(28, { face: 1, inv: 9 });
  await force('throw', {}, [`if (!b.globs.length) return false;
    const g = b.globs[0];
    const R = window.Phaser ? Phaser.Geom.Rectangle : g.img.getBounds().constructor;
    const ok = b.parry(new R(g.x - 10, g.y - 10, 20, 20), g.x - 30);
    window.__parried = { ok, left: b.globs.filter((x) => !x.done).length, n: b.globs.length };
    return true;`]);
  await until(() => window.__rec.ticks[0], null, 20000);
  const parried = await page.evaluate(() => window.__parried);
  check(parried.ok && parried.left === parried.n - 1, `um golpe na hora estoura a gota (${JSON.stringify(parried)})`);
  await idle();

  // ---------- 9. segunda fase ----------
  await still(46);
  await setP(30, { inv: 99 });
  const ph = await page.evaluate(() => { const b = window.__scene.boss; b.hp = b.maxHp * 0.5 + 0.5; b.hit(0, 1, 'side'); return { p2: b.phase2, st: b.state }; });
  check(ph.p2 && ph.st === 'rage', `metade da vida: a poça transborda (${ph.st})`);
  await waitGame(0.9);
  await shot('s14-segunda-fase');
  await idle();
  await still(46);
  await setP(30, { inv: 99 });
  await force('dive');
  await reached('emerge', 30000);
  r = await rec();
  const geysers = r.states.filter((s) => s === 'geyser').length;
  check(geysers === 2, `na segunda fase o mergulho vem em dobro (${geysers} gêiseres: ${r.states.join(' > ')})`);
  await idle();
  await still(46);
  await setP(30, { inv: 99 });
  await force('rush', { rushrec: 'return b.zone.x / 16;' });
  await reached('rushrec', 30000);
  r = await rec();
  const legs = r.states.filter((s) => s === 'rush').length;
  check(legs === 2 && r.probe.rushrec > 40, `e a investida vai e volta (${legs} idas, termina em ${(r.probe.rushrec ?? 0).toFixed(1)})`);
  await idle();
  await still(46);
  await setP(30, { inv: 99 });
  await force('tentacles', {}, ['if (b.tentacles.length) { window.__n5 = b.tentacles.length; return true; }']);
  await until(() => window.__rec.ticks[0], null, 20000);
  const n5 = await page.evaluate(() => window.__n5);
  check(n5 === 5, `cinco tentáculos (${n5})`);
  await until(() => window.__scene.boss.tentacles.length === 0, null, 20000);
  await idle();
  // na segunda fase a machadada solta uma onda no chão
  await still(40);
  await setP(34, { inv: 99, face: 1 });
  await force('cleave', {}, [`if (b.waves.length && b.waves[0].dist > 50) { ${SNAP} }`]);
  await snap('s15-onda', 0);
  check(true, 'a machadada da segunda fase solta uma onda pelo chão');
  await idle();

  // ---------- 10. derrota: a tinta volta e vira o Véu ----------
  await page.evaluate(() => {
    const ui = window.__ui;
    window.__thoughts = [];
    window.__banners = [];
    const orig = ui.thought.bind(ui);
    ui.thought = (text, ...rest) => { window.__thoughts.push(text); return orig(text, ...rest); };
    const ob = ui.banner.bind(ui);
    ui.banner = (t, ...rest) => { window.__banners.push(t); return ob(t, ...rest); };
  });
  await still(46);
  await setP(34, { inv: 30, face: 1 });
  check(!(await page.evaluate(() => window.__scene.player.canVeil)), 'antes da derrota o dash ainda é o comum');
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  b = await B();
  check(!b.alive && b.state === 'dead' && b.anim === 'death', `derrotada, a tinta perde a forma (${b.state}, ${b.anim})`);
  await waitGame(1.2);
  await shot('s16-derrota');
  await until(() => window.__scene.player.frozen, null, 20000);
  await waitGame(0.9);
  await shot('s17-tinta-volta');
  await until(() => window.__banners.includes('Véu Abissal'), null, 20000);
  const got = await page.evaluate(() => ({ can: window.__scene.player.canVeil, has: window.__progress.abilities.has('veil'), anim: window.__scene.boss.anim }));
  check(got.can && got.has, `a Sombra entra no cavaleiro e vira o Véu Abissal (${JSON.stringify(got)})`);
  check(got.anim === 'gone', `fica só o machado caído (${got.anim})`);
  await waitGame(0.4);
  await shot('s18-veu');
  await until(() => !window.__scene.player.frozen, null, 20000);
  await waitGame(0.3);
  const t1 = await page.evaluate(() => window.__thoughts.join(' | '));
  check(/vira tinta/.test(t1), `explica o Véu no botão do dash ("${t1.slice(0, 80)}")`);
  const mem = await page.evaluate(() => window.__scene.props.memories.map((m) => m.id));
  check(mem.includes('abismo:boss'), `a memória sai de onde ela estava (${mem.join(',')})`);
  await waitGame(1.0);
  const gate2 = await page.evaluate(() => window.__scene.level.tileAt(7 * 16 + 8, 26 * 16 + 8));
  check(gate2 < 2, `a grade da entrada abre (tile ${gate2})`);
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'abismo:boss'); s.player.teleport(m.x, m.y + 26); });
  await until(() => window.__progress.memories.has('abismo:boss'), null, 20000);
  await waitGame(0.6);
  const banner = await page.evaluate(() => document.querySelector('#banner') && document.querySelector('#banner').textContent);
  check(/machado/i.test(banner || ''), `a memória do machado (${(banner || '').slice(0, 60)})`);
  await shot('s19-memoria');
  await until(() => document.querySelector('#screen-end.show'), null, 30000);
  const end = await page.evaluate(() => document.querySelector('#screen-end').textContent);
  check(/terceiro capítulo/.test(end), `fim do terceiro capítulo (${end.replace(/\s+/g, ' ').slice(0, 70)})`);
  await shot('s20-fim-capitulo');
  await page.evaluate(() => document.querySelector('#screen-end [data-cmd="explore"]').click());
  await waitGame(0.5);
  const t2 = await page.evaluate(() => window.__thoughts.join(' | '));
  check(/A tinta voltou para dentro de mim/.test(t2), `pensa na tinta que voltou ("${t2.slice(-90)}")`);

  // ---------- 11. o Véu: três etapas, mesma distância, membrana do nicho ----------
  await page.evaluate(() => {
    const s = window.__scene;
    window.__vs = [];
    window.__inv = [];
    const fn = () => {
      const p = s.player;
      const st = p.veilStage;
      if (window.__vs[window.__vs.length - 1] !== st) window.__vs.push(st);
      if (p.veiling) window.__inv.push(p.hurt(p.x + 20));
    };
    s.events.on('postupdate', fn);
    window.__unveil = () => s.events.off('postupdate', fn);
  });
  // mesma distância do dash comum no chão livre
  const dashLen = async (veil) => {
    await page.evaluate((v) => { const p = window.__scene.player; p.canVeil = v; p.invuln = 0; p.dashCd = 0; }, veil);
    await setP(20, { face: 1, inv: 0 });
    await waitGame(0.5);
    const x0 = (await P()).x;
    await tap('KeyF');
    await waitGame(0.6);
    return (await P()).x - x0;
  };
  const dPlain = await dashLen(false);
  const dVeil = await dashLen(true);
  check(Math.abs(dPlain - dVeil) < 0.4 && dVeil > 4, `o Véu anda o mesmo que o dash comum (${dPlain.toFixed(2)} x ${dVeil.toFixed(2)} tiles)`);
  const stages = await page.evaluate(() => window.__vs.filter((s) => s !== 'off'));
  check(['dissolve', 'flow', 'form'].every((s) => stages.includes(s)), `dissolve, escorre e se refaz (${stages.join(' > ')})`);
  const inv = await page.evaluate(() => window.__inv);
  check(inv.length > 0 && inv.every((v) => v === false), `na janela do Véu nada machuca (${inv.length} tentativas)`);
  // depois da janela volta a machucar
  const after = await page.evaluate(() => { const p = window.__scene.player; p.invuln = 0; const r = p.hurt(p.x + 20); p.hp = 5; p.invuln = 0; return r; });
  check(after === true, 'fora da janela do Véu o cavaleiro volta a levar golpe');
  // atravessa a membrana do nicho e não termina dentro da pedra
  await setP(58, { face: 1 });
  await waitGame(0.5);
  await page.evaluate(() => { const p = window.__scene.player; p.dashCd = 0; });
  await tap('KeyF');
  await waitGame(0.25);
  await shot('s21-veu-membrana');
  await waitGame(0.5);
  p = await P();
  const rock = await page.evaluate(() => { const p = window.__scene.player; const b = p.body; return window.__scene.level.overlapsRock(b.x, b.y, b.width, b.height); });
  check(p.x > 63 && !rock, `o Véu atravessa a membrana e para no nicho, fora da pedra (x ${p.x.toFixed(1)}, pedra ${rock})`);
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(66 * 16 + 8, 28 * 16); });
  await waitGame(0.6);
  await shot('s22-nicho');
  // volta pela membrana
  await page.evaluate(() => { const p = window.__scene.player; p.facing = -1; p.dashCd = 0; });
  await page.keyboard.down('KeyA');
  await waitGame(0.05);
  await tap('KeyF');
  await page.keyboard.up('KeyA');
  await waitGame(0.6);
  p = await P();
  check(p.x < 62, `e volta pela membrana para a arena (x ${p.x.toFixed(1)})`);
  await page.evaluate(() => window.__unveil());

  // ---------- 12. a sala vencida ----------
  await start('abismo', '1');
  const back = await page.evaluate(() => {
    const s = window.__scene;
    return { boss: !!s.boss, mem: s.props.memories.length, axe: s.children.list.some((o) => o.texture && o.texture.key === 'sombra' && o.type === 'Image') };
  });
  check(!back.boss && !back.mem && back.axe, `depois de vencida, só o machado caído na sala (${JSON.stringify(back)})`);

  // ---------- 13. a membrana do fosso e a grade da cela ----------
  await start('fosso', '1');
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); s.player.hurt = () => false; });
  await page.evaluate(() => { const p = window.__scene.player; p.teleport(12 * 16 + 8, 43 * 16); p.facing = -1; p.dashCd = 0; });
  await waitGame(0.5);
  await page.keyboard.down('KeyA');
  await waitGame(0.05);
  await tap('KeyF');
  await page.keyboard.up('KeyA');
  await waitGame(0.6);
  p = await P();
  check(p.x < 8, `o Véu atravessa a membrana da prateleira do fosso (x ${p.x.toFixed(1)})`);
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'fosso:0'); if (m) s.player.teleport(m.x, m.y + 26); });
  await until(() => window.__progress.memories.has('fosso:0'), null, 20000);
  await waitGame(0.5);
  await shot('s23-camara-fosso');
  check(true, 'a memória dos nomes no bolso, na câmara atrás da membrana');
  await start('celas', '1');
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); s.player.hurt = () => false; });
  await page.evaluate(() => { const p = window.__scene.player; p.teleport(132 * 16 + 8, 28 * 16); p.facing = 1; p.dashCd = 0; });
  await waitGame(0.5);
  await page.keyboard.down('KeyD');
  await waitGame(0.05);
  await tap('KeyF');
  await page.keyboard.up('KeyD');
  await waitGame(0.6);
  p = await P();
  check(p.x > 136.5, `o Véu passa por entre as barras da cela (x ${p.x.toFixed(1)})`);
  await shot('s24-cela');

  // ---------- 14. sem o Véu a membrana segura ----------
  await setProgress([], ['wall', 'double', 'hook']);
  await page.evaluate(() => { window.__thoughts = []; });
  await start('fosso', '1');
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); s.player.hurt = () => false; });
  await page.evaluate(() => { const p = window.__scene.player; p.teleport(11 * 16 + 8, 43 * 16); p.facing = -1; p.dashCd = 0; });
  await waitGame(0.5);
  await page.keyboard.down('KeyA');
  await tap('KeyF');
  await waitGame(0.5);
  await page.keyboard.up('KeyA');
  p = await P();
  check(p.x > 8.4, `sem o Véu a membrana não deixa passar (x ${p.x.toFixed(1)})`);
  await waitGame(0.4);
  const th = await page.evaluate(() => window.__thoughts.join(' | '));
  check(/pele de tinta/i.test(th), `pensa na membrana ("${th.slice(0, 70)}")`);

  console.log(errs.slice(0, 20).join('\n') || 'sem erros no navegador');
  check(!errs.length, `sem erros (${errs.length})`);
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
})();
