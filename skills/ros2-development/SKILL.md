# ROS 2 development with pi-ros-helper

Use the ROS-specific tools before falling back to raw shell commands.

## Investigation order

1. Run `ros_environment` when the ROS setup or workspace is unclear.
2. Run `ros_workspace_inspect` before selecting packages for a build.
3. For build failures, inspect the first compiler/CMake/rosidl error before downstream failures.
4. For runtime communication failures, inspect graph, type, QoS, and TF in that order.
5. Keep topic sampling bounded; never start an unbounded `ros2 topic echo`.

## Safety

`ros_build` previews its command and only executes when `execute=true`. Runtime commands that publish, change parameters, send actions, or transition lifecycle nodes require explicit confirmation and should not run in non-interactive mode.

Treat `/cmd_vel`, actuator, motor, emergency, and shutdown topics as high risk. Never send a repeated command without a finite duration, rate, and user confirmation.
