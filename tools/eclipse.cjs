// ECLIPSE GRAPHICS, o nível acima do EXTREME: a predefinição nas Configurações, o terreno e os fundos
// pintados em 3x (Prisão, Fosso, Catacumbas, Cidade, Claustro, Catedral e Minas), a troca EXTREME <->
// ECLIPSE com a sala aberta (na pausa), a volta para a pintura de antes quando um pacote não chega, as
// sombras vivas, o eclipse vivo (a luz que se mexe por cima do eclipse pintado no céu e no título) e os
// enfeites antigos da primeira área (portão, estátuas, lampiões, musgo, velas...) na pintura em 3x.
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
    page.hd3 = [];
    page.on('request', (r) => { if (r.url().includes('/assets/hd3/')) page.hd3.push(r.url().replace(/^.*\/assets\/hd3\//, '')); });
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
        const py = p.o.displayFrame.height * p.o.tileScaleY;
        let ox = (p.o.tilePositionX * p.o.tileScaleX) % px;
        if (ox < 0) ox += px;
        let oy = (p.o.tilePositionY * p.o.tileScaleY) % py;
        if (oy < 0) oy += py;
        o.px = px;
        o.py = py;
        o.th = p.o.height;
        o.want = Math.round((p.o.x - ox) * res) / res;
        o.wantY = Math.round((p.o.y - oy) * res) / res;
        o.m = p.m.map((i) => ({ tex: i.texture.key, x: i.x, y: i.y, k: i.scaleX, w: i.width * i.scaleX, h: i.height * i.scaleY, vis: i.visible, depth: i.depth, linear: i.texture.source[0].scaleMode === 0 }));
        o.depth = p.o.depth;
      }
      return o;
    });
    const lv = s.backdrop.live;
    const sky = s.backdrop.parts.find((p) => /-sky/.test(p.key));
    const live = lv ? {
      x: lv.box.x, y: lv.box.y, depth: lv.box.depth, r: lv.r, sf: lv.box.scrollFactorX,
      keys: lv.box.list.map((o) => o.texture.key), add: lv.box.list.every((o) => o.blendMode === 1),
      rot: [lv.a.rotation, lv.b.rotation], alpha: [lv.a.alpha, lv.b.alpha, lv.ring.alpha], tint: lv.a.tintTopLeft,
      linear: lv.box.list.every((o) => o.texture.source[0].scaleMode === 0),
    } : null;
    return {
      room: s.room.id,
      live,
      skyAt: sky ? [sky.o.x, sky.o.y] : null,
      ending: [...window.__progress.seen].filter((k) => k.startsWith('ending:')).join(','),
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
  // uma camada no ECLIPSE: o céu troca de imagem; a que repete some e fica com imagens inteiras em 3x
  // (duas quando a pintura é mais larga que a tela; nos poços, que repetem nas duas direções com 512 px,
  // três colunas por duas linhas)
  const layer3 = (i, key, file) => {
    const p = i.parts.find((q) => q.key === key);
    if (!p) return check(false, `${i.room}: a camada ${key} existe`);
    if (!p.tile) return check(p.tex === 'hd:3:' + file && third(p.k), `${i.room}: ${key} em 3x (${p.tex}, escala ${p.k.toFixed(3)})`);
    const m = p.m || [];
    const cols = p.m ? Math.ceil(640 / p.px) + 1 : 0;
    const rows = p.m ? (p.py <= p.th + 0.5 ? 1 : Math.ceil(p.th / p.py) + 1) : 0;
    const okTex = m.length === cols * rows && m.length >= 2 && m.every((q) => q.tex === 'hd:3:' + file && third(q.k) && q.vis && q.depth === p.depth);
    check(okTex && !p.vis, `${i.room}: ${key} em 3x, em ${m.length} imagens inteiras (${cols} por ${rows}) no lugar da camada que repete`);
    if (!okTex) return;
    const last = m[m.length - 1];
    let cover = m[0].x <= i.so[0] + 0.01 && last.x + last.w >= i.so[0] + 640 - 0.01;
    if (rows > 1) cover = cover && m[0].y <= i.so[1] + 0.01 && last.y + last.h >= i.so[1] + 360 - 0.01 && near(m[cols].y - m[0].y, p.py, 0.002) && near(m[0].y, p.wantY, 0.002);
    const grid = m.every((q) => near(q.x * i.res, Math.round(q.x * i.res), 0.002) && near(q.y * i.res, Math.round(q.y * i.res), 0.002));
    check(cover && near(m[1].x - m[0].x, p.px, 0.002) && near(m[0].x, p.want, 0.002) && grid, `${i.room}: ${key} cobre a tela, emenda no fim da pintura e anda com a rolagem (x ${m[0].x.toFixed(2)}, esperado ${p.want.toFixed(2)})`);
  };
  // ECLIPSE numa camada que repete e não tem pintura em 3x (ou o pacote dela não chegou): sai direto da pintura
  // em 2x (a do EXTREME, ou a de sempre quando essa já é pintada em 2x), em imagens inteiras lidas com filtro,
  // no lugar da camada que repete (que o Phaser estica e serrilha)
  const half = (k) => near(k, 0.5, 0.001);
  const layer2 = (i, key, tex) => {
    const p = i.parts.find((q) => q.key === key);
    if (!p) return check(false, `${i.room}: a camada ${key} existe`);
    const m = p.m || [];
    const cols = p.m ? Math.ceil(640 / p.px) + 1 : 0;
    const rows = p.m ? (p.py <= p.th + 0.5 ? 1 : Math.ceil(p.th / p.py) + 1) : 0;
    const okTex = m.length === cols * rows && m.length >= 2 && m.every((q) => q.tex === tex && half(q.k) && q.vis && q.depth === p.depth && q.linear);
    check(okTex && !p.vis, `${i.room}: ${key} direto da pintura em 2x (${m.length ? m[0].tex : p.tex}), em ${m.length} imagens inteiras com filtro`);
    if (!okTex) return;
    const last = m[m.length - 1];
    let cover = m[0].x <= i.so[0] + 0.01 && last.x + last.w >= i.so[0] + 640 - 0.01;
    if (rows > 1) cover = cover && m[0].y <= i.so[1] + 0.01 && last.y + last.h >= i.so[1] + 360 - 0.01;
    check(cover && near(m[1].x - m[0].x, p.px, 0.002) && near(m[0].x, p.want, 0.002), `${i.room}: ${key} cobre a tela e anda com a rolagem (x ${m[0].x.toFixed(2)}, esperado ${p.want.toFixed(2)})`);
  };
  // a camada com a pintura de antes (a base, ou a 2x do EXTREME quando ela tem)
  const layerOld = (i, key, tex, what) => {
    const p = i.parts.find((q) => q.key === key);
    if (!p) return check(false, `${i.room}: a camada ${key} existe`);
    check(p.tex === tex && p.vis && !p.m, `${i.room}: ${key} ${what} (${p.tex}${p.m ? ', ainda com as imagens em 3x' : ''})`);
  };
  const terrain = (i, scale, what) => check(i.hdScale === scale && i.hd.length > 0 && i.hd.every((k) => (scale === 3 ? k.startsWith('hd:3:') : !k.startsWith('hd:3:'))) && i.terrainVis === false, `${i.room}: terreno em ${scale}x ${what} (${i.hd.length} pedaços)`);
  // o eclipse vivo: a luz por cima do eclipse pintado no céu (at: onde ele está na pintura; r: o raio do disco)
  const LIVE = ['eclipse-live-b', 'eclipse-live-a', 'eclipse-live-ring', 'eclipse-live-bead', 'eclipse-live-bead', 'eclipse-live-bead'];
  const liveOn = (i, at, r, what) => {
    const l = i.live;
    if (!l) return check(false, `${i.room}: o eclipse vivo está no céu ${what}`);
    const made = l.keys.join(',') === LIVE.join(',') && l.add && l.linear && l.sf === 0 && l.depth > -20 && l.depth < -18;
    const base = i.skyAt || i.so;
    const placed = near(l.x - base[0], at[0], 0.011) && near(l.y - base[1], at[1], 0.011) && near(l.r, r, 0.05);
    check(made && placed, `${i.room}: o eclipse vivo ${what} (raios, plumas, clarão e três contas, somados, atrás das nuvens; centro ${(l.x - base[0]).toFixed(2)}, ${(l.y - base[1]).toFixed(2)}, raio ${l.r.toFixed(1)})`);
  };
  const tp = async (page, tx, ty) => {
    await page.evaluate(([x, y]) => { const p = window.__scene.player; p.teleport(x, y); p.body.setVelocity(0, 0); }, [tx * 16 + 8, (ty + 1) * 16]);
    await page.waitForTimeout(900);
  };
  const shot = async (page, name) => { try { await page.screenshot({ path: `${OUT}/${name}.png` }); } catch (e) { log('foto não saiu:', e.message.split('\n')[0]); } };

  const man = JSON.parse(await (await fetch(URL.replace(/index\.html.*$/, '') + 'assets/hd/manifest.json')).text());
  // ---------- os enfeites antigos da primeira área, que no ECLIPSE vêm da pintura em 3x ----------
  // de cada um: a imagem que está na tela e o que não pode mudar com a troca (o lugar, o tamanho na tela, o
  // recorte do musgo curto, o passo da repetição das correntes e dos postes, o quadro da folha, a cor)
  const PROPS = man.props3 || {};
  const PKEYS = Object.keys(PROPS);
  const bigKey = (base) => `hd:3:${PROPS[base].pack}/${PROPS[base].id}`;
  const props = (page) => page.evaluate((keys) => {
    const r2 = (v) => Math.round(v * 100) / 100;
    const out = [];
    for (const o of window.__scene.children.list) {
      const tile = o.type === 'TileSprite';
      if (!tile && o.type !== 'Image' && o.type !== 'Sprite') continue;
      const tex = tile ? o.displayTexture.key : o.texture.key;
      const was = o.data ? o.data.get('p3') : undefined;
      const base = was || tex;
      if (!keys.includes(base)) continue;
      const fr = tile ? o.displayFrame : o.frame;
      const anim = o.anims && o.anims.currentAnim ? o.anims.currentAnim.key : '';
      const geo = [o.type, base, r2(o.x), r2(o.y), o.originX, o.originY, o.depth, o.flipX ? 'F' : '', o.tintTopLeft.toString(16), o.visible ? '' : 'oculto'];
      if (tile) geo.push(r2(o.width), r2(o.height), r2(o.scaleX), r2(o.scaleY), r2(fr.width * o.tileScaleX), r2(fr.height * o.tileScaleY), r2(o.tilePositionX * o.tileScaleX), r2(o.tilePositionY * o.tileScaleY), r2(o.rotation));
      else {
        geo.push(r2(o.displayWidth), r2(o.displayHeight), anim ? anim.replace(/@3$/, '') : `q${fr.name}`);
        if (o.isCropped) { const c = o._crop; const kx = Math.abs(o.scaleX), ky = Math.abs(o.scaleY); geo.push('corte', r2(c.x * kx), r2(c.y * ky), r2(c.width * kx), r2(c.height * ky)); }
      }
      out.push({ base, tex, was: !!was, type: o.type, anim, cut: !tile && o.isCropped, linear: fr.texture.source[0].scaleMode === 0, k: tile ? o.tileScaleX : o.scaleX, dw: tile ? o.width : o.displayWidth, dh: tile ? o.height : o.displayHeight, geo: geo.join(' ') });
    }
    return out;
  }, PKEYS);
  const kinds = (ps) => [...new Set(ps.map((q) => q.base.replace(/^deco-/, '')))].sort().join(', ');
  // todos na pintura em 3x (lida com filtro; as velas com a animação dos quadros grandes)
  const propsBig = (ps, room, min, what = '') => {
    const bad = ps.filter((q) => !(q.was && q.tex === bigKey(q.base) && q.linear && (q.anim === '' || /@3$/.test(q.anim))));
    check(ps.length >= min && bad.length === 0, `${room}: os ${ps.length} enfeites antigos estão na pintura em 3x${what} (${bad.length ? `${bad.length} não: ${kinds(bad)}` : kinds(ps)})`);
  };
  // todos na imagem de sempre, como se nunca tivessem sido trocados
  const propsOld = (ps, room, min, what = '') => {
    const bad = ps.filter((q) => q.was || q.tex !== q.base || /@3$/.test(q.anim) || q.linear);
    check(ps.length >= min && bad.length === 0, `${room}: os ${ps.length} enfeites antigos estão na imagem de sempre${what}${bad.length ? ` (${bad.length} não: ${kinds(bad)})` : ''}`);
  };
  // os mesmos enfeites, cada um no mesmo lugar e com o mesmo tamanho, recorte e passo
  const sameProps = (a, b) => {
    const A = a.map((q) => q.geo).sort();
    const B = b.map((q) => q.geo).sort();
    const diff = A.filter((g, n) => g !== B[n]);
    if (A.length !== B.length || diff.length) log('enfeites diferentes:', A.length, B.length, diff.slice(0, 3).join(' | '), '<>', B.filter((g, n) => g !== A[n]).slice(0, 3).join(' | '));
    return A.length === B.length && diff.length === 0;
  };

  // ---------- 1. a predefinição nas Configurações ----------
  let page = await open(`?res=${RES}`);
  await fresh(page);
  await page.click('#screen-menu [data-cmd="settings"]');
  await page.click('#screen-settings [data-tab="video"]');
  const radios = await page.$$eval('#screen-settings input[name="gfx"]', (rs) => rs.map((r) => ({ v: r.value, text: r.parentElement.textContent.trim() })));
  check(radios.map((r) => r.v).join(',') === 'performance,high,extreme,eclipse', `Configurações > Imagem: quatro níveis, o ECLIPSE por último (${radios.map((r) => r.v).join(', ')})`);
  const ecl = radios.find((r) => r.v === 'eclipse');
  check(!!ecl && /^ECLIPSE GRAPHICS/.test(ecl.text) && /EXTREME/.test(ecl.text) && /fundos/.test(ecl.text) && /Catedral/.test(ecl.text) && /Minas/.test(ecl.text) && /eclipse vivo/.test(ecl.text), `o texto do ECLIPSE diz o que ele traz a mais ("${ecl ? ecl.text.slice(0, 70) : ''}...")`);
  await page.click('#screen-settings input[name="gfx"][value="eclipse"]');
  const st = () => page.evaluate(() => ({
    gfx: { ...window.__settings.data.gfx },
    note: document.querySelector('#screen-settings .gfx-note').textContent,
    radio: [...document.querySelectorAll('#screen-settings input[name="gfx"]')].filter((r) => r.checked).map((r) => r.value).join(','),
    boxes: Object.fromEntries([...document.querySelectorAll('#screen-settings input[data-gfx]')].map((b) => [b.dataset.gfx, b.checked])),
  }));
  let u = await st();
  const all = (g) => g.hd && g.light && g.shadows && g.fog && g.reflections && g.post && g.life === 2 && g.particles === 2;
  check(all(u.gfx) && u.gfx.hd3 && u.gfx.cast && u.gfx.sky, 'escolher ECLIPSE liga tudo do EXTREME e mais a pintura em 3x, as sombras vivas e o eclipse vivo');
  check(/Em uso: ECLIPSE GRAPHICS\./.test(u.note) && u.radio === 'eclipse' && u.boxes.hd3 && u.boxes.cast && u.boxes.sky, `a nota e as caixas acompanham ("${u.note.trim()}")`);
  // a tela de título atrás das Configurações: o eclipse dela ganha a luz viva na hora
  const title = () => page.evaluate(() => {
    const t = window.__game.scene.getScene('title');
    const l = t.live;
    return l ? { x: l.box.x, y: l.box.y, r: l.r, rot: l.a.rotation, n: l.box.list.length, depth: l.box.depth } : null;
  });
  let tl = await title();
  check(!!tl && near(tl.x, 469.8, 0.011) && near(tl.y, 84.8, 0.011) && near(tl.r, 25.7, 0.05) && tl.n === 6 && tl.depth > -20 && tl.depth < -18, `no título o eclipse vivo entra na hora, em cima do pintado (${tl ? `${tl.x.toFixed(1)}, ${tl.y.toFixed(1)}, raio ${tl.r}` : 'não entrou'})`);
  await page.waitForTimeout(1200);
  const tl2 = await title();
  check(!!tl && !!tl2 && tl2.rot > tl.rot, `a coroa gira devagar (${tl ? tl.rot.toFixed(4) : '-'} -> ${tl2 ? tl2.rot.toFixed(4) : '-'} rad)`);
  await page.click('#screen-settings input[data-gfx="sky"]');
  u = await st();
  check(!u.gfx.sky && u.radio === '' && /personalizados/.test(u.note) && (await title()) === null, 'desligar o eclipse vivo à parte vira "ajustes personalizados" e tira a luz do título');
  await page.click('#screen-settings input[data-gfx="sky"]');
  u = await st();
  check(u.gfx.sky && u.radio === 'eclipse' && (await title()) !== null, 'ligar de novo volta para o ECLIPSE, com a luz no título');
  await page.click('#screen-settings input[data-gfx="cast"]');
  u = await st();
  check(!u.gfx.cast && u.radio === '' && /personalizados/.test(u.note), 'desligar as sombras vivas à parte vira "ajustes personalizados"');
  await page.click('#screen-settings input[data-gfx="cast"]');
  u = await st();
  check(u.gfx.cast && u.radio === 'eclipse', 'ligar de novo volta para o ECLIPSE');
  await page.click('#screen-settings input[name="gfx"][value="extreme"]');
  u = await st();
  check(all(u.gfx) && !u.gfx.hd3 && !u.gfx.cast && !u.gfx.sky && u.radio === 'extreme' && (await title()) === null, 'o EXTREME continua sem a pintura em 3x, sem as sombras vivas e sem o eclipse vivo');
  await page.click('#screen-settings input[name="gfx"][value="eclipse"]');
  await page.click('#screen-settings [data-cmd="back"]');
  await page.reload();
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  u = await page.evaluate(() => ({ ...window.__settings.data.gfx }));
  check(u.hd3 && u.cast && u.sky, 'a escolha fica guardada (abrindo o jogo de novo ele vem no ECLIPSE)');
  // um ajuste gravado pela versão 21, de antes do eclipse vivo: o ECLIPSE inteiro continua ECLIPSE, o EXTREME continua EXTREME
  const old = async (preset) => {
    await page.evaluate((preset) => {
      const d = JSON.parse(localStorage.getItem('eclipse-ajustes-v1'));
      const all = { hd: true, light: true, shadows: true, fog: true, reflections: true, post: true, life: 2, particles: 2 };
      d.gfx = preset === 'eclipse' ? { ...all, hd3: true, cast: true } : { ...all, hd3: false, cast: false };
      localStorage.setItem('eclipse-ajustes-v1', JSON.stringify(d));
    }, preset);
    await page.reload();
    await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
    return page.evaluate(() => ({ ...window.__settings.data.gfx }));
  };
  u = await old('extreme');
  check(u.sky === false && !u.hd3, 'um ajuste antigo no EXTREME abre no EXTREME, sem o eclipse vivo');
  u = await old('eclipse');
  check(u.sky === true && u.hd3 && u.cast, 'um ajuste antigo no ECLIPSE abre no ECLIPSE, já com o eclipse vivo');

  // ---------- 2. as salas com fundo repintado ----------
  await fresh(page);
  await start(page, 'praca', 3);
  let i = await info(page);
  terrain(i, 3, 'na Praça');
  layer3(i, 'city-sky', 'f-city/city-sky');
  layer3(i, 'city-far', 'f-city/city-far');
  layer3(i, 'city-mid', 'f-city/city-mid');
  check(i.eclipse === true && i.occ >= 1, `sombras vivas ligadas, com o cavaleiro fazendo sombra (${i.occ} corpo(s), ${i.cast} luz(es) fixa(s))`);
  liveOn({ ...i, skyAt: i.so }, [464.75, 74.75], 19.9, 'no céu da cidade');
  await shot(page, 'praca-eclipse');
  const rot0 = i.live ? i.live.rot : [0, 0];
  // anda a câmera: as imagens em 3x seguem a camada escondida
  const before = i.parts.find((q) => q.key === 'city-mid').m[0].x;
  const wid = await page.evaluate(() => window.__scene.level.w);
  await tp(page, Math.min(wid - 6, 60), 4);
  await page.evaluate(() => { const p = window.__scene.player; p.body.setAllowGravity(false); p.body.setVelocity(0, 0); });
  await page.waitForTimeout(1500);
  i = await info(page);
  const after = i.parts.find((q) => q.key === 'city-mid').m[0].x;
  check(!near(before, after, 0.5), `as casas andam com a câmera (x ${before.toFixed(1)} -> ${after.toFixed(1)})`);
  check(!!i.live && i.live.rot[0] > rot0[0] && i.live.rot[1] < rot0[1], `os raios e as plumas giram um contra o outro (${rot0[0].toFixed(4)} -> ${i.live ? i.live.rot[0].toFixed(4) : '-'} e ${rot0[1].toFixed(4)} -> ${i.live ? i.live.rot[1].toFixed(4) : '-'} rad)`);
  liveOn({ ...i, skyAt: i.so }, [464.75, 74.75], 19.9, 'continua preso no céu quando a câmera anda');
  layer3(i, 'city-far', 'f-city/city-far');
  layer3(i, 'city-mid', 'f-city/city-mid');
  await page.evaluate(() => window.__scene.player.body.setAllowGravity(true));

  for (const [room, layers] of [
    ['claustro', [['city-sky', 'f-city/city-sky'], ['city-far', 'f-city/city-far'], ['claustro-mid', 'f-claustro/claustro-mid']]],
    ['celas', [['prison-far', 'f-prison/prison-far'], ['prison-mid', 'f-prison/prison-mid']]],
    ['catacumbas', [['cat-far', 'f-catacomb/cat-far'], ['cat-mid', 'f-catacomb/cat-mid']]],
    ['nave', [['nave-far', 'f-nave/nave-far'], ['nave-mid', 'f-nave/nave-mid']]],
    ['boca', [['mine-far', 'f-mine/mine-far'], ['mine-mid', 'f-mine/mine-mid']]],
    ['fosso', [['fosso-far', 'f-fosso/fosso-far'], ['fosso-mid', 'f-fosso/fosso-mid']]],
  ]) {
    await start(page, room, 3);
    i = await info(page);
    terrain(i, 3, '');
    for (const [key, file] of layers) layer3(i, key, file);
    if (room === 'catacumbas') check(i.cast >= 1, `nas Catacumbas as luzes fixas fazem a sombra do cavaleiro (${i.cast} luz(es))`);
    if (room === 'catacumbas' || room === 'celas') propsBig(await props(page), room, room === 'celas' ? 100 : 150);
    if (room === 'claustro') liveOn({ ...i, skyAt: i.so }, [464.75, 74.75], 19.9, 'no céu do claustro');
    else check(i.live === null, `${room}: sala sem céu, sem eclipse vivo`);
    await shot(page, `${room}-eclipse`);
  }

  // ---------- 3. as outras áreas (fundo em 3x ainda não pintado): terreno em 3x e o fundo direto da pintura em 2x ----------
  // (e o eclipse vivo em todo céu que mostra o eclipse: na Ponte ele anda junto com o céu; no Vale e nas Torres
  // fica preso na tela; na neve, na memória e dentro das torres não tem eclipse no céu)
  let ponteProps = [];
  const SKY = { ponte: [[819.8, 94.8], 25.7], prado: [[483.75, 55.75], 14.8], patio: [[483.75, 55.75], 14.8] };
  // quantas camadas pintadas que repetem cada sala tem (Ponte: nuvens longe e perto, a cidade do meio, a beira
  // acesa dela e o primeiro plano; dentro das torres não tem fundo)
  const TWO = { ponte: 5, pinhal: 2, prado: 2, patio: 1, arquivo: 0, memoria: 2 };
  for (const room of ['ponte', 'pinhal', 'prado', 'patio', 'arquivo', 'memoria']) {
    const n = errs.length;
    await start(page, room, 3);
    i = await info(page);
    // as camadas pintadas que repetem (com pintura em 2x) saem direto dela; o resto (céu, névoa) fica como sempre
    const two = i.parts.filter((q) => q.tile && (man.backdrop[q.key] || q.k0 < 0.99));
    const rest = i.parts.filter((q) => !two.includes(q));
    check(i.hdScale === 3 && i.hd.length > 0 && two.length === TWO[room] && rest.every((q) => q.vis && !q.m) && errs.length === n,
      `${room}: terreno em 3x (${i.hd.length} pedaços), ${two.length} camada(s) pintada(s) que repete(m) de ${i.parts.length}, sem erro`);
    for (const q of two) layer2(i, q.key, man.backdrop[q.key] ? 'hd:' + man.backdrop[q.key].file : q.key);
    if (SKY[room]) liveOn(room === 'ponte' ? i : { ...i, skyAt: i.so }, SKY[room][0], SKY[room][1], room === 'ponte' ? 'acompanha o céu da Ponte' : 'no céu');
    else check(i.live === null, `${room}: sem eclipse no céu, sem eclipse vivo`);
    if (SKY[room]) await shot(page, `${room}-eclipse`);
    // os enfeites antigos: a Ponte (portão, estátuas, balaustrada, lampiões) e o vale da memória (as árvores)
    if (room === 'ponte' || room === 'memoria') {
      const ps = await props(page);
      propsBig(ps, room, room === 'ponte' ? 200 : 80);
      if (room === 'ponte') {
        ponteProps = ps;
        const gate = ps.find((q) => q.base === 'deco-gate');
        check(!!gate && third(gate.k) && near(gate.dw, 120) && near(gate.dh, 136), `ponte: o portão é a pintura em 3x mostrada a um terço, do tamanho de sempre (${gate ? `${gate.dw} x ${gate.dh}, escala ${gate.k.toFixed(3)}` : 'não achei'})`);
      } else check(ps.some((q) => q.base === 'deco-tree-big') && ps.some((q) => /^deco-tree-(pink|green)$/.test(q.base)), 'memoria: as árvores do vale entram na conta');
    }
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
    paused.props = await props(page);
    await shot(page, `troca-${preset}-pausa`);
    await page.click('#screen-settings [data-cmd="back"]');
    await page.click('#screen-pause [data-cmd="resume"]');
    // espera a cena voltar a andar (não um tempo fixo: com a máquina de teste devagar, 0,7 s não bastava)
    await page.waitForFunction(() => window.__scene && window.__scene.scene.isActive(), null, { timeout: 15000 }).catch(() => null);
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
  check(back && i.eclipse === false && i.occ === 0 && i.live === null, 'as camadas voltam para a medida de antes, as sombras vivas desligam e o eclipse vivo sai do céu');
  i = await info(page);
  check(i.active && i.hdScale === 2, 'saindo da pausa o jogo continua no EXTREME');
  await shot(page, 'praca-extreme');
  i = await pauseTo('eclipse', 3);
  terrain(i, 3, 'logo que o ECLIPSE é escolhido, ainda na pausa');
  layer3(i, 'city-sky', 'f-city/city-sky');
  layer3(i, 'city-far', 'f-city/city-far');
  layer3(i, 'city-mid', 'f-city/city-mid');
  liveOn({ ...i, skyAt: i.so }, [464.75, 74.75], 19.9, 'volta ainda na pausa');
  i = await info(page);
  check(i.active && i.hdScale === 3 && i.eclipse === true && i.live !== null, 'saindo da pausa o jogo continua no ECLIPSE');

  // ---------- 4a. os enfeites antigos na troca com a sala aberta ----------
  // nas Catacumbas tem de todo tipo: imagens (santuário, pedestal), folhas (musgo, capim), velas animadas e
  // correntes que repetem
  await start(page, 'catacumbas', 3);
  const cat3 = await props(page);
  propsBig(cat3, 'catacumbas', 150, ', antes da troca');
  const candles = cat3.filter((q) => q.base === 'deco-candles');
  check(candles.length > 0 && candles.every((q) => q.type === 'Sprite' && q.anim === 'candles@3') && cat3.some((q) => q.type === 'TileSprite') && cat3.some((q) => q.cut),
    `catacumbas: as velas tremem com os quadros grandes (${candles.length} velas), e a sala tem correntes que repetem e musgo cortado`);
  i = await pauseTo('extreme', 2);
  propsOld(i.props, 'catacumbas', 150, ' logo que o EXTREME é escolhido, ainda na pausa');
  check(sameProps(cat3, i.props) && i.props.filter((q) => q.base === 'deco-candles').every((q) => q.anim === 'candles'), 'catacumbas: cada enfeite continua no mesmo lugar, com o mesmo tamanho, recorte e passo, e as velas voltam para a animação de sempre');
  i = await pauseTo('eclipse', 3);
  propsBig(i.props, 'catacumbas', 150, ' de novo, logo que o ECLIPSE é escolhido');
  check(sameProps(cat3, i.props), 'catacumbas: e continuam todos no lugar depois de ir e voltar');

  // ---------- 4b. o eclipse vivo depois dos finais ----------
  // final II: o novo Eclipse, maior e frio, cobre o pintado; a luz viva vai por cima dele (no pixel inteiro do
  // mundo, como a imagem dele) e fica lilás
  const end = async (kind, room) => {
    await page.evaluate((kind) => {
      const p = window.__progress;
      for (const k of [...p.seen]) if (k.startsWith('ending:')) p.seen.delete(k);
      if (kind) p.seen.add('ending:' + kind);
    }, kind);
    await start(page, room, 3);
    return info(page);
  };
  i = await end('absorb', 'praca');
  const lv = i.live;
  check(!!lv && near(lv.r, 19.9 * 1.7, 0.05) && lv.x === Math.floor(i.so[0] + 464.75) && lv.y === Math.floor(i.so[1] + 74.75) && (lv.tint & 0xff) > ((lv.tint >> 16) & 0xff) - 40 && (lv.tint & 0xff) > 0xf0,
    `depois do final II a luz viva cobre o novo Eclipse, maior e fria (raio ${lv ? lv.r.toFixed(1) : '-'}, cor ${lv ? lv.tint.toString(16) : '-'})`);
  await shot(page, 'praca-final2');
  // final I: amanheceu, não tem mais eclipse no céu
  i = await end('truth', 'praca');
  const dawnSky = i.parts.find((q) => q.key === 'city-sky-aurora');
  check(!!dawnSky && i.live === null, `depois do final I o céu é o da manhã e não tem eclipse vivo (${dawnSky ? dawnSky.key : 'céu da manhã não entrou'})`);
  await shot(page, 'praca-final1');
  i = await end(null, 'praca');
  check(i.live !== null && i.ending === '', 'sem final, o eclipse vivo volta');
  await page.context().close();

  // ---------- 5. um pacote que não chega: fica a pintura de antes (a de 2x, direto dela) ----------
  const packOf = (room) => man.terrain3[room].pack;
  // (o endereço fixando o nível, como nos testes e nas fotos)
  page = await open(`?res=${RES}&gfx=eclipse`, ['assets/hd3/f-city.json', 'assets/hd3/f-catacomb.json', `assets/hd3/${packOf('celas')}.json`, 'assets/hd3/p-enfeites.json']);
  await fresh(page);
  u = await page.evaluate(() => { window.__ui.openSettings(); return document.querySelector('#screen-settings .gfx-note').textContent; });
  check(/fixou ECLIPSE GRAPHICS/.test(u), `?gfx=eclipse no endereço fixa o nível ("${u.trim()}")`);
  await page.evaluate(() => window.__ui.closeAll());
  await start(page, 'praca', 3);
  i = await info(page);
  terrain(i, 3, 'mesmo sem o pacote dos fundos da cidade');
  layerOld(i, 'city-sky', 'city-sky', 'fica com o céu de antes');
  // (a pintura de antes da cidade já é em 2x: sai direto dela)
  layer2(i, 'city-far', 'city-far');
  layer2(i, 'city-mid', 'city-mid');
  await start(page, 'catacumbas', 3);
  i = await info(page);
  terrain(i, 3, 'mesmo sem o pacote dos fundos das Catacumbas');
  for (const key of ['cat-far', 'cat-mid']) layer2(i, key, 'hd:' + man.backdrop[key].file);
  propsOld(await props(page), 'catacumbas', 150, ' quando o pacote deles não chega (com o terreno em 3x)');
  await start(page, 'celas', 2);
  i = await info(page);
  terrain(i, 2, 'quando o pacote do terreno em 3x não chega');
  check(i.parts.every((q) => q.vis && !q.m), 'e os fundos ficam os de antes, inteiros');
  await page.context().close();

  // ---------- 6. o EXTREME continua o de antes: não baixa nada do ECLIPSE e os enfeites são os de sempre ----------
  page = await open(`?res=${RES}&gfx=extreme`);
  await fresh(page);
  await start(page, 'ponte', 2);
  i = await info(page);
  terrain(i, 2, 'na Ponte, no EXTREME');
  const ext = await props(page);
  propsOld(ext, 'ponte', 200, ' no EXTREME');
  check(sameProps(ponteProps, ext), 'ponte: no ECLIPSE cada enfeite fica no mesmo lugar e do mesmo tamanho que no EXTREME');
  await start(page, 'catacumbas', 2);
  const hd3 = await page.evaluate(() => window.__game.textures.getTextureKeys().filter((k) => k.startsWith('hd:3:')).length);
  check(page.hd3.length === 0 && hd3 === 0, `no EXTREME nenhum pacote do ECLIPSE é baixado (${page.hd3.length ? page.hd3.join(', ') : 'nenhum pedido'})`);
  await page.context().close();

  if (errs.length) console.log([...new Set(errs)].slice(0, 20).join('\n'));
  check(errs.length === 0, 'nenhum erro na página');
  console.log(fails ? `\n${fails} FALHA(S)` : '\ntudo certo');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
