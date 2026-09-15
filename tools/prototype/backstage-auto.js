(function(root,factory){
  'use strict';const api=factory(typeof module==='object'&&module.exports?require('./backstage-core.js'):root.Backstage);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BackstageAuto=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(B){
  'use strict';
  const GOALS=['market','club','parcel','noor','gate','garden','sorting','exit','barricade'];
  const EVENTS=['route','market','club','parcel','noor','gate','garden','sorting','capacity','stuck','glimpse'];
  const NAMES={barricade:'后门摆放空桶的位置',market:'超市后场',club:'夜店后门',parcel:'冷藏箱',noor:'红灯街的 Noor',gate:'温室维护闸门',garden:'玻璃后的温室',sorting:'失物分拣场',exit:'回酒馆的出口'};
  const routes=new WeakMap(),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const option=(id,label,detail)=>({id,label,detail});
  const destination=id=>option(id,({market:'先去超市捡点货',club:'去夜店找冷藏箱',noor:'去找 Noor',garden:'看看玻璃后面的灯',sorting:'去失物分拣场看看',exit:'带着收获回家'})[id],({market:'封口酒与酒花 · 路近，收获直接入包',club:'箱子占 3 格 · 有保安，拿不拿由你决定',noor:'先听她说 · 交还箱子前会再问你',garden:'新空间与回家捷径 · 路更远',sorting:'可修零件 · 清扫机还在加班',exit:'自动走到出口，安全撤离才会结算'})[id]);
  function enable(r){
    if(!r||r.status!=='active')return false;
    r.auto={enabled:true,goal:null,event:'route',visited:r.auto?.visited||[],history:r.auto?.history||[],speed:r.auto?.speed||1,approach:'foam',legTime:0};routes.delete(r);return true;
  }
  function disable(r){if(!r?.auto)return;r.auto.enabled=false;r.auto.goal=null;r.auto.event=null;routes.delete(r);}
  function valid(r){
    if(r.auto===undefined)return true;const a=r.auto;
    return a&&Object.keys(a).length===8&&typeof a.enabled==='boolean'&&[null,...GOALS].includes(a.goal)&&[null,...EVENTS].includes(a.event)&&
      [1,2].includes(a.speed)&&['foam','hook','lure','barrel'].includes(a.approach)&&Number.isFinite(a.legTime)&&a.legTime>=0&&a.legTime<=45&&
      Array.isArray(a.visited)&&a.visited.length<=GOALS.length+1&&new Set(a.visited).size===a.visited.length&&a.visited.every(x=>[...GOALS,'glimpse'].includes(x))&&
      Array.isArray(a.history)&&a.history.length<=12&&a.history.every(x=>typeof x==='string'&&x.length<=80)&&
      (a.event==='glimpse'?Boolean(a.goal):!(a.goal&&a.event))&&(!a.enabled||r.status!=='active'||Boolean(a.goal||a.event));
  }
  function view(r){
    const a=r.auto;if(!a?.enabled)return null;
    if(a.event==='glimpse')return {title:'等一下，那辆花车去哪儿？',copy:'搬花工推着空车走过。车轮上有泥，车头朝着东北亮灯的温室。你原本要去'+NAMES[a.goal]+'，要不要顺着花车的方向拐个弯？',choices:[option('continue','继续去'+NAMES[a.goal],'记住刚才的方向，沿原路线继续'),destination('garden')]};
    if(!a.event)return {title:'正在前往'+NAMES[a.goal],copy:'角色自动走路、收取沿途普通货物，并用工具应对机器。到地方后，重要的事留给你决定。',choices:[]};
    const intro={route:['这条街，先从哪里开始？','腿脚交给我。碰到麻烦和好奇的事，你来拿主意。'],market:['货拿到了，还想往哪走？','超市把这些叫“库存优化”。今晚我们把它叫酒。'],club:['箱子旁边，有个不太困的保安。','标签写着“进口酵母”。酵母通常不配私人保安。'],parcel:['箱子在包里。接下来呢？','月雾占了 3 格。交还 Noor，或者带回去，下次营业会遇到不同的人。'],noor:[r.parcel==='carried'?'Noor 看见了你手里的箱子。':r.parcel==='returned'?'“下次营业到你店里再聊。”':'Noor 刚下夜班。',r.parcel==='carried'?'“标签是老板写的。我只是来收拾他的烂摊子。”交还可得 €14 跑腿费。':r.parcel==='returned'?'她收回箱子，答应付 €14。东北温室还亮着灯。':'“夜店有箱月雾，写着酵母。真找到了，先别发明新酒款。”'],gate:['玻璃后面，居然是绿色的。','维护闸门还关着。拉杆上写着：非工作人员请成为工作人员。'],garden:['这里有人种薄荷，也给你留了门。','温室捷径已记住。后门通向酒馆屋顶，现在回去能带走全部收获。'],sorting:['失物没有消失，只是换了部门。','拿得走的零件可以修。清扫机只关心这里看起来是不是少了点东西。'],capacity:['箱子需要 3 格，背包装不下了。','你来决定要放下什么。已经拿到的东西不会被悄悄丢掉。'],stuck:['这条路暂时不好走。','先停在这里。可以换个目的地，或切回手动处理眼前的状况。']};
    let choices;
    switch(a.event){
      case 'route':choices=['market',r.parcel==='ground'?'club':'sorting','noor'].map(destination);break;
      case 'market':choices=[r.parcel==='ground'?'club':'garden','noor','exit'].map(destination);break;
      case 'club':choices=[...(r.street?.situation!=='legacy'&&r.street?.baits>0&&r.street.lureCooldown===0?[option('take-lure','扔空瓶引开保安，绕过去取箱','消耗 1 瓶 · 声源持续 5 秒，靠得太近仍有危险')]:[]),...(B.dragTarget(r)?[option('take-barrel','先摆空桶，再绕过去取箱','拖到后门留一道屏障 · 空桶也会挡住自己的路')]:[]),option('take-foam','拿箱子，用泡沫掩护','自动靠近并拾取 · 占 3 格，泡沫打断保安'),option('take-hook','用钩索把箱子拉过来','先尝试从远处钩取 · 占 3 格'),option('noor','先不碰，去找 Noor','离开箱子，听听她知道什么')];break;
      case 'parcel':choices=['noor','garden','exit'].map(destination);break;
      case 'noor':choices=r.parcel==='carried'?[option('handover','把月雾箱交还 Noor','空出 3 格 · €14 跑腿费，下次营业她会来店里'),destination('garden'),destination('exit')]:[destination(r.parcel==='ground'?'club':'garden'),destination('sorting'),destination('exit')];break;
      case 'gate':choices=[option('open-hook','用钩索拉开闸门','打开通道，自动进入温室'),option('open-hand','走近拉开维护杆','打开通道，自动进入温室'),destination('exit')];break;
      case 'garden':choices=[option('exit','从温室后门回家','保住全部收获 · 捷径下次仍然开放'),destination('sorting'),destination(r.parcel==='ground'?'club':'noor')];break;
      case 'sorting':choices=['garden','noor','exit'].map(destination);break;
      case 'capacity':{const item=r.items.find(i=>i.id===r.bag.at(-1));choices=[option('drop-last','放下'+(item?B.TYPES[item.kind].name:'最后一件'),'向身后抛下 · 只放下这一件，够 3 格后继续拿箱子'),option('leave-box','保留现有收获，不拿箱子','箱子留在街区，重新选去处')];break;}
      default:choices=['noor','garden','exit'].map(destination);
    }
    return {title:intro[a.event][0],copy:intro[a.event][1],choices};
  }
  function stop(r,event){r.auto.event=event;r.auto.goal=null;r.auto.legTime=0;routes.delete(r);}
  function go(r,goal){r.auto.goal=goal==='garden'&&!r.opened?'gate':goal;r.auto.event=null;r.auto.legTime=0;routes.delete(r);}
  function take(r){
    if(B.load(r)+3>B.KITS[r.kit].capacity){stop(r,'capacity');return;}
    if(r.auto.approach==='lure'&&!B.command(r,'lure',{x:1320,y:1100})){stop(r,'club');return;}
    if(r.auto.approach==='barrel'){
      if(!r.street.dragging&&!B.command(r,'drag')){stop(r,'club');return;}
      go(r,'barricade');return;
    }
    go(r,'parcel');
  }
  function choose(r,id){
    if(!r||r.status!=='active'||!r.auto?.enabled||!r.auto.event)return false;
    const choice=view(r).choices.find(c=>c.id===id);if(!choice)return false;
    r.auto.history.push(choice.label);r.auto.history=r.auto.history.slice(-12);
    if(id==='continue'){r.auto.event=null;return true;}
    if(['take-foam','take-hook','take-lure','take-barrel','drop-last'].includes(id)){
      if(id==='drop-last')B.command(r,'drop',{x:r.p.x-100,y:r.p.y});else r.auto.approach=id.slice(5);
      take(r);return true;
    }
    if(id==='leave-box'){stop(r,'route');return true;}
    if(id==='handover'){B.command(r,'interact');stop(r,r.parcel==='returned'?'noor':'stuck');return true;}
    if(id==='open-hook'||id==='open-hand'){
      B.command(r,id==='open-hook'?'hook':'interact',B.LEVER);
      if(r.opened)go(r,'garden');else stop(r,'stuck');return true;
    }
    if(r.street?.dragging)B.command(r,'drag');
    go(r,id);return true;
  }
  function target(r){
    return ({barricade:{x:1270,y:1170},market:{x:405,y:1030},club:{x:1230,y:1135},parcel:r.items.find(i=>i.kind==='parcel'),noor:B.NOOR,gate:{x:B.LEVER.x,y:B.LEVER.y+55},garden:{x:1960,y:480},sorting:{x:2000,y:1020},exit:r.discovered.includes('greenhouse')&&dist(r.p,B.GARDEN_EXIT)<dist(r.p,B.EXIT)?B.GARDEN_EXIT:B.EXIT})[r.auto.goal];
  }
  // Navigation uses the same collision map and player radius as actual walking.
  function clearWalk(r,a,b){const n=Math.ceil(dist(a,b)/8);for(let i=0;i<=n;i++){const t=n?i/n:0;if(B.solid(r,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,15))return false;}return true;}
  function route(r,to){
    if(clearWalk(r,r.p,to))return [{x:to.x,y:to.y}];
    const grid=20,cols=B.WIDTH/grid,rows=B.HEIGHT/grid,point=id=>({x:id%cols*grid,y:Math.floor(id/cols)*grid});
    const start=Math.round(r.p.y/grid)*cols+Math.round(r.p.x/grid),end=Math.round(to.y/grid)*cols+Math.round(to.x/grid);
    const prev=new Int32Array(cols*rows).fill(-2),queue=[start];prev[start]=-1;
    for(let cursor=0;cursor<queue.length&&prev[end]===-2;cursor++){
      const id=queue[cursor],p=point(id);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=p.x/grid+dx,y=p.y/grid+dy;if(x<0||y<0||x>=cols||y>=rows)continue;
        const next=y*cols+x;if(prev[next]!==-2||B.solid(r,x*grid,y*grid,16))continue;
        prev[next]=id;queue.push(next);
      }
    }
    if(prev[end]===-2)return [];
    const path=[{x:to.x,y:to.y}];for(let id=end;id!==-1;id=prev[id])path.push(point(id));return path.reverse();
  }
  function arrived(r){
    const goal=r.auto.goal;if(!r.auto.visited.includes(goal))r.auto.visited.push(goal);
    if(goal==='barricade'){
      if(!r.street.dragging){stop(r,'stuck');return;}
      B.command(r,'drag');go(r,'parcel');return;
    }
    if(goal==='exit'){B.command(r,'interact');if(r.status==='active')stop(r,'stuck');return;}
    if(goal==='parcel'){
      if(r.parcel==='ground')B.command(r,'interact');
      stop(r,r.parcel==='carried'?'parcel':B.load(r)+3>B.KITS[r.kit].capacity?'capacity':'stuck');return;
    }
    if(goal==='noor'&&r.parcel!=='carried')B.command(r,'interact');
    stop(r,goal==='garden'?'garden':goal);
  }
  function tick(r,dt){
    const a=r.auto,to=target(r);
    if(a.goal==='club'&&r.parcel!=='ground'){stop(r,'route');return;}
    if(a.goal==='parcel'&&r.parcel!=='ground'){stop(r,r.parcel==='carried'?'parcel':'route');return;}
    if(dist(r.p,to)<(a.goal==='parcel'?35:a.goal==='barricade'?7:18)){arrived(r);return;}
    if(['noor','sorting'].includes(a.goal)&&a.legTime>.5&&!r.discovered.includes('greenhouse')&&!a.visited.includes('glimpse')&&dist(r.p,B.flowerCart(r))<150&&B.clear(r,r.p,B.flowerCart(r))){a.visited.push('glimpse');a.event='glimpse';return;}
    const threat=r.actors.filter(o=>['cleaner','guard'].includes(o.type)&&o.stun<=.1&&(a.approach!=='lure'||o.mode!=='investigate')&&dist(r.p,o)<185&&B.clear(r,r.p,o)).sort((x,y)=>dist(r.p,x)-dist(r.p,y))[0];
    if(threat){
      if(a.approach==='hook'&&r.p.hook===0)B.command(r,'hook',threat);
      else if(r.p.foam===0)B.command(r,'foam',threat);
      else if(r.p.hook===0)B.command(r,'hook',threat);
    }else if(a.goal==='parcel'&&a.approach==='hook'&&dist(r.p,to)<B.KITS[r.kit].range&&r.p.hook===0)B.command(r,'hook',to);
    let cached=routes.get(r);
    if(!cached||dist(cached.to,to)>25||cached.opened!==r.opened||!cached.path.length||!clearWalk(r,r.p,cached.path[0])){
      cached={path:route(r,to),to:{x:to.x,y:to.y},opened:r.opened};routes.set(r,cached);
    }
    const path=cached.path;
    while(path.length>1&&clearWalk(r,r.p,path[1]))path.shift();
    while(path.length>1&&dist(r.p,path[0])<10)path.shift();
    if(!path.length||a.legTime>40){stop(r,'stuck');return;}
    const point=path[0],length=Math.max(1,dist(r.p,point));B.step(r,{dx:(point.x-r.p.x)/length,dy:(point.y-r.p.y)/length},dt);a.legTime+=dt;
  }
  function step(r,seconds){
    if(!r?.auto?.enabled||r.auto.event||r.status!=='active'||!Number.isFinite(seconds)||seconds<=0)return;
    let remaining=Math.min(.1,seconds)*r.auto.speed;
    while(remaining>1e-8&&r.status==='active'&&!r.auto.event){const dt=Math.min(.025,remaining);remaining-=dt;tick(r,dt);}
  }
  return Object.freeze({enable,disable,choose,step,view,valid});
});
