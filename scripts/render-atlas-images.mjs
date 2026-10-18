import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage();page.on('pageerror',e=>console.error(e));page.on('requestfailed',r=>console.error('REQUEST',r.url(),r.failure()));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.goto('http://127.0.0.1:4173/review/atlas-render.html');await page.waitForFunction(()=>window.ready);
 const entries=await page.evaluate(()=>window.catalog.filter(e=>e.image.kind==='model-render').map(e=>({id:e.id,model:e.model})));
 for(const {id,model} of entries){console.log('RENDERING',id,model);const images=await page.evaluate(id=>window.renderEntry(id),id);for(let i=0;i<images.length;i++)fs.writeFileSync(`public/atlas/${id}-${i}.webp`,Buffer.from(images[i].split(',')[1],'base64'));console.log('RENDERED',id,model);}
}finally{await browser.close();}
