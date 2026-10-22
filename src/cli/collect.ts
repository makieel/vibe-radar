import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { ALL_COLLECTORS } from '../collectors/index.ts';
import { runCollectors, updateStarHistory } from '../collectors/run.ts';
import type { CollectCtx, StarHistory } from '../collectors/types.ts';
import { kstDate } from '../lib/dates.ts';
import { RawSnapshotSchema, SourceIdSchema, type SourceId } from '../schema.ts';

const ROOT = new URL('../../data/', import.meta.url);

function loadHistory(): StarHistory {
  try {
    return JSON.parse(readFileSync(new URL('stars/history.json', ROOT), 'utf8')) as StarHistory;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

function parseFailIds(env: string | undefined): Set<SourceId> {
  const ids = new Set<SourceId>();
  for (const part of (env ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const parsed = SourceIdSchema.safeParse(part);
    if (parsed.success) ids.add(parsed.data);
    else console.warn(`VR_FAIL_SOURCES: unknown source "${part}" ignored`);
  }
  return ids;
}

const pad = (s: string, n: number) => s.padEnd(n);

async function main(): Promise<void> {
  const now = new Date();
  const date = kstDate(now);
  const token = process.env.GITHUB_TOKEN || null;
  const mode = token ? 'full' : 'reduced';
  const history = loadHistory();
  const ctx: CollectCtx = { mode, token, fetch, now, config: loadConfig(), date, history, trendingToday: new Set() };

  const { snapshot } = await runCollectors(ALL_COLLECTORS, ctx, { failIds: parseFailIds(process.env.VR_FAIL_SOURCES) });
  const valid = RawSnapshotSchema.parse(snapshot);

  mkdirSync(new URL('raw/', ROOT), { recursive: true });
  mkdirSync(new URL('stars/', ROOT), { recursive: true });
  writeFileSync(new URL(`raw/${date}.json`, ROOT), JSON.stringify(valid, null, 2) + '\n');
  writeFileSync(new URL('stars/history.json', ROOT), JSON.stringify(updateStarHistory(history, valid), null, 2) + '\n');

  console.log(`${pad('source', 12)}${pad('ok', 7)}${pad('count', 7)}${pad('reduced', 9)}error`);
  for (const s of valid.sources) {
    console.log(`${pad(s.id, 12)}${pad(String(s.ok), 7)}${pad(String(s.count), 7)}${pad(String(s.reduced), 9)}${s.error ?? ''}`);
  }
  console.log(`mode: ${mode}`);
  console.log(`date: ${date}`);
  process.exitCode = valid.sources.some(s => s.ok) ? 0 : 1;
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
