# Compatibility matrix

| Component | Supported | CI coverage |
|---|---|---|
| Node.js | 20, 22, 24 | Yes |
| pi coding agent | 0.86+ / peer range | Extension smoke test |
| ROS 2 Humble | Target | Runtime integration planned |
| ROS 2 Jazzy | Target | Local smoke tested |
| Ubuntu | 22.04, 24.04 | ROS targets |
| Python | 3.10+ with `rclpy` and `rosbag2_py` | Runtime-dependent |

Static tools such as workspace/package analysis do not require ROS to be installed. Workspace discovery accepts a colcon `src` layout and a single-package repository with `package.xml` at the root. Runtime tools return structured diagnostics when the ROS environment is unavailable or unsourced.

## Release compatibility

The package follows semantic versioning. The `0.y.z` series may still change public tool schemas; breaking changes will be documented in `CHANGELOG.md`. Release tags must match the version in `package.json`, for example `v0.1.0`.
