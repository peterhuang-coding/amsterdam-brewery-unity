# Amsterdam Brewery Unity

## 产品方向与夜间执行

- [Notion 产品工作台](https://app.notion.com/p/3db3285284df81038056e2dfe875e700)：白天选择方向与批准阶段，夜间回填结果。
- [7 项产品方向调研与修复候选](docs/product-research/README.md)：统一夜探、昼夜城市、经营连接、人物、自行车/地图、自动播放、Web/Unity。
- [白天决策 / 夜间执行流程](docs/product-research/nightshift.md) · [当前执行主线](.claude/autopilot/mainline.md)。

候选初始均未批准；每次只推进一个已批准阶段。当前工作台分支基于三日经营版，昼夜探索版仍在另一条开发线上。

Unity rebuild of the Amsterdam Brewery playable prototype.

The previous Godot project remains at:

`/Volumes/SanDisk2TB/amsterdam-brewery-game`

This Unity project keeps the same core loops but starts over with a cleaner first playable slice:

- Space advances time.
- 1/2/3 switches between De Pijp, Science Park, and Tweede Kans.
- B/S/C opens the bar, serves a customer, and closes the shift.
- Story events trigger dialogue from JSON data.

## Visual Layout

The playable prototype screen is divided into clear zones:

- **Top HUD bar** — Day/Time (☀), Location (⌂), Bar status (☕), Money ($). Each section has a colored icon plate and readable text.
- **Central scene** — Location-specific generated visuals (De Pijp: apartment windows/roof; Science Park: beakers/lab bench; Tweede Kans: bar counter/glasses/bottles/neon).
- **Right info panel** — Location title and descriptive subtitle.
- **Feedback line** — Italic feedback text between the scene and the bottom hints.
- **Bottom hint bar** — All available keyboard controls.
- **Dialogue panel** — Full-width overlay that appears above the bottom hints; speaker name in an accent bar, body text with generous spacing for Chinese, and a prominent Next/Finish button.

## How to Play

1. Open in Unity Hub and press Play.
2. Press **Space** to advance time through the day cycle.
3. Press **1/2/3** to switch between De Pijp, Science Park, and Tweede Kans.
4. At Tweede Kans, press **B** to open the bar, **S** to serve customers (+$6 each), **C** to close and collect earnings.
5. Reach Day 5 evening at Tweede Kans to trigger Erik's dialogue.

## Web Gameplay Prototype

The browser prototype includes a focused three-day validation mode for the production-to-sales loop:

- Open `tools/prototype/index.html` and choose **三日核心试玩**.
- Or open `tools/prototype/core-loop.html?seed=42` directly.
- The focused mode uses isolated save data and does not inherit the seven-day prototype's Meta upgrades.

## Open In Unity

Install Unity Hub and a recent LTS editor, then open:

`/Volumes/SanDisk2TB/amsterdam-brewery-unity`

Open `Assets/Scenes/PlayablePrototype.unity` and press Play.

## Validate Without Unity

```bash
python3 tools/validate_unity_project.py
```

This checks the Unity scaffold, data references, scene entry point, and core loop script contract.

## 玩法调研与后续规划

- [玩法差距与高价值功能调研](docs/Amsterdam%20Brewery%20玩法差距与高价值功能调研.md)：基于 `12995e2` 的 Web 原型静态盘点，涵盖二十二项玩法、竞品参照、差异化定位和功能优先级；建议不代表已经实现。
- [玩法机制与优先功能关系图](docs/diagrams/gameplay-feature-priority.svg)
- [游戏设计文档索引](docs/game-design/Amsterdam%20Brewery%20游戏设计索引.md)：今晚的机制设计、当前待办、二十二项小游戏策划与数据流图。
- [当前玩法待办](docs/game-design/Amsterdam%20Brewery%20当前玩法待办.md)：区分已完成的三日闭环、待试玩验证和后置候选。
- [飞书协作版](https://bytedance.larkoffice.com/docx/Bg8ddVmAKohUIFxVKX3codBBnCc)
