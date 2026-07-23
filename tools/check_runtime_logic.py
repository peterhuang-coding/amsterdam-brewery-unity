#!/usr/bin/env python3
"""
Runtime Logic Static Checker for Amsterdam Brewery Unity project.

Checks for bugs that survive compile but break the game at runtime:
  1. Central input dispatch — hints in panel files vs actual Input in GameController
  2. DontDestroyOnLoad without Application.isPlaying guard
  3. Duplicate type definitions — same struct redefined across files (code smell)
  4. Coroutine lifecycle — coroutines started but never stopped in OnDestroy
  5. Panel close input — close hints verified against centralized input dispatch

Usage:  python3 tools/check_runtime_logic.py [--dir ASSETS_PATH]
Exit 0 on clean, 1 on warnings found.
"""

import os, re, sys
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DEFAULT_SCRIPTS_DIR = os.path.join(PROJECT_ROOT, "Assets", "Scripts")

def strip_comments(text):
    text = re.sub(r"//.*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return text

def find_cs_files(root):
    result = {}
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(".cs"):
                full = os.path.join(dirpath, fn)
                with open(full, "r", encoding="utf-8", errors="replace") as f:
                    result[full] = f.read()
    return result

# ═══════════════════════════════════════════════════════════════════════════════
# Check 1: Central input dispatch verification
# ═══════════════════════════════════════════════════════════════════════════════
# GameController.cs handles ALL keyboard input in HandleInput(). Panel .cs files
# show UI hints like "Press M to close" but the actual Input.GetKeyDown is in
# GameController. This check verifies that every hint in a panel file has a
# corresponding Input handler in GameController.

KEY_MAP = {
    "1": "Alpha1", "2": "Alpha2", "3": "Alpha3", "4": "Alpha4",
    "5": "Alpha5", "6": "Alpha6", "7": "Alpha7", "8": "Alpha8", "9": "Alpha9", "0": "Alpha0",
    "I": "I", "C": "C", "P": "P", "L": "L", "O": "O", "N": "N",
    "U": "U", "R": "R", "M": "M", "H": "H", "B": "B", "S": "S",
    "F": "F", "E": "E", "Space": "Space", "Escape": "Escape",
    "Enter": "Return", "Return": "Return",
}

RE_HINT_TEXT = re.compile(r'"Press\s+(\w+)\s+to\s+(\w+)"', re.IGNORECASE)
RE_INPUT_KEY = re.compile(r'Input\.GetKey(?:Down|Up)?\s*\(\s*KeyCode\.(\w+)\s*\)')

def check_input_dispatch(file_texts):
    """Verify UI key hints have matching Input handlers in GameController."""
    warnings = []

    # Collect all hints from all files
    all_hints = {}  # KeyCode -> [(file, line, hint_text)]
    for fpath, text in file_texts.items():
        rel = os.path.relpath(fpath, PROJECT_ROOT)
        clean = strip_comments(text)
        for m in RE_HINT_TEXT.finditer(clean):
            key = m.group(1)
            action = m.group(2)
            if key in KEY_MAP:
                code = KEY_MAP[key]
                if code not in all_hints:
                    all_hints[code] = []
                line_no = clean[:m.start()].count("\n") + 1
                all_hints[code].append((rel, line_no, key, action))

    # Collect all Input keys from GameController
    gc_text = file_texts.get(
        os.path.join(DEFAULT_SCRIPTS_DIR, "GameController.cs"), ""
    )
    gc_clean = strip_comments(gc_text)
    gc_inputs = set(m.group(1) for m in RE_INPUT_KEY.finditer(gc_clean))

    # Also collect Input keys from other "controller" files
    for fpath, text in file_texts.items():
        if "GameController" in fpath:
            continue
        clean = strip_comments(text)
        # Only check files that show panels (have close hints)
        if "Press" not in clean or "to close" not in clean:
            continue
        for m in RE_INPUT_KEY.finditer(clean):
            gc_inputs.add(m.group(1))

    # Cross-check
    for code, hint_list in all_hints.items():
        if code not in gc_inputs:
            for rel, line_no, key, action in hint_list:
                warnings.append(
                    f"{rel}:{line_no}: INPUT_MISSING: Hint 'Press {key} to {action}' "
                    f"(KeyCode.{code}) has no matching Input.GetKey in GameController"
                )

    return warnings

# ═══════════════════════════════════════════════════════════════════════════════
# Check 2: DontDestroyOnLoad guard
# ═══════════════════════════════════════════════════════════════════════════════

RE_DDOL = re.compile(r"(?<!\w)(?:Object\.)?DontDestroyOnLoad\s*\(")

def check_ddol_guard(file_texts):
    """DontDestroyOnLoad must be guarded by Application.isPlaying."""
    warnings = []
    for fpath, text in file_texts.items():
        rel = os.path.relpath(fpath, PROJECT_ROOT)
        lines = text.split("\n")
        for i, line in enumerate(lines):
            if not RE_DDOL.search(line):
                continue
            if "Application.isPlaying" in line:
                continue
            if i > 0 and "Application.isPlaying" in lines[i - 1]:
                continue
            warnings.append(
                f"{rel}:{i+1}: DDOL_UNGUARDED: DontDestroyOnLoad without "
                f"Application.isPlaying guard — will fail in Editor edit mode"
            )
    return warnings

# ═══════════════════════════════════════════════════════════════════════════════
# Check 3: Duplicate type definitions
# ═══════════════════════════════════════════════════════════════════════════════

RE_TYPE_DEF = re.compile(
    r"^\s*(?:public\s+|private\s+|internal\s+|protected\s+)?"
    r"(?:readonly\s+)?(?:static\s+)?"
    r"(struct|class)\s+(\w+)",
    re.MULTILINE,
)

def check_duplicate_types(file_texts):
    """Flag structs defined in 3+ files — should be unified."""
    warnings = []
    type_to_files = defaultdict(list)
    for fpath, text in file_texts.items():
        clean = strip_comments(text)
        rel = os.path.relpath(fpath, PROJECT_ROOT)
        for m in RE_TYPE_DEF.finditer(clean):
            kind = m.group(1)
            name = m.group(2)
            if name in ("Program", "CollectParticle", "Canvas", "Image", "RectTransform"):
                continue
            type_to_files[name].append((rel, kind))

    for name, locations in type_to_files.items():
        if len(locations) >= 3:
            kinds = set(k for _, k in locations)
            if "struct" in kinds:
                files_str = ", ".join(f.split("/")[-1] for f, _ in locations)
                warnings.append(
                    f"DUPLICATE_TYPE: struct '{name}' defined in "
                    f"{len(locations)} files: {files_str} — use UIFactory.RectSpec"
                )
    return warnings

# ═══════════════════════════════════════════════════════════════════════════════
# Check 4: Coroutine lifecycle
# ═══════════════════════════════════════════════════════════════════════════════

RE_START_COROUTINE = re.compile(r"StartCoroutine\s*\(\s*(\w+)")
RE_STOP_COROUTINE = re.compile(r"StopCoroutine\s*\(\s*(\w+)")
RE_STOP_ALL = re.compile(r"StopAllCoroutines\s*\(")
RE_ON_DESTROY = re.compile(r"void\s+OnDestroy\s*\(")

def check_coroutine_leaks(file_texts):
    """Coroutines started without StopCoroutine/StopAllCoroutines in OnDestroy."""
    warnings = []
    for fpath, text in file_texts.items():
        clean = strip_comments(text)
        rel = os.path.relpath(fpath, PROJECT_ROOT)
        started = set(m.group(1) for m in RE_START_COROUTINE.finditer(clean))
        stopped = set(m.group(1) for m in RE_STOP_COROUTINE.finditer(clean))
        has_stop_all = bool(RE_STOP_ALL.search(clean))
        has_on_destroy = bool(RE_ON_DESTROY.search(clean))
        leaked = started - stopped
        if leaked and not has_stop_all and has_on_destroy:
            warnings.append(
                f"{rel}:1: COROUTINE_LEAK: {sorted(leaked)} started but never stopped "
                f"in OnDestroy — may continue after GameObject destroyed"
            )
    return warnings

# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
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

    print(f"Runtime logic scan: {len(file_texts)} .cs files\n")

    all_warnings = []
    checks = [
        ("Input dispatch", check_input_dispatch),
        ("DontDestroyOnLoad guards", check_ddol_guard),
        ("Duplicate type defs", check_duplicate_types),
        ("Coroutine lifecycle", check_coroutine_leaks),
    ]

    for name, check_fn in checks:
        results = check_fn(file_texts)
        all_warnings.extend(results)
        status = f"{len(results)} issues" if results else "OK"
        print(f"  [{status:>10}] {name}")

    print()
    if all_warnings:
        for w in sorted(all_warnings):
            print(w)
        print(f"\nTotal warnings: {len(all_warnings)}")
        return 1
    else:
        print("OK: Runtime logic check passed — no issues found.")
        return 0

if __name__ == "__main__":
    sys.exit(main())
