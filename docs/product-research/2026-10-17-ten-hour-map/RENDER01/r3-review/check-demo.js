async page => {
 const browser=page.context().browser(),rows=[];
 for(const dpr of [1,2]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
  await p.addInitScript(()=>{window.__paintCount=0;const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...a){if(this.canvas.id==='map')window.__paintCount++;return f.apply(this,a)};});
  await p.goto('http://127.0.0.1:18864/WHICH/renderer-demo.html');await p.waitForFunction(()=>window.__paintCount>20);
  async function measure(stage,frames=100){
   const r=await p.evaluate(async frames=>{const c=document.querySelector('#map');const snap=()=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c),b=x=>parseFloat(s[x])||0;return {rect:r.toJSON(),backing:[c.width,c.height],content:[r.width-b('borderLeftWidth')-b('borderRightWidth')-b('paddingLeft')-b('paddingRight'),r.height-b('borderTopWidth')-b('borderBottomWidth')-b('paddingTop')-b('paddingBottom')],footer:document.querySelector('footer').getBoundingClientRect().y,dpr:devicePixelRatio,paintCount:window.__paintCount}};for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);const first=snap();let min=first.rect.height,max=min;for(let i=0;i<frames;i++){await new Promise(requestAnimationFrame);const h=c.getBoundingClientRect().height;min=Math.min(min,h);max=Math.max(max,h)}return {first,last:snap(),heightRange:max-min}},frames);
   r.stage=stage;r.requestedDpr=dpr;r.stable=r.heightRange<=0.05&&Math.abs(r.first.footer-r.last.footer)<=0.05;r.backingMatches=r.last.backing.every((n,i)=>Math.abs(n-r.last.content[i]*dpr)<=1);rows.push(r);
  }
  await measure('static390');await p.screenshot({path:'/tmp/amsterdam-d26-render-r3-parent-20261017/output/playwright/WHICH-demo390-dpr'+dpr+'.png',fullPage:true});
  if('WHICH'==='final'){
   await p.setViewportSize({width:1440,height:900});await measure('resize1440',40);
   for(const label of ['CSS 320','CSS 390','CSS 1100','全城总览','缩放 2','夜间','街头视角']){await p.getByRole('button',{name:label,exact:true}).click();await measure(label,24)}
   await p.setViewportSize({width:390,height:844});await measure('return390',100);
  }
  rows.push({dpr,errors});await ctx.close();
 }
 return {rows,stable:rows.filter(r=>'stable'in r).every(r=>r.stable),backingMatches:rows.filter(r=>'backingMatches'in r).every(r=>r.backingMatches),errors:rows.flatMap(r=>r.errors||[])};
}
