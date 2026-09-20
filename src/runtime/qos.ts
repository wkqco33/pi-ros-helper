import { runCommand } from '../core/runner.ts';

export interface EndpointQos {
  node?: string;
  reliability?: string;
  durability?: string;
  history?: string;
  depth?: number;
}
export interface QosReport {
  topic: string;
  type?: string;
  publishers: EndpointQos[];
  subscribers: EndpointQos[];
  compatibility: 'unknown' | 'compatible' | 'potential_mismatch';
  notes: string[];
  raw: string;
}

function endpointBlocks(raw: string, heading: string): EndpointQos[] {
  const section = raw.split(heading)[1]?.split(/\n\s*(?:Publisher|Subscription) count:/)[0] ?? '';
  return section
    .split(/\n\s*Node name:/)
    .slice(1)
    .map((block) => ({
      node: block.match(/^\s*([^\n]+)\n\s*Node namespace:/)?.[1]?.trim(),
      reliability: block.match(/Reliability:\s*([^\n]+)/)?.[1]?.trim(),
      durability: block.match(/Durability:\s*([^\n]+)/)?.[1]?.trim(),
      history: block.match(/History:\s*([^\n]+)/)?.[1]?.trim(),
      depth: Number(block.match(/Depth:\s*(\d+)/)?.[1] ?? 0) || undefined,
    }));
}

export async function inspectQos(
  cwd: string,
  topic: string,
  signal?: AbortSignal,
): Promise<QosReport> {
  const run = await runCommand('ros2', ['topic', 'info', topic, '--verbose'], {
    cwd,
    signal,
    timeoutMs: 5000,
    maxBytes: 50_000,
  });
  if (run.code !== 0) throw new Error(run.stderr || `Unable to inspect topic ${topic}`);
  const publishers = endpointBlocks(run.stdout, 'Publisher count:');
  const subscribers = endpointBlocks(run.stdout, 'Subscription count:');
  const notes: string[] = [];
  for (const publisher of publishers)
    for (const subscriber of subscribers) {
      if (
        publisher.reliability &&
        subscriber.reliability &&
        publisher.reliability !== subscriber.reliability
      )
        notes.push(
          `Reliability differs: publisher ${publisher.reliability}, subscriber ${subscriber.reliability}.`,
        );
      if (
        publisher.durability &&
        subscriber.durability &&
        publisher.durability !== subscriber.durability
      )
        notes.push(
          `Durability differs: publisher ${publisher.durability}, subscriber ${subscriber.durability}.`,
        );
    }
  return {
    topic,
    type: run.stdout.match(/Type:\s*([^\n]+)/)?.[1]?.trim(),
    publishers,
    subscribers,
    compatibility: notes.length ? 'potential_mismatch' : 'compatible',
    notes,
    raw: run.stdout,
  };
}
