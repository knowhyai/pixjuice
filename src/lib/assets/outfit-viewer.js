import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export async function createOutfitViewer(host,meta,alive,beforePreview){
 const loader=new GLTFLoader(),base=await loader.loadAsync(meta.rig.glb),loaded=await Promise.all(meta.parts.map(async p=>[p.id,await loader.loadAsync(p.glb)]));
 const all=[base,...loaded.map(x=>x[1])],release=()=>{const geometries=new Set(),materials=new Set(),textures=new Set();for(const g of all)g.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());};
 if(!alive()){release();return null;}
 const find=(name)=>base.scene.getObjectByName(name)||base.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
 const nodes=new Map();base.scene.traverse(n=>nodes.set(n.name,n));const groups=new Map();
 try{for(const [id,gltf] of loaded){const p=meta.parts.find(p=>p.id===id),a=p.attach,group=new THREE.Group();group.name=id;
 if(a.mode==='skinned'){
 const meshes=[];gltf.scene.traverse(n=>{if(n.isMesh)meshes.push(n);});
 for(const n of meshes){if(n.isSkinnedMesh){const bones=n.skeleton.bones.map(b=>{const main=nodes.get(b.name);if(!main)throw Error('Missing master bone: '+b.name);return main;});const skeleton=new THREE.Skeleton(bones,n.skeleton.boneInverses.map(m=>m.clone()));n.bind(skeleton,n.bindMatrix.clone());}group.attach(n);}base.scene.add(group);
 }else{const socket=meta.rig.sockets.find(s=>s.id===a.socket),target=find(socket.node);if(!target)throw Error('Missing socket');if(a.origin){const origin=gltf.scene.getObjectByName(a.origin);if(!origin)throw Error('Missing origin');group.add(origin);}else group.add(...gltf.scene.children.slice());const o=a.offset||{};group.position.fromArray(o.translation||[0,0,0]);group.quaternion.fromArray(o.rotation_xyzw||[0,0,0,1]);group.scale.fromArray(o.scale||[1,1,1]);target.add(group);}groups.set(id,group);
 }}catch(e){release();throw e;}
 beforePreview();host.replaceChildren();const canvas=document.createElement('canvas');canvas.className='fa-model';canvas.setAttribute('aria-label',meta.name.en);host.append(canvas);
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.01,100);scene.add(base.scene,new THREE.HemisphereLight(0xe9f1ff,0x756044,3));const key=new THREE.DirectionalLight(0xffe7bc,4);key.position.set(4,7,5);scene.add(key);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;const center=meta.kind==='character'?new THREE.Vector3(0,1.1,0):new THREE.Vector3(0,.2,0);controls.target.copy(center);camera.position.copy(center).add(meta.kind==='character'?new THREE.Vector3(3,1.5,5):new THREE.Vector3(3,2.4,4));
 const mixer=new THREE.AnimationMixer(base.scene);for(const clip of base.animations.slice(0,1))mixer.clipAction(clip).play();let previous=performance.now();
 const resize=new ResizeObserver(()=>{renderer.setSize(host.clientWidth,440,false);camera.aspect=host.clientWidth/440;camera.updateProjectionMatrix();});resize.observe(host);
 renderer.setAnimationLoop(()=>{const now=performance.now();mixer.update(Math.min((now-previous)/1000,.1));previous=now;canvas.dataset.animationTime=String(mixer.time);controls.update();renderer.render(scene,camera);});
 return {update(selection){for(const [id,g] of groups){const p=meta.parts.find(p=>p.id===id);g.visible=selection[p.slot]===id;}canvas.dataset.outfit=JSON.stringify(selection);},dispose(){resize.disconnect();renderer.setAnimationLoop(null);mixer.stopAllAction();mixer.uncacheRoot(base.scene);controls.dispose();release();renderer.dispose();}};
}
