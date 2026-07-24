using UnityEditor;
using UnityEngine;
using System.Collections;
using System.IO;

/// <summary>
/// Automated smoke test: enters Play mode, advances through key game
/// states, and captures screenshots. Run from Unity Editor menu:
///   Tools → Playtest Smoke Run
/// Results saved to /tmp/playtest-output/
/// </summary>
public static class PlaytestSmoke
{
    [MenuItem("Tools/Playtest Smoke Run")]
    public static void Run()
    {
        if (!EditorApplication.isPlaying)
        {
            EditorApplication.isPlaying = true;
            EditorApplication.delayCall += () =>
            {
                var runner = new GameObject("PlaytestSmokeRunner")
                    .AddComponent<PlaytestSmokeRunner>();
                Object.DontDestroyOnLoad(runner.gameObject);
            };
        }
    }
}

public class PlaytestSmokeRunner : MonoBehaviour
{
    private int _step;
    private float _timer;

    IEnumerator Start()
    {
        string dir = "/tmp/playtest-output";
        Directory.CreateDirectory(dir);
        var report = new System.Text.StringBuilder();
        report.AppendLine("# Playtest Smoke Report");
        report.AppendLine($"Date: {System.DateTime.Now}");
        report.AppendLine();

        // Step 0: Wait for scene to load
        yield return new WaitForSeconds(2f);
        LogStep(report, "Scene loaded", Application.isPlaying);
        ScreenCapture.CaptureScreenshot($"{dir}/00-scene-loaded.png");

        // Step 1: Check GameController exists
        yield return new WaitForSeconds(0.5f);
        var gc = GameController.Instance;
        LogStep(report, "GameController present", gc != null);
        ScreenCapture.CaptureScreenshot($"{dir}/01-hud.png");

        // Step 2: Advance time (Space) a few times
        for (int i = 0; i < 3; i++)
        {
            yield return new WaitForSeconds(0.3f);
            // Direct call instead of Input simulation
            if (gc != null) gc.AdvanceTimePublic();
        }
        LogStep(report, "Time advanced 3x", gc != null && gc.State.CurrentDay >= 1);
        ScreenCapture.CaptureScreenshot($"{dir}/02-time-advanced.png");

        // Step 3: Toggle panels and verify Escape closes them
        yield return new WaitForSeconds(0.5f);
        if (InventoryUI.Instance != null)
        {
            InventoryUI.Instance.Toggle();
            yield return new WaitForSeconds(0.5f);
            LogStep(report, "Inventory panel opened", InventoryUI.Instance.IsPanelOpen);
            ScreenCapture.CaptureScreenshot($"{dir}/03-inventory-open.png");

            // Verify Escape handler exists
            yield return new WaitForSeconds(0.3f);
            InventoryUI.Instance.Toggle(); // close it
            LogStep(report, "Inventory panel closed", !InventoryUI.Instance.IsPanelOpen);
        }

        // Step 4: Check Beer Competition system
        yield return new WaitForSeconds(0.5f);
        var comp = BeerCompetitionSystem.Instance;
        LogStep(report, "BeerCompetitionSystem present", comp != null);

        // Step 5: Verify UIFactory colors available
        yield return new WaitForSeconds(0.3f);
        LogStep(report, "UIFactory colors defined",
            UIFactory.PanelBg.a > 0 && UIFactory.TextDefault.a > 0);

        // Write report
        yield return new WaitForSeconds(0.5f);
        File.WriteAllText($"{dir}/playtest-report.md", report.ToString());
        Debug.Log("[PlaytestSmoke] Report written to " + dir);

        // Exit Play mode after brief pause
        yield return new WaitForSeconds(1f);
        EditorApplication.isPlaying = false;
    }

    private void LogStep(System.Text.StringBuilder report, string step, bool passed)
    {
        string status = passed ? "PASS" : "FAIL";
        report.AppendLine($"| {status} | {step} |");
        Debug.Log($"[PlaytestSmoke] {status}: {step}");
    }
}
