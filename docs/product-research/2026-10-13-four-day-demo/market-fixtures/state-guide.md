# Public state guide (source excerpts from adopted 0178350e2fb544a77c8512585ae292e50c54d5ad)

This is an excerpt only, not a runnable test or new implementation. Use Read ranges. backstage-core.js: rooms59-71; create125-145; market-power command252ff; marketInfo402-427. backstage-scene.js: block30-94; draw204-265, shelf call231; old recorder test-night-map-scene.js1-115 with true transforms.

## Existing real-state fixture examples
```js
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');

const shift=(day=1,kit='hook',seed=42)=>B.create(seed,day,kit,[],{marketShift:true});
function advance(r,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=.025)B.step(r,input,Math.min(.025,seconds-t));}
function walkTo(r,to){
  for(let n=0;n<6000&&Math.hypot(to.x-r.p.x,to.y-r.p.y)>6;n++){
    const d=Math.hypot(to.x-r.p.x,to.y-r.p.y);
    B.step(r,{dx:(to.x-r.p.x)/d,dy:(to.y-r.p.y)/d},.025);
    assert.ok(!B.solid(r,r.p.x,r.p.y));
  }
  assert.ok(Math.hypot(to.x-r.p.x,to.y-r.p.y)<8,JSON.stringify({p:r.p,to}));
}
function autoNext(r){
  for(let n=0;n<8000&&r.status==='active'&&!r.auto.event;n++){
    A.step(r,.05);assert.ok(!B.solid(r,r.p.x,r.p.y));
  }
  assert.notEqual(r.auto.event,'stuck',JSON.stringify({p:r.p,time:r.time}));
  assert.ok(r.auto.event||r.status!=='active');
}
function autoPick(r,id){
  if(!r.auto?.enabled)A.enable(r);
  assert.ok(A.choose(r,id),'choice available: '+id);autoNext(r);
}

test('marketShift is strict opt-in: old create calls keep the old night run',()=>{
  const legacy=B.create(42,1);
  assert.equal(Object.hasOwn(legacy,'marketShift'),false);
  assert.equal(B.marketInfo(legacy).enabled,false);
  assert.deepEqual(B.restore(legacy),legacy);
  const enabled=shift(1);
  assert.equal(enabled.marketShift.version,1);
  assert.equal(B.marketInfo(enabled).enabled,true);
});

test('the same seed/day reproduces the shift and three nights cover all conditions',()=>{
  const runs=[1,2,3].map(d=>shift(d));
  assert.deepEqual(runs[0],shift(1));
  assert.deepEqual(runs,JSON.parse(JSON.stringify(runs)));
  assert.deepEqual(runs.map(r=>r.marketShift.condition),['staffed','restock','blackout']);
  // Formula: cast seed to uint first, then add day-1.
  for(const [seed,day,cond] of [[42,1,'staffed'],[42,2,'restock'],[42,3,'blackout'],[7,1,'restock'],[1,1,'restock']]){
```

## Existing blackout power command regression
```js
test('blackout locks the cold stock until a real part is consumed at the fuse',()=>{
  const r=shift(3);r.actors=[];
  assert.equal(B.marketInfo(r).powered,false);
  assert.equal(B.command(r,'collect',{itemId:'item1'}),false,'cannot grab cold goods from afar either');
  Object.assign(r.p,{x:740,y:850});
  assert.equal(B.command(r,'collect',{itemId:'item1'}),false,'cold stock refuses even when standing on it');
  assert.notEqual(B.nearest(r)?.id,'item1','locked item is not advertised as an interaction');
  // Fuse repair without a carried part fails and consumes nothing.
  Object.assign(r.p,{x:700,y:1105});
  assert.equal(B.command(r,'market-power'),false);
  assert.equal(r.marketShift.powerItem,null);
  // Bring the existing salvage part from the unloading area: approach collinearly and stop
  // at 43px, outside the 31px proximity auto-stow.
  walkTo(r,{x:680,y:1142});
  assert.equal(B.command(r,'collect',{itemId:'item3'}),true);
  walkTo(r,{x:700,y:1105});
  assert.equal(B.command(r,'market-power'),true);
  assert.equal(r.marketShift.powerItem,'item3');
  assert.equal(r.items[3].state,'delivered');
  assert.equal(B.marketInfo(r).powered,true);
  assert.equal(B.command(r,'market-power'),false,'no free second repair');
  // Cold goods can now be collected.
  walkTo(r,{x:740,y:850});
```
