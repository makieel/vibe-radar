import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fmt from '../../core/format.js';
import theme from './render.js';

const sample = JSON.parse(readFileSync(new URL('../../../test/fixtures/daily-sample.json', import.meta.url), 'utf8'));
const VIEWS = ['briefing', 'tools', 'kit', 'repos', 'papers', 'sources'];

function ctx(report, over = {}) {
  return {
    report,
    index: { latest: report.date, dates: [report.date, '2026-10-22'] },
    route: { view: 'briefing', date: null, params: {} },
    mode: 'dark',
    notice: null,
    fmt,
    ...over,
  };
}
const draw = (r, over) => theme.render(ctx(r, over));
const clone = () => structuredClone(sample);

test('exports name and render', () => {
  assert.equal(theme.name, 'aurora-hud');
  assert.equal(typeof theme.render, 'function');
});

test('escapes hostile titles', () => {
  const r = clone();
  r.issues[0].title = '<img src=x onerror=alert(1)>';
  const html = draw(r);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});

test('hostile urls become # and external links open safely', () => {
  const r = clone();
  r.issues[0].url = 'javascript:alert(1)';
  r.tools[0].url = 'javascript:alert(2)';
  const html = draw(r);
  assert.ok(!html.includes('javascript:'));
  const external = html.match(/<a [^>]*href="https?:[^"]*"[^>]*>/g) ?? [];
  assert.ok(external.length > 5);
  for (const a of external) assert.ok(a.includes('target="_blank"') && a.includes('rel="noopener"'), a);
});

test('no alerts → no alert band markup', () => {
  const r = clone();
  r.alerts = [];
  assert.ok(!draw(r).includes('class="hud alert'));
});

test('each alert gets its own line in the band', () => {
  const html = draw(clone());
  assert.ok(html.includes('class="hud alert'));
  for (const a of sample.alerts) assert.ok(html.includes(fmt.esc(a.title)), a.title);
  assert.equal((html.match(/class="aline"/g) ?? []).length, sample.alerts.length);
});

test('gauge null label shows 기록 쌓는 중 (0/7일)', () => {
  const html = draw(clone());
  assert.ok(html.includes('기록 쌓는 중 (0/7일)'));
  assert.ok(html.includes('stroke-dashoffset="147.58"')); // 314 * (1 - 53/100)
  assert.ok(html.includes(fmt.esc(sample.issues[0].heatReason)));
});

test('gauge labels follow label value', () => {
  const r = clone();
  for (const [label, text] of [['hot', '평소보다 뜨거움'], ['normal', '평소 수준'], ['calm', '조용한 편']]) {
    r.gauge = { value: 80, avg7: 64, label, daysOfHistory: 7 };
    const html = draw(r);
    assert.ok(html.includes(text), label);
    assert.ok(!html.includes('기록 쌓는 중'));
  }
});

test('falls back to original title when title_ko null', () => {
  const r = clone();
  r.issues[0].title = 'Original Headline';
  r.issues[0].title_ko = null;
  assert.ok(draw(r).includes('Original Headline'));
  r.issues[0].title_ko = '한국어 제목';
  const html = draw(r);
  assert.ok(html.includes('한국어 제목'));
});

test('lead shows item list without summary, summary and check when present', () => {
  const r = clone();
  let html = draw(r);
  assert.ok(html.includes('class="items"'));
  assert.ok(html.includes('HN · 487점 · 댓글 448'));
  assert.ok(!html.includes('바이브코더 체크'));
  r.issues[0].summary_ko = '요약 문장이에요.';
  r.issues[0].check_ko = '버전을 확인하세요.';
  html = draw(r);
  assert.ok(html.includes('요약 문장이에요.'));
  assert.ok(!html.includes('class="items"'));
  assert.ok(html.includes('바이브코더 체크'));
  assert.ok(html.includes('버전을 확인하세요.'));
});

test('issues 2-4 become shortcuts', () => {
  const html = draw(clone());
  for (const i of sample.issues.slice(1, 4)) assert.ok(html.includes(fmt.esc(i.title)), i.title);
  assert.ok(html.includes('<b>02</b>') && html.includes('<b>04</b>') && !html.includes('<b>05</b>'));
});

test('no issues → empty message', () => {
  const r = clone();
  r.issues = [];
  assert.ok(draw(r).includes('오늘은 아직 모인 이슈가 없어요'));
});

test('three panels show five rows each with more links', () => {
  const r = clone();
  const html = draw(r);
  for (const t of r.tools.slice(0, 5)) assert.ok(html.includes(fmt.esc(t.name)));
  for (const x of r.rising.slice(0, 5)) assert.ok(html.includes(fmt.esc(x.fullName)));
  assert.ok(!html.includes(fmt.esc(r.rising[5].fullName)));
  assert.ok(html.includes(fmt.signed(r.rising[0].delta7)));
  for (const k of r.kit.slice(0, 5)) assert.ok(html.includes(fmt.esc(k.fullName.split('/')[1])));
  for (const v of ['tools', 'repos', 'kit']) assert.ok(html.includes(`href="#/${v}"`), v);
});

test('trending-weekly deltas carry the 주간 트렌딩 기준 marker', () => {
  const r = clone();
  r.rising = r.rising.slice(0, 2);
  r.rising[1].deltaSource = 'history';
  const html = draw(r);
  assert.equal((html.match(/주간 트렌딩 기준/g) ?? []).length, 1);
});

test('reduced mode shows 축소 모드 badge', () => {
  const r = clone();
  r.mode = 'reduced';
  assert.ok(draw(r).includes('축소 모드'));
  r.mode = 'full';
  assert.ok(!draw(r).includes('축소 모드'));
});

test('toggle button present with data-action', () => {
  const html = draw(clone());
  assert.match(html, /<button[^>]*data-action="toggle-mode"/);
  assert.ok(html.includes('class="knob">☾'));
  assert.ok(draw(clone(), { mode: 'light' }).includes('class="knob">☀'));
});

test('date select lists index dates with stamp and scan number', () => {
  const html = draw(clone());
  assert.match(html, /<select[^>]*data-date-select/);
  assert.ok(html.includes(`<option value="2026-10-23" selected>${fmt.esc(fmt.kstStamp(sample.collectedAt))} · SCAN #001</option>`));
  assert.ok(html.includes('<option value="2026-10-22">'));
});

test('source status counts ok sources and names failures in title', () => {
  const r = clone();
  r.sources[2].ok = false;
  r.sources[2].error = 'HTTP 403';
  const html = draw(r);
  assert.ok(html.includes('● 9/10 출처'));
  assert.match(html, /title="[^"]*Reddit[^"]*"/);
});

test('menu marks the current view and other views show a placeholder', () => {
  const html = draw(clone(), { route: { view: 'repos', date: '2026-10-23', params: {} } });
  assert.match(html, /<a class="on" href="#\/repos\?d=2026-10-23"/);
  assert.ok(html.includes('준비 중이에요'));
  assert.ok(!html.includes('class="hud lead'));
});

test('notice renders a band', () => {
  const html = draw(clone(), { notice: '그 날짜 기록이 없어요. 최신 브리핑을 보여드려요.' });
  assert.ok(html.includes('class="notice"'));
  assert.ok(html.includes('그 날짜 기록이 없어요'));
  assert.ok(!draw(clone()).includes('class="notice"'));
});

test('never renders the word 예시', () => {
  for (const view of VIEWS) {
    const html = draw(clone(), { route: { view, date: null, params: {} } });
    assert.ok(!html.includes('예시'), view);
  }
});

test('never throws on sparse or broken data', () => {
  const bare = { date: '2026-10-23' };
  for (const view of VIEWS) {
    const html = draw(bare, { route: { view, date: null, params: {} }, index: { latest: null, dates: [] } });
    assert.ok(html.includes('vibe<span>/</span>radar'));
  }
  const r = clone();
  r.gauge = null;
  r.collectedAt = 'not a date';
  r.issues[0].items = null;
  r.issues[1] = null;
  r.tools[0] = { name: null, version: null, publishedAt: 'bad', url: null, note: null };
  r.rising[0] = { fullName: 'a/b', stars: null, delta7: 'x', deltaSource: 'history' };
  r.kit[0] = { fullName: null, kind: null };
  r.alerts[0] = { title: null, url: null, origin: 'advisory', severity: 'critical', packages: null };
  r.sources = null;
  assert.doesNotThrow(() => draw(r));
  assert.doesNotThrow(() => draw(r, { index: null, route: null }));
});
