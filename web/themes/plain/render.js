// 테마 계약 검증용 최소 테마: 날짜, 이슈 제목, 토글 버튼, 날짜 선택.
export default {
  name: 'plain',
  render(ctx) {
    const { report, index, route, mode, notice, fmt } = ctx;
    const dates = index.dates
      .map((d) => `<option value="${fmt.esc(d)}"${d === report.date ? ' selected' : ''}>${fmt.esc(d)}</option>`)
      .join('');
    const issues = report.issues
      .map((i) => `<li><a href="${fmt.esc(fmt.safeUrl(i.url))}">${fmt.esc(fmt.koOr(i.title_ko, i.title))}</a></li>`)
      .join('');
    return `<main class="plain">
  <header>
    <h1>Vibe Radar <small>${fmt.esc(report.date)}</small></h1>
    <select data-date-select aria-label="날짜">${dates}</select>
    <button type="button" data-action="toggle-mode">${mode === 'dark' ? '라이트로' : '다크로'}</button>
  </header>
  ${notice ? `<p class="notice">${fmt.esc(notice)}</p>` : ''}
  <p class="view">${fmt.esc(route.view)}</p>
  <ol>${issues || '<li>이슈 없음</li>'}</ol>
</main>`;
  },
};
