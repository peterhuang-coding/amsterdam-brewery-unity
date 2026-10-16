from pathlib import Path
import json,gzip,shutil,datetime,subprocess
w=Path('/Volumes/SanDisk2TB/amsterdam-brewery-unity/.claude/worktrees/push-review-20260914');d=w/'docs/product-research/2026-10-17-ten-hour-map/NAV01/parent-review';d.mkdir(parents=True,exist_ok=True)
r=Path('/tmp/amsterdam-d26-nav-parent-20261017');l=Path('/Users/peter_mini/.local/state/taskrouter/claude-plan/amsterdam-d26-geo-navigation-20261017')
for f in r.iterdir():
 if f.is_file():shutil.copy2(f,d/f.name)
shutil.copytree(r/'final',d/'original-output',dirs_exist_ok=True)
for n in ['result.json','status.json']:shutil.copy2(l/n,d/('original-'+n))
with (l/'events.jsonl').open('rb') as a,gzip.open(d/'original-events.jsonl.gz','wb') as b:shutil.copyfileobj(a,b)
body='''# NAV01 business parent review — rejected / semantic

Original fixed ID amsterdam-d26-geo-navigation-20261017 finished 2026-10-16T17:02:15.060452Z, CLI0 / is_error=false / complete valid report, 1666.919 seconds. Worker55396 exited. Seed Evolving enabled/high. Original files/report/logs retained verbatim.

Read8/Edit15/Bash12 all contract scope, no extra Bash, no permission denial or write escape. All3 source and readonly staged SHA match. Parent copied final workspace independently: syntax0, node:test30/30, synthetic1km benchmark0, benchmark syntax0. Original benchmark measurements are synthetic, not actual-city proof.

## Reproduced blocking issue
A legal road polygon with outer square[-3,-3]..[3,3] and small hole[0.6,0.6]..[0.7,0.7], actor centre(0,0), radius1: isWalkable returns true. The entire hole is inside the actor disk and does not intersect the sampled circumference. This violates the explicit whole-disk road/hole clearance contract. Parent repro exit1, expectedfalse/actualtrue on immutable final bytes. Body can occupy non-road space despite centre/circumference checks. Needs targeted correction and regression for hole/notch, overlapping legal road unions, and swept movement.

## Actual source diagnostic (not game adoption)
Real full-feature 600m Jordaan subset:21 water/1559 buildings/1084 roads/26 bridge parts. Index5.768ms. Pub and nearby bridge candidate centres both walkable at radius0. Actual49.337m route found with4points/70visited,821.443ms. Does not establish full-map performance, positive-radius safety, real-world legal cycling, height separation, all-place connectivity, player experience or1:1 facades. Full subset is local /tmp/amsterdam-d26-anchor-source-20261017/pub-parent-data.json, original source provenance preserved separately.

Decision: rejected/semantic, business1, correction0/1, adopted0. One targeted NAV01 correction remains, to be prepared with measured real geometry after runtime packing. First wave has returned and been reviewed. Next independent wave is GEO01 targeted metadata correction plus PACK01 runtime packaging, already contracted e239776. No main-agent implementation rewrite.
'''
(d/'parent-review.md').write_text(body)
s=json.loads((w/'.claude/autopilot/four-day-state.json').read_text());s['in_flight']=[];s['awaiting_parent_review']=[];s['renewal']['nav01_business_review']='rejected/semantic: positive-radius road-hole clearance; synthetic30pass, actual49m radius0 route821ms';s['renewal']['first_wave_collected_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();s['current_task_id']=None;s['current_stage']='first_wave_collected_next_wave_ready'
for t in s['prepared_tasks']:t['blocked_until']=None
(w/'.claude/autopilot/four-day-state.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
print(d)
