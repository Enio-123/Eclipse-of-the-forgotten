// Varredura de alcance: em cada sala, parte de todas as entradas e portas e joga todos os movimentos que o
// cavaleiro tem (alcance-page.js) de cada ponto de apoio achado, até não achar ponto novo. Guarda os pontos,
// os caminhos entre eles, o chão pisado e os objetos tocados; analisa.py lê e mostra o que ficou de fora.
//
// uso: node alcance.cjs <pasta-saida> <sala[,sala...]>
//   GAME   endereço do jogo (padrão http://localhost:8765)
//   AB     habilidades, separadas por vírgula (dash,wall,double,hook,veil,cape,swim,light) ou "nada"
//   TAG    nome do passe (entra no nome do arquivo: <sala>.<TAG>.json)
//   OPEN   0 deixa grades, trancas, alçapões e paredes falsas como na primeira visita (padrão: tudo aberto)
//   AMBER  0 deixa os blocos de Âmbar das Minas de pé (só a Picareta quebra)
//   HUMAN  1: sem o pulo do último instante na beira; HAND=0.96 encurta pulo, dash e gancho por esse fator
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || 'alcance');
const ROOMS = (process.argv[3] || '').split(',').filter(Boolean);
const GAME = process.env.GAME || 'http://localhost:8765';
const AB = process.env.AB === 'nada' ? [] : (process.env.AB || 'dash,wall,double,hook,veil,cape,swim,light').split(',').filter(Boolean);
const TAG = process.env.TAG || 'tudo';
const OPEN = process.env.OPEN !== '0';
const HUMAN = process.env.HUMAN === '1';
const HAND = Number(process.env.HAND || 1);
const BATCH = 4;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.goto(`${GAME}/index.html?res=1&gfx=performance`);
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  await page.addScriptTag({ path: path.join(__dirname, 'alcance-page.js') });
  if (HAND !== 1) {
    await page.evaluate((k) => {
      const C = window.__cfg;
      for (const key of ['jumpVel', 'doubleJumpVel', 'wallJumpVy', 'lightVel', 'dashSpeed', 'hookRange', 'hookPop']) C[key] *= k;
    }, HAND);
  }
  for (const room of ROOMS) {
    const t0 = Date.now();
    await page.evaluate(([room, ab]) => {
      const g = window.__game;
      if (window.__al && window.__scene) window.__al.stop();
      window.__ui.closeAll();
      const p = window.__progress;
      p.reset();
      p.prologueDone = true;
      p.kintsugi = 1;
      p.abilities = new Set(ab);
      // o vento das rajadas vai e volta (o jogador espera a calmaria): a varredura roda sem ele
      const def = window.__rooms[room];
      if (def.gusts) def.gusts = [];
      window.__oldPlayer = window.__scene && window.__scene.player;
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.loop.wake();
      const entry = [...new Set(def.map.join('').split('').filter((c) => /[0-9P]/.test(c)))].sort()[0] || 'O0';
      const gs = g.scene.getScene('game');
      if (gs && gs.scene.isActive()) gs.scene.restart({ room, entry, from: 'door' });
      else g.scene.start('game', { room, entry, from: 'door' });
    }, [room, AB]);
    await page.waitForFunction((room) => { const s = window.__scene; return s && s.player && s.player !== window.__oldPlayer && s.room.id === room && s.scene.isActive() && !s.transitioning; }, room, { timeout: 60000 });
    await page.waitForTimeout(500);
    const info = await page.evaluate((o) => window.__al.prepare(o), { open: OPEN, human: HUMAN, amber: process.env.AMBER !== '0' });
    const M = info.macros;

    const key = (r) => `${Math.floor(r.x / 16)}:${Math.round(r.f / 16)}:${r.c ? 1 : 0}${r.w ? 'w' : ''}`;
    const nodes = new Map();
    const queue = [];
    const touched = new Set();
    const trod = new Set();
    const fails = {};
    const use = {};
    let trials = 0;
    const addNode = (r, seed) => {
      const k = key(r);
      if (!nodes.has(k)) {
        nodes.set(k, { x: r.x, f: r.f, c: r.c ? 1 : 0, w: r.w ? 1 : 0, edges: [], goals: new Set(), seeds: [] });
        queue.push(k);
      }
      if (seed) nodes.get(k).seeds.push(seed);
      return k;
    };
    // as sementes: cada entrada numerada, o ponto de acordar e cada porta; o cavaleiro assenta e vira ponto
    const seeds = [];
    for (const q of info.spawns) if (/[0-9P]/.test(q.kind)) seeds.push({ id: q.kind, x: q.x, f: q.y });
    for (const d of info.doors) seeds.push({ id: 'O' + d.i, x: d.x, f: d.y });
    for (const sd of seeds) {
      const r = await page.evaluate(([n]) => window.__al.one(n, 'parado'), [{ x: sd.x, f: sd.f, c: 0, w: 0 }]);
      if (r && !r.fail && (r.g || r.w) && !r.under) addNode(r, sd.id);
      else log(room, `semente ${sd.id} não assentou`, JSON.stringify(r && { fail: r.fail, g: r.g, x: r.x, f: r.f }));
    }
    while (queue.length) {
      const batch = queue.splice(0, BATCH);
      const res = await page.evaluate((list) => window.__al.batch(list), batch.map((k) => nodes.get(k)));
      res.forEach((results, bi) => {
        const k = batch[bi];
        const n = nodes.get(k);
        results.forEach((r, i) => {
          if (!r) return;
          trials++;
          for (const q of r.touched) touched.add(q);
          for (const c of r.trod) trod.add(c);
          for (const g of r.goals) n.goals.add(g);
          if (r.fail) { fails[r.fail] = (fails[r.fail] || 0) + 1; return; }
          if (r.goals.some((g) => g.startsWith('exit:'))) return;
          if (r.under) return;
          if (!r.g && !r.w) return;
          const k2 = key(r);
          if (k2 === k) return;
          const isNew = !nodes.has(k2);
          addNode(r);
          n.edges.push([k2, i, r.frames]);
          if (isNew) use[M[i]] = (use[M[i]] || 0) + 1;
        });
      });
      if (nodes.size > 6000) { log(room, 'pontos demais, parando'); break; }
    }
    const goals = new Set();
    for (const n of nodes.values()) for (const g of n.goals) goals.add(g);
    const secs = Math.round((Date.now() - t0) / 1000);
    log(`${room} [${TAG}] pontos=${nodes.size} tentativas=${trials} chão=${trod.size} tocou=${touched.size}/${info.spawns.length} saídas=${[...goals].filter((g) => !g.startsWith('door')).join(',') || '-'} falhas=${JSON.stringify(fails)} (${secs}s)`);
    fs.writeFileSync(path.join(OUT, `${room}.${TAG}.json`), JSON.stringify({
      info, tag: TAG, ab: AB, open: OPEN, human: HUMAN, hand: HAND, secs, trials, fails, use,
      nodes: [...nodes].map(([k, n]) => ({ k, x: n.x, f: n.f, c: n.c, w: n.w, seeds: n.seeds, goals: [...n.goals], edges: n.edges })),
      touched: [...touched], trod: [...trod],
    }));
  }
  if (errs.length) log([...new Set(errs)].slice(0, 12).join('\n'));
  await browser.close();
})();
