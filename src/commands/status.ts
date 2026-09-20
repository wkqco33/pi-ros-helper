import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { detectEnvironment } from '../environment/discovery.ts';
import { inspectWorkspace } from '../workspace/inspect.ts';

export function registerStatusCommand(pi: ExtensionAPI): void {
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
