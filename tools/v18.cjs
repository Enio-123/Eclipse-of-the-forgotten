// Testa as salas novas da v18 (as áreas mais longas): em cada uma, os registros que se leem com
// {up}, o que a sala tem de próprio e os pensamentos. Galeria dos Nichos: a lápide raspada e o livro do
// coveiro, a laje de lápides que cede debaixo do cavaleiro (só depois da memória do vale) e o pensamento
// da entrada. Mercado do Dízimo: a balança e os toldos, os pratos e os toldos que seguram o cavaleiro,
// o édito da Casa Vhalor, a tabela do Dízimo na sala de contar e a parede falsa do cofre.
// As Solitárias: as passarelas da chaminé, a grade arrombada da cela de baixo, a grade inteira da de
// cima (que só o Véu atravessa), o livro das sentenças e as marcas da parede.
// A Margem da Tinta: a tinta que atrasa o passo, os pilares da comporta, a calha funda, as tábuas da
// sacada dos copistas, as correntes do gancho, os dois registros e o nicho atrás da membrana.
// uso: node v18.cjs <pasta-saida> [url]   (ONLY=nichos,mercado,solitarias,margem roda só essas partes)
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
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
      const st = await page.evaluate(() => { const s = window.__scene; return { room: s && s.room.id, p: s && { x: s.player.x / 16, y: s.player.body.bottom / 16, hp: s.player.hp } }; }).catch(() => null);
      console.log('  espera falhou: ' + fn.toString().slice(0, 120) + ' | ' + JSON.stringify(st));
      throw e;
    }
  };
  const setProgress = (extra = [], abilities = ['wall', 'double']) => page.evaluate(([extra, abilities]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', ...abilities]);
    for (const k of ['journal', ...extra]) p.seen.add(k);
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
  const P = () => page.evaluate(() => { const s = window.__scene; const p = s.player; return { x: p.x / 16, bottom: p.body.bottom / 16, hp: p.hp, room: s.room.id, ground: p.body.blocked.down }; });
  const setP = (tx, feetRow) => page.evaluate(([tx, fr]) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(tx * 16 + 8, fr * 16);
    p.body.setVelocity(0, 0);
    p.hp = 5;
    p.invuln = 99;
    s.registry.set('hp', 5);
  }, [tx, feetRow]);
  const calm = () => page.evaluate(() => { for (const e of window.__scene.enemies) if (e.kind !== 'boss' && e.vanish) e.vanish(); });
  const hookUi = () => page.evaluate(() => {
    const ui = window.__ui;
    window.__thoughts = [];
    window.__banners = [];
    window.__talks = [];
    if (ui.__hooked18) return;
    ui.__hooked18 = true;
    const orig = ui.thought.bind(ui);
    ui.thought = (text, ...rest) => { window.__thoughts.push(text); return orig(text, ...rest); };
    const ob = ui.banner.bind(ui);
    ui.banner = (t, ...rest) => { window.__banners.push(t); return ob(t, ...rest); };
    const ot = ui.talk.bind(ui);
    ui.talk = (o) => { window.__talks.push({ name: o.name, lines: o.lines.slice() }); return ot(o); };
  });
  const top = () => page.evaluate(() => { const s = document.querySelector('.screen.show'); return s ? s.id.replace('screen-', '') : null; });
  // fica na frente do registro (spawn 'r' número n da sala), aperta para cima e fecha a conversa
  const read = async (n) => {
    const at = await page.evaluate((n) => { const r = window.__scene.level.spawns.filter((q) => q.kind === 'r').sort((a, b) => a.x - b.x)[n]; return r && { tx: (r.x - 8) / 16, fr: r.y / 16 }; }, n);
    if (!at) return null;
    await setP(at.tx, at.fr);
    // a câmera vai atrás do cavaleiro aos poucos: num salto desses a foto sairia na sala errada
    await page.evaluate(() => { const s = window.__scene; s.cameras.main.centerOn(s.player.x, s.player.body.center.y); });
    await waitGame(0.3);
    const hint = await page.evaluate(() => { const s = window.__scene; const h = s.records && s.records.nearby(s.player); return h && h.hint; });
    await page.evaluate(() => { window.__talks = []; });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(160);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => window.__talks[0] || null);
    await shot(`registro-${await page.evaluate(() => window.__scene.room.id)}-${n}`);
    for (let i = 0; i < 12 && (await top()) === 'talk'; i++) {
      await page.keyboard.down('KeyJ');
      await page.waitForTimeout(120);
      await page.keyboard.up('KeyJ');
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(300);
    return t && { ...t, hint, tx: at.tx };
  };

  if (part('nichos')) {
    // ---------- Galeria dos Nichos (Vespera, entre as catacumbas e os sinos) ----------
    await setProgress(['gate:catacumbas']);
    await start('nichos', '1');
    await hookUi();
    await calm();
    await setP(5, 31);
    await waitGame(0.6);
    await setP(101, 37);
    await waitGame(0.6);
    let th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /cinzel/.test(x)), `na entrada ele pensa nos nomes raspados (${th[0]})`);
    check(th.some((x) => /coveiro/.test(x)), `na casa do coveiro, pensa em quem lembrava deles (${th[1]})`);
    // sem a memória do vale a laje de lápides aguenta
    await setP(42, 31);
    await waitGame(1.5);
    let p = await P();
    check(p.ground && Math.abs(p.bottom - 31) < 0.1, `antes da memória do vale a laje aguenta (pé ${p.bottom.toFixed(2)})`);
    // os dois registros
    let t = await read(0);
    check(t && t.name === 'As lápides raspadas' && /cinzel/.test(t.lines.join(' ')) && t.hint, `a lápide raspada se lê com {up} (${t && t.name}, dica ${t && t.hint})`);
    check(await page.evaluate(() => window.__progress.seen.has('record:nichos:0') && window.__banners.includes('Registro guardado no Diário')), 'a lápide fica no Diário');
    t = await read(1);
    const txt = t ? t.lines.join(' ') : '';
    check(t && t.name === 'O livro do coveiro' && /duzentos e doze/.test(txt) && /carrasco/.test(txt), `o livro do coveiro (${t && t.name})`);
    const glow = await page.evaluate(() => window.__scene.records.list.map((r) => +r.glow.alpha.toFixed(2)));
    check(glow.length === 2 && glow.every((a) => a < 0.2), `lidos, os dois brilham menos (${glow.join(', ')})`);
    // com a memória do vale a laje cede e ele cai nos ossos
    await setProgress(['gate:catacumbas', 'memory:vale']);
    await start('nichos', '1');
    await hookUi();
    await calm();
    await setP(42, 31);
    await waitGame(2.5);
    p = await P();
    th = await page.evaluate(() => window.__thoughts);
    const open = await page.evaluate(() => window.__progress.seen.has('trap:nichos'));
    check(open && p.ground && p.bottom > 36.5, `a laje de lápides cede e ele cai nos ossos (pé ${p.bottom.toFixed(2)}, marca ${open})`);
    check(th.some((x) => /lápides cedeu/.test(x)), `e pensa nos ossos sem nome (${th.join(' | ')})`);
    await shot('nichos-laje');
    // de volta: a laje continua aberta
    await start('nichos', '1');
    const gone = await page.evaluate(() => { const L = window.__scene.level; let n = 0; for (let x = 40; x <= 45; x++) if (L.solidCell(x, 31)) n++; return n; });
    check(gone === 0, `voltando, a laje continua aberta (${gone} pedras no lugar)`);
  }

  if (part('mercado')) {
    // ---------- Mercado do Dízimo (Cidade, entre a praça e a rua) ----------
    await setProgress(['gate:catacumbas', 'memory:vale', 'boss:sineiro', 'weapon:badalo']);
    await start('mercado', '1');
    await hookUi();
    await calm();
    await setP(5, 29);
    await waitGame(0.6);
    await setP(64, 29);
    await waitGame(0.6);
    let th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /Só a balança/.test(x)), `na entrada ele vê o mercado vazio (${th[0]})`);
    check(th.some((x) => /último Dízimo/.test(x)), `embaixo da balança, o saco que ninguém buscou (${th[1]})`);
    // a balança e os toldos estão na sala
    const decos = await page.evaluate(() => window.__scene.children.list.filter((o) => o.texture && ['deco-balanca', 'deco-toldo'].includes(o.texture.key)).map((o) => o.texture.key));
    check(decos.filter((k) => k === 'deco-balanca').length === 1 && decos.filter((k) => k === 'deco-toldo').length === 3, `a balança e os três toldos (${decos.join(' ')})`);
    // os pratos e os toldos seguram o cavaleiro
    for (const [tx, fr, what] of [[65, 25, 'o prato de baixo'], [74, 20, 'o prato de cima'], [12, 23, 'o toldo da primeira banca'], [81, 18, 'a sacada da Casa de Contagem']]) {
      await setP(tx, fr - 0.3);
      await waitGame(0.8);
      const p = await P();
      check(p.ground && Math.abs(p.bottom - fr) < 0.1, `${what} aguenta (pé ${p.bottom.toFixed(2)})`);
    }
    // os registros
    let t = await read(0);
    check(t && t.name === 'O édito da Casa Vhalor' && /CASA VHALOR/.test(t.lines.join(' ')) && t.hint && t.tx === 6, `o édito no poste da rua (${t && t.name}, x ${t && t.tx})`);
    t = await read(1);
    check(t && t.name === 'A tabela do Dízimo' && /calçaram o prato/.test(t.lines.join(' ')) && t.tx === 96, `a tabela na mesa de contar (${t && t.name}, x ${t && t.tx})`);
    await waitGame(0.3);
    th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /colunas retas/.test(x)), `na sala de contar, ele pensa nas contas (${th[th.length - 1]})`);
    // a parede falsa atrás da mesa e o cofre
    await setP(103, 18);
    await page.evaluate(() => { window.__scene.player.facing = 1; });
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__scene.fixtures.walls.length)) > 0; i++) {
      await page.keyboard.down('KeyJ');
      await page.waitForTimeout(110);
      await page.keyboard.up('KeyJ');
      await waitGame(0.45);
    }
    const walls = await page.evaluate(() => window.__scene.fixtures.walls.length);
    check(walls === 0, `a parede falsa atrás da mesa cai (${walls} de pé)`);
    await shot('mercado-cofre');
  }

  if (part('solitarias')) {
    // ---------- As Solitárias (Prisão, entre o poço e as celas) ----------
    const PRISAO = ['gate:catacumbas', 'memory:vale', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook'];
    await setProgress(PRISAO);
    await start('solitarias', '1');
    await hookUi();
    await calm();
    await setP(6, 40);
    await waitGame(0.6);
    await setP(36, 38);
    await waitGame(0.6);
    let th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /virava número/.test(x)), `na entrada ele pensa em quem perdia o nome (${th[0]})`);
    check(th.some((x) => /chaminé sobe/.test(x)), `embaixo da chaminé, pensa na cidade em cima (${th[1]})`);
    // as passarelas de ferro da chaminé, uma na altura do chão de cada solitária
    for (const [tx, fr, what] of [[34, 34, 'a passarela da cela de baixo'], [39, 28, 'a da cela do meio'], [34, 22, 'a da cela de cima'], [36, 16, 'a da claraboia']]) {
      await setP(tx, fr - 0.3);
      await waitGame(0.8);
      const p = await P();
      check(p.ground && Math.abs(p.bottom - fr) < 0.1, `${what} aguenta (pé ${p.bottom.toFixed(2)})`);
    }
    // a solitária de baixo está arrombada: entra andando, e a página do diário está lá dentro
    await setP(34, 34);
    await waitGame(0.3);
    await page.keyboard.down('KeyA');
    await waitGame(1.2);
    await page.keyboard.up('KeyA');
    await waitGame(0.3);
    let p = await P();
    check(p.ground && p.x < 30 && Math.abs(p.bottom - 34) < 0.1, `a grade arrombada deixa entrar na cela de baixo (x ${p.x.toFixed(1)}, pé ${p.bottom.toFixed(2)})`);
    const page1 = await page.evaluate(() => window.__scene.level.spawns.some((q) => q.kind === 'p'));
    check(page1, 'a página do diário ficou na cela arrombada');
    // a grade inteira da cela de cima barra quem não tem o Véu
    await setP(34, 22);
    await waitGame(0.3);
    await page.keyboard.down('KeyA');
    await waitGame(1.2);
    await page.keyboard.up('KeyA');
    p = await P();
    check(p.x > 31.5, `sem o Véu, a grade da cela de cima barra (x ${p.x.toFixed(1)})`);
    await shot('solitarias-grade');
    // os registros: o livro das sentenças na entrada e as marcas na cela de cima
    let t = await read(0);
    check(t && t.name === 'O livro das sentenças' && /no lugar do irmão/.test(t.lines.join(' ')) && t.hint && t.tx === 10, `o livro das sentenças na mesa (${t && t.name}, x ${t && t.tx})`);
    t = await read(1);
    check(t && t.name === 'As marcas da parede' && /trezentos/.test(t.lines.join(' ')) && t.tx === 27, `as marcas da cela de cima (${t && t.name}, x ${t && t.tx})`);
    // com o Véu, o dash atravessa a grade
    await setProgress(PRISAO, ['wall', 'double', 'hook', 'veil']);
    await start('solitarias', '1');
    await hookUi();
    await calm();
    await setP(34, 22);
    await waitGame(0.3);
    await page.evaluate(() => { window.__scene.player.facing = -1; });
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(60);
    await page.keyboard.down('KeyF');
    await page.waitForTimeout(90);
    await page.keyboard.up('KeyF');
    await waitGame(0.8);
    await page.keyboard.up('KeyA');
    await waitGame(0.5);
    p = await P();
    check(p.ground && p.x < 30.5 && Math.abs(p.bottom - 22) < 0.1, `com o Véu ele atravessa a grade e entra na cela (x ${p.x.toFixed(1)}, pé ${p.bottom.toFixed(2)})`);
    await shot('solitarias-veu');
  }

  if (part('margem')) {
    // ---------- A Margem da Tinta (Fosso, entre o Fosso e o Leito do Abismo) ----------
    const FOSSO = ['gate:catacumbas', 'memory:vale', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook',
      'preso:met', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto'];
    await setProgress(FOSSO, ['wall', 'double', 'hook']);
    await start('margem', '1');
    await hookUi();
    await calm();
    await setP(8, 33);
    await waitGame(0.6);
    await setP(52, 31);
    await waitGame(0.6);
    let th = await page.evaluate(() => window.__thoughts);
    check(th.some((x) => /calha/.test(x)), `na margem ele pensa na tinta que desce (${th[0]})`);
    check(th.some((x) => /comporta/.test(x)), `no vão, pensa na comporta quebrada (${th[1]})`);
    // a tinta: molha e atrasa o passo (sem nadar, só mais devagar)
    const run = async (tx, fr) => {
      await setP(tx, fr);
      await waitGame(0.4);
      const wet = await page.evaluate(() => window.__scene.player.inWater);
      const x0 = (await P()).x;
      await page.keyboard.down('KeyD');
      await waitGame(1);
      await page.keyboard.up('KeyD');
      const x1 = (await P()).x;
      await waitGame(0.2);
      return { wet, d: x1 - x0 };
    };
    const seco = await run(8, 33);
    const molhado = await run(29, 35);
    check(!seco.wet && seco.d > 6, `na margem seca ele anda solto (${seco.d.toFixed(1)} tiles)`);
    check(molhado.wet && molhado.d < seco.d * 0.85, `dentro da tinta ele atrasa (${molhado.d.toFixed(1)} tiles, molhado ${molhado.wet})`);
    await shot('margem-tinta');
    // os pilares quebrados da comporta: dá para atravessar por cima
    for (const [tx, fr, what] of [[48, 32, 'o primeiro pilar'], [54, 29, 'o segundo'], [60, 31, 'o terceiro'], [67, 33, 'o último']]) {
      await setP(tx + 0.5, fr - 0.4);
      await waitGame(0.8);
      const p = await P();
      check(p.ground && Math.abs(p.bottom - fr) < 0.1, `${what} aguenta (pé ${p.bottom.toFixed(2)})`);
    }
    // quem cai na calha funda afunda na tinta, mas sai de lá com o pulo duplo
    await setP(57, 34);
    await waitGame(1.6);
    let p = await P();
    const fundo = await page.evaluate(() => window.__scene.player.inWater);
    check(p.ground && Math.abs(p.bottom - 39) < 0.1 && fundo, `quem cai vai ao fundo da calha (pé ${p.bottom.toFixed(2)}, na tinta ${fundo})`);
    await page.keyboard.down('Space');
    await page.waitForTimeout(300);
    await page.keyboard.up('Space');
    await page.waitForTimeout(40);
    await page.keyboard.down('Space');
    await page.waitForTimeout(340);
    await page.keyboard.up('Space');
    let alto = 99;
    for (let i = 0; i < 14; i++) {
      alto = Math.min(alto, (await P()).bottom);
      await page.waitForTimeout(60);
    }
    check(alto < 33.5, `o pulo duplo tira ele da tinta funda (subiu até ${alto.toFixed(2)})`);
    // as tábuas que sobem até a sacada dos copistas
    for (const [tx, fr, what] of [[28, 29, 'a primeira tábua'], [35, 25, 'a segunda'], [38, 21, 'a terceira'], [27, 17, 'a sacada dos copistas']]) {
      await setP(tx, fr - 0.4);
      await waitGame(0.8);
      p = await P();
      check(p.ground && Math.abs(p.bottom - fr) < 0.1, `${what} aguenta (pé ${p.bottom.toFixed(2)})`);
    }
    // as correntes da comporta e a sacada da direita, onde só o gancho chega
    const rings = await page.evaluate(() => {
      const s = window.__scene;
      s.player.teleport(32 * 16 + 8, 17 * 16);
      s.player.facing = 1;
      return { n: s.fixtures.rings.length, alvo: !!s.hookTarget(s.player) };
    });
    check(rings.n === 4, `as quatro correntes estão penduradas (${rings.n})`);
    check(rings.alvo, 'da sacada o gancho enxerga a primeira corrente');
    await setP(78, 14);
    await waitGame(0.8);
    p = await P();
    check(p.ground && Math.abs(p.bottom - 14) < 0.1, `a sacada da direita aguenta (pé ${p.bottom.toFixed(2)})`);
    // os registros: o caderno na margem e a ordem em branco na sacada
    let t = await read(0);
    check(t && t.name === 'O caderno do copista' && /trinta e duas/.test(t.lines.join(' ')) && t.hint && t.tx === 8, `o caderno do copista na margem (${t && t.name}, x ${t && t.tx})`);
    t = await read(1);
    check(t && t.name === 'A ordem em branco' && /não assinou/.test(t.lines.join(' ')) && t.tx === 29, `a ordem em branco na sacada (${t && t.name}, x ${t && t.tx})`);
    // a membrana do nicho: sem o Véu ela barra
    await setP(80, 14);
    await waitGame(0.3);
    await page.keyboard.down('KeyD');
    await waitGame(1.2);
    await page.keyboard.up('KeyD');
    p = await P();
    check(p.x < 83, `sem o Véu, a membrana barra o nicho (x ${p.x.toFixed(1)})`);
    await shot('margem-membrana');
    const frag = await page.evaluate(() => window.__scene.level.spawns.filter((q) => q.kind === 'm').map((q) => (q.x - 8) / 16));
    check(frag.length === 1 && frag[0] === 86, `o fragmento de memória ficou no nicho (${frag.join()})`);
    // com o Véu, o dash atravessa a membrana
    await setProgress(FOSSO, ['wall', 'double', 'hook', 'veil']);
    await start('margem', '1');
    await hookUi();
    await calm();
    await setP(80, 14);
    await waitGame(0.3);
    await page.evaluate(() => { window.__scene.player.facing = 1; });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(60);
    await page.keyboard.down('KeyF');
    await page.waitForTimeout(90);
    await page.keyboard.up('KeyF');
    await waitGame(0.8);
    await page.keyboard.up('KeyD');
    await waitGame(0.5);
    p = await P();
    check(p.ground && p.x > 84 && Math.abs(p.bottom - 14) < 0.1, `com o Véu ele atravessa a membrana e entra no nicho (x ${p.x.toFixed(1)}, pé ${p.bottom.toFixed(2)})`);
    await shot('margem-nicho');
  }

  console.log(errs.length ? errs.join('\n') : 'sem erros no console');
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
