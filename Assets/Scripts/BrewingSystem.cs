using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using RectSpec = UIFactory.RectSpec;

/// <summary>
/// Brewing system for Amsterdam Brewery.
/// Player selects a beer recipe, pays ingredients, waits for brew time,
/// and the resulting stock feeds into the BarMinigame.
/// Press R to open the brew panel.
/// </summary>
public class BrewingSystem : MonoBehaviour
{
    private static BrewingSystem _instance;
    public static BrewingSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("BrewingSystem");
                _instance = go.AddComponent<BrewingSystem>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    // ── Recipes ──────────────────────────────────────────
    // Recipes spread across all 3 drink types (0=Beer, 1=Whiskey, 2=Wine)
    // so players can brew variety and serve all drink types.
    private static readonly BrewRecipe[] Recipes = new BrewRecipe[]
    {
        new BrewRecipe { id = "lager", name = "🍺 Lager", emoji = "🍺", ingredientCost = 10, brewTurns = 3, yieldCount = 5, stockIndex = 0 },
        new BrewRecipe { id = "pilsner", name = "🍻 Pilsner", emoji = "🍻", ingredientCost = 12, brewTurns = 4, yieldCount = 6, stockIndex = 0 },
        new BrewRecipe { id = "wheat", name = "🌾 Wheat Beer", emoji = "🌾", ingredientCost = 15, brewTurns = 5, yieldCount = 7, stockIndex = 0 },
        new BrewRecipe { id = "whiskey", name = "🥃 Whiskey", emoji = "🥃", ingredientCost = 14, brewTurns = 6, yieldCount = 8, stockIndex = 1 },
        new BrewRecipe { id = "wine", name = "🍷 Wine", emoji = "🍷", ingredientCost = 15, brewTurns = 7, yieldCount = 9, stockIndex = 2 },
    };

    // ── UI ───────────────────────────────────────────────
    private Canvas _canvas;
    private GameObject _panel;
    private GameObject _contentArea;
    private Text _statusText;
    private Text _moneyText;
    private Font _font;
    private bool _panelOpen;
    public bool IsPanelOpen => _panelOpen;

    // ── Brew complete notification popup ─────────────────
    private GameObject _notificationGO;
    private Text _notificationText;
    private Coroutine _notificationCoroutine;

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
            return;
        }
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        BuildUI();
        BuildNotification();
        _canvas.gameObject.SetActive(false);
    }

    // ── Public API ───────────────────────────────────────

    public void TogglePanel()
    {
        _panelOpen = !_panelOpen;
        _canvas.gameObject.SetActive(_panelOpen);
        if (_panelOpen) RefreshPanel();
    }

    /// <summary>
    /// Force-close the brew panel (used on New Game / Load).
    /// </summary>
    public void ClosePanel()
    {
        _panelOpen = false;
        if (_canvas != null)
            _canvas.gameObject.SetActive(false);
    }

    /// <summary>
    /// Called by GameController on each time advance to tick brew progress.
    /// </summary>
    public void OnTimeAdvanced()
    {
        GameState state = GameController.Instance.State;
        if (!state.IsBrewing) return;

        state.ActiveBrewTurnsRemaining--;
        if (state.ActiveBrewTurnsRemaining <= 0)
        {
            // Brew complete!
            BrewRecipe recipe = Recipes[state.ActiveBrewIndex];
            state.AddBrewStock(recipe.stockIndex, recipe.yieldCount);
            ShowNotification($"✅ {recipe.name} ready!\n+{recipe.yieldCount} units added to stock");
            SoundManager.Play(SoundManager.SoundType.Collect);
            state.ActiveBrewIndex = -1;
            state.ActiveBrewTurnsRemaining = 0;
        }
        RefreshPanel();
    }

    // ── UI Build ─────────────────────────────────────────

    private void BuildUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("BrewCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 200;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        Transform root = _canvas.transform;

        // Overlay
        Image overlay = UIFactory.MakeImage("Overlay", root,
            new RectSpec(Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero),
            new Color32(0, 0, 0, 180));
        Button overlayBtn = overlay.gameObject.AddComponent<Button>();
        overlayBtn.onClick.AddListener(TogglePanel);

        // Panel
        _panel = new GameObject("BrewPanel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _panel.transform.SetParent(root, false);
        Image panelImg = _panel.GetComponent<Image>();
        panelImg.color = new Color32(20, 24, 30, 240);
        RectTransform pRT = _panel.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.15f, 0.1f);
        pRT.anchorMax = new Vector2(0.85f, 0.9f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;

        // Title
        Text title = UIFactory.MakeText("Title", _panel.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(20, -44), new Vector2(-20, -4)),
            28, TextAnchor.MiddleLeft);
        title.text = "🍺 Brewery — Recipe Selection";
        title.fontStyle = FontStyle.Bold;
        title.color = new Color32(236, 180, 87, 255);

        // Close hint
        Text closeHint = UIFactory.MakeText("CloseHint", _panel.transform,
            new RectSpec(new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-140, -44), new Vector2(-20, -8)),
            14, TextAnchor.MiddleRight);
        closeHint.text = "Press R to close";
        closeHint.color = new Color32(150, 150, 150, 200);

        // Money display
        _moneyText = UIFactory.MakeText("Money", _panel.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(20, -72), new Vector2(-20, -44)),
            16, TextAnchor.MiddleLeft);
        _moneyText.color = new Color32(160, 220, 120, 255);

        // Brew status
        _statusText = UIFactory.MakeText("Status", _panel.transform,
            new RectSpec(new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(20, -96), new Vector2(-20, -72)),
            16, TextAnchor.MiddleLeft);
        _statusText.color = new Color32(255, 220, 100, 255);

        // Content area
        _contentArea = new GameObject("ContentArea", typeof(RectTransform));
        _contentArea.transform.SetParent(_panel.transform, false);
        RectTransform cRT = _contentArea.GetComponent<RectTransform>();
        cRT.anchorMin = Vector2.zero;
        cRT.anchorMax = Vector2.one;
        cRT.offsetMin = new Vector2(20, 16);
        cRT.offsetMax = new Vector2(-20, -104);
    }

    private void BuildNotification()
    {
        _notificationGO = new GameObject("BrewNotification", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _notificationGO.transform.SetParent(transform);
        RectTransform nRT = _notificationGO.GetComponent<RectTransform>();
        nRT.anchorMin = new Vector2(0.5f, 0);
        nRT.anchorMax = new Vector2(0.5f, 0);
        nRT.offsetMin = new Vector2(-200, 40);
        nRT.offsetMax = new Vector2(200, 100);
        Image nImg = _notificationGO.GetComponent<Image>();
        nImg.color = new Color32(40, 50, 30, 230);

        _notificationText = UIFactory.MakeText("NotifText", _notificationGO.transform,
            new RectSpec(Vector2.zero, Vector2.one, new Vector2(12, 6), new Vector2(-12, -6)),
            18, TextAnchor.MiddleCenter);
        _notificationText.fontStyle = FontStyle.Bold;
        _notificationText.color = new Color32(255, 220, 60, 255);

        Canvas notifCanvas = _notificationGO.AddComponent<Canvas>();
        notifCanvas.sortingOrder = 300;
        notifCanvas.renderMode = RenderMode.ScreenSpaceOverlay;

        _notificationGO.SetActive(false);
    }

    private void RefreshPanel()
    {
        if (_contentArea == null) return;
        foreach (Transform child in _contentArea.transform)
            Object.Destroy(child.gameObject);

        GameState state = GameController.Instance.State;

        _moneyText.text = $"💰 Money: ${state.Money}";

        // Show active brew status
        if (state.IsBrewing)
        {
            BrewRecipe active = Recipes[state.ActiveBrewIndex];
            _statusText.text = $"⏳ Brewing: {active.name} — {state.ActiveBrewTurnsRemaining} turns remaining";
            _statusText.color = new Color32(255, 220, 100, 255);

            // Show stock
            ShowStockSummary(0);
        }
        else
        {
            _statusText.text = "Select a recipe to start brewing";
            _statusText.color = new Color32(180, 175, 165, 255);
        }

        // Build recipe cards
        float y = 0;
        for (int i = 0; i < Recipes.Length; i++)
        {
            BrewRecipe recipe = Recipes[i];
            bool canAfford = state.Money >= recipe.ingredientCost;
            bool isActive = state.IsBrewing && state.ActiveBrewIndex == i;

            BuildRecipeCard(i, recipe, canAfford, isActive, ref y);
        }

        // Show stock summary at bottom
        ShowStockSummary(y + 10);
    }

    private void BuildRecipeCard(int index, BrewRecipe recipe, bool canAfford, bool isActive, ref float y)
    {
        float rowH = 64f;
        GameState state = GameController.Instance.State;

        GameObject row = new GameObject($"Recipe_{recipe.id}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        row.transform.SetParent(_contentArea.transform, false);
        Image rowImg = row.GetComponent<Image>();
        rowImg.color = isActive ? new Color32(50, 55, 30, 220) : new Color32(40, 44, 52, 200);
        RectTransform rRT = row.GetComponent<RectTransform>();
        rRT.anchorMin = new Vector2(0, 1);
        rRT.anchorMax = new Vector2(1, 1);
        rRT.offsetMin = new Vector2(0, -y - rowH);
        rRT.offsetMax = new Vector2(0, -y);

        // Emoji + name
        Text nameText = UIFactory.MakeText($"Name_{recipe.id}", row.transform,
            new RectSpec(new Vector2(0, 0), new Vector2(0.4f, 1),
                new Vector2(12, 6), new Vector2(0, -6)),
            20, TextAnchor.MiddleLeft);
        nameText.text = $"{recipe.emoji} {recipe.name}";
        nameText.fontStyle = FontStyle.Bold;

        // Details
        Text detailsText = UIFactory.MakeText($"Details_{recipe.id}", row.transform,
            new RectSpec(new Vector2(0, 0), new Vector2(0.4f, 1),
                new Vector2(12, 4), new Vector2(0, -28)),
            12, TextAnchor.MiddleLeft);
        detailsText.text = $"Cost: ${recipe.ingredientCost}  |  Time: {recipe.brewTurns} turns  |  Yield: {recipe.yieldCount} units";
        detailsText.color = new Color32(180, 175, 165, 220);

        if (isActive)
        {
            Text activeText = UIFactory.MakeText($"Active_{recipe.id}", row.transform,
                new RectSpec(new Vector2(0.5f, 0), new Vector2(1, 1),
                    new Vector2(0, 0), new Vector2(-12, 0)),
                16, TextAnchor.MiddleRight);
            activeText.text = $"⏳ Brewing... ({state.ActiveBrewTurnsRemaining}t)";
            activeText.color = new Color32(255, 220, 100, 255);
            activeText.fontStyle = FontStyle.Bold;
        }
        else if (!state.IsBrewing)
        {
            // Brew button
            GameObject btnGO = new GameObject($"BrewBtn_{index}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            btnGO.transform.SetParent(row.transform, false);
            RectTransform btnRT = btnGO.GetComponent<RectTransform>();
            btnRT.anchorMin = new Vector2(0.6f, 0.15f);
            btnRT.anchorMax = new Vector2(0.9f, 0.85f);
            btnRT.offsetMin = Vector2.zero;
            btnRT.offsetMax = Vector2.zero;

            Image btnImg = btnGO.GetComponent<Image>();
            btnImg.color = canAfford ? new Color32(86, 125, 56, 255) : new Color32(60, 60, 65, 200);

            Button btn = btnGO.AddComponent<Button>();
            btn.interactable = canAfford;
            int capturedIndex = index;
            btn.onClick.AddListener(() => StartBrew(capturedIndex));

            Text btnText = UIFactory.MakeText($"BtnText_{index}", btnGO.transform,
                new RectSpec(Vector2.zero, Vector2.one, new Vector2(4, 2), new Vector2(-4, -2)),
                16, TextAnchor.MiddleCenter);
            btnText.text = canAfford ? "Start Brew" : "Can't Afford";
            btnText.color = canAfford ? Color.white : new Color32(150, 150, 150, 200);
            btnText.fontStyle = FontStyle.Bold;
        }

        y += rowH + 6f;
    }

    private void ShowStockSummary(float topY)
    {
        if (_contentArea == null) return;
        GameState state = GameController.Instance.State;

        // Find existing stock summary or create
        Transform existing = _contentArea.transform.Find("StockSummary");
        if (existing != null) Object.Destroy(existing.gameObject);

        int beer = state.GetBrewStock(0);
        int whiskey = state.GetBrewStock(1);
        int wine = state.GetBrewStock(2);

        GameObject summary = new GameObject("StockSummary", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        summary.transform.SetParent(_contentArea.transform, false);
        Image sImg = summary.GetComponent<Image>();
        sImg.color = new Color32(30, 34, 40, 200);
        RectTransform sRT = summary.GetComponent<RectTransform>();
        sRT.anchorMin = new Vector2(0, 1);
        sRT.anchorMax = new Vector2(1, 1);
        sRT.offsetMin = new Vector2(0, -topY - 44);
        sRT.offsetMax = new Vector2(0, -topY);

        Text stockText = UIFactory.MakeText("StockText", summary.transform,
            new RectSpec(Vector2.zero, Vector2.one, new Vector2(12, 6), new Vector2(-12, -6)),
            16, TextAnchor.MiddleLeft);
        stockText.text = $"📦 Brew Stock: 🍺 Beer x{beer}  |  🥃 Whiskey x{whiskey}  |  🍷 Wine x{wine}";
        stockText.color = new Color32(200, 195, 185, 255);
        stockText.fontStyle = FontStyle.Bold;
    }

    // ── Game Logic ───────────────────────────────────────

    private void StartBrew(int recipeIndex)
    {
        if (recipeIndex < 0 || recipeIndex >= Recipes.Length) return;
        GameState state = GameController.Instance.State;
        if (state.IsBrewing) return;

        BrewRecipe recipe = Recipes[recipeIndex];
        if (state.Money < recipe.ingredientCost) return;

        state.AddMoney(-recipe.ingredientCost);
        state.ActiveBrewIndex = recipeIndex;
        state.ActiveBrewTurnsRemaining = recipe.brewTurns;

        SoundManager.Play(SoundManager.SoundType.UIClick);
        GameController.Instance.RefreshHudPublic();
        RefreshPanel();

        // Notify tutorial system of first brew
        if (TutorialSystem.Instance != null)
            TutorialSystem.Instance.OnBrewStarted();
    }

    private void ShowNotification(string message)
    {
        if (_notificationGO == null) return;
        _notificationGO.SetActive(true);
        _notificationText.text = message;
        if (_notificationCoroutine != null)
            StopCoroutine(_notificationCoroutine);
        _notificationCoroutine = StartCoroutine(HideNotificationAfterDelay());
    }

    private IEnumerator HideNotificationAfterDelay()
    {
        yield return new WaitForSeconds(3f);
        if (_notificationGO != null)
            _notificationGO.SetActive(false);
        _notificationCoroutine = null;
    }
}
