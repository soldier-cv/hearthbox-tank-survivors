# 验收清单

> `typecheck` 通过不算跑通。改到玩家可见的东西，必须真跑起来并截图。

## 每次改动后的最小检查

```bash
cd ../hearthbox
pnpm dev
```

- [ ] 游戏出现在货架上，名字和简介正确
- [ ] 点进去不是黑屏，没有崩溃页
- [ ] 控制台没有红色报错

## 完整验收（发布前）

### 平台契约

- [ ] `dist/game.js` 里没有裸导入（搜 `from '@hearthbox/sdk'` 必须为 0 处）
- [ ] 全文没有 `requestAnimationFrame`、`navigator.getGamepads`、`localStorage`
- [ ] 全文没有 `document.`、`querySelector`、`innerHTML`
- [ ] `Math.random` 为 0 处（全部走 `ctx.random`）
- [ ] `game.json` 的 `id` 与 `defineGame({ id })` 一致

### 能玩

- [ ] 键盘能完成一局（WASD / 方向键 + 空格 + Shift）
- [ ] 手柄能完成一局（如果有手柄）
- [ ] 死亡后能重开，不用刷新页面
- [ ] 有明确的开始和结束
- [ ] 8 分钟能打到终焉要塞，击杀后进入胜利结算

### 平台能力

- [ ] 金手指面板出现 6 项，拖滑杆立刻生效（移动速度调到 2×，肉眼可见变快）
- [ ] 设置面板出现 4 项，关掉屏幕震动后不再震
- [ ] 成就面板出现 6 项，值与存档一致
- [ ] `god-mode` 打开后不再掉血
- [ ] `inf-bombs` 打开后炸弹数不减
- [ ] 关掉金手指后行为恢复原版

### 存档

- [ ] 打出新纪录后立刻退出，重进游戏纪录还在
- [ ] 刷新页面，进度还在
- [ ] 关掉标签页再打开，进度还在
- [ ] 去 `hearthbox` 玩个别的游戏再回来，本游戏存档没被串

### 画面

- [ ] 窗口拉大缩小，画面不变形、不糊
- [ ] 文字在 3 米外能看清（如果目标是电视）
- [ ] 没有元素跑到画面外
- [ ] 升级选卡时三张卡完整可见，焦点框清晰

### 性能

- [ ] 同屏 160 敌人时连续玩 5 分钟不掉帧
- [ ] DevTools Performance 里单帧 < 16ms
- [ ] 没有内存持续增长（Memory 面板连拍三次快照对比）

### 复现

- [ ] `play.html?...&debug=1&seed=42` 两次开局，敌人位置与选卡顺序一致
- [ ] `speed=0.5` 时游戏变慢但不卡顿

## 证据

截图存到 `evidence/`，命名 `功能-状态.png`：

```
evidence/
├── shelf.png            货架里能看到它
├── gameplay.png         正常游玩（同屏敌人多的时候）
├── levelup.png          三选一
├── boss.png             铁壁 / 终焉要塞
├── victory.png          通关结算
├── gameover.png         失败结算
├── cheat-panel.png      金手指面板
├── settings-panel.png   设置面板
├── status-panel.png     成就面板
└── save-restored.png    刷新后纪录还在
```

**没有截图的"完成"都是假的。**

## 踩坑记录

遇到问题时记在这里，下次不重复踩：

| 现象 | 原因 | 解法 |
|---|---|---|
| | | |
