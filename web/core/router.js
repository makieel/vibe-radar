// 해시 라우터: #/<view>?<params>&d=<date>
export const VIEWS = ['briefing', 'tools', 'kit', 'repos', 'papers', 'sources'];
export const NO_DATE_NOTICE = '그 날짜 기록이 없어요. 최신 브리핑을 보여드려요.';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRoute(hash, dates) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = q < 0 ? '' : raw.slice(q + 1);
  const seg = path.replace(/^\/+/, '').split('/')[0] ?? '';
  const view = VIEWS.includes(seg) ? seg : 'briefing';

  const params = {};
  let d = null;
  for (const [k, v] of new URLSearchParams(query)) {
    if (k === 'd') d = v;
    else params[k] = v;
  }

  let date = null;
  let notice = null;
  if (d !== null) {
    if (DATE_RE.test(d) && dates.includes(d)) date = d;
    else notice = NO_DATE_NOTICE;
  }
  return { route: { view, date, params }, notice };
}

export function toHash(route) {
  const path = route.view === 'briefing' ? '/' : `/${route.view}`;
  const parts = Object.entries(route.params ?? {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  if (route.date) parts.push(`d=${encodeURIComponent(route.date)}`);
  return `#${path}${parts.length ? `?${parts.join('&')}` : ''}`;
}
