import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {freshChapter,CHAPTER_SAVE_KEY} from '../src/chapters/progress.js';
import {byNode,NODES} from '../src/chapters/data.js';

const base=process.env.CHAPTER_URL||'http://127.0.0.1:5173/chapters.html';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
async function session(seed){
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:CHAPTER_SAVE_KEY,value:seed});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
 await page.goto(base);await page.locator('#chapter-continue').click();await page.locator('#chapter-hud').waitFor({state:'visible',timeout:120000});
 return {context,page,errors,snapshot:()=>page.evaluate(()=>window.__chapters.snapshot)};
}
try{
 const seed=freshChapter();seed.progress.F01=Object.fromEntries(byNode.F01.tasks.map(t=>[t.id,t.target]));
 const a=await session(seed);
 assert.equal((await a.snapshot()).node,'F01');
 await a.page.locator('#next-stage').click();await a.page.locator('[data-node="F02"]').click();
 await a.page.locator('#skip-transition').click();await a.page.locator('#chapter-transition').waitFor({state:'hidden',timeout:120000});
 assert.equal((await a.snapshot()).node,'F02');
 await a.page.reload();await a.page.locator('#chapter-continue').click();await a.page.locator('#chapter-hud').waitFor({state:'visible',timeout:120000});
 assert.equal((await a.snapshot()).node,'F02');
 await a.page.keyboard.down('w');await a.page.waitForTimeout(450);await a.page.keyboard.up('w');
 const forward=await a.snapshot();
 await a.page.keyboard.down('s');await a.page.waitForTimeout(100);
 const turning=await a.snapshot();
 assert.ok(Math.hypot(turning.position[0]-forward.position[0],turning.position[2]-forward.position[2])<.12,'reverse input must wait for the body to turn');
 await a.page.waitForTimeout(900);await a.page.keyboard.up('s');
 const reversed=await a.snapshot(),delta=reversed.position.map((value,i)=>value-forward.position[i]);
 assert.ok(delta[2]>.4,'the creature advances after facing backward');
 assert.ok(reversed.facing[2]>.95,'the creature faces the direction of reverse travel');
 assert.deepEqual(a.errors,[]);await a.context.close();

 const shore=freshChapter();shore.node='T01';shore.unlocked.push('T01');const b=await session(shore);
 const start=await b.snapshot();assert.ok(start.water!==null&&start.ground<start.water,'T01 begins in water');
 await b.page.keyboard.down('d');await b.page.waitForTimeout(5500);await b.page.keyboard.up('d');
 const landed=await b.snapshot();assert.equal(landed.shoreMode,true);assert.equal(landed.progress.T01.shore,1);assert.equal(landed.progress.T01.steps,3);
 assert.ok(landed.ground>landed.water);assert.deepEqual(b.errors,[]);await b.context.close();

 const lung=freshChapter();lung.node='F04';lung.unlocked.push('F04');const c=await session(lung);
 await c.page.keyboard.down('Space');await c.page.waitForTimeout(1400);await c.page.keyboard.up('Space');await c.page.keyboard.press('e');
 assert.equal((await c.snapshot()).progress.F04.breathe,1);assert.deepEqual(c.errors,[]);await c.context.close();

 const prey=freshChapter();prey.progress.F01={explore:1,feed:1};const e=await session(prey);
 await e.page.keyboard.down('w');await e.page.waitForFunction(()=>window.__chapters.snapshot.progress.F01?.evade===1,undefined,{timeout:45000});await e.page.keyboard.up('w');
 assert.equal((await e.snapshot()).progress.F01.evade,1,'a moving fish can survive the pursuit');assert.deepEqual(e.errors,[]);await e.context.close();

 const route=freshChapter();for(const node of NODES)route.progress[node.id]=Object.fromEntries(node.tasks.map(task=>[task.id,task.target]));
 const d=await session(route);
 async function choose(id){await d.page.locator('#next-stage').click();await d.page.locator(`[data-node="${id}"]`).click();await d.page.locator('#skip-transition').click();await d.page.locator('#chapter-transition').waitFor({state:'hidden',timeout:120000});assert.equal((await d.snapshot()).node,id);}
 async function rewind(id){await d.page.locator('#next-stage').click();await d.page.locator('#chapter-return').click();await d.page.locator('#skip-transition').click();await d.page.locator('#chapter-transition').waitFor({state:'hidden',timeout:120000});assert.equal((await d.snapshot()).node,id);}
 await choose('F02');await choose('F03');await rewind('F02');await choose('F04');await choose('T01');await choose('T02');await rewind('T01');await choose('A01');await choose('A03');await choose('A04');await rewind('A01');
 assert.ok((await d.snapshot()).unlocked.includes('F03'));assert.ok((await d.snapshot()).unlocked.includes('A04'));assert.deepEqual(d.errors,[]);await d.context.close();
 console.log('PASS chapter transition, reload, landing, breathing, pursuit and 11 consecutive switches');
}finally{await browser.close();}
