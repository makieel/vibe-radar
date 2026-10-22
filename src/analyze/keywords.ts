import type { KeywordTrend } from '../schema.ts';
import { tokenSequence } from '../lib/text.ts';

// Document frequency of unigrams and adjacent-token bigrams ("a b").
export function extractTerms(docs: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const seq = tokenSequence(doc);
    const terms = new Set<string>();
    for (let i = 0; i < seq.length; i++) {
      const cur = seq[i]!;
      if (!cur.keep) continue;
      terms.add(cur.token);
      const next = seq[i + 1];
      if (next?.keep) terms.add(`${cur.token} ${next.token}`);
    }
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

// `previous` is the term maps of up to 7 earlier days.
export function keywordTrends(
  today: Map<string, number>,
  previous: Map<string, number>[],
  topN = 20,
): KeywordTrend[] {
  const trends: KeywordTrend[] = [];
  for (const [term, count] of today) {
    let avg7: number | null = null;
    if (previous.length >= 7) {
      const sum = previous.reduce((acc, m) => acc + (m.get(term) ?? 0), 0);
      avg7 = Math.round((sum / previous.length) * 100) / 100;
    }
    trends.push({
      term,
      today: count,
      avg7,
      delta: avg7 === null ? null : Math.round((count - avg7) * 100) / 100,
      isNew: previous.length >= 1 && previous.every((m) => !m.has(term)),
    });
  }
  trends.sort((a, b) => b.today - a.today || (b.delta ?? 0) - (a.delta ?? 0) || a.term.localeCompare(b.term));
  return trends.slice(0, topN);
}
