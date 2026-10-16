import json,time,pathlib,sys
from collections import Counter
from shapely.geometry import Polygon,MultiPolygon
from shapely.strtree import STRtree
from shapely.errors import GEOSException
p=pathlib.Path(__file__).parent;t=time.monotonic()
src=json.loads((p/'sample/real-pub-source.json').read_text())
out=json.loads((p/'real-pub-packed.json').read_text());ids=[];layers=[];a=[];b=[]
for k,fs in src['layers'].items():
 for f,g in zip(fs,out['layers'][k]):
  assert f['id']==g['id'];ids.append(f['id']);layers.append(k)
  def geom(v):
   z=[Polygon(q[0],q[1:])for q in v['polygons']];return z[0]if len(z)==1 else MultiPolygon(z)
  a.append(geom(f));b.append(geom(g))
del src,out
print('built',len(a),time.monotonic()-t,flush=True)
tr=STRtree(a);pairs=0;seams=0;by=Counter();errors=[];lost=[];overlaps=[];maxloss=0
for i,x in enumerate(a):
 for j in tr.query(x):
  j=int(j)
  if j<=i:continue
  pairs+=1
  try:s=x.boundary.intersection(a[j].boundary)
  except GEOSException as e:errors.append({'a':ids[i],'b':ids[j],'error':str(e)});continue
  if s.length<1e-6:continue
  seams+=1;by['/'.join(sorted([layers[i],layers[j]]))]+=1
  try:
   # 0.1 micrometre numerical tolerance only for observation; output is never buffered/mutated.
   miss1=s.difference(b[i].boundary.buffer(1e-7));miss2=s.difference(b[j].boundary.buffer(1e-7))
   loss=max(miss1.length,miss2.length);maxloss=max(maxloss,loss)
   if loss>1e-7:
    lost.append({'a':ids[i],'b':ids[j],'source_seam_length_m':s.length,'uncovered_seam_length_m':loss,'new_gap_m':b[i].distance(b[j])})
   if x.is_valid and a[j].is_valid and b[i].is_valid and b[j].is_valid:
    old_area=x.intersection(a[j]).area;new_area=b[i].intersection(b[j]).area
    if old_area<1e-8 and new_area>1e-8:overlaps.append({'a':ids[i],'b':ids[j],'old_area':old_area,'new_area':new_area})
  except GEOSException as e:errors.append({'a':ids[i],'b':ids[j],'error':str(e)})
 if i%20000==0:print('progress',i,seams,len(lost),time.monotonic()-t,flush=True)
r={'features':len(a),'bbox_neighbor_pairs':pairs,'shared_seam_pairs':seams,'layer_pairs':dict(by),'verification_buffer_metres':1e-7,'max_uncovered_seam_length_m':maxloss,'lost_shared_seams':lost,'new_overlaps_on_shared_seams':overlaps,'geos_exceptions':errors,'seconds':time.monotonic()-t}
(p/'subset-independent-seams.json').write_text(json.dumps(r,indent=2));print(json.dumps({k:v if not isinstance(v,list) else len(v)for k,v in r.items()},indent=2),flush=True)
sys.exit(1 if lost or overlaps or errors else 0)
