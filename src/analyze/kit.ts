import type { Config } from '../config.ts';
import type { KitCard, KitRepo, RawSnapshot } from '../schema.ts';

const NEW_DAYS_MS = 30 * 86_400_000;
const MATCH_RE = /mcp|skill|agent|rules/i;

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
  const byName = new Map<string, KitRepo>();
  for (const k of raw.kit) byName.set(k.fullName.toLowerCase(), k);
  for (const t of raw.trending) {
    const key = t.fullName.toLowerCase();
    if (byName.has(key) || !t.description) continue;
    const desc = t.description.toLowerCase();
    if (!MATCH_RE.test(desc) && !topics.some((x) => desc.includes(x))) continue;
    byName.set(key, { fullName: t.fullName, url: t.url, description: t.description, stars: t.stars, createdAt: null, topics: [] });
  }
  const now = Date.parse(raw.collectedAt);
  return [...byName.values()]
    .sort((a, b) => b.stars - a.stars)
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
