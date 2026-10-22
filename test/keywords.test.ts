import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/lib/text.ts';
import { extractTerms, keywordTrends } from '../src/analyze/keywords.ts';

test('tokenize drops stopwords like thought/uncover', () => {
  assert.deepEqual(tokenize('We uncover a thought about PHP security'), ['php', 'security']);
});
test('tokenize keeps hangul >=2, strips trailing particle, drops numbers and short english', () => {
  assert.deepEqual(tokenize('PHP를 위한 보안이 2024 go 서버 8.2.35'), ['php', '보안', '서버', '8.2.35']);
});
test('extractTerms counts bigrams by document', () => {
  const m = extractTerms(['supply chain attack on PyPI', 'Another supply chain issue']);
  assert.equal(m.get('supply chain'), 2);
  assert.equal(m.get('chain attack'), 1);
  assert.equal(m.get('attack pypi'), undefined); // "on" breaks adjacency
});
test('extractTerms counts a term once per document', () => {
  const m = extractTerms(['rust rust rust', 'rust']);
  assert.equal(m.get('rust'), 2);
});
test('keywordTrends avg7 null with <7 days', () => {
  const today = new Map([['rust', 3]]);
  const prev = [new Map([['rust', 1]]), new Map(), new Map()];
  const [t] = keywordTrends(today, prev);
  assert.equal(t!.avg7, null);
  assert.equal(t!.delta, null);
  assert.equal(t!.isNew, false);
});
test('keywordTrends computes avg7, delta and isNew', () => {
  const prev = Array.from({ length: 7 }, (_, i) => new Map(i === 0 ? [['rust', 7]] : []));
  const out = keywordTrends(new Map([['rust', 4], ['zig', 2]]), prev);
  const rust = out.find((t) => t.term === 'rust')!;
  assert.equal(rust.avg7, 1);
  assert.equal(rust.delta, 3);
  assert.equal(rust.isNew, false);
  assert.equal(out.find((t) => t.term === 'zig')!.isNew, true);
});
test('keywordTrends isNew false with no history, and honors topN', () => {
  const out = keywordTrends(new Map([['a1x', 3], ['b1x', 2], ['c1x', 1]]), [], 2);
  assert.deepEqual(out.map((t) => t.term), ['a1x', 'b1x']);
  assert.equal(out[0]!.isNew, false);
});
test('tokenize handles contractions and curly apostrophes', () => {
  assert.deepEqual(tokenize("Why we don't use it; Rust isn't dead, doesn’t matter"), ['rust', 'dead', 'matter']);
  assert.ok(!tokenize("Today's PHP security release").includes('today'));
  assert.deepEqual(tokenize("Rust's borrow checker"), ['rust', 'borrow', 'checker']);
});
