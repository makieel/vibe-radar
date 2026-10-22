import type { DailyReport, Gauge, Issue } from '../schema.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeGauge(issues: Issue[], previous: DailyReport[]): Gauge {
  const top = issues.map((i) => i.heat).sort((a, b) => b - a).slice(0, 5);
  const value = top.length ? Math.round(top.reduce((a, b) => a + b, 0) / top.length) : 0;
  const recent = [...previous].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const avg7 = recent.length >= 7 ? round2(recent.reduce((acc, r) => acc + r.gauge.value, 0) / 7) : null;
  let label: Gauge['label'] = null;
  if (avg7 !== null) label = value >= avg7 + 10 ? 'hot' : value <= avg7 - 10 ? 'calm' : 'normal';
  return { value, avg7, label, daysOfHistory: Math.min(previous.length, 7) };
}
