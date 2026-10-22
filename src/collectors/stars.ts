import { daysBetween } from '../lib/dates.ts';
import { fetchJson } from '../lib/http.ts';
import type { Collector, StarHistory } from './types.ts';

const CONCURRENCY = 5;

/** Repos that trended within the last `trackDays` days, minus those trending today (their stars come from the trending page). */
export function starsTargets(history: StarHistory, today: string, trackDays: number, exclude: Set<string>): string[] {
  return Object.entries(history)
    .filter(([name, h]) => !exclude.has(name) && daysBetween(h.lastTrending, today) <= trackDays)
    .map(([name]) => name);
}

/** Time the stars collector may spend in full mode; the runner gives it a separate safety timeout. */
export const STARS_BUDGET_MS = 240_000;

/**
 * When `budgetMs` runs out, no new requests are dispatched, in-flight ones are aborted, and the
 * values collected so far are returned with `reduced: true`.
 */
export function makeStarsCollector(budgetMs: number): Collector<'stars'> {
  return {
    id: 'stars',
    key: 'stars',
    async run(ctx) {
      // Reduced mode: no requests at all; the runner falls back to the trending entry stars.
      if (ctx.mode === 'reduced') return { data: {}, reduced: true };
      const targets = starsTargets(ctx.history, ctx.date, ctx.config.trackDays, ctx.trendingToday);
      const data: Record<string, number> = {};
      let failures = 0;
      let firstError: unknown;
      let next = 0;
      const budget = new AbortController();
      const timer = setTimeout(() => budget.abort(new Error(`stars budget ${budgetMs}ms used up`)), budgetMs);
      const worker = async () => {
        while (next < targets.length && !budget.signal.aborted) {
          const name = targets[next++];
          try {
            const j = await fetchJson<{ stargazers_count?: unknown }>(`https://api.github.com/repos/${name}`, { fetch: ctx.fetch, token: ctx.token, signal: budget.signal });
            if (typeof j.stargazers_count !== 'number') throw new Error(`no stargazers_count for ${name}`);
            data[name] = j.stargazers_count;
          } catch (e) {
            if (budget.signal.aborted) break;
            failures++;
            firstError ??= e;
          }
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
      } finally {
        clearTimeout(timer);
      }
      if (budget.signal.aborted) return { data, reduced: true };
      if (targets.length > 0 && failures === targets.length) throw firstError instanceof Error ? firstError : new Error('all star fetches failed');
      return { data, reduced: false };
    },
  };
}

export const starsCollector: Collector<'stars'> = makeStarsCollector(STARS_BUDGET_MS);
