import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeValidation } from '../src/validation/bundle.ts';

test('validation summary requires build and test success and records stale artifacts', () => {
  const summary = summarizeValidation({
    build: { executed: true, ok: true, exitCode: 0 },
    test: { executed: true, ok: true, exitCode: 0, failures: 0 },
    stale: true,
  });
  assert.equal(summary.ok, false);
  assert.match(summary.reason, /stale/i);
});

test('validation preview is not reported as a passing validation', () => {
  const summary = summarizeValidation({
    build: { executed: false, ok: true },
    test: { executed: false, ok: true, failures: 0 },
    stale: false,
  });
  assert.equal(summary.ok, false);
  assert.match(summary.reason, /execute/i);
});
