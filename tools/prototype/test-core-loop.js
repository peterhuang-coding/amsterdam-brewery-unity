#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const C=require('./core-loop.js');
let passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name)}catch(error){console.error('FAIL '+name+'\n  '+error.message);process.exitCode=1}}
function advanceTo(state,day,phase){while(!state.ended&&(state.day<day||(state.day===day&&state.phase<phase))){const r=C.rest(state);assert.equal(r.ok,true,r.message)}}

test('同一 Seed 生成相同三日需求与偏差',()=>{
  const a=C.fresh(42),b=C.fresh(42);
  assert.deepEqual([1,2,3].map(d=>C.trendForDay(a,d)),[1,2,3].map(d=>C.trendForDay(b,d)));
  C.brew(a,'slow');C.brew(b,'slow');C.rest(a);C.rest(a);C.rest(b);C.rest(b);
  assert.equal(a.pendingRescue.deviation.id,b.pendingRescue.deviation.id);
});

test('酿酒只创建真实批次，不直接增加现金',()=>{
  const s=C.fresh(7),before=s.money;
  assert.equal(C.brew(s,'fast').ok,true);
  assert.equal(s.money,before);
  assert.equal(s.batches.length,1);
  assert.equal(s.batches[0].qty,4);
  assert.equal(C.isReady(s,s.batches[0]),true);
});

test('快熟路线可出售，但出售会减少同一批库存',()=>{
  const s=C.fresh(9);C.brew(s,'fast');const b=s.batches[0],before=s.money;
  assert.equal(C.sellWalkIn(s,b.id,2).ok,true);
  assert.equal(b.qty,2);
  assert.ok(s.money>before);
});

test('慢熟偏差的减量保质分支保留订单资格',()=>{
  const s=C.fresh(11);C.brew(s,'slow');C.rest(s);C.rest(s);
  assert.ok(s.pendingRescue);
  assert.equal(C.resolveRescue(s,'preserve').ok,true);
  const b=s.batches[0];
  assert.equal(b.qty,4);assert.equal(b.flavor,'crisp');assert.equal(b.quality,5);
});

test('慢熟偏差的风味转向分支提前成熟但失去原订单资格',()=>{
  const s=C.fresh(12);C.brew(s,'slow');C.rest(s);C.rest(s);
  assert.equal(C.resolveRescue(s,'pivot').ok,true);
  const b=s.batches[0];
  assert.equal(b.qty,6);assert.equal(b.flavor,'wild');assert.equal(C.isReady(s,b),true);
});

test('课程只记录独立学业结果，不修改批次数值',()=>{
  const s=C.fresh(13);C.brew(s,'fast');advanceTo(s,2,1);
  const before=JSON.stringify(s.batches);
  assert.equal(C.attendClass(s,true).ok,true);
  assert.equal(s.attendance,1);assert.equal(JSON.stringify(s.batches),before);
});

test('缺席课程会保留下午经营时段',()=>{
  const s=C.fresh(131);C.brew(s,'fast');advanceTo(s,2,1);
  assert.equal(C.attendClass(s,false).ok,true);
  assert.equal(s.day,2);assert.equal(s.phase,1);assert.equal(s.classResolved,true);
  assert.equal(C.buySupplies(s).ok,true);
  assert.equal(s.phase,2);
});

test('按约交付必须使用满足数量品质风味的成熟批次',()=>{
  const s=C.fresh(14);C.brew(s,'slow');C.rest(s);C.rest(s);C.resolveRescue(s,'preserve');
  if(C.needsClassDecision(s))C.attendClass(s,true);
  advanceTo(s,3,2);
  const b=s.batches[0],before=s.money;
  assert.deepEqual(C.orderFit(s,b),{eligible:true,reasons:[]});
  assert.equal(C.fulfillOrder(s,b.id,false).ok,true);
  assert.equal(s.order.status,'fulfilled');assert.equal(s.order.relation,2);assert.equal(b.qty,0);assert.ok(s.money>before);assert.equal(s.ended,true);
});

test('订单差距能解释数量、品质、风味和成熟时间',()=>{
  const s=C.fresh(141);C.brew(s,'slow');const b=s.batches[0];
  b.qty=2;b.quality=1;b.flavor='wild';
  const fit=C.orderFit(s,b);
  assert.equal(fit.eligible,false);
  assert.equal(fit.reasons.length,4);
  assert.ok(fit.reasons.some(x=>x.includes('成熟')));
  assert.ok(fit.reasons.some(x=>x.includes('还缺')));
  assert.ok(fit.reasons.some(x=>x.includes('品质')));
  assert.ok(fit.reasons.some(x=>x.includes('需要 crisp')));
});

test('中途存档可恢复且不会重复结算',()=>{
  const s=C.fresh(142);C.brew(s,'fast');const b=s.batches[0];C.sellWalkIn(s,b.id,2);
  const money=s.money,qty=b.qty,restored=C.restore(JSON.stringify(s),999);
  assert.equal(restored.seed,142);assert.equal(restored.money,money);assert.equal(restored.batches[0].qty,qty);
  assert.equal(restored.log.length,s.log.length);
});

test('替代交付降低关系并以较低报酬结束',()=>{
  const s=C.fresh(15);C.brew(s,'slow');C.rest(s);C.rest(s);C.resolveRescue(s,'pivot');
  if(C.needsClassDecision(s))C.attendClass(s,false);
  advanceTo(s,3,2);
  const b=s.batches[0];
  assert.equal(C.fulfillOrder(s,b.id,true).ok,true);
  assert.equal(s.order.status,'substituted');assert.equal(s.order.relation,-1);assert.equal(s.ended,true);
});

test('三日结束仍未交付会形成明确违约结局',()=>{
  const s=C.fresh(16);advanceTo(s,2,1);C.attendClass(s,true);advanceTo(s,3,2);C.rest(s);
  assert.equal(s.ended,true);assert.equal(s.order.status,'missed');assert.equal(s.summary.order,'订单违约');
});

console.log(`\n${passed} passed`);
