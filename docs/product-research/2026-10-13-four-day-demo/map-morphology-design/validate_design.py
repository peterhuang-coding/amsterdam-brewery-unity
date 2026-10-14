from pathlib import Path
import json,xml.etree.ElementTree as ET
b="dad6b38c54fda94f541764242f61820d8177bd19"
f=json.loads(Path("findings.json").read_text())
assert f["baseline"]==b
assert f["feedback"]=="地图太简单、街区细节少，不够像真实阿姆斯特丹"
assert 1<=len(f["issues"])<=3
for x in f["issues"]:
 for k in ["id","claim","code_evidence","source_ids","inference","proposal"]: assert x[k]
 assert isinstance(x["code_evidence"],list)
 assert set(x["source_ids"])<=set("S"+str(i) for i in range(1,7))
assert 2<=len(f["alternatives"])<=3
for x in f["alternatives"]:
 for k in ["id","summary","tradeoff"]: assert x[k]
assert f["recommendation"] in [x["id"] for x in f["alternatives"]]
assert isinstance(f["acceptance"],list) and f["acceptance"]
for k in ["included","excluded","compatibility","future_files"]: assert isinstance(f["scope"][k],list) and f["scope"][k]
s=Path("design.md").read_text(); assert len(s)>700 and b in s
v=Path("concept.svg").read_text(); root=ET.fromstring(v)
assert root.tag=="{http://www.w3.org/2000/svg}svg" and root.attrib.get("viewBox")
assert "概念示意" in v and "非游戏截图" in v and "非等比例地图" in v
for e in root.iter():
 assert e.tag.rsplit("}",1)[-1] not in ["script","foreignObject","image"]
 for k,x in e.attrib.items():
  assert not k.lower().startswith("on")
  if k.rsplit("}",1)[-1]=="href": assert x.startswith("#")
print("PASS design structure, 1-3 issues, 2-3 alternatives, declared scope, standalone SVG; semantic and visual review still required")
