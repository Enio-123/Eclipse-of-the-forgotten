// Testa a Área 7, as Torres Rúnicas: o portão do cais que sobe com o Barqueiro vencido, as passagens
// entre as nove salas nos dois sentidos (lados, de cima e de baixo, e as portas do pátio), as portas
// trancadas (runas e tranca por dentro), o Agrimensor na escada, uma foto de cada sala (T1) e a Capa de
// Luz: a relíquia no pilar, os três voos, os lumes que recarregam e as luzes no HUD (T2).
// uso: node torres.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8780/index.html';
// ONLY=links,portao roda só essas partes (portao, links, portas, agrimensor, fotos, voo)
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
      const st = await page.evaluate(() => { const s = window.__scene; return { room: s && s.room.id, p: s && { x: s.player.x / 16, y: s.player.body.bottom / 16, hp: s.player.hp, dead: s.player.dead } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 120) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const VALE = ['boss:cacador', 'boss:barqueiro', 'relic:swim'];
  const setProgress = (extra = [], abilities = ['wall', 'double', 'hook', 'veil', 'cape', 'swim']) => page.evaluate(([extra, abilities]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', ...abilities]);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', 'boss:reflexo', 'boss:capataz',
      'weapon:picareta', 'journal', ...extra]) p.seen.add(k);
    p.save();
  }, [extra, abilities]);
  const start = async (room, entry, from = 'door') => {
    await page.evaluate(([room, entry, from]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__trLog = window.__hrLog = null;
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
  const P = () => page.evaluate(() => { const s = window.__scene; const p = s.player; return { x: p.x / 16, bottom: p.body.bottom / 16, vy: p.body.velocity.y, hp: p.hp, dead: p.dead, room: s.room.id, ground: p.body.blocked.down }; });
  const clear = () => page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'boss' && e.vanish) e.vanish(); s.player.invuln = 99; });
  const arrived = async (want, timeout = 20000) => {
    await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, timeout).catch(() => null);
    await waitGame(1.2);
    return P();
  };

  if (part('portao')) {
    // ---------- 1. o portão do aqueduto no alto da escada do cais ----------
    await setProgress(['boss:cacador', 'relic:swim']);
    await start('cais', '1');
    const gate = () => page.evaluate(() => {
      const s = window.__scene;
      const g = s.fixtures.locks[0];
      const t = s.level.layer.getTileAt(97, 19, true);
      return { n: s.fixtures.locks.length, key: g && g.key, open: g && g.open, solid: !!(t && t.index >= 0 && t.collides) };
    });
    let k = await gate();
    check(k.n === 1 && k.key === 'boss:barqueiro' && !k.open && k.solid, `antes do Barqueiro o portão está fechado (${JSON.stringify(k)})`);
    await page.evaluate(() => { const s = window.__scene; if (s.boss) { s.boss.alive = false; s.boss.state = 'dead'; } window.__progress.seen.add('boss:barqueiro'); s.fixtures.openLocks('boss:barqueiro', true); });
    await waitGame(2.6);
    k = await gate();
    check(k.open && !k.solid, `com o Barqueiro vencido, o portão sobe (${JSON.stringify(k)})`);
    await page.evaluate(() => { const s = window.__scene; window.__oldPlayer = s.player; s.player.teleport(95 * 16, 22 * 16); s.player.invuln = 99; });
    await page.keyboard.down('KeyD');
    await until(() => window.__scene && window.__scene.room.id === 'escada', null, 20000).catch(() => null);
    await page.keyboard.up('KeyD');
    const r = await arrived('escada');
    check(r.room === 'escada' && r.ground && r.x < 12, `pelo portão aberto ele entra na Escada do Aqueduto (${r.room} x ${r.x.toFixed(1)} pés ${r.bottom.toFixed(1)})`);
    await start('cais', '1');
    k = await gate();
    check(k.open && !k.solid, `voltando ao cais, o portão continua aberto (${JSON.stringify(k)})`);
  }

  if (part('links')) {
    // ---------- 2. as passagens entre as salas, nos dois sentidos ----------
    await setProgress(VALE);
    const cross = async (room, entry, side, at, want, name) => {
      await start(room, entry);
      await clear();
      await page.evaluate(([side, at]) => {
        const s = window.__scene;
        const p = s.player;
        window.__oldPlayer = p;
        p.invuln = 99;
        if (side === 'right') { p.teleport(s.level.widthPx + 6, at * 16); p.body.setVelocity(200, 0); }
        else if (side === 'left') { p.teleport(-6, at * 16); p.body.setVelocity(-200, 0); }
        else if (side === 'up') { p.teleport(at * 16 + 8, 2 * 16); p.body.setVelocity(0, -900); }
        else { p.teleport(at * 16 + 8, s.level.heightPx + 4); p.body.setVelocity(0, 300); }
      }, [side, at]);
      const r = await arrived(want);
      check(r.room === want && r.ground, `${name}: ${room} -> ${want} (chegou em ${r.room}, x ${r.x.toFixed(1)}, pés ${r.bottom.toFixed(1)}${r.ground ? '' : ', no ar'})`);
    };
    await cross('cais', '1', 'right', 21, 'escada', 'cais pela direita');
    await cross('escada', '1', 'left', 77, 'cais', 'escada pela esquerda');
    await cross('escada', '1', 'right', 8, 'calha', 'escada pelo alto');
    await cross('calha', '1', 'left', 21, 'escada', 'calha pela esquerda');
    await cross('calha', '1', 'right', 21, 'patio', 'calha pela direita');
    await cross('patio', '1', 'left', 49, 'calha', 'pátio pela esquerda');
    await cross('experiencias', 'O0', 'left', 23, 'engrenagens', 'experiências pela ponte');
    await cross('engrenagens', '1', 'right', 101, 'experiencias', 'engrenagens pela ponte');
    await cross('engrenagens', '1', 'up', 35, 'trono', 'engrenagens pelo alto');
    await cross('trono', '1', 'down', 9, 'engrenagens', 'trono pela boca da escada');
    await page.evaluate(() => { window.__progress.seen.add('boss:vhalor'); });
    await cross('trono', '1', 'up', 86, 'coroacao', 'trono pelo alçapão');
    await cross('coroacao', '1', 'down', 46, 'trono', 'escadaria pela boca de baixo');
    await cross('coroacao', '1', 'up', 31, 'nucleo', 'escadaria pelo alto');
    await cross('nucleo', '1', 'down', 63, 'coroacao', 'núcleo pelo poço');
  }

  if (part('portas')) {
    // ---------- 3. as portas do pátio: o Arquivo aberto, as runas e a tranca por dentro ----------
    await setProgress(VALE);
    // atX: a coluna onde ele deve aparecer na sala de chegada (a porta certa, não só a sala certa)
    const door = async (room, entry, i, want, name, atX) => {
      await start(room, entry);
      await clear();
      await page.evaluate((i) => { const s = window.__scene; const d = s.fixtures.doors[i]; window.__oldPlayer = s.player; s.player.teleport(d.x, d.y); s.player.body.setVelocity(0, 0); s.player.invuln = 99; window.__th = []; const o = window.__ui.thought; window.__ui.thought = (t, ms) => { window.__th.push(t); return o.call(window.__ui, t, ms); }; }, i);
      await waitGame(0.4);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
      if (!want) {
        await waitGame(0.6);
        const r = await P();
        const th = await page.evaluate(() => window.__th.slice());
        check(r.room === room, `${name}: fica em ${r.room} (${th.join(' | ').slice(0, 90)})`);
        return;
      }
      const r = await arrived(want);
      check(r.room === want && r.ground && (atX === undefined || Math.abs(r.x - atX) < 1.5), `${name}: ${room} -> ${want} (chegou em ${r.room}, x ${r.x.toFixed(1)}, pés ${r.bottom.toFixed(1)})`);
    };
    // as portas do pátio, na ordem do mapa: 0 a do terraço (x 125), 1 a do Arquivo (x 36), 2 a grande porta (x 75)
    await door('patio', '1', 1, 'arquivo', 'porta do Arquivo', 6.5);
    await door('arquivo', 'O0', 0, 'patio', 'do Arquivo de volta ao pátio', 36.5);
    await door('patio', '1', 0, null, 'sem as runas, a porta das Experiências não abre');
    await door('patio', '1', 2, null, 'a grande porta não abre do pátio');
    await page.evaluate(() => { window.__progress.seen.add('runas:patio'); });
    await door('patio', '1', 0, 'experiencias', 'com as runas acesas, a porta das Experiências', 30.5);
    await door('experiencias', 'O0', 0, 'patio', 'das Experiências de volta ao terraço', 125.5);
    // a tranca da grande porta: de dentro, a primeira vez tira a tranca; depois a porta leva ao pátio
    await start('engrenagens', '1');
    await clear();
    await page.evaluate(() => { const s = window.__scene; const d = s.fixtures.doors[0]; s.player.teleport(d.x, d.y); s.player.body.setVelocity(0, 0); s.player.invuln = 99; });
    await waitGame(0.4);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(160);
    await page.keyboard.up('KeyW');
    await waitGame(0.6);
    const barred = await page.evaluate(() => window.__progress.seen.has('short:torre'));
    check(barred, 'de dentro da torre do meio, a tranca da grande porta sai');
    await door('engrenagens', '1', 0, 'patio', 'a grande porta, de dentro', 75.5);
    await door('patio', '1', 2, 'engrenagens', 'a grande porta, do pátio, depois da tranca', 12.5);
  }

  if (part('agrimensor')) {
    // ---------- 4. o Agrimensor no primeiro patamar da escada ----------
    await setProgress(VALE);
    await start('escada', '1');
    const sv = await page.evaluate(() => { const s = window.__scene; const n = s.npcs.list.find((n) => n.kind === 'surveyor'); return n ? { x: n.x / 16, y: n.y / 16 } : null; });
    check(!!sv && Math.abs(sv.x - 58.5) < 2, `o Agrimensor está no primeiro patamar da escada (${JSON.stringify(sv)})`);
  }

  if (part('fotos')) {
    // ---------- 5. uma foto de cada sala ----------
    await setProgress([...VALE, 'runas:patio', 'short:torre', 'boss:vhalor']);
    const spots = [['escada', '1', 40, 62], ['escada', '1', 110, 30], ['escada', '1', 155, 9], ['calha', '1', 40, 22], ['calha', '1', 105, 10],
      ['calha', '1', 156, 34], ['patio', '1', 30, 50], ['patio', '1', 110, 40], ['patio', '1', 141, 21], ['arquivo', 'O0', 12, 84],
      ['arquivo', 'O0', 32, 48], ['arquivo', 'O0', 40, 18], ['experiencias', 'O0', 40, 66], ['experiencias', 'O0', 14, 24],
      ['engrenagens', '1', 60, 102], ['engrenagens', 'O0', 12, 132], ['engrenagens', '1', 36, 10], ['trono', '1', 50, 40], ['trono', '1', 82, 22],
      ['coroacao', '1', 30, 60], ['nucleo', '1', 50, 44]];
    let i = 0;
    for (const [room, entry, x, y] of spots) {
      await start(room, entry);
      await clear();
      await page.evaluate(([x, y]) => { const s = window.__scene; s.player.teleport(x * 16 + 8, y * 16); s.player.body.setVelocity(0, 0); s.player.invuln = 99; s.cameras.main.centerOn(x * 16, y * 16 - 40); }, [x, y]);
      await waitGame(1.2);
      // sem o pisca da invulnerabilidade na foto (as salas estão sem inimigos)
      await page.evaluate(() => { window.__scene.player.invuln = 0; });
      await waitGame(0.1);
      await shot(`t1${String(i++).padStart(2, '0')}-${room}`);
    }
    check(true, `fotos das salas em ${OUT}`);
  }

  if (part('voo')) {
    // ---------- 6. a Capa de Luz ----------
    await setProgress(VALE);
    await start('calha', '1');
    await clear();
    const L = () => page.evaluate(() => {
      const s = window.__scene;
      const p = s.player;
      return { light: p.light, canFly: p.canFly, vy: p.body.velocity.y, ground: p.body.blocked.down, hud: s.registry.get('light'), max: s.registry.get('light-max'), used: window.__progress.seen.has('used:flight'),
        lumes: s.torres ? s.torres.lumes.map((l) => ({ off: Math.round(l.off * 10) / 10, k: Math.round(l.k * 100) / 100 })) : null };
    });
    const tap = async (sec) => { await page.keyboard.down('Space'); await waitGame(sec); await page.keyboard.up('Space'); };
    let st = await L();
    check(!st.canFly && st.light === 0 && st.max === 0 && st.lumes && st.lumes.length === 2, `sem a relíquia: sem voo, sem luzes no HUD e dois lumes na calha (${JSON.stringify(st)})`);
    // sem a Capa de Luz, o toque depois do pulo duplo não faz nada
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(40 * 16 + 8, 22 * 16); p.body.setVelocity(0, 0); });
    await waitGame(0.3);
    await tap(0.3);
    await waitGame(0.1);
    await tap(0.2);
    await waitGame(0.12);
    await page.keyboard.down('Space');
    await waitGame(0.08);
    st = await L();
    await page.keyboard.up('Space');
    check(!st.used && st.vy > -200, `sem a relíquia, o terceiro toque no ar não voa (vy ${Math.round(st.vy)})`);
    await until(() => window.__scene.player.body.blocked.down, null, 8000);
    // a relíquia no alto do pilar do vão grande
    const rel = await page.evaluate(() => { const r = window.__scene.props.relics.find((r) => r.kind === 'light'); return r ? { x: r.x / 16, y: r.y / 16 } : null; });
    check(!!rel && Math.abs(rel.x - 156.5) < 0.6 && Math.abs(rel.y - 34) < 0.6, `a Capa de Luz está no alto do pilar (${JSON.stringify(rel)})`);
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(156 * 16 + 8, 34 * 16); p.body.setVelocity(0, 0); });
    await until(() => window.__progress.abilities.has('light'), null, 8000).catch(() => null);
    await until(() => !window.__scene.cinematic && !window.__scene.player.frozen, null, 12000).catch(() => null);
    await waitGame(0.3);
    st = await L();
    check(st.canFly && st.light === 3 && st.hud === 3 && st.max === 3, `pegou a relíquia: três luzes no cavaleiro e no HUD (${JSON.stringify(st)})`);
    // pulo, pulo duplo e o primeiro voo
    await tap(0.3);
    await waitGame(0.1);
    await tap(0.2);
    await waitGame(0.12);
    await page.keyboard.down('Space');
    await waitGame(0.05);
    st = await L();
    check(st.light === 2 && st.vy < -250 && st.used, `depois do pulo duplo, o toque voa e gasta uma luz (luzes ${st.light}, vy ${Math.round(st.vy)})`);
    await waitGame(0.1);
    st = await L();
    check(st.hud === 2, `o HUD mostra as duas que restam (${st.hud})`);
    await page.keyboard.up('Space');
    await waitGame(0.15);
    await tap(0.15);
    await waitGame(0.12);
    await tap(0.15);
    st = await L();
    check(st.light === 0, `três voos e as luzes acabam (${st.light})`);
    await waitGame(0.1);
    await page.keyboard.down('Space');
    await waitGame(0.06);
    st = await L();
    await page.keyboard.up('Space');
    check(st.light === 0 && st.vy > -250, `sem luz, o toque não voa mais (vy ${Math.round(st.vy)})`);
    // o lume: cheio de tudo, ele passa e o lume fica; gasto, o lume enche e apaga, e acende de novo
    const lume = await page.evaluate(() => { const l = window.__scene.torres.lumes[0]; return { x: l.x, y: l.y }; });
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(156 * 16 + 8, 34 * 16); p.body.setVelocity(0, 0); });
    await until(() => window.__scene.player.body.blocked.down, null, 8000);
    await waitGame(0.2);
    await page.evaluate((l) => { const p = window.__scene.player; p.teleport(l.x, l.y + 20); p.body.setVelocity(0, -60); }, lume);
    await waitGame(0.05);
    st = await L();
    check(st.lumes[0].off <= 0 && st.light === 3, `com tudo cheio o lume fica aceso (${JSON.stringify(st.lumes[0])})`);
    await page.evaluate(() => { const p = window.__scene.player; p.light = 1; });
    await page.evaluate((l) => { const p = window.__scene.player; p.teleport(l.x, l.y + 20); p.body.setVelocity(0, -60); }, lume);
    await waitGame(0.05);
    st = await L();
    check(st.light === 3 && st.lumes[0].off > 3, `gasto, o lume enche as luzes e apaga (luzes ${st.light}, ${JSON.stringify(st.lumes[0])})`);
    await waitGame(4.2);
    st = await L();
    check(st.lumes[0].off <= 0 && st.lumes[0].k > 0.9, `e acende de novo (${JSON.stringify(st.lumes[0])})`);
    // no chão firme as luzes voltam
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(40 * 16 + 8, 22 * 16); p.body.setVelocity(0, 0); p.light = 0; });
    await until(() => window.__scene.player.body.blocked.down, null, 8000);
    await waitGame(0.1);
    st = await L();
    check(st.light === 3 && st.hud === 3, `no chão firme as três luzes voltam (${st.light}, HUD ${st.hud})`);
    // a luz vale em outra sala (o HUD continua lá)
    await start('patio', '1');
    st = await L();
    check(st.canFly && st.light === 3 && st.hud === 3 && st.max === 3, `em outra sala as luzes chegam cheias (${JSON.stringify({ light: st.light, hud: st.hud, max: st.max })})`);
    // foto do voo, perto do lume de cima
    await start('calha', '1');
    await clear();
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(172 * 16 + 8, 24 * 16); p.body.setVelocity(0, 0); p.invuln = 0; window.__scene.cameras.main.centerOn(172 * 16, 22 * 16); });
    // passado o instante de pular da beirada (coyote), o primeiro toque no ar é o pulo duplo; o segundo, o voo
    await waitGame(0.2);
    await tap(0.15);
    await waitGame(0.1);
    await page.keyboard.down('Space');
    await waitGame(0.07);
    await shot('t2-voo');
    await page.keyboard.up('Space');
    check(true, `foto do voo em ${OUT}/t2-voo.png`);
  }

  console.log(errs.join('\n') || 'sem erros');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
