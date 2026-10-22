import { fetchJson } from '../lib/http.ts';
import type { Advisory } from '../schema.ts';
import type { Collector } from './types.ts';

const ECOSYSTEMS = ['npm', 'pip'] as const;
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const TYPES = new Set(['reviewed', 'malware', 'unreviewed']);

export function parseAdvisories(json: unknown, ecosystem: string): Advisory[] {
  if (!Array.isArray(json)) return [];
  const out: Advisory[] = [];
  for (const a of json) {
    if (!a || typeof a !== 'object') continue;
    const j = a as Record<string, any>;
    if (typeof j.ghsa_id !== 'string' || typeof j.summary !== 'string' || typeof j.published_at !== 'string') continue;
    if (typeof j.html_url !== 'string' || !/^https?:\/\//i.test(j.html_url)) continue;
    const vulns = Array.isArray(j.vulnerabilities) ? j.vulnerabilities : [];
    const packages = [...new Set(vulns.map((v: any) => v?.package?.name).filter((n: unknown): n is string => typeof n === 'string' && n !== ''))] as string[];
    out.push({
      id: j.ghsa_id,
      summary: j.summary,
      // GitHub may report severity "unknown" (e.g. malware); the schema has no such level, so it lands on the lowest.
      severity: SEVERITIES.has(j.severity) ? j.severity : 'low',
      type: TYPES.has(j.type) ? j.type : 'unreviewed',
      ecosystem,
      packages,
      url: j.html_url,
      publishedAt: j.published_at,
    });
  }
  return out;
}

export const advisoriesCollector: Collector<'advisories'> = {
  id: 'advisories',
  key: 'advisories',
  async run(ctx) {
    const results = await Promise.allSettled(
      ECOSYSTEMS.map(async eco =>
        parseAdvisories(
          await fetchJson<unknown>(`https://api.github.com/advisories?ecosystem=${eco}&per_page=30&sort=published&direction=desc`, { fetch: ctx.fetch, token: ctx.token }),
          eco,
        ),
      ),
    );
    const data: Advisory[] = [];
    let failures = 0;
    let firstError: unknown;
    for (const r of results) {
      if (r.status === 'fulfilled') data.push(...r.value);
      else {
        failures++;
        firstError ??= r.reason;
      }
    }
    if (failures === ECOSYSTEMS.length) throw firstError instanceof Error ? firstError : new Error('all advisory fetches failed');
    return { data, reduced: false };
  },
};
