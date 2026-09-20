import { runCommand } from '../core/runner.ts';

export interface BagQuery {
  bagPath: string;
  topic?: string;
  limit?: number;
  gapNanoseconds?: number;
}
export async function queryBag(
  cwd: string,
  helper: string,
  query: BagQuery,
  signal?: AbortSignal,
): Promise<unknown> {
  const run = await runCommand('python3', [helper], {
    cwd,
    signal,
    timeoutMs: 30000,
    maxBytes: 100_000,
    stdin: JSON.stringify(query),
  });
  if (run.code !== 0) throw new Error(run.stderr || 'rosbag query failed');
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error('rosbag query returned invalid JSON');
  }
}
export { runCommand };
