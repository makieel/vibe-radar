import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chat } from '../src/summarize/models.ts';
import { translateBatch } from '../src/summarize/translate.ts';
import { summarizeReport, SYSTEM_PROMPT } from '../src/summarize/summarize.ts';
import { DailyReportSchema, type DailyReport } from '../src/schema.ts';

const real = DailyReportSchema.parse(JSON.parse(readFileSync(new URL('../data/daily/2026-10-23.json', import.meta.url), 'utf8')));

function mkIssue(id: string, n: number) {
  return {
    id, title: `Issue ${n}`, title_ko: null, summary_ko: null, check_ko: null, heat: 50, heatReason: 'x',
    sources: ['hn' as const], url: `https://x.test/${n}`, items: [],
  };
}

function sample(): DailyReport {
  const r = structuredClone(real);
  r.issues = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => mkIssue(id, i));
  r.alerts = [];
  r.tools = [{ tool: 't', name: 'T', version: '1.0', publishedAt: null, url: 'https://t.test', note: 'Fixed bugs', note_ko: null, isRecent: true }];
  r.rising = [{ fullName: 'a/x', url: 'https://github.com/a/x', description: 'A thing', description_ko: null, stars: 5, delta7: 1, deltaSource: 'history', isNew: false, series: [] }];
  r.kit = [];
  return DailyReportSchema.parse(r);
}

test('chat posts to GitHub Models with JSON mode and returns content', async () => {
  let url = ''; let init: RequestInit | undefined;
  const f = async (u: any, i?: RequestInit) => {
    url = String(u); init = i;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }));
  };
  const out = await chat([{ role: 'user', content: 'hi' }], { token: 'tok', fetch: f as any });
  assert.equal(out, '{"ok":1}');
  assert.equal(url, 'https://models.github.ai/inference/chat/completions');
  assert.equal(init!.method, 'POST');
  assert.equal(new Headers(init!.headers).get('authorization'), 'Bearer tok');
  const body = JSON.parse(String(init!.body));
  assert.equal(body.model, 'openai/gpt-4.1-mini');
  assert.equal(body.temperature, 0.2);
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('translateBatch only sends uncached keys', async () => {
  const calls: string[] = [];
  const chatFn = async (m: any) => {
    calls.push(m[1].content);
    return '```json\n{"repo:b/y":"번역 B"}\n```';
  };
  const cache = { 'repo:a/x': '번역 A' };
  const out = await translateBatch([{ key: 'repo:a/x', text: 'A' }, { key: 'repo:b/y', text: 'B' }], cache, chatFn);
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].includes('repo:a/x'));
  assert.equal(out['repo:a/x'], '번역 A');
  assert.equal(out['repo:b/y'], '번역 B');
});

test('translateBatch batches by 40 and skips failed batches', async () => {
  const items = Array.from({ length: 85 }, (_, i) => ({ key: `repo:o/r${i}`, text: `t${i}` }));
  let n = 0;
  const chatFn = async (m: any) => {
    n++;
    if (n === 2) throw new Error('429');
    const sent = JSON.parse(m[1].content) as Record<string, string>;
    return JSON.stringify(Object.fromEntries(Object.keys(sent).map((k) => [k, 'ko'])));
  };
  const out = await translateBatch(items, {}, chatFn);
  assert.equal(n, 3);
  assert.equal(Object.keys(out).length, 45);
  assert.equal(out['repo:o/r0'], 'ko');
  assert.equal(out['repo:o/r40'], undefined);
  assert.equal(out['repo:o/r80'], 'ko');
});

test('translateBatch ignores unknown keys, non-strings, trims and caps', async () => {
  const chatFn = async () => JSON.stringify({ 'repo:a/x': `  ${'가'.repeat(300)}  `, 'repo:zzz': 'x', 'repo:b/y': 5 });
  const out = await translateBatch([{ key: 'repo:a/x', text: 'A' }, { key: 'repo:b/y', text: 'B' }], {}, chatFn);
  assert.equal(out['repo:a/x'].length, 200);
  assert.equal(out['repo:zzz'], undefined);
  assert.equal(out['repo:b/y'], undefined);
});

test('summarizeReport fills top 5 issues and keeps others null', async () => {
  const sys: string[] = [];
  const chatFn = async (m: any) => {
    sys.push(m[0].content);
    if (m[1].content.includes('"issues"') || m[0].content === SYSTEM_PROMPT) {
      if (sys.length === 1) {
        return JSON.stringify({ issues: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, title_ko: `제목 ${id}`, summary_ko: `요약 ${id}`, check_ko: `확인 ${id}` })) });
      }
    }
    return JSON.stringify({ 'repo:a/x': '설명', 'release:t:1.0': '노트' });
  };
  const { report, cache } = await summarizeReport(sample(), {}, chatFn);
  assert.equal(report.issues[0].title_ko, '제목 a');
  assert.equal(report.issues[4].summary_ko, '요약 e');
  assert.equal(report.issues[5].summary_ko, null); // outside top 5
  assert.equal(report.issues[6].title_ko, null);
  assert.equal(report.rising[0].description_ko, '설명');
  assert.equal(report.tools[0].note_ko, '노트');
  assert.equal(cache['repo:a/x'], '설명');
  DailyReportSchema.parse(report);
});

test('chat failure leaves report unchanged and does not throw', async () => {
  const bad = async () => { throw new Error('429'); };
  const s = sample();
  const { report } = await summarizeReport(s, {}, bad);
  assert.equal(report.issues[0].summary_ko, null);
  assert.deepEqual(report, s);
});

test('model returning ids not in report are ignored; fields capped', async () => {
  const chatFn = async () => JSON.stringify({
    issues: [
      { id: 'ghost', title_ko: 'x', summary_ko: 'y', check_ko: 'z' },
      { id: 'a', title_ko: 'T'.repeat(500), summary_ko: 'S'.repeat(900), check_ko: 42 },
    ],
  });
  const s = sample();
  s.rising = []; s.tools = [];
  const { report } = await summarizeReport(s, {}, chatFn);
  assert.equal(report.issues.length, 7);
  assert.equal(report.issues[0].title_ko!.length, 120);
  assert.equal(report.issues[0].summary_ko!.length, 400);
  assert.equal(report.issues[0].check_ko, null);
  assert.equal(report.issues[1].title_ko, null);
});
