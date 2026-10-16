const fs=require('node:fs'),{performance}=require('node:perf_hooks');
const G=require('/tmp/amsterdam-d26-nav-r2-parent-20261017/final/geo-navigation.js');
const root=__dirname;const started=performance.now();
const data=JSON.parse(fs.readFileSync('/tmp/amsterdam-d26-pack-r2-parent-20261017/full/runtime.json','utf8'));
const loaded=performance.now();const nav=G.createNavigator(data,{radius:.4});const built=performance.now();
const anchors=JSON.parse(fs.readFileSync('/tmp/amsterdam-d26-anchor-source-20261017/integration-anchor-candidates.json','utf8'));
const safe=Object.fromEntries(Object.entries(anchors).map(([k,p])=>[k,{walk:nav.isWalkable(p,{mode:'walk',radius:.4}),bike:nav.isWalkable(p,{mode:'bike',radius:.4})}]));
const f=process.argv[2]||'lotte';const t=performance.now(); const r=nav.route(anchors.pub,anchors[f],{radius:.4,mode:'walk',maxNodes:20000});
const out={readMs:loaded-started,buildMs:built-loaded,anchors:safe,to:f,routeMs:performance.now()-t,route:r,stats:nav.stats(),memory:process.memoryUsage()};fs.writeFileSync(root+'/full-'+f+'.json',JSON.stringify(out,null,2));console.log(JSON.stringify({...out,route:{...r,points:r.points.length}}));
