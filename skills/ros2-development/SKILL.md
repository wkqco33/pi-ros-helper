---
name: ros2-development
description: ROS 2 development workflow with pi-ros-helper. Use when inspecting a ROS 2 environment, workspace, or package, building with colcon, diagnosing runtime graph, QoS, TF, topic, parameter, log, launch, or rosbag issues, or scaffolding ROS 2 packages, nodes, and interfaces.
license: Apache-2.0
---

# ROS 2 development with pi-ros-helper

Use the ROS-specific tools before falling back to raw shell commands.

## Investigation order

1. Run `ros_environment` when the ROS setup or workspace is unclear.
2. Run `ros_workspace_inspect` before selecting packages for a build. It discovers both a colcon `src` layout and a single-package repository with `package.xml` at the root.
3. Use `ros_package_analyze` with a package name or a path before editing `package.xml` or build files.
4. Use `ros_dependency_plan` before editing package.xml or CMakeLists.txt; it previews undeclared dependencies without writing files.
5. Use `ros_parameter_validate` before changing parameter YAML or launch values; treat unknown and type-mismatched parameters as configuration defects.
6. Use `ros_launch_validate` before executing a launch file; static validation cannot prove dynamic Python launch behavior.
7. For build failures, use `ros_failure_diagnose` on bounded output and inspect the first compiler/CMake/rosidl error before downstream failures.
8. Use `ros_test_select` after a source change to choose focused tests, or `ros_validation_bundle` when a rebuild followed by tests should be treated as one evidence-bearing gate.
9. `colcon test` does not rebuild. After editing sources or tests, run `ros_build` before `ros_test`; a `STALE_TEST_ARTIFACTS` warning means the result came from an outdated binary.
10. Use `ros_tdd_checkpoint` and `ros_completion_evidence` before reporting implementation completion.
11. Use `ros_graph_assert` after launch or integration changes when an expected graph shape is known.
12. For runtime communication failures, inspect graph, type, QoS, and TF in that order.
13. Keep topic sampling bounded; never start an unbounded `ros2 topic echo`.

## Safety

`ros_build` and `ros_validation_bundle` preview their commands and only execute when `execute=true`. Runtime commands that publish, change parameters, send actions, or transition lifecycle nodes require explicit confirmation and should not run in non-interactive mode.

Treat `/cmd_vel`, actuator, motor, emergency, and shutdown topics as high risk. Never send a repeated command without a finite duration, rate, and user confirmation.
