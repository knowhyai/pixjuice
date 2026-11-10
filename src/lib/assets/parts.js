// Frozen schema v1. Selection values are product-local part IDs or null.
const fail = message => { throw Error(message); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const id = v => typeof v === 'string' && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(v);
const name = v => object(v) && typeof v.en === 'string' && v.en.trim() && Object.values(v).every(x=>typeof x==='string' && x.trim());
const array = v => Array.isArray(v) && v.every(id) && new Set(v).size===v.length;
const unique = items => new Set(items.map(x=>x.id)).size===items.length;
export function parseParts(raw, metaURL) {
 if(!object(raw)||raw.schema_version!==1||!id(raw.product_id)||!['character','prop'].includes(raw.kind)||!name(raw.name)||'variant' in raw)fail('Invalid schema v1');
 const m=structuredClone(raw),r=m.rig;
 const path=(p,ext)=>{if(typeof p!=='string'||! /^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(p)||p.startsWith('/')||p.split('/').some(x=>!x||x==='..'||x==='.')||!ext.test(p))fail('Invalid relative path');return new URL(p,metaURL).href;};
 if(!object(r)||!['mixamo','unity-humanoid','custom'].includes(r.profile)|| (m.kind==='character' && (typeof r.armature!=='string'||!r.armature)) || (r.skeleton_root!==undefined && (typeof r.skeleton_root!=='string'||!r.skeleton_root)) || (r.animations!==undefined && (!Array.isArray(r.animations)||r.animations.some(x=>typeof x!=='string'||!x)||new Set(r.animations).size!==r.animations.length)))fail('Invalid rig');
 r.glb=path(r.glb,/\.glb$/);r.sockets??=[];
 if(!Array.isArray(r.sockets)||!unique(r.sockets)||r.sockets.some(s=>!id(s.id)||typeof s.node!=='string'||!s.node))fail('Invalid sockets');
 if(!Array.isArray(m.slots)||!m.slots.length||!unique(m.slots)||!Array.isArray(m.parts)||!m.parts.length||!unique(m.parts))fail('Invalid slots/parts');
 const socket=s=>r.sockets.some(x=>x.id===s),slot=s=>m.slots.find(x=>x.id===s);
 for(const s of m.slots)if(!id(s.id)||!name(s.name)||typeof s.required!=='boolean'||!['skinned','socket'].includes(s.bind)||(s.bind==='socket'&&!socket(s.socket))||(m.kind==='prop'&&s.bind==='skinned'))fail('Invalid slot');
 for(const p of m.parts){
 const s=slot(p.slot);if(!id(p.id)||p.id.includes('_')||!s||!name(p.name)||!array(p.tags)||'optional' in p)fail('Invalid part');
 if(p.glb!==`parts/${p.id}.glb`||!['png','jpg','webp'].some(ext=>p.thumb===`parts/${p.id}.${ext}`))fail('Part filename must match id');
 p.glb=path(p.glb,/\.glb$/);p.thumb=path(p.thumb,/\.(png|jpg|webp)$/);
 p.conflicts??={};p.requires??={};
 if(!object(p.conflicts)||!object(p.requires))fail('Invalid constraints');
 for(const [obj,keys] of [[p.conflicts,['slots','tags','parts']],[p.requires,['slots','tags']]])for(const k of keys){obj[k]??=[];if(!array(obj[k]))fail('Invalid constraint list');}
 if([...p.conflicts.slots,...p.requires.slots].some(x=>!slot(x))||p.conflicts.parts.some(x=>!m.parts.some(y=>y.id===x))||p.conflicts.slots.includes(p.slot)||p.conflicts.parts.includes(p.id))fail('Invalid constraint reference');
 p.attach??={mode:s.bind,...(s.socket?{socket:s.socket}:{})};const a=p.attach;
 if(!object(a)||!['skinned','socket'].includes(a.mode)||(m.kind==='prop'&&a.mode==='skinned')||(a.mode==='socket'&&!socket(a.socket??s.socket)))fail('Invalid attachment');
 if(a.mode==='socket')a.socket??=s.socket;
 if(a.origin!==undefined&&(typeof a.origin!=='string'||!a.origin))fail('Invalid origin');
 if(a.offset!==undefined){if(!object(a.offset)||a.mode!=='socket')fail('Invalid offset');for(const [k,n] of [['translation',3],['rotation_xyzw',4],['scale',3]])if(a.offset[k]!==undefined&&(!Array.isArray(a.offset[k])||a.offset[k].length!==n||a.offset[k].some(x=>typeof x!=='number'||!Number.isFinite(x))))fail('Invalid offset vector');if(a.offset.rotation_xyzw&&Math.abs(Math.hypot(...a.offset.rotation_xyzw)-1)>.001)fail('Invalid quaternion');if(a.offset.scale?.some(x=>x===0))fail('Invalid scale');}
 }
 for(const s of m.slots)if(!m.parts.some(p=>p.slot===s.id)||(s.default_part!==undefined&&!m.parts.some(p=>p.id===s.default_part&&p.slot===s.id))||(s.required&&!s.default_part))fail('Invalid slot default');
 m.presets??=[];if(!Array.isArray(m.presets)||!unique(m.presets))fail('Invalid presets');
 for(const p of m.presets)if(!id(p.id)||!name(p.name)||!object(p.parts)||!validateOutfit(m,p.parts))fail('Invalid preset');
 if(m.default_preset!==undefined&&!m.presets.some(p=>p.id===m.default_preset))fail('Invalid default preset');
 if(!validateOutfit(m,initialParts(m)))fail('Invalid defaults');return m;
}
export function conflicts(a,b){return a.id!==b.id && [ [a,b],[b,a] ].some(([p,q])=>p.conflicts.slots.includes(q.slot)||p.conflicts.parts.includes(q.id)||p.conflicts.tags.some(t=>q.tags.includes(t)));}
export function validateOutfit(m,selection,{partial=false}={}) {
 if(!object(selection)||Object.keys(selection).some(k=>!m.slots.some(s=>s.id===k)))return false;
 const chosen=[];
 for(const s of m.slots){const v=selection[s.id];if(v==null){if(s.required&&!partial)return false;continue;}const p=m.parts.find(p=>p.id===v&&p.slot===s.id);if(!p)return false;chosen.push(p);}
 if(chosen.some((p,i)=>chosen.slice(i+1).some(q=>conflicts(p,q))))return false;
 return partial||chosen.every(p=>p.requires.slots.every(s=>selection[s]!=null)&&p.requires.tags.every(t=>chosen.some(q=>q.tags.includes(t))));
}
export function initialParts(m){const p=m.presets.find(p=>p.id===m.default_preset);return Object.fromEntries(m.slots.map(s=>[s.id,p?p.parts[s.id]??null:s.required?s.default_part:null]));}
export function disabledSlots(m,selection){return new Set(m.parts.filter(p=>selection[p.slot]===p.id).flatMap(p=>p.conflicts.slots));}
export function replacePart(m,selection,slot,source,partId){
 if(source.product_id!==m.product_id)fail('Incompatible product');const s=m.slots.find(s=>s.id===slot),p=m.parts.find(p=>p.id===partId&&p.slot===slot);
 if(!s||(partId!==null&&(!p||!source.parts.some(q=>q.id===partId&&q.slot===slot))))fail('Incompatible slot');
 const next={...selection,[slot]:partId};
 if(p)for(const q of m.parts)if(q.slot!==slot&&next[q.slot]===q.id&&conflicts(p,q))next[q.slot]=null;
 if(!validateOutfit(m,next))fail('Incompatible outfit');return next;
}
export function randomOutfit(m,rng=Math.random){
 const shuffle=a=>a.map(v=>[rng(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
 function search(i,current){if(i===m.slots.length)return validateOutfit(m,current)?current:null;const s=m.slots[i];for(const v of shuffle([...m.parts.filter(p=>p.slot===s.id).map(p=>p.id),...(!s.required?[null]:[])])){const next={...current,[s.id]:v};if(validateOutfit(m,next,{partial:true})){const result=search(i+1,next);if(result)return result;}}return null;}
 return search(0,{})||fail('No compatible outfit');
}
export function encodeOutfit(m,s){if(!validateOutfit(m,s))fail('Invalid outfit');return m.slots.map(slot=>`${slot.id}:${s[slot.id]??''}`).join(',');}
export function decodeOutfit(m,params){
 const defaults=initialParts(m);try{let s={...defaults};const preset=params.get('preset');if(preset!==null){const p=m.presets.find(p=>p.id===preset);if(!p)fail('Invalid preset');s=Object.fromEntries(m.slots.map(slot=>[slot.id,p.parts[slot.id]??null]));}
 if(params.has('outfit')){if(preset===null)s=Object.fromEntries(m.slots.map(slot=>[slot.id,slot.required?defaults[slot.id]:null]));const seen=new Set();for(const entry of params.get('outfit').split(',')){const pair=entry.split(':');if(pair.length!==2||seen.has(pair[0])||!m.slots.some(x=>x.id===pair[0]))fail('Invalid URL');seen.add(pair[0]);s[pair[0]]=pair[1]||null;}}
 if(!validateOutfit(m,s))fail('Invalid URL outfit');return {selection:s,valid:true};}catch{return {selection:defaults,valid:false};}
}
export async function exportParts(meta,selection,read=async url=>{const r=await fetch(url);if(!r.ok)fail('File unavailable');return new Uint8Array(await r.arrayBuffer());}){
 if(!validateOutfit(meta,selection))fail('Invalid outfit');
 const [{WebIO},{ALL_EXTENSIONS},{mergeDocuments,unpartition}]=await Promise.all([import('@gltf-transform/core'),import('@gltf-transform/extensions'),import('@gltf-transform/functions')]);
 const io=new WebIO().registerExtensions(ALL_EXTENSIONS),doc=await io.readBinary(await read(meta.rig.glb));const scene=doc.getRoot().getDefaultScene()||doc.getRoot().listScenes()[0];if(!scene)fail('Missing base scene');doc.getRoot().setDefaultScene(scene);
 const baseNodes=[...doc.getRoot().listNodes()],byName=new Map(baseNodes.map(n=>[n.getName(),n]));
 for(const p of meta.parts.filter(p=>selection[p.slot]===p.id)){
 const source=await io.readBinary(await read(p.glb)),map=mergeDocuments(doc,source),original=source.getRoot().getDefaultScene()||source.getRoot().listScenes()[0];if(!original)fail('Missing part scene');
 const imported=map.get(original),a=p.attach;
 if(a.mode==='skinned'){
 for(const skin of source.getRoot().listSkins()){const copy=map.get(skin);for(const joint of skin.listJoints()){const main=byName.get(joint.getName());if(!main)fail('Missing master bone');copy.removeJoint(map.get(joint));}for(const joint of skin.listJoints())copy.addJoint(byName.get(joint.getName()));const root=skin.getSkeleton();if(root)copy.setSkeleton(byName.get(root.getName())||null);}
 // Keep only mesh nodes; imported armatures are never added to the scene.
 for(const node of source.getRoot().listNodes().filter(n=>n.getMesh())){const copy=map.get(node);copy.setMatrix(node.getWorldMatrix());scene.addChild(copy);}
 }else{
 const socket=meta.rig.sockets.find(s=>s.id===a.socket),target=byName.get(socket?.node);if(!target)fail('Missing socket');
 const group=doc.createNode(p.id);if(a.origin){const origin=source.getRoot().listNodes().find(n=>n.getName()===a.origin);if(!origin)fail('Missing origin');group.addChild(map.get(origin));}else for(const child of [...imported.listChildren()])group.addChild(child);
 const offset=a.offset||{};group.setTranslation(offset.translation||[0,0,0]).setRotation(offset.rotation_xyzw||[0,0,0,1]).setScale(offset.scale||[1,1,1]);target.addChild(group);
 }
 for(const anim of source.getRoot().listAnimations())map.get(anim).dispose();for(const s of source.getRoot().listScenes())map.get(s).dispose();
 // Dispose only imported, unreferenced hierarchy nodes. Joint references now point to the master.
 for(const n of source.getRoot().listNodes().slice().reverse()){const c=map.get(n);if(!c.getMesh()&&!c.listChildren().length&&!c.listParents().some(x=>x.propertyType==='Skin'||x.propertyType==='Scene'||x.propertyType==='Node'))c.dispose();}
 }
 // Remove unused duplicate armature trees without touching mesh/material/accessor data.
 const reachable=new Set();scene.traverse(n=>reachable.add(n));for(const n of doc.getRoot().listNodes())if(!reachable.has(n))n.dispose();
 await doc.transform(unpartition());return io.writeBinary(doc);
}
