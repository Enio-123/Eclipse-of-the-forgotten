// Testa a luta do Sineiro: acorda quando o cavaleiro entra, grade fecha, martelada com onda
// (pular escapa), varredura (agachar escapa), investida até a parede (fica tonto), segunda fase
// com sinos caindo, derrota, memória e a tela de fim de capítulo.
// uso: node boss.cjs <pasta-saida>
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#screen-menu.show', { timeout: 20000 });
  const ok = (c, msg) => console.log((c ? 'ok   ' : 'FALHA ') + msg);
  const wait = async (ms) => {
    const t0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((t) => window.__scene && window.__scene.clock >= t, t0 + ms / 1000, { timeout: 90000, polling: 16 });
  };
  await page.evaluate(() => {
    window.__ui.closeAll();
    const P = window.__progress;
    P.reset();
    P.abilities = new Set(['dash', 'wall', 'double']);
    for (const k of ['memory:vale', 'gate:catacumbas']) P.seen.add(k);
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'cripta', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && window.__scene.room.id === 'cripta' && window.__scene.boss, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const B = () => page.evaluate(() => { const b = window.__scene.boss; return { state: b.state, hp: b.hp, x: b.zone.x / 16, facing: b.facing, waves: b.waves.length, bells: b.bells.length, alive: b.alive }; });
  const P = () => page.evaluate(() => { const p = window.__scene.player; return { x: p.x / 16, hp: p.hp }; });
  const setP = (x, inv = 0) => page.evaluate(([x, inv]) => { const s = window.__scene; const p = s.player; p.teleport(x * 16, 20 * 16); p.hp = 5; p.invuln = inv; s.registry.set('hp', 5); }, [x, inv]);
  const force = (a) => page.evaluate((a) => { const b = window.__scene.boss; b.thinkT = 99; b.startAttack(a); }, a);
  const hold = (st) => page.evaluate((st) => { const b = window.__scene.boss; b.go(st, st === 'idle' ? 'idle' : undefined); b.thinkT = 99; }, st);

  let b = await B();
  ok(b.state === 'sleep', `Sineiro dormindo na cripta (${b.state})`);
  await page.screenshot({ path: `${OUT}/boss-dormindo.png` });
  // entra na arena
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.__scene.player.x > 11 * 16, null, { timeout: 20000 });
  await page.keyboard.up('KeyD');
  await wait(400);
  const gate = await page.evaluate(() => window.__scene.level.tileAt(1 * 16 + 8, 17 * 16 + 8));
  b = await B();
  ok(b.state === 'rise' || b.state === 'roar', `acorda quando o cavaleiro entra (${b.state})`);
  ok(gate >= 0, `grade fecha atrás (tile ${gate})`);
  await wait(2600);
  await page.screenshot({ path: `${OUT}/boss-acordou.png` });
  const bar = await page.evaluate(() => document.querySelector('#bossbar').classList.contains('on') && document.querySelector('#bossbar p').textContent);
  ok(bar === 'O Sineiro', `barra de vida do chefe (${bar})`);

  // martelada: onda acerta quem fica parado
  await hold('idle');
  await page.evaluate(() => { const b = window.__scene.boss; b.zone.body.reset(30 * 16, 20 * 16 - 48); });
  await setP(18, 0);
  await wait(200);
  await force('slam');
  await wait(1000);
  b = await B();
  await page.screenshot({ path: `${OUT}/boss-martelada.png` });
  ok(b.waves === 2, `martelada solta duas ondas no chão (${b.waves})`);
  await wait(1200);
  let p = await P();
  ok(p.hp < 5, `onda acerta quem fica parado (vida ${p.hp})`);

  // martelada de novo, agora pulando a onda
  await hold('idle');
  await wait(900);
  await setP(16, 0);
  await page.evaluate(() => {
    const s = window.__scene; const c = s.controls;
    if (!c.__orig) c.__orig = c.update.bind(c);
    let jumped = false;
    c.update = (cam) => {
      c.__orig(cam);
      for (const a of Object.keys(c.held)) { c.held[a] = false; c.pressed[a] = false; }
      const w = s.boss.waves.find((w) => w.dir < 0);
      c.held.jump = true;
      if (w && !jumped && Math.abs(w.x - s.player.x) < 46) { c.pressed.jump = true; jumped = true; }
    };
  });
  await force('slam');
  await wait(2600);
  await page.evaluate(() => { const c = window.__scene.controls; c.update = c.__orig; });
  p = await P();
  ok(p.hp === 5, `pulando a onda não leva dano (vida ${p.hp})`);

  // varredura: em pé leva, agachado passa por baixo
  await hold('idle');
  await wait(600);
  await page.evaluate(() => { const b = window.__scene.boss; b.zone.body.reset(30 * 16, 20 * 16 - 48); b.facing = -1; });
  await setP(26, 0);
  await force('sweep');
  await wait(900);
  await page.screenshot({ path: `${OUT}/boss-varredura.png` });
  p = await P();
  ok(p.hp < 5, `varredura acerta em pé (vida ${p.hp})`);
  await hold('idle');
  await wait(1200);
  await page.evaluate(() => { const b = window.__scene.boss; b.zone.body.reset(30 * 16, 20 * 16 - 48); b.facing = -1; });
  await setP(26, 0);
  await page.keyboard.down('ControlLeft');
  await wait(200);
  await force('sweep');
  await wait(1100);
  p = await P();
  await page.keyboard.up('ControlLeft');
  ok(p.hp === 5, `agachado a varredura passa por cima (vida ${p.hp})`);

  // investida até a parede: fica tonto
  await hold('idle');
  await wait(600);
  await page.evaluate(() => { const b = window.__scene.boss; b.zone.body.reset(30 * 16, 20 * 16 - 48); });
  await setP(8, 9);
  await force('charge');
  let stunned = false;
  for (let i = 0; i < 20 && !stunned; i++) {
    await wait(150);
    b = await B();
    stunned = b.state === 'stun';
  }
  await page.screenshot({ path: `${OUT}/boss-tonto.png` });
  ok(stunned, `investida bate na parede e ele fica tonto (${b.state}, x ${b.x.toFixed(1)})`);

  // golpes de verdade enquanto está tonto
  const hp0 = (await B()).hp;
  await page.evaluate(() => { const s = window.__scene; const b = s.boss; const p = s.player; p.teleport(b.zone.x - b.facing * -1 * 0 + (b.facing > 0 ? -40 : 40), 20 * 16); p.facing = b.zone.x > p.x ? 1 : -1; p.invuln = 9; });
  for (let i = 0; i < 2; i++) {
    await page.keyboard.down('KeyJ'); await wait(40); await page.keyboard.up('KeyJ');
    await wait(700);
  }
  b = await B();
  ok(b.hp < hp0, `golpes do cavaleiro tiram vida (${hp0} -> ${b.hp.toFixed(1)})`);

  // segunda fase: urra e os sinos caem
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = b.maxHp * 0.52; b.hit(0, 1, 'side'); });
  await wait(500);
  b = await B();
  ok(b.state === 'roar' && b.bells >= 2, `segunda fase: urra e sinos caem (${b.state}, ${b.bells} sinos)`);
  await wait(500);
  await page.screenshot({ path: `${OUT}/boss-sinos.png` });

  // derrota
  await wait(1500);
  await page.evaluate(() => { const b = window.__scene.boss; b.hp = 0.5; b.hit(0, 1, 'side'); });
  await wait(600);
  await page.screenshot({ path: `${OUT}/boss-derrota.png` });
  await wait(3000);
  const after = await page.evaluate(() => ({ seen: window.__progress.seen.has('boss:sineiro'), mem: window.__scene.props.memories.map((m) => m.id), gate: window.__scene.level.tileAt(1 * 16 + 8, 17 * 16 + 8) }));
  ok(after.seen && after.mem.includes('cripta:boss'), `vencido: memória aparece (${after.mem.join(',')})`);
  // a grade sobe devagar (2,2 s) depois que a memória aparece
  await wait(2000);
  const gate2 = await page.evaluate(() => window.__scene.level.tileAt(1 * 16 + 8, 17 * 16 + 8));
  ok(gate2 < 0, `grade abre depois da luta (tile ${gate2})`);
  await page.screenshot({ path: `${OUT}/boss-memoria.png` });
  await page.evaluate(() => { const s = window.__scene; const m = s.props.memories.find((m) => m.id === 'cripta:boss'); s.player.invuln = 9; s.player.teleport(m.x, m.y + 26); });
  await page.waitForSelector('#screen-end.show', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(700);
  const end = await page.evaluate(() => document.querySelector('#screen-end').classList.contains('show') && document.querySelector('#screen-end .end-title').textContent);
  await page.screenshot({ path: `${OUT}/fim-capitulo.png` });
  ok(end === 'Fim do primeiro capítulo', `tela de fim de capítulo (${end})`);
  await page.click('#screen-end [data-cmd="explore"]');
  await page.waitForTimeout(500);

  // voltar para a cripta: o corpo continua lá, sem luta
  await page.evaluate(() => { window.__scene.scene.restart({ room: 'cripta', entry: '1', from: 'door' }); });
  await page.waitForTimeout(1500);
  const again = await page.evaluate(() => ({ boss: !!window.__scene.boss, gate: window.__scene.level.tileAt(1 * 16 + 8, 17 * 16 + 8) }));
  ok(!again.boss && again.gate < 0, `depois de vencido a cripta fica em paz (chefe ${again.boss})`);

  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
