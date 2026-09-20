import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { detectEnvironment } from '../src/environment/discovery.ts';
import { inspectWorkspace } from '../src/workspace/inspect.ts';
import { analyzePackage, resolvePackage } from '../src/package/analyze.ts';
import { failure, result } from '../src/core/result.ts';
import { runCommand } from '../src/core/runner.ts';
import {
  classifyColconOutput,
  readTestResults,
  summarizeBuildWarnings,
  summarizeTestResults,
} from '../src/build/colcon.ts';
import { diagnoseColconFailure } from '../src/build/failure.ts';
import { ctestRegex, selectTests } from '../src/build/selection.ts';
import { planDependencies } from '../src/package/dependency-plan.ts';
import { summarizeValidation } from '../src/validation/bundle.ts';
import { buildCompletionEvidence } from '../src/validation/evidence.ts';
import { checkTdd } from '../src/validation/tdd.ts';
import { detectStaleTestArtifacts } from '../src/build/staleness.ts';
import { snapshotGraph, diffGraphs, type GraphSnapshot } from '../src/runtime/graph.ts';
import { assertGraph } from '../src/runtime/graph-assert.ts';
import { inspectQos } from '../src/runtime/qos.ts';
import { analyzeLaunch } from '../src/launch/analyze.ts';
import { validateLaunch } from '../src/launch/validate.ts';
import { inspectBag } from '../src/bag/info.ts';
import { isHighRiskTopic } from '../src/core/safety.ts';
import { diagnoseTf } from '../src/runtime/tf.ts';
import { inspectParameters, diffParameters } from '../src/runtime/params.ts';
import { validateParameterContract } from '../src/runtime/parameter-contract.ts';
import { analyzeLog } from '../src/runtime/logs.ts';
import { queryBag } from '../src/bag/query.ts';
import { runConfirmedControl } from '../src/runtime/control.ts';
import { join, resolve, dirname, basename } from 'node:path';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { scaffold } from '../src/generate/scaffold.ts';
import { packageScaffold } from '../src/generate/package.ts';
import { interfaceScaffold } from '../src/generate/interface.ts';

async function readDependencySources(root: string): Promise<string> {
  const chunks: string[] = [];
  async function visit(path: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory() && !['build', 'install', 'log'].includes(entry.name))
        await visit(child);
      else if (entry.isFile() && /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|ipp|tpp)$/.test(entry.name)) {
        chunks.push(await readFile(child, 'utf8').catch(() => ''));
      }
    }
  }
  await visit(root);
  return chunks.join('\n');
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  details: value,
});

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'ros_environment',
    label: 'ROS Environment',
    description:
      'Inspect ROS 2 installation, sourced environment, middleware, domain ID, and workspace discovery. Read-only.',
    promptSnippet: 'Inspect the current ROS 2 environment and workspace',
    promptGuidelines: [
      'Use ros_environment before runtime ROS 2 diagnostics when the environment is unknown.',
    ],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await detectEnvironment(ctx.cwd);
        return text(
          result(ctx.cwd, started, {
            ok: data.ros2Available,
            summary: data.ros2Available
              ? `ROS 2 environment detected${data.distro ? ` (${data.distro})` : ''}.`
              : 'ROS 2 CLI is not available in the current environment.',
            data,
            evidence: [{ kind: 'environment', ...data }],
            warnings: data.warnings.map((message) => ({ message, severity: 'warning' as const })),
            errors: data.ros2Available
              ? []
              : [
                  {
                    code: 'ROS_NOT_INSTALLED',
                    message: 'ros2 command is not available.',
                    severity: 'error' as const,
                  },
                ],
            suggestions: data.ros2Available
              ? []
              : [
                  {
                    message: 'Source /opt/ros/<distro>/setup.bash and retry.',
                    confidence: 'high' as const,
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
            'INTERNAL_ERROR',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_workspace_inspect',
    label: 'ROS Workspace',
    description: 'Inspect a ROS 2 workspace layout and enumerate package.xml packages. Read-only.',
    promptSnippet: 'Inspect ROS 2 workspace and package layout',
    promptGuidelines: [
      'Use ros_workspace_inspect to identify the active workspace before building.',
    ],
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Workspace or subdirectory to inspect' })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await inspectWorkspace(params.path ?? ctx.cwd);
        const ok = Boolean(data.root);
        return text(
          result(ctx.cwd, started, {
            ok,
            summary: ok
              ? `Found ${data.packages.length} ROS 2 package(s) in ${data.root}.`
              : 'No ROS 2 workspace was found.',
            data,
            evidence: data.root
              ? [{ kind: 'workspace', root: data.root, packageCount: data.packages.length }]
              : [],
            warnings: data.duplicateNames.map((name) => ({
              code: 'DUPLICATE_PACKAGE',
              message: `Duplicate package name: ${name}`,
              severity: 'warning' as const,
            })),
            errors: ok
              ? []
              : [
                  {
                    code: 'WORKSPACE_NOT_FOUND',
                    message: 'A workspace with a src directory was not found.',
                    severity: 'error' as const,
                  },
                ],
            suggestions: ok
              ? []
              : [
                  {
                    message: 'Run this tool from a workspace root or provide path explicitly.',
                    confidence: 'high' as const,
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
            'INTERNAL_ERROR',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_package_analyze',
    label: 'ROS Package Analyze',
    description:
      'Compare a ROS 2 package manifest with its build metadata and report likely dependency/configuration issues. Read-only.',
    promptSnippet: 'Analyze ROS 2 package metadata and dependencies',
    promptGuidelines: ['Use ros_package_analyze before changing package.xml or build files.'],
    parameters: Type.Object({
      package: Type.Optional(Type.String({ description: 'Package name or path' })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const pkg = await resolvePackage(ctx.cwd, params.package);
      if (!pkg)
        return text(
          failure(
            ctx.cwd,
            started,
            `Package not found: ${params.package ?? '(none)'}`,
            'PACKAGE_NOT_FOUND',
          ),
        );
      try {
        const data = await analyzePackage(pkg);
        return text(
          result(ctx.cwd, started, {
            ok: data.warnings.length === 0,
            summary:
              data.warnings.length === 0
                ? `${pkg.name} has no detected manifest/build inconsistencies.`
                : `${pkg.name} has ${data.warnings.length} potential issue(s).`,
            data,
            evidence: data.warnings.map((warning) => ({
              kind: warning.code,
              message: warning.message,
              path: warning.path,
            })),
            warnings: data.warnings.map((warning) => ({
              code: warning.code,
              message: warning.message,
              severity: 'warning' as const,
              path: warning.path,
            })),
            errors: [],
            suggestions: [
              {
                message:
                  "Review warnings against the package's intended build configuration before editing.",
                confidence: 'medium' as const,
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
    name: 'ros_dependency_plan',
    label: 'ROS Dependency Plan',
    description:
      'Compare ROS 2 includes and CMake find_package references with package.xml and preview dependency changes. Read-only.',
    promptSnippet: 'Plan ROS 2 package dependency changes',
    parameters: Type.Object({
      package: Type.Optional(Type.String({ description: 'Package name or path' })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const pkg = await resolvePackage(ctx.cwd, params.package);
      if (!pkg)
        return text(
          failure(
            ctx.cwd,
            started,
            `Package not found: ${params.package ?? '(none)'}`,
            'PACKAGE_NOT_FOUND',
          ),
        );
      try {
        const [packageXml, source, build] = await Promise.all([
          readFile(join(pkg.path, 'package.xml'), 'utf8'),
          readDependencySources(pkg.path),
          readFile(join(pkg.path, 'CMakeLists.txt'), 'utf8').catch(() => ''),
        ]);
        const data = planDependencies({ packageXml, source, build });
        return text(
          result(ctx.cwd, started, {
            ok: data.missing.length === 0,
            summary: data.missing.length
              ? `${data.missing.length} undeclared dependency reference(s) found in ${pkg.name}.`
              : `${pkg.name} has no detected undeclared dependency references.`,
            data,
            evidence: data.missing.map((name) => ({ kind: 'missing_dependency', package: name })),
            warnings: data.missing.map((name) => ({
              code: 'MISSING_DEPENDENCY',
              message: `${name} is referenced but not declared.`,
              severity: 'warning' as const,
              path: pkg.path,
            })),
            errors: [],
            suggestions: data.actions.map((message) => ({ message, confidence: 'high' as const })),
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
    name: 'ros_interface_scaffold_preview',
    label: 'ROS Interface Preview',
    description:
      'Generate a ROS 2 msg, srv, or action interface preview and list required package build changes. Does not write files.',
    promptSnippet: 'Preview a ROS 2 interface definition',
    parameters: Type.Object({
      packageName: Type.String(),
      name: Type.String(),
      kind: Type.Union([Type.Literal('msg'), Type.Literal('srv'), Type.Literal('action')]),
      fields: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = interfaceScaffold(params);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Generated a ${params.kind} interface preview for ${params.name}.`,
            data,
            evidence: [
              { kind: 'interface_scaffold_preview', name: params.name, interfaceKind: params.kind },
            ],
            warnings: [
              {
                code: 'PREVIEW_ONLY',
                message: 'No interface files were written and package files were not modified.',
                severity: 'info' as const,
              },
            ],
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
    name: 'ros_package_scaffold',
    label: 'ROS Package Scaffold',
    description:
      'Write a reviewed ROS 2 package scaffold to a selected directory. Requires explicit confirmation and never overwrites existing files.',
    promptSnippet: 'Create a confirmed ROS 2 package scaffold',
    parameters: Type.Object({
      packageName: Type.String(),
      nodeName: Type.String(),
      language: Type.Union([Type.Literal('python'), Type.Literal('cpp')]),
      destination: Type.String(),
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const generated = packageScaffold(params);
        const root = resolve(ctx.cwd, params.destination);
        const files = Object.entries(generated.files).map(([path, content]) => ({
          path: resolve(root, path),
          content,
        }));
        const command = {
          executable: 'write-files',
          args: files.map((file) => file.path),
          cwd: root,
        };
        if (!params.execute)
          return text(
            result(ctx.cwd, started, {
              ok: true,
              summary: `Scaffold preview contains ${files.length} file(s); nothing was written.`,
              data: generated,
              evidence: [
                { kind: 'scaffold_write_preview', root, files: files.map((file) => file.path) },
              ],
              warnings: [
                {
                  code: 'PREVIEW_ONLY',
                  message: 'Set execute=true to write new files after confirmation.',
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
            'Create ROS 2 package?',
            `${root}\n${files.length} new files will be created. Existing files are never overwritten.`,
          ))
        )
          return text(
            failure(
              ctx.cwd,
              started,
              'Scaffold creation cancelled or requires interactive confirmation.',
              'UNSAFE_OPERATION_DENIED',
              { commands: [command] },
            ),
          );
        await mkdir(root, { recursive: true });
        // Imported lazily: the pi host package reads `globSync` from `node:fs`,
        // which only exists on Node 22+. Loading it eagerly would make the whole
        // extension fail to load on Node 20.
        const { withFileMutationQueue } = await import('@earendil-works/pi-coding-agent');
        for (const file of files)
          await withFileMutationQueue(file.path, async () => {
            try {
              await writeFile(file.path, file.content, { flag: 'wx' });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                throw new Error(`Refusing to overwrite existing file: ${file.path}`);
              throw error;
            }
          });
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Created ${files.length} new ROS 2 package file(s).`,
            data: { root, files: files.map((file) => file.path) },
            evidence: [{ kind: 'scaffold_created', root }],
            warnings: [],
            errors: [],
            suggestions: [],
            commands: [command],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'SCAFFOLD_FAILED',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_package_scaffold_preview',
    label: 'ROS Package Preview',
    description:
      'Generate a complete minimal ROS 2 package layout in memory for review; no files are written.',
    promptSnippet: 'Preview a complete ROS 2 package scaffold',
    parameters: Type.Object({
      packageName: Type.String(),
      nodeName: Type.String(),
      language: Type.Union([Type.Literal('python'), Type.Literal('cpp')]),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = packageScaffold(params);
      return text(
        result(ctx.cwd, started, {
          ok: true,
          summary: `Generated a ${params.language} ROS 2 package preview.`,
          data,
          evidence: [{ kind: 'package_scaffold_preview', packageName: params.packageName }],
          warnings: [
            { code: 'PREVIEW_ONLY', message: 'No files were written.', severity: 'info' as const },
          ],
          errors: [],
          suggestions: [],
        }),
      );
    },
  });

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
    name: 'ros_scaffold_preview',
    label: 'ROS Scaffold Preview',
    description:
      'Generate a minimal ROS 2 node scaffold in memory for review; this tool does not write files.',
    promptSnippet: 'Preview a ROS 2 node scaffold',
    parameters: Type.Object({
      name: Type.String(),
      language: Type.Union([Type.Literal('python'), Type.Literal('cpp')]),
      kind: Type.Union([
        Type.Literal('publisher'),
        Type.Literal('subscriber'),
        Type.Literal('node'),
      ]),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = scaffold(params);
      return text(
        result(ctx.cwd, started, {
          ok: true,
          summary: `Generated an in-memory ${params.language} ${params.kind} scaffold.`,
          data,
          evidence: [{ kind: 'scaffold_preview', name: params.name }],
          warnings: [
            { code: 'PREVIEW_ONLY', message: 'No files were written.', severity: 'info' as const },
          ],
          errors: [],
          suggestions: [],
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_bag_query',
    label: 'ROS Bag Query',
    description:
      'Read bounded rosbag2 samples using rosbag2_py and report timestamps, serialized sizes, and gaps without replaying or modifying the bag.',
    promptSnippet: 'Query bounded rosbag2 samples',
    parameters: Type.Object({
      bagPath: Type.String(),
      topic: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
      gapNanoseconds: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await queryBag(ctx.cwd, join(ctx.cwd, 'helpers/bag_query.py'), params, signal);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Read bounded bag samples${params.topic ? ` for ${params.topic}` : ''}.`,
            data,
            evidence: [{ kind: 'bag_query', bagPath: params.bagPath, topic: params.topic }],
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
            'COMMAND_FAILED',
          ),
        );
      }
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

  pi.registerTool({
    name: 'ros_bag_inspect',
    label: 'ROS Bag Inspect',
    description:
      'Read bounded rosbag2 metadata using ros2 bag info; does not replay or modify the bag.',
    promptSnippet: 'Inspect rosbag2 metadata and topics',
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await inspectBag(ctx.cwd, params.path, signal);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Bag contains ${data.topics.length} topic metadata record(s).`,
            data,
            evidence: [{ kind: 'bag_metadata', path: params.path }],
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
            'COMMAND_FAILED',
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
    name: 'ros_tdd_checkpoint',
    label: 'ROS TDD Checkpoint',
    description:
      'Check whether source changes have related test changes before implementation is considered complete. Read-only.',
    promptSnippet: 'Check the ROS 2 TDD checkpoint for changed files',
    parameters: Type.Object({
      changedPaths: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
      testChangedPaths: Type.Optional(Type.Array(Type.String(), { maxItems: 500 })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      let changedPaths = params.changedPaths ?? [];
      if (!changedPaths.length) {
        const diff = await runCommand('git', ['diff', '--name-only', 'HEAD'], {
          cwd: ctx.cwd,
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
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const workspace = await inspectWorkspace(ctx.cwd);
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

  pi.registerCommand('ros-status', {
    description: 'Show a concise ROS 2 environment status',
    handler: async (_args, ctx) => {
      const environment = await detectEnvironment(ctx.cwd);
      const workspace = await inspectWorkspace(ctx.cwd);
      ctx.ui.notify(
        `ROS ${environment.distro ?? 'unknown'} · ${workspace.root ?? 'no workspace'} · ${environment.ros2Available ? 'CLI ready' : 'CLI unavailable'}`,
        environment.ros2Available ? 'info' : 'warning',
      );
    },
  });
}
