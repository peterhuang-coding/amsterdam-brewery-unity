using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Beer Competition system — periodic brewing contest where players submit
/// beers from their brew stock, compete against 3 NPC breweries, and earn
/// rewards based on diversity and recipe quality.
/// Scoring inspired by Stardew Valley Grange Display: base + diversity + quantity + recipe value.
/// </summary>
public class BeerCompetitionSystem : MonoBehaviour
{
    private static BeerCompetitionSystem _instance;
    public static BeerCompetitionSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("BeerCompetitionSystem");
                _instance = go.AddComponent<BeerCompetitionSystem>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    // ── Competition state ────────────────────────────────────
    public bool HasTriggered;
    public bool HasSubmitted;
    public bool HasJudged;
    public int PlayerScore;
    public int PlayerRank; // 1-4
    public int RewardMoney;
    public List<int> NpcScores = new List<int>();
    public List<int> SubmittedStockIndices = new List<int>();
    private int[] _slotRecipes = new int[MaxEntries]; // stores recipe index (0-4), -1 = empty

    // ── Config ────────────────────────────────────────────────
    private const int CompetitionDay = 4;
    private const int MaxEntries = 5;   // 5 recipe types = 5 slots
    private const int BasePoints = 5;
    private const int DiversityBonusPerType = 3;
    private const int FullSubmissionBonus = 5;

    private static readonly int[] RecipeBaseScores = { 3, 3, 3, 5, 5 }; // lager, pilsner, wheat, whiskey, wine
    private static readonly string[] RecipeNames = { "Lager", "Pilsner", "Wheat", "Whiskey", "Wine" };
    private static readonly string[] RecipeEmojis = { "🍺", "🍺", "🌾", "🥃", "🍷" };
    private static readonly string[] NpcNames = { "De Vries Brouwerij", "Castillo Cerveza", "Wei's Taproom" };

    private static readonly Color32 PanelBgColor = new Color32(30, 25, 18, 235);
    private static readonly Color32 SlotColor = new Color32(50, 42, 32, 220);
    private static readonly Color32 SlotFilledColor = new Color32(70, 100, 50, 220);
    private static readonly Color32 ButtonColor = new Color32(120, 80, 40, 230);
    private static readonly Color32 GoldColor = new Color32(255, 200, 60, 255);

    // ── UI refs ───────────────────────────────────────────────
    private GameObject _panel;
    private Text _titleText;
    private Text _stockText;
    private Button[] _slotButtons = new Button[MaxEntries];
    private Text[] _slotLabels = new Text[MaxEntries];
    private int[] _slotSelections = new int[MaxEntries]; // -1 = empty, else stockIndex
    private Button _submitButton;
    private Text _resultText;
    private Button _closeButton;

    // ── Lifecycle ─────────────────────────────────────────────
    void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            if (Application.isPlaying) DontDestroyOnLoad(gameObject);
        }
        else if (_instance != this) { Object.Destroy(gameObject); return; }
        for (int i = 0; i < MaxEntries; i++) { _slotSelections[i] = -1; _slotRecipes[i] = -1; }
    }

    void OnDestroy()
    {
        StopAllCoroutines();
        if (Instance == this) Instance = null;
    }

    // ── Public API ────────────────────────────────────────────
    public void CheckCompetitionDay(int currentDay)
    {
        if (currentDay == CompetitionDay && !HasTriggered && !HasSubmitted)
        {
            HasTriggered = true;
            BuildPanel();
        }
    }

    // ── UI Construction ───────────────────────────────────────
    private void BuildPanel()
    {
        if (_panel != null) return;

        var canvas = FindOrCreateCompetitionCanvas();
        _panel = new GameObject("CompetitionPanel", typeof(RectTransform), typeof(Image));
        _panel.transform.SetParent(canvas.transform, false);
        var panelRt = _panel.GetComponent<RectTransform>();
        var panelImg = _panel.GetComponent<Image>();
        panelImg.color = PanelBgColor;
        UIFactory.ApplyRect(panelRt, new UIFactory.RectSpec(
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
            new Vector2(-280, -220), new Vector2(280, 220)));

        // Title
        _titleText = UIFactory.MakeText("Title", _panel.transform,
            UIFactory.StretchTop(36, 16, 16, 12), 22, TextAnchor.UpperCenter);
        _titleText.text = "🏆 Amsterdam Brewing Competition 🏆";
        _titleText.fontStyle = FontStyle.Bold;

        // Stock info
        _stockText = UIFactory.MakeText("StockInfo", _panel.transform,
            UIFactory.Anchored(20, 60, 520, 28), 14, TextAnchor.UpperLeft);
        RefreshStockText();

        // Entry slots — 5 columns
        float slotW = 88f;
        float gap = 16f;
        float startX = 20f;
        float slotY = 110f;
        for (int i = 0; i < MaxEntries; i++)
        {
            int idx = i;
            float x = startX + i * (slotW + gap);

            var slotBtn = UIFactory.MakeButton($"SlotBtn{i}", _panel.transform,
                UIFactory.Anchored(x, slotY, slotW, 80), SlotColor, "", () => OnSlotClicked(idx));
            _slotButtons[i] = slotBtn;

            var label = UIFactory.MakeText($"SlotLabel{i}", slotBtn.transform,
                UIFactory.StretchFull(2, 2, 2, 2), 12, TextAnchor.MiddleCenter);
            label.text = $"Slot {i + 1}\n<size=24>+</size>";
            label.alignment = TextAnchor.MiddleCenter;
            _slotLabels[i] = label;
        }

        // Recipe buttons — below slots
        var state = GameController.Instance?.State;
        for (int r = 0; r < RecipeNames.Length; r++)
        {
            int recipeIdx = r;
            float rx = startX + r * (slotW + gap);
            var recipeBtn = UIFactory.MakeButton($"RecipeBtn{r}", _panel.transform,
                UIFactory.Anchored(rx, 210, slotW, 36),
                ButtonColor, $"{RecipeEmojis[r]} {RecipeNames[r]}", () => OnRecipeClicked(recipeIdx));
        }

        // Submit button
        _submitButton = UIFactory.MakeButton("SubmitBtn", _panel.transform,
            UIFactory.Anchored(200, 260, 160, 40), new Color32(60, 140, 60, 230),
            "✅ Submit Entries", OnSubmitClicked);

        // Result area (hidden until judged)
        _resultText = UIFactory.MakeText("ResultText", _panel.transform,
            UIFactory.Anchored(20, 310, 520, 100), 13, TextAnchor.UpperLeft);
        _resultText.text = "";

        // Close button (hidden until judged)
        _closeButton = UIFactory.MakeButton("CloseBtn", _panel.transform,
            UIFactory.Anchored(200, 400, 160, 32), new Color32(140, 100, 60, 230),
            "❌ Close", () =>
            {
                Object.Destroy(_panel);
                _panel = null;
            });
        _closeButton.gameObject.SetActive(false);
    }

    private Canvas FindOrCreateCompetitionCanvas()
    {
        // Reuse existing UI canvas or create one
        var existing = FindObjectOfType<Canvas>();
        if (existing != null) return existing;

        var go = new GameObject("CompetitionCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        var c = go.GetComponent<Canvas>();
        c.renderMode = RenderMode.ScreenSpaceOverlay;
        c.sortingOrder = 100;
        var scaler = go.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        return c;
    }

    // ── Interaction ───────────────────────────────────────────
    private int _selectedSlot = -1;

    private void OnSlotClicked(int slotIdx)
    {
        _selectedSlot = slotIdx;
        // Visual feedback on selected slot
        for (int i = 0; i < MaxEntries; i++)
        {
            var img = _slotButtons[i].GetComponent<Image>();
            img.color = (i == slotIdx) ? new Color32(80, 120, 60, 230) : SlotColor;
        }
    }

    private void OnRecipeClicked(int recipeIdx)
    {
        if (_selectedSlot < 0) return;

        var state = GameController.Instance?.State;
        if (state == null) return;

        // Map recipe to stock: 0-2→stock 0 (beer), 3→stock 1 (whiskey), 4→stock 2 (wine)
        int stockIdx = recipeIdx <= 2 ? 0 : (recipeIdx == 3 ? 1 : 2);

        int available = state.GetBrewStock(stockIdx);
        // Account for already-allocated stock in other slots
        for (int i = 0; i < MaxEntries; i++)
            if (i != _selectedSlot && _slotSelections[i] == stockIdx)
                available--;

        if (available <= 0)
        {
            SetFeedback("Not enough stock of this type!");
            return;
        }

        _slotSelections[_selectedSlot] = stockIdx;
        _slotRecipes[_selectedSlot] = recipeIdx;
        _slotLabels[_selectedSlot].text = $"{RecipeEmojis[recipeIdx]} {RecipeNames[recipeIdx]}";
        _slotLabels[_selectedSlot].fontSize = 13;
        var img = _slotButtons[_selectedSlot].GetComponent<Image>();
        img.color = SlotFilledColor;
        SetFeedback($"Added {RecipeNames[recipeIdx]} to slot {_selectedSlot + 1}");
    }

    private void OnSubmitClicked()
    {
        if (HasSubmitted) return;

        // Validate: at least 1 entry
        bool any = false;
        for (int i = 0; i < MaxEntries; i++)
            if (_slotSelections[i] >= 0) any = true;

        if (!any)
        {
            SetFeedback("Submit at least one beer to enter the competition!");
            return;
        }

        // Consume stock
        var state = GameController.Instance?.State;
        if (state == null) return;

        for (int i = 0; i < MaxEntries; i++)
        {
            if (_slotSelections[i] >= 0)
                state.ConsumeBrewStock(_slotSelections[i]);
        }

        HasSubmitted = true;
        JudgeCompetition();
        DisplayResults();
    }

    // ── Scoring ───────────────────────────────────────────────
    private void JudgeCompetition()
    {
        int score = BasePoints;
        var uniqueRecipes = new HashSet<int>();
        int filledSlots = 0;

        for (int i = 0; i < MaxEntries; i++)
        {
            if (_slotRecipes[i] < 0) continue;
            filledSlots++;
            uniqueRecipes.Add(_slotRecipes[i]);

            // Recipe-based scoring: basic beers=3, premium=5
            int pts = RecipeBaseScores[_slotRecipes[i]];
            score += pts;
        }

        score += uniqueRecipes.Count * DiversityBonusPerType;
        if (filledSlots == MaxEntries) score += FullSubmissionBonus;

        PlayerScore = score;

        // NPC scores: deterministic per competition day
        var rng = new System.Random(CompetitionDay * 7 + 3);
        NpcScores.Clear();
        int[] npcBases = { 18, 22, 26 };
        for (int n = 0; n < 3; n++)
            NpcScores.Add(npcBases[n] + rng.Next(-3, 6));

        // Rank
        PlayerRank = 1;
        foreach (var ns in NpcScores)
            if (ns > PlayerScore) PlayerRank++;

        // Reward
        RewardMoney = PlayerRank switch
        {
            1 => 500,
            2 => 300,
            3 => 150,
            _ => 50,
        };

        if (stateValid()) GameController.Instance.State.AddMoney(RewardMoney);

        // Unlock achievement for 1st place
        if (PlayerRank == 1 && stateValid())
        {
            var ach = GameController.Instance.GetComponent<AchievementSystem>();
            if (ach != null) ach.UnlockAchievement("competition_winner");
        }

        HasJudged = true;
    }

    private bool stateValid() => GameController.Instance?.State != null;

    private void DisplayResults()
    {
        _resultText.text = $"🏆 <b>Competition Results</b>\n\n"
            + $"<b>You:</b> {PlayerScore} pts — <b>Rank #{PlayerRank}</b>\n"
            + $"  Entries: {CountFilled()}/{MaxEntries} | Types: {CountUnique()}\n\n";

        for (int n = 0; n < 3; n++)
        {
            string marker = (PlayerRank < n + 2) ? "🟢" : "🔴";
            _resultText.text += $"{marker} {NpcNames[n]}: {NpcScores[n]} pts\n";
        }

        _resultText.text += $"\n💰 <b>Prize: ${RewardMoney}</b>";

        if (PlayerRank == 1)
            _resultText.text += " 🏆 <b>Champion!</b>";

        // Disable submission, show close
        _submitButton.interactable = false;
        for (int i = 0; i < MaxEntries; i++)
            _slotButtons[i].interactable = false;
        _closeButton.gameObject.SetActive(true);

        RefreshStockText();
        RefreshHudIfAvailable();
    }

    private int CountFilled()
    {
        int c = 0;
        for (int i = 0; i < MaxEntries; i++)
            if (_slotRecipes[i] >= 0) c++;
        return c;
    }

    private int CountUnique()
    {
        var s = new HashSet<int>();
        for (int i = 0; i < MaxEntries; i++)
            if (_slotRecipes[i] >= 0) s.Add(_slotRecipes[i]);
        return s.Count;
    }

    private void RefreshStockText()
    {
        if (_stockText == null) return;
        var state = GameController.Instance?.State;
        if (state == null) return;
        _stockText.text = $"🍺 Beer: {state.GetBrewStock(0)} | 🥃 Whiskey: {state.GetBrewStock(1)} | 🍷 Wine: {state.GetBrewStock(2)}";
    }

    private void SetFeedback(string msg)
    {
        GameController.Instance?.SetFeedback(msg);
    }

    private void RefreshHudIfAvailable()
    {
        GameController.Instance?.RefreshHud();
    }
}
