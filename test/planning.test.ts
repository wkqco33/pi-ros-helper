import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseColconFailure } from '../src/build/failure.ts';
import { selectTests } from '../src/build/selection.ts';
import { planDependencies } from '../src/package/dependency-plan.ts';

test('diagnoses the first actionable compiler failure and suggests a focused build', () => {
  const diagnosis = diagnoseColconFailure(
    `\n-- Configuring incomplete\n/home/ws/src/demo/src/node.cpp:12:10: fatal error: rclcpp/rclcpp.hpp: No such file or directory\nmake: *** [all] Error 2\n`,
  );
  assert.equal(diagnosis.kind, 'compiler');
  assert.match(diagnosis.message, /rclcpp/);
  assert.ok(diagnosis.suggestions.some((item) => /dependency|package/i.test(item)));
});

test('selects related tests from changed source paths without requiring ROS', () => {
  const selected = selectTests(
    ['src/topic_stream.cpp', 'test/test_topic_cancellation.cpp'],
    ['test_topic_cancellation', 'test_streaming_reliability', 'test_tf'],
  );
  assert.deepEqual(selected, ['test_topic_cancellation', 'test_streaming_reliability']);
});

test('plans manifest and CMake dependency changes from includes and declared dependencies', () => {
  const plan = planDependencies({
    packageXml: '<package><depend>rclcpp</depend></package>',
    source: '#include <rclcpp/rclcpp.hpp>\n#include <rclcpp_action/rclcpp_action.hpp>',
    build: 'find_package(rclcpp REQUIRED)',
  });
  assert.deepEqual(plan.missing, ['rclcpp_action']);
  assert.ok(plan.actions.some((action) => /package.xml/.test(action)));
});
