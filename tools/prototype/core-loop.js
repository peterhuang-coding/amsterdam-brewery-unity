(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AmsterdamCoreLoop=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const PHASES=['上午','下午','晚上'];
  const ROUTES={
    fast:{id:'fast',name:'快熟小麦啤',icon:'⚡',cost:{malt:2,hops:1,yeast:1},qty:4,quality:2,flavor:'crisp',readyOffset:0,expiresOffset:2,description:'当天可卖，品质普通，能保住现金流'},
    slow:{id:'slow',name:'慢熟节庆艾尔',icon:'🛢️',cost:{malt:2,hops:2,yeast:1},qty:6,quality:4,flavor:'crisp',readyOffset:2,expiresOffset:4,description:'第 3 天成熟，高品质，但第 2 天必遇一次批次偏差'}
  };
  const DEVIATIONS=[
    {id:'sour',name:'酸度偏高',detail:'风味正在偏离节庆订单'},
    {id:'warm',name:'发酵升温',detail:'产量和稳定性不能同时保住'},
    {id:'weak',name:'酵母活性不足',detail:'需要决定是否延长处理'}
  ];
  const TRENDS=['crisp','wild','toasted'];

  function numberSeed(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.abs(Math.trunc(n))||42:42;
  }
  function seeded(seed,salt){
    const x=Math.sin((numberSeed(seed)+salt*9973)*12.9898)*43758.5453;
    return x-Math.floor(x);
  }
  function clone(value){return JSON.parse(JSON.stringify(value))}
  function log(state,kind,text){
    state.log.unshift({day:state.day,phase:PHASES[state.phase]||'结算',kind,text});
    state.log=state.log.slice(0,30);
  }
  function result(ok,message){return{ok,message}}
  function fresh(seed){
    const s={
      version:1,seed:numberSeed(seed),day:1,phase:0,ended:false,money:36,
      materials:{malt:4,hops:3,yeast:2},batches:[],nextBatch:1,
      attendance:0,classResolved:false,pendingRescue:null,
      order:{id:'kings-market',title:'周三运河节庆摊位',dueDay:3,duePhase:2,flavor:'crisp',minQuality:2,qty:4,reward:72,status:'open',relation:0,deliveredBatch:null},
      decisions:[],log:[],summary:null
    };
    log(s,'info','📣 已知目标：第 3 天晚上交付 4 份清爽型啤酒');
    log(s,'info','🎓 第 2 天下​​午有课程展示，学业只占用时间，不修改酿酒数值');
    return s;
  }
  function phaseLabel(state){return`Day ${state.day} · ${PHASES[state.phase]||'结算'}`}
  function trendForDay(state,day){return TRENDS[Math.floor(seeded(state.seed,300+day)*TRENDS.length)]}
  function currentTrend(state){return trendForDay(state,state.day)}
  function isReady(state,batch){return batch.readyDay<=state.day&&batch.qty>0}
  function isExpired(state,batch){return batch.expiresDay<state.day}
  function needsClassDecision(state){return state.day===2&&state.phase===1&&!state.classResolved}
  function guardNormalAction(state){
    if(state.ended)return result(false,'本局已经结束');
    if(state.pendingRescue)return result(false,'先处理批次偏差');
    if(needsClassDecision(state))return result(false,'先决定是否参加课程展示');
    return result(true,'');
  }
  function canPay(materials,cost){return Object.keys(cost).every(k=>(materials[k]||0)>=cost[k])}
  function spend(materials,cost){Object.keys(cost).forEach(k=>materials[k]-=cost[k])}
  function matureBatches(state){
    state.batches.forEach(batch=>{
      if(batch.qty>0&&!batch.announcedReady&&batch.readyDay<=state.day){
        batch.announcedReady=true;
        log(state,'good',`✅ ${batch.id} ${batch.name} 已成熟，可用于销售或交付`);
      }
      if(batch.qty>0&&!batch.announcedExpired&&batch.expiresDay<state.day){
        batch.announcedExpired=true;
        log(state,'bad',`🗑️ ${batch.id} 已过最佳售卖期`);
      }
    });
  }
  function triggerRescue(state){
    if(state.pendingRescue)return;
    const batch=state.batches.find(b=>b.route==='slow'&&!b.rescueResolved&&b.rescueDay<=state.day&&b.qty>0);
    if(!batch)return;
    const deviation=DEVIATIONS[Math.floor(seeded(state.seed,500+batch.serial)*DEVIATIONS.length)];
    batch.deviation=deviation.id;
    state.pendingRescue={batchId:batch.id,deviation};
    log(state,'warn',`⚠️ ${batch.id} 出现“${deviation.name}”：${deviation.detail}`);
  }
  function closeRun(state){
    if(state.ended)return;
    if(state.order.status==='open'){
      state.order.status='missed';state.order.relation=-2;
      log(state,'bad','⌛ 节庆订单到期：没有完成交付，常客关系 -2');
    }
    const school=state.attendance>0?'完成课程展示':'缺席课程展示';
    const order=state.order.status==='fulfilled'?'按约交付':state.order.status==='substituted'?'替代交付':'订单违约';
    const score=state.money+state.order.relation*10+state.attendance*8;
    state.summary={money:state.money,school,order,relation:state.order.relation,score,batches:state.batches.map(b=>({id:b.id,name:b.name,qty:b.qty,history:b.history.slice()}))};
    state.ended=true;
  }
  function advanceClock(state){
    state.phase++;
    if(state.phase>=PHASES.length){state.phase=0;state.day++}
    if(state.day>3){closeRun(state);return}
    matureBatches(state);
    triggerRescue(state);
  }
  function finishAction(state,kind,text){
    state.decisions.push({day:state.day,phase:PHASES[state.phase],kind,text});
    log(state,'info',text);
    advanceClock(state);
    return result(true,text);
  }
  function buySupplies(state){
    const guard=guardNormalAction(state);if(!guard.ok)return guard;
    if(state.money<8)return result(false,'现金不足，采购需要 $8');
    state.money-=8;state.materials.malt+=2;state.materials.hops+=1;state.materials.yeast+=1;
    return finishAction(state,'buy','🧺 采购原料 -$8：麦芽 +2、啤酒花 +1、酵母 +1');
  }
  function brew(state,routeId){
    const guard=guardNormalAction(state);if(!guard.ok)return guard;
    const route=ROUTES[routeId];if(!route)return result(false,'未知酿造路线');
    if(routeId==='slow'&&state.day>1)return result(false,'慢熟路线只能在第 1 天开始，才能赶上节庆');
    if(!canPay(state.materials,route.cost))return result(false,'原料不足，无法开始该路线');
    spend(state.materials,route.cost);
    const serial=state.nextBatch++;
    const batch={
      serial,id:`B${String(serial).padStart(2,'0')}`,route:route.id,name:route.name,
      qty:route.qty,quality:route.quality,flavor:route.flavor,source:'合法采购',
      brewedDay:state.day,readyDay:state.day+route.readyOffset,expiresDay:state.day+route.expiresOffset,
      rescueDay:route.id==='slow'?state.day+1:null,rescueResolved:route.id!=='slow',deviation:null,
      announcedReady:route.readyOffset===0,announcedExpired:false,
      history:[`Day ${state.day} ${PHASES[state.phase]}：选择${route.name}`]
    };
    state.batches.push(batch);
    return finishAction(state,'brew',`${route.icon} 创建 ${batch.id}：${route.name} · ${batch.qty} 份 · Day ${batch.readyDay} 成熟（酿酒本身不直接给钱）`);
  }
  function resolveRescue(state,choice){
    if(state.ended)return result(false,'本局已经结束');
    if(!state.pendingRescue)return result(false,'当前没有需要处理的批次偏差');
    const batch=state.batches.find(b=>b.id===state.pendingRescue.batchId);
    if(!batch)return result(false,'待处理批次不存在');
    if(choice==='preserve'){
      const loss=Math.min(2,Math.max(0,batch.qty-1));
      batch.qty-=loss;batch.quality=Math.min(5,batch.quality+1);
      batch.history.push(`Day ${state.day}：减量保质，损失 ${loss} 份，保留清爽风味`);
      log(state,'good',`🧪 ${batch.id} 减量保质：-${loss} 份，品质提升，仍可完成原订单`);
    }else if(choice==='pivot'){
      batch.flavor='wild';batch.readyDay=state.day;batch.expiresDay=state.day+1;
      batch.history.push(`Day ${state.day}：转向野性风味，提前成熟，但不再匹配原订单`);
      log(state,'warn',`🎨 ${batch.id} 转向野性风味：数量保留并提前成熟，但失去原订单资格`);
    }else return result(false,'未知补救方案');
    batch.rescueResolved=true;state.pendingRescue=null;
    return finishAction(state,'rescue',choice==='preserve'?'选择减量保质，保住承诺':'选择风味转向，寻找新的买家');
  }
  function attendClass(state,attend){
    if(state.ended)return result(false,'本局已经结束');
    if(state.pendingRescue)return result(false,'先处理批次偏差');
    if(!needsClassDecision(state))return result(false,'当前不是课程展示时间');
    state.classResolved=true;
    if(attend){state.attendance=1;return finishAction(state,'class','🎓 参加课程展示：学业结局 +1；不改变任何酿酒数据')}
    const text='🏃 缺席课程展示：学业结局记为缺席，但保留本时段继续经营';
    state.decisions.push({day:state.day,phase:PHASES[state.phase],kind:'class',text});
    log(state,'warn',text);
    return result(true,text);
  }
  function marketPrice(state,batch){
    const trend=currentTrend(state);
    const match=batch.flavor===trend?3:0;
    return Math.max(4,4+batch.quality*2+match);
  }
  function sellWalkIn(state,batchId,qty){
    const guard=guardNormalAction(state);if(!guard.ok)return guard;
    const batch=state.batches.find(b=>b.id===batchId);if(!batch)return result(false,'批次不存在');
    if(!isReady(state,batch))return result(false,`${batch.id} 尚未成熟`);
    if(isExpired(state,batch))return result(false,`${batch.id} 已过最佳售卖期`);
    const sold=Math.min(Math.max(1,qty||2),batch.qty);
    const unit=marketPrice(state,batch),income=unit*sold;
    batch.qty-=sold;state.money+=income;
    batch.history.push(`Day ${state.day}：向散客出售 ${sold} 份，+$${income}`);
    return finishAction(state,'sell',`🍻 ${batch.id} 售出 ${sold} 份 · +$${income}（今日偏好：${currentTrend(state)}）`);
  }
  function fulfillOrder(state,batchId,substitute){
    if(state.ended)return result(false,'本局已经结束');
    if(state.pendingRescue)return result(false,'先处理批次偏差');
    if(state.day!==3||state.phase!==2)return result(false,'节庆订单只能在第 3 天晚上交付');
    if(state.order.status!=='open')return result(false,'订单已经结算');
    const batch=state.batches.find(b=>b.id===batchId);if(!batch)return result(false,'批次不存在');
    if(!isReady(state,batch)||isExpired(state,batch))return result(false,'该批次当前不可交付');
    const exact=batch.flavor===state.order.flavor&&batch.quality>=state.order.minQuality&&batch.qty>=state.order.qty;
    if(!substitute&&!exact)return result(false,'该批次不满足数量、品质或风味要求');
    if(substitute){
      if(batch.qty<3)return result(false,'替代交付至少需要 3 份');
      batch.qty-=3;state.money+=38;state.order.status='substituted';state.order.relation=-1;state.order.deliveredBatch=batch.id;
      batch.history.push('Day 3：替代交付 3 份，收入 $38，关系 -1');
      return finishAction(state,'order',`🤝 ${batch.id} 替代交付 · +$38 · 常客关系 -1`);
    }
    const bonus=Math.max(0,batch.quality-state.order.minQuality)*8;
    const income=state.order.reward+bonus;
    batch.qty-=state.order.qty;state.money+=income;state.order.status='fulfilled';state.order.relation=2;state.order.deliveredBatch=batch.id;
    batch.history.push(`Day 3：按约交付 ${state.order.qty} 份，收入 $${income}`);
    return finishAction(state,'order',`🎉 ${batch.id} 按约交付 · +$${income} · 常客关系 +2`);
  }
  function rest(state){
    const guard=guardNormalAction(state);if(!guard.ok)return guard;
    return finishAction(state,'rest','⏭️ 放弃当前时段，没有额外收益');
  }
  function restore(raw,seed){
    try{
      const parsed=typeof raw==='string'?JSON.parse(raw):clone(raw);
      if(!parsed||parsed.version!==1||parsed.ended)return fresh(seed);
      return parsed;
    }catch(_err){return fresh(seed)}
  }

  return {PHASES,ROUTES,DEVIATIONS,fresh,restore,clone,phaseLabel,trendForDay,currentTrend,isReady,isExpired,needsClassDecision,buySupplies,brew,resolveRescue,attendClass,sellWalkIn,fulfillOrder,rest,marketPrice};
});
