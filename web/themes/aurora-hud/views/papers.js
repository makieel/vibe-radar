// 논문 화면: 분야 필터 칩, 논문 목록, HF 트렌딩 모델.
import { chips, ext, isNum, list, text } from './shell.js';

const MAX_PAPERS = 60;

export function papers(ctx) {
  const { fmt, route } = ctx;
  const report = ctx.report ?? {};
  const all = list(report.papers);
  const cats = list(report.paperCategories).filter((c) => text(c.category));
  const asked = route?.params?.cat;
  const cat = cats.some((c) => c.category === asked) ? asked : null; // 모르는 값은 '전체'
  const shown = cat ? all.filter((p) => p.category === cat) : all;
  const bar = cats.length
    ? chips(fmt, 'papers', route?.date, 'cat', [[null, '전체'], ...cats.map((c) => [c.category, isNum(c.count) ? `${c.category} ${c.count}` : c.category])], cat)
    : '';
  const rows = shown
    .slice(0, MAX_PAPERS)
    .map((p) => `<a class="row" ${ext(fmt, p.url)}><div>${fmt.esc(text(p.title))}<small>arXiv</small></div><span class="m">${fmt.esc(text(p.category))}</span></a>`)
    .join('');
  const models = list(report.hfModels)
    .slice(0, 10)
    .map((m) => {
      const sub = [text(m.pipeline), isNum(m.likes) ? `♥ ${fmt.count(m.likes)}` : ''].filter(Boolean).join(' · ');
      return `<a class="row" ${ext(fmt, m.url)}><div>${fmt.esc(text(m.id))}${sub ? `<small>${fmt.esc(sub)}</small>` : ''}</div></a>`;
    })
    .join('');
  const count = shown.length > MAX_PAPERS ? `${shown.length}편 중 ${MAX_PAPERS}편` : `${shown.length}편`;
  return `<section class="hud t2">
    <div class="lab">arXiv 논문${cat ? ` · ${fmt.esc(cat)}` : ''}${all.length ? ` · ${fmt.esc(count)}` : ''}</div>
    ${bar}
    <div class="rows">${rows || '<p class="empty">아직 모인 논문이 없어요</p>'}</div>
  </section>
  <section class="hud t3 below">
    <div class="lab">Hugging Face 트렌딩 모델</div>
    <div class="rows">${models || '<p class="empty">아직 모인 모델이 없어요</p>'}</div>
  </section>`;
}
