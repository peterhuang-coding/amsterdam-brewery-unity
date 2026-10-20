async (page) => {
  const cfg = {"page": "http://127.0.0.1:18866/parent.html", "raw": "http://127.0.0.1:18866/raw/manifest.json?test=1#fragment", "encoded": "http://127.0.0.1:18866/encoded/manifest.json?test=2#fragment", "missing": "http://127.0.0.1:18866/raw/does-not-exist.json"};
  await page.goto(cfg.page);
  const cdp = await page.context().newCDPSession(page);
  const cases = [];
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  async function memory() {
    await cdp.send('HeapProfiler.collectGarbage');
    return cdp.send('Runtime.getHeapUsage');
  }
  const baseline = await memory();
  try {
    for (const spec of [
      {name:'pre-aborted', abort:'before'},
      {name:'download-cap', options:{maxDownloadBytes:1}},
      {name:'missing-manifest', missing:true},
      {name:'fetch-abort', abort:'fetch-chunks'},
      {name:'navigation-index-abort', abort:'index-navigation'},
      {name:'render-index-abort', abort:'index-rendering'}
    ]) {
      const result = await page.evaluate(async ({cfg,spec}) => {
        const controller = new AbortController();
        const phases = new Set();
        let abortAt = null, runtime = null;
        const abort = () => { if(abortAt === null) {abortAt=performance.now();controller.abort();} };
        if(spec.abort === 'before') abort();
        const started = performance.now();
        let outcome;
        try {
          runtime = await AmsterdamGeoRuntime.load(spec.missing ? cfg.missing : cfg.raw, {
            navigation:true, rendering:true, maxRetries:0, ...spec.options,
            signal:controller.signal,
            onProgress:p=>{
              phases.add(p.runtimePhase || p.phase);
              if(spec.abort && spec.abort !== 'before' &&
                 (p.phase===spec.abort || p.runtimePhase===spec.abort) && p.loaded>0) abort();
            }
          });
          outcome={resolved:true};
        } catch(e) { outcome={resolved:false,error:String(e),errorName:e.name}; }
        finally {if(runtime) runtime.dispose();}
        return {...outcome,elapsedMs:performance.now()-started,
          abortTriggered:abortAt!==null,abortToRejectionMs:abortAt===null?null:performance.now()-abortAt,
          phases:[...phases]};
      },{cfg,spec});
      const expectedError = spec.abort ? 'AbortError' : spec.missing ? 'HttpError' : 'CapExceededError';
      const pass = !result.resolved && result.errorName===expectedError &&
        (!spec.abort || result.abortTriggered && result.abortToRejectionMs<250);
      cases.push({name:spec.name,pass,...result,afterGC:await memory()});
    }
    // Successful retry uses actual browser-decoded Content-Encoding gzip,
    // after several failed/aborted loads. No replacement fetch implementation.
    const retry = await page.evaluate(async cfg => {
      const t=performance.now();let runtime;
      try {
        runtime=await AmsterdamGeoRuntime.load(cfg.encoded,{navigation:true,rendering:true});
        const roads=runtime.data.layers.roads;
        const witnesses=[
          ['wegdeel:057a343d-bcfd-5920-b8ea-ea44abc38ab7',1395],
          ['wegdeel:9339d9fa-0a86-5458-b0da-b7ff026b4e51',463]
        ].map(([id,vertex])=>{
          const f=roads.find(f=>f.id===id);
          return {id,found:!!f,negativeZero:!!f && Object.is(f.polygons[0][0][vertex][0],-0)};
        });
        return {loaded:true,elapsedMs:performance.now()-t,counts:Object.fromEntries(Object.entries(runtime.data.layers).map(([k,v])=>[k,v.length])),witnesses,stats:runtime.stats};
      } catch(e) {return {loaded:false,elapsedMs:performance.now()-t,error:String(e),errorName:e.name};}
      finally {if(runtime){runtime.dispose();runtime.dispose();}}
    },cfg);
    cases.push({name:'encoded-retry-and-idempotent-dispose',pass:retry.loaded && retry.witnesses.every(w=>w.negativeZero),...retry,afterGC:await memory()});
    return {baseline,cases,errors,allPassed:cases.every(c=>c.pass)&&errors.length===0,
      metric:'sampled isolate heap/backing after GC; not peak RSS'};
  } finally {await cdp.detach();}
}
