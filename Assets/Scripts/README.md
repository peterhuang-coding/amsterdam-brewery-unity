# Scripts

## `GameController.cs`

First playable bootstrap. It owns the temporary runtime UI, input handling, time loop, location loop, bar loop, event matching, and dialogue presentation.

This is deliberately centralized for the first Unity slice so the project opens and plays without hand-built scene dependencies.

## `GameDataModels.cs`

Serializable data containers for `JsonUtility` loading from `Assets/Resources/Data`.

## Refactor Target

Once the first Unity slice is visually acceptable, split `GameController` into:

- `TimeManager`
- `LocationController`
- `BarSystem`
- `EventSystem`
- `DialogueController`
- `HudController`
