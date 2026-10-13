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
function walkTo(r,to){
  for(let n=0;n<9000&&Math.hypot(to.x-r.p.x,to.y-r.p.y)>6;n++){
    const d=Math.hypot(to.x-r.p.x,to.y-r.p.y);
    B.step(r,{dx:(to.x-r.p.x)/d,dy:(to.y-r.p.y)/d},.025);
  }
  assert.ok(Math.hypot(to.x-r.p.x,to.y-r.p.y)<10,JSON.stringify({p:r.p,to}));
}
function focus(html){
  const m=html.match(/<div class="exp-location" id="exp-market-focus"[^>]*>([\s\S]*?)<\/div>/);
  if(!m)return null;
  const clean=x=>(x||'').replace(/<[^>]+>/g,'');
  return {
    block:m[0],
    heading:clean(m[0].match(/<strong>([\s\S]*?)<\/strong>/)[1]),
    action:clean(m[0].match(/<p>([\s\S]*?)<\/p>/)[1]),
    note:clean((m[0].match(/<small>([\s\S]*?)<\/small>/)||[])[1])
  };
}
const clen=s=>[...s].length;
function assertSized(f){
  assert.ok(f,'focus card exists');
  assert.ok(f.heading.length&&f.action.length,'heading and action present');
  assert.ok(clen(f.heading)<=24,'heading <=24 chars: '+f.heading);
  assert.ok(clen(f.action)<=65,'action <=65 chars: '+f.action);
}
const MANUAL_VERBS=['market-salvage','market-trade','market-deliver','market-power'];

test('manual supermarket night opens on one undecided counter objective with the real shift label',()=>{
  const r=shift(1);r.actors=[]; // starts at the tavern exit, which lies inside the market zone rectangle
  const before=structuredClone(r);
  const h=harness(r);h.ui.render();
  const f=focus(h.board());assertSized(f);
  assert.ok(f.block.includes('眼前这一步'),'stable landmark prefix');
  assert.match(f.heading,/柜台/,'undecided stage points at the counter');
  assert.match(f.action,/走到/);
  assert.ok(!f.action.includes('回执'),'no voucher before any choice');
  assert.ok(h.board().includes(B.marketInfo(r).label),'real night label stays visible');
  assert.deepEqual(r,before,'render mutates nothing');
});

test('manual guidance follows undecided -> trade -> barrel -> deliver -> extraction truthfully',()=>{
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  const h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.heading,/表态/);
  h.ui.perform('market-trade');
  assert.equal(r.marketShift.approach,'trade');
  f=focus(h.board());assertSized(f);
  assert.match(f.heading,/酒桶/,'fetch-barrel stage');
  assert.match(f.action,/3 格/,'states the real slot need');
  assert.ok(!/按\s*R/.test(f.action),'never tells the player to use R on the deliverable barrel');
  assert.ok(f.action.includes('不是街边'),'distinguishes the deliverable barrel from the street empty barrel');
  // Fixture: park the real rolling barrel west of the counter (away from the street empty barrel) and collect it.
  Object.assign(r.items[2],{x:320,y:1180,vx:0,vy:0,lock:0});
  Object.assign(r.p,{x:335,y:1180});
  assert.equal(B.command(r,'collect',{itemId:'item2'}),true,'real barrel collected');
  assert.equal(B.marketInfo(r).canDeliver,false,'still far from the counter');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/柜台/);
  assert.match(f.action,/走到柜台旁边/,'uses the real distance reason');
  assert.ok(!f.action.includes('交付已确认'),'no early delivery claim');
  // Real walk back to the counter: delivery goes live, and the cost prose remains visible below.
  walkTo(r,{x:405,y:1110});
  assert.equal(B.marketInfo(r).canDeliver,true);
  h.ui.render();
  assert.match(h.board(),/变不回 4 杯艾尔/,'barrel consumption risk still on the board');
  f=focus(h.board());assertSized(f);
  assert.match(f.action,/交付/);
  h.ui.perform('market-deliver');
  assert.equal(r.items[2].state,'delivered');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/撤离/);
  assert.match(f.action,/回执/);
  assert.ok(!/再交付|交付按钮/.test(f.action),'no repeat-delivery encouragement');
  assert.ok(!/领到钱|已发现金|€\d+/.test(f.action),'no cash granted tonight');
  // Genuine extraction ends the active board; receipt replaces the goal card.
  Object.assign(r.p,B.EXIT);B.command(r,'interact');
  h.ui.render();
  assert.equal(r.status,'extracted');
  assert.equal(focus(h.board()),null);
  assert.match(h.board(),/回执/);
});

test('salvage guidance names real shelf and cold destinations, then confirms goods and next-day fact',()=>{
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-salvage'),true);
  const h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.action,/货架/);
  assert.match(f.action,/冷库/);
  walkTo(r,{x:405,y:990});
  assert.ok(r.bag.includes('item0'),'shelf stock really stowed');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/货已入包/);
  assert.match(f.action,/€10/,'real next-day crate fact');
  assert.match(f.action,/撤离/,'safe return is an option');
});

test('blackout keeps free shelf choice distinct from the EUR5 repair; day3 has no next day',()=>{
  const r=shift(3);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-salvage'),true);
  const h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.action,/货架/);
  assert.match(f.action,/修电/);
  assert.match(f.action,/€5/);
  assert.match(f.action,/免费/,'shelf taking stays free, repair is the paid part');
  // Proximity fixture: stand east of the delivery wall within real collect range of the part.
  Object.assign(r.p,{x:680,y:1142});
  assert.equal(B.command(r,'collect',{itemId:'item3'}),true,'real part collected');
  walkTo(r,{x:700,y:1105});
  assert.equal(B.command(r,'market-power'),true,'power restored with the real part');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/货架与冷库/);
  assert.match(f.action,/冷库/,'cold destination appears only once power is real');
  walkTo(r,{x:740,y:850});
  assert.ok(r.bag.includes('item1'),'cold goods really stowed after repair');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/撤离/);
  assert.doesNotMatch(f.action,/次日/);
  assert.doesNotMatch(f.action,/€10/);
});

test('third-night delivered trade points to extraction without a cashable receipt',()=>{
  const r=shift(3);r.actors=[];Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-trade');B.command(r,'collect',{itemId:'item2'});B.command(r,'market-deliver');
  const h=harness(r);h.ui.render();
  const f=focus(h.board());assertSized(f);
  assert.match(f.action,/没有下一天/);
  assert.doesNotMatch(f.action,/次日回执才作数/);
  assert.ok(!/领到|发现金/.test(f.action));
});

test('paused night keeps the same current goal, shows the frozen note and performs nothing',()=>{
  const r=shift(1);r.actors=[];Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-trade');
  const h=harness(r,true);h.ui.render();
  const f=focus(h.board());assertSized(f);
  assert.match(f.heading,/酒桶/);
  assert.match(f.note,/已暂停/);
  h.ui.perform('market-salvage');
  h.ui.perform('market-deliver');
  assert.equal(r.marketShift.approach,'trade');
  assert.equal(r.marketShift.delivered,false);
});

test('automatic market legs keep one truthful goal, real choices and no early delivery claim',()=>{
  const r=shift(1);r.actors=[];A.enable(r);
  const h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.heading,/从哪开始/);
  for(const verb of MANUAL_VERBS)assert.ok(!h.board().includes('data-verb="'+verb+'"'),verb+' never duplicated in auto');
  assert.ok(A.choose(r,'market'));
  for(let n=0;n<4000&&!r.auto.event;n++)A.step(r,.05);
  assert.equal(r.auto.event,'market');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/表态/);
  assert.match(h.board(),/data-verb="choice:mkt-trade"/,'A.view choices remain the controls');
  assert.ok(A.choose(r,'mkt-trade'));
  let barrelLeg=null;
  for(let n=0;n<4000&&r.status==='active';n++){
    A.step(r,.05);
    if(!r.auto.event&&r.auto.goal==='market-barrel'){h.ui.render();barrelLeg=focus(h.board());}
    if(!r.auto.event&&r.auto.goal==='market-counter'&&r.bag.includes('item2')){
      h.ui.render();const g=focus(h.board());assertSized(g);
      assert.match(g.heading,/柜台/);
      assert.ok(!g.action.includes('交付已确认'));
      break;
    }
  }
  if(barrelLeg){assertSized(barrelLeg);assert.match(barrelLeg.heading,/酒桶/);assert.ok(!barrelLeg.action.includes('交付已确认'));}
  for(let n=0;n<4000&&!r.auto.event&&r.status==='active';n++)A.step(r,.05);
  assert.equal(r.marketShift.delivered,true,'barrel really delivered via shared commands');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/撤离/);
  assert.match(f.action,/回执/);
  for(const verb of MANUAL_VERBS)assert.ok(!h.board().includes('data-verb="'+verb+'"'),verb+' still absent after delivery');
});

test('a full bag on the trade errand trips a real stuck event that overrides the advice',()=>{
  const r=shift(1);r.actors=[];
  // Proximity fixtures (sanctioned by the brief): stand beside each real single, then collect
  // through the real B.command distance/LOS/capacity checks. The market barrel stays in the world.
  const standCollect=(id,x,y)=>{Object.assign(r.p,{x,y});assert.equal(B.command(r,'collect',{itemId:id}),true,id);};
  standCollect('item7',1300,900);standCollect('item8',1430,1160);standCollect('item10',1920,1060);
  standCollect('item4',610,570);standCollect('item5',430,400);standCollect('item3',680,1142);
  assert.equal(B.load(r),6);
  A.enable(r);
  assert.ok(A.choose(r,'market'));
  for(let n=0;n<8000&&!r.auto.event;n++)A.step(r,.05);
  assert.equal(r.auto.event,'market');
  assert.ok(A.choose(r,'mkt-trade'));
  let stuck=false;
  for(let n=0;n<4000&&r.status==='active';n++){A.step(r,.05);if(r.auto.event==='stuck'){stuck=true;break;}}
  assert.ok(stuck,'capacity-blocked barrel fetch becomes stuck, never a fake delivery');
  const h=harness(r);h.ui.render();
  const f=focus(h.board());assertSized(f);
  assert.match(f.heading,/不好走/);
  assert.equal(r.marketShift.delivered,false);
  assert.ok(!f.action.includes('交付已确认'));
});

test('real capacity and glimpse auto events override market advice when read inside the market',()=>{
  const r=shift(1);r.actors=[];
  // Proximity fixtures (sanctioned by the brief): stand beside each real single, then collect
  // through the real B.command distance/LOS/capacity checks.
  const standCollect=(id,x,y)=>{Object.assign(r.p,{x,y});assert.equal(B.command(r,'collect',{itemId:id}),true,id);};
  standCollect('item7',1300,900);standCollect('item8',1430,1160);standCollect('item10',1920,1060);
  standCollect('item4',610,570);standCollect('item5',430,400);standCollect('item3',680,1142);
  assert.equal(B.load(r),6);
  A.enable(r);
  assert.ok(A.choose(r,'club'));
  for(let n=0;n<9000&&!r.auto.event;n++)A.step(r,.05);
  assert.equal(r.auto.event,'club');
  assert.ok(A.choose(r,'take-foam'));
  assert.equal(r.auto.event,'capacity','real capacity event before taking the 3-slot box');
  // Proximity fixture (sanctioned by the brief): read this advice while standing in the market zone.
  Object.assign(r.p,{x:405,y:1110,fx:0,fy:1});
  let h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.heading,/背包/);

  // Real glimpse event on a sorting leg past the flower cart.
  const g=shift(1);g.actors=[]; // proximity fixture: no patrol interference
  A.enable(g);
  assert.ok(A.choose(g,'sorting'));
  A.step(g,.5);
  // Proximity fixture: hold a clear tile beside the passing flower cart until legTime trips the glimpse.
  let glimpsed=false;
  for(let n=0;n<12&&!glimpsed;n++){
    Object.assign(g.p,{x:1080,y:1060,fx:1,fy:0});
    A.step(g,.05);
    glimpsed=g.auto.event==='glimpse';
  }
  assert.ok(glimpsed,'glimpse event fires from a real sorting leg');
  // Proximity fixture: read the override from inside the market zone.
  Object.assign(g.p,{x:405,y:1110});
  h=harness(g);h.ui.render();
  f=focus(h.board());assertSized(f);
  assert.match(f.heading,/花车/);
  assert.match(f.action,/温室/);
});

test('legacy runs and outside-market positions keep the old three-objective board unchanged',()=>{
  const legacy=B.create(42,1);
  assert.equal(B.marketInfo(legacy).enabled,false);
  const h=harness(legacy);h.ui.render();
  assert.equal(focus(h.board()),null);
  assert.match(h.board(),/exp-objectives/);
  for(const verb of MANUAL_VERBS)assert.ok(!h.board().includes('data-verb="'+verb+'"'));
  const r=shift(1);Object.assign(r.p,{x:1230,y:1000}); // marketShift run, currently in the club zone
  const h2=harness(r);h2.ui.render();
  assert.equal(focus(h2.board()),null);
  assert.match(h2.board(),/exp-objectives/);
});

test('rendering guidance never mutates run, items or auto history',()=>{
  const r=shift(1);r.actors=[];Object.assign(r.p,{x:405,y:1110});
  B.command(r,'market-trade');
  const h=harness(r);
  let snap=structuredClone(r);h.ui.render();assert.deepEqual(r,snap);
  Object.assign(r.items[2],{x:560,y:1180,vx:0,vy:0});Object.assign(r.p,{x:545,y:1180});
  B.command(r,'collect',{itemId:'item2'});
  snap=structuredClone(r);h.ui.render();assert.deepEqual(r,snap);
  A.enable(r);
  snap=structuredClone(r);h.ui.render();assert.deepEqual(r,snap);
});

const OBJECTIVE_PROSE=['一箱“进口酵母”','红灯街的 Noor','玻璃后面，有人在生活'];

test('correction: active market hides the WHOLE unrelated objectives fragment and leads with the focus card',()=>{
  const r=shift(1);r.actors=[]; // tavern exit sits inside the market zone rectangle
  const h=harness(r);h.ui.render();
  let html=h.board();
  for(const prose of OBJECTIVE_PROSE)assert.ok(!html.includes(prose),'manual market hides child prose: '+prose);
  assert.ok(!html.includes('exp-objectives'),'wrapper hidden together with its contents');
  let focusAt=html.indexOf('exp-market-focus'),browAt=html.indexOf('board-eyebrow');
  assert.ok(focusAt>=0&&focusAt<browAt,'focus card sits ahead of generic exposition in manual');
  assert.ok(html.includes('data-verb="market-salvage"')&&html.includes('exp-bag'),'market choices and backpack stay visible');
  // The fragment stays hidden on later manual stages: route chosen, then goods actually taken.
  Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-salvage'),true);
  h.ui.render();html=h.board();
  for(const prose of OBJECTIVE_PROSE)assert.ok(!html.includes(prose),'still hidden after salvage choice: '+prose);
  walkTo(r,{x:405,y:990});
  h.ui.render();html=h.board();
  for(const prose of OBJECTIVE_PROSE)assert.ok(!html.includes(prose),'still hidden after taking goods: '+prose);
  // Automatic market board: same ordering, no unrelated prose, A.view choices remain the controls.
  const g=shift(1);g.actors=[];A.enable(g);
  const h2=harness(g);h2.ui.render();html=h2.board();
  focusAt=html.indexOf('exp-market-focus');browAt=html.indexOf('board-eyebrow');
  assert.ok(focusAt>=0&&focusAt<browAt,'focus card sits ahead of generic exposition in auto');
  for(const prose of OBJECTIVE_PROSE)assert.ok(!html.includes(prose),'auto market never shows the prose: '+prose);
  assert.match(html,/data-verb="choice:/,'A.view choices remain the controls in auto');
  // Legacy run: the exact old fragment with its wrapper is still rendered.
  const legacy=B.create(42,1);
  const h3=harness(legacy);h3.ui.render();html=h3.board();
  assert.ok(html.includes('exp-objectives'),'legacy keeps the wrapper');
  for(const prose of OBJECTIVE_PROSE)assert.ok(html.includes(prose),'legacy keeps prose: '+prose);
  // marketShift run currently standing in another zone keeps the old fragment too.
  const out=shift(1);Object.assign(out.p,{x:1230,y:1000}); // club zone
  const h4=harness(out);h4.ui.render();html=h4.board();
  assert.ok(html.includes('exp-objectives'),'outside market keeps the wrapper');
  for(const prose of OBJECTIVE_PROSE)assert.ok(html.includes(prose),'outside market keeps prose: '+prose);
});

test('correction: dropped market goods read as a floor recovery choice, not bag possession; recollect restores the card',()=>{
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-salvage'),true);
  walkTo(r,{x:405,y:990});
  assert.ok(r.bag.includes('item0'),'shelf goods really stowed');
  assert.equal(r.marketShift.stockTaken,true);
  const h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.heading,/货已入包/);
  assert.match(f.action,/€10/);
  // Real reproduction from the brief: Q drops the carried good. stockTaken is a
  // historical consequence flag; it must not be presented as current possession.
  assert.equal(B.command(r,'drop',{x:r.p.x-1,y:r.p.y}),true);
  assert.equal(r.bag.includes('item0'),false);
  assert.equal(r.items[0].state,'world');
  assert.equal(r.marketShift.stockTaken,true,'surcharge consequence remains on record after drop');
  // No test-forced ui.signature reset: render must refresh from the real state change.
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.ok(!f.heading.includes('货已入包'),'no false possession heading while the bag is empty');
  assert.ok(!f.action.includes('已在包里'),'no false possession sentence while the bag is empty');
  assert.match(f.action,/重新收下|捡/,'recovery is an actionable choice');
  assert.match(f.action,/安全撤离/,'safe return remains a choice');
  assert.match(f.action,/€10/,'next-day one-day surcharge consequence is still stated');
  assert.match(f.action,/只涨一天/);
  // Fixture (sanctioned): the thrown good has settled at the player's feet; the real
  // collect command re-stows it and the card returns to the carried stage.
  Object.assign(r.items[0],{x:r.p.x+20,y:r.p.y,vx:0,vy:0,lock:0});
  assert.equal(B.command(r,'collect',{itemId:'item0'}),true,'real re-collect after drop');
  assert.ok(r.bag.includes('item0'));
  assert.equal(r.marketShift.stockTaken,true);
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/货已入包/);
  assert.match(f.action,/€10/);
});

test('correction: one remaining market good keeps truthful guidance; day-3 drop keeps the no-next-day fact',()=>{
  // Staffed night: shelf goods then cold goods really stowed; drop only the shelf goods.
  const r=shift(1);r.actors=[];
  Object.assign(r.p,{x:405,y:1110});
  assert.equal(B.command(r,'market-salvage'),true);
  walkTo(r,{x:405,y:990});
  walkTo(r,{x:740,y:850});
  assert.ok(r.bag.includes('item0')&&r.bag.includes('item1'),'both market goods really carried');
  const h=harness(r);h.ui.render();
  let f=focus(h.board());assertSized(f);
  assert.match(f.heading,/货已入包/);
  assert.equal(B.command(r,'drop',{itemId:'item0',x:r.p.x-1,y:r.p.y}),true);
  assert.equal(r.bag.includes('item0'),false);
  assert.ok(r.bag.includes('item1'),'cold goods really remain in the bag');
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.match(f.heading,/货已入包/,'guidance stays truthful with one good still carried');
  assert.match(f.action,/安全撤离/);
  assert.equal(B.command(r,'drop',{itemId:'item1',x:r.p.x-1,y:r.p.y}),true);
  h.ui.render();f=focus(h.board());assertSized(f);
  assert.ok(!f.heading.includes('货已入包'),'nothing carried after both goods are dropped');
  assert.match(f.action,/重新收下|捡/);
  assert.match(f.action,/安全撤离/);
  assert.match(f.action,/€10/,'day 1/2 surcharge fact survives even with an empty bag');
  // Day 3 blackout: free shelf goods taken then dropped; recovery text carries no next-day claim.
  const d=shift(3);d.actors=[];
  Object.assign(d.p,{x:405,y:1110});
  assert.equal(B.command(d,'market-salvage'),true);
  walkTo(d,{x:405,y:990});
  assert.ok(d.bag.includes('item0'));
  const h3=harness(d);h3.ui.render();
  f=focus(h3.board());assertSized(f);
  assert.match(f.heading,/撤离/);
  assert.equal(B.command(d,'drop',{x:d.p.x-1,y:d.p.y}),true);
  assert.equal(d.marketShift.stockTaken,true);
  h3.ui.render();f=focus(h3.board());assertSized(f);
  assert.ok(!f.heading.includes('货已入包'));
  assert.doesNotMatch(f.action,/次日/);
  assert.doesNotMatch(f.action,/€10/);
  assert.match(f.action,/最后一夜/,'day-3 no-next-day fact is kept');
  assert.match(f.action,/安全撤离/);
});
