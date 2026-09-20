# Changelog

All notable changes are documented here.

## [0.1.4] - 2026-09-20

### Fixed

- `ros_workspace_inspect` now discovers a package whose `package.xml` sits at the workspace root, so single-package repositories no longer report zero packages.
- `findWorkspace` treats a directory containing `package.xml` as a workspace root in addition to one containing `src`.
- `ros_package_analyze` resolves an absolute path, a relative path, a `package.xml` file, or a package name, and no longer fails with `PACKAGE_NOT_FOUND` when the manifest is at the repository root.
- `ros_launch_analyze` detects Python `Node(...)` actions that span multiple lines and reads XML `<node>` attributes instead of relying on single-line matches.
- `ros_scaffold_preview` now emits real ROS 2 publisher and subscriber code; previously `kind` was accepted but ignored and both kinds produced an empty node.
- `ros_log_analyze` classifies a line by its ROS severity tag first, so a `[WARN]` line that merely mentions "error" is no longer counted as an error.
- `ros_param_diff` reports `ok: true` when the comparison succeeds; differences are returned as data rather than as a failure.
- `ros_interface_scaffold_preview` no longer copies the supplied fields into the result and feedback sections of an action definition.
- Tool metadata reports the real `package.json` version instead of a hardcoded `0.1.0`.

### Added

- Regression tests for single-package workspace discovery, path-based package resolution, multi-line and XML launch node detection, publisher/subscriber scaffold output, ROS severity classification, action interface sections, and tool version reporting.

## [0.1.3] - 2026-09-20

### Fixed

- `skills/ros2-development/SKILL.md` now declares the required `name` and `description` frontmatter, so pi loads the skill instead of warning `description is required` under `[Skill conflicts]`.

### Added

- Regression test asserting every bundled skill declares valid frontmatter that pi can load.

## [0.1.1] - 2026-09-20

### Added

- Unit-test coverage for graph diffing, parameter diffing, colcon classification, scaffold validation, and safety rules.
- Repository development guide in `AGENTS.md`.
- ROS interface scaffold preview for msg, srv, and action definitions.
- Prettier formatting checks.

### Changed

- Test command now runs TypeScript tests through `tsx`.
- CI now tests ROS 2 Humble and Jazzy container smoke cases.

## [0.1.0] - 2026-09-12

### Added

- ROS environment, workspace, package, build, and test diagnostics.
- ROS graph, QoS, TF, parameter, and log diagnostics.
- Launch and rosbag inspection/query tools.
- Confirmed topic, service, action, and lifecycle controls.
- Preview and safe-write ROS 2 package scaffolds.
