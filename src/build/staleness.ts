import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

export interface StaleArtifacts {
  /** Newest source or build file that is newer than the compiled test binary. */
  newestSource: { path: string; mtimeMs: number };
  /** Newest compiled test binary found under `build/`. */
  newestBinary: { path: string; mtimeMs: number };
}

/** Directories that never contain the sources a test binary was built from. */
const IGNORED_DIRECTORIES = new Set(['.git', 'build', 'install', 'log', 'node_modules']);

/**
 * `colcon test` does not rebuild, so a test run can report success against a
 * binary that predates the current sources. Only code and build inputs count as
 * sources; docs or logs must not be able to invalidate an otherwise valid run.
 */
const SOURCE_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'cxx',
  'c++',
  'h',
  'hh',
  'hpp',
  'hxx',
  'h++',
  'ipp',
  'tpp',
  'py',
  'pyi',
  'msg',
  'srv',
  'action',
  'cmake',
  'proto',
]);

const BUILD_FILE_NAMES = new Set(['CMakeLists.txt', 'package.xml', 'setup.py', 'setup.cfg']);

function isSourceFile(name: string): boolean {
  if (BUILD_FILE_NAMES.has(name)) return true;
  const extension = extname(name).slice(1).toLowerCase();
  return extension.length > 0 && SOURCE_EXTENSIONS.has(extension);
}

function isTestBinary(name: string): boolean {
  return name.startsWith('test_') && !name.endsWith('.xml');
}

function isExecutable(mode: number): boolean {
  return (mode & 0o111) !== 0;
}

/** Iterative walk that never follows directory symlinks, so install trees cannot loop. */
async function walk(root: string, onFile: (path: string) => Promise<void>): Promise<void> {
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        stack.push(path);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        await onFile(path);
      }
    }
  }
}

async function newestSourceFile(
  workspaceRoot: string,
): Promise<{ path: string; mtimeMs: number } | undefined> {
  let newest: { path: string; mtimeMs: number } | undefined;
  await walk(workspaceRoot, async (path) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!isSourceFile(name)) return;
    const info = await stat(path);
    if (!newest || info.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: info.mtimeMs };
  });
  return newest;
}

async function newestTestBinary(
  workspaceRoot: string,
): Promise<{ path: string; mtimeMs: number } | undefined> {
  let newest: { path: string; mtimeMs: number } | undefined;
  const stack = [join(workspaceRoot, 'build')];
  while (stack.length > 0) {
    const directory = stack.pop() as string;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        // `test_results` holds fresh XML from the last run, not build output.
        if (entry.name === 'test_results') continue;
        stack.push(path);
      } else if ((entry.isFile() || entry.isSymbolicLink()) && isTestBinary(entry.name)) {
        const info = await stat(path);
        // `colcon test` writes per-test report files such as `test_*.txt` and
        // refreshes them on every run, so only compiled executables may count as
        // build output; otherwise staleness could never be observed.
        if (!isExecutable(info.mode)) continue;
        if (!newest || info.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: info.mtimeMs };
      }
    }
  }
  return newest;
}

/**
 * Report the sources that a stale compiled test binary predates, or `undefined`
 * when the artifacts are current or staleness cannot be determined (for example
 * a Python-only workspace with no compiled test binaries).
 */
export async function detectStaleTestArtifacts(
  workspaceRoot: string,
): Promise<StaleArtifacts | undefined> {
  const [newestBinary, newestSource] = await Promise.all([
    newestTestBinary(workspaceRoot),
    newestSourceFile(workspaceRoot),
  ]);
  if (!newestBinary || !newestSource) return undefined;
  if (newestSource.mtimeMs <= newestBinary.mtimeMs) return undefined;
  return { newestSource, newestBinary };
}
