import json,pathlib,time,math
from shapely.geometry import Point,Polygon
from shapely.ops import nearest_points
p=pathlib.Path(__file__).parent;start=time.monotonic();d=json.loads(pathlib.Path('/Volumes/SanDisk2TB/amsterdam-geodata/d26-bgt-20261017/converted/geo-data.json').read_text());fs={f['id']:(layer,f)for layer,features in d['layers'].items()for f in features}
road=json.loads((p/'road-anchor-candidates.json').read_text());road={x['key']:x for x in road};bf=json.loads((p/'bridge-and-ferry-candidates.json').read_text());anchors={}
for out,key in [('pub','jordaan'),('market','market'),('coffee','coffee'),('flowers','flowers'),('lab','science')]:
 c=road[key]['candidates'][0];anchors[out]={'x':c['x'],'y':c['y'],'featureId':c['feature_id'],'basis':road[key]['source_name'],'fictionalVenue':True}
anchors['lotte']={'x':1056.057,'y':3247.410,'featureId':bf['decks_near_pub'][0]['id'],'basis':'Actual BGT bridge deck near fictional pub; not a real named business','fictionalVenue':True}
for label,name in [('ferrySouth','ferry_south_road_end'),('ferryNorth','ferry_north_road_end')]:
 c=bf['candidates'][name]['candidates'][0];anchors[label]={'x':c['point'][0],'y':c['point'][1],'featureId':c['id'],'basis':'Game boarding anchor near official street end; not surveyed GVB platform coordinates','fictionalVenue':False}
# Choose two distinct nearby ground-road anchors for the existing fictional cart/garden interactions.
for name,qxy in [('flowerCart',(1800,5870)),('garden',(1810,5800))]:
 q=Point(qxy);candidates=[]
 for f in d['layers']['roads']:
  b=f['bounds'];props=f['properties'];fun=props.get('functie','');level=props.get('relatieve_hoogteligging',0)
  if not(b[0]-25<=q.x<=b[2]+25 and b[1]-25<=q.y<=b[3]+25)or level not in [0,'0',None] or fun not in ['voetpad','voetgangersgebied','fietspad','rijbaan lokale weg','woonerf']:continue
  for pp in f['polygons']:
   poly=Polygon(pp[0],pp[1:])
   if not poly.is_valid:continue
   inner=poly.buffer(-.8)
   if inner.is_empty:continue
   near=nearest_points(q,inner)[1]
   if near.distance(q)<=25:candidates.append((near.distance(q),f['id'],near.x,near.y,fun))
 candidates.sort();dist,fid,x,y,fun=candidates[0];anchors[name]={'x':round(x,3),'y':round(y,3),'featureId':fid,'basis':'Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address','fictionalVenue':True}
results=[]
for name,a in anchors.items():
 pt=Point(a['x'],a['y']);layer,f=fs[a['featureId']];support=[]
 for pp in f['polygons']:
  poly=Polygon(pp[0],pp[1:]);support.append({'valid':poly.is_valid,'containsCenter':poly.contains(pt),'boundaryDistance':poly.boundary.distance(pt),'sufficientDiskClearance':bool(poly.is_valid and poly.contains(pt) and poly.boundary.distance(pt)>=.4)})
 conflicts=[]
 for k in ['water','buildings']:
  for x in d['layers'][k]:
   b=x['bounds']
   if not(b[0]-.4<=pt.x<=b[2]+.4 and b[1]-.4<=pt.y<=b[3]+.4):continue
   for pp in x['polygons']:
    poly=Polygon(pp[0],pp[1:]);distance=poly.distance(pt)
    if distance<.4:conflicts.append({'layer':k,'id':x['id'],'distance':distance,'valid':poly.is_valid,'deckExceptionCandidate':name=='lotte' and k=='water'})
 results.append({'anchor':name,**a,'support':support,'conflicts':conflicts,'sufficientLocalFootSafety':any(x['sufficientDiskClearance']for x in support) and not any(not x['deckExceptionCandidate']for x in conflicts)})
out={'basis':'Parent geometric sufficient-disk checks using unchanged accepted full BGT data; no route connectivity or actual game adoption claim. No source geometry repaired or modified.','radius':.4,'results':results,'elapsedSeconds':time.monotonic()-start};(p/'anchor-safety-parent.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');(p/'integration-anchor-candidates.json').write_text(json.dumps(anchors,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2),flush=True)
