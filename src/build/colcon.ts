import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../core/runner.ts';

export interface ColconFailure {
  package?: string;
  kind: 'compiler' | 'linker' | 'cmake' | 'rosidl' | 'python' | 'test' | 'unknown';
  message: string;
  line?: string;
}

export function classifyColconOutput(output: string): ColconFailure[] {
  const failures: ColconFailure[] = [];
  const seen = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let kind: ColconFailure['kind'] | undefined;
    if (/fatal error:| error:/.test(line) && /\.cpp|\.hpp|\.cxx|\.h/.test(line)) kind = 'compiler';
    else if (/undefined reference|ld returned|linker command failed/i.test(line)) kind = 'linker';
    else if (/CMake Error|cmake.*error/i.test(line)) kind = 'cmake';
    else if (/rosidl|interface generation|generate.*message/i.test(line)) kind = 'rosidl';
    else if (/ModuleNotFoundError|setup.py|pip.*error|Python/i.test(line)) kind = 'python';
    else if (/FAILED|test.*failed|pytest.*failed/i.test(line)) kind = 'test';
    if (!kind || seen.has(line)) continue;
    seen.add(line);
    failures.push({ kind, message: line, line });
  }
  const priority: Record<ColconFailure['kind'], number> = {
    compiler: 0,
    linker: 1,
    cmake: 2,
    rosidl: 3,
    python: 4,
    test: 5,
    unknown: 6,
  };
  return failures.sort((a, b) => priority[a.kind] - priority[b.kind]).slice(0, 20);
}

export interface TestResult {
  package: string;
  tests: number;
  failures: number;
  errors: string[];
}

async function collectXml(dir: string, output: TestResult[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collectXml(path, output);
    else if (entry.name.endsWith('.xml') && (await stat(path)).isFile()) {
      const xml = await readFile(path, 'utf8');
      if (!/<testsuite|<testsuites/.test(xml)) continue;
      const packageName = xml.match(/name="([^"]+)"/)?.[1] ?? entry.name;
      const tests = Number(xml.match(/tests="(\d+)"/)?.[1] ?? 0);
      const failures =
        Number(xml.match(/failures="(\d+)"/)?.[1] ?? 0) +
        Number(xml.match(/errors="(\d+)"/)?.[1] ?? 0);
      const errors = [...xml.matchAll(/<(?:failure|error)[^>]*>([\s\S]*?)<\/(?:failure|error)>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .slice(0, 5);
      output.push({ package: packageName, tests, failures, errors });
    }
  }
}

export async function readTestResults(workspace: string): Promise<TestResult[]> {
  const output: TestResult[] = [];
  await collectXml(join(workspace, 'build'), output);
  return output;
}

export { runCommand };
