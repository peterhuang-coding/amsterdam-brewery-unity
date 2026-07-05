# Agent Handoff

## Current State

This is the Unity rebuild of Amsterdam Brewery. The Godot project is preserved as reference only.

The current Unity prototype contains:

1. Time loop: Space advances time and day.
2. Location loop: 1/2/3 switches De Pijp, Science Park, and Tweede Kans.
3. Bar loop: B/S/C opens, serves, and closes a shift.
4. Dialogue loop: matching events load dialogue JSON and show a bottom dialogue panel.
5. Validation loop: `python3 tools/validate_unity_project.py`

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

Unity Editor is not installed on this machine at scaffold time, so Unity compilation/play-mode verification still needs to run after Unity Hub/Editor is installed.

## Known Risks

- `GameController.cs` is intentionally doing too much for the first slice.
- Runtime UI uses built-in `UnityEngine.UI.Text`, not TextMeshPro.
- Scene visuals are designed placeholders, not final art.
- Dialogue choices are loaded in data but not interactive yet.
