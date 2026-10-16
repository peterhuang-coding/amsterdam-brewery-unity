'use strict';
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const modulePath=process.argv[2], dataPath=process.argv[3];
if(!modulePath||!dataPath)throw Error('Explicit module and data paths required');
const api=require(modulePath);
const data=JSON.parse(fs.readFileSync(dataPath,'utf8'));
const oracle=JSON.parse(fs.readFileSync(__dirname+'/real-geos-oracle.json','utf8'));
const started=performance.now();
const nav=api.createNavigator(data,{radius:0.4});
const indexed=performance.now();
const failures=[];
for(const [i,c] of oracle.cases.entries()){
  const options={mode:c.mode,radius:c.radius};
  const actual=c.kind==='point'?nav.isWalkable(c.point,options):nav.segmentWalkable(c.start,c.end,options);
  if(actual!==c.expected)failures.push({i,...c,actual});
}
const result={cases:oracle.cases.length,failed:failures.length,falseSafe:failures.filter(f=>f.actual&&!f.expected).length,falseBlocked:failures.filter(f=>!f.actual&&f.expected).length,indexMs:indexed-started,queryMs:performance.now()-indexed,failures,stats:nav.stats()};
fs.writeFileSync(__dirname+'/real-geos-oracle-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,failures:failures.slice(0,10)}));
process.exitCode=failures.length?1:0;
