// Produce crawlable static pages in five languages after Vite, without runtime SSR.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import ts from 'typescript';
await import('../src/templates/gacha/strings.js');
const SITE='https://pixjuice.pages.dev';
const langs=['en','zh','ja','ko','es'];
const seo=JSON.parse(await readFile('src/templates/seo.json','utf8'));
const dicts={};
for(const lang of langs) {
 const src=ts.transpileModule(await readFile(`src/lib/locales/${lang}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 dicts[lang]=(await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;
}
const lookup=(d,k)=>k.split('.').reduce((v,k)=>v?.[k],d);
const translate=(l,k)=>globalThis.PixStrings[l]?.[k]??lookup(dicts[l],k)??lookup(dicts.en,k)??k;
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const strip=s=>s.replace(/<[^>]*>/g,'');
const manifest=JSON.parse(await readFile('public/free-assets/manifest.json','utf8'));
const products=[...new Set(manifest.assets.map(a=>a.product_id).filter(Boolean))];
const paths=['','credits/','editor/','image-to-pixel-art/','normal-map/','pixel-art-upscaler/','sprite-sheet/','templates/','templates/gacha/','templates/save-load/','free-assets/','free-resources/',...manifest.assets.map(a=>`free-assets/${a.id}/`),...products.map(id=>`free-assets/${id}/`)];
const url=(l,p)=>`${SITE}/${l==='en'?'':l+'/'}${p}`;
for(const path of paths) {
 const original=await readFile(`dist/${path}index.html`,'utf8');
 for(const lang of langs) {
  const d=seo[lang],key=path==='templates/gacha/'?'gx':path==='templates/save-load/'?'sv':path==='templates/'?'tplIndex':path==='free-resources/'?'fr':'fa';
  const asset=manifest.assets.find(a=>path===`free-assets/${a.id}/`) || manifest.assets.find(a=>path===`free-assets/${a.product_id}/`);
  const styleKey={realistic:'tpl.skin.realistic',stylized:'tpl.skin.stylized','clean-low-poly':'tpl.skin.lowpoly','pixel-art':'tpl.skin.pixel'};
  const name=asset?(asset.product_id === "chest-wood"?[translate(lang,'v3.product'),...(path===`free-assets/${asset.product_id}/`?[]:[translate(lang,styleKey[asset.style_tier]),translate(lang,'v3.'+asset.palette),translate(lang,'v3.'+asset.state)])].join(' · '):(lang==='zh'?asset.name.zh||asset.name.en:asset.name.en)):null;
  let title=asset?`${name} — ${d.assetTitle}`:translate(lang,key==='gx'||key==='sv'?key+'.hero.h1':key+'.h1');
  if (lang === "en" && key === "gx") title = "Gacha System Template & Loot Box UI — Spin Wheel Game Template";
  if (lang === "en" && key === "sv") title = "Save Load System UI — Game Save Menu Template";
  const desc=asset?`${name} — ${d.assetDesc}`:strip(translate(lang,key==='gx'||key==='sv'?key+'.hero.lede':key+'.lede'));
  let html=original.replace('<html lang="en">',`<html lang="${lang}">`);
  // Translate static text and rich text (the same data keys the browser uses).
  html=html.replace(/<([a-z][\w-]*)\b([^>]*\bdata-i18n(?:-html)?="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/gi,(all,tag,attrs,k)=>`<${tag}${attrs}>${attrs.includes('data-i18n-html=')?translate(lang,k):esc(translate(lang,k))}</${tag}>`);
  html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${esc(title)} – PixJuice</title>`)
   .replace(/(<meta name="description" content=")[^"]*(")/,`$1${esc(desc)}$2`)
   .replace(/(<meta property="og:title" content=")[^"]*(")/,`$1${esc(title)}$2`)
   .replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${esc(desc)}$2`)
   .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'');
  const questions=asset?[[`${name} — ${translate(lang,'v3.license')}`,d.assetA]]:key==='fr'?[[translate(lang,'fr.q'),translate(lang,'fr.a')]]:key==='fa'?[[d.assetQ,d.assetA]]:[[d.q1,d.a1],[d.q2,d.a2],[d.q3,d.a3]];
  const json=[{'@context':'https://schema.org','@type':key==='fr'?'CollectionPage':'CreativeWork',name:title,description:desc,url:url(lang,path),inLanguage:lang,isAccessibleForFree:true,license:key==='fr'?undefined:key==='fa'?(asset?.license.file?`${SITE}/free-assets/${asset.license.file}`:undefined):'https://creativecommons.org/publicdomain/zero/1.0/'},{'@context':'https://schema.org','@type':'FAQPage',inLanguage:lang,mainEntity:questions.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))}];
  const head=`<link rel="canonical" href="${url(lang,path)}">\n${langs.map(l=>`<link rel="alternate" hreflang="${l}" href="${url(l,path)}">`).join('\n')}\n<link rel="alternate" hreflang="x-default" href="${url('en',path)}">\n<script type="application/ld+json">${JSON.stringify(json).replaceAll('<','\\u003c')}</script>`;
  html=html.replace('</head>',head+'\n</head>');
  const faq=`<section class="tpl-faq"><h2>${esc(d.faq)}</h2>${questions.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>`;
  html=html.replace(/\s*<footer>/,faq+'\n<footer>');
  if(lang!=='en') html=html.replace(/href="\/(templates|free-assets|free-resources)(\/[^"?#]*)?"/g,`href="/${lang}/$1$2"`);
  const folder=`dist/${lang==='en'?'':lang+'/'}${path}`;
  await mkdir(folder,{recursive:true});await writeFile(folder+'index.html',html);
 }
}
// Keep existing tool URLs and add all language alternatives for the library.
let sitemap=await readFile('public/sitemap.xml','utf8');
sitemap=sitemap.replace('</urlset>',paths.flatMap(p=>langs.filter(l=>l!=='en'||!sitemap.includes(url(l,p))).map(l=>`  <url><loc>${url(l,p)}</loc></url>`)).join('\n')+'\n</urlset>');
await writeFile('dist/sitemap.xml',sitemap);
console.log(`Localized ${paths.length} library pages × ${langs.length} languages, with canonical/hreflang, FAQ and sitemap.`);

// Pages redirects run before static files; retain old source assets on disk.
const redirects=[];
for(const a of manifest.assets.filter(a=>['stylized','clean-low-poly','pixel-art'].includes(a.style_tier))){
 const target=manifest.assets.find(b=>b.style_tier==='realistic'&&b.product_id===a.product_id&&b.palette===a.palette&&b.state===a.state);
 for(const lang of langs){const prefix=lang==='en'?'':'/'+lang;redirects.push(`${prefix}/free-assets/${a.id}/ ${prefix}/free-assets/${target?target.id+'/':''} 301`);}
}
await writeFile('dist/_redirects',redirects.join('\n')+'\n');
