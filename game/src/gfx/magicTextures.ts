import Phaser from 'phaser';

// Desenhos pequenos das magias, feitos com mais pixels que o mundo (filtro suave e escala de redução,
// como as folhas no traço liso): a bolinha do eclipse e a Energia que o chefe deixa para o mago
const K = 4;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w * K;
  c.height = h * K;
  const g = c.getContext('2d')!;
  g.scale(K, K);
  return { c, g };
}

function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  const tex = scene.textures;
  if (tex.exists(key)) tex.remove(key);
  tex.addCanvas(key, c);
  tex.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  scene.registry.set(`${key}-scale`, 1 / K);
}

// a bolinha do Cajado do Eclipse: o disco escuro do sol apagado, a borda acesa e a coroa de fogo
function orb() {
  const { c, g } = canvas(16, 16);
  const cx = 8;
  const cy = 8;
  const corona = g.createRadialGradient(cx, cy, 2.6, cx, cy, 7.8);
  corona.addColorStop(0, 'rgba(255, 214, 140, 1)');
  corona.addColorStop(0.25, 'rgba(242, 140, 34, 0.95)');
  corona.addColorStop(0.6, 'rgba(200, 70, 20, 0.45)');
  corona.addColorStop(1, 'rgba(120, 30, 10, 0)');
  g.fillStyle = corona;
  g.beginPath();
  // a coroa irregular: línguas de fogo em volta
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 5.6 + (i % 2 ? 1.9 : 0.3) + Math.sin(i * 1.7) * 0.5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  g.fillStyle = '#ffe2a8';
  g.beginPath();
  g.arc(cx, cy, 3.4, 0, Math.PI * 2);
  g.fill();
  const core = g.createRadialGradient(cx - 0.6, cy - 0.6, 0.4, cx, cy, 3);
  core.addColorStop(0, '#2a1810');
  core.addColorStop(1, '#0c0605');
  g.fillStyle = core;
  g.beginPath();
  g.arc(cx, cy, 2.9, 0, Math.PI * 2);
  g.fill();
  // o brilho fino de um lado da borda
  g.strokeStyle = 'rgba(255, 246, 220, 0.9)';
  g.lineWidth = 0.5;
  g.beginPath();
  g.arc(cx, cy, 3.2, -2.4, -0.9);
  g.stroke();
  return c;
}

// a Energia do chefe: uma esfera clara com fios girando dentro (a cor da escola entra pelo tint)
function energy() {
  const { c, g } = canvas(22, 22);
  const cx = 11;
  const cy = 11;
  const halo = g.createRadialGradient(cx, cy, 2, cx, cy, 10.5);
  halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
  halo.addColorStop(0.35, 'rgba(235, 240, 255, 0.85)');
  halo.addColorStop(0.7, 'rgba(200, 210, 240, 0.3)');
  halo.addColorStop(1, 'rgba(180, 190, 230, 0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(cx, cy, 10.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  g.lineWidth = 0.7;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.ellipse(cx, cy, 6.4, 2.4, (i * Math.PI) / 3 + 0.3, 0, Math.PI * 2);
    g.stroke();
  }
  const core = g.createRadialGradient(cx, cy, 0.5, cx, cy, 3.6);
  core.addColorStop(0, 'rgba(255, 255, 255, 1)');
  core.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(cx, cy, 3.6, 0, Math.PI * 2);
  g.fill();
  return c;
}

// os desenhos da habilidade no HUD (brancos: a cor da escola entra pelo tint)
function glyph(draw: (g: CanvasRenderingContext2D) => void) {
  const { c, g } = canvas(20, 20);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g);
  return c;
}

// eclipse: o anel aceso em volta do disco escuro e a coroa de raios
function glyphEclipse(g: CanvasRenderingContext2D) {
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(10, 10, 4.2, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r1 = 6;
    const r2 = i % 2 ? 7.4 : 8.6;
    g.beginPath();
    g.moveTo(10 + Math.cos(a) * r1, 10 + Math.sin(a) * r1);
    g.lineTo(10 + Math.cos(a) * r2, 10 + Math.sin(a) * r2);
    g.stroke();
  }
}

// necromante: o Grimório aberto e a chama do eco subindo dele
function glyphNecro(g: CanvasRenderingContext2D) {
  g.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(10, 16.5);
    g.lineTo(10 + side * 7, 14.6);
    g.lineTo(10 + side * 7, 9);
    g.lineTo(10, 10.6);
    g.closePath();
    g.globalAlpha = 0.28;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
  }
  g.beginPath();
  g.moveTo(10, 10.6);
  g.lineTo(10, 16.5);
  g.stroke();
  // a chama: uma gota de pé, com a ponta torta
  g.beginPath();
  g.moveTo(10.4, 2.2);
  g.bezierCurveTo(12.8, 4.6, 12.6, 7.4, 10, 8.2);
  g.bezierCurveTo(7.6, 7.4, 7.8, 5, 10.4, 2.2);
  g.fill();
}

// véu abissal: um tentáculo de tinta subindo e se enrolando na ponta
function glyphVeu(g: CanvasRenderingContext2D) {
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(5.5, 18);
  g.bezierCurveTo(5, 12, 12, 13, 12.5, 8.2);
  g.bezierCurveTo(12.9, 4.6, 8.6, 3.6, 7.6, 6.2);
  g.stroke();
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(9.2, 6.6, 1.5, Math.PI * 0.9, Math.PI * 2.3);
  g.stroke();
  // gotas que pingam da curva
  g.beginPath();
  g.arc(15.4, 14.6, 1.1, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(13.6, 18, 0.8, 0, Math.PI * 2);
  g.fill();
}

// espaço: duas órbitas cruzadas e o núcleo (a cabeça do Cajado da Dobra)
function glyphEspaco(g: CanvasRenderingContext2D) {
  g.lineWidth = 1.2;
  for (const a of [-0.65, 0.65]) {
    g.beginPath();
    g.ellipse(10, 10, 8, 3.4, a, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(10, 10, 2.3, 0, Math.PI * 2);
  g.fill();
}

export function buildMagicTextures(scene: Phaser.Scene) {
  add(scene, 'orb-eclipse', orb());
  add(scene, 'mage-energy', energy());
  add(scene, 'skill-eclipse', glyph(glyphEclipse));
  add(scene, 'skill-necro', glyph(glyphNecro));
  add(scene, 'skill-veu', glyph(glyphVeu));
  add(scene, 'skill-espaco', glyph(glyphEspaco));
}
