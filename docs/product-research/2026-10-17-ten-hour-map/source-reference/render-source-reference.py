from pathlib import Path
import json,math,subprocess,datetime
root=Path('/tmp/amsterdam-d26-bgt-full-20261017')
out=Path('/tmp/amsterdam-d26-source-preview');out.mkdir(exist_ok=True)
west,south,east,north=4.865,52.345,4.970,52.405
radius=6371008.8;coslat=math.cos(math.radians((south+north)/2))
width=radius*coslat*math.radians(east-west);height=radius*math.radians(north-south)
scale=min(1480/width,1220/height);ox=(1600-width*scale)/2;oy=110
stats={};invalid=[]
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1400" viewBox="0 0 1600 1400">','<rect width="1600" height="1400" fill="#f9f7f2"/>','<text x="60" y="40" font-family="sans-serif" font-size="25" fill="#223344">Amsterdam / BGT source reference</text>','<text x="60" y="73" font-family="sans-serif" font-size="16" fill="#445566">Raw source geometry review - water and buildings only - not an updated game screenshot</text>',f'<defs><clipPath id="map"><rect x="{ox}" y="{oy}" width="{width*scale}" height="{height*scale}"/></clipPath></defs>',f'<g clip-path="url(#map)"><rect x="{ox}" y="{oy}" width="{width*scale}" height="{height*scale}" fill="#e9e5d9"/>']
for collection,color in [('waterdeel','#7ba9bd'),('pand','#786b5a')]:
    progress=json.loads((root/collection/'progress.json').read_text())
    assert progress['complete'],collection
    count=0;vertices=0
    for page in progress['pages']:
        d=json.loads((root/page['file']).read_text())
        for feature in d['features']:
            geom=feature['geometry'];polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
            command=[]
            for polygon in polys:
                for ring in polygon:
                    coordinates=[]
                    for lon,lat,*rest in ring:
                        x=ox+radius*coslat*math.radians(lon-west)*scale;y=oy+radius*math.radians(north-lat)*scale
                        if not math.isfinite(x+y):raise ValueError(feature['id'])
                        coordinates.append(f'{x:.3f},{y:.3f}');vertices+=1
                    command.append('M'+'L'.join(coordinates)+'Z')
            parts.append('<path fill="'+color+'" fill-rule="evenodd" d="'+' '.join(command)+'"/>');count+=1
    stats[collection]={'features':count,'vertices':vertices,'complete':True}
parts+=['</g>',f'<path d="M60,1360h{1000*scale:.3f}" stroke="#223344" stroke-width="4"/>','<text x="60" y="1385" font-family="sans-serif" font-size="15">1 km / local metre projection; Kadaster PDOK BGT snapshot 2026-10-16; CC0-1.0</text>','</svg>']
svg=out/'source-reference.svg';svg.write_text('\n'.join(parts))
(out/'manifest.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bbox':[west,south,east,north],'width_m':width,'height_m':height,'source_root':str(root),'layers':stats,'game_changed':False},indent=2)+'\n')
print(json.dumps(stats),flush=True)
r=subprocess.run(['/opt/homebrew/bin/rsvg-convert',str(svg),'-o',str(out/'source-reference.png')],capture_output=True,text=True)
print('render exit',r.returncode,r.stderr[:1000],flush=True);raise SystemExit(r.returncode)
