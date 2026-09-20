import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inspectWorkspace } from '../src/workspace/inspect.ts';
import { findWorkspace } from '../src/environment/discovery.ts';
import { analyzePackage, resolvePackage } from '../src/package/analyze.ts';
import { analyzeLaunch } from '../src/launch/analyze.ts';
import { scaffold } from '../src/generate/scaffold.ts';
import { interfaceScaffold } from '../src/generate/interface.ts';
import { isHighRiskTopic, riskForTopic } from '../src/core/safety.ts';
import { result } from '../src/core/result.ts';
import { analyzeLog, classifyLogLine } from '../src/runtime/logs.ts';

const MANIFEST = `<?xml version="1.0"?>
<package format="3">
  <name>demo_pkg</name>
  <version>1.2.3</version>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <depend>rclcpp</depend>
  <depend>std_msgs</depend>
</package>
`;

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piros-helper-'));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(dir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

async function withFixture(
  files: Record<string, string>,
  body: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await fixture(files);
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('workspace inspect finds a single-package repository at the root', async () => {
  await withFixture(
    { 'package.xml': MANIFEST, 'CMakeLists.txt': 'project(demo_pkg)\n' },
    async (dir) => {
      const info = await inspectWorkspace(dir);
      assert.equal(info.root, dir);
      assert.equal(info.hasSrc, false);
      assert.equal(info.packages.length, 1);
      assert.equal(info.packages[0]?.name, 'demo_pkg');
      assert.equal(info.packages[0]?.buildType, 'ament_cmake');
      assert.equal(info.packages[0]?.version, '1.2.3');
    },
  );
});

test('workspace inspect reports a root package together with src packages', async () => {
  await withFixture(
    {
      'package.xml': MANIFEST,
      'CMakeLists.txt': 'project(demo_pkg)\n',
      'src/child_pkg/package.xml': MANIFEST.replace('demo_pkg', 'child_pkg'),
      'src/child_pkg/CMakeLists.txt': 'project(child_pkg)\n',
    },
    async (dir) => {
      const info = await inspectWorkspace(dir);
      assert.equal(info.root, dir);
      assert.equal(info.hasSrc, true);
      assert.deepEqual(info.packages.map((pkg) => pkg.name).sort(), ['child_pkg', 'demo_pkg']);
    },
  );
});

test('a colcon workspace root wins over a package directory inside src', async () => {
  await withFixture(
    {
      'src/demo_pkg/package.xml': MANIFEST,
      'src/demo_pkg/CMakeLists.txt': 'project(demo_pkg)\n',
    },
    async (dir) => {
      assert.equal(await findWorkspace(join(dir, 'src/demo_pkg')), dir);
      assert.equal(await findWorkspace(dir), dir);
      const info = await inspectWorkspace(join(dir, 'src/demo_pkg'));
      assert.equal(info.root, dir);
      assert.deepEqual(
        info.packages.map((pkg) => pkg.name),
        ['demo_pkg'],
      );
    },
  );
});

test('package resolution accepts paths, a manifest file, and a package name', async () => {
  await withFixture(
    {
      'src/demo_pkg/package.xml': MANIFEST,
      'src/demo_pkg/CMakeLists.txt':
        'find_package(ament_cmake REQUIRED)\nfind_package(geometry_msgs REQUIRED)\n',
    },
    async (dir) => {
      const expectedPath = join(dir, 'src/demo_pkg');
      const candidates = [
        await resolvePackage(dir, expectedPath),
        await resolvePackage(dir, 'src/demo_pkg'),
        await resolvePackage(dir, join(expectedPath, 'package.xml')),
        await resolvePackage(dir, 'demo_pkg'),
      ];
      for (const pkg of candidates) {
        assert.equal(pkg?.name, 'demo_pkg');
        assert.equal(pkg?.path, expectedPath);
      }
      const analysis = await analyzePackage(candidates[0]!);
      assert.deepEqual(
        analysis.warnings.map((warning) => warning.code),
        ['MISSING_MANIFEST_DEPENDENCY'],
      );
      assert.match(analysis.warnings[0]?.message ?? '', /geometry_msgs/);
      assert.equal(await resolvePackage(dir, 'missing_pkg'), undefined);
    },
  );
});

test('launch analysis detects a multi-line python Node action', async () => {
  await withFixture(
    {
      'demo.launch.py': [
        'from launch import LaunchDescription',
        'from launch_ros.actions import Node',
        '',
        'def generate_launch_description():',
        '    return LaunchDescription([',
        '        Node(',
        "            package='demo_pkg',",
        "            executable='demo_node',",
        "            name='demo_node',",
        "            output='screen',",
        '        ),',
        '    ])',
        '',
      ].join('\n'),
    },
    async (dir) => {
      const analysis = await analyzeLaunch(join(dir, 'demo.launch.py'));
      assert.deepEqual(analysis.nodes, ['demo_node']);
      assert.ok(
        !analysis.warnings.includes('No statically identifiable nodes were found.'),
        'a node was present, so no missing-node warning is expected',
      );
    },
  );
});

test('launch analysis falls back to executable and detects XML node names', async () => {
  await withFixture(
    {
      'single.launch.py': "launch_ros.actions.Node(executable='single_node', output='screen')\n",
      'demo.launch.xml':
        '<launch><node pkg="demo_pkg" exec="xml_node" name="xml_node"/></launch>\n',
    },
    async (dir) => {
      assert.deepEqual((await analyzeLaunch(join(dir, 'single.launch.py'))).nodes, ['single_node']);
      assert.deepEqual((await analyzeLaunch(join(dir, 'demo.launch.xml'))).nodes, ['xml_node']);
    },
  );
});

test('launch analysis still warns when no node is identifiable', async () => {
  await withFixture({ 'empty.launch.py': 'x = 1\n' }, async (dir) => {
    const analysis = await analyzeLaunch(join(dir, 'empty.launch.py'));
    assert.deepEqual(analysis.nodes, []);
    assert.ok(analysis.warnings.includes('No statically identifiable nodes were found.'));
  });
});

test('publisher and subscriber scaffolds emit distinct ROS 2 code', () => {
  const cppPublisher = scaffold({ name: 'telemetry_pub', language: 'cpp', kind: 'publisher' });
  const cppSubscriber = scaffold({ name: 'telemetry_sub', language: 'cpp', kind: 'subscriber' });
  const cppPublisherCode = cppPublisher.files['telemetry_pub/src/telemetry_pub.cpp'] ?? '';
  const cppSubscriberCode = cppSubscriber.files['telemetry_sub/src/telemetry_sub.cpp'] ?? '';
  assert.match(cppPublisherCode, /create_publisher/);
  assert.doesNotMatch(cppPublisherCode, /create_subscription/);
  assert.match(cppSubscriberCode, /create_subscription/);
  assert.doesNotMatch(cppSubscriberCode, /create_publisher/);

  const pythonPublisher = scaffold({
    name: 'telemetry_pub',
    language: 'python',
    kind: 'publisher',
  });
  const pythonSubscriber = scaffold({
    name: 'telemetry_sub',
    language: 'python',
    kind: 'subscriber',
  });
  const pythonPublisherCode = pythonPublisher.files['telemetry_pub/telemetry_pub.py'] ?? '';
  const pythonSubscriberCode = pythonSubscriber.files['telemetry_sub/telemetry_sub.py'] ?? '';
  assert.match(pythonPublisherCode, /create_publisher/);
  assert.doesNotMatch(pythonPublisherCode, /create_subscription/);
  assert.match(pythonSubscriberCode, /create_subscription/);
  assert.doesNotMatch(pythonSubscriberCode, /create_publisher/);
});

test('risk classification separates read-only from actuation topics', () => {
  assert.equal(riskForTopic('/cmd_vel'), 'actuation');
  assert.equal(riskForTopic('/scan'), 'read');
  assert.equal(isHighRiskTopic('/scan'), false);
});

test('ROS severity tags decide log classification', () => {
  assert.equal(
    classifyLogLine('[WARN] [1789003030.944] [node]: Connection error while calling upstream'),
    'warning',
  );
  assert.equal(classifyLogLine('[ERROR] [1.0] [node]: failed without warning'), 'error');
  assert.equal(classifyLogLine('[INFO] [1.0] [node]: error budget is healthy'), undefined);
  assert.equal(classifyLogLine('plain error line'), 'error');
  assert.equal(classifyLogLine('plain informational line'), undefined);
});

test('analyzeLog keeps warnings out of the error list', async () => {
  await withFixture(
    {
      'node.log':
        '[INFO] [1.0] [node]: started\n[WARN] [1.1] [node]: Connection error while calling upstream\n',
    },
    async (dir) => {
      const summary = await analyzeLog(join(dir, 'node.log'));
      assert.deepEqual(summary.errors, []);
      assert.equal(summary.warnings.length, 1);
    },
  );
});

test('action interface preview keeps supplied fields in the goal section', () => {
  const generated = interfaceScaffold({
    packageName: 'demo_pkg',
    name: 'DoThing',
    kind: 'action',
    fields: ['string target'],
  });
  const content = generated.files['demo_pkg/action/DoThing.action'] ?? '';
  const [goal, resultSection, feedback] = content.split('\n---\n');
  assert.equal(goal?.trim(), 'string target');
  assert.notEqual(resultSection?.trim(), 'string target');
  assert.notEqual(feedback?.trim(), 'string target');
});

test('tool metadata reports the package version', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const report = result(process.cwd(), Date.now(), {
    ok: true,
    summary: 'ok',
    evidence: [],
    warnings: [],
    errors: [],
    suggestions: [],
  });
  assert.equal(report.metadata.toolVersion, manifest.version);
});
