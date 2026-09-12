'use strict';
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
let count = 0;
function test(name, fn) { fn(); console.log('✓ ' + name); count++; }
function act(s, a) { const before=JSON.stringify(s), r=R.act(s,a); assert.ok(r.ok,r.message); assert.equal(JSON.stringify(s),before); assert.ok(R.restore(r.state)); return r.state; }
function prep() { return act(R.createGame(42),{type:'start'}); }
test('expedition enters from preparation, spends one action and preserves pub stock',()=>{
  const s=prep(), next=act(s,{type:'explore',kit:'hook'});
  assert.equal(next.phase,'explore'); assert.equal(next.actions,1); assert.deepEqual(next.batches,s.batches);
});
const B = require('./backstage-core.js');
function fresh(kit='hook') { return B.create(42,1,kit,[]); }
function advance(r,seconds,input={}) { for(let t=0;t<seconds-1e-8;t+=.05) B.step(r,input,Math.min(.05,seconds-t)); }
test('seed/day repeat encounters exactly, with different routes on later visits',()=>{
  assert.deepEqual(fresh(),fresh()); assert.notDeepEqual(fresh().items,B.create(43,1,'hook',[]).items);
  const a=fresh(),b=fresh(); advance(a,2,{dx:1}); advance(b,2,{dx:1}); assert.deepEqual(a,b);
});
test('walking and dash cannot tunnel through shelving or the greenhouse gate',()=>{
  const r=fresh(); r.p.x=300;r.p.y=835;
  B.command(r,'dash',{x:300,y:1000});advance(r,.4,{dy:1});assert.ok(r.p.y<860);
  r.p.x=1820;r.p.y=580;advance(r,1,{dy:-1});assert.ok(r.p.y>550);
});
test('a directional hook retrieves moving goods but respects walls and range',()=>{
  const r=fresh(), item=r.items.find(i=>i.kind==='barrel');
  r.p.x=200;r.p.y=1100;Object.assign(item,{x:390,y:1100,vx:80,vy:0});
  assert.ok(B.command(r,'hook',{x:390,y:1100}));advance(r,.5);assert.ok(item.x<390);
  Object.assign(item,{x:300,y:970,vx:0,vy:0});Object.assign(r.p,{x:300,y:820,hook:0});
  B.command(r,'hook',{x:300,y:970});assert.equal(item.vy,0,'shelf blocks tool');
});
test('goods auto-stow, capacity is enforced, and dropping frees the last bag slot',()=>{
  const r=fresh('cart');r.actors=[];
  for(const item of r.items.filter(i=>i.kind!=='parcel')) {item.x=r.p.x;item.y=r.p.y;item.vx=0;item.vy=0;}
  advance(r,.1);assert.ok(B.load(r)<=B.KITS.cart.capacity);assert.ok(B.load(r)>0);
  const before=r.bag.length; B.command(r,'drop',{x:r.p.x-100,y:r.p.y});assert.equal(r.bag.length,before-1);
});
test('foam interrupts a charging machine and expires after its useful window',()=>{
  const r=fresh(), bot=r.actors.find(a=>a.type==='cleaner');
  Object.assign(bot,{x:r.p.x+85,y:r.p.y,mode:'charge',timer:1});
  B.command(r,'foam',{x:bot.x,y:bot.y});assert.ok(bot.stun>0);assert.equal(bot.mode,'patrol');
  advance(r,6);assert.equal(r.patches.length,0);
});
test('the greenhouse lever opens a physical route and discovery survives another run',()=>{
  const r=fresh();Object.assign(r.p,{x:1570,y:575});
  B.command(r,'hook',{x:1570,y:510});assert.equal(r.opened,true);
  Object.assign(r.p,{x:1820,y:600});advance(r,1,{dy:-1});assert.ok(r.p.y<540);
  assert.ok(r.discovered.includes('greenhouse'));
  assert.equal(B.create(42,2,'hook',r.discovered).opened,true);
});
test('contraband requires deliberate pickup, never enters beer or ingredient rewards',()=>{
  const r=fresh();const item=r.items.find(i=>i.kind==='parcel');Object.assign(r.p,{x:item.x,y:item.y});
  advance(r,.05);assert.ok(!r.bag.includes(item.id));B.command(r,'interact');assert.ok(r.bag.includes(item.id));
  Object.assign(r.p,B.EXIT);B.command(r,'interact');const rewards=B.rewards(r);
  assert.equal(rewards.parcel,'kept');assert.equal(rewards.cups,0);assert.equal(rewards.hops,0);
});
test('discovering the greenhouse opens a second safe extraction route',()=>{
  const r=fresh();r.opened=true;Object.assign(r.p,{x:2010,y:260});advance(r,.05);
  assert.ok(r.discovered.includes('greenhouse'));B.command(r,'interact');assert.equal(r.status,'extracted');
});
test('Noor receives a physically carried parcel only once',()=>{
  const r=fresh(), item=r.items.find(i=>i.kind==='parcel');Object.assign(r.p,{x:item.x,y:item.y});B.command(r,'interact');
  Object.assign(r.p,B.NOOR);B.command(r,'interact');assert.equal(r.parcel,'returned');assert.ok(!r.bag.includes(item.id));
  B.command(r,'interact');assert.ok(r.message.includes('今晚'),'Noor remembers receiving the parcel on repeat visits');Object.assign(r.p,B.EXIT);B.command(r,'interact');assert.equal(B.rewards(r).cash,14);
});
test('safe extraction preserves cargo; bailout loses cargo but preserves discoveries',()=>{
  const r=fresh();r.discovered.push('greenhouse');const item=r.items.find(i=>i.kind==='hops');Object.assign(item,{x:r.p.x,y:r.p.y});advance(r,.05);
  assert.equal(B.rewards(r),null);const safe=structuredClone(r);Object.assign(safe.p,B.EXIT);B.command(safe,'interact');assert.equal(B.rewards(safe).hops,1);
  B.command(r,'bail');assert.equal(B.rewards(r).hops,0);assert.ok(B.rewards(r).discovered.includes('greenhouse'));
});
test('time expiration ends a run with recoverable partial cargo, never touches home funds',()=>{
  let s=act(prep(),{type:'explore',kit:'hook'});s.backstage.run.time=179.95;
  B.step(s.backstage.run,{},.1);assert.equal(s.backstage.run.status,'rescued');
  s=act(s,{type:'returnExplore'});assert.equal(s.cash,45);assert.equal(s.phase,'prep');
  assert.equal(R.act(s,{type:'returnExplore'}).ok,false);assert.equal(R.act(s,{type:'explore',kit:'hook'}).ok,false);
});
test('returning cargo settles once and Noor becomes a recognizable evening guest',()=>{
  let s=act(prep(),{type:'explore',kit:'hook'}),r=s.backstage.run,item=r.items.find(i=>i.kind==='parcel');
  Object.assign(r.p,{x:item.x,y:item.y});B.command(r,'interact');Object.assign(r.p,B.NOOR);B.command(r,'interact');Object.assign(r.p,B.EXIT);B.command(r,'interact');
  s=act(s,{type:'returnExplore'});assert.equal(s.cash,59);assert.equal(s.backstage.resolution,'returned');
  s=act(s,{type:'open'});assert.ok(s.night.orders.some(o=>o.name==='Noor'&&o.quote.includes('箱子')));
});
test('older saves migrate without losing cash, batches, day or relationships',()=>{
  const old=prep();delete old.backstage;const restored=R.restore(old);assert.ok(restored);
  assert.equal(restored.cash,old.cash);assert.deepEqual(restored.batches,old.batches);assert.deepEqual(restored.friends,old.friends);
});
test('refresh roundtrips a running expedition; malformed coordinates and cargo reject',()=>{
  const s=act(prep(),{type:'explore',kit:'hook'});advance(s.backstage.run,.3,{dx:1});assert.deepEqual(R.restore(s),s);
  const bad=structuredClone(s);bad.backstage.run.p.x=Infinity;assert.equal(R.restore(bad),null);
  const forged=structuredClone(s);forged.backstage.run.bag.push('nonexistent');assert.equal(R.restore(forged),null);
});
test('stationary pointer stays aimed to the right as the camera follows a moving player',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),events={};
  const noop=()=>{},gradient={addColorStop:noop};
  const context2d=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:noop});
  const canvas={getContext:()=>context2d,addEventListener:(n,f)=>events[n]=f,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640})};
  const window={Backstage:B,addEventListener:noop},document={addEventListener:noop,hidden:false};
  const context=vm.createContext({window,document,matchMedia:()=>({matches:false})});
  for(const file of ['backstage-scene.js','backstage-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context);
  const r=fresh();r.actors=[];Object.assign(r.p,{x:1000,y:1130});
  const ui=new window.BackstageUI({canvas,getState:()=>({phase:'explore',backstage:{run:r}}),isPaused:()=>false,save:noop});
  ui.render=noop;ui.scene.draw(r);events.pointermove({clientX:820,clientY:340});ui.keys.add('d');
  for(let i=0;i<50;i++)ui.step(.05);
  assert.ok(r.p.x>1300);assert.ok(r.p.fx>.8,'aim remains on the screen-right side after camera movement');
  events.pointerleave({});assert.equal(ui.aim,null,'keyboard directions take over when pointer leaves the canvas');
});
console.log(count+' backstage behavioral tests passed.');
