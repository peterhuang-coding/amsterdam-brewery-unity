'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');
const shift=(day=1,kit='hook',seed=42)=>B.create(seed,day,kit,[],{marketShift:true});
const noop=()=>{};
function harness(run,paused=false){
  const gradient={addColorStop:noop};
  const context2d=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:noop});
  const canvas={getContext:()=>context2d,addEventListener:noop,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640}),setAttribute:noop};
  const mkEl=()=>({textContent:'',hidden:false,disabled:false,innerHTML:'',setAttribute:noop,classList:{toggle:noop},style:{},title:'',focus:noop,scrollIntoView:noop});
  const els=new Map();
  const document={addEventListener:noop,hidden:false,body:{classList:{toggle:noop}},
    getElementById:id=>{if(!els.has(id))els.set(id,mkEl());return els.get(id);},
    querySelector:()=>null};
  const state={run};const flags={paused};
  const window={Backstage:B,BackstageAuto:A,addEventListener:noop};
  const sandbox={window,document,matchMedia:()=>({matches:false})};
  window.window=window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-scene.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-ui.js'),'utf8'),sandbox);
  const ui=new window.BackstageUI({canvas,getState:()=>({phase:'explore',backstage:{run:state.run}}),isPaused:()=>flags.paused,save:noop,dispatch:noop,showModal:noop});
  return {ui,els,state,flags,board:()=>els.get('action-content').innerHTML};
}
const disabled=verb=>new RegExp('data-verb="'+verb+'"[^>]*disabled');

test('market controls enable/disable while walking in and out of range without clearing ui.signature',()=>{
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:B.EXIT.x,y:B.EXIT.y});
  const h=harness(r);
  h.ui.render();
  assert.ok(disabled('market-trade').test(h.board()),'trade disabled far from counter');
  assert.ok(h.ui.signature.length,'first render computes a signature');
  // Simulate ui.step frames: movement + render() only; the test never assigns ui.signature itself.
  let wentLive=false;
  for(let n=0;n<40;n++){
    const d=Math.hypot(405-r.p.x,1085-r.p.y);
    if(d>10){r.p.x+=(405-r.p.x)/d*8;r.p.y+=(1085-r.p.y)/d*8;}
    h.ui.render();
    assert.notEqual(h.ui.signature,'','render never leaves an empty signature mid-walk');
    if(!disabled('market-trade').test(h.board()))wentLive=true;
  }
  assert.ok(wentLive,'trade control went live by walking into range');
  assert.ok(!disabled('market-salvage').test(h.board()),'salvage is live too');
  h.ui.perform('market-trade');
  assert.equal(r.marketShift.approach,'trade','real command commits the route');
  // A real barrel in the bag makes delivery live at the counter.
  assert.equal(B.command(r,'collect',{itemId:'item2'}),true,'barrel actually collected');
  h.ui.render();
  assert.ok(!disabled('market-deliver').test(h.board()),'deliver live with barrel in bag');
  // Walk back out; core truth must disable delivery again, still no forced signature reset.
  for(let n=0;n<40;n++){
    const d=Math.hypot(B.EXIT.x-r.p.x,B.EXIT.y-r.p.y);
    if(d>10){r.p.x+=(B.EXIT.x-r.p.x)/d*8;r.p.y+=(B.EXIT.y-r.p.y)/d*8;}
    h.ui.render();
    assert.notEqual(h.ui.signature,'');
  }
  assert.ok(disabled('market-deliver').test(h.board()),'deliver disabled again out of range');
});

test('paused runs keep every market control frozen and perform changes nothing, even at the points',()=>{
  const r=shift(1);r.actors=[];Object.assign(r.p,{x:405,y:1110});
  const h=harness(r,true);h.ui.render();
  assert.ok(disabled('market-salvage').test(h.board()));
  assert.ok(disabled('market-trade').test(h.board()));
  h.ui.perform('market-trade');
  assert.equal(r.marketShift.approach,null,'paused perform mutates nothing');
  const rb=shift(3);rb.actors=[];Object.assign(rb.p,{x:700,y:1105});
  rb.items[3].state='bag';rb.bag=['item3'];
  const hb=harness(rb,true);hb.ui.render();
  assert.ok(disabled('market-power').test(hb.board()),'part at fuse still frozen while paused');
  hb.ui.perform('market-power');
  assert.equal(rb.marketShift.powerItem,null);
});

test('old runs without marketShift keep the previous manual board and no market controls',()=>{
  const r=B.create(42,1);
  assert.equal(B.marketInfo(r).enabled,false);
  const h=harness(r);h.ui.render();
  const html=h.board();
  for(const verb of ['market-salvage','market-trade','market-deliver','market-power'])
    assert.ok(!html.includes('data-verb="'+verb+'"'),verb+' absent on old run');
  assert.match(html,/exp-objectives/,'existing objectives still render');
});

test('the four new automatic goals render readable Chinese titles with no undefined',()=>{
  const r=shift(1);A.enable(r);
  const expected={'market-barrel':'滚动酒桶','market-counter':'收货柜台','market-fuse':'修电','market-part':'零件'};
  for(const [goal,fragment] of Object.entries(expected)){
    r.auto.goal=goal;r.auto.event=null;
    const title=A.view(r).title;
    assert.match(title,/^正在前往/,'title: '+title);
    assert.ok(!title.includes('undefined'),'undefined leaked into '+title);
    assert.ok(title.includes(fragment),'title mentions '+fragment);
  }
});

test('the automatic board never double-places manual market buttons',()=>{
  const r=shift(1);r.actors=[];
  A.enable(r); // starts at the route event
  const h=harness(r);h.ui.render();
  assert.ok(!h.board().includes('data-verb="market-salvage"'),'no manual buttons at route event');
  assert.ok(A.choose(r,'market'),'route choice accepted');
  // Real automatic travel to the market, exactly as production drives it.
  for(let n=0;n<4000&&!r.auto.event;n++)A.step(r,.05);
  assert.equal(r.auto.event,'market');
  assert.ok(A.choose(r,'mkt-trade'));
  h.ui.render();
  const html=h.board();
  for(const verb of ['market-salvage','market-trade','market-deliver','market-power'])
    assert.ok(!html.includes('data-verb="'+verb+'"'),verb+' not placed in automatic UI');
  assert.match(html,/正在前往滚动酒桶/,'travelling title still names the goal');
});

test('receipt after a bailed delivery does not grant the safe voucher',()=>{
  const r=shift(1);Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-trade');B.command(r,'collect',{itemId:'item2'});B.command(r,'market-deliver');
  B.command(r,'bail');
  const h=harness(r);h.ui.render();
  const html=h.board();
  assert.match(html,/没有安全撤离/);
  assert.ok(!/只对次日作数/.test(html),'safe-voucher wording is withheld after bailout');
});

// Defect 1: actual B.step movement (signature never reset by the test) must
// refresh a player-visible unavailable reason even though availability stays false.
test('actual walking flips the blackout power reason while canPower stays false the whole time',()=>{
  const r=shift(3);r.actors=[]; // day 3 = blackout
  Object.assign(r.p,{x:675,y:1085});
  const h=harness(r);
  const powerReason=()=>B.marketInfo(r).reasons.power;
  // Exact reproduction from the acceptance report: idle frame, render, walk frame, render.
  B.step(r,{dx:0,dy:0},.01);h.ui.render();
  const firstSignature=h.ui.signature;
  assert.ok(firstSignature.length,'first render computes a signature');
  assert.equal(B.marketInfo(r).canPower,false,'cannot power while outside fuse range');
  assert.match(powerReason(),/修电点/,'core reason: walk to the fuse first');
  assert.ok(disabled('market-power').test(h.board()),'power control disabled far from fuse');
  assert.match(h.board(),/修电点/,'old reason is on the board');
  B.step(r,{dx:1,dy:0},.05);h.ui.render();
  assert.ok(Math.abs(r.p.x-685.25)<1e-9,'real step moved 205u/s * 0.05s: '+r.p.x);
  assert.notEqual(h.ui.signature,'','signature is never left empty');
  assert.notEqual(h.ui.signature,firstSignature,'actual movement invalidated the cache');
  assert.equal(B.marketInfo(r).canPower,false,'at the fuse without a part it still cannot power');
  assert.match(powerReason(),/可修零件/,'core reason changed to the missing part');
  assert.ok(disabled('market-power').test(h.board()),'control remains disabled');
  assert.match(h.board(),/可修零件/,'rendered reason refreshed to the missing part');
  assert.doesNotMatch(h.board(),/修电点/,'stale fuse-walk reason is gone');
});

test('actual walking flips the delivery reason far-away to no-barrel while the control stays disabled',()=>{
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-trade');
  // Fixture setup only: park the barrel well away from the walking route so the
  // player's actual B.step walk cannot auto-stow it.
  Object.assign(r.items[2],{x:820,y:1280,vx:0,vy:0});
  Object.assign(r.p,{x:B.EXIT.x,y:B.EXIT.y});
  const h=harness(r);
  const deliverReason=()=>B.marketInfo(r).reasons.deliver;
  B.step(r,{dx:0,dy:0},.01);h.ui.render();
  assert.ok(h.ui.signature.length);
  assert.equal(B.marketInfo(r).canDeliver,false);
  assert.match(deliverReason(),/走到柜台旁边/,'far away gives the distance reason');
  assert.ok(disabled('market-deliver').test(h.board()),'deliver disabled far away');
  // Real walking via B.step until the counter is physically in range.
  let frames=0;
  while(deliverReason().includes('走到柜台旁边')&&frames++<60)B.step(r,{dx:1,dy:0},.05);
  h.ui.render();
  assert.ok(frames<60,'actual walk reached the counter');
  assert.notEqual(h.ui.signature,'');
  assert.equal(B.marketInfo(r).canDeliver,false,'at the counter without a barrel it still cannot deliver');
  assert.ok(deliverReason().includes('滚动酒桶（占 3 格）'),'core reason now asks for the barrel: '+deliverReason());
  assert.ok(disabled('market-deliver').test(h.board()),'control remains disabled');
  assert.ok(h.board().includes('滚动酒桶（占 3 格）'),'rendered reason refreshed');
  assert.doesNotMatch(h.board(),/走到柜台旁边/,'stale distance reason is gone');
});

// Defect 2: no internal development labels anywhere in rendered market prose.
test('market panel prose uses stock-accounting language with no item or stage labels',()=>{
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});B.command(r,'market-trade');
  // Core delivery reason at the counter without a barrel.
  const reason=B.marketInfo(r).reasons.deliver;
  assert.ok(reason.includes('滚动酒桶（占 3 格）'),'core reason names the barrel by its stock label');
  assert.doesNotMatch(reason,/item2/);
  const h=harness(r);h.ui.render();
  assert.doesNotMatch(h.board(),/item2|stage2/);
  // With the barrel actually carried, the live-delivery cost prose must stay label-free
  // while keeping the honest 3 slots / 4 cups accounting.
  assert.equal(B.command(r,'collect',{itemId:'item2'}),true);
  h.ui.signature='';h.ui.render();
  const cost='交付会消耗包里的滚动酒桶（占 3 格）；它变不回 4 杯艾尔。';
  assert.ok(h.board().includes(cost),'exact cost prose rendered');
  assert.ok(!disabled('market-deliver').test(h.board()),'deliver is live with the barrel');
  assert.doesNotMatch(h.board(),/item2|stage2/);
});

function tradeAndExtract(day){
  const r=shift(day);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-trade');B.command(r,'collect',{itemId:'item2'});B.command(r,'market-deliver');
  assert.equal(r.items[2].state,'delivered','barrel consumed at the counter');
  Object.assign(r.p,B.EXIT);B.command(r,'interact');
  assert.equal(r.status,'extracted');
  return r;
}

test('safe first and second night receipts are honest next-day records with no claim button',()=>{
  for(const day of [1,2]){
    const r=tradeAndExtract(day);
    assert.equal(B.rewards(r).cups,0,'the consumed barrel never becomes 4 cups');
    const h=harness(r);h.ui.render();
    const html=h.board();
    assert.match(html,/回执/);
    assert.ok(html.includes('只对次日白天作数'),'receipt is valid the next day: night '+day);
    assert.match(html,/领不到钱/,'no money tonight');
    assert.ok(!html.includes('data-verb="claim"'),'no claim button before the day stage');
    assert.doesNotMatch(html,/item2|stage2/);
  }
});

test('third night receipt honestly says there is no next day to cash it in',()=>{
  const r=tradeAndExtract(3);
  assert.equal(B.rewards(r).cups,0);
  const h=harness(r);h.ui.render();
  const html=h.board();
  assert.match(html,/没有下一夜/);
  assert.ok(html.includes('回执没有可兑现的一天'),'third-night receipt text');
  assert.ok(!html.includes('data-verb="claim"'));
  assert.doesNotMatch(html,/次日/);
  assert.doesNotMatch(html,/item2|stage2/);
});

test('bailed delivery and undelivered trade produce no entitlement, only an honest record',()=>{
  const bailed=shift(1);bailed.actors=[];Object.assign(bailed.p,{x:405,y:1110});
  B.command(bailed,'market-trade');B.command(bailed,'collect',{itemId:'item2'});B.command(bailed,'market-deliver');
  B.command(bailed,'bail');
  const hb=harness(bailed);hb.ui.render();
  const bhb=hb.board();
  assert.match(bhb,/回执不作数/);
  assert.doesNotMatch(bhb,/次日|item2|stage2/);
  assert.ok(!bhb.includes('data-verb="claim"'));
  // Trade route chosen, barrel never delivered, then bail: no receipt exists at all.
  const undelivered=shift(1);Object.assign(undelivered.p,{x:405,y:1110});
  B.command(undelivered,'market-trade');B.command(undelivered,'bail');
  const hu=harness(undelivered);hu.ui.render();
  const bhu=hu.board();
  assert.match(bhu,/没能交付柜台，没有回执/);
  assert.doesNotMatch(bhu,/次日|item2|stage2/);
});
