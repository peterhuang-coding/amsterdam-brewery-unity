using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

[ExecuteAlways]
public sealed class GameController : MonoBehaviour
{
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

    // HUD elements
    private Text _timeText;
    private Text _locationText;
    private Text _barStatusText;
    private Text _moneyText;
    private Text _feedbackText;
    private Text _hintText;
    private Image _hintBackplate;

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
        }
        SetFeedback("Time moves. The city keeps its own schedule.");
        RefreshHud();
        CheckStoryEvents();
    }

    private void SwitchLocation(string locationId)
    {
        _currentLocation = locationId;
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
        _barServed++;
        _barRevenue += 6;
        SetFeedback("Served one regular. Revenue +$6.");
        RefreshHud();
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

    private void ShowDialogue(string dialogueId)
    {
        TextAsset dialogueAsset = Resources.Load<TextAsset>($"Data/dialogue/zh/{dialogueId}");
        if (dialogueAsset == null)
        {
            SetFeedback($"Missing dialogue: {dialogueId}");
            return;
        }
        _activeDialogue = JsonUtility.FromJson<DialogueData>(dialogueAsset.text);
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

        // Build new location scene via RuntimeVisuals
        RuntimeVisuals.BuildLocationScene(_currentLocation, _locationScene.transform,
            loc.accent, loc.highlight, loc.background);

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

    private sealed class LocationView
    {
        public readonly string title, subtitle;
        public readonly Color background, accent, highlight;
        public LocationView(string t, string s, Color bg, Color ac, Color hl)
        {
            title = t; subtitle = s; background = bg; accent = ac; highlight = hl;
        }
    }
}
