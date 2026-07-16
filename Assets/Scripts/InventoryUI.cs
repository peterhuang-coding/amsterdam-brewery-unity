using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Inventory UI panel with tabs (Useful / Collectible / Quest Items),
/// item detail panel, semi-transparent background, and slide-in animation.
/// Toggled by I key (registered in GameController).
/// </summary>
public class InventoryUI : MonoBehaviour
{
    private static InventoryUI _instance;
    public static InventoryUI Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("InventoryUI");
                _instance = go.AddComponent<InventoryUI>();
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private bool _isOpen;
    private Canvas _canvas;
    private CanvasGroup _canvasGroup;
    private GameObject _panel;
    private GameObject _detailPanel;
    private Text _detailTitleText;
    private Text _detailDescText;
    private Text _tabTitleText;
    private Transform _contentArea;

    // Tab state
    private enum Tab { Useful, Collectible, Quest }
    private Tab _currentTab = Tab.Useful;
    private readonly string[] _tabNames = { "Useful Items", "Collectibles", "Quest Items" };

    // Sample items (replace with actual InventorySystem data in full integration)
    private readonly List<InventoryItem> _usefulItems = new List<InventoryItem>
    {
        new InventoryItem { id = "beer_mug", name = "Beer Mug", description = "A sturdy glass mug. Essential for serving." },
        new InventoryItem { id = "notebook", name = "Notebook", description = "A worn notebook with half-written recipes." },
    };
    private readonly List<InventoryItem> _collectibles = new List<InventoryItem>
    {
        new InventoryItem { id = "tulip_pin", name = "Tulip Pin", description = "A small enamel tulip pin from Bloemenmarkt." },
        new InventoryItem { id = "postcard", name = "Amsterdam Postcard", description = "A scenic canal view postcard." },
    };
    private readonly List<InventoryItem> _questItems = new List<InventoryItem>
    {
        new InventoryItem { id = "rent_notice", name = "Rent Notice", description = "A reminder that rent is due soon." },
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
        BuildUI();
    }

    private void BuildUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("InventoryUICanvas");
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

        // Main panel
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
                new Vector2(20, -40), new Vector2(-20, -4)),
            28, TextAnchor.MiddleLeft);
        titleText.text = "Inventory";
        titleText.fontStyle = FontStyle.Bold;

        // Close hint
        Text closeText = CreateText("CloseHint", _panel.transform,
            new RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-120, -40), new Vector2(-20, -8)),
            14, TextAnchor.MiddleRight);
        closeText.text = "Press I to close";
        closeText.color = new Color32(150, 150, 150, 200);

        // Tab buttons area
        BuildTabButtons(_panel.transform);

        // Content area (scrollable)
        GameObject contentGO = new GameObject("ContentArea", typeof(RectTransform));
        contentGO.transform.SetParent(_panel.transform, false);
        RectTransform cRT = contentGO.GetComponent<RectTransform>();
        cRT.anchorMin = new Vector2(0, 0);
        cRT.anchorMax = new Vector2(1, 1);
        cRT.offsetMin = new Vector2(20, 80);
        cRT.offsetMax = new Vector2(-20, -48);
        _contentArea = contentGO.transform;

        // Detail panel (right side or bottom)
        BuildDetailPanel(_panel.transform);
    }

    private void BuildTabButtons(Transform parent)
    {
        float[] tabWidths = { 130f, 130f, 130f };
        float startX = 20f;
        for (int i = 0; i < 3; i++)
        {
            int tabIndex = i;
            GameObject tabGO = new GameObject(string.Format("Tab_{0}", i), typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            tabGO.transform.SetParent(parent, false);
            RectTransform tabRT = tabGO.GetComponent<RectTransform>();
            float left = startX + i * (tabWidths[i] + 8f);
            tabRT.anchorMin = new Vector2(0, 1);
            tabRT.anchorMax = new Vector2(0, 1);
            tabRT.offsetMin = new Vector2(left, -72);
            tabRT.offsetMax = new Vector2(left + tabWidths[i], -44);
            Image tabImg = tabGO.GetComponent<Image>();
            tabImg.color = new Color32(40, 45, 55, 255);
            tabImg.raycastTarget = true;

            Text tabText = CreateText("TabText", tabGO.transform,
                new RectSpec(Vector2.zero, Vector2.one, new Vector2(4, 2), new Vector2(-4, -2)),
                14, TextAnchor.MiddleCenter);
            tabText.text = _tabNames[i];
            tabText.fontStyle = FontStyle.Bold;

            Button btn = tabGO.AddComponent<Button>();
            btn.targetGraphic = tabImg;
            btn.onClick.AddListener(() => SwitchTab((Tab)tabIndex));
        }
    }

    private void BuildDetailPanel(Transform parent)
    {
        _detailPanel = new GameObject("DetailPanel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _detailPanel.transform.SetParent(parent, false);
        RectTransform dRT = _detailPanel.GetComponent<RectTransform>();
        dRT.anchorMin = new Vector2(0, 0);
        dRT.anchorMax = new Vector2(1, 0);
        dRT.offsetMin = new Vector2(20, 8);
        dRT.offsetMax = new Vector2(-20, 72);
        Image dImg = _detailPanel.GetComponent<Image>();
        dImg.color = new Color32(30, 35, 42, 255);

        _detailTitleText = CreateText("DetailTitle", _detailPanel.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(0.5f, 1),
                new Vector2(12, -24), new Vector2(0, -4)),
            18, TextAnchor.LowerLeft);
        _detailTitleText.fontStyle = FontStyle.Bold;
        _detailTitleText.text = "Select an item";

        _detailDescText = CreateText("DetailDesc", _detailPanel.transform,
            new RectSpec(new Vector2(0, 0), new Vector2(1, 0.7f),
                new Vector2(12, 4), new Vector2(-12, 0)),
            14, TextAnchor.UpperLeft);
        _detailDescText.text = "Click an item above to see details.";
        _detailDescText.color = new Color32(180, 175, 165, 255);

        _detailPanel.SetActive(true);
    }

    private void SwitchTab(Tab tab)
    {
        _currentTab = tab;
        RefreshContent();
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

        List<InventoryItem> items = GetCurrentTabItems();
        if (items.Count == 0)
        {
            Text emptyText = CreateText("Empty", _contentArea,
                new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                    new Vector2(0, -30), new Vector2(0, -4)),
                16, TextAnchor.MiddleCenter);
            emptyText.text = "(Nothing here yet)";
            emptyText.color = new Color32(120, 120, 120, 200);
            return;
        }

        float y = 4;
        foreach (InventoryItem item in items)
        {
            int index = items.IndexOf(item);
            GameObject itemGO = new GameObject(string.Format("Item_{0}", index), typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            itemGO.transform.SetParent(_contentArea, false);
            RectTransform iRT = itemGO.GetComponent<RectTransform>();
            iRT.anchorMin = new Vector2(0, 1);
            iRT.anchorMax = new Vector2(1, 1);
            iRT.offsetMin = new Vector2(4, -y - 40);
            iRT.offsetMax = new Vector2(-4, -y);
            Image iImg = itemGO.GetComponent<Image>();
            iImg.color = new Color32(35, 40, 48, 255);
            iImg.raycastTarget = true;

            // Emoji icon
            Text iconText = CreateText("Icon", itemGO.transform,
                new RectSpec(new Vector2(0, 0), new Vector2(0, 1),
                    new Vector2(6, 6), new Vector2(36, -6)),
                20, TextAnchor.MiddleCenter);
            iconText.text = GetItemIcon(item.id);
            iconText.fontStyle = FontStyle.Bold;

            // Item name
            Text nameText = CreateText("Name", itemGO.transform,
                new RectSpec(new Vector2(0, 0), new Vector2(1, 1),
                    new Vector2(44, 6), new Vector2(-6, -6)),
                16, TextAnchor.MiddleLeft);
            nameText.text = item.name;
            nameText.fontStyle = FontStyle.Bold;

            // Click handler
            string capturedName = item.name;
            string capturedDesc = item.description;
            Button btn = itemGO.AddComponent<Button>();
            btn.targetGraphic = iImg;
            btn.onClick.AddListener(() => ShowDetail(capturedName, capturedDesc));
            // Hover effect
            ColorBlock cb = btn.colors;
            cb.highlightedColor = new Color32(50, 58, 70, 255);
            btn.colors = cb;

            y += 44;
        }
    }

    private List<InventoryItem> GetCurrentTabItems()
    {
        // Try to get items from InventorySystem if available
        if (InventorySystem.Instance != null)
        {
            var sysItems = InventorySystem.Instance.GetItems();
            if (sysItems != null && sysItems.Count > 0)
            {
                List<InventoryItem> result = new List<InventoryItem>();
                foreach (var kvp in sysItems)
                {
                    result.Add(new InventoryItem
                    {
                        id = kvp.Key,
                        name = kvp.Key,
                        description = $"Quantity: {kvp.Value}"
                    });
                }
                // Add fragments as collectibles
                if (_currentTab == Tab.Collectible)
                {
                    var fragments = InventorySystem.Instance.GetFragments();
                    if (fragments != null)
                    {
                        foreach (string f in fragments)
                        {
                            string display = f.Length > 40 ? f.Substring(0, 40) + "..." : f;
                            result.Add(new InventoryItem
                            {
                                id = "fragment_" + display,
                                name = "Inspiration Fragment",
                                description = display
                            });
                        }
                    }
                }
                // Add lore as quest items
                if (_currentTab == Tab.Quest)
                {
                    var lore = InventorySystem.Instance.GetLore();
                    if (lore != null)
                    {
                        foreach (var kvp in lore)
                        {
                            string display = kvp.Value.Length > 40 ? kvp.Value.Substring(0, 40) + "..." : kvp.Value;
                            result.Add(new InventoryItem
                            {
                                id = "lore_" + kvp.Key,
                                name = "Lore: " + kvp.Key,
                                description = display
                            });
                        }
                    }
                }
                if (result.Count > 0)
                    return result;
            }
        }
        // Fallback to hardcoded sample items
        switch (_currentTab)
        {
            case Tab.Useful: return _usefulItems;
            case Tab.Collectible: return _collectibles;
            case Tab.Quest: return _questItems;
            default: return _usefulItems;
        }
    }

    private string GetItemIcon(string itemId)
    {
        return itemId switch
        {
            "beer_mug" => "🍺",
            "notebook" => "📓",
            "tulip_pin" => "🌷",
            "postcard" => "📮",
            "rent_notice" => "📄",
            _ => "📦"
        };
    }

    private Color32 GetItemColor(string itemId)
    {
        switch (itemId)
        {
            case "beer_mug": return new Color32(255, 200, 50, 255);
            case "notebook": return new Color32(100, 180, 255, 255);
            case "tulip_pin": return new Color32(255, 100, 150, 255);
            case "postcard": return new Color32(150, 200, 100, 255);
            case "rent_notice": return new Color32(255, 80, 80, 255);
            default: return new Color32(200, 200, 200, 255);
        }
    }

    private void ShowDetail(string name, string description)
    {
        if (_detailTitleText != null)
            _detailTitleText.text = name;
        if (_detailDescText != null)
            _detailDescText.text = description;
    }

    // ── Animations ──────────────────────────────────────

    private IEnumerator AnimateIn()
    {
        if (_panel == null) yield break;
        RectTransform rt = _panel.GetComponent<RectTransform>();
        Vector2 targetPos = rt.anchoredPosition;
        float duration = 0.3f;

        // Start from bottom
        rt.anchoredPosition = targetPos + new Vector2(0, -100f);
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false;

        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / duration, 1f);
            float smooth = p * p * (3f - 2f * p); // Smoothstep
            rt.anchoredPosition = Vector2.Lerp(targetPos + new Vector2(0, -100f), targetPos, smooth);
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

    // ── Types ───────────────────────────────────────────

    private struct InventoryItem
    {
        public string id;
        public string name;
        public string description;
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
