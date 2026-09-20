import { runCommand } from '../core/runner.ts';

export interface ParameterReport {
  node: string;
  parameters: Record<string, string>;
  raw: string;
}

export async function inspectParameters(
  cwd: string,
  node: string,
  signal?: AbortSignal,
): Promise<ParameterReport> {
  const run = await runCommand('ros2', ['param', 'dump', node], {
    cwd,
    signal,
    timeoutMs: 10000,
    maxBytes: 50_000,
  });
  if (run.code !== 0) throw new Error(run.stderr || `Unable to inspect parameters for ${node}`);
  const parameters: Record<string, string> = {};
  for (const line of run.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s{4,}([^:#][^:]*):\s*(.*)$/);
    if (match) parameters[match[1].trim()] = mask(match[1].trim(), match[2].trim());
  }
  return { node, parameters, raw: run.stdout };
}

function mask(name: string, value: string): string {
  return /password|secret|token|credential|api[_-]?key/i.test(name) ? '<redacted>' : value;
}

export function diffParameters(left: Record<string, string>, right: Record<string, string>) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) =>
    left[key] === right[key]
      ? []
      : [
          {
            name: key,
            left: left[key],
            right: right[key],
            change:
              left[key] === undefined ? 'added' : right[key] === undefined ? 'removed' : 'changed',
          },
        ],
  );
}
