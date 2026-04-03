import assert from 'node:assert/strict';

/** Use in expected shapes to assert `typeof value === 'string'`. */
export const anyString = Symbol('anyString');

export function assertShape(actual: unknown, expected: unknown): void {
  if (expected === anyString) {
    assert.ok(typeof actual === 'string');
    return;
  }
  if (expected === null) {
    assert.strictEqual(actual, null);
    return;
  }
  if (typeof expected !== 'object') {
    assert.strictEqual(actual, expected);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `expected array, got ${typeof actual}`);
    assert.strictEqual(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assertShape(actual[i], expected[i]);
    }
    return;
  }
  assert.ok(typeof actual === 'object' && actual !== null);
  for (const [k, v] of Object.entries(expected)) {
    assert.ok(k in (actual as object), `missing key ${k}`);
    assertShape((actual as Record<string, unknown>)[k], v);
  }
}
