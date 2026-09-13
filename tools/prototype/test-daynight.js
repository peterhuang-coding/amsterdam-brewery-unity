'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reopening-core'),B=require('./backstage-core');
const act=(s,a)=>{const r=R.act(s,a);assert.ok(r.ok,r.message);assert.ok(R.restore(r.state),'result remains a valid save: '+a.type);return r.state;};
const prep=()=>act(R.createGame(42),{type:'start'});
const closed=()=>act(act(prep(),{type:'open'}),{type:'close'});
function bouquet(s,stems=[0,1,2],wrap='ribbon'){
  s=act(s,{type:'flowerStart'});for(const stem of stems)s=act(s,{type:'flowerPick',stem});
  s=act(s,{type:'flowerWrap',wrap});return act(s,{type:'flowerFinish'});
}
test('expeditions start after closing, return to the same night, and do not use tomorrow’s actions',()=>{
  assert.equal(R.act(prep(),{type:'explore',kit:'hook'}).ok,false);
  let s=act(closed(),{type:'explore',kit:'hook'});assert.equal(s.backstage.from,'summary');
  B.command(s.backstage.run,'bail');s=act(s,{type:'returnExplore'});assert.equal(s.phase,'summary');
  assert.equal(R.act(s,{type:'explore',kit:'hook'}).ok,false);
  s=act(s,{type:'next'});assert.equal(s.actions,2);assert.equal(s.day,2);
});
test('after-hours cash does not rewrite the business receipt; Noor appears the next evening',()=>{
  let s=closed(),receipt=structuredClone(s.reports[0]);s=act(s,{type:'explore',kit:'hook'});
  const r=s.backstage.run,item=r.items.find(i=>i.kind==='parcel');Object.assign(r.p,{x:item.x,y:item.y});B.command(r,'interact');
  Object.assign(r.p,B.NOOR);B.command(r,'interact');Object.assign(r.p,B.EXIT);B.command(r,'interact');
  s=act(s,{type:'returnExplore'});assert.equal(s.cash,receipt.cash+14);assert.deepEqual(s.reports[0],receipt);
  assert.equal(s.backstage.cashAfterClose,14);s=act(s,{type:'next'});
  assert.ok(s.life.morning.some(n=>n.includes('Noor')));assert.equal(s.backstage.cashAfterClose,0);
  s=act(s,{type:'open'});assert.ok(s.night.orders.some(o=>o.name==='Noor'));
});
test('old in-progress daytime expedition saves keep their departure phase',()=>{
  const old=prep();delete old.life;old.phase='explore';old.actions=1;old.prepared=['explore'];
  old.backstage={run:B.create(42,1,'hook',[]),discovered:[],resolution:null,trips:0};
  let s=R.restore(old);assert.ok(s);assert.equal(s.backstage.from,'prep');B.command(s.backstage.run,'bail');
  s=act(s,{type:'returnExplore'});assert.equal(s.phase,'prep');assert.equal(s.actions,1);
});
test('flower arrangement is optional, cancellable, and pays only when three distinct stems are wrapped',()=>{
  let s=act(prep(),{type:'flowerStart'});s=act(s,{type:'flowerPick',stem:0});s=act(s,{type:'flowerPick',stem:0});assert.equal(s.life.arrangement.stems.length,0);
  assert.equal(R.act(s,{type:'flowerFinish'}).ok,false);assert.equal(R.act(s,{type:'open'}).ok,false);
  s=act(s,{type:'flowerCancel'});assert.equal(s.cash,45);assert.equal(s.actions,2);
  s=bouquet(s);assert.equal(s.cash,41);assert.equal(s.actions,1);assert.equal(s.life.bouquet.palette,'warm');
  assert.equal(R.act(s,{type:'flowerStart'}).ok,false);
});
test('one bouquet can be stored, retrieved and gifted once; it never becomes brewing stock',()=>{
  let s=bouquet(prep()),batches=structuredClone(s.batches);
  s=act(s,{type:'flowerStore',stored:true});assert.equal(R.act(s,{type:'flowerUse',target:'lotte'}).ok,false);
  s=act(s,{type:'flowerStore',stored:false});s=act(s,{type:'flowerUse',target:'lotte'});
  assert.equal(s.friends.lotte,2);assert.equal(s.life.bouquet,null);assert.deepEqual(s.batches,batches);assert.equal(s.hops,0);
  assert.equal(R.act(s,{type:'flowerUse',target:'display'}).ok,false);
});
test('a matching window arrangement improves actual guest patience and survives the night',()=>{
  let s=bouquet(prep(),[3,4,5],'paper');s=act(s,{type:'flowerUse',target:'display'});
  const plain=act(prep(),{type:'open'});s=act(s,{type:'open'});
  assert.equal(s.night.orders[0].patience,plain.night.orders[0].patience+6);
  s=act(act(s,{type:'close'}),{type:'next'});assert.ok(s.life.display);assert.equal(s.life.bouquet,null);
});
test('malformed flower saves are rejected while legacy saves migrate',()=>{
  const s=prep();delete s.life;assert.ok(R.restore(s));
  const bad=bouquet(prep());bad.life.bouquet.stored='yes';assert.equal(R.restore(bad),null);
});
test('skipping a later expedition keeps dated discoveries rather than inventing last-night cargo',()=>{
  let s=act(closed(),{type:'explore',kit:'hook'});const r=s.backstage.run,box=r.items.find(i=>i.kind==='parcel');Object.assign(r.p,{x:box.x,y:box.y});B.command(r,'interact');Object.assign(r.p,B.EXIT);B.command(r,'interact');s=act(s,{type:'returnExplore'});
  s=act(s,{type:'next'});s=act(act(act(s,{type:'open'}),{type:'close'}),{type:'next'});
  assert.ok(s.life.morning[0].includes('第 1 夜'));assert.ok(s.life.morning.every(line=>!/(昨夜|昨晚)/.test(line)));
});
