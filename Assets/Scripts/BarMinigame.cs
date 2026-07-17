using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections;
using System.Collections.Generic;

/// <summary>
/// Bar shift minigame — serve customers by matching their drink order.
/// Walk up to the bar counter and press B to start a shift.
/// </summary>
public class BarMinigame : MonoBehaviour
{
    private static BarMinigame _instance;
    public static BarMinigame Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("BarMinigame");
                _instance = go.AddComponent<BarMinigame>();
                DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    // ── Enums ──────────────────────────────────────────────
    private enum GuestType { Normal, Regular, Picky, Drunk, Group }
    private enum DrinkType { Beer, Whiskey, Wine }

    // ── Constants ──────────────────────────────────────────
    private readonly string[] _drinkNames = { "🍺 Beer", "🥃 Whiskey", "🍷 Wine" };
    private readonly string[] _drinkShortNames = { "Beer", "Whiskey", "Wine" };
    private readonly Color32[] _drinkColors = {
        new Color32(255, 200, 50, 255),
        new Color32(180, 120, 60, 255),
        new Color32(180, 50, 80, 255)
    };
    private readonly Color32[] _drinkColorsLight = {
        new Color32(255, 220, 100, 255),
        new Color32(210, 150, 90, 255),
        new Color32(210, 90, 120, 255)
    };
    private readonly int[] _drinkCosts = { 3, 5, 4 };
    private readonly int[] _drinkPrices = { 6, 8, 7 };

    private readonly Color32[] _guestColors = {
        new Color32(200, 200, 200, 255),
        new Color32(200, 180, 100, 255),
        new Color32(255, 100, 100, 255),
        new Color32(160, 120, 200, 255),
        new Color32(100, 180, 220, 255)
    };

    private readonly string[] _guestTypeLabels = {
        "Normal", "Regular", "Picky", "Drunk", "Group"
    };

    // ── Theme Colors ───────────────────────────────────────
    private static readonly Color32 DarkBrown = new Color32(35, 28, 22, 255);
    private static readonly Color32 MediumBrown = new Color32(55, 45, 35, 255);
    private static readonly Color32 LightBrown = new Color32(75, 60, 45, 255);
    private static readonly Color32 GoldColor = new Color32(255, 200, 50, 255);
    private static readonly Color32 WarmText = new Color32(246, 240, 229, 255);
    private static readonly Color32 GreenColor = new Color32(60, 200, 80, 255);
    private static readonly Color32 RedColor = new Color32(220, 60, 60, 255);
    private static readonly Color32 GreyColor = new Color32(120, 120, 120, 255);
    private static readonly Color32 DarkOverlay = new Color32(0, 0, 0, 200);

    // ── UI Fields ──────────────────────────────────────────
    private Canvas _canvas;
    private CanvasGroup _canvasGroup;
    private GameObject _background;
    private GameObject _flashOverlay;
    private GameObject _panel;
    private Text _earningsText;
    private Text _statusText;
    private Text _comboText;

    // ── Serving UI ─────────────────────────────────────────
    private Text _inventoryBeer;
    private Text _inventoryWhiskey;
    private Text _inventoryWine;
    private GameObject _customerBlock;
    private Image _customerImage;
    private Text _customerLabel;
    private Text _orderText;
    private Text _guestTypeText;
    private Image _patienceBar;
    private Text _patienceText;
    private GameObject[] _drinkBtns = new GameObject[3];
    private Button[] _drinkBtnComponents = new Button[3];

    // ── Inventory / Stocking ───────────────────────────────
    private int[] _stock = { 0, 0, 0 };
    private int _stockingCost = 0;
    private bool _isStocking = false;

    // ── Stocking UI ────────────────────────────────────────
    private GameObject _stockPanel;
    private Text[] _stockQtyTexts = new Text[3];
    private Text _stockCostText;
    private Text _playerMoneyText;

    // ── Game State ─────────────────────────────────────────
    private int _customersServed = 0;
    private int _totalCustomers = 0;
    private int _earnings = 0;
    private int _tips = 0;
    private int _currentDrink = -1;
    private bool _isActive = false;
    private bool _isServing = false;
    private bool _apologyMode = false;
    private float _apologyTipMultiplier = 1.0f;
    private System.Action<int> _onComplete;

    // ── Guest State ────────────────────────────────────────
    private GuestType _currentGuestType;
    private int _correctCount = 0;
    private float _patienceTimer = 0f;
    private float _patienceMax = 5f;
    private bool _hasPatience = false;
    private int _groupCount = 0;
    private int _groupIndex = 0;

    // ── Combo ──────────────────────────────────────────────
    private int _comboCount = 0;

    // ── Upgrade State ───────────────────────────────────────
    private int _upgradeBonus = 0;
    private float _tipMultiplier = 1.0f;
    private float _serviceSpeed = 1.0f;
    private bool _hasPremiumMenu = false;
    private float _loyaltyBonus = 0.0f;

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

    private void Update()
    {
        if (!_isActive) return;

        // Patience countdown for Picky guests
        if (_isServing && _hasPatience && _currentGuestType == GuestType.Picky)
        {
            _patienceTimer -= Time.deltaTime / _serviceSpeed;
            if (_patienceBar != null)
            {
                float fill = Mathf.Clamp01(_patienceTimer / _patienceMax);
                _patienceBar.fillAmount = fill;
                // Color shift: green -> yellow -> red
                if (fill > 0.5f)
                    _patienceBar.color = Color32.Lerp(new Color32(220, 220, 60, 255), GreenColor, (fill - 0.5f) * 2f);
                else
                    _patienceBar.color = Color32.Lerp(RedColor, new Color32(220, 220, 60, 255), fill * 2f);
            }
            if (_patienceTimer <= 0f)
            {
                _orderText.text = "😤 Too slow! I'm leaving!";
                _orderText.color = RedColor;
                _hasPatience = false;
                _currentDrink = -1;
                _isServing = false;
                if (_patienceBar != null)
                    _patienceBar.fillAmount = 0f;
                StartCoroutine(NextCustomerAfterDelay(0.5f));
            }
        }

        // Check stock for button interactability
        if (_isServing && _panel != null && _panel.activeInHierarchy)
        {
            for (int i = 0; i < 3; i++)
            {
                if (_drinkBtnComponents[i] != null)
                {
                    bool hasStock = _stock[i] > 0;
                    if (GameController.Instance != null)
                        hasStock = GameController.Instance.State.GetBrewStock(i) > 0 || _stock[i] > 0;
                    _drinkBtnComponents[i].interactable = hasStock;
                    Image img = _drinkBtns[i].GetComponent<Image>();
                    if (img != null) img.color = hasStock ? _drinkColors[i] : GreyColor;
                }
            }
        }
    }

    // ── Entry Point ────────────────────────────────────────

    /// <summary>
    /// Start a bar shift with a completion callback (used by other systems).
    /// </summary>
    public void StartShift(System.Action<int> onComplete)
    {
        if (_isActive) return;
        _isActive = true;
        _onComplete = onComplete;
        InitShiftState();

        // Stock is now managed by GameState (from BrewingSystem)
        // Keep local copy for shift tracking
        if (GameController.Instance != null)
        {
            _stock[0] = GameController.Instance.State.GetBrewStock(0);
            _stock[1] = GameController.Instance.State.GetBrewStock(1);
            _stock[2] = GameController.Instance.State.GetBrewStock(2);
        }
        _stockingCost = 0;

        BuildCanvas();
        ShowStockingUI();

        // [Tutorial] Notify tutorial system that bar was opened
        if (Application.isPlaying && TutorialSystem.Instance != null)
            TutorialSystem.Instance.OnBarOpened();
    }

    public void StartShift()
    {
        StartShift(null);
    }

    // ── Public API for GameController / HUD ────────────────

    /// <summary>True when a bar shift is in progress.</summary>
    public bool IsShiftActive => _isActive;

    /// <summary>Number of customers served in the current/last shift.</summary>
    public int CustomersServed => _customersServed;

    /// <summary>Earnings (revenue + tips) from the current/last shift.</summary>
    public int ShiftEarnings => _earnings + _tips;

    /// <summary>Current bar stock levels [Beer, Whiskey, Wine].</summary>
    public int[] GetStockLevels()
    {
        return new int[] { _stock[0], _stock[1], _stock[2] };
    }

    /// <summary>
    /// Reset shift statistics (used by SaveSystem on load for saves without active shift).
    /// </summary>
    public void ResetShiftStats()
    {
        _isActive = false;
        _customersServed = 0;
        _earnings = 0;
        _tips = 0;
        _correctCount = 0;
        _comboCount = 0;
        _apologyTipMultiplier = 1.0f;
        _apologyMode = false;
    }

    // ── Shift state accessors for save/load ────────────────

    public int ShiftEarningsRaw => _earnings;
    public int ShiftTips => _tips;
    public int ShiftComboCount => _comboCount;
    public int ShiftCorrectCount => _correctCount;
    public float ShiftApologyTipMultiplier => _apologyTipMultiplier;
    public bool ShiftApologyMode => _apologyMode;

    /// <summary>
    /// Restore shift state from a mid-shift save and complete the shift silently,
    /// recording earnings and customers-served into GameState totals.
    /// Called by SaveSystem.LoadFromSlot when the save was made during an active shift.
    /// </summary>
    public void RestoreAndCompleteShift(int served, int earnings, int tips, int correctCount,
        int comboCount, float apologyTipMultiplier, bool apologyMode)
    {
        if (served <= 0) return;

        // Temporarily restore the shift state so EndShift(false) can record the progress
        _isActive = true;
        _isServing = true;
        _customersServed = served;
        _earnings = earnings;
        _tips = tips;
        _correctCount = correctCount;
        _comboCount = comboCount;
        _apologyTipMultiplier = apologyTipMultiplier;
        _apologyMode = apologyMode;
        EndShift(showSettlement: false);
    }

    /// <summary>
    /// End the current shift early (public, called by key input).
    /// When showSettlement is true (default), displays the shift settlement summary
    /// with star rating and stats. Pass false for silent cleanup (e.g. StartNewGame).
    /// </summary>
    public void EndShift(bool showSettlement = true)
    {
        if (!_isActive) return;

        // If still stocking, cancel
        if (_isStocking)
        {
            CancelStocking();
            return;
        }

        // During serving: either show settlement or clean up silently
        if (_isServing)
        {
            if (showSettlement)
            {
                EndShiftAndShowSettlement();
            }
            else
            {
                // Silent cleanup: track stats but skip settlement UI
                _isServing = false;
                _isActive = false;

                int grossRevenue = _earnings + _tips;

                // Track totals in GameState for end-game stats (mirrors EndShiftAndShowSettlement)
                if (GameController.Instance != null)
                {
                    GameController.Instance.State.TotalCustomersServed += _correctCount;
                    GameController.Instance.State.TotalRevenue += grossRevenue;
                }

                GameController.Instance.State.AddMoney(grossRevenue);

                // [Gameplay] Daily revenue achievement check
                if (Application.isPlaying && AchievementSystem.Instance != null)
                    AchievementSystem.Instance.RegisterDailyRevenue(grossRevenue);

                _onComplete?.Invoke(grossRevenue);
                _onComplete = null;

                if (_canvas != null)
                {
                    Destroy(_canvas.gameObject);
                }
            }
            return;
        }

        // Non-serving active state: just clean up
        _isActive = false;

        _onComplete?.Invoke(0);
        _onComplete = null;

        if (_canvas != null)
        {
            Destroy(_canvas.gameObject);
        }
    }

    // ── Shift State Init ───────────────────────────────────

    private void InitShiftState()
    {
        _customersServed = 0;
        _earnings = 0;
        _tips = 0;
        _comboCount = 0;
        _correctCount = 0;
        _apologyTipMultiplier = 1.0f;
        _apologyMode = false;
        _totalCustomers = Mathf.RoundToInt(Random.Range(5f, 9f) * _serviceSpeed);

        // [Gameplay] Apply upgrade bonuses
        if (BarUpgradeSystem.Instance != null)
        {
            _upgradeBonus = (int)BarUpgradeSystem.Instance.GetDrinkPriceBonus();
            _tipMultiplier = BarUpgradeSystem.Instance.GetTipMultiplier();
            _serviceSpeed = BarUpgradeSystem.Instance.GetServiceSpeedMultiplier();
            _hasPremiumMenu = BarUpgradeSystem.Instance.HasPremiumMenu();
            _loyaltyBonus = BarUpgradeSystem.Instance.GetLoyaltyBonus();
        }
        else
        {
            _upgradeBonus = 0;
            _tipMultiplier = 1.0f;
            _serviceSpeed = 1.0f;
            _hasPremiumMenu = false;
            _loyaltyBonus = 0.0f;
        }
    }

    // ── Canvas Build ───────────────────────────────────────
    private void BuildCanvas()
    {
        GameObject canvasGO = new GameObject("BarCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 200;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        _canvasGroup = canvasGO.AddComponent<CanvasGroup>();

        // Background overlay
        _background = new GameObject("Background", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _background.transform.SetParent(_canvas.transform, false);
        Image bgImg = _background.GetComponent<Image>();
        bgImg.color = DarkOverlay;
        RectTransform bgRT = _background.GetComponent<RectTransform>();
        bgRT.anchorMin = Vector2.zero;
        bgRT.anchorMax = Vector2.one;
        bgRT.offsetMin = Vector2.zero;
        bgRT.offsetMax = Vector2.zero;

        // Flash overlay (for correct/wrong feedback)
        _flashOverlay = new GameObject("FlashOverlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _flashOverlay.transform.SetParent(_canvas.transform, false);
        Image flashImg = _flashOverlay.GetComponent<Image>();
        flashImg.color = new Color32(0, 0, 0, 0);
        RectTransform flashRT = _flashOverlay.GetComponent<RectTransform>();
        flashRT.anchorMin = Vector2.zero;
        flashRT.anchorMax = Vector2.one;
        flashRT.offsetMin = Vector2.zero;
        flashRT.offsetMax = Vector2.zero;
        _flashOverlay.SetActive(false);
    }

    // ── Stocking UI ────────────────────────────────────────
    private void ShowStockingUI()
    {
        _isStocking = true;
        _stockPanel = BuildStockPanel();
        _stockPanel.SetActive(true);

        // Fade in
        StartCoroutine(FadePanel(_stockPanel, 0f, 1f, 0.2f));
    }

    private GameObject BuildStockPanel()
    {
        GameObject panel = CreatePanel("StockPanel", MediumBrown, new Vector2(0.2f, 0.12f), new Vector2(0.8f, 0.88f));

        // Title bar
        GameObject titleBar = CreateBar("TitleBar", panel.transform, new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(0, -50), new Vector2(0, 0), DarkBrown);
        _ = CreateTextOn("TitleText", titleBar.transform, "🛒 Restock Supplies",
            new Vector2(0, 0), new Vector2(1, 1), new Vector2(12, 4), new Vector2(-12, -4),
            22, TextAnchor.MiddleLeft, FontStyle.Bold, GoldColor);

        // Player money
        _playerMoneyText = CreateTextOn("PlayerMoney", panel.transform,
            $"Your Money: ${GameController.Instance.State.Money}",
            new Vector2(0.1f, 0.78f), new Vector2(0.9f, 0.86f), Vector2.zero, Vector2.zero,
            14, TextAnchor.MiddleCenter, FontStyle.Normal, new Color32(200, 190, 170, 255));

        // Drink cards
        for (int i = 0; i < 3; i++)
        {
            int idx = i;
            float xMin = 0.05f + i * 0.32f;
            float xMax = xMin + 0.27f;

            // Card background
            GameObject card = CreateBar($"Card_{i}", panel.transform,
                new Vector2(xMin, 0.28f), new Vector2(xMax, 0.72f),
                Vector2.zero, Vector2.zero, DarkBrown);

            // Icon emoji
            _ = CreateTextOn($"Icon_{i}", card.transform, _drinkNames[i].Substring(0, 2),
                new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -28), new Vector2(0, -6),
                24, TextAnchor.MiddleCenter, FontStyle.Normal, _drinkColors[i]);

            // Name
            _ = CreateTextOn($"Name_{i}", card.transform, _drinkShortNames[i],
                new Vector2(0, 0.55f), new Vector2(1, 0.75f), Vector2.zero, Vector2.zero,
                16, TextAnchor.MiddleCenter, FontStyle.Bold, WarmText);

            // Price
            _ = CreateTextOn($"Price_{i}", card.transform, $"${_drinkCosts[i]}/ea",
                new Vector2(0, 0.35f), new Vector2(1, 0.55f), Vector2.zero, Vector2.zero,
                12, TextAnchor.MiddleCenter, FontStyle.Normal, GoldColor);

            // Quantity display
            _stockQtyTexts[i] = CreateTextOn($"Qty_{i}", card.transform, "x0",
                new Vector2(0, 0.12f), new Vector2(1, 0.32f), Vector2.zero, Vector2.zero,
                20, TextAnchor.MiddleCenter, FontStyle.Bold, WarmText);

            // [-] button
            _ = CreateButton($"MinusBtn_{i}", card.transform,
                new Vector2(0.08f, 0.0f), new Vector2(0.35f, 0.12f),
                LightBrown, LightBrown, "−", 18, () => {
                    AdjustStock(idx, -1);
                });

            // [+] button
            _ = CreateButton($"PlusBtn_{i}", card.transform,
                new Vector2(0.65f, 0.0f), new Vector2(0.92f, 0.12f),
                GreenColor, new Color32(100, 240, 120, 255), "+", 20, () => {
                    AdjustStock(idx, 1);
                });
        }

        // Total cost (gold highlight)
        _stockCostText = CreateTextOn("StockCost", panel.transform, "Total: $0",
            new Vector2(0.1f, 0.08f), new Vector2(0.6f, 0.20f), Vector2.zero, Vector2.zero,
            22, TextAnchor.MiddleLeft, FontStyle.Bold, GoldColor);

        // Cancel button
        _ = CreateButton("CancelBtn", panel.transform,
            new Vector2(0.62f, 0.06f), new Vector2(0.78f, 0.18f),
            GreyColor, new Color32(150, 150, 150, 255), "Cancel", 16, () => {
                CancelStocking();
            });

        // Confirm button (green)
        _ = CreateButton("ConfirmBtn", panel.transform,
            new Vector2(0.82f, 0.06f), new Vector2(0.96f, 0.18f),
            GreenColor, new Color32(100, 240, 120, 255), "✅ Confirm", 16, () => {
                ConfirmStocking();
            });

        return panel;
    }

    private void AdjustStock(int drinkIndex, int delta)
    {
        int newQty = _stock[drinkIndex] + delta;
        if (newQty < 0) return;

        int costDelta = delta * _drinkCosts[drinkIndex];
        int currentMoney = GameController.Instance.State.Money;
        int newCost = _stockingCost + costDelta;
        if (delta > 0 && newCost > currentMoney)
        {
            _stockCostText.text = "Not enough money!";
            _stockCostText.color = RedColor;
            StartCoroutine(ResetStockCostText());
            return;
        }

        _stock[drinkIndex] = newQty;
        _stockingCost = newCost;
        _stockQtyTexts[drinkIndex].text = $"x{newQty}";
        _stockCostText.text = $"Total: ${_stockingCost}";
        _stockCostText.color = GoldColor;
        _playerMoneyText.text = $"Your Money: ${GameController.Instance.State.Money}  |  Cost: ${_stockingCost}";
        SoundManager.Play(SoundManager.SoundType.UIClick);
    }

    private IEnumerator ResetStockCostText()
    {
        yield return new WaitForSeconds(1.0f);
        if (_stockCostText != null)
        {
            _stockCostText.text = $"Total: ${_stockingCost}";
            _stockCostText.color = GoldColor;
        }
    }

    private void ConfirmStocking()
    {
        // Sync local stock back to GameState
        if (GameController.Instance != null)
        {
            GameController.Instance.State.SetBrewStock(0, _stock[0]);
            GameController.Instance.State.SetBrewStock(1, _stock[1]);
            GameController.Instance.State.SetBrewStock(2, _stock[2]);
        }

        // If stocking cost is 0 (e.g. brew stock is empty), transition to serve
        // without deducting money. Must still clean up panel or player is softlocked.
        if (_stockingCost <= 0)
        {
            Destroy(_stockPanel);
            _stockPanel = null;
            _isStocking = false;

            // If every drink is at 0, auto-end shift: a dead serve UI is confusing UX.
            if (_stock[0] == 0 && _stock[1] == 0 && _stock[2] == 0)
            {
                _isActive = false;
                var cb = _onComplete;
                _onComplete = null;
                if (_canvas != null) Destroy(_canvas.gameObject);
                cb?.Invoke(0);
                return;
            }

            BuildServeUI();
            return;
        }

        GameController.Instance.State.AddMoney(-_stockingCost);

        // Fade out stocking panel, then build serve UI when fade completes
        StartCoroutine(FadeThenServe(_stockPanel));
        _stockPanel = null;
        _isStocking = false;
    }

    private void CancelStocking()
    {
        _isStocking = false;
        _isActive = false;
        var cb = _onComplete;
        _onComplete = null;
        Destroy(_canvas.gameObject);
        cb?.Invoke(0);
    }

    // ── Serve UI ───────────────────────────────────────────
    private void BuildServeUI()
    {
        _panel = CreatePanel("ServePanel", MediumBrown, new Vector2(0.15f, 0.05f), new Vector2(0.85f, 0.95f));

        // ── Top inventory bar ──
        GameObject invBar = CreateBar("InventoryBar", _panel.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(0, -56), new Vector2(0, 0), DarkBrown);

        _ = CreateTextOn("InvTitle", invBar.transform, "🍺 Bar Inventory",
            new Vector2(0, 0), new Vector2(1, 1), new Vector2(12, 4), new Vector2(-12, -4),
            18, TextAnchor.MiddleLeft, FontStyle.Bold, GoldColor);

        // 3 stock blocks with color dots
        float[] stockX = { 0.55f, 0.72f, 0.89f };
        for (int i = 0; i < 3; i++)
        {
            GameObject block = CreateBar($"Stock_{i}", invBar.transform,
                new Vector2(stockX[i], 0.1f), new Vector2(stockX[i] + 0.12f, 0.9f),
                Vector2.zero, Vector2.zero, DarkBrown);
            // Color dot
            _ = CreateBar($"Dot_{i}", block.transform,
                new Vector2(0.1f, 0.5f), new Vector2(0.9f, 0.9f),
                Vector2.zero, Vector2.zero, _drinkColors[i]);

            Text stockText = CreateTextOn($"StockText_{i}", block.transform, "0",
                new Vector2(0, 0), new Vector2(1, 0.5f), new Vector2(2, 2), new Vector2(-2, -2),
                16, TextAnchor.MiddleCenter, FontStyle.Bold, WarmText);
            switch (i) { case 0: _inventoryBeer = stockText; break; case 1: _inventoryWhiskey = stockText; break; case 2: _inventoryWine = stockText; break; }
        }

        // Earnings display (top right)
        _earningsText = CreateTextOn("Earnings", _panel.transform,
            "Revenue: $0  |  Tips: $0",
            new Vector2(0.5f, 0.88f), new Vector2(0.98f, 0.96f), Vector2.zero, Vector2.zero,
            16, TextAnchor.MiddleRight, FontStyle.Bold, GoldColor);

        // Combo text
        _comboText = CreateTextOn("ComboText", _panel.transform, "",
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
            new Vector2(-100, 120), new Vector2(100, 160),
            24, TextAnchor.MiddleCenter, FontStyle.Bold, new Color32(255, 220, 60, 255));

        // ── Customer area ──
        _customerBlock = CreateBar("CustomerBlock", _panel.transform,
            new Vector2(0.15f, 0.38f), new Vector2(0.85f, 0.78f),
            Vector2.zero, Vector2.zero, new Color32(45, 38, 30, 255));

        // Customer image
        _customerImage = CreateImage("CustomerImage", _customerBlock.transform,
            new Vector2(0.35f, 0.25f), new Vector2(0.65f, 0.75f),
            Vector2.zero, Vector2.zero, _guestColors[0]).GetComponent<Image>();

        // Guest type label (above customer)
        _guestTypeText = CreateTextOn("GuestType", _customerBlock.transform, "",
            new Vector2(0.2f, 0.82f), new Vector2(0.8f, 0.95f),
            Vector2.zero, Vector2.zero, 14, TextAnchor.MiddleCenter, FontStyle.Bold, WarmText);

        // Patience bar background
        GameObject patienceBg = CreateBar("PatienceBG", _customerBlock.transform,
            new Vector2(0.2f, 0.15f), new Vector2(0.8f, 0.22f),
            Vector2.zero, Vector2.zero, new Color32(30, 25, 20, 255));

        // Patience fill
        _patienceBar = new GameObject("PatienceFill", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image)).GetComponent<Image>();
        _patienceBar.transform.SetParent(patienceBg.transform, false);
        RectTransform pbfRT = _patienceBar.GetComponent<RectTransform>();
        pbfRT.anchorMin = Vector2.zero;
        pbfRT.anchorMax = Vector2.one;
        pbfRT.offsetMin = Vector2.zero;
        pbfRT.offsetMax = Vector2.zero;
        _patienceBar.type = Image.Type.Filled;
        _patienceBar.fillMethod = Image.FillMethod.Horizontal;
        _patienceBar.fillAmount = 0f;
        _patienceBar.color = GreenColor;
        patienceBg.SetActive(false);

        // Patience label
        _patienceText = CreateTextOn("PatienceLabel", _customerBlock.transform, "Patience",
            new Vector2(0.2f, 0.06f), new Vector2(0.8f, 0.14f),
            Vector2.zero, Vector2.zero, 11, TextAnchor.MiddleCenter, FontStyle.Normal, GreyColor);

        // Customer label
        _customerLabel = CreateTextOn("CustomerLabel", _customerBlock.transform, "Customer 1",
            new Vector2(0.1f, 0.02f), new Vector2(0.9f, 0.12f),
            Vector2.zero, Vector2.zero, 14, TextAnchor.MiddleCenter, FontStyle.Normal, WarmText);

        // Order text (below customer block)
        _orderText = CreateTextOn("OrderText", _panel.transform, "What'll it be?",
            new Vector2(0.1f, 0.28f), new Vector2(0.9f, 0.36f),
            Vector2.zero, Vector2.zero, 16, TextAnchor.MiddleCenter, FontStyle.Normal, WarmText);

        // ── Drink buttons (big, 60% width) ──
        _statusText = CreateTextOn("Status", _panel.transform,
            $"Customer 1 / {_totalCustomers}",
            new Vector2(0.05f, 0.02f), new Vector2(0.5f, 0.08f),
            Vector2.zero, Vector2.zero, 14, TextAnchor.MiddleLeft, FontStyle.Normal, GreyColor);

        for (int i = 0; i < 3; i++)
        {
            int drinkIndex = i;
            float xCenter = 0.15f + i * 0.35f;
            float w = 0.28f;

            _drinkBtns[i] = CreateButton($"DrinkBtn_{i}", _panel.transform,
                new Vector2(xCenter, 0.08f), new Vector2(xCenter + w, 0.24f),
                _drinkColors[i], _drinkColorsLight[i],
                _drinkNames[i], 20, () => ServeDrink(drinkIndex));

            _drinkBtnComponents[i] = _drinkBtns[i].GetComponent<Button>();
        }

        // Slide in customer block
        StartCoroutine(SlideInElement(_customerBlock, 60f, 0.3f));

        // Start first customer
        StartCoroutine(NextCustomerAfterDelay(0.5f));
    }

    // ── Customer Generation ────────────────────────────────
    private void NextCustomer()
    {
        _customersServed++;
        if (_customersServed > _totalCustomers)
        {
            EndShiftAndShowSettlement();
            return;
        }

        _currentGuestType = (GuestType)Random.Range(0, 5);

        // [Gameplay] Loyalty bonus: increase chance of Regular guests
        if (_loyaltyBonus > 0f && _currentGuestType != GuestType.Regular && Random.value < _loyaltyBonus)
        {
            _currentGuestType = GuestType.Regular;
        }

        string prefix = "";
        if (_currentGuestType == GuestType.Group)
        {
            _groupCount = 3;
            _groupIndex = 0;
            prefix = " (1/3)";
        }

        int drinkIndex;
        if (_currentGuestType == GuestType.Drunk && Random.value < 0.4f)
        {
            // 40% chance: random order (drunk guest might order anything)
            drinkIndex = Random.Range(0, 3);
        }
        else if (_currentGuestType == GuestType.Drunk)
        {
            // 60% chance: default to Beer (drunk guest usually wants beer)
            drinkIndex = 0;
        }
        else
        {
            drinkIndex = Random.Range(0, 3);
        }
        _currentDrink = drinkIndex;

        // Customer color (fixed by type)
        _customerImage.color = _guestColors[(int)_currentGuestType];

        string guestName = _guestTypeLabels[(int)_currentGuestType];
        if (_currentGuestType == GuestType.Group) guestName = "Group";

        _guestTypeText.text = $"[{guestName}]";
        _guestTypeText.color = _guestColors[(int)_currentGuestType];

        _customerLabel.text = $"Customer {_customersServed}{prefix}";

        switch (_currentGuestType)
        {
            case GuestType.Regular:
                _orderText.text = $"Hey, good to see you again!\nI'll have a {_drinkNames[drinkIndex]}!";
                _orderText.color = _drinkColors[drinkIndex];
                break;
            case GuestType.Drunk:
                _orderText.text = $"Hiccup... gimme a... {_drinkNames[drinkIndex]}... or something...";
                _orderText.color = _drinkColors[drinkIndex];
                break;
            case GuestType.Group:
                _orderText.text = $"Group order {_groupIndex + 1}/3:\n{_drinkNames[drinkIndex]} please!";
                _orderText.color = _drinkColors[drinkIndex];
                break;
            default:
                _orderText.text = $"I'd like a... {_drinkNames[drinkIndex]}?";
                _orderText.color = _drinkColors[drinkIndex];
                break;
        }

        // Setup patience for Picky type
        if (_currentGuestType == GuestType.Picky)
        {
            _hasPatience = true;
            _patienceTimer = _patienceMax;
            Transform patienceParent = _customerBlock.transform.Find("PatienceBG");
            if (patienceParent != null)
                patienceParent.gameObject.SetActive(true);
            if (_patienceBar != null)
                _patienceBar.fillAmount = 1f;
        }
        else
        {
            _hasPatience = false;
            Transform patienceParent = _customerBlock.transform.Find("PatienceBG");
            if (patienceParent != null)
                patienceParent.gameObject.SetActive(false);
        }

        _statusText.text = $"Customer {_customersServed} / {_totalCustomers}";
        _isServing = true;

        // Slide in customer block animation
        StartCoroutine(SlideInElement(_customerBlock, 60f, 0.3f));
        UpdateInventoryDisplay();
    }

    // ── Serving ────────────────────────────────────────────
    private void ServeDrink(int drinkIndex)
    {
        if (!_isServing || _currentDrink < 0 || _isStocking) return;

        bool brewStockDepleted = GameController.Instance != null && GameController.Instance.State.GetBrewStock(drinkIndex) <= 0;
        if (_stock[drinkIndex] <= 0 && brewStockDepleted)
        {
            _orderText.text = $"😅 Sorry, we're out of {_drinkNames[drinkIndex]}!";
            _orderText.color = new Color32(255, 180, 60, 255);
            _apologyMode = true;
            _apologyTipMultiplier = 0.5f;
            _currentDrink = -1;
            _isServing = false;
            SoundManager.Play(SoundManager.SoundType.Error);
            StartCoroutine(NextCustomerAfterDelay(0.5f));
            return;
        }

        _stock[drinkIndex]--;
        if (GameController.Instance != null)
            GameController.Instance.State.ConsumeBrewStock(drinkIndex);
        UpdateInventoryDisplay();

        int revenue = 0;
        bool correct = (drinkIndex == _currentDrink);

        if (correct)
        {
            revenue = _drinkPrices[drinkIndex] + _upgradeBonus;
            // [Gameplay] Premium menu bonus: extra revenue per drink
            if (_hasPremiumMenu)
                revenue += 2;
            _earnings += revenue;

            int tip = 0;
            if (_currentGuestType == GuestType.Regular)
                tip = Mathf.RoundToInt(revenue * 0.5f * _tipMultiplier);
            else if (_currentGuestType == GuestType.Drunk)
                tip = Mathf.RoundToInt(revenue * 0.3f * _tipMultiplier);
            tip = Mathf.RoundToInt(tip * _apologyTipMultiplier);
            _tips += tip;

            _correctCount++;
            _comboCount++;

            // Combo streak effect
            if (_comboCount == 3 || _comboCount == 5 || _comboCount == 10)
            {
                StartCoroutine(ShowComboPopup(_comboCount));
            }

            if (_comboCount >= 3)
            {
                int comboBonus = 3;
                _tips += comboBonus;
                _comboText.text = $"🔥 {_comboCount}x Combo! +${comboBonus} Tip!";
                _comboText.color = new Color32(255, 220, 60, 255);
                StartCoroutine(ClearComboText());
            }
            else if (_comboCount == 2)
            {
                _comboText.text = $"✨ 2 in a row!";
                _comboText.color = new Color32(200, 200, 100, 255);
                StartCoroutine(ClearComboText());
            }

            _earningsText.text = $"Revenue: ${_earnings}  |  Tips: ${_tips}";
            _orderText.text = "✅ Cheers!";
            _orderText.color = GreenColor;
            SoundManager.Play(SoundManager.SoundType.Success);
            // Show floating score
            SpawnFloatingScore($"+${revenue}", _panel.transform.position);
            StartCoroutine(FlashFeedback(true));
            StartCoroutine(FloatText($"+${revenue + tip}", GreenColor));
            // Green flash for correct serve
            StartCoroutine(FlashScreen(new Color32(80, 220, 80, 60), 0.15f));

            // [Gameplay] Affection gain for Erik (bar owner)
            if (InventorySystem.Instance != null)
            {
                int current = InventorySystem.Instance.GetAffection("erik");
                InventorySystem.Instance.SetAffection("erik", current + 1);
                AchievementSystem.Instance?.CheckAffectionAchievement("erik", current + 1);
            }

            // [Gameplay] Register drink sold for achievement
            if (AchievementSystem.Instance != null)
            {
                AchievementSystem.Instance.CheckFirstSale();
                AchievementSystem.Instance.RegisterCustomerServed();
                AchievementSystem.Instance.RegisterDrinkSold(_drinkShortNames[drinkIndex]);
            }

            // [Tutorial] Notify tutorial system
            if (TutorialSystem.Instance != null)
                TutorialSystem.Instance.OnCustomerServed();

        }
        else
        {
            _comboCount = 0;
            _comboText.text = "";
            _earningsText.text = $"Revenue: ${_earnings}  |  Tips: ${_tips}";

            if (_currentGuestType == GuestType.Drunk)
            {
                _orderText.text = "Hiccup... that's not what I wanted... but okay...";
                _orderText.color = new Color32(180, 120, 200, 255);
            }
            else
            {
                _orderText.text = $"❌ Nope, I wanted {_drinkNames[_currentDrink]}!";
                _orderText.color = RedColor;
            }
            SoundManager.Play(SoundManager.SoundType.Fail);
            StartCoroutine(FlashFeedback(false));
            StartCoroutine(FloatText("-", RedColor));
            // Red flash for wrong serve
            StartCoroutine(FlashScreen(new Color32(220, 80, 80, 60), 0.15f));
        }

        _currentDrink = -1;
        _isServing = false;

        if (_currentGuestType == GuestType.Group)
        {
            _groupIndex++;
            if (_groupIndex < _groupCount)
            {
                StartCoroutine(NextGroupMemberAfterDelay(0.5f));
                return;
            }
        }

        if (_apologyMode)
        {
            _apologyMode = false;
            _apologyTipMultiplier = 1.0f;
        }

        StartCoroutine(NextCustomerAfterDelay(0.5f));
    }

    private IEnumerator NextGroupMemberAfterDelay(float delay)
    {
        yield return new WaitForSeconds(delay / _serviceSpeed);
        int drinkIndex = Random.Range(0, 3);
        _currentDrink = drinkIndex;
        _orderText.text = $"Group order {_groupIndex + 1}/3:\n{_drinkNames[drinkIndex]} please!";
        _orderText.color = _drinkColors[drinkIndex];
        _isServing = true;
        _customerLabel.text = $"Customer {_customersServed} ({_groupIndex + 1}/3)";
        UpdateInventoryDisplay();
    }

    private IEnumerator NextCustomerAfterDelay(float delay)
    {
        yield return new WaitForSeconds(delay / _serviceSpeed);
        NextCustomer();
    }

    private IEnumerator ClearComboText()
    {
        yield return new WaitForSeconds(1.5f);
        _comboText.text = "";
    }

    // ── Visual Feedback ────────────────────────────────────
    private IEnumerator FlashFeedback(bool correct)
    {
        if (_flashOverlay == null) yield break;
        _flashOverlay.SetActive(true);
        Image flashImg = _flashOverlay.GetComponent<Image>();
        flashImg.color = correct ? new Color32(60, 255, 100, 180) : new Color32(255, 60, 60, 180);
        yield return new WaitForSeconds(0.15f);
        flashImg.color = new Color32(0, 0, 0, 0);
        yield return new WaitForSeconds(0.05f);
        flashImg.color = correct ? new Color32(60, 255, 100, 100) : new Color32(255, 60, 60, 100);
        yield return new WaitForSeconds(0.1f);
        flashImg.color = new Color32(0, 0, 0, 0);
        _flashOverlay.SetActive(false);
    }

    private IEnumerator FloatText(string message, Color32 color)
    {
        GameObject floatGO = new GameObject("FloatText", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        floatGO.transform.SetParent(_canvas.transform, false);
        RectTransform rt = floatGO.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(0.35f, 0.45f);
        rt.anchorMax = new Vector2(0.65f, 0.55f);
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;

        Text text = floatGO.GetComponent<Text>();
        text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        text.fontSize = 36;
        text.fontStyle = FontStyle.Bold;
        text.alignment = TextAnchor.MiddleCenter;
        text.color = color;
        text.text = message;

        float elapsed = 0f;
        float duration = 0.8f;
        Vector3 startPos = floatGO.transform.localPosition;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float t = elapsed / duration;
            floatGO.transform.localPosition = startPos + new Vector3(0, 60f * t, 0);
            text.color = new Color32(color.r, color.g, color.b, (byte)Mathf.Lerp(255, 0, t));
            yield return null;
        }
        Destroy(floatGO);
    }

    // ── End Shift & Settlement ─────────────────────────────
    private void EndShiftAndShowSettlement()
    {
        _isServing = false;
        _isActive = false;  // Prevent EndShift() double-revenue via F key during settlement
        SetGameButtonsInteractable(false);

        int grossRevenue = _earnings + _tips;
        int netIncome = grossRevenue - _stockingCost;
        int totalCustomers = _totalCustomers;
        int servedCustomers = _correctCount;
        float accuracy = totalCustomers > 0 ? (float)servedCustomers / totalCustomers : 0f;

        // Track totals in GameState for end-game stats
        if (GameController.Instance != null)
        {
            GameController.Instance.State.TotalCustomersServed += servedCustomers;
            GameController.Instance.State.TotalRevenue += grossRevenue;
        }
        int stars = Mathf.Clamp(Mathf.RoundToInt(accuracy * 5f), 0, 5);

        GameController.Instance.State.AddMoney(grossRevenue);

        // Daily revenue achievement check (mirrors EndShift's check)
        if (Application.isPlaying && AchievementSystem.Instance != null)
            AchievementSystem.Instance.RegisterDailyRevenue(grossRevenue);

        // Wait a beat, then build settlement
        StartCoroutine(ShowSettlementUI(netIncome, grossRevenue, stars, servedCustomers, totalCustomers, accuracy));
    }

    private IEnumerator ShowSettlementUI(int netIncome, int grossRevenue, int stars, int served, int total, float accuracy)
    {
        // Fade out serve panel
        if (_panel != null)
        {
            yield return FadePanel(_panel, 1f, 0f, 0.2f);
            Destroy(_panel);
        }

        // Build settlement panel with gold border
        GameObject settlePanel = CreatePanel("SettlePanel", DarkBrown, new Vector2(0.25f, 0.2f), new Vector2(0.75f, 0.8f));

        // Gold border
        GameObject borderPanel = CreateBar("GoldBorder", settlePanel.transform.parent,
            new Vector2(0.25f, 0.2f), new Vector2(0.75f, 0.8f),
            new Vector2(0, 0), new Vector2(0, 0), GoldColor);
        borderPanel.transform.SetSiblingIndex(settlePanel.transform.GetSiblingIndex());
        settlePanel.GetComponent<Image>().color = DarkBrown;

        // Slide up animation
        RectTransform sRT = settlePanel.GetComponent<RectTransform>();
        float origY = sRT.anchoredPosition.y;
        sRT.anchoredPosition = new Vector2(sRT.anchoredPosition.x, origY + 200f);
        StartCoroutine(SlideUpPanel(sRT, origY, 0.3f));

        // Title
        _ = CreateTextOn("SettleTitle", settlePanel.transform, "📋 Shift Complete!",
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(0, -50), new Vector2(0, -10),
            24, TextAnchor.MiddleCenter, FontStyle.Bold, GoldColor);

        // Star rating (colored text stars for compatibility)
        string starString = "";
        for (int i = 0; i < 5; i++)
            starString += (i < stars) ? "★" : "☆";
        Color32 starColor = stars >= 4 ? new Color32(255, 215, 0, 255) :
                           stars >= 3 ? new Color32(255, 200, 80, 255) :
                           stars >= 2 ? new Color32(220, 180, 100, 255) :
                                        new Color32(180, 160, 140, 255);
        _ = CreateTextOn("StarRating", settlePanel.transform, starString,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(0, -80), new Vector2(0, -56),
            24, TextAnchor.MiddleCenter, FontStyle.Normal, starColor);

        // Data rows
        float rowY = 0.72f;
        float rowH = 0.06f;

        CreateDataRow(settlePanel.transform, "Customers Served", $"{served} / {total}", rowY, rowH, WarmText, GoldColor);
        CreateDataRow(settlePanel.transform, "Revenue", $"${_earnings}", rowY - 0.08f, rowH, WarmText, new Color32(160, 220, 120, 255));
        CreateDataRow(settlePanel.transform, "Tips", $"${_tips}", rowY - 0.16f, rowH, WarmText, new Color32(220, 200, 120, 255));
        CreateDataRow(settlePanel.transform, "Stock Cost", $"${_stockingCost}", rowY - 0.24f, rowH, WarmText, new Color32(220, 140, 120, 255));
        CreateDataRow(settlePanel.transform, "Accuracy", $"{(accuracy * 100):F0}%", rowY - 0.32f, rowH, WarmText, new Color32(180, 200, 220, 255));

        // [Gameplay] Show upgrade bonus
        if (_upgradeBonus > 0)
        {
            CreateDataRow(settlePanel.transform, "Upgrade Bonus", $"+${_upgradeBonus * served}", rowY - 0.40f, rowH, WarmText, new Color32(100, 200, 255, 255));
        }

        // [Gameplay] Show premium menu bonus
        if (_hasPremiumMenu)
        {
            float premiumRowY = _upgradeBonus > 0 ? rowY - 0.48f : rowY - 0.40f;
            CreateDataRow(settlePanel.transform, "Premium Menu", $"+${2 * served}", premiumRowY, rowH, WarmText, new Color32(220, 180, 255, 255));
        }

        // Separator line
        _ = CreateBar("Separator", settlePanel.transform,
            new Vector2(0.2f, rowY - 0.28f), new Vector2(0.8f, rowY - 0.27f),
            Vector2.zero, Vector2.zero, new Color32(80, 70, 55, 255));

        // Net income
        string netStr = netIncome >= 0 ? $"+${netIncome}" : $"-${Mathf.Abs(netIncome)}";
        Color32 netColor = netIncome >= 0 ? GreenColor : RedColor;
        CreateDataRow(settlePanel.transform, "Net Income", netStr, rowY - 0.35f, 0.08f, WarmText, netColor);

        // Confirm button
        _ = CreateButton("SettleConfirm", settlePanel.transform,
            new Vector2(0.3f, 0.06f), new Vector2(0.7f, 0.18f),
            GoldColor, new Color32(255, 220, 100, 255), "✅ Finish Shift", 20,
            () => {
                _onComplete?.Invoke(_earnings + _tips);
                _onComplete = null;
                _isActive = false;
                Destroy(_canvas.gameObject);
            });
    }

    private void CreateDataRow(Transform parent, string label, string value, float yCenter, float height, Color32 labelColor, Color32 valueColor)
    {
        _ = CreateTextOn($"RowLabel_{label}", parent, label,
            new Vector2(0.1f, yCenter), new Vector2(0.5f, yCenter + height),
            Vector2.zero, Vector2.zero, 16, TextAnchor.MiddleLeft, FontStyle.Normal, labelColor);
        _ = CreateTextOn($"RowValue_{label}", parent, value,
            new Vector2(0.5f, yCenter), new Vector2(0.9f, yCenter + height),
            Vector2.zero, Vector2.zero, 18, TextAnchor.MiddleRight, FontStyle.Bold, valueColor);
    }

    private IEnumerator SlideUpPanel(RectTransform rt, float targetY, float duration)
    {
        float elapsed = 0f;
        float startY = rt.anchoredPosition.y;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float t = elapsed / duration;
            rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, Mathf.Lerp(startY, targetY, t));
            yield return null;
        }
        rt.anchoredPosition = new Vector2(rt.anchoredPosition.x, targetY);
    }

    // ── Helpers ────────────────────────────────────────────
    private string GetInventoryString()
    {
        return $"🍺 Beer x{_stock[0]}  |  🥃 Whiskey x{_stock[1]}  |  🍷 Wine x{_stock[2]}";
    }

    private void UpdateInventoryDisplay()
    {
        int beer = GameController.Instance != null ? GameController.Instance.State.GetBrewStock(0) : _stock[0];
        int whiskey = GameController.Instance != null ? GameController.Instance.State.GetBrewStock(1) : _stock[1];
        int wine = GameController.Instance != null ? GameController.Instance.State.GetBrewStock(2) : _stock[2];
        if (_inventoryBeer != null) _inventoryBeer.text = $"{beer}";
        if (_inventoryWhiskey != null) _inventoryWhiskey.text = $"{whiskey}";
        if (_inventoryWine != null) _inventoryWine.text = $"{wine}";
    }

    private void SetGameButtonsInteractable(bool interactable)
    {
        if (_panel == null) return;
        foreach (Transform t in _panel.transform)
        {
            Button b = t.GetComponent<Button>();
            if (b != null) b.interactable = interactable;
        }
    }

    // ── UI Helpers ─────────────────────────────────────────
    private GameObject CreatePanel(string name, Color32 bgColor, Vector2 anchorMin, Vector2 anchorMax)
    {
        GameObject panel = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        panel.transform.SetParent(_canvas.transform, false);
        Image img = panel.GetComponent<Image>();
        img.color = bgColor;
        RectTransform rt = panel.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;
        return panel;
    }

    private GameObject CreateBar(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        Vector2 offsetMin, Vector2 offsetMax, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        Image img = go.GetComponent<Image>();
        img.color = color;
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = offsetMin;
        rt.offsetMax = offsetMax;
        return go;
    }

    private GameObject CreateImage(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        Vector2 offsetMin, Vector2 offsetMax, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        Image img = go.GetComponent<Image>();
        img.color = color;
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = offsetMin;
        rt.offsetMax = offsetMax;
        return go;
    }

    private Text CreateTextOn(string name, Transform parent, string content,
        Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax,
        int fontSize, TextAnchor alignment, FontStyle fontStyle, Color32 color)
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
        text.fontStyle = fontStyle;
        text.color = color;
        text.text = content;
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    private GameObject CreateButton(string name, Transform parent,
        Vector2 anchorMin, Vector2 anchorMax,
        Color32 normalColor, Color32 hoverColor,
        string label, int fontSize, UnityEngine.Events.UnityAction onClick)
    {
        GameObject btnGO = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        btnGO.transform.SetParent(parent, false);
        Image btnImg = btnGO.GetComponent<Image>();
        btnImg.color = normalColor;
        btnImg.raycastTarget = true;
        RectTransform btnRT = btnGO.GetComponent<RectTransform>();
        btnRT.anchorMin = anchorMin;
        btnRT.anchorMax = anchorMax;
        btnRT.offsetMin = Vector2.zero;
        btnRT.offsetMax = Vector2.zero;

        // Button text
        Text btnText = new GameObject("Text", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text)).GetComponent<Text>();
        btnText.transform.SetParent(btnGO.transform, false);
        RectTransform textRT = btnText.GetComponent<RectTransform>();
        textRT.anchorMin = Vector2.zero;
        textRT.anchorMax = Vector2.one;
        textRT.offsetMin = new Vector2(4, 2);
        textRT.offsetMax = new Vector2(-4, -2);
        btnText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        btnText.fontSize = fontSize;
        btnText.alignment = TextAnchor.MiddleCenter;
        btnText.fontStyle = FontStyle.Bold;
        btnText.text = label;
        btnText.color = new Color32(20, 22, 26, 255);

        // Button component
        Button btn = btnGO.AddComponent<Button>();
        btn.targetGraphic = btnImg;
        btn.onClick.AddListener(onClick);

        // Click scale animation
        btn.onClick.AddListener(() => StartCoroutine(ButtonClickScale(btnGO.transform)));

        // Hover effect using EventTrigger
        EventTrigger trigger = btnGO.AddComponent<EventTrigger>();

        EventTrigger.Entry enterEntry = new EventTrigger.Entry();
        enterEntry.eventID = EventTriggerType.PointerEnter;
        enterEntry.callback.AddListener((data) => {
            btnImg.color = hoverColor;
        });
        trigger.triggers.Add(enterEntry);

        // Click sound effect
        btn.onClick.AddListener(() => SoundManager.Play(SoundManager.SoundType.UIClick));

        EventTrigger.Entry exitEntry = new EventTrigger.Entry();
        exitEntry.eventID = EventTriggerType.PointerExit;
        exitEntry.callback.AddListener((data) => {
            btnImg.color = normalColor;
        });
        trigger.triggers.Add(exitEntry);

        return btnGO;
    }

    private IEnumerator ButtonClickScale(Transform t)
    {
        Vector3 origScale = t.localScale;
        t.localScale = origScale * 0.95f;
        yield return new WaitForSeconds(0.1f);
        t.localScale = origScale;
    }

    private IEnumerator FadePanel(GameObject panel, float fromAlpha, float toAlpha, float duration)
    {
        if (panel == null) yield break;
        CanvasGroup cg = panel.GetComponent<CanvasGroup>();
        if (cg == null) cg = panel.AddComponent<CanvasGroup>();
        cg.alpha = fromAlpha;
        panel.SetActive(true);
        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            cg.alpha = Mathf.Lerp(fromAlpha, toAlpha, elapsed / duration);
            yield return null;
        }
        cg.alpha = toAlpha;
        if (toAlpha <= 0f) panel.SetActive(false);
    }

    private IEnumerator FadeAndDestroyPanel(GameObject panel, float duration)
    {
        if (panel == null) yield break;
        yield return FadePanel(panel, 1f, 0f, duration);
        Destroy(panel);
    }

    private IEnumerator FadeThenServe(GameObject panel)
    {
        if (panel != null)
        {
            yield return FadePanel(panel, 1f, 0f, 0.2f);
            Destroy(panel);
        }
        BuildServeUI();
    }

    private IEnumerator SlideInElement(GameObject go, float distance, float duration)
    {
        if (go == null) yield break;
        RectTransform rt = go.GetComponent<RectTransform>();
        Vector2 origPos = rt.anchoredPosition;
        rt.anchoredPosition = new Vector2(origPos.x, origPos.y + distance);
        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float t = elapsed / duration;
            rt.anchoredPosition = new Vector2(origPos.x, Mathf.Lerp(origPos.y + distance, origPos.y, t));
            yield return null;
        }
        rt.anchoredPosition = origPos;
    }

    private Text CreateText(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
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
        text.color = WarmText;
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    private void SpawnFloatingScore(string text, Vector3 worldPos)
    {
        if (_canvas == null) return;

        GameObject ftGO = new GameObject("FloatingScore", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        ftGO.transform.SetParent(_canvas.transform, false);

        Text ft = ftGO.GetComponent<Text>();
        ft.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        ft.text = text;
        ft.fontSize = 28;
        ft.fontStyle = FontStyle.Bold;
        ft.color = new Color32(80, 220, 80, 255);
        ft.alignment = TextAnchor.MiddleCenter;

        RectTransform ftrt = ftGO.GetComponent<RectTransform>();
        ftrt.anchorMin = new Vector2(0.5f, 0.5f);
        ftrt.anchorMax = new Vector2(0.5f, 0.5f);
        ftrt.sizeDelta = new Vector2(200, 50);
        ftrt.anchoredPosition = Vector2.zero;

        StartCoroutine(FloatingScoreRoutine(ftGO, ftrt, ft));
    }

    private IEnumerator FloatingScoreRoutine(GameObject go, RectTransform rt, Text txt)
    {
        float duration = 1.2f;
        Vector2 startPos = rt.anchoredPosition;
        Color startColor = txt.color;

        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = t / duration;
            rt.anchoredPosition = startPos + new Vector2(Random.Range(-10f, 10f), p * 70f);
            txt.color = new Color(startColor.r, startColor.g, startColor.b, 1f - p);
            yield return null;
        }

        Destroy(go);
    }

    private IEnumerator ShowComboPopup(int count)
    {
        if (_canvas == null) yield break;

        GameObject comboGO = new GameObject("ComboPopup", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        comboGO.transform.SetParent(_canvas.transform, false);

        Text comboText = comboGO.GetComponent<Text>();
        comboText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

        string comboLabel = count == 3 ? "Nice!" : count == 5 ? "Amazing!" : "LEGENDARY!";
        comboText.text = $"🔥 {comboLabel} x{count}";
        comboText.fontSize = count == 10 ? 40 : 32;
        comboText.fontStyle = FontStyle.Bold;

        // Color based on streak level
        comboText.color = count == 3 ? new Color32(255, 200, 50, 255) :
                          count == 5 ? new Color32(255, 100, 50, 255) :
                                       new Color32(255, 50, 200, 255);
        comboText.alignment = TextAnchor.MiddleCenter;

        RectTransform crt = comboGO.GetComponent<RectTransform>();
        crt.anchorMin = new Vector2(0.5f, 0.6f);
        crt.anchorMax = new Vector2(0.5f, 0.6f);
        crt.sizeDelta = new Vector2(300, 60);
        crt.anchoredPosition = Vector2.zero;

        // Play success sound at higher pitch for higher combos
        SoundManager.Play(SoundManager.SoundType.Success);

        // Animate: scale up, pause, fade out
        float scaleIn = 0.3f;
        for (float t = 0; t < scaleIn; t += Time.deltaTime)
        {
            float p = t / scaleIn;
            float s = Mathf.Lerp(0.3f, 1.2f, p * p * (3f - 2f * p)); // smoothstep scale
            crt.localScale = new Vector3(s, s, 1);
            comboText.color = new Color(comboText.color.r, comboText.color.g, comboText.color.b, p);
            yield return null;
        }
        crt.localScale = new Vector3(1.2f, 1.2f, 1);

        // Hold
        yield return new WaitForSeconds(0.8f);

        // Fade out
        for (float t = 0; t < 0.4f; t += Time.deltaTime)
        {
            float p = t / 0.4f;
            comboText.color = new Color(comboText.color.r, comboText.color.g, comboText.color.b, 1f - p);
            yield return null;
        }

        Destroy(comboGO);
    }

    private IEnumerator FlashScreen(Color32 flashColor, float duration)
    {
        if (_flashOverlay == null) yield break;

        _flashOverlay.SetActive(true);
        Image flashImg = _flashOverlay.GetComponent<Image>();

        Color baseColor = flashColor;
        Color clearColor = baseColor;
        clearColor.a = 0f;

        // Flash in
        float half = duration * 0.5f;
        for (float t = 0; t < half; t += Time.deltaTime)
        {
            float p = t / half;
            flashImg.color = Color.Lerp(clearColor, baseColor, p);
            yield return null;
        }

        // Flash out
        for (float t = 0; t < half; t += Time.deltaTime)
        {
            float p = t / half;
            flashImg.color = Color.Lerp(baseColor, clearColor, p);
            yield return null;
        }

        flashImg.color = clearColor;
        _flashOverlay.SetActive(false);
    }
}
