// Structural economy diagnostic, not a human playtest or optimal strategy.
// All game state advances through Reopening.act; no state/resource injection.
const R=require('../../../tools/prototype/reopening-core.js');
function run(seed,quality,timing,upgrade){
 let s=R.createGame(seed);const a=x=>{const r=R.act(s,x);if(!r.ok)throw Error(JSON.stringify(x)+': '+r.message);s=r.state;};
 const events=()=>{if(s.phase==='night'&&s.night.event?.status==='pending')a({type:'event',choice:s.day===1?'comp':s.day===2?'refuse':'tasting'});};
 const tick=t=>{while(t>1e-7&&s.phase==='night'){events();const d=Math.min(1,t);a({type:'tick',seconds:d});t-=d;}events();};
 a({type:'start'});let report=[];
 for(let day=1;day<=3;day++){
  a({type:'prepare',kind:'brew',beer:day===1?'stout':'blond'});for(let i=0;i<3;i++)a({type:'brewHit',score:quality===3?1:0});
  a({type:'open'});
  while(s.phase==='night'){
   events();const o=R.customers(s)[0];if(!o){tick(1);continue;}
   const b=s.batches.find(b=>b.beer===o.beer&&b.cups>0);if(!b){a({type:'water',customerId:o.id});continue;}
   const base=R.BEERS[o.beer].price,price=b.quality>=2&&o.budget>=base+4?base+4:base;
   a({type:'pour',beer:b.beer,batchId:b.id,customerId:o.id,price});tick(4*timing);if(s.phase==='night')a({type:'serve',customerId:o.id});
  }
  report.push({day,cash:s.cash,satisfied:s.totalSatisfied,stock:{blond:R.stock(s,'blond'),stout:R.stock(s,'stout')}});
  if(day<3)a(upgrade&&day===1?{type:'upgrade',id:upgrade}:{type:'next'});else a({type:'finish'});
 }
 return {seed,quality,timing,upgrade,prepActionsUsed:3,totalPrepActions:6,report,won:s.result.won};
}
console.log(JSON.stringify([run(2026,1,.5,null),run(2026,3,.72,null),run(42,1,.5,null),run(1,1,.5,null),run(2026,3,.72,'stage'),run(2026,3,.72,'cellar'),run(2026,3,.72,'doubleTap')],null,2));
