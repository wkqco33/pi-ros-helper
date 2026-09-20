import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLaunch } from '../src/launch/validate.ts';
import { assertGraph } from '../src/runtime/graph-assert.ts';
import { buildCompletionEvidence } from '../src/validation/evidence.ts';
import { checkTdd } from '../src/validation/tdd.ts';

test('launch validation reports missing includes and non-identifiable nodes', () => {
  const report = validateLaunch(
    {
      path: '/ws/launch/demo.launch.py',
      format: 'python',
      nodes: [],
      includes: ['missing.launch.py'],
      arguments: [],
      remappings: [],
      warnings: [],
    },
    ['/ws/launch/demo.launch.py'],
  );
  assert.equal(report.ok, false);
  assert.deepEqual(report.missingFiles, ['/ws/launch/missing.launch.py']);
  assert.ok(report.warnings.some((warning) => /node/i.test(warning)));
});

test('graph assertion reports missing and unexpected resources', () => {
  const report = assertGraph(
    { nodes: ['/gateway'], topics: ['/scan'], services: [] },
    { nodes: ['/gateway', '/extra'], topics: ['/scan', '/debug'], services: [] },
  );
  assert.deepEqual(report.missing.nodes, []);
  assert.deepEqual(report.unexpected.nodes, ['/extra']);
  assert.deepEqual(report.unexpected.topics, ['/debug']);
  assert.equal(report.ok, false);
});

test('completion evidence cannot claim success without executed build and test', () => {
  const report = buildCompletionEvidence({
    buildExecuted: true,
    buildOk: true,
    testExecuted: false,
    testOk: false,
    stale: false,
    changedPaths: ['src/a.cpp'],
  });
  assert.equal(report.ok, false);
  assert.match(report.blockers[0]!, /test/i);
});

test('TDD checkpoint detects source changes without test changes', () => {
  const report = checkTdd(['src/topic.cpp'], ['test/test_other.cpp']);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((reason) => /test/i.test(reason)));
});
