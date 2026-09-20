import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { dirname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { failure, result } from '../core/result.ts';
import { runCommand } from '../core/runner.ts';
import { analyzeLaunch } from '../launch/analyze.ts';
import { validateLaunch } from '../launch/validate.ts';
import { text } from './common.ts';

export function registerLaunchTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_launch_preview',
    label: 'ROS Launch Preview',
    description:
      'Resolve launch arguments with ros2 launch --show-args without starting nodes or processes.',
    promptSnippet: 'Preview ROS 2 launch arguments without launching',
    parameters: Type.Object({
      package: Type.String(),
      launchFile: Type.String(),
      arguments: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const command = {
        executable: 'ros2',
        args: [
          'launch',
          params.package,
          params.launchFile,
          '--show-args',
          ...(params.arguments ?? []),
        ],
        cwd: ctx.cwd,
      };
      const run = await runCommand(command.executable, command.args, {
        cwd: ctx.cwd,
        signal,
        timeoutMs: 15000,
        maxBytes: 50_000,
      });
      const failed = run.code !== 0 || run.timedOut || run.cancelled;
      return text(
        result(ctx.cwd, started, {
          ok: !failed,
          summary: failed
            ? 'Launch argument preview failed; no nodes were started.'
            : 'Launch arguments resolved successfully; no nodes were started.',
          data: { stdout: run.stdout, stderr: run.stderr },
          evidence: [
            { kind: 'launch_show_args', package: params.package, launchFile: params.launchFile },
          ],
          warnings: run.truncated
            ? [
                {
                  code: 'OUTPUT_TRUNCATED',
                  message: 'Launch preview output was truncated.',
                  severity: 'warning' as const,
                },
              ]
            : [],
          errors: failed
            ? [
                {
                  code: 'LAUNCH_PREVIEW_FAILED',
                  message: run.stderr || 'ros2 launch --show-args failed.',
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

  pi.registerTool({
    name: 'ros_launch_analyze',
    label: 'ROS Launch Analyze',
    description: 'Statically analyze a ROS 2 launch file without executing it.',
    promptSnippet: 'Analyze ROS 2 launch structure',
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await analyzeLaunch(params.path);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Launch analysis found ${data.nodes.length} node reference(s).`,
            data,
            evidence: [{ kind: 'launch_static_analysis', path: params.path }],
            warnings: data.warnings.map((message) => ({ message, severity: 'warning' as const })),
            errors: [],
            suggestions: [],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'OUTPUT_PARSE_FAILED',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_launch_validate',
    label: 'ROS Launch Validate',
    description:
      'Validate a ROS 2 launch file statically, including included file existence and identifiable nodes. Does not execute the launch file.',
    promptSnippet: 'Validate ROS 2 launch files without starting nodes',
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const analysis = await analyzeLaunch(params.path);
        const existingFiles = [params.path];
        for (const include of analysis.includes) {
          const candidate = resolve(dirname(params.path), include);
          try {
            if ((await stat(candidate)).isFile()) existingFiles.push(candidate);
          } catch {
            // The validator reports missing includes as structured diagnostics.
          }
        }
        const data = validateLaunch(analysis, existingFiles);
        return text(
          result(ctx.cwd, started, {
            ok: data.ok,
            summary: data.ok
              ? 'Launch file passed static validation.'
              : `Launch validation found ${data.missingFiles.length + data.warnings.length} issue(s).`,
            data: { analysis, validation: data },
            evidence: [
              ...data.missingFiles.map((path) => ({ kind: 'missing_launch_file', path })),
              ...data.warnings.map((message) => ({ kind: 'launch_warning', message })),
            ],
            warnings: data.warnings.map((message) => ({
              code: 'LAUNCH_VALIDATION',
              message,
              severity: 'warning' as const,
            })),
            errors: data.missingFiles.map((path) => ({
              code: 'MISSING_LAUNCH_FILE',
              message: `Included launch file does not exist: ${path}`,
              severity: 'error' as const,
              path,
            })),
            suggestions: data.ok
              ? []
              : [
                  {
                    message:
                      'Resolve missing includes or inspect dynamic launch code before executing.',
                    confidence: 'high',
                  },
                ],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'OUTPUT_PARSE_FAILED',
          ),
        );
      }
    },
  });
}
