import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import {fresh,evolve,SAVE_KEY} from '../src/state.js';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const results=[];let page;
async function open(raw,deny=false){
 if(page)await page.close();page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.addInitScript(({raw,deny,key})=>{if(raw!==null)localStorage.setItem(key,raw);if(deny)Storage.prototype.setItem=()=>{throw new Error('Storage unavailable');};},{raw,deny,key:SAVE_KEY});
 await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});
}
function pass(name){results.push({name,pass:true});console.log('PASS '+name);}
const shot=name=>page.screenshot({path:'review/'+name+'.png'});
try{
 for(const [name,raw] of [['broken JSON','{bad'],['unsupported version',JSON.stringify({...fresh(),version:90})],['inconsistent resources',JSON.stringify({...fresh(),collected:['nutrient-0']})]]){
  await open(raw);await expect(page.locator('#save-warning')).toBeVisible();await expect(page.locator('#continue')).toBeHidden();await page.locator('#start').click();await expect(page.locator('#welcome')).toBeHidden();pass(name+' recovers to new game');
 }
 await open(null,true);await page.locator('#start').click();await expect(page.locator('#save-status')).toContainText('存储不可用');await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');pass('denied storage keeps gameplay available');
 let s=fresh();s.counts.nutrient=3;s.collected=['nutrient-0','nutrient-1','nutrient-2'];s=evolve(s,'flagellate');s.counts.nutrient=2;s.collected=['nutrient-0','nutrient-1'];s.cold='active';s.gathered=true;s=evolve(s,'colony');s.counts.food=1;s.counts.specialization=2;s.collected=['food-0','specialization-0','specialization-1'];s=evolve(s,'worm');
 await open(JSON.stringify(s));await page.route('**/models/fish-lod.glb',route=>route.fulfill({status:503,body:'simulated failure'}));await page.locator('#continue').click();await expect(page.locator('#welcome')).toBeHidden();await page.keyboard.press('e');await page.locator('[data-evolve="fish"]').click();await expect(page.locator('[data-evolve="fish"]')).toContainText('重试');
 const failed=await page.evaluate(()=>window.__life.snapshot);expect(failed.state.species).toBe('worm');pass('failed model load retains previous species and enables retry');
 await page.unroute('**/models/fish-lod.glb');await page.locator('[data-evolve="fish"]').click();await expect(page.locator('#transition')).toBeVisible();await expect(page.locator('#transition')).toBeHidden({timeout:30000});await expect(page.locator('#ending')).toBeVisible();pass('failed model request can be retried successfully');
 await page.locator('[data-close="ending"]').click();await page.waitForTimeout(2200);await shot('mvp-fish-swimming');const performance=await page.evaluate(()=>({fps:document.getElementById('fps').textContent,info:window.__life.snapshot}));
 await page.keyboard.press('Tab');await page.locator('[data-index="4"]').click();await expect(page.locator('#preview-loading')).toContainText('尚未发现');pass('locked atlas species cannot preview models');await shot('mvp-atlas-locked');
 fs.writeFileSync('review/fish-performance.json',JSON.stringify(performance,null,2));
}catch(e){results.push({name:e.message,pass:false});console.error(e);await shot('mvp-edgecase-failure');process.exitCode=1;}
finally{fs.writeFileSync('review/edgecase-test-report.json',JSON.stringify(results,null,2));await browser.close();}
