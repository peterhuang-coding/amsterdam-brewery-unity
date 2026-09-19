'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('./bench-algorithms.js');
const {validate,replay,reduce,defaultCorpus,checksum}=H;
const T=(seed=1,actions=[])=>({version:1,initial:{seed,day:1,kit:'hook'},actions});
const step=(type='step',steps=1,extra={})=>({type,steps,dt:.05,...extra});
const cmd=(verb,aim={})=>({type:'command',verb,aim});
const sig=x=>x.failure.code+':'+(x.failure.invariant||x.failure.code);

test('manual command disables initial autopilot and zero-input step advances time',()=>{
  const t=T(7,[step('step',4,{input:{}})]);
  const r=replay(t);
  assert.equal(r.ok,true);
  assert.ok(Math.abs(r.time-.2)<1e-9);
  assert.equal(r.state.auto.enabled,false);
  assert.equal(r.ticks,4);
});

test('restore during travel preserves goal/event/disabled mode and JSON continuation',()=>{
  const setup=[cmd('foam'),step('step',1,{input:{dx:1}})];
  const a=replay(T(11,setup));
  const t=T(11,[...setup,{type:'restore'},step('step',3,{input:{dx:1}})]);
  const r=replay(t);
  assert.equal(r.ok,true);
  assert.equal(r.restores,1);
  assert.equal(r.state.auto.enabled,false);
  const restored=replay(JSON.parse(JSON.stringify(t)));
  assert.equal(restored.ok,true);
  assert.equal(restored.checksum,r.checksum);
  assert.equal(restored.goal,r.goal);
  assert.equal(restored.event,r.event);
  assert.equal(restored.state.auto.enabled,r.state.auto.enabled);
});

test('validator accepts maximum uint32 seed and rejects unknown command or nonfinite aim',()=>{
  assert.equal(validate(T(4294967295,[cmd('foam')])).ok,true);
  assert.equal(replay(T(4294967295,[cmd('foam')])).ok,true);
  let v=validate(T(1,[cmd('definitely-not-a-verb')]));
  assert.equal(v.ok,false);
  assert.equal(v.failure.code,'malformed');
  v=validate(T(1,[step('step',1,{input:{aim:{x:NaN,y:0}}})]));
  assert.equal(v.ok,false);
  assert.equal(v.failure.code,'malformed');
  v=validate(T(1,[cmd('foam',{x:Infinity})]));
  assert.equal(v.ok,false);
});

test('action, per-action step, and total-step bounds fail before simulation',()=>{
  let v=validate(T(1,Array.from({length:201},()=>step('auto',0))));
  assert.equal(v.failure.code,'malformed');
  v=validate(T(1,[step('auto',2001)]));
  assert.equal(v.failure.code,'malformed');
  v=validate(T(1,Array.from({length:11},()=>step('auto',2000))));
  assert.equal(v.failure.code,'malformed');
});

test('default corpus replays deterministically and explicitly handles glimpse choices',()=>{
  const c=defaultCorpus();
  assert.ok(c.length>=1);
  for(const x of c){
    assert.ok(x.t.actions.length>=1);
    assert.ok(x.t.actions.some(a=>a.type!=='restore'));
    const a=replay(x.t),b=replay(JSON.parse(JSON.stringify(x.t)));
    assert.equal(a.ok,true,x.name+': '+JSON.stringify(a.failure));
    assert.equal(a.status,'extracted',x.name+' completes route');
    assert.equal(a.checksum,b.checksum);
    assert.equal(checksum(a.state,a.ticks),a.checksum);
    if(a.events.some(e=>e.event==='glimpse')){
      assert.ok(x.t.actions.some(q=>q.type==='choose'&&q.id==='continue'),x.name+' handles glimpse');
    }
  }
});

test('reducer rejects malformed transcript and successful replay',()=>{
  assert.equal(reduce({version:1,initial:{seed:1,day:1,kit:'hook'}}).ok,false);
  const good=T(3,[step('step',0)]);
  assert.equal(replay(good).ok,true);
  assert.equal(reduce(good).ok,false);
});

test('reducer caps replays at supplied budget and supplied budget is bounded to 100',()=>{
  const bad=T(2,[step('auto',1),{type:'choose',id:'intentional-harness-invalid-choice'},step('auto',1)]);
  const base=replay(bad);
  assert.equal(base.ok,false);
  assert.equal(base.failure.invariant,'choose-accepted');
  for(const b of [1,2,5]){
    const r=reduce(bad,b);
    assert.equal(r.ok,true);
    assert.ok(r.replays<=b);
  }
  const r=reduce(bad,101);
  assert.equal(r.ok,true);
  assert.ok(r.replays<=100);
});

test('reducer removes extraneous actions while preserving stable failure kind',()=>{
  const lead=[cmd('foam'),step('step',2,{input:{dx:1}}),{type:'restore'},step('step',2,{input:{}})];
  const bad=T(55,[...lead,step('auto',1),{type:'choose',id:'intentional-harness-invalid-choice'},step('auto',10)]);
  const base=replay(bad);
  assert.equal(base.ok,false);
  const r=reduce(bad,100);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.ok(r.result.actions.length<bad.actions.length);
  assert.equal(validate(r.result).ok,true);
  const x=replay(r.result);
  assert.equal(x.ok,false);
  assert.equal(sig(x),sig(base));
  assert.equal(x.failure.invariant,base.failure.invariant);
});
