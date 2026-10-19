'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const runtime=require(path.join(path.resolve(process.argv[2]||'.'),'tools/geo/runtime/geo-runtime.js'));
const outcomes=[];
function setup(){
 const calls=[];
 const nav={segmentWalkable:()=>true,routeAsync:async(a,b)=>{
  calls.push([a,b]);const length=Math.hypot(a.x-b.x,a.y-b.y);
  return length<=5?{found:true,reason:'ok',points:[{...a},{...b}],length,visited:1,startSnap:null,endSnap:null}:
   {found:false,reason:'limit',points:[],length:0,visited:1,startSnap:null,endSnap:null};
 }};
 const doc={format:'amsterdam-geo-routes/v1',geometrySha256:'a'.repeat(64),radius:.4,
  anchors:{a:{x:0,y:0},b:{x:100,y:0}},edges:[{from:'a',to:'b',
   walk:{found:true,reason:'ok',points:[{x:0,y:0},{x:100,y:0}],length:100,visited:1,segmentsVerified:true},
   bike:{found:false,reason:'unreachable',points:[],length:0,visited:0}}]};
 return {service:runtime._internals.makeRoutesService(doc,nav,{routeEdgesDropped:0}),calls};
}
async function check(name,fn){try{await fn();outcomes.push({name,pass:true});}catch(e){outcomes.push({name,pass:false,error:String(e)});}}
(async()=>{
 await check('forward cached exact endpoints',async()=>{const{service}=setup();const r=await service.route('a','b',{radius:.4});assert.ok(r.found);assert.deepEqual(r.points[0],{x:0,y:0});assert.deepEqual(r.points.at(-1),{x:100,y:0});});
 await check('reverse cached exact endpoints',async()=>{const{service}=setup();const r=await service.route('b','a',{radius:.4});assert.ok(r.found);assert.deepEqual(r.points[0],{x:100,y:0});assert.deepEqual(r.points.at(-1),{x:0,y:0});});
 await check('arbitrary endpoints join nearby cached graph',async()=>{const{service}=setup();const r=await service.route({x:1,y:0},{x:99,y:0},{radius:.4});assert.ok(r.found);assert.deepEqual(r.points[0],{x:1,y:0});assert.deepEqual(r.points.at(-1),{x:99,y:0});});
 await check('walk-only cache cannot serve bike',async()=>{const{service}=setup();const r=await service.route('a','b',{mode:'bike',radius:.4});assert.equal(r.found,false);});
 await check('already aborted cached request rejects',async()=>{const{service}=setup();const c=new AbortController();c.abort();await assert.rejects(service.route('a','b',{signal:c.signal}),{name:'AbortError'});});
 await check('dispose rejects requests',async()=>{const{service}=setup();service.dispose();await assert.rejects(service.route('a','b'));});
 console.log(JSON.stringify({outcomes,passed:outcomes.filter(x=>x.pass).length,total:outcomes.length},null,2));
 process.exitCode=outcomes.some(x=>!x.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
