using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// NPC头顶对话气泡组件。
/// 使用 Canvas 渲染，固定在屏幕中央偏上位置。
/// 表情用文字标记（如 [Happy]）而非 emoji，适配 LegacyRuntime.ttf。
/// </summary>
public class NPCDialogueBubble : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Canvas _canvas;
    [SerializeField] private Image _bubbleBackground;
    [SerializeField] private Text _bubbleText;
    [SerializeField] private Text _expressionText;

    // 气泡锚点位置（屏幕中央偏上）
    private static readonly Vector2 BubbleAnchorMin = new Vector2(0.35f, 0.65f);
    private static readonly Vector2 BubbleAnchorMax = new Vector2(0.65f, 0.75f);

    // 表情文字映射（LegacyRuntime.ttf 不支持 emoji，使用文字替代）
    private static readonly Dictionary<string, string> ExpressionText = new Dictionary<string, string>
    {
        { "happy", "[Happy]" },
        { "sad", "[Sad]" },
        { "angry", "[Angry]" },
        { "surprised", "[Surprised]" },
        { "neutral", "[Neutral]" },
        { "thinking", "[Thinking]" },
        { "laugh", "[Laugh]" },
        { "cry", "[Cry]" },
    };

    private Coroutine _typewriterCoroutine;
    private Coroutine _hideCoroutine;
    private CanvasGroup _canvasGroup;
    private string _currentText;
    private float _typewriterSpeed = 0.03f;

    private void Awake()
    {
        Initialize();
    }

    private void Initialize()
    {
        if (_canvas != null) return;

        // 创建 Canvas（sortingOrder = 400，确保在所有 UI 上方）
        GameObject canvasGO = new GameObject("DialogueBubbleCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 400;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.GetComponent<CanvasScaler>().matchWidthOrHeight = 0.5f;
        canvasGO.AddComponent<GraphicRaycaster>();

        // CanvasGroup 用于渐出动画
        _canvasGroup = canvasGO.AddComponent<CanvasGroup>();
        _canvasGroup.alpha = 0f;
        _canvasGroup.blocksRaycasts = false;

        Transform root = _canvas.transform;

        // 气泡背景（白色半透明，圆角效果通过整体半透明实现）
        GameObject bgGO = new GameObject("BubbleBackground", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        bgGO.transform.SetParent(root, false);
        _bubbleBackground = bgGO.GetComponent<Image>();
        RectTransform bgRT = bgGO.GetComponent<RectTransform>();
        bgRT.anchorMin = BubbleAnchorMin;
        bgRT.anchorMax = BubbleAnchorMax;
        bgRT.offsetMin = Vector2.zero;
        bgRT.offsetMax = Vector2.zero;
        _bubbleBackground.color = new Color32(255, 255, 255, 230);
        _bubbleBackground.raycastTarget = false;

        // 三角指针（指向下方的小三角，用 Image 模拟）
        GameObject pointerGO = new GameObject("BubblePointer", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        pointerGO.transform.SetParent(bgGO.transform, false);
        Image pointerImg = pointerGO.GetComponent<Image>();
        RectTransform pRT = pointerGO.GetComponent<RectTransform>();
        pRT.anchorMin = new Vector2(0.5f, 0);
        pRT.anchorMax = new Vector2(0.5f, 0);
        pRT.sizeDelta = new Vector2(16, 12);
        pRT.anchoredPosition = new Vector2(0, -6);
        pointerImg.color = new Color32(255, 255, 255, 230);
        pointerImg.raycastTarget = false;

        // 表情文字（气泡左上方，较小字体）
        GameObject exprGO = new GameObject("ExpressionText", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        exprGO.transform.SetParent(bgGO.transform, false);
        _expressionText = exprGO.GetComponent<Text>();
        RectTransform eRT = exprGO.GetComponent<RectTransform>();
        eRT.anchorMin = new Vector2(0, 1);
        eRT.anchorMax = new Vector2(0, 1);
        eRT.offsetMin = new Vector2(8, -22);
        eRT.offsetMax = new Vector2(80, -2);
        _expressionText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        _expressionText.fontSize = 14;
        _expressionText.alignment = TextAnchor.MiddleLeft;
        _expressionText.color = new Color32(80, 80, 80, 255);
        _expressionText.text = "";
        _expressionText.horizontalOverflow = HorizontalWrapMode.Overflow;
        _expressionText.verticalOverflow = VerticalWrapMode.Truncate;

        // 主文字内容
        GameObject textGO = new GameObject("BubbleText", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        textGO.transform.SetParent(bgGO.transform, false);
        _bubbleText = textGO.GetComponent<Text>();
        RectTransform tRT = textGO.GetComponent<RectTransform>();
        tRT.anchorMin = Vector2.zero;
        tRT.anchorMax = Vector2.one;
        tRT.offsetMin = new Vector2(8, 8);
        tRT.offsetMax = new Vector2(-8, -24);
        _bubbleText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        _bubbleText.fontSize = 16;
        _bubbleText.alignment = TextAnchor.MiddleCenter;
        _bubbleText.color = new Color32(30, 30, 30, 255);
        _bubbleText.text = "";
        _bubbleText.horizontalOverflow = HorizontalWrapMode.Wrap;
        _bubbleText.verticalOverflow = VerticalWrapMode.Truncate;

        // 初始隐藏
        _canvas.enabled = false;
    }

    /// <summary>
    /// 在目标上方显示气泡。
    /// </summary>
    public void ShowBubble(string text, Transform target, Vector3 offset)
    {
        // 简化实现：气泡固定在屏幕位置，忽略 target（因为 2.5D 模式 NPC 不在场景中）
        if (_canvas == null) Initialize();

        _canvas.enabled = true;
        _canvasGroup.alpha = 1f;
        _currentText = text;

        // 立即显示文字（不使用 typewriter 的初始显示）
        _bubbleText.text = text;
        _expressionText.text = "";

        // 停止之前的协程
        if (_hideCoroutine != null)
        {
            StopCoroutine(_hideCoroutine);
            _hideCoroutine = null;
        }
    }

    /// <summary>
    /// 更新气泡文字（typewriter 效果，0.03s/字）。
    /// </summary>
    public void UpdateText(string text)
    {
        if (_canvas == null) Initialize();

        _currentText = text;

        // 停止之前的 typewriter
        if (_typewriterCoroutine != null)
        {
            StopCoroutine(_typewriterCoroutine);
        }

        _typewriterCoroutine = StartCoroutine(TypewriterRoutine(text));
    }

    /// <summary>
    /// typewriter 协程：逐字显示文字。
    /// </summary>
    private IEnumerator TypewriterRoutine(string text)
    {
        _bubbleText.text = "";
        if (string.IsNullOrEmpty(text))
        {
            _typewriterCoroutine = null;
            yield break;
        }

        for (int i = 0; i < text.Length; i++)
        {
            _bubbleText.text += text[i];
            yield return new WaitForSeconds(_typewriterSpeed);
        }

        _typewriterCoroutine = null;
    }

    /// <summary>
    /// 显示表情符号（文字标记形式）。
    /// </summary>
    public void ShowExpression(string expressionId)
    {
        SetExpression(expressionId);
    }

    /// <summary>
    /// 设置表情文字。
    /// </summary>
    public void SetExpression(string expression)
    {
        if (_expressionText == null) return;

        if (!string.IsNullOrEmpty(expression) && ExpressionText.TryGetValue(expression, out string emojiText))
        {
            _expressionText.text = emojiText;
        }
        else
        {
            _expressionText.text = "";
        }
    }

    /// <summary>
    /// 渐出隐藏气泡（0.3s）。
    /// </summary>
    public void HideBubble()
    {
        if (_canvas == null || !_canvas.enabled) return;

        // 停止 typewriter
        if (_typewriterCoroutine != null)
        {
            StopCoroutine(_typewriterCoroutine);
            _typewriterCoroutine = null;
        }

        // 停止之前的隐藏协程
        if (_hideCoroutine != null)
        {
            StopCoroutine(_hideCoroutine);
        }

        _hideCoroutine = StartCoroutine(HideRoutine());
    }

    /// <summary>
    /// 渐出隐藏协程。
    /// </summary>
    private IEnumerator HideRoutine()
    {
        float duration = 0.3f;
        float elapsed = 0f;

        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            _canvasGroup.alpha = Mathf.Lerp(1f, 0f, elapsed / duration);
            yield return null;
        }

        _canvasGroup.alpha = 0f;
        _canvas.enabled = false;
        _hideCoroutine = null;
    }
}
