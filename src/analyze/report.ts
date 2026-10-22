import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type Config } from '../config.ts';
import type { StarHistory } from '../collectors/types.ts';
import { DailyReportSchema, RawSnapshotSchema, type DailyReport, type RawSnapshot } from '../schema.ts';
import { pickAlerts } from './alerts.ts';
import { clusterIssues } from './cluster.ts';
import { computeGauge } from './gauge.ts';
import { extractTerms, keywordTrends } from './keywords.ts';
import { kitCards } from './kit.ts';
import { repoChanges, risingRepos } from './repos.ts';
import { toolCards } from './tools.ts';

const MAX_ISSUES = 30;
const MAX_HN = 30;

export interface ReportInput {
  raw: RawSnapshot;
  prevRaw: RawSnapshot | null;
  previous: DailyReport[];
  /** Term maps of up to 7 earlier raw snapshots, newest first (R5). */
  previousTerms?: Map<string, number>[];
  history: StarHistory;
  config: Config;
  scanNo: number;
}

/** Same document set for today and for previous days. arXiv titles are left out (papers have their own view). */
export function keywordDocs(raw: RawSnapshot): string[] {
  return [
    ...raw.hn.map((x) => x.title),
    ...raw.geeknews.map((x) => x.title),
    ...raw.reddit.map((x) => x.title),
    ...raw.trending.flatMap((x) => (x.description ? [x.description] : [])),
  ];
}

export function buildDailyReport(input: ReportInput): DailyReport {
  const { raw, prevRaw, previous, history, config } = input;
  const issues = clusterIssues(raw).slice(0, MAX_ISSUES);
  const { newRepos, droppedRepos } = repoChanges(raw, prevRaw);
  const cats = new Map<string, number>();
  for (const p of raw.arxiv) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);

  return DailyReportSchema.parse({
    schemaVersion: 1,
    date: raw.date,
    collectedAt: raw.collectedAt,
    mode: raw.mode,
    scanNo: input.scanNo,
    sources: raw.sources,
    gauge: computeGauge(issues, previous),
    issues,
    alerts: pickAlerts(raw, config),
    tools: toolCards(raw, config),
    rising: risingRepos(raw, history),
    newRepos,
    droppedRepos,
    kit: kitCards(raw, config),
    keywords: keywordTrends(extractTerms(keywordDocs(raw)), input.previousTerms ?? []),
    papers: raw.arxiv,
    paperCategories: [...cats].map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    hfModels: raw.hfModels,
    feeds: {
      hn: [...raw.hn].sort((a, b) => b.points - a.points).slice(0, MAX_HN),
      geeknews: raw.geeknews,
      reddit: raw.reddit,
    },
  });
}

function datesIn(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export function rawDates(dataDir = 'data'): string[] {
  return datesIn(join(dataDir, 'raw'));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function analyzeDate(date: string, dataDir = 'data'): DailyReport {
  const raw = RawSnapshotSchema.parse(readJson(join(dataDir, 'raw', `${date}.json`)));
  const prevRaws = rawDates(dataDir).filter((d) => d < date).slice(-7).reverse()
    .map((d) => RawSnapshotSchema.parse(readJson(join(dataDir, 'raw', `${d}.json`))));
  const dailyDates = datesIn(join(dataDir, 'daily')).filter((d) => d < date);
  const previous = dailyDates.slice(-7)
    .map((d) => DailyReportSchema.parse(readJson(join(dataDir, 'daily', `${d}.json`))));
  let history: StarHistory = {};
  try {
    history = readJson(join(dataDir, 'stars', 'history.json')) as StarHistory;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const report = buildDailyReport({
    raw,
    prevRaw: prevRaws[0] ?? null,
    previous,
    previousTerms: prevRaws.map((r) => extractTerms(keywordDocs(r))),
    history,
    config: loadConfig(),
    scanNo: dailyDates.length + 1,
  });
  mkdirSync(join(dataDir, 'daily'), { recursive: true });
  writeFileSync(join(dataDir, 'daily', `${date}.json`), JSON.stringify(report, null, 2) + '\n');
  return report;
}
