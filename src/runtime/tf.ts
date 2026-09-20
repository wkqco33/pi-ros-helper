import { runCommand } from "../core/runner.ts";

export interface TfReport { source: string; target: string; available: boolean; output: string; issues: string[]; }

export async function diagnoseTf(cwd: string, source: string, target: string, signal?: AbortSignal): Promise<TfReport> {
  const run = await runCommand("ros2", ["run", "tf2_ros", "tf2_echo", source, target], { cwd, signal, timeoutMs: 3000, maxBytes: 20_000 });
  const output = `${run.stdout}\n${run.stderr}`.trim();
  const issues: string[] = [];
  if (run.timedOut && !run.stdout) issues.push("No transform arrived before the timeout.");
  if (/extrapolation/i.test(output)) issues.push("Timestamp extrapolation was reported; check clock synchronization and transform timestamps.");
  if (/frame does not exist|could not find|not available/i.test(output)) issues.push("One or both frames are missing from the current TF tree.");
  return { source, target, available: run.code === 0 && Boolean(run.stdout), output, issues };
}
