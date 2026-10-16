import json,time,pathlib,pickle
from shapely.geometry import Polygon,MultiPolygon
from shapely.strtree import STRtree
from shapely.errors import GEOSException
p=pathlib.Path(__file__).parent;t=time.monotonic();d=json.loads(pathlib.Path('/Volumes/SanDisk2TB/amsterdam-geodata/d26-bgt-20261017/converted/geo-data.json').read_text());ids=[];layers=[];geoms=[]
for k,fs in d['layers'].items():
 for f in fs:
  z=[Polygon(q[0],q[1:])for q in f['polygons']];ids.append(f['id']);layers.append(k);geoms.append(z[0]if len(z)==1 else MultiPolygon(z))
del d
tr=STRtree(geoms);pairs=0;seams=[];errors=[]
for i,g in enumerate(geoms):
 for j in tr.query(g):
  j=int(j)
  if j<=i:continue
  pairs+=1
  try:s=g.boundary.intersection(geoms[j].boundary)
  except GEOSException as e:errors.append((i,j,str(e)));continue
  if s.length>=1e-6:
   valid=g.is_valid and geoms[j].is_valid
   old_area=g.intersection(geoms[j]).area if valid else None
   seams.append((i,j,s,old_area))
 if i%20000==0:print(i,len(seams),time.monotonic()-t,flush=True)
with(p/'source-neighbors.pickle').open('wb')as f:pickle.dump({'ids':ids,'layers':layers,'seams':seams,'errors':errors,'pairs':pairs},f)
r={'source_features':len(geoms),'bbox_neighbor_pairs':pairs,'shared_seam_pairs':len(seams),'geos_exceptions':len(errors),'seconds':time.monotonic()-t};(p/'source-neighbors.json').write_text(json.dumps(r,indent=2));print(r,flush=True)
