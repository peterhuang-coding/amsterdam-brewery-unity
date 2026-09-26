'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('./reopening-core.js');
function act(s,a){const before=JSON.stringify(s),r=R.act(s,a);assert.equal(r.ok,true,r.message);assert.equal(JSON.stringify(s),before);assert.ok(R.restore(r.state),'restore '+a.type+' '+a.verb);return r.state;}
function ja(s,verb,value){return act(s,{type:'journeyAction',verb,value});}
function progress(s,until){for(let i=0;i<1000&&!until(s.journeys.run);i++)s=ja(s,'tick',{seconds:.1});assert.ok(until(s.journeys.run),'must progress: '+s.journeys.run.stage);return s;}
test('journey integration',async t=>{
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
