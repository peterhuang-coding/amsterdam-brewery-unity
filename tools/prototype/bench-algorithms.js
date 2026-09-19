'use strict';
const fs=require('node:fs'),process=require('node:process');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');
const LIMITS=Object.freeze({actions:200,actionSteps:2000,totalSteps:20000,dts:[.025,.05,.1],workloadVersion:1,warmup:2,samples:7});
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const isInt=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
const num=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const fail=(code,message,extra={})=>({ok:false,status:'failure',failure:Object.freeze({code,message,...extra})});
function finiteState(r){
  if(!isObj(r)||!Array.isArray(r.items)||!Array.isArray(r.bag))return false;
  let bad=false,count=0;
  const walk=(v,d,k='')=>{
    if(bad||count++>10000)return;
    if(typeof v==='number'){if(!Number.isFinite(v))bad=true;return;}
    if(Array.isArray(v)){if(d>10)return;for(let i=0;i<v.length&&i<500;i++)walk(v[i],d+1,k+'['+i+']');return;}
    if(isObj(v)){if(d>8)return;for(const q of Object.keys(v).slice(0,80))walk(v[q],d+1,k+'.'+q);}
  };
  walk(r,0);
  return !bad&&r.items.every((i,n)=>i&&i.id==='item'+n&&r.bag.includes(i.id)===(i.state==='bag'))&&
    new Set(r.bag).size===r.bag.length&&r.bag.every(id=>r.items.some(i=>i.id===id))&&
    B.load(r)<=B.KITS[r.kit].capacity;
}
function boundedAim(a){
  if(a===undefined||a===null)return {};
  if(!isObj(a))return null;
  const out={};
  for(const k of ['x','y','x2','y2'])if(a[k]!==undefined){if(!num(a[k],-1e4,1e4))return null;out[k]=a[k];}
  if(a.itemId!==undefined){if(typeof a.itemId!=='string'||a.itemId.length<1||a.itemId.length>80)return null;out.itemId=a.itemId;}
  return out;
}
function validateTranscript(t){
  if(!isObj(t)||t.version!==1||!isObj(t.initial))return fail('malformed','transcript must be {version:1,initial,actions}');
  const initial=t.initial;
  if(!isInt(initial.seed,0,4294967295)||!isInt(initial.day,1,3)||!Object.hasOwn(B.KITS,initial.kit))return fail('malformed','bad initial seed/day/kit');
  if(!Array.isArray(t.actions)||t.actions.length>LIMITS.actions)return fail('malformed','actions missing or >200');
  let total=0;
  for(let i=0;i<t.actions.length;i++){
    const a=t.actions[i],at='actions['+i+']';
    if(!isObj(a))return fail('malformed','bad action',{at});
    if(!['choose','auto','command','step','restore'].includes(a.type))return fail('malformed','bad action type',{at});
    if(a.type==='choose'){
      if(typeof a.id!=='string'||![...a.id].length||[...a.id].length>80)return fail('malformed','bad choose id',{at});
    }else if(a.type==='command'){
      if(!['collect','repair','bail','dash','drag','lure','drop','interact','hook','foam'].includes(a.verb))return fail('malformed','bad command verb',{at});
      if(boundedAim(a.aim)===null)return fail('malformed','bad command aim',{at});
    }else if(a.type==='restore'){
      if(Object.keys(a).some(k=>!['type'].includes(k)))return fail('malformed','restore has fields',{at});
    }else{
      if(!isInt(a.steps,0,LIMITS.actionSteps)||!LIMITS.dts.includes(a.dt))return fail('malformed','steps/dt out of range',{at});
      if(a.type==='step'){
        if(a.input!==undefined&&!isObj(a.input))return fail('malformed','step input must be object',{at});
        for(const k of ['dx','dy'])if(a.input?.[k]!==undefined&&!num(a.input[k],-1,1))return fail('malformed','bad manual vector',{at});
        if(boundedAim(a.input?.aim)===null)return fail('malformed','bad manual aim',{at});
      }
      total+=a.steps;
    }
  }
  if(total>LIMITS.totalSteps)return fail('malformed','total steps >20000');
  return {ok:true};
}
function checksum(r,n=0){
  let h=2166136261;
  const q=x=>{x=String(x);for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}};
  const p=r?.p||{};
  q([r?.time,r?.status,p.x,p.y,p.hp,r?.hits,r?.bag?.length,r?.parcel,r?.district?.belt,r?.district?.irrigation,r?.discovered?.join('|'),r?.sequence].join('|'));
  for(const id of ['item0','item2','item3','item6','item9','item10','item11','item12']){const i=r?.items?.find(x=>x.id===id);if(i)q(i.state+':'+i.x.toFixed(2)+':'+i.y.toFixed(2));}
  q('n'+n);return (h>>>0).toString(16).padStart(8,'0');
}
function signature(x){return x.ok?'ok':x.failure.code+':'+(x.failure.invariant||x.failure.code);}
function replay(transcript){
  const v=validateTranscript(transcript);
  if(!v.ok)return v;
  let r;
  try{r=B.create(transcript.initial.seed,transcript.initial.day,transcript.initial.kit);A.enable(r);}
  catch(e){return fail('start-failed',String(e&&e.message||e));}
  const events=[];let goal='',event='route',autoMode=true,ticks=0,restores=0;
  const details=at=>({seed:r.seed,day:r.day,kit:r.kit,at,action:transcript.actions[at]?.type||null,step:ticks,lastGoal:goal});
  const healthy=(at,invariant)=>{
    if(typeof r.time!=='number'||!Number.isFinite(r.time)||!Number.isFinite(r.p.x)||!Number.isFinite(r.p.y))return fail('invariant','non-finite player state',{...details(at),invariant:invariant||'finite-player'});
    if(!finiteState(r))return fail('invariant','finite/ownership/capacity invariant',{...details(at),invariant:invariant||'state-shape'});
    if(B.restore(r)===null)return fail('invariant','B.restore rejects live state',{...details(at),invariant:'restorable'});
    if(!A.valid(r))return fail('assertion','A.valid rejects automatic state',{...details(at),invariant:'auto-valid'});
    return null;
  };
  for(let at=0;at<transcript.actions.length;at++){
    const a=transcript.actions[at];
    try{
      if(a.type==='choose'){
        if(!autoMode||!r.auto?.enabled||!r.auto.event)return fail('assertion','choice unavailable',{...details(at),id:a.id,event:r.auto?.event||null,invariant:'choose-available'});
        if(!A.choose(r,a.id))return fail('assertion','choice rejected',{...details(at),id:a.id,event:r.auto.event,invariant:'choose-accepted'});
        events.push({kind:'choose',at,id:a.id,event:r.auto.event});
      }else if(a.type==='command'){
        if(autoMode){A.disable(r);autoMode=false;}
        const aim=boundedAim(a.aim)||{};
        const before=checksum(r,ticks),ok=B.command(r,a.verb,aim);
        events.push({kind:'command',at,verb:a.verb,accepted:Boolean(ok),result:ok});
        if(ok===undefined)return fail('malformed','unknown command verb rejected before simulation',{...details(at),verb:a.verb,invariant:'command-verbs'});
        if(ok===false){goal=r.auto?.goal||'';event=r.auto?.event||null;const bad=healthy(at,'manual-command-false');if(bad)return bad;continue;}
        if(before===checksum(r,ticks)){/* cooldown/unavailable commands can legally return false; accepted command may still only alter timers */}
      }else if(a.type==='step'){
        if(autoMode){A.disable(r);autoMode=false;}
        const input={...(a.input||{})};
        if(input.dx!==undefined)input.dx=Math.max(-1,Math.min(1,input.dx));
        if(input.dy!==undefined)input.dy=Math.max(-1,Math.min(1,input.dy));
        for(let i=0;i<a.steps;i++){
          B.step(r,input,a.dt);
          ticks++;
          goal=r.auto?.goal||'';event=r.auto?.event||null;
          const bad=healthy(at,'manual-step');if(bad)return bad;
          if(r.status!=='active')break;
        }
        events.push({kind:'step',at,steps:a.steps,dt:a.dt});
      }else if(a.type==='auto'){
        if(!autoMode)return fail('assertion','auto step while manual mode',{...details(at),invariant:'mode'});
        for(let i=0;i<a.steps;i++){
          A.step(r,a.dt);ticks++;
          goal=r.auto?.goal||'';event=r.auto?.event||null;
          const bad=healthy(at,'auto-step');if(bad)return bad;
          if(r.status!=='active'||r.auto.event)break;
        }
        events.push({kind:'auto',at,steps:a.steps,dt:a.dt,event:r.auto.event,goal:r.auto.goal});
      }else if(a.type==='restore'){
        const saved=B.restore(r);
        if(saved===null)return fail('invariant','B.restore rejected snapshot',{...details(at),invariant:'restorable'});
        r=saved;
        if(r.auto===undefined){A.enable(r);autoMode=true;}
        else autoMode=Boolean(r.auto.enabled);
        restores++;events.push({kind:'restore',at,autoMode});
      }
      goal=r.auto?.goal||'';event=r.auto?.event||null;
      const bad=healthy(at);if(bad)return bad;
      if(r.auto?.event==='stuck')return fail('assertion','autopilot stuck',{...details(at),goal:r.auto.goal,invariant:'not-stuck'});
    }catch(e){return fail('exception',String(e&&e.message||e),{...details(at),invariant:'no-exception'});}
  }
  const rewards=B.rewards(r);
  return {ok:true,status:r.status,seed:r.seed,actions:transcript.actions.length,time:r.time,goal,event:r.auto?.event||null,checksum:checksum(r,ticks),ticks,restores,rewards,events,state:r};
}
function advanceAuto(r,steps){for(let n=0;n<steps&&r.status==='active'&&r.auto.enabled&&!r.auto.event;n++)A.step(r,.05);}
function route(choices){
  const t={version:1,initial:{seed:42,day:1,kit:'hook'},actions:[]};
  const r=B.create(42,1,'hook');A.enable(r);
  const choose=id=>{
    if(!A.choose(r,id))throw new Error('corpus choice unavailable: '+id);
    t.actions.push({type:'choose',id});
  };
  const drive=()=>{
    t.actions.push({type:'auto',steps:1000,dt:.05});
    advanceAuto(r,1000);
  };
  for(const id of choices){
    choose(id);drive();
    while(r.status==='active'&&r.auto.event==='glimpse'){choose('continue');drive();}
  }
  return t;
}
function defaultCorpus(){
  return [
    ['exit',route(['exit'])],
    ['sorting-stop-exit',route(['sorting','sorting-stop','exit'])],
    ['sorting-take-exit',route(['sorting','sorting-take','exit'])],
    ['garden-valve-harvest',route(['garden','open-hook','garden-valve','garden-harvest','exit'])],
    ['market',route(['market','exit'])],
    ['noor',route(['noor','exit'])]
  ].map(([name,t])=>({name,t}));
}
function pct(a,p){return a[Math.min(a.length-1,Math.floor(a.length*p))];}
function benchmark(corpus=defaultCorpus(),samples=LIMITS.samples){
  const correctness=corpus.map(c=>{
    const a=replay(c.t),b=replay(c.t);
    return {name:c.name,ok:a.ok&&b.ok&&a.checksum===b.checksum,status:a.status,checksum:a.checksum,checksum2:b.checksum,event:a.event,time:a.time,failure:a.failure||b.failure||null};
  });
  if(correctness.some(x=>!x.ok))return {ok:false,workloadVersion:LIMITS.workloadVersion,platform:{platform:process.platform,arch:process.arch,node:process.version},warmup:LIMITS.warmup,samples,correctness,performance:[]};
  for(let i=0;i<LIMITS.warmup;i++)for(const c of corpus){const x=replay(c.t);if(!x.ok||x.checksum!==correctness.find(z=>z.name===c.name).checksum)return {ok:false,workloadVersion:LIMITS.workloadVersion,correctness,performance:[]};}
  const rows=[];
  for(const c of corpus){
    const ms=[];
    for(let i=0;i<samples;i++){const s=process.hrtime.bigint(),x=replay(c.t),e=process.hrtime.bigint();if(!x.ok||x.checksum!==correctness.find(z=>z.name===c.name).checksum)return {ok:false,workloadVersion:LIMITS.workloadVersion,correctness,performance:[]};ms.push(Number(e-s)/1e6);}
    ms.sort((a,b)=>a-b);
    rows.push({name:c.name,samples:ms.map(x=>Number(x.toFixed(3))),median:Number(pct(ms,.5).toFixed(3)),p95:Number(pct(ms,.95).toFixed(3)),checksum:correctness.find(z=>z.name===c.name).checksum,checksumConsistent:true});
  }
  return {ok:true,workloadVersion:LIMITS.workloadVersion,platform:{platform:process.platform,arch:process.arch,node:process.version},warmup:LIMITS.warmup,samples,correctness,performance:rows};
}
function reduceTranscript(input,budget=100){
  budget=Number.isInteger(budget)?Math.max(1,Math.min(100,budget)):100;
  const v=validateTranscript(input);
  if(!v.ok)return {ok:false,reason:'malformed input will not be reduced',failure:v.failure,result:null,replays:0};
  const base=replay(input),replays={n:1};
  if(base.ok)return {ok:false,reason:'reference replay does not fail',result:null,replays:replays.n};
  const want=signature(base),actions=input.actions.slice();
  const same=()=>{if(replays.n>=budget)return null;replays.n++;const x=replay({...input,actions});return !x.ok&&signature(x)===want;};
  for(let pass=0;pass<3&&replays.n<budget;pass++){
    let changed=false;
    for(let i=0;i<actions.length&&replays.n<budget;){
      const old=actions[i];actions.splice(i,1);let ok=same();
      if(ok===null){actions.splice(i,0,old);break;}
      if(ok){changed=true;continue;}
      actions.splice(i,0,old);
      if((old.type==='auto'||old.type==='step')&&old.steps>1&&replays.n<budget){
        const half=Math.floor(old.steps/2);actions[i]={...old,steps:half};replays.n++;
        if(signature(replay({...input,actions}))===want){changed=true;i++;continue;}
        actions[i]=old;
      }
      i++;
    }
    if(!changed)break;
  }
  return {ok:true,result:{version:1,initial:input.initial,actions},replays:replays.n,signature:want,reference:base.failure};
}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function cli(argv){
  const [mode,file]=argv;
  if(mode==='--replay'){
    let t;try{t=readJson(file);}catch(e){console.log(JSON.stringify({ok:false,failure:{code:'io',message:String(e.message)}}));return 2;}
    const r=replay(t),out=(({seed,actions,time,status,goal,event,checksum,failure,rewards,ticks,restores})=>({seed,actions,time,status,goal,event,checksum,failure,rewards,ticks,restores}))(r);
    console.log(JSON.stringify(out,null,2));return r.ok?0:1;
  }
  if(mode==='--bench'){const r=benchmark();console.log(JSON.stringify(r,null,2));return r.ok?0:1;}
  if(mode==='--reduce'){
    let t;try{t=readJson(file);}catch(e){console.error(JSON.stringify({ok:false,failure:{code:'io',message:e.message}}));return 2;}
    const r=reduceTranscript(t);
    if(!r.ok){console.error(JSON.stringify(r));return 2;}
    process.stdout.write(JSON.stringify(r.result,null,2));console.error(JSON.stringify({replays:r.replays,signature:r.signature}));return 0;
  }
  console.error('Usage: bench-algorithms.js --replay file | --bench | --reduce file');return 2;
}
module.exports={validate:validateTranscript,replay,reduce:reduceTranscript,benchmark,defaultCorpus,checksum};
if(require.main===module)process.exitCode=cli(process.argv.slice(2));