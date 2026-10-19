"""Independent Chromium load/index/paint measurements through Playwright CLI.

Sampling is the observed isolate JS heap plus ArrayBuffer/external-string backing
storage, not RSS or a guaranteed peak. Cold Canvas paint is timed separately.
"""
import argparse,json,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--page',required=True);p.add_argument('--manifest',required=True);p.add_argument('--routes');p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--cycles',type=int,default=2);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
cfg={'page':a.page,'manifest':a.manifest,'routes':a.routes,'cycles':a.cycles,'out':str(a.out.resolve())}
code=r'''async (page) => {
 const cfg=CONFIG;
 await page.goto(cfg.page); await page.setViewportSize({width:1280,height:900});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const cdp=await page.context().newCDPSession(page);
 const baseline=await cdp.send('Runtime.getHeapUsage');const cycles=[];
 try {
  for(let cycle=0;cycle<cfg.cycles;cycle++) {
   const heapSamples=[];let sampling=true;let phase='load';
   const sample=async()=>{while(sampling){const started=Date.now();try{heapSamples.push({at:started,phase,...await cdp.send('Runtime.getHeapUsage')});}catch(e){heapSamples.push({at:started,error:String(e)});}await new Promise(r=>setTimeout(r,50));}};
   const sampler=sample();let load;
   try {load=await page.evaluate(async cfg=>{
    let last=performance.now(),maxGap=0,gaps=0;const phases=[];const longTasks=[];
    const heartbeat=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;gaps++;},20);
    let observer;try{observer=new PerformanceObserver(l=>{for(const x of l.getEntries())longTasks.push(x.duration);});observer.observe({entryTypes:['longtask']});}catch(e){}
    const start=performance.now();let result;
    try{
     window.runtimeUnderTest=await AmsterdamGeoRuntime.load(cfg.manifest,{navigation:true,rendering:true,routesUrl:cfg.routes,onProgress:p=>{if(phases.length<2000)phases.push({...p,ms:performance.now()-start});}});
     const readyMs=performance.now()-start;
     const counts=Object.fromEntries(Object.entries(window.runtimeUnderTest.data.layers).map(([k,v])=>[k,v.length]));
     const r=window.runtimeUnderTest;result={loaded:true,readyMs,counts,stats:typeof r.stats==='function'?r.stats():r.stats,source:r.data.source};
    }catch(e){result={loaded:false,error:String(e),errorName:e.name,readyMs:performance.now()-start};}
    await new Promise(r=>setTimeout(r,30));clearInterval(heartbeat);if(observer)observer.disconnect();
    return {...result,maxObservedHeartbeatGapMs:maxGap,heartbeatSamples:gaps,longTasksMs:longTasks,progress:phases};
   },{manifest:cfg.manifest,routes:cfg.routes});
   phase='ready';const readyMemory=await cdp.send('Runtime.getHeapUsage');let paint=null;
   if(load.loaded){
    phase='cold-paint';try {paint=await page.evaluate(()=>{
     const cv=document.querySelector('canvas');cv.width=1100;cv.height=640;cv.style.width='1100px';cv.style.height='640px';
     const ctx=cv.getContext('2d');ctx.setTransform(1,0,0,1,0,0);const rt=window.runtimeUnderTest;
     const view={position:{x:1100.211,y:3243.117,visited:['pub'],bike:{x:1100.211,y:3243.117,mounted:false}},path:[],target:'pub',camera:'street',zoom:1,mode:'map',afterHours:false,reducedMotion:true,time:0};
     const options={width:1100,height:640,cssWidth:1100,places:[{id:'pub',name:'Brouwerij',x:1100.211,y:3243.117}],gardenEntry:null};
     const t=performance.now();const first=rt.renderer.draw(ctx,view,options);const coldPaintMs=performance.now()-t;const cached=[];
     for(let i=0;i<30;i++){const t0=performance.now();rt.renderer.draw(ctx,view,options);cached.push(performance.now()-t0);}
     return {coldPaintMs,cachedPaintMs:cached,frame:first,stats:rt.renderer.stats()};
    });
    await page.screenshot({path:cfg.out+'/cycle-'+cycle+'.png',fullPage:true});
    }catch(e){paint={error:String(e)};}
   }
   phase='dispose';await page.evaluate(()=>{if(window.runtimeUnderTest)window.runtimeUnderTest.dispose();window.runtimeUnderTest=null;});
   await cdp.send('HeapProfiler.collectGarbage');const afterDisposeGC=await cdp.send('Runtime.getHeapUsage');
   cycles.push({cycle,load,readyMemory,paint,afterDisposeGC,heapSamples});
   }finally{sampling=false;await sampler;}
  }
  return {baseline,cycles,errors,metric:'sampled CDP usedSize + backingStorageSize; not RSS or guaranteed peak',resources:await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,transferSize:r.transferSize})))};
 } finally {await cdp.detach();}
}'''.replace('CONFIG',json.dumps(cfg))
(a.out/'run-code.js').write_text(code)
r=subprocess.run(['bash','/Users/peter_mini/.codex/skills/playwright/scripts/playwright_cli.sh','-s=amsterdam-d27-runtime','run-code',code],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=900)
(a.out/'run.log').write_text(r.stdout)
if '### Result\n' not in r.stdout:print(r.stdout);raise SystemExit(r.returncode or 1)
result=json.loads(r.stdout.split('### Result\n',1)[1].split('\n###',1)[0]);(a.out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
for c in result['cycles']:
 values=[s['usedSize']+s['backingStorageSize'] for s in c['heapSamples'] if 'usedSize' in s]
 print(json.dumps({'cycle':c['cycle'],'loaded':c['load']['loaded'],'readyMs':c['load']['readyMs'],'maxObservedHeartbeatGapMs':c['load']['maxObservedHeartbeatGapMs'],'maxSampledHeapPlusBacking':max(values,default=None),'afterDisposeGC':c['afterDisposeGC'],'coldPaintMs':c['paint'].get('coldPaintMs') if c['paint'] else None}))
print('cli_exit',r.returncode)
raise SystemExit(r.returncode)
