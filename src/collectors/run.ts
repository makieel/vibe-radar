import type { RawSnapshot, SourceId, SourceStatus } from '../schema.ts';
import { STARS_BUDGET_MS } from './stars.ts';
import type { CollectCtx, Collector, StarHistory } from './types.ts';

export const COLLECTOR_TIMEOUT_MS = 30_000;
/** `stars` manages its own time budget; this outer timeout is only a safety net. */
export const STARS_SAFETY_TIMEOUT_MS = STARS_BUDGET_MS + 30_000;
const NON_EMPTY_IDS = new Set<SourceId>(['trending', 'hn', 'tools']);

export interface RunOpts {
  failIds?: Set<SourceId>;
  /** Per-collector timeout; does not apply to `stars` (see STARS_SAFETY_TIMEOUT_MS). */
  timeoutMs?: number;
}

interface Outcome {
  status: SourceStatus;
  key: keyof RawSnapshot;
  data: unknown;
}

function emptyValue(key: keyof RawSnapshot): unknown {
  return key === 'stars' ? {} : [];
}

function countOf(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') return Object.keys(data).length;
  return 0;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function failure(c: Collector<any>, error: string): Outcome {
  return { status: { id: c.id, ok: false, count: 0, error, reduced: false }, key: c.key, data: emptyValue(c.key) };
}

async function runOne(c: Collector<any>, ctx: CollectCtx, opts: RunOpts): Promise<Outcome> {
  if (opts.failIds?.has(c.id)) return failure(c, 'forced failure');
  try {
    const ms = c.id === 'stars' ? STARS_SAFETY_TIMEOUT_MS : (opts.timeoutMs ?? COLLECTOR_TIMEOUT_MS);
    const { data, reduced } = await withTimeout(Promise.resolve().then(() => c.run(ctx)), ms);
    const count = countOf(data);
    if (count === 0 && NON_EMPTY_IDS.has(c.id)) {
      return { status: { id: c.id, ok: false, count: 0, error: 'parsed 0 items', reduced }, key: c.key, data: emptyValue(c.key) };
    }
    return { status: { id: c.id, ok: true, count, error: null, reduced }, key: c.key, data };
  } catch (e) {
    return failure(c, messageOf(e));
  }
}

/** Runs all collectors except `stars` in parallel, then `stars` last with `ctx.trendingToday` filled. */
export async function runCollectors(
  collectors: Collector<any>[],
  ctx: CollectCtx,
  opts: RunOpts,
): Promise<{ snapshot: RawSnapshot }> {
  const parallel = collectors.filter(c => c.id !== 'stars');
  const last = collectors.filter(c => c.id === 'stars');
  const settled = await Promise.allSettled(parallel.map(c => runOne(c, ctx, opts)));
  const outcomes: Outcome[] = settled.map((r, i) =>
    r.status === 'fulfilled' ? r.value : failure(parallel[i], messageOf(r.reason)));

  const trendingToday = new Set<string>();
  for (const o of outcomes) {
    if (o.key === 'trending' && o.status.ok) for (const r of o.data as RawSnapshot['trending']) trendingToday.add(r.fullName);
  }
  ctx.trendingToday = trendingToday;

  for (const c of last) outcomes.push(await runOne(c, ctx, opts));

  const snapshot: RawSnapshot = {
    date: ctx.date,
    collectedAt: ctx.now.toISOString(),
    mode: ctx.mode,
    sources: [],
    hn: [], trending: [], arxiv: [], geeknews: [], reddit: [], hfModels: [], tools: [], advisories: [], kit: [], stars: {},
  };
  const target = snapshot as unknown as Record<string, unknown>;
  for (const o of outcomes) {
    snapshot.sources.push(o.status);
    target[o.key] = o.data;
  }
  return { snapshot };
}

/** Marks today's trending repos and appends today's star count to each repo's series. Returns a new object. */
export function updateStarHistory(history: StarHistory, snapshot: RawSnapshot): StarHistory {
  const date = snapshot.date;
  const next: StarHistory = {};
  for (const [name, h] of Object.entries(history)) next[name] = { ...h, series: { ...h.series } };

  // Prefer the daily-period entry when a repo is in both lists.
  const trendingStars = new Map<string, number>();
  for (const r of snapshot.trending) {
    if (r.period === 'daily' || !trendingStars.has(r.fullName)) trendingStars.set(r.fullName, r.stars);
  }
  for (const [name, trendStars] of trendingStars) {
    const entry = next[name] ?? { firstSeen: date, lastTrending: date, series: {} };
    entry.lastTrending = date;
    entry.series[date] = snapshot.stars[name] ?? trendStars;
    next[name] = entry;
  }
  // Tracked repos not trending today: record only when the stars collector returned a value.
  for (const [name, stars] of Object.entries(snapshot.stars)) {
    if (trendingStars.has(name) || !next[name]) continue;
    next[name].series[date] = stars;
  }
  return next;
}
