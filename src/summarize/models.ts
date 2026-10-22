import { fetchJson, type FetchLike } from '../lib/http.ts';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export const MODELS_URL = 'https://models.github.ai/inference/chat/completions';
export const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

interface ChatResponse {
  choices?: { message?: { content?: unknown } }[];
}

export async function chat(
  messages: ChatMessage[],
  opts: { token: string; fetch?: FetchLike; model?: string },
): Promise<string> {
  const res = await fetchJson<ChatResponse>(MODELS_URL, {
    fetch: opts.fetch,
    token: opts.token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    timeoutMs: 60_000,
  });
  const content = res.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('models: empty response');
  return content;
}

/** 모델 응답에서 JSON 객체를 꺼낸다. ```json 울타리가 있으면 벗기고, 객체가 아니면 null. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1];
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 문자열이면 다듬고 max자로 자른다. 아니거나 비면 null. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
