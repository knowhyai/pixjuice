// Produce crawlable static pages in five languages after Vite, without runtime SSR.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import ts from 'typescript';
await import('../src/templates/gacha/strings.js');
await import('../src/templates/settlement/strings.js');
const SITE='https://pixjuice.pages.dev';
const outDir=process.env.PIXJUICE_OUTDIR || 'dist';
const langs=['en','zh','ja','ko','es'];
const seo=JSON.parse(await readFile('src/templates/seo.json','utf8'));
const dicts={};
async function readDictionary(path) {
 const src=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
}
for(const lang of langs) dicts[lang]=(await readDictionary(`src/lib/locales/${lang}.ts`)).default;
const lookup=(d,k)=>k.split('.').reduce((v,k)=>v?.[k],d);
const translate=(l,k)=>globalThis.PixStrings[l]?.[k]??lookup(dicts[l],k)??lookup(dicts.en,k)??k;
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const strip=s=>s.replace(/<[^>]*>/g,'');
const manifest=JSON.parse(await readFile('public/free-assets/manifest.json','utf8'));
const isPublicListing=a=>a&&a.style_tier==='realistic'&&!a.hidden&&!a.product_hidden&&!a.placeholder;
const products=[...new Set(manifest.assets.map(a=>a.product_id).filter(Boolean))];
const paths=['','effects/','credits/','editor/','text-fit/','audio-envelope/','camera-shake/','audio-scenes/','weapon-switch/','reload/','typewriter/','image-to-pixel-art/','normal-map/','pixel-art-upscaler/','sprite-sheet/','templates/','templates/gacha/','templates/save-load/','templates/settlement/','free-assets/','free-resources/','free-icons/','feel/','feel/hit/','feel/boss-hp/','feel/jump/','feel/move/','feel/camera/','feel/spring/',...manifest.assets.map(a=>`free-assets/${a.id}/`),...products.map(id=>`free-assets/${id}/`)];
const listedPaths=paths.filter(path=>{
  if(!path.startsWith('free-assets/')||path==='free-assets/')return true;
  const id=path.slice('free-assets/'.length).replace(/\/$/,'');
  const asset=manifest.assets.find(a=>a.id===id);
  if(asset)return isPublicListing(asset);
  return manifest.assets.some(a=>a.product_id===id&&isPublicListing(a));
});
const url=(l,p)=>`${SITE}/${l==='en'?'':l+'/'}${p}`;

const TOOL_SEO = {
  'text-fit/': { title: 'title.textFit', desc: 'title.textFitDesc',
    copyAttr: 'data-copy', copy: (await readDictionary('src/text-fit/strings.ts')).COPY },
  'audio-envelope/': { title: 'title.uiSounds', desc: 'title.uiSoundsDesc',
    copyAttr: 'data-envelope', copy: (await readDictionary('src/lib/audio-envelope/strings.ts')).STRINGS },
  'camera-shake/': { title: 'title.cameraShake', desc: 'title.cameraShakeDesc',
    copyAttr: 'data-shake', copy: (await readDictionary('src/lib/camera-shake/strings.ts')).STRINGS },
  'audio-scenes/': { title: 'title.audioScenes', desc: 'title.audioScenesDesc',
    copyAttr: 'data-scenes', copy: (await readDictionary('src/lib/audio-scenes/strings.ts')).STRINGS },
  'weapon-switch/': {
    copyAttr: 'data-copy',
    copy: (await readDictionary('src/lib/weapon-switch/strings.ts')).COPY,
    title: 'title.weaponSwitch',
    desc: 'title.weaponSwitchDesc',
  },
  'reload/': {
    copyAttr: 'data-reload',
    copy: (await readDictionary('src/lib/reload/strings.ts')).STRINGS,
    title: 'title.reload',
    desc: 'title.reloadDesc',
  },
  'typewriter/': {
    copyAttr: 'data-typewriter',
    copy: (await readDictionary('src/lib/typewriter/strings.ts')).STRINGS,
    title: 'title.typewriter',
    desc: 'title.typewriterDesc',
  },
  'image-to-pixel-art/': { title: 'title.pa', desc: 'pa.lede' },
  'normal-map/': { title: 'title.nm', desc: 'nm.lede' },
  'pixel-art-upscaler/': { title: 'title.up', desc: 'up.lede' },
  'sprite-sheet/': { title: 'title.sheet', desc: 'sheet.lede' },
  'editor/': { title: 'title.editor' },
  'credits/': { title: 'title.credits' },
};
const LOCALE_PREFIXES = ['/zh/', '/ja/', '/ko/', '/es/', '/zh', '/ja', '/ko', '/es'];
const STATIC_HREF = /\.(svg|png|jpg|jpeg|webp|gif|css|js|json|xml|ico|woff2?|map)(\?|$)/i;
function prefixLocalizedHrefs(html, lang) {
  if (lang === 'en') return html;
  return html.replace(/href="(\/[^"]*)"/g, (all, href) => {
    if (STATIC_HREF.test(href)) return all;
    if (LOCALE_PREFIXES.some((p) => href === p.replace(/\/$/, '') || href.startsWith(p) || href.startsWith(p.replace(/\/$/, '') + '#'))) return all;
    return `href="/${lang}${href}"`;
  });
}

const noindexUrls=new Set();
for(const path of paths) {
 const original=await readFile(join(outDir,path,'index.html'),'utf8');
 const tool=TOOL_SEO[path];
 for(const lang of langs) {
  const d=seo[lang],key=path==='templates/gacha/'?'gx':path==='templates/save-load/'?'sv':path==='templates/settlement/'?'se':path==='templates/'?'tplIndex':path==='free-resources/'?'fr':path==='free-icons/'?'fi':path==='feel/'?'feelIndex':path==='feel/hit/'?'feelHit':path==='feel/boss-hp/'?'feelBoss':path==='feel/jump/'?'jump':path==='feel/move/'?'move':path==='feel/camera/'?'camera':path==='feel/spring/'?'spring':path==='effects/'?'effects':tool?.copy?'lab':'fa';
  const asset=manifest.assets.find(a=>path===`free-assets/${a.id}/`) || manifest.assets.find(a=>path===`free-assets/${a.product_id}/`);
  const styleKey={realistic:'tpl.skin.realistic',stylized:'tpl.skin.stylized','clean-low-poly':'tpl.skin.lowpoly','pixel-art':'tpl.skin.pixel'};
  const name=asset?(asset.product_id === "chest-wood"?[translate(lang,'v3.product'),...(path===`free-assets/${asset.product_id}/`?[]:[translate(lang,styleKey[asset.style_tier]),translate(lang,'v3.'+asset.palette),translate(lang,'v3.'+asset.state)])].join(' · '):(lang==='zh'?asset.name.zh||asset.name.en:asset.name.en)):null;
  let title=asset?`${name} — ${d.assetTitle}`:translate(lang,['gx','sv','se'].includes(key)?key+'.hero.h1':key+'.h1');
  if (lang === "en" && key === "gx") title = "Gacha System Template & Loot Box UI — Spin Wheel Game Template";
  if (lang === "en" && key === "sv") title = "Save Load System UI — Game Save Menu Template";
  if (lang === "en" && key === "se") title = "Stage Results UI Template — Game Victory and Defeat Screen";
  if (key === "tplIndex") title = translate(lang, "title.templates");
  let desc=asset?`${name} — ${d.assetDesc}`:strip(translate(lang,['gx','sv','se'].includes(key)?key+'.hero.lede':key+'.lede'));
  if (key === "tplIndex") desc = translate(lang, "home.entryTplD");
  if(path===''){title=translate(lang,'title.home');desc=strip(translate(lang,'home.heroLede'));}
  if(key==='fi'){title=translate(lang,'title.freeIcons');desc=translate(lang,'title.freeIconsDesc');}
  if(TOOL_SEO[path]){
    title=translate(lang,TOOL_SEO[path].title);
    if(path==='audio-scenes/') title+=' — PixJuice';
    if(TOOL_SEO[path].desc) desc=strip(translate(lang,TOOL_SEO[path].desc));
    if(path==='weapon-switch/' || path==='reload/') {
      title=tool.copy[lang].title+' — PixJuice';
      desc=strip(tool.copy[lang].lede);
    }
    if(path==='typewriter/') {
      title=tool.copy[lang].title+' — PixJuice';
      desc=strip(tool.copy[lang].lede);
    }
  }
  let html=original.replace('<html lang="en">',`<html lang="${lang}">`);
  if(lang==='zh') html=html.replaceAll('/previews/en/','/previews/zh/');
  else html=html.replaceAll('/previews/zh/','/previews/en/');
  // Translate static text and rich text (the same data keys the browser uses).
  html=html.replace(/<([a-z][\w-]*)\b([^>]*\bdata-i18n(?:-html)?="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/gi,(all,tag,attrs,k)=>`<${tag}${attrs}>${attrs.includes('data-i18n-html=')?translate(lang,k):esc(translate(lang,k))}</${tag}>`);
  html=html.replace(/aria-label="[^"]*" data-i18n-aria="([^"]+)"/g, (all,k)=>`aria-label="${esc(translate(lang,k))}" data-i18n-aria="${k}"`);
  if(tool?.copy){
    const marked=new RegExp(`<([a-z][\\w-]*)\\b([^>]*\\b${tool.copyAttr}="([^"]+)"[^>]*)>[^<]*<\\/\\1>`,'gi');
    if(path==='typewriter/'){
      const { format }=new Intl.NumberFormat(lang);
      const notes={
        inputLimits: { graphemes: format(600), units: format(4096) },
        timing: { short: ',;:，；：、', sentence: '.?!…。？！' },
        shareLimits: { token: format(1800), url: format(2048) },
      };
      html=html.replace(marked,(all,tag,attrs,k)=>{
        const copy=tool.copy[lang][k];
        const values=notes[k];
        const localized=values ? copy.replace(/\{(\w+)\}/g,(placeholder,key)=>values[key]??placeholder) : copy;
        return `<${tag}${attrs}>${esc(localized)}</${tag}>`;
      });
    } else {
      html=html.replace(marked,(all,tag,attrs,k)=>`<${tag}${attrs}>${esc(tool.copy[lang][k])}</${tag}>`);
    }
  }
  html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${esc(title)}${(path===''||TOOL_SEO[path]||/PixJuice/i.test(title))?'':' – PixJuice'}</title>`)
   .replace(/(<meta name="description" content=")[^"]*(")/,`$1${esc(desc)}$2`)
   .replace(/(<meta property="og:title" content=")[^"]*(")/,`$1${esc(title)}$2`)
   .replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${esc(desc)}$2`)
   .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'')
   .replace(/<link\b(?=[^>]*\srel="canonical")[^>]*>|<link\b(?=[^>]*\srel="alternate")(?=[^>]*\shreflang=")[^>]*>/gi,'');
  const questions=key==='se'?[[translate(lang,'se.faq.q'),translate(lang,'se.faq.a')],[d.q1,d.a1]]:key==='tplIndex'?[[d.q1,d.a1],[d.q2,d.a2],[translate(lang,'tplIndex.faqNextQ'),translate(lang,'tplIndex.faqNextA')]]:key==='lab' ||path===''||key==='jump'||key==='move'||key==='camera'||key==='spring'||key==='effects'?[]:asset?[[`${name} — ${translate(lang,'v3.license')}`,d.assetA]]:(key==='fr'||key==='fi')?[[translate(lang,key+'.q'),translate(lang,key+'.a')]]:key==='feelIndex'||key==='feelHit'?[[translate(lang,'feel.faq1q'),translate(lang,'feel.faq1a')],[translate(lang,'feel.faq2q'),translate(lang,'feel.faq2a')],[translate(lang,'feel.faq3q'),translate(lang,'feel.faq3a')]]:key==='feelBoss'?[[translate(lang,'boss.faq1q'),translate(lang,'boss.faq1a')],[translate(lang,'boss.faq2q'),translate(lang,'boss.faq2a')],[translate(lang,'boss.faq3q'),translate(lang,'boss.faq3a')]]:TOOL_SEO[path]?[[d.q1,d.a1],[d.q2,d.a2],[d.q3,d.a3]]:key==='fa'?[[d.assetQ,d.assetA]]:[[d.q1,d.a1],[d.q2,d.a2],[d.q3,d.a3]];
  const json=[{'@context':'https://schema.org','@type':path===''||key==='fr'||key==='fi'?'CollectionPage':'CreativeWork',name:title,description:desc,url:url(lang,path),inLanguage:lang,isAccessibleForFree:true,license:asset?.license.file?`${SITE}/free-assets/${asset.license.file}`:undefined}];
  if(questions.length) json.push({'@context':'https://schema.org','@type':'FAQPage',inLanguage:lang,mainEntity:questions.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))});
  const unpublished=asset? !isPublicListing(asset) && !(path===`free-assets/${asset.product_id}/` && manifest.assets.some(a=>a.product_id===asset.product_id&&isPublicListing(a))) : path.startsWith('free-assets/') && path!=='free-assets/' && !listedPaths.includes(path);
  const head=`${unpublished?'<meta name="robots" content="noindex, nofollow">\n':''}<link rel="canonical" href="${url(lang,path)}">\n${langs.map(l=>`<link rel="alternate" hreflang="${l}" href="${url(l,path)}">`).join('\n')}\n<link rel="alternate" hreflang="x-default" href="${url('en',path)}">\n<script type="application/ld+json">${JSON.stringify(json).replaceAll('<','\\u003c')}</script>`;
  html=html.replace('</head>',head+'\n</head>');
  if(/<meta\b(?=[^>]*\sname="robots")(?=[^>]*\scontent="[^"]*\bnoindex\b)[^>]*>/i.test(html)) noindexUrls.add(url(lang,path));
  const faq=questions.length?`<section class="tpl-faq"><h2>${esc(d.faq)}</h2>${questions.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>\n`:'';
  if(key==='fi') html=html.replace('</main>',faq+'</main>');
  else html=html.replace(/\s*<footer>/,faq+'<footer>');
  if(lang!=='en') html=prefixLocalizedHrefs(html, lang);
  const folder=join(outDir,lang==='en'?'':lang,path);
  await mkdir(folder,{recursive:true});await writeFile(join(folder,'index.html'),html);
 }
}
// Keep existing tool URLs and add all language alternatives for the library.
let sitemap=await readFile('public/sitemap.xml','utf8');
sitemap=sitemap.replace(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g,(entry,loc)=>noindexUrls.has(loc)?'':entry);
const localizedUrls=listedPaths.flatMap(p=>langs.map(l=>url(l,p))).filter(loc=>!noindexUrls.has(loc)&&!sitemap.includes(`<loc>${loc}</loc>`));
sitemap=sitemap.replace('</urlset>',localizedUrls.map(loc=>`  <url><loc>${loc}</loc></url>`).join('\n')+'\n</urlset>');
await writeFile(join(outDir,'sitemap.xml'),sitemap);
console.log(`Localized ${paths.length} library pages × ${langs.length} languages, with canonical/hreflang, FAQ and sitemap.`);

// Pages redirects run before static files; retain old source assets on disk.
const redirects=[];
for(const a of manifest.assets.filter(a=>['stylized','clean-low-poly','pixel-art'].includes(a.style_tier))){
 const target=manifest.assets.find(b=>b.style_tier==='realistic'&&b.product_id===a.product_id&&b.palette===a.palette&&b.state===a.state);
 for(const lang of langs){const prefix=lang==='en'?'':'/'+lang;redirects.push(`${prefix}/free-assets/${a.id}/ ${prefix}/free-assets/${target?target.id+'/':''} 301`);}
}
// Locale hygiene, same rules the vite-preview middleware enforces locally:
// directory pages canonicalize with a trailing slash in every locale, and any
// /en/ URL (English is the unprefixed default) lands on the canonical English
// page in one hop. The splat at the end catches /en paths outside this list.
for(const p of paths){
 if(p==='')continue;
 const noSlash=p.slice(0,-1);
 for(const lang of langs){const prefix=lang==='en'?'':'/'+lang;redirects.push(`${prefix}/${noSlash} ${prefix}/${p} 301`);}
 redirects.push(`/en/${noSlash} /${p} 301`,`/en/${p} /${p} 301`);
}
redirects.push('/en / 301','/en/* /:splat 301');
await writeFile(join(outDir,'_redirects'),redirects.join('\n')+'\n');
