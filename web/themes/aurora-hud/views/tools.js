// 도구 화면: 릴리즈 카드 그리드.
import { ext, list, validIso, text } from './shell.js';

function card(t, fmt) {
  const version = text(t.version);
  const when = validIso(t.publishedAt) ? fmt.ago(t.publishedAt) : '';
  const note = fmt.koOr(text(t.note_ko), text(t.note));
  const meta = [version, when].filter(Boolean).join(' · ');
  return `<article class="card">
      <h3>${fmt.esc(text(t.name))}${t.isRecent === true ? '<span class="tag">NEW</span>' : ''}</h3>
      ${meta ? `<div class="meta">${fmt.esc(meta)}</div>` : ''}
      ${note ? `<p>${fmt.esc(note)}</p>` : ''}
      <a class="morelink" ${ext(fmt, t.url)}>릴리즈 보기 →</a>
    </article>`;
}

export function tools(ctx) {
  const { fmt } = ctx;
  const items = list(ctx.report?.tools);
  return `<section class="hud t2">
    <div class="lab">AI 코딩 도구 · 최근 릴리즈</div>
    ${items.length ? `<div class="cards">${items.map((t) => card(t, fmt)).join('')}</div>` : '<p class="empty">아직 모인 도구 소식이 없어요</p>'}
  </section>`;
}
