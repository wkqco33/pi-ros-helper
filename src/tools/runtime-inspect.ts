import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { failure, result } from '../core/result.ts';
import { diagnoseTf } from '../runtime/tf.ts';
import { inspectParameters, diffParameters } from '../runtime/params.ts';
import { validateParameterContract } from '../runtime/parameter-contract.ts';
import { analyzeLog } from '../runtime/logs.ts';
import { inspectQos } from '../runtime/qos.ts';
import { snapshotGraph, diffGraphs, type GraphSnapshot } from '../runtime/graph.ts';
import { assertGraph } from '../runtime/graph-assert.ts';
import { text } from './common.ts';

export function registerRuntimeInspectTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_tf_diagnose',
    label: 'ROS TF Diagnose',
    description:
      'Check whether a bounded TF2 lookup succeeds between two frames and summarize common failures.',
    promptSnippet: 'Diagnose a ROS 2 TF transform lookup',
    parameters: Type.Object({
      source: Type.String(),
      target: Type.String(),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 15 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await diagnoseTf(
          ctx.cwd,
          params.source,
          params.target,
          signal,
          (params.timeoutSeconds ?? 3) * 1000,
        );
        return text(
          result(ctx.cwd, started, {
            ok: data.available,
            summary: data.available
              ? `Transform ${params.source} -> ${params.target} is available.`
              : `Transform ${params.source} -> ${params.target} is unavailable.`,
            data,
            evidence: data.issues.map((message) => ({ kind: 'tf_issue', message })),
            warnings: data.issues.map((message) => ({
              code: 'TF_DIAGNOSTIC',
              message,
              severity: 'warning' as const,
            })),
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
            'GRAPH_UNAVAILABLE',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_param_inspect',
    label: 'ROS Parameters',
    description: 'Dump parameters from a running ROS 2 node with likely secret values redacted.',
    promptSnippet: 'Inspect ROS 2 node parameters',
    parameters: Type.Object({ node: Type.String() }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await inspectParameters(ctx.cwd, params.node, signal);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Read ${Object.keys(data.parameters).length} parameter(s) from ${params.node}.`,
            data,
            evidence: [{ kind: 'parameters', node: params.node }],
            warnings: [],
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
            'GRAPH_UNAVAILABLE',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_param_diff',
    label: 'ROS Parameter Diff',
    description:
      'Compare two parameter maps supplied as JSON objects without changing a running node.',
    promptSnippet: 'Compare ROS 2 parameter sets',
    parameters: Type.Object({
      left: Type.Record(Type.String(), Type.String()),
      right: Type.Record(Type.String(), Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = diffParameters(params.left, params.right);
      return text(
        result(ctx.cwd, started, {
          ok: true,
          summary: data.length
            ? `${data.length} parameter difference(s) found.`
            : 'Parameter sets are identical.',
          data,
          evidence: [{ kind: 'parameter_diff', count: data.length }],
          warnings: [],
          errors: [],
          suggestions: [],
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_parameter_validate',
    label: 'ROS Parameter Validate',
    description:
      'Compare declared ROS 2 parameter types with a supplied configuration map without changing a running node. Read-only.',
    promptSnippet: 'Validate a ROS 2 parameter configuration contract',
    parameters: Type.Object({
      declared: Type.Record(Type.String(), Type.String(), {
        description: 'Parameter name to declared type, e.g. queue_depth: integer',
      }),
      configured: Type.Record(Type.String(), Type.String(), {
        description: 'Parameter name to configured scalar value as text',
      }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = validateParameterContract(params.declared, params.configured);
      return text(
        result(ctx.cwd, started, {
          ok: data.ok,
          summary: data.ok
            ? 'Parameter configuration matches the declared contract.'
            : `Parameter contract has ${data.missing.length + data.unknown.length + data.typeMismatches.length} issue(s).`,
          data,
          evidence: [
            ...data.missing.map((name) => ({ kind: 'missing_parameter', name })),
            ...data.unknown.map((name) => ({ kind: 'unknown_parameter', name })),
            ...data.typeMismatches.map((item) => ({ kind: 'parameter_type_mismatch', ...item })),
          ],
          warnings: [
            ...data.missing.map((name) => ({
              code: 'MISSING_PARAMETER',
              message: `${name} is declared but not configured.`,
              severity: 'warning' as const,
            })),
            ...data.unknown.map((name) => ({
              code: 'UNKNOWN_PARAMETER',
              message: `${name} is configured but not declared.`,
              severity: 'warning' as const,
            })),
          ],
          errors: data.typeMismatches.map((item) => ({
            code: 'PARAMETER_TYPE_MISMATCH',
            message: `${item.name} expects ${item.expected} but looks like ${item.actual}.`,
            severity: 'error' as const,
          })),
          suggestions: data.ok
            ? []
            : [
                {
                  message:
                    'Review the parameter declaration and YAML/launch value before starting the node.',
                  confidence: 'high',
                },
              ],
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_log_analyze',
    label: 'ROS Log Analyze',
    description:
      'Analyze a ROS or colcon log file, summarize errors/warnings, and collapse repeated lines.',
    promptSnippet: 'Analyze ROS 2 logs and find repeated errors',
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await analyzeLog(params.path);
        return text(
          result(ctx.cwd, started, {
            ok: data.errors.length === 0,
            summary: `${data.lines} log line(s), ${data.errors.length} error(s), ${data.warnings.length} warning(s), ${data.testFailures.length} failing test line(s).`,
            data,
            evidence: [
              { kind: 'log_summary', path: params.path },
              ...data.testFailures.map((line) => ({ kind: 'test_failure', message: line })),
            ],
            warnings: data.warnings.length
              ? [
                  {
                    code: 'LOG_WARNINGS',
                    message: `${data.warnings.length} warning line(s) found.`,
                    severity: 'warning' as const,
                  },
                ]
              : [],
            errors: data.testFailures.length
              ? [
                  {
                    code: 'TEST_FAILURE',
                    message: `${data.testFailures.length} failing test line(s) detected.`,
                    severity: 'error' as const,
                  },
                ]
              : [],
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
    name: 'ros_qos_check',
    label: 'ROS QoS Check',
    description:
      'Inspect publisher/subscriber QoS for a ROS 2 topic and report likely compatibility mismatches.',
    promptSnippet: 'Check ROS 2 topic QoS compatibility',
    promptGuidelines: [
      'Use ros_qos_check when discovery succeeds but a subscriber receives no messages.',
    ],
    parameters: Type.Object({ topic: Type.String() }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await inspectQos(ctx.cwd, params.topic, signal);
        return text(
          result(ctx.cwd, started, {
            ok: data.compatibility !== 'potential_mismatch',
            summary: data.notes.length
              ? `Potential QoS mismatch detected on ${params.topic}.`
              : `No obvious QoS mismatch detected on ${params.topic}.`,
            data,
            evidence: data.notes.map((message) => ({ kind: 'qos_mismatch', message })),
            warnings: data.notes.map((message) => ({
              code: 'QOS_MISMATCH',
              message,
              severity: 'warning' as const,
            })),
            errors: [],
            suggestions: data.notes.length
              ? [
                  {
                    message:
                      'Compare reliability and durability with the intended QoS profile, especially sensor data topics.',
                    confidence: 'high' as const,
                  },
                ]
              : [],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'GRAPH_UNAVAILABLE',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_graph_snapshot',
    label: 'ROS Graph Snapshot',
    description:
      'Capture a bounded snapshot of ROS 2 nodes, topics with types, and services using ros2 CLI.',
    promptSnippet: 'Capture the current ROS 2 graph',
    promptGuidelines: [
      'Use ros_graph_snapshot to compare runtime state before and after launching nodes.',
    ],
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await snapshotGraph(ctx.cwd, signal);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Captured ${data.nodes.length} node(s), ${data.topics.length} topic(s), and ${data.services.length} service(s).`,
            data,
            evidence: [
              {
                kind: 'graph_snapshot',
                nodeCount: data.nodes.length,
                topicCount: data.topics.length,
                serviceCount: data.services.length,
              },
            ],
            warnings: [],
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
            'GRAPH_UNAVAILABLE',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_graph_diff',
    label: 'ROS Graph Diff',
    description:
      'Compare a saved ROS graph snapshot with a current live snapshot or another supplied snapshot.',
    promptSnippet: 'Compare ROS 2 graph snapshots',
    parameters: Type.Object({ previous: Type.Unknown(), current: Type.Optional(Type.Unknown()) }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const previous = params.previous as GraphSnapshot;
        const current =
          (params.current as GraphSnapshot | undefined) ?? (await snapshotGraph(ctx.cwd, signal));
        const data = diffGraphs(previous, current);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: 'ROS graph comparison completed.',
            data,
            evidence: [{ kind: 'graph_diff', data }],
            warnings: [],
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
            'INVALID_ARGUMENT',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_graph_assert',
    label: 'ROS Graph Assert',
    description:
      'Compare an expected ROS graph shape with a current or supplied snapshot and report missing or unexpected resources. Read-only.',
    promptSnippet: 'Assert the expected ROS 2 graph state',
    parameters: Type.Object({
      expected: Type.Object({
        nodes: Type.Array(Type.String()),
        topics: Type.Array(Type.String()),
        services: Type.Array(Type.String()),
      }),
      current: Type.Optional(Type.Unknown()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const current =
          (params.current as GraphSnapshot | undefined) ?? (await snapshotGraph(ctx.cwd, signal));
        const shape = {
          nodes: current.nodes,
          topics: current.topics.map((topic) => topic.name),
          services: current.services,
        };
        const data = assertGraph(params.expected, shape);
        return text(
          result(ctx.cwd, started, {
            ok: data.ok,
            summary: data.ok
              ? 'ROS graph matches the expected shape.'
              : 'ROS graph differs from the expected shape.',
            data,
            evidence: [
              ...data.missing.nodes.map((name) => ({ kind: 'missing_node', name })),
              ...data.missing.topics.map((name) => ({ kind: 'missing_topic', name })),
              ...data.unexpected.nodes.map((name) => ({ kind: 'unexpected_node', name })),
              ...data.unexpected.topics.map((name) => ({ kind: 'unexpected_topic', name })),
            ],
            warnings: [],
            errors: data.ok
              ? []
              : [
                  {
                    code: 'GRAPH_ASSERTION_FAILED',
                    message: 'Expected ROS graph resources do not match the current graph.',
                    severity: 'error' as const,
                  },
                ],
            suggestions: data.ok
              ? []
              : [
                  {
                    message:
                      'Inspect launch, namespace, discovery, and QoS configuration before changing application code.',
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
            'GRAPH_UNAVAILABLE',
          ),
        );
      }
    },
  });
}
