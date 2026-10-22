import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RawSnapshot } from '../src/schema.ts';
import { clusterIssues } from '../src/analyze/cluster.ts';

function makeRaw(p: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    date: '2026-10-23', collectedAt: '2026-10-23T00:00:00Z', mode: 'reduced', sources: [],
    hn: [], trending: [], arxiv: [], geeknews: [], reddit: [], hfModels: [], tools: [], advisories: [], kit: [], stars: {},
    ...p,
  };
}
const hn = (id: number, title: string, url: string, points: number, comments: number) =>
  ({ id, title, url, domain: '', points, comments, hnUrl: `https://news.ycombinator.com/item?id=${id}` });
const news = (id: string, title: string, url: string) =>
  ({ id, source: 'geeknews' as const, title, url, domain: 'news.hada.io', sub: null, publishedAt: null });
const repo = (fullName: string, starsInPeriod: number, period: 'daily' | 'weekly' = 'daily') =>
  ({ fullName, url: `https://github.com/${fullName}`, description: null, language: null, stars: 1000, starsInPeriod, period });

test('clusterIssues merges two HN posts and GeekNews about PHP security release', () => {
  const raw = makeRaw({
    hn: [
      hn(1, 'PHP 8.2.35 security release', 'https://thephp.foundation/blog/2026/php-8-2-35/?utm_source=hn', 120, 40),
      hn(2, "Today's PHP security release, and how we're strengthening it", 'https://www.thephp.foundation/blog/2026/php-8-2-35', 974, 535),
      hn(3, 'Unrelated Zig compiler benchmarks', 'https://example.com/zig', 50, 5),
    ],
    geeknews: [news('g1', 'PHP 8.2.35 보안 릴리즈', 'https://news.hada.io/topic?id=1')],
  });
  const issues = clusterIssues(raw);
  const php = issues.find((i) => i.sources.includes('geeknews'))!;
  assert.deepEqual(php.sources, ['hn', 'geeknews']);
  assert.equal(php.items.length, 3);
  assert.equal(php.title, "Today's PHP security release, and how we're strengthening it");
  assert.equal(php.url, 'https://www.thephp.foundation/blog/2026/php-8-2-35');
  assert.equal(php.heatReason, 'HN 974점 · 댓글 575 · 출처 2곳');
  assert.equal(php.title_ko, null);
  assert.match(php.id, /^[0-9a-f]{10}$/);
  assert.equal(issues.length, 2);
  assert.equal(issues[0], php); // sorted by heat desc
});
test('clusterIssues links HN post to trending repo by github url', () => {
  const raw = makeRaw({
    hn: [hn(1, 'Show HN: my tiny editor', 'https://github.com/Foo/Bar/blob/main/README.md', 200, 30)],
    trending: [repo('foo/bar', 800), repo('foo/barbaz', 10)],
  });
  const issues = clusterIssues(raw);
  assert.equal(issues.length, 2);
  const merged = issues.find((i) => i.sources.includes('trending') && i.sources.includes('hn'))!;
  assert.equal(merged.items.length, 2);
  assert.match(merged.heatReason, /스타 \+800/);
});
test('clusterIssues does not merge on a single shared token', () => {
  const raw = makeRaw({
    hn: [hn(1, 'Rust async runtime internals', 'https://a.com/1', 10, 1), hn(2, 'Rust compiler memory safety', 'https://b.com/2', 10, 1)],
  });
  assert.equal(clusterIssues(raw).length, 2);
});
test('clusterIssues only uses top 10 daily trending repos', () => {
  const trending = [...Array.from({ length: 11 }, (_, i) => repo(`o/r${i}`, 10)), repo('w/weekly', 5, 'weekly')];
  assert.equal(clusterIssues(makeRaw({ trending })).length, 10);
});
test('clusterIssues is empty for an empty snapshot', () => {
  assert.deepEqual(clusterIssues(makeRaw()), []);
});
test('rule (c) needs 3 common tokens when a title is short (no bridging)', () => {
  const raw = makeRaw({
    hn: [
      hn(1, 'Claude Code', 'https://a.com/1', 10, 1),
      hn(2, 'Claude Code leaks source map', 'https://b.com/2', 10, 1),
      hn(3, 'Claude Code pricing change for teams', 'https://c.com/3', 10, 1),
    ],
  });
  assert.equal(clusterIssues(raw).length, 3);
});
test('rule (b) anchors github.com to the hostname', () => {
  const mk = (u: string) => makeRaw({ hn: [hn(1, 'Some post title here', u, 10, 1)], trending: [repo('foo/bar', 5)] });
  assert.equal(clusterIssues(mk('https://gist.github.com/foo/bar')).length, 2);
  assert.equal(clusterIssues(mk('https://notgithub.com/foo/bar')).length, 2);
  assert.equal(clusterIssues(mk('https://github.com/foo/barbaz')).length, 2);
  assert.equal(clusterIssues(mk('https://www.github.com/Foo/Bar/issues/1')).length, 1);
});
test('rule (c) merges across different sources only', () => {
  const raw = makeRaw({
    hn: [hn(1, 'Claude Duet', 'https://a.com/1', 487, 448)],
    reddit: [{ id: 'r1', source: 'reddit', title: 'Anthropic just announced Claude Duet', url: 'https://reddit.com/r/x/1', domain: 'reddit.com', sub: 'x', publishedAt: null }],
  });
  const issues = clusterIssues(raw);
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0]!.sources, ['hn', 'reddit']);
});
