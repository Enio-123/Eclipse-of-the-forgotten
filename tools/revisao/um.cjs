// Depuração do explorador: roda movimentos escolhidos de um ponto e mostra o rastro.
// uso: node um.cjs <sala> <x_px> <pés_px> <movimento[,movimento]> [cada]   (AB, GAME, OPEN=1, HUMAN, HAND)
const { chromium } = require('playwright');
const path = require('path');
const [ROOM, X, F, NAMES, CADA] = process.argv.slice(2);
const GAME = process.env.GAME || 'http://localhost:8765';
const AB = (process.env.AB || 'dash,wall,double,hook,veil,cape,swim,light').split(',').filter(Boolean);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto(`${GAME}/index.html?res=1&gfx=performance`);
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  await page.addScriptTag({ path: path.join(__dirname, 'alcance-page.js') });
  await page.evaluate(([room, ab]) => {
    const g = window.__game;
    window.__ui.closeAll();
    const p = window.__progress;
    p.reset(); p.prologueDone = true; p.kintsugi = 1; p.abilities = new Set(ab);
    const def = window.__rooms[room];
    if (def.gusts) def.gusts = [];
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.loop.wake();
    const entry = [...new Set(def.map.join('').split('').filter((c) => /[0-9P]/.test(c)))].sort()[0] || 'O0';
    g.scene.start('game', { room, entry, from: 'door' });
  }, [ROOM, AB]);
  await page.waitForFunction((room) => { const s = window.__scene; return s && s.player && s.room.id === room && s.scene.isActive() && !s.transitioning; }, ROOM, { timeout: 60000 });
  await page.waitForTimeout(500);
  const info = await page.evaluate((o) => window.__al.prepare(o), { open: process.env.OPEN !== '0', human: process.env.HUMAN === '1', amber: true });
  const names = NAMES === '?' ? info.macros : NAMES.split(',').flatMap((n) => (n.endsWith('*') ? info.macros.filter((m) => m.startsWith(n.slice(0, -1))) : [n]));
  if (NAMES === '?') { console.log(info.macros.join(' ')); await browser.close(); return; }
  for (const name of names) {
    const r = await page.evaluate(([n, m, cada]) => { window.__al.rastro = []; window.__al.cada = cada; const r = window.__al.one(n, m); r.rastro = window.__al.rastro; window.__al.rastro = null; return r; }, [{ x: Number(X), f: Number(F), c: 0, w: 0 }, name, Number(CADA || 4)]);
    if (!r) { console.log(name, 'não roda daqui'); continue; }
    console.log(`${name}: parou em x=${r.x} (${(r.x / 16).toFixed(1)}) pés=${r.f} (${(r.f / 16).toFixed(1)}) chão=${r.g} água=${r.w} falha=${r.fail || '-'} quadros=${r.frames} metas=${r.goals.join(',')}`);
    if (CADA) console.log(r.rastro.map((q) => q.join(' ')).join('\n'));
  }
  await browser.close();
})();
