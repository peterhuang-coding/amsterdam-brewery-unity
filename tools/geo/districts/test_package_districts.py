"""Tests for package_districts.py.

All fixtures are created inside tempfile directories; nothing persistent is
written outside the owned outputs.
"""

import gzip
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import package_districts as pkg


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def gz_bytes(data: bytes) -> bytes:
    return gzip.compress(data, compresslevel=9, mtime=0)


def build_source(root: Path, bad_meta=None, overview_url="overview.json",
                 district_url="districts/pub.json", overview=b"", district=b"OV\x00"):
    """Create a valid compiled bundle under root and return its manifest dict."""
    # Default payloads must be non-trivial bytes.
    if overview == b"":
        overview = json.dumps({"schemaVersion": 1, "bounds": [0, 0, 1, 1],
                               "shapes": [], "markers": []},
                              sort_keys=True, separators=(",", ":")).encode("utf-8")
    if district == b"OV\x00":
        district = json.dumps({"schemaVersion": 1, "id": "pub"},
                              sort_keys=True, separators=(",", ":")).encode("utf-8")

    def meta_for(url, data):
        m = {"url": url, "sha256": sha256(data), "bytes": len(data),
             "gzipBytes": len(gz_bytes(data))}
        if bad_meta:
            bad_meta(m)
        return m

    manifest = {
        "schemaVersion": 1,
        "mapVersion": "test-v1",
        "projection": {"type": "local-equirectangular", "units": "metres"},
        "source": {"provider": "test", "license": "CC0-1.0", "snapshot": "2026-10-21",
                   "complete": False, "inputSha256": "a" * 64},
        "overview": meta_for(overview_url, overview),
        "districts": [{
            "id": "pub", "name": "Pub", "bounds": [0.0, 0.0, 1.0, 1.0],
            "anchorIds": ["a", "b"],
            **meta_for(district_url, district)
        }],
        "travelLinks": [{"from": "pub", "to": "x"}],
        "attribution": "test attribution",
    }
    (root / Path(overview_url).parent).mkdir(parents=True, exist_ok=True)
    (root / overview_url).write_bytes(overview)
    (root / Path(district_url).parent).mkdir(parents=True, exist_ok=True)
    (root / district_url).write_bytes(district)
    (root / "manifest.json").write_bytes(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    return manifest, overview, district


def read_manifest(d: Path) -> dict:
    return json.loads((d / "manifest.json").read_text(encoding="utf-8"))


class PackageDistrictsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.src = Path(self.tmp) / "src"
        self.out = Path(self.tmp) / "out"
        self.src.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_package_happy_path_preserves_payload_and_provenance(self):
        manifest, overview, district = build_source(self.src)
        pkg.package_districts(self.src, self.out)

        out_manifest = read_manifest(self.out)
        self.assertEqual(out_manifest["overview"]["url"], "overview.json.gz")
        self.assertEqual(out_manifest["districts"][0]["url"], "districts/pub.json.gz")
        # Raw hashes/sizes preserved.
        self.assertEqual(out_manifest["overview"]["sha256"], manifest["overview"]["sha256"])
        self.assertEqual(out_manifest["overview"]["bytes"], manifest["overview"]["bytes"])
        self.assertEqual(out_manifest["districts"][0]["sha256"],
                         manifest["districts"][0]["sha256"])
        self.assertEqual(out_manifest["projection"], manifest["projection"])
        self.assertEqual(out_manifest["source"], manifest["source"])
        self.assertEqual(out_manifest["travelLinks"], manifest["travelLinks"])
        self.assertEqual(out_manifest["districts"][0]["anchorIds"], ["a", "b"])
        # gzipBytes equals actual packaged file length.
        ov_gz = (self.out / "overview.json.gz").read_bytes()
        d_gz = (self.out / "districts" / "pub.json.gz").read_bytes()
        self.assertEqual(len(ov_gz), out_manifest["overview"]["gzipBytes"])
        self.assertEqual(len(d_gz), out_manifest["districts"][0]["gzipBytes"])
        # Decompressed content is byte-identical.
        self.assertEqual(gzip.decompress(ov_gz), overview)
        self.assertEqual(gzip.decompress(d_gz), district)
        # No timestamps or local paths in the manifest; no trailing newline.
        raw_manifest = (self.out / "manifest.json").read_bytes()
        self.assertFalse(raw_manifest.endswith(b"\n"))
        self.assertNotIn(self.tmp.encode("utf-8"), raw_manifest)

    def test_deterministic_bytes_across_runs(self):
        build_source(self.src)
        out2 = Path(self.tmp) / "out2"
        pkg.package_districts(self.src, self.out)
        pkg.package_districts(self.src, out2)
        for rel in ("manifest.json", "overview.json.gz", "districts/pub.json.gz"):
            self.assertEqual((self.out / rel).read_bytes(), (out2 / rel).read_bytes(),
                             "non-deterministic output for " + rel)
        # gzip header carries mtime 0.
        header = (self.out / "overview.json.gz").read_bytes()[:10]
        self.assertEqual(header[:2], b"\x1f\x8b")
        self.assertEqual(header[4:8], b"\x00\x00\x00\x00")

    def test_existing_output_directory_is_updated_no_recursive_delete(self):
        build_source(self.src)
        self.out.mkdir()
        keep = self.out / "unrelated.txt"
        keep.write_text("keep me")
        pkg.package_districts(self.src, self.out)
        self.assertTrue(keep.exists(), "unrelated file must not be deleted")
        self.assertTrue((self.out / "manifest.json").exists())
        # Repackaging over the same directory succeeds (idempotent).
        pkg.package_districts(self.src, self.out)
        self.assertTrue((self.out / "manifest.json").exists())

    def test_sha_mismatch_fails(self):
        def bad(m):
            m["sha256"] = "0" * 64
        build_source(self.src, bad_meta=bad)
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(self.src, self.out)

    def test_raw_size_mismatch_fails(self):
        def bad(m):
            m["bytes"] += 1
        build_source(self.src, bad_meta=bad)
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(self.src, self.out)

    def test_gzip_size_mismatch_fails(self):
        def bad(m):
            m["gzipBytes"] += 1
        build_source(self.src, bad_meta=bad)
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(self.src, self.out)

    def test_traversal_url_fails(self):
        for bad_url in ("../overview.json", "/etc/overview.json",
                        "//host/overview.json", "http://x/overview.json",
                        "%2e%2e/overview.json", "a/../../b.json"):
            with self.subTest(url=bad_url):
                with self.assertRaises(pkg.PackageError):
                    pkg._check_resource_url(bad_url)

    def test_output_equal_to_source_fails(self):
        build_source(self.src)
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(self.src, self.src)

    def test_output_nested_in_source_fails(self):
        build_source(self.src)
        nested = self.src / "nested-out"
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(self.src, nested)

    def test_stale_manifest_removed_on_failure(self):
        build_source(self.src)
        self.out.mkdir(parents=True)
        stale = self.out / "manifest.json"
        stale.write_text('{"looks":"successful"}', encoding="utf-8")
        def bad(m):
            m["sha256"] = "f" * 64
        # Rebuild a different, broken source.
        broken = Path(self.tmp) / "broken"
        broken.mkdir()
        build_source(broken, bad_meta=bad)
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(broken, self.out)
        self.assertFalse(stale.exists(),
                         "stale manifest must be removed when packaging fails")

    def test_stale_manifest_invalidated_before_bad_source_schema(self):
        # RUNTIME01: a source that fails input validation (e.g.
        # schemaVersion 99) must never leave an old success marker behind.
        self.out.mkdir(parents=True)
        stale = self.out / "manifest.json"
        stale.write_text('{"looks":"successful"}', encoding="utf-8")
        keep = self.out / "unrelated.txt"
        keep.write_text("keep me")

        bad_src = Path(self.tmp) / "bad-src"
        bad_src.mkdir()
        (bad_src / "manifest.json").write_text(
            json.dumps({"schemaVersion": 99}), encoding="utf-8")

        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(bad_src, self.out)
        self.assertFalse(stale.exists(),
                         "stale manifest must be invalidated before input can fail")
        self.assertTrue(keep.exists(), "unrelated output file must be preserved")
        # Source is never touched.
        self.assertEqual((bad_src / "manifest.json").read_text(encoding="utf-8"),
                         json.dumps({"schemaVersion": 99}))

    def test_stale_manifest_invalidated_when_source_manifest_missing(self):
        # The marker is removed even when source processing fails very early.
        self.out.mkdir(parents=True)
        stale = self.out / "manifest.json"
        stale.write_text('{"looks":"successful"}', encoding="utf-8")
        empty_src = Path(self.tmp) / "empty-src"
        empty_src.mkdir()
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(empty_src, self.out)
        self.assertFalse(stale.exists())

    def test_source_is_never_modified(self):
        manifest, overview, district = build_source(self.src)
        before = {p: p.read_bytes() for p in (
            self.src / "manifest.json",
            self.src / "overview.json",
            self.src / "districts" / "pub.json")}
        pkg.package_districts(self.src, self.out)
        for p, data in before.items():
            self.assertEqual(p.read_bytes(), data, "source changed: %s" % p)
        # Manifest URL stays uncompressed in the source.
        self.assertEqual(json.loads(before[self.src / "manifest.json"].decode("utf-8"))
                         ["overview"]["url"], "overview.json")

    def test_bad_schema_version_fails(self):
        build_source(self.src)
        m = json.loads((self.src / "manifest.json").read_text("utf-8"))
        m["schemaVersion"] = 2
        (self.src / "manifest.json").write_text(json.dumps(m), encoding="utf-8")
        with self.assertRaises(pkg.PackageError):
            pkg.package_districts(self.src, self.out)

    def test_cli_returns_nonzero_on_failure(self):
        code = pkg.main(["--source-dir", str(self.src / "missing"),
                         "--out", str(self.out)])
        self.assertEqual(code, 1)

    def test_cli_success(self):
        build_source(self.src)
        code = pkg.main(["--source-dir", str(self.src), "--out", str(self.out)])
        self.assertEqual(code, 0)
        self.assertTrue((self.out / "manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
