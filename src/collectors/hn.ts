import { fetchJson } from '../lib/http.ts';
import { domainOf } from '../lib/text.ts';
import type { HnItem } from '../schema.ts';
import type { Collector } from './types.ts';

const BASE = 'https://hacker-news.firebaseio.com/v0';
const TOP_N = 30;

export function parseHnItem(json: unknown): HnItem | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (j.type !== 'story' || j.dead === true || j.deleted === true) return null;
  if (typeof j.id !== 'number' || typeof j.title !== 'string') return null;
  const hnUrl = `https://news.ycombinator.com/item?id=${j.id}`;
  const url = typeof j.url === 'string' && /^https?:\/\//i.test(j.url) ? j.url : hnUrl;
  return {
    id: j.id,
    title: j.title,
    url,
    domain: domainOf(url),
    points: typeof j.score === 'number' ? j.score : 0,
    comments: typeof j.descendants === 'number' ? j.descendants : 0,
    hnUrl,
  };
}

export const hnCollector: Collector<'hn'> = {
  id: 'hn',
  key: 'hn',
  async run(ctx) {
    const ids = await fetchJson<number[]>(`${BASE}/topstories.json`, { fetch: ctx.fetch });
    const top = ids.slice(0, TOP_N);
    let failures = 0;
    const items = await Promise.all(
      top.map(id =>
        fetchJson<unknown>(`${BASE}/item/${id}.json`, { fetch: ctx.fetch }).catch(() => {
          failures++;
          return null;
        }),
      ),
    );
    if (top.length > 0 && failures === top.length) throw new Error('all HN item fetches failed');
    const data = items.map(parseHnItem).filter((i): i is HnItem => i !== null);
    return { data, reduced: false };
  },
};
