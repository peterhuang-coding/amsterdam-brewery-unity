using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public sealed class GameController : MonoBehaviour
{
    private readonly string[] _timesOfDay = { "dawn", "morning", "afternoon", "evening", "night", "late_night" };
    private readonly HashSet<string> _triggeredDialogueIds = new HashSet<string>();
    private readonly Dictionary<string, LocationView> _locations = new Dictionary<string, LocationView>
    {
        {
            "de_pijp",
            new LocationView(
                "De Pijp Apartment",
                "A small borrowed room above the market. Rent is due; ideas are cheap.",
                new Color32(47, 55, 66, 255),
                new Color32(194, 87, 52, 255),
                new Color32(245, 177, 90, 255))
        },
        {
            "science_park",
            new LocationView(
                "Science Park Lab",
                "Morning lectures, prototype ethics, and fluorescent coffee.",
                new Color32(24, 56, 66, 255),
                new Color32(55, 151, 164, 255),
                new Color32(142, 223, 210, 255))
        },
        {
            "tweede_kans",
            new LocationView(
                "Tweede Kans Bar",
                "An old Amsterdam bar running on habit, memory, and unpaid favors.",
                new Color32(42, 35, 28, 255),
                new Color32(154, 111, 45, 255),
                new Color32(233, 194, 119, 255))
        },
    };

    private int _currentDay = 1;
    private int _timeIndex;
    private int _money = 250;
    private string _currentLocation = "de_pijp";

    private bool _barOpen;
    private int _barServed;
    private int _barRevenue;

    private EventDatabase _eventDatabase;
    private DialogueData _activeDialogue;
    private int _dialogueLineIndex;

    private Font _font;
    private Image _background;
    private Image _accentPanel;
    private Text _timeText;
    private Text _locationText;
    private Text _barText;
    private Text _moneyText;
    private Text _titleText;
    private Text _subtitleText;
    private Text _hintText;
    private Text _feedbackText;
    private GameObject _dialoguePanel;
    private Text _dialogueSpeakerText;
    private Text _dialogueBodyText;
    private Text _dialogueButtonText;

    private void Awake()
    {
        _font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        LoadData();
        BuildInterface();
        RenderLocation();
        RefreshHud();
        CheckStoryEvents();
    }

    private void Update()
    {
        if (_activeDialogue != null)
        {
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return))
            {
                AdvanceDialogue();
            }
            return;
        }

        if (Input.GetKeyDown(KeyCode.Space))
        {
            AdvanceTime();
        }
        else if (Input.GetKeyDown(KeyCode.Alpha1))
        {
            SwitchLocation("de_pijp");
        }
        else if (Input.GetKeyDown(KeyCode.Alpha2))
        {
            SwitchLocation("science_park");
        }
        else if (Input.GetKeyDown(KeyCode.Alpha3))
        {
            SwitchLocation("tweede_kans");
        }
        else if (Input.GetKeyDown(KeyCode.B))
        {
            OpenBar();
        }
        else if (Input.GetKeyDown(KeyCode.S))
        {
            ServeCustomer();
        }
        else if (Input.GetKeyDown(KeyCode.C))
        {
            CloseBar();
        }
    }

    private void LoadData()
    {
        TextAsset eventsAsset = Resources.Load<TextAsset>("Data/events");
        if (eventsAsset != null)
        {
            _eventDatabase = JsonUtility.FromJson<EventDatabase>(eventsAsset.text);
        }
        else
        {
            Debug.LogWarning("Missing Resources/Data/events.json");
            _eventDatabase = new EventDatabase { events = new StoryEvent[0] };
        }
    }

    private void BuildInterface()
    {
        Camera camera = new GameObject("Main Camera").AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color32(12, 14, 18, 255);
        camera.orthographic = true;

        Canvas canvas = new GameObject("Prototype Canvas").AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        CanvasScaler scaler = canvas.gameObject.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        scaler.matchWidthOrHeight = 0.5f;
        canvas.gameObject.AddComponent<GraphicRaycaster>();
        new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));

        _background = CreateImage("Location Background", canvas.transform, StretchFull(), new Color32(30, 34, 40, 255));
        CreateImage("Top HUD Backplate", canvas.transform, StretchTop(96), new Color32(10, 14, 18, 225));
        CreateImage("Bottom Hint Backplate", canvas.transform, StretchBottom(58), new Color32(10, 14, 18, 215));

        _accentPanel = CreateImage("Location Accent Panel", canvas.transform, Anchored(760, 260, 460, 120), new Color32(194, 87, 52, 255));
        CreateImage("Left Info Plate", canvas.transform, Anchored(42, 132, 470, 392), new Color32(255, 255, 255, 24));
        CreateImage("Right Mood Plate", canvas.transform, Anchored(760, 420, 460, 170), new Color32(255, 255, 255, 22));

        _timeText = CreateText("Time Text", canvas.transform, Anchored(36, 22, 260, 34), 21, TextAnchor.MiddleLeft);
        _locationText = CreateText("Location Text", canvas.transform, Anchored(330, 22, 310, 34), 21, TextAnchor.MiddleLeft);
        _barText = CreateText("Bar Text", canvas.transform, Anchored(674, 22, 390, 34), 19, TextAnchor.MiddleLeft);
        _moneyText = CreateText("Money Text", canvas.transform, Anchored(1084, 22, 160, 34), 21, TextAnchor.MiddleRight);

        _titleText = CreateText("Location Title", canvas.transform, Anchored(58, 152, 620, 52), 38, TextAnchor.MiddleLeft);
        _subtitleText = CreateText("Location Subtitle", canvas.transform, Anchored(60, 214, 560, 92), 21, TextAnchor.UpperLeft);
        _feedbackText = CreateText("Feedback Text", canvas.transform, Anchored(62, 330, 610, 52), 20, TextAnchor.MiddleLeft);
        _hintText = CreateText("Input Hint", canvas.transform, StretchBottom(58), 18, TextAnchor.MiddleCenter);

        BuildDialoguePanel(canvas.transform);
    }

    private void BuildDialoguePanel(Transform parent)
    {
        _dialoguePanel = CreateImage("Dialogue Panel", parent, StretchBottom(190, 28, 28), new Color32(15, 17, 22, 242)).gameObject;
        _dialogueSpeakerText = CreateText("Dialogue Speaker", _dialoguePanel.transform, StretchTop(42, 24, 18), 22, TextAnchor.MiddleLeft);
        _dialogueBodyText = CreateText("Dialogue Body", _dialoguePanel.transform, StretchFull(24, 54, 178, 54), 22, TextAnchor.UpperLeft);

        GameObject buttonObject = CreateImage("Dialogue Next Button", _dialoguePanel.transform, AnchoredBottomRight(148, 42, 22, 18), new Color32(236, 180, 87, 255)).gameObject;
        Button button = buttonObject.AddComponent<Button>();
        button.onClick.AddListener(AdvanceDialogue);
        _dialogueButtonText = CreateText("Dialogue Button Text", buttonObject.transform, StretchFull(), 18, TextAnchor.MiddleCenter);
        _dialogueButtonText.color = new Color32(20, 22, 26, 255);
        _dialoguePanel.SetActive(false);
    }

    private void AdvanceTime()
    {
        _timeIndex++;
        if (_timeIndex >= _timesOfDay.Length)
        {
            _timeIndex = 0;
            _currentDay++;
        }
        SetFeedback("Time moves. The city keeps its own schedule.");
        RefreshHud();
        CheckStoryEvents();
    }

    private void SwitchLocation(string locationId)
    {
        _currentLocation = locationId;
        RenderLocation();
        RefreshHud();
        CheckStoryEvents();
    }

    private void OpenBar()
    {
        if (_barOpen)
        {
            SetFeedback("Tweede Kans is already open.");
            return;
        }
        _barOpen = true;
        _barServed = 0;
        _barRevenue = 0;
        SetFeedback("You open the bar. The first glasses wait behind the counter.");
        RefreshHud();
    }

    private void ServeCustomer()
    {
        if (!_barOpen)
        {
            SetFeedback("The bar is closed. Press B to open it first.");
            return;
        }
        _barServed++;
        _barRevenue += 6;
        SetFeedback("Served one regular. Revenue +$6.");
        RefreshHud();
    }

    private void CloseBar()
    {
        if (!_barOpen)
        {
            SetFeedback("No shift to close yet.");
            return;
        }
        _barOpen = false;
        _money += _barRevenue;
        SetFeedback($"Shift closed: {_barServed} served, ${_barRevenue} earned.");
        RefreshHud();
    }

    private void CheckStoryEvents()
    {
        if (_eventDatabase == null || _eventDatabase.events == null)
        {
            return;
        }

        foreach (StoryEvent storyEvent in _eventDatabase.events)
        {
            if (storyEvent.day != _currentDay)
            {
                continue;
            }
            if (storyEvent.time != CurrentTime() || storyEvent.location != _currentLocation)
            {
                continue;
            }
            if (string.IsNullOrEmpty(storyEvent.dialogue_id) || _triggeredDialogueIds.Contains(storyEvent.dialogue_id))
            {
                continue;
            }
            _triggeredDialogueIds.Add(storyEvent.dialogue_id);
            ShowDialogue(storyEvent.dialogue_id);
            return;
        }
    }

    private void ShowDialogue(string dialogueId)
    {
        TextAsset dialogueAsset = Resources.Load<TextAsset>($"Data/dialogue/zh/{dialogueId}");
        if (dialogueAsset == null)
        {
            SetFeedback($"Missing dialogue: {dialogueId}");
            return;
        }
        _activeDialogue = JsonUtility.FromJson<DialogueData>(dialogueAsset.text);
        _dialogueLineIndex = 0;
        RenderDialogueLine();
    }

    private void AdvanceDialogue()
    {
        if (_activeDialogue == null)
        {
            return;
        }
        _dialogueLineIndex++;
        RenderDialogueLine();
    }

    private void RenderDialogueLine()
    {
        if (_activeDialogue == null || _activeDialogue.lines == null || _dialogueLineIndex >= _activeDialogue.lines.Length)
        {
            _activeDialogue = null;
            _dialoguePanel.SetActive(false);
            SetFeedback("Dialogue finished.");
            return;
        }

        DialogueLine line = _activeDialogue.lines[_dialogueLineIndex];
        _dialogueSpeakerText.text = SpeakerName(line.speaker);
        _dialogueBodyText.text = line.text;
        _dialogueButtonText.text = _dialogueLineIndex >= _activeDialogue.lines.Length - 1 ? "Finish" : "Next";
        _dialoguePanel.SetActive(true);
    }

    private string SpeakerName(string speakerId)
    {
        if (speakerId == "player")
        {
            return "Lu Jian";
        }
        if (speakerId == "pablo")
        {
            return "Pablo";
        }
        if (speakerId == "erik")
        {
            return "Erik";
        }
        return speakerId;
    }

    private void RenderLocation()
    {
        LocationView location = _locations[_currentLocation];
        _background.color = location.background;
        _accentPanel.color = location.accent;
        _titleText.text = location.title;
        _subtitleText.text = location.subtitle;
        _feedbackText.text = "Pick a loop: move time, switch places, work the bar, or find a conversation.";
        _hintText.text = "Space: advance / dialogue next    1 De Pijp    2 Science Park    3 Tweede Kans    B open bar    S serve    C close";
    }

    private void RefreshHud()
    {
        _timeText.text = $"Day {_currentDay} / {CurrentTimeLabel()}";
        _locationText.text = _locations[_currentLocation].title;
        _barText.text = $"Bar: {(_barOpen ? "Open" : "Closed")}  Served: {_barServed}  Revenue: ${_barRevenue}";
        _moneyText.text = $"Money ${_money}";
    }

    private string CurrentTime()
    {
        return _timesOfDay[_timeIndex];
    }

    private string CurrentTimeLabel()
    {
        string raw = CurrentTime();
        return raw.Replace("_", " ");
    }

    private void SetFeedback(string message)
    {
        _feedbackText.text = message;
    }

    private Image CreateImage(string objectName, Transform parent, RectSpec rect, Color color)
    {
        GameObject gameObject = new GameObject(objectName, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        gameObject.transform.SetParent(parent, false);
        ApplyRect(gameObject.GetComponent<RectTransform>(), rect);
        Image image = gameObject.GetComponent<Image>();
        image.color = color;
        return image;
    }

    private Text CreateText(string objectName, Transform parent, RectSpec rect, int fontSize, TextAnchor alignment)
    {
        GameObject gameObject = new GameObject(objectName, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        gameObject.transform.SetParent(parent, false);
        ApplyRect(gameObject.GetComponent<RectTransform>(), rect);
        Text text = gameObject.GetComponent<Text>();
        text.font = _font;
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    private static void ApplyRect(RectTransform transform, RectSpec rect)
    {
        transform.anchorMin = rect.anchorMin;
        transform.anchorMax = rect.anchorMax;
        transform.offsetMin = rect.offsetMin;
        transform.offsetMax = rect.offsetMax;
    }

    private static RectSpec StretchFull(float left = 0, float bottom = 0, float right = 0, float top = 0)
    {
        return new RectSpec(Vector2.zero, Vector2.one, new Vector2(left, bottom), new Vector2(-right, -top));
    }

    private static RectSpec StretchTop(float height, float left = 0, float right = 0)
    {
        return new RectSpec(new Vector2(0, 1), Vector2.one, new Vector2(left, -height), new Vector2(-right, 0));
    }

    private static RectSpec StretchBottom(float height, float left = 0, float right = 0)
    {
        return new RectSpec(Vector2.zero, new Vector2(1, 0), new Vector2(left, 0), new Vector2(-right, height));
    }

    private static RectSpec Anchored(float left, float top, float width, float height)
    {
        return new RectSpec(new Vector2(0, 1), new Vector2(0, 1), new Vector2(left, -top - height), new Vector2(left + width, -top));
    }

    private static RectSpec AnchoredBottomRight(float width, float height, float right, float bottom)
    {
        return new RectSpec(new Vector2(1, 0), new Vector2(1, 0), new Vector2(-right - width, bottom), new Vector2(-right, bottom + height));
    }

    private readonly struct RectSpec
    {
        public readonly Vector2 anchorMin;
        public readonly Vector2 anchorMax;
        public readonly Vector2 offsetMin;
        public readonly Vector2 offsetMax;

        public RectSpec(Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            this.anchorMin = anchorMin;
            this.anchorMax = anchorMax;
            this.offsetMin = offsetMin;
            this.offsetMax = offsetMax;
        }
    }

    private sealed class LocationView
    {
        public readonly string title;
        public readonly string subtitle;
        public readonly Color background;
        public readonly Color accent;
        public readonly Color highlight;

        public LocationView(string title, string subtitle, Color background, Color accent, Color highlight)
        {
            this.title = title;
            this.subtitle = subtitle;
            this.background = background;
            this.accent = accent;
            this.highlight = highlight;
        }
    }
}
