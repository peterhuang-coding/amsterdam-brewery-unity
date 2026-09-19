(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./backstage-core.js') : root.Backstage, common ? require('./backstage-auto.js') : root.BackstageAuto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Reopening = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B, A) {
  'use strict';

  const BEERS = Object.freeze({
    blond: Object.freeze({ id: 'blond', name: '金色艾尔', short: '金色艾尔', color: '#e3ae48', price: 8, cost: 12, yield: 6, description: '清爽麦香。唯一需要路演的，是酒杯从吧台到桌子的两米。' }),
    stout: Object.freeze({ id: 'stout', name: '运河黑啤', short: '黑啤', color: '#61443c', price: 10, cost: 12, yield: 6, description: '烘烤麦芽与咖啡香。苦味有配方，房租上涨没有。' })
  });
  const UPGRADES = Object.freeze({
    doubleTap: Object.freeze({ id: 'doubleTap', name: '双酒头', description: '同时倒两杯酒，忙碌时也能照顾两位客人。', tradeoff: '两杯都有各自的进度；忙过头仍会溢杯。' }),
    cellar: Object.freeze({ id: 'cellar', name: '陈酿桶', description: '隔夜余酒成为陈酿。满意的陈酿订单额外收入 €2。', tradeoff: '只有留到下一天的酒受益；刚酿好的酒需要等一晚。' }),
    stage: Object.freeze({ id: 'stage', name: '驻唱角', description: '客人多等 12 秒，满意订单额外小费 €2。', tradeoff: '驻唱角占一个座位：酒馆只能同时接待两位客人。' })
  });
  const PEOPLE = Object.freeze({
    lotte: Object.freeze({ name: 'Lotte', role: '音乐人 · 不收曝光券', quote: '留杯黑啤给我。我带吉他来，房东的独奏已经够多了。', color: '#b36668' }),
    bram: Object.freeze({ name: 'Bram', role: '咖啡馆老板 · 按时结工钱', quote: '来帮个午市，工钱当天结。理想我也有，不拿它抵工资。', color: '#72917b' }),
    marta: Object.freeze({ name: 'Marta', role: '老街坊 · 不收咨询费', quote: '先倒一杯。商业计划晚点再说，泡沫已经在杯子里了。', color: '#a480ac' })
  });
  const NIGHT_EVENTS = Object.freeze({
    landlord: Object.freeze({ id: 'landlord', title: '房东的液体押金', quote: '房东说租金可以谈，谈的时候嘴不能闲着。', choices: Object.freeze([
      Object.freeze({ id: 'comp', label: '请他喝一杯', description: '消耗 1 杯金色艾尔（没有则用黑啤），今晚租金 −€6。' }),
      Object.freeze({ id: 'refuse', label: '请他喝空气', description: '保留库存，今晚租金 +€3。房东把拒绝赊酒算成服务费。' })
    ]) }),
    influencer: Object.freeze({ id: 'influencer', title: '曝光量不能交房租', quote: '网红保证带来流量，前提是流出来的酒免费。', choices: Object.freeze([
      Object.freeze({ id: 'samples', label: '提供两杯样品', description: '消耗任意 2 杯酒，接下来 3 位尚未到店客人的预算各 +€4。' }),
      Object.freeze({ id: 'refuse', label: '提供付款二维码', description: '保留库存，接下来 3 位尚未到店客人的耐心各 −4 秒。一星差评：酒吧居然卖酒。' })
    ]) }),
    inspector: Object.freeze({ id: 'inspector', title: '未发现问题的问题', quote: '检查员带来一叠表格，厚度刚好能压住你的营业执照。', choices: Object.freeze([
      Object.freeze({ id: 'paperwork', label: '支付表格处理费', description: '支付 €10，正在等待及尚未到店客人的耐心 +12 秒。停业整改表填成了延时营业申请。' }),
      Object.freeze({ id: 'tasting', label: '接受下次继续检查', description: '现在免费，今晚租金 +€6。检查员暂未发现问题，决定下次继续发现。' })
    ]) })
  });
  const eventForDay = day => ['landlord', 'influencer', 'inspector'][day - 1];
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const has = (state, upgrade) => state.upgrades.includes(upgrade);
  const clone = value => JSON.parse(JSON.stringify(value));
  const seats = state => has(state, 'stage') ? 2 : 3;
  const freshLife = () => ({ arrangement: null, bouquet: null, flowersDay: 0, display: null, gifts: 0, morning: [], clues: [] });
  const FLOWERS = Object.freeze([
    { name: '红郁金香', color: '#c86162', tone: 'warm' }, { name: '橙郁金香', color: '#d78d51', tone: 'warm' },
    { name: '黄郁金香', color: '#d9bb69', tone: 'warm' }, { name: '白郁金香', color: '#f1ecdd', tone: 'cool' },
    { name: '淡紫郁金香', color: '#b7a0c7', tone: 'cool' }, { name: '粉郁金香', color: '#d4a6b8', tone: 'cool' }
  ].map(Object.freeze));
  function flowerPalette(stems) { const warm=stems.filter(i=>FLOWERS[i].tone==='warm').length; return warm===3?'warm':warm===0?'cool':'mixed'; }
  function flowerFit(bouquet, target) { return Boolean(bouquet && (target==='lotte' ? bouquet.palette==='warm'&&bouquet.wrap==='ribbon' : bouquet.palette==='cool'&&bouquet.wrap==='paper')); }

  function seedNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
    if (typeof value !== 'string') return 42;
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
    return result >>> 0;
  }
  function random(seed) {
    let current = seed >>> 0;
    return function () {
      current = (current + 0x6D2B79F5) >>> 0;
      let value = Math.imul(current ^ current >>> 15, 1 | current);
      value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function say(state, message) {
    state.lastMessage = message;
    state.log.unshift(message);
    state.log.length = Math.min(12, state.log.length);
  }
  function createGame(seed) {
    return {
      version: 1, seed: seedNumber(seed), day: 1, phase: 'welcome', cash: 45, actions: 2,
      batches: [
        { id: 'starter-blond', beer: 'blond', cups: 6, quality: 1, madeDay: 1, aged: false },
        { id: 'starter-stout', beer: 'stout', cups: 2, quality: 1, madeDay: 1, aged: false }
      ],
      friends: { lotte: 0, bram: 0, marta: 0 }, promises: { lotte: false },
      upgrades: [], hops: 0, music: false, log: [], totalSatisfied: 0, totalServed: 0,
      brew: null, forage: null, night: null, reports: [], lastMessage: '三天试营业。房东称这叫扶持创业，因为账单用了绿色纸。',
      result: null, prepared: [], backstage: { run: null, discovered: [], resolution: null, trips: 0, from: null, cashAfterClose: 0, journal: [] }, life: freshLife()
    };
  }
  function stock(state, beer) {
    if (!state || !Array.isArray(state.batches) || !owns(BEERS, beer)) return 0;
    return state.batches.reduce((total, batch) => total + (batch.beer === beer && integer(batch.cups, 0, 100) ? batch.cups : 0), 0);
  }
  function customers(state) {
    if (!state || state.phase !== 'night' || !state.night) return [];
    return state.night.orders.filter(order => order.status === 'waiting');
  }
  function pourProgress(state, pour) {
    if (!state || !state.night || !pour || !number(pour.duration, 0.1, 60) || !number(pour.startedAt, 0, 1000)) return 0;
    return Math.max(0, Math.min(1, (state.night.elapsed - pour.startedAt) / pour.duration));
  }
  function forageProgress(state, item) {
    if (!state || !state.forage || !item || !number(state.forage.elapsed, 0, 30) || !number(item.arrival, 0, 27)) return 0;
    return Math.max(0, Math.min(1, (state.forage.elapsed - item.arrival) / 5));
  }
  function makeForage(state) {
    const rand = random(state.seed ^ Math.imul(state.day, 2246822519));
    const items = Array.from({ length: 10 }, (_, index) => ({
      id: 'd' + state.day + '-flotsam' + index, kind: ['hops', 'bottle', 'junk'][index % 3],
      lane: Math.floor(rand() * 3), arrival: index * 3, status: index === 0 ? 'floating' : 'future'
    }));
    return { elapsed: 0, duration: 30, lane: 1, items, haul: 0 };
  }
  function dock(state) {
    const haul = state.forage.haul;
    state.forage = null; state.phase = 'prep';
    say(state, '带着 ' + haul + ' 份有用收获靠岸。运河没有开发票，我们也没问保质期。');
  }
  function updateForage(state) {
    const forage = state.forage;
    for (const item of forage.items) {
      if (item.status === 'future' && item.arrival <= forage.elapsed) item.status = 'floating';
      if (item.status === 'floating' && forage.elapsed >= item.arrival + 5) item.status = 'missed';
    }
    if (forage.elapsed >= forage.duration || forage.haul >= 3) dock(state);
  }
  function makeNight(state) {
    const rand = random(state.seed ^ Math.imul(state.day, 2654435761));
    const count = 6 + state.day * 2;
    const duration = 150 + state.day * 15;
    const names = ['艾娃', '尤斯特', '诺拉', '芬恩', '苏菲', '米兰', '伊萨', '鲁本', '泰斯'];
    const portraits = ['👩🏻', '🧑🏼', '👩🏽', '👨🏻', '🧑🏽', '👨🏾'];
    const orders = [];
    for (let i = 0; i < count; i++) {
      const person = i === 0 ? 'marta' : i === Math.floor(count / 2) ? 'bram' : i === count - 2 ? 'lotte' : null;
      const beer = person === 'lotte' || (person !== 'marta' && i % 3 === 2) ? 'stout' : 'blond';
      const arrival = i === 0 ? 0 : state.day > 1 && i === 3 ? orders[2].arrival : Math.round(i * (duration - 18) / (count - 1) + (rand() - 0.5) * 4);
      const patience = 23 + Math.floor(rand() * 5) + (has(state, 'stage') ? 12 : 0) + (state.music ? 8 : 0) + (person === 'bram' && state.friends.bram > 0 ? 10 : 0) + (state.life.display ? flowerFit(state.life.display,'display') ? 6 : 3 : 0);
      orders.push({ id: 'd' + state.day + '-guest' + i,
        name: person ? PEOPLE[person].name : names[Math.floor(rand() * names.length)], person,
        beer, budget: BEERS[beer].price + Math.floor(rand() * 6), arrival, patience,
        status: 'future', portrait: person === 'lotte' ? '👩🏻‍🎤' : person === 'bram' ? '🧔🏼' : person === 'marta' ? '👩🏼‍🦳' : portraits[Math.floor(rand() * portraits.length)],
        quote: person ? PEOPLE[person].quote : beer === 'stout' ? '一杯黑啤。论文还在返修，我先完成这一杯。' : '一杯金色艾尔。老板说公司是家，所以加班费算亲情。'
      });
    }
    if (state.backstage.resolution === 'returned') {
      Object.assign(orders[1], { name: 'Noor', quote: '谢谢你把箱子送回来。老板把违禁品写成酵母，工资倒是从来不多写一个零。', budget: 14, patience: 38 });
    } else if (state.backstage.resolution === 'kept') {
      Object.assign(orders[1], { name: '穿灰外套的人', quote: '冷藏箱在你这里？我只喝正常的啤酒。其他事情，等你忙完再说。', budget: 10, patience: 18 });
    }
    return { elapsed: 0, duration, orders, pours: [], earned: 0, served: 0, satisfied: 0, lost: 0, promiseKept: false, promiseBroken: false, event: null, rentAdjustment: 0 };
  }
  function breakPromise(state, order) {
    if (order.person === 'lotte' && state.promises.lotte && !state.night.promiseKept) {
      state.night.promiseBroken = true;
      say(state, 'Lotte 没等到答应的黑啤。她没发差评，只把吉他收回了琴盒。');
    }
  }
  function lose(state, order, message) {
    order.status = 'lost';
    state.night.lost++;
    state.night.pours = state.night.pours.filter(pour => pour.customerId !== order.id);
    if (message) say(state, message);
    breakPromise(state, order);
  }
  function settle(state) {
    const night = state.night;
    for (const order of night.orders) if (order.status === 'waiting' || order.status === 'future') lose(state, order);
    night.pours = [];
    if (state.promises.lotte && !night.promiseKept) night.promiseBroken = true;
    const rent = 18 + night.rentAdjustment;
    state.cash = Math.max(0, state.cash - rent);
    state.phase = 'summary';
    const note = night.promiseKept ? 'Lotte 说今晚的报酬已到账：一杯黑啤，比“积累曝光”实在。' : night.promiseBroken ? 'Lotte 没收到答应的黑啤。她没开罚单，只说明晚先不带琴了。' : night.satisfied >= 5 ? '街坊们约好再来。没人要求做用户访谈，大家直接付了钱。' : '椅子比客人待得久。会计说这是沉淀，你决定先把杯子洗了。';
    state.reports.push({ day: state.day, earned: night.earned, served: night.served, satisfied: night.satisfied,
      lost: night.lost, rent, cash: state.cash, promiseKept: night.promiseKept, promiseBroken: night.promiseBroken, note });
    say(state, '第 ' + state.day + ' 夜收店：' + night.satisfied + ' 位满意的客人，支付租金 €' + rent + '。');
  }
  function updateNight(state) {
    const night = state.night;
    for (const order of night.orders) {
      if (order.status === 'waiting') {
        const pour = night.pours.find(item => item.customerId === order.id);
        if (pour && night.elapsed - pour.startedAt > pour.duration + 1e-8)
          lose(state, order, order.name + '的酒溢出了。损失一杯，也错过了一位客人。');
        else if (night.elapsed >= order.arrival + order.patience)
          lose(state, order, order.name + '等得太久，轻轻挥手离开了。');
      }
    }
    for (const order of night.orders) {
      if (order.status === 'future' && order.arrival <= night.elapsed) {
        if (customers(state).length >= seats(state)) lose(state, order, '座位坐满了，' + order.name + '决定改天再来。');
        else {
          order.status = 'waiting';
          say(state, order.name + '推门进来，点了' + BEERS[order.beer].short + '。');
        }
      }
    }
    if (night.elapsed >= 35 && night.event === null) {
      night.event = { id: eventForDay(state.day), status: 'pending', choice: null };
      say(state, NIGHT_EVENTS[night.event.id].title + '：营业时间暂停，先处理这位不在菜单上的客人。');
    }
    if (night.elapsed >= night.duration || night.orders.every(order => order.status === 'served' || order.status === 'lost')) settle(state);
  }
  function nextDay(state) {
    state.music = state.night.promiseKept;
    state.day++;
    state.phase = 'prep';
    state.actions = 2;
    state.promises.lotte = false;
    state.prepared = [];
    state.life.clues = [];
    state.brew = null;
    state.forage = null;
    state.night = null;
    state.backstage.cashAfterClose = 0;
    if (has(state, 'cellar')) for (const batch of state.batches) if (batch.cups > 0) batch.aged = true;
    say(state, '第 ' + state.day + ' 天，游客又把昨天的街道拍成了全新的城市。两次白天行动已经恢复。' + (state.life.morning[0] || '') + (state.music ? 'Lotte 今晚带吉他。' : ''));
  }

  function act(original, action) {
    const fail = message => ({ state: original, ok: false, message });
    const state = restore(original);
    if (!state) return fail('存档不完整，请重新开一局。');
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return fail('这个操作无法执行。');
    if (state.life.arrangement && !['flowerPick','flowerWrap','flowerFinish','flowerCancel'].includes(action.type)) return fail('先包好这束花，或免费取消配花。');
    if (state.phase === 'night' && state.night.event && state.night.event.status === 'pending' && !['event', 'close'].includes(action.type)) return fail('先处理眼前的突发事件。时间和酒杯都暂停了。');
    switch (action.type) {
      case 'start':
        if (state.phase !== 'welcome') return fail('酒馆已经开始营业准备了。');
        state.phase = 'prep'; say(state, '先备酒，再开门。工商表格没有“暂时还不会倒酒”这一栏。'); break;
      case 'scout': {
        if (state.phase !== 'prep' || !['market', 'coffee', 'lab'].includes(action.place)) return fail('白天到市场、咖啡馆或实验室，才有机会打听夜里的事。');
        const clue = ({market:'market',coffee:'club',lab:'greenhouse'})[action.place];
        if (!state.life.clues.includes(clue)) state.life.clues.push(clue);
        say(state, clue === 'market' ? '卸货单背面画着路：货架北侧通冷库，东墙卸货门能从里面打开。销毁食品需要审批，拯救食品需要偷偷摸摸。' : clue === 'greenhouse' ? 'Chen 指着灌溉图：每十秒洒六秒水。西侧阀门能关十二秒；带一件可修零件过去，才不用每晚修同一条漏水的承诺。' : 'Bram 说：NO SIGNAL 每隔六秒会停一阵音乐。鼓点响时保安听不清，音乐一停，连空瓶都像在做自我介绍。');
        break;
      }
      case 'explore':
        if (!B || state.phase !== 'summary' || state.prepared.includes('explore')) return fail('酒馆打烊后才能出门探险，每夜一次。');
        if (!owns(B.KITS, action.kit)) return fail('先选一套出门工具。');
        if (![undefined, 'auto', 'manual'].includes(action.mode)) return fail('请选择自动探索或手动操作。');
        state.backstage.from = state.phase; state.prepared.push('explore'); state.phase = 'explore';
        state.backstage.run = B.create(state.seed, state.day, action.kit, state.backstage.discovered, {clues: state.life.clues});
        if (action.mode !== 'manual') A.enable(state.backstage.run);
        say(state, '城市背面的门开着。去夜店找冷藏箱，或者沿着陌生的灯走。'); break;
      case 'returnExplore': {
        if (!B || state.phase !== 'explore' || state.backstage.run.status === 'active') return fail('先抵达回店口，或者轻装撤回。');
        const reward = B.rewards(state.backstage.run);
        const afterClose = state.backstage.from === 'summary';
        state.cash += reward.cash; state.hops = Math.min(15, state.hops + reward.hops);
        if (afterClose) state.backstage.cashAfterClose += reward.cash;
        for (let cups = reward.cups, index = 0; cups > 0; cups -= 6, index++) {
          state.batches.push({ id: 'd' + state.day + '-backstage-' + index, beer: 'blond', cups: Math.min(6, cups), quality: 2, madeDay: state.day, aged: false });
        }
        state.backstage.discovered = [...new Set([...state.backstage.discovered, ...reward.discovered])];
        if (['returned', 'kept'].includes(reward.parcel)) state.backstage.resolution = reward.parcel;
        state.life.morning = ['第 '+state.day+' 夜带回 '+reward.cups+' 杯艾尔、'+reward.hops+' 份酒花和 €'+reward.cash+'，已经收进酒馆。'];
        if (reward.parcel==='returned') state.life.morning.push('Noor 留了张字条：下次营业来喝一杯。箱子还了，人情还在。');
        if (reward.parcel==='kept') state.life.morning.push('有人打听你带回的冷藏箱。月雾单独封存，不进入酒和原料。');
        if (reward.discovered.includes('greenhouse')) state.life.morning.push('温室后门已画在地图背面；花店老板认出了你鞋上的泥。');
        const consequences = {
          'market-salvaged': '超市今日告示：昨夜库存不翼而飞，销毁指标被迫下调。你认得那片货架。',
          'market-shortcut': '卸货门留了一道缝。你记下的超市捷径，下次夜里仍然能走。',
          'club-backstage': 'Bram 听说有人取走了后台的冷藏箱：保安建议降低音量，经理建议提高票价。',
          'sorting-stopped': '分拣场告示：输送带停过机，失物未能按时失踪。',
          'sorting-reversed': '分拣员发现昨夜输送带反着走：被退回的东西，终于退回了自己。',
          'greenhouse-valve': '温室住客记得有人临时关过灌溉阀。那十二秒，鞋比植物先得救。',
          'greenhouse-repaired': '温室水泵已改成滴灌。住客留下字条：从此路面干燥，维修申请仍在漏水。'
        };
        const outcomes=reward.outcomes||[];
        for (const outcome of ['greenhouse-repaired',...outcomes.filter(id=>id!=='greenhouse-repaired')]) if(outcomes.includes(outcome)&&consequences[outcome]) state.life.morning.push(consequences[outcome]);
        state.life.morning=state.life.morning.slice(0,8);
        state.backstage.journal.push({day:state.day,status:reward.status,cups:reward.cups,hops:reward.hops,cash:reward.cash,visited:[...(reward.visited||[])],outcomes:[...outcomes]});
        state.backstage.journal=state.backstage.journal.slice(-3);
        state.backstage.trips++; state.backstage.run = null; state.phase = state.backstage.from; state.backstage.from = null;
        say(state, '探险归来：' + reward.cups + ' 杯艾尔，' + reward.hops + ' 份酒花，€' + reward.cash + '。' + (afterClose ? '收好东西，睡醒后再开门。' : '旧行程已经接回白天。')); break;
      }
      case 'flowerStart':
        if(state.phase!=='prep'||state.actions<1||state.cash<4||state.life.flowersDay===state.day||state.life.bouquet) return fail('配花需要 €4 和一次白天行动，每天一束；先安置手里的花。');
        state.life.arrangement={stems:[],wrap:null};say(state,'选三枝花，再选包装。冷色配纸适合窗台，暖色配丝带适合 Lotte。');break;
      case 'flowerPick': {
        if(!state.life.arrangement||!integer(action.stem,0,FLOWERS.length-1)) return fail('请从花架选一枝。');
        const stems=state.life.arrangement.stems,index=stems.indexOf(action.stem);
        if(index>=0)stems.splice(index,1);else if(stems.length<3)stems.push(action.stem);else return fail('手里已有三枝，先点一枝放回。');
        break;
      }
      case 'flowerWrap':
        if(!state.life.arrangement||!['paper','ribbon'].includes(action.wrap))return fail('请选择牛皮纸或丝带。');
        state.life.arrangement.wrap=action.wrap;break;
      case 'flowerCancel':
        if(!state.life.arrangement)return fail('现在没有正在配的花。');
        state.life.arrangement=null;say(state,'把花放回架上。审美咨询暂时免费。');break;
      case 'flowerFinish': {
        const a=state.life.arrangement;
        if(!a||a.stems.length!==3||!a.wrap)return fail('先选满三枝并选好包装。');
        state.cash-=4;state.actions--;state.life.flowersDay=state.day;
        state.life.bouquet={palette:flowerPalette(a.stems),wrap:a.wrap,stored:false};state.life.arrangement=null;
        say(state,'花包好了。可以送给 Lotte，或带回酒馆布置窗台；自行车前篮也空着。');break;
      }
      case 'flowerStore':
        if(!['prep','summary'].includes(state.phase)||!state.life.bouquet||typeof action.stored!=='boolean')return fail('现在没有可以取放的花。');
        state.life.bouquet.stored=action.stored;say(state,action.stored?'花放进前篮了。车停在哪里，花就在哪里。':'把花从前篮取回手里。');break;
      case 'flowerUse': {
        const b=state.life.bouquet;
        if(state.phase!=='prep'||!b||b.stored||!['lotte','display'].includes(action.target))return fail('白天把花拿在手里，再送人或布置酒馆。');
        if(action.target==='lotte') {const points=flowerFit(b,'lotte')?2:1;state.friends.lotte=Math.min(20,state.friends.lotte+points);state.life.gifts++;
          say(state,points===2?'Lotte 喜欢这束暖色丝带花：“终于有报酬不能写进房东的账。” 好感 +2。':'Lotte 收下花：“比演出曝光券香。” 好感 +1。');}
        else {state.life.display=b;say(state,'花摆上酒馆窗台。以后客人多等 '+(flowerFit(b,'display')?6:3)+' 秒，直到你换一束。');}
        state.life.bouquet=null;break;
      }
      case 'prepare': {
        if (state.phase !== 'prep' || state.actions < 1) return fail('今天的行动已用完，可以开门迎客了。');
        const kind = action.kind;
        if (!['brew', 'coffee', 'visit', 'surf', 'market', 'lab'].includes(kind)) return fail('没有这种白天行动。');
        if (kind !== 'brew' && state.prepared.includes(kind)) return fail('今天已经去过这里了。');
        if (kind === 'brew') {
          if (!owns(BEERS, action.beer)) return fail('先选一种要酿的酒。');
          if (state.cash < BEERS[action.beer].cost) return fail('原料需要 €12，先去咖啡馆帮工也许有用。');
          state.cash -= BEERS[action.beer].cost;
          state.brew = { beer: action.beer, hits: [] };
          state.phase = 'brew';
          say(state, '开酿' + BEERS[action.beer].short + '。把握三次火候，完成一批六杯。');
        } else {
          const outingCost = kind === 'market' ? 8 : kind === 'lab' ? 6 : 0;
          if (state.cash < outingCost) return fail('这趟需要 €' + outingCost + '。Bram 的咖啡馆还在招临时工。');
          state.cash -= outingCost;
          state.prepared.push(kind);
          if (kind === 'market') {
            for (const beer of ['blond', 'stout']) state.batches.push({ id: 'd' + state.day + '-market-' + beer, beer, cups: beer === 'blond' ? 2 : 1, quality: 1, madeDay: state.day, aged: false });
            say(state, '€8 带回收摊酒箱：2 杯艾尔、1 杯黑啤。摊主说没有滞销，只有尚未被发现的限量款。');
          }
          if (kind === 'lab') { state.hops += 2; say(state, 'Chen 收下 €6 材料费，给你两份试验酒花。论文还没发表，香气已经通过鼻审。'); }
          if (kind === 'coffee') { state.cash += 18; state.friends.bram++; say(state, '帮 Bram 忙过午市：工资 €18，头衔免费。他今晚愿意多等一会儿。'); }
          if (kind === 'visit') { state.promises.lotte = true; say(state, '你答应给 Lotte 留一杯黑啤。她会在今晚晚些时候来。'); }
          if (kind === 'surf') {
            state.phase = 'forage'; state.forage = makeForage(state);
            say(state, '运河打捞，限时 30 秒。酒花能酿酒，封口瓶能卖，垃圾会收你处理费。');
          }
        }
        state.actions--; break;
      }
      case 'forageTick':
        if (state.phase !== 'forage' || !number(action.seconds, 0, 1)) return fail('打捞时间每次只能推进 0 到 1 秒。');
        state.forage.elapsed = Math.min(state.forage.duration, state.forage.elapsed + action.seconds);
        updateForage(state); break;
      case 'forageMove':
        if (state.phase !== 'forage' || ![-1, 1].includes(action.direction)) return fail('船只能向左或向右换一条航道。');
        state.forage.lane = Math.max(0, Math.min(2, state.forage.lane + action.direction)); break;
      case 'forageCatch': {
        if (state.phase !== 'forage') return fail('先下运河，再讨论捞什么。');
        const item = state.forage.items.find(candidate => candidate.status === 'floating' && candidate.lane === state.forage.lane && forageProgress(state, candidate) >= 0.5 - 1e-8 && forageProgress(state, candidate) <= 0.9 + 1e-8);
        if (!item) return fail('钩子空了。等物品漂到当前航道的下半段，再下钩。');
        item.status = 'caught';
        if (item.kind === 'hops') {
          state.hops++; state.forage.haul++;
          say(state, '捞到密封酒花，香气 +1。供应链比昨天短，也比昨天湿。');
        } else if (item.kind === 'bottle') {
          const beer = (state.seed + state.day + item.arrival / 3) % 2 === 0 ? 'blond' : 'stout';
          state.batches.push({ id: '漂流瓶-' + item.id, beer, cups: 2, quality: 1, madeDay: state.day, aged: false });
          state.forage.haul++;
          say(state, '捞到两瓶封好的' + BEERS[beer].short + '，入库 2 杯。日期被运河洗掉了，故事保留着。');
        } else {
          state.cash = Math.max(0, state.cash - 2);
          say(state, '捞到垃圾，处理费 €2。环保是一种让现金也跟着净化的运动。');
        }
        updateForage(state); break;
      }
      case 'dock':
        if (state.phase !== 'forage') return fail('船已经靠岸了。');
        dock(state); break;
      case 'brewHit': {
        if (state.phase !== 'brew') return fail('现在没有正在酿的酒。');
        if (!number(action.score, 0, 1)) return fail('火候记录必须介于 0 和 1。');
        state.brew.hits.push(action.score);
        if (state.brew.hits.length === 3) {
          const average = state.brew.hits.reduce((sum, score) => sum + score, 0) / 3;
          const quality = Math.min(3, (average >= 0.8 ? 3 : average >= 0.45 ? 2 : 1) + (state.hops > 0 ? 1 : 0));
          state.batches.push({ id: 'd' + state.day + '-batch' + state.batches.length, beer: state.brew.beer, cups: 6, quality, madeDay: state.day, aged: false });
          state.hops = Math.max(0, state.hops - 1);
          state.brew = null;
          state.phase = 'prep';
          say(state, '六杯新酒入桶，品质 ' + quality + '/3。成果可以喝，不需要再投一轮期刊。');
        } else say(state, '第 ' + state.brew.hits.length + ' 道工序完成。继续留意火候。');
        break;
      }
      case 'cancelBrew':
        if (state.phase !== 'brew') return fail('没有需要放弃的酿造。');
        state.brew = null; state.phase = 'prep'; say(state, '这一锅放弃了。原料和白天时间已经花掉。'); break;
      case 'open':
        if (state.phase !== 'prep') return fail('请先完成白天的准备。');
        state.actions = 0; state.phase = 'night'; state.night = makeNight(state);
        say(state, '门灯亮了。欢迎点酒，创业故事免费，但不能抵酒钱。'); updateNight(state); break;
      case 'tick':
        if (state.phase !== 'night' || !number(action.seconds, 0, 1)) return fail('夜间时间每次只能推进 0 到 1 秒。');
        state.night.elapsed = Math.min(state.night.duration, state.night.elapsed + action.seconds);
        updateNight(state); break;
      case 'event': {
        if (state.phase !== 'night' || !state.night.event || state.night.event.status !== 'pending') return fail('现在没有需要处理的突发事件。');
        const event = state.night.event;
        const choice = NIGHT_EVENTS[event.id].choices.find(item => item.id === action.choice);
        if (!choice) return fail('请选择眼前事件提供的处理方式。');
        const future = state.night.orders.filter(order => order.status === 'future').slice(0, 3);
        if (event.id === 'landlord') {
          if (choice.id === 'comp') {
            const beer = stock(state, 'blond') > 0 ? 'blond' : 'stout';
            const batch = state.batches.find(item => item.beer === beer && item.cups > 0);
            if (!batch) return fail('没有剩余酒可以招待房东。空气还不限量。');
            batch.cups--; state.night.rentAdjustment = -6;
            say(state, '房东喝掉一杯酒，今晚租金少 €6。原来议价能力是液体。');
          } else { state.night.rentAdjustment = 3; say(state, '房东把拒绝赊酒算成服务费。今晚租金多 €3，措辞非常专业。'); }
        } else if (event.id === 'influencer') {
          if (choice.id === 'samples') {
            if (stock(state, 'blond') + stock(state, 'stout') < 2) return fail('样品需要 2 杯现酒。曝光量暂时不能兑啤酒。');
            let remaining = 2;
            for (const batch of state.batches) { const used = Math.min(remaining, batch.cups); batch.cups -= used; remaining -= used; }
            for (const order of future) order.budget += 4;
            say(state, '两杯样品换来愿意加价的游客。接下来三位新客预算各多 €4。');
          } else {
            for (const order of future) order.patience = Math.max(1, order.patience - 4);
            say(state, '一星差评：酒吧居然卖酒。接下来三位新客的耐心各少 4 秒。');
          }
        } else if (choice.id === 'paperwork') {
          if (state.cash < 10) return fail('表格处理费需要 €10，表格不接受理想与抱负。');
          state.cash -= 10;
          for (const order of state.night.orders) if (['waiting', 'future'].includes(order.status)) order.patience += 12;
          say(state, '€10 把停业整改表填成了延时营业申请。未离开的客人多等 12 秒。');
        } else { state.night.rentAdjustment = 6; say(state, '检查员暂未发现问题，决定下次继续发现。今晚租金附加 €6。'); }
        event.status = 'resolved'; event.choice = choice.id; break;
      }
      case 'pour': {
        if (state.phase !== 'night') return fail('酒馆开门后才能倒酒。');
        const order = state.night.orders.find(item => item.id === action.customerId && item.status === 'waiting');
        if (!order) return fail('这位客人现在不在等酒。');
        if (!owns(BEERS, action.beer) || !integer(action.price, 1, 1000000)) return fail('请选择现有酒款，并设置正整数价格。');
        if (state.night.pours.some(pour => pour.customerId === order.id)) return fail('这位客人的酒已经在倒了。');
        if (state.night.pours.length >= (has(state, 'doubleTap') ? 2 : 1)) return fail('酒头正在使用，请先端出手上的酒。');
        const batch = state.batches.find(item => item.beer === action.beer && item.cups > 0);
        if (!batch) return fail('这款酒售罄了。可以给客人一杯水。');
        batch.cups--;
        state.night.pours.push({ customerId: order.id, beer: action.beer, price: action.price,
          quality: batch.quality, aged: batch.aged, startedAt: state.night.elapsed, duration: 4 });
        say(state, '正在给' + order.name + '倒' + BEERS[action.beer].short + '。在浅绿色区域收杯。'); break;
      }
      case 'serve': {
        if (state.phase !== 'night') return fail('现在没有可以端出的酒。');
        const order = state.night.orders.find(item => item.id === action.customerId && item.status === 'waiting');
        const pour = state.night.pours.find(item => item.customerId === action.customerId);
        if (!order || !pour) return fail('请先为这位客人倒一杯酒。');
        const progress = pourProgress(state, pour);
        const satisfied = progress >= 0.45 - 1e-8 && progress <= 0.95 + 1e-8 && pour.beer === order.beer && pour.price <= order.budget;
        const perfect = Math.abs(progress - 0.72) <= 0.09 + 1e-8;
        let earned = pour.price <= order.budget ? pour.price : 0;
        if (satisfied) {
          earned += pour.quality - 1 + (perfect ? 2 : 0) + (pour.aged ? 2 : 0) + (has(state, 'stage') ? 2 : 0) + (state.music ? 1 : 0) + (order.person === 'bram' && state.friends.bram > 0 ? 1 : 0);
          state.night.satisfied++; state.totalSatisfied++;
          if (order.person) state.friends[order.person]++;
          if (order.person === 'lotte' && state.promises.lotte) state.night.promiseKept = true;
        }
        order.status = 'served';
        state.night.served++; state.totalServed++;
        state.night.earned += earned; state.cash += earned;
        state.night.pours = state.night.pours.filter(item => item.customerId !== order.id);
        say(state, satisfied ? order.name + (perfect ? '接过漂亮的一杯' : '满意地点点头') + '，收入 €' + earned + '。' : order.name + '收下了酒，但这一杯没有让对方满意。收入 €' + earned + '。');
        if (!satisfied) breakPromise(state, order);
        else if (order.person === 'lotte' && state.promises.lotte) say(state, 'Lotte 尝到了答应的黑啤：明晚带吉他。至少这份口头合同兑付了。');
        updateNight(state); break;
      }
      case 'water': {
        if (state.phase !== 'night') return fail('现在没有等候的客人。');
        const order = state.night.orders.find(item => item.id === action.customerId && item.status === 'waiting');
        if (!order) return fail('这位客人已经离开了。');
        lose(state, order, '给' + order.name + '一杯免费的水。对方道了谢，平静地离开。');
        updateNight(state); break;
      }
      case 'close':
        if (state.phase !== 'night') return fail('现在不能收店。');
        settle(state); break;
      case 'upgrade':
        if (state.phase !== 'summary' || state.day >= 3) return fail('只在前两晚收店后改造酒馆。');
        if (!owns(UPGRADES, action.id) || has(state, action.id)) return fail('请选择尚未安装的改造。');
        state.upgrades.push(action.id); nextDay(state); break;
      case 'next':
        if (state.phase !== 'summary' || state.day >= 3) return fail('已经到了最后一晚。');
        nextDay(state); break;
      case 'finish': {
        if (state.phase !== 'summary' || state.day !== 3) return fail('三晚营业结束后才能揭晓结局。');
        const won = state.cash >= 100 && state.totalSatisfied >= 12;
        state.phase = 'ending';
        state.result = { won, title: won ? '尚未倒闭，房东表示欣慰' : '创业失败，案例研究成功',
          description: won ? '三晚租金结清，余款 €' + state.cash + '，满意客人 ' + state.totalSatisfied + ' 位。街坊约了下一杯，房东约了下一笔。你终于有资格考虑给自己发工资。' : '三晚后结余 €' + state.cash + '，满意客人 ' + state.totalSatisfied + ' 位。账本没达到续开的门槛。Marta 帮你收椅子；如果商学院来要案例，记得先收咨询费。' };
        say(state, state.result.title); break;
      }
      default: return fail('没有这种操作。');
    }
    return { state, ok: true, message: state.lastMessage };
  }

  // Only plain JSON data is accepted. Inspect descriptors before cloning so getters,
  // prototype pollution, cycles, or oversized saves cannot enter the rules engine.
  function safeData(value, seen, depth, counter) {
    if (depth > 12 || ++counter.count > 5000) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= 2000;
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? proto !== Array.prototype || value.length > 128 : proto !== Object.prototype) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).length > (Array.isArray(value) ? 129 : 40)) return false;
    if (Array.isArray(value) && (Object.keys(descriptors).length !== value.length + 1 || !Object.keys(descriptors).every(key => key === 'length' || /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length))) return false;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) return false;
      if (Array.isArray(value) && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!owns(descriptor, 'value') || !descriptor.enumerable || !safeData(descriptor.value, seen, depth + 1, counter)) return false;
    }
    seen.delete(value);
    return true;
  }
  const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.split(' ').sort().join(',');
  const string = value => typeof value === 'string' && value.length <= 2000;
  const unique = array => new Set(array).size === array.length;
  const JOURNAL_ZONES=['market','redlight','club','sorting','greenhouse'];
  const JOURNAL_OUTCOMES=['market-salvaged','market-shortcut','club-backstage','sorting-stopped','sorting-reversed','greenhouse-valve','greenhouse-repaired'];
  function validJournal(entries,state){
    if(!Array.isArray(entries)||entries.length>3||entries.length>state.backstage.trips)return false;
    return entries.every((e,i)=>shape(e,'day status cups hops cash visited outcomes')&&integer(e.day,1,state.day)&&(i===0||e.day>entries[i-1].day)&&
      ['extracted','bailed','rescued'].includes(e.status)&&integer(e.cups,0,100)&&integer(e.hops,0,100)&&integer(e.cash,0,1000)&&
      Array.isArray(e.visited)&&e.visited.length<=5&&unique(e.visited)&&e.visited.every(id=>JOURNAL_ZONES.includes(id))&&
      Array.isArray(e.outcomes)&&e.outcomes.length<=7&&unique(e.outcomes)&&e.outcomes.every(id=>JOURNAL_OUTCOMES.includes(id)));
  }
  function validState(s) {
    if (!shape(s, 'version seed day phase cash actions batches friends promises upgrades hops music log totalSatisfied totalServed brew forage night reports lastMessage result prepared backstage life')) return false;
    if (s.version !== 1 || !integer(s.seed, 0, 4294967295) || !integer(s.day, 1, 3) || !integer(s.cash, 0, 1000000) || !integer(s.actions, 0, 2)) return false;
    if (!['welcome', 'prep', 'brew', 'forage', 'explore', 'night', 'summary', 'ending'].includes(s.phase)) return false;
    if (!shape(s.backstage, 'run discovered resolution trips from cashAfterClose journal') || !Array.isArray(s.backstage.discovered) || !unique(s.backstage.discovered) || !s.backstage.discovered.every(id => ['greenhouse', 'noor', 'market-shortcut', 'greenhouse-pump'].includes(id)) || ![null, 'returned', 'kept'].includes(s.backstage.resolution) || !integer(s.backstage.trips, 0, 3) || !integer(s.backstage.cashAfterClose,0,1000000)||!validJournal(s.backstage.journal,s)) return false;
    if(s.phase==='explore' ? !['prep','summary'].includes(s.backstage.from) : s.backstage.from!==null) return false;
    const afterClose=['summary','ending'].includes(s.phase)||s.phase==='explore'&&s.backstage.from==='summary';
    if(!afterClose&&s.backstage.cashAfterClose!==0)return false;
    const life=s.life,validBouquet=b=>shape(b,'palette wrap stored')&&['warm','cool','mixed'].includes(b.palette)&&['paper','ribbon'].includes(b.wrap)&&typeof b.stored==='boolean';
    if(!shape(life,'arrangement bouquet flowersDay display gifts morning clues')||!integer(life.flowersDay,0,s.day)||!integer(life.gifts,0,3)||!Array.isArray(life.morning)||life.morning.length>8||!life.morning.every(string))return false;
    if(!Array.isArray(life.clues)||life.clues.length>3||!unique(life.clues)||!life.clues.every(id=>['market','club','greenhouse'].includes(id)))return false;
    if(life.bouquet!==null&&!validBouquet(life.bouquet)||life.display!==null&&(!validBouquet(life.display)||life.display.stored))return false;
    if(life.arrangement!==null){const a=life.arrangement;if(s.phase!=='prep'||s.actions<1||s.cash<4||life.flowersDay===s.day||life.bouquet||!shape(a,'stems wrap')||!Array.isArray(a.stems)||a.stems.length>3||!unique(a.stems)||!a.stems.every(i=>integer(i,0,5))||![null,'paper','ribbon'].includes(a.wrap))return false;}
    if (s.phase === 'explore') {
      if (!B || !B.restore(s.backstage.run) || !A.valid(s.backstage.run) || s.backstage.run.seed !== s.seed || s.backstage.run.day !== s.day || !s.prepared.includes('explore')) return false;
    } else if (s.backstage.run !== null) return false;
    if (!shape(s.friends, 'lotte bram marta') || !Object.values(s.friends).every(n => integer(n, 0, 20))) return false;
    if (!shape(s.promises, 'lotte') || typeof s.promises.lotte !== 'boolean') return false;
    if (!Array.isArray(s.upgrades) || s.upgrades.length > 2 || !unique(s.upgrades) || !s.upgrades.every(id => owns(UPGRADES, id))) return false;
    if (!integer(s.hops, 0, 15) || typeof s.music !== 'boolean' || !integer(s.totalSatisfied, 0, 30) || !integer(s.totalServed, s.totalSatisfied, 30)) return false;
    if (!Array.isArray(s.log) || s.log.length > 12 || !s.log.every(string) || !string(s.lastMessage)) return false;
    if (!Array.isArray(s.prepared) || !unique(s.prepared) || !s.prepared.every(kind => ['coffee', 'visit', 'surf', 'market', 'lab', 'explore'].includes(kind))) return false;
    if (!Array.isArray(s.batches) || s.batches.length < 2 || s.batches.length > 32 || !unique(s.batches.map(b => b && b.id))) return false;
    if (!s.batches.every(b => shape(b, 'id beer cups quality madeDay aged') && string(b.id) && b.id.length > 0 && owns(BEERS, b.beer) && integer(b.cups, 0, 6) && integer(b.quality, 1, 3) && integer(b.madeDay, 1, s.day) && typeof b.aged === 'boolean')) return false;
    if (s.phase === 'brew') {
      if (!shape(s.brew, 'beer hits') || !owns(BEERS, s.brew.beer) || !Array.isArray(s.brew.hits) || s.brew.hits.length > 2 || !s.brew.hits.every(n => number(n, 0, 1))) return false;
    } else if (s.brew !== null) return false;
    if (s.phase === 'forage') {
      const f = s.forage;
      if (!shape(f, 'elapsed duration lane items haul') || f.duration !== 30 || !number(f.elapsed, 0, 30) || f.elapsed >= 30 || !integer(f.lane, 0, 2) || !integer(f.haul, 0, 2) || !s.prepared.includes('surf')) return false;
      if (!Array.isArray(f.items) || f.items.length !== 10 || !unique(f.items.map(item => item && item.id))) return false;
      if (!f.items.every((item, index) => shape(item, 'id kind lane arrival status') && item.id === 'd' + s.day + '-flotsam' + index && item.kind === ['hops', 'bottle', 'junk'][index % 3] && integer(item.lane, 0, 2) && item.arrival === index * 3 && ['future', 'floating', 'caught', 'missed'].includes(item.status))) return false;
      for (const item of f.items) {
        if (item.status === 'caught') { if (f.elapsed < item.arrival + 2.5 - 1e-8) return false; }
        else if (item.status !== (f.elapsed < item.arrival ? 'future' : f.elapsed < item.arrival + 5 ? 'floating' : 'missed')) return false;
      }
      if (f.haul !== f.items.filter(item => item.status === 'caught' && item.kind !== 'junk').length) return false;
    } else if (s.forage !== null) return false;
    if (!Array.isArray(s.reports) || s.reports.length !== (afterClose ? s.day : s.day - 1)) return false;
    if (!s.reports.every((r, i) => shape(r, 'day earned served satisfied lost rent cash promiseKept promiseBroken note') && r.day === i + 1 && integer(r.earned, 0, 1000000) && integer(r.satisfied, 0, 6 + 2 * r.day) && integer(r.served, r.satisfied, 6 + 2 * r.day) && integer(r.lost, 0, 6 + 2 * r.day) && r.served + r.lost === 6 + 2 * r.day && [12, 18, 21, 24].includes(r.rent) && integer(r.cash, 0, 1000000) && typeof r.promiseKept === 'boolean' && typeof r.promiseBroken === 'boolean' && !(r.promiseKept && r.promiseBroken) && string(r.note))) return false;
    if (s.phase==='night' || afterClose) {
      const n = s.night;
      if (!shape(n, 'elapsed duration orders pours earned served satisfied lost promiseKept promiseBroken event rentAdjustment') || n.duration !== 150 + 15 * s.day || !number(n.elapsed, 0, n.duration) || !integer(n.earned, 0, 1000000) || !integer(n.satisfied, 0, 30) || !integer(n.served, n.satisfied, 30) || !integer(n.lost, 0, 30) || typeof n.promiseKept !== 'boolean' || typeof n.promiseBroken !== 'boolean' || (n.promiseKept && n.promiseBroken)) return false;
      if (n.event !== null) {
        if (!shape(n.event, 'id status choice') || n.event.id !== eventForDay(s.day) || n.elapsed < 35 || !['pending', 'resolved'].includes(n.event.status)) return false;
        if (n.event.status === 'pending' ? n.event.choice !== null : !NIGHT_EVENTS[n.event.id].choices.some(choice => choice.id === n.event.choice)) return false;
      } else if (n.elapsed >= 35) return false;
      const adjustment = !n.event || n.event.status === 'pending' ? 0 : n.event.id === 'landlord' ? n.event.choice === 'comp' ? -6 : 3 : n.event.id === 'inspector' && n.event.choice === 'tasting' ? 6 : 0;
      if (n.rentAdjustment !== adjustment) return false;
      if (!Array.isArray(n.orders) || n.orders.length !== 6 + 2 * s.day || !unique(n.orders.map(o => o && o.id))) return false;
      if (!n.orders.every(o => shape(o, 'id name person beer budget arrival patience status portrait quote') && string(o.id) && o.id.length > 0 && string(o.name) && (o.person === null || owns(PEOPLE, o.person)) && owns(BEERS, o.beer) && integer(o.budget, 1, 1000000) && number(o.arrival, 0, n.duration) && number(o.patience, 1, 120) && ['future', 'waiting', 'served', 'lost'].includes(o.status) && string(o.portrait) && string(o.quote))) return false;
      if (n.orders.filter(o => o.status === 'served').length !== n.served || n.orders.filter(o => o.status === 'lost').length !== n.lost || n.orders.filter(o => o.status === 'waiting').length > seats(s)) return false;
      if (!Array.isArray(n.pours) || n.pours.length > (has(s, 'doubleTap') ? 2 : 1) || !unique(n.pours.map(p => p && p.customerId))) return false;
      if (!n.pours.every(p => shape(p, 'customerId beer price quality aged startedAt duration') && n.orders.some(o => o.id === p.customerId && o.status === 'waiting') && owns(BEERS, p.beer) && integer(p.price, 1, 1000000) && integer(p.quality, 1, 3) && typeof p.aged === 'boolean' && number(p.startedAt, 0, n.elapsed) && p.duration === 4)) return false;
      if (s.phase !== 'night' && (n.pours.length > 0 || n.orders.some(o => o.status === 'waiting' || o.status === 'future'))) return false;
      if (s.actions !== 0) return false;
      if (s.phase !== 'night') {
        const report = s.reports[s.reports.length - 1];
        if (report.cash + s.backstage.cashAfterClose !== s.cash || report.rent !== 18 + n.rentAdjustment || ['earned', 'served', 'satisfied', 'lost', 'promiseKept', 'promiseBroken'].some(key => report[key] !== n[key])) return false;
      }
    } else if (s.night !== null) return false;
    const reportedServed = s.reports.reduce((sum, report) => sum + report.served, 0);
    const reportedSatisfied = s.reports.reduce((sum, report) => sum + report.satisfied, 0);
    if (s.totalServed !== reportedServed + (s.phase === 'night' ? s.night.served : 0) || s.totalSatisfied !== reportedSatisfied + (s.phase === 'night' ? s.night.satisfied : 0)) return false;
    if (s.phase === 'welcome' && s.day !== 1) return false;
    if (s.phase === 'ending') {
      if (s.day !== 3 || !shape(s.result, 'won title description') || typeof s.result.won !== 'boolean' || s.result.won !== (s.cash >= 100 && s.totalSatisfied >= 12) || !string(s.result.title) || !string(s.result.description)) return false;
    } else if (s.result !== null) return false;
    return true;
  }
  function restore(value) {
    try {
      if (!safeData(value, new Set(), 0, { count: 0 })) return null;
      const restored = clone(value);
      if (restored && !owns(restored, 'backstage')) restored.backstage = { run: null, discovered: [], resolution: null, trips: 0 };
      if(restored&&!owns(restored,'life'))restored.life=freshLife();
      if(restored?.life&&!owns(restored.life,'clues'))restored.life.clues=[];
      if(restored?.backstage&&!owns(restored.backstage,'from')&&!owns(restored.backstage,'cashAfterClose')){
        restored.backstage.from=restored.phase==='explore'?'prep':null;restored.backstage.cashAfterClose=0;
      }
      if(restored?.backstage&&!owns(restored.backstage,'journal'))restored.backstage.journal=[];
      if(restored.backstage.run){restored.backstage.run=B.restore(restored.backstage.run);if(!restored.backstage.run)return null;}
      if (!validState(restored)) return null;
      return restored;
    } catch (_) { return null; }
  }

  return Object.freeze({ createGame, act, stock, customers, pourProgress, forageProgress, restore, flowerPalette, flowerFit, FLOWERS, BEERS, UPGRADES, PEOPLE, NIGHT_EVENTS });
});
