'use strict';
// BOOT02 integration: real UI, runtime validation/gzip, grid routes, adapter,
// DistrictScene and all mini scenes. Synthetic geometry is test-only.
const {test} = require('node:test');
const {gzipSync} = require('node:zlib');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const B = require('./backstage-core.js');
const {harness,createHarness,makeFixture,MAP_VERSION,SAVE_KEY} = require('./district-ui-test-fixture.cjs');
function act(s,a){const r=R.act(s,a);assert.ok(r.ok,r.message+' '+JSON.stringify(a));assert.ok(R.restore(r.state));return r.state;}
const start=()=>act(R.createGame(42),{type:'start'});
const night=()=>act(start(),{type:'open'});
const summary=()=>act(night(),{type:'close'});
function cityAt(f,place,bikePlace=place){const a=f.anchors[place],b=f.anchors[bikePlace];return {map:MAP_VERSION,districtId:a.districtId,x:a.x,y:a.y,visited:['pub'],bike:{districtId:b.districtId,x:b.x,y:b.y,mounted:false,pushing:false}};}
function envelope(game,city,extra={}){return {version:1,game,city,sound:false,...extra};}
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function until(h,predicate,limit=2000){for(let i=0;i<limit;i++){if(predicate())return;await h.frames(1);}assert.fail('condition not reached: '+JSON.stringify(h.diagnostics()));}
function wireResponse(f,key){return new Response(f.assets.get(key),{status:200});}

test('asynchronous startup restores the saved district without ever loading pub and independently preserves remote bike/economy',async()=>{
  const f=makeFixture(),game=act(start(),{type:'prepare',kind:'coffee'});
  const h=await harness(envelope(game,cityAt(f,'lab','pub')),{fixture:f});
  assert.equal(h.diagnostics().available,true);
  assert.equal(h.diagnostics().city.districtId,'science');
  assert.equal(h.diagnostics().city.bike.districtId,'jordaan');
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics().game)),game);
  assert.deepEqual(h.requests.map(r=>r.key),['manifest.json','overview.json.gz','districts/science.json.gz']);
  assert.ok(h.sandbox.DistrictCity.walkable(h.diagnostics().city.x,h.diagnostics().city.y));
  assert.equal(h.sandbox.DistrictCity.nearBike(h.diagnostics().city),false);
});

test('boot loading has visible recovery controls and gates every gameplay clock without fetch-driven elapsed time',async()=>{
  const builders=[night,()=>act(start(),{type:'prepare',kind:'brew',beer:'blond'}),()=>act(start(),{type:'prepare',kind:'surf'}),
    ()=>act(summary(),{type:'explore',kit:'hook',mode:'manual'}),()=>act(start(),{type:'journeyStart',kind:'delivery'})];
  for(const build of builders){
    const game=build(),f=makeFixture(),blocked=gate();
    const h=createHarness(envelope(game,cityAt(f,'pub'),{brewElapsed:2}),{fixture:f,overrides:new Map([['manifest.json',()=>blocked.promise]])});
    assert.equal(h.diagnostics().available,false,game.phase);
    assert.equal(h.diagnostics().loading,true,game.phase);
    assert.match(h.board(),/加载|准备.*地图/);
    assert.match(h.board(),/data-action="map-cancel"/);
    const before=JSON.stringify(h.diagnostics().game);
    await h.frames(12);for(let i=0;i<12;i++)await h.tick();
    h.rawClick({action:'open'});
    assert.equal(JSON.stringify(h.diagnostics().game),before,game.phase+' stopped while loading');
    blocked.resolve(wireResponse(f,'manifest.json'));await h.ready();
    await h.frames(5);await h.tick();
    assert.equal(JSON.stringify(h.diagnostics().game),before,game.phase+' restored pause survives fetch');
    assert.equal(h.overlay().hidden,false,'restored '+game.phase+' paused');h.close();
  }
});

test('checksum failure is visible; retry fetches genuine bytes and never replays a core action',async()=>{
  const f=makeFixture(),game=start();
  // Keep the exact raw byte length, but change content: rejection must reach
  // SHA validation rather than being explained by a truncated response.
  const corrupted=Buffer.from(JSON.stringify(f.byId.jordaan).replace('Jordaan','Jordaaq'));
  const overrides=new Map([['districts/jordaan.json.gz',()=>new Response(gzipSync(corrupted))]]);
  const h=await harness(envelope(game,cityAt(f,'pub')),{fixture:f,overrides});
  assert.equal(h.diagnostics().available,false);
  assert.match(h.diagnostics().error,/sha256|checksum/i);
  assert.match(h.board(),/重试/);assert.match(h.board(),/data-action="map-retry"/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics().game)),game);
  overrides.clear();await h.click({action:'map-retry'});
  assert.equal(h.diagnostics().available,true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics().game)),game);
  assert.equal(h.requests.filter(r=>r.key.endsWith('jordaan.json.gz')).length,2);
});

test('cancelled startup rejects late bytes and explicit retry recovers',async()=>{
  const f=makeFixture(),blocked=gate(),overrides=new Map([['manifest.json',()=>blocked.promise]]);
  const h=createHarness(null,{fixture:f,overrides});
  h.rawClick({action:'map-cancel'});
  blocked.resolve(wireResponse(f,'manifest.json'));await h.ready();
  assert.equal(h.diagnostics().available,false);
  assert.equal(h.diagnostics().city,null);
  overrides.clear();await h.click({action:'map-retry'});
  assert.equal(h.diagnostics().available,true);
  assert.equal(h.diagnostics().game.phase,'welcome');
});

test('player and flower-cart routes run concurrently; garden actions receive current map identity',async()=>{
  const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'flowers')),{fixture:f});
  await h.travel('flowers');await h.click({action:'garden-ask'});
  h.rawClick({action:'garden-follow'});
  assert.equal(h.diagnostics().routePending,true,'player has its own request');
  assert.equal(h.diagnostics().cartRoutePending,true,'cart has a separate live request');
  await h.ready();await until(h,()=>h.diagnostics().game.garden.visits.includes(1)||h.board().includes('<h2>温室'));
  assert.equal(h.diagnostics().city.districtId,'depijp');
  assert.equal(h.diagnostics().game.garden.visits.includes(1),true,'real core accepted map/district identity');
  assert.equal(h.diagnostics().game.actions,2,'visit is free');
  assert.equal(h.diagnostics().game.cash,start().cash,'no artificial reward');
});

test('a newer player route and manual movement cancel obsolete local intents; water never becomes an arrival',async()=>{
  const h=await harness(envelope(start(),null));
  h.rawClick({action:'city-travel',place:'lotte'});h.rawClick({action:'city-travel',place:'pub'});await h.ready();
  await h.frames(20);assert.match(h.board(),/<h2>Tweede Kans<\/h2>/);
  await h.click({action:'city-map'});h.rawClick({action:'city-travel',place:'lotte'});h.key('ArrowLeft');await h.ready();
  assert.equal(h.diagnostics().routePending,false);
  assert.equal(h.diagnostics().city.transit,undefined);
  assert.ok(h.sandbox.DistrictCity.walkable(h.diagnostics().city.x,h.diagnostics().city.y));
  const result=await h.sandbox.DistrictCity.routeAsync(h.diagnostics().city,{x:82.5,y:10.5});
  assert.equal(result.length,0,'unreachable water has no route');
});

test('F3 routes to its real bank, requires boarding, stops while paused, and refresh/cancel returns to departure',async()=>{
  const f=makeFixture(),departure=cityAt(f,'ferrySouth','pub');departure.x-=30;
  const h=await harness(envelope(start(),departure),{fixture:f});
  await h.click({action:'city-travel',place:'noord'});
  assert.equal(h.diagnostics().city.transit,undefined,'proposal alone never boards');
  await h.clickModal(0);await until(h,()=>!h.overlay().hidden);
  assert.match(h.dialogBody(),/F3|渡轮|登船|上船/);
  assert.equal(h.diagnostics().city.districtId,'station');
  assert.ok(Math.hypot(h.diagnostics().city.x-f.anchors.ferrySouth.x,h.diagnostics().city.y-f.anchors.ferrySouth.y)<=4);
  assert.equal(h.diagnostics().city.transit,undefined,'bank arrival still requires explicit boarding');
  await h.clickModal(0);assert.equal(h.diagnostics().city.transit.mode,'ferry');
  await h.frames(2);h.key('p');const elapsed=h.diagnostics().city.transit.elapsed;
  await h.frames(10);await h.tick();assert.equal(h.diagnostics().city.transit.elapsed,elapsed);
  const refreshed=await harness(null,{fixture:f,storage:new Map(h.storage)});
  assert.equal(refreshed.diagnostics().city.districtId,'station');
  assert.equal(refreshed.diagnostics().city.transit,undefined);
  assert.equal(refreshed.diagnostics().city.x,departure.x,'refresh restores original departure, before bank approach');
  assert.equal(refreshed.diagnostics().city.bike.districtId,'jordaan');
  await h.clickModal(0);await h.click({action:'travel-cancel'});
  assert.equal(h.diagnostics().city.districtId,'station');assert.equal(h.diagnostics().city.transit,undefined);
});

test('F3 destination load cancellation ignores stale completion and preserves a remote parked bicycle',async()=>{
  const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'ferrySouth','pub')),{fixture:f});
  const blocked=gate();h.overrides.set('districts/noord.json.gz',()=>blocked.promise);
  await h.click({action:'city-travel',place:'noord'});await h.clickModal(0);
  await until(h,()=>!h.overlay().hidden);await h.clickModal(0);
  await until(h,()=>h.diagnostics().loading);
  h.rawClick({action:'travel-cancel'});blocked.resolve(wireResponse(f,'districts/noord.json.gz'));await h.ready();
  assert.equal(h.diagnostics().city.districtId,'station');assert.equal(h.diagnostics().city.transit,undefined);
  assert.equal(h.diagnostics().city.bike.districtId,'jordaan');
  assert.equal(h.diagnostics().available,true);
});

test('return-home persists exactly one economic action across load failure, retry and refresh',async()=>{
  const f=makeFixture();let game=act(summary(),{type:'explore',kit:'hook',mode:'manual'});
  // Physically collect a real bottle and extract, so reward duplication would
  // visibly duplicate a two-cup inventory batch as well as the trip journal.
  const run=game.backstage.run;
  const walk=to=>{for(let n=0;n<8000&&Math.hypot(to.x-run.p.x,to.y-run.p.y)>6;n++){const d=Math.hypot(to.x-run.p.x,to.y-run.p.y);B.step(run,{dx:(to.x-run.p.x)/d,dy:(to.y-run.p.y)/d},.025);}};
  walk({x:405,y:990});assert.ok(run.bag.includes('item0'));walk(B.EXIT);
  assert.equal(B.command(run,'interact'),true);assert.equal(B.rewards(run).cups,2);
  assert.ok(R.restore(game));
  const expected=act(game,{type:'returnExplore'});
  const h=await harness(envelope(game,cityAt(f,'flowers','lab')),{fixture:f});
  await h.clickModal(0);h.overrides.set('districts/jordaan.json.gz',()=>new Response('unavailable',{status:503}));
  await h.click({action:'exp-command',verb:'return'});
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics().game)),expected);
  assert.ok(h.save().mapTransition.pendingReturn,'return intent durable before load');
  assert.equal(h.diagnostics().available,false);
  await h.click({action:'exp-command',verb:'return'});
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics().game)),expected,'second click never rewards again');
  const refreshed=await harness(null,{fixture:f,storage:new Map(h.storage)});
  assert.equal(refreshed.diagnostics().city.districtId,'jordaan');
  assert.equal(refreshed.diagnostics().city.bike.districtId,'science');
  assert.equal(refreshed.save().mapTransition.pendingReturn,null);
  assert.deepEqual(JSON.parse(JSON.stringify(refreshed.diagnostics().game)),expected);
  h.overrides.clear();await h.click({action:'map-retry'});
  assert.deepEqual(JSON.parse(JSON.stringify(h.diagnostics().game)),expected);
  assert.equal(h.save().mapTransition.pendingReturn,null);
});

test('390px DPR shared canvas restores logical transforms for pub, night, brew, forage, backstage and journey',async()=>{
  const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'pub')),{fixture:f,width:390,height:360,dpr:2,border:2,left:9,top:7});
  await h.frames(1);let d=h.diagnostics();
  assert.equal(h.canvas.width,780);assert.equal(h.canvas.height,720);
  assert.ok(d.scene.shapes>0,'real DistrictScene painted synthetic shapes');
  assert.ok(d.scene.liveCanvases<=2);
  const builds=d.scene.staticBuilds;await h.frames(3);assert.equal(h.diagnostics().scene.staticBuilds,builds,'same geometry identity reuses cache');
  h.key('m');await h.frames(1);assert.equal(h.diagnostics().mapMode,'overview');
  h.key('m');await h.frames(1);assert.equal(h.diagnostics().mapMode,'local');
  await h.travel('pub');await h.frames(1);
  assert.equal(h.canvas.width,1650);assert.equal(h.canvas.height,960);
  assert.deepEqual(h.contexts[0].getTransform(),{a:1.5,b:0,c:0,d:1.5,e:0,f:0});
  await h.click({action:'city-map'});await h.frames(1);assert.equal(h.canvas.width,780);
  const games=[night(),act(start(),{type:'prepare',kind:'brew',beer:'blond'}),act(start(),{type:'prepare',kind:'surf'}),
    act(summary(),{type:'explore',kit:'hook',mode:'manual'}),act(start(),{type:'journeyStart',kind:'delivery'})];
  for(const game of games){const q=await harness(envelope(game,cityAt(f,'pub')),{fixture:f,width:390,height:360,dpr:2});await q.frames(2);
    assert.equal(q.canvas.width,1650,game.phase);assert.equal(q.canvas.height,960,game.phase);
    assert.deepEqual(q.contexts[0].getTransform(),{a:1.5,b:0,c:0,d:1.5,e:0,f:0},game.phase);}
});

test('cancelling only a destination download then retrying completes the same F3 leg once',async()=>{
  const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'ferrySouth')),{fixture:f});
  await h.click({action:'city-bike'});
  const blocked=gate();h.overrides.set('districts/noord.json.gz',()=>blocked.promise);
  await h.click({action:'city-travel',place:'noord'});await h.clickModal(0);
  await until(h,()=>!h.overlay().hidden);await h.clickModal(0);
  await until(h,()=>h.diagnostics().loading);
  h.rawClick({action:'map-cancel'});blocked.resolve(wireResponse(f,'districts/noord.json.gz'));await h.ready();
  assert.equal(h.diagnostics().available,false);
  assert.equal(h.diagnostics().city.districtId,'station');
  assert.equal(h.diagnostics().city.transit.mode,'ferry');
  h.overrides.clear();await h.click({action:'map-retry'});
  await until(h,()=>h.diagnostics().travel===null);
  await h.ready();await h.frames(5);
  assert.equal(h.diagnostics().city.districtId,'noord');
  assert.equal(h.diagnostics().city.bike.districtId,'noord','mounted bike is carried by transfer');
  assert.equal(h.diagnostics().city.transit,undefined);
  assert.equal(h.save().mapTransition.travelDeparture,null);
  assert.deepEqual(h.diagnostics().game,start(),'map travel never spends resources');
});

test('day change from a remote district persists the new day before failed return loading and refresh does not skip another day',async()=>{
  const f=makeFixture(),game=summary(),h=await harness(envelope(game,cityAt(f,'lab','market')),{fixture:f});
  h.overrides.set('districts/jordaan.json.gz',()=>new Response('unavailable',{status:503}));
  await h.click({action:'next'});
  const expected=act(game,{type:'next'});
  assert.deepEqual(h.diagnostics().game,expected);
  assert.equal(h.save().game.day,2);assert.ok(h.save().mapTransition.pendingReturn);
  await h.frames(10);await h.tick(1000);assert.deepEqual(h.diagnostics().game,expected);
  const restored=await harness(null,{fixture:f,storage:new Map(h.storage)});
  assert.equal(restored.diagnostics().city.districtId,'jordaan');
  assert.equal(restored.diagnostics().city.bike.districtId,'depijp');
  assert.deepEqual(restored.diagnostics().game,expected);
});

test('DistrictScene hit testing and world clicks use the 390px bordered CSS content box independently of DPR',async()=>{
  const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'pub')),{fixture:f,width:390,height:360,dpr:2,border:3,left:13,top:19});
  await h.frames(1);
  const world={x:40.5,y:20.5},t=h.diagnostics().scene.transform;
  const client={clientX:13+3+world.x*t.scale+t.tx,clientY:19+3+world.y*t.scale+t.ty};
  for(const cb of h.canvasListeners.click)cb(client);
  await h.ready();await h.frames(20);
  assert.ok(Math.hypot(h.diagnostics().city.x-world.x,h.diagnostics().city.y-world.y)<2,'local clicked target uses real screenToWorld');
  assert.ok(h.sandbox.DistrictCity.walkable(h.diagnostics().city.x,h.diagnostics().city.y));
  const beforeWater=h.diagnostics().city,wt=h.diagnostics().scene.transform;
  for(const cb of h.canvasListeners.click)cb({clientX:16+82.5*wt.scale+wt.tx,clientY:22+10.5*wt.scale+wt.ty});
  await h.ready();await h.frames(20);
  assert.equal(h.diagnostics().city.x,beforeWater.x);assert.equal(h.diagnostics().city.y,beforeWater.y);
  assert.match(h.els.get('notice').textContent,/走不到|路线|无法/,'empty water route reports failure');
  const p=f.anchors.lotte,tt=h.diagnostics().scene.transform;
  for(const cb of h.canvasListeners.click)cb({clientX:16+p.x*tt.scale+tt.tx,clientY:22+p.y*tt.scale+tt.ty});
  await h.ready();await until(h,()=>h.board().includes('<h2>Lotte 的桥</h2>'));
  assert.equal(h.diagnostics().city.districtId,'jordaan');
  assert.equal(h.canvas.style.width,undefined,'renderer never changes CSS width');
  assert.equal(h.canvas.style.height,undefined,'renderer never changes CSS height');
  assert.equal(h.offscreens.length,1,'single reusable static geography canvas');
});

test('visibility pause freezes local routes and every active mini-scene clock until explicit resume',async()=>{
  const f=makeFixture();
  const builders=[()=>act(start(),{type:'prepare',kind:'brew',beer:'blond'}),night,()=>act(start(),{type:'prepare',kind:'surf'}),
    ()=>act(summary(),{type:'explore',kit:'hook',mode:'manual'}),()=>act(start(),{type:'journeyStart',kind:'delivery'})];
  for(const build of builders){
    const game=build(),h=await harness(envelope(game,cityAt(f,'pub'),{brewElapsed:2}),{fixture:f});
    await h.clickModal(0);
    h.document.hidden=true;h.emit('visibilitychange');
    const before=JSON.stringify(h.diagnostics().game),elapsed=h.save().brewElapsed;
    for(let i=0;i<10;i++){await h.frames(1);await h.tick(1000);}
    h.document.hidden=false;h.emit('visibilitychange');
    for(let i=0;i<8;i++){await h.frames(1);await h.tick(1000);}
    assert.equal(JSON.stringify(h.diagnostics().game),before,game.phase+' remains paused after visibility returns');
    assert.equal(h.save().brewElapsed,elapsed,'brew timer preserved');
    assert.equal(h.diagnostics().paused,true);h.close();
  }
  const h=await harness(envelope(start(),cityAt(f,'pub')),{fixture:f});
  await h.click({action:'city-travel',place:'lotte'});await h.frames(2);
  h.document.hidden=true;h.emit('visibilitychange');const before=JSON.stringify(h.diagnostics().city);
  await h.frames(20);h.document.hidden=false;h.emit('visibilitychange');await h.frames(10);
  assert.equal(JSON.stringify(h.diagnostics().city),before);
  await h.clickModal(0);await h.frames(2);assert.notEqual(JSON.stringify(h.diagnostics().city),before);
});

test('malformed economy save starts fresh through actual district loading',async()=>{
  const h=await harness({version:1,game:{version:1,phase:'night',cash:999},city:{map:MAP_VERSION,districtId:'science'}});
  assert.equal(h.diagnostics().game.phase,'welcome');assert.equal(h.diagnostics().game.cash,R.createGame(42).cash);
  assert.equal(h.diagnostics().city.districtId,'jordaan');assert.equal(h.requests.filter(r=>r.key.startsWith('districts/')).length,1);
});

test('natural periodic night close persists its rent and receipt once before asynchronous return-home',async()=>{
  let game=night();
  while(game.night.elapsed<game.night.duration-1){
    game=game.night.event?.status==='pending'?act(game,{type:'event',choice:'refuse'}):act(game,{type:'tick',seconds:1});
  }
  const f=makeFixture(),h=await harness(envelope(game,cityAt(f,'lab','flowers')),{fixture:f});
  const expected=act(game,{type:'tick',seconds:1});assert.equal(expected.phase,'summary');
  await h.clickModal(0);h.overrides.set('districts/jordaan.json.gz',()=>new Response('unavailable',{status:503}));
  await h.tick(1000);await h.ready();
  assert.deepEqual(h.diagnostics().game,expected);
  assert.ok(h.save().mapTransition.pendingReturn);
  for(let i=0;i<10;i++)await h.tick(1000);
  assert.equal(h.diagnostics().game.reports.length,1,'periodic failure never charges rent twice');
  h.overrides.clear();await h.click({action:'map-retry'});
  assert.equal(h.diagnostics().city.districtId,'jordaan');
  assert.equal(h.diagnostics().city.bike.districtId,'depijp');
  assert.deepEqual(h.diagnostics().game,expected);
});

test('journey return loads flowers asynchronously and refresh cannot duplicate its history or action cost',async()=>{
  let game=act(start(),{type:'journeyStart',kind:'delivery'});
  game=act(game,{type:'journeyAction',verb:'abandon'});
  while(game.journeys.run.stage!=='receipt')game=act(game,{type:'journeyAction',verb:'tick',value:{seconds:.1}});
  const expected=act(game,{type:'journeyReturn'}),f=makeFixture();
  const h=await harness(envelope(game,cityAt(f,'lab','pub')),{fixture:f});await h.clickModal(0);
  h.overrides.set('districts/depijp.json.gz',()=>new Response('unavailable',{status:503}));
  await h.click({action:'journey-return'});
  assert.deepEqual(h.diagnostics().game,expected);assert.equal(h.save().mapTransition.pendingReturn.place,'flowers');
  const refreshed=await harness(null,{fixture:f,storage:new Map(h.storage)});
  assert.equal(refreshed.diagnostics().city.districtId,'depijp');assert.equal(refreshed.diagnostics().city.bike.districtId,'jordaan');
  assert.deepEqual(refreshed.diagnostics().game,expected);assert.equal(refreshed.diagnostics().game.journeys.history.length,1);
  await refreshed.click({action:'journey-return'});assert.deepEqual(refreshed.diagnostics().game,expected);
});

test('explicit new game resets economy and both actor/bike through retryable pub loading',async()=>{
  const f=makeFixture(),game=act(start(),{type:'prepare',kind:'coffee'});
  const h=await harness(envelope(game,cityAt(f,'lab','flowers')),{fixture:f});
  h.overrides.set('districts/jordaan.json.gz',()=>new Response('unavailable',{status:503}));
  h.key('p');await h.clickModal(1);await h.clickModal(1);
  assert.equal(h.diagnostics().game.phase,'welcome');assert.equal(h.diagnostics().game.cash,R.createGame(42).cash);
  assert.equal(h.diagnostics().available,false);
  h.overrides.clear();await h.click({action:'map-retry'});
  assert.equal(h.diagnostics().city.districtId,'jordaan');assert.equal(h.diagnostics().city.bike.districtId,'jordaan');
  assert.deepEqual(h.diagnostics().game,R.createGame(42));
});

test('local zoom is discoverable and changes the real district transform while overview remains a distinct control',async()=>{
  const h=await harness(envelope(start(),null));await h.frames(1);
  assert.match(h.toolbar(),/data-action="city-zoom"/,'zoom belongs to the local view it changes');
  const before=h.diagnostics().scene.transform.scale;
  await h.click({action:'city-zoom'});await h.frames(1);
  assert.ok(h.diagnostics().scene.transform.scale>before,'real local camera scale increases');
  await h.click({action:'city-overview'});await h.frames(1);
  assert.equal(h.diagnostics().mapMode,'overview');
  assert.doesNotMatch(h.toolbar(),/data-action="city-zoom"/,'overview fits all districts');
});

test('clicking the coincident Noord/F3 overview marker opens the declared journey before moving or loading',async()=>{
  const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'pub')),{fixture:f});
  await h.click({action:'city-overview'});await h.frames(1);
  const marker=f.overview.markers.find(m=>m.id==='ferryNorth'),venue=h.sandbox.DistrictCity.PLACES.noord;
  assert.equal(marker.x,venue.x,'the raw bank and canonical venue share the overview position');
  assert.equal(marker.y,venue.y);
  const before=h.diagnostics().city,tr=h.diagnostics().scene.transform,requestCount=h.requests.length;
  h.contexts[0].marks.length=0;await h.frames(1);
  const labels=h.contexts[0].marks.filter(op=>op[0]==='fillText').map(op=>op[1]);
  assert.equal(labels.filter(text=>text==='北岸码头').length,1,'one canonical venue label is drawn');
  assert.ok(!labels.some(text=>/^ferry\s*north$/i.test(text)),'the same bank has no duplicate raw anchor label');
  const builds=h.diagnostics().scene.staticBuilds;
  await h.frames(100);
  assert.equal(h.diagnostics().scene.staticBuilds,builds,'canonical view metadata preserves the static geometry cache');
  for(const cb of h.canvasListeners.click||[])cb({clientX:marker.x*tr.scale+tr.tx,clientY:marker.y*tr.scale+tr.ty});
  await h.ready();await h.frames(4);
  const after=h.diagnostics();
  assert.equal(after.travel?.target,'noord','the visible Noord marker is actionable');
  assert.equal(after.travel.stage,'confirm');
  assert.deepEqual(after.travel.legs,[{from:'jordaan',to:'station',mode:'street'},{from:'station',to:'noord',mode:'ferry',id:'F3'}]);
  assert.equal(h.overlay().hidden,false);
  assert.deepEqual(after.city,before,'confirmation precedes every movement and transfer');
  assert.equal(h.requests.length,requestCount,'confirmation precedes destination loading');
});

test('all ten overview anchors invoke their existing venue or declared-route action',async()=>{
  const cases=[['pub','pub','jordaan'],['lotte','lotte','jordaan'],['market','market','depijp'],['coffee','coffee','depijp'],
    ['flowers','flowers','depijp'],['lab','lab','science'],['ferryNorth','noord','noord'],['ferrySouth',null,'station'],
    ['garden','garden','depijp'],['flowerCart',null,'depijp']];
  for(const [id,target,to] of cases){
    const f=makeFixture(),h=await harness(envelope(start(),cityAt(f,'pub')),{fixture:f});
    await h.click({action:'city-overview'});await h.frames(1);
    const marker=f.overview.markers.find(m=>m.id===id),before=h.diagnostics().city,tr=h.diagnostics().scene.transform,requestCount=h.requests.length;
    for(const cb of h.canvasListeners.click||[])cb({clientX:marker.x*tr.scale+tr.tx,clientY:marker.y*tr.scale+tr.ty});
    await h.ready();await h.frames(4);
    const after=h.diagnostics();
    if(to==='jordaan'){
      if(id==='pub')assert.match(h.board(),/data-action="brew"/,'the pub marker opens its venue');
      else assert.equal(after.routeTarget,'lotte','the Lotte marker starts its local route');
      assert.equal(h.requests.length,requestCount,'local marker actions retain the active district');
      h.close();continue;
    }
    assert.equal(after.travel?.stage,'confirm',id+' is actionable outside its district');
    assert.equal(after.travel.target,target,id);
    if(target===null)assert.equal(after.travel.point.id,id,'route retains the selected real anchor');
    assert.equal(after.travel.legs[0].from,'jordaan');assert.equal(after.travel.legs.at(-1).to,to);
    for(const leg of after.travel.legs)assert.ok(f.manifest.travelLinks.some(link=>link.mode===leg.mode&&link.id===leg.id&&
      (link.from===leg.from&&link.to===leg.to||link.to===leg.from&&link.from===leg.to)),id+' uses only declared links');
    assert.deepEqual(after.city,before,id+' cannot move before confirmation');
    assert.equal(h.requests.length,requestCount,id+' cannot load a destination before confirmation');
    h.close();
  }
});

test('the nearby garden stays on the map after closing time instead of entering an invalid venue',async()=>{
  const f=makeFixture(),h=await harness(envelope(summary(),cityAt(f,'garden')),{fixture:f});
  const before=h.diagnostics();
  assert.doesNotThrow(()=>h.key('e'),'nighttime E cannot enter an unsupported garden venue');
  await h.frames(2);
  assert.deepEqual(h.diagnostics().game,before.game);
  assert.deepEqual(h.diagnostics().city,before.city);
  assert.equal(h.diagnostics().scene.transform.mode,'district');
  assert.match(h.els.get('notice').textContent,/白天/,'the closed garden explains when it is available');
});

test('hiding the page during an unresolved local route keeps movement paused after route completion and visibility return',async()=>{
  const h=await harness(envelope(start(),null));
  h.rawClick({action:'city-travel',place:'lotte'});
  assert.equal(h.diagnostics().routePending,true);
  h.document.hidden=true;h.emit('visibilitychange');await h.ready();
  const before=h.diagnostics().city;
  h.document.hidden=false;h.emit('visibilitychange');await h.frames(5);
  assert.equal(h.diagnostics().city.x,before.x,'in-flight route cannot resume behind visibility pause');
  assert.equal(h.diagnostics().city.y,before.y);
  assert.equal(h.diagnostics().paused,true);
});

test('non-pub venue backgrounds stay owned by the real DistrictScene instead of invoking legacy city geometry',async()=>{
  const h=await harness(envelope(start(),null));
  let legacyCalls=0;const old=h.sandbox.PubScene.prototype.drawCity;
  h.sandbox.PubScene.prototype.drawCity=function(...args){legacyCalls++;return old.apply(this,args);};
  await h.travel('market');await h.frames(2);
  assert.match(h.board(),/<h2>超市后门<\/h2>|market-crate-card/);
  assert.equal(h.diagnostics().scene.transform.mode,'district');
  assert.ok(h.diagnostics().scene.shapes>0);
  assert.equal(legacyCalls,0,'legacy renderer remains instrumented, but is never the active venue background');
  await h.click({action:'city-map'});await h.frames(2);assert.equal(legacyCalls,0);
});

test('one 390px canvas survives a genuine map/pub/brew/night/backstage/journey/return lifecycle without accumulated scaling',async()=>{
  const h=await harness(envelope(start(),null),{width:390,height:360,dpr:2});
  async function canvasIs(mode){await h.frames(2);const map=mode==='map';assert.equal(h.canvas.width,map?780:1650,mode);assert.equal(h.canvas.height,map?720:960,mode);const scale=map?2:1.5;assert.deepEqual(h.contexts[0].getTransform(),{a:scale,b:0,c:0,d:scale,e:0,f:0},mode);}
  await canvasIs('map');await h.travel('pub');await canvasIs('pub');
  await h.click({action:'brew',beer:'blond'});assert.equal(h.diagnostics().game.phase,'brew');await canvasIs('brew');
  for(let i=0;i<3;i++)await h.click({action:'brew-hit'});
  await h.click({action:'city-map'});await canvasIs('map');await h.travel('pub');
  await h.click({action:'open'});await h.clickModal(1);assert.equal(h.diagnostics().game.phase,'night');await canvasIs('night');
  await h.click({action:'close-night'});await h.clickModal(1);await canvasIs('map');
  await h.click({action:'expedition-launch'});await h.clickModal(0);assert.equal(h.diagnostics().game.phase,'explore');await canvasIs('backstage');
  await h.click({action:'exp-command',verb:'bail'});await h.clickModal(1);await h.click({action:'exp-command',verb:'return'});assert.equal(h.diagnostics().game.phase,'summary');await canvasIs('pub');
  await h.click({action:'next'});await canvasIs('map');
  await h.click({action:'city-bike'});await h.travel('flowers');await canvasIs('map');
  await h.click({action:'journey-start',kind:'delivery'});assert.equal(h.diagnostics().game.phase,'journey');await canvasIs('journey');
  await h.click({action:'journey',verb:'abandon'});await until(h,()=>h.diagnostics().game.journeys.run.stage==='receipt');
  await h.click({action:'journey-return'});await canvasIs('map');
  assert.equal(h.diagnostics().city.districtId,'depijp');assert.equal(h.diagnostics().game.phase,'prep');
  assert.ok(h.diagnostics().scene.liveCanvases<=2);assert.equal(h.offscreens.length,1);
});
