import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.ts';
import { DailyReportSchema, RawSnapshotSchema, type DailyReport, type Issue, type RawSnapshot } from '../src/schema.ts';
import type { StarHistory } from '../src/collectors/types.ts';
import { buildDailyReport } from '../src/analyze/report.ts';
import { computeGauge } from '../src/analyze/gauge.ts';
import { pickAlerts } from '../src/analyze/alerts.ts';
import { risingRepos, repoChanges } from '../src/analyze/repos.ts';
import { kitCards } from '../src/analyze/kit.ts';
import { toolCards } from '../src/analyze/tools.ts';

const config = loadConfig();
const fixtureRaw = RawSnapshotSchema.parse(JSON.parse(readFileSync(new URL('./fixtures/raw-sample.json', import.meta.url), 'utf8')));

function makeRaw(p: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    date: '2026-10-23', collectedAt: '2026-10-23T00:00:00Z', mode: 'reduced', sources: [],
    hn: [], trending: [], arxiv: [], geeknews: [], reddit: [], hfModels: [], tools: [], advisories: [], kit: [], stars: {},
    ...p,
  };
}
const hn = (id: number, title: string, url: string, points: number) =>
  ({ id, title, url, domain: '', points, comments: 0, hnUrl: `https://news.ycombinator.com/item?id=${id}` });
const adv = (id: string, over: Partial<RawSnapshot['advisories'][number]> = {}) => ({
  id, summary: `adv ${id}`, severity: 'critical' as const, type: 'reviewed' as const, ecosystem: 'npm',
  packages: ['next'], url: `https://github.com/advisories/${id}`, publishedAt: '2026-10-22T20:00:00Z', ...over,
});
const issue = (heat: number): Issue => ({
  id: `i${heat}`, title: 't', title_ko: null, summary_ko: null, check_ko: null, heat, heatReason: '',
  sources: ['hn'], url: 'https://x.test', items: [],
});
const prevDaily = (date: string, value: number): DailyReport => ({
  ...buildDailyReport({ raw: fixtureRaw, prevRaw: null, previous: [], history: {}, config, scanNo: 1 }),
  date,
  gauge: { value, avg7: null, label: null, daysOfHistory: 0 },
});

test('first day: no previous → gauge label null, daysOfHistory 0, no new/dropped', () => {
  const r = buildDailyReport({ raw: fixtureRaw, prevRaw: null, previous: [], history: {}, config, scanNo: 1 });
  assert.equal(r.gauge.label, null);
  assert.equal(r.gauge.daysOfHistory, 0);
  assert.deepEqual(r.newRepos, []);
  assert.deepEqual(r.droppedRepos, []);
  assert.ok(r.rising.length > 0);
  assert.ok(r.rising.every((x) => x.deltaSource === 'trending-weekly'));
});

test('gauge: value is mean of top 5 heat; empty → 0', () => {
  assert.equal(computeGauge([], []).value, 0);
  assert.equal(computeGauge([100, 90, 80, 70, 60, 10].map(issue), []).value, 80);
});

test('gauge hot when value ≥ avg7+10, calm when ≤ avg7-10, normal between', () => {
  const prev = Array.from({ length: 7 }, (_, i) => prevDaily(`2026-10-${String(10 + i).padStart(2, '0')}`, 60));
  const at = (h: number) => computeGauge(Array(5).fill(h).map(issue), prev);
  assert.equal(at(75).label, 'hot');
  assert.equal(at(70).label, 'hot');
  assert.equal(at(65).label, 'normal');
  assert.equal(at(50).label, 'calm');
  assert.equal(at(75).avg7, 60);
  assert.equal(at(75).daysOfHistory, 7);
  const six = computeGauge([issue(75)], prev.slice(0, 6));
  assert.equal(six.avg7, null);
  assert.equal(six.label, null);
  assert.equal(six.daysOfHistory, 6);
});

test('pickAlerts excludes malware and non-watchlist advisories, caps at 3', () => {
  const raw = makeRaw({
    advisories: [
      adv('GHSA-ok-1'),
      adv('GHSA-mal', { type: 'malware' }),
      adv('GHSA-other', { packages: ['left-pad'] }),
      adv('GHSA-medium', { severity: 'medium' }),
      adv('GHSA-old', { publishedAt: '2026-10-20T00:00:00Z' }),
      adv('GHSA-ok-2', { ecosystem: 'pip', packages: ['litellm'] }),
    ],
  });
  assert.deepEqual(pickAlerts(raw, config).map((a) => a.id), ['GHSA-ok-1', 'GHSA-ok-2']);
  const many = makeRaw({ hn: [1, 2, 3, 4, 5].map((i) => hn(i, `Backdoor found in pkg ${i}`, `https://e.test/${i}`, i)) });
  const alerts = pickAlerts(many, config);
  assert.equal(alerts.length, 3);
  assert.deepEqual(alerts.map((a) => a.id), ['hn-5', 'hn-4', 'hn-3']);
});

test('pickAlerts includes HN post titled "Compromised LiteLLM ... Backdoor"', () => {
  const raw = makeRaw({
    hn: [hn(7, 'Compromised LiteLLM PyPI package carries a Backdoor', 'https://e.test/litellm', 300), hn(8, 'Zig news', 'https://e.test/zig', 900)],
    advisories: [adv('GHSA-dup', { url: 'https://e.test/litellm' })],
  });
  const alerts = pickAlerts(raw, config);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.origin, 'news');
  assert.equal(alerts[0]!.severity, null);
});

test('pickAlerts puts news before advisories', () => {
  const raw = makeRaw({
    hn: [hn(7, 'New CVE-2026-1 exploit', 'https://e.test/a', 10)],
    advisories: [adv('GHSA-ok-1')],
  });
  assert.deepEqual(pickAlerts(raw, config).map((a) => a.origin), ['news', 'advisory']);
});

test('toolCards: recent first, then newest first', () => {
  const t = (tool: string, publishedAt: string | null) => ({ tool, name: tool, version: null, publishedAt, url: `https://e.test/${tool}`, note: null });
  const cards = toolCards(makeRaw({ tools: [t('old', '2026-09-01T00:00:00Z'), t('none', null), t('a', '2026-10-20T00:00:00Z'), t('b', '2026-10-22T00:00:00Z')] }));
  assert.deepEqual(cards.map((c) => c.tool), ['b', 'a', 'old', 'none']);
  assert.deepEqual(cards.map((c) => c.isRecent), [true, true, false, false]);
});

test('risingRepos prefers history delta when 7-day-old point exists', () => {
  const trending = [
    { fullName: 'a/with-history', url: 'https://github.com/a/with-history', description: null, language: null, stars: 1500, starsInPeriod: 10, period: 'daily' as const },
    { fullName: 'a/with-history', url: 'https://github.com/a/with-history', description: null, language: null, stars: 1500, starsInPeriod: 999, period: 'weekly' as const },
    { fullName: 'b/weekly-only', url: 'https://github.com/b/weekly-only', description: null, language: null, stars: 900, starsInPeriod: 50, period: 'weekly' as const },
    { fullName: 'c/daily-only', url: 'https://github.com/c/daily-only', description: null, language: null, stars: 900, starsInPeriod: 50, period: 'daily' as const },
  ];
  const history: StarHistory = {
    'a/with-history': { firstSeen: '2026-10-10', lastTrending: '2026-10-23', series: { '2026-10-16': 1000, '2026-10-20': 1300, '2026-10-23': 1500 } },
  };
  const rising = risingRepos(makeRaw({ trending }), history);
  assert.deepEqual(rising.map((r) => r.fullName), ['a/with-history', 'b/weekly-only']);
  assert.equal(rising[0]!.delta7, 500);
  assert.equal(rising[0]!.deltaSource, 'history');
  assert.equal(rising[1]!.deltaSource, 'trending-weekly');
  assert.equal(rising[1]!.delta7, 50);
  assert.equal(rising[0]!.series.length, 3);
});

test('repoChanges compares trending sets; null prev → empty', () => {
  const r = (fullName: string, period: 'daily' | 'weekly' = 'daily') =>
    ({ fullName, url: `https://github.com/${fullName}`, description: null, language: null, stars: 1, starsInPeriod: 1, period });
  const today = makeRaw({ trending: [r('a/a'), r('b/b', 'weekly')] });
  const prev = makeRaw({ trending: [r('b/b'), r('c/c')] });
  const ch = repoChanges(today, prev);
  assert.deepEqual(ch.newRepos.map((x) => x.fullName), ['a/a']);
  assert.deepEqual(ch.droppedRepos.map((x) => x.fullName), ['c/c']);
  assert.deepEqual(repoChanges(today, null), { newRepos: [], droppedRepos: [] });
});

test('kitCards classifies cloudflare/security-audit-skill as SKILL', () => {
  const cards = kitCards(fixtureRaw, config);
  const c = cards.find((x) => x.fullName === 'cloudflare/security-audit-skill');
  assert.ok(c);
  assert.equal(c.kind, 'SKILL');
  const stars = cards.map((x) => x.stars);
  assert.deepEqual(stars, [...stars].sort((a, b) => b - a));
  assert.equal(new Set(cards.map((x) => x.fullName.toLowerCase())).size, cards.length);
});

test('kitCards kind order: MCP before SKILL, CLI/AGENT/OTHER', () => {
  const k = (fullName: string, description: string, topics: string[] = []) =>
    ({ fullName, url: `https://github.com/${fullName}`, description, stars: 100, createdAt: '2026-10-20T00:00:00Z', topics });
  const cards = kitCards(makeRaw({ kit: [
    k('a/one', 'mcp skill pack'), k('a/two', 'my cursor-rules collection'), k('a/three', 'a cli for things'),
    k('a/four', 'autonomous agent runner'), k('a/five', 'a client library', ['claude-code']),
  ] }), config);
  const kinds = Object.fromEntries(cards.map((c) => [c.fullName, c.kind]));
  assert.deepEqual(kinds, { 'a/one': 'MCP', 'a/two': 'RULES', 'a/three': 'CLI', 'a/four': 'AGENT', 'a/five': 'OTHER' });
  assert.ok(cards.every((c) => c.isNew));
});

test('buildDailyReport output passes schema and keeps top 30 issues, no placeholders', () => {
  const r = buildDailyReport({ raw: fixtureRaw, prevRaw: null, previous: [], history: {}, config, scanNo: 1 });
  DailyReportSchema.parse(r);
  assert.ok(r.issues.length <= 30);
  assert.ok(r.feeds.hn.length <= 30);
  const pts = r.feeds.hn.map((x) => x.points);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  const counts = r.paperCategories.map((c) => c.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.ok(r.issues.every((i) => i.title_ko === null && i.summary_ko === null && i.check_ko === null));
  assert.ok(r.keywords.every((k) => k.avg7 === null));
});
