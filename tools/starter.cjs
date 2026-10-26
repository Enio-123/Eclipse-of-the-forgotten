// A arma do começo vale para o jogo todo: escolhe o arco no jogo novo e confere a pausa (Trocar arma),
// o inventário e um save antigo (sem a escolha gravada).
// uso: node tools/starter.cjs [pasta]
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/x';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  const base = `${process.env.GAME || 'http://localhost:8765'}/index.html?res=1&gfx=performance`;
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.goto(base);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  let fail = 0;
  const check = (ok, what) => {
    console.log(ok ? 'ok  ' : 'FALHA', what);
    if (!ok) fail++;
  };
  // jogo novo: a tela de armas mostra as quatro de começo
  await page.click('#screen-menu [data-cmd="new"]');
  await page.waitForSelector('#screen-weapons.show', { timeout: 10000 });
  const first = await page.$$eval('#screen-weapons .card', (cs) => cs.map((c) => c.dataset.w + (c.disabled ? '-' : '')));
  console.log('jogo novo:', first.join(' '));
  check(['scythe', 'sword', 'daggers', 'bow'].every((w) => first.includes(w)), 'as quatro de começo aparecem no jogo novo');
  check((await page.textContent('#screen-weapons .sub')).includes('não voltam'), 'o aviso de que a escolha vale até o fim');
  await page.click('#screen-weapons .card[data-w="bow"]');
  await page.click('#screen-weapons [data-cmd="confirm"]');
  await page.waitForFunction(() => window.__progress.starter === 'bow', null, { timeout: 10000 }).catch(() => {});
  check(await page.evaluate(() => window.__progress.starter === 'bow'), 'a escolha ficou gravada (arco)');
  // pula a abertura: entra direto numa sala com a escolha feita
  await page.evaluate(() => {
    const p = window.__progress;
    p.prologueDone = true;
    p.seen.add('boss:sineiro');
    p.seen.add('weapon:badalo');
    p.save();
    const g = window.__game;
    for (const k of ['intro', 'title']) {
      const sc = g.scene.getScene(k);
      if (sc && sc.scene.isActive()) sc.scene.stop();
    }
    window.__ui.closeAll();
    g.scene.start('game', { room: 'catacumbas', entry: '1', from: 'continue' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.clock > 0.5, null, { timeout: 60000 });
  check(await page.evaluate(() => window.__scene.player.weapon === 'bow' || window.__settings.data.weapon === 'bow'), 'entrou com o arco');
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForSelector('#screen-pause.show', { timeout: 10000 });
  await page.click('#screen-pause [data-cmd="weapon"]');
  await page.waitForSelector('#screen-weapons.show', { timeout: 10000 });
  const pause = await page.$$eval('#screen-weapons .card', (cs) => cs.map((c) => c.dataset.w + (c.disabled ? '-' : '')));
  console.log('pausa:', pause.join(' '));
  check(!pause.some((w) => /^(scythe|sword|daggers)/.test(w)), 'as outras três de começo não aparecem na pausa');
  check(pause.includes('bow') && pause.includes('badalo'), 'o arco e o Badalo (já ganho) aparecem');
  check(pause.includes('incensario-') && pause.includes('corrente-'), 'as de chefe que faltam aparecem trancadas');
  await page.screenshot({ path: `${OUT}/starter-pausa.png` });
  // inventário: só a escolhida e as de chefe
  await page.evaluate(() => window.__ui.pop());
  await page.click('#screen-pause [data-cmd="inventory"]').catch(() => {});
  await page.waitForTimeout(500);
  const inv = await page.$$eval('.inv-weapons li', (ls) => ls.map((l) => l.textContent.trim()));
  console.log('inventário:', inv.join(' | '));
  check(!inv.some((t) => /Foice|Espada|Adagas/.test(t)), 'o inventário não lista as outras três');
  // save antigo: com uma arma de começo na mão, ela vira a escolha
  const migrated = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('eclipse-progresso-v1'));
    delete raw.starter;
    raw.weapon = 'daggers';
    localStorage.setItem('eclipse-progresso-v1', JSON.stringify(raw));
    return true;
  });
  await page.goto(base);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.click('#screen-menu [data-cmd="continue"]');
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.clock > 0.5, null, { timeout: 60000 });
  check(migrated && (await page.evaluate(() => window.__progress.starter === 'daggers' && !window.__progress.hasWeapon('bow'))), 'save antigo: a arma que ele usava (adagas) vira a escolha');
  console.log(errs.slice(0, 5).join('\n') || 'sem erros');
  console.log(fail ? `${fail} FALHA(S)` : 'TUDO CERTO');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
