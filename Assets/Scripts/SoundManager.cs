using UnityEngine;

/// <summary>
/// Generates procedural sound effects using sine/square wave synthesis.
/// No external audio files needed.
/// </summary>
public static class SoundManager
{
    private static AudioSource _sharedSource;
    private static bool _initialized = false;

    public static void Init()
    {
        if (_initialized) return;
        _initialized = true;

        GameObject go = new GameObject("SoundManager");
        _sharedSource = go.AddComponent<AudioSource>();
        _sharedSource.volume = 0.3f;
        Object.DontDestroyOnLoad(go);
    }

    public static void Play(SoundType type)
    {
        if (!_initialized) Init();

        AudioClip clip = type switch
        {
            SoundType.Walk => GenerateClick(0.05f, 800f),
            SoundType.Interact => GenerateTone(440f, 0.15f, WaveType.Sine),
            SoundType.Collect => GenerateCollect(),
            SoundType.Success => GenerateSuccess(),
            SoundType.Fail => GenerateFail(),
            SoundType.Ambience => GenerateHum(2f, 60f),
            _ => null
        };

        if (clip != null)
        {
            _sharedSource.PlayOneShot(clip);
        }
    }

    private static AudioClip GenerateTone(float frequency, float duration, WaveType wave)
    {
        int sampleRate = 44100;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float value = wave switch
            {
                WaveType.Sine => Mathf.Sin(2 * Mathf.PI * frequency * t),
                WaveType.Square => Mathf.Sign(Mathf.Sin(2 * Mathf.PI * frequency * t)),
                WaveType.Sawtooth => 2f * (t * frequency - Mathf.Floor(t * frequency + 0.5f)),
                WaveType.Noise => Random.Range(-1f, 1f),
                _ => 0
            };
            // Fade out at end
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * 0.3f;
        }

        AudioClip clip = AudioClip.Create("Tone", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    private static AudioClip GenerateClick(float duration, float frequency)
    {
        int sampleRate = 44100;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float value = Mathf.Sin(2 * Mathf.PI * frequency * t);
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * envelope * 0.2f;
        }

        AudioClip clip = AudioClip.Create("Click", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    private static AudioClip GenerateCollect()
    {
        int sampleRate = 44100;
        float duration = 0.2f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float freq = Mathf.Lerp(600f, 1200f, t / duration);
            float value = Mathf.Sin(2 * Mathf.PI * freq * t);
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * 0.25f;
        }

        AudioClip clip = AudioClip.Create("Collect", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    private static AudioClip GenerateSuccess()
    {
        int sampleRate = 44100;
        float duration = 0.4f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float freq = t < duration / 2 ? 523f : 659f; // C5 then E5
            float value = Mathf.Sin(2 * Mathf.PI * freq * t);
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * 0.25f;
        }

        AudioClip clip = AudioClip.Create("Success", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    private static AudioClip GenerateFail()
    {
        int sampleRate = 44100;
        float duration = 0.3f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float freq = Mathf.Lerp(400f, 200f, t / duration);
            float value = Mathf.Sin(2 * Mathf.PI * freq * t);
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * 0.25f;
        }

        AudioClip clip = AudioClip.Create("Fail", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    private static AudioClip GenerateHum(float duration, float frequency)
    {
        int sampleRate = 44100;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float value = Mathf.Sin(2 * Mathf.PI * frequency * t) * 0.5f
                        + Mathf.Sin(2 * Mathf.PI * frequency * 2 * t) * 0.3f;
            data[i] = value * 0.1f;
        }

        AudioClip clip = AudioClip.Create("Hum", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    public enum SoundType { Walk, Interact, Collect, Success, Fail, Ambience }
    public enum WaveType { Sine, Square, Sawtooth, Noise }
}