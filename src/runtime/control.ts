import { runCommand } from "../core/runner.ts";
export interface ControlCommand { executable: string; args: string[]; cwd: string; }
export async function runConfirmedControl(command: ControlCommand, signal?: AbortSignal) {
  return runCommand(command.executable, command.args, { cwd: command.cwd, signal, timeoutMs: 15000, maxBytes: 50_000 });
}
