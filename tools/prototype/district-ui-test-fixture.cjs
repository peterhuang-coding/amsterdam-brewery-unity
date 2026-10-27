'use strict';
// Test-only synthetic bytes. Every UI consumer runs the real loader, navigator,
// adapter and renderers. No geometry here is a production map fallback.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const MAP_VERSION = 'amsterdam-shape-d30-v1';
const LEGACY_MAP_VERSION = 'amsterdam-shape-d29-v1';
const SAVE_KEY = 'ab_reopening_v1';
const noop = () => {};
const LINKS = [
  { from: 'jordaan', to: 'depijp', mode: 'street' },
  { from: 'jordaan', to: 'station', mode: 'street' },
  { from: 'depijp', to: 'science', mode: 'street' },
  { from: 'science', to: 'station', mode: 'street' },
  { from: 'station', to: 'noord', mode: 'ferry', id: 'F3' }
];
function runs(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    let end = i + 1; while (mask[end]) end++;
    out.push([i, end - i]); i = end - 1;
  }
  return out;
}
function district(id, name, ox, oy, anchors) {
  const cols = 180, rows = 100, walk = new Uint8Array(cols * rows).fill(1);
  const bike = new Uint8Array(walk);
  // A water column with a walking-only bridge; routing must use the bridge.
  for (let y = 0; y < rows; y++) for (let x = 80; x < 86; x++) {
    walk[y * cols + x] = y >= 46 && y <= 53 ? 1 : 0; bike[y * cols + x] = 0;
  }
  const a = {};
  for (const [key, x, y] of anchors) a[key] = { x: ox + x + .5, y: oy + y + .5,
    sourceX: ox + x + .2, sourceY: oy + y + .3, featureId: 'synthetic-' + key };
  const rectangle = (kind, x, y, w, h) => ({ kind, rings: [[[ox+x,oy+y],[ox+x+w,oy+y],[ox+x+w,oy+y+h],[ox+x,oy+y+h],[ox+x,oy+y]]] });
  return { schemaVersion: 1, mapVersion: MAP_VERSION, id, name,
    bounds: [ox, oy, ox + cols, oy + rows], anchors: a,
    entrance: { x: a[anchors[0][0]].x, y: a[anchors[0][0]].y },
    nav: { origin: [ox,oy], cols, rows, cellSize: 1, walkRuns: runs(walk), bikeRuns: runs(bike) },
    shapes: [rectangle('road',0,0,180,100),rectangle('water',80,0,6,100),rectangle('bridge',80,46,6,8),rectangle('building',40,70,10,15)] };
}
function makeFixture() {
  const docs = [
    district('jordaan','Jordaan',0,0,[['pub',10,20],['lotte',155,70]]),
    district('depijp','De Pijp',300,200,[['market',15,20],['coffee',150,20],['flowers',20,70],['flowerCart',35,70],['garden',155,70]]),
    district('station','Centraal',650,0,[['ferrySouth',130,70]]),
    district('noord','Noord',650,300,[['ferryNorth',130,30]]),
    district('science','Science Park',1050,200,[['lab',130,70]])
  ];
  const assets = new Map();
  function pack(url, doc) {
    const raw = Buffer.from(JSON.stringify(doc)); const gzip = gzipSync(raw);
    assets.set(url, gzip);
    return { url, bytes: raw.length, gzipBytes: gzip.length, sha256: createHash('sha256').update(raw).digest('hex') };
  }
  const overview = { schemaVersion: 1, mapVersion: MAP_VERSION, bounds: [0,0,1250,450],
    shapes: docs.flatMap(d => d.shapes),
    markers: docs.flatMap(d => Object.entries(d.anchors).map(([id,a]) => ({id,districtId:d.id,x:a.sourceX,y:a.sourceY}))), travelLinks: LINKS };
  const manifest = { schemaVersion: 1, mapVersion: MAP_VERSION,
    projection: { type: 'local-equirectangular', units: 'metres' },
    source: { complete: false, provider: 'Explicit synthetic test fixture' },
    attribution: 'Synthetic test fixture; not production geography.',
    overview: pack('overview.json.gz', overview),
    districts: docs.map(d => ({ id:d.id,name:d.name,bounds:d.bounds,anchorIds:Object.keys(d.anchors),...pack('districts/'+d.id+'.json.gz',d) })), travelLinks: LINKS };
  assets.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const byId = Object.fromEntries(docs.map(d => [d.id,d]));
  const anchors = Object.assign({}, ...docs.map(d => Object.fromEntries(Object.entries(d.anchors).map(([id,a]) => [id,{...a,districtId:d.id}]))));
  return { assets, manifest, overview, docs, byId, anchors };
}
function recordContext() {
  const marks = []; let transform = [1,0,0,1,0,0]; const stack = [];
  const target = { marks, getTransform: () => ({a:transform[0],b:transform[1],c:transform[2],d:transform[3],e:transform[4],f:transform[5]}),
    setTransform(...v) { transform = v; marks.push(['setTransform',...v]); },
    resetTransform() { this.setTransform(1,0,0,1,0,0); },
    save() { stack.push(transform.slice()); }, restore() { if(stack.length) transform=stack.pop(); },
    scale(x,y) { transform[0]*=x;transform[3]*=y;marks.push(['scale',x,y]); },
    translate(x,y) { transform[4]+=x*transform[0];transform[5]+=y*transform[3]; },
    measureText: t => ({width:String(t).length*8}),
    createLinearGradient: () => ({addColorStop:noop}), createRadialGradient: () => ({addColorStop:noop}) };
  return new Proxy(target,{get:(o,k)=>k in o?o[k]:(...v)=>marks.push([k,...v])});
}
function createHarness(saved = null, options = {}) {
  const fixture = options.fixture || makeFixture();
  const storage = options.storage || new Map();
  if(saved) storage.set(SAVE_KEY,JSON.stringify(saved));
  const listeners = {}, canvasListeners = {}, rafs = [], intervals = [], requests = [];
  const els = new Map(), contexts = [], offscreens = [];
  let now = 1000;
  const mkEl = () => ({ textContent:'',innerHTML:'',hidden:false,disabled:false,dataset:{},style:{},title:'',isConnected:true,
    setAttribute:noop,removeAttribute:noop,addEventListener:noop,removeEventListener:noop,
    classList:{toggle:noop,add:noop,remove:noop},focus:noop,scrollIntoView:noop,remove:noop,appendChild:noop,
    querySelector:()=>null,querySelectorAll:()=>[],matches:()=>false });
  let document;
  const bodyClasses = new Set();
  const bodyClassList = {
    toggle(name, force) {
      const enabled = force === undefined ? !bodyClasses.has(name) : Boolean(force);
      if (enabled) bodyClasses.add(name); else bodyClasses.delete(name);
      return enabled;
    },
    add(name) { bodyClasses.add(name); },
    remove(name) { bodyClasses.delete(name); },
    contains(name) { return bodyClasses.has(name); }
  };
  const bodyFocus = {tag:'body',isConnected:false,matches:()=>false,focus:noop};
  const summary = {tag:'summary',isConnected:true,matches:()=>false,focus(){document.activeElement=this;}};
  let actionHtml='', actionCache;
  const actions = {...mkEl(),get innerHTML(){return actionHtml;},set innerHTML(v){actionHtml=String(v);actionCache=null;},
    buttons(){return actionCache ||= [...actionHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m,index)=>({
      tag:'button',index,secondary:/class="secondary"/.test(m[1]),disabled:/\bdisabled\b/.test(m[1]),
      label:(m[2].match(/^([^<]*)/)||['',''])[1],isConnected:true,matches:()=>false,focus(){document.activeElement=this;}}));},
    querySelector(sel){return /button/.test(sel)?this.buttons().find(b=>!b.disabled)||null:null;},
    querySelectorAll(sel){return /button/.test(sel)?this.buttons().filter(b=>!b.disabled):[];} };
  const dialogBody=mkEl();
  const overlay={...mkEl(),hidden:true,querySelectorAll(sel){return [
    ...(sel.includes('summary')&&/<summary\b/.test(dialogBody.innerHTML)?[summary]:[]),
    ...(sel.includes('button')?actions.buttons().filter(b=>!b.disabled):[])];}};
  function canvas(offscreen=false) {
    const ctx=recordContext(); contexts.push(ctx);
    const cv={...mkEl(),width:1100,height:640,tabIndex:0,ownerDocument:null,
      clientWidth:options.width||1100,clientHeight:options.height||640,
      getContext:()=>ctx,getBoundingClientRect:()=>({left:options.left||0,top:options.top||0,width:(options.width||1100)+2*(options.border||0),height:(options.height||640)+2*(options.border||0)}),
      addEventListener(type,cb){if(!offscreen)(canvasListeners[type] ||= []).push(cb);}};
    if(offscreen)offscreens.push(cv);return cv;
  }
  document={hidden:false,activeElement:bodyFocus,body:{classList:bodyClassList},
    addEventListener(type,cb){(listeners[type] ||= []).push(cb);},
    createElement(tag){const e=tag==='canvas'?canvas(true):mkEl();e.ownerDocument=document;return e;},
    getElementById(id){
      if(id==='overlay')return overlay;if(id==='dialog-actions')return actions;if(id==='dialog-body')return dialogBody;
      if(!els.has(id)){const el=id==='pub-canvas'?canvas():mkEl();if(id==='seed-input')el.value=42;el.ownerDocument=document;els.set(id,el);}return els.get(id);},
    querySelector:()=>null,querySelectorAll:()=>[]};
  const overrides = options.overrides || new Map();
  const fetchImpl=async(url,init={})=>{
    const pathname=new URL(url,'http://district.test/tools/prototype/index.html').pathname;
    const key=pathname.endsWith('/manifest.json')?'manifest.json':pathname.includes('/districts/')?'districts/'+pathname.split('/districts/')[1]:'overview.json.gz';
    requests.push({url,key,signal:init.signal});
    if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(overrides.has(key))return overrides.get(key)(url,init);
    const bytes=fixture.assets.get(key);
    return bytes?new Response(bytes,{status:200}):new Response('missing fixture',{status:404});
  };
  const timers=new Set();
  const sandbox={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    performance:{now:()=>now},setTimeout(cb,ms=0){const id=setTimeout(()=>{timers.delete(id);cb();},ms);id.unref?.();timers.add(id);return id;},clearTimeout(id){clearTimeout(id);timers.delete(id);},
    setInterval(cb,ms){intervals.push({cb,ms});return intervals.length;},clearInterval:noop,
    requestAnimationFrame(cb){rafs.push(cb);return rafs.length;},cancelAnimationFrame:noop,
    devicePixelRatio:options.dpr||1,location:{href:'http://district.test/tools/prototype/index.html',search:options.search||''},
    URL,URLSearchParams,AbortController,DOMException,Response,ReadableStream,TransformStream,DecompressionStream,
    TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,crypto:webcrypto,fetch:fetchImpl,console,
    matchMedia:()=>({matches:false}),scrollTo:noop,addEventListener:noop,CSS:{escape:String},AudioContext:undefined,
    getComputedStyle:()=>({borderLeftWidth:String(options.border||0),borderRightWidth:String(options.border||0),borderTopWidth:String(options.border||0),borderBottomWidth:String(options.border||0),paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0'})};
  sandbox.window=sandbox; document.defaultView=sandbox;
  vm.createContext(sandbox);
  for(const file of ['journey-core.js','backstage-core.js','backstage-auto.js','delivery-orders.js','character-stories.js','flower-network.js',
    'reopening-core.js','reopening-city.js','district-runtime.js','district-city.js','district-scene.js','reopening-scene.js',
    'backstage-scene.js','backstage-ui.js','journey-ui.js','reopening-ui.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),sandbox,{filename:file});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const ready=async()=>{assert.equal(typeof sandbox.ReopeningEntry?.ready,'function','entry exposes asynchronous ready()');await sandbox.ReopeningEntry.ready();for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,0));const d=sandbox.ReopeningEntry.diagnostics();if(!d.routePending&&!d.cartRoutePending)break;}await flush();};
  const rawClick=(dataset,disabled=false)=>{const button={dataset,disabled};const event={target:{closest:sel=>sel==='button[data-action]'?button:null}};for(const cb of listeners.click||[])cb(event);};
  const rawModal=index=>{const button={dataset:{modalAction:String(index)},disabled:false};for(const cb of listeners.click||[])cb({target:{closest:sel=>sel==='[data-modal-action]'?button:null}});};
  const click=async(...args)=>{rawClick(...args);await ready();};
  const clickModal=async index=>{rawModal(index);await ready();};
  const board=()=>els.get('action-content')?.innerHTML||'';
  const diagnostics=()=>JSON.parse(JSON.stringify(sandbox.ReopeningEntry.diagnostics()));
  async function frames(count=1,dt=100){for(let i=0;i<count;i++){now+=dt;const cb=rafs.shift();assert.ok(cb,'animation frame scheduled');cb(now);await flush();}}
  async function tick(dt=100){now+=dt;for(const interval of intervals)interval.cb();await flush();}
  async function settleTravel(place,limit=2400){
    for(let i=0;i<limit;i++){
      const d=diagnostics();
      if(!overlay.hidden&&d.travel){await clickModal(0);}
      await ready();
      if(board().includes('<h2>'+sandbox.DistrictCity.PLACES[place]?.name+'</h2>'))return board();
      await frames(1);
    }
    assert.fail('never entered '+place+': '+JSON.stringify(diagnostics()));
  }
  async function travel(place,limit){await click({action:'city-travel',place});return settleTravel(place,limit);}
  const key=(keyName,shiftKey=false)=>{const ev={key:keyName,shiftKey,repeat:false,target:document.activeElement,preventDefault(){ev.defaultPrevented=true;}};for(const cb of listeners.keydown||[])cb(ev);return ev;};
  const launcher={tag:'launcher',isConnected:true,matches:()=>false,focus(){document.activeElement=this;}};
  return {sandbox,fixture,storage,requests,overrides,els,contexts,offscreens,document,canvas:document.getElementById('pub-canvas'),canvasListeners,
    emit(type,event={}){for(const cb of listeners[type]||[])cb(event);},
    ready,flush,diagnostics,rawClick,rawModal,click,clickModal,frames,tick,travel,settleTravel,key,launcher,
    save:()=>JSON.parse(storage.get(SAVE_KEY)||'null'),board,queue:()=>els.get('queue')?.innerHTML||'',toolbar:()=>els.get('city-toolbar')?.innerHTML||'',
    overlay:()=>overlay,kicker:()=>els.get('dialog-kicker')?.textContent||'',dialogTitle:()=>els.get('dialog-title')?.textContent||'',dialogBody:()=>dialogBody.innerHTML,dialogActions:()=>actions.innerHTML,
    controls:()=>overlay.querySelectorAll('button:not(:disabled),a,input,summary'),active:()=>document.activeElement,setActive:e=>{document.activeElement=e;},
    nativeMove(shift){const list=overlay.querySelectorAll('button:not(:disabled),a,input,summary'),i=list.indexOf(document.activeElement);if(i>=0)document.activeElement=list[(i+(shift?-1:1)+list.length)%list.length];},
    close(){for(const t of timers)clearTimeout(t);timers.clear();},
    hasBodyClass:name=>bodyClasses.has(name)};
}
async function harness(saved,options){const h=createHarness(saved,options);await h.ready();return h;}
module.exports={createHarness,harness,makeFixture,MAP_VERSION,LEGACY_MAP_VERSION,SAVE_KEY,recordContext};
