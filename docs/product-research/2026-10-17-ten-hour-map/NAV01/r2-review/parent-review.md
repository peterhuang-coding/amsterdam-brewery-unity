# NAV01-R2 independent parent review — rejected / semantic

The fixed correction completed 2026-10-16T18:03:10.541154Z, elapsed1465.439s, CLI0/is_error=false, valid four-command report. Worker63702 and launcher63701 have exited; original outer63200 drained. This is correction1/1 of f02-polygon-navigation-d26; no additional dispatch or game adoption.

## Execution and passing evidence
Read9/Edit19/Bash14. One extra read-only Bash `wc -c real-pub-sample.json && head -c 2000 real-pub-sample.json` executed outside the exact command list; no permission denial/write escape. Eight source SHA and five readonly staged SHA unchanged. Original report remains unedited.
Parent independently ran exact four final commands: syntax0,39/39 tests, synthetic+real benchmark0, benchmark syntax0. Original30 test intents retained. Original road-hole repro now correctly returns false. Real62-feature/63-polygon source sample gives49.3486268404053m/4points/60visited radius0.4 route (~83ms local sample), not full-city proof.

## Rejection evidence
1. Independent GEOS valid road/deck union minus building/uncovered-water oracle has3000 disk/capsule cases;2999 agree,1 false-safe. Actual start(1057.2199094918608,3242.5560772147514),end(1049.8176482776287,3237.1391147867976),radius0.4. Minimum clearance0.39969294375176584m: shortfall0.000307056m. This is a small numerical discrepancy, not claimed as a large visible collision. Ten-thousand interval cross-check finds35 unsafe centers. Source and oracle saved.
2. A separate exact translation-invariance repro establishes the broader defect: triangle[(0,0),(.2,0),(0,.2)] and query(.15,.15),0.070710678m outside the hypotenuse. At offset0 or3000 module returns false; at offset6000 (within current map range) pointInPolygon and isWalkable radius0 both incorrectly return true. `pointOnRing` tolerance uses absolute world coordinates squared. Thus rejection is not based only on submillimetre tangency. No parent implementation edits.
3. Source-contract gap, separately attributable to parent: fullBGT has138 `rijbaan autosnelweg` and84 `rijbaan autoweg`; original contract named bare forms. Module rejects bare forms but accepts prefixed forms. Future integration must explicitly resolve real classification, not claim these are pedestrian surfaces. This was not silently added to in-flight requirements.

## Full-data integration diagnosis (separate PACK dependency)
Full140520240B packed candidate indexes147289 polygons in228ms after761ms JSON parse; all10candidate ground anchors walkable at0.4. Pub→Lotte at radius0.4 returns unreachable/370visited in57ms. This is not assigned solely to NAV: original sample and packed geometry differ. Independent GEOS pair test proves PACK simplification loses three shared-road/deck adjacencies, including an11.972785m sharededge becoming0.0046287m gap. Original and packed per-feature0.05m validity does not preserve inter-feature connectivity. PACK correction not yet dispatched and will include this new concrete evidence before dispatch.

## Decision
NAV01-R2 rejected/semantic; business1+correction1 exhausted under current D26 package policy. Preserve original code, report, tests and failures; do not adopt, rename to reset, or have the parent rewrite. Independent RENDER and PACK work continues under D26. Complete demo/new map remains unfinished, old18860/dad6b38 unchanged. A further NAV correction would require explicit exception with this precise review; no such request has yet been sent or presumed answered.
