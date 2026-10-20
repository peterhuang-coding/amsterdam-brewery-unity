async (page) => {
  const cfg = CONFIG;
  await page.goto(cfg.page);
  const progress=[]; let lastBeatAt=null;
  await page.exposeFunction("parentRouteProgress",p=>progress.push({receivedAt:Date.now(),...p}));
  await page.exposeFunction("parentRouteBeat",()=>{lastBeatAt=Date.now();});
  const pending=page.evaluate(async cfg => {
    const beats = [];
    let last = performance.now();
    const beat = setInterval(() => { const now=performance.now(); beats.push(now-last); last=now; window.parentRouteBeat(); },20);
    const started=performance.now();
    let runtime;
    try {
      runtime=await AmsterdamGeoRuntime.load(cfg.manifest,{navigation:true,rendering:true,routesUrl:cfg.routes,onProgress:p=>{const phase=p.runtimePhase||p.phase;if(window.__lastPhase!==phase){window.__lastPhase=phase;window.parentRouteProgress({stage:phase,loaded:p.loaded,ms:performance.now()-started});}}});
      const readyMs=performance.now()-started;
      const loadMaxHeartbeatGapMs=Math.max(0,...beats);
      const named=[];
      for(const pair of cfg.pairs) for(const reverse of [false,true]) {
        const from=reverse?pair[1]:pair[0], to=reverse?pair[0]:pair[1], mode=pair[2]||'walk';
        window.parentRouteProgress({stage:"named-query",from,to,mode});
        const begin=performance.now();
        const result=await runtime.routes.route(from,to,{mode,radius:.4,maxNodes:250000});
        named.push({from,to,mode,elapsedMs:performance.now()-begin,result});
      }
      // The accepted City candidate sends coordinate objects, including at venue anchors.
      // Bound this independent witness explicitly; do not let another parent check run indefinitely.
      const coordinates=[];
      for(const [from,to] of [['pub','lotte'],['lotte','pub']]) {
        const controller=new AbortController();let abortAt=null;
        const begin=performance.now();
        const timer=setTimeout(()=>{abortAt=performance.now();controller.abort();},750);
        let result;
        try {result={resolved:true,route:await runtime.routes.route({...cfg.anchors[from]},{...cfg.anchors[to]},
          {mode:'walk',radius:.4,maxNodes:250000,signal:controller.signal})};}
        catch(e){result={resolved:false,name:e.name,error:String(e)};}
        finally {clearTimeout(timer);}
        coordinates.push({from,to,...result,elapsedMs:performance.now()-begin,
          abortTriggered:abortAt!==null,abortToSettledMs:abortAt===null?null:performance.now()-abortAt});
      }
      const controller=new AbortController();controller.abort();let preAbort;
      try{await runtime.routes.route('pub','lotte',{mode:'walk',radius:.4,signal:controller.signal});preAbort={rejected:false};}
      catch(e){preAbort={rejected:true,name:e.name};}
      return {readyMs,loadMaxHeartbeatGapMs,named,coordinates,preAbort,stats:runtime.stats,
        namedAllUnder100ms:named.every(q=>q.result.found&&q.elapsedMs<100),
        coordinateAllUnder100ms:coordinates.every(q=>q.resolved&&q.route.found&&q.elapsedMs<100),
        queryBoundMs:750,metric:'actual original runtime, same source/graph; parent controls timeouts only'};
    } finally {clearInterval(beat);if(runtime)runtime.dispose();}
  },cfg);
  let timer;
  try {return await Promise.race([pending.then(result=>({parentTimedOut:false,result,progress})),new Promise(resolve=>{timer=setTimeout(()=>resolve({parentTimedOut:true,parentLimitMs:60000,progress,lastBeatAgeMs:lastBeatAt===null?null:Date.now()-lastBeatAt}),60000);})]);}
  finally {clearTimeout(timer);}
}
