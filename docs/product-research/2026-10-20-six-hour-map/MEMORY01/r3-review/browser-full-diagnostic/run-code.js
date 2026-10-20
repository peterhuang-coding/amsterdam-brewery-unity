async (page) => {
 const cfg={"page": "http://127.0.0.1:18866/parent.html", "manifest": "http://127.0.0.1:18866/raw/manifest.json?parent=2#full", "routes": null, "cycles": 1, "out": "/Volumes/SanDisk2TB/amsterdam-brewery-unity/.claude/worktrees/push-review-20260914/docs/product-research/2026-10-20-six-hour-map/MEMORY01/r3-review/browser-full-diagnostic"};
 await page.goto(cfg.page); await page.setViewportSize({width:1280,height:900});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const cdp=await page.context().newCDPSession(page);
 const baseline=await cdp.send('Runtime.getHeapUsage');const cycles=[];let activeAttempt=null;
 try {
  for(let cycle=0;cycle<cfg.cycles;cycle++) {
   const heapSamples=[];activeAttempt={cycle,heapSamples};let sampling=true;let phase='load';
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
   activeAttempt.load=load;phase='ready';const readyMemory=await cdp.send('Runtime.getHeapUsage');let paint=null;
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
 } catch(e) {return {baseline,cycles,errors,fatalError:String(e),activeAttempt};} finally {try{await cdp.detach();}catch(e){}}
}