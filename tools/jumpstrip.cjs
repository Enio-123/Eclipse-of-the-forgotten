// Tira de fotos de um pulo (e da queda e da aterrissagem), recortada em volta do cavaleiro, para ver o
// pulo novo quadro a quadro: o quadro do ar escolhido pela velocidade, o corpo esticando e amassando.
// O jogo anda quadro a quadro (o laço do navegador dorme e cada passo é 1/60 s), então as fotos não
// atrasam o pulo. Confere também que o quadro do ar acompanha a velocidade, que a queda de uma
// beirada usa só os quadros de descida e que o corpo volta ao normal parado.
// uso: node tools/jumpstrip.cjs <pasta> [url] [arma]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8767/index.html';
const WEAPON = process.argv[4] || 'scythe';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  let fails = 0;
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'gfx=performance&res=2');
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  await page.evaluate((w) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.weapon = w;
    p.abilities = new Set(['dash', 'wall', 'double']);
    p.save();
  }, WEAPON);
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'ponte', entry: 'P', from: 'continue' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'ponte' && !window.__scene.transitioning, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  // no meio da ponte, com o céu aberto em cima (nada de teto para o pulo bater)
  await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e.vanish) e.vanish();
    s.player.hurt = () => false;
    s.player.teleport(30 * 16 + 8, 22 * 16);
    s.player.body.setVelocity(0, 0);
  });
  // daqui em diante o jogo só anda quando o teste manda
  await page.evaluate(() => {
    const g = window.__game;
    g.loop.sleep();
    window.__t = performance.now();
    window.__log = [];
    const s = window.__scene;
    s.events.on('postupdate', () => {
      const p = s.player;
      const sp = p.sprite;
      window.__log.push({ vy: Math.round(p.body.velocity.y), anim: sp.anims.currentAnim ? sp.anims.currentAnim.key.split('-').pop() : '', f: sp.frame.name, sx: +(sp.scaleX / p.baseScale).toFixed(3), sy: +(sp.scaleY / p.baseScale).toFixed(3), g: p.body.blocked.down });
    });
  });
  const step = (n = 1) => page.evaluate((n) => {
    const g = window.__game;
    for (let i = 0; i < n; i++) {
      window.__t += 1000 / 60;
      g.step(window.__t, 1000 / 60);
    }
  }, n);
  const clipNow = async () => {
    const box = await page.evaluate(() => {
      const s = window.__scene;
      const c = s.cameras.main;
      const p = s.player;
      const k = 1280 / c.worldView.width;
      return { x: (p.x - c.worldView.x) * k, y: (p.body.bottom - c.worldView.y) * k };
    });
    return page.screenshot({ clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 120), width: 120, height: 136 } });
  };
  await step(30);
  // 1. um pulo inteiro, segurando o pulo, com uma foto a cada três quadros
  await page.evaluate(() => { window.__log = []; });
  const shots = [];
  await page.keyboard.down('Space');
  for (let i = 0; i < 26; i++) {
    shots.push(await clipNow());
    await step(3);
    if (i === 14) await page.keyboard.up('Space');
  }
  await page.keyboard.up('Space');
  await step(40);
  const jump = await page.evaluate(() => window.__log);
  // 2. a queda de uma beirada (sem pulo): sobe o cavaleiro oito tiles e solta
  await page.evaluate(() => {
    const p = window.__scene.player;
    p.teleport(p.x, p.body.bottom - 8 * 16);
    p.body.setVelocity(0, 0);
    window.__log = [];
  });
  const drop = [];
  for (let i = 0; i < 16; i++) {
    drop.push(await clipNow());
    await step(3);
  }
  await step(40);
  const fall = await page.evaluate(() => window.__log);
  await page.evaluate(() => window.__game.loop.wake());
  // monta a tira: o pulo em cima, a queda embaixo
  const strip = await browser.newPage({ viewport: { width: 120 * 13, height: 136 * 3 } });
  const img = (b) => `<img src="data:image/png;base64,${b.toString('base64')}" style="width:120px;height:136px;float:left">`;
  await strip.setContent('<body style="margin:0;background:#111">' + shots.map(img).join('') + drop.slice(0, 13).map(img).join('') + '</body>');
  await strip.screenshot({ path: `${OUT}/pulo-${WEAPON}.png` });

  const air = jump.filter((l) => l.anim === 'air');
  check(air.length > 20, `o ar usa a tira escolhida pela velocidade (${air.length} quadros no ar)`);
  const up = air.filter((l) => l.vy < -250).map((l) => +l.f);
  const down = air.filter((l) => l.vy > 250).map((l) => +l.f);
  check(up.length && down.length && Math.max(...up) < Math.min(...down), `subindo os quadros vêm antes dos da queda (${[...new Set(up)].join(',')} | ${[...new Set(down)].join(',')})`);
  const seq = air.map((l) => +l.f);
  check(seq.every((f, i) => i === 0 || f >= seq[i - 1]), `o quadro do ar só anda para a frente durante o pulo (${[...new Set(seq)].join(',')})`);
  check(jump.some((l) => l.sy > 1.06), `o corpo estica no impulso (máx ${Math.max(...jump.map((l) => l.sy))})`);
  check(jump.some((l) => l.g && l.sy < 0.96), `o corpo amassa na aterrissagem (mín ${Math.min(...jump.filter((l) => l.g).map((l) => l.sy))})`);
  const fallAir = fall.filter((l) => l.anim === 'air').map((l) => +l.f);
  const top = air.length ? Math.min(...air.map((l) => +l.f)) : 0;
  check(fallAir.length > 0 && Math.min(...fallAir) >= top + 7, `caindo da beirada, só os quadros da descida (${[...new Set(fallAir)].join(',')}; a tira começa em ${top})`);
  check(fall.some((l) => l.anim === 'land'), `a queda alta dobra os joelhos (${fall.filter((l) => l.anim === 'land').length} quadros)`);
  const last = fall[fall.length - 1];
  check(Math.abs(last.sy - 1) < 0.01 && Math.abs(last.sx - 1) < 0.01, `parado, o corpo volta ao normal (${last.sx}, ${last.sy})`);
  console.log('pulo: ' + JSON.stringify(jump.filter((_, i) => i % 4 === 0).map((l) => `${l.vy}/${l.anim}${l.f}/${l.sy}`)));
  console.log('queda: ' + JSON.stringify(fall.filter((_, i) => i % 4 === 0).map((l) => `${l.vy}/${l.anim}${l.f}/${l.sy}`)));
  console.log(errs.length ? errs.join('\n') : 'sem erros');
  console.log(fails ? `${fails} falha(s)` : 'tudo certo');
  await browser.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
