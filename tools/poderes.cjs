// Testa os poderes de memória das Minas: antes deles não há contas nem botão; o primeiro golpe num
// mineiro lembra a Lembrança (enche as três contas); a Lembrança para os inimigos (corpo e animação,
// sem machucar) enquanto o cavaleiro anda e solta tudo no fim, com os chefes soltos antes; sem Âmbar
// as contas tremem; cada golpe enche, derrubar enche mais; o Eco (escolhido no inventário) repete o
// golpe e a flecha mais fraco e não enche as contas; o mineiro que ficou ensina o Remendo, que
// ajoelha e fecha uma ferida (com vida cheia ou no ar não deixa; machucado no meio não fecha); o
// progresso grava os poderes; um progresso de antes dos poderes recebe o que já passou.
// uso: node poderes.cjs <pasta-saida> [url]
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
    p.abilities = new Set(['wall', 'double', 'hook', 'veil']);
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
  // segura um mineiro no lugar, sem pensar (para os golpes do teste caírem sempre). Os outros mineiros
  // ficam de fora: a foice alcança dois de uma vez e o teste conta as contas de um golpe só
  const pin = (i) => page.evaluate((i) => {
    const all = window.__scene.enemies.filter((e) => e.kind === 'miner' && e.alive);
    const e = all[i];
    for (const o of all) {
      if (o === e || o.__park) continue;
      o.__park = true;
      o.update = () => {};
      o.harms = () => false;
      Object.defineProperty(o, 'rect', { configurable: true, get: () => ({ x: -9999, y: -9999, right: -9998, bottom: -9998, width: 1, height: 1 }) });
      o.body.setVelocity(0, 0);
    }
    if (e.__park) {
      delete e.__park;
      delete e.harms;
      delete e.rect;
    }
    window.__pin = e;
    e.update = () => {};
    e.body.setVelocity(0, 0);
    return { x: e.zone.x / 16, y: e.body.bottom / 16, hp: e.hp };
  }, i);

  // ---------- 0. antes dos poderes ----------
  await setProgress();
  await hookUi();
  await start('boca', '1');
  let st = await S();
  check(st.powers.length === 0 && !st.cls && !st.beads, `antes das Minas não há contas nem botão de memória (${JSON.stringify(st)})`);
  await tap('KeyQ');
  await waitGame(0.2);
  st = await S();
  check(st.stop === 0 && !st.echo, 'o botão de memória não faz nada sem poder');

  // ---------- 1. o primeiro golpe num mineiro lembra a Lembrança ----------
  let ms = await miners();
  check(ms.length >= 2, `dois mineiros na Boca da Mina (${ms.length})`);
  let m = await pin(0);
  await setP(Math.round(m.x) - 3, Math.round(m.y), { face: 1, inv: 99 });
  await waitGame(0.2);
  for (let i = 0; i < 6 && !(await page.evaluate(() => window.__progress.powers.size)); i++) {
    await tap('KeyJ');
    await waitGame(0.75);
  }
  st = await S();
  const b1 = await page.evaluate(() => window.__banners.slice(-1)[0] || '');
  check(st.powers.join() === 'lembranca' && st.power === 'lembranca', `o primeiro golpe num mineiro lembra a Lembrança (${st.powers})`);
  check(/^Lembrança \| Poder de memória/.test(b1), `com a faixa do poder ("${b1}")`);
  check(st.amber === 3 && st.reg === 3, `e o primeiro Âmbar enche as três contas (${st.amber})`);
  check(st.cls && st.beads, 'as contas aparecem embaixo da máscara e o botão de memória no toque');
  await waitGame(4.8);
  const tip = await page.evaluate(() => window.__thoughts.slice(-1)[0] || '');
  check(/gasta duas contas/.test(tip) && /Q/.test(tip), `pensamento com a tecla ("${tip.slice(0, 70)}")`);
  await shot('p01-contas');

  // ---------- 2. a Lembrança ----------
  // (o mineiro pode ter escorregado com os golpes: o lugar dele agora)
  m = await page.evaluate(() => { const e = window.__pin; e.update = Object.getPrototypeOf(e).update.bind(e); e.body.setVelocity(0, 0); return { x: e.zone.x / 16, y: e.body.bottom / 16 }; });
  await setP(Math.round(m.x) - 5, Math.round(m.y), { face: 1, inv: 99 });
  await waitGame(0.8);
  await tap('KeyQ');
  await waitGame(0.15);
  st = await S();
  check(st.stop > 1.5 && st.amber === 1, `a Lembrança gasta duas contas e para o mundo (${st.stop}, contas ${st.amber})`);
  // o navegador do teste é lento (cada foto leva segundos e o jogo anda nesse meio-tempo): a parada
  // fica longa para conferir com calma; o tempo dela já foi conferido acima
  await page.evaluate(() => { const s = window.__scene; s.stopT = 30; s.stopLen = 30; });
  const held = await page.evaluate(() => { const s = window.__scene; const e = window.__pin; return { held: s.held.has(e), moves: e.body.moves, x: e.zone.x, y: e.zone.y, anim: e.sprite.anims.isPaused }; });
  check(held.held && held.moves === false && held.anim, `o mineiro fica parado, corpo e animação (${JSON.stringify(held)})`);
  await shot('p02-lembranca');
  const px0 = await page.evaluate(() => window.__scene.player.x);
  await hold('KeyD', 350);
  const px1 = await page.evaluate(() => window.__scene.player.x);
  check(px1 > px0 + 10, `só o cavaleiro anda (${(px1 - px0).toFixed(0)} px)`);
  const still = await page.evaluate(() => { const e = window.__pin; return { x: e.zone.x, y: e.zone.y }; });
  check(Math.abs(still.x - held.x) < 0.5 && Math.abs(still.y - held.y) < 0.5, 'o mineiro não saiu do lugar');
  // em cima dele, parado, não machuca
  await page.evaluate(() => {
    const s = window.__scene;
    const e = window.__pin;
    s.player.teleport(e.zone.x, e.body.bottom);
    s.player.invuln = 0;
    window.__hp0 = s.player.hp;
    // quem machucou, se machucar (para a falha dizer)
    window.__why = '';
    const h0 = s.player.hurt.bind(s.player);
    s.player.hurt = (fx) => { const r = h0(fx); if (r) window.__why = `de ${fx.toFixed(0)}, parada ${s.stopT.toFixed(2)}, ` + s.enemies.filter((q) => q.alive && q.rect && ((a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y)(q.rect, s.player.rect)).map((q) => q.kind + (s.held.has(q) ? ':preso' : ':solto')).join(' '); return r; };
  });
  await waitGame(0.3);
  const hp1 = await page.evaluate(() => window.__scene.player.hp);
  check(hp1 === (await page.evaluate(() => window.__hp0)), `parado pela Lembrança, ele não machuca (${hp1} ${await page.evaluate(() => window.__why)})`);
  await page.evaluate(() => { const p = window.__scene.player; p.hurt = Object.getPrototypeOf(p).hurt.bind(p); });
  await page.evaluate(() => { window.__scene.player.invuln = 99; window.__scene.stopT = 0.05; });
  await until(() => window.__scene.stopT <= 0, null, 20000);
  await waitGame(0.1);
  const free = await page.evaluate(() => ({ held: window.__scene.held.size, moves: window.__pin.body.moves, anim: window.__pin.sprite.anims.isPaused }));
  check(free.held === 0 && free.moves === true && !free.anim, `no fim, todos soltos (${JSON.stringify(free)})`);
  // os chefes se soltam antes: 60% do tempo
  const boss = await page.evaluate(() => {
    const s = window.__scene;
    const stub = { kind: 'boss', alive: true, body: { moves: true } };
    const out = [];
    s.stopLen = 2.2;
    s.stopT = 2.0;
    out.push(s.hold(stub), stub.body.moves);
    s.stopT = 0.6;
    out.push(s.hold(stub), stub.body.moves);
    s.stopT = 0;
    return out;
  });
  check(boss.join() === 'true,false,false,true', `os chefes se soltam antes do fim (${boss})`);

  // ---------- 3. sem Âmbar que chegue ----------
  const deny0 = await page.evaluate(() => window.__scene.registry.get('amber-deny') || 0);
  await tap('KeyQ');
  await waitGame(0.2);
  st = await S();
  const deny1 = await page.evaluate(() => window.__scene.registry.get('amber-deny') || 0);
  check(st.stop === 0 && st.amber === 1 && deny1 === deny0 + 1, `com uma conta só, a Lembrança não sai e as contas tremem (${st.amber}, ${deny1})`);

  // ---------- 4. cada golpe enche ----------
  await page.evaluate(() => { window.__progress.amber = 0; window.__scene.registry.set('amber', 0); });
  m = await pin(0);
  await setP(Math.round(m.x) - 3, Math.round(m.y), { face: 1, inv: 99 });
  await waitGame(0.2);
  const hpA = await page.evaluate(() => window.__pin.hp);
  await tap('KeyJ');
  await waitGame(0.75);
  st = await S();
  const hpB = await page.evaluate(() => window.__pin.hp);
  check(hpB < hpA && Math.abs(st.amber - 0.2) < 0.01, `um golpe que entra enche 0,2 de conta (${st.amber})`);
  for (let i = 0; i < 6 && (await page.evaluate(() => window.__pin.alive)); i++) {
    await tap('KeyJ');
    await waitGame(0.75);
  }
  st = await S();
  check(!(await page.evaluate(() => window.__pin.alive)) && Math.abs(st.amber - 0.2 * Math.ceil(hpA / 2.2) - 0.3) < 0.01, `derrubar enche mais um pouco (${st.amber})`);

  // ---------- 5. o Eco ----------
  await page.evaluate(() => window.__scene.learnPower('eco'));
  st = await S();
  const b2 = await page.evaluate(() => window.__banners.slice(-1)[0] || '');
  check(st.powers.includes('eco') && st.power === 'lembranca' && /^Eco \|/.test(b2), `lembrou o Eco, a Lembrança continua escolhida ("${b2}")`);
  await page.evaluate(() => window.__scene.openPause());
  await page.click('#screen-pause [data-cmd="inventory"]');
  await page.waitForTimeout(300);
  const inv = await page.evaluate(() => {
    const w = document.querySelector('.inv-powers-wrap');
    return { hidden: w.hidden, n: w.querySelectorAll('.inv-power').length, on: [...w.querySelectorAll('.inv-power.on')].map((b) => b.dataset.id),
      lock: [...w.querySelectorAll('.inv-power[disabled]')].map((b) => b.dataset.id + ':' + b.querySelector('.what').textContent),
      how: w.querySelector('.inv-powers-how').textContent };
  });
  check(!inv.hidden && inv.n === 3 && inv.on.join() === 'lembranca', `o inventário mostra os três poderes, a Lembrança escolhida (${JSON.stringify(inv.on)})`);
  check(inv.lock.length === 1 && /^remendo:Ainda não lembrou/.test(inv.lock[0]), `o que ele ainda não lembrou fica trancado com a pista (${inv.lock})`);
  check(/Q usa o escolhido/.test(inv.how), `com a tecla do poder (${inv.how})`);
  await page.click('.inv-power[data-id="eco"]');
  await page.waitForTimeout(200);
  const chosen = await page.evaluate(() => ({ p: window.__progress.power, reg: window.__scene.registry.get('power'), on: [...document.querySelectorAll('.inv-power.on')].map((b) => b.dataset.id) }));
  check(chosen.p === 'eco' && chosen.reg === 'eco' && chosen.on.join() === 'eco', `escolheu o Eco (${JSON.stringify(chosen)})`);
  await page.screenshot({ path: `${OUT}/p03-inventario.png` });
  await page.evaluate(() => window.__scene.resumeGame());
  await page.waitForTimeout(300);
  // o Eco repete o golpe, mais fraco, e não enche as contas
  await page.evaluate(() => { window.__progress.amber = 3; window.__scene.registry.set('amber', 3); });
  m = await pin(0);
  await setP(Math.round(m.x) - 3, Math.round(m.y), { face: 1, inv: 99 });
  await waitGame(0.3);
  await tap('KeyQ');
  await waitGame(0.3);
  st = await S();
  check(st.echo && st.amber === 2, `o Eco gasta uma conta e a cópia aparece (${st.amber})`);
  await page.evaluate(() => {
    const e = window.__pin;
    window.__hits = [];
    const orig = e.hit.bind(e);
    e.hit = (fx, dmg, dir) => { window.__hits.push(+dmg.toFixed(2)); return orig(fx, dmg, dir); };
  });
  await tap('KeyJ');
  await waitGame(0.8);
  await shot('p04-eco');
  const hits = await page.evaluate(() => window.__hits);
  st = await S();
  check(hits.length === 2 && Math.abs(hits[1] - hits[0] * 0.6) < 0.02, `a cópia repete o golpe com 60% (${hits})`);
  check(Math.abs(st.amber - 2.2) < 0.01, `só o golpe dele enche as contas (${st.amber})`);
  // a flecha também
  await page.evaluate(() => window.__scene.player.setWeapon('bow'));
  await waitGame(0.3);
  await tap('KeyJ');
  await until(() => window.__scene.arrows.some((a) => a.echo), null, 10000);
  check(true, 'a cópia atira a flecha dela também');
  await page.evaluate(() => window.__scene.player.setWeapon('scythe'));
  await until(() => !window.__scene.memEcho, null, 20000);
  check(true, 'a cópia some sozinha no fim');

  // ---------- 6. o Remendo, com o mineiro que ficou ----------
  await start('veio', '1');
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); });
  await setP(8, 48, { face: 1, inv: 99 });
  await waitGame(0.4);
  await tap('KeyW');
  await page.waitForTimeout(300);
  check((await top()) === 'talk', 'o mineiro que ficou conversa');
  const talk = await finishTalk();
  check(/remendava as tigelas/.test(talk), `ele reconhece o ouro da máscara ("${talk.slice(-90)}")`);
  await waitGame(0.3);
  st = await S();
  const b3 = await page.evaluate(() => window.__banners.slice(-1)[0] || '');
  check(st.powers.includes('remendo') && /^Remendo \|/.test(b3), `e ensina o Remendo ("${b3}")`);
  await page.evaluate(() => { window.__progress.choosePower('remendo'); window.__scene.registry.set('power', 'remendo'); });
  // vida cheia: não deixa
  await page.evaluate(() => { window.__progress.amber = 3; window.__scene.registry.set('amber', 3); });
  await setP(14, 48, { inv: 99 });
  await waitGame(0.3);
  await tap('KeyQ');
  await waitGame(0.2);
  st = await S();
  const th = await page.evaluate(() => window.__thoughts.slice(-1)[0] || '');
  check(st.mend === 0 && st.amber === 3 && /Nenhuma rachadura/.test(th), `com a vida cheia não ajoelha ("${th}")`);
  // machucado: ajoelha, o ouro fecha uma ferida e gasta as três contas
  await setP(14, 48, { inv: 99, hp: 3 });
  await waitGame(0.3);
  await tap('KeyR');
  await waitGame(0.2);
  st = await S();
  check(st.pose === 'kneel' && st.mend > 0 && st.amber === 0, `ajoelha e gasta as três contas (R também serve) (${st.pose}, ${st.amber})`);
  await shot('p05-remendo');
  await waitGame(0.8);
  st = await S();
  check(st.hp === 4 && st.mend === 0, `o ouro fecha uma ferida (${st.hp})`);
  await until(() => !window.__scene.player.pose && !window.__scene.player.frozen, null, 10000);
  // no ar não deixa
  await page.evaluate(() => { window.__progress.amber = 3; window.__scene.registry.set('amber', 3); });
  await setP(14, 48, { inv: 99, hp: 3 });
  await waitGame(0.3);
  await page.keyboard.down('Space');
  await waitGame(0.15);
  await tap('KeyQ');
  await page.keyboard.up('Space');
  st = await S();
  const th2 = await page.evaluate(() => window.__thoughts.slice(-1)[0] || '');
  check(st.mend === 0 && st.amber === 3 && /chão firme/.test(th2), `no ar não ajoelha ("${th2}")`);
  await waitGame(1.2);
  // machucado de joelhos: não fecha
  await setP(14, 48, { inv: 0, hp: 3 });
  await waitGame(0.3);
  await tap('KeyQ');
  await waitGame(0.2);
  await page.evaluate(() => { const s = window.__scene; if (s.player.hurt(s.player.x + 20)) s.onHurt(); });
  await waitGame(1.0);
  st = await S();
  check(st.hp === 2 && st.mend === 0, `machucado de joelhos, a ferida não fecha (${st.hp})`);

  // ---------- 7. o progresso grava ----------
  const saved = await page.evaluate(() => { window.__progress.save(); const d = JSON.parse(localStorage.getItem('eclipse-progresso-v1')); return { powers: d.powers, power: d.power, amber: d.amber }; });
  check(saved.powers.length === 3 && saved.power === 'remendo' && typeof saved.amber === 'number', `o progresso grava os poderes (${JSON.stringify(saved)})`);
  const binds = await page.evaluate(() => window.__settings.codesFor('memory'));
  check(binds.includes('KeyQ') && binds.includes('KeyR'), `teclas do poder (${binds})`);

  // ---------- 8. progresso de antes dos poderes ----------
  await setProgress(['boss:reflexo'], ['espelhos:boss']);
  await start('capataz', '1');
  await waitGame(2.6);
  st = await S();
  check(st.powers.includes('lembranca'), `quem já passou do Reflexo recebe a Lembrança na mina (${st.powers})`);
  await start('espelhos', '2');
  await waitGame(2.6);
  st = await S();
  check(st.powers.includes('eco'), `e o Eco, se pegou a memória do espelho (${st.powers})`);

  check(errs.length === 0, `sem erros (${errs.length})`);
  for (const e of errs.slice(0, 8)) console.log('  ' + e);
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log('ERRO ' + e.message);
  process.exit(2);
});
