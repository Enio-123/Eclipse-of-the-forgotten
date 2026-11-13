// Fotografa pontos escolhidos das salas (a câmera centrada num tile), como o jogador vê.
// uso: DISPLAY=:99 GL=mesa node foco.cjs <pasta-saida> <sala:tx:ty[:nome]>[,...]   (GAME, GFX, RES, AB, SEEN, ZOOM)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || 'foco');
const SHOTS = (process.argv[3] || '').split(',').filter(Boolean).map((s) => { const [room, x, y, name] = s.split(':'); return { room, x: Number(x), y: Number(y), name: name || `${x}-${y}` }; });
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
  await page.evaluate(([ab, seen]) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = 1;
    p.abilities = new Set(ab);
    for (const k of seen) p.seen.add(k);
    p.save();
  }, [AB, SEEN]);
  const cdp = await page.context().newCDPSession(page);
  let cur = null;
  for (const sh of SHOTS) {
    if (cur !== sh.room) {
      const ok = await page.evaluate(([room]) => {
        const def = window.__rooms[room];
        if (!def) return false;
        window.__oldPlayer = window.__scene && window.__scene.player;
        window.__ui.closeAll();
        const g = window.__game;
        const t = g.scene.getScene('title');
        if (t && t.scene.isActive()) t.scene.stop();
        g.loop.wake();
        const es = [...new Set(def.map.join('').split('').filter((c) => /[0-9P]/.test(c)))].sort();
        const entry = es.includes('1') ? '1' : es[0] || 'O0';
        const gs = g.scene.getScene('game');
        if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
        else g.scene.start('game', { room, entry, from: 'door' });
        return true;
      }, [sh.room]);
      if (!ok) { log('sala desconhecida', sh.room); continue; }
      try {
        await page.waitForFunction((room) => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && window.__scene.room.id === room && !window.__scene.transitioning, sh.room, { timeout: 60000 });
        await page.waitForFunction((gfx) => {
          const s = window.__scene;
          if (!s || s.clock < 0.25) return false;
          if (s.cameras.main.fadeEffect.isRunning) return false;
          if (s.lighting && !s.lighting.ready) return false;
          if (gfx === 'extreme' && s.terrainImg && !s.hdImgs.length) return false;
          return true;
        }, GFX, { timeout: 45000 });
      } catch (e) { log(sh.room, 'esperou demais:', e.message.split('\n')[0]); }
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        const s = window.__scene;
        s.camLock = true;
        s.cameras.main.stopFollow();
        s.player.invuln = 99999;
        s.player.hurt = () => false;
        const hud = window.__game.scene.getScene('hud');
        if (hud) hud.cameras.main.setVisible(false);
        for (const el of document.querySelectorAll('#hud, .hud, #hint, .hint, #banner, .banner, #toast')) el.style.visibility = 'hidden';
      });
      cur = sh.room;
    }
    await page.evaluate(([x, y]) => { window.__scene.cameras.main.centerOn(x * 16 + 8, y * 16 + 8); }, [sh.x, sh.y]);
    await page.waitForTimeout(350);
    await page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n >= 6 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    const buf = Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).data, 'base64');
    const file = `${sh.room}-${sh.name}.jpg`;
    fs.writeFileSync(path.join(OUT, file), buf);
    log(file);
  }
  if (errs.length) log([...new Set(errs)].slice(0, 20).join('\n'));
  await browser.close();
})();
