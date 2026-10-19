const G=require(process.argv[2]);
const r=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
const data={layers:{water:[],buildings:[],bridges:[],roads:[{id:'road-hole',properties:{functie:'rijbaan lokale weg'},polygons:[[r(-3,-3,3,3),r(.6,.6,.7,.7)]]}]}};
const n=G.createNavigator(data);
const actual=n.isWalkable({x:0,y:0},{radius:1});
console.log(JSON.stringify({fixture:'road hole wholly inside actor disk',center:{x:0,y:0},radius:1,holeBounds:[.6,.6,.7,.7],expected:false,actual}));
process.exitCode=actual===false?0:1;
