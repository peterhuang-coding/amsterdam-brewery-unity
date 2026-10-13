async(page)=>{
 await page.keyboard.press("Escape");const served=[];
 try {for(let n=0;n<2;n++){
  const card=page.locator("[data-action=select]").first();await card.waitFor({state:"visible",timeout:29000});
  const name=await card.getAttribute("aria-label");await card.click();
  await page.locator("[data-action=beer][data-beer="+(name.includes("黑啤")?"stout":"blond")+"]").click();
  await page.keyboard.press("e");
  await page.waitForFunction(()=>{const e=document.querySelector("#service-pour .needle");return e&&parseFloat(e.style.left)>=66&&parseFloat(e.style.left)<=77},null,{timeout:6000});
  await page.keyboard.press("Space");served.push(name);
 }}finally{if(!await page.locator("#overlay").isVisible())await page.keyboard.press("p")}
 return {served,saved:await page.evaluate(()=>JSON.parse(localStorage.getItem("ab_reopening_v1")))};
}