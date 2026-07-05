#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

[InitializeOnLoad]
public static class PlayablePrototypeAutoOpen
{
    private const string ScenePath = "Assets/Scenes/PlayablePrototype.unity";
    private const string SessionKey = "AmsterdamBrewery.PlayablePrototypeOpened";

    static PlayablePrototypeAutoOpen()
    {
        EditorApplication.delayCall += OpenPrototypeSceneOnce;
    }

    private static void OpenPrototypeSceneOnce()
    {
        if (Application.isPlaying || SessionState.GetBool(SessionKey, false))
        {
            return;
        }

        SessionState.SetBool(SessionKey, true);
        Scene activeScene = EditorSceneManager.GetActiveScene();
        if (activeScene.isDirty || activeScene.path == ScenePath)
        {
            return;
        }

        if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
        {
            return;
        }

        EditorSceneManager.OpenScene(ScenePath);
        GameObject bootstrap = GameObject.Find("GameBootstrap");
        if (bootstrap == null)
        {
            return;
        }

        Selection.activeGameObject = bootstrap;
        EditorGUIUtility.PingObject(bootstrap);
    }
}
#endif
