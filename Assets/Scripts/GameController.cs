using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

[ExecuteAlways]
public sealed class GameController : MonoBehaviour
{
    // ── Singleton (T5) ────────────────────────────────
    public static GameController Instance { get; private set; }

    // ── GameState (extracted state object) ────────────
    public GameState State { get; private set; } = new GameState();

    private const string RuntimeRootName = "AB Runtime View";

    private readonly string[] _timesOfDay = { "dawn", "morning", "afternoon", "evening", "night", "late_night" };

    // ── Location POI tags (UI upgrade) ────────────────────
    private static readonly Dictionary<string, string[]> LocationPois = new Dictionary<string, string[]>
    {
        { "de_pijp", new[] { "Albert Cuypmarkt", "Cafe de Jaren", "Sarphatipark", "Brouwerij 't IJ" } },
        { "science_park", new[] { "Amsterdam Science Park", "Lab42", "Matrix Building", "Green Village" } },
        { "tweede_kans", new[] { "Tweede Kans Bar", "Brouwerij de Prael", "De Waag", "Nieuwezijds Voorburgwal" } },
        { "bloemenmarkt", new[] { "Singel Canal", "Royal FloraHolland", "Tulip Museum", "Leidseplein" } },
    };

    private readonly Dictionary<string, LocationView> _locations = new Dictionary<string, LocationView>
    {
        {
            "de_pijp",
            new LocationView(
                "De Pijp",
                "A small borrowed room above the market.\nRent is due; ideas are cheap.",
                new Color32(47, 55, 66, 255),
                new Color32(194, 87, 52, 255),
                new Color32(245, 177, 90, 255))
        },
        {
            "science_park",
            new LocationView(
                "Science Park",
                "Morning lectures, prototype ethics,\nand fluorescent coffee.",
                new Color32(24, 56, 66, 255),
                new Color32(55, 151, 164, 255),
                new Color32(142, 223, 210, 255))
        },
        {
            "tweede_kans",
            new LocationView(
                "Tweede Kans",
                "An old Amsterdam bar running on\nhabit, memory, and unpaid favors.",
                new Color32(42, 35, 28, 255),
                new Color32(154, 111, 45, 255),
                new Color32(233, 194, 119, 255))
        },
        {
            "bloemenmarkt",
            new LocationView(
                "Bloemenmarkt",
                "Sofie's flower stall at the floating market.\nTulips, gossip, and canal water.",
                new Color32(30, 50, 30, 255),
                new Color32(220, 110, 140, 255),
                new Color32(240, 235, 210, 255))
        },
    };

    // ── Public state accessors (delegate to GameState) ──
    public int Money => State.Money;
    public int CurrentDay => State.CurrentDay;
    public string CurrentTimeLabel => State.CurrentTimeLabel;
    public string CurrentLocationName => _locations.ContainsKey(State.CurrentLocationId) ? _locations[State.CurrentLocationId].title : State.CurrentLocationId;
    public string CurrentLocationId => State.CurrentLocationId;
    public int TriggeredEventCount => State.TriggeredEventCount;
    // ── SaveSystem setters (delegate to GameState) ────
    public void SetDay(int d) { State.CurrentDay = d; }
    public void SetTimeIndex(int t) { State.TimeIndex = t; }
    public void SetMoney(int m) { State.SetMoney(m); }
    public List<string> GetTriggeredEventIds() { return State.GetTriggeredEventIds(); }
    public void ClearTriggeredEvents() { State.ClearTriggeredEvents(); }
    public void AddTriggeredEvent(string id) { State.AddTriggeredEvent(id); }
    public void RefreshHudPublic() { RefreshHud(); }

    private EventDatabase _eventDatabase;

    private Font _font;

    // ── UI Animation (F3/F4/F6/T7) ────────────────────
    private CanvasGroup _flashOverlay;        // For time-advance flash
    private CanvasGroup _feedbackGroup;       // For feedback fade
    private Coroutine _feedbackCoroutine;

    // HUD elements
    private Text _timeText;
    private Text _locationText;
    private Text _barStatusText;
    private Text _moneyText;
    private Text _feedbackText;
    private Text _hintText;
    private Text _weatherText;
    private Text _goalTargetText;
    private Text _lowMoneyWarning;
    private Image _hintBackplate;

    // UI upgrade: HUD icon plate references for color transitions
    private Image _hudBgImage;
    private Image _timeIconPlate;
    private Image _locIconPlate;
    private Image _barIconPlate;
    private Image _moneyIconPlate;

    // F1: Daily goals HUD
    private Text _goalText1;
    private Text _goalText2;

    // F7: Affection progress bar
    private Text _affectionBarText;

    // F2: Result feedback (show outcome text, clear after delay)
    private string _pendingFeedback;
    private float _feedbackTimer;
    private bool _showingResultFeedback;

    // Location scene
    private GameObject _locationScene;
    private Text _locationTitle;
    private Text _locationDesc;

    // UI upgrade: POI tags container
    private GameObject _poiTagContainer;

    private GameObject _runtimeRoot;

    private void Awake()
    {
        Instance = this; // (T5)
        BootstrapView();
        // Initialize new system singletons (safe to call multiple times)
        if (Application.isPlaying)
        {
            var _ = InventoryUI.Instance;
            var _c = CharacterPanel.Instance;
            var _a = AchievementSystem.Instance;
            var _t = TutorialSystem.Instance;
            var _s = ShopSystem.Instance;
            var _d = DialogueLog.Instance;
            var _save = SaveSystem.Instance;
            var _brew = BrewingSystem.Instance;
        }
    }

    private void OnEnable()
    {
        if (!Application.isPlaying)
        {
            BootstrapView();
        }
    }

    private void OnDisable()
    {
        if (!Application.isPlaying)
        {
            CleanupGeneratedView();
        }
    }

    private void OnDestroy()
    {
        StopAllCoroutines();
        if (Instance == this) Instance = null;
    }

    private void BootstrapView()
    {
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        LoadData();
        CleanupGeneratedView();
        BuildInterface();
        RenderLocation();
        // F1: Generate initial daily goals
        if (Application.isPlaying && State.DailyGoals.Count == 0)
        {
            GenerateDailyGoals();
        }
        RefreshHud();
    }

    private void Update()
    {
        if (!Application.isPlaying)
        {
            return;
        }

        // F2: Auto-clear feedback timer
        if (_showingResultFeedback)
        {
            _feedbackTimer -= Time.deltaTime;
            if (_feedbackTimer <= 0f)
            {
                _showingResultFeedback = false;
                if (_feedbackText != null) _feedbackText.text = _pendingFeedback ?? "";
                _pendingFeedback = null;
            }
        }

        HandleInput();
    }

    // T4: Extracted input handling for readability
    private void HandleInput()
    {
        // Block input in the same frame the welcome screen was just dismissed.
        // Without this, pressing Space to dismiss the welcome can also advance
        // time in the same frame if GameController.Update runs after TutorialSystem.Update.
        if (TutorialSystem.Instance != null && TutorialSystem.Instance.JustDismissedWelcomeThisFrame)
        {
            TutorialSystem.Instance.JustDismissedWelcomeThisFrame = false;
            return;
        }

        // Don't process gameplay keys while tutorial welcome is up
        if (TutorialSystem.Instance != null && TutorialSystem.Instance.WelcomeIsActive_BlockingInput)
            return;

        // Escape — close the topmost open panel (LIFO order)
        if (Input.GetKeyDown(KeyCode.Escape))
        {
            if (TryCloseTopPanel()) return;
        }

        // System panel keys (I/C/P) — check before game action keys
        if (Input.GetKeyDown(KeyCode.I))
        {
            if (InventoryUI.Instance != null) InventoryUI.Instance.Toggle();
            return;
        }
        if (Input.GetKeyDown(KeyCode.C))
        {
            if (CharacterPanel.Instance != null) CharacterPanel.Instance.Toggle();
            return;
        }
        if (Input.GetKeyDown(KeyCode.P))
        {
            if (AchievementSystem.Instance != null) AchievementSystem.Instance.TogglePanel();
            return;
        }
        // [SaveSystem] Save/Load
        if (Input.GetKeyDown(KeyCode.L))
        {
            if (SaveSystem.Instance != null) SaveSystem.Instance.ToggleSavePanel();
            TutorialSystem.Instance?.OnSaveOrLoadUsed();
            return;
        }
        if (Input.GetKeyDown(KeyCode.O))
        {
            if (SaveSystem.Instance != null) SaveSystem.Instance.QuickLoad();
            TutorialSystem.Instance?.OnSaveOrLoadUsed();
            return;
        }
        // [New Game] Only available after game ended
        if (Input.GetKeyDown(KeyCode.N) && State.GameEnded)
        {
            StartNewGame();
            return;
        }
        // [BarUpgrade] Upgrade panel
        if (Input.GetKeyDown(KeyCode.U))
        {
            if (BarUpgradeSystem.Instance != null) BarUpgradeSystem.Instance.TogglePanel();
            TutorialSystem.Instance?.OnUpgradeOpened();
            return;
        }
        // [BrewingSystem] Brew panel
        if (Input.GetKeyDown(KeyCode.R))
        {
            if (BrewingSystem.Instance != null) BrewingSystem.Instance.TogglePanel();
            return;
        }
        // [ShopSystem] Shop panel
        if (Input.GetKeyDown(KeyCode.M))
        {
            if (ShopSystem.Instance != null) ShopSystem.Instance.TogglePanel();
            TutorialSystem.Instance?.OnShopOpened();
            return;
        }
        // [DialogueLog] Dialogue history
        if (Input.GetKeyDown(KeyCode.H))
        {
            if (DialogueLog.Instance != null) DialogueLog.Instance.TogglePanel();
            return;
        }

        // Delegate dialogue input to DialogueManager (which handles in its own Update)
        if (DialogueManager.Instance != null && DialogueManager.Instance.IsDialogueActive)
        {
            return;
        }

        // Block gameplay keys while end screen is visible
        if (State.GameEnded) return;

        if (Input.GetKeyDown(KeyCode.Space))
        {
            AdvanceTime();
        }
        else if (Input.GetKeyDown(KeyCode.Alpha1))
        {
            SwitchLocation("de_pijp");
        }
        else if (Input.GetKeyDown(KeyCode.Alpha2))
        {
            SwitchLocation("science_park");
        }
        else if (Input.GetKeyDown(KeyCode.Alpha3))
        {
            SwitchLocation("tweede_kans");
        }
        else if (Input.GetKeyDown(KeyCode.Alpha4))
        {
            SwitchLocation("bloemenmarkt");
        }
        else if (Input.GetKeyDown(KeyCode.B))
        {
            if (BarMinigame.Instance != null)
            {
                if (!BarMinigame.Instance.IsShiftActive)
                    BarMinigame.Instance.StartShift();
                else
                    SetFeedback("A bar shift is already in progress.");
            }
        }
        else if (Input.GetKeyDown(KeyCode.S))
        {
            SetFeedback("Use the bar minigame UI to serve customers.");
        }
        else if (Input.GetKeyDown(KeyCode.F))
        {
            if (BarMinigame.Instance != null)
            {
                if (BarMinigame.Instance.IsShiftActive)
                    BarMinigame.Instance.EndShift();
                else
                    SetFeedback("No shift to close yet.");
            }
        }
    }

    /// <summary>
    /// Close the topmost open panel on Escape. Priority: right-side → left-side panels.
    /// </summary>
    private bool TryCloseTopPanel()
    {
        if (DialogueManager.Instance != null && DialogueManager.Instance.IsDialogueActive)
            return false;
        if (State.GameEnded) return false;
        if (DialogueLog.Instance != null && DialogueLog.Instance.IsPanelOpen)
        { DialogueLog.Instance.TogglePanel(); return true; }
        if (ShopSystem.Instance != null && ShopSystem.Instance.IsPanelOpen)
        { ShopSystem.Instance.TogglePanel(); return true; }
        if (BrewingSystem.Instance != null && BrewingSystem.Instance.IsPanelOpen)
        { BrewingSystem.Instance.TogglePanel(); return true; }
        if (BarUpgradeSystem.Instance != null && BarUpgradeSystem.Instance.IsPanelOpen)
        { BarUpgradeSystem.Instance.TogglePanel(); return true; }
        if (SaveSystem.Instance != null && SaveSystem.Instance.IsPanelOpen)
        { SaveSystem.Instance.ToggleSavePanel(); return true; }
        if (AchievementSystem.Instance != null && AchievementSystem.Instance.IsPanelOpen)
        { AchievementSystem.Instance.TogglePanel(); return true; }
        if (CharacterPanel.Instance != null && CharacterPanel.Instance.IsPanelOpen)
        { CharacterPanel.Instance.Toggle(); return true; }
        if (InventoryUI.Instance != null && InventoryUI.Instance.IsPanelOpen)
        { InventoryUI.Instance.Toggle(); return true; }
        return false;
    }

    // ── Data ──────────────────────────────────────────────

    private void LoadData()
    {
        TextAsset eventsAsset = Resources.Load<TextAsset>("Data/events");
        if (eventsAsset != null)
        {
            _eventDatabase = JsonUtility.FromJson<EventDatabase>(eventsAsset.text);
        }
        else
        {
            Debug.LogWarning("Missing Resources/Data/events.json");
            _eventDatabase = new EventDatabase { events = new StoryEvent[0] };
        }
    }

    // ── Interface Construction ────────────────────────────

    private void BuildInterface()
    {
        _runtimeRoot = new GameObject(RuntimeRootName);
        _runtimeRoot.hideFlags = HideFlags.DontSaveInEditor | HideFlags.DontSaveInBuild;
        _runtimeRoot.transform.SetParent(transform, false);

        // Single interface path for both editor and play mode
        BuildEditorInterface();
    }

    private void BuildEditorInterface()
    {
        // Camera
        Camera camera = new GameObject("Main Camera").AddComponent<Camera>();
        camera.transform.SetParent(_runtimeRoot.transform, false);
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color32(8, 10, 14, 255);
        camera.orthographic = true;

        // Canvas
        Canvas canvas = new GameObject("Prototype Canvas").AddComponent<Canvas>();
        canvas.transform.SetParent(_runtimeRoot.transform, false);
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 100;
        CanvasScaler scaler = canvas.gameObject.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        scaler.matchWidthOrHeight = 0.5f;
        canvas.gameObject.AddComponent<GraphicRaycaster>();
        GameObject eventSystem = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        eventSystem.transform.SetParent(_runtimeRoot.transform, false);

        Transform root = canvas.transform;

        BuildTopHud(root);
        BuildLocationArea(root);
        BuildFeedbackArea(root);
        BuildBottomHints(root);
    }

    private void BuildTopHud(Transform parent)
    {
        // HUD bar background
        _hudBgImage = MakeImage("HUD Background", parent, UIFactory.StretchTop(68, 0, 0), new Color32(10, 14, 18, 235));

        // Divider line
        Image divider = MakeImage("HUD Divider", parent, UIFactory.StretchTop(2, 0, 0, 68), new Color32(255, 255, 255, 30));

        // Day / Time
        _timeIconPlate = MakeImage("Time Icon Plate", parent, UIFactory.Anchored(16, 10, 44, 44), new Color32(194, 87, 52, 180));
        Text timeIcon = MakeText("Time Icon", parent, UIFactory.Anchored(16, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        timeIcon.text = "☀"; // sun
        timeIcon.alignment = TextAnchor.MiddleCenter;
        timeIcon.color = new Color32(245, 177, 90, 255);
        _timeText = MakeText("Time Text", parent, UIFactory.Anchored(68, 10, 220, 28), 20, TextAnchor.MiddleLeft);
        _timeText.text = "Day 1 / dawn";

        // Location
        _locIconPlate = MakeImage("Loc Icon Plate", parent, UIFactory.Anchored(290, 10, 44, 44), new Color32(55, 151, 164, 160));
        Text locIcon = MakeText("Loc Icon", parent, UIFactory.Anchored(290, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        locIcon.text = "⌂"; // house
        locIcon.color = new Color32(142, 223, 210, 255);
        _locationText = MakeText("Location Text", parent, UIFactory.Anchored(342, 10, 180, 28), 20, TextAnchor.MiddleLeft);
        _locationText.text = "De Pijp";

        // Bar status
        _barIconPlate = MakeImage("Bar Icon Plate", parent, UIFactory.Anchored(530, 10, 44, 44), new Color32(154, 111, 45, 160));
        Text barIcon = MakeText("Bar Icon", parent, UIFactory.Anchored(530, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        barIcon.text = "☕"; // coffee/beer
        barIcon.color = new Color32(233, 194, 119, 255);
        _barStatusText = MakeText("Bar Text", parent, UIFactory.Anchored(582, 6, 260, 24), 18, TextAnchor.MiddleLeft);
        _barStatusText.text = "Closed  |  Served 0  |  Rev $0";

        // F7: NPC affection bar — shows relationship level with current-location character
        _affectionBarText = MakeText("Affection Bar", parent, UIFactory.Anchored(582, 32, 260, 18), 14, TextAnchor.MiddleLeft);

        // Weather
        _weatherText = MakeText("Weather Text", parent, UIFactory.Anchored(835, 10, 80, 28), 16, TextAnchor.MiddleLeft);
        _weatherText.text = "";

        // Money
        _moneyIconPlate = MakeImage("Money Icon Plate", parent, UIFactory.Anchored(930, 10, 44, 44), new Color32(86, 125, 56, 160));
        Text moneyIcon = MakeText("Money Icon", parent, UIFactory.Anchored(930, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        moneyIcon.text = "$";
        moneyIcon.color = new Color32(160, 220, 120, 255);
        moneyIcon.fontStyle = FontStyle.Bold;
        _moneyText = MakeText("Money Text", parent, UIFactory.Anchored(982, 10, 280, 28), 22, TextAnchor.MiddleLeft);
        _moneyText.text = "$250 / $300";
        _moneyText.color = new Color32(160, 220, 120, 255);

        // Victory target indicator
        _goalTargetText = MakeText("Goal Target", parent, UIFactory.Anchored(982, 32, 280, 16), 12, TextAnchor.MiddleLeft);
        _goalTargetText.color = new Color32(160, 220, 120, 140);
        _goalTargetText.text = $"Goal: ${GameState.VictoryMoneyTarget} to win";

        // F1: Daily goal texts (below money on the right)
        _goalText1 = MakeText("Goal1", parent, UIFactory.Anchored(930, 42, 330, 16), 13, TextAnchor.MiddleLeft);
        _goalText1.color = new Color32(236, 180, 87, 200);
        _goalText2 = MakeText("Goal2", parent, UIFactory.Anchored(930, 54, 330, 16), 13, TextAnchor.MiddleLeft);
        _goalText2.color = new Color32(236, 180, 87, 200);

        // Low-money warning (hidden by default, shown when funds are critically low)
        _lowMoneyWarning = MakeText("Low Money Warning", parent, UIFactory.Anchored(982, 70, 280, 14), 11, TextAnchor.MiddleLeft);
        _lowMoneyWarning.text = "";
        _lowMoneyWarning.color = new Color32(255, 100, 80, 0);
    }

    private void BuildLocationArea(Transform parent)
    {
        // Central scene container (RuntimeVisuals fills this)
        _locationScene = new GameObject("LocationScene", typeof(RectTransform));
        _locationScene.transform.SetParent(parent, false);
        RectTransform srt = _locationScene.GetComponent<RectTransform>();
        srt.anchorMin = new Vector2(0, 0.15f);
        srt.anchorMax = new Vector2(0.58f, 0.82f);
        srt.offsetMin = new Vector2(20, 0);
        srt.offsetMax = new Vector2(0, -10);

        // Right info panel
        Image infoPanel = MakeImage("Info Panel", parent,
            new UIFactory.RectSpec(new Vector2(0.60f, 0.15f), new Vector2(0.98f, 0.82f),
                new Vector2(0, 0), new Vector2(0, -10)),
            new Color32(255, 255, 255, 18));

        _locationTitle = MakeText("Location Title", infoPanel.transform,
            new UIFactory.RectSpec(Vector2.zero, Vector2.one,
                new Vector2(20, -20), new Vector2(-20, -64)),
            34, TextAnchor.LowerLeft);
        _locationTitle.color = new Color32(246, 240, 229, 255);
        _locationTitle.fontStyle = FontStyle.Bold;

        _locationDesc = MakeText("Location Desc", infoPanel.transform,
            new UIFactory.RectSpec(Vector2.zero, Vector2.one,
                new Vector2(20, -80), new Vector2(-20, -20)),
            20, TextAnchor.UpperLeft);
        _locationDesc.color = new Color32(200, 196, 186, 255);

        // POI tags container (UI upgrade)
        _poiTagContainer = new GameObject("POI Tags", typeof(RectTransform));
        _poiTagContainer.transform.SetParent(infoPanel.transform, false);
        RectTransform poiRT = _poiTagContainer.GetComponent<RectTransform>();
        poiRT.anchorMin = Vector2.zero;
        poiRT.anchorMax = Vector2.one;
        poiRT.offsetMin = new Vector2(20, -200);
        poiRT.offsetMax = new Vector2(-20, -90);
    }

    private void BuildFeedbackArea(Transform parent)
    {
        // Feedback line between scene and hints
        Image fbBg = MakeImage("Feedback BG", parent, UIFactory.StretchBottom(46, 0, 0, 58), new Color32(255, 255, 255, 12));
        _feedbackText = MakeText("Feedback Text", parent, UIFactory.StretchBottom(46, 16, 16, 58), 18, TextAnchor.MiddleLeft);
        _feedbackText.color = new Color32(220, 210, 190, 255);
        _feedbackText.fontStyle = FontStyle.Italic;
        _feedbackText.text = "Your story begins in De Pijp. Explore, work, and find your place.";

        // F6: Flash overlay for time transitions (editor mode)
        Image flashImg = MakeImage("Flash Overlay", parent, UIFactory.StretchFull(), new Color32(255, 255, 255, 0));
        _flashOverlay = flashImg.gameObject.AddComponent<CanvasGroup>();
        _flashOverlay.alpha = 0f;
        _flashOverlay.blocksRaycasts = false;

        // T7: Add CanvasGroup to feedback text for fade animations
        _feedbackGroup = _feedbackText.gameObject.GetComponent<CanvasGroup>();
        if (_feedbackGroup == null) _feedbackGroup = _feedbackText.gameObject.AddComponent<CanvasGroup>();
        _feedbackGroup.alpha = 1f;
    }

    private void BuildBottomHints(Transform parent)
    {
        _hintBackplate = MakeImage("Hint Backplate", parent, UIFactory.StretchBottom(58, 0, 0), new Color32(10, 14, 18, 230));

        // Divider
        MakeImage("Hint Divider", parent, UIFactory.StretchBottom(2, 0, 0, 58), new Color32(255, 255, 255, 24));

        _hintText = MakeText("Input Hint", parent, UIFactory.StretchBottom(58, 8, 8), 16, TextAnchor.MiddleCenter);
        _hintText.color = new Color32(180, 175, 165, 255);
        _hintText.text = "Space: advance time / dialogue next    1 De Pijp    2 Science Park    3 Tweede Kans    4 Bloemenmarkt    B start shift    F end shift    I inventory    C character    P achievements";
    }

    // ── Game Actions ──────────────────────────────────────

    public void AdvanceTimePublic() { AdvanceTime(); }

    private void AdvanceTime()
    {
        if (State.GameEnded) return;

        State.TimeIndex++;
        if (State.TimeIndex >= _timesOfDay.Length)
        {
            State.TimeIndex = 0;
            State.CurrentDay++;

            // Check victory condition at dawn of each new day:
            // player wins immediately if they've reached the money target,
            // even if max days haven't elapsed yet.
            if (State.Money >= GameState.VictoryMoneyTarget)
            {
                EndGame();
                return;
            }

            // Check bankruptcy at dawn: running out of money means game over
            if (State.Money < 0)
            {
                State.GameWentBankrupt = true;
                EndGame();
                return;
            }

            // Check game end conditions at dawn of each new day
            if (State.CurrentDay > GameState.MaxDays)
            {
                EndGame();
                return;
            }

            // F1: Regenerate daily goals at dawn
            GenerateDailyGoals();
            // F8: Update weather for new day
            if (WeatherSystem.Instance != null)
                WeatherSystem.Instance.NewDay(State.CurrentDay);
            // Beer Competition: check if today is competition day
            if (BeerCompetitionSystem.Instance != null)
                BeerCompetitionSystem.Instance.CheckCompetitionDay(State.CurrentDay);
        }

        // [Brewing] Tick brew progress
        if (BrewingSystem.Instance != null)
            BrewingSystem.Instance.OnTimeAdvanced();

        // F5: Time advance sound
        SoundManager.Play(SoundManager.SoundType.TimeAdvance);
        AudioManager.Instance.PlayDaytimeChime();

        // F6: Flash transition
        if (_flashOverlay != null)
        {
            StartCoroutine(FlashTransition());
        }
        // Screen shake for time advance
        StartCoroutine(GameJuice.ScreenShake(1.0f, 0.15f));

        SetFeedback("Time moves. The city keeps its own schedule.");
        RefreshHud();
        CheckStoryEvents();

        // Notify tutorial
        if (Application.isPlaying && TutorialSystem.Instance != null)
            TutorialSystem.Instance.OnTimeAdvanced();
        // [SaveSystem] Auto-save
        if (Application.isPlaying && SaveSystem.Instance != null)
            SaveSystem.Instance.AutoSave();
    }

    private void SwitchLocation(string locationId)
    {
        if (State.CurrentLocationId == locationId)
        {
            if (_locations.TryGetValue(locationId, out LocationView loc))
                SetFeedback($"Already at {loc.title}.");
            else
                SetFeedback($"Already at {locationId}.");
            return;
        }

        State.CurrentLocationId = locationId;
        State.RegisterLocationVisited(locationId);
        // F1: Mark goals for this location as completed
        MarkLocationGoalsCompleted(locationId);
        RenderLocation();
        RefreshHud();
        CheckStoryEvents();
        // F5: Location switch sound
        SoundManager.Play(SoundManager.SoundType.UIClick);
        // UI upgrade: animate HUD to location theme
        AnimateHudToTheme();
        // Background music + juice effects
        AudioManager.Instance.PlayMusic(locationId);
        AudioManager.Instance.PlayDoorBell();
        GameJuice.SpawnFloatingText("\U0001f4cd " + _locations[locationId].title, new Vector2(300, 400), Color.white);
        // Notify achievement system (for explorer achievement)
        if (Application.isPlaying && AchievementSystem.Instance != null)
        {
            AchievementSystem.Instance.RegisterLocationVisited(locationId);
        }
        TutorialSystem.Instance?.OnLocationChanged();
        // Screen shake for location switch
        StartCoroutine(GameJuice.ScreenShake(0.3f, 0.1f));
    }

    /// <summary>
    /// End the game and show the final settlement screen.
    /// Victory if money >= target; otherwise a valiant effort message.
    /// </summary>
    private void EndGame()
    {
        State.GameEnded = true;
        bool won = State.Money >= GameState.VictoryMoneyTarget;
        State.GameWon = won;

        // Auto-save on game end
        if (SaveSystem.Instance != null)
            SaveSystem.Instance.AutoSave();

        // Build and show the end screen
        BuildEndGameScreen(won);
    }

    /// <summary>
    /// Start a completely new game. Resets all state, destroys end screen,
    /// rebuilds the HUD, and resets all subsystems.
    /// </summary>
    public void StartNewGame()
    {
        // Destroy end game canvas if present
        DestroyEndGameCanvas();

        // Reset core state
        State.ResetState();

        // Reset UI-only state (not in GameState)
        State.DailyGoals.Clear();

        // Reset subsystems
        if (AchievementSystem.Instance != null)
            AchievementSystem.Instance.ResetAllAchievements();
        if (BarUpgradeSystem.Instance != null)
            BarUpgradeSystem.Instance.ResetAllUpgrades();
        if (ShopSystem.Instance != null)
            ShopSystem.Instance.ResetOwned();
        if (InventorySystem.Instance != null)
            InventorySystem.Instance.ResetInventory();
        if (TutorialSystem.Instance != null)
            TutorialSystem.Instance.ResetTutorial();
        if (WeatherSystem.Instance != null)
            WeatherSystem.Instance.NewDay(1);

        // Close any open shift (silent — no settlement screen on new game)
        if (BarMinigame.Instance != null && BarMinigame.Instance.IsShiftActive)
            BarMinigame.Instance.EndShift(showSettlement: false);

        // Close any open subsystem panels
        if (BrewingSystem.Instance != null)
            BrewingSystem.Instance.ClosePanel();
        if (SaveSystem.Instance != null && SaveSystem.Instance.IsPanelOpen)
            SaveSystem.Instance.ClosePanelPublic();
        if (BarUpgradeSystem.Instance != null && BarUpgradeSystem.Instance.IsPanelOpen)
            BarUpgradeSystem.Instance.ClosePanel();

        // Rebuild the HUD and location
        LoadData();
        CleanupGeneratedView();
        BuildInterface();
        RenderLocation();
        RefreshHud();

        SetFeedback("New game started. Your story begins in De Pijp.");

        // Auto-save the fresh state
        if (SaveSystem.Instance != null)
            SaveSystem.Instance.AutoSave();
    }

    /// <summary>
    /// Destroy the end game canvas if it exists (for new game / load).
    /// </summary>
    public void DestroyEndGameCanvas()
    {
        if (_runtimeRoot == null) return;
        Transform endCanvas = _runtimeRoot.transform.Find("EndGameCanvas");
        if (endCanvas != null)
            UIFactory.DestroyGenerated(endCanvas.gameObject);
    }

    private void BuildEndGameScreen(bool won)
    {
        // Create a top-level canvas for the end screen
        GameObject endCanvasGO = new GameObject("EndGameCanvas");
        endCanvasGO.transform.SetParent(_runtimeRoot.transform, false);
        Canvas endCanvas = endCanvasGO.AddComponent<Canvas>();
        endCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        endCanvas.sortingOrder = 500;
        CanvasScaler scaler = endCanvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        endCanvasGO.AddComponent<GraphicRaycaster>();

        Transform root = endCanvas.transform;

        // Full overlay
        Image overlay = MakeImage("EndOverlay", root,
            UIFactory.StretchFull(), new Color32(8, 10, 14, 235));

        // Determine end state
        bool bankrupt = State.GameWentBankrupt;

        // Title
        Text titleText = MakeText("EndTitle", root,
            new UIFactory.RectSpec(new Vector2(0.1f, 0.6f), new Vector2(0.9f, 0.9f),
                new Vector2(0, 0), new Vector2(0, 0)),
            48, TextAnchor.MiddleCenter);
        if (won)
        {
            titleText.text = "🍺 Brewery Established!";
            titleText.color = new Color32(236, 180, 87, 255);
        }
        else if (bankrupt)
        {
            titleText.text = "💸 Bankrupt!";
            titleText.color = new Color32(220, 80, 60, 255);
        }
        else
        {
            titleText.text = "📋 Time's Up!";
            titleText.color = new Color32(200, 180, 160, 255);
        }
        titleText.fontStyle = FontStyle.Bold;

        // Subtitle
        Text subText = MakeText("EndSub", root,
            new UIFactory.RectSpec(new Vector2(0.1f, 0.48f), new Vector2(0.9f, 0.60f),
                new Vector2(0, 0), new Vector2(0, 0)),
            22, TextAnchor.MiddleCenter);
        if (won)
        {
            subText.text = $"You saved ${State.Money} in {State.CurrentDay} days —\n" +
                          "enough to keep the brewery alive and thriving.\n" +
                          "The doors of Tweede Kans stay open. For now.";
        }
        else if (bankrupt)
        {
            subText.text = $"The brewery ran out of money on day {State.CurrentDay}.\n" +
                          "Debts piled up and the doors closed for good.\n" +
                          "Every brewer faces hard times — learn and try again.";
        }
        else
        {
            subText.text = $"${State.Money} saved after {State.CurrentDay} days.\n" +
                          $"The rent comes due and the brewery closes its doors.\n" +
                          "But every brewer has to start somewhere.";
        }
        subText.color = new Color32(200, 196, 186, 255);

        // Stats block
        int upgradeCount = 0;
        if (BarUpgradeSystem.Instance != null)
            upgradeCount = BarUpgradeSystem.Instance.PurchasedUpgradeCount;
        string statsStr = $"Days Passed: {State.CurrentDay}\n" +
                         $"Final Money: ${State.Money}\n" +
                         $"Total Revenue: ${State.TotalRevenue}\n" +
                         $"Customers Served: {State.TotalCustomersServed}\n" +
                         $"Upgrades Purchased: {upgradeCount}\n" +
                         $"Events Experienced: {State.TriggeredEventCount}\n" +
                         $"Locations Visited: {State.VisitedLocationCount}";

        Text statsText = MakeText("EndStats", root,
            new UIFactory.RectSpec(new Vector2(0.2f, 0.22f), new Vector2(0.8f, 0.46f),
                new Vector2(0, 0), new Vector2(0, 0)),
            18, TextAnchor.MiddleCenter);
        statsText.text = statsStr;
        statsText.color = new Color32(180, 175, 165, 255);
        statsText.lineSpacing = 1.5f;

        // Achievement summary
        int unlockedCount = 0;
        int totalAch = 6;
        if (AchievementSystem.Instance != null)
        {
            unlockedCount = AchievementSystem.Instance.GetUnlockedAchievementIds().Count;
            totalAch = AchievementSystem.Instance.TotalAchievementCount;
        }
        Text achText = MakeText("EndAch", root,
            new UIFactory.RectSpec(new Vector2(0.2f, 0.12f), new Vector2(0.8f, 0.20f),
                new Vector2(0, 0), new Vector2(0, 0)),
            16, TextAnchor.MiddleCenter);
        achText.text = $"Achievements Unlocked: {unlockedCount} / {totalAch}";
        achText.color = new Color32(236, 180, 87, 180);

        // "New Game" button
        GameObject newGameBtnGO = new GameObject("NewGameBtn", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        newGameBtnGO.transform.SetParent(root, false);
        RectTransform btnRT = newGameBtnGO.GetComponent<RectTransform>();
        btnRT.anchorMin = new Vector2(0.35f, 0.06f);
        btnRT.anchorMax = new Vector2(0.65f, 0.14f);
        btnRT.offsetMin = Vector2.zero;
        btnRT.offsetMax = Vector2.zero;
        Image btnImg = newGameBtnGO.GetComponent<Image>();
        btnImg.color = new Color32(236, 180, 87, 255);
        Button newGameBtn = newGameBtnGO.AddComponent<Button>();
        newGameBtn.onClick.AddListener(StartNewGame);

        Text btnText = MakeText("NewGameBtnText", newGameBtnGO.transform,
            new UIFactory.RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            18, TextAnchor.MiddleCenter);
        btnText.text = "🔄 New Game";
        btnText.color = new Color32(20, 22, 26, 255);
        btnText.fontStyle = FontStyle.Bold;

        // Instructions
        Text thanksText = MakeText("EndThanks", root,
            new UIFactory.RectSpec(new Vector2(0.2f, 0.005f), new Vector2(0.8f, 0.055f),
                new Vector2(0, 0), new Vector2(0, 0)),
            13, TextAnchor.MiddleCenter);
        thanksText.text = "Press N for new game  |  Press L to load a save";
        thanksText.color = new Color32(140, 135, 125, 200);

        // Play ending sound
        SoundManager.Play(won ? SoundManager.SoundType.Success : SoundManager.SoundType.Error);
    }

    /// <summary>
    /// Public method for other systems (DialogueManager, BarMinigame) to add/remove money.
    /// </summary>
    public void AddMoney(int amount)
    {
        State.AddMoney(amount);
        RefreshHud();
        if (amount > 0)
        {
            SetFeedback($"+${amount} earned.");
            SoundManager.Play(SoundManager.SoundType.MoneyEarn);
            StartCoroutine(MoneyFlashAnimation());
            GameJuice.SpawnFloatingText($"+${amount}", new Vector2(950, 80), new Color32(80, 220, 80, 255));
            GameJuice.SpawnParticles(new Vector2(950, 80), new Color32(80, 220, 80, 255), 8);
        }
        else
        {
            SetFeedback($"-${-amount} spent.");
            SoundManager.Play(SoundManager.SoundType.Error);
        }
    }

    // ── Story Events ──────────────────────────────────────

    private void CheckStoryEvents()
    {
        if (_eventDatabase == null || _eventDatabase.events == null)
        {
            return;
        }

        // Collect all matching events for current day/time/location
        var matches = new System.Collections.Generic.List<StoryEvent>();
        foreach (StoryEvent storyEvent in _eventDatabase.events)
        {
            if (storyEvent.day != State.CurrentDay) continue;
            if (storyEvent.time != CurrentTime() || storyEvent.location != State.CurrentLocationId) continue;
            if (string.IsNullOrEmpty(storyEvent.dialogue_id) || State.HasTriggeredDialogue(storyEvent.dialogue_id)) continue;
            matches.Add(storyEvent);
        }

        if (matches.Count == 0) return;

        StoryEvent selected;

        // If any matches are endings, filter to only endings and pick based on game state
        if (matches.Count > 1 && matches.Exists(e => e.id.StartsWith("ending_")))
        {
            var endings = matches.FindAll(e => e.id.StartsWith("ending_"));
            if (endings.Count > 0)
                selected = PickEnding(endings);
            else
                selected = matches[0];
        }
        else
        {
            selected = matches[0];
        }

        State.MarkDialogueTriggered(selected.dialogue_id);
        // F5: Story event trigger sound
        SoundManager.Play(SoundManager.SoundType.EventTrigger);
        // Delegate to DialogueManager
        DialogueManager.Instance.ShowDialogueById(selected.dialogue_id);
    }

    /// <summary>
    /// Pick the appropriate ending event based on game state.
    /// Good: money >= victory target AND average affection >= 60
    /// Bad: money < $100 OR average affection < 20
    /// Normal: everything else
    /// </summary>
    private StoryEvent PickEnding(System.Collections.Generic.List<StoryEvent> endings)
    {
        int money = State.Money;

        // Calculate average NPC affection
        float totalAffection = 0f;
        int npcCount = 0;
        string[] npcIds = { "erik", "sofie", "pablo", "chen", "ravi", "maaike", "de_wit" };
        foreach (string id in npcIds)
        {
            if (InventorySystem.Instance != null)
            {
                totalAffection += InventorySystem.Instance.GetAffection(id);
                npcCount++;
            }
        }
        float avgAffection = npcCount > 0 ? totalAffection / npcCount : 0f;

        // Good ending: both money and social success
        if (money >= GameState.VictoryMoneyTarget && avgAffection >= 60f)
        {
            var good = endings.Find(e => e.id == "ending_good");
            if (good == null) Debug.LogWarning("[PickEnding] ending_good not found, falling back to endings[0]");
            return good ?? endings[0];
        }
        // Bad ending: broke or socially isolated
        if (money < 100 || avgAffection < 20f)
        {
            var bad = endings.Find(e => e.id == "ending_bad");
            if (bad == null) Debug.LogWarning("[PickEnding] ending_bad not found, falling back to endings[0]");
            return bad ?? endings[0];
        }
        // Normal ending
        {
            var normal = endings.Find(e => e.id == "ending_normal");
            if (normal == null) Debug.LogWarning("[PickEnding] ending_normal not found, falling back to endings[0]");
            return normal ?? endings[0];
        }
    }

    // ── F1: Daily Goals ──────────────────────────────────

    private void GenerateDailyGoals()
    {
        State.DailyGoals.Clear();
        if (_eventDatabase == null || _eventDatabase.events == null) return;

        // Find events for current day
        foreach (StoryEvent ev in _eventDatabase.events)
        {
            if (ev.day != State.CurrentDay) continue;
            // Create a goal description from the event
            string desc = GenerateGoalDescription(ev);
            State.DailyGoals.Add(new DailyGoal
            {
                eventId = ev.id,
                description = desc,
                location = ev.location,
                completed = false,
                day = State.CurrentDay
            });
        }

        // If no events today, add a default goal: visit a location
        if (State.DailyGoals.Count == 0)
        {
            State.DailyGoals.Add(new DailyGoal
            {
                eventId = "default_explore",
                description = "Explore Amsterdam",
                location = "",
                completed = false,
                day = State.CurrentDay
            });
        }
    }

    private string GenerateGoalDescription(StoryEvent ev)
    {
        if (!string.IsNullOrEmpty(ev.dialogue_id))
        {
            // Dialogue events: talk to someone
            string speaker = ev.dialogue_id.Contains("pablo") ? "Pablo" :
                             ev.dialogue_id.Contains("erik") ? "Erik" :
                             ev.dialogue_id.Contains("sofie") ? "Sofie" :
                             ev.dialogue_id.Contains("chen") ? "Chen" :
                             ev.dialogue_id.Contains("ravi") ? "Ravi" :
                             ev.dialogue_id.Contains("de_wit") ? "De Wit" :
                             ev.dialogue_id.Contains("maaike") ? "Maaike" : "Someone";
            return $"Talk to {speaker}";
        }
        if (!string.IsNullOrEmpty(ev.summary))
        {
            if (ev.summary.Length > 40) return ev.summary.Substring(0, 40) + "...";
            return ev.summary;
        }
        return "Visit " + (ev.location ?? "a location");
    }

    private void MarkLocationGoalsCompleted(string locationId)
    {
        bool allCompleted = true;
        foreach (DailyGoal goal in State.DailyGoals)
        {
            if (goal.completed) continue;
            if (goal.location == locationId || string.IsNullOrEmpty(goal.location))
            {
                goal.completed = true;
            }
            if (!goal.completed) allCompleted = false;
        }

        // F1: All goals completed notification
        if (allCompleted && State.DailyGoals.Count > 0)
        {
            ShowResultFeedback("All goals complete! Well done.");
        }
    }

    // ── F2: Result Feedback ──────────────────────────────

    /// <summary>
    /// Show a floating result message (e.g., "+1 Erik affection", "+$6")
    /// Auto-clears after 2 seconds. Called by DialogueManager on choice outcomes.
    /// </summary>
    public void ShowResultFeedback(string message)
    {
        if (_feedbackText == null) return;
        _showingResultFeedback = true;
        _feedbackTimer = 2f;
        _feedbackText.text = message;
        _feedbackText.color = new Color32(255, 220, 100, 255);
        _feedbackText.fontStyle = FontStyle.Bold;
        _feedbackText.fontSize = 16;
        // F5: Result feedback sound
        SoundManager.Play(SoundManager.SoundType.Collect);
    }

    // ── F7: Affection Bar Update ─────────────────────────

    private void UpdateAffectionBar()
    {
        if (_affectionBarText == null) return;

        string currentLocation = State.CurrentLocationId;
        // Map location to NPC character
        string npcId = null;
        string npcName = null;
        switch (currentLocation)
        {
            case "de_pijp":
                npcId = "sofie";
                npcName = "Sofie";
                break;
            case "science_park":
                npcId = "chen";
                npcName = "Chen";
                break;
            case "tweede_kans":
                npcId = "erik";
                npcName = "Erik";
                break;
            case "bloemenmarkt":
                npcId = "sofie";
                npcName = "Sofie";
                break;
        }

        if (npcId == null)
        {
            _affectionBarText.text = "";
            return;
        }

        int affection = InventorySystem.Instance != null ? InventorySystem.Instance.GetAffection(npcId) : 0;
        int filled = Mathf.Clamp(affection, 0, 10);
        int empty = 10 - filled;
        string bar = new string('█', filled) + new string('░', empty);
        _affectionBarText.text = $"{npcName}: {bar}";
    }

    // ── Visual Rendering ──────────────────────────────────

    /// <summary>
    /// Called by SceneTransitionManager when the player moves to a new location.
    /// Updates the HUD and location info.
    /// </summary>
    public void OnSceneChanged(string locationId)
    {
        if (!_locations.ContainsKey(locationId))
            return;

        State.CurrentLocationId = locationId;
        LocationView loc = _locations[State.CurrentLocationId];
        if (_locationTitle != null) _locationTitle.text = loc.title;
        if (_locationDesc != null) _locationDesc.text = loc.subtitle;
        if (_feedbackText != null) _feedbackText.text = "";
        RefreshHud();
    }

    private void RenderLocation()
    {
        LocationView loc = _locations[State.CurrentLocationId];

        // Destroy old scene
        if (_locationScene != null)
        {
            DestroyChildren(_locationScene.transform);
        }

        // Build new location scene via RuntimeVisuals
        RuntimeVisuals.BuildLocationScene(State.CurrentLocationId, _locationScene.transform, loc);

        // Add SceneAnimator for animated scene elements
        SceneAnimator existingAnim = _locationScene.GetComponent<SceneAnimator>();
        if (existingAnim != null)
        {
            if (Application.isPlaying)
                Object.Destroy(existingAnim);
            else
                DestroyImmediate(existingAnim);
        }
        SceneAnimator anim = _locationScene.AddComponent<SceneAnimator>();
        anim.FindElements(_locationScene.transform);

        _locationTitle.text = loc.title;
        _locationDesc.text = loc.subtitle;
        _feedbackText.text = "";
        BuildPoiTags();
        UpdateHintText();
    }

    // ── UI upgrade: POI tags ─────────────────────────────

    private void BuildPoiTags()
    {
        if (_poiTagContainer == null) return;

        // Clear existing tags
        DestroyChildren(_poiTagContainer.transform);

        string[] pois;
        if (!LocationPois.TryGetValue(State.CurrentLocationId, out pois) || pois == null)
            return;

        LocationView loc = _locations[State.CurrentLocationId];
        float yOffset = 0f;
        foreach (string poi in pois)
        {
            GameObject tagGo = new GameObject("POI_" + poi, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            tagGo.transform.SetParent(_poiTagContainer.transform, false);
            RectTransform tr = tagGo.GetComponent<RectTransform>();
            tr.anchorMin = new Vector2(0, 1);
            tr.anchorMax = new Vector2(0, 1);
            tr.sizeDelta = new Vector2(Mathf.Min(poi.Length * 10 + 20, 200), 22);
            tr.anchoredPosition = new Vector2(0, -yOffset);
            tr.pivot = new Vector2(0, 1);
            Image img = tagGo.GetComponent<Image>();
            img.color = new Color32((byte)loc.accent.r, (byte)loc.accent.g, (byte)loc.accent.b, 60);

            // Tag text
            GameObject textGo = new GameObject("Text", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
            textGo.transform.SetParent(tagGo.transform, false);
            RectTransform textRt = textGo.GetComponent<RectTransform>();
            textRt.anchorMin = Vector2.zero;
            textRt.anchorMax = Vector2.one;
            textRt.offsetMin = new Vector2(6, 2);
            textRt.offsetMax = new Vector2(-6, -2);
            Text tagText = textGo.GetComponent<Text>();
            tagText.font = _font;
            tagText.text = "▸ " + poi;
            tagText.fontSize = 11;
            tagText.color = new Color32(220, 215, 200, 200);
            tagText.alignment = TextAnchor.MiddleLeft;
            tagText.horizontalOverflow = HorizontalWrapMode.Overflow;

            yOffset += 26f;
        }
    }

    // ── UI upgrade: HUD theme transition ─────────────────

    public void AnimateHudToTheme()
    {
        if (!Application.isPlaying) return;
        if (_hudBgImage == null || _timeIconPlate == null) return;
        StartCoroutine(AnimateHudToThemeRoutine());
    }

    private IEnumerator AnimateHudToThemeRoutine()
    {
        LocationView loc = _locations[State.CurrentLocationId];
        Color targetBg = new Color32(
            (byte)(loc.background.r * 0.6f),
            (byte)(loc.background.g * 0.6f),
            (byte)(loc.background.b * 0.6f),
            235);
        Color targetAccent = loc.accent;

        Color startBg = _hudBgImage.color;
        Color startAccent = _timeIconPlate.color;
        float duration = 0.5f;

        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = t / duration;
            float smooth = p * p * (3f - 2f * p); // smoothstep

            _hudBgImage.color = Color.Lerp(startBg, targetBg, smooth);
            Color accentLerp = Color.Lerp(startAccent, targetAccent, smooth);
            if (_timeIconPlate != null) _timeIconPlate.color = accentLerp;
            if (_locIconPlate != null) _locIconPlate.color = new Color32(
                (byte)(targetAccent.r * 0.5f), (byte)(targetAccent.g * 0.5f),
                (byte)(targetAccent.b * 0.5f), 160);
            if (_barIconPlate != null) _barIconPlate.color = new Color32(
                (byte)(targetAccent.r * 0.7f), (byte)(targetAccent.g * 0.7f),
                (byte)(targetAccent.b * 0.7f), 160);
            if (_moneyIconPlate != null) _moneyIconPlate.color = new Color32(
                (byte)(targetAccent.r * 0.4f), (byte)(targetAccent.g * 0.4f),
                (byte)(targetAccent.b * 0.4f), 160);
            yield return null;
        }

        _hudBgImage.color = targetBg;
    }

    // ── UI upgrade: Flash transition ─────────────────────

    private IEnumerator FlashTransition()
    {
        if (_flashOverlay == null) yield break;
        float half = 0.075f;
        _flashOverlay.alpha = 0f;
        for (float t = 0; t < half; t += Time.deltaTime)
        {
            float p = t / half;
            _flashOverlay.alpha = p * p;
            yield return null;
        }
        _flashOverlay.alpha = 1f;
        for (float t = 0; t < half; t += Time.deltaTime)
        {
            float p = t / half;
            _flashOverlay.alpha = 1f - p * p;
            yield return null;
        }
        _flashOverlay.alpha = 0f;
    }

    // ── UI upgrade: Money flash animation ────────────────

    private IEnumerator MoneyFlashAnimation()
    {
        if (_moneyText == null) yield break;
        Color origColor = _moneyText.color;
        _moneyText.color = new Color32(255, 220, 80, 255);
        _moneyText.fontStyle = FontStyle.Bold;
        yield return new WaitForSeconds(0.15f);
        _moneyText.color = origColor;
    }

    private void RefreshHud()
    {
        if (_timeText != null)
            _timeText.text = $"Day {State.CurrentDay} / {CurrentTimeLabel}";
        if (_locationText != null)
            _locationText.text = _locations.TryGetValue(State.CurrentLocationId, out LocationView loc) ? loc.title : State.CurrentLocationId;
        // Bar status: read from BarMinigame if available
        bool barActive = BarMinigame.Instance != null && BarMinigame.Instance.IsShiftActive;
        int barServed = barActive ? BarMinigame.Instance.CustomersServed : 0;
        int barEarnings = barActive ? BarMinigame.Instance.ShiftEarnings : 0;

        // Brew status
        string brewStatus = "";
        if (State.IsBrewing)
            brewStatus = $"  |  ⏳ Brewing ({State.ActiveBrewTurnsRemaining}t)";

        if (_barStatusText != null)
            _barStatusText.text = $"{(barActive ? "Open" : "Closed")}  |  Served {barServed}  |  Rev ${barEarnings}{brewStatus}";
        if (_moneyText != null)
        {
            _moneyText.text = $"${State.Money} / ${GameState.VictoryMoneyTarget}";

            // Low-money warning: change money color when funds are critically low
            const int LOW_MONEY_CRITICAL = 20;
            const int LOW_MONEY_WARNING = 50;
            if (State.Money < LOW_MONEY_CRITICAL)
            {
                _moneyText.color = new Color32(255, 100, 80, 255);
                if (_moneyIconPlate != null)
                    _moneyIconPlate.color = new Color32(180, 60, 40, 200);
                if (_lowMoneyWarning != null)
                {
                    _lowMoneyWarning.text = "⚠ Low Funds! Brew more to stay afloat.";
                    _lowMoneyWarning.color = new Color32(255, 100, 80, 200);
                }
            }
            else if (State.Money < LOW_MONEY_WARNING)
            {
                _moneyText.color = new Color32(255, 200, 80, 255);
                if (_moneyIconPlate != null)
                    _moneyIconPlate.color = new Color32(180, 140, 40, 180);
                if (_lowMoneyWarning != null)
                {
                    _lowMoneyWarning.text = "⚠ Watch your spending.";
                    _lowMoneyWarning.color = new Color32(255, 200, 80, 200);
                }
            }
            else
            {
                _moneyText.color = new Color32(160, 220, 120, 255);
                if (_moneyIconPlate != null)
                    _moneyIconPlate.color = new Color32(86, 125, 56, 160);
                if (_lowMoneyWarning != null)
                {
                    _lowMoneyWarning.text = "";
                    _lowMoneyWarning.color = new Color32(255, 100, 80, 0);
                }
            }
        }

        // Victory target hint — green and bold when achieved
        if (_goalTargetText != null)
        {
            bool achieved = State.Money >= GameState.VictoryMoneyTarget;
            _goalTargetText.text = achieved ? "✓ Goal reached!" : $"Goal: ${GameState.VictoryMoneyTarget} to win";
            _goalTargetText.color = achieved
                ? new Color32(160, 220, 120, 220)
                : new Color32(160, 220, 120, 140);
        }

        // Weather
        if (_weatherText != null)
        {
            _weatherText.text = WeatherSystem.Instance != null ? WeatherSystem.Instance.WeatherName : "Clear";
        }

        // F1: Update daily goal display
        UpdateGoalDisplay();

        // F7: Update affection bar
        UpdateAffectionBar();
    }

    private void UpdateGoalDisplay()
    {
        if (_goalText1 == null || _goalText2 == null) return;

        // Regenerate goals if on a new day and none exist
        if (State.DailyGoals.Count == 0)
        {
            GenerateDailyGoals();
        }

        if (State.DailyGoals.Count >= 1)
        {
            DailyGoal g1 = State.DailyGoals[0];
            string prefix1 = g1.completed ? "✓ " : "○ ";
            _goalText1.text = prefix1 + g1.description;
            _goalText1.color = g1.completed
                ? new Color32(120, 120, 120, 200)
                : new Color32(236, 180, 87, 255);
        }
        else
        {
            _goalText1.text = "";
        }

        if (State.DailyGoals.Count >= 2)
        {
            DailyGoal g2 = State.DailyGoals[1];
            string prefix2 = g2.completed ? "✓ " : "○ ";
            _goalText2.text = prefix2 + g2.description;
            _goalText2.color = g2.completed
                ? new Color32(120, 120, 120, 200)
                : new Color32(236, 180, 87, 255);
        }
        else if (_goalText2 != null)
        {
            _goalText2.text = "";
        }
    }

    private string CurrentTime() => _timesOfDay[State.TimeIndex];

    // T7: Feedback fade — smoothly show and auto-hide feedback text
    private void SetFeedback(string message)
    {
        if (_feedbackText == null) return;
        _feedbackText.text = message;
        if (_feedbackCoroutine != null)
        {
            StopCoroutine(_feedbackCoroutine);
        }
        _feedbackCoroutine = StartCoroutine(FeedbackFade());
    }

    // T7: Fade feedback in, hold, then fade out
    private IEnumerator FeedbackFade()
    {
        if (_feedbackGroup == null)
        {
            _feedbackGroup = _feedbackText.gameObject.GetComponent<CanvasGroup>();
            if (_feedbackGroup == null) _feedbackGroup = _feedbackText.gameObject.AddComponent<CanvasGroup>();
        }

        // Fade in (0.15s)
        _feedbackGroup.alpha = 0f;
        for (float t = 0; t < 0.15f; t += Time.deltaTime)
        {
            _feedbackGroup.alpha = t / 0.15f;
            yield return null;
        }
        _feedbackGroup.alpha = 1f;

        // Hold (2s)
        yield return new WaitForSeconds(2f);

        // Fade out (0.4s)
        for (float t = 0; t < 0.4f; t += Time.deltaTime)
        {
            _feedbackGroup.alpha = 1f - (t / 0.4f);
            yield return null;
        }
        _feedbackGroup.alpha = 0f;
        _feedbackCoroutine = null;
    }

    private void UpdateHintText()
    {
        _hintText.text = "Space: advance / dialogue    1-4 locations    R brew    B shift    F end    I inventory    C character    P achievements    M shop    U upgrades    H log    L save    O quickload";
    }

    // ── UI Factory Helpers ────────────────────────────────

    private Image MakeImage(string name, Transform parent, UIFactory.RectSpec rect, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        UIFactory.ApplyRect(go.GetComponent<RectTransform>(), rect);
        Image img = go.GetComponent<Image>();
        img.color = color;
        return img;
    }

    private Text MakeText(string name, Transform parent, UIFactory.RectSpec rect, int fontSize, TextAnchor alignment)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        UIFactory.ApplyRect(go.GetComponent<RectTransform>(), rect);
        Text text = go.GetComponent<Text>();
        text.font = _font;
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    private void CleanupGeneratedView()
    {
        Transform existingRoot = transform.Find(RuntimeRootName);
        if (existingRoot != null)
        {
            UIFactory.DestroyGenerated(existingRoot.gameObject);
        }

        _runtimeRoot = null;
        _locationScene = null;
        _timeText = null;
        _locationText = null;
        _barStatusText = null;
        _moneyText = null;
        _feedbackText = null;
        _hintText = null;
        _hintBackplate = null;
        _locationTitle = null;
        _locationDesc = null;
        _goalText1 = null;
        _goalText2 = null;
        _affectionBarText = null;
        _lowMoneyWarning = null;
        _flashOverlay = null;
        _feedbackGroup = null;
        _hudBgImage = null;
        _timeIconPlate = null;
        _locIconPlate = null;
        _barIconPlate = null;
        _moneyIconPlate = null;
        _poiTagContainer = null;
        _weatherText = null;
    }

    private static void DestroyChildren(Transform parent)
    {
        for (int index = parent.childCount - 1; index >= 0; index--)
        {
            UIFactory.DestroyGenerated(parent.GetChild(index).gameObject);
        }
    }


    // ── Types ─────────────────────────────────────────────

    // LocationView moved to GameDataModels.cs (T6)
}
