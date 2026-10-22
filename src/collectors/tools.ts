import { XMLParser } from 'fast-xml-parser';
import { parse } from 'node-html-parser';
import type { Config } from '../config.ts';
import { fetchJson, fetchText } from '../lib/http.ts';
import { stripMarkdown } from '../lib/text.ts';
import { textOf } from '../lib/xml.ts';
import type { ToolRelease } from '../schema.ts';
import type { Collector } from './types.ts';

type ToolDef = Config['tools'][number];

const NOTE_MAX = 120;
const COPILOT_FEED = 'https://github.blog/changelog/feed/';
const CURSOR_PAGE = 'https://cursor.com/changelog';
const isHttpUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);
const clip = (s: string): string | null => (s ? s.slice(0, NOTE_MAX) : null);

function firstBullet(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  const m = body.match(/^[ \t]*[-*+][ \t]+(.+)$/m);
  return m ? clip(stripMarkdown(m[1])) : null;
}

/** Accepts a single release object (`/releases/latest`) or a releases array; drafts and prereleases are skipped. */
export function parseGhRelease(json: unknown, tool: ToolDef): ToolRelease | null {
  const list = Array.isArray(json) ? json : [json];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const j = r as Record<string, unknown>;
    if (j.draft === true || j.prerelease === true) continue;
    if (typeof j.tag_name !== 'string' || !j.tag_name || !isHttpUrl(j.html_url)) continue;
    return {
      tool: tool.id,
      name: tool.name,
      version: j.tag_name,
      publishedAt: typeof j.published_at === 'string' ? j.published_at : null,
      url: j.html_url,
      note: firstBullet(j.body),
    };
  }
  return null;
}

const rssParser = new XMLParser({ ignoreAttributes: true });

export function parseCopilotFeed(xml: string): ToolRelease | null {
  let items: unknown;
  try {
    items = rssParser.parse(xml)?.rss?.channel?.item;
  } catch {
    return null;
  }
  const list = Array.isArray(items) ? items : items ? [items] : [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const title = textOf((it as any).title);
    const link = textOf((it as any).link);
    if (!/copilot/i.test(title) || !isHttpUrl(link)) continue;
    const ms = Date.parse(textOf((it as any).pubDate));
    return {
      tool: 'copilot',
      name: 'GitHub Copilot',
      version: null,
      publishedAt: Number.isNaN(ms) ? null : new Date(ms).toISOString(),
      url: link,
      note: clip(title),
    };
  }
  return null;
}

/**
 * Selectors (cursor.com/changelog): first `article`, title = its `h1`, link = `h1 a[href]`,
 * date = `time[datetime]` (first 10 chars). The page has no version numbers in the current
 * layout, so `version` is a "N.N[.N]" found in the title, else null; `note` is the title.
 */
export function parseCursorChangelog(html: string): ToolRelease | null {
  try {
    const art = parse(html).querySelector('article');
    const title = art?.querySelector('h1')?.text.replace(/\s+/g, ' ').trim();
    if (!art || !title) return null;
    const href = art.querySelector('h1 a')?.getAttribute('href') ?? art.querySelector('a[href^="/changelog/"]')?.getAttribute('href');
    let url = CURSOR_PAGE;
    if (href) {
      try {
        const abs = new URL(href, CURSOR_PAGE).toString();
        if (isHttpUrl(abs)) url = abs;
      } catch { /* keep default */ }
    }
    const dt = art.querySelector('time')?.getAttribute('datetime')?.slice(0, 10);
    return {
      tool: 'cursor',
      name: 'Cursor',
      version: title.match(/\b(\d+\.\d+(?:\.\d+)?)\b/)?.[1] ?? null,
      publishedAt: dt && /^\d{4}-\d{2}-\d{2}$/.test(dt) ? dt : null,
      url,
      note: clip(title),
    };
  } catch {
    return null;
  }
}

export const toolsCollector: Collector<'tools'> = {
  id: 'tools',
  key: 'tools',
  async run(ctx) {
    const opts = { fetch: ctx.fetch, token: ctx.token };
    const jobs = ctx.config.tools.map(async (t): Promise<ToolRelease | null> => {
      if (t.kind === 'github-release') {
        if (!t.repo) return null;
        // `/releases/latest` is GitHub's newest non-draft, non-prerelease release (1 call per tool).
        return parseGhRelease(await fetchJson<unknown>(`https://api.github.com/repos/${t.repo}/releases/latest`, opts), t);
      }
      if (t.kind === 'copilot-feed') return parseCopilotFeed(await fetchText(COPILOT_FEED, opts));
      return parseCursorChangelog(await fetchText(CURSOR_PAGE, opts));
    });
    const results = await Promise.allSettled(jobs);
    const data: ToolRelease[] = [];
    let failures = 0;
    let firstError: unknown;
    results.forEach((r, i) => {
      const name = ctx.config.tools[i]!.name;
      if (r.status === 'fulfilled') {
        if (r.value) data.push(r.value);
        else console.warn(`tools: no release found for ${name}; omitted`);
      } else {
        failures++;
        firstError ??= r.reason;
        console.warn(`tools: ${name} failed (${r.reason instanceof Error ? r.reason.message : String(r.reason)}); omitted`);
      }
    });
    if (results.length > 0 && failures === results.length) throw firstError instanceof Error ? firstError : new Error('all tool fetches failed');
    return { data, reduced: false };
  },
};
