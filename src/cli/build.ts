import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeDate } from '../analyze/report.ts';
import { daysBetween, isIsoDate, kstDate } from '../lib/dates.ts';
import { DailyReportSchema, SiteIndexSchema, type SiteIndex } from '../schema.ts';

export interface ExportOpts {
  dataDir: string;
  outDir: string;
  today: string;
  keepDays?: number;
}

/** 폴더 안의 `YYYY-MM-DD.json` 날짜 목록(오름차순). 유효하지 않은 이름은 무시한다. */
function datesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json') && isIsoDate(f.slice(0, -5)))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export function exportSite(opts: ExportOpts): SiteIndex {
  const { dataDir, outDir, today, keepDays = 90 } = opts;
  const recent = (d: string): boolean => {
    const n = daysBetween(d, today);
    return n >= 0 && n <= keepDays - 1;
  };

  // 1. raw만 있고 daily가 없는 날은 오래된 날부터 분석한다(뒤 날짜가 앞 날짜 daily를 쓴다).
  const haveDaily = new Set(datesIn(join(dataDir, 'daily')));
  for (const d of datesIn(join(dataDir, 'raw')).filter(recent)) {
    if (!haveDaily.has(d)) analyzeDate(d, dataDir);
  }

  // 2. 최근 daily를 검증하고 복사한다.
  const dates = datesIn(join(dataDir, 'daily')).filter(recent).reverse();
  const daysDir = join(outDir, 'days');
  mkdirSync(daysDir, { recursive: true });
  const reports = new Map<string, string>();
  for (const d of dates) {
    const file = join(dataDir, 'daily', `${d}.json`);
    try {
      DailyReportSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    } catch (e) {
      throw new Error(`invalid daily file ${d}.json (${file}): ${(e as Error).message}`, { cause: e });
    }
    reports.set(d, file);
  }
  for (const [d, file] of reports) copyFileSync(file, join(daysDir, `${d}.json`));

  // 3. 오래된 파일을 지운다.
  for (const f of readdirSync(daysDir)) {
    const d = f.slice(0, -5);
    if (f.endsWith('.json') && isIsoDate(d) && !reports.has(d)) rmSync(join(daysDir, f));
  }

  // 4. latest / index
  const latest = dates[0] ?? null;
  const index = SiteIndexSchema.parse({ latest, dates });
  if (latest) copyFileSync(reports.get(latest)!, join(outDir, 'latest.json'));
  else if (existsSync(join(outDir, 'latest.json'))) rmSync(join(outDir, 'latest.json'));
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return index;
}

if (import.meta.main) {
  try {
    const idx = exportSite({ dataDir: 'data', outDir: join('web', 'data'), today: kstDate(new Date()) });
    console.log(`exported ${idx.dates.length} day(s), latest: ${idx.latest ?? 'none'}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
