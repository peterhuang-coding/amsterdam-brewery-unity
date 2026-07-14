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

        // [Audio] Play initial scene music and ambience
        if (AudioManager.Instance != null)
        {
            AudioManager.Instance.PlayMusic(_currentLocation);
            AudioManager.Instance.PlayAmbience(_currentLocation);
        }

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

        // [Audio] Play scene music and ambience
        if (AudioManager.Instance != null)
        {
            AudioManager.Instance.PlayMusic(locationId);
            AudioManager.Instance.PlayAmbience(locationId);
        }

        // [Visual] Camera subtle movement on transition
        if (Camera.main != null)
        {
            Vector3 originalPos = Camera.main.transform.position;
            Camera.main.transform.position = originalPos + new Vector3(0.1f, 0, 0);
            // Smoothly return
            // (handled by CameraFollow's smooth follow)
        }

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

    // ── Enhanced visual helpers ──

    private static void PlaceFlag(GameObject parent, string name, float x, float y, Color32 color)
    {
        // Flag pole
        PlaceTile(parent, $"{name}_Pole", x, y - 0.3f, 0.06f, 0.8f, new Color32(60, 60, 60, 255));
        // Flag cloth
        PlaceTile(parent, $"{name}_Cloth", x + 0.25f, y + 0.1f, 0.5f, 0.25f, color);
        // Flag top
        PlaceTile(parent, $"{name}_Top", x, y + 0.3f, 0.15f, 0.06f, new Color32(80, 80, 80, 255));
    }

    private static void PlaceSign(GameObject parent, string name, float x, float y, float w, float h, Color32 bgColor)
    {
        // Sign board
        PlaceTile(parent, $"{name}_Board", x, y, w, h, bgColor);
        // Sign border
        PlaceTile(parent, $"{name}_Border", x, y, w + 0.06f, h + 0.06f, new Color32(40, 40, 40, 255));
        // Sign glow
        PlaceTile(parent, $"{name}_Glow", x, y, w + 0.3f, h + 0.3f, new Color32(bgColor.r, bgColor.g, bgColor.b, 30));
    }

    private static void PlaceBench(GameObject parent, string name, float x, float y)
    {
        PlaceTile(parent, $"{name}_Seat", x, y, 0.5f, 0.1f, new Color32(80, 60, 40, 255));
        PlaceTile(parent, $"{name}_Leg1", x - 0.2f, y - 0.15f, 0.06f, 0.2f, new Color32(60, 40, 20, 255));
        PlaceTile(parent, $"{name}_Leg2", x + 0.2f, y - 0.15f, 0.06f, 0.2f, new Color32(60, 40, 20, 255));
    }

    private static void PlaceFence(GameObject parent, string name, float x, float y, int segments)
    {
        for (int i = 0; i < segments; i++)
        {
            float fx = x + i * 0.4f;
            PlaceTile(parent, $"{name}_Post{i}", fx, y, 0.06f, 0.5f, new Color32(60, 50, 40, 255));
            if (i < segments - 1)
            {
                PlaceTile(parent, $"{name}_Rail{i}", fx + 0.1f, y + 0.1f, 0.3f, 0.04f, new Color32(80, 70, 60, 255));
                PlaceTile(parent, $"{name}_RailB{i}", fx + 0.1f, y - 0.1f, 0.3f, 0.04f, new Color32(80, 70, 60, 255));
            }
        }
    }

    private static void PlaceFlowerBed(GameObject parent, string name, float x, float y)
    {
        PlaceTile(parent, $"{name}_Bed", x, y, 0.6f, 0.15f, new Color32(80, 60, 40, 255));
        // Flowers
        PlaceTile(parent, $"{name}_F1", x - 0.2f, y + 0.12f, 0.08f, 0.1f, new Color32(255, 100, 100, 255));
        PlaceTile(parent, $"{name}_F2", x, y + 0.15f, 0.08f, 0.1f, new Color32(255, 200, 100, 255));
        PlaceTile(parent, $"{name}_F3", x + 0.2f, y + 0.12f, 0.08f, 0.1f, new Color32(255, 100, 200, 255));
        // Stems
        PlaceTile(parent, $"{name}_S1", x - 0.2f, y, 0.02f, 0.12f, new Color32(60, 140, 60, 255));
        PlaceTile(parent, $"{name}_S2", x, y, 0.02f, 0.15f, new Color32(60, 140, 60, 255));
        PlaceTile(parent, $"{name}_S3", x + 0.2f, y, 0.02f, 0.12f, new Color32(60, 140, 60, 255));
    }

    private static void PlaceWindow(GameObject parent, string name, float x, float y)
    {
        // Window frame
        PlaceTile(parent, $"{name}_Frame", x, y, 0.3f, 0.35f, new Color32(60, 60, 50, 255));
        // Glass
        PlaceTile(parent, $"{name}_Glass", x, y, 0.26f, 0.31f, new Color32(180, 200, 220, 60));
        // Cross
        PlaceTile(parent, $"{name}_CrossH", x, y, 0.26f, 0.03f, new Color32(50, 50, 40, 255));
        PlaceTile(parent, $"{name}_CrossV", x, y, 0.03f, 0.31f, new Color32(50, 50, 40, 255));
        // Warm light at night
        PlaceTile(parent, $"{name}_Light", x, y, 0.2f, 0.25f, new Color32(255, 200, 100, 20));
    }

    // ── New helpers for enhanced visuals ──

    private static void PlaceBird(GameObject parent, string name, float x, float y)
    {
        // Small V-shaped bird using two small tiles
        PlaceTile(parent, $"{name}_WingL", x - 0.15f, y, 0.2f, 0.08f, new Color32(50, 50, 55, 180));
        PlaceTile(parent, $"{name}_WingR", x + 0.15f, y, 0.2f, 0.08f, new Color32(50, 50, 55, 180));
        PlaceTile(parent, $"{name}_Body", x, y + 0.02f, 0.06f, 0.06f, new Color32(60, 60, 65, 200));
    }

    private static void PlaceBridge(GameObject parent, string name, float x, float y, float width)
    {
        // Arch bridge made of multiple tiles
        float half = width * 0.5f;
        // Deck
        PlaceTile(parent, $"{name}_Deck", x, y, width, 0.15f, new Color32(140, 115, 85, 255));
        // Railings
        PlaceTile(parent, $"{name}_RailingL", x - half + 0.2f, y + 0.2f, 0.08f, 0.25f, new Color32(90, 75, 55, 255));
        PlaceTile(parent, $"{name}_RailingR", x + half - 0.2f, y + 0.2f, 0.08f, 0.25f, new Color32(90, 75, 55, 255));
        // Arch posts
        PlaceTile(parent, $"{name}_PostL", x - half, y - 0.1f, 0.15f, 0.3f, new Color32(120, 95, 65, 255));
        PlaceTile(parent, $"{name}_PostR", x + half, y - 0.1f, 0.15f, 0.3f, new Color32(120, 95, 65, 255));
        // Arch curve (simplified)
        PlaceTile(parent, $"{name}_ArchL", x - half * 0.5f, y + 0.35f, 0.5f, 0.08f, new Color32(130, 105, 75, 180));
        PlaceTile(parent, $"{name}_ArchR", x + half * 0.5f, y + 0.35f, 0.5f, 0.08f, new Color32(130, 105, 75, 180));
    }

    private static void PlaceWindmill(GameObject parent, string name, float x, float y, float scale)
    {
        // Windmill as a distant landmark using tile combinations
        float s = scale;
        // Base tower
        PlaceTile(parent, $"{name}_Tower", x, y, 0.6f * s, 1.2f * s, new Color32(130, 110, 90, 255));
        PlaceTile(parent, $"{name}_TowerTop", x, y + 0.6f * s, 0.7f * s, 0.15f * s, new Color32(150, 125, 100, 255));
        // Cap (conical-ish, using stepped tiles)
        PlaceTile(parent, $"{name}_Cap1", x, y + 0.75f * s, 0.5f * s, 0.1f * s, new Color32(100, 80, 60, 255));
        PlaceTile(parent, $"{name}_Cap2", x, y + 0.85f * s, 0.35f * s, 0.1f * s, new Color32(90, 70, 50, 255));
        PlaceTile(parent, $"{name}_Cap3", x, y + 0.95f * s, 0.2f * s, 0.1f * s, new Color32(80, 60, 40, 255));
        // Blades (cross shape using thin tiles)
        PlaceTile(parent, $"{name}_BladeH", x + 0.35f * s, y + 0.65f * s, 0.5f * s, 0.04f * s, new Color32(180, 180, 180, 150));
        PlaceTile(parent, $"{name}_BladeV", x, y + 0.8f * s, 0.04f * s, 0.4f * s, new Color32(180, 180, 180, 150));
    }

    private static void PlaceBoat(GameObject parent, string name, float x, float y, float width)
    {
        // Small boat on water
        float h = width * 0.3f;
        PlaceTile(parent, $"{name}_Hull", x, y, width, h, new Color32(80, 55, 35, 255));
        PlaceTile(parent, $"{name}_HullTop", x, y + h * 0.4f, width * 0.8f, h * 0.2f, new Color32(100, 70, 45, 255));
        PlaceTile(parent, $"{name}_Mast", x, y + h * 0.6f, 0.05f, h * 0.6f, new Color32(60, 40, 20, 255));
        // Sail
        PlaceTile(parent, $"{name}_Sail", x + width * 0.15f, y + h * 0.7f, width * 0.25f, h * 0.5f, new Color32(220, 215, 200, 180));
    }

    private static void PlaceBikeRack(GameObject parent, string name, float x, float y)
    {
        // Small bike rack cluster
        for (int i = 0; i < 3; i++)
        {
            float bx = x + (i - 1) * 0.25f;
            PlaceTile(parent, $"{name}_Bike{i}", bx, y, 0.15f, 0.25f, new Color32(60, 60, 75, 255));
            PlaceTile(parent, $"{name}_Wheel{i}", bx - 0.08f, y - 0.12f, 0.1f, 0.1f, new Color32(50, 50, 60, 255));
            PlaceTile(parent, $"{name}_Wheel{i}_R", bx + 0.08f, y - 0.12f, 0.1f, 0.1f, new Color32(50, 50, 60, 255));
        }
    }

    private static void PlaceMarketStall(GameObject parent, string name, float x, float y, float width, Color32 canopyColor)
    {
        float h = width * 0.5f;
        // Canopy
        PlaceTile(parent, $"{name}_Canopy", x, y + h * 0.3f, width, h * 0.3f, canopyColor);
        // Counter
        PlaceTile(parent, $"{name}_Counter", x, y - h * 0.1f, width * 0.9f, h * 0.25f, new Color32(140, 105, 70, 255));
        // Posts
        PlaceTile(parent, $"{name}_PostL", x - width * 0.4f, y - h * 0.1f, 0.08f, h * 0.6f, new Color32(90, 65, 40, 255));
        PlaceTile(parent, $"{name}_PostR", x + width * 0.4f, y - h * 0.1f, 0.08f, h * 0.6f, new Color32(90, 65, 40, 255));
        // Goods on counter (small colored squares)
        PlaceTile(parent, $"{name}_Goods1", x - width * 0.15f, y - h * 0.05f, 0.1f, 0.08f, new Color32(240, 200, 80, 255));
        PlaceTile(parent, $"{name}_Goods2", x, y - h * 0.03f, 0.12f, 0.08f, new Color32(220, 80, 120, 255));
        PlaceTile(parent, $"{name}_Goods3", x + width * 0.15f, y - h * 0.05f, 0.1f, 0.06f, new Color32(80, 200, 120, 255));
    }

    private static void PlaceInteractiveMarker(GameObject parent, string name, float x, float y)
    {
        // Glowing golden marker for interactable points
        PlaceTile(parent, $"{name}_OuterGlow", x, y, 0.7f, 0.7f, new Color32(255, 220, 80, 20));
        PlaceTile(parent, $"{name}_InnerGlow", x, y, 0.5f, 0.5f, new Color32(255, 200, 60, 40));
        PlaceTile(parent, $"{name}_Marker", x, y, 0.3f, 0.3f, new Color32(255, 180, 40, 200));
    }

    private static void PlaceFootstepGlow(GameObject parent, string name, float x, float y)
    {
        // Subtle circular glow under player feet
        PlaceTile(parent, $"{name}_Glow", x, y - 0.05f, 0.5f, 0.15f, new Color32(255, 220, 150, 15));
    }

    private static void PlaceCanalRipple(GameObject parent, string name, float x, float y)
    {
        // Canal ripple effect using small offset tiles
        PlaceTile(parent, $"{name}_1", x, y, 0.8f, 0.04f, new Color32(100, 200, 240, 30));
        PlaceTile(parent, $"{name}_2", x + 0.15f, y - 0.05f, 0.6f, 0.03f, new Color32(100, 200, 240, 20));
        PlaceTile(parent, $"{name}_3", x - 0.1f, y + 0.04f, 0.5f, 0.02f, new Color32(100, 200, 240, 15));
    }

    private static void PlacePavementDetail(GameObject parent, string name, float x, float y, float width, float height)
    {
        // Cobblestone pavement detail tile with grid pattern
        PlaceTile(parent, $"{name}_Base", x, y, width, height, new Color32(155, 150, 140, 255));
        float cellW = width / 4f;
        float cellH = height / 3f;
        for (int r = 0; r < 3; r++)
        {
            for (int c = 0; c < 4; c++)
            {
                float cx = x - width * 0.5f + cellW * (c + 0.5f);
                float cy = y - height * 0.5f + cellH * (r + 0.5f);
                PlaceTile(parent, $"{name}_Stone_{r}_{c}", cx, cy, cellW * 0.85f, cellH * 0.85f, new Color32(160, 155, 145, 255));
            }
        }
    }

    private static void PlaceOutdoorTable(GameObject parent, string name, float x, float y)
    {
        // Small outdoor table with chair indicators
        PlaceTile(parent, $"{name}_Table", x, y, 0.4f, 0.4f, new Color32(80, 60, 40, 255));
        PlaceTile(parent, $"{name}_ChairT", x, y + 0.3f, 0.25f, 0.1f, new Color32(100, 80, 55, 255));
        PlaceTile(parent, $"{name}_ChairB", x, y - 0.3f, 0.25f, 0.1f, new Color32(100, 80, 55, 255));
        PlaceTile(parent, $"{name}_ChairL", x - 0.3f, y, 0.1f, 0.25f, new Color32(100, 80, 55, 255));
        PlaceTile(parent, $"{name}_ChairR", x + 0.3f, y, 0.1f, 0.25f, new Color32(100, 80, 55, 255));
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

        // Sky layer (top half) — depth 0 (far background)
        PlaceTile(scene, "SkyTop", 0, 2.5f, 30, 5, skyTop, 0);
        // Sky layer (bottom half) — depth 0
        PlaceTile(scene, "SkyBottom", 0, -2.5f, 30, 5, skyBottom, 0);

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

        // Add a building outline helper method for depth
        // Sorting layers: 0=sky, 1=water/canal, 2=distant buildings, 3=mid buildings, 4=ground/street, 5=foreground objects, 6=interactive, 7=player area

        return scene;
    }

    private static void BuildDePijp(GameObject parent)
    {
        // Ground base
        PlaceTile(parent, "GroundBase", 0, -3.5f, 22, 6f, new Color32(140, 135, 125, 255));

        // Pavement detail (front sidewalk)
        PlacePavementDetail(parent, "Pavement", 0, -3.2f, 20, 1.2f);

        // Street / cobblestone
        PlaceTile(parent, "Street", 0, -1.5f, 20, 1.6f, new Color32(65, 60, 55, 255));
        // Street cobblestone pattern
        for (int i = 0; i < 10; i++)
        {
            PlaceTile(parent, $"Cobble_{i}", -8 + i * 1.8f, -1.5f, 0.8f, 0.8f, new Color32(72, 66, 60, 200));
        }

        // Market building (large centerpiece)
        PlaceTile(parent, "MarketBldg", 0, 1f, 5f, 4f, new Color32(160, 110, 80, 255));
        PlaceTile(parent, "MarketRoof", 0, 3.8f, 5.5f, 0.5f, new Color32(100, 65, 40, 255));
        PlaceTile(parent, "MarketRoofPeak", 0, 4.3f, 3f, 0.3f, new Color32(80, 50, 30, 255));
        // Market entrance (large arch)
        PlaceTile(parent, "MarketArch", 0, -0.5f, 1.5f, 1.8f, new Color32(100, 65, 40, 255));
        PlaceTile(parent, "MarketDoor", 0, -0.5f, 0.8f, 1.2f, new Color32(55, 35, 20, 255));
        // Market windows
        PlaceTile(parent, "MarketWinL", -1.5f, 1.5f, 0.8f, 0.8f, new Color32(255, 230, 150, 180));
        PlaceTile(parent, "MarketWinR", 1.5f, 1.5f, 0.8f, 0.8f, new Color32(255, 230, 150, 180));

        // Market stalls (front of market)
        PlaceMarketStall(parent, "Stall1", -2.2f, -0.5f, 0.8f, new Color32(200, 80, 60, 255));
        PlaceMarketStall(parent, "Stall2", 2.2f, -0.5f, 0.8f, new Color32(60, 160, 200, 255));

        // Canal (background)
        PlaceTile(parent, "Canal", 0, 2.5f, 20, 2f, new Color32(45, 100, 150, 220));
        // Canal reflection lines
        for (int i = 0; i < 6; i++)
        {
            PlaceTile(parent, $"Reflect_{i}", -8 + i * 3f, 2.5f + (i % 2 == 0 ? 0.3f : -0.3f),
                1.5f, 0.06f, new Color32(80, 180, 220, 50));
        }
        // Canal ripples
        PlaceCanalRipple(parent, "Ripple1", -5, 2.5f);
        PlaceCanalRipple(parent, "Ripple2", 0, 2.8f);
        PlaceCanalRipple(parent, "Ripple3", 5, 2.3f);

        // Bridge over canal
        PlaceBridge(parent, "Bridge", 0, 2.5f, 3f);

        // Buildings (left row - residential)
        Color32 brickColor = new Color32(130, 85, 65, 255);
        PlaceTile(parent, "Bldg1", -6, 0.5f, 3.2f, 3.5f, brickColor);
        PlaceTile(parent, "Bldg2", -3, 0.8f, 2.8f, 3f, new Color32(140, 95, 75, 255));
        PlaceTile(parent, "Bldg4", 3, 0.5f, 3.2f, 3.5f, brickColor);
        // Additional buildings right side
        PlaceTile(parent, "Bldg5", 6, 0.3f, 2.8f, 3.2f, new Color32(120, 80, 60, 255));

        // Building roofs
        PlaceTile(parent, "Roof1", -6, 3.8f, 3.6f, 0.4f, new Color32(70, 45, 25, 255));
        PlaceTile(parent, "Roof2", -3, 3.5f, 3.2f, 0.4f, new Color32(75, 48, 28, 255));
        PlaceTile(parent, "Roof4", 3, 3.8f, 3.6f, 0.4f, new Color32(70, 45, 25, 255));
        PlaceTile(parent, "Roof5", 6, 3.2f, 3.2f, 0.4f, new Color32(65, 42, 22, 255));

        // Windows (warm lit)
        Color32 windowLit = new Color32(255, 220, 100, 220);
        Color32 windowDim = new Color32(100, 80, 60, 100);
        float[] bxs = { -6, -3, 3, 6 };
        for (int bi = 0; bi < bxs.Length; bi++)
        {
            float bx = bxs[bi];
            for (int row = 0; row < 2; row++)
            {
                for (int col = 0; col < 2; col++)
                {
                    bool lit = (bi + row + col) % 2 == 0;
                    PlaceTile(parent, $"Win_{bi}_{row}_{col}",
                        bx - 0.8f + col * 1.6f, 1.5f + row * 1.2f,
                        0.5f, 0.6f, lit ? windowLit : windowDim);
                }
            }
        }

        // Doors
        PlaceTile(parent, "Door1", -6, -1.5f, 0.7f, 1f, new Color32(55, 35, 20, 255));
        PlaceTile(parent, "Door2", 3, -1.5f, 0.7f, 1f, new Color32(55, 35, 20, 255));
        PlaceTile(parent, "Door3", 6, -1.2f, 0.7f, 1f, new Color32(55, 35, 20, 255));

        // Bike racks (near market)
        PlaceBikeRack(parent, "BikeRack1", -4.5f, -2.8f);
        PlaceBikeRack(parent, "BikeRack2", 4.5f, -2.8f);

        // Street lamps (sequence along street)
        PlaceLamp(parent, "Lamp1", -7, -2.5f);
        PlaceLamp(parent, "Lamp2", -3.5f, -2.5f);
        PlaceLamp(parent, "Lamp3", 0.5f, -2.5f);
        PlaceLamp(parent, "Lamp4", 4.5f, -2.5f);
        PlaceLamp(parent, "Lamp5", 7.5f, -2.5f);

        // Trees forming avenue
        PlaceTree(parent, "Tree1", -8.5f, -2f);
        PlaceTree(parent, "Tree2", -6f, -2f);
        PlaceTree(parent, "Tree3", 6f, -2f);
        PlaceTree(parent, "Tree4", 8.5f, -2f);
        PlaceTree(parent, "Tree5", -8.5f, 0.5f);
        PlaceTree(parent, "Tree6", 8.5f, 0.5f);

        // [Visual] Flags and signs
        PlaceFlag(parent, "NLFlag", -6f, -0.5f, new Color32(200, 50, 50, 255));
        PlaceSign(parent, "MarketSign", 4f, 2.0f, 0.8f, 0.3f, new Color32(180, 120, 60, 255));
        // Benches
        PlaceBench(parent, "Bench1", 2f, -1.5f);
        PlaceBench(parent, "Bench2", 5f, -1.5f);
        // Windows on buildings
        PlaceWindow(parent, "Win1", -3f, 0.5f);
        PlaceWindow(parent, "Win2", -3f, -0.2f);
        PlaceWindow(parent, "Win3", 3f, 0.5f);
        // Flower beds
        PlaceFlowerBed(parent, "FB1", 0f, -1.8f);

        // Interactive markers
        PlaceInteractiveMarker(parent, "InteractMarket", 0, -1f);
        PlaceInteractiveMarker(parent, "InteractBridge", 0, 2.8f);

        // Player footstep glow
        PlaceFootstepGlow(parent, "FootstepGlow", 0, -1f);

        // Birds
        PlaceBird(parent, "Bird1", -2, 5.5f);
        PlaceBird(parent, "Bird2", 4, 5.8f);
        PlaceBird(parent, "Bird3", -6, 5f);

        // Boat on canal
        PlaceBoat(parent, "Boat1", -4, 3.2f, 0.8f);

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
        // Grass texture stripes
        for (int i = 0; i < 8; i++)
        {
            PlaceTile(parent, $"GrassStripe_{i}", -8 + i * 2.2f, -1.5f, 0.6f, 2.8f, new Color32(50, 70, 45, 80));
        }

        // Bicycle lane (red path through campus)
        PlaceTile(parent, "BikeLane", -5, -1.5f, 1.5f, 3f, new Color32(140, 50, 50, 220));
        PlaceTile(parent, "BikeLane2", 5, -1.5f, 1.5f, 3f, new Color32(140, 50, 50, 220));
        // Bike lane markings
        for (int i = 0; i < 4; i++)
        {
            float by = -2.5f + i * 1.5f;
            PlaceTile(parent, $"BikeMark_{i}", -5, by, 0.06f, 0.3f, new Color32(255, 255, 255, 120));
            PlaceTile(parent, $"BikeMark2_{i}", 5, by, 0.06f, 0.3f, new Color32(255, 255, 255, 120));
        }

        // Main building (glass curtain wall style - cyan/blue)
        PlaceTile(parent, "MainBldg", -1.5f, 1f, 6, 3.5f, new Color32(100, 170, 200, 255));
        // Glass panels (cyan-tinted)
        for (int row = 0; row < 3; row++)
        {
            for (int col = 0; col < 5; col++)
            {
                PlaceTile(parent, $"Glass_{row}_{col}",
                    -3.2f + col * 1.3f, 0.5f + row * 1f,
                    0.4f, 0.4f, new Color32(140, 210, 230, 120));
                // Glass highlight
                PlaceTile(parent, $"GlassHL_{row}_{col}",
                    -3.2f + col * 1.3f + 0.1f, 0.5f + row * 1f + 0.1f,
                    0.15f, 0.15f, new Color32(200, 240, 255, 50));
            }
        }
        // Building accent stripe
        PlaceTile(parent, "BldgAccent", -1.5f, 3f, 6.2f, 0.15f, new Color32(60, 120, 150, 255));
        // Building roof
        PlaceTile(parent, "BldgRoof", -1.5f, 4.2f, 6.4f, 0.35f, new Color32(50, 100, 130, 255));

        // Entrance
        PlaceTile(parent, "Entrance", -1.5f, -0.5f, 1.5f, 0.8f, new Color32(60, 80, 100, 255));
        PlaceTile(parent, "EntranceDoor", -1.5f, -0.5f, 0.6f, 0.8f, new Color32(40, 55, 70, 255));

        // Lab building (side)
        PlaceTile(parent, "LabBldg", -6, 0.5f, 3f, 2.8f, new Color32(180, 180, 190, 255));
        PlaceTile(parent, "LabRoof", -6, 2.9f, 3.2f, 0.25f, new Color32(120, 120, 130, 255));
        PlaceTile(parent, "LabAccent", -6, 1.5f, 0.08f, 2.5f, new Color32(200, 80, 60, 255));
        // Lab windows
        for (int i = 0; i < 4; i++)
        {
            PlaceTile(parent, $"LabWin_{i}", -6.8f + i * 0.8f, 1.5f, 0.3f, 0.4f, new Color32(150, 200, 230, 200));
        }

        // Lecture hall
        PlaceTile(parent, "LectureHall", 4, 0.5f, 3.5f, 2.5f, new Color32(160, 155, 165, 255));
        PlaceTile(parent, "LectureRoof", 4, 2.8f, 3.7f, 0.25f, new Color32(110, 105, 115, 255));
        for (int i = 0; i < 3; i++)
        {
            PlaceTile(parent, $"LHWin_{i}", 4.3f + i * 0.8f, 1.5f, 0.4f, 0.6f, new Color32(180, 220, 255, 200));
        }

        // Science sculpture / art installation
        PlaceTile(parent, "SculptureBase", 0, -1f, 1.5f, 0.2f, new Color32(120, 120, 130, 255));
        PlaceTile(parent, "SculpturePole", 0, -0.2f, 0.15f, 1.2f, new Color32(180, 180, 190, 255));
        // Sculpture geometric shapes
        PlaceTile(parent, "SculptureSphere", 0, 0.5f, 0.5f, 0.5f, new Color32(220, 180, 60, 200));
        PlaceTile(parent, "SculptureRing", 0.3f, 0.2f, 0.3f, 0.3f, new Color32(200, 80, 80, 150));
        PlaceTile(parent, "SculptureRing2", -0.3f, 0.8f, 0.25f, 0.25f, new Color32(80, 200, 200, 150));

        // Coffee kiosk
        PlaceTile(parent, "CoffeeKiosk", 7, -1f, 1.2f, 1f, new Color32(80, 50, 30, 255));
        PlaceTile(parent, "CoffeeCanopy", 7, -0.2f, 1.4f, 0.2f, new Color32(60, 120, 60, 255));
        PlaceTile(parent, "CoffeeCounter", 7, -0.8f, 1f, 0.3f, new Color32(120, 80, 50, 255));
        PlaceTile(parent, "CoffeeSign", 7, 0f, 0.6f, 0.15f, new Color32(240, 200, 100, 200));

        // Bike racks (campus style)
        for (int i = 0; i < 5; i++)
        {
            float bx = -6 + i * 0.6f;
            PlaceTile(parent, $"Bike_{i}", bx, -2f, 0.2f, 0.3f, new Color32(70, 70, 90, 255));
            PlaceTile(parent, $"BikeWheel_{i}", bx, -2.3f, 0.15f, 0.15f, new Color32(50, 50, 65, 255));
        }

        // Path / walkway
        PlaceTile(parent, "Path", 0, -1f, 2f, 2f, new Color32(150, 145, 135, 220));
        PlaceTile(parent, "PathEdge", 0, -0.5f, 2.2f, 0.08f, new Color32(130, 125, 115, 200));

        // Green belt / bushes
        PlaceTile(parent, "Bush1", -4, -2.5f, 1f, 0.5f, new Color32(45, 110, 45, 255));
        PlaceTile(parent, "Bush2", 2, -2.5f, 1f, 0.5f, new Color32(45, 110, 45, 255));
        PlaceTile(parent, "Bush3", 6.5f, -2f, 0.8f, 0.4f, new Color32(50, 120, 50, 255));

        // Trees
        PlaceTree(parent, "Tree1", -7.5f, -1.5f);
        PlaceTree(parent, "Tree2", -7.5f, 1.5f);
        PlaceTree(parent, "Tree3", 7.5f, -1.5f);
        PlaceTree(parent, "Tree4", 7.5f, 1.5f);
        PlaceTree(parent, "Tree5", -3.5f, 1.8f);
        PlaceTree(parent, "Tree6", 6.5f, 1.8f);

        // [Visual] Flags and signs
        PlaceFlag(parent, "UvAFlag", -5f, 0.5f, new Color32(50, 100, 200, 255));
        PlaceSign(parent, "LabSign", 3f, 2.5f, 1.0f, 0.3f, new Color32(50, 150, 180, 255));
        // Benches
        PlaceBench(parent, "Bench1", 0f, -2.0f);
        PlaceBench(parent, "Bench2", 4f, -2.0f);
        // Fence
        PlaceFence(parent, "Fence", -7f, 2.8f, 6);
        // Windows
        PlaceWindow(parent, "Win1", -4f, 1.2f);
        PlaceWindow(parent, "Win2", -4f, 0.5f);
        PlaceWindow(parent, "Win3", 4f, 1.2f);

        // Interactive markers
        PlaceInteractiveMarker(parent, "InteractEntrance", -1.5f, -0.8f);
        PlaceInteractiveMarker(parent, "InteractSculpture", 0, -1.5f);
        PlaceInteractiveMarker(parent, "InteractCoffee", 7, -1.3f);

        // Player footstep glow
        PlaceFootstepGlow(parent, "FootstepGlow", 0, -1f);

        // Birds
        PlaceBird(parent, "Bird1", -5, 5f);
        PlaceBird(parent, "Bird2", 3, 5.5f);
        PlaceBird(parent, "Bird3", -1, 5.2f);

        // Clouds
        PlaceCloud(parent, "Cloud1", -5, 5f, 3.5f, 0.5f);
        PlaceCloud(parent, "Cloud2", 4, 5.3f, 4f, 0.4f);
        PlaceCloud(parent, "Cloud3", 0, 5.7f, 2.5f, 0.3f);

        AddLabel(parent, "Science Park — UvA Campus", 0, 4.5f);
    }

    private static void BuildTweedeKans(GameObject parent)
    {
        // Exterior: dark street
        PlaceTile(parent, "Street", 0, -3f, 18, 2f, new Color32(50, 45, 40, 255));
        PlaceTile(parent, "Sidewalk", 0, -1.5f, 18, 1f, new Color32(130, 125, 115, 255));
        // Pavement detail
        PlacePavementDetail(parent, "Pavement", 0, -1.5f, 18, 1f);

        // Neighbor buildings (row houses)
        Color32 neighborColor = new Color32(80, 65, 50, 255);
        Color32 neighborRoof = new Color32(60, 45, 30, 255);
        // Left row houses
        for (int i = 0; i < 3; i++)
        {
            float nx = -7 + i * 2.5f;
            PlaceTile(parent, $"NeighborL_{i}", nx, 1.5f, 2.2f, 3f, neighborColor);
            PlaceTile(parent, $"NeighborRoofL_{i}", nx, 3.5f, 2.4f, 0.3f, neighborRoof);
            // Windows
            PlaceTile(parent, $"NeighborWinL_{i}_0", nx - 0.5f, 1.5f, 0.4f, 0.5f, new Color32(200, 180, 100, 120));
            PlaceTile(parent, $"NeighborWinL_{i}_1", nx + 0.5f, 1.5f, 0.4f, 0.5f, new Color32(200, 180, 100, 120));
        }
        // Right row houses
        for (int i = 0; i < 3; i++)
        {
            float nx = 2 + i * 2.5f;
            PlaceTile(parent, $"NeighborR_{i}", nx, 1.5f, 2.2f, 3f, neighborColor);
            PlaceTile(parent, $"NeighborRoofR_{i}", nx, 3.5f, 2.4f, 0.3f, neighborRoof);
            PlaceTile(parent, $"NeighborWinR_{i}_0", nx - 0.5f, 1.5f, 0.4f, 0.5f, new Color32(200, 180, 100, 120));
            PlaceTile(parent, $"NeighborWinR_{i}_1", nx + 0.5f, 1.5f, 0.4f, 0.5f, new Color32(200, 180, 100, 120));
        }

        // Alley between buildings
        PlaceTile(parent, "Alley", -8.5f, -0.5f, 1.2f, 3f, new Color32(35, 30, 25, 255));
        PlaceTile(parent, "AlleyLamp", -8.5f, 0.5f, 0.3f, 0.3f, new Color32(255, 200, 100, 30));

        // Bar building (warm colors - main feature)
        PlaceTile(parent, "BarBldg", 0, 1f, 5f, 3.5f, new Color32(140, 75, 45, 255));
        PlaceTile(parent, "BarBldgAccent", 0, 2.5f, 5.2f, 0.12f, new Color32(160, 90, 55, 255));
        PlaceTile(parent, "BarRoof", 0, 3.8f, 5.5f, 0.4f, new Color32(80, 50, 30, 255));
        // Bar windows (warm glow)
        for (int i = 0; i < 3; i++)
        {
            PlaceTile(parent, $"BarWin_{i}", -1.5f + i * 1.5f, 0.5f, 0.6f, 0.8f, new Color32(255, 200, 80, 180));
        }
        // Bar door
        PlaceTile(parent, "BarDoor", 0, -1f, 0.8f, 1.2f, new Color32(60, 40, 25, 255));
        PlaceTile(parent, "BarDoorGlow", 0, -1f, 0.9f, 1.3f, new Color32(255, 200, 80, 20));

        // Neon sign (enhanced)
        PlaceTile(parent, "Neon", 0, 3.5f, 4f, 0.7f, new Color32(255, 180, 60, 80));
        PlaceTile(parent, "NeonGlow", 0, 3.5f, 4.5f, 0.9f, new Color32(255, 180, 60, 20));
        PlaceTile(parent, "NeonText", 0, 3.5f, 2.5f, 0.35f, new Color32(255, 200, 80, 140));
        // Extra neon glow pools
        PlaceTile(parent, "NeonPoolL", -2.5f, 0f, 1.5f, 3f, new Color32(255, 180, 60, 6));
        PlaceTile(parent, "NeonPoolR", 2.5f, 0f, 1.5f, 3f, new Color32(255, 180, 60, 6));

        // Outdoor seating area
        PlaceOutdoorTable(parent, "OutdoorTable1", -3f, -1f);
        PlaceOutdoorTable(parent, "OutdoorTable2", 3f, -1f);
        PlaceOutdoorTable(parent, "OutdoorTable3", -3f, -2.2f);
        PlaceOutdoorTable(parent, "OutdoorTable4", 3f, -2.2f);

        // Street lamps
        PlaceLamp(parent, "Lamp1", -6, -1.5f);
        PlaceLamp(parent, "Lamp2", 6, -1.5f);
        PlaceLamp(parent, "Lamp3", -3, -1.5f);
        PlaceLamp(parent, "Lamp4", 3, -1.5f);

        // Interior: warm ambient light overlay
        PlaceTile(parent, "WarmGlow", 0, 0, 14, 6, new Color32(255, 200, 100, 12));

        // Bar counter (inside)
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

        // Wall decorations
        PlaceTile(parent, "Picture1", -3.5f, 2.5f, 1f, 0.7f, new Color32(90, 70, 50, 200));
        PlaceTile(parent, "Picture2", 3.5f, 2.5f, 1f, 0.7f, new Color32(90, 70, 50, 200));
        PlaceTile(parent, "PictureFrame1", -3.5f, 2.5f, 1.1f, 0.8f, new Color32(120, 90, 60, 100));
        PlaceTile(parent, "PictureFrame2", 3.5f, 2.5f, 1.1f, 0.8f, new Color32(120, 90, 60, 100));

        // Warm light pool under neon
        PlaceTile(parent, "LightPool", 0, -1f, 6, 2, new Color32(255, 200, 100, 8));

        // [Visual] Bar signs
        PlaceSign(parent, "BarSign", 0f, 2.8f, 1.2f, 0.4f, new Color32(200, 80, 40, 255));
        PlaceFlag(parent, "BeerFlag", -4f, 0.0f, new Color32(240, 180, 50, 255));
        // Benches
        PlaceBench(parent, "Bench1", -3f, -1.5f);
        PlaceBench(parent, "Bench2", 3f, -1.5f);
        // Windows
        PlaceWindow(parent, "BarWin1", -1.5f, 1.0f);
        PlaceWindow(parent, "BarWin2", 1.5f, 1.0f);
        PlaceWindow(parent, "NeighborWin", -4f, 0.5f);
        // Flower box
        PlaceFlowerBed(parent, "FB1", -2f, -1.8f);

        // Interactive markers
        PlaceInteractiveMarker(parent, "InteractBar", 0, -1.5f);
        PlaceInteractiveMarker(parent, "InteractOutdoor", -3f, -1.5f);

        // Player footstep glow
        PlaceFootstepGlow(parent, "FootstepGlow", 0, -1f);

        AddLabel(parent, "Tweede Kans — De Wallen", 0, 3.5f);
    }

    private static void BuildBloemenmarkt(GameObject parent)
    {
        // Canal water (large area)
        PlaceTile(parent, "Canal", 0, -1f, 18, 4f, new Color32(45, 100, 155, 200));
        // Water depth variation
        PlaceTile(parent, "CanalDeep", 0, -2f, 18, 1.5f, new Color32(35, 85, 135, 180));
        // Canal banks (left and right)
        PlaceTile(parent, "CanalBankL", -9, 1f, 0.5f, 4f, new Color32(120, 105, 85, 255));
        PlaceTile(parent, "CanalBankR", 9, 1f, 0.5f, 4f, new Color32(120, 105, 85, 255));
        // Water ripples
        for (int i = 0; i < 8; i++)
        {
            PlaceTile(parent, $"Ripple_{i}", -7 + i * 2f, -1.5f + (i % 3) * 0.5f,
                1.2f, 0.06f, new Color32(80, 160, 210, 40));
        }
        // Canal ripple detail
        PlaceCanalRipple(parent, "CRipple1", -4, 0.5f);
        PlaceCanalRipple(parent, "CRipple2", 0, -1f);
        PlaceCanalRipple(parent, "CRipple3", 4, 0f);

        // Bridge connecting canal banks
        PlaceBridge(parent, "CanalBridge", 0, 1.5f, 4f);

        // Floating flower boats (multiple stalls in a row)
        // Boat 1 (left)
        PlaceTile(parent, "Boat1_Hull", -4, 0f, 2.5f, 0.6f, new Color32(80, 55, 35, 255));
        PlaceTile(parent, "Boat1_Deck", -4, 0.3f, 2.2f, 0.1f, new Color32(100, 70, 45, 255));
        // Boat 2 (center)
        PlaceTile(parent, "Boat2_Hull", 0, 0f, 2.5f, 0.6f, new Color32(80, 55, 35, 255));
        PlaceTile(parent, "Boat2_Deck", 0, 0.3f, 2.2f, 0.1f, new Color32(100, 70, 45, 255));
        // Boat 3 (right)
        PlaceTile(parent, "Boat3_Hull", 4, 0f, 2.5f, 0.6f, new Color32(80, 55, 35, 255));
        PlaceTile(parent, "Boat3_Deck", 4, 0.3f, 2.2f, 0.1f, new Color32(100, 70, 45, 255));

        // Boat stall canopies (striped per boat)
        Color32[] boatCanopies = {
            new Color32(200, 80, 60, 255),
            new Color32(60, 160, 200, 255),
            new Color32(200, 180, 60, 255),
        };
        for (int b = 0; b < 3; b++)
        {
            float bx = -4 + b * 4;
            Color32 canopyColor = boatCanopies[b];
            PlaceTile(parent, $"BoatCanopy_{b}", bx, 1f, 2f, 0.4f, canopyColor);
            // Stripes
            for (int s = 0; s < 4; s++)
            {
                Color32 stripeCol = s % 2 == 0 ? canopyColor : new Color32(240, 240, 230, 255);
                PlaceTile(parent, $"BoatStripe_{b}_{s}", bx - 0.75f + s * 0.5f, 1f, 0.3f, 0.4f, stripeCol);
            }
            // Boat posts
            PlaceTile(parent, $"BoatPostL_{b}", bx - 0.9f, 0.3f, 0.08f, 0.8f, new Color32(90, 60, 30, 255));
            PlaceTile(parent, $"BoatPostR_{b}", bx + 0.9f, 0.3f, 0.08f, 0.8f, new Color32(90, 60, 30, 255));
        }

        // Flowers on each boat (colorful dense grid)
        Color32[] flowerColors = {
            new Color32(220, 80, 120, 255), new Color32(240, 200, 80, 255),
            new Color32(200, 60, 180, 255), new Color32(80, 160, 220, 255),
            new Color32(240, 140, 60, 255), new Color32(180, 220, 80, 255),
            new Color32(255, 100, 100, 255), new Color32(140, 220, 180, 255),
        };
        for (int boat = 0; boat < 3; boat++)
        {
            float bx = -4 + boat * 4;
            for (int row = 0; row < 3; row++)
            {
                for (int col = 0; col < 5; col++)
                {
                    float fx = bx - 0.8f + col * 0.4f;
                    float fy = 0.1f + row * 0.2f;
                    Color32 fc = flowerColors[(boat * 3 + row * 2 + col) % flowerColors.Length];
                    PlaceTile(parent, $"Flower_{boat}_{row}_{col}", fx, fy, 0.12f, 0.12f, fc);
                    PlaceTile(parent, $"Stem_{boat}_{row}_{col}", fx, fy - 0.08f, 0.03f, 0.08f, new Color32(40, 120, 40, 150));
                }
            }
        }

        // Walkway along canal
        PlaceTile(parent, "Walkway", 0, -2f, 18, 0.6f, new Color32(150, 140, 130, 255));
        PlaceTile(parent, "WalkwayEdge", 0, -1.7f, 18, 0.05f, new Color32(130, 120, 110, 255));

        // Sofie's sign (enhanced)
        PlaceTile(parent, "Sign", 0, 1.8f, 1.5f, 0.3f, new Color32(60, 120, 60, 255));
        PlaceTile(parent, "SignPost", 0, 1.3f, 0.08f, 0.5f, new Color32(80, 50, 25, 255));
        PlaceTile(parent, "SignGlow", 0, 1.8f, 1.8f, 0.5f, new Color32(60, 120, 60, 20));

        // Windmill (distant landmark)
        PlaceWindmill(parent, "Windmill", -8, 3.5f, 1f);

        // [Visual] Market signs
        PlaceSign(parent, "MarketSign", -3f, 2.5f, 1.0f, 0.3f, new Color32(220, 100, 140, 255));
        PlaceFlag(parent, "Flag1", 2f, 1.5f, new Color32(255, 150, 50, 255));
        PlaceFlag(parent, "Flag2", 5f, 1.5f, new Color32(255, 50, 150, 255));
        // Benches
        PlaceBench(parent, "Bench1", -2f, -1.8f);
        PlaceBench(parent, "Bench2", 4f, -1.8f);
        // Fence along canal
        PlaceFence(parent, "CanalFence", -7f, -2.5f, 8);
        // Windows
        PlaceWindow(parent, "Win1", -4f, 1.0f);
        PlaceWindow(parent, "Win2", 6f, 1.0f);

        // Interactive markers
        PlaceInteractiveMarker(parent, "InteractBoat1", -4, -0.3f);
        PlaceInteractiveMarker(parent, "InteractBoat2", 0, -0.3f);
        PlaceInteractiveMarker(parent, "InteractBoat3", 4, -0.3f);
        PlaceInteractiveMarker(parent, "InteractBridge", 0, 1.8f);

        // Player footstep glow
        PlaceFootstepGlow(parent, "FootstepGlow", 0, -2.3f);

        // Birds
        PlaceBird(parent, "Bird1", -2, 4.5f);
        PlaceBird(parent, "Bird2", 5, 4.8f);

        // Clouds
        PlaceCloud(parent, "Cloud1", -5, 4.5f, 3f, 0.5f);
        PlaceCloud(parent, "Cloud2", 4, 5f, 3.5f, 0.4f);
        PlaceCloud(parent, "Cloud3", -1, 5.2f, 2f, 0.3f);

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
        float width, float height, Color32 color, int sortingOrder = -1)
    {
        GameObject tile = new GameObject(name, typeof(SpriteRenderer));
        tile.transform.SetParent(parent.transform);
        tile.transform.localPosition = new Vector3(x, y, 0);

        SpriteRenderer sr = tile.GetComponent<SpriteRenderer>();
        sr.sprite = SharedWhiteSprite;
        sr.color = color;
        // Auto-assign sorting order by name prefix if not explicitly set
        if (sortingOrder < 0)
            sortingOrder = InferSortingOrder(name);
        sr.sortingOrder = sortingOrder;

        // Scale to match world size
        tile.transform.localScale = new Vector3(width, height, 1);

        // Add dark outline for building tiles to improve readability
        if (IsBuildingTile(name) && width > 0.5f && height > 0.5f)
        {
            GameObject outline = new GameObject(name + "_Outline", typeof(SpriteRenderer));
            outline.transform.SetParent(parent.transform);
            outline.transform.localPosition = new Vector3(x, y, 0);
            SpriteRenderer outlineSr = outline.GetComponent<SpriteRenderer>();
            outlineSr.sprite = SharedWhiteSprite;
            outlineSr.color = new Color32(20, 18, 15, 200);
            outlineSr.sortingOrder = sortingOrder - 1;
            outline.transform.localScale = new Vector3(width + 0.06f, height + 0.06f, 1);
        }

        // Add collider for solid tiles
        if (!name.StartsWith("Canal") && !name.StartsWith("Flower") && !name.StartsWith("Window")
            && !name.StartsWith("Ripple") && !name.StartsWith("Bottle")
            && !name.StartsWith("Bird") && !name.StartsWith("Cloud")
            && !name.StartsWith("Glow") && !name.StartsWith("Blade")
            && !name.StartsWith("Canopy") && !name.StartsWith("Stripe")
            && !name.StartsWith("Stem") && !name.StartsWith("Reflect")
            && !name.StartsWith("Goods") && !name.StartsWith("Marker")
            && !name.StartsWith("Bike") && !name.StartsWith("Wheel")
            && !name.StartsWith("Wing") && !name.StartsWith("Body")
            && !name.StartsWith("Mast") && !name.StartsWith("Sail")
            && !name.StartsWith("Post") && !name.StartsWith("Railing")
            && !name.StartsWith("Arch") && !name.StartsWith("Deck")
            && !name.StartsWith("Chair") && !name.StartsWith("Table")
            && !name.StartsWith("GrassPatch") && !name.StartsWith("Cobble")
            && !name.StartsWith("Stone_") && !name.StartsWith("Hull")
            && !name.StartsWith("Stall") && !name.StartsWith("Bush")
            && !name.StartsWith("Cap") && !name.StartsWith("TowerTop")
            && !name.StartsWith("NLFlag") && !name.StartsWith("MarketSign") && !name.StartsWith("UvAFlag")
            && !name.StartsWith("LabSign") && !name.StartsWith("BarSign") && !name.StartsWith("BeerFlag")
            && !name.StartsWith("Flag") && !name.StartsWith("FB") && !name.StartsWith("CanalFence"))
        {
            BoxCollider2D col = tile.AddComponent<BoxCollider2D>();
            col.isTrigger = name.StartsWith("Interact") || name == "Neon" || name.StartsWith("Stool");
        }

        return tile;
    }

    /// <summary>
    /// Check if a tile name represents a building element that should get a dark outline.
    /// </summary>
    private static bool IsBuildingTile(string name)
    {
        return name.StartsWith("Bldg") || name.StartsWith("Neighbor")
            || name.StartsWith("MarketBldg") || name.StartsWith("MarketRoof")
            || name.StartsWith("BarBldg") || name.StartsWith("LabBldg")
            || name.StartsWith("LectureHall") || name.StartsWith("MainBldg");
    }

    /// <summary>
    /// Auto-assign depth sorting based on tile name prefix.
    /// 0=sky/clouds, 1=water/canal, 2=distant landmarks, 3=buildings,
    /// 4=street/ground, 5=foreground props, 6=interactive, 7=player glow
    /// </summary>
    private static int InferSortingOrder(string name)
    {
        if (name.StartsWith("Sky")) return 0;
        if (name.StartsWith("Cloud")) return 0;
        if (name.StartsWith("Bird")) return 1;
        if (name.StartsWith("Canal") || name.StartsWith("Ripple") || name.StartsWith("Reflect")) return 1;
        if (name.StartsWith("Windmill")) return 2;
        if (name.StartsWith("Boat") && (name.Contains("Hull") || name.Contains("Deck"))) return 2;
        if (name.StartsWith("Bridge")) return 3;
        if (name.StartsWith("Bldg") || name.StartsWith("Neighbor") || name.StartsWith("Roof")
            || name.StartsWith("Market") || name.StartsWith("Lab") || name.StartsWith("Lecture")
            || name.StartsWith("MainBldg") || name.StartsWith("BldgAccent") || name.StartsWith("BldgRoof")
            || name.StartsWith("BarBldg") || name.StartsWith("BarRoof") || name.StartsWith("Neon")
            || name.StartsWith("Alley") || name.StartsWith("Entrance")) return 3;
        if (name.StartsWith("Win") || name.StartsWith("Door") || name.StartsWith("Window")
            || name.StartsWith("Stall") || name.Contains("Canopy") || name.Contains("Stripe")
            || name.Contains("Post") && name.Contains("Boat")) return 4;
        if (name.StartsWith("Street") || name.StartsWith("Ground") || name.StartsWith("Sidewalk")
            || name.StartsWith("Pavement") || name.StartsWith("Path") || name.StartsWith("Grass")
            || name.StartsWith("BikeLane") || name.StartsWith("Walkway")) return 4;
        if (name.StartsWith("Cobble") || name.StartsWith("Stone")) return 4;
        if (name.StartsWith("Tree") || name.StartsWith("Lamp") || name.StartsWith("Bench")
            || name.StartsWith("Fence") || name.StartsWith("Bush") || name.StartsWith("FB")
            || name.StartsWith("Bike") || name.StartsWith("Flower") || name.StartsWith("Stem")
            || name.StartsWith("OutdoorTable") || name.StartsWith("Chair")
            || name.StartsWith("Counter") || name.StartsWith("Stool") || name.StartsWith("Shelf")
            || name.StartsWith("Bottle") || name.StartsWith("Picture") || name.StartsWith("BarDoor")
            || name.StartsWith("BarWin") || name.StartsWith("BarSign") || name.StartsWith("BeerFlag")
            || name.StartsWith("Coffee") || name.StartsWith("Sculpture")
            || name.StartsWith("CanalFence") || name.StartsWith("Sign")) return 5;
        if (name.StartsWith("Flag") || name.StartsWith("NLFlag") || name.StartsWith("UvAFlag")
            || name.StartsWith("MarketSign") || name.StartsWith("LabSign")
            || name.StartsWith("Glow") || name.StartsWith("Light") || name.StartsWith("Warm")
            || name.StartsWith("NeonPool") || name.StartsWith("NeonText")) return 5;
        if (name.StartsWith("Interact")) return 6;
        if (name.StartsWith("FootstepGlow")) return 7;
        return 4; // default: ground level
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