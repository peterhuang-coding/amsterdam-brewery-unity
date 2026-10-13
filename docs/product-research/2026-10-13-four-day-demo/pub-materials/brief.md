# PLAY09 | Pub materials and light — bounded Coding Plan handoff

Exact adopted base231a1326b0a1ab05a1d59da622e7949db1394cdc. Approval: D23 four-day existing-web-demo scope, consistent scene visuals and feedback; D24 one business attempt and at most one targeted correction after confirmed terminal failure. Only Seed Evolving thinking enabled/high. No prior failed candidate reused. PLAY03 first-cup DOM, PLAY06 morning-card and PLAY07 pub guests are shelved and MUST remain untouched. This is an independent background-material package, not a new ID for any shelved task.

## Player outcome and design
Parent natural adopted intro screenshot: canal/window is recognizable but wall is a smooth gradient with repetitive lines and the long counter is a flat strip/panels, giving little material depth. Improve existing pub background into a modest worn Dutch brown-cafe interior: quiet plaster, dark stained timber, copper/warm pools. Keep current green/copper palette and composition. At desktop and390 viewport player should distinguish polished countertop lip, recessed cabinet fronts and night pools immediately; small detail must support large tonal forms, not become visual noise. No new tutorial, labels, objects or game mechanic. This is incremental art, not proof of fun or complete art direction.

Alternatives considered: full image/asset redraw would expand pipeline and obscure state-driven props; change DOM/guest silhouettes overlaps shelved work; selected approach changes only three background blocks with deterministic Canvas strokes/gradients and actual night flag. No external assets/dependencies/network. No Math.random or per-frame accumulating textures. No new animation/timers; reduced-motion existing behavior stays.

## Exact allowed scope
Outputs only tools/prototype/reopening-scene.js and NEW tools/prototype/test-pub-materials.js.
Scene editable spans inside draw:
1. After comment `// Deep green woodwork and plaster, with a warm copper light at night.` through before `// Three tall windows look out over the canal, behind the bar.`: wall/plaster/beam depth. Keep wall footprint0,0..1100,460 and room framing. Wall detail drawn here stays behind later window/sign/shelf/chalkboard/props.
2. `// Warm hanging lamps. Changes in light give the day/night transition weight.` through before `// Back counter, taps and glassware.`: existing 3 lamps at257/652/952; strengthen contained nightlight. Preserve lamp anchors/count; no new hanging furniture or functional signal.
3. Only counter shell after `// Back counter, taps and glassware.` through before `for(let i=0;i<(state.upgrades.includes('doubleTap')?2:1);i++){`: top10,398,1080,38, cabinet24,436,1052,195, originalpanel grid and baseboard. Make top bevel/woodgrain, recessed panel highlights/shadows, subtle worn edges and actual-night warm light pools on countertop, with calm day counterpart. Keep footprint and panel count/positions. Draw all details before taps, register, glasses, cellar/stage, guests, active pours. Warm pools must stay on wood/under props, never wash out foreground.
May add small dedicated helper(s) immediately before draw only called from these3spans. Shared primitives, constructor/camera/viewport transforms, city/canal methods and all remaining bytes of draw outside those spans stay unchanged.

READONLY: windows/outsidecanal, plants/tulips, sign, actualstock shelves and text, chalkboard/promises, all taps/register/cash/glasses/bowl/cellar/stage/music, guests/stools/selection/patience, active pours, brew, vignette, scene dispatch, UI/CSS/core/economy/save/input and ALL old test assertions. No new states/fields, no fake stock or customer cues. Do not touch backstage-scene/minimap. No refactoring or formatting outside allowed regions.

## Meaningful regression and execution plan
- Read brief then frame-contract and draw429-end with Read offset/limit; recorder31-180 if needed. Input names/locations supplied, no shell exploration.
- Add behavioral tests executing real PubScene.draw with finite-argument Canvas recorder, real save/restore and gradient semantics. Test new spatial visual properties with tolerant semantic checks (wood/top bevel recessed-panel light/shadow and localized nightwarm pools distinguishable from day, not just new method exists/source regex/count of arbitrary function calls). Assert geometry/clipping of material strokes to allowed surfaces, no NaN/strings in mandatorynumericargs. Verify no animation jitter at equal state/different timestamps for added material details and reducedmotion; stable composition. Verify actualstock totals/registercash/tap count and activepour operations still reflect fixture; input objects not mutated, balancedcanvasstates. Keep synthetic fixtures explicit; tests do not substitute natural GUI.
- RUN final new tests on UNMODIFIED supplied scene first and capture genuine RED for missingnewbehavior. Some preservation tests may already pass. Do not later remove a feature to manufacture red; do not pretend an erroneous test/absent mock method is a meaningfulbaseline failure.
- Implement only3spans/helpers, run newtest GREEN, run old test and2syntaxcommands. Repair test harness flaws separately and state them honestly. Parent reruns final tests against exactadoptedbase and full394+new suite.
- Complete truthful handoff-result.json and final answer before1200sec/32turns. Four final tests rows, one per exactcommand; RED details belong summary/memory_delta only. A report is not parent adoption. If blocked, report realfailure promptly. Never claim naturalbrowserverification you did not run.

## Only allowed Bash commands (exact, no chainedcommands or extras)
node --test tools/prototype/test-pub-materials.js
node --test tools/prototype/test-city.js tools/prototype/test-street-atmosphere.js
node --check tools/prototype/reopening-scene.js
node --check tools/prototype/test-pub-materials.js

Read/Edit are available; initial newtest is empty to support Edit. No Write requirement. No grep/ls/wc/cat/git/npm/network or extra shell even if readonly. Use Read offset/limit when shortercontext needed. All implementation/test/report writing stays in allowed workspace.

## Parent acceptance (not executor claims)
Complete report/tool scope/inputSHA audit, original old tests unchanged, finalnewtest truebaseRED→candidateGREEN and old394+allnew; source diff confined exactly. Compare natural intro/daypub and nightpub desktop/390 screens before/after, then natural selectcustomer/pour/bill/inventoryfeedback and pause-refresh; city and night-map remain unchanged. New wood texture must be visibly coherent at390 without hiding taps, beerfill, customerselection or realstock. Parent may reject muddy/noisy/imperceptible art despite green unit tests. Only after independent acceptance copytwofiles, commit/pushseparate gamebranch, newisolatedplay and browseractualresourcebytechecks. If business or parent acceptance fails, one targetedcorrection maximum; if correction fails shelve, no mainagentrewrite.
