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
