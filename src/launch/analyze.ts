import { readFile } from 'node:fs/promises';

export interface LaunchAnalysis {
  path: string;
  format: 'python' | 'xml' | 'yaml' | 'unknown';
  nodes: string[];
  includes: string[];
  arguments: string[];
  remappings: string[];
  warnings: string[];
}

function detectFormat(path: string): LaunchAnalysis['format'] {
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.xml')) return 'xml';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml';
  return 'unknown';
}

/** Find the closing parenthesis of the call that starts at `openIndex`. */
function findClosingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length - 1;
}

function keywordArgument(text: string, key: string): string | undefined {
  const match = new RegExp(`\\b${key}\\s*[=:]\\s*(?:["']([^"']+)["']|([^\\s"',(){}]+))`).exec(text);
  return match?.[1] ?? match?.[2];
}

function attributeValue(attributes: string, key: string): string | undefined {
  return new RegExp(`\\b${key}\\s*=\\s*["']([^"']+)["']`).exec(attributes)?.[1];
}

/** Node actions may span multiple lines, so parse the full call argument list. */
function pythonNodes(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/\b(?:Node|LifecycleNode)\s*\(/g)) {
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    const args = source.slice(openIndex + 1, findClosingParen(source, openIndex));
    const name = keywordArgument(args, 'name') ?? keywordArgument(args, 'executable');
    if (name) names.push(name);
  }
  return names;
}

function xmlNodes(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/<(?:node|lifecycle_node)\b([^>]*)>/gi)) {
    const attributes = match[1] ?? '';
    const name =
      attributeValue(attributes, 'name') ??
      attributeValue(attributes, 'exec') ??
      attributeValue(attributes, 'type');
    if (name) names.push(name);
  }
  return names;
}

function yamlNodes(source: string): string[] {
  const names: string[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/(?:^|[\s-])node\s*:/.test(lines[index] ?? '')) continue;
    const block = lines.slice(index, index + 12).join('\n');
    const name =
      keywordArgument(block, 'name') ??
      keywordArgument(block, 'executable') ??
      attributeValue(block, 'exec');
    if (name) names.push(name);
  }
  return names;
}

export async function analyzeLaunch(path: string): Promise<LaunchAnalysis> {
  const source = await readFile(path, 'utf8');
  const format = detectFormat(path);
  const nodes =
    format === 'python'
      ? pythonNodes(source)
      : format === 'xml'
        ? xmlNodes(source)
        : format === 'yaml'
          ? yamlNodes(source)
          : [...pythonNodes(source), ...xmlNodes(source), ...yamlNodes(source)];
  const includes = [
    ...source.matchAll(/(?:IncludeLaunchDescription|include|file)\s*[(:=]\s*["']([^"']+)/g),
  ].map((m) => m[1]);
  const argumentsFound = [
    ...source.matchAll(/(?:DeclareLaunchArgument|arg)\s*[(:=]\s*["']([^"']+)/g),
  ].map((m) => m[1]);
  const remappings = [...source.matchAll(/(?:remappings?|from|to)\s*[=:]\s*["']([^"']+)/g)].map(
    (m) => m[1],
  );
  const warnings: string[] = [];
  if (format === 'python')
    warnings.push(
      'Python launch files may contain dynamic code; this result is static text analysis and does not execute the file.',
    );
  if (!nodes.length) warnings.push('No statically identifiable nodes were found.');
  return {
    path,
    format,
    nodes: [...new Set(nodes)],
    includes: [...new Set(includes)],
    arguments: [...new Set(argumentsFound)],
    remappings: [...new Set(remappings)],
    warnings,
  };
}
