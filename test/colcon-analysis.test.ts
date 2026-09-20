import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  classifyColconOutput,
  readTestResults,
  summarizeBuildWarnings,
  summarizeTestResults,
} from '../src/build/colcon.ts';

const GTEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="1" disabled="0" errors="0" time="0.12" timestamp="2026-09-20T20:16:38.177" name="AllTests">
  <testsuite name="RateLimiterTest" tests="2" failures="1" disabled="0" skipped="0" errors="0" time="0.12" timestamp="2026-09-20T20:16:38.177">
    <testcase name="EnforcesBurstCapacityAndRateLimiting" file="/ws/test/unit/test_rate_limiter.cpp" line="30" status="run" result="completed" time="0.12" timestamp="2026-09-20T20:16:38.177" classname="wrosbridge.RateLimiterTest" />
    <testcase name="IsolatesRateLimitsPerKey" file="/ws/test/unit/test_rate_limiter.cpp" line="36" status="run" result="completed" time="0" timestamp="2026-09-20T20:16:38.177" classname="wrosbridge.RateLimiterTest">
      <failure message="Expected equality of these values" type=""><![CDATA[/ws/test/unit/test_rate_limiter.cpp:49: Failure
Expected equality of these values:
  Expected: false
  Actual: true
]]></failure>
    </testcase>
  </testsuite>
</testsuites>
`;

const CTEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="test_bounded_queue" tests="3" failures="0" disabled="0" skipped="1" errors="0" time="0.4">
  <testcase name="PushesAndPops" file="/ws/test/unit/test_bounded_queue.cpp" line="12" status="run" result="completed" time="0.1" />
  <testcase name="DropsOnOverflow" file="/ws/test/unit/test_bounded_queue.cpp" line="20" status="run" result="completed" time="0.1" />
  <testcase name="DisabledCase" file="/ws/test/unit/test_bounded_queue.cpp" line="30" status="run" result="completed" time="0.1">
    <skipped />
  </testcase>
</testsuite>
`;

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piros-colcon-'));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(dir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

test('readTestResults attributes a failure to its binary, suite, and source line', async () => {
  const dir = await fixture({
    'build/demo_pkg/test_results/demo_pkg/test_rate_limiter.gtest.xml': GTEST_XML,
  });
  try {
    const results = await readTestResults(dir);
    assert.equal(results.length, 1);
    const result = results[0];
    assert.ok(result);
    assert.equal(result.package, 'test_rate_limiter');
    assert.equal(result.suite, 'RateLimiterTest');
    assert.equal(result.tests, 2);
    assert.equal(result.failures, 1);
    assert.equal(result.cases.length, 1);
    const failure = result.cases[0];
    assert.ok(failure);
    assert.equal(failure.name, 'IsolatesRateLimitsPerKey');
    assert.match(failure.file ?? '', /test_rate_limiter\.cpp$/);
    assert.equal(failure.line, 49);
    assert.match(failure.message, /Expected: false/);
    assert.match(result.errors.join('\n'), /Expected: false/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readTestResults can filter results to selected test binaries', async () => {
  const dir = await fixture({
    'build/demo_pkg/test_results/demo_pkg/test_rate_limiter.gtest.xml': GTEST_XML,
    'build/demo_pkg/test_results/demo_pkg/test_bounded_queue.ctest.xml': CTEST_XML,
  });
  try {
    const results = await readTestResults(dir, ['test_bounded_queue']);
    assert.deepEqual(
      results.map((result) => result.package),
      ['test_bounded_queue'],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readTestResults reads the assertion location from a message-only failure', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="1" failures="1" disabled="0" errors="0" name="AllTests">
  <testsuite name="RateLimiterTest" tests="1" failures="1" errors="0" skipped="0" time="0.1">
    <testcase name="IsolatesRateLimitsPerKey" file="/ws/test/unit/test_rate_limiter.cpp" line="36" status="run" result="completed" time="0">
      <failure message="test_rate_limiter.cpp:57&#x0A;Expected equality of these values:&#x0A;  1&#x0A;  2" type=""/>
    </testcase>
  </testsuite>
</testsuites>
`;
  const dir = await fixture({
    'build/demo_pkg/test_results/demo_pkg/test_rate_limiter.gtest.xml': xml,
  });
  try {
    const results = await readTestResults(dir);
    assert.equal(results[0]?.cases[0]?.line, 57);
    assert.equal(results[0]?.cases[0]?.file, 'test_rate_limiter.cpp');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readTestResults reports skipped counts without inventing failures', async () => {
  const dir = await fixture({
    'build/demo_pkg/test_results/demo_pkg/test_bounded_queue.ctest.xml': CTEST_XML,
  });
  try {
    const results = await readTestResults(dir);
    const result = results[0];
    assert.ok(result);
    assert.equal(result.package, 'test_bounded_queue');
    assert.equal(result.tests, 3);
    assert.equal(result.failures, 0);
    assert.equal(result.skipped, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('summarizeTestResults aggregates suites and lists failed cases', async () => {
  const dir = await fixture({
    'build/demo_pkg/test_results/demo_pkg/test_rate_limiter.gtest.xml': GTEST_XML,
    'build/demo_pkg/test_results/demo_pkg/test_bounded_queue.ctest.xml': CTEST_XML,
  });
  try {
    const totals = summarizeTestResults(await readTestResults(dir));
    assert.equal(totals.suites, 2);
    assert.equal(totals.tests, 5);
    assert.equal(totals.failures, 1);
    assert.equal(totals.skipped, 1);
    assert.equal(totals.failedCases.length, 1);
    assert.equal(totals.failedCases[0]?.name, 'IsolatesRateLimitsPerKey');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compiler classification covers generated .cc sources', () => {
  const failures = classifyColconOutput(
    '/ws/build/pkg/generated/messages.pb.cc:12:5: error: expected primary-expression before int',
  );
  assert.equal(failures[0]?.kind, 'compiler');
});

test('compiler classification covers location-only diagnostics', () => {
  const failures = classifyColconOutput(
    'src/node.cpp:14:3: fatal error: rclcpp/rclcpp.hpp: No such file',
  );
  assert.equal(failures[0]?.kind, 'compiler');
});

test('build warnings are grouped by file and message with counts and flags', () => {
  const output = [
    '/ws/src/a.cpp:10:3: warning: conversion from int to char may change value [-Wconversion]',
    '/ws/src/a.cpp:22:7: warning: conversion from int to char may change value [-Wconversion]',
    '/ws/src/b.cpp:5:1: warning: unused parameter handler [-Wunused-parameter]',
    'note: some unrelated note',
  ].join('\n');
  const warnings = summarizeBuildWarnings(output);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0]?.file, '/ws/src/a.cpp');
  assert.equal(warnings[0]?.count, 2);
  assert.equal(warnings[0]?.flag, '-Wconversion');
  assert.match(warnings[0]?.message ?? '', /conversion from int to char/);
  assert.doesNotMatch(warnings[0]?.message ?? '', /-Wconversion/);
  assert.equal(warnings[1]?.file, '/ws/src/b.cpp');
  assert.equal(warnings[1]?.count, 1);
});

test('build warning summary is capped and ordered by frequency', () => {
  const lines: string[] = [];
  for (let index = 0; index < 30; index += 1) {
    lines.push(`/ws/src/c${index}.cpp:1:1: warning: unique warning ${index} [-Wfoo]`);
  }
  lines.push('/ws/src/hot.cpp:1:1: warning: repeated warning [-Wbar]');
  lines.push('/ws/src/hot.cpp:2:1: warning: repeated warning [-Wbar]');
  const warnings = summarizeBuildWarnings(lines.join('\n'), 10);
  assert.equal(warnings.length, 10);
  assert.equal(warnings[0]?.file, '/ws/src/hot.cpp');
  assert.equal(warnings[0]?.count, 2);
});
