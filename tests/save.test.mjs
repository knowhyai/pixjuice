import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/templates/save-load/save-core.js';
const S=globalThis.PixSave;
test('save read/write/list/delete round trip and namespace isolation',()=>{
 const a=S.memoryAdapter(), e={...S.newGame('s1'),chapter:2,gold:250,playtime:3661};
 S.write(a,'test',e);
 assert.equal(S.read(a,'test','s1').gold,250);
 assert.equal(S.read(a,'other','s1'),null);
 assert.deepEqual(Object.keys(S.list(a,'test',['s1','s2'])),['s1','s2']);
 assert.equal(S.list(a,'test',['s1','s2']).s2,null);
 S.write(a,'test',{...e,slot:S.AUTO_ID,auto:true});
 assert.equal(S.read(a,'test',S.AUTO_ID).auto,true);
 S.remove(a,'test','s1');assert.equal(S.read(a,'test','s1'),null);
});
test('corrupt reads, invalid imports and future versions are rejected',()=>{
 const a=S.memoryAdapter();a.setItem('test:s1','{oops');
 assert.equal(S.read(a,'test','s1'),null);
 for(const txt of ['garbage','null','[]','{}','{"v":99}']) assert.equal(S.parseImport(txt).ok,false);
});
test('export/import preserves state and strips unknown fields and unsafe thumbnails',()=>{
 const e={...S.newGame('s1'),chapter:3,gold:88,evil:'<script>',thumb:'data:image/svg+xml,<svg/>'};
 const out=S.parseImport(S.exportText(e));
 assert.equal(out.ok,true);assert.equal(out.entry.gold,88);assert.equal(out.entry.chapter,3);
 assert.equal(out.entry.thumb,null);assert.equal('evil' in out.entry,false);
 assert.equal(S.sanitize({...e,x:Infinity,y:900}).y,5);
});
test('playtime shows seconds, minutes and hours',()=>{
 assert.equal(S.formatPlaytime(0),'0s');assert.equal(S.formatPlaytime(90),'1m 30s');assert.equal(S.formatPlaytime(3661),'1h 1m');
});
