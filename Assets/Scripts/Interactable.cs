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
        gameObject.name = $"Interactable_{objectName}";
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
    }

    private void OnDestroy()
    {
        if (_promptGO != null)
            Destroy(_promptGO);
    }
}