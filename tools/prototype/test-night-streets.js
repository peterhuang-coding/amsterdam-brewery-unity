'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./backstage-core.js'),R=require('./reopening-core.js');
function advance(r,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=.05)B.step(r,input,Math.min(.05,seconds-t));}

test('three nights rotate real, deterministic street situations',()=>{
  const runs=[1,2,3].map(d=>B.create(42,d));
  assert.ok(runs[0].street,'new run includes street rules');
  assert.equal(new Set(runs.map(r=>r.street.situation)).size,3);
  assert.deepEqual(runs[0],B.create(42,1));
  for(const r of runs){
    const info=B.streetInfo(r);assert.ok(info.title&&info.hint);
    assert.ok(info.walls.length);
    const w=info.walls[0];assert.ok(B.solid(r,w.x+w.w/2,w.y+w.h/2));
  }
});
test('limited decoys draw a patrol to the sound instead of the player',()=>{
  const r=B.create(42,1);Object.assign(r.p,{x:800,y:1100});
  const guard=r.actors.find(a=>a.type==='guard');r.actors=[guard];
  Object.assign(guard,{x:930,y:1100,homeX:930,homeY:1100});
  assert.equal(B.command(r,'lure',{x:800,y:900}),true);
  assert.equal(r.street.baits,2);assert.equal(guard.mode,'investigate');
  const noise=r.street.noise,before=Math.hypot(guard.x-noise.x,guard.y-noise.y);
  assert.equal(B.command(r,'lure',{x:900,y:900}),false);
  advance(r,.5);assert.ok(Math.hypot(guard.x-noise.x,guard.y-noise.y)<before);
  assert.equal(r.p.hp,3);
  advance(r,2);assert.ok(B.command(r,'lure',{x:800,y:900}));
  advance(r,2.1);assert.ok(B.command(r,'lure',{x:800,y:900}));
  advance(r,2.1);assert.equal(B.command(r,'lure',{x:800,y:900}),false);
  advance(r,6);assert.equal(r.street.noise,null);
});
test('a bottle lands before a shelf rather than creating sound behind the wall',()=>{
  const r=B.create(42,1);Object.assign(r.p,{x:260,y:900});
  assert.ok(B.command(r,'lure',{x:550,y:900}));
  assert.ok(r.street.noise.x<300);assert.ok(!B.solid(r,r.street.noise.x,r.street.noise.y,5));
});
test('dragging moves a nearby physical barrel, then leaves it where released',()=>{
  const r=B.create(42,1);r.actors=[];r.items.forEach(i=>i.lock=2);assert.ok(r.street,'drag state exists');
  const barrel=r.street.barrels[0];Object.assign(barrel,{x:500,y:1150});
  Object.assign(r.p,{x:440,y:1150});const start=barrel.x;
  assert.ok(B.command(r,'drag'));advance(r,.4,{dx:-1});
  assert.ok(barrel.x<start);assert.ok(Math.hypot(barrel.x-r.p.x,barrel.y-r.p.y)<=65);
  assert.equal(B.load(r),0,'street barrels are not loot');
  assert.ok(B.command(r,'drag'));const parked={x:barrel.x,y:barrel.y};
  advance(r,.4,{dx:-1});assert.deepEqual({x:barrel.x,y:barrel.y},parked);
  assert.equal(B.command(r,'drag'),false,'cannot grab remotely');
});
test('a barrel blocks a charging machine in actual movement',()=>{
  const r=B.create(42,1);assert.ok(r.street,'barrel collision is available');
  r.street.barrels[0].x=850;r.street.barrels[0].y=1100;
  Object.assign(r.p,{x:925,y:1100});
  const bot=r.actors.find(a=>a.type==='cleaner');r.actors=[bot];
  Object.assign(bot,{x:800,y:1100,mode:'charge',timer:1,vx:380,vy:0});
  const without=structuredClone(r);Object.assign(without.street.barrels[0],{x:600,y:1200});
  advance(r,.65);advance(without,.65);
  assert.equal(r.p.hp,3);assert.ok(bot.x<850);assert.ok(bot.stun>0);
  assert.ok(without.p.hp<3,'without the barrel the same charge hits');
});
test('new street state roundtrips and malformed interactions reject',()=>{
  const r=B.create(42,1);assert.ok(B.command(r,'lure',{x:400,y:1140}));
  assert.deepEqual(B.restore(r),r);
  for(const patch of [{baits:99},{situation:'fake'},{dragging:'missing'},{noise:{x:NaN,y:5,life:5}}]){
    const bad=structuredClone(r);Object.assign(bad.street,patch);assert.equal(B.restore(bad),null);
  }
  const bad=structuredClone(r);bad.street.barrels[0].x=Infinity;assert.equal(B.restore(bad),null);
});
test('legacy expeditions keep geometry, inventory and position through nested restore',()=>{
  let s=R.act(R.createGame(42),{type:'start'}).state;
  s=R.act(R.act(s,{type:'open'}).state,{type:'close'}).state;
  s=R.act(s,{type:'explore',kit:'hook'}).state;
  const r=s.backstage.run;r.version=1;delete r.street;
  Object.assign(r.p,{x:820,y:930});
  const restored=R.restore(s);assert.ok(restored);
  assert.ok(restored.backstage.run.street,'nested migration is written back');
  assert.equal(restored.backstage.run.street.situation,'legacy');
  assert.deepEqual(restored.backstage.run.p,r.p);
  assert.deepEqual(restored.batches,s.batches);assert.deepEqual(restored.backstage.run.bag,r.bag);
  assert.equal(B.solid(restored.backstage.run,820,930),false);
});

const A=require('./backstage-auto.js');
function next(r){for(let n=0;n<4000&&r.status==='active'&&!r.auto.event;n++){A.step(r,.05);assert.ok(!B.solid(r,r.p.x,r.p.y),'automatic route respects street obstacles');}assert.notEqual(r.auto.event,'stuck');assert.ok(r.auto.event||r.status!=='active');}
function choose(r,id){assert.ok(A.choose(r,id),'available: '+id);next(r);if(r.auto.event==='glimpse'){assert.ok(A.choose(r,'continue'));next(r);}}
for(const approach of ['lure','barrel'])test('automatic '+approach+' is a physical strategy in every street situation',()=>{
  for(const day of [1,2,3]){
    let r=B.create(42,day);A.enable(r);choose(r,'club');assert.equal(r.auto.event,'club');
    const before=structuredClone(r);for(let i=0;i<20;i++)A.step(r,.1);assert.deepEqual(r,before);
    assert.ok(A.choose(r,'take-'+approach));
    // Refresh in the middle of execution: persist the real prop and navigation stage.
    A.step(r,.1);r=B.restore(r);assert.ok(r);assert.ok(A.valid(r));next(r);
    assert.equal(r.parcel,'carried');assert.equal(r.auto.event,'parcel');
    if(approach==='lure')assert.equal(r.street.baits,2);
    else {assert.equal(r.street.dragging,null);assert.ok(Math.hypot(r.street.barrels[1].x-before.street.barrels[1].x,r.street.barrels[1].y-before.street.barrels[1].y)>15);}
    choose(r,'exit');assert.equal(r.status,'extracted');assert.equal(B.rewards(r).parcel,'kept');
  }
});
test('decoy and dragging state freeze at choices and unavailable equipment is not offered',()=>{
  const r=B.create(42,1);A.enable(r);choose(r,'club');
  A.disable(r);assert.ok(B.command(r,'lure',{x:1320,y:1100}));assert.ok(B.command(r,'drag'));A.enable(r);
  const before=structuredClone(r);A.step(r,.1);assert.deepEqual(r,before);assert.deepEqual(B.restore(r),JSON.parse(JSON.stringify(r)));
  r.street.baits=0;r.auto.event='club';
  assert.ok(!A.view(r).choices.some(c=>c.id==='take-lure'));
  r.street.barrels[1].x=1800;r.street.barrels[1].y=800;r.street.dragging=null;
  assert.ok(!A.view(r).choices.some(c=>c.id==='take-barrel'));
});
test('new props restore only in walkable geometry, including tether line of sight',()=>{
  const run=B.create(42,1);
  const wall=structuredClone(run);Object.assign(wall.street.barrels[0],{x:400,y:900});assert.equal(B.restore(wall),null);
  const overlap=structuredClone(run);Object.assign(overlap.street.barrels[0],overlap.street.barrels[1],{id:'street-market'});assert.equal(B.restore(overlap),null);
  const sound=structuredClone(run);sound.street.noise={x:400,y:900,life:2};assert.equal(B.restore(sound),null);
  const tether=B.create(42,3);Object.assign(tether.p,{x:1110,y:1087});Object.assign(tether.street.barrels[0],{x:1110,y:1148});tether.street.dragging='street-market';assert.equal(B.restore(tether),null);
});
test('street layouts start with the player and threatening actors outside solid geometry',()=>{
  for(const day of [1,2,3]){const r=B.create(42,day);assert.ok(!B.solid(r,r.p.x,r.p.y));for(const a of r.actors.filter(a=>['cleaner','guard'].includes(a.type)))assert.ok(!B.solid(r,a.x,a.y,16),r.street.situation+' '+a.id);}
});
test('changing kits and seeds keeps the night routes and extraction reachable',()=>{
  for(const seed of [7,42,99])for(const day of [1,2,3])for(const kit of ['hook','cart','foam']){
    const r=B.create(seed,day,kit);A.enable(r);
    choose(r,'market');assert.equal(r.auto.event,'market');
    choose(r,'noor');assert.equal(r.auto.event,'noor');
    choose(r,'sorting');assert.equal(r.auto.event,'sorting');
    choose(r,'garden');assert.equal(r.auto.event,'gate');
    choose(r,'open-hand');assert.equal(r.auto.event,'garden');
    choose(r,'exit');assert.equal(r.status,'extracted',seed+'/'+day+'/'+kit);assert.ok(B.restore(r));
  }
});
test('dragging around a worksite never clips the barrel through a corner',()=>{
  const r=B.create(42,2);r.actors=[];r.items.forEach(i=>i.lock=2);
  // Use the worksite's east corner; the west side is now separated by the real market wall.
  Object.assign(r.p,{x:1000,y:970});Object.assign(r.street.barrels[0],{x:945,y:1000});
  assert.ok(B.command(r,'drag'));assert.equal(B.command(r,'dash',{x:1000,y:800}),false);
  for(let i=0;i<80;i++){B.step(r,{dy:-1},.05);const b=r.street.barrels[0];assert.ok(!B.solid(r,b.x,b.y,22,b.id));assert.ok(Math.hypot(r.p.x-b.x,r.p.y-b.y)<=65);assert.ok(B.restore(r));}
});
test('being knocked around a corner releases the tether and keeps the save recoverable',()=>{
  const r=B.create(42,2);Object.assign(r.street.barrels[0],{x:522,y:880});Object.assign(r.p,{x:535,y:837});
  const guard=r.actors.find(a=>a.type==='guard');r.actors=[guard];Object.assign(guard,{x:565,y:837,mode:'charge',timer:.5,vx:-380,vy:0});
  assert.ok(B.restore(r));assert.ok(B.command(r,'drag'));B.step(r,{},.025);
  assert.equal(r.street.dragging,null);assert.ok(B.restore(r));assert.equal(r.p.hp,2);
});
