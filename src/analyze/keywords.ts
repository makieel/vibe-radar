import type { KeywordTrend } from '../schema.ts';
import { tokenSequence } from '../lib/text.ts';

/**
 * Document frequency of unigrams and adjacent-token bigrams ("a b").
 * A plural token `xs` is folded into `x` only when `x` itself occurs in the same document set
 * (agents → agent when "agent" appears; "kubernetes" stays).
 */
export function extractTerms(docs: string[]): Map<string, number> {
  const seqs = docs.map((doc) => tokenSequence(doc));
  const vocab = new Set<string>();
  for (const seq of seqs) for (const t of seq) if (t.keep) vocab.add(t.token);
  const fold = (t: string): string => (t.length > 2 && t.endsWith('s') && !t.endsWith('ss') && vocab.has(t.slice(0, -1)) ? t.slice(0, -1) : t);
  const counts = new Map<string, number>();
  for (const seq of seqs) {
    const terms = new Set<string>();
    for (let i = 0; i < seq.length; i++) {
      const cur = seq[i]!;
      if (!cur.keep) continue;
      terms.add(fold(cur.token));
      const next = seq[i + 1];
      if (next?.keep) terms.add(`${fold(cur.token)} ${fold(next.token)}`);
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
  // With 7 days of history the list is "rising" words (delta desc); before that, today's most frequent words.
  if (previous.length >= 7) trends.sort((a, b) => b.delta! - a.delta! || b.today - a.today || a.term.localeCompare(b.term));
  else trends.sort((a, b) => b.today - a.today || a.term.localeCompare(b.term));
  return trends.slice(0, topN);
}
