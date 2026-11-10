// Additional full-motion verification, including skip, center alignment and variant URLs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4173';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:1100},reducedMotion:'no-preference'}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(base+'/zh/templates/gacha/');await p.locator('.cx-reel .cx-card').first().waitFor();
 assert.ok(!(await p.locator('.cx-contents').innerText()).includes('Wooden Sword'));
 await p.locator('[data-i18n="cx.open"]').click();await p.waitForTimeout(500);
 await p.setViewportSize({width:1280,height:1000});
 await p.locator('[data-i18n="cx.skip"]').click();await p.locator('.cx-modal').waitFor();
 async function centered(){return p.evaluate(()=>{const v=document.querySelector('.cx-viewport').getBoundingClientRect(),cards=[...document.querySelectorAll('.cx-reel .cx-card')];const card=cards.reduce((a,b)=>Math.abs(a.getBoundingClientRect().x+72-v.x-v.width/2)<Math.abs(b.getBoundingClientRect().x+72-v.x-v.width/2)?a:b);return {id:card.dataset.item,delta:card.getBoundingClientRect().x+72-v.x-v.width/2};});}
 let result=await centered();assert.ok(Math.abs(result.delta)<2);assert.equal(result.id,await p.locator('.cx-modal .cx-card').getAttribute('data-item'));
 await p.locator('[data-i18n="cx.close"]').click();await p.locator('#cx-quick').check();
 const started=Date.now();await p.locator('[data-i18n="cx.open"]').click();await p.locator('.cx-modal').waitFor();assert.ok(Date.now()-started<2500);
 result=await centered();assert.ok(Math.abs(result.delta)<2);assert.equal(result.id,await p.locator('.cx-modal .cx-card').getAttribute('data-item'));
 await p.locator('[data-i18n="cx.close"]').click();
 await p.locator('#cx-sound').check();await p.locator('[data-i18n="cx.open"]').click();await p.locator('.cx-modal').waitFor();await p.locator('[data-i18n="cx.close"]').click();
 const manifest=JSON.parse(await readFile('public/free-assets/manifest.json','utf8'));
 for(const a of manifest.assets.filter(a=>!a.placeholder)){
  const response=await p.goto(base+'/free-assets/'+a.id+'/');assert.equal(response.status(),200);
  await p.locator('[data-variant=style]').waitFor();
  assert.equal(await p.locator('[data-variant=style]').inputValue(),a.style_tier);
  assert.equal(await p.locator('[data-variant=color]').inputValue(),a.palette);
  assert.equal(await p.locator('[data-variant=state]').inputValue(),a.state);
 }
 await p.goto(base+'/zh/free-assets/?tag=gold');await p.locator('.fa-card').first().waitFor();assert.equal(await p.locator('#fa-grid .fa-card').count(),1);assert.ok((await p.locator('#fa-grid').innerText()).includes('4 种风格 · 4 色'));assert.ok((await p.locator('#fa-grid a').first().getAttribute('href')).includes('gold'));
 for(const lang of ['en','zh','ja','ko','es']){
  await p.goto(base+(lang==='en'?'':'/'+lang)+'/templates/gacha/');await p.locator('.cx-contents .cx-card').first().waitFor();
  const names=await p.locator('.cx-contents .cx-card b').allTextContents();assert.equal(names.length,7);if(lang!=='en')assert.ok(!names.includes('Wooden Sword'));
 }
 assert.deepEqual(errors,[]);console.log('PASS: full motion / quick / skip / sound / resized center alignment / 10 variant URLs / tag grouping / five-language item names.');
}finally{await b.close();}
