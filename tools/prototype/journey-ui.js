(function(root){
  'use strict';
  const J=root.Journey;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={packing:'出门前 · 装载',road:'城市送货',conflict:'街头冲突',ticket:'站外 · 票务选择',carriage:'列车途中',inspection:'票务核对',arrival:'抵达 · 亲手交付',receipt:'这一趟，收好了'};
  class JourneyUI {
    constructor({canvas,getState,dispatch,tick,isPaused}){
      Object.assign(this,{canvas,getState,dispatch,tick,isPaused});this.keys=new Set();this.last='';this.acc=0;
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
      const sig=JSON.stringify([now.stage,now.packing,now.auto,now.slow,now.cargo,now.bike.mounted,now.conflict?.mode,now.encounterDone,now.eventDone,now.travel>=5,now.secured,now.repaired,now.outcome,now.leg,now.message]);
      if(sig!==this.last){this.render();this.last=sig;}
      this.meters();this.draw();
    }
    button(label,verb,value,disabled=false,secondary=false){return `<button class="${secondary?'secondary':'primary'}" data-action="journey" data-verb="${verb}" ${value!==undefined?`data-value="${esc(value)}"`:''} ${disabled?'disabled':''}>${esc(label)}</button>`;}
    render(){
      if(!this.active())return;const state=this.getState(),r=state.journeys.run,b=this.button.bind(this),near=Math.hypot(r.p.x-r.bike.x,r.p.y-r.bike.y)<65;
      let html=`<p class="board-eyebrow">一趟出门 / 第 ${r.day} 天 / ${r.kind==='rail'?'远郊展厅委托':'Lotte 的桥'}</p><h2>${names[r.stage]}</h2><p class="board-copy" role="status">${esc(r.message)}</p>`;
      if(r.stage==='packing')html+=`<p>已占 1 次准备，花由店主提供。报酬：完好 €14、迟到 €10、受损 €8；退回不付报酬。承诺时限 ${r.deadline} 秒，只计算实际去程行动，阅读和暂停不计时。</p><div class="price-options">${b((r.packing==='padding'?'✓ ':'')+'软垫：保护花，占满车篮','pack','padding',false,true)}${b((r.packing==='capacity'?'✓ ':'')+'额外包装：报酬 +€2，骑速 −10%','pack','capacity',false,true)}</div><p>今天${r.weather==='wet'?'石板潮湿，快骑更容易伤花':'路面干燥，石板上快骑仍会颠簸'}。两条桥都能走。</p>${b('走近路 · 石板与窄桥'+(r.kind==='delivery'?'，有街头遭遇':''),'depart','short',!r.packing)}${b('绕南侧平路 · 路长、花稳','depart','smooth',!r.packing,true)}`;
      if(r.stage==='packing')html+='<p class="small-note">南侧是行人共享路段，骑行限慢速；近路可以快骑赶时间，但石板和街头遭遇要自己应对。</p>';
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
      if(r.stage==='arrival')html+=`${r.cargo==='bike'?b('从车篮取花，准备交付','cargo',undefined,!near):''}${r.quality<80&&!r.repaired?b('整理一次包装 · 用 15 秒','tidy',undefined,false,true):''}${b(r.quality<80?'说明损伤并交付 · €8 起':r.elapsed>r.deadline?'解释迟到并交付 · €10 起':'亲手交付 · €14 起','deliver','accept',r.cargo!=='hand')}${b('说明情况，退回花店','deliver','return',r.cargo!=='hand',true)}<p class="small-note">送花不触发 Lotte 的音乐收益，留酒承诺仍需在营业中兑现。</p>`;
      if(r.stage==='arrival'&&r.kind==='delivery')html+=b('先不交付，回到路上取车／取花','leaveArrival',undefined,false,true);
      if(r.stage==='receipt')html+=`<div class="receipt"><div><span>交付结果</span><strong>${J.LABELS[r.outcome]}</strong></div><div><span>报酬</span><strong>€${r.reward}</strong></div><div><span>已付交通费</span><strong>€${r.paid}</strong></div><div><span>票务待付</span><strong>€${r.fee}</strong></div></div><p>${r.help?'同行人记得你帮忙捡过纸袋。':'这趟没有新增同行人的约定。'} 车已带回，不留未兑现的第四天任务。</p><button class="primary" data-action="journey-return">收好这一趟，回到花店 →</button>`;
      if(!r.outcome&&!['carriage','inspection'].includes(r.stage))html+=b('结束委托，取车返回花店','abandon',undefined,false,true);
      document.getElementById('action-content').innerHTML=html;
      const moving=J.moving(r)&&!(r.stage==='conflict'&&r.conflict.mode==='choice');
      document.getElementById('queue').innerHTML=`<div class="journey-hud"><div><span>委托花</span><strong id="journey-quality"></strong></div><div><span>去程用时</span><strong id="journey-time"></strong></div><div><span>花的位置</span><strong id="journey-cargo"></strong></div></div>${moving?'<div class="journey-dpad" aria-label="按住移动"><button data-j-move="w" aria-label="向上">↑</button><button data-j-move="a" aria-label="向左">←</button><button data-j-move="s" aria-label="向下">↓</button><button data-j-move="d" aria-label="向右">→</button></div>':''}`;
      this.meters();
    }
    meters(){
      const r=this.getState().journeys.run;if(!r)return;
      const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
      set('journey-quality',Math.round(r.quality)+'/100');set('journey-time',Math.floor(r.elapsed)+' / '+r.deadline+' 秒');
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
      rect(25,20,1050,98,'#203d44');text(names[r.stage]+(r.returning?' · 返回花店':''),48,57,25);text('花束 '+Math.round(r.quality)+'/100  ·  '+Math.floor(r.elapsed)+'/'+r.deadline+' 秒  ·  '+(r.auto?'自动行进':'手动／等待选择'),48,94,18,'#dbc89d');
      text(this.isPaused()?'已暂停 · 所有动作与行程停止':'WASD 移动 · B 骑车 · E 取放／帮助 · P 暂停',45,613,18);
    }
  }
  root.JourneyUI=JourneyUI;
})(window);
