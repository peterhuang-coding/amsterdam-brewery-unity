async page=>{
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:18862/renderer-demo.html');await page.waitForFunction(()=>window.__draws.length>10);
 return await page.evaluate(async()=>{const c=document.querySelector('#map');const first={height:c.getBoundingClientRect().height,width:c.getBoundingClientRect().width,backing:[c.width,c.height]};for(let i=0;i<100;i++)await new Promise(requestAnimationFrame);return {first,last:{height:c.getBoundingClientRect().height,width:c.getBoundingClientRect().width,backing:[c.width,c.height]}};});
}
