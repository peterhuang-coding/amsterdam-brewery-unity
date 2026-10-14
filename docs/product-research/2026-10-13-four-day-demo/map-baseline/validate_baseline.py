from pathlib import Path
import json,math
b=json.loads(Path("baseline.json").read_text())
assert b["baseline"]=="dad6b38c54fda94f541764242f61820d8177bd19"
a=b["anchors"];assert len(a)==9 and len({x["id"] for x in a})==9
ids={x["id"] for x in a};rs=b["routes"];assert len(rs)==81 and {(r["from"],r["to"]) for r in rs}=={(x,y) for x in ids for y in ids}
for r in rs:
 assert isinstance(r["points"],list)
 for k in ["length_world","endpoint_distance","rideable_sample_count","ferry_sample_count","total_sample_count"]: assert isinstance(r[k],(int,float)) and math.isfinite(r[k]) and r[k]>=0
 assert isinstance(r["walkable_samples_ok"],bool)
assert len(b["restore_checks"])==9
for c in b["restore_checks"]:
 for k in ["anchor","input","output","fields_preserved"]: assert k in c
assert b["facts"] and b["limitations"]
assert len(Path("inventory.md").read_text())>500
assert len(Path("baseline-probe.js").read_text())>500
print("PASS baseline structure: 9 anchors,81 ordered pairs,9 synthetic restore checks; parent source and semantic review still required")
