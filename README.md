# pi-ros-helper

ROS 2 development tools for the [pi coding agent](https://github.com/badlogic/pi-mono).

## Current status

Version `0.1.6` ships the bounded inspection and control tools documented by the bundled `ros2-development` skill, including:

- `ros_environment` — inspect ROS distro, RMW, domain, setup files, and workspace discovery
- `ros_workspace_inspect` — enumerate packages and detect duplicate package names
- `ros_package_analyze` — compare `package.xml` with build files; accepts a package name or a path
- `ros_dependency_plan` — detect undeclared dependencies from C++ includes and CMake references and preview manifest/build actions
- `ros_parameter_validate` — compare declared parameter types with configuration values without changing a running node
- `ros_launch_validate` — validate launch includes and static node discovery without starting nodes
- `ros_graph_assert` — compare an expected graph shape with the current graph
- `ros_tdd_checkpoint` — detect source changes without related test changes
- `ros_completion_evidence` — conservatively decide whether supplied build/test evidence proves completion
- `ros_failure_diagnose` — classify the first actionable colcon failure and suggest the next investigation step
- `ros_test_select` — select focused test targets from changed paths without running tests
- `ros_validation_bundle` — preview or run build-then-test validation and return one evidence-oriented result; stale artifacts fail validation
- `ros_build` — preview or explicitly run a bounded `colcon build`; summarizes compiler warnings by file and flag
- `ros_test` — preview or explicitly run `colcon test`; reports failing test cases with suite, file, and line, and warns when the test binaries are older than the sources
- `ros_log_analyze` — summarize errors, warnings, and failing test lines in a ROS, colcon, or test log
- `ros_scaffold_preview` — preview publisher, subscriber, or plain node source for C++ and Python
- `/ros-status` — concise interactive status notification

The extension is intentionally safe by default. `ros_build` never executes unless `execute: true` is supplied. `colcon test` does not rebuild, so run `ros_build` after changing sources before trusting a `ros_test` pass; `ros_test` raises a `STALE_TEST_ARTIFACTS` warning when it can tell the binaries are out of date.

## Install for development

```bash
pi -e /absolute/path/to/pi-ros-helper
```

For a project-local package, add the path to `.pi/settings.json` or install the npm package:

```bash
pi install npm:pi-ros-helper@latest
```

The GitHub Actions release workflow publishes a GitHub release tag such as `v0.1.0` to npm with provenance. The tag must match `package.json`. Before the first release, create the `pi-ros-helper` package on npm by publishing from a trusted local session or configure npm Trusted Publishing for this GitHub repository. After that, publish by creating a GitHub release for the matching tag.

## Development

```bash
npm install
npm test
npm run typecheck
# or
npm run check
```

The extension does not require ROS to be installed in order to load. ROS-specific tools report structured diagnostics when `ros2`, `rclpy`, or a workspace is unavailable.

## Support and compatibility

- Node.js 20 or newer
- ROS 2 Jazzy and Humble are the initial targets
- Runtime tools require a sourced ROS environment; static workspace and package tools do not
- Workspace discovery supports a colcon `src` layout and a single-package repository whose `package.xml` sits at the root
- The package is licensed under Apache-2.0; see `LICENSE`

See `CHANGELOG.md` for release history, `AGENTS.md` for development rules, `docs/compatibility.md` for supported runtimes, and `SECURITY.md` for vulnerability reporting.

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
