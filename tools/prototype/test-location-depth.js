'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');
function advance(r,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=.025)B.step(r,input,Math.min(.025,seconds-t));}
function walk(r,to){for(let n=0;n<3000&&Math.hypot(to.x-r.p.x,to.y-r.p.y)>5;n++){const d=Math.hypot(to.x-r.p.x,to.y-r.p.y);B.step(r,{dx:(to.x-r.p.x)/d,dy:(to.y-r.p.y)/d},.025);assert.ok(!B.solid(r,r.p.x,r.p.y));}assert.ok(Math.hypot(to.x-r.p.x,to.y-r.p.y)<6,JSON.stringify({from:r.p,to}));}
function next(r){for(let n=0;n<4000&&r.status==='active'&&!r.auto.event;n++){A.step(r,.05);assert.ok(!B.solid(r,r.p.x,r.p.y));}assert.notEqual(r.auto.event,'stuck');assert.ok(r.auto.event||r.status!=='active');}
function choose(r,id){assert.ok(A.choose(r,id),'available '+id);next(r);if(r.auto.event==='glimpse'){assert.ok(A.choose(r,'continue'));next(r);}}

test('v4 retains three real market spaces, world loot, and a context snapshot',()=>{
  const context={clues:['market','club']},r=B.create(42,1,'hook',[],context);
  assert.equal(r.version,4);assert.equal(typeof B.locationInfo,'function');
  const info=B.locationInfo(r);assert.ok(info.enabled);assert.equal(info.rooms.length,3);
  assert.ok(info.market.clued&&info.club.clued);context.clues.length=0;assert.ok(B.locationInfo(r).market.clued);
  for(const room of info.rooms){assert.ok(room.label);assert.ok(r.items.some(i=>i.state==='world'&&i.x>room.x&&i.x<room.x+room.w&&i.y>room.y&&i.y<room.y+room.h));}
  for(const wall of info.walls)assert.ok(B.solid(r,wall.x+wall.w/2,wall.y+wall.h/2));
});
test('both market aisles are physically walkable to the cold stock in every street situation',()=>{
  for(const day of [1,2,3])for(const side of ['north','south']){
    const r=B.create(42,day);r.actors=[];assert.equal(typeof B.locationInfo,'function');
    Object.assign(r.p,B.locationInfo(r).market.entry);
    const points=side==='north'?[[260,1085],[260,840],[530,840],[740,840],[740,850]]:[[460,1190],[460,1210],[740,1210],[740,850]];
    for(const [x,y] of points)walk(r,{x,y});
    assert.ok(r.bag.includes('item1'),'cold stock is collected by entering the room');
  }
});
test('unloading shortcut needs a nearby interaction and stays open on later runs',()=>{
  const r=B.create(42,1);r.actors=[];assert.equal(typeof B.locationInfo,'function');
  const info=B.locationInfo(r),door=info.door;
  assert.ok(B.solid(r,door.x+door.w/2,door.y+door.h/2));
  assert.ok(!r.discovered.includes('market-shortcut'));
  Object.assign(r.p,info.market.shortcut);assert.equal(B.nearest(r).id,'market-shortcut');
  assert.ok(B.command(r,'interact'));assert.ok(r.discovered.includes('market-shortcut'));
  walk(r,{x:840,y:1105});assert.ok(B.locationInfo(B.create(42,2,'hook',r.discovered)).door.open);
  B.command(r,'bail');assert.ok(B.rewards(r).outcomes.includes('market-shortcut'));
});
function guardRun(time,near=150){const r=B.create(42,1);r.time=time;Object.assign(r.p,{x:1120,y:1150});const parcel=r.items.find(i=>i.kind==='parcel');parcel.state='bag';r.bag=[parcel.id];r.parcel='carried';const g=r.actors.find(a=>a.type==='guard');Object.assign(g,{x:1120+near,y:1150,homeX:1120+near,homeY:1150});r.actors=[g];return r;}
test('music actually masks guard perception but never protects someone standing beside him',()=>{
  const quiet=guardRun(1),loud=guardRun(7),near=guardRun(7,40);
  advance(quiet,.025);advance(loud,.025);advance(near,.025);
  assert.equal(quiet.actors[0].mode,'windup');assert.equal(loud.actors[0].mode,'patrol');assert.equal(near.actors[0].mode,'windup');
  loud.time=12.1;advance(loud,.025);assert.equal(loud.actors[0].mode,'windup');
});
test('bottle sounds obey the same music zone and audible proximity rule',()=>{
  for(const [time,near,heard] of [[1,180,true],[7,180,false],[7,75,true]]){
    const r=guardRun(time,near);Object.assign(r.p,{x:1120,y:1160});
    assert.ok(B.command(r,'lure',{x:1120,y:1140}));
    assert.equal(r.actors[0].mode,heard?'investigate':'patrol');
    assert.equal(r.street.baits,2);assert.ok(B.restore(r));
  }
});
test('moving crowds stay outside walls and barrels across cycles and situations',()=>{
  for(const day of [1,2,3]){
    const r=B.create(42,day),start=r.actors.filter(a=>a.type==='dancer').map(a=>({x:a.x,y:a.y}));
    for(let t=0;t<180;t++){B.step(r,{},.1);for(const a of r.actors.filter(a=>a.type==='dancer'))assert.ok(!B.solid(r,a.x,a.y,13),r.street.situation+' '+a.id+' '+r.time);}
    assert.ok(r.actors.filter(a=>a.type==='dancer').some((a,i)=>Math.hypot(a.x-start[i].x,a.y-start[i].y)>20));
    assert.ok(B.restore(r));
  }
});
test('market choices walk into stock, cold room and shortcut without fake rewards',()=>{
  for(const id of ['market-stock','market-cold','market-shortcut'])for(const day of [1,2,3]){
    let r=B.create(42,day);A.enable(r);choose(r,'market');
    assert.equal(r.auto.event,'market');assert.ok(A.view(r).choices.some(c=>c.id===id));
    assert.ok(A.choose(r,id));A.step(r,.1);r=B.restore(r);assert.ok(r&&A.valid(r));next(r);
    assert.equal(r.auto.event,'market');
    if(id==='market-shortcut')assert.ok(r.discovered.includes('market-shortcut'));
    else assert.ok(r.bag.includes(id==='market-stock'?'item0':'item1'));
    choose(r,'exit');assert.equal(r.status,'extracted');assert.ok(B.rewards(r).outcomes.includes(id==='market-shortcut'?'market-shortcut':'market-salvaged'));
  }
});
test('choices freeze every field while explicitly waiting advances the real simulation and restores midwait',()=>{
  let r=B.create(42,1);A.enable(r);choose(r,'club');r.time=1;
  const before=structuredClone(r);for(let i=0;i<30;i++){A.step(r,.1);B.step(r,{},.1);}assert.deepEqual(r,before);
  assert.ok(A.choose(r,'take-music'));assert.equal(r.auto.goal,'music');A.step(r,.1);
  assert.ok(r.time>1);assert.equal(r.parcel,'ground');r=B.restore(r);assert.ok(r&&A.valid(r));
  next(r);assert.equal(r.parcel,'carried');assert.ok(r.time>=6);assert.equal(r.street.baits,3);
  choose(r,'exit');assert.equal(r.status,'extracted');assert.ok(B.rewards(r).outcomes.includes('club-backstage'));
});
test('all club strategies survive every situation and kit and save halfway through travel',()=>{
  for(const day of [1,2,3])for(const kit of ['hook','cart','foam'])for(const approach of ['foam','hook','lure','barrel','music']){
    let r=B.create(42,day,kit);A.enable(r);choose(r,'club');assert.ok(A.choose(r,'take-'+approach));
    for(let i=0;i<5;i++)A.step(r,.1);r=B.restore(r);assert.ok(r&&A.valid(r),[day,kit,approach].join('/'));next(r);
    assert.equal(r.parcel,'carried',[day,kit,approach].join('/'));choose(r,'exit');assert.equal(r.status,'extracted');
  }
});
test('v1 and v2 keep original geometry and loot while the next run enables new interiors',()=>{
  for(const version of [1,2]){
    const old=B.create(42,2);old.version=version;delete old.location;Object.assign(old.p,{x:790,y:1110});Object.assign(old.items[0],{x:320,y:1130});Object.assign(old.items[1],{x:405,y:1030});if(version===1)delete old.street;
    const r=B.restore(old);assert.ok(r);assert.equal(typeof B.locationInfo,'function');assert.equal(B.locationInfo(r).enabled,false);
    assert.deepEqual(r.p,old.p);assert.deepEqual(r.items,old.items);assert.ok(!B.solid(r,790,1110));assert.ok(B.locationInfo(B.create(42,3)).enabled);
  }
});
test('location state roundtrips and malformed fields reject instead of gaining discoveries',()=>{
  const r=B.create(42,1,'hook',[],{clues:['market']});assert.deepEqual(B.restore(r),r);
  assert.ok(r.location);
  for(const patch of [{marketOpen:'yes'},{clues:['fake']},{outcomes:['cash']},{outcomes:['market-shortcut']}]){const bad=structuredClone(r);Object.assign(bad.location,patch);assert.equal(B.restore(bad),null);}
  const fresh=B.create(42,1);B.command(fresh,'bail');assert.deepEqual(B.rewards(fresh).outcomes,[]);
});
test('legacy automatic saves reject new location-only goals and v3 requires its location data',()=>{
  const r=B.create(42,1);r.version=2;delete r.location;A.enable(r);assert.ok(A.valid(r));
  for(const goal of ['market-stock','market-cold','market-shortcut','music']){const bad=structuredClone(r);bad.auto.goal=goal;bad.auto.event=null;assert.equal(A.valid(bad),false);}
  const bad=B.create(42,1);delete bad.location;assert.equal(B.restore(bad),null);
});
test('a complete market detour still permits hooked parcel pickup beside a street barrel, before and after refresh',()=>{
  for(const refresh of [false,true]){
    let r=B.create(1,1,'cart'),frames=0;A.enable(r);
    for(const id of ['market','market-stock','market-cold','market-shortcut','club','take-hook','exit']){
      assert.ok(A.choose(r,id),id);
      for(let n=0;n<12000&&r.status==='active'&&!r.auto.event;n++){
        A.step(r,1/60);assert.ok(!B.solid(r,r.p.x,r.p.y));
        if(refresh&&++frames%120===0){r=B.restore(r);assert.ok(r&&A.valid(r));}
      }
      assert.notEqual(r.auto.event,'stuck',id+' / refresh '+refresh);
      if(id==='take-hook')assert.equal(r.parcel,'carried');
    }
    assert.equal(r.status,'extracted');assert.equal(B.rewards(r).parcel,'kept');
  }
});
test('new parcel interaction reach cannot collect through a market wall',()=>{
  const r=B.create(42,1);r.actors=[];const box=r.items.find(i=>i.kind==='parcel');
  Object.assign(r.p,{x:740,y:1030});Object.assign(box,{x:790,y:1030});
  assert.ok(!B.solid(r,r.p.x,r.p.y));assert.ok(!B.solid(r,box.x,box.y,8));
  assert.ok(!B.clear(r,r.p,box));assert.notEqual(B.nearest(r)?.id,box.id);
  B.command(r,'interact');assert.equal(r.parcel,'ground');
});
