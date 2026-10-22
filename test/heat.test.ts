import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueHeat } from '../src/analyze/heat.ts';

test('issueHeat matches mockup scale', () => {
  const { heat, reason } = issueHeat({ hnPoints: 974, comments: 535, sourceCount: 2, starDelta: 0 });
  assert.ok(heat >= 60 && heat <= 70);
  assert.equal(reason, 'HN 974점 · 댓글 535 · 출처 2곳');
});
test('issueHeat is 0 with empty reason for nothing', () => {
  assert.deepEqual(issueHeat({ hnPoints: 0, comments: 0, sourceCount: 1, starDelta: 0 }), { heat: 0, reason: '' });
});
test('issueHeat caps at 100 and includes stars', () => {
  const { heat, reason } = issueHeat({ hnPoints: 5000, comments: 5000, sourceCount: 5, starDelta: 50000 });
  assert.equal(heat, 100);
  assert.match(reason, /스타 \+50000/);
});
