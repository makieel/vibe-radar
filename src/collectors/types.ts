import type { Config } from '../config.ts';
import type { FetchLike } from '../lib/http.ts';
import type { RawSnapshot, SourceId } from '../schema.ts';

export type StarHistory = Record<string, { firstSeen: string; lastTrending: string; series: Record<string, number> }>;

export interface CollectCtx {
  mode: 'full' | 'reduced';
  token: string | null;
  fetch: FetchLike;
  now: Date;
  config: Config;
  date: string;
  history: StarHistory;
  trendingToday: Set<string>;
}

export interface Collector<K extends keyof RawSnapshot> {
  id: SourceId;
  key: K;
  run(ctx: CollectCtx): Promise<{ data: RawSnapshot[K]; reduced: boolean }>;
}
