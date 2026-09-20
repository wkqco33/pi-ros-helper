import type { LaunchAnalysis } from './analyze.ts';

export interface LaunchValidation {
  ok: boolean;
  missingFiles: string[];
  warnings: string[];
}

export function validateLaunch(
  analysis: LaunchAnalysis,
  existingFiles: string[],
): LaunchValidation {
  const existing = new Set(existingFiles);
  const missingFiles = analysis.includes
    .map(
      (include) =>
        new URL(include, `file://${analysis.path.substring(0, analysis.path.lastIndexOf('/') + 1)}`)
          .pathname,
    )
    .filter((path) => !existing.has(path));
  const warnings = [...analysis.warnings];
  if (!analysis.nodes.length && !warnings.some((warning) => /node/i.test(warning)))
    warnings.push('No statically identifiable nodes were found.');
  if (analysis.format === 'unknown') warnings.push('Launch file format is unknown.');
  return {
    ok:
      missingFiles.length === 0 &&
      warnings.every((warning) => !/no statically identifiable|unknown/i.test(warning)),
    missingFiles,
    warnings,
  };
}
