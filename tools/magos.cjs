// O caminho do Mago. Na tela nova, Novo jogo leva a Cavaleiro ou Mago e depois aos quatro magos
// (com a arte do cajado e as versões); o mago escolhido entra no jogo. Cada mago: o golpe básico
// (bolinha, bordão, chicote de tinta, pulso que empurra), a habilidade (mira no chão, versões com
// cima e baixo, dano, recarga, o HUD com o anel e a negação durante a recarga), e o que é de cada
// escola: o Grimório do Necromante (eco de quem caiu e eco de chefe), o Mergulho do Véu, a Torre e
// as paredes do Espaço (a que protege segura tiros). A Energia do chefe no lugar da arma, a pausa
// sem Trocar arma, o inventário e o ferreiro do mago, e o Continuar com o cajado.
// uso: node tools/magos.cjs <pasta-saida> [url]
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8765/index.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  let fails = 0;
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  const check = (ok, msg) => {
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FALHA ') + msg);
  };
  // a foto demora (o navegador sem placa de vídeo): a cena para antes, para o tempo do jogo não correr
  const shot = async (name) => {
    const paused = await page.evaluate(() => {
      const s = window.__scene;
      if (!s || !s.scene.isActive()) return false;
      s.scene.pause();
      return true;
    });
    if (paused) await page.waitForFunction(() => window.__scene.scene.isPaused(), null, { timeout: 5000, polling: 16 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (paused) {
      await page.evaluate(() => window.__scene.scene.resume());
      await page.waitForFunction(() => window.__scene.scene.isActive(), null, { timeout: 5000, polling: 16 }).catch(() => {});
    }
  };
  const until = async (fn, arg, timeout = 30000) => {
    try {
      return await page.waitForFunction(fn, arg, { timeout, polling: 16 });
    } catch (e) {
      console.log('  espera falhou: ' + fn.toString().slice(0, 140));
      throw e;
    }
  };
  const waitGame = async (sec, timeout = 60000) => {
    const c0 = await page.evaluate(() => window.__scene.clock);
    await page.waitForFunction((c) => window.__scene.clock >= c, c0 + sec, { timeout, polling: 16 });
  };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  // aperta e espera o jogo ler (o quadro do navegador sem placa é lento)
  const press = async (key) => {
    await page.keyboard.down(key);
    await waitGame(0.06).catch(() => {});
    await page.keyboard.up(key);
  };

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });

  // ---------- telas: caminho e magos ----------
  await page.click('#screen-menu [data-cmd="new"]');
  await page.waitForSelector('#screen-path.show', { timeout: 10000 });
  const path0 = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('#screen-path .path-card')].map((c) => c.querySelector('h3').textContent + (c.getAttribute('aria-checked') === 'true' ? '*' : '')),
    focus: document.activeElement && document.activeElement.classList.contains('path-knight'),
  }));
  console.log('caminho:', path0.cards.join(' '));
  check(path0.cards.join(' ') === 'Cavaleiro* Mago', 'o caminho mostra Cavaleiro (escolhido) e Mago');
  await page.click('#screen-path .path-mage');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('#screen-path .path-mage').getAttribute('aria-checked') === 'true'), 'clicar no Mago escolhe o Mago');
  await page.screenshot({ path: `${OUT}/caminho.png` });
  // Enter na carta escolhida confirma (o clique do mouse só escolhe)
  await page.focus('#screen-path .path-mage');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#screen-mages.show', { timeout: 10000 });
  const mages = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('#screen-mages .mage-tab')].map((b) => b.querySelector('b').textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')),
    img: document.querySelector('#screen-mages .mage-art img').getAttribute('src'),
    credit: document.querySelector('#screen-mages .mage-art figcaption').textContent,
    versions: [...document.querySelectorAll('#screen-mages .versions .v-head b')].map((b) => b.textContent),
    keys: document.querySelector('#screen-mages .facts').textContent,
  }));
  console.log('magos:', mages.tabs.join(' | '), mages.img, mages.credit, mages.versions.join(', '));
  check(mages.tabs.length === 4 && mages.tabs[0].endsWith('*'), 'os quatro magos, com o Eclipse escolhido de começo');
  check(mages.img === 'assets/staff-eclipse.webp' && /Enio/.test(mages.credit), 'a arte do cajado do Eclipse com o crédito do Enio');
  check(mages.versions.join(',') === 'Coluna,Leque' && /Clique direito/.test(mages.keys), 'as versões do Feixe e as teclas da habilidade');
  await page.click('#screen-mages .mage-tab:nth-child(3)');
  await page.waitForTimeout(300);
  const veu = await page.evaluate(() => ({
    img: document.querySelector('#screen-mages .mage-art img').getAttribute('src'),
    credit: document.querySelector('#screen-mages .mage-art figcaption').hidden,
    versions: [...document.querySelectorAll('#screen-mages .versions .v-head b')].map((b) => b.textContent),
  }));
  check(veu.img === 'assets/staff-veu.webp' && veu.credit && veu.versions.join(',') === 'Tentáculos,Mergulho', 'trocar para o Véu troca a arte e as versões');
  await page.screenshot({ path: `${OUT}/magos-veu.png` });
  await page.click('#screen-mages [data-cmd="back"]');
  await page.waitForSelector('#screen-path.show', { timeout: 5000 });
  check(await page.evaluate(() => document.querySelector('#screen-path .path-mage').getAttribute('aria-checked') === 'true'), 'Voltar volta ao caminho');
  await page.click('#screen-path [data-cmd="confirm"]');
  await page.waitForSelector('#screen-mages.show', { timeout: 5000 });
  await page.click('#screen-mages .mage-tab:nth-child(3)');
  await page.click('#screen-mages [data-cmd="confirm"]');
  await until(() => window.__progress.starter === 'veu', null, 10000).catch(() => {});
  check(await page.evaluate(() => window.__progress.starter === 'veu' && window.__settings.data.weapon === 'veu' && window.__progress.mage === 'veu'), 'Começar grava o Mago do Véu como a escolha do jogo');
  await page.waitForSelector('#screen-intro.show', { timeout: 15000 }).catch(() => {});
  check(await page.evaluate(() => document.querySelector('#screen-intro').classList.contains('show')), 'a abertura começa');

  // ---------- no jogo: cada mago ----------
  const setup = async (mage, o = {}) => {
    await page.evaluate(([mage, o]) => {
      const p = window.__progress;
      p.reset();
      p.prologueDone = true;
      p.kintsugi = 1;
      p.starter = mage;
      window.__settings.data.weapon = mage;
      window.__settings.save();
      p.abilities = new Set(['dash', 'wall', 'double', 'hook', 'veil']);
      for (const k of ['memory:vale', 'gate:catacumbas', ...(o.seen || [])]) p.seen.add(k);
      for (const [k, n] of Object.entries(o.kills || {})) p.kills.set(k, n);
      p.save();
    }, [mage, o]);
    await page.evaluate(() => {
      window.__oldPlayer = window.__scene && window.__scene.player;
      window.__ui.closeAll();
      const g = window.__game;
      for (const k of ['intro', 'title']) {
        const sc = g.scene.getScene(k);
        if (sc && sc.scene.isActive()) sc.scene.stop();
      }
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room: 'ponte', entry: 'P', from: 'continue' });
      else g.scene.start('game', { room: 'ponte', entry: 'P', from: 'continue' });
    });
    await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && !window.__scene.transitioning && window.__scene.clock > 0.3, null, 60000);
    // espera ele ficar livre para agir (sem pose, sem cena, no chão)
    await until(() => { const s = window.__scene; return !s.cinematic && s.player.canAim; }, null, 60000).catch(() => {});
    await page.evaluate(() => {
      const s = window.__scene;
      window.__foes = [];
      // os inimigos da ponte saem da frente (o teste traz os seus)
      for (const e of s.enemies) {
        if (e.alive && e.kind !== 'boss') { e.alive = false; e.zone.destroy?.(); e.sprite?.setVisible(false); }
      }
      s.enemies = [];
    });
  };
  // coloca o cavaleiro parado no chão da ponte, olhando para a direita
  const place = (x) => page.evaluate((x) => {
    const s = window.__scene;
    const p = s.player;
    const feet = p.body.bottom;
    p.teleport(x, feet);
    p.body.setVelocity(0, 0);
    p.facing = 1;
    p.hp = 5;
    // o teste olha a magia: o contato dos inimigos não empurra o mago para longe
    p.invuln = 1e9;
    s.registry.set('hp', 5);
    if (s.magic) s.magic.cd = 0;
    return { x: p.x, feet: p.body.bottom };
  }, x);
  // alvo parado (still): a cabeça desliga e ele fica onde nasceu, para a mira não errar por ele andar
  const spawn = (kind, dx, still = false) => page.evaluate(([kind, dx, still]) => {
    const s = window.__scene;
    const p = s.player;
    const e = s.spawn(kind, p.x + dx, p.body.bottom);
    if (!e) return -1;
    e.facing = -1;
    if (still) {
      // a cabeça segue (golpes, morte), mas ele não sai do lugar sozinho
      const orig = e.update.bind(e);
      e.update = (dt) => {
        orig(dt);
        const m = window.__scene.magic;
        if (e.alive && !m?.shoves?.some((sh) => sh.e === e) && !m?.launches?.some((l) => l.e === e)) e.body.setVelocityX(0);
      };
    }
    window.__foes = window.__foes || [];
    window.__foes.push(e);
    return window.__foes.length - 1;
  }, [kind, dx, still]);
  // tira de cena os inimigos do teste que ainda estão vivos
  const clearFoes = () => page.evaluate(() => {
    const s = window.__scene;
    for (const e of window.__foes || []) if (e.alive && s.enemies.includes(e)) { e.hp = 0.01; e.hit(e.zone.x, 99, 'quake'); }
  });
  const foe = (i) => page.evaluate((i) => {
    const e = window.__foes[i];
    return { hp: +e.hp.toFixed(2), alive: e.alive, x: Math.round(e.zone.x), y: Math.round(e.zone.y), state: e.state };
  }, i);
  const M = () => page.evaluate(() => {
    const s = window.__scene;
    const m = s.magic;
    const st = s.registry.get('skill');
    const hud = window.__game.scene.getScene('hud');
    const icon = hud.children.list.filter((o) => o.list).flatMap((c) => c.list).flatMap((o) => (o.list ? o.list : [o])).find((o) => o.texture && /^skill-/.test(o.texture.key));
    return {
      aiming: m ? m.aiming : null,
      paim: s.player.aiming,
      cd: m ? +m.cd.toFixed(2) : null,
      cdMax: m ? +m.cdMax.toFixed(2) : null,
      i: m && m.aim ? m.aim.i : null,
      hint: m ? m.aimHint : null,
      hud: st ? { mage: st.mage, aiming: st.aiming, cd: st.cd, max: st.max, energy: st.energy } : null,
      icon: icon ? icon.texture.key + (icon.visible && icon.parentContainer.visible ? '' : ':oculto') : null,
      deny: s.registry.get('skill-deny') || 0,
      fx: m ? m.fx.length : 0,
      revs: m ? m.revs.length : 0,
      bosses: m ? m.bosses.length : 0,
      walls: m ? m.walls.length : 0,
      cls: document.body.classList.contains('is-mage'),
    };
  });
  // mira no ponto (x do mundo) e solta
  const aimAt = (x) => page.evaluate((x) => {
    const a = window.__scene.magic.aim;
    if (a) { a.x = x; a.mouse = false; }
  }, x);
  const castAt = async (x, name) => {
    await press('KeyI');
    await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
    await aimAt(x);
    await waitGame(0.1);
    if (name) await shot(`${name}-mira`);
    const m = await M();
    if (process.env.DBG) console.log('  mira', JSON.stringify(await page.evaluate((x) => { const s = window.__scene; const a = s.magic.aim; return { want: Math.round(x), ax: a && Math.round(a.x), mouse: a && a.mouse, px: a && a.px, ps: s.controls.pointerScreen.x, pw: Math.round(s.controls.pointerWorld.x), p: Math.round(s.player.x), clock: +s.clock.toFixed(2), cd: s.magic.cd }; }, x)));
    await press('KeyJ');
    if (process.env.DBG) console.log('  solta', JSON.stringify(await page.evaluate(() => { const s = window.__scene; return { clock: +s.clock.toFixed(2), cd: +s.magic.cd.toFixed(2), fx: s.magic.fx.length, foes: (window.__foes || []).filter((e) => e.alive).map((e) => e.kind + '@' + Math.round(e.zone.x) + ':' + e.hp) }; })));
    return m;
  };

  // ----- Eclipse -----
  await setup('eclipse');
  await place(20 * 16);
  let m = await M();
  check(m.cls && m.hud && m.hud.mage === 'eclipse' && m.icon === 'skill-eclipse', `Eclipse: corpo is-mage, HUD da habilidade (${m.icon})`);
  // em pé a bolinha sai na altura do peito (acerta quem é alto); agachado, rente ao chão
  let f = await spawn('a', 130);
  await waitGame(0.4);
  let h0 = (await foe(f)).hp;
  await press('KeyJ');
  await waitGame(0.08);
  const orb = await page.evaluate(() => window.__scene.arrows.some((a) => a.orb && !a.hostile));
  await shot('eclipse-bolinha');
  await waitGame(0.6);
  let h1 = (await foe(f)).hp;
  check(orb && h1 < h0, `Eclipse: a bolinha sai do cajado e acerta o arqueiro (${h0} -> ${h1})`);
  await page.evaluate((i) => { const e = window.__foes[i]; if (e.alive) { e.hp = 0.01; e.hit(0, 1, 'quake'); } }, f);
  f = await spawn('c', 90);
  await waitGame(0.4);
  h0 = (await foe(f)).hp;
  await page.keyboard.down('KeyC');
  await waitGame(0.1);
  await press('KeyJ');
  await waitGame(0.1);
  await shot('eclipse-bolinha-baixa');
  await page.keyboard.up('KeyC');
  await waitGame(0.5);
  h1 = (await foe(f)).hp;
  check(h1 < h0, `Eclipse: agachado, a bolinha sai baixa e acerta o penitente (${h0} -> ${h1})`);
  const g = await spawn('g', 120, true);
  await waitGame(0.5);
  const gh0 = (await foe(g)).hp;
  m = await castAt(await page.evaluate((i) => window.__foes[i].zone.x, g), 'eclipse-coluna');
  check(m.aiming && m.paim && m.hud.aiming && /Feixe do Chão: Coluna/.test(m.hint || ''), `Eclipse: a habilidade mira (${m.hint})`);
  await waitGame(0.2);
  await shot('eclipse-coluna');
  await waitGame(0.5);
  const gh1 = (await foe(g)).hp;
  m = await M();
  check(gh1 < gh0 - 2, `Eclipse: a Coluna sobe do chão e passa pelo escudo do guarda (${gh0} -> ${gh1})`);
  check(!m.aiming && m.cdMax === 7 && m.cd > 0 && m.hud.cd > 0 && m.hud.max === 7, `Eclipse: recarga de 7 s depois de soltar (falta ${m.cd} s)`);
  await press('KeyI');
  await waitGame(0.1);
  const m2 = await M();
  check(!m2.aiming && m2.deny > m.deny, 'Eclipse: durante a recarga a habilidade nega (o ícone treme)');
  await shot('eclipse-recarga');
  // a segunda versão: o Leque varre e empurra
  await page.evaluate(() => { window.__scene.magic.cd = 0; });
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  await press('KeyS');
  m = await M();
  check(m.i === 1 && /Leque/.test(m.hint || ''), `Eclipse: baixo troca a versão (${m.hint})`);
  const c2 = await spawn('c', 70, true);
  await waitGame(0.4);
  const cx0 = (await foe(c2)).x;
  await aimAt(cx0);
  await press('KeyJ');
  await waitGame(0.15);
  await shot('eclipse-leque');
  await waitGame(0.4);
  const c2s = await foe(c2);
  check(!c2s.alive || c2s.x > cx0 + 6 || c2s.hp < 3, `Eclipse: o Leque acerta e empurra (${cx0} -> ${c2s.x}, vida ${c2s.hp})`);
  // a mira cancela com pular e não deixa mirar no ar
  await page.evaluate(() => { window.__scene.magic.cd = 0; });
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  await press('Space');
  m = await M();
  check(!m.aiming && !m.paim, 'Eclipse: pular cancela a mira');

  // ----- Necromante -----
  await setup('necro', { kills: { crawler: 3, guard: 1 }, seen: ['boss:sineiro'] });
  await place(20 * 16);
  f = await spawn('c', 34, true);
  await waitGame(0.4);
  h0 = (await foe(f)).hp;
  await press('KeyJ');
  await waitGame(0.1);
  await shot('necro-bordao');
  await waitGame(0.3);
  h1 = (await foe(f)).hp;
  check(h1 < h0, `Necromante: o cajado bate de perto (${h0} -> ${h1})`);
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  const list = await page.evaluate(() => window.__scene.magic.choices().map((c) => c.name));
  console.log('Grimório:', list.join(' | '));
  check(list.includes('Eco: Penitente rastejante') && list.includes('Eco: Guarda do Dízimo') && list.some((n) => /Sineiro/.test(n)), 'Necromante: o Grimório lista quem ele venceu e o chefe');
  // escolhe o eco do guarda
  for (let k = 0; k < 4 && !/Guarda/.test((await M()).hint || ''); k++) await press('KeyW');
  m = await M();
  check(/Eco: Guarda do Dízimo/.test(m.hint || ''), `Necromante: cima e baixo passam pelo Grimório (${m.hint})`);
  const tgt = await spawn('c', 150);
  await waitGame(0.3);
  await aimAt(await page.evaluate(() => window.__scene.player.x + 60));
  await press('KeyJ');
  await waitGame(0.5);
  m = await M();
  check(m.revs === 1, 'Necromante: o eco do guarda volta do lado dele');
  await shot('necro-eco');
  await waitGame(3.5);
  const ts = await foe(tgt);
  check(!ts.alive || ts.hp < 3, `Necromante: o eco luta e machuca o inimigo (vida ${ts.hp}, vivo ${ts.alive})`);
  // eco de chefe: o Sineiro aparece e bate
  await page.evaluate(() => { window.__scene.magic.cd = 0; });
  const big = await spawn('g', 110, true);
  await waitGame(0.3);
  const bh0 = (await foe(big)).hp;
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  for (let k = 0; k < 4 && !/Sineiro/.test((await M()).hint || ''); k++) await press('KeyS');
  await aimAt(await page.evaluate((i) => window.__foes[i].zone.x - 30, big));
  await press('KeyJ');
  await waitGame(0.6);
  m = await M();
  check(m.bosses === 1, 'Necromante: o eco do Sineiro aparece');
  await shot('necro-chefe');
  await waitGame(0.6);
  const bh1 = (await foe(big)).hp;
  check(bh1 < bh0 - 2, `Necromante: o golpe do Sineiro acerta forte (${bh0} -> ${bh1})`);
  m = await M();
  check(m.cdMax === 20 && m.cd > 0, `Necromante: o eco de chefe tem a recarga longa (${m.cdMax} s)`);

  // ----- Véu Abissal -----
  await setup('veu');
  await place(20 * 16);
  f = await spawn('c', 72, true);
  await waitGame(0.4);
  h0 = (await foe(f)).hp;
  await press('KeyJ');
  await waitGame(0.12);
  await shot('veu-chicote');
  await waitGame(0.3);
  h1 = (await foe(f)).hp;
  check(h1 < h0, `Véu: o chicote de tinta estala longe (${h0} -> ${h1})`);
  const vg = await spawn('g', 120, true);
  await waitGame(0.5);
  const vh0 = (await foe(vg)).hp;
  m = await castAt(await page.evaluate((i) => window.__foes[i].zone.x, vg), 'veu-tentaculos');
  check(/Tentáculos/.test(m.hint || ''), `Véu: mira os Tentáculos (${m.hint})`);
  await waitGame(0.35);
  await shot('veu-tentaculos');
  await waitGame(0.6);
  const vh1 = (await foe(vg)).hp;
  check(vh1 < vh0 - 1, `Véu: os tentáculos saem do chão e acertam (${vh0} -> ${vh1})`);
  // Mergulho: some no chão e sai na mira batendo para cima
  await page.evaluate(() => { window.__scene.magic.cd = 0; });
  const px0 = await page.evaluate(() => window.__scene.player.x);
  const dest = px0 + 120;
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  for (let k = 0; k < 2 && !/Mergulho/.test((await M()).hint || ''); k++) await press('KeyS');
  await aimAt(dest);
  await waitGame(0.05);
  m = await M();
  check(/Mergulho/.test(m.hint || ''), `Véu: baixo troca para o Mergulho (${m.hint})`);
  await press('KeyJ');
  await waitGame(0.12);
  const mid = await page.evaluate(() => ({ diving: window.__scene.player.diving, vis: window.__scene.player.sprite.visible }));
  await shot('veu-mergulho');
  await waitGame(0.6);
  const px1 = await page.evaluate(() => ({ x: window.__scene.player.x, diving: window.__scene.player.diving, vis: window.__scene.player.sprite.visible }));
  check(mid.diving && !mid.vis, 'Véu: no Mergulho ele some no chão');
  check(!px1.diving && px1.vis && Math.abs(px1.x - dest) < 10, `Véu: e sai na mira (${Math.round(px0)} -> ${Math.round(px1.x)}, mira ${Math.round(dest)})`);

  // ----- Espaço -----
  await setup('espaco');
  await place(20 * 16);
  f = await spawn('c', 40, true);
  await waitGame(0.4);
  const e0 = await foe(f);
  await press('KeyJ');
  await waitGame(0.12);
  await shot('espaco-pulso');
  await waitGame(0.3);
  const e1 = await foe(f);
  check(e1.hp < e0.hp && (e1.x > e0.x + 4 || !e1.alive), `Espaço: o pulso machuca e empurra (${e0.x} -> ${e1.x}, vida ${e0.hp} -> ${e1.hp})`);
  const tg = await spawn('g', 110, true);
  await waitGame(0.5);
  const t0 = await foe(tg);
  m = await castAt(t0.x, 'espaco-torre');
  check(/Dobra: Torre/.test(m.hint || ''), `Espaço: mira a Torre (${m.hint})`);
  await waitGame(0.3);
  const up = await foe(tg);
  await shot('espaco-torre');
  check(up.y < t0.y - 20, `Espaço: a torre joga o guarda para o alto (${t0.y} -> ${up.y})`);
  await waitGame(2.4);
  const t1 = await foe(tg);
  check(t1.hp < t0.hp - 2 || !t1.alive, `Espaço: a queda machuca muito (${t0.hp} -> ${t1.hp})`);
  m = await M();
  check(m.cdMax === 18 && m.cd > 0, `Espaço: a Torre tem a recarga mais longa (${m.cdMax} s)`);
  // parede que protege: segura o tiro que vinha (sem inimigo perto, para o dano só poder vir da flecha)
  await clearFoes();
  await waitGame(0.6);
  await page.evaluate(() => { window.__scene.magic.cd = 0; });
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  for (let k = 0; k < 3 && !/protege/.test((await M()).hint || ''); k++) await press('KeyS');
  const wallX = await page.evaluate(() => window.__scene.player.x + 50);
  await aimAt(wallX);
  await press('KeyJ');
  await waitGame(0.3);
  m = await M();
  check(m.walls === 1, 'Espaço: a parede que protege sobe');
  const hp0 = await page.evaluate(() => { const p = window.__scene.player; p.invuln = 0; return p.hp; });
  await page.evaluate((wx) => {
    const s = window.__scene;
    const p = s.player;
    s.spawnEnemyArrow(wx + 120, p.body.center.y, -1, 0);
  }, wallX);
  await waitGame(0.5);
  await shot('espaco-parede');
  const hp1 = await page.evaluate(() => { const p = window.__scene.player; const h = p.hp; p.invuln = 1e9; return h; });
  const live = await page.evaluate(() => window.__scene.arrows.filter((a) => a.hostile && !a.dead && !a.stuck).length);
  check(hp1 === hp0 && live === 0, `Espaço: a parede segura a flecha (vida ${hp0} -> ${hp1}, flechas no ar ${live})`);
  // parede que empurra
  await page.evaluate(() => { window.__scene.magic.cd = 0; });
  const pc = await spawn('c', 100, true);
  await waitGame(0.4);
  const pc0 = await foe(pc);
  await press('KeyI');
  await until(() => window.__scene.magic.aiming, null, 5000).catch(() => {});
  for (let k = 0; k < 3 && !/empurra/.test((await M()).hint || ''); k++) await press('KeyS');
  m = await M();
  check(/empurra/.test(m.hint || ''), `Espaço: a terceira versão (${m.hint})`);
  await aimAt(await page.evaluate(() => window.__scene.player.x + 40));
  await press('KeyJ');
  await waitGame(0.5);
  await shot('espaco-empurra');
  await waitGame(0.4);
  const pc1 = await foe(pc);
  check(!pc1.alive || pc1.x > pc0.x + 20, `Espaço: a parede anda e joga o penitente longe (${pc0.x} -> ${pc1.x})`);

  // ---------- Energia do chefe ----------
  const en0 = await page.evaluate(() => ({ e: window.__progress.energy, dmg: window.__progress.dmgFor('espaco'), cd: window.__progress.skillCdMul }));
  await page.evaluate(() => {
    const s = window.__scene;
    const p = s.player;
    s.dropWeapon('badalo', p.x + 30, p.body.bottom, false);
  });
  await waitGame(0.1);
  const drop = await page.evaluate(() => { const d = window.__scene.weaponDrop; return d ? d.sprite.texture.key : null; });
  check(drop === 'mage-energy', `o chefe deixa Energia no lugar da arma (${drop})`);
  await page.evaluate(() => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(p.x + 30, p.body.bottom);
  });
  await page.evaluate(() => {
    window.__banners = [];
    const ui = window.__ui;
    const ob = ui.banner.bind(ui);
    ui.banner = (a, b, h) => { window.__banners.push(a + ' | ' + b); return ob(a, b, h); };
  });
  await waitGame(1.6);
  await shot('energia');
  const en1 = await page.evaluate(() => ({ e: window.__progress.energy, dmg: window.__progress.dmgFor('espaco'), cd: window.__progress.skillCdMul, banners: window.__banners, hud: window.__scene.registry.get('skill').energy, knight: window.__progress.hasWeapon('badalo') }));
  console.log('energia:', JSON.stringify(en0), '->', JSON.stringify(en1));
  check(en1.e === en0.e + 1 && en1.dmg > en0.dmg && en1.cd < en0.cd && en1.hud === en1.e, 'pegar a Energia fortalece a magia (dano maior, recarga menor, pontinho no HUD)');
  check(en1.banners.some((b) => /Energia do Sineiro/.test(b)) && !en1.knight, 'a faixa diz Energia do Sineiro e o Badalo não vira arma do mago');
  await waitGame(3);

  // ---------- pausa, inventário e ferreiro ----------
  await page.evaluate(() => window.__scene.openPause());
  await page.waitForSelector('#screen-pause.show', { timeout: 10000 });
  check(await page.evaluate(() => document.querySelector('#screen-pause [data-cmd="weapon"]').hidden), 'o mago não tem Trocar arma na pausa');
  await page.click('#screen-pause [data-cmd="inventory"]');
  await page.waitForSelector('#screen-inventory.show', { timeout: 10000 });
  const inv = await page.evaluate(() => ({ head: document.querySelector('.inv-weapons-head').textContent, items: [...document.querySelectorAll('.inv-weapons li')].map((l) => l.textContent.trim()) }));
  console.log('inventário:', inv.head, '/', inv.items.join(' | '));
  check(/Cajado e Energia/.test(inv.head) && /Cajado da Dobra.*em uso/.test(inv.items[0]) && inv.items.some((t) => /Energia do Sineiro/.test(t)) && inv.items.filter((t) => /Energia trancada/.test(t)).length === 3, 'o inventário mostra o cajado e a Energia de cada chefe');
  await page.screenshot({ path: `${OUT}/inventario.png` });
  await page.evaluate(() => { window.__ui.closeAll(); window.__scene.scene.resume?.(); });
  await page.evaluate(() => {
    window.__progress.coins = 999;
    window.__ui.forge({ first: false, quote: 'teste', upgrade: () => false, onClose: () => window.__ui.closeAll() });
  });
  await page.waitForSelector('#screen-forge.show', { timeout: 5000 });
  const forge = await page.evaluate(() => [...document.querySelectorAll('#screen-forge .forge-row b')].map((b) => b.textContent));
  check(forge.join(',') === 'Cajado da Dobra', `o ferreiro melhora o cajado (${forge.join(', ')})`);
  await page.evaluate(() => window.__ui.closeAll());

  // ---------- Continuar com o cajado ----------
  await page.evaluate(() => window.__progress.save());
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 60000 });
  await page.click('#screen-menu [data-cmd="continue"]');
  await until(() => window.__scene && window.__scene.player && window.__scene.clock > 0.5, null, 60000);
  const cont = await page.evaluate(() => ({ w: window.__scene.player.weapon.id, magic: !!window.__scene.magic, mage: window.__progress.mage, e: window.__progress.energy }));
  check(cont.w === 'espaco' && cont.magic && cont.mage === 'espaco' && cont.e === 1, `Continuar volta com o cajado e a Energia (${JSON.stringify(cont)})`);

  // ---------- e o Cavaleiro continua sem nada disso ----------
  await page.evaluate(() => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.starter = 'scythe';
    window.__settings.data.weapon = 'scythe';
    p.save();
    window.__oldPlayer = window.__scene.player;
    window.__scene.scene.restart({ room: 'ponte', entry: 'P', from: 'continue' });
  });
  await until(() => window.__scene && window.__scene.player && window.__scene.player !== window.__oldPlayer && window.__scene.clock > 0.3, null, 60000);
  m = await M();
  check(!m.cls && m.hud === null && /oculto/.test(m.icon || 'oculto') && (await page.evaluate(() => window.__scene.magic === null)), 'o Cavaleiro não tem magia, ícone nem botão de mago');

  console.log(errs.slice(0, 8).join('\n') || 'sem erros');
  check(!errs.length, 'sem erros no navegador');
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
