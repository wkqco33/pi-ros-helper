/**
 * ROS's view of the shared completion-evidence gate.
 *
 * The gate lives in `pi-helper-core`; this module maps ROS's build step onto
 * the core's preparation stage so call sites keep their existing input shape.
 */
import {
  buildCompletionEvidence as coreBuildCompletionEvidence,
  type CompletionEvidence,
} from 'pi-helper-core';

export interface CompletionEvidenceInput {
  buildExecuted: boolean;
  buildOk: boolean;
  testExecuted: boolean;
  testOk: boolean;
  stale: boolean;
  changedPaths: string[];
}

export type { CompletionEvidence };

export function buildCompletionEvidence(input: CompletionEvidenceInput): CompletionEvidence {
  return coreBuildCompletionEvidence({
    preparation: {
      name: 'build',
      label: 'build',
      executed: input.buildExecuted,
      ok: input.buildOk,
    },
    testExecuted: input.testExecuted,
    testOk: input.testOk,
    stale: input.stale,
    changedPaths: input.changedPaths,
  });
}
