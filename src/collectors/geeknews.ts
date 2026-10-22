import { fetchText } from '../lib/http.ts';
import { domainOf } from '../lib/text.ts';
import { atomEntries, linkHref, textOf } from '../lib/xml.ts';
import type { NewsItem } from '../schema.ts';
import type { Collector } from './types.ts';

export function parseGeekNewsRss(xml: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const e of atomEntries(xml)) {
    const url = linkHref(e.link);
    const title = textOf(e.title);
    if (!/^https?:\/\//.test(url) || !title) continue;
    out.push({
      id: textOf(e.id) || url,
      source: 'geeknews',
      title,
      url,
      domain: domainOf(url),
      sub: null,
      publishedAt: textOf(e.published) || textOf(e.updated) || null,
    });
  }
  return out;
}

export const geeknewsCollector: Collector<'geeknews'> = {
  id: 'geeknews',
  key: 'geeknews',
  async run(ctx) {
    const xml = await fetchText('https://news.hada.io/rss/news', { fetch: ctx.fetch });
    return { data: parseGeekNewsRss(xml), reduced: false };
  },
};
