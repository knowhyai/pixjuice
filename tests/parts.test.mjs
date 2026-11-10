import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WebIO} from '@gltf-transform/core';
import {parseParts,initialParts,replacePart,exportParts,validateOutfit,randomOutfit,encodeOutfit,decodeOutfit,disabledSlots} from '../src/lib/assets/parts.js';
const raw=async kind=>JSON.parse(await readFile(`public/parts-demo/outfit-${kind}/meta.json`));
const load=async kind=>parseParts(await raw(kind),`http://fixture/parts-demo/outfit-${kind}/meta.json`);
const read=async url=>new Uint8Array(await readFile('public'+new URL(url).pathname));
test('frozen schema v1 parses both kinds and rejects malformed metadata',async()=>{
 for(const k of ['character','prop'])assert.equal((await load(k)).schema_version,1);
 const valid=await raw('character');assert.throws(()=>parseParts(valid,'http://fixture/wrong-product/meta.json'));assert.doesNotThrow(()=>parseParts(valid,'http://fixture/parts-demo/outfit-character/meta.json'));
 const mutations=[m=>m.schema_version=2,m=>m.kind='unknown',m=>m.variant={},m=>m.product_id='../bad',m=>m.rig.glb='../base.glb',m=>m.rig.glb='https://remote/base.glb',m=>delete m.rig.armature,m=>m.rig.profile='bad',m=>m.rig.animations=[1],m=>m.rig.sockets.push({...m.rig.sockets[0]}),m=>m.slots.push({...m.slots[0]}),m=>m.slots[0].required='yes',m=>m.slots[0].bind='bad',m=>m.slots[3].socket='missing',m=>m.slots[1].default_part='missing',m=>m.parts[0].id='Upper',m=>m.parts[0].glb='parts/other.glb',m=>m.parts[0].thumb='parts/helm-steel.svg',m=>m.parts[0].name={},m=>m.parts[0].tags=['UPPER'],m=>m.parts[0].conflicts.slots=['missing'],m=>m.parts[0].conflicts.parts=['missing'],m=>m.parts[0].requires.slots=['missing'],m=>m.parts[0].requires.tags=2,m=>m.parts[0].attach={mode:'socket',socket:'missing'},m=>m.parts[4].attach.offset.translation=[0,NaN,0],m=>m.parts[4].attach.offset.rotation_xyzw=[0,0,0,0],m=>m.default_preset='missing',m=>m.presets[0].parts.chest=null,m=>m.presets[0].parts.legs='robe-mage-blue'];
 for(const change of mutations){const m=structuredClone(valid);change(m);assert.throws(()=>parseParts(m,'http://fixture/parts-demo/outfit-character/meta.json'),undefined,String(change));}
 assert.throws(()=>parseParts({},'http://fixture/meta.json'));
});
test('symmetric conflicts, automatic clearing, blocked slots and dependencies',async()=>{
 const m=await load('character');let s=initialParts(m);assert.ok(validateOutfit(m,s));
 s=replacePart(m,s,'chest',m,'robe-mage-blue');assert.equal(s.legs,null);assert.ok(disabledSlots(m,s).has('legs'));assert.ok(!validateOutfit(m,{...s,legs:'greaves-steel'}));
 s=replacePart(m,s,'main_hand',m,'greatsword-steel');assert.equal(s.off_hand,null);assert.ok(disabledSlots(m,s).has('off_hand'));assert.ok(!validateOutfit(m,{...s,off_hand:'shield-steel'}));
 assert.throws(()=>replacePart(m,s,'chest',m,null));assert.throws(()=>replacePart(m,s,'head',{...m,product_id:'other'},'helm-steel'));assert.ok(!validateOutfit(m,{...s,head:{product_id:'other',id:'helm-steel'}}));
 assert.ok(!validateOutfit(m,{...initialParts(m),main_hand:null}));
 const tagged=structuredClone(m);tagged.parts.find(p=>p.id==='helm-steel').requires.tags=['mage'];assert.ok(!validateOutfit(tagged,initialParts(tagged)));assert.ok(validateOutfit(tagged,{...s,head:'helm-steel'}));
 const dependent=structuredClone(m);dependent.parts.find(p=>p.id==='cuirass-steel').requires.slots=['head'];assert.ok(!validateOutfit(dependent,{...initialParts(dependent),head:null}));
 // Tag and explicit-part conflicts apply in either direction.
 for(const field of ['tags','parts']){const n=structuredClone(m);const helm=n.parts.find(p=>p.id==='helm-steel');helm.conflicts[field]=[field==='tags'?'shield':'shield-steel'];assert.ok(!validateOutfit(n,initialParts(n)));}
});
test('random backtracking always yields legal outfits and all presets are valid',async()=>{
 for(const kind of ['character','prop']){const m=await load(kind);for(const p of m.presets)assert.ok(validateOutfit(m,p.parts));const seen=new Set();for(let i=0;i<400;i++){const s=randomOutfit(m);assert.ok(validateOutfit(m,s));seen.add(encodeOutfit(m,s));}assert.ok(seen.size>3);}
});
test('URL round trips, preset overlays, defaults and invalid fallback',async()=>{
 const m=await load('character');for(let i=0;i<80;i++){const s=randomOutfit(m);assert.deepEqual(decodeOutfit(m,new URLSearchParams({outfit:encodeOutfit(m,s)})),{selection:s,valid:true});}
 const p=decodeOutfit(m,new URLSearchParams('preset=mage'));assert.equal(p.selection.chest,'robe-mage-blue');assert.ok(p.valid);
 assert.equal(decodeOutfit(m,new URLSearchParams('preset=mage&outfit=head:helm-steel')).selection.head,'helm-steel');
 assert.equal(decodeOutfit(m,new URLSearchParams('outfit=head:')).selection.chest,'cuirass-steel');
 for(const query of ['preset=missing','outfit=legs:greaves-steel,chest:robe-mage-blue','outfit=head:foreign','outfit=head:,head:','outfit=head','outfit=other:','outfit=chest:']){const s=decodeOutfit(m,new URLSearchParams(query));assert.equal(s.valid,false);assert.deepEqual(s.selection,initialParts(m));}
});
test('export GLB roundtrip: one master armature, joints, animation, socket hierarchy, UV/normals/textures',async()=>{
 for(const kind of ['character','prop']){const m=await load(kind);for(const preset of m.presets){const bytes=await exportParts(m,preset.parts,read),doc=await new WebIO().readBinary(bytes),root=doc.getRoot(),scene=root.getDefaultScene();assert.ok(scene);assert.ok(root.listAnimations().length>0);for(const animation of root.listAnimations()){assert.ok(animation.listSamplers().length);for(const channel of animation.listChannels()){assert.ok(channel.getSampler()?.getInput());assert.ok(channel.getSampler()?.getOutput());assert.ok(channel.getTargetNode());}}assert.equal(root.listAnimations()[0].getName(),kind==='character'?'Idle':'Open');
 if(kind==='character'){assert.equal(root.listNodes().filter(n=>n.getName()==='Armature').length,1);const joints=new Set(root.listSkins().flatMap(s=>s.listJoints()));assert.equal(joints.size,5);for(const skin of root.listSkins())assert.equal(skin.getSkeleton().getName(),'mixamorig:Hips');}else{for(const socket of m.rig.sockets)assert.ok(root.listNodes().some(n=>n.getName()===socket.node));const lock=root.listNodes().find(n=>n.getName()===preset.parts.lock);assert.equal(lock.getParentNode().getName(),'socket_lock');assert.equal(lock.getParentNode().getParentNode().getName(),'socket_lid');}
 for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){assert.ok(p.getAttribute('TEXCOORD_0'));assert.ok(p.getAttribute('NORMAL'));assert.ok(p.getMaterial().getBaseColorTexture().getImage().length);if(kind==='character'&&mesh.getName()!=='root')assert.ok(p.getAttribute('JOINTS_0'));}
 }}
});
test('socket export applies nonzero local attachment offset',async()=>{const m=await load('prop');const p=m.parts.find(p=>p.id==='lock-gold');p.attach.offset={translation:[.1,.2,.3],rotation_xyzw:[0,0,1,0],scale:[2,3,4]};const doc=await new WebIO().readBinary(await exportParts(m,initialParts(m),read));const node=doc.getRoot().listNodes().find(n=>n.getName()==='lock-gold');assert.deepEqual(node.getTranslation(),[.1,.2,.3]);assert.deepEqual(node.getRotation(),[0,0,1,0]);assert.deepEqual(node.getScale(),[2,3,4]);assert.equal(node.getParentNode().getName(),'socket_lock');});
test('hidden demos never enter public grid manifest',async()=>{const m=JSON.parse(await readFile('public/free-assets/manifest.json'));assert.ok(m.assets.every(a=>!a.id.startsWith('outfit-')&&!a.id.startsWith('parts-')));});
