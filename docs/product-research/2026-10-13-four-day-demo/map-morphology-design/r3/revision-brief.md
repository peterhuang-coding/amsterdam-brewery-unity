# MAP01 targeted extra correction, explicitly authorized

This is the third attempt of the same logical MAP01 design task: one original business attempt, one failed correction, and now ONE human-authorized extra correction. Prior failures remain recorded. This instruction supersedes the old draft's statement that it is the sole correction. Do not start over, add features, implement game code, or claim adoption. Keep the existing B1 three-arc canal belt and row-house design, alternatives, scope and compatibility discussion except where these three concrete issues require consistent local edits.

## 1. Correct factual claims throughout the three outputs

The existing four water rectangles form ONE connected union. The IJ ends at y=460, both vertical canals start at y=460, and the horizontal canal intersects both vertical canals. The supplied existing-geometry-evidence.json is a parent calculation from exact baseline dad6b38, not a test of proposed geometry or boat navigation. Distinguish the valid criticism (orthogonal morphology lacks recognizable curved canal-belt structure) from the false claim that existing southern canals are disconnected from IJ. Correct the overview, issue I1, evidence and any repeated statements in design.md/findings.json/concept.svg.

The phrase asserting a real Amsterdam port relationship at "Brouwershaven" is unsupported by the supplied S1-S6 reference cards and must be removed rather than replaced with another invented geographic claim. Describe the proposed IJ connection and sealed eastern ends as deliberate stylization where appropriate. Real reference facts must stay within sources.json.

As part of this source-fact consistency correction, note that PLACES contains Lotte but BUILDINGS explicitly excludes a Lotte facade. The existing sentence saying a facade moves automatically with Lotte is false. Preserve the actual six facades and musician-placement implications without inventing a seventh facade.

## 2. Make the narrow-bridge and bike contract internally consistent

Current B1 puts Lotte on narrow B3 (h=70), retains existing h<80 => walkable true / rideable false, but section 11 and findings acceptance simultaneously demand all nine anchors are rideable. These cannot all hold.

Keep the original push-bike rule and the two narrow bridges. Reconcile Lotte's proposed slot, route descriptions, concept label and the explicit acceptance contract consistently. All nine anchors must remain reachable on foot, all 72 non-self routes must be nonempty and sampled walkable, nine self routes remain empty. Declare expected rideability per affected anchor/bridge; do not demand bicycle riding on a push-only bridge or silently change the rule. If you retain the current Lotte-on-B3 placement, explicitly make the Lotte exception and push/park mode visible in the prose, findings and diagram. Other existing anchors, ENTRY/CART, gameplay IDs/costs and the ferry constraints remain as in the current proposal. Do not broadly weaken reachability or hide exceptions in vague text.

## 3. Repair the actual SVG layout without redesigning the scene

The line x1=1450,y1=876,x2=1450,y=940 is missing y2 and renders a long line from the top through the legend and old-map inset. Correct the intended endpoints. The right detail caption and bottom count text overflow their panels/canvas; wrap/reposition them and provide sufficient spacing. Keep diagram quantities, labels, map geometry and the three explicit disclaimers (concept, not game screenshot, not to scale) consistent with design/findings. Do not crop out defects or introduce external fonts/images/scripts.

Render the final SVG using the exact permitted command. The PNG is a review artifact derived from the SVG, not game output. You may read the PNG with Read if supported; parent will inspect it independently regardless. XML parsing/render exit zero does NOT prove visual readability or semantics. Review line endpoint attributes and text placement in the source as well.

## Delivery and commands

Editable outputs: design.md, findings.json, concept.svg and derived concept-preview.png. Everything else is immutable. Read this brief first, reuse existing outputs, and focus on the three issues rather than rereading all source files page by page. Source files are present for precise checks, not an invitation to redo the whole audit.

Run exactly these two commands once on the final outputs (additional reruns only if needed to fix an observed failure):

1. python3 validate_design.py
2. /opt/homebrew/bin/rsvg-convert -w 1600 concept.svg -o concept-preview.png

Complete the adapter's reserved handoff-result.json with required fields. The changed_files list contains only actually changed allowed outputs, never the reserved report itself. tests contains the two exact final command entries and their actual final results, no duplicated historical RED rows. Product limitations belong in findings/design, report.blockers is only for inability to execute. Call this MAP01 extra correction; do not copy the earlier mistaken MAP02 summary or claim parent acceptance/adoption. Future game checks remain proposed, not executed. No network, other shell commands, other paths, agents or game edits. This extra correction is one bounded attempt; parent review decides acceptance.
