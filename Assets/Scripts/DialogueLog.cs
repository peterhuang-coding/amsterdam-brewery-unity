using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

[System.Serializable]
public class DialogueEntry
{
    public string dialogueId;
    public string speaker;
    public string speakerDisplayName;
    public string text;
    public string timeLabel;
    public int day;
}

public sealed class DialogueLog : MonoBehaviour
{
    private const int MaxEntries = 500;
    private const int PanelSortingOrder = 200;
    private const float SlideDuration = 0.3f;

    private static DialogueLog _instance;
    public static DialogueLog Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("DialogueLog");
                DontDestroyOnLoad(go);
                _instance = go.AddComponent<DialogueLog>();
                _instance.Initialize();
            }
            return _instance;
        }
    }

    private readonly List<DialogueEntry> _entries = new List<DialogueEntry>(MaxEntries);
    private Canvas _canvas;
    private GameObject _panelRoot;
    private GameObject _contentRoot;
    private ScrollRect _scrollRect;
    private RectTransform _contentRect;
    private Font _font;
    private bool _isVisible;
    private bool _initialized;
    private int _currentDay = 1;

    // Slide animation state
    private float _slideTimer;
    private bool _isSlidingIn;
    private bool _isSlidingOut;
    private RectTransform _panelRect;

    private void Awake()
    {
        if (_instance != null && _instance != this)
        {
            Destroy(gameObject);
            return;
        }
        _instance = this;
        DontDestroyOnLoad(gameObject);
    }

    private void Initialize()
    {
        if (_initialized) return;
        _initialized = true;

        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        if (_font == null)
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        BuildCanvas();
        BuildLogPanel();
        _panelRoot.SetActive(false);
    }

    private void BuildCanvas()
    {
        GameObject canvasGo = new GameObject("DialogueLog Canvas");
        canvasGo.transform.SetParent(transform, false);

        _canvas = canvasGo.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = PanelSortingOrder;

        CanvasScaler scaler = canvasGo.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        scaler.matchWidthOrHeight = 0.5f;

        canvasGo.AddComponent<GraphicRaycaster>();
    }

    private void BuildLogPanel()
    {
        Transform root = _canvas.transform;

        // Semi-transparent black background (full screen, click to close)
        Image bgOverlay = MakeImage("Log Overlay", root,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            new Color32(0, 0, 0, 180));

        // Add a button component to the overlay so clicking it closes the panel
        Button overlayButton = bgOverlay.gameObject.AddComponent<Button>();
        overlayButton.onClick.AddListener(TogglePanel);
        // Make the button navigation non-interfering
        ColorBlock colors = overlayButton.colors;
        colors.highlightedColor = new Color32(0, 0, 0, 180);
        colors.pressedColor = new Color32(0, 0, 0, 180);
        colors.selectedColor = new Color32(0, 0, 0, 180);
        overlayButton.colors = colors;

        // Centered panel
        _panelRoot = new GameObject("Log Panel", typeof(RectTransform));
        _panelRoot.transform.SetParent(root, false);
        _panelRect = _panelRoot.GetComponent<RectTransform>();
        _panelRect.anchorMin = new Vector2(0.5f, 0.5f);
        _panelRect.anchorMax = new Vector2(0.5f, 0.5f);
        _panelRect.sizeDelta = new Vector2(900, 600);
        _panelRect.anchoredPosition = new Vector2(450, 0); // start off-screen right

        Image panelBg = _panelRoot.AddComponent<Image>();
        panelBg.color = new Color32(20, 24, 30, 245);

        // Title bar
        Image titleBar = MakeImage("Title Bar", _panelRoot.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                Vector2.zero, new Vector2(0, -48)),
            new Color32(30, 36, 46, 255));

        Text titleText = MakeText("Title Text", titleBar.transform,
            new RectSpec(Vector2.zero, Vector2.one, new Vector2(16, 0), new Vector2(-16, 0)),
            26, TextAnchor.MiddleLeft);
        titleText.text = "\U0001f4dc Dialogue Log";
        titleText.fontStyle = FontStyle.Bold;
        titleText.color = new Color32(246, 240, 229, 255);

        // Close button
        Image closeBtn = MakeImage("Close Button", _panelRoot.transform,
            new RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-48, -44), new Vector2(-12, -4)),
            new Color32(200, 80, 80, 200));
        Text closeText = MakeText("Close Text", closeBtn.transform,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            20, TextAnchor.MiddleCenter);
        closeText.text = "X";
        closeText.fontStyle = FontStyle.Bold;
        Button closeButton = closeBtn.gameObject.AddComponent<Button>();
        closeButton.onClick.AddListener(TogglePanel);

        // Scroll View
        GameObject scrollGo = new GameObject("Log Scroll View", typeof(RectTransform));
        scrollGo.transform.SetParent(_panelRoot.transform, false);
        RectTransform scrollRt = scrollGo.GetComponent<RectTransform>();
        scrollRt.anchorMin = new Vector2(0, 0);
        scrollRt.anchorMax = new Vector2(1, 1);
        scrollRt.offsetMin = new Vector2(8, 8);
        scrollRt.offsetMax = new Vector2(-8, -56);

        // Viewport
        GameObject viewportGo = new GameObject("Viewport", typeof(RectTransform));
        viewportGo.transform.SetParent(scrollGo.transform, false);
        RectTransform viewportRt = viewportGo.GetComponent<RectTransform>();
        viewportRt.anchorMin = Vector2.zero;
        viewportRt.anchorMax = Vector2.one;
        viewportRt.offsetMin = Vector2.zero;
        viewportRt.offsetMax = Vector2.zero;

        Image viewportImage = viewportGo.AddComponent<Image>();
        viewportImage.color = new Color32(0, 0, 0, 0);
        viewportImage.raycastTarget = false;

        // Mask
        Mask mask = viewportGo.AddComponent<Mask>();
        mask.showMaskGraphic = false;

        // Content
        _contentRoot = new GameObject("Content", typeof(RectTransform));
        _contentRoot.transform.SetParent(viewportGo.transform, false);
        _contentRect = _contentRoot.GetComponent<RectTransform>();
        _contentRect.anchorMin = new Vector2(0, 1);
        _contentRect.anchorMax = new Vector2(1, 1);
        _contentRect.pivot = new Vector2(0, 1);
        _contentRect.sizeDelta = new Vector2(0, 0);
        _contentRect.anchoredPosition = Vector2.zero;

        // Content Size Fitter
        ContentSizeFitter csf = _contentRoot.AddComponent<ContentSizeFitter>();
        csf.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
        csf.horizontalFit = ContentSizeFitter.FitMode.Unconstrained;

        VerticalLayoutGroup vlg = _contentRoot.AddComponent<VerticalLayoutGroup>();
        vlg.spacing = 4;
        vlg.padding = new RectOffset(8, 8, 8, 8);
        vlg.childAlignment = TextAnchor.UpperCenter;
        vlg.childForceExpandWidth = true;
        vlg.childForceExpandHeight = false;

        // ScrollRect setup
        _scrollRect = scrollGo.AddComponent<ScrollRect>();
        _scrollRect.content = _contentRect;
        _scrollRect.viewport = viewportRt;
        _scrollRect.horizontal = false;
        _scrollRect.vertical = true;
        _scrollRect.movementType = ScrollRect.MovementType.Clamped;
        _scrollRect.scrollSensitivity = 30;
        _scrollRect.inertia = true;
        _scrollRect.decelerationRate = 0.135f;
    }

    // ── Public API ──────────────────────────────────────────

    public void RecordDialogue(string dialogueId, string speaker, string text, int day, string timeLabel)
    {
        EnsureInitialized();

        DialogueEntry entry = new DialogueEntry
        {
            dialogueId = dialogueId,
            speaker = speaker,
            speakerDisplayName = SpeakerDisplayName(speaker),
            text = text,
            timeLabel = timeLabel,
            day = day,
        };

        AddEntry(entry);
    }

    public void RecordDialogueLine(string speaker, string text)
    {
        EnsureInitialized();

        DialogueEntry entry = new DialogueEntry
        {
            dialogueId = null,
            speaker = speaker,
            speakerDisplayName = SpeakerDisplayName(speaker),
            text = text,
            timeLabel = null,
            day = _currentDay,
        };

        AddEntry(entry);
    }

    public List<DialogueEntry> GetAllEntries()
    {
        return new List<DialogueEntry>(_entries);
    }

    public List<DialogueEntry> GetEntriesForDay(int day)
    {
        List<DialogueEntry> result = new List<DialogueEntry>();
        foreach (DialogueEntry entry in _entries)
        {
            if (entry.day == day)
            {
                result.Add(entry);
            }
        }
        return result;
    }

    public void TogglePanel()
    {
        EnsureInitialized();

        _isVisible = !_isVisible;
        _panelRoot.SetActive(true);

        if (_isVisible)
        {
            // Start slide-in
            _panelRect.anchoredPosition = new Vector2(450, 0);
            _isSlidingIn = true;
            _isSlidingOut = false;
            _slideTimer = 0f;
            RefreshContent();
        }
        else
        {
            // Start slide-out
            _isSlidingIn = false;
            _isSlidingOut = true;
            _slideTimer = 0f;
        }
    }

    public void Clear()
    {
        _entries.Clear();
        if (_isVisible)
        {
            RefreshContent();
        }
    }

    public void SetCurrentDay(int day)
    {
        _currentDay = day;
    }

    // ── Internal ────────────────────────────────────────────

    private void EnsureInitialized()
    {
        if (!_initialized)
        {
            Initialize();
        }
    }

    private void AddEntry(DialogueEntry entry)
    {
        _entries.Add(entry);
        if (_entries.Count > MaxEntries)
        {
            _entries.RemoveAt(0);
        }
    }

    private void Update()
    {
        if (!_initialized || _panelRoot == null) return;

        // Handle slide animation
        if (_isSlidingIn)
        {
            _slideTimer += Time.deltaTime;
            float t = Mathf.Clamp01(_slideTimer / SlideDuration);
            // Ease-out quadratic
            float eased = 1f - (1f - t) * (1f - t);
            float x = Mathf.Lerp(450f, 0f, eased);
            _panelRect.anchoredPosition = new Vector2(x, 0f);

            if (t >= 1f)
            {
                _isSlidingIn = false;
                _panelRect.anchoredPosition = new Vector2(0f, 0f);
            }
        }
        else if (_isSlidingOut)
        {
            _slideTimer += Time.deltaTime;
            float t = Mathf.Clamp01(_slideTimer / SlideDuration);
            // Ease-in quadratic
            float eased = t * t;
            float x = Mathf.Lerp(0f, 450f, eased);
            _panelRect.anchoredPosition = new Vector2(x, 0f);

            if (t >= 1f)
            {
                _isSlidingOut = false;
                _panelRoot.SetActive(false);
                _panelRect.anchoredPosition = new Vector2(450f, 0f);
            }
        }
    }

    private void RefreshContent()
    {
        // Destroy existing content children
        for (int i = _contentRect.childCount - 1; i >= 0; i--)
        {
            Destroy(_contentRect.GetChild(i).gameObject);
        }

        if (_entries.Count == 0)
        {
            Text emptyText = MakeText("Empty Text", _contentRect,
                new RectSpec(Vector2.zero, Vector2.one,
                    new Vector2(0, 0), new Vector2(0, 0)),
                22, TextAnchor.MiddleCenter);
            emptyText.text = "No dialogue records yet.";
            emptyText.color = new Color32(160, 155, 145, 255);
            emptyText.raycastTarget = false;
            return;
        }

        // Group by day
        Dictionary<int, List<DialogueEntry>> grouped = new Dictionary<int, List<DialogueEntry>>();
        List<int> dayOrder = new List<int>();

        foreach (DialogueEntry entry in _entries)
        {
            if (!grouped.ContainsKey(entry.day))
            {
                grouped[entry.day] = new List<DialogueEntry>();
                dayOrder.Add(entry.day);
            }
            grouped[entry.day].Add(entry);
        }

        foreach (int day in dayOrder)
        {
            // Day header
            GameObject dayHeader = new GameObject($"Day {day} Header", typeof(RectTransform));
            dayHeader.transform.SetParent(_contentRect, false);
            RectTransform dhRt = dayHeader.GetComponent<RectTransform>();
            dhRt.sizeDelta = new Vector2(0, 36);

            Text dayText = dayHeader.AddComponent<Text>();
            dayText.font = _font;
            dayText.fontSize = 20;
            dayText.fontStyle = FontStyle.Bold;
            dayText.alignment = TextAnchor.MiddleLeft;
            dayText.color = new Color32(245, 177, 90, 255);
            dayText.text = $"  Day {day}";
            dayText.horizontalOverflow = HorizontalWrapMode.Wrap;

            // Entries for this day
            foreach (DialogueEntry entry in grouped[day])
            {
                CreateEntryRow(entry, _contentRect);
            }
        }
    }

    private void CreateEntryRow(DialogueEntry entry, Transform parent)
    {
        // Each entry row is a clickable item that can expand
        GameObject row = new GameObject("Entry Row", typeof(RectTransform));
        row.transform.SetParent(parent, false);
        RectTransform rowRt = row.GetComponent<RectTransform>();
        rowRt.sizeDelta = new Vector2(0, 36);

        // Background
        Image rowBg = row.AddComponent<Image>();
        rowBg.color = new Color32(40, 46, 56, 200);
        rowBg.raycastTarget = true;

        // Truncate text for display
        string truncatedText = entry.text.Length > 30 ? entry.text.Substring(0, 30) + "..." : entry.text;

        // Color the speaker name by using rich text
        Color32 speakerColor = DialogueManager.GetSpeakerColor(entry.speaker);
        string colorHex = ColorToHex(speakerColor);
        string fullText = $"<color=#{colorHex}>[{entry.speakerDisplayName}]</color> {truncatedText}";

        Text entryText = MakeText("Entry Text", row.transform,
            new RectSpec(Vector2.zero, Vector2.one,
                new Vector2(12, 0), new Vector2(-12, 0)),
            16, TextAnchor.MiddleLeft);
        entryText.text = fullText;
        entryText.color = new Color32(220, 215, 205, 255);
        entryText.raycastTarget = false;

        // Button for expand/collapse
        Button rowButton = row.AddComponent<Button>();
        rowButton.onClick.AddListener(() => ToggleEntryExpand(row, entry, colorHex));

        // Store expand state as false initially
        row.name = "Entry Row|0"; // |0 = collapsed, |1 = expanded
    }

    private void ToggleEntryExpand(GameObject row, DialogueEntry entry, string speakerColorHex)
    {
        // Check if already expanded
        bool isExpanded = row.name.EndsWith("|1");

        if (isExpanded)
        {
            // Collapse: remove the extra text child
            for (int i = row.transform.childCount - 1; i >= 0; i--)
            {
                Transform child = row.transform.GetChild(i);
                if (child.name == "Expanded Text")
                {
                    Destroy(child.gameObject);
                }
            }
            row.name = "Entry Row|0";

            // Shrink row height back
            RectTransform rt = row.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(0, 36);
        }
        else
        {
            // Expand: add full text below
            string fullDisplay = $"<color=#{speakerColorHex}>[{entry.speakerDisplayName}]</color>\n{entry.text}";
            if (!string.IsNullOrEmpty(entry.timeLabel))
            {
                fullDisplay = $"<color=#{speakerColorHex}>[{entry.speakerDisplayName}]</color> ({entry.timeLabel})\n{entry.text}";
            }

            GameObject expandedGo = new GameObject("Expanded Text", typeof(RectTransform));
            expandedGo.transform.SetParent(row.transform, false);

            Text expandedText = expandedGo.AddComponent<Text>();
            expandedText.font = _font;
            expandedText.fontSize = 16;
            expandedText.alignment = TextAnchor.UpperLeft;
            expandedText.color = new Color32(235, 228, 215, 255);
            expandedText.text = fullDisplay;
            expandedText.horizontalOverflow = HorizontalWrapMode.Wrap;
            expandedText.verticalOverflow = VerticalWrapMode.Truncate;
            expandedText.raycastTarget = false;

            // Position the expanded text below the summary line
            RectTransform expRt = expandedGo.GetComponent<RectTransform>();
            expRt.anchorMin = new Vector2(0, 0);
            expRt.anchorMax = new Vector2(1, 1);
            expRt.offsetMin = new Vector2(12, 8);
            expRt.offsetMax = new Vector2(-12, -36);

            row.name = "Entry Row|1";

            // Expand row height based on text content
            RectTransform rowRt = row.GetComponent<RectTransform>();

            // Estimate required height: each text line ~20px + 44px for summary bar and padding
            const float LineHeight = 20f;
            const int CharsPerLine = 55;
            const float BaseHeight = 44f; // 36px summary + 8px bottom padding
            string plainText = entry.text ?? "";
            int lineCount = 1; // speaker name header
            if (plainText.Length > 0)
            {
                lineCount += Mathf.CeilToInt((float)plainText.Length / CharsPerLine);
            }
            float calculatedHeight = lineCount * LineHeight + BaseHeight;
            rowRt.sizeDelta = new Vector2(0, Mathf.Max(72f, calculatedHeight));
        }

        // Force rebuild the layout
        LayoutRebuilder.ForceRebuildLayoutImmediate(_contentRect);
    }

    // ── Speaker Display Name ───────────────────────────────

    private string SpeakerDisplayName(string speakerId)
    {
        if (speakerId == "player") return "Lu Jian";
        if (speakerId == "pablo") return "Pablo";
        if (speakerId == "erik") return "Erik";
        if (speakerId == "sofie") return "Sofie";
        if (speakerId == "chen") return "Chen";
        if (speakerId == "ravi") return "Ravi";
        if (speakerId == "maaike") return "Maaike";
        if (speakerId == "de_wit") return "De Wit";
        return speakerId;
    }

    // ── Helpers ─────────────────────────────────────────────

    private static string ColorToHex(Color32 color)
    {
        return $"{color.r:X2}{color.g:X2}{color.b:X2}";
    }

    private Image MakeImage(string name, Transform parent, RectSpec rect, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), rect);
        Image img = go.GetComponent<Image>();
        img.color = color;
        return img;
    }

    private Text MakeText(string name, Transform parent, RectSpec rect, int fontSize, TextAnchor alignment)
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

    private readonly struct RectSpec
    {
        public readonly Vector2 anchorMin, anchorMax, offsetMin, offsetMax;
        public RectSpec(Vector2 amin, Vector2 amax, Vector2 omin, Vector2 omax)
        {
            anchorMin = amin; anchorMax = amax; offsetMin = omin; offsetMax = omax;
        }
    }
}
