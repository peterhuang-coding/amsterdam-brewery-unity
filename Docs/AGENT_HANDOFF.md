# Agent Handoff

## Current State

This is the Unity rebuild of Amsterdam Brewery. The Godot project is preserved as reference only.

The current Unity prototype contains:

1. **Time loop:** Space advances time and day.
2. **Location loop:** 1/2/3 switches De Pijp, Science Park, and Tweede Kans.
3. **Bar loop:** B/S/C opens, serves, and closes a shift.
4. **Dialogue loop:** Matching events load dialogue JSON and show a full-width dialogue panel.
5. **Validation loop:** `python3 tools/validate_unity_project.py`

## Visual Slice (cc1)

The prototype now has a richer visual layout:

- **Top HUD** — 4-zone icon bar (☀ day/time, ⌂ location, ☕ bar status, $ money)
- **Central scene** — RuntimeVisuals generates location-specific decoration:
  - De Pijp: apartment windows, roof, door
  - Science Park: beakers, lab bench, flasks
  - Tweede Kans: bar counter, glasses, bottles, neon glow
- **Right info panel** — Location title + description
- **Feedback line** — Italic game feedback between scene and hints
- **Bottom hints** — All keyboard controls listed
- **Dialogue panel** — Full-width overlay with speaker bar, Chinese body text, Next/Finish button; does not overlap HUD

## Open

Open this folder in Unity Hub:

`/Volumes/SanDisk2TB/amsterdam-brewery-unity`

Then open:

`Assets/Scenes/PlayablePrototype.unity`

Press Play.

## Latest Verification

Run from project root:

```bash
python3 tools/validate_unity_project.py
git status --short
```

Unity Editor is not installed on this machine, so Unity compilation/play-mode verification still needs to run after Unity Hub/Editor is installed.

## Known Risks

- `GameController.cs` is large (~380 lines) — should be split into separate controllers in a future loop.
- Runtime UI uses built-in `UnityEngine.UI.Text`, not TextMeshPro — Chinese rendering quality depends on system font support.
- `RuntimeVisuals.cs` generates visuals as pure colored rectangles; no textures or sprites.
- Scene visuals are designed placeholders, not final art.
- Dialogue choices are loaded in data but not interactive yet.
- Validator now checks: C# .meta files exist, dialogue choice id uniqueness, event id uniqueness, speaker-to-characters cross-ref, events dialogue_id cross-ref.

## GitHub

- Repo: `https://github.com/peterhuang-coding/amsterdam-brewery-unity`
- Main branch pushed successfully at initial scaffold.

## Latest Worktree

- Branch: `agent/unity-data-systems`
- Last commit: see below after checkpoint

## Next Steps

1. Install Unity Editor, open `PlayablePrototype.unity`, and run in Play mode to verify all loops.
2. Add visual default sprites/UI artwork for bar, characters, and dialogue background.
3. Add audio triggers to match GameController events.
4. Wire interactive dialogue choices to `GameController`.
