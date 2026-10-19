async (page) => {
  const cfg=CONFIG;
  await page.goto(cfg.page);
  return page.evaluate(async cfg=>{
    const runtime=await AmsterdamGeoRuntime.load(cfg.manifest,{
      navigation:true,rendering:true,routesUrl:cfg.routes
    });
    const queryResults=[];
    try {
      for(const pair of cfg.pairs) {
        for(const reverse of [false,true]) {
          const from=cfg.anchors[reverse?pair[1]:pair[0]],to=cfg.anchors[reverse?pair[0]:pair[1]];
          const started=performance.now();
          const result=await runtime.routes.route(from,to,{mode:'walk',radius:.4,maxNodes:250000});
          const first=result.points[0],last=result.points[result.points.length-1];
          queryResults.push({from:reverse?pair[1]:pair[0],to:reverse?pair[0]:pair[1],
            elapsedMs:performance.now()-started,result,
            endpointsExact:!!first&&!!last&&first.x===from.x&&first.y===from.y&&last.x===to.x&&last.y===to.y});
        }
      }
      const pre=new AbortController();pre.abort();let preAbort;
      try {await runtime.routes.route(cfg.anchors.pub,cfg.anchors.lotte,{mode:'walk',radius:.4,signal:pre.signal});preAbort={rejected:false};}
      catch(e){preAbort={rejected:true,name:e.name,message:e.message};}
      const cancel=new AbortController();let abortAt=null,last=performance.now(),maxGap=0;
      const beat=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;},20);
      const timer=setTimeout(()=>{abortAt=performance.now();cancel.abort();},50);
      let uncached;
      try {
        const result=await runtime.navigator.routeAsync(cfg.anchors.pub,cfg.anchors.ferrySouth,
          {mode:'walk',radius:.4,maxNodes:250000,signal:cancel.signal});
        uncached={rejected:false,reason:result.reason,found:result.found};
      } catch(e) {uncached={rejected:true,name:e.name,message:e.message};}
      finally {clearTimeout(timer);await new Promise(r=>setTimeout(r,25));clearInterval(beat);}
      uncached.abortTriggered=abortAt!==null;
      uncached.abortToSettledMs=abortAt===null?null:performance.now()-abortAt;
      uncached.maxHeartbeatGapMs=maxGap;
      return {queryResults,preAbort,uncached,
        allCachedPassed:queryResults.every(q=>q.result.found&&q.endpointsExact&&q.elapsedMs<100),
        stats:runtime.stats,navigatorStats:runtime.navigator.stats()};
    } finally {runtime.dispose();}
  },cfg);
}
