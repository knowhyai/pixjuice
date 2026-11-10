import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from '../i18n';

export function mountModel(host: HTMLElement, url: string, filename: string) {
  let disposed=false, revision=0, source: ArrayBuffer | null=null, current: Uint8Array<ArrayBuffer> | null=null;
  const cache=new Map<number,{bytes:Uint8Array<ArrayBuffer>;triangles:number}>();
  const canvas=document.createElement('canvas');canvas.className='fa-model';host.append(canvas);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.01,1000);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xe9f1ff,0x756044,3));
  const key=new THREE.DirectionalLight(0xffe7bc,4);key.position.set(4,7,5);scene.add(key);
  let model: THREE.Group | null=null;
  const resize=new ResizeObserver(()=>{const w=host.clientWidth;renderer.setSize(w,360,false);camera.aspect=w/360;camera.updateProjectionMatrix();});resize.observe(host);
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  const panel=document.createElement('div');panel.className='fa-remesh';
  const title=document.createElement('h3');title.textContent=t('v3.reduce');panel.append(title);
  const levels=document.createElement('div');levels.className='fa-levels';panel.append(levels);
  const stats=document.createElement('p');stats.setAttribute('role','status');panel.append(stats);
  const hint=document.createElement('p');hint.className='cap';hint.textContent=t('v3.help');panel.append(hint);
  const download=document.createElement('button');download.className='tpl-btn tpl-btn-accent';download.textContent=t('v3.download');download.disabled=true;panel.append(download);host.append(panel);
  const worker=new Worker(new URL('./remesh.worker.ts',import.meta.url),{type:'module'});
  let ratio=1;
  const buttons=[1,.5,.25,.1].map(n=>{const b=document.createElement('button');b.type='button';b.className='tpl-btn';b.dataset.ratio=String(n);b.textContent=n===1?'100%':n*100+'%';b.title=n===1?t('v3.full'):t('v3.level',{n:n*100});b.onclick=()=>{ratio=n;void update();};levels.append(b);return b;});
  function release(group:THREE.Group){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof THREE.Texture)value.dispose();m.dispose();}}});}
  async function display(bytes:Uint8Array<ArrayBuffer>,triangles:number,id:number){
    const gltf=await new GLTFLoader().parseAsync(bytes.slice().buffer,'');
    if(disposed||id!==revision){release(gltf.scene);return;}
    if(model){scene.remove(model);release(model);}model=gltf.scene;scene.add(model);
    const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length();
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(size*.9,size*.6,size*1.3));camera.near=size/100;camera.far=size*100;camera.updateProjectionMatrix();controls.update();
    current=bytes;stats.textContent=t('v3.stats',{n:triangles.toLocaleString(),size:(bytes.byteLength/1048576).toFixed(2)});stats.dataset.triangles=String(triangles);stats.dataset.bytes=String(bytes.byteLength);stats.dataset.ratio=String(ratio);download.disabled=false;
  }
  async function update(){
    const id=++revision;download.disabled=true;stats.textContent=t('v3.loading');buttons.forEach((b,i)=>{b.classList.toggle('on',[1,.5,.25,.1][i]===ratio);b.setAttribute('aria-pressed',String([1,.5,.25,.1][i]===ratio));});
    try {source=source||await (await fetch(url).then(r=>{if(!r.ok)throw Error('Model unavailable');return r;})).arrayBuffer();if(disposed||id!==revision)return;
      const hit=cache.get(ratio);if(hit){await display(hit.bytes,hit.triangles,id);return;}
      worker.postMessage({id,bytes:source.slice(0),ratio});
    }catch{if(!disposed&&id===revision)stats.textContent=t('v3.error');}
  }
  worker.onmessage=async e=>{if(disposed||e.data.id!==revision)return;if(e.data.error){stats.textContent=t('v3.error');return;}const value={bytes:new Uint8Array(e.data.bytes) as Uint8Array<ArrayBuffer>,triangles:e.data.triangles};cache.set(ratio,value);try{await display(value.bytes,value.triangles,e.data.id);}catch{stats.textContent=t('v3.error');}};
  worker.onerror=()=>{stats.textContent=t('v3.error');};
  download.onclick=()=>{if(!current)return;const a=document.createElement('a'),blob=new Blob([current],{type:'model/gltf-binary'});a.href=URL.createObjectURL(blob);a.download=`${filename}-${ratio*100}.glb`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  void update();
  return ()=>{disposed=true;revision++;worker.terminate();resize.disconnect();renderer.setAnimationLoop(null);controls.dispose();if(model)release(model);renderer.dispose();};
}
