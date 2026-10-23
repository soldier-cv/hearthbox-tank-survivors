# tank-survivors

炉边（Hearthbox）平台的俯视角射击游戏。

## 当前状态

```
阶段：全部系统已实现，可在 PC 浏览器完整游玩
```

- 仓库已初始化（`main` 分支，暂无远端）
- 源码在 `src/`（21 个模块，TypeScript）
- `legacy/` 是改造前的独立网页 demo，**只作参考、不参与构建、不要修改**
- 产物：`dist/game.js`（约 290 KB / 23 模块，单文件 ESM，SDK 已内联）

**已跑通的链路**：标题页 → 机库（4 页签：坦克 / 地图 / 威胁 / 战绩）→ 开局 →
战斗（8 分钟、波次、BOSS、选卡、双人分屏）→ 结算 → 废铁落盘 → 机库读回。

**尚未验证的**：`docs/acceptance.md` 的完整验收清单。目前只做了"能跑"级的
smoke 验证（见该文件末尾的"已验证"一节），不是逐项跑完。

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
├── game.json          平台清单（id / 分辨率 / 输入 / 指针）
├── package.json       只依赖 @hearthbox/sdk（file: 指向平台仓库）
├── vite.config.ts     三套产物：game / sheet / zoom
├── tsconfig.json
├── docs/              设计文档（事实来源，代码要服从它）
│   ├── pitch.md       玩法一页纸
│   ├── levels.md      阶段、波次、BOSS、地形专属节点
│   ├── skills.md      5 流派的设计意图（为什么这样分）
│   ├── cards.md       25 张卡的完整数值、卡池规则、抽取权重
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
│   └── acceptance.md  验收清单 + 已验证记录
├── src/               平台游戏源码（21 个模块）
│   ├── main.ts        入口：defineGame + 状态机编排 + 结算落盘
│   ├── config.ts      常量 / 阶段倍率 / 威胁表 / 实体上限
│   ├── tuning.ts      可调量三层 + declareOptions + resolveTuning
│   ├── save.ts        存档归一化 + 解锁 / 强化 / 结算
│   ├── stats.ts       底盘换算 + 等级缩放 + 武器形态 + 签名表
│   ├── game.ts        玩家 / 敌人 / 子弹 / 卡池 / 波次 / BOSS
│   ├── world.ts       5 套地形生成 + 通行 / 视线 / 可破坏
│   ├── camera.ts      分屏滞回判定 + 转场 + 边界钳制
│   ├── render.ts      双视口裁剪绘制 + 地形 / 实体 / 覆盖层
│   ├── ui.ts          标题 / 机库 / HUD / 选卡 / 暂停 / 结算
│   ├── input.ts       归一成动作（菜单只认 P1）
│   ├── fx.ts          对象池 + 分层绘制 + 并发上限
│   ├── audio.ts       25 种音效运行时合成
│   ├── rng.ts         逻辑随机 + 独立特效流
│   ├── draw/tank.ts   坦克参数化绘制（分层 + 王牌动效）
│   ├── draw/color.ts  明暗派生 + 缓存
│   └── data/          坦克 / 卡 / 敌人 / 地图 / 剪影 数据表
├── tools/sheet/       画笔刷预览页（不进平台产物）
├── tools/zoom/        放大测试页（不进平台产物）
├── dist/game.js       构建产物（git 不跟踪）
├── legacy/            改造前的独立网页 demo（只作参考，不参与构建）
└── evidence/          验收截图
```

## 怎么跑

```bash
cd tank-survivors
pnpm install --ignore-workspace      # 只在首次或依赖变更后
npx vite build                       # 产出 dist/game.js

cd ../hearthbox
pnpm dev                             # 打开 http://127.0.0.1:5199/
```

改代码后重新 `npx vite build`，刷新页面即可，不用重启 dev server。

**两个工具页**（不在平台产物里）：

```bash
npx vite build --mode sheet   # dist-sheet/ 画笔刷：8 台 × 4 档 × 5 涂装 + 28px 真尺寸行
npx vite build --mode zoom    # dist-zoom/ 放大 420px 查比例与层次
```

它们是构建产物，需要用静态服务器打开（`file://` 下 Vite 的 ESM 不能加载）。

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

## 怎么验收

`docs/acceptance.md` 是唯一标准。**`typecheck` 通过不算跑通，必须有截图。**

该文件末尾有"已验证（smoke 级）"一节，记录**真正跑过**的项目，以及一份
"已知未验证"清单。不要把两者混为一谈。

## 已知的平台限制

| 限制 | 影响 | 对策 |
|---|---|---|
| 可调项面板不支持手柄（平台 M3） | 电视上打不开金手指/设置面板 | 游戏内所有流程界面自己画在画布上 |
| `OptionsApi` 没有 setter，只能 declare | 成就/统计做不成可调项：已保存值会覆盖 declare 默认值，数字永远停在第一次写入 | 成就改在机库「战绩」页签实时读存档；等平台补 `setStatus` 再接 |
| `choice` 至少两项（`validate()` 强制） | 想用 choice 表达"单项展示"会直接在 `create()` 抛错 | 只读展示不要用可调项 |
| 不能打包 `.hbx`（平台 M2） | 只能本地开发，不能分发 | 等平台进度 |

## 写这个仓库时的经验

| 教训 | 说明 |
|---|---|
| 大文件一次写完必然编译失败 | 分模块写、每写完一块就 `tsc --noEmit`，比事后逐条修错误快得多 |
| `g.restore;` 少了括号不会报错 | 它是个合法表达式语句，只会静默泄漏状态。save/restore 计数要不平衡就立刻查 |
| 像素探针比肉眼截图可靠 | `getImageData` 采几个点判断"到底画没画"，比看截图猜快 |
| 平台校验比文档更严格 | 文档没写 `choice` 至少两项，但 `validate()` 会抛错。以代码为准 |
