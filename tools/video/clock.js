// Relógio virtual para gravar o jogo quadro a quadro (entra antes do jogo, com page.addInitScript).
// Desligado, tudo segue o relógio de verdade (o carregamento). Ligado (__V.on), o tempo só anda quando o
// gravador manda: performance.now, Date.now, setTimeout, setInterval e requestAnimationFrame passam a
// contar o tempo do vídeo, e as animações de CSS (as transições da interface) andam junto, quadro a quadro.
(() => {
  const V = (window.__V = { on: false, now: 0, base: 0, timers: [], raf: [], seq: 1 });
  const perf = performance.now.bind(performance);
  const date = Date.now;
  const rST = window.setTimeout.bind(window);
  // a espera de verdade (para quem precisa esperar o navegador com o relógio virtual ligado)
  V.wait = (ms) => new Promise((r) => rST(r, ms));
  const rCT = window.clearTimeout.bind(window);
  const rSI = window.setInterval.bind(window);
  const rCI = window.clearInterval.bind(window);
  const rRAF = window.requestAnimationFrame.bind(window);
  const rCAF = window.cancelAnimationFrame.bind(window);
  let dateBase = 0;
  performance.now = () => (V.on ? V.base + V.now : perf());
  Date.now = () => (V.on ? dateBase + V.now : date());
  // os do relógio virtual têm número negativo
  const own = (id) => typeof id === 'number' && id < 0;
  window.setTimeout = (fn, ms = 0, ...a) => {
    if (!V.on) return rST(fn, ms, ...a);
    const id = -V.seq++;
    V.timers.push({ id, at: V.now + Math.max(0, Number(ms) || 0), fn, a });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...a) => {
    if (!V.on) return rSI(fn, ms, ...a);
    const id = -V.seq++;
    const every = Math.max(1, Number(ms) || 0);
    V.timers.push({ id, at: V.now + every, fn, a, every });
    return id;
  };
  window.clearTimeout = (id) => (own(id) ? (V.timers = V.timers.filter((t) => t.id !== id)) : rCT(id));
  window.clearInterval = (id) => (own(id) ? (V.timers = V.timers.filter((t) => t.id !== id)) : rCI(id));
  window.requestAnimationFrame = (fn) => {
    if (!V.on) return rRAF(fn);
    const id = -V.seq++;
    V.raf.push({ id, fn });
    return id;
  };
  window.cancelAnimationFrame = (id) => (own(id) ? (V.raf = V.raf.filter((r) => r.id !== id)) : rCAF(id));

  const run = (fn, a) => {
    try {
      if (typeof fn === 'function') fn(...a);
    } catch (e) {
      console.error('relógio virtual:', e && e.message, e && e.stack);
    }
  };
  // liga: daqui em diante o tempo é o do vídeo (começa de onde o relógio de verdade estava)
  V.start = () => {
    if (V.on) return;
    V.base = perf();
    dateBase = date();
    V.now = 0;
    V.on = true;
  };
  // anda ms: os timers vencem na ordem em que venceriam
  V.advance = (ms) => {
    const end = V.now + ms;
    for (let guard = 0; guard < 10000; guard++) {
      let next = null;
      for (const t of V.timers) if (t.at <= end && (!next || t.at < next.at || (t.at === next.at && t.id > next.id))) next = t;
      if (!next) break;
      V.now = Math.max(V.now, next.at);
      if (next.every) next.at += next.every;
      else V.timers = V.timers.filter((t) => t !== next);
      run(next.fn, next.a);
    }
    V.now = end;
  };
  // um quadro de tela: os requestAnimationFrame pendentes rodam com o tempo do vídeo
  V.frame = () => {
    const list = V.raf;
    V.raf = [];
    for (const r of list) run(r.fn, [V.base + V.now]);
  };
  // as animações de CSS andam o mesmo tanto (pausadas e empurradas à mão, para não correrem no tempo de verdade)
  V.css = (ms) => {
    for (const an of document.getAnimations()) {
      try {
        if (!an.__v) {
          an.__v = true;
          an.pause();
        }
        if (an.playState === 'finished') continue;
        an.currentTime = (an.currentTime || 0) + ms;
      } catch {
        // animação que acabou de sair da página
      }
    }
  };
})();
