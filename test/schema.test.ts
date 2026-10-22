import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DailyReportSchema, RawSnapshotSchema, SiteIndexSchema } from '../src/schema.ts';

function emptyReport() {
  return { schemaVersion: 1, date: '2026-10-22', collectedAt: '2026-10-22T00:05:00Z', mode: 'reduced', scanNo: 1,
    sources: [], gauge: { value: 0, avg7: null, label: null, daysOfHistory: 0 }, issues: [], alerts: [], tools: [],
    rising: [], newRepos: [], droppedRepos: [], kit: [], keywords: [], papers: [], paperCategories: [], hfModels: [],
    feeds: { hn: [], geeknews: [], reddit: [] } };
}

test('DailyReportSchema accepts minimal empty report', () => {
  assert.ok(DailyReportSchema.safeParse(emptyReport()).success);
});

test('DailyReportSchema rejects heat out of 0..100', () => {
  const issue = { id: 'a', title: 't', title_ko: null, summary_ko: null, check_ko: null, heat: 120, heatReason: 'r',
    sources: ['hn'], url: 'https://example.com', items: [] };
  const r = { ...emptyReport(), issues: [issue] };
  assert.equal(DailyReportSchema.safeParse(r).success, false);
  r.issues[0] = { ...issue, heat: 80 };
  assert.ok(DailyReportSchema.safeParse(r).success);
});

test('DailyReportSchema rejects gauge.value out of 0..100 and wrong schemaVersion', () => {
  const r = emptyReport();
  assert.equal(DailyReportSchema.safeParse({ ...r, gauge: { ...r.gauge, value: 101 } }).success, false);
  assert.equal(DailyReportSchema.safeParse({ ...r, schemaVersion: 2 }).success, false);
});

test('RawSnapshotSchema accepts empty snapshot', () => {
  const s = { date: '2026-10-22', collectedAt: '2026-10-22T00:05:00Z', mode: 'full', sources: [], hn: [], trending: [],
    arxiv: [], geeknews: [], reddit: [], hfModels: [], tools: [], advisories: [], kit: [], stars: { 'a/b': 3 } };
  assert.ok(RawSnapshotSchema.safeParse(s).success);
  assert.equal(RawSnapshotSchema.safeParse({ ...s, mode: 'other' }).success, false);
});

test('SiteIndexSchema', () => {
  assert.ok(SiteIndexSchema.safeParse({ latest: null, dates: [] }).success);
  assert.ok(SiteIndexSchema.safeParse({ latest: '2026-10-22', dates: ['2026-10-22', '2026-10-21'] }).success);
  assert.equal(SiteIndexSchema.safeParse({ latest: 5, dates: [] }).success, false);
});
