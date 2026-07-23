using System;
using System.Collections.Generic;
using UnityEngine;
using RectSpec = UIFactory.RectSpec;

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
    public int fatima_affection;
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

// ── Bar system data models (F2) ──────────────────────

[Serializable]
public sealed class DrinkData
{
    public string id;       // "beer", "whiskey", "wine"
    public string name;     // "🍺 Beer"
    public int costPrice;   // 进货成本
    public int sellPrice;   // 售价
    public Color32 color;   // UI 颜色
}

public enum CustomerType { Normal, Regular, Picky, Drunk, Group }

[Serializable]
public sealed class AchievementTrackingData
{
    public List<string> visitedLocations = new List<string>();
    public List<string> drinksSold = new List<string>();
    public int totalCustomersServed;
    public int maxDailyRevenue;
}

[Serializable]
public sealed class CustomerData
{
    public CustomerType type;
    public string displayName;        // "普通客人", "熟客", "挑剔客", "醉汉", "旅行团"
    public string greeting;           // 出现时的招呼语
    public float patienceSeconds;     // 耐心时间（秒）
    public float tipMultiplier;       // 小费倍率
    public int groupSize;             // 旅行团人数
}

[Serializable]
public sealed class BarShiftResult
{
    public int customersServed;
    public int totalCustomers;
    public int revenue;               // 营业收入
    public int cost;                  // 进货成本
    public int tips;                  // 小费
    public int netIncome;             // 净收入
    public float accuracy;            // 正确率 0.0-1.0
    public int starRating;            // 1-5 星评价
}

[Serializable]
public sealed class DrinkDatabase { public DrinkData[] drinks; }

[Serializable]
public sealed class CustomerDatabase { public CustomerData[] customers; }

public static class DataLoader
{
    public static DrinkDatabase LoadDrinks()
    {
        TextAsset asset = Resources.Load<TextAsset>("Data/bar_drinks");
        return JsonUtility.FromJson<DrinkDatabase>(asset.text);
    }

    public static CustomerDatabase LoadCustomers()
    {
        TextAsset asset = Resources.Load<TextAsset>("Data/bar_customers");
        return JsonUtility.FromJson<CustomerDatabase>(asset.text);
    }
}

// ── GameState (extracted from GameController) ────────

public sealed class GameState
{
    // ── Time ──────────────────────────────────────────────
    private static readonly string[] TimesOfDay = { "dawn", "morning", "afternoon", "evening", "night", "late_night" };

    public int CurrentDay { get; set; } = 1;
    public int TimeIndex { get; set; } = 0;
    public string CurrentTimeLabel => CurrentTime().Replace("_", " ");
    public const int MaxDays = 7;
    public const int VictoryMoneyTarget = 300;
    public bool GameEnded { get; set; } = false;
    public bool GameWon { get; set; } = false;
    public bool GameWentBankrupt { get; set; } = false;

    // ── Location ──────────────────────────────────────────
    private string _currentLocationId = "de_pijp";

    public string CurrentLocationId
    {
        get => _currentLocationId;
        set => _currentLocationId = value;
    }

    // Location name lookup is delegated to GameController (needs _locations dictionary)
    public string CurrentLocationName { get; set; } = "De Pijp";

    // ── Economy ───────────────────────────────────────────
    private int _money = 250;
    public int Money => _money;

    public void AddMoney(int amount)
    {
        _money += amount;
    }

    public void SetMoney(int value)
    {
        _money = value;
    }

    // ── Brewing ────────────────────────────────────────────
    // Brew stock shared between BrewingSystem and BarMinigame
    private readonly int[] _brewStock = new int[] { 5, 3, 2 }; // starting stock
    public int ActiveBrewIndex { get; set; } = -1; // -1 = not brewing
    public int ActiveBrewTurnsRemaining { get; set; } = 0;
    public bool IsBrewing => ActiveBrewIndex >= 0 && ActiveBrewTurnsRemaining > 0;

    public int GetBrewStock(int index) => (index >= 0 && index < 3) ? _brewStock[index] : 0;
    public void AddBrewStock(int index, int amount) { if (index >= 0 && index < 3) _brewStock[index] += amount; }
    public void ConsumeBrewStock(int index) { if (index >= 0 && index < 3 && _brewStock[index] > 0) _brewStock[index]--; }
    public int[] GetAllBrewStock() => new int[] { _brewStock[0], _brewStock[1], _brewStock[2] };
    public void SetBrewStock(int index, int value) { if (index >= 0 && index < 3) _brewStock[index] = value; }
    public void ClearBrewStock() { for (int i = 0; i < 3; i++) _brewStock[i] = 0; }

    // Total customers served (tracked across shifts)
    public int TotalCustomersServed { get; set; } = 0;
    public int TotalRevenue { get; set; } = 0;

    // ── Dialogue Tracking ─────────────────────────────────
    private readonly HashSet<string> _triggeredDialogueIds = new HashSet<string>();

    public HashSet<string> TriggeredDialogueIds => _triggeredDialogueIds;
    public int TriggeredEventCount => _triggeredDialogueIds.Count;

    public bool HasTriggeredDialogue(string id) => _triggeredDialogueIds.Contains(id);

    public void MarkDialogueTriggered(string id) => _triggeredDialogueIds.Add(id);

    public List<string> GetTriggeredEventIds() => new List<string>(_triggeredDialogueIds);

    public void ClearTriggeredEvents() => _triggeredDialogueIds.Clear();

    public void AddTriggeredEvent(string id) => _triggeredDialogueIds.Add(id);

    // ── Daily Goals (moved from GameController for save persistence) ──
    public List<DailyGoal> DailyGoals { get; set; } = new List<DailyGoal>();

    // ── Player tracking (for end screen stats) ─────────
    private readonly HashSet<string> _visitedLocations = new HashSet<string>();
    public int VisitedLocationCount => _visitedLocations.Count;

    public void RegisterLocationVisited(string locationId)
    {
        _visitedLocations.Add(locationId);
    }

    public List<string> GetVisitedLocations() => new List<string>(_visitedLocations);

    // ── Reset (New Game) ─────────────────────────────────
    public void ResetState()
    {
        CurrentDay = 1;
        TimeIndex = 0;
        _money = 250;
        GameEnded = false;
        GameWon = false;
        GameWentBankrupt = false;
        _currentLocationId = "de_pijp";
        CurrentLocationName = "De Pijp";
        ClearBrewStock();
        SetBrewStock(0, 5);
        SetBrewStock(1, 3);
        SetBrewStock(2, 2);
        ActiveBrewIndex = -1;
        ActiveBrewTurnsRemaining = 0;
        TotalCustomersServed = 0;
        TotalRevenue = 0;
        ClearTriggeredEvents();
        _visitedLocations.Clear();
        DailyGoals.Clear();
    }

    // ── Helpers ───────────────────────────────────────────
    public string CurrentTime() => TimesOfDay[TimeIndex];
}

// ── Achievement and Tutorial models (new systems) ────

[Serializable]
public sealed class Achievement
{
    public string id;
    public string title;
    public string description;
    public bool unlocked;
}

[Serializable]
public sealed class TutorialStep
{
    public string id;
    public string message;
    public string inputKey;
    public bool completed;
}

// ── Brewing recipe model ──────────────────────────────

[Serializable]
public sealed class BrewRecipe
{
    public string id;          // "lager", "pilsner", etc.
    public string name;        // "🍺 Lager"
    public string emoji;       // "🍺"
    public int ingredientCost; // cost to start brewing
    public int brewTurns;      // number of time advances needed
    public int yieldCount;     // how many units produced
    public int stockIndex;     // which drink index (0=Beer, 1=Whiskey, 2=Wine)
}

// ── Beer Competition models ────────────────────────────

[Serializable]
public sealed class CompetitionSaveData
{
    public bool hasTriggered;
    public bool hasSubmitted;
    public bool hasJudged;
    public int playerScore;
    public int playerRank;
    public int rewardMoney;
    public List<int> npcScores = new List<int>();
}
