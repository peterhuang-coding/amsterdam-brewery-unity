using UnityEngine;

/// <summary>
/// Entry point for the Amsterdam Brewery 2.5D game.
/// Sets up the player, camera, scene manager, and UI systems.
/// Replaces the old pure-UI GameController bootstrap approach.
/// </summary>
public class GameBootstrapper : MonoBehaviour
{
    [Header("Prefabs (created at runtime)")]
    public GameObject playerPrefab;
    public GameObject sceneManagerPrefab;
    public GameObject dialogueManagerPrefab;

    // Runtime references
    private PlayerController _player;
    private SceneTransitionManager _sceneManager;

    private void Awake()
    {
        // Initialize SoundManager
        SoundManager.Init();

        // Create SceneTransitionManager (persistent singleton)
        if (SceneTransitionManager.Instance == null)
        {
            GameObject smGO = new GameObject("SceneTransitionManager");
            smGO.AddComponent<SceneTransitionManager>();
        }

        // Create DialogueManager (persistent singleton)
        if (DialogueManager.Instance == null)
        {
            var dm = DialogueManager.Instance;
        }

        // Create InventorySystem (persistent singleton)
        if (InventorySystem.Instance == null)
        {
            var inv = InventorySystem.Instance;
        }

        // Create WeatherSystem (persistent singleton)
        if (WeatherSystem.Instance == null)
        {
            var ws = WeatherSystem.Instance;
        }

        // Create BarMinigame (persistent singleton)
        if (BarMinigame.Instance == null)
        {
            var bm = BarMinigame.Instance;
        }

        // Create Player at origin
        GameObject playerGO = new GameObject("Player");
        _player = playerGO.AddComponent<PlayerController>();

        // Setup camera
        SetupCamera(playerGO.transform);

        // Setup background camera for UI
        Camera bgCam = new GameObject("UICamera").AddComponent<Camera>();
        bgCam.transform.SetParent(transform);
        bgCam.clearFlags = CameraClearFlags.Depth;
        bgCam.depth = -1;
        bgCam.orthographic = true;
        bgCam.orthographicSize = 5;
        bgCam.backgroundColor = new Color32(8, 10, 14, 255);

        // Set initial weather
        WeatherSystem.Instance.NewDay(1);

        // Find and notify the existing GameController
        GameController gc = FindObjectOfType<GameController>();
        if (gc != null)
        {
            gc.OnSceneChanged("de_pijp");
        }

        Debug.Log("Amsterdam Brewery 2.5D bootstrapped successfully!");
        Debug.Log("Controls: WASD=Move  Shift=Run  E=Interact  F=Surf  I=Inventory  Space=AdvanceTime");
    }

    private void SetupCamera(Transform target)
    {
        GameObject camGO = new GameObject("MainCamera");
        Camera cam = camGO.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color32(8, 10, 14, 255);
        cam.orthographic = true;
        cam.orthographicSize = 5;

        CameraFollow follow = camGO.AddComponent<CameraFollow>();
        follow.target = target;
        follow.smoothSpeed = 5f;
        follow.offset = new Vector3(0, 0, -10);
    }
}

/// <summary>
/// Smooth camera follow for top-down 2D.
/// </summary>
public class CameraFollow : MonoBehaviour
{
    public Transform target;
    public float smoothSpeed = 5f;
    public Vector3 offset = new Vector3(0, 0, -10);

    private void LateUpdate()
    {
        if (target == null) return;

        Vector3 desiredPosition = target.position + offset;
        Vector3 smoothedPosition = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed * Time.deltaTime);
        transform.position = smoothedPosition;
    }
}