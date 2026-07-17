#!/usr/bin/env python3
"""check_unity_meta.py — Validate Unity .meta file integrity.

Checks:
  1. Every .cs in Assets/Scripts/ has a .cs.meta
  2. Each .meta has a valid GUID (32 hex chars)
  3. All GUIDs are unique
  4. Scene m_Script GUID refs have matching .cs.meta
  5. Orphan scripts (not referenced by any scene)

Exit code 0 on clean, non-zero on errors.
"""

import os
import re
import sys
from collections import defaultdict

SCRIPT_DIR = os.path.join("Assets", "Scripts")
SCENE_DIR  = os.path.join("Assets", "Scenes")


def find_files(root: str, ext: str) -> list[str]:
    """Recursively collect files with the given extension."""
    result = []
    if not os.path.isdir(root):
        return result
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(ext):
                result.append(os.path.join(dirpath, fn))
    return sorted(result)


def parse_meta_guid(path: str) -> str | None:
    """Return the 32-char hex GUID from a .meta file, or None on failure."""
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = re.match(r"^guid:\s*([0-9a-fA-F]{32})\s*$", line)
            if m:
                return m.group(1)
    return None


def parse_scene_guids(path: str) -> set[str]:
    """Extract unique script GUIDs referenced in m_Script lines of a .unity file."""
    guids = set()
    pattern = re.compile(r"m_Script:\s*\{[^}]*guid:\s*([0-9a-fA-F]+)")
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = pattern.search(line)
            if m:
                guids.add(m.group(1))
    return guids


def main() -> int:
    errors = 0

    # ---- 1. Every .cs has a .cs.meta ----
    print("=" * 60)
    print("1. Checking .cs → .cs.meta pairing …")
    cs_files = find_files(SCRIPT_DIR, ".cs")
    if not cs_files:
        print("   WARNING: no .cs files found under", SCRIPT_DIR)
        return 0

    missing_meta = []
    cs_meta_map: dict[str, str] = {}              # cs_path -> meta_path
    meta_to_cs: dict[str, str] = {}                # meta_path -> cs_path
    for cs in cs_files:
        meta = cs + ".meta"
        if os.path.isfile(meta):
            cs_meta_map[cs] = meta
            meta_to_cs[meta] = cs
        else:
            missing_meta.append(cs)

    if missing_meta:
        print("   ERR: .meta MISSING for:")
        for p in missing_meta:
            print(f"        {p}")
        errors += 1
    else:
        print(f"   OK  — all {len(cs_files)} .cs files have a .meta ({len(cs_meta_map)} checked)")

    # ---- 2. Valid GUIDs + collect per-file ----
    print("\n2. Checking GUID format (32 hex chars) …")
    meta_files = find_files(SCRIPT_DIR, ".cs.meta")
    invalid_guid: list[str] = []
    guid_to_meta = defaultdict(list)               # guid -> [meta_path, …]
    for meta in sorted(meta_files):
        guid = parse_meta_guid(meta)
        if guid is None:
            invalid_guid.append(meta)
            print(f"   ERR: no/malformed GUID in {meta}")
            errors += 1
        else:
            guid_to_meta[guid].append(meta)

    if not invalid_guid:
        print(f"   OK  — all {len(meta_files)} .meta files have a well-formed GUID")

    # ---- 3. Unique GUIDs ----
    print("\n3. Checking GUID uniqueness …")
    dup_count = 0
    for guid, metas in guid_to_meta.items():
        if len(metas) > 1:
            print(f"   ERR: duplicate GUID {guid} in:")
            for m in metas:
                print(f"        {m}")
            dup_count += 1
            errors += 1
    if dup_count == 0:
        print(f"   OK  — all GUIDs are unique ({len(guid_to_meta)} total)")

    # ---- Collect scene GUIDs ----
    print("\n4. Checking scene m_Script GUID references …")
    scene_files = find_files(SCENE_DIR, ".unity")
    all_scene_guids: set[str] = set()
    for sc in scene_files:
        guids = parse_scene_guids(sc)
        all_scene_guids.update(guids)
        print(f"   {sc}: {len(guids)} m_Script GUID(s) found {guids if guids else ''}")

    if not all_scene_guids:
        print("   INFO: no m_Script GUIDs in any scene (no scripts attached in editor)")
    else:
        for guid in sorted(all_scene_guids):
            if guid not in guid_to_meta:
                print(f"   ERR: scene GUID {guid} has NO matching .cs.meta under {SCRIPT_DIR}")
                errors += 1
            else:
                for meta in guid_to_meta[guid]:
                    print(f"   OK  — scene GUID {guid} → {meta}")

    # ---- 5. Orphan scripts ----
    print("\n5. Checking orphan scripts (not referenced by any scene) …")
    all_known_guids = set(guid_to_meta.keys())
    orphan_guids = all_known_guids - all_scene_guids
    if orphan_guids:
        print(f"   WARNING: {len(orphan_guids)} script(s) not referenced by any scene (may be fine):")
        for guid in sorted(orphan_guids):
            for meta in guid_to_meta[guid]:
                cs = meta_to_cs.get(meta, meta)
                print(f"        {cs}  (GUID {guid})")
    else:
        print("   OK  — every .cs.meta GUID is referenced by at least one scene")

    # ---- Summary ----
    print("\n" + "=" * 60)
    if errors:
        print(f"RESULT: {errors} error(s) found — FIX REQUIRED")
        return 1
    else:
        print("RESULT: ALL CHECKS PASSED")
        return 0


if __name__ == "__main__":
    sys.exit(main())
