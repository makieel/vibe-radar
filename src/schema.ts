import { z } from 'zod';

export const SourceIdSchema = z.enum(['hn', 'trending', 'arxiv', 'geeknews', 'reddit', 'huggingface', 'tools', 'advisories', 'kit', 'stars']);
export type SourceId = z.infer<typeof SourceIdSchema>;

export const SourceStatusSchema = z.object({
  id: SourceIdSchema,
  ok: z.boolean(),
  count: z.number(),
  error: z.string().nullable(),
  reduced: z.boolean(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const ModeSchema = z.enum(['full', 'reduced']);

// ---- collected item types ----
export const HnItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  points: z.number(),
  comments: z.number(),
  hnUrl: z.string(),
});
export type HnItem = z.infer<typeof HnItemSchema>;

export const NewsItemSchema = z.object({
  id: z.string(),
  source: z.enum(['geeknews', 'reddit']),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  sub: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const TrendingRepoSchema = z.object({
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  stars: z.number(),
  starsInPeriod: z.number(),
  period: z.enum(['daily', 'weekly']),
});
export type TrendingRepo = z.infer<typeof TrendingRepoSchema>;

export const PaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  url: z.string(),
  publishedAt: z.string(),
});
export type Paper = z.infer<typeof PaperSchema>;

export const HfModelSchema = z.object({
  id: z.string(),
  url: z.string(),
  likes: z.number(),
  downloads: z.number(),
  pipeline: z.string().nullable(),
});
export type HfModel = z.infer<typeof HfModelSchema>;

export const ToolReleaseSchema = z.object({
  tool: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  publishedAt: z.string().nullable(),
  url: z.string(),
  note: z.string().nullable(),
});
export type ToolRelease = z.infer<typeof ToolReleaseSchema>;

export const AdvisorySchema = z.object({
  id: z.string(),
  summary: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  type: z.enum(['reviewed', 'malware', 'unreviewed']),
  ecosystem: z.string(),
  packages: z.array(z.string()),
  url: z.string(),
  publishedAt: z.string(),
});
export type Advisory = z.infer<typeof AdvisorySchema>;

export const KitRepoSchema = z.object({
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  stars: z.number(),
  createdAt: z.string().nullable(),
  topics: z.array(z.string()),
});
export type KitRepo = z.infer<typeof KitRepoSchema>;

export const RawSnapshotSchema = z.object({
  date: z.string(),
  collectedAt: z.string(),
  mode: ModeSchema,
  sources: z.array(SourceStatusSchema),
  hn: z.array(HnItemSchema),
  trending: z.array(TrendingRepoSchema),
  arxiv: z.array(PaperSchema),
  geeknews: z.array(NewsItemSchema),
  reddit: z.array(NewsItemSchema),
  hfModels: z.array(HfModelSchema),
  tools: z.array(ToolReleaseSchema),
  advisories: z.array(AdvisorySchema),
  kit: z.array(KitRepoSchema),
  stars: z.record(z.string(), z.number()),
});
export type RawSnapshot = z.infer<typeof RawSnapshotSchema>;

// ---- processed types ----
export const IssueItemSchema = z.object({
  source: SourceIdSchema,
  title: z.string(),
  url: z.string(),
  points: z.number().nullable(),
  comments: z.number().nullable(),
});
export type IssueItem = z.infer<typeof IssueItemSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_ko: z.string().nullable(),
  summary_ko: z.string().nullable(),
  check_ko: z.string().nullable(),
  heat: z.number().int().min(0).max(100),
  heatReason: z.string(),
  sources: z.array(SourceIdSchema),
  url: z.string(),
  items: z.array(IssueItemSchema),
});
export type Issue = z.infer<typeof IssueSchema>;

export const GaugeSchema = z.object({
  value: z.number().int().min(0).max(100),
  avg7: z.number().nullable(),
  label: z.enum(['hot', 'normal', 'calm']).nullable(),
  daysOfHistory: z.number(),
});
export type Gauge = z.infer<typeof GaugeSchema>;

export const AlertSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_ko: z.string().nullable(),
  url: z.string(),
  origin: z.enum(['news', 'advisory']),
  severity: z.enum(['critical', 'high']).nullable(),
  packages: z.array(z.string()),
});
export type Alert = z.infer<typeof AlertSchema>;

export const ToolCardSchema = z.object({
  tool: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  publishedAt: z.string().nullable(),
  url: z.string().nullable(),
  note: z.string().nullable(),
  note_ko: z.string().nullable(),
  isRecent: z.boolean(),
});
export type ToolCard = z.infer<typeof ToolCardSchema>;

export const RisingRepoSchema = z.object({
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  description_ko: z.string().nullable(),
  stars: z.number(),
  delta7: z.number(),
  deltaSource: z.enum(['history', 'trending-weekly']),
  isNew: z.boolean(),
  series: z.array(z.object({ date: z.string(), stars: z.number() })),
});
export type RisingRepo = z.infer<typeof RisingRepoSchema>;

export const RepoRefSchema = z.object({
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  stars: z.number(),
});
export type RepoRef = z.infer<typeof RepoRefSchema>;

export const KitCardSchema = z.object({
  fullName: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  description_ko: z.string().nullable(),
  stars: z.number(),
  kind: z.enum(['MCP', 'SKILL', 'RULES', 'CLI', 'AGENT', 'OTHER']),
  isNew: z.boolean(),
});
export type KitCard = z.infer<typeof KitCardSchema>;

export const KeywordTrendSchema = z.object({
  term: z.string(),
  today: z.number(),
  avg7: z.number().nullable(),
  delta: z.number().nullable(),
  isNew: z.boolean(),
});
export type KeywordTrend = z.infer<typeof KeywordTrendSchema>;

export const DailyReportSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string(),
  collectedAt: z.string(),
  mode: ModeSchema,
  scanNo: z.number(),
  sources: z.array(SourceStatusSchema),
  gauge: GaugeSchema,
  issues: z.array(IssueSchema),
  alerts: z.array(AlertSchema),
  tools: z.array(ToolCardSchema),
  rising: z.array(RisingRepoSchema),
  newRepos: z.array(RepoRefSchema),
  droppedRepos: z.array(RepoRefSchema),
  kit: z.array(KitCardSchema),
  keywords: z.array(KeywordTrendSchema),
  papers: z.array(PaperSchema),
  paperCategories: z.array(z.object({ category: z.string(), count: z.number() })),
  hfModels: z.array(HfModelSchema),
  feeds: z.object({
    hn: z.array(HnItemSchema),
    geeknews: z.array(NewsItemSchema),
    reddit: z.array(NewsItemSchema),
  }),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

export const SiteIndexSchema = z.object({
  latest: z.string().nullable(),
  dates: z.array(z.string()),
});
export type SiteIndex = z.infer<typeof SiteIndexSchema>;
