import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { analyzePackage, resolvePackage } from '../package/analyze.ts';
import { planDependencies } from '../package/dependency-plan.ts';
import { failure, result } from '../core/result.ts';
import { text } from './common.ts';

export async function readDependencySources(root: string): Promise<string> {
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

export function registerPackageTools(pi: ExtensionAPI): void {
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
}
