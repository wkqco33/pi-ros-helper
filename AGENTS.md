# Development guide

## Scope

`pi-ros-helper` is a TypeScript pi package that provides bounded ROS 2 inspection and explicitly confirmed control tools. Keep runtime diagnostics usable when ROS is absent; return structured errors instead of throwing during extension startup.

## Commands

```bash
npm install
npm test
npm run typecheck
pi -e ./extensions/index.ts --list-models
```

When ROS 2 is available, source its setup file before runtime checks:

```bash
source /opt/ros/jazzy/setup.bash
ros2 topic list -t
```

## Implementation rules

- Use `pi.exec`/the shared runner rather than shell interpolation of user input.
- Keep subprocesses bounded with a timeout, cancellation, and output limit.
- Return the common `RosToolResult` shape from tools.
- Read-only operations may run automatically; topic publish, service, action, lifecycle, and file-writing operations require explicit opt-in and interactive confirmation.
- Never overwrite files in scaffold generation.
- Redact likely secrets in parameter output.
- Preserve Humble/Jazzy compatibility where ROS APIs differ.

## Testing rules

Add a unit test for every parser, normalizer, safety rule, or pure generator change. Run `npm test` and `npm run typecheck` before committing. Runtime ROS changes should also be checked against a sourced Jazzy workspace; document unavailable ROS dependencies rather than weakening tests.

## Commit rules

Use focused conventional commits such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. Do not commit `node_modules`, Python bytecode, generated bags, logs, secrets, or credentials.
