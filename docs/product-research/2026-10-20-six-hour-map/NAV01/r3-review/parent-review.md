# NAV01 R3 parent review — accepted standalone navigation with disclosed command deviation

Reviewed UTC2026-10-19T17:27Z under D27 fixed6h authorization. Standard outcome accepted_with_changes / other. The implementation is adopted byte-for-byte; this label records the one explicitly disclosed unlisted read-only command, not a parent rewrite. Original business/R2 rejected history stays intact; approved extra1/1 consumed. No further NAV correction is authorized.

## Execution and scope

Fixed ID amsterdam-d26-geo-navigation-r3-20261017, logical f02-polygon-navigation-d26; Seed Evolving enabled/high. Started16:58:30.589249Z, finished17:13:29.667573Z, CLI0/success/is_error=false,899.077s,38turns. Worker20974/launcher20962 exited, session25671 drained. Ten source hashes and seven readonly workspace hashes unchanged. Read13/Edit13/Bash11; no permission denials or disallowed writes. One early `wc -c parent-capsule-repro.json real-pub-sample.json` lies outside the four exact allowed commands; both are listed public inputs, no mutation or broader access occurred. Original report and tool history preserved.

Production diff only replaces absolute-world-coordinate containment tolerance with local metric edge distance and recognizes actual prefixed highway classifications. All39 original test intentions remain;4 additional tests cover real capsule, translated/rotated boundaries and classification. No routing algorithm, geometry, obstacle policy or endpoint changes were made.

## Independent acceptance

Four parent commands returned0;43/43tests. Same four commands rerun in final adoption directory returned0. Independent parent GEOS3000 point/capsule cases:0false-safe,0false-blocked. Sixty transformed triangle cases and seven classification cases pass. Calibrated oldR2 fails the expected1false-safe,9transformed outside cases and2prefixed highway cases, confirming these checks can detect the former defects.

Full original converted source514313066B/SHA3a18d70c3dd6e77e10af71b71ab54ca0fb59b74e8287d2c358933475dcf199f5 indexed145703features. All10 reviewed anchors are walkable at radius0.4m; actual bike restrictions are recorded separately. Pub→coffee found3118.9693431007295m,73points/72segments,71574expandednodes. Independent GEOS union-minus-obstacles oracle checks all72segments:0failures,minimum boundary clearance0.4008350089248191m. Its make_valid use is comparison-only for original invalid source objects, disclosed per segment, and never changes runtime data. Original-source result is not PACK candidate acceptance or all-venue connectivity proof.

## Measured limitation and adoption

That full route took124577.378916ms; index825.506ms, sourceparse3618.854ms. Caches held110066point and220844segment entries after one query; cache eviction is absent. End Node RSS2857811968/heapUsed1888107128B are process-end observations, not browser/phone/peak-memory claims. Correct bounded routing passes its original correctness contract but is unsuitable for a synchronous UI. Authorized new loading/integration work must bound memory and provide non-blocking queries and exact precomputed common routes before gameplay. No all-route performance or playable-map claim.

Six worker artifacts (three implementation/test/benchmark files and three required public fixtures) adopted byte-for-byte to tools/geo/navigation; parent only added README provenance. Game branch commit5f3d594 is pushed and remote verified. No City/FlowerNetwork/scene/UI/index change. Existing converter and renderer retained; game map integration remains0. D27 actualPlan2, newcomponent adoption1, cumulativecomponents3. PACK-R3 remains in its original run; next wave waits for complete first-wave collection and dependency acceptance.

Evidence: original/, result.json, status.json, events.jsonl.gz, scope-and-sha-audit.json, commands.json and command logs, independent-oracle.json, full-source-coffee.json/run/log, full-source-coffee-geos.json, adoption.json and adoption command logs. This review is immutable after registration; later synchronizations belong in separate records.
