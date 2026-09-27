'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('./reopening-core.js');
function act(s,a){const before=JSON.stringify(s),r=R.act(s,a);assert.equal(r.ok,true,r.message);assert.equal(JSON.stringify(s),before);assert.ok(R.restore(r.state),'restore '+a.type+' '+a.verb);return r.state;}
function ja(s,verb,value){return act(s,{type:'journeyAction',verb,value});}
function progress(s,until){for(let i=0;i<1000&&!until(s.journeys.run);i++)s=ja(s,'tick',{seconds:.1});assert.ok(until(s.journeys.run),'must progress: '+s.journeys.run.stage);return s;}
test('journey integration',async t=>{
  await t.test('notice persists across restore and settles with unchanged preparation and private inventory',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'delivery'});s=ja(s,'pack','capacity');s=ja(s,'depart','smooth');s=ja(s,'notify');
    const saved=JSON.parse(JSON.stringify(s));s=R.restore(saved);assert.deepEqual(s,saved);assert.equal(s.journeys.run.version,4);
    assert.equal(R.act(s,{type:'journeyAction',verb:'notify'}).ok,false);s=ja(s,'auto');s=progress(s,r=>r.stage==='dropoff');
    const before=s.journeys.run.elapsed;s=ja(s,'tick',{seconds:1});assert.equal(s.journeys.run.elapsed,before);s=ja(s,'parcel','take');s=ja(s,'parcel','deliver');
    s=progress(s,r=>r.stage==='arrival');s=ja(s,'cargo');s=ja(s,'deliver','accept');s=progress(s,r=>r.stage==='receipt');const reward=s.journeys.run.reward;
    s=act(s,{type:'journeyReturn'});assert.equal(s.cash,45+reward);assert.equal(s.actions,1);assert.equal(s.life.bouquet,null);assert.equal(s.promises.lotte,false);assert.equal(s.music,false);
    assert.equal(s.trade.contracts[0].status,'offered');assert.match(s.journeys.history[0].note,/急件/);assert.match(s.journeys.history[0].note,/后台/);assert.equal(R.act(s,{type:'journeyReturn'}).ok,false);
  });
  await t.test('existing v2 trip restores without adding care rules or changing pending parcel',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'delivery'});s.journeys.run=require('./journey-core').create(42,1,'delivery',2);s=ja(s,'pack','capacity');s=ja(s,'depart','smooth');
    const saved=JSON.parse(JSON.stringify(s));s=R.restore(saved);assert.deepEqual(s,saved);assert.equal(s.journeys.run.care,undefined);assert.equal(s.journeys.run.load.parcel,'bike');
    s=progress(s,r=>r.stage==='dropoff');s=ja(s,'parcel','return');s=progress(s,r=>r.stage==='arrival');s=ja(s,'cargo');s=ja(s,'deliver','accept');s=progress(s,r=>r.stage==='receipt');s=act(s,{type:'journeyReturn'});assert.equal(s.trade.contracts[0].status,'offered');
  });
  await t.test('quality premium uses an explicitly selected batch, base price remains available',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'prepare',kind:'brew',beer:'blond'});
    for(let i=0;i<3;i++)s=act(s,{type:'brewHit',score:1});s=act(s,{type:'open'});
    const id=R.customers(s)[0].id;
    assert.equal(R.act(s,{type:'pour',customerId:id,beer:'blond',price:12,batchId:'starter-blond'}).ok,false);
    assert.equal(R.act(s,{type:'pour',customerId:id,beer:'blond',price:8,batchId:'starter-blond'}).ok,true);
    assert.equal(R.act(s,{type:'pour',customerId:id,beer:'blond',price:12,batchId:'missing'}).ok,false);
    s=act(s,{type:'pour',customerId:id,beer:'blond',price:12,batchId:s.batches.at(-1).id});
    assert.equal(s.night.pours[0].quality,3);assert.equal(s.batches[0].cups,6);assert.equal(s.batches.at(-1).cups,5);
  });
  await t.test('ongoing legacy night and delivery keep previous rules after migration',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'open'});delete s.trade;
    s=R.restore(s);assert.equal(s.trade.rulesFromDay,2);
    s=act(s,{type:'pour',customerId:R.customers(s)[0].id,beer:'blond',price:12});assert.equal(s.night.pours[0].quality,1);
    let j=act(R.createGame(42),{type:'start'});j=act(j,{type:'journeyStart',kind:'delivery'});
    j.journeys.run=require('./journey-core').create(42,1,'delivery',1);delete j.trade;j=R.restore(j);
    assert.equal(j.journeys.run.version,1);assert.equal(j.journeys.run.load,undefined);assert.equal(j.actions,1);
  });
  await t.test('old saves migrate without changing economic progress',()=>{const s=R.createGame(42);delete s.journeys;const restored=R.restore(s);assert.equal(restored.cash,45);assert.deepEqual(restored.journeys,{run:null,usedDay:0,debt:0,history:[]});});
  await t.test('complete trip is immutable, restorable and settles exactly once',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'delivery'});assert.equal(s.actions,1);
    s=ja(s,'pack','padding');s=ja(s,'depart','short');s=progress(s,r=>r.stage==='conflict');s=ja(s,'street','detour');s=ja(s,'auto');s=progress(s,r=>r.stage==='arrival');s=ja(s,'cargo');s=ja(s,'deliver','accept');s=progress(s,r=>r.stage==='receipt');s=act(s,{type:'journeyReturn'});
    assert.equal(s.cash,59);assert.equal(s.actions,1);assert.equal(s.journeys.history.length,1);assert.equal(s.journeys.history[0].street,'detour');
    assert.equal(R.act(s,{type:'journeyReturn'}).ok,false);assert.equal(R.act(s,{type:'journeyStart',kind:'rail'}).ok,false);
    assert.equal(s.life.bouquet,null);assert.equal(s.music,false);assert.equal(s.friends.lotte,0);
    s=act(s,{type:'open'});s=act(s,{type:'close'});s=act(s,{type:'next'});assert.equal(s.day,2);assert.equal(s.journeys.history.length,1);assert.equal(R.act(s,{type:'journeyStart',kind:'rail'}).ok,true);
  });
  await t.test('invalid and unrelated actions leave journey untouched',()=>{let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'rail'});for(const action of [{type:'open'},{type:'flowerStore',stored:true},{type:'journeyReturn'},{type:'journeyAction',verb:'tick',value:null}]){const out=R.act(s,action);assert.equal(out.ok,false);assert.equal(out.state,s);}});
  await t.test('private bouquet cannot be overwritten by a commission',()=>{let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'flowerStart'});for(const stem of [0,1,2])s=act(s,{type:'flowerPick',stem});s=act(s,{type:'flowerWrap',wrap:'ribbon'});s=act(s,{type:'flowerFinish'});assert.equal(R.act(s,{type:'journeyStart',kind:'delivery'}).ok,false);assert.equal(s.life.bouquet.palette,'warm');});
  await t.test('invalid journey state is rejected on restore',()=>{let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'delivery'});for(const [key,value] of [['quality',101],['paid',-1],['stage','made-up'],['seed',23]]){const bad=JSON.parse(JSON.stringify(s));bad.journeys.run[key]=value;assert.equal(R.restore(bad),null,key);}});
  await t.test('rail roundtrip persists all stages and settles reward minus actual fares',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'rail'});s=ja(s,'pack','capacity');s=ja(s,'depart','smooth');s=progress(s,r=>r.stage==='ticket');
    for(let leg=0;leg<2;leg++){
      s=ja(s,'ticket','paid');if(leg===0)s=ja(s,'secure');s=ja(s,'auto');
      for(let i=0;i<500&&['carriage','inspection'].includes(s.journeys.run.stage);i++){
        const r=s.journeys.run;if(r.stage==='inspection')s=ja(s,'inspect');else if(!r.eventDone&&r.travel>=5)s=ja(s,'help',false);else s=ja(s,'tick',{seconds:.1});
      }
      if(leg===0){assert.equal(s.journeys.run.stage,'arrival');s=ja(s,'deliver','accept');}
    }
    s=progress(s,r=>r.stage==='receipt');s=act(s,{type:'journeyReturn'});assert.equal(s.cash,53);assert.equal(s.journeys.debt,0);assert.equal(s.journeys.history[0].paid,8);assert.equal(s.journeys.history[0].reward,16);
  });
});
