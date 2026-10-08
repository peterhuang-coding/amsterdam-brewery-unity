'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reopening-core.js'),B=require('./backstage-core.js'),A=require('./backstage-auto.js');

function act(s,a){
  const before=JSON.stringify(s);
  const r=R.act(s,a);
  assert.equal(JSON.stringify(s),before,'act must not mutate its input');
  assert.ok(r.ok,(r.message||'')+' :: '+JSON.stringify(a));
  assert.ok(R.restore(r.state),'result must stay a valid save after '+a.type);
  return r.state;
}
function reject(s,a){
  const before=JSON.stringify(s);
  const r=R.act(s,a);
  assert.equal(r.ok,false,'action must be rejected: '+JSON.stringify(a));
  assert.equal(r.state,s,'rejection returns the original object');
  assert.equal(JSON.stringify(s),before);
  assert.equal(typeof r.message,'string');assert.ok(r.message.length);
}
const start=(seed=42)=>act(R.createGame(seed),{type:'start'});
const closeNight=s=>act(act(s,{type:'open'}),{type:'close'});
function walkTo(run,to){
  for(let n=0;n<8000&&Math.hypot(to.x-run.p.x,to.y-run.p.y)>6;n++){
    const d=Math.hypot(to.x-run.p.x,to.y-run.p.y);
    B.step(run,{dx:(to.x-run.p.x)/d,dy:(to.y-run.p.y)/d},.025);
  }
  assert.ok(Math.hypot(to.x-run.p.x,to.y-run.p.y)<8,JSON.stringify({p:run.p,to}));
}
function autoIdle(run){
  for(let n=0;n<30000&&run.status==='active'&&!run.auto.event;n++)A.step(run,.05);
}
function autoPick(run,id){
  if(!run.auto)A.enable(run);
  assert.ok(A.choose(run,id),'choice available: '+id);
  autoIdle(run);
  assert.notEqual(run.auto.event,'stuck',JSON.stringify({p:run.p,time:run.time}));
}
function night(s,fn,mode){
  s=act(s,{type:'explore',kit:'hook',mode});
  fn(s.backstage.run);
  return act(s,{type:'returnExplore'});
}
function forceRescue(run){
  while(run.status==='active')B.step(run,{},.1);
  assert.equal(run.status,'rescued');
}
const ENTRY_KEYS=['day','condition','approach','delivered','stockTaken','powerRestored','safe','claimed'];
const entry=(s,day)=>s.market.history.find(e=>e.day===day);
function summaryAt(day){
  let s=start();
  for(let d=1;d<day;d++){s=closeNight(s);s=act(s,{type:'next'});}
  return closeNight(s);
}

test('new after-hours runs opt into marketShift; seed42 gives staffed/restock/blackout',()=>{
  for(const [day,expected] of [[1,'staffed'],[2,'restock'],[3,'blackout']]){
    let s=summaryAt(day);
    s=act(s,{type:'explore',kit:'hook'});
    const run=s.backstage.run;
    assert.equal(run.marketShift.version,1);
    assert.equal(run.marketShift.condition,expected);
    assert.deepEqual(run.marketShift,{version:1,condition:expected,approach:null,delivered:false,stockTaken:false,powerItem:null});
    B.command(run,'bail');
    s=act(s,{type:'returnExplore'});
    assert.deepEqual(s.market.history,[],'nothing was done, no history entry');
  }
  // Direct B.create remains strict opt-in.
  assert.equal(Object.hasOwn(B.create(42,1),'marketShift'),false);
});

test('R.marketInfo exposes the stable contract reflecting real state',()=>{
  const s=start();
  const info=R.marketInfo(s);
  for(const key of ['condition','label','clue','price','receipt','canClaim','reason'])
    assert.ok(Object.hasOwn(info,key),key);
  assert.equal(info.condition,'staffed');assert.equal(info.price,8);
  assert.equal(info.receipt,'none');assert.equal(info.canClaim,false);
  assert.ok(info.label.length>2&&info.clue.length>8);
  assert.match(info.clue,/235|清扫/);
});

test('complete automatic trade route really delivers the barrel and extracts',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    autoPick(run,'market');
    autoPick(run,'mkt-trade');
    assert.equal(run.marketShift.approach,'trade');
    assert.equal(run.marketShift.delivered,true);
    assert.equal(run.items[2].state,'delivered');
    assert.equal(run.marketShift.stockTaken,false);
    autoPick(run,'exit');
    assert.equal(run.status,'extracted');
  });
  const e=entry(s,1);
  assert.ok(e);
  assert.deepEqual(Object.keys(e).sort(),ENTRY_KEYS.slice().sort());
  assert.deepEqual({condition:e.condition,approach:e.approach,delivered:e.delivered,stockTaken:e.stockTaken,powerRestored:e.powerRestored,safe:e.safe,claimed:e.claimed},
    {condition:'staffed',approach:'trade',delivered:true,stockTaken:false,powerRestored:false,safe:true,claimed:false});
  assert.ok(s.life.morning.some(n=>n.includes('明天')||n.includes('次日')));
});

test('complete manual salvage route really takes shelf stock',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    run.actors=[];
    walkTo(run,B.marketInfo(run).counter);
    walkTo(run,{x:405,y:990});
    assert.ok(run.bag.includes('item0'));
    assert.equal(run.marketShift.stockTaken,true);
    assert.equal(run.marketShift.approach,'salvage');
    walkTo(run,B.EXIT);
    assert.equal(B.command(run,'interact'),true);
    assert.equal(run.status,'extracted');
  },'manual');
  const e=entry(s,1);
  assert.equal(e.stockTaken,true);assert.equal(e.approach,'salvage');
  assert.equal(e.delivered,false);assert.equal(e.safe,true);
});

test('two economic choices diverge: trade receipt errand vs salvage next-day price',()=>{
  // Trade path: night1 -> next-day claim.
  let trade=closeNight(start());
  trade=night(trade,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  trade=act(trade,{type:'next'});
  let info=R.marketInfo(trade);
  assert.equal(info.receipt,'available');assert.equal(info.canClaim,true);
  assert.equal(info.price,8);
  const blondBefore=R.stock(trade,'blond'),hopsBefore=trade.hops;
  trade=act(trade,{type:'marketErrand'});
  assert.equal(R.stock(trade,'blond'),blondBefore+3);
  assert.equal(trade.hops,hopsBefore+1);
  assert.equal(trade.actions,1);
  const made=trade.batches.find(b=>b.id==='d2-market-errand');
  assert.deepEqual(made,{id:'d2-market-errand',beer:'blond',cups:3,quality:1,madeDay:2,aged:false});
  assert.equal(entry(trade,1).claimed,true);
  assert.equal(R.marketInfo(trade).receipt,'claimed');
  // Repeated click cannot duplicate, even after a save roundtrip.
  reject(trade,{type:'marketErrand'});
  const reloaded=R.restore(structuredClone(trade));
  reject(reloaded,{type:'marketErrand'});
  assert.equal(trade.batches.filter(b=>b.id==='d2-market-errand').length,1);

  // Salvage path: night1 stock -> day2 crate costs 10.
  let salvage=closeNight(start());
  salvage=night(salvage,run=>{
    run.actors=[];
    walkTo(run,{x:405,y:990});
    walkTo(run,B.EXIT);B.command(run,'interact');
  },'manual');
  salvage=act(salvage,{type:'next'});
  assert.equal(R.marketInfo(salvage).price,10);
  assert.equal(R.marketInfo(salvage).receipt,'none');
});

test('route chosen but not completed is recorded without entitlement',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    Object.assign(run.p,{x:405,y:1110});
    assert.equal(B.command(run,'market-trade'),true);
    B.command(run,'bail');
  },'manual');
  const e=entry(s,1);
  assert.ok(e,'route choice itself is recorded');
  assert.equal(e.approach,'trade');assert.equal(e.delivered,false);assert.equal(e.safe,false);
  s=act(s,{type:'next'});
  assert.equal(R.marketInfo(s).receipt,'none');
  reject(s,{type:'marketErrand'});
});

test('delivered barrel with rescue or bail gives no claim',()=>{
  for(const kind of ['rescued','bailed']){
    let s=closeNight(start());
    s=night(s,run=>{
      Object.assign(run.p,{x:405,y:1110});
      B.command(run,'market-trade');
      B.command(run,'collect',{itemId:'item2'});
      B.command(run,'market-deliver');
      assert.equal(run.marketShift.delivered,true);
      if(kind==='bailed')B.command(run,'bail');else forceRescue(run);
    },'manual');
    const e=entry(s,1);
    assert.equal(e.delivered,true);assert.equal(e.safe,false);
    s=act(s,{type:'next'});
    assert.equal(R.marketInfo(s).canClaim,false);
    reject(s,{type:'marketErrand'});
  }
});

test('stockTaken raises price to 10 even after rescue; route choice alone does not',()=>{
  // Take then rescue.
  let s=closeNight(start());
  s=night(s,run=>{
    run.actors=[];
    walkTo(run,{x:405,y:990});
    assert.equal(run.marketShift.stockTaken,true);
    forceRescue(run);
  },'manual');
  s=act(s,{type:'next'});
  assert.equal(R.marketInfo(s).price,10);
  // Salvage declared at counter, nothing taken, bail: price stays 8.
  let q=closeNight(start());
  q=night(q,run=>{
    Object.assign(run.p,{x:405,y:1110});
    B.command(run,'market-salvage');
    assert.equal(run.marketShift.stockTaken,false);
    B.command(run,'bail');
  },'manual');
  q=act(q,{type:'next'});
  assert.equal(R.marketInfo(q).price,8);
});

test('raised price expires after exactly one day',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    run.actors=[];walkTo(run,{x:405,y:990});walkTo(run,B.EXIT);B.command(run,'interact');
  },'manual');
  s=act(s,{type:'next'});
  assert.equal(R.marketInfo(s).price,10);
  // Skip night2 with no market participation.
  s=closeNight(s);
  s=act(s,{type:'next'});
  assert.equal(s.day,3);
  assert.equal(R.marketInfo(s).price,8);
});

test('affordability uses the dynamic price and truthful labels at 8 and 10',()=>{
  const day1=start();
  reject({...day1,cash:7},{type:'prepare',kind:'market'});
  let bought=act({...day1,cash:8},{type:'prepare',kind:'market'});
  assert.equal(bought.cash,0);
  assert.match(bought.lastMessage,/€8/);
  // Build a day2 state whose yesterday stock was really taken.
  let s=closeNight(start());
  s=night(s,run=>{
    run.actors=[];walkTo(run,{x:405,y:990});walkTo(run,B.EXIT);B.command(run,'interact');
  },'manual');
  s=act(s,{type:'next'});
  assert.equal(R.marketInfo(s).price,10);
  reject({...s,cash:9},{type:'prepare',kind:'market'});
  bought=act({...s,cash:10},{type:'prepare',kind:'market'});
  assert.equal(bought.cash,0);
  assert.match(bought.lastMessage,/€10/);
  assert.equal(R.stock(bought,'blond'),R.stock(s,'blond')+2);
  assert.equal(R.stock(bought,'stout'),R.stock(s,'stout')+1);
});

test('unclaimed receipt expires after the next day and can never be claimed',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  // Day2 available, but ignore it; close night2 without an expedition.
  s=act(s,{type:'next'});
  assert.equal(R.marketInfo(s).receipt,'available');
  s=closeNight(s);
  s=act(s,{type:'next'});
  assert.equal(s.day,3);
  assert.equal(R.marketInfo(s).receipt,'expired');
  assert.equal(R.marketInfo(s).canClaim,false);
  reject(s,{type:'marketErrand'});
});

test('marketErrand with zero actions preserves every resource',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  s=act(s,{type:'next'});
  const zero={...s,actions:0};
  zero.market=structuredClone(s.market);
  reject(zero,{type:'marketErrand'});
  assert.deepEqual(zero.batches,s.batches);
  assert.equal(zero.hops,s.hops);
  assert.equal(entry(zero,1).claimed,false);
});

test('hops at cap still grants 3 cups with a truthful full-cap message; batch cap rejects',()=>{
  let s=closeNight(start());
  s=night(s,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  s=act(s,{type:'next'});
  const capped=structuredClone(s);
  capped.hops=15;
  assert.ok(R.restore(capped));
  const result=R.act(capped,{type:'marketErrand'});
  assert.ok(result.ok,result.message);
  assert.equal(result.state.hops,15);
  assert.match(result.message,/满|15/);
  assert.equal(result.state.batches.length,s.batches.length+1);
  assert.equal(R.stock(result.state,'blond'),R.stock(s,'blond')+3);

  // Batch capacity.
  const full=structuredClone(s);
  let n=0;
  while(full.batches.length<32)full.batches.push({id:'fill-'+(n++),beer:'blond',cups:1,quality:1,madeDay:1,aged:false});
  assert.equal(R.restore(full)&&full.batches.length,32);
  reject(full,{type:'marketErrand'});
  assert.equal(full.hops,s.hops);
});

test('day3 records a final event: no claim, honest warning, no phantom day4',()=>{
  let s=start();
  s=closeNight(s);s=act(s,{type:'next'});
  s=closeNight(s);s=act(s,{type:'next'});
  assert.equal(s.day,3);
  s=closeNight(s);
  s=night(s,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  const e=entry(s,3);
  assert.ok(e);assert.equal(e.delivered,true);assert.equal(e.safe,true);assert.equal(e.claimed,false);
  assert.equal(R.marketInfo(s).receipt,'final');
  assert.match(R.marketInfo(s).reason,/没有下一天|无法兑现/);
  assert.ok(s.life.morning.some(x=>x.includes('没有下一天')||x.includes('无法兑现')||x.includes('第 3')));
  reject(s,{type:'next'});
  assert.ok(R.act(s,{type:'finish'}).ok);
});

test('blackout salvage with power repair records powerRestored only on that condition',()=>{
  let s=start();
  s=closeNight(s);s=act(s,{type:'next'});
  s=closeNight(s);s=act(s,{type:'next'});
  s=closeNight(s);
  s=night(s,run=>{
    autoPick(run,'market');
    autoPick(run,'mkt-salvage');
    autoPick(run,'market-fuse');
    assert.equal(run.marketShift.powerItem,'item3');
    autoPick(run,'market-cold');
    assert.ok(run.bag.includes('item1'));
    autoPick(run,'exit');
  });
  const e=entry(s,3);
  assert.equal(e.condition,'blackout');
  assert.equal(e.powerRestored,true);
  assert.equal(e.stockTaken,true);
  assert.equal(e.approach,'salvage');
  assert.equal(e.delivered,false);
});

test('strict malformed market histories are rejected',()=>{
  let base=closeNight(start());
  base=night(base,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  const goodEntry=()=>structuredClone(entry(base,1));
  function rejects(fn){
    const bad=structuredClone(base);
    fn(bad);
    assert.equal(R.restore(bad),null);
  }
  rejects(s=>{s.market=null;});
  rejects(s=>{s.market={version:1};});
  rejects(s=>{s.market={version:2,history:[]};});
  rejects(s=>{s.market.history=[goodEntry(),goodEntry()];}); // duplicate day
  rejects(s=>{const e=goodEntry();e.day=4;s.market.history=[e];}); // future
  rejects(s=>{const e=goodEntry();e.day='1';s.market.history=[e];});
  rejects(s=>{const e=goodEntry();e.condition='restock';s.market.history=[e];}); // formula mismatch
  rejects(s=>{const e=goodEntry();e.approach='salvage';s.market.history=[e];}); // delivered needs trade
  rejects(s=>{const e=goodEntry();e.stockTaken=true;s.market.history=[e];}); // never both
  rejects(s=>{const e=goodEntry();e.safe=false;s.market.history=[e];}); // safe mismatch w/ journal
  rejects(s=>{const e=goodEntry();e.powerRestored=true;s.market.history=[e];}); // only blackout
  rejects(s=>{const e=goodEntry();e.claimed=true;s.market.history=[e];}); // same day cannot claim
  rejects(s=>{const e=goodEntry();e.extra=1;s.market.history=[e];});
  rejects(s=>{const e=goodEntry();delete e.safe;s.market.history=[e];});
  rejects(s=>{const e=goodEntry();e.delivered='true';s.market.history=[e];});
  // History entries require a finished-trip journal entry on the same day.
  rejects(s=>{s.backstage.journal=[];});
  rejects(s=>{s.backstage.journal[0].status='bailed';});
});

test('missing market migrates; old in-progress legacy runs stay exactly legacy',()=>{
  const s=start();delete s.market;
  const restored=R.restore(s);
  assert.ok(restored);
  assert.deepEqual(restored.market,{version:1,history:[]});
  // In-progress run created without marketShift (old save bytes).
  let old=structuredClone(start());
  old.phase='explore';old.actions=1;old.prepared=['explore'];
  old.backstage={run:B.create(42,1,'hook',[]),discovered:[],resolution:null,trips:0,from:'prep',cashAfterClose:0,journal:[]};
  const legacy=R.restore(old);
  assert.ok(legacy);assert.equal(legacy.backstage.from,'prep');
  assert.equal(Object.hasOwn(legacy.backstage.run,'marketShift'),false);
  B.command(legacy.backstage.run,'bail');
  const back=R.act(legacy,{type:'returnExplore'});
  assert.ok(back.ok);assert.equal(back.state.phase,'prep');assert.equal(back.state.actions,1);
  assert.deepEqual(back.state.market.history,[]);
});

test('automatic market choices show readable copy with no internal labels',()=>{
  const run=B.create(42,1,'hook',[],{marketShift:true});
  A.enable(run);
  assert.ok(A.choose(run,'market'));
  autoIdle(run);
  assert.equal(run.auto.event,'market');
  const v=A.view(run);
  const trade=v.choices.find(c=>c.id==='mkt-trade'),salvage=v.choices.find(c=>c.id==='mkt-salvage');
  assert.ok(trade&&salvage);
  for(const c of [trade,salvage]){
    assert.doesNotMatch(c.label,/item\d|stage\d/);
    assert.doesNotMatch(c.detail,/item\d|stage\d|schema/);
  }
  assert.equal(trade.label,'帮忙搬货');
});

test('real UI renders the market panel and a claim click produces resources via R.act',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const City=require('./reopening-city.js');
  // Build an actual day-2 prep game carrying a safe night-1 delivery.
  let g=closeNight(start());
  g=night(g,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  g=act(g,{type:'next'});
  assert.equal(R.marketInfo(g).receipt,'available');

  const noop=()=>{};
  const gradient={addColorStop:noop};
  const ctx=new Proxy({},{get:(o,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>gradient:noop,set:()=>true});
  const mkEl=()=>({textContent:'',hidden:false,disabled:false,innerHTML:'',setAttribute:noop,removeAttribute:noop,addEventListener:noop,removeEventListener:noop,
    classList:{toggle:noop,add:noop,remove:noop},style:{},title:'',focus:noop,scrollIntoView:noop,
    querySelector:()=>null,querySelectorAll:()=>[],dataset:{}});
  const els=new Map();
  const canvasEl=()=>({...mkEl(),addEventListener:noop,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640})});
  const listeners={};
  const document={
    addEventListener:(type,cb)=>{(listeners[type]=listeners[type]||[]).push(cb);},
    hidden:false,activeElement:{isConnected:false},body:{classList:{toggle:noop}},
    getElementById:id=>{
      if(id==='pub-canvas'){if(!els.has(id))els.set(id,canvasEl());return els.get(id);}
      if(!els.has(id))els.set(id,mkEl());return els.get(id);
    },
    querySelector:()=>null,querySelectorAll:()=>[]
  };
  let capturedSave=null;
  const localStorage={
    getItem:()=>JSON.stringify({version:1,game:g,city:City.create(),sound:true}),
    setItem:(k,v)=>{capturedSave=JSON.parse(v);}
  };
  const rafs=[];let nowValue=1000;
  const sandbox={
    document,matchMedia:()=>({matches:false}),localStorage,
    performance:{now:()=>nowValue},setTimeout:()=>0,clearTimeout:noop,
    setInterval:()=>0,requestAnimationFrame:cb=>rafs.push(cb),
    devicePixelRatio:1,location:{search:''},scrollTo:noop,addEventListener:noop,
    URLSearchParams:class{get(){return null;}},navigator:{},AudioContext:undefined
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),sandbox);
  for(const file of ['journey-core.js','backstage-core.js','backstage-auto.js','delivery-orders.js',
    'character-stories.js','flower-network.js','reopening-core.js','reopening-city.js','reopening-scene.js',
    'backstage-scene.js','backstage-ui.js','journey-ui.js','reopening-ui.js'])load(file);

  const board=()=>els.get('action-content').innerHTML;
  const click=dataset=>{
    const button={dataset,disabled:false};
    const event={target:{closest:sel=>sel==='button[data-action]'?button:null}};
    for(const cb of listeners.click)cb(event);
  };
  // Travel from the pub to the market using the real city navigation UI.
  click({action:'city-travel',place:'market'});
  for(let i=0;i<600;i++){
    nowValue+=100;
    const cb=rafs.shift();
    assert.ok(cb,'frame scheduled');
    cb(nowValue);
    if(/market-errand|market-crate-card/.test(board()))break;
  }
  const html=board();
  assert.match(html,/今晚的超市|免费情报/);
  assert.match(html,/€8/);
  assert.match(html,/兑现/);
  assert.doesNotMatch(html,/item\d|stage\d|schema/);
  // Real claim click goes through dispatch -> R.act -> save.
  click({action:'market-errand'});
  assert.ok(capturedSave,'claim produced a durable save');
  assert.equal(capturedSave.game.market.history[0].claimed,true);
  assert.ok(capturedSave.game.batches.some(b=>b.id==='d2-market-errand'&&b.cups===3));
  assert.equal(capturedSave.game.hops,g.hops+1);
  assert.equal(capturedSave.game.actions,1);
  // Second click cannot duplicate.
  const savedBefore=JSON.stringify(capturedSave.game);
  click({action:'market-errand'});
  assert.equal(JSON.stringify(capturedSave.game),savedBefore);
  assert.match(els.get('notice').textContent,/已经|重复|已兑现/);
});

test('free market scout reports the real shift label and clue on all three nights, still free with dedup',()=>{
  function prepAt(day){
    let s=start();
    for(let d=1;d<day;d++){s=closeNight(s);s=act(s,{type:'next'});}
    return s;
  }
  const cases=[
    [1,'staffed',/值班/,/235/],
    [2,'restock',/补货/,/起步更快|亲手/],
    [3,'blackout',/停电/,/上锁|€5|零件/]
  ];
  for(const [day,cond,labelRe,clueRe] of cases){
    let s=prepAt(day);
    const view=R.marketInfo(s);
    assert.equal(view.condition,cond);
    const money=s.cash,actions=s.actions;
    s=act(s,{type:'scout',place:'market'});
    assert.equal(s.cash,money,'scout never costs cash');
    assert.equal(s.actions,actions,'scout never costs an action');
    assert.deepEqual(s.life.clues,['market']);
    assert.ok(s.lastMessage.includes(view.label),'message carries the real label: '+s.lastMessage);
    assert.ok(s.lastMessage.includes(view.clue),'message carries the real clue: '+s.lastMessage);
    assert.match(s.lastMessage,labelRe);
    assert.match(s.lastMessage,clueRe);
    assert.match(s.lastMessage,/卸货单|卸货门/,'existing route clue is preserved');
    // Repeated scouting stays deduplicated and free.
    s=act(s,{type:'scout',place:'market'});
    assert.deepEqual(s.life.clues,['market']);
    assert.equal(s.cash,money);assert.equal(s.actions,actions);
  }
});

test('marketInfo eligibility matches the real errand guards: 32-batch cap, duplicate batch id, 15-hop outcome',()=>{
  // Same real day-2 prep baseline as the success case: safe night-1 trade delivery.
  let s=closeNight(start());
  s=night(s,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  s=act(s,{type:'next'});
  assert.equal(R.marketInfo(s).canClaim,true);

  // 32-batch capacity: info must not advertise an errand the action rejects.
  const full=structuredClone(s);let n=0;
  while(full.batches.length<32)full.batches.push({id:'fill-'+(n++),beer:'blond',cups:1,quality:1,madeDay:1,aged:false});
  assert.ok(R.restore(full));
  let info=R.marketInfo(full);
  assert.equal(info.receipt,'available');
  assert.equal(info.canClaim,false);
  assert.match(info.reason,/32|批次/);
  reject(full,{type:'marketErrand'});
  assert.equal(full.hops,s.hops);
  assert.equal(full.cash,s.cash);

  // A pre-existing batch with the errand's own deterministic id also makes it impossible.
  const dup=structuredClone(s);
  dup.batches.push({id:'d2-market-errand',beer:'blond',cups:1,quality:1,madeDay:2,aged:false});
  assert.ok(R.restore(dup));
  info=R.marketInfo(dup);
  assert.equal(info.canClaim,false);
  assert.match(info.reason,/批次|编号|ID/);
  reject(dup,{type:'marketErrand'});
  assert.equal(dup.batches.filter(b=>b.id==='d2-market-errand').length,1);
  assert.equal(dup.actions,s.actions);

  // Hops already 15: still claimable for the 3 cups, but reason is truthful about
  // no hop and no replacement cash.
  const capped=structuredClone(s);capped.hops=15;assert.ok(R.restore(capped));
  info=R.marketInfo(capped);
  assert.equal(info.canClaim,true);
  assert.match(info.reason,/满|15/);
  assert.match(info.reason,/3\s*杯/);
  const cashBefore=capped.cash,blondBefore=R.stock(capped,'blond');
  const done=act(capped,{type:'marketErrand'});
  assert.equal(done.hops,15);
  assert.equal(done.cash,cashBefore,'no replacement cash at hop cap');
  assert.equal(R.stock(done,'blond'),blondBefore+3);
  assert.equal(entry(done,1).claimed,true);
});