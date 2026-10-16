async page => {
 await page.goto('http://127.0.0.1:18862/r2/parent-full.html');
 await page.waitForFunction(()=>window.ready===true);
 const rows=[];
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});
  for(const camera of ['street','city'])for(const night of [false,true]){
   rows.push(await page.evaluate(({camera,night})=>{
    const c=document.querySelector('#test'), ctx=c.getContext('2d'), calls=[], orig=ctx.fillText;ctx.fillText=function(text,x,y,...args){const t=this.getTransform();calls.push({text,font:this.font,measured:this.measureText(text).width,effectiveCss:parseFloat(this.font.match(/([0-9.]+)px/)[1])*t.a*c.clientWidth/c.width});return orig.call(this,text,x,y,...args)};const q=drawTest(camera,night),r=q.result;ctx.fillText=orig;
    const a=r.labels.find(l=>l.id==='lotte'),b=r.labels.find(l=>l.id==='pub');
    const overlap=(a,b)=>!!a&&!!b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    const metrics=r.labels.map(l=>({id:l.id,text:l.text,fontCss:l.fontCssPx,width:l.width,draw:calls.find(x=>x.text===l.text),inside:l.x>=0&&l.y>=0&&l.x+l.width<=1100&&l.y+l.height<=640}));
    return {viewport:innerWidth,cssWidth:q.cssWidth,camera,night,loadMs,indexMs,elapsedMs:q.elapsedMs,selected:!!a,nearest:!!b,overlap:overlap(a,b),metrics,errors:window.errors,stats:q.stats};
   },{camera,night}));
  }
  if(width===390){await page.evaluate(()=>drawTest('street',false));await page.screenshot({path:'/tmp/amsterdam-d26-render-r2-parent-20261017/full-street-390.png',fullPage:true});}
 }
 await page.evaluate(()=>drawTest('city',true));await page.screenshot({path:'/tmp/amsterdam-d26-render-r2-parent-20261017/full-city-night-1440.png',fullPage:true});
 return rows;
}
