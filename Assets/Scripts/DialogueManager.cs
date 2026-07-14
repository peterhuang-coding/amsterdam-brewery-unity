using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Interactive dialogue system for Amsterdam Brewery.
/// Triggered by proximity (E key near NPC), shows full-screen dialogue with choices.
/// </summary>
public class DialogueManager : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Canvas _canvas;
    [SerializeField] private GameObject _dialoguePanel;
    [SerializeField] private Image _speakerPortrait;
    [SerializeField] private Text _speakerNameText;
    [SerializeField] private Text _dialogueBodyText;
    [SerializeField] private GameObject _choiceContainer;
    [SerializeField] private Button _choicePrefab;
    [SerializeField] private Button _nextButton;
    [SerializeField] private Text _nextButtonText;
    [SerializeField] private Image _overlay;

    private static DialogueManager _instance;
    public static DialogueManager Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("DialogueManager");
                _instance = go.AddComponent<DialogueManager>();
                DontDestroyOnLoad(go);
                _instance.Initialize();
            }
            return _instance;
        }
    }

    public bool IsDialogueActive { get; private set; }

    private DialogueData _currentDialogue;
    private int _currentLineIndex;
    private System.Action _onComplete;

    // 对话气泡
    private NPCDialogueBubble _bubble;

    // Color mapping for speakers
    private static readonly Dictionary<string, Color32> SpeakerColors = new Dictionary<string, Color32>
    {
        { "player", new Color32(100, 180, 255, 255) },
        { "erik", new Color32(233, 194, 119, 255) },
        { "pablo", new Color32(194, 87, 52, 255) },
        { "chen", new Color32(142, 223, 210, 255) },
        { "sofie", new Color32(220, 110, 140, 255) },
        { "ravi", new Color32(240, 200, 80, 255) },
        { "de_wit", new Color32(100, 100, 180, 255) },
        { "maaike", new Color32(200, 150, 200, 255) },
        { "fatima", new Color32(200, 160, 100, 255) },
    };

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            DontDestroyOnLoad(gameObject);
            Initialize();
        }
        else if (_instance != this)
        {
            Destroy(gameObject);
        }
    }

    private void Initialize()
    {
        if (_canvas != null) return;

        // Create canvas
        GameObject canvasGO = new GameObject("DialogueCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 100;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.GetComponent<CanvasScaler>().matchWidthOrHeight = 0.5f;
        canvasGO.AddComponent<GraphicRaycaster>();

        // Overlay
        GameObject overlayGO = new GameObject("Overlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        overlayGO.transform.SetParent(_canvas.transform, false);
        _overlay = overlayGO.GetComponent<Image>();
        RectTransform oRT = overlayGO.GetComponent<RectTransform>();
        oRT.anchorMin = Vector2.zero;
        oRT.anchorMax = Vector2.one;
        oRT.offsetMin = Vector2.zero;
        oRT.offsetMax = Vector2.zero;
        _overlay.color = new Color32(0, 0, 0, 0);
        _overlay.raycastTarget = true;

        // Dialogue panel
        GameObject panelGO = new GameObject("DialoguePanel", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        panelGO.transform.SetParent(_canvas.transform, false);
        _dialoguePanel = panelGO;
        RectTransform pRT = panelGO.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.05f, 0.08f);
        pRT.anchorMax = new Vector2(0.95f, 0.45f);
        pRT.offsetMin = Vector2.zero;
        pRT.offsetMax = Vector2.zero;
        Image panelImg = panelGO.GetComponent<Image>();
        panelImg.color = new Color32(15, 17, 22, 240);
        panelImg.raycastTarget = false;

        // Speaker name bar
        GameObject speakerBarGO = new GameObject("SpeakerBar", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        speakerBarGO.transform.SetParent(panelGO.transform, false);
        Image speakerBar = speakerBarGO.GetComponent<Image>();
        RectTransform sbRT = speakerBarGO.GetComponent<RectTransform>();
        sbRT.anchorMin = new Vector2(0, 1);
        sbRT.anchorMax = new Vector2(1, 1);
        sbRT.offsetMin = new Vector2(16, -48);
        sbRT.offsetMax = new Vector2(-16, 0);
        speakerBar.color = new Color32(194, 87, 52, 180);

        _speakerNameText = CreateText("SpeakerName", panelGO.transform,
            new Vector2(0, 1), new Vector2(1, 1),
            new Vector2(24, -46), new Vector2(-24, -4),
            22, TextAnchor.MiddleLeft);
        _speakerNameText.fontStyle = FontStyle.Bold;
        _speakerNameText.color = new Color32(246, 240, 229, 255);

        // Body text
        _dialogueBodyText = CreateText("DialogueBody", panelGO.transform,
            new Vector2(0, 0), new Vector2(1, 1),
            new Vector2(24, 64), new Vector2(-24, -56),
            20, TextAnchor.UpperLeft);
        _dialogueBodyText.color = new Color32(235, 228, 215, 255);

        // Choice container
        _choiceContainer = new GameObject("ChoiceContainer", typeof(RectTransform));
        _choiceContainer.transform.SetParent(panelGO.transform, false);
        RectTransform ccRT = _choiceContainer.GetComponent<RectTransform>();
        ccRT.anchorMin = new Vector2(0, 0);
        ccRT.anchorMax = new Vector2(1, 0);
        ccRT.offsetMin = new Vector2(24, 16);
        ccRT.offsetMax = new Vector2(-24, 56);
        _choiceContainer.SetActive(false);

        // Next button
        GameObject nextBtnGO = new GameObject("NextButton", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        nextBtnGO.transform.SetParent(panelGO.transform, false);
        _nextButton = nextBtnGO.AddComponent<Button>();
        RectTransform nbRT = nextBtnGO.GetComponent<RectTransform>();
        nbRT.anchorMin = new Vector2(1, 0);
        nbRT.anchorMax = new Vector2(1, 0);
        nbRT.offsetMin = new Vector2(-180, 12);
        nbRT.offsetMax = new Vector2(-24, 52);
        Image nbImg = nextBtnGO.GetComponent<Image>();
        nbImg.color = new Color32(236, 180, 87, 255);
        nbImg.raycastTarget = true;

        _nextButtonText = CreateText("NextBtnText", nextBtnGO.transform,
            Vector2.zero, Vector2.one,
            new Vector2(8, 8), new Vector2(-8, -8),
            16, TextAnchor.MiddleCenter);
        _nextButtonText.color = new Color32(20, 22, 26, 255);
        _nextButtonText.fontStyle = FontStyle.Bold;
        _nextButtonText.text = "Next";

        _nextButton.onClick.AddListener(AdvanceDialogue);
        _nextButton.gameObject.SetActive(false);

        // Set initial state
        _dialoguePanel.SetActive(false);
        _overlay.gameObject.SetActive(false);

        // 创建对话气泡
        GameObject bubbleGO = new GameObject("NPCDialogueBubble");
        bubbleGO.transform.SetParent(transform);
        _bubble = bubbleGO.AddComponent<NPCDialogueBubble>();
    }

    public void ShowDialogueById(string dialogueId, System.Action onComplete = null)
    {
        TextAsset asset = Resources.Load<TextAsset>($"Data/dialogue/zh/{dialogueId}");
        if (asset == null)
        {
            Debug.LogWarning($"Dialogue not found: {dialogueId}");
            onComplete?.Invoke();
            return;
        }

        DialogueData data = JsonUtility.FromJson<DialogueData>(asset.text);
        ShowDialogue(dialogueId, data, onComplete);
    }

    public void ShowDialogue(string dialogueId, DialogueData data, System.Action onComplete = null)
    {
        if (data == null || data.lines == null || data.lines.Length == 0)
        {
            onComplete?.Invoke();
            return;
        }

        _currentDialogue = data;
        _currentLineIndex = 0;
        _onComplete = onComplete;

        IsDialogueActive = true;
        _dialoguePanel.SetActive(true);
        _overlay.gameObject.SetActive(true);
        _overlay.color = new Color32(0, 0, 0, 180);
        _overlay.raycastTarget = true;

        // Record dialogue start in DialogueLog
        if (DialogueLog.Instance != null && data.lines != null && data.lines.Length > 0)
        {
            string firstSpeaker = data.lines[0].speaker;
            string firstText = data.lines[0].text;
            DialogueLog.Instance.RecordDialogue(dialogueId, firstSpeaker, firstText, 1, null);
        }

        // 显示对话气泡（第一行）
        DialogueLine firstLine = data.lines[0];
        if (_bubble != null)
        {
            _bubble.ShowBubble(firstLine.text, null, Vector3.zero);
            _bubble.SetExpression(firstLine.expression);
        }

        RenderLine();
    }

    private void RenderLine()
    {
        if (_currentDialogue == null || _currentDialogue.lines == null ||
            _currentLineIndex >= _currentDialogue.lines.Length)
        {
            // Check for choices at end
            if (_currentDialogue.choices != null && _currentDialogue.choices.Length > 0)
            {
                ShowChoices();
                return;
            }
            EndDialogue();
            return;
        }

        DialogueLine line = _currentDialogue.lines[_currentLineIndex];

        // Record each dialogue line in DialogueLog
        if (DialogueLog.Instance != null)
        {
            DialogueLog.Instance.RecordDialogueLine(line.speaker, line.text);
        }

        // 更新对话气泡
        if (_bubble != null)
        {
            _bubble.UpdateText(line.text);
            _bubble.SetExpression(line.expression);
        }

        // Set speaker name and color
        string speakerName = GetSpeakerName(line.speaker);
        _speakerNameText.text = speakerName;

        if (SpeakerColors.TryGetValue(line.speaker, out Color32 color))
        {
            Transform parent = _speakerNameText.transform.parent;
            Image bar = parent.GetComponent<Image>();
            if (bar != null) bar.color = color;
        }

        // Set body text
        _dialogueBodyText.text = line.text;

        // Update button
        bool isLastLine = _currentLineIndex >= _currentDialogue.lines.Length - 1;
        bool hasChoices = _currentDialogue.choices != null && _currentDialogue.choices.Length > 0;
        _nextButton.gameObject.SetActive(true);
        _nextButtonText.text = isLastLine && !hasChoices ? "Finish" : "Next";
        _choiceContainer.SetActive(false);
    }

    public void AdvanceDialogue()
    {
        if (_currentDialogue == null) return;

        _currentLineIndex++;
        RenderLine();
    }

    private void ShowChoices()
    {
        _nextButton.gameObject.SetActive(false);
        _dialogueBodyText.text = "";
        _choiceContainer.SetActive(true);

        // Clear old choices
        foreach (Transform child in _choiceContainer.transform)
        {
            Destroy(child.gameObject);
        }

        float yOffset = 0;
        int choiceIndex = 0;
        foreach (DialogueChoice choice in _currentDialogue.choices)
        {
            GameObject choiceGO = new GameObject($"Choice_{choice.id}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            choiceGO.transform.SetParent(_choiceContainer.transform, false);

            RectTransform crt = choiceGO.GetComponent<RectTransform>();
            crt.anchorMin = new Vector2(0, 1);
            crt.anchorMax = new Vector2(1, 1);
            crt.offsetMin = new Vector2(0, -yOffset - 40);
            crt.offsetMax = new Vector2(0, -yOffset);
            crt.pivot = new Vector2(0.5f, 1);

            Image bg = choiceGO.GetComponent<Image>();
            bg.color = new Color32(50, 55, 65, 200);
            bg.raycastTarget = true;

            // Keyboard hint (e.g. "[1]") for first 3 choices
            string keyHint = choiceIndex < 3 ? $"[{choiceIndex + 1}] " : "";
            Text choiceText = choiceGO.AddComponent<Text>();
            choiceText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            choiceText.fontSize = 16;
            choiceText.color = new Color32(235, 228, 215, 255);
            choiceText.alignment = TextAnchor.MiddleLeft;
            choiceText.text = $"  {keyHint}{choice.text}";
            RectTransform trt = choiceText.GetComponent<RectTransform>();
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.offsetMin = Vector2.zero;
            trt.offsetMax = Vector2.zero;

            Button btn = choiceGO.AddComponent<Button>();
            string capturedId = choice.id;
            btn.onClick.AddListener(() => OnChoiceSelected(capturedId));
            btn.targetGraphic = bg;

            // Hover effect
            ColorBlock cb = btn.colors;
            cb.highlightedColor = new Color32(70, 80, 100, 200);
            btn.colors = cb;

            yOffset += 44;
            choiceIndex++;
        }

        RectTransform ccRT = _choiceContainer.GetComponent<RectTransform>();
        ccRT.offsetMin = new Vector2(24, 16);
        ccRT.offsetMax = new Vector2(-24, 16 + yOffset + 8);
    }

    private void OnChoiceSelected(string choiceId)
    {
        if (_currentDialogue?.choices != null)
        {
            foreach (DialogueChoice choice in _currentDialogue.choices)
            {
                if (choice.id == choiceId && choice.outcome != null)
                {
                    ProcessOutcome(choice.outcome);
                    break;
                }
            }
        }
        EndDialogue();
    }

    private void ProcessOutcome(DialogueOutcome outcome)
    {
        // Update affection
        if (outcome.pablo_affection != 0)
            InventorySystem.Instance.AddAffection("pablo", outcome.pablo_affection);
        if (outcome.erik_affection != 0)
            InventorySystem.Instance.AddAffection("erik", outcome.erik_affection);
        if (outcome.sofie_affection != 0)
            InventorySystem.Instance.AddAffection("sofie", outcome.sofie_affection);
        if (outcome.ravi_affection != 0)
            InventorySystem.Instance.AddAffection("ravi", outcome.ravi_affection);
        if (outcome.de_wit_affection != 0)
            InventorySystem.Instance.AddAffection("de_wit", outcome.de_wit_affection);
        if (outcome.maaike_affection != 0)
            InventorySystem.Instance.AddAffection("maaike", outcome.maaike_affection);
        if (outcome.chen_affection != 0)
            InventorySystem.Instance.AddAffection("chen", outcome.chen_affection);

        // Update money
        if (outcome.money != 0)
        {
            GameController gc = GameController.Instance;
            if (gc != null)
            {
                if (outcome.money > 0)
                    gc.AddMoney(outcome.money);
                else
                    gc.AddMoney(outcome.money);
            }
        }

        // Unlock system
        if (!string.IsNullOrEmpty(outcome.unlock_system))
            InventorySystem.Instance.UnlockSystem(outcome.unlock_system);

        // Add item
        if (!string.IsNullOrEmpty(outcome.item))
            InventorySystem.Instance.AddItem(outcome.item, outcome.item);

        // Unlock lore
        if (!string.IsNullOrEmpty(outcome.lore_unlock))
            InventorySystem.Instance.UnlockLore(outcome.lore_unlock, $"Lore: {outcome.lore_unlock}");

        // Academic progress
        if (outcome.academic_progress != 0)
            InventorySystem.Instance.AddAcademicProgress(outcome.academic_progress);

        // F2: Show feedback based on outcome
        ShowOutcomeFeedback(outcome);
    }

    // F2: Display dialogue choice result feedback
    private void ShowOutcomeFeedback(DialogueOutcome outcome)
    {
        string feedback = "";
        if (outcome.erik_affection > 0) feedback += $"+{outcome.erik_affection} Erik affection ";
        if (outcome.pablo_affection > 0) feedback += $"+{outcome.pablo_affection} Pablo affection ";
        if (outcome.sofie_affection > 0) feedback += $"+{outcome.sofie_affection} Sofie affection ";
        if (outcome.ravi_affection > 0) feedback += $"+{outcome.ravi_affection} Ravi affection ";
        if (outcome.de_wit_affection > 0) feedback += $"+{outcome.de_wit_affection} De Wit affection ";
        if (outcome.maaike_affection > 0) feedback += $"+{outcome.maaike_affection} Maaike affection ";
        if (outcome.chen_affection > 0) feedback += $"+{outcome.chen_affection} Chen affection ";
        if (outcome.money > 0) feedback += $"+${outcome.money} ";
        if (!string.IsNullOrEmpty(outcome.unlock_system)) feedback += $"Unlocked: {outcome.unlock_system} ";
        if (!string.IsNullOrEmpty(outcome.item)) feedback += $"+1 {outcome.item} ";
        if (outcome.academic_progress > 0) feedback += $"+{outcome.academic_progress} Academic Progress ";

        if (!string.IsNullOrEmpty(feedback))
        {
            GameController gc = GameController.Instance;
            if (gc != null)
            {
                gc.ShowResultFeedback(feedback.Trim());
            }
        }
    }

    private void EndDialogue()
    {
        IsDialogueActive = false;
        _dialoguePanel.SetActive(false);
        _overlay.gameObject.SetActive(false);
        _overlay.color = new Color32(0, 0, 0, 0);
        _overlay.raycastTarget = false;
        _choiceContainer.SetActive(false);

        // 隐藏对话气泡
        if (_bubble != null)
        {
            _bubble.HideBubble();
        }

        System.Action callback = _onComplete;
        _currentDialogue = null;
        _currentLineIndex = 0;
        _onComplete = null;

        callback?.Invoke();
    }

    private void Update()
    {
        if (!IsDialogueActive || _currentDialogue == null) return;

        if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return))
        {
            if (_nextButton.gameObject.activeSelf)
            {
                AdvanceDialogue();
            }
        }

        // Keyboard shortcuts for dialogue choices (1/2/3)
        if (_choiceContainer != null && _choiceContainer.activeSelf && _currentDialogue?.choices != null)
        {
            for (int i = 0; i < _currentDialogue.choices.Length && i < 3; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1 + i))
                {
                    OnChoiceSelected(_currentDialogue.choices[i].id);
                    return;
                }
            }
        }
    }

    private string GetSpeakerName(string speakerId)
    {
        if (speakerId == "player") return "Lu Jian";
        if (speakerId == "erik") return "Erik de Vries";
        if (speakerId == "pablo") return "Pablo Castillo";
        if (speakerId == "chen") return "Chen Wei";
        if (speakerId == "sofie") return "Sofie van den Berg";
        if (speakerId == "ravi") return "Ravi Patel";
        if (speakerId == "de_wit") return "Inspector de Wit";
        if (speakerId == "maaike") return "Maaike Brouwer";
        if (speakerId == "fatima") return "Fatima El Idrissi";
        return speakerId;
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