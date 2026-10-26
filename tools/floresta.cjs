// Testa a Área 4, a Floresta Nevada: as passagens entre as seis salas, o Lobo da Caça (trota, uiva,
// corre, agacha e salta mordendo; os lobos perto respondem ao uivo; cai na água gelada e não sai), a
// Coruja de Geada (dorme no galho, acorda com o cavaleiro embaixo, mergulha e volta para um galho), o
// gelo (escorrega), o gelo fino (racha com ele parado e quebra), a água gelada (machuca), o Retalho
// Vermelho (planar segurando o pulo) e o Mestre da Caça (acorda com a grade fechando, a trompa, a
// estocada alta e a baixa, o salto com as ondas de neve, a trompa que chama dois lobos, a nevasca da
// segunda fase com a lanterna piscando e a investida, a derrota com a fala, o livro da caça que cai
// dele) e a história da floresta (os registros, a memória que devolve o nome dela, o herbário antes e
// depois do nome, o Diário, o nome que some de novo se ele trocar a memória, o bestiário).
// uso: node floresta.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
// ONLY=lobo,cacador roda só essas partes (links, lobo, coruja, gelo, capa, cacador, lore)
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
      const st = await page.evaluate(() => { const s = window.__scene; const b = s && s.boss; return { room: s && s.room.id, boss: b && { state: b.state, t: b.t, hp: b.hp, alive: b.alive }, p: s && { x: s.player.x / 16, y: s.player.body.bottom / 16, hp: s.player.hp, dead: s.player.dead } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 120) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const setProgress = (extra = [], abilities = ['wall', 'double', 'hook', 'veil']) => page.evaluate(([extra, abilities]) => {
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
  const P = () => page.evaluate(() => { const s = window.__scene; const p = s.player; return { x: p.x / 16, bottom: p.body.bottom / 16, vy: p.body.velocity.y, hp: p.hp, dead: p.dead, room: s.room.id, ground: p.body.blocked.down, ice: p.ice }; });
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
  // tira os inimigos da sala, menos o tipo pedido (o mais perto de x, se vier)
  const only = (kind, x) => page.evaluate(([kind, x]) => {
    const s = window.__scene;
    let keep = null;
    if (kind) {
      const all = s.enemies.filter((e) => e.kind === kind && e.alive);
      all.sort((a, b) => Math.abs(a.zone.x / 16 - (x ?? a.zone.x / 16)) - Math.abs(b.zone.x / 16 - (x ?? b.zone.x / 16)));
      keep = all[0] || null;
    }
    for (const e of s.enemies) if (e !== keep && e.kind !== 'boss' && e.vanish) e.vanish();
    window.__e = keep;
    return keep ? { x: keep.zone.x / 16, y: keep.body.bottom / 16, state: keep.state } : null;
  }, [kind, x]);
  // grava os estados de um inimigo (window.__e) quadro a quadro
  const watch = () => page.evaluate(() => {
    const s = window.__scene;
    const e = window.__e;
    window.__st = [];
    if (window.__unw) window.__unw();
    const fn = () => { const st = window.__st; if (st[st.length - 1] !== e.state) st.push(e.state); };
    s.events.on('postupdate', fn);
    window.__unw = () => s.events.off('postupdate', fn);
  });
  const states = () => page.evaluate(() => window.__st);
  const hookUi = () => page.evaluate(() => {
    const ui = window.__ui;
    window.__thoughts = [];
    window.__banners = [];
    window.__says = [];
    if (ui.__hooked) return;
    ui.__hooked = true;
    const orig = ui.thought.bind(ui);
    ui.thought = (text, ...rest) => { window.__thoughts.push(text); return orig(text, ...rest); };
    const ob = ui.banner.bind(ui);
    ui.banner = (t, ...rest) => { window.__banners.push(t); return ob(t, ...rest); };
    const os = ui.say.bind(ui);
    ui.say = (who, t, ...rest) => { window.__says.push(who + ': ' + t); return os(who, t, ...rest); };
  });

  if (part('links')) {
    // ---------- 1. as passagens entre as salas ----------
    await setProgress(['boss:cacador']);
    const cross = async (room, entry, place, want, name) => {
      await start(room, entry);
      await only(null);
      await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; window.__oldPlayer = s.player; });
      await page.evaluate(place);
      await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning, null, 20000);
      await waitGame(1.2);
      const r = await P();
      check(r.room === want, `${name}: ${room} -> ${want} (chegou em ${r.room}, x ${r.x.toFixed(1)}, pés ${r.bottom.toFixed(1)})`);
    };
    const right = (row) => `(() => { const s = window.__scene; const p = s.player; p.teleport(s.level.widthPx + 6, ${row} * 16); p.body.setVelocity(200, 0); })()`;
    const left = (row) => `(() => { const s = window.__scene; const p = s.player; p.teleport(-6, ${row} * 16); p.body.setVelocity(-200, 0); })()`;
    await cross('encosta', '1', right(37), 'pinhal', 'encosta pela direita');
    await cross('pinhal', '1', left(33), 'encosta', 'pinhal pela esquerda');
    await cross('pinhal', '1', right(32), 'lago', 'pinhal pela direita');
    await cross('lago', '1', left(31), 'pinhal', 'lago pela esquerda');
    // A Mata Fechada (v18) entrou entre o lago e a cabana
    await cross('lago', '1', right(17), 'mata', 'lago pela direita');
    await cross('mata', '1', right(27), 'cabana', 'mata pela direita');
    await cross('cabana', '1', left(27), 'mata', 'cabana pela esquerda');
    await cross('mata', '2', left(27), 'lago', 'mata pela esquerda');
    await cross('cabana', '1', right(27), 'serra', 'cabana pela direita');
    await cross('serra', '1', left(95), 'cabana', 'serra pela esquerda');
    await cross('serra', '1', right(11), 'clareira', 'serra pela direita');
    await cross('clareira', '1', left(28), 'serra', 'clareira pela esquerda');
  }

  if (part('lobo')) {
    // ---------- 2. o Lobo da Caça ----------
    await setProgress();
    await start('encosta', '2');
    const w = await only('wolf', 91);
    check(!!w, `tem lobo no fim da encosta (${JSON.stringify(w)})`);
    if (w) {
      await watch();
      // no mesmo chão, a uns 9 tiles do lado de dentro da sala (a mordida empurra para longe da saída)
      await setP(Math.round(w.x) - 9, 37, { face: 1 });
      await until(() => window.__st.includes('pounce'), null, 20000);
      await waitGame(0.12);
      await shot('l01-bote');
      await until(() => window.__st.includes('skid') || window.__st.includes('trot'), null, 20000);
      const st = await states();
      check(['howl', 'chase', 'crouch', 'pounce'].every((k) => st.includes(k)), `vê, uiva, corre, agacha e salta (${st.join(' > ')})`);
      const ph = await P();
      check(ph.hp < 5 && ph.room === 'encosta', `parado, a mordida acerta (vida ${ph.hp}, ${ph.room})`);
      // o golpe machuca e ele morre com 4 de vida
      const dmg = await page.evaluate(() => { const e = window.__e; const h0 = e.hp; e.hit(e.zone.x - 20, 1, 'side'); return h0 - e.hp; });
      check(dmg === 1, `o golpe tira vida dele (${dmg})`);
    }
    // o uivo chama os lobos perto
    await start('pinhal', '1');
    const pair = await page.evaluate(() => {
      const s = window.__scene;
      const ws = s.enemies.filter((e) => e.kind === 'wolf');
      for (const e of s.enemies) if (e.kind !== 'wolf' && e.vanish) e.vanish();
      ws.sort((a, b) => a.zone.x - b.zone.x);
      window.__w1 = ws[0];
      window.__w2 = ws[1];
      return ws.map((e) => e.zone.x / 16);
    });
    check(pair.length >= 2, `o Pinhal tem mais de um lobo (${pair.map((x) => x.toFixed(0)).join(', ')})`);
    // o primeiro uiva a uns 12 tiles do segundo (o cavaleiro longe, na entrada)
    await page.evaluate(() => { window.__w2.hear(window.__w2.zone.x - 190); });
    await waitGame(1.6);
    const heard = await page.evaluate(() => window.__w2.state);
    check(heard === 'chase' || heard === 'howl' || heard === 'crouch' || heard === 'pounce', `o outro lobo ouve o uivo e vem (${heard})`);
    // na água gelada ele não sai mais
    await start('lago', '1');
    const wl = await only('wolf', 48);
    if (wl) {
      await page.evaluate(() => { const e = window.__e; e.body.reset(48 * 16 + 8, 34 * 16 + 4); });
      await waitGame(0.8);
      const dead = await page.evaluate(() => !window.__e.alive);
      check(dead, 'o lobo que cai na água gelada afunda');
    }
  }

  if (part('coruja')) {
    // ---------- 3. a Coruja de Geada ----------
    await setProgress();
    await start('pinhal', '1');
    const o = await only('owl', 38);
    check(o && o.state === 'perch', `a coruja dorme no galho (${JSON.stringify(o)})`);
    if (o) {
      await watch();
      await setP(Math.round(o.x) + 1, 33, { face: 1 });
      await until(() => window.__st.includes('dive'), null, 20000);
      await waitGame(0.15);
      await shot('c01-mergulho');
      await until(() => window.__st.lastIndexOf('perch') > window.__st.indexOf('dive'), null, 30000);
      const st = await states();
      const back = st.indexOf('perch', st.indexOf('dive'));
      check(['alert', 'dive'].every((k) => st.includes(k)) && back > 0 && st[back - 1] === 'land', `acorda, mergulha e volta para um galho (${st.join(' > ')})`);
      const pos = await page.evaluate(() => { const e = window.__e; const s = window.__scene; const L = s.level; return { x: e.zone.x / 16, y: e.body.bottom / 16, under: L.ch(Math.floor(e.zone.x / 16), Math.floor((e.body.bottom + 2) / 16)) }; });
      check(pos.under === '-' || pos.under === '#', `pousou em cima de alguma coisa (${JSON.stringify(pos)})`);
    }
  }

  if (part('gelo')) {
    // ---------- 4. o gelo, o gelo fino e a água ----------
    await setProgress();
    await start('lago', '1');
    await only(null);
    await setP(30, 33, { inv: 99 });
    await waitGame(0.3);
    let r = await P();
    check(r.ice, `no gelo do lago o chão escorrega (gelo ${r.ice})`);
    // anda e solta: no gelo ele continua deslizando
    await page.keyboard.down('KeyD');
    await waitGame(0.5);
    await page.keyboard.up('KeyD');
    const x0 = (await P()).x;
    await waitGame(0.3);
    const x1 = (await P()).x;
    check(x1 - x0 > 0.6, `soltou a tecla e ainda desliza (${(x1 - x0).toFixed(2)} tiles)`);
    // parado em cima do gelo fino: racha e quebra, ele cai na água e volta para o chão firme
    await setP(42, 33, { inv: 99 });
    await page.evaluate(() => {
      const s = window.__scene;
      window.__wet = false;
      const fn = () => { if (s.respawning && s.level.inWater(s.player.body.center.x, s.player.body.bottom - 4)) window.__wet = true; };
      s.events.on('postupdate', fn);
      window.__unwet = () => s.events.off('postupdate', fn);
    });
    await until(() => !window.__scene.level.thin.some((t) => t.x === 42 && t.y === 33), null, 8000);
    await waitGame(0.1);
    await shot('g01-gelo-fino');
    await waitGame(1.2);
    const wet = await page.evaluate(() => { window.__unwet(); return window.__wet; });
    r = await P();
    check(wet && r.bottom <= 33.05, `o gelo fino quebrou, ele caiu na água e voltou para o chão firme (molhou ${wet}, pés ${r.bottom.toFixed(2)})`);
    // a água gelada machuca
    await setP(36, 35, { inv: 0 });
    await waitGame(1.2);
    r = await P();
    check(r.hp < 5, `a água gelada machuca (vida ${r.hp})`);
  }

  if (part('capa')) {
    // ---------- 5. o Retalho Vermelho: planar ----------
    // cai do alto da clareira da cabana (longe do telhado) segurando o pulo
    const fall = async (cape) => {
      await setProgress([], ['wall', 'hook', 'veil', ...(cape ? ['cape'] : [])]);
      await start('cabana', '1');
      await only(null);
      await setP(20, 4, { inv: 99 });
      await page.keyboard.down('Space');
      await waitGame(0.7);
      const v = await P();
      await page.keyboard.up('Space');
      return v.vy;
    };
    const free = await fall(false);
    const glide = await fall(true);
    check(glide < free * 0.5 && glide > 0, `com o retalho, segurando o pulo ele plana (cai a ${glide.toFixed(0)} px/s, sem: ${free.toFixed(0)})`);
    await shot('k01-planando');
  }

  if (part('cacador')) {
    // ---------- 6. o Mestre da Caça ----------
    await setProgress();
    await hookUi();
    await start('clareira', '1');
    await page.evaluate(() => window.__scene.player.setWeapon('scythe'));
    const B = () => page.evaluate(() => {
      const s = window.__scene;
      const b = s.boss;
      return { state: b.state, anim: b.anim, hp: b.hp, alive: b.alive, x: b.zone.x / 16, facing: b.facing, phase2: b.phase2, storm: b.storm, white: +s.whiteout.toFixed(2), shocks: b.shocks.length, wolves: s.enemies.filter((e) => e.kind === 'wolf' && e.alive).length };
    });
    let b = await B();
    check(b.state === 'sleep' && b.anim === 'sleep', `congelado no meio da clareira, esperando (${b.state})`);
    await shot('m01-esperando');
    await page.keyboard.down('KeyD');
    await until(() => window.__scene.boss.state !== 'sleep', null, 20000);
    await page.keyboard.up('KeyD');
    const gate = await page.evaluate(() => window.__scene.level.tileAt(6 * 16 + 8, 27 * 16 + 8));
    check(gate >= 2, `acorda e a paliçada da entrada fecha (${gate})`);
    await until(() => window.__scene.boss.state === 'call', null, 20000);
    await waitGame(0.3);
    await shot('m02-trompa');
    await until(() => window.__scene.boss.state === 'idle', null, 20000);
    const bar = await page.evaluate(() => document.querySelector('#bossbar p').textContent);
    check(bar === 'O Mestre da Caça', `barra de vida do chefe (${bar})`);
    // segura o chefe parado, sem pensar
    const hush = (tx) => page.evaluate((tx) => {
      const s = window.__scene;
      const b = s.boss;
      b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
      b.toIdle();
      b.shocks = [];
      if (tx !== undefined) b.body.reset(tx * 16 + 8, 29 * 16 - 40);
      b.body.setVelocity(0, 0);
    }, tx);
    const rec = (probe) => page.evaluate((probe) => {
      const s = window.__scene;
      const b = s.boss;
      const fn0 = probe ? new Function('s', 'b', 'p', probe) : null;
      window.__rec = { states: [], hurt: [], probe: null };
      const p = s.player;
      if (!p.__wrapped) {
        const orig = p.hurt.bind(p);
        p.hurt = (fx) => { const r = orig(fx); if (r && window.__rec) window.__rec.hurt.push({ state: s.boss && s.boss.state }); return r; };
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
    const force = async (a, probe) => {
      await rec(probe);
      await page.evaluate((a) => { const b = window.__scene.boss; b.thinkT = 99; b.startAttack(a); }, a);
    };
    const idle = () => until(() => window.__scene.boss.state === 'idle', null, 20000);
    const R = () => page.evaluate(() => window.__rec);

    // estocada: parado na frente, a lança acerta
    await hush(40);
    await setP(45, 29, { face: -1 });
    await waitGame(0.3);
    await force('thrust', 'return b.state === "thrust" && b.t > 0.08 ? { tip: b.point("tip").x / 16 } : null;');
    await until(() => window.__rec.states.includes('thrustrec'), null, 20000);
    await shot('m03-estocada');
    await idle();
    let rr = await R();
    check(rr.hurt.length > 0, `parado na frente da estocada, a lança acerta (${rr.states.join(' > ')})`);
    check(rr.probe && rr.probe.tip > 43, `a ponta da lança chega longe (${rr.probe && rr.probe.tip.toFixed(1)})`);
    // aparar no fim da preparação
    await hush(40);
    await setP(43, 29, { face: -1, inv: 4 });
    await waitGame(0.3);
    await rec();
    await page.evaluate(() => {
      const b = window.__scene.boss;
      b.thinkT = 99;
      b.startAttack('thrust');
      const s = window.__scene;
      const fn = () => {
        if (b.state === 'thrustwind' && b.t > 0.4) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' })), 110);
          s.events.off('postupdate', fn);
        }
      };
      s.events.on('postupdate', fn);
    });
    await until(() => window.__rec.states.includes('stagger') || window.__rec.states.includes('thrustrec'), null, 20000);
    rr = await R();
    check(rr.states.includes('stagger'), `golpear no fim da preparação apara a estocada (${rr.states.join(' > ')})`);
    await idle();
    // o salto: cai com a lança para baixo e a neve corre pelo chão
    await hush(30);
    await setP(46, 29, { face: -1, inv: 99 });
    await waitGame(0.3);
    await force('leap', 'return b.shocks.length ? { n: b.shocks.length, x: b.zone.x / 16 } : null;');
    await until(() => window.__rec.states.includes('land'), null, 20000);
    await waitGame(0.1);
    await shot('m04-salto');
    await idle();
    rr = await R();
    check(rr.probe && rr.probe.n >= 6 && Math.abs(rr.probe.x - 46) < 4, `salta até o cavaleiro e a neve corre para os dois lados (${JSON.stringify(rr.probe)})`);
    // a trompa chama dois lobos
    await hush(40);
    await setP(30, 29, { face: 1, inv: 99 });
    await page.evaluate(() => { window.__scene.boss.hp = window.__scene.boss.maxHp * 0.7; });
    await force('horn');
    await until(() => window.__scene.enemies.filter((e) => e.kind === 'wolf' && e.alive).length >= 2, null, 20000);
    await waitGame(0.3);
    await shot('m05-matilha');
    b = await B();
    check(b.wolves === 2, `a trompa chama dois lobos (${b.wolves})`);
    await idle();
    await page.evaluate(() => { const s = window.__scene; for (const e of s.enemies) if (e.kind === 'wolf' && e.vanish) { const spr = e.vanish(); if (spr) spr.destroy(); } });
    // segunda fase: a nevasca
    await page.evaluate(() => {
      const b = window.__scene.boss;
      delete b.toIdle;
      b.thinkT = 0.3;
      b.hp = b.maxHp * 0.52;
    });
    await setP(30, 29, { face: 1, inv: 99 });
    await page.evaluate(() => { const b = window.__scene.boss; b.hit(b.zone.x - 30, 2, 'side'); });
    await until(() => window.__scene.boss.state === 'rage', null, 20000);
    await until(() => window.__scene.whiteout > 0.6, null, 20000);
    b = await B();
    check(b.phase2 && b.storm, `na metade da vida a neve fecha (${JSON.stringify(b)})`);
    await rec();
    await until(() => window.__rec.states.includes('rush'), null, 30000);
    await waitGame(0.1);
    await shot('m06-nevasca');
    rr = await R();
    check(['stalk', 'blink', 'rush'].every((k) => rr.states.includes(k)), `some na neve, a lanterna pisca e ele investe (${rr.states.join(' > ')})`);
    // a derrota
    await page.evaluate(() => { const b = window.__scene.boss; b.hp = 1; });
    await until(() => ['stalk', 'idle', 'walk', 'thrustwind', 'leapwind', 'land', 'thrustrec', 'rushrec', 'blink', 'rush', 'thrust', 'horn'].includes(window.__scene.boss.state), null, 20000);
    await page.evaluate(() => { const b = window.__scene.boss; b.hit(b.zone.x - 30, 5, 'side'); });
    await until(() => !window.__scene.boss.alive, null, 20000);
    await waitGame(2.2);
    await shot('m07-derrota');
    const end = await page.evaluate(() => ({ says: window.__says, seen: window.__progress.seen.has('boss:cacador'), white: window.__scene.whiteout }));
    check(end.seen, 'vencer marca o chefe');
    check(end.says.some((t) => t.includes('Você também caçava')), `a fala dele (${end.says.join(' | ')})`);
    await waitGame(2.5);
    check((await page.evaluate(() => window.__scene.whiteout)) < 0.05, 'a neve abre depois da derrota');
    const drop = await page.evaluate(() => {
      const s = window.__scene;
      const n = s.forest.notes.find((k) => k.id === 'clareira:0');
      return n && { x: n.x / 16, y: n.y / 16, under: s.level.ch(Math.floor(n.x / 16), Math.round(n.y / 16)) };
    });
    check(drop && drop.under !== '.', `o livro da caça cai do Mestre e assenta no chão (${JSON.stringify(drop)})`);
    await shot('m08-livro');
  }

  if (part('lore')) {
    // ---------- 7. a história da floresta: registros, memórias e o nome dela ----------
    await setProgress();
    await hookUi();
    await page.evaluate(() => {
      const ui = window.__ui;
      window.__talks = [];
      if (ui.__talkHooked) return;
      ui.__talkHooked = true;
      const ot = ui.talk.bind(ui);
      ui.talk = (o) => { window.__talks.push({ name: o.name, lines: o.lines.slice() }); return ot(o); };
    });
    const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
    const read = async (tx, feet) => {
      await setP(tx, feet);
      await waitGame(0.3);
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
      return t;
    };
    const visible = () => page.evaluate(() => document.body.innerText);
    // o bilhete das fitas, no pinhal
    await start('pinhal', '1');
    await only(null);
    let t = await read(54, 34);
    check(t && t.name === 'O bilhete na casca' && /siga as fitas/.test(t.lines.join(' ')) && /A\."$/.test(t.lines[t.lines.length - 1]), `o bilhete na casca, assinado A. (${t && t.name})`);
    let seen = await page.evaluate(() => window.__progress.seen.has('record:pinhal:0'));
    check(seen && (await page.evaluate(() => window.__banners.includes('Registro guardado no Diário'))), 'o bilhete fica no Diário');
    // a cabana: o herbário antes do nome
    await start('cabana', '1');
    t = await read(37, 29);
    let txt = t ? t.lines.join(' ') : '';
    check(t && t.name === 'O herbário' && /escorrega/.test(txt) && !/Arielle/.test(txt), `antes da memória, o nome no herbário escorrega (${t && t.name})`);
    check(!/Arielle/.test(await visible()), 'nada na tela diz o nome antes da memória');
    t = await read(44, 29);
    txt = t ? t.lines.join(' ') : '';
    check(t && t.name === 'A carta que ficou' && /três dias depois do casamento/.test(txt) && /Arcebispo/.test(txt) && !/Arielle/.test(txt), `a carta da cabana, depois do casamento (${t && t.name})`);
    await shot('l01-cabana');
    // a memória do nome
    await page.evaluate(() => { window.__thoughts = []; window.__banners = []; });
    const took = await page.evaluate(() => {
      const s = window.__scene;
      const m = s.props.memories.find((k) => k.id === 'cabana:0');
      if (!m) return false;
      s.takeMemory(m);
      return true;
    });
    check(took, 'a memória do nome está na cabana');
    await waitGame(0.6);
    await shot('l02-nome');
    const nm = await page.evaluate(() => ({ knows: window.__progress.knowsHerName, banner: document.getElementById('banner').textContent }));
    check(nm.knows && /O nome dela/.test(nm.banner) && /Arielle/.test(nm.banner), `"O nome dela" devolve o nome (${nm.banner.trim().slice(0, 70)})`);
    await waitGame(5.6);
    const th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /herbário/.test(x) && /Arielle/.test(x)), `ele lembra do nome no herbário (${th.join(' | ')})`);
    t = await read(37, 29);
    txt = t ? t.lines.join(' ') : '';
    check(/Arielle/.test(txt) && /caminho de volta/.test(txt), 'depois da memória, o herbário mostra o nome');
    // o Diário, aba Registros
    await page.evaluate(() => window.__scene.openPause());
    await page.waitForTimeout(300);
    await page.click('#screen-pause [data-cmd="journal"]');
    await page.waitForTimeout(300);
    await page.click('#screen-journal [data-tab="records"]');
    await page.waitForTimeout(300);
    const rec = await page.evaluate(() => [...document.querySelectorAll('#screen-journal [data-panel="records"] .j-entry')].map((e) => e.textContent));
    check(rec.some((x) => /O herbário/.test(x) && /Arielle/.test(x)) && rec.some((x) => /O bilhete na casca/.test(x)), `o Diário guarda os registros da floresta (${rec.filter((x) => !/não encontrado/.test(x)).length} lidos)`);
    await shot('l03-diario');
    await page.evaluate(() => window.__ui.closeAll());
    await page.evaluate(() => window.__scene.resumeGame());
    // trocou a memória com o Cobrador: o nome some de novo
    await page.evaluate(() => { window.__progress.traded.add('cabana:0'); });
    t = await read(37, 29);
    check(t && !/Arielle/.test(t.lines.join(' ')), 'trocou o nome com o Cobrador: o herbário volta a escorregar');
    // a clareira depois da luta: o livro da caça perto do corpo
    await setProgress(['boss:cacador', 'weapon:lanca']);
    await start('clareira', '1');
    const note = await page.evaluate(() => { const n = window.__scene.forest.notes.find((k) => k.id === 'clareira:0'); return n && { x: n.x, y: n.y }; });
    check(!!note, `de volta à clareira, o livro da caça está perto do corpo (${JSON.stringify(note)})`);
    if (note) {
      t = await read((note.x - 8) / 16, note.y / 16);
      txt = t ? t.lines.join(' ') : '';
      check(t && t.name === 'O livro da caça' && /passou a serra/.test(txt) && /Casa Vhalor/.test(txt), `o livro da caça conta a última caçada (${t && t.name})`);
    }
    // o bestiário e o Grimório conhecem a floresta
    const beasts = await page.evaluate(() => {
      const p = window.__progress;
      p.kill('wolf');
      p.kill('owl');
      window.__scene.openPause();
      return true;
    });
    await page.waitForTimeout(300);
    await page.click('#screen-pause [data-cmd="journal"]');
    await page.waitForTimeout(300);
    const names = await page.evaluate(() => [...document.querySelectorAll('#screen-journal [data-panel="beasts"] .j-entry b')].map((e) => e.textContent));
    check(beasts && ['Lobo da Caça', 'Coruja de Geada', 'O Mestre da Caça'].every((n) => names.includes(n)), `o bestiário tem o lobo, a coruja e o Mestre (${names.filter((n) => !/Ainda/.test(n)).join(', ')})`);
    await page.evaluate(() => window.__ui.closeAll());
    await page.evaluate(() => window.__scene.resumeGame());
  }

  console.log(errs.length ? errs.join('\n') : 'sem erros');
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
