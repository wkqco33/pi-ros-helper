import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { basename } from 'node:path';
import { runCommand } from '../core/runner.ts';
import { failure, result } from '../core/result.ts';
import { inspectWorkspace } from '../workspace/inspect.ts';
import {
  classifyColconOutput,
  readTestResults,
  summarizeBuildWarnings,
  summarizeTestResults,
} from '../build/colcon.ts';
import { diagnoseColconFailure } from '../build/failure.ts';
import { ctestRegex, selectTests } from '../build/selection.ts';
import { detectStaleTestArtifacts } from '../build/staleness.ts';
import { text } from './common.ts';

export function registerBuildTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_failure_diagnose',
    label: 'ROS Failure Diagnose',
    description:
      'Classify the first actionable colcon failure, explain likely causes, and suggest the next focused investigation step. Read-only.',
    promptSnippet: 'Diagnose the first actionable ROS 2 build or test failure',
    parameters: Type.Object({
      output: Type.String({ description: 'Bounded colcon, compiler, CMake, or test output' }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = diagnoseColconFailure(params.output);
      return text(
        result(ctx.cwd, started, {
          ok: data.kind === 'unknown' ? false : true,
          summary: `${data.kind} failure: ${data.message}`,
          data,
          evidence: data.failures.map((item) => ({ kind: item.kind, message: item.message })),
          warnings: [],
          errors:
            data.kind === 'unknown'
              ? [
                  {
                    code: 'NO_ACTIONABLE_FAILURE',
                    message: data.message,
                    severity: 'error' as const,
                  },
                ]
              : [],
          suggestions: data.suggestions.map((message) => ({
            message,
            confidence: 'high' as const,
          })),
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_test_select',
    label: 'ROS Test Select',
    description:
      'Select likely affected ROS 2 test targets from changed paths without running tests. Read-only.',
    promptSnippet: 'Select focused ROS 2 tests from changed files',
    parameters: Type.Object({
      changedPaths: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
      testTargets: Type.Array(Type.String(), { minItems: 1, maxItems: 500 }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      let changedPaths = params.changedPaths ?? [];
      const commands = [];
      if (!changedPaths.length) {
        const diff = await runCommand('git', ['diff', '--name-only'], {
          cwd: ctx.cwd,
          timeoutMs: 10_000,
          maxBytes: 50_000,
        });
        changedPaths = diff.stdout.split(/\r?\n/).filter(Boolean);
        commands.push({ executable: 'git', args: ['diff', '--name-only'], cwd: ctx.cwd });
      }
      const selected = selectTests(changedPaths, params.testTargets);
      return text(
        result(ctx.cwd, started, {
          ok: selected.length > 0,
          summary: selected.length
            ? `Selected ${selected.length} focused test target(s).`
            : 'No test target matched the changed paths; run the package test set or inspect dependencies.',
          data: { changedPaths, selected, availableTargets: params.testTargets },
          evidence: [{ kind: 'test_selection', changedPathCount: changedPaths.length, selected }],
          warnings: selected.length
            ? []
            : [
                {
                  code: 'NO_MATCHING_TESTS',
                  message: 'No focused test target was selected.',
                  severity: 'warning' as const,
                },
              ],
          errors: [],
          suggestions: [],
          commands,
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_test',
    label: 'ROS Test',
    description:
      'Preview or run bounded colcon test and summarize JUnit results and likely failures. colcon test does not build, so run ros_build after changing sources before trusting a pass.',
    promptSnippet: 'Preview or run ROS 2 tests and summarize failures',
    promptGuidelines: [
      'Use ros_test with execute false first; inspect the first failure before rerunning selected tests.',
      'ros_test does not rebuild: after changing test or source files run ros_build first, or the run may report a stale pass.',
    ],
    parameters: Type.Object({
      packages: Type.Optional(Type.Array(Type.String())),
      testTargets: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
      execute: Type.Optional(Type.Boolean()),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const workspace = await inspectWorkspace(ctx.cwd);
      if (!workspace.root)
        return text(
          failure(ctx.cwd, started, 'No ROS 2 workspace was found.', 'WORKSPACE_NOT_FOUND'),
        );
      const args = ['test'];
      if (params.packages?.length) args.push('--packages-select', ...params.packages);
      if (params.testTargets?.length)
        args.push('--ctest-args', '-R', ctestRegex(params.testTargets));
      const command = { executable: 'colcon', args, cwd: workspace.root };
      if (!params.execute)
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'Test command preview generated; no command was executed.',
            evidence: [{ kind: 'command_preview', ...command }],
            warnings: [],
            errors: [],
            suggestions: [
              { message: 'Set execute=true after reviewing the command.', confidence: 'high' },
            ],
            commands: [command],
          }),
        );
      const run = await runCommand(command.executable, command.args, {
        cwd: command.cwd,
        signal,
        timeoutMs: (params.timeoutSeconds ?? 900) * 1000,
      });
      const output = `${run.stdout}\n${run.stderr}`;
      const failures = classifyColconOutput(output);
      const testResults = await readTestResults(workspace.root, params.testTargets);
      const totals = summarizeTestResults(testResults);
      const failingTests = testResults.flatMap((item) =>
        item.cases.map((entry) => ({
          package: item.package,
          suite: entry.suite,
          test: entry.name,
          file: entry.file,
          line: entry.line,
          message: entry.message,
        })),
      );
      const failed =
        run.cancelled ||
        run.timedOut ||
        run.code !== 0 ||
        totals.failures > 0 ||
        testResults.some((item) => item.failures > 0);
      // colcon test never rebuilds, so compare the compiled test binaries with
      // the current sources before the caller trusts a pass.
      const stale = await detectStaleTestArtifacts(workspace.root);
      const staleMessage = stale
        ? `Test binary ${basename(stale.newestBinary.path)} predates ${stale.newestSource.path}; run ros_build and re-run before trusting this result.`
        : undefined;
      return text(
        result(ctx.cwd, started, {
          ok: !failed,
          summary: run.cancelled
            ? 'Tests cancelled.'
            : run.timedOut
              ? 'Tests timed out.'
              : failed
                ? `One or more ROS 2 tests failed (${totals.failures} case(s)).`
                : stale
                  ? `ROS 2 tests reported ${totals.tests} test(s) passing, but the test binaries predate the current sources.`
                  : `ROS 2 tests completed successfully (${totals.tests} test(s)).`,
          data: {
            exitCode: run.code,
            testSummary: totals,
            failingTests,
            staleArtifacts: stale
              ? {
                  source: stale.newestSource.path,
                  binary: stale.newestBinary.path,
                  sourceModifiedAt: new Date(stale.newestSource.mtimeMs).toISOString(),
                  binaryBuiltAt: new Date(stale.newestBinary.mtimeMs).toISOString(),
                }
              : null,
            testResults,
            failures,
            stdout: run.stdout,
            stderr: run.stderr,
          },
          evidence: [
            ...failingTests.map((item) => ({
              kind: 'test_failure',
              message: `${item.package}: ${item.suite}.${item.test}`,
              file: item.file,
              line: item.line,
              detail: item.message,
            })),
            ...failures.map((item) => ({ kind: item.kind, message: item.message })),
          ],
          warnings: [
            ...(run.truncated
              ? [
                  {
                    code: 'OUTPUT_TRUNCATED',
                    message: 'Test output was truncated.',
                    severity: 'warning' as const,
                  },
                ]
              : []),
            ...(staleMessage
              ? [
                  {
                    code: 'STALE_TEST_ARTIFACTS',
                    message: staleMessage,
                    severity: 'warning' as const,
                  },
                ]
              : []),
          ],
          errors: failed
            ? [
                {
                  code: run.timedOut
                    ? 'COMMAND_TIMEOUT'
                    : run.cancelled
                      ? 'COMMAND_CANCELLED'
                      : 'TEST_FAILED',
                  message:
                    failingTests.length > 0
                      ? `Failing test case(s): ${failingTests
                          .map((item) => `${item.suite}.${item.test}`)
                          .join(', ')}`
                      : 'colcon test did not complete successfully.',
                  severity: 'error' as const,
                },
              ]
            : [],
          suggestions: failingTests.length
            ? [
                {
                  message:
                    'Inspect the reported test case first, then rerun only the failing binary with --output-on-failure.',
                  confidence: 'high' as const,
                },
              ]
            : stale
              ? [
                  {
                    message: 'Run ros_build and re-run ros_test before reporting a passing result.',
                    confidence: 'high' as const,
                  },
                ]
              : [],
          commands: [command],
          truncated: run.truncated,
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_build',
    label: 'ROS Build',
    description:
      'Preview or run colcon build for a ROS 2 workspace. Execution is opt-in; never runs unless execute is true.',
    promptSnippet: 'Preview or run a safe ROS 2 colcon build',
    promptGuidelines: [
      'Use ros_build with execute false first to preview the command; building does not publish actuator commands.',
    ],
    parameters: Type.Object({
      packages: Type.Optional(Type.Array(Type.String())),
      symlinkInstall: Type.Optional(Type.Boolean()),
      buildType: Type.Optional(
        Type.Union([
          Type.Literal('Debug'),
          Type.Literal('Release'),
          Type.Literal('RelWithDebInfo'),
        ]),
      ),
      execute: Type.Optional(Type.Boolean()),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const workspace = await inspectWorkspace(ctx.cwd);
      if (!workspace.root)
        return text(
          failure(ctx.cwd, started, 'No ROS 2 workspace was found.', 'WORKSPACE_NOT_FOUND'),
        );
      const args = ['build'];
      if (params.symlinkInstall) args.push('--symlink-install');
      if (params.buildType) args.push('--cmake-args', `-DCMAKE_BUILD_TYPE=${params.buildType}`);
      if (params.packages?.length) args.push('--packages-select', ...params.packages);
      const command = { executable: 'colcon', args, cwd: workspace.root };
      if (!params.execute)
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'Build command preview generated; no command was executed.',
            evidence: [{ kind: 'command_preview', ...command }],
            warnings: [],
            errors: [],
            suggestions: [
              { message: 'Set execute=true only after reviewing the command.', confidence: 'high' },
            ],
            commands: [command],
          }),
        );
      const run = await runCommand(command.executable, command.args, {
        cwd: command.cwd,
        signal,
        timeoutMs: (params.timeoutSeconds ?? 900) * 1000,
      });
      const output = `${run.stdout}\n${run.stderr}`.trim();
      const failed = run.cancelled || run.timedOut || run.code !== 0;
      const failures = classifyColconOutput(output);
      const warnings = summarizeBuildWarnings(output);
      const warningCount = warnings.reduce((total, entry) => total + entry.count, 0);
      return text(
        result(ctx.cwd, started, {
          ok: !failed,
          summary: run.cancelled
            ? 'Build cancelled.'
            : run.timedOut
              ? 'Build timed out.'
              : failed
                ? `colcon build failed (${failures.length} classified failure(s)).`
                : `colcon build completed successfully (${warningCount} warning(s)).`,
          data: {
            exitCode: run.code,
            warningCount,
            warnings,
            failures,
            stdout: run.stdout,
            stderr: run.stderr,
          },
          evidence: [
            {
              kind: 'build_output',
              warningCount,
              warnings: warnings.map((entry) => ({
                file: entry.file,
                message: entry.message,
                flag: entry.flag,
                count: entry.count,
              })),
            },
            ...failures.map((item) => ({ kind: item.kind, message: item.message })),
          ],
          warnings: [
            ...(run.truncated
              ? [
                  {
                    code: 'OUTPUT_TRUNCATED',
                    message: 'Build output was truncated to protect context size.',
                    severity: 'warning' as const,
                  },
                ]
              : []),
            ...(warningCount > 0
              ? [
                  {
                    code: 'BUILD_WARNINGS',
                    message: `${warningCount} compiler warning(s) across ${warnings.length} site(s).`,
                    severity: 'warning' as const,
                  },
                ]
              : []),
          ],
          errors: failed
            ? [
                {
                  code: run.timedOut
                    ? 'COMMAND_TIMEOUT'
                    : run.cancelled
                      ? 'COMMAND_CANCELLED'
                      : 'BUILD_FAILED',
                  message: 'colcon build did not complete successfully.',
                  severity: 'error' as const,
                },
              ]
            : [],
          suggestions: [],
          commands: [command],
          truncated: run.truncated,
        }),
      );
    },
  });
}
