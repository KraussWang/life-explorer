import {chromium} from '@playwright/test';
import fs from 'node:fs';
import {fresh,SAVE_KEY} from '../src/state.js';
import {catalog} from '../src/catalog.js';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const seed=fresh();seed.unlocked=['cell','flagellate','colony','worm','bivalve','slug','fish'];seed.discoveries=['filament','leaf','fanweed','waterweed','algae','starfish'];
const report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
function check(name,pass,data){report.checks.push({name,pass,...data});if(!pass)throw Error(name)}
try{
await page.addInitScript(({seed,key})=>localStorage.setItem(key,JSON.stringify(seed)),{seed,key:SAVE_KEY});
await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});await page.locator('#continue').click();await page.locator('#atlas-button').click();
check('all 25 cards',await page.locator('.codex-card').count()===25);
await page.locator('#atlas-view-model').scrollIntoViewIfNeeded();const b=await page.locator('#atlas-view-model').boundingBox();check('mobile detail action reachable',b.y>=0&&b.y+b.height<=844,{box:b});
await page.locator('#atlas-view-model').click();await page.waitForFunction(()=>document.querySelector('#atlas-model').dataset.loaded==='cell',null,{timeout:60000});check('mobile true model loads',await page.locator('#preview-loading').isHidden());await page.keyboard.press('Escape');
await page.setViewportSize({width:1672,height:941});
for(const e of catalog.filter(e=>e.unlock.type==='archive')){await page.locator(`[data-species="${e.id}"]`).click();check('future chapter hint '+e.id,(await page.locator('#atlas-description').textContent()).includes('后续生态章节开放后')&&await page.locator('#atlas-view-model').isDisabled());}
await page.locator('#atlas-sidebar [data-category="marine"]').click();check('marine category filter',await page.locator('.codex-card').count()===6);
await page.locator('[data-status="unlocked"]').click();check('combined marine/unlocked filter',await page.locator('.codex-card').count()===3);
check('no runtime errors',report.errors.length===0);
} catch(e){report.errors.push(e.message);process.exitCode=1} finally{fs.writeFileSync('review/atlas-independent-checks.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
