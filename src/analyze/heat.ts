const n = (x: number, cap: number): number => Math.min(1, Math.log(1 + x) / Math.log(1 + cap));

export function issueHeat(input: {
  hnPoints: number;
  comments: number;
  sourceCount: number;
  starDelta: number;
}): { heat: number; reason: string } {
  const { hnPoints, comments, sourceCount, starDelta } = input;
  const score =
    0.4 * n(hnPoints, 1000) +
    0.15 * n(comments, 500) +
    (0.2 * Math.min(Math.max(sourceCount - 1, 0), 2)) / 2 +
    0.25 * n(starDelta, 5000);
  const heat = Math.max(0, Math.min(100, Math.round(100 * score)));
  const parts: string[] = [];
  if (hnPoints > 0) parts.push(`HN ${hnPoints}점`);
  if (comments > 0) parts.push(`댓글 ${comments}`);
  if (sourceCount >= 2) parts.push(`출처 ${sourceCount}곳`);
  if (starDelta > 0) parts.push(`스타 +${starDelta}`);
  return { heat, reason: parts.join(' · ') };
}
