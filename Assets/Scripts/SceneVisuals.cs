using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Manages scene transitions and builds 2D tile-based scene visuals.
/// </summary>
public class SceneTransitionManager : MonoBehaviour
{
    public static SceneTransitionManager Instance { get; private set; }

    [Header("Settings")]
    public float fadeDuration = 0.5f;

    private GameObject _currentScene;
    private string _currentLocation = "de_pijp";
    private Canvas _fadeCanvas;
    private Image _fadeImage;

    // Player reference (set by GameController or found at runtime)
    private PlayerController _player;

    // Minimap
    private MinimapController _minimap;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
            CreateFadeCanvas();
        }
        else
        {
            Destroy(gameObject);
        }
    }

    private void Start()
    {
        _player = FindAnyObjectByType<PlayerController>(FindObjectsInactive.Include);
        BuildScene(_currentLocation);

        // Initialize minimap
        GameObject mmGO = new GameObject("MinimapController");
        mmGO.transform.SetParent(transform);
        _minimap = mmGO.AddComponent<MinimapController>();
        _minimap.Initialize();
    }

    private void CreateFadeCanvas()
    {
        GameObject canvasGO = new GameObject("FadeCanvas");
        canvasGO.transform.SetParent(transform);
        _fadeCanvas = canvasGO.AddComponent<Canvas>();
        _fadeCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _fadeCanvas.sortingOrder = 999;
        canvasGO.AddComponent<CanvasScaler>();
        canvasGO.AddComponent<GraphicRaycaster>();

        GameObject fadeGO = new GameObject("FadeImage", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        fadeGO.transform.SetParent(_fadeCanvas.transform, false);
        _fadeImage = fadeGO.GetComponent<Image>();
        RectTransform rt = fadeGO.GetComponent<RectTransform>();
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;
        _fadeImage.color = new Color32(0, 0, 0, 0);
        _fadeImage.raycastTarget = false;

        _fadeCanvas.gameObject.SetActive(false);
    }

    public void TransitionTo(string locationId)
    {
        if (locationId == _currentLocation) return;
        StartCoroutine(TransitionRoutine(locationId));
    }

    private System.Collections.IEnumerator TransitionRoutine(string locationId)
    {
        // Fade out
        _fadeCanvas.gameObject.SetActive(true);
        float t = 0;
        while (t < fadeDuration)
        {
            t += Time.deltaTime;
            float alpha = Mathf.Lerp(0, 1, t / fadeDuration);
            _fadeImage.color = new Color32(0, 0, 0, (byte)(alpha * 255));
            yield return null;
        }

        // Switch scene
        BuildScene(locationId);

        // Fade in
        t = 0;
        while (t < fadeDuration)
        {
            t += Time.deltaTime;
            float alpha = Mathf.Lerp(1, 0, t / fadeDuration);
            _fadeImage.color = new Color32(0, 0, 0, (byte)(alpha * 255));
            yield return null;
        }

        _fadeCanvas.gameObject.SetActive(false);
    }

    private void BuildScene(string locationId)
    {
        // Destroy old scene
        if (_currentScene != null)
            Destroy(_currentScene);

        _currentLocation = locationId;
        _currentScene = SceneVisuals.BuildScene(locationId, transform);

        // Move player to spawn point
        if (_player != null)
        {
            Vector2 spawn = GetSpawnPoint(locationId);
            _player.transform.position = spawn;
        }

        // Update location title
        GameController gc = FindAnyObjectByType<GameController>(FindObjectsInactive.Include);
        if (gc != null)
        {
            gc.OnSceneChanged(locationId);
        }
    }

    private Vector2 GetSpawnPoint(string locationId)
    {
        return locationId switch
        {
            "de_pijp" => new Vector2(0, -1),
            "science_park" => new Vector2(0, -1.5f),
            "tweede_kans" => new Vector2(0, -1),
            "bloemenmarkt" => new Vector2(0, -0.5f),
            _ => Vector2.zero
        };
    }
}

/// <summary>
/// Builds 2D tile-based scenes for each location.
/// Uses colored rectangles as placeholder tiles.
/// </summary>
public static class SceneVisuals
{
    // ── Shared helpers (defined first so all Build methods can call them) ──

    private static void PlaceLamp(GameObject parent, string name, float x, float y)
    {
        PlaceTile(parent, $"{name}_Pole", x, y, 0.12f, 1.2f, new Color32(40, 40, 50, 255));
        PlaceTile(parent, $"{name}_Head", x, y + 0.6f, 0.3f, 0.15f, new Color32(50, 50, 60, 255));
        PlaceTile(parent, $"{name}_Glow", x, y + 0.5f, 0.4f, 0.4f, new Color32(255, 220, 150, 40));
    }

    private static void PlaceTree(GameObject parent, string name, float x, float y)
    {
        PlaceTile(parent, $"{name}_Trunk", x, y - 0.1f, 0.15f, 0.5f, new Color32(60, 40, 20, 255));
        PlaceTile(parent, $"{name}_Canopy1", x, y + 0.3f, 0.8f, 0.6f, new Color32(55, 130, 50, 255));
        PlaceTile(parent, $"{name}_Canopy2", x, y + 0.5f, 0.6f, 0.4f, new Color32(65, 145, 55, 255));
        PlaceTile(parent, $"{name}_Canopy3", x, y + 0.7f, 0.4f, 0.3f, new Color32(75, 160, 60, 255));
    }

    private static void PlaceCloud(GameObject parent, string name, float x, float y, float w, float h)
    {
        Color32 cloudColor = new Color32(220, 220, 230, 60);
        PlaceTile(parent, $"{name}_1", x - w * 0.3f, y, w * 0.4f, h, cloudColor);
        PlaceTile(parent, $"{name}_2", x, y + h * 0.2f, w * 0.5f, h * 0.7f, cloudColor);
        PlaceTile(parent, $"{name}_3", x + w * 0.2f, y, w * 0.4f, h * 0.8f, cloudColor);
    }

    public static GameObject BuildScene(string locationId, Transform parent)
    {
        GameObject scene = new GameObject($"Scene_{locationId}");
        scene.transform.SetParent(parent);

        // Sky background (gradient-like using two layers)
        Color32 skyTop, skyBottom;
        switch (locationId)
        {
            case "de_pijp":
                skyTop = new Color32(100, 140, 180, 255);
                skyBottom = new Color32(160, 190, 220, 255);
                break;
            case "science_park":
                skyTop = new Color32(80, 150, 180, 255);
                skyBottom = new Color32(140, 200, 220, 255);
                break;
            case "tweede_kans":
                skyTop = new Color32(10, 8, 15, 255);
                skyBottom = new Color32(30, 25, 35, 255);
                break;
            case "bloemenmarkt":
                skyTop = new Color32(90, 160, 200, 255);
                skyBottom = new Color32(150, 210, 230, 255);
                break;
            default:
                skyTop = new Color32(40, 40, 45, 255);
                skyBottom = new Color32(60, 60, 65, 255);
                break;
        }

        // Sky layer (top half)
        PlaceTile(scene, "SkyTop", 0, 2.5f, 30, 5, skyTop);
        // Sky layer (bottom half)
        PlaceTile(scene, "SkyBottom", 0, -2.5f, 30, 5, skyBottom);

        switch (locationId)
        {
            case "de_pijp": BuildDePijp(scene); break;
            case "science_park": BuildSciencePark(scene); break;
            case "tweede_kans": BuildTweedeKans(scene); break;
            case "bloemenmarkt": BuildBloemenmarkt(scene); break;
            default: BuildEmpty(scene); break;
        }

        // Ground collider
        BoxCollider2D ground = scene.AddComponent<BoxCollider2D>();
        ground.size = new Vector2(20, 0.5f);
        ground.offset = new Vector2(0, -4.5f);
        ground.isTrigger = false;

        return scene;
    }

    private static void BuildDePijp(GameObject parent)
    {
        // Sidewalk (front)
        PlaceTile(parent, "Sidewalk", 0, -3.2f, 20, 1.2f, new Color32(150, 145, 135, 255));
        // Sidewalk detail line
        PlaceTile(parent, "SidewalkLine", 0, -3.8f, 20, 0.08f, new Color32(130, 125, 115, 255));

        // Street / cobblestone
        PlaceTile(parent, "Street", 0, -1.5f, 20, 1.6f, new Color32(65, 60, 55, 255));
        // Street cobblestone pattern
        for (int i = 0; i < 10; i++)
        {
            PlaceTile(parent, $"Cobble_{i}", -8 + i * 1.8f, -1.5f, 0.8f, 0.8f, new Color32(72, 66, 60, 200));
        }

        // Canal (background)
        PlaceTile(parent, "Canal", 0, 2.5f, 20, 2f, new Color32(45, 100, 150, 220));
        // Canal reflection lines
        for (int i = 0; i < 6; i++)
        {
            PlaceTile(parent, $"Reflect_{i}", -8 + i * 3f, 2.5f + (i % 2 == 0 ? 0.3f : -0.3f),
                1.5f, 0.06f, new Color32(80, 180, 220, 50));
        }

        // Buildings (left row)
        Color32 brickColor = new Color32(130, 85, 65, 255);
        PlaceTile(parent, "Bldg1", -6, 0.5f, 3.2f, 3.5f, brickColor);
        PlaceTile(parent, "Bldg2", -3, 0.8f, 2.8f, 3f, new Color32(140, 95, 75, 255));
        PlaceTile(parent, "Bldg3", 0, 0.3f, 3.2f, 3.8f, new Color32(120, 80, 60, 255));
        PlaceTile(parent, "Bldg4", 3, 0.5f, 3.2f, 3.5f, brickColor);

        // Building roofs
        PlaceTile(parent, "Roof1", -6, 3.8f, 3.6f, 0.4f, new Color32(70, 45, 25, 255));
        PlaceTile(parent, "Roof2", -3, 3.5f, 3.2f, 0.4f, new Color32(75, 48, 28, 255));
        PlaceTile(parent, "Roof3", 0, 4f, 3.6f, 0.4f, new Color32(65, 42, 22, 255));
        PlaceTile(parent, "Roof4", 3, 3.8f, 3.6f, 0.4f, new Color32(70, 45, 25, 255));

        // Windows (warm lit)
        Color32 windowLit = new Color32(255, 220, 100, 220);
        Color32 windowDim = new Color32(100, 80, 60, 100);
        for (int b = 0; b < 4; b++)
        {
            float bx = -6 + b * 3;
            for (int row = 0; row < 2; row++)
            {
                for (int col = 0; col < 2; col++)
                {
                    bool lit = (b + row + col) % 2 == 0;
                    PlaceTile(parent, $"Win_{b}_{row}_{col}",
                        bx - 0.8f + col * 1.6f, 1.5f + row * 1.2f,
                        0.5f, 0.6f, lit ? windowLit : windowDim);
                }
            }
        }

        // Doors
        PlaceTile(parent, "Door1", -6, -1.5f, 0.7f, 1f, new Color32(55, 35, 20, 255));
        PlaceTile(parent, "Door2", 0, -1.8f, 0.7f, 1f, new Color32(55, 35, 20, 255));
        PlaceTile(parent, "Door3", 3, -1.5f, 0.7f, 1f, new Color32(55, 35, 20, 255));

        // Street lamps
        PlaceLamp(parent, "Lamp1", -7, -2.5f);
        PlaceLamp(parent, "Lamp2", 6, -2.5f);

        // Trees
        PlaceTree(parent, "Tree1", -7.5f, -2f);
        PlaceTree(parent, "Tree2", 7.5f, -2f);
        PlaceTree(parent, "Tree3", -7.5f, 0.5f);

        // Clouds
        PlaceCloud(parent, "Cloud1", -5, 5.2f, 3, 0.5f);
        PlaceCloud(parent, "Cloud2", 3, 5.5f, 4, 0.4f);
        PlaceCloud(parent, "Cloud3", -2, 5.8f, 2.5f, 0.3f);

        AddLabel(parent, "De Pijp — Amsterdam Zuid", 0, 4.5f);
    }

    private static void BuildSciencePark(GameObject parent)
    {
        // Campus green
        PlaceTile(parent, "Grass", 0, -1.5f, 20, 3, new Color32(55, 75, 50, 255));
        // Grass detail patches
        for (int i = 0; i < 5; i++)
        {
            float gx = -7 + i * 3.5f;
            PlaceTile(parent, $"GrassPatch_{i}", gx, -1.5f, 1.2f, 0.8f, new Color32(60, 85, 55, 200));
        }

        // Main building
        PlaceTile(parent, "MainBldg", -1.5f, 1f, 6, 3.5f, new Color32(175, 175, 185, 255));
        // Building accent stripe
        PlaceTile(parent, "BldgAccent", -1.5f, 3f, 6.2f, 0.15f, new Color32(120, 120, 130, 255));
        // Building roof
        PlaceTile(parent, "BldgRoof", -1.5f, 4.2f, 6.4f, 0.35f, new Color32(100, 100, 110, 255));

        // Windows (bright academic)
        for (int row = 0; row < 2; row++)
        {
            for (int col = 0; col < 4; col++)
            {
                PlaceTile(parent, $"BldgWin_{row}_{col}",
                    -3.5f + col * 1.6f, 1.5f + row * 1.2f,
                    0.5f, 0.7f, new Color32(190, 230, 255, 220));
            }
        }

        // Entrance
        PlaceTile(parent, "Entrance", -1.5f, -0.5f, 1.5f, 0.8f, new Color32(60, 80, 100, 255));
        PlaceTile(parent, "EntranceDoor", -1.5f, -0.5f, 0.6f, 0.8f, new Color32(40, 55, 70, 255));

        // Lecture hall
        PlaceTile(parent, "LectureHall", 4, 0.5f, 3.5f, 2.5f, new Color32(160, 155, 165, 255));
        PlaceTile(parent, "LectureRoof", 4, 2.8f, 3.7f, 0.25f, new Color32(110, 105, 115, 255));
        for (int i = 0; i < 3; i++)
        {
            PlaceTile(parent, $"LHWin_{i}", 4.3f + i * 0.8f, 1.5f, 0.4f, 0.6f, new Color32(180, 220, 255, 200));
        }

        // Bike racks
        for (int i = 0; i < 5; i++)
        {
            float bx = -6 + i * 0.6f;
            PlaceTile(parent, $"Bike_{i}", bx, -2f, 0.2f, 0.3f, new Color32(70, 70, 90, 255));
            PlaceTile(parent, $"BikeWheel_{i}", bx, -2.3f, 0.15f, 0.15f, new Color32(50, 50, 65, 255));
        }

        // Path / walkway
        PlaceTile(parent, "Path", 0, -1f, 2f, 2f, new Color32(150, 145, 135, 220));
        PlaceTile(parent, "PathEdge", 0, -0.5f, 2.2f, 0.08f, new Color32(130, 125, 115, 200));

        // Trees
        PlaceTree(parent, "Tree1", -7, -1.5f);
        PlaceTree(parent, "Tree2", -7, 1.5f);
        PlaceTree(parent, "Tree3", 7.5f, -1f);
        PlaceTree(parent, "Tree4", 7.5f, 1.5f);

        // Bushes
        PlaceTile(parent, "Bush1", -4, -2.5f, 1f, 0.5f, new Color32(45, 110, 45, 255));
        PlaceTile(parent, "Bush2", 2, -2.5f, 1f, 0.5f, new Color32(45, 110, 45, 255));

        // Clouds
        PlaceCloud(parent, "Cloud1", -5, 5f, 3.5f, 0.5f);
        PlaceCloud(parent, "Cloud2", 4, 5.3f, 4f, 0.4f);
        PlaceCloud(parent, "Cloud3", 0, 5.7f, 2.5f, 0.3f);

        AddLabel(parent, "Science Park — UvA Campus", 0, 4.5f);
    }

    private static void BuildTweedeKans(GameObject parent)
    {
        // Dark interior background
        PlaceTile(parent, "BackWall", 0, 1.5f, 14, 3.5f, new Color32(40, 30, 20, 255));
        // Wall texture
        PlaceTile(parent, "WallTexture", 0, 1.5f, 14, 3.5f, new Color32(50, 38, 25, 100));

        // Floor (wooden)
        PlaceTile(parent, "Floor", 0, -2f, 14, 3.5f, new Color32(55, 38, 25, 255));
        // Floor boards
        for (int i = 0; i < 6; i++)
        {
            PlaceTile(parent, $"Board_{i}", -6 + i * 2.3f, -2f, 0.08f, 3.5f, new Color32(65, 45, 30, 100));
        }

        // Warm ambient light overlay
        PlaceTile(parent, "WarmGlow", 0, 0, 14, 6, new Color32(255, 200, 100, 12));

        // Bar counter
        PlaceTile(parent, "CounterTop", 0, -0.3f, 8, 0.6f, new Color32(110, 70, 45, 255));
        PlaceTile(parent, "CounterFront", 0, -1.2f, 8, 0.9f, new Color32(85, 55, 35, 255));
        PlaceTile(parent, "CounterSurface", 0, 0.05f, 7.5f, 0.08f, new Color32(130, 85, 55, 200));

        // Bar stools
        for (int i = 0; i < 4; i++)
        {
            float sx = -3.5f + i * 2.3f;
            PlaceTile(parent, $"StoolLeg_{i}", sx, -1.8f, 0.1f, 0.5f, new Color32(60, 40, 20, 255));
            PlaceTile(parent, $"StoolSeat_{i}", sx, -1.3f, 0.5f, 0.15f, new Color32(120, 80, 50, 255));
        }

        // Back shelf with bottles
        PlaceTile(parent, "Shelf", 0, 1.2f, 10, 0.12f, new Color32(90, 65, 40, 255));
        Color32[] bottleColors = {
            new Color32(82, 37, 30, 255), new Color32(34, 56, 38, 255),
            new Color32(66, 44, 62, 255), new Color32(56, 44, 28, 255),
            new Color32(44, 38, 56, 255), new Color32(70, 50, 30, 255),
        };
        for (int i = 0; i < 6; i++)
        {
            PlaceTile(parent, $"Bottle_{i}", -4.5f + i * 1.6f, 1.5f, 0.3f, 0.6f, bottleColors[i]);
            PlaceTile(parent, $"BottleHL_{i}", -4.5f + i * 1.6f, 1.7f, 0.1f, 0.15f, new Color32(255, 255, 255, 25));
        }

        // Neon sign
        PlaceTile(parent, "Neon", 0, 2.8f, 3.5f, 0.6f, new Color32(255, 180, 60, 70));
        PlaceTile(parent, "NeonGlow", 0, 2.8f, 4f, 0.8f, new Color32(255, 180, 60, 15));
        // Neon text simulation
        PlaceTile(parent, "NeonText", 0, 2.8f, 2f, 0.3f, new Color32(255, 200, 80, 120));

        // Wall decorations
        PlaceTile(parent, "Picture1", -3.5f, 2.5f, 1f, 0.7f, new Color32(90, 70, 50, 200));
        PlaceTile(parent, "Picture2", 3.5f, 2.5f, 1f, 0.7f, new Color32(90, 70, 50, 200));
        PlaceTile(parent, "PictureFrame1", -3.5f, 2.5f, 1.1f, 0.8f, new Color32(120, 90, 60, 100));
        PlaceTile(parent, "PictureFrame2", 3.5f, 2.5f, 1.1f, 0.8f, new Color32(120, 90, 60, 100));

        // Tables
        for (int i = 0; i < 2; i++)
        {
            float tx = i == 0 ? -4f : 3.5f;
            PlaceTile(parent, $"TableTop_{i}", tx, -2.3f, 1.5f, 0.1f, new Color32(90, 60, 35, 255));
            PlaceTile(parent, $"TableLeg_{i}", tx, -2f, 0.1f, 0.3f, new Color32(60, 40, 20, 255));
        }

        // Warm light pool under neon
        PlaceTile(parent, "LightPool", 0, -1f, 6, 2, new Color32(255, 200, 100, 8));

        AddLabel(parent, "Tweede Kans — De Wallen", 0, 3.5f);
    }

    private static void BuildBloemenmarkt(GameObject parent)
    {
        // Canal water (large area)
        PlaceTile(parent, "Canal", 0, -1f, 18, 4f, new Color32(45, 100, 155, 200));
        // Water depth variation
        PlaceTile(parent, "CanalDeep", 0, -2f, 18, 1.5f, new Color32(35, 85, 135, 180));
        // Water ripples
        for (int i = 0; i < 8; i++)
        {
            PlaceTile(parent, $"Ripple_{i}", -7 + i * 2f, -1.5f + (i % 3) * 0.5f,
                1.2f, 0.06f, new Color32(80, 160, 210, 40));
        }

        // Floating platform / dock
        PlaceTile(parent, "Platform", 0, -0.3f, 10, 0.8f, new Color32(130, 90, 60, 255));
        PlaceTile(parent, "PlatformTop", 0, 0.1f, 10, 0.12f, new Color32(150, 105, 70, 255));
        // Platform supports
        PlaceTile(parent, "PlatformSupport1", -4.5f, -0.8f, 0.3f, 0.5f, new Color32(90, 60, 35, 255));
        PlaceTile(parent, "PlatformSupport2", 4.5f, -0.8f, 0.3f, 0.5f, new Color32(90, 60, 35, 255));

        // Stall canopy (striped)
        PlaceTile(parent, "Canopy", 0, 1.2f, 8, 0.5f, new Color32(200, 100, 60, 255));
        for (int i = 0; i < 8; i++)
        {
            Color32 stripeColor = i % 2 == 0 ? new Color32(220, 120, 70, 255) : new Color32(240, 220, 200, 255);
            PlaceTile(parent, $"Stripe_{i}", -3.5f + i * 1f, 1.2f, 0.4f, 0.5f, stripeColor);
        }

        // Stall posts
        PlaceTile(parent, "Post1", -4, 0.2f, 0.15f, 1.5f, new Color32(90, 60, 30, 255));
        PlaceTile(parent, "Post2", 4, 0.2f, 0.15f, 1.5f, new Color32(90, 60, 30, 255));

        // Flowers (colorful 3x8 grid)
        Color32[] flowerColors = {
            new Color32(220, 80, 120, 255), new Color32(240, 200, 80, 255),
            new Color32(200, 60, 180, 255), new Color32(80, 160, 220, 255),
            new Color32(240, 140, 60, 255), new Color32(180, 220, 80, 255),
        };
        for (int row = 0; row < 3; row++)
        {
            for (int col = 0; col < 8; col++)
            {
                float fx = -3.5f + col * 1f;
                float fy = 0.1f + row * 0.3f;
                Color32 fc = flowerColors[(row * 2 + col) % flowerColors.Length];
                PlaceTile(parent, $"Flower_{row}_{col}", fx, fy, 0.2f, 0.2f, fc);
                // Stem
                PlaceTile(parent, $"Stem_{row}_{col}", fx, fy - 0.15f, 0.04f, 0.15f, new Color32(40, 120, 40, 150));
            }
        }

        // Sofie's sign
        PlaceTile(parent, "Sign", 0, 1.8f, 1.5f, 0.3f, new Color32(60, 120, 60, 255));
        PlaceTile(parent, "SignPost", 0, 1.3f, 0.08f, 0.5f, new Color32(80, 50, 25, 255));

        // Clouds
        PlaceCloud(parent, "Cloud1", -5, 4.5f, 3f, 0.5f);
        PlaceCloud(parent, "Cloud2", 4, 5f, 3.5f, 0.4f);

        AddLabel(parent, "Bloemenmarkt — Floating Market", 0, 4f);
    }

    private static void BuildEmpty(GameObject parent)
    {
        PlaceTile(parent, "Ground", 0, -3, 18, 3, new Color32(40, 40, 45, 255));
        AddLabel(parent, "Unknown Location", 0, 4.5f);
    }

    private static Sprite _sharedWhiteSprite;
    private static Sprite SharedWhiteSprite
    {
        get
        {
            if (_sharedWhiteSprite == null)
            {
                Texture2D tex = new Texture2D(1, 1);
                tex.SetPixel(0, 0, Color.white);
                tex.Apply();
                _sharedWhiteSprite = Sprite.Create(tex, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f));
                _sharedWhiteSprite.name = "WhiteTile";
            }
            return _sharedWhiteSprite;
        }
    }

    private static GameObject PlaceTile(GameObject parent, string name, float x, float y,
        float width, float height, Color32 color)
    {
        GameObject tile = new GameObject(name, typeof(SpriteRenderer));
        tile.transform.SetParent(parent.transform);
        tile.transform.localPosition = new Vector3(x, y, 0);

        SpriteRenderer sr = tile.GetComponent<SpriteRenderer>();
        sr.sprite = SharedWhiteSprite;
        sr.color = color;
        sr.sortingOrder = 0;

        // Scale to match world size
        tile.transform.localScale = new Vector3(width, height, 1);

        // Add collider for solid tiles
        if (name != "Canal" && !name.StartsWith("Flower") && !name.StartsWith("Window")
            && !name.StartsWith("Ripple") && !name.StartsWith("Bottle"))
        {
            BoxCollider2D col = tile.AddComponent<BoxCollider2D>();
            col.isTrigger = name.StartsWith("Interact") || name == "Neon" || name.StartsWith("Stool");
        }

        return tile;
    }

    private static void AddLabel(GameObject parent, string text, float x, float y)
    {
        // Create world-space text for location label
        GameObject labelGO = new GameObject("LocationLabel", typeof(TextMesh));
        labelGO.transform.SetParent(parent.transform);
        labelGO.transform.localPosition = new Vector3(x, y, 0);
        labelGO.transform.localScale = new Vector3(0.05f, 0.05f, 1);

        TextMesh tm = labelGO.GetComponent<TextMesh>();
        tm.text = text;
        tm.fontSize = 24;
        tm.color = new Color32(246, 240, 229, 200);
        tm.anchor = TextAnchor.MiddleCenter;
        tm.alignment = TextAlignment.Center;
    }

    public static void DestroyScene(GameObject scene)
    {
        if (scene != null)
            Object.Destroy(scene);
    }
}

// ── Minimap Controller ──────────────────────────────────
// Attached to the SceneTransitionManager. Creates a second camera
// with a RenderTexture and displays it as a RawImage in the HUD.

public class MinimapController : MonoBehaviour
{
    private Camera _minimapCam;
    private RenderTexture _renderTex;
    private RawImage _minimapImage;
    private Canvas _minimapCanvas;
    private GameObject _playerDot;

    private const int TexSize = 256;
    private const float MapSize = 28f;

    public void Initialize()
    {
        // Create RenderTexture
        _renderTex = new RenderTexture(TexSize, TexSize, 16, RenderTextureFormat.ARGB32);
        _renderTex.name = "MinimapRT";
        _renderTex.Create();

        // Create minimap camera
        GameObject camGO = new GameObject("MinimapCamera");
        camGO.transform.SetParent(transform);
        _minimapCam = camGO.AddComponent<Camera>();
        _minimapCam.orthographic = true;
        _minimapCam.orthographicSize = MapSize / 2f;
        _minimapCam.clearFlags = CameraClearFlags.SolidColor;
        _minimapCam.backgroundColor = new Color32(10, 14, 18, 200);
        _minimapCam.cullingMask = ~(1 << 5); // Render everything except UI layer
        _minimapCam.depth = -10;
        _minimapCam.targetTexture = _renderTex;

        // Create minimap Canvas (overlay, top-right corner)
        GameObject canvasGO = new GameObject("MinimapCanvas");
        canvasGO.transform.SetParent(transform);
        _minimapCanvas = canvasGO.AddComponent<Canvas>();
        _minimapCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _minimapCanvas.sortingOrder = 300;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        // Background circle/border
        GameObject bgGO = new GameObject("MinimapBG", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        bgGO.transform.SetParent(_minimapCanvas.transform, false);
        Image bgImg = bgGO.GetComponent<Image>();
        bgImg.color = new Color32(0, 0, 0, 180);
        RectTransform bgRT = bgGO.GetComponent<RectTransform>();
        bgRT.anchorMin = new Vector2(1, 1);
        bgRT.anchorMax = new Vector2(1, 1);
        bgRT.sizeDelta = new Vector2(180, 180);
        bgRT.anchoredPosition = new Vector2(-100, -100);

        // RawImage for the render texture
        GameObject riGO = new GameObject("MinimapImage", typeof(RectTransform), typeof(CanvasRenderer), typeof(RawImage));
        riGO.transform.SetParent(_minimapCanvas.transform, false);
        _minimapImage = riGO.GetComponent<RawImage>();
        _minimapImage.texture = _renderTex;
        _minimapImage.color = new Color32(255, 255, 255, 200);
        RectTransform riRT = riGO.GetComponent<RectTransform>();
        riRT.anchorMin = new Vector2(1, 1);
        riRT.anchorMax = new Vector2(1, 1);
        riRT.sizeDelta = new Vector2(160, 160);
        riRT.anchoredPosition = new Vector2(-100, -100);

        // Player dot
        GameObject dotGO = new GameObject("PlayerDot", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        dotGO.transform.SetParent(_minimapCanvas.transform, false);
        _playerDot = dotGO;
        Image dotImg = dotGO.GetComponent<Image>();
        dotImg.color = new Color32(255, 220, 60, 255);
        dotImg.raycastTarget = false;
        RectTransform dotRT = dotGO.GetComponent<RectTransform>();
        dotRT.anchorMin = new Vector2(1, 1);
        dotRT.anchorMax = new Vector2(1, 1);
        dotRT.sizeDelta = new Vector2(8, 8);
        dotRT.anchoredPosition = new Vector2(-100, -100);
    }

    private void LateUpdate()
    {
        if (_minimapCam == null) return;

        // Follow player
        PlayerController player = FindAnyObjectByType<PlayerController>(FindObjectsInactive.Include);
        if (player != null)
        {
            Vector3 pos = player.transform.position;
            _minimapCam.transform.position = new Vector3(pos.x, pos.y, -10);

            // Update player dot on minimap
            if (_playerDot != null)
            {
                // Map world space to minimap UV space
                float halfMap = MapSize / 2f;
                float u = (pos.x + halfMap) / MapSize;
                float v = (pos.y + halfMap) / MapSize;
                u = Mathf.Clamp01(u);
                v = Mathf.Clamp01(v);

                // Convert to pixel space on the 160x160 minimap
                RectTransform dotRT = _playerDot.GetComponent<RectTransform>();
                float px = (u - 0.5f) * 160f;
                float py = (v - 0.5f) * 160f;
                dotRT.anchoredPosition = new Vector2(-100 + px, -100 + py);
            }
        }
    }

    public void Cleanup()
    {
        if (_renderTex != null)
        {
            _renderTex.Release();
            Destroy(_renderTex);
        }
        if (_minimapCam != null)
            Destroy(_minimapCam.gameObject);
        if (_minimapCanvas != null)
            Destroy(_minimapCanvas.gameObject);
    }
}