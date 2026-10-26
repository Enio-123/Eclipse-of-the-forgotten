// Cidade-Catedral (capítulo 2): ligações entre as salas, portas e atalho, grade da cripta,
// paredes falsas, vitrais, cofres, páginas e sinos. Uso: node area1.cjs <pasta das fotos> [url]
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
    p.abilities = new Set(['dash', 'wall', 'double']);
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

  // 1. a grade atrás do Sineiro: fechada antes de vencer, aberta depois
  await setProgress();
  await page.evaluate(() => window.__progress.seen.delete('boss:sineiro'));
  await start('cripta', '1');
  check(await solidAt(46, 18), 'grade da escadaria fechada com o Sineiro vivo');
  await setProgress();
  await start('cripta', '2');
  check(!(await solidAt(46, 18)), 'grade da escadaria aberta depois de vencer o Sineiro');
  await safe();
  await hold('KeyD', 900);
  await waitRoom('escadaria');
  let st = await state();
  check(st.room === 'escadaria' && st.tx <= 4, `cripta leva à Escadaria dos Penitentes (${st.tx},${st.ty})`);
  await page.waitForTimeout(800);
  await shot('a1-escadaria');

  // 2. escadaria: sai lá em cima, à direita, na praça
  await safe();
  await calm();
  await tp(32, 10);
  await hold('KeyD', 1000);
  await waitRoom('praca');
  st = await state();
  check(st.room === 'praca' && st.tx <= 4, `escadaria leva à Praça do Cadafalso (${st.tx},${st.ty})`);
  await page.waitForTimeout(800);
  await shot('a2-praca');

  // 3. a porta da catedral está trancada por dentro
  await safe();
  await tp(101, 25);
  await page.waitForTimeout(300);
  const h3 = await hint();
  check(/entrar/.test(h3), `porta da catedral mostra a dica ("${h3}")`);
  await tap('KeyW');
  await page.waitForTimeout(500);
  st = await state();
  check(st.room === 'praca' && /Trancada/.test(await thought()), 'porta trancada não abre e avisa');

  // 4. praça -> Mercado do Dízimo (v18) -> rua; parede falsa do porão, cofre e página
  await tp(116, 28);
  await hold('KeyD', 900);
  await waitRoom('mercado');
  st = await state();
  check(st.room === 'mercado' && st.tx <= 4, `praça leva ao Mercado do Dízimo (${st.tx},${st.ty})`);
  await safe();
  await calm();
  await tp(107, 28);
  await hold('KeyD', 900);
  await waitRoom('rua');
  st = await state();
  check(st.room === 'rua' && st.tx <= 4, `praça leva à Rua dos Penitentes (${st.tx},${st.ty})`);
  await safe();
  await calm();
  await tp(119, 34);
  check(await solidAt(121, 33), 'parede falsa do porão é sólida');
  await attack(3, 1);
  await page.waitForTimeout(700);
  check(await seen('wall:rua:121:30'), 'três golpes derrubam a parede falsa');
  check(!(await solidAt(121, 33)), 'a parede caída vira passagem');
  await shot('a4-porao');
  const coins0 = await page.evaluate(() => window.__progress.coins);
  await tp(126, 34);
  await attack(3, 1);
  await page.waitForTimeout(1200);
  // anda pelo porão juntando as moedas
  await hold('KeyA', 350);
  await hold('KeyD', 700);
  await hold('KeyA', 350);
  await page.waitForTimeout(1500);
  check(await seen('cache:rua:0'), 'o cofre do dízimo abre com três golpes');
  const coins1 = await page.evaluate(() => window.__progress.coins);
  check(coins1 - coins0 >= 15, `as moedas do cofre são pegas (${coins1 - coins0})`);
  await tp(125, 34);
  await page.waitForTimeout(400);
  check(await seen('page:rua:0'), 'a página do porão é pega ao encostar');

  // 5. rua -> telhados pulando do alto do entulho
  await tp(135, 6);
  // pulo e pulo duplo no alto do entulho
  await hold('Space', 300);
  await page.waitForTimeout(30);
  await hold('Space', 350);
  await waitRoom('telhados');
  st = await state();
  check(st.room === 'telhados', `do alto do entulho se sobe para os Telhados (${st.tx},${st.ty})`);
  await page.waitForTimeout(800);
  await shot('a5-telhados');

  // 6. telhados -> rua pelo buraco (chega caindo no entulho)
  await safe();
  await tp(135, 30);
  await page.waitForTimeout(200);
  await waitRoom('rua');
  st = await state();
  check(st.room === 'rua' && st.tx >= 125, `o buraco dos telhados leva de volta à rua (${st.tx},${st.ty})`);

  // 7. o vitral rachado da catedral e a entrada da nave
  await start('telhados', '1');
  await safe();
  await calm();
  await tp(7, 24);
  check(await solidAt(5, 22), 'vitral rachado fecha a passagem');
  await attack(2, -1);
  await page.waitForTimeout(600);
  check(await seen('wall:telhados:5:20'), 'dois golpes quebram o vitral');
  await shot('a7-vitral');
  await hold('KeyA', 1200);
  await waitRoom('nave');
  st = await state();
  check(st.room === 'nave' && st.tx >= 110, `pelo vitral se entra na Nave (${st.tx},${st.ty})`);
  await page.waitForTimeout(800);
  await shot('a7-nave');

  // 8. a porta principal: tira a tranca por dentro e vira atalho para a praça
  await safe();
  await calm();
  await tp(101, 35);
  const h8 = await hint();
  check(/tranca/.test(h8), `por dentro, a porta mostra "tirar a tranca" ("${h8}")`);
  await tap('KeyW');
  await page.waitForTimeout(500);
  check(await seen('short:catedral'), 'a tranca sai e o atalho fica gravado');
  await tap('KeyW');
  await waitRoom('praca');
  st = await state();
  check(st.room === 'praca' && Math.abs(st.tx - 101) <= 1, `a porta leva à praça, na frente da catedral (${st.tx},${st.ty})`);
  await page.waitForTimeout(600);
  await tap('KeyW');
  await waitRoom('nave');
  st = await state();
  check(st.room === 'nave', 'e da praça agora se entra na catedral');

  // 9. escada em caracol -> galeria; buraco da galeria -> nave
  await safe();
  await calm();
  await tp(14, 35);
  await tap('KeyW');
  await waitRoom('galeria');
  st = await state();
  check(st.room === 'galeria' && st.tx <= 6, `a escada em caracol leva à Galeria dos Vitrais (${st.tx},${st.ty})`);
  await page.waitForTimeout(600);
  await shot('a9-galeria');
  await tap('KeyW');
  await waitRoom('nave');
  check((await state()).room === 'nave', 'e a porta da galeria volta para a nave');
  await start('galeria', 'O0');
  await safe();
  await tp(43, 24);
  await waitRoom('nave');
  st = await state();
  await page.waitForTimeout(1500);
  st = await state();
  check(st.room === 'nave' && st.tx >= 38 && st.tx <= 48 && st.ty === 16, `quem cai do buraco da galeria pousa no lustre da nave (${st.tx},${st.ty})`);

  // 10. vitrais dos nichos da galeria e o caminho até o altar
  await start('galeria', 'O0');
  await safe();
  await calm();
  await tp(16, 14);
  await attack(2, -1);
  await page.waitForTimeout(500);
  check(await seen('wall:galeria:14:11'), 'vitral do nicho da esquerda quebra');
  await tp(10, 14);
  await page.waitForTimeout(400);
  check(await seen('page:galeria:0'), 'a página do nicho é pega');
  await tp(98, 12);
  await attack(2, 1);
  await page.waitForTimeout(500);
  check(await seen('wall:galeria:101:9'), 'vitral do nicho da direita quebra');
  await tp(115, 26);
  await hold('KeyD', 900);
  await waitRoom('altar');
  check((await state()).room === 'altar', 'a galeria leva ao Altar do Dízimo');
  await hold('KeyA', 900);
  await waitRoom('galeria');
  check((await state()).room === 'galeria', 'e o altar volta para a galeria');

  // 11. claustro e o sino dele
  await start('nave', '2');
  await safe();
  await hold('KeyA', 900);
  await waitRoom('claustro');
  check((await state()).room === 'claustro', 'a nave leva ao Claustro');
  await calm();
  await tp(79, 24);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(60);
  await tap('KeyJ');
  await page.keyboard.up('KeyW');
  await waitGame(0.7);
  check(await seen('bell:claustro:0'), 'o sino do claustro toca com um golpe para cima');
  await shot('a11-claustro');
  await tp(10, 35);
  await attack(3, -1);
  await page.waitForTimeout(600);
  check(await seen('wall:claustro:8:31'), 'parede falsa do depósito do claustro cai');
  await tp(86, 35);
  await hold('KeyD', 900);
  await waitRoom('nave');
  check((await state()).room === 'nave', 'o claustro volta para a nave');

  // 12. sino da torre: entra pelo arco e toca
  await start('telhados', '1');
  await safe();
  await calm();
  await tp(56, 12);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(60);
  await tap('KeyJ');
  await page.keyboard.up('KeyW');
  await waitGame(0.7);
  check(await seen('bell:telhados:0'), 'o sino da torre dos telhados toca');
  await shot('a12-torre');

  await page.waitForTimeout(300);
  for (const e of errs) console.log(e);
  console.log(fails || errs.length ? `FALHAS: ${fails}, erros: ${errs.length}` : 'TUDO OK');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
