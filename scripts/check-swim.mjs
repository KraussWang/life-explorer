import {chromium} from '@playwright/test';
import fs from 'node:fs';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const snapshot=()=>page.evaluate(()=>window.__life.snapshot);
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const horizontal=v=>[v[0],0,v[2]];
const length=v=>Math.hypot(...v);
const normalized=v=>v.map(value=>value/length(v));
const checks=[];
function check(name,pass,detail){checks.push({name,pass,detail});if(!pass)throw Error(`${name}: ${JSON.stringify(detail)}`);}
async function swim(name,key,expected){
 const before=await snapshot();
 await page.keyboard.down(key);
 await page.waitForTimeout(950);
 await page.keyboard.up(key);
 const after=await snapshot();
 const delta=horizontal(after.position.map((value,i)=>value-before.position[i]));
 const direction=normalized(delta);
 check(`${name} moves`,length(delta)>1,{delta});
 check(`${name} follows screen direction`,dot(direction,expected)>.9,{direction,expected});
 check(`${name} body faces travel`,dot(direction,normalized(horizontal(after.facing)))>.9,{direction,facing:after.facing});
 check(`${name} model axis faces travel`,dot(direction,normalized(horizontal(after.cellAxis)))>.9,{direction,cellAxis:after.cellAxis});
 await page.screenshot({path:`review/swim-${name}.png`});
}
try{
 await page.goto(process.env.MVP_URL||'http://127.0.0.1:4174/');
 await page.waitForFunction(()=>window.__life?.ready,{timeout:120000});
 await page.locator('#start').click();
 await page.locator('#welcome').waitFor({state:'hidden'});
 await page.screenshot({path:'review/swim-start.png'});
 await swim('forward','w',[0,0,-1]);
 await swim('right','d',[1,0,0]);
 await swim('backward','s',[0,0,1]);
 await swim('left','a',[-1,0,0]);
 const box=await page.locator('#ocean').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+200,box.y+box.height/2,{steps:8});
 await page.mouse.up();
 const yaw=(await snapshot()).yaw;
 await swim('camera-turned-forward','w',[-Math.sin(yaw),0,-Math.cos(yaw)]);
 check('no browser errors',errors.length===0,{errors});
}catch(error){errors.push(error.message);process.exitCode=1;}
finally{
 fs.writeFileSync('review/swim-check.json',JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
 await browser.close();
}
