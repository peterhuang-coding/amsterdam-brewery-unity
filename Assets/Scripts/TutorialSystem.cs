using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Tutorial system that guides new players through the game's basic controls.
/// Steps are triggered by game events and shown with semi-transparent overlay,
/// white text, and an animated arrow pointing to the relevant key.
/// </summary>
public class TutorialSystem : MonoBehaviour
{
    private static TutorialSystem _instance;
    public static TutorialSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("TutorialSystem");
                _instance = go.AddComponent<TutorialSystem>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private bool _initialized;
    private bool _playerHasMoved;
    private bool _locationChanged;
    private bool _brewStarted;
    private bool _barOpened;
    private bool _barServed;
    private bool _timeAdvanced;
    private bool _shopOpened;
    private bool _upgradeOpened;
    private bool _saveOrLoadUsed;
    public bool JustDismissedWelcomeThisFrame { get; set; }

    /// <summary>
    /// Whether the welcome screen has been dismissed.
    /// Used by SaveSystem to persist tutorial progress.
    /// </summary>
    public bool WelcomeDismissed => _welcomeDismissed;

    /// <summary>
    /// True when the welcome screen canvas exists and is blocking game input.
    /// GameController.HandleInput checks this to skip gameplay keys.
    /// </summary>
    public bool WelcomeIsActive_BlockingInput => _welcomeCanvas != null && _welcomeCanvas.gameObject.activeInHierarchy;

    private List<TutorialStep> _steps;
    private int _currentStepIndex = -1;

    private Canvas _canvas;
    private CanvasGroup _canvasGroup;
    private GameObject _overlay;
    private Text _messageText;
    private Image _arrowImage;
    private RectTransform _arrowRT;

    // Arrow animation
    private Vector2 _arrowStartPos;
    private Vector2 _arrowEndPos;

    // Welcome screen
    private Canvas _welcomeCanvas;
    private CanvasGroup _welcomeGroup;
    private bool _welcomeDismissed;

    // Arrow positions per step (approximate on-screen positions)
    private readonly Dictionary<string, Vector2> _arrowPositions = new Dictionary<string, Vector2>
    {
        { "WASD", new Vector2(0, -100) },  // bottom center
        { "1-4", new Vector2(-200, -100) }, // bottom left
        { "R", new Vector2(-120, -100) },   // bottom center-left
        { "B", new Vector2(150, -100) },    // bottom center-right
        { "S", new Vector2(200, -100) },    // bottom right
        { "Space", new Vector2(0, -120) },  // bottom center
        { "M", new Vector2(-80, -100) },   // bottom center-left
        { "U", new Vector2(80, -100) },    // bottom center-right
        { "L/O", new Vector2(0, -120) },   // bottom center
    };

    private Font _font;

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            if (Application.isPlaying) DontDestroyOnLoad(gameObject);
        }
        else if (_instance != this)
        {
            Destroy(gameObject);
            return;
        }
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        InitializeSteps();
        BuildUI();
        BuildWelcomeScreen();
    }

    private void Update()
    {
        // Allow keyboard dismiss of welcome screen
        if (!_welcomeDismissed && _welcomeCanvas != null)
        {
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.Space))
            {
                DismissWelcome();
                // Don't process this input further — prevent GameController
                // from also handling Space/Return in the same frame (which would
                // advance time and potentially trigger a story dialogue, locking input).
                return;
            }
        }

        // ── Direct key detection for active tutorial step ──
        // Because GameController.HandleInput may be blocked by welcome, dialogue,
        // or other states, the tutorial overlay itself listens for key presses.
        if (!_welcomeDismissed || _currentStepIndex < 0 || _initialized == false)
            return;

        if (_currentStepIndex < _steps.Count)
        {
            string activeKey = _steps[_currentStepIndex].inputKey;
            switch (activeKey)
            {
                case "1-4":
                    if (Input.GetKeyDown(KeyCode.Alpha1) || Input.GetKeyDown(KeyCode.Alpha2) ||
                        Input.GetKeyDown(KeyCode.Alpha3) || Input.GetKeyDown(KeyCode.Alpha4))
                        OnLocationChanged();
                    break;
                case "R":
                    if (Input.GetKeyDown(KeyCode.R)) OnBrewStarted();
                    break;
                case "B":
                    if (Input.GetKeyDown(KeyCode.B)) OnBarOpened();
                    break;
                case "S":
                    if (Input.GetKeyDown(KeyCode.S)) OnCustomerServed();
                    break;
                case "Space":
                    if (Input.GetKeyDown(KeyCode.Space)) OnTimeAdvanced();
                    break;
                case "M":
                    if (Input.GetKeyDown(KeyCode.M)) OnShopOpened();
                    break;
                case "U":
                    if (Input.GetKeyDown(KeyCode.U)) OnUpgradeOpened();
                    break;
                case "L/O":
                    if (Input.GetKeyDown(KeyCode.L) || Input.GetKeyDown(KeyCode.O)) OnSaveOrLoadUsed();
                    break;
            }
        }
    }

    private void InitializeSteps()
    {
        _steps = new List<TutorialStep>
        {
            new TutorialStep { id = "locations", message = "Press keys 1-4 to switch between locations.", inputKey = "1-4", completed = false },
            new TutorialStep { id = "brew", message = "Press R to brew beer. Brewed beer supplies your bar shifts.", inputKey = "R", completed = false },
            new TutorialStep { id = "open_bar", message = "Press B to open the bar at Tweede Kans.", inputKey = "B", completed = false },
            new TutorialStep { id = "serve", message = "Click a drink button to serve customers their order.", inputKey = "S", completed = false },
            new TutorialStep { id = "advance_time", message = "Press Space to advance time and progress the story.", inputKey = "Space", completed = false },
            new TutorialStep { id = "shop", message = "Press M to open the shop. Buy ingredients, drinks, or gifts for NPCs.", inputKey = "M", completed = false },
            new TutorialStep { id = "upgrade", message = "Press U to upgrade your bar: faster service, better tips, and more.", inputKey = "U", completed = false },
            new TutorialStep { id = "save_load", message = "Press L to save your game, or O to quick load.", inputKey = "L/O", completed = false },
        };
    }

    private void BuildUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("TutorialCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 400; // Highest to always be visible
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();
        _canvasGroup = canvasGO.AddComponent<CanvasGroup>();
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false; // Never block game input — tutorial is overlay only
        canvasGO.SetActive(false);

        Transform root = _canvas.transform;

        // Semi-transparent black overlay
        _overlay = new GameObject("Overlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _overlay.transform.SetParent(root, false);
        Image overlayImg = _overlay.GetComponent<Image>();
        overlayImg.color = new Color32(0, 0, 0, 160);
        RectTransform oRT = _overlay.GetComponent<RectTransform>();
        oRT.anchorMin = Vector2.zero;
        oRT.anchorMax = Vector2.one;
        oRT.offsetMin = Vector2.zero;
        oRT.offsetMax = Vector2.zero;

        // Message text (center of screen)
        _messageText = CreateText("Message", root,
            new RectSpec(new Vector2(0.2f, 0.35f), new Vector2(0.8f, 0.65f),
                Vector2.zero, Vector2.zero),
            24, TextAnchor.MiddleCenter);
        _messageText.color = new Color32(255, 255, 255, 255);
        _messageText.fontStyle = FontStyle.Bold;

        // Arrow image (animated, points to key location)
        _arrowImage = CreateImage("Arrow", root,
            new RectSpec(new Vector2(0, 0), new Vector2(0, 0),
                new Vector2(-16, -16), new Vector2(16, 16)),
            new Color32(255, 220, 60, 255));
        _arrowRT = _arrowImage.GetComponent<RectTransform>();
        _arrowRT.pivot = new Vector2(0.5f, 0.5f);

        canvasGO.SetActive(false);
    }

    /// <summary>
    /// Called externally to start or advance tutorial.
    /// Skips previously completed steps when restoring from save.
    /// </summary>
    public void TryStartTutorial()
    {
        if (_initialized) return;
        _initialized = true;

        // Find first uncompleted step (for save restoration)
        int startIndex = 0;
        if (_steps != null)
        {
            for (int i = 0; i < _steps.Count; i++)
            {
                if (!_steps[i].completed)
                {
                    startIndex = i;
                    break;
                }
                startIndex = i + 1; // All completed up to this point
            }

            // If all steps completed, don't show the tutorial overlay
            if (startIndex >= _steps.Count)
                return;
        }

        ShowStep(startIndex);
    }

    public void OnPlayerMoved()
    {
        if (_playerHasMoved) return;
        _playerHasMoved = true;
        // Reserved for future tutorial step
    }

    public void OnLocationChanged()
    {
        if (_locationChanged) return;
        _locationChanged = true;

        if (_currentStepIndex == 0)
            CompleteStep(0);
    }

    public void OnBrewStarted()
    {
        if (_brewStarted) return;
        _brewStarted = true;

        if (_currentStepIndex == 1)
            CompleteStep(1);
    }

    public void OnBarOpened()
    {
        if (_barOpened) return;
        _barOpened = true;

        if (_currentStepIndex == 2)
            CompleteStep(2);
    }

    public void OnCustomerServed()
    {
        if (_barServed) return;
        _barServed = true;

        if (_currentStepIndex == 3)
            CompleteStep(3);
    }

    public void OnTimeAdvanced()
    {
        if (_timeAdvanced) return;
        _timeAdvanced = true;

        if (_currentStepIndex == 4)
            CompleteStep(4);
    }

    public void OnShopOpened()
    {
        if (_shopOpened) return;
        _shopOpened = true;

        if (_currentStepIndex == 5)
            CompleteStep(5);
    }

    public void OnUpgradeOpened()
    {
        if (_upgradeOpened) return;
        _upgradeOpened = true;

        if (_currentStepIndex == 6)
            CompleteStep(6);
    }

    public void OnSaveOrLoadUsed()
    {
        if (_saveOrLoadUsed) return;
        _saveOrLoadUsed = true;

        if (_currentStepIndex == 7)
            CompleteStep(7);
    }

    /// <summary>
    /// Reset all tutorial progress for a new game.
    /// </summary>
    public void ResetTutorial()
    {
        _playerHasMoved = false;
        _locationChanged = false;
        _brewStarted = false;
        _barOpened = false;
        _barServed = false;
        _timeAdvanced = false;
        _shopOpened = false;
        _upgradeOpened = false;
        _saveOrLoadUsed = false;
        _currentStepIndex = -1;
        if (_steps != null)
        {
            foreach (TutorialStep step in _steps)
                step.completed = false;
        }
        // Reset welcome screen
        _welcomeDismissed = false;
        BuildWelcomeScreen();
    }

    /// <summary>
    /// Get completion state for each tutorial step (for save persistence).
    /// </summary>
    public List<bool> GetStepCompletionStates()
    {
        List<bool> states = new List<bool>();
        if (_steps != null)
        {
            foreach (TutorialStep step in _steps)
                states.Add(step.completed);
        }
        return states;
    }

    /// <summary>
    /// Restore tutorial state from a saved game. If the welcome was already
    /// dismissed, destroy it without re-triggering the step-by-step tutorial.
    /// </summary>
    public void RestoreStepStates(List<bool> stepStates, bool welcomeDismissed)
    {
        if (stepStates == null || stepStates.Count == 0) return;

        // Restore step completion states
        for (int i = 0; i < stepStates.Count && _steps != null && i < _steps.Count; i++)
            _steps[i].completed = stepStates[i];

        // Reset event flags for uncompleted steps so the tutorial overlay
        // can detect player actions after a load. Without this, flags set
        // before the save stay true and block step progression after load.
        if (_steps != null && _steps.Count > 0)
        {
            if (!_steps[0].completed) { _playerHasMoved = false; _locationChanged = false; }
            if (_steps.Count > 1 && !_steps[1].completed) _brewStarted = false;
            if (_steps.Count > 2 && !_steps[2].completed) _barOpened = false;
            if (_steps.Count > 3 && !_steps[3].completed) _barServed = false;
            if (_steps.Count > 4 && !_steps[4].completed) _timeAdvanced = false;
            if (_steps.Count > 5 && !_steps[5].completed) _shopOpened = false;
            if (_steps.Count > 6 && !_steps[6].completed) _upgradeOpened = false;
            if (_steps.Count > 7 && !_steps[7].completed) _saveOrLoadUsed = false;
        }

        // If welcome was already dismissed, dismiss it now
        if (welcomeDismissed && !_welcomeDismissed)
        {
            _welcomeDismissed = true;
            if (_welcomeCanvas != null)
            {
                Destroy(_welcomeCanvas.gameObject);
                _welcomeCanvas = null;
            }

            // Only resume tutorial if there are uncompleted steps
            bool allDone = true;
            if (_steps != null)
            {
                foreach (TutorialStep step in _steps)
                    if (!step.completed) allDone = false;
            }

            if (allDone)
            {
                _initialized = true; // Tutorial fully complete, don't restart
            }
            else
            {
                // Resume from first uncompleted step
                TryStartTutorial();
            }
        }
    }

    private void ShowStep(int index)
    {
        if (index < 0 || index >= _steps.Count) return;
        _currentStepIndex = index;
        TutorialStep step = _steps[index];

        _messageText.text = step.message;
        UpdateArrowPosition(step.inputKey);

        _canvas.gameObject.SetActive(true);
        StopAllCoroutines();
        StartCoroutine(AnimateIn());
        StartCoroutine(AnimateArrow());
    }

    private void CompleteStep(int index)
    {
        if (index < 0 || index >= _steps.Count) return;
        _steps[index].completed = true;

        // Stop all running coroutines (animations, arrow movement, etc.)
        // then start the appropriate transition.
        StopAllCoroutines();

        int nextIndex = index + 1;
        if (nextIndex < _steps.Count)
        {
            // Animate out current step, then show next step
            StartCoroutine(AnimateOutThenShow(nextIndex));
        }
        else
        {
            // Last step completed — just fade out
            StartCoroutine(AnimateOut());
        }
    }

    private IEnumerator AnimateOutThenShow(int nextIndex)
    {
        // Fade out current step
        yield return AnimateOutRoutine();
        // Now show next step
        ShowStep(nextIndex);
    }

    private void UpdateArrowPosition(string inputKey)
    {
        if (_arrowRT == null) return;

        Vector2 basePos;
        if (!_arrowPositions.TryGetValue(inputKey, out basePos))
            basePos = new Vector2(0, -100);

        // Convert from screen-space to anchored position
        // The canvas is 1280x720; we'll offset from center
        _arrowRT.anchorMin = new Vector2(0.5f, 0);
        _arrowRT.anchorMax = new Vector2(0.5f, 0);
        _arrowStartPos = basePos;
        _arrowEndPos = basePos + new Vector2(0, 20);
        _arrowRT.anchoredPosition = _arrowStartPos;

        // Rotate arrow to point up
        _arrowRT.localRotation = Quaternion.Euler(0, 0, 0);

        // Set arrow size
        _arrowRT.sizeDelta = new Vector2(32, 32);
    }

    // ── Animations ──────────────────────────────────────

    // ── Welcome Screen ──────────────────────────────────

    private void BuildWelcomeScreen()
    {
        // Clean up any existing welcome canvas (e.g. from a previous game)
        if (_welcomeCanvas != null)
            Destroy(_welcomeCanvas.gameObject);

        GameObject canvasGO = new GameObject("WelcomeCanvas");
        canvasGO.transform.SetParent(transform);
        _welcomeCanvas = canvasGO.AddComponent<Canvas>();
        _welcomeCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _welcomeCanvas.sortingOrder = 500;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();
        _welcomeGroup = canvasGO.AddComponent<CanvasGroup>();
        _welcomeGroup.alpha = 0f;

        Transform root = _welcomeCanvas.transform;

        // Dark overlay
        Image overlay = CreateImage("Overlay", root,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            new Color32(8, 10, 14, 240));

        // Title
        Text titleText = CreateText("Title", root,
            new RectSpec(new Vector2(0.15f, 0.55f), new Vector2(0.85f, 0.80f),
                Vector2.zero, Vector2.zero),
            48, TextAnchor.MiddleCenter);
        titleText.text = "🍺 Amsterdam Brewery";
        titleText.color = new Color32(236, 180, 87, 255);
        titleText.fontStyle = FontStyle.Bold;

        // Subtitle
        Text subText = CreateText("Subtitle", root,
            new RectSpec(new Vector2(0.15f, 0.45f), new Vector2(0.85f, 0.55f),
                Vector2.zero, Vector2.zero),
            20, TextAnchor.MiddleCenter);
        subText.text = "A narrative RPG set in the heart of Amsterdam";
        subText.color = new Color32(180, 175, 165, 255);

        // Controls info
        Text controlsText = CreateText("Controls", root,
            new RectSpec(new Vector2(0.15f, 0.22f), new Vector2(0.85f, 0.42f),
                Vector2.zero, Vector2.zero),
            16, TextAnchor.UpperLeft);
        controlsText.text =
            "━━━ Controls ━━━\n\n" +
            "  WASD / Arrows    Move around the city\n" +
            "  1 - 4                Switch locations\n" +
            "  R                        Brew beer\n" +
            "  B / S / F         Open bar / Serve / Close\n" +
            "  Space                Advance time\n" +
            "  I / C / P           Inventory / Character / Achievements\n" +
            "  M / U / H          Shop / Upgrades / Dialogue Log\n" +
            "  L / O                 Save / Quick Load";
        controlsText.color = new Color32(200, 196, 186, 255);
        controlsText.lineSpacing = 1.4f;

        // Start button
        GameObject btnGO = new GameObject("StartButton", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        btnGO.transform.SetParent(root, false);
        RectTransform btnRT = btnGO.GetComponent<RectTransform>();
        btnRT.anchorMin = new Vector2(0.35f, 0.06f);
        btnRT.anchorMax = new Vector2(0.65f, 0.14f);
        btnRT.offsetMin = Vector2.zero;
        btnRT.offsetMax = Vector2.zero;
        Image btnImg = btnGO.GetComponent<Image>();
        btnImg.color = new Color32(194, 87, 52, 220);
        Button btn = btnGO.AddComponent<Button>();
        btn.targetGraphic = btnImg;
        ColorBlock colors = btn.colors;
        colors.highlightedColor = new Color32(220, 120, 70, 255);
        colors.pressedColor = new Color32(160, 70, 40, 255);
        btn.colors = colors;

        Text btnText = CreateText("BtnText", btnGO.transform,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            22, TextAnchor.MiddleCenter);
        btnText.text = "▶  Begin Your Story";
        btnText.color = new Color32(255, 255, 255, 255);
        btnText.fontStyle = FontStyle.Bold;

        btn.onClick.AddListener(() => DismissWelcome());

        // Fade in
        canvasGO.SetActive(true);
        StartCoroutine(WelcomeFadeIn());
    }

    private IEnumerator WelcomeFadeIn()
    {
        _welcomeGroup.alpha = 0f;
        for (float t = 0; t < 0.5f; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / 0.5f, 1f);
            _welcomeGroup.alpha = p * p * (3f - 2f * p);
            yield return null;
        }
        _welcomeGroup.alpha = 1f;
    }

    private void DismissWelcome()
    {
        if (_welcomeDismissed) return;
        _welcomeDismissed = true;
        JustDismissedWelcomeThisFrame = true;

        // Instant destroy — no fade animation that could leave the canvas
        // blocking input for 0.3s
        if (_welcomeCanvas != null)
        {
            Destroy(_welcomeCanvas.gameObject);
            _welcomeCanvas = null;
        }

        // Kick off the step-by-step tutorial overlay
        TryStartTutorial();
    }

    private IEnumerator AnimateIn()
    {
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false;

        for (float t = 0; t < 0.3f; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / 0.3f, 1f);
            _canvasGroup.alpha = Mathf.Lerp(0f, 1f, p);
            yield return null;
        }
        _canvasGroup.alpha = 1f;
        _canvasGroup.blocksRaycasts = false; // Tutorial overlay must never block game input
    }

    private IEnumerator AnimateOut()
    {
        yield return AnimateOutRoutine();
    }

    private IEnumerator AnimateOutRoutine()
    {
        if (_canvasGroup == null) yield break;
        _canvasGroup.blocksRaycasts = false;
        for (float t = 0; t < 0.2f; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / 0.2f, 1f);
            _canvasGroup.alpha = Mathf.Lerp(1f, 0f, p);
            yield return null;
        }
        _canvasGroup.alpha = 0f;
        if (_canvas != null) _canvas.gameObject.SetActive(false);
    }

    private IEnumerator AnimateArrow()
    {
        if (_arrowRT == null) yield break;
        while (true)
        {
            float duration = 0.6f;
            for (float t = 0; t < duration; t += Time.deltaTime)
            {
                float p = Mathf.Min(t / duration, 1f);
                float smooth = Mathf.Sin(p * Mathf.PI); // smooth bounce
                _arrowRT.anchoredPosition = Vector2.Lerp(_arrowStartPos, _arrowEndPos, smooth);
                yield return null;
            }
            yield return new WaitForSeconds(0.2f);
        }
    }

    // ── UI Helpers ──────────────────────────────────────

    private Image CreateImage(string name, Transform parent, RectSpec rect, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), rect);
        Image img = go.GetComponent<Image>();
        img.color = color;
        return img;
    }

    private Text CreateText(string name, Transform parent, RectSpec rect, int fontSize, TextAnchor alignment)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), rect);
        Text text = go.GetComponent<Text>();
        text.font = _font;
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    private static void ApplyRect(RectTransform rt, RectSpec spec)
    {
        rt.anchorMin = spec.anchorMin;
        rt.anchorMax = spec.anchorMax;
        rt.offsetMin = spec.offsetMin;
        rt.offsetMax = spec.offsetMax;
    }

    private struct RectSpec
    {
        public Vector2 anchorMin, anchorMax, offsetMin, offsetMax;
        public RectSpec(Vector2 amin, Vector2 amax, Vector2 omin, Vector2 omax)
        {
            anchorMin = amin; anchorMax = amax; offsetMin = omin; offsetMax = omax;
        }
    }
}
