(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CharacterStories=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CAST=Object.freeze({
    marta:Object.freeze({name:'Marta',place:'pub',title:'窗户另一边的人',day:'Marta 带来楼上邻居的字条：有人刚下夜班。她不是来叫停酒馆，想和你商量今晚怎样让两边都能过日子。',accept:'今晚一起处理邻居的留言',decline:'今天先不接这件事',night:'Marta 把邻居的字条留在杯垫下：“我喜欢这里有声音，他们也需要睡觉。门口先做点小事，好吗？”',choices:[{id:'felt',label:'给门口加软毡',detail:'支付 €4，尚未离场的客人耐心 +6 秒；只影响今晚。'},{id:'talk',label:'先说明散场安排',detail:'免费；Marta 若仍在候杯，耐心 +4 秒，不改变音乐和其他客人。'}]}),
    bram:Object.freeze({name:'Bram',place:'coffee',title:'下班之后，才是她的晚上',day:'Bram 指着排班表：“Inez 今晚替同事顶班，下班想来买杯酒。她不是我的员工福利预算，不用免费招待；你愿意接待，我把地址给她。”',accept:'把酒馆地址留给 Inez',decline:'今晚先不约她过来',night:'Bram 托人带来消息：“Inez 快下班了。她说今天午饭只有两次闻到面包的机会。”',choices:[{id:'meal',label:'提前备一份简餐',detail:'支付 €3；Inez 今晚预算 +€4、耐心 +6 秒。酒仍需正常点单付款，加价仍有品质门槛。'},{id:'regular',label:'告诉她照常点单',detail:'免费，不改变预算或耐心；仍会作为普通客人来店。'}]}),
    ada:Object.freeze({name:'Ada',place:'flowers',title:'卖春天的人也要下班',day:'花店老板 Ada 合上鲜花价签：“游客以为花店跟太阳一起休息。我们晚上还得搬温室的花。今晚我想来喝一杯，顺便说说那条夜路。”',accept:'约 Ada 收完花后来坐坐',decline:'今晚先各忙各的',night:'Ada 的搬花同事捎来口信：“她还在收尾。湿手套挂在车把上，干手套在工资到账那天再买。”',choices:[{id:'round',label:'留一杯艾尔给搬花同事',detail:'消耗 1 杯未预留的金色艾尔；Ada 今晚耐心 +12 秒。预订单用酒不会被取走。'},{id:'water',label:'准备水和干毛巾',detail:'免费；Ada 今晚耐心 +4 秒，不增加酒、酒花或音乐收益。'}]})
  });
  const fresh=fromDay=>({version:1,fromDay,threads:[]});
  const current=s=>s.stories.threads.find(t=>t.day===s.day&&t.status!=='declined')||null;
  const pending=s=>s.stories.threads.find(t=>t.status==='pending')||null;
  function dayView(s,place){
    if(s.phase!=='prep'||s.day<s.stories.fromDay)return null;
    const id=Object.keys(CAST).find(id=>CAST[id].place===place);if(!id)return null;
    const person=CAST[id],thread=s.stories.threads.find(t=>t.id===id),busy=Boolean(current(s));
    let context='';
    if(id==='bram'&&s.prepared.includes('coffee'))context='你刚帮完午市，€18 工钱已经结清。这次邀请是另一件事，不重复发工钱。';
    if(id==='ada'&&s.backstage.discovered.includes('greenhouse-pump'))context='Ada 认出维修记录：“你修过的泵还在工作，今晚终于不用一直踩水。”';
    else if(id==='ada'&&s.backstage.discovered.includes('greenhouse'))context='她认出你鞋上的温室泥：“你走过那条后门，知道夜班不是明信片上的风景。”';
    return {id,...person,thread,busy,context};
  }
  function talk(s,id,choice){
    if(!Object.hasOwn(CAST,id)||s.phase!=='prep'||s.day<s.stories.fromDay||s.stories.threads.some(t=>t.id===id)||!['accept','decline'].includes(choice))return {ok:false,message:'这段白天对话现在不能再选。'};
    const person=CAST[id];
    if(choice==='accept'&&current(s))return {ok:false,message:'今晚已经约了一件人物事件，其他邀请可以留到明天。'};
    s.stories.threads.push({id,day:s.day,status:choice==='accept'?'agreed':'declined',choice:null,customerId:null,service:null});
    return {ok:true,message:choice==='accept'?person.name+' 记下今晚的约定。不消耗准备次数，夜里再决定具体怎样做。':person.name+' 接受了你的说明。这次没有约定，也不会产生失约惩罚。'};
  }
  function open(s,orders){
    const t=current(s);if(!t||t.status!=='agreed')return;
    const o=t.id==='marta'?orders.find(o=>o.person==='marta'):orders[3];
    t.customerId=o.id;
    if(t.id==='bram')Object.assign(o,{name:'Inez',person:null,beer:'blond',budget:10,patience:30,portrait:'👩🏽',quote:'Bram 给了我地址。下班以后，我想当一会儿顾客，不想再当“灵活人力”。'});
    if(t.id==='ada')Object.assign(o,{name:'Ada',person:null,beer:'blond',budget:12,patience:30,portrait:'👩🏼',quote:s.backstage.discovered.includes('greenhouse-pump')?'你修过的泵还好好的。今天的鞋终于先干了，账单还没有。':'白天卖花，晚上搬花。现在这一杯，是我自己买给自己的。'});
    if(t.id==='marta')o.quote='白天那张邻居留言还在我口袋里。我们说好今晚商量，不是来让你关门的。';
  }
  function update(s){
    const t=current(s);if(t?.status==='agreed'&&s.night.elapsed>=12&&s.night.event?.status!=='pending')t.status='pending';
  }
  function nightView(s,available){
    const t=pending(s);if(!t)return null;
    const p=CAST[t.id];
    return {id:t.id,title:p.title,quote:p.night,choices:p.choices.map(c=>({...c,disabled:c.id==='felt'?s.cash<4:c.id==='meal'?s.cash<3:c.id==='round'?!s.batches.some(b=>b.beer==='blond'&&available(s,b)>0):false}))};
  }
  function decide(s,choice,available){
    const t=pending(s),view=t&&nightView(s,available),c=view?.choices.find(c=>c.id===choice);
    if(!c)return {ok:false,message:'请选择当前人物事件提供的选项。'};
    if(c.disabled)return {ok:false,message:'现金或未预留艾尔不足，可以选择免费回应。'};
    const guest=s.night.orders.find(o=>o.id===t.customerId);
    const stillHere=o=>['future','waiting'].includes(o.status);
    if(choice==='felt'){s.cash-=4;for(const o of s.night.orders)if(stillHere(o))o.patience=Math.min(120,o.patience+6);}
    if(choice==='meal'){s.cash-=3;if(stillHere(guest)){guest.budget+=4;guest.patience+=6;}}
    if(choice==='round'){const b=s.batches.find(b=>b.beer==='blond'&&available(s,b)>0);b.cups--;}
    const wait={talk:4,round:12,water:4}[choice]||0;if(wait&&stillHere(guest))guest.patience=Math.min(120,guest.patience+wait);
    t.status='resolved';t.choice=choice;
    return {ok:true,message:nightReply(t)+' 选择已记下，正常营业继续。'};
  }
  function nightReply(t){return ({felt:'门口多了一层软毡。Marta 留言：“至少不用先吵赢，才有人听见。”',talk:'你说明今晚的散场安排。Marta 回话：“先把能做到的说清楚。”',meal:'Inez 收到简餐的消息：“好，我今晚不只吃工作群里的饼。”',regular:'Bram 转告 Inez 可以照常点单：“那就好，不欠一份写不清的人情。”',round:'搬花工收下那杯艾尔，托人告诉 Ada：“你约的店把我们也当人看。”',water:'干毛巾和水放好了。Ada 回话：“不用每件好事都装进酒杯。”'})[t.choice]||'';}
  function service(s,id,result){const t=current(s);if(t&&t.customerId===id&&t.service===null)t.service=result;}
  function close(s){const t=current(s);if(t&&['agreed','pending'].includes(t.status))t.status='missed';}
  function line(t){
    const p=CAST[t.id],guest=t.id==='bram'?'Inez':p.name;
    let note=t.status==='declined'?p.name+'：你白天说明了不接这次邀请，没有未兑现的约定。':t.status==='missed'?p.name+'：今晚没等到约好的回应；事情记下了，没有额外罚款。':t.status==='resolved'?nightReply(t):p.name+'：今晚还有一段约好的对话。';
    if(t.service)note+=' '+guest+(t.service==='satisfied'?'喝到了满意的一杯。':t.service==='unsatisfied'?'收到了酒，但这一杯没有满意；说过的话不抵销服务结果。':'没喝到那杯酒；白天的约定和实际招待分别记账。');
    return '第 '+t.day+' 天 · '+note;
  }
  const notes=s=>s.stories.threads.map(line);
  const morning=s=>s.stories.threads.filter(t=>t.day<s.day).map(line);
  function valid(s){
    const x=s.stories,shape=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(' ')===k.split(' ').sort().join(' ');
    if(!shape(x,'version fromDay threads')||x.version!==1||!Number.isInteger(x.fromDay)||x.fromDay<1||x.fromDay>4||!Array.isArray(x.threads)||x.threads.length>3)return false;
    const ids=new Set(),days=new Set();let previousDay=0;
    for(const t of x.threads){
      if(!shape(t,'id day status choice customerId service')||!Object.hasOwn(CAST,t.id)||ids.has(t.id)||!Number.isInteger(t.day)||t.day<x.fromDay||t.day>s.day||t.day<previousDay)return false;
      ids.add(t.id);previousDay=t.day;
      if(!['agreed','declined','pending','resolved','missed'].includes(t.status)||![null,'satisfied','unsatisfied','lost'].includes(t.service))return false;
      if(t.status!=='declined'){if(days.has(t.day))return false;days.add(t.day);}
      if(t.status==='resolved'?!CAST[t.id].choices.some(c=>c.id===t.choice):t.choice!==null)return false;
      if(t.status==='declined'&&(t.customerId!==null||t.service!==null))return false;
      const expected='d'+t.day+'-guest'+(t.id==='marta'?0:3);
      if(t.customerId!==null&&t.customerId!==expected||t.service!==null&&t.customerId===null)return false;
      if(['pending','resolved','missed'].includes(t.status)&&t.customerId===null)return false;
      if(['agreed','pending'].includes(t.status)&&(t.day!==s.day||!['prep','brew','forage','journey','night'].includes(s.phase)))return false;
      if(t.status==='pending'&&(s.phase!=='night'||s.night.elapsed<12||s.night.event?.status==='pending'))return false;
      if(t.day===s.day&&t.status!=='declined'){
        if(s.phase==='night'||['summary','ending'].includes(s.phase)||s.phase==='explore'&&s.backstage.from==='summary'){
          if(t.customerId!==expected)return false;
          const o=s.night?.orders.find(o=>o.id===expected);if(!o)return false;
          if(t.service===null?!['future','waiting'].includes(o.status):t.service==='lost'?o.status!=='lost':o.status!=='served')return false;
        }else if(t.customerId!==null)return false;
      }
    }
    return true;
  }
  return Object.freeze({CAST,fresh,current,pending,dayView,talk,open,update,nightView,decide,service,close,notes,morning,valid});
});
