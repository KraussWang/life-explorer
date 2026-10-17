import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';
import {inClearChannel} from '../src/algae.js';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'review/algae');
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const report={errors,assets:[],views:[],stages:[]};
try{
  for(const name of fs.readdirSync(path.join(root,'public/models/algae')).filter(n=>n.endsWith('.glb'))){
    const bytes=fs.readFileSync(path.join(root,'public/models/algae',name));
    const result=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:30});
    report.assets.push({name,bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings});
    assert.equal(result.issues.numErrors,0,`${name} glTF validation`);
  }
  await page.goto(process.env.ALGAE_URL||'http://127.0.0.1:5173/algae-preview.html');
  await page.waitForFunction(()=>window.__algaeReview,{timeout:120000});
  await page.evaluate(()=>{document.body.classList.add('clean');window.__algaeReview.pause(true);});
  for(const growth of [0,.3,.6,1]){
    await page.evaluate(g=>{window.__algaeReview.setView('Main');window.__algaeReview.settle(g);},growth);
    await page.screenshot({path:path.join(dir,`growth-${growth}.png`)});
    report.stages.push({growth,...await page.evaluate(()=>window.__algaeReview.stats)});
  }
  const views=await page.evaluate(()=>window.__algaeReview.views.map(v=>v.name));
  for(const view of views){
    await page.evaluate(v=>{window.__algaeReview.setView(v);window.__algaeReview.settle(1);},view);
    await page.screenshot({path:path.join(dir,`${view}.png`)});
    report.views.push({view,...await page.evaluate(()=>window.__algaeReview.stats)});
  }
  report.placement=await page.evaluate(()=>{
    const a=window.__algaeReview.world.algae,ps=a.placements;
    let minDistance=Infinity;
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)minDistance=Math.min(minDistance,Math.hypot(ps[i].position[0]-ps[j].position[0],ps[i].position[2]-ps[j].position[2]));
    return {count:ps.length,minDistance,positions:ps.map(p=>p.position),phases:new Set(ps.map(p=>p.phase)).size,first:ps.slice(0,5)};
  });
  report.placement.clearChannel=report.placement.positions.every(p=>!inClearChannel(p[0],p[2]));
  delete report.placement.positions;
  assert(report.placement.count>100);assert(report.placement.clearChannel);assert(report.placement.minDistance>=.579);
  assert.equal(report.stages[0].activeInstances,0);assert.equal(report.stages[0].current,0);
  assert(report.stages[1].activeInstances<report.stages[2].activeInstances);
  assert(report.stages[2].activeInstances<report.stages[3].activeInstances);
  report.transition=await page.evaluate(()=>{
    const a=window.__algaeReview;a.settle(0);a.setGrowth(1);a.world.environment(false,1,.1);
    const intermediate=a.stats.current;a.settle(1);a.setGrowth(0);a.world.environment(false,0,.1);
    return {intermediate,reversing:a.stats.current};
  });
  assert(report.transition.intermediate>0&&report.transition.intermediate<.3);
  assert(report.transition.reversing>0&&report.transition.reversing<1);
  await page.evaluate(()=>{window.__algaeReview.setView('Algae_Close');window.__algaeReview.settle(1);});
  await page.screenshot({path:path.join(dir,'sway-before.png')});
  await page.evaluate(()=>window.__algaeReview.advance(2));
  await page.screenshot({path:path.join(dir,'sway-after.png')});
  await page.evaluate(()=>{document.body.classList.remove('clean');window.__algaeReview.setView('Main');window.__algaeReview.settle(.6);});
  await page.screenshot({path:path.join(dir,'preview-ui.png')});
  for(const high of [false,true]){
    await page.evaluate(h=>{window.__algaeReview.setQuality(h);window.__algaeReview.settle(1);window.__algaeReview.pause(false);},high);
    const samples=await page.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now();function sample(now){times.push(now-last);last=now;if(times.length<80)requestAnimationFrame(sample);else resolve(times.slice(10));}requestAnimationFrame(sample);}));
    report[high?'highPerformance':'lowPerformance']={meanFrameMs:samples.reduce((a,b)=>a+b)/samples.length,...await page.evaluate(()=>window.__algaeReview.stats)};
  }
  await page.reload();await page.waitForFunction(()=>window.__algaeReview,{timeout:120000});
  report.reproducible=await page.evaluate(first=>JSON.stringify(window.__algaeReview.world.algae.placements.slice(0,5))===JSON.stringify(first),report.placement.first);
  assert(report.reproducible,'fixed seed remains reproducible after reload');
  assert.equal(errors.length,0,errors.join('\n'));
}finally{fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
