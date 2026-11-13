// Teste de rota: joga de verdade um caminho achado pela varredura de alcance (alcance.cjs) e mede o tempo.
// Cada trecho é o movimento que a varredura usou entre dois pontos de apoio, repetido com a física do jogo;
// num ponto pode haver um golpe (acender runa, quebrar vitral). Serve para provar que um lugar corrigido
// se alcança jogando e quanto tempo leva (as runas do pátio têm relógio).
//
// uso: node rota.cjs <sala> <grafo.json> "<tx>,<ty>[:golpe=<esq|dir>[x<n>]];..."
//   o primeiro ponto é onde o cavaleiro começa; tx,ty é a célula em que ele fica de pé
//   GAME, HAND, HUMAN, OPEN como no alcance.cjs (tem que ser os mesmos do grafo); TOL px (padrão 22)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOM = process.argv[2];
const G = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const PLAN = (process.argv[4] || '').split(';').filter(Boolean).map((s) => {
  const [pos, ...acts] = s.split(':');
  const [tx, ty] = pos.split(',').map(Number);
  const act = acts.map((a) => { const m = /^golpe=(esq|dir)(?:x(\d+))?$/.exec(a); if (!m) throw new Error('ação desconhecida ' + a); return { dir: m[1] === 'esq' ? -1 : 1, n: Number(m[2] || 1) }; });
  return { tx, ty, act };
});
const GAME = process.env.GAME || 'http://localhost:8765';
const TOL = Number(process.env.TOL || 22);
const log = (...a) => console.log(...a);

const nodes = new Map(G.nodes.map((n) => [n.k, n]));
const M = G.info.macros;
// Dijkstra pelos quadros de cada movimento
function paths(from) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const open = new Set([from]);
  while (open.size) {
    let k = null, best = Infinity;
    for (const q of open) if (dist.get(q) < best) { best = dist.get(q); k = q; }
    open.delete(k);
    for (const [k2, mi, fr] of nodes.get(k).edges) {
      if (!nodes.has(k2)) continue;
      const d = best + (fr || 60);
      if (d < (dist.get(k2) ?? Infinity)) { dist.set(k2, d); prev.set(k2, [k, mi, fr]); open.add(k2); }
    }
  }
  return { dist, prev };
}
const near = (w) => G.nodes.filter((n) => !n.w && !n.c && Math.abs(n.f - (w.ty + 1) * 16) <= 2 && Math.abs(n.x - (w.tx * 16 + 8)) <= TOL).map((n) => n.k);

(async () => {
  // o caminho no grafo
  const startC = near(PLAN[0]);
  if (!startC.length) throw new Error('sem ponto de apoio no começo');
  let cur = startC.sort((a, b) => Math.abs(nodes.get(a).x - (PLAN[0].tx * 16 + 8)) - Math.abs(nodes.get(b).x - (PLAN[0].tx * 16 + 8)))[0];
  const legs = [];
  for (const w of PLAN.slice(1)) {
    const { dist, prev } = paths(cur);
    const cands = near(w).filter((k) => dist.has(k)).sort((a, b) => dist.get(a) - dist.get(b));
    if (!cands.length) throw new Error(`ponto ${w.tx},${w.ty} fora de alcance a partir de ${cur}`);
    const goal = cands[0];
    const steps = [];
    for (let k = goal; k !== cur;) { const [pk, mi, fr] = prev.get(k); steps.unshift({ from: pk, to: k, m: M[mi], fr }); k = pk; }
    legs.push({ w, steps, est: dist.get(goal) });
    cur = goal;
  }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('ERR ' + e.message));
  await page.goto(`${GAME}/index.html?res=1&gfx=performance`);
  await page.waitForSelector('#screen-menu.show', { timeout: 120000 });
  await page.addScriptTag({ path: path.join(__dirname, 'alcance-page.js') });
  if (G.hand !== 1) await page.evaluate((k) => { const C = window.__cfg; for (const key of ['jumpVel', 'doubleJumpVel', 'wallJumpVy', 'lightVel', 'dashSpeed', 'hookRange', 'hookPop']) C[key] *= k; }, G.hand);
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
  }, [ROOM, G.ab]);
  await page.waitForFunction((room) => { const s = window.__scene; return s && s.player && s.room.id === room && s.scene.isActive() && !s.transitioning; }, ROOM, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate((o) => window.__al.prepare(o), { open: process.env.OPEN === '1', human: G.human, amber: true });
  const key = (r) => `${Math.floor(r.x / 16)}:${Math.round(r.f / 16)}:${r.c ? 1 : 0}${r.w ? 'w' : ''}`;
  let frames = 0;
  let ok = true;
  const act = async (w) => {
    for (const a of w.act) for (let i = 0; i < a.n; i++) {
      frames += await page.evaluate(([d]) => window.__al.golpe(d), [a.dir]);
      const st = await page.evaluate(() => window.__al.estado());
      log(`   golpe ${a.dir < 0 ? 'esq' : 'dir'} em ${w.tx},${w.ty}  t=${(frames / 60).toFixed(2)}s  runas=${JSON.stringify(st.runas.map((r) => r.t))} paredes=${st.paredes}`);
    }
  };
  // começa no primeiro ponto (o relógio começa no primeiro golpe)
  const n0 = nodes.get(legs.length ? legs[0].steps[0]?.from ?? cur : cur);
  await page.evaluate(([n]) => window.__al.one(n, 'parado'), [n0]);
  await act(PLAN[0]);
  for (const leg of legs) {
    for (const st of leg.steps) {
      const r = await page.evaluate(([n, m]) => window.__al.one(n, m), [nodes.get(st.from), st.m]);
      frames += r.frames;
      if (r.fail || key(r) !== st.to) { log(`   DESVIO em ${st.from} ${st.m}: parou em ${key(r)} (${r.fail || 'sem falha'}), esperado ${st.to}`); ok = false; break; }
    }
    if (!ok) break;
    log(`chegou em ${leg.w.tx},${leg.w.ty} com ${leg.steps.length} movimentos (${leg.steps.map((s) => s.m).join(' > ')})  t=${(frames / 60).toFixed(2)}s`);
    await act(leg.w);
  }
  const fim = await page.evaluate(() => window.__al.estado());
  log(JSON.stringify({ ok, segundos: Math.round(frames / 6) / 10, runas: fim.runas.map((r) => r.t), paredes: fim.paredes, seen: fim.seen, x: fim.x, f: fim.f }));
  if (errs.length) log([...new Set(errs)].join('\n'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
