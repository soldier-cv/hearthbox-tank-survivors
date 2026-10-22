# tank-survivors

炉边（Hearthbox）平台的俯视角射击游戏。**正在从独立网页 demo 重写为平台游戏。**

## 当前状态

```
阶段：设计完成，准备进入垂直切片
```

- 仓库已初始化（`main` 分支，暂无远端）
- `src/`、`index.html`、`styles.css` 是**旧 demo**，只作参考，不参与构建
- `src` 会被 `src2`（平台游戏源码）取代，旧代码在重写完成后删除
- 新代码尚未开始，从 `src2/main.ts` 起步

**不要修改旧 demo 来"顺手修个 bug"。** 它是参考物，改了之后 diff 会失效，也无法再用来对照移植。

## 这是什么

8 分钟一局的俯视角坦克射击游戏。核心循环：杀敌 → 升级 → 选卡 → 变强 → 扛到最后 → 击杀终焉要塞。

三条支柱：

| 支柱 | 说明 |
|---|---|
| **坦克底盘** | 8 台坦克，每台恒为 10 点属性分配，差异在分配不在强度 |
| **坦克等级** | 每台独立 1–16 级：属性尺度 + 4 档外观 + 4 阶签名进化 |
| **流派升级** | 5 流派 × 4 级 + 终极质变，每局随机三选一 |
| **动态分屏** | 双人靠近合屏、拉开分屏，滞回 + 转场 |

另有两套"变化来源"：

| 变化来源 | 说明 |
|---|---|
| **敌人** | 11 种，靠行为区分不靠血量；4 个威胁等级决定兵种池 |
| **地图** | 5 张，草丛 / 冰面 / 深水 / 废墟；是战术选择，不是难度阶梯 |

三套成长各管一件事，**不能混**（见 `docs/tank-levels.md` 第 1 节）：

| 系统 | 时长 | 玩家获得 |
|---|---|---|
| 局内等级 | 一局 8 分钟 | 三选一卡（5 流派） |
| 坦克等级 | 永久，每台独立 | 属性尺度 + 外观 + 签名进化 |
| 解锁 | 永久，全账号 | 新坦克 / 地图 / 涂装 |

## 目录

```
tank-survivors/
├── AGENTS.md          本文件
├── docs/              设计文档（事实来源，代码要服从它）
│   ├── pitch.md       玩法一页纸
│   ├── levels.md      阶段、波次、BOSS、地形专属节点
│   ├── skills.md      5 流派 × 4 级 + 终极
│   ├── tanks.md       8 台坦克、属性点、涂装、废铁经济
│   ├── tank-levels.md 每台坦克独立的 1–16 级、外观进化、签名进化
│   ├── enemies.md     11 种敌人、克制、预警、精英词缀、压力预算
│   ├── maps.md        5 张地图、草丛/冰面/深水/废墟、渡水
│   ├── camera.md      合屏 / 分屏判定与转场
│   ├── fx.md          特效总线与科技风视觉
│   ├── systems.md     全部数值、平台可调项清单
│   ├── art.md         色板与绘制语言
│   ├── world.md       设定与文案
│   ├── port.md        改造路线（四步）
│   └── acceptance.md  验收清单
├── src/               旧 demo（参考用，不参与构建）
├── index.html         旧 demo 入口（参考用）
├── styles.css         旧 demo 样式（参考用）
└── *.png              旧 demo 截图
```

新代码的目录结构见 `docs/port.md` 第 2 节。

## 与平台的关系

**这是游戏仓库，只依赖 `@hearthbox/sdk`。**

| 允许 | 禁止 |
|---|---|
| 依赖 `@hearthbox/sdk`（用 `file:../hearthbox/packages/sdk`） | 依赖 `@hearthbox/runtime`、`@hearthbox/shell` |
| 读 `../../hearthbox/docs/` 作为契约参考 | 修改 `../hearthbox/` 里的任何东西 |
| 在本地跑 `pnpm dev` 验证 | 把游戏代码搬进平台仓库 |

平台文档在哪：

| 想查什么 | 看哪 |
|---|---|
| 游戏契约（生命周期、ctx 有什么） | `../hearthbox/docs/game-sdk.md` |
| 三层输入 | `../hearthbox/docs/input.md` |
| 金手指与数值分层 | `../hearthbox/docs/tuning.md`、`cheats.md` |
| 可调项架构 | `../hearthbox/docs/plugins.md` |
| 通用接入步骤 | `../hearthbox/docs/porting.md` |
| 本地怎么跑 | `../hearthbox/docs/local-dev.md` |

## 硬性规矩

1. **不自己跑循环。** 没有 `requestAnimationFrame`。平台每帧调 `update(dt)` / `render(alpha)`，`dt` 恒为 `1/60`。
2. **不自己读输入。** 没有 `navigator.getGamepads()`、没有 `addEventListener('keydown')`。只读 `ctx.input`。
3. **不自己写存档。** 没有 `localStorage`。只用 `ctx.storage`。
4. **不碰 DOM。** 没有 `document.*`、`querySelector`、`innerHTML`。所有 UI 画在 `ctx.ctx2d` 上。
5. **不用 `Math.random()`。** 一律 `ctx.random`，否则 `?seed=42` 复现不了。
6. **不写裸数值。** 常量进 `config.ts`，可调量进 `tuning.ts`。逻辑里出现 `1.5` 这种数字就是错。
7. **金手指只改 `tuning`。** 加一个金手指 = 加一行 `declare` + 在 `resolveTuning` 里加一行。逻辑层不知道金手指存在。
8. **设计文档是事实来源。** 代码和 `docs/` 冲突时，先改文档再改代码，不要反过来。

## 怎么跑

```bash
# 1. 构建游戏（产出 dist/game.js）
cd tank-survivors
pnpm install --ignore-workspace
npx vite build

# 2. 起平台（另开一个终端）
cd ../hearthbox
pnpm dev

# 3. 浏览器打开
# http://127.0.0.1:5199/index.html
```

改游戏源码后重新 `npx vite build`，刷新页面即可，不用重启 dev server。

调试参数：

```
http://127.0.0.1:5199/play.html?...&debug=1&seed=42&speed=0.5
```

## 怎么验收

`docs/acceptance.md` 是唯一标准。**`typecheck` 通过不算跑通，必须有截图。**

## 已知的平台限制

| 限制 | 影响 | 对策 |
|---|---|---|
| 可调项面板不支持手柄（平台 M3） | 电视上打不开金手指/设置面板 | 游戏内菜单自己画，不依赖平台面板 |
| `OptionsApi` 没有更新值的方法 | 成就面板只显示上次退出时的快照 | 接受，已记录在 `docs/systems.md` |
| 不能打包 `.hbx`（平台 M2） | 只能本地开发，不能分发 | 等平台进度 |
