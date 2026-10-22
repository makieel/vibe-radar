import type { Config } from '../config.ts';
import type { RawSnapshot, ToolCard } from '../schema.ts';

const WEEK_MS = 7 * 86_400_000;

/**
 * One card per collected release, plus an all-null card for every configured tool that has no
 * release today (its absence stays visible). Order: recent first, then tools with a release by
 * newest date, then tools without a release.
 */
export function toolCards(raw: RawSnapshot, config: Config): ToolCard[] {
  const now = Date.parse(raw.collectedAt);
  const ts = (p: string | null) => (p ? Date.parse(p) : Number.NaN);
  const key = (p: string | null) => (Number.isFinite(ts(p)) ? ts(p) : -Infinity);
  const cards = raw.tools.map((t): ToolCard => ({
    ...t,
    note_ko: null,
    isRecent: Number.isFinite(ts(t.publishedAt)) && now - ts(t.publishedAt) <= WEEK_MS,
  }));
  const have = new Set(raw.tools.map((t) => t.tool));
  for (const t of config.tools) {
    if (have.has(t.id)) continue;
    cards.push({ tool: t.id, name: t.name, version: null, publishedAt: null, url: null, note: null, note_ko: null, isRecent: false });
  }
  return cards.sort((a, b) => {
    if (a.isRecent !== b.isRecent) return a.isRecent ? -1 : 1;
    if ((a.url === null) !== (b.url === null)) return a.url === null ? 1 : -1;
    const ka = key(a.publishedAt);
    const kb = key(b.publishedAt);
    return ka === kb ? 0 : kb > ka ? 1 : -1;
  });
}
