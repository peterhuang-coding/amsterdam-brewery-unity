async page => {
 await page.reload();
 await page.waitForFunction(()=>window.__draws.length>10);
 const first=await page.evaluate(()=>({rect:document.querySelector('#map').getBoundingClientRect().toJSON(),backing:[document.querySelector('#map').width,document.querySelector('#map').height]}));
 await page.screenshot({path:'/tmp/amsterdam-d26-render-r2-parent-20261017/demo-390-before.png',fullPage:true});
 await page.evaluate(async()=>{for(let i=0;i<100;i++)await new Promise(requestAnimationFrame)});
 const last=await page.evaluate(()=>({rect:document.querySelector('#map').getBoundingClientRect().toJSON(),backing:[document.querySelector('#map').width,document.querySelector('#map').height],text:window.__draws.slice(-40)}));
 await page.screenshot({path:'/tmp/amsterdam-d26-render-r2-parent-20261017/demo-390-after.png',fullPage:true});
 return {first,last};
}
