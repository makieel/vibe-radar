import { fetchText } from '../lib/http.ts';
import { atomEntries, linkHref, textOf } from '../lib/xml.ts';
import type { Paper } from '../schema.ts';
import type { Collector } from './types.ts';

export function parseArxivAtom(xml: string): Paper[] {
  const out: Paper[] = [];
  for (const e of atomEntries(xml)) {
    const m = /arxiv\.org\/abs\/(.+?)(?:v\d+)?$/.exec(textOf(e.id));
    const title = textOf(e.title);
    if (!m || !title) continue;
    const id = m[1];
    const category = e['arxiv:primary_category']?.['@_term'];
    out.push({
      id,
      title,
      category: typeof category === 'string' ? category : '',
      url: linkHref(e.link) || `https://arxiv.org/abs/${id}`,
      publishedAt: textOf(e.published),
    });
  }
  return out;
}

export const arxivCollector: Collector<'arxiv'> = {
  id: 'arxiv',
  key: 'arxiv',
  async run(ctx) {
    const q = encodeURIComponent('cat:cs.* OR cat:stat.ML');
    const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${ctx.config.arxivMax}`;
    const xml = await fetchText(url, { fetch: ctx.fetch });
    return { data: parseArxivAtom(xml), reduced: false };
  },
};
