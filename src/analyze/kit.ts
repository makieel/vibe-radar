import type { Config } from '../config.ts';
import type { KitCard, KitRepo, RawSnapshot } from '../schema.ts';

const NEW_DAYS_MS = 30 * 86_400_000;
// R14: generic "agent" alone does not qualify a trending repo.
const MATCH_RE = /\bmcp\b|skill|rules|cursor-rules|claude\.md|agents\.md|plugin/i;

// Checked in order; first match wins. Leading \b keeps "client" from reading as CLI.
const KINDS: [RegExp, KitCard['kind']][] = [
  [/\bmcp/i, 'MCP'],
  [/\bskill/i, 'SKILL'],
  [/(\bcursor-?rules|\brules\b|claude\.md|agents\.md)/i, 'RULES'],
  [/\bcli\b/i, 'CLI'],
  [/\bagent/i, 'AGENT'],
];

function kindOf(text: string): KitCard['kind'] {
  return KINDS.find(([re]) => re.test(text))?.[1] ?? 'OTHER';
}

export function kitCards(raw: RawSnapshot, config: Config, topN = 12): KitCard[] {
  const topics = config.kitTopics.map((t) => t.toLowerCase());
  const search = [...raw.kit].sort((x, y) => y.stars - x.stars);
  const seen = new Set(search.map((k) => k.fullName.toLowerCase()));
  const matched: KitRepo[] = [];
  for (const t of [...raw.trending].sort((x, y) => y.stars - x.stars)) {
    const key = t.fullName.toLowerCase();
    if (seen.has(key)) continue;
    const text = `${t.fullName} ${t.description ?? ''}`.toLowerCase();
    if (!MATCH_RE.test(text) && !topics.some((x) => text.includes(x))) continue;
    seen.add(key);
    matched.push({ fullName: t.fullName, url: t.url, description: t.description, stars: t.stars, createdAt: null, topics: [] });
  }
  const now = Date.parse(raw.collectedAt);
  return [...search, ...matched]
    .slice(0, topN)
    .map((k): KitCard => ({
      fullName: k.fullName,
      url: k.url,
      description: k.description,
      description_ko: null,
      stars: k.stars,
      kind: kindOf(`${k.fullName} ${k.description ?? ''} ${k.topics.join(' ')}`),
      isNew: !!k.createdAt && now - Date.parse(k.createdAt) <= NEW_DAYS_MS,
    }));
}
