const fs=require('fs');const {performance}=require('perf_hooks');const G=require(process.argv[2]);
const data=JSON.parse(fs.readFileSync('/tmp/amsterdam-d26-anchor-source-20261017/pub-parent-data.json','utf8'));
let t=performance.now();const nav=G.createNavigator(data,{cellSize:2,maxNodes:30000,radius:0});
console.log(JSON.stringify({phase:'index',ms:performance.now()-t,stats:nav.stats()}));
const points=[{x:1100.211,y:3243.117},{x:1056.057,y:3247.41}];
for(const p of points){t=performance.now();console.log(JSON.stringify({phase:'walkable',point:p,result:nav.isWalkable(p),ms:performance.now()-t}));}
t=performance.now();const r=nav.route(points[0],points[1],{maxNodes:30000});console.log(JSON.stringify({phase:'route',ms:performance.now()-t,result:r,stats:nav.stats()}));
