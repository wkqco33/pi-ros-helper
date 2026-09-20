# Changelog

All notable changes are documented here.

## [Unreleased]

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
