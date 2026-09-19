'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');
function advance(r){for(let n=0;n<6000&&r.status==='active'&&!r.auto.event;n++)A.step(r,.05);assert.notEqual(r.auto.event,'stuck',JSON.stringify({goal:r.auto.goal,p:r.p,time:r.time}));return r;}
function choose(r,id){assert.ok(A.choose(r,id),'available '+id);advance(r);if(r.auto.event==='glimpse'){assert.ok(A.choose(r,'continue'));advance(r);}return r;}
const start=(day=1,kit='hook')=>{const r=B.create(42,day,kit);A.enable(r);return r;};
test('new route menu can start with any district or immediately return without losing cargo',()=>{
 const r=start();assert.deepEqual(A.view(r).choices.map(x=>x.id),['market','club','noor','sorting','garden','exit']);
 choose(r,'exit');assert.equal(r.status,'extracted');
});
test('sorting choices operate the real switch then preserve choice of onward route',()=>{
 for(const choice of ['sorting-stop','sorting-reverse'])for(const day of [1,2,3]){
  const r=start(day);choose(r,'sorting');assert.equal(r.auto.event,'sorting');choose(r,choice);
  assert.equal(r.auto.event,'sorting');assert.equal(r.district.belt,choice==='sorting-stop'?'off':'west');assert.ok(B.restore(r));
  choose(r,'exit');assert.equal(r.status,'extracted');
 }
});
test('three sorting approaches collect physical cargo in every situation and kit, including restored travel',()=>{
 for(const day of [1,2,3])for(const kit of ['hook','cart','foam'])for(const choice of ['sorting-take','sorting-hook','sorting-foam']){
  let r=start(day,kit);choose(r,'sorting');assert.ok(A.choose(r,choice),choice);A.step(r,.1);r=B.restore(r);assert.ok(r&&A.valid(r));advance(r);
  assert.equal(r.auto.event,'sorting');assert.ok(r.bag.includes('item10'),day+'/'+kit+'/'+choice);choose(r,'exit');assert.equal(r.status,'extracted');
 }
});
test('greenhouse valve and harvest choices really travel to their objects',()=>{
 const r=start();choose(r,'garden');if(r.auto.event==='gate')choose(r,'open-hook');assert.equal(r.auto.event,'garden');
 choose(r,'garden-valve');assert.equal(r.auto.event,'garden');assert.ok(r.district.irrigation>0);assert.ok(Math.hypot(r.p.x-1680,r.p.y-470)<70);
 choose(r,'garden-harvest');assert.ok(r.bag.includes('item11'));assert.equal(r.auto.event,'garden');choose(r,'exit');assert.equal(r.status,'extracted');
});
test('repair choice only appears with a real spare, consumes it once and returns to greenhouse choices',()=>{
 const r=start();choose(r,'garden');if(r.auto.event==='gate')choose(r,'open-hook');
 const hasSpare=()=>r.bag.some(id=>r.items.find(x=>x.id===id).kind==='salvage');
 if(!hasSpare()){choose(r,'sorting');choose(r,'sorting-take');choose(r,'garden');}
 assert.ok(hasSpare());const before=r.bag.filter(id=>r.items.find(x=>x.id===id).kind==='salvage').length;
 choose(r,'garden-repair');assert.ok(r.discovered.includes('greenhouse-pump'));assert.equal(r.bag.filter(id=>r.items.find(x=>x.id===id).kind==='salvage').length,before-1);
 assert.ok(!A.view(r).choices.some(c=>c.id==='garden-repair'));assert.ok(B.restore(r));
});
test('capacity chooses which kind to drop and never discards a different last item',()=>{
 const r=start();r.bag=['item0','item1','item2','item3'];for(const id of r.bag)r.items.find(i=>i.id===id).state='bag';r.auto.event='capacity';r.auto.goal=null;
 const choices=A.view(r).choices;assert.ok(choices.length<=9);const bottle=choices.find(c=>c.id==='drop-item0');assert.ok(bottle);
 assert.ok(A.choose(r,bottle.id));assert.ok(!r.bag.includes('item0'));assert.ok(r.bag.includes('item3'));assert.equal(r.items[0].state,'world');
});
test('old v3 keeps its old route and rejects new-only automatic goals',()=>{
 const r=B.create(42,1);r.version=3;delete r.district;A.enable(r);
 assert.deepEqual(A.view(r).choices.map(c=>c.id),['market','club','noor']);
 for(const goal of ['sorting-stop','sorting-take','garden-valve','garden-repair']){const bad=structuredClone(r);bad.auto.event=null;bad.auto.goal=goal;assert.equal(A.valid(bad),false);}
});

test('malformed legacy automatic visits reject cleanly',()=>{
 const r=B.create();r.version=3;delete r.district;A.enable(r);r.auto.visited={};assert.equal(A.valid(r),false);
});
test('sorting arrival records an actual visit before a player can immediately leave',()=>{
 const r=start();choose(r,'sorting');assert.equal(B.zone(r).id,'sorting');assert.ok(r.district.visited.includes('sorting'));
});

test('intercepted switch hook reports failure instead of recording a completed reverse',()=>{
 const r=start();Object.assign(r.p,{x:1515,y:890});Object.assign(r.items[10],{x:1560,y:890});r.auto.event='sorting';const message=r.message,sequence=r.sequence;
 choose(r,'sorting-reverse');assert.equal(r.district.belt,'east');assert.equal(r.auto.event,'sorting');assert.ok(!r.auto.visited.includes('sorting-reverse'));assert.ok(r.sequence>sequence);assert.notEqual(r.message,message);assert.ok(B.restore(r));
});
test('dropping the only spare while travelling to repair gives a retryable failure',()=>{
 const r=start();r.opened=true;r.discovered.push('greenhouse');Object.assign(r.p,{x:1800,y:495});r.items[3].state='bag';r.bag=['item3'];r.auto.event='garden';
 assert.ok(A.choose(r,'garden-repair'));assert.ok(B.command(r,'drop',{x:2000,y:495,itemId:'item3'}));const message=r.message,sequence=r.sequence;advance(r);
 assert.equal(r.auto.event,'garden');assert.equal(r.district.repaired,false);assert.ok(!r.auto.visited.includes('garden-repair'));assert.ok(r.sequence>sequence);assert.notEqual(r.message,message);assert.ok(B.restore(r));
});
