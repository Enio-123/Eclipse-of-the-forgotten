// Gente da Cidade-Catedral: a irmã Luzia (diário, missão dos sinos e recompensa), Brás (forja e
// níveis das armas), os esquecidos que falam, a procissão e o diário na pausa.
// Uso: node npcs.cjs <pasta das fotos> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp';
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
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  const state = () => page.evaluate(() => {
    const s = window.__scene;
    if (!s || !s.player) return null;
    return { room: s.room.id, x: Math.round(s.player.x), y: Math.round(s.player.body.bottom), tx: Math.floor(s.player.x / 16), ty: Math.floor(s.player.body.bottom / 16) - 1 };
  });
  const waitRoom = (id, timeout = 25000) => page.waitForFunction((id) => {
    const s = window.__scene;
    return s && s.player && s.room.id === id && s.scene.isActive() && !s.transitioning;
  }, id, { timeout });
  // progresso de quem acabou de vencer o Sineiro (relíquias, prólogo, chefe)
  const setProgress = (extra = []) => page.evaluate((extra) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', ...extra]) p.seen.add(k);
    p.save();
  }, extra);
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'continue' });
      else g.scene.start('game', { room, entry, from: 'continue' });
    }, [room, entry]);
    await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer, null, { timeout: 25000 });
    await waitRoom(room);
    await page.waitForTimeout(500);
  };
  const safe = () => page.evaluate(() => { const p = window.__scene.player; p.hurt = () => false; });
  const calm = () => page.evaluate(() => { for (const e of window.__scene.enemies) if (e.vanish) e.vanish(); });
  const tp = async (tx, ty) => {
    await page.evaluate(([x, y]) => { const p = window.__scene.player; p.teleport(x, y); p.body.setVelocity(0, 0); }, [tx * 16 + 8, (ty + 1) * 16]);
    await page.waitForTimeout(350);
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  const tap = (key) => hold(key, 160);
  const face = (dir) => page.evaluate((d) => { window.__scene.player.facing = d; }, dir);
  // espera pelo relógio do jogo (o navegador sem placa de vídeo roda mais devagar que o relógio da máquina)
  const waitGame = async (sec) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout: 30000 });
  };
  const attack = async (n, dir) => {
    for (let i = 0; i < n; i++) {
      if (dir) await face(dir);
      await tap('KeyJ');
      await waitGame(0.85);
    }
  };
  const seen = (k) => page.evaluate((k) => window.__progress.seen.has(k), k);
  const hint = () => page.evaluate(() => document.getElementById('hint').classList.contains('on') ? document.getElementById('hint').textContent.trim() : '');
  const thought = () => page.evaluate(() => document.getElementById('thought').textContent.trim());
  const solidAt = (tx, ty) => page.evaluate(([x, y]) => window.__scene.level.tileAt(x * 16 + 8, y * 16 + 8) >= 2, [tx, ty]);



  const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
  const talkText = () => page.evaluate(() => document.querySelector('#screen-talk .talk-text').textContent);
  // passa as falas até a conversa fechar (cada toque completa a fala ou vai para a próxima)
  const finishTalk = async () => {
    for (let i = 0; i < 20 && (await top()) === 'talk'; i++) {
      await tap('KeyJ');
      await page.waitForTimeout(120);
    }
  };

  await setProgress();
  await start('praca', '1');
  await safe();
  await calm();
  check(await page.evaluate(() => window.__scene.npcs.list.length === 4), 'praça tem a freira, o ferreiro e dois esquecidos');
  check(await page.evaluate(() => window.__scene.npcs.walkers.length === 4), 'a procissão passa ao fundo');

  // 1. a irmã Luzia: primeira conversa dá o diário e começa a missão dos sinos
  await tp(91, 27);
  await page.waitForTimeout(300);
  const h1 = await hint();
  check(/irmã Luzia/.test(h1), `dica para falar com a freira ("${h1}")`);
  await tap('KeyW');
  await page.waitForTimeout(500);
  check((await top()) === 'talk', 'a conversa abre');
  await page.waitForTimeout(900);
  const t1 = await talkText();
  check(/Passos de ferro/.test(t1), `primeira fala da freira ("${t1.slice(0, 40)}")`);
  await shot('n1-freira');
  await finishTalk();
  check((await top()) === null, 'a conversa fecha e o jogo volta');
  check(await seen('journal') && await seen('quest:sinos'), 'ganha o diário e a missão dos sinos');
  // 2. de novo: ela lembra quantos sinos faltam
  await page.waitForTimeout(400);
  await tap('KeyW');
  await page.waitForTimeout(1400);
  check(/três sinos ainda dormem/.test(await talkText()), 'sem sinos tocados, ela diz onde ficam');
  await finishTalk();
  // 3. os três sinos tocados: recompensa
  await page.evaluate(() => { for (const k of ['bell:telhados:0', 'bell:claustro:0', 'bell:nave:0']) window.__progress.seen.add(k); });
  const coins0 = await page.evaluate(() => window.__progress.coins);
  await page.waitForTimeout(300);
  await tap('KeyW');
  await page.waitForTimeout(1200);
  check(/Eu ouvi/.test(await talkText()), 'com os três sinos, ela agradece');
  await finishTalk();
  await page.waitForTimeout(2500);
  const coins1 = await page.evaluate(() => window.__progress.coins);
  check(await page.evaluate(() => window.__progress.upgrades.has('beads') && window.__progress.memories.has('praca:freira')), 'ganha as Contas da Irmã e a memória da voz dela');
  check(await seen('quest:sinos:done'), 'missão dos sinos concluída');
  check(coins1 - coins0 >= 25, `e moedas (${coins0} -> ${coins1})`);
  await shot('n2-recompensa');

  // 4. o diário na pausa
  await page.evaluate(() => { window.__progress.seen.add('page:praca:0'); window.__progress.kill('guard'); window.__progress.kill('guard'); });
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForTimeout(400);
  const jBtn = await page.evaluate(() => !document.querySelector('#screen-pause [data-cmd="journal"]').hidden);
  check(jBtn, 'a pausa mostra o Diário');
  await page.click('#screen-pause [data-cmd="journal"]');
  await page.waitForTimeout(400);
  check((await top()) === 'journal', 'o diário abre');
  const jc = await page.evaluate(() => [...document.querySelectorAll('#screen-journal .j-count')].map((e) => e.textContent));
  check(/1 de 14/.test(jc[0]), `história conta as páginas (${jc[0]})`);
  check(/Conhecidos: 2/.test(jc[1]), `bestiário conta os conhecidos (${jc[1]})`);
  check(/Lugares: \d+ de 21/.test(jc[2]), `lugares (${jc[2]})`);
  await shot('n3-diario');
  await page.click('#screen-journal [data-tab="beasts"]');
  await page.waitForTimeout(250);
  const beast = await page.evaluate(() => document.querySelector('#screen-journal [data-panel="beasts"] .j-entry b').textContent);
  check(beast === 'Penitente rastejante' || beast === 'Ainda não encontrado', `bestiário lista na ordem (${beast})`);
  const guard = await page.evaluate(() => [...document.querySelectorAll('#screen-journal [data-panel="beasts"] .j-entry')].map((e) => e.textContent).find((t) => /Guarda/.test(t)) || '');
  check(/Derrotados: 2/.test(guard), 'o guarda aparece com 2 derrotados');
  await shot('n4-bestiario');
  await page.evaluate(() => { window.__ui.closeAll(); window.__scene.scene.resume(); });
  await page.waitForTimeout(300);

  // 5. Brás: conversa na primeira vez, depois a forja
  await page.evaluate(() => { window.__progress.coins = 100; window.__scene.registry.set('coins', 100); });
  await tp(13, 28);
  await page.waitForTimeout(300);
  const h5 = await hint();
  check(/Brás/.test(h5), `dica para falar com o ferreiro ("${h5}")`);
  await tap('KeyW');
  await page.waitForTimeout(600);
  check((await top()) === 'talk', 'Brás conversa na primeira vez');
  await finishTalk();
  await page.waitForTimeout(400);
  check((await top()) === 'forge', 'depois abre a forja');
  await shot('n5-forja');
  const w = await page.evaluate(() => window.__scene.player.weapon.id);
  const can = await page.evaluate((w) => !document.querySelector(`#screen-forge [data-id="${w}"]`).disabled, w);
  check(can, `nível 1 da arma em uso dá para fazer (${w})`);
  await page.click(`#screen-forge [data-id="${w}"]`);
  await page.waitForTimeout(300);
  const lv = await page.evaluate((w) => [window.__progress.level(w), window.__progress.coins, window.__progress.dmgFor(w)], w);
  check(lv[0] === 1 && lv[1] === 70, `forjou: nível ${lv[0]}, ${lv[1]} moedas`);
  check(Math.abs(lv[2] - 1.1) < 0.01, `dano da arma sobe 10% (${lv[2].toFixed(2)})`);
  const lv2 = await page.evaluate((w) => !document.querySelector(`#screen-forge [data-id="${w}"]`).disabled, w);
  check(lv2, 'nível 2 libera com o bronze do Sineiro (já vencido)');
  await page.click(`#screen-forge [data-id="${w}"]`);
  await page.waitForTimeout(300);
  const lv3 = await page.evaluate((w) => [window.__progress.level(w), window.__progress.coins, !document.querySelector(`#screen-forge [data-id="${w}"]`).disabled], w);
  check(lv3[0] === 2 && lv3[1] === 10 && !lv3[2], `nível 2 feito (${lv3[1]} moedas); o 3 precisa do ouro do Arcebispo`);
  await shot('n6-forja2');
  await page.click('#screen-forge [data-cmd="close"]');
  await page.waitForTimeout(300);
  // gravou
  const saved = await page.evaluate((w) => JSON.parse(localStorage.getItem('eclipse-progresso-v1')).levels[w], w);
  check(saved === 2, `nível da arma gravado (${saved})`);

  // 6. os esquecidos: cada conversa é uma fala, em ordem
  await tp(32, 28);
  await page.waitForTimeout(300);
  await tap('KeyW');
  await page.waitForTimeout(1500);
  const f1 = await talkText();
  await finishTalk();
  await page.waitForTimeout(300);
  await tap('KeyW');
  await page.waitForTimeout(1500);
  const f2 = await talkText();
  await finishTalk();
  check(/fila anda devagar/.test(f1) && /filha/.test(f2), `o esquecido fala uma coisa por vez ("${f1.slice(0, 30)}", "${f2.slice(0, 30)}")`);

  check(errs.length === 0, `sem erros no console (${errs.length})`);
  for (const e of errs.slice(0, 8)) console.log('  ' + e);
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
