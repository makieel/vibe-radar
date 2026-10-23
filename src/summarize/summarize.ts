import type { DailyReport } from '../schema.ts';
import { normalizeUrl } from '../lib/text.ts';
import { cleanText, parseJsonObject, type ChatFn } from './models.ts';
import { numbersPreserved, translateBatch, type TranslationCache } from './translate.ts';

export const SYSTEM_PROMPT =
  '너는 한국 개발자, 특히 AI로 코딩하는 바이브코더를 위한 뉴스 편집자다. 과장 없이, 사실만, 존댓말 해요체로 쓴다. 주어진 정보에 없는 사실은 만들지 않는다.';

const TOP_ISSUES = 5;
const MAX_TITLE = 120;
const MAX_SUMMARY = 400;
const MAX_CHECK = 160;

export const FORMAT_HINT =
  '아래 이슈 목록을 한국어로 정리해 JSON만 출력해 주세요(설명이나 코드블록 없이). ' +
  '형식: {"issues":[{"id":"...","title_ko":"...","summary_ko":"...","check_ko":"..."}]}. ' +
  'id는 입력 그대로 쓰고, title_ko는 한국어 제목, check_ko는 독자가 직접 확인해 볼 점 1문장이에요. ' +
  'summary_ko에는 title, items, excerpt에 실제로 적힌 사실만 쓰세요. 거기 없는 원인, 배경, 수치, 발언, 전망, 영향 추측은 절대 덧붙이지 마세요. ' +
  'excerpt가 null이면 summary_ko는 제목을 풀어 쓴 1문장만 쓰세요. excerpt가 있으면 2~3문장까지 쓸 수 있어요. ' +
  '확실하지 않으면 summary_ko를 빈 문자열로 두세요.';

export const VERIFY_PROMPT =
  '너는 사실 검증 담당이다. 각 항목의 summary_ko와 check_ko가 source에 적힌 내용만으로 뒷받침되는지 판정한다. ' +
  'source에 없는 원인, 배경, 수치, 인물의 발언, 전망, 영향 추측이 하나라도 있으면 뒷받침되지 않는 것이다. ' +
  '한국어 번역과 자연스러운 바꿔 말하기는 허용한다. 판단이 애매하면 뒷받침되지 않는 것으로 본다. ' +
  'JSON만 출력한다: {"unsupported":["id", ...]}';

const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ''));
const sentenceCount = (s: string) => Math.max(1, (s.trim().match(/[.!?。](?=\s|$)/g) ?? []).length);

/**
 * Rule check that runs before the AI verifier: returns a reason when `text` is not grounded in
 * `source` — a number that does not appear in the source, or more than one sentence when there
 * is no article excerpt (a title alone cannot support more). Null when the text passes.
 */
export function ungrounded(text: string, source: string, hasExcerpt: boolean): string | null {
  const src = source.replace(/,/g, '');
  const missing = numbersIn(text).filter((n) => !src.includes(n));
  if (missing.length) return `number not in source: ${missing.join(', ')}`;
  if (!hasExcerpt && sentenceCount(text) > 1) return 'more than one sentence without an article excerpt';
  return null;
}

type Excerpts = (url: string) => Promise<string | null>;

interface IssueSource {
  id: string;
  title: string;
  heatReason: string;
  items: { source: string; title: string; points: number | null; comments: number | null }[];
  excerpt: string | null;
}

const sourceText = (s: IssueSource) =>
  [s.title, s.heatReason, ...s.items.map((it) => `${it.title} ${it.points ?? ''} ${it.comments ?? ''}`), s.excerpt ?? ''].join('\n');

async function issueSources(report: DailyReport, excerpts: Excerpts): Promise<IssueSource[]> {
  const top = report.issues.slice(0, TOP_ISSUES);
  const texts = await Promise.all(top.map((i) => excerpts(i.url).catch(() => null)));
  return top.map((i, n) => ({
    id: i.id,
    title: i.title,
    heatReason: i.heatReason,
    items: i.items.slice(0, 6).map((it) => ({ source: it.source, title: it.title, points: it.points, comments: it.comments })),
    excerpt: texts[n],
  }));
}

/** Second AI pass: returns ids whose summary/check the verifier could not ground. Throws on failure. */
async function unsupportedIds(
  candidates: { src: IssueSource; summary: string; check: string | null }[],
  chatFn: ChatFn,
): Promise<Set<string>> {
  const payload = candidates.map((c) => ({
    id: c.src.id,
    source: { title: c.src.title, items: c.src.items.map((it) => it.title), excerpt: c.src.excerpt },
    summary_ko: c.summary,
    check_ko: c.check,
  }));
  const raw = await chatFn([
    { role: 'system', content: VERIFY_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ]);
  const list = parseJsonObject(raw)?.unsupported;
  if (!Array.isArray(list)) throw new Error('verifier returned no "unsupported" list');
  return new Set(list.filter((x): x is string => typeof x === 'string'));
}

async function fillIssues(report: DailyReport, chatFn: ChatFn, excerpts: Excerpts): Promise<void> {
  const top = report.issues.slice(0, TOP_ISSUES);
  if (!top.length) return;
  const sources = await issueSources(report, excerpts);
  const raw = await chatFn([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${FORMAT_HINT}\n\n${JSON.stringify(sources)}` },
  ]);
  const list = parseJsonObject(raw)?.issues;
  if (!Array.isArray(list)) return;
  const byId = new Map(top.map((i) => [i.id, i]));
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const candidates: { src: IssueSource; summary: string; check: string | null }[] = [];
  let rejected = 0;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const issue = typeof e.id === 'string' ? byId.get(e.id) : undefined;
    const src = typeof e.id === 'string' ? srcById.get(e.id) : undefined;
    if (!issue || !src) continue;
    const titleKo = cleanText(e.title_ko, MAX_TITLE);
    if (titleKo && numbersPreserved(titleKo, issue.title)) issue.title_ko = titleKo;
    else if (titleKo) console.warn(`summarize: dropped title for ${src.id} (numbers changed)`);
    const summary = cleanText(e.summary_ko, MAX_SUMMARY);
    if (!summary) continue;
    const check = cleanText(e.check_ko, MAX_CHECK);
    const text = sourceText(src);
    const reason = ungrounded(summary, text, src.excerpt !== null) ?? (check ? ungrounded(check, text, true) : null);
    if (reason) {
      rejected++;
      console.warn(`summarize: dropped summary for ${src.id} (${reason})`);
      continue;
    }
    candidates.push({ src, summary, check });
  }
  if (!candidates.length) return;
  let bad: Set<string>;
  try {
    bad = await unsupportedIds(candidates, chatFn);
  } catch (e) {
    console.warn(`summarize: verifier failed, dropping all ${candidates.length} summaries (${(e as Error).message})`);
    return;
  }
  let kept = 0;
  for (const c of candidates) {
    if (bad.has(c.src.id)) {
      rejected++;
      console.warn(`summarize: dropped summary for ${c.src.id} (verifier: unsupported)`);
      continue;
    }
    const issue = byId.get(c.src.id)!;
    issue.summary_ko = c.summary;
    issue.check_ko = c.check;
    kept++;
  }
  console.log(`summarize: ${kept} summaries kept, ${rejected} dropped as ungrounded`);
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
  opts: { excerpts?: Excerpts } = {},
): Promise<{ report: DailyReport; cache: TranslationCache }> {
  const next = structuredClone(report);

  try {
    await fillIssues(next, chatFn, opts.excerpts ?? (async () => null));
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
  // Cached entries are re-checked too, so a bad translation from an older run is never reused.
  const ko = (k: string | null, original: string | null) => {
    const t = k ? newCache[k] ?? null : null;
    return t && original && numbersPreserved(t, original) ? t : null;
  };

  for (const t of next.tools) t.note_ko = ko(releaseKey(t), t.note) ?? t.note_ko;
  for (const r of next.rising) r.description_ko = ko(repoKey(r.fullName), r.description) ?? r.description_ko;
  for (const k of next.kit) k.description_ko = ko(repoKey(k.fullName), k.description) ?? k.description_ko;
  for (const a of next.alerts) a.title_ko = ko(alertKey(a), a.title) ?? a.title_ko;

  return { report: next, cache: newCache };
}
