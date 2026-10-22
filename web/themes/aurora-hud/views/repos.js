// 레포 화면: 급상승 10개(스파크라인), 신규·빠진 목록, 키워드 칩.
import { ext, isNum, list, text } from './shell.js';

const W = 72;
const H = 22;

/** series 점이 2개 미만이면 ''. 장식이라 스크린리더에서 숨긴다. */
export function sparkline(series) {
  const pts = (Array.isArray(series) ? series : []).map((p) => p?.stars).filter(isNum);
  if (pts.length < 2) return '';
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min;
  const coords = pts
    .map((v, i) => `${((i / (pts.length - 1)) * (W - 2) + 1).toFixed(1)},${(span === 0 ? H / 2 : H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`)
    .join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false"><polyline points="${coords}" fill="none" stroke="var(--green)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function risingRow(r, fmt) {
  const sub = [];
  if (isNum(r.stars)) sub.push(`★${fmt.count(r.stars)}`);
  if (r.isNew === true) sub.push('신규');
  const weekly = r.deltaSource === 'trending-weekly' ? '<span class="tag">주간 트렌딩 기준</span>' : '';
  const desc = fmt.koOr(text(r.description_ko), text(r.description));
  const delta = isNum(r.delta7) ? fmt.signed(r.delta7) : '—';
  return `<a class="row" ${ext(fmt, r.url)}><div>${fmt.esc(text(r.fullName))}<small>${fmt.esc(sub.join(' · '))}${weekly}</small>${desc ? `<small>${fmt.esc(desc)}</small>` : ''}</div>${sparkline(r.series)}<span class="up">${fmt.esc(delta)}</span></a>`;
}

function refRows(items, fmt) {
  if (!items.length) return '<p class="empty">비교할 이전 기록이 아직 없어요</p>';
  return items
    .map((r) => {
      const sub = [text(r.language), isNum(r.stars) ? `★${fmt.count(r.stars)}` : ''].filter(Boolean).join(' · ');
      return `<a class="row" ${ext(fmt, r.url)}><div>${fmt.esc(text(r.fullName))}${sub ? `<small>${fmt.esc(sub)}</small>` : ''}</div></a>`;
    })
    .join('');
}

function keywordChip(k, fmt) {
  let tail;
  let cls = '';
  if (isNum(k.delta) && k.delta !== 0) {
    cls = k.delta > 0 ? ' up' : ' down';
    tail = `${k.delta > 0 ? '▲' : '▼'}${fmt.count(Math.abs(k.delta))}`;
  } else if (k.isNew === true) {
    tail = '신규';
  } else {
    tail = isNum(k.today) ? fmt.count(k.today) : '';
  }
  return `<span class="kw${cls}">${fmt.esc(text(k.term))}${tail ? `<b>${fmt.esc(tail)}</b>` : ''}</span>`;
}

/** avg7이 하나도 없으면(기록 7일 미만) 오늘 빈도 기준임을, 있으면 7일 평균 대비 증가 기준임을 밝힌다. */
function keywordCaption(report, keywords) {
  if (keywords.some((k) => isNum(k.avg7))) return '지난 7일 평균보다 늘어난 단어';
  const days = isNum(report.gauge?.daysOfHistory) ? report.gauge.daysOfHistory : 0;
  return `기록 쌓는 중 (${days}/7일) · 오늘 많이 나온 단어`;
}

export function repos(ctx) {
  const { fmt } = ctx;
  const report = ctx.report ?? {};
  const rising = list(report.rising).slice(0, 10);
  const keywords = list(report.keywords);
  return `<div class="grid cols2">
    <section class="hud t3 span2">
      <div class="lab">급상승 레포 · 7일</div>
      <div class="rows">${rising.length ? rising.map((r) => risingRow(r, fmt)).join('') : '<p class="empty">아직 모인 급상승 레포가 없어요</p>'}</div>
    </section>
    <div class="stack">
      <section class="hud t2"><div class="lab">새로 오른 레포</div><div class="rows">${refRows(list(report.newRepos), fmt)}</div></section>
      <section class="hud t4"><div class="lab">빠진 레포</div><div class="rows">${refRows(list(report.droppedRepos), fmt)}</div></section>
    </div>
    <section class="hud t2 span3">
      <div class="lab">오늘의 키워드</div>
      ${keywords.length ? `<p class="cap">${fmt.esc(keywordCaption(report, keywords))}</p><div class="kws">${keywords.map((k) => keywordChip(k, fmt)).join('')}</div>` : '<p class="empty">아직 모인 키워드가 없어요</p>'}
    </section>
  </div>`;
}
