using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

[ExecuteAlways]
public sealed class GameController : MonoBehaviour
{
    // ── Singleton (T5) ────────────────────────────────
    public static GameController Instance { get; private set; }

    private const string RuntimeRootName = "AB Runtime View";

    private readonly string[] _timesOfDay = { "dawn", "morning", "afternoon", "evening", "night", "late_night" };
    private readonly HashSet<string> _triggeredDialogueIds = new HashSet<string>();
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

    private int _currentDay = 1;
    private int _timeIndex;
    private int _money = 250;
    private string _currentLocation = "de_pijp";

    private bool _barOpen;
    private int _barServed;
    private int _barRevenue;

    private EventDatabase _eventDatabase;
    private DialogueData _activeDialogue;
    private int _dialogueLineIndex;

    private Font _font;

    // ── Dialogue cache (T2) ───────────────────────────
    private readonly Dictionary<string, DialogueData> _dialogueCache = new Dictionary<string, DialogueData>();

    // ── Daily Goals (F1) ──────────────────────────────
    private readonly List<DailyGoal> _dailyGoals = new List<DailyGoal>();

    // HUD elements
    private Text _timeText;
    private Text _locationText;
    private Text _barStatusText;
    private Text _moneyText;
    private Text _feedbackText;
    private Text _hintText;
    private Image _hintBackplate;

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

    // Dialogue
    private GameObject _dialoguePanel;
    private Text _dialogueSpeakerText;
    private Text _dialogueBodyText;
    private Text _dialogueButtonText;
    private GameObject _runtimeRoot;

    private void Awake()
    {
        Instance = this; // (T5)
        BootstrapView();
        // Auto-bootstrap the 2.5D game systems if not already present
        if (Application.isPlaying && FindObjectOfType<PlayerController>() == null)
        {
            AutoBootstrap25D();
        }
    }

    private void AutoBootstrap25D()
    {
        // DontDestroyOnLoad singletons
        if (SceneTransitionManager.Instance == null)
        {
            GameObject smGO = new GameObject("SceneTransitionManager");
            smGO.AddComponent<SceneTransitionManager>();
        }
        if (DialogueManager.Instance == null) { var _ = DialogueManager.Instance; }
        if (InventorySystem.Instance == null) { var _ = InventorySystem.Instance; }
        if (WeatherSystem.Instance == null) { var _ = WeatherSystem.Instance; }
        if (BarMinigame.Instance == null) { var _ = BarMinigame.Instance; }
        SoundManager.Init();

        // Create Player
        GameObject playerGO = new GameObject("Player");
        playerGO.AddComponent<PlayerController>();

        // Setup camera
        GameObject camGO = new GameObject("MainCamera");
        Camera cam = camGO.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color32(8, 10, 14, 255);
        cam.orthographic = true;
        cam.orthographicSize = 5;
        CameraFollow follow = camGO.AddComponent<CameraFollow>();
        follow.target = playerGO.transform;
        follow.smoothSpeed = 5f;
        follow.offset = new Vector3(0, 0, -10);

        // UICamera
        Camera bgCam = new GameObject("UICamera").AddComponent<Camera>();
        bgCam.transform.SetParent(transform);
        bgCam.clearFlags = CameraClearFlags.Depth;
        bgCam.depth = -1;
        bgCam.orthographic = true;
        bgCam.orthographicSize = 5;
        bgCam.backgroundColor = new Color32(8, 10, 14, 255);

        // Initial weather
        WeatherSystem.Instance.NewDay(1);
        OnSceneChanged("de_pijp");

        Debug.Log("Amsterdam Brewery 2.5D auto-bootstrapped!");
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
        if (Application.isPlaying)
        {
            CheckStoryEvents();
        }
    }

    private void Update()
    {
        if (!Application.isPlaying)
        {
            return;
        }

        if (_activeDialogue != null)
        {
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return))
            {
                AdvanceDialogue();
            }
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
            OpenBar();
        }
        else if (Input.GetKeyDown(KeyCode.S))
        {
            ServeCustomer();
        }
        else if (Input.GetKeyDown(KeyCode.C))
        {
            CloseBar();
        }

        // F2: Auto-clear feedback timer
        if (_showingResultFeedback)
        {
            _feedbackTimer -= Time.deltaTime;
            if (_feedbackTimer <= 0f)
            {
                _showingResultFeedback = false;
                _feedbackText.text = _pendingFeedback ?? "";
                _pendingFeedback = null;
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

        // In Play mode, build a minimal HUD overlay instead of full-screen UI
        if (Application.isPlaying)
        {
            BuildMinimalHud();
            return;
        }

        // Editor mode: full build
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
        BuildDialoguePanel(root);
    }

    private void BuildMinimalHud()
    {
        // Small HUD overlay for play mode — just shows day/time/money at top
        Canvas canvas = new GameObject("Play HUD").AddComponent<Canvas>();
        canvas.transform.SetParent(_runtimeRoot.transform, false);
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 90;
        CanvasScaler scaler = canvas.gameObject.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvas.gameObject.AddComponent<GraphicRaycaster>();
        GameObject eventSystem = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        eventSystem.transform.SetParent(_runtimeRoot.transform, false);

        Transform root = canvas.transform;

        // Create empty location scene container (needed by RenderLocation)
        _locationScene = new GameObject("LocationScene", typeof(RectTransform));
        _locationScene.transform.SetParent(_runtimeRoot.transform, false);
        _locationScene.SetActive(false); // Hidden — 2D scene is handled by SceneVisuals

        // Semi-transparent top bar
        Image hudBg = MakeImage("HUD Bg", root,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(0, -32), new Vector2(0, 0)),
            new Color32(10, 14, 18, 180));

        // Time/date
        _timeText = MakeText("Time", root,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(8, -28), new Vector2(160, -4)),
            14, TextAnchor.MiddleLeft);
        _timeText.text = "Day 1 / dawn";

        // Location
        _locationText = MakeText("Location", root,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(170, -28), new Vector2(320, -4)),
            14, TextAnchor.MiddleLeft);
        _locationText.text = "De Pijp";

        // Bar status
        _barStatusText = MakeText("Bar", root,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(330, -28), new Vector2(530, -4)),
            13, TextAnchor.MiddleLeft);
        _barStatusText.text = "Closed";

        // Money
        _moneyText = MakeText("Money", root,
            new UIFactory.RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-120, -28), new Vector2(-8, -4)),
            14, TextAnchor.MiddleRight);
        _moneyText.text = "$250";
        _moneyText.color = new Color32(160, 220, 120, 255);
        _moneyText.fontStyle = FontStyle.Bold;

        // Feedback text (small, above bottom)
        _feedbackText = MakeText("Feedback", root,
            new UIFactory.RectSpec(new Vector2(0, 0), new Vector2(1, 0),
                new Vector2(8, 32), new Vector2(-8, 54)),
            12, TextAnchor.LowerLeft);
        _feedbackText.color = new Color32(180, 175, 165, 200);
        _feedbackText.fontStyle = FontStyle.Italic;
        _feedbackText.text = "WASD: Move | E: Interact | F: Surf | I: Inventory";

        // F1: Daily Goals text (center-left, below top bar)
        _goalText1 = MakeText("Goal1", root,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(8, -60), new Vector2(300, -36)),
            11, TextAnchor.MiddleLeft);
        _goalText1.color = new Color32(236, 180, 87, 255);
        _goalText1.text = "";

        _goalText2 = MakeText("Goal2", root,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(8, -84), new Vector2(300, -60)),
            11, TextAnchor.MiddleLeft);
        _goalText2.color = new Color32(236, 180, 87, 255);
        _goalText2.text = "";

        // F7: Affection bar (right side, top area)
        _affectionBarText = MakeText("Affection", root,
            new UIFactory.RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-300, -28), new Vector2(-130, -4)),
            11, TextAnchor.MiddleRight);
        _affectionBarText.color = new Color32(200, 185, 160, 220);
        _affectionBarText.text = "";
    }

    private void BuildTopHud(Transform parent)
    {
        // HUD bar background
        Image hudBg = MakeImage("HUD Background", parent, StretchTop(68, 0, 0), new Color32(10, 14, 18, 235));

        // Divider line
        Image divider = MakeImage("HUD Divider", parent, StretchTop(2, 0, 0, 0, 68), new Color32(255, 255, 255, 30));

        // Day / Time
        MakeImage("Time Icon Plate", parent, Anchored(16, 10, 44, 44), new Color32(194, 87, 52, 140));
        Text timeIcon = MakeText("Time Icon", parent, Anchored(16, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        timeIcon.text = "☀"; // sun
        timeIcon.alignment = TextAnchor.MiddleCenter;
        timeIcon.color = new Color32(245, 177, 90, 255);
        _timeText = MakeText("Time Text", parent, Anchored(68, 10, 220, 28), 20, TextAnchor.MiddleLeft);
        _timeText.text = "Day 1 / dawn";

        // Location
        MakeImage("Loc Icon Plate", parent, Anchored(290, 10, 44, 44), new Color32(55, 151, 164, 120));
        Text locIcon = MakeText("Loc Icon", parent, Anchored(290, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        locIcon.text = "⌂"; // house
        locIcon.color = new Color32(142, 223, 210, 255);
        _locationText = MakeText("Location Text", parent, Anchored(342, 10, 180, 28), 20, TextAnchor.MiddleLeft);
        _locationText.text = "De Pijp";

        // Bar status
        MakeImage("Bar Icon Plate", parent, Anchored(530, 10, 44, 44), new Color32(154, 111, 45, 120));
        Text barIcon = MakeText("Bar Icon", parent, Anchored(530, 10, 44, 44), 28, TextAnchor.MiddleCenter);
        barIcon.text = "☕"; // coffee/beer
        barIcon.color = new Color32(233, 194, 119, 255);
        _barStatusText = MakeText("Bar Text", parent, Anchored(582, 6, 330, 24), 18, TextAnchor.MiddleLeft);
        _barStatusText.text = "Closed  |  Served 0  |  Rev $0";

        // Money
        MakeImage("Money Icon Plate", parent, Anchored(930, 10, 44, 44), new Color32(86, 125, 56, 120));
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
    }

    private void BuildFeedbackArea(Transform parent)
    {
        // Feedback line between scene and hints
        Image fbBg = MakeImage("Feedback BG", parent, StretchBottom(46, 0, 0, 0, 58), new Color32(255, 255, 255, 12));
        _feedbackText = MakeText("Feedback Text", parent, StretchBottom(46, 16, 16, 0, 58), 18, TextAnchor.MiddleLeft);
        _feedbackText.color = new Color32(220, 210, 190, 255);
        _feedbackText.fontStyle = FontStyle.Italic;
        _feedbackText.text = "Your story begins in De Pijp. Explore, work, and find your place.";
    }

    private void BuildBottomHints(Transform parent)
    {
        _hintBackplate = MakeImage("Hint Backplate", parent, StretchBottom(58, 0, 0), new Color32(10, 14, 18, 230));

        // Divider
        MakeImage("Hint Divider", parent, StretchBottom(2, 0, 0, 0, 58), new Color32(255, 255, 255, 24));

        _hintText = MakeText("Input Hint", parent, StretchBottom(58, 8, 8), 16, TextAnchor.MiddleCenter);
        _hintText.color = new Color32(180, 175, 165, 255);
        _hintText.text = "Space: advance time / dialogue next    1 De Pijp    2 Science Park    3 Tweede Kans    4 Bloemenmarkt    B open bar    S serve    C close";
    }

    private void BuildDialoguePanel(Transform parent)
    {
        // Full-width bottom panel, taller, doesn't overlap HUD
        _dialoguePanel = MakeImage("Dialogue Panel", parent,
            new UIFactory.RectSpec(new Vector2(0.02f, 0.12f), new Vector2(0.98f, 0.88f),
                Vector2.zero, Vector2.zero),
            new Color32(15, 17, 22, 248)).gameObject;

        // Speaker name bar
        Image speakerBg = MakeImage("Speaker BG", _dialoguePanel.transform,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(24, -52), new Vector2(-24, 0)),
            new Color32(194, 87, 52, 180));
        _dialogueSpeakerText = MakeText("Dialogue Speaker", _dialoguePanel.transform,
            new UIFactory.RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(32, -50), new Vector2(-32, -6)),
            24, TextAnchor.MiddleLeft);
        _dialogueSpeakerText.fontStyle = FontStyle.Bold;

        // Body text — lots of space for Chinese text
        _dialogueBodyText = MakeText("Dialogue Body", _dialoguePanel.transform,
            new UIFactory.RectSpec(new Vector2(0, 0), new Vector2(1, 1),
                new Vector2(32, 72), new Vector2(-32, -80)),
            22, TextAnchor.UpperLeft);
        _dialogueBodyText.color = new Color32(235, 228, 215, 255);

        // Next/Finish button
        Image btnBg = MakeImage("Dialogue Button", _dialoguePanel.transform,
            new UIFactory.RectSpec(new Vector2(1, 0), new Vector2(1, 0),
                new Vector2(-180, 24), new Vector2(-24, 64)),
            new Color32(236, 180, 87, 255));
        Button button = btnBg.gameObject.AddComponent<Button>();
        button.onClick.AddListener(AdvanceDialogue);
        _dialogueButtonText = MakeText("Button Text", btnBg.transform, StretchFull(8, 8, 8, 8), 18, TextAnchor.MiddleCenter);
        _dialogueButtonText.color = new Color32(20, 22, 26, 255);
        _dialogueButtonText.fontStyle = FontStyle.Bold;

        _dialoguePanel.SetActive(false);
    }

    // ── Game Actions ──────────────────────────────────────

    private void AdvanceTime()
    {
        _timeIndex++;
        if (_timeIndex >= _timesOfDay.Length)
        {
            _timeIndex = 0;
            _currentDay++;
            // F1: Regenerate daily goals at dawn
            GenerateDailyGoals();
            // F8: Update weather for new day
            WeatherSystem.Instance.NewDay(_currentDay);
        }
        SetFeedback("Time moves. The city keeps its own schedule.");
        RefreshHud();
        CheckStoryEvents();
    }

    private void SwitchLocation(string locationId)
    {
        _currentLocation = locationId;
        // F1: Mark goals for this location as completed
        MarkLocationGoalsCompleted(locationId);
        RenderLocation();
        RefreshHud();
        CheckStoryEvents();
    }

    private void OpenBar()
    {
        if (_barOpen)
        {
            SetFeedback("Tweede Kans is already open.");
            return;
        }
        _barOpen = true;
        _barServed = 0;
        _barRevenue = 0;
        SetFeedback("You open the bar. The first glasses wait behind the counter.");
        RefreshHud();
    }

    private void ServeCustomer()
    {
        if (!_barOpen)
        {
            SetFeedback("The bar is closed. Press B to open it first.");
            return;
        }

        // F8: Weather affects bar revenue
        int revenuePerCustomer = GetBarRevenuePerCustomer();

        _barServed++;
        _barRevenue += revenuePerCustomer;
        SetFeedback($"Served one. Revenue +${revenuePerCustomer}.");
        RefreshHud();
    }

    // F8: Weather-based revenue multiplier
    private int GetBarRevenuePerCustomer()
    {
        WeatherSystem.WeatherType weather = WeatherSystem.Instance.CurrentWeather;
        switch (weather)
        {
            case WeatherSystem.WeatherType.Sunny:
            case WeatherSystem.WeatherType.Cloudy:
                return 6; // Standard
            case WeatherSystem.WeatherType.Rainy:
            case WeatherSystem.WeatherType.Storm:
                return 8; // Tip increase, but fewer customers
            case WeatherSystem.WeatherType.Foggy:
                return 5; // Slow business
            case WeatherSystem.WeatherType.Snowy:
                return 7; // Cozy atmosphere
            default:
                return 6;
        }
    }

    private void CloseBar()
    {
        if (!_barOpen)
        {
            SetFeedback("No shift to close yet.");
            return;
        }
        _barOpen = false;
        _money += _barRevenue;
        SetFeedback($"Shift closed: {_barServed} served, ${_barRevenue} earned.");
        RefreshHud();
    }

    /// <summary>
    /// Public method for other systems (DialogueManager, BarMinigame) to add/remove money.
    /// </summary>
    public void AddMoney(int amount)
    {
        _money += amount;
        RefreshHud();
        if (amount > 0)
            SetFeedback($"+${amount} earned.");
        else
            SetFeedback($"-${-amount} spent.");
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
            if (storyEvent.day != _currentDay)
            {
                continue;
            }
            if (storyEvent.time != CurrentTime() || storyEvent.location != _currentLocation)
            {
                continue;
            }
            if (string.IsNullOrEmpty(storyEvent.dialogue_id) || _triggeredDialogueIds.Contains(storyEvent.dialogue_id))
            {
                continue;
            }
            _triggeredDialogueIds.Add(storyEvent.dialogue_id);
            ShowDialogue(storyEvent.dialogue_id);
            return;
        }
    }

    // T2: Cached dialogue loading
    private void ShowDialogue(string dialogueId)
    {
        DialogueData data;
        if (_dialogueCache.TryGetValue(dialogueId, out data))
        {
            _activeDialogue = data;
            _dialogueLineIndex = 0;
            RenderDialogueLine();
            return;
        }

        TextAsset dialogueAsset = Resources.Load<TextAsset>($"Data/dialogue/zh/{dialogueId}");
        if (dialogueAsset == null)
        {
            SetFeedback($"Missing dialogue: {dialogueId}");
            return;
        }
        data = JsonUtility.FromJson<DialogueData>(dialogueAsset.text);
        _dialogueCache[dialogueId] = data; // Cache for future
        _activeDialogue = data;
        _dialogueLineIndex = 0;
        RenderDialogueLine();
    }

    private void AdvanceDialogue()
    {
        if (_activeDialogue == null)
        {
            return;
        }
        _dialogueLineIndex++;
        RenderDialogueLine();
    }

    private void RenderDialogueLine()
    {
        if (_activeDialogue == null || _activeDialogue.lines == null || _dialogueLineIndex >= _activeDialogue.lines.Length)
        {
            _activeDialogue = null;
            _dialoguePanel.SetActive(false);
            SetFeedback("Dialogue finished.");
            return;
        }

        DialogueLine line = _activeDialogue.lines[_dialogueLineIndex];
        _dialogueSpeakerText.text = SpeakerName(line.speaker);
        _dialogueBodyText.text = line.text;
        _dialogueButtonText.text = _dialogueLineIndex >= _activeDialogue.lines.Length - 1 ? "Finish" : "Next";
        _dialoguePanel.SetActive(true);
    }

    private string SpeakerName(string speakerId)
    {
        if (speakerId == "player") return "Lu Jian";
        if (speakerId == "pablo") return "Pablo";
        if (speakerId == "erik") return "Erik";
        return speakerId;
    }

    // ── F1: Daily Goals ──────────────────────────────────

    private void GenerateDailyGoals()
    {
        _dailyGoals.Clear();
        if (_eventDatabase == null || _eventDatabase.events == null) return;

        // Find events for current day
        foreach (StoryEvent ev in _eventDatabase.events)
        {
            if (ev.day != _currentDay) continue;
            // Create a goal description from the event
            string desc = GenerateGoalDescription(ev);
            _dailyGoals.Add(new DailyGoal
            {
                eventId = ev.id,
                description = desc,
                location = ev.location,
                completed = false,
                day = _currentDay
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
                day = _currentDay
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
        _showingResultFeedback = true;
        _feedbackTimer = 2f;
        _feedbackText.text = message;
        _feedbackText.color = new Color32(255, 220, 100, 255);
        _feedbackText.fontStyle = FontStyle.Bold;
        _feedbackText.fontSize = 16;
    }

    // ── F7: Affection Bar Update ─────────────────────────

    private void UpdateAffectionBar()
    {
        if (_affectionBarText == null) return;

        string currentLocation = _currentLocation;
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

        int affection = InventorySystem.Instance.GetAffection(npcId);
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

        _currentLocation = locationId;
        LocationView loc = _locations[_currentLocation];
        _locationTitle.text = loc.title;
        _locationDesc.text = loc.subtitle;
        _feedbackText.text = "";
        RefreshHud();
    }

    private void RenderLocation()
    {
        LocationView loc = _locations[_currentLocation];

        // In play mode, skip RuntimeVisuals — SceneVisuals handles the 2D scene
        if (Application.isPlaying)
        {
            if (_locationTitle != null) _locationTitle.text = loc.title;
            if (_locationDesc != null) _locationDesc.text = loc.subtitle;
            _feedbackText.text = "";
            return;
        }

        // Destroy old scene
        if (_locationScene != null)
        {
            DestroyChildren(_locationScene.transform);
        }

        // Build new location scene via RuntimeVisuals (T6: pass LocationView)
        RuntimeVisuals.BuildLocationScene(_currentLocation, _locationScene.transform, loc);

        _locationTitle.text = loc.title;
        _locationDesc.text = loc.subtitle;
        _feedbackText.text = "";
        UpdateHintText();
    }

    private void RefreshHud()
    {
        _timeText.text = $"Day {_currentDay} / {CurrentTimeLabel()}";
        _locationText.text = _locations[_currentLocation].title;
        _barStatusText.text = $"{( _barOpen ? "Open" : "Closed" )}  |  Served {_barServed}  |  Rev ${_barRevenue}";
        _moneyText.text = $"${_money}";

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

    private string CurrentTime() => _timesOfDay[_timeIndex];

    private string CurrentTimeLabel() => CurrentTime().Replace("_", " ");

    private void SetFeedback(string message)
    {
        _feedbackText.text = message;
    }

    private void UpdateHintText()
    {
        _hintText.text = "Space: advance time / dialogue next    1 De Pijp    2 Science Park    3 Tweede Kans    4 Bloemenmarkt    B open bar    S serve    C close";
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
        _dialoguePanel = null;
        _dialogueSpeakerText = null;
        _dialogueBodyText = null;
        _dialogueButtonText = null;
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
