# Unity Migration

## Goal

Rebuild Amsterdam Brewery in Unity as a clean 2D playable prototype while preserving the useful loop work from the Godot scaffold.

## First Slice

The Unity slice is intentionally small:

- A single scene: `Assets/Scenes/PlayablePrototype.unity`
- A bootstrap component: `Assets/Scripts/GameController.cs`
- Runtime-created UI for scene background, HUD, controls, bar status, and dialogue
- JSON data under `Assets/Resources/Data`

## Why Runtime UI First

The Godot prototype became hard to judge because scene layout and loop wiring were mixed in rough whitebox assets. Unity starts with one code-driven playable surface so the player can immediately test time, location, bar, and dialogue behavior.

## Data Ported From Godot

- `characters.json`
- `events.json`
- `pablo_first_class.json`
- `erik_first_shift.json`

## Next Good Loops

1. Replace runtime rectangles with real Unity prefabs and sprites.
2. Add a real title/start flow.
3. Add dialogue choices.
4. Split `GameController` into focused Unity components after the playable flow is stable.
