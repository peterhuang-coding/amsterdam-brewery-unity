'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./reopening-core'),B=require('./backstage-core');
function act(s,a){const before=structuredClone(s),r=R.act(s,a);assert.equal(r.ok,true,r.message);assert.deepEqual(s,before);assert.ok(R.restore(r.state),'restore '+a.type);return r.state;}
function reject(s,a){const before=structuredClone(s),r=R.act(s,a);assert.equal(r.ok,false);assert.deepEqual(s,before);return s;}
const prep=()=>act(R.createGame(42),{type:'start'});
const talk=(s,id,choice='accept')=>act(s,{type:'storyDay',id,choice});
const decide=(s,choice)=>act(s,{type:'storyNight',choice});
function ticks(s,n){for(let i=0;i<n;i++)s=act(s,{type:'tick',seconds:1});return s;}
function pending(id){return ticks(act(talk(prep(),id),{type:'open'}),12);}
function next(s){if(s.phase==='prep')s=act(s,{type:'open'});if(s.phase==='night')s=act(s,{type:'close'});return act(s,{type:'next'});}
function awaitGuest(s,name){for(let i=0;i<120&&!R.customers(s).some(o=>o.name===name);i++){if(s.night.event?.status==='pending')s=act(s,{type:'event',choice:'refuse'});else s=ticks(s,1);}assert.ok(R.customers(s).some(o=>o.name===name));return s;}
test('day and night character stories',async t=>{
  await t.test('day invitation is free, optional, limited to one accepted thread per evening',()=>{
    const s=prep(),accepted=talk(s,'marta');assert.equal(accepted.actions,2);assert.equal(accepted.cash,45);assert.deepEqual(accepted.batches,s.batches);
    reject(accepted,{type:'storyDay',id:'bram',choice:'accept'});reject(accepted,{type:'storyDay',id:'marta',choice:'accept'});
    const declined=talk(s,'marta','decline');assert.equal(R.stories.current(declined),null);assert.equal(talk(declined,'bram').stories.threads.length,2);
    for(const id of ['unknown','constructor','__proto__'])reject(s,{type:'storyDay',id,choice:'accept'});
    assert.equal(R.stories.dayView(s,'pub').id,'marta');assert.equal(R.stories.dayView(s,'noord'),null);
    assert.equal(R.stories.dayView(accepted,'coffee').busy,true);
  });
  await t.test('character choice freezes an active pour, timer and guests until a valid reply',()=>{
    let s=act(talk(prep(),'marta'),{type:'open'});s=ticks(s,10);const guest=R.customers(s)[0];s=act(s,{type:'pour',customerId:guest.id,beer:'blond',price:8});s=ticks(s,2);
    assert.equal(R.stories.pending(s).id,'marta');assert.equal(s.night.elapsed,12);const snapshot=structuredClone(s);assert.deepEqual(R.restore(snapshot),s);
    for(const a of [{type:'tick',seconds:1},{type:'serve',customerId:guest.id},{type:'storyNight',choice:'bad'},{type:'event',choice:'comp'}])reject(s,a);
    const patience=s.night.orders[0].patience;s=decide(s,'talk');assert.equal(s.night.elapsed,12);assert.equal(s.night.orders[0].patience,patience+4);s=act(s,{type:'serve',customerId:guest.id});assert.equal(s.stories.threads[0].service,'satisfied');
    reject(s,{type:'storyNight',choice:'felt'});
  });
  await t.test('Marta felt choice spends once and affects only still-present guests',()=>{
    let s=act(talk(prep(),'marta'),{type:'open'});s=act(s,{type:'water',customerId:R.customers(s)[0].id});s=ticks(s,12);const before=structuredClone(s);
    s=decide(s,'felt');assert.equal(s.cash,before.cash-4);assert.equal(s.night.orders[0].patience,before.night.orders[0].patience);
    for(let i=1;i<s.night.orders.length;i++)assert.equal(s.night.orders[i].patience,before.night.orders[i].patience+6);
    assert.equal(s.stories.threads[0].service,'lost');assert.equal(s.music,false);assert.equal(s.friends.marta,0);reject(s,{type:'storyNight',choice:'felt'});
    s=next(s);assert.match(R.stories.morning(s)[0],/软毡/);assert.match(R.stories.morning(s)[0],/没喝到/);
  });
  await t.test('Bram introduces Inez and meal changes a real order without paying wages twice',()=>{
    let s=act(prep(),{type:'prepare',kind:'coffee'});assert.match(R.stories.dayView(s,'coffee').context,/€18/);s=talk(s,'bram');s=act(s,{type:'open'});s=ticks(s,12);
    const guest=s.night.orders.find(o=>o.name==='Inez'),before=structuredClone(s);assert.equal(guest.budget,10);assert.equal(guest.person,null);
    s=decide(s,'meal');assert.equal(s.cash,before.cash-3);assert.equal(s.night.orders[3].budget,14);assert.equal(s.night.orders[3].patience,36);
    assert.deepEqual(s.batches,before.batches);assert.equal(s.friends.bram,1);
    s=awaitGuest(s,'Inez');const id=R.customers(s).find(o=>o.name==='Inez').id;s=act(s,{type:'pour',customerId:id,beer:'blond',price:8});s=ticks(s,3);s=act(s,{type:'serve',customerId:id});
    assert.equal(s.stories.threads[0].service,'satisfied');s=next(s);assert.match(R.stories.morning(s)[0],/Inez喝到了满意/);
  });
  await t.test('Ada gift consumes one actual ale, water stays free and no ingredients are granted',()=>{
    const base=pending('ada'),before=structuredClone(base);let s=decide(base,'round');assert.equal(R.stock(s,'blond'),R.stock(before,'blond')-1);assert.equal(s.night.orders[3].patience,42);assert.equal(s.hops,before.hops);assert.equal(s.cash,before.cash);
    s=decide(base,'water');assert.deepEqual(s.batches,before.batches);assert.equal(s.night.orders[3].patience,34);assert.equal(s.music,false);
    s=awaitGuest(s,'Ada');const id=R.customers(s).find(o=>o.name==='Ada').id;s=act(s,{type:'pour',customerId:id,beer:'blond',price:8});s=act(s,{type:'serve',customerId:id});assert.equal(s.stories.threads[0].service,'unsatisfied');
    assert.match(R.stories.notes(s)[0],/这一杯没有满意/);
  });
  await t.test('zero cash and empty ale keep a free story choice available',()=>{
    for(const [id,paid,free] of [['marta','felt','talk'],['bram','meal','regular'],['ada','round','water']]){
      let s=pending(id);s.cash=0;for(const b of s.batches)if(b.beer==='blond')b.cups=0;assert.ok(R.restore(s));
      const view=R.stories.nightView(s,R.trade.available);assert.equal(view.choices.find(c=>c.id===paid).disabled,true);assert.equal(view.choices.find(c=>c.id===free).disabled,false);
      reject(s,{type:'storyNight',choice:paid});s=decide(s,free);assert.equal(s.cash,0);assert.equal(R.stock(s,'blond'),0);
    }
  });
  await t.test('closing before or during a promised scene records missed, not a chosen reply',()=>{
    for(const seconds of [0,12]){let s=act(talk(prep(),'ada'),{type:'open'});s=ticks(s,seconds);s=act(s,{type:'close'});assert.equal(s.stories.threads[0].status,'missed');assert.equal(s.stories.threads[0].choice,null);assert.equal(s.stories.threads[0].service,'lost');assert.match(s.reports[0].note,/没等到约好的回应/);reject(s,{type:'storyNight',choice:'water'});}
    let s=talk(prep(),'ada','decline');s=act(act(s,{type:'open'}),{type:'close'});assert.equal(s.stories.threads[0].status,'declined');assert.match(s.reports[0].note,/没有未兑现/);
  });
  await t.test('three distinct stories finish on their own nights and remain in the ending',()=>{
    let s=prep();for(const [index,id] of ['marta','bram','ada'].entries()){s=talk(s,id);s=act(s,{type:'open'});s=ticks(s,12);s=decide(s,{marta:'talk',bram:'regular',ada:'water'}[id]);s=act(s,{type:'close'});if(index<2)s=act(s,{type:'next'});}
    s=act(s,{type:'finish'});assert.equal(s.stories.threads.length,3);assert.ok(s.stories.threads.every(t=>t.status==='resolved'));assert.equal(R.stories.notes(s).length,3);assert.ok(R.stories.notes(s).every(n=>!n.includes('第 4')));
  });
  await t.test('legacy ongoing nights gain no surprise scene and preserve orders and pours',()=>{
    let s=act(prep(),{type:'open'});s=act(s,{type:'pour',customerId:R.customers(s)[0].id,beer:'blond',price:8});delete s.stories;const old=structuredClone(s);s=R.restore(s);assert.equal(s.stories.fromDay,2);assert.deepEqual(s.night,old.night);s=ticks(s,12);assert.equal(R.stories.pending(s),null);s=next(s);assert.equal(talk(s,'ada').stories.threads[0].day,2);
  });
  await t.test('story save rejects duplicate identities, contradictory choices and forged service',()=>{
    const s=pending('marta');for(const patch of [{status:'resolved',choice:'meal'},{service:'satisfied'},{customerId:'d1-guest7'},{status:'pending',day:2},{choice:'felt'},{extra:true}]){const bad=structuredClone(s);Object.assign(bad.stories.threads[0],patch);assert.equal(R.restore(bad),null);}
    const bad=structuredClone(s);bad.stories.threads.push(structuredClone(bad.stories.threads[0]));assert.equal(R.restore(bad),null);
    const after=decide(s,'talk');assert.deepEqual(R.restore(after),after);
  });
  await t.test('greenhouse work changes Ada dialogue and after-hours exploration keeps story results',()=>{
    let s=prep();s.backstage.discovered.push('greenhouse','greenhouse-pump');assert.match(R.stories.dayView(s,'flowers').context,/修过的泵/);s=talk(s,'ada');s=act(s,{type:'open'});assert.match(s.night.orders[3].quote,/泵还好好的/);s=ticks(s,12);s=decide(s,'water');s=act(s,{type:'close'});
    const note=R.stories.notes(s)[0],report=structuredClone(s.reports[0]);s=act(s,{type:'explore',kit:'hook'});B.command(s.backstage.run,'bail');s=act(s,{type:'returnExplore'});assert.equal(R.stories.notes(s)[0],note);assert.deepEqual(s.reports[0],report);
  });
  await t.test('Noor, delivery reservation and character guest coexist without consuming protected stout',()=>{
    let s=prep();s=act(s,{type:'journeyStart',kind:'delivery'});
    const ja=(verb,value)=>{s=act(s,{type:'journeyAction',verb,value});};
    const travel=stage=>{for(let i=0;i<1000&&s.journeys.run.stage!==stage;i++)ja('tick',{seconds:.1});assert.equal(s.journeys.run.stage,stage);};
    ja('pack','padding');ja('depart','smooth');travel('arrival');ja('cargo');ja('deliver','accept');travel('receipt');s=act(s,{type:'journeyReturn'});
    s=act(s,{type:'contract',id:s.trade.contracts[0].id,choice:'accept'});s=act(s,{type:'prepare',kind:'brew',beer:'stout'});for(let i=0;i<3;i++)s=act(s,{type:'brewHit',score:1});
    const batch=s.batches.at(-1).id;s=act(s,{type:'contract',id:s.trade.contracts[0].id,choice:'reserve',batchId:batch});
    s=act(act(s,{type:'open'}),{type:'close'});s=act(s,{type:'explore',kit:'hook'});const r=s.backstage.run,box=r.items.find(i=>i.kind==='parcel');Object.assign(r.p,box);B.command(r,'interact');Object.assign(r.p,B.NOOR);B.command(r,'interact');Object.assign(r.p,B.EXIT);B.command(r,'interact');s=act(s,{type:'returnExplore'});s=act(s,{type:'next'});
    s=talk(s,'ada');s=act(s,{type:'open'});assert.equal(s.night.orders[1].name,'Noor');assert.equal(s.night.orders[2].name,'排练室管理员');assert.equal(s.night.orders[3].name,'Ada');
    s=ticks(s,12);const protectedCups=s.batches.find(b=>b.id===batch).cups;s=decide(s,'round');assert.equal(s.trade.contracts[0].reservedBatch,batch);assert.equal(s.batches.find(b=>b.id===batch).cups,protectedCups);
    s=ticks(s,23);assert.equal(s.night.event.status,'pending');assert.equal(s.night.event.id,'influencer');assert.equal(R.stories.pending(s),null);s=act(s,{type:'event',choice:'refuse'});assert.equal(s.stories.threads[0].choice,'round');
  });
});
