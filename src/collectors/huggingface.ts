import { fetchJson } from '../lib/http.ts';
import type { HfModel } from '../schema.ts';
import type { Collector } from './types.ts';

export function parseHfModels(json: unknown): HfModel[] {
  if (!Array.isArray(json)) return [];
  const out: HfModel[] = [];
  for (const m of json) {
    if (!m || typeof m.id !== 'string') continue;
    out.push({
      id: m.id,
      url: `https://huggingface.co/${m.id}`,
      likes: typeof m.likes === 'number' ? m.likes : 0,
      downloads: typeof m.downloads === 'number' ? m.downloads : 0,
      pipeline: typeof m.pipeline_tag === 'string' ? m.pipeline_tag : null,
    });
  }
  return out;
}

export const huggingfaceCollector: Collector<'hfModels'> = {
  id: 'huggingface',
  key: 'hfModels',
  async run(ctx) {
    const json = await fetchJson<unknown>('https://huggingface.co/api/models?sort=trendingScore&limit=20', { fetch: ctx.fetch });
    return { data: parseHfModels(json), reduced: false };
  },
};
