import { runCommand } from '../core/runner.ts';

export interface BagInfo {
  path: string;
  storageId?: string;
  duration?: string;
  messages?: number;
  topics: { name: string; type?: string; count?: number }[];
  raw: string;
}

export async function inspectBag(
  cwd: string,
  path: string,
  signal?: AbortSignal,
): Promise<BagInfo> {
  const run = await runCommand('ros2', ['bag', 'info', path], {
    cwd,
    signal,
    timeoutMs: 15000,
    maxBytes: 50_000,
  });
  if (run.code !== 0) throw new Error(run.stderr || `Unable to inspect bag ${path}`);
  const topics = [
    ...run.stdout.matchAll(
      /^\s*-\s*Topic:\s*([^\n]+)\n\s*Type:\s*([^\n]+)(?:\n\s*Count:\s*(\d+))?/gim,
    ),
  ].map((m) => ({ name: m[1].trim(), type: m[2]?.trim(), count: m[3] ? Number(m[3]) : undefined }));
  return {
    path,
    storageId: run.stdout.match(/Storage id:\s*([^\n]+)/i)?.[1]?.trim(),
    duration: run.stdout.match(/Duration:\s*([^\n]+)/i)?.[1]?.trim(),
    messages: Number(run.stdout.match(/Message count:\s*(\d+)/i)?.[1] ?? 0) || undefined,
    topics,
    raw: run.stdout,
  };
}
