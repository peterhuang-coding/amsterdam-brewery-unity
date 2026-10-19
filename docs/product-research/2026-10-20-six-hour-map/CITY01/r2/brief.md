# CITY01 one permitted targeted correction

Continue the supplied partial original implementation. Original business attempt timed out2400s; report and two required regression files were missing. Originalhistory andcounts remain. This is the one correction for logicalf02-real-city-d27. Fixedtaskamsterdam-d27-real-city-r2-20261020,2400seconds70turns. OnlySeedEvolving enabled/high. Do not restart/rewrite the module or change anchors/predicates/economy.

First fix the three independently reproduced defects in parent-regressions.cjs, which is readonly and runs against this workspace:
1. At48m/s a clear3m waypoint must complete within.1s; finite path travel must consume the available distance/time without premature loop exit. Preserve speed, obstacle and bike behavior.
2. F3 cannot teleport from within4m across a blocked connector. Reach the exact canonical boarding anchor through the accepted full-radius ground capsule before boarding; proximity alone is not proof. Preserve savedF3/refresh and safe landing.
3. Bike toggle/park while aboard must preserve carried bike until safe bank; never park a bicycle in water or cause restore to reset it to pub. Remotely parked bikes stay remote.

Then finish the originally required test-geo-city.cjs and test-geo-flower-network.cjs, run ALL exactcommands and write a complete legalhandoff. The previous three implementations alreadyparse and13of16independentcasespass; preserve those. Focus code changes on confirmed failures and necessary errors exposed by the missing original tests. Own only geo-world.js/reopening-city.js/flower-network.js and those2tests. Do not modify readonlyparent-regressions,acceptedNAV,fixture,anchors,original brief. No new pathfinder or invented roads/water. Only Flower coordinateimports may differ; its rules remain identical.

Original requirements are in original-brief.md. NAV exact APIs in suppliedsource. real-pub-sample.json is ONE minified line; do not repeatedlyRead giant JSON. fixture-shape.json is an accurately derived small shape summary; test code loads actualfixture withrequire/JSON.parse, not shell discovery. Parent handles complete145703featuremap. The synthetic F3 fixtures in parentregressions test state/ownership, not proof of actualfull-mapreachability.

Tests still must cover readiness, allsharedanchors, .4capsule/water/building/highway, old/newinvalidsaves/visits/aliasfreeclones, independentlyparkedbike, asyncabort/staleraces/progress, F3direction/refresh/cancel/pause/malformedmetadata andeconomicFlowerbehavior. Accept dependencies only through frozen routes.route Promise API as originalbrief. Preserve publicAPI forBOOT. You have readonlyoriginaltests as behavioralcontext but not oldgeometrytruth.

Use ONLY exactBashcommands listed. UseRead/Edit/Write forfiles; no grep/wc/node-version/cat redirection, installs, network, git, agents or unrelatedpaths. Do not spend the deadline repeatedly inspectinglargefiles: implement targetedfixes, run tests, report actualoutcomes. Reserve final5turns for allcommands/legalreport. Neverincludehandoff-result.json in changed_files. Do not claimfullgame/fullmapacceptance.
