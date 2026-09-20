import { readFile } from "node:fs/promises";

export interface LogSummary { lines: number; errors: string[]; warnings: string[]; repeated: { message: string; count: number }[]; }

export async function analyzeLog(path: string): Promise<LogSummary> {
  const source = await readFile(path, "utf8");
  const all = source.split(/\r?\n/).filter(Boolean);
  const errors = all.filter((line) => /\b(error|fatal|critical)\b/i.test(line)).slice(0, 50);
  const warnings = all.filter((line) => /\bwarn(?:ing)?\b/i.test(line)).slice(0, 50);
  const counts = new Map<string, number>();
  for (const line of all) {
    const normalized = line.replace(/\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?/, "<timestamp>").trim();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([message, count]) => ({ message, count }));
  return { lines: all.length, errors, warnings, repeated };
}
