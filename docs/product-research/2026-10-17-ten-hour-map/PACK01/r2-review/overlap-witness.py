from pathlib import Path
import json,time
from shapely.geometry import Polygon,MultiPolygon
from shapely.affinity import translate,scale
p=Path(__file__).parent;t=time.monotonic();report=json.loads((p/'full/independent-seams.json').read_text());w=max((x for x in report['new_overlaps_on_shared_seams'] if x['a'].startswith('wegdeel:') and x['b'].startswith('wegdeel:')),key=lambda x:x['new_area']);wanted={w['a'],w['b']};docs={}
for label,path in [('source',Path('/Volumes/SanDisk2TB/amsterdam-geodata/d26-bgt-20261017/converted/geo-data.json')),('packed',p/'full/runtime.json')]:
 d=json.loads(path.read_text());docs[label]={**d,'source':{**d['source'],'complete':False,'parent_fixture_note':'Two-feature diagnostic extracted unchanged from full source/candidate; full manifest remains provenance only.'},'layers':{k:[f for f in fs if f['id']in wanted]for k,fs in d['layers'].items()}};del d
 (p/f'overlap-{label}.json').write_text(json.dumps(docs[label],separators=(',',':')))
def shapes(doc):
 fs={f['id']:f for vs in doc['layers'].values()for f in vs};out=[]
 for id in [w['a'],w['b']]:
  zz=[Polygon(x[0],x[1:])for x in fs[id]['polygons']];out.append(zz[0]if len(zz)==1 else MultiPolygon(zz))
 return out,fs
A,fs=shapes(docs['source']);B,_=shapes(docs['packed']);i=B[0].intersection(B[1]);anchor=i.representative_point();x,y=anchor.x,anchor.y
rows=[]
for label,gs in [('original',A),('packed',B)]:
 area=gs[0].intersection(gs[1]).area;norm=[scale(translate(g,xoff=-x,yoff=-y),xfact=1000,yfact=1000,origin=(0,0))for g in gs];rows.append({'version':label,'valid':[g.is_valid for g in gs],'intersection_area_m2':area,'translated_scaled_area_mm2':norm[0].intersection(norm[1]).area,'witness_covered':[g.covers(anchor)for g in gs]})
r={'basis':'Exact two full-output roads; no buffering or fixture coordinate edits. Recalculate after translation to witness and 1000x scale to distinguish real overlap from world-coordinate roundoff.','pair':w,'source_properties':{k:v['properties']for k,v in fs.items()},'witness_metres':[x,y],'packed_intersection_wkt':i.wkt,'source_shared_boundary_wkt':A[0].boundary.intersection(A[1].boundary).wkt,'recheck':rows,'seconds':time.monotonic()-t};(p/'overlap-witness.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
