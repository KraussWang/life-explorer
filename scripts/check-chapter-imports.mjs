import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {freshChapter,CHAPTER_SAVE_KEY} from '../src/chapters/progress.js';
import {byNode} from '../src/chapters/data.js';

const base=process.env.CHAPTER_URL||'http://127.0.0.1:5173/chapters.html';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 for(const id of ['F03','A01','M03']){
  const seed=freshChapter();seed.node=id;seed.unlocked.push(id);
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:CHAPTER_SAVE_KEY,value:seed});
  const page=await context.newPage(),errors=[];let modelLoaded=false;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
   if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);
   if(response.url().endsWith(byNode[id].model)&&response.ok())modelLoaded=true;
  });
  await page.goto(base);
  await page.locator('#chapter-continue').click();
  await page.locator('#chapter-hud').waitFor({state:'visible',timeout:120000});
  await page.waitForTimeout(500);
  assert.equal((await page.evaluate(()=>window.__chapters.snapshot)).node,id);
  assert.equal(await page.locator('#model-disclaimer').isHidden(),true);
  assert.ok(modelLoaded,`${id} model was not loaded`);
  assert.deepEqual(errors,[],`${id} browser errors`);
  await page.screenshot({path:fileURLToPath(new URL(`../review/import-${id}.png`,import.meta.url))});
  console.log(`PASS ${id}: ${byNode[id].sceneId} loaded ${byNode[id].model}`);
  await context.close();
 }
}finally{await browser.close();}
