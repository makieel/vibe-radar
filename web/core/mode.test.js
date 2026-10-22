import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMode, createModeController } from './mode.js';

const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const memory = (init) => {
  const m = new Map(init ? [['vr-mode', init]] : []);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), m };
};

test('initialMode falls back to system when storage throws', () => {
  assert.equal(initialMode(throwing, true), 'dark');
  assert.equal(initialMode(throwing, false), 'light');
});
test('initialMode works with null storage', () => {
  assert.equal(initialMode(null, true), 'dark');
});
test('stored mode wins over system', () => {
  assert.equal(initialMode(memory('light'), true), 'light');
  assert.equal(initialMode(memory('dark'), false), 'dark');
});
test('invalid stored value is ignored', () => {
  assert.equal(initialMode(memory('purple'), true), 'dark');
});
test('toggle works even when storage throws', () => {
  const root = { dataset: {} };
  const c = createModeController({ root, storage: throwing, prefersDark: true });
  assert.equal(root.dataset.mode, 'dark');
  assert.equal(c.toggle(), 'light');
  assert.equal(root.dataset.mode, 'light');
  assert.equal(c.toggle(), 'dark');
  assert.equal(c.get(), 'dark');
});
test('toggle persists to storage', () => {
  const s = memory();
  const c = createModeController({ root: { dataset: {} }, storage: s, prefersDark: false });
  c.toggle();
  assert.equal(s.m.get('vr-mode'), 'dark');
});
