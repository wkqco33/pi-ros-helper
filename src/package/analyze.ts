import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PackageInfo } from "../workspace/inspect.ts";

export interface PackageAnalysis {
  package: PackageInfo;
  declaredDependencies: string[];
  buildReferences: string[];
  warnings: { code: string; message: string; path?: string }[];
}

function tags(xml: string, names: string[]): string[] {
  const values: string[] = [];
  for (const name of names) {
    for (const match of xml.matchAll(new RegExp(`<${name}[^>]*>\\s*([^<]+)\\s*</${name}>`, "gi"))) {
      if (match[1]?.trim()) values.push(match[1].trim());
    }
  }
  return [...new Set(values)];
}

export async function analyzePackage(pkg: PackageInfo): Promise<PackageAnalysis> {
  const xmlPath = join(pkg.path, "package.xml");
  const xml = await readFile(xmlPath, "utf8");
  const declaredDependencies = tags(xml, ["depend", "build_depend", "buildtool_depend", "exec_depend", "test_depend"]);
  const files = await Promise.all(["CMakeLists.txt", "setup.py", "setup.cfg", "pyproject.toml"].map(async (name) => {
    try { return await readFile(join(pkg.path, name), "utf8"); } catch { return ""; }
  }));
  const buildText = files.join("\n");
  const buildReferences = [...new Set([...buildText.matchAll(/find_package\s*\(\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]).filter((value): value is string => Boolean(value)))];
  const warnings: PackageAnalysis["warnings"] = [];
  for (const dependency of buildReferences) {
    if (!declaredDependencies.includes(dependency)) warnings.push({ code: "MISSING_MANIFEST_DEPENDENCY", message: `${dependency} is referenced by build files but not declared in package.xml`, path: xmlPath });
  }
  if (pkg.buildType === "ament_python" && !buildText.includes("entry_points") && !buildText.includes("setup(")) {
    warnings.push({ code: "PYTHON_SETUP_UNCLEAR", message: "Python package has no recognizable setup declaration.", path: pkg.path });
  }
  return { package: pkg, declaredDependencies, buildReferences, warnings };
}
