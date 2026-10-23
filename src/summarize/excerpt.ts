import { parse } from 'node-html-parser';
import { fetchText, type FetchLike } from '../lib/http.ts';

const MAX_EXCERPT = 1200;
const MIN_EXCERPT = 40;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Plain-text excerpt of an article page: og/meta description first, then paragraph text from
 * <article>/<main> (or the body). Gives the summarizer real source text instead of a bare title,
 * so it has less room to invent causes. Returns null when nothing useful is found.
 */
export function extractExcerpt(html: string, max = MAX_EXCERPT): string | null {
  const root = parse(html);
  root.querySelectorAll('script, style, noscript, nav, header, footer, aside').forEach((n) => n.remove());
  const meta =
    root.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
    root.querySelector('meta[name="description"]')?.getAttribute('content') ??
    '';
  const scope = root.querySelector('article') ?? root.querySelector('main') ?? root;
  const paras = scope.querySelectorAll('p').map((p) => clean(p.text)).filter((t) => t.length > 0);
  const parts = [clean(meta), ...paras].filter((t, i, a) => t && a.indexOf(t) === i);
  const text = clean(parts.join(' '));
  if (text.length < MIN_EXCERPT) return null;
  return text.slice(0, max);
}

/** Fetches a page and extracts its excerpt; any failure (non-http, HTTP error, timeout) → null. */
export async function fetchExcerpt(url: string, opts: { fetch?: FetchLike } = {}): Promise<string | null> {
  try {
    const protocol = new URL(url).protocol;
    if (protocol !== 'https:' && protocol !== 'http:') return null;
    const html = await fetchText(url, { fetch: opts.fetch, timeoutMs: 10_000, headers: { Accept: 'text/html' } });
    return extractExcerpt(html);
  } catch {
    return null;
  }
}
