import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { detectEnvironment } from "../src/environment/discovery.ts";
import { inspectWorkspace } from "../src/workspace/inspect.ts";
import { analyzePackage } from "../src/package/analyze.ts";
import { failure, result } from "../src/core/result.ts";
import { runCommand } from "../src/core/runner.ts";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: value });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ros_environment",
    label: "ROS Environment",
    description: "Inspect ROS 2 installation, sourced environment, middleware, domain ID, and workspace discovery. Read-only.",
    promptSnippet: "Inspect the current ROS 2 environment and workspace",
    promptGuidelines: ["Use ros_environment before runtime ROS 2 diagnostics when the environment is unknown."],
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await detectEnvironment(ctx.cwd);
        return text(result(ctx.cwd, started, {
          ok: data.ros2Available,
          summary: data.ros2Available ? `ROS 2 environment detected${data.distro ? ` (${data.distro})` : ""}.` : "ROS 2 CLI is not available in the current environment.",
          data,
          evidence: [{ kind: "environment", ...data }],
          warnings: data.warnings.map((message) => ({ message, severity: "warning" as const })),
          errors: data.ros2Available ? [] : [{ code: "ROS_NOT_INSTALLED", message: "ros2 command is not available.", severity: "error" as const }],
          suggestions: data.ros2Available ? [] : [{ message: "Source /opt/ros/<distro>/setup.bash and retry.", confidence: "high" as const }],
        }));
      } catch (error) {
        return text(failure(ctx.cwd, started, error instanceof Error ? error.message : String(error), "INTERNAL_ERROR"));
      }
    },
  });

  pi.registerTool({
    name: "ros_workspace_inspect",
    label: "ROS Workspace",
    description: "Inspect a ROS 2 workspace layout and enumerate package.xml packages. Read-only.",
    promptSnippet: "Inspect ROS 2 workspace and package layout",
    promptGuidelines: ["Use ros_workspace_inspect to identify the active workspace before building."],
    parameters: Type.Object({ path: Type.Optional(Type.String({ description: "Workspace or subdirectory to inspect" })) }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await inspectWorkspace(params.path ?? ctx.cwd);
        const ok = Boolean(data.root);
        return text(result(ctx.cwd, started, {
          ok,
          summary: ok ? `Found ${data.packages.length} ROS 2 package(s) in ${data.root}.` : "No ROS 2 workspace was found.",
          data,
          evidence: data.root ? [{ kind: "workspace", root: data.root, packageCount: data.packages.length }] : [],
          warnings: data.duplicateNames.map((name) => ({ code: "DUPLICATE_PACKAGE", message: `Duplicate package name: ${name}`, severity: "warning" as const })),
          errors: ok ? [] : [{ code: "WORKSPACE_NOT_FOUND", message: "A workspace with a src directory was not found.", severity: "error" as const }],
          suggestions: ok ? [] : [{ message: "Run this tool from a workspace root or provide path explicitly.", confidence: "high" as const }],
        }));
      } catch (error) {
        return text(failure(ctx.cwd, started, error instanceof Error ? error.message : String(error), "INTERNAL_ERROR"));
      }
    },
  });

  pi.registerTool({
    name: "ros_package_analyze",
    label: "ROS Package Analyze",
    description: "Compare a ROS 2 package manifest with its build metadata and report likely dependency/configuration issues. Read-only.",
    promptSnippet: "Analyze ROS 2 package metadata and dependencies",
    promptGuidelines: ["Use ros_package_analyze before changing package.xml or build files."],
    parameters: Type.Object({ package: Type.Optional(Type.String({ description: "Package name or path" })) }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const workspace = await inspectWorkspace(ctx.cwd);
      const pkg = workspace.packages.find((candidate) => candidate.name === params.package || candidate.path === params.package) ?? (params.package ? undefined : workspace.packages[0]);
      if (!pkg) return text(failure(ctx.cwd, started, `Package not found: ${params.package ?? "(none)"}`, "PACKAGE_NOT_FOUND"));
      try {
        const data = await analyzePackage(pkg);
        return text(result(ctx.cwd, started, {
          ok: data.warnings.length === 0,
          summary: data.warnings.length === 0 ? `${pkg.name} has no detected manifest/build inconsistencies.` : `${pkg.name} has ${data.warnings.length} potential issue(s).`,
          data,
          evidence: data.warnings.map((warning) => ({ kind: warning.code, message: warning.message, path: warning.path })),
          warnings: data.warnings.map((warning) => ({ code: warning.code, message: warning.message, severity: "warning" as const, path: warning.path })),
          errors: [],
          suggestions: [{ message: "Review warnings against the package's intended build configuration before editing.", confidence: "medium" as const }],
        }));
      } catch (error) {
        return text(failure(ctx.cwd, started, error instanceof Error ? error.message : String(error), "OUTPUT_PARSE_FAILED"));
      }
    },
  });

  pi.registerTool({
    name: "ros_build",
    label: "ROS Build",
    description: "Preview or run colcon build for a ROS 2 workspace. Execution is opt-in; never runs unless execute is true.",
    promptSnippet: "Preview or run a safe ROS 2 colcon build",
    promptGuidelines: ["Use ros_build with execute false first to preview the command; building does not publish actuator commands."],
    parameters: Type.Object({
      packages: Type.Optional(Type.Array(Type.String())),
      symlinkInstall: Type.Optional(Type.Boolean()),
      buildType: Type.Optional(Type.Union([Type.Literal("Debug"), Type.Literal("Release"), Type.Literal("RelWithDebInfo")])),
      execute: Type.Optional(Type.Boolean()),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 3600 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      const workspace = await inspectWorkspace(ctx.cwd);
      if (!workspace.root) return text(failure(ctx.cwd, started, "No ROS 2 workspace was found.", "WORKSPACE_NOT_FOUND"));
      const args = ["build"];
      if (params.symlinkInstall) args.push("--symlink-install");
      if (params.buildType) args.push("--cmake-args", `-DCMAKE_BUILD_TYPE=${params.buildType}`);
      if (params.packages?.length) args.push("--packages-select", ...params.packages);
      const command = { executable: "colcon", args, cwd: workspace.root };
      if (!params.execute) return text(result(ctx.cwd, started, {
        ok: true,
        summary: "Build command preview generated; no command was executed.",
        evidence: [{ kind: "command_preview", ...command }],
        warnings: [], errors: [], suggestions: [{ message: "Set execute=true only after reviewing the command.", confidence: "high" }], commands: [command],
      }));
      const run = await runCommand(command.executable, command.args, { cwd: command.cwd, signal, timeoutMs: (params.timeoutSeconds ?? 900) * 1000 });
      const output = `${run.stdout}\n${run.stderr}`.trim();
      const failed = run.cancelled || run.timedOut || run.code !== 0;
      return text(result(ctx.cwd, started, {
        ok: !failed,
        summary: run.cancelled ? "Build cancelled." : run.timedOut ? "Build timed out." : failed ? "colcon build failed." : "colcon build completed successfully.",
        data: { exitCode: run.code, stdout: run.stdout, stderr: run.stderr },
        evidence: [{ kind: "build_output", output }], warnings: run.truncated ? [{ code: "OUTPUT_TRUNCATED", message: "Build output was truncated to protect context size.", severity: "warning" as const }] : [],
        errors: failed ? [{ code: run.timedOut ? "COMMAND_TIMEOUT" : run.cancelled ? "COMMAND_CANCELLED" : "BUILD_FAILED", message: "colcon build did not complete successfully.", severity: "error" as const }] : [], suggestions: [], commands: [command], truncated: run.truncated,
      }));
    },
  });

  pi.registerCommand("ros-status", {
    description: "Show a concise ROS 2 environment status",
    handler: async (_args, ctx) => {
      const environment = await detectEnvironment(ctx.cwd);
      const workspace = await inspectWorkspace(ctx.cwd);
      ctx.ui.notify(`ROS ${environment.distro ?? "unknown"} · ${workspace.root ?? "no workspace"} · ${environment.ros2Available ? "CLI ready" : "CLI unavailable"}`, environment.ros2Available ? "info" : "warning");
    },
  });
}
