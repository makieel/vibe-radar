import { advisoriesCollector } from './advisories.ts';
import { arxivCollector } from './arxiv.ts';
import { geeknewsCollector } from './geeknews.ts';
import { hnCollector } from './hn.ts';
import { huggingfaceCollector } from './huggingface.ts';
import { kitCollector } from './kit.ts';
import { redditCollector } from './reddit.ts';
import { starsCollector } from './stars.ts';
import { toolsCollector } from './tools.ts';
import { trendingCollector } from './trending.ts';
import type { Collector } from './types.ts';

/** `stars` must stay last: the runner executes it after trending has filled `ctx.trendingToday`. */
export const ALL_COLLECTORS: Collector<any>[] = [
  hnCollector,
  geeknewsCollector,
  redditCollector,
  arxivCollector,
  huggingfaceCollector,
  trendingCollector,
  toolsCollector,
  advisoriesCollector,
  kitCollector,
  starsCollector,
];
