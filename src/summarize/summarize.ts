import type { DailyReport } from '../schema.ts';
import { normalizeUrl } from '../lib/text.ts';
import { cleanText, parseJsonObject, type ChatFn } from './models.ts';
import { translateBatch, type TranslationCache } from './translate.ts';

export const SYSTEM_PROMPT =
  '너는 한국 개발자, 특히 AI로 코딩하는 바이브코더를 위한 뉴스 편집자다. 과장 없이, 사실만, 존댓말 해요체로 쓴다. 주어진 정보에 없는 사실은 만들지 않는다.';

const TOP_ISSUES = 5;
const MAX_TITLE = 120;
const MAX_SUMMARY = 400;
const MAX_CHECK = 160;

const FORMAT_HINT =
  '아래 이슈 목록을 한국어로 정리해 JSON만 출력해 주세요(설명이나 코드블록 없이). ' +
  '형식: {"issues":[{"id":"...","title_ko":"...","summary_ko":"...","check_ko":"..."}]}. ' +
  'id는 입력 그대로 쓰고, title_ko는 한국어 제목, summary_ko는 2~3문장 요약, check_ko는 직접 확인해 볼 점 1문장이에요.';

function issueInput(report: DailyReport) {
  return report.issues.slice(0, TOP_ISSUES).map((i) => ({
    id: i.id,
    title: i.title,
    heatReason: i.heatReason,
    sources: i.sources,
    items: i.items.slice(0, 6).map((it) => ({ source: it.source, title: it.title, points: it.points, comments: it.comments })),
  }));
}

async function fillIssues(report: DailyReport, chatFn: ChatFn): Promise<void> {
  const top = report.issues.slice(0, TOP_ISSUES);
  if (!top.length) return;
  const raw = await chatFn([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${FORMAT_HINT}\n\n${JSON.stringify(issueInput(report))}` },
  ]);
  const list = parseJsonObject(raw)?.issues;
  if (!Array.isArray(list)) return;
  const byId = new Map(top.map((i) => [i.id, i]));
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const issue = typeof e.id === 'string' ? byId.get(e.id) : undefined;
    if (!issue) continue;
    issue.title_ko = cleanText(e.title_ko, MAX_TITLE) ?? issue.title_ko;
    issue.summary_ko = cleanText(e.summary_ko, MAX_SUMMARY) ?? issue.summary_ko;
    issue.check_ko = cleanText(e.check_ko, MAX_CHECK) ?? issue.check_ko;
  }
}

const repoKey = (fullName: string) => `repo:${fullName}`;
const releaseKey = (t: { tool: string; version: string | null; publishedAt: string | null }) => {
  const v = t.version ?? t.publishedAt;
  return v ? `release:${t.tool}:${v}` : null;
};
const alertKey = (a: { origin: 'news' | 'advisory'; id: string; url: string }) =>
  a.origin === 'advisory' ? `advisory:${a.id}` : `news:${normalizeUrl(a.url)}`;

export async function summarizeReport(
  report: DailyReport,
  cache: TranslationCache,
  chatFn: ChatFn,
): Promise<{ report: DailyReport; cache: TranslationCache }> {
  const next = structuredClone(report);

  try {
    await fillIssues(next, chatFn);
  } catch (e) {
    console.warn(`summarize: issues skipped (${(e as Error).message})`);
  }

  const items: { key: string; text: string }[] = [];
  for (const t of next.tools) {
    const k = releaseKey(t);
    if (k && t.note) items.push({ key: k, text: t.note });
  }
  for (const r of next.rising) if (r.description) items.push({ key: repoKey(r.fullName), text: r.description });
  for (const k of next.kit) if (k.description) items.push({ key: repoKey(k.fullName), text: k.description });
  for (const a of next.alerts) items.push({ key: alertKey(a), text: a.title });

  const newCache = await translateBatch(items, cache, chatFn);
  const ko = (k: string | null) => (k ? newCache[k] ?? null : null);

  for (const t of next.tools) t.note_ko = ko(releaseKey(t)) ?? t.note_ko;
  for (const r of next.rising) r.description_ko = ko(repoKey(r.fullName)) ?? r.description_ko;
  for (const k of next.kit) k.description_ko = ko(repoKey(k.fullName)) ?? k.description_ko;
  for (const a of next.alerts) a.title_ko = ko(alertKey(a)) ?? a.title_ko;

  return { report: next, cache: newCache };
}
