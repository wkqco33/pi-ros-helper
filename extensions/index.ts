import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerAllTools } from '../src/tools/index.ts';
import { registerStatusCommand } from '../src/commands/status.ts';

export default function (pi: ExtensionAPI) {
  registerAllTools(pi);
  registerStatusCommand(pi);
}
