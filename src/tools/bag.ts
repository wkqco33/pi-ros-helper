import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { join } from 'node:path';
import { failure, result } from '../core/result.ts';
import { inspectBag } from '../bag/info.ts';
import { queryBag } from '../bag/query.ts';
import { text } from './common.ts';

export function registerBagTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_bag_query',
    label: 'ROS Bag Query',
    description:
      'Read bounded rosbag2 samples using rosbag2_py and report timestamps, serialized sizes, and gaps without replaying or modifying the bag.',
    promptSnippet: 'Query bounded rosbag2 samples',
    parameters: Type.Object({
      bagPath: Type.String(),
      topic: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
      gapNanoseconds: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await queryBag(ctx.cwd, join(ctx.cwd, 'helpers/bag_query.py'), params, signal);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Read bounded bag samples${params.topic ? ` for ${params.topic}` : ''}.`,
            data,
            evidence: [{ kind: 'bag_query', bagPath: params.bagPath, topic: params.topic }],
            warnings: [],
            errors: [],
            suggestions: [],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'COMMAND_FAILED',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_bag_inspect',
    label: 'ROS Bag Inspect',
    description:
      'Read bounded rosbag2 metadata using ros2 bag info; does not replay or modify the bag.',
    promptSnippet: 'Inspect rosbag2 metadata and topics',
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params, signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = await inspectBag(ctx.cwd, params.path, signal);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Bag contains ${data.topics.length} topic metadata record(s).`,
            data,
            evidence: [{ kind: 'bag_metadata', path: params.path }],
            warnings: [],
            errors: [],
            suggestions: [],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'COMMAND_FAILED',
          ),
        );
      }
    },
  });
}
