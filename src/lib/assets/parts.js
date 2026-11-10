// Paths are local to meta.json; complete parts share the product's origin, scale and pose.
export function parseParts(raw, metaURL) {
  if (!raw || typeof raw.product_id !== 'string' || !raw.product_id || !raw.variant || typeof raw.variant!=='object' || typeof raw.variant.palette!=='string' || typeof (raw.variant.condition || raw.variant.state)!=='string' || !Array.isArray(raw.parts) || !raw.parts.length) throw Error('Invalid parts metadata');
  const seen = new Set();
  const path = (p, ext) => {
    if (typeof p !== 'string' || !/^parts\/[a-zA-Z0-9_./-]+$/.test(p) || p.split('/').includes('..') || !ext.test(p)) throw Error('Invalid part path');
    return new URL(p, metaURL).href;
  };
  return {product_id:raw.product_id, variant:raw.variant, parts:raw.parts.map(p=>{
    if (!p.id || !p.slot || typeof p.id!=='string' || typeof p.slot!=='string' || seen.has(p.slot) || typeof p.name?.en!=='string' || !p.name.en || typeof p.optional!=='boolean') throw Error('Invalid part');
    seen.add(p.slot);
    return {...p, glb:path(p.glb,/\.glb$/i), thumb:path(p.thumb,/\.(png|jpg|webp)$/i)};
  })};
}
export function initialParts(meta) { return Object.fromEntries(meta.parts.map(part=>[part.slot,{product_id:meta.product_id,part}])); }
export function replacePart(meta, selection, slot, source, id) {
  const base=meta.parts.find(p=>p.slot===slot);
  if (!base || source.product_id!==meta.product_id) throw Error('Incompatible product');
  if (id===null) { if (!base.optional) throw Error('Required slot'); return {...selection,[slot]:null}; }
  const part=source.parts.find(p=>p.slot===slot && p.id===id);
  if (!part) throw Error('Incompatible slot');
  return {...selection,[slot]:{product_id:source.product_id,part}};
}
export async function exportParts(meta, selection, read = async url => {
  const r=await fetch(url); if(!r.ok)throw Error('Part unavailable');return new Uint8Array(await r.arrayBuffer());
}) {
  const [{Document,WebIO},{ALL_EXTENSIONS},{mergeDocuments,unpartition}]=await Promise.all([import('@gltf-transform/core'),import('@gltf-transform/extensions'),import('@gltf-transform/functions')]);
  const io=new WebIO().registerExtensions(ALL_EXTENSIONS),doc=new Document(),scene=doc.createScene('Combination');doc.getRoot().setDefaultScene(scene);
  for(const base of meta.parts){
    const item=selection[base.slot];
    if(!item){if(!base.optional)throw Error('Required slot');continue;}
    if(item.product_id!==meta.product_id || item.part.slot!==base.slot)throw Error('Incompatible part');
    const source=await io.readBinary(await read(item.part.glb));
    const map=mergeDocuments(doc,source);
    const original=source.getRoot().getDefaultScene()||source.getRoot().listScenes()[0];
    if(!original)throw Error('Missing part scene');
    const copied=map.get(original);
    const group=doc.createNode(base.slot);
    for(const child of [...copied.listChildren()])group.addChild(child);
    scene.addChild(group);
    for(const s of source.getRoot().listScenes())map.get(s).dispose();
  }
  await doc.transform(unpartition());
  return io.writeBinary(doc);
}
