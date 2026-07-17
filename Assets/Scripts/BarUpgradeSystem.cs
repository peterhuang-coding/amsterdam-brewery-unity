using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

[System.Serializable]
public class BarUpgrade
{
    public string id;
    public string name;
    public string description;
    public int cost;
    public bool purchased;
}

public sealed class BarUpgradeSystem : MonoBehaviour
{
    // ── Singleton ──────────────────────────────────────────
    private static BarUpgradeSystem _instance;
    public static BarUpgradeSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("BarUpgradeSystem");
                _instance = go.AddComponent<BarUpgradeSystem>();
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    // ── Upgrade Data ───────────────────────────────────────
    private List<BarUpgrade> _upgrades = new List<BarUpgrade>
    {
        new BarUpgrade { id = "glassware", name = "Better Glassware", description = "Premium glassware increases drink prices by $1", cost = 50 },
        new BarUpgrade { id = "decor", name = "Cozy Decor", description = "Warm atmosphere increases tips by 20%", cost = 80 },
        new BarUpgrade { id = "training", name = "Staff Training", description = "Faster service speeds up customer patience by 30%", cost = 60 },
        new BarUpgrade { id = "premium", name = "Premium Menu", description = "Unlock premium drinks for $10 each", cost = 100 },
        new BarUpgrade { id = "loyalty", name = "Loyalty Program", description = "Regular customers appear 20% more often", cost = 40 },
    };

    // ── UI State ───────────────────────────────────────────
    private bool _panelOpen;
    private GameObject _panelRoot;
    private Font _font;

    private void Awake()
    {
        if (_instance != null && _instance != this)
        {
            Destroy(gameObject);
            return;
        }
        _instance = this;
        DontDestroyOnLoad(gameObject);
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
    }

    // ── Public API ─────────────────────────────────────────

    public void PurchaseUpgrade(string id)
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == id);
        if (upgrade == null)
        {
            Debug.LogWarning($"[BarUpgrade] Unknown upgrade id: {id}");
            return;
        }
        if (upgrade.purchased)
        {
            Debug.Log($"[BarUpgrade] {upgrade.name} already purchased.");
            return;
        }
        if (GameController.Instance == null)
        {
            Debug.LogWarning("[BarUpgrade] GameController.Instance is null, cannot deduct money.");
            return;
        }
        if (GameController.Instance.State.Money < upgrade.cost)
        {
            Debug.Log($"[BarUpgrade] Not enough money for {upgrade.name} (need ${upgrade.cost}).");
            return;
        }
        GameController.Instance.State.AddMoney(-upgrade.cost);
        upgrade.purchased = true;
        Debug.Log($"[BarUpgrade] Purchased: {upgrade.name} (${upgrade.cost})");
        RefreshPanel();
    }

    public bool IsPurchased(string id)
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == id);
        return upgrade != null && upgrade.purchased;
    }

    public int GetDrinkPriceBonus()
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == "glassware");
        return (upgrade != null && upgrade.purchased) ? 1 : 0;
    }

    public float GetTipMultiplier()
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == "decor");
        return (upgrade != null && upgrade.purchased) ? 1.2f : 1.0f;
    }

    public float GetServiceSpeedMultiplier()
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == "training");
        return (upgrade != null && upgrade.purchased) ? 1.3f : 1.0f;
    }

    public bool HasPremiumMenu()
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == "premium");
        return upgrade != null && upgrade.purchased;
    }

    public float GetLoyaltyBonus()
    {
        BarUpgrade upgrade = _upgrades.Find(u => u.id == "loyalty");
        return (upgrade != null && upgrade.purchased) ? 0.2f : 0.0f;
    }

    public int GetTotalUpgradeBonus()
    {
        int bonus = 0;
        if (GetDrinkPriceBonus() > 0) bonus += 1;
        return bonus;
    }

    public void TogglePanel()
    {
        if (_panelRoot == null)
        {
            BuildPanel();
        }
        _panelOpen = !_panelOpen;
        _panelRoot.SetActive(_panelOpen);
    }

    // ── Save/Load Interface ────────────────────────────────

    public List<string> GetSaveData()
    {
        List<string> purchasedIds = new List<string>();
        foreach (BarUpgrade upgrade in _upgrades)
        {
            if (upgrade.purchased)
            {
                purchasedIds.Add(upgrade.id);
            }
        }
        return purchasedIds;
    }

    public void LoadFromSave(List<string> purchasedIds)
    {
        foreach (string id in purchasedIds)
        {
            BarUpgrade upgrade = _upgrades.Find(u => u.id == id);
            if (upgrade != null)
            {
                upgrade.purchased = true;
            }
        }
    }

    /// <summary>
    /// Reset all upgrades for a new game.
    /// </summary>
    public void ResetAllUpgrades()
    {
        foreach (BarUpgrade upgrade in _upgrades)
            upgrade.purchased = false;
    }

    // ── UI Panel ───────────────────────────────────────────

    private void BuildPanel()
    {
        // Create root canvas for the panel
        GameObject canvasGo = new GameObject("UpgradePanelCanvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        canvasGo.transform.SetParent(transform, false);
        _panelRoot = canvasGo;

        Canvas canvas = canvasGo.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 200;

        CanvasScaler scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        scaler.matchWidthOrHeight = 0.5f;

        // Semi-transparent black background (click to close)
        Image bgImage = MakeImage("Panel Background", canvasGo.transform,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            new Color32(0, 0, 0, 160));
        Button bgButton = bgImage.gameObject.AddComponent<Button>();
        bgButton.onClick.AddListener(TogglePanel);
        bgButton.targetGraphic = bgImage;
        // Make button color same as image so the clickable area matches
        ColorBlock bgColors = bgButton.colors;
        bgColors.highlightedColor = new Color32(0, 0, 0, 160);
        bgColors.pressedColor = new Color32(0, 0, 0, 160);
        bgColors.selectedColor = new Color32(0, 0, 0, 160);
        bgButton.colors = bgColors;

        // Centered panel
        Image panelBg = MakeImage("Upgrade Panel", canvasGo.transform,
            new RectSpec(
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                new Vector2(-280, -280), new Vector2(280, 280)),
            new Color32(20, 24, 30, 245));

        // Panel border
        Image border = MakeImage("Panel Border", panelBg.transform,
            StretchFull(0, 0, 0, 0),
            new Color32(80, 85, 95, 100));

        // Title
        Text titleText = MakeText("Panel Title", panelBg.transform,
            new RectSpec(Vector2.zero, Vector2.one,
                new Vector2(20, -20), new Vector2(-20, -520)),
            28, TextAnchor.LowerLeft);
        titleText.text = "Bar Upgrades";
        titleText.fontStyle = FontStyle.Bold;
        titleText.color = new Color32(246, 240, 229, 255);

        // Money display
        Text moneyDisplay = MakeText("Money Display", panelBg.transform,
            new RectSpec(Vector2.zero, Vector2.one,
                new Vector2(20, -50), new Vector2(-20, -520)),
            18, TextAnchor.LowerLeft);
        moneyDisplay.text = $"Money: ${GetCurrentMoney()}";
        moneyDisplay.color = new Color32(160, 220, 120, 255);
        moneyDisplay.name = "MoneyDisplay";

        // Close button (X)
        Image closeBtn = MakeImage("Close Button", panelBg.transform,
            new RectSpec(Vector2.one, Vector2.one,
                new Vector2(-50, -50), new Vector2(-10, -10)),
            new Color32(180, 60, 60, 200));
        Button closeButton = closeBtn.gameObject.AddComponent<Button>();
        closeButton.onClick.AddListener(TogglePanel);
        Text closeText = MakeText("Close X", closeBtn.transform, StretchFull(4, 2, 4, 2), 20, TextAnchor.MiddleCenter);
        closeText.text = "X";
        closeText.color = new Color32(255, 255, 255, 255);
        closeText.fontStyle = FontStyle.Bold;

        // Upgrade list — build items
        float yOffset = -90;
        foreach (BarUpgrade upgrade in _upgrades)
        {
            BuildUpgradeItem(panelBg.transform, upgrade, yOffset);
            yOffset -= 90;
        }

        // Start hidden
        _panelRoot.SetActive(false);
    }

    private void BuildUpgradeItem(Transform parent, BarUpgrade upgrade, float yOffset)
    {
        // Item background row
        Image rowBg = MakeImage($"Row_{upgrade.id}", parent,
            new RectSpec(Vector2.zero, Vector2.one,
                new Vector2(20, yOffset - 70), new Vector2(-20, yOffset)),
            new Color32(40, 44, 52, 180));

        // Upgrade name
        Text nameText = MakeText($"Name_{upgrade.id}", rowBg.transform,
            new RectSpec(Vector2.zero, Vector2.one,
                new Vector2(14, 40), new Vector2(-220, 14)),
            20, TextAnchor.LowerLeft);
        nameText.text = upgrade.name;
        nameText.fontStyle = FontStyle.Bold;
        nameText.color = new Color32(246, 240, 229, 255);

        // Upgrade description
        Text descText = MakeText($"Desc_{upgrade.id}", rowBg.transform,
            new RectSpec(Vector2.zero, Vector2.one,
                new Vector2(14, 14), new Vector2(-220, 0)),
            14, TextAnchor.LowerLeft);
        descText.text = upgrade.description;
        descText.color = new Color32(180, 175, 165, 255);

        if (upgrade.purchased)
        {
            // Already purchased — show checkmark
            Text purchasedText = MakeText($"Status_{upgrade.id}", rowBg.transform,
                new RectSpec(Vector2.one, Vector2.one,
                    new Vector2(-120, 10), new Vector2(-14, -10)),
                18, TextAnchor.MiddleCenter);
            purchasedText.text = "✓ Purchased";
            purchasedText.color = new Color32(120, 160, 120, 200);
            purchasedText.fontStyle = FontStyle.Bold;
        }
        else
        {
            // Cost label
            Text costText = MakeText($"Cost_{upgrade.id}", rowBg.transform,
                new RectSpec(Vector2.one, Vector2.one,
                    new Vector2(-200, 10), new Vector2(-120, -10)),
                16, TextAnchor.MiddleCenter);
            costText.text = $"${upgrade.cost}";
            costText.color = new Color32(220, 200, 140, 255);
            costText.fontStyle = FontStyle.Bold;

            // Buy button
            int currentMoney = GetCurrentMoney();
            bool canAfford = currentMoney >= upgrade.cost;

            Color32 btnColor = canAfford
                ? new Color32(86, 125, 56, 255)
                : new Color32(60, 60, 65, 200);

            Image buyBtn = MakeImage($"BuyBtn_{upgrade.id}", rowBg.transform,
                new RectSpec(Vector2.one, Vector2.one,
                    new Vector2(-110, 10), new Vector2(-14, -10)),
                btnColor);

            Button button = buyBtn.gameObject.AddComponent<Button>();
            button.interactable = canAfford;
            string capturedId = upgrade.id;
            button.onClick.AddListener(() => PurchaseUpgrade(capturedId));

            // Dim the button color when not interactable
            ColorBlock colors = button.colors;
            colors.disabledColor = new Color32(60, 60, 65, 200);
            button.colors = colors;

            Text btnText = MakeText($"BuyText_{upgrade.id}", buyBtn.transform, StretchFull(6, 4, 6, 4), 16, TextAnchor.MiddleCenter);
            btnText.text = "Buy";
            btnText.color = canAfford
                ? new Color32(255, 255, 255, 255)
                : new Color32(140, 140, 140, 200);
            btnText.fontStyle = FontStyle.Bold;
        }
    }

    private void RefreshPanel()
    {
        if (_panelRoot == null) return;

        // Update money display
        Transform panelBg = _panelRoot.transform.Find("Upgrade Panel");
        if (panelBg != null)
        {
            Text moneyDisplay = panelBg.Find("Money Display")?.GetComponent<Text>();
            if (moneyDisplay != null)
            {
                moneyDisplay.text = $"Money: ${GetCurrentMoney()}";
            }
        }

        // Rebuild upgrade rows by destroying old ones and rebuilding
        // Find all rows (children of Upgrade Panel that start with "Row_")
        if (panelBg != null)
        {
            List<GameObject> rowsToDestroy = new List<GameObject>();
            foreach (Transform child in panelBg)
            {
                if (child.name.StartsWith("Row_"))
                {
                    rowsToDestroy.Add(child.gameObject);
                }
            }
            foreach (GameObject row in rowsToDestroy)
            {
                if (Application.isPlaying)
                    Destroy(row);
                else
                    DestroyImmediate(row);
            }

            // Rebuild upgrade items
            float yOffset = -90;
            foreach (BarUpgrade upgrade in _upgrades)
            {
                BuildUpgradeItem(panelBg, upgrade, yOffset);
                yOffset -= 90;
            }
        }
    }

    private int GetCurrentMoney()
    {
        if (GameController.Instance != null)
            return GameController.Instance.State.Money;
        return 0;
    }

    // ── UI Factory Helpers ────────────────────────────────

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

    private static RectSpec StretchFull(float l = 0, float b = 0, float r = 0, float t = 0) =>
        new RectSpec(Vector2.zero, Vector2.one, new Vector2(l, b), new Vector2(-r, -t));

    // ── Types ─────────────────────────────────────────────

    private readonly struct RectSpec
    {
        public readonly Vector2 anchorMin, anchorMax, offsetMin, offsetMax;
        public RectSpec(Vector2 amin, Vector2 amax, Vector2 omin, Vector2 omax)
        {
            anchorMin = amin; anchorMax = amax; offsetMin = omin; offsetMax = omax;
        }
    }
}
