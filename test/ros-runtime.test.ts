import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const available = spawnSync('ros2', ['--help'], { stdio: 'ignore' }).status === 0;
const runtimeTest = available ? test : test.skip;

runtimeTest('ROS 2 CLI is available and can enumerate topic types', () => {
  const run = spawnSync('ros2', ['topic', 'list', '-t'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\[[^\]]+\]/);
});
