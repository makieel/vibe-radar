// E · 오로라 HUD 테마. core가 넘긴 ctx로 화면 HTML 문자열을 만든다.
import { shell, MENU } from './views/shell.js';
import { briefing } from './views/briefing.js';

const VIEWS = { briefing };

// Task 13 전까지 나머지 화면은 자리만 잡아 둔다.
function soon(ctx) {
  const label = MENU.find(([id]) => id === ctx.route?.view)?.[1] ?? '';
  return `<section class="hud soon"><div class="lab">${label}</div><p>준비 중이에요</p></section>`;
}

export default {
  name: 'aurora-hud',
  render(ctx) {
    const view = VIEWS[ctx.route?.view ?? 'briefing'] ?? soon;
    return shell(ctx, view(ctx));
  },
};
