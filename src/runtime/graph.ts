import { runCommand } from '../core/runner.ts';

export interface GraphSnapshot {
  nodes: string[];
  topics: { name: string; types: string[] }[];
  services: string[];
  capturedAt: string;
  source: 'ros2-cli';
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function snapshotGraph(cwd: string, signal?: AbortSignal): Promise<GraphSnapshot> {
  const [nodes, topics, services] = await Promise.all([
    runCommand('ros2', ['node', 'list'], { cwd, signal, timeoutMs: 5000, maxBytes: 100_000 }),
    runCommand('ros2', ['topic', 'list', '-t'], {
      cwd,
      signal,
      timeoutMs: 5000,
      maxBytes: 100_000,
    }),
    runCommand('ros2', ['service', 'list'], { cwd, signal, timeoutMs: 5000, maxBytes: 100_000 }),
  ]);
  const parsedTopics = lines(topics.stdout).map((line) => {
    const match = line.match(/^(\S+)\s+\[([^\]]+)\]/);
    return { name: match?.[1] ?? line, types: match?.[2]?.split(/,\s*/) ?? [] };
  });
  if (nodes.code !== 0 || topics.code !== 0 || services.code !== 0)
    throw new Error(
      topics.stderr || nodes.stderr || services.stderr || 'ROS graph snapshot is incomplete',
    );
  return {
    nodes: lines(nodes.stdout),
    topics: parsedTopics,
    services: lines(services.stdout),
    capturedAt: new Date().toISOString(),
    source: 'ros2-cli',
  };
}

export function diffGraphs(previous: GraphSnapshot, current: GraphSnapshot) {
  const added = (a: string[], b: string[]) => a.filter((item) => !b.includes(item));
  const removed = (a: string[], b: string[]) => b.filter((item) => !a.includes(item));
  const prevTopics = previous.topics.map((topic) => topic.name);
  const currentTopics = current.topics.map((topic) => topic.name);
  return {
    nodes: {
      added: added(current.nodes, previous.nodes),
      removed: removed(current.nodes, previous.nodes),
    },
    topics: {
      added: added(currentTopics, prevTopics),
      removed: removed(currentTopics, prevTopics),
    },
    services: {
      added: added(current.services, previous.services),
      removed: removed(current.services, previous.services),
    },
  };
}
