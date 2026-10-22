/**
 * 放大测试页：单台车画很大，用来查结构问题（比例、层次、部件位置）。
 */

import { COLORS } from '../../src/config';
import { drawTank, type TankPaint } from '../../src/draw/tank';

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');

const PAINT: TankPaint = {
  body: COLORS.p1,
  light: COLORS.p1Light,
  tread: COLORS.tread,
  glow: COLORS.p1Light,
};

const BIG = 420;

function box(title: string, size: number, draw: (g: CanvasRenderingContext2D) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'box';
  const h = document.createElement('h3');
  h.textContent = title;
  wrap.appendChild(h);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    g.fillStyle = COLORS.ground;
    g.fillRect(0, 0, size, size);
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= size; i += 20) {
      g.moveTo(i + 0.5, 0);
      g.lineTo(i + 0.5, size);
      g.moveTo(0, i + 0.5);
      g.lineTo(size, i + 0.5);
    }
    g.stroke();
    draw(g);
  }
  wrap.appendChild(canvas);
  return wrap;
}

// 铁砧 · 四档，放大到 420px，能看清结构
for (const stage of [1, 2, 3, 4] as const) {
  root.appendChild(
    box(`铁砧 · 阶段 ${stage}`, BIG, (g) => {
      drawTank(g, BIG / 2, BIG / 2, -Math.PI / 2, 110, PAINT, stage, 'anvil', {
        t: 1.7,
        moving: true,
        speed: 1,
      });
    }),
  );
}

// 不同车型放大对比
const OTHERS: [string, string, string, string][] = [
  ['echo', '回声', COLORS.p2, COLORS.p2Light],
  ['bastion', '港湾', '#a8b4bc', '#e6eef4'],
  ['lance', '长矛', '#7ec8a0', '#d6f5e4'],
  ['furnace', '熔炉', '#d9663c', '#ffc8a8'],
  ['swarm', '蜂群', '#9b7fd4', '#e2d4ff'],
];

for (const [model, name, body, light] of OTHERS) {
  root.appendChild(
    box(`${name} · 王牌`, 280, (g) => {
      drawTank(g, 140, 140, -Math.PI / 2, 72, { body, light, tread: COLORS.tread, glow: light }, 4, model, {
        t: 1.7,
        moving: false,
        speed: 0,
      });
    }),
  );
}
