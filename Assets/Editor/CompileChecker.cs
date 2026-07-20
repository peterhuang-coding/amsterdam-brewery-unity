using System.IO;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

/// <summary>
/// Writes the result of every script compilation to a known file so that
/// external tooling (pm-loop, CI) can programmatically verify compilation.
/// </summary>
[InitializeOnLoad]
public static class CompileChecker
{
    private const string ResultPath = "/tmp/unity-compile-result.json";

    static CompileChecker()
    {
        CompilationPipeline.compilationFinished += OnCompilationFinished;
        // Also write on startup so the file always exists
        EditorApplication.delayCall += () =>
        {
            if (!File.Exists(ResultPath))
                WriteResult("startup", true, "");
        };
    }

    private static void OnCompilationFinished(object obj)
    {
        int errorCount = 0;
        string firstError = "";
        var messages = CompilationPipeline.GetCompilationMessages();
        foreach (var msg in messages)
        {
            if (msg.type == CompilationMessageType.Error)
            {
                if (errorCount == 0)
                    firstError = $"{msg.file}:{msg.line}: {msg.message}";
                errorCount++;
            }
        }

        WriteResult("compile", errorCount == 0, firstError, errorCount);
    }

    private static void WriteResult(string trigger, bool success, string firstError, int errorCount = 0)
    {
        var json = $"{{\n" +
                   $"  \"trigger\": \"{Escape(trigger)}\",\n" +
                   $"  \"success\": {(success ? "true" : "false")},\n" +
                   $"  \"errorCount\": {errorCount},\n" +
                   $"  \"firstError\": \"{Escape(firstError)}\",\n" +
                   $"  \"timestamp\": \"{System.DateTime.UtcNow:O}\"\n" +
                   $"}}";
        File.WriteAllText(ResultPath, json);
    }

    private static string Escape(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
}
