import {parseParts,initialParts,replacePart,exportParts} from './parts.js';
import {mountModel} from './model-preview';
import {getLocale} from '../i18n';
const strings={
 en:['Parts','Download part GLB','Replace','Hide','Download combination GLB','Loading…','Unable to load parts. Try again.'],
 zh:['部件','下载部件 GLB','替换','隐藏','下载组合 GLB','加载中…','部件加载失败，请重试。'],
 ja:['パーツ','パーツ GLB をダウンロード','交換','非表示','組み合わせ GLB をダウンロード','読み込み中…','読み込めません。再試行してください。'],
 ko:['부품','부품 GLB 다운로드','교체','숨기기','조합 GLB 다운로드','로딩 중…','불러오지 못했습니다. 다시 시도하세요.'],
 es:['Piezas','Descargar pieza GLB','Reemplazar','Ocultar','Descargar combinación GLB','Cargando…','No se pudo cargar. Inténtalo de nuevo.']};
export async function mountParts(info, viewer, asset, assets, alive, beforePreview) {
 const base='/free-assets/';
 const url=a=>new URL(a.parts_meta || a.glb?.lod0?.replace(/[^/]+$/,'meta.json'),location.origin+base).href;
 const load=async a=>{if(!a.parts_meta&&!a.glb?.lod0)return null;try{const r=await fetch(url(a));if(!r.ok)return null;const m=parseParts(await r.json(),url(a));return m.product_id===(a.product_id||a.id)?m:null;}catch{return null;}};
 const meta=await load(asset);if(!meta||!alive())return;
 const peers=(await Promise.all(assets.filter(a=>(a.product_id||a.id)===meta.product_id && a.style_tier===asset.style_tier).map(load))).filter(Boolean);
 if(!alive())return;
 const text=strings[getLocale()]||strings.en;
 let selection=initialParts(meta),revision=0,cleanup,blobURL;
 const section=document.createElement('section');section.className='fa-parts';section.setAttribute('aria-label',text[0]);
 const title=document.createElement('h2');title.textContent=text[0];section.append(title);
 const status=document.createElement('p');status.setAttribute('role','status');
 const download=document.createElement('button');download.className='tpl-btn tpl-btn-accent';download.textContent=text[4];download.disabled=true;
 let bytes, started=false;
 async function update(){const id=++revision;download.disabled=true;status.textContent=text[5];try{const next=await exportParts(meta,selection);if(!alive()||id!==revision)return;
 bytes=next;if(!started){beforePreview();started=true;}cleanup?.();if(blobURL)URL.revokeObjectURL(blobURL);viewer.replaceChildren();blobURL=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));cleanup=mountModel(viewer,blobURL,asset.id,true);download.disabled=false;status.textContent='';
 }catch{if(alive()&&id===revision)status.textContent=text[6];}}
 for(const part of meta.parts){
 const row=document.createElement('div');row.className='fa-part';row.dataset.slot=part.slot;
 const img=document.createElement('img');img.src=part.thumb;img.alt='';row.append(img);
 const content=document.createElement('div');const name=document.createElement('strong');name.textContent=part.name[getLocale()]||part.name.en;content.append(name);
 const select=document.createElement('select');select.setAttribute('aria-label',text[2]+' '+name.textContent);
 const options=[];
 for(const source of peers)for(const p of source.parts.filter(p=>p.slot===part.slot)){
 const index=options.push({source,part:p})-1;const option=document.createElement('option');option.value=String(index);option.textContent=[source.variant.palette,source.variant.condition||source.variant.state].filter(Boolean).join(' · ')+' — '+(p.name[getLocale()]||p.name.en);option.selected=p.glb===part.glb;select.append(option);}
 if(part.optional){const option=document.createElement('option');option.value='hide';option.textContent=text[3];select.append(option);}
 const link=document.createElement('a');link.className='tpl-btn';link.href=part.glb;link.download='';link.textContent=text[1];
 select.onchange=()=>{const choice=options[Number(select.value)];selection=select.value==='hide'?replacePart(meta,selection,part.slot,meta,null):replacePart(meta,selection,part.slot,choice.source,choice.part.id);const current=selection[part.slot];img.hidden=!current;link.hidden=!current;if(current){img.src=current.part.thumb;link.href=current.part.glb;}void update();};
 content.append(select,link);row.append(content);section.append(row);
 }
 download.onclick=()=>{if(!bytes)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));a.download=meta.product_id+'-combination.glb';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 section.append(status,download);info.append(section);void update();
 return ()=>{revision++;cleanup?.();if(blobURL)URL.revokeObjectURL(blobURL);};
}
