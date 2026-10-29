// Testa a integração da lore nas salas antigas da Cidade e da Prisão (L2, lore/continuidade.md seção 9):
// os quatro registros novos, cada um no lugar e lido com {up} (o caderno guardado no alto da arcada do
// claustro, o livro do Dízimo que o Arcebispo deixa cair, o livro das máscaras que a Carcereira deixa cair e
// a lista de A. na laje do Fosso), o Diário com eles, o fim do capítulo 2 dito como lembrança dele, a fala
// nova da irmã Luzia sobre a manhã do casamento e os textos que mudaram (a abertura, a página e o bestiário
// do Arcebispo). O nome dela não aparece em nenhum deles.
// uso: node lore2.cjs <pasta-saida> [url]
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
      const st = await page.evaluate(() => { const s = window.__scene; return { room: s && s.room.id, p: s && { x: s.player.x / 16, y: s.player.body.bottom / 16 } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 120) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const setProgress = (extra = []) => page.evaluate((extra) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double']);
    for (const k of ['journal', 'memory:vale', 'gate:catacumbas', 'boss:sineiro', ...extra]) p.seen.add(k);
    p.save();
  }, extra);
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
  const setP = (x, bottom) => page.evaluate(([x, b]) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(x, b);
    p.body.setVelocity(0, 0);
    p.hp = 5;
    p.invuln = 99;
    s.registry.set('hp', 5);
  }, [x, bottom]);
  const calm = () => page.evaluate(() => { for (const e of window.__scene.enemies) if (e.kind !== 'boss' && e.vanish) e.vanish(); });
  const hookUi = () => page.evaluate(() => {
    const ui = window.__ui;
    window.__banners = [];
    window.__talks = [];
    if (ui.__hookedL2) return;
    ui.__hookedL2 = true;
    const ob = ui.banner.bind(ui);
    ui.banner = (t, ...rest) => { window.__banners.push(t); return ob(t, ...rest); };
    const ot = ui.talk.bind(ui);
    ui.talk = (o) => { window.__talks.push({ name: o.name, lines: o.lines.slice() }); return ot(o); };
  });
  const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
  const closeTalk = async () => {
    for (let i = 0; i < 14 && (await top()) === 'talk'; i++) {
      await page.keyboard.down('KeyJ');
      await page.waitForTimeout(120);
      await page.keyboard.up('KeyJ');
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(300);
  };
  // o registro da sala (os do mapa e os que um chefe deixou): antes, a vista do objeto no lugar com o
  // cavaleiro a dx de lado (para conferir que nada flutua); depois fica na frente dele, aperta para cima e fecha
  const read = async (id, dx) => {
    const at = await page.evaluate((id) => { const r = window.__scene.records.list.find((q) => q.id === id); return r && { x: r.x, y: r.y }; }, id);
    if (!at) return null;
    await setP(at.x + dx, at.y);
    await page.evaluate(([x, y]) => { const c = window.__scene.cameras.main; c.stopFollow(); c.centerOn(x, y - 24); }, [at.x, at.y]);
    await waitGame(0.5);
    await shot(`vista-${id.replace(':', '-')}`);
    await page.evaluate(() => { const s = window.__scene; s.cameras.main.startFollow(s.player.zone, true, 0.11, 0.13); });
    await setP(at.x, at.y);
    await page.evaluate(() => { const s = window.__scene; s.cameras.main.centerOn(s.player.x, s.player.body.center.y); });
    await waitGame(0.3);
    const hint = await page.evaluate(() => { const s = window.__scene; const h = s.records.nearby(s.player); return h && h.hint; });
    await page.evaluate(() => { window.__talks = []; window.__banners = []; });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(160);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => window.__talks[0] || null);
    await shot(`registro-${id.replace(':', '-')}`);
    await closeTalk();
    const kept = await page.evaluate((id) => window.__progress.seen.has(`record:${id}`) && window.__banners.includes('Registro guardado no Diário'), id);
    return t && { ...t, hint, kept, x: at.x, y: at.y, text: t.lines.join(' ') };
  };
  const recIds = () => page.evaluate(() => window.__scene.records.list.map((r) => r.id));
  const texture = (id) => page.evaluate((id) => window.__scene.textures.exists(`deco-record-${id.replace(':', '-')}`), id);

  // ---------- os textos que a lore mudou (no pacote do jogo) ----------
  const js = await page.evaluate(() => fetch('assets/game.js').then((r) => r.text()));
  check(js.includes('O último carrasco de Vespera pagou tudo.') && !js.includes('O carrasco do rei pagou tudo.'), 'a abertura: o último carrasco de Vespera (não mais o carrasco do rei)');
  check(js.includes('Mas quem pediu a conta inteira, na última lua, foi a Casa Vhalor.') && !js.includes('Um dia achou que dava para cobrar o tempo também, e o céu escureceu.'),
    'a página do Arcebispo: é a cidade que diz; quem pediu a conta inteira foi a Casa');
  check(js.includes('e mandava a conta para a Casa Vhalor. A cidade diz que um dia ele quis cobrar o tempo') && !js.includes("'Contava tudo o que a cidade pagava. Um dia quis cobrar o tempo"),
    'o bestiário do Arcebispo: contava para a Casa Vhalor');

  // ---------- o claustro: o caderno guardado no alto da arcada ----------
  await setProgress();
  await start('claustro', '1');
  await hookUi();
  await calm();
  check((await recIds()).join() === 'claustro:0' && (await texture('claustro:0')), `o claustro tem um registro, com o desenho (${(await recIds()).join()})`);
  let t = await read('claustro:0', 56);
  check(t && t.name === 'O caderno guardado' && /guarde até eu voltar/.test(t.text) && /flor prensada/.test(t.text) && t.hint && t.kept,
    `o caderno guardado se lê com {up} e fica no Diário (${t && t.name}, dica ${t && t.hint})`);
  check(t && Math.round((t.x - 8) / 16) === 11 && t.y === 25 * 16, `fica na estante do alto da arcada da esquerda (x ${t && (t.x - 8) / 16}, pé ${t && t.y / 16})`);
  const onRoof = await page.evaluate(() => { const s = window.__scene; return s.level.tileAt(11 * 16 + 8, 25 * 16 + 8) >= 2 && s.level.tileAt(11 * 16 + 8, 24 * 16 + 8) < 2; });
  check(onRoof, 'em cima do telhado da arcada, não no ar');
  check(t && !/Arielle/.test(t.text), 'sem o nome dela');

  // ---------- o altar: o livro do Dízimo cai com o Arcebispo ----------
  await setProgress();
  await start('altar', '1');
  check(!(await recIds()).includes('altar:0'), 'antes da luta o livro do Dízimo não está no altar');
  await setProgress(['boss:arcebispo']);
  await start('altar', '1');
  await hookUi();
  check((await recIds()).includes('altar:0') && (await texture('altar:0')), 'vencido o Arcebispo, o livro dele fica caído no altar');
  t = await read('altar:0', -56);
  check(t && t.name === 'O livro do Dízimo' && /Casa Vhalor/.test(t.text) && /A Casa pede a conta inteira desta lua/.test(t.text) && t.kept,
    `o livro do Dízimo: as remessas para a Casa e a conta inteira (${t && t.name})`);
  // a memória do Arcebispo fecha o capítulo 2: agora como lembrança dele
  const orb = await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((q) => q.id === 'altar:boss'); if (!m) return false; s.takeMemory(m); return true; });
  check(orb, 'a memória do Arcebispo está no altar');
  if (orb) {
    await until(() => document.querySelector('#screen-end.show'), null, 40000);
    const end = await page.evaluate(() => ({ t: document.querySelector('#screen-end .end-title').textContent, x: document.querySelector('#screen-end .end-text').textContent }));
    check(end.t === 'Fim do segundo capítulo' && /^A conta do Arcebispo fechou\. É assim que ele lembra:/.test(end.x), `o fim do capítulo 2 é dito como lembrança dele ("${end.x.slice(0, 60)}...")`);
    await shot('fim-capitulo-2');
    await page.evaluate(() => document.querySelector('#screen-end [data-cmd="explore"]').click());
    await page.waitForTimeout(400);
  }

  // ---------- a Sala da Máscara: o livro das máscaras cai com a Carcereira ----------
  await setProgress(['boss:arcebispo']);
  await start('mascara', '1');
  check(!(await recIds()).includes('mascara:0'), 'antes da luta o livro das máscaras não está na sala');
  await setProgress(['boss:arcebispo', 'boss:carcereira']);
  await start('mascara', '1');
  await hookUi();
  check((await recIds()).includes('mascara:0') && (await texture('mascara:0')), 'vencida a Carcereira, o livro dela fica no chão da sala');
  t = await read('mascara:0', 56);
  check(t && t.name === 'O livro das máscaras' && /Fechar sem chave/.test(t.text) && /a ordem não diz o crime/.test(t.text) && t.kept,
    `o livro das máscaras: a ordem da máscara dele, sem crime escrito (${t && t.name})`);

  // ---------- o Fosso: a lista de A. na laje de pouso ----------
  // com o nome dela já lembrado a assinatura continua sendo só A. (é a letra dela, como na ficha e na carta)
  await setProgress(['boss:arcebispo', 'boss:carcereira']);
  await page.evaluate(() => { const p = window.__progress; p.memories.add('cabana:0'); p.save(); });
  await start('fosso', '1');
  await hookUi();
  await calm();
  check((await recIds()).join() === 'fosso:0' && (await texture('fosso:0')), `o Fosso tem um registro, com o desenho (${(await recIds()).join()})`);
  t = await read('fosso:0', -64);
  check(t && t.name === 'A lista de A.' && /guarda no bolso sem ler/.test(t.text) && /Um dia eu leio para ele\. A\."$/.test(t.text) && t.kept,
    `a lista de A. se lê com {up} (${t && t.name})`);
  check(t && Math.round((t.x - 8) / 16) === 50 && t.y === 28 * 16, `fica na laje de pouso, contra a parede (x ${t && (t.x - 8) / 16}, pé ${t && t.y / 16})`);
  check(t && !/Arielle/.test(t.text), 'sem o nome dela, mesmo depois de lembrar');

  // ---------- o Diário: os quatro na aba Registros ----------
  // cada parte acima começou um jogo do zero; aqui os outros três contam como lidos no mesmo jogo
  await page.evaluate(() => {
    for (const id of ['claustro:0', 'altar:0', 'mascara:0']) window.__progress.seen.add(`record:${id}`);
    window.__progress.save();
  });
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForTimeout(400);
  await page.click('#screen-pause [data-cmd="journal"]');
  await page.waitForTimeout(400);
  await page.click('#screen-journal [data-tab="records"]');
  await page.waitForTimeout(300);
  const list = await page.evaluate(() => document.querySelector('#screen-journal [data-panel="records"]').textContent);
  check(['O caderno guardado', 'O livro do Dízimo', 'O livro das máscaras', 'A lista de A.'].every((n) => list.includes(n)), 'os quatro ficam no Diário, aba Registros');
  await shot('diario-registros');
  await page.evaluate(() => { window.__ui.closeAll(); window.__scene.scene.resume(); });
  await page.waitForTimeout(300);

  // ---------- a irmã Luzia: depois dos sinos, a manhã do casamento ----------
  await setProgress(['quest:sinos', 'quest:sinos:done', 'bell:telhados:0', 'bell:claustro:0', 'bell:nave:0']);
  await start('praca', '1');
  await hookUi();
  await calm();
  await setP(91 * 16 + 8, 28 * 16);
  await waitGame(0.3);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(160);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);
  t = await page.evaluate(() => window.__talks[0] || null);
  check(t && t.name === 'Irmã Luzia' && /a noiva passou correndo pela porta do claustro, antes do sino/.test(t.lines[0]) && /um caderno para guardar/.test(t.lines[0]),
    `a irmã Luzia conta da manhã do casamento (${t && t.lines[0].slice(0, 50)})`);
  await shot('luzia-casamento');
  await closeTalk();

  console.log(errs.length ? errs.join('\n') : 'sem erros no console');
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
