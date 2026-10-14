# MAP02 地图几何 / 路线 / 存档兼容性事实清单（基线）

- 基线提交：`dad6b38c54fda94f541764242f61820d8177bd19`
- 探针：`baseline-probe.js`（仅 `node:fs` / `node:path` / `node:assert`，直接引用 `tools/prototype/reopening-city.js` 与 `tools/prototype/flower-network.js`，不重写碰撞或寻路）
- 产物：`baseline.json`（9 锚点、81 条有序路线、9 条合成 `C.restore` 检查、facts、limitations）
- 本文只记录现状事实与行号证据；不含视觉重设计、玩法提案。凡面向 F02 的未来要求，一律标注「提案」。
- 单位：全部为 1800×1120 画布上的逻辑游戏单位，不是米、不是真实地理距离，也不是通行时间。

## 1. 几何的所有者与消费者

| 文件 | 角色 | 证据 |
| --- | --- | --- |
| `tools/prototype/reopening-city.js` | 碰撞 / 寻路 / 移动 / 存档城市对象的唯一所有者：`LAND/WATERS/CROSSINGS/PLACES/BUILDINGS` 与 `walkable/rideable/onFerry/route/move/moveAlong/near/create/restore/toggleBike/parkBike`，全部 `Object.freeze` | `reopening-city.js:9-30,31-70,113-135,200-236,272-375` |
| `tools/prototype/flower-network.js` | 温室语义所有者；独立冻结两个城市坐标：`ENTRY={id:'garden',x:1510,y:690}`、`CART={x:1310,y:1040}`（CART 无 id） | `flower-network.js:8-9,33` |
| `tools/prototype/reopening-ui.js` | 几何的编排/消费者：存档读写、点击命中、路线发起、进入判定、骑车、搬花车跟随、相机 | `reopening-ui.js:6-12,139-142,407-441,585,611,704` |
| `tools/prototype/reopening-scene.js` | 纯渲染消费者：读取 `C.*` 常量绘制，并自含大量**不参与碰撞**的硬编码装饰坐标 | `reopening-scene.js:108-259,263-388` |
| `tools/prototype/reopening-core.js` | 仅消费坐标做一次范围校验：`gardenVisit` 要求位置在 0..1800 / 0..1120 且距 ENTRY ≤60 | `reopening-core.js:299-302` |

## 2. 碰撞/交互锚点与硬编码渲染坐标必须分开看

### 2.1 真正参与碰撞与交互的坐标（来自 City 模块）

- 画布 `WIDTH=1800 HEIGHT=1120`；角色半径 `RADIUS=8`；网格 `GRID=20`；步行速度 240、骑行 420（`reopening-city.js:9-14`）。
- 陆地 `LAND={70,40,1660,1040}`（`:15`）；4 片水域（`:16-21`）；7 个过河点：6 桥 + 1 渡轮，其中 `h<80` 的窄桥 2 座（`{430,930,100,70}`、`{1030,950,100,70}`），渡轮 `{860,280,80,200}`（`:22-30`）。
- 7 个地点（`PLACES`，`:31-46`）；26 栋建筑 = 6 个由地点派生的 `facade`（x−50,y−110,100×80，`:80-83`；flowers 被特意排在 `BUILDINGS` 列表末尾，`:48,69`）+ 20 个 `decorative` 街块（`:49-68`）。
- 碰撞判定顺序：陆地方圆包含 → 建筑圆碰 → 下水必须整个圆落在某个 crossing 内（`containsCircle`/`circleHits`/`walkable`，`:94-118`）。
- 可骑行 = walkable 且不在渡轮或 `h<80` 窄桥的圆碰范围内（`:131-135`）。
- 寻路网格只在 `y=50..1070`、`x=90..1710`、步长 20 上取 walkable 节点；探针用同一范围调真实 `C.walkable` 数得 **2424 个可行网格节点**（`:137-146`；数字见 `baseline.json` facts.counts）。

### 2.2 9 个锚点（7 地点 + 温室 ENTRY + 搬花车 CART）

全部经 `C.walkable/C.rideable/C.onFerry` 实测为 可行/可骑行/不在渡轮上。

| 锚点 id | 来源 | x | y | 名称/区域 | 说明 |
| --- | --- | --- | --- | --- | --- |
| pub | `PLACES.pub` `:32` | 290 | 590 | Tweede Kans / Jordaan | `C.create()` 出生与重置点 `:341-347` |
| lotte | `:34` | 490 | 650 | Lotte 的桥 / 运河带 | 锚点落在 h=80 宽桥 `{430,600,100,80}` 内，仍可骑行 |
| coffee | `:36` | 730 | 930 | Bram 咖啡馆 / De Pijp | |
| noord | `:38` | 1230 | 170 | 北岸码头 / Noord | 北湾唯一地点，进出必走渡轮 |
| market | `:40` | 930 | 1010 | Albert Cuyp / De Pijp | |
| flowers | `:42` | 1240 | 1040 | 南街花店 / De Pijp | 其 facade 矩形 1190,930,100×80 |
| lab | `:44` | 1490 | 910 | Chen 实验室 / Science Park | |
| garden | `flower-network.js:8` | 1510 | 690 | 温室日间侧门 / 花店后街 | **不是 `C.PLACES` 键**；UI 用 `cityPlace('garden')` 特判 `reopening-ui.js:140` |
| cart | `flower-network.js:9` | 1310 | 1040 | 搬花车锚点 | **无 id、不是目的地、不是 place ID**；只作花车跟随语义 |

地点 facade 矩形（派生值，实测自 `C.BUILDINGS`）：pub 240,480；coffee 680,820；noord 1180,60；market 880,900；lab 1440,800；flowers 1190,930（均 100×80）。

### 2.3 仅渲染、不进碰撞的硬编码坐标（改它们不影响可行走性）

- 7 条纵向装饰路带 x∈{190,390,590,890,1190,1490,1650}（`reopening-scene.js:143`）；5 条横向路带 y∈{270,520,690,890,1040}（`:144`）。
- 3 块绿地 `{92,64,260,158}`、`{1160,530,220,155}`、`{150,860,215,140}`（`:146-150`）。
- 区域文字、乐手 (516,624)、吊船/起重机/系船点、9 个行人、市场雨棚 (840..,1070)、咖啡桌椅 (685/775,956)、6 盏夜灯坐标（`:156-158,188-199`）。
- 温室门与花车绘制直接取 `FlowerNetwork.ENTRY` / `view.flowerCart`（`:210-217`）；房屋绘制遍历 `C.BUILDINGS`（`:279-285`）——后两者随模块常量联动，装饰坐标则不会。
- 相机矩阵与屏幕反算：`base=min(1100/1800,640/1120)`，街头视角 ×2.6，全景 zoom ×2（`:53-56,108-118`）。

### 2.4 交互阈值（散落在 UI/core，不是碰撞常量）

| 阈值 | 值 | 证据 |
| --- | --- | --- |
| `C.near` 默认半径 | 60 | `reopening-city.js:325-338` |
| 画布点击选点半径 | 85 | `reopening-ui.js:704` |
| 进入地点最大距离 | 65 | `reopening-ui.js:421` |
| 空路线时贴近即进入 | 60 | `reopening-ui.js:412-413` |
| 温室白天核心校验距离/边界 | ≤60；0..1800 / 0..1120 | `reopening-core.js:299-302`；UI 同值 `reopening-ui.js:419` |
| 路过温室自动进入 | 45 | `reopening-ui.js:430,437` |
| 上下车/找车距离 | 42 | `reopening-city.js:261-263`；`reopening-ui.js:139` |
| 花车跟随提示 / 跟随牵制 | 150 / 55 | `reopening-ui.js:376,433` |

## 3. 跨文件一致性依赖

1. **地点 ID 集合是契约**：`visited` 只接受 `C.PLACES` 自身键且去重，否则整档重置（`reopening-city.js:351-355`）。UI 的 `PLACE_COPY` 需覆盖 7 个地点外加 `garden` 文案（`reopening-ui.js:23-32`）；目的地按钮遍历 `Object.values(C.PLACES)`（`:487-493`），街头视角硬编码只列 `['pub','lotte']`（`:489`）；工具栏已发现计数用 `Object.keys(C.PLACES).length`（`:160`）。
2. **garden 双重身份**：`garden` 只存在于 `FlowerNetwork.ENTRY.id` 与 UI 特判（`reopening-ui.js:140,361,375,409,419-423`）；`C.near` 永不返回 garden（只扫 PLACES，`reopening-city.js:331`），进入途径只有：白天走到 45 内自动进入、点路线、跟车（`reopening-ui.js:437,412,611`），且非 prep 阶段直接拒绝（`:409`；`reopening-core.js:12,299`）。
3. **CART 独立语义**：`FlowerNetwork.CART` 无 id，不作为目的地；`cityView` 把它当默认花车坐标（`reopening-ui.js:141`），跟车时用合成对象 `{...cart,visited:[],bike:{...CART,mounted:false}}` 走真实 `C.moveAlong`（`:431`），路线用 `C.route(cart, ENTRY)`（`:611`）。
4. **facade 随锚点派生**：移动 `PLACES.*.x/y` 会在模块加载时同时移动对应 facade 碰撞矩形与渲染房屋（`reopening-city.js:48,69,80-83`；scene `:279-285`）；20 个 decorative 块不随地点移动。
5. **存档形状**：`{version:1,game,city,brewElapsed,tutorialSeen,sound}`，key `ab_reopening_v1`（`reopening-ui.js:6,38`）；城市部分只经 `C.restore(saved.city)`（`:12`），与 `R.restore` 游戏档校验相互独立。
6. **速度常量被 UI 手抄**：路线 ETA 显示直接内联 `/420` 或 `/240`（`reopening-ui.js:585`），模块并未导出速度；改速度需两处同步。
7. **画面虚线信任寻路**：scene 只把 `view.path` 连线（`reopening-scene.js:203-209`），path 永远来自 `C.route`/`C.moveAlong`（`reopening-ui.js:412,433`）；装饰路带不参与任何路径。
8. **core 边界值手抄画布尺寸**：`number(p.x,0,1800)`/`number(p.y,0,1120)`（`reopening-core.js:300`）与 `C.WIDTH/HEIGHT` 是两处独立字面量。

## 4. 存档恢复与既有兜底行为（精确行号）

实现见 `reopening-city.js:349-370`：

1. 入参非有限点或 `visited` 非数组 → 直接 `create()`（`:350`）；任一 visited 非字符串、非 PLACES 自有键或重复 → `create()`（`:351-355`）。
2. 位置不可行走时：**唯一例外**是该点圆碰到 id 为 `flowers` 的 facade——把点挪到 pub 出生点，但保留 visited 与自行车（注释说明该 facade 占据了曾经干燥可行的空地，`:357-362`）；其余不可行走位置一律 `create()`，访问记录随之清空。
3. 自行车合法性（`:363-369`）：有限点、`mounted` 布尔、`pushing∈{undefined,true,false}`、不得 mounted 与 pushing 同时为真、车位 walkable、mounted 时必须 rideable、携带时车必须与人同位。**车非法只重置车**为 pub 处未挂载车，位置与 visited 保留（`:369`）。
4. 旧的「只有 x,y」调用经 `movementState` 补 `visited:['pub']`（`:243-246`）。
5. UI 侧相关既有行为：`homeOnFoot()` 保留 visited 但把人放回 pub 并就地停车（`reopening-ui.js:142`），昼夜/回家转换都会调用（`:67-69`）；`travelTo` 对空路线有 <60 直接进入的兜底（`:412-413`）。

探针 3 个额外合成探针（完整输入输出在 `baseline.json` facts.restore_summary.synthetic_extra_probes）：(300,380) 开阔水面 → 整体 create()；(415,130) block-02 内 → 整体 create()；(1240,970) flowers facade 内 → 人挪到 pub、7 条 visited 与停在 coffee 的车均保留。

## 5. 路线实测方法与总体指标

- 对 9×9 全部有序对（含自身）调真实 `C.route(from,to)`（`reopening-city.js:200-236`）。自身对返回空数组是源码显式行为（`:202`）。
- 折线长度含起点；采样复刻 `safeSegment`：每段 `ceil(距离/4)`、端点包含（`:120-129`），逐点调 `C.walkable/C.rideable/C.onFerry`。
- 结果：**72 个非自身对全部可达，空路线 0 条**；单段直线 8 对，网格路 64 对；所有折线采样点 walkable 全部通过；非自身长度 70.00–1802.48，合计 67264.00；终点距目标锚点全部为 0（目标可行走时被精确追加，`:211-234`）。
- 8 对单段直线：pub↔lotte（208.81）、coffee↔market（215.41）、flowers↔cart（70.00）、lab↔cart（222.04）。
- **方向不对称是实测事实**：两端各自独立选最近连接器，且 BFS FIFO 平局顺序固定（`:152-187,205-219`），故同对两个方向的折线可不同，例：pub→coffee 763.25/36 点，coffee→pub 703.79/15 点；flowers→lotte 1514.35/30 点，lotte→flowers 1119.62/44 点；market→flowers 359.62，flowers→market 334.14。
- 渡轮：16 对有渡轮采样 = 所有与 noord 有关的有序对；向南方向（→noord）每对 61 个渡轮样本，向北方向（noord→*）每对 50 个，garden/coffee→noord 等同样为 50/61 规律；渡轮样本合计 844，可骑行样本合计 15286。部分路线另有少量不可骑行样本来自两座 h=70 窄桥（如 pub→noord 总 323、渡轮 61、可骑行 257，差 5 即窄桥样本）。
- 这些折线是网格跳数产物，**不是骑行最优路径，不是人类游玩时间或趣味性度量**；UI 的秒数估算另用 240/420 速度在运行时步进计算（`reopening-city.js:272-323`；`reopening-ui.js:585`）。

## 6. 81 条有序路线指标表

长度单位为逻辑游戏单位（表内保留 2 位小数，`baseline.json` 保留 6 位）。「可行」列是含起点折线上 ≤4 单位采样是否全部 `C.walkable`；终点距目标锚点本表 81 行全部为 0，故省略该列；自身对折点数 0、长度 0、样本数 1。

| from | to | 折点数 | 长度(含起点) | 可行 | 可骑行样本 | 渡轮样本 | 样本总数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pub | pub | 0 | 0.00 | 是 | 1 | 0 | 1 |
| pub | lotte | 1 | 208.81 | 是 | 54 | 0 | 54 |
| pub | coffee | 36 | 763.25 | 是 | 192 | 0 | 192 |
| pub | noord | 46 | 1286.26 | 是 | 257 | 61 | 323 |
| pub | market | 36 | 978.57 | 是 | 246 | 0 | 246 |
| pub | flowers | 57 | 1379.62 | 是 | 316 | 0 | 346 |
| pub | lab | 67 | 1680.00 | 是 | 383 | 0 | 421 |
| pub | garden | 2 | 1242.62 | 是 | 312 | 0 | 312 |
| pub | cart | 55 | 1423.66 | 是 | 328 | 0 | 357 |
| lotte | pub | 1 | 208.81 | 是 | 54 | 0 | 54 |
| lotte | lotte | 0 | 0.00 | 是 | 1 | 0 | 1 |
| lotte | coffee | 23 | 503.25 | 是 | 127 | 0 | 127 |
| lotte | noord | 37 | 1106.26 | 是 | 212 | 61 | 278 |
| lotte | market | 23 | 718.57 | 是 | 181 | 0 | 181 |
| lotte | flowers | 44 | 1119.62 | 是 | 251 | 0 | 281 |
| lotte | lab | 54 | 1420.00 | 是 | 318 | 0 | 356 |
| lotte | garden | 2 | 1041.76 | 是 | 262 | 0 | 262 |
| lotte | cart | 42 | 1163.66 | 是 | 263 | 0 | 292 |
| coffee | pub | 15 | 703.79 | 是 | 177 | 0 | 177 |
| coffee | lotte | 13 | 473.24 | 是 | 120 | 0 | 120 |
| coffee | coffee | 0 | 0.00 | 是 | 1 | 0 | 1 |
| coffee | noord | 45 | 1266.26 | 是 | 252 | 61 | 318 |
| coffee | market | 1 | 215.41 | 是 | 55 | 0 | 55 |
| coffee | flowers | 18 | 599.62 | 是 | 121 | 0 | 151 |
| coffee | lab | 28 | 900.00 | 是 | 188 | 0 | 226 |
| coffee | garden | 19 | 1202.14 | 是 | 302 | 0 | 302 |
| coffee | cart | 16 | 643.66 | 是 | 133 | 0 | 162 |
| noord | pub | 47 | 1423.59 | 是 | 303 | 50 | 357 |
| noord | lotte | 40 | 1182.00 | 是 | 243 | 50 | 297 |
| noord | coffee | 66 | 1363.25 | 是 | 288 | 50 | 342 |
| noord | noord | 0 | 0.00 | 是 | 1 | 0 | 1 |
| noord | market | 66 | 1578.57 | 是 | 342 | 50 | 396 |
| noord | flowers | 81 | 1802.48 | 是 | 398 | 50 | 452 |
| noord | lab | 77 | 1583.25 | 是 | 343 | 50 | 397 |
| noord | garden | 41 | 1422.90 | 是 | 303 | 50 | 357 |
| noord | cart | 74 | 1701.87 | 是 | 373 | 50 | 427 |
| market | pub | 29 | 983.79 | 是 | 247 | 0 | 247 |
| market | lotte | 27 | 753.24 | 是 | 190 | 0 | 190 |
| market | coffee | 1 | 215.41 | 是 | 55 | 0 | 55 |
| market | noord | 59 | 1546.26 | 是 | 322 | 61 | 388 |
| market | market | 0 | 0.00 | 是 | 1 | 0 | 1 |
| market | flowers | 6 | 359.62 | 是 | 61 | 0 | 91 |
| market | lab | 16 | 660.00 | 是 | 123 | 0 | 166 |
| market | garden | 33 | 1482.14 | 是 | 372 | 0 | 372 |
| market | cart | 4 | 403.66 | 是 | 73 | 0 | 102 |
| flowers | pub | 46 | 1317.93 | 是 | 300 | 0 | 331 |
| flowers | lotte | 30 | 1514.35 | 是 | 381 | 0 | 381 |
| flowers | coffee | 15 | 597.25 | 是 | 117 | 0 | 151 |
| flowers | noord | 74 | 1777.25 | 是 | 392 | 50 | 446 |
| flowers | market | 6 | 334.14 | 是 | 57 | 0 | 85 |
| flowers | flowers | 0 | 0.00 | 是 | 1 | 0 | 1 |
| flowers | lab | 4 | 304.74 | 是 | 78 | 0 | 78 |
| flowers | garden | 24 | 582.20 | 是 | 148 | 0 | 148 |
| flowers | cart | 1 | 70.00 | 是 | 19 | 0 | 19 |
| lab | pub | 49 | 1504.06 | 是 | 378 | 0 | 378 |
| lab | lotte | 16 | 1240.21 | 是 | 312 | 0 | 312 |
| lab | coffee | 31 | 923.11 | 是 | 186 | 0 | 232 |
| lab | noord | 60 | 1503.11 | 是 | 323 | 50 | 377 |
| lab | market | 19 | 607.39 | 是 | 123 | 0 | 153 |
| lab | flowers | 3 | 331.55 | 是 | 84 | 0 | 84 |
| lab | lab | 0 | 0.00 | 是 | 1 | 0 | 1 |
| lab | garden | 10 | 308.06 | 是 | 79 | 0 | 79 |
| lab | cart | 1 | 222.04 | 是 | 57 | 0 | 57 |
| garden | pub | 39 | 1304.06 | 是 | 328 | 0 | 328 |
| garden | lotte | 2 | 1040.20 | 是 | 262 | 0 | 262 |
| garden | coffee | 43 | 1163.11 | 是 | 246 | 0 | 292 |
| garden | noord | 50 | 1303.11 | 是 | 273 | 50 | 327 |
| garden | market | 31 | 847.39 | 是 | 183 | 0 | 213 |
| garden | flowers | 19 | 562.48 | 是 | 142 | 0 | 142 |
| garden | lab | 15 | 343.25 | 是 | 87 | 0 | 87 |
| garden | garden | 0 | 0.00 | 是 | 1 | 0 | 1 |
| garden | cart | 12 | 461.87 | 是 | 117 | 0 | 117 |
| cart | pub | 50 | 1393.79 | 是 | 319 | 0 | 350 |
| cart | lotte | 26 | 1430.21 | 是 | 360 | 0 | 360 |
| cart | coffee | 19 | 673.11 | 是 | 136 | 0 | 170 |
| cart | noord | 70 | 1693.11 | 是 | 371 | 50 | 425 |
| cart | market | 10 | 410.00 | 是 | 76 | 0 | 104 |
| cart | flowers | 1 | 70.00 | 是 | 19 | 0 | 19 |
| cart | lab | 1 | 222.04 | 是 | 57 | 0 | 57 |
| cart | garden | 20 | 498.06 | 是 | 127 | 0 | 127 |
| cart | cart | 0 | 0.00 | 是 | 1 | 0 | 1 |

## 7. 9 条合成 `C.restore` 检查

方法：在每个锚点构造 `{x,y,visited:[7 个现存地点 ID],bike:{x,y,mounted:false}}`（未挂载车与人同位，满足 `:363-369`），调真实 `C.restore`。结果 9/9 输入输出逐字段相等（x、y、visited 序列、bike 全等），且输入对象未被修改；明细含 input/output 快照，见 `baseline.json` 的 `restore_checks`。

| 锚点 | 输入 x,y | 输出 x,y | visited | bike | fields_preserved.all |
| --- | --- | --- | --- | --- | --- |
| pub | 290,590 | 290,590 | 7 项全保留 | 同位未挂载 | true |
| lotte | 490,650 | 490,650 | 7 项全保留 | 同位未挂载 | true |
| coffee | 730,930 | 730,930 | 7 项全保留 | 同位未挂载 | true |
| noord | 1230,170 | 1230,170 | 7 项全保留 | 同位未挂载 | true |
| market | 930,1010 | 930,1010 | 7 项全保留 | 同位未挂载 | true |
| flowers | 1240,1040 | 1240,1040 | 7 项全保留 | 同位未挂载 | true |
| lab | 1490,910 | 1490,910 | 7 项全保留 | 同位未挂载 | true |
| garden | 1510,690 | 1510,690 | 7 项全保留（garden 本身不在 visited 内，因其非 PLACES 键） | 同位未挂载 | true |
| cart | 1310,1040 | 1310,1040 | 7 项全保留（cart 本身不是 place ID） | 同位未挂载 | true |

这些是合成输入，只证明当前代码对「锚点 + 合法未挂载车 + 现存 visited ID」的等值行为；不证明真实自然存档分布，也不构成任何迁移方案。

## 8. 局限与未知

1. 距离是逻辑单位，不存在米制换算、真实 Amsterdam 测绘或比例尺（见 `baseline.json` limitations）。
2. BFS 网格路不是骑行最优、不是人类游玩时间/趣味度；探针不估算秒数，运行时移动以 240/420 速度、≤4 步进在 `travel/moveAlong` 内完成（`reopening-city.js:272-323`）。
3. ≤4 单位采样复刻的是游戏自身 `safeSegment` 离散门，不是连续几何证明。
4. restore 检查为合成构造；未覆盖 mounted/pushing 车、停在他处的车、自然游玩产生的任意可行走位置，也未覆盖游戏阶段规则。
5. garden 仅 prep 可进入、CART 仅跟随语义，探针无阶段概念；夜探（backstage）地图与本城市模块是两套几何，本基线不覆盖。
6. scene 中装饰坐标仅从源码记录，未做碰撞采样；游戏经济、ID 增减、教程、第一杯、夜探面的任何改动均在本探针范围外。
7. 城市对象自身没有版本字段；版本号只在外层存档包装（`reopening-ui.js:38`）。

## 9. 面向 F02 的未来事项（仅转述需求，全部为「提案」，非本包结论）

- 〔提案〕未来拓扑改动的验收需同时容纳：旧的任意可行走停留位置、停在别处或随身（mounted/pushing）的自行车、搬花车锚点与温室 ENTRY 语义（源自任务 brief；现状事实见本文件第 3、4 节）。
- 〔提案〕7 个 City place ID 与 garden/cart 的分离语义需要保留（源自任务约束）。
- 是否增补街区细节、如何提高 Amsterdam 保真度，属独立的 F02 形态设计包，本文件不提供方案。

## 10. 命令证据（仅两条授权命令，各为最近一次结果）

| 命令 | 退出码 | 结果摘要 |
| --- | --- | --- |
| `node baseline-probe.js` | 0 | 生成 baseline.json（186365 字节）：9 锚点、81 路线（9 自身空路、72 异点全部可达、8 单段、64 网格路）、采样全部可行、2424 可行网格节点、16 对渡轮、9/9 restore 字段保留 |
| `python3 validate_baseline.py` | 0 | `PASS baseline structure: 9 anchors,81 ordered pairs,9 synthetic restore checks; parent source and semantic review still required` |
