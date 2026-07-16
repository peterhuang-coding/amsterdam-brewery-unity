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

    // ── Daily Goals (F1) ──────────────────────────────
    private readonly List<DailyGoal> _dailyGoals = new List<DailyGoal>();

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

    private void BootstrapView()
    {
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        LoadData();
        CleanupGeneratedView();
        BuildInterface();
        RenderLocation();
        // F1: Generate initial daily goals
        if (Application.isPlaying && _dailyGoals.Count == 0)
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
        // Don't process gameplay keys while tutorial welcome is up
        if (TutorialSystem.Instance != null && TutorialSystem.Instance.WelcomeIsActive_BlockingInput)
            return;

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
            return;
        }
        if (Input.GetKeyDown(KeyCode.O))
        {
            if (SaveSystem.Instance != null) SaveSystem.Instance.QuickLoad();
            return;
        }
        // [BarUpgrade] Upgrade panel
        if (Input.GetKeyDown(KeyCode.U))
        {
            if (BarUpgradeSystem.Instance != null) BarUpgradeSystem.Instance.TogglePanel();
            return;
        }
        // [ShopSystem] Shop panel
        if (Input.GetKeyDown(KeyCode.M))
        {
            if (ShopSystem.Instance != null) ShopSystem.Instance.TogglePanel();
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
        _hudBgImage = MakeImage("HUD Background", parent, StretchTop(68, 0, 0), new Color32(10, 14, 18, 235));

        // Divider line
        Image divider = MakeImage("HUD Divider", parent, StretchTop(2, 0, 0, 0, 68), new Color32(255, 255, 255, 30));

        // Day / Time
        _timeIconPlate = MakeImage("Time Icon Plate", parent, Anchored(16, 10, 44, 44), new Color32(194, 87, 52, 180));
        Text timeIcon = MakeText("Time Icon", parent, Anchored(16, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        timeIcon.text = "☀"; // sun
        timeIcon.alignment = TextAnchor.MiddleCenter;
        timeIcon.color = new Color32(245, 177, 90, 255);
        _timeText = MakeText("Time Text", parent, Anchored(68, 10, 220, 28), 20, TextAnchor.MiddleLeft);
        _timeText.text = "Day 1 / dawn";

        // Location
        _locIconPlate = MakeImage("Loc Icon Plate", parent, Anchored(290, 10, 44, 44), new Color32(55, 151, 164, 160));
        Text locIcon = MakeText("Loc Icon", parent, Anchored(290, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        locIcon.text = "⌂"; // house
        locIcon.color = new Color32(142, 223, 210, 255);
        _locationText = MakeText("Location Text", parent, Anchored(342, 10, 180, 28), 20, TextAnchor.MiddleLeft);
        _locationText.text = "De Pijp";

        // Bar status
        _barIconPlate = MakeImage("Bar Icon Plate", parent, Anchored(530, 10, 44, 44), new Color32(154, 111, 45, 160));
        Text barIcon = MakeText("Bar Icon", parent, Anchored(530, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        barIcon.text = "☕"; // coffee/beer
        barIcon.color = new Color32(233, 194, 119, 255);
        _barStatusText = MakeText("Bar Text", parent, Anchored(582, 6, 260, 24), 18, TextAnchor.MiddleLeft);
        _barStatusText.text = "Closed  |  Served 0  |  Rev $0";

        // Weather
        _weatherText = MakeText("Weather Text", parent, Anchored(835, 10, 80, 28), 16, TextAnchor.MiddleLeft);
        _weatherText.text = "";

        // Money
        _moneyIconPlate = MakeImage("Money Icon Plate", parent, Anchored(930, 10, 44, 44), new Color32(86, 125, 56, 160));
        Text moneyIcon = MakeText("Money Icon", parent, Anchored(930, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        moneyIcon.text = "$";
        moneyIcon.color = new Color32(160, 220, 120, 255);
        moneyIcon.fontStyle = FontStyle.Bold;
        _moneyText = MakeText("Money Text", parent, Anchored(982, 10, 280, 28), 22, TextAnchor.MiddleLeft);
        _moneyText.text = "$250";
        _moneyText.color = new Color32(160, 220, 120, 255);
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
        Image fbBg = MakeImage("Feedback BG", parent, StretchBottom(46, 0, 0, 0, 58), new Color32(255, 255, 255, 12));
        _feedbackText = MakeText("Feedback Text", parent, StretchBottom(46, 16, 16, 0, 58), 18, TextAnchor.MiddleLeft);
        _feedbackText.color = new Color32(220, 210, 190, 255);
        _feedbackText.fontStyle = FontStyle.Italic;
        _feedbackText.text = "Your story begins in De Pijp. Explore, work, and find your place.";

        // F6: Flash overlay for time transitions (editor mode)
        Image flashImg = MakeImage("Flash Overlay", parent, StretchFull(), new Color32(255, 255, 255, 0));
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
        _hintBackplate = MakeImage("Hint Backplate", parent, StretchBottom(58, 0, 0), new Color32(10, 14, 18, 230));

        // Divider
        MakeImage("Hint Divider", parent, StretchBottom(2, 0, 0, 0, 58), new Color32(255, 255, 255, 24));

        _hintText = MakeText("Input Hint", parent, StretchBottom(58, 8, 8), 16, TextAnchor.MiddleCenter);
        _hintText.color = new Color32(180, 175, 165, 255);
        _hintText.text = "Space: advance time / dialogue next    1 De Pijp    2 Science Park    3 Tweede Kans    4 Bloemenmarkt    B start shift    F end shift    I inventory    C character    P achievements";
    }

    // ── Game Actions ──────────────────────────────────────

    private void AdvanceTime()
    {
        State.TimeIndex++;
        if (State.TimeIndex >= _timesOfDay.Length)
        {
            State.TimeIndex = 0;
            State.CurrentDay++;
            // F1: Regenerate daily goals at dawn
            GenerateDailyGoals();
            // F8: Update weather for new day
            WeatherSystem.Instance.NewDay(State.CurrentDay);
        }

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
            TutorialSystem.Instance?.OnLocationChanged();
        }
        // Screen shake for location switch
        StartCoroutine(GameJuice.ScreenShake(0.3f, 0.1f));
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

        foreach (StoryEvent storyEvent in _eventDatabase.events)
        {
            if (storyEvent.day != State.CurrentDay)
            {
                continue;
            }
            if (storyEvent.time != CurrentTime() || storyEvent.location != State.CurrentLocationId)
            {
                continue;
            }
            if (string.IsNullOrEmpty(storyEvent.dialogue_id) || State.HasTriggeredDialogue(storyEvent.dialogue_id))
            {
                continue;
            }
            State.MarkDialogueTriggered(storyEvent.dialogue_id);
            // F5: Story event trigger sound
            SoundManager.Play(SoundManager.SoundType.EventTrigger);
            // Delegate to DialogueManager
            DialogueManager.Instance.ShowDialogueById(storyEvent.dialogue_id);
            return;
        }
    }

    // ── F1: Daily Goals ──────────────────────────────────

    private void GenerateDailyGoals()
    {
        _dailyGoals.Clear();
        if (_eventDatabase == null || _eventDatabase.events == null) return;

        // Find events for current day
        foreach (StoryEvent ev in _eventDatabase.events)
        {
            if (ev.day != State.CurrentDay) continue;
            // Create a goal description from the event
            string desc = GenerateGoalDescription(ev);
            _dailyGoals.Add(new DailyGoal
            {
                eventId = ev.id,
                description = desc,
                location = ev.location,
                completed = false,
                day = State.CurrentDay
            });
        }

        // If no events today, add a default goal: visit a location
        if (_dailyGoals.Count == 0)
        {
            _dailyGoals.Add(new DailyGoal
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
        foreach (DailyGoal goal in _dailyGoals)
        {
            if (goal.completed) continue;
            if (goal.location == locationId || string.IsNullOrEmpty(goal.location))
            {
                goal.completed = true;
            }
            if (!goal.completed) allCompleted = false;
        }

        // F1: All goals completed notification
        if (allCompleted && _dailyGoals.Count > 0)
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
            DestroyImmediate(existingAnim);
        SceneAnimator anim = _locationScene.AddComponent<SceneAnimator>();
        anim.FindElements(_locationScene.transform);

        _locationTitle.text = loc.title;
        _locationDesc.text = loc.subtitle;
        _feedbackText.text = "";
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
        _timeText.text = $"Day {State.CurrentDay} / {CurrentTimeLabel}";
        _locationText.text = _locations[State.CurrentLocationId].title;
        // Bar status: read from BarMinigame if available
        bool barActive = BarMinigame.Instance != null && BarMinigame.Instance.IsShiftActive;
        int barServed = barActive ? BarMinigame.Instance.CustomersServed : 0;
        int barEarnings = barActive ? BarMinigame.Instance.ShiftEarnings : 0;
        _barStatusText.text = $"{(barActive ? "Open" : "Closed")}  |  Served {barServed}  |  Rev ${barEarnings}";
        _moneyText.text = $"${State.Money}";

        // Weather
        if (_weatherText != null)
        {
            _weatherText.text = WeatherSystem.Instance.WeatherName;
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
        if (_dailyGoals.Count == 0)
        {
            GenerateDailyGoals();
        }

        if (_dailyGoals.Count >= 1)
        {
            DailyGoal g1 = _dailyGoals[0];
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

        if (_dailyGoals.Count >= 2)
        {
            DailyGoal g2 = _dailyGoals[1];
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
        _hintText.text = "Space: advance time / dialogue next    1 De Pijp    2 Science Park    3 Tweede Kans    4 Bloemenmarkt    B start shift    F end shift    I inventory    C character    P achievements";
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
            DestroyGeneratedObject(existingRoot.gameObject);
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
            DestroyGeneratedObject(parent.GetChild(index).gameObject);
        }
    }

    private static void DestroyGeneratedObject(GameObject target)
    {
        if (target == null)
        {
            return;
        }

        if (Application.isPlaying)
        {
            Destroy(target);
        }
        else
        {
            DestroyImmediate(target);
        }
    }

    // ── RectSpec Builders ─────────────────────────────────

    private static UIFactory.RectSpec StretchFull(float l = 0, float b = 0, float r = 0, float t = 0) =>
        new UIFactory.RectSpec(Vector2.zero, Vector2.one, new Vector2(l, b), new Vector2(-r, -t));

    private static UIFactory.RectSpec StretchTop(float height, float l = 0, float r = 0, float b = 0, float offset = 0) =>
        new UIFactory.RectSpec(new Vector2(0, 1), Vector2.one, new Vector2(l, -height - offset), new Vector2(-r, -offset));

    private static UIFactory.RectSpec StretchBottom(float height, float l = 0, float r = 0, float t = 0, float offset = 0) =>
        new UIFactory.RectSpec(Vector2.zero, new Vector2(1, 0), new Vector2(l, offset), new Vector2(-r, height + offset));

    private static UIFactory.RectSpec Anchored(float left, float top, float w, float h) =>
        new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(0, 1),
            new Vector2(left, -top - h), new Vector2(left + w, -top));

    // ── Types ─────────────────────────────────────────────

    // LocationView moved to GameDataModels.cs (T6)
}
