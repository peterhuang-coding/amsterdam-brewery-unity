// Independent parent acceptance. Direct full source + accepted NAV, with exact
// precomputed route replies. This does NOT validate the rejected runtime loader.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [base,source,graphFile,out]=process.argv.slice(2);
const C=require(path.join(base,'tools/prototype/reopening-city.js'));
const W=require(path.join(base,'tools/prototype/geo-world.js'));
const N=require(path.join(base,'tools/geo/navigation/geo-navigation.js'));
const data=JSON.parse(fs.readFileSync(source,'utf8'));
const graph=JSON.parse(fs.readFileSync(graphFile,'utf8'));
const started=performance.now(),nav=N.createNavigator(data,{cellSize:2});
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-7;
const rows=[],timings=[];
const service={route:async(a,b,o)=>{
  if(o.signal?.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});
  if(near(a,b))return {found:true,reason:'ok',points:[{x:a.x,y:a.y},{x:b.x,y:b.y}],length:0,startSnap:null,endSnap:null};
  for(const e of graph.edges){const r=e[o.mode];if(!r.found)continue;
    const points=r.points,first=points[0],last=points.at(-1);
    if(near(a,first)&&near(b,last))return {...r,points:points.map(p=>({...p}))};
    if(near(b,first)&&near(a,last))return {...r,points:points.slice().reverse().map(p=>({...p}))};
  }
  return {found:false,reason:'parent-no-stored-edge',points:[],length:0};
}};
const state=(p,mode)=>({map:C.MAP_VERSION,x:p.x,y:p.y,visited:['pub','coffee'],bike:{x:p.x,y:p.y,mounted:mode==='bike'}});
async function test(name,fn){try{const detail=await fn();rows.push({name,pass:true,...detail});}catch(e){rows.push({name,pass:false,error:e.message});}}
(async()=>{
C.configure(data,{navigator:nav,routes:service});
await test('ten actual-source anchors and shared Flower coordinates',()=>{
 const F=require(path.join(base,'tools/prototype/flower-network.js'));
 for(const a of Object.values(W.ANCHORS))assert.equal(C.walkable(a.x,a.y),true,a.id);
 for(const k of ['x','y']){assert.equal(F.ENTRY[k],W.ENTRY[k]);assert.equal(F.CART[k],W.CART[k]);}
 return {anchors:10,features:Object.values(data.layers).reduce((n,a)=>n+a.length,0)};
});
for(const edge of graph.edges)for(const mode of ['walk','bike'])if(edge[mode].found)for(const reverse of [false,true]){
 await test(`${edge.from}-${edge.to} ${mode} ${reverse?'reverse':'forward'} full geometry movement`,async()=>{
  const points=reverse?edge[mode].points.slice().reverse():edge[mode].points;
  const start=points[0],end=points.at(-1),route=await C.routeAsync(start,end,{mode});
  assert.equal(route.found,true);let p=state(start,mode),remaining=route.path,arrived=false,frames=0;
  const bound=Math.ceil(edge[mode].length/4.8)+points.length+20;
  for(;frames<bound&&!arrived;frames++){
   const t=performance.now(),r=C.moveAlong(p,remaining,.1);timings.push(performance.now()-t);
   assert.equal(C.walkable(r.position.x,r.position.y),true);
   if(mode==='bike')assert.ok(r.position.bike.mounted||r.position.bike.pushing);
   assert.deepEqual(r.position.visited,['pub','coffee']);p=r.position;remaining=r.path;arrived=r.arrived;
   if(frames===3){const saved=JSON.parse(JSON.stringify(p)),restored=C.restore(saved);assert.deepEqual(restored,saved);p=restored;}
  }
  assert.equal(arrived,true,`unfinished after ${frames} frames`);assert.ok(near(p,end));
  return {frames,length:edge[mode].length};
 });
}
for(const [from,to]of [['ferrySouth','ferryNorth'],['ferryNorth','ferrySouth']])for(const carried of [false,true]){
 await test(`actual F3 banks ${from} carried=${carried}, cancel refresh pause landing`,()=>{
  const a=W.ANCHORS[from],b=W.ANCHORS[to];let p=state(a,'walk');
  p.bike=carried?{x:a.x,y:a.y,mounted:false,pushing:true}:{x:W.ANCHORS.pub.x,y:W.ANCHORS.pub.y,mounted:false};
  let r=C.moveAlong(p,[{x:b.x,y:b.y,transport:'ferry',id:'F3',from,to}],.1);p=r.position;assert.ok(p.transit);
  const saved=JSON.parse(JSON.stringify(p));assert.deepEqual(C.restore(saved),saved);
  assert.deepEqual(C.moveAlong(p,[],0).position,p);p=C.toggleBike(p);p=C.parkBike(p);
  let frames=0;for(;frames<200&&p.transit;frames++)p=C.moveAlong(p,[],.1).position;
  assert.ok(!p.transit);assert.ok(near(p,b));assert.equal(C.walkable(p.x,p.y),true);
  assert.ok(near(p.bike,carried?b:W.ANCHORS.pub));return {frames};
 });
}
await test('all seven legacy positions and independent parked bikes on actual source',()=>{
 const old={pub:[290,590],lotte:[490,650],coffee:[730,930],noord:[1230,170],market:[930,1010],flowers:[1240,1040],lab:[1490,910]};
 for(const[id,[x,y]]of Object.entries(old)){
  const r=C.restoreInfo({x,y,visited:['pub',id].filter((v,i,a)=>a.indexOf(v)===i),bike:{x:1490,y:910,mounted:false}});
  assert.equal(r.migrated,true);assert.ok(near(r.state,W.PLACES[id]));assert.ok(near(r.state.bike,W.PLACES.lab));assert.equal(C.walkable(r.state.x,r.state.y),true);
 }
 return {legacyPlaces:7};
});
C.dispose();assert.equal(C.isReady(),false);timings.sort((a,b)=>a-b);
const result={scope:'full original source + accepted NAV + exact stored-route adapter; no runtime/browser/game integration claim',passed:rows.filter(r=>r.pass).length,total:rows.length,rows,frames:timings.length,stepMs:{max:Math.max(...timings),p99:timings[Math.floor(timings.length*.99)]},seconds:(performance.now()-started)/1000};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=rows.every(r=>r.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=2});
