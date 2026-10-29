// O diretor do vídeo "como zerar", dentro da página do jogo (o gravador, capture.cjs, põe aqui depois do menu).
// Cada trecho (plan.js) monta o jogo do jeito que precisa, e daí o jogo anda quadro a quadro pelo relógio
// virtual (clock.js): as teclas saem do roteiro do trecho ou do lutador, as legendas ficam por cima e o som
// que o jogo pede fica anotado com o tempo do vídeo (o som de verdade sai depois, em audio.cjs).
(() => {
  const V = window.__V;
  const STEP = 1000 / 60;
  const A = window.__audio;
  const vid = (window.__vid = { gf: 0, rec: false, log: [], keys: new Set(), seg: null, id: '', bs: {}, err: [] });

  // ---------- som: o que o jogo pede fica anotado (nada toca de verdade na gravação) ----------
  A.init = () => {};
  for (const m of ['music', 'ambience', 'sfx']) {
    const f = A[m].bind(A);
    A[m] = (...a) => {
      if (vid.rec) vid.log.push({ t: +vid.t().toFixed(4), m, a: JSON.parse(JSON.stringify(a)), k: A.stepKind, s: A.space });
      return f(...a);
    };
  }
  vid.t = () => vid.gf / 60;

  // ---------- teclas ----------
  vid.hold = (codes) => {
    const want = new Set(codes);
    for (const c of vid.keys) if (!want.has(c)) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    for (const c of want) if (!vid.keys.has(c)) window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    vid.keys = want;
  };
  // roteiro de teclas: [início, fim, tecla] em segundos do trecho
  vid.script = (list) => {
    const t = vid.t();
    vid.hold(list.filter(([a, b]) => t >= a && t < b).map(([, , c]) => c));
  };
  const K = { L: 'KeyA', R: 'KeyD', U: 'KeyW', D: 'KeyS', J: 'Space', X: 'KeyJ', F: 'KeyF', C: 'ControlLeft', E: 'KeyE', Q: 'KeyQ' };
  vid.K = K;
  // um caminho em passos, pelo lugar e não pelo relógio: cada passo segura keys, toca tap (solta um quadro
  // e aperta quatro, no começo do passo) e vale até until(c) ficar verdadeiro ou passarem for segundos.
  // keys também pode ser uma função de c. Com o cavaleiro preso (relíquia, cena) nada anda.
  // c: { s, p, x, y (em blocos, o y é o do pé), t, n (quadros no passo), ground, wall }
  vid.route = (steps) => {
    const s = window.__scene;
    const p = s.player;
    const bs = vid.bs;
    if (bs.ri == null) {
      bs.ri = 0;
      bs.rn = 0;
    }
    if (p.frozen || s.cinematic) return vid.hold([]);
    const c = { s, p, x: p.x / 16, y: p.body.bottom / 16, t: vid.t(), n: bs.rn, ground: p.onGround, wall: p.wallDir };
    let st = steps[bs.ri];
    while (st && ((st.for != null && c.n >= st.for * 60) || (st.until && st.until(c)))) {
      bs.ri++;
      bs.rn = c.n = 0;
      st = steps[bs.ri];
    }
    bs.rn++;
    if (!st) return vid.hold([]);
    const keys = [...(typeof st.keys === 'function' ? st.keys(c) : st.keys || [])];
    const tap = st.tap || [];
    if (c.n === 0) vid.hold(keys.filter((k) => !tap.includes(k)));
    else vid.hold(c.n <= 4 ? [...keys, ...tap] : keys);
  };

  // ---------- legendas ----------
  const css = document.createElement('style');
  css.textContent = `
    #vid-cap { position: fixed; top: 26px; right: 28px; width: 410px; box-sizing: border-box; padding: 13px 18px 15px;
      background: rgba(7, 8, 13, 0.78); border: 1px solid rgba(201, 162, 92, 0.38); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
      color: #e8e2d4; opacity: 0; z-index: 99999; pointer-events: none; }
    #vid-cap .k { font-family: 'IM Fell English SC', serif; letter-spacing: 0.16em; font-size: 14px; color: #c9a25c; }
    #vid-cap .t { font-family: 'IM Fell English SC', serif; font-size: 27px; line-height: 1.05; margin: 5px 0 7px; color: #f2ecdc; }
    #vid-cap .x { font-family: 'IM Fell English', serif; font-style: italic; font-size: 18.5px; line-height: 1.36; color: #d9d2c3; }
    #vid-cap .x b { font-family: 'Spectral', serif; font-style: normal; font-weight: 500; font-size: 15px; color: #f0d9a8;
      border: 1px solid rgba(240, 217, 168, 0.45); border-radius: 3px; padding: 0 5px; margin: 0 1px; }
    #vid-card { position: fixed; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end;
      padding: 0 70px 74px 0; opacity: 0; z-index: 99999; pointer-events: none; text-align: right; }
    #vid-card .t { font-family: 'IM Fell English SC', serif; font-size: 46px; letter-spacing: 0.04em; color: #f2ecdc;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.9); }
    #vid-card .x { font-family: 'IM Fell English', serif; font-style: italic; font-size: 23px; color: #c9a25c; margin-top: 6px;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9); }
    #vid-card.center { justify-content: center; align-items: center; padding: 0; text-align: center; }
    #vid-card.center .t { font-size: 58px; }
    #vid-black { position: fixed; inset: 0; background: #000; opacity: 0; z-index: 99998; pointer-events: none; }`;
  document.head.appendChild(css);
  const cap = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'vid-cap' }));
  const card = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'vid-card' }));
  const black = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'vid-black' }));
  // as medidas das legendas são para a tela de 720 linhas: em 1080 tudo cresce junto
  cap.style.zoom = card.style.zoom = String(window.innerHeight / 720);
  const fade = (t, a, b, d = 0.45) => Math.max(0, Math.min(1, (t - a) / d, (b - t) / d));
  // as teclas aparecem como teclas: [Espaço]
  const keyed = (s) => s.replace(/\[([^\]]+)\]/g, '<b>$1</b>');
  vid.captions = () => {
    const t = vid.t();
    const seg = vid.seg || {};
    const dur = vid.dur();
    // as legendas com down contam do instante em que o chefe caiu, e as com on do instante em que on(cena)
    // ficou verdadeiro pela primeira vez (antes disso não aparecem)
    const s = window.__scene;
    for (const q of seg.caps || []) if (q.on && !vid.capT.has(q) && vid.rec && s && q.on(s)) vid.capT.set(q, t);
    const from = (q) => (q.down ? vid.downT : q.on ? vid.capT.get(q) : 0);
    const span = (q) => {
      const z = from(q);
      return z == null ? [Infinity, -Infinity] : [z + q.at, z + q.to];
    };
    const c = (seg.caps || []).find((q) => {
      const [a, b] = span(q);
      return t >= a - 0.5 && t <= Math.min(b, dur - 0.3) + 0.5;
    });
    if (c && cap.__c !== c) {
      cap.__c = c;
      cap.innerHTML = `${c.k ? `<div class="k">${c.k}</div>` : ''}<div class="t">${c.t}</div>${c.x ? `<div class="x">${keyed(c.x)}</div>` : ''}`;
      // mais estreita quando uma tela do jogo ocupa o meio (w em pixels de 720p)
      cap.style.width = c.w ? `${c.w}px` : '';
    }
    if (c) {
      const [a, b] = span(c);
      cap.style.opacity = String(fade(t, a, Math.min(b, dur - 0.3)));
    } else cap.style.opacity = '0';
    const k = seg.card;
    if (k && card.__k !== k) {
      card.__k = k;
      card.innerHTML = `<div class="t">${k.t}</div>${k.x ? `<div class="x">${k.x}</div>` : ''}`;
      // center: no meio da tela (o nome do jogo no fim), e dim escurece o jogo atrás dele
      card.classList.toggle('center', !!k.center);
    }
    const ka = k ? fade(t, k.at, k.to, 0.7) : 0;
    card.style.opacity = String(ka);
    // o preto das pontas: entra e sai do trecho
    let b = k && k.dim ? k.dim * ka : 0;
    if (seg.fadeIn) b = Math.max(b, 1 - t / seg.fadeIn);
    if (seg.fadeOut) b = Math.max(b, 1 - (dur - t) / seg.fadeOut);
    black.style.opacity = String(Math.max(0, Math.min(1, b)));
  };

  // ---------- montar o jogo ----------
  vid.progress = ({ abilities = [], seen = [], memories = [], powers = [], kintsugi = 1, coins = 0, amber = 0 } = {}) => {
    const p = window.__progress;
    p.reset();
    p.prologueDone = true;
    p.kintsugi = kintsugi;
    p.coins = coins;
    p.abilities = new Set(abilities);
    for (const k of ['journal', ...seen]) p.seen.add(k);
    for (const m of memories) p.memories.add(m);
    for (const w of powers) p.powers.add(w);
    // o poder escolhido é o primeiro da lista, e as contas de Âmbar já cheias para usar
    if (powers.length) p.power = powers[0];
    p.amber = amber;
    p.save();
  };
  vid.stopScenes = () => {
    const g = window.__game;
    for (const k of ['title', 'intro', 'ending']) {
      const sc = g.scene.getScene(k);
      if (sc && sc.scene.isActive()) sc.scene.stop();
    }
    // o texto da abertura (ui.story) tem relógios próprios: o fim dele, segundos depois, fecharia a tela e
    // zeraria as teclas do jogo no meio do trecho seguinte. Encerrado aqui (com a cena parada ele não começa o jogo)
    const ui = window.__ui;
    for (const e of [...ui.stack]) if (e.id === 'intro' && e.back) e.back();
    ui.closeAll();
  };
  vid.room = (room, entry = '1', from = 'door') => {
    vid.stopScenes();
    vid.want = { room, entry, from, sent: false };
    vid.switchRoom();
  };
  // a troca de sala espera a cena do jogo terminar de carregar: no meio do carregamento de outra sala (a porta
  // do fim do trecho anterior) o start novo se misturava com o carregamento antigo, e a sala vinha sem a folha
  // do chefe (e sem o chefe)
  vid.switchRoom = () => {
    const w = vid.want;
    if (!w || w.sent) return;
    const g = window.__game;
    const gs = g.scene.getScene('game');
    // 2 a 4: START, LOADING e CREATING (1, INIT, é a cena que nunca começou)
    const st = gs ? gs.sys.settings.status : 0;
    if (st >= 2 && st <= 4) return;
    vid.oldPlayer = window.__scene && window.__scene.player;
    w.sent = true;
    const data = { room: w.room, entry: w.entry, from: w.from };
    if (gs && gs.scene.isActive()) gs.scene.restart(data);
    else g.scene.start('game', data);
  };
  // a sala carregou e assentou (as mesmas condições das fotos do EXTREME)
  vid.roomReady = () => {
    vid.switchRoom();
    const w = vid.want;
    if (w && !w.sent) return false;
    const s = window.__scene;
    if (!s || !s.player || s.player === vid.oldPlayer || s.transitioning) return false;
    if (w && (!s.room || s.room.id !== w.room)) return false;
    if (s.clock < 0.4) return false;
    if (s.cameras.main.fadeEffect.isRunning) return false;
    if (s.lighting && !s.lighting.ready) return false;
    if (s.terrainImg && !s.hdImgs.length) return false;
    return true;
  };
  // põe o cavaleiro em (x em blocos, pé em blocos) e a câmera em cima dele
  vid.put = (x, feet, face) => {
    const s = window.__scene;
    const p = s.player;
    p.teleport(x * 16 + 8, feet * 16);
    p.body.setVelocity(0, 0);
    if (face) p.facing = face;
    s.cameras.main.centerOn(p.x, p.body.center.y);
  };
  // as criaturas da sala saem (o vanish só desliga: o sprite que ele devolve fica para esconder)
  vid.calm = () => {
    for (const e of window.__scene.enemies) {
      if (e.kind === 'boss' || !e.vanish) continue;
      const sp = e.vanish();
      if (sp && sp.setVisible) sp.setVisible(false);
    }
  };
  // nada machuca o cavaleiro no vídeo (sem piscar: a piscada é do invuln)
  vid.shield = () => {
    const p = window.__scene.player;
    p.hurt = () => false;
    p.sap = () => false;
  };

  // ---------- os quadros ----------
  // um passo do jogo sem desenhar (o vídeo tem metade dos quadros do jogo)
  const update = (g, time, delta) => {
    const ev = g.events;
    ev.emit('prestep', time, delta);
    ev.emit('step', time, delta);
    g.scene.update(time, delta);
    ev.emit('poststep', time, delta);
    g.scene.isProcessing = false;
    // a câmera segue o cavaleiro no preRender, que o Phaser só chama ao desenhar: sem ele a câmera do vídeo
    // andaria um passo em cada dois (e ficaria para trás nos movimentos rápidos)
    const s = window.__scene;
    const cam = s && s.sys && s.sys.isActive() && s.cameras && s.cameras.main;
    if (cam) cam.preRender();
  };
  vid.tick = (render) => {
    const g = window.__game;
    g.loop.delta = STEP;
    if (vid.rec) vid.gf++;
    try {
      if (vid.rec && vid.seg.tick) vid.seg.tick(vid, vid.t());
    } catch (e) {
      vid.err.push(`${vid.id} ${vid.t().toFixed(2)}: ${e.message}`);
    }
    V.advance(STEP);
    if (render) g.step(V.base + V.now, STEP);
    else update(g, V.base + V.now, STEP);
    V.frame();
  };
  // a duração do trecho: num trecho de chefe, acaba um pouco depois de ele cair (se cair antes do fim)
  vid.dur = () => Math.min((vid.seg && vid.seg.dur) || 0, vid.endAt ?? Infinity);
  // um quadro do vídeo: sub passos do jogo, o último desenhado (render false: nenhum, para ver só a lógica)
  vid.frame = (sub, render = true) => {
    for (let i = 0; i < sub; i++) vid.tick(render && i === sub - 1);
    V.css(STEP * sub);
    const s = window.__scene;
    if (vid.rec && vid.seg.boss && vid.endAt == null && s && s.boss && vid.seg.down(s.boss)) {
      vid.downT = vid.t();
      vid.endAt = Math.ceil((vid.t() + (vid.seg.after ?? 3.5)) * 2) / 2;
    }
    vid.captions();
    return vid.rec && vid.t() >= vid.dur() - 1e-6;
  };
  // como está o trecho (para o registro do gravador)
  vid.status = () => {
    const s = window.__scene;
    const p = s && s.player;
    const b = s && s.boss;
    return {
      t: +vid.t().toFixed(2), room: s && s.room && s.room.id, x: p ? +(p.x / 16).toFixed(1) : null, y: p ? +(p.body.bottom / 16).toFixed(1) : null,
      hp: p && p.hp, keys: [...vid.keys].join('+'), boss: b ? `${b.state} ${Math.round(b.hp)}/${Math.round(b.maxHp)}${b.alive ? '' : ' caiu'}` : '',
    };
  };
  // antes de gravar: anda sem gravar (a sala carrega com o relógio virtual parado entre um quadro e outro)
  vid.preroll = (n = 1) => {
    for (let i = 0; i < n; i++) vid.tick(i === n - 1);
    V.css(STEP * n);
  };

  // ---------- trechos ----------
  vid.begin = (id) => {
    const seg = window.__plan[id];
    vid.id = id;
    vid.seg = seg;
    vid.gf = 0;
    vid.rec = false;
    vid.log = [];
    vid.bs = {};
    vid.endAt = null;
    vid.downT = null;
    vid.capT = new Map();
    vid.want = null;
    vid.hold([]);
    cap.__c = card.__k = null;
    if (!V.on) {
      V.start();
      window.__game.loop.sleep();
    }
    // a sala também nasce de uma semente: o trecho sai igual gravado sozinho ou depois dos outros (seg.as: um
    // trecho de teste que copia outro usa as sementes dele)
    Math.random = seeded(hash(`sala:${seg.as ?? id}`));
    seg.setup(vid);
  };
  vid.isReady = () => (vid.seg.ready ? vid.seg.ready(vid) : true);
  // o acaso do jogo (Math.random) vem de uma semente por trecho (seg.seed ou o nome dele): a prévia e a
  // gravação final saem iguais, com as mesmas escolhas dos chefes
  const seeded = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // o chefe sorteia num acaso só dele: a chuva, as partículas e as criaturas da sala gastam sorteios num ritmo
  // que depende de quantos passos a sala levou para carregar, e sem isso a escolha dos golpes mudaria de uma
  // gravação para a outra
  const own = (b, seed) => {
    const rnd = seeded(seed);
    for (const k of ['update', 'hit', 'partHit', 'parry', 'wake', 'harms']) {
      const f = b[k];
      if (typeof f !== 'function') continue;
      b[k] = function (...a) {
        const r = Math.random;
        Math.random = rnd;
        try {
          return f.apply(this, a);
        } finally {
          Math.random = r;
        }
      };
    }
  };
  vid.go = () => {
    const key = vid.seg.as ?? vid.id;
    Math.random = seeded(vid.seg.seed ?? hash(key));
    vid.seg.go?.(vid);
    // bossSeed: a semente escolhida para a luta (a de cada chefe sai de um teste de várias, a que mostra
    // melhor o jeito de vencer)
    const s = window.__scene;
    if (vid.seg.boss && s && s.boss) own(s.boss, vid.seg.bossSeed ?? hash(`chefe:${key}`));
    vid.rec = true;
    // a trilha e o ambiente que estão valendo no começo do trecho
    vid.log.push({ t: 0, m: 'music', a: [A.wantTrack || 'none', vid.seg.musicFade ?? 1.2], k: A.stepKind, s: A.space });
    vid.log.push({ t: 0, m: 'ambience', a: [A.wantAmb || 'none'], k: A.stepKind, s: A.space });
    vid.captions();
  };
  vid.take = () => ({ log: vid.log, err: vid.err.splice(0), down: vid.downT });

  // ---------- o lutador ----------
  // chega perto e bate quando o chefe abre a guarda (recuperação, tonto, parado), sai da frente nas
  // preparações. o: { reach, away: estados de sair de perto, jump: estados de pular, crouch: estados de
  // agachar, open: estados de bater, keep: distância nos outros estados, wakeX: coluna que acorda o chefe,
  // parry: estados de aparar (parryAt diz a hora), still: estados de esperar parado }
  vid.fight = (o = {}) => {
    const s = window.__scene;
    const p = s.player;
    const b = s.boss;
    const bs = vid.bs;
    bs.f = (bs.f || 0) + 1;
    if (!b || !b.alive || s.cinematic || p.frozen) return vid.hold([]);
    const bx = o.bx ? o.bx(b) : b.zone ? b.zone.x : b.x;
    const dx = bx - p.x;
    const dir = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    const st = String(b.state);
    const has = (list, q) => (list || []).some((r) => (r instanceof RegExp ? r.test(q) : r === q));
    const keys = [];
    const toward = dir > 0 ? K.R : K.L;
    const away = dir > 0 ? K.L : K.R;
    if (st !== bs.st) {
      bs.st = st;
      bs.since = bs.f;
    }
    const inState = bs.f - bs.since;
    // o golpe de aparar em andamento: solta um passo e aperta quatro (mesmo se o estado mudar no meio)
    if (bs.pt > 0) {
      if (bs.pt-- < 5) keys.push(K.X);
    }
    // dormindo: vai até ele (passar da coluna de acordar fecha a grade e começa a luta); wakeX é essa
    // coluna, para os chefes que acordam depois de o cavaleiro passar por eles (o Reflexo, o Coroado)
    if (b.sleeping) {
      if (o.wakeX != null) {
        if (p.x < o.wakeX * 16 + 12) keys.push(K.R);
      } else if (dist > 70) keys.push(toward);
    } else if (has(o.parry, st)) {
      // aparar: parado e de frente para ele, um golpe só por ataque, na hora que parryAt(chefe, distância,
      // passos no estado) diz
      if (p.facing !== dir) keys.push(toward);
      else if (bs.pa !== bs.since && !bs.pt && (o.parryAt ? o.parryAt(b, dist, inState) : inState >= 20)) {
        bs.pa = bs.since;
        bs.pt = 5;
      }
    } else if (has(o.still, st)) {
      // parado, de frente para ele (esperando o ataque que vem de longe)
      if (p.facing !== dir && bs.f % 20 === 0) keys.push(toward);
    } else if (has(o.jump, st) && inState >= (o.jumpAt ?? 6) && inState < (o.jumpAt ?? 6) + 18) {
      keys.push(K.J);
      if (o.jumpAway) keys.push(away);
    } else if (has(o.crouch, st)) {
      keys.push(K.C);
    } else if (has(o.away, st) || (o.danger && o.danger(b, p))) {
      if (dist < (o.far ?? 130)) keys.push(away);
      if (o.dash && dist < 60 && inState === 4) keys.push(K.F);
    } else if (has(o.open, st) || (!o.open && /rec$|^stun$|^stagger$|^idle$|^walk$/.test(st))) {
      if (dist > (o.reach ?? 40)) keys.push(toward);
      else {
        if (p.facing !== dir) keys.push(toward);
        // ataque em toques: aperta 3 quadros a cada 13
        if (bs.f % 13 < 3) keys.push(K.X);
        if (o.up && o.up(b, p) && bs.f % 13 < 3) keys.push(K.U);
      }
    } else {
      const keep = o.keep ?? 90;
      if (dist < keep - 14) keys.push(away);
      else if (dist > keep + 14) keys.push(toward);
      else if (p.facing !== dir && bs.f % 20 === 0) keys.push(toward);
    }
    vid.hold(keys);
  };
})();
