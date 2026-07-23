#!/usr/bin/env python3
"""
C# Static Analysis Script for Amsterdam Brewery Unity project.

Checks:
  1. Missing properties/methods/fields on known types (cross-file reference check).
  2. Known deprecated Unity 6 API patterns.
  3. Missing `using` statements for common Unity namespaces.

Usage:  python3 tools/check_csharp_references.py [--dir ASSETS_PATH]

Exit 0 on clean, 1 on errors found.
No external dependencies — regex-based, Python 3 only.
"""

import os
import re
import sys
from collections import defaultdict

# ─────────────────────────── Paths ─────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DEFAULT_SCRIPTS_DIR = os.path.join(PROJECT_ROOT, "Assets", "Scripts")

# ──────────────────── Regex patterns ───────────────────────────────────────
RE_SINGLE_COMMENT = re.compile(r"//.*$", re.MULTILINE)
RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)

# Match class/struct/enum declarations (including nested)
RE_TYPE_DECL = re.compile(
    r"^\s*"
    r"(?:public\s+|private\s+|internal\s+|protected\s+|sealed\s+)*"
    r"(static\s+)?"
    r"(class|struct|enum)\s+"
    r"(\w+)"
    r"\s*.*?$",
    re.MULTILINE,
)

# Public property: matches single-line { get; set; } and multi-line getter blocks.
# Uses DOTALL but restricts with a guard: the matched text between the property
# name and the closing '}' must not contain type-declaration keywords at line starts.
# Public property: matches { get; set; } or multi-line getter blocks.
# Uses DOTALL to handle multi-line getters.
# False positives (class declarations mistaken as properties) are handled by
# pre-processing in extract_members: type declaration lines are replaced with
# empty lines before scanning for properties.
RE_PUBLIC_PROPERTY = re.compile(
    r"^\s*public\s+"
    r"(?:static\s+|sealed\s+|abstract\s+|partial\s+|readonly\s+|new\s+|virtual\s+|override\s+|unsafe\s+|volatile\s+)*"
    r"(?!class\b|struct\b|enum\b|const\b|delegate\b|interface\b|event\b|static\b|sealed\b|abstract\b|partial\b|readonly\b|new\b|virtual\b|override\b|unsafe\b|volatile\b)"
    r"([\w.<>,?\s\[\]]+?)\s+"
    r"(\w+)\s*"
    r"(\{.*?\})",
    re.MULTILINE | re.DOTALL,
)

# Arrow expression property: public Type Name => expr;
RE_PUBLIC_ARROW_PROPERTY = re.compile(
    r"^\s*public\s+"
    r"(?:static\s+)?"
    r"(?!class\b|struct\b|enum\b|const\b|delegate\b)"
    r"([\w.<>,?\s\[\]]+?)\s+"
    r"(\w+)\s*=>\s*([^;]+;)",
    re.MULTILINE,
)

# Public field: public Type Name;
RE_PUBLIC_FIELD = re.compile(
    r"^\s*public\s+"
    r"(?:static\s+|const\s+|readonly\s+)*"
    r"([\w.<>,?\s\[\]]+?)\s+"
    r"(\w+)\s*"
    r"(?:=\s*[^;]*)?\s*;"
    r"\s*$",
    re.MULTILINE,
)

# Public method
RE_PUBLIC_METHOD = re.compile(
    r"^\s*public\s+"
    r"(?:static\s+|sealed\s+|abstract\s+|partial\s+|readonly\s+|new\s+|virtual\s+|override\s+|unsafe\s+|volatile\s+)*"
    r"(?!class\b|struct\b|enum\b|const\b|delegate\b|interface\b|event\b)"
    r"([\w.<>,?\s\[\]]+?)\s+"
    r"(\w+)"
    r"\s*\(([^)]*)\)",
    re.MULTILINE,
)

# Static method (any visibility)
RE_STATIC_METHOD = re.compile(
    r"^\s*"
    r"(?:public\s+|private\s+|internal\s+|protected\s+)?"
    r"static\s+"
    r"([\w.<>,?\s\[\]]+?)\s+"
    r"(\w+)\s*\(([^)]*)\)",
    re.MULTILINE,
)

RE_USING = re.compile(r"^\s*using\s+([\w.]+)\s*;", re.MULTILINE)

# Check if text contains a type declaration keyword
RE_IS_TYPE_DECL = re.compile(r"\b(?:class|struct|enum)\b")

# ── External reference patterns ────────────────────────────────────────────
# Matches dotted access chains: A.B, A.B.C, or A.B.C(...)
RE_DOTTED_CHAIN = re.compile(r"\b([A-Z]\w*(?:\.[A-Z]\w*)+)\b")

# ── Deprecated API patterns ────────────────────────────────────────────────
RE_FINDOBJECTSBYTYPE_SINGLE = re.compile(
    r"\.?\bFindObjectsByType\s*<\s*\w+\s*>\s*\(\s*FindObjectsSortMode",
)
RE_FINDOBJECTSOFTYPE = re.compile(r"\bFindObjectsOfType\b")
RE_DESTROY_AMBIG = re.compile(
    r"(?<!\w)(?<!Object\.)(?<!UnityEngine\.Object\.)\bDestroy\s*\("
)

# ──────────────────── Known nested enums (skip checks) ─────────────────────
# These are enums nested inside classes that our parser resolves correctly
# as nested types. Their enum-value references (e.g. SoundType.TimeAdvance)
# are NOT member accesses and should never be flagged as MISSING_MEMBER.
KNOWN_NESTED_ENUMS = {
    "SoundType",
    "WaveType",
    "GuestType",
    "DrinkType",
    "WeatherType",
}

# ──────────────────── Member extraction ────────────────────────────────────

def strip_comments(text: str) -> str:
    text = RE_SINGLE_COMMENT.sub("", text)
    text = RE_BLOCK_COMMENT.sub("", text)
    return text


def _parse_type_tree(clean_text: str):
    """
    Parse the type hierarchy from a file.
    Returns:
      types: {full_path_name: {"kind": "class"/"struct"/"enum", "is_static": bool}}
      parent: {child_full_path: parent_full_path}  ("" = top-level)
      type_ranges: [(open_brace_pos, close_brace_pos, full_name), ...]
    """
    types = {}
    parent = {}
    type_ranges = []

    # Find all '{' and '}' positions
    brace_positions = []
    for m in re.finditer(r"[{}]", clean_text):
        brace_positions.append((m.start(), m.group(0)))

    # Find all type declarations
    type_decls = []
    for m in RE_TYPE_DECL.finditer(clean_text):
        is_static = m.group(1) is not None and "static" in m.group(1)
        kind = m.group(2)
        name = m.group(3)
        type_decls.append((m.start(), name, kind, is_static))

    # For each type declaration, find its brace range
    for pos, name, kind, is_static in type_decls:
        open_pos = None
        for bpos, bchar in brace_positions:
            if bpos > pos and bchar == "{":
                open_pos = bpos
                break
        if open_pos is None:
            continue

        close_pos = None
        bdepth = 0
        for bpos, bchar in brace_positions:
            if bpos < open_pos:
                continue
            if bchar == "{":
                bdepth += 1
            else:
                bdepth -= 1
            if bdepth == 0:
                close_pos = bpos
                break
        if close_pos is None:
            continue

        # Determine full name (including nesting)
        enclosing = ""
        # Check if this declaration is inside another type's range
        for opos, oname, okind, ostatic in type_decls:
            if opos >= pos:
                continue
            # Find this parent's brace range
            p_open = None
            for bpos2, bchar2 in brace_positions:
                if bpos2 > opos and bchar2 == "{":
                    p_open = bpos2
                    break
            if p_open is None:
                continue
            p_bdepth = 0
            p_close = None
            for bpos2, bchar2 in brace_positions:
                if bpos2 < p_open:
                    continue
                if bchar2 == "{":
                    p_bdepth += 1
                else:
                    p_bdepth -= 1
                if p_bdepth == 0:
                    p_close = bpos2
                    break
            if p_close and p_open < pos < p_close:
                # Check for intermediate nesting
                inner_name = oname
                for ipos, iname, ikind, istatic in type_decls:
                    if ipos <= opos or ipos >= pos:
                        continue
                    i_open = None
                    for bpos3, bchar3 in brace_positions:
                        if bpos3 > ipos and bchar3 == "{":
                            i_open = bpos3
                            break
                    if i_open is None:
                        continue
                    i_bdepth = 0
                    i_close = None
                    for bpos3, bchar3 in brace_positions:
                        if bpos3 < i_open:
                            continue
                        if bchar3 == "{":
                            i_bdepth += 1
                        else:
                            i_bdepth -= 1
                        if i_bdepth == 0:
                            i_close = bpos3
                            break
                    if i_close and i_open < pos < i_close:
                        inner_name = f"{oname}+{iname}"
                enclosing = inner_name
                break

        full_name = f"{enclosing}+{name}" if enclosing else name
        types[full_name] = {"kind": kind, "is_static": is_static}
        parent[full_name] = enclosing
        type_ranges.append((open_pos, close_pos, full_name))

    return types, parent, type_ranges


def extract_members(text: str):
    """Extract all members from a C# file. Returns structured dict."""
    clean = strip_comments(text)
    types, parent_map, type_ranges = _parse_type_tree(clean)

    # Build short name to full name mapping
    short_to_full = {}
    for full_name in types:
        short = full_name.split("+")[-1]
        if short not in short_to_full:
            short_to_full[short] = full_name
        if "+" not in full_name:
            short_to_full[short] = full_name

    result = {
        "types": types,
        "parent_map": parent_map,
        "type_ranges": type_ranges,
        "short_to_full": short_to_full,
        "properties": defaultdict(dict),
        "fields": defaultdict(dict),
        "methods": defaultdict(dict),
        "static_methods": defaultdict(dict),
        "enum_values": defaultdict(set),
    }

    def _nearest_type(pos):
        best = None
        best_open = -1
        for open_pos, close_pos, full_name in type_ranges:
            if open_pos < pos < close_pos and open_pos > best_open:
                best_open = open_pos
                best = full_name
        return best

    # Public properties (with { ... } getter body, DOTALL for multi-line getters)
    for m in RE_PUBLIC_PROPERTY.finditer(clean):
        full_match = m.group(0)
        prop_name = m.group(2)
        # Skip if this is actually a type declaration. DOTALL + non-greedy can
        # cause the regex to match 'public static class Foo {' as if it were a
        # property (where the type part captures 'static class' and the name
        # captures 'Foo'). Also handle 'public struct Bar {', etc.
        type_str_raw = m.group(1).strip()
        type_tokens = set(type_str_raw.split())
        if type_tokens & {"class", "struct", "enum", "delegate", "interface"}:
            continue
        name_idx = full_match.index(prop_name)
        if RE_IS_TYPE_DECL.search(full_match[:name_idx]):
            continue
        # Guard: the brace body must not contain type-declaration keywords at line starts
        # This prevents matching across class boundaries (e.g., the '{' of a class
        # being mistaken for the start of a getter body)
        body = m.group(3)  # the { ... } part
        if RE_IS_TYPE_DECL.search(body):
            # Check if the body contains a type-decl keyword at line-start,
            # which would indicate we matched across a type boundary
            body_lines = body.strip().split("\n")
            for line in body_lines:
                stripped = line.strip()
                if re.match(r"^\s*(?:public\s+|private\s+|internal\s+|protected\s+|sealed\s+)*(?:static\s+)?(?:class|struct|enum)\b", stripped):
                    continue  # skip this match entirely
            else:
                # No type decl at line start — still check body size
                # If the body is very large (>500 chars), it's probably a false positive
                if len(body) > 500:
                    continue
        type_str = m.group(1).strip().split()[-1]
        owning = _nearest_type(m.start())
        if owning:
            result["properties"][owning][prop_name] = type_str

    # Arrow expression properties
    for m in RE_PUBLIC_ARROW_PROPERTY.finditer(clean):
        full_match = m.group(0)
        prop_name = m.group(2)
        if RE_IS_TYPE_DECL.search(full_match[:full_match.index(prop_name)]):
            continue
        type_str = m.group(1).strip().split()[-1]
        owning = _nearest_type(m.start())
        if owning:
            result["properties"][owning][prop_name] = type_str

    # Public fields
    for m in RE_PUBLIC_FIELD.finditer(clean):
        type_str = m.group(1).strip().split()[-1]
        field_name = m.group(2)
        owning = _nearest_type(m.start())
        if owning and field_name not in {"set", "get", "value"}:
            result["fields"][owning][field_name] = type_str

    # Public methods
    for m in RE_PUBLIC_METHOD.finditer(clean):
        ret_type = m.group(1).strip().split()[-1]
        meth_name = m.group(2)
        params_str = m.group(3).strip()
        owning = _nearest_type(m.start())
        if owning:
            result["methods"][owning][meth_name] = [ret_type, params_str]

    # Static methods
    for m in RE_STATIC_METHOD.finditer(clean):
        ret_type = m.group(1).strip().split()[-1]
        meth_name = m.group(2)
        params_str = m.group(3).strip()
        owning = _nearest_type(m.start())
        if owning:
            result["static_methods"][owning][meth_name] = [ret_type, params_str]

    # Enum values
    for full_name, info in types.items():
        if info["kind"] != "enum":
            continue
        for open_pos, close_pos, tname in type_ranges:
            if tname != full_name:
                continue
            body = clean[open_pos:close_pos]
            for val_m in re.finditer(r"(?:^|,)\s*(\w+)\s*(?:,|$|\n)", body, re.MULTILINE):
                result["enum_values"][full_name].add(val_m.group(1))
            break

    return result


def extract_using_namespaces(text: str) -> set:
    clean = strip_comments(text)
    return set(RE_USING.findall(clean))


# ──────────────────── Check functions ──────────────────────────────────────

def check_using_statements(file_texts: dict) -> list:
    errors = []
    NEEDS_UNITYENGINE = {
        "MonoBehaviour", "GameObject", "Transform", "Vector2", "Vector3",
        "Color", "Color32", "Debug", "Mathf", "Input", "KeyCode",
        "Camera", "Canvas", "Text", "Image", "RectTransform", "Button",
        "Resources", "Object", "AudioSource", "AudioClip", "Application",
        "DontDestroyOnLoad", "HideFlags", "CameraClearFlags", "RenderMode",
        "CanvasScaler", "GraphicRaycaster", "EventSystem", "StandaloneInputModule",
        "JsonUtility", "Time", "WaitForSeconds", "Font",
        "RenderTexture", "RawImage", "Slider",
        "FindObjectsByType", "FindObjectsInactive", "FindObjectsSortMode",
        "ExecuteAlways", "AddComponent", "GetComponent", "SetActive",
        "Instantiate", "Quaternion", "StartCoroutine", "StopCoroutine",
        "StopAllCoroutines", "Random", "Mathf",
    }
    NEEDS_UI = {
        "Text", "Image", "RawImage", "Button", "Slider", "Canvas",
        "CanvasScaler", "GraphicRaycaster", "TextAnchor",
        "FontStyle", "HorizontalWrapMode", "VerticalWrapMode", "ScrollRect",
        "CanvasGroup", "ColorBlock",
    }
    NEEDS_COLLECTIONS = {"IEnumerator", "Hashtable", "ArrayList"}
    NEEDS_EVENTS = {
        "EventSystem", "StandaloneInputModule", "BaseEventData", "PointerEventData",
    }

    for fpath, text in file_texts.items():
        clean = strip_comments(text)
        usings = extract_using_namespaces(text)
        words = set(re.findall(r"\b([A-Z]\w*)\b", clean))

        needs = set()
        if words & NEEDS_UNITYENGINE:
            needs.add("UnityEngine")
        if words & NEEDS_UI:
            needs.add("UnityEngine.UI")
        if words & NEEDS_COLLECTIONS:
            needs.add("System.Collections")
        if words & NEEDS_EVENTS:
            needs.add("UnityEngine.EventSystems")

        for ns in needs:
            if ns not in usings:
                rel = os.path.relpath(fpath, PROJECT_ROOT)
                errors.append(f"{rel}:1: MISSING_USING: Consider adding 'using {ns};'")

    return errors


def check_cross_references(file_texts: dict, all_members: dict) -> list:
    """
    Check that member accesses on project-defined types resolve.
    Uses dotted chain resolution to handle nested types.
    """
    errors = []
    all_types = all_members.get("types", {})
    properties = all_members.get("properties", {})
    fields = all_members.get("fields", {})
    methods = all_members.get("methods", {})
    static_methods = all_members.get("static_methods", {})

    for fpath, text in file_texts.items():
        clean = strip_comments(text)
        rel = os.path.relpath(fpath, PROJECT_ROOT)

        for m in RE_DOTTED_CHAIN.finditer(clean):
            chain = m.group(1)
            parts = chain.split(".")
            if len(parts) < 2:
                continue

            first = parts[0]
            short_to_full = all_members.get("short_to_full", {})

            # Skip if the first part is not a project type
            if first not in short_to_full:
                continue

            # Skip known nested enum references (SoundType, WaveType, etc.)
            if first in KNOWN_NESTED_ENUMS and len(parts) == 2:
                continue
            if len(parts) >= 2 and parts[1] in KNOWN_NESTED_ENUMS:
                continue

            current_full = short_to_full[first]
            is_enum_value_chain = False

            # Walk the chain to check if it resolves to a nested type + enum value
            for i in range(1, len(parts)):
                segment = parts[i]
                nested_full = f"{current_full}+{segment}"
                if nested_full in all_types:
                    current_full = nested_full
                    if i == len(parts) - 1:
                        is_enum_value_chain = True
                    continue
                if all_types.get(current_full, {}).get("kind") == "enum":
                    is_enum_value_chain = True
                    break
                if i == len(parts) - 1:
                    break
                is_enum_value_chain = True
                break

            if is_enum_value_chain:
                continue

            # Resolve the type that owns the final member
            resolved_type = short_to_full[first]
            for i in range(1, len(parts) - 1):
                segment = parts[i]
                nested_full = f"{resolved_type}+{segment}"
                if nested_full in all_types:
                    resolved_type = nested_full
                else:
                    resolved_type = None
                    break

            if resolved_type is None:
                continue

            member_name = parts[-1]
            after_pos = m.end()
            is_method = after_pos < len(clean) and clean[after_pos:after_pos+1] == "("

            known_props = properties.get(resolved_type, {})
            known_fields_set = fields.get(resolved_type, {})
            known_methods = {}
            known_methods.update(methods.get(resolved_type, {}))
            known_methods.update(static_methods.get(resolved_type, {}))

            if member_name in known_props or member_name in known_fields_set:
                continue
            if member_name in known_methods:
                continue

            lineno = text[:m.start()].count("\n") + 1
            suffix = "()" if is_method else ""
            errors.append(
                f"{rel}:{lineno}: MISSING_MEMBER: '{chain}{suffix}' - not found on type '{resolved_type}'"
            )

    return errors


def check_deprecated_apis(file_texts: dict) -> list:
    errors = []
    for fpath, text in file_texts.items():
        rel = os.path.relpath(fpath, PROJECT_ROOT)
        lines = text.split("\n")
        clean = strip_comments(text)

        for m in RE_FINDOBJECTSBYTYPE_SINGLE.finditer(clean):
            lineno = text[:m.start()].count("\n") + 1
            errors.append(
                f"{rel}:{lineno}: DEPRECATED_API: FindObjectsByType with single FindObjectsSortMode arg; "
                f"use two-arg overload (FindObjectsInactive, FindObjectsSortMode)"
            )

        for m in RE_FINDOBJECTSOFTYPE.finditer(clean):
            lineno = text[:m.start()].count("\n") + 1
            errors.append(
                f"{rel}:{lineno}: DEPRECATED_API: FindObjectsOfType is deprecated; "
                f"use FindObjectsByType instead"
            )

        for m in RE_DESTROY_AMBIG.finditer(clean):
            lineno = text[:m.start()].count("\n") + 1
            line = lines[lineno - 1].strip() if lineno <= len(lines) else ""
            stripped = line.lstrip()
            if stripped.startswith("//") or stripped.startswith("/*"):
                continue
            if "Object.Destroy" in line or "UnityEngine.Object.Destroy" in line:
                continue
            errors.append(
                f"{rel}:{lineno}: DEPRECATED_API: Ambiguous 'Destroy' — "
                f"prefer 'Object.Destroy' or 'UnityEngine.Object.Destroy'"
            )

    return errors


# ──────────────────── File discovery ───────────────────────────────────────

def find_cs_files(root: str) -> dict:
    result = {}
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(".cs"):
                full = os.path.join(dirpath, fn)
                with open(full, "r", encoding="utf-8", errors="replace") as f:
                    result[full] = f.read()
    return result


# ──────────────────── Main ─────────────────────────────────────────────────

def main() -> int:
    scripts_dir = DEFAULT_SCRIPTS_DIR
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg.startswith("--dir="):
            scripts_dir = arg[len("--dir="):]
        elif not arg.startswith("-"):
            scripts_dir = arg

    if not os.path.isdir(scripts_dir):
        print(f"ERROR: Directory not found: {scripts_dir}", file=sys.stderr)
        return 2

    file_texts = find_cs_files(scripts_dir)
    if not file_texts:
        print(f"WARNING: No .cs files found in {scripts_dir}", file=sys.stderr)
        return 0

    print(f"Scanning {len(file_texts)} .cs files in {scripts_dir}")

    all_errors = []

    # Extract all members from all files
    all_types = {}
    all_parent_map = {}
    all_type_ranges = []
    all_short_to_full = {}
    all_properties = defaultdict(dict)
    all_fields = defaultdict(dict)
    all_methods = defaultdict(dict)
    all_static_methods = defaultdict(dict)
    all_enum_values = defaultdict(set)

    for fpath, text in file_texts.items():
        members = extract_members(text)
        all_types.update(members["types"])
        all_parent_map.update(members["parent_map"])
        all_type_ranges.extend(members["type_ranges"])
        for k, v in members["short_to_full"].items():
            if k not in all_short_to_full:
                all_short_to_full[k] = v
        for cls_name, props in members["properties"].items():
            all_properties[cls_name].update(props)
        for cls_name, flds in members["fields"].items():
            all_fields[cls_name].update(flds)
        for cls_name, meths in members["methods"].items():
            all_methods[cls_name].update(meths)
        for cls_name, sm in members["static_methods"].items():
            all_static_methods[cls_name].update(sm)
        for cls_name, vals in members["enum_values"].items():
            all_enum_values[cls_name].update(vals)

    all_members = {
        "types": all_types,
        "parent_map": all_parent_map,
        "short_to_full": all_short_to_full,
        "properties": dict(all_properties),
        "fields": dict(all_fields),
        "methods": dict(all_methods),
        "static_methods": dict(all_static_methods),
        "enum_values": dict(all_enum_values),
    }

    # Step 1: using statements
    using_errors = check_using_statements(file_texts)
    all_errors.extend(using_errors)

    # Step 2: cross-file references
    cross_errors = check_cross_references(file_texts, all_members)
    all_errors.extend(cross_errors)

    # Step 3: deprecated APIs
    deprecated_errors = check_deprecated_apis(file_texts)
    all_errors.extend(deprecated_errors)

    if all_errors:
        for err in sorted(all_errors):
            print(err)
        print(f"\nTotal errors: {len(all_errors)}")
        return 1
    else:
        print("OK: C# reference check passed — no issues found.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
