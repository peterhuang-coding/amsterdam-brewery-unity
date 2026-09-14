# Amsterdam Brewery Unity

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
- [飞书协作版](https://bytedance.larkoffice.com/docx/Bg8ddVmAKohUIFxVKX3codBBnCc)
