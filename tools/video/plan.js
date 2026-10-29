// O roteiro do vídeo "como zerar": um trecho por momento do caminho, na ordem do jogo (vid.js roda cada um).
// setup monta o jogo (o progresso de quem chegou ali e a sala), ready diz quando a sala assentou, go põe o
// cavaleiro no lugar, tick dá as teclas a cada passo do jogo e caps são as legendas (em segundos do trecho).
(() => {
  const K = window.__vid.K;
  // o que ele já tem em cada ponto do caminho (habilidades e chefes vencidos)
  const AB = {
    vespera: [],
    sinos: ['dash'],
    cidade: ['dash', 'wall', 'double'],
    prisao: ['dash', 'wall', 'double'],
    fosso: ['dash', 'wall', 'double', 'hook'],
    minas: ['dash', 'wall', 'double', 'hook', 'veil'],
    floresta: ['dash', 'wall', 'double', 'hook', 'veil'],
    vale: ['dash', 'wall', 'double', 'hook', 'veil', 'cape'],
    torres: ['dash', 'wall', 'double', 'hook', 'veil', 'cape', 'swim'],
    final: ['dash', 'wall', 'double', 'hook', 'veil', 'cape', 'swim', 'light'],
  };
  const BOSS_ORDER = ['sineiro', 'arcebispo', 'carcereira', 'sombra', 'reflexo', 'capataz', 'cacador', 'barqueiro', 'vhalor', 'coroado'];
  // os chefes antes deste (e o que vem junto: o prólogo, o portão das catacumbas, a Corrente)
  const before = (id) => {
    const out = ['memory:vale', 'gate:catacumbas'];
    for (const b of BOSS_ORDER) {
      if (b === id) break;
      out.push(`boss:${b}`);
    }
    if (out.includes('boss:carcereira')) out.push('weapon:corrente');
    return out;
  };
  // a relíquia já veio (o passo seguinte do caminho espera a cena dela acabar)
  const has = (a) => window.__progress.abilities.has(a);
  // sobe um poço de parede em parede: encostado numa, solta o pulo um quadro e aperta de novo (o pulo da
  // parede sai para o lado de lá) e segura para lá até encostar na outra
  const climb = (v, c) => {
    const bs = v.bs;
    if (c.wall && !bs.kick) {
      bs.side = -c.wall;
      bs.kick = 2;
    }
    const dir = (bs.side ?? 1) > 0 ? K.R : K.L;
    if (bs.kick === 2) {
      bs.kick = 1;
      return [dir];
    }
    if (bs.kick === 1 && !c.wall) bs.kick = 0;
    return [dir, K.J];
  };
  // as salas mais escuras sobem um pouco mais no vídeo do que a curva de sempre (capture.cjs, LIFT)
  const DEEP = "curves=all='0/0 0.04/0.1 0.17/0.31 0.5/0.64 1/1'";
  // o gancho soltou da argola (ou nem saiu)
  const loose = (c) => !c.p.hook || c.p.hook.phase === 'back';
  // um elo: solta o gancho na argola da frente e espera ele puxar até lá
  const link = () => [
    { tap: [K.E], for: 0.2 },
    { until: loose, for: 1.2 },
    { for: 0.15 },
  ];
  // a Capa de Luz no ar: segurando para a direita, gasta uma luz cada vez que ele começa a cair abaixo da
  // linha top (em blocos, a do pé) e segura o pulo até o alto dela (soltar antes corta a subida, como no
  // pulo). Até x (em blocos): dali em diante ele só cai
  const lightHop = (v, c, top = 0, x = Infinity) => {
    const bs = v.bs;
    const vy = c.p.body.velocity.y;
    if (bs.lj) {
      bs.lj++;
      if (bs.lj < 6 || vy < 0) return [K.R, K.J];
      bs.lj = 0;
      return [K.R];
    }
    if (vy > 40 && c.p.light > 0 && c.y > top && c.x < x) {
      bs.lj = 1;
      return [K.R, K.J];
    }
    return [K.R];
  };
  // o pulo segurado até o alto (vy para de subir), para não cortar a subida
  const apex = (c) => c.n > 5 && c.p.body.velocity.y >= 0;
  // a criatura viva mais perto do cavaleiro (em pixels)
  const foe = (c) => Math.min(999, ...c.s.enemies.filter((e) => e.alive && e.kind !== 'boss').map((e) => Math.abs(e.rect.centerX - c.p.x)));
  const ground = (tx, ty) => {
    const s = window.__scene;
    for (let y = ty; y < ty + 40; y++) if (s.level.tileAt(tx * 16 + 8, y * 16 + 8) >= 2) return y;
    return ty;
  };
  // o Carrasco Coroado. O colosso: parado, o punho segue o cavaleiro; quando trava, ele sai para o lado, pula a
  // onda e bate no punho caído; quando a cabeça desce, fica longe do meio, pula a onda do impacto e bate na
  // máscara. O espelho: chega perto do carrasco dourado (ele vem junto, do outro lado do meio), bate e pula a
  // investida
  const crowned = (v) => {
    const s = window.__scene;
    const p = s.player;
    const b = s.boss;
    const bs = v.bs;
    bs.f = (bs.f || 0) + 1;
    if (!b || !b.alive || s.cinematic || p.frozen) return v.hold([]);
    if (b.sleeping) return v.hold(p.x < 61 * 16 + 12 ? [K.R] : []);
    const st = b.state;
    if (st !== bs.st) {
      bs.st = st;
      bs.since = bs.f;
    }
    const n = bs.f - bs.since;
    const C = b.c;
    const keys = [];
    // o pulo que está valendo: por quantos passos (60 por segundo) o pulo ainda fica apertado (4 é um pulinho:
    // a onda do chão passa embaixo)
    if (bs.jt > 0) {
      bs.jt--;
      keys.push(K.J);
    }
    // aonde ir e em quem bater (x em pixels)
    let to = null;
    let hit = null;
    const arm = b.arms.find((a) => a.st !== 'grip');
    if (st === 'slam' && arm && (arm.st === 'up' || arm.st === 'drop')) {
      if (arm.st === 'drop' || arm.t > arm.dur - 0.28) to = arm.tx + (arm.tx < C ? -60 : 60);
    } else if (st === 'slam' && arm && arm.st === 'rest') {
      if (!bs.hop) {
        bs.hop = true;
        bs.jt = 4;
      }
      if (p.onGround && !bs.jt) hit = arm.x;
    } else if (st === 'leanwind' || st === 'leandrop') {
      if (Math.abs(p.x - C) < 110) to = C + (p.x < C ? -120 : 120);
    } else if (st === 'leanrest') {
      if (n === 6) bs.jt = 4;
      if (n > 6) {
        if (Math.abs(p.x - C) > 64) to = C + (p.x < C ? -60 : 60);
        else hit = C;
      }
    } else if (st === 'mirror' || st === 'lungeback' || st === 'stagger') {
      // a primeira investida vem logo (no jogo, de 6 a 8 s depois de ele se formar)
      if (!bs.mir) {
        bs.mir = true;
        b.lungeT = 1.4;
      }
      const x = b.rect.centerX;
      if (Math.abs(x - p.x) > 66) to = x + (x > p.x ? -50 : 50);
      else hit = x;
    } else if (st === 'lungewind') {
      // pula no fim do preparo (a investida passa embaixo do pulo quase inteiro)
      if (n === 24) bs.jt = 22;
    } else if (st !== 'lunge') {
      // parado, na volta do punho e enquanto o colosso vira pó: à esquerda do meio, de frente para ele
      to = C - 110;
      if (Math.abs(p.x - to) <= 8 && p.facing < 0 && bs.f % 20 === 0) keys.push(K.R);
    }
    if (st !== 'slam' || !arm || arm.st !== 'rest') bs.hop = false;
    if (to != null && Math.abs(p.x - to) > 8) keys.push(to > p.x ? K.R : K.L);
    if (hit != null) {
      const d = hit >= p.x ? 1 : -1;
      if (p.facing !== d) keys.push(d > 0 ? K.R : K.L);
      else if (bs.f % 13 < 3) keys.push(K.X);
    }
    v.hold(keys);
  };
  // o Senhor de Vhalor. Anda até o estrado pulando a varrida que corre pelo chão, sobe com o pulo e o duplo
  // (a face do estrado tem 96 px), para na frente dele, ao alcance da pancada do Cetro, e apara: ataca no
  // fim da preparação. Tonto, ele leva o golpe com bônus. Antes de aparar não bate (o primeiro golpe
  // abaixo da metade da vida acorda a segunda fase, e na volta seguinte o trono sobe no pistão)
  const throne = (v) => {
    const s = window.__scene;
    const p = s.player;
    const b = s.boss;
    const bs = v.bs;
    bs.f = (bs.f || 0) + 1;
    if (!b || !b.alive || s.cinematic || p.frozen) return v.hold([]);
    const st = b.state;
    if (st !== bs.st) {
      bs.st = st;
      bs.since = bs.f;
    }
    const n = bs.f - bs.since;
    const vy = p.body.velocity.y;
    const tx = p.x / 16;
    const keys = [];
    // a ponta da varrida chegando (só na ida ela machuca): um pulo curto por cima dela; perto do estrado, o
    // pulo da subida já passa por cima
    bs.c = bs.c ?? 0;
    const w = b.whip;
    let climb = bs.c === 0 && p.onGround && tx > 68 && !bs.jt;
    if (w && !w.back && p.onGround && !bs.jt && Math.abs(w.y - p.body.bottom) < 20) {
      const ahead = (w.head - p.x) * -(Math.sign(w.end - w.x0) || -1);
      if (ahead > 0 && ahead < 90) {
        if (bs.c === 0 && tx > 65.5) climb = true;
        else bs.jt = 16;
      }
    }
    if (bs.jt > 0) {
      bs.jt--;
      keys.push(K.J);
    }
    // a subida: corre até a coluna 68, o pulo até o alto, solta um passo e o duplo até o alto (assim ele
    // chega na face do estrado já acima dela)
    if (bs.c < 4) {
      bs.cn = (bs.cn ?? 0) + 1;
      keys.push(K.R);
      if (climb) {
        bs.c = 1;
        bs.cn = 0;
      }
      if (bs.c === 1) {
        keys.push(K.J);
        if (bs.cn > 5 && vy >= 0) {
          bs.c = 2;
          bs.cn = 0;
        }
      } else if (bs.c === 2) {
        bs.c = 3;
        bs.cn = 0;
      } else if (bs.c === 3) {
        if (bs.cn < 5 || vy < 0) keys.push(K.J);
        if (p.onGround && p.body.bottom < 34 * 16 + 4) bs.c = 4;
      }
      return v.hold([...new Set(keys)]);
    }
    // no estrado: o lugar é a 79 px do meio dele (a pancada pega daí, e o golpe alcança o corpo)
    const want = b.x - 79;
    if (st === 'bashwind') {
      // aparar: solta um passo e aperta quatro, no fim da preparação
      if (n >= 16 && n < 20) keys.push(K.X);
    } else if (st === 'stagger' || (bs.par && (st === 'idle' || st === 'bashrec'))) {
      // aparado: bate até ele cair (a pancada que passou sem aparar não abre a guarda: espera a próxima). O
      // golpe empurra o cavaleiro para trás: entre um e outro ele volta para o lugar, senão o próximo não alcança
      bs.par = true;
      if (p.facing < 0 || (p.onGround && p.x < want - 4)) keys.push(K.R);
      if (p.facing > 0 && bs.f % 4 < 2) keys.push(K.X);
    } else if (Math.abs(p.x - want) > 6 && p.onGround) keys.push(want > p.x ? K.R : K.L);
    else if (p.facing < 0 && bs.f % 20 === 0) keys.push(K.R);
    v.hold(keys);
  };
  // o caminho inteiro lembrado (o que a verdade pede na coroa): as memórias menos a da noite, os
  // registros e as versões inteiras guardadas e confirmadas, sem corrupção
  const whole = () => {
    const p = window.__progress;
    const L = window.__lore;
    for (const id of Object.keys(L.MEMORIES)) if (id !== L.NIGHT) p.memories.add(id);
    for (const id of Object.keys(L.RECORDS)) p.seen.add('record:' + id);
    for (const id of Object.keys(L.VERSIONS)) {
      p.seen.add('kept:' + id);
      p.seen.add('confirm:' + id);
    }
    p.corruption = 0;
    p.save();
  };
  // sala comum: progresso, sala e, quando assentar, o cavaleiro no lugar
  const room = (o) => ({
    dur: o.dur,
    caps: o.caps,
    fadeIn: o.fadeIn,
    fadeOut: o.fadeOut,
    grade: o.grade,
    // trecho de chefe: acaba 'after' segundos depois de ele cair (down diz quando caiu)
    boss: !!o.boss,
    bossSeed: o.bossSeed,
    after: o.after,
    down: o.down || ((b) => !b.alive),
    setup(v) {
      v.progress({ abilities: o.ab || [], seen: o.seen || [], memories: o.memories || [], powers: o.powers || [], amber: o.amber || 0 });
      if (o.whole) whole();
      v.room(o.room, o.entry || '1', o.from || 'door');
    },
    ready: (v) => v.roomReady(),
    go(v) {
      const s = window.__scene;
      s.player.setWeapon(o.weapon || 'scythe');
      v.shield();
      if (o.calm !== false) v.calm();
      // as memórias e as páginas do diário ficam para quem joga (no vídeo, encostar numa abriria a lembrança
      // ou o aviso da página)
      for (const m of [...s.props.memories, ...s.fixtures.pages]) {
        m.taken = true;
        m.sprite.setVisible(false);
        m.glow.setVisible(false);
      }
      if (o.at) v.put(o.at[0], o.at[1] ?? ground(o.at[0], o.at[2] ?? 0), o.face);
      // a câmera olha mais para cima (num poço que sobe, o cavaleiro não fica colado na borda de cima)
      if (o.camY != null) s.camY = o.camY;
      if (o.boss && s.boss) {
        const b = s.boss;
        b.hp = b.maxHp * (o.boss.hp ?? 1);
        if (o.boss.mul) {
          const hit = b.hit.bind(b);
          b.hit = (from, dmg, ...rest) => hit(from, dmg * o.boss.mul, ...rest);
        }
        // as partes que levam golpe (os punhos e a máscara do colosso) têm o seu próprio
        const pm = o.boss.part ?? o.boss.mul;
        if (b.partHit && pm) {
          const ph = b.partHit.bind(b);
          b.partHit = (part, from, dmg, ...rest) => ph(part, from, dmg * pm, ...rest);
        }
      }
      o.go?.(v, s);
    },
    tick: o.tick,
  });

  window.__plan = {
    // ---------- a abertura ----------
    titulo: {
      dur: 5.5,
      grade: false,
      fadeIn: 0.8,
      card: { at: 0.9, to: 5.2, t: 'Como zerar', x: 'do começo ao chefe final' },
      // só o nome do jogo na tela de título: os botões do menu saem do quadro
      setup() {
        for (const q of document.querySelectorAll('#screen-menu .list, #screen-menu .foot, #screen-menu .confirm, #screen-menu .ended')) q.style.visibility = 'hidden';
      },
    },
    abertura: {
      dur: 7.5,
      grade: false,
      fadeOut: 0.6,
      setup(v) {
        v.stopScenes();
        window.__game.scene.start('intro');
      },
      // a terceira frase entra em 1,6 + 2 × 4,3 s: o trecho pega a segunda e a terceira
      ready: () => {
        const sc = window.__game.scene.getScene('intro');
        return sc && sc.scene.isActive() && sc.time.now - sc.start > 5200;
      },
    },
    ponte: room({
      room: 'ponte', entry: 'P', from: 'new', dur: 13, calm: false,
      caps: [{ at: 1.2, to: 12.6, k: '1 · Vespera', t: 'Ponte do Castelo', x: 'Ele acorda na chuva, sem nome. [A] [D] andam, [Espaço] pula e [J] ataca. O caminho é sempre para a direita.' }],
      // acordado (o levantar prende o cavaleiro), anda até o primeiro rastejante, bate e pula o vão da ponte
      tick: (v) => v.route([
        { for: 0.2 },
        { keys: [K.R], until: (c) => foe(c) < 58 },
        { tap: [K.X], for: 0.7 },
        { tap: [K.X], for: 0.7 },
        { keys: [K.R], until: (c) => c.x > 50.4 },
        { keys: [K.R, K.J], for: 0.4 },
        // o segundo rastejante, e para antes do segundo vão (o trecho acaba aqui)
        { keys: [K.R], until: (c) => c.ground && (foe(c) < 52 || c.x > 80.5) },
        { tap: [K.X], for: 0.6 },
        { tap: [K.X], for: 0.6 },
        { keys: [K.R], until: (c) => c.x > 80.5 },
      ]),
    }),
    esporas: room({
      room: 'catacumbas', ab: AB.vespera, seen: ['memory:vale'], at: [14, 42], face: 1, dur: 10.5, grade: DEEP,
      caps: [{ at: 0.3, to: 10.2, k: '1 · Vespera', t: 'As Esporas do Carrasco', x: 'No ossuário das Catacumbas. [F] dá dash, no chão e no ar: por cima dos espinhos. Agachado ([Ctrl]), o [F] desliza por baixo da parede baixa.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        // até as Esporas (a relíquia prende o cavaleiro uns 4 s)
        { keys: [K.R], until: () => has('dash') },
        { for: 0.35 },
        // desce para o chão de baixo e passa os espinhos com um pulo e o dash no ar
        { keys: [K.R], until: (c) => c.x > 41.2 },
        { keys: [K.R, K.J], for: 0.12 },
        { keys: [K.R, K.J], tap: [K.F], for: 0.3 },
        { keys: [K.R], until: (c) => c.ground && c.x > 50.4 },
        // agachado, o dash vira o deslize por baixo da parede que desce do teto (x 52 a 57): dois deslizes, e
        // para antes dos espinhos do outro lado
        { keys: [K.C], for: 0.1 },
        { keys: [K.C, K.R], tap: [K.F], for: 0.5 },
        { keys: [K.C, K.R], tap: [K.F], for: 0.5 },
        { keys: [K.C, K.R], until: (c) => c.x > 59.5 },
        { keys: [K.R], until: (c) => c.x > 63 },
      ]),
    }),
    sinos: room({
      room: 'sinos', ab: AB.sinos, seen: ['memory:vale', 'gate:catacumbas'], at: [38, 58], face: 1, dur: 12, camY: 84,
      caps: [{ at: 0.3, to: 11.7, k: '1 · Vespera', t: 'Galeria dos Sinos', x: 'Embaixo, as Garras de Ferro: no ar, encostado na parede, [Espaço] pula para a do outro lado, e o poço sobe. Lá em cima, a Pena do Eclipse dá o pulo duplo.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        { keys: [K.R], until: () => has('wall') },
        { for: 0.35 },
        // até o pé do poço, e sobe de uma parede para a outra
        { keys: [K.R], until: (c) => c.x > 49.2 },
        { keys: [K.R, K.J], until: (c) => c.wall !== 0 },
        { keys: (c) => climb(v, c), until: (c) => c.y < 15.9 },
        { keys: [K.R, K.J], until: (c) => c.ground },
        // na galeria, até perto da Pena (pegar ela abriria outra cena)
        { keys: [K.R], until: (c) => c.x > 62.5 },
      ]),
    }),
    sineiro: room({
      room: 'cripta', ab: AB.cidade, seen: before('sineiro'), dur: 15, boss: { hp: 0.56, mul: 1.6 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 1 de 10', t: 'O Sineiro', x: 'Pule a onda da martelada e agache na varrida. Quando ele investe e bate na parede, fica tonto: é a hora de bater.' }],
      tick: (v) => v.fight({ jump: ['slam', 'chargewind'], jumpAt: 4, crouch: ['sweepwind', 'sweep'], away: ['slamwind'], open: ['stun', 'slamrec', 'sweeprec', 'idle', 'walk'] }),
    }),
    // ---------- a Cidade-Catedral ----------
    cidade: room({
      room: 'praca', ab: AB.cidade, seen: before('arcebispo'), at: [64, 29], face: 1, dur: 8.5,
      caps: [{ at: 0.3, to: 8.2, k: '2 · Cidade-Catedral', t: 'A Praça do Cadafalso', x: 'A irmã Luzia, na escadaria, dá o Diário. [Esc] abre a pausa. A catedral está trancada por dentro: suba pela rua até os telhados e entre por cima.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        { keys: [K.R], until: (c) => c.x > 88.4 },
        { for: 1.5 },
        // a escadaria da catedral, num pulo, até a porta trancada (o [W] mostra que ela não abre)
        { keys: [K.R, K.J], for: 0.42 },
        { keys: [K.R], until: (c) => c.x > 100.6 },
        { for: 0.4 },
        { tap: [K.U], for: 0.3 },
      ]),
    }),
    arcebispo: room({
      // a luta da semente 3 mostra tudo da legenda: a chuva do dízimo e as duas aparadas
      room: 'altar', ab: AB.cidade, seen: before('arcebispo'), dur: 16.5, bossSeed: 3, boss: { hp: 0.45, mul: 2.2 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 2 de 10', t: 'O Arcebispo do Dízimo', x: 'O golpe por cima dá para aparar: ataque no instante do brilho. Pule o incensário rente ao chão e saia de baixo da chuva do dízimo.' }],
      // apara o incensário: o golpe sai 0,12 s antes do fim da preparação (a rápida, depois do sumiço, é mais
      // curta); parado ele não bate, para o golpe de aparar estar livre
      tick: (v) => v.fight({
        parry: ['swingwind'],
        parryAt: (b, d, n) => n >= Math.round(((b.quick ? 0.5 : 0.74) * b.speedMul - 0.12) * 60),
        jump: ['toss'],
        jumpAt: 2,
        away: ['tithe'],
        open: ['swingrec', 'stagger', 'glide'],
      }),
    }),
    // ---------- a Prisão ----------
    gancho: room({
      room: 'correntes', ab: AB.prisao, seen: before('carcereira'), at: [13, 41], face: 1, dur: 10.8, grade: DEEP,
      caps: [{ at: 0.3, to: 10.5, k: '3 · Prisão Subterrânea', t: 'O Gancho de Corrente', x: 'Desça pelo alçapão da praça. Na Sala das Correntes fica o Gancho: [E] prende na argola mais perto e puxa você até ela. [Espaço] no meio da puxada solta com impulso.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        // um pulo até o pedestal do Gancho
        { keys: [K.R], until: (c) => c.x > 15.4 },
        { keys: [K.R, K.J], until: () => has('hook') },
        { for: 0.4 },
        // da beira do pedestal, as quatro argolas do poço uma atrás da outra, e o pulo duplo até a saída
        { keys: [K.R], until: (c) => c.ground && c.x > 22.6 },
        ...link(),
        ...link(),
        ...link(),
        // a quarta: no meio da puxada, o pulo solta com impulso; no alto dele, o pulo duplo até a beira da
        // saída (só o impulso do fim da puxada e o duplo param uns pixels abaixo dela)
        { tap: [K.E], for: 0.2 },
        { until: (c) => !c.p.hook || c.p.hook.phase === 'back' || (c.p.hook.phase === 'pull' && Math.hypot(c.p.hook.tx - c.p.body.center.x, c.p.hook.ty - c.p.body.top - 14) < 38), for: 1.2 },
        { keys: [K.J], until: (c) => c.p.body.velocity.y > -60, for: 0.5 },
        { keys: [K.R, K.J], tap: [K.J], until: (c) => c.p.body.velocity.y > 0, for: 0.6 },
        { keys: [K.R], until: (c) => c.ground },
        { keys: [K.R], until: (c) => c.x > 56 },
      ]),
    }),
    carcereira: room({
      room: 'mascara', entry: 'O0', ab: AB.fosso, seen: before('carcereira'), dur: 16, after: 5, grade: DEEP, boss: { hp: 0.4, mul: 2.5 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 3 de 10', t: 'A Carcereira', x: 'Agache na corrente na altura do peito, pule a que varre o chão e saia da linha do gancho. Vencida, o chão da sala se abre para o Fosso.' }],
      tick: (v) => v.fight({ jump: ['sweep'], jumpAt: 1, crouch: ['lash', 'lashwind'], away: ['hookwind', 'hook'], open: ['lashrec', 'sweeprec', 'stagger', 'idle', 'walk'] }),
    }),
    // ---------- o Fosso ----------
    sombra: room({
      room: 'abismo', ab: AB.fosso, seen: before('sombra'), dur: 21, after: 8.5, boss: { hp: 0.38, mul: 2.6 },
      caps: [
        // a primeira da lista que estiver valendo é a que aparece: a do fim vem antes
        { down: true, at: 2.2, to: 8.2, k: '4 · Fosso dos Esquecidos', t: 'O Véu Abissal', x: 'Vencida, a Sombra volta para ele: o [F] atravessa golpes, grades de cela e membranas abissais.' },
        { at: 0.4, to: 8.5, k: 'Chefe 4 de 10', t: 'A Sombra do Carrasco', x: 'No fundo do Fosso. Apare a machadada no fim da preparação. Quando ela afunda, as bolhas avisam onde o gêiser sobe: saia de cima.' },
      ],
      // apara a machadada 0,12 s antes do fim da preparação (parada, ela não leva golpe: o de aparar fica livre)
      tick: (v) => v.fight({
        parry: ['cleavewind'],
        parryAt: (b, d, n) => n >= Math.round((0.62 * b.speedMul - 0.12) * 60),
        jump: ['rush'],
        jumpAt: 1,
        away: ['well', 'geyser', 'throw'],
        open: ['cleaverec', 'rushrec', 'stagger', 'glide', 'emerge'],
      }),
    }),
    // ---------- as Minas ----------
    minas: room({
      room: 'trilhos', ab: AB.minas, seen: before('reflexo'), powers: ['lembranca'], amber: 3, at: [15, 24], face: 1, dur: 9, calm: false,
      caps: [{ at: 0.3, to: 8.7, k: '5 · Minas Abandonadas', t: 'Os poderes de memória', x: 'O primeiro golpe numa criatura das Minas traz a Lembrança: [Q] gasta duas contas de Âmbar e para o mundo por um instante. Cada golpe que entra enche as contas de novo.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        { keys: [K.R], until: (c) => foe(c) < 60 },
        // o mundo para: só o cavaleiro anda e bate
        { tap: [K.Q], for: 0.35 },
        { keys: (c) => (c.n % 14 < 4 ? [K.X] : []), for: 1.7 },
        // o vão dos trilhos, com o pulo duplo
        { keys: [K.R], until: (c) => c.x > 36.4 },
        { keys: [K.R, K.J], for: 0.36 },
        { keys: [K.R], for: 0.05 },
        { keys: [K.R, K.J], until: (c) => c.ground },
        // o deslize por baixo da viga baixa (x 60 e 61) e o mineiro do outro lado
        { keys: [K.R], until: (c) => c.ground && c.x > 57.4 },
        { keys: [K.C], for: 0.1 },
        { keys: [K.C, K.R], tap: [K.F], for: 0.5 },
        { keys: [K.C, K.R], until: (c) => c.x > 62.8 },
        { keys: [K.R], until: (c) => foe(c) < 50 || c.x > 67 },
        { tap: [K.X], for: 0.45 },
        { tap: [K.X], for: 0.45 },
      ]),
    }),
    reflexo: room({
      room: 'espelhos', ab: AB.minas, seen: before('reflexo'), powers: ['lembranca'], dur: 11, boss: { hp: 0.5, mul: 1.6 },
      caps: [{ at: 0.4, to: 10.6, k: 'Chefe 5 de 10', t: 'O Reflexo', x: 'O espelho devolve tudo o que você fez, com atraso. Bata nele e saia do lugar onde o seu próprio golpe vai cair.' }],
      tick: (v) => v.fight({ open: ['fight'], keep: 60, reach: 34, wakeX: 36 }),
    }),
    capataz: room({
      room: 'capataz', ab: AB.minas, seen: before('capataz'), powers: ['lembranca', 'eco'], dur: 16, boss: { hp: 0.32, mul: 3 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 6 de 10', t: 'O Capataz de Âmbar', x: 'Pule a fileira de cristais e a investida: na parede ele fica tonto. Quando o apito toca, a chapa da prensa cai onde está a sombra.' }],
      tick: (v) => v.fight({ jump: ['slam', 'charge'], jumpAt: 2, away: ['throwwind', 'throw', 'whistle', 'slamwind'], open: ['stun', 'slamrec', 'stagger', 'idle', 'walk'] }),
    }),
    // ---------- a Floresta ----------
    floresta: room({
      room: 'cabana', ab: AB.floresta, seen: before('cacador'), at: [29, 29], face: 1, dur: 10.8,
      caps: [{ at: 0.3, to: 10.5, k: '6 · Floresta Nevada', t: 'O Retalho Vermelho', x: 'Pendurado na porta da cabana: no ar, segure [Espaço] para planar. Nas correntes de ar que sobem, ele leva você para cima.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        { keys: [K.R], until: () => has('cape') },
        { for: 0.35 },
        // sai da cabana, pula duas vezes e plana segurando o pulo
        { keys: [K.R], until: (c) => c.x > 57.5 },
        { keys: [K.R, K.J], for: 0.36 },
        { keys: [K.R], for: 0.05 },
        { keys: [K.R, K.J], until: (c) => c.x > 74 },
        { keys: [K.J], until: (c) => c.ground },
      ]),
    }),
    cacador: room({
      room: 'clareira', ab: AB.vale, seen: before('cacador'), dur: 16, boss: { hp: 0.38, mul: 3 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 7 de 10', t: 'O Mestre da Caça', x: 'Apare a estocada: ataque no fim da preparação. Saia de baixo do salto com a lança. Na nevasca, siga a lanterna: ela pisca duas vezes antes da investida, que também dá para aparar.' }],
      // a trompa (os lobos) fica para quem joga
      go: (v, s) => {
        s.boss.hornUsed = [true, true];
      },
      // apara a estocada (no fim da preparação) e a investida da nevasca (quando ela chega perto); na neve
      // ele só investe de longe (mais de 120 px), então o cavaleiro espera parado, de frente para a lanterna
      tick: (v) => v.fight({
        parry: ['thrustwind', 'rush'],
        parryAt: (b, d, n) => (b.state === 'rush' ? d < 240 : n >= 20),
        still: ['stalk', 'blink'],
        away: ['leapwind', 'leap'],
        open: ['thrustrec', 'land', 'rushrec', 'stagger', 'rage'],
      }),
    }),
    // ---------- o Vale ----------
    vale: room({
      room: 'gruta', ab: AB.vale, seen: before('barqueiro'), at: [64, 20], face: 1, dur: 14,
      caps: [{ at: 0.3, to: 13.7, k: '7 · Vale das Cachoeiras', t: 'A Concha do Rio', x: 'Na gruta atrás da cachoeira: com ela você nada para todos os lados e mergulha sem perder o fôlego. [Espaço] dá uma braçada.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        { keys: [K.R], until: () => has('swim') },
        { for: 0.35 },
        // volta e mergulha no poço; por baixo da pedra, a passagem até a câmara do baú
        { keys: [K.L], until: (c) => c.p.swim },
        // primeiro afunda sem braçada (na linha d'água o [Espaço] pula para fora)
        { keys: [K.D], until: (c) => c.y > 25.5, for: 2 },
        { keys: (c) => (c.n % 26 < 4 ? [K.D, K.J] : [K.D]), until: (c) => c.y > 32.2 },
        // a passagem embaixo da pedra (linhas 31 a 33) só cabe ele rente ao fundo: segura para baixo junto
        { keys: (c) => (c.n % 26 < 4 ? [K.D, K.R, K.J] : [K.D, K.R]), until: (c) => c.x > 68.6 },
        { keys: (c) => (c.n % 26 < 4 ? [K.U, K.R, K.J] : [K.U, K.R]), until: (c) => c.y < 31.4 },
        { keys: [K.R, K.J], for: 0.4 },
        { keys: [K.R], until: (c) => c.ground || c.x > 74 },
      ]),
    }),
    barqueiro: room({
      room: 'cais', ab: AB.torres, seen: before('barqueiro'), dur: 16, boss: { hp: 0.36, mul: 2.8 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 8 de 10', t: 'O Barqueiro', x: 'A varrida mira onde você pisa: pule a baixa e agache na alta. Dois golpes na corda do gancho arrebentam. Na metade ele afunda, e as bolhas seguem você.' }],
      tick: (v) => v.fight({ jump: ['sweep', 'slam'], jumpAt: 1, away: ['ropewind', 'jabwind', 'bubbles'], open: ['sweeprec', 'slamrec', 'jabrec', 'stagger', 'idle', 'pole'] }),
    }),
    // ---------- as Torres ----------
    torres: room({
      room: 'calha', ab: AB.torres, seen: before('vhalor'), at: [155, 34], face: 1, dur: 9.5,
      caps: [{ at: 0.3, to: 9.2, k: '8 · Torres Rúnicas', t: 'A Capa de Luz', x: 'No pilar sobre o mar de nuvens: depois do pulo duplo, [Espaço] de novo voa mais um trecho, até três vezes. Os lumes do caminho devolvem as luzes.' }],
      tick: (v) => v.route([
        { for: 0.3 },
        { keys: [K.R], until: () => has('light') },
        { for: 0.4 },
        // o pulo, o duplo e as luzes até a outra margem: cada luz quando ele começa a cair abaixo de um bloco
        // e meio acima da borda da calha (linha 21; assim fica no ar sem subir demais), e os lumes do caminho
        // enchem as luzes de novo. Passada a parede (coluna 186), cai na calha
        { keys: [K.R, K.J], until: apex, for: 0.6 },
        { keys: [K.R], for: 0.03 },
        { keys: [K.R, K.J], until: apex, for: 0.6 },
        { keys: (c) => lightHop(v, c, 19.5, 186), until: (c) => c.ground },
        { keys: [K.R], for: 0.4 },
      ]),
    }),
    // as quatro runas do pátio: as três de longe já acesas, e o golpe acende a do terraço
    runas: room({
      room: 'patio', ab: AB.final, seen: before('vhalor'), at: [104, 40], face: 1, dur: 7, fadeOut: 0.5,
      caps: [{ at: 0.3, to: 6.8, k: '8 · Torres Rúnicas', t: 'O Pátio das Runas', x: 'Um golpe acende cada runa por 14 segundos. As quatro acesas juntas (no chão, no pedestal, no terraço e no alto da coluna) abrem a porta do terraço.' }],
      go: (v, s) => {
        for (const r of s.torres.runes) if (Math.abs(r.x - (110 * 16 + 8)) > 40) r.t = 9;
      },
      tick: (v) => v.route([
        { for: 0.5 },
        { keys: [K.R], until: (c) => c.x > 107.2 },
        { tap: [K.X], for: 0.4 },
        // a luz corre das runas até a porta, e ele entra (a porta é a da coluna 125: o [W] vale a 14 px dela)
        { for: 2.2 },
        { keys: [K.R], until: (c) => c.x > 124.8 },
        { for: 1.4 },
        { tap: [K.U], for: 1 },
      ]),
    }),
    vhalor: room({
      // a entrada é embaixo, no poço que desce para as Engrenagens: o cavaleiro começa no chão do salão
      room: 'trono', ab: AB.final, seen: before('vhalor'), at: [12, 40], face: 1, dur: 16, boss: { hp: 0.25, mul: 4 },
      caps: [{ at: 0.4, to: 9, k: 'Chefe 9 de 10', t: 'O Senhor de Vhalor', x: 'Ele luta do trono, com os cabos do teto, a varrida e as runas do chão. Suba no estrado: de perto ele bate com o Cetro, e essa pancada dá para aparar.' }],
      // os ecos dos guardas ficam para quem joga (o vídeo mostra o trono)
      go: (v, s) => {
        s.boss.echoT = 1e9;
      },
      tick: (v) => throne(v),
    }),
    coroado: room({
      // o colosso cai no terceiro golpe na máscara; o carrasco dourado, em quatro
      room: 'nucleo', ab: AB.final, seen: before('coroado'), whole: true, dur: 28, boss: { hp: 0.69, mul: 5.5, part: 2.6 },
      caps: [
        { on: (s) => s.boss && s.boss.state === 'form', at: 0.3, to: 9, k: 'Chefe final', t: 'O carrasco dourado', x: 'Depois ele vira o seu reflexo dourado, do outro lado do meio: chegue perto e bata. Na investida, pule ou apare.' },
        { at: 0.4, to: 13, k: 'Chefe final', t: 'O Carrasco Coroado', x: 'Primeiro o colosso: saia de baixo do punho, pule a onda e bata no punho caído. Quando a cabeça desce até o terraço, bata na máscara.' },
      ],
      // os golpes do colosso na ordem do vídeo: o punho e a cabeça (e de novo, se o dano não bastar)
      go: (v, s) => s.boss.queue.push('slam', 'lean', 'slam', 'lean', 'slam', 'lean'),
      tick: (v) => crowned(v),
    }),
    // continua do Carrasco Coroado vencido: o cavaleiro vai até ele, de joelhos, e [W] abre a escolha
    fim: {
      dur: 10.5,
      fadeOut: 1.8,
      caps: [{ at: 0.4, to: 7, w: 320, k: 'O fim', t: 'A coroa', x: 'Vencido, ele ajoelha e oferece a coroa. Os três finais dependem do que você lembrou no caminho: as memórias, os registros e as rachaduras da máscara.' }],
      card: { at: 7.6, to: 11, center: true, dim: 0.55, t: 'Eclipse of the Forgotten', x: 'enio-123.github.io/Eclipse-of-the-forgotten' },
      setup() {
        this.theme = false;
      },
      tick(v, t) {
        const s = window.__scene;
        const b = s.boss;
        const p = s.player;
        // só no vídeo: o tema do título volta por baixo da escolha e fecha com o nome do jogo, como na abertura
        if (t >= 4.5 && !this.theme) {
          this.theme = true;
          window.__audio.music('title', 3);
        }
        // a escolha sai devagar antes do nome do jogo (ela fica aberta para quem joga)
        const crown = document.querySelector('#screen-crown');
        if (crown) crown.style.opacity = String(Math.max(0, Math.min(1, (7.4 - t) / 0.6)));
        if (!b || document.querySelector('#screen-crown.show')) return v.hold([]);
        // anda até ficar na frente dele (sem passar por cima) e espera a coroa nas mãos
        const dx = b.kneelAt.x - p.x;
        if (Math.abs(dx) > 26) return v.hold([dx > 0 ? K.R : K.L]);
        if (b.near(p.x) && p.onGround) {
          // toca o [W] (segurar não repete)
          v.bs.up = ((v.bs.up || 0) + 1) % 12;
          return v.hold(v.bs.up < 3 ? [K.U] : []);
        }
        v.hold([]);
      },
    },
  };
  window.__order = ['titulo', 'abertura', 'ponte', 'esporas', 'sinos', 'sineiro', 'cidade', 'arcebispo', 'gancho', 'carcereira', 'sombra', 'minas', 'reflexo', 'capataz', 'floresta', 'cacador', 'vale', 'barqueiro', 'torres', 'runas', 'vhalor', 'coroado', 'fim'];
})();
