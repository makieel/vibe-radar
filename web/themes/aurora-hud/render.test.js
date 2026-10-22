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

test('menu marks the current view', () => {
  const html = draw(clone(), { route: { view: 'repos', date: '2026-10-23', params: {} } });
  assert.match(html, /<a class="on" href="#\/repos\?d=2026-10-23"/);
  assert.ok(!html.includes('준비 중이에요'));
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

// ---- Task 13: 보조 화면 ----
const at = (view, params = {}, date = null) => ({ route: { view, date, params } });
const page = (r, view, params, date) => draw(r, at(view, params, date));
const HOSTILE = '<img src=x onerror=alert(1)>';

test('tools view: cards with version, ago, note, release link, NEW badge', () => {
  const r = clone();
  for (const t of r.tools) t.isRecent = false;
  r.tools[0].isRecent = true;
  r.tools[1].version = null;
  r.tools[1].note_ko = '한국어 노트';
  const html = page(r, 'tools');
  assert.equal((html.match(/class="card"/g) ?? []).length, r.tools.length);
  assert.ok(html.includes(fmt.esc(r.tools[0].version)));
  assert.equal((html.match(/>NEW</g) ?? []).length, 1);
  assert.ok(html.includes('한국어 노트'));
  assert.ok(html.includes(fmt.ago(r.tools[1].publishedAt)));
  assert.ok(html.includes('릴리즈 보기'));
  assert.ok(html.includes(`href="${fmt.esc(r.tools[0].url)}" target="_blank" rel="noopener"`));
  r.tools = [];
  assert.ok(page(r, 'tools').includes('아직 모인 도구 소식이 없어요'));
});

test('tool without release: name only, no link, failure note (tools view and briefing)', () => {
  const r = clone();
  r.tools = [{ tool: 'codex', name: 'Codex CLI', version: null, publishedAt: null, url: null, note: null, note_ko: null, isRecent: false }];
  for (const view of ['tools', 'briefing']) {
    const html = page(r, view);
    assert.ok(html.includes('Codex CLI'), view);
    assert.ok(html.includes('최근 릴리즈 정보를 가져오지 못했어요'), view);
    assert.ok(!html.includes('href="#" target="_blank"'), view);
  }
  assert.ok(!page(r, 'tools').includes('릴리즈 보기'));
});

test('kit filter by kind', () => {
  const r = clone();
  r.kit[0].kind = 'SKILL';
  r.kit[0].fullName = 'a/only-skill';
  const html = page(r, 'kit', { kind: 'SKILL' }, '2026-10-22');
  assert.ok(html.includes('a/only-skill'));
  assert.equal((html.match(/class="card"/g) ?? []).length, 1);
  assert.ok(html.includes('class="chip on" aria-current="true" href="#/kit?kind=SKILL&amp;d=2026-10-22"'));
  assert.ok(html.includes('href="#/kit?kind=MCP&amp;d=2026-10-22"'));
  assert.ok(html.includes('href="#/kit?d=2026-10-22"')); // 전체
  const all = page(r, 'kit');
  assert.equal((all.match(/class="card"/g) ?? []).length, r.kit.length);
  assert.ok(all.includes('>신규<'));
  assert.ok(page(r, 'kit', { kind: 'RULES' }).includes('RULES 재료는 오늘 없어요'));
});

test('kit unknown kind falls back to 전체', () => {
  const r = clone();
  const html = page(r, 'kit', { kind: 'XYZ' });
  assert.equal((html.match(/class="card"/g) ?? []).length, r.kit.length);
  assert.ok(html.includes('class="chip on" aria-current="true" href="#/kit"'));
});

test('papers filter by cat', () => {
  const r = clone();
  const cat = r.paperCategories[0].category;
  const expected = r.papers.filter((p) => p.category === cat).length;
  const html = page(r, 'papers', { cat }, '2026-10-22');
  const [list, hf] = html.split('Hugging Face');
  assert.equal((list.match(/class="row"/g) ?? []).length, Math.min(expected, 60));
  assert.ok(html.includes(`href="#/papers?cat=${encodeURIComponent(cat)}&amp;d=2026-10-22"`));
  const other = r.papers.find((p) => p.category !== cat);
  assert.ok(!html.includes(fmt.esc(other.title)));
  assert.ok(html.includes(fmt.esc(r.hfModels[0].id)));
  assert.ok(html.includes(fmt.count(r.hfModels[0].likes)));
  assert.equal((hf.match(/class="row"/g) ?? []).length, 10);
});

test('papers unknown cat falls back to 전체', () => {
  const r = clone();
  const html = page(r, 'papers', { cat: 'zz.ZZ' });
  assert.ok(html.includes('class="chip on" aria-current="true" href="#/papers"'));
  assert.ok(html.includes(fmt.esc(r.papers[0].title)));
});

test('repos view: rising rows with sparkline and signed delta', () => {
  const r = clone();
  r.rising[0].series = [{ date: '2026-10-22', stars: 10 }, { date: '2026-10-23', stars: 30 }, { date: '2026-10-24', stars: 20 }];
  r.rising[1].series = [{ date: '2026-10-23', stars: 10 }];
  const html = page(r, 'repos');
  assert.ok(html.includes(fmt.signed(r.rising[0].delta7)));
  const sparks = html.match(/<svg class="spark"[^>]*aria-hidden="true"/g) ?? [];
  assert.equal(sparks.length, r.rising.slice(0, 10).filter((x) => x.series.length >= 2).length);
  assert.match(html, /<polyline points="[\d., ]+" fill="none" stroke="var\(--green\)"/);
});

test('sparkline omitted when series < 2 points', () => {
  const r = clone();
  r.rising = r.rising.slice(0, 2);
  r.rising[0].series = [{ date: '2026-10-23', stars: 5 }];
  r.rising[1].series = [];
  assert.ok(!page(r, 'repos').includes('class="spark"'));
  r.rising[0].series = [{ date: 'a', stars: 5 }, { date: 'b', stars: 9 }];
  assert.equal((page(r, 'repos').match(/class="spark"/g) ?? []).length, 1);
});

test('repos with no previous shows 비교할 이전 기록이 아직 없어요', () => {
  const r = clone();
  r.newRepos = [];
  r.droppedRepos = [];
  assert.equal((page(r, 'repos').match(/비교할 이전 기록이 아직 없어요/g) ?? []).length, 2);
  r.newRepos = [{ fullName: 'n/new', url: 'https://github.com/n/new', description: null, language: 'Go', stars: 12 }];
  const html = page(r, 'repos');
  assert.ok(html.includes('n/new'));
  assert.equal((html.match(/비교할 이전 기록이 아직 없어요/g) ?? []).length, 1);
});

test('keyword chips: delta arrows, 신규, or today frequency', () => {
  const r = clone();
  r.keywords = [
    { term: 'up', today: 9, avg7: 3, delta: 6, isNew: false },
    { term: 'down', today: 1, avg7: 4, delta: -3, isNew: false },
    { term: 'fresh', today: 4, avg7: null, delta: null, isNew: true },
    { term: 'plain', today: 26, avg7: null, delta: null, isNew: false },
  ];
  const html = page(r, 'repos');
  assert.ok(html.includes('up<b>▲6</b>'));
  assert.ok(html.includes('down<b>▼3</b>'));
  assert.ok(html.includes('fresh<b>신규</b>'));
  assert.ok(html.includes('plain<b>26</b>'));
});

test('sources view: three columns with metadata', () => {
  const r = clone();
  const html = page(r, 'sources');
  assert.equal((html.match(/class="hud t[234]"/g) ?? []).length, 3);
  assert.equal((html.match(/class="row"/g) ?? []).length, r.feeds.hn.length + r.feeds.geeknews.length + r.feeds.reddit.length);
  const h = r.feeds.hn[0];
  assert.ok(html.includes(`${fmt.count(h.points)}점 · 댓글 ${fmt.count(h.comments)} · ${fmt.esc(h.domain)}`));
  assert.ok(html.includes('r/ClaudeAI'));
});

test('sources shows failure message for failed reddit', () => {
  const r = clone();
  r.sources.find((s) => s.id === 'reddit').ok = false;
  const html = page(r, 'sources');
  assert.equal((html.match(/오늘은 이 출처를 가져오지 못했어요/g) ?? []).length, 1);
  assert.ok(!html.includes('r/ClaudeAI'));
  assert.ok(html.includes(fmt.esc(r.feeds.hn[0].title)));
});

test('empty data shows empty states on every secondary view', () => {
  const bare = { date: '2026-10-23' };
  const expected = {
    tools: '아직 모인 도구 소식이 없어요',
    kit: '아직 모인 재료가 없어요',
    repos: '아직 모인 급상승 레포가 없어요',
    papers: '아직 모인 논문이 없어요',
    sources: '아직 모인 글이 없어요',
  };
  for (const [view, msg] of Object.entries(expected)) assert.ok(page(bare, view).includes(msg), view);
});

test('unknown date notice renders on any view', () => {
  for (const view of VIEWS) {
    const html = draw(clone(), { ...at(view), notice: '그 날짜 기록이 없어요. 최신 브리핑을 보여드려요.' });
    assert.ok(html.includes('class="notice"'), view);
  }
});

test('hostile strings are escaped on every secondary view', () => {
  const r = clone();
  r.tools[0].name = HOSTILE;
  r.tools[0].note_ko = HOSTILE;
  r.kit[0].fullName = HOSTILE;
  r.kit[0].description = HOSTILE;
  r.rising[0].fullName = HOSTILE;
  r.rising[0].url = 'javascript:alert(1)';
  r.keywords[0].term = HOSTILE;
  r.newRepos = [{ fullName: HOSTILE, url: 'javascript:alert(2)', description: null, language: HOSTILE, stars: 1 }];
  r.papers[0].title = HOSTILE;
  r.papers[0].url = 'javascript:alert(3)';
  r.paperCategories[0].category = HOSTILE;
  r.hfModels[0].id = HOSTILE;
  r.feeds.hn[0].title = HOSTILE;
  r.feeds.hn[0].domain = HOSTILE;
  r.feeds.reddit[0].sub = HOSTILE;
  for (const view of ['tools', 'kit', 'repos', 'papers', 'sources']) {
    const html = page(r, view, view === 'papers' ? { cat: HOSTILE } : {});
    assert.ok(!html.includes('<img'), view);
    assert.ok(!html.includes('javascript:'), view);
    assert.ok(html.includes('&lt;img'), view);
  }
});

test('secondary views never throw on broken data', () => {
  const r = clone();
  r.tools = [null, { name: null, isRecent: true }];
  r.kit = [{ fullName: null, kind: 'MCP', stars: 'x' }];
  r.rising = [{ fullName: 'a/b', series: [null, { stars: 'x' }, { stars: 3 }], delta7: null }];
  r.keywords = [{ term: null }, { term: 'k', delta: 'x', today: 'y' }];
  r.newRepos = 'nope';
  r.papers = [{ title: null, category: null, url: null }];
  r.paperCategories = [{ category: null, count: 'x' }, { category: 'cs.AI' }];
  r.hfModels = [{ id: null, likes: 'x' }];
  r.feeds = { hn: [{ title: null }], geeknews: null, reddit: 5 };
  for (const view of ['tools', 'kit', 'repos', 'papers', 'sources']) {
    assert.doesNotThrow(() => page(r, view, { kind: 'MCP', cat: 'cs.AI' }), view);
    assert.doesNotThrow(() => draw(r, { route: null }), view);
  }
});
