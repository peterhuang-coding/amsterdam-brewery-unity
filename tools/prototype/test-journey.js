'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const J=require('./journey-core.js');

function act(r,verb,value,cash=45){const a=J.act(r,verb,value,cash);assert.equal(a.ok,true,a.message);assert.ok(J.valid(r),'reachable state '+r.stage);return a;}
function tick(r,until,limit=5000){for(let i=0;i<limit&&!until(r);i++){act(r,'tick',{seconds:.1});}assert.ok(until(r),'route must reach '+r.stage+' '+JSON.stringify(r.p));}
function start(kind='delivery',route='smooth',seed=42,packing='padding'){const r=J.create(seed,1,kind);assert.ok(J.valid(r));act(r,'pack',packing);act(r,'depart',route);return r;}
function trainLeg(r,ticket='paid'){
  act(r,'ticket',ticket);
  if(r.leg===0)act(r,'secure');
  act(r,'auto');
  for(let i=0;i<1000&&['carriage','inspection'].includes(r.stage);i++){
    if(r.stage==='inspection')act(r,'inspect');
    else if(!r.eventDone&&r.travel>=5)act(r,'help',false);
    else act(r,'tick',{seconds:.1});
  }
}
test('journey rules',async t=>{
  await t.test('both routes complete with cargo, return bicycle and deterministic states',()=>{
    for(const route of ['short','smooth'])for(const pack of ['padding','capacity']){
      const a=start('delivery',route,42,pack),b=start('delivery',route,42,pack);
      for(const r of [a,b]){
        tick(r,s=>s.stage==='arrival'||s.stage==='conflict');
        if(r.stage==='conflict'){act(r,'street','talk');act(r,'auto');tick(r,s=>s.stage==='arrival');}
        assert.equal(r.quality,100);assert.equal(r.cargo,'bike');assert.equal(J.act(r,'deliver','accept').ok,false);
        act(r,'cargo');act(r,'deliver','accept');assert.equal(r.returning,true);tick(r,s=>s.stage==='receipt');
        assert.ok(Math.hypot(r.bike.x-95,r.bike.y-330)<40);assert.equal(r.cargo,'delivered');assert.equal(r.reward,(r.elapsed>r.deadline?10:14)+(pack==='padding'?0:2));
      }assert.deepEqual(a,b);
    }
  });
  await t.test('fast stone route damages flowers, padding limits damage',()=>{
    const qs=[];for(const pack of ['padding','capacity']){const r=start('delivery','short',1,pack);act(r,'speed');tick(r,s=>s.stage==='conflict');act(r,'street','talk');act(r,'auto');tick(r,s=>s.stage==='arrival');qs.push(r.quality);}
    assert.ok(qs[0]>qs[1]);assert.ok(qs[1]<80);
  });
  await t.test('detour avoids combat and still reaches delivery',()=>{const r=start('delivery','short');tick(r,s=>s.stage==='conflict');const before=r.elapsed;act(r,'tick',{seconds:1});assert.equal(r.elapsed,before);act(r,'street','detour');act(r,'auto');tick(r,s=>s.stage==='arrival');assert.equal(r.streetResult,'detour');});
  await t.test('conflict warns, allows guard and escape without money reward',()=>{
    const r=start('delivery','short');tick(r,s=>s.stage==='conflict');act(r,'street','fight');
    tick(r,s=>s.conflict.mode==='windup');act(r,'defend');tick(r,s=>s.conflict.mode==='recover');assert.equal(r.conflict.hits,0);assert.equal(r.reward,0);
    act(r,'defend');act(r,'tick',{seconds:.1});assert.equal(r.conflict.mode,'yield');act(r,'auto');tick(r,s=>s.stage==='arrival');
  });
  await t.test('all rail legs return to original bicycle and paid tickets never fined',()=>{
    for(const seed of [1,2,42]){const r=start('rail','smooth',seed);tick(r,s=>s.stage==='ticket');const bike={...r.bike};trainLeg(r);assert.equal(r.stage,'arrival');assert.deepEqual(r.bike,bike);assert.equal(r.paid,4);
      act(r,'deliver','accept');assert.equal(r.cargo,'delivered');trainLeg(r);assert.equal(r.cargo,'delivered');assert.equal(r.paid,8);assert.equal(r.fee,0);tick(r,s=>s.stage==='receipt');}
  });
  await t.test('unpaid ticket has one settlement, credit return is a lawful alternative',()=>{
    const r=start('rail');tick(r,s=>s.stage==='ticket');act(r,'ticket','unpaid',0);r.willCheck=true;act(r,'auto');
    tick(r,s=>s.travel>=5);act(r,'help',false);tick(r,s=>s.stage==='inspection');const cost=act(r,'inspect',undefined,0);assert.equal(cost.cost,0);assert.equal(r.fee,12);assert.equal(J.act(r,'inspect',undefined,0).ok,false);
    tick(r,s=>s.stage==='arrival');act(r,'deliver','accept');act(r,'ticket','credit',0);act(r,'auto');assert.equal(r.fee,16);assert.equal(r.ticket,'paid');
    tick(r,s=>s.stage==='inspection'||s.stage==='road');if(r.stage==='inspection')act(r,'inspect',undefined,0);tick(r,s=>s.stage==='receipt');assert.equal(r.fee,16);
  });
  await t.test('carriage decision pauses travel and help requires actual proximity',()=>{
    const r=start('rail');tick(r,s=>s.stage==='ticket');act(r,'ticket','paid');const ready=r.elapsed;act(r,'tick',{seconds:1});assert.equal(r.elapsed,ready);act(r,'auto');tick(r,s=>s.travel>=5);const elapsed=r.elapsed,travel=r.travel;act(r,'tick',{seconds:1});assert.equal(r.elapsed,elapsed);assert.equal(r.travel,travel);
    r.p={x:180,y:330};assert.equal(J.act(r,'help',true).ok,false);
    act(r,'auto');tick(r,s=>Math.hypot(s.p.x-620,s.p.y-260)<80);act(r,'help',true);assert.equal(r.help,true);assert.equal(r.quality,80);
  });
  await t.test('abandon before departure is recoverable and grants no reward',()=>{const r=J.create(42,1,'delivery');act(r,'abandon');tick(r,s=>s.stage==='receipt');assert.equal(r.reward,0);assert.equal(r.cargo,'returned');assert.equal(J.act(r,'deliver','accept').ok,false);});
  await t.test('invalid time and direction do not mutate state',()=>{const r=start(),before=JSON.stringify(r);for(const value of [null,{seconds:-1},{seconds:Infinity},{seconds:.1,dx:Infinity}])assert.equal(J.act(r,'tick',value).ok,false);assert.equal(JSON.stringify(r),before);});
});
