# City expansion implementation plan

The user authorized expanding the main map. Continue in codex/three-day-reopening from bffb660. Apply subagent-driven development to the isolated geometry module while local integration proceeds; independent spec and quality reviews follow.

- [x] Geometry module and tests: fixed1800×1120 map, land/water/bridges/ferry/buildings, six POIs, walkability, routing, movement, position restore.
- [x] Extend core market/lab actions with resource and once/day tests, preserving existing save shape.
- [x] Draw city using shared geometry; moving avatar, route, district labels, destination icons, discovery count.
- [x] Integrate map in daytime; WASD/arrows, click routing, E entry, six destination buttons, place action panels, return/open, pause and independent city save validation.
- [x] Verify gameplay/resource loop, obstacle routing/ferry, resize/mobile, reload/pause; run legacy and new tests.
- [x] Independent spec review and code review; fix findings, update docs, commit, show current preview.

## Verification record

- TDD: market/lab checks failed with unknown preparation action before implementation, then all40corechecks passed; geometry was independently implemented test-first and passes11checks including36orderedPOIpairs and2-unit collision sampling.
- Real browser: pub→Noord via ferry→salvage→dock→market crate(€8, +2ale/+1stout)→pub at action0→successful €10 first sale→nextday at pub. Lab purchase costs€6 and supplies2hops; café supplies€18.
- Refresh preserved location, discoveries, cash and actioncount while clearing ephemeral travel. Pause stopped the route. E enters, M returns to map, D cancels automatic routing and immediately clears its panel. Direct Canvas click in zoom view selected the correct market route.
- At390px: all destinations and place actions worked, with no horizontal overflow. Temporary viewport reset after testing.
- Spec review found one stale-route panel after manual takeover; fixed and rechecked in NodeVM and realbrowser. Also added ferry state changes to the toolbar refresh and lab's visible hop counter.

- Quality review found a zoom-camera coordinate-unit mismatch. Two tests invoking the real scene renderer reproduced the off-screen avatar before the fix; both offsets now convert world distances to canvas units, and all13citychecks pass including edges/centering/click inversion. Review confirmed no remaining P1/P2 issues.
- Final validation:40gameplaychecks +13city/scenechecks,410legacyassertions, JSsyntax, stagedwhitespacecheck, browserconsole and mobile verification. Changes committed locally on codex/three-day-reopening.
- Preview on port18768 is an independent fresh map run, preserving the user's existing port18767 local save. Both servers serve the same updated files.
