import json,time,pathlib,pickle,sys
from collections import Counter
from shapely.geometry import Polygon,MultiPolygon
from shapely.errors import GEOSException
p=pathlib.Path(__file__).parent;t=time.monotonic()
with(p/'source-neighbors.pickle').open('rb')as f:w=pickle.load(f)
d=json.loads((p/'full/runtime.json').read_text());b=[];ids=[]
for k,fs in d['layers'].items():
 for f in fs:
  z=[Polygon(q[0],q[1:])for q in f['polygons']];b.append(z[0]if len(z)==1 else MultiPolygon(z));ids.append(f['id'])
assert ids==w['ids'];del d
lost=[];overlaps=[];errors=[];by=Counter();maxloss=0
for n,(i,j,s,old_area)in enumerate(w['seams']):
 by['/'.join(sorted([w['layers'][i],w['layers'][j]]))]+=1
 try:
  loss=max(s.difference(b[i].boundary.buffer(1e-7)).length,s.difference(b[j].boundary.buffer(1e-7)).length);maxloss=max(maxloss,loss)
  if loss>1e-7:lost.append({'a':ids[i],'b':ids[j],'source_seam_length_m':s.length,'uncovered_seam_length_m':loss,'new_gap_m':b[i].distance(b[j])})
  if old_area is not None and old_area<1e-8 and b[i].is_valid and b[j].is_valid:
   new_area=b[i].intersection(b[j]).area
   if new_area>1e-8:overlaps.append({'a':ids[i],'b':ids[j],'old_area':old_area,'new_area':new_area})
 except GEOSException as e:errors.append({'a':ids[i],'b':ids[j],'error':str(e)})
 if n%50000==0:print('progress',n,len(lost),len(overlaps),time.monotonic()-t,flush=True)
r={'features':len(b),'bbox_neighbor_pairs':w['pairs'],'shared_seam_pairs':len(w['seams']),'layer_pairs':dict(by),'verification_buffer_metres':1e-7,'max_uncovered_seam_length_m':maxloss,'lost_shared_seams':lost,'new_overlaps_on_shared_seams':overlaps,'source_geos_exceptions':w['errors'],'output_geos_exceptions':errors,'seconds':time.monotonic()-t};(p/'full/independent-seams.json').write_text(json.dumps(r,indent=2));print(json.dumps({k:v if not isinstance(v,list)else len(v)for k,v in r.items()},indent=2),flush=True);sys.exit(1 if lost or overlaps or errors or w['errors']else 0)
