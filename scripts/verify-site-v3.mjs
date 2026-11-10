const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:1100}}),base=process.env.TEST_URL||'http://localhost:4174',out='/workspace/pixjuice-briefs/';
const errors=[];p.on('pageerror',e=>errors.push(e.message));
for(const [name,url] of [['home','/zh/'],['templates','/zh/templates/'],['assets','/zh/free-assets/'],['normal','/zh/normal-map/'],['credits','/zh/credits/'],['case','/zh/templates/gacha/']]){
 await p.goto(base+url);await p.locator('.theme-toggle').waitFor();await p.evaluate(()=>document.fonts.ready);
 assert.equal(await p.locator('.head .sub').innerText(),'免费游戏素材');
 assert.equal(await p.locator('.head .nav > a').count(),4);
 const current=await p.locator('.head .nav > a.cur, .head .nav > a[aria-current], .head summary.cur').allTextContents();
 if(name==='home') assert.deepEqual(current,[]);
 if(name==='templates'||name==='case') assert.ok(current.some(t=>/游戏模板/.test(t)));
 if(name==='assets') assert.ok(current.some(t=>/免费素材/.test(t)));
 if(name==='credits') assert.ok(current.some(t=>/致谢/.test(t)));
 if(name==='normal') assert.ok(await p.locator('.head summary.cur').count());
 await p.locator('.head').screenshot({path:out+'site-v3-nav-'+name+'.png'});
 if(name==='assets') {await p.locator('#fa-empty').waitFor();assert.equal(await p.locator('#fa-grid .fa-card').count(),0);assert.ok((await p.locator('#fa-empty').innerText()).includes('第一批半写实素材制作中'));assert.ok(!(await p.locator('#fa-empty').evaluate(e=>e.querySelector('img'))));await p.screenshot({path:out+'site-v3-assets-empty.png',fullPage:true});}
 if(name==='home')await p.waitForTimeout(1200);
 if(name==='home')for(const theme of ['dark','light']){await p.evaluate(t=>{localStorage.setItem('pixjuice-theme',t);document.documentElement.dataset.theme=t},theme);await p.screenshot({path:out+'site-v3-home-'+theme+'.png',fullPage:true});}
 if(name==='case'){assert.equal(await p.locator('[data-skin-id]').count(),0);await p.locator('[data-i18n="cx.open"]').click();await p.locator('.cx-modal').waitFor();}
 assert.ok(!/\bRealistic\b|(?<!半)写实/.test((await p.locator('body').innerText()).replaceAll('Semi-Realistic','')));
}
for(const [prefix,label] of [['','Semi-Realistic'],['/zh','半写实'],['/ja','セミリアル'],['/ko','세미 리얼'],['/es','Semirrealista']]){
 await p.goto(base+prefix+'/free-assets/chest-wood-realistic-wood-intact/');
 await p.locator('.fa-info').waitFor();
 assert.ok((await p.locator('.fa-info').textContent()).includes(label));
 assert.ok((await p.title()).includes(label));
 assert.equal(await p.locator('[data-variant=style]').count(),0);
}
await p.goto(base+'/zh/editor/');await p.waitForURL('**/zh/#effects');
assert.deepEqual(errors,[]);console.log('Six pages, navigation, themes, empty asset library, crate and editor redirect passed');await b.close();
