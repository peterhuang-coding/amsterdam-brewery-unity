from pathlib import Path
import concurrent.futures, datetime, hashlib, json, subprocess, urllib.parse
root=Path('/tmp/amsterdam-d26-bgt-full-20261017')
root.mkdir(exist_ok=True)
bbox=[4.865,52.345,4.970,52.405]
snapshot='2026-10-16T00:00:00Z'
def download(collection):
    out=root/collection
    out.mkdir(exist_ok=True)
    query=urllib.parse.urlencode({'f':'json','bbox':','.join(map(str,bbox)),'limit':250,'datetime':snapshot})
    url='https://api.pdok.nl/kadaster/bgt/ogc/v1/collections/'+collection+'/items?'+query
    pages=[];seen=set()
    for index in range(1,301):
        if url in seen: raise RuntimeError('repeated cursor '+collection)
        seen.add(url);file=out/('%04d.json'%index)
        result=subprocess.run(['curl','--fail','--compressed','--silent','--show-error','--connect-timeout','20','--max-time','180',url,'-o',str(file)],capture_output=True,text=True)
        if result.returncode: raise RuntimeError(collection+' page '+str(index)+' '+result.stderr.strip())
        raw=file.read_bytes();data=json.loads(raw)
        if data.get('type')!='FeatureCollection':raise RuntimeError('not FeatureCollection '+collection)
        page={'file':str(file.relative_to(root)),'collection':collection,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'features':len(data['features']),'url':url,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        pages.append(page)
        (out/'progress.json').write_text(json.dumps({'complete':False,'pages':pages},indent=2))
        print(json.dumps({'collection':collection,'page':index,'features':page['features'],'bytes':page['bytes']}),flush=True)
        nexts=[l['href'] for l in data.get('links',[]) if l['rel']=='next']
        if not nexts:
            (out/'progress.json').write_text(json.dumps({'complete':True,'pages':pages},indent=2))
            return pages
        url=nexts[0]
    raise RuntimeError('page budget exhausted '+collection)
if __name__=='__main__':
    allpages=[];errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs={pool.submit(download,c):c for c in ['waterdeel','overbruggingsdeel','pand','wegdeel']}
        for future in concurrent.futures.as_completed(jobs):
            try:allpages.extend(future.result())
            except Exception as error:errors.append({'collection':jobs[future],'error':str(error)});print(json.dumps(errors[-1]),flush=True)
    manifest={'bbox':bbox,'snapshot':snapshot,'complete':not errors,'provider':'Kadaster / PDOK BGT','url':'https://api.pdok.nl/kadaster/bgt/ogc/v1/','license':'CC0-1.0','inputs':sorted(allpages,key=lambda x:x['file']),'errors':errors,'finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (root/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'finished':True,'complete':not errors,'pages':len(allpages),'features':sum(p['features'] for p in allpages),'errors':errors}),flush=True)
