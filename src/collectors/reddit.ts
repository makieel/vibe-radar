import { fetchText } from '../lib/http.ts';
import { atomEntries, linkHref, textOf } from '../lib/xml.ts';
import type { NewsItem } from '../schema.ts';
import type { Collector } from './types.ts';

export function parseRedditRss(xml: string, sub: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const e of atomEntries(xml)) {
    const url = linkHref(e.link);
    const title = textOf(e.title);
    if (!/^https?:\/\//.test(url) || !title) continue;
    out.push({
      id: textOf(e.id) || url,
      source: 'reddit',
      title,
      url,
      domain: 'reddit.com',
      sub,
      publishedAt: textOf(e.published) || textOf(e.updated) || null,
    });
  }
  return out;
}

export const redditCollector: Collector<'reddit'> = {
  id: 'reddit',
  key: 'reddit',
  async run(ctx) {
    const results = await Promise.allSettled(
      ctx.config.redditSubs.map(async sub => {
        const xml = await fetchText(`https://www.reddit.com/r/${sub}/top/.rss?t=day`, { fetch: ctx.fetch });
        return parseRedditRss(xml, sub);
      }),
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled');
    if (ok.length === 0) {
      const first = results[0] as PromiseRejectedResult | undefined;
      throw first?.reason ?? new Error('no reddit subs configured');
    }
    return { data: ok.flatMap(r => r.value), reduced: false };
  },
};
