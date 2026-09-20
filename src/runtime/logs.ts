import { readFile } from 'node:fs/promises';

export interface LogSummary {
  lines: number;
  errors: string[];
  warnings: string[];
  repeated: { message: string; count: number }[];
}

export type LogSeverity = 'error' | 'warning';

const ROS_SEVERITY = /\[(FATAL|ERROR|WARN|WARNING|INFO|DEBUG)\]/i;

/**
 * Classify a log line by its ROS severity tag first and fall back to keywords,
 * so a `[WARN]` line that merely mentions "error" is not reported as an error.
 */
export function classifyLogLine(line: string): LogSeverity | undefined {
  const tagged = ROS_SEVERITY.exec(line);
  if (tagged) {
    const level = tagged[1].toUpperCase();
    if (level === 'FATAL' || level === 'ERROR') return 'error';
    if (level === 'WARN' || level === 'WARNING') return 'warning';
    return undefined;
  }
  if (/\b(error|fatal|critical)\b/i.test(line)) return 'error';
  if (/\bwarn(?:ing)?\b/i.test(line)) return 'warning';
  return undefined;
}

export async function analyzeLog(path: string): Promise<LogSummary> {
  const source = await readFile(path, 'utf8');
  const all = source.split(/\r?\n/).filter(Boolean);
  const severity = all.map((line) => classifyLogLine(line));
  const errors = all.filter((_, index) => severity[index] === 'error').slice(0, 50);
  const warnings = all.filter((_, index) => severity[index] === 'warning').slice(0, 50);
  const counts = new Map<string, number>();
  for (const line of all) {
    const normalized = line
      .replace(/\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?/, '<timestamp>')
      .trim();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const repeated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([message, count]) => ({ message, count }));
  return { lines: all.length, errors, warnings, repeated };
}
