import { STOPWORDS } from '../analyze/stopwords.ts';

export function normalizeUrl(u: string): string {
  const raw = u.trim();
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const params = [...url.searchParams.entries()].filter(([k]) => !/^utm_/i.test(k));
    const query = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
    const path = url.pathname.replace(/\/+$/, '');
    return host + path + query;
  } catch {
    return raw.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

export function domainOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- tokenizing ----
const TOKEN_RE = /[a-z0-9][a-z0-9._+#-]*(?:'[a-z]+)?|[가-힣]+/g;
const KO_PARTICLES = new Set(['은', '는', '이', '가', '을', '를', '의', '에', '도', '로', '와', '과']);

export interface TermToken {
  token: string;
  keep: boolean;
}

// Every token candidate in order, with `keep` telling whether it survives the
// filters. Dropped tokens stay in the sequence so bigrams never span them.
export function tokenSequence(s: string): TermToken[] {
  const out: TermToken[] = [];
  for (const m of s.toLowerCase().replace(/[‘’]/g, "'").matchAll(TOKEN_RE)) {
    let t = m[0];
    const hangul = /^[가-힣]/.test(t);
    if (hangul) {
      if (t.length >= 3 && KO_PARTICLES.has(t[t.length - 1]!)) t = t.slice(0, -1);
    } else {
      t = t.replace(/'s$/, '').replace(/[._+#-]+$/, '');
    }
    const minLen = hangul ? 2 : 3;
    const keep = t.length >= minLen && !/^\d+$/.test(t) && !t.includes("'") && !STOPWORDS.has(t);
    out.push({ token: t, keep });
  }
  return out;
}

export function tokenize(s: string): string[] {
  return tokenSequence(s).filter((t) => t.keep).map((t) => t.token);
}
