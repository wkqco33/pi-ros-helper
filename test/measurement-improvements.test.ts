import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyColconOutput } from '../src/build/colcon.ts';
import { planDependencies } from '../src/package/dependency-plan.ts';
import { ctestRegex } from '../src/build/selection.ts';

test('builds a safe ctest regex for selected target names', () => {
  assert.equal(ctestRegex(['test_parameter', 'test_topic.*']), 'test_parameter|test_topic\\.\\*');
});

test('classifies gtest matcher compiler errors as test tooling failures', () => {
  const failures = classifyColconOutput(
    '/ws/test.cpp:10:3: error: EXPECT_THAT was not declared in this scope',
  );
  assert.equal(failures[0]?.kind, 'test');
});

test('dependency planning ignores generated and non-ROS include names', () => {
  const plan = planDependencies({
    packageName: 'wrosbridge',
    packageXml: '<package><depend>rclcpp</depend><depend>builtin_interfaces</depend></package>',
    source:
      '#include <rclcpp/rclcpp.hpp>\n#include <google/protobuf/message.h>\n#include <grpcpp/grpcpp.h>',
    build: 'find_package(ament_cmake REQUIRED)\nfind_package(rclcpp REQUIRED)',
  });
  assert.deepEqual(plan.missing, []);
});
