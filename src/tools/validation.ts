import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { failure, result } from '../core/result.ts';
import { runCommand } from '../core/runner.ts';
import { inspectWorkspace } from '../workspace/inspect.ts';
import { classifyColconOutput, readTestResults, summarizeTestResults } from '../build/colcon.ts';
import { ctestRegex } from '../build/selection.ts';
import { detectStaleTestArtifacts } from '../build/staleness.ts';
import { checkTdd } from '../validation/tdd.ts';
import { buildCompletionEvidence } from '../validation/evidence.ts';
import { summarizeValidation } from '../validation/bundle.ts';
import { text } from './common.ts';

export function registerValidationTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_tdd_checkpoint',
    label: 'ROS TDD Checkpoint',
    description:
      'Check whether source changes have related test changes before implementation is considered complete. Read-only.',
    promptSnippet: 'Check the ROS 2 TDD checkpoint for changed files',
    parameters: Type.Object({
      changedPaths: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
      testChangedPaths: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
      path: Type.Optional(
        Type.String({
          description: 'Project directory for git discovery; defaults to the session cwd.',
        }),
      ),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      let changedPaths = params.changedPaths ?? [];
      if (!changedPaths.length) {
        const diff = await runCommand('git', ['diff', '--name-only', 'HEAD'], {
          cwd: params.path ?? ctx.cwd,
          timeoutMs: 10_000,
          maxBytes: 50_000,
        });
        changedPaths = diff.stdout.split(/\r?\n/).filter(Boolean);
      }
      const data = checkTdd(changedPaths, params.testChangedPaths ?? changedPaths);
      return text(
        result(ctx.cwd, started, {
          ok: data.ok,
          summary: data.ok
            ? 'TDD checkpoint passed.'
            : 'TDD checkpoint found source changes without related tests.',
          data,
          evidence: data.reasons.map((message) => ({ kind: 'tdd_blocker', message })),
          warnings: data.reasons.map((message) => ({
            code: 'TDD_CHECKPOINT',
            message,
            severity: 'warning' as const,
          })),
          errors: [],
          suggestions: data.ok
            ? []
            : [
                {
                  message:
                    'Add the smallest focused test for the changed behavior before final validation.',
                  confidence: 'high',
                },
              ],
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_completion_evidence',
    label: 'ROS Completion Evidence',
    description:
      'Build a conservative completion report from build/test execution and stale-artifact status. Read-only.',
    promptSnippet: 'Create evidence for a ROS 2 completion report',
    parameters: Type.Object({
      buildExecuted: Type.Boolean(),
      buildOk: Type.Boolean(),
      testExecuted: Type.Boolean(),
      testOk: Type.Boolean(),
      stale: Type.Boolean(),
      changedPaths: Type.Array(Type.String(), { maxItems: 500 }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = buildCompletionEvidence(params);
      return text(
        result(ctx.cwd, started, {
          ok: data.ok,
          summary: data.ok
            ? 'Completion evidence is sufficient for the supplied checks.'
            : 'Completion evidence is incomplete or contains failing checks.',
          data,
          evidence: data.blockers.map((message) => ({ kind: 'completion_blocker', message })),
          warnings: data.blockers.map((message) => ({
            code: 'INCOMPLETE_EVIDENCE',
            message,
            severity: 'warning' as const,
          })),
          errors: data.ok
            ? []
            : [
                {
                  code: 'COMPLETION_NOT_PROVEN',
                  message: 'The supplied evidence does not prove completion.',
                  severity: 'error' as const,
                },
              ],
          suggestions: data.ok
            ? []
            : [
                {
                  message:
                    'Run ros_validation_bundle and address every blocker before reporting completion.',
                  confidence: 'high',
                },
              ],
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_validation_bundle',
    label: 'ROS Validation Bundle',
    description:
      'Preview or run a bounded colcon build followed by tests and return one evidence-oriented validation summary. Execution is opt-in.',
    promptSnippet: 'Run the ROS 2 build and test validation bundle',
    promptGuidelines: [
      'Use ros_validation_bundle with execute false first; a preview is never reported as a passing validation.',
      'The bundle rebuilds before testing and treats stale test artifacts as a validation failure.',
    ],
    parameters: Type.Object({
      packages: Type.Optional(Type.Array(Type.String())),
      testTargets: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
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
      path: Type.Optional(
        Type.String({
          description: 'Workspace directory to validate; defaults to the session cwd.',
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      // Run colcon where the workspace actually is, not in the session cwd.
      const workspace = await inspectWorkspace(params.path ?? ctx.cwd);
      if (!workspace.root)
        return text(
          failure(ctx.cwd, started, 'No ROS 2 workspace was found.', 'WORKSPACE_NOT_FOUND'),
        );
      const buildArgs = ['build'];
      if (params.symlinkInstall) buildArgs.push('--symlink-install');
      if (params.buildType)
        buildArgs.push('--cmake-args', `-DCMAKE_BUILD_TYPE=${params.buildType}`);
      if (params.packages?.length) buildArgs.push('--packages-select', ...params.packages);
      const testArgs = ['test'];
      if (params.packages?.length) testArgs.push('--packages-select', ...params.packages);
      if (params.testTargets?.length)
        testArgs.push('--ctest-args', '-R', ctestRegex(params.testTargets));
      const buildCommand = { executable: 'colcon', args: buildArgs, cwd: workspace.root };
      const testCommand = { executable: 'colcon', args: testArgs, cwd: workspace.root };
      if (!params.execute) {
        const validation = summarizeValidation({
          build: { executed: false, ok: true },
          test: { executed: false, ok: true, failures: 0 },
          stale: false,
        });
        return text(
          result(ctx.cwd, started, {
            ok: false,
            summary: 'Validation commands previewed; no build or test was executed.',
            data: { validation, buildCommand, testCommand },
            evidence: [
              { kind: 'command_preview', ...buildCommand },
              { kind: 'command_preview', ...testCommand },
            ],
            warnings: [],
            errors: [],
            suggestions: [
              { message: 'Set execute=true after reviewing both commands.', confidence: 'high' },
            ],
            commands: [buildCommand, testCommand],
          }),
        );
      }
      const timeoutMs = (params.timeoutSeconds ?? 900) * 1000;
      const buildRun = await runCommand(buildCommand.executable, buildCommand.args, {
        cwd: workspace.root,
        signal,
        timeoutMs,
      });
      const buildOutput = `${buildRun.stdout}\n${buildRun.stderr}`.trim();
      const buildFailures = classifyColconOutput(buildOutput);
      const buildOk = !buildRun.cancelled && !buildRun.timedOut && buildRun.code === 0;
      let testRun = {
        code: null as number | null,
        stdout: '',
        stderr: '',
        timedOut: false,
        cancelled: false,
        truncated: false,
      };
      let testResults: Awaited<ReturnType<typeof readTestResults>> = [];
      if (buildOk) {
        testRun = await runCommand(testCommand.executable, testCommand.args, {
          cwd: workspace.root,
          signal,
          timeoutMs,
        });
        testResults = await readTestResults(workspace.root, params.testTargets);
      }
      const testTotals = summarizeTestResults(testResults);
      const testOk =
        buildOk &&
        !testRun.cancelled &&
        !testRun.timedOut &&
        testRun.code === 0 &&
        testTotals.failures === 0;
      const stale = await detectStaleTestArtifacts(workspace.root);
      const validation = summarizeValidation({
        build: { executed: true, ok: buildOk, exitCode: buildRun.code },
        test: {
          executed: buildOk,
          ok: testOk,
          exitCode: testRun.code,
          failures: testTotals.failures,
        },
        stale: Boolean(stale),
      });
      const failedTests = testResults.flatMap((item) =>
        item.cases.map((entry) => `${item.package}: ${entry.suite}.${entry.name}`),
      );
      return text(
        result(ctx.cwd, started, {
          ok: validation.ok,
          summary: validation.reason,
          data: {
            validation,
            build: {
              exitCode: buildRun.code,
              failures: buildFailures,
              stdout: buildRun.stdout,
              stderr: buildRun.stderr,
            },
            test: {
              exitCode: testRun.code,
              summary: testTotals,
              failingTests: failedTests,
              stdout: testRun.stdout,
              stderr: testRun.stderr,
            },
            staleArtifacts: stale
              ? { source: stale.newestSource.path, binary: stale.newestBinary.path }
              : null,
          },
          evidence: [
            { kind: 'validation', ...validation.checks },
            ...buildFailures.map((item) => ({ kind: item.kind, message: item.message })),
            ...failedTests.map((message) => ({ kind: 'test_failure', message })),
          ],
          warnings: stale
            ? [
                {
                  code: 'STALE_TEST_ARTIFACTS',
                  message: 'Test artifacts are older than current sources.',
                  severity: 'warning' as const,
                },
              ]
            : [],
          errors: validation.ok
            ? []
            : [
                {
                  code: 'VALIDATION_FAILED',
                  message: validation.reason,
                  severity: 'error' as const,
                },
              ],
          suggestions: validation.ok
            ? []
            : [
                {
                  message:
                    'Inspect build failures first, then rerun the bundle after fixing the earliest failure.',
                  confidence: 'high',
                },
              ],
          commands: [buildCommand, testCommand],
          truncated: buildRun.truncated || testRun.truncated,
        }),
      );
    },
  });
}
