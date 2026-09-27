(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FlowerNetwork=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ENTRY=Object.freeze({id:'garden',name:'温室日间侧门',district:'花店后街',x:1510,y:690});
  const CART=Object.freeze({x:1310,y:1040});
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
  return Object.freeze({ENTRY,CART,fresh,ask,visit,context,notes,valid});
});
