import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHnItem, hnCollector } from '../src/collectors/hn.ts';
import { parseGeekNewsRss } from '../src/collectors/geeknews.ts';
import { parseRedditRss, redditCollector } from '../src/collectors/reddit.ts';
import { parseArxivAtom, arxivCollector } from '../src/collectors/arxiv.ts';
import { parseHfModels } from '../src/collectors/huggingface.ts';
import { loadConfig } from '../src/config.ts';
import type { CollectCtx } from '../src/collectors/types.ts';

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

function ctxWith(fetchImpl: unknown): CollectCtx {
  return {
    mode: 'reduced', token: null, fetch: fetchImpl as typeof fetch, now: new Date('2026-10-22T00:00:00Z'),
    config: loadConfig(), date: '2026-10-22', history: {}, trendingToday: new Set(),
  };
}

test('parseGeekNewsRss returns items with absolute urls', () => {
  const items = parseGeekNewsRss(read('geeknews.xml'));
  assert.ok(items.length >= 10);
  assert.ok(items.every(i => i.source === 'geeknews' && /^https?:\/\//.test(i.url) && i.title.length > 0));
  assert.equal(items[0].title, '외벽 비상계단은 어쩌다 사라졌을까?');
  assert.equal(items[0].domain, 'news.hada.io');
});

test('parseRedditRss sets sub and reddit domain', () => {
  const items = parseRedditRss(read('reddit-claudeai.xml'), 'ClaudeAI');
  assert.ok(items.length >= 10);
  assert.equal(items[0].sub, 'ClaudeAI');
  assert.equal(items[0].domain, 'reddit.com');
  assert.equal(items[0].source, 'reddit');
  assert.equal(items[0].title, 'I replaced my Samsung TV’s home screen with Claude Code');
  assert.match(items[0].url, /^https:\/\/www\.reddit\.com\/r\/ClaudeAI\/comments\//);
});

test('parseArxivAtom extracts id like 2610.xxxxx and primary category', () => {
  const papers = parseArxivAtom(read('arxiv.xml'));
  assert.equal(papers.length, 20);
  assert.ok(papers.every(p => /^\d{4}\.\d{4,5}$/.test(p.id) && p.title.length > 0 && p.category.length > 0));
  assert.equal(papers[0].id, '2610.30136');
  assert.equal(papers[0].category, 'cs.RO');
  assert.equal(papers[0].publishedAt, '2026-10-21T17:59:56Z');
});

test('parseHnItem returns null for job/comment, maps story', () => {
  assert.equal(parseHnItem({ type: 'job', id: 1, title: 'x' }), null);
  assert.equal(parseHnItem({ type: 'comment', id: 2 }), null);
  const s = parseHnItem(JSON.parse(read('hn-item-50194938.json')))!;
  assert.equal(s.domain, 'crystal-lang.org');
  assert.equal(s.points, 49);
  assert.equal(s.comments, 17);
  assert.equal(s.hnUrl, 'https://news.ycombinator.com/item?id=50194938');
});

test('parseHnItem uses hnUrl when story has no url (Ask HN)', () => {
  const s = parseHnItem({ type: 'story', id: 7, title: 'Ask HN: x?', score: 3, descendants: 1 })!;
  assert.equal(s.url, 'https://news.ycombinator.com/item?id=7');
  assert.equal(s.domain, 'news.ycombinator.com');
});

test('parseHfModels maps fixture', () => {
  const models = parseHfModels(JSON.parse(read('hf-trending.json')));
  assert.ok(models.length > 0);
  assert.equal(models[0].id, 'deepseek-ai/DeepSeek-V4.1-Flash-1017');
  assert.equal(models[0].url, 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017');
  assert.equal(models[0].pipeline, 'image-text-to-text');
  assert.equal(parseHfModels({}).length, 0);
});

test('hnCollector.run fetches top 30 via injected fetch', async () => {
  const top = JSON.parse(read('hn-top.json')) as number[];
  const items: Record<string, string> = {
    '50194938': read('hn-item-50194938.json'),
    '50195110': read('hn-item-50195110.json'),
    '50195543': read('hn-item-50195543.json'),
  };
  const seen: string[] = [];
  const fake = async (url: string) => {
    seen.push(url);
    if (url.endsWith('topstories.json')) return new Response(JSON.stringify(top));
    const id = /item\/(\d+)\.json/.exec(url)![1];
    return new Response(items[id] ?? JSON.stringify({ type: 'job', id: Number(id) }));
  };
  const { data, reduced } = await hnCollector.run(ctxWith(fake));
  assert.equal(reduced, false);
  assert.equal(seen.length, 31);
  assert.equal(data.length, 3);
});

test('redditCollector.run: one failing sub keeps only the successful sub items', async () => {
  const urls: string[] = [];
  const fake = async (url: string) => {
    urls.push(url);
    if (url.includes('/r/vibecoding/')) return new Response('no', { status: 500 });
    return new Response(read('reddit-claudeai.xml'));
  };
  const expected = parseRedditRss(read('reddit-claudeai.xml'), 'ClaudeAI').length;
  const { data } = await redditCollector.run(ctxWith(fake));
  assert.deepEqual(urls.sort(), [
    'https://www.reddit.com/r/ClaudeAI/top/.rss?t=day',
    'https://www.reddit.com/r/vibecoding/top/.rss?t=day',
  ]);
  assert.equal(data.length, expected);
  assert.ok(data.every(i => i.sub === 'ClaudeAI'));
});

test('redditCollector.run throws when every sub fails', async () => {
  const fake = async () => new Response('no', { status: 500 });
  await assert.rejects(redditCollector.run(ctxWith(fake)));
});

test('hnCollector.run survives one failing item fetch', async () => {
  const fake = async (url: string) => {
    if (url.endsWith('topstories.json')) return new Response(JSON.stringify([1, 2, 3]));
    if (url.endsWith('/2.json')) return new Response('boom', { status: 500 });
    if (url.endsWith('/3.json')) return new Response('not json');
    return new Response(JSON.stringify({ type: 'story', id: 1, title: 'ok', url: 'https://a.example/x', score: 1, descendants: 0 }));
  };
  const { data } = await hnCollector.run(ctxWith(fake));
  assert.deepEqual(data.map(d => d.id), [1]);
});

test('hnCollector.run throws when topstories or every item fails', async () => {
  await assert.rejects(hnCollector.run(ctxWith(async () => new Response('x', { status: 500 }))));
  const fake = async (url: string) =>
    url.endsWith('topstories.json') ? new Response('[1,2]') : new Response('x', { status: 500 });
  await assert.rejects(hnCollector.run(ctxWith(fake)));
});

test('parseHnItem falls back to hnUrl for non-http url', () => {
  const s = parseHnItem({ type: 'story', id: 9, title: 't', url: 'javascript:alert(1)' })!;
  assert.equal(s.url, 'https://news.ycombinator.com/item?id=9');
});

const atom = (entries: string) => '<feed xmlns="http://www.w3.org/2005/Atom">' + entries + '</feed>';
const BAD = [
  '<entry><id>a</id><title>no link</title></entry>',
  '<entry><id>b</id><link href="https://x.example/b"/></entry>',
  '<entry><id>c</id><title>bad scheme</title><link href="javascript:alert(1)"/></entry>',
].join('');
const GOOD = '<entry><id>g</id><title>good</title><link href="https://x.example/g"/></entry>';

test('GeekNews/Reddit parsers skip malformed entries', () => {
  assert.deepEqual(parseGeekNewsRss(atom(BAD + GOOD)).map(i => i.title), ['good']);
  assert.deepEqual(parseRedditRss(atom(BAD + GOOD), 'S').map(i => i.title), ['good']);
});

test('parseArxivAtom skips entries without id/title and fixes non-http link', () => {
  const xml = atom(
    '<entry><id>http://arxiv.org/abs/2610.00001v1</id><link href="ftp://x"/></entry>' +
    '<entry><id>http://arxiv.org/abs/2610.00002v1</id><title>t2</title><link href="ftp://x"/><published>2026-10-21T00:00:00Z</published></entry>' +
    '<entry><id>junk</id><title>t3</title></entry>',
  );
  const p = parseArxivAtom(xml);
  assert.equal(p.length, 1);
  assert.equal(p[0].id, '2610.00002');
  assert.equal(p[0].url, 'https://arxiv.org/abs/2610.00002');
});

test('arxivCollector.run builds the expected query', async () => {
  let called = '';
  const fake = async (url: string) => { called = url; return new Response(read('arxiv.xml')); };
  const ctx = ctxWith(fake);
  const { data } = await arxivCollector.run(ctx);
  assert.equal(data.length, 20);
  assert.ok(called.includes('search_query=cat%3Acs.*%20OR%20cat%3Astat.ML'));
  assert.ok(called.includes(`max_results=${ctx.config.arxivMax}`));
  assert.ok(called.includes('sortBy=submittedDate&sortOrder=descending'));
});
