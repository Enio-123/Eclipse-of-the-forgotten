// Testa a Área 3, as Minas Abandonadas: as passagens entre as seis salas (a queda das Prensas para
// o Veio fica no Veio), o mineiro (prepara, salta e crava) e o morcego de Âmbar (dorme no teto,
// acorda com o cavaleiro embaixo, mergulha em curva), o Reflexo (a imagem dentro do espelho, sai
// quando a imagem atrasada passa na frente da pedra, repete o caminho e os golpes com atraso, quem
// fica parado leva, cada golpe trava a imagem, na metade o atraso encurta, derrota racha o espelho e
// deixa a memória) e o Capataz de Âmbar (pica o cristal de costas, acorda, a pancada abre a fileira
// de cristais, as lascas em arco e o rebate, a investida até a parede com as pedras do teto, o apito
// que chama a chapa da prensa do teto até em cima do cavaleiro e que pega até ele, a fragmentação da
// segunda fase com a gravidade leve e os fiapos de tinta, a derrota com a Picareta e o fim do quarto
// capítulo), a Picareta quebrando o Âmbar do túnel e o registro do outro lado.
// uso: node minas.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
// ONLY=reflexo,capataz roda só essas partes (links, mineiro, morcego, reflexo, capataz, picareta)
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const part = (k) => !ONLY.length || ONLY.includes(k);
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
      const st = await page.evaluate(() => { const s = window.__scene; const b = s && s.boss; return { room: s && s.room.id, active: s && s.scene.isActive(), boss: b && { state: b.state, t: b.t, hp: b.hp, alive: b.alive }, p: s && { x: s.player.x / 16, y: s.player.body.bottom / 16, hp: s.player.hp, dead: s.player.dead } }; }).catch(() => null);
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
    p.abilities = new Set(['wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', ...extra]) p.seen.add(k);
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
  const P = () => page.evaluate(() => { const s = window.__scene; const p = s.player; return { x: p.x / 16, bottom: p.body.bottom / 16, hp: p.hp, dead: p.dead, room: s.room.id, ground: p.onGround }; });
  const setP = (tx, feetRow, opt = {}) => page.evaluate(([tx, fr, o]) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(tx * 16 + 8, fr * 16);
    p.body.setVelocity(0, 0);
    p.hp = 5;
    p.invuln = o.inv ?? 0;
    if (o.face) p.facing = o.face;
    s.registry.set('hp', 5);
  }, [tx, feetRow, opt]);
  const calm = () => page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'boss' && e.vanish) e.vanish(); });
  // grava os estados do chefe e os golpes que o cavaleiro levou, quadro a quadro, dentro do jogo
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
  const SNAP = 's.sys.pause(); return true;';
  const snap = async (name, i) => {
    await until((i) => window.__rec.ticks[i], i, 20000);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => window.__scene.sys.resume());
  };
  const press = (code, ms) => `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' })), ${ms});`;
  const hookUi = () => page.evaluate(() => {
    const ui = window.__ui;
    window.__thoughts = [];
    window.__banners = [];
    if (ui.__hooked) return;
    ui.__hooked = true;
    const orig = ui.thought.bind(ui);
    ui.thought = (text, ...rest) => { window.__thoughts.push(text); return orig(text, ...rest); };
    const ob = ui.banner.bind(ui);
    ui.banner = (t, ...rest) => { window.__banners.push(t); return ob(t, ...rest); };
  });

let r;
  let rr;
  if (part('links')) {
  // ---------- 1. as passagens entre as salas ----------
  await setProgress(['boss:reflexo', 'boss:capataz', 'weapon:picareta']);
  // sai pela borda e vê onde chegou (e se continua lá depois de um tempo)
  const cross = async (room, entry, place, want, name) => {
    await start(room, entry);
    await calm();
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; window.__oldPlayer = s.player; });
    await page.evaluate(place);
    await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, 20000);
    await waitGame(1.5);
    const r = await P();
    check(r.room === want, `${name}: ${room} -> ${want} (chegou em ${r.room}, x ${r.x.toFixed(1)}, pés ${r.bottom.toFixed(1)})`);
    return r;
  };
  const right = (row) => `(() => { const s = window.__scene; const p = s.player; p.teleport(s.level.widthPx + 6, ${row} * 16); p.body.setVelocity(200, 0); })()`;
  const left = (row) => `(() => { const s = window.__scene; const p = s.player; p.teleport(-6, ${row} * 16); p.body.setVelocity(-200, 0); })()`;
  await cross('boca', '1', right(30), 'trilhos', 'boca pela direita');
  await cross('trilhos', '1', left(24), 'boca', 'trilhos pela esquerda');
  await cross('trilhos', '1', right(24), 'prensas', 'trilhos pela direita');
  await cross('prensas', '1', left(24), 'trilhos', 'prensas pela esquerda');
  const fall = await cross('prensas', '2', '(() => { const p = window.__scene.player; p.teleport(76 * 16 + 8, 41 * 16); p.body.setVelocity(0, 200); })()', 'veio', 'o buraco das prensas');
  check(fall.x > 8 && fall.x < 14, `cai no poço do Veio (x ${fall.x.toFixed(1)})`);
  await waitGame(1.5);
  const still = await P();
  check(still.room === 'veio', `e continua no Veio depois da queda (${still.room})`);
  await cross('veio', '1', '(() => { const p = window.__scene.player; p.teleport(10 * 16 + 8, 2 * 16); p.body.setVelocity(0, -420); })()', 'prensas', 'o poço do Veio para cima');
  await cross('veio', '1', right(78), 'espelhos', 'veio pela direita');
  await cross('espelhos', '1', left(26), 'veio', 'câmara pela esquerda');
  await cross('espelhos', '1', right(26), 'capataz', 'câmara pela direita');
  await cross('capataz', '1', left(30), 'espelhos', 'galeria pela esquerda');

}

  if (part('mineiro')) {
  // ---------- 2. o mineiro ----------
  await setProgress();
  await start('prensas', '2');
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'miner' && e.vanish) e.vanish(); window.__mn = s.enemies.find((e) => e.kind === 'miner' && e.alive); });
  const mn = await page.evaluate(() => { const m = window.__mn; return m ? { x: m.zone.x / 16, st: m.state } : null; });
  check(!!mn, `tem mineiro na Casa das Prensas (${JSON.stringify(mn)})`);
  if (mn) {
    await page.evaluate(() => {
      const s = window.__scene;
      const m = window.__mn;
      window.__ms = [];
      const fn = () => { const st = window.__ms; if (st[st.length - 1] !== m.state) st.push(m.state); };
      s.events.on('postupdate', fn);
      window.__unm = () => s.events.off('postupdate', fn);
    });
    await setP(Math.round(mn.x) + 7, 40, { face: -1 });
    await until(() => window.__ms.includes('strike') || window.__ms.includes('recover'), null, 20000);
    const ms = await page.evaluate(() => window.__ms);
    check(['windup', 'leap'].every((s) => ms.includes(s)), `o mineiro prepara e salta em cima do cavaleiro (${ms.join(' > ')})`);
    const ph = await P();
    check(ph.hp < 5, `parado embaixo do salto, a picareta acerta (vida ${ph.hp})`);
    await page.evaluate(() => window.__unm());
    await shot('m01-mineiro');
  }

}

  if (part('morcego')) {
  // ---------- 3. o morcego de Âmbar ----------
  await setProgress();
  await start('boca', '1');
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'ambat' && e.vanish) e.vanish(); window.__bat = s.enemies.find((e) => e.kind === 'ambat'); });
  const bat = await page.evaluate(() => { const b = window.__bat; return b ? { x: b.zone.x / 16, y: b.zone.y / 16, st: b.state, ceil: b.ceil / 16 } : null; });
  check(bat && bat.st === 'roost', `o morcego dorme pendurado no teto (${JSON.stringify(bat)})`);
  if (bat) {
    await page.evaluate(() => { const c = window.__scene.cameras.main; const b = window.__bat; c.stopFollow(); c.centerOn(b.zone.x, b.zone.y + 60); });
    await waitGame(0.5);
    await shot('m02-morcego-dorme');
    await page.evaluate(() => { const s = window.__scene; s.cameras.main.startFollow(s.player.zone, true, 0.11, 0.13); });
    await page.evaluate(() => {
      const s = window.__scene;
      const b = window.__bat;
      window.__bs = [];
      const fn = () => { const st = window.__bs; if (st[st.length - 1] !== b.state) st.push(b.state); };
      s.events.on('postupdate', fn);
      window.__unb = () => s.events.off('postupdate', fn);
    });
    // o chão embaixo dele
    const floor = await page.evaluate(() => { const s = window.__scene; const b = window.__bat; let y = b.zone.y; while (y < s.level.heightPx && !(s.level.tileAt(b.zone.x, y + 2) >= 0)) y += 16; return Math.floor(y / 16); });
    await setP(Math.floor(bat.x) + 2, floor, { inv: 0 });
    await until(() => window.__bs.includes('dive'), null, 20000);
    await waitGame(0.12);
    await shot('m03-morcego-mergulha');
    await until(() => window.__bs.includes('recover') || window.__bs.includes('stun'), null, 20000);
    const bs = await page.evaluate(() => window.__bs);
    check(['drop', 'hover', 'windup', 'dive'].every((s) => bs.includes(s)), `acorda, paira, acende e mergulha (${bs.join(' > ')})`);
    await page.evaluate(() => window.__unb());
  }

}

  if (part('reflexo')) {
  // ---------- 4. o Reflexo ----------
  await setProgress();
  await hookUi();
  await start('espelhos', '1');
  const R = () => page.evaluate(() => {
    const s = window.__scene;
    const b = s.boss;
    return { state: b.state, hp: b.hp, alive: b.alive, lag: b.lag, target: b.target, freeze: b.freeze, phase2: b.phase2, vis: b.sprite.visible, x: b.sprite.x / 16, masked: !!b.sprite.mask, mirror: s.mine.mirror && { broken: s.mine.mirror.broken, key: s.mine.mirror.img.texture.key } };
  });
  r = await R();
  check(r.state === 'sleep' && !r.vis && r.mirror && !r.mirror.broken && r.mirror.key === 'deco-amber-mirror', `antes da luta: o espelho inteiro e nenhuma imagem fora dele (${JSON.stringify(r)})`);
  // passando na frente da pedra, a imagem aparece dentro dela (escura, presa na moldura)
  await setP(24, 26);
  await page.evaluate(() => { window.__scene.player.facing = 1; });
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.player.x > 26.2 * 16, null, 20000);
  await page.keyboard.up('KeyD');
  await setP(31, 26, { face: 1 });
  await waitGame(1.2);
  r = await R();
  check(r.state === 'sleep' && r.vis && r.masked, `na frente do espelho, a imagem aparece só dentro da pedra (${r.state}, visível ${r.vis}, máscara ${r.masked})`);
  await shot('r01-dentro-do-espelho');
  // passou do espelho (coluna 36): a grade fecha e ela acorda
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.boss.state !== 'sleep', null, 20000);
  await page.keyboard.up('KeyD');
  r = await R();
  const gates = await page.evaluate(() => [6, 57].map((c) => window.__scene.level.tileAt(c * 16 + 8, 25 * 16 + 8)));
  check(r.state === 'emerge' && gates.every((g) => g >= 2), `ao passar, as grades fecham e o Reflexo acorda (${r.state}, grades ${gates})`);
  await until(() => window.__scene.boss.state === 'fight', null, 20000);
  r = await R();
  check(!r.masked && r.vis, `a imagem sai do espelho (máscara ${r.masked})`);
  await page.evaluate(() => { window.__scene.player.invuln = 99; });
  await waitGame(0.3);
  await shot('r02-saiu');
  const bar = await page.evaluate(() => document.querySelector('#bossbar').classList.contains('on') && document.querySelector('#bossbar p').textContent);
  await waitGame(2.0);
  const bar2 = await page.evaluate(() => document.querySelector('#bossbar p').textContent);
  check(bar === 'O Reflexo' || bar2 === 'O Reflexo', `barra de vida do chefe (${bar || bar2})`);
  // repete com atraso: o quadro mostrado é o do cavaleiro de um instante atrás
  const lagOk = await page.evaluate(() => { const b = window.__scene.boss; return { lag: b.lag, cur: b.cur.t, want: b.now - b.lag }; });
  check(Math.abs(lagOk.lag - 0.85) < 0.05 && Math.abs(lagOk.cur - lagOk.want) < 0.06, `repete o cavaleiro com atraso (${lagOk.lag.toFixed(2)}s)`);
  // anda até o meio e para: a imagem chega onde ele parou e machuca
  await setP(18, 26, { face: 1, inv: 99 });
  await waitGame(1.4);
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.player.x > 30 * 16, null, 20000);
  await page.keyboard.up('KeyD');
  await page.evaluate(() => { const p = window.__scene.player; p.invuln = 0; p.hp = 5; });
  await record();
  await waitGame(2.2);
  rr = await rec();
  check(rr.hurt.length > 0, `quem fica parado é alcançado pela própria imagem (${rr.hurt.length} golpes)`);
  await page.evaluate(() => { const p = window.__scene.player; p.invuln = 99; p.hp = 5; });
  // os golpes do cavaleiro voltam no mesmo lugar, depois do atraso
  await page.evaluate(() => { const p = window.__scene.player; p.invuln = 99; });
  await setP(14, 26, { face: 1, inv: 99 });
  await waitGame(1.4);
  await record({}, ['return !!(b.cur && b.cur.atk);', `if (b.cur && b.cur.atk) { ${SNAP} }`]);
  await tap('KeyJ');
  await waitGame(0.1);
  await setP(40, 26, { face: -1, inv: 99 });
  await snap('r03-golpe-repetido', 1);
  rr = await rec();
  check(rr.ticks[0], 'a imagem repete o golpe onde o cavaleiro bateu');
  // golpe nela: a imagem trava e o atraso cresce; depois ela corre para alcançar
  await page.evaluate(() => { const b = window.__scene.boss; window.__hp0 = b.hp; b.hit(0, 1, 'side'); });
  await waitGame(0.2);
  r = await R();
  check(r.lag > r.target + 0.1, `o golpe trava a imagem (atraso ${r.lag.toFixed(2)} > ${r.target})`);
  await waitGame(1.6);
  r = await R();
  check(Math.abs(r.lag - r.target) < 0.02, `e ela corre até alcançar o atraso de antes (${r.lag.toFixed(2)})`);
  // as flechas também voltam
  await page.evaluate(() => {
    const s = window.__scene;
    window.__arrows = 0;
    if (!s.__arrowWrapped) {
      const orig = s.spawnEnemyArrow.bind(s);
      s.spawnEnemyArrow = (...a) => { window.__arrows++; return orig(...a); };
      s.__arrowWrapped = true;
    }
    s.boss.noteShot(s.player.x, s.player.body.center.y, 1, 0);
  });
  await waitGame(1.2);
  const arrows = await page.evaluate(() => window.__arrows);
  check(arrows === 1, `a flecha do cavaleiro volta da imagem (${arrows})`);
  // metade da vida: o atraso encurta
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = b.maxHp * 0.5 + 0.5; b.hit(0, 1, 'side'); });
  r = await R();
  check(r.phase2 && Math.abs(r.target - 0.55) < 0.01, `na metade, ela chega mais perto (atraso alvo ${r.target})`);
  await waitGame(0.6);
  await shot('r04-segunda-fase');
  // derrota: a imagem estoura, o espelho racha, a memória fica e as grades abrem
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  r = await R();
  check(!r.alive && r.state === 'dead' && r.mirror.broken && r.mirror.key === 'deco-amber-mirror-broken', `derrotada, o espelho racha (${JSON.stringify(r.mirror)})`);
  await waitGame(1.0);
  await shot('r05-espelho-rachou');
  await until(() => window.__scene.props.memories.some((m) => m.id === 'espelhos:boss'), null, 20000);
  await waitGame(1.0);
  const g2 = await page.evaluate(() => [6, 57].map((c) => window.__scene.level.tileAt(c * 16 + 8, 25 * 16 + 8)));
  check(g2.every((g) => g < 2), `as grades abrem (${g2})`);
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'espelhos:boss'); s.player.invuln = 99; s.player.teleport(m.x, m.y + 26); });
  await until(() => window.__progress.memories.has('espelhos:boss'), null, 20000);
  await waitGame(1.0);
  await shot('r06-memoria');
  await until(() => !document.querySelector('#screen-memory.show') && !window.__scene.cinematic, null, 40000).catch(() => {});
  await waitGame(6.5);
  const th = await page.evaluate(() => window.__thoughts.join(' | '));
  check(/Um instante atrasado/.test(th), `pensa no reflexo ("${th.slice(0, 90)}")`);
  await start('espelhos', '1');
  const back = await page.evaluate(() => { const s = window.__scene; return { boss: !!s.boss, key: s.mine.mirror && s.mine.mirror.img.texture.key, mem: s.props.memories.length }; });
  check(!back.boss && back.key === 'deco-amber-mirror-broken' && !back.mem, `de volta à câmara, só o espelho rachado (${JSON.stringify(back)})`);

}

  if (part('capataz')) {
  // ---------- 5. o Capataz de Âmbar ----------
  await setProgress(['boss:reflexo']);
  await hookUi();
  await start('capataz', '1');
  await page.evaluate(() => window.__scene.player.setWeapon('scythe'));
  const C = () => page.evaluate(() => {
    const s = window.__scene;
    const b = s.boss;
    const c = s.mine.ceil;
    return {
      state: b.state, anim: b.anim, hp: b.hp, alive: b.alive, x: b.zone.x / 16, facing: b.facing, phase2: b.phase2,
      spikes: b.spikes.length, shards: b.shards.length, rocks: b.rocks.length,
      ceil: c && { state: c.state, x: c.x / 16, y: c.y, rest: c.rest, beam: c.beamY, land: c.land },
    };
  });
  let c = await C();
  check(c.state === 'sleep' && c.anim === 'work' && c.facing === 1, `de costas, picando o cristal (${c.state}, ${c.anim})`);
  check(c.ceil && c.ceil.state === 'park', `a viga, o carrinho e a chapa da prensa do teto (${JSON.stringify(c.ceil)})`);
  const view = await page.evaluate(() => { const s = window.__scene; const v = s.cameras.main.worldView; return { top: v.y, bottom: v.bottom }; });
  check(c.ceil && view.top < c.ceil.rest, `do chão dá para ver a chapa pendurada (vista desde ${view.top.toFixed(0)}, chapa em ${c.ceil && c.ceil.rest})`);
  await shot('c01-trabalhando');
  // passou da coluna 12: a grade fecha, ele se levanta e ruge
  await page.keyboard.down('KeyD');
  await until(() => window.__scene.boss.state !== 'sleep', null, 20000);
  await page.keyboard.up('KeyD');
  c = await C();
  const gate = await page.evaluate(() => window.__scene.level.tileAt(7 * 16 + 8, 28 * 16 + 8));
  check(c.state === 'rise' && gate >= 2, `acorda e a grade da entrada fecha (${c.state}, grade ${gate})`);
  await until(() => window.__scene.boss.state === 'roar', null, 20000);
  await waitGame(0.4);
  await shot('c02-rugido');
  await until(() => window.__scene.boss.state === 'idle', null, 20000);
  c = await C();
  check(c.facing === -1, `virou para o cavaleiro (${c.facing})`);
  const cbar = await page.evaluate(() => document.querySelector('#bossbar p').textContent);
  check(cbar === 'O Capataz de Âmbar', `barra de vida do chefe (${cbar})`);
  // segura o Capataz parado numa coluna, sem pensar
  const hush = (tx) => page.evaluate((tx) => {
    const s = window.__scene;
    const b = s.boss;
    b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
    b.toIdle();
    b.clearHazards();
    if (tx !== undefined) b.body.reset(tx * 16 + 8, 30 * 16 - 50);
    b.body.setVelocity(0, 0);
  }, tx);
  const force = async (a, probes, ticks) => {
    await record(probes, ticks);
    await page.evaluate((a) => { const b = window.__scene.boss; b.thinkT = 99; b.startAttack(a); }, a);
  };
  const idle = () => until(() => window.__scene.boss.state === 'idle', null, 20000);
  const reached = (st, timeout = 20000) => until((st) => window.__rec && window.__rec.states.includes(st), st, timeout);

  // a pancada: a fileira de cristais corre pelo chão a partir da ponta
  await hush(40);
  await setP(47, 30, { face: -1 });
  await waitGame(0.3);
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(52 * 16 + 8, 30 * 16); s.player.facing = -1; });
  await waitGame(0.2);
  await hush(40);
  await page.evaluate(() => { const b = window.__scene.boss; b.facing = 1; });
  await force('slam', { slam: 'return b.spikes.map((k) => k.x / 16);' }, [`if (b.spikes.some((k) => k.img && k.h > 20)) { ${SNAP} }`]);
  await snap('c03-cristais', 0);
  await idle();
  rr = await rec();
  const sx = rr.probe.slam || [];
  check(sx.length >= 6 && sx.every((x, i) => i === 0 || x > sx[i - 1]), `a pancada abre uma fileira de cristais para a frente (${sx.length}: ${sx.slice(0, 4).map((x) => x.toFixed(1)).join(', ')}...)`);
  check(rr.hurt.length > 0, `parado na fileira, o cristal acerta (${rr.hurt.length})`);
  // pulando, passa por cima
  await hush(40);
  await setP(50, 30, { face: -1 });
  await waitGame(0.3);
  // pula quando o cristal logo atrás dele começa a acender
  await force('slam', {}, [`if (b.spikes.some((k) => k.t > 0 && k.x > p.x - 40 && k.x < p.x)) { ${press('Space', 320)} return true; }`]);
  await idle();
  rr = await rec();
  check(rr.ticks[0] && rr.hurt.length === 0, `pulando a fileira, não acerta (${rr.hurt.length})`);
  // aparar a pancada no fim da preparação
  await hush(40);
  await setP(43, 30, { face: -1, inv: 4 });
  await waitGame(0.3);
  await page.evaluate(() => { window.__k = 0; });
  await force('slam', {}, [`const k = window.__k;
    if (k === 0 && b.state === 'slamwind' && b.t > 0.45) { ${press('KeyJ', 110)} window.__k = 1; }
    else if (k === 1 && (b.state === 'stagger' || b.state === 'slam' || b.state === 'slamrec' || b.state === 'idle')) return true;
    return false;`]);
  await until(() => window.__rec.ticks[0], null, 20000);
  rr = await rec();
  check(rr.states.includes('stagger'), `golpear no fim da preparação apara a pancada (${rr.states.join(' > ')})`);
  await waitGame(0.2);
  await shot('c04-aparou');
  await idle();

  // as lascas em arco
  await hush(54);
  await setP(36, 30, { face: 1 });
  await waitGame(0.3);
  await force('throw', {}, ['if (b.shards.length) { window.__ns = b.shards.length; return true; }', `if (b.shards.length && b.shards[0].y > b.floorY - 120 && b.shards[0].vy > 0) { ${SNAP} }`]);
  await snap('c05-lascas', 1);
  const ns = await page.evaluate(() => window.__ns);
  check(ns === 3, `joga três lascas (${ns})`);
  await until(() => window.__scene.boss.shards.length === 0, null, 20000);
  rr = await rec();
  check(rr.hurt.length > 0, `parado, uma lasca acerta (${rr.hurt.length})`);
  await idle();
  // rebater uma lasca: ela volta reta para o peito dele
  await hush(54);
  await setP(36, 30, { face: 1, inv: 9 });
  await waitGame(0.3);
  await page.evaluate(() => { window.__hp0 = window.__scene.boss.hp; });
  await force('throw', {}, [`if (!b.shards.length) return false;
    const q = b.shards[0];
    const R = q.img.getBounds().constructor;
    window.__back = b.parry(new R(q.x - 10, q.y - 10, 20, 20), q.x - 30);
    return true;`]);
  await until(() => window.__rec.ticks[0], null, 20000);
  await until(() => window.__scene.boss.state === 'stagger' || window.__scene.boss.shards.every((q) => !q.back), null, 20000);
  const back2 = await page.evaluate(() => ({ back: window.__back, hp0: window.__hp0, hp: window.__scene.boss.hp, st: window.__scene.boss.state }));
  check(back2.back && back2.hp0 - back2.hp >= 3.9 && back2.st === 'stagger', `a lasca rebatida volta, machuca e deixa ele tonto (${JSON.stringify(back2)})`);
  await idle();

  // a investida até a parede (e as pedras do teto)
  await hush(56);
  await setP(30, 30, { face: 1, inv: 99 });
  await waitGame(0.3);
  await force('charge', { stun: 'const h0 = b.hp; b.hit(0, 1, "side"); return { x: b.zone.x / 16, d: h0 - b.hp };' }, [`if (b.state === 'charge' && b.t > 0.15) { ${SNAP} }`, 'return b.rocks.length > 0;', `if (b.rocks.some((r) => r.falling)) { ${SNAP} }`]);
  await snap('c06-investida', 0);
  await reached('stun');
  await snap('c07-pedras', 2);
  rr = await rec();
  check(rr.probe.stun && rr.probe.stun.x < 11, `investe até a parede da entrada e fica tonto (${rr.probe.stun && rr.probe.stun.x.toFixed(1)})`);
  check(rr.ticks[1], 'a pancada na parede solta pedras do teto');
  const stunHit = rr.probe.stun ? rr.probe.stun.d : 0;
  check(Math.abs(stunHit - 1.3) < 0.01, `tonto, o golpe entra mais (${stunHit.toFixed(2)})`);
  await idle();

  // o apito: a chapa corre até em cima do cavaleiro e cai
  await hush(56);
  await setP(30, 30, { face: 1 });
  await waitGame(0.3);
  await force('whistle', {}, [
    "const c = s.mine.ceil; if (c.state === 'warn') { window.__cw = { x: c.x / 16, p: p.x / 16 }; return true; }",
    `const c = s.mine.ceil; if (c.state === 'warn' && c.t > 0.3) { ${SNAP} }`,
    `const c = s.mine.ceil; if (c.state === 'down') { ${SNAP} }`,
  ]);
  await snap('c08-chapa-aviso', 1);
  await snap('c09-chapa-cai', 2);
  const cw = await page.evaluate(() => window.__cw);
  check(cw && Math.abs(cw.x - cw.p) < 0.5, `a chapa para em cima do cavaleiro (${JSON.stringify(cw)})`);
  rr = await rec();
  check(rr.hurt.length > 0, `quem fica embaixo leva a chapa (${rr.hurt.length})`);
  await until(() => window.__scene.mine.ceil.state === 'park', null, 20000);
  // em cima da tábua, a chapa assenta na tábua
  await hush(56);
  await setP(18, 23, { face: 1, inv: 9 });
  await waitGame(0.4);
  await page.evaluate(() => { const s = window.__scene; s.mine.callPress(s.player.x); });
  await until(() => window.__scene.mine.ceil.state === 'down', null, 20000);
  c = await C();
  check(Math.abs(c.ceil.land - (23 * 16 - 16)) < 1, `em cima da tábua, a chapa para na tábua (assenta em ${c.ceil.land})`);
  await until(() => window.__scene.mine.ceil.state === 'park', null, 20000);
  // a chapa pega até ele
  await hush(30);
  await setP(50, 30, { inv: 99 });
  await page.evaluate(() => { window.__hp0 = window.__scene.boss.hp; const s = window.__scene; s.mine.callPress(s.boss.zone.x); });
  await until(() => window.__scene.mine.ceil.state === 'up', null, 20000);
  const self = await page.evaluate(() => window.__hp0 - window.__scene.boss.hp);
  check(self >= 5.9, `a chapa não escolhe: pega até o Capataz (${self.toFixed(1)} de dano)`);
  await until(() => window.__scene.mine.ceil.state === 'park', null, 20000);

  // segunda fase: a fragmentação
  await hush(44);
  await setP(24, 30, { inv: 99 });
  const ph2 = await page.evaluate(() => { const b = window.__scene.boss; b.hp = b.maxHp * 0.5 + 0.5; b.hit(0, 1, 'side'); return { p2: b.phase2, st: b.state }; });
  check(ph2.p2 && ph2.st === 'rage', `metade da vida: ele ruge (${ph2.st})`);
  await waitGame(0.75);
  await shot('c10-fragmenta');
  const low = await page.evaluate(() => window.__scene.player.gravMul);
  check(Math.abs(low - 0.6) < 0.01, `a lembrança racha e a gravidade fica leve (${low})`);
  // pulo mais alto na gravidade leve (logo depois da rachadura, dentro dos 7 s)
  const jumpH = async () => {
    await setP(24, 30, { inv: 99 });
    await waitGame(0.3);
    await page.evaluate(() => { const s = window.__scene; window.__minY = s.player.body.bottom; const fn = () => { window.__minY = Math.min(window.__minY, s.player.body.bottom); }; s.events.on('postupdate', fn); window.__unj = () => s.events.off('postupdate', fn); });
    await hold('Space', 900);
    await waitGame(1.2);
    return page.evaluate(() => { window.__unj(); return 30 * 16 - window.__minY; });
  };
  await hush(56);
  const hLow = await jumpH();
  const wisps = await page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'wisp' && e.alive).length);
  check(wisps >= 2, `sobem fiapos de tinta das rachaduras (${wisps})`);
  await shot('c11-fiapos');
  const pop = await page.evaluate(() => { const w = window.__scene.enemies.find((e) => e.kind === 'wisp' && e.alive); return w ? [w.hit(0, 1, 'side'), w.alive] : null; });
  check(pop && pop[0] === 'hit' && pop[1] === false, `um golpe desfaz o fiapo (${JSON.stringify(pop)})`);
  // a rachadura fecha: gravidade normal, e depois de um tempo ela racha de novo
  await page.evaluate(() => { const b = window.__scene.boss; b.lowT = 0.01; });
  await waitGame(0.2);
  const shut = await page.evaluate(() => ({ mul: window.__scene.player.gravMul, cd: window.__scene.boss.fragCd }));
  check(shut.mul === 1 && shut.cd > 8, `a rachadura fecha e a gravidade volta, por um tempo (${JSON.stringify(shut)})`);
  const hNorm = await jumpH();
  check(hLow > hNorm * 1.25, `com a gravidade leve o pulo vai mais alto (${hLow.toFixed(0)} x ${hNorm.toFixed(0)} px)`);
  await page.evaluate(() => { window.__scene.boss.fragCd = 0.05; });
  await waitGame(0.3);
  const again = await page.evaluate(() => ({ mul: window.__scene.player.gravMul, low: window.__scene.boss.lowT }));
  check(again.mul === 0.6 && again.low > 6, `e a lembrança racha outra vez (${JSON.stringify(again)})`);
  await waitGame(0.6);
  const cap = await page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'wisp' && e.alive).length);
  check(cap <= 3, `nunca mais de três fiapos ao mesmo tempo (${cap})`);
  await idle().catch(() => {});
  // na segunda fase a pancada também abre cristais para trás e vêm cinco lascas
  await hush(40);
  await setP(52, 30, { inv: 99 });
  await page.evaluate(() => { window.__scene.boss.facing = 1; });
  await force('slam', { slam: 'return b.spikes.map((k) => k.x - b.zone.x);' });
  await reached('slamrec');
  rr = await rec();
  check((rr.probe.slam || []).some((d) => d < 0), `na segunda fase a pancada abre cristais para trás também (${(rr.probe.slam || []).length})`);
  await idle();
  await hush(54);
  await setP(36, 30, { inv: 99 });
  await force('throw', {}, ['if (b.shards.length) { window.__ns = b.shards.length; return true; }']);
  await until(() => window.__rec.ticks[0], null, 20000);
  check((await page.evaluate(() => window.__ns)) === 5, 'e cinco lascas');
  await idle();

  // derrota: o apito cai, a memória e a Picareta
  await hush(44);
  await setP(30, 30, { inv: 30, face: 1 });
  await page.evaluate(() => { window.__thoughts = []; window.__banners = []; const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  c = await C();
  const gm = await page.evaluate(() => window.__scene.player.gravMul);
  check(!c.alive && c.state === 'dead' && gm === 1, `derrotado, cai e a gravidade volta (${c.state}, ${gm})`);
  await waitGame(1.4);
  await shot('c12-derrota');
  await until(() => window.__scene.props.memories.some((m) => m.id === 'capataz:boss'), null, 20000);
  await until(() => window.__scene.weaponDrop && window.__scene.weaponDrop.ready, null, 20000);
  const drop = await page.evaluate(() => { const d = window.__scene.weaponDrop; return { id: d.id, x: d.x / 16 }; });
  check(drop.id === 'picareta', `a Picareta cai do lado dele (${JSON.stringify(drop)})`);
  await waitGame(0.3);
  await shot('c13-picareta');
  await page.evaluate(() => { const s = window.__scene; const d = s.weaponDrop; s.player.teleport(d.x, d.y + 16); });
  await until(() => window.__progress.hasWeapon('picareta'), null, 20000);
  await until(() => !window.__scene.cinematic, null, 20000);
  await waitGame(0.6);
  check(true, 'pegou a Picareta do Capataz');
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'capataz:boss'); s.player.teleport(m.x, m.y + 26); });
  await until(() => window.__progress.memories.has('capataz:boss'), null, 20000);
  await until(() => document.querySelector('#screen-end.show'), null, 40000);
  const end = await page.evaluate(() => document.querySelector('#screen-end').textContent);
  check(/quarto capítulo/.test(end), `fim do quarto capítulo (${end.replace(/\s+/g, ' ').slice(0, 80)})`);
  await shot('c14-fim-capitulo');
  await page.evaluate(() => document.querySelector('#screen-end [data-cmd="explore"]').click());
  await waitGame(0.6);

}

  if (part('picareta')) {
  // ---------- 6. a Picareta quebra o Âmbar do túnel ----------
  await setProgress(['boss:reflexo', 'boss:capataz', 'weapon:picareta']);
  await start('capataz', '1');
  await page.evaluate(() => window.__scene.player.setWeapon('scythe'));
  const plug0 = await page.evaluate(() => ({ n: window.__scene.mine.plugs.length, tile: window.__scene.level.tileAt(64 * 16 + 8, 29 * 16 + 8) }));
  check(plug0.n === 1 && plug0.tile >= 2, `o bloco de Âmbar tapa o túnel (${JSON.stringify(plug0)})`);
  await setP(62, 30, { face: 1, inv: 99 });
  await waitGame(0.3);
  await tap('KeyJ');
  await waitGame(0.6);
  const plug1 = await page.evaluate(() => window.__scene.mine.plugs.length);
  check(plug1 === 1, `com a foice o Âmbar só tilinta (${plug1})`);
  await page.evaluate(() => window.__scene.player.setWeapon('picareta'));
  await waitGame(0.3);
  await setP(62, 30, { face: 1, inv: 99 });
  await waitGame(0.3);
  await tap('KeyJ');
  await waitGame(0.8);
  const plug2 = await page.evaluate(() => ({ n: window.__scene.mine.plugs.length, tile: window.__scene.level.tileAt(64 * 16 + 8, 29 * 16 + 8), seen: [...window.__progress.seen].filter((k) => k.startsWith('amber')) }));
  check(plug2.n === 0 && plug2.tile < 2, `a Picareta quebra o bloco (${JSON.stringify(plug2)})`);
  await shot('c15-ambar-quebrado');
  // o registro do outro lado
  await setP(68, 30, { face: 1, inv: 99 });
  await waitGame(0.4);
  await hold('KeyW', 200);
  // a conversa pausa o jogo: espera no relógio de verdade
  await page.waitForTimeout(900);
  const talk = await page.evaluate(() => { const d = document.querySelector('#screen-talk'); return d && d.classList.contains('show') ? d.querySelector('.talk-name').textContent + ': ' + d.querySelector('.talk-text').textContent.slice(0, 70) : null; });
  check(!!talk, `lê o registro do outro lado do bloco (${talk})`);
  await shot('c16-registro');

}

    console.log(errs.slice(0, 20).join('\n') || 'sem erros no navegador');
  check(!errs.length, `sem erros (${errs.length})`);
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
})();
