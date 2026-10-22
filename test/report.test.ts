import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.ts';
import { DailyReportSchema, RawSnapshotSchema, type DailyReport, type Issue, type RawSnapshot } from '../src/schema.ts';
import type { StarHistory } from '../src/collectors/types.ts';
import { analyzeDate, buildDailyReport, keywordDocs } from '../src/analyze/report.ts';
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
  const cards = toolCards(makeRaw({ tools: [t('old', '2026-09-01T00:00:00Z'), t('none', null), t('a', '2026-10-20T00:00:00Z'), t('b', '2026-10-22T00:00:00Z')] }), { ...config, tools: [] });
  assert.deepEqual(cards.map((c) => c.tool), ['b', 'a', 'old', 'none']);
  assert.deepEqual(cards.map((c) => c.isRecent), [true, true, false, false]);
});

test('toolCards: every configured tool gets a card; a tool without a release is all-null and last', () => {
  const rel = (tool: string, name: string, publishedAt: string | null) => ({ tool, name, version: 'v1', publishedAt, url: `https://e.test/${tool}`, note: null });
  const raw = makeRaw({ tools: [rel('claude-code', 'Claude Code', '2026-09-01T00:00:00Z'), rel('copilot', 'GitHub Copilot', null), rel('cursor', 'Cursor', '2026-10-22T00:00:00Z'), rel('gemini-cli', 'Gemini CLI', '2026-10-01T00:00:00Z')] });
  const cards = toolCards(raw, config);
  assert.deepEqual(cards.map((c) => c.tool).sort(), config.tools.map((t) => t.id).sort());
  const codex = cards.at(-1)!;
  assert.deepEqual(codex, { tool: 'codex', name: 'Codex CLI', version: null, publishedAt: null, url: null, note: null, note_ko: null, isRecent: false });
  assert.equal(cards[0]!.tool, 'cursor');
  assert.equal(cards.at(-2)!.tool, 'copilot');
});

test('keywordDocs: HN, GeekNews, Reddit titles and trending descriptions, never arXiv titles', () => {
  const news = (id: string, source: 'geeknews' | 'reddit', title: string) => ({ id, source, title, url: `https://e.test/${id}`, domain: 'e.test', sub: null, publishedAt: null });
  const raw = makeRaw({
    hn: [hn(1, 'hn title', 'https://e.test/1', 1)],
    geeknews: [news('g', 'geeknews', 'gn title')],
    reddit: [news('r', 'reddit', 'rd title')],
    trending: [{ fullName: 'a/b', url: 'https://github.com/a/b', description: 'repo desc', language: null, stars: 1, starsInPeriod: 1, period: 'daily' }],
    arxiv: [{ id: 'p', title: 'paper title', category: 'cs.AI', url: 'https://arxiv.org/abs/p', publishedAt: '2026-10-22' }],
  });
  assert.deepEqual(keywordDocs(raw).sort(), ['gn title', 'hn title', 'rd title', 'repo desc']);
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
  const real = fixtureRaw.trending.find((t) => t.fullName === 'cloudflare/security-audit-skill')!;
  const cards = kitCards(makeRaw({ trending: [real] }), config);
  assert.equal(cards[0]!.fullName, 'cloudflare/security-audit-skill');
  assert.equal(cards[0]!.kind, 'SKILL');
  const all = kitCards(fixtureRaw, config);
  assert.ok(all.length <= 12);
  assert.equal(new Set(all.map((x) => x.fullName.toLowerCase())).size, all.length);
});

const trend = (fullName: string, description: string | null, stars: number) =>
  ({ fullName, url: `https://github.com/${fullName}`, description, language: null, stars, starsInPeriod: 1, period: 'daily' as const });

test('kitCards R14: agent-only trending excluded; plugin/MCP trending included; search hits come first', () => {
  const raw = makeRaw({
    kit: [{ fullName: 's/search', url: 'https://github.com/s/search', description: 'tiny mcp server', stars: 10, createdAt: null, topics: ['mcp'] }],
    trending: [
      trend('t/agent-only', 'a huge autonomous agent framework', 900000),
      trend('t/plug', 'A Claude Code plugin marketplace', 500000),
      trend('t/mcp', 'bridge via MCP for databases', 400000),
    ],
  });
  const cards = kitCards(raw, config);
  assert.deepEqual(cards.map((c) => c.fullName), ['s/search', 't/plug', 't/mcp']);
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

test('analyzeDate: prev raw, scanNo, 7-daily cap, raw-based keywords, writes file, no history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vr-analyze-'));
  try {
    mkdirSync(join(dir, 'raw'));
    mkdirSync(join(dir, 'daily'));
    const putRaw = (date: string, p: Partial<RawSnapshot>) =>
      writeFileSync(join(dir, 'raw', `${date}.json`), JSON.stringify({ ...fixtureRaw, date, ...p }));
    const gone = { fullName: 'zz/gone', url: 'https://github.com/zz/gone', description: null, language: null, stars: 5, starsInPeriod: 1, period: 'daily' as const };
    const dropped = fixtureRaw.trending[0]!;
    putRaw('2026-10-21', {});
    putRaw('2026-10-22', { trending: [...fixtureRaw.trending.slice(1), gone] });
    putRaw('2026-10-23', {
      hn: [...fixtureRaw.hn, hn(999001, 'Zyxquark released today', 'https://e.test/zyx', 5)],
    });
    // 9 earlier dailies + one dated after the target (must be ignored)
    const dailyDates = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `2026-10-0${d}`);
    dailyDates.forEach((d, i) => {
      const r = { ...prevDaily(d, (i + 1) * 5) };
      writeFileSync(join(dir, 'daily', `${d}.json`), JSON.stringify(r));
    });
    writeFileSync(join(dir, 'daily', '2026-10-30.json'), JSON.stringify(prevDaily('2026-10-30', 100)));

    const r = analyzeDate('2026-10-23', dir);
    assert.equal(r.scanNo, 10);
    assert.equal(r.gauge.daysOfHistory, 7);
    assert.equal(r.gauge.avg7, 30); // last 7 of 5..45 step 5 → 15..45 mean 30
    assert.deepEqual(r.droppedRepos.map((x) => x.fullName), ['zz/gone']);
    assert.deepEqual(r.newRepos.map((x) => x.fullName), [dropped.fullName]);
    const kw = new Map(r.keywords.map((k) => [k.term, k]));
    assert.ok(r.keywords.length > 0);
    assert.ok(!kw.get('claude')?.isNew);
    const written = DailyReportSchema.parse(JSON.parse(readFileSync(join(dir, 'daily', '2026-10-23.json'), 'utf8')));
    assert.equal(written.date, '2026-10-23');
    assert.ok(written.rising.length > 0);
    assert.ok(written.rising.every((x) => x.deltaSource === 'trending-weekly' && x.series.length === 0));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('analyzeDate: isNew keyword when absent from all previous raws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vr-analyze-'));
  try {
    mkdirSync(join(dir, 'raw'));
    writeFileSync(join(dir, 'raw', '2026-10-22.json'), JSON.stringify({ ...fixtureRaw, date: '2026-10-22' }));
    writeFileSync(join(dir, 'raw', '2026-10-23.json'), JSON.stringify({
      ...fixtureRaw, date: '2026-10-23', hn: [hn(999001, 'Zyxquark zyxquark', 'https://e.test/zyx', 5)], geeknews: [], reddit: [], trending: [], arxiv: [],
    }));
    const r = analyzeDate('2026-10-23', dir);
    assert.equal(r.scanNo, 1);
    assert.equal(r.keywords.find((k) => k.term === 'zyxquark')?.isNew, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
