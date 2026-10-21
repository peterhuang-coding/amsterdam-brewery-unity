(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FlowerNetwork=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Legacy 1800x1120 invented-unit metadata. Retained ONLY for the standalone
  // economy tests; the active district UI is gated on configureMap() and can
  // never use the legacy rectangle as a geometry fallback.
  const LEGACY_ENTRY=Object.freeze({id:'garden',name:'温室日间侧门',district:'花店后街',x:1510,y:690});
  const LEGACY_CART=Object.freeze({id:'flowerCart',x:1310,y:1040});
  const LEGACY_LIMIT=Object.freeze({width:1800,height:1120,radius:60});
  const ENTRY_RADIUS=4; // metres, district snapped coordinates
  let mapConfig=null;
  function finite(v){return typeof v==='number'&&Number.isFinite(v);}
  function finitePoint(p){return !!p&&typeof p==='object'&&finite(p.x)&&finite(p.y);}
  // Atomic configuration: every field is validated before any observable
  // global state changes, so an invalid config leaves the previous mode intact.
  function configureMap(cfg){
    if(!cfg||typeof cfg!=='object')throw new TypeError('FlowerNetwork.configureMap: {mapVersion,districtId,entry,cart} required');
    if(typeof cfg.mapVersion!=='string'||!cfg.mapVersion)throw new TypeError('FlowerNetwork.configureMap: mapVersion must be a non-empty string');
    if(typeof cfg.districtId!=='string'||!cfg.districtId)throw new TypeError('FlowerNetwork.configureMap: districtId must be a non-empty string');
    if(!finitePoint(cfg.entry))throw new TypeError('FlowerNetwork.configureMap: entry needs finite x/y');
    if(!finitePoint(cfg.cart))throw new TypeError('FlowerNetwork.configureMap: cart needs finite x/y');
    mapConfig=Object.freeze({
      mapVersion:cfg.mapVersion,districtId:cfg.districtId,
      entry:Object.freeze({x:cfg.entry.x,y:cfg.entry.y}),
      cart:Object.freeze({x:cfg.cart.x,y:cfg.cart.y})
    });
  }
  function resetMap(){mapConfig=null;}
  function isMapConfigured(){return mapConfig!==null;}
  function isAtEntry(position){
    if(!finitePoint(position))return false;
    if(mapConfig){
      // District mode requires the caller's position to claim the exact
      // configured map and district, finite coordinates, and a <=4 m arrival.
      return position.map===mapConfig.mapVersion&&
        position.districtId===mapConfig.districtId&&
        Math.hypot(position.x-mapConfig.entry.x,position.y-mapConfig.entry.y)<=ENTRY_RADIUS;
    }
    // Legacy standalone compatibility only (old 1800x1120, 60-unit threshold).
    return position.x>=0&&position.x<=LEGACY_LIMIT.width&&
      position.y>=0&&position.y<=LEGACY_LIMIT.height&&
      Math.hypot(position.x-LEGACY_ENTRY.x,position.y-LEGACY_ENTRY.y)<=LEGACY_LIMIT.radius;
  }
  const fresh=(discovered=[])=>({known:discovered.includes('greenhouse'),source:discovered.includes('greenhouse')?'night':null,introduced:false,visits:[]});
  function ask(s){
    if(s.phase!=='prep')return {ok:false,message:'Ada 白天才在花店留介绍信。'};
    s.garden.known=true;if(s.garden.source===null)s.garden.source='ada';s.garden.introduced=true;
    return {ok:true,message:'Ada 在地图上圈出温室侧门，写了张介绍便签。送花时能绕去补包装，材料费免 €2，仍要花 8 秒；不接她的晚间邀请也能去。问路本身不算到访。'};
  }
  function visit(s,source){
    s.garden.known=true;if(s.garden.source===null)s.garden.source=source;
    if(!s.garden.visits.includes(s.day))s.garden.visits.push(s.day);
    if(!s.backstage.discovered.includes('greenhouse'))s.backstage.discovered.push('greenhouse');
  }
  const context=s=>({known:s.garden.known||s.backstage.discovered.includes('greenhouse'),introduced:s.garden.introduced,pump:s.backstage.discovered.includes('greenhouse-pump')});
  function notes(s){
    const g=s.garden,known=context(s).known;if(!known)return [];
    const origin={ada:'Ada 画出的侧门路线',cart:'跟着搬花车找到的侧门',self:'散步时自己找到的侧门',night:'夜探时认出的温室'}[g.source]||'夜探时认出的温室';
    return [origin+'：白天可免费重访，送花时可改道停靠。',...(g.visits.length?['第 '+g.visits.join('、')+' 天实际进过温室，夜里也认得后门出口。']:[]),...(context(s).pump?['夜里修好的水泵仍在工作：白天送花的温室入口不再减速。']:[])];
  }
  function valid(s){
    const g=s.garden;if(!g||Object.keys(g).sort().join(',')!=='introduced,known,source,visits'||typeof g.known!=='boolean'||typeof g.introduced!=='boolean'||![null,'ada','cart','self','night'].includes(g.source))return false;
    if(g.known!==(g.source!==null)||g.introduced&&!g.known||!Array.isArray(g.visits)||g.visits.length>3)return false;
    if(!g.visits.every((d,i)=>Number.isInteger(d)&&d>=1&&d<=s.day&&(i===0||d>g.visits[i-1])))return false;
    return !g.visits.length||g.known&&s.backstage.discovered.includes('greenhouse');
  }
  const api={fresh,ask,visit,context,notes,valid,configureMap,resetMap,isMapConfigured,isAtEntry};
  // ENTRY/CART getters: configured mode exposes the snapped points while
  // retaining the original id/name metadata; unconfigured callers receive the
  // exact frozen legacy objects (standalone compatibility).
  Object.defineProperties(api,{
    ENTRY:{enumerable:true,get(){
      if(!mapConfig)return LEGACY_ENTRY;
      return Object.freeze({id:'garden',name:LEGACY_ENTRY.name,district:mapConfig.districtId,
        map:mapConfig.mapVersion,x:mapConfig.entry.x,y:mapConfig.entry.y});
    }},
    CART:{enumerable:true,get(){
      if(!mapConfig)return LEGACY_CART;
      return Object.freeze({id:'flowerCart',district:mapConfig.districtId,
        map:mapConfig.mapVersion,x:mapConfig.cart.x,y:mapConfig.cart.y});
    }}
  });
  return Object.freeze(api);
});
