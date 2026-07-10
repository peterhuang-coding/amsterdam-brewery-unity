using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Static entry point for the Inspiration Surfing minigame system.
/// Call SurfingManager.StartSurfing("hot", callback) to begin.
/// </summary>
public static class SurfingManager
{
    public static bool IsSurfing { get; private set; }

    public static void StartSurfing(string waveType, System.Action<bool, int> onComplete)
    {
        if (IsSurfing) return;
        IsSurfing = true;

        GameObject go = new GameObject("SurfingMinigame");
        SurfingMinigame game = go.AddComponent<SurfingMinigame>();
        game.Begin(waveType, (success, fragments) =>
        {
            IsSurfing = false;
            onComplete?.Invoke(success, fragments);
        });
    }
}

/// <summary>
/// "Hot Wave" — horizontal scrolling race against AI competitors.
/// Ride the wave, dodge obstacles, reach the crest first.
/// </summary>
public class SurfingMinigame : MonoBehaviour
{
    private Canvas _canvas;
    private GameObject _surfer;
    private List<GameObject> _competitors = new List<GameObject>();
    private List<GameObject> _obstacles = new List<GameObject>();
    private List<GameObject> _fragments = new List<GameObject>();

    // UI
    private Image _staminaFillImage;
    private Text _fragmentCountText;
    private Text _statusText;
    private Image _waveBg;

    // State
    private string _waveType;
    private System.Action<bool, int> _onComplete;
    private float _surferX = 0f;
    private float _surferY = 0f;
    private float _stamina = 100f;
    private int _fragmentsCollected = 0;
    private float _progress = 0f;
    private float _timeElapsed = 0f;
    private float _maxDuration = 30f;
    private bool _isComplete = false;

    // Competitor positions
    private float[] _compPositions;
    private float[] _compSpeeds;
    private Color32[] _compColors = new[]
    {
        new Color32(255, 100, 100, 255),
        new Color32(100, 200, 255, 255),
        new Color32(255, 200, 100, 255),
        new Color32(200, 100, 255, 255),
        new Color32(100, 255, 150, 255),
    };

    // Obstacle spawn
    private float _obstacleTimer = 0f;
    private float _fragmentTimer = 0f;

    // Wave animation
    private float _waveOffset = 0f;

    // Camera shake
    private float _shakeTimer = 0f;

    public void Begin(string waveType, System.Action<bool, int> onComplete)
    {
        _waveType = waveType;
        _onComplete = onComplete;
        _compPositions = new float[4];
        _compSpeeds = new float[4];
        for (int i = 0; i < 4; i++)
        {
            _compPositions[i] = 0f;
            _compSpeeds[i] = 0.8f + Random.Range(0f, 0.4f);
        }

        BuildUI();
        Time.timeScale = 1f;
    }

    private void BuildUI()
    {
        // Canvas
        GameObject canvasGO = new GameObject("SurfCanvas");
        canvasGO.transform.SetParent(transform);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _canvas.sortingOrder = 200;
        canvasGO.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasGO.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        // Ocean background
        GameObject bgGO = new GameObject("OceanBg", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        bgGO.transform.SetParent(_canvas.transform, false);
        _waveBg = bgGO.GetComponent<Image>();
        RectTransform bgRT = bgGO.GetComponent<RectTransform>();
        bgRT.anchorMin = Vector2.zero;
        bgRT.anchorMax = Vector2.one;
        bgRT.offsetMin = Vector2.zero;
        bgRT.offsetMax = Vector2.zero;
        _waveBg.color = new Color32(5, 10, 30, 255);

        // Progress bar
        GameObject progGO = new GameObject("ProgressBar", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        progGO.transform.SetParent(_canvas.transform, false);
        Image progBg = progGO.GetComponent<Image>();
        progBg.color = new Color32(20, 30, 50, 200);
        RectTransform progRT = progGO.GetComponent<RectTransform>();
        progRT.anchorMin = new Vector2(0.1f, 0.9f);
        progRT.anchorMax = new Vector2(0.9f, 0.95f);
        progRT.offsetMin = Vector2.zero;
        progRT.offsetMax = Vector2.zero;

        GameObject fillGO = new GameObject("Fill", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        fillGO.transform.SetParent(progGO.transform, false);
        Image fillImg = fillGO.GetComponent<Image>();
        fillImg.color = new Color32(60, 200, 255, 255);
        fillImg.type = Image.Type.Filled;
        fillImg.fillMethod = Image.FillMethod.Horizontal;
        fillImg.fillAmount = 0;
        RectTransform fillRT = fillGO.GetComponent<RectTransform>();
        fillRT.anchorMin = Vector2.zero;
        fillRT.anchorMax = Vector2.one;
        fillRT.offsetMin = Vector2.zero;
        fillRT.offsetMax = Vector2.zero;

        // Stamina bar
        GameObject stamGO = new GameObject("StaminaBar", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        stamGO.transform.SetParent(_canvas.transform, false);
        Image stamBg = stamGO.GetComponent<Image>();
        stamBg.color = new Color32(20, 30, 50, 200);
        RectTransform stamRT = stamGO.GetComponent<RectTransform>();
        stamRT.anchorMin = new Vector2(0.02f, 0.05f);
        stamRT.anchorMax = new Vector2(0.3f, 0.1f);
        stamRT.offsetMin = Vector2.zero;
        stamRT.offsetMax = Vector2.zero;

        GameObject stamFillGO = new GameObject("StaminaFill", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        stamFillGO.transform.SetParent(stamGO.transform, false);
        _staminaFillImage = stamFillGO.GetComponent<Image>();
        _staminaFillImage.color = new Color32(255, 200, 60, 255);
        _staminaFillImage.type = Image.Type.Filled;
        _staminaFillImage.fillMethod = Image.FillMethod.Horizontal;
        _staminaFillImage.fillAmount = 1;
        RectTransform stamFillRT = stamFillGO.GetComponent<RectTransform>();
        stamFillRT.anchorMin = Vector2.zero;
        stamFillRT.anchorMax = Vector2.one;
        stamFillRT.offsetMin = Vector2.zero;
        stamFillRT.offsetMax = Vector2.zero;

        // Fragment count
        _fragmentCountText = CreateUIText("FragmentCount", _canvas.transform,
            new Vector2(0.02f, 0.85f), new Vector2(0.2f, 0.9f),
            20, TextAnchor.LowerLeft);
        _fragmentCountText.text = "Fragments: 0";
        _fragmentCountText.color = new Color32(60, 255, 180, 255);
        _fragmentCountText.fontStyle = FontStyle.Bold;

        // Status text
        _statusText = CreateUIText("StatusText", _canvas.transform,
            new Vector2(0.35f, 0.75f), new Vector2(0.65f, 0.85f),
            28, TextAnchor.MiddleCenter);
        _statusText.text = "🌊 Ride the Wave!";
        _statusText.color = new Color32(255, 255, 255, 200);
        _statusText.fontStyle = FontStyle.Bold;

        // Wave type label
        Text waveLabel = CreateUIText("WaveLabel", _canvas.transform,
            new Vector2(0.35f, 0.85f), new Vector2(0.65f, 0.92f),
            16, TextAnchor.MiddleCenter);
        string waveName = _waveType switch
        {
            "hot" => "🔴 Hot Wave — Race to the Crest",
            "cross" => "🟢 Cross Wave — Merge Fragments",
            "industrial" => "🟡 Industrial Wave — Speed Read",
            "dark" => "🟣 Dark Wave — Dive Deep",
            _ => "🌊 Unknown Wave"
        };
        waveLabel.text = waveName;
        waveLabel.color = new Color32(200, 200, 200, 150);

        // Instructions
        Text instructions = CreateUIText("Instructions", _canvas.transform,
            new Vector2(0.02f, 0.02f), new Vector2(0.5f, 0.05f),
            12, TextAnchor.LowerLeft);
        instructions.text = "↑ Accelerate  ↓ Brake  ←→ Move  Space Jump";
        instructions.color = new Color32(150, 150, 150, 150);

        // Player surfer (simple colored rectangle)
        _surfer = CreateSurfer(new Color32(60, 200, 255, 255), "Player");
        _surfer.transform.SetParent(_canvas.transform, false);

        // Competitors
        for (int i = 0; i < 4; i++)
        {
            GameObject comp = CreateSurfer(_compColors[i], $"Comp_{i}");
            comp.transform.SetParent(_canvas.transform, false);
            _competitors.Add(comp);
        }

        // Spawn initial obstacles
        for (int i = 0; i < 5; i++)
        {
            SpawnObstacle(Random.Range(0.3f, 0.9f));
        }
    }

    private GameObject CreateSurfer(Color32 color, string name)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.sizeDelta = new Vector2(24, 32);
        Image img = go.GetComponent<Image>();
        img.color = color;

        // Direction indicator (small triangle)
        GameObject dir = new GameObject("Direction", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        dir.transform.SetParent(go.transform, false);
        RectTransform drt = dir.GetComponent<RectTransform>();
        drt.anchorMin = new Vector2(0.5f, 0);
        drt.anchorMax = new Vector2(0.5f, 0);
        drt.sizeDelta = new Vector2(8, 8);
        drt.anchoredPosition = new Vector2(0, -4);
        Image dirImg = dir.GetComponent<Image>();
        dirImg.color = new Color32(255, 255, 255, 100);

        return go;
    }

    private void SpawnObstacle(float xPos)
    {
        GameObject obs = new GameObject($"Obstacle_{_obstacles.Count}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        obs.transform.SetParent(_canvas.transform, false);
        RectTransform oRT = obs.GetComponent<RectTransform>();
        oRT.sizeDelta = new Vector2(20, 12);
        Image oImg = obs.GetComponent<Image>();
        oImg.color = new Color32(200, 60, 60, 180);

        // Position at random Y
        float y = Random.Range(0.2f, 0.7f);
        oRT.anchorMin = new Vector2(xPos, y);
        oRT.anchorMax = new Vector2(xPos, y);
        oRT.anchoredPosition = Vector2.zero;

        _obstacles.Add(obs);
    }

    private void SpawnFragment(float xPos)
    {
        GameObject frag = new GameObject($"Fragment_{_fragments.Count}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        frag.transform.SetParent(_canvas.transform, false);
        RectTransform fRT = frag.GetComponent<RectTransform>();
        fRT.sizeDelta = new Vector2(12, 12);
        Image fImg = frag.GetComponent<Image>();
        fImg.color = new Color32(60, 255, 180, 220);

        float y = Random.Range(0.2f, 0.7f);
        fRT.anchorMin = new Vector2(xPos, y);
        fRT.anchorMax = new Vector2(xPos, y);
        fRT.anchoredPosition = Vector2.zero;

        // Glow effect
        GameObject glow = new GameObject("Glow", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        glow.transform.SetParent(frag.transform, false);
        RectTransform gRT = glow.GetComponent<RectTransform>();
        gRT.sizeDelta = new Vector2(24, 24);
        gRT.anchoredPosition = Vector2.zero;
        Image gImg = glow.GetComponent<Image>();
        gImg.color = new Color32(60, 255, 180, 60);

        _fragments.Add(frag);
    }

    private void SpawnCollectEffect(float x, float y)
    {
        // Particle burst effect: 6 small colored squares that fly outward
        Color32[] particleColors = new[] {
            new Color32(60, 255, 180, 255),
            new Color32(255, 220, 60, 255),
            new Color32(60, 200, 255, 255),
            new Color32(255, 150, 255, 255),
        };
        for (int i = 0; i < 6; i++)
        {
            GameObject p = new GameObject($"Particle_{i}", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            p.transform.SetParent(_canvas.transform, false);
            RectTransform pRT = p.GetComponent<RectTransform>();
            pRT.anchorMin = new Vector2(x, y);
            pRT.anchorMax = new Vector2(x, y);
            pRT.sizeDelta = new Vector2(6, 6);
            Image pImg = p.GetComponent<Image>();
            pImg.color = particleColors[i % particleColors.Length];

            float angle = (i / 6f) * 360f;
            float speed = 1.5f;
            p.AddComponent<CollectParticle>().Init(angle, speed, 0.5f);
        }
    }

    private void Update()
    {
        if (_isComplete) return;

        _timeElapsed += Time.deltaTime;
        _waveOffset += Time.deltaTime * 0.5f;
        _shakeTimer = Mathf.Max(0, _shakeTimer - Time.deltaTime);

        // Wave background animation
        if (_waveBg != null)
        {
            float waveAlpha = 0.6f + Mathf.Sin(_waveOffset) * 0.1f;
            _waveBg.color = new Color32(5, 10, (byte)(30 + Mathf.Sin(_waveOffset) * 10), 255);
        }

        // Player input
        float moveSpeed = 1.5f;
        float accelCost = 15f * Time.deltaTime;
        float staminaRegen = 5f * Time.deltaTime;

        if (Input.GetKey(KeyCode.UpArrow) && _stamina > 0)
        {
            moveSpeed = 3f;
            _stamina -= accelCost;
            // Shake effect
            _shakeTimer = 0.1f;
        }
        else
        {
            _stamina += staminaRegen;
        }

        if (Input.GetKey(KeyCode.DownArrow))
        {
            moveSpeed = 0.5f;
        }

        _stamina = Mathf.Clamp(_stamina, 0, 100);

        // Horizontal movement
        float hInput = 0;
        if (Input.GetKey(KeyCode.LeftArrow)) hInput = -1;
        if (Input.GetKey(KeyCode.RightArrow)) hInput = 1;
        _surferX += hInput * Time.deltaTime * 1.5f;
        _surferX = Mathf.Clamp(_surferX, -0.4f, 0.4f);

        // Vertical position (follow wave)
        _surferY = 0.4f + Mathf.Sin(_waveOffset + _surferX * 2) * 0.08f;

        // Progress
        _progress += moveSpeed * Time.deltaTime * 3f;
        _progress = Mathf.Clamp(_progress, 0, 100);

        // Update surfer position
        RectTransform sRT = _surfer.GetComponent<RectTransform>();
        sRT.anchorMin = new Vector2(0.1f + _surferX, _surferY);
        sRT.anchorMax = new Vector2(0.1f + _surferX, _surferY);
        sRT.anchoredPosition = Vector2.zero;

        // Apply shake
        if (_shakeTimer > 0)
        {
            sRT.anchoredPosition = new Vector2(Random.Range(-3f, 3f), Random.Range(-3f, 3f));
        }

        // Update competitors
        for (int i = 0; i < _competitors.Count; i++)
        {
            _compPositions[i] += _compSpeeds[i] * Time.deltaTime * 2.5f;
            _compPositions[i] = Mathf.Clamp(_compPositions[i], 0, 100);

            RectTransform cRT = _competitors[i].GetComponent<RectTransform>();
            float cX = 0.1f + (_compPositions[i] / 100f) * 0.75f;
            float cY = 0.35f + Mathf.Sin(_waveOffset + i * 1.5f) * 0.08f + i * 0.05f;
            cRT.anchorMin = new Vector2(cX, cY);
            cRT.anchorMax = new Vector2(cX, cY);
            cRT.anchoredPosition = Vector2.zero;
        }

        // Update obstacles (scroll left)
        for (int i = _obstacles.Count - 1; i >= 0; i--)
        {
            RectTransform oRT = _obstacles[i].GetComponent<RectTransform>();
            float newX = oRT.anchorMin.x - Time.deltaTime * 0.3f;
            if (newX < -0.1f)
            {
                Destroy(_obstacles[i]);
                _obstacles.RemoveAt(i);
                continue;
            }
            oRT.anchorMin = new Vector2(newX, oRT.anchorMin.y);
            oRT.anchorMax = new Vector2(newX, oRT.anchorMax.y);

            // Collision with player
            if (Mathf.Abs(newX - (0.1f + _surferX)) < 0.04f &&
                Mathf.Abs(oRT.anchorMin.y - _surferY) < 0.08f)
            {
                _stamina -= 20;
                _shakeTimer = 0.3f;
                _statusText.text = "💥 Hit!";
                _statusText.color = new Color32(255, 100, 100, 255);
                Destroy(_obstacles[i]);
                _obstacles.RemoveAt(i);
            }
        }

        // Update fragments (scroll left)
        for (int i = _fragments.Count - 1; i >= 0; i--)
        {
            RectTransform fRT = _fragments[i].GetComponent<RectTransform>();
            float newX = fRT.anchorMin.x - Time.deltaTime * 0.3f;
            if (newX < -0.1f)
            {
                Destroy(_fragments[i]);
                _fragments.RemoveAt(i);
                continue;
            }
            fRT.anchorMin = new Vector2(newX, fRT.anchorMin.y);
            fRT.anchorMax = new Vector2(newX, fRT.anchorMax.y);

            // Collision with player (collect)
            if (Mathf.Abs(newX - (0.1f + _surferX)) < 0.04f &&
                Mathf.Abs(fRT.anchorMin.y - _surferY) < 0.08f)
            {
                _fragmentsCollected++;
                _fragmentCountText.text = $"Fragments: {_fragmentsCollected}";
                _statusText.text = "✨ Fragment collected!";
                _statusText.color = new Color32(60, 255, 180, 255);
                SpawnCollectEffect(fRT.anchorMin.x, fRT.anchorMin.y);
                Destroy(_fragments[i]);
                _fragments.RemoveAt(i);
            }
        }

        // Spawn obstacles
        _obstacleTimer += Time.deltaTime;
        if (_obstacleTimer > 1.5f)
        {
            _obstacleTimer = 0;
            SpawnObstacle(0.95f);
        }

        // Spawn fragments
        _fragmentTimer += Time.deltaTime;
        if (_fragmentTimer > 2f)
        {
            _fragmentTimer = 0;
            SpawnFragment(0.95f);
        }

        // Update progress bar
        Transform progBar = _canvas?.transform.Find("ProgressBar");
        if (progBar != null)
        {
            Transform fill = progBar.Find("Fill");
            if (fill != null)
            {
                Image fi = fill.GetComponent<Image>();
                if (fi != null) fi.fillAmount = _progress / 100f;
            }
        }

        // Update stamina bar visual
        if (_staminaFillImage != null)
        {
            _staminaFillImage.fillAmount = _stamina / 100f;
        }

        // Check win/lose
        if (_progress >= 100)
        {
            Win();
        }
        else if (_timeElapsed >= _maxDuration)
        {
            Lose();
        }
        else if (_stamina <= 0)
        {
            _statusText.text = "💤 Exhausted!";
            _statusText.color = new Color32(255, 100, 100, 255);
            if (_timeElapsed % 1f < 0.1f) // brief delay before losing
            {
                Lose();
            }
        }
    }

    private void Win()
    {
        _isComplete = true;
        _statusText.text = "🏆 Wave Crest Reached!";
        _statusText.color = new Color32(255, 220, 60, 255);
        _statusText.fontSize = 36;

        // Bonus fragments for winning
        int bonus = 2;
        _fragmentsCollected += bonus;
        _fragmentCountText.text = $"Fragments: {_fragmentsCollected}";

        Invoke(nameof(Finish), 2f);
    }

    private void Lose()
    {
        _isComplete = true;
        _statusText.text = "🌊 The wave passed...";
        _statusText.color = new Color32(150, 150, 150, 255);
        Invoke(nameof(Finish), 2f);
    }

    private void Finish()
    {
        Time.timeScale = 1f;
        bool success = _progress >= 50;
        _onComplete?.Invoke(success, _fragmentsCollected);
        Destroy(gameObject);
    }

    private Text CreateUIText(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax,
        int fontSize, TextAnchor alignment)
    {
        GameObject go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        go.transform.SetParent(parent, false);
        RectTransform rt = go.GetComponent<RectTransform>();
        rt.anchorMin = anchorMin;
        rt.anchorMax = anchorMax;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;

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

/// <summary>
/// Simple particle that flies outward and fades away.
/// Used for the fragment collection effect.
/// </summary>
public class CollectParticle : MonoBehaviour
{
    private Vector2 _velocity;
    private float _lifetime;
    private float _age;
    private Image _image;

    public void Init(float angleDeg, float speed, float lifetime)
    {
        float rad = angleDeg * Mathf.Deg2Rad;
        _velocity = new Vector2(Mathf.Cos(rad), Mathf.Sin(rad)) * speed * 0.01f;
        _lifetime = lifetime;
        _age = 0;
        _image = GetComponent<Image>();
    }

    private void Update()
    {
        _age += Time.deltaTime;
        if (_age >= _lifetime)
        {
            Destroy(gameObject);
            return;
        }

        RectTransform rt = GetComponent<RectTransform>();
        rt.anchoredPosition += _velocity * Time.deltaTime * 200f;

        if (_image != null)
        {
            Color c = _image.color;
            c.a = Mathf.Lerp(1, 0, _age / _lifetime);
            _image.color = c;
        }

        float scale = Mathf.Lerp(1, 0.2f, _age / _lifetime);
        rt.localScale = new Vector3(scale, scale, 1);
    }
}