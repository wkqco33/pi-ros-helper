import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../core/runner.ts';

export type ColconFailureKind =
  'compiler' | 'linker' | 'cmake' | 'rosidl' | 'python' | 'test' | 'unknown';

export interface ColconFailure {
  package?: string;
  kind: ColconFailureKind;
  message: string;
  line?: string;
}

export interface BuildWarning {
  /** Source file that produced the warning, when the line carries a location. */
  file?: string;
  message: string;
  flag?: string;
  count: number;
}

export interface TestCaseFailure {
  suite: string;
  name: string;
  file?: string;
  line?: number;
  message: string;
}

export interface TestResult {
  /** Test binary or result file the suite came from, e.g. `test_rate_limiter`. */
  package: string;
  /** JUnit `testsuite` name, e.g. `RateLimiterTest`. */
  suite: string;
  tests: number;
  failures: number;
  skipped: number;
  /** Structured failed cases so the caller can name the failing assertion. */
  cases: TestCaseFailure[];
  /** Failure messages retained for backward compatibility. */
  errors: string[];
}

export interface TestTotals {
  suites: number;
  tests: number;
  failures: number;
  skipped: number;
  failedCases: TestCaseFailure[];
}

/**
 * A C/C++ source location, including generated `.pb.cc` and `.hxx` outputs that
 * the previous `.cpp|.hpp|.cxx|.h` alternation silently skipped.
 */
const SOURCE_EXTENSION = /\.(?:c|cc|cpp|cxx|c\+\+|h|hh|hpp|hxx|h\+\+|ipp|tpp)\b/i;
const DIAGNOSTIC_LOCATION = /:\d+(?::\d+)?:\s*(?:fatal\s+)?error:/i;
const WARNING_LINE = /^(.*?):(\d+):(\d+):\s*warning:\s*(.*)$/;
const BARE_WARNING_LINE = /^\s*warning:\s*(.*)$/;

export function classifyColconOutput(output: string): ColconFailure[] {
  const failures: ColconFailure[] = [];
  const seen = new Set<string>();
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let kind: ColconFailureKind | undefined;
    if (
      /fatal error:|\berror:/.test(line) &&
      (SOURCE_EXTENSION.test(line) || DIAGNOSTIC_LOCATION.test(line))
    )
      kind = 'compiler';
    else if (/undefined reference|ld returned|linker command failed/i.test(line)) kind = 'linker';
    else if (/CMake Error|cmake.*error/i.test(line)) kind = 'cmake';
    else if (/rosidl|interface generation|generate.*message/i.test(line)) kind = 'rosidl';
    else if (/ModuleNotFoundError|setup.py|pip.*error|Python/i.test(line)) kind = 'python';
    else if (/FAILED|test.*failed|pytest.*failed/i.test(line)) kind = 'test';
    if (!kind || seen.has(line)) continue;
    seen.add(line);
    failures.push({ kind, message: line, line });
  }
  const priority: Record<ColconFailureKind, number> = {
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

/**
 * Collapse a compiler warning stream into the top offending sites so a build with
 * hundreds of repeated warnings does not have to be read line by line.
 */
export function summarizeBuildWarnings(output: string, limit = 10): BuildWarning[] {
  const grouped = new Map<string, BuildWarning>();
  for (const raw of output.split(/\r?\n/)) {
    const locate = WARNING_LINE.exec(raw);
    const bare = locate ? undefined : BARE_WARNING_LINE.exec(raw);
    if (!locate && !bare) continue;
    const file = locate ? locate[1] : undefined;
    const rawMessage = (locate ? locate[4] : (bare?.[1] ?? '')).trim();
    if (!rawMessage) continue;
    const flag = /\[(-W[\w=+.-]+)\]/.exec(rawMessage)?.[1];
    const message = rawMessage.replace(/\s*\[-W[\w=+.-]+\]\s*$/, '').trim();
    const key = `${file ?? ''}\u0000${message}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { file, message, flag, count: 1 });
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) attributes[match[1]] = decodeXml(match[2]);
  return attributes;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_full, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_full, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanText(value: string): string {
  return decodeXml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `test_rate_limiter.gtest.xml` -> `test_rate_limiter`. */
function binaryName(fileName: string): string {
  return fileName.replace(/\.[^.]*\.xml$/i, '').replace(/\.xml$/i, '');
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? '0');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseFailureCase(
  suiteName: string,
  caseAttrs: Record<string, string>,
  inner: string,
): TestCaseFailure | undefined {
  const issue = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(inner);
  if (!issue) return undefined;
  const issueAttrs = parseAttributes(issue[2] ?? '');
  const detail = cleanText(issue[3] ?? '');
  const message =
    detail ||
    issueAttrs.message ||
    `${caseAttrs.classname ?? suiteName}.${caseAttrs.name ?? 'unknown'} failed`;
  const LOCATION = /([^\s:]+\.\w+):(\d+)\b/;
  const located = LOCATION.exec(detail) ?? LOCATION.exec(issueAttrs.message ?? '');
  const line = located ? Number(located[2]) : caseAttrs.line ? Number(caseAttrs.line) : undefined;
  return {
    suite: suiteName,
    name: caseAttrs.name ?? '(unnamed)',
    file: located?.[1] ?? caseAttrs.file,
    line: line && Number.isFinite(line) ? line : undefined,
    message,
  };
}

function parseTestCaseFailures(suiteName: string, body: string): TestCaseFailure[] {
  const cases: TestCaseFailure[] = [];
  const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) {
    const parsed = parseFailureCase(suiteName, parseAttributes(match[1]), match[2] ?? '');
    if (parsed) cases.push(parsed);
  }
  return cases;
}

function parseJUnit(xml: string, fallbackName: string): TestResult[] {
  const results: TestResult[] = [];
  const pattern = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const attrs = parseAttributes(match[1]);
    const suite = attrs.name ?? fallbackName;
    const cases = parseTestCaseFailures(suite, match[2] ?? '');
    const declared = toNumber(attrs.failures) + toNumber(attrs.errors);
    results.push({
      package: fallbackName,
      suite,
      tests: toNumber(attrs.tests),
      failures: Math.max(cases.length, declared),
      skipped: toNumber(attrs.skipped),
      cases,
      errors: cases.map((item) => item.message).slice(0, 5),
    });
  }
  if (results.length === 0) {
    // Some reporters emit only the outer <testsuites> aggregate.
    const aggregate = /<testsuites\b([^>]*)>/.exec(xml);
    if (aggregate) {
      const attrs = parseAttributes(aggregate[1]);
      const failures = toNumber(attrs.failures) + toNumber(attrs.errors);
      results.push({
        package: fallbackName,
        suite: attrs.name ?? fallbackName,
        tests: toNumber(attrs.tests),
        failures,
        skipped: toNumber(attrs.skipped),
        cases: [],
        errors: [],
      });
    }
  }
  return results;
}

export function summarizeTestResults(results: TestResult[]): TestTotals {
  return results.reduce<TestTotals>(
    (totals, item) => {
      totals.suites += 1;
      totals.tests += item.tests;
      totals.failures += item.failures;
      totals.skipped += item.skipped;
      totals.failedCases.push(...item.cases);
      return totals;
    },
    { suites: 0, tests: 0, failures: 0, skipped: 0, failedCases: [] },
  );
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
      output.push(...parseJUnit(xml, binaryName(entry.name)));
    }
  }
}

export async function readTestResults(workspace: string): Promise<TestResult[]> {
  const output: TestResult[] = [];
  await collectXml(join(workspace, 'build'), output);
  return output;
}

export { runCommand };
