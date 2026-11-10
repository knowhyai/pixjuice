// Run after pnpm build and pnpm preview. Install Playwright separately or set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {unzipSync} from 'fflate';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TEST_URL || 'http://127.0.0.1:4173';
const out=process.env.SCREENSHOT_DIR || '/workspace/pixjuice-briefs';
await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',acceptDownloads:true});
const p=await ctx.newPage(), errors=[];
p.setDefaultTimeout(15000);
p.on('pageerror',e=>errors.push(e.message));
const click=key=>p.locator(`button[data-i18n="${key}"]`).click();
const skins=['realistic','stylized','clean-low-poly','pixel-art'];
async function noOverflow(){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),p.url()+' overflows');}
async function downloadCode(slug){
 const pending=p.waitForEvent('download');await click('tpl.download');const dl=await pending;
 const files=unzipSync(new Uint8Array(await readFile(await dl.path())));
 assert.ok(files['styles.css']&&files['README.md']&&files.LICENSE);
 assert.ok(new TextDecoder().decode(files['README.md']).includes(base),'ZIP art links use the active deployment');
 assert.ok(!Object.keys(files).some(n=>/\.(png|glb|fbx|jpg)$/i.test(n)),'no art in code ZIP');
 const root='/tmp/pixjuice-standalone-'+slug;
 for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),bytes);}
 const q=await b.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 q.on('pageerror',e=>errors.push('ZIP: '+e.message));
 await q.goto('file://'+root+'/index.html');
 await q.locator('.tpl-demo').waitFor();
 assert.equal(await q.locator('.gx-skin-btn').count(),4);
 assert.equal(await q.locator('.tpl-demo').evaluate(e=>getComputedStyle(e).display),'grid');
 assert.ok(!(await q.locator('.tpl-demo').innerText()).includes('tabPool'));
 if(slug==='gacha'){await q.locator('[data-i18n="gx.pull10"]').click();assert.equal(await q.locator('.gx-card').count(),10);}
 else {await q.locator('[data-i18n="sv.saveHere"]').first().click();assert.equal(await q.locator('.sv-slot-filled').count(),1);}
 await q.close();
}
try {
 await p.goto(base+'/templates/gacha/');await p.locator('.gx-skin-btn').first().waitFor();
 assert.equal(await p.locator('.codebox').count(),1);
 await click('gx.pull1');assert.equal(await p.locator('.gx-card').count(),1);
 await click('gx.pull10');assert.equal(await p.locator('.gx-card').count(),10);
 assert.ok(await p.locator('.gx-card.r-SR,.gx-card.r-SSR').count()>0);
 assert.equal(await p.locator('.gx-hist li').count(),11);
 assert.ok(!/[{}]/.test(await p.locator('.gx-pitybar').innerText()));
 for(const skin of skins){await p.locator(`[data-skin-id="${skin}"]`).click();await noOverflow();await p.waitForTimeout(250);await p.locator('#app').screenshot({path:join(out,'gacha-'+skin+'.png')});}
 await p.locator('[data-skin-id="stylized"]').click();
 await p.screenshot({path:join(out,'templates-gacha.png'),fullPage:true});
 await click('gx.tabWheel');await click('gx.spin');await p.waitForFunction(()=>document.querySelector('.gx-wheel-out').textContent.length>0);
 assert.ok(!/[{}]/.test(await p.locator('.gx-wheel-out').innerText()));
 await p.locator('#app').screenshot({path:join(out,'templates-wheel.png')});
 await click('gx.tabPool');await downloadCode('gacha');
 await p.reload();assert.equal(await p.locator('.gx-hist li').count(),12);
 await p.clock.install();
 await p.goto(base+'/templates/save-load/');
 await p.locator('.sv-slot').first().waitFor();
 await p.keyboard.press('ArrowRight');
 await p.locator('[data-i18n="sv.saveHere"]').first().click();assert.equal(await p.locator('.sv-slot-filled').count(),1);
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('pix-tpl-save:s1')));
 assert.equal(saved.x,5);assert.ok(saved.thumb.startsWith('data:image/png'));
 await p.locator('.sv-slot-filled [data-i18n="sv.save"]').click();await p.locator('.tpl-modal').waitFor();
 await click('sv.cancel');assert.equal(await p.locator('.tpl-modal').count(),0);
 const dlPromise=p.waitForEvent('download');await p.locator('.sv-slot-filled [data-i18n="sv.export"]').click();const dl=await dlPromise;
 const exportText=await readFile(await dl.path(),'utf8');assert.equal(JSON.parse(exportText).x,5);
 await p.locator('.sv-slot-filled [data-i18n="sv.del"]').click();await click('sv.confirm');assert.equal(await p.locator('.sv-slot-filled').count(),0);
 await p.locator('input[type=file]').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(exportText)});
 await p.locator('.tpl-modal-slots button').first().click();assert.equal(await p.locator('.sv-slot-filled').count(),1);
 // Import into an occupied slot requires explicit confirmation, which can be cancelled.
 await p.locator('input[type=file]').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(exportText)});
 await p.locator('.tpl-modal-slots button').first().click();await p.locator('.tpl-modal').waitFor();await click('sv.cancel');
 await p.keyboard.press('ArrowDown');
 await p.locator('.sv-slot-filled [data-i18n="sv.load"]').click();await click('sv.confirm');
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('pix-tpl-save-game')).y),saved.y);
 await p.reload();await p.locator('.sv-slot-filled').waitFor();
 await p.clock.runFor(31000);
 assert.ok(await p.evaluate(()=>localStorage.getItem('pix-tpl-save:auto')));
 for(const skin of skins){await p.locator(`[data-skin-id="${skin}"]`).click();await noOverflow();await p.waitForTimeout(250);await p.locator('#app').screenshot({path:join(out,'save-'+skin+'.png')});}
 await p.locator('[data-skin-id="stylized"]').click();await p.screenshot({path:join(out,'templates-save.png'),fullPage:true});
 await downloadCode('save-load');await p.clock.resume();
 for(const lang of ['en','zh','ja','ko','es']){
  const prefix=lang==='en'?'':'/'+lang;
  for(const route of ['/templates/','/templates/gacha/','/templates/save-load/','/free-assets/']){
   const res=await p.goto(base+prefix+route);assert.equal(res.status(),200);
   assert.equal(await p.locator('html').getAttribute('lang'),lang);
   assert.equal(await p.locator('link[rel=canonical]').count(),1);
   assert.equal(await p.locator('link[hreflang]').count(),6);
   assert.ok((await p.locator('title').innerText()).length>8);
   assert.ok(await p.locator('.tpl-faq details').count()>0);
   assert.ok(!/\{(n|max|item)\}/.test(await p.locator('body').innerText()));
  }
 }
 await p.goto(base+'/free-assets/');await p.locator('.fa-card').first().waitFor();
 assert.equal(await p.locator('.fa-categories .fa-category').count(),3);
 await p.locator('.fa-category').nth(0).click();assert.ok(await p.locator('.fa-card').count()>=10);
 await p.locator('.fa-category').nth(1).click();assert.equal(await p.locator('.fa-card:not(.fa-soon-card)').count(),10);
 await p.goto(base+'/free-assets/chest-wood-stylized-wood-intact/');await p.locator('.fa-file').first().waitFor();
 assert.ok(await p.locator('.fa-file').count()>=8);
 for(const a of await p.locator('.fa-file').evaluateAll(es=>es.map(e=>e.href))){assert.equal((await ctx.request.get(a)).status(),200);}
 for(const route of ['/templates/','/templates/gacha/','/templates/save-load/','/free-assets/']){
  await p.setViewportSize({width:390,height:844});await p.goto(base+route);await p.waitForTimeout(200);await noOverflow();
  await p.screenshot({path:join(out,'mobile-'+route.split('/').filter(Boolean).join('-')+'.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: gacha, wheel, persistence, save confirmations/import/export/autosave, 8 skin screenshots, 5-language static SEO, asset links, 2 standalone ZIPs, mobile overflow; no page errors.');
} finally {await b.close();}
