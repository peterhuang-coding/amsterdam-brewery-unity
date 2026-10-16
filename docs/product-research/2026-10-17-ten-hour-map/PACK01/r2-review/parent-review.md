# PACK01-R2 independent parent review — rejected / semantic

Task `amsterdam-d26-runtime-pack-r2-20261017`, same logical `f02-geo-runtime-pack-d26`. D26 business + one correction is exhausted. This result is not adopted. No third request has been sent. Original source/report/logs remain unchanged.

## Terminal and scope

Worker finished 2026-10-16T19:04:01.253801Z, elapsed2235.329s, CLI0, completed/is_error=false, valid four final command rows. Worker67806/launcher67805 exited; outer session48603 drained exit0. Parent observed Read29/Edit29/Bash6. One extra successful read-only `wc -c real-pub-source.json sample-input.json geo-loader.js test-geo-loader.cjs pack_geo.py test_pack_geo.py` beyond four allowed commands; the Node command ran twice. No permission denial or write escape. All13 source inputs and9 read-only staged files retain original SHA. The full original result is in result.json; no report was repaired by the parent.

## Confirmed improvements

- Parent reran exact four commands:48 Python tests,23 Node tests, sample packing and JS syntax all pass. Original HTTP probes now pass raw gzip with query and native-fetch Content-Encoding-decoded JSON/gzip; original malformed schema probes reject correctly. Actual Chrome155 sample loads and script SHA also pass. The single console error was the technical fixture's missing favicon.ico404, not a loader or game JavaScript failure.
- Parent full-source packing exited0 in424.024320s (internal audit420.765492s). Input514313066B, SHA3a18d70c3dd6e77e10af71b71ab54ca0fb59b74e8287d2c358933475dcf199f5. Output JSON397004443B, gzip101347149B; full candidate preserved at `/Volumes/SanDisk2TB/amsterdam-geodata/d26-bgt-20261017/runtime-candidate-pack01-r2`, not a game asset or adoption.
- Independent whole-data geometry checks:145703 identities/properties retained,148942 polygons/163268 rings unchanged in count,22977546→16943508 vertices, all output vertices from originals, bounds exact,2693 invalid-source features retained whole. Maximum independent Hausdorff0.049999999999272404m. Gunzip SHA matches JSON f9263bbf5b31af6dda30bd002130d8ada11957fddd202120dd2bd0b1fff8c146. This check took141.815227s.
- Separate source STRtree found843220 bbox-neighbour pairs and284123 nonzero shared-line pairs in68.345281s; final-output check187.643374s retained every tested original line seam, zero missing length under a0.1-micrometre observation tolerance, no GEOS exceptions. This tolerance only measures results; the candidate is never buffered or repaired by the parent.62-feature local check also retains132 pairs.
- Diagnostic unchanged NAV-R2 on the full candidate now finds pub→Lotte49.34862684m/4points,76.094333ms. Independent GEOS checks of those3 segments on62 features extracted from the full candidate give minimum clearances0.736496/0.599548/2.004217m, all≥0.4m. This confirms the old local crack is repaired; it does not accept NAV-R2, prove all-city routing or represent natural gameplay.

## Rejection: new coverage overlap despite retained line seams

The full neighbour comparison found **11 new positive-area overlaps** where the original pair intersection area was zero. Maximum0.001347999999m² (about13.48cm²); do not describe this as a large visible urban defect or proven whole-city navigation failure. It nevertheless violates this correction's explicit preservation of coverage/no new overlaps along shared borders. Raw pairs and magnitudes are in full/independent-seams.json.

A fully extracted two-road witness is in overlap-source.json and overlap-packed.json: wegdeel:29f38e0b-a07d-55a5-8795-da3e88905989 with wegdeel:d4ae019d-8211-50ac-bfc9-6dab17283f74. Both originals and outputs are valid. Original intersection area0; packed0.000839872169558m². Translating to local coordinates and scaling1000x recomputes839.872169479mm², so this is not a world-coordinate roundoff flag. Point(2552.277030882353,2894.3785) changes from covered by only one road to covered by both. These two roads have source height attributes-1/0; those properties were preserved, and this evidence concerns geometry coverage rather than an assertion that the roads must connect in gameplay.

Code inspection explains a remaining coverage blind spot: `_lineal_parts` discards Point members of mixed boundary intersections; preserving all lineal seams does not constrain intervening point contacts/gaps or prove neighbour coverage. The original witness contains both line segments and point contacts. This observation does not claim every one of the11 pairs has the same cause. No implementation has been modified to fix it.

## Loading and limits (separate from the rejection)

Real browser default128MiB and explicit192MiB both correctly reject this larger asset. Explicit512MiB succeeds in raw-gzip-with-query and native-decoded Content-Encoding cases, returning all four counts:2350 bridge components/71463 buildings/70085 roads/1805 water. Raw7426.8ms with observed main-thread gap6888.8ms; encoded8273.1ms with gap7576.2ms. Observed end-of-load JS heap2.49GB/2.02GB is not peak process RSS or a physical-phone measurement. Browser resource transfer101347149B corresponds to the full gzip; loader script bytes/SHA match the reviewed file. The old192MiB integration assumption and old140520240B/36376205B size repeated in worker next_steps are superseded by these new measurements. Size targets were explicitly soft; this review does not invent a hard timing/size failure criterion. Performance remains a material game-integration limitation.

## Preservation and next boundary

No game files/branches/services/user saves changed; current game branch3c9bb0e only includes GEO01 converter, old playable18860/dad6b38 still uses the old map. Parent browser amsterdam-d26-pack-r2 closed and owned18863 server71467 stopped after exact-command check. A read-only macOS sample attempt returned255 because the full pack process had already completed; it is not a worker failure or a600-second timeout.

Standard outcome: rejected/semantic, adopted0, correction1/1 exhausted. All57 Amsterdam ledgers had state done at parent observation (not57 successes). Full D26 remains incomplete. NAV extra question is still awaiting an actual human answer; no preselection/elapsed time is authorization. The fixed02:03:03Z deadline and23:48:33Z direction review remain.

To reproduce offline, restore the archived files into a fresh parent directory with sample/ and full/ layout as used by parent-command-runner.py; supply the durable original and candidate data named in the manifest. Source-neighbours pickle is disposable derived local data, not required in Git; rerun source-neighbors.py before verify-source-seams.py. Full candidate bytes are preserved locally; this evidence does not publish a new game.
