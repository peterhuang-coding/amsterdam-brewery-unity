using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Character relationship panel showing affection bars for all NPCs,
/// date/time/money, story event count, and bar statistics.
/// Opens/closes with C key. Slides in from the right.
/// </summary>
public class CharacterPanel : MonoBehaviour
{
    private static CharacterPanel _instance;
    public static CharacterPanel Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("CharacterPanel");
                _instance = go.AddComponent<CharacterPanel>();
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private bool _isOpen;
    private Canvas _canvas;
    private CanvasGroup _canvasGroup;
    private GameObject _panel;
    private Transform _contentArea;

    // Character data
    private readonly string[] _characterIds = { "pablo", "erik", "sofie", "chen", "ravi", "de_wit", "maaike" };
    private readonly string[] _characterNames = { "Pablo", "Erik", "Sofie", "Chen", "Ravi", "De Wit", "Maaike" };

    private Text _dateTimeText;
    private Text _moneyText;
    private Text _storyEventsText;
    private Text _barStatsText;

    private Font _font;
    private GameController _gameController;

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
        BuildUI();
    }

    private void BuildUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("CharacterPanelCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 200;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();
        _canvasGroup = canvasGO.AddComponent<CanvasGroup>();
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false;
        canvasGO.SetActive(false);

        Transform root = _canvas.transform;

        // Semi-transparent background overlay
        Image overlay = CreateImage("Overlay", root,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            new Color32(0, 0, 0, 180));
        overlay.raycastTarget = true;

        // Main panel (right-aligned, slides in from right)
        _panel = new GameObject("Panel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _panel.transform.SetParent(root, false);
        Image panelImg = _panel.GetComponent<Image>();
        panelImg.color = new Color32(20, 24, 30, 240);
        RectTransform pRT = _panel.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.5f, 0.05f);
        pRT.anchorMax = new Vector2(0.95f, 0.95f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;

        // Title
        Text titleText = CreateText("Title", _panel.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(20, -40), new Vector2(-120, -4)),
            28, TextAnchor.MiddleLeft);
        titleText.text = "Character Panel";
        titleText.fontStyle = FontStyle.Bold;

        Text closeText = CreateText("CloseHint", _panel.transform,
            new RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-120, -40), new Vector2(-20, -8)),
            14, TextAnchor.MiddleRight);
        closeText.text = "Press C to close";
        closeText.color = new Color32(150, 150, 150, 200);

        // Content area
        GameObject contentGO = new GameObject("ContentArea", typeof(RectTransform));
        contentGO.transform.SetParent(_panel.transform, false);
        RectTransform cRT = contentGO.GetComponent<RectTransform>();
        cRT.anchorMin = new Vector2(0, 0);
        cRT.anchorMax = new Vector2(1, 1);
        cRT.offsetMin = new Vector2(20, 16);
        cRT.offsetMax = new Vector2(-20, -48);
        _contentArea = contentGO.transform;
    }

    public void Toggle()
    {
        _isOpen = !_isOpen;
        _canvas.gameObject.SetActive(_isOpen);

        if (_isOpen)
        {
            RefreshContent();
            StartCoroutine(AnimateIn());
        }
        else
        {
            StartCoroutine(AnimateOut());
        }
    }

    private void RefreshContent()
    {
        // Clear old content
        foreach (Transform child in _contentArea)
            Destroy(child.gameObject);

        float y = 4;

        // Section: Date / Time / Money
        AddSectionLabel("Status", ref y);
        AddInfoLine(string.Format("Day {0} / {1}", GetCurrentDay(), GetCurrentTimeLabel()), ref y);
        AddInfoLine(string.Format("Money: ${0}", GetMoney()), ref y);
        AddInfoLine(string.Format("Location: {0}", GetLocationName()), ref y);
        y += 8;

        // Section: Story Events
        AddSectionLabel("Story Progress", ref y);
        AddInfoLine(string.Format("Events triggered: {0}", GetStoryEventCount()), ref y);
        y += 8;

        // Section: Bar Statistics
        AddSectionLabel("Bar Statistics", ref y);
        AddInfoLine(string.Format("Total served: {0}", GetBarServed()), ref y);
        AddInfoLine(string.Format("Total revenue: ${0}", GetBarRevenue()), ref y);
        y += 8;

        // Section: Character Affection
        AddSectionLabel("Relationships", ref y);
        for (int i = 0; i < _characterIds.Length; i++)
        {
            int affection = GetAffection(_characterIds[i]);
            AddAffectionBar(_characterNames[i], affection, ref y);
        }
    }

    private void AddSectionLabel(string text, ref float y)
    {
        Text t = CreateText(string.Format("Section_{0}", y), _contentArea,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(0, -y - 28), new Vector2(0, -y)),
            18, TextAnchor.LowerLeft);
        t.text = string.Format("-- {0} --", text);
        t.fontStyle = FontStyle.Bold;
        t.color = new Color32(236, 180, 87, 255);
        y += 30;
    }

    private void AddInfoLine(string text, ref float y)
    {
        Text t = CreateText(string.Format("Info_{0}", y), _contentArea,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(8, -y - 22), new Vector2(0, -y)),
            15, TextAnchor.LowerLeft);
        t.text = text;
        t.color = new Color32(200, 195, 185, 255);
        y += 24;
    }

    private void AddAffectionBar(string name, int value, ref float y)
    {
        int filled = Mathf.Clamp(value, 0, 10);
        int empty = 10 - filled;
        string barStr = new string('█', filled) + new string('░', empty);

        // Color gradient: red -> yellow -> green
        Color32 barColor;
        if (value <= 2)
            barColor = new Color32(220, 60, 60, 255);     // Red
        else if (value <= 4)
            barColor = new Color32(220, 160, 60, 255);    // Orange
        else if (value <= 6)
            barColor = new Color32(200, 200, 60, 255);    // Yellow
        else if (value <= 8)
            barColor = new Color32(140, 200, 80, 255);    // Lime
        else
            barColor = new Color32(60, 200, 80, 255);     // Green

        Text t = CreateText(string.Format("Aff_{0}", name), _contentArea,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(8, -y - 24), new Vector2(0, -y)),
            16, TextAnchor.LowerLeft);
        t.text = string.Format("{0}: {1} ({2}/10)", name, barStr, value);
        t.color = barColor;
        t.fontStyle = FontStyle.Bold;
        y += 26;
    }

    // ── Data Accessors (via GameController) ─────────────

    private int GetCurrentDay()
    {
        if (GameController.Instance != null)
            return GameController.Instance.State.CurrentDay;
        return 1;
    }

    private string GetCurrentTimeLabel()
    {
        if (GameController.Instance != null)
            return GameController.Instance.State.CurrentTimeLabel;
        return "dawn";
    }

    private int GetMoney()
    {
        if (GameController.Instance != null)
            return GameController.Instance.State.Money;
        return 0;
    }

    private string GetLocationName()
    {
        if (GameController.Instance != null)
            return GameController.Instance.State.CurrentLocationName;
        return "Unknown";
    }

    private int GetStoryEventCount()
    {
        if (GameController.Instance != null)
            return GameController.Instance.State.TriggeredEventCount;
        return 0;
    }

    private int GetBarServed()
    {
        if (BarMinigame.Instance != null)
            return BarMinigame.Instance.CustomersServed;
        return 0;
    }

    private int GetBarRevenue()
    {
        if (BarMinigame.Instance != null)
            return BarMinigame.Instance.ShiftEarnings;
        return 0;
    }

    private int GetAffection(string characterId)
    {
        // Simplified affection: use hardcoded sample or try InventorySystem if available
        var inv = FindAnyObjectByType<InventorySystem>(FindObjectsInactive.Include);
        if (inv != null)
            return inv.GetAffection(characterId);
        return 0;
    }

    // ── Animations ──────────────────────────────────────

    private IEnumerator AnimateIn()
    {
        if (_panel == null) yield break;
        RectTransform rt = _panel.GetComponent<RectTransform>();
        Vector2 targetPos = rt.anchoredPosition;
        float duration = 0.3f;

        // Start from right
        rt.anchoredPosition = targetPos + new Vector2(200f, 0);
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false;

        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / duration, 1f);
            float smooth = p * p * (3f - 2f * p);
            rt.anchoredPosition = Vector2.Lerp(targetPos + new Vector2(200f, 0), targetPos, smooth);
            _canvasGroup.alpha = Mathf.Lerp(0f, 1f, smooth);
            yield return null;
        }
        rt.anchoredPosition = targetPos;
        _canvasGroup.alpha = 1f;
        _canvasGroup.blocksRaycasts = true;
    }

    private IEnumerator AnimateOut()
    {
        if (_panel == null) yield break;
        RectTransform rt = _panel.GetComponent<RectTransform>();
        Vector2 startPos = rt.anchoredPosition;
        float duration = 0.2f;

        _canvasGroup.blocksRaycasts = false;
        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / duration, 1f);
            float smooth = p * p * (3f - 2f * p);
            rt.anchoredPosition = Vector2.Lerp(startPos, startPos + new Vector2(200f, 0), smooth);
            _canvasGroup.alpha = Mathf.Lerp(1f, 0f, smooth);
            yield return null;
        }
        _canvasGroup.alpha = 0f;
        _canvas.gameObject.SetActive(false);
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
