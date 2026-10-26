// telas do caminho e dos magos: capturas no notebook e no celular deitado
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/magos';
const BASE = process.env.GAME || 'http://localhost:8767';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  for (const [name, vp] of [['note', { width: 1280, height: 720 }], ['wide', { width: 1600, height: 900 }], ['cel', { width: 844, height: 390 }]]) {
    const page = await browser.newPage({ viewport: vp });
    page.on('pageerror', (e) => errs.push(name + ' ERR ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(name + ' HTTP ' + r.status() + ' ' + r.url()); });
    await page.goto(`${BASE}/index.html?res=1&gfx=performance`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/index.html?res=1&gfx=performance`);
    await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
    await page.click('#screen-menu [data-cmd="new"]');
    await page.waitForSelector('#screen-path.show', { timeout: 10000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}-caminho.png` });
    await page.click('#screen-path .path-mage');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}-caminho-mago.png` });
    await page.click('#screen-path [data-cmd="confirm"]');
    await page.waitForSelector('#screen-mages.show', { timeout: 10000 });
    const tabs = await page.$$('#screen-mages .mage-tab');
    for (let i = 0; i < tabs.length; i++) {
      await tabs[i].click();
      await page.waitForTimeout(i === 0 ? 900 : 500);
      await page.screenshot({ path: `${OUT}/${name}-mago-${i}.png` });
    }
    const over = await page.evaluate(() => {
      const p = document.querySelector('#screen-mages .panel');
      return { sh: p.scrollHeight, ch: p.clientHeight };
    });
    console.log(name, 'painel dos magos', JSON.stringify(over));
    await page.close();
  }
  console.log(errs.join('\n') || 'sem erros');
  await browser.close();
})();
