# tank-survivors

一个已经写好的俯视角射击游戏，**尚未接入 Hearthbox**。

## 这是什么

原生 HTML5 游戏：一个 `index.html` + 7 个 JS 文件，约 150 KB。不依赖任何框架或渲染库，纯 Canvas 2D。

现在能直接用浏览器打开 `index.html` 玩，但**平台加载不了它**——原因见下面「与平台的关系」。

## 目录

```
tank-survivors/
├── index.html        页面骨架，含标题页、暂停菜单、结算页的 DOM
├── styles.css        UI 样式
├── src/
│   ├── main.js       启动流程、主循环、菜单逻辑、HUD 更新
│   ├── game.js       游戏实体与规则（最大的文件）
│   ├── render.js     全部 Canvas 绘制
│   ├── input.js      键盘与手柄读取
│   ├── audio.js      WebAudio 音效合成
│   ├── world.js      地图与地形
│   └── util.js       数学工具、格式化、存档
├── *.png             截图（游戏过程、结算、升级界面等）
└── README.md
```

## 技术特征（接入前必须知道）

| 项 | 现状 |
|---|---|
| 加载方式 | 7 个 `<script>` 标签，靠 `window.TS` 全局串联 |
| 主循环 | 自有 `requestAnimationFrame`，**已经是固定步长 + 累积器 + 最多补 5 步** |
| 输入 | `navigator.getGamepads()` + 键盘事件监听 |
| 存档 | `localStorage` |
| UI | **55 处 DOM 操作**（17 `textContent`、15 `classList`、12 `querySelector`、6 `innerHTML`） |

外链脚本靠全局变量互相引用，不是模块。改造成平台游戏时这是第一个要处理的问题。

## 与平台的关系

**它不是一个 Hearthbox 游戏。** 按平台的要求（见 `../hearthbox/docs/game-sdk.md`），游戏必须是：

- 一个模块，默认导出 `defineGame()` 的结果
- 单文件 ESM，零 `import`
- 不自己跑循环、不自己读输入、不自己写 `localStorage`
- UI 画在画布内，不用 DOM

它现在这四条都不满足。

两条路：

1. **改造成平台游戏**——完整步骤和工时估算见 `../hearthbox/docs/tank-port.md`
2. **不改造**，它保持为一个独立网页游戏，不属于这个工作区的平台生态

现在它属于第 2 种状态：放在这里，但没接进来。

## 硬性规矩

- **不要修改它来迁就平台**，除非明确要接入。它现在是能跑的状态，改坏了得不偿失。
- **不要把它复制进 `hearthbox/`**。平台仓库只放平台自己的东西。
- 它的 `localStorage` 用的是自己的命名空间，和平台的 IndexedDB 完全隔离，互不影响。

## 怎么玩（现在）

用浏览器直接打开 `index.html`。它不经过平台，所以：

- 手柄能不能用取决于浏览器的 Gamepad API（PC 上可以，Android TV 上不可靠）
- 存档在 `localStorage` 里，清缓存就没了
- 没有平台的金手指、设置、成就面板

## 还没有的东西

- 没有 git。它不是独立仓库，只是放在工作区里的一个目录
- 没有 `game.json`，平台认不出它
- 没有构建配置，7 个脚本是分散加载的
