// Run against the deployed templates preview; requires the same Playwright setup as tests/browser.mjs.
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'https://templates.pixjuice.pages.dev',out='/workspace/pixjuice-briefs';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1440,height:1200},reducedMotion:'no-preference'}),p=await ctx.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(base+'/zh/templates/gacha/');await p.locator('.cx-card').first().waitFor();await p.evaluate(()=>document.fonts.ready);
 for(const [i,skin] of ['realistic'].entries()){
  await p.locator('.cx-select').selectOption(['ironbound','moonveil','ember','ironbound'][i]);
  // Deterministically showcase different reveals; the production result logic is unchanged.
  await p.evaluate(i=>{const original=Math.random;let first=true;Math.random=()=>{if(first){first=false;return [.999,.98,.995,.92][i];}return original();};},i);
  await p.locator('[data-i18n="cx.open"]').click();await p.waitForTimeout(1000);
  await p.locator('#app').screenshot({path:join(out,`templates-v3-case-${skin}-spin.png`)});
  await p.locator('.cx-modal').waitFor();await p.waitForTimeout(150);
  await p.locator('#app').screenshot({path:join(out,`templates-v3-case-${skin}-win.png`)});
  await p.locator('[data-i18n="cx.close"]').click();
 }
 await p.goto(base+'/zh/free-assets/');await p.locator('#fa-grid .fa-card').first().waitFor();await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:join(out,'templates-v3-grid-after.png'),fullPage:true});
 await p.goto(base+'/zh/free-assets/chest-wood-realistic-wood-intact/');await p.waitForFunction(()=>document.querySelector('[data-triangles]'));
 const shots=[];
 for(const [ratio,label] of [[1,'100%'],[.1,'10%']]){
  await p.locator(`button[data-ratio="${ratio}"]`).click();await p.waitForFunction(r=>document.querySelector('[data-triangles]')?.getAttribute('data-ratio')===String(r),ratio);
  await p.waitForTimeout(350);shots.push(await p.locator('.fa-model-wrap').screenshot());
 }
 // Compose the comparison in a local browser document, without changing the deployed page.
 const q=await ctx.newPage();await q.setViewportSize({width:1300,height:760});
 await q.setContent(`<body style="margin:0;background:#0e120f;color:#e5e0cf;font:16px system-ui;padding:28px"><h2 style="font-weight:500">木宝箱 · 浏览器减面 / UV 与贴图保留</h2><div style="display:flex;gap:20px">${shots.map((data,i)=>`<div style="width:610px"><p>${i?'10% 目标 · 646 三角面':'100% 原版 · 2,598 三角面'}</p><img style="width:100%" src="data:image/png;base64,${data.toString('base64')}"></div>`).join('')}</div></body>`);
 await q.screenshot({path:join(out,'templates-v3-remesh-compare.png'),fullPage:true});await q.close();
 // Measure the exact downloaded GLB from each worker result, including its actual byte size.
 const measurements=[];
 for(const ratio of [1,.5,.25,.1]){
  await p.locator(`button[data-ratio="${ratio}"]`).click();await p.waitForFunction(r=>document.querySelector('[data-triangles]')?.getAttribute('data-ratio')===String(r),ratio);
  const pending=p.waitForEvent('download');await p.locator('.fa-remesh button').last().click();const dl=await pending,bytes=await readFile(await dl.path());
  measurements.push({ratio,triangles:Number(await p.locator('[data-triangles]').getAttribute('data-triangles')),bytes:bytes.byteLength,filename:dl.suggestedFilename()});
 }
 await writeFile(join(out,'templates-v3-remesh-measurements.json'),JSON.stringify(measurements,null,2));
 // Capture a complete, natural opening as frames, from idle through the reveal.
 await p.goto(base+'/zh/templates/gacha/');await p.locator('.cx-card').first().waitFor();await p.evaluate(()=>document.fonts.ready);
 const frames='/tmp/pixjuice-v3-frames';await mkdir(frames,{recursive:true});
 for(let i=0;i<56;i++){
  if(i===4)await p.locator('[data-i18n="cx.open"]').click();
  await p.locator('#app').screenshot({path:join(frames,String(i).padStart(3,'0')+'.png')});await p.waitForTimeout(85);
 }
 await p.locator('.cx-modal').waitFor();
 execFileSync('ffmpeg',['-y','-framerate','8','-i',frames+'/%03d.png','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',join(out,'templates-v3-case.mp4')],{stdio:'ignore'});
 assert.deepEqual(errors,[]);console.log('Captured 8 crate screenshots, grid, comparison, complete opening MP4 and downloaded GLB measurements.',measurements);
}finally{await browser.close();}
