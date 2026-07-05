using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Runtime-generated visual elements for the Unity playable prototype.
/// Builds location-specific decoration, scene atmosphere, and UI flourishes.
/// </summary>
public static class RuntimeVisuals
{
    public static GameObject BuildLocationScene(string locationId, Transform parent,
        Color32 accent, Color32 highlight, Color32 bg)
    {
        GameObject container = new GameObject($"Scene_{locationId}", typeof(RectTransform));
        RectTransform ct = container.GetComponent<RectTransform>();
        ct.SetParent(parent, false);
        ct.anchorMin = new Vector2(0.04f, 0.18f);
        ct.anchorMax = new Vector2(0.56f, 0.82f);
        ct.offsetMin = Vector2.zero;
        ct.offsetMax = Vector2.zero;

        Image bgImage = container.AddComponent<Image>();
        bgImage.color = bg;

        switch (locationId)
        {
            case "de_pijp":
                BuildDePijp(container.transform, accent, highlight);
                break;
            case "science_park":
                BuildSciencePark(container.transform, accent, highlight);
                break;
            case "tweede_kans":
                BuildTweedeKans(container.transform, accent, highlight);
                break;
        }

        return container;
    }

    private static void BuildDePijp(Transform parent, Color32 accent, Color32 highlight)
    {
        // Window grid (4 windows across, 2 rows)
        for (int row = 0; row < 2; row++)
        {
            for (int col = 0; col < 4; col++)
            {
                Rect(window(parent, 40 + col * 100, 60 + row * 110, 70, 80),
                    highlight with { a = 180 }).gameObject.name = $"Window_{row}_{col}";
            }
        }

        // Roof triangle
        Image roof = CreateImage("Roof", parent, RectAnchor(0, 0, 480, 40), accent);
        // Door
        Image door = CreateImage("Door", parent, RectAnchor(200, 280, 80, 140), accent with { a = 200 });

        // Label
        Text label = CreateText("Label", parent, RectAnchor(20, 20, 440, 36), 22, TextAnchor.MiddleLeft);
        label.text = "De Pijp — Amsterdam Zuid";
        label.color = ColorFrom(highlight);
    }

    private static void BuildSciencePark(Transform parent, Color32 accent, Color32 highlight)
    {
        // Beaker shapes (vertical rectangles)
        for (int i = 0; i < 3; i++)
        {
            RectTransform beaker = Rect(panel(parent, 60 + i * 140, 100, 50, 160), highlight with { a = 100 });
            // Liquid fill
            Rect(labFill(beaker, 0, 30 + i * 15, 50, 60), accent with { a = 180 });
        }

        // Lab bench
        Rect(bench(parent, 40, 300, 400, 16), accent with { a = 200 });
        // Small flasks on bench
        for (int i = 0; i < 5; i++)
        {
            Rect(flask(parent, 60 + i * 70, 270, 18, 30), highlight with { a = 140 });
        }

        // Label
        Text label = CreateText("Label", parent, RectAnchor(20, 20, 440, 36), 22, TextAnchor.MiddleLeft);
        label.text = "Science Park — UvA Campus";
        label.color = ColorFrom(highlight);
    }

    private static void BuildTweedeKans(Transform parent, Color32 accent, Color32 highlight)
    {
        // Counter top (horizontal bar)
        Rect(panel(parent, 40, 180, 400, 18), accent with { a = 220 });
        // Counter front
        Rect(panel(parent, 40, 198, 400, 80), accent with { a = 120 });

        // Glass shapes on counter
        for (int i = 0; i < 5; i++)
        {
            Rect(panel(parent, 60 + i * 72, 140, 20, 40), highlight with { a = 160 });
        }

        // Shelf behind bar
        Rect(panel(parent, 40, 60, 400, 10), highlight with { a = 140 });
        // Bottles on shelf
        Color32[] bottleColors = new[] {
            new Color32(82, 37, 30, 180),
            new Color32(34, 56, 38, 180),
            new Color32(66, 44, 62, 180),
            new Color32(56, 44, 28, 180),
            new Color32(44, 38, 56, 180),
        };
        for (int i = 0; i < 5; i++)
        {
            Rect(bottle(parent, 55 + i * 75, 30, 18, 30), bottleColors[i]);
        }

        // Neon sign glow
        Rect(panel(parent, 120, 8, 240, 28), new Color32(255, 180, 60, 80));

        // Label
        Text label = CreateText("Label", parent, RectAnchor(20, 20, 440, 36), 22, TextAnchor.MiddleLeft);
        label.text = "Tweede Kans — De Wallen";
        label.color = ColorFrom(highlight with { a = 230 });
    }

    // --- shape helpers ---

    private static Image CreateImage(string name, Transform parent, RectSpec spec, Color32 color)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), spec);
        Image img = go.GetComponent<Image>();
        img.color = color;
        return img;
    }

    private static Text CreateText(string name, Transform parent, RectSpec spec, int fontSize, TextAnchor align)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        ApplyRect(go.GetComponent<RectTransform>(), spec);
        Text t = go.GetComponent<Text>();
        t.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        t.fontSize = fontSize;
        t.alignment = align;
        t.color = new Color32(246, 240, 229, 255);
        t.horizontalOverflow = HorizontalWrapMode.Wrap;
        t.verticalOverflow = VerticalWrapMode.Truncate;
        return t;
    }

    private static Image panel(Transform parent, float left, float top, float w, float h)
    {
        return CreateImage("panel", parent, RectAnchor(left, top, w, h), Color.white);
    }

    private static Image window(Transform parent, float left, float top, float w, float h)
    {
        return CreateImage("window", parent, RectAnchor(left, top, w, h), Color.white);
    }

    private static Image bench(Transform parent, float left, float top, float w, float h)
    {
        return CreateImage("bench", parent, RectAnchor(left, top, w, h), Color.white);
    }

    private static Image flask(Transform parent, float left, float top, float w, float h)
    {
        return CreateImage("flask", parent, RectAnchor(left, top, w, h), Color.white);
    }

    private static Image bottle(Transform parent, float left, float top, float w, float h)
    {
        return CreateImage("bottle", parent, RectAnchor(left, top, w, h), Color.white);
    }

    private static RectTransform labFill(Transform parent, float left, float top, float w, float h)
    {
        return Rect(CreateImage("fill", parent, RectAnchor(left, top, w, h), Color.white).GetComponent<RectTransform>(), Color.white);
    }

    private static RectTransform Rect(Image image, Color32 color)
    {
        image.color = color;
        return image.GetComponent<RectTransform>();
    }

    private static RectSpec RectAnchor(float left, float top, float w, float h)
    {
        return new RectSpec(
            new Vector2(0, 1), new Vector2(0, 1),
            new Vector2(left, -top - h),
            new Vector2(left + w, -top));
    }

    private static Color ColorFrom(Color32 c) => new Color32(c.r, c.g, c.b, c.a);

    private static void ApplyRect(RectTransform rt, RectSpec spec)
    {
        rt.anchorMin = spec.anchorMin;
        rt.anchorMax = spec.anchorMax;
        rt.offsetMin = spec.offsetMin;
        rt.offsetMax = spec.offsetMax;
    }

    public struct RectSpec
    {
        public Vector2 anchorMin;
        public Vector2 anchorMax;
        public Vector2 offsetMin;
        public Vector2 offsetMax;

        public RectSpec(Vector2 amin, Vector2 amax, Vector2 omin, Vector2 omax)
        {
            anchorMin = amin; anchorMax = amax; offsetMin = omin; offsetMax = omax;
        }
    }
}
