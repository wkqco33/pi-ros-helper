import test from 'node:test';
import assert from 'node:assert/strict';
import register from '../extensions/index.ts';

interface RegisteredTool {
  name: string;
  parameters: { properties?: Record<string, { anyOf?: { const?: string }[] }> };
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal: undefined,
    update: undefined,
    ctx: { cwd: string },
  ) => Promise<{ details?: { data?: { files?: Record<string, string> } } }>;
}

function loadExtension(): { tools: Map<string, RegisteredTool>; commands: string[] } {
  const tools = new Map<string, RegisteredTool>();
  const commands: string[] = [];
  register({
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerCommand: (name: string) => {
      commands.push(name);
    },
  } as unknown as Parameters<typeof register>[0]);
  return { tools, commands };
}

test('extension registers its core tools without a ROS install', () => {
  const { tools, commands } = loadExtension();
  for (const name of [
    'ros_environment',
    'ros_workspace_inspect',
    'ros_package_analyze',
    'ros_failure_diagnose',
    'ros_test_select',
    'ros_dependency_plan',
    'ros_parameter_validate',
    'ros_launch_validate',
    'ros_graph_assert',
    'ros_tdd_checkpoint',
    'ros_completion_evidence',
    'ros_validation_bundle',
    'ros_build',
    'ros_test',
    'ros_log_analyze',
    'ros_scaffold_preview',
  ]) {
    assert.ok(tools.has(name), `expected ${name} to be registered`);
  }
  assert.deepEqual(commands, ['ros-status']);
});

test('ros_scaffold_preview accepts the node kind and emits parameter code', async () => {
  const { tools } = loadExtension();
  const tool = tools.get('ros_scaffold_preview');
  assert.ok(tool);
  const kinds = (tool.parameters.properties?.kind?.anyOf ?? []).map((entry) => entry.const);
  assert.deepEqual(kinds, ['publisher', 'subscriber', 'node']);

  const response = await tool.execute(
    'id',
    { name: 'telemetry_node', language: 'cpp', kind: 'node' },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );
  const files = response.details?.data?.files ?? {};
  assert.match(files['telemetry_node/src/telemetry_node.cpp'] ?? '', /declare_parameter/);
});
