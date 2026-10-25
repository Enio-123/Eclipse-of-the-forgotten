// Testa as recompensas e o dash fantasma: moedas que os inimigos deixam (ímã, contador na tela),
// cacos de vida (só caem e só curam com o cavaleiro ferido), compra com moedas no Cobrador e a gravação,
// a Bolsa do dízimo, o dash que atravessa inimigos sem dano e a distância nova do dash (20% maior).
// uso: node loot.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
let fails = 0;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALHA ') + msg); if (!c) fails++; };
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [room, entry]);
    await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.room.id === room && window.__scene.scene.isActive() && window.__scene.loot, room, { timeout: 20000 });
    await page.waitForTimeout(600);
  };
  // espera em tempo de jogo (no navegador sem placa de vídeo o jogo anda mais devagar que o relógio)
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene.clock >= t, t0 + ms / 1000, { timeout: 60000, polling: 16 });
  };
  // o robô aperta ações quadro a quadro e guarda onde o cavaleiro estava
  const act = (plan) => page.evaluate((plan) => new Promise((res) => {
    const s = window.__scene;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    const p = s.player;
    const log = [];
    let f = 0;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      const step = plan[f] || {};
      for (const a of step.held || []) c.held[a] = true;
      for (const a of step.pressed || []) { c.pressed[a] = true; c.held[a] = true; }
      const cr = s.enemies.filter((e) => e.kind === 'crawler')[0];
      log.push({ x: p.x, dashing: p.dashing, ghost: p.ghost, hp: p.hp, cx: cr && cr.zone.x, stop: s.hitstopT > 0 });
      f++;
      if (f > plan.length) { c.update = c.__orig; res(log); }
    };
  }), plan);
  const idle = (n) => Array.from({ length: n }, () => ({}));
  const coinsState = () => page.evaluate(() => {
    const s = window.__scene;
    const drops = s.loot.drops.filter((d) => !d.gone);
    const el = document.getElementById('coins');
    return {
      coins: window.__progress.coins,
      reg: s.registry.get('coins'),
      floor: drops.filter((d) => d.kind === 'coin').reduce((a, d) => a + d.value, 0),
      floorN: drops.filter((d) => d.kind === 'coin').length,
      life: drops.filter((d) => d.kind === 'life').length,
      hp: s.player.hp,
      acc: window.__progress.lifeAcc,
      hud: el.classList.contains('on'),
      high: el.classList.contains('high'),
      text: el.querySelector('b').textContent,
    };
  });
  // pega o que sobrou no chão andando até cada coisa
  const sweep = () => page.evaluate(async () => {
    const s = window.__scene;
    for (const d of s.loot.drops.filter((d) => !d.gone)) {
      s.player.teleport(d.x, d.y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  // um rastejante com pouca vida, o cavaleiro do lado virado para ele, golpe
  const killCrawler = async (i) => {
    await page.evaluate((i) => {
      const s = window.__scene;
      const cr = s.enemies.filter((e) => e.kind === 'crawler')[i];
      cr.hp = 0.1;
      const p = s.player;
      p.teleport(cr.zone.x - 30, cr.body.bottom);
      p.facing = 1;
      p.invuln = 3;
    }, i);
    await act([{ pressed: ['attack'] }, ...idle(12)]);
  };

  // ---------- 1. moedas do rastejante ----------
  await page.evaluate(() => window.__progress.reset());
  await start('ponte', '2');
  // só os rastejantes ficam na ponte (o guarda e os corvos atrapalhariam as contas de vida)
  await page.evaluate(() => {
    for (const e of window.__scene.enemies) if (e.kind !== 'crawler') { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
  });
  await page.evaluate(() => {
    const L = window.__scene.loot;
    const orig = L.spawn.bind(L);
    L.__spawned = [];
    L.spawn = (...a) => { L.__spawned.push(a[0]); return orig(...a); };
  });
  const spawned = (kind) => page.evaluate((kind) => window.__scene.loot.__spawned.filter((k) => k === kind).length, kind);
  let st = await coinsState();
  ok(st.coins === 0 && !st.hud, `começa sem moedas e sem contador na tela (moedas ${st.coins}, contador ${st.hud ? 'visível' : 'escondido'})`);
  await killCrawler(1);
  st = await coinsState();
  ok(st.floorN > 0, `o rastejante derrotado solta moedas (${st.floorN} no ar, valendo ${st.floor + st.coins})`);
  await page.screenshot({ path: `${OUT}/moedas-saindo.png` });
  await wait(2200);
  await sweep();
  await wait(400);
  st = await coinsState();
  ok(st.coins >= 2 && st.coins <= 4 && st.floor === 0, `pegou ${st.coins} moedas (rastejante dá de 2 a 4)`);
  ok(st.reg === st.coins && st.text === String(st.coins) && st.hud, `contador na tela mostra ${st.text} (registro ${st.reg})`);
  ok(st.high, 'sem memórias ainda, o contador fica na linha de cima');
  await page.screenshot({ path: `${OUT}/hud-moedas.png`, clip: { x: 0, y: 0, width: 420, height: 240 } });

  // ---------- 2. caco de vida quando ferido ----------
  await page.evaluate(() => {
    const s = window.__scene;
    s.player.hp = 3;
    s.registry.set('hp', 3);
    window.__progress.lifeAcc = 0.5;
  });
  await killCrawler(2);
  ok((await spawned('life')) === 1, `ferido (3 de 5), o segundo rastejante solta um caco de vida (${await spawned('life')})`);
  await wait(500);
  await page.screenshot({ path: `${OUT}/caco-de-vida.png` });
  await wait(1500);
  await sweep();
  await wait(400);
  st = await coinsState();
  ok(st.hp === 4 && st.life === 0, `o caco cura um fragmento (vida ${st.hp})`);

  // ---------- 3. vida cheia: não cai caco ----------
  // num trecho plano da ponte, sem buraco nem espinho por perto (o tabuleiro tem vãos)
  await page.evaluate(() => {
    const s = window.__scene;
    const L = s.level;
    const cr = s.enemies.filter((e) => e.kind === 'crawler')[0];
    const y = cr.body.bottom;
    const ground = (x) => { const i = L.tileAt(x, y + 2); return i >= 2 || i === 0; };
    const free = (x) => L.tileAt(x, y - 8) === -1 && L.tileAt(x, y - 24) === -1;
    let spot = null;
    for (let d = 120; d < 600 && !spot; d += 8) {
      for (const x of [cr.homeX - d, cr.homeX + d]) {
        let ok = true;
        for (let dx = -64; dx <= 64 && ok; dx += 8) ok = ground(x + dx) && free(x + dx);
        if (ok) { spot = x; break; }
      }
    }
    const p = s.player;
    p.teleport(spot, y);
    p.invuln = 99;
    p.hp = window.__progress.maxHp;
    s.registry.set('hp', p.hp);
    window.__progress.lifeAcc = 0.9;
  });
  await wait(300);
  await page.evaluate(() => { const s = window.__scene; s.loot.drop('crawler', s.player.x + 30, s.player.body.top); });
  st = await coinsState();
  ok((await spawned('life')) === 1 && Math.abs(st.acc - 1) < 1e-6, `com a vida cheia não cai caco e ele fica guardado para depois (acumulado ${st.acc})`);
  // caco no chão com a vida cheia não é pego; ferido, o ímã traz
  await page.evaluate(() => {
    const s = window.__scene;
    s.loot.spawn('life', 1, s.player.x + 10, s.player.body.top, false);
  });
  await wait(1600);
  st = await coinsState();
  ok(st.life === 1 && st.hp === 5, `com a vida cheia o caco fica no chão (cacos ${st.life}, vida ${st.hp})`);
  await page.evaluate(() => {
    const s = window.__scene;
    s.player.hp = 4;
    s.registry.set('hp', 4);
    const d = s.loot.drops.find((q) => !q.gone && q.kind === 'life');
    if (d) s.player.teleport(d.x - 20, s.player.body.bottom);
  });
  await wait(900);
  st = await coinsState();
  ok(st.life === 0 && st.hp === 5, `ferido, o mesmo caco vem até ele e cura (vida ${st.hp})`);
  await wait(1200);
  await page.evaluate(() => { window.__scene.player.invuln = 0; });

  // ---------- 4. dash fantasma ----------
  const placeNear = (dx) => page.evaluate((dx) => {
    const s = window.__scene;
    const cr = s.enemies.filter((e) => e.kind === 'crawler')[0];
    cr.knockT = 0;
    const p = s.player;
    p.teleport(cr.zone.x + dx, cr.body.bottom);
    p.facing = 1;
    p.invuln = 0;
    p.hp = 5;
    s.registry.set('hp', 5);
    return cr.zone.x;
  }, dx);
  // controle: encostar sem dash machuca
  await placeNear(-4);
  await act(idle(6));
  st = await coinsState();
  ok(st.hp < 5, `encostar no rastejante sem dash machuca (vida ${st.hp})`);
  // espera longe dele
  await page.evaluate(() => { const p = window.__scene.player; p.teleport(p.x - 200, p.body.bottom); });
  await wait(1300);
  const cx = await placeNear(-34);
  const log = await act([{ pressed: ['dash'], held: ['right'] }, ...idle(14)]);
  st = await coinsState();
  const passed = await page.evaluate(() => window.__scene.passed.size);
  const endX = log[log.length - 1].x;
  if (st.hp !== 5 || !log.some((f) => f.dashing)) console.log('quadros (x, rastejante, dash, fantasma, vida, pausa):', JSON.stringify(log.map((f) => [Math.round(f.x), Math.round(f.cx), f.dashing ? 1 : 0, f.ghost ? 1 : 0, f.hp, f.stop ? 1 : 0])));
  ok(st.hp === 5 && endX > cx + 14, `o dash atravessa o rastejante sem dano (vida ${st.hp}, de x ${Math.round(cx - 34)} até ${Math.round(endX)}, rastejante em ${Math.round(cx)})`);
  ok(passed >= 1, `o atravessar faz o sopro de fumaça (${passed} inimigo)`);
  ok(log.some((f) => f.ghost && !f.dashing), 'fica um respiro fantasma logo depois do dash');

  // ---------- 5. distância do dash ----------
  await page.evaluate(() => {
    const P = window.__progress;
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro']) P.seen.add(k);
    P.memories.add('cripta:boss');
  });
  await start('cripta', '1');
  // distância de verdade: posição do corpo quando o dash começa e quando termina
  await page.evaluate(() => {
    const p = window.__scene.player;
    const s0 = p.startDash.bind(p);
    const e0 = p.endDash.bind(p);
    p.__dash = [];
    p.startDash = (...a) => { s0(...a); p.__x0 = p.body.x; };
    p.endDash = () => { p.__dash.push(p.body.x - p.__x0); e0(); };
  });
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { const p = window.__scene.player; p.teleport(6 * 16, 20 * 16); p.facing = 1; });
    await act(idle(30));
    await act([{ pressed: ['dash'] }, ...idle(40)]);
    await wait(500);
  }
  const dists = await page.evaluate(() => window.__scene.player.__dash);
  ok(dists.length === 3 && dists.every((d) => d > 88 && d < 95), `dash anda ${dists.map((d) => d.toFixed(1)).join(', ')} px (antes 78, agora 1,2 x = 94)`);

  // ---------- 6. Cobrador vende por moedas ----------
  await page.evaluate(() => { window.__progress.coins = 100; });
  await start('sinos', 'R1');
  await page.evaluate(() => {
    const s = window.__scene;
    const c = s.props.cobrador;
    s.player.teleport(c.x - 24, c.y);
    s.openShop();
  });
  await page.waitForSelector('#screen-shop.show', { timeout: 5000 });
  await page.waitForTimeout(500);
  const offers = await page.evaluate(() => [...document.querySelectorAll('#screen-shop .offer')].map((b) => ({ id: b.dataset.id, disabled: b.disabled })));
  const en = (id) => offers.find((o) => o.id === id) && !offers.find((o) => o.id === id).disabled;
  ok(offers.length === 6, `o Cobrador mostra 6 ofertas (${offers.map((o) => o.id).join(', ')})`);
  ok(en('purse') && en('shard') && en('whetstone') && en('breath') && !en('mask') && !en('blade'), 'com 100 moedas e 1 memória: as de moeda e o Fôlego (1 memória) ficam liberados');
  const sub = await page.evaluate(() => document.querySelector('#screen-shop .sub').textContent);
  ok(/1 memória /.test(sub) && /100 moedas/.test(sub), `texto do saldo: "${sub}"`);
  await page.screenshot({ path: `${OUT}/cobrador-moedas.png` });
  await page.click('#screen-shop .offer[data-id="shard"]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const P = window.__progress;
    const save = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
    const s = window.__scene;
    return {
      coins: P.coins, maxHp: P.maxHp, reg: s.registry.get('maxhp'), hp: s.player.hp, savedCoins: save.coins, savedUp: save.upgrades, savedEq: save.equipped || [],
      purse: !document.querySelector('#screen-shop .offer[data-id="purse"]').disabled,
      whet: !document.querySelector('#screen-shop .offer[data-id="whetstone"]').disabled,
      sub: document.querySelector('#screen-shop .sub').textContent,
    };
  });
  ok(after.coins === 50 && after.maxHp === 6 && after.reg === 6, `comprou a Lasca de porcelana (50): sobram ${after.coins} moedas, vida máxima ${after.maxHp} (já entra equipada)`);
  ok(after.savedCoins === 50 && after.savedUp.includes('shard') && after.savedEq.includes('shard'), `gravado no navegador (moedas ${after.savedCoins}, itens ${after.savedUp.join(', ')}, equipados ${after.savedEq.join(', ')})`);
  ok(after.purse && !after.whet, 'com 50 moedas a Bolsa (30) continua liberada e a Pedra (70) não');
  await page.click('#screen-shop .offer[data-id="purse"]');
  await page.waitForTimeout(300);
  const coinsLeft = await page.evaluate(() => window.__progress.coins);
  ok(coinsLeft === 20, `comprou a Bolsa do dízimo (sobram ${coinsLeft})`);
  await page.screenshot({ path: `${OUT}/cobrador-depois.png` });
  await page.click('#screen-shop [data-cmd="close"]');
  await page.waitForTimeout(400);

  // ---------- 7. Bolsa do dízimo e chefe ----------
  const dropValue = (kind) => page.evaluate((kind) => {
    const s = window.__scene;
    const before = new Set(s.loot.drops);
    s.loot.drop(kind, s.player.x + 60, s.player.body.top);
    const fresh = s.loot.drops.filter((d) => !before.has(d));
    const v = fresh.filter((d) => d.kind === 'coin').reduce((a, d) => a + d.value, 0);
    for (const d of fresh) { d.gone = true; d.sprite.destroy(); d.glow && d.glow.destroy(); }
    return v;
  }, kind);
  const g = [];
  for (let i = 0; i < 6; i++) g.push(await dropValue('guard'));
  ok(g.every((v) => v >= 11 && v <= 15), `com a Bolsa o guarda deixa 1,5 x (7 a 10 vira 11 a 15): ${g.join(', ')}`);
  const boss = await dropValue('boss');
  ok(boss === 60, `o Sineiro deixa 40 moedas (60 com a Bolsa): ${boss}`);
  const map = await page.evaluate(() => { window.__scene.openMap(false); return document.querySelector('#screen-map .map-coins').textContent; });
  ok(map === '20 moedas', `o mapa mostra as moedas junto dos itens ("${map}")`);
  await page.keyboard.press('Escape');

  ok(!errs.length, `sem erros no navegador${errs.length ? ': ' + errs.join(' | ') : ''}`);
  console.log(fails ? `FALHAS: ${fails}` : 'TUDO OK');
  await browser.close();
})();
