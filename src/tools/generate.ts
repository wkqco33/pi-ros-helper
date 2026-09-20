import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { failure, result } from '../core/result.ts';
import { scaffold } from '../generate/scaffold.ts';
import { packageScaffold } from '../generate/package.ts';
import { interfaceScaffold } from '../generate/interface.ts';
import { text } from './common.ts';

export function registerGenerateTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ros_interface_scaffold_preview',
    label: 'ROS Interface Preview',
    description:
      'Generate a ROS 2 msg, srv, or action interface preview and list required package build changes. Does not write files.',
    promptSnippet: 'Preview a ROS 2 interface definition',
    parameters: Type.Object({
      packageName: Type.String(),
      name: Type.String(),
      kind: Type.Union([Type.Literal('msg'), Type.Literal('srv'), Type.Literal('action')]),
      fields: Type.Array(Type.String(), { minItems: 1, maxItems: 100 }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const data = interfaceScaffold(params);
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Generated a ${params.kind} interface preview for ${params.name}.`,
            data,
            evidence: [
              { kind: 'interface_scaffold_preview', name: params.name, interfaceKind: params.kind },
            ],
            warnings: [
              {
                code: 'PREVIEW_ONLY',
                message: 'No interface files were written and package files were not modified.',
                severity: 'info' as const,
              },
            ],
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
            'INVALID_ARGUMENT',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_package_scaffold',
    label: 'ROS Package Scaffold',
    description:
      'Write a reviewed ROS 2 package scaffold to a selected directory. Requires explicit confirmation and never overwrites existing files.',
    promptSnippet: 'Create a confirmed ROS 2 package scaffold',
    parameters: Type.Object({
      packageName: Type.String(),
      nodeName: Type.String(),
      language: Type.Union([Type.Literal('python'), Type.Literal('cpp')]),
      destination: Type.String(),
      execute: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      try {
        const generated = packageScaffold(params);
        const root = resolve(ctx.cwd, params.destination);
        const files = Object.entries(generated.files).map(([path, content]) => ({
          path: resolve(root, path),
          content,
        }));
        const command = {
          executable: 'write-files',
          args: files.map((file) => file.path),
          cwd: root,
        };
        if (!params.execute)
          return text(
            result(ctx.cwd, started, {
              ok: true,
              summary: `Scaffold preview contains ${files.length} file(s); nothing was written.`,
              data: generated,
              evidence: [
                { kind: 'scaffold_write_preview', root, files: files.map((file) => file.path) },
              ],
              warnings: [
                {
                  code: 'PREVIEW_ONLY',
                  message: 'Set execute=true to write new files after confirmation.',
                  severity: 'warning' as const,
                },
              ],
              errors: [],
              suggestions: [],
              commands: [command],
            }),
          );
        if (
          !ctx.hasUI ||
          !(await ctx.ui.confirm(
            'Create ROS 2 package?',
            `${root}\n${files.length} new files will be created. Existing files are never overwritten.`,
          ))
        )
          return text(
            failure(
              ctx.cwd,
              started,
              'Scaffold creation cancelled or requires interactive confirmation.',
              'UNSAFE_OPERATION_DENIED',
              { commands: [command] },
            ),
          );
        await mkdir(root, { recursive: true });
        // Imported lazily: the pi host package reads `globSync` from `node:fs`,
        // which only exists on Node 22+. Loading it eagerly would make the whole
        // extension fail to load on Node 20.
        const { withFileMutationQueue } = await import('@earendil-works/pi-coding-agent');
        for (const file of files)
          await withFileMutationQueue(file.path, async () => {
            try {
              await writeFile(file.path, file.content, { flag: 'wx' });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                throw new Error(`Refusing to overwrite existing file: ${file.path}`);
              throw error;
            }
          });
        return text(
          result(ctx.cwd, started, {
            ok: true,
            summary: `Created ${files.length} new ROS 2 package file(s).`,
            data: { root, files: files.map((file) => file.path) },
            evidence: [{ kind: 'scaffold_created', root }],
            warnings: [],
            errors: [],
            suggestions: [],
            commands: [command],
          }),
        );
      } catch (error) {
        return text(
          failure(
            ctx.cwd,
            started,
            error instanceof Error ? error.message : String(error),
            'SCAFFOLD_FAILED',
          ),
        );
      }
    },
  });

  pi.registerTool({
    name: 'ros_package_scaffold_preview',
    label: 'ROS Package Preview',
    description:
      'Generate a complete minimal ROS 2 package layout in memory for review; no files are written.',
    promptSnippet: 'Preview a complete ROS 2 package scaffold',
    parameters: Type.Object({
      packageName: Type.String(),
      nodeName: Type.String(),
      language: Type.Union([Type.Literal('python'), Type.Literal('cpp')]),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = packageScaffold(params);
      return text(
        result(ctx.cwd, started, {
          ok: true,
          summary: `Generated a ${params.language} ROS 2 package preview.`,
          data,
          evidence: [{ kind: 'package_scaffold_preview', packageName: params.packageName }],
          warnings: [
            { code: 'PREVIEW_ONLY', message: 'No files were written.', severity: 'info' as const },
          ],
          errors: [],
          suggestions: [],
        }),
      );
    },
  });

  pi.registerTool({
    name: 'ros_scaffold_preview',
    label: 'ROS Scaffold Preview',
    description:
      'Generate a minimal ROS 2 node scaffold in memory for review; this tool does not write files.',
    promptSnippet: 'Preview a ROS 2 node scaffold',
    parameters: Type.Object({
      name: Type.String(),
      language: Type.Union([Type.Literal('python'), Type.Literal('cpp')]),
      kind: Type.Union([
        Type.Literal('publisher'),
        Type.Literal('subscriber'),
        Type.Literal('node'),
      ]),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const started = Date.now();
      const data = scaffold(params);
      return text(
        result(ctx.cwd, started, {
          ok: true,
          summary: `Generated an in-memory ${params.language} ${params.kind} scaffold.`,
          data,
          evidence: [{ kind: 'scaffold_preview', name: params.name }],
          warnings: [
            { code: 'PREVIEW_ONLY', message: 'No files were written.', severity: 'info' as const },
          ],
          errors: [],
          suggestions: [],
        }),
      );
    },
  });
}
