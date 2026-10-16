from pathlib import Path
import subprocess,json,sys,time
r=Path(__file__).parent
case=sys.argv[1];settings={'default128':('/full/runtime.json.gz?check=r2',None),'explicit192':('/full/runtime.json.gz?check=r2',192),'raw512':('/full/runtime.json.gz?check=r2#raw',512),'encoded512':('/encoded-full.json?check=r2',512)}
url,cap=settings[case];cfg=json.dumps({'case':case,'url':url,'cap':cap})
code='''async (page) => {await page.goto('http://127.0.0.1:18863/parent.html');return await page.evaluate(async (cfg)=>{let last=performance.now(),gaps=[],longTasks=[];const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},20);let ob;try{ob=new PerformanceObserver(list=>{for(const x of list.getEntries())longTasks.push(x.duration)});ob.observe({entryTypes:['longtask']});}catch(e){}const t=performance.now();let result={case:cfg.case,url:cfg.url,capMiB:cfg.cap};try{let d=await AmsterdamGeoLoader.load(cfg.url,cfg.cap?{maxDecodedBytes:cfg.cap*1024*1024}:{});result.loaded=true;result.counts=Object.fromEntries(Object.entries(d.layers).map(([k,v])=>[k,v.length]));result.complete=d.source.complete;result.limitations=d.source.limitations;}catch(e){result.loaded=false;result.error=e.message;}result.ms=performance.now()-t;await new Promise(r=>setTimeout(r,30));clearInterval(timer);if(ob)ob.disconnect();result.maxObservedEventLoopGapMs=Math.max(0,...gaps);result.observedLongTasksMs=longTasks;result.heap=performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null;result.resources=performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize}));document.querySelector('#results').textContent=JSON.stringify(result,null,2);return result;},CFG);}'''.replace('CFG',cfg)
(r/f'browser-{case}.js').write_text(code)
p=subprocess.run(['bash','/Users/peter_mini/.codex/skills/playwright/scripts/playwright_cli.sh','--session','amsterdam-d26-pack-r2','run-code',code],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
(r/f'browser-{case}.log').write_text(p.stdout)
if '### Result\n' in p.stdout:
 data=json.loads(p.stdout.split('### Result\n',1)[1].split('\n###',1)[0]);(r/f'browser-{case}.json').write_text(json.dumps(data,indent=2));print(json.dumps(data,ensure_ascii=False))
else:print(p.stdout)
print('cli_exit',p.returncode)
