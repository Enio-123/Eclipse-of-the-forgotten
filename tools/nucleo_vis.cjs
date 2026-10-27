// Fotos da luta do núcleo (T6): o terraço antes, a subida, cada golpe do colosso, o pó, o espelho e a coroa.
// uso: node nucleo_vis.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8790/index.html';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const part = (k) => !ONLY.length || ONLY.includes(k);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const shot = async (name) => {
    const paused = await page.evaluate(() => { const s = window.__scene; if (!s || !s.scene.isActive()) return false; s.sys.pause(); return true; });
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('foto ' + name);
    if (paused) await page.evaluate(() => window.__scene.sys.resume());
  };
  const until = async (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 16 });
  const waitGame = async (sec, timeout = 90000) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout, polling: 16 });
  };
  const freeze = async (src, timeout = 20000) => {
    await page.evaluate((src) => {
      const s = window.__scene;
      const f = new Function('s', 'e', `return (${src});`);
      window.__frozen = false;
      const h = () => { if (!f(s, s.boss)) return; s.events.off('postupdate', h); window.__frozen = true; s.sys.pause(); };
      s.events.on('postupdate', h);
      s.sys.resume();
    }, src);
    return until(() => window.__frozen, null, timeout).then(() => true).catch(() => { console.log('  freeze falhou: ' + src); return false; });
  };
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil', 'cape', 'swim']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', 'boss:reflexo', 'boss:capataz',
      'weapon:picareta', 'journal', 'boss:cacador', 'boss:barqueiro', 'relic:swim', 'boss:vhalor', 'weapon:cetro']) p.seen.add(k);
    p.save();
  });
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'nucleo', entry: '1', from: 'door' });
  });
  await until(() => window.__scene && window.__scene.player && !window.__scene.transitioning && window.__scene.boss);
  await waitGame(1.0);
  const info = await page.evaluate(() => { const s = window.__scene; const k = s.torres.core; return { c: k.c, floorY: k.floorY, spires: k.spires, x0: k.x0, x1: k.x1, p: [s.player.x, s.player.body.bottom] }; });
  console.log(JSON.stringify(info));
  await page.evaluate(() => { const s = window.__scene; s.player.invuln = 9999; });
  await shot('n0-chegada');
  // anda até a beira do terraço: ele acorda
  await page.evaluate((info) => { const s = window.__scene; s.player.teleport(info.c - 20, info.floorY - 2); s.player.body.setVelocity(0, 0); }, info);
  await freeze("e.state === 'rise' && e.t > 1.6");
  await shot('n1-subida');
  await freeze("e.state === 'rise' && e.t > 3.3");
  await shot('n2-agarra');
  await freeze("e.state === 'idle'");
  await page.evaluate(() => { const s = window.__scene; s.player.invuln = 9999; s.player.hp = s.player.maxHp; });
  await shot('n3-parado');
  const force = async (a, px) => {
    await page.evaluate(([a, px]) => {
      const s = window.__scene; const b = s.boss; const p = s.player;
      p.teleport(px, b.floorY - 2); p.body.setVelocity(0, 0); p.invuln = 9999; p.hp = p.maxHp;
      b.queue.length = 0; b.start(a);
    }, [a, px]);
  };
  if (part('slam')) {
    await force('slam', info.c - 150);
    await freeze("e.arms.some((a) => a.st === 'up' && a.t > 0.7)");
    await shot('n4-punho-sobe');
    await freeze("e.arms.some((a) => a.st === 'rest' && a.t > 0.1)");
    await shot('n5-punho-chao');
    await freeze("e.state === 'idle'");
  }
  if (part('sweep')) {
    await force('sweepU', info.c);
    await freeze("e.state === 'sweepwarn' && e.t > 0.4");
    await shot('n6-foice-aviso-u');
    await freeze("e.state === 'sweep' && e.t > 0.45");
    await shot('n7-foice-u');
    await freeze("e.state === 'idle'");
    await force('sweepN', info.c + 230);
    await freeze("e.state === 'sweep' && e.t > 0.45");
    await shot('n8-foice-n');
    await freeze("e.state === 'idle'");
  }
  if (part('beads')) {
    await force('beads', info.c - 60);
    await freeze("e.state === 'beads' && e.beads.some((b) => b.falling && b.y > s.cameras.main.worldView.y + 150)");
    await shot('n9-contas');
    await freeze("e.state === 'idle'");
  }
  if (part('lean')) {
    await force('lean', info.c + 120);
    await freeze("e.state === 'leanrest' && e.t > 0.3");
    await shot('n10-cabeca-chao');
    await freeze("e.state === 'idle'", 30000);
  }
  if (part('fim')) {
    // o colosso cai: tira a vida até o fim dele
    await page.evaluate(() => { const b = window.__scene.boss; b.damage(b.hp - 48); });
    await freeze("e.state === 'crumble' && e.t > 0.5");
    await shot('n11a-po');
    await freeze("e.state === 'crumble' && e.t > 1.4");
    await shot('n11-po');
    await freeze("e.state === 'form' && e.t > 1.0");
    await shot('n12-forma');
    await freeze("e.state === 'mirror' && e.t > 2.0");
    await shot('n13-espelho');
    await page.evaluate(() => { const b = window.__scene.boss; b.damage(b.hp); });
    await freeze("e.state === 'offer' && e.t > 1.2", 30000);
    await shot('n14-joelhos');
    await page.evaluate(() => window.__scene.sys.resume());
    await until(() => document.querySelector('#screen-crown.show'), null, 30000).catch(() => console.log('  a tela da coroa não abriu'));
    await page.screenshot({ path: `${OUT}/n15-coroa.png` });
  }
  console.log(errs.length ? errs.join('\n') : 'sem erros');
  await browser.close();
})();
