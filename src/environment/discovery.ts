import { access, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { runCommand } from "../core/runner.ts";

export interface RosEnvironment {
  distro?: string;
  rmwImplementation?: string;
  domainId?: string;
  localhostOnly?: string;
  setupFiles: string[];
  workspace?: string;
  ros2Available: boolean;
  rclpyAvailable: boolean;
  warnings: string[];
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function findWorkspace(start: string): Promise<string | undefined> {
  let current = resolve(start);
  while (true) {
    const src = join(current, "src");
    if (await exists(src) && (await stat(src)).isDirectory()) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function detectEnvironment(cwd: string): Promise<RosEnvironment> {
  const env = process.env;
  const setupFiles: string[] = [];
  if (env.ROS_DISTRO) {
    const distroSetup = `/opt/ros/${env.ROS_DISTRO}/setup.bash`;
    if (await exists(distroSetup)) setupFiles.push(distroSetup);
  }
  if (env.AMENT_PREFIX_PATH) {
    for (const prefix of env.AMENT_PREFIX_PATH.split(":")) {
      const candidate = join(prefix, "setup.bash");
      if (await exists(candidate)) setupFiles.push(candidate);
    }
  }
  const workspace = await findWorkspace(cwd);
  if (workspace) {
    const candidate = join(workspace, "install", "setup.bash");
    if (await exists(candidate)) setupFiles.push(candidate);
  }
  const ros2 = await runCommand("ros2", ["--help"], { cwd, timeoutMs: 3000, maxBytes: 2048 });
  const python = await runCommand("python3", ["-c", "import rclpy"], { cwd, timeoutMs: 3000, maxBytes: 2048 });
  const warnings: string[] = [];
  if (!env.ROS_DISTRO) warnings.push("ROS_DISTRO is not set; source a ROS 2 setup file before runtime operations.");
  if (!workspace) warnings.push("No workspace with a src directory was found from the current directory.");
  return {
    distro: env.ROS_DISTRO,
    rmwImplementation: env.RMW_IMPLEMENTATION,
    domainId: env.ROS_DOMAIN_ID,
    localhostOnly: env.RMW_LOCALHOST_ONLY,
    setupFiles: [...new Set(setupFiles)],
    workspace,
    ros2Available: ros2.code === 0,
    rclpyAvailable: python.code === 0,
    warnings,
  };
}

export async function listWorkspaceEntries(workspace: string): Promise<string[]> {
  return readdir(join(workspace, "src"));
}
