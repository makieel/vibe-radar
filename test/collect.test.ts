import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCollectors, updateStarHistory } from '../src/collectors/run.ts';
import type { CollectCtx, Collector, StarHistory } from '../src/collectors/types.ts';
import { RawSnapshotSchema, type RawSnapshot } from '../src/schema.ts';
import { loadConfig } from '../src/config.ts';

const ctx = (): CollectCtx => ({
  mode: 'reduced', token: null, fetch, now: new Date('2026-10-22T00:00:00Z'),
  config: loadConfig(), date: '2026-10-22', history: {}, trendingToday: new Set(),
});
const hnItem = (id: number) => ({ id, title: `t${id}`, url: 'https://a.com', domain: 'a.com', points: 1, comments: 0, hnUrl: 'https://news.ycombinator.com/item?id=1' });
const repo = (fullName: string, stars: number, period: 'daily' | 'weekly' = 'daily') =>
  ({ fullName, url: `https://github.com/${fullName}`, description: null, language: null, stars, starsInPeriod: 5, period });

const okHn: Collector<'hn'> = { id: 'hn', key: 'hn', run: async () => ({ data: [hnItem(1), hnItem(2)], reduced: false }) };
const throwingReddit: Collector<'reddit'> = { id: 'reddit', key: 'reddit', run: async () => { throw new Error('boom'); } };
const emptyTrending: Collector<'trending'> = { id: 'trending', key: 'trending', run: async () => ({ data: [], reduced: false }) };

test('one throwing collector does not stop others', async () => {
  const { snapshot } = await runCollectors([okHn, throwingReddit], ctx(), {});
  assert.equal(snapshot.hn.length, 2);
  assert.deepEqual(snapshot.reddit, []);
  const reddit = snapshot.sources.find(s => s.id === 'reddit')!;
  assert.equal(reddit.ok, false);
  assert.equal(reddit.error, 'boom');
  assert.equal(snapshot.sources.find(s => s.id === 'hn')!.count, 2);
});

test('failIds forces failure with message and skips the run', async () => {
  let ran = false;
  const spy: Collector<'hn'> = { id: 'hn', key: 'hn', run: async () => { ran = true; return { data: [hnItem(1)], reduced: false }; } };
  const { snapshot } = await runCollectors([spy], ctx(), { failIds: new Set(['hn']) });
  assert.equal(ran, false);
  const s = snapshot.sources[0];
  assert.equal(s.ok, false);
  assert.equal(s.error, 'forced failure');
  assert.deepEqual(snapshot.hn, []);
});

test('trending returning [] is recorded as parsed 0 items', async () => {
  const { snapshot } = await runCollectors([emptyTrending], ctx(), {});
  assert.equal(snapshot.sources[0].ok, false);
  assert.equal(snapshot.sources[0].error, 'parsed 0 items');
});

test('empty arxiv is still ok (rule applies to trending/hn/tools only)', async () => {
  const arxiv: Collector<'arxiv'> = { id: 'arxiv', key: 'arxiv', run: async () => ({ data: [], reduced: false }) };
  const { snapshot } = await runCollectors([arxiv], ctx(), {});
  assert.equal(snapshot.sources[0].ok, true);
  assert.equal(snapshot.sources[0].count, 0);
});

test('timeout marks collector failed', async () => {
  const slow: Collector<'reddit'> = { id: 'reddit', key: 'reddit', run: () => new Promise(() => {}) };
  const { snapshot } = await runCollectors([slow], ctx(), { timeoutMs: 20 });
  assert.equal(snapshot.sources[0].ok, false);
  assert.match(snapshot.sources[0].error!, /timeout/);
});

test('stars runs last with trendingToday filled and count = key count', async () => {
  let seen: string[] = [];
  const trending: Collector<'trending'> = { id: 'trending', key: 'trending', run: async () => ({ data: [repo('a/b', 10)], reduced: false }) };
  const stars: Collector<'stars'> = { id: 'stars', key: 'stars', run: async c => { seen = [...c.trendingToday]; return { data: { 'x/y': 5, 'z/w': 6 }, reduced: false }; } };
  const { snapshot } = await runCollectors([stars, trending], ctx(), {});
  assert.deepEqual(seen, ['a/b']);
  assert.equal(snapshot.sources[snapshot.sources.length - 1].id, 'stars');
  assert.equal(snapshot.sources[snapshot.sources.length - 1].count, 2);
});

test('snapshot passes RawSnapshotSchema', async () => {
  const { snapshot } = await runCollectors([okHn, throwingReddit, emptyTrending], ctx(), {});
  assert.doesNotThrow(() => RawSnapshotSchema.parse(snapshot));
});

function snap(date: string, over: Partial<RawSnapshot>): RawSnapshot {
  return { date, collectedAt: '', mode: 'reduced', sources: [], hn: [], trending: [], arxiv: [], geeknews: [], reddit: [], hfModels: [], tools: [], advisories: [], kit: [], stars: {}, ...over };
}

test('updateStarHistory sets firstSeen once and appends series', () => {
  const h1 = updateStarHistory({}, snap('2026-10-21', { trending: [repo('a/b', 100)] }));
  assert.deepEqual(h1['a/b'], { firstSeen: '2026-10-21', lastTrending: '2026-10-21', series: { '2026-10-21': 100 } });
  const h2 = updateStarHistory(h1, snap('2026-10-22', { trending: [repo('a/b', 150)], stars: { 'a/b': 160 } }));
  assert.equal(h2['a/b'].firstSeen, '2026-10-21');
  assert.equal(h2['a/b'].lastTrending, '2026-10-22');
  assert.deepEqual(h2['a/b'].series, { '2026-10-21': 100, '2026-10-22': 160 });
  assert.equal(h1['a/b'].lastTrending, '2026-10-21', 'input not mutated');
});

test('updateStarHistory prefers daily entry and keeps non-trending repos untouched', () => {
  const prev: StarHistory = { 'old/r': { firstSeen: '2026-10-01', lastTrending: '2026-10-01', series: { '2026-10-01': 1 } } };
  const h = updateStarHistory(prev, snap('2026-10-22', { trending: [repo('a/b', 200, 'weekly'), repo('a/b', 190, 'daily')] }));
  assert.equal(h['a/b'].series['2026-10-22'], 190);
  assert.equal(h['old/r'].lastTrending, '2026-10-01');
  assert.deepEqual(h['old/r'].series, { '2026-10-01': 1 });
});
