// Testa a Área 6, o Vale das Cachoeiras: a neve que fecha a descida na Clareira da Caça (desaba quando o
// Mestre da Caça cai), as passagens entre as oito salas nos dois sentidos, o Agrimensor na descida, os
// objetos dentro d'água (a célula deles vira água) e uma foto de cada sala.
// uso: node vale.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || process.env.GAME && process.env.GAME + '/index.html' || 'http://localhost:8765/index.html';
// ONLY=links,neve roda só essas partes (neve, links, agrimensor, agua, fotos)
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
