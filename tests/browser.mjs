// Run after pnpm build and pnpm preview. Install Playwright separately or set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {unzipSync} from 'fflate';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TEST_URL || 'http://127.0.0.1:4173';
const out=process.env.SCREENSHOT_DIR || '/workspace/pixjuice-briefs';
await mkdir(out,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-features=BackForwardCache','--disk-cache-size=1048576']});
const ctx=await b.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',acceptDownloads:true});
const p=await ctx.newPage(), errors=[];
p.setDefaultTimeout(15000);
p.on('pageerror',e=>errors.push(e.message));
const click=key=>p.locator(`button[data-i18n="${key}"]`).click();

async function noOverflow(){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),p.url()+' overflows');}
async function downloadCode(slug){
 const pending=p.waitForEvent('download');await click('tpl.download');const dl=await pending;
 const files=unzipSync(new Uint8Array(await readFile(await dl.path())));
 assert.ok(files['styles.css']&&files['README.md']&&files.LICENSE);
 for(const font of ['cinzel-latin-500','cormorant-latin-500']) {
  const data=files['fonts/'+font+'.woff2']; assert.ok(data);assert.equal(new TextDecoder().decode(data.slice(0,4)),'wOF2');
 }
 for(const font of ['Cinzel','Cormorant']) assert.ok(new TextDecoder().decode(files['fonts/'+font+'-OFL.txt']).includes('SIL OPEN FONT LICENSE'));
 assert.ok(!new TextDecoder().decode(files['styles.css']).includes("url('/fonts/"));
 assert.ok(new TextDecoder().decode(files['README.md']).includes(base),'ZIP art links use the active deployment');
 if(slug==='gacha')assert.equal(Object.keys(files).filter(n=>n.endsWith('.png')).length,5);else assert.ok(!Object.keys(files).some(n=>/\.(png|glb|fbx|jpg)$/i.test(n)));
 const root='/tmp/pixjuice-standalone-'+slug;
 for(const [name,bytes] of Object.entries(files)){await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),bytes);}
 const q=await b.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 q.on('pageerror',e=>errors.push('ZIP: '+e.message));
 if(slug==='gacha')await q.route(/^https?:/,r=>r.abort());
 await q.goto('file://'+root+'/index.html');
 await q.locator('.tpl-demo').waitFor();
 assert.equal(await q.locator('.gx-skin-btn').count(),0);
 assert.equal(await q.locator('.tpl-demo').evaluate(e=>getComputedStyle(e).display),'grid');
 assert.ok(!(await q.locator('.tpl-demo').innerText()).includes('tabPool'));
 if(slug==='gacha'){await q.locator('select[aria-label=Language]').selectOption('zh');assert.ok((await q.locator('.cx-contents').innerText()).includes('木剑'));await q.locator('[data-i18n="cx.open"]').click();await q.locator('.cx-modal').waitFor();await q.locator('.cx-modal button').click();await q.locator('[data-i18n="gx.tabPool"]').click();await q.locator('[data-i18n="gx.pull10"]').click();assert.equal(await q.locator('.gx-card').count(),10);}
 else {await q.locator('[data-i18n="sv.saveHere"]').first().click();assert.equal(await q.locator('.sv-slot-filled').count(),1);}
 await q.close();
}
try {
 await p.goto(base+'/templates/gacha/');await p.locator('.cx-pane').waitFor();
 assert.equal(await p.locator('.codebox').count(),1);
 assert.equal(await p.locator('.tpl-demo').getAttribute('data-skin'),'realistic');
 await p.locator('.cx-pane').waitFor();
 await p.locator('#cx-quick').check();await p.locator('#cx-sound').check();await p.locator('#cx-sound').uncheck();
 await p.locator('.cx-select').selectOption('moonveil');await click('cx.open');await p.locator('.cx-modal').waitFor();
 assert.equal(await p.locator('.cx-modal .cx-card').getAttribute('data-item'),await p.locator('.cx-reel').getAttribute('data-winner'));
 await click('cx.close');await p.locator('.cx-select').selectOption('ember');assert.equal(await p.locator('.cx-contents .cx-card').count(),7);
 await click('gx.tabPool');
 await click('gx.pull1');assert.equal(await p.locator('.gx-card').count(),1);
 await click('gx.pull10');assert.equal(await p.locator('.gx-card').count(),10);
 assert.ok(await p.locator('.gx-card.r-SR,.gx-card.r-SSR').count()>0);
 assert.equal(await p.locator('.gx-hist li').count(),12);
 assert.ok(!/[{}]/.test(await p.locator('.gx-pitybar').innerText()));

 await p.screenshot({path:join(out,'templates-gacha.png'),fullPage:true});
 await click('gx.tabWheel');await click('gx.spin');await p.waitForFunction(()=>document.querySelector('.gx-wheel-out').textContent.length>0);
 assert.ok(!/[{}]/.test(await p.locator('.gx-wheel-out').innerText()));
 await p.locator('#app').screenshot({path:join(out,'templates-wheel.png')});
 await click('gx.tabPool');await downloadCode('gacha');
 await p.reload();assert.equal(await p.locator('.gx-hist li').count(),13);
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
await p.screenshot({path:join(out,'templates-save.png'),fullPage:true});
 await downloadCode('save-load');await p.clock.resume();
 for(const lang of ['en','zh','ja','ko','es']){
  const prefix=lang==='en'?'':'/'+lang;
  for(const route of ['/templates/','/templates/gacha/','/templates/save-load/','/free-assets/','/free-resources/','/feel/','/feel/hit/']){
   const seoPage=await ctx.newPage();
   const res=await seoPage.goto(base+prefix+route);assert.equal(res.status(),200);
   assert.equal(await seoPage.locator('html').getAttribute('lang'),lang);
   assert.equal(await seoPage.locator('link[rel=canonical]').count(),1);
   assert.equal(await seoPage.locator('link[hreflang]').count(),6);
   assert.ok((await seoPage.title()).length>8);
   assert.ok(await seoPage.locator('.tpl-faq details').count()>0);
   assert.ok(!/\{(n|max|item)\}/.test(await seoPage.locator('body').innerText()));
   await seoPage.close();
  }
 }
 await p.goto(base+'/free-resources/');
 assert.equal(await p.locator('.resource-card').count(),7);
 assert.ok((await p.locator('.lede').innerText()).includes('also CC0 1.0'));
 await p.screenshot({path:join(out,'free-resources.png'),fullPage:true});
 await p.locator('#lang').selectOption('zh');await p.waitForURL('**/zh/free-resources/');
 assert.equal(await p.locator('html').getAttribute('lang'),'zh');
 await p.goto(base+'/free-assets/');await p.locator('#fa-empty:not([hidden])').waitFor();
 // the legacy chest is unpublished (product_hidden), so the grid shows the
 // "in production" empty state; detail pages stay reachable below
 assert.equal(await p.locator('.fa-card').count(),0);
 assert.ok(await p.locator('#fa-filters').isHidden());
 await p.goto(base+'/free-assets/chest-wood-realistic-wood-intact/');await p.locator('.fa-file').first().waitFor();
 assert.ok(await p.locator('.fa-file').count()>=7);
 assert.equal(await p.locator('[data-variant=style]').count(),0);
 await p.waitForFunction(()=>document.querySelector('[data-triangles]'));
 const full=Number(await p.locator('[data-triangles]').getAttribute('data-triangles'));
 await p.locator('button[data-ratio="0.1"]').click();await p.waitForFunction(()=>document.querySelector('[data-triangles]')?.getAttribute('data-ratio')==='0.1');
 assert.ok(Number(await p.locator('[data-triangles]').getAttribute('data-triangles'))<full);
 assert.ok(!(await p.locator('.fa-files').innerText()).includes('LOD1'));
 await p.locator('[data-variant=color]').selectOption('gold');assert.ok(p.url().includes('realistic-gold-intact'));

 const assetDownload=p.waitForEvent('download');await click('fa.downloadAll');
 const assetZip=unzipSync(new Uint8Array(await readFile(await (await assetDownload).path())));
 for(const [name,data] of Object.entries(assetZip).filter(([name])=>/LICENSE.txt|README.txt/.test(name))){
  const text=new TextDecoder().decode(data);assert.ok(text.includes('CC0 1.0'),name);assert.ok(text.includes('without')||text.includes('no attribution'));
 }

 for(const a of await p.locator('.fa-file').evaluateAll(es=>es.map(e=>e.href))){assert.equal((await ctx.request.get(a)).status(),200);}

 // ---- Game Feel Lab -----------------------------------------------------
 await p.goto(base+'/feel/');await p.locator('.feel-domain').first().waitFor();
 assert.equal(await p.locator('.feel-domain').count(),4);
 assert.ok(await p.locator('#support,#physicality,#amplification,#context').count()===4);
 assert.ok(await p.locator('#amplification .feel-card a[href="/feel/hit/"]').count()>0);
 assert.equal(await p.locator('.feel-card').count(),1);
 assert.equal(await p.locator('.feel-badge-soon').count(),3);
 assert.equal(await p.locator('nav.nav a[href="/feel/"]').getAttribute('aria-current'),'page');
 assert.equal(await p.locator('#amplification .feel-leaves, #amplification ul ul').count(),0);
 await p.screenshot({path:join(out,'juice-lab-home.png'),fullPage:true});

 await p.goto(base+'/feel/hit/');await p.locator('.feel-layer').first().waitFor();
 assert.equal(await p.locator('.feel-layer').count(),6);
 await p.locator('.feel-host-wrap[data-ready]').waitFor({timeout:30000});
 for(const anchor of ['hit-stop','screen-shake','hit-feedback','knockback','directional-vfx','impact-sfx'])
  assert.equal(await p.locator('#'+anchor).count(),1,'layer anchor '+anchor);
 // six top-level toggles flip and rewrite the exported code
 const stopBox=p.locator('input[data-feel-toggle="hitStop"]');
 assert.ok(await stopBox.isChecked());
 await stopBox.uncheck();
 assert.ok(await p.locator('button[data-preset].on').count()===0,'manual change clears the preset highlight');
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hit_stop_enabled := false'));
 await stopBox.check();
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hit_stop_enabled := true'));
 // sliders drive the code: 20 frames @60 → 0.333 s
 await p.locator('input[data-feel-slider="hitStop.frames"]').fill('20');
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hit_stop_seconds := 0.333'));
 // sub-switches: kill the mid band and watch the flag flip
 await p.locator('input[data-feel-sub="sfx.mid"]').uncheck();
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('audio_band_mid := false'));
 await p.locator('input[data-feel-sub="sfx.mid"]').check();
 // Unity tab exports C# and reacts too
 await p.locator('.feel-engine-tabs button',{hasText:'Unity'}).click();
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('WaitForSecondsRealtime'));
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hitStopSeconds = 0.333f'));
 await p.locator('.feel-engine-tabs button',{hasText:'Godot'}).click();
 // copy produces non-empty text
 const codeText=await p.locator('.feel-code-pre').innerText();
 assert.ok(codeText.length>500);
 // zone buttons switch, attack fires a number and layer 6 bands exist
 await p.locator('button[data-zone="belly"]').click();
 assert.equal(await p.locator('button[data-zone="belly"]').getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('input[data-feel-sub="sfx.high"]').count(),1);
 await p.locator('button[data-i18n="feel.attack"]').click();
 await p.waitForSelector('.feel-dmg',{timeout:15000});
 // three presets: light → heavy → overdone, each sets params and re-attacks
 await p.locator('button[data-preset="light"]').click();
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hit_stop_seconds := 0.067'));
 await p.screenshot({path:join(out,'juice-hit-light.png'),fullPage:true});
 await p.locator('button[data-preset="heavy"]').click();
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hit_stop_seconds := 0.233'));
 await p.waitForTimeout(900); // let the heavy finisher play out on screen
 await p.screenshot({path:join(out,'juice-hit-heavy.png'),fullPage:true});
 await p.locator('button[data-preset="overdone"]').click();
 assert.ok((await p.locator('.feel-code-pre').innerText()).includes('hit_stop_seconds := 0.433'));
 await p.waitForTimeout(600);
 await p.screenshot({path:join(out,'juice-hit-overdone.png'),fullPage:true});
 // the knight model ships with the page
 assert.equal((await ctx.request.get(base+'/feel/knight.glb')).status(),200);
 assert.equal((await ctx.request.get(base+'/feel/LICENSE.txt')).status(),200);
 // Chinese edition renders localized copy and the same demo
 await p.goto(base+'/zh/feel/hit/');await p.locator('.feel-host-wrap[data-ready]').waitFor({timeout:30000});
 assert.equal(await p.locator('html').getAttribute('lang'),'zh');
 assert.ok((await p.locator('main h1').innerText()).includes('打击感'));
 await p.locator('button[data-i18n="feel.attack"]').click();
 await p.waitForSelector('.feel-dmg',{timeout:15000});
 await p.screenshot({path:join(out,'juice-hit-zh.png'),fullPage:true});

 for(const route of ['/templates/','/templates/gacha/','/templates/save-load/','/free-assets/','/free-resources/','/feel/','/feel/hit/']){
  await p.setViewportSize({width:390,height:844});await p.goto(base+route);await p.waitForTimeout(200);await noOverflow();
  await p.screenshot({path:join(out,'mobile-'+route.split('/').filter(Boolean).join('-')+'.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: gacha, wheel, persistence, save confirmations/import/export/autosave, single dark gold interface, 5-language static SEO, asset links, 2 standalone ZIPs, Game Feel Lab (routes, layers, presets, code, zh), mobile overflow; no page errors.');
} finally {await b.close();}
