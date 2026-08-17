# Amsterdam Brewery Web Demo

这是 Amsterdam Brewery 当前的**玩法验收版本**。它先独立验证 7 天城市经营与 roguelike 循环；本阶段不承担 Unity 实现或迁移。

## 玩法闭环

1. 输入 Seed 开始一局。
2. 在 7 天 × 6 时段中探索 Amsterdam 地图。
3. 经营酿酒、酒吧、咖啡店、SmartShop、冲浪和学术产业。
4. 每天完成 3 个目标，并应对一个会真实改变规则的城市事件。
5. 第 7 天结算 meta 与遗产，选择一个永久升级后进入下一局。

金钱用于评分和遗产加成；不会在达到 `$300` 时提前终止一局。

## 启动

可直接双击 `index.html`。推荐通过本地静态服务器打开：

```bash
python3 -m http.server 18765 -d tools/prototype
```

然后访问：

```text
http://127.0.0.1:18765/?seed=42
```

`seed` 可替换为任意整数；相同 Seed 和相同操作应得到相同的玩法结果。

## 操作

- `W/A/S/D` 或方向键：移动（按下持续移动）
- 鼠标点击地图：移动到目标位置（点击运河会被改道到最近桥）
- `E`：进入或离开建筑
- `Space`：推进时间、确认小游戏操作
- `Q/W`：小游戏内调价或调节参数
- `X`：拒绝顾客
- `H`：帮助
- `Esc`：退出当前小游戏或界面
- `M`：切换音频静音（持久化到 `localStorage` 的 `ab_mute_v1`）
- 页面底部按钮：自动运行、推进时间、进入建筑、快速经营、新游戏、速度切换、静音切换
- 底部 `▶▶ 1×` 按钮循环切换 1×/2×/4× 步速（持久化到 `ab_speed_v1`）

## 规则说明

- **每日目标**：赚钱、服务、酿酒、探索和对话；进度单位与文案一致；每天至少含 1 项 Explore 或 Talk，确保当天可完成。
- **每日事件**：会修改对应产业收益、客流、封锁或声望，不是纯文字提示。
- **Meta**：目标奖励在 Run 结束时统一到账，不重复结算。
- **永久升级**：保存在浏览器 `localStorage` 的 `ab_meta_v2` 中；包括起始资金/库存、tip、XP、事件、meta、IPA 和额外事件能力。
- **教程偏好**：保存在 `ab_skip_tutorial` 中。
- **音频静音**：`ab_mute_v1`。
- **游戏步速**：`ab_speed_v1`（1× / 2× / 4×），与 mute 同策略不随 newRun 重置。

如需清空跨 Run 进度，在浏览器开发者工具执行：

```js
localStorage.removeItem('ab_meta_v2')
localStorage.removeItem('ab_skip_tutorial')
localStorage.removeItem('ab_mute_v1')
localStorage.removeItem('ab_speed_v1')
```

## 验证

打开 `test.html`。**当前 353/353 PASS**（基线 19 + 334 funify-v3 增项），覆盖：

- 数据契约（5 产业、事件 ID 唯一、升级 ID 唯一、modifier 都有 effect、冲浪入口、Seed 稳定）
- 运行时契约（目标生成数量、必须含 Explore/Talk、升级包含三张死亡升级）
- 首开 UX（fresh localStorage 看到模态、模态打开时 WASD 不生效、seed 输入框回车可启动）
- 运河改道（点击运河坐标会被改道到最近桥端）
- 完整闭环（自动运行 100s 内必达 ended；购买升级后 run +1 且 upgrades 增加且 ended 已复位）
- a11y（ARIA dialog / 自动聚焦 / focus-visible 卡片 / aria-live 消息播报 / prefers-reduced-motion）
- 仪式感与反馈（endGame 三档评级 / phase flash 风物诗 / confetti 粒子 / SFX 5 预设）
- NPC 风味诗（4 NPC × 3 段对话，run%3 切换；manual T 键 + autoStep 两处接入）
- 步速档（1×/2×/4× 循环 + `ab_speed_v1` 持久化 + speedMs floor 15ms 保护 + 按钮文字/样式切换）

### 手动验收

1. 用 `?seed=42` 开始。
2. 手动进入每个小游戏并完成一次。
3. 推进一天，确认目标和 modifier 更新。
4. 点击自动运行，确认第 7 天完成结算。
5. 选择升级，刷新页面并开始下一局，确认升级与 meta 保留。
6. 将浏览器缩到约 390px 宽，确认主要按钮仍可使用。

## 当前边界

- 这是桌面浏览器优先的 Canvas 原型，窄屏只提供基础可用布局。
- 没有后端、账号、云存档或多人模式。
- 不在这里定义 Web Demo 到 Unity 的迁移方式；该阶段在 Web Demo 玩法验收后另行讨论。