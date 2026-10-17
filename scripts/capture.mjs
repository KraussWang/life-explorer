import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
await page.goto('http://127.0.0.1:5173/?review=1',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__ocean?.ready,{timeout:120000});
await page.waitForTimeout(3500);
const report={errors,views:[]};
for(const name of ['Main','Oblique','Side','Wide','Ground','Vent_Detail']){
  await page.evaluate(n=>{window.__ocean.setView(n);window.__ocean.setTime(12);},name);
  await page.waitForTimeout(1200);
  await page.screenshot({path:path.join(root,'review',name+'.png')});
  report.views.push({name,...await page.evaluate(()=>({position:window.__ocean.camera.position.toArray(),stats:window.__ocean.stats}))});
}
await page.evaluate(()=>{window.__ocean.setView(0);document.body.classList.remove('clean');});
await page.waitForTimeout(300);await page.screenshot({path:path.join(root,'review','preview-ui.png')});
report.collision=await page.evaluate(()=>{
 const app=window.__ocean,p=app.camera.position.clone();p.set(0,-30,0);app.constrain(p);
 const groundPass=p.y>=app.groundHeight(p.x,p.z)+1.24;
 p.set(400,100,-400);app.constrain(p);const boundsPass=Math.abs(p.x)<=112&&Math.abs(p.z)<=112&&p.y<=app.manifest.waterLevel-1.7+.001;
 const c=app.manifest.colliders.find(c=>c.name==='Vent_Hero_Right');p.fromArray(c.center);app.constrain(p);const r=Math.hypot((p.x-c.center[0])/(c.radius[0]+.45),(p.z-c.center[2])/(c.radius[2]+.45));
 return {groundPass,boundsPass,ventCollisionPass:r>=.999};
});
await page.locator('#ocean').click({position:{x:800,y:500}});
const before=await page.evaluate(()=>window.__ocean.camera.position.toArray());
await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
const after=await page.evaluate(()=>window.__ocean.camera.position.toArray());report.navigation={before,after,moved:Math.hypot(...after.map((v,i)=>v-before[i]))>.1};
await page.locator('#plumes').click();report.plumeToggle=await page.evaluate(()=>!window.__ocean.scene.getObjectByName('Runtime_Hydrothermal_Plumes').visible);
await page.locator('#quality').click();await page.waitForTimeout(600);report.lowQuality=await page.locator('#quality').textContent();
fs.writeFileSync(path.join(root,'review','runtime-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));await browser.close();
