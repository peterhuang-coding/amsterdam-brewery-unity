using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Mark an object/NPC as interactable. Shows a prompt when player is near.
/// Handles E key interaction via PlayerController.
/// </summary>
public class Interactable : MonoBehaviour
{
    [Header("Interaction")]
    public string interactPrompt = "Press E";
    public string objectName = "Object";
    public InteractableType type = InteractableType.NPC;

    [Header("Dialogue")]
    public string dialogueId = "";
    public bool autoTriggerDialogue = true;

    [Header("Action")]
    public string actionType = ""; // "surf", "bar_serve", "bar_open", "bar_close", "transition"

    [Header("Transition")]
    public string targetScene = "";

    // Visual prompt
    private GameObject _promptGO;
    private bool _isNearby;

    // Visual collider overlay (semi-transparent zone indicator)
    private GameObject _colliderOverlay;

    public enum InteractableType
    {
        NPC,
        Object,
        Transition,
        Workstation
    }

    private void Start()
    {
        CreatePrompt();
        CreateColliderOverlay();
        gameObject.name = $"Interactable_{objectName}";
    }

    private void CreateColliderOverlay()
    {
        // Semi-transparent overlay showing interaction zone
        _colliderOverlay = new GameObject("ColliderOverlay", typeof(SpriteRenderer));
        _colliderOverlay.transform.SetParent(transform);
        _colliderOverlay.transform.localPosition = Vector3.zero;

        SpriteRenderer sr = _colliderOverlay.GetComponent<SpriteRenderer>();
        // Create a simple white sprite for the overlay
        Texture2D tex = new Texture2D(1, 1);
        tex.SetPixel(0, 0, Color.white);
        tex.Apply();
        Sprite sprite = Sprite.Create(tex, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f));
        sr.sprite = sprite;
        sr.color = new Color32(255, 220, 80, 20); // Very subtle golden overlay
        sr.sortingOrder = 5;

        // Match collider size
        BoxCollider2D col = GetComponent<BoxCollider2D>();
        if (col != null)
        {
            _colliderOverlay.transform.localScale = new Vector3(col.size.x, col.size.y, 1);
        }
        else
        {
            _colliderOverlay.transform.localScale = new Vector3(0.8f, 0.8f, 1);
        }
    }

    private void CreatePrompt()
    {
        // Simple floating text above object
        _promptGO = new GameObject("InteractPrompt", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        _promptGO.transform.SetParent(transform);
        _promptGO.transform.localPosition = new Vector3(0, 0.8f, 0);

        Text text = _promptGO.GetComponent<Text>();
        text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        text.fontSize = 10;
        text.alignment = TextAnchor.MiddleCenter;
        text.color = new Color32(255, 220, 100, 255);
        text.text = $"[E] {interactPrompt}";
        text.horizontalOverflow = HorizontalWrapMode.Overflow;

        // Use a world-space canvas for this
        Canvas canvas = _promptGO.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.WorldSpace;
        canvas.worldCamera = Camera.main;
        RectTransform rt = _promptGO.GetComponent<RectTransform>();
        rt.sizeDelta = new Vector2(3, 0.5f);
        rt.localScale = new Vector3(0.01f, 0.01f, 1);

        _promptGO.SetActive(false);
    }

    public void ShowPrompt(bool show)
    {
        _isNearby = show;
        if (_promptGO != null)
            _promptGO.SetActive(show);
    }

    public void Interact()
    {
        Debug.Log($"Interacted with {objectName} ({type})");

        switch (type)
        {
            case InteractableType.NPC:
                if (autoTriggerDialogue && !string.IsNullOrEmpty(dialogueId))
                {
                    // 显示玩家头顶气泡
                    PlayerController player = FindAnyObjectByType<PlayerController>(FindObjectsInactive.Include);
                    if (player != null)
                    {
                        player.ShowPlayerBubble("[Talking]");
                    }
                    DialogueManager.Instance.ShowDialogueById(dialogueId, OnDialogueComplete);
                }
                break;

            case InteractableType.Transition:
                if (!string.IsNullOrEmpty(targetScene))
                {
                    SceneTransitionManager.Instance?.TransitionTo(targetScene);
                }
                break;

            case InteractableType.Workstation:
                HandleWorkstationAction();
                break;

            case InteractableType.Object:
                HandleObjectAction();
                break;
        }
    }

    private void HandleWorkstationAction()
    {
        switch (actionType)
        {
            case "surf":
                if (!SurfingManager.IsSurfing)
                {
                    SurfingManager.StartSurfing("hot", (success, fragments) =>
                    {
                        Debug.Log($"Surf complete: {success}, {fragments} fragments");
                    });
                }
                break;

            case "bar_serve":
                // Will be hooked up to bar system
                Debug.Log("Serving customer...");
                break;

            case "bar_open":
                Debug.Log("Opening bar...");
                break;

            case "bar_close":
                Debug.Log("Closing bar...");
                break;
        }
    }

    private void HandleObjectAction()
    {
        Debug.Log($"Using object: {objectName}");
    }

    private void OnDialogueComplete()
    {
        Debug.Log($"Dialogue ended for {objectName}");
        // 隐藏玩家头顶气泡
        PlayerController player = FindAnyObjectByType<PlayerController>(FindObjectsInactive.Include);
        if (player != null)
        {
            player.HidePlayerBubble();
        }
    }

    private void OnDestroy()
    {
        if (_promptGO != null)
            Destroy(_promptGO);
        if (_colliderOverlay != null)
            Destroy(_colliderOverlay);
    }
}