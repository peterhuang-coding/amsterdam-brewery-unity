'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const J=require('./journey-core.js');

function act(r,verb,value,cash=45){const a=J.act(r,verb,value,cash);assert.equal(a.ok,true,a.message);assert.ok(J.valid(r),'reachable state '+r.stage);return a;}
function tick(r,until,limit=5000){for(let i=0;i<limit&&!until(r);i++){act(r,'tick',{seconds:.1});}assert.ok(until(r),'route must reach '+r.stage+' '+JSON.stringify(r.p));}
function start(kind='delivery',route='smooth',seed=42,packing='padding'){const r=J.create(seed,1,kind,1);assert.ok(J.valid(r));act(r,'pack',packing);act(r,'depart',route);return r;}
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
  await t.test('garden detour charges time and materials once, keeps parcel and can resume delivery',()=>{
    for(const introduced of [false,true]){
      const r=J.create(42,1,'delivery',4,{known:true,introduced});act(r,'pack','capacity');act(r,'depart','smooth');act(r,'garden-route');tick(r,s=>s.stage==='garden');
      assert.equal(r.garden.visited,true);assert.equal(r.load.parcel,'bike');const time=r.elapsed,position={...r.p};act(r,'tick',{seconds:1});assert.equal(r.elapsed,time);assert.deepEqual(r.p,position);
      assert.equal(J.act(r,'garden-wrap',undefined,45).ok,false);act(r,'cargo');r.quality=65;const result=act(r,'garden-wrap');assert.equal(result.cost,introduced?0:2);assert.equal(r.quality,90);assert.equal(r.elapsed,time+8);assert.equal(r.packing,'capacity');
      const saved=JSON.stringify(r);assert.equal(J.act(r,'garden-wrap').ok,false);assert.equal(JSON.stringify(r),saved);
      act(r,'garden-leave');tick(r,s=>s.stage==='dropoff');act(r,'parcel','take');act(r,'parcel','deliver');tick(r,s=>s.stage==='arrival');act(r,'deliver','accept');tick(r,s=>s.stage==='receipt');assert.match(J.careNote(r),/温室侧门/);
    }
  });
  await t.test('garden routing can be cancelled and ordinary trips keep the direct destination',()=>{
    const r=J.create(42,1,'delivery',4,{known:true});act(r,'pack','padding');act(r,'depart','smooth');act(r,'garden-route');act(r,'garden-route');assert.equal(r.garden.detour,false);tick(r,s=>s.stage==='arrival');assert.equal(r.garden.visited,false);
    const old=J.create(42,1,'delivery',3);act(old,'pack','padding');act(old,'depart','smooth');assert.equal(J.act(old,'garden-route').ok,false);assert.equal(old.garden,undefined);
  });
  await t.test('a repaired pump changes movement and a stranger can leave without money',()=>{
    const times=[];for(const pump of [false,true]){const r=J.create(42,1,'delivery',4,{known:true,pump});act(r,'pack','padding');act(r,'depart','smooth');act(r,'garden-route');tick(r,s=>s.stage==='garden');times.push(r.elapsed);act(r,'cargo');const copy=JSON.stringify(r);assert.equal(J.act(r,'garden-wrap',undefined,0).ok,false);assert.equal(JSON.stringify(r),copy);act(r,'garden-leave');tick(r,s=>s.stage==='arrival');}
    assert.ok(times[0]>times[1]);
  });
  await t.test('healthy flowers never lose quality at the table and remote cargo stays remote',()=>{
    const r=J.create(42,1,'delivery',4,{known:true});act(r,'pack','padding');act(r,'depart','smooth');act(r,'garden-route');tick(r,s=>s.stage==='garden');
    const remote={x:600,y:330,mounted:false};r.bike=remote;const before=JSON.stringify(r);assert.equal(J.act(r,'cargo').ok,false);assert.equal(J.act(r,'garden-wrap').ok,false);assert.equal(JSON.stringify(r),before);
    act(r,'garden-leave');act(r,'garden-route');tick(r,s=>s.stage==='garden');act(r,'cargo');act(r,'garden-wrap');assert.equal(r.quality,100);
    const bad=structuredClone(r);bad.garden.visited=false;assert.equal(J.valid(bad),false);
  });
  await t.test('advance notice trades five seconds and two euros for an eighty-second handoff',()=>{
    const r=J.create(42,1,'delivery');act(r,'pack','padding');act(r,'depart','smooth');
    act(r,'auto');for(let i=0;i<10;i++)act(r,'tick',{seconds:1});
    const elapsed=r.elapsed;act(r,'notify');assert.equal(r.elapsed,elapsed+5);assert.equal(J.deadline(r),80);assert.equal(r.auto,false);
    const copy=JSON.stringify(r);assert.equal(J.act(r,'notify').ok,false);assert.equal(JSON.stringify(r),copy);
    act(r,'auto');tick(r,s=>s.stage==='arrival');assert.ok(r.elapsed>40&&r.elapsed<80);act(r,'cargo');
    act(r,'deliver','accept');assert.equal(r.outcome,'redirected');assert.equal(r.reward,12);
    tick(r,s=>s.stage==='receipt');assert.match(J.careNote(r),/原时限内联系/);
  });
  await t.test('notice deadline and late handoff use inclusive boundaries without retroactive extension',()=>{
    for(const elapsed of [40,40.01]){
      const r=J.create(42,1,'delivery');act(r,'pack','padding');act(r,'depart','smooth');r.elapsed=elapsed;
      const before=JSON.stringify(r);assert.equal(J.act(r,'notify').ok,elapsed===40);
      if(elapsed===40){assert.equal(r.elapsed,45);assert.ok(J.valid(r));}else assert.equal(JSON.stringify(r),before);
    }
    for(const elapsed of [80,80.01]){
      const r=J.create(42,1,'delivery');act(r,'pack','padding');act(r,'depart','smooth');act(r,'notify');act(r,'auto');tick(r,s=>s.stage==='arrival');act(r,'cargo');r.elapsed=elapsed;
      act(r,'deliver','accept');assert.equal(r.outcome,elapsed===80?'redirected':'late');assert.equal(r.reward,elapsed===80?12:10);
    }
  });
  await t.test('damaged flowers can become table flowers without healing or duplicate payment',()=>{
    const r=J.create(1,1,'delivery');act(r,'pack','capacity');act(r,'depart','short');act(r,'parcel','return');act(r,'speed');
    tick(r,s=>s.stage==='conflict');act(r,'street','talk');act(r,'auto');tick(r,s=>s.stage==='arrival');
    assert.ok(r.quality>=20&&r.quality<80);const quality=r.quality,elapsed=r.elapsed;
    assert.equal(J.act(r,'deliver','table').ok,false);act(r,'cargo');act(r,'deliver','table');
    assert.equal(r.quality,quality);assert.equal(r.elapsed,elapsed+10);assert.equal(r.reward,8);assert.equal(r.outcome,'repurposed');
    const before=JSON.stringify(r);assert.equal(J.act(r,'deliver','table').ok,false);assert.equal(JSON.stringify(r),before);tick(r,s=>s.stage==='receipt');
    assert.match(J.careNote(r),/排练桌花/);
  });
  await t.test('table flower quality boundaries, tidy cost and forged care data are validated',()=>{
    const base=J.create(42,1,'delivery');act(base,'pack','padding');act(base,'depart','smooth');tick(base,s=>s.stage==='arrival');act(base,'cargo');
    for(const quality of [19,20,79,80]){const r=structuredClone(base);r.quality=quality;const before=JSON.stringify(r);const allowed=quality>=20&&quality<80;assert.equal(J.act(r,'deliver','table').ok,allowed);if(allowed)assert.ok(J.valid(r));else assert.equal(JSON.stringify(r),before);}
    const r=structuredClone(base);r.quality=60;const elapsed=r.elapsed;act(r,'tidy');assert.equal(r.quality,80);assert.equal(r.elapsed,elapsed+15);assert.equal(J.act(r,'tidy').ok,false);assert.equal(J.canRepurpose(r),false);
    for(const care of [{notifiedAt:41,resolution:null},{notifiedAt:null,resolution:'table'},{notifiedAt:null,resolution:null,extra:true}]){const bad=structuredClone(base);bad.care=care;assert.equal(J.valid(bad),false);}
  });
  await t.test('v1 and v2 in-flight journeys remain on their original rules',()=>{
    for(const version of [1,2]){const r=J.create(42,1,'delivery',version);act(r,'pack','padding');act(r,'depart','smooth');assert.equal(J.act(r,'notify').ok,false);tick(r,s=>s.stage==='arrival');act(r,'cargo');r.quality=50;assert.equal(J.act(r,'deliver','table').ok,false);act(r,'deliver','accept');assert.equal(r.outcome,'honest');assert.equal(r.reward,8);assert.equal(r.version,version);assert.equal(r.care,undefined);tick(r,s=>s.stage==='receipt');}
  });
  await t.test('new two-slot delivery visits parcel stop and settles each item once',()=>{
    for(const route of ['short','smooth'])for(const cancel of [false,true]){
      const r=J.create(42,1,'delivery');act(r,'pack','capacity');assert.equal(J.manifest(r).reduce((n,i)=>n+i.slots,0),2);
      act(r,'depart',route);
      tick(r,s=>['conflict','dropoff'].includes(s.stage));
      if(r.stage==='conflict'){act(r,'street','talk');act(r,'auto');tick(r,s=>s.stage==='dropoff');}
      const elapsed=r.elapsed;act(r,'tick',{seconds:1});assert.equal(r.elapsed,elapsed);
      assert.equal(J.act(r,'parcel','deliver').ok,false);
      if(cancel)act(r,'parcel','return');else{act(r,'parcel','take');act(r,'parcel','deliver');}
      assert.equal(J.act(r,'parcel','deliver').ok,false);
      tick(r,s=>s.stage==='arrival');act(r,'cargo');act(r,'deliver','accept');tick(r,s=>s.stage==='receipt');
      assert.equal(r.reward,(r.elapsed>r.deadline?10:14)+(cancel?0:r.load.onTime?4:2));
    }
  });
  await t.test('packing swaps exactly two slots and cancellation returns undelivered cargo',()=>{
    const r=J.create(42,1,'delivery');act(r,'pack','capacity');act(r,'pack','padding');assert.equal(r.load.parcel,'none');
    act(r,'pack','capacity');act(r,'abandon');tick(r,s=>s.stage==='receipt');assert.equal(r.load.parcel,'returned');assert.equal(r.reward,0);
    const bad=JSON.parse(JSON.stringify(r));bad.load.parcel='bike';assert.equal(J.valid(bad),false);
  });
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
