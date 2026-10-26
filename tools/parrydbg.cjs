// Depuração: por que aparar a estocada do Mestre da Caça falha. Mede quadro a quadro o estado do
// chefe, a janela de aparar, o golpe do cavaleiro e a sobreposição das caixas.
// uso: node tools/parrydbg.cjs [url]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
    for (const k of ['memory:vale', 'gate:catacumbas', 'boss:sineiro', 'weapon:badalo', 'boss:arcebispo', 'weapon:incensario', 'relic:hook', 'item:chaves',
      'preso:met', 'preso:livre', 'boss:carcereira', 'weapon:corrente', 'fosso:aberto', 'boss:sombra', 'relic:veil', 'boss:reflexo', 'boss:capataz',
      'weapon:picareta', 'journal']) p.seen.add(k);
    p.save();
  });
  await page.evaluate(() => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room: 'clareira', entry: '1', from: 'door' });
  });
  await page.waitForFunction(() => window.__scene && window.__scene.player && !window.__scene.transitioning, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  // acorda o chefe
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => window.__scene.boss && window.__scene.boss.state !== 'sleep', null, { timeout: 30000, polling: 16 });
  await page.keyboard.up('KeyD');
  await page.waitForFunction(() => window.__scene.boss.state === 'idle', null, { timeout: 30000, polling: 16 });
  // chefe parado em 40, cavaleiro em 43 virado para ele
  const log = await page.evaluate(() => new Promise((done) => {
    const s = window.__scene;
    const b = s.boss;
    const p = s.player;
    b.toIdle = function () { this.go('idle', 'idle'); this.thinkT = 99; };
    b.toIdle();
    b.shocks = [];
    b.body.reset(40 * 16 + 8, 29 * 16 - 40);
    b.body.setVelocity(0, 0);
    p.teleport(43 * 16 + 8, 29 * 16);
    p.body.setVelocity(0, 0);
    p.hp = 5;
    p.invuln = 4;
    p.facing = -1;
    const rows = [];
    let pressed = false;
    const fn = () => {
      const box = p.attackBox();
      const r = b.rect;
      rows.push({
        clock: +s.clock.toFixed(3), st: b.state, t: +b.t.toFixed(3),
        atk: p.attacking, win: p.windupT, atkT: +p.atkT.toFixed(3), dir: p.atkDir, face: p.facing,
        hA: s.controls.held.attack, pA: s.controls.pressed.attack, cd: +p.atkCd.toFixed(3), ui: window.__ui.open,
        box: [Math.round(box.x), Math.round(box.right)], bx: [Math.round(r.x), Math.round(r.right)],
        ov: box.right > r.x && r.right > box.x && box.bottom > r.y && r.bottom > box.y,
      });
      if (b.state === 'thrustwind' && b.t > 0.4 && !pressed) {
        pressed = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ' })), 110);
      }
      if (b.state === 'stagger' || b.state === 'thrustrec' || rows.length > 400) {
        s.events.off('postupdate', fn);
        done(rows);
      }
    };
    s.events.on('postupdate', fn);
    b.thinkT = 99;
    b.startAttack('thrust');
  }));
  const seen = new Set();
  for (const r of log) {
    const key = `${r.st}|${r.atk}|${r.hA}|${r.pA}|${r.ov}`;
    if (!seen.has(key) || r.st === 'thrustwind') { seen.add(key); console.log(JSON.stringify(r)); }
  }
  console.log('estados:', [...new Set(log.map((r) => r.st))].join(' > '));
  await browser.close();
})();
