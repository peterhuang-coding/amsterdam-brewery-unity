using UnityEngine;
using UnityEngine.UI;
using System.Collections;

/// <summary>
/// Bar shift minigame — serve customers by matching their drink order.
/// Walk up to the bar counter and press E to start a shift.
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

    private Canvas _canvas;
    private GameObject _panel;
    private Text _customerText;
    private Text _orderText;
    private Text _earningsText;
    private Text _statusText;
    private Image _customerImage;

    private int _customersServed = 0;
    private int _totalCustomers = 5;
    private int _earnings = 0;
    private int _currentDrink = -1;
    private bool _isActive = false;
    private System.Action<int> _onComplete;

    private readonly string[] _drinkNames = { "🍺 Beer", "🥃 Whiskey", "🍷 Wine" };
    private readonly Color32[] _drinkColors = {
        new Color32(255, 200, 50, 255),
        new Color32(180, 120, 60, 255),
        new Color32(180, 50, 80, 255)
    };

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

    public void StartShift(System.Action<int> onComplete)
    {
        if (_isActive) return;
        _isActive = true;
        _onComplete = onComplete;
        _customersServed = 0;
        _earnings = 0;
        _totalCustomers = Random.Range(5, 9);

        BuildUI();
        NextCustomer();
    }

    private void BuildUI()
    {
        GameObject canvasGO = new GameObject("BarCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 200;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        // Background overlay
        GameObject bgGO = new GameObject("Background", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        bgGO.transform.SetParent(_canvas.transform, false);
        Image bgImg = bgGO.GetComponent<Image>();
        bgImg.color = new Color32(0, 0, 0, 180);
        RectTransform bgRT = bgGO.GetComponent<RectTransform>();
        bgRT.anchorMin = Vector2.zero;
        bgRT.anchorMax = Vector2.one;
        bgRT.offsetMin = Vector2.zero;
        bgRT.offsetMax = Vector2.zero;

        // Main panel
        _panel = new GameObject("Panel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        _panel.transform.SetParent(_canvas.transform, false);
        Image panelImg = _panel.GetComponent<Image>();
        panelImg.color = new Color32(25, 28, 35, 240);
        RectTransform pRT = _panel.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.2f, 0.15f);
        pRT.anchorMax = new Vector2(0.8f, 0.85f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;

        // Title
        Text title = CreateText("Title", _panel.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(20, -36), new Vector2(-20, -4),
            24, TextAnchor.MiddleLeft);
        title.text = "🍺 Bar Shift";
        title.fontStyle = FontStyle.Bold;

        // Earnings display
        _earningsText = CreateText("Earnings", _panel.transform,
            new Vector2(1, 1), new Vector2(1, 1),
            new Vector2(-200, -36), new Vector2(-20, -6),
            18, TextAnchor.MiddleRight);
        _earningsText.text = "Earnings: $0";

        // Customer image area
        _customerImage = new GameObject("Customer", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image)).GetComponent<Image>();
        _customerImage.transform.SetParent(_panel.transform, false);
        RectTransform ciRT = _customerImage.GetComponent<RectTransform>();
        ciRT.anchorMin = new Vector2(0.4f, 0.45f);
        ciRT.anchorMax = new Vector2(0.6f, 0.75f);
        ciRT.offsetMin = Vector2.zero;
        ciRT.offsetMax = Vector2.zero;
        _customerImage.color = new Color32(200, 180, 150, 255);

        // Customer label
        _customerText = CreateText("CustomerLabel", _panel.transform,
            new Vector2(0.3f, 0.35f), new Vector2(0.7f, 0.45f),
            Vector2.zero, Vector2.zero,
            20, TextAnchor.MiddleCenter);
        _customerText.text = "Customer";

        // Order text
        _orderText = CreateText("OrderText", _panel.transform,
            new Vector2(0.3f, 0.28f), new Vector2(0.7f, 0.35f),
            Vector2.zero, Vector2.zero,
            18, TextAnchor.MiddleCenter);
        _orderText.text = "What'll it be?";

        // Drink buttons
        for (int i = 0; i < 3; i++)
        {
            int drinkIndex = i;
            GameObject btnGO = new GameObject($"DrinkBtn_{i}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            btnGO.transform.SetParent(_panel.transform, false);
            Image btnImg = btnGO.GetComponent<Image>();
            btnImg.color = _drinkColors[i];
            btnImg.raycastTarget = true;
            RectTransform btnRT = btnGO.GetComponent<RectTransform>();
            float bx = 0.15f + i * 0.35f;
            btnRT.anchorMin = new Vector2(bx, 0.08f);
            btnRT.anchorMax = new Vector2(bx + 0.25f, 0.18f);
            btnRT.offsetMin = Vector2.zero;
            btnRT.offsetMax = Vector2.zero;

            Text btnText = CreateText($"BtnText_{i}", btnGO.transform,
                Vector2.zero, Vector2.one,
                new Vector2(4, 4), new Vector2(-4, -4),
                16, TextAnchor.MiddleCenter);
            btnText.text = _drinkNames[i];
            btnText.color = new Color32(20, 22, 26, 255);
            btnText.fontStyle = FontStyle.Bold;

            Button btn = btnGO.AddComponent<Button>();
            btn.targetGraphic = btnImg;
            btn.onClick.AddListener(() => ServeDrink(drinkIndex));
        }

        // Status text
        _statusText = CreateText("Status", _panel.transform,
            new Vector2(0.3f, 0.02f), new Vector2(0.7f, 0.08f),
            Vector2.zero, Vector2.zero,
            16, TextAnchor.MiddleCenter);
        _statusText.text = "Customer 1 / " + _totalCustomers;
        _statusText.color = new Color32(150, 150, 150, 255);
    }

    private void NextCustomer()
    {
        _customersServed++;
        if (_customersServed > _totalCustomers)
        {
            EndShift();
            return;
        }

        _currentDrink = Random.Range(0, 3);
        _customerImage.color = new Color32(
            (byte)Random.Range(150, 220),
            (byte)Random.Range(120, 200),
            (byte)Random.Range(100, 180),
            255);
        _customerText.text = $"Customer {_customersServed}";
        _orderText.text = $"I'd like a... {_drinkNames[_currentDrink]}?";
        _orderText.color = _drinkColors[_currentDrink];
        _statusText.text = $"Customer {_customersServed} / {_totalCustomers}";
    }

    private void ServeDrink(int drinkIndex)
    {
        if (_currentDrink < 0) return;

        if (drinkIndex == _currentDrink)
        {
            // Correct!
            _earnings += 6;
            _earningsText.text = $"Earnings: ${_earnings}";
            _orderText.text = "✅ Cheers! Correct!";
            _orderText.color = new Color32(60, 255, 100, 255);
            StartCoroutine(NextCustomerAfterDelay(1f));
        }
        else
        {
            // Wrong!
            _earnings -= 2;
            _earningsText.text = $"Earnings: ${_earnings}";
            _orderText.text = $"❌ Nope, I wanted {_drinkNames[_currentDrink]}!";
            _orderText.color = new Color32(255, 80, 80, 255);
            StartCoroutine(NextCustomerAfterDelay(1.2f));
        }

        _currentDrink = -1;
    }

    private System.Collections.IEnumerator NextCustomerAfterDelay(float delay)
    {
        yield return new WaitForSeconds(delay);
        NextCustomer();
    }

    private void EndShift()
    {
        _orderText.text = $"Shift Complete!";
        _orderText.color = new Color32(255, 220, 60, 255);
        _orderText.fontSize = 28;

        foreach (Transform t in _panel.transform)
        {
            Button b = t.GetComponent<Button>();
            if (b != null) b.interactable = false;
        }

        // Find GameController to add earnings
        GameController gc = FindObjectOfType<GameController>();
        if (gc != null)
        {
            // Access money via reflection or public method
            gc.AddMoney(_earnings);
        }

        StartCoroutine(FinishAfterDelay(2f));
    }

    private System.Collections.IEnumerator FinishAfterDelay(float delay)
    {
        yield return new WaitForSeconds(delay);
        _isActive = false;
        var cb = _onComplete;
        _onComplete = null;
        Destroy(_canvas.gameObject);
        cb?.Invoke(_earnings);
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
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }
}