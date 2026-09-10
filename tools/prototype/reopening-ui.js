(function () {
  'use strict';
  const R=window.Reopening;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SAVE_KEY='ab_reopening_v1';
  const ui={selected:null,beer:'blond',premium:false,modal:null,returnFocus:null,brewElapsed:0,sound:true,tutorialSeen:false,signature:'',lastFrame:performance.now(),lastSave:0,noticeTimer:null,audio:null};
  let state=R.createGame(seedFromUrl());
  let restored=false,saveError=false;
  try {
    const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
    if(saved){const valid=R.restore(saved.game||saved);if(valid){state=valid;restored=state.phase!=='welcome';ui.tutorialSeen=Boolean(saved.tutorialSeen);ui.sound=saved.sound!==false;ui.brewElapsed=state.phase==='brew'&&Number.isFinite(saved.brewElapsed)?Math.max(0,Math.min(6,saved.brewElapsed)):0;}else saveError=true;}
  } catch {saveError=true;}
  const scene=new PubScene($('pub-canvas'));
  const DAYS=['试营业，试着活着','好评与坏账','合法地重新开业'];
  const PORTRAITS={lotte:'👩🏻',bram:'🧔🏽',marta:'👩🏼‍🍳'};
  const $board=$('action-content');

  function seedFromUrl(){const n=Number(new URLSearchParams(location.search).get('seed'));return Number.isSafeInteger(n)&&n>0?n:42;}
  function money(n){return '€'+Math.round(Number(n)||0);}
  function save(){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,game:state,brewElapsed:ui.brewElapsed,tutorialSeen:ui.tutorialSeen,sound:ui.sound}));$('save-status').textContent='进度已保存在这台设备';}
    catch{$('save-status').textContent='当前浏览器无法保存 · 请保持页面打开';}
  }
  function sound(kind='tap'){
    if(!ui.sound)return;
    try{
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      ui.audio=ui.audio||new AudioContext();
      if(ui.audio.state==='suspended')ui.audio.resume().catch(()=>{});
      const now=ui.audio.currentTime;
      const notes=kind==='good'?[523.25,659.25,783.99]:kind==='bad'?[196,164.81]:[392];
      notes.forEach((freq,i)=>{const osc=ui.audio.createOscillator(),gain=ui.audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,now+i*.07);gain.gain.linearRampToValueAtTime(.04,now+i*.07+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.07+.21);osc.connect(gain);gain.connect(ui.audio.destination);osc.start(now+i*.07);osc.stop(now+i*.07+.23);});
    }catch{/* Audio never blocks game actions. */}
  }
  function notify(message,bad=false){
    if(!message)return;
    clearTimeout(ui.noticeTimer);$('notice').textContent=message;$('notice').className='notice visible'+(bad?' bad':'');
    ui.noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),4300);
  }
  function dispatch(action){
    if(ui.modal)return;
    const previous=state.phase;
    const result=R.act(state,action);
    if(!result.ok){notify(result.message||'现在无法这样操作。',true);return;}
    state=result.state;
    if(action.type==='prepare'&&action.kind==='brew')ui.brewElapsed=0;
    if(action.type==='brewHit')ui.brewElapsed=0;
    if(action.type==='serve'||action.type==='water')ui.selected=null;
    if(result.message)notify(result.message);
    sound(['serve','brewHit','upgrade','finish'].includes(action.type)?'good':'tap');
    save();render();
    if(previous!==state.phase&&matchMedia('(max-width: 800px)').matches&&['brew','forage','summary','ending'].includes(state.phase))$('action-content').scrollIntoView({behavior:'auto',block:'start'});
    if(action.type==='open'&&state.day===1&&!ui.tutorialSeen)showFirstGuest();
    syncEvent();
  }
  function modal(kicker,title,body,buttons,kind='normal'){
    ui.returnFocus=document.activeElement;
    ui.modal={kicker,title,body,buttons,kind};
    $('dialog-kicker').textContent=kicker;$('dialog-title').textContent=title;$('dialog-body').innerHTML=body;
    $('dialog-actions').innerHTML=buttons.map((b,i)=>`<button class="${b.secondary?'secondary':'primary'}" data-modal-action="${i}" ${b.disabled?'disabled':''}>${esc(b.label)}${b.description?`<small>${esc(b.description)}</small>`:''}</button>`).join('');
    $('overlay').hidden=false;
    $('dialog-actions').querySelector('button:not(:disabled)').focus();
    updateMeters();
  }
  function closeModal(){ui.modal=null;$('overlay').hidden=true;ui.lastFrame=performance.now();if(ui.returnFocus?.isConnected)ui.returnFocus.focus({preventScroll:true});}
  function showFirstGuest(){
    modal('FIRST CUSTOMER · 时钟已暂停','先给 Marta 倒一杯。','<p>她想要金色艾尔。选中她，选酒，再点「开始倒酒」。</p><p>杯里的指针进入浅绿色区域时，点「收杯」或按 <kbd>Space</kbd>。倒得好，她会多留一点小费。</p><p>先看清楚再营业。需要想一想，随时按 <kbd>P</kbd> 暂停。</p>',[{label:'知道了，接待第一位客人',run:()=>{ui.tutorialSeen=true;save();}}]);
  }
  function syncEvent(){
    if(ui.modal||state.phase!=='night'||state.night.event?.status!=='pending')return;
    const event=R.NIGHT_EVENTS[state.night.event.id],stock=R.stock(state,'blond')+R.stock(state,'stout');
    modal('UNINVITED · 阅读与选择时暂停',event.title,`<p class="event-quote">“${esc(event.quote)}”</p><p>手头 ${money(state.cash)} · 还剩 ${stock} 杯酒。所有费用会计入今晚的账。</p>`,event.choices.map(choice=>({
      label:choice.label,description:choice.description,
      disabled:choice.id==='comp'?stock<1:choice.id==='samples'?stock<2:choice.id==='paperwork'?state.cash<10:false,
      secondary:choice.id==='refuse'||choice.id==='tasting',run:()=>dispatch({type:'event',choice:choice.id})
    })),'event');
  }
  function showHelp(){
    if(ui.modal)return;
    modal('HOW TO PLAY · 阅读时暂停','照顾好今天，也准备好明天。',
      '<p><b>白天两次行动。</b>酿酒花 €12，得到 6 杯；帮咖啡店赚 €18；去北岸运河打捞酒花和押金瓶，躲开需要清运费的单车残骸；拜访 Lotte，答应今晚留给她一杯黑啤。</p>'+
      '<p><b>夜晚接待客人。</b>点击想先服务的人，核对口味和预算。每次开始倒酒消耗一杯库存；指针进入绿色区域再收杯。价格超过预算、口味不对或倒得太差，客人不会满意。</p>'+
      '<p><b>每晚都有麻烦。</b>房东、网红、检查员会提出要求。先看成本，再选应对方式；这时游戏暂停。基础租金 €18，事件会影响实际账单。</p><p><b>第三晚重开。</b>前两晚可选一件设备。最后留下至少 €100，并累计让 12 位客人满意。</p>'+
      '<p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 选客人 · <kbd>E</kbd> 开始倒酒 · <kbd>Space</kbd> 收杯 / 酿造确认 / 打捞 · <kbd>A</kbd><kbd>D</kbd> 移动小船 · <kbd>P</kbd> 暂停 · <kbd>H</kbd> 帮助。所有操作也有可点击按钮。</p>'+
      '<p>没酒可以送杯水善后。失手也能继续；返回白天后，去咖啡店赚一笔备货钱。</p>',[{label:'回到酒吧'}]);
  }
  function pause(reason='歇口气，客人会等你。'){
    if(ui.modal)return;
    modal('PAUSED · 时间停止','暂时逃避现实。',`<p>${esc(reason)}</p><p>船、酒、客人的耐心都停在这里。<br>房东暂时也不能发明新费用。</p>`,[{label:'回去面对现实'},{label:'重新开始这三天',secondary:true,run:()=>confirmRestart()}]);
  }
  function confirmRestart(){
    modal('NEW BEGINNING','重新开始这三天？','<p>当前三天的进度会被新一局替换。你可以继续使用这张相同的顾客安排。</p>',[{label:'保留进度，继续玩'},{label:'重新开始',secondary:true,run:()=>restart(state.seed)}]);
  }
  function restart(seed){state=R.createGame(seed);ui.selected=null;ui.beer='blond';ui.premium=false;ui.brewElapsed=0;ui.tutorialSeen=false;save();render();window.scrollTo({top:0,behavior:'auto'});}
  function selectedCustomer(){const waiting=R.customers(state);return waiting.find(c=>c.id===ui.selected)||waiting[0]||null;}
  function selectedPour(){return state.night?.pours.find(p=>p.customerId===ui.selected)||null;}
  function beerDot(id){return `<i class="beer-dot" style="background:${R.BEERS[id].color}"></i>`;}
  function topCopy(){
    if(state.phase==='welcome')return ['AMSTERDAM · 房东还没来封门','再撑三个晚上。'];
    if(state.phase==='ending')return ['TWEEDE KANS · 三天之后',state.result?.won?'恭喜，还能继续交租。':'店倒了，房租没倒。'];
    if(state.phase==='forage')return ['DAY '+state.day+' · 北岸运河 / 限时 30 秒','在水里，找点利润。'];
    if(state.phase==='summary')return [`DAY ${state.day} · 打烊之后`,'今天留下了什么。'];
    return [`DAY ${state.day} / 3 · ${state.phase==='night'?'营业中':'白天的准备'}`,DAYS[state.day-1]];
  }
  function render(){
    const oldFocus=document.activeElement?.dataset?.focus;
    const [kicker,title]=topCopy();$('chapter-kicker').textContent=kicker;$('chapter-title').textContent=title;
    $('pub-canvas').setAttribute('aria-label',state.phase==='forage'?'北岸运河三航道打捞场景，小船和漂浮物随行动变化；右侧有完整文字信息和操作按钮':'运河边的 Tweede Kans 酒吧，酒瓶随库存变化，顾客和升级出现在柜台前');
    $('cash').textContent=money(state.cash);
    $('blond-stock').innerHTML=R.stock(state,'blond')+' <small>杯</small>';$('stout-stock').innerHTML=R.stock(state,'stout')+' <small>杯</small>';
    $('day-track').innerHTML=DAYS.map((name,i)=>`<div class="day-step ${state.day===i+1?'current':state.day>i+1?'complete':''}"><span class="day-number">${state.day>i+1?'✓':i+1}</span><span>${name}</span></div>`).join('');
    $('sound-button').textContent=ui.sound?'♪':'♩';$('sound-button').setAttribute('aria-label',ui.sound?'关闭声音':'开启声音');
    $('equipment').innerHTML=state.upgrades.map(id=>`<span>${esc(R.UPGRADES[id].name)}</span>`).join('')+(state.music?'<span>♫ 乐队今晚到场</span>':'');
    $('room-time').textContent=state.phase==='night'?'OPEN · '+DAYS[state.day-1]:state.phase==='forage'?'NOORD · 城市把利润扔进了水里':state.phase==='brew'?'BREWING · 比创业鸡汤有营养':state.phase==='prep'?'DAYLIGHT · 好好准备，晚上挨宰':'TWEEDE KANS · 运河边';
    $('room-caption').textContent=state.phase==='forage'?'环保与盈利偶尔顺路。单车除外。':['summary','ending'].includes(state.phase)&&state.reports[state.reports.length-1]?.promiseBroken?'没有罚单的人情债，也会被记住。':state.music?'至少今晚，音乐比催租声大。':state.promises.lotte?'给 Lotte 留一杯黑啤。信誉比许可证便宜。':state.day===3?'今晚的目标：灯亮着，门没被封。':'这家店，还没倒。';
    renderQueue();renderBoard();renderPours();renderStory();
    const log=(state.log||[]).slice(0,3);
    $('journal-entries').innerHTML=log.length?log.map(line=>`<li>${esc(line)}</li>`).join(''):'<li>房东说钥匙免费，保管钥匙的杯垫另算。</li><li>三天后开业。许可证需要营业流水，营业需要许可证。</li><li>街坊只想喝杯好酒。他们的要求居然最合理。</li>';
    $('control-hint').textContent=state.phase==='forage'?'A / D 换航道 · Space 打捞 · P 暂停':state.phase==='brew'?'Space 确认工艺 · P 暂停 · H 帮助':state.phase==='night'?'1 / 2 / 3 选客 · E 倒酒 · Space 收杯 · P 暂停':'鼠标或键盘操作 · H 帮助 · P 暂停';
    ui.signature=signature();updateMeters();scene.draw(state,performance.now(),ui.selected);
    if(oldFocus){const next=document.querySelector(`[data-focus="${CSS.escape(oldFocus)}"]`);if(next&&!next.disabled)next.focus({preventScroll:true});}
  }
  function renderQueue(){
    const waiting=R.customers(state);
    const current=selectedCustomer();ui.selected=current?.id||null;
    $('queue-title').textContent=state.phase==='night'?'柜台前 · 选一位先服务':'这条街上的熟面孔';
    if(state.phase==='night'){
      if(!waiting.length){
        const next=state.night.orders.filter(o=>o.status==='future').sort((a,b)=>a.arrival-b.arrival)[0];
        $('queue').innerHTML=`<div class="guest-empty"><strong>片刻安静。</strong><span>${next?'下一位客人正在路上。可以查看库存，准备接单。':'最后一杯已经送出。'}</span></div>`;
      }else $('queue').innerHTML=waiting.map((o,i)=>`<button class="guest-card ${o.id===ui.selected?'selected':''}" data-action="select" data-id="${esc(o.id)}" data-focus="guest-${esc(o.id)}" aria-label="服务 ${esc(o.name)}，想喝${esc(R.BEERS[o.beer].name)}，预算${money(o.budget)}" aria-pressed="${o.id===ui.selected}"><div class="guest-header"><span class="avatar">${PORTRAITS[o.person]||'🧑🏻'}</span><span><strong>${esc(o.name)}</strong><small>${i+1} 号位 · 预算 ${money(o.budget)}</small></span></div><div class="guest-order">${beerDot(o.beer)}${esc(R.BEERS[o.beer].short||R.BEERS[o.beer].name)}</div><div class="patience" data-patience="${esc(o.id)}"><i></i></div><div class="guest-note">${state.night.pours.some(p=>p.customerId===o.id)?'正在为这位客人倒酒':o.person==='lotte'&&state.promises.lotte?'你答应为她留一杯黑啤':'还可以等 '}<span data-patience-text="${esc(o.id)}"></span></div></button>`).join('');
    }else $('queue').innerHTML=['marta','bram','lotte'].map(id=>`<div class="guest-card"><div class="guest-header"><span class="avatar">${PORTRAITS[id]}</span><span><strong>${esc(R.PEOPLE[id].name)}</strong><small>${esc(R.PEOPLE[id].role)}</small></span></div><div class="guest-order">${friendStatus(id)}</div></div>`).join('');
  }
  function friendStatus(id){
    if(id==='lotte'&&['summary','ending'].includes(state.phase)){const report=state.reports[state.reports.length-1];if(report?.promiseKept)return '你留了酒，她记住了';if(report?.promiseBroken)return '那杯没等到的黑啤，她记得';}
    if(id==='lotte'&&state.promises.lotte)return '约好了，今晚喝黑啤';
    if(id==='lotte'&&state.music)return '她把乐队带来了';
    if(state.friends[id]>0)return '开始记得你 · '+state.friends[id]+' 次好印象';
    return {marta:'愿意尝尝你的手艺',bram:'咖啡店里正忙着',lotte:'想念窗边的老位子'}[id];
  }
  function renderStory(){
    let person='lotte',text='这条运河连倒影都在涨房租。给我留杯黑的。';
    if(state.phase==='night'){const guest=selectedCustomer();if(guest){person=guest.person||guest.name;text=guest.quote;}}
    else if(state.music){person='lotte';text='你记得给我留的那杯酒。我也记得帮你叫上他们。';}
    else if(state.hops){person='bram';text='北岸带回来的酒花很香，留给下一桶。';}
    else if(state.friends.marta>0){person='marta';text='不错。今天带来的投诉信，可以改成情书草稿。';}
    $('story-line').innerHTML=`<span class="quote-mark">“</span><p>${esc(text)}</p><span class="story-author">— ${esc(R.PEOPLE[person]?.name||person)}</span>`;
  }
  function renderBoard(){
    const headings=`<p class="board-eyebrow">TWEEDE KANS / ${state.phase==='night'?'SERVICE':'REOPENING'}</p>`;
    if(state.phase==='welcome'){
      $board.innerHTML=headings+'<h2>啤酒要新鲜。<br>账单也是。</h2><p class="board-copy">接手一家快倒闭的酒吧。房东要现金，检查员要手续，街坊只想喝点像样的。<br>你有三天，证明这门生意值得被继续收租。</p>'+
        '<ol class="rule-list"><li><em>早</em><span>下运河捞点东西，把来历酿成故事。</span></li><li><em>晚</em><span>卖酒，接客，应付不请自来的麻烦。</span></li><li><em>后</em><span>数钱、还人情，留住明天的库存。</span></li></ol>'+
        '<button class="primary" data-action="start" data-focus="start">推开店门 →</button>'+
        `<label class="start-seed">这三天的顾客安排 <input id="seed-input" type="number" min="1" max="2147483647" step="1" value="${state.seed}" aria-label="顾客安排种子"></label>`+
        '<div class="goal-strip"><span>三天完整试玩</span><span>可暂停 · 自动存档</span></div>';
      return;
    }
    if(state.phase==='prep'){
      const used=state.prepared||[],blocked=state.actions<=0;
      $board.innerHTML=headings+`<h2>${state.actions?'今晚，准备些什么？':'准备好了，天也快黑了。'}</h2><div class="action-budget"><span>今天还可以做 <b>${state.actions}</b> 件事</span><span class="action-pips">${[0,1].map(i=>`<i class="${i<state.actions?'available':''}"></i>`).join('')}</span></div>`+
        (state.promises.lotte?'<p class="promise-note">约定：给 Lotte 留一杯黑啤。她在今晚晚些时候到店。</p>':'')+
        `<p class="field-label">酿一批酒 · 1 次行动 / €12 / 6 杯${state.hops?' · 北岸酒花提升品质':''}</p><div class="brew-picks">${Object.values(R.BEERS).map(b=>`<button class="brew-pick" data-action="brew" data-beer="${b.id}" data-focus="brew-${b.id}" ${blocked||state.cash<b.cost?'disabled':''}>${beerDot(b.id)}<strong>${esc(b.name)}</strong><small>${esc(b.description)}</small></button>`).join('')}</div>`+
        prepButton('coffee','☕','给 Bram 当半天「联合创始人」','工资 €18，头衔免费。今晚他会多给一点耐心。',blocked||used.includes('coffee'))+
        prepButton('visit','✉','到桥边找 Lotte','答应留黑啤；她会带来乐队，音量盖过催租声。',blocked||used.includes('visit'))+
        prepButton('surf','≈','去北岸运河「循环经济」','30 秒打捞：酒花提品质，押金瓶变库存，别捞单车。',blocked||used.includes('surf'))+
        `<div class="board-bottom"><button class="primary" data-action="open" data-focus="open">${blocked?'翻开营业牌 →':'准备就绪，开始营业 →'}</button><p class="small-note">${state.actions?'现在开门会放弃剩余准备机会。':'今天的选择，马上就能看见回报。'} 每晚租金 €18。</p></div>`;
      return;
    }
    if(state.phase==='brew'){
      const b=R.BEERS[state.brew.beer],hits=state.brew.hits;
      $board.innerHTML=headings+`<h2>这一桶，${esc(b.name)}。</h2><p class="board-copy">三段工艺，浅绿区域最理想。<br>按 <b>Space</b> 或按钮确认；失手也会得到一批酒。</p><div class="brew-stages">${['糖化','煮沸','发酵'].map((name,i)=>`<span class="brew-stage ${i===hits.length?'current':i<hits.length?'done':''}">${i<hits.length?'✓ ':''}${name}</span>`).join('')}</div><div class="brew-vessel"><img src="assets/img/gen/brew.jpg" alt="冒着蒸汽的铜制酿酒锅"></div><div class="score-chips">${hits.map(n=>`<span>${n>.85?'完美':n>.45?'稳稳完成':'下段再来'}</span>`).join('')}</div>${timingTrack('brew-meter')}<div class="timing-labels"><span>太早</span><span>恰到好处</span><span>过火</span></div><button class="primary" data-action="brew-hit" data-focus="brew-hit">确认${['糖化','煮沸','发酵'][hits.length]} · Space</button><p class="small-note">每段最多 6 秒；超过时机会自动进入下一段。<br>已花费 €12 和 1 次行动，完成后入库 6 杯。</p><button class="text-button" data-action="cancel-brew">放弃这批酒</button>`;
      return;
    }
    if(state.phase==='forage'){
      const f=state.forage;
      $board.innerHTML=headings+'<h2>循环经济，<br>从捡别人不要的开始。</h2><p class="board-copy">用 A / D 换航道，漂浮物进入浅绿区域时按 Space 打捞。带回 3 份收获，或 30 秒后靠岸。</p>'+
        `<div class="haul-strip"><strong>收获 ${f.haul} / 3</strong><span>酒花 ${state.hops} 份</span></div><div class="forage-legend"><span>✿ 酒花 · 下一批品质 +1</span><span>▥ 密封瓶 · 库存 +2 杯</span><span>♧ 单车 · 清运费 −€2</span></div><div class="lane-track">${[0,1,2].map(i=>`<span class="${f.lane===i?'current':''}">${['左','中','右'][i]}航道 ${f.lane===i?'▲':''}</span>`).join('')}</div><div class="forage-items">${f.items.filter(i=>i.status==='floating').map(i=>`<div><span>${['左','中','右'][i.lane]} · ${({hops:'✿ 酒花',bottle:'▥ 密封瓶',junk:'♧ 单车'})[i.kind]}</span>${timingTrack('flotsam-'+i.id)}</div>`).join('')||'<p class="small-note">上游的“商机”正在漂来。</p>'}</div><div class="forage-controls"><button class="secondary" data-action="forage-move" data-direction="-1" aria-label="向左换航道" ${f.lane===0?'disabled':''}>← A</button><button class="primary" data-action="forage-catch" data-focus="forage-catch">打捞 · Space</button><button class="secondary" data-action="forage-move" data-direction="1" aria-label="向右换航道" ${f.lane===2?'disabled':''}>D →</button></div><p class="small-note">躲过单车不用付费。城市的环保工作，也可以留给城市。</p><button class="text-button" data-action="dock">带着已有收获靠岸 →</button>`;
      return;
    }
    if(state.phase==='night'){renderService(headings);return;}
    if(state.phase==='summary'){
      const report=state.reports[state.reports.length-1];
      $board.innerHTML=headings+`<h2>第 ${state.day} 晚，打烊了。</h2><p class="board-copy">擦干杯子，看看今晚留下了什么。</p>${receipt(report)}<p class="report-note">${esc(report.note||'明天的客人，会记得今天的招待。')}</p>`+
        (report.promiseKept?'<p class="promise-note">留给 Lotte 的黑啤没有卖掉。她记住了你的承诺，乐队会在下一晚到场。</p>':report.promiseBroken?'<p class="risk-note">Lotte 没喝到答应的黑啤。下一次，可以先留够她那一杯。</p>':'')+
        (state.day<3?'<p class="field-label">给店里添一件东西 · 免费选一件</p>'+Object.values(R.UPGRADES).filter(u=>!state.upgrades.includes(u.id)).map(u=>`<button class="upgrade-card" data-action="upgrade" data-upgrade="${u.id}" data-focus="upgrade-${u.id}"><strong>${esc(u.name)} →</strong><small>${esc(u.description)}</small><small>${esc(u.tradeoff)}</small></button>`).join('')+'<button class="text-button" data-action="next">先这样，开始下一天 →</button>':'<button class="primary" data-action="finish" data-focus="finish">看看这三天的故事 →</button>');
      return;
    }
    const won=state.result?.won;
    $board.innerHTML=headings+`<h2>${esc(state.result?.title||(won?'招牌重新亮了。':'下一次机会，还在。'))}</h2><p class="board-copy">${esc(state.result?.description||'你让这家店重新有了声音。')}</p><div class="result-badge">${won?'OPEN':'AGAIN'}</div><div class="receipt"><div><span>留下的现金</span><strong>${money(state.cash)} / €100</strong></div><div><span>满意的客人</span><strong>${state.totalSatisfied} / 12</strong></div><div><span>亲手送出的酒</span><strong>${state.totalServed} 杯</strong></div></div><div class="friend-memories">${['lotte','bram','marta'].map(id=>`<div class="friend-memory"><strong>${esc(R.PEOPLE[id].name)}</strong>${friendStatus(id)}</div>`).join('')}</div><button class="primary" data-action="replay" data-focus="replay">这次换一种安排，再试一次 →</button><button class="text-button" data-action="new-seed">换一组客人，重新开店</button><p class="small-note">${won?'这次，你给这家店留下了一个明天。':'试着多留库存、先照顾快等不及的人。每次重来都从同样的资源开始。'}</p>`;
  }
  function prepButton(kind,icon,title,description,disabled){return `<button class="action-card" data-action="prepare" data-kind="${kind}" data-focus="prepare-${kind}" ${disabled?'disabled':''}><span class="action-icon">${icon}</span><span><strong>${title}</strong><small>${description}</small></span><span class="cost">${(state.prepared||[]).includes(kind)?'已完成':'1 次'}</span></button>`;}
  function timingTrack(id){return `<div class="timing-track" id="${id}"><i class="sweet-zone"></i><i class="perfect-zone"></i><i class="needle"></i></div>`;}
  function receipt(r){return `<div class="receipt"><div><span>今晚营业额</span><strong>+${money(r.earned)}</strong></div><div><span>送出的酒 / 满意顾客</span><strong>${r.served} / ${r.satisfied}</strong></div><div><span>错过的顾客</span><strong>${r.lost}</strong></div><div><span>今夜租金</span><strong>−${money(r.rent)}</strong></div><div class="receipt-total"><span>手头留下</span><strong>${money(r.cash)}</strong></div></div>`;}
  function renderService(headings){
    const guest=selectedCustomer();
    if(!guest){$board.innerHTML=headings+'<h2>把杯子擦亮，<br>等等下一位。</h2><p class="board-copy">客人们正在穿过运河上的桥。<br>先看看还剩多少酒，今晚的承诺有没有留够。</p>'+nightPlan()+closeButton();return;}
    if(!R.BEERS[ui.beer])ui.beer=guest.beer;
    const beer=R.BEERS[ui.beer],price=beer.price+(ui.premium?4:0),pour=selectedPour();
    const full=state.night.pours.length>=(state.upgrades.includes('doubleTap')?2:1);
    if(pour){
      $board.innerHTML=headings+`<div class="order-title"><h2>${esc(guest.name)}</h2><span class="order-budget">正在为这位客人倒酒</span></div><p class="order-quote">“${esc(guest.quote)}”</p><p class="service-note">${beerDot(pour.beer)}${esc(R.BEERS[pour.beer].name)} · 报价 ${money(pour.price)}<br>${pour.aged?'陈酿 · 满意后额外 €2':'品质 '+pour.quality+'/3'} · 这一杯已从库存扣除</p>${timingTrack('service-pour')}<div class="timing-labels"><span>太少</span><span>恰到好处</span><span>满出来了</span></div><button class="primary" data-action="serve" data-id="${esc(guest.id)}" data-focus="serve-${esc(guest.id)}">收杯，端给 ${esc(guest.name)} · Space</button><p class="small-note">浅绿色区域最理想。按 P 可随时暂停。</p>`+
        state.night.pours.filter(p=>p.customerId!==guest.id).map(p=>{const other=state.night.orders.find(o=>o.id===p.customerId);return `<button class="secondary" data-action="select" data-id="${esc(p.customerId)}">另一杯正在倒：${esc(other.name)} →</button>`;}).join('')+
        `<button class="text-button" data-action="water" data-id="${esc(guest.id)}">这杯不卖了，送水善后</button>`+nightPlan()+closeButton();
      return;
    }
    $board.innerHTML=headings+`<div class="order-title"><h2>${esc(guest.name)}</h2><span class="order-budget">预算 ${money(guest.budget)}</span></div><p class="order-quote">“${esc(guest.quote)}”</p><label class="field-label">想喝 ${esc(R.BEERS[guest.beer].name)} · 先选一杯</label><div class="beer-options">${Object.values(R.BEERS).map(b=>`<button class="beer-option ${ui.beer===b.id?'selected':''}" data-action="beer" data-beer="${b.id}" data-focus="beer-${b.id}" aria-pressed="${ui.beer===b.id}" ${pour?'disabled':''}>${beerDot(b.id)}${esc(b.name)}<small>库存 ${R.stock(state,b.id)} 杯 · ${money(b.price)} 起</small></button>`).join('')}</div><label class="field-label">这一杯的报价</label><div class="price-options"><button class="price-option ${!ui.premium?'selected':''}" data-action="price" data-premium="false" data-focus="price-fair" ${pour?'disabled':''}>街坊价 ${money(beer.price)}</button><button class="price-option ${ui.premium?'selected':''} ${beer.price+4>guest.budget?'over':''}" data-action="price" data-premium="true" data-focus="price-premium" ${pour?'disabled':''}>加价 ${money(beer.price+4)}</button></div>`+
      (price>guest.budget&&!pour?'<p class="risk-note">这个报价超过预算，客人会拒绝付款。</p>':'')+
      (ui.beer!==guest.beer&&!pour?'<p class="risk-note">这款酒不合客人的口味，会影响满意度。</p>':'')+
      (guest.person==='lotte'&&state.promises.lotte?'<p class="promise-note">她还记得你约好的那杯黑啤。</p>':'')+
      (pour?`<p class="service-note">杯子正在装满。看左侧倒酒条，在浅绿色区域收杯。</p><button class="primary" data-action="serve" data-id="${esc(guest.id)}" data-focus="serve-${esc(guest.id)}">收杯，端给 ${esc(guest.name)} · Space</button>`:`<button class="primary" data-action="pour" data-focus="pour" ${R.stock(state,ui.beer)<=0||full?'disabled':''}>${full?'酒头正在忙':R.stock(state,ui.beer)<=0?'这款酒卖完了':'开始倒酒 · '+money(price)+' · E'}</button><p class="small-note">每次开始倒酒消耗 1 杯。倒进绿色区域，收杯才有好口感。</p>`)+
      `<button class="text-button" data-action="water" data-id="${esc(guest.id)}">${pour?'这杯不卖了，送水善后':'送杯水，婉拒这一单'}</button>`+nightPlan()+closeButton();
  }
  function nightPlan(){return `<div class="goal-strip"><span>今晚已收入 ${money(state.night.earned)}</span><span>满意 ${state.night.satisfied} 位</span></div>${state.promises.lotte?'<p class="small-note">留杯约定：Lotte · 黑啤</p>':''}`;}
  function closeButton(){return '<div class="board-bottom"><button class="text-button" data-action="close-night">提前打烊，看看今天的账 →</button></div>';}
  function renderPours(){
    $('pour-stations').innerHTML=state.phase==='night'?state.night.pours.map(p=>{const guest=state.night.orders.find(o=>o.id===p.customerId);return `<div class="pour-station"><span><strong>${esc(guest?.name||'这一杯')}</strong><small>${esc(R.BEERS[p.beer].short)} · ${money(p.price)}</small></span>${timingTrack('pour-'+p.customerId)}<button data-action="serve" data-id="${esc(p.customerId)}" data-focus="tap-${esc(p.customerId)}" aria-label="为 ${esc(guest?.name)} 收杯">收杯 ↗</button></div>`;}).join(''):'';
  }
  function signature(){return JSON.stringify([state.phase,state.day,state.cash,state.actions,state.batches,state.friends,state.promises,state.upgrades,state.hops,state.music,state.brew,state.night?.orders.map(o=>[o.id,o.status]),state.night?.pours.map(p=>[p.customerId,p.beer,p.price]),state.night?.earned,state.night?.event,state.forage&&[state.forage.lane,state.forage.haul,state.forage.items.map(i=>i.status)],state.reports.length]);}
  function updateMeters(){
    if(state.phase==='brew'){const needle=$('brew-meter')?.querySelector('.needle');if(needle)needle.style.left=Math.min(.995,ui.brewElapsed/6)*100+'%';}
    if(state.phase==='night'){
      const left=Math.max(0,state.night.duration-state.night.elapsed),mm=Math.floor(left/60),ss=Math.floor(left%60);
      $('night-clock').textContent=`${ui.modal?'已暂停 · ':''}打烊前 ${mm}:${String(ss).padStart(2,'0')}`;
      R.customers(state).forEach(o=>{const seconds=Math.max(0,o.patience-(state.night.elapsed-o.arrival)),node=document.querySelector(`[data-patience="${CSS.escape(o.id)}"]`);if(node){node.querySelector('i').style.transform=`scaleX(${Math.min(1,seconds/o.patience)})`;node.classList.toggle('urgent',seconds<10);}const label=document.querySelector(`[data-patience-text="${CSS.escape(o.id)}"]`);if(label)label.textContent=Math.ceil(seconds)+'s';});
      state.night.pours.forEach(p=>{const progress=R.pourProgress(state,p),position=Math.min(.995,progress)*100+'%';const needle=$('pour-'+p.customerId)?.querySelector('.needle');if(needle)needle.style.left=position;if(p.customerId===ui.selected){const active=$('service-pour')?.querySelector('.needle');if(active)active.style.left=position;const button=$board.querySelector('[data-action="serve"]');if(button){button.textContent=progress>=.63&&progress<=.81?'漂亮！现在收杯 · Space':progress>.81?'快满了，收杯！ · Space':'收杯 · Space';}}});
    }else if(state.phase==='forage'){
      $('night-clock').textContent=`${ui.modal?'已暂停 · ':''}靠岸前 ${Math.ceil(state.forage.duration-state.forage.elapsed)}s`;
      let catchable=null;
      state.forage.items.filter(i=>i.status==='floating').forEach(item=>{
        const progress=R.forageProgress(state,item),needle=$('flotsam-'+item.id)?.querySelector('.needle');
        if(needle)needle.style.left=Math.min(.995,progress)*100+'%';
        if(item.lane===state.forage.lane&&progress>=.5&&progress<=.9)catchable=item;
      });
      const button=$board.querySelector('[data-action="forage-catch"]');
      if(button)button.textContent=catchable?(catchable.kind==='junk'?'单车！捞它要付钱':'现在打捞！ · Space'):'打捞 · Space';
    }else $('night-clock').textContent=state.phase==='prep'?`剩余 ${state.actions} 次准备`:'';
  }
  function brewHit(){if(state.phase!=='brew')return;const position=ui.brewElapsed/6,score=Math.max(0,1-Math.abs(position-.72)/.55);dispatch({type:'brewHit',score});}
  function pourForSelected(){const guest=selectedCustomer();if(guest)dispatch({type:'pour',customerId:guest.id,beer:ui.beer,price:R.BEERS[ui.beer].price+(ui.premium?4:0)});}
  function handleAction(button){
    if(ui.modal||button.disabled)return;
    const data=button.dataset;
    switch(data.action){
      case 'start':{const n=Number($('seed-input')?.value);if(!Number.isInteger(n)||n<1||n>2147483647){notify('顾客安排请输入 1 到 2147483647 的整数。',true);return;}state=R.createGame(n);dispatch({type:'start'});break;}
      case 'brew':dispatch({type:'prepare',kind:'brew',beer:data.beer});break;
      case 'prepare':dispatch({type:'prepare',kind:data.kind});break;
      case 'brew-hit':brewHit();break;
      case 'forage-move':dispatch({type:'forageMove',direction:Number(data.direction)});break;
      case 'forage-catch':dispatch({type:'forageCatch'});break;
      case 'dock':dispatch({type:'dock'});break;
      case 'cancel-brew':modal('这桶酒已经开始酿了','确定放弃这一批？','<p>€12 和这次准备机会已经花掉，放弃后不会有酒入库。</p>',[{label:'接着酿'},{label:'放弃这批酒',secondary:true,run:()=>dispatch({type:'cancelBrew'})}]);break;
      case 'open':if(state.actions>0)modal('天还没黑','现在就开始营业？',`<p>你还有 ${state.actions} 次准备机会。现在开门，这些机会不会留到明天。</p>`,[{label:'回去再准备一下'},{label:'现在开门',secondary:true,run:()=>dispatch({type:'open'})}]);else dispatch({type:'open'});break;
      case 'select':ui.selected=data.id;ui.beer=selectedCustomer()?.beer||'blond';ui.premium=false;render();break;
      case 'beer':ui.beer=data.beer;render();break;
      case 'price':ui.premium=data.premium==='true';render();break;
      case 'pour':pourForSelected();break;
      case 'serve':dispatch({type:'serve',customerId:data.id});break;
      case 'water':dispatch({type:'water',customerId:data.id});break;
      case 'close-night':modal('EARLY CLOSE','今晚就到这里？','<p>还在等候、以及尚未到店的客人，会错过这晚营业。答应 Lotte 的酒也要记得。</p>',[{label:'继续招待客人'},{label:'提前打烊',secondary:true,run:()=>dispatch({type:'close'})}]);break;
      case 'upgrade':dispatch({type:'upgrade',id:data.upgrade});break;
      case 'next':dispatch({type:'next'});break;
      case 'finish':dispatch({type:'finish'});break;
      case 'replay':restart(state.seed);break;
      case 'new-seed':restart(1+Math.floor(Math.random()*2147483646));break;
    }
  }
  document.addEventListener('click',e=>{
    const modalButton=e.target.closest('[data-modal-action]');
    if(modalButton&&ui.modal&&!modalButton.disabled){const callback=ui.modal.buttons[Number(modalButton.dataset.modalAction)].run;closeModal();if(callback)callback();syncEvent();return;}
    const button=e.target.closest('button[data-action]');if(button)handleAction(button);
  });
  $('help-button').addEventListener('click',showHelp);
  $('pause-button').addEventListener('click',()=>pause());
  $('sound-button').addEventListener('click',()=>{ui.sound=!ui.sound;save();render();if(ui.sound)sound();});
  document.addEventListener('keydown',e=>{
    if(ui.modal){
      if(e.key==='Escape'){e.preventDefault();if(ui.modal.kind==='event')return;const callback=ui.modal.buttons[0].run;closeModal();if(callback)callback();syncEvent();}
      if(e.key==='Tab'){const controls=[...$('overlay').querySelectorAll('button:not(:disabled),a,input')],first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      return;
    }
    if(e.target.matches('input,textarea,select')){if(e.key==='Enter'&&e.target.id==='seed-input'){e.preventDefault();handleAction($board.querySelector('[data-action="start"]'));}return;}
    if(e.repeat)return;
    const key=e.key.toLowerCase();
    if(key==='p'||key==='escape'){e.preventDefault();pause();return;}
    if(key==='h'){e.preventDefault();showHelp();return;}
    if(state.phase==='brew'&&key===' '){e.preventDefault();brewHit();return;}
    if(state.phase==='forage'){
      if(['a','d','arrowleft','arrowright'].includes(key)){e.preventDefault();dispatch({type:'forageMove',direction:['a','arrowleft'].includes(key)?-1:1});return;}
      if(key===' '){e.preventDefault();dispatch({type:'forageCatch'});return;}
    }
    if(state.phase==='night'){
      if(['1','2','3'].includes(key)){e.preventDefault();const guest=R.customers(state)[Number(key)-1];if(guest){ui.selected=guest.id;ui.beer=guest.beer;ui.premium=false;render();}return;}
      if(key==='e'){e.preventDefault();pourForSelected();return;}
      if(key===' '){e.preventDefault();const pour=selectedPour()||state.night.pours[0];if(pour)dispatch({type:'serve',customerId:pour.customerId});return;}
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(['night','brew','forage'].includes(state.phase))pause('你离开了一会儿，酒吧已自动暂停。');}ui.lastFrame=performance.now();});
  window.addEventListener('pagehide',save);
  function frame(now){
    scene.draw(state,now,ui.selected);updateMeters();requestAnimationFrame(frame);
  }
  setInterval(()=>{
    const now=performance.now(),seconds=Math.min(1,Math.max(0,(now-ui.lastFrame)/1000));ui.lastFrame=now;
    if(document.hidden||ui.modal)return;
    if(state.phase==='brew'){ui.brewElapsed+=seconds;if(ui.brewElapsed>=6)dispatch({type:'brewHit',score:0});}
    else if(state.phase==='night'||state.phase==='forage'){
      const before=state.phase;const result=R.act(state,{type:state.phase==='forage'?'forageTick':'tick',seconds});
      if(result.ok){state=result.state;if(signature()!==ui.signature){render();if(before!==state.phase){save();notify(before==='forage'?state.lastMessage:'营业结束。看看今天的账，也看看谁记住了你。');sound('good');}}}
    }
    syncEvent();
    if(now-ui.lastSave>5000&&state.phase!=='welcome'){save();ui.lastSave=now;}
  },100);
  render();requestAnimationFrame(frame);
  if(restored&&['night','brew','forage'].includes(state.phase))pause('上次的进度已恢复。准备好后，从上次停下的地方继续。');
  else if(restored)notify('上次的三天进度已恢复。');
  else if(saveError)notify('上次存档无法读取，已准备好一局新的开始。',true);
})();
