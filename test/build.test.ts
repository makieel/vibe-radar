import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportSite } from '../src/cli/build.ts';
import { resolveServePath, contentType } from '../src/cli/serve.ts';
import { DailyReportSchema } from '../src/schema.ts';

const REAL_RAW = 'data/raw/2026-10-23.json';
const REAL_DAILY = 'data/daily/2026-10-23.json';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'vr-build-'));
}

/** 실제 daily를 날짜만 바꿔 복제한다. */
function dailyFor(date: string, extra: Record<string, unknown> = {}): string {
  const d = JSON.parse(readFileSync(REAL_DAILY, 'utf8'));
  return JSON.stringify({ ...d, date, ...extra });
}

function setup(dailyDates: string[]): { dataDir: string; outDir: string; cleanup: () => void } {
  const root = tmp();
  const dataDir = join(root, 'data');
  mkdirSync(join(dataDir, 'daily'), { recursive: true });
  for (const d of dailyDates) writeFileSync(join(dataDir, 'daily', `${d}.json`), dailyFor(d));
  return { dataDir, outDir: join(root, 'out'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('exportSite writes latest/index/days and keeps newest first', () => {
  const t = setup(['2026-10-21', '2026-10-23', '2026-10-22']);
  try {
    const idx = exportSite({ dataDir: t.dataDir, outDir: t.outDir, today: '2026-10-23' });
    assert.deepEqual(idx, { latest: '2026-10-23', dates: ['2026-10-23', '2026-10-22', '2026-10-21'] });
    assert.deepEqual(JSON.parse(readFileSync(join(t.outDir, 'index.json'), 'utf8')), idx);
    const latest = DailyReportSchema.parse(JSON.parse(readFileSync(join(t.outDir, 'latest.json'), 'utf8')));
    assert.equal(latest.date, '2026-10-23');
    assert.deepEqual(readdirSync(join(t.outDir, 'days')).sort(), ['2026-10-21.json', '2026-10-22.json', '2026-10-23.json']);
  } finally { t.cleanup(); }
});

test('exportSite with no daily writes empty index and no latest.json', () => {
  const t = setup([]);
  try {
    const idx = exportSite({ dataDir: t.dataDir, outDir: t.outDir, today: '2026-10-23' });
    assert.deepEqual(idx, { latest: null, dates: [] });
    assert.deepEqual(JSON.parse(readFileSync(join(t.outDir, 'index.json'), 'utf8')), { latest: null, dates: [] });
    assert.equal(existsSync(join(t.outDir, 'latest.json')), false);
  } finally { t.cleanup(); }
});

test('exportSite does not overwrite existing daily (keeps summary_ko)', () => {
  const t = setup([]);
  try {
    mkdirSync(join(t.dataDir, 'raw'), { recursive: true });
    copyFileSync(REAL_RAW, join(t.dataDir, 'raw', '2026-10-23.json'));
    const base = JSON.parse(dailyFor('2026-10-23'));
    const marked = { ...base, issues: base.issues.map((i: object, n: number) => (n === 0 ? { ...i, summary_ko: '보존되어야 하는 요약' } : i)) };
    writeFileSync(join(t.dataDir, 'daily', '2026-10-23.json'), JSON.stringify(marked));
    exportSite({ dataDir: t.dataDir, outDir: t.outDir, today: '2026-10-23' });
    const out = JSON.parse(readFileSync(join(t.outDir, 'days', '2026-10-23.json'), 'utf8'));
    assert.equal(out.issues[0].summary_ko, '보존되어야 하는 요약');
  } finally { t.cleanup(); }
});

test('exportSite analyzes raw dates that lack a daily', () => {
  const t = setup([]);
  try {
    mkdirSync(join(t.dataDir, 'raw'), { recursive: true });
    copyFileSync(REAL_RAW, join(t.dataDir, 'raw', '2026-10-23.json'));
    const idx = exportSite({ dataDir: t.dataDir, outDir: t.outDir, today: '2026-10-23' });
    assert.deepEqual(idx.dates, ['2026-10-23']);
    assert.ok(existsSync(join(t.dataDir, 'daily', '2026-10-23.json')));
    assert.ok(existsSync(join(t.outDir, 'days', '2026-10-23.json')));
  } finally { t.cleanup(); }
});

test('exportSite drops days older than 90', () => {
  const t = setup(['2026-07-26', '2026-07-25', '2026-10-23']);
  try {
    // 2026-10-23 기준 89일 전은 2026-07-26(포함), 90일 전은 2026-07-25(제외)
    mkdirSync(join(t.outDir, 'days'), { recursive: true });
    writeFileSync(join(t.outDir, 'days', '2026-01-01.json'), '{}');
    const idx = exportSite({ dataDir: t.dataDir, outDir: t.outDir, today: '2026-10-23' });
    assert.deepEqual(idx.dates, ['2026-10-23', '2026-07-26']);
    assert.deepEqual(readdirSync(join(t.outDir, 'days')).sort(), ['2026-07-26.json', '2026-10-23.json']);
  } finally { t.cleanup(); }
});

test('invalid daily file fails build with file name in error', () => {
  const t = setup(['2026-10-23']);
  try {
    writeFileSync(join(t.dataDir, 'daily', '2026-10-22.json'), JSON.stringify({ schemaVersion: 1 }));
    assert.throws(() => exportSite({ dataDir: t.dataDir, outDir: t.outDir, today: '2026-10-23' }), /2026-10-22\.json/);
  } finally { t.cleanup(); }
});

test('resolveServePath maps / to index.html and blocks traversal', () => {
  const root = join(tmpdir(), 'vr-root');
  assert.deepEqual(resolveServePath(root, '/'), { ok: true, path: join(root, 'index.html') });
  assert.deepEqual(resolveServePath(root, '/data/latest.json?x=1'), { ok: true, path: join(root, 'data', 'latest.json') });
  for (const bad of ['/../secret', '/%2e%2e/secret', '/%2E%2E%2Fsecret', '/a/../../b', '/..\\x', 'C:\\Windows\\win.ini', '/%00', '/%E0%A4%A']) {
    assert.deepEqual(resolveServePath(root, bad), { ok: false, status: 403 }, bad);
  }
});

test('contentType covers served extensions', () => {
  assert.match(contentType('a.html'), /^text\/html/);
  assert.match(contentType('a.js'), /^text\/javascript/);
  assert.match(contentType('a.css'), /^text\/css/);
  assert.match(contentType('a.json'), /^application\/json/);
  assert.equal(contentType('a.svg'), 'image/svg+xml');
  assert.equal(contentType('a.png'), 'image/png');
  assert.equal(contentType('a.ico'), 'image/x-icon');
  assert.equal(contentType('a.bin'), 'application/octet-stream');
});
