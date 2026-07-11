using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Simple inventory and progression tracking system for Amsterdam Brewery.
/// Tracks items, inspiration fragments, character affection, and lore.
/// </summary>
public class InventorySystem : MonoBehaviour
{
    private static InventorySystem _instance;
    public static InventorySystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("InventorySystem");
                _instance = go.AddComponent<InventorySystem>();
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private Dictionary<string, int> _items = new Dictionary<string, int>();
    private List<string> _fragments = new List<string>();
    private Dictionary<string, int> _affection = new Dictionary<string, int>();
    private Dictionary<string, string> _lore = new Dictionary<string, string>();
    private HashSet<string> _unlockedSystems = new HashSet<string>();

    private bool _inventoryOpen = false;
    private Canvas _inventoryCanvas;
    private GameObject _inventoryPanel;

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
        }
    }

    private void Start()
    {
        CreateInventoryUI();
    }

    private void CreateInventoryUI()
    {
        GameObject canvasGO = new GameObject("InventoryCanvas");
        canvasGO.transform.SetParent(transform);
        _inventoryCanvas = canvasGO.AddComponent<Canvas>();
        _inventoryCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _inventoryCanvas.sortingOrder = 150;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        // Overlay
        GameObject overlay = new GameObject("Overlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(UnityEngine.UI.Image));
        overlay.transform.SetParent(_inventoryCanvas.transform, false);
        UnityEngine.UI.Image overlayImg = overlay.GetComponent<UnityEngine.UI.Image>();
        overlayImg.color = new Color32(0, 0, 0, 180);
        RectTransform oRT = overlay.GetComponent<RectTransform>();
        oRT.anchorMin = Vector2.zero;
        oRT.anchorMax = Vector2.one;
        oRT.offsetMin = Vector2.zero;
        oRT.offsetMax = Vector2.zero;

        // Panel
        _inventoryPanel = new GameObject("InventoryPanel", typeof(RectTransform), typeof(CanvasRenderer), typeof(UnityEngine.UI.Image));
        _inventoryPanel.transform.SetParent(_inventoryCanvas.transform, false);
        UnityEngine.UI.Image panelImg = _inventoryPanel.GetComponent<UnityEngine.UI.Image>();
        panelImg.color = new Color32(20, 24, 30, 240);
        RectTransform pRT = _inventoryPanel.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.15f, 0.1f);
        pRT.anchorMax = new Vector2(0.85f, 0.9f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;

        // Title
        UnityEngine.UI.Text titleText = MakeText("Title", _inventoryPanel.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(20, -40), new Vector2(-20, -4),
            28, UnityEngine.TextAnchor.MiddleLeft);
        titleText.text = "Inventory";
        titleText.fontStyle = UnityEngine.FontStyle.Bold;

        // Close hint
        UnityEngine.UI.Text closeText = MakeText("CloseHint", _inventoryPanel.transform,
            new Vector2(1, 1), new Vector2(1, 1),
            new Vector2(-120, -40), new Vector2(-20, -8),
            14, UnityEngine.TextAnchor.MiddleRight);
        closeText.text = "Press I to close";
        closeText.color = new Color32(150, 150, 150, 200);

        // Content area
        GameObject contentArea = new GameObject("ContentArea", typeof(RectTransform));
        contentArea.transform.SetParent(_inventoryPanel.transform, false);
        RectTransform cRT = contentArea.GetComponent<RectTransform>();
        cRT.anchorMin = new Vector2(0, 0);
        cRT.anchorMax = new Vector2(1, 1);
        cRT.offsetMin = new Vector2(20, 16);
        cRT.offsetMax = new Vector2(-20, -48);

        _inventoryCanvas.gameObject.SetActive(false);
    }

    public void AddItem(string itemId, string itemName)
    {
        if (_items.ContainsKey(itemId))
            _items[itemId]++;
        else
            _items[itemId] = 1;
    }

    public void AddFragment(string fragmentText)
    {
        _fragments.Add(fragmentText);
    }

    public void AddAffection(string characterId, int amount)
    {
        if (_affection.ContainsKey(characterId))
            _affection[characterId] += amount;
        else
            _affection[characterId] = amount;
    }

    public void UnlockLore(string loreId, string loreText)
    {
        if (!_lore.ContainsKey(loreId))
            _lore.Add(loreId, loreText);
    }

    public void UnlockSystem(string systemId)
    {
        _unlockedSystems.Add(systemId);
    }

    public bool HasItem(string itemId) => _items.ContainsKey(itemId);
    public bool HasLore(string loreId) => _lore.ContainsKey(loreId);
    public bool HasSystem(string systemId) => _unlockedSystems.Contains(systemId);
    public int GetAffection(string characterId) => _affection.GetValueOrDefault(characterId, 0);
    public void SetAffection(string characterId, int value) { _affection[characterId] = value; }
    public int GetItemCount(string itemId) => _items.GetValueOrDefault(itemId, 0);
    public int FragmentCount => _fragments.Count;

    private void Update()
    {
        if (Input.GetKeyDown(KeyCode.I))
        {
            ToggleInventory();
        }
    }

    private void ToggleInventory()
    {
        _inventoryOpen = !_inventoryOpen;
        _inventoryCanvas.gameObject.SetActive(_inventoryOpen);

        if (_inventoryOpen)
        {
            RefreshContent();
        }
    }

    private void RefreshContent()
    {
        // Find content area and rebuild
        Transform contentArea = _inventoryPanel.transform.Find("ContentArea");
        if (contentArea == null) return;

        // Clear old content
        foreach (Transform child in contentArea)
            Destroy(child.gameObject);

        float yOffset = 0;

        // Items section
        AddSectionHeader(contentArea, "Items", ref yOffset);
        foreach (var kvp in _items)
        {
            AddContentLine(contentArea, $"  {kvp.Key}: {kvp.Value}x", ref yOffset);
        }

        // Fragments section
        AddSectionHeader(contentArea, "Inspiration Fragments", ref yOffset);
        foreach (string f in _fragments)
        {
            string display = f.Length > 50 ? f.Substring(0, 50) + "..." : f;
            AddContentLine(contentArea, $"  ✦ {display}", ref yOffset);
        }

        // Characters section
        AddSectionHeader(contentArea, "Relationships", ref yOffset);
        foreach (var kvp in _affection)
        {
            string bar = new string('█', Mathf.Clamp(kvp.Value, 0, 10)) + new string('░', Mathf.Clamp(10 - kvp.Value, 0, 10));
            AddContentLine(contentArea, $"  {kvp.Key}: {bar} ({kvp.Value})", ref yOffset);
        }

        // Lore section
        AddSectionHeader(contentArea, "Lore Discovered", ref yOffset);
        foreach (var kvp in _lore)
        {
            string display = kvp.Value.Length > 60 ? kvp.Value.Substring(0, 60) + "..." : kvp.Value;
            AddContentLine(contentArea, $"  📖 {display}", ref yOffset);
        }

        // Unlocked systems
        AddSectionHeader(contentArea, "Systems Unlocked", ref yOffset);
        foreach (string s in _unlockedSystems)
        {
            AddContentLine(contentArea, $"  ⚡ {s}", ref yOffset);
        }

        if (yOffset == 0)
        {
            AddContentLine(contentArea, "  (Nothing yet — explore the world!)", ref yOffset);
        }
    }

    private void AddSectionHeader(Transform parent, string text, ref float y)
    {
        UnityEngine.UI.Text t = MakeText($"Section_{y}", parent,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(0, -y - 28), new Vector2(0, -y),
            20, UnityEngine.TextAnchor.LowerLeft);
        t.text = $"── {text} ──";
        t.fontStyle = UnityEngine.FontStyle.Bold;
        t.color = new Color32(236, 180, 87, 255);
        y += 32;
    }

    private void AddContentLine(Transform parent, string text, ref float y)
    {
        UnityEngine.UI.Text t = MakeText($"Line_{y}", parent,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(0, -y - 22), new Vector2(0, -y),
            16, UnityEngine.TextAnchor.LowerLeft);
        t.text = text;
        t.color = new Color32(200, 195, 185, 255);
        y += 24;
    }

    private UnityEngine.UI.Text MakeText(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        Vector2 offsetMin, Vector2 offsetMax, int fontSize, UnityEngine.TextAnchor alignment)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(UnityEngine.UI.Text));
        go.transform.SetParent(parent, false);
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = offsetMin;
        rt.offsetMax = offsetMax;

        UnityEngine.UI.Text text = go.GetComponent<UnityEngine.UI.Text>();
        text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = UnityEngine.HorizontalWrapMode.Wrap;
        text.verticalOverflow = UnityEngine.VerticalWrapMode.Truncate;
        return text;
    }
}