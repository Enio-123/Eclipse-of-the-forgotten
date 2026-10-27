// Testa a Área 7, as Torres Rúnicas: o portão do cais que sobe com o Barqueiro vencido, as passagens
// entre as nove salas nos dois sentidos (lados, de cima e de baixo, e as portas do pátio), as portas
// trancadas (runas e tranca por dentro), o Agrimensor na escada, uma foto de cada sala (T1) e a Capa de
// Luz: a relíquia no pilar, os três voos, os lumes que recarregam e as luzes no HUD, as runas do pátio e
// o mar de nuvens, os frascos do Arquivo e a máquina da Torre das Engrenagens (T2); o Guarda da Coroação,
// a Vigia Rúnica e os Arquivados (T3); o Senhor de Vhalor (T4b) e o Cetro de Vhalor (T4a).
// uso: node torres.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8780/index.html';
// ONLY=links,portao roda só essas partes (portao, links, portas, agrimensor, fotos, voo, runas, nuvens,
// frascos, maquina, inimigos, cadeiras, vhalor, cetro)
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

  if (part('runas')) {
    // ---------- 7. as runas do pátio ----------
    await setProgress(VALE);
    await start('patio', '1');
    await clear();
    const R = () => page.evaluate(() => {
      const s = window.__scene;
      const T = s.torres;
      return { runes: T.runes.map((r) => ({ x: Math.round(r.x / 16 * 10) / 10, t: r.t === Infinity ? 'inf' : Math.round(r.t * 10) / 10 })), open: window.__progress.seen.has('runas:patio'),
        glyphs: T.doorGlyphs.map((g) => Math.round(g.alpha * 100) / 100), acesa: window.__progress.seen.has('thought:runa:acesa'), apagou: window.__progress.seen.has('thought:runa:apagou') };
    });
    // de pé do lado esquerdo da pedra, virado para ela, um golpe
    const hit = async (i) => {
      await page.evaluate((i) => { const s = window.__scene; const r = s.torres.runes[i]; const p = s.player; p.teleport(r.x - 22, r.y); p.body.setVelocity(0, 0); p.facing = 1; p.atkCd = 0; }, i);
      await waitGame(0.3);
      await page.keyboard.down('KeyJ');
      await waitGame(0.08);
      await page.keyboard.up('KeyJ');
      await waitGame(0.35);
    };
    let st = await R();
    check(st.runes.length === 4 && st.runes.every((r) => r.t === 0) && !st.open && st.glyphs.length === 5 && st.glyphs.every((a) => a === 0), `quatro runas apagadas e o batente apagado (${JSON.stringify(st)})`);
    await hit(0);
    st = await R();
    check(st.runes[0].t > 12 && st.runes.slice(1).every((r) => r.t === 0) && st.acesa, `o golpe acende a primeira runa (${JSON.stringify(st.runes)})`);
    await page.evaluate(() => { window.__scene.torres.runes[0].t = 0.3; });
    await waitGame(0.5);
    st = await R();
    check(st.runes[0].t === 0 && st.apagou && !st.open, `o tempo acaba e ela apaga (${JSON.stringify(st.runes[0])})`);
    for (let i = 0; i < 3; i++) await hit(i);
    st = await R();
    check(st.runes.slice(0, 3).every((r) => r.t > 9) && st.runes[3].t === 0 && !st.open, `três acesas ainda não abrem (${JSON.stringify(st.runes)})`);
    await hit(3);
    st = await R();
    check(st.open && st.runes.every((r) => r.t === 'inf'), `as quatro acesas juntas abrem a porta (${JSON.stringify(st)})`);
    await waitGame(2.6);
    st = await R();
    check(st.glyphs.every((a) => a > 0.8), `as runas do batente acendem (${st.glyphs.join(', ')})`);
    await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(116 * 16, 40 * 16); p.body.setVelocity(0, 0); p.facing = 1; s.cameras.main.centerOn(120 * 16, 36 * 16); });
    await waitGame(0.5);
    await shot('t2-runas');
    // a porta do terraço leva às Experiências
    await page.evaluate(() => { const s = window.__scene; const d = s.fixtures.doors[0]; window.__oldPlayer = s.player; s.player.teleport(d.x, d.y); s.player.body.setVelocity(0, 0); });
    await waitGame(0.4);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(160);
    await page.keyboard.up('KeyW');
    const r = await arrived('experiencias');
    check(r.room === 'experiencias', `pela porta do terraço ele entra nas Experiências (${r.room})`);
    await start('patio', '1');
    st = await R();
    check(st.open && st.runes.every((r) => r.t === 'inf') && st.glyphs.every((a) => a > 0.8), `de volta ao pátio, as runas continuam acesas (${JSON.stringify(st.runes)})`);
    // a magia e a flecha acendem também (a mesma entrada que a cena usa para elas)
    await setProgress(VALE);
    await start('patio', '1');
    const m = await page.evaluate(() => { const T = window.__scene.torres; const r = T.runes[1]; const hit = T.magicHit(new Phaser.Geom.Rectangle(r.x - 4, r.y - 16, 8, 8)); return { hit, t: r.t }; });
    check(m.hit && m.t > 13, `a magia acende a runa (${JSON.stringify(m)})`);
  }

  if (part('nuvens')) {
    // ---------- 8. o mar de nuvens ----------
    await setProgress(VALE);
    const seas = {};
    for (const [room, entry] of [['escada', '1'], ['calha', '1'], ['experiencias', 'O0'], ['nucleo', '1'], ['patio', '1']]) {
      await start(room, entry);
      seas[room] = await page.evaluate(() => window.__scene.torres.clouds.map((c) => [Math.round(c.sprite.x / 16), Math.round((c.sprite.x + c.sprite.width) / 16)]));
    }
    check(seas.calha.length === 2 && seas.escada.length >= 2 && seas.experiencias.length === 2 && seas.nucleo.length === 4 && seas.patio.length === 0, `nuvens embaixo das salas abertas, nenhuma no pátio (${JSON.stringify(seas)})`);
    // o poço do núcleo (a saída para baixo) fica sem nuvem
    const hole = seas.nucleo.some(([a, b]) => a <= 63 && b >= 63);
    check(!hole, 'o poço do núcleo fica sem nuvem');
    // cair nelas: um ponto de dano e de volta ao último chão firme
    await start('calha', '1');
    await clear();
    await page.evaluate(() => { const s = window.__scene; const p = s.player; p.invuln = 0; p.teleport(40 * 16 + 8, 22 * 16); p.body.setVelocity(0, 0); });
    await waitGame(0.4);
    const hp0 = (await P()).hp;
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(66 * 16 + 8, 46 * 16); p.body.setVelocity(0, 300); });
    await until(() => !window.__scene.respawning && window.__scene.player.body.blocked.down && window.__scene.player.body.bottom < 30 * 16, null, 8000).catch(() => null);
    const r = await P();
    check(r.hp === hp0 - 1 && r.bottom < 23 && Math.abs(r.x - 40.5) < 3, `quem cai nas nuvens volta ao chão firme com um ponto de dano (vida ${hp0} -> ${r.hp}, x ${r.x.toFixed(1)}, pés ${r.bottom.toFixed(1)})`);
    await page.evaluate(() => { const s = window.__scene; s.player.teleport(62 * 16, 40 * 16); s.player.invuln = 99; s.cameras.main.centerOn(70 * 16, 40 * 16); });
    await waitGame(0.6);
    await shot('t2-nuvens');
  }

  if (part('frascos')) {
    // ---------- 9. os frascos de Âmbar do Arquivo ----------
    await setProgress(VALE);
    await start('arquivo', 'O0');
    await clear();
    const jars = await page.evaluate(() => window.__scene.torres.jars.map((j) => ({ x: j.x / 16, y: j.y / 16 })));
    check(jars.length === 8, `oito frascos que brilham no Arquivo, quatro deles ao lado de um Arquivado (${JSON.stringify(jars)})`);
    await page.evaluate(() => { window.__said = []; const o = window.__ui.say; window.__ui.say = (n, t, ms) => { window.__said.push([n, t]); return o.call(window.__ui, n, t, ms); }; });
    for (let i = 0; i < jars.length; i++) {
      await page.evaluate((j) => { const p = window.__scene.player; p.teleport(j.x * 16 + 10, j.y * 16); p.body.setVelocity(0, 0); }, jars[i]);
      await waitGame(0.4);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
      await waitGame(0.3);
    }
    const said = await page.evaluate(() => window.__said.slice());
    const seen = await page.evaluate((n) => [...Array(n).keys()].map((i) => window.__progress.seen.has(`jar:arquivo:${i}`)), jars.length);
    check(said.length === 8 && said.every(([n]) => n === 'Uma voz no frasco') && new Set(said.map(([, t]) => t)).size === 8 && seen.every(Boolean), `cada frasco toca o seu eco (${said.map(([, t]) => t.slice(0, 24)).join(' | ')})`);
    await page.evaluate((j) => { const s = window.__scene; const p = s.player; p.teleport(j.x * 16 - 20, j.y * 16); p.invuln = 0; s.cameras.main.centerOn(j.x * 16, j.y * 16 - 30); }, jars[1]);
    await waitGame(0.6);
    await shot('t2-frasco');
  }

  if (part('maquina')) {
    // ---------- 10. a máquina da Torre das Engrenagens ----------
    await setProgress(VALE);
    await start('engrenagens', '1');
    await clear();
    const M = () => page.evaluate(() => {
      const T = window.__scene.torres;
      // cada par vizinho: a distância dos centros contra a soma das circunferências primitivas e o erro de
      // fase no contato (o dente de cima no vão da de baixo: fase de cima + fase de baixo = 0.34 + 0.84)
      const fr = (v) => ((v % 1) + 1) % 1;
      const mesh = T.gears.slice(1).map((g, i) => {
        const a = T.gears[i].img;
        const b = g.img;
        const na = Number(a.texture.key.slice(5));
        const nb = Number(b.texture.key.slice(5));
        const pa = fr(((Math.PI / 2 - a.rotation) * na) / (Math.PI * 2));
        const pb = fr(((-Math.PI / 2 - b.rotation) * nb) / (Math.PI * 2));
        const gap = Math.hypot(b.x - a.x, b.y - a.y) - ((na + nb) * 14) / (Math.PI * 2);
        return [Math.abs(gap), Math.abs(fr(pa + pb - 1.18 + 0.5) - 0.5), Math.sign(T.gears[i].w) !== Math.sign(g.w)];
      });
      return { gears: T.gears.map((g) => g.img.rotation), mesh, buckets: T.chain ? T.chain.buckets.map((b) => [Math.round(b.img.x), Math.round(b.img.y), b.full]) : [], vents: T.vents.length };
    });
    const m0 = await M();
    await waitGame(1.5);
    const m1 = await M();
    const turned = m0.gears.every((r, i) => Math.abs(m1.gears[i] - r) > 0.01);
    const moved = m0.buckets.filter((b, i) => b[1] !== m1.buckets[i][1]).length;
    const up = m1.buckets.filter((b) => b[2] && b[0] > 1000).length;
    const down = m1.buckets.filter((b) => !b[2] && b[0] < 930).length;
    check(m0.gears.length === 10 && turned, `as dez rodas giram (${m0.gears.length})`);
    const worst = (m, k) => Math.max(...m.mesh.map((e) => e[k]));
    check(m1.mesh.every((e) => e[0] < 0.01 && e[2]) && worst(m0, 1) < 0.01 && worst(m1, 1) < 0.01, `cada roda engrenada na de cima, girando ao contrário e com o dente no vão (fase ${worst(m0, 1).toFixed(4)} e ${worst(m1, 1).toFixed(4)} depois de 1.5 s)`);
    check(m1.buckets.length > 50 && moved > 50 && up > 20 && down > 20, `a corrente anda: cheios subindo, vazios descendo (${m1.buckets.length} baldes, ${moved} andaram, ${up} subindo, ${down} descendo)`);
    check(m1.vents === 5, `cinco canos de vapor (${m1.vents})`);
    await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(44 * 16, 88 * 16); p.invuln = 0; });
    await waitGame(1.4);
    await shot('t2-maquina');
  }

  // a entrada usada em cada sala nas partes dos inimigos
  const ENTRY = { escada: '1', calha: '1', patio: '1', arquivo: 'O0', experiencias: 'O0', engrenagens: '1', coroacao: '1', trono: '1' };
  // Os estados curtos (a trava da vigia, o feixe, a estocada) duram poucos quadros, e cada ida e volta até
  // a página demora: então o jogo fica parado enquanto o teste arma a cena, e freeze(condição) solta o jogo e
  // para de novo no quadro em que a condição (sobre a cena s e o inimigo e) passa a valer
  const pause = () => page.evaluate(() => window.__scene.sys.pause());
  const freeze = async (src, timeout = 12000) => {
    await page.evaluate((src) => {
      const s = window.__scene;
      const f = new Function('s', 'e', `return (${src});`);
      window.__frozen = false;
      const h = () => {
        if (!f(s, window.__foe)) return;
        s.events.off('postupdate', h);
        window.__frozen = true;
        s.sys.pause();
      };
      s.events.on('postupdate', h);
      s.sys.resume();
    }, src);
    return until(() => window.__frozen, null, timeout).then(() => true).catch(() => false);
  };
  const begin = async (room, kind, idx) => {
    await start(room, ENTRY[room]);
    await pause();
    return page.evaluate(([kind, idx]) => {
      const s = window.__scene;
      const keep = s.enemies.filter((e) => e.kind === kind)[idx];
      for (const e of s.enemies) if (e !== keep && e.alive && e.vanish) { const sp = e.vanish(); if (sp) sp.setVisible(false); }
      window.__foe = keep;
      window.__hurts = [];
      const proto = Object.getPrototypeOf(s.player);
      if (!proto.__logged) {
        proto.__logged = true;
        const orig = proto.hurt;
        proto.hurt = function (fx) { const r = orig.call(this, fx); if (r) (window.__hurts = window.__hurts || []).push([window.__scene.clock.toFixed(2), Math.round(fx), this.hp, window.__foe && window.__foe.state]); return r; };
      }
      return { x: keep.zone.x, y: keep.body.bottom };
    }, [kind, idx]);
  };
  const foe = () => page.evaluate(() => { const e = window.__foe; const p = window.__scene.player; return { st: e.state, x: e.zone.x, y: e.body.bottom, alive: e.alive, hp: p.hp, amber: window.__progress.amber, crouched: p.crouched, py: p.body.bottom, hurts: (window.__hurts || []).length }; });

  if (part('inimigos')) {
    // ---------- 11. os inimigos das Torres (T3) ----------
    await setProgress(VALE);
    const want = { escada: [1, 2, 0], calha: [1, 2, 0], patio: [2, 0, 0], arquivo: [0, 0, 4], experiencias: [1, 2, 4], engrenagens: [1, 2, 0], trono: [0, 0, 0], coroacao: [2, 0, 0] };
    const got = {};
    for (const room of Object.keys(want)) {
      await start(room, ENTRY[room]);
      got[room] = await page.evaluate(() => ['crownguard', 'watcher', 'archived'].map((k) => window.__scene.enemies.filter((e) => e.kind === k && e.alive).length));
    }
    check(Object.keys(want).every((r) => got[r].join() === want[r].join()), `cada sala com os seus (guardas, vigias, arquivados): ${JSON.stringify(got)}`);
    // --- o Guarda da Coroação (no pátio, no chão largo) ---
    await begin('patio', 'crownguard', 0);
    // de frente o escudo para; de cima, por baixo e pelas costas entra
    const blocks = await page.evaluate(() => {
      const e = window.__foe;
      e.facing = -1;
      const f = e.zone.x - 40;
      const b = e.zone.x + 40;
      const r = [e.hit(f, 0.01, 'side'), e.hit(f, 0.01, 'arrow')];
      e.state = 'guard';
      r.push(e.hit(f, 0.01, 'down'), e.hit(f, 0.01, 'low'));
      e.state = 'guard';
      r.push(e.hit(b, 0.01, 'side'));
      e.state = 'guard';
      return r;
    });
    check(blocks.join() === 'blocked,blocked,hit,hit,hit', `o escudo para o golpe e a flecha de frente; o de cima, o rasteiro e o das costas entram (${blocks.join(', ')})`);
    // a estocada: em pé ele é acertado; agachado, a ponta passa por cima
    const thrustAt = async (crouch) => {
      await begin('patio', 'crownguard', 0);
      await page.evaluate(() => { const s = window.__scene; const e = window.__foe; const p = s.player; p.teleport(e.zone.x - 84, e.body.bottom); p.body.setVelocity(0, 0); p.invuln = 0; p.hp = 5; e.facing = -1; e.state = 'guard'; e.atkCd = 0.3; });
      if (crouch) {
        await page.keyboard.down('KeyS');
        await freeze('s.player.crouched');
      }
      await freeze("e.state === 'thrust'");
      const a = await foe();
      await freeze("e.state === 'thrustrec'");
      const b = await foe();
      if (crouch) await page.keyboard.up('KeyS');
      return { a, b };
    };
    const stand = await thrustAt(false);
    check(stand.a.st === 'thrust' && stand.b.hp === 4, `de longe ele mira e estica a alabarda: em pé, acerta (${stand.a.st}, vida 5 -> ${stand.b.hp})`);
    const low = await thrustAt(true);
    check(low.a.st === 'thrust' && low.a.crouched && low.b.hp === 5, `agachado, a ponta passa por cima (${low.a.st}, agachado ${low.a.crouched}, vida ${low.b.hp})`);
    // o giro rente ao chão: em pé perto dele machuca; um pouco acima do chão (pulando), não
    await begin('patio', 'crownguard', 0);
    await page.evaluate(() => { const s = window.__scene; const e = window.__foe; const p = s.player; p.teleport(e.zone.x + 30, e.body.bottom); p.invuln = 99; e.facing = -1; e.state = 'guard'; e.atkCd = 0; e.behindT = 0; });
    await freeze("e.state === 'spin' && e.t > 0.12");
    const spin = await page.evaluate(() => {
      const e = window.__foe;
      const R = (dx, lift) => new Phaser.Geom.Rectangle(e.zone.x + dx - 7, e.body.bottom - 42 - lift, 14, 42);
      return { st: e.state, standL: e.harms(R(-46, 0), false), standR: e.harms(R(46, 0), false), jump: e.harms(R(46, 22), false), far: e.harms(R(80, 0), false) };
    });
    check(spin.st === 'spin' && spin.standL && spin.standR && !spin.jump && !spin.far, `pelas costas e perto, o giro pega dos dois lados rente ao chão; pulando passa por cima (${JSON.stringify(spin)})`);
    await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(window.__foe.zone.x, window.__foe.body.bottom - 30); });
    await shot('t3-guarda-giro');
    // aparar a estocada no fim do aviso: ele fica tonto e o golpe entra mais forte
    await begin('patio', 'crownguard', 0);
    await page.evaluate(() => { const s = window.__scene; const e = window.__foe; const p = s.player; p.teleport(e.zone.x - 84, e.body.bottom); p.invuln = 99; e.facing = -1; e.state = 'guard'; e.atkCd = 0; });
    await freeze("e.state === 'aim' && e.t > 0.45");
    await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(window.__foe.zone.x - 30, window.__foe.body.bottom - 30); });
    await shot('t3-guarda-mira');
    const parry = await page.evaluate(() => {
      const e = window.__foe;
      const box = new Phaser.Geom.Rectangle(e.zone.x - 40, e.body.bottom - 40, 30, 20);
      const ok = e.parry(box, e.zone.x - 60);
      const hp0 = e.hp;
      e.hit(e.zone.x - 60, 1, 'side');
      return { ok, st: e.state, dmg: +(hp0 - e.hp).toFixed(2) };
    });
    check(parry.ok && parry.st === 'stagger' && parry.dmg === 1.5, `aparar no fim do aviso deixa ele tonto, aberto e apanhando mais (${JSON.stringify(parry)})`);
    // vencido: conta no bestiário
    const gk = await page.evaluate(() => { const s = window.__scene; const e = window.__foe; e.hit(e.zone.x - 60, 99, 'side'); s.killed(e); return { alive: e.alive, kills: window.__progress.kills.get('crownguard') }; });
    check(!gk.alive && gk.kills === 1, `vencido, o guarda entra no bestiário (${JSON.stringify(gk)})`);

    // --- a Vigia Rúnica (na escada) ---
    const w = await begin('escada', 'watcher', 1);
    const spot = await page.evaluate(() => {
      const e = window.__foe;
      // um lugar no chão embaixo dela, de onde ela vê o cavaleiro
      for (const dx of [-60, 60, -90, 90, -30, 30]) {
        const x = e.pos.x + dx;
        const y = e.floorBelow(x, e.pos.y);
        if (y - e.pos.y < 220 && e.sees(x, y - 21)) return { x, y };
      }
      return null;
    });
    check(!!spot, `há um lugar no chão de onde a vigia vê o cavaleiro (${JSON.stringify(spot)} vigia ${JSON.stringify(w)})`);
    if (spot) {
      await page.evaluate((sp) => { const s = window.__scene; const p = s.player; p.teleport(sp.x, sp.y); p.body.setVelocity(0, 0); p.invuln = 0; p.hp = 5; window.__foe.cd = 0.2; }, spot);
      await freeze("e.state === 'fire' && e.t > 0.06");
      await page.evaluate(() => { const s = window.__scene; const c = s.cameras.main; const e = window.__foe; c.stopFollow(); c.centerOn((e.pos.x + s.player.x) / 2, (e.pos.y + s.player.body.bottom) / 2); });
      await shot('t3-vigia-feixe');
      // o feixe acerta no primeiro quadro: a vida já caiu
      const beam = await foe();
      check(beam.hp === 4 && beam.hurts === 1, `ela mira, trava e o feixe vai até ele parado (vida 5 -> ${beam.hp})`);
      // um golpe enquanto ela mira: a runa apaga, ela cai no chão, deita e depois sobe de volta
      await page.evaluate(() => { window.__scene.player.invuln = 99; });
      await freeze("e.state === 'aim' && e.t > 0.2");
      const fell = await page.evaluate(() => { const e = window.__foe; const y0 = e.pos.y; e.hit(window.__scene.player.x, 0.5, 'side'); return { st: e.state, y0, floor: e.floor }; });
      await freeze("e.state === 'down' && e.t > 0.4");
      const lying = await page.evaluate(() => { const e = window.__foe; return { st: e.state, y: e.pos.y, sq: +e.sprite.scaleY.toFixed(2), harms: e.harms(e.rect, false) }; });
      await page.evaluate(() => { const c = window.__scene.cameras.main; const e = window.__foe; c.stopFollow(); c.centerOn(e.pos.x, e.pos.y - 40); });
      await shot('t3-vigia-caida');
      check(fell.st === 'fall' && lying.st === 'down' && Math.abs(lying.y - (fell.floor - 4)) < 1 && lying.sq < 0.4 && !lying.harms, `golpeada enquanto mira, ela cai, deita no chão e não machuca (${JSON.stringify({ fell, lying })})`);
      await freeze("e.state === 'idle'");
      const back = await page.evaluate(() => { const e = window.__foe; return { st: e.state, dy: +Math.abs(e.pos.y - e.home.y).toFixed(1), sq: e.sprite.scaleY }; });
      check(back.st === 'idle' && back.dy < 4 && back.sq > 0.95, `depois ela sobe de volta para o lugar (${JSON.stringify(back)})`);
    }

    // --- os Arquivados (no Arquivo) ---
    await setProgress(VALE);
    await page.evaluate(() => { const p = window.__progress; p.powers = new Set(['lembranca']); p.power = 'lembranca'; p.amber = 3; p.save(); });
    await begin('arquivo', 'archived', 2);
    await page.evaluate(() => { const s = window.__scene; const e = window.__foe; const p = s.player; p.teleport(e.zone.x + 60, e.body.bottom); p.body.setVelocity(0, 0); p.invuln = 0; p.hp = 5; });
    // ele sente o cavaleiro perto e vem de braços estendidos; o toque leva uma conta e não a vida
    await freeze('window.__progress.amber < 2.5 && e.t > 0.1', 16000);
    const t1 = await foe();
    await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(window.__foe.zone.x, window.__foe.body.bottom - 30); });
    await shot('t3-arquivado-toque');
    check(Math.abs(t1.amber - 2) < 0.01 && t1.hp === 5 && t1.st === 'drain', `o toque de um Arquivado leva uma conta de Âmbar e não abre rachadura (Âmbar 3 -> ${t1.amber.toFixed(2)}, vida ${t1.hp}, ${t1.st})`);
    // sem uma conta inteira, o toque machuca
    await page.evaluate(() => { const p = window.__progress; p.amber = 0.4; window.__scene.registry.set('amber', 0.4); const pl = window.__scene.player; pl.sapT = 0; pl.invuln = 0; pl.hp = 5; const e = window.__foe; pl.teleport(e.zone.x + 12, e.body.bottom); });
    await freeze('s.player.hp < 5');
    const t2 = await foe();
    check(t2.hp === 4 && Math.abs(t2.amber - 0.4) < 0.01, `sem uma conta inteira, o toque machuca (vida 5 -> ${t2.hp}, Âmbar ${t2.amber.toFixed(2)})`);
    // deslizando, ele passa por baixo dos braços
    const slide = await page.evaluate(() => { const e = window.__foe; const R = new Phaser.Geom.Rectangle(e.zone.x - 7, e.body.bottom - 26, 14, 26); return e.harms(R, true); });
    check(!slide, 'deslizando, o cavaleiro passa por baixo dos braços');
    // vencido: deita, a luz volta para o frasco mais perto e o corpo some
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; s.player.teleport(window.__foe.zone.x + 40, window.__foe.body.bottom); const e = window.__foe; e.hit(e.zone.x + 30, 99, 'side'); s.killed(e); });
    await freeze('s.torres.jars.some((j) => j.flare > 0.5)', 8000);
    const jar = await page.evaluate(() => ({ flare: +Math.max(...window.__scene.torres.jars.map((j) => j.flare)).toFixed(2), kills: window.__progress.kills.get('archived'), alive: window.__foe.alive }));
    check(!jar.alive && jar.flare > 0.5 && jar.kills === 1, `vencido, a luz dele sobe para um frasco, que acende (${JSON.stringify(jar)})`);
    await freeze('!e.sprite.active || e.sprite.alpha < 0.05', 8000);
    const gone = await page.evaluate(() => !window.__foe.sprite.active || window.__foe.sprite.alpha < 0.05);
    check(gone, 'e o corpo some (volta para a estante)');
    await page.evaluate(() => window.__scene.sys.resume());
  }

  if (part('cadeiras')) {
    // ---------- 12. a Sala das Experiências: as cadeiras, as coroas e o tanque ----------
    await setProgress(VALE);
    await start('experiencias', ENTRY.experiencias);
    await pause();
    const row = await page.evaluate(() => {
      const s = window.__scene;
      const t = s.torres;
      const arch = s.enemies.filter((e) => e.kind === 'archived');
      return { arch: arch.map((e) => [Math.round(e.zone.x), e.state, e.facing, e.chair, e.v, e.harms(e.rect, false)]), chairs: t.chairs.length, free: t.chairs.filter((c) => c.free).length, tank: !!t.tank, cables: s.textures.exists('exp-cables-experiencias'), jars: t.jars.length };
    });
    check(row.arch.length === 4 && row.arch.every((a, i) => a[1] === 'seated' && a[2] === -1 && a[3] === i && !a[5]) && row.chairs === 4 && row.free === 0 && row.tank && row.cables, `quatro Arquivados sentados nas cadeiras, de coroa, virados para a porta, sem machucar; os cabos e o tanque desenhados (${JSON.stringify(row)})`);
    check(new Set(row.arch.map((a) => a[4])).size === 2, `os dois corpos aparecem misturados na fila (${row.arch.map((a) => a[4]).join(', ')})`);
    // chegando perto do primeiro, só ele levanta: a coroa fica na haste, atrás do corpo
    const p0 = row.arch[0];
    await page.evaluate((x) => { const s = window.__scene; const p = s.player; p.teleport(x - 60, p.body.bottom); p.body.setVelocity(0, 0); p.invuln = 99; window.__foe = s.enemies.filter((e) => e.kind === 'archived')[0]; }, p0[0]);
    await freeze("e.state === 'getup' && e.t > 0.25");
    await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(window.__foe.zone.x + 40, window.__foe.body.bottom - 40); });
    await shot('t3-cadeiras');
    const up = await page.evaluate(() => {
      const s = window.__scene;
      const c = s.torres.chairs[0];
      return { st: s.enemies.filter((e) => e.kind === 'archived').map((e) => e.state), free: s.torres.chairs.map((q) => q.free), behind: c.crown.depth < window.__foe.sprite.depth, depth: [c.crown.depth, window.__foe.sprite.depth] };
    });
    check(up.st[0] === 'getup' && up.st.slice(1).every((x) => x === 'seated') && up.free.join() === 'true,false,false,false' && up.behind, `chegando perto, só o primeiro levanta e a coroa dele fica na cadeira, atrás do corpo (${JSON.stringify(up)})`);
    await freeze("e.state === 'chase' || e.state === 'reach'");
    const after = await foe();
    check(after.st === 'chase' || after.st === 'reach', `de pé, ele vem atrás do cavaleiro (${after.st})`);
    // a coroa pendurada balança até parar na vertical e vai apagando
    await freeze('s.torres.chairs[0].swing > 2.6');
    const hang = await page.evaluate(() => { const c = window.__scene.torres.chairs[0]; return { rot: +c.crown.rotation.toFixed(3), dim: +c.dim.toFixed(2) }; });
    check(Math.abs(hang.rot) < 0.03 && hang.dim > 0.9, `a coroa solta balança até parar de pé na haste e apaga (${JSON.stringify(hang)})`);
    // vencido, a luz dele vai pelo ar até o tanque, que clareia
    await page.evaluate(() => { const s = window.__scene; const e = window.__foe; e.hit(e.zone.x + 30, 99, 'side'); s.killed(e); });
    await freeze('s.torres.tank.flare > 0.5', 8000);
    const tank = await page.evaluate(() => ({ flare: +window.__scene.torres.tank.flare.toFixed(2), alive: window.__foe.alive }));
    check(!tank.alive && tank.flare > 0.5, `vencido, a luz dele volta para o tanque (${JSON.stringify(tank)})`);
    // de longe, sem levantar: o último afunda na cadeira, a coroa solta e a luz também vai para o tanque
    await page.evaluate(() => { const s = window.__scene; s.torres.tank.flare = 0; const e = s.enemies.filter((q) => q.kind === 'archived')[3]; window.__foe = e; e.hit(e.zone.x - 200, 99, 'side'); s.killed(e); });
    await freeze('s.torres.tank.flare > 0.5', 8000);
    const far = await page.evaluate(() => { const s = window.__scene; return { flare: +s.torres.tank.flare.toFixed(2), alive: window.__foe.alive, free: s.torres.chairs[3].free, seated: s.enemies.filter((q) => q.kind === 'archived').slice(1, 3).map((q) => q.state) }; });
    check(!far.alive && far.free && far.flare > 0.5 && far.seated.join() === 'seated,seated', `vencido ainda sentado, a coroa solta e a luz vai para o tanque; os outros continuam sentados (${JSON.stringify(far)})`);
    await page.evaluate(() => window.__scene.sys.resume());
  }

  if (part('vhalor')) {
    // ---------- 13. o Senhor de Vhalor (T4) ----------
    await setProgress(VALE);
    await start('trono', ENTRY.trono);
    await pause();
    const look = (x, y) => page.evaluate(([x, y]) => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(x, y); }, [x, y]);
    const hall = await page.evaluate(() => {
      const s = window.__scene;
      const h = s.torres.throne;
      const b = s.boss;
      const L = s.level;
      const plank = (x, y) => { const t = L.layer.getTileAt(x, y); return !!(t && t.collides); };
      window.__foe = b;
      return {
        boss: b && b.kind, sleeping: b && b.sleeping, facing: b && b.facing,
        rail: [h.rail.x0, h.rail.x1, h.rail.y], dais: [h.daisX, h.daisY, h.floorY, h.wallX],
        runes: h.runes.map((r) => [r.x, r.y, r.h]), lustre: h.lustre,
        steps: s.torres.steps.map((st) => [st.y, st.up, Math.round(st.plate.angle)]),
        stepPhys: [22, 15, 8].map((y) => plank(87, y)), lustrePhys: plank(77, 29), trap: s.fixtures.trapdoors.map((t) => t.open),
      };
    });
    check(hall.boss === 'boss' && hall.sleeping && hall.facing === -1, `o Senhor de Vhalor dorme no trono, virado para o salão (${JSON.stringify([hall.boss, hall.sleeping, hall.facing])})`);
    check(hall.steps.length === 3 && hall.steps.every((st) => !st[1] && st[2] === -90) && hall.stepPhys.every((v) => !v) && hall.lustrePhys && hall.trap.join() === 'false',
      `antes da luta: os três degraus pendurados na dobradiça e sem chão, o lustre firme e o alçapão fechado (${JSON.stringify({ steps: hall.steps, phys: hall.stepPhys, lustre: hall.lustrePhys, trap: hall.trap })})`);
    const under = hall.runes.filter((r) => hall.lustre && r[0] + 13 > hall.lustre.x0 && r[0] - 13 < hall.lustre.x1);
    check(!!hall.lustre && under.length === 1 && under[0][2] === under[0][1] - hall.lustre.bottom - 1 && hall.runes.filter((r) => !under.includes(r)).every((r) => r[2] === 74),
      `as runas do chão: a coluna da que fica embaixo do lustre para nas lâmpadas, as outras sobem inteiras (${JSON.stringify({ lustre: hall.lustre, runes: hall.runes })})`);
    check(hall.rail[1] + 8 < hall.lustre.x0 + 3, `a calha do teto (com a ponta) acaba antes das correntes do lustre (calha até ${hall.rail[1]}, lustre de ${hall.lustre.x0})`);
    await look(1290, 430);
    await shot('t4-trono-dormindo');

    // passando da coluna do aviso, a grade fecha atrás e ele acorda (o Cetro bate no estrado)
    await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(26 * 16, 40 * 16); p.body.setVelocity(0, 0); p.invuln = 99; });
    await freeze("e.state === 'wake'");
    await freeze("e.state === 'idle'");
    const woke = await page.evaluate(() => {
      const s = window.__scene;
      const t = s.level.layer.getTileAt(17, 37);
      return { st: window.__foe.state, gate: !!(t && t.collides), bar: window.__ui && true };
    });
    check(woke.st === 'idle' && woke.gate, `passando da entrada, a grade fecha e ele acorda (${JSON.stringify(woke)})`);
    // o que cada ataque faz: o jogo fica parado e o teste dispara o golpe que quer
    const attack = (a, px, py) => page.evaluate(([a, px, py]) => {
      const s = window.__scene;
      const b = window.__foe;
      const p = s.player;
      p.teleport(px, py);
      p.body.setVelocity(0, 0);
      p.invuln = 99;
      b.toIdle(0);
      b.startAttack(a);
      return b.state;
    }, [a, px, py]);
    const R = (x, bottom, h = 42) => `new Phaser.Geom.Rectangle(${x} - 7, ${bottom} - ${h}, 14, ${h})`;
    const harmsAt = (rects) => page.evaluate((rects) => rects.map((src) => window.__foe.harms(new Function(`return ${src}`)(), false)), rects);

    // o cabo do teto: a luz corre pela calha até o bocal em cima do cavaleiro; o cabo desce e bate
    await attack('lash', 600, 640);
    await freeze('e.lashes.length && e.lashes[0].stage === 0 && e.lashes[0].t > 0.45');
    await look(640, 540);
    await shot('t4-cabo-aviso');
    await freeze('e.lashes.length && e.lashes[0].stage === 2');
    const lash = await page.evaluate(() => window.__foe.lashes[0].x);
    const lh = await harmsAt([R(lash, 640), R(lash + 40, 640)]);
    await shot('t4-cabo-teto');
    check(lh[0] && !lh[1], `o cabo do teto desce onde o bocal acendeu e machuca embaixo dele, não do lado (${lh.join(', ')} em x ${Math.round(lash)})`);

    // o cabo do chão sai da grade do estrado e varre o salão: em pé machuca, pulando passa
    await freeze('!e.lashes.length');
    await attack('sweep', 900, 640);
    await freeze("e.whip && !e.whip.back && e.whip.head < 980");
    const head = await page.evaluate(() => window.__foe.whip.head);
    const sw = await harmsAt([R(head + 14, 640), R(head + 14, 640 - 24)]);
    await look(980, 560);
    await shot('t4-cabo-chao');
    check(sw[0] && !sw[1], `a ponta do cabo do chão corre rente ao chão: em pé pega, pulando passa por cima (${sw.join(', ')})`);
    await freeze('!e.whip');

    // as runas do chão: uma sim, uma não; a coluna de luz pega quem está em cima e não quem está na apagada
    await attack('rune', 700, 640);
    await freeze('e.bursts.some((b) => e.burstOn(b))');
    const rn = await page.evaluate(() => {
      const b = window.__foe;
      const on = b.bursts.filter((q) => b.burstOn(q)).map((q) => q.i);
      const R = b.hall.runes;
      const lit = R[on[0]];
      const off = R.find((r, i) => !on.includes(i) && r.y === lit.y);
      const rect = (r) => new Phaser.Geom.Rectangle(r.x - 7, r.y - 42, 14, 42);
      return { n: on.length, total: R.length, lit: b.harms(rect(lit), false), off: off ? b.harms(rect(off), false) : null };
    });
    await look(800, 560);
    await shot('t4-runas');
    check(rn.lit && rn.off === false && (rn.n === Math.ceil(rn.total / 2) || rn.n === Math.floor(rn.total / 2)), `as runas acendem uma sim, uma não: em cima da acesa machuca, na apagada não (${JSON.stringify(rn)})`);
    await freeze("e.state === 'idle'");

    // os ecos: a luz desce da coroa e nascem dois guardas de luz, um de cada lado do cavaleiro
    await attack('summon', 760, 640);
    await freeze("s.enemies.filter((q) => q.kind === 'echo' && q.alive).length === 2", 8000);
    const ec = await page.evaluate(() => {
      const s = window.__scene;
      const es = s.enemies.filter((q) => q.kind === 'echo' && q.alive);
      return { n: es.length, xs: es.map((q) => Math.round(q.zone.x)), sides: es.map((q) => Math.sign(q.zone.x - s.player.x)), born: es.map((q) => q.born > 0) };
    });
    await freeze("s.enemies.filter((q) => q.kind === 'echo' && q.alive).every((q) => q.born <= 0)", 6000);
    await look(760, 560);
    await shot('t4-ecos');
    check(ec.n === 2 && ec.sides.includes(-1) && ec.sides.includes(1), `ele chama dois ecos de guarda, um de cada lado (${JSON.stringify(ec)})`);
    // um eco vencido se desfaz em luz e não conta como guarda vencido
    const ek = await page.evaluate(() => {
      const s = window.__scene;
      const e = s.enemies.find((q) => q.kind === 'echo' && q.alive);
      const k0 = window.__progress.kills.get('crownguard') || 0;
      e.hit(e.zone.x - 30, 99, 'down');
      s.killed(e);
      return { alive: e.alive, kills: (window.__progress.kills.get('crownguard') || 0) - k0, echoKills: window.__progress.kills.get('echo') || 0 };
    });
    check(!ek.alive && ek.kills === 0 && ek.echoKills === 0, `um eco vencido se desfaz e não entra no bestiário (${JSON.stringify(ek)})`);
    await page.evaluate(() => { for (const e of window.__scene.enemies) if (e.kind === 'echo' && e.alive) e.vanish(); });

    // no lustre só a runa do Cetro alcança: ele aponta, trava e o feixe vai até o cavaleiro
    const perch = await page.evaluate(() => {
      const s = window.__scene;
      const b = window.__foe;
      const L = b.hall.lustre;
      s.player.teleport(L.x0 + 40, L.y);
      s.player.body.setVelocity(0, 0);
      b.toIdle(0);
      const n = {};
      for (let i = 0; i < 200; i++) { const a = b.choose(); n[a] = (n[a] || 0) + 1; }
      return n;
    });
    check((perch.bolt || 0) > 120 && !perch.bash && !perch.sweep && !perch.lash, `com o cavaleiro no lustre ele escolhe a runa do Cetro (${JSON.stringify(perch)})`);
    await page.evaluate(() => { const s = window.__scene; const b = window.__foe; s.player.invuln = 0; s.player.hp = 5; b.toIdle(0); b.startAttack('bolt'); });
    await freeze("e.state === 'boltaim' && e.t > 0.6");
    await look(1250, 480);
    await shot('t4-cetro-mira');
    await freeze("e.state === 'bolt'");
    await freeze("e.state === 'bolt' && e.t > 0.05");
    await shot('t4-cetro-feixe');
    const bolt = await foe();
    check(bolt.hp === 4, `a runa do Cetro acerta quem está no lustre (vida 5 -> ${bolt.hp})`);
    // o feixe para na primeira pedra: atrás da beirada do estrado, no chão do salão, ele não chega
    const shield = await page.evaluate(() => {
      const s = window.__scene;
      const b = window.__foe;
      s.player.teleport(b.hall.daisX - 20, b.hall.floorY);
      const h = b.boltHead();
      const p = s.player;
      const d = Math.hypot(p.x - h.x, p.body.center.y - h.y);
      b.aimDir = b.forward({ x: (p.x - h.x) / d, y: (p.body.center.y - h.y) / d });
      const end = b.cast(h);
      return { end: [Math.round(end.x), Math.round(end.y)], short: Math.hypot(end.x - h.x, end.y - h.y) < d - 10 };
    });
    check(shield.short, `colado no estrado, embaixo da beirada, a pedra segura o feixe (${JSON.stringify(shield)})`);
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; s.player.hp = 5; });
    await freeze("e.state === 'idle'");

    // a pancada de perto: aparada no fim da preparação, ele fica tonto e o golpe entra uma vez e meia
    await attack('bash', 1384 - 60, 544);
    await freeze("e.state === 'bashwind' && e.t > 0.45");
    await look(1330, 500);
    await shot('t4-pancada');
    const bp = await page.evaluate(() => {
      const b = window.__foe;
      const c = b.cetroBox() || b.bashBox();
      const ok = b.parry(new Phaser.Geom.Rectangle(c.x, c.y, 20, 20), b.x - 60);
      const hp0 = b.hp;
      b.hit(b.x - 60, 1, 'side');
      return { ok, st: b.state, dmg: +(hp0 - b.hp).toFixed(2) };
    });
    check(bp.ok && bp.st === 'stagger' && bp.dmg === 1.5, `aparar a pancada deixa ele tonto e o golpe entra mais forte (${JSON.stringify(bp)})`);
    await freeze("e.state === 'idle'");

    // ---------- na metade da vida: o pistão do estrado ergue o trono ----------
    const p2 = await page.evaluate(() => {
      const s = window.__scene;
      const b = window.__foe;
      s.player.teleport(700, 640);
      s.player.body.setVelocity(0, 0);
      s.player.invuln = 99;
      b.toIdle(0);
      b.hp = b.maxHp * 0.5 + 0.5;
      b.hit(b.x - 60, 1, 'side');
      return { phase2: b.phase2, hp: b.hp };
    });
    await freeze("e.state === 'rise' && e.t > 0.8");
    await look(1300, 460);
    await shot('t4-pistao');
    await freeze("e.state === 'idle' && e.lift >= 80");
    const up = await page.evaluate(() => {
      const s = window.__scene;
      const b = window.__foe;
      const tally = (px, py) => {
        s.player.teleport(px, py);
        const n = {};
        for (let i = 0; i < 200; i++) { const a = b.choose(); n[a] = (n[a] || 0) + 1; }
        return n;
      };
      const r = { lift: b.lift, hang: +b.hangT.toFixed(2), floor: tally(700, 640), dais: tally(1290, 544) };
      s.player.teleport(700, 640);
      return r;
    });
    check(p2.phase2 && up.lift === 80 && up.hang > 6, `na metade da vida o pistão ergue o trono ${up.lift} px e ele fica ${up.hang} s lá em cima (${JSON.stringify(p2)})`);
    check(!up.floor.bash && !up.floor.sweep && !up.floor.bolt && !up.floor.summon && up.floor.cage > 0 && !up.dais.bash && !up.dais.sweep && !up.dais.lash && !up.dais.cage,
      `lá de cima: no chão do salão o cerco, os cabos e as runas; no estrado só as runas e o Cetro (${JSON.stringify({ chao: up.floor, estrado: up.dais })})`);

    // o cerco: dois cabos descem da calha como pilares e correm um contra o outro; o dash passa por dentro
    await attack('cage', 700, 640);
    await freeze('e.pillars.length === 2 && e.pillars.every((q) => q.drop >= 1) && e.pillars[1].x - e.pillars[0].x < 380');
    const cg = await page.evaluate(() => window.__foe.pillars.map((q) => Math.round(q.x)));
    const ch = await harmsAt([R(cg[0], 640), R(cg[1], 640), R((cg[0] + cg[1]) / 2, 640), R(cg[0], 640 - 50)]);
    await look(700, 470);
    await shot('t4-cerco');
    check(ch[0] && ch[1] && !ch[2] && ch[3], `o cerco: os pilares vão da calha ao chão (pulando não passa) e o meio ainda não machuca (${JSON.stringify({ x: cg, harms: ch })})`);
    await page.evaluate((x0) => {
      const p = window.__scene.player;
      p.teleport(x0 + 40, 640);
      p.body.setVelocity(0, 0);
      p.invuln = 0;
      p.hp = 5;
      p.startDash(-1, true);
    }, cg[0]);
    await freeze('!s.player.ghost', 4000);
    const out = await page.evaluate(() => { const s = window.__scene; const q = window.__foe.pillars[0]; return { x: Math.round(s.player.x), hp: s.player.hp, pillar: q ? Math.round(q.x) : null }; });
    check(out.hp === 5 && out.pillar !== null && out.x < out.pillar - 8, `o dash atravessa o pilar sem machucar e sai do cerco (${JSON.stringify(out)})`);
    await page.evaluate(() => { const p = window.__scene.player; p.invuln = 99; p.teleport(700, 640); p.body.setVelocity(0, 0); });
    if (!(await freeze("!e.pillars.length && e.state === 'idle'", 20000))) console.log('aviso: o cerco não terminou a tempo');

    // o tempo lá em cima acaba: o pistão chia, o trono cai, a onda corre pelo estrado e pelo chão e o teto solta pedras
    await page.evaluate(() => { const b = window.__foe; b.hangT = 0; b.thinkT = 0; });
    await freeze("e.state === 'fallwarn'");
    await freeze("e.state === 'fall' && e.t > 0.12");
    const crush = await harmsAt([R(1395, 544), R(1300, 544)]);
    check(crush[0] && !crush[1], `embaixo do trono caindo machuca; do lado, não (${crush.join(', ')})`);
    await freeze('e.waves.length === 2');
    // onde o cavaleiro estava na hora da queda (é em cima dele que uma pedra solta)
    const atSlam = await page.evaluate(() => window.__scene.player.x);
    const wv = await page.evaluate(() => window.__foe.waves.map((w) => [Math.round(w.x), w.y, w.dir, Math.round(w.lo), Math.round(w.hi)]));
    await freeze('e.rocks.length >= 3', 4000);
    const rk = await page.evaluate((px) => { const b = window.__foe; const r = b.hall.rail; return { xs: b.rocks.map((q) => Math.round(q.x)), lo: r.x0 + 20, hi: r.x1 - 26, px: Math.round(px) }; }, atSlam);
    check(wv.length === 2 && wv.some((w) => w[1] === 544) && wv.some((w) => w[1] === 640) && wv.every((w) => w[2] === -1),
      `o trono caiu: uma onda corre pelo estrado e outra pelo chão do salão, para longe do trono (${JSON.stringify(wv)})`);
    check(rk.xs.length >= 3 && rk.xs.every((x) => x >= rk.lo && x <= rk.hi) && rk.xs.some((x) => Math.abs(x - rk.px) < 30),
      `as pedras soltam só em volta da calha, uma em cima do cavaleiro (${JSON.stringify(rk)})`);
    await freeze('e.rocks.some((r) => r.falling && r.y > 400)', 4000);
    await look(820, 470);
    await shot('t4-queda');
    await freeze('e.waves.some((w) => w.y === 640 && w.x < 1000)', 4000);
    const fw = await page.evaluate(() => Math.round(window.__foe.waves.find((w) => w.y === 640).x));
    const wh = await harmsAt([R(fw, 640), R(fw, 640 - 24)]);
    check(wh[0] && !wh[1], `a onda do chão pega quem está em pé e passa embaixo de quem pula (${wh.join(', ')} em x ${fw})`);
    await freeze('e.rocks.some((r) => r.falling && r.y > 612)', 4000);
    const rh = await page.evaluate(() => { const b = window.__foe; const r = b.rocks.find((q) => q.falling && q.y > 612); return b.harms(new Phaser.Geom.Rectangle(r.x - 7, 640 - 42, 14, 42), false); });
    check(rh, `a pedra caindo machuca quem está embaixo dela (${rh})`);

    // vencido lá em cima: o pistão solta, o trono desce até o estrado e o Âmbar toma o corpo inteiro
    await freeze("e.state === 'idle' && !e.rocks.length && !e.waves.length", 8000);
    await page.evaluate(() => { const b = window.__foe; b.groundT = 0; b.thinkT = 0; });
    await freeze("e.state === 'idle' && e.lift >= 80");
    await page.evaluate(() => { const s = window.__scene; const b = window.__foe; s.player.teleport(1180, 640); s.player.body.setVelocity(0, 0); b.hp = 0.5; b.hit(b.x - 60, 1, 'side'); });
    await freeze('e.deadT > 0.4');
    const down = await page.evaluate(() => { const b = window.__foe; return { lift: b.lift, st: b.state, alive: b.alive, seen: window.__progress.seen.has('boss:vhalor') }; });
    check(down.lift === 0 && down.st === 'dead' && !down.alive && down.seen, `vencido lá em cima, o trono desce até o estrado (${JSON.stringify(down)})`);
    await freeze('e.deadT > 2.0');
    await look(1330, 470);
    await shot('t4-estatua');
    await freeze('e.crumbled && e.deadT > 3.5');
    const emptied = await page.evaluate(() => { const b = window.__foe; return b.sprite.anims.currentAnim && b.sprite.anims.currentAnim.key; });
    await shot('t4-trono-vazio');
    check(emptied === 'vhalor-empty', `a estátua de Âmbar se desfaz e fica o trono vazio (${emptied})`);

    // depois: a memória sai do corpo, a grade abre, o alçapão em cima do trono abre e os degraus do encosto sobem
    await freeze("[22, 15, 8].every((y) => { const t = s.level.layer.getTileAt(87, y); return !!(t && t.collides); })", 15000);
    const after = await page.evaluate(() => {
      const s = window.__scene;
      const m = s.props.memories.find((q) => q.id === 'trono:boss');
      const n = s.records.list.find((r) => r.id === 'trono:0');
      const g = s.level.layer.getTileAt(17, 37);
      return {
        trap: s.fixtures.trapdoors.map((t) => t.open), steps: s.torres.steps.map((st) => [st.up, Math.round(st.plate.angle)]),
        orb: m ? [Math.round(m.x), Math.round(m.y)] : null, note: n ? [Math.round(n.x), Math.round(n.y)] : null, gate: !!(g && g.collides),
      };
    });
    check(after.trap.join() === 'true' && after.steps.every((st) => st[0] && st[1] === 0) && !after.gate,
      `depois da luta a grade abre, o alçapão em cima do trono abre e os três degraus sobem para o lugar (${JSON.stringify(after)})`);
    check(!!after.orb && Math.abs(after.orb[1] - (544 - 28)) <= 2 && !!after.note && after.note[1] === 544,
      `a memória sai em cima do estrado (não lá no alto, onde ele caiu) e o decreto fica no chão do estrado (${JSON.stringify({ orb: after.orb, note: after.note })})`);
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(1410, 22 * 16 - 4); p.body.setVelocity(0, 0); });
    await freeze('s.player.body.blocked.down', 3000);
    const stand = await page.evaluate(() => { const p = window.__scene.player; return { bottom: Math.round(p.body.bottom), ground: p.body.blocked.down }; });
    check(stand.ground && stand.bottom === 22 * 16, `dá para ficar de pé no primeiro degrau do encosto (${JSON.stringify(stand)})`);
    await look(1380, 300);
    await shot('t4-degraus');

    // voltando à sala: o trono vazio continua lá, com os degraus no lugar e o alçapão aberto
    await start('trono', ENTRY.trono);
    await pause();
    const done = await page.evaluate(() => {
      const s = window.__scene;
      const L = s.level;
      const plank = (x, y) => { const t = L.layer.getTileAt(x, y); return !!(t && t.collides); };
      const last = s.anims.get('vhalor-empty').frames.slice(-1)[0].textureFrame;
      const corpse = s.children.list.find((o) => o.type === 'Image' && o.texture && o.texture.key === 'vhalor');
      return {
        boss: !!s.boss, steps: s.torres.steps.map((st) => [st.up, Math.round(st.plate.angle)]), phys: [22, 15, 8].map((y) => plank(87, y)),
        trap: s.fixtures.trapdoors.map((t) => t.open), corpse: corpse ? String(corpse.frame.name) === String(last) : null,
        note: s.records.list.map((r) => r.id), orb: s.props.memories.map((m) => m.id),
      };
    });
    check(!done.boss && done.corpse && done.steps.every((st) => st[0] && st[1] === 0) && done.phys.every(Boolean) && done.trap.join() === 'true' && done.note.includes('trono:0') && done.orb.includes('trono:boss'),
      `voltando ao Trono: o trono vazio no lugar dele, os degraus firmes, o alçapão aberto, o decreto e a memória esperando (${JSON.stringify(done)})`);
    await look(1330, 420);
    await shot('t4-trono-vencido');
  }

  if (part('cetro')) {
    // ---------- 14. o Cetro de Vhalor (T4a) ----------
    await setProgress([...VALE, 'boss:vhalor']);
    await start('trono', ENTRY.trono);
    await until(() => !!window.__scene.weaponDrop && window.__scene.weaponDrop.ready, null, 20000);
    const drop = await page.evaluate(() => { const d = window.__scene.weaponDrop; return { id: d.id, x: Math.round(d.x), y: Math.round(d.y), tex: d.sprite.texture.key }; });
    check(drop.id === 'cetro' && drop.tex === 'item-cetro' && drop.x > 1216 && drop.x < 1380 && Math.abs(drop.y - (544 - 16)) <= 1,
      `o Cetro de Vhalor fica caído no estrado, na frente do trono vazio (${JSON.stringify(drop)})`);
    await page.evaluate(() => { const s = window.__scene; s.sys.pause(); s.cameras.main.stopFollow(); s.cameras.main.centerOn(1300, 470); });
    await shot('t4a-cetro-caido');
    await page.evaluate(() => window.__scene.sys.resume());
    await page.evaluate((x) => { const p = window.__scene.player; p.teleport(x, 544); p.body.setVelocity(0, 0); p.invuln = 99; }, drop.x);
    await until(() => window.__progress.seen.has('weapon:cetro') && !window.__scene.cinematic, null, 20000).catch(() => null);
    const got = await page.evaluate(() => ({ seen: window.__progress.seen.has('weapon:cetro'), claimed: window.__progress.claimed('cetro'), has: window.__progress.hasWeapon('cetro') }));
    check(got.seen && got.claimed && got.has, `pegou o Cetro e ele fica liberado em Trocar arma (${JSON.stringify(got)})`);

    // dois bonecos no chão do salão: um na frente do cavaleiro (o golpe pega) e outro atrás, perto (só a runa pega)
    await pause();
    const setup = await page.evaluate(() => {
      const s = window.__scene;
      const p = s.player;
      p.setWeapon('cetro');
      p.teleport(700, 640);
      p.body.setVelocity(0, 0);
      p.facing = 1;
      p.invuln = 99;
      const dummy = (x) => {
        const e = s.spawn('c', x, 640);
        e.hp = 99;
        e.update = function () { this.body.setVelocityX(0); };
        return e;
      };
      window.__front = dummy(736);
      window.__back = dummy(660);
      return { tex: p.sprite.texture.key, glow: !!p.runeGlow, charge: p.runeCharge };
    });
    check(setup.tex === 'knight-cetro' && setup.glow && setup.charge === 0, `com o Cetro na mão, a runa da cabeça está quase apagada (${JSON.stringify(setup)})`);
    // o golpe sai do jeito do botão (startAttack com os controles parados) e o jogo para quando a recarga
    // acaba: assim o tempo entre um golpe e outro é o do jogo, não o da ida e volta até a página
    const strike = () => page.evaluate(() => { const s = window.__scene; s.player.startAttack(s.controls, true); });
    const state = () => page.evaluate(() => {
      const p = window.__scene.player;
      return { charge: p.runeCharge, glow: +p.runeGlow.scaleX.toFixed(2), front: +window.__front.hp.toFixed(2), back: +window.__back.hp.toFixed(2) };
    });
    // (a luz da runa pisca junto com o cavaleiro invulnerável: o tamanho dela é que diz o quanto acendeu)
    const swing = async () => {
      await strike();
      await freeze('s.player.atkCd <= 0', 4000);
      return state();
    };
    const s1 = await swing();
    const s2 = await swing();
    check(s1.charge === 1 && s2.charge === 2 && s2.glow > s1.glow && s1.front < 99 && s2.front < s1.front && s2.back === 99,
      `cada golpe que acerta acende mais a runa; o de trás ainda não levou nada (${JSON.stringify([s1, s2])})`);
    await strike();
    const burst = await freeze('window.__back.hp < 99', 4000);
    const t0 = await page.evaluate(() => window.__scene.clock);
    await freeze(`s.clock > ${t0} + 0.1`, 2000);
    await page.evaluate(() => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(700, 590); });
    await shot('t4a-runa');
    const s3 = await page.evaluate(() => {
      const p = window.__scene.player;
      const W = p.weapon;
      return { charge: p.runeCharge, front: +window.__front.hp.toFixed(2), back: +window.__back.hp.toFixed(2), want: +(W.dmg * window.__progress.dmgFor('cetro') * 1.25).toFixed(2) };
    });
    check(burst && s3.charge === 0 && Math.abs(99 - s3.back - s3.want) < 0.02 && s2.front - s3.front > s3.want,
      `o terceiro golpe seguido solta a runa em volta: pega o de trás e o da frente leva o golpe e a runa (${JSON.stringify(s3)})`);
    await freeze('s.player.atkCd <= 0', 4000);
    // golpe que erra zera a conta; tempo demais entre um acerto e outro também
    await swing();
    await page.evaluate(() => { const p = window.__scene.player; p.facing = 1; p.teleport(560, 640); p.body.setVelocity(0, 0); });
    const missed = await swing();
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(700, 640); p.body.setVelocity(0, 0); p.facing = 1; });
    const miss = await swing();
    await swing();
    const t1 = await page.evaluate(() => window.__scene.clock);
    await freeze(`s.clock > ${t1} + 1.6`, 4000);
    const late = await page.evaluate(() => window.__scene.player.runeCharge);
    check(missed.charge === 1 && miss.charge === 1 && late === 0, `um golpe errado no meio zera a conta (${missed.charge} -> ${miss.charge}) e a runa apaga sozinha se demorar (${late})`);
    // o escudo segura o golpe de frente, mas não a runa (ela vem de todo lado)
    const sh = await page.evaluate(() => {
      const s = window.__scene;
      const g = s.spawn('g', 900, 640);
      g.facing = -1;
      const fx = g.zone.x - 30;
      const a = g.hit(fx, 1, 'side');
      const hp = g.hp;
      const b = g.hit(fx, 1, 'rune');
      return { side: a, rune: b, took: +(hp - g.hp).toFixed(2) };
    });
    check(sh.side === 'blocked' && sh.rune === 'hit' && sh.took === 1, `o escudo do guarda segura o golpe de frente, a runa passa (${JSON.stringify(sh)})`);
    await page.evaluate(() => { for (const e of window.__scene.enemies) if (e.alive && e.vanish) e.vanish(); window.__scene.sys.resume(); });

    // no caminho do Mago o Senhor de Vhalor deixa a Energia dele no lugar do Cetro
    await setProgress([...VALE, 'boss:vhalor']);
    const e0 = await page.evaluate(() => { const p = window.__progress; p.starter = 'eclipse'; p.save(); return p.energy; });
    await start('trono', ENTRY.trono);
    await until(() => !!window.__scene.weaponDrop && window.__scene.weaponDrop.ready, null, 20000);
    const md = await page.evaluate(() => { const d = window.__scene.weaponDrop; return { id: d.id, x: d.x, tex: d.sprite.texture.key }; });
    await page.evaluate((x) => { const p = window.__scene.player; p.teleport(x, 544); p.body.setVelocity(0, 0); p.invuln = 99; }, md.x);
    await until(() => window.__progress.seen.has('weapon:cetro') && !window.__scene.cinematic, null, 20000).catch(() => null);
    const e1 = await page.evaluate(() => ({ energy: window.__progress.energy, max: window.__progress.mage ? 0 : -1 }));
    check(md.tex === 'mage-energy' && e1.energy === e0 + 1, `no Mago, o Senhor de Vhalor deixa a Energia dele (${JSON.stringify({ tex: md.tex, antes: e0, depois: e1.energy })})`);
    await page.evaluate(() => { const p = window.__progress; p.starter = null; p.save(); });
  }

  console.log(errs.join('\n') || 'sem erros');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
