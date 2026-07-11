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
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private bool _initialized;
    private bool _playerHasMoved;
    private bool _locationChanged;
    private bool _barOpened;
    private bool _barServed;
    private bool _timeAdvanced;

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
        { "B", new Vector2(150, -100) },    // bottom center-right
        { "S", new Vector2(200, -100) },    // bottom right
        { "Space", new Vector2(0, -120) },  // bottom center
    };

    private Font _font;

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            DontDestroyOnLoad(gameObject);
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

    private void InitializeSteps()
    {
        _steps = new List<TutorialStep>
        {
            new TutorialStep { id = "move", message = "Press WASD or Arrow Keys to move around the city.", inputKey = "WASD", completed = false },
            new TutorialStep { id = "locations", message = "Press keys 1-4 to switch between locations.", inputKey = "1-4", completed = false },
            new TutorialStep { id = "open_bar", message = "Press B to open the bar at Tweede Kans.", inputKey = "B", completed = false },
            new TutorialStep { id = "serve", message = "Press S to serve a customer at the bar.", inputKey = "S", completed = false },
            new TutorialStep { id = "advance_time", message = "Press Space to advance time and progress the story.", inputKey = "Space", completed = false },
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
        _canvasGroup.blocksRaycasts = false;
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
    /// </summary>
    public void TryStartTutorial()
    {
        if (_initialized) return;
        _initialized = true;

        // Show first step
        ShowStep(0);
    }

    public void OnPlayerMoved()
    {
        if (_playerHasMoved) return;
        _playerHasMoved = true;

        if (_currentStepIndex == 0)
            CompleteStep(0);
    }

    public void OnLocationChanged()
    {
        if (_locationChanged) return;
        _locationChanged = true;

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

        // Hide current step
        StopAllCoroutines();
        StartCoroutine(AnimateOut());

        // Show next step if available
        int nextIndex = index + 1;
        if (nextIndex < _steps.Count)
        {
            ShowStep(nextIndex);
        }
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

        StopAllCoroutines();
        StartCoroutine(WelcomeFadeOut());
    }

    private IEnumerator WelcomeFadeOut()
    {
        for (float t = 0; t < 0.3f; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / 0.3f, 1f);
            _welcomeGroup.alpha = 1f - p;
            yield return null;
        }
        _welcomeGroup.alpha = 0f;
        Destroy(_welcomeCanvas.gameObject);
        _welcomeCanvas = null;

        // Start step-by-step tutorial
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
        _canvasGroup.blocksRaycasts = true;
    }

    private IEnumerator AnimateOut()
    {
        _canvasGroup.blocksRaycasts = false;
        for (float t = 0; t < 0.2f; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / 0.2f, 1f);
            _canvasGroup.alpha = Mathf.Lerp(1f, 0f, p);
            yield return null;
        }
        _canvasGroup.alpha = 0f;
        _canvas.gameObject.SetActive(false);
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
