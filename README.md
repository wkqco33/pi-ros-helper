# pi-ros-helper

ROS 2 development tools for the [pi coding agent](https://github.com/badlogic/pi-mono).

## Current status

Version `0.1.0` provides the foundation and first MVP tools:

- `ros_environment` — inspect ROS distro, RMW, domain, setup files, and workspace discovery
- `ros_workspace_inspect` — enumerate packages and detect duplicate package names
- `ros_build` — preview or explicitly run a bounded `colcon build`
- `/ros-status` — concise interactive status notification

The extension is intentionally safe by default. `ros_build` never executes unless `execute: true` is supplied.

## Install for development

```bash
pi -e /absolute/path/to/pi-ros-helper
```

For a project-local package, add the path to `.pi/settings.json` or install the published npm/git package with `pi install`.

## Development

```bash
npm install
npm run typecheck
```

The extension does not require ROS to be installed in order to load. ROS-specific tools report structured diagnostics when `ros2`, `rclpy`, or a workspace is unavailable.

## Design principles

- structured results instead of opaque shell output
- bounded output and cancellable subprocesses
- no shell interpolation of user-provided package names or paths
- read-only diagnostics by default
- explicit opt-in for build execution
- topic publishing is bounded to one message and requires interactive confirmation
- Humble and Jazzy as the initial compatibility targets

## Runtime tools

The extension also includes bounded graph snapshots/diffs, QoS inspection, static launch analysis, rosbag metadata inspection, and one-shot topic sampling. Runtime introspection reports an actionable error when the ROS CLI or daemon is unavailable.
