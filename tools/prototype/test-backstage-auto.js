'use strict';
const assert=require('node:assert/strict');
const R=require('./reopening-core.js'),B=require('./backstage-core.js');
let count=0;
function test(name,fn){fn();console.log('✓ '+name);count++;}
function enter(mode){let s=R.act(R.createGame(42),{type:'start'}).state;return R.act(s,{type:'explore',kit:'hook',mode}).state;}
test('new expeditions default to a paused automatic choice while manual stays available',()=>{
  assert.equal(enter().backstage.run.auto?.enabled,true);
  assert.equal(enter().backstage.run.auto.event,'route');
  assert.equal(enter('manual').backstage.run.auto,undefined);
});
const A=require('./backstage-auto.js');
function next(r){for(let n=0;n<4000&&r.status==='active'&&!r.auto.event;n++){A.step(r,.05);assert.equal(B.solid(r,r.p.x,r.p.y),false,'automatic movement stays outside walls');}assert.ok(r.auto.event||r.status!=='active','journey reaches a choice or actual ending');}
function pick(r,id){assert.ok(A.choose(r,id),'choice is available: '+id);next(r);}
test('reading choices freezes actors, cargo, cooldowns and expedition time',()=>{
  const r=enter().backstage.run,before=structuredClone(r);for(let i=0;i<100;i++)A.step(r,.1);assert.deepEqual(r,before);
  assert.equal(A.choose(r,'invent-money'),false);assert.deepEqual(r,before);
});
test('automatic choices travel through the actual city and settle the Noor and greenhouse loop',()=>{
  let s=enter(),r=s.backstage.run;
  pick(r,'club');assert.equal(r.auto.event,'club');assert.ok(r.time>3);
  pick(r,'take-foam');assert.equal(r.parcel,'carried');assert.equal(r.auto.event,'parcel');
  pick(r,'noor');assert.equal(r.parcel,'carried','handover waits for a deliberate choice');
  pick(r,'handover');assert.equal(r.parcel,'returned');
  pick(r,'garden');assert.equal(r.auto.event,'gate');
  pick(r,'open-hook');assert.equal(r.auto.event,'garden');assert.ok(r.discovered.includes('greenhouse'));
  pick(r,'exit');assert.equal(r.status,'extracted');
  const reward=B.rewards(r);assert.ok(reward.cash>=14);assert.ok(R.restore(s));
  s=R.act(s,{type:'returnExplore'}).state;assert.equal(s.backstage.resolution,'returned');
  assert.equal(R.act(s,{type:'returnExplore'}).ok,false);
});
test('choosing to keep the box leads to the kept consequence rather than a fake handover',()=>{
  const r=enter().backstage.run;pick(r,'club');pick(r,'take-hook');pick(r,'exit');
  assert.equal(B.rewards(r).parcel,'kept');assert.equal(B.rewards(r).hops,0);
});
test('a full bag pauses for an explicit cargo decision and does not silently discard goods',()=>{
  const r=enter().backstage.run;pick(r,'club');
  for(const i of r.items.filter(i=>i.kind!=='parcel'))if(B.load(r)+B.TYPES[i.kind].weight<=B.KITS[r.kit].capacity){i.state='bag';r.bag.push(i.id);}
  const bag=[...r.bag];pick(r,'take-foam');assert.equal(r.auto.event,'capacity');assert.deepEqual(r.bag,bag);
  assert.ok(A.choose(r,'leave-box'));assert.deepEqual(r.bag,bag);
});
test('switching control does not teleport or consume time and invalidates the old route',()=>{
  const r=enter().backstage.run;A.choose(r,'club');A.step(r,.1);const p=structuredClone(r.p),t=r.time;
  A.disable(r);A.step(r,.1);assert.deepEqual(r.p,p);assert.equal(r.time,t);
  A.enable(r);assert.equal(r.auto.event,'route');assert.equal(r.auto.goal,null);assert.deepEqual(r.p,p);
});
test('pending and travelling saves resume valid decisions, legacy runs remain valid, malformed auto state rejects',()=>{
  const s=enter(),r=s.backstage.run;assert.deepEqual(R.restore(s),s);
  A.choose(r,'club');A.step(r,.1);assert.deepEqual(R.restore(s),s);
  const restored=R.restore(s);next(restored.backstage.run);assert.equal(restored.backstage.run.auto.event,'club');
  for(const patch of [{speed:100},{goal:'through-wall'},{event:'free-cash'},{enabled:'true'}]){
    const bad=structuredClone(s);Object.assign(bad.backstage.run.auto,patch);assert.equal(R.restore(bad),null);
  }
  delete s.backstage.run.auto;assert.ok(R.restore(s));
});
test('automatic input leaves global pause, help, Escape and browser navigation shortcuts available',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),noop=()=>{},r=enter().backstage.run;
  const window={Backstage:B,BackstageAuto:A,BackstageScene:class {},addEventListener:noop},document={addEventListener:noop};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'backstage-ui.js'),'utf8'),{window,document});
  const ui=new window.BackstageUI({canvas:{addEventListener:noop},getState:()=>({phase:'explore',backstage:{run:r}}),isPaused:()=>false});
  for(const key of ['p','h','Escape','Tab'])assert.equal(ui.key({key,preventDefault:noop}),false,key+' propagates');
});
test('delivered parcels are not offered again as a destination that secretly goes somewhere else',()=>{
  const r=enter().backstage.run;pick(r,'club');pick(r,'take-foam');pick(r,'noor');pick(r,'handover');
  A.enable(r);assert.ok(!A.view(r).choices.some(c=>c.id==='club'));
  pick(r,'noor');pick(r,'garden');pick(r,'open-hand');assert.ok(!A.view(r).choices.some(c=>c.id==='club'));
});
console.log(count+' automatic exploration behavioral tests passed.');
