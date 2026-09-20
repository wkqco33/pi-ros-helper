import { runCommand } from '../core/runner.ts';

export interface EndpointQos {
  node?: string;
  reliability?: string;
  durability?: string;
  history?: string;
  depth?: number;
}
export type QosCompatibility = 'unknown' | 'compatible' | 'potential_mismatch';

/** Apply ROS 2 requested/offered rules for the reliability and durability policies. */
export function qosCompatibility(
  publisher?: string,
  subscriber?: string,
  policy: 'reliability' | 'durability' = 'reliability',
): QosCompatibility {
  if (!publisher || !subscriber) return 'unknown';
  const offered = publisher.toUpperCase();
  const requested = subscriber.toUpperCase();
  if (policy === 'reliability')
    return requested === 'RELIABLE' && offered === 'BEST_EFFORT'
      ? 'potential_mismatch'
      : 'compatible';
  return requested === 'TRANSIENT_LOCAL' && offered === 'VOLATILE'
    ? 'potential_mismatch'
    : 'compatible';
}

export interface QosReport {
  topic: string;
  type?: string;
  publishers: EndpointQos[];
  subscribers: EndpointQos[];
  compatibility: QosCompatibility;
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
  let compatibility: QosCompatibility =
    publishers.length && subscribers.length ? 'compatible' : 'unknown';
  let sawUnknown = false;
  for (const publisher of publishers)
    for (const subscriber of subscribers) {
      const reliability = qosCompatibility(
        publisher.reliability,
        subscriber.reliability,
        'reliability',
      );
      const durability = qosCompatibility(
        publisher.durability,
        subscriber.durability,
        'durability',
      );
      if (reliability === 'unknown' || durability === 'unknown') sawUnknown = true;
      if (reliability === 'potential_mismatch') {
        compatibility = 'potential_mismatch';
        notes.push(
          `Reliability is incompatible: publisher ${publisher.reliability}, subscriber ${subscriber.reliability}.`,
        );
      }
      if (durability === 'potential_mismatch') {
        compatibility = 'potential_mismatch';
        notes.push(
          `Durability is incompatible: publisher ${publisher.durability}, subscriber ${subscriber.durability}.`,
        );
      }
    }
  if (compatibility === 'compatible' && sawUnknown) compatibility = 'unknown';
  return {
    topic,
    type: run.stdout.match(/Type:\s*([^\n]+)/)?.[1]?.trim(),
    publishers,
    subscribers,
    compatibility,
    notes,
    raw: run.stdout,
  };
}
