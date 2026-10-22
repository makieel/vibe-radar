import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTrendingHtml, trendingCollector } from '../src/collectors/trending.ts';
import { parseGhRelease, parseCopilotFeed, parseCursorChangelog, toolsCollector } from '../src/collectors/tools.ts';
import { parseAdvisories, advisoriesCollector } from '../src/collectors/advisories.ts';
import { parseSearch, kitCollector } from '../src/collectors/kit.ts';
import { starsTargets, starsCollector } from '../src/collectors/stars.ts';
import { ALL_COLLECTORS } from '../src/collectors/index.ts';
import { loadConfig } from '../src/config.ts';
import type { CollectCtx, StarHistory } from '../src/collectors/types.ts';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const ABS = /^https?:\/\//;

function ctxWith(fetchImpl: unknown, over: Partial<CollectCtx> = {}): CollectCtx {
  return {
    mode: 'reduced', token: null, fetch: fetchImpl as typeof fetch, now: new Date('2026-10-22T00:00:00Z'),
    config: loadConfig(), date: '2026-10-22', history: {}, trendingToday: new Set(), ...over,
  };
}
const ok = (body: string) => new Response(body, { status: 200 });
const fail = (status = 500) => new Response('x', { status });

function counting(handler: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  const f = async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    return handler(url);
  };
  return { f, urls };
}

test('parseTrendingHtml daily returns repos with numbers', () => {
  const r = parseTrendingHtml(read('trending-daily.html'), 'daily');
  assert.ok(r.length >= 9);
  assert.ok(r.every(x => /^[\w.-]+\/[\w.-]+$/.test(x.fullName) && x.stars > 0 && x.starsInPeriod > 0 && x.period === 'daily' && ABS.test(x.url)));
  assert.equal(r[0].fullName, 'php/php-src');
  assert.equal(r[0].starsInPeriod, 110);
  assert.equal(r[0].stars, 40909);
  assert.equal(r[0].language, 'C');
  assert.equal(r[0].description, 'The PHP Interpreter');
});

test('parseTrendingHtml weekly reads "stars this week" and skips malformed rows', () => {
  const w = parseTrendingHtml(read('trending-weekly.html'), 'weekly');
  assert.ok(w.length >= 10 && w.every(x => x.period === 'weekly'));
  assert.equal(w[0].starsInPeriod, 129417);
  const bad = '<article class="Box-row"><h2><a href="/">x</a></h2></article><article class="Box-row"><p>nothing</p></article>';
  assert.deepEqual(parseTrendingHtml(bad, 'daily'), []);
  assert.deepEqual(parseTrendingHtml('', 'daily'), []);
});

test('trendingCollector merges daily and weekly; one page failing keeps the other', async () => {
  const { f, urls } = counting(u => (u.includes('since=daily') ? ok(read('trending-daily.html')) : ok(read('trending-weekly.html'))));
  const { data, reduced } = await trendingCollector.run(ctxWith(f));
  assert.equal(reduced, false);
  assert.deepEqual([...urls].sort(), ['https://github.com/trending?since=daily', 'https://github.com/trending?since=weekly']);
  assert.ok(data.some(x => x.period === 'daily') && data.some(x => x.period === 'weekly'));
  const half = counting(u => (u.includes('daily') ? fail() : ok(read('trending-weekly.html'))));
  const r = await trendingCollector.run(ctxWith(half.f));
  assert.ok(r.data.length > 0 && r.data.every(x => x.period === 'weekly'));
  await assert.rejects(trendingCollector.run(ctxWith(async () => fail())));
});

const tool = { id: 'claude-code', name: 'Claude Code', kind: 'github-release' as const, repo: 'anthropics/claude-code' };

test('parseGhRelease picks tag and first bullet note ≤120 chars', () => {
  const r = parseGhRelease(JSON.parse(read('gh-releases-claude-code.json')), tool);
  assert.ok(r);
  assert.equal(r.tool, 'claude-code');
  assert.equal(r.name, 'Claude Code');
  assert.equal(r.version, 'v2.1.308');
  assert.equal(r.publishedAt, '2026-10-22T04:34:55Z');
  assert.equal(r.url, 'https://github.com/anthropics/claude-code/releases/tag/v2.1.308');
  assert.equal(r.note, 'Bug fixes and reliability improvements');
});

test('parseGhRelease truncates long notes, skips drafts/prereleases, tolerates garbage', () => {
  const long = 'x'.repeat(300);
  const r = parseGhRelease([
    { tag_name: 'v9', draft: true, html_url: 'https://github.com/a/b/releases/tag/v9' },
    { tag_name: 'v8', prerelease: true, html_url: 'https://github.com/a/b/releases/tag/v8' },
    null,
    { tag_name: 'v7', published_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/a/b/releases/tag/v7', body: `intro\n\n* **${long}**\n- second` },
  ], tool);
  assert.equal(r?.version, 'v7');
  assert.equal(r?.note?.length, 120);
  assert.equal(parseGhRelease([{ tag_name: 'v1', html_url: 'javascript:alert(1)' }], tool), null);
  assert.equal(parseGhRelease({ message: 'Not Found' }, tool), null);
  assert.equal(parseGhRelease([], tool), null);
  assert.equal(parseGhRelease([{ tag_name: 'v1', html_url: 'https://github.com/a/b/releases/tag/v1', body: 'no list here' }], tool)?.note, null);
});

test('parseCopilotFeed picks first Copilot item, version null', () => {
  const r = parseCopilotFeed(read('copilot-feed.xml'));
  assert.ok(r);
  assert.equal(r.tool, 'copilot');
  assert.equal(r.version, null);
  assert.match(r.url, /^https:\/\/github\.blog\/changelog\//);
  assert.match(r.note ?? '', /Copilot/);
  assert.ok(r.publishedAt && !Number.isNaN(Date.parse(r.publishedAt)));
  assert.equal(parseCopilotFeed('<rss><channel></channel></rss>'), null);
  assert.equal(parseCopilotFeed('not xml <<<'), null);
  const bad = '<rss><channel><item><title>Copilot x</title></item><item><title>Copilot y</title><link>not-a-url</link></item></channel></rss>';
  assert.equal(parseCopilotFeed(bad), null);
});

test('parseCursorChangelog returns first article title/date or null, never throws', () => {
  const r = parseCursorChangelog(read('cursor-changelog.html'));
  assert.ok(r);
  assert.equal(r.tool, 'cursor');
  assert.equal(r.url, 'https://cursor.com/changelog/cloud-agent-canvases-and-environments');
  assert.equal(r.publishedAt, '2026-10-16');
  assert.equal(r.note, 'Cloud Agent Canvases and Environment Improvements');
  assert.equal(r.version, null);
  assert.equal(parseCursorChangelog(''), null);
  assert.equal(parseCursorChangelog('<html><body><article><p>x</p></article></body></html>'), null);
  const v = parseCursorChangelog('<article><time datetime="2026-01-02T00:00:00Z"></time><h1><a href="/changelog/2-0">Cursor 2.0</a></h1></article>');
  assert.equal(v?.version, '2.0');
  assert.equal(v?.url, 'https://cursor.com/changelog/2-0');
});

test('toolsCollector: one failing tool is skipped; reduced mode makes exactly 3 API calls', async () => {
  const { f, urls } = counting(u => {
    if (u.includes('openai/codex')) return fail();
    if (u.startsWith('https://api.github.com/repos/')) return ok(read('gh-releases-claude-code.json'));
    if (u.includes('github.blog')) return ok(read('copilot-feed.xml'));
    return ok(read('cursor-changelog.html'));
  });
  const { data } = await toolsCollector.run(ctxWith(f));
  assert.equal(urls.filter(u => u.startsWith('https://api.github.com/')).length, 3);
  assert.equal(urls.length, 5);
  assert.deepEqual(data.map(d => d.tool).sort(), ['claude-code', 'copilot', 'cursor', 'gemini-cli']);
  await assert.rejects(toolsCollector.run(ctxWith(async () => fail())));
});

test('parseAdvisories maps fields and skips malformed entries', () => {
  const a = parseAdvisories(JSON.parse(read('advisories-pip.json')), 'pip');
  assert.ok(a.length >= 20);
  assert.ok(a.every(x => x.ecosystem === 'pip' && ABS.test(x.url) && x.id && x.summary && x.publishedAt && x.packages.length > 0));
  assert.equal(a[0].id, 'GHSA-cw65-gx24-rc82');
  assert.equal(a[0].severity, 'medium');
  assert.equal(a[0].type, 'reviewed');
  assert.deepEqual(a[0].packages, ['virtualenv']);
  const m = parseAdvisories([null, { ghsa_id: 'X' }, { ghsa_id: 'GHSA-1', summary: 's', html_url: 'https://github.com/advisories/GHSA-1', published_at: '2026-01-01T00:00:00Z', severity: 'unknown', type: 'malware', vulnerabilities: [{ package: { name: 'p' } }, { package: { name: 'p' } }, {}] }], 'npm');
  assert.equal(m.length, 1);
  assert.equal(m[0].severity, 'low');
  assert.equal(m[0].type, 'malware');
  assert.deepEqual(m[0].packages, ['p']);
  assert.deepEqual(parseAdvisories({ message: 'x' }, 'npm'), []);
});

test('advisoriesCollector makes 2 calls (npm, pip) with per_page=30', async () => {
  const { f, urls } = counting(() => ok(read('advisories-pip.json')));
  const { data, reduced } = await advisoriesCollector.run(ctxWith(f));
  assert.equal(reduced, false);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(u => u.includes('per_page=30') && u.includes('/advisories')));
  assert.ok(urls.some(u => u.includes('ecosystem=npm')) && urls.some(u => u.includes('ecosystem=pip')));
  assert.ok(data.length > 0);
  const half = counting(u => (u.includes('npm') ? fail(403) : ok(read('advisories-pip.json'))));
  assert.ok((await advisoriesCollector.run(ctxWith(half.f))).data.length > 0);
  await assert.rejects(advisoriesCollector.run(ctxWith(async () => fail(403))));
});

test('parseSearch maps repos and skips malformed items', () => {
  const r = parseSearch(JSON.parse(read('search-mcp.json')));
  assert.ok(r.length >= 10);
  assert.ok(r.every(x => /^[\w.-]+\/[\w.-]+$/.test(x.fullName) && ABS.test(x.url) && x.stars >= 0 && Array.isArray(x.topics)));
  assert.equal(r[0].fullName, 'tangency-labs/solidcraft');
  assert.equal(r[0].stars, 9140);
  assert.equal(r[0].createdAt, '2026-10-07T18:57:48Z');
  assert.deepEqual(parseSearch({ items: [null, { full_name: 5 }, { full_name: 'a/b' }] }), []);
  assert.deepEqual(parseSearch({}), []);
});

test('kit collector in reduced mode issues exactly 2 search calls', async () => {
  const { f, urls } = counting(() => ok(read('search-mcp.json')));
  const { data, reduced } = await kitCollector.run(ctxWith(f));
  assert.equal(reduced, true);
  assert.equal(urls.length, 2);
  assert.match(decodeURIComponent(urls[0]), /topic:mcp created:>2026-09-22/);
  assert.match(urls[0], /sort=stars/);
  assert.match(urls[0], /per_page=10/);
  assert.ok(urls[1].includes('mcp-server'));
  assert.equal(new Set(data.map(d => d.fullName)).size, data.length);
});

test('kit collector in full mode uses all 5 topics; failed topic skipped; all failed throws', async () => {
  const full = counting(() => ok(read('search-mcp.json')));
  const r = await kitCollector.run(ctxWith(full.f, { mode: 'full', token: 't' }));
  assert.equal(full.urls.length, 5);
  assert.equal(r.reduced, false);
  const part = counting(u => (u.includes('claude-code') ? fail(403) : ok(read('search-mcp.json'))));
  assert.ok((await kitCollector.run(ctxWith(part.f, { mode: 'full', token: 't' }))).data.length > 0);
  await assert.rejects(kitCollector.run(ctxWith(async () => fail(403), { mode: 'full' })));
});

test('starsTargets keeps only repos trending within trackDays and excludes today\'s trending', () => {
  const h: StarHistory = {
    'a/x': { firstSeen: '2026-09-01', lastTrending: '2026-09-15', series: {} },
    'b/y': { firstSeen: '2026-10-10', lastTrending: '2026-10-20', series: {} },
    'c/z': { firstSeen: '2026-10-21', lastTrending: '2026-10-22', series: {} },
  };
  assert.deepEqual(starsTargets(h, '2026-10-22', 30, new Set(['c/z'])), ['b/y']);
});

test('stars collector in reduced mode makes no requests and returns {}', async () => {
  const { f, urls } = counting(() => ok(read('trending-daily.html')));
  const { data, reduced } = await starsCollector.run(ctxWith(f, { trendingToday: new Set(['php/php-src', 'nope/none']) }));
  assert.equal(reduced, true);
  assert.equal(urls.length, 0);
  assert.deepEqual(data, {});
});

test('stars collector in full mode fetches each target once with concurrency ≤5, skips failures', async () => {
  const history: StarHistory = {};
  for (let i = 0; i < 12; i++) history[`o/r${i}`] = { firstSeen: '2026-10-01', lastTrending: '2026-10-15', series: {} };
  history['o/today'] = { firstSeen: '2026-10-01', lastTrending: '2026-10-22', series: {} };
  let inflight = 0;
  let peak = 0;
  const urls: string[] = [];
  const f = async (input: unknown) => {
    const u = String(input);
    urls.push(u);
    inflight++;
    peak = Math.max(peak, inflight);
    await new Promise(r => setTimeout(r, 5));
    inflight--;
    if (u.endsWith('/o/r3')) return fail(404);
    return ok(JSON.stringify({ stargazers_count: 100 }));
  };
  const { data, reduced } = await starsCollector.run(ctxWith(f, { mode: 'full', token: 't', history, trendingToday: new Set(['o/today']) }));
  assert.equal(reduced, false);
  assert.equal(urls.length, 12);
  assert.ok(urls.every(u => u.startsWith('https://api.github.com/repos/o/r')));
  assert.ok(peak <= 5 && peak > 1);
  assert.equal(Object.keys(data).length, 11);
  assert.equal(data['o/r0'], 100);
  assert.equal('o/r3' in data, false);
  await assert.rejects(starsCollector.run(ctxWith(async () => fail(), { mode: 'full', history })));
  assert.deepEqual((await starsCollector.run(ctxWith(async () => { throw new Error('no'); }, { mode: 'full' }))).data, {});
});

test('ALL_COLLECTORS has the 10 sources, stars last', () => {
  assert.equal(ALL_COLLECTORS.length, 10);
  assert.equal(new Set(ALL_COLLECTORS.map(c => c.id)).size, 10);
  assert.equal(ALL_COLLECTORS.at(-1)?.id, 'stars');
});
