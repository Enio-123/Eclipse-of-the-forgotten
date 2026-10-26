// O espelho e o Eco com os golpes que não usam o arco de corte. O Reflexo (o chefe da Câmara de
// Âmbar) repete o chicote de tinta do Véu e a corrente de Âmbar aceso, o pulso do Cajado da Dobra com
// o anel de Âmbar e a bolinha do Eclipse como bolinha (inimiga, não flecha). O Eco repete o chicote e o
// pulso de tinta e ouro. Antes, o golpe repetido machucava sem aparecer.
// uso: node tools/reflexo_mago.cjs <pasta-saida> [url]
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
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  const until = async (fn, arg, timeout = 30000) => {
    try {
      return await page.waitForFunction(fn, arg, { timeout, polling: 16 });
    } catch (e) {
      const st = await page.evaluate(() => { const s = window.__scene; const b = s && s.boss; return { room: s && s.room.id, boss: b && { state: b.state, hp: b.hp }, p: s && { x: s.player.x / 16, y: s.player.body.bottom / 16 } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 140) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const waitGame = async (sec, timeout = 60000) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout, polling: 16 });
  };
  const press = async (key) => {
    await page.keyboard.down(key);
    await waitGame(0.06).catch(() => {});
    await page.keyboard.up(key);
  };
  // a foto do quadro em que a condição valeu: a cena para dentro do próprio jogo, sem deixar o tempo correr
  const snapWhen = async (name, cond) => {
    await page.evaluate((cond) => {
      const s = window.__scene;
      const f = new Function('s', 'b', 'p', cond);
      window.__snapped = false;
      const fn = () => {
        if (window.__snapped || !f(s, s.boss, s.player)) return;
        window.__snapped = true;
        s.sys.pause();
        s.events.off('postupdate', fn);
      };
      s.events.on('postupdate', fn);
      window.__unsnap = () => s.events.off('postupdate', fn);
    }, cond);
    try {
      await until(() => window.__snapped, null, 15000);
    } catch (e) {
      await page.evaluate(() => window.__unsnap && window.__unsnap());
      return false;
    }
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => window.__scene.sys.resume());
    return true;
  };

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });

  // começa na Câmara de Âmbar com o mago (ou a arma) pedido, com a área das minas aberta até o espelho
  const startAs = async (weapon, starter, o = {}) => {
    await page.evaluate(([weapon, starter, o]) => {
      const p = window.__progress;
      p.reset();
      p.prologueDone = true;
      p.kintsugi = 1;
      p.starter = starter;
      window.__settings.data.weapon = weapon;
      window.__settings.save();
      p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
      for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
        'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', ...(o.seen || [])]) p.seen.add(k);
      if (o.echo) {
        p.powers.add('eco');
        p.power = 'eco';
        p.amber = 3;
      }
      p.save();
    }, [weapon, starter, o]);
    await page.evaluate(([room, entry]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      for (const k of ['intro', 'title']) {
        const sc = g.scene.getScene(k);
        if (sc && sc.scene.isActive()) sc.scene.stop();
      }
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [o.room || 'espelhos', o.entry || '1']);
    await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning && window.__scene.clock > 0.3, null, 60000);
    await page.waitForTimeout(300);
  };
  const setP = (tx, feetRow, face = 1) => page.evaluate(([tx, fr, face]) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(tx * 16 + 8, fr * 16);
    p.body.setVelocity(0, 0);
    p.hp = 5;
    p.invuln = 1e9;
    p.facing = face;
    s.registry.set('hp', 5);
  }, [tx, feetRow, face]);
  // passa na frente da pedra até o Reflexo acordar e sair do espelho
  const wake = async () => {
    await setP(30, 26);
    await page.keyboard.down('KeyD');
    await until(() => window.__scene.boss && window.__scene.boss.state !== 'sleep', null, 20000);
    await page.keyboard.up('KeyD');
    await until(() => window.__scene.boss.state === 'fight', null, 20000);
    // longe dela, parado: a imagem chega até onde ele estava e fica lá
    await setP(16, 26);
    await waitGame(1.4);
  };

  // ---------- 1. Véu: o chicote volta de Âmbar ----------
  await startAs('veu', 'veu');
  await wake();
  await press('KeyJ');
  // o quadro em que o chicote aparece no espelho e a área do golpe repetido vale junto
  const whip = await snapWhen('reflexo-veu-chicote', 'return !!(b.cur && b.cur.lash && b.cur.lash.whip && b.cur.atk && b.lashG.commandBuffer.length > 0);');
  check(whip, 'o Reflexo repete o chicote de tinta do Véu, desenhado de Âmbar, com a área do golpe junto');
  await waitGame(1.0);
  const cleared = await page.evaluate(() => window.__scene.boss.lashG.commandBuffer.length === 0);
  check(cleared, 'depois do golpe, o chicote do espelho some');

  // ---------- 2. Espaço: o pulso volta com o anel de Âmbar ----------
  await startAs('espaco', 'espaco');
  await wake();
  await page.evaluate(() => {
    const m = window.__scene.magic;
    window.__pulses = [];
    const o = m.pulseFx.bind(m);
    m.pulseFx = (box, f, ring, core) => { window.__pulses.push(ring === undefined ? 'mago' : ring.toString(16)); return o(box, f, ring, core); };
  });
  await press('KeyJ');
  await until(() => window.__pulses.length >= 2, null, 15000).catch(() => {});
  const pulses = await page.evaluate(() => window.__pulses);
  check(pulses[0] === 'mago' && pulses[1] === 'ffa63c' && pulses.length === 2, `o Reflexo repete o pulso uma vez, com o anel de Âmbar (${pulses})`);

  // ---------- 3. Eclipse: a bolinha volta como bolinha inimiga ----------
  await startAs('eclipse', 'eclipse');
  await wake();
  await page.evaluate(() => {
    const s = window.__scene;
    window.__orbs = 0;
    window.__eArrows = 0;
    const o = s.spawnEnemyOrb.bind(s);
    s.spawnEnemyOrb = (...a) => { window.__orbs++; return o(...a); };
    const oa = s.spawnEnemyArrow.bind(s);
    s.spawnEnemyArrow = (...a) => { window.__eArrows++; return oa(...a); };
  });
  await press('KeyJ');
  const orbShot = await snapWhen('reflexo-eclipse-bolinha', 'return s.arrows.some((a) => a.orb && a.hostile && !a.dead);');
  const orbs = await page.evaluate(() => ({ orbs: window.__orbs, arrows: window.__eArrows }));
  check(orbShot && orbs.orbs === 1 && orbs.arrows === 0, `o Reflexo devolve a bolinha do Eclipse como bolinha, não flecha (${JSON.stringify(orbs)})`);
  // a bolinha inimiga que bate no mago machuca e some
  await page.evaluate(() => {
    const s = window.__scene;
    const p = s.player;
    p.invuln = 0;
    p.hp = 5;
    s.registry.set('hp', 5);
    s.spawnEnemyOrb(p.x - 40, p.body.center.y, 1, 0);
  });
  await until(() => window.__scene.player.hp < 5, null, 8000).catch(() => {});
  const hp = await page.evaluate(() => window.__scene.player.hp);
  check(hp === 4, `a bolinha de Âmbar machuca o mago (vida ${hp})`);

  // ---------- 4. Cavaleiro com a Corrente: a corrente também aparece ----------
  await startAs('corrente', 'scythe');
  await wake();
  await press('KeyJ');
  const chain = await snapWhen('reflexo-corrente', 'return !!(b.cur && b.cur.lash && !b.cur.lash.whip && b.lashG.commandBuffer.length > 0);');
  check(chain, 'o Reflexo repete a corrente do cavaleiro (antes o golpe era invisível)');

  // ---------- 5. o Eco: chicote e pulso de tinta e ouro ----------
  await startAs('veu', 'veu', { echo: true, room: 'ponte', entry: 'P' });
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.alive && e.kind !== 'boss') { e.alive = false; e.sprite?.setVisible(false); } s.enemies = []; });
  await until(() => { const s = window.__scene; return !s.cinematic && s.player.canAim; }, null, 30000).catch(() => {});
  await setP(20, Math.round(await page.evaluate(() => window.__scene.player.body.bottom / 16)));
  await press('KeyQ');
  await until(() => !!window.__scene.memEcho, null, 8000).catch(() => {});
  check(await page.evaluate(() => !!window.__scene.memEcho), 'o Eco aparece do lado do mago do Véu');
  await waitGame(0.3);
  await press('KeyJ');
  const echoWhip = await snapWhen('eco-veu-chicote', 'const e = s.memEcho; return !!(e && e.lashG.commandBuffer.length > 0);');
  check(echoWhip, 'o Eco repete o chicote, de tinta com a borda de ouro');

  await startAs('espaco', 'espaco', { echo: true, room: 'ponte', entry: 'P' });
  await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.alive && e.kind !== 'boss') { e.alive = false; e.sprite?.setVisible(false); } s.enemies = []; });
  await until(() => { const s = window.__scene; return !s.cinematic && s.player.canAim; }, null, 30000).catch(() => {});
  await setP(20, Math.round(await page.evaluate(() => window.__scene.player.body.bottom / 16)));
  await page.evaluate(() => {
    const m = window.__scene.magic;
    window.__pulses = [];
    const o = m.pulseFx.bind(m);
    m.pulseFx = (box, f, ring, core) => { window.__pulses.push(ring === undefined ? 'mago' : ring.toString(16)); return o(box, f, ring, core); };
  });
  await press('KeyQ');
  await until(() => !!window.__scene.memEcho, null, 8000).catch(() => {});
  await waitGame(0.3);
  await press('KeyJ');
  await until(() => window.__pulses.length >= 2, null, 10000).catch(() => {});
  const ep = await page.evaluate(() => ({ pulses: window.__pulses, gold: window.__scene.registry.get('amber') }));
  check(ep.pulses.length === 2 && ep.pulses[0] === 'mago' && ep.pulses[1] !== 'mago' && ep.pulses[1] !== 'ffa63c', `o Eco repete o pulso uma vez, com o anel de ouro (${ep.pulses})`);

  console.log(errs.length ? errs.join('\n') : 'sem erros no navegador');
  console.log(fails || errs.length ? `${fails} FALHAS` : 'TUDO OK');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
