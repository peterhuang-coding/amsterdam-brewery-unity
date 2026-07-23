using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Shared UI factory helpers for runtime-generated Unity UI.
/// RectSpec, image/text creation, and common layout presets.
/// </summary>
public static class UIFactory
{
    public static Font GetFont() => Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

    public static Image MakeImage(string name, Transform parent, RectSpec rect, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), rect);
        Image img = go.GetComponent<Image>();
        img.color = color;
        return img;
    }

    public static Text MakeText(string name, Transform parent, RectSpec rect, int fontSize, TextAnchor alignment, Font font = null)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), rect);
        Text text = go.GetComponent<Text>();
        text.font = font ?? GetFont();
        text.fontSize = fontSize;
        text.alignment = alignment;
        text.color = new Color32(246, 240, 229, 255);
        text.horizontalOverflow = HorizontalWrapMode.Wrap;
        text.verticalOverflow = VerticalWrapMode.Truncate;
        return text;
    }

    public static Button MakeButton(string name, Transform parent, RectSpec rect, Color32 color,
        string label, UnityEngine.Events.UnityAction action, Font font = null)
    {
        Image bg = MakeImage(name, parent, rect, color);
        Button button = bg.gameObject.AddComponent<Button>();
        button.onClick.AddListener(action);

        Text labelText = MakeText(name + " Label", bg.transform, StretchFull(4, 2, 4, 2), 16, TextAnchor.MiddleCenter, font);
        labelText.text = label;
        labelText.color = new Color32(246, 240, 229, 255);
        labelText.fontStyle = FontStyle.Bold;
        labelText.alignment = TextAnchor.MiddleCenter;

        ColorBlock cb = button.colors;
        cb.normalColor = color;
        cb.highlightedColor = new Color32(
            (byte)System.Math.Min(color.r + 40, 255),
            (byte)System.Math.Min(color.g + 40, 255),
            (byte)System.Math.Min(color.b + 40, 255), 230);
        cb.pressedColor = new Color32(
            (byte)System.Math.Max(color.r - 20, 0),
            (byte)System.Math.Max(color.g - 20, 0),
            (byte)System.Math.Max(color.b - 20, 0), 230);
        cb.disabledColor = new Color32(60, 55, 50, 120);
        cb.colorMultiplier = 1f;
        button.colors = cb;

        return button;
    }

    public static void ApplyRect(RectTransform rt, RectSpec spec)
    {
        rt.anchorMin = spec.anchorMin;
        rt.anchorMax = spec.anchorMax;
        rt.offsetMin = spec.offsetMin;
        rt.offsetMax = spec.offsetMax;
    }

    public static void DestroyChildren(Transform parent)
    {
        for (int i = parent.childCount - 1; i >= 0; i--)
        {
            DestroyGenerated(parent.GetChild(i).gameObject);
        }
    }

    public static void DestroyGenerated(GameObject target)
    {
        if (target == null) return;
        if (Application.isPlaying) Object.Destroy(target);
        else Object.DestroyImmediate(target);
    }

    // ── Layout presets ──

    public static RectSpec StretchFull(float l = 0, float b = 0, float r = 0, float t = 0) =>
        new RectSpec(Vector2.zero, Vector2.one, new Vector2(l, b), new Vector2(-r, -t));

    public static RectSpec StretchTop(float height, float l = 0, float r = 0, float offset = 0) =>
        new RectSpec(new Vector2(0, 1), Vector2.one, new Vector2(l, -height - offset), new Vector2(-r, -offset));

    public static RectSpec StretchBottom(float height, float l = 0, float r = 0, float offset = 0) =>
        new RectSpec(Vector2.zero, new Vector2(1, 0), new Vector2(l, offset), new Vector2(-r, height + offset));

    public static RectSpec Anchored(float left, float top, float w, float h) =>
        new RectSpec(new Vector2(0, 1), new Vector2(0, 1),
            new Vector2(left, -top - h), new Vector2(left + w, -top));

    public struct RectSpec
    {
        public Vector2 anchorMin, anchorMax, offsetMin, offsetMax;
        public RectSpec(Vector2 amin, Vector2 amax, Vector2 omin, Vector2 omax)
        {
            anchorMin = amin; anchorMax = amax; offsetMin = omin; offsetMax = omax;
        }
    }
}
