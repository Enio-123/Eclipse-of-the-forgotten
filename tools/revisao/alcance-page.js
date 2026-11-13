// Parte da varredura de alcance que roda dentro do jogo (alcance.cjs carrega este arquivo na página).
// O cavaleiro é posto num ponto de apoio e joga um movimento de cada vez, passo a passo, com a física de
// verdade: teclas com quadro marcado (60 quadros = 1 s) ou um controlador que olha o estado dele (correr até
// a beira e pular no último instante, escalar a parede, ir de argola em argola, subir na corrente de ar,
// nadar). Cada tentativa devolve onde ele parou, o que tocou e por onde pisou.
(() => {
  const K = { L: 'KeyA', R: 'KeyD', J: 'Space', F: 'KeyF', C: 'KeyC', D: 'KeyS', U: 'KeyW', E: 'KeyE', A: 'KeyJ' };
  const A = {};
  let g, s, p, lv, b, t = 0, snow = false, info = null, macros = [], breathOut = false;
  const held = new Set();
  const press = (c) => { if (!held.has(c)) { held.add(c); window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); } };
  const release = (c) => { if (held.has(c)) { held.delete(c); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); } };
  // um toque novo no mesmo quadro (solta e aperta)
  const tap = (c) => { release(c); press(c); };
  const releaseAll = () => { for (const c of [...held]) release(c); };
  const step = () => { t += 1000 / 60; g.headlessStep(t, 1000 / 60); };
  const steer = (want) => {
    if (want > 0) { release(K.L); press(K.R); } else if (want < 0) { release(K.R); press(K.L); } else { release(K.L); release(K.R); }
  };
  // pousou depois de ter saído do chão: o controlador acabou
  const landed = (c) => {
    if (!b.blocked.down) { c.left = true; c.land = 0; return false; }
    if (!c.left) return false;
    c.land = (c.land || 0) + 1;
    return c.land > 2;
  };

  const CTL = {
    // corre até a beira e pula (delay quadros depois de perder o chão: o pulo do último instante); no alto do
    // pulo gasta o que tiver, na ordem: pulo duplo, voos da Capa de Luz, dash; glide segura o pulo e plana
    beira(f, m, c) {
      const d = m.dir > 0 ? K.R : K.L;
      if (f === 0) { press(d); c.ph = 0; c.t = 0; c.w = 0; }
      const onG = b.blocked.down;
      if (c.ph === 0) {
        const wall = m.dir > 0 ? b.blocked.right : b.blocked.left;
        if (!onG) { if (++c.t > m.delay) { press(K.J); c.ph = 1; c.t = 0; c.left = true; } }
        else if (wall) { if (++c.w > 3) { press(K.J); c.ph = 1; c.t = 0; } }
        else if (f > 220) return 'end';
        return;
      }
      c.t++;
      if (c.ds && c.t === 2) release(K.F);
      if (c.t > 5 && b.velocity.y > -25 && !onG && p.dashT <= 0) {
        if (m.double && !c.dj && p.airJumps > 0) { tap(K.J); c.dj = true; c.t = 0; }
        else if (m.fly && p.light > 0 && p.airJumps <= 0) { tap(K.J); c.t = 0; }
        else if (m.dash && !c.ds && p.airDash && p.dashCd <= 0) { tap(K.F); c.ds = true; c.t = 0; }
        else if (m.glide && !c.gl) { tap(K.J); c.gl = true; }
        else if (!m.glide && !c.rel && c.t > 30) { release(K.J); c.rel = true; }
      }
      if (landed(c)) { c.done = true; releaseAll(); }
    },

    // sobe uma parede só: pula, gruda no alto do pulo e vai de pulo de parede em pulo de parede voltando para
    // ela (com a Pena, o pulo duplo no meio ganha mais altura). out: no ciclo n ele pula para longe e segue
    // para o outro lado
    escalar(f, m, c) {
      const d = m.dir > 0 ? K.R : K.L;
      const o = m.dir > 0 ? K.L : K.R;
      if (f === 0) { press(d); press(K.J); c.cy = 0; c.cl = 0; c.jt = 0; c.out = false; }
      if (f === 18) release(K.J);
      if (c.done) return;
      if (landed(c)) { c.done = true; releaseAll(); return; }
      if (f > 40 && !c.left) return 'end';
      if (p.wallDir !== 0) {
        if (++c.cl >= 2) {
          c.cy++; c.cl = 0; c.dj = false; c.jt = f;
          if (m.out && c.cy >= m.out) { c.out = true; release(d); press(o); }
          tap(K.J);
        }
      } else {
        c.cl = 0;
        if (m.dj && !c.dj && c.cy > 0 && f - c.jt > 8 && b.velocity.y > -30 && p.airJumps > 0) { tap(K.J); c.dj = true; }
      }
    },

    // Gancho de Corrente: lança na argola que estiver ao alcance (pre: pula antes e lança no alto), jumpAt:
    // pula no meio da puxada, dj: pulo duplo depois de soltar, again: emenda na próxima argola (sem segurar
    // lado nenhum enquanto houver argola: a fila delas faz curva; o lado só entra depois da última)
    gancho(f, m, c) {
      const d = m.dir > 0 ? K.R : m.dir < 0 ? K.L : null;
      if (f === 0) {
        c.ph = m.pre ? -1 : 0; c.t = 0; c.n = 0;
        if (m.pre) { press(K.J); if (d && !m.again) press(d); }
        if (m.hold && d) press(d);
      }
      const onG = b.blocked.down;
      if (c.done) return;
      if (c.ph === -1) {
        if (f >= 3 && b.velocity.y > -60) { c.ph = 0; c.left = true; }
        else if (f > 60) return 'end';
        else return;
      }
      if (c.ph === 0) {
        const tg = s.hookTarget(p);
        if (!tg) { if (!m.pre || ++c.t > 24) return 'end'; return; }
        if (p.hookCd > 0 || (p.hook && p.hook.phase !== 'back')) return;
        (c.used = c.used || []).push(tg);
        tap(K.E); c.ph = 1; c.t = 0; c.pulled = false; c.j = false;
        return;
      }
      if (c.ph === 1) {
        c.t++;
        if (c.t === 3) release(K.E);
        const h = p.hook;
        if (h && h.phase === 'pull') {
          c.pulled = true;
          if (m.jumpAt != null && !c.j && Math.round(h.t * 60) >= m.jumpAt) { tap(K.J); c.j = true; }
        } else if (c.pulled || c.t > 40) { c.ph = 2; c.t = 0; c.n++; c.dj = false; c.left = true; if (d && !m.again) press(d); }
        return;
      }
      c.t++;
      // emenda só em argola nova: quem sobe de argola em argola não volta para a que já usou
      const nx = m.again && c.n < 12 && c.t > (m.wait || 2) && !onG ? s.hookTarget(p) : null;
      if (nx && !(c.used || []).includes(nx)) { c.ph = 0; c.t = 0; return; }
      // a última argola ficou para trás: agora sim vai para o lado
      if (m.again && d && c.t > (m.late || 4) && !held.has(d)) press(d);
      if (m.dj && !c.dj && c.t > 3 && b.velocity.y > -30 && p.airJumps > 0 && !onG) { tap(K.J); c.dj = true; }
      if (landed(c)) { c.done = true; releaseAll(); }
    },

    // corrente de ar (com a capa): entra nela planando, sobe até a linha alvo e sai para o lado
    corrente(f, m, c) {
      if (f === 0) { press(K.J); c.ph = 0; }
      if (c.done) return;
      const onG = b.blocked.down;
      const dx = m.cx - p.x;
      if (c.ph === 0) {
        steer(Math.abs(dx) > 6 ? Math.sign(dx) : 0);
        if (f > 4 && b.velocity.y > -40 && !onG) { tap(K.J); c.ph = 1; c.left = true; }
        else if (f > 50) return 'end';
        return;
      }
      if (c.ph === 1) {
        steer(Math.abs(dx) > 6 ? Math.sign(dx) : 0);
        if (b.bottom < m.top) c.ph = 2;
        // caiu fora da corrente sem subir: não era dali
        if (landed(c)) { c.done = true; releaseAll(); }
        return;
      }
      steer(m.dir);
      if (landed(c)) { c.done = true; releaseAll(); }
    },

    // rebate nos espinhos: pula e, caindo perto das pontas, golpeia para baixo (uma ou mais vezes)
    pogo(f, m, c) {
      const d = m.dir > 0 ? K.R : K.L;
      if (f === 0) { press(d); press(K.J); c.n = 0; c.cd = 0; }
      if (c.done) return;
      if (f === 30) release(K.J);
      c.cd--;
      if (!b.blocked.down && b.velocity.y > 40 && c.cd <= 0 && lv.touchesSpikes(b.x - 6, b.bottom, b.width + 12, 66)) {
        press(K.D); tap(K.A); c.cd = 14; c.n++;
      }
      if (c.cd === 6) { release(K.A); release(K.D); }
      if (landed(c)) { c.done = true; releaseAll(); }
    },

    // nadando (com a Concha): sobe até a linha d'água e pula para fora para um lado; double: pulo duplo no
    // alto; wall: gruda na parede que encontrar e sobe por ela de pulo em pulo (out: no ciclo n pula para o
    // outro lado)
    sair(f, m, c) {
      if (f === 0) { press(K.U); c.ph = 0; c.cl = 0; c.cy = 0; }
      if (c.done) return;
      if (c.ph === 0) {
        const sf = p.surface;
        if (sf !== null && sf !== undefined && b.top + 15 - sf < 11) { steer(m.dir); tap(K.J); c.ph = 1; c.t = 0; c.left = true; release(K.U); }
        else if (f > 240 || !p.swim) return 'end';
        return;
      }
      c.t++;
      const onG = b.blocked.down;
      if (c.t === 26 && !m.double && !m.wall) release(K.J);
      // caiu de volta na água: acabou
      if (c.t > 34 && p.swim && p.canSwim && !onG) { c.done = true; releaseAll(); return; }
      if (m.wall && p.wallDir !== 0 && !onG) {
        if (++c.cl >= 2) {
          c.cl = 0; c.cy++; c.dj = false; c.jt = c.t;
          if (m.out && c.cy >= m.out) steer(-m.dir);
          tap(K.J);
        }
      } else {
        c.cl = 0;
        if (m.double && !c.dj && c.t > 5 && c.t - (c.jt || 0) > 8 && b.velocity.y > -25 && !onG && p.airJumps > 0) { tap(K.J); c.dj = true; }
      }
      if (landed(c)) { c.done = true; releaseAll(); }
    },
  };

  // os movimentos que valem com estas habilidades (from: 'g' de pé no chão, 'w' na água com a Concha)
  const build = (ab, room, human) => {
    const has = (a) => ab.includes(a);
    const mk = [];
    const add = (m) => mk.push({ from: 'g', ...m });
    add({ name: 'parado', keys: [], hold: 0, max: 240 });
    for (const [d, n, sg] of [[K.L, 'esq', -1], [K.R, 'dir', 1]]) {
      add({ name: `andar-${n}`, keys: [[d, 0, 24]] });
      add({ name: `passo-${n}`, keys: [[d, 0, 7]] });
      add({ name: `pulo-${n}`, keys: [[K.J, 0, 40], [d, 0, 90]] });
      add({ name: `pulo-curto-${n}`, keys: [[K.J, 0, 5], [d, 0, 90]] });
      add({ name: `pulo-medio-${n}`, keys: [[K.J, 0, 12], [d, 0, 90]] });
      add({ name: `pulo-pouco-lado-${n}`, keys: [[K.J, 0, 40], [d, 0, 9]] });
      add({ name: `pulo-depois-lado-${n}`, keys: [[K.J, 0, 40], [d, 14, 90]] });
      add({ name: `agachado-${n}`, keys: [[K.C, 0, 50], [d, 2, 50]] });
      add({ name: `beira0-${n}`, ctl: 'beira', dir: sg, delay: 0 });
      if (!human) add({ name: `beira-${n}`, ctl: 'beira', dir: sg, delay: 4 });
      if (room.warm) add({ name: `atravessar-${n}`, keys: [[d, 0, 175]], max: 320 });
      if (has('dash')) {
        add({ name: `pulo-dash-${n}`, keys: [[K.J, 0, 40], [d, 0, 90], [K.F, 20, 22]] });
        add({ name: `pulo-dash-tarde-${n}`, keys: [[K.J, 0, 40], [d, 0, 90], [K.F, 34, 36]] });
        add({ name: `dash-${n}`, keys: [[d, 0, 14], [K.F, 1, 3]] });
        add({ name: `deslizar-${n}`, keys: [[K.C, 0, 60], [d, 2, 60], [K.F, 4, 6]] });
        add({ name: `beira0-dash-${n}`, ctl: 'beira', dir: sg, delay: 0, dash: true });
        if (!human) add({ name: `beira-dash-${n}`, ctl: 'beira', dir: sg, delay: 4, dash: true });
      }
      if (has('double')) {
        add({ name: `pulo-duplo-${n}`, keys: [[K.J, 0, 22], [d, 0, 90], [K.J, 30, 52]] });
        add({ name: `pulo-duplo-tarde-${n}`, keys: [[K.J, 0, 22], [d, 0, 90], [K.J, 46, 68]] });
        add({ name: `pulo-duplo-pouco-lado-${n}`, keys: [[K.J, 0, 22], [d, 0, 9], [K.J, 30, 52]] });
        add({ name: `pulo-duplo-depois-lado-${n}`, keys: [[K.J, 0, 22], [K.J, 30, 52], [d, 36, 110]] });
        add({ name: `beira0-duplo-${n}`, ctl: 'beira', dir: sg, delay: 0, double: true, dash: has('dash') });
        if (!human) add({ name: `beira-duplo-${n}`, ctl: 'beira', dir: sg, delay: 4, double: true, dash: has('dash') });
      }
      if (has('wall')) {
        add({ name: `pulo-parede-${n}`, keys: [[d, 0, 90], [K.J, 0, 22], [K.J, 34, 56]] });
        add({ name: `escalar-${n}`, ctl: 'escalar', dir: sg, dj: has('double'), max: 900 });
        for (const out of [1, 2, 3, 5, 8]) add({ name: `escalar-sai${out}-${n}`, ctl: 'escalar', dir: sg, dj: has('double'), out, max: 900 });
      }
      if (has('cape')) {
        add({ name: `planar-${n}`, keys: [[K.J, 0, 22], [d, 0, 400], [K.J, 30, 400]], max: 460 });
        add({ name: `planar-tarde-${n}`, keys: [[K.J, 0, 22], [K.J, 30, 52], [d, 0, 400], [K.J, 70, 400]], max: 460 });
        add({ name: `planar-dash-${n}`, keys: [[K.J, 0, 22], [d, 0, 400], [K.J, 30, 52], [K.F, 54, 56], [K.J, 70, 400]], max: 460 });
        add({ name: `cair-planando-${n}`, keys: [[d, 0, 400], [K.J, 20, 22], [K.J, 40, 400]], max: 460 });
        add({ name: `beira-planar-${n}`, ctl: 'beira', dir: sg, delay: human ? 0 : 4, double: has('double'), dash: has('dash'), glide: true, max: 600 });
      }
      if (has('light')) {
        add({ name: `voar-${n}`, keys: [[K.J, 0, 22], [d, 0, 250], [K.J, 30, 50], [K.J, 58, 76], [K.J, 84, 102], [K.J, 110, 250]] });
        add({ name: `voar-um-${n}`, keys: [[K.J, 0, 22], [d, 0, 250], [K.J, 30, 50], [K.J, 58, 250]] });
        add({ name: `voar-subir-${n}`, keys: [[K.J, 0, 22], [d, 70, 250], [K.J, 30, 50], [K.J, 58, 76], [K.J, 84, 102], [K.J, 110, 250]] });
        add({ name: `voar-dash-${n}`, keys: [[K.J, 0, 22], [d, 0, 250], [K.J, 30, 50], [K.J, 58, 76], [K.J, 84, 102], [K.F, 104, 106], [K.J, 120, 250]] });
        add({ name: `beira-voar-${n}`, ctl: 'beira', dir: sg, delay: human ? 0 : 4, double: true, fly: true, dash: has('dash'), glide: has('cape'), max: 600 });
      }
      if (room.spikes) add({ name: `pogo-${n}`, ctl: 'pogo', dir: sg, max: 400 });
    }
    if (has('light')) add({ name: 'voar-reto', keys: [[K.J, 0, 22], [K.J, 30, 50], [K.J, 58, 76], [K.J, 84, 102]] });
    add({ name: 'pulo-reto', keys: [[K.J, 0, 40]] });
    if (has('double')) add({ name: 'pulo-duplo-reto', keys: [[K.J, 0, 22], [K.J, 30, 52]] });
    add({ name: 'descer', keys: [[K.D, 0, 10], [K.J, 2, 4]] });
    if (has('hook') && room.rings) {
      for (const pre of [false, true]) for (const dir of [-1, 0, 1]) {
        const n = `${pre ? 'pulo-' : ''}gancho${dir < 0 ? '-esq' : dir > 0 ? '-dir' : ''}`;
        const base = { ctl: 'gancho', dir, pre, hook: true, max: 700 };
        add({ ...base, name: n });
        add({ ...base, name: `${n}-pulo4`, jumpAt: 4 });
        add({ ...base, name: `${n}-pulo10`, jumpAt: 10 });
        if (has('double')) add({ ...base, name: `${n}-duplo`, dj: true });
        add({ ...base, name: `${n}-emenda`, again: true });
        if (has('double')) add({ ...base, name: `${n}-emenda-duplo`, again: true, dj: true });
        if (dir !== 0) add({ ...base, name: `${n}-emenda-tarde`, again: true, late: 16, dj: has('double') });
      }
    }
    // correntes de ar: de cada trecho de altura, sai para um lado
    if (has('cape')) for (const [i, dr] of (room.drafts || []).entries()) {
      const cx = ((dr.x0 + dr.x1 + 1) / 2) * 16;
      for (let y = dr.y1 - 4; y >= dr.y0 - 2; y -= 4) for (const dir of [-1, 1]) {
        add({ name: `corrente${i}-l${y}-${dir < 0 ? 'esq' : 'dir'}`, ctl: 'corrente', cx, top: y * 16, dir, draft: dr, max: 1500 });
      }
    }
    if (has('swim')) {
      const dirs = [['e', [K.L]], ['d', [K.R]], ['c', [K.U]], ['b', [K.D]], ['ec', [K.L, K.U]], ['dc', [K.R, K.U]], ['eb', [K.L, K.D]], ['db', [K.R, K.D]]];
      for (const [n, ks] of dirs) for (const len of [14, 44]) mk.push({ from: 'w', name: `nado-${n}-${len}`, keys: ks.map((k) => [k, 0, len]), wet: true, max: len + 60 });
      for (const dir of [-1, 0, 1]) mk.push({ from: 'w', name: `sair-${dir < 0 ? 'esq' : dir > 0 ? 'dir' : 'reto'}`, ctl: 'sair', dir, max: 420 });
      for (const [dir, n] of [[-1, 'esq'], [1, 'dir']]) {
        if (has('double')) mk.push({ from: 'w', name: `sair-duplo-${n}`, ctl: 'sair', dir, double: true, max: 520 });
        if (has('wall')) {
          mk.push({ from: 'w', name: `sair-parede-${n}`, ctl: 'sair', dir, double: has('double'), wall: true, max: 1100 });
          for (const out of [1, 2, 4, 7]) mk.push({ from: 'w', name: `sair-parede-sai${out}-${n}`, ctl: 'sair', dir, double: has('double'), wall: true, out, max: 1100 });
        }
      }
      for (const [n, ks] of [['e', [K.L]], ['d', [K.R]]]) mk.push({ from: 'w', name: `nado-longe-${n}`, keys: ks.map((k) => [k, 0, 120]), wet: true, max: 190 });
    }
    return mk;
  };

  // prepara a sala: sem inimigos, sem dano, sem enfeite; open: grades, trancas, alçapões, paredes falsas e
  // Âmbar já abertos
  A.prepare = (opts) => {
    g = window.__game; s = window.__scene; p = s.player; lv = s.level; b = p.body;
    g.loop.sleep();
    t = performance.now();
    snow = s.room.theme === 'snow';
    for (const e of s.enemies) { if (e.body) e.body.enable = false; if (e.sprite) e.sprite.setVisible(false); }
    s.enemies = [];
    const nop = () => {};
    for (const k of ['hazards', 'exits', 'story', 'follow', 'bossFight', 'updateArena', 'updateAlarm', 'veilThoughts', 'trackVisit', 'sfx', 'dustBurst', 'spawnGhost',
      'featherBurst', 'lightBurst', 'glowBurst', 'bubbles', 'splash', 'onPlayerAction', 'onSlick', 'thinkOnce', 'updateElo', 'trackPasses', 'usePower']) s[k] = nop;
    for (const o of ['backdrop', 'decor', 'weather', 'life', 'mist', 'shafts', 'memWave', 'lighting', 'cape', 'loot', 'npcs', 'finds', 'magic']) if (s[o] && s[o].update) s[o].update = nop;
    if (s.backdrop) s.backdrop.fgFade = nop;
    s.onBreathOut = () => { breathOut = true; };
    p.hurt = () => false;
    for (const k of ['hud', 'fx']) { const sc = g.scene.getScene(k); if (sc && sc.scene.isActive()) sc.scene.sleep(); }
    if (opts.open) {
      for (const w of [...s.fixtures.walls]) s.fixtures.breakWall(w, false);
      lv.setGates(true);
      for (const x of new Set(lv.locks.map((l) => l.x))) lv.setLock(x, true);
      for (const tr of s.fixtures.trapdoors) s.fixtures.openTrapdoor(tr, false);
      if (opts.amber !== false) for (const a of lv.ambers) for (const [x, y] of a.cells) lv.layer.removeTileAt(x, y);
    }
    const room = s.room;
    const ab = [...window.__progress.abilities];
    const spawns = lv.spawns.map((q, i) => ({ i, kind: q.kind, x: q.x, y: q.y, tx: q.tx, ty: q.ty }));
    const flat = lv.grid.join('');
    macros = build(ab, { warm: !!p.warm || flat.includes('~'), spikes: flat.includes('^'), rings: s.fixtures.rings.length > 0, drafts: room.drafts }, !!opts.human);
    // o chão de verdade agora (depois de abrir tudo): uma letra por célula, '#' pisa e segura, '-' só pisa
    const rows = [];
    for (let y = 0; y < lv.h; y++) {
      let r = '';
      for (let x = 0; x < lv.w; x++) {
        const ti = lv.layer.getTileAt(x, y);
        const c = lv.grid[y][x];
        r += !ti || ti.index < 0 ? (c === '~' ? '~' : '.') : c === '^' ? '^' : c === '-' || c === '"' ? '-' : '#';
      }
      rows.push(r);
    }
    info = {
      room: room.id, W: lv.widthPx, H: lv.heightPx, w: lv.w, h: lv.h, ab, pit: !!room.pit, rows, grid: lv.grid, spawns,
      exits: room.exits, doors: s.fixtures.doors.map((d, i) => ({ i, x: d.x, y: d.y })), rings: s.fixtures.rings.map((r) => ({ x: r.x, y: r.y })),
      spawn: { x: p.x, f: b.bottom }, macros: macros.map((m) => m.name), from: macros.map((m) => m.from),
    };
    return info;
  };

  const reset = (n) => {
    releaseAll();
    step();
    p.frozen = false; p.pose = null; p.dead = false; p.auto = null; p.drift = null; p.ride = null; p.tow = null;
    s.cinematic = false; s.transitioning = false; s.respawning = false; s.hitstopT = 0;
    if (s.physics.world.isPaused) s.physics.world.resume();
    if (p.hook) p.dropHook();
    p.dashT = 0; p.dashCd = 0; p.slideT = 0; p.airDash = true; p.buffer = 0; p.coyote = 0; p.jumping = false;
    p.hurtT = 0; p.recoilT = 0; p.atkCd = 0; p.atkAnimT = 0; p.windupT = 0; p.atkT = 0; p.moveTarget = null; p.dropT = 0;
    p.hookCd = 0; p.hookBuffer = 0; p.lastRingT = 0; p.wallDir = 0; p.wallLock = 0; p.wallCoyote = 0; p.lungeT = 0; p.atkBuffer = 0;
    p.gliding = false; p.glideArmed = false; p.exitT = 0; p.strokeT = 0; p.invuln = 0;
    p.refillBreath();
    breathOut = false;
    b.setAllowGravity(true);
    for (const l of s.torres?.lumes ?? []) { l.off = 0; l.k = 1; }
    p.crouched = !!n.c;
    p.updateCrouchBody(true);
    p.teleport(n.x, n.f);
    b.setVelocity(0, 0);
    for (let i = 0; i < 4; i++) step();
  };

  const inRange = (e, v) => !e.range || (v / 16 >= e.range[0] && v / 16 < e.range[1] + 1);

  const run = (n, m) => {
    // sem argola por perto, o gancho não tem o que tentar
    if (m.hook && !info.rings.some((r) => Math.abs(r.x - n.x) < 330 && Math.abs(r.y - n.f) < 330)) return null;
    if (m.draft && (Math.abs(m.cx - n.x) > 260 || n.f < m.top)) return null;
    reset(n);
    const c = {};
    const goals = new Set();
    const touched = new Set();
    const trod = new Set();
    const max = m.max || 260;
    const lastKey = m.keys ? Math.max(0, ...m.keys.map((k) => k[2])) : 0;
    let fail = null, still = 0, wetT = 0, f = 0, px = p.x, py = b.bottom, ended = false;
    const exits = info.exits;
    for (f = 0; f < max; f++) {
      if (m.keys) { for (const [code, a, z] of m.keys) { if (f === a) tap(code); if (f === z) release(code); } }
      else if (CTL[m.ctl](f, m, c) === 'end') { ended = true; break; }
      step();
      if (A.rastro && f % (A.cada || 4) === 0) A.rastro.push([f, Math.round(p.x), Math.round(b.bottom), p.hook ? p.hook.phase : '-', b.blocked.down ? 'chão' : p.wallDir ? 'parede' : 'ar', Math.round(b.velocity.x), Math.round(b.velocity.y), c.ph ?? '', c.n ?? '']);
      if (!p.veilPassing && lv.touchesSpikes(b.x + 1, b.y, b.width - 2, b.height)) { fail = 'espinho'; break; }
      if (snow && lv.inWater(b.center.x, b.bottom - 4)) { fail = 'agua-gelada'; break; }
      if (breathOut) { fail = 'folego'; break; }
      if (Math.hypot(p.x - px, b.bottom - py) > 70) { fail = 'salto-de-lugar'; break; }
      px = p.x; py = b.bottom;
      let out = false;
      for (const e of exits) {
        if (e.side === 'down' && b.center.y > info.H + 2 && inRange(e, b.center.x)) { goals.add(`exit:${e.to}:${e.entry}`); out = true; }
        if (e.side === 'up' && b.top < -6 && inRange(e, b.center.x)) { goals.add(`exit:${e.to}:${e.entry}`); out = true; }
        if (e.side === 'right' && b.center.x > info.W + 2 && inRange(e, b.center.y)) { goals.add(`exit:${e.to}:${e.entry}`); out = true; }
        if (e.side === 'left' && b.center.x < -2 && inRange(e, b.center.y)) { goals.add(`exit:${e.to}:${e.entry}`); out = true; }
      }
      if (out) break;
      if (b.top > info.H + 8) { fail = info.pit ? 'abismo' : 'fora'; break; }
      if (b.center.x < -20 || b.center.x > info.W + 20 || b.bottom < -80) { fail = 'fora'; break; }
      const onG = b.blocked.down;
      for (const q of info.spawns) {
        if (Math.abs(q.x - p.x) < 15 && b.bottom > q.y - 20 && b.top < q.y + 4) touched.add(q.i);
      }
      if (onG) {
        for (const d of info.doors) if (Math.abs(p.x - d.x) < 14 && Math.abs(b.bottom - d.y) < 8) goals.add('door:' + d.i);
        trod.add(Math.floor(p.x / 16) + ':' + (Math.round(b.bottom / 16) - 1));
      }
      const after = m.keys ? f > lastKey : !!c.done;
      if (after && onG && Math.abs(b.velocity.x) < 2 && Math.abs(b.velocity.y) < 2) { if (++still >= 3) break; } else still = 0;
      if (after && p.swim && p.canSwim) { if (++wetT >= (m.wet ? 12 : 30)) break; } else wetT = 0;
    }
    releaseAll();
    const wet = !!(p.swim && p.canSwim) && !b.blocked.down;
    return {
      x: Math.round(p.x * 10) / 10, f: Math.round(b.bottom * 10) / 10, c: p.crouched || p.slideT > 0 ? 1 : 0, g: b.blocked.down ? 1 : 0, w: wet ? 1 : 0,
      under: p.under && !p.canSwim ? 1 : 0, fail, goals: [...goals], touched: [...touched], trod: [...trod], frames: f, ended,
    };
  };

  // roda todos os movimentos que valem de cada ponto da lista
  A.batch = (list) => list.map((n) => macros.map((m) => (m.from === (n.w ? 'w' : 'g') ? run(n, m) : null)));
  // nome@chave=valor,chave=valor: o mesmo movimento com parâmetros trocados (para medir folgas)
  A.one = (n, name) => {
    const [base, over] = name.split('@');
    const m = macros.find((q) => q.name === base);
    if (!m || !over) return run(n, m);
    const extra = Object.fromEntries(over.split(';').map((kv) => { const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number(v)]; }));
    return run(n, { ...m, ...extra, name });
  };
  // para os testes de rota (rota.cjs): um golpe virado para um lado, uns quadros parado e o estado da sala
  A.golpe = (dir, n) => {
    steer(dir); for (let i = 0; i < 3; i++) step();
    steer(0); tap(K.A);
    for (let i = 0; i < (n || 22); i++) { if (i === 4) release(K.A); step(); }
    releaseAll();
    return 3 + (n || 22);
  };
  A.passos = (n) => { for (let i = 0; i < n; i++) step(); return n; };
  A.estado = () => ({
    x: Math.round(p.x * 10) / 10, f: Math.round(b.bottom * 10) / 10, g: b.blocked.down ? 1 : 0,
    runas: (s.torres && s.torres.runes ? s.torres.runes : []).map((r) => ({ x: r.x, y: r.y, t: r.t === Infinity ? 'aberta' : Math.round(r.t * 100) / 100 })),
    paredes: s.fixtures.walls.length, seen: [...window.__progress.seen].filter((k) => /^(runas|parede|vitral|bau|chest|wall)/.test(k)),
  });
  A.stop = () => { releaseAll(); g.loop.wake(); };
  window.__al = A;
})();
