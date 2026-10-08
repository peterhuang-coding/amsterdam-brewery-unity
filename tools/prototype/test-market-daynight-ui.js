'use strict';
// D16 SM01 presentation packet: real-module VM harness tests.
// Every test below LOADS AND EXECUTES the real UI modules (reopening-ui for
// the daytime market panel; backstage-ui / backstage-auto for the night
// decision views) against states built through genuine actions and movement.
// There are no source-substring searches and no forged rewards.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const R=require('./reopening-core.js'),B=require('./backstage-core.js'),A=require('./backstage-auto.js');
const City=require('./reopening-city.js');

function act(s,a){
  const before=JSON.stringify(s);
  const r=R.act(s,a);
  assert.equal(JSON.stringify(s),before,'act must not mutate its input');
  assert.ok(r.ok,(r.message||'')+' :: '+JSON.stringify(a));
  assert.ok(R.restore(r.state),'result must stay a valid save after '+a.type);
  return r.state;
}
function reject(s,a){
  const before=JSON.stringify(s);
  const r=R.act(s,a);
  assert.equal(r.ok,false,'action must be rejected: '+JSON.stringify(a));
  assert.equal(r.state,s,'rejection returns the original object');
  assert.equal(JSON.stringify(s),before);
}
const start=(seed=42)=>act(R.createGame(seed),{type:'start'});
const closeNight=s=>act(act(s,{type:'open'}),{type:'close'});
function walkTo(run,to){
  for(let n=0;n<8000&&Math.hypot(to.x-run.p.x,to.y-run.p.y)>6;n++){
    const d=Math.hypot(to.x-run.p.x,to.y-run.p.y);
    B.step(run,{dx:(to.x-run.p.x)/d,dy:(to.y-run.p.y)/d},.025);
  }
  assert.ok(Math.hypot(to.x-run.p.x,to.y-run.p.y)<8,JSON.stringify({p:run.p,to}));
}
function autoIdle(run){
  for(let n=0;n<30000&&run.status==='active'&&!run.auto.event;n++)A.step(run,.05);
}
function autoPick(run,id){
  if(!run.auto)A.enable(run);
  assert.ok(A.choose(run,id),'choice available: '+id);
  autoIdle(run);
  assert.notEqual(run.auto.event,'stuck',JSON.stringify({p:run.p,time:run.time}));
}
function night(s,fn,mode){
  s=act(s,{type:'explore',kit:'hook',mode});
  fn(s.backstage.run);
  return act(s,{type:'returnExplore'});
}

// --- genuinely built shared states ------------------------------------------
// Night 1: real automatic safe trade delivery -> day 2 prep, receipt available.
function safeTradeDay2(){
  let s=closeNight(start());
  s=night(s,run=>{
    autoPick(run,'market');autoPick(run,'mkt-trade');autoPick(run,'exit');
  });
  return act(s,{type:'next'});
}
// Night 1: real manual shelf taking -> day 2 prep, crate price is 10.
function theftDay2(){
  let s=closeNight(start());
  s=night(s,run=>{
    run.actors=[];
    walkTo(run,{x:405,y:990});
    walkTo(run,B.EXIT);B.command(run,'interact');
  },'manual');
  return act(s,{type:'next'});
}
// Plain day 3 prep (night 1 trade history still on the books).
function plainDay3(){
  let s=safeTradeDay2();
  s=closeNight(s);s=act(s,{type:'next'});
  return s;
}

// --- full daytime UI VM harness (executes the real reopening-ui) ------------
const noop=()=>{};
function dayHarness(game,city=City.create()){
  const gradient={addColorStop:noop};
  const ctx=new Proxy({},{get:(o,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>gradient:noop,set:()=>true});
  const mkEl=()=>({textContent:'',hidden:false,disabled:false,innerHTML:'',setAttribute:noop,removeAttribute:noop,addEventListener:noop,removeEventListener:noop,
    classList:{toggle:noop,add:noop,remove:noop},style:{},title:'',focus:noop,scrollIntoView:noop,
    querySelector:()=>null,querySelectorAll:()=>[],dataset:{},remove:noop,appendChild:noop});
  const els=new Map();
  const canvasEl=()=>({...mkEl(),getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640})});
  const listeners={};
  const document={
    addEventListener:(type,cb)=>{(listeners[type]=listeners[type]||[]).push(cb);},
    hidden:false,activeElement:{isConnected:false},body:{classList:{toggle:noop}},
    getElementById:id=>{
      if(id==='pub-canvas'){if(!els.has(id))els.set(id,canvasEl());return els.get(id);}
      if(!els.has(id))els.set(id,mkEl());return els.get(id);
    },
    querySelector:()=>null,querySelectorAll:()=>[]
  };
  let capturedSave=null;
  const localStorage={
    getItem:()=>JSON.stringify({version:1,game,city,sound:true}),
    setItem:(k,v)=>{capturedSave=JSON.parse(v);}
  };
  const rafs=[];let nowValue=1000;
  const sandbox={
    document,matchMedia:()=>({matches:false}),localStorage,
    performance:{now:()=>nowValue},setTimeout:()=>0,clearTimeout:noop,
    setInterval:()=>0,requestAnimationFrame:cb=>rafs.push(cb),
    devicePixelRatio:1,location:{search:''},scrollTo:noop,addEventListener:noop,
    URLSearchParams:class{get(){return null;}},navigator:{},AudioContext:undefined,CSS:{escape:String}
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),sandbox);
  for(const file of ['journey-core.js','backstage-core.js','backstage-auto.js','delivery-orders.js',
    'character-stories.js','flower-network.js','reopening-core.js','reopening-city.js','reopening-scene.js',
    'backstage-scene.js','backstage-ui.js','journey-ui.js','reopening-ui.js'])load(file);
  const board=()=>els.get('action-content').innerHTML;
  const click=dataset=>{
    const button={dataset,disabled:false};
    const event={target:{closest:sel=>sel==='button[data-action]'?button:null}};
    for(const cb of listeners.click)cb(event);
  };
  function goMarket(){
    click({action:'city-travel',place:'market'});
    for(let i=0;i<800;i++){
      nowValue+=100;
      const cb=rafs.shift();
      assert.ok(cb,'frame scheduled');
      cb(nowValue);
      if(/market-crate-card|market-receipt-card/.test(board()))return board();
    }
    return assert.fail('never reached the market');
  }
  return {board,click,goMarket,save:()=>capturedSave,els};
}

// --- night UI VM harness (executes the real backstage-ui) -------------------
function nightHarness(run){
  const gradient={addColorStop:noop};
  const context2d=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:noop});
  const canvas={getContext:()=>context2d,addEventListener:noop,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640}),setAttribute:noop};
  const mkEl=()=>({textContent:'',hidden:false,disabled:false,innerHTML:'',setAttribute:noop,classList:{toggle:noop,add:noop,remove:noop},style:{},title:'',focus:noop,scrollIntoView:noop,querySelector:()=>null,querySelectorAll:()=>[],dataset:{}});
  const els=new Map();
  const document={addEventListener:noop,hidden:false,body:{classList:{toggle:noop}},
    getElementById:id=>{if(!els.has(id))els.set(id,mkEl());return els.get(id);},
    querySelector:()=>null};
  const state={run};
  const window={Backstage:B,BackstageAuto:A,addEventListener:noop};
  const sandbox={window,document,matchMedia:()=>({matches:false})};
  window.window=window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-scene.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-ui.js'),'utf8'),sandbox);
  const ui=new window.BackstageUI({canvas,getState:()=>({phase:'explore',backstage:{run:state.run}}),isPaused:()=>false,save:noop,dispatch:noop,showModal:noop});
  return {ui,board:()=>els.get('action-content').innerHTML};
}
const shift=(day=1)=>B.create(42,day,'hook',[],{marketShift:true});
function tradeExtracted(day){
  const run=shift(day);run.actors=[];Object.assign(run.p,{x:405,y:1110});
  B.command(run,'market-trade');B.command(run,'collect',{itemId:'item2'});B.command(run,'market-deliver');
  walkTo(run,B.EXIT);B.command(run,'interact');
  assert.equal(run.status,'extracted');
  return run;
}

// ============================================================================
// Daytime market panel
// ============================================================================
test('day 1 market panel: €8 crate, €4 saving, wallet/action guards, no receipt',()=>{
  const h=dayHarness(start());
  const html=h.goMarket();
  assert.match(html,/€8/);
  assert.match(html,/少花\s*€4|省\s*€4|节省\s*€4/);
  assert.doesNotMatch(html,/少花\s*€2|省\s*€2|节省\s*€2/);
  assert.ok(!/id="market-receipt-card"/.test(html),'no receipt card on day 1');
  assert.doesNotMatch(html,/item\d|stage\d|undefined/);
  assert.ok(!/data-action="prepare"[^>]*disabled/.test(html),'crate buy enabled with cash and actions');
  // wallet guard
  const broke=structuredClone(start());broke.cash=7;assert.ok(R.restore(broke));
  assert.match(dayHarness(broke).goMarket(),/data-action="prepare"[^>]*disabled/);
  // action guard
  const busy=structuredClone(start());busy.actions=0;assert.ok(R.restore(busy));
  assert.match(dayHarness(busy).goMarket(),/data-action="prepare"[^>]*disabled/);
});

test('day 2 safe trade: real claim click yields 3 q1 blond +1 hop for one action; one-shot; claimed after reload',()=>{
  const g=safeTradeDay2();
  assert.equal(R.marketInfo(g).price,8);
  const h=dayHarness(g);
  const html=h.goMarket();
  assert.match(html,/可兑现/);
  assert.ok(html.includes('data-action="market-errand"'));
  assert.ok(!/data-action="market-errand"[^>]*disabled/.test(html),'errand enabled');
  h.click({action:'market-errand'});
  const save=h.save();
  assert.ok(save,'claim produced a durable save');
  assert.equal(save.game.market.history[0].claimed,true);
  assert.ok(save.game.batches.some(b=>b.id==='d2-market-errand'&&b.cups===3&&b.quality===1&&b.beer==='blond'));
  assert.equal(save.game.hops,g.hops+1);
  assert.equal(save.game.actions,g.actions-1);
  // one-shot: second click changes nothing durable
  const before=JSON.stringify(save.game);
  h.click({action:'market-errand'});
  assert.equal(JSON.stringify(h.save().game),before);
  assert.match(h.els.get('notice').textContent,/已经|重复|已兑现/);
  // reload/re-render reflects the claimed state
  const h2=dayHarness(save.game,save.city);
  const html2=h2.goMarket();
  assert.match(html2,/已兑现|已领取/);
  assert.match(html2,/data-action="market-errand"[^>]*disabled/);
  reject(save.game,{type:'marketErrand'});
});

test('day 2 after real night 1 theft: €10 crate, €2 saving, real reason; no static €4 claim',()=>{
  const g=theftDay2();
  const info=R.marketInfo(g);
  assert.equal(info.price,10);assert.ok(info.priceReason.length>0);
  const h=dayHarness(g);
  const html=h.goMarket();
  assert.match(html,/€10/);
  assert.match(html,/少花\s*€2|省\s*€2|节省\s*€2/);
  assert.doesNotMatch(html,/少花\s*€4|省\s*€4|节省\s*€4/);
  assert.match(html,/货架|冷库/);
  assert.ok(!/id="market-receipt-card"/.test(html));
  assert.ok(!/data-action="prepare"[^>]*disabled/.test(html),'cash 30 affords €10');
  // price guards move with the price
  const canNine=structuredClone(g);canNine.cash=9;assert.ok(R.restore(canNine));
  assert.match(dayHarness(canNine).goMarket(),/data-action="prepare"[^>]*disabled/,'€9 cannot afford the €10 crate');
  const broke=structuredClone(g);broke.cash=7;assert.ok(R.restore(broke));
  assert.match(dayHarness(broke).goMarket(),/data-action="prepare"[^>]*disabled/);
});

test('receipt errand guards in the live panel: 32-batch disabled, action0 disabled, hops15 still grants 3 cups with no hop or cash',()=>{
  const g=safeTradeDay2();
  // full 32-batch capacity
  const full=structuredClone(g);let n=0;
  while(full.batches.length<32)full.batches.push({id:'fill-'+(n++),beer:'blond',cups:1,quality:1,madeDay:1,aged:false});
  assert.ok(R.restore(full));
  assert.equal(R.marketInfo(full).canClaim,false);
  assert.match(R.marketInfo(full).reason,/32/);
  const fullHtml=dayHarness(full).goMarket();
  assert.match(fullHtml,/data-action="market-errand"[^>]*disabled/);
  assert.match(fullHtml,/32/);
  // zero actions
  const busy=structuredClone(g);busy.actions=0;assert.ok(R.restore(busy));
  assert.equal(R.marketInfo(busy).canClaim,false);
  const busyHtml=dayHarness(busy).goMarket();
  assert.match(busyHtml,/data-action="market-errand"[^>]*disabled/);
  assert.match(busyHtml,/行动/);
  // hops already at 15: remains available; real click grants cups only
  const capped=structuredClone(g);capped.hops=15;assert.ok(R.restore(capped));
  assert.equal(R.marketInfo(capped).canClaim,true);
  const hc=dayHarness(capped);
  assert.match(hc.goMarket(),/酒花已满\s*15/);
  hc.click({action:'market-errand'});
  const save=hc.save();
  assert.equal(save.game.hops,15,'no extra hop past 15');
  assert.equal(save.game.cash,capped.cash,'no replacement cash at hop cap');
  assert.ok(save.game.batches.some(b=>b.id==='d2-market-errand'&&b.cups===3));
});

test('day 3 panel: final-night wording and no promise that tonight earns a day-4 errand or price',()=>{
  const html=dayHarness(plainDay3()).goMarket();
  assert.match(html,/第\s*3\s*夜/);
  assert.match(html,/没有第\s*4\s*天/);
  const blocks=[...html.matchAll(/<p class="risk-note">([\s\S]*?)<\/p>/g)].map(m=>m[1]);
  const finalBlock=blocks.find(b=>/第\s*3\s*夜/.test(b)&&/没有第\s*4\s*天/.test(b));
  assert.ok(finalBlock,'a final-night note is present');
  assert.doesNotMatch(finalBlock,/明天|次日/);
});

// ============================================================================
// Manual night decision view
// ============================================================================
test('manual pre-choice on nights 1/2: free commitment, dated €10 consequence, real barrel cost, safe errand rewards are not a payout',()=>{
  for(const day of [1,2]){
    const run=shift(day);run.actors=[];
    const h=nightHarness(run);h.ui.render();
    const html=h.board();
    assert.match(html,/不花钱/,'choosing costs no money');
    assert.match(html,/路线锁定|不能改/,'choice commits the route');
    assert.match(html,new RegExp('次日（第\\s*'+(day+1)+'\\s*天）'));
    assert.match(html,/€10/,'taking stock means next-day 10 price');
    assert.match(html,/3\s*格/,'barrel occupies 3 slots');
    assert.match(html,/4\s*杯/,'delivering consumes the barrel instead of 4 cups');
    assert.match(html,/1\s*次白天行动/,'errand costs one day action');
    assert.match(html,/3\s*杯品质\s*1/,'errand grants 3 quality-1 blond cups');
    assert.match(html,/酒花/);
    assert.match(html,/15/,'hop cap shown');
    assert.match(html,/不发钱|不是发薪|不立即给/,'commitment is not a payout');
  }
});

test('manual night 3 pre-choice: final night, no day 4, both choices still offered',()=>{
  const run=shift(3);run.actors=[];
  const h=nightHarness(run);h.ui.render();
  const html=h.board();
  assert.match(html,/最后一夜/);
  assert.match(html,/没有第\s*4\s*天/);
  assert.match(html,/data-verb="market-salvage"/);
  assert.match(html,/data-verb="market-trade"/);
  const finalBlock=(html.match(/<p class="risk-note">[\s\S]*?<\/p>/)||[])[0]||'';
  assert.ok(finalBlock);
  // Negated no-next-day wording is the correct final-night message.
  assert.match(finalBlock,/不会产生次日涨价/);
  // But no POSITIVE day-four promise: every 次日/明天 mention must be negated.
  for(const m of finalBlock.matchAll(/次日|明天/g)){
    const lead=finalBlock.slice(Math.max(0,m.index-10),m.index);
    assert.match(lead,/[不没无]/,'next-day wording must be negated: '+finalBlock);
  }
  assert.doesNotMatch(finalBlock,/€10/,'no next-day price is promised on the final night');
});

test('manual after-choice trade copy: committed route; delivery consumes the 3-slot barrel, not 4 cups; night 3 warns the receipt cannot pay',()=>{
  const run=shift(1);run.actors=[];Object.assign(run.p,{x:405,y:1110});
  assert.equal(B.command(run,'market-trade'),true);
  assert.equal(B.command(run,'collect',{itemId:'item2'}),true);
  const h=nightHarness(run);h.ui.render();
  let html=h.board();
  assert.match(html,/已选路线/);
  assert.match(html,/帮忙搬货/);
  assert.match(html,/消耗[^]{0,12}3\s*格|3\s*格[^]{0,12}消耗/);
  assert.match(html,/变不回\s*4\s*杯/);
  assert.ok(!/data-verb="market-deliver"[^>]*disabled/.test(html),'deliver is live with the barrel at counter');
  // night 3: same genuine sequence, then deliver
  const r3=shift(3);r3.actors=[];Object.assign(r3.p,{x:405,y:1110});
  B.command(r3,'market-trade');B.command(r3,'collect',{itemId:'item2'});B.command(r3,'market-deliver');
  const h3=nightHarness(r3);h3.ui.render();
  html=h3.board();
  assert.match(html,/已选路线/);
  assert.match(html,/第\s*3\s*夜|没有[^]{0,6}下一天|回执无法兑现/);
});

test('manual receipt on return: nights 1/2 show the dated next-day voucher; night 3 says there is no next day',()=>{
  for(const day of [1,2]){
    const h=nightHarness(tradeExtracted(day));h.ui.render();
    const html=h.board();
    assert.match(html,/只对次日白天作数/);
    assert.match(html,new RegExp('第\\s*'+(day+1)+'\\s*天'));
    assert.match(html,/领不到钱/);
  }
  const h3=nightHarness(tradeExtracted(3));h3.ui.render();
  const html=h3.board();
  assert.match(html,/没有下一夜/);
  assert.match(html,/回执没有可兑现的一天/);
  assert.doesNotMatch(html,/次日/);
});

test('manual salvage return copy: nights 1/2 name the dated next-day €10; night 3 says no next-day price',()=>{
  for(const day of [1,2]){
    const run=shift(day);run.actors=[];
    walkTo(run,{x:405,y:990});
    assert.ok(run.bag.includes('item0'),'shelf stock genuinely taken');
    walkTo(run,B.EXIT);B.command(run,'interact');
    assert.equal(run.status,'extracted');
    const h=nightHarness(run);h.ui.render();
    const html=h.board();
    assert.match(html,/货已实际入包|货已[^]{0,6}入包/);
    assert.match(html,new RegExp('次日（第\\s*'+(day+1)+'\\s*天）'));
    assert.match(html,/€10/);
  }
  const r3=shift(3);r3.actors=[];
  walkTo(r3,{x:405,y:990});
  walkTo(r3,B.EXIT);B.command(r3,'interact');
  assert.equal(r3.status,'extracted');
  const h3=nightHarness(r3);h3.ui.render();
  const html=h3.board();
  assert.match(html,/最后一夜/);
  assert.match(html,/没有第\s*4\s*天/);
  assert.match(html,/没有次日涨价|不会产生次日涨价/);
});

// ============================================================================
// Automatic night decision view
// ============================================================================
test('auto pre-choice view on nights 1/2 explains the real bargain with no internal labels',()=>{
  for(const day of [1,2]){
    const run=shift(day);run.actors=[];A.enable(run);
    autoPick(run,'market');
    assert.equal(run.auto.event,'market');
    const v=A.view(run);
    const salvage=v.choices.find(c=>c.id==='mkt-salvage');
    const trade=v.choices.find(c=>c.id==='mkt-trade');
    assert.ok(salvage&&trade);
    assert.equal(trade.label,'帮忙搬货');
    assert.equal(salvage.label,'直接取库存');
    const blob=[v.title,v.copy,salvage.detail,trade.detail].join('\n');
    assert.match(blob,/表态免费|不花钱/);
    assert.match(blob,new RegExp('次日（第\\s*'+(day+1)+'\\s*天）'));
    assert.match(blob,/€10/);
    assert.match(blob,/3\s*格/);
    assert.match(blob,/4\s*杯/);
    assert.match(blob,/1\s*次白天行动/);
    assert.match(blob,/3\s*杯品质\s*1/);
    assert.match(blob,/酒花/);
    assert.match(blob,/15/);
    assert.match(blob,/不发钱|不立即给钱/);
    assert.doesNotMatch(blob,/item\d|stage\d|schema|undefined/);
  }
});

test('auto night 3 pre-choice and intro: final night, no day 4, no tomorrow promise',()=>{
  const run=shift(3);run.actors=[];A.enable(run);
  autoPick(run,'market');
  const v=A.view(run);
  const blob=[v.title,v.copy,...v.choices.map(c=>c.label+' '+c.detail)].join('\n');
  assert.match(blob,/最后一夜/);
  assert.match(blob,/没有第\s*4\s*天/);
  assert.doesNotMatch(blob,/明天/);
  for(const id of ['mkt-salvage','mkt-trade'])assert.ok(v.choices.some(c=>c.id===id),id+' still offered');
});

test('auto after-choice copy through real steps: night 1 barrel route then voucher wording; night 3 final delivery earns no receipt',()=>{
  const run=shift(1);run.actors=[];A.enable(run);
  autoPick(run,'market');autoPick(run,'mkt-trade');
  // In auto mode choosing mkt-trade carries the barrel to the counter and
  // delivers it without intermediate prompts: the delivery is already complete.
  let copy=A.view(run).copy;
  assert.match(copy,/酒桶已实地交付/);
  assert.match(copy,/回执才作数|安全撤离/);
  assert.equal(run.marketShift.delivered,true,'barrel physically delivered');
  // Continue the actual auto route: the next choice is the safe exit.
  autoPick(run,'exit');
  assert.equal(run.status,'extracted');

  const r3=shift(3);r3.actors=[];A.enable(r3);
  autoPick(r3,'market');autoPick(r3,'mkt-trade');
  copy=A.view(r3).copy;
  assert.match(copy,/酒桶已实地交付/);
  assert.match(copy,/第\s*3\s*夜|没有第\s*4\s*天|回执无法兑现/);
  autoPick(r3,'exit');
  assert.equal(r3.status,'extracted');
});
