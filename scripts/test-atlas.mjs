import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import {fresh,evolve,requirementsFor,SAVE_KEY} from '../src/state.js';
import {catalog} from '../src/catalog.js';
const checks=[],errors=[];const check=(name,value)=>{checks.push({name,pass:!!value});console.log(value?'PASS':'FAIL',name);if(!value)throw Error(name);};
let seed=fresh();for(const id of ['flagellate','colony','worm','bivalve']){const req=requirementsFor(seed);for(const [k,n] of Object.entries(req)){if(k==='cold')seed.cold='active';else if(k==='gathered')seed.gathered=true;else{seed.counts[k]=n;for(let i=0;i<n;i++)seed.collected.push(`${k}-${i}`);}}seed=evolve(seed,id);}
seed.unlocked=['cell','flagellate','colony','worm','bivalve','slug','fish'];seed.discoveries=['filament','leaf','fanweed','waterweed','algae','starfish'];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1672,height:941}});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url()+' '+r.status());});
try{
 await page.addInitScript(({key,seed})=>{if(!sessionStorage.getItem('atlas-test-seeded')){localStorage.setItem(key,JSON.stringify(seed));sessionStorage.setItem('atlas-test-seeded','1');}},{key:SAVE_KEY,seed});
 await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});await page.locator('#continue').click();await expect(page.locator('#welcome')).not.toBeVisible({timeout:120000});
 await page.locator('#atlas-button').click();await expect(page.locator('#atlas')).toBeVisible();
 await page.waitForFunction(()=>[...document.querySelectorAll('#atlas img')].every(i=>i.complete));
 await page.screenshot({path:'review/atlas-1672.png'});
 check('25 actual catalog entries',await page.locator('.codex-card').count()===25);
 check('detail has only the model action',await page.locator('#atlas-detail button').count()===1);
 check('four cropped scallop views',await page.locator('#atlas-detail .specimen-board img').count()===4);
 const before=await page.evaluate(()=>window.__life.snapshot.position);await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');check('atlas freezes gameplay',JSON.stringify(before)===JSON.stringify(await page.evaluate(()=>window.__life.snapshot.position)));
 await page.locator('#atlas-view-model').click();await page.waitForFunction(()=>document.getElementById('atlas-model').dataset.loaded==='bivalve',{},{timeout:60000});await page.waitForTimeout(200);await page.screenshot({path:'review/atlas-model.png'});
 const box=await page.locator('#preview').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2+40,{steps:10});await page.mouse.up();await page.mouse.wheel(0,-200);
 await page.locator('#model-variant').selectOption('/atlas/models/bivalve-rig.glb');await page.waitForFunction(()=>document.getElementById('atlas-model').dataset.loaded==='bivalve',{},{timeout:60000});check('rigged scallop loaded',await page.locator('#preview-loading').isHidden());
 await page.keyboard.press('Escape');check('Escape closes viewer and keeps atlas',!await page.locator('#atlas-model').isVisible()&&await page.locator('#atlas').isVisible());
 for(const id of ['cell','flagellate','colony','worm','slug','fish']){
  await page.locator(`[data-species="${id}"]`).click();await page.locator('#atlas-view-model').click();await page.waitForFunction(id=>document.getElementById('atlas-model').dataset.loaded===id,id,{timeout:60000});
  check('reopen real model '+id,await page.locator('#preview-loading').isHidden());await page.locator('[data-close="atlas-model"]').click();
 }
 await page.locator('#atlas-sidebar [data-category="plant"]').click();check('plant filter',await page.locator('.codex-card').count()===8);
 await page.locator('[data-status="locked"]').click();check('locked plant filter',await page.locator('.codex-card').count()===3);
 await page.locator('.codex-card').first().click();check('locked model blocked',await page.locator('#atlas-view-model').isDisabled());await page.screenshot({path:'review/atlas-locked.png'});
 await page.locator('#atlas-sidebar [data-category="stats"]').click();check('statistics present',await page.locator('#atlas-statistics article').count()===3);
 await page.locator('#atlas-tabs [data-category="all"]').click();await page.locator('[data-status="all"]').click();await page.locator('[data-species="bivalve"]').click();
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'review/atlas-1280.png'});check('desktop no outer horizontal overflow',await page.evaluate(()=>document.getElementById('atlas').scrollWidth<=innerWidth));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'review/atlas-mobile.png'});check('mobile no horizontal overflow',await page.evaluate(()=>document.getElementById('atlas').scrollWidth<=innerWidth));
 await page.setViewportSize({width:1672,height:941});await page.locator('[data-close="atlas"]').click();await page.waitForTimeout(150);await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');check('controls resume after atlas',JSON.stringify(before)!==JSON.stringify(await page.evaluate(()=>window.__life.snapshot.position)));
 await page.reload();await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});await page.locator('#continue').click();await expect(page.locator('#welcome')).not.toBeVisible({timeout:120000});check('discoveries survive reload',(await page.evaluate(()=>window.__life.snapshot.state.discoveries)).length===6);
 // Remove only the test fixture's observation records, then let the actual
 // player/scene proximity loop discover the fanweed next to the entry point.
 await page.evaluate(key=>{const save=JSON.parse(localStorage.getItem(key));save.discoveries=[];save.position=[0,2,5];localStorage.setItem(key,JSON.stringify(save));},SAVE_KEY);
 await page.reload();await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});await page.locator('#continue').click();await expect(page.locator('#welcome')).not.toBeVisible({timeout:120000});
 await page.waitForFunction(()=>window.__life.snapshot.state.discoveries.includes('fanweed'),{},{timeout:10000});
 check('actual habitat contact unlocks and immediately saves fanweed',await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).discoveries.includes('fanweed'),SAVE_KEY));
 check('no runtime errors',errors.length===0);
}catch(e){errors.push(e.message);console.error(e);await page.screenshot({path:'review/atlas-test-failure.png'});process.exitCode=1;}
finally{fs.writeFileSync('review/atlas-test-report.json',JSON.stringify({checks,errors},null,2));await browser.close();}
