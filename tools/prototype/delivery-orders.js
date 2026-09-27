(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DeliveryOrders=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LABELS=Object.freeze({offered:'待答复',accepted:'已答应',fulfilled:'已兑现',declined:'未接单',cancelled:'已协商取消',missed:'未兑现',expired:'未接单，邀请已过期'});
  const fresh=(rulesFromDay=1)=>({rulesFromDay,contracts:[]});
  const active=s=>s.trade.contracts.find(c=>c.status==='accepted')||null;
  const forGuest=(s,id)=>s.trade.contracts.find(c=>c.status==='accepted'&&c.dueDay===s.day&&c.customerId===id)||null;
  const DELIVERED=['delivered','honest','late','redirected','repurposed'];
  function terms(s,c){
    const table=s.journeys.history.some(h=>h.day===c.sourceDay&&h.kind==='delivery'&&h.outcome==='repurposed');
    return {quality:table?1:2,price:table?10:14,bonus:2,label:table?'排练供酒':'演出供酒'};
  }
  function memory(s,c){
    const h=s.journeys.history.find(h=>h.day===c.sourceDay&&h.kind==='delivery');
    if(h?.outcome==='repurposed')return 'Lotte 告诉我，你们把受损花束拆成了排练桌花。这次就订排练用的黑啤。';
    if(h?.outcome==='redirected')return 'Lotte 说你提前联系，改在后台把花交给了她。我们照约来取酒。';
    if(h?.outcome==='honest')return 'Lotte 说你说明了花的损伤。酒的品质我们还是按订单约定来。';
    if(h?.outcome==='late')return 'Lotte 说花晚了一些才到。这晚的酒，还请按约留好。';
    return 'Lotte 回话说花送到了。我来取我们约好的黑啤。';
  }
  function brief(s,c){
    const t=terms(s,c),reserved=s.batches.find(b=>b.id===c.reservedBatch);
    const pouring=Boolean(c.customerId&&s.night?.pours.some(p=>p.customerId===c.customerId));
    const stock=s.batches.filter(b=>b.beer==='stout'&&b.quality>=t.quality&&b.cups>0).reduce((n,b)=>n+b.cups,0);
    const missing=stock||pouring?0:1;
    const guest=s.night?.orders.find(o=>o.id===c.customerId);
    const next=c.status==='offered'?'先决定是否接单；开门前未答复则邀请结束。':pouring?'正在倒约定的这一杯，等指针进入绿色区域收杯。':missing?
      (s.phase==='night'?'今晚无法酿新酒；可免费协商取消，不要空等。':t.quality===1?'还缺 1 杯黑啤；可酿造或到市场买普通现货。':'还缺 1 杯品质至少 2 的黑啤；普通市场现货不达标。'):
      !reserved?'库存达标但未保护，先预留 1 杯，避免卖给散客。':guest?.status==='waiting'?'管理员已到店，选中他，按约倒酒。':c.dueDay===s.day?'已备齐，今晚管理员到店后按约倒酒。':'已备齐并保护，明晚管理员到店后按约倒酒。';
    return {...t,stock,missing,reserved:Boolean(reserved),pouring,next};
  }
  function available(s,batch,customerId){
    const c=active(s);
    return Math.max(0,batch.cups-(c?.reservedBatch===batch.id&&(!customerId||c.customerId!==customerId)?1:0));
  }
  function offer(s,r){
    if(r.version<2||r.kind!=='delivery'||!DELIVERED.includes(r.outcome)||s.trade.contracts.some(c=>['accepted','offered'].includes(c.status)))return;
    s.trade.contracts.push({id:'bridge-d'+s.day,sourceDay:s.day,dueDay:Math.min(3,s.day+1),status:'offered',reservedBatch:null,customerId:null,settledDay:null});
  }
  function decide(s,id,choice,batchId){
    const c=s.trade.contracts.find(c=>c.id===id);
    if(!c)return {ok:false,message:'没有这张预订单。'};
    const t=terms(s,c);
    if(choice==='accept'&&c.status==='offered'&&s.phase==='prep'&&c.sourceDay===s.day){
      if(active(s))return {ok:false,message:'先处理已经答应的预订单。'};
      c.status='accepted';return {ok:true,message:'已答应第 '+c.dueDay+' 晚的'+t.label+'：1 杯品质至少 '+t.quality+' 的黑啤，约定价 €'+t.price+'，满意交付另加 €2。可预留库存，也可免费协商取消。'};
    }
    if(choice==='decline'&&c.status==='offered'&&s.phase==='prep'){c.status='declined';c.settledDay=s.day;return {ok:true,message:'你只接了送花，没有答应供酒。不算失约，也不扣钱。'};}
    if(c.status!=='accepted'||!['prep','night'].includes(s.phase))return {ok:false,message:'这张订单已经处理，不能再次结算。'};
    if(s.night?.pours.some(p=>p.customerId===c.customerId))return {ok:false,message:'这杯已经在倒，请先收杯或送水善后。'};
    if(choice==='cancel'){c.status='cancelled';c.reservedBatch=null;c.settledDay=s.day;return {ok:true,message:'已说明无法供酒，免费取消；预留库存已释放。管理员若已入店，仍可按普通点单招待。'};}
    if(choice==='release'){c.reservedBatch=null;return {ok:true,message:'已释放预留酒，订单仍然有效；记得另备品质至少 '+t.quality+' 的黑啤。'};}
    if(choice==='reserve'){
      const b=s.batches.find(b=>b.id===batchId&&b.beer==='stout'&&b.quality>=t.quality&&b.cups>0);
      if(!b)return {ok:false,message:'只能预留现有的 1 杯品质至少 '+t.quality+' 的黑啤。'};
      c.reservedBatch=b.id;return {ok:true,message:'已从选定批次预留 1 杯黑啤，散客和赠饮不会取走；可以随时释放或取消订单。'};
    }
    return {ok:false,message:'现在不能这样处理订单。'};
  }
  function open(s,orders){
    for(const c of s.trade.contracts){
      if(c.status==='offered'){c.status='expired';c.settledDay=s.day;}
      if(c.status==='accepted'&&c.dueDay===s.day){
        // Keep the existing Noor/box consequence guest; replace a generic guest instead.
        const o=orders[s.backstage.resolution?2:1];c.customerId=o.id;
        const t=terms(s,c);
        Object.assign(o,{name:'排练室管理员',person:null,beer:'stout',budget:t.price,patience:45,portrait:'🧑🏼',quote:memory(s,c)+' 黑啤品质至少 '+t.quality+'，€'+t.price+'；满意交付另付 €2。'});
      }
    }
  }
  function resolve(s,customerId,success){
    const c=forGuest(s,customerId);if(!c)return 0;
    c.status=success?'fulfilled':'missed';c.reservedBatch=null;c.settledDay=s.day;
    return success?2:0;
  }
  function close(s){
    for(const c of s.trade.contracts)if(c.status==='accepted'&&c.dueDay<=s.day){c.status='missed';c.reservedBatch=null;c.settledDay=s.day;}
  }
  function notes(s){return s.trade.contracts.map(c=>'第 '+c.sourceDay+' 天送花带来的第 '+c.dueDay+' 晚'+terms(s,c).label+'：'+LABELS[c.status]+(c.status==='fulfilled'?'。你把出门时的约定变成了一杯酒。':c.status==='missed'?'。这一晚没供上，人物记下这次结果，没有额外罚款。':c.status==='accepted'?'，需要 1 杯品质至少 '+terms(s,c).quality+' 的黑啤。':'。'));}
  function valid(s){
    const t=s.trade,shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(' ')===keys.split(' ').sort().join(' ');
    if(!shape(t,'rulesFromDay contracts')||!Number.isInteger(t.rulesFromDay)||t.rulesFromDay<1||t.rulesFromDay>4||!Array.isArray(t.contracts)||t.contracts.length>3)return false;
    let pending=0,previous=0;
    for(const c of t.contracts){
      if(!shape(c,'id sourceDay dueDay status reservedBatch customerId settledDay')||!Number.isInteger(c.sourceDay)||c.sourceDay<=previous||c.sourceDay>s.day||c.id!=='bridge-d'+c.sourceDay||c.dueDay!==Math.min(3,c.sourceDay+1)||!Object.hasOwn(LABELS,c.status))return false;
      previous=c.sourceDay;
      if(!s.journeys.history.some(h=>h.day===c.sourceDay&&h.kind==='delivery'&&DELIVERED.includes(h.outcome)))return false;
      if(['offered','accepted'].includes(c.status)){pending++;if(c.settledDay!==null)return false;}
      else if(!Number.isInteger(c.settledDay)||c.settledDay<c.sourceDay||c.settledDay>s.day)return false;
      if(c.status==='offered'&&(c.sourceDay!==s.day||!['prep','brew','forage','journey'].includes(s.phase)))return false;
      if(c.status==='accepted'&&(c.dueDay<s.day||c.dueDay===s.day&&['summary','ending'].includes(s.phase)))return false;
      if(c.reservedBatch!==null&&(c.status!=='accepted'||!s.batches.some(b=>b.id===c.reservedBatch&&b.beer==='stout'&&b.quality>=terms(s,c).quality&&b.cups>0)))return false;
      if(c.customerId!==null&&!['d'+c.dueDay+'-guest1','d'+c.dueDay+'-guest2'].includes(c.customerId))return false;
      if(['fulfilled','missed'].includes(c.status)&&(c.settledDay!==c.dueDay||c.customerId===null))return false;
    }
    return pending<=1;
  }
  return Object.freeze({fresh,active,forGuest,available,offer,decide,open,resolve,close,notes,valid,LABELS,terms,memory,brief});
});
