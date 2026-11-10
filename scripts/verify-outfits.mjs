import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {WebIO} from '@gltf-transform/core';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4174',out='/workspace/pixjuice-briefs';
const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1440,height:1200},acceptDownloads:true,colorScheme:'dark'});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const entry=kind=>base+`/zh/free-assets/chest-wood/?parts-demo=1&demo-kind=${kind}`;
const ready=async()=>{await p.locator('.fa-part').first().waitFor();await p.waitForFunction(()=>Number(document.querySelector('[data-animation-time]')?.dataset.animationTime)>0);};
const time=()=>p.locator('[data-animation-time]').getAttribute('data-animation-time').then(Number);
const select=slot=>p.locator(`.fa-part[data-slot="${slot}"] select`);
const download=async()=>{const pending=p.waitForEvent('download');await p.locator('[data-action=export]').click();const dl=await pending;const bytes=new Uint8Array(await readFile(await dl.path()));const d=await new WebIO().readBinary(bytes);assert.ok(d.getRoot().listAnimations().length);return d;};
try{
 await p.goto(entry('character'));await ready();assert.equal(await p.locator('.fa-part').count(),5);await p.screenshot({path:out+'/site-v3-outfit-character.png',fullPage:true});
 const canvas=await p.locator('[data-animation-time]').elementHandle(),t=await time();await select('chest').selectOption('robe-mage-blue');await select('main_hand').selectOption('greatsword-steel');assert.ok(await select('legs').isDisabled());assert.ok(await select('off_hand').isDisabled());assert.ok(await time()>t);assert.ok(await canvas.evaluate(c=>c===document.querySelector('[data-animation-time]')));
 await p.locator('[data-action=random]').click();assert.ok(new URL(p.url()).searchParams.has('outfit'));await p.screenshot({path:out+'/site-v3-outfit-random.png',fullPage:true});const shared=p.url(),selected=await p.locator('[data-animation-time]').getAttribute('data-outfit');await p.goto(shared);await ready();assert.equal(await p.locator('[data-animation-time]').getAttribute('data-outfit'),selected);
 await p.locator('select[aria-label="预设搭配"]').selectOption('mage');assert.ok(new URL(p.url()).searchParams.get('preset')==='mage');await p.screenshot({path:out+'/site-v3-outfit-preset.png',fullPage:true});const character=await download();assert.equal(character.getRoot().listNodes().filter(n=>n.getName()==='Armature').length,1);assert.ok(character.getRoot().listSkins().length);
 const frames='/tmp/pixjuice-outfit-frames';await mkdir(frames,{recursive:true});for(let i=0;i<32;i++){if(i===8)await p.locator('select[aria-label="预设搭配"]').selectOption('full-plate');if(i===18)await select('chest').selectOption('robe-mage-blue');await p.screenshot({path:frames+'/'+String(i).padStart(3,'0')+'.png'});await p.waitForTimeout(90);}execFileSync('ffmpeg',['-y','-framerate','8','-i',frames+'/%03d.png','-vf','scale=1200:-2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',out+'/site-v3-outfit-swap.mp4'],{stdio:'ignore'});
 await p.goto(entry('prop'));await ready();await select('lock').selectOption('lock-iron');await select('lid').selectOption('lid-steel');await p.screenshot({path:out+'/site-v3-outfit-prop.png',fullPage:true});const prop=await download();for(const id of ['body','lid','lock','strap'])assert.ok(prop.getRoot().listNodes().some(n=>n.getName()==='socket_'+id));
 await p.goto(entry('character')+'&outfit=chest:missing');await ready();assert.ok(!new URL(p.url()).searchParams.has('outfit'));
 for(const prefix of ['','/ja','/ko','/es']){await p.goto(base+prefix+'/free-assets/chest-wood/?parts-demo=1');await ready();assert.equal(await p.locator('.fa-part').count(),5);}
 await p.setViewportSize({width:390,height:844});await p.goto(entry('character'));await ready();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.setViewportSize({width:1440,height:1200});
 await p.goto(base+'/zh/free-assets/chest-wood-realistic-wood-intact/');await p.waitForFunction(()=>document.querySelector('[data-triangles]'));assert.equal(await p.locator('.fa-parts').count(),0);
 assert.deepEqual(errors,[]);await writeFile(out+'/site-v3-outfit-browser.json',JSON.stringify({base,checks:['5 locales','continuous mixer time and same canvas','slot conflicts','URL roundtrip','preset','bad URL fallback','browser GLB downloads','character master skeleton and animation','prop sockets and animation','legacy model no outfit panel'],errors},null,2));console.log('Outfit browser acceptance passed. Screenshots and MP4 saved.');
}finally{await b.close();}
