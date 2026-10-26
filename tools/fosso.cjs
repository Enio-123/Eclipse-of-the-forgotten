// Testa o caminho da Parte 2 da Área 2: o buraco ao pé da bigorna na Sala da Máscara leva ao
// Fosso dos Esquecidos (pintura, fundo de tinta, a trilha do Enio), a volta pelo poço (argola e
// garras), o fundo do fosso até o Leito do Abismo e a volta do Leito para o fosso.
// uso: node fosso.cjs <pasta-saida> [url]
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
      const st = await page.evaluate(() => { const s = window.__scene; return s && { room: s.room.id, tr: s.transitioning, p: { x: s.player.x / 16, y: s.player.body.bottom / 16, hp: s.player.hp } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 120) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const inRoom = (id, timeout = 30000) => until((id) => { const s = window.__scene; return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning; }, id, timeout);
  const setProgress = (extra = [], abilities = ['wall', 'double', 'hook']) => page.evaluate(([extra, ab]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', ...ab]);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', ...extra]) p.seen.add(k);
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
  const calm = () => page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.vanish) e.vanish(); s.player.invuln = 99; });
  const tp = (tx, ty, face) => page.evaluate(([tx, ty, face]) => { const p = window.__scene.player; p.teleport(tx * 16 + 8, ty * 16); p.body.setVelocity(0, 0); if (face) p.facing = face; }, [tx, ty, face]);
  const look = () => page.evaluate(() => {
    const s = window.__scene;
    const keys = new Set();
    for (const o of s.children.list) for (const k of [o.texture && o.texture.key, o.frame && o.frame.texture && o.frame.texture.key, o.displayTexture && o.displayTexture.key, o.displayFrame && o.displayFrame.texture && o.displayFrame.texture.key]) if (k) keys.add(k);
    return { id: s.room.id, music: s.room.music, terrain: keys.has(`terrain-${s.room.id}`), far: keys.has('fosso-far'), mid: keys.has('fosso-mid'), track: window.__audioTrack ? window.__audioTrack() : null };
  });

  // ---------- 1. a pedra ao pé da bigorna cedeu: o buraco leva ao fosso ----------
  await setProgress();
  await start('mascara', 'O0');
  await calm();
  const hole = await page.evaluate(() => {
    const s = window.__scene;
    const lv = s.level;
    const row = lv.h - 1;
    const cols = [];
    for (let c = 54; c <= 57; c++) cols.push(lv.tileAt(c * 16 + 8, row * 16 + 8));
    return { open: window.__progress.seen.has('weapon:corrente'), cols };
  });
  check(hole.open && hole.cols.every((t) => t < 2), `com a Corrente a pedra da bigorna já cedeu (${JSON.stringify(hole)})`);
  await tp(55, 20, 1);
  await inRoom('fosso');
  let r = await look();
  check(r.id === 'fosso', `cai no Fosso dos Esquecidos (${r.id})`);
  check(r.terrain && r.far && r.mid, `pedra tingida de tinta e os dois fundos do abismo (${r.terrain}, ${r.far}, ${r.mid})`);
  check(r.music === 'fosso', `toca a trilha do fosso (${r.music}, ${r.track})`);
  await until(() => window.__scene.player.onGround, null, 20000);
  let p = await page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, y: p.body.bottom / 16 }; });
  check(Math.abs(p.y - 28) < 0.2 && p.x > 30 && p.x < 40, `pousa na laje das máscaras (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  await waitGame(0.6);
  await shot('f01-laje');
  const vis = await page.evaluate(() => window.__progress.visited.has('fosso'));
  check(vis, 'o fosso entra nos lugares visitados');

  // ---------- 2. de volta pelo poço: a argola puxa e as garras sobem ----------
  await calm();
  await tp(35, 28, 1);
  await waitGame(0.4);
  const ring = await page.evaluate(() => { const s = window.__scene; const r = s.hookTarget(s.player); return r && { x: r.x / 16, y: r.y / 16 }; });
  check(ring && Math.abs(ring.x - 33.5) < 0.6 && Math.abs(ring.y - 19.5) < 0.6, `da laje a argola embaixo do poço está ao alcance (${JSON.stringify(ring)})`);
  const climb = await page.evaluate(() => new Promise((res) => {
    const s = window.__scene;
    const c = s.controls;
    const p = s.player;
    c.__orig = c.update.bind(c);
    const st = { t0: s.clock, lastJ: -9, hooked: false, wall: 0, dj: false, best: 99 };
    const stop = (out) => { c.update = c.__orig; res(out); };
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      const b = p.body;
      const t = s.clock - st.t0;
      st.best = Math.min(st.best, b.bottom / 16);
      if (s.transitioning) return stop({ ok: true, best: +st.best.toFixed(1), t: +t.toFixed(1) });
      if (t > 16) return stop({ ok: false, best: +st.best.toFixed(1), x: +(p.x / 16).toFixed(1), tries: st.tries || 0 });
      if (!st.hooked) {
        if (p.onGround) { c.pressed.hook = true; c.held.hook = true; st.hooked = true; st.lastJ = t; }
        return;
      }
      if (p.hook && p.hook.phase !== 'back') { c.held.hook = true; return; }
      c.held.jump = true;
      if (p.onGround) {
        // caiu de volta: tenta a argola de novo
        st.hooked = false; st.dj = false; st.wall = 0; st.tries = (st.tries || 0) + 1;
        return;
      }
      if (p.onWall) {
        st.wall = p.wallDir;
        if (t - st.lastJ > 0.08) { c.pressed.jump = true; st.lastJ = t; }
        return;
      }
      // dentro do poço vai para a parede de lá; embaixo dele, fica no meio da boca
      if (b.top < 14 * 16) {
        const toward = st.wall ? -st.wall : (p.x < 36 * 16 ? -1 : 1);
        if (t - st.lastJ > 0.05) { if (toward < 0) c.held.left = true; else c.held.right = true; }
      } else if (p.x < 35.6 * 16) c.held.right = true;
      else if (p.x > 36.4 * 16) c.held.left = true;
      if (!st.dj && b.velocity.y > -60) { c.pressed.jump = true; st.dj = true; st.lastJ = t; }
    };
  }));
  check(climb.ok, `sobe o poço de volta (${JSON.stringify(climb)})`);
  if (climb.ok) {
    await inRoom('mascara');
    await waitGame(0.6);
    p = await page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, y: p.body.bottom / 16, g: p.onGround }; });
    check(p.g && (p.x < 54 || p.x > 58), `sai do buraco na Sala da Máscara, de pé ao lado dele (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
    await shot('f02-volta-mascara');
  }

  // ---------- 3. do fundo do fosso ao Leito do Abismo ----------
  await start('fosso', '1');
  await calm();
  await tp(50, 78, 1);
  await waitGame(0.3);
  await shot('f03-fundo');
  await page.keyboard.down('KeyD');
  await inRoom('abismo').catch(() => {});
  await page.keyboard.up('KeyD');
  r = await look();
  check(r.id === 'abismo', `pelo fundo à direita chega ao Leito do Abismo (${r.id})`);
  check(r.terrain && r.far && r.mid && r.music === 'fosso', `o Leito tem a pintura e a trilha do fosso (${r.terrain}, ${r.far}, ${r.mid}, ${r.music})`);
  const sleeping = await page.evaluate(() => window.__scene.boss && window.__scene.boss.state);
  check(sleeping === 'sleep', `a poça dorme no meio do Leito (${sleeping})`);
  await waitGame(0.4);
  await shot('f04-leito');
  // e volta para o fosso pela esquerda, antes de acordar a Sombra
  await page.keyboard.down('KeyA');
  await inRoom('fosso').catch(() => {});
  await page.keyboard.up('KeyA');
  r = await look();
  check(r.id === 'fosso', `pela esquerda volta ao fosso (${r.id})`);
  p = await page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, y: p.body.bottom / 16 }; });
  check(p.x > 48 && Math.abs(p.y - 78) < 0.3, `aparece no fundo, do lado da saída (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);

  // ---------- 4. o descanso do fundo ----------
  const rest = await page.evaluate(() => window.__scene.props.shrines.length);
  check(rest >= 1, `há uma vela de descanso no fundo do fosso (${rest})`);

  console.log(errs.slice(0, 20).join('\n') || 'sem erros no navegador');
  check(!errs.length, `sem erros (${errs.length})`);
  console.log(fails ? `${fails} FALHA(S)` : 'tudo certo');
  await browser.close();
})();
