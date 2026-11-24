import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(name) {
  const source = readFileSync(new URL(`../src/lib/audio-scenes/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
}

const [{ clipsForFilter, clipMetadata }, { createPlayer }, { STRINGS, clipName }] =
  await Promise.all(['catalog', 'player', 'strings'].map(loadModule));
const publicDir = new URL('../public/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('audio-scenes/catalog.json', publicDir), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('every download is the catalogued original OGG', () => {
  assert.equal(catalog.items.length, 20);
  assert.equal(catalog.item_count, 20);
  let total = 0;
  for (const clip of catalog.items) {
    assert.equal(clip.download_path, `/audio-scenes/samples/${clip.id}.ogg`);
    const bytes = readFileSync(new URL(clip.download_path.slice(1), publicDir));
    assert.equal(bytes.subarray(0, 4).toString(), 'OggS', clip.id);
    assert.equal(bytes.length, clip.size_bytes, clip.id);
    assert.equal(sha256(bytes), clip.sha256, clip.id);
    total += bytes.length;
  }
  assert.equal(total, 214849);
});

test('each scene filter returns the expected catalog items', () => {
  const expected = { all: 20, ui: 6, reward: 2, weapon: 3, footstep: 3, hit: 4, environment: 2 };
  assert.deepEqual(catalog.filters.map(filter => filter.id), Object.keys(expected));
  for (const [id, count] of Object.entries(expected)) {
    const items = clipsForFilter(catalog, id);
    assert.equal(items.length, count, id);
    assert.deepEqual(items, catalog.items.filter(clip => id === 'all' || clip.filter_id === id));
  }
  assert.deepEqual(clipsForFilter(catalog, 'unknown'), []);
});

class FakeAudio {
  src = '';
  onended = null;
  onerror = null;
  playing = false;

  constructor(start = () => Promise.resolve()) {
    this.start = start;
  }

  play() {
    this.playing = true;
    return this.start();
  }

  pause() { this.playing = false; }
  removeAttribute(name) {
    assert.equal(name, 'src');
    this.src = '';
  }
  load() {}
}

function setup(...starts) {
  const audio = [];
  const states = new Map();
  const player = createPlayer(() => {
    assert.ok(audio.every(source => !source.playing), 'release the previous source before creating another');
    const source = new FakeAudio(starts[audio.length]);
    audio.push(source);
    return source;
  }, (id, state) => states.set(id, state));
  return { player, audio, states };
}

const [a, b] = catalog.items;

test('player starts silent with no active source or audio construction', () => {
  const { player, audio, states } = setup();
  assert.equal(player.activeId, null);
  assert.deepEqual(audio, []);
  assert.equal(states.size, 0);
});

test('starting a clip stops the previous clip and Stop clears the current source', async () => {
  const { player, audio, states } = setup();
  await player.play(a);
  assert.equal(audio[0].src, a.download_path);
  assert.equal(states.get(a.id), 'playing');
  await player.play(b);
  assert.equal(states.get(a.id), 'idle');
  assert.equal(audio[0].src, '');
  assert.equal(player.activeId, b.id);
  assert.equal(audio[1].playing, true);
  player.stop();
  assert.equal(player.activeId, null);
  assert.equal(states.get(b.id), 'idle');
  assert.equal(audio[1].src, '');
  assert.ok(audio.every(source => !source.playing));
});

test('a rejected load or decode reports an error and releases its source', async () => {
  const { player, audio, states } = setup(undefined, () => Promise.reject(new Error('Decode failed')));
  await player.play(a);
  await player.play(b);
  assert.equal(states.get(a.id), 'idle');
  assert.equal(states.get(b.id), 'error');
  assert.equal(player.activeId, null);
  assert.ok(audio.every(source => !source.playing && source.src === ''));
});

test('a late failure from a replaced clip cannot change the active clip', async () => {
  let reject;
  const loading = new Promise((_, fail) => { reject = fail; });
  const { player, audio, states } = setup(() => loading);
  const firstPlay = player.play(a);
  assert.equal(states.get(a.id), 'loading');
  await player.play(b);
  reject(new Error('Aborted'));
  await firstPlay;
  assert.equal(states.get(a.id), 'idle');
  assert.equal(states.get(b.id), 'playing');
  assert.equal(player.activeId, b.id);
  audio[1].onended();
  assert.equal(player.activeId, null);
  assert.equal(states.get(b.id), 'idle');
});

test('a media error after playback starts updates the clip state', async () => {
  const { player, audio, states } = setup();
  await player.play(a);
  audio[0].onerror();
  assert.equal(states.get(a.id), 'error');
  assert.equal(player.activeId, null);
  assert.equal(audio[0].src, '');
});

test('five locales cover the scene filters and use factual labels', () => {
  assert.deepEqual(Object.keys(STRINGS), ['en', 'zh', 'ja', 'ko', 'es']);
  const suggested = /suggested use|建议用途|用途案|제안된 용도|uso sugerido/;
  const unverified = /unverified|尚未验证|未確認|확인되지|no está verificado/;
  for (const [locale, copy] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(copy.filters), catalog.filters.map(filter => filter.id), locale);
    const labels = catalog.items.map(clip => clipName(locale, clip));
    assert.equal(new Set(labels).size, catalog.items.length, locale);
    const strings = [
      JSON.stringify(copy), ...labels, copy.variant('test', '2'), copy.results(20),
    ].join(' ');
    assert.doesNotMatch(strings, /wav|sounds like|seamless loop|punchy|crisp/i, locale);
    assert.match(copy.coins, /reward\.pickup/, locale);
    assert.match(copy.coins, suggested, locale);
    assert.match(copy.metal, /metalClick/, locale);
    assert.match(copy.metal, unverified, locale);
  }
});

test('display metadata preserves the supplied stable asset IDs and event tags', () => {
  const metadata = catalog.items.map(clip => {
    const { id, eventTags } = clipMetadata(clip);
    assert.equal(id, clip.id);
    assert.deepEqual(eventTags, clip.event_tags);
    return [id, eventTags];
  });
  assert.equal(new Set(metadata.map(([id]) => id)).size, 20);
  assert.equal(sha256(JSON.stringify(metadata)), '1c61c95f6954b26639dcc0ff7c4e02075be14ccc2412c2207c21e64ad2f0672b');
});
