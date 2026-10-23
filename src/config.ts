import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const ConfigSchema = z.object({
  tools: z.array(z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['github-release', 'copilot-feed', 'cursor-page']),
    repo: z.string().optional(),
  })),
  kitTopics: z.array(z.string()),
  watchlist: z.object({ npm: z.array(z.string()), pip: z.array(z.string()) }),
  securityTerms: z.array(z.string()),
  redditSubs: z.array(z.string()),
  arxivMax: z.number(),
  trackDays: z.number(),
  ai: z.object({
    baseUrl: z.string().url(),
    keyEnv: z.string().min(1),
    models: z.array(z.string().min(1)).min(1),
  }),
});
export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_PATH = new URL('../config.json', import.meta.url);

export function loadConfig(path?: string): Config {
  const text = readFileSync(path ?? DEFAULT_PATH, 'utf8');
  return ConfigSchema.parse(JSON.parse(text));
}
