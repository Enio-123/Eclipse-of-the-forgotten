// Visita cada sala em pontos-chave e tira capturas de tela
const { chromium } = require('playwright');
const OUT = process.argv[2];
const only = process.argv[3];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const start = async (room, entry) => {
    await page.evaluate(([room, entry]) => {
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.scene.start('game', { room, entry, from: 'continue' });
    }, [room, entry]);
    await page.waitForFunction((room) => window.__scene && window.__scene.room && window.__scene.room.id === room && window.__scene.player, room, { timeout: 15000 });
    await page.waitForTimeout(600);
  };
  const tp = async (tx, ty, face = 1) => {
    await page.evaluate(([x, y, f]) => { const s = window.__scene; s.player.teleport(x, y); s.player.invuln = 0; s.player.hurt = () => false; s.player.facing = f; }, [tx * 16 + 8, ty * 16, face]);
    await page.waitForTimeout(1300);
  };
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const rooms = {
    ponte: async () => {
      await start('ponte', 'P');
      for (const [x, y, n] of [[30, 22, 'a'], [62, 22, 'b'], [88, 19, 'c'], [112, 27, 'd'], [130, 22, 'e'], [165, 22, 'f']]) { await tp(x, y); await shot(`ponte-${n}`); }
    },
    catacumbas: async () => {
      await start('catacumbas', '1');
      await shot('cat-a');
      for (const [x, y, n] of [[30, 18, 'b'], [45, 30, 'c'], [42, 41, 'd'], [70, 40, 'e'], [97, 44, 'f']]) { await tp(x, y); await shot(`cat-${n}`); }
    },
    memoria: async () => {
      await start('memoria', '1');
      await shot('mem-a');
      for (const [x, y, n] of [[47, 21, 'b'], [47, 26, 'c'], [80, 18, 'd'], [118, 21, 'e']]) { await tp(x, y); await shot(`mem-${n}`); }
    },
  };
  for (const [k, f] of Object.entries(rooms)) if (!only || only === k) await f();
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
