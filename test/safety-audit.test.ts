import test from 'node:test';
import assert from 'node:assert/strict';
import { riskForTopic } from '../src/core/safety.ts';
import { qosCompatibility } from '../src/runtime/qos.ts';
import { runCommand } from '../src/core/runner.ts';

test('namespaced cmd_vel topics are treated as actuation', () => {
  assert.equal(riskForTopic('/robot/base/cmd_vel'), 'actuation');
  assert.equal(riskForTopic('/telemetry/cmd_velocity'), 'read');
});

test('QoS compatibility only flags actual requested/offered incompatibilities', () => {
  assert.equal(qosCompatibility('BEST_EFFORT', 'RELIABLE'), 'potential_mismatch');
  assert.equal(qosCompatibility('RELIABLE', 'BEST_EFFORT'), 'compatible');
  assert.equal(qosCompatibility('RELIABLE', 'RELIABLE'), 'compatible');
  assert.equal(qosCompatibility(undefined, 'RELIABLE'), 'unknown');
});

test('missing subprocesses return a bounded result instead of throwing', async () => {
  const run = await runCommand('__pi_ros_helper_missing_command__', [], {
    cwd: process.cwd(),
    timeoutMs: 1000,
  });
  assert.ok(run.code === null || run.code === -2);
  assert.match(run.stderr, /ENOENT|not found/i);
});
