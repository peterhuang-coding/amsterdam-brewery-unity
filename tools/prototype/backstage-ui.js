(function(root){
  'use strict';const B=root.Backstage,A=root.BackstageAuto;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class BackstageUI{
    constructor(options){
      Object.assign(this,options);this.keys=new Set();this.aim=null;this.pointer=null;this.overview=false;this.signature='';
      this.scene=new root.BackstageScene(this.canvas);
      this.canvas.addEventListener('pointermove',e=>{if(this.run()){this.trackPointer(e);}});
      this.canvas.addEventListener('pointerleave',()=>{this.pointer=null;this.aim=null;});
      this.canvas.addEventListener('pointerdown',e=>{
        if(!this.run()||this.isPaused()||this.run().auto?.enabled)return;e.preventDefault();this.canvas.focus({preventScroll:true});
        this.trackPointer(e);
        this.perform(e.button===2?'foam':'hook');
      });
      this.canvas.addEventListener('contextmenu',e=>{if(this.run())e.preventDefault();});
      document.addEventListener('pointerdown',e=>{
        const button=e.target.closest('[data-exp-move]');if(!button||!this.run()||this.isPaused()||this.run().auto?.enabled)return;
        e.preventDefault();button.setPointerCapture(e.pointerId);this.keys.add(button.dataset.expMove);this.aim=null;this.pointer=null;
      });
      for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>{const button=e.target.closest('[data-exp-move]');if(button)this.keys.delete(button.dataset.expMove);});
      document.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
      window.addEventListener('blur',()=>this.clear());
    }
    run(){return this.getState().phase==='explore'?this.getState().backstage.run:null;}
    trackPointer(e){const box=this.canvas.getBoundingClientRect();this.pointer={x:(e.clientX-box.left)*1100/box.width,y:(e.clientY-box.top)*640/box.height};this.updateAim();}
    updateAim(){this.aim=this.pointer&&!this.run()?.auto?.enabled?this.scene.worldPoint(this.pointer.x,this.pointer.y,this.run(),this.overview):null;}
    clear(){this.keys.clear();this.aim=null;this.pointer=null;}
    key(e){
      if(!this.run()||this.isPaused())return false;
      const k=e.key.toLowerCase();
      if(this.run().auto?.enabled&&k!=='m'){
        if(/^[1-9]$/.test(k)){e.preventDefault();const choice=A.view(this.run()).choices[Number(k)-1];if(choice&&!e.repeat)this.perform('choice:'+choice.id);return true;}
        if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e','j','f','n','r','q',' '].includes(k)){e.preventDefault();return true;}
        return false;
      }
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();this.keys.add(k);return true;}
      const verb={e:'interact',j:'hook',f:'foam',n:'lure',r:'drag',q:'drop',' ':'dash',m:'map'}[k];
      if(verb){e.preventDefault();if(!e.repeat)this.perform(verb);return true;}return false;
    }
    perform(verb){
      const r=this.run();if(!r||this.isPaused())return;
      this.updateAim();
      if(verb==='cargo'){
        const kinds=new Set(),choices=[];
        for(const id of r.bag){const item=r.items.find(i=>i.id===id);if(kinds.has(item.kind))continue;kinds.add(item.kind);const t=B.TYPES[item.kind];choices.push({label:'放下'+t.name,description:'腾出 '+t.weight+' 格 · 扔在脚边，仍能追回',secondary:true,run:()=>this.perform('cargo-drop:'+id)});}
        this.showModal('背包 / 时间暂停','什么值得带回去？','<p>放下的东西会落在街区，不会直接换钱。修温室水泵需要一件可修零件。</p>',[{label:'先都留着，继续探索'},...choices]);return;
      }
      if(verb.startsWith('cargo-drop:')){
        const id=verb.slice(11);
        if(r.auto?.enabled&&r.auto.event==='capacity')A.choose(r,'drop-'+id);
        else B.command(r,'drop',{x:r.p.x-r.p.fx*90,y:r.p.y-r.p.fy*90,itemId:id});
        this.signature='';this.save();this.render();return;
      }
      if(verb==='play'){
        if(r.auto?.event){const choice=document.querySelector('.exp-choices button');choice?.scrollIntoView({block:'center',behavior:'auto'});choice?.focus({preventScroll:true});}
        else this.showModal('PAUSED · 探索已暂停','先停在这里。','<p>角色、街区和倒计时都暂停了。继续后沿原来的路线走。</p>',[{label:'继续探索'}]);
        return;
      }
      if(verb==='map'){this.overview=!this.overview;this.render();return;}
      if(verb==='return'){this.clear();this.dispatch({type:'returnExplore'});return;}
      if(verb==='mode'||verb==='reroute'||verb==='speed'||verb.startsWith('choice:')){
        this.clear();
        if(verb==='mode'){if(r.auto?.enabled)A.disable(r);else A.enable(r);}
        else if(verb==='reroute')A.enable(r);
        else if(verb==='speed'&&r.auto?.enabled)r.auto.speed=r.auto.speed===1?2:1;
        else if(verb.startsWith('choice:'))A.choose(r,verb.slice(7));
        this.signature='';this.save();this.render();return;
      }
      if(verb==='bail'){
        this.showModal('轻装撤回','放下背包，先回家？','<p>本趟尚未带回的物品会留在街区。已经交给 Noor 的箱子、发现的地点和家中积累都会保留。</p>',[
          {label:'继续探险'},{label:'放下背包，撤回',secondary:true,run:()=>this.perform('confirm-bail')}
        ]);return;
      }
      if(r.auto?.enabled&&verb!=='confirm-bail')return;
      B.command(r,verb==='confirm-bail'?'bail':verb,this.aim);this.signature='';this.save();this.render();
    }
    step(seconds){
      const r=this.run();if(!r)return;
      this.updateAim();
      if(!this.isPaused()&&!document.hidden&&r.status==='active'){
        if(r.auto?.enabled){const before=[r.auto.event,r.status].join('|');A.step(r,seconds);if(before!==[r.auto.event,r.status].join('|'))this.save();}
        else{
          const dx=Number(this.keys.has('d')||this.keys.has('arrowright'))-Number(this.keys.has('a')||this.keys.has('arrowleft'));
          const dy=Number(this.keys.has('s')||this.keys.has('arrowdown'))-Number(this.keys.has('w')||this.keys.has('arrowup'));
          B.step(r,{dx,dy,aim:this.aim},seconds);
        }
      }
      const beat=Math.floor(r.time*2);
      if(!this.isPaused()&&!document.hidden&&r.status==='active'&&!r.auto?.event&&B.zone(r).id==='club'&&B.locationInfo?.(r)?.club?.loud&&this.lastBeat!==beat)this.playBeat?.();
      this.lastBeat=beat;
      this.updateAim();this.render();this.scene.draw(r,{overview:this.overview,aim:this.aim,moving:(r.auto?.enabled?!r.auto.event:this.keys.size>0)&&!this.isPaused()&&r.status==='active'});
    }
    render(){
      const r=this.run();if(!r)return;
      const auto=r.auto?.enabled,z=B.zone(r),near=B.nearest(r),street=B.streetInfo?.(r),tools=Boolean(r.street&&street&&street.id!=='legacy'),dragTarget=B.dragTarget?.(r),location=B.locationInfo?.(r),district=B.districtInfo?.(r);
      const signature=[r.sequence,z.id,near?.id,r.status,this.overview,auto,r.auto?.event,r.auto?.goal,r.auto?.speed,r.street?.situation,r.street?.dragging,location?.club?.phase,location?.door?.open,district?.belt?.direction,district?.water?.wet,district?.repaired,this.isPaused()].join('|');
      const toolState=tools?`空瓶 ${r.street.baits} / 3${r.street.lureCooldown>0?' · 恢复 '+r.street.lureCooldown.toFixed(1)+'s':''} · ${r.street.dragging?'正在拖桶 · 步速降低':'青环空桶可拖动'}`:'';
      const situation=street?`<div class="exp-situation"><strong>${esc(street.title)}</strong><p>${esc(street.hint)}</p>${tools?`<span id="exp-street-tools">${esc(toolState)}</span>`:''}</div>`:'';
      let locationCard=location?.enabled?`<div class="exp-location"><strong>${z.id==='market'?'超市内部 / 货架 · 冷库 · 卸货口':z.id==='club'?'NO SIGNAL / 听清楚再动身':'地图背面 / 今晚的新路线'}</strong><p>${z.id==='market'?(location.door.open?'东墙卸货门已经打开，能从这里抄近路。':'货架北面通冷库，东边卸货门可以从里面打开。'):'夜店的鼓点与静音每六秒交替。鼓点降低警觉；贴近保安仍会被发现。'}</p><span id="exp-music-state"></span>${location.market.clued||location.club.clued?'<small>白天记下了：'+[location.market.clued?'超市路线':'',location.club.clued?'夜店节拍':''].filter(Boolean).join(' / ')+'</small>':''}</div>`:'';
      const musicText=location?.enabled?`夜店 · ${location.club.loud?'♪ 鼓点掩盖动静':'· 静音，空瓶更容易被听见'} · ${Math.ceil(location.club.remaining)}s 后切换`:'';
      locationCard=locationCard.replace('<span id="exp-music-state"></span>','<span id="exp-music-state">'+esc(musicText)+'</span>');
      const districtText=district?.enabled?(z.id==='sorting'?(district.belt.speed===0?'输送带已停':district.belt.speed>0?'→ 输送带正向运转':'← 输送带已经反转'):district.repaired?'水泵改成滴灌，路面保持干燥':district.irrigation>0?'临时关阀 · 还剩 '+Math.ceil(district.irrigation)+'s':district.water.wet?'洒水中 · 湿滑路面会减速':'洒水间歇 · 可以通过'):'';
      if(district?.enabled&&['sorting','greenhouse'].includes(z.id)){
        const sorting=z.id==='sorting',hasSpare=r.bag.some(id=>r.items.find(i=>i.id===id).kind==='salvage');
        locationCard=`<div class="exp-location exp-district"><strong>${sorting?'失物分拣场 / 输送线还在加班':'温室 / 谁来修漏水的明天'}</strong><p>${sorting?'输送带会推着人和货物走。近身 E 停机，钩拉控制器反转；泡沫能暂时卡住覆盖的带面。':'洒水时路面会减速打滑。关阀只管 12 秒；用一件可修零件修泵，以后每夜都能走干路。'}</p><span id="exp-district-state">${esc(districtText)}</span>${!sorting&&!auto&&!district.repaired?`<button class="secondary" data-action="exp-command" data-verb="repair" ${near?.id!=='garden-valve'||!hasSpare?'disabled':''}>修好水泵 · 消耗 1 件零件</button><small>${near?.id!=='garden-valve'?'先靠近西侧灌溉阀。':!hasSpare?'需要包内一件可修零件，可去分拣场找。':'这件零件用掉后，不会再卖成 €5。'}</small>`:''}</div>`;
      }
      const districtNode=document.getElementById('exp-district-state');if(districtNode)districtNode.textContent=districtText;
      const cargoButton=district?.enabled?'<button class="text-button" data-action="exp-command" data-verb="cargo" '+(r.bag.length?'':'disabled')+'>整理背包 · 选择放下什么</button>':'';
      const musicNode=document.getElementById('exp-music-state');if(musicNode)musicNode.textContent=musicText;
      const board=document.getElementById('action-content');
      document.getElementById('exp-clock').textContent=Math.ceil(180-r.time)+'s';
      document.getElementById('exp-load').textContent=B.load(r)+' / '+B.KITS[r.kit].capacity;
      document.getElementById('exp-health').textContent='●'.repeat(Math.max(0,r.p.hp))+'○'.repeat(Math.max(0,3-r.p.hp));
      document.getElementById('exp-context').textContent=near?.label||'靠近人物 / 出口 · E';
      document.getElementById('exp-context').disabled=!near||r.status!=='active';
      document.getElementById('exp-foam').textContent=r.p.foam>0?'泡沫 '+r.p.foam.toFixed(1)+'s':'泡沫 · F';
      document.getElementById('exp-foam').disabled=r.p.foam>0||r.status!=='active';
      document.getElementById('exp-hook').disabled=r.p.hook>0||r.status!=='active';
      document.getElementById('exp-dash').disabled=r.p.dash>0||Boolean(r.street?.dragging)||r.status!=='active';
      document.getElementById('exp-dash').title=r.street?.dragging?'先按 R 放下空桶，再闪避':'';
      const lure=document.getElementById('exp-lure'),drag=document.getElementById('exp-drag'),streetTools=document.getElementById('exp-street-tools');
      if(streetTools)streetTools.textContent=toolState;
      if(lure){
        lure.hidden=!tools;lure.disabled=!tools||auto||this.isPaused()||r.status!=='active'||r.street.baits<=0||r.street.lureCooldown>0;
        lure.textContent=!tools?'空瓶引声 · N':r.street.lureCooldown>0?`空瓶 ${r.street.baits}/3 · ${r.street.lureCooldown.toFixed(1)}s`:`空瓶 ${r.street.baits}/3 · N`;
        lure.setAttribute('aria-label',!tools?'本趟未携带空瓶':`投空瓶引开巡查，剩余 ${r.street.baits} 瓶${r.street.lureCooldown>0?'，冷却 '+r.street.lureCooldown.toFixed(1)+' 秒':''}，快捷键 N`);
      }
      if(drag){
        drag.hidden=!tools;drag.disabled=!tools||auto||this.isPaused()||r.status!=='active'||!dragTarget;
        drag.textContent=r.street?.dragging?'放下空桶 · R':dragTarget?'拖动空桶 · R':'靠近青环桶 · R';
        drag.setAttribute('aria-pressed',String(Boolean(r.street?.dragging)));
        drag.setAttribute('aria-label',r.street?.dragging?'正在拖动空桶，步速降低；按 R 放下':dragTarget?'按 R 抓住面前的空桶，再移动拖行':'靠近带青色圆环的空桶，按 R 抓住');
      }
      document.getElementById('night-clock').textContent=r.discovered.includes('greenhouse')?'西南入口 / 温室后门都能回家':'回店口在西南 · 时间到保住半包';
      if(signature===this.signature)return;this.signature=signature;
      document.body.classList.toggle('is-auto-expedition',Boolean(auto));
      this.canvas.setAttribute('aria-label',(street?street.title+'。'+street.hint+'。':'')+(auto?'城市背面自动探索场景：在行动区选择下一步，阅读选项时时间暂停。':'城市背面手动探险：WASD 移动，J 钩拉，F 泡沫，'+(tools?'N 空瓶引声，R 拖动或放下空桶，':'')+'E 互动，M 地图。'));
      document.getElementById('control-hint').textContent=auto?'点击选项 / 数字键做选择 · M 地图 · P 暂停 · H 帮助':'WASD 移动 · J 钩拉 · F 泡沫 · '+(tools?'N 引声 · R 拖桶 · ':'')+'Space 闪避 · E 互动 · M 地图 · P 暂停';
      document.getElementById('exp-mode').textContent=auto?'切换手动操作':'切换自动探索';
      document.getElementById('exp-mode').disabled=r.status!=='active';
      document.getElementById('exp-speed').hidden=!auto;document.getElementById('exp-speed').textContent='速度 '+(r.auto?.speed||1)+'×';
      document.getElementById('exp-play').hidden=!auto;document.getElementById('exp-play').disabled=r.status!=='active';
      document.getElementById('exp-play').textContent=r.auto?.event?(r.auto.event==='route'?'选择路线，开始探索 ↓':'查看下一步选择 ↓'):'暂停探索 Ⅱ';
      document.getElementById('exp-play-state').textContent=r.status!=='active'?'这一趟已结束':this.isPaused()?'Ⅱ 已暂停':auto?(r.auto.event?'Ⅱ 等你选择 · 时间暂停':'▶ 自动探索中'):'手动操作';
      if(r.status!=='active'){
        this.clear();const reward=B.rewards(r);
        const visitReceipt=reward.visited?.length?'<p class="exp-consequence"><strong>实际走过</strong><br>'+reward.visited.map(id=>esc(B.ZONES.find(z=>z.id===id).name)).join(' → ')+'</p>':'';
        const districtReceipts={'sorting-stopped':'按停了分拣带','sorting-reversed':'钩拉反转了分拣带','greenhouse-valve':'关闭过灌溉阀，争取十二秒干路'};
        const actionReceipt=(reward.outcomes||[]).filter(id=>districtReceipts[id]).map(id=>'<p class="small-note">'+districtReceipts[id]+'</p>').join('');
        board.innerHTML=`<p class="board-eyebrow">BACK ON THE STREET</p><h2>${r.status==='extracted'?'人和东西，都回来了。':r.status==='rescued'?'人先回来。<br>东西下次再说。':'今天就到这里。'}</h2><p class="board-copy">${esc(r.message)}</p><div class="exp-receipt"><div><span>带回艾尔</span><strong>${reward.cups} 杯</strong></div><div><span>密封酒花</span><strong>${reward.hops} 份</strong></div><div><span>零件 / 跑腿费</span><strong>€${reward.cash}</strong></div><div><span>月雾箱</span><strong>${({returned:'交回 Noor',kept:'单独封存',ground:'留在街区',lost:'遗失'})[reward.parcel]||'未取得'}</strong></div></div>${visitReceipt}${actionReceipt}<p class="exp-consequence">${reward.parcel==='returned'?'Noor 下次营业会到酒馆。她记住的是你把箱子还了，不是你跑得有多快。':reward.parcel==='kept'?'这只箱子不会成为酒或原料。下次营业，一位打听箱子的人会进店。':'家中的现金和库存未受损。'}${reward.outcomes?.includes('market-shortcut')?'<br>超市卸货门的捷径已记住，明天地图会留下记录。':''}${reward.outcomes?.includes('club-backstage')?'<br>你穿过了夜店后台，明天 Bram 会听到这件事。':''}${reward.outcomes?.includes('greenhouse-repaired')?'<br>温室的水泵修好了。以后洒水不会再淋湿这条路。':''}${reward.outcomes?.some(x=>x.startsWith('sorting-'))?'<br>分拣场的机器按你的方式运转了一回。':''}${reward.discovered.includes('greenhouse')?'<br>温室捷径已记住，下次出门仍然打开。':''}</p><button class="primary" data-action="exp-command" data-verb="return">回酒馆，收好这一趟 →</button>`;
        this.save();return;
      }
      if(auto){
        const v=A.view(r);
        board.innerHTML=`<p class="board-eyebrow">${r.auto.event?'YOUR CALL · 等你决定':'ON THE WAY · 自动探索'}</p><h2>${esc(v.title)}</h2><p class="board-copy">${esc(v.copy)}</p>${locationCard}<div class="exp-choices">${v.choices.map((c,i)=>`<button data-action="exp-command" data-verb="choice:${c.id}"><span class="exp-choice-key">${i+1}</span><span><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</div>${r.auto.event?'<p class="exp-choice-note">阅读时整条街暂停。点击选项，或按对应数字键。</p>':'<div class="exp-travelling"><span class="live-dot"></span>正在执行你的选择…<button class="text-button" data-action="exp-command" data-verb="reroute">停下来，重新选路</button></div>'}${situation}${cargoButton}<div class="exp-auto-bag"><span>已装包 · ${B.load(r)} / ${B.KITS[r.kit].capacity} 格</span><p>${r.bag.length?r.bag.map(id=>esc(B.TYPES[r.items.find(i=>i.id===id).kind].name)).join(' / '):'沿途遇到普通货物会自动收好。'}</p></div><p class="exp-feed" role="status">${esc(r.message)}</p><button class="text-button" data-action="exp-command" data-verb="bail">放下背包，轻装撤回</button>`;
        document.getElementById('story-line').innerHTML='<span class="quote-mark">“</span><p>本店支持自主决策。责任也会自主地找到你。</p><span class="story-author">— 后门员工手册</span>';return;
      }
      const parcelText=({ground:'夜店的冷藏箱还在那里',carried:'箱内是月雾 · 可交回 Noor',returned:'已交回 Noor · €14 待结算',lost:'冷藏箱落在街区'})[r.parcel];
      board.innerHTML=`<p class="board-eyebrow">CITY BACKSTAGE / 第 ${r.day} 趟</p><h2>跟着灯走。<br>留条路回来。</h2><p class="board-copy">${esc(B.KITS[r.kit].name)} · 普通货物靠近装包。<br>点向目标下钩，闪避和泡沫可以救场。</p>${locationCard}${situation}<div class="exp-objectives"><div class="${r.parcel==='returned'?'done':''}"><span>◇</span><div><strong>一箱“进口酵母”</strong><p>${parcelText}。${r.parcel==='returned'?'下次营业会在酒馆再见。':r.parcel==='carried'?'交回她，或带到出口自行保留。':'占 3 格，靠近按 E。'}</p></div></div><div class="${r.discovered.includes('noor')?'done':''}"><span>♧</span><div><strong>红灯街的 Noor</strong><p>西北运河边，她刚下夜班。带箱子过去，或先问问她。</p></div></div><div class="${r.discovered.includes('greenhouse')?'done':''}"><span>✧</span><div><strong>玻璃后面，有人在生活</strong><p>${r.discovered.includes('greenhouse')?'温室捷径已记住。下次也能进去。':'东北的温室亮着灯。拉开外面的维护拉杆，找路进去。'}</p></div></div></div><div class="exp-bag"><div class="exp-bag-title"><strong>背包</strong><span>Q 扔下最后一件</span></div>${r.bag.length?r.bag.map(id=>{const i=r.items.find(x=>x.id===id),t=B.TYPES[i.kind];return `<span class="exp-cargo" style="--cargo:${t.color}">${esc(t.name)}<small>${t.weight} 格</small></span>`;}).join(''):'<p>先拿附近的封口瓶试试手。<br>价值更高的东西，不一定更好带。</p>'}</div><p class="exp-feed" role="status">${esc(r.message)}</p>${cargoButton}<div class="exp-board-actions"><button class="secondary" data-action="exp-command" data-verb="map">${this.overview?'返回跟随视角':'看看全图'} · M</button><button class="text-button" data-action="exp-command" data-verb="bail">放下背包，轻装撤回</button></div>`;
      document.getElementById('story-line').innerHTML='<span class="quote-mark">“</span><p>本店坚决反对违法交易。具体定义请咨询本店法务。</p><span class="story-author">— 夜店后门告示</span>';
    }
  }
  root.BackstageUI=BackstageUI;
})(window);
