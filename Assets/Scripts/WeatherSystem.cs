using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

/// <summary>
/// Simple weather system for Amsterdam Brewery.
/// Generates daily weather and applies visual overlays.
/// </summary>
public class WeatherSystem : MonoBehaviour
{
    private static WeatherSystem _instance;
    public static WeatherSystem Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("WeatherSystem");
                _instance = go.AddComponent<WeatherSystem>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    public enum WeatherType
    {
        Sunny, Cloudy, Rainy, Storm, Foggy, Snowy
    }

    public WeatherType CurrentWeather { get; private set; } = WeatherType.Cloudy;
    public string WeatherName => CurrentWeather switch
    {
        WeatherType.Sunny => "☀️ Sunny",
        WeatherType.Cloudy => "☁️ Cloudy",
        WeatherType.Rainy => "🌧️ Rainy",
        WeatherType.Storm => "⛈️ Storm",
        WeatherType.Foggy => "🌫️ Foggy",
        WeatherType.Snowy => "❄️ Snowy",
        _ => "☁️ Cloudy"
    };

    private Canvas _weatherCanvas;
    private Image _weatherOverlay;
    private List<GameObject> _particles = new List<GameObject>();
    private List<float> _particleVelocities = new List<float>();
    private const int MAX_PARTICLES = 80;
    private float _particleTimer = 0f;
    private int _currentDay = -1;

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
            if (Application.isPlaying) DontDestroyOnLoad(gameObject);
            CreateWeatherUI();
        }
        else if (_instance != this)
        {
            Object.Destroy(gameObject);
        }
    }

    private void CreateWeatherUI()
    {
        GameObject canvasGO = new GameObject("WeatherCanvas");
        canvasGO.transform.SetParent(transform);
        _weatherCanvas = canvasGO.AddComponent<Canvas>();
        _weatherCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
        _weatherCanvas.sortingOrder = 50;
        CanvasScaler scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1280, 720);
        canvasGO.AddComponent<GraphicRaycaster>();

        GameObject overlayGO = new GameObject("WeatherOverlay", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        overlayGO.transform.SetParent(_weatherCanvas.transform, false);
        _weatherOverlay = overlayGO.GetComponent<Image>();
        RectTransform oRT = overlayGO.GetComponent<RectTransform>();
        oRT.anchorMin = Vector2.zero;
        oRT.anchorMax = Vector2.one;
        oRT.offsetMin = Vector2.zero;
        oRT.offsetMax = Vector2.zero;
        _weatherOverlay.color = new Color32(0, 0, 0, 0);
        _weatherOverlay.raycastTarget = false;
    }

    public void NewDay(int day)
    {
        if (day == _currentDay) return;
        _currentDay = day;

        // Random weather weighted by season
        float roll = Random.Range(0f, 1f);
        if (roll < 0.20f) CurrentWeather = WeatherType.Sunny;
        else if (roll < 0.65f) CurrentWeather = WeatherType.Cloudy;
        else if (roll < 0.85f) CurrentWeather = WeatherType.Rainy;
        else if (roll < 0.90f) CurrentWeather = WeatherType.Storm;
        else if (roll < 0.98f) CurrentWeather = WeatherType.Foggy;
        else CurrentWeather = WeatherType.Snowy;

        ApplyWeatherOverlay();
    }

    private void ApplyWeatherOverlay()
    {
        Color32 overlayColor = CurrentWeather switch
        {
            WeatherType.Sunny => new Color32(255, 240, 200, 10),
            WeatherType.Cloudy => new Color32(180, 180, 190, 30),
            WeatherType.Rainy => new Color32(100, 120, 150, 50),
            WeatherType.Storm => new Color32(40, 40, 60, 80),
            WeatherType.Foggy => new Color32(200, 200, 210, 60),
            WeatherType.Snowy => new Color32(220, 230, 240, 40),
            _ => new Color32(0, 0, 0, 0)
        };
        _weatherOverlay.color = overlayColor;
    }

    private void Update()
    {
        bool hasPrecipitation = CurrentWeather == WeatherType.Rainy ||
                                CurrentWeather == WeatherType.Storm ||
                                CurrentWeather == WeatherType.Snowy;

        if (hasPrecipitation)
        {
            _particleTimer += Time.deltaTime;
            if (_particleTimer > 0.08f)
            {
                _particleTimer = 0;
                SpawnParticle();
            }
        }

        // Update particles
        for (int i = _particles.Count - 1; i >= 0; i--)
        {
            if (_particles[i] == null)
            {
                _particles.RemoveAt(i);
                if (i < _particleVelocities.Count) _particleVelocities.RemoveAt(i);
                continue;
            }

            RectTransform rt = _particles[i].GetComponent<RectTransform>();
            float hVel = i < _particleVelocities.Count ? _particleVelocities[i] : 0f;
            float vVel = CurrentWeather == WeatherType.Snowy ? -40f : -200f;
            rt.anchoredPosition += new Vector2(hVel, vVel) * Time.deltaTime;

            Image img = _particles[i].GetComponent<Image>();
            Color c = img.color;
            c.a -= Time.deltaTime * 0.3f;
            img.color = c;

            if (c.a <= 0 || rt.anchoredPosition.y < -400)
            {
                Object.Destroy(_particles[i]);
                _particles.RemoveAt(i);
                if (i < _particleVelocities.Count) _particleVelocities.RemoveAt(i);
            }
        }
    }

    private void SpawnParticle()
    {
        // Enforce particle limit: remove oldest particle if at cap
        if (_particles.Count >= MAX_PARTICLES)
        {
            GameObject oldest = _particles[0];
            if (oldest != null) Object.Destroy(oldest);
            _particles.RemoveAt(0);
            if (_particleVelocities.Count > 0) _particleVelocities.RemoveAt(0);
        }

        GameObject p = new GameObject("WeatherParticle", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        p.transform.SetParent(_weatherCanvas.transform, false);
        RectTransform rt = p.GetComponent<RectTransform>();

        float x = Random.Range(0f, 1f);
        rt.anchorMin = new Vector2(x, 1.1f);
        rt.anchorMax = new Vector2(x, 1.1f);
        rt.sizeDelta = CurrentWeather == WeatherType.Snowy ? new Vector2(4, 4) : new Vector2(2, 6);
        rt.anchoredPosition = Vector2.zero;

        Image img = p.GetComponent<Image>();
        if (CurrentWeather == WeatherType.Snowy)
            img.color = new Color32(255, 255, 255, 180);
        else
            img.color = new Color32(100, 150, 220, 120);

        _particles.Add(p);
        // Store seeded horizontal velocity per particle to avoid jitter
        float hVel = CurrentWeather == WeatherType.Snowy ? Random.Range(-20f, 20f) : -100f;
        _particleVelocities.Add(hVel);
    }
}