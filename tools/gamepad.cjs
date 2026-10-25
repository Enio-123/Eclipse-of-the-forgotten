// Testa o jogo com um controle simulado (a Gamepad API é trocada por um controle falso).
// Confere menus, a aba Controle, troca de botão, andar, pular, dash, pausa, dicas e vibração.
//
// uso: node gamepad.cjs <url> <pasta-saida> [id-do-controle]
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const OUT = process.argv[3] || '.';
const PAD_ID = process.argv[4] || 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.addInitScript((id) => {
    const mk = () => ({ pressed: false, touched: false, value: 0 });
    const fake = {
      id, index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, mk),
      vibrationActuator: { type: 'dual-rumble', playEffect: (t, o) => { window.__rumbles.push([t, o]); return Promise.resolve('complete'); } },
    };
    window.__rumbles = [];
    window.__padOn = false;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (window.__padOn ? [fake, null, null, null] : [null, null, null, null]) });
    window.__btn = (i, v) => { fake.buttons[i].pressed = v; fake.buttons[i].value = v ? 1 : 0; fake.timestamp++; };
    window.__axis = (i, v) => { fake.axes[i] = v; fake.timestamp++; };
  }, PAD_ID);
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  await page.waitForTimeout(400);
  // segura o bastante para a leitura do controle pegar o toque mesmo com o navegador lento
  // (a repetição só começa com 380 ms)
  const tap = async (i, hold = 170) => {
    await page.evaluate((i) => window.__btn(i, true), i);
    await page.waitForTimeout(hold);
    await page.evaluate((i) => window.__btn(i, false), i);
    await page.waitForTimeout(110);
  };
  const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');

  // ---------- menus ----------
  await page.evaluate(() => (window.__padOn = true));
  await page.waitForTimeout(100);
  const f0 = await focused();
  await tap(13); // direcional para baixo
  const f1 = await focused();
  check('direcional move o foco no menu', f0 !== f1, `${f0} -> ${f1}`);
  check('corpo marca o controle em uso', await page.evaluate(() => document.body.classList.contains('pad')));
  // vai até Configurações e confirma com o botão de baixo
  for (let k = 0; k < 4 && (await focused()) !== 'Configurações'; k++) await tap(13);
  await tap(0);
  await page.waitForSelector('#screen-settings.show', { timeout: 3000 });
  const padTab = await page.evaluate(() => !document.querySelector('[data-panel="pad"]').hidden);
  check('configurações abrem na aba Controle', padTab);
  const status = await page.textContent('.pad-status');
  check('reconhece o controle e a marca', /DualSense/.test(status) && /PlayStation/.test(status), status);
  await page.screenshot({ path: `${OUT}/pad-aba-controle.png` });

  // troca o pulo para Triângulo
  await page.evaluate(() => document.querySelectorAll('.pad-binds button.key')[0].focus());
  await tap(0);
  const waiting = await page.evaluate(() => document.querySelector('.pad-binds button.key.wait')?.textContent ?? '');
  check('entra na espera do novo botão', /Aperte/.test(waiting));
  await page.waitForTimeout(150);
  await tap(3);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('eclipse-ajustes-v1')).pad.jump);
  check('pulo trocado para Triângulo', saved[0] === 3, JSON.stringify(saved));
  const lbl = await page.evaluate(() => document.querySelectorAll('.pad-binds button.key')[0].getAttribute('aria-label'));
  check('tabela mostra o novo botão', /Triângulo/.test(lbl), lbl);
  // L1 e R1 trocam de aba
  await tap(5);
  const tabAfter = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]').dataset.tab);
  check('R1 troca para a próxima aba', tabAfter === 'audio', tabAfter);
  await tap(4);
  await page.evaluate(() => document.querySelector('[data-cmd="reset-pad"]').click());
  const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('eclipse-ajustes-v1')).pad.jump);
  check('restaurar padrão volta o pulo para o botão de baixo', reset[0] === 0, JSON.stringify(reset));
  await tap(1); // volta
  await page.waitForSelector('#screen-menu.show', { timeout: 3000 });
  check('botão da direita volta ao menu', true);

  // ---------- começa um jogo novo só com o controle ----------
  for (let k = 0; k < 4 && (await focused()) !== 'Novo jogo'; k++) await tap(12);
  await tap(0);
  await page.waitForSelector('#screen-weapons.show', { timeout: 3000 });
  await tap(15);
  const w = await page.evaluate(() => document.querySelector('.card[aria-checked="true"]')?.dataset.w);
  check('direcional troca a arma', w === 'sword', w);
  await tap(14);
  const trail = [];
  for (let k = 0; k < 12 && (await focused()) !== 'Começar'; k++) { trail.push((await focused()).slice(0, 14)); await tap(13); }
  check('direcional desce até Começar', (await focused()) === 'Começar', trail.join(' > '));
  await tap(0);
  await page.waitForSelector('#screen-intro.show', { timeout: 4000 });
  const skipText = await page.evaluate(() => [...document.querySelectorAll('#screen-intro .skip span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent).join('|'));
  check('abertura mostra "Qualquer botão para pular"', /botão/.test(skipText), skipText);
  await page.waitForTimeout(600);
  await tap(0);
  await page.waitForFunction(() => { const s = window.__scene; return s && s.player && s.scene.isActive() && !s.cinematic && !s.player.frozen; }, null, { timeout: 20000 });
  await page.waitForTimeout(500);

  // ---------- no jogo ----------
  const x0 = await page.evaluate(() => window.__scene.player.x);
  await page.evaluate(() => window.__axis(0, 0.9));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__axis(0, 0));
  const x1 = await page.evaluate(() => window.__scene.player.x);
  check('analógico anda para a direita', x1 > x0 + 30, `${Math.round(x0)} -> ${Math.round(x1)}`);
  // diagonal para baixo e para o lado continua andando (não agacha)
  await page.evaluate(() => { window.__axis(0, 0.72); window.__axis(1, 0.69); });
  await page.waitForTimeout(400);
  const diag = await page.evaluate(() => ({ x: window.__scene.player.x, c: window.__scene.player.crouched }));
  await page.evaluate(() => { window.__axis(0, 0); window.__axis(1, 0); });
  check('diagonal não agacha', !diag.c && diag.x > x1 + 10, JSON.stringify(diag));
  await page.evaluate(() => window.__btn(0, true));
  await page.waitForTimeout(120);
  const vy = await page.evaluate(() => window.__scene.player.body.velocity.y);
  await page.evaluate(() => window.__btn(0, false));
  check('botão de baixo pula', vy < -50, `vy=${Math.round(vy)}`);
  await page.waitForTimeout(900);
  await tap(7, 60);
  const dashed = await page.evaluate(() => window.__scene.player.dashT > 0 || Math.abs(window.__scene.player.body.velocity.x) > 300);
  check('R2 dá dash', dashed);
  await page.waitForTimeout(600);
  const fmt = await page.evaluate(() => window.__ui.format('{jump} pular, {attack} atacar'));
  check('dica mostra os desenhos do PlayStation', /aria-label="X"/.test(fmt) && /aria-label="Quadrado"/.test(fmt));
  await page.screenshot({ path: `${OUT}/pad-jogo.png` });

  // pausa com Start e volta com o botão da direita (que também é dash) sem dar dash
  await page.waitForFunction(() => { const s = window.__scene; return !s.cinematic && !s.transitioning; }, null, { timeout: 15000 }).catch(() => {});
  console.log('estado antes da pausa', await page.evaluate(() => { const s = window.__scene; return JSON.stringify({ cin: s.cinematic, tr: s.transitioning, open: window.__ui.open, x: Math.round(s.player.x) }); }));
  await page.evaluate(() => window.__btn(9, true));
  await page.waitForTimeout(120);
  console.log('durante Start', await page.evaluate(() => { const s = window.__scene; const c = s.controls; return JSON.stringify({ pp: c.pausePressed, prev: c.padStartPrev, mask: [...c.padMask], active: s.scene.isActive(), paused: s.scene.isPaused(), gp: navigator.getGamepads()[0]?.buttons[9]?.pressed, dev: document.body.className }); }));
  await page.waitForTimeout(130);
  await page.evaluate(() => window.__btn(9, false));
  await page.waitForTimeout(90);
  await page.waitForSelector('#screen-pause.show', { timeout: 3000 });
  check('Start abre a pausa', true);
  await page.evaluate(() => window.__btn(1, true));
  await page.waitForTimeout(160);
  const closed = await page.evaluate(() => !document.querySelector('#screen-pause').classList.contains('show'));
  const dashAfter = await page.evaluate(() => window.__scene.player.dashT > 0);
  await page.evaluate(() => window.__btn(1, false));
  check('botão da direita fecha a pausa', closed);
  check('fechar a pausa não dispara o dash', !dashAfter);

  // vibração ao levar dano
  await page.evaluate(() => { const s = window.__scene; s.player.invuln = 0; s.player.hurtT = 0; if (s.player.hurt(s.player.x + 10)) s.onHurt(); });
  await page.waitForTimeout(100);
  const rumbles = await page.evaluate(() => window.__rumbles.length);
  check('controle vibra ao levar dano', rumbles > 0, `${rumbles} efeitos`);

  // teclado volta a mostrar as teclas
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(100);
  const fmtKb = await page.evaluate(() => window.__ui.format('{jump} pular'));
  check('com o teclado as dicas voltam para as teclas', /Espaço/.test(fmtKb), fmtKb);
  await page.evaluate(() => (window.__padOn = false));
  await page.waitForTimeout(150);
  check('desconectar tira o modo controle', await page.evaluate(() => !document.body.classList.contains('pad')));

  console.log(errs.join('\n') || 'sem erros');
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? `${bad} falha(s)` : 'tudo certo');
  await browser.close();
})();
