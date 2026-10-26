// Testa os achados das Minas: fora das Minas o inventário não mostra os itens delas; na Boca da Mina
// aparecem os seis com a pista; o baú da Boca solta o Capacete, o das Prensas o Âmbar bruto e o do Veio
// o Relógio do turno (pulam do baú e entram equipados); um baú aberto num save de antes dos itens deixa
// o item do lado; a ficha de A. dá a Flor prensada, que com 1 de vida fecha uma rachadura (uma vez,
// e a vela devolve); o Âmbar bruto enche mais; o Relógio estica a Lembrança e o Eco; o bornal e o cinto
// ficam atrás de blocos de Âmbar (a foice só tilinta, a Picareta abre) e dão espaço no inventário; o
// Apito do Capataz fica do lado do corpo e, guardado ou equipado, faz o aparo parar o mundo; a Lasca do
// espelho fica ao pé do espelho rachado e deixa o Eco bater com a força inteira; o Capacete aguenta as
// pedras do Capataz e a viga baixa do vagonete; tudo fica gravado.
// uso: node itens.cjs <pasta-saida> [url]
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
  // a foto demora (o navegador sem placa de vídeo): a cena para antes, para o tempo do jogo não correr
  const shot = async (name) => {
    const paused = await page.evaluate(() => {
      const s = window.__scene;
      if (!s || !s.scene.isActive()) return false;
      s.scene.pause();
      return true;
    });
    if (paused) await page.waitForFunction(() => window.__scene.scene.isPaused(), null, { timeout: 5000, polling: 16 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (paused) {
      await page.evaluate(() => window.__scene.scene.resume());
      await page.waitForFunction(() => window.__scene.scene.isActive(), null, { timeout: 5000, polling: 16 }).catch(() => {});
    }
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
      console.log('  espera falhou: ' + fn.toString().slice(0, 120));
      throw e;
    }
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const tap = (key) => hold(key, 120);
  const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
  const finishTalk = async () => {
    const lines = [];
    for (let i = 0; i < 30 && (await top()) === 'talk'; i++) {
      lines.push(await page.evaluate(() => document.querySelector('#screen-talk .talk-text').textContent));
      await tap('KeyJ');
      await page.waitForTimeout(140);
    }
    return lines.join(' | ');
  };
  const setProgress = (extra = [], mems = []) => page.evaluate(([extra, mems]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', ...extra]) p.seen.add(k);
    for (const m of mems) p.memories.add(m);
    p.save();
  }, [extra, mems]);
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
  const setP = (tx, feetRow, opt = {}) => page.evaluate(([tx, fr, o]) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(tx * 16 + 8, fr * 16);
    p.body.setVelocity(0, 0);
    p.hp = o.hp ?? 5;
    p.invuln = o.inv ?? 0;
    if (o.face) p.facing = o.face;
    s.registry.set('hp', p.hp);
  }, [tx, feetRow, opt]);
  const hookUi = () => page.evaluate(() => {
    const ui = window.__ui;
    window.__thoughts = [];
    window.__banners = [];
    if (ui.__hooked) return;
    ui.__hooked = true;
    const orig = ui.thought.bind(ui);
    ui.thought = (t, h, html) => { window.__thoughts.push(String(t).replace(/<[^>]+>/g, '')); return orig(t, h, html); };
    const ob = ui.banner.bind(ui);
    ui.banner = (a, b, h) => { window.__banners.push(a + ' | ' + b); return ob(a, b, h); };
  });
  const S = () => page.evaluate(() => {
    const s = window.__scene;
    const pr = window.__progress;
    const hud = window.__game.scene.getScene('hud');
    const beads = hud ? hud.children.list.filter((o) => o.list).flatMap((c) => c.list).filter((o) => o.texture && o.texture.key === 'amber-bead-empty') : [];
    return {
      powers: [...pr.powers], power: pr.power, amber: +pr.amber.toFixed(2), reg: s.registry.get('amber'),
      cls: document.body.classList.contains('has-memory'), beads: beads.length === 3 && beads.every((b) => b.visible),
      stop: +s.stopT.toFixed(2), echo: !!s.memEcho, mend: +s.mendT.toFixed(2), hp: s.player.hp, pose: s.player.pose,
    };
  });
  const miners = () => page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'miner' && e.alive).map((e) => ({ x: e.zone.x / 16, y: e.body.bottom / 16, hp: e.hp })));
  // segura um mineiro no lugar, sem pensar (para os golpes do teste caírem sempre)
  const pin = (i) => page.evaluate((i) => {
    const e = window.__scene.enemies.filter((e) => e.kind === 'miner' && e.alive)[i];
    window.__pin = e;
    e.update = () => {};
    e.body.setVelocity(0, 0);
    return { x: e.zone.x / 16, y: e.body.bottom / 16, hp: e.hp };
  }, i);


  // tira os bichos do caminho (os que somem em fumaça somem; os outros param e não machucam)
  const calmAll = () => page.evaluate(() => {
    for (const e of window.__scene.enemies) {
      if (e.kind === 'boss' || !e.alive) continue;
      if (e.vanish && e.vanish() !== null) continue;
      e.update = () => {};
      e.harms = () => false;
      e.body.setVelocity(0, 0);
      e.body.moves = false;
      e.zone.y = -400;
    }
  });
  const inv = () => page.evaluate(() => {
    const s = window.__scene;
    s.openPause();
    document.querySelector('#screen-pause [data-cmd="inventory"]').click();
    const items = [...document.querySelectorAll('.inv-items .inv-item')].map((b) => ({ id: b.dataset.id, missing: b.classList.contains('missing'), on: b.classList.contains('on'), what: b.querySelector('.what').textContent }));
    const extra = document.querySelector('.inv-extra-wrap');
    const out = { items, slots: document.querySelector('.inv-slots .count').textContent, extraHidden: extra.hidden, extra: [...extra.querySelectorAll('li')].map((l) => l.textContent) };
    return out;
  });
  const closeInv = async () => {
    await page.evaluate(() => window.__scene.resumeGame());
    await page.waitForTimeout(250);
  };
  const placed = () => page.evaluate(() => window.__scene.finds.placed);
  const caches = () => page.evaluate(() => window.__scene.fixtures.caches.map((c) => ({ i: c.i, x: c.x / 16, y: c.y / 16, open: c.open })));
  const owned = () => page.evaluate(() => ({ up: [...window.__progress.upgrades], eq: [...window.__progress.equipped], slots: window.__progress.slots, used: window.__progress.slotsUsed }));
  // abre o baú com três golpes e pega o que saiu dele
  const openCache = async (i, side = -1) => {
    await calmAll();
    const c = (await caches()).find((k) => k.i === i);
    await setP(c.x - 0.5 + side * 1.4, c.y, { face: -side, inv: 99 });
    await waitGame(0.3);
    for (let k = 0; k < 8 && !(await caches()).find((q) => q.i === i).open; k++) {
      await setP(c.x - 0.5 + side * 1.4, c.y, { face: -side, inv: 99 });
      await waitGame(0.1);
      await tap('KeyJ');
      await waitGame(0.5);
    }
    return { ...c, open: (await caches()).find((q) => q.i === i).open };
  };
  // espera o achado assentar e encosta nele (se caiu em cima do cavaleiro, já foi pego)
  const takeFind = async (id) => {
    await until((id) => window.__progress.upgrades.has(id) || window.__progress.seen.has('item:' + id) || window.__scene.finds.placed.some((f) => f.id === id && f.ready), id, 15000);
    const f = (await placed()).find((q) => q.id === id);
    if (f) {
      await page.evaluate((f) => { const s = window.__scene; s.player.teleport(f.x, f.y + 13); s.player.body.setVelocity(0, 0); }, f);
      await until((id) => !window.__scene.finds.placed.some((f) => f.id === id), id, 10000);
    }
    await waitGame(0.2);
    return f;
  };
  const lastBanner = () => page.evaluate(() => window.__banners.slice(-1)[0] || '');
  const hurtOnce = () => page.evaluate(() => {
    const s = window.__scene;
    const p = s.player;
    p.invuln = 0;
    if (p.hurt(p.x + 10)) s.onHurt();
    return p.hp;
  });

  // ---------- 0. fora das Minas o inventário não mostra os itens delas ----------
  await setProgress();
  await hookUi();
  await start('abismo', '1');
  let iv = await inv();
  const MINE = ['flower', 'helmet', 'rawamber', 'watch', 'whistle', 'mirror'];
  check(!iv.items.some((b) => MINE.includes(b.id)) && iv.extraHidden, `antes das Minas, nenhum achado delas no inventário (${iv.items.map((b) => b.id).join(' ')})`);
  await closeInv();

  // ---------- 1. na Boca da Mina aparecem os seis, com a pista ----------
  await start('boca', '1');
  await waitGame(0.3);
  iv = await inv();
  const mine = iv.items.filter((b) => MINE.includes(b.id));
  check(mine.length === 6 && mine.every((b) => b.missing && /^Ainda não tem/.test(b.what)), `na Boca da Mina, os seis achados com a pista (${mine.map((b) => b.id).join(' ')})`);
  check(!iv.extraHidden && iv.extra.filter((t) => /Ainda não encontrado/.test(t)).length === 2, `e os dois espaços a mais ainda não encontrados (${iv.extra.join(' / ')})`);
  await page.screenshot({ path: `${OUT}/i01-inventario-minas.png` });
  await closeInv();

  // ---------- 2. o baú da Boca: o Capacete pula do baú ----------
  let c = await openCache(0);
  check(c.open, `três golpes abrem o baú da Boca (${JSON.stringify(c)})`);
  await waitGame(0.3);
  let pl = await placed();
  check(pl.some((f) => f.id === 'helmet') || (await owned()).up.includes('helmet'), `abriu o baú: o Capacete de mineiro pula para o lado do cavaleiro (${JSON.stringify(pl)})`);
  await shot('i02-bau-capacete');
  let f = await takeFind('helmet');
  let ow = await owned();
  let b = await lastBanner();
  check(ow.up.includes('helmet') && ow.eq.includes('helmet'), `pegou o Capacete e ele entrou equipado (${JSON.stringify(ow)})`);
  check(/^Capacete de mineiro \| As pedras/.test(b), `com a faixa do item ("${b}")`);
  await waitGame(5.0);
  const th1 = await page.evaluate(() => window.__thoughts.slice(-1)[0] || '');
  check(/Amassado/.test(th1), `e pensa nele ("${th1}")`);

  // ---------- 3. save de antes dos itens: baú aberto, item do lado ----------
  await page.evaluate(() => { const p = window.__progress; p.seen.add('cache:prensas:0'); p.save(); });
  await start('prensas', '1');
  pl = await placed();
  const pc = (await caches())[0];
  const raw = pl.find((q) => q.id === 'rawamber');
  check(pc.open && raw && Math.abs(raw.x / 16 - (pc.x + 22 / 16)) < 1.5, `baú já aberto num save antigo: o Âmbar bruto está do lado (${JSON.stringify(raw)}, baú ${pc.x})`);
  await takeFind('rawamber');
  ow = await owned();
  check(ow.eq.includes('rawamber'), `pegou o Âmbar bruto (${JSON.stringify(ow.eq)})`);

  // ---------- 4. o Âmbar bruto enche mais ----------
  await page.evaluate(() => { const p = window.__progress; p.learn('lembranca'); p.amber = 0; p.save(); window.__scene.applyProgress(); });
  let ms = await miners();
  check(ms.length >= 1, `mineiro nas Prensas (${ms.length})`);
  let m = await pin(0);
  await setP(Math.round(m.x) - 3, Math.round(m.y), { face: 1, inv: 99 });
  await waitGame(0.2);
  const a0 = await page.evaluate(() => window.__progress.amber);
  for (let k = 0; k < 4 && (await page.evaluate((a) => window.__progress.amber === a, a0)); k++) {
    await tap('KeyJ');
    await waitGame(0.6);
  }
  const a1 = await page.evaluate(() => window.__progress.amber);
  check(Math.abs(a1 - a0 - 0.3) < 0.01, `com o Âmbar bruto, um golpe junta 0.3 em vez de 0.2 (${(a1 - a0).toFixed(2)})`);
  await page.evaluate(() => { window.__pin.update = Object.getPrototypeOf(window.__pin).update.bind(window.__pin); });

  // ---------- 5. o cinto atrás do Âmbar (Prensas) ----------
  const plugs = () => page.evaluate(() => window.__scene.mine.plugs.map((p) => ({ id: p.id, x: p.rect.x / 16, y: p.rect.y / 16, w: p.rect.width / 16, h: p.rect.height / 16 })));
  let pg = await plugs();
  check(pg.length === 1 && pg[0].x === 8 && pg[0].y === 37 && pg[0].h === 3, `um bloco de Âmbar no pé da parede (${JSON.stringify(pg)})`);
  pl = await placed();
  const cinto = pl.find((q) => q.id === 'cinto');
  check(cinto && Math.abs(cinto.x / 16 - 7) < 0.1, `o cinto aparece atrás do Âmbar (${JSON.stringify(cinto)})`);
  await calmAll();
  await setP(10, 40, { face: -1, inv: 99 });
  await waitGame(0.3);
  await shot('i03-cinto-no-ambar');
  await tap('KeyJ');
  await waitGame(0.5);
  check((await plugs()).length === 1, 'com a foice, o Âmbar só tilinta');
  // com a Picareta
  await page.evaluate(() => { window.__progress.seen.add('weapon:picareta'); window.__settings.data.weapon = 'picareta'; window.__progress.save(); });
  await start('prensas', '1');
  await calmAll();
  await setP(10, 40, { face: -1, inv: 99 });
  await waitGame(0.3);
  for (let k = 0; k < 3 && (await plugs()).length; k++) {
    await tap('KeyJ');
    await waitGame(0.6);
  }
  check((await plugs()).length === 0, 'a Picareta quebra o bloco');
  const sl0 = (await owned()).slots;
  await hold('KeyA', 700);
  await until(() => window.__progress.seen.has('item:cinto'), null, 8000).catch(() => {});
  ow = await owned();
  b = await lastBanner();
  check(ow.slots === sl0 + 1 && /^Cinto de ferramentas \|/.test(b), `andando para dentro do nicho, pega o cinto: mais um espaço (${sl0} > ${ow.slots}, "${b}")`);
  await shot('i04-cinto');

  // ---------- 6. Veio: o bornal atrás do Âmbar, o baú do Relógio e a ficha de A. ----------
  await start('veio', '1');
  await calmAll();
  pg = await plugs();
  check(pg.length === 1 && pg[0].x === 4 && pg[0].y === 15, `o bloco de Âmbar do nicho do Veio (${JSON.stringify(pg)})`);
  await setP(6, 18, { face: -1, inv: 99 });
  await waitGame(0.3);
  for (let k = 0; k < 3 && (await plugs()).length; k++) {
    await tap('KeyJ');
    await waitGame(0.6);
  }
  check((await plugs()).length === 0, 'a Picareta abre o nicho do Veio');
  const sl1 = (await owned()).slots;
  await hold('KeyA', 800);
  await until(() => window.__progress.seen.has('item:bornal'), null, 8000).catch(() => {});
  ow = await owned();
  check(ow.slots === sl1 + 1, `pega o bornal: mais um espaço (${sl1} > ${ow.slots})`);
  await shot('i05-bornal');
  c = await openCache(0, -1);
  await waitGame(0.3);
  await takeFind('watch');
  ow = await owned();
  check(ow.eq.includes('watch'), `o baú do Veio tem o Relógio do turno, equipado (${JSON.stringify(ow.eq)})`);
  // o Relógio estica a Lembrança e o Eco
  await page.evaluate(() => { const p = window.__progress; p.amber = 3; p.power = 'lembranca'; p.save(); window.__scene.applyProgress(); });
  await setP(30, 30, { inv: 99, face: 1 });
  await waitGame(0.3);
  await tap('KeyQ');
  await waitGame(0.1);
  const st1 = await page.evaluate(() => ({ t: window.__scene.stopT, len: window.__scene.stopLen }));
  check(Math.abs(st1.len - 3.2) < 0.01, `com o Relógio, a Lembrança dura 3,2 s (${JSON.stringify(st1)})`);
  await until(() => window.__scene.stopT <= 0, null, 20000);
  await page.evaluate(() => { const p = window.__progress; p.learn('eco'); p.choosePower('eco'); p.amber = 3; p.save(); window.__scene.applyProgress(); });
  await tap('KeyQ');
  await waitGame(0.1);
  const eco = await page.evaluate(() => window.__scene.memEcho && window.__scene.memEcho.remaining);
  check(eco > 7.7 && eco <= 8, `e o Eco fica 8 s (${eco && eco.toFixed(2)})`);
  await until(() => !window.__scene.memEcho, null, 20000);
  // a ficha de A.: a flor que estava entre as folhas
  await setP(52, 60, { inv: 0, face: 1 });
  await waitGame(0.4);
  await tap('KeyW');
  await page.waitForTimeout(400);
  const talk = await finishTalk();
  check(/A\.$/.test(talk.trim()) || /Ficha de visita/.test(talk), `lê a ficha de A. (${talk.slice(0, 60)})`);
  await until(() => window.__progress.upgrades.has('flower'), null, 10000);
  b = await lastBanner();
  ow = await owned();
  check(/^Flor prensada \|/.test(b), `a flor fica com ele ("${b}", equipada: ${ow.eq.includes('flower')})`);
  if (!ow.eq.includes('flower')) await page.evaluate(() => { const p = window.__progress; p.equipped.clear(); p.toggle('flower'); p.save(); window.__scene.applyProgress(); });
  // com 1 de vida, a flor fecha uma rachadura, uma vez
  await setP(30, 30, { inv: 0, hp: 2, face: 1 });
  await waitGame(0.2);
  let hp = await hurtOnce();
  check(hp === 1, `machucado até 1 (${hp})`);
  await waitGame(0.8);
  hp = await page.evaluate(() => window.__scene.player.hp);
  const spent = await page.evaluate(() => window.__progress.seen.has('flower:spent'));
  check(hp === 2 && spent, `a Flor prensada fecha a rachadura (${hp}, gasta ${spent})`);
  await shot('i06-flor');
  await waitGame(1.6);
  hp = await hurtOnce();
  await waitGame(0.8);
  const hp2 = await page.evaluate(() => ({ hp: window.__scene.player.hp, grav: window.__scene.player.gravMul }));
  check(hp2.hp === 1 && hp2.grav < 1, `a segunda vez não vale: fica com 1 e a lembrança racha (${JSON.stringify(hp2)})`);
  // a vela devolve a flor
  await page.evaluate(() => { const s = window.__scene; s.player.hp = 5; s.registry.set('hp', 5); });
  // (a vela fica a dois passos do livro do Capataz: bem em cima dela é a vela que responde)
  await setP(2, 48, { inv: 99, face: -1 });
  await waitGame(0.4);
  await tap('KeyW');
  await waitGame(2.6);
  check(!(await page.evaluate(() => window.__progress.seen.has('flower:spent'))), 'descansou na vela: a flor volta a valer');

  // ---------- 7. Capataz: o apito do lado do corpo, e o aparo para o mundo ----------
  await page.evaluate(() => { const p = window.__progress; p.seen.add('boss:reflexo'); p.seen.add('boss:capataz'); p.save(); });
  await start('capataz', '1');
  pl = await placed();
  const wh = pl.find((q) => q.id === 'whistle');
  check(!!wh && Math.abs(wh.x / 16 - (46.5 + 22 / 16)) < 1, `o Apito do Capataz ficou do lado do corpo (${JSON.stringify(wh)})`);
  await takeFind('whistle');
  ow = await owned();
  b = await page.evaluate(() => window.__banners.find((t) => /^Apito do Capataz/.test(t)) || '');
  check(ow.up.includes('whistle'), `pegou o Apito ("${b}")`);
  if (!ow.eq.includes('whistle')) check(/Guardado no inventário/.test(b), 'sem espaço, ele vai para o inventário guardado');
  await page.evaluate(() => { const p = window.__progress; p.equipped.clear(); p.toggle('whistle'); p.toggle('helmet'); p.save(); window.__scene.applyProgress(); });
  const st2 = await page.evaluate(() => { const s = window.__scene; s.onParry(s.player.x + 12, s.player.y - 20, true); return { t: s.stopT, len: s.stopLen }; });
  check(Math.abs(st2.len - 0.6) < 0.01 && st2.t > 0.5, `com o Apito, aparar para o mundo meio segundo (${JSON.stringify(st2)})`);
  await until(() => window.__scene.stopT <= 0, null, 10000);
  const st3 = await page.evaluate(() => { const s = window.__scene; s.onParry(s.player.x + 12, s.player.y - 20, false); return s.stopT; });
  check(st3 === 0, `rebater flecha não apita (${st3})`);

  // ---------- 8. Câmara de Âmbar: a lasca ao pé do espelho ----------
  await start('espelhos', '1');
  pl = await placed();
  const lasca = pl.find((q) => q.id === 'mirror');
  check(!!lasca && Math.abs(lasca.x / 16 - 35.5) < 0.6, `a Lasca do espelho ao pé do espelho rachado (${JSON.stringify(lasca)})`);
  await takeFind('mirror');
  await page.evaluate(() => { const p = window.__progress; p.equipped.clear(); p.toggle('mirror'); p.save(); window.__scene.applyProgress(); });
  check((await page.evaluate(() => window.__scene.echoMul)) === 1, 'com a Lasca, o Eco bate com a força inteira');
  await page.evaluate(() => { const p = window.__progress; p.equipped.clear(); p.save(); });
  check((await page.evaluate(() => window.__scene.echoMul)) === 0.6, 'sem ela, 60%');

  // ---------- 9. o Capacete: a viga baixa do vagonete não machuca ----------
  await page.evaluate(() => { const p = window.__progress; p.equipped.clear(); p.toggle('helmet'); p.save(); });
  const beam = async () => {
    await page.evaluate(() => { window.__progress.seen.delete('cart:trilhos:right'); window.__progress.save(); });
    await start('trilhos', '1');
    await calmAll();
    const cart = await page.evaluate(() => { const c = window.__scene.mine.cart; return { x: c.x / 16, rail: c.rail / 16 }; });
    await setP(cart.x - 0.5, cart.rail, { inv: 0, hp: 5, face: 1 });
    await waitGame(0.3);
    await tap('KeyW');
    await waitGame(0.3);
    await tap('KeyJ');
    await until(() => !window.__scene.mine.cart.rider, null, 30000).catch(() => {});
    await waitGame(0.5);
    return page.evaluate(() => ({ hp: window.__scene.player.hp, rider: window.__scene.mine.cart.rider }));
  };
  const h1 = await beam();
  check(h1.hp === 5 && !h1.rider, `com o Capacete, a viga derruba do vagonete mas não machuca (${JSON.stringify(h1)})`);
  await page.evaluate(() => { const p = window.__progress; p.equipped.clear(); p.save(); });
  const h0 = await beam();
  check(h0.hp === 4, `sem ele, a viga machuca (${JSON.stringify(h0)})`);

  // ---------- 10. tudo gravado ----------
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('eclipse-progresso-v1')));
  check(['helmet', 'rawamber', 'watch', 'flower', 'whistle', 'mirror'].every((u) => saved.upgrades.includes(u)) && saved.seen.includes('item:bornal') && saved.seen.includes('item:cinto'), `os achados ficam gravados (${saved.upgrades.join(' ')})`);
  iv = await inv();
  check(iv.extra.filter((t) => /mais um espaço/.test(t)).length === 2, `o inventário lista os dois espaços a mais (${iv.extra.join(' / ')})`);
  await page.screenshot({ path: `${OUT}/i07-inventario-final.png` });
  await closeInv();

  console.log(errs.length ? errs.join('\n') : 'sem erros no navegador');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
})();
