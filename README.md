# 坦克幸存者 · TANK SURVIVORS

炉边（Hearthbox）平台的俯视角射击游戏。8 分钟一局：杀敌、升级、选卡、变强，最后击毁终焉要塞。

> **当前状态：设计完成，正在重写为平台游戏。**
> 仓库根目录的 `index.html` / `src/` 是旧 demo，只作参考，**从平台货架启动时不会用到它们**。
> 玩法、关卡、技能、坦克、敌人、地图体系见 `docs/`。

## 变化来源

| 维度 | 一句话 |
|---|---|
| **坦克底盘** | 8 台坦克，每台恒为 10 点属性分配——**差异在分配，不在强度** |
| **流派升级** | 5 流派 × 4 级 + 终极质变，每局三选一 |
| **敌人** | 11 种，靠行为区分不靠血量；4 个威胁等级决定兵种池 |
| **地图** | 5 张，草丛遮挡 / 冰面滑行 / 深水渡河 / 废墟倒塌——**战术选择，不是难度阶梯** |
| **动态分屏** | 双人靠近合屏、拉开分屏，滞回 + 0.22s 转场 |

## 怎么在平台上跑

```bash
# 1. 构建游戏
cd tank-survivors
pnpm install --ignore-workspace
npx vite build            # 产出 dist/game.js

# 2. 起平台（另开终端）
cd ../hearthbox
pnpm dev

# 3. 打开 http://127.0.0.1:5199/index.html
```

货物架上会出现「坦克幸存者」。改代码后重新 `npx vite build`，刷新页面即可。

调试参数：

```
http://127.0.0.1:5199/play.html?...&debug=1&seed=42&speed=0.5
```

## 操作（目标键位）

| 动作 | 手柄 | 键盘 |
|---|---|---|
| 移动 | 左摇杆 / D-pad | WASD / 方向键 |
| 瞄准 | 右摇杆（松开回自动瞄准） | 自动瞄准 |
| 冲刺 | A | 空格 |
| 炸弹 | X / RB | 左 Shift |
| 暂停 | Start | Esc / P |
| 菜单 | 方向键 + A | 方向键 + 空格 / Enter |

## 设计文档

| 文件 | 内容 |
|---|---|
| [`docs/pitch.md`](docs/pitch.md) | 玩法一页纸、第一分钟、不做什么 |
| [`docs/levels.md`](docs/levels.md) | 5 个阶段、14 个波次节点、两个 BOSS、地形专属节点 |
| [`docs/skills.md`](docs/skills.md) | 5 流派 × 4 级 + 终极，卡池与权重 |
| [`docs/tanks.md`](docs/tanks.md) | 8 台坦克、属性点、签名技能、涂装、废铁经济 |
| [`docs/enemies.md`](docs/enemies.md) | 11 种敌人、克制关系、预警、精英词缀、压力预算 |
| [`docs/maps.md`](docs/maps.md) | 5 张地图、草丛 / 冰面 / 深水 / 废墟、渡水 |
| [`docs/camera.md`](docs/camera.md) | 合屏 / 分屏判定、转场、按玩家刷怪 |
| [`docs/fx.md`](docs/fx.md) | 特效总线、科技风视觉、性能上限 |
| [`docs/systems.md`](docs/systems.md) | 全部数值表、平台可调项清单 |
| [`docs/art.md`](docs/art.md) | 21 色色板、绘制语言、字号 |
| [`docs/world.md`](docs/world.md) | 设定、角色、敌人型号、文案 |
| [`docs/port.md`](docs/port.md) | 从 demo 到平台游戏的改造路线 |
| [`docs/acceptance.md`](docs/acceptance.md) | 验收清单（**截图为准**） |

## 旧 demo

`index.html`、`styles.css`、`src/*.js`、根目录的 `*.png` 是改造前的独立网页版本。它仍然可以在浏览器里直接打开游玩，但：

- 它不满足平台契约（自有循环、自家输入、localStorage、DOM 界面）
- **不要修改它**——它是移植时的对照物，改了 diff 就失效
- 重写完成后会删除

## 技术栈

- TypeScript + Vite，产物是单文件 ESM `dist/game.js`
- 只依赖 `@hearthbox/sdk`（`file:../hearthbox/packages/sdk`）
- 纯 Canvas 2D 程序化绘制，**零外部素材**（无图片、无字体、无音频文件）
- 音效由 WebAudio 运行时合成
