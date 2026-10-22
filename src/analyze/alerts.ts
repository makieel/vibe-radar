import type { Config } from '../config.ts';
import type { Alert, RawSnapshot } from '../schema.ts';
import { normalizeUrl } from '../lib/text.ts';

const MAX_ALERTS = 3;
const DAY_MS = 86_400_000;

function newsAlerts(raw: RawSnapshot, config: Config): Alert[] {
  const terms = config.securityTerms.map((t) => t.toLowerCase());
  const hit = (title: string) => {
    const lower = title.toLowerCase();
    return terms.some((t) => lower.includes(t));
  };
  const out: Alert[] = [];
  for (const h of [...raw.hn].sort((a, b) => b.points - a.points)) {
    if (hit(h.title)) out.push({ id: `hn-${h.id}`, title: h.title, title_ko: null, url: h.url, origin: 'news', severity: null, packages: [] });
  }
  for (const g of raw.geeknews) {
    if (hit(g.title)) out.push({ id: `geeknews-${g.id}`, title: g.title, title_ko: null, url: g.url, origin: 'news', severity: null, packages: [] });
  }
  return out;
}

function advisoryAlerts(raw: RawSnapshot, config: Config): Alert[] {
  const collected = Date.parse(raw.collectedAt);
  const out: Alert[] = [];
  for (const a of raw.advisories) {
    if (a.type !== 'reviewed') continue;
    if (a.severity !== 'critical' && a.severity !== 'high') continue;
    if (!(collected - Date.parse(a.publishedAt) <= DAY_MS)) continue;
    const eco = a.ecosystem.toLowerCase();
    const watch = eco === 'npm' ? config.watchlist.npm : eco === 'pip' || eco === 'pypi' ? config.watchlist.pip : [];
    const watched = new Set(watch.map((w) => w.toLowerCase()));
    if (!a.packages.some((p) => watched.has(p.toLowerCase()))) continue;
    out.push({ id: a.id, title: a.summary, title_ko: null, url: a.url, origin: 'advisory', severity: a.severity, packages: a.packages });
  }
  return out;
}

/** News first, then advisories; when a watchlist advisory qualifies, the last slot is kept for it. */
export function pickAlerts(raw: RawSnapshot, config: Config): Alert[] {
  const seen = new Set<string>();
  const unique: Alert[] = [];
  for (const a of [...newsAlerts(raw, config), ...advisoryAlerts(raw, config)]) {
    const key = normalizeUrl(a.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }
  const news = unique.filter((a) => a.origin === 'news');
  const advisories = unique.filter((a) => a.origin === 'advisory');
  const newsSlots = advisories.length > 0 ? MAX_ALERTS - 1 : MAX_ALERTS;
  return [...news.slice(0, newsSlots), ...advisories].slice(0, MAX_ALERTS);
}
