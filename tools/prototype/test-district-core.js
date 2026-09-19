'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./backstage-core.js');
const clone=r=>structuredClone(r);
function run(){const r=B.create(11,1);r.actors=[];for(const i of r.items){i.vx=0;i.vy=0;}return r;}
function advance(r,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=.025)B.step(r,input,Math.min(.025,seconds-t));}
function bag(r,...ids){r.bag=ids;for(const id of ids)r.items.find(i=>i.id===id).state='bag';if(ids.includes('item6'))r.parcel='carried';}
function at(r,x,y){Object.assign(r.p,{x,y});assert.ok(!B.solid(r,x,y),'legal player position '+x+','+y);}
function district(r){assert.ok(r.district,'new runs have district state');return r.district;}
function beltRun(direction='east'){const r=run();district(r).belt=direction;at(r,900,900);Object.assign(r.items[10],{x:1830,y:1030});return r;}

test('new v4 runs retain all 17 item identities and expose exact district geometry',()=>{
  const r=run();assert.equal(r.version,4);assert.deepEqual(district(r),{belt:'east',irrigation:0,repaired:false,visited:[]});
  assert.equal(r.items.length,17);assert.deepEqual(r.items.map(i=>i.id),Array.from({length:17},(_,i)=>'item'+i));
  assert.deepEqual(r.items.map(i=>i.kind),['bottle','hops','barrel','salvage','bottle','hops','parcel','bottle','salvage','barrel','salvage','hops','bottle','bottle','salvage','bottle','salvage']);
  const info=B.districtInfo(r);assert.equal(info.enabled,true);
  assert.deepEqual(info.belt,{x:1690,y:990,w:280,h:80,direction:'east',speed:60});
  assert.deepEqual(info.switch,{x:1600,y:890});assert.deepEqual(info.valve,{x:1680,y:470});
  assert.deepEqual(info.water,{x:1840,y:440,w:200,h:75,wet:true});
  assert.equal(info.repaired,false);assert.equal(info.irrigation,0);assert.deepEqual(B.restore(r),r);
});
test('belt moves world loot east or west, and off stops motion',()=>{
  for(const [direction,delta] of [['east',30],['west',-30],['off',0]]){
    const r=beltRun(direction);advance(r,.5);assert.ok(Math.abs(r.items[10].x-1830-delta)<.01);assert.equal(r.items[10].state,'world');
    assert.equal(B.districtInfo(r).belt.speed,delta*2);
  }
});
test('foam pauses only objects whose centers are inside the local patch',()=>{
  const r=beltRun();Object.assign(r.items[12],{x:1940,y:1030});r.patches=[{x:1780,y:1030,life:4}];advance(r,.25);
  assert.equal(r.items[10].x,1830);assert.ok(r.items[12].x>1940);
  at(r,1750,1030);const x=r.p.x;advance(r,.1);assert.equal(r.p.x,x);
});
test('belt leaves bagged and delivered items alone and pushes the player through collision movement',()=>{
  const r=beltRun();bag(r,'item10');r.items[12].state='delivered';Object.assign(r.items[12],{x:1830,y:1030});
  at(r,1760,1030);advance(r,.5);assert.ok(Math.abs(r.p.x-1790)<.01);assert.equal(r.items[10].x,1830);assert.equal(r.items[12].x,1830);
  const blocked=beltRun();Object.assign(blocked.street.barrels[1],{x:1860,y:1030});at(blocked,1820,1030);Object.assign(blocked.items[10],{x:1800,y:1030});
  advance(blocked,1);assert.ok(blocked.p.x<=1825);assert.ok(!B.solid(blocked,blocked.p.x,blocked.p.y));assert.ok(blocked.items[10].x<=1830);assert.ok(!B.solid(blocked,blocked.items[10].x,blocked.items[10].y,8));
});
test('nearby E toggles the switch and hook reverses it within real range',()=>{
  const r=run();at(r,1600,890);assert.equal(B.nearest(r)?.id,'conveyor-switch');
  assert.equal(B.command(r,'interact'),true);assert.equal(district(r).belt,'off');assert.equal(B.command(r,'interact'),true);assert.equal(r.district.belt,'east');
  at(r,1510,890);assert.equal(B.command(r,'interact'),false);B.command(r,'hook',{x:1600,y:890});assert.equal(r.district.belt,'west');
  r.p.hook=0;B.command(r,'hook',{x:1600,y:890});assert.equal(r.district.belt,'east');
  r.district.belt='off';r.p.hook=0;B.command(r,'hook',{x:1600,y:890});assert.equal(r.district.belt,'west');
  assert.ok(r.location.outcomes.includes('sorting-stopped'));assert.ok(r.location.outcomes.includes('sorting-reversed'));
});
test('switch LOS and hook range block the effect even though hook firing itself succeeds',()=>{
  const r=run();Object.assign(r.street.barrels[1],{x:1576,y:890});at(r,1538,890);assert.equal(B.clear(r,r.p,{x:1600,y:890}),false);
  B.command(r,'interact');B.command(r,'hook',{x:1600,y:890});assert.equal(district(r).belt,'east');
  const far=run();at(far,1300,850);B.command(far,'hook',{x:1600,y:890});assert.equal(district(far).belt,'east');
});
test('valve closes sprinklers for 12 simulation seconds and auto choice freezes the countdown',()=>{
  const r=run();at(r,1680,470);assert.equal(B.nearest(r)?.id,'garden-valve');assert.equal(B.districtInfo(r).water.wet,true);
  assert.equal(B.command(r,'interact'),true);assert.equal(district(r).irrigation,12);assert.equal(B.districtInfo(r).water.wet,false);
  r.auto={enabled:true,event:'garden'};const before=clone(r);advance(r,1);assert.deepEqual(r,before);delete r.auto;
  advance(r,11);assert.ok(r.district.irrigation>0);assert.equal(B.districtInfo(r).water.wet,false);advance(r,1.1);assert.equal(r.district.irrigation,0);assert.equal(B.districtInfo(r).water.wet,true);
  r.time=7;assert.equal(B.districtInfo(r).water.wet,false);assert.ok(r.location.outcomes.includes('greenhouse-valve'));
});
test('hook can close a visible valve but cannot pass glass or exceed reach',()=>{
  const visible=run();at(visible,1800,470);B.command(visible,'hook',{x:1680,y:470});assert.equal(district(visible).irrigation,12);
  for(const [x,y] of [[1510,470],[2010,470]]){const r=run();at(r,x,y);B.command(r,'hook',{x:1680,y:470});assert.equal(district(r).irrigation,0);}
});
test('wet ground slows walking at a legal y490 route and drift respects the greenhouse wall',()=>{
  const wet=run(),dry=run();district(dry).irrigation=12;
  for(const r of [wet,dry])at(r,1850,490);advance(wet,.5,{dx:1});advance(dry,.5,{dx:1});
  assert.ok(wet.p.x<dry.p.x-10);assert.ok(wet.p.y>490&&wet.p.y<510);assert.equal(dry.p.y,490);
  at(wet,1950,501);advance(wet,1,{dy:1});assert.ok(!B.solid(wet,wet.p.x,wet.p.y));assert.ok(wet.p.y<=527);
});
test('repair needs a nearby visible valve and salvage, consumes one part exactly once and persists',()=>{
  const r=run();bag(r,'item3','item8','item0');assert.equal(B.command(r,'repair'),false);at(r,1680,470);
  assert.equal(B.command(r,'repair'),true);assert.equal(r.items[3].state,'delivered');assert.deepEqual(r.bag,['item8','item0']);assert.equal(district(r).repaired,true);assert.ok(r.discovered.includes('greenhouse-pump'));
  assert.ok(r.location.outcomes.includes('greenhouse-repaired'));const saved=B.restore(r);assert.ok(saved);assert.equal(B.command(saved,'repair'),false);assert.deepEqual(saved.bag,['item8','item0']);
  saved.time=0;saved.district.irrigation=0;assert.equal(B.districtInfo(saved).water.wet,false);
  const next=B.create(11,2,'hook',saved.discovered);assert.equal(next.district.repaired,true);assert.deepEqual(B.restore(next),next);
  const empty=run();at(empty,1680,470);assert.equal(B.command(empty,'repair'),false);
  const blocked=run();bag(blocked,'item3');Object.assign(blocked.street.barrels[1],{x:1710,y:470});at(blocked,1745,470);assert.equal(B.clear(blocked,blocked.p,{x:1680,y:470}),false);
  assert.equal(B.command(blocked,'repair'),false);B.command(blocked,'interact');assert.equal(district(blocked).irrigation,0);assert.equal(blocked.items[3].state,'bag');
});
test('drop selects a bag item, rejects unknown/world ids without inventory mutation, and preserves throw behavior',()=>{
  const r=run();bag(r,'item0','item3');const aim={x:r.p.x+100,y:r.p.y,itemId:'item0'},aimBefore=clone(aim);
  assert.equal(B.command(r,'drop',aim),true);assert.deepEqual(aim,aimBefore);assert.deepEqual(r.bag,['item3']);assert.equal(r.items[0].state,'world');assert.equal(r.items[0].x,r.p.x);assert.equal(r.items[0].vx,420);assert.equal(r.items[0].lock,1.2);
  for(const itemId of ['unknown','item0','item1']){const before=clone({bag:r.bag,items:r.items});assert.equal(B.command(r,'drop',{itemId}),false);assert.deepEqual({bag:r.bag,items:r.items},before);}
  assert.equal(B.command(r,'drop'),true);assert.equal(r.items[3].state,'world');assert.deepEqual(r.bag,[]);assert.ok(B.restore(r));
});
test('ordinary E and collect use exact requested item, 45 range, LOS and capacity',()=>{
  const r=run();at(r,1600,890);Object.assign(r.items[10],{x:1600,y:930});assert.equal(B.nearest(r)?.id,'conveyor-switch');
  assert.equal(B.command(r,'collect',{itemId:'item10'}),true);assert.ok(r.bag.includes('item10'));assert.equal(district(r).belt,'east');
  const manual=run();at(manual,900,900);Object.assign(manual.items[10],{x:945,y:900});assert.equal(B.nearest(manual)?.id,'item10');assert.equal(B.command(manual,'interact'),true);
  const far=run();at(far,900,900);Object.assign(far.items[10],{x:946,y:900});assert.equal(B.command(far,'collect',{itemId:'item10'}),false);assert.equal(far.items[10].state,'world');
  const blocked=run();at(blocked,747,900);Object.assign(blocked.items[10],{x:781,y:900});assert.ok(!B.clear(blocked,blocked.p,blocked.items[10]));assert.equal(B.command(blocked,'collect',{itemId:'item10'}),false);
  const full=run();at(full,900,900);bag(full,'item0','item1','item3','item4','item5','item7','item8','item11');Object.assign(full.items[10],{x:930,y:900});assert.equal(B.command(full,'collect',{itemId:'item10'}),false);
  for(const itemId of ['unknown','item0','item6'])assert.equal(B.command(full,'collect',{itemId}),false);
  const thrown=run();at(thrown,900,900);Object.assign(thrown.items[10],{x:930,y:900,lock:1});assert.equal(B.command(thrown,'collect',{itemId:'item10'}),false);assert.equal(thrown.items[10].state,'world');
});
test('ordinary auto pickup checks LOS in v4 while old v3 keeps original pickup behavior',()=>{
  for(const version of [3,4]){const r=run();r.version=version;if(version===3)delete r.district;at(r,747,900);Object.assign(r.items[10],{x:775,y:900});assert.ok(!B.clear(r,r.p,r.items[10]));advance(r,.025);assert.equal(r.items[10].state,version===4?'world':'bag');}
});
test('visited records unique entered zones only, survives restore and remains separate from choice intent',()=>{
  const r=run();assert.deepEqual(district(r).visited,[]);at(r,900,600);advance(r,.025);assert.deepEqual(r.district.visited,[]);
  for(const [x,y] of [[210,1140],[210,1140],[510,320],[1180,1020],[1600,890],[1680,470]]){at(r,x,y);advance(r,.025);}
  assert.deepEqual(r.district.visited,['market','redlight','club','sorting','greenhouse']);assert.deepEqual(B.restore(r).district.visited,r.district.visited);
  B.command(r,'bail');const reward=B.rewards(r);assert.deepEqual(reward.visited,r.district.visited);assert.equal(reward.cash,0);assert.equal(reward.cups,0);assert.equal(reward.hops,0);reward.visited.pop();assert.equal(r.district.visited.length,5);
});
test('v1/v2/v3 restore without adding district and old v3 retains location behavior only',()=>{
  for(const version of [1,2,3]){const old=run();old.version=version;delete old.district;if(version<3)delete old.location;if(version===1)delete old.street;
    const r=B.restore(old);assert.ok(r);assert.equal(Object.hasOwn(r,'district'),false);assert.equal(B.districtInfo(r).enabled,false);assert.equal(B.locationInfo(r).enabled,version===3);
    at(r,1600,890);assert.equal(B.command(r,'repair'),false);assert.equal(B.command(r,'collect',{itemId:'item10'}),false);assert.notEqual(B.nearest(r)?.id,'conveyor-switch');B.command(r,'hook',{x:1600,y:890});
    Object.assign(r.items[10],{x:1830,y:1030});advance(r,.5);assert.equal(r.items[10].x,1830);B.command(r,'bail');assert.deepEqual(B.rewards(r).visited,[]);
  }
});
test('restore validates district structure, discoveries and all seven outcome ids',()=>{
  const r=run();assert.ok(district(r));
  for(const patch of [{belt:'north'},{irrigation:-1},{irrigation:13},{repaired:'yes'},{visited:['street']},{visited:['market','market']},{visited:['fake']},{visited:null},{extra:1}]){const bad=clone(r);Object.assign(bad.district,patch);assert.equal(B.restore(bad),null,JSON.stringify(patch));}
  const missing=clone(r);delete missing.district;assert.equal(B.restore(missing),null);
  const unknown=clone(r);unknown.location.outcomes.push('fake');assert.equal(B.restore(unknown),null);
  const all=run();all.location.marketOpen=true;all.discovered=['greenhouse','noor','market-shortcut','greenhouse-pump'];all.district.repaired=true;all.location.outcomes=['market-salvaged','market-shortcut','club-backstage','sorting-stopped','sorting-reversed','greenhouse-valve','greenhouse-repaired'];assert.ok(B.restore(all));
});
test('v4 snapshots all three daytime clues while v3 keeps its original two-clue schema',()=>{
  const context={clues:['market','club','greenhouse','greenhouse','fake']},r=B.create(11,1,'hook',[],context);
  assert.deepEqual(r.location.clues,['market','club','greenhouse']);context.clues.length=0;assert.deepEqual(B.restore(r),r);
  const old=clone(r);old.version=3;delete old.district;assert.equal(B.restore(old),null);old.location.clues=['market','club'];assert.ok(B.restore(old));
  old.location.outcomes=['sorting-stopped'];assert.equal(B.restore(old),null);
});

test('the promised sorting spare starts on the working conveyor and actually travels',()=>{
 const r=run(),before=r.items[10].x;advance(r,.5);assert.ok(r.items[10].x>before);
});
