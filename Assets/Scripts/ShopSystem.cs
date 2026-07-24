using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Shop system for Amsterdam Brewery.
/// Manages location-specific item purchasing with code-generated UI.
/// </summary>
[System.Serializable]
public class ShopItem
{
    public string id;
    public string name;
    public string description;
    public int cost;
    public string[] locations; // which locations sell this item
    public string[] effects;   // effect tags: energy, academic, sofie_affection, etc.
    public bool isOwned;
}

public class ShopSystem : MonoBehaviour
{
    private static ShopSystem _instance;
    public static ShopSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("ShopSystem");
                _instance = go.AddComponent<ShopSystem>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    private static readonly List<ShopItem> AllItems = new List<ShopItem>
    {
        new ShopItem { id = "coffee", name = "Coffee", description = "A warm pick-me-up from the market", cost = 5, locations = new[]{"de_pijp"}, effects = new[]{"energy"} },
        new ShopItem { id = "notebook", name = "Notebook", description = "For jotting down brew ideas", cost = 10, locations = new[]{"de_pijp", "science_park"}, effects = new[]{"academic"} },
        new ShopItem { id = "tulip", name = "Tulip Bouquet", description = "Fresh flowers for Sofie", cost = 15, locations = new[]{"bloemenmarkt"}, effects = new[]{"sofie_affection"} },
        new ShopItem { id = "whiskey", name = "Aged Whiskey", description = "A fine bottle for Erik", cost = 25, locations = new[]{"tweede_kans"}, effects = new[]{"erik_affection"} },
        new ShopItem { id = "labpass", name = "Lab Pass", description = "Access to Chen's lab", cost = 20, locations = new[]{"science_park"}, effects = new[]{"chen_affection"} },
        new ShopItem { id = "guide", name = "Amsterdam Guide", description = "Discover hidden spots", cost = 8, locations = new[]{"tweede_kans", "bloemenmarkt"}, effects = new[]{"explore"} },
    };

    private bool _shopOpen = false;
    public bool IsPanelOpen => _shopOpen;
    private Canvas _shopCanvas;
    private GameObject _shopPanel;
    private GameObject _contentArea;
    private Text _titleText;
    private Text _moneyText;
    private Text _closeHintText;
    private string _currentLocation;

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            if (Application.isPlaying) DontDestroyOnLoad(gameObject);
        }
        else if (_instance != this)
        {
            Object.Destroy(gameObject);
        }
    }

    private void Start()
    {
        CreateShopUI();
    }

    /// <summary>
    /// Returns items available for the given location.
    /// </summary>
    public List<ShopItem> GetItemsForLocation(string locationId)
    {
        List<ShopItem> result = new List<ShopItem>();
        foreach (var item in AllItems)
        {
            foreach (string loc in item.locations)
            {
                if (loc == locationId)
                {
                    result.Add(item);
                    break;
                }
            }
        }
        return result;
    }

    /// <summary>
    /// Attempt to purchase an item. Returns true if successful.
    /// </summary>
    public bool PurchaseItem(string itemId)
    {
        ShopItem item = AllItems.Find(i => i.id == itemId);
        if (item == null) return false;
        if (item.isOwned) return false;

        // Check money
        if (GameController.Instance.State.Money < item.cost) return false;

        // Deduct money
        GameController.Instance.State.AddMoney(-item.cost);

        // Mark as owned
        item.isOwned = true;

        // Apply effects
        ApplyItemEffects(item);

        // Show feedback
        if (GameController.Instance != null)
            GameController.Instance.ShowResultFeedback($"Purchased: {item.name}");

        // Refresh shop UI
        RefreshContent();

        return true;
    }

    /// <summary>
    /// Check if an item has been purchased.
    /// </summary>
    public bool IsItemOwned(string itemId)
    {
        ShopItem item = AllItems.Find(i => i.id == itemId);
        return item != null && item.isOwned;
    }

    /// <summary>
    /// Reset all owned states (used by SaveSystem on new game / load).
    /// </summary>
    public void ResetOwned()
    {
        foreach (ShopItem item in AllItems)
        {
            item.isOwned = false;
        }
    }

    /// <summary>
    /// Mark an item as owned without deducting money (used by SaveSystem on load).
    /// </summary>
    public void MarkItemOwned(string itemId)
    {
        ShopItem item = AllItems.Find(i => i.id == itemId);
        if (item != null)
        {
            item.isOwned = true;
        }
    }

    /// <summary>
    /// Toggle shop panel open/closed.
    /// </summary>
    public void TogglePanel()
    {
        _shopOpen = !_shopOpen;
        _shopCanvas.gameObject.SetActive(_shopOpen);

        if (_shopOpen)
        {
            _currentLocation = GameController.Instance.State.CurrentLocationId;
            RefreshContent();
            StartCoroutine(AnimatePanelIn());
        }
    }

    /// <summary>
    /// Opens the shop for a specific location.
    /// </summary>
    public void OpenShopForLocation(string locationId)
    {
        _currentLocation = locationId;
        _shopOpen = true;
        _shopCanvas.gameObject.SetActive(true);
        RefreshContent();
        StartCoroutine(AnimatePanelIn());
    }

    private void ApplyItemEffects(ShopItem item)
    {
        foreach (string effect in item.effects)
        {
            switch (effect)
            {
                case "energy":
                    // Coffee: add to inventory
                    if (InventorySystem.Instance != null)
                        InventorySystem.Instance.AddItem(item.id, item.name);
                    break;
                case "academic":
                    // Notebook: add to inventory
                    if (InventorySystem.Instance != null)
                        InventorySystem.Instance.AddItem(item.id, item.name);
                    break;
                case "sofie_affection":
                    // Tulip: increase Sofie affection
                    if (InventorySystem.Instance != null)
                    {
                        int currentSofie = InventorySystem.Instance.GetAffection("sofie");
                        InventorySystem.Instance.SetAffection("sofie", currentSofie + 2);
                    }
                    if (GameController.Instance != null)
                        GameController.Instance.ShowResultFeedback("Sofie affection +2");
                    break;
                case "erik_affection":
                    // Whiskey: increase Erik affection
                    if (InventorySystem.Instance != null)
                    {
                        int currentErik = InventorySystem.Instance.GetAffection("erik");
                        InventorySystem.Instance.SetAffection("erik", currentErik + 2);
                    }
                    if (GameController.Instance != null)
                        GameController.Instance.ShowResultFeedback("Erik affection +2");
                    break;
                case "chen_affection":
                    // Lab Pass: increase Chen affection
                    if (InventorySystem.Instance != null)
                    {
                        int currentChen = InventorySystem.Instance.GetAffection("chen");
                        InventorySystem.Instance.SetAffection("chen", currentChen + 2);
                    }
                    if (GameController.Instance != null)
                        GameController.Instance.ShowResultFeedback("Chen affection +2");
                    break;
                case "explore":
                    // Guide: add to inventory
                    if (InventorySystem.Instance != null)
                        InventorySystem.Instance.AddItem(item.id, item.name);
                    break;
            }
        }
    }

    private void CreateShopUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("ShopCanvas");
        canvasGO.transform.SetParent(transform);
        _shopCanvas = canvasGO.AddComponent<Canvas>();
        _shopCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _shopCanvas.sortingOrder = 200;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        // Semi-transparent overlay
        GameObject overlay = new GameObject("Overlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        overlay.transform.SetParent(_shopCanvas.transform, false);
        Image overlayImg = overlay.GetComponent<Image>();
        overlayImg.color = new Color32(0, 0, 0, 180);
        RectTransform oRT = overlay.GetComponent<RectTransform>();
        oRT.anchorMin = Vector2.zero;
        oRT.anchorMax = Vector2.one;
        oRT.offsetMin = Vector2.zero;
        oRT.offsetMax = Vector2.zero;

        // Panel (initially positioned below screen for slide-in)
        _shopPanel = new GameObject("ShopPanel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _shopPanel.transform.SetParent(_shopCanvas.transform, false);
        Image panelImg = _shopPanel.GetComponent<Image>();
        panelImg.color = new Color32(20, 24, 30, 240);
        RectTransform pRT = _shopPanel.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.15f, 0.1f);
        pRT.anchorMax = new Vector2(0.85f, 0.9f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;

        // Store initial anchored position for slide animation
        Vector2 targetPos = pRT.anchoredPosition;
        pRT.anchoredPosition = targetPos + new Vector2(0, -Screen.height * 0.5f);

        // Title
        _titleText = MakeText("Title", _shopPanel.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(20, -40), new Vector2(-20, -4),
            28, TextAnchor.MiddleLeft);
        _titleText.text = "Shop";
        _titleText.fontStyle = FontStyle.Bold;

        // Money display
        _moneyText = MakeText("MoneyDisplay", _shopPanel.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(20, -70), new Vector2(-20, -40),
            16, TextAnchor.MiddleLeft);
        _moneyText.color = new Color32(160, 220, 120, 255);
        _moneyText.fontStyle = FontStyle.Bold;

        // Close button (X)
        var closeBtnImg = UIFactory.MakeImage("Close Button", _shopPanel.transform,
            UIFactory.Anchored(480, 8, 32, 32), new Color32(60, 40, 30, 220));
        Button closeButton = closeBtnImg.gameObject.AddComponent<Button>();
        closeButton.onClick.AddListener(TogglePanel);
        UIFactory.MakeText("Close X", closeBtnImg.transform, UIFactory.StretchFull(2, 1, 2, 1),
            18, TextAnchor.MiddleCenter).text = "✕";

        // Content area
        _contentArea = new GameObject("ContentArea", typeof(RectTransform));
        _contentArea.transform.SetParent(_shopPanel.transform, false);
        RectTransform cRT = _contentArea.GetComponent<RectTransform>();
        cRT.anchorMin = new Vector2(0, 0);
        cRT.anchorMax = new Vector2(1, 1);
        cRT.offsetMin = new Vector2(20, 16);
        cRT.offsetMax = new Vector2(-20, -80);

        _shopCanvas.gameObject.SetActive(false);
    }

    private void RefreshContent()
    {
        if (_contentArea == null) return;

        // Clear old content
        foreach (Transform child in _contentArea.transform)
            Object.Destroy(child.gameObject);

        // Update title with location
        string locationName = "";
        if (GameController.Instance != null)
        {
            locationName = GameController.Instance.State.CurrentLocationName;
        }
        if (string.IsNullOrEmpty(locationName))
            locationName = _currentLocation;

        _titleText.text = $"Shop — {locationName}";

        // Update money
        if (GameController.Instance != null)
        {
            _moneyText.text = $"Current Money: ${GameController.Instance.State.Money}";
        }

        // Get items for current location
        string locationId = _currentLocation;
        if (GameController.Instance != null && !string.IsNullOrEmpty(GameController.Instance.State.CurrentLocationId))
        {
            locationId = GameController.Instance.State.CurrentLocationId;
        }

        List<ShopItem> availableItems = GetItemsForLocation(locationId);

        float yOffset = 0;

        if (availableItems.Count == 0)
        {
            Text emptyText = MakeText("EmptyMsg", _contentArea.transform,
                new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(0, -yOffset - 28), new Vector2(0, -yOffset),
                18, TextAnchor.UpperLeft);
            emptyText.text = "Nothing for sale here.";
            emptyText.color = new Color32(150, 150, 150, 200);
            return;
        }

        foreach (ShopItem item in availableItems)
        {
            CreateShopItemRow(_contentArea.transform, item, ref yOffset);
        }
    }

    private void CreateShopItemRow(Transform parent, ShopItem item, ref float yOffset)
    {
        float rowHeight = 60f;

        // Item background
        GameObject rowBg = new GameObject("Row_" + item.id, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        rowBg.transform.SetParent(parent, false);
        Image bgImg = rowBg.GetComponent<Image>();
        bgImg.color = new Color32(40, 44, 52, 200);
        RectTransform bgRT = rowBg.GetComponent<RectTransform>();
        bgRT.anchorMin = new Vector2(0, 1);
        bgRT.anchorMax = new Vector2(1, 1);
        bgRT.offsetMin = new Vector2(0, -yOffset - rowHeight);
        bgRT.offsetMax = new Vector2(0, -yOffset);

        // Item icon/name
        Text nameText = MakeText("Name", rowBg.transform,
            new Vector2(0, 0), new Vector2(0.45f, 1),
            new Vector2(12, 6), new Vector2(0, -4),
            18, TextAnchor.MiddleLeft);
        nameText.text = item.name;
        nameText.fontStyle = FontStyle.Bold;

        // Item description
        Text descText = MakeText("Desc", rowBg.transform,
            new Vector2(0, 0), new Vector2(0.7f, 1),
            new Vector2(12, 4), new Vector2(0, -24),
            13, TextAnchor.MiddleLeft);
        descText.text = item.description;
        descText.color = new Color32(180, 175, 165, 220);

        if (item.isOwned)
        {
            // Owned label
            Text ownedText = MakeText("Owned", rowBg.transform,
                new Vector2(0.7f, 0), new Vector2(1, 1),
                new Vector2(0, 0), new Vector2(-12, 0),
                16, TextAnchor.MiddleRight);
            ownedText.text = "Owned";
            ownedText.color = new Color32(120, 120, 120, 200);
            ownedText.fontStyle = FontStyle.Bold;
        }
        else
        {
            // Price
            Text priceText = MakeText("Price", rowBg.transform,
                new Vector2(0.7f, 0), new Vector2(0.85f, 1),
                new Vector2(0, 0), new Vector2(-4, 0),
            16, TextAnchor.MiddleRight);
            priceText.text = $"${item.cost}";
            priceText.color = new Color32(236, 180, 87, 255);
            priceText.fontStyle = FontStyle.Bold;

            // Buy button
            GameObject btnGO = new GameObject("BuyBtn_" + item.id, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            btnGO.transform.SetParent(rowBg.transform, false);
            RectTransform btnRT = btnGO.GetComponent<RectTransform>();
            btnRT.anchorMin = new Vector2(0.85f, 0);
            btnRT.anchorMax = new Vector2(1, 1);
            btnRT.offsetMin = new Vector2(4, 8);
            btnRT.offsetMax = new Vector2(-8, -8);

            bool canAfford = GameController.Instance != null && GameController.Instance.State.Money >= item.cost;
            Image btnImg = btnGO.GetComponent<Image>();
            btnImg.color = canAfford ? new Color32(86, 125, 56, 255) : new Color32(80, 80, 80, 180);

            Button btn = btnGO.AddComponent<Button>();
            btn.interactable = canAfford;

            // Remove default transition to avoid missing assets
            btn.transition = Selectable.Transition.None;

            // Button text
            Text btnText = MakeText("BtnText", btnGO.transform,
                new Vector2(0, 0), new Vector2(1, 1),
                new Vector2(2, 2), new Vector2(-2, -2),
                14, TextAnchor.MiddleCenter);
            btnText.text = "Buy";
            btnText.color = canAfford ? new Color32(255, 255, 255, 255) : new Color32(120, 120, 120, 200);
            btnText.fontStyle = FontStyle.Bold;

            // Add click handler
            string capturedId = item.id;
            btn.onClick.AddListener(() => OnBuyButton(capturedId));
        }

        yOffset += rowHeight + 4f;
    }

    private void OnBuyButton(string itemId)
    {
        PurchaseItem(itemId);
    }

    private IEnumerator AnimatePanelIn()
    {
        if (_shopPanel == null) yield break;
        RectTransform rt = _shopPanel.GetComponent<RectTransform>();
        Vector2 targetPos = new Vector2(0, 0); // Normal anchored position (center)
        float duration = 0.3f;

        // Start below screen
        rt.anchoredPosition = targetPos + new Vector2(0, -Screen.height * 0.5f);

        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = Mathf.Min(t / duration, 1f);
            float smooth = p * p * (3f - 2f * p); // Smoothstep
            rt.anchoredPosition = Vector2.Lerp(targetPos + new Vector2(0, -Screen.height * 0.5f), targetPos, smooth);
            yield return null;
        }
        rt.anchoredPosition = targetPos;
    }

    private Text MakeText(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        Vector2 offsetMin, Vector2 offsetMax, int fontSize, TextAnchor alignment)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = offsetMin;
        rt.offsetMax = offsetMax;

        Text text = go.GetComponent<Text>();
        text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }
}
