// Parent acceptance only. Synthetic protocol fixtures do not claim real-map routes.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = path.resolve(process.argv[2]);
const C = require(path.join(base, 'tools/prototype/reopening-city.js'));
const W = require(path.join(base, 'tools/prototype/geo-world.js'));
const rows = [];
const synthetic = {width:8000,height:7000,layers:{roads:[],bridges:[],water:[],buildings:[]}};
const nav = {isWalkable:()=>true,segmentWalkable:()=>true};
const service = {route:async(a,b)=>({found:true,reason:'ok',points:[a,b],length:Math.hypot(b.x-a.x,b.y-a.y),visited:0,startSnap:null,endSnap:null})};
function setup(n=nav,r=service){C.dispose();C.configure(synthetic,{navigator:n,routes:r});}
function saved(p,bike){return {map:C.MAP_VERSION,...p,visited:['pub','coffee'],bike:bike||{...W.ANCHORS.pub,mounted:false}};}
async function test(name,fn){try{await fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.message});}}
(async()=>{
await test('readiness fails before geometry use',()=>{C.dispose();assert.throws(()=>C.walkable(1,1));setup();assert.equal(C.isReady(),true);assert.equal(C.getData(),synthetic);});
await test('10 reviewed anchor coordinates unchanged',()=>{const a=JSON.parse(fs.readFileSync(path.join(base,'anchors.json'),'utf8'));for(const [id,p]of Object.entries(a.anchors||a)){if(!p||typeof p.x!=='number')continue;assert.equal(W.ANCHORS[id].x,p.x);assert.equal(W.ANCHORS[id].y,p.y);}assert.equal(Object.keys(W.ANCHORS).length,10);});
await test('legacy player and remote bicycle migrate independently',()=>{setup();const old={x:730,y:930,visited:['pub','coffee'],bike:{x:1490,y:910,mounted:false}};const out=C.restoreInfo(old);assert.equal(out.migrated,true);assert.equal(out.state.x,W.PLACES.coffee.x);assert.equal(out.state.bike.x,W.PLACES.lab.x);assert.deepEqual(out.state.visited,old.visited);assert.notEqual(out.state.visited,old.visited);});
await test('new safe save clones and preserves values',()=>{setup();const s=saved(W.ANCHORS.pub);const o=C.restore(s);assert.equal(o.x,s.x);assert.deepEqual(o.visited,s.visited);assert.notEqual(o.visited,s.visited);assert.notEqual(o.bike,s.bike);});
await test('walking and bicycle named speed units',()=>{setup();const p=saved(W.ANCHORS.pub);let q=C.move(p,1,0,.1);assert.ok(Math.abs(q.x-p.x-4.8)<1e-5);p.bike={x:p.x,y:p.y,mounted:true};q=C.move(p,1,0,.1);assert.ok(Math.abs(q.x-p.x-9.6)<1e-5);});
await test('moveAlong consumes reachable 3m waypoint within .1s',()=>{setup();const p=saved(W.ANCHORS.pub);const r=C.moveAlong(p,[{x:p.x+3,y:p.y}],.1);assert.equal(r.arrived,true);assert.ok(Math.abs(r.position.x-p.x-3)<1e-6);});
await test('swept collision forbids crossing thin obstacle',()=>{const p=W.ANCHORS.pub;setup({isWalkable:()=>true,segmentWalkable:(a,b)=>!((a.x<p.x+1&&b.x>=p.x+1)||(b.x<p.x+1&&a.x>=p.x+1))});const q=C.move(saved(p),1,0,.1);assert.ok(q.x<p.x+1);});
await test('bicycle pushes on walk-only ground without losing ownership',()=>{setup({isWalkable:(p,o)=>o.mode==='walk',segmentWalkable:(a,b,o)=>o.mode==='walk'});const p=saved(W.ANCHORS.pub,{...W.ANCHORS.pub,mounted:false,pushing:true});const q=C.move(p,1,0,.1);assert.ok(Math.abs(q.x-p.x-4.8)<1e-5);assert.equal(q.bike.pushing,true);assert.equal(q.bike.x,q.x);});
await test('remote parked bicycle remains stationary during movement',()=>{setup();const p=saved(W.ANCHORS.pub,{...W.ANCHORS.coffee,mounted:false});const q=C.move(p,1,0,.1);assert.equal(q.bike.x,p.bike.x);assert.equal(q.bike.y,p.bike.y);});
await test('F3 cannot board through unwalkable 3m connector',()=>{const a=W.ANCHORS.ferrySouth,b=W.ANCHORS.ferryNorth;setup({isWalkable:()=>true,segmentWalkable:()=>false});const p=saved({x:a.x-3,y:a.y});const r=C.moveAlong(p,[{x:b.x,y:b.y,transport:'ferry',id:'F3',from:'ferrySouth',to:'ferryNorth'}],.1);assert.equal(r.position.transit,undefined);assert.equal(r.position.x,p.x);});
await test('saved F3 crosses after refresh with no path and parked bike stays',()=>{setup();const a=W.ANCHORS.ferrySouth,b=W.ANCHORS.ferryNorth;let p=saved({x:(a.x+b.x)/2,y:(a.y+b.y)/2});p.transit={id:'F3',from:'ferrySouth',to:'ferryNorth',progress:.5};p=C.restore(p);const parked=p.bike.x;for(let i=0;i<100&&p.transit;i++)p=C.moveAlong(p,[],.1).position;assert.equal(p.transit,undefined);assert.equal(p.x,b.x);assert.equal(p.bike.x,parked);});
await test('zero elapsed pauses transit exactly',()=>{setup();const a=W.ANCHORS.ferrySouth,b=W.ANCHORS.ferryNorth;const p=saved({x:(a.x+b.x)/2,y:(a.y+b.y)/2});p.transit={id:'F3',from:'ferrySouth',to:'ferryNorth',progress:.5};assert.deepEqual(C.moveAlong(p,[],0).position.transit,p.transit);});
await test('bike toggle during F3 does not abandon the carried bicycle in water',()=>{const a=W.ANCHORS.ferrySouth,b=W.ANCHORS.ferryNorth;const ground=p=>Math.hypot(p.x-a.x,p.y-a.y)<5||Math.hypot(p.x-b.x,p.y-b.y)<5||Math.hypot(p.x-W.ANCHORS.pub.x,p.y-W.ANCHORS.pub.y)<5;setup({isWalkable:ground,segmentWalkable:()=>true});const m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};let p=saved(m,{...m,mounted:false,pushing:true});p.transit={id:'F3',from:'ferrySouth',to:'ferryNorth',progress:.5};p=C.toggleBike(p);for(let i=0;i<100&&p.transit;i++)p=C.moveAlong(p,[],.1).position;assert.ok(Math.hypot(p.bike.x-b.x,p.bike.y-b.y)<1e-5);});
await test('cached route remains input/output alias-free',async()=>{setup();const a={...W.ANCHORS.pub},b={...W.ANCHORS.lotte};const r=await C.routeAsync(a,b);r.path[0].x=0;assert.equal(C.route(a,b)[0].x,b.x);});
await test('pre-aborted route rejects AbortError',async()=>{setup();const a=new AbortController();a.abort();await assert.rejects(C.routeAsync(W.ANCHORS.pub,W.ANCHORS.lotte,{signal:a.signal}),{name:'AbortError'});});
await test('actual accepted NAV pub fixture integration',()=>{C.dispose();const N=require(path.join(base,'tools/geo/navigation/geo-navigation.js'));const d=JSON.parse(fs.readFileSync(path.join(base,'tools/geo/navigation/real-pub-sample.json'),'utf8'));const n=N.createNavigator(d);C.configure(d,{navigator:n,routes:service});assert.equal(C.walkable(W.ANCHORS.pub.x,W.ANCHORS.pub.y),true);assert.equal(C.walkable(-1,-1),false);});
C.dispose();const out={scope:'independent parent behavior checks, synthetic where named; real fixture last case',passed:rows.filter(x=>x.pass).length,total:rows.length,rows};console.log(JSON.stringify(out,null,2));process.exitCode=rows.every(x=>x.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=2});
