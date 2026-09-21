import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import register from '../extensions/index.ts';

interface RegisteredTool {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal: undefined,
    update: undefined,
    ctx: { cwd: string },
  ) => Promise<{ details?: Record<string, unknown> }>;
}

function loadExtension(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  register({
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerCommand: () => undefined,
  } as unknown as Parameters<typeof register>[0]);
  return tools;
}

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ros-ws-'));
  const pkg = join(root, 'src', 'demo_pkg');
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.xml'),
    [
      '<?xml version="1.0"?>',
      '<package format="3">',
      '  <name>demo_pkg</name>',
      '  <version>0.1.0</version>',
      '  <description>demo</description>',
      '  <maintainer email="dev@example.com">Dev</maintainer>',
      '  <license>Apache-2.0</license>',
      '  <buildtool_depend>ament_cmake</buildtool_depend>',
      '</package>',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(pkg, 'CMakeLists.txt'),
    'cmake_minimum_required(VERSION 3.8)\nproject(demo_pkg)\n',
  );
  return root;
}

/**
 * colcon must run where the workspace actually is. Reading the workspace from
 * `path` but running colcon in `ctx.cwd` makes the tools fail (or, worse, build
 * the wrong tree) whenever the session is not started at the workspace root.
 */
test('workspace-bound tools resolve and run in the path argument, not the session cwd', async () => {
  const session = await mkdtemp(join(tmpdir(), 'ros-session-'));
  const workspace = await makeWorkspace();
  try {
    const tools = loadExtension();
    const invoke = (name: string, params: Record<string, unknown>) => {
      const tool = tools.get(name);
      assert.ok(tool, `${name} must be registered`);
      return tool.execute('id', params, undefined, undefined, { cwd: session });
    };

    for (const name of ['ros_build', 'ros_test', 'ros_validation_bundle']) {
      const details = (await invoke(name, { path: workspace, execute: false })).details as {
        ok: boolean;
        commands?: { cwd?: string }[];
      };
      assert.ok(details.commands?.length, `${name} should preview at least one command`);
      for (const command of details.commands) {
        assert.equal(command.cwd, workspace, `${name} ran its command outside the workspace`);
      }
    }

    const environment = (await invoke('ros_environment', { path: workspace })).details as {
      data: { workspace?: string };
    };
    assert.equal(environment.data.workspace, workspace);
  } finally {
    await rm(session, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});
