'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('./reopening-core.js'),B=require('./backstage-core.js');
function act(s,a){const out=R.act(s,a);assert.ok(out.ok,out.message);return out.state;}
const start=()=>act(R.createGame(42),{type:'start'});
const close=s=>act(act(s,{type:'open'}),{type:'close'});
test('daytime scouting is free, repeatable without duplication, and only works before closing',()=>{
  let s=start(),cash=s.cash,actions=s.actions;
  s=act(s,{type:'scout',place:'market'});s=act(s,{type:'scout',place:'coffee'});
  assert.deepEqual(s.life.clues,['market','club']);assert.equal(s.cash,cash);assert.equal(s.actions,actions);
  s=act(s,{type:'scout',place:'market'});assert.deepEqual(s.life.clues,['market','club']);
  assert.equal(R.act(s,{type:'scout',place:'lab'}).ok,false);
  s=close(s);assert.equal(R.act(s,{type:'scout',place:'market'}).ok,false);assert.ok(R.restore(s));
});
test('known clues enter the actual expedition, survive a save, then reset for the next day',()=>{
  let s=act(start(),{type:'scout',place:'coffee'});s=close(s);
  s=act(s,{type:'explore',kit:'hook'});
  assert.deepEqual(s.backstage.run.location.clues,['club']);assert.ok(R.restore(s));
  B.command(s.backstage.run,'bail');s=act(s,{type:'returnExplore'});s=act(s,{type:'next'});
  assert.equal(s.day,2);assert.deepEqual(s.life.clues,[]);assert.ok(R.restore(s));
});
test('opening the real unloading door records a lasting shortcut and morning consequence',()=>{
  let s=act(close(start()),{type:'explore',kit:'hook',mode:'manual'}),r=s.backstage.run;
  const door=B.locationInfo(r).door;Object.assign(r.p,door.interact);
  assert.equal(B.command(r,'interact'),true);assert.ok(r.discovered.includes('market-shortcut'));
  B.command(r,'bail');s=act(s,{type:'returnExplore'});
  assert.ok(s.life.morning.some(x=>x.includes('卸货')));
  s=act(s,{type:'next'});assert.ok(s.backstage.discovered.includes('market-shortcut'));
  s=act(close(s),{type:'explore',kit:'hook'});
  assert.equal(B.locationInfo(s.backstage.run).door.open,true);assert.ok(R.restore(s));
});
test('legacy city life migrates without losing flowers, money, or night discoveries',()=>{
  const old=start();delete old.life.clues;old.life.morning=['昨晚的消息'];old.backstage.discovered=['greenhouse'];
  const copy=structuredClone(old),restored=R.restore(old);
  assert.ok(restored);assert.deepEqual(restored.life.clues,[]);assert.deepEqual(old,copy);
  assert.equal(restored.cash,old.cash);assert.deepEqual(restored.life.morning,old.life.morning);
  assert.deepEqual(restored.backstage.discovered,old.backstage.discovered);
  for(const clues of [null,['invalid'],['market','market'],['market','club','market']]){
    const bad=structuredClone(restored);bad.life.clues=clues;assert.equal(R.restore(bad),null);
  }
});
