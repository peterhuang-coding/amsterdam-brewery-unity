async (page) => {
  const cfg={"page": "http://127.0.0.1:18866/parent.html", "manifest": "http://127.0.0.1:18866/raw/manifest.json", "routes": "http://127.0.0.1:18866/code/full-routes.json", "anchors": {"pub": {"x": 1100.211, "y": 3243.117, "featureId": "wegdeel:b5910e46-8d27-5ba7-982d-41b311e24e21", "basis": "Egelantiersgracht, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "market": {"x": 1930.884, "y": 5497.996, "featureId": "wegdeel:10c3b1e8-8cab-5e25-aced-07c5e975d08b", "basis": "Albert Cuypstraat, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "coffee": {"x": 1890.585, "y": 5451.035, "featureId": "wegdeel:523cd265-0270-5555-a739-b8e1cc451754", "basis": "Gerard Douplein, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "flowers": {"x": 1787.339, "y": 5870.28, "featureId": "wegdeel:f643a552-96d1-5d10-8fca-ef33e6298948", "basis": "Ferdinand Bolstraat, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "lab": {"x": 6158.236, "y": 5450.173, "featureId": "wegdeel:035ca0a8-9093-53f7-9be3-2c9adb5942fb", "basis": "Science Park, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "lotte": {"x": 1056.057, "y": 3247.41, "featureId": "overbruggingsdeel:8b1d9302-4306-51af-ae31-9b60532e81c5", "basis": "Actual BGT bridge deck near fictional pub; not a real named business", "fictionalVenue": true, "presentInSource": true}, "ferrySouth": {"x": 2336.407, "y": 2714.803, "featureId": "wegdeel:c163c06b-1650-5bb9-979c-321aabee488e", "basis": "Game boarding anchor near official street end; not surveyed GVB platform coordinates", "fictionalVenue": false, "presentInSource": true}, "ferryNorth": {"x": 2590.929, "y": 2528.07, "featureId": "wegdeel:62cc967a-355f-5d50-ae7e-1bacb568682b", "basis": "Game boarding anchor near official street end; not surveyed GVB platform coordinates", "fictionalVenue": false, "presentInSource": true}, "flowerCart": {"x": 1798.234, "y": 5870.4, "featureId": "wegdeel:1bb60ca7-c898-5d95-b717-2cbeb8b099d8", "basis": "Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address", "fictionalVenue": true, "presentInSource": true}, "garden": {"x": 1810.35, "y": 5801.567, "featureId": "wegdeel:e507c0ca-c183-5739-98f3-be834a5b3e67", "basis": "Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address", "fictionalVenue": true, "presentInSource": true}}, "pairs": [["pub", "lotte", "walk"], ["pub", "coffee", "walk"], ["coffee", "market", "walk"], ["market", "flowers", "walk"], ["market", "flowers", "bike"], ["flowers", "flowerCart", "walk"], ["flowers", "garden", "walk"], ["flowers", "garden", "bike"], ["flowerCart", "garden", "walk"]]};
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
          const result=await runtime.routes.route(from,to,{mode:pair[2]||'walk',radius:.4,maxNodes:250000});
          const first=result.points[0],last=result.points[result.points.length-1];
          queryResults.push({from:reverse?pair[1]:pair[0],to:reverse?pair[0]:pair[1],
            mode:pair[2]||'walk',elapsedMs:performance.now()-started,result,
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
