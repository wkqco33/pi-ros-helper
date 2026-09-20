import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { inspectWorkspace } from '../workspace/inspect.ts';
import { failure, result } from '../core/result.ts';
import { text } from './common.ts';

export function registerWorkspaceTools(pi: ExtensionAPI): void {
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
}
