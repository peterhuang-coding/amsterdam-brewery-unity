const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'candidate/tools/prototype'),file=path.join(root,'test-market-fixtures-scene.js');
const requireLocal=require('module').createRequire(file);const sandbox={require:requireLocal,__dirname:root,console,structuredClone};
const code=fs.readFileSync(file,'utf8').split("test('real geometry:")[0]+`\n globalThis.diag={B,shift,walkTo,load,render,shelfMap,worldEllipses,worldRects,env};`;
vm.runInNewContext(code,sandbox);const {B,shift,walkTo,load,render,shelfMap,worldEllipses,worldRects,env}=sandbox.diag;
const r=shift(3);r.actors=[];const steps=[];
for(const to of [{x:460,y:1205},{x:680,y:1205},{x:680,y:1142}]){walkTo(r,to);steps.push({to,p:{...r.p},bag:[...r.bag],item3:structuredClone(r.items.find(i=>i.id==='item3'))});}
const collect=B.command(r,'collect',{itemId:'item3'});walkTo(r,{x:700,y:1105});const repaired=B.command(r,'market-power');
const q=shift(1);q.actors=[];const {rec,scene}=load();const captures=[];const block=scene.block;
scene.block=function(w,...args){const start=[rec.rects.length,rec.shapes.length];const ret=block.call(this,w,...args);if(w.kind==='shelf')captures.push({w,rects:rec.rects.slice(start[0]),shapes:rec.shapes.slice(start[1])});return ret;};scene.draw(q,{});const view=scene.camera(q,false),cold=shelfMap()['market-cold'],e=env(cold);const overlaps=worldEllipses(rec,view,cold).filter(s=>s.x-s.rx<e.x-1e-6||s.y-s.ry<e.y-1e-6||s.x+s.rx>e.x+e.w+1e-6||s.y+s.ry>e.y+e.h+1e-6);
const blockCold=captures.find(c=>c.w===cold||c.w.x===cold.x);const actual=worldEllipses({shapes:blockCold.shapes},view,cold);
console.log(JSON.stringify({steps,collect,bag:r.bag,repaired,powerItem:r.marketShift.powerItem,powered:B.marketInfo(r).powered,allFrameColdEllipsesOutside:overlaps,onlyColdBlockEllipses:actual,assertionScope:'all-frame spatial selection includes unrelated existing items; block capture diagnostic only, no candidate edits'},null,2));
