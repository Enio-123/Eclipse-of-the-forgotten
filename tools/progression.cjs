// Testa a progressão nova: grade das catacumbas abrindo depois da memória, vela de descanso,
// relíquias (pulo na parede e pulo duplo), caminhos que só abrem com elas, memórias, Cobrador,
// mapa e a volta para a última vela ao morrer.
// uso: node progression.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const T = 16;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => console.log((c ? 'ok   ' : 'FALHA ') + msg);
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene && window.__scene.clock >= t, t0 + ms / 1000, { timeout: 90000, polling: 16 });
  };
  // começa numa sala com o progresso dado
  const start = async (room, entry, from, prog = {}) => {
    await page.evaluate(([room, entry, from, prog]) => {
      const g = window.__game;
      window.__ui.closeAll();
      const P = window.__progress;
      if (prog.reset) P.reset();
      for (const k of ['abilities', 'memories', 'traded', 'upgrades']) if (prog[k]) P[k] = new Set(prog[k]);
      for (const k of prog.seen || []) P.seen.add(k);
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const cur = g.scene.getScene('game');
      window.__scene = null;
      if (cur && cur.scene.isActive()) cur.scene.restart({ room, entry, from });
      else g.scene.start('game', { room, entry, from });
    }, [room, entry, from, prog]);
    await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.room.id === room && window.__scene.scene.isActive(), room, { timeout: 20000 });
    await page.waitForTimeout(300);
  };
  // robô dentro da página: decide as teclas a cada quadro
  const bot = (name, args) => page.evaluate(([name, args]) => {
    const s = window.__scene;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    const st = { t: 0, jumpedAt: -1, phase: 0, used: false, dashed: false };
    const brains = {
      // sobe o poço pulando de parede em parede
      climb(p, k) {
        k.held.jump = true;
        const b = p.body;
        if (p.onGround) {
          k.held.right = true;
          if (st.t - st.jumpedAt > 0.25) { k.pressed.jump = true; st.jumpedAt = st.t; }
        } else if (p.onWall) {
          if (st.t - st.jumpedAt > 0.12) { k.pressed.jump = true; st.jumpedAt = st.t; }
        } else {
          // no ar: vai para a parede do outro lado
          const toward = b.velocity.x >= 0 ? 'right' : 'left';
          k.held[toward] = true;
        }
        if (b.bottom < args.goalY) { k.held.left = false; k.held.right = true; }
      },
      // corre e atravessa o abismo: pulo, pulo duplo caindo, dash
      gap(p, k) {
        const b = p.body;
        // pousou (na viga, ou caiu nos espinhos e voltou para a borda): solta tudo, senão a
        // corrida leva o cavaleiro para a cripta ou de novo para o abismo
        if (st.done || (st.phase > 0 && (p.frozen || (p.onGround && st.t - st.t1 > 0.2)))) { st.done = true; return; }
        k.held.right = true;
        k.held.jump = true;
        if (st.phase === 0 && b.right > args.edge) { k.pressed.jump = true; st.phase = 1; st.t1 = st.t; }
        else if (args.single) {
          // melhor que dá sem a Pena: dash perto do alto do pulo
          if (st.phase === 1 && st.t - st.t1 > 0.35 && !st.dashed) { k.pressed.dash = true; st.dashed = true; }
        } else if (st.phase === 1 && st.t - st.t1 > 0.05 && b.velocity.y > 30) { k.pressed.jump = true; st.phase = 2; st.t2 = st.t; }
        else if (st.phase === 2 && st.t - st.t2 > 0.25 && !st.dashed) { k.pressed.dash = true; st.dashed = true; }
      },
      idle() {},
    };
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      st.t += 1 / 60;
      brains[name](s.player, c);
    };
  }, [name, args]);
  const stopBot = () => page.evaluate(() => { const c = window.__scene.controls; if (c.__orig) c.update = c.__orig; });
  const P = () => page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, bottom: p.body.bottom / 16, hp: p.hp, ground: p.onGround, frozen: p.frozen }; });
  const prog = () => page.evaluate(() => { const P = window.__progress; return { room: P.room, entry: P.entry, ab: [...P.abilities], mem: [...P.memories], traded: [...P.traded], up: [...P.upgrades], seen: [...P.seen] }; });

  // 1. volta da memória: tela de fim do prólogo, e a grade do fundo abre
  await start('memoria', '1', 'mirror', { reset: true });
  await start('catacumbas', '2', 'memory');
  const gate0 = await page.evaluate(() => window.__scene.level.tileAt(107 * 16 + 8, 41 * 16 + 8));
  ok(gate0 >= 0, `grade fechada antes (tile ${gate0})`);
  await page.waitForSelector('#screen-end.show', { timeout: 60000 });
  await page.click('#screen-end [data-cmd="explore"]');
  await wait(3600);
  await page.screenshot({ path: `${OUT}/grade-aberta.png` });
  const gate1 = await page.evaluate(() => window.__scene.level.tileAt(107 * 16 + 8, 41 * 16 + 8));
  let pr = await prog();
  ok(gate1 < 0 && pr.seen.includes('gate:catacumbas'), `grade abriu depois da memória (tile ${gate1})`);
  ok(pr.room === 'catacumbas' && pr.entry === 'R1', `ponto de retorno na vela do espelho (${pr.room} ${pr.entry})`);

  // 2. vela de descanso: cura e salva
  await page.evaluate(() => { const s = window.__scene; const r = s.level.spawn('R0'); s.player.teleport(r.x + 6, r.y); s.player.hp = 2; s.registry.set('hp', 2); });
  await wait(200);
  const hint = await page.evaluate(() => document.querySelector('#hint').textContent);
  await page.keyboard.down('KeyW'); await wait(60); await page.keyboard.up('KeyW');
  await wait(700);
  await page.screenshot({ path: `${OUT}/vela-descanso.png` });
  await wait(1800);
  let p = await P();
  pr = await prog();
  ok(hint.includes('descansar'), `dica perto da vela ("${hint}")`);
  ok(p.hp === 5 && pr.entry === 'R0' && pr.seen.includes('rest:catacumbas:0'), `descansar cura e salva (vida ${p.hp}, ponto ${pr.entry})`);
  ok(!p.frozen, 'cavaleiro levanta depois de descansar');

  // 3. poço secreto das catacumbas: sem as garras não sobe
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(61 * 16 + 8, 30 * 16); });
  await bot('climb', { goalY: 13 * 16 });
  await wait(5000);
  p = await P();
  await stopBot();
  ok(p.bottom > 25, `sem as Garras de Ferro o poço não sobe (pé na linha ${p.bottom.toFixed(1)})`);

  // 4. Galeria dos Sinos: pega as Garras de Ferro
  await start('sinos', '1', 'door', { seen: ['memory:vale', 'gate:catacumbas'] });
  await page.evaluate(() => { for (const e of window.__scene.enemies) { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); } });
  await page.evaluate(() => { const s = window.__scene; const j = s.level.spawns.find((q) => q.kind === 'J'); s.player.teleport(j.x - 30, j.y); });
  await bot('idle', {});
  await page.evaluate(() => { const s = window.__scene; const c = s.controls; const o = c.update; c.update = (cam) => { o(cam); c.held.right = s.player.x < s.level.spawns.find((q) => q.kind === 'J').x; }; });
  await wait(1500);
  await page.screenshot({ path: `${OUT}/reliquia-garras.png` });
  await wait(3600);
  await stopBot();
  p = await P();
  pr = await prog();
  const canWall = await page.evaluate(() => window.__scene.player.canWall);
  ok(pr.ab.includes('wall') && canWall && !p.frozen, `Garras de Ferro dão o pulo na parede (${pr.ab.join(',')})`);

  // 5. com as garras o poço sobe até a galeria de cima
  await page.evaluate(() => { const s = window.__scene; s.player.teleport(49 * 16 + 8, 58 * 16); });
  await bot('climb', { goalY: 16 * 16 });
  let reached = false;
  for (let i = 0; i < 24 && !reached; i++) {
    await wait(500);
    p = await P();
    if (i === 4) await page.screenshot({ path: `${OUT}/poco-parede.png` });
    reached = p.bottom <= 16.05 && p.x > 52;
  }
  await stopBot();
  ok(reached, `pulando de parede chega na galeria de cima (x ${p.x.toFixed(1)}, pé ${p.bottom.toFixed(1)})`);

  // 6. abismo: sem o pulo duplo cai nos espinhos
  const tryGap = async (single) => {
    await page.evaluate(() => { const s = window.__scene; s.player.teleport(68 * 16, 16 * 16); s.player.hp = 5; s.player.invuln = 0; s.registry.set('hp', 5); });
    await wait(300);
    await bot('gap', { edge: 69 * 16 - 2, single });
    await wait(1900);
    await stopBot();
    await wait(600);
    return P();
  };
  p = await tryGap(true);
  ok(p.x < 69 && p.hp < 5, `sem o pulo duplo (pulo + dash) cai nos espinhos (x ${p.x.toFixed(1)}, vida ${p.hp})`);

  // 7. Pena do Eclipse e o abismo com pulo duplo
  await page.evaluate(() => { const s = window.__scene; const u = s.level.spawns.find((q) => q.kind === 'U'); s.player.teleport(u.x, u.y); });
  await wait(4800);
  pr = await prog();
  ok(pr.ab.includes('double'), 'Pena do Eclipse dá o pulo duplo');
  // o corvo de cima do abismo fica longe neste teste (aqui só importa o alcance do salto)
  await page.evaluate(() => { for (const e of window.__scene.enemies) if (e.zone && e.zone.x > 52 * 16 && e.zone.y < 16 * 16) { e.alive = false; e.sprite.setVisible(false); } });
  p = await tryGap(false);
  await page.screenshot({ path: `${OUT}/abismo-duplo.png` });
  ok(p.x > 79 && p.bottom < 9.1 && p.hp === 5, `com pulo duplo chega na viga do outro lado (x ${p.x.toFixed(1)}, pé ${p.bottom.toFixed(1)}, vida ${p.hp})`);

  // 8. memória: coleta e aparece no painel
  await page.evaluate(() => { const s = window.__scene; const m = s.level.spawns.filter((q) => q.kind === 'm')[1]; s.player.teleport(m.x, m.y); });
  await wait(600);
  pr = await prog();
  const hudMem = await page.evaluate(() => window.__game.registry.get('memories'));
  ok(pr.mem.includes('sinos:1') && hudMem.length === 1, `memória coletada (${pr.mem.join(',')}; painel ${JSON.stringify(hudMem)})`);
  await page.evaluate(() => { const s = window.__scene; const m = s.level.spawns.filter((q) => q.kind === 'm')[0]; s.player.teleport(m.x, m.y); });
  await wait(600);
  pr = await prog();
  ok(pr.mem.length === 2, `segunda memória (no nicho alto) coletada (${pr.mem.join(',')})`);

  // 9. Cobrador: troca uma memória pelo Fôlego
  await page.evaluate(() => { const s = window.__scene; const k = s.level.spawns.find((q) => q.kind === 'K'); s.player.teleport(k.x + 26, k.y); });
  await wait(300);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(150); await page.keyboard.up('KeyW');
  await page.waitForSelector('#screen-shop.show', { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/cobrador-loja.png` });
  const enabled = await page.evaluate(() => [...document.querySelectorAll('#screen-shop .offer')].map((b) => b.dataset.id + ':' + (b.disabled ? 'off' : 'on')));
  await page.click('#screen-shop .offer[data-id="breath"]');
  await page.waitForTimeout(200);
  pr = await prog();
  const cd = await page.evaluate(() => window.__scene.player.dashCdMul);
  ok(pr.up.includes('breath') && pr.traded.length === 1 && cd < 1, `troca feita (${enabled.join(' ')}; trocadas ${pr.traded.join(',')}; recarga x${cd})`);
  await page.click('#screen-shop [data-cmd="close"]');
  await page.waitForTimeout(400);
  const shopClosed = await page.evaluate(() => !document.querySelector('#screen-shop').classList.contains('show') && window.__scene.scene.isActive());
  ok(shopClosed, 'loja fecha e o jogo continua');

  // 10. mapa abre com M e mostra o que foi visto
  await page.keyboard.down('KeyM'); await page.waitForTimeout(80); await page.keyboard.up('KeyM');
  await page.waitForSelector('#screen-map.show', { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/mapa.png` });
  const ink = await page.evaluate(() => {
    const cv = document.querySelector('#screen-map canvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++;
    return n;
  });
  ok(ink > 500, `mapa desenhado (${ink} pontos)`);
  await page.keyboard.down('KeyM'); await page.waitForTimeout(80); await page.keyboard.up('KeyM');
  await page.waitForTimeout(400);
  const mapClosed = await page.evaluate(() => !document.querySelector('#screen-map').classList.contains('show'));
  ok(mapClosed, 'M fecha o mapa');

  // 11. morrer volta para a última vela
  await page.evaluate(() => { const s = window.__scene; const r = s.level.spawn('R1'); s.player.teleport(r.x + 4, r.y); });
  await wait(200);
  await page.keyboard.down('KeyW'); await wait(60); await page.keyboard.up('KeyW');
  await wait(2600);
  pr = await prog();
  ok(pr.room === 'sinos' && pr.entry === 'R1', `vela de cima acesa (${pr.room} ${pr.entry})`);
  await page.evaluate(() => { const s = window.__scene; s.player.__old = true; s.player.hp = 1; s.registry.set('hp', 1); s.player.invuln = 0; s.player.teleport(76 * 16, 21 * 16); });
  // a cena reinicia com um cavaleiro novo (o objeto da cena é o mesmo)
  await page.waitForFunction(() => window.__scene && window.__scene.player && !window.__scene.player.__old && window.__scene.scene.isActive(), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  p = await P();
  const at = await page.evaluate(() => { const s = window.__scene; const r = s.level.spawn('R1'); return { room: s.room.id, rx: r.x / 16 }; });
  ok(at.room === 'sinos' && Math.abs(p.x - at.rx) < 2 && p.hp === 5, `morreu e voltou na vela (x ${p.x.toFixed(1)} / vela ${at.rx.toFixed(1)}, vida ${p.hp})`);

  // 12. cripta: grade aberta na chegada
  await start('cripta', '1', 'door');
  const cg = await page.evaluate(() => window.__scene.level.tileAt(1 * 16 + 8, 17 * 16 + 8));
  await page.screenshot({ path: `${OUT}/cripta.png` });
  ok(cg < 0, `grade da cripta aberta na chegada (tile ${cg})`);

  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
