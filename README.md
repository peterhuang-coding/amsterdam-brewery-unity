# Amsterdam Brewery Unity

Unity rebuild of the Amsterdam Brewery playable prototype.

The previous Godot project remains at:

`/Volumes/SanDisk2TB/amsterdam-brewery-game`

This Unity project keeps the same core loops but starts over with a cleaner first playable slice:

- Space advances time.
- 1/2/3 switches between De Pijp, Science Park, and Tweede Kans.
- B/S/C opens the bar, serves a customer, and closes the shift.
- Story events trigger dialogue from JSON data.

## Open In Unity

Install Unity Hub and a recent LTS editor, then open:

`/Volumes/SanDisk2TB/amsterdam-brewery-unity`

Open `Assets/Scenes/PlayablePrototype.unity` and press Play.

## Validate Without Unity

```bash
python3 tools/validate_unity_project.py
```

This checks the Unity scaffold, data references, scene entry point, and core loop script contract.
