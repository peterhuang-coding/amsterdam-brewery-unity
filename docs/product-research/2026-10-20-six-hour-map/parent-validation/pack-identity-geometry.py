import json,pathlib,time,hashlib,gzip
from shapely.geometry import Polygon
import argparse
ap=argparse.ArgumentParser();ap.add_argument('--candidate',type=pathlib.Path,required=True);ap.add_argument('--gzip',type=pathlib.Path,required=True);ap.add_argument('--report',type=pathlib.Path,required=True);args=ap.parse_args()
t=time.monotonic();src=json.loads(pathlib.Path('/Volumes/SanDisk2TB/amsterdam-geodata/d26-bgt-20261017/converted/geo-data.json').read_text());out=json.loads(args.candidate.read_text());bad=[];n=0;maxerr=0;invalid=0;vertices_before=0;vertices_after=0
for k in ['schemaVersion','bbox','projection','width','height']:assert src[k]==out[k]
for k in ['attribution','license','url','snapshot','complete','inputs']:
 if k in src['source']:assert src['source'][k]==out['source'][k]
for layer,fs in src['layers'].items():
 assert len(fs)==len(out['layers'][layer])
 for a,b in zip(fs,out['layers'][layer]):
  n+=1
  for key in a:
   if key not in ['polygons','bounds']:assert a[key]==b.get(key),(a['id'],key)
  for k in ['id','sourceId','localId','properties']:assert a.get(k)==b.get(k),(a['id'],k)
  assert len(a['polygons'])==len(b['polygons']),a['id']
  inv=False;featureerr=0
  for ap,bp in zip(a['polygons'],b['polygons']):
   assert len(ap)==len(bp),a['id'];A=Polygon(ap[0],ap[1:]);B=Polygon(bp[0],bp[1:]);vertices_before+=sum(map(len,ap));vertices_after+=sum(map(len,bp))
   for ar,br in zip(ap,bp):
    assert br[0]==br[-1] and len(set(map(tuple,br[:-1])))>=3,a['id'];assert set(map(tuple,br))<=set(map(tuple,ar)),a['id']
   if not A.is_valid:
    inv=True;assert ap==bp,a['id']
   else:
    assert B.is_valid,a['id'];e=A.hausdorff_distance(B);assert e<=.05000001,(a['id'],e);featureerr=max(featureerr,e)
  if inv:invalid+=1;assert a['polygons']==b['polygons'],a['id']
  maxerr=max(maxerr,featureerr)
  points=[xy for pp in b['polygons']for r in pp for xy in r];bb=[min(x[0]for x in points),min(x[1]for x in points),max(x[0]for x in points),max(x[1]for x in points)];assert b['bounds']==bb,a['id']
h=hashlib.sha256();size=0
with gzip.open(args.gzip,'rb')as f:
 for block in iter(lambda:f.read(1048576),b''):h.update(block);size+=len(block)
jsonsha=hashlib.sha256(args.candidate.read_bytes()).hexdigest();assert h.hexdigest()==jsonsha
r={'features':n,'invalid_original_features_preserved_whole':invalid,'vertices_before':vertices_before,'vertices_after':vertices_after,'max_independent_hausdorff_metres':maxerr,'all_identity_properties_cardinality_vertex_origin_bounds_checks_passed':True,'gzip_decoded_bytes':size,'gzip_matches_json_sha':jsonsha,'seconds':time.monotonic()-t};args.report.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2),flush=True)
