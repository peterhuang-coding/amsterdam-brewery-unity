(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Journey = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, a, b) => typeof n === 'number' && Number.isFinite(n) && n >= a && n <= b;
  const list = (v, values) => values.includes(v);
  const STAGES = ['packing', 'road', 'conflict', 'ticket', 'carriage', 'inspection', 'arrival', 'receipt', 'dropoff', 'garden'];
  const GARDEN=Object.freeze({x:835,y:210});
  const LABELS = Object.freeze({delivered:'完好交付', honest:'说明损伤后交付', returned:'退回花店', abandoned:'改约并返回', late:'迟到后交付', redirected:'按改约交到后台', repurposed:'协商改作排练桌花'});
  // All fares, stops and checks are fictional game rules, not real NS information.
  const FARE = 4, SURCHARGE = 8;
  const mix = n => { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0; };
  function create(seed, day, kind, version = kind === 'delivery' ? 4 : 1, context = {}) {
    if (!list(kind, ['delivery','rail'])) return null;
    const roll = mix(seed ^ Math.imul(day, 2654435761));
    const run = {version, seed, day, kind, stage:'packing', packing:null, route:null,
      p:{x:95,y:330}, bike:{x:95,y:330,mounted:true}, cargo:'hand', quality:100,
      elapsed:0, deadline:kind==='delivery'?40:80, slow:true, auto:false, damage:0, returning:false,
      weather:roll%2?'wet':'dry', encounterDone:false, conflict:null, streetResult:'none',
      ticket:'none', leg:0, travel:0, checkAt:8+roll%3, willCheck:roll%3!==0,
      eventDone:false, help:false, secured:false, paid:0, fee:0, checked:false, travelStarted:false,
      repaired:false, outcome:null, reward:0, message:'店主递来一束委托花。先选包装，再出发；花不属于你的私人花束。'};
    if(version>=2)run.load={parcel:'none',onTime:null};
    if(version>=3)run.care={notifiedAt:null,resolution:null};
    if(version===4)run.garden={known:context.known===true,introduced:context.introduced===true,pump:context.pump===true,detour:false,visited:false,wrapped:false};
    return run;
  }
  const parcelPending = r => r.version>=2&&['bike','hand'].includes(r.load.parcel);
  const deadline = r => r.version>=3&&r.care.notifiedAt!==null?80:r.deadline;
  const canNotify = r => r.version>=3&&!r.outcome&&['road','dropoff','garden'].includes(r.stage)&&r.care.notifiedAt===null&&r.elapsed<=40;
  const canRepurpose = r => r.version>=3&&r.stage==='arrival'&&!r.outcome&&r.quality>=20&&r.quality<80;
  const canDetour = r => r.version===4&&!r.outcome&&['road','arrival','dropoff'].includes(r.stage)&&r.garden.known;
  const wrapCost = r => r.garden?.introduced?0:2;
  function careNote(r){
    if(r.version<3)return '';
    return (r.care.notifiedAt!==null?'你在原时限内联系了 Lotte，约定改在桥边后台交接，时限 80 秒、完好报酬 €12。':'')+
      (r.repaired?'你花了 15 秒整理包装，损伤没有被隐瞒。':'')+
      (r.care.resolution==='table'?'你与 Lotte 花 10 秒拆分花束，改作排练桌花；花没有恢复品质，报酬 €8。':'')+
      (r.garden?.visited?'你绕进了温室侧门。'+(r.garden.wrapped?'花束重新包扎一次，花了 8 秒'+(r.garden.introduced?'，凭 Ada 的介绍免材料费。':'和 €2 材料费。'):'看过温室后继续赶路，没有拿额外报酬。')+(r.garden.pump?'之前修好的水泵让入口保持干燥。':'入口仍在漏水，进出要慢一些。'):'');
  }
  function manifest(r){
    const items=[{name:'易损花束',slots:1,where:r.cargo}];
    if(r.packing==='padding')items.push({name:'保护软垫',slots:1,where:r.returning?'returned':'bike'});
    if(r.version>=2&&r.packing==='capacity')items.push({name:'排练室急件',slots:1,where:r.load.parcel});
    return items;
  }
  function reward(r){
    const base=r.outcome==='returned'||r.outcome==='abandoned'?0:['honest','repurposed'].includes(r.outcome)?8:r.outcome==='late'?10:r.outcome==='redirected'?12:14;
    return base+(r.version===1?(r.packing==='capacity'&&base?2:0):r.load.parcel==='delivered'?(r.load.onTime?4:2):0);
  }
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function roadTarget(r,goal){
    const p=r.p,y=r.route==='smooth'?490:330;
    if(p.x>=395&&p.x<=530){const crossing=p.y<420?330:490;return {x:goal.x<p.x?365:560,y:crossing};}
    if(p.x<395&&goal.x>395){if(p.x<360||Math.abs(p.y-y)>12)return {x:370,y};return {x:560,y};}
    if(p.x>530&&goal.x<530){if(p.x>565||Math.abs(p.y-y)>12)return {x:560,y};return {x:370,y};}
    return goal;
  }
  function target(r){
    if(r.stage==='carriage') return r.eventDone?{x:850,y:330}:{x:620,y:260};
    if(r.returning){
      if(distance(r.p,r.bike)>55&&!r.bike.mounted)return roadTarget(r,r.bike);
      return roadTarget(r,{x:95,y:330});
    }
    if((r.cargo==='bike'||r.version>=2&&r.load.parcel==='bike')&&!r.bike.mounted)return roadTarget(r,r.bike);
    if(r.version===4&&r.garden.detour)return roadTarget(r,GARDEN);
    if(parcelPending(r))return roadTarget(r,{x:790,y:490});
    return roadTarget(r,{x:990,y:330});
  }
  function moving(r){return r.stage==='road'||r.stage==='conflict'||r.stage==='carriage';}
  function rideable(x,y){return !(x>415&&x<500&&y<430);}
  function cargoPoint(r){return r.cargo==='bike'?r.bike:r.cargo==='ground'?{x:335,y:330}:r.p;}
  function nearCargo(r){return distance(r.p,cargoPoint(r))<65;}
  function passable(x,y){return x>=60&&x<=1040&&y>=190&&y<=550&&(!(x>395&&x<530)||(y>290&&y<380||y>460&&y<525));}
  function damage(r,amount){r.quality=clamp(r.quality-amount,0,100);}
  function move(r,dx,dy,dt){
    let speed=r.stage==='carriage'?180:r.bike.mounted?(r.slow?30:80):r.stage==='conflict'?150:22;
    if(r.bike.mounted&&!rideable(r.p.x,r.p.y))speed=55;
    if(r.bike.mounted&&r.p.y>430)speed=Math.min(speed,24);
    if(r.cargo==='hand'&&r.stage==='conflict')speed*=.8;
    if(r.packing==='capacity'&&r.bike.mounted)speed*=.9;
    if(r.version===4&&!r.garden.pump&&r.p.x>780&&r.p.x<900&&r.p.y<285)speed*=.55;
    const n=Math.hypot(dx,dy);if(n<.001)return;
    const x=clamp(r.p.x+dx/n*speed*dt,60,1040),y=clamp(r.p.y+dy/n*speed*dt,190,550);
    // An actual canal/wall separates the routes; there are only two crossings.
    if(['road','conflict'].includes(r.stage)&&!passable(x,y))return;
    r.p={x,y};if(r.bike.mounted)r.bike={x,y,mounted:true};
    if(['road','conflict'].includes(r.stage)&&!r.returning&&r.cargo==='bike'&&r.bike.mounted&&!r.slow&&x>540&&x<775&&y<365){
      r.damage+=dt*(r.weather==='wet'?22:14)*((r.packing==='padding'||r.garden?.wrapped)? .2:1);
      if(r.damage>=1){const loss=Math.floor(r.damage);damage(r,loss);r.damage-=loss;}
    }
  }
  function arrive(r){r.auto=false;r.stage='arrival';r.message=r.version>=3&&r.care.notifiedAt!==null?'Lotte 在桥边后台等你：按改约时限交接。先取出花，再决定交付、整理或协商改变用途。':'先停稳，再交付。收件人只看得到花的状态；路上的事由你决定是否说明。';}
  function finish(r,outcome){
    r.stage='receipt';r.auto=false;r.conflict=null;r.outcome=outcome;
    r.reward=reward(r);
    r.message=outcome==='honest'?'“包装皱了，谢谢你直接告诉我。” 对方收下花，你们约好下次多垫一层。':outcome==='delivered'?'“先把车停稳。花很好，谢谢你跑这一趟。”':outcome==='late'?'“我多等了一会儿，花还能用。下次来不及就提前告诉我。”':'你联系花店，结束这次委托。没有交付奖励，也不再扣一次行动。';
    if(outcome==='redirected')r.message='Lotte：“收到你的消息，我先去排练了。后台交接正好，按约 €12。”';
    if(outcome==='repurposed')r.message='Lotte：“不再当演出花束，我们拆成几瓶排练桌花。” 你们一起整理了 10 秒，按约 €8。';
    if(outcome==='late'&&r.version>=3&&r.care.notifiedAt!==null)r.message='Lotte：“改到后台后也超过了 80 秒，不过花还能用。” 迟到报酬 €10。';
  }
  function headHome(r){
    r.returning=true;r.stage='road';r.conflict=null;r.auto=true;
    r.message+=' 现在取回车，沿原路返回花店；路上不再触发冲突。';
  }
  function step(r,seconds,input={}){
    if(!moving(r)||!finite(seconds,0,1))return;
    let remaining=seconds;
    while(remaining>1e-8&&moving(r)){
      const dt=Math.min(remaining,1/60);remaining-=dt;
      if(r.stage==='conflict'&&r.conflict.mode==='choice')break;
      if(r.stage==='carriage'&&!r.travelStarted&&!r.auto&&!input.dx&&!input.dy)break;
      if(r.stage==='carriage')r.travelStarted=true;
      const decision=r.stage==='carriage'&&!r.eventDone&&r.travel>=5;
      if(!decision&&!r.returning&&r.leg===0)r.elapsed=Math.min(600,r.elapsed+dt);
      let dx=Number(input.dx)||0,dy=Number(input.dy)||0;
      if(r.auto){
        if(r.stage!=='carriage'&&!r.bike.mounted&&distance(r.p,r.bike)<55&&(r.cargo==='bike'||r.returning||r.version>=2&&r.load.parcel==='bike'))r.bike.mounted=true;
        const t=target(r);dx=t.x-r.p.x;dy=t.y-r.p.y;if(Math.hypot(dx,dy)<5){dx=0;dy=0;}
      }
      move(r,dx,dy,dt);
      if(r.stage==='road'){
        if(r.returning){if(distance(r.p,{x:95,y:330})<35&&distance(r.p,r.bike)<65){r.bike.mounted=false;r.stage='receipt';r.auto=false;r.message='你带着车回到花店。'+(r.outcome==='abandoned'?'已说明改约，花退回原处。':'这趟的交付和票务结果已经记下。');}}
        else if(r.kind==='delivery'&&r.route==='short'&&!r.encounterDone&&r.p.x>285&&r.p.y<420){
          r.stage='conflict';r.auto=false;r.bike.mounted=false;
          r.conflict={mode:'choice',timer:0,x:570,y:330,aimX:0,aimY:0,hits:0,stagger:0,guard:0,dash:0,inv:0};
          r.message='有人伸手拦你的花。前方可交涉，南侧有绕行路；你也可以选择对抗。';
        }else if(r.version===4&&(!r.garden.visited||r.garden.detour)&&distance(r.p,GARDEN)<38&&!(r.auto&&(r.cargo==='bike'||r.load.parcel==='bike')&&distance(r.p,r.bike)>=65)){
          r.garden.known=true;r.garden.visited=true;r.garden.detour=false;r.stage='garden';r.auto=false;r.bike.mounted=false;
          r.message='到了温室日间侧门。这里借用包装台，也能只看看再走；路上与加工都计时，阅读不计时。花和急件仍在原处，不自动交付。';
        }else if(parcelPending(r)&&distance(r.p,{x:790,y:490})<45&&!(r.version===4&&r.garden.detour)){
          if(r.load.parcel==='bike'&&distance(r.p,r.bike)>=65){r.auto=false;r.message='急件还在远处的车上。回到车旁取货或骑过来，仍可自由移动。';}
          else{r.stage='dropoff';r.auto=false;r.bike.mounted=false;r.message='到了南岸排练室。急件与花束分别交付；阅读时暂停。取出急件交给管理员，或说明不送、随车退回。';}
        }else if(distance(r.p,{x:990,y:330})<45&&!(r.version===4&&r.garden.detour)){
          if(parcelPending(r)){r.auto=false;r.message='急件还没有处理。先到南岸排练室交付，或在这里说明退回急件。';break;}
          r.bike.mounted=false;
          if(r.cargo==='bike'&&distance(r.p,r.bike)>=65){r.auto=false;r.message='花还在车篮里。先回到车旁，带车或取出花，再来交付。';}
          else if(r.kind==='rail'){
            if(distance(r.p,r.bike)>=65){r.auto=false;r.message='先把车带到出发站外，才开始这趟往返。';}
            else{r.stage='ticket';r.cargo='hand';r.auto=false;r.message='到站了。自行车停在出发站外；这趟只带随身的委托花。往返基础票价共 €8。';}
          }else arrive(r);
        }
      }else if(r.stage==='conflict'){
        const c=r.conflict;if(c.mode==='choice')break;
        c.guard=Math.max(0,c.guard-dt);c.dash=Math.max(0,c.dash-dt);c.inv=Math.max(0,c.inv-dt);c.timer=Math.max(-.5,c.timer-dt);
        if(c.mode==='approach'){
          const d=distance(r.p,c);if(d>100){const x=c.x+(r.p.x-c.x)/d*75*dt,y=c.y+(r.p.y-c.y)/d*75*dt;if(passable(x,y)){c.x=x;c.y=y;}}
          else{c.mode='windup';c.timer=.9;c.aimX=r.p.x;c.aimY=r.p.y;r.message='对方准备前冲：橙色圈是已经锁定的位置。闪开、格挡，或绕过去。';}
        }else if(c.mode==='windup'&&c.timer<=0){
          const sx=c.x,sy=c.y;for(let i=1;i<=20;i++){const x=sx+(c.aimX-sx)*i/20,y=sy+(c.aimY-sy)*i/20;if(!passable(x,y))break;c.x=x;c.y=y;}
          if(distance(r.p,c)<75&&c.inv<=0){
            if(c.guard>0&&r.cargo!=='hand'){c.stagger++;r.message='挡住了，对方一时站不稳。可以通过，也可以短暂反击。';}
            else{c.hits++;if(r.cargo==='hand'||distance(r.p,r.bike)<75)damage(r,r.cargo==='hand'?25:8);r.message='被撞了一下。身边的花可能受损，远处车篮不受影响；你仍可撤离。';}
            c.inv=1;
          }
          c.mode='recover';c.timer=1.4;
        }else if(c.mode==='recover'&&c.timer<=0){c.mode='approach';}
        if(c.hits>=3){r.streetResult='retreated';r.encounterDone=true;c.mode='yield';r.message='对方不再追过来。你退到南侧，可以取花绕路，也可结束委托。';}
        if(c.stagger>=2){r.streetResult='stood-ground';r.encounterDone=true;c.mode='yield';r.message='对方退让了。取回花、回到车旁，然后继续这一趟。';}
        if(r.p.x>820&&r.cargo==='hand'||r.p.x>820&&r.cargo==='bike'&&r.bike.mounted){
          r.streetResult=r.streetResult==='none'?'passed':r.streetResult;r.encounterDone=true;r.stage='road';r.conflict=null;
        }
      }else if(r.stage==='carriage'){
        if(decision)continue;
        r.travel=Math.min(20,r.travel+dt);
        if(!r.eventDone&&r.travel>=5){r.auto=false;r.message='车厢晃动，同行人的纸袋散开了。走近他按 E 帮忙，或选择留在花旁；阅读选择时暂停。';break;}
        if(r.travel>=r.checkAt&&!r.checked){
          r.checked=true;
          if(r.willCheck){r.stage='inspection';r.auto=false;r.message=r.ticket==='paid'?'票务核对：车票有效，不产生额外费用。':'票务核对：这段无票。按出发前明示的虚构规则补票并支付处理费。';}
        }
        if(r.stage==='carriage'&&r.travel>=20){
          r.auto=false;
          if(r.leg===0)arrive(r);else{r.p={x:r.bike.x,y:r.bike.y};headHome(r);}
        }
      }
    }
  }
  function act(r,verb,value,cash=0){
    const fail=message=>({ok:false,message});
    if(verb==='tick'){if(!value||!finite(value.seconds,0,1)||!finite(value.dx??0,-1,1)||!finite(value.dy??0,-1,1))return fail('无效的行动时间或方向。');step(r,value.seconds,value);return {ok:true,cost:0};}
    if(verb==='pack'&&r.stage==='packing'&&list(value,['padding','capacity'])){r.packing=value;if(r.version>=2)r.load={parcel:value==='capacity'?'hand':'none',onTime:null};return {ok:true,cost:0};}
    if(verb==='notify'&&canNotify(r)){
      r.care.notifiedAt=r.elapsed;r.elapsed+=5;r.auto=false;
      r.message='你停下联系 Lotte，用了 5 秒。她先去排练，改在同一桥边的后台交接：花束时限 80 秒，完好报酬 €12；急件仍按 55 秒结算。点自动行进继续。';
      return {ok:true,cost:0};
    }
    if(verb==='depart'&&r.stage==='packing'&&r.packing&&list(value,['short','smooth'])){
      r.route=value;r.stage='road';r.cargo='bike';r.auto=true;
      if(parcelPending(r))r.load.parcel='bike';
      r.message=value==='short'?'近路有石板、窄桥和一个可绕开的冲突路口。慢骑保护花，快骑缩短耗时。':'沿南侧平路绕行，货物更稳。可以随时暂停、手动走或继续自动行进。';return {ok:true,cost:0};
    }
    if(verb==='garden-route'&&canDetour(r)){
      r.garden.detour=!r.garden.detour;r.stage='road';r.auto=true;
      r.message=r.garden.detour?'改道去温室侧门。骑车或带花走过去，额外路程照常计时；急件仍是 55 秒，可随时取消这次绕路。':'取消温室绕路，继续原来的送货顺序。';
      return {ok:true,cost:0};
    }
    if(verb==='garden-wrap'&&r.version===4&&r.stage==='garden'&&!r.outcome){
      if(r.garden.wrapped)return fail('这一趟已经重新包扎过，不能反复恢复花束。');
      if(r.cargo!=='hand')return fail('先从车篮取出花，才能放上包装台。');
      if(cash<wrapCost(r))return fail('材料需要 €2；也可以不加工，继续送花。');
      r.garden.wrapped=true;r.quality=Math.max(r.quality,Math.min(90,r.quality+30));r.elapsed=Math.min(630,r.elapsed+8);
      r.message='包装台重新包好花束：受损花 +30 品质，最高恢复至 90；完好花不降品质。用时 8 秒，后续石板颠簸减少。急件不变。';
      return {ok:true,cost:wrapCost(r)};
    }
    if(verb==='garden-leave'&&r.version===4&&r.stage==='garden'){
      r.stage='road';r.auto=true;r.message='离开温室，继续这趟送货。车和货留在哪里，就从哪里取回。';return {ok:true,cost:0};
    }
    if(verb==='parcel'&&parcelPending(r)&&['road','dropoff','arrival'].includes(r.stage)&&list(value,['take','deliver','return'])){
      if(value==='take'){
        if(r.load.parcel!=='bike'||distance(r.p,r.bike)>=65)return fail('急件在车上，先靠近自行车。');
        r.load.parcel='hand';r.message='急件拿在手里，花仍留在原处。';
      }else if(value==='deliver'){
        if(r.stage!=='dropoff'||r.load.parcel!=='hand'||distance(r.p,{x:790,y:490})>=65)return fail('带着急件到排练室，才能亲手交付。');
        r.load.parcel='delivered';r.load.onTime=r.elapsed<=55;r.message=r.load.onTime?'管理员收到急件：返店结算 €4。现在继续送花。':'急件迟到了，对方仍收下：返店结算 €2。现在继续送花。';
      }else{r.load.parcel='returned';r.message='已通知排练室取消急件，留在车上带回花店；不收急件报酬。';}
      if(value!=='take'&&r.stage==='dropoff'){r.stage='road';r.auto=true;}
      return {ok:true,cost:0};
    }
    if(verb==='auto'&&moving(r)&&!(r.stage==='conflict'&&r.conflict.mode==='choice')){r.auto=!r.auto;return {ok:true,cost:0};}
    if(verb==='speed'&&r.stage==='road'){r.slow=!r.slow;return {ok:true,cost:0};}
    if(verb==='street'&&r.stage==='conflict'&&r.conflict.mode==='choice'&&list(value,['talk','detour','fight'])){
      if(value==='fight'){r.conflict.mode='approach';r.message='WASD 移动，Space 闪避，J 格挡／反击。车停在身后；花在车篮，不会远程跟随。';}
      else{r.streetResult=value;r.encounterDone=true;r.stage='road';r.conflict=null;r.route=value==='detour'?'smooth':r.route;
        r.elapsed+=value==='talk'?12:0;r.message=value==='talk'?'你说明这束花有收件人。对方让开，交涉用了 12 秒；回到车旁再骑。':'你选择南侧绕行，不必打架。回到车旁取车，再继续。';}
      return {ok:true,cost:0};
    }
    if(verb==='bike'&&list(r.stage,['road','conflict','arrival','garden'])&&distance(r.p,r.bike)<65&&!(r.kind==='rail'&&r.stage==='arrival')){
      r.bike.mounted=!r.bike.mounted;if(r.bike.mounted){r.bike.x=r.p.x;r.bike.y=r.p.y;}return {ok:true,cost:0};
    }
    if(verb==='cargo'&&!r.outcome&&list(r.stage,['road','conflict','arrival','garden'])&&!(r.kind==='rail'&&r.stage==='arrival')){
      if(r.cargo==='hand'){if(distance(r.p,r.bike)>=65)return fail('先回到车旁，才能放入车篮。');r.cargo='bike';}
      else if(r.cargo==='bike'&&distance(r.p,r.bike)<65)r.cargo='hand';else return fail('花还在车旁，请靠近取回。');
      return {ok:true,cost:0};
    }
    if(verb==='dash'&&r.stage==='conflict'&&r.conflict.mode!=='choice'&&r.conflict.dash<=0){r.conflict.dash=.9;r.conflict.inv=.45;const dx=value?.dx||0,dy=value?.dy||0;for(let i=0;i<12;i++)move(r,dx||(!dy?1:0),dy,.06);return {ok:true,cost:0};}
    if(verb==='defend'&&r.stage==='conflict'&&!['choice','yield'].includes(r.conflict.mode)){
      if(r.cargo==='hand')return fail('手里抱着花，无法格挡；先放回车篮，或闪避通过。');
      const c=r.conflict;
      if(c.mode==='recover'&&distance(r.p,c)<130){c.stagger++;c.mode='approach';r.message='短暂反击拉开了空间。目标是通过，不是刷战利品。';}
      else{c.guard=1.1;r.message='抬手防守，等待这一次冲撞。';}return {ok:true,cost:0};
    }
    if(verb==='ticket'&&r.stage==='ticket'&&list(value,['paid','unpaid','credit'])){
      if(value==='credit'&&r.leg!==1)return fail('去程请先准备足够路费。');
      const cost=value==='paid'?FARE:0;if(cash<cost)return fail('现金不足，可改约返回，不必冒险。');
      if(value==='credit'){r.fee+=FARE;value='paid';}
      r.ticket=value;r.paid+=cost;r.stage='carriage';r.travel=0;r.p={x:180,y:330};r.cargo='hand';r.auto=false;r.travelStarted=false;
      if(r.leg===1)r.cargo=r.outcome==='returned'?'returned':'delivered';
      r.message='这是一条虚构列车线路。先固定花束；WASD 在车厢移动，E 与同行人互动。';return {ok:true,cost};
    }
    if(verb==='secure'&&r.stage==='carriage'&&r.leg===0&&r.travel<5){r.secured=true;r.message='固定好了花。可以点继续行程；中途阅读选择时车厢会暂停。';return {ok:true,cost:0};}
    if(verb==='help'&&r.stage==='carriage'&&!r.eventDone&&r.travel>=5){
      if(value&&distance(r.p,{x:620,y:260})>90)return fail('先走到同行人身旁，按 E 帮忙。');
      r.eventDone=true;r.help=Boolean(value)||r.help;if(!r.secured&&value)damage(r,20);
      r.message=value?'你帮忙拾起纸袋。对方记住了你；这不抵销票务责任。':'你留在花旁扶稳包装，对方自己收好了纸袋。';return {ok:true,cost:0};
    }
    if(verb==='inspect'&&r.stage==='inspection'){
      const cost=r.ticket==='paid'?0:FARE+SURCHARGE;const paid=Math.min(cash,cost);r.paid+=paid;r.fee+=cost-paid;r.ticket='paid';r.stage='carriage';
      r.message=cost?'本段票务责任已结清：支付 €'+paid+(cost>paid?'，待付 €'+(cost-paid):'')+'。本段不会重复处罚。':'车票有效，继续这一趟。';return {ok:true,cost:paid};
    }
    if(verb==='tidy'&&r.stage==='arrival'&&!r.repaired&&r.quality<80){r.quality=Math.min(80,r.quality+25);r.elapsed+=15;r.repaired=true;r.message='花重新整理过了，花费 15 秒；收件人仍能看见包装上的痕迹。';return {ok:true,cost:0};}
    if(verb==='leaveArrival'&&r.stage==='arrival'&&r.kind==='delivery'){r.stage='road';r.auto=false;return {ok:true,cost:0};}
    if(verb==='deliver'&&r.stage==='arrival'){
      if(r.cargo==='bike'&&!nearCargo(r))return fail('先回到车旁取花。');
      if(r.cargo==='bike')return fail('先从车篮取出花，再亲手交付。');
      if(r.cargo!=='hand')return fail('花已经交付或退回，不能再交一次。');
      if(!list(value,['accept','return','table'])||value==='table'&&!canRepurpose(r))return fail('请选择可用的交付、改作桌花或退回方案。');
      if(value==='table'){r.care.resolution='table';r.elapsed=Math.min(630,r.elapsed+10);}
      const outcome=value==='return'?'returned':value==='table'?'repurposed':r.quality<80?'honest':r.elapsed>deadline(r)?'late':r.version>=3&&r.care.notifiedAt!==null?'redirected':'delivered';
      finish(r,outcome);r.cargo=value==='return'?'returned':'delivered';
      if(r.kind==='rail'){r.stage='ticket';r.leg=1;r.ticket='none';r.checked=false;r.eventDone=true;r.travel=0;r.willCheck=mix(r.seed^r.day^131)%3!==0;r.message+=' 现在安排返程，回到原来的出发站。';}
      else headHome(r);
      return {ok:true,cost:0};
    }
    if(verb==='abandon'&&r.stage!=='receipt'){
      // A checked leg must be settled, and return travel is never silently forgiven.
      if(r.stage==='inspection')return fail('先处理已经发生的票务核对，再结束行程。');
      if(r.outcome)return fail('委托已处理，沿返回路线取车回花店即可。');
      if(r.kind==='rail'&&['carriage','arrival'].includes(r.stage))return fail('列车已经出发，抵达后可退回花束并安排返程。');
      if(parcelPending(r))r.load.parcel='returned';
      if(!r.packing)r.packing='padding';if(!r.route)r.route='smooth';
      finish(r,'abandoned');r.cargo='returned';headHome(r);return {ok:true,cost:0};
    }
    return fail('现在不能这样操作。');
  }
  function valid(r){
    if(!r||![1,2,3,4].includes(r.version)||r.version>=2&&r.kind!=='delivery'||!Number.isInteger(r.seed)||!finite(r.seed,0,4294967295)||!Number.isInteger(r.day)||!finite(r.day,1,3)||!list(r.kind,['delivery','rail'])||!list(r.stage,STAGES))return false;
    const keys=Object.keys(create(r.seed,r.day,r.kind,r.version)).sort();if(Object.keys(r).sort().join(',')!==keys.join(','))return false;
    if(r.version>=2){
      const l=r.load;if(!l||Object.keys(l).sort().join(',')!=='onTime,parcel'||!list(l.parcel,['none','bike','hand','delivered','returned']))return false;
      if(l.parcel==='delivered'?typeof l.onTime!=='boolean':l.onTime!==null)return false;
      if((r.packing==='capacity')!==(l.parcel!=='none')||r.outcome&&parcelPending(r))return false;
    }
    if(r.version>=3){
      const c=r.care;if(!c||Object.keys(c).sort().join(',')!=='notifiedAt,resolution'||!list(c.resolution,[null,'table']))return false;
      if(c.notifiedAt!==null&&(!finite(c.notifiedAt,0,40)||r.elapsed<c.notifiedAt+5||r.stage==='packing'))return false;
      if((c.resolution==='table')!==(r.outcome==='repurposed')||c.resolution==='table'&&(!finite(r.quality,20,79.999999)||r.elapsed<10))return false;
      if(r.outcome==='redirected'&&(c.notifiedAt===null||r.elapsed>deadline(r)||r.quality<80))return false;
      if(r.outcome==='delivered'&&c.notifiedAt!==null)return false;
    }else if(['redirected','repurposed'].includes(r.outcome))return false;
    if(r.stage==='dropoff'&&(!parcelPending(r)||r.auto||r.bike.mounted))return false;
    const point=p=>p&&finite(p.x,60,1040)&&finite(p.y,190,550);
    if(!point(r.p)||!point(r.bike)||typeof r.bike.mounted!=='boolean'||!list(r.cargo,['hand','bike','ground','delivered','returned']))return false;
    if(r.version===4){
      const g=r.garden;if(!g||Object.keys(g).sort().join(',')!=='detour,introduced,known,pump,visited,wrapped'||!Object.values(g).every(v=>typeof v==='boolean'))return false;
      if((g.detour||g.visited||g.introduced)&&!g.known||g.wrapped&&!g.visited)return false;
      if(r.stage==='garden'&&(!g.visited||r.outcome||r.auto||distance(r.p,GARDEN)>=38))return false;
    }else if(r.stage==='garden')return false;
    if(!finite(r.quality,0,100)||!finite(r.elapsed,0,630)||r.deadline!==(r.kind==='delivery'?40:80)||!finite(r.damage,0,1))return false;
    if(!list(r.packing,[null,'padding','capacity'])||!list(r.route,[null,'short','smooth'])||!list(r.weather,['wet','dry']))return false;
    if(!['slow','auto','encounterDone','eventDone','help','secured','willCheck','checked','repaired','returning','travelStarted'].every(k=>typeof r[k]==='boolean'))return false;
    if(!list(r.streetResult,['none','talk','detour','passed','stood-ground','retreated'])||!list(r.ticket,['none','paid','unpaid'])||!list(r.leg,[0,1]))return false;
    if(!finite(r.travel,0,20)||!finite(r.checkAt,8,10)||!['paid','fee','reward'].every(k=>Number.isInteger(r[k])&&finite(r[k],0,100)))return false;
    if(!list(r.outcome,[null,...Object.keys(LABELS)])||typeof r.message!=='string'||r.message.length>1000)return false;
    if(r.stage!=='packing'&&(!r.packing||!r.route))return false;
    if(r.stage==='conflict'){
      const c=r.conflict;if(!c||!list(c.mode,['choice','approach','windup','recover','yield'])||!point(c)||!finite(c.timer,-1,2)||!finite(c.aimX,0,1100)||!finite(c.aimY,0,640)||!finite(c.hits,0,3)||!finite(c.stagger,0,3)||!['guard','dash','inv'].every(k=>finite(c[k],0,2)))return false;
    }else if(r.conflict!==null)return false;
    if(r.stage==='receipt'&&!r.outcome||r.leg===1&&!r.outcome)return false;
    if(r.returning&&!r.outcome||r.outcome&&!['delivered','returned'].includes(r.cargo))return false;
    if(r.outcome==='abandoned'&&r.cargo!=='returned')return false;
    if(r.bike.mounted&&distance(r.p,r.bike)>1)return false;
    if(['carriage','inspection'].includes(r.stage)&&r.ticket==='none')return false;
    if(r.outcome&&r.reward!==reward(r))return false;
    if(r.kind==='delivery'&&list(r.stage,['ticket','carriage','inspection']))return false;
    return true;
  }
  return Object.freeze({create,act,step,valid,target,moving,LABELS,FARE,SURCHARGE,rideable,manifest,parcelPending,deadline,canNotify,canRepurpose,careNote,GARDEN,canDetour,wrapCost});
});
