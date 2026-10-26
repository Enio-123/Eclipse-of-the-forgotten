// Sai do Fosso por cima só com o gancho: do bloco da câmara, argola por argola até a Sala da Máscara.
// uso: node tools/fossoexit.cjs [pasta]
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/x';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto(`${process.env.GAME || 'http://localhost:8765'}/index.html?res=1&gfx=performance`);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.abilities = new Set(['wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'boss:arcebispo', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'banner:fosso', 'banner:mascara']) p.seen.add(k);
    p.save();
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'fosso', entry: '2', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'fosso' && window.__scene.clock > 0.5, null, { timeout: 60000 });
  await page.evaluate(() => {
    const s = window.__scene;
    for (const e of s.enemies) if (e.vanish) e.vanish();
    s.player.invuln = 999;
    s.player.teleport(33 * 16 + 8, 28 * 16);
  });
  await page.waitForFunction(() => window.__scene.player.body.blocked.down, null, { timeout: 20000 });
  const state = () => page.evaluate(() => {
    const s = window.__scene;
    const p = s && s.player;
    if (!p) return { room: s && s.room && s.room.id };
    return { room: s.room.id, x: Math.round(p.body.center.x), y: Math.round(p.body.center.y), hook: p.hook ? p.hook.phase : null, ground: p.body.blocked.down, target: (() => { const r = s.hookTarget(p); return r ? `${Math.round(r.x)},${Math.round(r.y)}` : null; })() };
  });
  console.log('no bloco', JSON.stringify(await state()));
  for (let k = 0; k < 3; k++) {
    const before = await state();
    console.log('alvo', k + 1, before.target);
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyE');
    // espera chegar na argola (a corrente puxa e solta)
    await page.waitForFunction(() => {
      const p = window.__scene.player;
      return p.hook && p.hook.phase === 'pull';
    }, null, { timeout: 8000 }).catch(() => console.log('  não mordeu'));
    await page.waitForFunction(() => {
      const p = window.__scene.player;
      return !p.hook || p.hook.phase !== 'pull';
    }, null, { timeout: 8000 }).catch(() => console.log('  não soltou'));
    console.log('  depois', JSON.stringify(await state()));
    if (k < 2) {
      // no ar, já mira a próxima
      await page.waitForTimeout(60);
    }
  }
  // no fim, pula para sair por cima (registra a subida para ver o que acontece)
  const trace = page.evaluate(() => new Promise((res) => {
    const out = [];
    const t0 = performance.now();
    const iv = setInterval(() => {
      const s = window.__scene;
      const p = s && s.player;
      if (p && s.room.id === 'fosso') out.push(`${Math.round(performance.now() - t0)}ms y=${Math.round(p.body.center.y)} vy=${Math.round(p.body.velocity.y)} aj=${p.airJumps}`);
      if (performance.now() - t0 > 1600) { clearInterval(iv); res(out); }
    }, 40);
  }));
  await page.keyboard.down('Space');
  await page.waitForTimeout(150);
  await page.keyboard.up('Space');
  await page.waitForTimeout(250);
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.up('Space');
  console.log((await trace).join('\n'));
  const ok = await page.waitForFunction(() => window.__scene && window.__scene.room && window.__scene.room.id === 'mascara', null, { timeout: 15000 }).then(() => true).catch(() => false);
  console.log(ok ? 'SAIU para a Sala da Máscara' : 'NÃO SAIU', JSON.stringify(await state()));
  await page.screenshot({ path: `${OUT}/fosso-saida.png` });
  console.log(errs.slice(0, 5).join('\n') || 'sem erros');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
