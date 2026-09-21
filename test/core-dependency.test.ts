import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_SCHEMA_VERSION, createResultFactory } from 'pi-helper-core';
import { result, failure } from '../src/core/result.ts';
import { checkTdd } from '../src/validation/tdd.ts';
import { buildCompletionEvidence } from '../src/validation/evidence.ts';

/**
 * The migration only holds if `pi-helper-core` resolves as a real dependency
 * (through `exports`, not a relative path). Assert that before anything else.
 */
test('the shared core resolves as a package dependency', () => {
  assert.equal(CORE_SCHEMA_VERSION, 1);
  const { result: coreResult, failure: coreFailure } = createResultFactory('0.1.11-test');
  const value = coreResult('/tmp', Date.now(), {
    ok: true,
    summary: 'ok',
    evidence: [],
    warnings: [],
    errors: [],
    suggestions: [],
    toolchain: { kind: 'ros', version: 'jazzy', host: 'jazzy' },
  });
  assert.equal(value.metadata.toolchain?.kind, 'ros');
  assert.equal(value.attention, false);
  assert.equal(coreFailure('/tmp', Date.now(), 'boom', 'E').ok, false);
});

test('the local envelope shim reports the shared shape', () => {
  const ok = result('/tmp', Date.now(), {
    ok: true,
    summary: 'done',
    evidence: [],
    warnings: [],
    errors: [],
    suggestions: [],
  });
  assert.equal(ok.attention, false);
  assert.equal(typeof ok.metadata.toolVersion, 'string');

  const bad = failure('/tmp', Date.now(), 'boom', 'E_CODE');
  assert.equal(bad.ok, false);
  assert.equal(bad.attention, true);
  assert.equal(bad.errors[0]?.code, 'E_CODE');
});

test('the ROS gates delegate to the core with ROS signals', () => {
  const checkpoint = checkTdd(['src/topic.cpp'], ['test/test_other.cpp']);
  assert.equal(checkpoint.ok, false);
  assert.ok(checkpoint.reasons.some((reason) => /test/i.test(reason)));

  const evidence = buildCompletionEvidence({
    buildExecuted: true,
    buildOk: true,
    testExecuted: false,
    testOk: false,
    stale: false,
    changedPaths: [],
  });
  assert.equal(evidence.ok, false);
  assert.match(evidence.blockers[0]!, /test/i);
});
