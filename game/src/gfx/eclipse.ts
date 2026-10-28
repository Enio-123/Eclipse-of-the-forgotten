import Phaser from 'phaser';

// O novo Eclipse do final II ("ele vê um novo Eclipse cobrir Vespera"): maior que o pintado no céu e frio, a
// coroa lilás e branca com os fios finos, como no filme. Fica por cima do antigo: uma sombra da cor do céu em
// volta do disco apaga a coroa laranja da pintura.

const KEY = 'eclipse-new';
const SIZE = 256;
// o raio do disco na textura
const DISC = 40;

// onde o eclipse está pintado em cada céu (centro e raio do disco, em pixels do mundo)
export const SKY_ECLIPSE = {
  title: { x: 469.8, y: 84.8, r: 25.7 },
  bridge: { x: 819.8, y: 94.8, r: 25.7 },
  city: { x: 464.75, y: 74.75, r: 19.9 },
  vale: { x: 483.75, y: 55.75, r: 14.8 },
} as const;

function texture(scene: Phaser.Scene) {
  if (scene.textures.exists(KEY)) return;
  const c = scene.textures.createCanvas(KEY, SIZE, SIZE);
  if (!c) return;
  const ctx = c.getContext();
  const m = SIZE / 2;
  // a sombra do céu que cobre a coroa antiga
  let g = ctx.createRadialGradient(m, m, DISC, m, m, m);
  g.addColorStop(0, 'rgba(20,16,34,0.96)');
  g.addColorStop(0.45, 'rgba(22,18,38,0.78)');
  g.addColorStop(1, 'rgba(24,20,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // a coroa: lilás claro, forte rente ao disco
  g = ctx.createRadialGradient(m, m, DISC * 0.95, m, m, DISC * 2.6);
  g.addColorStop(0, 'rgba(236,226,255,0.9)');
  g.addColorStop(0.25, 'rgba(198,178,240,0.42)');
  g.addColorStop(1, 'rgba(160,130,220,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(m, m, DISC * 2.6, 0, Math.PI * 2);
  ctx.fill();
  // os fios da coroa, de comprimentos diferentes (sempre os mesmos)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  ctx.lineWidth = 1;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2 + (rnd() - 0.5) * 0.05;
    const l = DISC * (1.45 + rnd() * 1.1);
    ctx.strokeStyle = `rgba(240,232,255,${(0.12 + rnd() * 0.16).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(m + Math.cos(a) * DISC * 1.02, m + Math.sin(a) * DISC * 1.02);
    ctx.lineTo(m + Math.cos(a) * l, m + Math.sin(a) * l);
    ctx.stroke();
  }
  // o disco e a beira acesa
  ctx.fillStyle = '#06040a';
  ctx.beginPath();
  ctx.arc(m, m, DISC, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(250,246,255,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(m, m, DISC + 0.5, 0, Math.PI * 2);
  ctx.stroke();
  c.refresh();
}

// o eclipse maior por cima do pintado (r: o raio do pintado; k: quantas vezes maior)
export function bigEclipse(scene: Phaser.Scene, x: number, y: number, r: number, depth: number, k = 1.7) {
  texture(scene);
  return scene.add.image(x, y, KEY).setScale((r * k) / DISC).setDepth(depth);
}
