'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const J=require('./journey-core.js');
const R=require('./reopening-core.js');

function ok(r,verb,value,cash=45){
  const a=J.act(r,verb,value,cash);
  assert.equal(a.ok,true,a.message);
  assert.ok(J.valid(r),'valid after '+verb+' / '+r.stage);
  return a;
}
function runUntil(r,pred,maxTicks=8000){
  for(let i=0;i<maxTicks;i++){
    if(pred(r))return i;
    ok(r,'tick',{seconds:.1});
  }
  assert.fail('did not reach predicate; stuck at '+r.stage+' '+JSON.stringify(r.p));
}

// Candidate real actions to branch on; failed verbs never mutate a run.
const VERBS=[
  ['pack','padding'],['pack','capacity'],
  ['depart','short'],['depart','smooth'],
  ['notify'],['garden-route'],['garden-wrap'],['garden-leave'],
  ['parcel','take'],['parcel','deliver'],['parcel','return'],
  ['auto'],['speed'],
  ['street','talk'],['street','detour'],['street','fight'],
  ['bike'],['cargo'],['defend'],
  ['dash',{dx:1}],['dash',{dx:-1}],['dash',{dy:1}],['dash',{dy:-1}],
  ['ticket','paid'],['ticket','unpaid'],['ticket','credit'],
  ['secure'],['help',true],['help',false],['inspect'],
  ['tidy'],['leaveArrival'],
  ['deliver','accept'],['deliver','return'],['deliver','table'],
  ['abandon'],
];
// Quantized key keeps the graph finite while every stored node is a real run.
function qn(v,g){return Math.round(v/g);}
function key(r){
  const c=r.conflict?{mode:r.conflict.mode,x:qn(r.conflict.x,20),y:qn(r.conflict.y,20),timer:Math.round(r.conflict.timer*2),hits:r.conflict.hits,stagger:r.conflict.stagger}:null;
  return JSON.stringify({stage:r.stage,p:[qn(r.p.x,20),qn(r.p.y,20)],bike:[qn(r.bike.x,20),qn(r.bike.y,20),r.bike.mounted],
    cargo:r.cargo,q:Math.round(r.quality),e:Math.round(r.elapsed/2),slow:r.slow,auto:r.auto,ret:r.returning,
    enc:r.encounterDone,route:r.route,pk:r.packing,load:r.load,care:r.care,g:r.garden,
    tk:r.ticket,leg:r.leg,tr:Math.round(r.travel),checked:r.checked,ev:r.eventDone,help:r.help,
    paid:r.paid,fee:r.fee,out:r.outcome,c});
}
function explore(root,label,nodeCap){
  const nodes=new Map(); // key -> {r, outs:Set(key)}
  const queue=[root];
  nodes.set(key(root),{r:root,outs:new Set(),receipt:root.stage==='receipt'});
  let truncated=false;
  while(queue.length){
    if(nodes.size>=nodeCap){truncated=true;break;}
    const r=queue.shift(),cur=nodes.get(key(r));
    const edges=[];
    for(const [verb,value] of VERBS){
      const clone=structuredClone(r);
      const a=J.act(clone,verb,value,45);
      if(a.ok){const k=key(clone);if(k!==key(r))edges.push([k,clone]);}
    }
    // Tick edges: zero input plus four manual directions (auto ignores input).
    if(J.moving(r)&&r.elapsed<=110){
      const inputs=[{seconds:.1}];
      if(!r.auto)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])inputs.push({seconds:.1,dx,dy});
      for(const input of inputs){
        const clone=structuredClone(r);
        const a=J.act(clone,'tick',input);
        if(a.ok){const k=key(clone);if(k!==key(r))edges.push([k,clone]);}
      }
    }
    for(const [k,clone] of edges){
      cur.outs.add(k);
      if(!nodes.has(k)){
        assert.ok(J.valid(clone),label+' invalid state reached: '+k.slice(0,300));
        nodes.set(k,{r:clone,outs:new Set(),receipt:clone.stage==='receipt'});
        queue.push(clone);
      }
    }
  }
  assert.equal(truncated,false,label+' exploration hit node cap '+nodeCap);
  // Reverse reachability: every reached state must have a path to receipt.
  const canReachReceipt=new Set();
  const stack=[...nodes].filter(([,n])=>n.receipt).map(([k])=>k);
  while(stack.length){
    const k=stack.pop();if(canReachReceipt.has(k))continue;canReachReceipt.add(k);
    for(const [pk,n] of nodes){if(!canReachReceipt.has(pk)&&n.outs.has(k))stack.push(pk);}
  }
  const trapped=[...nodes.keys()].filter(k=>!canReachReceipt.has(k));
  assert.equal(trapped.length,0,label+' trapped states ('+trapped.length+') e.g. '+String(trapped[0]).slice(0,400));
  return {nodes:nodes.size,receipts:[...nodes.values()].filter(n=>n.receipt).length};
}

test('city journey quality',async t=>{
  await t.test('bounded real-action graph: v4 delivery has no invalid or trapped states',()=>{
    const root=J.create(42,1,'delivery',4,{known:true});
    assert.ok(J.valid(root));
    const n=explore(root,'v4 delivery',12000);
    assert.ok(n.nodes>200,'graph should be broad, got '+n.nodes);
    assert.ok(n.receipts>=1,'graph must reach receipt');
  });
  await t.test('bounded real-action graph: rail v1 has no invalid or trapped states',()=>{
    const root=J.create(42,1,'rail',1);
    const n=explore(root,'rail v1',12000);
    assert.ok(n.nodes>40,'graph should be broad, got '+n.nodes);
    assert.ok(n.receipts>=1,'graph must reach receipt');
  });
  await t.test('reading a choice freezes the outbound clock and clocks resume after',()=>{
    // Padding (no parcel) makes auto take the short north route into the encounter.
    const r=J.create(1,1,'delivery',4,{known:true});
    ok(r,'pack','padding');ok(r,'depart','short');
    runUntil(r,n=>n.stage==='conflict'&&n.conflict.mode==='choice');
    const e=r.elapsed,p={...r.p};
    ok(r,'tick',{seconds:1});
    assert.equal(r.elapsed,e);assert.deepEqual(r.p,p);
    ok(r,'street','talk');ok(r,'auto');
    runUntil(r,n=>n.stage==='arrival');
    assert.ok(r.elapsed>e);
  });
  await t.test('parcel 55s and delivery deadline 40s use inclusive boundaries',()=>{
    for(const elapsed of [55,55.01]){
      const r=J.create(42,1,'delivery',4,{known:true});
      ok(r,'pack','capacity');ok(r,'depart','smooth');
      runUntil(r,n=>n.stage==='dropoff');
      ok(r,'parcel','take');r.elapsed=elapsed;
      ok(r,'parcel','deliver');
      assert.equal(r.load.onTime,elapsed===55);
    }
    for(const elapsed of [40,40.01]){
      const r=J.create(42,1,'delivery',4);
      ok(r,'pack','padding');ok(r,'depart','smooth');
      runUntil(r,n=>n.stage==='arrival');ok(r,'cargo');r.elapsed=elapsed;
      ok(r,'deliver','accept');
      assert.equal(r.outcome,elapsed===40?'delivered':'late');
    }
  });
  await t.test('tidy and table stay inside elapsed and quality bounds',()=>{
    const r=J.create(42,1,'delivery',4,{known:true});
    ok(r,'pack','padding');ok(r,'depart','smooth');
    runUntil(r,n=>n.stage==='arrival');ok(r,'cargo');
    r.quality=79;const e=r.elapsed;
    ok(r,'tidy');assert.equal(r.quality,80);assert.equal(r.elapsed,e+15);
    assert.equal(J.act(r,'deliver','table').ok,false);
  });
  await t.test('legacy v1-v3 saves keep their shape through JSON round trips',()=>{
    for(const version of [1,2,3]){
      const r=J.create(7,2,'delivery',version);
      ok(r,'pack',version===1?'padding':'capacity');ok(r,'depart','smooth');
      const copy=JSON.parse(JSON.stringify(r));
      assert.deepEqual(copy,r);assert.ok(J.valid(copy));
      assert.equal(copy.version,version);
    }
  });
  await t.test('integration: full delivery via Reopening settles once and keeps real clocks',()=>{
    let s=R.act(R.createGame(42),{type:'start'}).state;
    s=R.act(s,{type:'journeyStart',kind:'delivery'}).state;
    const j=(verb,value)=>{s=R.act(s,{type:'journeyAction',verb,value}).state;};
    j('pack','capacity');j('depart','short');
    runUntil(s.journeys.run,n=>n.stage==='conflict');
    j('street','detour');j('auto');
    runUntil(s.journeys.run,n=>n.stage==='dropoff');
    j('parcel','take');j('parcel','deliver');
    runUntil(s.journeys.run,n=>n.stage==='arrival');
    j('cargo');j('deliver','accept');
    runUntil(s.journeys.run,n=>n.stage==='receipt');
    const reward=s.journeys.run.reward,actions=s.actions;
    const done=R.act(s,{type:'journeyReturn'});
    assert.equal(done.ok,true);s=done.state;
    assert.equal(s.cash,45+reward);
    assert.equal(s.actions,actions);
    assert.equal(R.act(s,{type:'journeyReturn'}).ok,false);
  });
});
