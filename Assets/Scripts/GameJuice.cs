using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Visual juice effects — floating text, screen shake, particle burst.
/// All effects are purely code-generated UI on the GameController's canvas.
/// </summary>
public static class GameJuice
{
    private static Canvas _canvas;
    private static Camera _camera;
    
    private static void EnsureCanvas()
    {
        if (_canvas == null)
        {
            GameObject go = new GameObject("JuiceCanvas");
            go.transform.SetParent(GameController.Instance.transform);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 350;
            go.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            go.GetComponent<CanvasScaler>().referenceResolution = new Vector2(1280, 720);
            go.AddComponent<GraphicRaycaster>();
            // Keep raycasts pass-through
            _canvas.GetComponent<GraphicRaycaster>().enabled = false;
        }
    }
    
    private static void EnsureCamera()
    {
        if (_camera == null)
        {
            // Find the main camera (created by GameController)
            _camera = Camera.main;
            if (_camera == null)
            {
                Camera[] cams = Object.FindObjectsByType<Camera>(FindObjectsInactive.Include, FindObjectsSortMode.None);
                if (cams.Length > 0) _camera = cams[0];
            }
        }
    }
    
    /// <summary>
    /// Spawn floating text that rises and fades out.
    /// </summary>
    public static void SpawnFloatingText(string text, Vector2 startPos, Color32 color)
    {
        EnsureCanvas();
        
        GameObject textGO = new GameObject("FloatingText", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
        textGO.transform.SetParent(_canvas.transform, false);
        
        Text txt = textGO.GetComponent<Text>();
        txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        txt.text = text;
        txt.fontSize = 24;
        txt.fontStyle = FontStyle.Bold;
        txt.color = color;
        txt.alignment = TextAnchor.MiddleCenter;
        
        RectTransform rt = textGO.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(0.5f, 0.5f);
        rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.sizeDelta = new Vector2(200, 40);
        rt.anchoredPosition = startPos;
        
        GameController.Instance.StartCoroutine(FloatingTextRoutine(textGO, rt, txt));
    }
    
    private static IEnumerator FloatingTextRoutine(GameObject go, RectTransform rt, Text txt)
    {
        float duration = 1.2f;
        Vector2 startPos = rt.anchoredPosition;
        Color startColor = txt.color;
        
        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = t / duration;
            rt.anchoredPosition = startPos + new Vector2(0, p * 60f);
            txt.color = new Color(startColor.r, startColor.g, startColor.b, 1f - p);
            yield return null;
        }
        
        Object.Destroy(go);
    }
    
    /// <summary>
    /// Simple screen shake by offsetting the camera.
    /// </summary>
    public static IEnumerator ScreenShake(float intensity, float duration)
    {
        EnsureCamera();
        if (_camera == null) yield break;
        
        Vector3 originalPos = _camera.transform.position;
        float elapsed = 0f;
        
        while (elapsed < duration)
        {
            float x = Random.Range(-1f, 1f) * intensity;
            float y = Random.Range(-1f, 1f) * intensity;
            _camera.transform.position = originalPos + new Vector3(x, y, 0);
            elapsed += Time.deltaTime;
            yield return null;
        }
        
        _camera.transform.position = originalPos;
    }
    
    /// <summary>
    /// Spawn tiny colored squares that burst outward (simple confetti).
    /// </summary>
    public static void SpawnParticles(Vector2 origin, Color32 color, int count = 8)
    {
        EnsureCanvas();
        
        for (int i = 0; i < count; i++)
        {
            GameObject p = new GameObject("JuiceParticle", typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            p.transform.SetParent(_canvas.transform, false);
            
            RectTransform prt = p.GetComponent<RectTransform>();
            prt.anchorMin = new Vector2(0.5f, 0.5f);
            prt.anchorMax = new Vector2(0.5f, 0.5f);
            prt.sizeDelta = new Vector2(6, 6);
            prt.anchoredPosition = origin;
            
            Image img = p.GetComponent<Image>();
            img.color = color;
            
            Vector2 velocity = new Vector2(Random.Range(-120f, 120f), Random.Range(60f, 200f));
            float rotation = Random.Range(-360f, 360f);
            
            GameController.Instance.StartCoroutine(ParticleRoutine(p, prt, img, velocity, rotation));
        }
    }
    
    private static IEnumerator ParticleRoutine(GameObject go, RectTransform rt, Image img, Vector2 velocity, float rotationSpeed)
    {
        float duration = 0.8f;
        Color startColor = img.color;
        
        for (float t = 0; t < duration; t += Time.deltaTime)
        {
            float p = t / duration;
            rt.anchoredPosition += velocity * Time.deltaTime;
            velocity.y -= 200f * Time.deltaTime; // gravity
            rt.Rotate(0, 0, rotationSpeed * Time.deltaTime);
            img.color = new Color(startColor.r, startColor.g, startColor.b, 1f - p);
            yield return null;
        }
        
        Object.Destroy(go);
    }
}
