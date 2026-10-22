import { cleanText, parseJsonObject, type ChatFn } from './models.ts';

export type TranslationCache = Record<string, string>;

export const BATCH_SIZE = 40;
export const MAX_TRANSLATION = 200;
const MAX_SOURCE = 600;

const TRANSLATE_SYSTEM =
  '너는 개발 뉴스 번역가다. 입력은 {"키":"영어 원문"} JSON이다. 각 원문을 자연스러운 한국어 한 문장(해요체 또는 명사형)으로 번역한다. 고유명사와 제품명은 그대로 둔다. 원문에 없는 내용은 덧붙이지 않는다. 같은 키를 쓴 {"키":"번역"} JSON만 출력한다.';

export async function translateBatch(
  items: { key: string; text: string }[],
  cache: TranslationCache,
  chatFn: ChatFn,
): Promise<TranslationCache> {
  const out: TranslationCache = { ...cache };
  const seen = new Set<string>();
  const todo = items.filter((it) => {
    if (out[it.key] || seen.has(it.key) || !it.text.trim()) return false;
    seen.add(it.key);
    return true;
  });
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const payload = Object.fromEntries(batch.map((b) => [b.key, b.text.trim().slice(0, MAX_SOURCE)]));
    try {
      const raw = await chatFn([
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: JSON.stringify(payload) },
      ]);
      const parsed = parseJsonObject(raw);
      if (!parsed) continue;
      for (const b of batch) {
        const t = cleanText(parsed[b.key], MAX_TRANSLATION);
        if (t) out[b.key] = t;
      }
    } catch (e) {
      console.warn(`translate: batch ${i / BATCH_SIZE + 1} skipped (${(e as Error).message})`);
    }
  }
  return out;
}
