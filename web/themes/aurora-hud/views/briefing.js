// 브리핑 화면: 게이지, 1면, 보안 경보 띠, 3열 패널(도구·급상승·재료).
import { ext, hashFor, sourceName } from './shell.js';

const RING = 314; // 2πr, r=50
const LABELS = { hot: '평소보다 뜨거움', normal: '평소 수준', calm: '조용한 편' };
const SEVERITY = { critical: '심각', high: '높음' };

const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const text = (v) => (typeof v === 'string' ? v : '');

function validIso(iso) {
  return typeof iso === 'string' && !Number.isNaN(new Date(iso).getTime());
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function gaugePanel(report, fmt) {
  const g = report.gauge && typeof report.gauge === 'object' ? report.gauge : {};
  const value = isNum(g.value) ? Math.min(100, Math.max(0, Math.round(g.value))) : null;
  const offset = Math.round(RING * (1 - (value ?? 0) / 100) * 100) / 100;
  const days = isNum(g.daysOfHistory) ? g.daysOfHistory : 0;
  const label = LABELS[g.label] ?? `기록 쌓는 중 (${days}/7일)`;
  const top = list(report.issues)[0];
  const lines = [];
  if (top && text(top.heatReason)) lines.push(fmt.esc(top.heatReason));
  if (LABELS[g.label] && isNum(g.avg7)) lines.push(`지난 7일 평균 ${fmt.esc(Math.round(g.avg7))}`);
  return `<section class="hud gauge">
      <div class="lab">오늘의 개발판 열기</div>
      <div class="ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="vr-rg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#e879f9"/></linearGradient></defs>
          <circle class="bgc" cx="60" cy="60" r="50" fill="none" stroke-width="10"/>
          ${value === null ? '' : `<circle class="arc" cx="60" cy="60" r="50" fill="none" stroke="url(#vr-rg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="${offset}"/>`}
          <circle class="dash" cx="60" cy="60" r="38" fill="none" stroke-width="1" stroke-dasharray="2 4"/></svg>
        <div class="val"><b>${value === null ? '—' : value}</b><small>${fmt.esc(label)}</small></div>
      </div>
      ${lines.length ? `<p>${lines.join(' · ')}</p>` : ''}
    </section>`;
}

function itemMeta(item, fmt) {
  const parts = [sourceName(item.source)];
  if (isNum(item.points)) parts.push(`${fmt.count(item.points)}점`);
  if (isNum(item.comments)) parts.push(`댓글 ${fmt.count(item.comments)}`);
  return parts.filter(Boolean).join(' · ');
}

function leadPanel(report, fmt) {
  const issues = list(report.issues);
  const lead = issues[0];
  if (!lead) {
    return `<section class="hud lead">
      <div class="scanl"></div>
      <div class="lab">● 1면 핫이슈</div>
      <p class="empty">오늘은 아직 모인 이슈가 없어요</p>
    </section>`;
  }
  const summary = text(lead.summary_ko);
  const body = summary
    ? `<p>${fmt.esc(summary)}</p>`
    : `<ul class="items">${list(lead.items)
        .slice(0, 5)
        .map((it) => `<li><a ${ext(fmt, it.url)}>${fmt.esc(it.title)}</a><small>${fmt.esc(itemMeta(it, fmt))}</small></li>`)
        .join('')}</ul>`;
  const check = text(lead.check_ko) ? `<div class="why">바이브코더 체크 — ${fmt.esc(lead.check_ko)}</div>` : '';
  const more = issues
    .slice(1, 4)
    .map((it, i) => `<a ${ext(fmt, it.url)}><b>0${i + 2}</b>${fmt.esc(fmt.koOr(it.title_ko, it.title))}</a>`)
    .join('');
  return `<section class="hud lead">
      <div class="scanl"></div>
      <div class="lab">● 1면 핫이슈${summary ? ' · AI 요약' : ''}</div>
      <h3><a ${ext(fmt, lead.url)}>${fmt.esc(fmt.koOr(lead.title_ko, lead.title))}</a></h3>
      ${body}
      ${check}
      ${more ? `<div class="more">${more}</div>` : ''}
    </section>`;
}

function alertBand(report, fmt) {
  const alerts = list(report.alerts);
  if (!alerts.length) return '';
  const lines = alerts
    .map((a) => {
      const where =
        a.origin === 'advisory'
          ? ['GitHub 보안 권고', SEVERITY[a.severity], ...(Array.isArray(a.packages) ? a.packages : [])]
          : [host(a.url)];
      const meta = where.filter((x) => typeof x === 'string' && x).join(' · ');
      return `<div class="aline"><a ${ext(fmt, a.url)}><b>${fmt.esc(fmt.koOr(a.title_ko, a.title))}</b></a>${meta ? `<span class="s">${fmt.esc(meta)}</span>` : ''}</div>`;
    })
    .join('');
  return `<section class="hud alert" aria-label="보안 경보">
      <div class="dot" aria-hidden="true"></div>
      <div class="lab">보안 경보</div>
      <div class="alines">${lines}</div>
    </section>`;
}

function panel(fmt, cls, label, rows, empty, view, date) {
  return `<section class="hud ${cls}">
      <div class="lab">${label}</div>
      <div class="rows">${rows || `<p class="empty">${empty}</p>`}</div>
      <a class="morelink" href="${fmt.esc(hashFor(view, date))}">더 보기 →</a>
    </section>`;
}

function toolRows(report, fmt) {
  return list(report.tools)
    .slice(0, 5)
    .map((t) => {
      const right = text(t.version) || (validIso(t.publishedAt) ? fmt.ago(t.publishedAt) : '—');
      const note = text(t.note_ko) || text(t.note);
      return `<a class="row" ${ext(fmt, t.url)}><div>${fmt.esc(t.name)}${note ? `<small>${fmt.esc(note)}</small>` : ''}</div><span class="m">${fmt.esc(right)}</span></a>`;
    })
    .join('');
}

function risingRows(report, fmt) {
  return list(report.rising)
    .slice(0, 5)
    .map((r) => {
      const sub = [];
      if (isNum(r.stars)) sub.push(`★${fmt.count(r.stars)}`);
      if (r.isNew === true) sub.push('신규');
      const weekly = r.deltaSource === 'trending-weekly' ? '<span class="tag">주간 트렌딩 기준</span>' : '';
      const delta = isNum(r.delta7) ? fmt.signed(r.delta7) : '—';
      return `<a class="row" ${ext(fmt, r.url)}><div>${fmt.esc(r.fullName)}<small>${fmt.esc(sub.join(' · '))}${weekly}</small></div><span class="up">${fmt.esc(delta)}</span></a>`;
    })
    .join('');
}

function kitRows(report, fmt) {
  return list(report.kit)
    .slice(0, 5)
    .map((k) => {
      const full = text(k.fullName);
      const name = full.includes('/') ? full.slice(full.indexOf('/') + 1) : full;
      const desc = text(k.description_ko) || text(k.description);
      return `<a class="row" ${ext(fmt, k.url)} title="${fmt.esc(full)}"><div>${fmt.esc(name)}${desc ? `<small>${fmt.esc(desc)}</small>` : ''}</div><span class="m">${fmt.esc(k.kind)}</span></a>`;
    })
    .join('');
}

export function briefing(ctx) {
  const { fmt, route } = ctx;
  const report = ctx.report && typeof ctx.report === 'object' ? ctx.report : {};
  const date = route?.date;
  return `<div class="top">
    ${gaugePanel(report, fmt)}
    ${leadPanel(report, fmt)}
  </div>
  <div class="grid">
    ${alertBand(report, fmt)}
    ${panel(fmt, 't2', 'AI 코딩 도구', toolRows(report, fmt), '아직 모인 도구 소식이 없어요', 'tools', date)}
    ${panel(fmt, 't3', '급상승 레포 · 7일', risingRows(report, fmt), '아직 모인 급상승 레포가 없어요', 'repos', date)}
    ${panel(fmt, 't4', '바이브코딩 재료', kitRows(report, fmt), '아직 모인 재료가 없어요', 'kit', date)}
  </div>`;
}
