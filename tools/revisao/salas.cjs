// Fotografa cada sala inteira, tela por tela, como o jogador vê (para a revisão visual).
// uso: DISPLAY=:99 GL=mesa node salas.cjs <pasta-saida> [sala,sala...]   (GAME, GFX, RES)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || 'salas');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const GAME = process.env.GAME || 'http://localhost:8765';
const GFX = process.env.GFX || 'extreme';
const RES = Number(process.env.RES || 2);
const W = 640 * RES, H = 360 * RES;
const AB = (process.env.AB || 'dash,wall,double,hook,veil,cape,swim,light').split(',');
const SEEN = (process.env.SEEN || '').split(',').filter(Boolean);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const mesa = process.env.GL === 'mesa';
  const gl = mesa ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', `--window-size=${W},${H}`] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ headless: !mesa, args: gl });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(`${GAME}/index.html?res=${RES}&gfx=${GFX}`);
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  const gpu = await page.evaluate(() => { const r = window.__game.renderer; return r.type === 2; });
  if (!gpu) throw new Error('o jogo abriu sem WebGL');
  await page.evaluate(([ab, seen]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(ab);
    for (const k of seen) p.seen.add(k);
    p.save();
  }, [AB, SEEN]);
  const rooms = await page.evaluate(() => Object.fromEntries(Object.entries(window.__rooms).map(([id, r]) => [id, { w: Math.max(...r.map.map((x) => x.length)), h: r.map.length, entries: [...new Set(r.map.join('').split('').filter((c) => /[0-9P]/.test(c)))].sort(), doors: (r.doors || []).length }])));
  const cdp = await page.context().newCDPSession(page);
  const index = {};
  for (const [room, info] of Object.entries(rooms)) {
    if (ONLY && !ONLY.includes(room)) continue;
    const entry = info.entries.includes('1') ? '1' : info.entries[0] || 'O0';
    await page.evaluate(([room, entry]) => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.loop.wake();
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [room, entry]);
    try {
      await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && window.__scene.room.id === room && !window.__scene.transitioning, room, { timeout: 60000 });
      await page.waitForFunction((gfx) => {
        const s = window.__scene;
        if (!s || s.clock < 0.25) return false;
        if (s.cameras.main.fadeEffect.isRunning) return false;
        if (s.lighting && !s.lighting.ready) return false;
        if (gfx === 'extreme' && s.terrainImg && !s.hdImgs.length) return false;
        return true;
      }, GFX, { timeout: 45000 });
    } catch (e) { log(room, 'esperou demais:', e.message.split('\n')[0]); }
    // a sala assenta; depois a câmera solta do cavaleiro e anda pela grade
    await page.waitForTimeout(700);
    const dims = await page.evaluate(() => {
      const s = window.__scene;
      const cam = s.cameras.main;
      s.camLock = true;
      cam.stopFollow();
      s.player.invuln = 99999;
      s.player.hurt = () => false;
      const hud = window.__game.scene.getScene('hud');
      if (hud) hud.cameras.main.setVisible(false);
      for (const el of document.querySelectorAll('#hud, .hud, #hint, .hint, #banner, .banner, #toast')) el.style.visibility = 'hidden';
      return { W: s.level.widthPx, H: s.level.heightPx, vw: cam.width / cam.zoom, vh: cam.height / cam.zoom, bx: cam.getBounds().x, by: cam.getBounds().y, bw: cam.getBounds().width, bh: cam.getBounds().height };
    });
    const cols = Math.max(1, Math.ceil(dims.bw / dims.vw - 0.02)), rows = Math.max(1, Math.ceil(dims.bh / dims.vh - 0.02));
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = Math.min(dims.bx + c * dims.vw, dims.bx + dims.bw - dims.vw), y = Math.min(dims.by + r * dims.vh, dims.by + dims.bh - dims.vh);
      // com zoom, o scroll do Phaser é do retângulo sem zoom: centerOn acerta a conta
      await page.evaluate(([x, y, vw, vh]) => { window.__scene.cameras.main.centerOn(x + vw / 2, y + vh / 2); }, [Math.max(dims.bx, x), Math.max(dims.by, y), dims.vw, dims.vh]);
      const tx = Math.max(dims.bx, x), ty = Math.max(dims.by, y);
      // espera o quadro com a câmera no lugar e mais uns quadros para a luz acompanhar
      await page.waitForFunction(([x, y]) => { const v = window.__scene.cameras.main.worldView; return Math.abs(v.x - x) < 1.5 && Math.abs(v.y - y) < 1.5; }, [tx, ty], { timeout: 20000 }).catch(() => log(room, 'câmera não chegou', tx, ty));
      await page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n >= 4 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
      const got = await page.evaluate(() => { const v = window.__scene.cameras.main.worldView; return [Math.round(v.x), Math.round(v.y)]; });
      const buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })).data, 'base64');
      const file = `${room}-${r}-${c}.jpg`;
      fs.writeFileSync(path.join(OUT, file), buf);
      cells.push({ r, c, x: got[0], y: got[1], file });
    }
    index[room] = { ...dims, cols, rows, cells };
    log(room, `${cols}x${rows}`, errs.length ? `erros ${errs.length}` : '');
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
  }
  if (errs.length) log([...new Set(errs)].slice(0, 20).join('\n'));
  await browser.close();
})();
