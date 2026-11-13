// ECLIPSE GRAPHICS, o nível acima do EXTREME: a predefinição nas Configurações, o terreno e os fundos
// pintados em 3x (Prisão, Catacumbas, Cidade e Claustro), a troca EXTREME <-> ECLIPSE com a sala aberta
// (na pausa), a volta para a pintura de antes quando um pacote não chega e as sombras vivas.
// Uso: node eclipse.cjs <pasta das fotos> [url]
//   GL=mesa (com DISPLAY apontando para um Xvfb) desenha pela placa ou pelo llvmpipe, bem mais rápido
//   que o swiftshader; RES=1..3 muda quantos pixels da tela cada pixel do jogo ocupa (padrão 2)
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'shots/eclipse';
const URL = process.argv[3] || (process.env.GAME || 'http://localhost:8765') + '/index.html';
const RES = Number(process.env.RES || 2);
const W = 640 * RES, H = 360 * RES;
const AB = ['dash', 'wall', 'double', 'hook', 'veil', 'cape', 'swim', 'light'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const mesa = process.env.GL === 'mesa';
  const args = mesa ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', `--window-size=${W},${H}`] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ headless: !mesa, args });
  let fails = 0;
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  const errs = [];
  // os pedidos que o teste derruba de propósito não contam como erro
  const blocked = [];
  const open = async (query, routes = []) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
    page.on('console', (m) => { if (m.type() === 'error' && !blocked.some((b) => (m.location().url || '').includes(b))) errs.push('CONSOLE ' + m.text() + ' ' + (m.location().url || '')); });
    page.on('response', (r) => { if (r.status() >= 400 && !blocked.some((b) => r.url().includes(b))) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
    for (const r of routes) {
      blocked.push(r);
      await page.route('**/' + r, (route) => route.fulfill({ status: 404, body: 'fora' }));
    }
    await page.goto(URL + query);
    await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
    return page;
  };
  const fresh = (page) => page.evaluate(([ab]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(ab);
    p.save();
  }, [AB]);
  // abre a sala e espera a pintura dela chegar (want = a escala do terreno que tem que aparecer)
  const start = async (page, room, want) => {
    await page.evaluate(([room]) => {
      const def = window.__rooms[room];
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.loop.wake();
      const es = [...new Set(def.map.join('').split('').filter((c) => /[0-9P]/.test(c)))].sort();
      const entry = es.includes('1') ? '1' : es[0] || 'O0';
      const gs = g.scene.getScene('game');
      if (gs && (gs.scene.isActive() || gs.scene.isPaused())) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [room]);
    await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && window.__scene.room.id === room && !window.__scene.transitioning, room, { timeout: 90000 });
    await page.evaluate(() => { window.__scene.player.hurt = () => false; });
    await settle(page, want);
  };
  // a pintura que a sala pediu chegou e a luz ficou pronta
  const settle = async (page, want) => {
    try {
      await page.waitForFunction((want) => {
        const s = window.__scene;
        if (!s || s.clock < 0.25) return false;
        if (s.lighting && !s.lighting.ready) return false;
        return s.hdScale === want;
      }, want, { timeout: 90000 });
    } catch (e) { /* a conferência de quem chamou diz o que faltou */ }
    await page.waitForTimeout(600);
  };
  const info = (page) => page.evaluate(() => {
    const s = window.__scene;
    const f = s.lighting && s.lighting.feed;
    const res = window.__res();
    const so = s.backdrop.so;
    const parts = s.backdrop.parts.map((p) => {
      const tile = p.o.type === 'TileSprite';
      const o = { key: p.key, tile, vis: p.o.visible, tex: tile ? p.o.displayTexture.key : p.o.texture.key, k: tile ? p.o.tileScaleX : p.o.scaleX, k0: p.k0 };
      if (p.m) {
        const px = p.o.displayFrame.width * p.o.tileScaleX;
        let ox = (p.o.tilePositionX * p.o.tileScaleX) % px;
        if (ox < 0) ox += px;
        o.px = px;
        o.want = Math.round((p.o.x - ox) * res) / res;
        o.m = p.m.map((i) => ({ tex: i.texture.key, x: i.x, y: i.y, k: i.scaleX, w: i.width * i.scaleX, vis: i.visible, depth: i.depth }));
        o.depth = p.o.depth;
      }
      return o;
    });
    return {
      room: s.room.id,
      hdScale: s.hdScale,
      hd: s.hdImgs.map((i) => i.texture.key),
      terrainVis: s.terrainImg ? s.terrainImg.visible : null,
      parts,
      so: [so.x, so.y],
      res,
      eclipse: f ? f.eclipse : null,
      occ: f ? f.occCount : -1,
      cast: f ? f.castCount : -1,
      active: s.scene.isActive(),
      paused: s.scene.isPaused(),
      gfx: { ...window.__settings.data.gfx },
    };
  });
  const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
  const third = (k) => near(k, 1 / 3, 0.001);
  // uma camada no ECLIPSE: o céu troca de imagem; a que repete some e fica com duas imagens inteiras em 3x
  const layer3 = (i, key, file) => {
    const p = i.parts.find((q) => q.key === key);
    if (!p) return check(false, `${i.room}: a camada ${key} existe`);
    if (!p.tile) return check(p.tex === 'hd:3:' + file && third(p.k), `${i.room}: ${key} em 3x (${p.tex}, escala ${p.k.toFixed(3)})`);
    const m = p.m || [];
    const okTex = m.length === 2 && m.every((q) => q.tex === 'hd:3:' + file && third(q.k) && q.vis && q.depth === p.depth);
    check(okTex && !p.vis, `${i.room}: ${key} em 3x, em ${m.length} imagens inteiras no lugar da camada que repete`);
    if (m.length !== 2) return;
    const cover = m[0].x <= i.so[0] + 0.01 && m[1].x + m[1].w >= i.so[0] + 640 - 0.01;
    const grid = m.every((q) => near(q.x * i.res, Math.round(q.x * i.res), 0.002));
    check(cover && near(m[1].x - m[0].x, p.px, 0.002) && near(m[0].x, p.want, 0.002) && grid, `${i.room}: ${key} cobre a tela, emenda no fim da pintura e anda com a rolagem (x ${m[0].x.toFixed(2)}, esperado ${p.want.toFixed(2)})`);
  };
  // a camada com a pintura de antes (a base, ou a 2x do EXTREME quando ela tem)
  const layerOld = (i, key, tex, what) => {
    const p = i.parts.find((q) => q.key === key);
    if (!p) return check(false, `${i.room}: a camada ${key} existe`);
    check(p.tex === tex && p.vis && !p.m, `${i.room}: ${key} ${what} (${p.tex}${p.m ? ', ainda com as imagens em 3x' : ''})`);
  };
  const terrain = (i, scale, what) => check(i.hdScale === scale && i.hd.length > 0 && i.hd.every((k) => (scale === 3 ? k.startsWith('hd:3:') : !k.startsWith('hd:3:'))) && i.terrainVis === false, `${i.room}: terreno em ${scale}x ${what} (${i.hd.length} pedaços)`);
  const tp = async (page, tx, ty) => {
    await page.evaluate(([x, y]) => { const p = window.__scene.player; p.teleport(x, y); p.body.setVelocity(0, 0); }, [tx * 16 + 8, (ty + 1) * 16]);
    await page.waitForTimeout(900);
  };
  const shot = async (page, name) => { try { await page.screenshot({ path: `${OUT}/${name}.png` }); } catch (e) { log('foto não saiu:', e.message.split('\n')[0]); } };

  // ---------- 1. a predefinição nas Configurações ----------
  let page = await open(`?res=${RES}`);
  await fresh(page);
  await page.click('#screen-menu [data-cmd="settings"]');
  await page.click('#screen-settings [data-tab="video"]');
  const radios = await page.$$eval('#screen-settings input[name="gfx"]', (rs) => rs.map((r) => ({ v: r.value, text: r.parentElement.textContent.trim() })));
  check(radios.map((r) => r.v).join(',') === 'performance,high,extreme,eclipse', `Configurações > Imagem: quatro níveis, o ECLIPSE por último (${radios.map((r) => r.v).join(', ')})`);
  const ecl = radios.find((r) => r.v === 'eclipse');
  check(!!ecl && /^ECLIPSE GRAPHICS/.test(ecl.text) && /EXTREME/.test(ecl.text) && /fundos/.test(ecl.text), `o texto do ECLIPSE diz o que ele traz a mais ("${ecl ? ecl.text.slice(0, 70) : ''}...")`);
  await page.click('#screen-settings input[name="gfx"][value="eclipse"]');
  const st = () => page.evaluate(() => ({
    gfx: { ...window.__settings.data.gfx },
    note: document.querySelector('#screen-settings .gfx-note').textContent,
    radio: [...document.querySelectorAll('#screen-settings input[name="gfx"]')].filter((r) => r.checked).map((r) => r.value).join(','),
    boxes: Object.fromEntries([...document.querySelectorAll('#screen-settings input[data-gfx]')].map((b) => [b.dataset.gfx, b.checked])),
  }));
  let u = await st();
  const all = (g) => g.hd && g.light && g.shadows && g.fog && g.reflections && g.post && g.life === 2 && g.particles === 2;
  check(all(u.gfx) && u.gfx.hd3 && u.gfx.cast, 'escolher ECLIPSE liga tudo do EXTREME e mais a pintura em 3x e as sombras vivas');
  check(/Em uso: ECLIPSE GRAPHICS\./.test(u.note) && u.radio === 'eclipse' && u.boxes.hd3 && u.boxes.cast, `a nota e as caixas acompanham ("${u.note.trim()}")`);
  await page.click('#screen-settings input[data-gfx="cast"]');
  u = await st();
  check(!u.gfx.cast && u.radio === '' && /personalizados/.test(u.note), 'desligar as sombras vivas à parte vira "ajustes personalizados"');
  await page.click('#screen-settings input[data-gfx="cast"]');
  u = await st();
  check(u.gfx.cast && u.radio === 'eclipse', 'ligar de novo volta para o ECLIPSE');
  await page.click('#screen-settings input[name="gfx"][value="extreme"]');
  u = await st();
  check(all(u.gfx) && !u.gfx.hd3 && !u.gfx.cast && u.radio === 'extreme', 'o EXTREME continua sem a pintura em 3x e sem as sombras vivas');
  await page.click('#screen-settings input[name="gfx"][value="eclipse"]');
  await page.click('#screen-settings [data-cmd="back"]');
  await page.reload();
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  u = await page.evaluate(() => ({ ...window.__settings.data.gfx }));
  check(u.hd3 && u.cast, 'a escolha fica guardada (abrindo o jogo de novo ele vem no ECLIPSE)');

  // ---------- 2. as salas com fundo repintado ----------
  await fresh(page);
  await start(page, 'praca', 3);
  let i = await info(page);
  terrain(i, 3, 'na Praça');
  layer3(i, 'city-sky', 'f-city/city-sky');
  layer3(i, 'city-far', 'f-city/city-far');
  layer3(i, 'city-mid', 'f-city/city-mid');
  check(i.eclipse === true && i.occ >= 1, `sombras vivas ligadas, com o cavaleiro fazendo sombra (${i.occ} corpo(s), ${i.cast} luz(es) fixa(s))`);
  await shot(page, 'praca-eclipse');
  // anda a câmera: as imagens em 3x seguem a camada escondida
  const before = i.parts.find((q) => q.key === 'city-mid').m[0].x;
  const wid = await page.evaluate(() => window.__scene.level.w);
  await tp(page, Math.min(wid - 6, 60), 4);
  await page.evaluate(() => { const p = window.__scene.player; p.body.setAllowGravity(false); p.body.setVelocity(0, 0); });
  await page.waitForTimeout(1500);
  i = await info(page);
  const after = i.parts.find((q) => q.key === 'city-mid').m[0].x;
  check(!near(before, after, 0.5), `as casas andam com a câmera (x ${before.toFixed(1)} -> ${after.toFixed(1)})`);
  layer3(i, 'city-far', 'f-city/city-far');
  layer3(i, 'city-mid', 'f-city/city-mid');
  await page.evaluate(() => window.__scene.player.body.setAllowGravity(true));

  for (const [room, layers] of [
    ['claustro', [['city-sky', 'f-city/city-sky'], ['city-far', 'f-city/city-far'], ['claustro-mid', 'f-claustro/claustro-mid']]],
    ['celas', [['prison-far', 'f-prison/prison-far'], ['prison-mid', 'f-prison/prison-mid']]],
    ['catacumbas', [['cat-far', 'f-catacomb/cat-far'], ['cat-mid', 'f-catacomb/cat-mid']]],
  ]) {
    await start(page, room, 3);
    i = await info(page);
    terrain(i, 3, '');
    for (const [key, file] of layers) layer3(i, key, file);
    await shot(page, `${room}-eclipse`);
  }
  i = await info(page);
  check(i.cast >= 1, `nas Catacumbas as luzes fixas fazem a sombra do cavaleiro (${i.cast} luz(es))`);

  // ---------- 3. as outras áreas (fundo em 3x ainda não pintado): terreno em 3x e o fundo de sempre ----------
  for (const room of ['ponte', 'nave', 'fosso', 'boca', 'pinhal', 'prado', 'patio', 'arquivo', 'memoria']) {
    const n = errs.length;
    await start(page, room, 3);
    i = await info(page);
    const mirrors = i.parts.filter((q) => q.m).length;
    check(i.hdScale === 3 && i.hd.length > 0 && mirrors === 0 && i.parts.every((q) => q.vis) && errs.length === n, `${room}: terreno em 3x (${i.hd.length} pedaços), fundo de sempre (${i.parts.length} camadas), sem erro`);
  }

  // ---------- 4. a troca com a sala aberta, pela pausa ----------
  await start(page, 'praca', 3);
  const pauseTo = async (preset, want) => {
    await page.evaluate(() => window.__scene.openPause());
    await page.waitForSelector('#screen-pause.show', { timeout: 10000 });
    await page.click('#screen-pause [data-cmd="settings"]');
    await page.click('#screen-settings [data-tab="video"]');
    await page.click(`#screen-settings input[name="gfx"][value="${preset}"]`);
    await settle(page, want);
    const paused = await info(page);
    await shot(page, `troca-${preset}-pausa`);
    await page.click('#screen-settings [data-cmd="back"]');
    await page.click('#screen-pause [data-cmd="resume"]');
    await page.waitForTimeout(700);
    return paused;
  };
  i = await pauseTo('extreme', 2);
  check(i.paused, 'o jogo fica parado enquanto as Configurações estão abertas');
  terrain(i, 2, 'logo que o EXTREME é escolhido, ainda na pausa');
  layerOld(i, 'city-sky', 'city-sky', 'volta para o céu de antes');
  layerOld(i, 'city-far', 'city-far', 'volta a ser a camada que repete');
  layerOld(i, 'city-mid', 'city-mid', 'volta a ser a camada que repete');
  const back = i.parts.filter((q) => q.k0 !== undefined).every((q) => near(q.k, q.k0, 0.0005));
  check(back && i.eclipse === false && i.occ === 0, 'as camadas voltam para a medida de antes e as sombras vivas desligam');
  i = await info(page);
  check(i.active && i.hdScale === 2, 'saindo da pausa o jogo continua no EXTREME');
  await shot(page, 'praca-extreme');
  i = await pauseTo('eclipse', 3);
  terrain(i, 3, 'logo que o ECLIPSE é escolhido, ainda na pausa');
  layer3(i, 'city-sky', 'f-city/city-sky');
  layer3(i, 'city-far', 'f-city/city-far');
  layer3(i, 'city-mid', 'f-city/city-mid');
  i = await info(page);
  check(i.active && i.hdScale === 3 && i.eclipse === true, 'saindo da pausa o jogo continua no ECLIPSE');
  await page.context().close();

  // ---------- 5. um pacote que não chega: fica a pintura de antes ----------
  const man = JSON.parse(await (await fetch(URL.replace(/index\.html.*$/, '') + 'assets/hd/manifest.json')).text());
  const packOf = (room) => man.terrain3[room].pack;
  // (o endereço fixando o nível, como nos testes e nas fotos)
  page = await open(`?res=${RES}&gfx=eclipse`, ['assets/hd3/f-city.json', 'assets/hd3/f-catacomb.json', `assets/hd3/${packOf('celas')}.json`]);
  await fresh(page);
  u = await page.evaluate(() => { window.__ui.openSettings(); return document.querySelector('#screen-settings .gfx-note').textContent; });
  check(/fixou ECLIPSE GRAPHICS/.test(u), `?gfx=eclipse no endereço fixa o nível ("${u.trim()}")`);
  await page.evaluate(() => window.__ui.closeAll());
  await start(page, 'praca', 3);
  i = await info(page);
  terrain(i, 3, 'mesmo sem o pacote dos fundos da cidade');
  layerOld(i, 'city-sky', 'city-sky', 'fica com o céu de antes');
  layerOld(i, 'city-far', 'city-far', 'fica com a pintura de antes');
  layerOld(i, 'city-mid', 'city-mid', 'fica com a pintura de antes');
  await start(page, 'catacumbas', 3);
  i = await info(page);
  terrain(i, 3, 'mesmo sem o pacote dos fundos das Catacumbas');
  for (const key of ['cat-far', 'cat-mid']) layerOld(i, key, 'hd:' + man.backdrop[key].file, 'fica com a pintura em 2x do EXTREME');
  await start(page, 'celas', 2);
  i = await info(page);
  terrain(i, 2, 'quando o pacote do terreno em 3x não chega');
  check(i.parts.every((q) => q.vis && !q.m), 'e os fundos ficam os de antes, inteiros');
  await page.context().close();

  if (errs.length) console.log([...new Set(errs)].slice(0, 20).join('\n'));
  check(errs.length === 0, 'nenhum erro na página');
  console.log(fails ? `\n${fails} FALHA(S)` : '\ntudo certo');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
