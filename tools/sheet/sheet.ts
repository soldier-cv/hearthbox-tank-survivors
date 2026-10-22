/**
 * 画笔刷页。
 *
 * 用途：在一屏里并排看 8 台坦克 × 4 档外观 × 5 种涂装，
 * 并在真实尺寸（28px）下验证剪影是否可辨认。
 *
 * 关键：这里调用的 `drawTank` 与游戏完全相同 —— 不存在"设计稿和实际不一致"。
 */

import { COLORS } from '../../src/config';
import { drawTank, type DecalStage, type TankPaint } from '../../src/draw/tank';

interface ModelDef {
  model: string;
  code: string;
  name: string;
  paint: TankPaint;
}

// 八台坦克。涂装是默认的"出厂"，色板见 docs/tanks.md。
const MODELS: ModelDef[] = [
  {
    model: 'anvil',
    code: 'ANVIL-01',
    name: '铁砧',
    paint: { body: COLORS.p1, light: COLORS.p1Light, tread: COLORS.tread, glow: COLORS.p1Light },
  },
  {
    model: 'echo',
    code: 'ECHO-02',
    name: '回声',
    paint: { body: COLORS.p2, light: COLORS.p2Light, tread: COLORS.tread, glow: COLORS.p2Light },
  },
  {
    model: 'bastion',
    code: 'BASTION-03',
    name: '港湾',
    paint: { body: '#a8b4bc', light: '#e6eef4', tread: COLORS.tread, glow: '#c9f5fb' },
  },
  {
    model: 'lance',
    code: 'LANCE-04',
    name: '长矛',
    paint: { body: '#7ec8a0', light: '#d6f5e4', tread: COLORS.tread, glow: '#9ad14f' },
  },
  {
    model: 'furnace',
    code: 'FURNACE-05',
    name: '熔炉',
    paint: { body: '#d9663c', light: '#ffc8a8', tread: COLORS.tread, glow: COLORS.blast },
  },
  {
    model: 'arc',
    code: 'ARC-06',
    name: '电弧',
    paint: { body: '#6b8fd4', light: '#cfe0ff', tread: COLORS.tread, glow: COLORS.spark },
  },
  {
    model: 'swarm',
    code: 'SWARM-07',
    name: '蜂群',
    paint: { body: '#9b7fd4', light: '#e2d4ff', tread: COLORS.tread, glow: COLORS.drone },
  },
  {
    model: 'mk2',
    code: 'MK-II',
    name: '终焉',
    paint: { body: '#c0392b', light: '#ff9c8a', tread: COLORS.tread, glow: '#ffe6b0' },
  },
];

// 五种涂装。只换 body/light，履带与描边不变（docs/art.md 规则 3）。
const PAINTS: { id: string; name: string; body: string; light: string }[] = [
  { id: 'factory', name: '出厂', body: '', light: '' },
  { id: 'wasteland', name: '荒原棕', body: '#a8895c', light: '#e2c9a0' },
  { id: 'arctic', name: '极地白', body: '#d8e4ea', light: '#f7fbfd' },
  { id: 'night', name: '夜战黑', body: '#2b3238', light: '#6b7780' },
  { id: 'hazard', name: '警告黄', body: '#e8c33c', light: '#fff3b0' },
];

const STAGES: { stage: DecalStage; name: string; minLevel: number }[] = [
  { stage: 1, name: '原型', minLevel: 1 },
  { stage: 2, name: '定型', minLevel: 4 },
  { stage: 3, name: '精工', minLevel: 8 },
  { stage: 4, name: '王牌', minLevel: 12 },
];

// 游戏里坦克的碰撞半径 14 → 屏幕上直径 28px。
const GAME_RADIUS = 14;
const CELL = 150;

/** 预览页用一个固定时间点，让动效可复现（否则每次刷新都不一样）。 */
const PREVIEW_T = 1.7;

function makeCanvas(size: number, bg = true): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const g = canvas.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    if (bg) {
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
    }
  }
  return canvas;
}

function cell(
  label: string,
  sub: string,
  size: number,
  draw: (g: CanvasRenderingContext2D) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cell';
  const canvas = makeCanvas(size);
  const g = canvas.getContext('2d');
  if (g) draw(g);
  wrap.appendChild(canvas);
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `<b>${label}</b><br>${sub}`;
  wrap.appendChild(el);
  return wrap;
}

function section(title: string, note = ''): HTMLElement {
  const frag = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = title;
  frag.appendChild(h);
  if (note) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    frag.appendChild(p);
  }
  return frag;
}

function grid(): HTMLElement {
  const d = document.createElement('div');
  d.className = 'grid';
  return d;
}

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');

// ---- 0. 真实尺寸：这一行才是最重要的 ----
root.appendChild(
  section(
    '真实尺寸对照（直径 28px，即游戏中的实际大小）',
    '如果这一行认不出是哪台车，就说明剪影设计失败，跟颜色无关。',
  ),
);
{
  const row = document.createElement('div');
  row.className = 'row real-size';
  for (const m of MODELS) {
    const wrap = document.createElement('div');
    wrap.className = 'rs-cell';
    const canvas = makeCanvas(64);
    const g = canvas.getContext('2d');
    if (g) {
      drawTank(g, 32, 32, -Math.PI / 2, GAME_RADIUS, m.paint, 4, m.model, {
        t: PREVIEW_T,
        moving: true,
        speed: 1,
      });
    }
    wrap.appendChild(canvas);
    const lbl = document.createElement('div');
    lbl.className = 'label';
    lbl.textContent = m.name;
    wrap.appendChild(lbl);
    row.appendChild(wrap);
  }
  root.appendChild(row);
}

// ---- 1. 八台坦克 · 王牌外观 ----
root.appendChild(section('八台坦克 · 王牌外观（Lv12）', '每台车的炮塔形状、炮管形态、侧向结构都不同。'));
{
  const g1 = grid();
  for (const m of MODELS) {
    g1.appendChild(
      cell(m.name, `${m.code} · ${m.paint.body}`, CELL, (g) => {
        drawTank(g, CELL / 2, CELL / 2, -Math.PI / 2, 30, m.paint, 4, m.model, {
          t: PREVIEW_T,
          moving: true,
          speed: 1,
        });
      }),
    );
  }
  root.appendChild(g1);
}

// ---- 2. 一台车 · 四档外观 ----
root.appendChild(section('外观进化 · 以铁砧为例（Lv 1 / 4 / 8 / 12）'));
{
  const g2 = grid();
  const anvil = MODELS[0]!;
  for (const s of STAGES) {
    g2.appendChild(
      cell(s.name, `Lv ${s.minLevel}`, CELL, (g) => {
        drawTank(g, CELL / 2, CELL / 2, -Math.PI / 2, 30, anvil.paint, s.stage, anvil.model, {
          t: PREVIEW_T,
          moving: false,
          speed: 0,
        });
      }),
    );
  }
  root.appendChild(g2);
}

// ---- 3. 五种涂装 ----
root.appendChild(
  section('五种涂装 · 铁砧 Lv8', '只换车体色，履带 / 描边 / 炮塔形状都不变。'),
);
{
  const g3 = grid();
  const anvil = MODELS[0]!;
  for (const p of PAINTS) {
    const paint: TankPaint = {
      body: p.body || anvil.paint.body,
      light: p.light || anvil.paint.light,
      tread: anvil.paint.tread,
      glow: p.light || anvil.paint.glow,
    };
    g3.appendChild(
      cell(p.name, p.id, CELL, (g) => {
        drawTank(g, CELL / 2, CELL / 2, -Math.PI / 2, 30, paint, 3, anvil.model, {
          t: PREVIEW_T,
          moving: false,
          speed: 0,
        });
      }),
    );
  }
  root.appendChild(g3);
}

// ---- 4. 八台 × 四档 全表 ----
root.appendChild(section('全表：八台坦克 × 四档外观（32 种形态）'));
for (const m of MODELS) {
  const row = grid();
  for (const s of STAGES) {
    row.appendChild(
      cell(`${m.name} · ${s.name}`, m.code, 130, (g) => {
        drawTank(g, 65, 65, -Math.PI / 2, 26, m.paint, s.stage, m.model, {
          t: PREVIEW_T,
          moving: false,
          speed: 0,
        });
      }),
    );
  }
  root.appendChild(row);
}

// ---- 5. 动效说明 ----
root.appendChild(
  section(
    '动效（每台车 Lv12 的专属表现）',
    '预览页是静态截图；游戏里这些是循环播放的。',
  ),
);
{
  const notes: [string, string][] = [
    ['铁砧', '车体两侧稳定导轨呼吸脉动'],
    ['回声', '炮塔涡轮旋转；移动时车尾拖出速度环'],
    ['港湾', '六边形力场缓慢脉动'],
    ['长矛', '炮管导轨上的能量点向前流动'],
    ['熔炉', '车尾炉口火焰跳动（三条火舌）'],
    ['电弧', '车顶电弧每 0.18s 重新跳一次（折线抖动）'],
    ['蜂群', '四个小飞行器绕车体旋转'],
    ['终焉', '环绕炮塔的双弧旋转 + 八个蓄能点依次脉动'],
  ];
  const ul = document.createElement('ul');
  ul.className = 'notes';
  for (const [name, text] of notes) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${name}</b> — ${text}`;
    ul.appendChild(li);
  }
  root.appendChild(ul);
}

// ---- 6. 履带印子 ----
root.appendChild(
  section(
    '履带印子（地面残留）',
    '坦克移动时在身后留下的痕迹，会随时间淡出。',
  ),
);
{
  const row = document.createElement('div');
  row.className = 'row';
  const canvas = makeCanvas(560);
  canvas.style.width = '560px';
  canvas.style.height = '240px';
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = COLORS.ground;
    g.fillRect(0, 0, 560, 240);
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 560; i += 20) {
      g.moveTo(i + 0.5, 0);
      g.lineTo(i + 0.5, 240);
    }
    for (let i = 0; i <= 240; i += 20) {
      g.moveTo(0, i + 0.5);
      g.lineTo(560, i + 0.5);
    }
    g.stroke();

    drawTrackMarks(g);
  }
  row.appendChild(canvas);
  root.appendChild(row);
}

/**
 * 履带印子示意。
 *
 * 真实实现里这是一组"印子实体"：每条记录 生成时间 + 位置 + 朝向 + 半宽。
 * 逐帧按 age 计算透明度，超过生命期后从池中回收。
 */
function drawTrackMarks(g: CanvasRenderingContext2D): void {
  const marks = [
    { x: 60, y: 200, angle: -0.5, age: 0 },
    { x: 110, y: 175, angle: -0.45, age: 0.2 },
    { x: 160, y: 152, angle: -0.4, age: 0.4 },
    { x: 210, y: 133, angle: -0.35, age: 0.6 },
    { x: 262, y: 118, angle: -0.25, age: 0.8 },
    { x: 316, y: 108, angle: -0.15, age: 1.0 },
    { x: 370, y: 104, angle: -0.05, age: 1.2 },
    { x: 424, y: 104, angle: 0.02, age: 1.4 },
    { x: 478, y: 108, angle: 0.1, age: 1.6 },
  ];

  for (const m of marks) {
    const life = Math.max(0.12, 1 - m.age / 2.4);
    g.save();
    g.translate(m.x, m.y);
    g.rotate(m.angle);
    g.globalAlpha = life * 0.42;
    g.fillStyle = '#05070a';
    // 两条履带各留一道印
    for (const sign of [-1, 1]) {
      roundRect2(g, -11, sign * 9 - 3.2, 24, 6.4, 1.4);
      g.fill();
    }
    g.restore();
  }

  // 最后画一台车，说明这些印子是谁留下的
  const paint: TankPaint = {
    body: COLORS.p1,
    light: COLORS.p1Light,
    tread: COLORS.tread,
    glow: COLORS.p1Light,
  };
  drawTank(g, 510, 112, 0.08, 16, paint, 3, 'anvil', { t: 0, moving: true, speed: 1 });
}

function roundRect2(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}
