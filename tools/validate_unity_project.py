#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    ".gitignore",
    "README.md",
    "Docs/UNITY_MIGRATION.md",
    "Docs/AGENT_HANDOFF.md",
    "Packages/manifest.json",
    "ProjectSettings/ProjectVersion.txt",
    "ProjectSettings/EditorBuildSettings.asset",
    "Assets/Scenes/PlayablePrototype.unity",
    "Assets/Scenes/PlayablePrototype.unity.meta",
    "Assets/Editor/PlayablePrototypeAutoOpen.cs",
    "Assets/Editor/PlayablePrototypeAutoOpen.cs.meta",
    "Assets/Scripts/GameController.cs",
    "Assets/Scripts/GameController.cs.meta",
    "Assets/Scripts/GameDataModels.cs",
    "Assets/Scripts/GameDataModels.cs.meta",
    "Assets/Scripts/RuntimeVisuals.cs",
    "Assets/Scripts/RuntimeVisuals.cs.meta",
    "Assets/Scripts/README.md",
    "Assets/Resources/Data/characters.json",
    "Assets/Resources/Data/events.json",
    "Assets/Resources/Data/dialogue/zh/story_rent_reminder.json",
    "Assets/Resources/Data/dialogue/zh/story_lab_visit.json",
    "Assets/Resources/Data/dialogue/zh/story_first_shift_alone.json",
    "Assets/Resources/Data/dialogue/zh/story_neighbor_complaint.json",
    "Assets/Resources/Data/dialogue/zh/story_ravi_study.json",
    "Assets/Resources/Data/dialogue/zh/story_maaike_tea.json",
    "Assets/Resources/Data/dialogue/zh/story_bloemenmarkt_talk.json",
    "Assets/Resources/Data/dialogue/zh/story_morning_routine.json",
    "Assets/Resources/Data/dialogue/zh/story_business_decision.json",
    "Assets/Resources/Data/dialogue/zh/story_de_wit_inspection.json",
    "Assets/Resources/Data/dialogue/zh/story_chen_seeing_change.json",
    "Assets/Resources/Data/dialogue/zh/story_evening_reflection.json",
    "Assets/Resources/Data/dialogue/zh/story_day1_arrival.json",
    "Assets/Resources/Data/dialogue/zh/story_day1_first_class.json",
    "Assets/Resources/Data/dialogue/zh/story_day1_erik_intro.json",
    "Assets/Resources/Data/dialogue/zh/story_day1_market_explore.json",
    "Assets/Resources/Data/dialogue/zh/story_day4_pablo_class2.json",
    "Assets/Resources/Data/dialogue/zh/story_day4_bar_flow.json",
    "Assets/Resources/Data/dialogue/zh/story_day5_sofie_close.json",
    "Assets/Resources/Data/dialogue/zh/story_day6_erik_trust.json",
    "Assets/Resources/Data/dialogue/zh/story_day7_final_market.json",
    "Assets/Resources/Data/dialogue/zh/story_day7_lab_checkin.json",
    "Assets/Resources/Data/dialogue/zh/story_day7_farewell_shift.json",
    "Assets/Resources/Data/dialogue/zh/story_fatima_recipe.json",
]

TIMES_OF_DAY = {"dawn", "morning", "afternoon", "evening", "night", "late_night"}
LOCATIONS = {"de_pijp", "science_park", "tweede_kans", "bloemenmarkt", "de_pijp_market"}


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def read_json(relative_path: str) -> dict:
    path = ROOT / relative_path
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {relative_path}: {exc}")
    if not isinstance(data, dict):
        fail(f"{relative_path}: root must be an object")
    return data


def check_required_files() -> None:
    missing = [path for path in REQUIRED_FILES if not (ROOT / path).is_file()]
    if missing:
        fail("missing required files: " + ", ".join(missing))


def check_unity_project_files() -> None:
    manifest = read_json("Packages/manifest.json")
    dependencies = manifest.get("dependencies", {})
    if "com.unity.ugui" not in dependencies:
        fail("Packages/manifest.json must include com.unity.ugui for runtime UI")
    scene_text = (ROOT / "Assets/Scenes/PlayablePrototype.unity").read_text(encoding="utf-8")
    if "GameController" not in scene_text and "m_Name: GameBootstrap" not in scene_text:
        fail("PlayablePrototype.unity must contain the GameBootstrap object")
    build_settings = (ROOT / "ProjectSettings/EditorBuildSettings.asset").read_text(encoding="utf-8")
    if "Assets/Scenes/PlayablePrototype.unity" not in build_settings:
        fail("EditorBuildSettings.asset must include PlayablePrototype.unity")


def check_data_schema() -> None:
    characters = read_json("Assets/Resources/Data/characters.json").get("characters", [])
    if not isinstance(characters, list) or not characters:
        fail("characters.json must contain a non-empty characters array")
    character_ids: set[str] = set()
    for item in characters:
        if not isinstance(item, dict):
            fail("characters entries must be objects")
        character_id = item.get("id")
        if not isinstance(character_id, str) or not character_id:
            fail("each character must have a non-empty id")
        if character_id in character_ids:
            fail(f"duplicate character id: {character_id}")
        character_ids.add(character_id)

    dialogue_ids: set[str] = set()
    for path in (ROOT / "Assets/Resources/Data/dialogue/zh").glob("*.json"):
        data = read_json(str(path.relative_to(ROOT)))
        dialogue_id = data.get("id")
        if not isinstance(dialogue_id, str) or not dialogue_id:
            fail(f"{path.name}: dialogue id must be non-empty")
        if dialogue_id != path.stem:
            fail(f"{path.name}: dialogue id must match filename")
        dialogue_ids.add(dialogue_id)
        lines = data.get("lines")
        if not isinstance(lines, list) or not lines:
            fail(f"{path.name}: lines must be a non-empty array")
        for index, line in enumerate(lines):
            if not isinstance(line, dict):
                fail(f"{path.name}: lines[{index}] must be an object")
            speaker = line.get("speaker")
            text = line.get("text")
            if speaker not in character_ids:
                fail(f"{path.name}: unknown speaker id in lines[{index}]: {speaker}")
            if not isinstance(text, str) or not text:
                fail(f"{path.name}: lines[{index}].text must be non-empty")

        # choices id uniqueness
        choices = data.get("choices")
        if choices is not None:
            if not isinstance(choices, list):
                fail(f"{path.name}: 'choices' must be an array if present")
            choice_ids: set[str] = set()
            for cindex, ch in enumerate(choices):
                if not isinstance(ch, dict):
                    fail(f"{path.name}: choices[{cindex}] must be an object")
                cid = ch.get("id")
                if not isinstance(cid, str) or cid.strip() == "":
                    fail(f"{path.name}: choices[{cindex}] missing or empty 'id'")
                if cid in choice_ids:
                    fail(f"{path.name}: duplicate choice id '{cid}' at index {cindex}")
                choice_ids.add(cid)
                ctext = ch.get("text")
                if not isinstance(ctext, str) or ctext.strip() == "":
                    fail(f"{path.name}: choices[{cindex}] missing or empty 'text'")

    events = read_json("Assets/Resources/Data/events.json").get("events", [])
    if not isinstance(events, list) or not events:
        fail("events.json must contain a non-empty events array")
    event_ids: set[str] = set()
    saw_pablo = False
    saw_erik = False
    for event in events:
        if not isinstance(event, dict):
            fail("events entries must be objects")
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id:
            fail("each event must have a non-empty id")
        if event_id in event_ids:
            fail(f"duplicate event id: {event_id}")
        event_ids.add(event_id)
        if event.get("time") not in TIMES_OF_DAY:
            fail(f"event {event_id}: invalid time {event.get('time')}")
        if event.get("location") not in LOCATIONS:
            fail(f"event {event_id}: invalid location {event.get('location')}")
        dialogue_id = event.get("dialogue_id")
        if dialogue_id is not None and dialogue_id != "" and dialogue_id not in dialogue_ids:
            fail(f"event {event_id}: unknown dialogue_id {dialogue_id}")
        if event.get("day") == 2 and event.get("time") == "evening" and event.get("location") == "tweede_kans":
            saw_pablo = dialogue_id == "story_first_shift_alone"
        if event.get("day") == 5 and event.get("time") == "evening" and event.get("location") == "tweede_kans":
            saw_erik = dialogue_id == "story_de_wit_inspection"
    if not saw_pablo:
        fail("missing smoke event: day 2 evening tweede_kans -> story_first_shift_alone")
    if not saw_erik:
        fail("missing smoke event: day 5 evening tweede_kans -> story_de_wit_inspection")


def check_script_contracts() -> None:
    game_controller = (ROOT / "Assets/Scripts/GameController.cs").read_text(encoding="utf-8")
    required_terms = [
        "KeyCode.Space",
        "KeyCode.Alpha1",
        "KeyCode.Alpha2",
        "KeyCode.Alpha3",
        "KeyCode.Alpha4",
        "KeyCode.B",
        "KeyCode.S",
        "KeyCode.F",
        "KeyCode.I",
        "KeyCode.P",
        "ShowDialogue",
        "CheckStoryEvents",
    ]
    for term in required_terms:
        if term not in game_controller:
            fail(f"GameController.cs missing required loop term: {term}")

    # Bar minigame must provide the bar API previously in GameController
    bar_minigame = (ROOT / "Assets/Scripts/BarMinigame.cs").read_text(encoding="utf-8")
    bar_required_terms = [
        "StartShift",
        "EndShift",
        "IsShiftActive",
        "CustomersServed",
        "ShiftEarnings",
    ]
    for term in bar_required_terms:
        if term not in bar_minigame:
            fail(f"BarMinigame.cs missing required API term: {term}")


def main() -> None:
    check_required_files()
    check_unity_project_files()
    check_data_schema()
    check_script_contracts()
    print("OK: Unity playable prototype scaffold validated")


if __name__ == "__main__":
    main()
