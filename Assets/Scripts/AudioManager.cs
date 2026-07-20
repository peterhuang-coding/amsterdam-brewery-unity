using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Manages procedural background music and scene ambience.
/// All audio is programmatically synthesized — no external audio files.
/// </summary>
public class AudioManager : MonoBehaviour
{
    private static AudioManager _instance;
    public static AudioManager Instance
    {
        get
        {
            if (_instance == null)
            {
                GameObject go = new GameObject("AudioManager");
                _instance = go.AddComponent<AudioManager>();
                if (Application.isPlaying) DontDestroyOnLoad(go);
            }
            return _instance;
        }
    }

    // ── BGM scene melodies (4-note loops, frequencies in Hz) ──
    private static readonly Dictionary<string, float[]> SceneMelodies = new Dictionary<string, float[]>
    {
        { "de_pijp", new float[] { 261.63f, 329.63f, 392.00f, 329.63f } },       // C4 E4 G4 E4
        { "science_park", new float[] { 293.66f, 349.23f, 440.00f, 349.23f } },   // D4 F4 A4 F4
        { "tweede_kans", new float[] { 196.00f, 233.08f, 293.66f, 261.63f } },    // G3 Bb3 D4 C4
        { "bloemenmarkt", new float[] { 349.23f, 440.00f, 523.25f, 440.00f } },   // F4 A4 C5 A4
    };

    // ── Audio sources ──
    private AudioSource _musicSource;      // looping BGM
    private AudioSource _ambienceSource;   // looping ambience
    private AudioSource _sfxSource;        // one-shot sound effects

    // ── State ──
    private string _currentSceneId;
    private float _musicVolume = 0.3f;
    private float _ambienceVolume = 0.2f;
    private bool _initialized;

    // ── Cached sound effects ──
    private AudioClip _chimeClip;
    private AudioClip _bellClip;
    private AudioClip _highlightClip;

    private void Awake()
    {
        if (_instance != null && _instance != this)
        {
            Destroy(gameObject);
            return;
        }

        _instance = this;
        if (Application.isPlaying) DontDestroyOnLoad(gameObject);
        Initialize();
    }

    private void Initialize()
    {
        if (_initialized) return;
        _initialized = true;

        // Music source (looping BGM)
        GameObject musicGO = new GameObject("MusicSource");
        musicGO.transform.SetParent(transform);
        _musicSource = musicGO.AddComponent<AudioSource>();
        _musicSource.loop = true;
        _musicSource.volume = _musicVolume;
        _musicSource.playOnAwake = false;

        // Ambience source (looping environment)
        GameObject ambGO = new GameObject("AmbienceSource");
        ambGO.transform.SetParent(transform);
        _ambienceSource = ambGO.AddComponent<AudioSource>();
        _ambienceSource.loop = true;
        _ambienceSource.volume = _ambienceVolume;
        _ambienceSource.playOnAwake = false;

        // SFX source (one-shot)
        GameObject sfxGO = new GameObject("SFXSource");
        sfxGO.transform.SetParent(transform);
        _sfxSource = sfxGO.AddComponent<AudioSource>();
        _sfxSource.volume = 0.4f;
        _sfxSource.playOnAwake = false;

        // Pre-generate sound effects
        _chimeClip = GenerateChime();
        _bellClip = GenerateBell();
        _highlightClip = GenerateHighlight();
    }

    // ══════════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════════

    /// <summary>Play BGM for a scene. Crossfades from current BGM if any.</summary>
    public void PlayMusic(string sceneId)
    {
        if (!_initialized) Initialize();

        if (sceneId == _currentSceneId) return;
        _currentSceneId = sceneId;

        float[] notes;
        if (!SceneMelodies.TryGetValue(sceneId, out notes))
        {
            // Fallback: a simple C major arpeggio
            notes = new float[] { 261.63f, 329.63f, 392.00f, 523.25f };
        }

        AudioClip newClip = GenerateMelody(notes, 120f);
        StartCoroutine(CrossfadeMusic(newClip));
    }

    /// <summary>Play scene ambience sound effect.</summary>
    public void PlayAmbience(string sceneId)
    {
        if (!_initialized) Initialize();

        AudioClip clip = null;

        switch (sceneId)
        {
            case "de_pijp":
                clip = GenerateRain();
                break;
            case "science_park":
                clip = GenerateRain(); // Science park also has rain ambience
                break;
            case "bloemenmarkt":
                clip = GenerateMarket();
                break;
            case "tweede_kans":
                clip = GenerateBarAmbience();
                break;
        }

        if (clip != null)
        {
            _ambienceSource.clip = clip;
            _ambienceSource.Play();
        }
    }

    /// <summary>Fade out and stop BGM.</summary>
    public void StopMusic()
    {
        if (_musicSource != null && _musicSource.isPlaying)
        {
            StartCoroutine(FadeOut(_musicSource, 0.5f));
        }
        _currentSceneId = null;
    }

    /// <summary>Set music volume (0.0 - 1.0).</summary>
    public void SetVolume(float v)
    {
        _musicVolume = Mathf.Clamp01(v);
        if (_musicSource != null)
            _musicSource.volume = _musicVolume;
    }

    /// <summary>Stop all audio.</summary>
    public void StopAll()
    {
        if (_musicSource != null)
        {
            _musicSource.Stop();
            _musicSource.clip = null;
        }
        if (_ambienceSource != null)
        {
            _ambienceSource.Stop();
            _ambienceSource.clip = null;
        }
        _currentSceneId = null;
    }

    // ── SFX one-shots ──
    public void PlayDaytimeChime()  { PlayOneShot(_chimeClip); }
    public void PlayDoorBell()      { PlayOneShot(_bellClip); }
    public void PlayHighlight()     { PlayOneShot(_highlightClip); }

    // ══════════════════════════════════════════════════════════════
    //  BGM GENERATION
    // ══════════════════════════════════════════════════════════════

    /// <summary>Generate a looping melody clip from note frequencies.</summary>
    private AudioClip GenerateMelody(float[] notes, float bpm = 120f)
    {
        int sampleRate = 44100;
        float noteDuration = 60f / bpm; // 0.5s at 120bpm
        float totalDuration = noteDuration * notes.Length; // 2s for 4 notes
        int totalSamples = Mathf.FloorToInt(sampleRate * totalDuration);

        float[] data = new float[totalSamples];
        int samplesPerNote = Mathf.FloorToInt(sampleRate * noteDuration);
        float fadeSamples = Mathf.FloorToInt(sampleRate * 0.02f); // 20ms crossfade between notes

        for (int n = 0; n < notes.Length; n++)
        {
            float freq = notes[n];
            int noteStart = n * samplesPerNote;
            int noteEnd = noteStart + samplesPerNote;

            for (int i = noteStart; i < noteEnd && i < totalSamples; i++)
            {
                float t = (float)(i - noteStart) / sampleRate;
                float value = Mathf.Sin(2 * Mathf.PI * freq * t);

                // Envelope: fade in at start, fade out at end, sustain in middle
                float envelope = 1f;
                int localPos = i - noteStart;

                // Attack (first 5ms)
                if (localPos < fadeSamples)
                    envelope = (float)localPos / fadeSamples;
                // Release (last 20ms)
                else if (localPos > samplesPerNote - fadeSamples)
                    envelope = (float)(samplesPerNote - localPos) / fadeSamples;

                data[i] = value * envelope * 0.15f; // background volume
            }

            // Crossfade between consecutive notes (overlap-add)
            if (n < notes.Length - 1)
            {
                float nextFreq = notes[n + 1];
                int overlapStart = noteEnd - (int)fadeSamples;
                int overlapEnd = noteEnd + (int)fadeSamples;

                for (int i = overlapStart; i < overlapEnd && i < totalSamples; i++)
                {
                    if (i < noteStart) continue;

                    float fadeOutWeight = 1f - (float)(i - overlapStart) / (overlapEnd - overlapStart);
                    float fadeInWeight = (float)(i - overlapStart) / (overlapEnd - overlapStart);

                    // Current note tail
                    float tCur = (float)(i - noteStart) / sampleRate;
                    float curValue = Mathf.Sin(2 * Mathf.PI * freq * tCur) * fadeOutWeight * 0.15f;

                    // Next note head
                    int nextLocal = i - (n + 1) * samplesPerNote;
                    float tNext = (float)nextLocal / sampleRate;
                    float nextValue = Mathf.Sin(2 * Mathf.PI * nextFreq * tNext) * fadeInWeight * 0.15f;

                    data[i] = curValue + nextValue;
                }
            }
        }

        AudioClip clip = AudioClip.Create("BGM_" + string.Join("_", notes), totalSamples, 1, sampleRate, true);
        clip.SetData(data, 0);
        return clip;
    }

    // ══════════════════════════════════════════════════════════════
    //  AMBIENCE GENERATION
    // ══════════════════════════════════════════════════════════════

    /// <summary>Rain: white noise + low-frequency filtering (simulated with slow sine modulation).</summary>
    private AudioClip GenerateRain()
    {
        int sampleRate = 44100;
        float duration = 4f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        // Use a fixed seed so rain sounds consistent
        Random.InitState(42);

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            // White noise
            float noise = Random.Range(-1f, 1f);
            // Low-frequency rumble (simulates filtered rain)
            float rumble = Mathf.Sin(2 * Mathf.PI * 80f * t) * 0.3f;
            // Pattering effect: random bursts
            float pat = Mathf.Sin(2 * Mathf.PI * 3f * t) * 0.5f + 0.5f;
            float value = noise * 0.4f * pat + rumble * 0.3f;
            data[i] = value * 0.12f;
        }

        AudioClip clip = AudioClip.Create("Rain", samples, 1, sampleRate, true);
        clip.SetData(data, 0);
        return clip;
    }

    /// <summary>Market: mix of high-frequency short tones simulating chatter and activity.</summary>
    private AudioClip GenerateMarket()
    {
        int sampleRate = 44100;
        float duration = 4f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        Random.InitState(123);

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float value = 0f;

            // High-frequency random pings (simulate chatter)
            for (int j = 0; j < 3; j++)
            {
                float pingFreq = 800f + Random.Range(0f, 1200f);
                float pingPhase = Random.Range(0f, 2f * Mathf.PI);
                float pingDuration = 0.05f + Random.Range(0f, 0.1f);
                float pingEnv = Mathf.Clamp01(1f - (t % pingDuration) / pingDuration);
                value += Mathf.Sin(2 * Mathf.PI * pingFreq * t + pingPhase) * pingEnv * 0.15f;
            }

            // Low hum (crowd)
            float hum = Mathf.Sin(2 * Mathf.PI * 120f * t) * 0.08f;
            value += hum;

            data[i] = value * 0.12f;
        }

        AudioClip clip = AudioClip.Create("Market", samples, 1, sampleRate, true);
        clip.SetData(data, 0);
        return clip;
    }

    /// <summary>Bar ambience: low buzz + glass clink sounds.</summary>
    private AudioClip GenerateBarAmbience()
    {
        int sampleRate = 44100;
        float duration = 4f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        Random.InitState(99);

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float value = 0f;

            // Low buzz (HVAC / crowd murmur)
            float buzz = Mathf.Sin(2 * Mathf.PI * 100f * t) * 0.5f
                       + Mathf.Sin(2 * Mathf.PI * 155f * t) * 0.3f;
            value += buzz * 0.1f;

            // Glass clink (high-frequency short burst, occasional)
            float clinkPhase = (t * 1.5f) % 1f; // ~1.5 clinks per second
            if (clinkPhase < 0.08f)
            {
                float clinkFreq = 2000f + Mathf.Sin(2 * Mathf.PI * 10f * t) * 500f;
                float clinkEnv = Mathf.Clamp01(1f - clinkPhase / 0.08f);
                value += Mathf.Sin(2 * Mathf.PI * clinkFreq * t) * clinkEnv * 0.3f;
            }

            data[i] = value * 0.15f;
        }

        AudioClip clip = AudioClip.Create("BarAmbience", samples, 1, sampleRate, true);
        clip.SetData(data, 0);
        return clip;
    }

    // ══════════════════════════════════════════════════════════════
    //  SFX GENERATION
    // ══════════════════════════════════════════════════════════════

    /// <summary>Gentle ascending chime for daytime transition.</summary>
    private AudioClip GenerateChime()
    {
        int sampleRate = 44100;
        float duration = 0.6f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            // Two ascending notes
            float freq = t < duration / 2f ? 523.25f : 659.25f; // C5 then E5
            float value = Mathf.Sin(2 * Mathf.PI * freq * t);
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * envelope * 0.25f;
        }

        AudioClip clip = AudioClip.Create("Chime", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    /// <summary>Door bell / bar entry sound.</summary>
    private AudioClip GenerateBell()
    {
        int sampleRate = 44100;
        float duration = 0.4f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            // Bell-like: high fundamental + harmonics
            float value = Mathf.Sin(2 * Mathf.PI * 880f * t) * 0.6f
                        + Mathf.Sin(2 * Mathf.PI * 1320f * t) * 0.3f
                        + Mathf.Sin(2 * Mathf.PI * 1760f * t) * 0.1f;
            float envelope = Mathf.Clamp01(1f - (t / duration));
            envelope = envelope * envelope; // quadratic decay for bell-like ring
            data[i] = value * envelope * 0.2f;
        }

        AudioClip clip = AudioClip.Create("Bell", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    /// <summary>Highlight / new event notification sound.</summary>
    private AudioClip GenerateHighlight()
    {
        int sampleRate = 44100;
        float duration = 0.3f;
        int samples = Mathf.FloorToInt(sampleRate * duration);
        float[] data = new float[samples];

        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            // Rising frequency sweep
            float freq = Mathf.Lerp(440f, 880f, t / duration);
            float value = Mathf.Sin(2 * Mathf.PI * freq * t);
            float envelope = Mathf.Clamp01(1f - (t / duration));
            data[i] = value * envelope * 0.3f;
        }

        AudioClip clip = AudioClip.Create("Highlight", samples, 1, sampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }

    // ══════════════════════════════════════════════════════════════
    //  COROUTINES
    // ══════════════════════════════════════════════════════════════

    private IEnumerator CrossfadeMusic(AudioClip newClip)
    {
        // Fade out current
        if (_musicSource.isPlaying && _musicSource.clip != null)
        {
            yield return StartCoroutine(FadeOut(_musicSource, 0.5f));
        }

        // Switch to new clip
        _musicSource.clip = newClip;
        _musicSource.volume = 0f;
        _musicSource.Play();

        // Fade in
        yield return StartCoroutine(FadeIn(_musicSource, 0.5f));
    }

    private IEnumerator FadeOut(AudioSource source, float duration)
    {
        float startVolume = source.volume;
        float t = 0;

        while (t < duration)
        {
            t += Time.deltaTime;
            source.volume = Mathf.Lerp(startVolume, 0f, t / duration);
            yield return null;
        }

        source.Stop();
        source.volume = startVolume; // restore for next use
    }

    private IEnumerator FadeIn(AudioSource source, float duration)
    {
        float targetVolume = _musicVolume;
        float t = 0;

        while (t < duration)
        {
            t += Time.deltaTime;
            source.volume = Mathf.Lerp(0f, targetVolume, t / duration);
            yield return null;
        }

        source.volume = targetVolume;
    }

    private void PlayOneShot(AudioClip clip)
    {
        if (!_initialized) Initialize();
        if (clip != null && _sfxSource != null)
            _sfxSource.PlayOneShot(clip);
    }
}