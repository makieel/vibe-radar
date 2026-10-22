import type { RawSnapshot, ToolCard } from '../schema.ts';

const WEEK_MS = 7 * 86_400_000;

export function toolCards(raw: RawSnapshot): ToolCard[] {
  const now = Date.parse(raw.collectedAt);
  const ts = (p: string | null) => (p ? Date.parse(p) : Number.NaN);
  const key = (p: string | null) => (Number.isFinite(ts(p)) ? ts(p) : -Infinity);
  const cards = raw.tools.map((t): ToolCard => ({
    ...t,
    note_ko: null,
    isRecent: Number.isFinite(ts(t.publishedAt)) && now - ts(t.publishedAt) <= WEEK_MS,
  }));
  return cards.sort((a, b) => {
    if (a.isRecent !== b.isRecent) return a.isRecent ? -1 : 1;
    const ka = key(a.publishedAt);
    const kb = key(b.publishedAt);
    return ka === kb ? 0 : kb > ka ? 1 : -1;
  });
}
