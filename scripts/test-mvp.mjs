import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],checks=[];
let expectingHabitatFailure=false;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(expectingHabitatFailure&&m.text().includes('net::ERR_FAILED')))errors.push(m.text());});
const snapshot=()=>page.evaluate(()=>window.__life.snapshot);
const check=(name,value)=>{checks.push({name,pass:!!value});console.log((value?'PASS ':'FAIL ')+name);if(!value)throw new Error(name);};
const onSand=s=>s.modelBottom!==null&&Math.abs(s.modelBottom-s.ground-.02)<.05;
const capture=process.env.MVP_CAPTURE!=='0';
const shot=name=>capture?page.screenshot({path:'review/'+name+'.png'}):Promise.resolve();
async function load(){await page.goto(process.env.MVP_URL||'http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});}
async function resume(){await page.locator('#continue').click();await expect(page.locator('#welcome')).not.toBeVisible({timeout:60000});}
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
 expectingHabitatFailure=true;
 await page.route('**/habitats/scallop/assets/scene.json',route=>route.abort());
 await page.keyboard.press('e');await page.locator('[data-evolve="bivalve"]').click();
 await expect(page.locator('[data-evolve="bivalve"]')).toBeEnabled({timeout:60000});
 check('failed habitat load keeps worm state',(await snapshot()).state.species==='worm'&&(await snapshot()).environment==='primordial'&&await page.locator('#choice').isVisible());
 await page.unroute('**/habitats/scallop/assets/scene.json');expectingHabitatFailure=false;await page.locator('[data-close="choice"]').click();
 for(const id of ['bivalve','slug','fish']){
  await evolve(id);check('ending unlocked '+id,(await snapshot()).state.unlocked.includes(id));
  if(id==='bivalve'){
   check('scallop habitat is active',(await snapshot()).environment==='scallop'&&(await page.locator('#biome').textContent())==='史前浅海扇贝栖息地');
   check('scallop scene is unobscured',!await page.locator('#ending').isVisible());
   check('scallop spawns on sand',onSand(await snapshot()));
   check('scallop controls describe sand movement',await page.locator('#movement-control').textContent()==='W A S D 沿沙地移动'&&await page.locator('#vertical-control').isHidden());
   await shot('mvp-ending-'+id);
   const start=await snapshot();await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');
   const moved=await snapshot();check('scallop walks along sloped sand',moved.position[2]<start.position[2]&&Math.abs(moved.ground-start.ground)>.01&&onSand(moved));
   check('scallop camera remains above sand',moved.cameraY>=moved.cameraGround+1.24);
   await page.keyboard.down('Space');await page.waitForTimeout(350);await page.keyboard.up('Space');
   await page.keyboard.down('q');await page.waitForTimeout(350);await page.keyboard.up('q');
   const vertical=await snapshot();check('scallop cannot rise or dive',onSand(vertical)&&Math.abs(vertical.position[0]-moved.position[0])<.01&&Math.abs(vertical.position[2]-moved.position[2])<.01);
   await page.keyboard.press('Escape');await page.locator('#quality').click();check('scallop high quality',(await snapshot()).quality.shadows);await page.locator('#quality').click();check('scallop low quality',!(await snapshot()).quality.shadows);await page.locator('#resume').click();
   await page.setViewportSize({width:1280,height:720});await shot('mvp-scallop-1280');await page.setViewportSize({width:1440,height:900});
   const savedPosition=(await snapshot()).position;
   await page.evaluate(()=>{const key='life-explorer.p0.v1',save=JSON.parse(localStorage.getItem(key));save.position[1]+=3;localStorage.setItem(key,JSON.stringify(save));});
   await load();await resume();const restored=await snapshot();
   check('elevated scallop save reloads on sand',restored.environment==='scallop'&&Math.abs(restored.position[0]-savedPosition[0])<.1&&Math.abs(restored.position[2]-savedPosition[2])<.1&&onSand(restored));
   await page.locator('#atlas-button').click();
  }else{await expect(page.locator('#ending')).toBeVisible();await shot('mvp-ending-'+id);await page.locator('#ending-atlas').click();}
  await page.waitForTimeout(700);await shot('mvp-atlas-'+id);await page.locator('#atlas-view-model').click();await expect(page.locator('#preview-loading')).not.toBeVisible({timeout:60000});
  const preview=page.locator('#preview'),box=await preview.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+30,{steps:8});await page.mouse.up();await page.mouse.wheel(0,-100);
  await page.locator('[data-close="atlas-model"]').click();
  await page.locator('[data-close="atlas"]').click();await page.keyboard.press('Escape');await page.locator('#branch-pause').click();await expect(page.locator('#pause')).not.toBeVisible({timeout:60000});check('return to worm keeps '+id,(await snapshot()).state.species==='worm'&&(await snapshot()).state.unlocked.includes(id)&&(await snapshot()).environment==='primordial');
 }
 check('all seven species discovered',(await snapshot()).state.unlocked.length===7);
 await load();await resume();check('checkpoint and atlas persist after reload',(await snapshot()).state.species==='worm'&&(await snapshot()).state.unlocked.length===7);
 await page.keyboard.press('Escape');await page.locator('#quality').click();check('high quality enabled',(await snapshot()).quality.shadows);await page.locator('#quality').click();check('low quality uses reduced resolution and no shadows',(await snapshot()).quality.pixelRatio<=.8&&!(await snapshot()).quality.shadows);await page.locator('#resume').click();
 await page.keyboard.down('q');await page.waitForTimeout(1500);await page.keyboard.up('q');const floor=await snapshot();check('body stays above seafloor',floor.position[1]>=floor.ground+1.49);
 await page.keyboard.press('Escape');await page.locator('#restart').click();await page.locator('#cancel-restart').click();check('restart can be cancelled',(await snapshot()).state.species==='worm');await page.locator('#restart').click();await page.locator('#confirm-restart').click();await expect(page.locator('#pause')).not.toBeVisible();check('restart preserves discovered atlas',(await snapshot()).state.species==='cell'&&(await snapshot()).state.unlocked.length===7);
 await page.setViewportSize({width:1280,height:720});await shot('mvp-1280');await page.locator('#atlas-button').click();await expect(page.locator('#preview-loading')).not.toBeVisible();await shot('mvp-atlas-1280');await page.locator('[data-close="atlas"]').click();
 if(errors.length)console.error(errors);
 check('no uncaught errors',errors.length===0);
}catch(e){console.error(e);await shot('mvp-test-failure');errors.push(e.message);process.exitCode=1;}
finally{if(capture)fs.writeFileSync('review/mvp-test-report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,snapshot:await snapshot().catch(()=>null)},null,2));await browser.close();}
