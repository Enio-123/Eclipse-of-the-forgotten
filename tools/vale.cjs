// Testa a Área 6, o Vale das Cachoeiras: a neve que fecha a descida na Clareira da Caça (desaba quando o
// Mestre da Caça cai), as passagens entre as oito salas nos dois sentidos, o Agrimensor na descida, os
// objetos dentro d'água (a célula deles vira água) e uma foto de cada sala.
// uso: node vale.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || process.env.GAME && process.env.GAME + '/index.html' || 'http://localhost:8765/index.html';
// ONLY=links,neve roda só essas partes (neve, links, agrimensor, agua, nado, quedas, rio, alagada, gruta, fotos)
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
