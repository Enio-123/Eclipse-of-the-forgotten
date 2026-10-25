// Captura só a camada jogável (tiles, enfeites, cavaleiro, inimigos e HUD), sem fundo nem chuva,
// em resolução nativa do jogo e com transparência: renderiza o mesmo quadro sobre preto e sobre
// branco e calcula o alfa pela diferença. Serve para montar prévias de arte com fundos novos.
//
// uso: node capture_layer.cjs <url> <saida.png> <sala> <x-do-cavaleiro> [virado: 1|-1]
const { chromium } = require('playwright');
const fs = require('fs');
const [URL, OUT, ROOM = 'ponte', PX = '560', FACE = '1'] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.addStyleTag({ content: '#ui, #touch { display: none !important; }' });
  await page.evaluate((room) => {
    window.__ui.closeAll();
    const g = window.__game;
    const t = g.scene.getScene('title');
    if (t && t.scene.isActive()) t.scene.stop();
    g.scene.start('game', { room, entry: room === 'ponte' ? 'P' : '1', from: 'continue' });
  }, ROOM);
  await page.waitForFunction((room) => { const s = window.__scene; return s && s.player && s.room.id === room && s.scene.isActive() && !s.cinematic; }, ROOM, { timeout: 20000 });
  await page.evaluate(([x, face]) => {
    const s = window.__scene;
    s.story = () => {};
    s.player.teleport(x, s.player.body.bottom);
    s.player.facing = face;
  }, [Number(PX), Number(FACE)]);
  await page.waitForTimeout(2500); // a câmera chega e o cavaleiro fica parado
  const shots = [];
  for (const bg of [0x000000, 0xffffff]) {
    await page.evaluate((bg) => {
      const g = window.__game;
      const s = window.__scene;
      s.scene.pause();
      const hud = g.scene.getScene('hud');
      if (hud) hud.scene.pause();
      s.cameras.main.setBackgroundColor(bg);
      // esconde fundo, chuva, névoa e vinheta: fica o que está entre os enfeites de trás e a água
      for (const o of s.children.list) if (o.depth < -3.5 || o.depth >= 13) o.setVisible(false);
    }, bg);
    await page.waitForTimeout(300);
    shots.push(await page.locator('#game canvas').screenshot());
  }
  fs.writeFileSync(OUT.replace(/\.png$/, '-preto.png'), shots[0]);
  fs.writeFileSync(OUT.replace(/\.png$/, '-branco.png'), shots[1]);
  const info = await page.evaluate(() => { const s = window.__scene; const c = s.cameras.main; return { scrollX: c.scrollX, scrollY: c.scrollY, px: s.player.x, feet: s.player.body.bottom }; });
  fs.writeFileSync(OUT.replace(/\.png$/, '.json'), JSON.stringify(info));
  console.log(JSON.stringify(info));
  await browser.close();
})();
