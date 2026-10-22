// 재료 화면: kind 필터 칩과 카드 그리드.
import { chips, ext, isNum, list, text } from './shell.js';

const KINDS = ['MCP', 'SKILL', 'RULES', 'CLI', 'AGENT'];

function card(k, fmt) {
  const desc = fmt.koOr(text(k.description_ko), text(k.description));
  const meta = [text(k.kind), isNum(k.stars) ? `★${fmt.count(k.stars)}` : ''].filter(Boolean).join(' · ');
  return `<article class="card">
      <h3><a ${ext(fmt, k.url)}>${fmt.esc(text(k.fullName))}</a>${k.isNew === true ? '<span class="tag">신규</span>' : ''}</h3>
      ${meta ? `<div class="meta">${fmt.esc(meta)}</div>` : ''}
      ${desc ? `<p>${fmt.esc(desc)}</p>` : ''}
    </article>`;
}

export function kit(ctx) {
  const { fmt, route } = ctx;
  const all = list(ctx.report?.kit);
  const asked = route?.params?.kind;
  const kind = KINDS.includes(asked) ? asked : null; // 모르는 값은 '전체'
  const shown = kind ? all.filter((k) => k.kind === kind) : all;
  const bar = chips(fmt, 'kit', route?.date, 'kind', [[null, '전체'], ...KINDS.map((x) => [x, x])], kind);
  const empty = kind ? `${kind} 재료는 오늘 없어요` : '아직 모인 재료가 없어요';
  return `<section class="hud t4">
    <div class="lab">바이브코딩 재료</div>
    ${bar}
    ${shown.length ? `<div class="cards">${shown.map((k) => card(k, fmt)).join('')}</div>` : `<p class="empty">${fmt.esc(empty)}</p>`}
  </section>`;
}
