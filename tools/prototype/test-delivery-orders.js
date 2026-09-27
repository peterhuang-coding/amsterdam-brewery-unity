'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reopening-core.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function act(s,a){const before=copy(s),out=R.act(s,a);assert.equal(out.ok,true,out.message);assert.deepEqual(s,before);assert.ok(R.restore(out.state),a.type+' '+(a.choice||a.verb||''));return out.state;}
function reject(s,a){const before=copy(s),out=R.act(s,a);assert.equal(out.ok,false);assert.deepEqual(s,before);return s;}
function ja(s,verb,value){return act(s,{type:'journeyAction',verb,value});}
function until(s,condition){for(let i=0;i<2000&&!condition(s);i++)s=ja(s,'tick',{seconds:.1});assert.ok(condition(s));return s;}
function deliver(s){
  s=act(s,{type:'journeyStart',kind:'delivery'});s=ja(s,'pack','padding');s=ja(s,'depart','smooth');s=until(s,s=>s.journeys.run.stage==='arrival');s=ja(s,'cargo');s=ja(s,'deliver','accept');s=until(s,s=>s.journeys.run.stage==='receipt');return act(s,{type:'journeyReturn'});
}
function decision(s,choice,batchId){return act(s,{type:'contract',id:s.trade.contracts.at(-1).id,choice,batchId});}
function brew(s){s=act(s,{type:'prepare',kind:'brew',beer:'stout'});for(let i=0;i<3;i++)s=act(s,{type:'brewHit',score:1});return s;}
function next(s){s=act(s,{type:'open'});s=act(s,{type:'close'});return act(s,{type:'next'});}
function ticks(s,n){for(let i=0;i<n;i++)s=act(s,{type:'tick',seconds:1});return s;}
test('delivery orders',async t=>{
  const offered=deliver(act(R.createGame(42),{type:'start'}));
  await t.test('table flower agreement becomes a lower-price order fulfilled from ordinary stock',()=>{
    let s=act(R.createGame(1),{type:'start'});s=act(s,{type:'journeyStart',kind:'delivery'});s=ja(s,'pack','capacity');s=ja(s,'depart','short');s=ja(s,'parcel','return');s=ja(s,'speed');
    s=until(s,s=>s.journeys.run.stage==='conflict');s=ja(s,'street','talk');s=ja(s,'auto');s=until(s,s=>s.journeys.run.stage==='arrival');s=ja(s,'cargo');s=ja(s,'deliver','table');
    s=until(s,s=>s.journeys.run.stage==='receipt');s=act(s,{type:'journeyReturn'});
    assert.equal(s.journeys.history[0].outcome,'repurposed');assert.match(s.journeys.history[0].note,/排练桌花/);
    const c=s.trade.contracts[0];assert.deepEqual(R.trade.terms(s,c),{quality:1,price:10,bonus:2,label:'排练供酒'});assert.match(R.trade.memory(s,c),/Lotte 告诉我/);
    s=decision(s,'accept');s=decision(s,'reserve','starter-stout');s=next(s);s=act(s,{type:'open'});s=act(s,{type:'water',customerId:R.customers(s)[0].id});
    s=untilNightGuest(s);const guest=R.customers(s).find(o=>o.name==='排练室管理员');assert.equal(guest.budget,10);assert.match(guest.quote,/桌花/);
    reject(s,{type:'pour',customerId:guest.id,beer:'stout',price:14,batchId:'starter-stout'});
    const cash=s.cash;s=act(s,{type:'pour',customerId:guest.id,beer:'stout',price:10,batchId:'starter-stout'});
    assert.equal(R.trade.brief(s,s.trade.contracts[0]).pouring,true);s=ticks(s,3);s=act(s,{type:'serve',customerId:guest.id});
    assert.equal(s.cash-cash,14);assert.equal(s.trade.contracts[0].status,'fulfilled');assert.match(s.lastMessage,/约定价 €10/);assert.equal(s.music,false);
    reject(s,{type:'serve',customerId:guest.id});
  });
  await t.test('order checklist distinguishes missing stock, unprotected stock and a reserved cup',()=>{
    let s=decision(offered,'accept'),c=s.trade.contracts[0];let b=R.trade.brief(s,c);assert.equal(b.missing,1);assert.match(b.next,/普通市场现货不达标/);
    s=brew(s);c=s.trade.contracts[0];b=R.trade.brief(s,c);assert.equal(b.missing,0);assert.equal(b.reserved,false);assert.match(b.next,/先预留/);
    s=decision(s,'reserve',s.batches.at(-1).id);b=R.trade.brief(s,s.trade.contracts[0]);assert.equal(b.reserved,true);assert.match(b.next,/明晚/);
    s=decision(s,'release');assert.equal(R.trade.brief(s,s.trade.contracts[0]).reserved,false);
  });
  await t.test('advance notice reaches the order as a remembered handoff without changing concert terms',()=>{
    let s=act(R.createGame(42),{type:'start'});s=act(s,{type:'journeyStart',kind:'delivery'});s=ja(s,'pack','padding');s=ja(s,'depart','smooth');s=ja(s,'notify');s=ja(s,'auto');
    s=until(s,s=>s.journeys.run.stage==='arrival');s=ja(s,'cargo');s=ja(s,'deliver','accept');s=until(s,s=>s.journeys.run.stage==='receipt');s=act(s,{type:'journeyReturn'});
    assert.equal(s.journeys.history[0].outcome,'redirected');assert.match(s.journeys.history[0].note,/桥边后台/);
    assert.equal(R.trade.terms(s,s.trade.contracts[0]).price,14);assert.equal(R.trade.terms(s,s.trade.contracts[0]).quality,2);assert.match(R.trade.memory(s,s.trade.contracts[0]),/提前联系/);
  });
  await t.test('successful delivery offers but does not accept or grant music',()=>{
    assert.equal(offered.trade.contracts[0].status,'offered');assert.equal(offered.trade.contracts[0].dueDay,2);assert.equal(offered.music,false);assert.equal(offered.promises.lotte,false);
    assert.equal(decision(offered,'decline').trade.contracts[0].status,'declined');
    const expired=next(offered);assert.equal(expired.trade.contracts[0].status,'expired');
    const duringBrew=act(offered,{type:'prepare',kind:'brew',beer:'stout'});assert.ok(R.restore(duringBrew));
  });
  await t.test('accepted order protects inventory, uses chosen batch and pays exactly once',()=>{
    let s=decision(offered,'accept');s=brew(s);const id=s.batches.at(-1).id;s=decision(s,'reserve',id);
    assert.equal(R.trade.available(s,s.batches.at(-1)),5);s=next(s);s=act(s,{type:'open'});
    s=act(s,{type:'water',customerId:R.customers(s)[0].id});
    while(!R.customers(s).some(o=>o.name==='排练室管理员'))s=ticks(s,1);
    const c=s.trade.contracts[0],guest=s.night.orders.find(o=>o.id===c.customerId);
    reject(s,{type:'pour',customerId:guest.id,beer:'stout',price:14,batchId:'starter-stout'});
    const cups=s.batches.find(b=>b.id===id).cups,cash=s.cash;
    s=act(s,{type:'pour',customerId:guest.id,beer:'stout',price:14,batchId:id});
    reject(s,{type:'contract',id:c.id,choice:'cancel'});
    assert.equal(s.batches.find(b=>b.id===id).cups,cups-1);assert.equal(s.trade.contracts[0].reservedBatch,null);
    s=ticks(s,3);s=act(s,{type:'serve',customerId:guest.id});
    assert.equal(s.trade.contracts[0].status,'fulfilled');assert.equal(s.cash-cash,20);assert.equal(s.music,false);
    reject(s,{type:'serve',customerId:guest.id});reject(s,{type:'contract',id:c.id,choice:'accept'});
    s=act(s,{type:'close'});assert.match(s.reports.at(-1).note,/已兑现/);
  });
  await t.test('cancel and release are distinct, missing or closing has a terminal consequence',()=>{
    let s=decision(offered,'accept');s=brew(s);s=decision(s,'reserve',s.batches.at(-1).id);s=decision(s,'release');assert.equal(s.trade.contracts[0].status,'accepted');assert.equal(s.trade.contracts[0].reservedBatch,null);
    const cancelled=decision(s,'cancel');assert.equal(cancelled.trade.contracts[0].status,'cancelled');assert.equal(cancelled.cash,s.cash);
    s=next(s);s=act(s,{type:'open'});s=act(s,{type:'close'});assert.equal(s.trade.contracts[0].status,'missed');assert.match(s.reports.at(-1).note,/未兑现/);
  });
  await t.test('third-day invitation resolves that night, never day four',()=>{
    let s=act(R.createGame(42),{type:'start'});s=next(next(s));s=deliver(s);assert.equal(s.trade.contracts[0].dueDay,3);s=decision(s,'accept');s=act(s,{type:'open'});s=act(s,{type:'close'});s=act(s,{type:'finish'});assert.equal(s.trade.contracts[0].status,'missed');assert.equal(s.phase,'ending');
  });
  await t.test('forged contracts and missing or oversubscribed reservations are rejected',()=>{
    const accepted=decision(offered,'accept');
    for(const patch of [{dueDay:4},{reservedBatch:'missing'},{status:'fulfilled'},{customerId:'d2-guest9'}]){const s=copy(accepted);Object.assign(s.trade.contracts[0],patch);assert.equal(R.restore(s),null);}
    const s=copy(accepted);s.trade.contracts[0].reservedBatch='starter-stout';assert.equal(R.restore(s),null);
  });
  await t.test('one remaining reserved cup cannot be sold to another customer or gifted',()=>{
    let s=decision(offered,'accept');s=brew(s);const b=s.batches.at(-1);b.cups=1;for(const other of s.batches)if(other!==b)other.cups=0;s=decision(s,'reserve',b.id);s=act(s,{type:'open'});
    reject(s,{type:'pour',customerId:R.customers(s)[0].id,beer:'stout',price:10,batchId:b.id});
    s=ticks(s,35);assert.equal(s.night.event.status,'pending');reject(s,{type:'event',choice:'comp'});s=act(s,{type:'event',choice:'refuse'});assert.equal(s.batches.at(-1).cups,1);
  });
});
function untilNightGuest(s){for(let i=0;i<40&&!R.customers(s).some(o=>o.name==='排练室管理员');i++)s=ticks(s,1);assert.ok(R.customers(s).some(o=>o.name==='排练室管理员'));return s;}
