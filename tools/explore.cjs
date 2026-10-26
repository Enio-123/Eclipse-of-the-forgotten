// Explora cada sala com a física real do jogo e confere se dá para chegar ao objetivo.
// Para cada ponto onde o cavaleiro consegue ficar de pé, testa andar, pular, pulo curto,
// dash no chão e no ar, agachar, deslizar e descer de plataformas. Depois verifica se de
// todo lugar alcançável ainda dá para chegar ao objetivo (ninguém fica preso).
//
// uso: node explore.cjs <url> <pasta-saida> [sala:entrada:objetivo ...]
const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const OUT = process.argv[3] || '.';
const JOBS = (process.argv.slice(4).length ? process.argv.slice(4) : [
  'ponte:P:exit-right', 'ponte:2:any', 'catacumbas:1:mirror', 'catacumbas:2:exit-left', 'memoria:1:figure',
  'nichos:1:exit-right', 'nichos:2:exit-left', 'mercado:1:exit-right', 'mercado:2:exit-left', 'mercado:1:r1',
]).map((j) => { const [room, entry, goal] = j.split(':'); return { room, entry, goal }; });

// cada macro: teclas com quadro inicial e final (60 quadros = 1 s)
const L = 'KeyA', R = 'KeyD', J = 'Space', F = 'KeyF', CR = 'ControlLeft', DN = 'KeyS';
const macros = [];
for (const [d, n] of [[L, 'esq'], [R, 'dir']]) {
  macros.push({ name: `andar-${n}`, keys: [[d, 0, 24]] });
  macros.push({ name: `pulo-${n}`, keys: [[J, 0, 40], [d, 0, 90]] });
  macros.push({ name: `pulo-curto-${n}`, keys: [[J, 0, 5], [d, 0, 90]] });
  macros.push({ name: `pulo-medio-${n}`, keys: [[J, 0, 12], [d, 0, 90]] });
  macros.push({ name: `pulo-pouco-lado-${n}`, keys: [[J, 0, 40], [d, 0, 9]] });
  macros.push({ name: `pulo-depois-lado-${n}`, keys: [[J, 0, 40], [d, 14, 90]] });
  macros.push({ name: `pulo-dash-${n}`, keys: [[J, 0, 40], [d, 0, 90], [F, 20, 22]] });
  macros.push({ name: `pulo-dash-tarde-${n}`, keys: [[J, 0, 40], [d, 0, 90], [F, 34, 36]] });
  macros.push({ name: `dash-${n}`, keys: [[d, 0, 14], [F, 1, 3]] });
  macros.push({ name: `agachado-${n}`, keys: [[CR, 0, 50], [d, 2, 50]] });
  macros.push({ name: `deslizar-${n}`, keys: [[CR, 0, 60], [d, 2, 60], [F, 4, 6]] });
  // pulo duplo e pulo na parede (só valem com a habilidade; sem ela o segundo toque não faz nada)
  macros.push({ name: `pulo-duplo-${n}`, keys: [[J, 0, 22], [d, 0, 90], [J, 30, 52]] });
  macros.push({ name: `pulo-duplo-tarde-${n}`, keys: [[J, 0, 22], [d, 0, 90], [J, 46, 68]] });
  macros.push({ name: `pulo-parede-${n}`, keys: [[d, 0, 90], [J, 0, 22], [J, 34, 56]] });
}
macros.push({ name: 'pulo-reto', keys: [[J, 0, 40]] });
macros.push({ name: 'pulo-duplo-reto', keys: [[J, 0, 22], [J, 30, 52]] });
macros.push({ name: 'descer', keys: [[DN, 0, 10], [J, 2, 4]] });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto(URL);
  await page.waitForSelector('#screen-menu.show', { timeout: 30000 });
  const report = [];

  for (const job of JOBS) {
    const t0 = Date.now();
    await page.evaluate(([room, entry, ab]) => {
      const g = window.__game;
      if (window.__ex) window.__ex.stop();
      window.__ui.closeAll();
      // EXPLORE_AB=wall,double: explora com essas habilidades
      if (ab) window.__progress.abilities = new Set(ab.split(','));
      const t = g.scene.getScene('title');
      if (t && t.scene.isActive()) t.scene.stop();
      g.loop.wake();
      g.scene.start('game', { room, entry, from: 'continue' });
    }, [job.room, job.entry, process.env.EXPLORE_AB || '']);
    await page.waitForFunction((room) => { const s = window.__scene; return s && s.player && s.room.id === room && s.scene.isActive() && !s.cinematic; }, job.room, { timeout: 20000 });
    await page.waitForTimeout(300);

    // prepara a sala para o teste: sem inimigos, sem dano, passo a passo
    const info = await page.evaluate(() => {
      const g = window.__game;
      const s = window.__scene;
      g.loop.sleep();
      let t = performance.now();
      const keys = new Set();
      const press = (code) => { if (!keys.has(code)) { keys.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code })); } };
      const release = (code) => { if (keys.has(code)) { keys.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code })); } };
      const releaseAll = () => { for (const k of [...keys]) release(k); };
      const step = () => { t += 1000 / 60; g.headlessStep(t, 1000 / 60); };
      for (const e of s.enemies) { if (e.body) e.body.enable = false; if (e.sprite) e.sprite.setVisible(false); }
      s.enemies = [];
      s.hazards = () => {};
      s.exits = () => {};
      s.story = () => {};
      s.follow = () => {};
      s.backdrop.update = () => {};
      s.decor.update = () => {};
      s.weather.update = () => {};
      const p = s.player;
      p.hurt = () => false;
      const lv = s.level;
      const W = lv.widthPx;
      const exits = s.room.exits.map((e) => e.side);
      const fig = s.figure;
      const mirror = s.decor.mirror;
      // os registros da sala (objetivo r0, r1...: chegar em pé na frente do registro n)
      const recs = lv.spawns.filter((q) => q.kind === 'r').sort((a, b) => a.x - b.x);  // a mesma ordem do Records.ts
      const reset = (x, feet, crouched) => {
        releaseAll();
        step();
        p.frozen = false; p.pose = null; p.dead = false;
        s.cinematic = false; s.transitioning = false; s.respawning = false; s.hitstopT = 0;
        p.dashT = 0; p.dashCd = 0; p.slideT = 0; p.airDash = true; p.buffer = 0; p.coyote = 0; p.jumping = false;
        p.hurtT = 0; p.recoilT = 0; p.atkCd = 0; p.atkAnimT = 0; p.windupT = 0; p.atkT = 0; p.moveTarget = null; p.dropT = 0;
        p.body.setAllowGravity(true);
        p.crouched = !!crouched;
        p.updateCrouchBody(true);
        p.teleport(x, feet);
        p.body.setVelocity(0, 0);
        for (let i = 0; i < 4; i++) step();
      };
      const run = (x, feet, crouched, m) => {
        reset(x, feet, crouched);
        const b = p.body;
        const goals = new Set();
        let fail = null, still = 0, f = 0, left = false;
        const startFeet = b.bottom;
        for (f = 0; f < 260; f++) {
          for (const [code, a, z] of m.keys) {
            if (f === a) press(code);
            if (f === z) release(code);
          }
          step();
          if (lv.touchesSpikes(b.x + 1, b.y, b.width - 2, b.height)) { fail = 'espinho'; break; }
          if (s.room.pit && b.top > lv.heightPx + 8) { fail = 'abismo'; break; }
          if (exits.includes('right') && b.center.x > W + 2) { goals.add('exit-right'); break; }
          if (exits.includes('left') && b.center.x < -2) { goals.add('exit-left'); break; }
          if (fig && Math.abs(fig.x - p.x) < 46) goals.add('figure');
          if (mirror && Math.abs(p.x - mirror.x) < 30 && Math.abs(b.bottom - mirror.y) < 10 && b.blocked.down) goals.add('mirror');
          recs.forEach((r, i) => { if (b.blocked.down && Math.abs(p.x - r.x) < 20 && Math.abs(b.bottom - r.y) < 6) goals.add('r' + i); });
          if (!b.blocked.down || Math.abs(b.bottom - startFeet) > 0.5) left = true;
          const lastKey = Math.max(...m.keys.map((k) => k[2]));
          if (f > lastKey && b.blocked.down && Math.abs(b.velocity.x) < 2 && Math.abs(b.velocity.y) < 2) { if (++still >= 3) break; } else still = 0;
        }
        releaseAll();
        return { x: Math.round(p.x * 10) / 10, feet: Math.round(b.bottom * 10) / 10, crouched: p.crouched || p.slideT > 0, ground: b.blocked.down, fail, goals: [...goals], frames: f, moved: left || Math.abs(p.x - x) > 1 };
      };
      const spawn = { x: p.x, feet: p.body.bottom };
      window.__ex = { run, reset, stop: () => { releaseAll(); g.loop.wake(); }, step };
      return { spawn, W, H: lv.heightPx, w: lv.w, h: lv.h, exits, rows: lv.grid, mirror: mirror ? { x: mirror.x, y: mirror.y } : null, figure: fig ? { x: fig.x } : null };
    });

    // BFS sobre os pontos de apoio (quantizados por tile)
    const key = (r) => `${Math.floor(r.x / 16)}:${Math.round(r.feet / 16)}:${r.crouched ? 1 : 0}`;
    const nodes = new Map();
    const startNode = { x: info.spawn.x, feet: info.spawn.feet, crouched: false };
    const start = key(startNode);
    nodes.set(start, { ...startNode, edges: [], goals: new Set(), fails: 0 });
    const queue = [start];
    let trials = 0;
    while (queue.length) {
      const batch = queue.splice(0, 6);
      const res = await page.evaluate(([list, macros]) => list.map(([k, n]) => [k, macros.map((m) => window.__ex.run(n.x, n.feet, n.crouched, m))]), [batch.map((k) => [k, nodes.get(k)]), macros]);
      for (const [k, results] of res) {
        const n = nodes.get(k);
        results.forEach((r, i) => {
          trials++;
          for (const g of r.goals) n.goals.add(g);
          if (r.fail) { n.fails++; return; }
          // saiu da sala: é um objetivo, não um lugar onde ficar
          if (r.goals.some((g) => g.startsWith('exit-'))) return;
          if (!r.ground) return;
          const k2 = key(r);
          if (k2 === k) return;
          if (!nodes.has(k2)) {
            nodes.set(k2, { x: r.x, feet: r.feet, crouched: r.crouched, edges: [], goals: new Set(), fails: 0 });
            queue.push(k2);
          }
          n.edges.push([k2, macros[i].name]);
        });
      }
    }

    // quem consegue chegar ao objetivo? (busca reversa)
    const goalOf = (n) => (job.goal === 'any' ? true : n.goals.has(job.goal));
    const canReach = new Set([...nodes].filter(([, n]) => goalOf(n)).map(([k]) => k));
    let changed = true;
    while (changed) {
      changed = false;
      for (const [k, n] of nodes) {
        if (canReach.has(k)) continue;
        if (n.edges.some(([k2]) => canReach.has(k2))) { canReach.add(k); changed = true; }
      }
    }
    const reached = job.goal === 'any' ? true : [...nodes.values()].some((n) => n.goals.has(job.goal));
    const stuck = [...nodes].filter(([k]) => !canReach.has(k)).map(([k, n]) => ({ k, x: Math.round(n.x), feet: Math.round(n.feet), crouched: n.crouched }));
    const goalsSeen = new Set();
    for (const n of nodes.values()) for (const g of n.goals) goalsSeen.add(g);
    const r = { job: `${job.room}:${job.entry}:${job.goal}`, nodes: nodes.size, trials, reached, goals: [...goalsSeen], stuck, secs: Math.round((Date.now() - t0) / 1000) };
    report.push(r);
    console.log(`${r.job}  pontos=${r.nodes} tentativas=${r.trials} objetivo=${r.reached ? 'ALCANÇADO' : 'NÃO ALCANÇADO'} objetivos-vistos=${r.goals.join(',') || '-'} presos=${r.stuck.length} (${r.secs}s)`);
    if (stuck.length) console.log('   presos:', stuck.slice(0, 40).map((s) => `${Math.floor(s.x / 16)},${Math.round(s.feet / 16)}${s.crouched ? 'c' : ''}`).join(' '));
    fs.writeFileSync(`${OUT}/explore-${job.room}-${job.entry}.json`, JSON.stringify({ info: { ...info, rows: undefined }, rows: info.rows, nodes: [...nodes].map(([k, n]) => ({ k, x: n.x, feet: n.feet, crouched: n.crouched, goals: [...n.goals], edges: n.edges, ok: canReach.has(k) })) }));
    await page.evaluate(() => window.__ex.stop());
  }
  console.log(errs.join('\n') || 'sem erros');
  fs.writeFileSync(`${OUT}/explore-report.json`, JSON.stringify(report, null, 1));
  await browser.close();
})();
