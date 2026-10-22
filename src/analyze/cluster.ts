import { createHash } from 'node:crypto';
import type { Issue, IssueItem, RawSnapshot, SourceId } from '../schema.ts';
import { normalizeUrl, tokenize } from '../lib/text.ts';
import { issueHeat } from './heat.ts';

interface Node extends IssueItem {
  tokens: Set<string>;
  repo: string | null; // lowercase fullName for trending nodes
  starDelta: number;
}

const JACCARD_MIN = 0.35;
const COMMON_MIN = 2;
const SHORT_TITLE_COMMON_MIN = 3; // R11: a short title must not bridge unrelated stories
const TRENDING_TOP = 10;

function buildNodes(raw: RawSnapshot): Node[] {
  const nodes: Node[] = [];
  const base = (source: SourceId, title: string, url: string, points: number | null, comments: number | null): Node => ({
    source, title, url, points, comments,
    tokens: new Set(tokenize(title)),
    repo: null,
    starDelta: 0,
  });
  for (const h of raw.hn) nodes.push(base('hn', h.title, h.url, h.points, h.comments));
  for (const g of raw.geeknews) nodes.push(base('geeknews', g.title, g.url, null, null));
  for (const r of raw.reddit) nodes.push(base('reddit', r.title, r.url, null, null));
  for (const t of raw.trending.filter((x) => x.period === 'daily').slice(0, TRENDING_TOP)) {
    nodes.push({ ...base('trending', t.fullName, t.url, null, null), repo: t.fullName.toLowerCase(), starDelta: t.starsInPeriod });
  }
  return nodes;
}

function urlMentionsRepo(url: string, repo: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return false;
  const [owner, name] = parsed.pathname.toLowerCase().split('/').filter(Boolean);
  return `${owner}/${name}` === repo;
}

function related(a: Node, b: Node): boolean {
  if (normalizeUrl(a.url) === normalizeUrl(b.url)) return true;
  if (b.repo && urlMentionsRepo(a.url, b.repo)) return true;
  if (a.repo && urlMentionsRepo(b.url, a.repo)) return true;
  let common = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) common++;
  const minCommon = a.tokens.size < 4 || b.tokens.size < 4 ? SHORT_TITLE_COMMON_MIN : COMMON_MIN;
  if (common < minCommon) return false;
  return common / (a.tokens.size + b.tokens.size - common) >= JACCARD_MIN;
}

export function clusterIssues(raw: RawSnapshot): Issue[] {
  const nodes = buildNodes(raw);
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (find(i) !== find(j) && related(nodes[i]!, nodes[j]!)) parent[find(j)] = find(i);
    }
  }

  const groups = new Map<number, Node[]>();
  nodes.forEach((node, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(node);
    else groups.set(root, [node]);
  });

  const issues: Issue[] = [];
  for (const members of groups.values()) {
    const hn = members.filter((m) => m.source === 'hn');
    const rep = hn.length ? hn.reduce((best, m) => ((m.points ?? 0) > (best.points ?? 0) ? m : best)) : members[0]!;
    const sources = [...new Set(members.map((m) => m.source))];
    const { heat, reason } = issueHeat({
      hnPoints: Math.max(0, ...hn.map((m) => m.points ?? 0)),
      comments: hn.reduce((sum, m) => sum + (m.comments ?? 0), 0),
      sourceCount: sources.length,
      starDelta: Math.max(0, ...members.map((m) => m.starDelta)),
    });
    issues.push({
      id: createHash('sha1').update(normalizeUrl(rep.url)).digest('hex').slice(0, 10),
      title: rep.title,
      title_ko: null,
      summary_ko: null,
      check_ko: null,
      heat,
      heatReason: reason,
      sources,
      url: rep.url,
      items: members.map(({ source, title, url, points, comments }) => ({ source, title, url, points, comments })),
    });
  }
  return issues.sort((a, b) => b.heat - a.heat);
}
