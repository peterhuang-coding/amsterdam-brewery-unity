using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.UI;

[System.Serializable]
public class SaveData
{
    public int saveVersion = 1;
    public int slot;
    public string timestamp;
    public int day;
    public int timeIndex;
    public int money;
    // Affection: serializable split lists
    public List<string> affectionKeys = new List<string>();
    public List<int> affectionValues = new List<int>();
    public List<string> triggeredEvents = new List<string>();
    public int[] barStock = new int[3];
    public int[] brewStock = new int[3]; // from BrewingSystem
    public string currentLocationId = "de_pijp";
    public int activeBrewIndex = -1;
    public int activeBrewTurnsRemaining = 0;
    public int barServed;
    public int barRevenue;
    public int totalCustomersServed;
    public int totalRevenue;
    // Achievements
    public List<string> unlockedAchievements = new List<string>();
    // Bar upgrades
    public List<string> purchasedUpgrades = new List<string>();
    // Items (id → count pairs)
    public List<string> itemIds = new List<string>();
    public List<int> itemCounts = new List<int>();
    // Deprecated item fields (kept for backward compat with old saves)
    public List<string> itemNames = new List<string>();
    public List<string> itemDescriptions = new List<string>();
    // Fragments (inspiration fragments from surfing)
    public List<string> fragments = new List<string>();
    // Lore (unlocked lore entries)
    public List<string> loreIds = new List<string>();
    public List<string> loreTexts = new List<string>();
    // Academic progress
    public int academicProgress = 0;
    // Shop owned items
    public List<string> ownedShopItems = new List<string>();
    // Visited locations (for end-screen stats + achievement tracking)
    public List<string> visitedLocations = new List<string>();
    // Daily goals (persist per-day goal completion state)
    public List<DailyGoal> dailyGoals = new List<DailyGoal>();
    // Tutorial progress
    public bool tutorialWelcomeDismissed;
    public List<bool> tutorialStepCompleted = new List<bool>();
    // Bankruptcy flag (for accurate end-state restoration)
    public bool gameWentBankrupt;
    // Mid-shift save support: bar shift transient state
    public bool barShiftActive;
    public int barShiftEarnings;
    public int barShiftTips;
    public int barShiftComboCount;
    public int barShiftCorrectCount;
    public float barShiftApologyTipMultiplier = 1.0f;
    public bool barShiftApologyMode;
    // Achievement partial progress (prevents data loss on save/load cycle)
    public AchievementTrackingData achievementTracking;
}

public class SaveSystem : MonoBehaviour
{
    // ── Singleton ──────────────────────────────────────────
    private static SaveSystem _instance;
    public static SaveSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("SaveSystem");
                _instance = go.AddComponent<SaveSystem>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private const string SavePrefix = "/save_";
    private const string SaveExtension = ".json";
    private const int SlotCount = 3;
    private const int SavePanelSortOrder = 300;
    private const int CurrentSaveVersion = 2;

    private bool _isPanelOpen;
    private Canvas _saveCanvas;
    private CanvasGroup _canvasGroup;
    private GameObject _panelRoot;
    private GameObject _backgroundOverlay;
    private RectTransform _panelRect;
    private readonly GameObject[] _slotObjects = new GameObject[SlotCount];
    private readonly Text[] _slotSummaryTexts = new Text[SlotCount];
    private readonly Button[] _saveButtons = new Button[SlotCount];
    private readonly Button[] _loadButtons = new Button[SlotCount];

    private Font _font;
    private Vector2 _panelHiddenPos;
    private Vector2 _panelShownPos;
    private Coroutine _slideCoroutine;

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            if (Application.isPlaying) DontDestroyOnLoad(gameObject);
        }
        else if (_instance != this)
        {
            Object.Destroy(gameObject);
            return;
        }

        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        CreateSavePanelUI();
    }

    private void OnDestroy()
    {
        if (_instance == this)
        {
            _instance = null;
        }
    }

    // ── Save/Load Core ────────────────────────────────────

    /// <summary>
    /// Save current game state to the specified slot (0-2).
    /// </summary>
    public void SaveToSlot(int slot)
    {
        if (slot < 0 || slot >= SlotCount)
        {
            Debug.LogWarning($"[SaveSystem] Invalid slot: {slot}");
            return;
        }

        SaveData data = new SaveData();
        data.saveVersion = CurrentSaveVersion;
        data.slot = slot;
        data.timestamp = System.DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

        // Core game state
        GameController gc = GameController.Instance;
        if (gc != null)
        {
            data.day = gc.State.CurrentDay;
            data.money = gc.State.Money;
            data.timeIndex = GetTimeIndexFromLabel(gc.State.CurrentTimeLabel);
            data.currentLocationId = gc.State.CurrentLocationId;
            data.barServed = BarMinigame.Instance != null ? BarMinigame.Instance.CustomersServed : 0;
            data.barRevenue = BarMinigame.Instance != null ? BarMinigame.Instance.ShiftEarnings : 0;
            // Mid-shift save support: capture transient shift state
            if (BarMinigame.Instance != null)
            {
                data.barShiftActive = BarMinigame.Instance.IsShiftActive;
                data.barShiftEarnings = BarMinigame.Instance.ShiftEarningsRaw;
                data.barShiftTips = BarMinigame.Instance.ShiftTips;
                data.barShiftComboCount = BarMinigame.Instance.ShiftComboCount;
                data.barShiftCorrectCount = BarMinigame.Instance.ShiftCorrectCount;
                data.barShiftApologyTipMultiplier = BarMinigame.Instance.ShiftApologyTipMultiplier;
                data.barShiftApologyMode = BarMinigame.Instance.ShiftApologyMode;
            }
        }

        // Affection (from InventorySystem)
        if (InventorySystem.Instance != null)
        {
            string[] npcIds = { "pablo", "erik", "sofie", "chen", "ravi", "de_wit", "maaike", "fatima" };
            data.affectionKeys.Clear();
            data.affectionValues.Clear();
            foreach (string npcId in npcIds)
            {
                int val = InventorySystem.Instance.GetAffection(npcId);
                data.affectionKeys.Add(npcId);
                data.affectionValues.Add(val);
            }
        }

        // Triggered events
        data.triggeredEvents.Clear();
        if (gc != null)
        {
            // Use public method to get triggered event IDs
            data.triggeredEvents.AddRange(gc.State.GetTriggeredEventIds());
        }

        // Bar stock (mirrors brew stock from GameState for backward compat)
        data.barStock = new int[] {
            gc?.State.GetBrewStock(0) ?? 5,
            gc?.State.GetBrewStock(1) ?? 3,
            gc?.State.GetBrewStock(2) ?? 2
        };

        // [Brewing] Save brew stock from GameState
        if (gc != null)
        {
            data.brewStock[0] = gc.State.GetBrewStock(0);
            data.brewStock[1] = gc.State.GetBrewStock(1);
            data.brewStock[2] = gc.State.GetBrewStock(2);
            data.activeBrewIndex = gc.State.ActiveBrewIndex;
            data.activeBrewTurnsRemaining = gc.State.ActiveBrewTurnsRemaining;
            data.totalCustomersServed = gc.State.TotalCustomersServed;
            data.totalRevenue = gc.State.TotalRevenue;
            data.gameWentBankrupt = gc.State.GameWentBankrupt;
        }

        // Achievements
        data.unlockedAchievements.Clear();
        if (AchievementSystem.Instance != null)
        {
            data.unlockedAchievements.AddRange(GetAchievementIds());
            // Save partial achievement progress so progress survives save/load
            data.achievementTracking = AchievementSystem.Instance.GetTrackingData();
        }

        // [Gameplay] Save bar upgrades
        if (BarUpgradeSystem.Instance != null)
        {
            var upgradeData = BarUpgradeSystem.Instance.GetSaveData();
            data.purchasedUpgrades = upgradeData;
        }

        // Items (id → count from InventorySystem)
        data.itemIds.Clear();
        data.itemCounts.Clear();
        if (InventorySystem.Instance != null)
        {
            Dictionary<string, int> items = InventorySystem.Instance.GetItems();
            foreach (var kvp in items)
            {
                data.itemIds.Add(kvp.Key);
                data.itemCounts.Add(kvp.Value);
            }
        }

        // Fragments (inspiration fragments from surfing)
        data.fragments.Clear();
        if (InventorySystem.Instance != null)
        {
            data.fragments.AddRange(InventorySystem.Instance.GetFragments());
        }

        // Lore (unlocked lore entries)
        data.loreIds.Clear();
        data.loreTexts.Clear();
        if (InventorySystem.Instance != null)
        {
            Dictionary<string, string> lore = InventorySystem.Instance.GetLore();
            foreach (var kvp in lore)
            {
                data.loreIds.Add(kvp.Key);
                data.loreTexts.Add(kvp.Value);
            }
        }

        // Academic progress
        data.academicProgress = InventorySystem.Instance != null ? InventorySystem.Instance.AcademicProgress : 0;

        // [Gameplay] Save shop owned items
        data.ownedShopItems.Clear();
        if (ShopSystem.Instance != null)
        {
            string[] allShopIds = { "coffee", "notebook", "tulip", "whiskey", "labpass", "guide" };
            foreach (string id in allShopIds)
            {
                if (ShopSystem.Instance.IsItemOwned(id))
                    data.ownedShopItems.Add(id);
            }
        }

        // Save visited locations (for end-screen stats)
        data.visitedLocations.Clear();
        if (gc != null)
        {
            data.visitedLocations.AddRange(gc.State.GetVisitedLocations());
        }

        // Save daily goals (per-day goal completion state)
        data.dailyGoals.Clear();
        if (gc != null && gc.State.DailyGoals != null)
        {
            data.dailyGoals.AddRange(gc.State.DailyGoals);
        }

        // Save tutorial progress
        if (TutorialSystem.Instance != null)
        {
            data.tutorialWelcomeDismissed = TutorialSystem.Instance.WelcomeDismissed;
            data.tutorialStepCompleted = TutorialSystem.Instance.GetStepCompletionStates();
        }

        // Serialize to JSON and write file atomically (temp file + rename)
        string json = JsonUtility.ToJson(data, true);
        string path = Application.persistentDataPath + SavePrefix + slot + SaveExtension;
        string tmpPath = path + ".tmp";
        try
        {
            File.WriteAllText(tmpPath, json);
            File.Delete(path);  // File.Move throws if target exists on some platforms
            File.Move(tmpPath, path);
            Debug.Log($"[SaveSystem] Saved to slot {slot}: {path}");
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[SaveSystem] Failed to write save file: {ex.Message}");
        }

        RefreshPanelDisplays();
    }

    /// <summary>
    /// Load game state from the specified slot (0-2).
    /// </summary>
    public bool LoadFromSlot(int slot)
    {
        if (slot < 0 || slot >= SlotCount)
        {
            Debug.LogWarning($"[SaveSystem] Invalid slot: {slot}");
            return false;
        }

        string path = Application.persistentDataPath + SavePrefix + slot + SaveExtension;
        if (!File.Exists(path))
        {
            Debug.LogWarning($"[SaveSystem] No save file found for slot {slot}");
            return false;
        }

        SaveData data;
        try
        {
            string json = File.ReadAllText(path);
            data = JsonUtility.FromJson<SaveData>(json);
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[SaveSystem] Failed to read save file: {ex.Message}");
            return false;
        }

        if (data == null)
        {
            Debug.LogError("[SaveSystem] Save data is null after deserialization");
            return false;
        }

        // Save version migration: ensure newly-added fields have sensible defaults
        MigrateSaveData(data);

        // Destroy end game canvas before restoring (so it doesn't persist)
        GameController gc = GameController.Instance;
        if (gc != null)
            gc.DestroyEndGameCanvas();

        // Close subsystem panels so stale UIs don't persist after load
        if (BrewingSystem.Instance != null)
            BrewingSystem.Instance.ClosePanel();

        // Restore core game state
        if (gc != null)
        {
            gc.State.GameEnded = false;
            gc.State.GameWon = false;
            gc.State.CurrentDay = data.day;
            gc.State.TimeIndex = data.timeIndex;
            gc.State.CurrentLocationId = data.currentLocationId ?? "de_pijp";
            gc.State.SetMoney(data.money);
            // Restore bar shift state from mid-shift saves; otherwise clean reset
            if (data.barShiftActive && data.barServed > 0 && BarMinigame.Instance != null)
            {
                BarMinigame.Instance.RestoreAndCompleteShift(
                    data.barServed,
                    data.barShiftEarnings,
                    data.barShiftTips,
                    data.barShiftCorrectCount,
                    data.barShiftComboCount,
                    data.barShiftApologyTipMultiplier,
                    data.barShiftApologyMode
                );
            }
            else if (BarMinigame.Instance != null)
            {
                BarMinigame.Instance.ResetShiftStats();
            }
            gc.State.ClearTriggeredEvents();
            foreach (string eventId in data.triggeredEvents)
            {
                gc.State.AddTriggeredEvent(eventId);
            }

            // [Brewing] Restore brew stock
            gc.State.ClearBrewStock();
            if (data.brewStock != null)
            {
                for (int i = 0; i < 3 && i < data.brewStock.Length; i++)
                    gc.State.SetBrewStock(i, data.brewStock[i]);
            }
            gc.State.GameWentBankrupt = data.gameWentBankrupt;
            gc.State.ActiveBrewIndex = data.activeBrewIndex;
            gc.State.ActiveBrewTurnsRemaining = data.activeBrewTurnsRemaining;
            gc.State.TotalCustomersServed = data.totalCustomersServed;
            gc.State.TotalRevenue = data.totalRevenue;
        }

        // Reset ShopSystem owned states before applying save data
        if (ShopSystem.Instance != null)
        {
            ShopSystem.Instance.ResetOwned();
            // Restore owned items from save data
            if (data.ownedShopItems != null)
            {
                foreach (string ownedId in data.ownedShopItems)
                {
                    // Mark items as owned without re-purchasing (no money deduction)
                    ShopSystem.Instance.MarkItemOwned(ownedId);
                }
            }
        }

        // Restore inventory: reset first, then repopulate everything
        if (InventorySystem.Instance != null)
        {
            InventorySystem.Instance.ResetInventory();

            // Restore items
            if (data.itemIds != null && data.itemCounts != null)
            {
                for (int i = 0; i < data.itemIds.Count && i < data.itemCounts.Count; i++)
                {
                    for (int c = 0; c < data.itemCounts[i]; c++)
                        InventorySystem.Instance.AddItem(data.itemIds[i], data.itemIds[i]);
                }
            }
            // Restore fragments
            if (data.fragments != null)
            {
                foreach (string f in data.fragments)
                    InventorySystem.Instance.AddFragment(f);
            }
            // Restore lore
            if (data.loreIds != null && data.loreTexts != null)
            {
                for (int i = 0; i < data.loreIds.Count && i < data.loreTexts.Count; i++)
                    InventorySystem.Instance.UnlockLore(data.loreIds[i], data.loreTexts[i]);
            }
            // Restore academic progress
            InventorySystem.Instance.AddAcademicProgress(data.academicProgress);

            // Restore affection (after ResetInventory clears it)
            for (int i = 0; i < data.affectionKeys.Count && i < data.affectionValues.Count; i++)
            {
                InventorySystem.Instance.SetAffection(data.affectionKeys[i], data.affectionValues[i]);
            }
        }

        // [Gameplay] Load bar upgrades
        if (BarUpgradeSystem.Instance != null && data.purchasedUpgrades != null)
        {
            BarUpgradeSystem.Instance.LoadFromSave(data.purchasedUpgrades);
        }

        // Restore achievements from save data
        if (AchievementSystem.Instance != null && data.unlockedAchievements != null)
        {
            AchievementSystem.Instance.ResetAllAchievements();
            foreach (string achId in data.unlockedAchievements)
            {
                AchievementSystem.Instance.RestoreAchievement(achId);
            }
            // Restore partial achievement progress from save data
            if (data.achievementTracking != null)
            {
                AchievementSystem.Instance.RestoreTrackingData(data.achievementTracking);
            }
        }

        // Restore visited locations directly from save data
        if (gc != null && data.visitedLocations != null)
        {
            foreach (string locId in data.visitedLocations)
            {
                gc.State.RegisterLocationVisited(locId);
            }
        }

        // Restore daily goals from save data
        if (gc != null && data.dailyGoals != null && data.dailyGoals.Count > 0)
        {
            gc.State.DailyGoals.Clear();
            gc.State.DailyGoals.AddRange(data.dailyGoals);
        }

        // Restore tutorial progress from save data
        if (TutorialSystem.Instance != null)
        {
            TutorialSystem.Instance.RestoreStepStates(
                data.tutorialStepCompleted,
                data.tutorialWelcomeDismissed);
        }

        // Refresh HUD
        if (gc != null)
        {
            gc.RefreshHudPublic();
        }

        GameController.Instance?.ShowResultFeedback("Game loaded.");
        Debug.Log($"[SaveSystem] Loaded slot {slot}: Day {data.day}, Money ${data.money}");
        return true;
    }

    /// <summary>
    /// Auto-save to slot 0 (overwrite).
    /// </summary>
    public void AutoSave()
    {
        SaveToSlot(0);
    }

    /// <summary>
    /// Quick-load from slot 0.
    /// </summary>
    public void QuickLoad()
    {
        LoadFromSlot(0);
        // Close panel if open
        if (_isPanelOpen)
        {
            ToggleSavePanel();
        }
    }

    /// <summary>
    /// Migrate save data from older versions to the current format.
    /// Ensures fields added after v1 have sensible defaults when loading old saves.
    /// </summary>
    private void MigrateSaveData(SaveData data)
    {
        int loadedVersion = data.saveVersion;
        if (loadedVersion >= CurrentSaveVersion) return;

        Debug.Log($"[SaveSystem] Migrating save from v{loadedVersion} to v{CurrentSaveVersion}");

        // v1 → v2: ensure fields added after initial save format have defaults
        if (loadedVersion < 2)
        {
            if (data.brewStock == null || data.brewStock.Length < 3)
                data.brewStock = new int[] { 0, 0, 0 };
            if (data.visitedLocations == null)
                data.visitedLocations = new List<string>();
            if (data.dailyGoals == null)
                data.dailyGoals = new List<DailyGoal>();
            if (data.tutorialStepCompleted == null)
                data.tutorialStepCompleted = new List<bool>();
            if (data.ownedShopItems == null)
                data.ownedShopItems = new List<string>();
            if (data.itemIds == null)
                data.itemIds = new List<string>();
            if (data.itemCounts == null)
                data.itemCounts = new List<int>();
            if (data.fragments == null)
                data.fragments = new List<string>();
            if (data.loreIds == null)
                data.loreIds = new List<string>();
            if (data.loreTexts == null)
                data.loreTexts = new List<string>();
            if (data.purchasedUpgrades == null)
                data.purchasedUpgrades = new List<string>();
            if (data.unlockedAchievements == null)
                data.unlockedAchievements = new List<string>();
            if (data.affectionKeys == null)
                data.affectionKeys = new List<string>();
            if (data.affectionValues == null)
                data.affectionValues = new List<int>();
        }

        // Bump the in-memory version so downstream code sees current version
        data.saveVersion = CurrentSaveVersion;
    }

    /// <summary>
    /// Get a summary string for the specified slot.
    /// </summary>
    public string GetSaveSummary(int slot)
    {
        if (slot < 0 || slot >= SlotCount)
            return "Invalid slot";

        string path = Application.persistentDataPath + SavePrefix + slot + SaveExtension;
        if (!File.Exists(path))
            return "Empty";

        try
        {
            string json = File.ReadAllText(path);
            SaveData data = JsonUtility.FromJson<SaveData>(json);
            if (data == null) return "Empty";

            int totalAffection = 0;
            foreach (int v in data.affectionValues) totalAffection += v;

            return $"Day {data.day}  |  ${data.money}  |  Affection: +{totalAffection}\n{data.timestamp}";
        }
        catch
        {
            return "Corrupted save";
        }
    }

    // ── UI Panel ───────────────────────────────────────────

    /// <summary>
    /// Toggle the save/load panel open/closed.
    /// </summary>
    public void ToggleSavePanel()
    {
        if (_saveCanvas == null) return;

        if (_isPanelOpen)
        {
            ClosePanel();
        }
        else
        {
            OpenPanel();
        }
    }

    /// <summary>
    /// Whether the save panel is currently open.
    /// </summary>
    public bool IsPanelOpen => _isPanelOpen;

    /// <summary>
    /// Force-close the save panel (for New Game / Load use).
    /// </summary>
    public void ClosePanelPublic()
    {
        if (!_isPanelOpen) return;
        ClosePanel();
    }

    private void OpenPanel()
    {
        _isPanelOpen = true;
        _saveCanvas.gameObject.SetActive(true);
        RefreshPanelDisplays();
        // Animate slide-in
        if (_slideCoroutine != null) StopCoroutine(_slideCoroutine);
        _slideCoroutine = StartCoroutine(SlidePanel(true));
    }

    private void ClosePanel()
    {
        _isPanelOpen = false;
        if (_slideCoroutine != null) StopCoroutine(_slideCoroutine);
        _slideCoroutine = StartCoroutine(SlidePanel(false));
    }

    private IEnumerator SlidePanel(bool show)
    {
        if (_panelRect == null) yield break;

        float duration = 0.3f;
        Vector2 startPos = show ? _panelHiddenPos : _panelShownPos;
        Vector2 endPos = show ? _panelShownPos : _panelHiddenPos;

        // Fade background
        if (_backgroundOverlay != null)
        {
            Image bgImg = _backgroundOverlay.GetComponent<Image>();
            if (bgImg != null)
            {
                Color bgColor = bgImg.color;
                float startAlpha = show ? 0f : 0.7f;
                float endAlpha = show ? 0.7f : 0f;
                for (float t = 0; t < duration; t += Time.deltaTime)
                {
                    float p = Mathf.Min(t / duration, 1f);
                    float smooth = p * p * (3f - 2f * p);
                    _panelRect.anchoredPosition = Vector2.Lerp(startPos, endPos, smooth);
                    bgColor.a = Mathf.Lerp(startAlpha, endAlpha, smooth);
                    bgImg.color = bgColor;
                    yield return null;
                }
            }
        }
        else
        {
            for (float t = 0; t < duration; t += Time.deltaTime)
            {
                float p = Mathf.Min(t / duration, 1f);
                float smooth = p * p * (3f - 2f * p);
                _panelRect.anchoredPosition = Vector2.Lerp(startPos, endPos, smooth);
                yield return null;
            }
        }

        _panelRect.anchoredPosition = endPos;
        if (!show)
        {
            _saveCanvas.gameObject.SetActive(false);
        }
        _slideCoroutine = null;
    }

    private void RefreshPanelDisplays()
    {
        for (int i = 0; i < SlotCount; i++)
        {
            if (_slotSummaryTexts[i] != null)
            {
                string slotLabel = i == 0 ? "Auto" : $"Slot {i}";
                string summary = GetSaveSummary(i);
                _slotSummaryTexts[i].text = $"<b>{slotLabel}</b>\n{summary}";
            }
        }
    }

    // ── UI Creation ────────────────────────────────────────

    private void CreateSavePanelUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("SaveCanvas");
        canvasGO.transform.SetParent(transform);
        _saveCanvas = canvasGO.AddComponent<Canvas>();
        _saveCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _saveCanvas.sortingOrder = SavePanelSortOrder;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        // CanvasGroup for fade support
        _canvasGroup = canvasGO.AddComponent<CanvasGroup>();

        // Semi-transparent black background
        _backgroundOverlay = new GameObject("Overlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _backgroundOverlay.transform.SetParent(_saveCanvas.transform, false);
        Image bgImg = _backgroundOverlay.GetComponent<Image>();
        bgImg.color = new Color32(0, 0, 0, 0);
        RectTransform bgRT = _backgroundOverlay.GetComponent<RectTransform>();
        bgRT.anchorMin = Vector2.zero;
        bgRT.anchorMax = Vector2.one;
        bgRT.offsetMin = Vector2.zero;
        bgRT.offsetMax = Vector2.zero;

        // Panel (slides in from bottom)
        _panelRoot = new GameObject("SavePanel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _panelRoot.transform.SetParent(_saveCanvas.transform, false);
        Image panelImg = _panelRoot.GetComponent<Image>();
        panelImg.color = new Color32(20, 24, 30, 245);
        _panelRect = _panelRoot.GetComponent<RectTransform>();
        _panelRect.anchorMin = new Vector2(0.1f, 0.15f);
        _panelRect.anchorMax = new Vector2(0.9f, 0.85f);
        _panelRect.offsetMin = Vector2.zero;
        _panelRect.offsetMax = Vector2.zero;
        _panelShownPos = _panelRect.anchoredPosition;
        _panelHiddenPos = _panelShownPos + new Vector2(0, -800f);
        _panelRect.anchoredPosition = _panelHiddenPos;

        // Title
        Text titleText = CreateText("Title", _panelRoot.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(20, -44), new Vector2(-20, -4),
            28, TextAnchor.MiddleLeft);
        titleText.text = "Save / Load";
        titleText.fontStyle = FontStyle.Bold;

        // Close hint
        Text closeHint = CreateText("CloseHint", _panelRoot.transform,
            new Vector2(1, 1), new Vector2(1, 1),
            new Vector2(-140, -44), new Vector2(-20, -8),
            14, TextAnchor.MiddleRight);
        closeHint.text = "Press L to close";
        closeHint.color = new Color32(150, 150, 150, 200);

        // Slot content area
        float slotStartY = -68f;
        float slotHeight = 170f;
        float slotGap = 12f;

        for (int i = 0; i < SlotCount; i++)
        {
            CreateSlotUI(i, slotStartY - i * (slotHeight + slotGap), slotHeight);
        }
    }

    private void CreateSlotUI(int slotIndex, float yOffset, float height)
    {
        // Slot background
        GameObject slotGO = new GameObject($"Slot_{slotIndex}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        slotGO.transform.SetParent(_panelRoot.transform, false);
        Image slotBg = slotGO.GetComponent<Image>();
        slotBg.color = new Color32(35, 40, 50, 200);
        RectTransform slotRT = slotGO.GetComponent<RectTransform>();
        slotRT.anchorMin = new Vector2(0, 1);
        slotRT.anchorMax = new Vector2(1, 1);
        slotRT.offsetMin = new Vector2(16, yOffset - height);
        slotRT.offsetMax = new Vector2(-16, yOffset);

        _slotObjects[slotIndex] = slotGO;

        // Slot label
        string slotLabel = slotIndex == 0 ? "Auto Save" : $"Slot {slotIndex}";
        Text slotLabelText = CreateText("Label", slotGO.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(12, -28), new Vector2(-12, -4),
            16, TextAnchor.MiddleLeft);
        slotLabelText.text = slotLabel;
        slotLabelText.fontStyle = FontStyle.Bold;
        slotLabelText.color = new Color32(236, 180, 87, 255);

        // Summary text (multi-line)
        Text summaryText = CreateText("Summary", slotGO.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(12, -height + 32), new Vector2(-120, -32),
            13, TextAnchor.UpperLeft);
        summaryText.text = "Empty";
        summaryText.color = new Color32(180, 175, 165, 220);
        summaryText.horizontalOverflow = HorizontalWrapMode.Wrap;
        _slotSummaryTexts[slotIndex] = summaryText;

        // Save button
        Button saveBtn = CreateButton("SaveBtn", slotGO.transform,
            new Vector2(1, 0), new Vector2(1, 0),
            new Vector2(-108, 18), new Vector2(-60, 56),
            "Save");
        saveBtn.onClick.AddListener(() =>
        {
            SaveToSlot(slotIndex);
            RefreshPanelDisplays();
            GameController.Instance?.ShowResultFeedback("Game saved.");
        });
        _saveButtons[slotIndex] = saveBtn;

        // Load button
        Button loadBtn = CreateButton("LoadBtn", slotGO.transform,
            new Vector2(1, 0), new Vector2(1, 0),
            new Vector2(-56, 18), new Vector2(-8, 56),
            "Load");
        loadBtn.onClick.AddListener(() =>
        {
            if (LoadFromSlot(slotIndex))
                ClosePanel();
        });
        _loadButtons[slotIndex] = loadBtn;
    }

    // ── UI Helpers ─────────────────────────────────────────

    private Text CreateText(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        Vector2 offsetMin, Vector2 offsetMax, int fontSize, TextAnchor alignment)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = offsetMin;
        rt.offsetMax = offsetMax;

        Text text = go.GetComponent<Text>();
        text.font = _font;
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Overflow;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    private Button CreateButton(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        Vector2 offsetMin, Vector2 offsetMax, string label)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = offsetMin;
        rt.offsetMax = offsetMax;

        Image img = go.GetComponent<Image>();
        img.color = new Color32(236, 180, 87, 255);

        Button button = go.AddComponent<Button>();
        button.targetGraphic = img;

        // Button text
        Text btnText = CreateText("Text", go.transform,
            Vector2.zero, Vector2.one,
            Vector2.zero, Vector2.zero,
            14, TextAnchor.MiddleCenter);
        btnText.text = label;
        btnText.color = new Color32(20, 22, 26, 255);
        btnText.fontStyle = FontStyle.Bold;

        return button;
    }

    // ── Helper: Read achievement IDs ───────────────────────

    private List<string> GetAchievementIds()
    {
        List<string> ids = new List<string>();
        // Query unlocked achievements from AchievementSystem
        if (AchievementSystem.Instance != null)
        {
            ids = AchievementSystem.Instance.GetUnlockedAchievementIds();
        }
        return ids;
    }

    // ── Helper: Derive timeIndex from label ────────────────

    private int GetTimeIndexFromLabel(string label)
    {
        string normalized = label.ToLower().Replace(" ", "_");
        string[] times = { "dawn", "morning", "afternoon", "evening", "night", "late_night" };
        for (int i = 0; i < times.Length; i++)
        {
            if (normalized == times[i]) return i;
        }
        return 0;
    }
}
