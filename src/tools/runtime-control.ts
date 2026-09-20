import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { failure, result } from '../core/result.ts';
import { runCommand } from '../core/runner.ts';
import { runConfirmedControl } from '../runtime/control.ts';
import { isHighRiskTopic } from '../core/safety.ts';
import { text } from './common.ts';

export function registerRuntimeControlTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_lifecycle_transition',
    label: 'ROS Lifecycle Transition',
    description:
      'Preview or execute one lifecycle transition. Requires explicit opt-in and interactive confirmation.',
    promptSnippet: 'Preview or confirm one ROS 2 lifecycle transition',
    parameters: Type.Object({
      node: Type.String(),
      transition: Type.String(),
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const command = {
        executable: 'ros2',
        args: ['lifecycle', 'set', params.node, params.transition],
        cwd: ctx.cwd,
      };
      if (!params.execute)
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'Lifecycle transition preview generated; no transition was made.',
            evidence: [{ kind: 'command_preview', ...command }],
            warnings: [
              {
                code: 'CONTROL_PREVIEW',
                message: 'Lifecycle transitions change node runtime state.',
                severity: 'warning' as const,
              },
            ],
            errors: [],
            suggestions: [],
            commands: [command],
          }),
        );
      if (
        !ctx.hasUI ||
        !(await ctx.ui.confirm(
          'Confirm lifecycle transition',
          `${params.node} → ${params.transition}`,
        ))
      )
        return text(
          failure(
            ctx.cwd,
            started,
            'Lifecycle transition cancelled or requires interactive confirmation.',
            'UNSAFE_OPERATION_DENIED',
            { commands: [command] },
          ),
        );
      const run = await runConfirmedControl(command, signal);
      return text(
        result(ctx.cwd, started, {
          ok: run.code === 0,
          summary:
            run.code === 0 ? 'Lifecycle transition completed.' : 'Lifecycle transition failed.',
          data: { stdout: run.stdout, stderr: run.stderr },
          evidence: [
            { kind: 'lifecycle_transition', node: params.node, transition: params.transition },
          ],
          warnings: [],
          errors:
            run.code === 0
              ? []
              : [
                  {
                    code: 'LIFECYCLE_FAILED',
                    message: run.stderr || 'Lifecycle transition failed.',
                    severity: 'error' as const,
                  },
                ],
          suggestions: [],
          commands: [command],
          truncated: run.truncated,
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_service_call',
    label: 'ROS Service Call',
    description:
      'Preview or execute one ROS 2 service call. Execution requires explicit opt-in and interactive confirmation.',
    promptSnippet: 'Preview or confirm one ROS 2 service call',
    parameters: Type.Object({
      service: Type.String(),
      type: Type.String(),
      request: Type.String(),
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const command = {
        executable: 'ros2',
        args: ['service', 'call', params.service, params.type, params.request],
        cwd: ctx.cwd,
      };
      if (!params.execute)
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'Service call preview generated; no call was made.',
            evidence: [{ kind: 'command_preview', ...command }],
            warnings: [
              {
                code: 'CONTROL_PREVIEW',
                message: 'A service call may change robot state.',
                severity: 'warning' as const,
              },
            ],
            errors: [],
            suggestions: [],
            commands: [command],
          }),
        );
      if (
        !ctx.hasUI ||
        !(await ctx.ui.confirm('Confirm ROS service call', `${params.service} (${params.type})`))
      )
        return text(
          failure(
            ctx.cwd,
            started,
            'Service call cancelled or requires interactive confirmation.',
            'UNSAFE_OPERATION_DENIED',
            { commands: [command] },
          ),
        );
      const run = await runConfirmedControl(command, signal);
      return text(
        result(ctx.cwd, started, {
          ok: run.code === 0,
          summary: run.code === 0 ? 'Service call completed.' : 'Service call failed.',
          data: { stdout: run.stdout, stderr: run.stderr },
          evidence: [{ kind: 'service_call', service: params.service }],
          warnings: [],
          errors:
            run.code === 0
              ? []
              : [
                  {
                    code: 'SERVICE_CALL_FAILED',
                    message: run.stderr || 'Service call failed.',
                    severity: 'error' as const,
                  },
                ],
          suggestions: [],
          commands: [command],
          truncated: run.truncated,
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_action_goal',
    label: 'ROS Action Goal',
    description:
      'Preview or execute one ROS 2 action goal. Execution requires explicit opt-in and interactive confirmation.',
    promptSnippet: 'Preview or confirm one ROS 2 action goal',
    parameters: Type.Object({
      action: Type.String(),
      type: Type.String(),
      goal: Type.String(),
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const command = {
        executable: 'ros2',
        args: ['action', 'send_goal', params.action, params.type, params.goal],
        cwd: ctx.cwd,
      };
      if (!params.execute)
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'Action goal preview generated; no goal was sent.',
            evidence: [{ kind: 'command_preview', ...command }],
            warnings: [
              {
                code: 'CONTROL_PREVIEW',
                message: 'An action goal may move hardware or run for an extended time.',
                severity: 'warning' as const,
              },
            ],
            errors: [],
            suggestions: [],
            commands: [command],
          }),
        );
      if (
        !ctx.hasUI ||
        !(await ctx.ui.confirm('Confirm ROS action goal', `${params.action} (${params.type})`))
      )
        return text(
          failure(
            ctx.cwd,
            started,
            'Action goal cancelled or requires interactive confirmation.',
            'UNSAFE_OPERATION_DENIED',
            { commands: [command] },
          ),
        );
      const run = await runConfirmedControl(command, signal);
      return text(
        result(ctx.cwd, started, {
          ok: run.code === 0,
          summary: run.code === 0 ? 'Action goal completed.' : 'Action goal failed.',
          data: { stdout: run.stdout, stderr: run.stderr },
          evidence: [{ kind: 'action_goal', action: params.action }],
          warnings: [],
          errors:
            run.code === 0
              ? []
              : [
                  {
                    code: 'ACTION_GOAL_FAILED',
                    message: run.stderr || 'Action goal failed.',
                    severity: 'error' as const,
                  },
                ],
          suggestions: [],
          commands: [command],
          truncated: run.truncated,
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_topic_sample',
    label: 'ROS Topic Sample',
    description: 'Capture one bounded sample from a ROS 2 topic. Never starts an unbounded echo.',
    promptSnippet: 'Capture a bounded ROS 2 topic sample',
    parameters: Type.Object({
      topic: Type.String(),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const run = await runCommand('ros2', ['topic', 'echo', '--once', params.topic], {
        cwd: ctx.cwd,
        signal,
        timeoutMs: (params.timeoutSeconds ?? 5) * 1000,
        maxBytes: 50_000,
      });
      const failed = run.code !== 0 || run.timedOut || run.cancelled;
      return text(
        result(ctx.cwd, started, {
          ok: !failed,
          summary: run.cancelled
            ? 'Topic sample cancelled.'
            : run.timedOut
              ? 'No topic sample arrived before timeout.'
              : failed
                ? `Unable to sample ${params.topic}.`
                : `Captured one sample from ${params.topic}.`,
          data: { topic: params.topic, output: run.stdout, stderr: run.stderr },
          evidence: [{ kind: 'topic_sample', topic: params.topic }],
          warnings: run.truncated
            ? [
                {
                  code: 'OUTPUT_TRUNCATED',
                  message: 'Topic sample was truncated.',
                  severity: 'warning' as const,
                },
              ]
            : [],
          errors: failed
            ? [
                {
                  code: run.timedOut ? 'COMMAND_TIMEOUT' : 'TOPIC_SAMPLE_FAILED',
                  message: run.stderr || 'Topic sample failed.',
                  severity: 'error' as const,
                },
              ]
            : [],
          suggestions: [],
          truncated: run.truncated,
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_topic_publish',
    label: 'ROS Topic Publish',
    description:
      'Preview or perform one bounded ROS 2 topic publish. Requires explicit execute=true and interactive confirmation; repeated publishing is not supported.',
    promptSnippet: 'Preview or explicitly confirm one ROS 2 topic publish',
    parameters: Type.Object({
      topic: Type.String(),
      type: Type.String(),
      message: Type.String(),
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const command = {
        executable: 'ros2',
        args: ['topic', 'pub', '--once', params.topic, params.type, params.message],
        cwd: ctx.cwd,
      };
      if (!params.execute)
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'Publish command preview generated; no message was sent.',
            evidence: [
              { kind: 'command_preview', ...command, highRisk: isHighRiskTopic(params.topic) },
            ],
            warnings: [
              {
                code: 'ACTUATION_PREVIEW',
                message: 'Publishing can affect a running robot.',
                severity: 'warning' as const,
              },
            ],
            errors: [],
            suggestions: [
              {
                message: 'Set execute=true only after reviewing topic, type, and payload.',
                confidence: 'high',
              },
            ],
            commands: [command],
          }),
        );
      if (!ctx.hasUI)
        return text(
          failure(
            ctx.cwd,
            started,
            'Interactive confirmation is required for topic publishing.',
            'UNSAFE_OPERATION_DENIED',
            { commands: [command] },
          ),
        );
      const confirmed = await ctx.ui.confirm(
        'Confirm ROS topic publish',
        `${params.topic} (${params.type})\nOne message will be published. This may affect hardware.`,
      );
      if (!confirmed)
        return text(
          failure(ctx.cwd, started, 'Topic publish cancelled by user.', 'UNSAFE_OPERATION_DENIED', {
            commands: [command],
          }),
        );
      const run = await runCommand(command.executable, command.args, {
        cwd: ctx.cwd,
        signal,
        timeoutMs: 10000,
        maxBytes: 10000,
      });
      return text(
        result(ctx.cwd, started, {
          ok: run.code === 0,
          summary:
            run.code === 0 ? 'One ROS topic message was published.' : 'ROS topic publish failed.',
          data: { stdout: run.stdout, stderr: run.stderr },
          evidence: [
            { kind: 'topic_publish', topic: params.topic, highRisk: isHighRiskTopic(params.topic) },
          ],
          warnings: [],
          errors:
            run.code === 0
              ? []
              : [
                  {
                    code: 'PUBLISH_FAILED',
                    message: run.stderr || 'Publish command failed.',
                    severity: 'error' as const,
                  },
                ],
          suggestions: [],
          commands: [command],
          truncated: run.truncated,
        }),
      );
    },
  });
}
