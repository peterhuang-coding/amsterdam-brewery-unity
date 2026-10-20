async (page) => {
  const cfg = {"page": "http://127.0.0.1:18866/parent.html", "manifest": "http://127.0.0.1:18866/raw/manifest.json", "routes": "http://127.0.0.1:18866/code/full-routes.json", "anchors": {"pub": {"x": 1100.211, "y": 3243.117, "featureId": "wegdeel:b5910e46-8d27-5ba7-982d-41b311e24e21", "basis": "Egelantiersgracht, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "market": {"x": 1930.884, "y": 5497.996, "featureId": "wegdeel:10c3b1e8-8cab-5e25-aced-07c5e975d08b", "basis": "Albert Cuypstraat, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "coffee": {"x": 1890.585, "y": 5451.035, "featureId": "wegdeel:523cd265-0270-5555-a739-b8e1cc451754", "basis": "Gerard Douplein, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "flowers": {"x": 1787.339, "y": 5870.28, "featureId": "wegdeel:f643a552-96d1-5d10-8fca-ef33e6298948", "basis": "Ferdinand Bolstraat, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "lab": {"x": 6158.236, "y": 5450.173, "featureId": "wegdeel:035ca0a8-9093-53f7-9be3-2c9adb5942fb", "basis": "Science Park, Amsterdam", "fictionalVenue": true, "presentInSource": true}, "lotte": {"x": 1056.057, "y": 3247.41, "featureId": "overbruggingsdeel:8b1d9302-4306-51af-ae31-9b60532e81c5", "basis": "Actual BGT bridge deck near fictional pub; not a real named business", "fictionalVenue": true, "presentInSource": true}, "ferrySouth": {"x": 2336.407, "y": 2714.803, "featureId": "wegdeel:c163c06b-1650-5bb9-979c-321aabee488e", "basis": "Game boarding anchor near official street end; not surveyed GVB platform coordinates", "fictionalVenue": false, "presentInSource": true}, "ferryNorth": {"x": 2590.929, "y": 2528.07, "featureId": "wegdeel:62cc967a-355f-5d50-ae7e-1bacb568682b", "basis": "Game boarding anchor near official street end; not surveyed GVB platform coordinates", "fictionalVenue": false, "presentInSource": true}, "flowerCart": {"x": 1798.234, "y": 5870.4, "featureId": "wegdeel:1bb60ca7-c898-5d95-b717-2cbeb8b099d8", "basis": "Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address", "fictionalVenue": true, "presentInSource": true}, "garden": {"x": 1810.35, "y": 5801.567, "featureId": "wegdeel:e507c0ca-c183-5739-98f3-be834a5b3e67", "basis": "Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address", "fictionalVenue": true, "presentInSource": true}}, "pairs": [["pub", "lotte", "walk"], ["pub", "coffee", "walk"], ["coffee", "market", "walk"], ["market", "flowers", "walk"], ["market", "flowers", "bike"], ["flowers", "flowerCart", "walk"], ["flowers", "garden", "walk"], ["flowers", "garden", "bike"], ["flowerCart", "garden", "walk"]]};
  await page.goto(cfg.page);
  return page.evaluate(async cfg => {
    const beats = [];
    let last = performance.now();
    const beat = setInterval(() => { const now=performance.now(); beats.push(now-last); last=now; },20);
    const started=performance.now();
    let runtime;
    try {
      runtime=await AmsterdamGeoRuntime.load(cfg.manifest,{navigation:true,rendering:true,routesUrl:cfg.routes});
      const readyMs=performance.now()-started;
      const loadMaxHeartbeatGapMs=Math.max(0,...beats);
      const named=[];
      for(const pair of cfg.pairs) for(const reverse of [false,true]) {
        const from=reverse?pair[1]:pair[0], to=reverse?pair[0]:pair[1], mode=pair[2]||'walk';
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
}
