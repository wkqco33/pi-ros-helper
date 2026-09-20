import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerEnvironmentTools } from './environment.ts';
import { registerWorkspaceTools } from './workspace.ts';
import { registerPackageTools } from './package.ts';
import { registerBuildTools } from './build.ts';
import { registerRuntimeInspectTools } from './runtime-inspect.ts';
import { registerRuntimeControlTools } from './runtime-control.ts';
import { registerGenerateTools } from './generate.ts';
import { registerLaunchTools } from './launch.ts';
import { registerBagTools } from './bag.ts';
import { registerValidationTools } from './validation.ts';

export * from './environment.ts';
export * from './workspace.ts';
export * from './package.ts';
export * from './build.ts';
export * from './runtime-inspect.ts';
export * from './runtime-control.ts';
export * from './generate.ts';
export * from './launch.ts';
export * from './bag.ts';
export * from './validation.ts';
export * from './common.ts';

export function registerAllTools(pi: ExtensionAPI): void {
  registerEnvironmentTools(pi);
  registerWorkspaceTools(pi);
  registerPackageTools(pi);
  registerBuildTools(pi);
  registerRuntimeInspectTools(pi);
  registerRuntimeControlTools(pi);
  registerGenerateTools(pi);
  registerLaunchTools(pi);
  registerBagTools(pi);
  registerValidationTools(pi);
}
