using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Singleton achievement system. Tracks achievements, checks conditions,
/// shows popup notification on unlock, and provides panel (P key) to view progress.
/// </summary>
public class AchievementSystem : MonoBehaviour
{
    private static AchievementSystem _instance;
    public static AchievementSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("AchievementSystem");
                _instance = go.AddComponent<AchievementSystem>();
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private List<Achievement> _achievements;
    private bool _isPanelOpen;
    private Canvas _canvas;
    private CanvasGroup _canvasGroup;
    private GameObject _panel;
    private Transform _contentArea;

    // Notification
    private GameObject _notificationGO;
    private Text _notificationText;
    private CanvasGroup _notificationGroup;

    // Popup notification (slide-in banner)
    private Canvas _popupCanvas;
    private GameObject _popupBanner;
    private Text _popupTitleText;
    private Text _popupDescText;
    private Coroutine _popupRoutine;

    // Condition tracking
    private HashSet<string> _visitedLocations = new HashSet<string>();
    private HashSet<string> _drinksSold = new HashSet<string>();
    private int _totalCustomersServed;
    private int _maxDailyRevenue;

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
        InitializeAchievements();
        BuildUI();
        BuildNotification();
    }

    private void InitializeAchievements()
    {
        _achievements = new List<Achievement>
        {
            new Achievement { id = "first_sale", title = "First Sale", description = "Serve your first customer at the bar.", unlocked = false },
            new Achievement { id = "regular_customer", title = "Regular Customer", description = "Serve 10 customers total.", unlocked = false },
            new Achievement { id = "big_spender", title = "Big Spender", description = "Earn $50 in a single day.", unlocked = false },
            new Achievement { id = "explorer", title = "Explorer", description = "Visit all 4 locations.", unlocked = false },
            new Achievement { id = "mixologist", title = "Mixologist", description = "Serve every type of drink.", unlocked = false },
            new Achievement { id = "friends", title = "Friends", description = "Reach affection level 5 with any character.", unlocked = false },
        };
    }

    private void BuildUI()
    {
        GameObject canvasGO = new GameObject("AchievementCanvas");
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

        // Overlay
        Image overlay = CreateImage("Overlay", root,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            new Color32(0, 0, 0, 180));

        // Panel
        _panel = new GameObject("Panel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _panel.transform.SetParent(root, false);
        Image panelImg = _panel.GetComponent<Image>();
        panelImg.color = new Color32(20, 24, 30, 240);
        RectTransform pRT = _panel.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.15f, 0.1f);
        pRT.anchorMax = new Vector2(0.85f, 0.9f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;

        // Title
        Text titleText = CreateText("Title", _panel.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(20, -40), new Vector2(-120, -4)),
            28, TextAnchor.MiddleLeft);
        titleText.text = "Achievements";
        titleText.fontStyle = FontStyle.Bold;

        Text closeText = CreateText("CloseHint", _panel.transform,
            new RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-120, -40), new Vector2(-20, -8)),
            14, TextAnchor.MiddleRight);
        closeText.text = "Press P to close";
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

    private void BuildNotification()
    {
        _notificationGO = new GameObject("AchievementNotification", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _notificationGO.transform.SetParent(transform);
        RectTransform nRT = _notificationGO.GetComponent<RectTransform>();
        nRT.anchorMin = new Vector2(0.5f, 1);
        nRT.anchorMax = new Vector2(0.5f, 1);
        nRT.offsetMin = new Vector2(-200, -120);
        nRT.offsetMax = new Vector2(200, -60);
        Image nImg = _notificationGO.GetComponent<Image>();
        nImg.color = new Color32(40, 35, 20, 230);

        _notificationGroup = _notificationGO.AddComponent<CanvasGroup>();
        _notificationGroup.alpha = 0f;

        _notificationText = CreateText("NotifText", _notificationGO.transform,
            new RectSpec(Vector2.zero, Vector2.one, new Vector2(12, 6), new Vector2(-12, -6)),
            18, TextAnchor.MiddleCenter);
        _notificationText.fontStyle = FontStyle.Bold;
        _notificationText.color = new Color32(255, 220, 60, 255);

        // Set sorting order high enough to be visible
        Canvas notifCanvas = _notificationGO.AddComponent<Canvas>();
        notifCanvas.sortingOrder = 300;
        notifCanvas.renderMode = RenderMode.ScreenSpaceOverlay;

        _notificationGO.SetActive(false);
    }

    private void BuildPopupUI()
    {
        if (_popupCanvas != null) return;

        // Create canvas at sortingOrder 450 (above most UI, below tutorial welcome)
        GameObject canvasGO = new GameObject("AchievementPopupCanvas");
        canvasGO.transform.SetParent(transform);
        _popupCanvas = canvasGO.AddComponent<Canvas>();
        _popupCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _popupCanvas.sortingOrder = 450;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();
        CanvasGroup cg = canvasGO.AddComponent<CanvasGroup>();
        cg.blocksRaycasts = false;

        // Banner panel — positioned off-screen right initially
        _popupBanner = new GameObject("PopupBanner", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _popupBanner.transform.SetParent(_popupCanvas.transform, false);
        RectTransform bannerRT = _popupBanner.GetComponent<RectTransform>();
        bannerRT.anchorMin = new Vector2(1, 1);
        bannerRT.anchorMax = new Vector2(1, 1);
        bannerRT.pivot = new Vector2(1, 0);
        bannerRT.sizeDelta = new Vector2(300, 90);
        bannerRT.anchoredPosition = new Vector2(0, -100);

        Image bannerImg = _popupBanner.GetComponent<Image>();
        bannerImg.color = new Color32(194, 160, 50, 235);

        // Trophy icon
        GameObject iconGO = new GameObject("Icon", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        iconGO.transform.SetParent(_popupBanner.transform, false);
        RectTransform iconRT = iconGO.GetComponent<RectTransform>();
        iconRT.anchorMin = Vector2.zero;
        iconRT.anchorMax = Vector2.zero;
        iconRT.sizeDelta = new Vector2(50, 50);
        iconRT.anchoredPosition = new Vector2(25, 45);
        iconRT.pivot = new Vector2(0.5f, 0.5f);
        Text iconText = iconGO.GetComponent<Text>();
        iconText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        iconText.text = "\U0001f3c6";
        iconText.fontSize = 32;
        iconText.alignment = TextAnchor.MiddleCenter;

        // Title text
        _popupTitleText = CreatePopupText("Title", _popupBanner.transform, new Vector2(55, 50), new Vector2(280, 30), 18, TextAnchor.LowerLeft);
        _popupTitleText.fontStyle = FontStyle.Bold;
        _popupTitleText.color = new Color32(255, 255, 255, 255);
        _popupTitleText.text = "Achievement Unlocked!";

        // Description text
        _popupDescText = CreatePopupText("Desc", _popupBanner.transform, new Vector2(55, 20), new Vector2(280, 30), 14, TextAnchor.UpperLeft);
        _popupDescText.color = new Color32(246, 240, 229, 255);
        _popupDescText.text = "";

        // Start hidden
        _popupBanner.SetActive(false);
    }

    private Text CreatePopupText(string name, Transform parent, Vector2 pos, Vector2 size, int fontSize, TextAnchor align)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.zero;
        rt.sizeDelta = size;
        rt.anchoredPosition = pos;
        rt.pivot = new Vector2(0, 0.5f);

        Text t = go.GetComponent<Text>();
        t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        t.fontSize = fontSize;
        t.alignment = align;
        t.horizontalOverflow = HorizontalWrapMode.Wrap;
        t.verticalOverflow = VerticalWrapMode.Truncate;
        return t;
    }

    // ── Public Check Methods ────────────────────────────

    public void CheckFirstSale()
    {
        TryUnlock("first_sale");
    }

    public void RegisterCustomerServed()
    {
        _totalCustomersServed++;
        if (_totalCustomersServed >= 10)
            TryUnlock("regular_customer");
    }

    public void RegisterDailyRevenue(int revenue)
    {
        if (revenue > _maxDailyRevenue)
            _maxDailyRevenue = revenue;
        if (_maxDailyRevenue >= 50)
            TryUnlock("big_spender");
    }

    public void RegisterLocationVisited(string locationId)
    {
        _visitedLocations.Add(locationId);
        if (_visitedLocations.Count >= 4)
            TryUnlock("explorer");
    }

    public void RegisterDrinkSold(string drinkId)
    {
        _drinksSold.Add(drinkId);
        if (_drinksSold.Count >= 3) // beer, whiskey, wine
            TryUnlock("mixologist");
    }

    public void CheckAffectionAchievement(string characterId, int value)
    {
        if (value >= 5)
            TryUnlock("friends");
    }

    /// <summary>
    /// Restore an achievement from save data (no popup, no sound).
    /// Called by SaveSystem on load.
    /// </summary>
    public void RestoreAchievement(string achievementId)
    {
        foreach (Achievement a in _achievements)
        {
            if (a.id == achievementId && !a.unlocked)
            {
                a.unlocked = true;
                Debug.Log(string.Format("[AchievementSystem] Restored: {0}", a.title));
                return;
            }
        }
    }

    /// <summary>
    /// Reset all achievements and progress tracking for a new game.
    /// </summary>
    public void ResetAllAchievements()
    {
        foreach (Achievement a in _achievements)
            a.unlocked = false;
        _visitedLocations.Clear();
        _drinksSold.Clear();
        _totalCustomersServed = 0;
        _maxDailyRevenue = 0;
    }

    /// <summary>
    /// Returns list of IDs for all unlocked achievements (used by SaveSystem).
    /// </summary>
    public List<string> GetUnlockedAchievementIds()
    {
        List<string> ids = new List<string>();
        foreach (Achievement a in _achievements)
        {
            if (a.unlocked)
                ids.Add(a.id);
        }
        return ids;
    }

    /// <summary>Total number of achievements in the system.</summary>
    public int TotalAchievementCount => _achievements.Count;

    // ── Core ────────────────────────────────────────────

    private void TryUnlock(string achievementId)
    {
        foreach (Achievement a in _achievements)
        {
            if (a.id == achievementId && !a.unlocked)
            {
                a.unlocked = true;
                ShowNotification(a.title);
                ShowAchievementPopup($"\U0001f3c6 {a.title}", a.description);
                Debug.Log(string.Format("Achievement unlocked: {0} - {1}", a.title, a.description));
                return;
            }
        }
    }

    private void ShowNotification(string title)
    {
        if (_notificationGO == null) return;
        _notificationText.text = string.Format("+50 Achievement\n{0}", title);
        StopAllCoroutines();
        StartCoroutine(NotificationAnimation());
    }

    private IEnumerator NotificationAnimation()
    {
        _notificationGO.SetActive(true);
        _notificationGroup.alpha = 0f;

        // Slide in from top
        RectTransform rt = _notificationGO.GetComponent<RectTransform>();
        Vector2 targetPos = rt.anchoredPosition;

        for (float t = 0; t < 0.3f; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / 0.3f, 1f);
            float smooth = p * p * (3f - 2f * p);
            rt.anchoredPosition = Vector2.Lerp(targetPos + new Vector2(0, 60f), targetPos, smooth);
            _notificationGroup.alpha = Mathf.Lerp(0f, 1f, smooth);
            yield return null;
        }
        _notificationGroup.alpha = 1f;
        rt.anchoredPosition = targetPos;

        // Hold
        yield return new WaitForSeconds(2.5f);

        // Fade out
        for (float t = 0; t < 0.3f; t += Time.deltaTime)
        {
            _notificationGroup.alpha = Mathf.Lerp(1f, 0f, t / 0.3f);
            yield return null;
        }
        _notificationGroup.alpha = 0f;
        _notificationGO.SetActive(false);
    }

    public void ShowAchievementPopup(string title, string description)
    {
        if (_popupRoutine != null)
            StopCoroutine(_popupRoutine);
        _popupRoutine = StartCoroutine(AchievementPopupRoutine(title, description));
    }

    private IEnumerator AchievementPopupRoutine(string title, string description)
    {
        BuildPopupUI();
        if (_popupBanner == null) yield break;

        // Play success sound
        SoundManager.Play(SoundManager.SoundType.Success);

        // Set text
        _popupTitleText.text = title;
        _popupDescText.text = description;

        // Position off-screen right
        _popupBanner.SetActive(true);
        RectTransform rt = _popupBanner.GetComponent<RectTransform>();
        rt.anchoredPosition = new Vector2(320, -100);

        // Slide in (0.4s)
        for (float t = 0; t < 0.4f; t += Time.deltaTime)
        {
            float p = t / 0.4f;
            float smooth = 1f - (1f - p) * (1f - p); // ease-out quad
            rt.anchoredPosition = new Vector2(Mathf.Lerp(320, 0, smooth), -100);
            yield return null;
        }
        rt.anchoredPosition = new Vector2(0, -100);

        // Hold (3.0s)
        yield return new WaitForSeconds(3.0f);

        // Slide out (0.3s)
        for (float t = 0; t < 0.3f; t += Time.deltaTime)
        {
            float p = t / 0.3f;
            rt.anchoredPosition = new Vector2(Mathf.Lerp(0, 400, p * p), -100);
            yield return null;
        }

        _popupBanner.SetActive(false);
        _popupRoutine = null;
    }

    public void TogglePanel()
    {
        _isPanelOpen = !_isPanelOpen;
        _canvas.gameObject.SetActive(_isPanelOpen);

        if (_isPanelOpen)
        {
            RefreshPanel();
            StartCoroutine(PanelAnimateIn());
        }
        else
        {
            StartCoroutine(PanelAnimateOut());
        }
    }

    private void RefreshPanel()
    {
        foreach (Transform child in _contentArea)
            Destroy(child.gameObject);

        float y = 4;
        int unlockedCount = 0;

        foreach (Achievement a in _achievements)
        {
            if (a.unlocked) unlockedCount++;

            GameObject itemGO = new GameObject(string.Format("Ach_{0}", a.id), typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            itemGO.transform.SetParent(_contentArea, false);
            RectTransform iRT = itemGO.GetComponent<RectTransform>();
            iRT.anchorMin = new Vector2(0, 1);
            iRT.anchorMax = new Vector2(1, 1);
            iRT.offsetMin = new Vector2(4, -y - 44);
            iRT.offsetMax = new Vector2(-4, -y);
            Image iImg = itemGO.GetComponent<Image>();
            iImg.color = a.unlocked ? new Color32(40, 50, 30, 255) : new Color32(30, 30, 35, 255);

            string icon = a.unlocked ? "&#9733;" : "&#9734;"; // star / empty star
            Text iconText = CreateText("Icon", itemGO.transform,
                new RectSpec(new Vector2(0, 0), new Vector2(0, 1),
                    new Vector2(8, 6), new Vector2(40, -6)),
                20, TextAnchor.MiddleCenter);
            iconText.text = a.unlocked ? "*" : "o";
            iconText.color = a.unlocked ? new Color32(255, 220, 60, 255) : new Color32(100, 100, 100, 255);

            Text nameText = CreateText("Name", itemGO.transform,
                new RectSpec(new Vector2(0, 0), new Vector2(1, 1),
                    new Vector2(48, 6), new Vector2(-6, -6)),
                16, TextAnchor.MiddleLeft);
            nameText.text = a.unlocked ? string.Format("{0} (Unlocked)", a.title) : a.title;
            nameText.fontStyle = FontStyle.Bold;
            nameText.color = a.unlocked ? new Color32(200, 200, 200, 255) : new Color32(120, 120, 120, 255);

            Text descText = CreateText("Desc", itemGO.transform,
                new RectSpec(new Vector2(0, 0), new Vector2(1, 1),
                    new Vector2(48, 24), new Vector2(-6, 6)),
                12, TextAnchor.LowerLeft);
            descText.text = a.description;
            descText.color = new Color32(150, 150, 150, 200);

            y += 48;
        }

        // Summary header
        Text summaryText = CreateText("Summary", _contentArea,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(0, -y - 30), new Vector2(0, -y)),
            16, TextAnchor.LowerLeft);
        summaryText.text = string.Format("{0} / {1} unlocked", unlockedCount, _achievements.Count);
        summaryText.fontStyle = FontStyle.Bold;
        summaryText.color = new Color32(236, 180, 87, 255);
    }

    private IEnumerator PanelAnimateIn()
    {
        if (_panel == null) yield break;
        RectTransform rt = _panel.GetComponent<RectTransform>();
        Vector2 targetPos = rt.anchoredPosition;
        float duration = 0.3f;

        rt.anchoredPosition = targetPos + new Vector2(0, -100f);
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false;

        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / duration, 1f);
            float smooth = p * p * (3f - 2f * p);
            rt.anchoredPosition = Vector2.Lerp(targetPos + new Vector2(0, -100f), targetPos, smooth);
            _canvasGroup.alpha = Mathf.Lerp(0f, 1f, smooth);
            yield return null;
        }
        rt.anchoredPosition = targetPos;
        _canvasGroup.alpha = 1f;
        _canvasGroup.blocksRaycasts = true;
    }

    private IEnumerator PanelAnimateOut()
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
            rt.anchoredPosition = Vector2.Lerp(startPos, startPos + new Vector2(0, -100f), smooth);
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
