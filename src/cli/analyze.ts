import { analyzeDate, rawDates } from '../analyze/report.ts';
import { isIsoDate, kstDate } from '../lib/dates.ts';

function main(): void {
  const i = process.argv.indexOf('--date');
  let date = i >= 0 ? process.argv[i + 1] ?? '' : kstDate(new Date());
  if (!isIsoDate(date)) {
    console.error(`invalid --date "${date}" (expected YYYY-MM-DD)`);
    process.exitCode = 1;
    return;
  }
  if (i < 0 && !rawDates().includes(date)) {
    const latest = rawDates().at(-1);
    if (!latest) {
      console.error('no raw snapshots in data/raw — run npm run collect first');
      process.exitCode = 1;
      return;
    }
    console.warn(`no raw snapshot for ${date}; analyzing newest raw ${latest}`);
    date = latest;
  }
  const r = analyzeDate(date);
  console.log(`date: ${r.date}  scanNo: ${r.scanNo}`);
  console.log(`gauge: ${r.gauge.value} (avg7 ${r.gauge.avg7}, label ${r.gauge.label}, history ${r.gauge.daysOfHistory}d)`);
  console.log(`issues ${r.issues.length}  alerts ${r.alerts.length}  tools ${r.tools.length}  rising ${r.rising.length}  kit ${r.kit.length}  keywords ${r.keywords.length}`);
  console.log(`wrote data/daily/${date}.json`);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
