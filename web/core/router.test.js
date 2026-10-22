import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, toHash } from './router.js';

const dates = ['2026-10-22', '2026-10-21'];

test('empty hash is briefing', () => {
  for (const h of ['', '#', '#/']) {
    const { route, notice } = parseRoute(h, dates);
    assert.deepEqual(route, { view: 'briefing', date: null, params: {} });
    assert.equal(notice, null);
  }
});
test('parseRoute unknown date gives notice and null date', () => {
  const { route, notice } = parseRoute('#/?d=2020-01-01', ['2026-10-22']);
  assert.equal(route.date, null);
  assert.equal(notice, '그 날짜 기록이 없어요. 최신 브리핑을 보여드려요.');
});
test('malformed date gives notice', () => {
  const { route, notice } = parseRoute('#/tools?d=abc', dates);
  assert.equal(route.date, null);
  assert.match(notice, /기록이 없어요/);
});
test('parseRoute garbage view → briefing', () => {
  assert.equal(parseRoute('#/nonsense', dates).route.view, 'briefing');
});
test('parseRoute keeps params', () => {
  const { route, notice } = parseRoute('#/papers?cat=cs.CL&d=2026-10-22', dates);
  assert.deepEqual(route, { view: 'papers', date: '2026-10-22', params: { cat: 'cs.CL' } });
  assert.equal(notice, null);
});
test('toHash round-trips', () => {
  for (const h of ['#/', '#/tools', '#/papers?cat=cs.CL&d=2026-10-22', '#/?d=2026-10-21']) {
    assert.equal(toHash(parseRoute(h, dates).route), h);
  }
});
test('toHash encodes params', () => {
  assert.equal(toHash({ view: 'repos', date: null, params: { q: 'a b&c' } }), '#/repos?q=a%20b%26c');
});
