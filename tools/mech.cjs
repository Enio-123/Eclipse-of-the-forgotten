const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__scene && window.__scene.player, null, { timeout: 15000 });
  await page.evaluate(() => { window.__game.registry.set('started', true); document.getElementById('start').classList.add('gone'); });
  await page.waitForTimeout(800);
  const T = 16;
  const tp = (tx, ty) => page.evaluate(([x, y]) => { const s = window.__scene; s.player.teleport(x, y); s.player.invuln = 0; }, [tx * T + 8, ty * T]);
  const st = () => page.evaluate(() => { const p = window.__scene.player; return { x: p.x, bottom: p.body.bottom, g: p.body.blocked.down, hp: p.hp }; });
  // amostra a altura mínima durante um intervalo
  const sampleMinY = (ms) => page.evaluate((ms) => new Promise((res) => { const p = window.__scene.player; let m = 1e9; const t0 = performance.now(); const f = () => { m = Math.min(m, p.body.bottom); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(m); }; f(); }), ms);
  const results = {};

  // A: pulo completo
  await tp(8, 28); await page.waitForTimeout(400);
  let s0 = await st();
  await page.keyboard.down('z'); const minFull = await sampleMinY(700); await page.keyboard.up('z');
  results.jumpFull = Math.round(s0.bottom - minFull);
  await page.waitForTimeout(500);
  // B: pulo curto
  s0 = await st();
  await page.keyboard.down('z'); await page.waitForTimeout(40); await page.keyboard.up('z');
  const minShort = await sampleMinY(600);
  results.jumpShort = Math.round(s0.bottom - minShort);
  await page.waitForTimeout(400);
  // C: dash no chão
  await tp(5, 28); await page.waitForTimeout(400);
  s0 = await st();
  await page.keyboard.press('c'); await page.waitForTimeout(260);
  let s1 = await st();
  results.dashDist = Math.round(s1.x - s0.x);
  // D: matar o rastejante com ataques
  const crawlerX = await page.evaluate(() => window.__scene.enemies.find((e) => e.zone.y > 400 && e.zone.x < 900).zone.x);
  await tp(Math.floor(crawlerX / T) - 3, 28);
  await page.evaluate(() => { window.__scene.player.facing = 1; });
  for (let i = 0; i < 6; i++) {
    const ex = await page.evaluate(() => { const e = window.__scene.enemies.find((e) => e.zone.y > 400 && e.zone.x < 900); return e.alive ? e.zone.x : null; });
    if (ex === null) break;
    await page.evaluate((ex) => { const s = window.__scene; s.player.teleport(ex - 34, s.player.body.bottom); s.player.invuln = 2; s.player.facing = 1; }, ex);
    await page.keyboard.press('x'); await page.waitForTimeout(380);
  }
  results.crawlerDead = await page.evaluate(() => !window.__scene.enemies.find((e) => e.zone.y > 400 && e.zone.x < 900).alive);
  // E: subir atravessando plataforma (48..52, linha 23) a partir do chão do degrau
  await tp(67, 28); await page.evaluate(() => { window.__scene.player.invuln = 9; }); await page.waitForTimeout(400);
  await page.keyboard.down('z'); await page.waitForTimeout(700); await page.keyboard.up('z'); await page.waitForTimeout(500);
  s1 = await st();
  results.oneWayLand = { bottom: s1.bottom, expected: 24 * T, ground: s1.g };
  // F: descer da plataforma (baixo + pulo)
  await page.keyboard.down('ArrowDown'); await page.keyboard.press('z'); await page.waitForTimeout(500); await page.keyboard.up('ArrowDown');
  s1 = await st();
  results.dropThrough = { bottom: s1.bottom, expected: 28 * T };
  // G: pogo nos espinhos (88..93, linha 27)
  await tp(90, 22); await page.evaluate(() => { const p = window.__scene.player; p.invuln = 0; });
  const hp0 = (await st()).hp;
  await page.waitForTimeout(120);
  // espera chegar perto dos espinhos e ataca para baixo
  await page.waitForFunction(() => window.__scene.player.body.bottom > 27 * 16 - 30, null, { timeout: 3000 });
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(20); await page.keyboard.press('x');
  const minPogo = await sampleMinY(500);
  const sp = await st();
  await page.keyboard.up('ArrowDown');
  results.pogo = { rise: Math.round(27 * 16 - 30 - minPogo), hpLost: hp0 - sp.hp };
  console.log(JSON.stringify(results, null, 1));
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
