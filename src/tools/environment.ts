import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { detectEnvironment } from '../environment/discovery.ts';
import { failure, result } from '../core/result.ts';
import { text } from './common.ts';

export function registerEnvironmentTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_environment',
    label: 'ROS Environment',
    description:
      'Inspect ROS 2 installation, sourced environment, middleware, domain ID, and workspace discovery. Read-only.',
    promptSnippet: 'Inspect the current ROS 2 environment and workspace',
    promptGuidelines: [
      'Use ros_environment before runtime ROS 2 diagnostics when the environment is unknown.',
    ],
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: 'Directory to inspect; defaults to the session cwd.' }),
      ),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await detectEnvironment(params.path ?? ctx.cwd);
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
}
