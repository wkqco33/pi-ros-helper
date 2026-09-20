import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { findWorkspace } from '../environment/discovery.ts';

export interface PackageInfo {
  name: string;
  path: string;
  buildType: 'ament_cmake' | 'ament_python' | 'unknown';
  version?: string;
  hasPackageXml: boolean;
}

export interface WorkspaceInfo {
  root?: string;
  hasSrc: boolean;
  hasBuild: boolean;
  hasInstall: boolean;
  hasLog: boolean;
  packages: PackageInfo[];
  duplicateNames: string[];
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function tag(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`<${name}[^>]*>\\s*([^<]+)\\s*</${name}>`, 'i'));
  return match?.[1]?.trim();
}

async function scan(dir: string, packages: PackageInfo[]): Promise<void> {
  if (!(await isDir(dir))) return;
  const entries = await readdir(dir, { withFileTypes: true });
  const manifest = entries.find((entry) => entry.isFile() && entry.name === 'package.xml');
  if (manifest) {
    const path = join(dir, 'package.xml');
    const xml = await readFile(path, 'utf8');
    const hasCmake = entries.some((entry) => entry.name === 'CMakeLists.txt');
    const hasPython = entries.some((entry) =>
      ['setup.py', 'setup.cfg', 'pyproject.toml'].includes(entry.name),
    );
    packages.push({
      name: tag(xml, 'name') ?? relative(dir, path),
      path: dir,
      buildType: hasCmake ? 'ament_cmake' : hasPython ? 'ament_python' : 'unknown',
      version: tag(xml, 'version'),
      hasPackageXml: true,
    });
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.'))
      await scan(join(dir, entry.name), packages);
  }
}

export async function inspectWorkspace(cwd: string): Promise<WorkspaceInfo> {
  const root = await findWorkspace(cwd);
  if (!root)
    return {
      hasSrc: false,
      hasBuild: false,
      hasInstall: false,
      hasLog: false,
      packages: [],
      duplicateNames: [],
    };
  const packages: PackageInfo[] = [];
  await scan(join(root, 'src'), packages);
  const counts = new Map<string, number>();
  for (const pkg of packages) counts.set(pkg.name, (counts.get(pkg.name) ?? 0) + 1);
  return {
    root,
    hasSrc: await isDir(join(root, 'src')),
    hasBuild: await isDir(join(root, 'build')),
    hasInstall: await isDir(join(root, 'install')),
    hasLog: await isDir(join(root, 'log')),
    packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
    duplicateNames: [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  };
}
