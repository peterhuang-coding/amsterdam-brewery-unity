using System;

[Serializable]
public sealed class CharacterDatabase
{
    public CharacterData[] characters;
}

[Serializable]
public sealed class CharacterData
{
    public string id;
    public string name;
    public string role;
    public string first_location;
}

[Serializable]
public sealed class EventDatabase
{
    public StoryEvent[] events;
}

[Serializable]
public sealed class StoryEvent
{
    public string id;
    public int day;
    public string time;
    public string location;
    public string dialogue_id;
    public string[] unlocks;
}

[Serializable]
public sealed class DialogueData
{
    public string id;
    public DialogueTriggerData trigger;
    public DialogueLine[] lines;
    public DialogueChoice[] choices;
}

[Serializable]
public sealed class DialogueTriggerData
{
    public string scene;
    public int day;
    public string time;
}

[Serializable]
public sealed class DialogueLine
{
    public string speaker;
    public string text;
    public string expression;
}

[Serializable]
public sealed class DialogueChoice
{
    public string id;
    public string text;
}
