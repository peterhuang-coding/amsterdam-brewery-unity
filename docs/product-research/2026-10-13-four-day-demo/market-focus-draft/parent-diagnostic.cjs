'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('./backstage-core.js'),A=require('./backstage-auto.js');
const shift=(day=1,kit='hook',seed=42)=>B.create(seed,day,kit,[],{marketShift:true});
const noop=()=>{};
function harness(run,paused=false){
  const gradient={addColorStop:noop};
  const context2d=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:noop});
  const canvas={getContext:()=>context2d,addEventListener:noop,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:640}),setAttribute:noop};
  const mkEl=()=>({textContent:'',hidden:false,disabled:false,innerHTML:'',setAttribute:noop,classList:{toggle:noop},style:{},title:'',focus:noop,scrollIntoView:noop});
  const els=new Map();
  const document={addEventListener:noop,hidden:false,body:{classList:{toggle:noop}},
    getElementById:id=>{if(!els.has(id))els.set(id,mkEl());return els.get(id);},
    querySelector:()=>null};
  const state={run};const flags={paused};
  const window={Backstage:B,BackstageAuto:A,addEventListener:noop};
  const sandbox={window,document,matchMedia:()=>({matches:false})};
  window.window=window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-scene.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'backstage-ui.js'),'utf8'),sandbox);
  const ui=new window.BackstageUI({canvas,getState:()=>({phase:'explore',backstage:{run:state.run}}),isPaused:()=>flags.paused,save:noop,dispatch:noop,showModal:noop});
  return {ui,els,state,flags,board:()=>els.get('action-content').innerHTML};
}
function walkTo(r,to){
  for(let n=0;n<9000&&Math.hypot(to.x-r.p.x,to.y-r.p.y)>6;n++){
    const d=Math.hypot(to.x-r.p.x,to.y-r.p.y);
    B.step(r,{dx:(to.x-r.p.x)/d,dy:(to.y-r.p.y)/d},.025);
  }
  assert.ok(Math.hypot(to.x-r.p.x,to.y-r.p.y)<10,JSON.stringify({p:r.p,to}));
}
function focus(html){
  const m=html.match(/<div class="exp-location" id="exp-market-focus"[^>]*>([\s\S]*?)<\/div>/);
  if(!m)return null;
  const clean=x=>(x||'').replace(/<[^>]+>/g,'');
  return {
    block:m[0],
    heading:clean(m[0].match(/<strong>([\s\S]*?)<\/strong>/)[1]),
    action:clean(m[0].match(/<p>([\s\S]*?)<\/p>/)[1]),
    note:clean((m[0].match(/<small>([\s\S]*?)<\/small>/)||[])[1])
  };
}
const clen=s=>[...s].length;
function assertSized(f){
  assert.ok(f,'focus card exists');
  assert.ok(f.heading.length&&f.action.length,'heading and action present');
  assert.ok(clen(f.heading)<=24,'heading <=24 chars: '+f.heading);
  assert.ok(clen(f.action)<=65,'action <=65 chars: '+f.action);
}
const MANUAL_VERBS=['market-salvage','market-trade','market-deliver','market-power'];


const r=shift(1);r.actors=[];Object.assign(r.p,{x:405,y:1110});const h=harness(r);h.ui.render();
console.log(JSON.stringify({case:'market_objectives',zone:B.zone(r).id,enabled:B.marketInfo(r).enabled,wrapperPresent:h.board().includes('exp-objectives'),textPresent:['一箱“进口酵母”','红灯街的 Noor','玻璃后面，有人在生活'].map(x=>({text:x,present:h.board().includes(x)}))}));
B.command(r,'market-salvage');Object.assign(r.p,{x:405,y:990});B.command(r,'collect',{itemId:'item0'});h.ui.render();console.log(JSON.stringify({case:'collected',bag:r.bag,stockTaken:B.marketInfo(r).stockTaken,focus:focus(h.board())}));
B.command(r,'drop');h.ui.render();console.log(JSON.stringify({case:'after_real_drop',bag:r.bag,item:r.items[0].state,stockTaken:B.marketInfo(r).stockTaken,focus:focus(h.board())}));
