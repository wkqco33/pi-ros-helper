import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { detectStaleTestArtifacts } from '../src/build/staleness.ts';

const EARLY = 1_600_000_000;
const LATE = 1_700_000_000;

interface Entry {
  mtime: number;
  executable?: boolean;
}

/**
 * `colcon test` rewrites `colcon_test.rc`, the result XML, and per-test report
 * files such as `ament_cmake_gtest/test_*.txt` on every run. Those files are
 * always newer than the binary but are not build output, so a naive "newest
 * test_* file under build/" scan silently never detects staleness.
 */
async function fixture(files: Record<string, number | Entry>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'piros-stale-'));
  for (const [relative, value] of Object.entries(files)) {
    const entry: Entry = typeof value === 'number' ? { mtime: value } : value;
    const path = join(dir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'x', entry.executable ? { mode: 0o755 } : undefined);
    await utimes(path, entry.mtime, entry.mtime);
  }
  return dir;
}

async function withFixture(
  files: Record<string, number | Entry>,
  body: (dir: string) => Promise<void>,
) {
  const dir = await fixture(files);
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('staleness is reported when a test source is newer than the test binary', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo': { mtime: EARLY, executable: true },
      'build/demo_pkg/colcon_test.rc': LATE,
      'build/demo_pkg/colcon_command_prefix_test.sh': LATE,
      'build/demo_pkg/test_results/demo_pkg/test_demo.gtest.xml': LATE,
      'test/unit/test_demo.cpp': LATE,
    },
    async (dir) => {
      const result = await detectStaleTestArtifacts(dir);
      assert.ok(result, 'expected staleness to be detected');
      assert.match(result.newestSource.path, /test_demo\.cpp$/);
      assert.match(result.newestBinary.path, /test_demo$/);
    },
  );
});

test('fresh test-run report files do not hide a stale binary', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo': { mtime: EARLY, executable: true },
      'build/demo_pkg/ament_cmake_gtest/test_demo.txt': LATE,
      'build/demo_pkg/Testing/Temporary/LastTest.log': LATE,
      'test/unit/test_demo.cpp': LATE,
    },
    async (dir) => {
      const result = await detectStaleTestArtifacts(dir);
      assert.ok(result, 'a per-test report must not be mistaken for the compiled binary');
      assert.match(result.newestBinary.path, /test_demo$/);
    },
  );
});

test('non executable test_* files are not treated as binaries', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo.txt': LATE,
      'test/unit/test_demo.cpp': LATE,
    },
    async (dir) => {
      assert.equal(await detectStaleTestArtifacts(dir), undefined);
    },
  );
});

test('a freshly built test binary is not reported as stale', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo': { mtime: LATE, executable: true },
      'test/unit/test_demo.cpp': EARLY,
    },
    async (dir) => {
      assert.equal(await detectStaleTestArtifacts(dir), undefined);
    },
  );
});

test('workspaces without compiled tests are not reported as stale', async () => {
  await withFixture({ 'test/test_demo.py': LATE }, async (dir) => {
    assert.equal(await detectStaleTestArtifacts(dir), undefined);
  });
});

test('non-code changes do not count as source changes', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo': { mtime: EARLY, executable: true },
      'docs/guide.md': LATE,
      'build/demo_pkg/notes.log': LATE,
    },
    async (dir) => {
      assert.equal(await detectStaleTestArtifacts(dir), undefined);
    },
  );
});

test('build file changes count as source changes', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo': { mtime: EARLY, executable: true },
      'CMakeLists.txt': LATE,
    },
    async (dir) => {
      const result = await detectStaleTestArtifacts(dir);
      assert.ok(result, 'expected a CMakeLists.txt edit to invalidate test artifacts');
      assert.match(result.newestSource.path, /CMakeLists\.txt$/);
    },
  );
});

test('source changes under build and install trees are ignored', async () => {
  await withFixture(
    {
      'build/demo_pkg/test_demo': { mtime: EARLY, executable: true },
      'build/demo_pkg/generated/messages.cpp': LATE,
      'install/demo_pkg/share/messages.cpp': LATE,
    },
    async (dir) => {
      assert.equal(await detectStaleTestArtifacts(dir), undefined);
    },
  );
});
