# Parent validation preparation

These are independent parent acceptance tools, not Plan implementation output.
No in-flight input or implementation has been changed. R3 results are not yet
accepted; files named calibration use known rejected R2 results deliberately.

`calibrate-coverage.py` exits zero after proving that unchanged real geometry
passes and three distinct errors are detected: the actual R2 mixed line/point
contact defect, a pure point contact loss, and a new overlap between neighbours
that had no original boundary contact. Result: `coverage-calibration.json`.
The area reporting threshold is 1e-8 square metres; contact tolerance is 1e-7
metres. Full candidate audit enumerates every original bounding-box pair rather
than only the old nonzero shared lines. Original invalid features must remain
unchanged; make_valid is used only for explicitly reported independent set-area
comparisons and does not edit source or candidate geometry.

`nav-parent-check.cjs` takes module/sample/oracle/output paths and verifies the
sample SHA against the independent GEOS oracle. On the unchanged rejected R2,
the expected nonzero exit reproduced one false-safe of 3000 real cases, nine
translated/rotated outside-triangle errors, and both actual `rijbaan` highway
classification errors. The check also covers interior and boundary triangles.
Result: `nav-r2-calibration.json`. This deliberate red baseline is not a new R3
failure and does not consume an implementation attempt.

Full geometry/cardinality/SHA checks, full routes, and game browser validation
remain separate gates. Preparing or calibrating these tools is not a Plan call,
component adoption, or new playable-game delivery.

## Browser measurement calibration and runtime harness

`runtime-http.py` serves only explicit copied code/assets on loopback, with raw and actual HTTP Content-Encoding paths. `runtime-browser.py` samples CDP Runtime.getHeapUsage usedSize plus backingStorageSize, records event-loop gaps and separates index readiness from cold Canvas paint. It does not claim RSS or an absolute peak. Each runtime is disposed and garbage-collected before the next cycle. Browser screenshots must be independently read. The32MiB allocation/release and120ms blocking calibration passed on Chrome155; see browser-metrics-calibration.json. Protocol field definitions: https://chromium.googlesource.com/external/github.com/chromedp/cdproto/+/0b155246ad02274a002f36492efab17acb5bf57e/runtime/runtime.go .

`collect-cc.py` snapshots only a terminal original task and independently validates the on-disk handoff even when a nonzero CLI receipt omitted it. It does not modify the original receipt or change the standard adoption gate.
