import { defineGame, type GameContext, type GameInstance } from '@hearthbox/sdk';
import { CONFIG as C, COLORS } from './config';
import { declareOptions, resolveTuning, type Tuning } from './tuning';
import { drawTank, type TankPaint } from './draw/tank';

/**
 * 第 1 步：验证平台加载链路。
 *
 * 这一版不是游戏，是一个"能证明链路通了"的最小件：
 *   - 平台给了画布 → 我们画东西
 *   - 平台给了输入 → 我们读 p1.move
 *   - 平台给了可调项 → 面板里能拖滑杆，画面立刻变
 *   - 平台给了 storage → 退出重进，位置还在
 *
 * 走通之后再把地形、敌人、卡池逐块搬进来（docs/port.md 第 3 步）。
 */
export default defineGame({
  id: 'hearthbox.tank-survivors',

  async create(ctx: GameContext): Promise<GameInstance> {
    declareOptions(ctx);
    const tuning: Tuning = resolveTuning(ctx);

    // 存档往返：证明 ctx.storage 通。位置存的是逻辑坐标。
    const saved = ctx.storage.get<{ x: number; y: number }>('probe');
    const player = {
      x: saved?.x ?? C.width / 2,
      y: saved?.y ?? C.height / 2,
      angle: 0,
    };

    const paint: TankPaint = {
      body: COLORS.p1,
      light: COLORS.p1Light,
      tread: COLORS.tread,
    };

    let elapsed = 0;
    let saveTimer = 0;

    function update(dt: number): void {
      elapsed += dt;

      const speed = tuning.moveSpeed(190);
      const move = ctx.input.p1.move;
      player.x += move.x * speed * dt;
      player.y += move.y * speed * dt;

      // 朝向跟移动方向，没移动就保持。
      if (move.x !== 0 || move.y !== 0) {
        player.angle = Math.atan2(move.y, move.x);
      }

      // 边界：留出车体半径。
      const r = 14;
      player.x = Math.min(C.width - r, Math.max(r, player.x));
      player.y = Math.min(C.height - r, Math.max(r, player.y));

      // 每秒最多落盘一次（平台侧也有节流，这里只是别每帧都调）。
      saveTimer += dt;
      if (saveTimer >= 1) {
        saveTimer = 0;
        ctx.storage.set('probe', { x: player.x, y: player.y });
      }
    }

    function render(): void {
      const g = ctx.ctx2d;

      // 平台可能在上一局改过这些状态，每帧开头统一重置。
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.lineWidth = 1;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.imageSmoothingEnabled = true;

      g.fillStyle = COLORS.void;
      g.fillRect(0, 0, C.width, C.height);

      // 一层网格，用来确认坐标系与缩放是否正确。
      g.strokeStyle = COLORS.grid;
      g.beginPath();
      for (let x = 0; x <= C.width; x += C.tile) {
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, C.height);
      }
      for (let y = 0; y <= C.height; y += C.tile) {
        g.moveTo(0, y + 0.5);
        g.lineTo(C.width, y + 0.5);
      }
      g.stroke();

      // 呼吸光晕：证明 render 每帧都在跑，不是定格。
      const pulse = 0.12 + Math.sin(elapsed * 2) * 0.05;
      g.fillStyle = `rgba(242,177,60,${pulse})`;
      g.beginPath();
      g.arc(player.x, player.y, 34, 0, Math.PI * 2);
      g.fill();

      drawTank(g, player.x, player.y, player.angle, 14, paint);

      // HUD：证明 fillText 与中文渲染正常。
      g.fillStyle = COLORS.textBright;
      g.font = '18px monospace';
      g.fillText('坦克幸存者 · 链路验证', C.width / 2, 28);

      g.fillStyle = COLORS.text;
      g.font = '12px monospace';
      g.fillText('方向键 / WASD 移动 · 退出后位置会被记住', C.width / 2, C.height - 34);

      if (ctx.options.enabled('god-mode')) {
        g.fillStyle = COLORS.heal;
        g.fillText('无敌（金手指）已开启', C.width / 2, C.height - 16);
      }
    }

    return {
      update,
      render,
      dispose() {
        // 平台在退出时还会 flush 一次，这里只是确保最后一次位置被写到内存副本。
        ctx.storage.set('probe', { x: player.x, y: player.y });
      },
    };
  },
});
