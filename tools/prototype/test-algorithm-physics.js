'use strict';
const B=require('./backstage-core.js');

const kits=['hook','cart','foam'], dts=[.025,.05,.1], seeds=[1,42,99], days=[1,2,3];
let checks=0;
function ok(cond, msg, opt={}){ checks++; if(!cond){ const e=new Error(msg); e.options=opt; throw e; } }
function snapshot(o){return JSON.stringify(o);}
function countKind(r,k){return r.items.filter(i=>i.kind===k).length;}
function allFinite(x){
  if(typeof x==='number')return Number.isFinite(x);
  if(Array.isArray(x))return x.every(allFinite);
  if(x&&typeof x==='object')return Object.values(x).every(allFinite);
  return true;
}
function finiteState(r,where){
  ok(allFinite(r),'finite numbers required',{where});
  ok(r.p.x>=0&&r.p.x<=B.WIDTH&&r.p.y>=0&&r.p.y<=B.HEIGHT,'player in world',{where,x:r.p.x,y:r.p.y});
  for(const it of r.items){
    ok(it.x>=0&&it.x<=B.WIDTH&&it.y>=0&&it.y<=B.HEIGHT,'item in world',{where,id:it.id,kind:it.kind,x:it.x,y:it.y});
    ok(Math.hypot(it.vx,it.vy)<=1000.001,'item velocity bounded',{where,id:it.id,v:[it.vx,it.vy]});
  }
  for(const a of r.actors){
    ok(a.x>=0&&a.x<=B.WIDTH&&a.y>=0&&a.y<=B.HEIGHT,'actor in world',{where,id:a.id,type:a.type});
    ok(Math.hypot(a.vx,a.vy)<=1000.001,'actor velocity bounded',{where,id:a.id});
  }
}
function invariants(r,base,where){
  finiteState(r,where);
  ok(r.items.length===base.items.length,'item ids conserved',{where,n:r.items.length,wanted:base.items.length});
  ok(r.actors.length===base.actors.length,'actor ids conserved',{where,n:r.actors.length});
  for(const k of Object.keys(B.TYPES))ok(countKind(r,k)===countKind(base,k),k+' kind conserved',{where});
  const bag=new Set(r.bag);
  ok(bag.size===r.bag.length,'bag has unique references',{where,bag:r.bag});
  for(const id of r.bag){
    const it=r.items.find(q=>q.id===id);
    ok(!!it,'bag id exists',{where,id});
    ok(it.state==='bag','bag reference exact state',{where,id,state:it.state});
  }
  for(const it of r.items){
    if(it.state==='bag')ok(bag.has(it.id),'bag-state item referenced',{where,id:it.id});
    ok(['world','bag','delivered','lost'].includes(it.state),'legal item sink',{where,id:it.id,state:it.state});
  }
  ok(B.load(r)<=B.KITS[r.kit].capacity+1e-9,'capacity respected',{where,kit:r.kit,load:B.load(r),cap:B.KITS[r.kit].capacity});
  for(const b of r.street.barrels)ok(!B.solid(r,b.x,b.y,22,b.id),'barrel solid ignores itself',{where,barrel:b.id});
}
function run(r,n,dt){
  for(let i=0;i<n;i++){
    const a=i%7, x=r.p.x+(a===0?40:a===1?-40:a===2?0:a===3?0:a===4?80:a===5?-80:30), y=r.p.y+(a===2?40:a===3?-40:a===4?30:a===5?-30:0);
    const input={dx:(a%3)-1,dy:(Math.floor(a/3)%3)-1,aim:{x,y}};
    const before=snapshot(r);
    B.step(r,input,dt);
    if(r.status!=='active')return i+1;
    if(i%17===0)B.command(r,'foam',{x:r.p.x+80,y:r.p.y});
    if(i%23===0)B.command(r,'hook',{x:r.p.x-80,y:r.p.y+40});
    if(i%29===0)B.command(r,'drag');
    if(i%31===0&&r.bag.length)B.command(r,'drop',{x:r.p.x+50,y:r.p.y+50});
    ok(snapshot(B.restore(JSON.parse(JSON.stringify(r))))===snapshot(r),'restore is exact',{step:i,dt});
    if(snapshot(r)===before&&i>0){ /* zero movement can be legal against a wall */ }
  }
  return n;
}

for(const seed of seeds)for(const day of days)for(const kit of kits)for(const dt of dts){
  const r=B.create(seed,day,kit,[],{clues:['market','club','greenhouse']});
  const base=B.create(seed,day,kit,[],{clues:['market','club','greenhouse']});
  const where={seed,day,kit,dt};
  ok(B.restore(JSON.parse(JSON.stringify(r)))!==null,'initial snapshot restores',where);
  run(r,Math.ceil(6/dt),dt);
  invariants(r,base,where);
  if(r.status==='active')B.command(r,'bail');
  ok(r.status!=='active','run reaches finite terminal state',where);
  const rew=B.rewards(r);
  ok(rew&&['extracted','bailed','rescued'].includes(rew.status),'reward sink legal',{where,status:r.status});
}

function conveyorTest(){
  const r=B.create(42,1,'hook');
  Object.assign(r.p,{x:1515,y:890});
  ok(B.command(r,'hook',{x:B.districtInfo(r).switch.x,y:B.districtInfo(r).switch.y}),'hook conveyor switch',{});
  ok(r.district.belt==='west','hook reverses conveyor',{belt:r.district.belt});
  Object.assign(r.p,{x:1600,y:890});
  ok(B.command(r,'interact'),'interact conveyor switch',{});
  ok(r.district.belt==='off','switch stops conveyor',{belt:r.district.belt});
  const it=r.items.find(i=>i.kind==='salvage'&&i.x>1800);
  Object.assign(it,{x:1800,y:1030,vx:0,vy:0,state:'world',lock:0});
  const x0=it.x; B.step(r,{dx:0,dy:0},.1);
  ok(it.x<x0+1e-9,'west/off belt does not carry item east',{x0,x:it.x,belt:r.district.belt});
}
conveyorTest();

function wetAndFoamTest(){
  const r=B.create(99,2,'foam');
  Object.assign(r.p,{x:1900,y:475});
  const x0=r.p.x,y0=r.p.y;
  B.command(r,'foam',{x:r.p.x,y:r.p.y});
  B.step(r,{dx:1,dy:0},.1);
  ok(Math.hypot(r.p.x-x0,r.p.y-y0)>0,'wet/foam permits bounded real movement',{from:[x0,y0],to:[r.p.x,r.p.y]});
  finiteState(r,'wet foam');
}
wetAndFoamTest();

function dropCollectRestoreTest(){
  const r=B.create(42,3,'cart');
  Object.assign(r.p,{x:1840,y:1020});
  const item=r.items.find(i=>i.kind==='salvage'&&i.state==='world');
  Object.assign(item,{x:r.p.x,y:r.p.y,vx:0,vy:0,lock:0});
  ok(B.command(r,'collect',{itemId:item.id}),'legal nearby collect',{id:item.id});
  ok(r.bag.includes(item.id)&&item.state==='bag','collected reference exact',{id:item.id});
  ok(B.command(r,'drop',{itemId:item.id,x:r.p.x+30,y:r.p.y+10}),'legal selected drop',{});
  ok(!r.bag.includes(item.id)&&item.state==='world','dropped reference removed',{id:item.id});
  const copy=JSON.parse(JSON.stringify(r));
  ok(snapshot(B.restore(copy))===snapshot(r),'post-drop restore exact',{id:item.id});
}
dropCollectRestoreTest();

function deliverySinkTest(){
  const r=B.create(42,1,'cart',['greenhouse'],{clues:['greenhouse']});
  r.opened=true;
  const part=r.items.find(i=>i.kind==='salvage');
  Object.assign(part,{state:'bag'}); r.bag.push(part.id);
  Object.assign(r.p,{x:B.districtInfo(r).valve.x,y:B.districtInfo(r).valve.y});
  ok(B.command(r,'repair'),'repair accepts salvage',{});
  ok(part.state==='delivered'&&!r.bag.includes(part.id),'repair is delivered sink',{id:part.id});
  const parcel=r.items.find(i=>i.kind==='parcel');
  Object.assign(parcel,{state:'bag'}); r.bag.push(parcel.id); r.parcel='carried';
  Object.assign(r.p,{x:B.NOOR.x,y:B.NOOR.y});
  ok(B.command(r,'interact'),'Noor accepts parcel',{});
  ok(parcel.state==='delivered'&&r.parcel==='returned','parcel delivered sink',{id:parcel.id,parcel:r.parcel});
}
deliverySinkTest();

console.log('test-algorithm-physics ok',checks,'checks');
