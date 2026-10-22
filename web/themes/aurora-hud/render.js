// E · 오로라 HUD 테마. core가 넘긴 ctx로 화면 HTML 문자열을 만든다.
import { shell } from './views/shell.js';
import { briefing } from './views/briefing.js';
import { tools } from './views/tools.js';
import { kit } from './views/kit.js';
import { repos } from './views/repos.js';
import { papers } from './views/papers.js';
import { sources } from './views/sources.js';

const VIEWS = { briefing, tools, kit, repos, papers, sources };

export default {
  name: 'aurora-hud',
  render(ctx) {
    const view = VIEWS[ctx.route?.view ?? 'briefing'] ?? briefing;
    return shell(ctx, view(ctx));
  },
};
