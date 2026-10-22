import { parse } from 'node-html-parser';
import { fetchText } from '../lib/http.ts';
import type { TrendingRepo } from '../schema.ts';
import type { Collector } from './types.ts';

const PERIODS = ['daily', 'weekly'] as const;
const FULL_NAME = /^[\w.-]+\/[\w.-]+$/;

const toInt = (s: string | undefined): number => (s ? Number(s.replace(/,/g, '')) : NaN);

/** Parses github.com/trending HTML. Selectors: `article.Box-row`, `h2 a[href]`, `a[href$="/stargazers"]`, `span` containing "N stars today|this week". */
export function parseTrendingHtml(html: string, period: 'daily' | 'weekly'): TrendingRepo[] {
  const out: TrendingRepo[] = [];
  let root;
  try {
    root = parse(html);
  } catch {
    return out;
  }
  for (const row of root.querySelectorAll('article.Box-row')) {
    const fullName = (row.querySelector('h2 a')?.getAttribute('href') ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!FULL_NAME.test(fullName)) continue;
    const stars = toInt(row.querySelector('a[href$="/stargazers"]')?.text.trim());
    const periodText = row.querySelectorAll('span').map(s => s.text).find(t => /stars\s+(today|this week)/.test(t));
    const starsInPeriod = toInt(periodText?.match(/([\d,]+)\s+stars?\s+(?:today|this week)/)?.[1]);
    if (!(stars > 0) || !Number.isFinite(starsInPeriod)) continue;
    const description = row.querySelector('p')?.text.replace(/\s+/g, ' ').trim() || null;
    const language = row.querySelector('[itemprop="programmingLanguage"]')?.text.trim() || null;
    out.push({ fullName, url: `https://github.com/${fullName}`, description, language, stars, starsInPeriod, period });
  }
  return out;
}

export const trendingCollector: Collector<'trending'> = {
  id: 'trending',
  key: 'trending',
  async run(ctx) {
    const results = await Promise.allSettled(
      PERIODS.map(async p => parseTrendingHtml(await fetchText(`https://github.com/trending?since=${p}`, { fetch: ctx.fetch }), p)),
    );
    const data: TrendingRepo[] = [];
    let failures = 0;
    let firstError: unknown;
    for (const r of results) {
      if (r.status === 'fulfilled') data.push(...r.value);
      else {
        failures++;
        firstError ??= r.reason;
      }
    }
    if (failures === PERIODS.length) throw firstError instanceof Error ? firstError : new Error('trending fetch failed');
    return { data, reduced: false };
  },
};
