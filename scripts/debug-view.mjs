import {chromium} from '@playwright/test';
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage({viewport:{width:1600,height:1000}});
await p.goto('http://127.0.0.1:5173/?review=1&view=Wide');await p.waitForFunction(()=>window.__ocean?.ready);await p.waitForTimeout(1200);
console.log(await p.evaluate(()=>window.__ocean.scene.children.map(o=>({name:o.name,type:o.type}))));
await p.evaluate(()=>window.__ocean.scene.getObjectByName('Runtime_Sun_Shafts').visible=false);await p.waitForTimeout(200);await p.screenshot({path:'review/debug-no-rays.png'});
await p.evaluate(()=>window.__ocean.scene.children.forEach(o=>{if(o.name.includes('Vent_'))o.visible=false;}));await p.waitForTimeout(200);await p.screenshot({path:'review/debug-no-vents.png'});
await b.close();
