import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';

test('loadConfig reads repo config and rejects unknown tool kind', () => {
  const cfg = loadConfig();
  assert.equal(cfg.tools.length, 5);
  assert.equal(cfg.arxivMax, 200);
  assert.equal(cfg.trackDays, 30);
  const raw = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  raw.tools[0].kind = 'rss';
  const p = join(mkdtempSync(join(tmpdir(), 'vr-cfg-')), 'config.json');
  writeFileSync(p, JSON.stringify(raw));
  assert.throws(() => loadConfig(p));
});
