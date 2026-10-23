import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isIsoDate, kstDate } from '../lib/dates.ts';
import { DailyReportSchema } from '../schema.ts';
import { loadConfig } from '../config.ts';
import { makeChatFn } from '../summarize/models.ts';
import { summarizeReport } from '../summarize/summarize.ts';
import type { TranslationCache } from '../summarize/translate.ts';

const ROOT = new URL('../../data/', import.meta.url);
const CACHE = new URL('cache/translations.json', ROOT);

function dailyDates(): string[] {
  const dir = new URL('daily/', ROOT);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter((d): d is string => !!d).sort();
}

function loadCache(): TranslationCache {
  try {
    const v: unknown = JSON.parse(readFileSync(CACHE, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as TranslationCache) : {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

async function main(): Promise<void> {
  const { ai } = loadConfig();
  const apiKey = process.env[ai.keyEnv];
  if (!apiKey) {
    console.log(`summarize: skipped (no ${ai.keyEnv})`);
    return;
  }
  const i = process.argv.indexOf('--date');
  let date = i >= 0 ? process.argv[i + 1] ?? '' : kstDate(new Date());
  if (!isIsoDate(date)) throw new Error(`invalid --date "${date}" (expected YYYY-MM-DD)`);
  const dates = dailyDates();
  if (!dates.includes(date)) {
    const latest = dates.at(-1);
    if (!latest) throw new Error('no daily files in data/daily — run npm run analyze first');
    console.warn(`no daily file for ${date}; using newest daily ${latest}`);
    date = latest;
  }
  const file = new URL(`daily/${date}.json`, ROOT);
  const report = DailyReportSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const client = makeChatFn({ apiKey, baseUrl: ai.baseUrl, models: ai.models, timeoutMs: ai.timeoutMs });
  const { report: updated, cache } = await summarizeReport(report, loadCache(), client.chat);
  const valid = DailyReportSchema.parse(updated);
  mkdirSync(new URL('cache/', ROOT), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
  writeFileSync(file, JSON.stringify(valid, null, 2) + '\n');
  console.log(`summarize: updated data/daily/${date}.json with model ${client.model() ?? 'none'} (cache ${Object.keys(cache).length} entries)`);
}

main().catch((e) => {
  console.error('summarize: failed, daily file left untouched —', e);
});
