// 출처 화면: HN, GeekNews, Reddit 세 열. 실패한 출처는 그 열에 안내를 보인다.
import { ext, isNum, list, text } from './shell.js';

function failed(report, id) {
  const s = list(report.sources).find((x) => x.id === id);
  return !!s && s.ok === false;
}

function row(item, meta, fmt) {
  return `<a class="row" ${ext(fmt, item.url)}><div>${fmt.esc(text(item.title))}${meta ? `<small>${fmt.esc(meta)}</small>` : ''}</div></a>`;
}

function column(report, fmt, id, cls, label, items, metaOf) {
  const body = failed(report, id)
    ? '<p class="empty">오늘은 이 출처를 가져오지 못했어요</p>'
    : items.length
      ? items.map((it) => row(it, metaOf(it), fmt)).join('')
      : '<p class="empty">아직 모인 글이 없어요</p>';
  return `<section class="hud ${cls}"><div class="lab">${label}</div><div class="rows">${body}</div></section>`;
}

export function sources(ctx) {
  const { fmt } = ctx;
  const report = ctx.report ?? {};
  const feeds = report.feeds && typeof report.feeds === 'object' ? report.feeds : {};
  const hn = (it) =>
    [isNum(it.points) ? `${fmt.count(it.points)}점` : '', isNum(it.comments) ? `댓글 ${fmt.count(it.comments)}` : '', text(it.domain)].filter(Boolean).join(' · ');
  const gn = (it) => text(it.domain);
  const rd = (it) => [text(it.sub) ? `r/${text(it.sub)}` : '', text(it.domain)].filter(Boolean).join(' · ');
  return `<div class="grid">
    ${column(report, fmt, 'hn', 't2', 'Hacker News', list(feeds.hn).slice(0, 30), hn)}
    ${column(report, fmt, 'geeknews', 't3', 'GeekNews', list(feeds.geeknews), gn)}
    ${column(report, fmt, 'reddit', 't4', 'Reddit', list(feeds.reddit), rd)}
  </div>`;
}
