// Testa a luta da Carcereira na Sala da Máscara: martelando na bigorna de costas para a porta, acorda
// quando o cavaleiro passa e a grade fecha, corrente alta (machuca de pé, agachado passa, aparar
// deixa tonta), varrida no chão (pular escapa), gancho em linha reta (acerta quem fica na linha,
// rebatido volta e deixa ela tonta), gaiolas do teto (sombra antes, acertam quem fica embaixo),
// segunda fase (arranca a corrente e chama dois carcereiros), derrota, memória, a Corrente nas mãos
// do cavaleiro (alcance longo e o gancho que puxa os leves) e a volta à sala já vencida.
// uso: node carcereira.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
const FLOOR = 27; // linha do chão da sala (os pés ficam em 28 * 16)
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
  const setProgress = (extra = []) => page.evaluate((extra) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['wall', 'double', 'hook']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves', 'preso:met', 'preso:livre', ...extra]) p.seen.add(k);
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
    return { state: b.state, t: b.t, hp: b.hp, x: b.zone.x / 16, facing: b.facing, cages: b.cages.length, hook: b.hook && b.hook.phase, alive: b.alive, phase2: b.phase2, anim: b.anim };
  });
  const P = () => page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, hp: p.hp, bottom: p.body.bottom, dead: p.dead, room: window.__scene.room.id, crouched: p.crouched }; });
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
  // segura a chefe parada (sem pensar) numa coluna
  const still = (tx) => page.evaluate(([tx, F]) => {
    const b = window.__scene.boss;
    b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
    b.toIdle();
    b.clearHazards();
    b.combo = false;
    b.body.enable = true;
    if (tx !== undefined) b.body.reset(tx * 16 + 8, (F + 1) * 16 - 50);
    b.body.setVelocity(0, 0);
  }, [tx, FLOOR]);
  const force = (a) => page.evaluate((a) => { const b = window.__scene.boss; b.thinkT = 99; b.yankCd = 0; b.startAttack(a); }, a);

  await setProgress();
  await start('mascara', 'O0');
  await page.evaluate(() => window.__scene.player.setWeapon('sword'));

  // ---------- 1. martelando na bigorna ----------
  let b = await B();
  check(b.state === 'sleep' && b.anim === 'work' && b.facing === 1, `a Carcereira martela de costas para a porta (${b.state}, ${b.anim}, ${b.facing})`);
  const anvil = await page.evaluate(() => window.__scene.children.list.some((o) => o.texture && o.texture.key === 'deco-anvil'));
  check(anvil, 'a bigorna na frente dela');
  await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.setScroll(44 * 16 - 320, 448 - 260); });
  await waitGame(0.8);
  await shot('c01-bigorna');
  await page.evaluate(() => { const s = window.__scene; s.cameras.main.startFollow(s.player.zone, true, 0.11, 0.13); });
  await waitGame(0.4);

  // ---------- 2. acorda quando o cavaleiro entra ----------
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.player.x > 13 * 16);
  await page.keyboard.up('KeyD');
  await waitGame(0.4);
  b = await B();
  check(b.state === 'rise' || b.state === 'roar', `acorda quando o cavaleiro entra (${b.state})`);
  const gate = await page.evaluate(() => window.__scene.level.tileAt(7 * 16 + 8, 26 * 16 + 8));
  check(gate >= 2, `a grade da entrada fecha (tile ${gate})`);
  await waitGame(2.4);
  b = await B();
  check(b.facing === -1, `virou para o cavaleiro (${b.facing})`);
  const bar = await page.evaluate(() => document.querySelector('#bossbar').classList.contains('on') && document.querySelector('#bossbar p').textContent);
  check(bar === 'A Carcereira', `barra de vida da chefe (${bar})`);
  const music = await page.evaluate(() => window.__scene.room.boss);
  check(music === 'carcereira', 'sala da chefe');
  await shot('c02-acordou');

  // ---------- 3. corrente alta ----------
  await still(40);
  await setP(31, { face: 1 });
  await waitGame(0.3);
  await force('lash');
  await until(() => window.__scene.boss.state === 'lash', null, 20000);
  await waitGame(0.08);
  await shot('c03-corrente-alta');
  await until(() => window.__scene.boss.state !== 'lash', null, 20000);
  let p = await P();
  check(p.hp < 5, `a corrente alta acerta quem fica de pé (vida ${p.hp})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);
  // agachado passa por baixo
  await still(40);
  await setP(31, { face: 1 });
  await page.keyboard.down('KeyS');
  await waitGame(0.3);
  await force('lash');
  await until(() => window.__scene.boss.state === 'lashrec', null, 20000);
  p = await P();
  await page.keyboard.up('KeyS');
  check(p.crouched && p.hp === 5, `agachado, a corrente alta passa por cima (vida ${p.hp})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);

  // ---------- 4. aparar a corrente alta ----------
  await still(40);
  await setP(33, { face: 1, inv: 4 });
  await waitGame(0.3);
  await force('lash');
  await until(() => { const b = window.__scene.boss; return b.state === 'lashwind' && b.t > 0.55; }, null, 20000);
  await tap('KeyJ');
  await waitGame(0.15);
  b = await B();
  check(b.state === 'stagger', `golpear no fim da preparação apara a corrente (${b.state})`);
  const hp0 = b.hp;
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(s.boss.zone.x - 36, 28 * 16); s.player.facing = 1; });
  await waitGame(0.35);
  await tap('KeyJ');
  await waitGame(0.25);
  b = await B();
  check(hp0 - b.hp >= 1.4, `tonta, o golpe entra com bônus (${hp0.toFixed(2)} -> ${b.hp.toFixed(2)})`);
  await shot('c04-aparou');
  await until(() => window.__scene.boss.state === 'idle', null, 20000);

  // ---------- 5. varrida no chão ----------
  await still(40);
  await setP(31, { face: 1 });
  await waitGame(0.3);
  await force('sweep');
  await until(() => window.__scene.boss.state === 'sweeprec', null, 20000);
  p = await P();
  check(p.hp < 5, `a varrida acerta quem fica no chão (vida ${p.hp})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);
  await still(40);
  await setP(31, { face: 1 });
  await waitGame(0.3);
  await force('sweep');
  await until(() => { const b = window.__scene.boss; return b.state === 'sweepwind' && b.t > 0.45; }, null, 20000);
  await hold('Space', 260);
  await until(() => window.__scene.boss.state === 'sweeprec', null, 20000);
  p = await P();
  check(p.hp === 5, `pulando, a varrida passa embaixo (vida ${p.hp})`);
  await shot('c05-varrida');
  await until(() => window.__scene.boss.state === 'idle', null, 20000);

  // ---------- 6. gancho em linha reta ----------
  await still(44);
  await setP(28, { face: 1 });
  await waitGame(0.3);
  await force('hook');
  await until(() => window.__scene.boss.hook, null, 20000);
  await waitGame(0.1);
  await shot('c06-gancho');
  await until(() => !window.__scene.boss.hook || window.__scene.boss.hook.phase !== 'out', null, 20000);
  p = await P();
  check(p.hp < 5, `o gancho acerta quem fica na linha (vida ${p.hp})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);
  // rebatendo a ponta: volta e deixa ela tonta
  await still(44);
  await setP(28, { face: 1, inv: 5 });
  await waitGame(0.3);
  await page.evaluate(() => {
    const s = window.__scene;
    window.__phases = new Set();
    const rec = () => { const k = s.boss && s.boss.hook; if (k) window.__phases.add(k.phase); };
    s.events.on('postupdate', rec);
    window.__unrec = () => s.events.off('postupdate', rec);
  });
  await force('hook');
  await until(() => { const s = window.__scene; const k = s.boss.hook; return k && k.phase === 'out' && k.x - s.player.x < 50; }, null, 20000);
  await tap('KeyJ');
  await until(() => !window.__scene.boss.hook, null, 20000);
  const phases = await page.evaluate(() => { window.__unrec(); return [...window.__phases]; });
  check(phases.includes('parried'), `golpear a ponta do gancho rebate de volta (${phases.join(' > ')})`);
  b = await B();
  check(b.state === 'stagger', `o gancho rebatido deixa ela tonta (${b.state})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);

  // ---------- 7. gaiolas do teto ----------
  // registra a queda a cada quadro (a foto leva tempo e a queda dura menos de um segundo)
  await page.evaluate(() => {
    const s = window.__scene;
    window.__cg = { fell: 0, hurt: [] };
    const p = s.player;
    const orig = p.hurt.bind(p);
    p.hurt = (fx) => { const r = orig(fx); if (r) window.__cg.hurt.push(+s.clock.toFixed(2)); return r; };
    s.events.on('postupdate', () => { if (s.boss && s.boss.cages.some((c) => c.falling)) window.__cg.fell++; });
  });
  await still(50);
  await setP(30);
  await waitGame(0.3);
  await force('yank');
  await until(() => window.__scene.boss.cages.length > 0, null, 20000);
  const cages = await page.evaluate(() => window.__scene.boss.cages.map((c) => ({ x: c.x / 16, land: c.land / 16, falling: c.falling })));
  check(cages.length === 3 && cages.every((c) => !c.falling), `três gaiolas avisam com a sombra antes de cair (${cages.length})`);
  check(cages.some((c) => Math.abs(c.x - 30.5) < 0.2) && cages.every((c) => c.land === 28), `uma cai bem em cima do cavaleiro, todas no chão (${cages.map((c) => c.x.toFixed(1)).join(', ')})`);
  await waitGame(0.6);
  await shot('c07-sombras');
  await until(() => window.__cg.fell > 0, null, 20000);
  await waitGame(0.25);
  await shot('c07b-gaiolas');
  await until(() => window.__scene.boss.cages.length === 0, null, 20000);
  p = await P();
  const cg = await page.evaluate(() => window.__cg);
  check(p.hp < 5, `quem fica embaixo leva a gaiola (vida ${p.hp}, ${cg.fell} quadros caindo, golpes ${cg.hurt.join(',')})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);
  // saindo da sombra escapa
  await still(50);
  await setP(30);
  await waitGame(0.3);
  await force('yank');
  await until(() => window.__scene.boss.cages.length > 0, null, 20000);
  const safeX = await page.evaluate(() => {
    const cs = window.__scene.boss.cages.map((c) => c.x);
    for (let x = 14 * 16; x < 44 * 16; x += 8) if (cs.every((c) => Math.abs(c - x) > 40)) return x / 16;
    return -1;
  });
  await setP(Math.floor(safeX));
  await until(() => window.__scene.boss.cages.length === 0, null, 20000);
  p = await P();
  check(safeX > 0 && p.hp === 5, `fora da sombra as gaiolas não acertam (vida ${p.hp}, em ${safeX})`);
  await until(() => window.__scene.boss.state === 'idle', null, 20000);

  // ---------- 8. segunda fase ----------
  await still(50);
  await setP(30, { inv: 99 });
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = b.maxHp * 0.5 + 0.5; b.hit(0, 1, 'side'); });
  b = await B();
  check(b.phase2 && b.state === 'rage', `metade da vida: segunda fase (${b.state})`);
  await waitGame(1.6);
  const helpers = await page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'jailer' && e.alive).length);
  check(helpers === 2, `dois carcereiros vêm ajudar (${helpers})`);
  await shot('c08-segunda-fase');
  await until(() => window.__scene.boss.state === 'idle', null, 20000);
  // na segunda fase são quatro gaiolas
  await page.evaluate(() => { for (const e of window.__scene.enemies) if (e.kind === 'jailer' && e.vanish) e.vanish(); });
  await still(50);
  await setP(30, { inv: 99 });
  await force('yank');
  await until(() => window.__scene.boss.cages.length > 0, null, 20000);
  const n2 = await page.evaluate(() => window.__scene.boss.cages.length);
  check(n2 === 4, `na segunda fase caem quatro gaiolas (${n2})`);
  await until(() => window.__scene.boss.cages.length === 0, null, 20000);

  // ---------- 9. derrota ----------
  // guarda tudo o que o cavaleiro pensa daqui em diante
  await page.evaluate(() => {
    const ui = window.__ui;
    window.__thoughts = [];
    const orig = ui.thought.bind(ui);
    ui.thought = (text, ...rest) => { window.__thoughts.push(text); return orig(text, ...rest); };
  });
  await still(44);
  await setP(30, { inv: 30 });
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  b = await B();
  check(!b.alive && b.state === 'dead', `derrotada (${b.state})`);
  await waitGame(1.2);
  await shot('c09-derrota');
  await waitGame(2.6);
  const after = await page.evaluate(() => ({
    seen: window.__progress.seen.has('boss:carcereira'),
    mem: window.__scene.props.memories.map((m) => m.id),
    drop: window.__scene.weaponDrop && window.__scene.weaponDrop.id,
    anim: window.__scene.boss.sprite.anims.currentAnim && window.__scene.boss.sprite.anims.currentAnim.key,
    thought: window.__thoughts.join(' | '),
  }));
  check(after.seen && after.mem.includes('mascara:boss'), `vencida: a memória sai do corpo (${after.mem.join(',')})`);
  check(after.drop === 'corrente', `a Corrente cai no chão (${after.drop})`);
  check(after.anim === 'carcereira-death', `o corpo fica ajoelhado (${after.anim})`);
  check(/As correntes caíram/.test(after.thought), `pensamento depois da luta ("${after.thought.slice(0, 40)}")`);
  await waitGame(2.4);
  const gate2 = await page.evaluate(() => window.__scene.level.tileAt(7 * 16 + 8, 26 * 16 + 8));
  check(gate2 < 2, `a grade da entrada abre (tile ${gate2})`);
  await shot('c10-memoria-arma');
  // pega a arma
  await page.evaluate(() => { const s = window.__scene; const d = s.weaponDrop; s.player.teleport(d.x, 28 * 16); });
  await until(() => window.__progress.seen.has('weapon:corrente'), null, 20000);
  check(true, 'pegou a Corrente da Carcereira');
  await waitGame(4.4);
  // pega a memória
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'mascara:boss'); s.player.teleport(m.x, m.y + 26); });
  await until(() => window.__progress.memories.has('mascara:boss'), null, 20000);
  await waitGame(0.6);
  const banner = await page.evaluate(() => document.querySelector('#banner') && document.querySelector('#banner').textContent);
  check(/máscara de ferro/i.test(banner || ''), `a memória da máscara de ferro (${(banner || '').slice(0, 50)})`);
  await shot('c11-memoria');
  await waitGame(1.0);
  const after2 = await page.evaluate(() => window.__thoughts.join(' | '));
  check(/bigorna, a pedra rachou/.test(after2), `o eco lá de baixo (${after2.slice(-60)})`);

  // ---------- 10. a Corrente nas mãos do cavaleiro ----------
  const wid = await page.evaluate(() => { const s = window.__scene; s.player.setWeapon('corrente'); return s.player.weapon.id; });
  check(wid === 'corrente', 'o cavaleiro troca para a Corrente');
  await start('celas', '1', 'continue');
  await page.evaluate(() => window.__scene.player.setWeapon('corrente'));
  const pick = (kind) => page.evaluate((kind) => {
    const s = window.__scene;
    const keep = s.enemies.find((e) => e.kind === kind && e.alive);
    for (const e of s.enemies) if (e !== keep && e.vanish) e.vanish();
    window.__e = keep;
    s.player.hurt = () => false;
    return !!keep;
  }, kind);
  check(await pick('crawler'), 'rastejante das celas para o teste');
  const tp = (tx, ty, face) => page.evaluate(([x, y, f]) => { const p = window.__scene.player; p.teleport(x, y); p.body.setVelocity(0, 0); p.facing = f; }, [tx * 16 + 8, (ty + 1) * 16, face]);
  const E = () => page.evaluate(() => { const e = window.__e; return { hp: e.hp, alive: e.alive, x: e.zone.x / 16 }; });
  await page.evaluate(() => { const e = window.__e; e.hp = 99; e.body.reset(30 * 16, 41 * 16 - 8); e.body.setVelocity(0, 0); });
  await tp(24, 40, 1);
  await waitGame(0.4);
  let e0 = await E();
  await tap('KeyJ');
  await waitGame(0.06);
  const lash = await page.evaluate(() => window.__scene.player.lashT >= 0);
  check(lash, 'a corrente estica da mão até a ponta do golpe');
  await waitGame(0.04);
  await shot('c12-corrente');
  await waitGame(0.5);
  let e1 = await E();
  check(e0.hp - e1.hp > 1.2, `de longe a Corrente acerta (${e0.hp.toFixed(2)} -> ${e1.hp.toFixed(2)}, a ${((e0.x - 24.5) * 16).toFixed(0)}px)`);
  check(e1.x < e0.x - 1, `o gancho puxa o leve para perto (de ${e0.x.toFixed(1)} para ${e1.x.toFixed(1)})`);
  // o carcereiro é pesado: não vem
  await start('celas', '1', 'continue');
  await page.evaluate(() => window.__scene.player.setWeapon('corrente'));
  check(await pick('jailer'), 'carcereiro das celas para o teste');
  await page.evaluate(() => { const e = window.__e; e.hp = 99; e.body.reset(86 * 16, 41 * 16 - 27); e.body.setVelocity(0, 0); e.state = 'stagger'; e.t = -9; });
  await tp(80, 40, 1);
  await waitGame(0.4);
  e0 = await E();
  await tap('KeyJ');
  await waitGame(0.6);
  e1 = await E();
  check(e0.hp - e1.hp > 1.2 && Math.abs(e1.x - e0.x) < 1, `o pesado leva o golpe mas não vem (${e0.x.toFixed(1)} -> ${e1.x.toFixed(1)})`);

  // ---------- 11. a volta à sala vencida ----------
  await start('mascara', 'O0');
  const back = await page.evaluate(() => {
    const s = window.__scene;
    return { boss: !!s.boss, mem: s.props.memories.length, drop: !!s.weaponDrop };
  });
  check(!back.boss && !back.mem && !back.drop, `depois de vencida a sala fica em silêncio (${JSON.stringify(back)})`);
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(46 * 16, 28 * 16); s.player.facing = 1; });
  await waitGame(0.8);
  await shot('c13-sala-vencida');
  // a sétima carta nas armas
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForTimeout(300);
  await page.click('#screen-pause [data-cmd="weapon"]').catch(() => {});
  await page.waitForTimeout(500);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#screen-weapons .card')].map((c) => c.dataset.w + (c.classList.contains('locked') ? ':x' : '')));
  check(cards.length === 7 && cards.includes('corrente'), `sete armas, a Corrente liberada (${cards.join(' ')})`);
  await shot('c14-armas');

  console.log(errs.length ? errs.join('\n') : 'sem erros no console');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
