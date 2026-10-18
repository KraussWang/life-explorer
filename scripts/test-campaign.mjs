import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {fresh} from '../src/state.js';
import {freshChapter} from '../src/chapters/progress.js';

const base=process.env.CAMPAIGN_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const ocean=fresh();ocean.species='fish';ocean.unlocked.push('fish');
 const chapter=freshChapter();chapter.node='F02';chapter.unlocked.push('F02');chapter.completed.push('F01');
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({ocean,chapter})=>{
  localStorage.setItem('life-explorer.p0.v1',JSON.stringify(ocean));
  localStorage.setItem('life-explorer.fish-chapters.v1',JSON.stringify(chapter));
 },{ocean,chapter});
 await page.goto(base);
 await page.locator('#continue').click();
 await page.locator('#ending').waitFor({state:'visible',timeout:120000});
 await page.locator('#fish-chapter-entry').click();
 const frame=page.frameLocator('#chapter-frame');
 await frame.locator('#chapter-hud').waitFor({state:'visible',timeout:120000});
 assert.equal(await frame.locator('#stage-label').textContent().then(s=>s.includes('F02')),true);
 assert.equal(await page.locator('#chapter-frame').isVisible(),true);
 await frame.locator('#chapter-ocean-button').click();
 await page.locator('#chapter-frame').waitFor({state:'hidden',timeout:10000});
 assert.equal(await page.locator('#hud').evaluate(element=>element.hidden),false);
 await page.locator('#atlas-button').click();
 assert.equal(await page.locator('[data-species="F02"]').getAttribute('aria-label').then(s=>s.includes('已解锁')),true);
 assert.deepEqual(errors,[]);
 await page.close();
 const onlyChapter=await browser.newContext({viewport:{width:1280,height:800}});
 await onlyChapter.addInitScript(chapter=>localStorage.setItem('life-explorer.fish-chapters.v1',JSON.stringify(chapter)),chapter);
 const resumePage=await onlyChapter.newPage();
 await resumePage.goto(base);
 await resumePage.locator('#chapter-resume-link').click();
 const resumedFrame=resumePage.frameLocator('#chapter-frame');
 await resumedFrame.locator('#chapter-hud').waitFor({state:'visible',timeout:120000});
 assert.equal(await resumedFrame.locator('#stage-label').textContent().then(s=>s.includes('F02')),true);
 await resumedFrame.locator('#chapter-ocean-button').click();
 await resumePage.locator('#welcome').waitFor({state:'visible'});
 await onlyChapter.close();

 const noChapter=await browser.newContext({viewport:{width:1280,height:800}});
 await noChapter.addInitScript(ocean=>localStorage.setItem('life-explorer.p0.v1',JSON.stringify(ocean)),ocean);
 const freshPage=await noChapter.newPage();
 await freshPage.goto(base);
 await freshPage.locator('#chapter-resume-link').click();
 const freshFrame=freshPage.frameLocator('#chapter-frame');
 await freshFrame.locator('#chapter-hud').waitFor({state:'visible',timeout:120000});
 assert.equal(await freshFrame.locator('#stage-label').textContent().then(s=>s.includes('F01')),true);
 await noChapter.close();
 console.log('PASS continuous entry, fresh start, resume, return and shared atlas');
}finally{await browser.close();}
