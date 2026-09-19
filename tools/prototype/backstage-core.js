(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.Backstage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const WIDTH=2200,HEIGHT=1400;
  const EXIT=Object.freeze({x:210,y:1140}),NOOR=Object.freeze({x:510,y:320});
  const LEVER=Object.freeze({x:1570,y:510});
  const GARDEN_EXIT=Object.freeze({x:2010,y:260});
  const GATE=Object.freeze({x:1770,y:540,w:110,h:22});
  const KITS=Object.freeze({
    hook:{name:'长钩绳',detail:'钩取距离 280 · 8 格背包。够到远处，也能拉开机关。',range:280,capacity:8,speed:205,foam:3.5},
    cart:{name:'搬货背架',detail:'12 格背包 · 步速稍慢。整桶带走，留意回程。',range:210,capacity:12,speed:180,foam:3.5},
    foam:{name:'泡沫工具',detail:'泡沫恢复更快 · 7 格背包。机器失灵，脚下也会打滑。',range:210,capacity:7,speed:215,foam:1.8}
  });
  const TYPES=Object.freeze({
    bottle:{name:'封口艾尔',weight:1,cups:2,cash:0,hops:0,color:'#e9bd70'},
    hops:{name:'密封酒花',weight:1,cups:0,cash:0,hops:1,color:'#9ac8a5'},
    barrel:{name:'滚动酒桶',weight:3,cups:4,cash:0,hops:0,color:'#cf955e'},
    salvage:{name:'可修零件',weight:1,cups:0,cash:5,hops:0,color:'#81bcc8'},
    parcel:{name:'“进口酵母” / 月雾',weight:3,cups:0,cash:0,hops:0,color:'#da8fbc'}
  });
  const ZONES=Object.freeze([
    {id:'market',name:'超市后场',sub:'退货也要排队，货不会。',x:80,y:780,w:690,h:500,color:'#577073'},
    {id:'redlight',name:'红灯运河街',sub:'有人来找刺激，有人刚下班。',x:80,y:100,w:690,h:500,color:'#7d465f'},
    {id:'club',name:'NO SIGNAL 夜店',sub:'没有信号，仍然可以扫码付款。',x:960,y:700,w:555,h:580,color:'#655781'},
    {id:'sorting',name:'失物分拣场',sub:'请证明这不是你自愿丢的。',x:1590,y:730,w:520,h:550,color:'#65717b'},
    {id:'greenhouse',name:'玻璃后的房间',sub:'城市上面，居然有人种薄荷。',x:1630,y:190,w:470,h:370,color:'#789780'}
  ]);
  const WALLS=Object.freeze([
    {x:110,y:140,w:630,h:100,kind:'windows'},
    {x:120,y:450,w:250,h:120,kind:'house'},
    {x:300,y:860,w:200,h:80,kind:'shelf'},
    {x:580,y:890,w:135,h:110,kind:'shelf'},
    {x:280,y:1230,w:430,h:65,kind:'shop'},
    {x:970,y:705,w:540,h:85,kind:'club'},
    {x:1020,y:880,w:75,h:110,kind:'speaker'},
    {x:1390,y:940,w:85,h:120,kind:'speaker'},
    {x:1010,y:1190,w:400,h:60,kind:'bar'},
    {x:1640,y:920,w:285,h:50,kind:'conveyor'},
    {x:1690,y:1100,w:300,h:60,kind:'conveyor'},
    {x:1620,y:180,w:25,h:382,kind:'glass'},
    {x:2080,y:180,w:25,h:382,kind:'glass'},
    {x:1620,y:180,w:485,h:25,kind:'glass'},
    {x:1620,y:540,w:150,h:22,kind:'glass'},
    {x:1880,y:540,w:225,h:22,kind:'glass'},
    {x:1710,y:290,w:110,h:65,kind:'plants'},
    {x:1890,y:360,w:95,h:70,kind:'plants'},
    {x:80,y:640,w:510,h:70,kind:'water'},
    {x:710,y:640,w:90,h:70,kind:'water'}
  ]);
  const STREETS=Object.freeze({
    delivery:{id:'delivery',title:'夜间补货',description:'超市卸货占了巷子，清洁车照常上班。',hint:'货堆堵住近路；从南侧绕行，空桶可以挡住清洁车。',walls:[{x:500,y:1060,w:175,h:65,kind:'delivery'}]},
    works:{id:'works',title:'运河抢修',description:'市政围起了夹道。牌子写着：预计昨天完工。',hint:'中间通路封了一段，留意围挡上下两头的出口。',walls:[{x:790,y:890,w:190,h:70,kind:'works'}]},
    closing:{id:'closing',title:'夜店散场',description:'人群还没散，门口先开始排明天的队。',hint:'南门多了排队栏和散场客；空瓶能把守卫引离冷藏箱。',walls:[{x:1070,y:1100,w:80,h:26,kind:'closing'}]},
    legacy:{id:'legacy',title:'熟悉的夜路',description:'继续上次出门的路线。',hint:'这一趟保留原来的街道；下次出门会遇到新的局势。',walls:[]}
  });
  const MARKET_ROOMS=Object.freeze([
    {id:'market-stock',label:'退货货架',x:280,y:820,w:270,h:215,color:'#456562'},
    {id:'market-cold',label:'冷库',x:550,y:820,w:210,h:215,color:'#486e86'},
    {id:'market-unloading',label:'卸货通道',x:280,y:1053,w:480,h:167,color:'#746957'}
  ]);
  const MARKET_WALLS=Object.freeze([
    {x:270,y:800,w:502,h:18,kind:'market-wall'},
    {x:760,y:818,w:12,h:242,kind:'market-wall'},
    {x:760,y:1150,w:12,h:70,kind:'market-wall'},
    {x:550,y:1035,w:160,h:18,kind:'cold-wall'}
  ]);
  const MARKET_DOOR=Object.freeze({id:'market-shortcut',x:760,y:1060,w:12,h:90});
  const MARKET_POINTS=Object.freeze({entry:{x:405,y:1085},stock:{x:405,y:990},cold:{x:740,y:850},shortcut:{x:735,y:1105}});
  const OUTCOMES=['market-salvaged','market-shortcut','club-backstage','sorting-stopped','sorting-reversed','greenhouse-valve','greenhouse-repaired'];
  const BELT=Object.freeze({x:1690,y:990,w:280,h:80}),SWITCH=Object.freeze({x:1600,y:890});
  const WATER=Object.freeze({x:1840,y:440,w:200,h:75}),VALVE=Object.freeze({x:1680,y:470});
  const locations=r=>r.version>=3&&Boolean(r.location);
  const districts=r=>r.version>=4&&Boolean(r.district);
  const inside=(o,rect)=>o.x>=rect.x&&o.x<=rect.x+rect.w&&o.y>=rect.y&&o.y<=rect.y+rect.h;
  const beltSpeed=r=>r.district.belt==='east'?60:r.district.belt==='west'?-60:0;
  const wetGround=r=>districts(r)&&r.time%10<6&&r.district.irrigation===0&&!r.district.repaired;
  const musicLoud=r=>locations(r)&&r.time%12>=6;
  const inClub=o=>o.x>=960&&o.x<=1515&&o.y>=790&&o.y<=1280;
  function outcome(r,id){if(locations(r)&&!r.location.outcomes.includes(id))r.location.outcomes.push(id);}
  function locationInfo(r){
    if(!locations(r))return {enabled:false,rooms:[],walls:[],door:null,market:null,club:null};
    const loud=musicLoud(r),phase=r.time%12;
    return {enabled:true,rooms:MARKET_ROOMS,walls:MARKET_WALLS,
      door:{...MARKET_DOOR,open:r.location.marketOpen,label:r.location.marketOpen?'卸货捷径 · 已打开':'卸货卷门 · 内侧开关',interact:MARKET_POINTS.shortcut},
      market:{...MARKET_POINTS,label:'超市内场',clued:r.location.clues.includes('market'),shortcutOpen:r.location.marketOpen},
      club:{label:'NO SIGNAL 夜店',clued:r.location.clues.includes('club'),phase:loud?'loud':'quiet',loud,remaining:(loud?12:6)-phase,cycle:12,loudDuration:6,guardRange:loud?60:r.parcel==='carried'?290:95,hearingRange:loud?120:380,crowdLabel:loud?'人群向舞池聚拢':'散场客向走道散开'}};
  }
  function streetInfo(r){return STREETS[r.street?.situation]||STREETS.legacy;}
  function districtInfo(r){
    if(!districts(r))return {enabled:false};
    return {enabled:true,belt:{...BELT,direction:r.district.belt,speed:beltSpeed(r)},switch:{...SWITCH},water:{...WATER,wet:wetGround(r)},valve:{...VALVE},repaired:r.district.repaired,irrigation:r.district.irrigation};
  }
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
  function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  function note(r,text){r.message=text;r.sequence++;r.log.unshift(text);r.log.length=Math.min(5,r.log.length);}
  function create(seed=42,day=1,kit='hook',discoveries=[],context={clues:[]}){
    const random=rng((seed^Math.imul(day,2654435761))>>>0),items=[];
    const add=(kind,x,y,vx=0,vy=0)=>items.push({id:'item'+items.length,kind,x,y,vx,vy,state:'world',lock:0});
    add('bottle',320,1130);add('hops',405,1030);add('barrel',420,1120,55+random()*35,0);
    add('salvage',660,1180);add('bottle',610,540);add('hops',430,370);
    add('parcel',1230,1050);add('bottle',1300,875);add('salvage',1430,1130);
    add('barrel',1790,1020,random()>.5?72:-72,0);add('salvage',1920,1020);
    add('hops',1960,480);add('bottle',1840,440);
    for(let i=0;i<4;i++)add(i%2?'salvage':'bottle',850+random()*70,280+i*230);
    const actor=(id,type,x,y)=>({id,type,x,y,homeX:x,homeY:y,dir:random()>.5?1:-1,mode:'patrol',timer:0,vx:0,vy:0,stun:0});
    const situation=['delivery','works','closing'][((seed>>>0)+day-1)%3];
    const r={version:4,location:{clues:[...new Set((context.clues||[]).filter(x=>['market','club','greenhouse'].includes(x)))],marketOpen:discoveries.includes('market-shortcut'),outcomes:[]},district:{belt:'east',irrigation:0,repaired:discoveries.includes('greenhouse-pump'),visited:[]},seed:seed>>>0,day,kit:Object.hasOwn(KITS,kit)?kit:'hook',time:0,duration:180,status:'active',
      p:{x:EXIT.x,y:EXIT.y,fx:1,fy:0,hp:3,inv:0,dash:0,hook:0,foam:0},items,
      actors:[actor('cleaner1','cleaner',680,1090),actor('guard','guard',1330,1000),actor('cleaner2','cleaner',1840,840),actor('gull','gull',730,480),...Array.from({length:5},(_,i)=>actor('dancer'+i,'dancer',1130+(i%3)*70,905+Math.floor(i/3)*180))],
      street:{situation,baits:3,lureCooldown:0,noise:null,barrels:[{id:'street-market',x:500,y:1160},{id:'street-club',x:1230,y:1100}],dragging:null},
      bag:[],discovered:[...new Set(discoveries.filter(x=>['greenhouse','noor','market-shortcut','greenhouse-pump'].includes(x)))],opened:discoveries.includes('greenhouse'),parcel:'ground',patches:[],fx:[],sequence:0,log:[],message:'去东边的夜店找冷藏箱。也可以先逛逛，回店口一直在身后。',hits:0};
    if(situation==='delivery')Object.assign(r.actors[0],{x:720,homeX:720});
    Object.assign(items[0],MARKET_POINTS.stock);Object.assign(items[1],MARKET_POINTS.cold);
    r.actors.filter(a=>a.type==='dancer').forEach((a,i)=>{const x=i<3?1170+i*80:i===3?1170:1340,y=i<3?880:1080;Object.assign(a,{x,y,homeX:x,homeY:y});});
    return r;
  }
  function solid(r,x,y,radius=13,ignore=null){
    if(x<50+radius||x>WIDTH-50-radius||y<70+radius||y>HEIGHT-70-radius)return true;
    return [...WALLS,...streetInfo(r).walls,...(locations(r)?MARKET_WALLS:[]),...(locations(r)&&!r.location.marketOpen?[MARKET_DOOR]:[]),...(r.opened?[]:[GATE])].some(w=>x+radius>w.x&&x-radius<w.x+w.w&&y+radius>w.y&&y-radius<w.y+w.h)||(r.street?.barrels||[]).some(b=>b.id!==ignore&&Math.hypot(x-b.x,y-b.y)<radius+22);
  }
  function clear(r,a,b,ignore=null){const n=Math.max(1,Math.ceil(distance(a,b)/8));for(let i=1;i<=n;i++)if(solid(r,a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,2,ignore))return false;return true;}
  function move(r,o,dx,dy,radius=13){
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));let hit=false;
    for(let i=0;i<steps;i++){
      if(!solid(r,o.x+dx/steps,o.y,radius,o.id))o.x+=dx/steps;else hit=true;
      if(!solid(r,o.x,o.y+dy/steps,radius,o.id))o.y+=dy/steps;else hit=true;
    }
    return hit;
  }
  function dragTarget(r){
    if(!r?.street)return null;
    if(r.street.dragging)return r.street.barrels.find(b=>b.id===r.street.dragging)||null;
    return r.street.barrels.filter(b=>distance(r.p,b)<=65&&clear(r,r.p,b,b.id)).sort((a,b)=>distance(r.p,a)-distance(r.p,b))[0]||null;
  }
  function walk(r,dx,dy){
    const barrel=r.street?.dragging?dragTarget(r):null,p=r.p;
    if(!barrel){move(r,p,dx,dy);return;}
    const before={x:p.x,y:p.y,bx:barrel.x,by:barrel.y};
    move(r,p,dx,dy);
    const d=distance(p,barrel);
    if(d>44)move(r,barrel,(p.x-barrel.x)/d*(d-44),(p.y-barrel.y)/d*(d-44),22);
    if(distance(p,barrel)>65||!clear(r,p,barrel,barrel.id)){
      p.x=before.x;p.y=before.y;barrel.x=before.bx;barrel.y=before.by;
    }
  }
  function load(r){return r.bag.reduce((n,id)=>n+TYPES[r.items.find(i=>i.id===id).kind].weight,0);}
  function zone(r){return ZONES.find(z=>r.p.x>=z.x&&r.p.x<=z.x+z.w&&r.p.y>=z.y&&r.p.y<=z.y+z.h)||{id:'street',name:'城市夹道',sub:'跟着灯走，也留意没有招牌的门。'};}
  function nearest(r){
    if(distance(r.p,EXIT)<78)return {id:'exit',label:'带着收获回酒馆 · E'};
    if(r.discovered.includes('greenhouse')&&distance(r.p,GARDEN_EXIT)<72)return {id:'garden-exit',label:'温室后门通向酒馆屋顶 · E 回家'};
    if(distance(r.p,NOOR)<76)return {id:'noor',label:r.parcel==='carried'?'把冷藏箱交给 Noor · E':'和 Noor 聊聊 · E'};
    if(locations(r)&&!r.location.marketOpen&&distance(r.p,MARKET_POINTS.shortcut)<65&&clear(r,r.p,MARKET_POINTS.shortcut))return {id:'market-shortcut',label:'打开卸货卷门 · E / 记住捷径'};
    if(districts(r)){
      if(distance(r.p,SWITCH)<=65&&clear(r,r.p,SWITCH))return {id:'conveyor-switch',label:'切换传送带开关 · E / 钩绳反转'};
      if(distance(r.p,VALVE)<=65&&clear(r,r.p,VALVE))return {id:'garden-valve',label:r.district.repaired?'灌溉泵已修好':'关闭喷淋 12 秒 · E / 零件修泵'};
    }
    const parcel=r.items.find(i=>i.kind==='parcel'&&i.state==='world'&&distance(r.p,i)<60&&(!locations(r)||clear(r,r.p,i)));
    if(parcel)return {id:parcel.id,label:'拿起冷藏箱 / 3 格 · E'};
    if(!r.opened&&distance(r.p,LEVER)<75)return {id:'lever',label:'拉开维护闸门 · E'};
    if(districts(r)){
      const item=r.items.filter(i=>collectable(r,i)).sort((a,b)=>distance(r.p,a)-distance(r.p,b))[0];
      if(item)return {id:item.id,label:'收好'+TYPES[item.kind].name+' · E'};
    }
    return null;
  }
  function aimAt(r,aim){
    if(aim&&finite(aim.x,-10000,10000)&&finite(aim.y,-10000,10000)){
      const d=Math.hypot(aim.x-r.p.x,aim.y-r.p.y);if(d>.001){r.p.fx=(aim.x-r.p.x)/d;r.p.fy=(aim.y-r.p.y)/d;}
    }
    return {x:r.p.fx,y:r.p.fy};
  }
  function stow(r,item){
    if(load(r)+TYPES[item.kind].weight>KITS[r.kit].capacity)return false;
    item.state='bag';r.bag.push(item.id);if(item.kind==='parcel'){r.parcel='carried';outcome(r,'club-backstage');}
    if(['item0','item1','item2','item3'].includes(item.id))outcome(r,'market-salvaged');
    note(r,item.kind==='parcel'?'箱里是虚构违禁品“月雾”。标签写着酵母，酵母没有这么多人关心。':'收好'+TYPES[item.kind].name+'。'+(item.kind==='barrel'?'整桶占 3 格；可以用 Q 扔下。':''));return true;
  }
  function collectable(r,item){return districts(r)&&item&&item.kind!=='parcel'&&item.state==='world'&&item.lock===0&&distance(r.p,item)<=45&&clear(r,r.p,item);}
  function closeValve(r){r.district.irrigation=12;outcome(r,'greenhouse-valve');note(r,'喷淋停下了。接下来 12 秒，地面不再湿滑。');}
  function finish(r,status){
    r.status=status;
    if(status!=='extracted'){
      const keep=status==='rescued'?Math.floor(r.bag.length/2):0;
      for(const id of r.bag.slice(keep)){const item=r.items.find(i=>i.id===id);item.state='lost';if(item.kind==='parcel')r.parcel='lost';}
      r.bag=r.bag.slice(0,keep);
    }
    note(r,status==='extracted'?'带着收获回到街面。酒馆的灯在等你。':status==='rescued'?'收班车把你送回街面，只保住半包收获。发现的地方还记得。':'轻装撤回，放弃本趟背包。家里的钱和库存都还在。');
  }
  function command(r,verb,aim){
    if(!r||r.status!=='active')return false;
    const p=r.p,dir=aimAt(r,aim);
    if(verb==='collect'){
      const item=r.items.find(i=>i.id===aim?.itemId);return Boolean(collectable(r,item)&&stow(r,item));
    }
    if(verb==='repair'){
      if(!districts(r)||r.district.repaired||distance(p,VALVE)>65||!clear(r,p,VALVE))return false;
      const item=r.items.find(i=>i.kind==='salvage'&&i.state==='bag'&&r.bag.includes(i.id));if(!item)return false;
      item.state='delivered';r.bag=r.bag.filter(id=>id!==item.id);r.district.repaired=true;
      if(!r.discovered.includes('greenhouse-pump'))r.discovered.push('greenhouse-pump');
      outcome(r,'greenhouse-repaired');note(r,'用一个零件修好了灌溉泵。以后来温室，脚下也不会再打滑。');return true;
    }
    if(verb==='bail'){finish(r,'bailed');return true;}
    if(verb==='dash'){
      if(r.street?.dragging){note(r,'先按 R 放下空桶，再闪避。');return false;}
      if(p.dash>0)return false;p.dash=.95;p.inv=Math.max(p.inv,.22);move(r,p,dir.x*110,dir.y*110);r.fx.push({kind:'dash',x:p.x,y:p.y,x2:p.x-dir.x*90,y2:p.y-dir.y*90,life:.3});return true;
    }
    if(verb==='drag'){
      if(!r.street)return false;
      if(r.street.dragging){r.street.dragging=null;note(r,'空桶放好了。机器撞上会停，自己也要绕过去。');return true;}
      const barrel=dragTarget(r);if(!barrel){note(r,'靠近街边空桶再按 R。');return false;}
      r.street.dragging=barrel.id;note(r,'拖住空桶了。移动慢一些，再按 R 放下；它不占背包。');return true;
    }
    if(verb==='lure'){
      const st=r.street;if(!st||st.baits<=0||st.lureCooldown>0)return false;
      const range=Math.min(240,aim&&finite(aim.x,-10000,10000)&&finite(aim.y,-10000,10000)?distance(p,aim):240);
      const noise={x:p.x,y:p.y,life:5};
      for(let d=8;d<=range;d+=8){const x=p.x+dir.x*d,y=p.y+dir.y*d;if(solid(r,x,y,5))break;noise.x=x;noise.y=y;}
      if(distance(p,noise)<8){note(r,'前面没有扔瓶子的空间。');return false;}
      st.baits--;st.lureCooldown=2;st.noise=noise;
      for(const a of r.actors)if(['guard','cleaner'].includes(a.type)&&distance(a,noise)<(musicLoud(r)&&inClub(a)&&inClub(noise)?120:380)&&clear(r,a,noise)){a.mode='investigate';a.timer=5;}
      note(r,musicLoud(r)&&inClub(noise)?'重拍盖住远处的碎瓶声。120 步内仍听得见；近身仍会被盯上。':'空瓶落地。附近机器和守卫去查声源；离得太近，仍会被盯上。');return true;
    }
    if(verb==='drop'){
      const selected=aim&&Object.hasOwn(aim,'itemId'),id=selected?aim.itemId:r.bag[r.bag.length-1];
      if(!r.bag.includes(id)){if(!selected)note(r,'背包还是空的。');return false;}
      r.bag.splice(r.bag.indexOf(id),1);
      const item=r.items.find(i=>i.id===id);Object.assign(item,{state:'world',x:p.x,y:p.y,vx:dir.x*420,vy:dir.y*420,lock:1.2});
      if(item.kind==='parcel')r.parcel='ground';note(r,'扔下'+TYPES[item.kind].name+'。空出 '+TYPES[item.kind].weight+' 格。');return true;
    }
    if(verb==='interact'){
      const near=nearest(r);if(!near){note(r,'靠近人物、冷藏箱、闸门或回店口，按 E。');return false;}
      if(near.id==='exit'||near.id==='garden-exit'){finish(r,'extracted');return true;}
      if(near.id==='market-shortcut'){r.location.marketOpen=true;if(!r.discovered.includes('market-shortcut'))r.discovered.push('market-shortcut');outcome(r,'market-shortcut');note(r,'卸货卷门升起来了。记住这个出口，明晚还能从这里进。');return true;}
      if(near.id==='lever'){r.opened=true;note(r,'维护闸门开了。里面好像有人种东西。');return true;}
      if(near.id==='conveyor-switch'){
        r.district.belt=r.district.belt==='off'?'east':'off';if(r.district.belt==='off')outcome(r,'sorting-stopped');
        note(r,r.district.belt==='off'?'传送带停下了。再按 E 向东运行，钩绳可以反转。':'传送带开始向东运行。');return true;
      }
      if(near.id==='garden-valve'){closeValve(r);return true;}
      if(near.id==='noor'){
        if(!r.discovered.includes('noor'))r.discovered.push('noor');
        if(r.parcel==='carried'){
          const item=r.items.find(i=>i.kind==='parcel');item.state='delivered';r.bag=r.bag.filter(id=>id!==item.id);r.parcel='returned';
          note(r,'Noor 收回月雾箱，答应付 €14 跑腿费：“酵母是老板写的。我只是来收拾他的烂摊子。”');
        }else note(r,r.parcel==='returned'?'Noor：“箱子已经收好了。下次营业去你店里，给我留杯来历正常的酒。”':'Noor：“夜店那箱‘酵母’是月雾。别倒进酒里。找到了带来，东边温室的闸门也值得看看。”');
        return true;
      }
      const item=r.items.find(i=>i.id===near.id);if(!stow(r,item)){note(r,'背包空位不够。按 Q 扔下最后一件物品，或在背包里选择。');return false;}return true;
    }
    if(verb==='hook'){
      if(p.hook>0)return false;p.hook=.48;
      const range=KITS[r.kit].range,point={x:p.x+dir.x*range,y:p.y+dir.y*range};
      let target=null,best=range+1;
      const targets=[...r.items.filter(i=>i.state==='world'),...r.actors.filter(a=>a.type!=='dancer'),...(!r.opened?[{...LEVER,id:'lever'}]:[]),...(districts(r)?[{...SWITCH,id:'conveyor-switch'},{...VALVE,id:'garden-valve'}]:[])];
      for(const o of targets){const dx=o.x-p.x,dy=o.y-p.y,d=distance(p,o),along=dx*dir.x+dy*dir.y;
        if(along>0&&d<=range&&Math.abs(dx*dir.y-dy*dir.x)<30&&d<best&&clear(r,p,o)){target=o;best=d;}}
      if(target){
        point.x=target.x;point.y=target.y;
        if(target.id==='lever'){r.opened=true;note(r,'钩绳拉开了维护闸门。去看看玻璃后面。');}
        else if(target.id==='conveyor-switch'){r.district.belt=r.district.belt==='west'?'east':'west';outcome(r,'sorting-reversed');note(r,'钩绳扳动了开关，传送带反转了。');}
        else if(target.id==='garden-valve')closeValve(r);
        else if(target.type){target.stun=1.2;target.mode='patrol';move(r,target,dir.x*-45,dir.y*-45);note(r,target.type==='gull'?'鸟松开了爪子，零件掉在附近。':'钩住了它的底盘。趁现在通过。');}
        else{target.vx=-dir.x*550;target.vy=-dir.y*550;target.lock=0;}
      }
      // The visible line stops at the same wall as the tool.
      const length=distance(p,point);for(let d=8;d<length;d+=8)if(solid(r,p.x+dir.x*d,p.y+dir.y*d,2)){point.x=p.x+dir.x*d;point.y=p.y+dir.y*d;break;}
      r.fx.push({kind:'hook',x:p.x,y:p.y,x2:point.x,y2:point.y,life:.22});return true;
    }
    if(verb==='foam'){
      if(p.foam>0)return false;p.foam=KITS[r.kit].foam;
      const center={x:p.x,y:p.y};move(r,center,dir.x*80,dir.y*80,5);
      r.patches.push({...center,life:4});
      for(const a of r.actors)if(a.type!=='dancer'&&distance(a,center)<125&&clear(r,p,a)){a.stun=3;a.mode='patrol';}
      note(r,'泡沫让机器暂时失灵。湿滑地面也会带偏自己的脚步。');return true;
    }
    return false;
  }
  function hit(r,actor){
    if(r.p.inv>0)return;
    r.p.hp--;r.hits++;r.p.inv=2;
    const d=Math.max(1,distance(r.p,actor));move(r,r.p,(r.p.x-actor.x)/d*55,(r.p.y-actor.y)/d*55);
    if(r.bag.length)command(r,'drop',{x:r.p.x+60,y:r.p.y+20});
    note(r,'被撞得踉跄了一下，东西还能追回来。Space 闪避，F 泡沫可以打断它。');
    if(r.p.hp<=0)finish(r,'rescued');
  }
  function step(r,input={},seconds=0){
    if(!r||r.status!=='active'||!finite(seconds,0,1)||(r.auto?.enabled&&r.auto.event))return;
    let remain=Math.min(seconds,.1);
    while(remain>1e-8){const dt=Math.min(remain,.025);remain-=dt;r.time=Math.min(r.duration,r.time+dt);
      if(districts(r))r.district.irrigation=Math.max(0,r.district.irrigation-dt);
      if(r.street){r.street.lureCooldown=Math.max(0,r.street.lureCooldown-dt);if(r.street.noise){r.street.noise.life-=dt;if(r.street.noise.life<=0)r.street.noise=null;}}
      const p=r.p;for(const key of ['inv','dash','hook','foam'])p[key]=Math.max(0,p[key]-dt);
      const dx=clamp(Number(input.dx)||0,-1,1),dy=clamp(Number(input.dy)||0,-1,1),n=Math.hypot(dx,dy);
      if(input.aim)aimAt(r,input.aim);else if(n){p.fx=dx/n;p.fy=dy/n;}
      const wet=wetGround(r)&&inside(p,WATER),slick=wet||r.patches.some(a=>distance(p,a)<85),speed=KITS[r.kit].speed*(1-load(r)*.018)*(r.street?.dragging ? .55 : 1)*(wet?.65:1);
      if(n)walk(r,dx/n*speed*dt+(slick?25*dt:0),dy/n*speed*dt+(slick?16*dt:0));
      if(districts(r)&&inside(p,BELT)&&!r.patches.some(a=>distance(p,a)<85))walk(r,beltSpeed(r)*dt,0);
      r.patches=r.patches.map(a=>({...a,life:a.life-dt})).filter(a=>a.life>0);
      r.fx=r.fx.map(a=>({...a,life:a.life-dt})).filter(a=>a.life>0);
      for(const item of r.items){
        if(item.state!=='world')continue;item.lock=Math.max(0,item.lock-dt);
        if(move(r,item,item.vx*dt,item.vy*dt,8)){item.vx*=-.65;item.vy*=-.65;}
        if(districts(r)&&inside(item,BELT)&&!r.patches.some(a=>distance(item,a)<85))move(r,item,beltSpeed(r)*dt,0,8);
        if(item.kind!=='barrel'||Math.hypot(item.vx,item.vy)>105){item.vx*=Math.exp(-3.5*dt);item.vy*=Math.exp(-3.5*dt);}
        if(item.kind!=='parcel'&&item.lock===0&&distance(p,item)<31&&(!districts(r)||clear(r,p,item)))stow(r,item);
      }
      for(const a of r.actors){
        if(a.stun>0){a.stun=Math.max(0,a.stun-dt);continue;}
        if(a.type==='dancer'){
          if(locations(r)){
            const loud=musicLoud(r),x=a.homeX+Math.sin(r.time*1.3+a.homeY)*25+(loud?0:35),y=a.homeY+Math.cos(r.time+a.homeX)*20+(loud?-25:25);
            move(r,a,clamp(x-a.x,-55*dt,55*dt),clamp(y-a.y,-55*dt,55*dt),13);
          }else{a.x=a.homeX+Math.sin(r.time*1.3+a.homeY)*35;a.y=a.homeY+Math.cos(r.time+a.homeX)*30;}if(distance(p,a)<28)move(r,p,(p.x-a.x)*dt*3,(p.y-a.y)*dt*3);continue;}
        if(a.type==='gull'){
          a.x=a.homeX+Math.sin(r.time*.5)*105;a.y=a.homeY+Math.cos(r.time*.7)*50;
          const loose=r.items.find(i=>i.kind==='salvage'&&i.state==='world'&&distance(i,a)<65);
          if(loose){loose.x=a.x;loose.y=a.y+15;}continue;
        }
        if(r.patches.some(f=>distance(a,f)<85)){a.stun=1;a.mode='patrol';continue;}
        const near=distance(a,p),sees=near<(a.type==='guard'?musicLoud(r)&&inClub(a)&&inClub(p)?60:r.parcel==='carried'?290:95:175)&&clear(r,a,p);
        if(a.mode==='investigate'){
          a.timer-=dt;
          if(near<45&&clear(r,a,p)){a.mode='windup';a.timer=.8;}
          else if(!r.street?.noise||a.timer<=0){a.mode='patrol';}
          else{const noise=r.street.noise,d=distance(a,noise);if(d>12)move(r,a,(noise.x-a.x)/d*95*dt,(noise.y-a.y)/d*95*dt,16);}
        }else if(a.mode==='windup'){
          a.timer-=dt;if(a.timer<=0){a.mode='charge';a.timer=.65;const d=Math.max(1,near);a.vx=(p.x-a.x)/d*380;a.vy=(p.y-a.y)/d*380;}
        }else if(a.mode==='charge'){
          a.timer-=dt;const blocked=move(r,a,a.vx*dt,a.vy*dt,16);if(distance(a,p)<35)hit(r,a);
          if(a.timer<=0||blocked){a.mode='patrol';a.stun=1.4;}
        }else if(sees){a.mode='windup';a.timer=.8;}
        else{const direction=a.type==='guard'?0:a.dir;if(move(r,a,direction*48*dt,a.type==='guard'?a.dir*42*dt:0,16)||Math.abs(a.x-a.homeX)>130||Math.abs(a.y-a.homeY)>105)a.dir*=-1;}
      }
      if(r.street?.dragging){const barrel=dragTarget(r);if(distance(p,barrel)>65||!clear(r,p,barrel,barrel.id))r.street.dragging=null;}
      if(districts(r)){const id=zone(r).id;if(id!=='street'&&!r.district.visited.includes(id))r.district.visited.push(id);}
      if(p.x>1645&&p.x<2080&&p.y>205&&p.y<530&&!r.discovered.includes('greenhouse')){
        r.discovered.push('greenhouse');note(r,'发现温室捷径。明天这里仍然开着；有人把整座城市的噪声留在玻璃外。');
      }
      if(r.time>=r.duration&&r.status==='active')finish(r,'rescued');
      if(r.status!=='active')break;
    }
  }
  function rewards(r){
    if(!r||r.status==='active')return null;
    const result={cups:0,hops:0,cash:r.parcel==='returned'?14:0,parcel:r.parcel==='carried'?'kept':r.parcel,discovered:[...r.discovered],status:r.status,outcomes:locations(r)?[...r.location.outcomes]:[],visited:districts(r)?[...r.district.visited]:[]};
    for(const id of r.bag){const type=TYPES[r.items.find(i=>i.id===id).kind];result.cups+=type.cups;result.hops+=type.hops;result.cash+=type.cash;}
    return result;
  }
  function restore(value){
    try{
      const r=JSON.parse(JSON.stringify(value));
      if(!r||![1,2,3,4].includes(r.version)||!Number.isInteger(r.seed)||!finite(r.seed,0,4294967295)||!Number.isInteger(r.day)||!finite(r.day,1,3)||!Object.hasOwn(KITS,r.kit)||r.duration!==180||!finite(r.time,0,180)||!['active','extracted','bailed','rescued'].includes(r.status))return null;
      if(!r.p||!['x','y','fx','fy','hp','inv','dash','hook','foam'].every(k=>finite(r.p[k],k==='fx'||k==='fy'?-1:0,k==='x'?WIDTH:k==='y'?HEIGHT:k==='fx'||k==='fy'?1:10)))return null;
      if(!Array.isArray(r.items)||r.items.length!==17||!r.items.every((i,n)=>i.id==='item'+n&&Object.hasOwn(TYPES,i.kind)&&finite(i.x,0,WIDTH)&&finite(i.y,0,HEIGHT)&&finite(i.vx,-1000,1000)&&finite(i.vy,-1000,1000)&&finite(i.lock,0,2)&&['world','bag','delivered','lost'].includes(i.state)))return null;
      const template=create(r.seed,r.day,r.kit,[]);if(r.items.some((i,n)=>i.kind!==template.items[n].kind))return null;
      if(!Array.isArray(r.bag)||new Set(r.bag).size!==r.bag.length||r.bag.some(id=>!r.items.some(i=>i.id===id&&i.state==='bag'))||r.items.filter(i=>i.state==='bag').length!==r.bag.length||load(r)>KITS[r.kit].capacity)return null;
      if(!Array.isArray(r.actors)||r.actors.length>9||new Set(r.actors.map(a=>a.id)).size!==r.actors.length||!r.actors.every(a=>template.actors.some(t=>t.id===a.id&&t.type===a.type)&&['patrol','windup','charge','investigate'].includes(a.mode)&&['x','y','homeX','homeY','dir','timer','vx','vy','stun'].every(k=>finite(a[k],-1000,3000))))return null;
      if(!Array.isArray(r.discovered)||r.discovered.length>(r.version>=4?4:3)||new Set(r.discovered).size!==r.discovered.length||!r.discovered.every(x=>['greenhouse','noor','market-shortcut',...(r.version>=4?['greenhouse-pump']:[])].includes(x))||typeof r.opened!=='boolean')return null;
      if(!['ground','carried','returned','lost'].includes(r.parcel))return null;
      const parcel=r.items.find(i=>i.kind==='parcel');if(parcel.state!==({ground:'world',carried:'bag',returned:'delivered',lost:'lost'})[r.parcel])return null;
      if(!Array.isArray(r.patches)||r.patches.length>5||!r.patches.every(f=>finite(f.x,0,WIDTH)&&finite(f.y,0,HEIGHT)&&finite(f.life,0,4)))return null;
      if(!Array.isArray(r.fx)||r.fx.length>12||!r.fx.every(f=>['dash','hook'].includes(f.kind)&&['x','y','x2','y2','life'].every(k=>finite(f[k],-1000,4000))))return null;
      if(!Number.isInteger(r.sequence)||!finite(r.sequence,0,10000)||!Number.isInteger(r.hits)||!finite(r.hits,0,3)||!Array.isArray(r.log)||r.log.length>5||!r.log.every(t=>typeof t==='string'&&t.length<500)||typeof r.message!=='string'||r.message.length>500)return null;
      if(r.status==='active'&&(r.time>=180||r.p.hp<=0))return null;
      if(r.version<4)delete r.district;
      else{
        const d=r.district;
        if(!d||Object.keys(d).length!==4||!['belt','irrigation','repaired','visited'].every(k=>Object.hasOwn(d,k))||!['east','west','off'].includes(d.belt)||!finite(d.irrigation,0,12)||typeof d.repaired!=='boolean'||!Array.isArray(d.visited)||d.visited.length>5||new Set(d.visited).size!==d.visited.length||!d.visited.every(id=>ZONES.some(z=>z.id===id)))return null;
        if(d.repaired!==r.discovered.includes('greenhouse-pump'))return null;
      }
      if(r.version<3)delete r.location;
      else{
        const l=r.location;
        const clues=r.version>=4?['market','club','greenhouse']:['market','club'],outcomes=r.version>=4?OUTCOMES:OUTCOMES.slice(0,3);
        if(!l||typeof l.marketOpen!=='boolean'||!Array.isArray(l.clues)||l.clues.length>clues.length||new Set(l.clues).size!==l.clues.length||!l.clues.every(x=>clues.includes(x))||!Array.isArray(l.outcomes)||l.outcomes.length>outcomes.length||new Set(l.outcomes).size!==l.outcomes.length||!l.outcomes.every(x=>outcomes.includes(x)))return null;
        if(l.marketOpen!==r.discovered.includes('market-shortcut')||(l.outcomes.includes('market-shortcut')&&!l.marketOpen))return null;
        if(l.outcomes.includes('greenhouse-repaired')&&!r.district?.repaired)return null;
      }
      if(r.version===1){r.version=2;r.street={situation:'legacy',baits:3,lureCooldown:0,noise:null,barrels:[],dragging:null};}
      const st=r.street;
      if(!st||!Object.hasOwn(STREETS,st.situation)||!Number.isInteger(st.baits)||!finite(st.baits,0,3)||!finite(st.lureCooldown,0,2))return null;
      if(st.noise!==null&&(!st.noise||!finite(st.noise.x,0,WIDTH)||!finite(st.noise.y,0,HEIGHT)||!finite(st.noise.life,0,5)))return null;
      if(!Array.isArray(st.barrels)||st.barrels.length!==(st.situation==='legacy'?0:2)||new Set(st.barrels.map(b=>b.id)).size!==st.barrels.length||!st.barrels.every(b=>['street-market','street-club'].includes(b.id)&&finite(b.x,72,WIDTH-72)&&finite(b.y,92,HEIGHT-92)))return null;
      if(st.barrels.some(b=>solid(r,b.x,b.y,22,b.id)))return null;
      if(st.noise&&solid({...r,street:{...st,barrels:[]}},st.noise.x,st.noise.y,5))return null;
      if(st.dragging!==null&&(!st.barrels.some(b=>b.id===st.dragging)||distance(r.p,st.barrels.find(b=>b.id===st.dragging))>65||!clear(r,r.p,st.barrels.find(b=>b.id===st.dragging),st.dragging)))return null;
      return r;
    }catch{return null;}
  }
  // Ambient route uses expedition time, so the worker also stops for choices and saves.
  function flowerCart(r){return {x:1100+Math.sin(r.time/7)*40,y:1030};}
  return Object.freeze({WIDTH,HEIGHT,EXIT,NOOR,LEVER,GARDEN_EXIT,GATE,KITS,TYPES,ZONES,WALLS,create,step,command,restore,rewards,load,zone,nearest,solid,clear,flowerCart,streetInfo,locationInfo,districtInfo,dragTarget});
});
