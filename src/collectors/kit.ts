import { addDays } from '../lib/dates.ts';
import { fetchJson } from '../lib/http.ts';
import type { KitRepo } from '../schema.ts';
import type { Collector } from './types.ts';

const REDUCED_TOPICS = 2;
const FULL_NAME = /^[\w.-]+\/[\w.-]+$/;

export function parseSearch(json: unknown): KitRepo[] {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: KitRepo[] = [];
  for (const r of items) {
    if (!r || typeof r !== 'object') continue;
    const j = r as Record<string, any>;
    if (typeof j.full_name !== 'string' || !FULL_NAME.test(j.full_name)) continue;
    if (typeof j.html_url !== 'string' || !/^https?:\/\//i.test(j.html_url)) continue;
    out.push({
      fullName: j.full_name,
      url: j.html_url,
      description: typeof j.description === 'string' ? j.description : null,
      stars: typeof j.stargazers_count === 'number' ? j.stargazers_count : 0,
      createdAt: typeof j.created_at === 'string' ? j.created_at : null,
      topics: Array.isArray(j.topics) ? j.topics.filter((t: unknown): t is string => typeof t === 'string') : [],
    });
  }
  return out;
}

export const kitCollector: Collector<'kit'> = {
  id: 'kit',
  key: 'kit',
  async run(ctx) {
    const all = ctx.config.kitTopics;
    const reduced = ctx.mode === 'reduced' && all.length > REDUCED_TOPICS;
    const topics = ctx.mode === 'reduced' ? all.slice(0, REDUCED_TOPICS) : all;
    const since = addDays(ctx.date, -30);
    const results = await Promise.allSettled(
      topics.map(async t => {
        const q = encodeURIComponent(`topic:${t} created:>${since}`);
        return parseSearch(await fetchJson<unknown>(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`, { fetch: ctx.fetch, token: ctx.token }));
      }),
    );
    const seen = new Set<string>();
    const data: KitRepo[] = [];
    let failures = 0;
    let firstError: unknown;
    for (const r of results) {
      if (r.status === 'rejected') {
        failures++;
        firstError ??= r.reason;
        continue;
      }
      for (const repo of r.value) {
        if (seen.has(repo.fullName)) continue;
        seen.add(repo.fullName);
        data.push(repo);
      }
    }
    if (results.length > 0 && failures === results.length) throw firstError instanceof Error ? firstError : new Error('all kit searches failed');
    return { data, reduced };
  },
};
