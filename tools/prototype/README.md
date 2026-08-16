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
- 页面底部按钮：自动运行、推进时间、进入建筑、快速经营、新游戏

## 规则说明

- **每日目标**：赚钱、服务、酿酒、探索和对话；进度单位与文案一致；每天至少含 1 项 Explore 或 Talk，确保当天可完成。
- **每日事件**：会修改对应产业收益、客流、封锁或声望，不是纯文字提示。
- **Meta**：目标奖励在 Run 结束时统一到账，不重复结算。
- **永久升级**：保存在浏览器 `localStorage` 的 `ab_meta_v2` 中；包括起始资金/库存、tip、XP、事件、meta、IPA 和额外事件能力。
- **教程偏好**：保存在 `ab_skip_tutorial` 中。

如需清空跨 Run 进度，在浏览器开发者工具执行：

```js
localStorage.removeItem('ab_meta_v2')
localStorage.removeItem('ab_skip_tutorial')
```

## 验证

打开 `test.html`。**当前 ≥ 145/145 PASS**（逐轮递增），覆盖：

- 数据契约（5 产业、事件 ID 唯一、升级 ID 唯一、modifier 都有 effect、冲浪入口、Seed 稳定、6 mini-game 真实地址绑定）
- 运行时契约（目标生成数量、必须含 Explore/Talk、升级包含三张死亡升级）
- 首开 UX（fresh localStorage 看到模态、模态打开时 WASD 不生效、seed 输入框回车可启动）
- 运河改道（点击运河坐标会被改道到最近桥端）
- 完整闭环（自动运行 100s 内必达 ended；购买升级后 run +1 且 upgrades 增加且 ended 已复位）
- Amsterdam 地图层（14 landmarks · 9 canals · 32 bridges；投影往返；canvas 边界；LOD 视口剔除；FPS 测量；静态层缓存）
- 端到端 smoke：mini-game 跑满 7 天后 Replica scene 仍稳定

### 手动验收

1. 用 `?seed=42` 开始。
2. 手动进入每个小游戏并完成一次。
3. 推进一天，确认目标和 modifier 更新。
4. 点击自动运行，确认第 7 天完成结算。
5. 选择升级，刷新页面并开始下一局，确认升级与 meta 保留。
6. 将浏览器缩到约 390px 宽，确认主要按钮仍可使用。
7. 点右下角 **🗺 Replica 开**，叠上真实 Amsterdam 地标/运河/桥层；确认图例数字 (12/9/32) 与右上角 FPS 数字。

## Replica 地图层 (map-replica-v1)

独立的真实 Amsterdam 渲染层，可在游戏内开关（右下角按钮）：

- **数据层** `data/amsterdam_geo.js`：14 landmarks (Wikipedia 公开坐标 + 2 个 mini-game venue anchor)、9 主运河 (UNESCO canal ring + Amstel + IJ)、32 桥（Magere Brug/Blauwbrug 等名桥 + 编号桥）。等距投影 (12 m/px)，bbox `{52.340, 4.850, 52.410, 4.965}`。
- **渲染层** `data/map_renderer.js`：viewport fit → 静态层缓存 → 桥视口剔除 + LOD → 地标 pin + 图例。`getReplSceneStats()` 一次性返回 counts / viewport / LOD / cache / fps。
- **6 mini-game 真实地址绑定** (`AMSTERDAM_GEO.MINI_BINDINGS`)：每个 mini-game industry 都绑定到一个真实 Amsterdam 地址，坐标在 bbox 内、距最近 landmark < 1 km。
- **数据源** 见 `CREDITS.md`。

### Runtime introspection

```js
// In the browser console (page open on index.html)
AB_TEST.getReplSceneStats()        // single-call summary
AB_TEST.minigameBindings           // 6 mini-game → Amsterdam address mapping
AMSTERDAM_GEO.stats()              // pure data counts
```

## 当前边界

- 这是桌面浏览器优先的 Canvas 原型，窄屏只提供基础可用布局。
- 没有后端、账号、云存档或多人模式。
- 不在这里定义 Web Demo 到 Unity 的迁移方式；该阶段在 Web Demo 玩法验收后另行讨论。
- Replica 层是 2D 抽象地图，不替代真实 OSM 矢量瓦片；坐标为公开来源，精度足够用于教学/玩法背景。