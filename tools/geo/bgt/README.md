# BGT source conversion

This converter preserves public Kadaster / PDOK BGT water, building, road and bridge-part polygon geometry in the shared local-metre schema. The checked-in data and four raw pages are deliberately incomplete test fixtures (18 features), not the playable map. Source attribution and exact URLs / SHA256 values are in source-manifest.json. The source is CC0 1.0.

Run from this directory:

```sh
python3 -m unittest -v test_bgt_import.py
python3 import_bgt.py --manifest source-manifest.json --json geo-data.json --js geo-data.js --audit import-audit.json
node --check geo-data.js
node --test test_geo_data.cjs
```

For a full dataset, pass a verified manifest with all downloaded pages and the correct completeness boolean. Geometry is retained whole when it intersects the bbox, including holes and portions outside the bbox. The caller must clip rendering. The converter verifies every input SHA and refuses malformed data instead of silently repairing it.

Accepted from Coding Plan task amsterdam-d26-bgt-import-r2-20261017 after independent 44 Python / 9 Node tests and a585-page conversion (145703 retained features). The preceding failed metadata version remains in research evidence. One attempted report-writing shell command was denied; the final implementation and allowed test commands were independently reviewed. This component does not change the current game map. Runtime packing, routing and rendering have separate acceptance requirements.
