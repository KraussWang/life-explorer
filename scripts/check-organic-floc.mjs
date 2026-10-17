import {chromium,expect} from '@playwright/test';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const snapshot=()=>page.evaluate(()=>window.__life.snapshot);
async function reachNext(expected){
 for(let i=0;i<180;i++){
  const s=await snapshot();if(s.state.counts.nutrient===expected)return;
  if(!s.target||s.target.type!=='nutrient')throw new Error('No nutrient target before reaching '+expected);
  await page.keyboard.press('r');
  const dy=s.target.position[1]-s.position[1];
  await page.keyboard.down('w');if(Math.abs(dy)>.8)await page.keyboard.down(dy>0?'Space':'q');
  await page.waitForTimeout(180);
  await page.keyboard.up('w');await page.keyboard.up('Space');await page.keyboard.up('q');
 }
 throw new Error('Nutrient '+expected+' was unreachable');
}
try{
 await page.goto(process.env.MVP_URL||'http://127.0.0.1:4173/');
 await page.waitForFunction(()=>window.__life?.ready);
 await page.locator('#start').click();
 await expect(page.locator('#requirements')).toContainText('营养吸收');
 await expect(page.locator('#requirements')).toContainText('0 / 3');
 await page.screenshot({path:'review/organic-floc-start.png'});
 for(let count=1;count<=3;count++){
  await reachNext(count);
  await expect(page.locator('#requirements')).toContainText(`${count} / 3`);
  await page.waitForTimeout(1300);
  if((await snapshot()).state.counts.nutrient!==count)throw new Error('Repeated absorption at '+count);
 }
 const s=await snapshot();
 if(s.phase!=='OPPORTUNITY_AVAILABLE'||s.target)throw new Error('Evolution should be available with other flocs remaining');
 await expect(page.locator('#evolve-button')).toBeEnabled();
 await page.keyboard.press('e');await expect(page.locator('#choice')).toBeVisible();
 await expect(page.locator('[data-evolve="flagellate"]')).toHaveCount(1);
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS 0/3 → 1/3 → 2/3 → 3/3, one count per contact, remaining flocs ignored, flagellate choice, no browser errors');
}finally{await browser.close();}
