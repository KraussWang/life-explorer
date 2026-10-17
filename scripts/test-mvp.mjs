import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const snapshot=()=>page.evaluate(()=>window.__life.snapshot);
const check=(name,value)=>{checks.push({name,pass:!!value});console.log((value?'PASS ':'FAIL ')+name);if(!value)throw new Error(name);};
const shot=name=>page.screenshot({path:'review/'+name+'.png'});
async function load(){await page.goto(process.env.MVP_URL||'http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});}
async function resume(){await page.locator('#continue').click();await expect(page.locator('#welcome')).not.toBeVisible();}
async function travelUntil(predicate,limit=160){
 for(let i=0;i<limit;i++){
  const s=await snapshot();if(predicate(s))return s;if(!s.target)throw new Error('Missing target');
  await page.keyboard.press('r');const dy=s.target.position[1]-s.position[1];
  await page.keyboard.down('w');if(Math.abs(dy)>.8)await page.keyboard.down(dy>0?'Space':'q');
  await page.waitForTimeout(220);await page.keyboard.up('w');await page.keyboard.up('Space');await page.keyboard.up('q');
 }
 throw new Error('Travel timed out: '+JSON.stringify(await snapshot()));
}
async function evolve(id){
 await page.keyboard.press('e');await expect(page.locator('#choice')).toBeVisible();check('CHOOSING '+id,(await snapshot()).phase==='CHOOSING');
 await page.locator(`[data-evolve="${id}"]`).click();await expect(page.locator('#transition')).toBeVisible({timeout:60000});
 const before=(await snapshot()).position;await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');
 check('input locked during '+id,JSON.stringify((await snapshot()).position)===JSON.stringify(before));
 await expect(page.locator('#transition')).not.toBeVisible({timeout:30000});
 const s=await snapshot();check('evolved '+id,s.state.species===id&&s.model===id);return s;
}
try{
 await load();await shot('mvp-welcome');await page.locator('#start').click();await expect(page.locator('#welcome')).not.toBeVisible();
 check('starts at cell',(await snapshot()).state.species==='cell');await page.keyboard.press('e');check('locked evolution cannot open',!await page.locator('#choice').isVisible());
 const before=(await snapshot()).position;await page.keyboard.down('d');await page.waitForTimeout(450);await page.keyboard.up('d');check('WASD moves player',(await snapshot()).position[0]>before[0]+.5);
 await page.keyboard.press('Escape');const paused=(await snapshot()).position;await page.keyboard.down('w');await page.waitForTimeout(350);await page.keyboard.up('w');check('pause freezes movement',JSON.stringify(paused)===JSON.stringify((await snapshot()).position));await page.locator('#resume').click();
 await travelUntil(s=>s.state.counts.nutrient===3);check('three nutrients unlock only an opportunity',(await snapshot()).phase==='OPPORTUNITY_AVAILABLE');await shot('mvp-m1-ready');
 await evolve('flagellate');check('cold is not automatically triggered',(await snapshot()).state.cold==='dormant');await shot('mvp-flagellate');
 await travelUntil(s=>s.state.cold==='active');check('cold starts on region contact',await page.locator('#event-banner').isVisible());await shot('mvp-cold');
 const coldSave=(await snapshot()).state;await load();await resume();check('reload restores cold event',(await snapshot()).state.cold==='active'&&(await snapshot()).state.counts.nutrient===coldSave.counts.nutrient);
 await travelUntil(s=>s.phase==='OPPORTUNITY_AVAILABLE');check('cold plus peers and resources required',(await snapshot()).state.gathered&&(await snapshot()).state.counts.nutrient===2);
 await evolve('colony');check('cold ends and S02 starts',(await snapshot()).state.cold==='resolved'&&await page.locator('#biome').textContent()==='早期生命海洋');await shot('mvp-colony');
 await travelUntil(s=>s.phase==='OPPORTUNITY_AVAILABLE');check('stage-specific food collected',(await snapshot()).state.counts.food===1&&(await snapshot()).state.counts.specialization===2);
 await evolve('worm');check('worm checkpoint created',(await snapshot()).state.checkpoint?.species==='worm');await shot('mvp-worm');
 await page.keyboard.press('e');check('three branch cards',await page.locator('[data-evolve]').count()===3);await shot('mvp-branches');await page.locator('[data-close="choice"]').click();
 for(const id of ['bivalve','slug','fish']){
  await evolve(id);await expect(page.locator('#ending')).toBeVisible();check('ending unlocked '+id,(await snapshot()).state.unlocked.includes(id));await shot('mvp-ending-'+id);
  await page.locator('#ending-atlas').click();await expect(page.locator('#preview-loading')).not.toBeVisible({timeout:60000});await page.waitForTimeout(700);await shot('mvp-atlas-'+id);
  const preview=page.locator('#preview'),box=await preview.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+30,{steps:8});await page.mouse.up();await page.mouse.wheel(0,-100);
  await page.locator('#atlas-prev').click();await page.locator('#atlas-next').click();await expect(page.locator('#preview-loading')).not.toBeVisible({timeout:60000});
  await page.locator('[data-close="atlas"]').click();await page.keyboard.press('Escape');await page.locator('#branch-pause').click();await expect(page.locator('#pause')).not.toBeVisible();check('return to worm keeps '+id,(await snapshot()).state.species==='worm'&&(await snapshot()).state.unlocked.includes(id));
 }
 check('all seven species discovered',(await snapshot()).state.unlocked.length===7);
 await load();await resume();check('checkpoint and atlas persist after reload',(await snapshot()).state.species==='worm'&&(await snapshot()).state.unlocked.length===7);
 await page.keyboard.press('Escape');await page.locator('#quality').click();check('high quality enabled',(await snapshot()).quality.shadows);await page.locator('#quality').click();check('low quality uses reduced resolution and no shadows',(await snapshot()).quality.pixelRatio<=.8&&!(await snapshot()).quality.shadows);await page.locator('#resume').click();
 await page.keyboard.down('q');await page.waitForTimeout(1500);await page.keyboard.up('q');const floor=await snapshot();check('body stays above seafloor',floor.position[1]>=floor.ground+1.49);
 await page.keyboard.press('Escape');await page.locator('#restart').click();await page.locator('#cancel-restart').click();check('restart can be cancelled',(await snapshot()).state.species==='worm');await page.locator('#restart').click();await page.locator('#confirm-restart').click();await expect(page.locator('#pause')).not.toBeVisible();check('restart preserves discovered atlas',(await snapshot()).state.species==='cell'&&(await snapshot()).state.unlocked.length===7);
 await page.setViewportSize({width:1280,height:720});await shot('mvp-1280');await page.locator('#atlas-button').click();await expect(page.locator('#preview-loading')).not.toBeVisible();await shot('mvp-atlas-1280');await page.locator('[data-close="atlas"]').click();
 check('no uncaught errors',errors.length===0);
}catch(e){console.error(e);await shot('mvp-test-failure');errors.push(e.message);process.exitCode=1;}
finally{fs.writeFileSync('review/mvp-test-report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,snapshot:await snapshot().catch(()=>null)},null,2));await browser.close();}
