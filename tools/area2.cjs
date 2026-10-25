// Testa a Prisão Subterrânea (área 2, até a Carcereira): as sete salas abrem com o terreno pintado e
// os fundos da prisão, a alavanca do poço abre a grade da escadaria, a relíquia do Gancho de
// Corrente, a argola que puxa o cavaleiro, o ferro liso, o carcereiro (corrente alta, agachar,
// aparar, pancada no chão), o Tomé na cela, as chaves da guarita (alçapão, queda e alarme com as
// grades caindo uma a uma, a fuga limpa e o fim do alarme), a alavanca da galeria, a porta das
// máscaras, a arena com as quatro levas e o Elo do Condenado, e a parede falsa das celas.
// uso: node area2.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
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
  const shot = async (name) => {
    const paused = await page.evaluate(() => {
      const s = window.__scene;
      if (!s || !s.scene.isActive()) return false;
      s.scene.pause();
      return true;
    });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (paused) await page.evaluate(() => window.__scene.scene.resume());
  };
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  const waitGame = async (sec, timeout = 60000) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout, polling: 16 });
  };
  const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 16 });
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const tap = (key) => hold(key, 120);
  const setProgress = (extra = [], abilities = ['wall', 'double']) => page.evaluate(([extra, abilities]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(abilities);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', ...extra]) p.seen.add(k);
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
  // pés do cavaleiro na base do tile (tx, ty)
  const tp = (tx, ty, face) => page.evaluate(([x, y, f]) => {
    const p = window.__scene.player;
    p.teleport(x, y);
    p.body.setVelocity(0, 0);
    if (f) p.facing = f;
  }, [tx * 16 + 8, (ty + 1) * 16, face]);
  const P = () => page.evaluate(() => { const s = window.__scene; const p = s.player; return { x: p.x / 16, y: p.body.bottom / 16, hp: p.hp, dead: p.dead, room: s.room.id, ground: p.onGround, crouched: p.crouched }; });
  const seen = (k) => page.evaluate((k) => window.__progress.seen.has(k), k);
  const solid = (tx, ty) => page.evaluate(([x, y]) => window.__scene.level.tileAt(x * 16 + 8, y * 16 + 8) >= 2, [tx, ty]);
  const thought = () => page.evaluate(() => document.getElementById('thought').textContent.trim());
  const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
  const talkText = () => page.evaluate(() => document.querySelector('#screen-talk .talk-text').textContent);
  const finishTalk = async () => {
    for (let i = 0; i < 24 && (await top()) === 'talk'; i++) {
      await tap('KeyJ');
      await page.waitForTimeout(120);
    }
  };
  // tira os inimigos do caminho (menos os escolhidos)
  const calm = (keep = []) => page.evaluate((keep) => {
    const s = window.__scene;
    s.enemies.forEach((e, i) => { if (!keep.includes(i) && e.vanish) e.vanish(); });
  }, keep);
  const safe = () => page.evaluate(() => { const p = window.__scene.player; p.hp = 5; window.__scene.registry.set('hp', 5); });

  // ---------- 1. as sete salas abrem com a pintura da prisão ----------
  await setProgress();
  const ROOMS = [['poco', '1'], ['celas', '1'], ['correntes', '1'], ['guarita', '1'], ['fuga', '2'], ['arena', 'O0'], ['mascara', 'O0']];
  for (const [room, entry] of ROOMS) {
    await start(room, entry);
    const r = await page.evaluate(() => {
      const s = window.__scene;
      const keys = new Set();
      for (const o of s.children.list) for (const k of [o.texture && o.texture.key, o.frame && o.frame.texture && o.frame.texture.key, o.displayTexture && o.displayTexture.key, o.displayFrame && o.displayFrame.texture && o.displayFrame.texture.key]) if (k) keys.add(k);
      return { id: s.room.id, theme: s.room.theme, terrain: keys.has(`terrain-${s.room.id}`), far: keys.has('prison-far'), mid: keys.has('prison-mid'), music: s.room.music };
    });
    check(r.id === room && r.theme === 'prison', `${room}: a sala abre (${r.id}, ${r.theme})`);
    check(r.terrain && r.far && r.mid, `${room}: terreno pintado e os dois fundos da prisão (${r.terrain}, ${r.far}, ${r.mid})`);
    check(r.music === 'prison', `${room}: música da prisão (${r.music})`);
  }
  const track = await page.evaluate(() => window.__audioTrack && window.__audioTrack());
  if (track !== undefined) check(track === 'prison', `toca a trilha do Enio na prisão (${track})`);

  // ---------- 2. a alavanca do poço abre a grade da escadaria ----------
  await start('poco', '1');
  await calm();
  check(await solid(2, 18), 'a grade da escadaria começa fechada');
  await tp(6, 19, -1);
  await waitGame(0.3);
  await shot('p01-alavanca');
  await tap('KeyJ');
  await waitGame(0.4);
  check(await seen('lever:poco:0'), 'golpe na alavanca puxa a alavanca');
  await waitGame(2.6);
  check(!(await solid(2, 18)), 'a grade da escadaria sobe');
  check(/escadaria subiu/.test(await thought()), `pensamento da alavanca ("${(await thought()).slice(0, 50)}")`);
  await shot('p02-grade-aberta');

  // ---------- 3. a relíquia do gancho e a argola ----------
  await start('correntes', '1');
  await calm();
  check(await page.evaluate(() => window.__scene.props.relics.some((r) => r.kind === 'hook' && r.sprite)), 'relíquia do gancho no pedestal');
  await tp(19, 38, 1);
  await waitGame(0.2);
  await tp(20, 38, 1);
  await until(() => window.__progress.abilities.has('hook'), null, 20000);
  check(await seen('relic:hook'), 'pegou o Gancho de Corrente');
  await until(() => !window.__scene.cinematic, null, 30000);
  check(await page.evaluate(() => window.__scene.player.canHook && document.body.classList.contains('has-hook')), 'o cavaleiro pode lançar o gancho');
  await shot('p03-gancho');
  // embaixo da argola mais baixa: ela acende e o gancho puxa para cima
  await tp(30, 40, 1);
  await waitGame(0.4);
  const ring = await page.evaluate(() => { const s = window.__scene; const r = s.hookTarget(s.player); return r && { x: r.x / 16, y: r.y / 16, lit: r.lit }; });
  check(ring && Math.round(ring.x - 0.5) === 30 && Math.round(ring.y - 0.5) === 32, `a argola de cima está ao alcance (${JSON.stringify(ring)})`);
  const y0 = (await P()).y;
  // o ponto mais alto que os pés alcançam durante a puxada
  await page.evaluate(() => {
    const s = window.__scene;
    window.__minY = s.player.body.bottom;
    window.__phases = new Set();
    const rec = () => { const p = s.player; window.__minY = Math.min(window.__minY, p.body.bottom); if (p.hook) window.__phases.add(p.hook.phase); };
    s.events.on('postupdate', rec);
    window.__unrec = () => s.events.off('postupdate', rec);
  });
  let thrown = false;
  for (let i = 0; i < 4 && !thrown; i++) {
    await tap('KeyE');
    try { await until(() => window.__phases.size > 0, null, 2000); thrown = true; } catch (e) { /* tenta de novo */ }
  }
  check(thrown, 'o gancho sai da mão');
  await until(() => window.__phases.has('pull'), null, 10000).catch(() => {});
  await waitGame(0.12);
  await shot('p04-puxando');
  await until(() => !window.__scene.player.hook, null, 10000);
  const top0 = await page.evaluate(() => { window.__unrec(); return { y: window.__minY / 16, ph: [...window.__phases] }; });
  check(y0 - top0.y > 5, `o gancho puxa o cavaleiro até a argola (pés de ${y0.toFixed(1)} até ${top0.y.toFixed(1)}, ${top0.ph.join(' > ')})`);
  await waitGame(0.6);
  let p;

  // ---------- 4. ferro liso: as garras não seguram ----------
  await tp(57, 22, 1);
  await page.keyboard.down('KeyD');
  await waitGame(0.6);
  p = await P();
  const clung = await page.evaluate(() => window.__scene.player.wallDir);
  await page.keyboard.up('KeyD');
  check(clung === 0 && p.y > 23, `encostado no ferro liso, cai em vez de grudar (preso ${clung}, pés em ${p.y.toFixed(1)})`);
  check(await seen('slick:first'), 'o primeiro toque no ferro liso vira pensamento');
  check(/Ferro liso/.test(await thought()), `pensamento do ferro liso ("${(await thought()).slice(0, 40)}")`);

  // ---------- 5. o carcereiro ----------
  await start('guarita', '1');
  await page.evaluate(() => window.__scene.player.setWeapon('sword'));
  // o da linha 15 (em cima da plataforma de pedra da guarita)
  const ji = await page.evaluate(() => window.__scene.enemies.findIndex((e) => e.kind === 'jailer' && Math.abs(e.body.bottom - 16 * 16) < 4));
  check(ji >= 0, 'carcereiro de guarda na guarita');
  await calm([ji]);
  await page.evaluate((i) => { window.__j = window.__scene.enemies[i]; }, ji);
  const J = () => page.evaluate(() => { const j = window.__j; return { state: j.state, hp: j.hp, x: j.zone.x / 16, facing: j.facing, alive: j.alive }; });
  const place = (jx, px, opt = {}) => page.evaluate(([jx, px, o]) => {
    const s = window.__scene;
    const j = window.__j;
    j.body.reset(jx * 16 + 8, 16 * 16 - 27);
    j.body.setVelocity(0, 0);
    j.facing = px < jx ? -1 : 1;
    j.state = 'chase';
    j.t = 0;
    j.atkCd = o.cd ?? 9;
    const p = s.player;
    p.teleport(px * 16 + 8, 16 * 16);
    p.body.setVelocity(0, 0);
    p.facing = px < jx ? 1 : -1;
    p.hp = 5;
    p.invuln = 0;
    s.registry.set('hp', 5);
  }, [jx, px, opt]);
  // corrente alta de longe: acerta quem fica de pé
  await place(40, 34);
  await waitGame(0.3);
  await page.evaluate(() => { window.__j.atkCd = 0; });
  await until(() => window.__j.state === 'lash', null, 15000);
  await waitGame(0.05);
  await shot('p05-corrente-alta');
  await until(() => window.__j.state === 'lashrec', null, 15000);
  p = await P();
  check(p.hp < 5, `a corrente alta acerta de pé (vida ${p.hp})`);
  await until(() => window.__j.state === 'chase', null, 15000);
  // agachado passa por baixo
  await place(40, 34);
  await page.keyboard.down('KeyS');
  await waitGame(0.3);
  await page.evaluate(() => { window.__j.atkCd = 0; });
  await until(() => window.__j.state === 'lashrec', null, 15000);
  p = await P();
  await page.keyboard.up('KeyS');
  check(p.crouched && p.hp === 5, `agachado, a corrente passa por cima (vida ${p.hp}, agachado ${p.crouched})`);
  await shot('p06-agachado');
  await until(() => window.__j.state === 'chase', null, 15000);
  // aparar: golpe no fim da preparação
  await place(40, 37);
  await waitGame(0.3);
  await page.evaluate(() => { const j = window.__j; j.atkCd = 0; });
  await until(() => { const j = window.__j; return j.state === 'lashwind' && j.t > 0.42; }, null, 15000);
  await tap('KeyJ');
  await waitGame(0.12);
  let j = await J();
  check(j.state === 'stagger', `golpear no fim da preparação apara a corrente (${j.state})`);
  const hp0 = j.hp;
  await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(window.__j.zone.x - 26, 16 * 16); p.facing = 1; });
  await until(() => window.__scene.player.atkCd <= 0, null, 10000);
  await tap('KeyJ');
  await waitGame(0.2);
  j = await J();
  check(hp0 - j.hp > 1.2, `tonto, o golpe entra com bônus (${hp0.toFixed(2)} -> ${j.hp.toFixed(2)})`);
  await until(() => window.__j.state === 'chase', null, 15000);
  // pancada no chão de perto: acerta quem fica, pular escapa
  await place(40, 38);
  await waitGame(0.3);
  await page.evaluate(() => { window.__j.atkCd = 0; });
  await until(() => window.__j.state === 'slamrec', null, 15000);
  p = await P();
  check(p.hp < 5, `a pancada no chão acerta de perto (vida ${p.hp}, ${(await J()).state})`);
  await until(() => window.__j.state === 'chase', null, 15000);
  await place(40, 38);
  await waitGame(0.3);
  await page.evaluate(() => { window.__j.atkCd = 0; });
  await until(() => { const j = window.__j; return j.state === 'slamwind' && j.t > 0.36; }, null, 15000);
  await hold('Space', 240);
  await until(() => window.__j.state === 'slamrec', null, 15000);
  p = await P();
  check(p.hp === 5, `pulando, a pancada não acerta (vida ${p.hp})`);
  await shot('p07-pancada');

  // ---------- 6. o Tomé na cela ----------
  await setProgress([], ['wall', 'double', 'hook']);
  await start('celas', '1');
  await calm();
  const tome = await page.evaluate(() => { const n = window.__scene.npcs.list.find((n) => n.kind === 'prisoner'); return n && { x: n.x / 16, cell: !!window.__scene.npcs.cell }; });
  check(tome && Math.round(tome.x - 0.5) === 30 && tome.cell, `Tomé preso na cela (${JSON.stringify(tome)})`);
  await tp(29, 40, 1);
  await waitGame(0.3);
  await tap('KeyW');
  await until(() => document.querySelector('#screen-talk.show'), null, 10000);
  await page.waitForTimeout(900);
  check(/Passos de ferro/.test(await talkText()), `primeira fala do Tomé ("${(await talkText()).slice(0, 40)}")`);
  await shot('p08-tome');
  await finishTalk();
  check(await seen('preso:met'), 'conheceu o Tomé');
  await page.waitForTimeout(400);
  await tap('KeyW');
  await page.waitForTimeout(1200);
  check(/chaves ficam na guarita/.test(await talkText()), 'sem as chaves, ele lembra onde estão');
  await finishTalk();

  // ---------- 7. as chaves, o alçapão e o alarme ----------
  await start('guarita', '2');
  await calm();
  check(await solid(46, 41), 'o alçapão da guarita está fechado');
  await tp(46, 40);
  await until(() => window.__progress.seen.has('item:chaves'), null, 10000);
  check(true, 'pegou as chaves da prisão');
  await waitGame(0.3);
  await shot('p09-chaves');
  // o alçapão cede, ele cai na galeria e o alarme dispara
  await until(() => window.__scene.room.id === 'fuga' && !window.__scene.transitioning, null, 30000);
  await page.waitForTimeout(300);
  let al = await page.evaluate(() => { const s = window.__scene; return { t: s.alarmT, foes: s.alarmFoes.filter((e) => e.alive).length, gates: s.fixtures.alarms.map((a) => a.x), down: s.fixtures.alarms.filter((a) => a.down).length }; });
  check(al.t >= 0 && al.foes === 5, `caiu na galeria e o alarme acordou os carcereiros (${al.t.toFixed(2)}s, ${al.foes})`);
  check(al.gates.join(',') === '152,132,108,86,66,42' && al.down === 0, `seis grades esperando no teto, da direita para a esquerda (${al.gates.join(',')})`);
  check(await seen('alarm:fuga'), 'o alarme fica marcado');
  await page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
  await until(() => window.__scene.alarmT > 4.2, null, 30000);
  al = await page.evaluate(() => { const s = window.__scene; return { first: s.fixtures.alarms[0].down, second: s.fixtures.alarms[1].down }; });
  check(al.first && !al.second, `a primeira grade cai, a segunda ainda não (${al.first}, ${al.second})`);
  await waitGame(0.4);
  check(await solid(152, 20), 'a grade caída fecha a passagem');
  await shot('p10-alarme');
  // passa antes da última grade: fuga limpa
  await tp(40, 21, -1);
  await waitGame(0.3);
  const clean = await page.evaluate(() => window.__scene.alarmClean);
  check(clean, 'passou antes da última grade: ninguém tinha escapado por ali');
  check(/Passei antes da última grade/.test(await thought()), 'pensamento da fuga limpa');
  // os carcereiros do alarme caem: o alarme para e as grades sobem
  await page.evaluate(() => { for (const e of window.__scene.alarmFoes) if (e.alive) e.vanish(); });
  await until(() => window.__scene.alarmT < 0, null, 40000);
  await waitGame(1.8);
  al = await page.evaluate(() => window.__scene.fixtures.alarms.filter((a) => a.down).length);
  check(al === 0 && !(await solid(152, 20)), `o alarme para e as grades sobem (${al} abaixadas)`);
  // de volta na galeria o alarme não toca de novo
  await start('fuga', '2');
  check(await page.evaluate(() => window.__scene.alarmT < 0), 'voltando à galeria, o alarme não toca de novo');

  // ---------- 8. a porta das máscaras e o Tomé livre ----------
  await calm();
  await tp(22, 21);
  await waitGame(0.3);
  await tap('KeyW');
  await waitGame(0.6);
  check(/forma de uma máscara/.test(await thought()) && (await P()).room === 'fuga', `a porta das máscaras não abre deste lado ("${(await thought()).slice(0, 40)}")`);
  // a alavanca da galeria abre o alçapão de cima
  check(await solid(5, 0), 'o alçapão da galeria começa fechado');
  await tp(12, 21, -1);
  await waitGame(0.3);
  await tap('KeyJ');
  await waitGame(1.2);
  check(await seen('lever:fuga:0') && !(await solid(5, 0)), 'a alavanca da galeria abre o alçapão de cima');
  check(/alçapão destrancou/.test(await thought()), 'pensamento da alavanca da galeria');
  await shot('p11-alavanca-galeria');
  // nas celas, com as chaves, o Tomé sai
  await start('celas', '1');
  await calm();
  check(!(await solid(95, 41)), 'nas celas o alçapão já está aberto (atalho para a galeria)');
  await tp(29, 40, 1);
  await waitGame(0.3);
  await tap('KeyW');
  await until(() => document.querySelector('#screen-talk.show'), null, 10000);
  await page.waitForTimeout(900);
  check(/barulho dessas chaves/.test(await talkText()), `com as chaves, ele conta a versão dele ("${(await talkText()).slice(0, 40)}")`);
  await finishTalk();
  check(await seen('preso:livre'), 'Tomé está livre');
  await waitGame(2.0);
  const gone = await page.evaluate(() => ({ list: window.__scene.npcs.list.filter((n) => n.kind === 'prisoner').length }));
  check(gone.list === 0, 'ele sai da cela e vai na frente');
  await shot('p12-tome-livre');
  // na galeria ele espera ao lado da porta, que agora abre
  await start('fuga', '2');
  await calm();
  const there = await page.evaluate(() => window.__scene.npcs.list.some((n) => n.kind === 'prisoner'));
  check(there, 'Tomé espera na galeria');
  await tp(27, 21, -1);
  await waitGame(0.3);
  await tap('KeyW');
  await until(() => document.querySelector('#screen-talk.show'), null, 10000);
  await page.waitForTimeout(900);
  check(/Abri a porta/.test(await talkText()), 'ele diz que abriu a porta');
  await finishTalk();
  await tp(22, 21);
  await waitGame(0.3);
  await tap('KeyW');
  await until(() => window.__scene.room.id === 'mascara' && !window.__scene.transitioning, null, 20000);
  check(true, 'a porta das máscaras leva à Sala da Máscara');

  // ---------- 9. a arena dos condenados ----------
  await start('celas', '1');
  await calm();
  await tp(52, 40);
  await waitGame(0.3);
  await tap('KeyW');
  await until(() => window.__scene.room.id === 'arena' && !window.__scene.transitioning, null, 20000);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
  check(await page.evaluate(() => window.__scene.arena && !window.__scene.arena.started), 'a arena espera o cavaleiro entrar');
  await tp(14, 22, 1);
  await until(() => window.__scene.arena.started, null, 10000);
  await waitGame(0.6);
  check(await solid(8, 21), 'a grade da arena fecha atrás dele');
  const waves = [];
  for (let w = 0; w < 4; w++) {
    await until((w) => { const a = window.__scene.arena; return a.wave === w && a.pending === 0 && a.foes.some((e) => e.alive); }, w, 30000);
    const kinds = await page.evaluate(() => window.__scene.arena.foes.filter((e) => e.alive).map((e) => e.kind).sort().join(','));
    waves.push(kinds);
    if (w === 2) await shot('p13-arena-leva');
    await page.evaluate(() => { for (const e of window.__scene.arena.foes) if (e.alive) e.vanish(); });
  }
  check(waves.join(' | ') === 'crawler,crawler,crawler | guard,jailer | archer,crow,crow,jailer | censer,jailer,jailer', `quatro levas (${waves.join(' | ')})`);
  await until(() => window.__progress.seen.has('arena:done'), null, 30000);
  await waitGame(2.6);
  check(!(await solid(8, 21)), 'vencidas as levas, a grade sobe');
  const elo = await page.evaluate(() => { const e = window.__scene.elo; return e && { x: e.x / 16, y: e.y / 16 }; });
  check(elo && Math.abs(elo.x - 30) < 0.1, `o Elo do Condenado aparece no meio da arena (${JSON.stringify(elo)})`);
  await shot('p14-elo');
  const slots0 = await page.evaluate(() => window.__progress.slots);
  await tp(30, 22);
  await until(() => window.__progress.seen.has('item:elo'), null, 10000);
  const slots1 = await page.evaluate(() => window.__progress.slots);
  check(slots1 === slots0 + 1, `o Elo dá mais um espaço no inventário (${slots0} -> ${slots1})`);
  await start('arena', 'O0');
  check(await page.evaluate(() => !window.__scene.arena && !window.__scene.elo), 'arena vencida fica vazia');

  // ---------- 10. a parede falsa das celas ----------
  await start('celas', '1');
  await calm();
  const walls0 = await page.evaluate(() => window.__scene.fixtures.walls.length);
  await tp(9, 27, -1);
  await waitGame(0.3);
  for (let i = 0; i < 6; i++) {
    await tap('KeyJ');
    await waitGame(0.45);
  }
  const walls1 = await page.evaluate(() => window.__scene.fixtures.walls.length);
  check(walls1 < walls0, `a parede rachada perto do começo cede (${walls0} -> ${walls1})`);
  await waitGame(0.8);
  await shot('p15-parede-falsa');

  console.log(errs.length ? errs.join('\n') : 'sem erros no console');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
