using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// 2D top-down pixel character controller for Amsterdam Brewery.
/// WASD movement, E to interact, Shift to run.
/// </summary>
public class PlayerController : MonoBehaviour
{
    [Header("Movement")]
    public float walkSpeed = 2.5f;
    public float runSpeed = 4.5f;
    public float gridSnap = 0.0625f; // ~2px at 32px scale

    [Header("Interaction")]
    public float interactRadius = 0.5f;
    public KeyCode interactKey = KeyCode.E;

    [Header("Visual")]
    public Color32 playerColor = new Color32(60, 200, 255, 255);
    public Vector2Int spriteSize = new Vector2Int(32, 48);

    // State
    private Vector2 _moveInput;
    private Vector2 _lastDirection = Vector2.down;
    private bool _isRunning;
    private Rigidbody2D _rb;
    private SpriteRenderer _sr;
    private GameObject _body;
    private GameObject _directionIndicator;

    // Interaction
    private Interactable _nearbyInteractable;

    public Vector2 Position => transform.position;
    public Vector2 FacingDirection => _lastDirection;

    private void Awake()
    {
        _rb = GetComponent<Rigidbody2D>();
        if (_rb == null)
        {
            _rb = gameObject.AddComponent<Rigidbody2D>();
            _rb.gravityScale = 0;
            _rb.freezeRotation = true;
            _rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
        }

        // Create visual body
        _body = new GameObject("Body");
        _body.transform.SetParent(transform);
        _body.transform.localPosition = Vector3.zero;

        _sr = _body.AddComponent<SpriteRenderer>();
        // Create a simple colored texture
        Texture2D tex = new Texture2D(spriteSize.x, spriteSize.y);
        for (int x = 0; x < spriteSize.x; x++)
        {
            for (int y = 0; y < spriteSize.y; y++)
            {
                // Simple pixel body shape
                bool isBody = x > 6 && x < 26 && y > 8 && y < 40;
                bool isHead = x > 8 && x < 24 && y > 36 && y < 48;
                bool isArm = (x < 8 || x > 24) && y > 20 && y < 36;
                bool isLeg = x > 10 && x < 14 && y > 0 && y < 10 || x > 18 && x < 22 && y > 0 && y < 10;

                if (isHead) tex.SetPixel(x, y, new Color32(240, 210, 180, 255));
                else if (isBody) tex.SetPixel(x, y, playerColor);
                else if (isArm) tex.SetPixel(x, y, playerColor);
                else if (isLeg) tex.SetPixel(x, y, new Color32(40, 50, 80, 255));
                else tex.SetPixel(x, y, new Color32(0, 0, 0, 0));
            }
        }
        tex.Apply();

        Sprite sprite = Sprite.Create(tex, new Rect(0, 0, spriteSize.x, spriteSize.y), new Vector2(0.5f, 0.25f));
        sprite.name = "PlayerSprite";
        _sr.sprite = sprite;
        _sr.sortingOrder = 10;

        // Direction indicator (small triangle showing facing)
        _directionIndicator = new GameObject("DirectionIndicator");
        _directionIndicator.transform.SetParent(_body.transform);
        _directionIndicator.transform.localPosition = new Vector3(0, -0.3f, 0);

        SpriteRenderer dirSr = _directionIndicator.AddComponent<SpriteRenderer>();
        Texture2D dirTex = new Texture2D(8, 8);
        for (int x = 0; x < 8; x++)
        {
            for (int y = 0; y < 8; y++)
            {
                bool isTriangle = y < x && y < (7 - x);
                dirTex.SetPixel(x, y, isTriangle ? new Color32(255, 255, 255, 200) : new Color32(0, 0, 0, 0));
            }
        }
        dirTex.Apply();
        Sprite dirSprite = Sprite.Create(dirTex, new Rect(0, 0, 8, 8), new Vector2(0.5f, 0.5f));
        dirSprite.name = "DirIndicator";
        dirSr.sprite = dirSprite;
        dirSr.sortingOrder = 11;

        // Collider
        BoxCollider2D col = GetComponent<BoxCollider2D>();
        if (col == null)
        {
            col = gameObject.AddComponent<BoxCollider2D>();
            col.size = new Vector2(0.5f, 0.5f);
            col.isTrigger = true;
        }

        // Interaction trigger
        CircleCollider2D trigger = GetComponent<CircleCollider2D>();
        if (trigger == null)
        {
            trigger = gameObject.AddComponent<CircleCollider2D>();
            trigger.radius = interactRadius;
            trigger.isTrigger = true;
        }

        gameObject.name = "Player";
    }

    // Track last position for footstep sounds
    private Vector2 _lastFramePosition;
    private float _footstepTimer = 0f;
    private Vector2 _currentVelocity = Vector2.zero;
    private float _movementSmoothing = 8f; // acceleration/deceleration rate

    private void Update()
    {
        // Input
        _moveInput = Vector2.zero;
        if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) _moveInput.y = 1;
        if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) _moveInput.y = -1;
        if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) _moveInput.x = -1;
        if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) _moveInput.x = 1;

        _isRunning = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift);

        // Normalize diagonal movement
        if (_moveInput.magnitude > 1)
            _moveInput.Normalize();

        // Track last direction
        if (_moveInput != Vector2.zero)
            _lastDirection = _moveInput.normalized;

        // Smooth movement: accelerate toward target velocity
        float targetSpeed = _isRunning ? runSpeed : walkSpeed;
        Vector2 targetVelocity = _moveInput * targetSpeed;
        _currentVelocity = Vector2.Lerp(_currentVelocity, targetVelocity, _movementSmoothing * Time.deltaTime);

        // Cap max speed
        if (_currentVelocity.magnitude > targetSpeed * 1.1f)
            _currentVelocity = _currentVelocity.normalized * targetSpeed;

        // Footstep sounds
        if (_moveInput != Vector2.zero)
        {
            _footstepTimer += Time.deltaTime;
            if (_footstepTimer > 0.3f)
            {
                _footstepTimer = 0;
                SoundManager.Play(SoundManager.SoundType.Walk);
            }
        }
        else
        {
            _footstepTimer = 0.3f;
        }

        // Walking bob animation
        if (_body != null)
        {
            float bobAmount = _moveInput != Vector2.zero ? 0.03f : 0f;
            float bobSpeed = _isRunning ? 12f : 8f;
            float bob = Mathf.Sin(Time.time * bobSpeed) * bobAmount;
            _body.transform.localPosition = new Vector3(0, bob, 0);
        }

        // Interaction
        if (Input.GetKeyDown(interactKey) && _nearbyInteractable != null)
        {
            SoundManager.Play(SoundManager.SoundType.Interact);
            _nearbyInteractable.Interact();
        }

        // Direction indicator rotation
        if (_directionIndicator != null)
        {
            float angle = Mathf.Atan2(-_lastDirection.x, _lastDirection.y) * Mathf.Rad2Deg;
            _directionIndicator.transform.localRotation = Quaternion.Euler(0, 0, angle);
        }

        // Debug: press F to start surfing
        if (Input.GetKeyDown(KeyCode.F))
        {
            if (!SurfingManager.IsSurfing)
            {
                SurfingManager.StartSurfing("hot", (success, fragments) =>
                {
                    Debug.Log($"Surfing complete! Success: {success}, Fragments: {fragments}");
                    if (success)
                    {
                        InventorySystem.Instance.AddFragment($"Hot wave fragment ({fragments} collected)");
                        SoundManager.Play(SoundManager.SoundType.Success);
                    }
                    else
                    {
                        SoundManager.Play(SoundManager.SoundType.Fail);
                    }
                });
            }
        }

        // Press B to start bar shift (at Tweede Kans only)
        if (Input.GetKeyDown(KeyCode.B))
        {
            BarMinigame.Instance.StartShift((earnings) =>
            {
                Debug.Log($"Bar shift complete! Earned ${earnings}");
            });
        }

        // Escape to pause
        if (Input.GetKeyDown(KeyCode.Escape))
        {
            TogglePause();
        }
    }

    private bool _isPaused = false;
    private void TogglePause()
    {
        _isPaused = !_isPaused;
        Time.timeScale = _isPaused ? 0 : 1;
    }

    private void FixedUpdate()
    {
        _rb.linearVelocity = _currentVelocity;
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        Interactable interactable = other.GetComponent<Interactable>();
        if (interactable != null)
        {
            _nearbyInteractable = interactable;
            interactable.ShowPrompt(true);
            // Scale effect: make interactable grow slightly when player is near
            interactable.transform.localScale = new Vector3(1.2f, 1.2f, 1f);
        }
    }

    private void OnTriggerExit2D(Collider2D other)
    {
        Interactable interactable = other.GetComponent<Interactable>();
        if (interactable != null && interactable == _nearbyInteractable)
        {
            interactable.ShowPrompt(false);
            // Reset scale
            interactable.transform.localScale = Vector3.one;
            _nearbyInteractable = null;
        }
    }