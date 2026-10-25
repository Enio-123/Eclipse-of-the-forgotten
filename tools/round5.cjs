// Testa a rodada 5: velocidade pelo peso da arma, trechos vencidos que viram cinza no descanso,
// apagar progresso no menu, o Badalo do Sineiro (cai do chefe, onda no chão que derruba o guarda),
// o inventário com 3 espaços (ligar, desligar, não caber, gravar, save antigo) e a loja equipando.
// uso: node round5.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
let fails = 0;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => { errs.push('ERR ' + e.message); console.log('ERRO NA PÁGINA ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' / ')); });
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FALHA ') + msg); if (!c) fails++; };
  const start = async (room, entry, from = 'door') => {
    await page.evaluate(([room, entry, from]) => {
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      window.__scene = null;
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from });
      else g.scene.start('game', { room, entry, from });
    }, [room, entry, from]);
    await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.room.id === room && window.__scene.scene.isActive() && window.__scene.loot, room, { timeout: 20000 });
    await page.waitForTimeout(500);
  };
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene && window.__scene.clock >= t, t0 + ms / 1000, { timeout: 60000, polling: 16 });
  };
  // o robô aperta ações quadro a quadro e devolve o que pedir em sample
  const act = (plan, sample) => page.evaluate(([plan, sample]) => new Promise((res, rej) => {
    setTimeout(() => rej(new Error('act: o jogo parou de atualizar')), 30000);
    const s = window.__scene;
    const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    const log = [];
    let f = 0;
    const fn = sample ? new Function('s', `return (${sample})`) : null;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      const step = plan[f] || {};
      for (const a of step.held || []) c.held[a] = true;
      for (const a of step.pressed || []) { c.pressed[a] = true; c.held[a] = true; }
      if (fn) log.push(fn(s));
      f++;
      if (f > plan.length) { c.update = c.__orig; res(log); }
    };
  }), [plan, sample]);
  const idle = (n) => Array.from({ length: n }, () => ({}));
  const hold = (a, n) => Array.from({ length: n }, () => ({ held: [a] }));
  const calm = () => page.evaluate(() => {
    for (const e of window.__scene.enemies) if (e.kind !== 'boss') { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
  });

  // ---------- 1. corrida pelo peso da arma ----------
  await page.evaluate(() => window.__progress.reset());
  await start('catacumbas', 'R0');
  await calm();
  // o trecho de chão reto mais comprido da sala (com espaço livre em cima)
  const flat = await page.evaluate(() => {
    const L = window.__scene.level;
    let best = null;
    for (let ty = 4; ty < L.h; ty++) {
      let run = 0;
      for (let tx = 0; tx < L.w; tx++) {
        const solid = L.tileAt(tx * 16 + 8, ty * 16 + 8) >= 2;
        const free = [1, 2, 3, 4].every((k) => L.tileAt(tx * 16 + 8, (ty - k) * 16 + 8) < 0);
        if (solid && free) {
          run++;
          if (!best || run > best.run) best = { run, tx0: tx - run + 1, ty };
        } else run = 0;
      }
    }
    return best;
  });
  console.log(`chão reto: ${flat.run} tiles a partir de ${flat.tx0}, linha ${flat.ty}`);
  const speeds = {};
  for (const w of ['daggers', 'bow', 'sword', 'scythe', 'badalo', 'incensario']) {
    await page.evaluate(([w, x, y]) => {
      const s = window.__scene;
      s.player.setWeapon(w);
      s.player.invuln = 99;
      s.player.teleport(x, y);
      s.player.body.setVelocity(0, 0);
    }, [w, flat.tx0 * 16 + 24, flat.ty * 16]);
    await act(idle(12));
    const log = await act(hold('right', 30), "({ vx: s.player.body.velocity.x, ts: s.player.sprite.anims.timeScale, anim: s.player.sprite.anims.currentAnim && s.player.sprite.anims.currentAnim.key })");
    const run = log.filter((l) => /-run$/.test(l.anim || ''));
    speeds[w] = { vx: Math.max(...log.map((l) => l.vx)), ts: run.length ? run[run.length - 1].ts : 0 };
  }
  const want = { daggers: 246.4, bow: 235.2, sword: 224, scythe: 210.56, badalo: 192.64, incensario: 212.8 };
  for (const [w, v] of Object.entries(want)) {
    ok(Math.abs(speeds[w].vx - v) < 1.5, `corrida com ${w}: ${speeds[w].vx.toFixed(1)} px/s (esperado ${v}); passo da animação x${speeds[w].ts.toFixed(2)}`);
  }
  ok(speeds.daggers.vx > speeds.sword.vx && speeds.sword.vx > speeds.badalo.vx, 'leve corre mais que a espada, e o badalo é o mais lento');
  ok(Math.abs(speeds.sword.vx / 160 - 1.4) < 0.01, `espada: ${(speeds.sword.vx / 160).toFixed(2)} x a corrida antiga de 160 (pedido: de 1,2 para 1,4 em relação à base de 1)`);

  // ---------- 2. trecho vencido vira cinza no descanso ----------
  await page.evaluate(() => window.__progress.reset());
  await start('catacumbas', 'R0');
  const info = await page.evaluate(() => {
    const s = window.__scene;
    const sh = s.props.shrines[0];
    return { sh: { x: sh.x, y: sh.y }, tracks: s.tracks.map((t) => ({ key: t.key, hx: t.hx, hy: t.hy, kind: t.e.kind, f: t.f })) };
  });
  ok(info.tracks.length === 7, `catacumbas com ${info.tracks.length} inimigos rastreados (${info.tracks.map((t) => t.kind).join(', ')})`);
  // o mais perto da vela: o cavaleiro passa por ele (um lado e depois o outro)
  const near = [...info.tracks].sort((a, b) => Math.hypot(a.hx - info.sh.x, a.hy - info.sh.y) - Math.hypot(b.hx - info.sh.x, b.hy - info.sh.y))[0];
  const passBy = async (t) => {
    for (const dx of [-70, 70]) {
      await page.evaluate(([x, y]) => { const p = window.__scene.player; p.invuln = 9; p.teleport(x, y); p.body.setVelocity(0, 0); }, [t.hx + dx, t.hy + 16]);
      await act(idle(3));
    }
  };
  await passBy(near);
  let seen = await page.evaluate((k) => ({ pass: window.__progress.seen.has('pass:' + k), f: window.__scene.tracks.find((t) => t.key === k).f }), near.key);
  ok(seen.pass && seen.f === 15, `passar pelos dois lados marca o ${near.kind} como vencido (pass:${near.key})`);
  const others = info.tracks.filter((t) => t.key !== near.key).map((t) => t.key);
  const otherPassed = await page.evaluate((ks) => ks.filter((k) => window.__progress.seen.has('pass:' + k)), others);
  ok(otherPassed.length === 0, `os outros continuam sem marca (${otherPassed.join(',') || 'nenhum'})`);
  // matar também conta: um rastejante com pouca vida, golpe de frente
  const crawl = info.tracks.find((t) => t.kind === 'crawler' && t.key !== near.key);
  await page.evaluate((k) => {
    const s = window.__scene;
    const t = s.tracks.find((t) => t.key === k);
    t.e.hp = 0.1;
    const p = s.player;
    p.setWeapon('sword');
    p.teleport(t.e.zone.x - 26, t.e.body.bottom);
    p.facing = 1;
    p.invuln = 9;
  }, crawl.key);
  await act([{ pressed: ['attack'] }, ...idle(14)]);
  seen = await page.evaluate((k) => ({ pass: window.__progress.seen.has('pass:' + k), alive: window.__scene.tracks.find((t) => t.key === k).e.alive }), crawl.key);
  ok(seen.pass && !seen.alive, `derrotar o rastejante também marca o trecho (pass:${crawl.key})`);
  // descansa: o vencido vivo se desfaz em cinza
  await page.evaluate((sh) => { const s = window.__scene; s.player.teleport(sh.x - 12, sh.y); s.player.body.setVelocity(0, 0); }, info.sh);
  await act(idle(6));
  await page.evaluate(() => { const s = window.__scene; s.rest(s.props.shrines[0]); });
  await wait(1150);
  await page.screenshot({ path: `${OUT}/cinza.png` });
  await wait(2600);
  const after = await page.evaluate(([k1, k2]) => {
    const s = window.__scene;
    const P = window.__progress;
    const save = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
    return {
      clear: P.seen.has('clear:' + k1) && P.seen.has('clear:' + k2),
      pass: [...P.seen].filter((k) => k.startsWith('pass:')),
      saved: save.seen.includes('clear:' + k1) && save.seen.includes('clear:' + k2),
      tracks: s.tracks.map((t) => t.key),
      alive: s.enemies.filter((e) => e.alive && e.kind !== 'boss').length,
      vanished: s.enemies.filter((e) => !e.alive && e.sprite && !e.sprite.active).length,
      thought: document.getElementById('thought').textContent,
    };
  }, [near.key, crawl.key]);
  ok(after.clear && after.pass.length === 0 && after.saved, `depois do descanso viram "clear" e ficam gravados (marcas pendentes: ${after.pass.length})`);
  ok(after.alive === 5 && after.vanished >= 1 && !after.tracks.includes(near.key), `o vencido virou cinza e sumiu (vivos ${after.alive}, desfeitos ${after.vanished})`);
  ok(/viraram cinza/.test(after.thought), `pensamento avisa: "${after.thought}"`);
  await start('catacumbas', 'R0');
  const back = await page.evaluate(() => window.__scene.tracks.map((t) => t.key));
  ok(back.length === 5 && !back.includes(near.key) && !back.includes(crawl.key), `voltando na sala, os dois não aparecem mais (${back.length} inimigos)`);
  // sala sem vela: passa na ponte, descansa nas catacumbas, a ponte fica sem aquele
  await start('ponte', 'P');
  const pt = await page.evaluate(() => window.__scene.tracks.map((t) => ({ key: t.key, hx: t.hx, hy: t.hy, kind: t.e.kind })));
  await passBy(pt[0]);
  await start('catacumbas', 'R0');
  await page.evaluate(() => { const s = window.__scene; s.rest(s.props.shrines[0]); });
  await wait(3200);
  await start('ponte', 'P');
  const pt2 = await page.evaluate(() => window.__scene.tracks.map((t) => t.key));
  ok(pt2.length === pt.length - 1 && !pt2.includes(pt[0].key), `descansar em outra sala também limpa o que foi vencido na ponte (${pt.length} para ${pt2.length})`);

  // ---------- 3. inventário com 3 espaços ----------
  await page.evaluate(() => {
    const P = window.__progress;
    P.reset();
    P.upgrades = new Set(['mask', 'blade', 'breath', 'purse']);
  });
  await start('sinos', 'R1');
  const st = () => page.evaluate(() => {
    const s = window.__scene;
    const P = window.__progress;
    return { eq: [...P.equipped], used: P.slotsUsed, max: P.maxHp, hp: s.player.hp, dmg: P.dmgMul, cd: s.player.dashCdMul, reg: s.registry.get('maxhp') };
  });
  let inv = await st();
  ok(inv.eq.length === 0 && inv.max === 5 && inv.dmg === 1 && inv.cd === 1, `itens comprados mas guardados não valem (vida ${inv.max}, dano x${inv.dmg}, recarga x${inv.cd})`);
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForSelector('#screen-pause.show');
  await page.click('#screen-pause [data-cmd="inventory"]');
  await page.waitForSelector('#screen-inventory.show');
  await page.waitForTimeout(300);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#screen-inventory .inv-item')].map((b) => ({ id: b.dataset.id, dis: b.disabled, img: b.querySelector('img').complete && b.querySelector('img').naturalWidth })));
  ok(cards.length === 7 && cards.filter((c) => !c.dis).map((c) => c.id).sort().join() === 'blade,breath,mask,purse', `inventário mostra 7 itens, 4 liberados (${cards.length}: ${cards.filter((c) => !c.dis).map((c) => c.id).join(', ')})`);
  ok(cards.every((c) => c.img >= 64), `os ícones carregaram no traço liso (${[...new Set(cards.map((c) => c.img))].join(', ')} px)`);
  await page.click('#screen-inventory .inv-item[data-id="mask"]');
  await page.click('#screen-inventory .inv-item[data-id="blade"]');
  inv = await st();
  ok(inv.used === 3 && inv.max === 6 && inv.reg === 6 && Math.abs(inv.dmg - 1.3) < 1e-6, `máscara (1) + fio (2) = 3 de 3 espaços: vida ${inv.max}, dano x${inv.dmg}`);
  ok(inv.hp === 5, `ligar a máscara traz o fragmento vazio (vida ${inv.hp} de ${inv.max})`);
  await page.click('#screen-inventory .inv-item[data-id="breath"]');
  await page.waitForTimeout(100);
  const full = await page.evaluate(() => ({ msg: document.querySelector('#screen-inventory .inv-msg').textContent, on: window.__progress.equipped.has('breath'), shake: document.querySelector('#screen-inventory .inv-slots').classList.contains('shake') }));
  ok(!full.on && /Não cabe/.test(full.msg) && full.shake, `o Fôlego não cabe com 3 ocupados: "${full.msg}"`);
  await page.screenshot({ path: `${OUT}/inventario.png` });
  await page.click('#screen-inventory .inv-item[data-id="blade"]');
  await page.click('#screen-inventory .inv-item[data-id="breath"]');
  inv = await st();
  ok(inv.used === 2 && inv.eq.includes('breath') && !inv.eq.includes('blade') && inv.cd === 0.55 && inv.dmg === 1, `trocou o fio pelo Fôlego: ${inv.used} espaços, recarga x${inv.cd}, dano x${inv.dmg}`);
  const states = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#screen-inventory .inv-item')].map((b) => [b.dataset.id, b.querySelector('.inv-state').textContent])));
  ok(states.mask === 'Equipado' && states.blade === 'Guardado' && states.shard === '', `estados na tela: ${JSON.stringify(states)}`);
  // desligar a máscara com vida cheia tira o fragmento; ligar de novo não cura
  await page.evaluate(() => { const s = window.__scene; s.player.hp = 6; s.registry.set('hp', 6); });
  await page.click('#screen-inventory .inv-item[data-id="mask"]');
  let hp = await st();
  await page.click('#screen-inventory .inv-item[data-id="mask"]');
  const hp2 = await st();
  ok(hp.max === 5 && hp.hp === 5 && hp2.max === 6 && hp2.hp === 5, `máscara: desligada vida ${hp.hp}/${hp.max}, ligada de novo ${hp2.hp}/${hp2.max} (sem cura de graça)`);
  const weaponsList = await page.evaluate(() => [...document.querySelectorAll('#screen-inventory .inv-weapons li')].map((l) => l.textContent));
  ok(weaponsList.length === 6 && /trancada/.test(weaponsList[4]) && /Sineiro/.test(weaponsList[4]) && /Arcebispo/.test(weaponsList[5]), `armas no inventário: ${weaponsList.join(' | ')}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const top = await page.evaluate(() => window.__ui.top);
  ok(top === 'pause', `Esc volta do inventário para a pausa (${top})`);
  await page.keyboard.press('Escape');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('eclipse-progresso-v1')).equipped);
  ok(saved && saved.slice().sort().join() === 'breath,mask', `gravado: ${JSON.stringify(saved)}`);
  // continuar de um save restaura os itens ligados
  const restored = await page.evaluate(() => {
    const P = window.__progress;
    const d = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
    P.restore(d);
    const a = [...P.equipped].sort().join();
    // save antigo, de antes do inventário: entram ligados na ordem de quem mais ajuda a sobreviver
    d.upgrades = ['blade', 'purse', 'whetstone', 'breath', 'shard', 'mask'];
    delete d.equipped;
    P.restore(d);
    return { a, old: [...P.equipped], used: P.slotsUsed };
  });
  ok(restored.a === 'breath,mask', `restaurou os ligados (${restored.a})`);
  ok(restored.old.join() === 'mask,shard,breath' && restored.used === 3, `save antigo: ligou ${restored.old.join(', ')} (${restored.used} espaços)`);
  // a loja equipa o que cabe e guarda o que não cabe
  await page.evaluate(() => {
    const P = window.__progress;
    P.reset();
    P.coins = 200;
    P.upgrades = new Set(['mask', 'blade']);
    P.equipped = new Set(['mask', 'blade']);
  });
  await start('sinos', 'R1');
  await page.evaluate(() => {
    const s = window.__scene;
    const c = s.props.cobrador;
    s.player.teleport(c.x - 24, c.y);
    s.openShop();
  });
  await page.waitForSelector('#screen-shop.show');
  await page.waitForTimeout(300);
  const slotsTxt = await page.evaluate(() => document.querySelector('#screen-shop .offer[data-id="whetstone"] .slots').textContent);
  ok(/Ocupa 1 espaço/.test(slotsTxt), `a loja mostra quantos espaços cada item ocupa ("${slotsTxt}")`);
  await page.click('#screen-shop .offer[data-id="whetstone"]');
  await page.waitForTimeout(200);
  const shop = await page.evaluate(() => ({ has: window.__progress.upgrades.has('whetstone'), on: window.__progress.equipped.has('whetstone'), q: document.querySelector('#screen-shop .quote').textContent, dmg: window.__progress.dmgMul }));
  ok(shop.has && !shop.on && /inventário/.test(shop.q) && Math.abs(shop.dmg - 1.3) < 1e-6, `com 3 espaços ocupados a Pedra vai para o inventário: "${shop.q}"`);
  await page.click('#screen-shop [data-cmd="close"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__scene.openMap(false));
  await page.waitForSelector('#screen-map.show');
  const mapItems = await page.evaluate(() => [...document.querySelectorAll('#screen-map .map-upgrades li')].map((l) => l.textContent));
  ok(mapItems.length === 3 && mapItems.some((t) => /Pedra de amolar.*Guardado/.test(t)) && mapItems.some((t) => /Máscara.*Equipado/.test(t)), `mapa lista os itens com o estado (${mapItems.join(' | ')})`);
  await page.keyboard.press('Escape');

  // ---------- 4. o Badalo do Sineiro ----------
  await page.evaluate(() => {
    const P = window.__progress;
    P.reset();
    P.abilities = new Set(['wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas']) P.seen.add(k);
  });
  await start('cripta', '1');
  // trancado antes de vencer
  await page.evaluate(() => window.__scene.openPause());
  await page.click('#screen-pause [data-cmd="weapon"]');
  await page.waitForSelector('#screen-weapons.show');
  await page.waitForTimeout(300);
  const lock = await page.evaluate(() => {
    const c = document.querySelector('#screen-weapons .card[data-w="badalo"]');
    return { n: document.querySelectorAll('#screen-weapons .card').length, dis: c.disabled, locked: c.classList.contains('locked'), tag: c.querySelector('.tag').textContent, stats: c.querySelectorAll('.stats dt').length };
  });
  ok(lock.n === 6 && lock.dis && lock.locked && lock.tag === 'Vença o Sineiro' && lock.stats === 4, `Trocar arma: 6 armas, o Badalo trancado ("${lock.tag}"), 4 atributos com Corrida`);
  await page.screenshot({ path: `${OUT}/armas-trancada.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // acorda e vence o chefe
  await page.evaluate(() => { const s = window.__scene; s.player.invuln = 99; s.player.teleport(14 * 16, 20 * 16); });
  await wait(2500);
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  await wait(4200);
  const drop = await page.evaluate(() => { const d = window.__scene.weaponDrop; return d && { id: d.id, x: d.x, y: d.y, ready: d.ready }; });
  ok(drop && drop.id === 'badalo' && drop.ready, `o Sineiro deixou cair o Badalo (${drop && Math.round(drop.x)}, ${drop && Math.round(drop.y)})`);
  await page.screenshot({ path: `${OUT}/badalo-caido.png` });
  // pega a memória primeiro: o fim de capítulo espera a cena da arma
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'cripta:boss'); s.player.teleport(m.x, m.y + 26); });
  await wait(1500);
  await page.evaluate(() => { const s = window.__scene; const d = s.weaponDrop; s.player.teleport(d.x, d.y + 16); });
  await wait(1800);
  const got = await page.evaluate(() => ({ seen: window.__progress.seen.has('weapon:badalo'), banner: document.querySelector('#banner h2').textContent, sub: document.querySelector('#banner p').textContent, cin: window.__scene.cinematic, saved: JSON.parse(localStorage.getItem('eclipse-progresso-v1')).seen.includes('weapon:badalo') }));
  ok(got.seen && got.saved && got.banner === 'Badalo do Sineiro' && got.sub === 'Arma liberada', `pegou: "${got.banner} · ${got.sub}" (gravado ${got.saved})`);
  await page.screenshot({ path: `${OUT}/badalo-pego.png` });
  const endEarly = await page.evaluate(() => document.querySelector('#screen-end').classList.contains('show'));
  ok(!endEarly, 'a tela de fim de capítulo não corta a cena da arma');
  await page.waitForSelector('#screen-end.show', { timeout: 30000 }).catch(() => {});
  const thought = await page.evaluate(() => document.getElementById('thought').textContent);
  ok(/Trocar arma/.test(thought), `depois o pensamento explica onde usar: "${thought}"`);
  await page.click('#screen-end [data-cmd="explore"]');
  await page.waitForTimeout(400);
  // agora liberado: troca para o badalo
  await page.evaluate(() => window.__scene.openPause());
  await page.click('#screen-pause [data-cmd="weapon"]');
  await page.waitForSelector('#screen-weapons.show');
  const open = await page.evaluate(() => { const c = document.querySelector('#screen-weapons .card[data-w="badalo"]'); return { dis: c.disabled, tag: c.querySelector('.tag').textContent }; });
  ok(!open.dis && open.tag === 'Arma do Sineiro', `liberado em Trocar arma ("${open.tag}")`);
  await page.click('#screen-weapons .card[data-w="badalo"]');
  await page.click('#screen-weapons [data-cmd="confirm"]');
  await page.waitForTimeout(300);
  const wnow = await page.evaluate(() => ({ w: window.__scene.player.weapon.id, set: window.__settings.data.weapon }));
  ok(wnow.w === 'badalo' && wnow.set === 'badalo', `usando o badalo (${wnow.w})`);
  // voltando na cripta: o badalo não cai de novo
  await start('cripta', '1');
  const again = await page.evaluate(() => !!window.__scene.weaponDrop);
  ok(!again, 'depois de pego, não aparece de novo no chão');

  // onda no chão: o guarda de frente com escudo não segura e cai
  await start('sinos', 'R1');
  const g = await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e.kind !== 'guard') { e.alive = false; e.body.enable = false; e.sprite.setVisible(false); }
    const gd = s.enemies.find((e) => e.kind === 'guard');
    return { x: gd.zone.x, bottom: gd.body.bottom, hp: gd.hp };
  });
  await page.evaluate(() => { const s = window.__scene; const gd = s.enemies.find((e) => e.kind === 'guard'); gd.atkCd = 9; });
  // de frente, do lado em que o guarda olha, longe do alcance do golpe (60) mas na onda (120)
  const gstate = await page.evaluate(() => { const gd = window.__scene.enemies.find((e) => e.kind === 'guard'); return { facing: gd.facing ?? gd.dir, state: gd.state }; });
  const side = gstate.facing > 0 ? 1 : -1;
  await page.evaluate(([x, y, side]) => { const p = window.__scene.player; p.invuln = 9; p.teleport(x + side * 92, y); p.facing = -side; p.body.setVelocity(0, 0); }, [g.x, g.bottom, side]);
  await act(idle(4));
  const q = await act([{ pressed: ['attack'] }, ...idle(40)], "({ q: s.quakes.length, gs: s.enemies.find((e) => e.kind === 'guard').state, ghp: s.enemies.find((e) => e.kind === 'guard').hp, qx: s.quakes[0] && s.quakes[0].x })");
  const born = q.findIndex((l) => l.q > 0);
  const trip = q.some((l) => l.gs === 'trip');
  const hpAfter = q[q.length - 1].ghp;
  ok(born >= 0, `a pancada no chão soltou a onda (quadro ${born}, de ${q.find((l) => l.qx) ? Math.round(q.find((l) => l.qx).qx) : '?'} px)`);
  ok(trip && hpAfter < g.hp, `a onda passou por baixo do escudo e derrubou o guarda (estado trip ${trip}, vida ${g.hp} para ${hpAfter})`);
  await page.screenshot({ path: `${OUT}/onda.png` });

  // ---------- 5. apagar progresso no menu ----------
  await page.evaluate(() => {
    const g = window.__game;
    window.__settings.data.sfx = 0.42;
    window.__settings.save();
    window.__progress.save();
    const gs = g.scene.getScene('game');
    gs.scene.stop('hud');
    gs.scene.start('title');
  });
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  await page.waitForTimeout(600);
  let menu = await page.evaluate(() => ({ cont: !document.querySelector('[data-cmd="continue"]').hidden, erase: !document.querySelector('[data-cmd="erase"]').hidden }));
  ok(menu.cont && menu.erase, 'com progresso salvo o menu mostra Continuar e Apagar progresso');
  await page.click('#screen-menu [data-cmd="erase"]');
  await page.waitForSelector('#screen-erase.show');
  await page.waitForTimeout(150);
  const focus = await page.evaluate(() => document.activeElement && document.activeElement.dataset.cmd);
  ok(focus === 'cancel', `o foco começa em Cancelar (${focus})`);
  await page.screenshot({ path: `${OUT}/apagar-confirmar.png` });
  await page.click('#screen-erase [data-cmd="cancel"]');
  await page.waitForTimeout(150);
  menu = await page.evaluate(() => ({ top: window.__ui.top, save: !!localStorage.getItem('eclipse-progresso-v1') }));
  ok(menu.top === 'menu' && menu.save, 'Cancelar volta ao menu sem apagar');
  await page.click('#screen-menu [data-cmd="erase"]');
  await page.waitForSelector('#screen-erase.show');
  await page.click('#screen-erase [data-cmd="confirm"]');
  await page.waitForTimeout(400);
  menu = await page.evaluate(() => ({
    save: localStorage.getItem('eclipse-progresso-v1'),
    cont: !document.querySelector('[data-cmd="continue"]').hidden,
    erase: !document.querySelector('[data-cmd="erase"]').hidden,
    note: document.querySelector('#screen-menu .confirm').hidden ? '' : document.querySelector('#screen-menu .confirm').textContent,
    seen: window.__progress.seen.size,
    weapon: window.__settings.data.weapon,
    sfx: window.__settings.data.sfx,
    focus: document.activeElement && document.activeElement.dataset.cmd,
  }));
  ok(menu.save === null && !menu.cont && !menu.erase && menu.seen === 0, `apagado: sem save, sem Continuar (aviso "${menu.note}")`);
  ok(menu.weapon === 'scythe' && Math.abs(menu.sfx - 0.42) < 1e-6, `as configurações ficam (efeitos ${menu.sfx}); a arma de chefe volta para a foice (${menu.weapon})`);
  await page.screenshot({ path: `${OUT}/apagado.png` });
  // novo jogo: armas de chefe trancadas
  await page.click('#screen-menu [data-cmd="new"]');
  await page.waitForSelector('#screen-weapons.show');
  const newLock = await page.evaluate(() => document.querySelector('#screen-weapons .card[data-w="badalo"]').disabled);
  ok(newLock, 'no jogo novo o Badalo aparece trancado');
  await page.screenshot({ path: `${OUT}/armas-novo-jogo.png` });

  ok(!errs.length, `sem erros no navegador${errs.length ? ': ' + errs.join(' | ') : ''}`);
  console.log(fails ? `FALHAS: ${fails}` : 'TUDO OK');
  await browser.close();
})();
