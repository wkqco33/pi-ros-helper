export interface CompletionEvidence {
  ok: boolean;
  blockers: string[];
  changedPaths: string[];
}

export function buildCompletionEvidence(input: {
  buildExecuted: boolean;
  buildOk: boolean;
  testExecuted: boolean;
  testOk: boolean;
  stale: boolean;
  changedPaths: string[];
}): CompletionEvidence {
  const blockers: string[] = [];
  if (!input.buildExecuted) blockers.push('Build was not executed.');
  else if (!input.buildOk) blockers.push('Build did not pass.');
  if (!input.testExecuted) blockers.push('Test was not executed.');
  else if (!input.testOk) blockers.push('Tests did not pass.');
  if (input.stale) blockers.push('Stale test artifacts were detected.');
  return { ok: blockers.length === 0, blockers, changedPaths: input.changedPaths };
}
