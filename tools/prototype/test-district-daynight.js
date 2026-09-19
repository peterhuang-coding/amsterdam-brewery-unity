'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reopening-core.js'),B=require('./backstage-core.js');
function act(s,a){const x=R.act(s,a);assert.ok(x.ok,x.message);return x.state;}
const start=()=>act(R.createGame(42),{type:'start'});
const close=s=>act(act(s,{type:'open'}),{type:'close'});
function leave(s){return act(close(s),{type:'explore',kit:'hook',mode:'manual'});}
test('new and legacy games have an independent empty exploration journal',()=>{
 const s=start();assert.deepEqual(s.backstage.journal,[]);delete s.backstage.journal;const before=structuredClone(s),restored=R.restore(s);
 assert.ok(restored);assert.deepEqual(restored.backstage.journal,[]);assert.deepEqual(s,before);
});
test('lab clue is free and included in tonight’s expedition; next day clears only clues',()=>{
 let s=start();const money=s.cash,actions=s.actions;s=act(s,{type:'scout',place:'lab'});s=act(s,{type:'scout',place:'lab'});
 assert.deepEqual(s.life.clues,['greenhouse']);assert.equal(s.cash,money);assert.equal(s.actions,actions);
 s=leave(s);assert.ok(s.backstage.run.location.clues.includes('greenhouse'));B.command(s.backstage.run,'bail');s=act(s,{type:'returnExplore'});s=act(s,{type:'next'});
 assert.deepEqual(s.life.clues,[]);assert.equal(s.backstage.journal.length,1);assert.ok(R.restore(s));
});
test('repair consumes a real spare, survives bail and next night, and never rewrites the closed ledger',()=>{
 let s=leave(start()),r=s.backstage.run;const report=structuredClone(s.reports),spare=r.items.find(i=>i.kind==='salvage');
 spare.state='bag';r.bag=[spare.id];Object.assign(r.p,{x:1680,y:485});assert.ok(B.command(r,'repair'));B.command(r,'bail');
 s=act(s,{type:'returnExplore'});assert.deepEqual(s.reports,report);assert.ok(s.backstage.discovered.includes('greenhouse-pump'));
 assert.ok(s.life.morning.some(x=>x.includes('滴灌')||x.includes('水泵')));assert.ok(s.backstage.journal[0].outcomes.includes('greenhouse-repaired'));assert.equal(s.backstage.journal[0].cash,0);
 s=act(s,{type:'next'});s=leave(s);assert.equal(s.backstage.run.district.repaired,true);assert.ok(R.restore(s));
});
test('journal records real district visits and final cargo once, across all three nights',()=>{
 let s=start();for(let day=1;day<=3;day++){
  s=leave(s);const r=s.backstage.run;B.step(r,{},.05);const item=r.items[0];item.state='bag';r.bag=[item.id];Object.assign(r.p,B.EXIT);assert.ok(B.command(r,'interact'));
  s=act(s,{type:'returnExplore'});const entry=s.backstage.journal.at(-1);assert.equal(entry.day,day);assert.equal(entry.status,'extracted');assert.equal(entry.cups,2);assert.ok(entry.visited.includes('market'));
  assert.equal(s.backstage.journal.length,day);assert.equal(R.act(s,{type:'returnExplore'}).ok,false);assert.ok(R.restore(s));if(day<3)s=act(s,{type:'next'});
 }
 assert.equal(s.backstage.journal.length,3);
});
test('journal rejects impossible day, duplicate visits, inflated values, and unrecognized outcomes',()=>{
 let s=leave(start());B.command(s.backstage.run,'bail');s=act(s,{type:'returnExplore'});
 for(const patch of [{day:4},{cash:-1},{cups:Infinity},{visited:['market','market']},{outcomes:['give-money']},{status:'active'}]){
  const bad=structuredClone(s);Object.assign(bad.backstage.journal[0],patch);assert.equal(R.restore(bad),null,JSON.stringify(patch));
 }
 const bad=structuredClone(s);bad.backstage.journal.push(structuredClone(bad.backstage.journal[0]));assert.equal(R.restore(bad),null);
});
