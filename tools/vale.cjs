// Testa a Área 6, o Vale das Cachoeiras: a neve que fecha a descida na Clareira da Caça (desaba quando o
// Mestre da Caça cai), as passagens entre as oito salas nos dois sentidos, o Agrimensor na descida, os
// objetos dentro d'água (a célula deles vira água) e uma foto de cada sala.
// uso: node vale.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || process.env.GAME && process.env.GAME + '/index.html' || 'http://localhost:8765/index.html';
// ONLY=links,neve roda só essas partes (neve, links, agrimensor, agua, nado, quedas, rio, alagada, gruta, presente, truta, garca, vagalumes, barqueiro, remo, lore, fotos)
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
  // espera o tempo do jogo; se uma memória decisiva pedir a escolha no meio (o cavaleiro encostou nela),
  // lembra como foi e segue
  const settle = async (sec) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    for (;;) {
      await page.waitForFunction((c) => window.__scene.clock >= c || !!document.querySelector('#screen-choice.show'), c0 + sec, { timeout: 60000, polling: 16 });
      if (!(await page.evaluate(() => !!document.querySelector('#screen-choice.show')))) return;
      await page.waitForTimeout(500);
      await page.click('#screen-choice [data-cmd="truth"]');
      await page.waitForFunction(() => !document.querySelector('.screen.show'), null, { timeout: 20000 });
    }
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
  const setProgress = (extra = [], abilities = ['wall', 'double', 'hook', 'veil', 'cape']) => page.evaluate(([extra, abilities]) => {
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
      // os ganchos de quadro das partes de antes continuam na cena (ela é a mesma): sem o registro, param
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

  if (part('neve')) {
    // ---------- 1. a neve na boca da descida ----------
    await setProgress();
    await start('clareira', '1');
    await clear();
    const plug = () => page.evaluate(() => {
      const s = window.__scene;
      const g = s.fixtures.locks[0];
      const t = s.level.layer.getTileAt(71, 26, true);
      return { n: s.fixtures.locks.length, key: g && g.key, snow: g && g.snow, open: g && g.open, solid: !!(t && t.index >= 0 && t.collides), vis: g && g.sprite.visible, alpha: g && g.sprite.alpha };
    });
    let k = await plug();
    check(k.n === 1 && k.key === 'boss:cacador' && k.snow && !k.open && k.solid, `a boca da descida está fechada pela neve (${JSON.stringify(k)})`);
    await page.evaluate(() => { const s = window.__scene; if (s.boss) { s.boss.alive = false; s.boss.state = 'dead'; } s.player.teleport(66 * 16, 29 * 16); s.player.invuln = 99; });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    let r = await P();
    check(r.room === 'clareira' && r.x < 71, `sem o Mestre da Caça vencido, a neve segura (x ${r.x.toFixed(1)})`);
    await shot('v01-neve-fechada');
    await page.evaluate(() => { window.__progress.seen.add('boss:cacador'); window.__scene.fixtures.openLocks('boss:cacador', true); });
    await waitGame(0.5);
    await shot('v02-neve-desabando');
    await waitGame(1.4);
    k = await plug();
    check(k.open && !k.solid && !k.vis, `com o Mestre da Caça vencido, a neve desaba e libera a boca (${JSON.stringify(k)})`);
    await page.evaluate(() => { const s = window.__scene; window.__oldPlayer = s.player; s.player.invuln = 99; });
    await page.keyboard.down('KeyD');
    await until(() => window.__scene && window.__scene.player !== window.__oldPlayer && window.__scene.room.id === 'descida' && !window.__scene.transitioning, null, 20000).catch(() => null);
    await page.keyboard.up('KeyD');
    await waitGame(1);
    r = await P();
    check(r.room === 'descida' && r.ground && r.x < 6, `pela boca aberta ele desce para A Descida (${r.room} x ${r.x.toFixed(1)} pés ${r.bottom.toFixed(1)})`);
    // quem volta numa clareira já vencida acha a passagem aberta
    await start('clareira', '1');
    k = await plug();
    check(k.open && !k.solid && !k.vis, `voltando à clareira, a passagem continua aberta (${JSON.stringify(k)})`);
  }

  if (part('links')) {
    // ---------- 2. as passagens entre as salas, nos dois sentidos ----------
    await setProgress(['boss:cacador']);
    const cross = async (room, entry, side, row, want, name) => {
      await start(room, entry);
      await clear();
      await page.evaluate(([side, row]) => {
        const s = window.__scene;
        const p = s.player;
        window.__oldPlayer = p;
        p.invuln = 99;
        if (side === 'right') { p.teleport(s.level.widthPx + 6, row * 16); p.body.setVelocity(200, 0); } else { p.teleport(-6, row * 16); p.body.setVelocity(-200, 0); }
      }, [side, row]);
      await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, 20000).catch(() => null);
      await waitGame(1.2);
      const r = await P();
      check(r.room === want && r.ground, `${name}: ${room} -> ${want} (chegou em ${r.room}, x ${r.x.toFixed(1)}, pés ${r.bottom.toFixed(1)}${r.ground ? '' : ', no ar'})`);
    };
    await cross('descida', '1', 'left', 13, 'clareira', 'descida pela esquerda');
    await cross('descida', '1', 'right', 39, 'prado', 'descida pela direita');
    await cross('prado', '1', 'left', 35, 'descida', 'prado pela esquerda');
    await cross('prado', '1', 'right', 35, 'riacho', 'prado pela direita');
    await cross('riacho', '1', 'left', 47, 'prado', 'riacho pela esquerda');
    await cross('riacho', '1', 'right', 47, 'prainha', 'riacho pelo arco de baixo');
    await cross('riacho', '1', 'right', 8, 'cachoeiras', 'riacho pela boca de cima');
    await cross('cachoeiras', '1', 'left', 101, 'riacho', 'cachoeiras por baixo');
    await cross('cachoeiras', '1', 'right', 8, 'gruta', 'cachoeiras por cima');
    await cross('gruta', '1', 'left', 14, 'cachoeiras', 'gruta pela esquerda');
    await cross('prainha', '1', 'left', 30, 'riacho', 'prainha pela esquerda');
    await cross('prainha', '1', 'right', 30, 'rio', 'prainha pela direita');
    await cross('rio', '1', 'left', 30, 'prainha', 'rio pela esquerda');
    await cross('rio', '1', 'right', 30, 'cais', 'rio pela direita');
    await cross('cais', '1', 'left', 30, 'rio', 'cais pela esquerda');
  }

  if (part('agrimensor')) {
    // ---------- 3. o Agrimensor espera no alto da descida e vende a folha do Vale ----------
    await setProgress(['boss:cacador']);
    await start('descida', '1');
    const sv = await page.evaluate(() => { const s = window.__scene; const n = s.npcs.list.find((n) => n.kind === 'surveyor'); return n ? { x: n.x / 16, y: n.y / 16 } : null; });
    check(!!sv, `o Agrimensor está na descida (${JSON.stringify(sv)})`);
    const region = await page.evaluate(() => window.__scene.regionHere ? window.__scene.regionHere() : null).catch(() => null);
    if (region !== null) check(region === 'vale', `a descida é do Vale das Cachoeiras (${region})`);
  }

  if (part('agua')) {
    // ---------- 4. o que está dentro d'água fica dentro d'água ----------
    await setProgress(['boss:cacador']);
    await start('prado', '1');
    const w = await page.evaluate(() => {
      const L = window.__scene.level;
      const spots = L.spawns.filter((sp) => '$()'.includes(sp.kind) && (L.ch(sp.tx - 1, sp.ty) === '~' || L.ch(sp.tx + 1, sp.ty) === '~'));
      return spots.map((sp) => `${sp.kind}@${sp.tx},${sp.ty}:${L.ch(sp.tx, sp.ty)}`);
    });
    check(w.length >= 3 && w.every((s) => s.endsWith(':~')), `o baú no fundo do poço e os bichos no raso ficam na água (${w.join(' ')})`);
  }

  // estado do cavaleiro na água
  const W = () => page.evaluate(() => {
    const s = window.__scene;
    const p = s.player;
    const b = p.body;
    const w = s.level.waterAt(p.x, b.center.y);
    return { x: p.x / 16, top: b.top, bottom: b.bottom, vy: b.velocity.y, vx: b.velocity.x, swim: p.swim, under: p.under, breath: p.breath, hp: p.hp,
      surface: w ? w.surface : null, ground: b.blocked.down, room: s.room.id, fall: p.fall, current: p.current, gliding: p.gliding, frozen: p.frozen };
  });
  const put = (x, y, vx = 0, vy = 0) => page.evaluate(([x, y, vx, vy]) => { const p = window.__scene.player; p.teleport(x * 16 + 8, y * 16); p.body.setVelocity(vx, vy); p.invuln = 99; }, [x, y, vx, vy]);
  // de pé no meio do tronco do meio do cais (ele boia indo e voltando uns 20 px em volta do lugar dele: na
  // ponta, o cavaleiro escorrega para a água)
  const putOnLog = () => page.evaluate(() => {
    const s = window.__scene;
    const l = s.vale.logs.find((k) => Math.abs(k.home - (38 * 16 + 8)) < 2);
    const p = s.player;
    p.teleport(l.body.center.x, l.body.top - 1);
    p.body.setVelocity(0, 0);
    p.invuln = 99;
  });
  const give = (a) => page.evaluate((a) => { window.__progress.abilities.add(a); window.__scene.applyProgress(); }, a);

  if (part('nado')) {
    // ---------- 6. a água funda sem a Concha: afunda devagar, pulo fraco, o fôlego acaba e volta ao chão ----------
    await setProgress(['boss:cacador']);
    await start('riacho', '1');
    await clear();
    // pisa na margem (o último chão firme) e cai no poço embaixo da ponte quebrada
    await put(50, 48);
    await waitGame(0.6);
    await put(66, 50);
    await waitGame(0.6);
    let w = await W();
    check(w.swim && w.under && w.vy > 20 && w.vy < 90, `sem a Concha ele afunda devagar no poço (swim ${w.swim}, vy ${w.vy.toFixed(0)})`);
    check(w.breath < 1, `o fôlego começa a acabar com a cabeça embaixo (${w.breath.toFixed(2)})`);
    // (a foto pode demorar: o fôlego enche de novo e ele volta para dentro do poço)
    await shot('v20-afundando');
    await put(66, 53);
    await until(() => window.__scene.player.body.blocked.down, null, 8000).catch(() => null);
    // o caminho do pulo, quadro a quadro, enquanto ele está na água (com o fôlego cheio, para dar tempo)
    await page.evaluate(() => {
      const s = window.__scene;
      s.player.refillBreath();
      s.respawning = false;
      s.player.frozen = false;
      window.__jump = { y0: s.player.body.top, top: s.player.body.top, out: false, log: [] };
      s.events.on('postupdate', () => { const p = s.player; const j = window.__jump; j.top = Math.min(j.top, p.body.top); if (!p.swim) j.out = true; if (j.log.length < 40) j.log.push([Math.round(p.body.top), p.swim ? 1 : 0, p.frozen ? 1 : 0, p.breath.toFixed(2), Math.round(p.x)].join(',')); });
    });
    await page.keyboard.press('Space');
    await waitGame(0.7);
    const jm = await page.evaluate(() => window.__jump);
    check(jm.y0 - jm.top > 8 && jm.y0 - jm.top < 64 && !jm.out, `o pulo do fundo é fraco e não tira ele da água (subiu ${(jm.y0 - jm.top).toFixed(0)} px)`);
    if (jm.out) console.log('  ' + jm.y0 + ' | ' + jm.log.join(' | '));
    await until(() => window.__scene.player.frozen, null, 8000).catch(() => null);
    await waitGame(1.2);
    w = await W();
    check(!w.swim && w.ground && Math.abs(w.x - 50.5) < 2 && w.hp === 5, `o fôlego acabou e a água devolveu ele à margem, sem machucar (x ${w.x.toFixed(1)}, vida ${w.hp})`);
    check(w.breath >= 0.99, `de volta, o fôlego enche (${w.breath.toFixed(2)})`);

    // ---------- 7. com a Concha: boia, nada, a braçada, pula para fora, não perde o fôlego ----------
    await give('swim');
    await put(66, 52);
    await waitGame(2.2);
    w = await W();
    check(w.swim && w.surface !== null && w.top < w.surface - 4 && w.top > w.surface - 30, `com a Concha ele boia com a cabeça para fora (alto ${w.top.toFixed(0)}, linha d'água ${w.surface})`);
    check(w.breath === 1, `com a Concha o fôlego não acaba (${w.breath})`);
    await shot('v21-boiando');
    // mergulha (baixo) e confere o fôlego embaixo
    await page.keyboard.down('KeyS');
    await waitGame(1.0);
    w = await W();
    await page.keyboard.up('KeyS');
    check(w.under && w.breath === 1, `mergulhado com a Concha, o fôlego continua cheio (embaixo ${w.under})`);
    // nada para a direita e para a esquerda
    const x0 = w.x;
    await page.keyboard.down('KeyD');
    await waitGame(0.6);
    await page.keyboard.up('KeyD');
    w = await W();
    check(w.x - x0 > 3, `nada para o lado (${x0.toFixed(1)} -> ${w.x.toFixed(1)})`);
    // a braçada embaixo d'água: um impulso maior que o nado, para onde ele aponta
    // (mergulha só um pouco, para o fundo não segurar a braçada; mede o pico logo depois dela)
    await page.keyboard.down('KeyS');
    await page.keyboard.down('KeyA');
    await waitGame(0.25);
    await page.evaluate(() => { const s = window.__scene; window.__stroke = { v: 0, vx: 0, swim: false }; s.events.on('postupdate', () => { const b = s.player.body; const v = Math.hypot(b.velocity.x, b.velocity.y); if (v > window.__stroke.v) window.__stroke = { v, vx: b.velocity.x, swim: s.player.swim }; }); });
    await page.keyboard.press('Space');
    await waitGame(0.1);
    const st = await page.evaluate(() => window.__stroke);
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyS');
    check(st.v > 230 && st.vx < 0 && st.swim, `a braçada empurra mais que o nado (${st.v.toFixed(0)} px/s, nado ${150})`);
    // volta à tona e pula para fora inteiro (segurando o pulo)
    await waitGame(2.0);
    await page.evaluate(() => { const s = window.__scene; window.__peak = 1e9; s.events.on('postupdate', () => { window.__peak = Math.min(window.__peak, s.player.body.bottom); }); });
    await page.keyboard.down('Space');
    await waitGame(0.45);
    await page.keyboard.up('Space');
    const peak = await page.evaluate(() => window.__peak);
    w = await W();
    check(peak < 49 * 16 - 20, `na linha d'água o pulo sai inteiro para fora (pés a ${(49 * 16 - peak).toFixed(0)} px acima da água)`);
    await shot('v22-pulando-fora');

    // ---------- 8. a passagem funda da prainha só se atravessa nadando ----------
    await start('prainha', '1');
    await clear();
    await put(96, 41);
    await page.keyboard.down('KeyS');
    await page.keyboard.down('KeyD');
    await until(() => window.__scene.player.x > 127 * 16, null, 12000).catch(() => null);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyS');
    w = await W();
    check(w.x > 126, `nadando, passa por baixo do paredão até a enseada (x ${w.x.toFixed(1)})`);
    await page.keyboard.down('KeyW');
    await waitGame(1.6);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('Space');
    await waitGame(0.45);
    await page.keyboard.up('Space');
    await waitGame(0.15);
    await page.keyboard.up('KeyD');
    await waitGame(0.8);
    w = await W();
    check(w.room === 'prainha' && w.ground && !w.swim && w.x > 131 && w.bottom <= 31 * 16 + 1, `sobe na enseada e sai na margem da casa (${w.room} x ${w.x.toFixed(1)}, pés ${(w.bottom / 16).toFixed(1)})`);
    await shot('v23-enseada');
  }

  if (part('quedas')) {
    // ---------- 9. as quedas d'água empurram para baixo; o dash atravessa de lado ----------
    await setProgress(['boss:cacador']);
    await start('descida', '1');
    await clear();
    await put(81.5, 30);
    await waitGame(0.3);
    let w = await W();
    check(w.fall > 0 && w.vy > 250, `dentro da queda da descida, a água empurra para baixo (vy ${w.vy.toFixed(0)})`);
    await shot('v24-queda');
    // do pedregulho do poço, o dash para a esquerda atravessa a queda até o nicho do baú
    await put(86, 35);
    await waitGame(0.5);
    await page.keyboard.down('KeyA');
    await waitGame(0.05);
    await page.keyboard.press('ShiftLeft');
    await waitGame(0.5);
    await page.keyboard.up('KeyA');
    await waitGame(0.4);
    w = await W();
    check(w.x < 81 && w.x > 75 && w.bottom <= 35 * 16 + 1, `o dash atravessa a queda de lado e entra no nicho (x ${w.x.toFixed(1)}, pés ${(w.bottom / 16).toFixed(1)})`);
    await shot('v25-nicho');
    // nas cachoeiras: pular dentro da queda não sobe; planar nela também não
    await start('cachoeiras', '1');
    await clear();
    await put(15, 60);
    await waitGame(0.2);
    await page.keyboard.press('Space');
    await waitGame(0.2);
    await page.keyboard.down('Space');
    await waitGame(0.6);
    w = await W();
    await page.keyboard.up('Space');
    check(w.fall > 0 && w.vy > 200 && !w.gliding, `na queda grande, o pulo e a capa não seguram (vy ${w.vy.toFixed(0)}, planando ${w.gliding})`);
    // na névoa do lado da queda, a capa sobe
    await put(12, 92);
    await page.keyboard.down('Space');
    await waitGame(1.2);
    w = await W();
    await page.keyboard.up('Space');
    check(w.gliding && w.vy < -60 && w.bottom < 88 * 16, `na névoa do lado da queda a capa abre e sobe (vy ${w.vy.toFixed(0)}, pés ${(w.bottom / 16).toFixed(1)})`);
    await shot('v26-nevoa');
  }

  if (part('rio')) {
    // ---------- 10. a correnteza leva quem nada; os troncos descem e seguram o peso ----------
    await setProgress(['boss:cacador'], ['wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    await start('rio', '1');
    await clear();
    await put(30, 39);
    await waitGame(0.2);
    const x0 = (await W()).x;
    await waitGame(1.5);
    let w = await W();
    check(w.current > 0 && w.x - x0 > 3, `parado na água, a correnteza leva para a direita (${x0.toFixed(1)} -> ${w.x.toFixed(1)}, ${w.current} px/s)`);
    // em cima do primeiro tronco
    const log = await page.evaluate(() => { const l = window.__scene.vale.logs[0]; return { x: l.body.center.x / 16, top: l.body.top }; });
    await page.evaluate((l) => { const p = window.__scene.player; p.teleport(l.x * 16, l.top - 30); p.body.setVelocity(0, 0); }, log);
    await waitGame(0.8);
    const a = await page.evaluate(() => { const s = window.__scene; const l = s.vale.logs[0]; const p = s.player; return { px: p.x, lx: l.body.center.x, on: p.body.blocked.down && Math.abs(p.body.bottom - l.body.top) < 3, load: l.load }; });
    await waitGame(1.0);
    const b2 = await page.evaluate(() => { const s = window.__scene; const l = s.vale.logs[0]; const p = s.player; return { px: p.x, lx: l.body.center.x, on: p.body.blocked.down && Math.abs(p.body.bottom - l.body.top) < 3, load: l.load }; });
    check(a.on && b2.on && a.load > 0.5, `de pé no tronco, ele afunda um pouco com o peso (carga ${a.load.toFixed(2)})`);
    check(b2.lx - a.lx > 15 && Math.abs((b2.px - a.px) - (b2.lx - a.lx)) < 6, `o tronco desce o rio e leva ele junto (tronco ${(b2.lx - a.lx).toFixed(0)} px, ele ${(b2.px - a.px).toFixed(0)} px)`);
    await shot('v27-tronco');
    // no fim do trecho o tronco afunda e volta no começo
    await page.evaluate(() => { const l = window.__scene.vale.logs[0]; l.body.reset(l.seg[1] - 40, l.surface - 3); window.__scene.player.teleport(5 * 16, 31 * 16); });
    await waitGame(2.6);
    const c = await page.evaluate(() => { const l = window.__scene.vale.logs[0]; return { x: l.body.center.x / 16, seg: l.seg.map((v) => v / 16) }; });
    check(c.x < c.seg[0] + 8, `no fim do trecho o tronco afunda e volta lá no começo (x ${c.x.toFixed(1)}, trecho ${c.seg.join('-')})`);
    // no lago do cais os troncos boiam no lugar
    await start('cais', '1');
    const d0 = await page.evaluate(() => window.__scene.vale.logs.map((l) => l.body.center.x));
    await waitGame(2);
    const d1 = await page.evaluate(() => window.__scene.vale.logs.map((l) => l.body.center.x));
    check(d0.length === 3 && d0.every((x, i) => Math.abs(d1[i] - x) < 40), `os três troncos do cais boiam no lugar (${d0.map((x) => (x / 16).toFixed(1)).join(', ')})`);
  }

  if (part('alagada')) {
    // ---------- 11. a galeria de baixo da Galeria Alagada: só nadando ----------
    await setProgress(['boss:cacador']);
    await start('alagada', '1');
    await clear();
    const cache = await page.evaluate(() => { const L = window.__scene.level; const sp = L.spawns.filter((s) => s.kind === '$' && s.ty > 34); return sp.map((s) => ({ x: s.tx, y: s.ty, c: L.ch(s.tx, s.ty) })); });
    check(cache.length === 1 && cache[0].c === '~', `o baú da galeria de baixo está debaixo d'água (${JSON.stringify(cache)})`);
    // sem a Concha: afunda pelo poço da sexta bacia e o fôlego acaba antes de chegar lá embaixo
    await put(22, 23);
    await waitGame(0.5);
    await put(67, 25);
    await until(() => window.__scene.player.frozen, null, 9000).catch(() => null);
    let w = await W();
    check(w.frozen && w.bottom / 16 < 37, `sem a Concha, o fôlego acaba antes do fundo (pés ${(w.bottom / 16).toFixed(1)})`);
    await waitGame(1.5);
    // com a Concha: nada até o baú e volta
    await give('swim');
    await put(67, 25);
    await page.keyboard.down('KeyS');
    await until(() => window.__scene.player.body.bottom > 38 * 16, null, 8000).catch(() => null);
    await page.keyboard.up('KeyS');
    await page.keyboard.down('KeyD');
    await until(() => window.__scene.player.x > 77 * 16, null, 8000).catch(() => null);
    await page.keyboard.up('KeyD');
    w = await W();
    check(w.x > 76 && w.bottom / 16 > 37, `com a Concha ele nada até o fundo da galeria de baixo (x ${w.x.toFixed(1)}, pés ${(w.bottom / 16).toFixed(1)})`);
    await shot('v28-galeria-de-baixo');
  }

  if (part('gruta')) {
    // ---------- 12. a câmara escondida da gruta: bolsão de ar no fim da passagem alagada ----------
    await setProgress(['boss:cacador'], ['wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    await start('gruta', '1');
    await clear();
    const pocket = await page.evaluate(() => { const L = window.__scene.level; return { water: L.waterAt(69 * 16 + 8, 31 * 16 + 8), ledge: L.solidCell(74, 31) && !L.solidCell(74, 30), chest: L.spawns.filter((s) => s.kind === '$').map((s) => [s.tx, s.ty]) }; });
    check(pocket.water && pocket.water.air && pocket.water.surface === 31 * 16 + 3 && pocket.ledge, `a câmara escondida tem água até a boca da passagem e a laje seca do baú (${JSON.stringify(pocket)})`);
    await put(50, 26);
    await page.keyboard.down('KeyS');
    await until(() => window.__scene.player.body.bottom > 33 * 16, null, 8000).catch(() => null);
    await page.keyboard.down('KeyD');
    await until(() => window.__scene.player.x > 68.5 * 16, null, 10000).catch(() => null);
    await page.keyboard.up('KeyS');
    await page.keyboard.up('KeyD');
    let w = await W();
    check(w.x > 68 && w.swim, `com a Concha ele passa pela passagem alagada até a câmara (x ${w.x.toFixed(1)})`);
    await page.keyboard.down('KeyW');
    await waitGame(1.4);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('Space');
    await waitGame(0.45);
    await page.keyboard.up('Space');
    await waitGame(0.25);
    await page.keyboard.up('KeyD');
    await waitGame(0.8);
    w = await W();
    check(w.ground && !w.swim && w.x > 72 && Math.abs(w.bottom - 31 * 16) < 2, `sai da água na laje do baú, no bolsão de ar (x ${w.x.toFixed(1)}, pés ${(w.bottom / 16).toFixed(1)})`);
    await shot('v29-bolsao');
  }

  if (part('presente')) {
    // ---------- 13. o presente cinzento: dentro do trecho o cinza abre em volta dele e a flor cai ----------
    await setProgress(['boss:cacador']);
    await start('prado', '1');
    await clear();
    await put(56, 33);
    await waitGame(0.6);
    let v = await page.evaluate(() => { const V = window.__scene.vale; return { k: V.pres.k, blooms: V.blooms.length }; });
    check(v.k === 0 && v.blooms >= 1, `fora do trecho o vale está inteiro (cinza ${v.k}, ${v.blooms} copa(s) no trecho)`);
    await put(76, 33);
    await waitGame(1.2);
    v = await page.evaluate(() => { const V = window.__scene.vale; const f = window.__scene.xp && window.__scene.xp.feed; return { k: V.pres.k, r: V.pres.r, bloom: Math.min(...V.blooms.map((b) => b.gs[0].alpha)), feed: f ? f.pres[3] : null }; });
    check(v.k > 0.95 && v.r > 150 && v.bloom < 0.3, `dentro do trecho o cinza abre em volta dele e a flor da árvore cai (cinza ${v.k.toFixed(2)}, raio ${v.r.toFixed(0)}, flor ${v.bloom.toFixed(2)})`);
    if (v.feed !== null) check(v.feed > 0.95, `o filtro recebe o cinza (${v.feed.toFixed(2)})`);
    await shot('v30-presente');
    await put(120, 33);
    await waitGame(2.0);
    v = await page.evaluate(() => { const V = window.__scene.vale; return { k: V.pres.k, bloom: Math.min(...V.blooms.map((b) => b.gs[0].alpha)) }; });
    check(v.k === 0 && v.bloom > 0.99, `longe do trecho o cinza fecha e a flor volta (cinza ${v.k.toFixed(2)}, flor ${v.bloom.toFixed(2)})`);
  }

  if (part('truta')) {
    // ---------- 14. a Truta de Âmbar: nada no poço, salta em quem fica na beira, cai de volta, se debate na
    // terra até a água; com ele nadando no mesmo poço, o bote embaixo d'água; morta, boia ----------
    await setProgress(['boss:cacador']);
    await start('descida', '1');
    await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'trout' && e.vanish) e.vanish(); window.__tr = s.enemies.find((e) => e.kind === 'trout'); s.player.invuln = 99; });
    const T = () => page.evaluate(() => { const e = window.__tr; const s = window.__scene; return e ? { st: e.state, x: e.zone.x / 16, y: e.zone.y / 16, alive: e.alive, wet: s.level.inWater(e.zone.x, e.zone.y), hp: e.hp, sy: e.sprite.y / 16, a: e.sprite.alpha } : null; });
    let t = await T();
    check(t && t.wet && t.st === 'swim', `a truta nada no poço da garganta (${JSON.stringify(t)})`);
    await waitGame(1.2);
    t = await T();
    check(t && t.wet && t.x >= 89 && t.x < 93, `ela fica dentro do poço (x ${t && t.x.toFixed(1)})`);
    const watch = () => page.evaluate(() => {
      const s = window.__scene;
      window.__trLog = { states: [], minY: 99999, hp0: s.player.hp, hurt: false };
      if (!window.__trHook) {
        window.__trHook = true;
        s.events.on('postupdate', () => { const e = window.__tr; const L = window.__trLog; if (!e || !L) return; if (L.states[L.states.length - 1] !== e.state) L.states.push(e.state); L.minY = Math.min(L.minY, e.zone.y); if (s.player.hp < L.hp0) { L.hurt = true; s.player.hp = L.hp0; s.player.invuln = 99; } });
      }
    });
    // o cavaleiro parado na beira do poço: ela vai para baixo dele, avisa e salta
    await put(93, 40);
    await watch();
    await page.evaluate(() => { window.__scene.player.invuln = 0; });
    await until(() => window.__trLog.states.includes('leap'), null, 15000).catch(() => null);
    await waitGame(0.25);
    await shot('v40-truta-salto');
    await waitGame(1.4);
    let lg = await page.evaluate(() => window.__trLog);
    check(lg.states.includes('stalk') && lg.states.includes('rise'), `ela vai para baixo dele e avisa antes de saltar (${lg.states.join(' > ')})`);
    check(lg.states.includes('leap'), `ela salta`);
    check(lg.minY / 16 < 40, `o salto passa da linha d'água até a altura dele (alto ${(lg.minY / 16).toFixed(1)})`);
    check(lg.hurt, `parado na beira, ele leva a mordida`);
    await page.evaluate(() => { window.__scene.player.invuln = 99; });
    await until(() => { const e = window.__tr; return e.state === 'swim' || e.state === 'sink'; }, null, 12000).catch(() => null);
    t = await T();
    lg = await page.evaluate(() => window.__trLog);
    check(t.wet && t.alive, `depois do salto ela volta para a água (${lg.states.join(' > ')})`);
    // jogada na terra: se debate aos pulos até a água, e apanha mais
    await page.evaluate(() => { const e = window.__tr; const s = window.__scene; s.player.teleport(112 * 16, 40 * 16); e.body.reset(97 * 16 + 8, 39 * 16); e.vel.set(0, 0); e.go('fall', 'hurt'); });
    await watch();
    // o golpe no primeiro instante em que ela se debate (no mesmo quadro)
    await page.evaluate(() => {
      const s = window.__scene;
      window.__flopHit = null;
      const fn = () => { const e = window.__tr; if (e.state !== 'flop' || window.__flopHit) return; const hp = e.hp; e.hit(80 * 16, 1, 'side'); window.__flopHit = { hp0: hp, hp: e.hp }; s.events.off('postupdate', fn); };
      s.events.on('postupdate', fn);
    });
    await until(() => window.__flopHit, null, 8000).catch(() => null);
    await waitGame(0.6);
    await shot('v41-truta-terra');
    const fh = await page.evaluate(() => window.__flopHit);
    check(fh && Math.abs(fh.hp0 - fh.hp - 1.5) < 0.01, `na terra o golpe tira mais (${fh && fh.hp0} -> ${fh && fh.hp})`);
    await until(() => { const e = window.__tr; const s = window.__scene; return e.alive && s.level.inWater(e.zone.x, e.zone.y); }, null, 12000).catch(() => null);
    t = await T();
    lg = await page.evaluate(() => window.__trLog);
    check(t.alive && t.wet, `se debatendo ela volta para o poço (${lg.states.join(' > ')}, x ${t.x.toFixed(1)})`);

    // o bote embaixo d'água: no Rio, nadando com a Concha no poço dela
    await setProgress(['boss:cacador'], ['wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    await start('rio', '1');
    await page.evaluate(() => {
      const s = window.__scene;
      for (const e of s.enemies) if (e.kind !== 'trout' && e.vanish) e.vanish();
      window.__tr = s.enemies.filter((e) => e.kind === 'trout').sort((a, b) => Math.abs(a.zone.x - 84 * 16) - Math.abs(b.zone.x - 84 * 16))[0];
      for (const e of s.enemies) if (e !== window.__tr && e.vanish) e.vanish();
      window.__tr.body.reset(80 * 16, 38 * 16);
      s.player.invuln = 99;
    });
    await put(72, 39);
    await watch();
    await page.evaluate(() => { window.__scene.player.invuln = 0; });
    await until(() => window.__trLog.states.includes('dart'), null, 12000).catch(() => null);
    await waitGame(0.15);
    await shot('v42-truta-bote');
    await waitGame(0.6);
    lg = await page.evaluate(() => window.__trLog);
    check(lg.states.includes('aim') && lg.states.includes('dart'), `nadando no poço dela, ela recua e dá o bote (${lg.states.join(' > ')})`);
    check(lg.hurt, `o bote acerta quem nada parado`);
    // morta, ela boia de barriga para cima até a linha d'água
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; const e = window.__tr; e.body.reset(76 * 16, 40 * 16); for (let i = 0; i < 3; i++) e.hit(60 * 16, 1, 'side'); });
    t = await T();
    check(!t.alive, `três golpes e ela morre`);
    await waitGame(1.6);
    t = await T();
    check(t.sy < 35, `morta, ela boia até a linha d'água (y ${t.sy.toFixed(1)}, linha 34.2)`);
    await shot('v43-truta-morta');
  }

  if (part('garca')) {
    // ---------- 15. a Garça Cinzenta: parada no raso; com ele na frente, o Z do pescoço e o bote; aparar deixa
    // tonta; apanhou, voa para outro ponto do raso ----------
    await setProgress(['boss:cacador']);
    await start('descida', '1');
    await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'heron' && e.vanish) e.vanish(); window.__hr = s.enemies.find((e) => e.kind === 'heron'); s.player.invuln = 99; });
    const G = () => page.evaluate(() => { const e = window.__hr; return e ? { st: e.state, x: e.pos.x / 16, y: e.pos.y / 16, wet: e.spot.wet, hp: e.hp, alive: e.alive, f: e.facing, spots: e.spots.length } : null; });
    let h = await G();
    check(h && h.st === 'stand' && h.wet && Math.abs(h.y - 29) < 0.05, `a garça fica parada no raso da garganta, os pés no fundo (${JSON.stringify(h)})`);
    const hwatch = () => page.evaluate(() => {
      const s = window.__scene;
      window.__hrLog = { states: [], hp0: s.player.hp, hurt: false };
      if (!window.__hrHook) {
        window.__hrHook = true;
        s.events.on('postupdate', () => { const e = window.__hr; const L = window.__hrLog; if (!e || !L) return; if (L.states[L.states.length - 1] !== e.state) L.states.push(e.state); if (s.player.hp < L.hp0) { L.hurt = true; s.player.hp = L.hp0; s.player.invuln = 99; } });
      }
    });
    // o cavaleiro entra no raso, na frente dela: ela encolhe o pescoço e dá o bote
    await put(79, 29);
    await hwatch();
    await page.evaluate(() => { window.__scene.player.invuln = 0; });
    await until(() => window.__hrLog.states.includes('cock'), null, 8000).catch(() => null);
    await waitGame(0.2);
    await shot('v44-garca-z');
    await until(() => window.__hrLog.states.includes('hold'), null, 6000).catch(() => null);
    await shot('v45-garca-bote');
    await waitGame(0.8);
    let hl = await page.evaluate(() => window.__hrLog);
    h = await G();
    check(hl.states.join(' ').includes('turn') || h.f === 1, `ela vira para ele (${hl.states.join(' > ')})`);
    check(hl.states.includes('cock') && hl.states.includes('stab') && hl.states.includes('hold'), `o Z do pescoço avisa e o bote vem (${hl.states.join(' > ')})`);
    check(hl.hurt, `parado na frente dela, ele leva o bote`);
    // aparar: o golpe encontra o bico no bote
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; s.player.teleport(79 * 16 + 8, 29 * 16); });
    await hwatch();
    await page.evaluate(() => {
      const s = window.__scene;
      window.__hrParry = null;
      const fn = () => { const e = window.__hr; if (e.state !== 'stab' || window.__hrParry) return; const b = e.beakBox; window.__hrParry = { ok: e.parry(new Phaser.Geom.Rectangle(b.centerX - 6, b.centerY - 6, 12, 12), s.player.x) }; s.events.off('postupdate', fn); };
      s.events.on('postupdate', fn);
    });
    await until(() => window.__hrParry, null, 8000).catch(() => null);
    const pr = await page.evaluate(() => window.__hrParry);
    h = await G();
    check(pr && pr.ok && h.st === 'stun', `aparar o bico deixa a garça tonta (${JSON.stringify(pr)}, ${h.st})`);
    // (a foto não para o jogo: o golpe vem antes dela)
    const tt = await page.evaluate(() => { const e = window.__hr; const r = { st: e.state, hp0: e.hp }; e.hit(window.__scene.player.x, 1, 'side'); r.hp = e.hp; r.st2 = e.state; return r; });
    check(Math.abs(tt.hp0 - tt.hp - 1.5) < 0.01 && tt.st === 'stun' && tt.st2 === 'stun', `tonta, o golpe tira mais e ela não foge (${tt.st}: ${tt.hp0} -> ${tt.hp}, ${tt.st2})`);
    await shot('v46-garca-tonta');
    // apanhou parada: voa para outro ponto do raso
    await page.evaluate(() => { const e = window.__hr; e.state = 'stand'; e.t = 0; e.hp = 3; window.__hrFrom = { x: e.pos.x, y: e.pos.y }; });
    await hwatch();
    await page.evaluate(() => window.__hr.hit(window.__scene.player.x, 1, 'side'));
    await until(() => window.__hrLog.states.includes('fly'), null, 6000).catch(() => null);
    await waitGame(0.3);
    await shot('v47-garca-voo');
    await until(() => window.__hrLog.states.includes('land'), null, 10000).catch(() => null);
    await waitGame(0.5);
    hl = await page.evaluate(() => window.__hrLog);
    h = await G();
    const from = await page.evaluate(() => window.__hrFrom);
    const solid = await page.evaluate(() => { const e = window.__hr; const L = window.__scene.level; return L.solidCell(Math.floor(e.pos.x / 16), Math.floor(e.pos.y / 16)) && !L.solidCell(Math.floor(e.pos.x / 16), Math.floor(e.pos.y / 16) - 1); });
    check(hl.states.includes('takeoff') && hl.states.includes('fly') && hl.states.includes('land'), `apanhou: levanta voo e pousa (${hl.states.join(' > ')})`);
    check(Math.abs(h.x * 16 - from.x) > 60 && solid, `pousou em outro ponto, de pé no chão (x ${(from.x / 16).toFixed(1)} -> ${h.x.toFixed(1)}, pés ${h.y.toFixed(1)}, raso ${h.wet})`);
    await page.evaluate(() => { const e = window.__hr; for (let i = 0; i < 3; i++) e.hit(e.pos.x - 20, 1, 'side'); });
    h = await G();
    check(!h.alive, `três golpes e ela cai`);
    // as do Prado: nas beiradas rasas do lago, com a água na canela
    await start('prado', '1');
    const pr2 = await page.evaluate(() => window.__scene.enemies.filter((e) => e.kind === 'heron').map((e) => ({ x: e.pos.x / 16, y: e.pos.y / 16, wet: e.spot.wet })));
    check(pr2.length === 2 && pr2.every((q) => q.wet && Math.abs(q.y - 37) < 0.05), `as duas garças do Prado ficam no raso da beirada (${JSON.stringify(pr2)})`);
  }

  if (part('vagalumes')) {
    // ---------- 16. os Vaga-lumes do Eclipse: o enxame flutua em casa, vai atrás dele devagar, machuca no
    // miolo e um golpe espalha; no EXTREME apaga a luz em volta ----------
    await setProgress(['boss:cacador']);
    await start('descida', '1');
    await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind !== 'motes' && e.vanish) e.vanish(); window.__mt = s.enemies.filter((e) => e.kind === 'motes'); s.player.invuln = 99; s.player.teleport(10 * 16 + 8, 13 * 16); });
    const M = () => page.evaluate(() => window.__mt.map((e) => ({ st: e.state, x: e.zone.x / 16, y: e.zone.y / 16, hx: e.home.x / 16, hy: e.home.y / 16, alive: e.alive, n: e.motes.filter((m) => m.img.active && m.img.alpha > 0.1).length })));
    let m = await M();
    check(m.length === 2 && m.every((q) => q.alive && q.n === 9), `dois enxames na Descida, nove pontos cada (${m.length})`);
    await waitGame(1.5);
    m = await M();
    check(m.every((q) => q.st === 'drift' && Math.hypot(q.x - q.hx, q.y - q.hy) < 3), `longe dele, flutuam em volta de casa (${m.map((q) => q.st + ' ' + Math.hypot(q.x - q.hx, q.y - q.hy).toFixed(1)).join(', ')})`);
    // ele chega perto: o enxame vem atrás, devagar
    // (de pé no pilar da garganta: o enxame do nicho fica a uns 7 tiles)
    await put(86, 35);
    await page.evaluate(() => { const p = window.__scene.player; window.__mt.sort((a, b) => Math.hypot(a.zone.x - p.x, a.zone.y - p.y) - Math.hypot(b.zone.x - p.x, b.zone.y - p.y)); });
    const d0 = await page.evaluate(() => { const e = window.__mt[0]; const p = window.__scene.player; return Math.hypot(p.x - e.zone.x, p.body.center.y - e.zone.y); });
    await waitGame(1.5);
    const d1 = await page.evaluate(() => { const e = window.__mt[0]; const p = window.__scene.player; return { d: Math.hypot(p.x - e.zone.x, p.body.center.y - e.zone.y), st: e.state, v: Math.hypot(e.body.velocity.x, e.body.velocity.y) }; });
    check(d1.st === 'chase' && d1.d < d0 - 30 && d1.v < 60, `com ele perto, o enxame vai atrás devagar (${d0.toFixed(0)} -> ${d1.d.toFixed(0)} px, ${d1.v.toFixed(0)} px/s)`);
    await shot('v48-vagalumes');
    const xp = await page.evaluate(() => !!window.__scene.xp);
    if (xp) {
      const neg = await page.evaluate(() => { const f = window.__scene.xp.feed; let k = 0; for (let i = 0; i < f.lightCount; i++) if (f.lights[i * 4 + 3] < 0) k++; return k; });
      check(neg >= 1, `no EXTREME o enxame vira uma luz ao contrário (${neg})`);
    }
    await page.evaluate(() => { const s = window.__scene; window.__mtHp = s.player.hp; s.player.invuln = 0; });
    await until(() => window.__scene.player.hp < window.__mtHp, null, 8000).catch(() => null);
    const hurt = await page.evaluate(() => window.__scene.player.hp < window.__mtHp);
    check(hurt, `o miolo do enxame machuca`);
    await page.evaluate(() => { window.__scene.player.invuln = 99; window.__mt[0].hit(window.__scene.player.x, 1, 'side'); });
    await waitGame(1.4);
    m = await M();
    check(!m[0].alive && m[0].n === 0, `um golpe espalha o enxame e os pontos apagam (${JSON.stringify(m[0])})`);
  }

  if (part('barqueiro')) {
    // ---------- 18. O Barqueiro: de pé no barco, esperando; acorda e a grade fecha; a varrida mira na altura de
    // onde o cavaleiro pisa (tronco, margem ou nadando), a pancada solta ondas pela linha d'água, a corda reboca
    // até a estocada (dois golpes arrebentam), o casco afunda os troncos; na metade afunda e sobe por baixo, a
    // cachoeira vira Âmbar e puxa o lago; vencido, o barco atraca no cais ----------
    await setProgress(['boss:cacador'], ['wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    await page.evaluate(() => {
      const ui = window.__ui;
      window.__says = [];
      window.__thoughts = [];
      if (ui.__bqHooked) return;
      ui.__bqHooked = true;
      const os = ui.say.bind(ui);
      ui.say = (n, t, h) => { window.__says.push(t); return os(n, t, h); };
      const ot = ui.thought.bind(ui);
      ui.thought = (t, h) => { window.__thoughts.push(t); return ot(t, h); };
    });
    await start('cais', '1');
    await page.evaluate(() => window.__scene.player.setWeapon('scythe'));
    const B = () => page.evaluate(() => {
      const s = window.__scene;
      const b = s.boss;
      return { state: b.state, anim: b.anim, hp: +b.hp.toFixed(1), alive: b.alive, x: +(b.x / 16).toFixed(2), f: b.facing, phase2: b.phase2, sink: Math.round(b.sinkY), waves: b.waves.length, hook: !!b.hook, tow: !!s.player.tow, amber: +s.vale.amberK.toFixed(2), pull: s.vale.pullV, pole: b.pole.visible };
    });
    let b = await B();
    check(b.state === 'sleep' && b.anim === 'sleep' && b.pole, `de pé no barco, a vara em pé na água, esperando (${JSON.stringify(b)})`);
    await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; });
    await put(4, 31);
    await waitGame(0.5);
    await shot('b01-esperando');
    await page.keyboard.down('KeyD');
    await until(() => window.__scene.boss.state !== 'sleep', null, 20000).catch(() => null);
    await page.keyboard.up('KeyD');
    const gate = await page.evaluate(() => window.__scene.level.tileAt(6 * 16 + 8, 28 * 16 + 8));
    check(gate >= 2, `acorda e a grade da entrada fecha (${gate})`);
    await waitGame(0.9);
    await shot('b02-passagem');
    await until(() => window.__scene.boss.state === 'idle', null, 20000);
    const bar = await page.evaluate(() => document.querySelector('#bossbar p').textContent);
    check(bar === 'O Barqueiro', `barra de vida do chefe (${bar})`);
    // segura o chefe parado, sem pensar, num lugar
    const hush = (tx, f) => page.evaluate(([tx, f]) => {
      const s = window.__scene;
      const b = s.boss;
      b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
      b.toIdle();
      // parado de pé no barco (se estava embaixo d'água, volta à tona: senão nenhum golpe pega)
      b.sinkY = 0;
      b.waves = [];
      b.hook = null;
      s.player.tow = null;
      b.vx = 0;
      if (tx !== undefined) b.x = tx * 16 + 8;
      if (f) b.facing = f;
      b.sync();
    }, [tx, f]);
    const rec = (probe) => page.evaluate((probe) => {
      const s = window.__scene;
      const b = s.boss;
      const fn0 = probe ? new Function('s', 'b', 'p', probe) : null;
      window.__rec = { states: [], hurt: [], probe: null };
      const p = s.player;
      if (!p.__wrapped) {
        const orig = p.hurt.bind(p);
        p.hurt = (fx) => { const r = orig(fx); if (r && window.__rec) { window.__rec.hurt.push({ state: s.boss && s.boss.state }); p.hp = 5; } return r; };
        p.__wrapped = true;
      }
      if (window.__unrec) window.__unrec();
      const fn = () => {
        const R = window.__rec;
        if (R.states[R.states.length - 1] !== b.state) R.states.push(b.state);
        if (fn0 && R.probe === null) { const v = fn0(s, b, s.player); if (v) R.probe = v; }
      };
      s.events.on('postupdate', fn);
      window.__unrec = () => s.events.off('postupdate', fn);
    }, probe);
    const force = async (a, probe, band) => {
      await rec(probe);
      await page.evaluate(([a, band]) => {
        const b = window.__scene.boss;
        b.thinkT = 99;
        b.startAttack(a);
        if (band) { b.band = band; b.play(`sweepwind-${band}`); }
      }, [a, band]);
    };
    const idle = () => until(() => window.__scene.boss.state === 'idle', null, 20000);
    const R = () => page.evaluate(() => window.__rec);
    const ready = (inv = 0) => page.evaluate((inv) => { const p = window.__scene.player; p.invuln = inv; p.hp = 5; }, inv);
    // a altura da vara onde o cavaleiro está, com ela de lado (px acima dos pés dele)
    const POLEY = 'if (b.state !== "sweep") return null; const v = b.geo(); if (!v || v.pf < 0.9 || (v.tx - v.bx) * b.facing <= 0) return null; const k = (p.x - v.bx) / (v.tx - v.bx); if (k < 0 || k > 1) return { miss: true, tip: v.tx / 16 }; return { above: +(p.body.bottom - (v.by + (v.ty - v.by) * k)).toFixed(1), feet: +(p.body.bottom / 16).toFixed(2), band: b.band, sup: b.support, gy: +(b.groundY / 16).toFixed(2), ground: p.onGround };';

    // 1. varrida baixa num tronco: mira a canela dele; parado, apanha
    await hush(31, 1);
    await putOnLog();
    await until(() => window.__scene.player.body.blocked.down, null, 5000).catch(() => null);
    await waitGame(0.3);
    await ready();
    await force('sweep', POLEY, 'lo');
    await until(() => window.__rec.states.includes('sweeprec'), null, 20000);
    let rr = await R();
    check(rr.probe && !rr.probe.miss && Math.abs(rr.probe.above - 11) < 6, `a varrida baixa passa na canela de quem está no tronco (${JSON.stringify(rr.probe)})`);
    check(rr.hurt.length > 0, `parado no tronco, a vara baixa acerta (${rr.states.join(' > ')})`);
    await idle();
    // 2. varrida alta no mesmo tronco: na altura da cabeça; agachado, passa por cima
    await hush(31, 1);
    await putOnLog();
    await waitGame(0.4);
    await ready();
    await page.keyboard.down('KeyS');
    await waitGame(0.2);
    await force('sweep', POLEY, 'hi');
    await waitGame(0.75);
    await shot('b03-varrida-alta');
    await until(() => window.__rec.states.includes('sweeprec'), null, 20000);
    await page.keyboard.up('KeyS');
    rr = await R();
    check(rr.probe && !rr.probe.miss && Math.abs(rr.probe.above - 37) < 6, `a varrida alta passa na altura da cabeça (${JSON.stringify(rr.probe)})`);
    check(rr.hurt.length === 0, `agachado no tronco, a vara alta passa por cima (${rr.hurt.length})`);
    await idle();
    // 3. na margem do cais: a varrida baixa mira mais alto (o chão dele é mais alto)
    await hush(56, 1);
    await put(64, 31);
    await waitGame(0.5);
    await ready();
    await force('sweep', POLEY, 'lo');
    await until(() => window.__rec.states.includes('sweeprec'), null, 20000);
    rr = await R();
    check(rr.probe && !rr.probe.miss && Math.abs(rr.probe.above - 11) < 6, `no cais, a varrida baixa sobe junto com o chão dele (${JSON.stringify(rr.probe)})`);
    await idle();
    // 4. nadando: rente à água; boiando apanha, mergulhado passa por cima
    await hush(31, 1);
    await put(40, 34);
    await waitGame(0.8);
    await ready();
    await force('sweep', POLEY);
    await waitGame(0.75);
    await shot('b04-varrida-agua');
    await until(() => window.__rec.states.includes('sweeprec'), null, 20000);
    rr = await R();
    const sw = await page.evaluate(() => { const s = window.__scene; return { swim: s.player.swim, band: s.boss.band }; });
    check(sw.swim && sw.band === 'lo' && rr.hurt.length > 0, `boiando, a vara passa rente à água e acerta (${JSON.stringify(sw)} ${rr.hurt.length})`);
    await idle();
    await hush(31, 1);
    await put(40, 38);
    await waitGame(0.2);
    await ready();
    await page.keyboard.down('KeyS');
    await force('sweep');
    await until(() => window.__rec.states.includes('sweeprec'), null, 20000);
    await page.keyboard.up('KeyS');
    rr = await R();
    check(rr.hurt.length === 0, `mergulhado, a vara passa por cima (${rr.hurt.length})`);
    await idle();
    // 5. a pancada: a onda corre pela linha d'água, balança os troncos e pega quem está de pé num tronco
    await hush(40, 1);
    await put(50, 32);
    await until(() => window.__scene.player.body.blocked.down, null, 5000).catch(() => null);
    await waitGame(0.3);
    await ready();
    await force('slam', 'return b.waves.length ? { n: b.waves.length, x: b.waves.map((w) => +(w.x / 16).toFixed(1)) } : null;');
    await until(() => window.__rec.states.includes('slamrec'), null, 20000);
    await waitGame(0.35);
    await shot('b05-onda');
    await waitGame(0.6);
    rr = await R();
    check(rr.probe && rr.probe.n === 2, `a vara bate na água e solta uma onda para cada lado (${JSON.stringify(rr.probe)})`);
    check(rr.hurt.length > 0, `de pé no tronco, a onda pega (${rr.hurt.length})`);
    await idle();
    // 6. a corda: da margem, o gancho prende, reboca até a ponta da vara e vem a estocada
    await hush(19, -1);
    await put(10, 31);
    await waitGame(0.4);
    await ready();
    const x0 = (await P()).x;
    await force('rope', 'return s.player.tow ? { towed: true } : null;');
    await until(() => window.__rec.states.includes('jabrec') || window.__rec.states.includes('ropeback'), null, 20000);
    rr = await R();
    let pp = await P();
    check(rr.probe && rr.probe.towed && rr.states.includes('pull') && rr.states.includes('jab'), `o gancho prende e a corda reboca até a estocada (${rr.states.join(' > ')})`);
    check(pp.x > x0 + 3, `rebocado da margem para o lago (${x0.toFixed(1)} -> ${pp.x.toFixed(1)})`);
    await shot('b06-corda');
    await idle();
    // 7. dois golpes na corda arrebentam e ele perde o equilíbrio
    await hush(25, -1);
    await put(10, 31);
    await waitGame(0.4);
    await ready();
    await page.evaluate(() => {
      const s = window.__scene;
      const b = s.boss;
      // um golpe a cada 0,3 s enquanto estiver preso na corda
      let n = 0;
      let last = 0;
      const fn = () => {
        const t = s.player.tow;
        const now = performance.now();
        if (t && n < 6 && now - last > 300) {
          n++;
          last = now;
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' })), 70);
        }
        if (b.state === 'stagger' || b.state === 'jab' || b.state === 'idle') s.events.off('postupdate', fn);
      };
      s.events.on('postupdate', fn);
    });
    await force('rope');
    await until(() => window.__rec.states.includes('stagger') || window.__rec.states.includes('jab'), null, 20000);
    rr = await R();
    check(rr.states.includes('stagger') && !rr.states.includes('jab'), `dois golpes arrebentam a corda e ele cambaleia (${rr.states.join(' > ')})`);
    await idle();
    // 8. o casco por cima de um tronco afunda o tronco e quem estava de pé cai na água
    await hush(30, 1);
    await putOnLog();
    await until(() => window.__scene.player.body.blocked.down, null, 5000).catch(() => null);
    await waitGame(0.3);
    await page.evaluate(() => { const b = window.__scene.boss; b.goal = 38 * 16 + 8; b.go('pole', 'pole'); });
    await waitGame(2.2);
    const dk = await page.evaluate(() => { const s = window.__scene; const l = s.vale.logs.find((k) => Math.abs(k.home - (38 * 16 + 8)) < 2); return { dunk: +l.dunk.toFixed(2), swim: s.player.swim, bx: +(s.boss.x / 16).toFixed(1) }; });
    check(dk.dunk > 0.6 && dk.swim, `o barco passa por cima do tronco, afunda ele e o cavaleiro cai na água (${JSON.stringify(dk)})`);
    await shot('b07-tronco');
    await idle().catch(() => null);
    // 9. segunda fase: afunda, as bolhas seguem, avisam e ele sobe por baixo; a cachoeira vira Âmbar e puxa
    await page.evaluate(() => { const b = window.__scene.boss; delete b.toIdle; b.hp = b.maxHp * 0.52; b.thinkT = 0.5; });
    await hush();
    await page.evaluate(() => { const b = window.__scene.boss; delete b.toIdle; });
    await put(46, 34);
    await ready(99);
    await rec();
    await page.evaluate(() => { const b = window.__scene.boss; b.hit(b.x - 30, 2, 'side'); });
    await until(() => window.__scene.boss.state === 'under', null, 20000);
    await waitGame(1.4);
    b = await B();
    check(b.phase2 && b.amber > 0.5 && b.pull > 0, `na metade ele afunda e a cachoeira vira Âmbar e puxa (${JSON.stringify(b)})`);
    await shot('b08-ambar');
    await until(() => window.__scene.boss.state === 'bubbles', null, 20000);
    await waitGame(0.5);
    await shot('b09-bolhas');
    await until(() => window.__rec.states.includes('surge'), null, 20000);
    await waitGame(0.12);
    await shot('b10-sobe');
    rr = await R();
    check(['sink', 'under', 'bubbles', 'surge'].every((k) => rr.states.includes(k)), `afunda, as bolhas seguem e ele sobe por baixo (${rr.states.join(' > ')})`);
    // a correnteza puxa o cavaleiro parado na água para a cachoeira
    await hush(20, 1);
    await page.evaluate(() => { const s = window.__scene; s.vale.setPull(58); s.vale.amber(1); });
    await put(30, 35);
    await waitGame(1.5);
    pp = await P();
    check(pp.x > 30.6, `a correnteza do lago leva para o pé da cachoeira (${pp.x.toFixed(1)})`);
    // 10. a derrota: o barco vem até o cais, a lanterna acende, a fala, o livro de bordo no cais
    // (embaixo d'água o golpe não pega: bate de novo até ele estar à vista)
    await page.evaluate(() => { const b = window.__scene.boss; delete b.toIdle; b.hp = 1; });
    await until(() => { const b = window.__scene.boss; if (b.alive) b.hit(b.x - 30, 5, 'side'); return !b.alive; }, null, 20000);
    await settle(2.4);
    await shot('b11-derrota');
    await settle(5);
    const end = await page.evaluate(() => {
      const s = window.__scene;
      const b = s.boss;
      const n = s.records.list.find((k) => k.id === 'cais:0');
      return { seen: window.__progress.seen.has('boss:barqueiro'), says: window.__says, x: +(b.x / 16).toFixed(2), moor: b.moorX / 16, amber: s.vale.amberK, pull: s.vale.pullV, note: n && { x: n.x / 16, y: n.y / 16 }, lamp: b.lamp.alpha };
    });
    check(end.seen, 'vencer marca o chefe');
    check(end.says.some((t) => t.includes('Ela pagou as duas passagens')), `a fala dele (${end.says.join(' | ')})`);
    check(Math.abs(end.x - end.moor) < 0.2 && end.lamp > 0.5, `o barco atraca no cais com a lanterna acesa (${end.x} / ${end.moor}, ${end.lamp})`);
    check(end.amber < 0.2 && end.pull === 0, `a cachoeira volta a ser água (${end.amber})`);
    check(end.note && end.note.y === 31 && end.note.x > 62, `o livro de bordo cai no cais (${JSON.stringify(end.note)})`);
    await shot('b12-cais');
    // 11. voltando à sala: o barco atracado, a lanterna acesa, a memória e o livro no cais
    await start('cais', '1');
    const back = await page.evaluate(() => {
      const s = window.__scene;
      return { boss: !!s.boss, note: !!s.records.list.find((k) => k.id === 'cais:0'), mem: s.props.memories.some((m) => m.id === 'cais:boss') };
    });
    check(!back.boss && back.note && back.mem, `voltando, o barco fica atracado e o que ele deixou continua no cais (${JSON.stringify(back)})`);
    await put(70, 31);
    await waitGame(0.8);
    await shot('b13-atracado');
  }

  if (part('remo')) {
    // ---------- 19. o Remo do Barqueiro: cai no cais depois da luta; nadando, a remada leva o cavaleiro; de pé
    // num tronco, leva o tronco (e o tronco volta devagar); a pá empurra os inimigos para longe ----------
    await setProgress(['boss:cacador'], ['wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    await start('cais', '1');
    await page.evaluate(() => { window.__scene.player.setWeapon('scythe'); });
    await put(12, 31);
    await until(() => window.__scene.boss.state === 'idle', null, 20000);
    await page.evaluate(() => { const b = window.__scene.boss; b.hp = 1; b.hit(b.x - 30, 5, 'side'); });
    await until(() => !!window.__scene.weaponDrop && window.__scene.weaponDrop.ready, null, 20000);
    const drop = await page.evaluate(() => { const d = window.__scene.weaponDrop; return { id: d.id, x: +(d.x / 16).toFixed(2), y: +(d.y / 16).toFixed(2) }; });
    check(drop.id === 'remo' && drop.x > 62 && Math.abs(drop.y - 30) < 1.2, `o remo cai no cais (${JSON.stringify(drop)})`);
    await waitGame(0.3);
    await shot('r01-remo-no-cais');
    await put(Math.round(drop.x), 31);
    await until(() => window.__progress.seen.has('weapon:remo') && !window.__scene.cinematic, null, 20000).catch(() => null);
    const got = await page.evaluate(() => ({ seen: window.__progress.seen.has('weapon:remo'), claimed: window.__progress.claimed('remo') }));
    check(got.seen && got.claimed, `pegou o remo (${JSON.stringify(got)})`);
    await page.evaluate(() => { const s = window.__scene; s.player.setWeapon('remo'); s.player.invuln = 99; });
    const J = () => page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' })), 70);
    });
    // nadando, parado: a remada leva para a frente
    await put(26, 34);
    await waitGame(1.0);
    await page.evaluate(() => { window.__scene.player.facing = 1; });
    let a0 = await P();
    await waitGame(0.7);
    let a1 = await P();
    await page.evaluate(() => { window.__scene.player.facing = 1; });
    await J();
    await waitGame(0.25);
    await shot('r02-remada');
    await waitGame(0.6);
    let a2 = await P();
    check(Math.abs(a1.x - a0.x) < 0.8 && a2.x - a1.x > 4, `nadando, a remada leva o cavaleiro (parado ${(a1.x - a0.x).toFixed(2)}, remando ${(a2.x - a1.x).toFixed(2)})`);
    // de pé no tronco do meio: três remadas para a direita levam o tronco junto, com ele em cima
    const LG = () => page.evaluate(() => { const s = window.__scene; const l = s.vale.logs.find((k) => Math.abs(k.home - (38 * 16 + 8)) < 2); return { x: +(l.body.center.x / 16).toFixed(2), shift: Math.round(l.shift), top: l.body.top / 16 }; });
    await putOnLog();
    await until(() => window.__scene.player.body.blocked.down, null, 5000).catch(() => null);
    await waitGame(0.4);
    const l0 = await LG();
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { window.__scene.player.facing = 1; });
      await J();
      await waitGame(0.6);
    }
    await waitGame(0.8);
    const l1 = await LG();
    a2 = await P();
    check(l1.x - l0.x > 3.5 && Math.abs(a2.bottom - l1.top) < 0.3, `de pé no tronco, o remo leva o tronco com ele em cima (${l0.x} -> ${l1.x}, ${JSON.stringify(a2)})`);
    await shot('r03-tronco');
    // desce do tronco: ele volta devagar para o lugar
    await put(10, 31);
    await waitGame(4);
    const l2 = await LG();
    check(l2.shift < l1.shift && l2.x < l1.x, `sem ninguém em cima, o tronco volta devagar para o lugar (${l1.shift} -> ${l2.shift})`);
    // a pá empurra para longe: um rastejante leve na ponte
    await start('ponte', '1');
    await page.evaluate(() => { const s = window.__scene; s.player.setWeapon('remo'); s.player.invuln = 99; });
    const cr = await page.evaluate(() => { const s = window.__scene; const c = s.enemies.find((e) => e.kind === 'crawler'); if (!c) return null; c.hp = 99; return { x: c.zone.x / 16, bottom: c.body.bottom / 16 }; });
    check(!!cr, `há um rastejante na ponte (${JSON.stringify(cr)})`);
    if (cr) {
      await put(Math.floor(cr.x) - 3, Math.round(cr.bottom) - 1);
      await waitGame(0.3);
      const c0 = await page.evaluate(() => { const s = window.__scene; const c = s.enemies.find((e) => e.kind === 'crawler' && e.hp > 50); s.player.facing = Math.sign(c.zone.x - s.player.x) || 1; return { x: c.zone.x / 16, f: s.player.facing }; });
      await J();
      await waitGame(0.6);
      const c1 = await page.evaluate(() => { const c = window.__scene.enemies.find((e) => e.kind === 'crawler' && e.hp > 50); return { x: c.zone.x / 16, hp: c.hp }; });
      check(c1.hp < 99 && (c1.x - c0.x) * c0.f > 2.5, `a pá empurra o rastejante para longe (${c0.x.toFixed(2)} -> ${c1.x.toFixed(2)}, ${c1.hp})`);
    }
    // o Grimório: o eco do Barqueiro aparece com a vara e bate
    await setProgress(['boss:cacador', 'boss:barqueiro']);
    const w0 = await page.evaluate(() => { const w = window.__settings.data.weapon; window.__progress.starter = 'necro'; window.__settings.data.weapon = 'necro'; window.__settings.save(); window.__progress.save(); return w; });
    await start('ponte', '1');
    await waitGame(0.3);
    await page.evaluate(() => { const s = window.__scene; const p = s.player; s.magic.bossEcho('barqueiro', p.x + 70, p.body.bottom); });
    await until(() => window.__scene.magic.bosses.length > 0, null, 15000).catch(() => null);
    await waitGame(0.6);
    const eco = await page.evaluate(() => { const b = window.__scene.magic.bosses[0]; return b ? { pole: !!b.pole && b.pole.visible, anim: b.sprite.anims.currentAnim && b.sprite.anims.currentAnim.key, a: +b.pole.alpha.toFixed(2) } : null; });
    await shot('r04-eco-barqueiro');
    check(eco && eco.pole && eco.a > 0.5 && /barqueiro-(slamwind|slam)/.test(eco.anim), `o eco do Barqueiro aparece com a vara (${JSON.stringify(eco)})`);
    await page.evaluate((w0) => { window.__progress.starter = null; window.__settings.data.weapon = w0; window.__settings.save(); window.__progress.save(); }, w0);
  }

  if (part('lore')) {
    // ---------- 20. a lore do vale: os registros da gruta, da prainha e do rio (cada um no seu objeto), a
    // memória das cachoeiras e o nome na areia da prainha, que só fica parado depois que ele lembra o nome ----------
    await setProgress(['boss:cacador'], ['wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    const hook = () => page.evaluate(() => {
      const ui = window.__ui;
      window.__thoughts = [];
      window.__banners = [];
      window.__talks = [];
      if (ui.__hookedVale) return;
      ui.__hookedVale = true;
      const th = ui.thought.bind(ui);
      ui.thought = (text, ...rest) => { window.__thoughts.push(text); return th(text, ...rest); };
      const ob = ui.banner.bind(ui);
      ui.banner = (t, ...rest) => { window.__banners.push(t + ' | ' + (rest[0] || '')); return ob(t, ...rest); };
      const ot = ui.talk.bind(ui);
      ui.talk = (o) => { window.__talks.push({ name: o.name, lines: o.lines.slice() }); return ot(o); };
    });
    const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
    // fica na frente do registro, aperta para cima e fecha a conversa
    const read = async (id) => {
      const r = await page.evaluate((id) => { const k = window.__scene.records.list.find((q) => q.id === id); return k && { tx: (k.x - 8) / 16, fr: k.y / 16 }; }, id);
      if (!r) return null;
      await put(r.tx, r.fr);
      await page.evaluate(() => { const s = window.__scene; s.cameras.main.centerOn(s.player.x, s.player.body.center.y - 20); });
      await waitGame(0.5);
      const hint = await page.evaluate(() => { const s = window.__scene; const h = s.records.nearby(s.player); return h && h.hint; });
      await shot(`l-${id.replace(':', '-')}`);
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
      return t && { ...t, hint, seen, text: t.lines.join(' ') };
    };
    const recs = [
      ['gruta', 'gruta:0', 'A lista do que levar', /a concha\."/, /"ele"/],
      ['prainha', 'prainha:0', 'A planta da casa', /dois cômodos/, /nomes que ninguém mais vai pagar/],
      ['rio', 'rio:0', 'A ordem do aqueduto', /núcleo da Coroação/, /Casa Vhalor/],
    ];
    for (const [room, id, title, a, b] of recs) {
      await start(room, '1');
      await clear();
      await hook();
      const t = await read(id);
      check(t && t.hint === '{up} ler' && t.name === title && a.test(t.text) && b.test(t.text) && !/Arielle/.test(t.text), `o registro ${id} "${t && t.name}" (dica ${t && t.hint})`);
      check(t && t.seen && (await page.evaluate(() => window.__banners.some((x) => x.startsWith('Registro guardado no Diário')))), `${id} fica no Diário`);
    }
    // a ordem do aqueduto fica no trecho onde a lembrança falha: lendo, o vale em volta está cinza
    const grey = await page.evaluate(() => window.__scene.vale.pres.k);
    check(grey > 0.9, `a ordem do aqueduto está no presente cinzento (${grey.toFixed(2)})`);
    // a água fria: a memória do alto da torre das cachoeiras
    const take = (id) => page.evaluate((id) => {
      const s = window.__scene;
      const m = s.props.memories.find((k) => k.id === id);
      if (!m) return null;
      s.takeMemory(m);
      return document.getElementById('banner').textContent;
    }, id);
    await start('cachoeiras', '1');
    await clear();
    await hook();
    let bn = await take('cachoeiras:0');
    check(bn && /A água fria/.test(bn) && /carrasco/.test(bn) && !/Arielle/.test(bn), `a memória das cachoeiras (${bn && bn.trim().slice(0, 60)})`);
    // o nome na areia, antes de ele lembrar o nome dela: as letras escorregam
    await start('prainha', '1');
    await clear();
    await hook();
    bn = await take('prainha:0');
    check(bn && /O nome na areia/.test(bn) && /escorrega/.test(bn) && !/Arielle/.test(bn), `antes do nome, as letras na areia escorregam (${bn && bn.trim().slice(0, 60)})`);
    const memList = () => page.evaluate(() => [...document.querySelectorAll('#screen-map .map-memories li')].map((e) => e.textContent));
    await page.evaluate(() => window.__scene.openMap(false));
    await page.waitForTimeout(400);
    let ml = await memList();
    check(ml.some((x) => /O nome na areia/.test(x) && /escorrega/.test(x)) && ml.some((x) => /A água fria/.test(x)) && !ml.some((x) => /Arielle/.test(x)), `o Diário guarda as duas memórias do vale (${ml.length})`);
    await shot('l-memorias');
    await page.evaluate(() => window.__ui.closeAll());
    await page.evaluate(() => window.__scene.resumeGame());
    // ele lembra o nome dela (a memória da cabana): o nome que ela escreveu na areia fica parado
    await start('cabana', '1');
    await hook();
    await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); });
    bn = await take('cabana:0');
    check(bn && /O nome dela/.test(bn), `a memória do nome (${bn && bn.trim().slice(0, 40)})`);
    await waitGame(5.6);
    const th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /areia da prainha/.test(x) && /Arielle/.test(x)), `ele lembra do nome na areia (${th.join(' | ')})`);
    await page.evaluate(() => window.__scene.openMap(false));
    await page.waitForTimeout(400);
    ml = await memList();
    check(ml.some((x) => /O nome na areia/.test(x) && /Arielle/.test(x) && /ficam paradas/.test(x)), 'depois do nome, a memória da prainha mostra o nome dela parado na areia');
    await page.evaluate(() => window.__ui.closeAll());
    await page.evaluate(() => window.__scene.resumeGame());
  }

  if (part('fotos')) {
    // ---------- 5. uma foto de cada sala, no ponto que mostra mais dela ----------
    await setProgress(['boss:cacador']);
    const spots = [['descida', '1', 30, 20], ['descida', '1', 92, 40], ['prado', '1', 86, 34], ['riacho', '1', 64, 48], ['riacho', '1', 124, 22],
      ['cachoeiras', '1', 26, 90], ['cachoeiras', '1', 26, 30], ['gruta', '1', 50, 22], ['prainha', '1', 40, 31], ['prainha', '1', 128, 31],
      ['rio', '1', 60, 31], ['rio', '1', 120, 31], ['cais', '1', 50, 33], ['cais', '1', 90, 22]];
    let i = 0;
    for (const [room, entry, x, y] of spots) {
      await start(room, entry);
      await clear();
      await page.evaluate(([x, y]) => { const s = window.__scene; s.player.teleport(x * 16 + 8, y * 16); s.player.body.setVelocity(0, 0); s.player.invuln = 99; s.cameras.main.centerOn(x * 16, y * 16 - 40); }, [x, y]);
      await waitGame(1.2);
      await shot(`v1${String(i++).padStart(2, '0')}-${room}`);
    }
    check(true, `fotos das salas em ${OUT}`);
  }

  console.log(errs.join('\n') || 'sem erros');
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
