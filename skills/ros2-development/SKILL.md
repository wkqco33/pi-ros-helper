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
4. For build failures, inspect the first compiler/CMake/rosidl error before downstream failures.
5. For runtime communication failures, inspect graph, type, QoS, and TF in that order.
6. Keep topic sampling bounded; never start an unbounded `ros2 topic echo`.

## Safety

`ros_build` previews its command and only executes when `execute=true`. Runtime commands that publish, change parameters, send actions, or transition lifecycle nodes require explicit confirmation and should not run in non-interactive mode.

Treat `/cmd_vel`, actuator, motor, emergency, and shutdown topics as high risk. Never send a repeated command without a finite duration, rate, and user confirmation.
