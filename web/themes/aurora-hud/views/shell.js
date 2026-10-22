// 공통 틀: 상단 내비(로고·메뉴·날짜 선택·출처 상태·축소 모드·토글)와 안내 띠.
export const MENU = [
  ['briefing', '브리핑'],
  ['tools', '도구'],
  ['kit', '재료'],
  ['repos', '레포'],
  ['papers', '논문'],
  ['sources', '출처'],
];

export const SOURCE_NAMES = {
  hn: 'HN',
  geeknews: 'GeekNews',
  reddit: 'Reddit',
  arxiv: 'arXiv',
  huggingface: 'Hugging Face',
  trending: 'GitHub 트렌딩',
  tools: '도구 릴리즈',
  advisories: 'GitHub 보안 권고',
  kit: 'GitHub 검색',
  stars: '스타 기록',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 배열이 아니면 [], 객체가 아닌 항목은 걸러낸다. 데이터가 비어도 테마가 throw하지 않게 한다. */
export const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

/** 앱 안 이동 링크. 날짜를 보고 있으면 d= 를 유지한다. */
export function hashFor(view, date) {
  const path = view === 'briefing' ? '#/' : `#/${view}`;
  return typeof date === 'string' && DATE_RE.test(date) ? `${path}?d=${date}` : path;
}

/** 외부 링크 속성. href는 safeUrl을 거친 뒤 escape한다. */
export function ext(fmt, url) {
  return `href="${fmt.esc(fmt.safeUrl(url))}" target="_blank" rel="noopener"`;
}

export function sourceName(id) {
  return SOURCE_NAMES[id] ?? String(id ?? '');
}

export function validIso(iso) {
  return typeof iso === 'string' && !Number.isNaN(new Date(iso).getTime());
}

function dateOptions(ctx) {
  const { report, index, fmt } = ctx;
  const dates = Array.isArray(index?.dates) ? index.dates.filter((d) => typeof d === 'string') : [];
  const current = report?.date;
  if (typeof current === 'string' && !dates.includes(current)) dates.unshift(current);
  const scan = Number.isInteger(report?.scanNo) ? ` · SCAN #${String(report.scanNo).padStart(3, '0')}` : '';
  const stamp = validIso(report?.collectedAt) ? fmt.kstStamp(report.collectedAt) : String(current ?? '').replaceAll('-', '.');
  return dates
    .map((d) =>
      d === current
        ? `<option value="${fmt.esc(d)}" selected>${fmt.esc(stamp + scan)}</option>`
        : `<option value="${fmt.esc(d)}">${fmt.esc(d.replaceAll('-', '.'))}</option>`,
    )
    .join('');
}

function sourceStatus(ctx) {
  const { report, route, fmt } = ctx;
  const sources = list(report?.sources);
  if (!sources.length) return '';
  const failed = sources.filter((s) => s.ok !== true);
  const title = failed.length
    ? `수집 실패: ${failed.map((s) => sourceName(s.id)).join(', ')}`
    : '모든 출처를 수집했어요';
  return `<a class="src${failed.length ? ' warn' : ''}" href="${fmt.esc(hashFor('sources', route?.date))}" title="${fmt.esc(title)}">● ${sources.length - failed.length}/${sources.length} 출처</a>`;
}

// 의도적으로 상태를 둔다: 토글 직후 다시 그려질 때만 손잡이 애니메이션(.flip)을 켜기 위해서다.
let lastMode = null;

function toggle(mode) {
  const dark = mode === 'dark';
  // 토글 직후 다시 그려질 때만 손잡이를 미끄러지게 한다.
  const flip = lastMode !== null && lastMode !== mode;
  lastMode = mode;
  return `<button type="button" class="mode${flip ? ' flip' : ''}" data-action="toggle-mode" aria-label="라이트/다크 전환" title="라이트/다크 전환"><span class="ico sun" aria-hidden="true">☀</span><span class="ico moon" aria-hidden="true">☾</span><span class="knob">${dark ? '☾' : '☀'}</span></button>`;
}

export function shell(ctx, body) {
  const { report, route, mode, notice, fmt } = ctx;
  const view = route?.view ?? 'briefing';
  const menu = MENU.map(
    ([id, label]) => `<a${id === view ? ' class="on"' : ''} href="${fmt.esc(hashFor(id, route?.date))}">${label}</a>`,
  ).join('');
  const reduced =
    report?.mode === 'reduced'
      ? '<span class="badge" title="GITHUB_TOKEN 없이 수집한 날이라 AI 요약, 번역, 스타 기록이 빠져 있어요">축소 모드</span>'
      : '';
  return `<div class="wrap">
  <header class="nav">
    <a class="logo" href="${fmt.esc(hashFor('briefing', route?.date))}">vibe<span>/</span>radar</a>
    <nav class="menu" aria-label="메뉴">${menu}</nav>
    <div class="stat">
      <select class="clock" data-date-select aria-label="날짜 선택">${dateOptions(ctx)}</select>
      ${sourceStatus(ctx)}${reduced}
    </div>
    ${toggle(mode)}
  </header>
  ${notice ? `<div class="notice" role="status">${fmt.esc(notice)}</div>` : ''}
  <main>${body}</main>
</div>`;
}
