import { readFile } from "node:fs/promises";

export interface LaunchAnalysis { path: string; format: "python" | "xml" | "yaml" | "unknown"; nodes: string[]; includes: string[]; arguments: string[]; remappings: string[]; warnings: string[]; }

export async function analyzeLaunch(path: string): Promise<LaunchAnalysis> {
  const source = await readFile(path, "utf8");
  const format = path.endsWith(".py") ? "python" : path.endsWith(".xml") ? "xml" : path.endsWith(".yaml") || path.endsWith(".yml") ? "yaml" : "unknown";
  const nodes = [...source.matchAll(/(?:Node|node|executable\s*:)\s*[^\n]*?(?:name\s*[=:]\s*["']?([^"' ,}\n]+)|executable\s*[:=]\s*["']?([^"' ,}\n]+))/g)].map((m) => m[1] ?? m[2]).filter(Boolean);
  const includes = [...source.matchAll(/(?:IncludeLaunchDescription|include|file)\s*[(:=]\s*["']([^"']+)/g)].map((m) => m[1]);
  const argumentsFound = [...source.matchAll(/(?:DeclareLaunchArgument|arg)\s*[(:=]\s*["']([^"']+)/g)].map((m) => m[1]);
  const remappings = [...source.matchAll(/(?:remappings?|from|to)\s*[=:]\s*["']([^"']+)/g)].map((m) => m[1]);
  const warnings: string[] = [];
  if (format === "python") warnings.push("Python launch files may contain dynamic code; this result is static text analysis and does not execute the file.");
  if (!nodes.length) warnings.push("No statically identifiable nodes were found.");
  return { path, format, nodes: [...new Set(nodes)], includes: [...new Set(includes)], arguments: [...new Set(argumentsFound)], remappings: [...new Set(remappings)], warnings };
}
