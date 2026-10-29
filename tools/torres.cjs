// Testa a Área 7, as Torres Rúnicas: o portão do cais que sobe com o Barqueiro vencido, as passagens
// entre as nove salas nos dois sentidos (lados, de cima e de baixo, e as portas do pátio), as portas
// trancadas (runas e tranca por dentro), o Agrimensor na escada, uma foto de cada sala (T1) e a Capa de
// Luz: a relíquia no pilar, os três voos, os lumes que recarregam e as luzes no HUD, as runas do pátio e
// o mar de nuvens, os frascos do Arquivo e a máquina da Torre das Engrenagens (T2); o Guarda da Coroação,
// a Vigia Rúnica e os Arquivados (T3); o Senhor de Vhalor (T4b) e o Cetro de Vhalor (T4a); a história (T5); o
// Carrasco Coroado, do terraço à escolha da coroa (T6); os três finais, do terraço ao filme, a Vespera depois do fim
// e a tela de título (T7); a música de cada sala e da luta final (T8).
// uso: node torres.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8780/index.html';
// ONLY=links,portao roda só essas partes (portao, links, portas, agrimensor, fotos, voo, runas, nuvens,
// frascos, maquina, inimigos, cadeiras, vhalor, cetro, historia, carrasco, finais, musica)
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
    await cross('nucleo', '1', 'down', 51, 'coroacao', 'núcleo pelo poço');
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

  // a faixa que está tocando (ou a que vai tocar quando o som abrir) e em que colcheia ela está
  const track = () => page.evaluate(() => {
    const a = window.__audio;
    const p = a.playing.find((q) => q.alive);
    return p ? { id: p.id, step: p.step, ctx: a.ctx && a.ctx.state } : { id: a.wantTrack, step: -1, ctx: a.ctx && a.ctx.state };
  });
  if (part('musica')) {
    // ---------- a música das Torres (T8) ----------
    await setProgress([...VALE, 'runas:patio', 'short:torre', 'boss:vhalor']);
    const want = { escada: 'torres', calha: 'torres', patio: 'torres', arquivo: 'torres-arquivo', experiencias: 'torres-dentro', engrenagens: 'torres-engrenagens', trono: 'torres-dentro', coroacao: 'torres-noite', nucleo: 'torres' };
    const got = {};
    for (const [room, entry] of [['escada', '1'], ['calha', '1'], ['patio', '1'], ['arquivo', 'O0'], ['experiencias', 'O0'], ['engrenagens', '1'], ['trono', '1'], ['coroacao', '1'], ['nucleo', '1']]) {
      await start(room, entry);
      got[room] = (await track()).id;
    }
    check(Object.entries(want).every(([r, id]) => got[r] === id), `cada sala das Torres toca a sua versão da música (${JSON.stringify(got)})`);
    // trocar de sala dentro da família continua do compasso em que estava; fora dela, a outra música começa do zero
    await page.keyboard.press('ArrowLeft');
    await start('patio', '1');
    await waitGame(3);
    const a = await track();
    await start('arquivo', 'O0');
    const b = await track();
    await start('cais', '1');
    const c = await track();
    check(a.ctx === 'running' && a.id === 'torres' && a.step > 4 && b.id === 'torres-arquivo' && b.step >= a.step && c.id === 'cais' && c.step < a.step,
      `do pátio para o Arquivo a música das Torres segue do mesmo compasso, e o cais começa a dele do zero (${JSON.stringify({ a, b, c })})`);
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

  if (part('historia')) {
    // ---------- T5. a história: os registros e as memórias das Torres, a escolha de como guardar uma memória
    // decisiva, as provas que racham a versão falsa, as rachaduras da máscara, o Cobrador devolvendo uma
    // memória e a aba A Noite ----------
    await setProgress([...VALE, 'boss:vhalor', 'weapon:cetro']);
    const hook = () => page.evaluate(() => {
      const ui = window.__ui;
      window.__thoughts = [];
      window.__banners = [];
      window.__talks = [];
      if (ui.__hookedT5) return;
      ui.__hookedT5 = true;
      const th = ui.thought.bind(ui);
      ui.thought = (text, ...rest) => { window.__thoughts.push(text); return th(text, ...rest); };
      const ob = ui.banner.bind(ui);
      ui.banner = (t, ...rest) => { window.__banners.push(t + ' | ' + (rest[0] || '')); return ob(t, ...rest); };
      const ot = ui.talk.bind(ui);
      ui.talk = (o) => { window.__talks.push({ name: o.name, lines: o.lines.slice() }); return ot(o); };
    });
    const top = () => page.evaluate(() => { const q = document.querySelector('.screen.show'); return q ? q.id.replace('screen-', '') : null; });
    const read = async (id) => {
      const r = await page.evaluate((id) => {
        const s = window.__scene;
        const k = s.records.list.find((q) => q.id === id);
        if (!k) return null;
        const p = s.player;
        // para a foto ele fica de lado, e a arte aparece inteira
        p.teleport(k.x - 76, k.y);
        p.body.setVelocity(0, 0);
        p.invuln = 99;
        s.cameras.main.stopFollow();
        s.cameras.main.centerOn(k.x, k.y - 30);
        return { x: k.x, y: k.y, tex: s.children.list.some((o) => o.texture && o.texture.key === 'deco-record-' + id.replace(':', '-')) };
      }, id);
      if (!r) return null;
      await waitGame(0.6);
      await shot(`t5-${id.replace(':', '-')}`);
      await page.evaluate((r) => { const p = window.__scene.player; p.teleport(r.x - 8, r.y); p.body.setVelocity(0, 0); }, r);
      await waitGame(0.4);
      const hint = await page.evaluate(() => { const s = window.__scene; const h = s.records.nearby(s.player); return h && h.hint; });
      await page.evaluate(() => { window.__talks = []; });
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(160);
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(400);
      const t = await page.evaluate(() => window.__talks[0] || null);
      for (let i = 0; i < 12 && (await top()) === 'talk'; i++) {
        await page.keyboard.down('KeyJ');
        await page.waitForTimeout(120);
        await page.keyboard.up('KeyJ');
        await page.waitForTimeout(140);
      }
      await page.waitForTimeout(300);
      const seen = await page.evaluate((id) => window.__progress.seen.has('record:' + id), id);
      return t && { ...t, hint, seen, tex: r.tex, text: t.lines.join(' ') };
    };
    const recs = [
      ['patio', 'patio:0', 'A ordem de subida', /guarda do núcleo/, /ordem de trazê-la ainda no bolso/],
      ['arquivo', 'arquivo:0', 'O índice dela', /"devolver"/, /não se virou/],
      ['arquivo', 'arquivo:1', 'A ficha do carrasco', /trezentos e doze/, /não lê as ordens/i],
      ['experiencias', 'experiencias:0', 'O caderno dos testes', /Sétima sessão/, /tamanho de uma torre/],
      ['experiencias', 'experiencias:1', 'A planta do núcleo', /consciência de milhares/, /carregar os fragmentos/],
    ];
    let here = null;
    for (const [room, id, title, a, b] of recs) {
      if (here !== room) {
        await start(room, ENTRY[room]);
        await clear();
        here = room;
      }
      await hook();
      const t = await read(id);
      check(t && t.tex && t.hint === '{up} ler' && t.name === title && a.test(t.text) && b.test(t.text) && !/Arielle/.test(t.text),
        `o registro ${id} "${t && t.name}" está no lugar dele, com a arte (dica ${t && t.hint})`);
      check(t && t.seen, `${id} fica no Diário`);
    }

    // a memória da mesa dela: inteira (dourada)
    await setProgress([...VALE, 'boss:vhalor', 'weapon:cetro']);
    const take = (id) => page.evaluate((id) => {
      const s = window.__scene;
      const m = s.props.memories.find((k) => k.id === id);
      if (!m) return null;
      s.takeMemory(m);
      return document.getElementById('banner').textContent;
    }, id);
    await start('arquivo', ENTRY.arquivo);
    await clear();
    await hook();
    let bn = await take('arquivo:0');
    check(bn && /As flores do arquivo/.test(bn) && /uma para cada nome/.test(bn), `a memória da mesa dela (${bn && bn.trim().slice(0, 50)})`);
    await waitGame(3.2);
    check((await top()) === null, `uma memória inteira não pede escolha (tela: ${await top()})`);

    // a escada: memória decisiva. A onda passa, o mundo para e ele escolhe como guardar
    await start('coroacao', ENTRY.coroacao);
    await clear();
    await hook();
    const c0 = await page.evaluate(() => window.__progress.corruption);
    bn = await take('coroacao:0');
    check(bn && /A escada/.test(bn), `a memória da escada (${bn && bn.trim().slice(0, 40)})`);
    await until(() => document.querySelector('#screen-choice.show'), null, 15000).catch(() => null);
    const ch = await page.evaluate(() => {
      const q = document.querySelector('#screen-choice');
      return { show: q.classList.contains('show'), title: q.querySelector('.choice-title').textContent, versions: [...q.querySelectorAll('.choice-versions li')].map((e) => e.textContent), soft: q.querySelector('.soft-what').textContent };
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/t5-escolha.png` });
    check(ch.show && ch.title === 'A escada' && ch.versions.length === 2 && /salvá-la/.test(ch.versions[0]) && /cumprir a ordem/.test(ch.versions[1]) && /salvá-la/.test(ch.soft),
      `na escada ele escolhe como guardar: as duas versões e a mais leve (${JSON.stringify(ch)})`);
    await page.click('#screen-choice [data-cmd="soft"]');
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const hud = window.__game.scene.getScene('hud');
      const p = window.__progress;
      return { top: document.querySelector('.screen.show') ? 'menu' : null, c: p.corruption, soft: p.seen.has('soft:coroacao:0'), rot: hud.rot.texture.key, frozen: window.__scene.player.frozen, cine: window.__scene.cinematic };
    });
    check(st.top === null && st.c === c0 + 1 && st.soft && st.rot === `mask-rot-${c0 + 1}` && !st.frozen && !st.cine,
      `lembrar como dói menos: a máscara racha e o jogo volta (${JSON.stringify(st)})`);
    await waitGame(1);
    await page.evaluate(() => { const s = window.__scene; s.cameras.main.centerOn(s.player.x, s.player.body.center.y); });
    await shot('t5-mascara-rachada');

    // a prova chega: lendo a ordem de subida, a versão que dói menos racha e a máscara fecha uma rachadura
    await start('patio', ENTRY.patio);
    await clear();
    await hook();
    const before = await page.evaluate(() => window.__progress.corruption);
    const rd = await read('patio:0');
    // a prova racha a versão uns segundos depois de fechar o registro, e o pensamento vem logo atrás
    await until(() => window.__thoughts.some((x) => /cumprir a ordem/.test(x)), null, 15000).catch(() => null);
    const cf = await page.evaluate(() => ({ c: window.__progress.corruption, conf: window.__progress.seen.has('confirm:coroacao:0'), banners: window.__banners, thoughts: window.__thoughts }));
    check(rd && rd.seen && cf.conf && cf.c === before - 1 && cf.banners.some((x) => /A versão que dói menos rachou/.test(x) && /A escada/.test(x) && /A ordem de subida/.test(x)) && cf.thoughts.some((x) => /cumprir a ordem/.test(x)),
      `a ordem de subida prova a escada: a versão que dói menos racha (${JSON.stringify({ c: [before, cf.c], b: cf.banners.slice(-1), t: cf.thoughts.slice(-1) })})`);

    // o Cobrador: trocar memória racha a máscara; comprar de volta fecha (e a prova lida confirma na hora)
    await page.evaluate(() => {
      const p = window.__progress;
      p.memories.add('cais:boss');
      p.memories.add('cachoeiras:0');
      p.coins = 120;
      p.save();
    });
    const tr = await page.evaluate(() => {
      const s = window.__scene;
      const p = window.__progress;
      const c0 = p.corruption;
      s.openShop();
      const b = [...document.querySelectorAll('#screen-shop .offer')].find((e) => e.dataset.id === 'breath');
      b.click();
      return { c0, c1: p.corruption, traded: [...p.traded] };
    });
    check(tr.c1 === tr.c0 + 1 && tr.traded.length === 1, `trocar uma memória com o Cobrador racha a máscara (${JSON.stringify(tr)})`);
    // a mais antiga foi trocada; põe a do cais no lugar dela para testar a volta com a prova já lida
    await page.evaluate(() => {
      const p = window.__progress;
      p.traded = new Set(['cais:boss']);
      window.__ui.closeAll();
      window.__scene.openShop();
    });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => [...document.querySelectorAll('#screen-shop .back-col .offer')].map((e) => ({ id: e.dataset.id, name: e.querySelector('b').textContent, off: e.disabled })));
    await page.screenshot({ path: `${OUT}/t5-cobrador.png` });
    check(back.length === 1 && back[0].id === 'cais:boss' && back[0].name === 'As duas passagens' && !back[0].off, `o Cobrador mostra a memória trocada para comprar de volta (${JSON.stringify(back)})`);
    const bb = await page.evaluate(() => {
      const p = window.__progress;
      const c0 = p.corruption;
      const coins = p.coins;
      document.querySelector('#screen-shop .back-col .offer').click();
      return { c0, c1: p.corruption, coins: [coins, p.coins], traded: p.traded.has('cais:boss') };
    });
    check(!bb.traded && bb.coins[1] === bb.coins[0] - 45 && bb.c1 === bb.c0 - 1, `comprar de volta: 45 moedas, a memória volta e a rachadura fecha (${JSON.stringify(bb)})`);
    await page.evaluate(() => document.querySelector('#screen-shop [data-cmd="close"]').click());
    await waitGame(2.4);
    const cais = await page.evaluate(() => ({ conf: window.__progress.seen.has('confirm:cais:boss'), b: window.__banners.slice(-1) }));
    check(cais.conf && /As duas passagens/.test(cais.b[0] || ''), `a memória que voltou já tinha a prova lida: a versão falsa racha (${JSON.stringify(cais)})`);

    // A Noite: as essenciais, as versões (a falsa rachada), os planos da Casa, o núcleo e a máscara. O
    // setProgress de antes da escada apagou as leituras da volta pelas Torres; daqui conta a ordem de subida
    // e mais estas três (um plano e as duas folhas do núcleo)
    await page.evaluate(() => {
      const s = window.__scene;
      for (const id of ['mercado:0', 'experiencias:0', 'experiencias:1']) window.__progress.seen.add('record:' + id);
      s.scene.pause();
      window.__ui.journal({ onBack: () => window.__ui.closeAll() });
      document.querySelector('#screen-journal [data-tab="night"]').click();
    });
    await page.waitForTimeout(400);
    const nt = await page.evaluate(() => {
      const q = document.querySelector('#screen-journal .tab-panel[data-panel="night"]');
      const entries = [...q.querySelectorAll('.j-entry')];
      const esc = entries.find((e) => e.querySelector('b') && e.querySelector('b').textContent === 'A escada');
      return {
        visible: !q.hidden,
        count: q.querySelector('.j-count').textContent,
        heads: [...q.querySelectorAll('.j-head')].map((e) => e.textContent),
        escada: esc && [...esc.querySelectorAll('.j-ver')].map((e) => e.className),
        tip: esc && esc.querySelector('.j-tip').textContent,
        missing: entries.filter((e) => e.classList.contains('unknown')).length,
        arielle: /Arielle/.test(q.textContent),
      };
    });
    await page.screenshot({ path: `${OUT}/t5-a-noite.png` });
    await page.evaluate(() => { const l = document.querySelector('#screen-journal .night-list'); l.scrollTop = l.scrollHeight; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/t5-a-noite-fim.png` });
    check(nt.visible && /Essenciais: 3 de 9/.test(nt.count) && /Versões confirmadas: 2 de 7/.test(nt.count) && nt.heads.includes('Memórias essenciais') && nt.heads.some((h) => /Os planos da Casa: 2 de 5/.test(h)) && nt.heads.some((h) => /Como o núcleo foi feito: 2 de 4/.test(h)) && nt.heads.includes('A máscara'),
      `a aba A Noite conta o que ele sabe e o que falta (${JSON.stringify({ count: nt.count, heads: nt.heads })})`);
    check(nt.escada && nt.escada[0].includes('cracked') && nt.escada[1].includes('true') && /A ordem de subida/.test(nt.tip) && nt.missing > 0 && !nt.arielle,
      `na escada, a versão falsa aparece rachada e a prova embaixo (${JSON.stringify({ escada: nt.escada, tip: nt.tip, missing: nt.missing })})`);
    await page.evaluate(() => { window.__ui.closeAll(); window.__scene.scene.resume(); });

    // um save de antes das rachaduras: cada memória trocada já rachou a máscara
    const mig = await page.evaluate(() => {
      const p = window.__progress;
      const d = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
      d.traded = ['ponte:0', 'catacumbas:0'];
      d.memories = [...new Set([...(d.memories || []), 'ponte:0', 'catacumbas:0'])];
      delete d.corruption;
      p.restore({ ...d, corruption: null });
      return p.corruption;
    });
    check(mig === 2, `num save antigo, as memórias trocadas viram rachaduras (${mig})`);
  }

  if (part('carrasco')) {
    // ---------- 16. O Carrasco Coroado (T6) ----------
    await setProgress([...VALE, 'boss:vhalor', 'weapon:cetro']);
    await start('nucleo', '1');
    await pause();
    const arena = await page.evaluate(() => {
      const s = window.__scene;
      const k = s.torres.core;
      const b = s.boss;
      window.__foe = b;
      return { c: k.c, floorY: k.floorY, spires: k.spires, x0: k.x0, x1: k.x1, sleeping: b.sleeping, trap: s.fixtures.trapdoors.map((t) => t.open) };
    });
    check(arena.c === 1024 && arena.spires.join() === '748,1300' && arena.x0 === 736 && arena.x1 === 1312 && arena.sleeping && arena.trap.join() === 'true',
      `o terraço vai de uma borda da torre à outra (com o alçapão da escada), as agulhas nas pontas, ele dorme nas nuvens e o alçapão está aberto (${JSON.stringify(arena)})`);
    const C = arena.c;
    const F = arena.floorY;
    await shot('t6-nucleo');

    // passando da beira do alçapão, ele sobe: o alçapão bate, a câmera trava no terraço e o cavaleiro para
    await page.evaluate((C) => { const s = window.__scene; const p = s.player; p.teleport(C - 20, 702); p.body.setVelocity(0, 0); p.invuln = 99; }, C);
    await freeze("e.state === 'rise'");
    const woke = await page.evaluate(() => { const s = window.__scene; return { trap: s.fixtures.trapdoors.map((t) => t.open), lock: s.camLock, frozen: s.player.frozen }; });
    check(woke.trap.join() === 'false' && woke.lock && woke.frozen, `ele acorda: o alçapão fecha, a câmera trava e o cavaleiro espera a subida (${JSON.stringify(woke)})`);
    const m8 = await track();
    check(m8.id === 'boss8', `a luta com o colosso toca o hino no tom do título (${JSON.stringify(m8)})`);
    await freeze("e.state === 'idle'", 20000);
    const held = await page.evaluate(() => {
      const s = window.__scene;
      const e = window.__foe;
      return { frozen: s.player.frozen, arms: e.arms.map((a) => ({ st: a.st, grip: a.grip.visible, fist: a.fist.visible, x: Math.round(a.grip.x), y: Math.round(a.grip.y) })), mask: !!e.mask.rect && e.mask.rect.x > 0 };
    });
    check(!held.frozen && held.arms.every((a) => a.st === 'grip' && a.grip && !a.fist && a.y === F - 116) && held.arms[0].x === 748 && held.arms[1].x === 1300 && held.mask,
      `de pé, as duas mãos fechadas nas agulhas e a máscara aberta ao golpe (${JSON.stringify(held)})`);
    await shot('t6-colosso');

    const attack = (a, px) => page.evaluate(([a, px]) => {
      const s = window.__scene;
      const b = window.__foe;
      const p = s.player;
      p.teleport(px, b.floorY - 2);
      p.body.setVelocity(0, 0);
      p.invuln = 99;
      b.queue.length = 0;
      b.toIdle(0);
      b.start(a);
      return b.state;
    }, [a, px]);
    const box = (x, bottom, h = 42) => `new Phaser.Geom.Rectangle(${x} - 7, ${bottom} - ${h}, 14, ${h})`;
    const harmsAt = (rects) => page.evaluate((rects) => rects.map((src) => window.__foe.harms(new Function(`return ${src}`)(), false)), rects);

    // o punho: sobe seguindo o cavaleiro, cai em cima dele e a onda corre rente ao chão; no chão, dá para bater
    await attack('slam', C - 150);
    await freeze("e.arms.some((a) => a.hot && a.y > e.floorY - 60)");
    const sl = await page.evaluate((F) => {
      const e = window.__foe;
      const p = window.__scene.player;
      const a = e.arms.find((q) => q.hot);
      const R = (x) => new Phaser.Geom.Rectangle(x - 7, F - 42, 14, 42);
      return { side: a.side, dx: Math.round(a.x - p.x), hit: e.harms(R(a.x), false), away: e.harms(R(a.x + 80), false), back: a.upper.depth < 0 && a.pauldron.depth < 0 && a.fore.depth > 0 };
    }, F);
    check(sl.side === -1 && Math.abs(sl.dx) < 12 && sl.hit && !sl.away && sl.back,
      `o punho do lado do cavaleiro cai em cima dele (e não do lado); o antebraço vem para a frente, o ombro fica atrás (${JSON.stringify(sl)})`);
    await shot('t6-punho');
    await freeze("e.arms.some((a) => a.st === 'rest') && e.shocks.length === 2 && e.shocks[0].t > 0.1");
    const sh = await page.evaluate((F) => {
      const e = window.__foe;
      const w = e.shocks[0];
      const a = e.arms.find((q) => q.st === 'rest');
      const hp0 = e.hp;
      const r = a.part.hit(a.x - 30, 10, 'side');
      return { low: e.harms(new Phaser.Geom.Rectangle(w.x - 7, F - 42, 14, 42), false), high: e.harms(new Phaser.Geom.Rectangle(w.x - 7, F - 62, 14, 42), false), r, dmg: hp0 - e.hp };
    }, F);
    check(sh.low && !sh.high && sh.r === 'hit' && Math.abs(sh.dmg - 7.5) < 0.01, `a onda pega em pé e passa por baixo do pulo; o punho no chão leva o golpe (três quartos) (${JSON.stringify(sh)})`);
    await freeze("e.state === 'idle'");

    // a foice por cima: pendurada no punho erguido, passa rente ao chão no meio (pulando passa) e alta nas pontas
    await attack('sweepU', C);
    await freeze("e.state === 'sweepwarn' && e.t > 0.5");
    const piv = await page.evaluate(() => { const e = window.__foe; const a = e.arms[0]; return { st: a.st, fx: Math.round(a.x), fy: Math.round(a.y), px: e.sweep.px, py: e.sweep.py, blade: e.blade.visible }; });
    await shot('t6-foice-aviso');
    // o primeiro quadro depois do meio (a foice passa rápido por ele: um quadro mais lento não pode pular a espera)
    await freeze("e.state === 'sweep' && e.sweep.ang * e.sweep.dir > -0.02");
    const su = await page.evaluate((F) => {
      const e = window.__foe;
      const sw = e.sweep;
      const R = (x, b) => new Phaser.Geom.Rectangle(x - 7, b - 42, 14, 42);
      return { stand: e.harms(R(sw.px + 30, F), false), jump: e.harms(R(sw.px + 30, F - 30), false), hand: Math.round(Math.hypot(e.arms[0].x - sw.px, e.arms[0].y - sw.py)) };
    }, F);
    await shot('t6-foice-u');
    // perto do fim (a janela tem que caber dois quadros de 50 ms: em 0,88 a ponta já está 95% do caminho)
    await freeze("e.state === 'sweep' && e.t > 0.88");
    const end = await page.evaluate((F) => {
      const e = window.__foe;
      const sw = e.sweep;
      const x = sw.px + Math.sin(sw.ang) * sw.rOut;
      return { x: Math.round(x), stand: e.harms(new Phaser.Geom.Rectangle(x - 7, F - 42, 14, 42), false) };
    }, F);
    check(piv.st === 'raise' && piv.px === C - 70 && piv.py === F - 270 && Math.abs(piv.fx - piv.px) < 6 && Math.abs(piv.fy - piv.py) < 6 && su.hand < 3 && su.stand && !su.jump && !end.stand,
      `a foice de cima pende do punho erguido (o pivô), corta rente ao chão no meio, passa por cima do pulo e fica alta na ponta (${JSON.stringify({ piv, su, end })})`);
    await freeze("e.state === 'idle'");

    // a foice por baixo: a haste sobe de trás da borda; no meio ela passa por cima de quem fica em pé
    await attack('sweepN', C + 230);
    await freeze("e.state === 'sweep' && e.sweep.ang * e.sweep.dir > -0.02");
    const sn = await page.evaluate(([C, F]) => {
      const e = window.__foe;
      const R = (x, b) => new Phaser.Geom.Rectangle(x - 7, b - 42, 14, 42);
      return { dir: e.sweep.dir, stand: e.harms(R(C - 40, F), false), jump: e.harms(R(C - 40, F - 30), false), low: e.arms[1].st, hidden: e.arms[1].y > F, haft: e.g.depth < 0 };
    }, [C, F]);
    await shot('t6-foice-n');
    check(sn.dir === -1 && !sn.stand && sn.jump && sn.low === 'low' && sn.hidden && sn.haft,
      `a foice de baixo vem do lado do cavaleiro, a mão escondida atrás da borda: no meio, em pé passa e pulando pega (${JSON.stringify(sn)})`);
    await freeze("e.state === 'idle'");

    // a chuva de contas: a primeira cai onde o cavaleiro está, sobra um vão sem nenhuma, e a que acerta sussurra
    await attack('beads', C - 100);
    await freeze("e.state === 'beads'");
    const bd = await page.evaluate((C) => {
      const e = window.__foe;
      const xs = e.beads.map((b) => b.x);
      const slots = xs.map((x) => Math.floor((x - e.x0 - 12) / 30)).sort((a, b) => a - b);
      const all = Math.floor((e.x1 - e.x0 - 24) / 30);
      let gap = false;
      for (let i = 0; i + 1 < all; i++) if (!slots.includes(i) && !slots.includes(i + 1)) gap = true;
      return { n: xs.length, first: Math.round(xs[0] - (C - 100)), gap };
    }, C);
    // a conta cai rápido e o próprio jogo a quebra no cavaleiro: espera a primeira acabar e confere o golpe
    await page.evaluate(() => { const p = window.__scene.player; window.__b0 = window.__foe.beads[0]; window.__hp0 = p.hp; p.invuln = 0; });
    await freeze('window.__b0.done');
    const whisper = await page.evaluate(() => {
      const t = document.querySelector('#thought');
      return { hit: window.__scene.player.hp < window.__hp0, text: t.textContent, whisper: t.classList.contains('whisper') };
    });
    await page.evaluate(() => { window.__scene.player.invuln = 99; });
    await shot('t6-contas');
    check(bd.n === 9 && Math.abs(bd.first) < 22 && bd.gap && whisper.hit && whisper.whisper && whisper.text.length > 4,
      `nove contas, a primeira em cima do cavaleiro e um vão livre; a que acerta sussurra uma acusação (${JSON.stringify({ bd, whisper })})`);
    await freeze("e.state === 'idle'", 20000);

    // a cabeça desce até o chão: machuca embaixo na descida e, no chão, a máscara leva golpe e meio
    await attack('lean', C + 110);
    // a descida dura poucos quadros: confere em todos eles se a cabeça pega quem está embaixo
    await page.evaluate(([C, F]) => {
      const s = window.__scene;
      const e = window.__foe;
      const R = new Phaser.Geom.Rectangle(C - 7, F - 42, 14, 42);
      window.__leanHit = false;
      const h = () => {
        // na descida e no instante do impacto (no quadro em que a cabeça chega ao chão)
        if ((e.state === 'leandrop' || (e.state === 'leanrest' && e.headHot)) && e.harms(R, false)) window.__leanHit = true;
        if (e.state === 'leanrest' && !e.headHot) s.events.off('postupdate', h);
      };
      s.events.on('postupdate', h);
    }, [C, F]);
    await freeze("e.state === 'leanrest' && e.t > 0.2");
    const ld = await page.evaluate(() => window.__leanHit);
    const lr = await page.evaluate((F) => {
      const e = window.__foe;
      const r = e.mask.rect;
      const hp0 = e.hp;
      const res = e.mask.hit(r.centerX, 10, 'side');
      return { bottom: Math.round(r.bottom), res, dmg: hp0 - e.hp, braced: e.arms.map((a) => a.st), elbows: e.arms.map((a) => Math.round(a.fore.y) < F) };
    }, F);
    await shot('t6-cabeca');
    check(ld && lr.res === 'hit' && Math.abs(lr.dmg - 15) < 0.01 && lr.bottom > F - 40 && lr.braced.every((s) => s === 'brace') && lr.elbows.every(Boolean),
      `a cabeça machuca na descida; no chão a máscara fica ao alcance e leva golpe e meio, as mãos apoiadas com os cotovelos acima do chão (${JSON.stringify({ ld, lr })})`);
    await freeze("e.state === 'idle'", 20000);

    // na metade ele acelera; no fim do colosso, vira pó, a coroa cai e o carrasco dourado se forma nela
    const rg = await page.evaluate(() => { const e = window.__foe; e.damage(e.hp - 79); return { rage: e.rage, hp: e.hp }; });
    await page.evaluate(() => { const e = window.__foe; e.damage(e.hp - 48); });
    await freeze("e.state === 'crumble' && e.t > 1.0");
    await shot('t6-po');
    await freeze("e.state === 'mirror'", 20000);
    const mir = await page.evaluate((C) => {
      const e = window.__foe;
      const gold = !!(e.sprite.preFX && e.sprite.preFX.list.length >= 2);
      return { rage: e.rage, hp: e.hp, gone: e.gone, crown: e.crownS.visible, big: e.crown.visible, x: Math.round(e.sprite.x), gold, chest: e.chest.visible };
    }, C);
    check(rg.rage && rg.hp === 79 && mir.hp === 48 && mir.gone && mir.crown && !mir.big && !mir.chest && Math.abs(mir.x - C) < 4 && mir.gold,
      `na metade ele acelera; o colosso vira pó, e o carrasco dourado nasce da coroa, no meio, de coroa pequena (${JSON.stringify({ rg, mir })})`);
    const m9 = await track();
    check(m9.id === 'boss9', `o espelho toca o hino de cabeça para baixo (${JSON.stringify(m9)})`);

    // o espelho: ele faz o que o cavaleiro fez, do outro lado do meio e com atraso
    await page.evaluate((C) => { const p = window.__scene.player; p.teleport(C - 120, 702); p.body.setVelocity(0, 0); }, C);
    await freeze("e.state === 'mirror' && e.now > 1.5 && e.lungeT > 1", 20000);
    await page.evaluate(() => { window.__foe.lungeT = 99; window.__scene.sys.resume(); });
    await waitGame(1.4);
    await pause();
    const mm = await page.evaluate((C) => { const e = window.__foe; const p = window.__scene.player; return { want: Math.round(2 * C - p.x), x: Math.round(e.sprite.x), lag: e.lag }; }, C);
    await shot('t6-espelho');
    check(Math.abs(mm.want - mm.x) < 6, `o carrasco dourado fica no espelho do cavaleiro, do outro lado do meio (${JSON.stringify(mm)})`);

    // a investida: aparada, ele fica tonto e leva golpe e meio
    await page.evaluate(() => { const e = window.__foe; e.lungeT = 0; });
    // aparada no meio do caminho (longe de onde ela saiu)
    await freeze("e.state === 'lunge' && Math.abs(e.lunge.x - e.lunge.from) > 80");
    const pr = await page.evaluate(() => {
      const e = window.__foe;
      const ok = e.parry(e.lungeBox(), e.lunge.x - e.lunge.dir * 20);
      const st = e.state;
      const hp0 = e.hp;
      // o golpe da cena acerta pelo rect: tonto, ele está onde a investida parou (não no lugar do reflexo)
      const r = e.rect;
      e.hit(e.lunge.x, 4, 'side');
      return { ok, st, dmg: hp0 - e.hp, rx: Math.round(r.centerX), lx: Math.round(e.lunge.x), from: Math.round(e.lunge.from) };
    });
    check(pr.ok && pr.st === 'stagger' && Math.abs(pr.dmg - 6) < 0.01 && Math.abs(pr.rx - pr.lx) < 4, `a investida aparada deixa ele tonto, onde ele está, e o golpe nele vale golpe e meio (${JSON.stringify(pr)})`);

    // a volta escorregando até o reflexo: o golpe e o encontrão são onde ele aparece, não onde o reflexo está
    await freeze("e.state === 'lungeback' && e.t > 0.12");
    const lb = await page.evaluate(() => {
      const e = window.__foe;
      const r = e.rect;
      const sb = e.sprite.getBounds();
      const refX = e.cur.body[0] + e.cur.body[2] / 2;
      const at = (x) => new r.constructor(x - 7, r.y, 14, r.height);
      const far = Math.abs(refX - r.centerX) > 30;
      return { rx: Math.round(r.centerX), sx: [Math.round(sb.x), Math.round(sb.right)], refX: Math.round(refX), far, here: e.harms(at(r.centerX), false), ref: far ? e.harms(at(refX), false) : null };
    });
    check(lb.rx > lb.sx[0] && lb.rx < lb.sx[1] && lb.far && lb.here && lb.ref === false, `na volta da investida ele leva golpe e machuca onde aparece, não no lugar do reflexo (${JSON.stringify(lb)})`);

    // vencido: ajoelha no meio do terraço, a coroa nas mãos; a escolha abre sozinha
    await page.evaluate(() => { const e = window.__foe; e.damage(e.hp); });
    await freeze("e.state === 'offer'", 20000);
    await page.evaluate(() => window.__scene.sys.resume());
    await until(() => document.querySelector('#screen-crown.show'), null, 30000).catch(() => null);
    const cr = await page.evaluate(() => {
      const q = document.querySelector('#screen-crown');
      const opts = [...q.querySelectorAll('.crown-opts button')];
      return {
        open: q.classList.contains('show'),
        cmds: opts.map((b) => b.dataset.cmd + (b.disabled ? '-' : '')),
        missing: [...q.querySelectorAll('.missing li')].map((li) => li.textContent),
        won: window.__progress.seen.has('boss:coroado'),
        trap: window.__scene.fixtures.trapdoors.map((t) => t.open),
      };
    });
    await page.screenshot({ path: `${OUT}/t6-coroa.png` });
    check(cr.open && cr.cmds.join() === 'truth-,absorb,later' && cr.missing.some((m) => /essenciais/.test(m)) && cr.won && cr.trap.join() === 'true',
      `de joelhos, ele estende a coroa: Aceitar a verdade apagada (com o que falta), Absorver e Ainda não; o alçapão abriu (${JSON.stringify(cr)})`);

    // "Ainda não": a escolha fecha; voltando à sala ele continua de joelhos, e perto dele {up} abre de novo
    await page.evaluate(() => document.querySelector('#screen-crown [data-cmd="later"]').click());
    await page.waitForTimeout(300);
    await start('nucleo', '1');
    await pause();
    const back = await page.evaluate(() => {
      const s = window.__scene;
      const e = s.boss;
      window.__foe = e;
      return { st: e && e.state, kneel: e && e.sprite.visible, colossus: e && e.chest.visible, trap: s.fixtures.trapdoors.map((t) => t.open), ui: !!document.querySelector('#screen-crown.show') };
    });
    await page.evaluate((C) => { const s = window.__scene; const p = s.player; p.teleport(C - 20, 702); p.body.setVelocity(0, 0); s.sys.resume(); }, C);
    await waitGame(0.5);
    await page.keyboard.press('ArrowUp');
    await until(() => document.querySelector('#screen-crown.show'), null, 8000).catch(() => null);
    const again = await page.evaluate(() => !!document.querySelector('#screen-crown.show'));
    check(back.st === 'offer' && back.kneel && !back.colossus && back.trap.join() === 'true' && !back.ui && again,
      `de volta ao núcleo, ele continua de joelhos com a coroa e o alçapão aberto; perto dele, {up} abre a escolha de novo (${JSON.stringify({ back, again })})`);

    // Absorver: a escolha fecha e o fim começa no terraço, com o Carrasco falando (o resto fica na parte finais)
    await page.evaluate(() => document.querySelector('#screen-crown [data-cmd="absorb"]').click());
    await waitGame(1.8);
    const fin = await page.evaluate(() => {
      const t = document.querySelector('#thought');
      const who = t.querySelector('.who');
      return { open: !!document.querySelector('#screen-crown.show'), cine: window.__scene.cinematic, who: who && who.textContent, end: window.__progress.seen.has('ending:absorb') };
    });
    await page.screenshot({ path: `${OUT}/t6-fim.png` });
    check(!fin.open && fin.cine && fin.who === 'O Carrasco Coroado' && !fin.end, `escolhido Absorver: a escolha fecha e o fim começa no terraço, com o Carrasco falando (${JSON.stringify(fin)})`);
  }

  if (part('finais')) {
    // ---------- 17. Os finais (T7) ----------
    // cada final do começo ao fim: a escolha, o terraço, o filme (adiantado fase a fase: as pinturas, a última
    // frase, o nome do final e os créditos), Vespera depois do fim e a tela de título que lembra o final
    const WON = [...VALE, 'boss:vhalor', 'weapon:cetro', 'boss:coroado'];
    // o que a verdade pede: as memórias (menos a da noite, que volta no terraço), os registros e as versões
    // inteiras guardadas e confirmadas, sem corrupção
    const whole = () => page.evaluate(() => {
      const p = window.__progress;
      const L = window.__lore;
      for (const id of Object.keys(L.MEMORIES)) if (id !== L.NIGHT) p.memories.add(id);
      for (const id of Object.keys(L.RECORDS)) p.seen.add('record:' + id);
      for (const id of Object.keys(L.VERSIONS)) { p.seen.add('kept:' + id); p.seen.add('confirm:' + id); }
      p.corruption = 0;
      p.save();
    });
    // perto dele de joelhos, {up} abre a escolha; devolve as opções (com - as fechadas)
    const offer = async () => {
      await start('nucleo', '1');
      await page.evaluate(() => { const s = window.__scene; const p = s.player; p.teleport(s.torres.core.c - 20, 702); p.body.setVelocity(0, 0); p.invuln = 99; });
      await waitGame(0.5);
      await page.keyboard.press('ArrowUp');
      await until(() => document.querySelector('#screen-crown.show'), null, 8000).catch(() => null);
      return page.evaluate(() => [...document.querySelectorAll('#screen-crown .crown-opts button')].map((b) => b.dataset.cmd + (b.disabled ? '-' : '')).join());
    };
    // a escolha: ela fecha, a interface some e o Carrasco fala uma vez
    const choose = async (kind) => {
      await page.evaluate((k) => document.querySelector(`#screen-crown [data-cmd="${k}"]`).click(), kind);
      await waitGame(1.8);
      return page.evaluate(() => {
        const s = window.__scene;
        const t = document.querySelector('#thought');
        const who = t.querySelector('.who');
        return { who: who && who.textContent, say: t.textContent.slice(who ? who.textContent.length : 0).slice(0, 60), cine: s.cinematic, hud: !!s.registry.get('hud-hidden'), open: !!document.querySelector('#screen-crown.show') };
      });
    };
    // o terraço apaga na cor do final: o save guarda o final e o filme começa
    const toFilm = async () => {
      await until(() => window.__ending && window.__ending.scene.isActive() && document.querySelector('#screen-film .film-line.on'), null, 160000);
      return page.evaluate(() => {
        const p = window.__progress;
        const g = window.__game.scene;
        return { ends: [...p.seen].filter((k) => k.startsWith('ending:')), room: p.room, entry: p.entry, night: p.memories.has(window.__lore.NIGHT), line: document.querySelector('#screen-film .film-line').textContent.slice(0, 60), game: g.isActive('game'), hud: g.isActive('hud') };
      });
    };
    // o resto do filme, adiantado fase a fase (a cena anda o tempo dela, e aqui ele é empurrado)
    const film = async (tag) => {
      await page.screenshot({ path: `${OUT}/t7-${tag}-filme.png` });
      await page.evaluate(() => { const e = window.__ending; e.t = e.shotsEnd + 2.7; });
      await until(() => window.__ending.phase === 'last', null, 10000);
      await page.evaluate(() => { const e = window.__ending; e.t = e.lastAt + 0.2; });
      await page.waitForTimeout(250);
      const last = await page.evaluate(() => {
        const q = document.querySelector('#screen-film .film-last');
        return { on: q.classList.contains('on'), text: q.textContent, light: document.querySelector('#screen-film').classList.contains('light') };
      });
      if (last.on) await page.screenshot({ path: `${OUT}/t7-${tag}-ultima.png` });
      await page.evaluate(() => { const e = window.__ending; e.t = Math.max(e.t, e.cardAt + 0.2); });
      await until(() => window.__ending.phase === 'card' && document.querySelector('#screen-film .film-card.on'), null, 10000);
      const card = await page.evaluate(() => ({ kicker: document.querySelector('#screen-film .film-kicker').textContent, title: document.querySelector('#screen-film .film-title').textContent }));
      await page.screenshot({ path: `${OUT}/t7-${tag}-cartao.png` });
      await page.evaluate(() => { const e = window.__ending; e.t = e.rollAt + 0.2; });
      await until(() => window.__ending.phase === 'roll', null, 10000);
      // (o cartão apaga devagar: no filme ele sai antes de os créditos subirem)
      await page.evaluate(() => { window.__ending.t += 14; });
      await page.waitForTimeout(2000);
      const roll = await page.evaluate(() => ({ on: !!document.querySelector('#screen-film .film-credits.on'), text: [...document.querySelectorAll('#screen-film .film-roll h3, #screen-film .film-roll p')].map((q) => q.textContent) }));
      await page.screenshot({ path: `${OUT}/t7-${tag}-creditos.png` });
      // o fim dos créditos
      await page.evaluate(() => { window.__oldPlayer = window.__scene && window.__scene.player; window.__ending.finish(); });
      return { last, card, roll };
    };
    // de volta a Vespera: a sala nova, depois que a tela sai da cor do final
    const back = (id) => until((id) => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && window.__scene.room.id === id, id, 30000);
    const menu = () => page.evaluate(() => {
      const t = window.__game.scene.getScene('title');
      const q = document.querySelector('#screen-menu');
      const keys = t.children.list.filter((o) => o.texture && o.visible).map((o) => o.texture.key);
      return {
        title: t.scene.isActive(), game: window.__game.scene.isActive('game'), ended: q.querySelector('.ended').hidden ? null : q.querySelector('.ended').textContent,
        cont: !q.querySelector('[data-cmd="continue"]').hidden, film: !q.querySelector('[data-cmd="film"]').hidden,
        knight: t.knight.visible ? t.knight.texture.key : null, tint: t.knight.tintTopLeft.toString(16), dawn: keys.includes('title-sky-aurora'), crown: keys.includes('crown-rei'),
      };
    });
    const toTitle = async () => {
      await page.evaluate(() => window.__scene.toTitle());
      await until(() => document.querySelector('#screen-menu.show') && window.__game.scene.isActive('title'), null, 20000);
      await page.waitForTimeout(1800);
    };
    const npcNames = () => page.evaluate(() => { const s = window.__scene; return s.npcs.list.map((n) => s.npcs.label(n)); });

    // ===== Final I: aceitar a verdade =====
    await setProgress(WON);
    await whole();
    const o1 = await offer();
    await page.screenshot({ path: `${OUT}/t7-escolha.png` });
    check(o1 === 'truth,absorb,fragments,later', `com tudo lembrado e guardado inteiro, a coroa abre as três saídas e o Ainda não (${o1})`);
    const c1 = await choose('truth');
    check(c1.who === 'O Carrasco Coroado' && /^Sem a coroa, você vai lembrar de tudo/.test(c1.say) && c1.cine && c1.hud && !c1.open,
      `Aceitar a verdade: a escolha fecha, a interface some e o Carrasco Coroado fala uma vez (${JSON.stringify(c1)})`);
    // ele ajoelha e deixa a coroa no chão, entre os dois; o lado fica gravado (na volta ela continua lá)
    await until(() => [...window.__progress.seen].some((k) => k.startsWith('fim:coroa:')), null, 60000);
    await waitGame(1.7);
    const down = await page.evaluate(() => {
      const b = window.__scene.boss;
      return { side: [...window.__progress.seen].find((k) => k.startsWith('fim:coroa:')), x: Math.round(b.crownImg.x), y: Math.round(b.crownImg.y), floor: b.floorY, bx: Math.round(b.kneelAt.x), end: window.__progress.seen.has('ending:truth') };
    });
    await shot('t7-verdade-coroa');
    const side = +down.side.split(':')[2];
    check(Math.abs(down.y - (down.floor - 1)) <= 1 && Math.abs(down.x - down.bx - side * 23) <= 1 && !down.end,
      `ele deixa a coroa no chão do terraço, entre os dois (o lado fica gravado), e o fim ainda não está no save (${JSON.stringify(down)})`);
    const f1 = await toFilm();
    check(f1.ends.join() === 'ending:truth' && f1.room === 'ponte' && f1.entry === 'P' && f1.night && !f1.game && !f1.hud && f1.line.length > 10,
      `o terraço apaga no branco da manhã: o save guarda o Final I e a volta pela Ponte, e o filme começa (${JSON.stringify(f1)})`);
    const v1 = await film('verdade');
    check(!v1.last.on && v1.last.light && v1.card.kicker === 'Final I' && v1.card.title === 'A Aurora das Memórias' && v1.roll.on
      && v1.roll.text.includes('Um jogo de Enio Josias') && v1.roll.text.includes('Arielle') && v1.roll.text[v1.roll.text.length - 1] === 'Obrigado por jogar.',
      `o filme do I termina claro, no nome do final e nos créditos, com o nome dela (ele lembra) (${JSON.stringify({ last: v1.last, card: v1.card, n: v1.roll.text.length })})`);

    // Vespera depois do fim: a primeira manhã na Ponte, seca, e o rosto dele
    await back('ponte');
    await until(() => document.querySelector('#banner.on'), null, 10000).catch(() => null);
    const pon = await page.evaluate(() => {
      const s = window.__scene;
      return { banner: document.querySelector('#banner p').textContent, sky: s.backdrop.parts.map((q) => q.key).filter((k) => /sky/.test(k)), music: s.roomMusic(), face: s.player.sprite.texture.key, enemies: s.enemies.length };
    });
    await until(() => /Não chove/.test(document.querySelector('#thought').textContent), null, 10000).catch(() => null);
    const th1 = await page.evaluate(() => document.querySelector('#thought').textContent);
    await shot('t7-verdade-ponte');
    check(pon.banner === 'A primeira manhã' && pon.sky.includes('bridge-sky-aurora') && pon.music === 'aurora' && /-rosto$/.test(pon.face) && pon.enemies === 0 && /Não chove/.test(th1),
      `depois dos créditos ele acorda na Ponte: a primeira manhã, o céu sem o eclipse, a música da aurora, o rosto sem a máscara e ninguém para lutar (${JSON.stringify({ pon, th1 })})`);
    // o terraço: a coroa onde ele deixou, a máscara encostada nela e a foice (ele ficou com a arma de chefe), o núcleo vazio
    await start('nucleo', '1');
    await until(() => /A coroa continua no chão/.test(document.querySelector('#thought').textContent), null, 8000).catch(() => null);
    const ter = await page.evaluate(() => {
      const s = window.__scene;
      const at = (k) => s.children.list.filter((o) => o.texture && o.texture.key === k && o.visible).map((o) => Math.round(o.x));
      return { boss: !!s.boss, crown: at('crown-rei'), mask: at('mascara-chao'), scythe: at('foice-chao'), dim: s.torres.coreDim, music: s.roomMusic(), th: document.querySelector('#thought').textContent, seen: window.__progress.seen.has('fim:terraco') };
    });
    await shot('t7-verdade-terraco');
    check(!ter.boss && ter.crown.length === 1 && Math.abs(ter.crown[0] - down.x) <= 4 && ter.mask.length === 1 && Math.sign(ter.mask[0] - ter.crown[0]) === side
      && ter.scythe.length === 1 && ter.dim === 0.6 && ter.music === 'aurora' && /A máscara e a foice também/.test(ter.th) && ter.seen,
      `no terraço a coroa continua onde ele deixou, com a máscara e a foice no chão, e o núcleo apagado (${JSON.stringify(ter)})`);
    // a praça de manhã: o povo lembra o próprio nome, e quem voltou para a rua diz uma coisa só
    await start('praca', '1');
    const pr = await page.evaluate(() => {
      const s = window.__scene;
      const m = s.npcs.list.find((n) => n.kind === 'folk' && n.i === 0);
      return { sky: s.backdrop.parts.map((q) => q.key).filter((k) => /sky/.test(k)), names: s.npcs.list.map((n) => s.npcs.label(n)), crowd: s.npcs.list.filter((n) => n.i >= 100).length, enemies: s.enemies.length, marta: m && [m.x, m.y] };
    });
    await page.evaluate(([x, y]) => { const p = window.__scene.player; p.teleport(x - 22, y); p.body.setVelocity(0, 0); p.invuln = 99; }, pr.marta);
    await waitGame(0.4);
    await page.keyboard.press('ArrowUp');
    await until(() => document.querySelector('#screen-talk.show'), null, 8000).catch(() => null);
    await page.waitForTimeout(1200);
    const marta = await page.evaluate(() => ({ name: document.querySelector('#screen-talk .talk-name').textContent, text: document.querySelector('#screen-talk .talk-text').textContent }));
    await page.screenshot({ path: `${OUT}/t7-verdade-marta.png` });
    for (let i = 0; i < 20 && (await page.evaluate(() => !!document.querySelector('#screen-talk.show'))); i++) {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(150);
    }
    const told = await page.evaluate(() => window.__progress.seen.has('after:praca:0'));
    check(pr.sky.includes('city-sky-aurora') && pr.names.includes('Marta') && pr.names.includes('Bento') && pr.names.includes('a irmã Luzia') && pr.crowd > 0 && pr.enemies === 0
      && marta.name === 'Marta' && /^Marta/.test(marta.text) && told,
      `a cidade de manhã: a Marta e o Bento lembram o nome, tem gente na rua, e a Marta conta tudo na primeira conversa (${JSON.stringify({ pr, marta, told })})`);
    // o título lembra o Final I: a manhã, ele sem a máscara no penhasco, e o jogo continua
    await toTitle();
    const t1 = await menu();
    await page.screenshot({ path: `${OUT}/t7-verdade-titulo.png` });
    check(t1.title && t1.ended === 'Final I · A Aurora das Memórias' && t1.cont && t1.film && /-rosto$/.test(t1.knight || '') && t1.dawn && !t1.crown,
      `o título lembra o Final I: a manhã, o cavaleiro sem a máscara, Continuar e Rever o final (${JSON.stringify(t1)})`);

    // ===== Final II: absorver =====
    await setProgress(WON);
    const o2 = await offer();
    check(o2 === 'truth-,absorb,later', `sem tudo lembrado, a verdade fica fechada e não há fragmentos para carregar: Absorver e o Ainda não (${o2})`);
    const c2 = await choose('absorb');
    check(c2.who === 'O Carrasco Coroado' && /^Tudo foi necessário\. Ponha a coroa/.test(c2.say) && c2.cine && c2.hud && !c2.open,
      `Absorver: o Carrasco Coroado fala uma vez (${JSON.stringify(c2)})`);
    // a coroa vai das mãos dele para a cabeça do cavaleiro e fica; o ouro toma o corpo
    await until(() => { const c = window.__scene.player.crown; return c && c.shown && c.img.visible; }, null, 20000);
    await waitGame(5);
    const king = await page.evaluate(() => {
      const s = window.__scene;
      const p = s.player;
      const w = p.crown.where();
      return { tint: p.sprite.tintTopLeft.toString(16), dx: Math.round(p.crown.img.x - w.x), dy: Math.round(p.crown.img.y - w.y), held: s.boss.crownImg.visible };
    });
    await shot('t7-rei-coroa');
    check(king.tint === 'ffdca0' && !king.held && Math.abs(king.dx) <= 1 && Math.abs(king.dy) <= 1,
      `a coroa sai das mãos do carrasco e fica na cabeça dele, e o ouro toma o corpo (${JSON.stringify(king)})`);
    const f2 = await toFilm();
    check(f2.ends.join() === 'ending:absorb' && f2.room === 'trono' && f2.entry === 'X' && f2.night && !f2.game && !f2.hud,
      `o terraço apaga no roxo: o save guarda o Final II e a volta pelo Trono (${JSON.stringify(f2)})`);
    const v2 = await film('rei');
    check(v2.last.on && v2.last.text === 'Se ninguém se lembrar da dor, ninguém poderá me condenar.' && !v2.last.light && v2.card.kicker === 'Final II' && v2.card.title === 'O Rei do Eclipse'
      && v2.roll.on && !v2.roll.text.includes('Arielle') && v2.roll.text.includes('Ela'),
      `o filme do II termina na última frase, no nome do final e nos créditos, sem o nome dela (ele não lembra) (${JSON.stringify({ last: v2.last, card: v2.card })})`);
    // o rei: acorda no Trono de coroa e dourado
    await back('trono');
    await until(() => document.querySelector('#banner.on'), null, 10000).catch(() => null);
    const tr = await page.evaluate(() => {
      const s = window.__scene;
      const p = s.player;
      return { banner: document.querySelector('#banner p').textContent, crown: !!(p.crown && p.crown.img.visible), tint: p.sprite.tintTopLeft.toString(16), music: s.roomMusic() };
    });
    await shot('t7-rei-trono');
    check(tr.banner === 'O rei' && tr.crown && tr.tint === 'ffdca0' && tr.music === 'rei', `depois dos créditos ele acorda no Trono, de coroa e dourado, com a música do rei (${JSON.stringify(tr)})`);
    // quem é gente fica de joelhos, parado e virado para ele; ninguém lembra o nome, só a irmã Luzia
    await start('celas', '1');
    const ce = await page.evaluate(() => {
      const s = window.__scene;
      return { enemies: s.enemies.length, kneel: s.children.list.filter((o) => o.type === 'Sprite' && o.tintTopLeft === 0x9a8cb0).length };
    });
    await shot('t7-rei-celas');
    await start('praca', '1');
    const pa = await npcNames();
    check(ce.enemies === 0 && ce.kneel > 0 && pa.includes('a irmã Luzia') && pa.length > 1 && pa.filter((n) => n !== 'a irmã Luzia').every((n) => /esquecid/.test(n)),
      `no Final II ninguém luta: quem era gente fica de joelhos, ninguém lembra o nome e só a irmã Luzia continua sendo ela (${JSON.stringify({ ce, pa })})`);
    // o título lembra o Final II: o eclipse maior e ele de coroa no penhasco
    await toTitle();
    const t2 = await menu();
    await page.screenshot({ path: `${OUT}/t7-rei-titulo.png` });
    check(t2.title && t2.ended === 'Final II · O Rei do Eclipse' && t2.cont && t2.film && t2.knight && t2.tint === 'ffdca0' && t2.crown && !t2.dawn,
      `o título lembra o Final II: o cavaleiro de coroa e dourado, sem a manhã, Continuar e Rever o final (${JSON.stringify(t2)})`);

    // ===== Final III: carregar os fragmentos =====
    await setProgress(WON);
    await whole();
    await offer();
    const c3 = await choose('fragments');
    check(c3.who === 'O Carrasco Coroado' && /^Aceitar a culpa é aceitar/.test(c3.say) && c3.cine && !c3.open, `Carregar os fragmentos: o Carrasco Coroado fala uma vez (${JSON.stringify(c3)})`);
    // a luz o levanta para baixo do núcleo; um clarão, e o núcleo apaga com ele dentro
    await until(() => !window.__scene.player.sprite.visible, null, 120000);
    await waitGame(0.3);
    const gone = await page.evaluate(() => { const p = window.__scene.player; return { drift: !!p.drift, gravity: p.body.allowGravity, shown: p.sprite.visible, glow: p.runeGlow ? p.runeGlow.alpha : 0 }; });
    await shot('t7-silencio-nucleo');
    const f3 = await toFilm();
    check(gone.drift && !gone.gravity && !gone.shown && gone.glow === 0 && f3.ends.join() === 'ending:fragments' && f3.night && !f3.game,
      `a luz o leva para dentro do núcleo, que apaga; o save guarda o Final III (${JSON.stringify({ gone, f3 })})`);
    const v3 = await film('silencio');
    check(v3.last.on && v3.last.text === 'Que o mundo se lembre. Que o mundo continue.' && !v3.last.light && v3.card.kicker === 'Final III' && v3.card.title === 'O Último Silêncio' && v3.roll.on,
      `o filme do III termina na última frase, no nome do final e nos créditos (${JSON.stringify({ last: v3.last, card: v3.card })})`);
    // ele não volta: o título, com o penhasco vazio na manhã; o Continuar some e o Rever o final fica
    await until(() => document.querySelector('#screen-menu.show') && window.__game.scene.isActive('title'), null, 20000);
    await page.waitForTimeout(1800);
    const t3 = await menu();
    await page.screenshot({ path: `${OUT}/t7-silencio-titulo.png` });
    check(t3.title && !t3.game && t3.ended === 'Final III · O Último Silêncio' && !t3.cont && t3.film && !t3.knight && t3.dawn,
      `no Final III ele não volta: o título fica com o penhasco vazio na manhã, sem Continuar e com Rever o final (${JSON.stringify(t3)})`);
    // Rever o final: o filme do começo; Esc volta para o título, e o save continua o mesmo
    await page.evaluate(() => document.querySelector('#screen-menu [data-cmd="film"]').click());
    await until(() => window.__ending && window.__ending.scene.isActive() && window.__ending.replay && document.querySelector('#screen-film .film-line.on'), null, 20000);
    const rv = await page.evaluate(() => ({ phase: window.__ending.phase, kind: window.__ending.kind }));
    await page.keyboard.press('Escape');
    await until(() => document.querySelector('#screen-menu.show') && window.__game.scene.isActive('title'), null, 20000).catch(() => null);
    const rv2 = await page.evaluate(() => ({ menu: !!document.querySelector('#screen-menu.show'), ends: [...window.__progress.seen].filter((k) => k.startsWith('ending:')) }));
    check(rv.phase === 'shots' && rv.kind === 'fragments' && rv2.menu && rv2.ends.join() === 'ending:fragments',
      `Rever o final passa o filme do começo, e Esc volta para o título (${JSON.stringify({ rv, rv2 })})`);
  }

  console.log(errs.join('\n') || 'sem erros');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
