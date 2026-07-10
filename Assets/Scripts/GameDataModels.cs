using System;
using UnityEngine;

[Serializable]
public sealed class CharacterDatabase
{
    public CharacterData[] characters;
}

[Serializable]
public sealed class CharacterData
{
    public string id;
    public string name;
    public string role;
    public string first_location;
}

[Serializable]
public sealed class EventDatabase
{
    public StoryEvent[] events;
}

[Serializable]
public sealed class StoryEvent
{
    public string id;
    public int day;
    public string time;
    public string location;
    public string dialogue_id;
    public string summary;
    public string[] unlocks;
}

[Serializable]
public sealed class DialogueData
{
    public string id;
    public DialogueTriggerData trigger;
    public DialogueLine[] lines;
    public DialogueChoice[] choices;
}

[Serializable]
public sealed class DialogueTriggerData
{
    public string scene;
    public int day;
    public string time;
}

[Serializable]
public sealed class DialogueLine
{
    public string speaker;
    public string text;
    public string expression;
}

[Serializable]
public sealed class DialogueChoice
{
    public string id;
    public string text;
    public DialogueOutcome outcome;
}

[Serializable]
public sealed class DialogueOutcome
{
    public int pablo_affection;
    public int erik_affection;
    public int sofie_affection;
    public int ravi_affection;
    public int de_wit_affection;
    public int maaike_affection;
    public int chen_affection;
    public int academic_progress;
    public int money;
    public string unlock_system;
    public string item;
    public string lore_unlock;
}

// ── Location View (moved from GameController T6) ─────

[Serializable]
public sealed class LocationView
{
    public readonly string title, subtitle;
    public readonly Color background, accent, highlight;
    public LocationView(string t, string s, Color bg, Color ac, Color hl)
    {
        title = t; subtitle = s; background = bg; accent = ac; highlight = hl;
    }
}

// ── Daily Goal (for F1) ──────────────────────────────

[Serializable]
public sealed class DailyGoal
{
    public string eventId;
    public string description;
    public string location;
    public bool completed;
    public int day;
}

// ── Shared UI helpers ─────────────────────────────────

public static class UIFactory
{
    private static Font _cachedFont;

    public static Font GetFont()
    {
        if (_cachedFont == null)
            _cachedFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        return _cachedFont;
    }

    public static void ApplyRect(RectTransform rt, RectSpec spec)
    {
        rt.anchorMin = spec.anchorMin;
        rt.anchorMax = spec.anchorMax;
        rt.offsetMin = spec.offsetMin;
        rt.offsetMax = spec.offsetMax;
    }

    public readonly struct RectSpec
    {
        public readonly Vector2 anchorMin, anchorMax, offsetMin, offsetMax;
        public RectSpec(Vector2 amin, Vector2 amax, Vector2 omin, Vector2 omax)
        {
            anchorMin = amin; anchorMax = amax; offsetMin = omin; offsetMax = omax;
        }
    }
}
