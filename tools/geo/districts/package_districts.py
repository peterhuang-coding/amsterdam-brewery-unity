#!/usr/bin/env python3
"""Deterministic offline gzip packager for compiled district bundles.

Reads a compiler output directory containing ``manifest.json`` plus the
listed overview/district JSON resources, verifies the metadata
(sha256 / raw bytes / deterministic gzip bytes) and writes a new directory
with gzip-compressed (level 9, mtime 0) ``*.json.gz`` resources and a final
manifest whose URLs end in ``.json.gz``.

Raw bytes, hashes, provenance, projection and travelLinks are preserved.
The compiler and its source directory are never modified, the output
directory is never recursively deleted, and the manifest is written last.
"""

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote

MANIFEST_NAME = "manifest.json"
TEMP_MANIFEST_SUFFIX = ".tmp"

_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)


class PackageError(Exception):
    """Raised for any packaging contract violation."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _gzip(data: bytes) -> bytes:
    # Deterministic: level 9, zero mtime, no embedded filename.
    return gzip.compress(data, compresslevel=9, mtime=0)


def _is_relative_to(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
    except ValueError:
        return False
    return True


def _check_resource_url(url: object) -> str:
    """Accept only plain, immutable, same-directory relative resource paths."""
    if not isinstance(url, str) or not url:
        raise PackageError("resource URL must be a non-empty string")
    if "\\" in url or any(ord(c) < 0x20 for c in url):
        raise PackageError("resource URL contains backslash or control bytes: %r" % url)
    if "?" in url or "#" in url:
        raise PackageError("query strings/fragments are not supported for local files: %r" % url)
    if url.startswith("//"):
        raise PackageError("protocol-relative URL not allowed: %r" % url)
    if url.startswith("/"):
        raise PackageError("absolute path not allowed: %r" % url)
    if _SCHEME_RE.match(url.lstrip()) is not None:
        raise PackageError("absolute scheme URL not allowed: %r" % url)
    if re.search(r"%(?:2f|5c)", url, flags=re.IGNORECASE):
        raise PackageError("encoded path separator not allowed: %r" % url)
    decoded = url
    for _ in range(4):
        if any(part == ".." for part in decoded.split("/")):
            raise PackageError("parent directory traversal not allowed: %r" % url)
        if "%" not in decoded:
            break
        decoded = unquote(decoded)
    parts = [p for p in url.split("/") if p not in ("", ".")]
    if not parts:
        raise PackageError("empty resource URL")
    return "/".join(parts)


def _meta(entry: object, where: str):
    if not isinstance(entry, dict):
        raise PackageError("%s must be an object" % where)
    url = entry.get("url")
    digest = entry.get("sha256")
    raw = entry.get("bytes")
    gz = entry.get("gzipBytes")
    if not isinstance(url, str) or not url:
        raise PackageError("%s.url missing" % where)
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise PackageError("%s.sha256 must be 64 lowercase hex chars" % where)
    if not isinstance(raw, int) or raw <= 0:
        raise PackageError("%s.bytes must be a positive integer" % where)
    if not isinstance(gz, int) or gz <= 0:
        raise PackageError("%s.gzipBytes must be a positive integer" % where)
    return url, digest, raw, gz


def _collect_entries(manifest: dict):
    if manifest.get("schemaVersion") != 1:
        raise PackageError("manifest: unsupported schemaVersion")
    overview = manifest.get("overview")
    districts = manifest.get("districts")
    if not isinstance(overview, dict):
        raise PackageError("manifest.overview missing")
    if not isinstance(districts, list) or not districts:
        raise PackageError("manifest.districts must be a non-empty list")
    entries = [_meta(overview, "manifest.overview")]
    seen = set()
    for i, d in enumerate(districts):
        url, digest, raw, gz = _meta(d, "manifest.districts[%d]" % i)
        if not isinstance(d.get("id"), str) or not d["id"]:
            raise PackageError("manifest.districts[%d].id missing" % i)
        entries.append((url, digest, raw, gz))
    for url, _digest, _raw, _gz in entries:
        safe = _check_resource_url(url)
        if safe in seen:
            raise PackageError("duplicate resource URL: %r" % url)
        seen.add(safe)
    return entries


def package_districts(source_dir, out_dir) -> Path:
    src = Path(source_dir).resolve()
    out = Path(out_dir).resolve()
    if not src.is_dir():
        raise PackageError("source directory does not exist: %s" % src)
    if out == src:
        raise PackageError("output directory must differ from source directory")
    if _is_relative_to(out, src):
        raise PackageError("output directory must not be nested inside source directory")

    # After the source/output path guards, invalidate any stale success
    # marker before reading or validating input that may fail (e.g. a bad
    # schemaVersion). Only manifest.json is touched; unrelated output files
    # are preserved and the output directory is never deleted recursively.
    out.mkdir(parents=True, exist_ok=True)
    stale = out / MANIFEST_NAME
    if stale.exists():
        stale.unlink()

    manifest_path = src / MANIFEST_NAME
    if not manifest_path.is_file():
        raise PackageError("manifest not found: %s" % manifest_path)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        raise PackageError("manifest is not valid UTF-8 JSON: %s" % e)
    if not isinstance(manifest, dict):
        raise PackageError("manifest must be a JSON object")
    entries = _collect_entries(manifest)

    # Phase 1: read and verify every listed resource (the stale manifest was
    # already invalidated before input processing began).
    verified = []
    for url, digest, raw_size, gz_size in entries:
        safe = _check_resource_url(url)
        source_file = (src / Path(safe)).resolve()
        if not _is_relative_to(source_file, src):
            raise PackageError("resource escapes source directory: %r" % url)
        if not source_file.is_file():
            raise PackageError("resource not found: %s" % source_file)
        data = source_file.read_bytes()
        if len(data) != raw_size:
            raise PackageError("%s: raw size metadata %d != actual %d"
                               % (url, raw_size, len(data)))
        actual_digest = _sha256(data)
        if actual_digest != digest:
            raise PackageError("%s: sha256 metadata does not match" % url)
        gz = _gzip(data)
        if len(gz) != gz_size:
            raise PackageError("%s: gzipBytes metadata %d != deterministic %d"
                               % (url, gz_size, len(gz)))
        dest = (out / (safe + ".gz")).resolve()
        if not _is_relative_to(dest, out):
            raise PackageError("packaged path escapes output directory: %r" % url)
        verified.append((dest, gz))

    # Phase 2: write compressed resources. No recursive deletion, ever.
    for dest, gz in verified:
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Overwrite via direct write: content is deterministic, never sourced
        # from an existing output file.
        with open(dest, "wb") as f:
            f.write(gz)

    # Manifest last; rename into place atomically.
    new_manifest = json.loads(json.dumps(manifest))  # deep copy
    new_manifest["overview"]["url"] = manifest["overview"]["url"] + ".gz"
    for d in new_manifest["districts"]:
        d["url"] = d["url"] + ".gz"
    text = json.dumps(new_manifest, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)
    tmp = out / (MANIFEST_NAME + TEMP_MANIFEST_SUFFIX + ".%d" % os.getpid())
    try:
        tmp.write_bytes(text.encode("utf-8"))
        os.replace(tmp, out / MANIFEST_NAME)
    except BaseException:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
        raise
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Package a compiled district bundle into deterministic .json.gz files.")
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        package_districts(args.source_dir, args.out)
    except PackageError as e:
        print("package_districts: error: %s" % e, file=sys.stderr)
        return 1
    except OSError as e:
        print("package_districts: filesystem error: %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
