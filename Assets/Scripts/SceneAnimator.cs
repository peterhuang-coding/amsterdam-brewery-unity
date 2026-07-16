using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Animates elements in the location scene:
/// - Clouds drift slowly side-to-side
/// - Neon signs pulse brightness
/// - Flowers gently bob up and down
/// </summary>
public class SceneAnimator : MonoBehaviour
{
    [System.Serializable]
    private class CloudAnim
    {
        public RectTransform rt;
        public Image img;
        public float baseX;
        public float speed;
        public float amplitude;
        public float phase;
    }
    
    [System.Serializable]
    private class PulseAnim
    {
        public Image img;
        public Color32 baseColor;
        public float speed;
        public float phase;
    }
    
    [System.Serializable]
    private class BobAnim
    {
        public RectTransform rt;
        public float baseY;
        public float speed;
        public float amplitude;
        public float phase;
    }
    
    private List<CloudAnim> _clouds = new List<CloudAnim>();
    private List<PulseAnim> _pulses = new List<PulseAnim>();
    private List<BobAnim> _flowers = new List<BobAnim>();
    private float _time;
    
    public void FindElements(Transform sceneRoot)
    {
        // Find clouds
        for (int i = 0; i < sceneRoot.childCount; i++)
        {
            Transform child = sceneRoot.GetChild(i);
            if (child.name.StartsWith("Cloud_"))
            {
                RectTransform rt = child.GetComponent<RectTransform>();
                Image img = child.GetComponent<Image>();
                if (rt != null && img != null)
                {
                    _clouds.Add(new CloudAnim
                    {
                        rt = rt,
                        img = img,
                        baseX = rt.anchoredPosition.x,
                        speed = 8f + Random.Range(0f, 4f),
                        amplitude = 12f + Random.Range(0f, 6f),
                        phase = Random.Range(0f, Mathf.PI * 2f)
                    });
                }
            }
        }
        
        // Find neon glow
        Transform neon = sceneRoot.Find("NeonGlow");
        if (neon != null)
        {
            Image img = neon.GetComponent<Image>();
            if (img != null)
            {
                _pulses.Add(new PulseAnim
                {
                    img = img,
                    baseColor = img.color,
                    speed = 2f,
                    phase = 0f
                });
            }
        }
        
        // Find flowers
        for (int i = 0; i < sceneRoot.childCount; i++)
        {
            Transform child = sceneRoot.GetChild(i);
            if (child.name.StartsWith("Flower_"))
            {
                RectTransform rt = child.GetComponent<RectTransform>();
                if (rt != null)
                {
                    _flowers.Add(new BobAnim
                    {
                        rt = rt,
                        baseY = rt.anchoredPosition.y,
                        speed = 1.5f + Random.Range(0f, 1f),
                        amplitude = 3f + Random.Range(0f, 2f),
                        phase = Random.Range(0f, Mathf.PI * 2f)
                    });
                }
            }
        }
    }
    
    private void Update()
    {
        _time += Time.deltaTime;
        
        // Animate clouds — sin wave horizontal drift + alpha variation
        foreach (var cloud in _clouds)
        {
            float offset = Mathf.Sin(_time * cloud.speed + cloud.phase) * cloud.amplitude;
            cloud.rt.anchoredPosition = new Vector2(cloud.baseX + offset, cloud.rt.anchoredPosition.y);
            
            // Subtle alpha pulse
            float alpha = 0.5f + Mathf.Sin(_time * 1.5f + cloud.phase) * 0.15f;
            Color c = cloud.img.color;
            cloud.img.color = new Color(c.r, c.g, c.b, Mathf.Clamp01(alpha));
        }
        
        // Animate neon pulse — brightness oscillation
        foreach (var pulse in _pulses)
        {
            float alpha = 0.2f + Mathf.Sin(_time * pulse.speed + pulse.phase) * 0.15f + 0.15f;
            pulse.img.color = new Color32(
                pulse.baseColor.r,
                pulse.baseColor.g,
                pulse.baseColor.b,
                (byte)Mathf.Clamp(alpha * 255, 30, 200)
            );
        }
        
        // Animate flowers — gentle vertical bob
        foreach (var flower in _flowers)
        {
            float offset = Mathf.Sin(_time * flower.speed + flower.phase) * flower.amplitude;
            flower.rt.anchoredPosition = new Vector2(flower.rt.anchoredPosition.x, flower.baseY + offset);
        }
    }
    
    public void Clear()
    {
        _clouds.Clear();
        _pulses.Clear();
        _flowers.Clear();
    }
}
