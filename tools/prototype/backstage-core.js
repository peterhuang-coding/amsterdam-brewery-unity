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
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
  function rng(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  function note(r,text){r.message=text;r.sequence++;r.log.unshift(text);r.log.length=Math.min(5,r.log.length);}
  function create(seed=42,day=1,kit='hook',discoveries=[]){
    const random=rng((seed^Math.imul(day,2654435761))>>>0),items=[];
    const add=(kind,x,y,vx=0,vy=0)=>items.push({id:'item'+items.length,kind,x,y,vx,vy,state:'world',lock:0});
    add('bottle',320,1130);add('hops',405,1030);add('barrel',420,1120,55+random()*35,0);
    add('salvage',660,1180);add('bottle',610,540);add('hops',430,370);
    add('parcel',1230,1050);add('bottle',1300,875);add('salvage',1430,1130);
    add('barrel',1790,1020,random()>.5?72:-72,0);add('salvage',2000,1020);
    add('hops',1960,480);add('bottle',1840,440);
    for(let i=0;i<4;i++)add(i%2?'salvage':'bottle',850+random()*70,280+i*230);
    const actor=(id,type,x,y)=>({id,type,x,y,homeX:x,homeY:y,dir:random()>.5?1:-1,mode:'patrol',timer:0,vx:0,vy:0,stun:0});
    return {version:1,seed:seed>>>0,day,kit:Object.hasOwn(KITS,kit)?kit:'hook',time:0,duration:180,status:'active',
      p:{x:EXIT.x,y:EXIT.y,fx:1,fy:0,hp:3,inv:0,dash:0,hook:0,foam:0},items,
      actors:[actor('cleaner1','cleaner',680,1090),actor('guard','guard',1330,1000),actor('cleaner2','cleaner',1840,840),actor('gull','gull',730,480),...Array.from({length:5},(_,i)=>actor('dancer'+i,'dancer',1130+(i%3)*70,905+Math.floor(i/3)*180))],
      bag:[],discovered:discoveries.filter(x=>['greenhouse','noor'].includes(x)),opened:discoveries.includes('greenhouse'),parcel:'ground',patches:[],fx:[],sequence:0,log:[],message:'去东边的夜店找冷藏箱。也可以先逛逛，回店口一直在身后。',hits:0};
  }
  function solid(r,x,y,radius=13){
    if(x<50+radius||x>WIDTH-50-radius||y<70+radius||y>HEIGHT-70-radius)return true;
    return [...WALLS,...(r.opened?[]:[GATE])].some(w=>x+radius>w.x&&x-radius<w.x+w.w&&y+radius>w.y&&y-radius<w.y+w.h);
  }
  function clear(r,a,b){const n=Math.max(1,Math.ceil(distance(a,b)/8));for(let i=1;i<=n;i++)if(solid(r,a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,2))return false;return true;}
  function move(r,o,dx,dy,radius=13){
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));let hit=false;
    for(let i=0;i<steps;i++){
      if(!solid(r,o.x+dx/steps,o.y,radius))o.x+=dx/steps;else hit=true;
      if(!solid(r,o.x,o.y+dy/steps,radius))o.y+=dy/steps;else hit=true;
    }
    return hit;
  }
  function load(r){return r.bag.reduce((n,id)=>n+TYPES[r.items.find(i=>i.id===id).kind].weight,0);}
  function zone(r){return ZONES.find(z=>r.p.x>=z.x&&r.p.x<=z.x+z.w&&r.p.y>=z.y&&r.p.y<=z.y+z.h)||{id:'street',name:'城市夹道',sub:'跟着灯走，也留意没有招牌的门。'};}
  function nearest(r){
    if(distance(r.p,EXIT)<78)return {id:'exit',label:'带着收获回酒馆 · E'};
    if(r.discovered.includes('greenhouse')&&distance(r.p,GARDEN_EXIT)<72)return {id:'garden-exit',label:'温室后门通向酒馆屋顶 · E 回家'};
    if(distance(r.p,NOOR)<76)return {id:'noor',label:r.parcel==='carried'?'把冷藏箱交给 Noor · E':'和 Noor 聊聊 · E'};
    const parcel=r.items.find(i=>i.kind==='parcel'&&i.state==='world'&&distance(r.p,i)<60);
    if(parcel)return {id:parcel.id,label:'拿起冷藏箱 / 3 格 · E'};
    if(!r.opened&&distance(r.p,LEVER)<75)return {id:'lever',label:'拉开维护闸门 · E'};
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
    item.state='bag';r.bag.push(item.id);if(item.kind==='parcel')r.parcel='carried';
    note(r,item.kind==='parcel'?'箱里是虚构违禁品“月雾”。标签写着酵母，酵母没有这么多人关心。':'收好'+TYPES[item.kind].name+'。'+(item.kind==='barrel'?'整桶占 3 格；可以用 Q 扔下。':''));return true;
  }
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
    if(verb==='bail'){finish(r,'bailed');return true;}
    if(verb==='dash'){
      if(p.dash>0)return false;p.dash=.95;p.inv=Math.max(p.inv,.22);move(r,p,dir.x*110,dir.y*110);r.fx.push({kind:'dash',x:p.x,y:p.y,x2:p.x-dir.x*90,y2:p.y-dir.y*90,life:.3});return true;
    }
    if(verb==='drop'){
      const id=r.bag.pop();if(!id){note(r,'背包还是空的。');return false;}
      const item=r.items.find(i=>i.id===id);Object.assign(item,{state:'world',x:p.x,y:p.y,vx:dir.x*420,vy:dir.y*420,lock:1.2});
      if(item.kind==='parcel')r.parcel='ground';note(r,'扔下'+TYPES[item.kind].name+'。空出 '+TYPES[item.kind].weight+' 格。');return true;
    }
    if(verb==='interact'){
      const near=nearest(r);if(!near){note(r,'靠近人物、冷藏箱、闸门或回店口，按 E。');return false;}
      if(near.id==='exit'||near.id==='garden-exit'){finish(r,'extracted');return true;}
      if(near.id==='lever'){r.opened=true;note(r,'维护闸门开了。里面好像有人种东西。');return true;}
      if(near.id==='noor'){
        if(!r.discovered.includes('noor'))r.discovered.push('noor');
        if(r.parcel==='carried'){
          const item=r.items.find(i=>i.kind==='parcel');item.state='delivered';r.bag=r.bag.filter(id=>id!==item.id);r.parcel='returned';
          note(r,'Noor 收回月雾箱，答应付 €14 跑腿费：“酵母是老板写的。我只是来收拾他的烂摊子。”');
        }else note(r,r.parcel==='returned'?'Noor：“箱子已经收好了。下次营业去你店里，给我留杯来历正常的酒。”':'Noor：“夜店那箱‘酵母’是月雾。别倒进酒里。找到了带来，东边温室的闸门也值得看看。”');
        return true;
      }
      const item=r.items.find(i=>i.id===near.id);if(!stow(r,item)){note(r,'冷藏箱需要 3 格。按 Q 扔下背包里最后一件物品。');return false;}return true;
    }
    if(verb==='hook'){
      if(p.hook>0)return false;p.hook=.48;
      const range=KITS[r.kit].range,point={x:p.x+dir.x*range,y:p.y+dir.y*range};
      let target=null,best=range+1;
      const targets=[...r.items.filter(i=>i.state==='world'),...r.actors.filter(a=>a.type!=='dancer'),...(!r.opened?[{...LEVER,id:'lever'}]:[])];
      for(const o of targets){const dx=o.x-p.x,dy=o.y-p.y,d=distance(p,o),along=dx*dir.x+dy*dir.y;
        if(along>0&&d<=range&&Math.abs(dx*dir.y-dy*dir.x)<30&&d<best&&clear(r,p,o)){target=o;best=d;}}
      if(target){
        point.x=target.x;point.y=target.y;
        if(target.id==='lever'){r.opened=true;note(r,'钩绳拉开了维护闸门。去看看玻璃后面。');}
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
    if(!r||r.status!=='active'||!finite(seconds,0,1))return;
    let remain=Math.min(seconds,.1);
    while(remain>1e-8){const dt=Math.min(remain,.025);remain-=dt;r.time=Math.min(r.duration,r.time+dt);
      const p=r.p;for(const key of ['inv','dash','hook','foam'])p[key]=Math.max(0,p[key]-dt);
      const dx=clamp(Number(input.dx)||0,-1,1),dy=clamp(Number(input.dy)||0,-1,1),n=Math.hypot(dx,dy);
      if(input.aim)aimAt(r,input.aim);else if(n){p.fx=dx/n;p.fy=dy/n;}
      const slick=r.patches.some(a=>distance(p,a)<85),speed=KITS[r.kit].speed*(1-load(r)*.018);
      if(n)move(r,p,dx/n*speed*dt+(slick?25*dt:0),dy/n*speed*dt+(slick?16*dt:0));
      r.patches=r.patches.map(a=>({...a,life:a.life-dt})).filter(a=>a.life>0);
      r.fx=r.fx.map(a=>({...a,life:a.life-dt})).filter(a=>a.life>0);
      for(const item of r.items){
        if(item.state!=='world')continue;item.lock=Math.max(0,item.lock-dt);
        if(move(r,item,item.vx*dt,item.vy*dt,8)){item.vx*=-.65;item.vy*=-.65;}
        if(item.kind!=='barrel'||Math.hypot(item.vx,item.vy)>105){item.vx*=Math.exp(-3.5*dt);item.vy*=Math.exp(-3.5*dt);}
        if(item.kind!=='parcel'&&item.lock===0&&distance(p,item)<31)stow(r,item);
      }
      for(const a of r.actors){
        if(a.stun>0){a.stun=Math.max(0,a.stun-dt);continue;}
        if(a.type==='dancer'){a.x=a.homeX+Math.sin(r.time*1.3+a.homeY)*35;a.y=a.homeY+Math.cos(r.time+a.homeX)*30;if(distance(p,a)<28)move(r,p,(p.x-a.x)*dt*3,(p.y-a.y)*dt*3);continue;}
        if(a.type==='gull'){
          a.x=a.homeX+Math.sin(r.time*.5)*105;a.y=a.homeY+Math.cos(r.time*.7)*50;
          const loose=r.items.find(i=>i.kind==='salvage'&&i.state==='world'&&distance(i,a)<65);
          if(loose){loose.x=a.x;loose.y=a.y+15;}continue;
        }
        if(r.patches.some(f=>distance(a,f)<85)){a.stun=1;a.mode='patrol';continue;}
        const near=distance(a,p),sees=near<(a.type==='guard'?r.parcel==='carried'?290:95:175)&&clear(r,a,p);
        if(a.mode==='windup'){
          a.timer-=dt;if(a.timer<=0){a.mode='charge';a.timer=.65;const d=Math.max(1,near);a.vx=(p.x-a.x)/d*380;a.vy=(p.y-a.y)/d*380;}
        }else if(a.mode==='charge'){
          a.timer-=dt;const blocked=move(r,a,a.vx*dt,a.vy*dt,16);if(distance(a,p)<35)hit(r,a);
          if(a.timer<=0||blocked){a.mode='patrol';a.stun=1.4;}
        }else if(sees){a.mode='windup';a.timer=.8;}
        else{const direction=a.type==='guard'?0:a.dir;if(move(r,a,direction*48*dt,a.type==='guard'?a.dir*42*dt:0,16)||Math.abs(a.x-a.homeX)>130||Math.abs(a.y-a.homeY)>105)a.dir*=-1;}
      }
      if(p.x>1645&&p.x<2080&&p.y>205&&p.y<530&&!r.discovered.includes('greenhouse')){
        r.discovered.push('greenhouse');note(r,'发现温室捷径。明天这里仍然开着；有人把整座城市的噪声留在玻璃外。');
      }
      if(r.time>=r.duration&&r.status==='active')finish(r,'rescued');
      if(r.status!=='active')break;
    }
  }
  function rewards(r){
    if(!r||r.status==='active')return null;
    const result={cups:0,hops:0,cash:r.parcel==='returned'?14:0,parcel:r.parcel==='carried'?'kept':r.parcel,discovered:[...r.discovered],status:r.status};
    for(const id of r.bag){const type=TYPES[r.items.find(i=>i.id===id).kind];result.cups+=type.cups;result.hops+=type.hops;result.cash+=type.cash;}
    return result;
  }
  function restore(value){
    try{
      const r=JSON.parse(JSON.stringify(value));
      if(!r||r.version!==1||!Number.isInteger(r.seed)||!finite(r.seed,0,4294967295)||!Number.isInteger(r.day)||!finite(r.day,1,3)||!Object.hasOwn(KITS,r.kit)||r.duration!==180||!finite(r.time,0,180)||!['active','extracted','bailed','rescued'].includes(r.status))return null;
      if(!r.p||!['x','y','fx','fy','hp','inv','dash','hook','foam'].every(k=>finite(r.p[k],k==='fx'||k==='fy'?-1:0,k==='x'?WIDTH:k==='y'?HEIGHT:k==='fx'||k==='fy'?1:10)))return null;
      if(!Array.isArray(r.items)||r.items.length!==17||!r.items.every((i,n)=>i.id==='item'+n&&Object.hasOwn(TYPES,i.kind)&&finite(i.x,0,WIDTH)&&finite(i.y,0,HEIGHT)&&finite(i.vx,-1000,1000)&&finite(i.vy,-1000,1000)&&finite(i.lock,0,2)&&['world','bag','delivered','lost'].includes(i.state)))return null;
      const template=create(r.seed,r.day,r.kit,[]);if(r.items.some((i,n)=>i.kind!==template.items[n].kind))return null;
      if(!Array.isArray(r.bag)||new Set(r.bag).size!==r.bag.length||r.bag.some(id=>!r.items.some(i=>i.id===id&&i.state==='bag'))||r.items.filter(i=>i.state==='bag').length!==r.bag.length||load(r)>KITS[r.kit].capacity)return null;
      if(!Array.isArray(r.actors)||r.actors.length>9||new Set(r.actors.map(a=>a.id)).size!==r.actors.length||!r.actors.every(a=>template.actors.some(t=>t.id===a.id&&t.type===a.type)&&['patrol','windup','charge'].includes(a.mode)&&['x','y','homeX','homeY','dir','timer','vx','vy','stun'].every(k=>finite(a[k],-1000,3000))))return null;
      if(!Array.isArray(r.discovered)||r.discovered.length>2||new Set(r.discovered).size!==r.discovered.length||!r.discovered.every(x=>['greenhouse','noor'].includes(x))||typeof r.opened!=='boolean')return null;
      if(!['ground','carried','returned','lost'].includes(r.parcel))return null;
      const parcel=r.items.find(i=>i.kind==='parcel');if(parcel.state!==({ground:'world',carried:'bag',returned:'delivered',lost:'lost'})[r.parcel])return null;
      if(!Array.isArray(r.patches)||r.patches.length>5||!r.patches.every(f=>finite(f.x,0,WIDTH)&&finite(f.y,0,HEIGHT)&&finite(f.life,0,4)))return null;
      if(!Array.isArray(r.fx)||r.fx.length>12||!r.fx.every(f=>['dash','hook'].includes(f.kind)&&['x','y','x2','y2','life'].every(k=>finite(f[k],-1000,4000))))return null;
      if(!Number.isInteger(r.sequence)||!finite(r.sequence,0,10000)||!Number.isInteger(r.hits)||!finite(r.hits,0,3)||!Array.isArray(r.log)||r.log.length>5||!r.log.every(t=>typeof t==='string'&&t.length<500)||typeof r.message!=='string'||r.message.length>500)return null;
      if(r.status==='active'&&(r.time>=180||r.p.hp<=0))return null;
      return r;
    }catch{return null;}
  }
  // Ambient route uses expedition time, so the worker also stops for choices and saves.
  function flowerCart(r){return {x:1100+Math.sin(r.time/7)*40,y:1030};}
  return Object.freeze({WIDTH,HEIGHT,EXIT,NOOR,LEVER,GARDEN_EXIT,GATE,KITS,TYPES,ZONES,WALLS,create,step,command,restore,rewards,load,zone,nearest,solid,clear,flowerCart});
});
