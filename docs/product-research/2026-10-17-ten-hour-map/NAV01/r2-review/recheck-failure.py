import runpy,json,pathlib
from shapely.geometry import LineString,Point
from shapely.ops import nearest_points
root=pathlib.Path(__file__).parent
v=runpy.run_path(str(root/'make-oracle.py'))
c=json.loads((root/'real-geos-oracle-result.json').read_text())['failures'][0]
g=v['domains']['walk'];line=LineString([(c['start']['x'],c['start']['y']),(c['end']['x'],c['end']['y'])]);a,b=nearest_points(line,g.boundary)
# Find an explicit point inside actor capsule but outside the navigable domain.
witness=[]
for i in range(10001):
 p=line.interpolate(i/10000,normalized=True)
 if not g.covers(p) or g.boundary.distance(p)<.4-1e-7:
  witness.append({'fraction':i/10000,'center':[p.x,p.y],'centerCovered':g.covers(p),'clearance':g.boundary.distance(p)})
rows=[]
for name,fs in v['data']['layers'].items():
 for f in fs:
  for poly in f['polygons']:
   q=v['Polygon'](poly[0],poly[1:]);d=q.boundary.distance(line)
   if d<.401:rows.append({'layer':name,'id':f['id'],'distance':d,'properties':f['properties']})
out={'case':c,'lineCovered':g.covers(line),'minimumClearance':g.boundary.distance(line),'closestLinePoint':[a.x,a.y],'closestBoundary':[b.x,b.y],'denseCount':10001,'unsafeCenters':len(witness),'firstWitness':witness[:1],'nearbyFeatures':rows}
(root/'recheck-failure.json').write_text(json.dumps(out,indent=2)); print(json.dumps(out,ensure_ascii=False))
