'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');

const shift=(day=1,kit='hook',seed=42)=>B.create(seed,day,kit,[],{marketShift:true});
function advance(r,seconds,input={}){for(let t=0;t<seconds-1e-8;t+=.025)B.step(r,input,Math.min(.025,seconds-t));}
function walkTo(r,to){
  for(let n=0;n<6000&&Math.hypot(to.x-r.p.x,to.y-r.p.y)>6;n++){
    const d=Math.hypot(to.x-r.p.x,to.y-r.p.y);
    B.step(r,{dx:(to.x-r.p.x)/d,dy:(to.y-r.p.y)/d},.025);
    assert.ok(!B.solid(r,r.p.x,r.p.y));
  }
  assert.ok(Math.hypot(to.x-r.p.x,to.y-r.p.y)<8,JSON.stringify({p:r.p,to}));
}
function autoNext(r){
  for(let n=0;n<8000&&r.status==='active'&&!r.auto.event;n++){
    A.step(r,.05);assert.ok(!B.solid(r,r.p.x,r.p.y));
  }
  assert.notEqual(r.auto.event,'stuck',JSON.stringify({p:r.p,time:r.time}));
  assert.ok(r.auto.event||r.status!=='active');
}
function autoPick(r,id){
  if(!r.auto?.enabled)A.enable(r);
  assert.ok(A.choose(r,id),'choice available: '+id);autoNext(r);
}

test('marketShift is strict opt-in: old create calls keep the old night run',()=>{
  const legacy=B.create(42,1);
  assert.equal(Object.hasOwn(legacy,'marketShift'),false);
  assert.equal(B.marketInfo(legacy).enabled,false);
  assert.deepEqual(B.restore(legacy),legacy);
  const enabled=shift(1);
  assert.equal(enabled.marketShift.version,1);
  assert.equal(B.marketInfo(enabled).enabled,true);
});

test('the same seed/day reproduces the shift and three nights cover all conditions',()=>{
  const runs=[1,2,3].map(d=>shift(d));
  assert.deepEqual(runs[0],shift(1));
  assert.deepEqual(runs,JSON.parse(JSON.stringify(runs)));
  assert.deepEqual(runs.map(r=>r.marketShift.condition),['staffed','restock','blackout']);
  // Formula: cast seed to uint first, then add day-1.
  for(const [seed,day,cond] of [[42,1,'staffed'],[42,2,'restock'],[42,3,'blackout'],[7,1,'restock'],[1,1,'restock']]){
    assert.equal(shift(day,'hook',seed).marketShift.condition,cond,seed+'/'+day);
  }
});

test('marketInfo exposes labels, copy, points, facts and operation availability',()=>{
  const r=shift(1),info=B.marketInfo(r);
  for(const key of ['condition','label','copy','counter','fuse','powered','approach','delivered','stockTaken','canSalvage','canTrade','canDeliver','canPower','reasons'])
    assert.ok(Object.hasOwn(info,key),key);
  assert.equal(info.counter.x,405);assert.equal(info.counter.y,1085);
  assert.equal(info.fuse.x,735);assert.equal(info.fuse.y,1105);
  assert.equal(info.approach,null);assert.equal(info.powered,true,'no blackout means the cold room is powered');
  assert.ok(info.label.length&&info.copy.length);
  assert.equal(info.canDeliver,false);
  assert.ok(info.reasons.deliver.length);
});

test('choosing a route needs a physical approach to the counter; remote commands are rejected',()=>{
  const far=shift(1);Object.assign(far.p,B.EXIT); // ~200px from the counter
  assert.equal(B.command(far,'market-salvage'),false);
  assert.equal(B.command(far,'market-trade'),false);
  assert.equal(B.marketInfo(far).canTrade,false);
  assert.ok(B.marketInfo(far).reasons.trade.includes('柜台'));
  assert.equal(far.marketShift.approach,null,'rejected commands do not mutate state');
  // A position north of the cold-room wall cannot see the fuse and is also far away.
  const blocked=shift(3);Object.assign(blocked.p,{x:600,y:1020});
  assert.equal(B.clear(blocked,blocked.p,B.marketInfo(blocked).fuse),false);
  assert.equal(B.command(blocked,'market-power'),false);
  assert.equal(blocked.marketShift.powerItem,null);
});

test('salvage choice at the counter locks the single route; trade can never follow',()=>{
  const r=shift(1);Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-salvage'),true);
  assert.equal(r.marketShift.approach,'salvage');
  assert.equal(B.command(r,'market-trade'),false);
  assert.equal(B.command(r,'market-salvage'),false,'route is chosen once');
  assert.equal(B.marketInfo(r).canSalvage,false);
});

test('picking up item0/item1 without a choice is implicitly the salvage route',()=>{
  const r=shift(1);r.actors=[];
  assert.equal(r.marketShift.approach,null);
  walkTo(r,B.marketInfo(r).counter);
  walkTo(r,{x:405,y:990});
  assert.ok(r.bag.includes('item0'));
  assert.equal(r.marketShift.stockTaken,true);
  assert.equal(r.marketShift.approach,'salvage','old grab-first intuition is preserved');
});

test('trade route physically blocks shelf and cold goods, which stay in the world',()=>{
  const r=shift(1);r.actors=[];Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-trade'),true);
  assert.equal(B.command(r,'collect',{itemId:'item0'}),false);
  assert.equal(r.items[0].state,'world');
  walkTo(r,{x:405,y:990});
  assert.equal(r.items[0].state,'world','no auto-stow of shelf goods on trade route');
  walkTo(r,{x:740,y:850});
  assert.equal(r.items[1].state,'world','cold goods also stay put on trade route');
  assert.equal(r.marketShift.stockTaken,false);
});

test('delivered barrel is consumed once at the counter and never becomes four cups',()=>{
  const r=shift(1);r.actors=[];Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-trade'),true);
  assert.equal(B.command(r,'collect',{itemId:'item2'}),true,'barrel is actually stowed (3 slots)');
  assert.ok(r.bag.includes('item2'));
  assert.equal(B.command(r,'market-power'),false,'power command is meaningless outside blackout');
  assert.equal(B.command(r,'market-deliver'),true);
  assert.equal(r.items[2].state,'delivered');
  assert.ok(!r.bag.includes('item2'));
  assert.equal(r.marketShift.delivered,true);
  assert.equal(B.command(r,'market-deliver'),false,'the same barrel cannot be delivered twice');
  assert.equal(B.command(r,'collect',{itemId:'item2'}),false);
  Object.assign(r.p,B.EXIT);B.command(r,'interact');
  const reward=B.rewards(r);
  assert.equal(reward.status,'extracted');
  assert.equal(reward.cups,0,'delivered barrel cannot be turned into its 4 cups');
  assert.deepEqual(reward.market,{condition:'staffed',approach:'trade',delivered:true,stockTaken:false,powerRestored:false});
});

test('a delivered barrel yields no receipt fact after bailout or rescue',()=>{
  const bailed=shift(1);Object.assign(bailed.p,{x:405,y:1110});
  B.command(bailed,'market-trade');B.command(bailed,'collect',{itemId:'item2'});B.command(bailed,'market-deliver');
  B.command(bailed,'bail');
  assert.equal(B.rewards(bailed).status,'bailed');
  assert.equal(B.rewards(bailed).market.delivered,true,'physical fact stays recorded');
  // Stage two must additionally require status extracted; bailed is not.
  assert.notEqual(B.rewards(bailed).status,'extracted');
});

test('staffed nights make cleaners actually see farther, other shifts do not',()=>{
  function modeFor(day){
    const r=shift(day);r.actors=r.actors.filter(a=>a.type==='cleaner');
    Object.assign(r.p,{x:730,y:1180});
    Object.assign(r.actors[0],{x:730,y:955,homeX:730,homeY:955,mode:'patrol',stun:0});
    assert.ok(B.clear(r,r.p,r.actors[0]),'LOS is open at the test range');
    advance(r,.025);return r.actors[0].mode;
  }
  assert.equal(modeFor(1),'windup','225px away: staffed cleaner spots the player');
  assert.equal(modeFor(2),'patrol','restock night uses the old 175 range');
  assert.equal(modeFor(3),'patrol','blackout night uses the old 175 range');
});

test('restock nights keep the boosted rolling barrel out of the proximity auto-stow',()=>{
  const r=shift(2);r.actors=[];
  assert.ok(r.items[2].vx>100,'restock barrel starts rolling faster');
  Object.assign(r.items[2],{x:r.p.x+25,y:r.p.y,vx:0,vy:0,lock:0});
  advance(r,.025);
  assert.equal(r.items[2].state,'world','rolling barrel does not jump into the bag by itself');
  // Deliberate collection at the same distance still works.
  assert.equal(B.command(r,'collect',{itemId:'item2'}),true);
  assert.ok(r.bag.includes('item2'));
  const normal=shift(1);normal.actors=[];
  Object.assign(normal.items[2],{x:normal.p.x+25,y:normal.p.y,vx:0,vy:0,lock:0});
  advance(normal,.025);
  assert.equal(normal.items[2].state,'bag','on staffed night the old auto-stow intuition holds');
});

test('blackout locks the cold stock until a real part is consumed at the fuse',()=>{
  const r=shift(3);r.actors=[];
  assert.equal(B.marketInfo(r).powered,false);
  assert.equal(B.command(r,'collect',{itemId:'item1'}),false,'cannot grab cold goods from afar either');
  Object.assign(r.p,{x:740,y:850});
  assert.equal(B.command(r,'collect',{itemId:'item1'}),false,'cold stock refuses even when standing on it');
  assert.notEqual(B.nearest(r)?.id,'item1','locked item is not advertised as an interaction');
  // Fuse repair without a carried part fails and consumes nothing.
  Object.assign(r.p,{x:700,y:1105});
  assert.equal(B.command(r,'market-power'),false);
  assert.equal(r.marketShift.powerItem,null);
  // Bring the existing salvage part from the unloading area: approach collinearly and stop
  // at 43px, outside the 31px proximity auto-stow.
  walkTo(r,{x:680,y:1142});
  assert.equal(B.command(r,'collect',{itemId:'item3'}),true);
  walkTo(r,{x:700,y:1105});
  assert.equal(B.command(r,'market-power'),true);
  assert.equal(r.marketShift.powerItem,'item3');
  assert.equal(r.items[3].state,'delivered');
  assert.equal(B.marketInfo(r).powered,true);
  assert.equal(B.command(r,'market-power'),false,'no free second repair');
  // Cold goods can now be collected.
  walkTo(r,{x:740,y:850});
  assert.ok(r.bag.includes('item1'));
  assert.equal(r.marketShift.stockTaken,true);
});

test('fuse repair consumes exactly one salvage and never swallows unrelated items',()=>{
  const r=shift(3);r.actors=[];
  for(const id of ['item3','item8']){r.items.find(i=>i.id===id).state='bag';r.bag.push(id);}
  Object.assign(r.p,{x:700,y:1105});
  assert.equal(B.command(r,'market-power'),true);
  assert.equal(r.bag.length,1,'only one part is consumed');
  assert.ok(r.bag.includes('item8'),'the other part stays in the bag');
  assert.equal(r.items[3].state,'delivered');
  const bottles=shift(3);
  Object.assign(bottles.p,{x:700,y:1105});
  assert.equal(B.command(bottles,'market-power'),false,'a bag without salvage cannot repair');
});

test('automatic trade route completes with real steps in all three conditions',()=>{
  for(const day of [1,2,3]){
    let r=shift(day);
    autoPick(r,'market');assert.equal(r.auto.event,'market');
    autoPick(r,'mkt-trade');
    assert.equal(r.marketShift.approach,'trade');
    assert.equal(r.marketShift.delivered,true,'barrel physically delivered via shared commands');
    assert.equal(r.items[2].state,'delivered');
    assert.equal(r.auto.event,'market');
    autoPick(r,'exit');
    assert.equal(r.status,'extracted',day);
    const m=B.rewards(r).market;
    assert.equal(m.approach,'trade');assert.equal(m.delivered,true);assert.equal(m.stockTaken,false);
  }
});

test('automatic salvage route in a blackout fetches a part, restores power and takes cold stock',()=>{
  let r=shift(3);
  autoPick(r,'market');
  autoPick(r,'mkt-salvage');
  assert.equal(r.marketShift.approach,'salvage');
  assert.ok(A.view(r).choices.some(c=>c.id==='market-fuse'),'fuse errand is offered instead of cold room');
  assert.ok(!A.view(r).choices.some(c=>c.id==='market-cold'),'locked cold room is not offered');
  autoPick(r,'market-fuse');
  assert.equal(r.marketShift.powerRestored??(r.marketShift.powerItem!==null),true);
  assert.equal(r.marketShift.powerItem,'item3');
  assert.equal(r.auto.event,'market');
  autoPick(r,'market-cold');
  assert.ok(r.bag.includes('item1'));
  autoPick(r,'exit');
  assert.equal(r.status,'extracted');
  assert.equal(B.rewards(r).market.powerRestored,true);
});

test('automatic salvage route on a staffed night takes shelf stock and extracts',()=>{
  let r=shift(1);
  autoPick(r,'market');autoPick(r,'mkt-salvage');autoPick(r,'market-stock');
  assert.ok(r.bag.includes('item0'));
  autoPick(r,'exit');
  assert.equal(r.status,'extracted');
  assert.equal(B.rewards(r).market.stockTaken,true);
});

test('reading an automatic choice pauses the whole city',()=>{
  const r=shift(1);A.enable(r);
  assert.ok(r.auto.event,'route choice is shown immediately');
  const before=structuredClone(r);
  for(let i=0;i<20;i++){A.step(r,.1);B.step(r,{},.1);}
  assert.deepEqual(r,before);
});

test('marketShift state roundtrips at every stage; tampered saves are rejected',()=>{
  const fresh=shift(2);assert.deepEqual(B.restore(fresh),fresh);
  const r=shift(3);Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-salvage');
  assert.deepEqual(B.restore(r),r);
  const done=shift(1);Object.assign(done.p,{x:405,y:1110});
  B.command(done,'market-trade');B.command(done,'collect',{itemId:'item2'});B.command(done,'market-deliver');
  assert.deepEqual(B.restore(done),done);
  const powered=shift(3);
  Object.assign(powered.p,{x:700,y:1105});
  powered.items[3].state='bag';powered.bag=['item3'];
  B.command(powered,'market-power');
  assert.deepEqual(B.restore(powered),powered);
  function rejects(patch,base=r){
    const bad=structuredClone(base);patch(bad.marketShift);
    assert.equal(B.restore(bad),null,JSON.stringify(bad.marketShift));
  }
  rejects(m=>{m.version=2;});
  rejects(m=>{m.condition='festival';});
  rejects(m=>{m.approach='steal';});
  rejects(m=>{m.delivered='true';});
  rejects(m=>{m.stockTaken='no';});
  rejects(m=>{m.powerItem=99;});
  rejects(m=>{m.extra=true;});
  rejects(m=>{m.condition='blackout';},shift(1)); // condition mismatch with seed/day
  // Forged delivery without the physical barrel fact.
  rejects(m=>{m.approach='trade';m.delivered=true;},shift(1));
  // Salvage claim with a delivery flag is internally inconsistent.
  rejects(m=>{m.approach='salvage';m.delivered=true;});
  // Fuse facts must reference a real salvage item already consumed.
  rejects(m=>{m.powerItem='item99';},shift(3));
  rejects(m=>{m.powerItem='item0';},shift(3)); // wrong kind
  function powerItemInBag(){
    const bad=structuredClone(shift(3));
    bad.items[3].state='bag';bad.bag=['item3'];bad.marketShift.powerItem='item3';
    assert.equal(B.restore(bad),null);
  }
  powerItemInBag();
  function powerOutsideBlackout(){
    const bad=structuredClone(shift(1));
    bad.items[3].state='delivered';bad.marketShift.powerItem='item3';
    assert.equal(B.restore(bad),null);
  }
  powerOutsideBlackout();
  function tradeLoot(){
    const bad=structuredClone(shift(1));
    bad.marketShift.approach='trade';bad.items[0].state='bag';bad.bag=['item0'];
    assert.equal(B.restore(bad),null);
  }
  tradeLoot();
  function missingField(){
    const bad=structuredClone(shift(1));delete bad.marketShift.delivered;
    assert.equal(B.restore(bad),null);
  }
  missingField();
});

test('legacy runs and old versions never gain a marketShift through restore',()=>{
  const legacy=B.create(42,1);
  assert.equal(Object.hasOwn(B.restore(legacy),'marketShift'),false);
  const old=B.create(42,2);old.version=2;delete old.location;
  const restored=B.restore(old);assert.ok(restored);
  assert.equal(Object.hasOwn(restored,'marketShift'),false);
});

test('UI renders real manual market controls and failure reasons; scene draws markers',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const noop=()=>{},gradient={addColorStop:noop};
  const context2d=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:noop});
  const canvas={getContext:()=>context2d,addEventListener:noop,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640}),setAttribute:noop};
  const mkEl=()=>({textContent:'',hidden:false,disabled:false,innerHTML:'',setAttribute:noop,classList:{toggle:noop},style:{},title:'',focus:noop,scrollIntoView:noop});
  const els=new Map();
  const document={
    addEventListener:noop,hidden:false,body:{classList:{toggle:noop}},
    getElementById:id=>{if(!els.has(id))els.set(id,mkEl());return els.get(id);},
    querySelector:()=>null
  };
  const window={Backstage:B,BackstageAuto:A,addEventListener:noop};
  const sandbox={window,document,matchMedia:()=>({matches:false})};
  window.window=window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-scene.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-ui.js'),'utf8'),sandbox);
  const ui=new window.BackstageUI({canvas,getState:()=>({phase:'explore',backstage:{run:rState.run}}),isPaused:()=>false,save:noop,dispatch:noop,showModal:noop});
  // Staffed night, standing near the counter: both route buttons are live.
  const rState={run:shift(1)};rState.run.actors=[];
  Object.assign(rState.run.p,{x:405,y:1110});
  ui.render();
  let html=els.get('action-content').innerHTML;
  assert.match(html,/data-verb="market-salvage"/);
  assert.match(html,/data-verb="market-trade"/);
  assert.ok(!/data-verb="market-trade"[^>]*disabled/.test(html),'trade button enabled at the counter');
  assert.match(html,/值班/);
  // Far from the counter: controls disable with a visible reason.
  Object.assign(rState.run.p,B.EXIT);ui.signature='';ui.render();
  html=els.get('action-content').innerHTML;
  assert.ok(/data-verb="market-trade"[^>]*disabled/.test(html));
  assert.match(html,/柜台/);
  // Blackout near the fuse without a part shows the disabled power control and reason.
  rState.run=shift(3);rState.run.actors=[];Object.assign(rState.run.p,{x:700,y:1105});
  ui.signature='';ui.render();
  html=els.get('action-content').innerHTML;
  assert.match(html,/data-verb="market-power"[^>]*disabled/);
  assert.match(html,/零件/);
  // With a real part carried, the power control is live.
  rState.run.items[3].state='bag';rState.run.bag=['item3'];
  ui.signature='';ui.render();
  html=els.get('action-content').innerHTML;
  assert.ok(!/data-verb="market-power"[^>]*disabled/.test(html));
  // Canvas markers and condition signs draw without errors at all three conditions.
  for(const day of [1,2,3]){
    rState.run=shift(day);
    ui.scene.draw(rState.run);
  }
  // Final receipt explains the trade consequence.
  const ended=shift(1);Object.assign(ended.p,{x:405,y:1110});
  B.command(ended,'market-trade');B.command(ended,'collect',{itemId:'item2'});B.command(ended,'market-deliver');
  Object.assign(ended.p,B.EXIT);B.command(ended,'interact');
  rState.run=ended;ui.signature='';ui.render();
  assert.match(els.get('action-content').innerHTML,/回执/);
});
