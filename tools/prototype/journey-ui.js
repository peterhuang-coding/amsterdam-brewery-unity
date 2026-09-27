(function(root){
  'use strict';
  const J=root.Journey;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={packing:'出门前 · 两格装载',road:'城市送货',conflict:'街头冲突',ticket:'站外 · 票务选择',carriage:'列车途中',inspection:'票务核对',arrival:'抵达 · 亲手交付',receipt:'这一趟，收好了',dropoff:'南岸排练室 · 急件交付',garden:'温室停靠 · 换个做法再出发'};
  class JourneyUI {
    constructor({canvas,getState,dispatch,tick,isPaused,playFeedback}){
      Object.assign(this,{canvas,getState,dispatch,tick,isPaused,playFeedback});this.keys=new Set();this.last='';this.acc=0;this.feedback=null;
      document.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-j-move]');if(b&&this.active()&&!this.isPaused()){e.preventDefault();const key=b.dataset.jMove;if(this.getState().journeys.run.auto)this.do('auto');this.keys.add(key);}});
      document.addEventListener('pointerup',()=>this.clear());document.addEventListener('pointercancel',()=>this.clear());
      document.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>this.clear());
    }
    active(){return this.getState().phase==='journey';}
    clear(){this.keys.clear();}
    do(verb,value){this.dispatch({type:'journeyAction',verb,value});}
    key(e){
      if(!this.active())return false;const key=e.key.toLowerCase();
      if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(key)){e.preventDefault();this.keys.add(key);if(this.getState().journeys.run.auto)this.do('auto');return true;}
      if(e.repeat)return false;
      if([' ','j','b','e'].includes(key)){
        e.preventDefault();const r=this.getState().journeys.run;
        if(key===' ')this.do('dash',this.direction());
        if(key==='j')this.do('defend');if(key==='b')this.do('bike');
        if(key==='e')this.do(r.stage==='carriage'?'help':'cargo',r.stage==='carriage'?true:undefined);
        return true;
      }
      return false;
    }
    direction(){const k=this.keys;return {dx:Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft')),dy:Number(k.has('s')||k.has('arrowdown'))-Number(k.has('w')||k.has('arrowup'))};}
    step(seconds){
      if(!this.active())return;const r=this.getState().journeys.run;
      if(!this.isPaused()&&!document.hidden){
        this.acc+=seconds;if(this.acc>=.05){this.tick(Math.min(.1,this.acc),this.direction());this.acc=0;}
      }else this.acc=0;
      const now=this.getState().journeys.run;
      if(now.quality<r.quality&&(r.quality===100||r.quality>=80&&now.quality<80||r.quality>=20&&now.quality<20||!this.feedback||performance.now()>this.feedback.until)){
        this.feedback={text:now.quality<20?'花束严重受损，已不适合拆成桌花。可说明情况交付或退回。':now.quality<80?'花束已受损：到站可整理、说明损伤或协商改作桌花。':'花束正在颠簸：慢骑或避开石板可减少损伤。',until:performance.now()+4000};
        this.playFeedback?.();
      }
      const sig=JSON.stringify([now.stage,now.packing,now.auto,now.slow,now.cargo,now.load,now.care,now.garden,now.quality<80,now.quality<20,J.canNotify(now),now.elapsed>J.deadline(now),now.bike.mounted,now.conflict?.mode,now.encounterDone,now.eventDone,now.travel>=5,now.secured,now.repaired,now.outcome,now.leg,now.message]);
      if(sig!==this.last){this.render();this.last=sig;}
      this.meters();this.draw();
    }
    button(label,verb,value,disabled=false,secondary=false){return `<button class="${secondary?'secondary':'primary'}" data-action="journey" data-verb="${verb}" ${value!==undefined?`data-value="${esc(value)}"`:''} ${disabled?'disabled':''}>${esc(label)}</button>`;}
    render(){
      if(!this.active())return;const state=this.getState(),r=state.journeys.run,b=this.button.bind(this),near=Math.hypot(r.p.x-r.bike.x,r.p.y-r.bike.y)<65;
      let html=`<p class="board-eyebrow">一趟出门 / 第 ${r.day} 天 / ${r.kind==='rail'?'远郊展厅委托':'Lotte 的桥'}</p><h2>${names[r.stage]}</h2><p class="board-copy" role="status">${esc(r.message)}</p>`;
      if(r.stage==='packing')html+=`<p>已占 1 次准备，花由店主提供。报酬：完好 €14、迟到 €10、受损 €8；退回不付花束报酬。花束时限 ${r.deadline} 秒，只计算实际去程行动，阅读和暂停不计时。</p><div class="price-options">${b((r.packing==='padding'?'✓ ':'')+'花束 1 格＋软垫 1 格：保护花','pack','padding',false,true)}${b((r.packing==='capacity'?'✓ ':'')+(r.version>=2?'花束 1 格＋急件 1 格：多一站，骑速 −10%':'额外包装：报酬 +€2，骑速 −10%'),'pack','capacity',false,true)}</div>${r.version>=2?'<p class="promise-note">急件要亲自送到南岸排练室：55 秒内 €4，迟到仍收 €2；可取消退回，没有软垫保护。花与急件分别结算。完成送花后可自愿接一张供酒预订单。</p>':''}<p>今天${r.weather==='wet'?'石板潮湿，快骑更容易伤花':'路面干燥，石板上快骑仍会颠簸'}。两条桥都能走。</p>${b('走近路 · 石板与窄桥'+(r.kind==='delivery'?'，有街头遭遇':''),'depart','short',!r.packing)}${b('绕南侧平路 · 路长、花稳','depart','smooth',!r.packing,true)}`;
      if(r.stage==='packing')html+='<p class="small-note">南侧是行人共享路段，骑行限慢速；近路可以快骑赶时间，但石板和街头遭遇要自己应对。</p>';
      if(r.version>=2){
        const where={hand:'手中',bike:'车上',delivered:'已交付',returned:'退回',none:'未装载'};
        html+='<div class="cargo-manifest" aria-label="两格装载清单">'+J.manifest(r).map(item=>`<div><strong>${esc(item.name)} · ${item.slots} 格</strong><span>${where[item.where]||item.where}</span></div>`).join('')+'</div>';
        if(J.parcelPending(r)&&['road','dropoff','arrival'].includes(r.stage))html+=b('通知取消急件，带回花店','parcel','return',false,true);
      }
      if(r.stage==='dropoff')html+=`<p>花束用时与急件共用去程时钟；这里阅读不计时。</p>${r.load.parcel==='bike'?b('从车上取出急件','parcel','take',!near):b('亲手交付急件，继续送花','parcel','deliver')}`;
      if(r.version===4&&!r.outcome){
        if(r.stage==='packing')html+='<p class="small-note">'+(r.garden.known?'你认得温室侧门；出发后可以临时改道，修过的水泵和 Ada 的介绍也会带进这一趟。':'路边玻璃屋的侧门可自行发现，也可以先回花店向 Ada 问路。没有介绍也能使用包装台。')+'</p>';
        if(J.canDetour(r))html+=b(r.garden.detour?'取消温室绕路，继续送货':'改道去温室包装台 · 实际路程计时','garden-route',undefined,false,true);
        if(r.garden.wrapped)html+='<p class="promise-note">已加固包装：后续石板颠簸减少，花与急件的位置不变。</p>';
        if(r.stage==='garden')html+=`<p>${r.garden.pump?'入口是你修泵后留下的干路。':'入口仍然湿滑，夜里用零件修泵可让以后通行更快。'} ${r.garden.introduced?'Ada 的介绍便签让材料费免收。':'陌生人也可借包装台，材料 €2。'}</p>${r.cargo==='bike'?b('从车篮取花，放到包装台','cargo',undefined,!near):''}${b('重新包扎 · +30 品质，上限 90 / 用 8 秒 / €'+J.wrapCost(r),'garden-wrap',undefined,r.garden.wrapped||r.cargo!=='hand'||state.cash<J.wrapCost(r))}<p class="small-note">完好花不降品质；每趟一次，不取消两格装载、不额外占准备次数。时间紧可以什么都不拿，直接离开。</p>${b('离开温室，继续这趟送货','garden-leave',undefined,false,true)}`;
      }
      if(r.stage==='road'||r.stage==='conflict'){
        const choice=r.stage==='conflict'&&r.conflict.mode==='choice';
        if(choice)html+=b('说明来意，让对方放行 · 用 12 秒','street','talk')+b('走南侧绕过去 · 不打架','street','detour',false,true)+b('留下应对 · 可闪避、格挡、撤离','street','fight',false,true);
        else{
          html+=b(r.auto?'停下自动行进，手动操作':'沿选定路线自动行进','auto',undefined,false,true);
          if(r.stage==='road')html+=b(r.slow?'当前慢骑 · 切换快骑':'当前快骑 · 切换慢骑','speed',undefined,false,true);
          html+=b(r.bike.mounted?'停好车 · B':'骑上车 · B','bike',undefined,!near,true);
          if(!r.outcome)html+=b(r.cargo==='bike'?'从车篮取花 · E':'把花放回车篮 · E','cargo',undefined,!near,true);
          if(r.stage==='conflict')html+=`<div class="price-options">${b('闪避 · Space','dash',undefined,false,true)}${b(r.conflict.mode==='recover'?'短暂反击 · J':'格挡 · J','defend',undefined,r.cargo==='hand',true)}</div><p class="small-note">橙圈预告落点；手持花时不能格挡。通过或保住物品即可，不掉落金钱。最多承受三次，随后对方停止追赶。</p>`;
        }
      }
      if(r.stage==='ticket')html+=`<p>${r.leg?'返程：远郊展厅 → 出发站':'去程：出发站 → 远郊展厅'}。本段车票 €4。无票风险为中等；若遇检查，补票 €4＋处理费 €8。全部为虚构玩法规则，并非现实 NS 规则。</p>${b('买票乘车 · €4','ticket','paid',state.cash<4)}${b('无票乘车 · 承担本段风险','ticket','unpaid',false,true)}${r.leg?b('返程票记账 · 待付 €4','ticket','credit',false,true):''}<p class="small-note">两种乘车方式都有完整旅途故事。自行车仍停在原站外。</p>`;
      if(r.stage==='carriage'){
        html+=`<p class="promise-note">本段票务：${r.ticket==='paid'?'有效车票':'无有效车票'} · 已付交通 €${r.paid} · 待付 €${r.fee}</p>`;
        if(!r.eventDone&&r.travel>=5)html+=b('走到同行人旁帮忙 · E','help','true',Math.hypot(r.p.x-620,r.p.y-260)>90)+b('留在花旁，继续这趟行程','help','false',false,true)+b(r.auto?'停止自动走近':'自动走近同行人','auto',undefined,false,true);
        else html+=`${r.leg===0&&!r.secured&&r.travel<5?b('固定花束 · 不花钱','secure'):''}${b(r.auto?'暂停自动走动':'继续行程 / 自动走动','auto',undefined,false,true)}<p class="small-note">可用方向键在车厢走动。${r.leg===0?'中途会停下来做一次选择；帮助他人不会免除票务责任。':'返程不重复去程故事。'}</p>`;
      }
      if(r.stage==='inspection')html+=`<p>本段${r.ticket==='paid'?'有有效车票，无额外费用':'无有效车票，需处理 €12；现金不足的部分记为待付款'}。确认只结算一次。</p>${b(r.ticket==='paid'?'出示车票，继续':'接受票务处理，继续','inspect')}`;
      if(r.version>=3&&!r.outcome){
        if(r.stage==='packing')html+='<p class="promise-note">可在出发后、40 秒内提前联系：用 5 秒改成桥边后台交接，花束时限放宽到 80 秒，完好报酬降为 €12。急件仍限 55 秒。</p>';
        if(J.canNotify(r))html+=b('联系改到后台 · 用 5 秒 / 花酬 €12 / 时限 80 秒','notify',undefined,false,true);
        if(r.care.notifiedAt!==null)html+='<p class="promise-note">已改约：同一桥边后台 · 花束 80 秒 / 完好 €12 · 不延长急件时限</p>';
      }
      if(r.stage==='arrival'){
        const price=r.quality<80?8:r.elapsed>J.deadline(r)?10:r.care?.notifiedAt!==null&&r.version>=3?12:14;
        html+=`${r.cargo==='bike'?b('从车篮取花，准备交付','cargo',undefined,!near):''}${r.quality<80&&!r.repaired?b('整理一次 · +25 品质，最高 80 / 用 15 秒','tidy',undefined,false,true):''}${b((r.quality<80?'说明损伤并交付':r.elapsed>J.deadline(r)?'解释迟到并交付':r.version>=3&&r.care.notifiedAt!==null?'按改约交到后台':'亲手交付')+' · 花酬 €'+price,'deliver','accept',r.cargo!=='hand')}`;
        if(J.canRepurpose(r))html+=b('协商拆成排练桌花 · 用 10 秒 / 花酬 €8','deliver','table',r.cargo!=='hand',true)+'<p class="small-note">不恢复品质；后续改为排练供酒：品质 1 黑啤 / €10。原用途交付仍为品质 2 / €14。邀请都可拒绝。</p>';
        html+=`${b('说明情况，退回花店','deliver','return',r.cargo!=='hand',true)}<p class="small-note">整理和协商的用时单独计入去程；阅读本身不计时。送花不触发 Lotte 的音乐收益。</p>`;
      }
      if(r.stage==='arrival'&&r.kind==='delivery')html+=b('先不交付，回到路上取车／取花','leaveArrival',undefined,false,true);
      if(r.stage==='receipt')html+=`<div class="receipt"><div><span>花束交付</span><strong>${J.LABELS[r.outcome]}</strong></div><div><span>总报酬${r.version>=2&&r.packing==='capacity'?'（含急件）':''}</span><strong>€${r.reward}</strong></div><div><span>已付交通费</span><strong>€${r.paid}</strong></div><div><span>票务待付</span><strong>€${r.fee}</strong></div></div><p>${r.version>=2&&['delivered','honest','late','redirected','repurposed'].includes(r.outcome)?'回花店后可查看供酒邀请：自愿接受，第三天只约当晚。':r.help?'同行人记得你帮忙捡过纸袋。':'这趟没有新增供酒约定。'} 车已带回。</p><button class="primary" data-action="journey-return">收好这一趟，回到花店 →</button>`;
      if(r.stage==='receipt'&&J.careNote(r))html+='<p class="promise-note">'+esc(J.careNote(r))+'</p>';
      if(!r.outcome&&!['carriage','inspection'].includes(r.stage))html+=b('结束委托，取车返回花店','abandon',undefined,false,true);
      document.getElementById('action-content').innerHTML=html;
      const moving=J.moving(r)&&!(r.stage==='conflict'&&r.conflict.mode==='choice');
      document.getElementById('queue').innerHTML=`<div class="journey-hud"><div><span>委托花</span><strong id="journey-quality"></strong></div><div><span>去程用时</span><strong id="journey-time"></strong></div><div><span>花的位置</span><strong id="journey-cargo"></strong></div></div><p id="journey-feedback" class="journey-feedback" role="status" aria-live="polite"></p>${moving?'<div class="journey-dpad" aria-label="按住移动"><button data-j-move="w" aria-label="向上">↑</button><button data-j-move="a" aria-label="向左">←</button><button data-j-move="s" aria-label="向下">↓</button><button data-j-move="d" aria-label="向右">→</button></div>':''}`;
      this.meters();
    }
    meters(){
      const r=this.getState().journeys.run;if(!r)return;
      const set=(id,v)=>{const el=document.getElementById(id);if(el&&el.textContent!==v)el.textContent=v;};
      set('journey-quality',Math.round(r.quality)+'/100'+(r.quality<80?' · 受损':''));set('journey-time',Math.floor(r.elapsed)+' / '+J.deadline(r)+' 秒'+(r.elapsed>J.deadline(r)?' · 已超时':''));
      set('journey-feedback',this.feedback&&performance.now()<this.feedback.until?this.feedback.text:'');
      set('journey-cargo',({hand:'手中',bike:'车篮',ground:'地面',delivered:'已交付',returned:'已退回'})[r.cargo]);
      // Position-only updates must not rebuild the controls while keys/pointers are held.
      document.querySelectorAll('[data-action="journey"][data-verb="help"][data-value="true"]').forEach(b=>b.disabled=Math.hypot(r.p.x-620,r.p.y-260)>90);
      document.querySelectorAll('[data-action="journey"][data-verb="bike"],[data-action="journey"][data-verb="cargo"]').forEach(b=>b.disabled=Math.hypot(r.p.x-r.bike.x,r.p.y-r.bike.y)>=65);
    }
    draw(){
      const r=this.getState().journeys.run;if(!r)return;const c=this.canvas.getContext('2d');
      const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
      const text=(s,x,y,size=20,color='#eee0c0')=>{c.fillStyle=color;c.font=size+'px sans-serif';c.textAlign='left';c.fillText(s,x,y);};
      const dot=(x,y,size,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,size,0,Math.PI*2);c.fill();};
      rect(0,0,1100,640,'#183c48');rect(30,140,1040,440,'#d9d1b8');
      const rail=['ticket','carriage','inspection'].includes(r.stage)||r.kind==='rail'&&r.stage==='arrival';
      if(rail){
        rect(80,175,940,370,'#b1946e');rect(110,205,880,110,'#294e60');
        for(let i=0;i<7;i++){rect(130+i*120,215,90,85,'#9bbec6');rect(130+i*120,435,85,75,'#4e6b70');}
        text('虚构 NS 旅途 · '+(r.leg?'返程':'去程'),95,165,19);
        dot(620,260,20,'#92707c');text('同行人',575,230,17,'#f5e5c0');
        if(!r.eventDone){rect(640,302,18,12,'#ded0ae');rect(595,290,14,12,'#ded0ae');}
        rect(90,560,920,8,'#788f93');rect(90,560,920*r.travel/20,8,'#e4ba71');
      }else{
        rect(395,140,135,440,'#527f8b');rect(365,285,195,95,'#b6a180');rect(365,460,195,65,'#baad90');
        rect(60,300,335,60,'#eee2c6');rect(530,300,510,60,'#eee2c6');rect(60,475,980,40,'#d4c6a5');
        for(let x=550;x<775;x+=28)for(let y=302;y<360;y+=20)rect(x,y,23,16,r.weather==='wet'?'#8e9e9c':'#baa88c');
        text('近路 · 窄桥推行',340,260,18,'#294b51');text('平路 · 行人共享 / 限慢速',350,555,18,'#294b51');
        rect(70,210,100,60,'#596f54');text('花店',90,250,20);rect(920,210,120,65,'#8c6c61');text(r.kind==='rail'?'出发车站':'Lotte 的桥',925,245,17);
        if(r.version===4){rect(800,155,70,34,'#779781');rect(810,161,50,20,'#bbd4c1');text(r.garden.known?'温室包装台':'玻璃屋侧门',790,145,15);if(!r.garden.pump){rect(785,230,100,20,'#799e9f');text('湿入口',795,272,14,'#294b51');}}
        if(r.version>=2&&r.packing==='capacity'){rect(748,510,100,40,'#826953');text('排练室急件',746,572,16,'#294b51');if(J.parcelPending(r)){const p=r.load.parcel==='bike'?r.bike:r.p;rect(p.x-24,p.y-25,18,18,'#cda765');}}
        c.strokeStyle='#b3784f';c.lineWidth=4;
        for(const x of [r.bike.x-16,r.bike.x+16]){c.beginPath();c.arc(x,r.bike.y+9,12,0,Math.PI*2);c.stroke();}
        c.beginPath();c.moveTo(r.bike.x-16,r.bike.y+9);c.lineTo(r.bike.x,r.bike.y-10);c.lineTo(r.bike.x+16,r.bike.y+9);c.lineTo(r.bike.x-16,r.bike.y+9);c.stroke();
      }
      if(r.conflict){const o=r.conflict;dot(o.x,o.y,20,o.mode==='yield'?'#8e9e86':'#a15d4e');text(o.mode==='yield'?'已退让':o.mode==='windup'?'蓄力！':o.mode==='recover'?'硬直':'拦路者',o.x-30,o.y-33,16,'#543e36');
        if(o.mode==='windup'){c.strokeStyle='#b35f31';c.lineWidth=4;c.beginPath();c.arc(o.aimX,o.aimY,75,0,Math.PI*2);c.stroke();}
      }
      dot(r.p.x,r.p.y,17,'#245d64');dot(r.p.x,r.p.y-7,9,'#e4cba4');text('你',r.p.x-9,r.p.y-28,16,'#244b51');
      if(r.cargo==='hand'||r.cargo==='bike'){
        const p=r.cargo==='bike'?r.bike:r.p;
        for(let i=0;i<3;i++){rect(p.x+15+i*5,p.y-5,2,18,'#5d795b');dot(p.x+16+i*5,p.y-7-i%2*4,5,r.quality<80?'#a18d79':'#d28b75');}
      }
      rect(25,20,1050,98,'#203d44');text(names[r.stage]+(r.returning?' · 返回花店':''),48,57,25);text('花束 '+Math.round(r.quality)+'/100  ·  '+Math.floor(r.elapsed)+'/'+J.deadline(r)+' 秒  ·  '+(r.auto?'自动行进':'手动／等待选择'),48,94,18,'#dbc89d');
      text(this.isPaused()?'已暂停 · 所有动作与行程停止':'WASD 移动 · B 骑车 · E 取放／帮助 · P 暂停',45,613,18);
    }
  }
  root.JourneyUI=JourneyUI;
})(window);
