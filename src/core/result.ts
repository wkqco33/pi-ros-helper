export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  code?: string;
  message: string;
  severity: DiagnosticSeverity;
  path?: string;
  line?: number;
}

export interface Evidence {
  kind: string;
  message?: string;
  [key: string]: unknown;
}

export interface Suggestion {
  message: string;
  confidence?: 'low' | 'medium' | 'high';
  command?: string;
}

export interface CommandPreview {
  executable: string;
  args: string[];
  cwd?: string;
}

export interface ToolMetadata {
  toolVersion: string;
  cwd: string;
  durationMs: number;
  truncated: boolean;
  rosDistro?: string;
}

export interface RosToolResult<T = unknown> {
  ok: boolean;
  summary: string;
  data?: T;
  evidence: Evidence[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  suggestions: Suggestion[];
  commands?: CommandPreview[];
  metadata: ToolMetadata;
}

export function result<T>(
  cwd: string,
  startedAt: number,
  value: Omit<RosToolResult<T>, 'metadata'> & { truncated?: boolean; rosDistro?: string },
): RosToolResult<T> {
  return {
    ...value,
    metadata: {
      toolVersion: '0.1.0',
      cwd,
      durationMs: Date.now() - startedAt,
      truncated: value.truncated ?? false,
      rosDistro: value.rosDistro,
    },
  };
}

export function failure(
  cwd: string,
  startedAt: number,
  message: string,
  code: string,
  details?: Partial<RosToolResult>,
): RosToolResult {
  return result(cwd, startedAt, {
    ok: false,
    summary: message,
    evidence: [],
    warnings: [],
    errors: [{ code, message, severity: 'error' }],
    suggestions: [],
    ...details,
  });
}
