# Exact source excerpts at dad6b38c54fda94f541764242f61820d8177bd19

## tools/prototype/reopening-ui.js:1-18
1: (function () {
2:   'use strict';
3:   const R=window.Reopening, C=window.City;
4:   const $=id=>document.getElementById(id);
5:   const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
6:   const SAVE_KEY='ab_reopening_v1';
7:   const ui={selected:null,beer:'blond',premium:false,modal:null,returnFocus:null,brewElapsed:0,sound:true,tutorialSeen:false,signature:'',lastFrame:performance.now(),lastSave:0,noticeTimer:null,audio:null,city:C.create(),cityPath:[],cityTarget:null,cityMode:'map',cityPlace:'pub',cityNear:'pub',cityFerry:false,cityZoom:1,cityCamera:'street',hintDismissed:false,cityKeys:new Set(),cityFrame:performance.now(),notebook:false};
8:   let state=R.createGame(seedFromUrl());
9:   let restored=false,saveError=false;
10:   try {
11:     const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
12:     if(saved){const valid=R.restore(saved.game||saved);if(valid){state=valid;ui.city=C.restore(saved.city);restored=state.phase!=='welcome';ui.tutorialSeen=Boolean(saved.tutorialSeen);ui.sound=saved.sound!==false;ui.brewElapsed=state.phase==='brew'&&Number.isFinite(saved.brewElapsed)?Math.max(0,Math.min(6,saved.brewElapsed)):0;}else saveError=true;}
13:   } catch {saveError=true;}
14:   const scene=new PubScene($('pub-canvas'));
15:   const backstage=new BackstageUI({canvas:$('pub-canvas'),getState:()=>state,dispatch,save,isPaused:()=>Boolean(ui.modal),showModal:modal,playBeat:()=>sound('beat')});
16:   const journey=new JourneyUI({canvas:$('pub-canvas'),getState:()=>state,dispatch,isPaused:()=>Boolean(ui.modal),playFeedback:()=>sound('bad'),tick:(seconds,input)=>{
17:     const result=R.act(state,{type:'journeyAction',verb:'tick',value:{seconds,...input}});
18:     if(result.ok)state=result.state;

## tools/prototype/reopening-ui.js:130-145
130:   function pause(reason='歇口气，客人会等你。'){
131:     if(ui.modal)return;
132:     modal('PAUSED · 时间停止','暂时逃避现实。',`<p>${esc(reason)}</p><p>船、酒、客人的耐心都停在这里。<br>房东暂时也不能发明新费用。</p>`,[{label:'继续播放 / 回到街上'},{label:'重新开始这三天',secondary:true,run:()=>confirmRestart()}]);
133:   }
134:   function confirmRestart(){
135:     modal('NEW BEGINNING','重新开始这三天？','<p>当前三天的进度会被新一局替换。你可以继续使用这张相同的顾客安排。</p>',[{label:'保留进度，继续玩'},{label:'重新开始',secondary:true,run:()=>restart(state.seed)}]);
136:   }
137:   function restart(seed){state=R.createGame(seed);ui.selected=null;ui.beer='blond';ui.premium=false;ui.brewElapsed=0;ui.tutorialSeen=false;ui.city=C.create();ui.cityMode='map';ui.cityCamera='street';ui.hintDismissed=false;ui.cityPlace='pub';ui.cityPath=[];ui.cityTarget=null;save();render();window.scrollTo({top:0,behavior:'auto'});}
138:   const inCity=()=>['prep','summary'].includes(state.phase);
139:   const nearBike=()=>Math.hypot(ui.city.x-ui.city.bike.x,ui.city.y-ui.city.bike.y)<=42;
140:   const cityPlace=id=>id==='garden'?R.garden.ENTRY:C.PLACES[id];
141:   function cityView(){return {position:ui.city,path:ui.cityPath,target:ui.cityTarget,zoom:ui.cityZoom,camera:ui.cityCamera,mode:ui.cityMode,place:ui.cityPlace,afterHours:state.phase==='summary',notes:mapNotes(),bouquet:state.life.bouquet,display:state.life.display,garden:R.garden.context(state),flowerCart:ui.flowerCart||R.garden.CART};}
142:   function homeOnFoot(){const fresh=C.create();ui.city={...fresh,visited:ui.city.visited,bike:C.parkBike(ui.city).bike};ui.cityKeys.clear();ui.cityPath=[];ui.cityTarget=null;ui.cityPlace='pub';ui.cartFollowing=false;ui.flowerCart=null;ui.cartPath=[];}
143:
144:   function expeditionInvitation(){
145:     const used=state.prepared.includes('explore');

## tools/prototype/reopening-ui.js:400-442
400:     const lastJourney=state.journeys.history.at(-1);
401:     if(!late&&lastJourney&&p.id==='flowers')$board.innerHTML+=`<p class="promise-note">店主翻到第 ${lastJourney.day} 天的委托单：“${lastJourney.outcome==='abandoned'||lastJourney.outcome==='returned'?'退回的花收好了。来不及就告诉我，下一次仍可以再安排。':lastJourney.outcome==='repurposed'?'Lotte 回话了：你们商量把花改成桌花，记在单子上了。':lastJourney.outcome==='redirected'?'Lotte 说你提前联系、在后台交接，下次我们也能这样安排。':lastJourney.quality<80?'收件人说你说明了包装受损的事，下次多拿一层软垫。':'收件人回过话，花送到了。谢谢你把车也带回来。'}”</p>`;
402:     if(!late&&lastJourney?.kind==='delivery'&&['delivered','late','honest','redirected','repurposed'].includes(lastJourney.outcome)&&p.id==='lotte')$board.innerHTML+='<p class="promise-note">Lotte：“'+(lastJourney.outcome==='repurposed'?'我们一起拆成的桌花还在排练室。':lastJourney.outcome==='redirected'?'上次你提前联系，我在后台收到了花。':'上次送来的花还在窗边。')+'今晚我的黑啤，我们另外约。”</p>';
403:     if(!late&&p.id==='pub'&&state.journeys.debt)$board.innerHTML+=`<p class="risk-note">票务待付 €${state.journeys.debt}，最终按净余额计算。</p><button class="secondary" data-action="journey-debt">支付待付款 · 不花行动</button>`;
404:     if(p.id==='market'&&state.backstage.discovered.includes('market-shortcut'))$board.innerHTML+='<p class="promise-note">卸货门上的告示改成了：请最后离开的非员工关灯。你开的捷径还在。</p>';
405:     $board.innerHTML+=bouquetPanel(p.id)+'<div class="board-bottom"><button class="text-button" data-action="city-map">← 出去逛逛 · M</button></div>';
406:   }
407:   function travelTo(id,point){
408:     if(!inCity()||ui.modal||state.life.arrangement)return;
409:     const place=id&&cityPlace(id);if(id&&!place||id==='garden'&&state.phase!=='prep')return;
410:     ui.cartFollowing=false;
411:     ui.cityMode='map';ui.cityKeys.clear();ui.cityTarget=id;
412:     ui.cityPath=C.route(ui.city,place||point);
413:     if(!ui.cityPath.length){if(place&&Math.hypot(ui.city.x-place.x,ui.city.y-place.y)<60)enterCityPlace(place.id);else{ui.cityTarget=null;notify('这边暂时走不到，换个落脚点。',true);render();}return;}
414:     render();
415:     if(matchMedia('(max-width: 800px)').matches)$('pub-canvas').scrollIntoView({block:'start',behavior:'auto'});
416:   }
417:   function enterCityPlace(id){
418:     if(!inCity()||ui.modal||state.life.arrangement)return;
419:     const nearGarden=state.phase==='prep'&&Math.hypot(ui.city.x-R.garden.ENTRY.x,ui.city.y-R.garden.ENTRY.y)<60;
420:     const place=id?cityPlace(id):nearGarden?R.garden.ENTRY:C.near(ui.city);
421:     if(!place||Math.hypot(ui.city.x-place.x,ui.city.y-place.y)>65){notify('再靠近一点，就能进去了。');return;}
422:     ui.city=C.parkBike(ui.city);ui.cityKeys.clear();ui.cityPath=[];ui.cityTarget=null;ui.cityPlace=place.id;ui.cityMode='place';
423:     if(place.id==='garden'){const source=ui.cartFollowing?'cart':undefined;ui.cartFollowing=false;dispatch({type:'gardenVisit',position:{x:ui.city.x,y:ui.city.y},source});}
424:     else if(!ui.city.visited.includes(place.id))ui.city.visited.push(place.id);
425:     save();render();
426:     if(matchMedia('(max-width: 800px)').matches)$('action-content').scrollIntoView({block:'start',behavior:'auto'});
427:   }
428:   function stepCity(seconds){
429:     if(state.life.arrangement||!ui.cityKeys.size&&!ui.cityPath.length)return;
430:     const wasNearBike=nearBike(),wasNearGarden=Math.hypot(ui.city.x-R.garden.ENTRY.x,ui.city.y-R.garden.ENTRY.y)<45;let position=ui.city,arrived=false;
431:     if(ui.cartFollowing){const r=C.moveAlong({...ui.flowerCart,visited:[],bike:{...R.garden.CART,mounted:false}},ui.cartPath,seconds);ui.flowerCart={x:r.position.x,y:r.position.y};ui.cartPath=r.path;}
432:     if(ui.cityKeys.size){const held=ui.cityKeys;position=C.move(ui.city,Number(held.has('d')||held.has('arrowright'))-Number(held.has('a')||held.has('arrowleft')),Number(held.has('s')||held.has('arrowdown'))-Number(held.has('w')||held.has('arrowup')),seconds);}
433:     else{const followSeconds=ui.cartFollowing&&ui.cartPath.length&&Math.hypot(ui.city.x-ui.flowerCart.x,ui.city.y-ui.flowerCart.y)<55?0:seconds;const result=C.moveAlong(ui.city,ui.cityPath,followSeconds);position=result.position;ui.cityPath=result.path;arrived=result.arrived;}
434:     const wasPushing=Boolean(ui.city.bike.pushing);ui.city=position;
435:     if(wasPushing!==Boolean(ui.city.bike.pushing)){notify(ui.city.bike.pushing?'窄桥 / 渡轮慢一点，推着车一起过去。':'已经过桥，继续骑行。');save();renderCityToolbar();}
436:     const near=C.near(ui.city),nextNear=near?.id||null,onFerry=C.onFerry(ui.city.x,ui.city.y);
437:     if(state.phase==='prep'&&!wasNearGarden&&Math.hypot(ui.city.x-R.garden.ENTRY.x,ui.city.y-R.garden.ENTRY.y)<45){enterCityPlace('garden');return;}
438:     if(near&&!ui.city.visited.includes(near.id)){ui.city.visited.push(near.id);save();}
439:     if(arrived){const target=ui.cityTarget;ui.cityTarget=null;if(target){enterCityPlace(target);return;}save();render();}
440:     else if(nextNear!==ui.cityNear||onFerry!==ui.cityFerry||wasNearBike!==nearBike()){ui.cityNear=nextNear;ui.cityFerry=onFerry;renderCityToolbar();if(!ui.cityPath.length)renderCityBoard('<p class="board-eyebrow">TWEEDE KANS / CITY</p>');}
441:   }
442:   function selectedCustomer(){const waiting=R.customers(state);return waiting.find(c=>c.id===ui.selected)||waiting[0]||null;}

## tools/prototype/flower-network.js:1-42
1: (function(root,factory){
2:   'use strict';
3:   const api=factory();
4:   if(typeof module==='object'&&module.exports)module.exports=api;
5:   if(root)root.FlowerNetwork=api;
6: })(typeof globalThis!=='undefined'?globalThis:this,function(){
7:   'use strict';
8:   const ENTRY=Object.freeze({id:'garden',name:'温室日间侧门',district:'花店后街',x:1510,y:690});
9:   const CART=Object.freeze({x:1310,y:1040});
10:   const fresh=(discovered=[])=>({known:discovered.includes('greenhouse'),source:discovered.includes('greenhouse')?'night':null,introduced:false,visits:[]});
11:   function ask(s){
12:     if(s.phase!=='prep')return {ok:false,message:'Ada 白天才在花店留介绍信。'};
13:     s.garden.known=true;if(s.garden.source===null)s.garden.source='ada';s.garden.introduced=true;
14:     return {ok:true,message:'Ada 在地图上圈出温室侧门，写了张介绍便签。送花时能绕去补包装，材料费免 €2，仍要花 8 秒；不接她的晚间邀请也能去。问路本身不算到访。'};
15:   }
16:   function visit(s,source){
17:     s.garden.known=true;if(s.garden.source===null)s.garden.source=source;
18:     if(!s.garden.visits.includes(s.day))s.garden.visits.push(s.day);
19:     if(!s.backstage.discovered.includes('greenhouse'))s.backstage.discovered.push('greenhouse');
20:   }
21:   const context=s=>({known:s.garden.known||s.backstage.discovered.includes('greenhouse'),introduced:s.garden.introduced,pump:s.backstage.discovered.includes('greenhouse-pump')});
22:   function notes(s){
23:     const g=s.garden,known=context(s).known;if(!known)return [];
24:     const origin={ada:'Ada 画出的侧门路线',cart:'跟着搬花车找到的侧门',self:'散步时自己找到的侧门',night:'夜探时认出的温室'}[g.source]||'夜探时认出的温室';
25:     return [origin+'：白天可免费重访，送花时可改道停靠。',...(g.visits.length?['第 '+g.visits.join('、')+' 天实际进过温室，夜里也认得后门出口。']:[]),...(context(s).pump?['夜里修好的水泵仍在工作：白天送花的温室入口不再减速。']:[])];
26:   }
27:   function valid(s){
28:     const g=s.garden;if(!g||Object.keys(g).sort().join(',')!=='introduced,known,source,visits'||typeof g.known!=='boolean'||typeof g.introduced!=='boolean'||![null,'ada','cart','self','night'].includes(g.source))return false;
29:     if(g.known!==(g.source!==null)||g.introduced&&!g.known||!Array.isArray(g.visits)||g.visits.length>3)return false;
30:     if(!g.visits.every((d,i)=>Number.isInteger(d)&&d>=1&&d<=s.day&&(i===0||d>g.visits[i-1])))return false;
31:     return !g.visits.length||g.known&&s.backstage.discovered.includes('greenhouse');
32:   }
33:   return Object.freeze({ENTRY,CART,fresh,ask,visit,context,notes,valid});
34: });

## tools/prototype/reopening-core.js:294-305
294:     switch (action.type) {
295:       case 'gardenAsk': {
296:         const result=G.ask(state);if(!result.ok)return fail(result.message);say(state,result.message);break;
297:       }
298:       case 'gardenVisit': {
299:         const p=action.position;
300:         if(state.phase!=='prep'||!p||!number(p.x,0,1800)||!number(p.y,0,1120)||Math.hypot(p.x-G.ENTRY.x,p.y-G.ENTRY.y)>60||![undefined,'cart'].includes(action.source))return fail('白天亲自走到温室侧门，才算到访。');
301:         G.visit(state,action.source==='cart'?'cart':'self');
302:         say(state,'你走到温室侧门，认出搬花车留下的车辙。路线已记下：白天可重访，夜里可从温室后门撤离；没有拿走货物或消耗准备次数。');break;
303:       }
304:       case 'storyDay': {
305:         const result=S.talk(state,action.id,action.choice);if(!result.ok)return fail(result.message);say(state,result.message);break;
