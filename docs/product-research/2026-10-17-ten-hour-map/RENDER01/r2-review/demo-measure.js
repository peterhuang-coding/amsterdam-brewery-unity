async page => {
 await page.addInitScript(() => {
  window.__draws=[];
  const previous = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args) {
   if(this.canvas.id==='map') { const m=this.getTransform();window.__draws.push({text,font:this.font,x,y,transform:[m.a,m.d],bounds:this.canvas.getBoundingClientRect().toJSON(),backing:[this.canvas.width,this.canvas.height]});if(window.__draws.length>300)window.__draws.splice(0,100); }
   return previous.call(this,text,x,y,...args);
  };
 });
 await page.reload();
 await page.waitForFunction(()=>window.__draws.length>10);
 return await page.evaluate(async()=>{
  const c=document.querySelector('#map'), readings=[];
  for(let i=0;i<121;i++){if(i%20===0)readings.push({frame:i,rect:c.getBoundingClientRect().toJSON(),backing:[c.width,c.height],client:[c.clientWidth,c.clientHeight],overflow:document.documentElement.scrollWidth>innerWidth});await new Promise(requestAnimationFrame);}
  return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,readings,text:window.__draws.slice(-20),error:document.querySelector('#err').textContent};
 });
}
