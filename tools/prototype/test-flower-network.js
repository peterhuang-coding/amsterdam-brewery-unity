'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reopening-core'),J=require('./journey-core'),C=require('./reopening-city'),B=require('./backstage-core');
const prep=()=>R.act(R.createGame(42),{type:'start'}).state;
function act(s,a){const before=structuredClone(s),out=R.act(s,a);assert.equal(out.ok,true,out.message);assert.deepEqual(s,before);assert.ok(R.restore(out.state),'restore '+a.type);return out.state;}
function reject(s,a){const before=structuredClone(s),out=R.act(s,a);assert.equal(out.ok,false);assert.deepEqual(s,before);}
test('flower network',async t=>{
  await t.test('Ada route is free but learning an address does not claim a visit',()=>{
    const before=prep();let s=act(before,{type:'gardenAsk'});assert.equal(s.cash,45);assert.equal(s.actions,2);assert.deepEqual(s.batches,before.batches);assert.equal(s.garden.known,true);assert.equal(s.garden.introduced,true);assert.deepEqual(s.garden.visits,[]);assert.equal(s.backstage.discovered.includes('greenhouse'),false);
    s=act(s,{type:'gardenAsk'});assert.deepEqual(s.garden.visits,[]);assert.match(R.garden.notes(s)[0],/Ada/);
  });
  await t.test('walking or following reaches a real entry without teleporting the bicycle',()=>{
    for(const mounted of [false,true]){
      const start={...C.create(),x:R.garden.CART.x,y:R.garden.CART.y,bike:{...R.garden.CART,mounted}};let position=start,path=C.route(start,R.garden.ENTRY);
      assert.ok(path.length);for(let i=0;i<300&&path.length;i++){const r=C.moveAlong(position,path,.1);position=r.position;path=r.path;assert.ok(C.walkable(position.x,position.y));}assert.equal(path.length,0);
      const s=act(prep(),{type:'gardenVisit',position,source:mounted?'cart':undefined});assert.equal(s.cash,45);assert.equal(s.actions,2);assert.deepEqual(s.garden.visits,[1]);assert.equal(s.garden.source,mounted?'cart':'self');assert.ok(s.backstage.discovered.includes('greenhouse'));
      assert.equal(position.bike.x,mounted?position.x:start.bike.x);assert.equal(position.bike.y,mounted?position.y:start.bike.y);
    }
  });
  await t.test('distant or malformed visits fail and repeat visits grant no resources',()=>{
    const s=prep();for(const position of [null,C.PLACES.flowers,{x:Infinity,y:690}])reject(s,{type:'gardenVisit',position});
    let visited=act(s,{type:'gardenVisit',position:R.garden.ENTRY});visited=act(visited,{type:'gardenVisit',position:R.garden.ENTRY});assert.deepEqual(visited.garden.visits,[1]);assert.deepEqual(visited.batches,s.batches);assert.equal(visited.hops,0);
    visited=act(visited,{type:'open'});reject(visited,{type:'gardenVisit',position:R.garden.ENTRY});reject(visited,{type:'gardenAsk'});
  });
  await t.test('day discovery unlocks the existing night exit and actual repair returns to the next delivery',()=>{
    let s=act(prep(),{type:'gardenVisit',position:R.garden.ENTRY});s=act(act(s,{type:'open'}),{type:'close'});s=act(s,{type:'explore',kit:'hook'});const r=s.backstage.run;
    assert.equal(r.opened,true);assert.ok(r.discovered.includes('greenhouse'));
    // Existing engine API: physical pickup and valve interaction, not a forged discovery flag.
    const part=r.items.find(i=>i.kind==='salvage');r.p.x=part.x;r.p.y=part.y;B.command(r,'collect',{itemId:part.id});
    const valve=B.districtInfo(r).valve;r.p.x=valve.x;r.p.y=valve.y;assert.equal(B.command(r,'repair'),true);
    Object.assign(r.p,B.GARDEN_EXIT);assert.equal(B.command(r,'interact'),true);s=act(s,{type:'returnExplore'});s=act(s,{type:'next'});
    s=act(s,{type:'journeyStart',kind:'delivery'});assert.equal(s.journeys.run.garden.pump,true);assert.equal(s.journeys.run.garden.known,true);assert.match(R.garden.notes(s).join(' '),/不再减速/);
  });
  await t.test('old current trips are not migrated to v4 and old discoveries seed the network',()=>{
    let s=act(prep(),{type:'journeyStart',kind:'delivery'});s.journeys.run=J.create(42,1,'delivery',3);delete s.garden;const before=structuredClone(s.journeys.run);s=R.restore(s);assert.deepEqual(s.journeys.run,before);assert.equal(s.garden.known,false);
    const old=prep();delete old.garden;old.backstage.discovered=['greenhouse'];const restored=R.restore(old);assert.equal(restored.garden.source,'night');assert.deepEqual(restored.garden.visits,[]);
  });
  await t.test('network state rejects invented sources and contradictory visits',()=>{
    for(const patch of [{known:true},{introduced:true},{visits:[1]},{source:'unknown'},{visits:[2]},{extra:true}]){const s=prep();Object.assign(s.garden,patch);assert.equal(R.restore(s),null);}
  });
});
