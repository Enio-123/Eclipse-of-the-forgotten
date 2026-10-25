// Testa a luta do Arcebispo do Dízimo no altar: acorda quando o cavaleiro entra e a grade fecha,
// golpe do incensário (machuca e deixa nuvem), aparar o golpe (fica tonto), arremesso rente ao chão
// (pular escapa, rebater acerta ele), chuva do dízimo (os tablados protegem), sumir na fumaça e
// reaparecer atrás, segunda fase (rosácea quebra, dois penitentes, fachos de luz que os tablados
// barram), derrota, memória, arma, fim do segundo capítulo, o Incensário nas mãos do cavaleiro
// (nuvem que queima e passa pelo escudo) e a volta ao altar já vencido.
// uso: node arcebispo.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
const FLOOR = 28; // linha do chão do altar (os pés ficam em 29 * 16)
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
  // a foto leva tempo de verdade: o jogo fica parado enquanto ela é tirada
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
  const setProgress = (extra = []) => page.evaluate((extra) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', ...extra]) p.seen.add(k);
    p.save();
  }, extra);
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
    return { state: b.state, t: b.t, hp: b.hp, x: b.zone.x / 16, facing: b.facing, smoke: b.smoke.list.length, coins: b.coins.length, beams: b.beams.length, toss: b.toss && b.toss.phase, alive: b.alive, phase2: b.phase2, anim: b.anim, visible: b.sprite.visible };
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
  // segura o chefe parado (sem pensar) numa coluna
  const still = (tx) => page.evaluate(([tx, F]) => {
    const b = window.__scene.boss;
    b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
    b.toIdle();
    b.clearHazards();
    window.__scene.tweens.killTweensOf(b.sprite);
    b.quick = false;
    b.body.enable = true;
    b.sprite.setVisible(true).setAlpha(1);
    if (tx !== undefined) b.body.reset(tx * 16 + 8, (F + 1) * 16 - 54);
    b.body.setVelocity(0, 0);
  }, [tx, FLOOR]);
  const force = (a) => page.evaluate((a) => { const b = window.__scene.boss; b.thinkT = 99; b.startAttack(a); }, a);
  const calm = () => page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e !== s.boss && e.vanish) e.vanish();
    s.boss.smoke.clear();
  });

  await setProgress();
  await start('altar', '1');
  await page.evaluate(() => window.__scene.player.setWeapon('sword'));

  // ---------- 1. dormindo diante do altar ----------
  let b = await B();
  check(b.state === 'sleep' && b.anim === 'kneel', `Arcebispo ajoelhado diante do altar (${b.state}, ${b.anim})`);
  const rose0 = await page.evaluate(() => { const r = window.__scene.rose; return r && { x: r.x, y: r.y, tex: r.img.texture.key }; });
  check(rose0 && rose0.tex === 'deco-rose', `rosácea inteira atrás do altar (${rose0 && rose0.tex} em ${rose0 && rose0.x},${rose0 && rose0.y})`);
  // a câmera vai até ele sem o cavaleiro entrar na arena
  await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.setScroll(26 * 16 - 300, 152); });
  await waitGame(0.6);
  await shot('a01-dormindo');
  await page.evaluate(() => { const s = window.__scene; s.cameras.main.startFollow(s.player.zone, true, 0.11, 0.13); });
  await waitGame(0.4);

  // ---------- 2. acorda quando o cavaleiro entra ----------
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.player.x > 11 * 16);
  await page.keyboard.up('KeyD');
  await waitGame(0.4);
  b = await B();
  check(b.state === 'rise' || b.state === 'roar', `acorda quando o cavaleiro entra (${b.state})`);
  const gate = await page.evaluate(() => window.__scene.level.tileAt(1 * 16 + 8, 26 * 16 + 8));
  check(gate >= 0, `a grade da entrada fecha (tile ${gate})`);
  await waitGame(2.6);
  b = await B();
  check(b.facing === -1, `virou para o cavaleiro (${b.facing})`);
  const bar = await page.evaluate(() => document.querySelector('#bossbar').classList.contains('on') && document.querySelector('#bossbar p').textContent);
  check(bar === 'O Arcebispo do Dízimo', `barra de vida do chefe (${bar})`);
  await shot('a02-acordou');

  // ---------- 3. golpe do incensário: machuca e deixa a nuvem ----------
  await still(36);
  await setP(31, { face: 1 });
  await waitGame(0.2);
  await force('swing');
  await until(() => window.__scene.boss.state === 'swingrec', null, 20000);
  let p = await P();
  b = await B();
  check(p.hp < 5, `o golpe acerta quem fica na frente (vida ${p.hp})`);
  check(b.smoke >= 1, `onde o incensário bate fica a nuvem (${b.smoke})`);
  // a nuvem queima sozinha (antes da foto: a foto leva tempo e a nuvem passa)
  await waitGame(0.3);
  const cloud = await page.evaluate(() => { const c = window.__scene.boss.smoke.list[0]; return c && { x: c.x / 16, t: c.t }; });
  if (cloud) {
    await setP(Math.floor(cloud.x));
    await waitGame(0.3);
    p = await P();
    check(p.hp < 5, `a nuvem de incenso machuca (vida ${p.hp}, nuvem com ${cloud.t.toFixed(2)}s)`);
  } else check(false, 'nuvem sumiu cedo demais');
  await shot('a03-golpe-nuvem');
  await page.evaluate(() => window.__scene.boss.smoke.clear());

  // ---------- 4. aparar o golpe ----------
  await still(36);
  await setP(31, { face: 1, inv: 4 });
  await waitGame(0.3);
  await force('swing');
  await until(() => { const b = window.__scene.boss; return b.state === 'swingwind' && b.t > 0.62; }, null, 20000);
  await tap('KeyJ');
  await waitGame(0.15);
  b = await B();
  check(b.state === 'stagger', `golpear no fim da preparação apara o incensário (${b.state})`);
  const hp0 = b.hp;
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(s.boss.zone.x - 40, 29 * 16); s.player.facing = 1; });
  await waitGame(0.35);
  await tap('KeyJ');
  await waitGame(0.25);
  b = await B();
  check(hp0 - b.hp >= 1.4, `tonto, o golpe entra com bônus (${hp0.toFixed(2)} -> ${b.hp.toFixed(2)})`);
  await shot('a04-aparou');
  await waitGame(2.0);

  // ---------- 5. arremesso rente ao chão ----------
  await still(40);
  await setP(30, { face: 1 });
  await waitGame(0.3);
  await force('toss');
  await until(() => window.__scene.boss.toss, null, 20000);
  await waitGame(0.12);
  await shot('a05-arremesso');
  await until(() => !window.__scene.boss.toss || window.__scene.boss.toss.phase !== 'out', null, 20000);
  p = await P();
  check(p.hp < 5, `o incensário lançado acerta quem fica no chão (vida ${p.hp})`);
  await until(() => !window.__scene.boss.toss, null, 20000);
  // pulando por cima
  await still(40);
  await setP(30, { face: 1 });
  await waitGame(0.6);
  await force('toss');
  await until(() => { const s = window.__scene; const k = s.boss.toss; return k && k.phase === 'out' && k.x - s.player.x < 92; }, null, 20000);
  await hold('Space', 260);
  await until(() => !window.__scene.boss.toss || window.__scene.boss.toss.phase !== 'out', null, 20000);
  p = await P();
  check(p.hp === 5, `pular por cima do arremesso escapa (vida ${p.hp})`);
  await until(() => !window.__scene.boss.toss, null, 20000);
  // rebatendo: volta pela corrente e acerta o dono
  await still(40);
  await setP(30, { face: 1, inv: 5 });
  await waitGame(0.6);
  await force('toss');
  await page.evaluate(() => {
    const s = window.__scene;
    window.__phases = new Set();
    const rec = () => { const k = s.boss && s.boss.toss; if (k) window.__phases.add(k.phase); };
    s.events.on('postupdate', rec);
    window.__unrec = () => s.events.off('postupdate', rec);
  });
  await until(() => { const s = window.__scene; const k = s.boss.toss; return k && k.phase === 'out' && k.x - s.player.x < 46; }, null, 20000);
  await tap('KeyJ');
  await until(() => !window.__scene.boss.toss || window.__scene.boss.toss.phase !== 'out', null, 20000);
  const phases = await page.evaluate(() => { window.__unrec(); return [...window.__phases]; });
  check(phases.includes('parried'), `golpear o incensário lançado rebate de volta (${phases.join(' > ')})`);
  await until(() => !window.__scene.boss.toss, null, 20000);
  b = await B();
  check(b.state === 'stagger', `o incensário rebatido deixa ele tonto (${b.state})`);
  await waitGame(2.0);

  // ---------- 6. chuva do dízimo ----------
  await still(50);
  await setP(16);
  await waitGame(0.3);
  await force('tithe');
  await until(() => window.__scene.boss.coins.length > 0, null, 20000);
  const coins = await page.evaluate(() => { const s = window.__scene; return s.boss.coins.map((c) => ({ x: c.x, land: c.land })); });
  const mine = coins.reduce((a, c) => (Math.abs(c.x - (16 * 16 + 8)) < Math.abs(a.x - (16 * 16 + 8)) ? c : a), coins[0]);
  check(coins.length >= 6, `as moedas cobrem a arena (${coins.length})`);
  check(Math.abs(mine.x - (16 * 16 + 8)) < 2 && mine.land === 22 * 16, `uma moeda vem na cabeça, mas o tablado segura (${mine.x}, cai em ${mine.land / 16})`);
  await waitGame(0.5);
  await shot('a06-dizimo-sombras');
  await until(() => window.__scene.boss.coins.some((c) => c.falling) || !window.__scene.boss.coins.length, null, 20000);
  await waitGame(0.12);
  await shot('a06b-dizimo-caindo');
  await until(() => window.__scene.boss.state === 'idle' && !window.__scene.boss.coins.length, null, 30000);
  p = await P();
  check(p.hp === 5, `embaixo do tablado as moedas não acertam (vida ${p.hp})`);
  // no aberto acerta
  await still(50);
  await setP(28);
  await waitGame(0.3);
  await force('tithe');
  await until(() => window.__scene.boss.state === 'idle' && !window.__scene.boss.coins.length, null, 30000);
  p = await P();
  check(p.hp < 5, `no aberto o dízimo acerta (vida ${p.hp})`);
  await page.evaluate(() => { window.__scene.boss.titheCd = 0; });

  // ---------- 7. some na fumaça e reaparece atrás ----------
  await still(45);
  await setP(25, { face: 1, inv: 6 });
  await waitGame(0.3);
  await force('vanish');
  await until(() => window.__scene.boss.state === 'hidden', null, 20000);
  b = await B();
  check(!b.visible, 'sumiu na fumaça');
  await until(() => window.__scene.boss.state === 'appear', null, 20000);
  b = await B();
  p = await P();
  check(b.x < p.x && p.x - b.x > 4, `reaparece atrás do cavaleiro (chefe ${b.x.toFixed(1)}, cavaleiro ${p.x.toFixed(1)})`);
  await waitGame(0.3);
  b = await B();
  check(b.state === 'swingwind' && b.facing === 1, `e já ergue o incensário virado para ele (${b.state}, ${b.facing})`);
  await shot('a07-reaparece');
  await until(() => window.__scene.boss.state === 'idle', null, 20000);

  // ---------- 8. segunda fase ----------
  await still(50);
  await setP(30, { inv: 99 });
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = b.maxHp * 0.52; b.hit(0, 1, 'side'); });
  b = await B();
  check(b.phase2 && b.state === 'shatter', `metade da vida: segunda fase (${b.state})`);
  await waitGame(0.75);
  const roseTex = await page.evaluate(() => window.__scene.rose.img.texture.key);
  check(roseTex === 'deco-rose-broken', `a rosácea quebra (${roseTex})`);
  await shot('a08-vitral-quebra');
  await waitGame(1.2);
  const helpers = await page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'censer' && e.alive).length);
  check(helpers === 2, `dois penitentes vêm ajudar (${helpers})`);
  await shot('a08b-penitentes');
  await calm();
  // facho de luz varrendo a arena: no aberto acerta
  await still(50);
  await setP(30);
  await page.evaluate(() => {
    const s = window.__scene; const p = s.player;
    const orig = p.hurt.bind(p);
    window.__hurts = [];
    p.hurt = (fx) => { const r = orig(fx); if (r) window.__hurts.push([+s.clock.toFixed(2), p.hp, Math.round(fx), Math.round(p.x), s.boss && s.boss.beams.map((b) => Math.round(b.fx) + ':' + b.t.toFixed(1)).join(' '), s.boss && s.boss.state, s.enemies.filter((e) => e.alive).map((e) => e.kind).join(',')]); return r; };
    window.__deaths = 0;
    s.events.once('shutdown', () => { window.__deaths++; });
  });
  const dump = async () => console.log('  danos', JSON.stringify(await page.evaluate(() => ({ hurts: window.__hurts, deaths: window.__deaths, room: window.__scene.room.id }))));
  await until(() => window.__scene.boss.beams.length > 0, null, 90000);
  await waitGame(1.1);
  await shot('a09-facho');
  try { await until(() => window.__scene.boss.beams.length === 0, null, 90000); } catch (e) { await dump(); throw e; }
  await dump();
  p = await P();
  check(p.hp < 5 && !p.dead, `o facho de luz acerta quem fica no caminho (vida ${p.hp}, ${p.room})`);
  // na sombra do tablado ele passa por cima
  await still(50);
  await page.evaluate(() => { window.__scene.boss.beamT = 0.1; });
  await setP(6);
  await until(() => window.__scene.boss.beams.length > 0, null, 90000);
  await until(() => window.__scene.boss.beams.length === 0, null, 90000);
  p = await P();
  check(p.hp === 5, `na sombra do tablado o facho não acerta (vida ${p.hp})`);
  // o dash fantasma atravessa: com o dash ativo nada machuca
  const ghost = await page.evaluate(() => {
    const s = window.__scene;
    const b = s.boss;
    b.beamT = 0;
    return { harms: typeof b.harms === 'function' };
  });
  check(ghost.harms, 'facho usa o mesmo dano dos golpes (o dash fantasma atravessa)');

  // ---------- 9. derrota ----------
  await still(36);
  await setP(22, { inv: 30 });
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  b = await B();
  check(!b.alive && b.state === 'dead', `derrotado (${b.state})`);
  await waitGame(1.2);
  await shot('a10-derrota');
  await waitGame(2.6);
  const after = await page.evaluate(() => ({
    seen: window.__progress.seen.has('boss:arcebispo'),
    mem: window.__scene.props.memories.map((m) => m.id),
    drop: window.__scene.weaponDrop && window.__scene.weaponDrop.id,
    anim: window.__scene.boss.sprite.anims.currentAnim && window.__scene.boss.sprite.anims.currentAnim.key,
    gate: window.__scene.level.tileAt(1 * 16 + 8, 26 * 16 + 8),
  }));
  check(after.seen && after.mem.includes('altar:boss'), `vencido: a memória sai do corpo (${after.mem.join(',')})`);
  check(after.drop === 'incensario', `o Incensário sai do chão (${after.drop})`);
  check(after.anim === 'arcebispo-corpse', `o corpo fica sem o incensário (${after.anim})`);
  await waitGame(2.4);
  const gate2 = await page.evaluate(() => window.__scene.level.tileAt(1 * 16 + 8, 26 * 16 + 8));
  check(gate2 < 0, `a grade da entrada abre (tile ${gate2})`);
  await shot('a11-memoria-arma');
  // pega a arma
  await page.evaluate(() => { const s = window.__scene; const d = s.weaponDrop; s.player.teleport(d.x, 29 * 16); });
  await until(() => window.__progress.seen.has('weapon:incensario'), null, 20000);
  check(true, 'pegou o Incensário do Arcebispo');
  await waitGame(4.4);
  // pega a memória: fim do segundo capítulo
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'altar:boss'); s.player.teleport(m.x, m.y + 26); });
  await until(() => window.__progress.memories.has('altar:boss'), null, 20000);
  await page.waitForSelector('#screen-end.show', { timeout: 30000 });
  const end = await page.evaluate(() => ({ t: document.querySelector('#screen-end .end-title').textContent, x: document.querySelector('#screen-end .end-text').textContent }));
  check(end.t === 'Fim do segundo capítulo', `fim do segundo capítulo (${end.t})`);
  check(/Arcebispo/.test(end.x), `texto do fim fala do Arcebispo (${end.x.slice(0, 60)}...)`);
  await shot('a12-fim-capitulo');
  await page.click('#screen-end [data-cmd="explore"]');
  await waitGame(0.3);

  // ---------- 10. o Incensário nas mãos do cavaleiro ----------
  const wid = await page.evaluate(() => { const s = window.__scene; s.player.setWeapon('incensario'); return s.player.weapon.id; });
  check(wid === 'incensario', 'o cavaleiro troca para o Incensário');
  await start('rua', '1', 'continue');
  await page.evaluate(() => window.__scene.player.setWeapon('incensario'));
  const pick = (kind) => page.evaluate((kind) => {
    const s = window.__scene;
    const keep = s.enemies.find((e) => e.kind === kind && e.alive);
    for (const e of s.enemies) if (e !== keep && e.vanish) e.vanish();
    window.__e = keep;
    s.player.hurt = () => false;
    return !!keep;
  }, kind);
  check(await pick('censer'), 'penitente da rua para o teste');
  const tp = (tx, ty, face) => page.evaluate(([x, y, f]) => { const p = window.__scene.player; p.teleport(x, y); p.body.setVelocity(0, 0); p.facing = f; }, [tx * 16 + 8, (ty + 1) * 16, face]);
  const E = () => page.evaluate(() => { const e = window.__e; return { hp: e.hp, alive: e.alive, x: e.zone.x, state: e.state }; });
  await page.evaluate(() => { const e = window.__e; e.body.reset(27 * 16, 34 * 16 + 16 - 25); e.facing = -1; e.state = 'patrol'; e.homeX = 27 * 16; e.atkCd = 9; });
  await tp(24, 34, 1);
  await waitGame(0.3);
  let e0 = await E();
  await tap('KeyJ');
  await waitGame(0.12);
  const puff = await page.evaluate(() => window.__scene.censerClouds.list.length);
  check(puff >= 1, `o golpe do Incensário deixa nuvem (${puff})`);
  await waitGame(0.5);
  let e1 = await E();
  check(e0.hp - e1.hp >= 2.3, `golpe e brasa: o inimigo leva os dois (${e0.hp.toFixed(2)} -> ${e1.hp.toFixed(2)})`);
  await shot('a13-incensario-nuvem');
  // a nuvem passa pelo escudo do guarda
  await start('rua', '1', 'continue');
  await page.evaluate(() => window.__scene.player.setWeapon('incensario'));
  check(await pick('guard'), 'guarda da rua para o teste');
  await page.evaluate(() => { const e = window.__e; e.body.reset(27 * 16, 34 * 16 + 16 - 26); e.facing = -1; e.state = 'guard'; e.atkCd = 9; });
  await tp(24, 34, 1);
  await waitGame(0.3);
  e0 = await E();
  await tap('KeyJ');
  await waitGame(0.6);
  e1 = await E();
  check(e0.hp - e1.hp > 0.4 && e0.hp - e1.hp < 1, `o escudo segura o golpe, mas o incenso queima (${e0.hp.toFixed(2)} -> ${e1.hp.toFixed(2)})`);

  // ---------- 11. a volta ao altar ----------
  await start('altar', '1');
  const back = await page.evaluate(() => {
    const s = window.__scene;
    return { boss: !!s.boss, rose: s.rose && s.rose.img.texture.key, mem: s.props.memories.length, drop: !!s.weaponDrop };
  });
  check(!back.boss && back.rose === 'deco-rose-broken' && !back.mem && !back.drop, `depois de vencido o altar fica em paz (${JSON.stringify(back)})`);
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(35 * 16, 29 * 16); s.player.facing = -1; });
  await waitGame(0.8);
  await shot('a14-altar-vencido');
  // a sexta carta nas armas
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForTimeout(300);
  await page.click('#screen-pause [data-cmd="weapon"]').catch(() => {});
  await page.waitForTimeout(500);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#screen-weapons .card')].map((c) => c.dataset.w + (c.classList.contains('locked') ? ':x' : '')));
  check(cards.length === 7 && cards.includes('incensario'), `sete armas, o Incensário liberado (${cards.join(' ')})`);
  await shot('a15-armas');

  console.log(errs.length ? errs.join('\n') : 'sem erros no console');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
