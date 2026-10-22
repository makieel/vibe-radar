// 실제 응답을 test/fixtures/ 에 저장하는 일회성 스크립트. 토큰 없이 실행한다(reduced 모드).
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchText } from '../src/lib/http.ts';
import { addDays, kstDate } from '../src/lib/dates.ts';

const OUT = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const GH_HEADERS = { Accept: 'application/vnd.github+json' };

async function save(name: string, url: string, headers?: Record<string, string>): Promise<string> {
  const body = await fetchText(url, { headers, timeoutMs: 30_000 });
  if (body.length === 0) throw new Error(`empty response for ${url}`);
  await writeFile(OUT + name, body);
  console.log(`ok   ${name} (${body.length} bytes) <- ${url}`);
  return body;
}

const failures: string[] = [];
async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    failures.push(name);
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}

await mkdir(OUT, { recursive: true });

await step('hn', async () => {
  const top = JSON.parse(await save('hn-top.json', 'https://hacker-news.firebaseio.com/v0/topstories.json')) as number[];
  const items: { id: number; raw: string; hasUrl: boolean }[] = [];
  for (const id of top.slice(0, 12)) {
    const raw = await fetchText(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    items.push({ id, raw, hasUrl: Boolean(JSON.parse(raw)?.url) });
  }
  const picked = [...items.filter((i) => i.hasUrl), ...items.filter((i) => !i.hasUrl)].slice(0, 3);
  for (const it of picked) {
    await writeFile(`${OUT}hn-item-${it.id}.json`, it.raw);
    console.log(`ok   hn-item-${it.id}.json (${it.raw.length} bytes)`);
  }
});

await step('geeknews', () => save('geeknews.xml', 'https://news.hada.io/rss/news'));
await step('reddit', () => save('reddit-claudeai.xml', 'https://www.reddit.com/r/ClaudeAI/top/.rss?t=day'));
await step('arxiv', () =>
  save(
    'arxiv.xml',
    'https://export.arxiv.org/api/query?search_query=' +
      encodeURIComponent('cat:cs.* OR cat:stat.ML') +
      '&sortBy=submittedDate&sortOrder=descending&max_results=20',
  ),
);
await step('hf', () => save('hf-trending.json', 'https://huggingface.co/api/models?sort=trendingScore&limit=100'));
await step('trending-daily', () => save('trending-daily.html', 'https://github.com/trending?since=daily'));
await step('trending-weekly', () => save('trending-weekly.html', 'https://github.com/trending?since=weekly'));
await step('gh-releases', () =>
  save('gh-releases-claude-code.json', 'https://api.github.com/repos/anthropics/claude-code/releases?per_page=10', GH_HEADERS),
);
await step('copilot', () => save('copilot-feed.xml', 'https://github.blog/changelog/feed/'));
await step('cursor', () => save('cursor-changelog.html', 'https://cursor.com/changelog'));
await step('advisories', () => save('advisories-pip.json', 'https://api.github.com/advisories?ecosystem=pip&per_page=30', GH_HEADERS));
await step('search-mcp', () => {
  const since = addDays(kstDate(new Date()), -30);
  const q = encodeURIComponent(`topic:mcp created:>${since}`);
  return save('search-mcp.json', `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=30`, GH_HEADERS);
});

if (failures.length > 0) {
  console.error(`failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
