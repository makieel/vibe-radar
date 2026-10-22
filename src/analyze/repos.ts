import type { StarHistory } from '../collectors/types.ts';
import { addDays } from '../lib/dates.ts';
import type { RawSnapshot, RepoRef, RisingRepo, TrendingRepo } from '../schema.ts';

const NEW_DAYS_MS = 30 * 86_400_000;

function uniqueTrending(raw: RawSnapshot): TrendingRepo[] {
  const seen = new Set<string>();
  const out: TrendingRepo[] = [];
  for (const t of raw.trending) {
    const k = t.fullName.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function risingRepos(raw: RawSnapshot, history: StarHistory, topN = 10): RisingRepo[] {
  const weekAgo = addDays(raw.date, -7);
  const seriesFrom = addDays(raw.date, -29);
  const createdAt = new Map(raw.kit.map((k) => [k.fullName.toLowerCase(), k.createdAt]));
  const out: RisingRepo[] = [];
  for (const t of uniqueTrending(raw)) {
    const key = t.fullName.toLowerCase();
    const entry = history[t.fullName] ?? Object.entries(history).find(([k]) => k.toLowerCase() === key)?.[1];
    const points = Object.entries(entry?.series ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const old = points.filter(([d]) => d <= weekAgo).at(-1);
    let delta7: number;
    let deltaSource: RisingRepo['deltaSource'];
    if (old) {
      delta7 = t.stars - old[1];
      deltaSource = 'history';
    } else {
      const weekly = raw.trending.find((x) => x.period === 'weekly' && x.fullName.toLowerCase() === key);
      if (!weekly) continue;
      delta7 = weekly.starsInPeriod;
      deltaSource = 'trending-weekly';
    }
    const created = createdAt.get(key);
    out.push({
      fullName: t.fullName,
      url: t.url,
      description: t.description,
      description_ko: null,
      stars: t.stars,
      delta7,
      deltaSource,
      isNew: !!created && Date.parse(raw.collectedAt) - Date.parse(created) <= NEW_DAYS_MS,
      series: points.filter(([d]) => d >= seriesFrom).map(([date, stars]) => ({ date, stars })),
    });
  }
  return out.sort((a, b) => b.delta7 - a.delta7).slice(0, topN);
}

const ref = (t: TrendingRepo): RepoRef => ({
  fullName: t.fullName, url: t.url, description: t.description, language: t.language, stars: t.stars,
});

export function repoChanges(raw: RawSnapshot, prevRaw: RawSnapshot | null): { newRepos: RepoRef[]; droppedRepos: RepoRef[] } {
  if (!prevRaw) return { newRepos: [], droppedRepos: [] };
  // A failed trending fetch would make every repo look new or dropped.
  const failed = (r: RawSnapshot) => r.sources.some((s) => s.id === 'trending' && !s.ok);
  if (failed(raw) || failed(prevRaw)) return { newRepos: [], droppedRepos: [] };
  const today = uniqueTrending(raw);
  const prev = uniqueTrending(prevRaw);
  const todaySet = new Set(today.map((t) => t.fullName.toLowerCase()));
  const prevSet = new Set(prev.map((t) => t.fullName.toLowerCase()));
  return {
    newRepos: today.filter((t) => !prevSet.has(t.fullName.toLowerCase())).map(ref),
    droppedRepos: prev.filter((t) => !todaySet.has(t.fullName.toLowerCase())).map(ref),
  };
}
